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
/** One rubric dimension as a reviewer sees it.
 *
 *  Carries the criterion and all five level descriptors so the reviewer scores
 *  against the governed rubric rather than an impression of it, and
 *  `styleOnly` so the surface can say which dimension does not move the number.
 *  There is deliberately no score, key or rationale in this shape. */
export type RubricDimension = {
  dimension_key: string;
  name: string | null;
  criterion: string | null;
  style_only: boolean;
  levels: { level: number; descriptor: string | null }[] | null;
};

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
  /** Counted separately from evidenceObservations, and reported separately,
   *  because a self-description is not an observation. */
  selfReportObservations?: number;
  humanReviewOccurred?: boolean;
  /** Whether any reviewer actually FOUND a safety concern in this attempt.
   *  Distinct from humanReviewOccurred, and from the item having been
   *  classified safety-critical: with twelve safety-critical items, review
   *  happens for everybody, and telling every participant they raised a concern
   *  would make the one that matters invisible. */
  safetyConcernPresent?: boolean;
  reportKey?: string;
  reportVersion?: number;
  evidenceStateVersion?: string;
  thresholdVersion?: string;
  scoringModelVersion?: string;
};

/** How a person answered THIS assessment, on one competency.
 *
 *  A third axis, and the one a recruiter is actually asking about. It is not
 *  maturity (how much evidence exists across occasions) and it is not the
 *  evidence state (what may be claimed about a way of working); it is a
 *  description of the answers in one sitting, and every surface renders it
 *  labelled that way.
 *
 *  `limited` means too few tasks touched the area to say anything — never that
 *  the person lacks the ability. `mixed` is checked BEFORE the good bands in
 *  the derivation, so answers that differ sharply across comparable tasks read
 *  as mixed even when the average is high. */
export type AssessmentSignal = "strong" | "consistent" | "mixed" | "developing" | "limited";

/** What the person SAID about how they usually work. Never an observation.
 *
 *  `consistency: "varied"` means related answers pointed different ways. That
 *  is a prompt to ask about it in interview and nothing else: it is never a
 *  statement that anybody was untruthful, and the product has no vocabulary
 *  for that claim anywhere. */
export type SelfReportPattern =
  | "consistently_described"
  | "mostly_described"
  | "rarely_described"
  | "not_described";

export type BriefModule = {
  blockKey: string;
  nameSv: string;
  nameEn: string;
  asks: "what_you_would_do" | "how_you_usually_work" | "your_own_experience";
  items: number;
  answered: number;
};

export type ObservedArea = {
  areaCode: string;
  areaSv: string;
  areaEn: string;
  evidenceType: "observed";
  signal: AssessmentSignal;
  items: number;
  /** Kept so a surface can order strengths by how strongly they were shown.
   *  Never rendered as a number: it is not a score and there is no scale a
   *  reader could put it on. */
  mean: number;
  spread: number;
  evidenceState: EvidenceState;
  behaviourSv: string | null;
  behaviourEn: string | null;
  whySv: string;
  whyEn: string;
};

export type SelfReportedArea = {
  domainKey: string;
  domainSv: string;
  domainEn: string;
  areaCode: string;
  evidenceType: "self_reported";
  pattern: SelfReportPattern;
  consistency: "consistent" | "varied";
  items: number;
  mean?: number;
  spread?: number;
  whySv?: string;
  whyEn?: string;
};

export type InterviewGuideEntry = {
  areaCode: string;
  areaSv: string;
  areaEn: string;
  focus:
    | "explore_development"
    | "explore_self_report"
    | "explore_limited_evidence"
    | "confirm_strength";
  evidenceType: "observed" | "self_reported";
  whySv: string;
  whyEn: string;
  questionSv: string;
  questionEn: string;
  followupSv: string;
  followupEn: string;
  /** Guidance for the interviewer, and deliberately not a key: it carries no
   *  score and no preferred answer, and nothing reads an interview note back
   *  into the evidence ledger. */
  listenForSv: string[];
  listenForEn: string[];
};

