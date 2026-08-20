import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// #51 — Three surfaces, one lifecycle.
//
// The employer Tests pipeline, Medarbetare > Person > Tester & bedömningar and
// the participant's own history are three projections of the same assignment,
// attempt and report objects. Each one here is a thin pass-through over the
// governed read model that already derives the state in SQL
// (scp_attempt_lifecycle_state).
//
// Nothing in this file decides a status, and nothing decides whether a report
// may be opened. Both are security-sensitive, and reconstructing them in
// TypeScript is how two surfaces end up telling the same person different
// things about the same attempt.
//
// ── ON NAMES ──────────────────────────────────────────────────────────
//
// The pipeline stays pseudonymous by default, matching the participants view:
// a participant is a subject reference, not a name. The one exception is a row
// whose assignment names an EMPLOYMENT record, where the name comes from the
// employer's own employees table -- data the employer authored about its own
// staff. That is not a disclosure, and it is what lets a workforce row link to
// that person's profile. Rows without an employment record stay anonymous.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

/** The product's lifecycle vocabulary. Derived once, in SQL. */
export type LifecycleState =
  | "invited"
  | "in_progress"
  | "under_review"
  | "processing"
  | "ready_to_release"
  | "result_available"
  | "abandoned";

export type PipelineRow = {
  attemptId: string;
  assignmentId: string | null;
  subjectId: string;
  employeeId: string | null;
  participantRef: string;
  participantName: string | null;
  assessmentSlug: string | null;
  assessmentNameSv: string | null;
  assessmentNameEn: string | null;
  purposeCode: string | null;
  useCase: "workforce" | "recruitment";
  governanceMode: string | null;
  lifecycleState: LifecycleState;
  invitedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  scoredAt: string | null;
  releasedAt: string | null;
  deadline: string | null;
  answered: number;
  totalItems: number;
  reviewsTotal: number;
  reviewsOpen: number;
  /** Identity may only be resolved once the result has been released. */
  identityResolvable: boolean;
  canRelease: boolean;
};

const mapPipeline = (r: Record<string, unknown>): PipelineRow => ({
  attemptId: r.attempt_id as string,
  assignmentId: (r.assignment_id as string | null) ?? null,
  subjectId: r.subject_id as string,
  employeeId: (r.employee_id as string | null) ?? null,
  participantRef: r.participant_ref as string,
  participantName: (r.participant_name as string | null) ?? null,
  assessmentSlug: (r.assessment_slug as string | null) ?? null,
  assessmentNameSv: (r.assessment_name_sv as string | null) ?? null,
  assessmentNameEn: (r.assessment_name_en as string | null) ?? null,
  purposeCode: (r.purpose_code as string | null) ?? null,
  useCase: (r.use_case as PipelineRow["useCase"]) ?? "workforce",
  governanceMode: (r.governance_mode as string | null) ?? null,
  lifecycleState: r.lifecycle_state as LifecycleState,
  invitedAt: (r.invited_at as string | null) ?? null,
  startedAt: (r.started_at as string | null) ?? null,
  submittedAt: (r.submitted_at as string | null) ?? null,
  scoredAt: (r.scored_at as string | null) ?? null,
  releasedAt: (r.released_at as string | null) ?? null,
  deadline: (r.deadline as string | null) ?? null,
  answered: Number(r.answered ?? 0),
  totalItems: Number(r.total_items ?? 0),
  reviewsTotal: Number(r.reviews_total ?? 0),
  reviewsOpen: Number(r.reviews_open ?? 0),
  identityResolvable: Boolean(r.identity_resolvable),
  canRelease: Boolean(r.can_release),
});

export const getEmployerAssessmentPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PipelineRow[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_assessment_pipeline", {
      _employer_id: data.employerId,
    });
    if (error) throw new Error("Could not load the assessment pipeline.");
    return (rows ?? []).map(mapPipeline);
  });

export type PersonAssessmentRow = {
  attemptId: string;
  assessmentSlug: string | null;
  assessmentNameSv: string | null;
  assessmentNameEn: string | null;
  purposeCode: string | null;
  useCase: "workforce" | "recruitment";
  lifecycleState: LifecycleState;
  assignedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  scoredAt: string | null;
  releasedAt: string | null;
  reviewsTotal: number;
  reviewsOpen: number;
  employerSnapshotId: string | null;
};

export const getPersonAssessments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), employeeId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PersonAssessmentRow[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_person_assessments", {
      _employer_id: data.employerId,
      _employee_id: data.employeeId,
    });
    if (error) throw new Error("Could not load this person's assessments.");
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      attemptId: r.attempt_id as string,
      assessmentSlug: (r.assessment_slug as string | null) ?? null,
      assessmentNameSv: (r.assessment_name_sv as string | null) ?? null,
      assessmentNameEn: (r.assessment_name_en as string | null) ?? null,
      purposeCode: (r.purpose_code as string | null) ?? null,
      useCase: (r.use_case as PersonAssessmentRow["useCase"]) ?? "workforce",
      lifecycleState: r.lifecycle_state as LifecycleState,
      assignedAt: (r.assigned_at as string | null) ?? null,
      startedAt: (r.started_at as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
      scoredAt: (r.scored_at as string | null) ?? null,
      releasedAt: (r.released_at as string | null) ?? null,
      reviewsTotal: Number(r.reviews_total ?? 0),
      reviewsOpen: Number(r.reviews_open ?? 0),
      employerSnapshotId: (r.employer_snapshot_id as string | null) ?? null,
    }));
  });

export type MyAssessmentRow = {
  attemptId: string;
  assessmentSlug: string | null;
  assessmentNameSv: string | null;
  assessmentNameEn: string | null;
  issuerName: string | null;
  purposeCode: string | null;
  useCase: "workforce" | "recruitment";
  lifecycleState: LifecycleState;
  invitedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  releasedAt: string | null;
  participantSnapshotId: string | null;
};

// The participant's own history, across every organisation that has assessed
// them. That breadth is correct and is the participant's, not any employer's:
// each employer sees only its own context, while the person sees their whole
// professional record.
export const getMyAssessmentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAssessmentRow[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_my_assessment_history");
    if (error) throw new Error("Could not load your assessments.");
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      attemptId: r.attempt_id as string,
      assessmentSlug: (r.assessment_slug as string | null) ?? null,
      assessmentNameSv: (r.assessment_name_sv as string | null) ?? null,
      assessmentNameEn: (r.assessment_name_en as string | null) ?? null,
      issuerName: (r.issuer_name as string | null) ?? null,
      purposeCode: (r.purpose_code as string | null) ?? null,
      useCase: (r.use_case as MyAssessmentRow["useCase"]) ?? "workforce",
      lifecycleState: r.lifecycle_state as LifecycleState,
      invitedAt: (r.invited_at as string | null) ?? null,
      startedAt: (r.started_at as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
      releasedAt: (r.released_at as string | null) ?? null,
      participantSnapshotId: (r.participant_snapshot_id as string | null) ?? null,
    }));
  });
