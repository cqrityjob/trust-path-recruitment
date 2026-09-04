// The Interview Context Bridge — the read.
//
// One server function, `getInterviewCaseContext`, which answers: for this
// interview case, what does CQrityjob already hold that the person conducting
// it is entitled to see?
//
// ── WHY THERE IS NO NEW TABLE AND NO NEW RPC ────────────────────────────
//
// Every source this reads already exists, is already employer-scoped, and is
// already the authoritative record of its own fact:
//
//   scp_interview_cases          the case, and the application/job it names
//   scp_application_candidate    the application, its job and its cover note
//   jobs                         the advert's structured requirements
//   getApplicationSubmittedCv    the CV copy frozen onto the application
//   scp_application_assessments  which assessments exist for this application
//   scp_report_snapshots         the RELEASED employer brief, and only that
//
// A context table beside them would be a second copy of six authoritative
// records, kept in step by nothing. The join is the feature; the storage would
// be the bug.
//
// ── THE AUTHORISATION ARGUMENT ──────────────────────────────────────────
//
// This function holds no service-role client and performs no membership check
// of its own. It does not need one, and writing one would be the weaker
// design: the case read runs under the caller's RLS, so a case belonging to
// another employer is NOT FOUND rather than forbidden, and every subsequent
// read is keyed by ids taken from that row — never from the request.
//
// So the chain is: the caller can see the case, or nothing happens at all.
// Each downstream read then re-checks membership in its own right —
// scp_application_candidate returns no row to a non-member,
// getApplicationSubmittedCv asserts workspace membership, and
// scp_report_snapshots' RLS admits only `audience = 'employer'` rows issued by
// an organisation the caller actively belongs to. A hand-edited caseId cannot
// reach another tenant's application because the applicationId is never taken
// from the caller.
//
// ── WHAT IS DELIBERATELY NOT READ ───────────────────────────────────────
//
// Reviewer-internal notes, attempt scoring internals, derivation_input, the
// candidate's own title for their CV, cv_documents (there is no employer read
// policy on it and this does not become the exception), Passport claims not
// disclosed to this application, and any assessment whose report has not been
// released. None of those appear below, which is why none of them can leak.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getApplicationSubmittedCv } from "@/lib/job-intelligence/applications.functions";
import {
  buildInterviewContext,
  normaliseRequirements,
  unlinkedContext,
  type ContextAssessmentInput,
  type ContextCvInput,
  type ContextJobInput,
  type CvPresence,
  type InterviewContext,
} from "./context";

const caseInput = z.object({ caseId: z.string().uuid() });

type Row = Record<string, unknown>;

/** The caller's own RLS-scoped client, exactly as `requireSupabaseAuth` builds
 *  it. Named so the helpers below cannot be handed a service-role client by a
 *  later refactor without the type changing in plain sight. */
type Db = SupabaseClient<Database>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/**
 * Everything the interview is entitled to inherit from its application.
 *
 * Returns an UNLINKED context rather than throwing when the case names no
 * application. That is a real and supported case — an employer interviewing
 * for a role with no advert — and it renders as a stated absence, not an
 * error.
 *
 * Each enrichment is best-effort in exactly the way the candidate page's
 * timeline is: losing the assessment brief must not cost the recruiter the
 * role requirements as well. A failure is logged and its section comes back
 * empty; the surface then says that section is unavailable, which is true,
 * rather than saying there is nothing there, which would not be.
 */