/** The frozen brief. Employer briefs carry everything; participant briefs carry
 *  modules, what the person said about themselves, and coverage — and that is
 *  a genuine subset rather than a softened rewrite. */
export type ReportBrief = {
  briefVersion: string;
  signalVersion: string;
  audience: "employer" | "participant";
  modules: BriefModule[];
  observed: ObservedArea[];
  selfReported: SelfReportedArea[];
  interviewGuide: InterviewGuideEntry[];
  coverage: {
    observedObservations: number;
    selfReportObservations: number;
    evidenceContexts: number;
    reviewsTotal?: number;
    reviewsCompleted?: number;
  };
  /** Present only when at least a quarter of the run was answered in quick
   *  succession. A fact about the RUN, never a finding about the person — fast
   *  answering has many innocent explanations and the product must not turn a
   *  timestamp into a character claim. Carries its own denominator, because a
   *  bare count is unreadable. */
  pace: { rapidAnswers: number; answered: number } | null;
};

export type ReportSnapshot = {
  id: string;
  attemptId: string;
  subjectId: string;
  audience: "participant" | "employer";
  releasedAt: string;
  context: ReportContext | null;
  brief: ReportBrief | null;
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

/** The five states the product presents, normalised in the database from the
 *  two governed content_status vocabularies (assessment versions use one,
 *  programme and module versions another). Storage keeps the precision —
 *  `legal_review` and `cognitive_review` are different gates with different
 *  owners — and this is only what an employer is shown. */
export type LifecycleState =
  | "draft"
  | "internal_testing"
  | "under_review"
  | "published"
  | "retired";

/** One row of the durable Assessment & Training Library.
 *
 *  Deliberately ONE shape across both product types. `libraryKind` discriminates,
 *  and everything else is common, so the surface renders a single filterable
 *  list rather than two products that drift apart. */
export type ContentLibraryEntry = {
  libraryKind: "assessment" | "training";
  /** Assessment version id, or programme version id. The thing an assignment
   *  would pin, never the definition — history has to stay reproducible. */
  itemId: string;
  parentId: string;
  slug: string;
  nameSv: string;
  nameEn: string;
  summarySv: string | null;
  summaryEn: string | null;
  lifecycleState: LifecycleState;
  contentStatus: string;
  validationStatus: string;
  versionNumber: number;
  isTestFixture: boolean;
  ownerEmployerId: string | null;
  ownership: "cqrityjob" | "employer";
  assignable: boolean;
  /** Why not, when `assignable` is false. `training_delivery_pending` is honest
   *  rather than apologetic: the carrier does not exist yet, so the surface
   *  must not render a control that cannot work. */
  unassignableReason: string | null;
  governanceMode: "development" | "closed_test" | "recruitment" | null;
  itemCount: number;
  moduleCount: number;
  minutesMin: number | null;
  minutesMax: number | null;
  languages: string[];
  requiresHumanReview: boolean;
  targetRoleSv: string | null;
  targetRoleEn: string | null;
  competenciesSv: string[];
  competenciesEn: string[];
  doesNotMeasureSv: string[];
  doesNotMeasureEn: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  /** PRODUCT DESIGN INTENT, never a governance basis. An assessment can be
   *  designed for recruitment support and still be assignable only as a closed
   *  test — which is exactly the flagship's state — so a surface must render
   *  this BESIDE `governanceMode`, never instead of it. */
  designedFor: "competence_development" | "recruitment_support";
};

/** The durable content library for one organisation, across assessments and
 *  training alike.
 *
 *  Assignability is NOT decided here and is not decided in the client. The RPC
 *  asks scp_grant_permits_assignment — the same question scp_employer_assign
 *  asks — so the library can never advertise something the assign path would
 *  refuse. */
export const listContentLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerInput.parse(d))
  .handler(async ({ data, context }): Promise<ContentLibraryEntry[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_content_library", {
      _employer_id: data.employerId,
    });
    if (error) throw fail(error.message, "content_library_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      libraryKind: String(r.library_kind) as ContentLibraryEntry["libraryKind"],
      itemId: String(r.item_id),
      parentId: String(r.parent_id),
      slug: String(r.slug),
      nameSv: String(r.name_sv),
      nameEn: String(r.name_en),
      summarySv: r.summary_sv ?? null,
      summaryEn: r.summary_en ?? null,
      lifecycleState: String(r.lifecycle_state) as LifecycleState,
      contentStatus: String(r.content_status),
      validationStatus: String(r.validation_status),
      versionNumber: Number(r.version_number ?? 1),
      isTestFixture: Boolean(r.is_test_fixture),
      ownerEmployerId: r.owner_employer_id ?? null,
      ownership: String(r.ownership) as ContentLibraryEntry["ownership"],
      assignable: Boolean(r.assignable),
      unassignableReason: r.unassignable_reason ?? null,
      governanceMode: (r.governance_mode ?? null) as ContentLibraryEntry["governanceMode"],
      itemCount: Number(r.item_count ?? 0),
      moduleCount: Number(r.module_count ?? 0),
      minutesMin: r.minutes_min ?? null,
      minutesMax: r.minutes_max ?? null,
      languages: r.languages ?? [],
      requiresHumanReview: Boolean(r.requires_human_review),
      targetRoleSv: r.target_role_sv ?? null,
      targetRoleEn: r.target_role_en ?? null,
      competenciesSv: r.competencies_sv ?? [],
      competenciesEn: r.competencies_en ?? [],
      doesNotMeasureSv: r.does_not_measure_sv ?? [],
      doesNotMeasureEn: r.does_not_measure_en ?? [],
      publishedAt: r.published_at ?? null,
      updatedAt: r.updated_at ?? null,
      designedFor: (r.designed_for ??
        "competence_development") as ContentLibraryEntry["designedFor"],
    }));
  });

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

