// Assessment Center — the employer server surface.
//
// Same discipline as academy-delivery.functions.ts: every rule lives in the
// database, and this file translates. Each function calls exactly one RPC that
// re-verifies membership and role for itself, so nothing here is trusted to
// have checked authorisation before calling.
//
// The employer id arrives from the route. That is deliberate and safe: every
// RPC treats it as a CLAIM and verifies the caller's membership of that exact
// organisation, returning nothing when the claim is false. Passing another
// organisation's id grants nothing — asserted in the Phase 2 suite (P2B.6).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ctx, RpcRow } from "./rpc-types";

export type MaturityLevel =
  | "no_evidence"
  | "limited_evidence"
  | "developing_evidence"
  | "consistent_evidence"
  | "strong_evidence";

export type LibraryEntry = {
  assessmentVersionId: string;
  slug: string;
  nameSv: string;
  nameEn: string;
  contentStatus: string;
  validationStatus: string;
  isTestFixture: boolean;
  assignable: boolean;
  /** The basis on which this organisation may run it, or null if it may not.
   *  `closed_test` means a scoped pilot of content that is genuinely not yet
   *  validated — assignable and unvalidated at the same time, which a boolean
   *  alone cannot express without misleading in one direction. */
  governanceMode: "development" | "closed_test" | "recruitment" | null;
  itemCount: number;
  minutesMin: number | null;
  minutesMax: number | null;
  purposeSv: string | null;
  purposeEn: string | null;
  doesNotMeasureSv: string[];
  doesNotMeasureEn: string[];
};

export type ParticipantRow = {
  subjectId: string;
  attemptId: string;
  assignmentId: string | null;
  programmeNameSv: string | null;
  programmeNameEn: string | null;
  attemptStatus: string;
  answered: number;
  totalItems: number;
  reviewsOutstanding: number;
  deadline: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  scoredAt: string | null;
  releasedAt: string | null;
  identityResolvable: boolean;
};

/** The product vocabulary. Deliberately not the maturity scale.
 *
 *  Maturity describes how strong the EVIDENCE is; this describes what the
 *  evidence lets anyone say about a way of working. They are different axes, so
 *  the report speaks one of them and `des-v1` records how it got there.
 *  `not_yet_shown` means the evidence is insufficient — never that the person
 *  lacks the ability. */
export type EvidenceState =
  | "strongly_shown"
  | "shown"
  | "follow_up"
  | "not_yet_shown"
  | "critical_follow_up";

/** One competency, as the audience receives it.
 *
 *  The optional halves are the audience split made visible in the type: an
 *  employer line carries an interview question, a participant line carries a
 *  reflection prompt and the fact that a person reviewed a safety-critical
 *  answer. Neither is filtered out of the other in the client — the database
 *  never put it there. */
export type CompetencyLine = {
  competencyCode: string;
  competencyNameSv: string;
  competencyNameEn: string;
  evidenceState: EvidenceState;
  observations: number;
  /** Which kinds of task produced the evidence. One entry means one source,
   *  which is the honest reason a line reads "needs a follow-up". */
  sourceTypes: string[];
  /** The observable behaviour the competency is read through — what was
   *  actually looked at, not just the competency label. */
  behaviourSv: string | null;
  behaviourEn: string | null;
  followupSv: string | null;
  followupEn: string | null;
  reflectionSv: string | null;
  reflectionEn: string | null;
  humanReviewed: boolean;
};

/** Part A, frozen at release.
 *
 *  Every field is optional because snapshots released before the context
 *  existed carry none, and a historical report is never rewritten to add it.
 *  Surfaces render what is present and omit the rest — role, customer and site
 *  are absent from the data model entirely today, so they are absent here
 *  rather than rendered as an empty row on every report.
 *
 *  No participant name: identity stays behind the audited
 *  scp_resolve_participant_identity path, and a name written into an immutable
 *  snapshot could never be erased. */
