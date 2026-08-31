// Security Passport — verification server functions.
//
// Three audiences, three completely separate reads, no shared payload:
//
//   * the HOLDER sees their own requests and what they were told;
//   * the CQRITYJOB VERIFIER sees a queue assembled by
//     `sp_verifier_queue()`, because a verifier has no blanket read over
//     Passport content and must not gain one;
//   * the EMPLOYER REPRESENTATIVE sees `sp_employer_attestation_queue()`,
//     which returns one employment period and a name — and cannot be made
//     to return anything else, whatever this file asks for.
//
// The decision itself goes through `sp_verifier_decide` in every case. That
// function is the only path to VERIFIED in the entire system: it refuses a
// holder deciding on their own request, refuses a non-verifier on a
// CQrityjob review, refuses a representative of the wrong employer, and
// writes attribution — who, when, by what method, valid until when —
// atomically with the trust change.
//
// Nothing in this file can produce a verified claim on its own, and nothing
// here decides who may verify. Both live in the database.

import { createServerFn } from "@tanstack/react-start";
import { isCalendarDate } from "./dates";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyDecisionError, DECISION_ERROR_PREFIX } from "./decision-errors";
import { orNull } from "./rpc";
import type { VerificationMethod } from "./types";

export type VerificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "clarification_requested"
  | "withdrawn";

/** Re-exported from the domain spine, where it now lives beside
 *  `AssertionLevel` and `LifecycleState`: the method is part of the trust
 *  model, not of this transport module, and `Claim` needs it too. */
export type { VerificationMethod };

export interface MyVerificationRequest {
  readonly id: string;
  readonly claimId: string | null;
  readonly periodId: string | null;
  readonly kind: "cqrityjob_review" | "employer_attestation";
  readonly status: VerificationStatus;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  readonly method: VerificationMethod | null;
  /** What the holder was told. Never the reviewer's internal note. */
  readonly holderMessage: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly targetEmployerId: string | null;
}

export interface VerificationDecisionRecord {
  readonly id: string;
  readonly requestId: string;
  readonly decision: "approved" | "rejected" | "clarification_requested" | "revoked";
  readonly organisation: string | null;
  readonly method: string | null;
  readonly decidedAt: string;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
}

/* ------------------------------------------------------------------ */
/* Holder                                                              */
/* ------------------------------------------------------------------ */

type RequestRow = {
  id: string;
  claim_id: string | null;
  period_id: string | null;
  request_kind: string;
  status: string;
  submitted_at: string;
  decided_at: string | null;
  verification_method: string | null;
  holder_message: string | null;
  valid_from: string | null;
  valid_until: string | null;
  target_employer_id: string | null;
};

export const listMyVerificationRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      readonly requests: readonly MyVerificationRequest[];
      readonly decisions: readonly VerificationDecisionRecord[];
    }> => {
      const { supabase, userId } = context;
      const db = supabase;

      // `decision_note` is deliberately absent from this select. It is the
      // reviewer's internal reasoning; the holder is told `holder_message`.
      // Two fields exist precisely so one cannot leak as the other.
      const [reqRes, decRes] = await Promise.all([
        db
          .from("sp_verification_requests")
          .select(
            "id, claim_id, period_id, request_kind, status, submitted_at, decided_at, verification_method, holder_message, valid_from, valid_until, target_employer_id",
          )
          .eq("holder_user_id", userId)
          .order("submitted_at", { ascending: false }),
        db
          .from("sp_verification_decisions")
          .select(
            "id, request_id, decision, decider_organisation, verification_method, decided_at, valid_from, valid_until",
          )
          .eq("holder_user_id", userId)
          .order("decided_at", { ascending: false }),
      ]);

      if (reqRes.error) throw new Error(reqRes.error.message);
      // ── THE DECISIONS READ IS NOT OPTIONAL ────────────────────────
      //
      // This line used to be absent. The requests query was checked and the
      // decisions query was not, so a refused or failed decisions read
      // returned `{ requests, decisions: [] }` — a structurally valid,
      // entirely believable payload in which every request had been decided
      // and no decision existed.
      //
      // What the holder saw was a credential whose status said "Godkänd"
      // above an attribution block that never rendered, because the panel
      // draws "verified by whom, how, when, until when" from the DECISION
      // record and had none. A verified credential that cannot say who
      // verified it is precisely the unfalsifiable claim the two-field
      // design exists to prevent, and it was being produced by a query
      // failure nobody was told about.
      //
      // Both halves are one answer about one credential's history. Neither
      // is meaningful without the other, so neither is returned without the
      // other.
      if (decRes.error) throw new Error(decRes.error.message);

      const requests = ((reqRes.data ?? []) as RequestRow[]).map((r) => ({
        id: r.id,
        claimId: r.claim_id,
        periodId: r.period_id,
        kind: r.request_kind as MyVerificationRequest["kind"],
        status: r.status as VerificationStatus,
        submittedAt: r.submitted_at,
        decidedAt: r.decided_at,
        method: r.verification_method as VerificationMethod | null,
        holderMessage: r.holder_message,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
        targetEmployerId: r.target_employer_id,
      }));

      const decisions = (
        (decRes.data ?? []) as Array<{
          id: string;
          request_id: string;
          decision: string;
          decider_organisation: string | null;
          verification_method: string | null;
          decided_at: string;
          valid_from: string | null;
          valid_until: string | null;
        }>
      ).map((d) => ({
        id: d.id,
        requestId: d.request_id,
        decision: d.decision as VerificationDecisionRecord["decision"],
        organisation: d.decider_organisation,
        method: d.verification_method,
        decidedAt: d.decided_at,
        validFrom: d.valid_from,
        validUntil: d.valid_until,
      }));

      return { requests, decisions };
    },
  );