/** What became of the invitation mail. Never an error: the assignment stands
 *  regardless, and the employer is given a link to pass on either way.
 *
 *  `not_configured` is the honest state on a deployment with no mail provider
 *  set, and it is deliberately NOT reported as a failure — nothing broke, the
 *  copy-link is simply the delivery mechanism there. */
export type NotificationOutcome = "sent" | "not_configured" | "failed";

/** Where a governed assignment sends the participant.
 *
 *  /academy, not /invite/<token>. The governed path resolves the address to an
 *  existing account before it assigns anything (SCP_RECIPIENT_HAS_NO_ACCOUNT),
 *  so the person already has a way in and a token would only be a second,
 *  weaker credential for a door they can already open. Nothing about the
 *  assessment travels in the URL. */
async function academyDestination(): Promise<{ siteOrigin: string; academyUrl: string }> {
  const { SITE_ORIGIN } = await import("@/lib/job-intelligence/seo");
  const siteOrigin = process.env.PUBLIC_SITE_URL || SITE_ORIGIN;
  return { siteOrigin, academyUrl: `${siteOrigin}/academy` };
}

/** Best-effort invitation mail for a governed assignment.
 *
 *  Reuses send-invitation-email.server.ts unchanged. That module is inert
 *  without RESEND_API_KEY/RESEND_FROM_EMAIL, so on an unconfigured deployment
 *  this costs one branch and no network call.
 *
 *  Employer and programme names are read back from the database rather than
 *  taken from the caller. They are rendered into mail sent to a third party,
 *  and an employer-supplied string would be an easy way to put arbitrary words
 *  in front of a participant under CQrityjob's name.
 *
 *  Delivery status is NOT persisted. The legacy path records it on the
 *  assignment row through the service-role client; doing that here would mean
 *  introducing service-role use into the governed path for a status the
 *  employer is about to read on screen anyway. */