export type ReportContext = {
  participantRef?: string;
  personContext?: "employee" | "candidate";
  organisationName?: string;
  purposeCode?: string;
  assessmentSlug?: string;
  assessmentNameSv?: string;
  assessmentNameEn?: string;
  assessmentVersion?: number;
  language?: string;
  startedAt?: string;
  submittedAt?: string;
  scoredAt?: string;
  governanceMode?: string;
  validationStatus?: string;
  contentStatus?: string;
  attemptStatus?: string;
  reviewsTotal?: number;
  reviewsCompleted?: number;
  /** Counted at release, not assumed. The sufficiency gate is expressed in
   *  evidence CONTEXTS, so two sittings against the same form are one context —
   *  and the coverage paragraph has to say that rather than "two occasions". */
  evidenceObservations?: number;
  evidenceContexts?: number;
  humanReviewOccurred?: boolean;
  reportKey?: string;
  reportVersion?: number;
  evidenceStateVersion?: string;
  thresholdVersion?: string;
  scoringModelVersion?: string;
};

export type ReportSnapshot = {
  id: string;
  attemptId: string;
  subjectId: string;
  audience: "participant" | "employer";
  releasedAt: string;
  context: ReportContext | null;
  lines: CompetencyLine[];
  safetyFlags: { severity: string | null; observedAt: string }[];
  limitationsSv: string[];
  limitationsEn: string[];
};

export type DevelopmentRecommendation = {
  moduleVersionId: string;
  nameSv: string;
  nameEn: string;
  summarySv: string;
  summaryEn: string;
  estimatedMinutes: number | null;
  addressesSv: string;
  addressesEn: string;
  maturityLevel: MaturityLevel;
};

export type ProgressRow = {
  releasedAt: string;
  attemptId: string;
  competencyCode: string;
  competencyNameSv: string;
  competencyNameEn: string;
  evidenceState: EvidenceState;
  observations: number;
  safetyFlagCount: number;
};

export class AcademyEmployerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcademyEmployerError";
  }
}

/** Keep the database's own error identifier, so the UI can say something
 *  specific.
 *
 *  A recognised SCP_* refusal is deliberate wording written by whoever raised
 *  it and is carried through. Anything else is an unexpected database error —
 *  a constraint name, a SQLSTATE, a fragment of SQL — and must not reach the
 *  employer UI, so it is logged server-side and replaced. */
function fail(message: string, fallback: string): AcademyEmployerError {
  const m = /SCP_[A-Z_]+/.exec(message ?? "");
  if (m) return new AcademyEmployerError(m[0], message ?? fallback);
  console.error("[academy-employer] unexpected database error", message);
  return new AcademyEmployerError(fallback, "UNEXPECTED_ERROR");
}

const employerInput = z.object({ employerId: z.string().uuid() });

export const listAcademyLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerInput.parse(d))
  .handler(async ({ data, context }): Promise<LibraryEntry[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_library", {
      _employer_id: data.employerId,
    });
    if (error) throw fail(error.message, "library_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      assessmentVersionId: String(r.assessment_version_id),
      slug: String(r.definition_slug),
      nameSv: String(r.name_sv),
      nameEn: String(r.name_en),
      contentStatus: String(r.content_status),
      validationStatus: String(r.validation_status),
      isTestFixture: Boolean(r.is_test_fixture),
      assignable: Boolean(r.assignable),
      governanceMode: (r.governance_mode ?? null) as LibraryEntry["governanceMode"],
      itemCount: Number(r.item_count ?? 0),
      minutesMin: r.target_minutes_min ?? null,
      minutesMax: r.target_minutes_max ?? null,
      purposeSv: r.programme_purpose_sv ?? null,
      purposeEn: r.programme_purpose_en ?? null,
      doesNotMeasureSv: r.does_not_measure_sv ?? [],
      doesNotMeasureEn: r.does_not_measure_en ?? [],
    }));
  });

/** Which processing purposes currently have an approved, published version.
 *
 *  scp_employer_assign now resolves the purpose from the use case and REFUSES
 *  when that purpose has no approved version — recruitment and reassessment are
 *  deliberately closed until a Product Owner and legal review publishes one.
 *
 *  A refusal the user only discovers by pressing the button is a bad refusal.
 *  This lets a surface disable the control and say why, so "not yet available"
 *  is visible before the click rather than after it.
 *
 *  Deliberately just the codes. No lawful basis, no privacy-notice reference —
 *  a UI has no business rendering either, and this is read by any authenticated
 *  member of the workspace. */
export const listAvailablePurposeCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("scp_purpose_versions")
      .select("purpose_code, published_at, retired_at, scp_processing_purposes(is_active)")
      .not("published_at", "is", null)
      .is("retired_at", null);
    if (error) throw fail(error.message, "purposes_failed");
    const codes = new Set<string>();
    for (const r of (rows ?? []) as RpcRow[]) {
      const purpose = r.scp_processing_purposes as { is_active?: boolean } | null;
      if (purpose?.is_active) codes.add(String(r.purpose_code));
    }
    return [...codes];
  });