const submitInput = z
  .object({
    claimId: z.string().uuid().nullable(),
    periodId: z.string().uuid().nullable(),
    kind: z.enum(["cqrityjob_review", "employer_attestation"]),
    employerId: z.string().uuid().nullable(),
  })
  // An employer confirms employment they were party to. They have no standing
  // to verify a training credential, a licence or an authorisation, and least
  // of all a regulated qualification such as VU1 — there the state, not a
  // company, is the authority. Employer attestation is therefore valid only
  // against an employment period.
  //
  // `claimId` must be ABSENT, not merely unused: a request naming both would
  // satisfy "there is a period", and `sp_verifier_decide` reads `claim_id`
  // first when it applies an approval, so the credential is what would have
  // been verified.
  //
  // This is not the control. `sp_submit_for_verification` refuses the same
  // shape, and `sp_verification_requests` refuses the row itself, which is
  // what a hand-written PostgREST call runs into. This layer exists so the
  // refusal arrives here, named, instead of as a constraint violation from
  // inside the database.
  .refine((v) => v.kind !== "employer_attestation" || (v.periodId !== null && v.claimId === null), {
    message: "SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY",
  });

export const submitForVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => submitInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("sp_submit_for_verification", {
      _claim_id: orNull(data.claimId),
      _period_id: orNull(data.periodId),
      _kind: data.kind,
      _employer_id: orNull(data.employerId),
    });
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

