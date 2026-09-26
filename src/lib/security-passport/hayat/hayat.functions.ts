// HAYAT — the server boundary.
//
// ── WHAT CROSSES IT ────────────────────────────────────────────────────
//
// IN:  the holder's selected definition code, the two dates they typed, and
//      EITHER the text of a signed credential found inside their own image OR
//      their public badge link (which is parsed for an id and never fetched). No
//      document, no OCR text, no page image, and -- on purpose -- no field in
//      which a browser could say "this is verified". There is nothing here for
//      a client to set.
// OUT: a decision made by ./verification from a signature, a pinned key and a
//      governed issuer policy.
//
// The account the credential is bound against is read from the authenticated
// session on the server. It is never an input.
//
// ── PREVIEW AND RECORD ARE DIFFERENT FUNCTIONS ─────────────────────────
//
// `assessCredentialEvidence` is the PREVIEW shown in the form before anything is
// saved. It writes nothing (`recorded: false`).
//
// `assessSavedCredential` runs once the claim exists. It reads the claim and its
// evidence through the HOLDER'S OWN session (RLS is the boundary: somebody
// else's claim id finds nothing), takes the claim's fingerprint BEFORE checking,
// runs the adapter, and hands the result to the one service-only writer
// (./hayat-assessment.server.ts). For a file, the signed credential is extracted
// here from the stored bytes -- the browser is not asked what the file contains.
//
// Neither function touches sp_claims.assertion_level: a HAYAT result is its own
// record and is shown on the credential's page, nowhere else.
//
// Nothing about the credential is logged.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isCalendarDate } from "../dates";
import { EVIDENCE_BUCKET } from "../evidence.functions";
import { BAKED_CREDENTIAL_MAX_CHARS, extractBakedCredential } from "./baked-badge";
import { assessHostedBadge } from "./verification/hosted-open-badge";
import { PRODUCTION_ISSUER_POLICIES } from "./verification/issuer-registry";
import {
  unverifiableDocument,
  type BindingLevel,
  type HayatDecision,
  type HayatStatus,
  type ReasonCode,
  type ScopeLimit,
} from "./verification/model";
import { assessSignedCredential } from "./verification/signed-credential";
import {
  CREDLY_OB2,
  PRODUCTION_SOURCES,
  verifiableDefinitionCodes,
} from "./verification/source-registry";

// A real calendar date, not merely a date-shaped string.
const isoDay = z.string().refine(isCalendarDate, "not a calendar date").nullable();

const assessInput = z
  .object({
    definitionCode: z.string().min(1).max(120),
    issuedOn: isoDay,
    validUntil: isoDay,
    /** A signed credential found baked into the holder's own image. */
    signedCredential: z.string().min(1).max(BAKED_CREDENTIAL_MAX_CHARS).nullable(),
    /** The holder's public badge link. Parsed for an id; never fetched as given. */
    badgeLink: z.string().min(1).max(400).nullable(),
  })
  // Strict: an unexpected key -- `verified: true`, say -- is a refused request,
  // not an ignored one.
  .strict()
  .refine((d) => (d.signedCredential === null) !== (d.badgeLink === null), {
    message: "exactly one kind of evidence",
  });

export interface HayatAssessment {
  readonly decision: HayatDecision;
  /** False for a preview, and whenever there was nothing a source had checked. */
  readonly recorded: boolean;
}

/** What the credential page shows after reopening. */
export interface SavedAssessment {
  /** The HAYAT check reference: identifies ONE recorded check, shown only in
   *  the holder's own assessment details. It is not a verification number,
   *  says nothing about the person, and there is no lookup by it anywhere --
   *  sp_hayat_current_assessment answers only the claim's own holder. */
  readonly id: string;
  readonly status: HayatStatus;
  readonly reasons: readonly ReasonCode[];
  readonly bindingLevel: BindingLevel;
  readonly scopeLimits: readonly ScopeLimit[];
  readonly sourceKind: "signed_credential" | "hosted_open_badge";
  readonly ruleVersion: string;
  readonly checkedAt: string;
  /** False = history: verified THEN, not a statement about now. */
  readonly isCurrent: boolean;
  readonly notCurrentReason:
    | "fields_changed"
    | "evidence_changed"
    | "superseded"
    | "recheck_needed"
    | null;
}

/** Which link-based sources the holder can actually use right now. A disabled
 *  source is not offered: the form shows only actions that work. */
export interface HayatAvailability {
  readonly linkSources: readonly {
    readonly id: string;
    readonly name: string;
    readonly definitionCodes: readonly string[];
  }[];
}

export const getHayatAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<HayatAvailability> => ({
      linkSources: PRODUCTION_SOURCES.filter((s) => s.enabled).map((s) => ({
        id: s.id,
        name: s.name,
        definitionCodes: verifiableDefinitionCodes([s]),
      })),
    }),
  );

export const assessCredentialEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => assessInput.parse(data))
  .handler(async ({ context, data }): Promise<HayatAssessment> => {
    const { data: session } = await context.supabase.auth.getUser();
    const user = session?.user ?? null;
    const account = {
      email: user?.email ?? null,
      emailConfirmed: Boolean(user?.email_confirmed_at),
    };
    const now = new Date();
    const decision =
      data.badgeLink !== null
        ? await assessHostedBadge(
            {
              link: data.badgeLink,
              claim: { definitionCode: data.definitionCode, validUntil: data.validUntil },
              account,
            },
            { source: CREDLY_OB2, now },
          )
        : await assessSignedCredential(
            {
              credential: data.signedCredential ?? "",
              claim: {
                definitionCode: data.definitionCode,
                issuedOn: data.issuedOn,
                validUntil: data.validUntil,
              },
              account,
            },
            { registry: PRODUCTION_ISSUER_POLICIES, now },
          );
    return { decision, recorded: false };
  });

