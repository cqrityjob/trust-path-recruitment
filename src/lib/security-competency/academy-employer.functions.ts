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

export type CompetencyLine = {
  competencyCode: string;
  competencyNameSv: string;
  competencyNameEn: string;
  maturityLevel: MaturityLevel;
  observations: number;
};

export type ReportSnapshot = {
  id: string;
  attemptId: string;
  subjectId: string;
  audience: "participant" | "employer";
  releasedAt: string;
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
  maturityLevel: MaturityLevel;
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
      itemCount: Number(r.item_count ?? 0),
      minutesMin: r.target_minutes_min ?? null,
      minutesMax: r.target_minutes_max ?? null,
      purposeSv: r.programme_purpose_sv ?? null,
      purposeEn: r.programme_purpose_en ?? null,
      doesNotMeasureSv: r.does_not_measure_sv ?? [],
      doesNotMeasureEn: r.does_not_measure_en ?? [],
    }));
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
        governanceMode: String(r.governance_mode) as
          | "development"
          | "closed_test"
          | "recruitment",
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
        "id, attempt_id, subject_id, audience, released_at, payload, safety_flags, " +
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
      lines: (Array.isArray(row.payload) ? (row.payload as RpcRow[]) : []).map((x) => ({
        competencyCode: String(x.competency_code),
        competencyNameSv: String(x.competency_name_sv),
        competencyNameEn: String(x.competency_name_en),
        maturityLevel: x.maturity_level as MaturityLevel,
        observations: Number(x.observations ?? 0),
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
      maturityLevel: r.maturity_level as MaturityLevel,
      observations: Number(r.observations ?? 0),
      safetyFlagCount: Number(r.safety_flag_count ?? 0),
    }));
  });

/** The reviewer's queue. Reads scp_rm_review_queue, which is security_invoker:
 *  an employer without the content-review capability sees zero rows, and that
 *  is the RLS doing it rather than this file filtering. */
export const listReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("scp_rm_review_queue")
      .select("review_id, trigger_reason, review_status, opened_at, response_text, subject_id")
      .eq("review_status", "pending")
      .order("opened_at", { ascending: true });
    // The reviewer queue is security_invoker: zero rows is the CORRECT answer
    // for someone without the capability, so an empty result must stay empty.
    // A genuine failure is different and must surface.
    if (error) throw fail(error.message, "review_queue_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      reviewId: String(r.review_id),
      triggerReason: String(r.trigger_reason),
      openedAt: String(r.opened_at),
      responseText: r.response_text ?? null,
      subjectId: String(r.subject_id),
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
    });
    if (error) throw fail(error.message, "review_failed");
    return { evidenceId: String(id) };
  });