export const withdrawVerificationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("sp_withdraw_verification_request", {
      _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const raiseDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        claimId: z.string().uuid().nullable(),
        periodId: z.string().uuid().nullable(),
        reason: z.string().min(1).max(300),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("sp_raise_dispute", {
      _claim_id: orNull(data.claimId),
      _period_id: orNull(data.periodId),
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* CQrityjob verifier                                                  */
/* ------------------------------------------------------------------ */

export interface VerifierQueueItem {
  readonly id: string;
  readonly status: VerificationStatus;
  readonly submittedAt: string;
  readonly subjectType: "claim" | "experience";
  readonly holderName: string;
  readonly title: string | null;
  readonly claimType: string | null;
  readonly issuer: string | null;
  readonly employer: string | null;
  readonly jurisdiction: string | null;
  readonly assertion: string | null;
  readonly lifecycle: string | null;
  readonly evidenceCount: number;
  /** The caller is this request's holder, so no decision they make on it can
   *  ever succeed — `sp_verifier_decide` refuses self-verification before it
   *  writes anything. Answered by the database from `auth.uid()`, never
   *  inferred here, so the page and the guard cannot disagree. */
  readonly isSelf: boolean;
}

/** Whether the caller may act as a CQrityjob verifier. Answered by the
 *  database (`sp_is_verifier`, which is the platform-admin capability), not
 *  by anything this application decides for itself. */
export const passportVerifierWhoAmI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isVerifier: boolean }> => {
    const { data, error } = await context.supabase.rpc("sp_is_verifier", {
      _user_id: context.userId,
    });
    if (error) return { isVerifier: false };
    return { isVerifier: data === true };
  });

export const listVerifierQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ status: z.string().max(40).nullable().optional() }).parse(data ?? {}),
  )
  .handler(async ({ context, data }): Promise<readonly VerifierQueueItem[]> => {
    const { data: rows, error } = await context.supabase.rpc("sp_verifier_queue", {
      _status: orNull(data.status),
    });
    if (error) throw new Error(error.message);

    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      status: r.status as VerificationStatus,
      submittedAt: String(r.submitted_at),
      subjectType: r.subject_type as "claim" | "experience",
      holderName: String(r.holder_name ?? ""),
      title: (r.title as string | null) ?? null,
      claimType: (r.claim_type as string | null) ?? null,
      issuer: (r.issuer as string | null) ?? null,
      employer: (r.employer as string | null) ?? null,
      jurisdiction: (r.jurisdiction as string | null) ?? null,
      assertion: (r.assertion as string | null) ?? null,
      lifecycle: (r.lifecycle as string | null) ?? null,
      evidenceCount: Number(r.evidence_count ?? 0),
      isSelf: r.is_self === true,
    }));
  });

export interface VerifierEvidenceRef {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly uploadedAt: string;
}

export interface VerifierPriorDecision {
  readonly decision: string;
  readonly organisation: string | null;
  readonly method: string | null;
  readonly decidedAt: string;
}

export interface VerifierClaimVersion {
  readonly id: string;
  readonly title: string;
  readonly versionNo: number;
  readonly lifecycle: string;
}

/** The credential AS THE CANDIDATE STATED IT -- never as anyone verified it.
 *
 *  Every field here is holder-authored. That is the point: a reviewer's job
 *  is to compare this against the document, so the claim has to arrive whole.
 *  `sp_verifier_request_detail` has always carried most of it and the mapper
 *  below dropped all of it, which left the reviewer deciding on a title. */
export interface VerifierClaimFacts {
  readonly id: string;
  readonly claimType: string | null;
  readonly title: string | null;
  /** Candidate-entered. The ISSUER -- never the verifier, and never promoted
   *  into one. See `card.ts` for the fallback that used to do exactly that. */
  readonly issuer: string | null;
  readonly credentialCode: string | null;
  readonly credentialReference: string | null;
  readonly jurisdictionCode: string | null;
  /** Emirate or devolved region. Without it a Dubai licence reads as UAE-wide. */
  readonly subJurisdictionCode: string | null;
  readonly authorisationScope: string | null;
  readonly issuedOn: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly assertion: string | null;
  readonly lifecycle: string | null;
  readonly versionNo: number | null;
}

/** An employment period as the candidate stated it. Same rule as above. */
export interface VerifierPeriodFacts {
  readonly id: string;
  readonly employer: string | null;
  readonly role: string | null;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly employmentType: string | null;
  readonly jurisdictionCode: string | null;
  readonly securityRelevance: string | null;
  readonly securityFraction: number | null;
  readonly fteFraction: number | null;
  readonly versionNo: number | null;
  readonly assertion: string | null;
  readonly lifecycle: string | null;
}

export interface VerifierRequestDetail {
  readonly id: string;
  readonly status: VerificationStatus;
  readonly submittedAt: string;
  readonly subjectType: "claim" | "experience";
  readonly holderName: string;
  /** See `VerifierQueueItem.isSelf`. */
  readonly isSelf: boolean;
  /** Exactly one of these is populated, per `subjectType`. */
  readonly claim: VerifierClaimFacts | null;
  readonly period: VerifierPeriodFacts | null;
  readonly evidence: readonly VerifierEvidenceRef[];
  readonly previousVersions: readonly VerifierClaimVersion[];
  readonly priorDecisions: readonly VerifierPriorDecision[];
}