async function notifyParticipant(
  ctx: Ctx,
  p: {
    employerId: string;
    assessmentVersionId: string;
    assignmentId: string;
    recipientEmail: string;
    language: "sv" | "en";
    siteOrigin: string;
    academyUrl: string;
  },
): Promise<NotificationOutcome> {
  try {
    const [{ data: employer }, { data: assignment }, { data: library }] = await Promise.all([
      ctx.supabase.from("employers").select("name").eq("id", p.employerId).maybeSingle(),
      ctx.supabase
        .from("assessment_assignments")
        .select("expires_at")
        .eq("id", p.assignmentId)
        .maybeSingle(),
      ctx.supabase.rpc("scp_employer_library", { _employer_id: p.employerId }),
    ]);

    const entry = (library ?? []).find(
      (row: RpcRow) => String(row.assessment_version_id) === p.assessmentVersionId,
    ) as RpcRow | undefined;

    // If any of the three is missing the mail would carry a blank where a name
    // belongs. Sending that is worse than not sending: the employer still has
    // the link, and an unexplained message from an unnamed company is exactly
    // what a participant should ignore.
    if (!employer?.name || !entry) return "failed";

    const { sendInvitationEmail } = await import("@/lib/email/send-invitation-email.server");
    const result = await sendInvitationEmail({
      recipientEmail: p.recipientEmail,
      language: p.language,
      employerName: String(employer.name),
      assessmentNameSv: String(entry.name_sv),
      assessmentNameEn: String(entry.name_en),
      siteOrigin: p.siteOrigin,
      invitationUrl: p.academyUrl,
      expiresAt: String(assignment?.expires_at ?? ""),
      employerMessage: null,
    });

    if (result.ok) return "sent";
    return result.skipped ? "not_configured" : "failed";
  } catch (err) {
    // Anything at all — a missing table on a partially migrated environment, a
    // provider timeout, a bad response shape. The assignment is already made.
    console.error("[academy-employer] invitation notification failed", err);
    return "failed";
  }
}

export type TrainingStatusRow = {
  assignmentId: string;
  subjectId: string;
  programmeNameSv: string;
  programmeNameEn: string;
  versionNumber: number;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  modulesTotal: number;
  modulesCompleted: number;
  assignedAt: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  language: string;
  identityResolvable: boolean;
};

/** Assign one governed programme VERSION to one person.
 *
 *  The RPC resolves the processing purpose itself through
 *  scp_required_purpose_code, so this file never names a purpose and cannot
 *  select an unapproved one. Owner/admin, tenancy and published-target are all
 *  re-checked server-side. */
export const assignTrainingProgramme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        programVersionId: z.string().uuid(),
        recipientEmail: z.string().email(),
        deadline: z.string().nullable().default(null),
        language: z.enum(["sv", "en"]).default("sv"),
        message: z.string().max(2000).nullable().default(null),
        sourceDecisionId: z.string().uuid().nullable().default(null),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ assignmentId: string; subjectId: string; modulesSeeded: number }> => {
      const ctx = context as Ctx;
      const { data: rows, error } = await ctx.supabase.rpc("scp_assign_training", {
        _employer_id: data.employerId,
        _program_version_id: data.programVersionId,
        _recipient_email: data.recipientEmail,
        _language: data.language,
        _due_at: data.deadline,
        _message: data.message,
        _source_decision_id: data.sourceDecisionId,
      });
      if (error) throw fail(error.message, "assign_training_failed");
      const r = (Array.isArray(rows) ? rows[0] : rows) as RpcRow;
      return {
        assignmentId: String(r.assignment_id),
        subjectId: String(r.subject_id),
        modulesSeeded: Number(r.modules_seeded ?? 0),
      };
    },
  );

/** Status and progress only. The RPC returns no response, no answer and no
 *  identity -- `identityResolvable` says whether the employer could ask, not
 *  who the person is. */