export const getInterviewCaseContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<InterviewContext> => {
    const db = context.supabase;

    // THE GATE. RLS answers this, so "not yours" and "not there" are the same
    // answer and neither confirms the case exists.
    const caseRes = await db
      .from("scp_interview_cases")
      .select("id, employer_id, application_id, job_id, candidate_display_name")
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseRes.error) throw new Error(caseRes.error.message);
    if (!caseRes.data) throw new Error("INTERVIEW_CASE_NOT_FOUND");

    const c = caseRes.data as Row;
    const candidateName = String(c.candidate_display_name ?? "");
    const applicationId = str(c.application_id);
    const employerId = String(c.employer_id);

    if (!applicationId) return unlinkedContext(candidateName);

    // ── The application ────────────────────────────────────────────────
    const { data: appRows, error: appErr } = await db.rpc("scp_application_candidate", {
      _application_id: applicationId,
    });
    if (appErr) throw new Error(appErr.message);
    const a = (Array.isArray(appRows) ? appRows[0] : appRows) as Row | undefined;
    // The case says it has an application and the application read says
    // otherwise. That is a link to a row this caller may not read (or one that
    // has since been deleted), and the honest answer is the unlinked context —
    // not a partly-filled one implying we know more than we do.
    if (!a) return unlinkedContext(candidateName);

    const application = {
      status: String(a.application_status ?? ""),
      appliedAt: String(a.applied_at ?? ""),
      coverNote: str(a.cover_note),
      jobTitleSv: str(a.job_title_sv),
      jobTitleEn: str(a.job_title_en),
    };

    // The job id is taken from the APPLICATION, not from the case row and
    // never from the request. An application cannot name another employer's
    // job, so this is the reference that cannot be steered.
    const jobId = str(a.job_id);

    const [job, cv, assessment] = await Promise.all([
      readJob(db, jobId, employerId),
      readCv(applicationId),
      readAssessment(db, applicationId),
    ]);

    return buildInterviewContext({
      candidateName,
      application,
      job,
      cv,
      assessment: assessment.brief,
      assessmentPending: assessment.pending,
    });
  });

/* ------------------------------------------------------------------ */
/* Starting an interview from an application                           */
/* ------------------------------------------------------------------ */

export interface ApplicationInterviewStart {
  /** The applicant's name, as the employer already knows it. Null when the
   *  application has no profile behind it, in which case the recruiter types
   *  a reference as before. */
  readonly candidateName: string | null;
  readonly roleSv: string | null;
  readonly roleEn: string | null;
  /** Taken from the APPLICATION rather than from the URL, so the job a case
   *  pins is the job the candidate actually applied to. */
  readonly jobId: string | null;
}

/**
 * What the new-interview form should already contain when it was opened from
 * an application.
 *
 * The recruiter retyping a name they were just shown is not only friction: a
 * typo produces an interview case that reads as a different person from the
 * application it is attached to, and the case is the record. Prefilling from
 * the authoritative row is the only way the two can agree.
 *
 * The field stays EDITABLE. `candidate_display_name` is what the interview is
 * filed under, and a recruiter may legitimately need "Anna S. (andra
 * intervjun)" — this fills the form in, it does not take it over.
 *
 * Returns nulls rather than throwing when the application cannot be read. A
 * prefill that fails should cost the recruiter a few keystrokes, never the
 * ability to start the interview.
 */
export const getApplicationInterviewStart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<ApplicationInterviewStart> => {
    const empty: ApplicationInterviewStart = {
      candidateName: null,
      roleSv: null,
      roleEn: null,
      jobId: null,
    };
    // Membership is checked inside scp_application_candidate, which returns no
    // row to a non-member. An applicationId typed into the URL by somebody
    // from another organisation therefore prefills nothing — and the create
    // call would refuse it a second time with SCP_IV_CROSS_TENANT_APPLICATION.
    const { data: rows, error } = await context.supabase.rpc("scp_application_candidate", {
      _application_id: data.applicationId,
    });
    if (error) {
      console.error("[interview-context] application prefill unavailable", error);
      return empty;
    }
    const a = (Array.isArray(rows) ? rows[0] : rows) as Row | undefined;
    if (!a) return empty;
    return {
      candidateName: str(a.display_name),
      roleSv: str(a.job_title_sv),
      roleEn: str(a.job_title_en),
      jobId: str(a.job_id),
    };
  });