/** Mapped into a concrete shape rather than passed through as loose JSON.
 *
 *  Not merely for the type checker: `decision_note` is INTERNAL reviewer
 *  reasoning and lives on the same rows this function reads. Naming every
 *  field that crosses to the browser means the internal note cannot ride
 *  along in a spread, which is exactly how that kind of field leaks. */
/**
 * How much is waiting, for the admin shell badge and the dashboard card.
 *
 * Derived from `sp_verifier_queue` rather than a new RPC on purpose: the
 * queue function already carries the verifier capability check and the
 * "which requests may this principal see" logic. A separate counting query
 * would be a second place for that authorisation to be got right, and
 * eventually wrong.
 *
 * A non-verifier gets zeroes rather than an error, because the caller is a
 * navigation badge: the admin shell has already refused a non-admin, and a
 * badge that throws would break the whole shell for an edge case.
 */
export const passportReviewCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ open: number; clarification: number; total: number }> => {
    // `orNull` is the repository's narrow nullable-RPC convention; the
    // generated signature types the argument as optional, not nullable.
    const { data: rows, error } = await context.supabase.rpc("sp_verifier_queue", {
      _status: orNull<string>(null),
    });
    if (error) return { open: 0, clarification: 0, total: 0 };

    // A request the badge-holder submitted themselves is not work waiting for
    // them: they are barred from deciding it. Counting it would send them to a
    // queue where the only item is one they must leave for someone else.
    const list = ((rows ?? []) as Array<Record<string, unknown>>).filter((r) => r.is_self !== true);
    const open = list.filter((r) => r.status === "pending").length;
    const clarification = list.filter((r) => r.status === "clarification_requested").length;
    return { open, clarification, total: open + clarification };
  });

export const getVerifierRequestDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<VerifierRequestDetail> => {
    const { data: detail, error } = await context.supabase.rpc("sp_verifier_request_detail", {
      _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);

    const raw = (detail ?? {}) as Record<string, unknown>;
    const list = (key: string): Array<Record<string, unknown>> =>
      Array.isArray(raw[key]) ? (raw[key] as Array<Record<string, unknown>>) : [];
    const obj = (key: string): Record<string, unknown> | null => {
      const v = raw[key];
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    };
    // An absent field stays null. It must never become "" or an em dash here:
    // the reviewer page decides how to say "not stated", and a mapper that
    // invents a placeholder makes a missing credential reference
    // indistinguishable from one the candidate deliberately left blank.
    const str = (o: Record<string, unknown>, k: string): string | null => {
      const v = o[k];
      return typeof v === "string" && v !== "" ? v : null;
    };
    const num = (o: Record<string, unknown>, k: string): number | null => {
      if (o[k] === null || o[k] === undefined) return null;
      const v = Number(o[k]);
      return Number.isNaN(v) ? null : v;
    };

    const claimRaw = obj("claim");
    const periodRaw = obj("period");

    return {
      id: String(raw.id ?? data.requestId),
      status: (raw.status as VerificationStatus) ?? "pending",
      submittedAt: String(raw.submitted_at ?? ""),
      subjectType: raw.subject_type === "experience" ? "experience" : "claim",
      holderName: String(raw.holder_name ?? ""),
      isSelf: raw.is_self === true,
      claim: claimRaw
        ? {
            id: String(claimRaw.id ?? ""),
            claimType: str(claimRaw, "type"),
            title: str(claimRaw, "title"),
            issuer: str(claimRaw, "issuer"),
            credentialCode: str(claimRaw, "credential_code"),
            credentialReference: str(claimRaw, "credential_reference"),
            jurisdictionCode: str(claimRaw, "jurisdiction"),
            subJurisdictionCode: str(claimRaw, "sub_jurisdiction"),
            authorisationScope: str(claimRaw, "authorisation_scope"),
            issuedOn: str(claimRaw, "issued_on"),
            validFrom: str(claimRaw, "valid_from"),
            validUntil: str(claimRaw, "valid_until"),
            assertion: str(claimRaw, "assertion"),
            lifecycle: str(claimRaw, "lifecycle"),
            versionNo: num(claimRaw, "version_no"),
          }
        : null,
      period: periodRaw
        ? {
            id: String(periodRaw.id ?? ""),
            employer: str(periodRaw, "employer"),
            role: str(periodRaw, "role"),
            startedOn: str(periodRaw, "started_on"),
            endedOn: str(periodRaw, "ended_on"),
            employmentType: str(periodRaw, "employment_type"),
            jurisdictionCode: str(periodRaw, "jurisdiction"),
            securityRelevance: str(periodRaw, "security_relevance"),
            securityFraction: num(periodRaw, "security_fraction"),
            fteFraction: num(periodRaw, "fte_fraction"),
            versionNo: num(periodRaw, "version_no"),
            assertion: str(periodRaw, "assertion"),
            lifecycle: str(periodRaw, "lifecycle"),
          }
        : null,
      evidence: list("evidence").map((e) => ({
        id: String(e.id),
        fileName: String(e.file_name ?? ""),
        mimeType: String(e.mime_type ?? ""),
        uploadedAt: String(e.uploaded_at ?? ""),
      })),
      previousVersions: list("previous_versions").map((v) => ({
        id: String(v.id),
        title: String(v.title ?? ""),
        versionNo: Number(v.version_no ?? 1),
        lifecycle: String(v.lifecycle ?? ""),
      })),
      priorDecisions: list("prior_decisions").map((d) => ({
        decision: String(d.decision ?? ""),
        organisation: (d.organisation as string | null) ?? null,
        method: (d.method as string | null) ?? null,
        decidedAt: String(d.decided_at ?? ""),
      })),
    };
  });

