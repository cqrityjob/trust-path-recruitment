// One job's recruitment pipeline, as a pure projection.
//
// ── WHY THE JOB NEEDED THIS ─────────────────────────────────────────────
//
// The audit put it plainly: the job is not a recruitment container. The page
// listed everyone who had applied, grouped by status, and answered none of the
// questions a recruiter actually opens a vacancy to ask -- how many are there,
// how many am I late on, how many are being assessed, how many have I got as
// far as interviewing, and what do I do next. Every number was already
// computed somewhere else in the product; none was shown here.
//
// So this module counts. It is a PROJECTION in the same sense as
// process-projection.ts and under the same rules:
//
//   * pure -- no I/O, no clock, no randomness, no React
//   * every number is a count of rows the caller already fetched
//   * a read that did not succeed is NEVER a zero
//
// ── THE RULE THAT MATTERS MOST ──────────────────────────────────────────
//
// `null` means "not known", `0` means "none". They are different sentences and
// this codebase has shipped the bug of collapsing them: a failed read rendered
// as a confident zero tells a recruiter nobody has applied to their
// advertisement. There is no path below that turns a failed read into a
// number, and `StageCount` has no representation for "zero because something
// broke".
//
// ── WHAT IS DELIBERATELY NOT COUNTED ────────────────────────────────────
//
// Nothing about a person, nothing derived from an assessment SCORE, no
// conversion rate, no time-to-hire, no "quality of applicants". The stages are
// `job_applications.status` as it already is, plus one fact about whether an
// assessment exists and has finished -- which is a process fact, not a
// judgement.

import type { ApplicationStatus } from "@/lib/job-intelligence/applications.functions";
import type { LifecycleState } from "@/lib/security-competency/assessment-lifecycle.functions";

/** How a read went, kept apart from what it found. Same three words the
 *  process projection uses, for the same reason. */
export type PipelineRead = "loading" | "ready" | "failed";

/** One number, or an honest absence of one.
 *
 *  `value: null` is the only way this module can say "we do not know", and the
 *  component draws a dash and names the reason rather than a zero. */
export interface StageCount {
  readonly value: number | null;
  readonly read: PipelineRead;
}

/** The stages, in the order a recruitment moves through them. */
export type JobPipelineStage =
  | "total"
  | "awaitingReview"
  | "assessmentOpen"
  | "interview"
  | "hired";

/** Which application statuses each stage counts. `total` counts every
 *  application the job has ever received, including closed outcomes: a
 *  vacancy's total is not a measure of who is still in play, and the stages
 *  beside it already say who is. */
const STAGE_STATUSES: Record<
  Exclude<JobPipelineStage, "assessmentOpen" | "total">,
  ApplicationStatus[]
> = {
  awaitingReview: ["submitted"],
  interview: ["interview"],
  hired: ["hired"],
};

/**
 * Whether an assessment lifecycle state is still OPEN — an assessment exists
 * and has not yet produced a released result.
 *
 * `abandoned` is not open: the attempt was withdrawn and nobody owes it
 * anything. `result_available` is not open: the outcome is in, and the
 * recruiter's next move is on the candidate's own page.
 *
 * It says nothing about what the assessment found. This module never reads a
 * score, a maturity or a review verdict, and there is no parameter here
 * through which one could arrive.
 */
export function assessmentIsOpen(state: LifecycleState): boolean {
  return (
    state === "invited" ||
    state === "in_progress" ||
    state === "under_review" ||
    state === "processing" ||
    state === "ready_to_release"
  );
}

/** What the caller hands in: rows it already fetched, and how each read went. */
export interface JobPipelineInput {
  readonly applicationsRead: PipelineRead;
  /** This job's applications, already scoped to the job by the server. */
  readonly applications: readonly { readonly id: string; readonly status: ApplicationStatus }[];
  /**
   * The assessment read is SEPARATE, and its failure is separate too.
   *
   * It is assembled from two employer-wide reads the product already makes --
   * the governed assessment pipeline, and the assignment-to-application
   * mapping -- so the job page adds no new read model and no migration. When
   * either of them fails, the assessment number is unknown and the other four
   * are still true; collapsing the two reads into one state would throw away
   * four good numbers because of a fifth.
   */
  readonly assessmentRead: PipelineRead;
  /** Application ids with an assessment still open, from that pair of reads. */
  readonly applicationsWithOpenAssessment: ReadonlySet<string>;
}

export interface JobPipeline {
  readonly counts: Record<JobPipelineStage, StageCount>;
  readonly nextAction: JobNextAction;
}

/**
 * The one thing to do about this vacancy.
 *
 * Operational only, exactly like the candidate spine's: every member names a
 * quantity of work and where it is done. There is deliberately no member that
 * says anything about the applicants — no "strong field", no "few qualified
 * candidates", no ranking and no recommendation to close, extend or re-post.
 */
export type JobNextActionKind =
  | "loading"
  /** The applications could not be read, so no action is proposed: one built
   *  on a partial picture might be the wrong one. */
  | "unavailable"
  | "reviewNewApplications"
  | "awaitAssessments"
  | "prepareInterviews"
  /** Published, readable, and nobody has applied. A statement, not a task. */
  | "noApplicationsYet"
  /** The advertisement is not live, so there is nothing for it to receive. */
  | "notPublished"
  | "nothingOutstanding";