/* ------------------------------------------------------------------ */
/* The advert                                                          */
/* ------------------------------------------------------------------ */

/** The role's own requirements, from the existing `jobs` columns.
 *
 *  `employer_id` is in the filter as well as the id. RLS on `jobs` already
 *  scopes this, and the redundancy is deliberate: a policy loosened later for
 *  a public job board must not silently widen what an interview inherits. */
async function readJob(
  db: Db,
  jobId: string | null,
  employerId: string,
): Promise<ContextJobInput | null> {
  if (!jobId) return null;
  const { data, error } = await db
    .from("jobs")
    .select(
      "title_sv, title_en, requirements, formal_requirement_ids, language_requirements, " +
        "experience_level, regulated, security_vetting_mentioned, driving_licence_required",
    )
    .eq("id", jobId)
    .eq("employer_id", employerId)
    .maybeSingle();
  if (error) {
    console.error("[interview-context] job requirements unavailable", error);
    return null;
  }
  if (!data) return null;
  // `jobs` is not in the generated Database types as a selectable shape this
  // narrow, so the typed client widens the result rather than describing it.
  // Through `unknown`, because the two types genuinely do not overlap and a
  // direct assertion would be the compiler agreeing to something untrue.
  const j = data as unknown as Row;
  return {
    titleSv: str(j.title_sv),
    titleEn: str(j.title_en),
    requirements: normaliseRequirements(j.requirements),
    formalRequirements: strArray(j.formal_requirement_ids),
    languageRequirements: strArray(j.language_requirements),
    experienceLevel: str(j.experience_level),
    regulated: Boolean(j.regulated),
    securityVettingMentioned: Boolean(j.security_vetting_mentioned),
    drivingLicenceRequired: Boolean(j.driving_licence_required),
  };
}

/* ------------------------------------------------------------------ */
/* The CV the application was submitted with                           */
/* ------------------------------------------------------------------ */

/** Reuses the employer's existing, already-authorised read rather than
 *  reaching for the column directly, so the CV the interview shows and the CV
 *  the application page shows can never disagree — and the omissions that read
 *  makes (the candidate's private title for the document above all) hold here
 *  without being restated. */