export const assignAcademyProgramme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        assessmentVersionId: z.string().uuid(),
        recipientEmail: z.string().email(),
        deadline: z.string().nullable().default(null),
        language: z.enum(["sv", "en"]).default("sv"),
        // The people model: who the participant is to this organisation.
        // Defaults to workforce, which is what the Academy has always meant.
        useCase: z.enum(["workforce", "recruitment"]).default("workforce"),
        employeeId: z.string().uuid().nullable().default(null),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      assignmentId: string;
      attemptId: string;
      governanceMode: "development" | "closed_test" | "recruitment";
    }> => {
      const ctx = context as Ctx;
      const { data: rows, error } = await ctx.supabase.rpc("scp_employer_assign", {
        _employer_id: data.employerId,
        _assessment_version_id: data.assessmentVersionId,
        _recipient_email: data.recipientEmail,
        _deadline: data.deadline,
        _language: data.language,
        _use_case: data.useCase,
        _employee_id: data.employeeId,
      });
      if (error) throw fail(error.message, "assign_failed");
      const r = (Array.isArray(rows) ? rows[0] : rows) as RpcRow;
      // The basis is returned so the caller can label the assignment
      // truthfully. A closed-test pilot must never be presented as a
      // validated selection instrument.
      return {
        assignmentId: String(r.assignment_id),
        attemptId: String(r.attempt_id),
        governanceMode: String(r.governance_mode) as "development" | "closed_test" | "recruitment",
      };
    },
  );

export const listAcademyParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerInput.parse(d))
  .handler(async ({ data, context }): Promise<ParticipantRow[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_participants", {
      _employer_id: data.employerId,
    });
    if (error) throw fail(error.message, "participants_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      subjectId: String(r.subject_id),
      attemptId: String(r.attempt_id),
      assignmentId: r.assignment_id ? String(r.assignment_id) : null,
      programmeNameSv: r.programme_name_sv ?? null,
      programmeNameEn: r.programme_name_en ?? null,
      attemptStatus: String(r.attempt_status),
      answered: Number(r.answered ?? 0),
      totalItems: Number(r.total_items ?? 0),
      reviewsOutstanding: Number(r.reviews_outstanding ?? 0),
      deadline: r.deadline ?? null,
      startedAt: r.started_at ?? null,
      submittedAt: r.submitted_at ?? null,
      scoredAt: r.scored_at ?? null,
      releasedAt: r.released_at ?? null,
      identityResolvable: Boolean(r.identity_resolvable),
    }));
  });

/** Two integers. An employer is entitled to know something is waiting on
 *  CQrityjob; it is not entitled to the material under review. */
export const getAcademyReviewPressure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerInput.parse(d))
  .handler(
    async ({ data, context }): Promise<{ awaitingReview: number; attemptsBlocked: number }> => {
      const ctx = context as Ctx;
      const { data: rows, error } = await ctx.supabase.rpc("scp_employer_review_pressure", {
        _employer_id: data.employerId,
      });
      if (error) throw fail(error.message, "pressure_failed");
      const r = (Array.isArray(rows) ? rows[0] : rows) as RpcRow | undefined;
      return {
        awaitingReview: Number(r?.awaiting_review ?? 0),
        attemptsBlocked: Number(r?.attempts_blocked ?? 0),
      };
    },
  );

/**
 * Resolve one pseudonymous subject to a person.
 *
 * Called only when the employer explicitly asks to see who a participant is,
 * one at a time — never to decorate a list. Returns null on every refusal,
 * matching the RPC's own no-oracle behaviour.
 */
export const resolveParticipantIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), subjectId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ email: string } | null> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_resolve_participant_identity", {
      _employer_id: data.employerId,
      _subject_id: data.subjectId,
    });
    if (error) return null;
    const r = (Array.isArray(rows) ? rows[0] : rows) as RpcRow | undefined;
    return r?.display_email ? { email: String(r.display_email) } : null;
  });

export const releaseAcademyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ released: true }> => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase.rpc("scp_release_attempt_report", {
      _attempt_id: data.attemptId,
    });
    if (error) throw fail(error.message, "release_failed");
    return { released: true };
  });