export interface JobNextAction {
  readonly kind: JobNextActionKind;
  /** The number the sentence is about, when it is about one. */
  readonly count: number;
  /** Which stage the action opens. Null where the honest answer is a
   *  sentence: loading, unavailable, and the three statements. */
  readonly stage: JobPipelineStage | null;
}

function count(read: PipelineRead, value: number): StageCount {
  return { read, value: read === "ready" ? value : null };
}

/**
 * The whole pipeline, in one deterministic pass.
 *
 * `jobStatus` is passed through untouched and is read for exactly one thing:
 * telling "nobody has applied yet" apart from "this advertisement is not live,
 * so nobody could have". Those are different sentences and only one of them is
 * about the employer's own vacancy.
 */
export function projectJobPipeline(
  input: JobPipelineInput & { readonly jobStatus: string },
): JobPipeline {
  const r = input.applicationsRead;
  const rows = r === "ready" ? input.applications : [];

  const inStatuses = (statuses: readonly ApplicationStatus[]) =>
    rows.filter((a) => statuses.includes(a.status)).length;

  const assessmentOpen =
    input.assessmentRead === "ready"
      ? rows.filter((a) => input.applicationsWithOpenAssessment.has(a.id)).length
      : 0;

  const counts: Record<JobPipelineStage, StageCount> = {
    total: count(r, rows.length),
    awaitingReview: count(r, inStatuses(STAGE_STATUSES.awaitingReview)),
    // Two reads, so the WORSE of the two: a number derived from a failed read
    // is not a number, even if the rows it filtered arrived fine.
    assessmentOpen: count(r === "ready" ? input.assessmentRead : r, assessmentOpen),
    interview: count(r, inStatuses(STAGE_STATUSES.interview)),
    hired: count(r, inStatuses(STAGE_STATUSES.hired)),
  };

  return { counts, nextAction: deriveJobNextAction(counts, input.jobStatus) };
}

/** The vacancy's stage counts as the database counted them (rec_job_counts):
 *  the whole vacancy, however many applied, without the rows. */
export interface JobPipelineCounts {
  readonly total: number;
  readonly awaitingReview: number;
  readonly interview: number;
  readonly hired: number;
}

/**
 * The same pipeline, projected from counts the database made rather than
 * from rows the browser was handed. The case page reads ONE page of
 * candidates; the numbers on its chips must still be about the whole
 * vacancy, so they come from a count, not from the page.
 *
 * `assessmentOpen` is the number of THIS vacancy's applications with an
 * assessment still open, from the assessment read scoped to the job.
 */
export function projectJobPipelineFromCounts(input: {
  readonly jobStatus: string;
  readonly applicationsRead: PipelineRead;
  readonly counts: JobPipelineCounts | null;
  readonly assessmentRead: PipelineRead;
  readonly assessmentOpen: number;
}): JobPipeline {
  const r = input.applicationsRead;
  const c =
    r === "ready" && input.counts
      ? input.counts
      : { total: 0, awaitingReview: 0, interview: 0, hired: 0 };
  const counts: Record<JobPipelineStage, StageCount> = {
    total: count(r, c.total),
    awaitingReview: count(r, c.awaitingReview),
    assessmentOpen: count(r === "ready" ? input.assessmentRead : r, input.assessmentOpen),
    interview: count(r, c.interview),
    hired: count(r, c.hired),
  };
  return { counts, nextAction: deriveJobNextAction(counts, input.jobStatus) };
}

function deriveJobNextAction(
  counts: Record<JobPipelineStage, StageCount>,
  jobStatus: string,
): JobNextAction {
  const none: JobNextAction = { kind: "nothingOutstanding", count: 0, stage: null };

  if (counts.total.read === "loading") return { kind: "loading", count: 0, stage: null };
  if (counts.total.read === "failed" || counts.total.value === null) {
    return { kind: "unavailable", count: 0, stage: null };
  }

  // ── 1. What the employer is late on ──────────────────────────────────
  // First, always: an application nobody has opened is the only thing here
  // where somebody outside the organisation is waiting for an answer.
  if ((counts.awaitingReview.value ?? 0) > 0) {
    return {
      kind: "reviewNewApplications",
      count: counts.awaitingReview.value ?? 0,
      stage: "awaitingReview",
    };
  }

  // ── 2. An interview to prepare or hold ───────────────────────────────
  // Above the assessment wait on purpose: an interview is work THIS employer
  // owes, and an assessment in flight is work somebody else owes.
  if ((counts.interview.value ?? 0) > 0) {
    return { kind: "prepareInterviews", count: counts.interview.value ?? 0, stage: "interview" };
  }

  // ── 3. Waiting on a candidate ────────────────────────────────────────
  // A statement. The employer has nothing to do here and must not be handed a
  // button implying otherwise. Skipped entirely when the assessment read did
  // not succeed, because "0 in assessment" would be a guess.
  if (counts.assessmentOpen.read === "ready" && (counts.assessmentOpen.value ?? 0) > 0) {
    return {
      kind: "awaitAssessments",
      count: counts.assessmentOpen.value ?? 0,
      stage: "assessmentOpen",
    };
  }

  // ── 4. Nobody has applied ────────────────────────────────────────────
  if (counts.total.value === 0) {
    return {
      kind: jobStatus === "published" ? "noApplicationsYet" : "notPublished",
      count: 0,
      stage: null,
    };
  }

  return none;
}