const decideInput = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "clarification_requested"]),
  method: z.enum(["document_review", "employer_confirmation", "issuer_confirmation"]).nullable(),
  /** Internal reasoning. Never disclosed to a recipient, never shown on a card. */
  decisionNote: z.string().max(2000).nullable(),
  /** What the holder reads. */
  holderMessage: z.string().max(2000).nullable(),
  validFrom: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
  validUntil: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
});

/** The single decision entry point, shared by the CQrityjob verifier and the
 *  employer representative. It does not branch on who is calling: the
 *  database resolves the caller's authority from the request itself, so this
 *  function cannot grant an authority the caller does not have. */
export const decideVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => decideInput.parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    // An approval must say how it was reached. "Verified" with no method is
    // exactly the unfalsifiable claim this product exists to avoid.
    if (data.decision === "approved" && !data.method) {
      throw new Error(`${DECISION_ERROR_PREFIX}method_required`);
    }
    // ── AND A REFUSAL MUST SAY WHY ────────────────────────────────────
    //
    // The mirror of the rule above, and it was missing. A rejection or a
    // request for more information could be saved with `holder_message`
    // null, and the holder then read "we could not verify this" — or, worse,
    // "more information required" — with no sentence after it. There is
    // nothing a person can do with that.
    //
    // Whitespace counts as absent. " " is not a reason, and treating it as
    // one would make this check something a reviewer passes by pressing the
    // space bar.
    //
    // Only the CANDIDATE-facing message is required. `decisionNote` is the
    // reviewer's internal reasoning, stays optional, and stays out of every
    // payload the holder can read. The two fields exist precisely so that
    // requiring one says nothing about the other.
    //
    // This is the same rule `sp_verifier_decide` now enforces. It is
    // repeated here so the reviewer gets an immediate, specific refusal
    // instead of a round trip that comes back as a classified database
    // error — not because this layer is the control. The database is.
    if (
      (data.decision === "rejected" || data.decision === "clarification_requested") &&
      (data.holderMessage === null || data.holderMessage.trim() === "")
    ) {
      throw new Error(`${DECISION_ERROR_PREFIX}holder_message_required`);
    }
    const { error } = await context.supabase.rpc("sp_verifier_decide", {
      _request_id: data.requestId,
      _decision: data.decision,
      _method: orNull(data.method),
      _decision_note: orNull(data.decisionNote),
      _holder_message: orNull(data.holderMessage),
      _valid_from: orNull(data.validFrom),
      _valid_until: orNull(data.validUntil),
    });
    if (error) {
      // The raw refusal stays here, in the server log, where an operator can
      // read the constraint or function that fired. What crosses to the
      // browser is a code from a fixed list — never the database's own words.
      console.error("[passport] sp_verifier_decide refused", {
        requestId: data.requestId,
        decision: data.decision,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw new Error(`${DECISION_ERROR_PREFIX}${classifyDecisionError(error.message)}`);
    }
    return { ok: true };
  });