export const listTrainingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerInput.parse(d))
  .handler(async ({ data, context }): Promise<TrainingStatusRow[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_training_status", {
      _employer_id: data.employerId,
    });
    if (error) throw fail(error.message, "training_status_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      assignmentId: String(r.assignment_id),
      subjectId: String(r.subject_id),
      programmeNameSv: String(r.programme_name_sv),
      programmeNameEn: String(r.programme_name_en),
      versionNumber: Number(r.version_number ?? 1),
      status: String(r.status) as TrainingStatusRow["status"],
      modulesTotal: Number(r.modules_total ?? 0),
      modulesCompleted: Number(r.modules_completed ?? 0),
      assignedAt: r.assigned_at ?? null,
      dueAt: r.due_at ?? null,
      startedAt: r.started_at ?? null,
      completedAt: r.completed_at ?? null,
      language: String(r.language ?? "sv"),
      identityResolvable: Boolean(r.identity_resolvable),
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
      /** Where the participant goes. Handed back so the employer always has a
       *  link to pass on by hand, whatever the mail provider did. */
      academyUrl: string;
      notification: NotificationOutcome;
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

      // The assignment now exists and is the durable fact. Telling the person
      // about it is a side effect, and a side effect may not undo it — so
      // everything below is best-effort and cannot throw.
      const { siteOrigin, academyUrl } = await academyDestination();
      const notification = await notifyParticipant(ctx, {
        employerId: data.employerId,
        assessmentVersionId: data.assessmentVersionId,
        assignmentId: String(r.assignment_id),
        recipientEmail: data.recipientEmail,
        language: data.language,
        siteOrigin,
        academyUrl,
      });

      // The basis is returned so the caller can label the assignment
      // truthfully. A closed-test pilot must never be presented as a
      // validated selection instrument.
      return {
        assignmentId: String(r.assignment_id),
        attemptId: String(r.attempt_id),
        governanceMode: String(r.governance_mode) as "development" | "closed_test" | "recruitment",
        academyUrl,
        notification,
      };
    },
  );

/** Withdraw a governed assignment that nobody has finished.
 *
 *  ── WHY THIS IS AN UPDATE AND NOT A DELETE ────────────────────────────
 *
 *  Everything that makes cancellation safe is already in the database, added by
 *  20260821090000. Writing `status = 'cancelled'` on the assignment fires
 *  scp_sync_assignment_terminal_status, which:
 *
 *    * refuses any status other than cancelled/expired on an SCP assignment
 *      (SCP_ASSIGNMENT_STATUS_MANAGED);
 *    * refuses when the assignment has no attempt, so a cancellation can never
 *      leave an orphan (SCP_ASSIGNMENT_LINEAGE_MISSING);
 *    * refuses when the attempt is anything other than in_progress, which is
 *      what stops a submitted, scored or released assessment being cosmetically
 *      withdrawn (SCP_ASSIGNMENT_NOT_CANCELLABLE);
 *    * otherwise moves the attempt to `abandoned`, whose own trigger clears
 *      scp_open so the participant may be assigned the programme again.
 *
 *  It abandons the attempt. It does not delete responses, evidence, reviews or
 *  governance lineage, and this function adds nothing that would: the employer
 *  role holds UPDATE on (status, cancelled_at) alone. What the person answered
 *  before the assignment was withdrawn remains on the record.
 *
 *  The status filter mirrors the legacy screen, but it is not the safeguard —
 *  an SCP assignment sits at 'invited' for its whole life because the SCP path
 *  never advances the legacy status column. The trigger is the safeguard, and
 *  it reads the attempt. */