/** A positive signed-credential result stays current this long unless the issuer
 *  policy says otherwise. Matches the hosted source's window. */
const DEFAULT_CURRENCY_DAYS = 30;

/** Results that mean "nothing was checked by a source". They are shown, never kept. */
const NOT_A_CHECK: readonly ReasonCode[] = [
  "no_verifiable_source",
  "source_not_enabled",
  "link_not_recognised",
];

export const getSavedAssessment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ claimId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ context, data }): Promise<SavedAssessment | null> => {
    // SECURITY INVOKER + RLS: another holder's claim id returns no row.
    const { data: rows, error } = await context.supabase.rpc(
      "sp_hayat_current_assessment" as never,
      { _claim_id: data.claimId } as never,
    );
    // Tolerant on purpose: if the schema is not there, the page says "no
    // automatic check has been made", which is then simply true.
    const row = error ? null : ((rows as unknown as Record<string, unknown>[] | null)?.[0] ?? null);
    if (!row) return null;
    return {
      id: String(row.id),
      status: row.status as HayatStatus,
      reasons: (row.reasons as ReasonCode[]) ?? [],
      bindingLevel: row.binding_level as BindingLevel,
      scopeLimits: (row.scope_limits as ScopeLimit[]) ?? [],
      sourceKind: row.source_kind as SavedAssessment["sourceKind"],
      ruleVersion: String(row.rule_version),
      checkedAt: String(row.checked_at),
      isCurrent: row.is_current === true,
      notCurrentReason: (row.not_current_reason as SavedAssessment["notCurrentReason"]) ?? null,
    };
  });

const savedInput = z
  .object({
    claimId: z.string().uuid(),
    /** A new badge link. Null re-uses the link of the previous check, if any. */
    badgeLink: z.string().min(1).max(400).nullable(),
  })
  .strict();

export const assessSavedCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => savedInput.parse(data))
  .handler(async ({ context, data }): Promise<HayatAssessment> => {
    const db = context.supabase;
    const now = new Date();
    const claim = await db
      .from("sp_claims")
      .select("id, credential_code, issued_on, valid_until")
      .eq("id", data.claimId)
      .maybeSingle();
    // Not found covers "not yours": RLS returns nothing for another holder's claim.
    if (claim.error || !claim.data?.credential_code) throw new Error("SP_HAYAT_CLAIM_NOT_FOUND");

    // The fingerprint is taken BEFORE the check, so the writer can refuse a
    // result for fields the holder changed while it was running.
    const fingerprint = await db.rpc(
      "sp_hayat_claim_fingerprint" as never,
      { _claim_id: data.claimId } as never,
    );
    const assessedFingerprint = fingerprint.error ? null : (fingerprint.data as unknown as string);

    const { data: session } = await db.auth.getUser();
    const account = {
      email: session?.user?.email ?? null,
      emailConfirmed: Boolean(session?.user?.email_confirmed_at),
    };
    const claimFields = {
      definitionCode: claim.data.credential_code,
      issuedOn: claim.data.issued_on,
      validUntil: claim.data.valid_until,
    };

    let link = data.badgeLink;
    if (link === null) {
      const previous = await db.rpc(
        "sp_hayat_current_assessment" as never,
        { _claim_id: data.claimId } as never,
      );
      const row = previous.error
        ? null
        : ((previous.data as unknown as Record<string, unknown>[] | null)?.[0] ?? null);
      if (row?.source_kind === "hosted_open_badge") link = String(row.source_reference);
    }

    let decision: HayatDecision;
    let evidenceId: string | null = null;
    if (link !== null) {
      decision = await assessHostedBadge(
        { link, claim: claimFields, account },
        { source: CREDLY_OB2, now },
      );
    } else {
      // The newest active PNG on the claim, read with the holder's own session.
      const evidence = await db
        .from("sp_evidence")
        .select("id, storage_path")
        .eq("claim_id", data.claimId)
        .eq("lifecycle_state", "active")
        .eq("mime_type", "image/png")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const file = evidence.data
        ? await db.storage.from(EVIDENCE_BUCKET).download(evidence.data.storage_path)
        : null;
      const credential = file?.data
        ? await extractBakedCredential(new Uint8Array(await file.data.arrayBuffer()))
        : null;
      if (!evidence.data || !credential)
        return { decision: unverifiableDocument(now.toISOString()), recorded: false };
      evidenceId = evidence.data.id;
      decision = await assessSignedCredential(
        { credential, claim: claimFields, account },
        { registry: PRODUCTION_ISSUER_POLICIES, now },
      );
    }

    if (!assessedFingerprint || NOT_A_CHECK.includes(decision.reasons[0]))
      return { decision, recorded: false };
    const { recordHayatAssessment } = await import("./hayat-assessment.server");
    const outcome = await recordHayatAssessment(decision, {
      holderUserId: context.userId,
      claimId: data.claimId,
      assessedFingerprint,
      evidenceId,
      sourceKind: link !== null ? "hosted_open_badge" : "signed_credential",
      sourceReference: link,
      currentForDays: link !== null ? CREDLY_OB2.maxEvidenceAgeDays : DEFAULT_CURRENCY_DAYS,
    });
    return { decision, recorded: outcome.recorded };
  });