export const revokeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        claimId: z.string().uuid().nullable(),
        periodId: z.string().uuid().nullable(),
        reason: z.string().min(1).max(1000),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("sp_verifier_revoke", {
      _claim_id: orNull(data.claimId),
      _period_id: orNull(data.periodId),
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Employer representative                                             */
/* ------------------------------------------------------------------ */

export interface EmployerAttestationItem {
  readonly id: string;
  readonly status: VerificationStatus;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  readonly holderName: string;
  readonly roleTitle: string;
  readonly employerName: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
  readonly employmentType: string;
  readonly fteFraction: number;
  readonly securityRelevance: string;
  readonly holderMessage: string | null;
  /** The caller is this request's holder -- a candidate who also owns or
   *  administers the organisation being asked. `sp_verifier_decide` refuses
   *  every decision they make on it, so the page states that instead of
   *  offering a control that cannot work. Answered by the database from
   *  `auth.uid()`, never inferred here, so the page and the guard cannot
   *  disagree about who somebody is. */
  readonly isSelf: boolean;
}

/**
 * Which of an employer's requests are WORK, and which are merely on the list.
 *
 * The dashboard needs a number and the workspace needs the rows, and they
 * must never disagree, so both come from `sp_employer_attestation_queue` --
 * the one function that already carries the owner/admin check. A separate
 * counting query would be a second place for that authorisation to be got
 * right, and eventually wrong. Same reasoning, same shape, as
 * `passportReviewCounts` over the CQrityjob queue.
 */
export interface EmployerVerificationCounts {
  /** Waiting on THIS employer to answer. The only number that belongs in a
   *  "to do today" list. */
  readonly open: number;
  /** The employer asked for a correction and the candidate has not come back
   *  yet. Real, worth seeing in the workspace, and NOT the employer's work --
   *  counting it as such would send somebody to a queue with nothing to do. */
  readonly waitingOnCandidate: number;
}

/** Employers the holder can address an attestation request to.
 *
 *  Deliberately read with the CALLER'S client and no filter of our own: the
 *  existing `employers` RLS decides. A holder therefore sees the employers
 *  this site already shows them — organisations with active job listings,
 *  plus any they are themselves a member of — and no more. Asking the
 *  database rather than inventing a second visibility rule means this list
 *  cannot become a way to enumerate organisations that are otherwise
 *  private. */
export const listAttestableEmployers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly { id: string; name: string }[]> => {
    const { data, error } = await context.supabase
      .from("employers")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(200);
    if (error) return [];
    return ((data ?? []) as Array<{ id: string; name: string }>).map((e) => ({
      id: e.id,
      name: e.name,
    }));
  });

export const listEmployerAttestations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ employerId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<readonly EmployerAttestationItem[]> => {
    const { data: rows, error } = await context.supabase.rpc("sp_employer_attestation_queue", {
      _employer_id: data.employerId,
    });
    if (error) throw new Error(error.message);

    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      status: r.status as VerificationStatus,
      submittedAt: String(r.submitted_at),
      decidedAt: (r.decided_at as string | null) ?? null,
      holderName: String(r.holder_name ?? ""),
      roleTitle: String(r.role_title ?? ""),
      employerName: String(r.employer_name ?? ""),
      startedOn: String(r.started_on ?? ""),
      endedOn: (r.ended_on as string | null) ?? null,
      employmentType: String(r.employment_type ?? ""),
      fteFraction: Number(r.fte_fraction ?? 0),
      securityRelevance: String(r.security_relevance ?? ""),
      holderMessage: (r.holder_message as string | null) ?? null,
      // Strict equality, not truthiness: a payload from a database that
      // predates the flag carries `undefined`, and `undefined` must read as
      // "not the holder" -- the same answer today's page gives -- rather than
      // as anything the page might treat as a special case.
      isSelf: r.is_self === true,
    }));
  });

/**
 * How much employment confirmation is waiting on one employer.
 *
 * Zero, rather than an error, when the caller is not a representative of that
 * organisation: the caller is a dashboard badge, the workspace behind it has
 * already refused a non-member, and a badge that throws would take the whole
 * overview down for a member who simply is not an owner or an admin.
 *
 * A request the CALLER submitted about themselves is excluded from `open`.
 * They are barred from deciding it, so counting it would send them to a list
 * whose only item is one they must leave for a colleague.
 */