export const cancelAcademyAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), assignmentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    const ctx = context as Ctx;
    // Owner/admin is enforced by assignments_employer_update (Phase 8.5A), not
    // here. The UI hides the control from a member so the database does not
    // have to be the one to say no.
    const { data: updated, error } = await ctx.supabase
      .from("assessment_assignments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.assignmentId)
      .eq("employer_id", data.employerId)
      .in("status", ["invited", "opened", "started"])
      .select("id")
      .maybeSingle();

    if (error) throw fail(error.message, "cancel_failed");
    // No row came back: either RLS refused (not owner/admin, or another
    // organisation's assignment) or it had already left the cancellable set.
    // Both are the same message to the employer, and neither is an oracle.
    if (!updated) throw new AcademyEmployerError("SCP_ASSIGNMENT_NOT_CANCELLABLE", "NO_ROW");
    return { cancelled: true };
  });

/** How many reviews are waiting for THIS reviewer, as a number and nothing else.
 *
 *  listReviewQueue returns the full queue — item scenarios, prompts and the
 *  participants' own words. That belongs on the reviewer's workspace and
 *  nowhere else. The site header needs a count, so this returns a count: the
 *  rows are read and discarded server-side and never enter the browser's cache
 *  on every page the reviewer happens to visit.
 *
 *  Not gated here. The queue is scoped in the database to the employers that
 *  have authorised this caller to review responses (#51), so somebody with no
 *  authorisation gets zero rows and therefore zero. */
export const countMyReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_review_queue", {
      _language: "sv-SE",
    });
    if (error) return 0;
    return (rows ?? []).length;
  });

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
    selfReportObservations: num("self_report_observations"),
    humanReviewOccurred:
      c.human_review_occurred == null ? undefined : Boolean(c.human_review_occurred),
    safetyConcernPresent:
      c.safety_concern_present == null ? undefined : Boolean(c.safety_concern_present),
    reportKey: str("report_key"),
    reportVersion: num("report_version"),
    evidenceStateVersion: str("evidence_state_version"),
    thresholdVersion: str("threshold_version"),
    scoringModelVersion: str("scoring_model_version"),
  };
}

/** snake_case jsonb to the camelCase the surfaces read, for the brief.
 *
 *  Returns null rather than an empty shell for a snapshot released before the
 *  brief existed. A surface that renders `brief === null` differently from
 *  `brief.observed.length === 0` is telling the truth about a historical
 *  report; one that cannot tell them apart would invent an empty brief for
 *  every report issued before this feature shipped. */