async function readCv(applicationId: string): Promise<ContextCvInput | null> {
  try {
    const submitted = await getApplicationSubmittedCv({ data: { applicationId } });
    const presence: CvPresence = submitted.unreadable
      ? "unreadable"
      : submitted.source === "cqrityjob_cv"
        ? "cqrityjob_cv"
        : "external";
    return {
      presence,
      submittedAt: submitted.submittedAt,
      document: submitted.document,
    };
  } catch (err) {
    console.error("[interview-context] submitted CV unavailable", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The released assessment brief                                       */
/* ------------------------------------------------------------------ */

/** The employer brief for this application's assessment, when one has been
 *  released.
 *
 *  RELEASE IS THE GATE, and it is structural rather than conditional: an
 *  employer-audience snapshot row only comes into existence when
 *  scp_release_attempt_report runs. There is no branch here that could be
 *  written the wrong way round, because an unreleased assessment has no row to
 *  return. What the attempt list contributes is only the knowledge that one is
 *  on its way, which is why `pending` is derived from it and the brief is not. */
async function readAssessment(
  db: Db,
  applicationId: string,
): Promise<{ brief: ContextAssessmentInput | null; pending: boolean }> {
  const { data: rows, error } = await db.rpc("scp_application_assessments", {
    _application_id: applicationId,
  });
  if (error) {
    console.error("[interview-context] application assessments unavailable", error);
    return { brief: null, pending: false };
  }

  const attempts = (Array.isArray(rows) ? rows : []) as Row[];
  if (attempts.length === 0) return { brief: null, pending: false };

  // Newest released attempt. `released_at` rather than `report_available`,
  // because the snapshot's existence is what this read depends on.
  const released = attempts
    .filter((r) => str(r.released_at) !== null)
    .sort((x, y) => String(y.released_at).localeCompare(String(x.released_at)));

  const pending = released.length === 0;
  const attemptId = str(released[0]?.attempt_id);
  if (!attemptId) return { brief: null, pending };

  // The employer read contract (scp_employer_report, 20261024090000): the
  // released employer document, already stripped of everything internal --
  // no derivation_input, no mean/spread on an area, no behaviour id on a
  // finding. The snapshot table refuses this role outright (20261025090000),
  // so there is no direct read to narrow. What arrives is the employer's own
  // report; what is CARRIED from it is still only `released_at` and the
  // parts of `brief` this briefing has a use for, below.
  const { data: docs, error: snapErr } = await db.rpc("scp_employer_report", {
    _attempt_id: attemptId,
  });
  if (snapErr) {
    console.error("[interview-context] released brief unavailable", snapErr);
    return { brief: null, pending };
  }
  // The entry point returns nothing for a snapshot issued by another
  // organisation, and "released to somebody else" is correctly
  // indistinguishable from "not released" here.
  const snap = (Array.isArray(docs) ? docs[0] : undefined) as Row | undefined;
  if (!snap) return { brief: null, pending };

  const b = ((snap as Row).brief ?? null) as Row | null;
  // An employer-audience snapshot with no brief predates 20260830093000. The
  // competency report still exists and the employer can still read it on the
  // assessment page; this briefing simply has nothing governed to show, and
  // says so rather than assembling something out of the older payload.
  if (!b) return { brief: null, pending };

  const observedRows = Array.isArray(b.observed) ? (b.observed as Row[]) : [];
  // `interview_guide` is the brief's own ordered selection of PUBLISHED
  // prompts. Taken as it comes: the ORDER BY guide_order in
  // scp_release_attempt_report is a product decision about how a recruiter
  // should spend the hour, and re-sorting it here would quietly overrule it.
  const guideRows = Array.isArray(b.interview_guide) ? (b.interview_guide as Row[]) : [];

  return {
    pending: false,
    brief: {
      releasedAt: String((snap as Row).released_at ?? ""),
      observed: observedRows.map((o) => ({
        areaSv: String(o.area_sv ?? ""),
        areaEn: String(o.area_en ?? o.area_sv ?? ""),
        signal: String(o.signal ?? ""),
        behaviourSv: str(o.behaviour_sv),
        behaviourEn: str(o.behaviour_en),
      })),
      // `question_sv` and `listen_for_sv` are deliberately NOT carried across.
      //
      // `question_sv` is the assessment product's own MAIN interview question,
      // and this screen belongs to a pinned governed pack whose Q1–Q8 are the
      // questions being asked. Carrying it would make the recruiter choose
      // between two authorities on what to ask, which is exactly the
      // methodology drift the pinned pack exists to prevent. `listen_for_sv`
      // is scoring guidance for that question and is meaningless without it.
      // Both remain available, unchanged, on the assessment report.
      //
      // `followup_sv` DOES cross over, because the instruction is to reuse the
      // contextual follow-up suggestions that already exist rather than invent
      // any. It is rendered subordinate to the area it belongs to and labelled
      // as the assessment's suggestion, so it reads as a prompt the recruiter
      // may use inside the governed structure rather than instead of it.
      guide: guideRows.map((g) => ({
        areaCode: String(g.area_code ?? ""),
        areaSv: String(g.area_sv ?? ""),
        areaEn: String(g.area_en ?? g.area_sv ?? ""),
        focus: String(g.focus ?? ""),
        whySv: String(g.why_sv ?? ""),
        whyEn: String(g.why_en ?? g.why_sv ?? ""),
        followupSv: String(g.followup_sv ?? ""),
        followupEn: String(g.followup_en ?? g.followup_sv ?? ""),
      })),
    },
  };
}