export const employerVerificationCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ employerId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<EmployerVerificationCounts> => {
    const { data: rows, error } = await context.supabase.rpc("sp_employer_attestation_queue", {
      _employer_id: data.employerId,
    });
    if (error) return { open: 0, waitingOnCandidate: 0 };

    const list = ((rows ?? []) as Array<Record<string, unknown>>).filter((r) => r.is_self !== true);
    return {
      open: list.filter((r) => r.status === "pending").length,
      waitingOnCandidate: list.filter((r) => r.status === "clarification_requested").length,
    };
  });

/* ------------------------------------------------------------------ */
/* Disputes                                                            */
/* ------------------------------------------------------------------ */

/**
 * The defect these two close.
 *
 * A holder pressed "Anmäl att uppgiften är fel", the entry became Bestridd,
 * and that was the end of it. `sp_raise_dispute` writes the lifecycle state
 * and an audit event; `sp_verifier_queue` reads `sp_verification_requests`.
 * The two never met, so a disputed entry appeared in no queue, and the tester
 * who went looking for it in admin was right that it was not there.
 *
 * `sp_dispute_queue` is the missing read and `sp_resolve_dispute` the missing
 * decision. Both carry the verifier capability check in the database, in the
 * function body, before anything else — the same shape as the verification
 * queue, for the same reason: a page is not an authorisation boundary.
 */
export interface DisputeQueueItem {
  readonly subjectType: "claim" | "experience";
  readonly subjectId: string;
  readonly holderName: string;
  readonly title: string | null;
  readonly credentialCode: string | null;
  readonly skillCode: string | null;
  readonly claimType: string | null;
  readonly issuer: string | null;
  readonly jurisdiction: string | null;
  readonly subJurisdiction: string | null;
  readonly assertion: string | null;
  readonly lifecycle: string | null;
  /** When the holder reported it, read back from the audit event. Null only
   *  for a row disputed before the event existed. */
  readonly disputedAt: string | null;
  /** What the holder said was wrong. Null when none was captured. */
  readonly reason: string | null;
  readonly evidenceCount: number;
  /** The caller is the holder. `sp_resolve_dispute` refuses on this basis, so
   *  the page disables the controls rather than offering an action that
   *  cannot succeed. */
  readonly isSelf: boolean;
}

export const listDisputeQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly DisputeQueueItem[]> => {
    const { data: rows, error } = await context.supabase.rpc("sp_dispute_queue");
    if (error) throw new Error(error.message);

    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      subjectType: r.subject_type as "claim" | "experience",
      subjectId: String(r.subject_id),
      holderName: String(r.holder_name ?? ""),
      title: (r.title as string | null) ?? null,
      credentialCode: (r.credential_code as string | null) ?? null,
      skillCode: (r.skill_code as string | null) ?? null,
      claimType: (r.claim_type as string | null) ?? null,
      issuer: (r.issuer as string | null) ?? null,
      jurisdiction: (r.jurisdiction as string | null) ?? null,
      subJurisdiction: (r.sub_jurisdiction as string | null) ?? null,
      assertion: (r.assertion as string | null) ?? null,
      lifecycle: (r.lifecycle as string | null) ?? null,
      disputedAt: (r.disputed_at as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      evidenceCount: Number(r.evidence_count ?? 0),
      isSelf: r.is_self === true,
    }));
  });

/**
 * Closes one dispute.
 *
 * `restored` returns the entry to active; `withdrawn` takes it out of the
 * active Passport. Neither writes `assertion_level` — a dispute is not a route
 * to verification, and resolving one cannot verify anything. The database
 * refuses a third outcome, refuses a caller without the verifier capability,
 * and refuses a verifier resolving a dispute on their own entry.
 */
export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        claimId: z.string().uuid().nullable(),
        periodId: z.string().uuid().nullable(),
        outcome: z.enum(["restored", "withdrawn"]),
        note: z.string().max(300),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("sp_resolve_dispute", {
      _claim_id: orNull(data.claimId),
      _period_id: orNull(data.periodId),
      _outcome: data.outcome,
      _note: orNull(data.note.trim() === "" ? null : data.note.trim()),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