function mapBrief(b: RpcRow | null): ReportBrief | null {
  if (!b) return null;
  const arr = (k: string): RpcRow[] => (Array.isArray(b[k]) ? (b[k] as RpcRow[]) : []);
  const cov = (b.coverage ?? {}) as RpcRow;
  const pace = b.pace as RpcRow | null;
  return {
    briefVersion: String(b.brief_version ?? ""),
    signalVersion: String(b.signal_version ?? ""),
    audience: b.audience as ReportBrief["audience"],
    modules: arr("modules").map((m) => ({
      blockKey: String(m.block_key),
      nameSv: String(m.name_sv),
      nameEn: String(m.name_en),
      asks: m.asks as BriefModule["asks"],
      items: Number(m.items ?? 0),
      answered: Number(m.answered ?? 0),
    })),
    observed: arr("observed").map((o) => ({
      areaCode: String(o.area_code),
      areaSv: String(o.area_sv),
      areaEn: String(o.area_en),
      evidenceType: "observed",
      signal: o.signal as AssessmentSignal,
      items: Number(o.items ?? 0),
      mean: Number(o.mean ?? 0),
      spread: Number(o.spread ?? 0),
      evidenceState: o.evidence_state as EvidenceState,
      behaviourSv: o.behaviour_sv ? String(o.behaviour_sv) : null,
      behaviourEn: o.behaviour_en ? String(o.behaviour_en) : null,
      whySv: String(o.why_sv ?? ""),
      whyEn: String(o.why_en ?? ""),
    })),
    selfReported: arr("self_reported").map((r) => ({
      domainKey: String(r.domain_key),
      domainSv: String(r.domain_sv),
      domainEn: String(r.domain_en),
      areaCode: String(r.area_code),
      evidenceType: "self_reported",
      pattern: r.pattern as SelfReportPattern,
      consistency: r.consistency as SelfReportedArea["consistency"],
      items: Number(r.items ?? 0),
      // Absent from the participant brief by construction, so undefined here
      // rather than 0 — the surface renders what is present and omits the rest.
      mean: r.mean == null ? undefined : Number(r.mean),
      spread: r.spread == null ? undefined : Number(r.spread),
      whySv: r.why_sv == null ? undefined : String(r.why_sv),
      whyEn: r.why_en == null ? undefined : String(r.why_en),
    })),
    interviewGuide: arr("interview_guide").map((g) => ({
      areaCode: String(g.area_code),
      areaSv: String(g.area_sv),
      areaEn: String(g.area_en),
      focus: g.focus as InterviewGuideEntry["focus"],
      evidenceType: g.evidence_type as InterviewGuideEntry["evidenceType"],
      whySv: String(g.why_sv ?? ""),
      whyEn: String(g.why_en ?? ""),
      questionSv: String(g.question_sv ?? ""),
      questionEn: String(g.question_en ?? ""),
      followupSv: String(g.followup_sv ?? ""),
      followupEn: String(g.followup_en ?? ""),
      listenForSv: Array.isArray(g.listen_for_sv) ? (g.listen_for_sv as string[]) : [],
      listenForEn: Array.isArray(g.listen_for_en) ? (g.listen_for_en as string[]) : [],
    })),
    coverage: {
      observedObservations: Number(cov.observed_observations ?? 0),
      selfReportObservations: Number(cov.self_report_observations ?? 0),
      evidenceContexts: Number(cov.evidence_contexts ?? 0),
      reviewsTotal: cov.reviews_total == null ? undefined : Number(cov.reviews_total),
      reviewsCompleted: cov.reviews_completed == null ? undefined : Number(cov.reviews_completed),
    },
    pace: pace
      ? { rapidAnswers: Number(pace.rapid_answers ?? 0), answered: Number(pace.answered ?? 0) }
      : null,
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
        "id, attempt_id, subject_id, audience, released_at, payload, brief, safety_flags, context, " +
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
      brief: mapBrief(row.brief as RpcRow | null),
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
 *  Reads scp_review_queue, a SECURITY DEFINER function scoped to the employers
 *  that have authorised this caller to review responses, minus any attempt a
 *  separation-of-duties rule disqualifies them from (#51). Without an
 *  authorisation it returns zero rows -- an authorisation boundary doing it,
 *  rather than this file filtering.
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
      findingRequired: Boolean(r.finding_required),
      itemFormat: r.item_format ? String(r.item_format) : null,
      // Present only for a constructed response, and carrying dimensions,
      // criteria and level descriptors — never a score, a key or a rationale.
      rubric: (r.rubric ?? null) as RubricDimension[] | null,
      responseText: r.response_text ?? null,
      // Labels, not keys. See the migration header for why this distinction is
      // enforced in the function's return type rather than here.
      chosenLabel: r.chosen_label ? String(r.chosen_label) : null,
      chosenBestLabel: r.chosen_best_label ? String(r.chosen_best_label) : null,
      chosenWorstLabel: r.chosen_worst_label ? String(r.chosen_worst_label) : null,
      outstandingInAttempt: Number(r.outstanding_in_attempt ?? 0),
    }));
  });