export const scheduleAcademyReassessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        subjectId: z.string().uuid(),
        deadline: z.string().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ attemptId: string }> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_schedule_reassessment", {
      _employer_id: data.employerId,
      _subject_id: data.subjectId,
      _deadline: data.deadline,
    });
    if (error) throw fail(error.message, "reassessment_failed");
    const r = (Array.isArray(rows) ? rows[0] : rows) as RpcRow;
    return { attemptId: String(r.attempt_id) };
  });

/** Part F — the employer's own decision, recorded beside the report.
 *
 *  Never part of a report snapshot: the snapshot is immutable and the decision
 *  happens later and can be revised. The two are composed by the surface with
 *  both timestamps visible, so nobody has to guess which came first.
 *
 *  The vocabulary carries no "hire", "reject", "suitable" or "unsuitable". The
 *  product does not produce an employment verdict, and offering one as a
 *  controlled option would put that verdict in its mouth. */
export type EmployerDecisionAction =
  | "follow_up_conversation"
  | "assign_development"
  | "gather_more_evidence"
  | "safety_follow_up"
  | "no_action_needed";

export type EmployerDecisionReason =
  | "evidence_thin"
  | "safety_observation"
  | "competency_gap"
  | "meets_expectation"
  | "other";

export type EmployerDecision = {
  id: string;
  decidedAt: string;
  decidedByEmail: string;
  action: EmployerDecisionAction;
  reasonCode: EmployerDecisionReason;
  reasonNote: string | null;
  nextStep: string | null;
  nextStepOwner: string | null;
  supersedesId: string | null;
  /** Nothing supersedes it. Superseded rows are still returned — the history
   *  is the point of an append-only record. */
  isCurrent: boolean;
};

export const listEmployerDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EmployerDecision[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_decisions", {
      _attempt_id: data.attemptId,
    });
    if (error) throw fail(error.message, "decisions_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      id: String(r.id),
      decidedAt: String(r.decided_at),
      decidedByEmail: String(r.decided_by_email ?? ""),
      action: r.action as EmployerDecisionAction,
      reasonCode: r.reason_code as EmployerDecisionReason,
      reasonNote: r.reason_note ? String(r.reason_note) : null,
      nextStep: r.next_step ? String(r.next_step) : null,
      nextStepOwner: r.next_step_owner ? String(r.next_step_owner) : null,
      supersedesId: r.supersedes_id ? String(r.supersedes_id) : null,
      isCurrent: Boolean(r.is_current),
    }));
  });

export const recordEmployerDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        action: z.enum([
          "follow_up_conversation",
          "assign_development",
          "gather_more_evidence",
          "safety_follow_up",
          "no_action_needed",
        ]),
        reasonCode: z.enum([
          "evidence_thin",
          "safety_observation",
          "competency_gap",
          "meets_expectation",
          "other",
        ]),
        // Bounded here as well as in the CHECK: free text about a person is the
        // riskiest field on the form, and the limit should be visible to whoever
        // reads this file rather than only to the database.
        reasonNote: z.string().max(500).nullable().default(null),
        nextStep: z.string().max(300).nullable().default(null),
        nextStepOwner: z.string().max(120).nullable().default(null),
        supersedesId: z.string().uuid().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ decisionId: string }> => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("scp_record_employer_decision", {
      _attempt_id: data.attemptId,
      _action: data.action,
      _reason_code: data.reasonCode,
      _reason_note: data.reasonNote,
      _next_step: data.nextStep,
      _next_step_owner: data.nextStepOwner,
      _supersedes_id: data.supersedesId,
    });
    if (error) throw fail(error.message, "decision_failed");
    return { decisionId: String(id) };
  });

/** snake_case jsonb to the camelCase the surfaces read.
 *
 *  Undefined rather than null for every absent key, so `ctx.assessmentVersion &&`
 *  in a component means "we have this" rather than "this is falsy". */
function mapContext(c: RpcRow | null): ReportContext | null {
  if (!c) return null;
  const str = (k: string) => (c[k] == null ? undefined : String(c[k]));
  const num = (k: string) => (c[k] == null ? undefined : Number(c[k]));
  return {
    participantRef: str("participant_ref"),
    personContext: str("person_context") as ReportContext["personContext"],
    organisationName: str("organisation_name"),
    purposeCode: str("purpose_code"),
    assessmentSlug: str("assessment_slug"),
    assessmentNameSv: str("assessment_name_sv"),
    assessmentNameEn: str("assessment_name_en"),
    assessmentVersion: num("assessment_version"),
    language: str("language"),
    startedAt: str("started_at"),
    submittedAt: str("submitted_at"),
    scoredAt: str("scored_at"),
    governanceMode: str("governance_mode"),
    validationStatus: str("validation_status"),
    contentStatus: str("content_status"),
    attemptStatus: str("attempt_status"),
    reviewsTotal: num("reviews_total"),
    reviewsCompleted: num("reviews_completed"),
    evidenceObservations: num("evidence_observations"),
    evidenceContexts: num("evidence_contexts"),
    humanReviewOccurred:
      c.human_review_occurred == null ? undefined : Boolean(c.human_review_occurred),
    reportKey: str("report_key"),
    reportVersion: num("report_version"),
    evidenceStateVersion: str("evidence_state_version"),
    thresholdVersion: str("threshold_version"),
    scoringModelVersion: str("scoring_model_version"),
  };
}

/**
 * A released report.
 *
 * Read through RLS on scp_report_snapshots rather than through an RPC — the
 * policy already says exactly who may see which audience, so a definer
 * function here would add a second place for that rule to live and drift.
 */
export const getAcademyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        audience: z.enum(["participant", "employer"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ReportSnapshot | null> => {
    const ctx = context as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("scp_report_snapshots")
      .select(
        // derivation_input is deliberately NOT selected. It holds the internal
        // maturity the state was derived from, and it exists for reproducibility,
        // not for a reader.
        "id, attempt_id, subject_id, audience, released_at, payload, safety_flags, context, " +
          "scp_report_versions(limitations_sv, limitations_en)",
      )
      .eq("attempt_id", data.attemptId)
      .eq("audience", data.audience)
      .maybeSingle();
    if (error || !row) return null;

    // The joined template arrives as a nested object PostgREST types loosely.
    const tmpl = ((row as RpcRow).scp_report_versions ?? {}) as {
      limitations_sv?: string[];
      limitations_en?: string[];
    };
    return {
      id: String(row.id),
      attemptId: String(row.attempt_id),
      subjectId: String(row.subject_id),
      audience: row.audience,
      releasedAt: String(row.released_at),
      context: mapContext(row.context as RpcRow | null),
      lines: (Array.isArray(row.payload) ? (row.payload as RpcRow[]) : []).map((x) => ({
        competencyCode: String(x.competency_code),
        competencyNameSv: String(x.competency_name_sv),
        competencyNameEn: String(x.competency_name_en),
        evidenceState: x.evidence_state as CompetencyLine["evidenceState"],
        observations: Number(x.observations ?? 0),
        sourceTypes: Array.isArray(x.source_types) ? (x.source_types as string[]) : [],
        behaviourSv: x.behaviour_sv ? String(x.behaviour_sv) : null,
        behaviourEn: x.behaviour_en ? String(x.behaviour_en) : null,
        followupSv: x.followup_sv ? String(x.followup_sv) : null,
        followupEn: x.followup_en ? String(x.followup_en) : null,
        reflectionSv: x.reflection_sv ? String(x.reflection_sv) : null,
        reflectionEn: x.reflection_en ? String(x.reflection_en) : null,
        humanReviewed: Boolean(x.human_reviewed),
      })),
      safetyFlags: (Array.isArray(row.safety_flags) ? (row.safety_flags as RpcRow[]) : []).map(
        (f) => ({
          severity: (f.severity as string | null) ?? null,
          observedAt: String(f.observed_at),
        }),
      ),
      limitationsSv: tmpl.limitations_sv ?? [],
      limitationsEn: tmpl.limitations_en ?? [],
    };
  });

export const getDevelopmentRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subjectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<DevelopmentRecommendation[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_development_recommendations", {
      _subject_id: data.subjectId,
    });
    // Throw rather than return [] -- an empty array is indistinguishable from
    // "no recommendations", which is how a missing RPC became a silent blank.
    if (error) throw fail(error.message, "recommendations_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      moduleVersionId: String(r.module_version_id),
      nameSv: String(r.module_name_sv),
      nameEn: String(r.module_name_en),
      summarySv: String(r.summary_sv),
      summaryEn: String(r.summary_en),
      estimatedMinutes: r.estimated_minutes ?? null,
      addressesSv: String(r.addresses_competency_sv),
      addressesEn: String(r.addresses_competency_en),
      maturityLevel: r.maturity_level as MaturityLevel,
    }));
  });