/**
 * Complete a human review.
 *
 * ── THERE IS NO CONTRIBUTION HERE, AND THERE MUST NEVER BE ONE ──────────
 *
 * This input used to carry `contribution: z.number().default(0.5)`, and
 * ReviewQueue passed the literal 0.5. Thirteen of the eighteen Security Guard
 * items route to human review, so a constant was being written as the evidence
 * for most of a run, identically whether the reviewer upheld or overturned the
 * reading.
 *
 * The number is now derived server-side inside scp_complete_human_review from
 * the item's own governed scoring — and the parameter is gone from that
 * function's signature, so this cannot regress by someone re-adding a field
 * here. Deriving it there also keeps score_value and the best/worst keys out of
 * any reviewer payload.
 *
 * `evidenceId` is null when the outcome is adjusted or overturned: the reviewer
 * disputes the governed reading and there is no governed alternative, so the
 * review, its rationale and the response are kept and no contribution is
 * invented.
 */
export const completeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reviewId: z.string().uuid(),
        outcome: z.enum(["upheld", "adjusted", "overturned"]),
        rationale: z.string().min(1),
        // What the reviewer found in THIS response — not what category the item
        // was in. `no_concern` is a legitimate conclusion on a safety-critical
        // item, and is the expected one for a good answer. Null for an item
        // that is not safety-critical, where the same function refuses a
        // finding that was never asked for.
        safetyFinding: z
          .enum(["no_concern", "low", "medium", "high", "critical"])
          .nullable()
          .default(null),
        // One level 0-4 per rubric dimension, for a constructed response only.
        // The function refuses a partial set: a missing dimension is a
        // judgement the reviewer did not make.
        rubricLevels: z.record(z.string(), z.number().int().min(0).max(4)).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ evidenceId: string | null }> => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("scp_complete_human_review", {
      _review_id: data.reviewId,
      _outcome: data.outcome,
      _rationale: data.rationale,
      _safety_finding: data.safetyFinding,
      _rubric_levels: data.rubricLevels,
    });
    if (error) throw fail(error.message, "review_failed");
    return { evidenceId: id == null ? null : String(id) };
  });

/** What an interview established about one area of the brief.
 *
 *  Deliberately inert. Nothing here is aggregated, no outcome carries a weight,
 *  and no note is ever written into public.scp_competency_evidence — so a
 *  recruiter's reading of a conversation can never become platform-visible
 *  "competence" that follows the person to the next employer. It is a record of
 *  what was said, and it is not the employment decision: that stays in
 *  recordEmployerDecision, where a human makes it and signs it. */
export type InterviewNoteOutcome =
  | "evidence_confirmed"
  | "evidence_not_confirmed"
  | "additional_context";

export type InterviewNote = {
  id: string;
  areaCode: string;
  outcome: InterviewNoteOutcome;
  note: string | null;
  recordedByEmail: string;
  recordedAt: string;
};

export const listInterviewNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InterviewNote[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_interview_notes", {
      _attempt_id: data.attemptId,
    });
    if (error) throw fail(error.message, "interview_notes_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      id: String(r.id),
      areaCode: String(r.area_code),
      outcome: r.outcome as InterviewNoteOutcome,
      note: r.note ? String(r.note) : null,
      recordedByEmail: String(r.recorded_by_email ?? ""),
      recordedAt: String(r.recorded_at),
    }));
  });

export const recordInterviewNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        // Not a uuid: the brief is a frozen rendering, and an area code in it
        // has to stay resolvable even if the competency catalogue is later
        // reorganised. Bounded because it is written into an append-only row.
        areaCode: z.string().min(1).max(64),
        outcome: z.enum(["evidence_confirmed", "evidence_not_confirmed", "additional_context"]),
        // Bounded here as well as in the CHECK: free text about a person is the
        // riskiest field on the form, and the limit should be visible to
        // whoever reads this file rather than only to the database.
        note: z.string().max(1000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ noteId: string }> => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("scp_record_interview_note", {
      _attempt_id: data.attemptId,
      _area_code: data.areaCode,
      _outcome: data.outcome,
      _note: data.note ?? undefined,
    });
    if (error) throw fail(error.message, "interview_note_failed");
    return { noteId: String(id) };
  });