export const getSubjectProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subjectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ProgressRow[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_subject_progress", {
      _subject_id: data.subjectId,
    });
    if (error) throw fail(error.message, "progress_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      releasedAt: String(r.released_at),
      attemptId: String(r.attempt_id),
      competencyCode: String(r.competency_code),
      competencyNameSv: String(r.competency_name_sv),
      competencyNameEn: String(r.competency_name_en),
      evidenceState: r.evidence_state as EvidenceState,
      observations: Number(r.observations ?? 0),
      safetyFlagCount: Number(r.safety_flag_count ?? 0),
    }));
  });

/** The reviewer's queue, with the context needed to actually judge an answer.
 *
 *  Reads scp_review_queue, a SECURITY DEFINER function that opens with the
 *  same capability check the old security_invoker view relied on: without the
 *  content-review capability it returns zero rows, and that is still an
 *  authorisation boundary doing it rather than this file filtering.
 *
 *  It replaced the view because the reviewer needs the ORGANISATION, and a
 *  reviewer is deliberately not a member of any employer -- so the employer row
 *  is invisible to them and no invoker-rights join could ever supply it.
 *
 *  What comes back is scenario, prompt, assessment, governance and whether a
 *  severity is required. What does not come back is any scoring key, rubric
 *  weight or model rationale: those columns are absent from the function's
 *  return type, so this cannot leak one by forgetting to strip it. */
export const listReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ locale: z.enum(["sv", "en"]).default("sv") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_review_queue", {
      _language: data.locale === "en" ? "en-GB" : "sv-SE",
    });
    if (error) throw fail(error.message, "review_queue_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      reviewId: String(r.review_id),
      attemptId: String(r.attempt_id),
      triggerReason: String(r.trigger_reason),
      openedAt: String(r.opened_at),
      participantRef: String(r.participant_ref ?? ""),
      organisationName: r.organisation_name ? String(r.organisation_name) : null,
      assessmentName: r.assessment_name ? String(r.assessment_name) : null,
      assessmentSlug: r.assessment_slug ? String(r.assessment_slug) : null,
      governanceMode: r.governance_mode ? String(r.governance_mode) : null,
      validationStatus: r.validation_status_at_assignment
        ? String(r.validation_status_at_assignment)
        : null,
      purposeCode: r.purpose_code ? String(r.purpose_code) : null,
      itemDisplayOrder: r.item_display_order == null ? null : Number(r.item_display_order),
      itemScenario: r.item_scenario ? String(r.item_scenario) : null,
      itemPrompt: r.item_prompt ? String(r.item_prompt) : null,
      isSafetyCritical: Boolean(r.is_safety_critical),
      severityRequired: Boolean(r.severity_required),
      itemFormat: r.item_format ? String(r.item_format) : null,
      responseText: r.response_text ?? null,
      // Labels, not keys. See the migration header for why this distinction is
      // enforced in the function's return type rather than here.
      chosenLabel: r.chosen_label ? String(r.chosen_label) : null,
      chosenBestLabel: r.chosen_best_label ? String(r.chosen_best_label) : null,
      chosenWorstLabel: r.chosen_worst_label ? String(r.chosen_worst_label) : null,
      outstandingInAttempt: Number(r.outstanding_in_attempt ?? 0),
    }));
  });

export const completeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reviewId: z.string().uuid(),
        outcome: z.enum(["upheld", "adjusted", "overturned"]),
        rationale: z.string().min(1),
        contribution: z.number().min(0).max(1).default(0.5),
        // A safety-critical observation carries a severity, and only the
        // reviewer can supply it — scp_complete_human_review refuses without
        // one. Null for every other observation, where the same function
        // refuses a severity that was never asked for.
        safetySeverity: z.enum(["low", "medium", "high", "critical"]).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ evidenceId: string }> => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("scp_complete_human_review", {
      _review_id: data.reviewId,
      _outcome: data.outcome,
      _rationale: data.rationale,
      _contribution: data.contribution,
      _safety_severity: data.safetySeverity,
    });
    if (error) throw fail(error.message, "review_failed");
    return { evidenceId: String(id) };
  });
