// The interview workload's stages, written once.
//
// ── THE DEFECT THIS MODULE EXISTS TO END ────────────────────────────────
//
// The Overview's work list carries four interview rows -- plans to approve,
// interviews ready to hold, evidence to review, reports to finalise -- each
// with a count, and every one of them linked to the UNFILTERED interview
// index. The application and assessment rows next to them all carry a filter.
// So a recruiter told "3 interviews ready" landed on a list of every case the
// organisation has ever had and re-found the three by hand.
//
// A count that does not land on the rows it counted is a count the reader has
// to re-derive. The fix is a filter on the destination, and the risk in a
// filter is that it stops agreeing with the number that produced it: the
// counter would say three and the filtered list would show four, and nobody
// would know which was wrong.
//
// So the mapping from a stage to the case statuses it covers lives HERE, in
// one pure table, and both sides read it: `getInterviewWorkload` counts with
// it, and the index filters with it. They cannot disagree, because there is
// only one of them.
//
// ── WHY THESE FIVE AND NOT THE NINE STATUSES ────────────────────────────
//
// A stage is a piece of WORK, and two statuses can be the same piece of work:
// `interview_complete` and `evidence_review` both mean "the interview happened
// and a human owes the evidence a look". The Overview has always counted them
// together; splitting them in the URL would offer a distinction the product
// does not make.

import type { CaseStatus } from "./runtime.functions";

/** The stages a work-list row can name. `active` and `done` are the index's
 *  own two summary stats rather than work-list rows, and are included so one
 *  table covers every filter the surface offers. */
export const CASE_STAGES = [
  "inPreparation",
  "awaitingPlanApproval",
  "readyToInterview",
  "inEvidenceReview",
  "awaitingReport",
  "active",
  "done",
] as const;

export type CaseStage = (typeof CASE_STAGES)[number];

/**
 * Which case statuses each stage covers.
 *
 * Total over `CaseStage`, and typed as `CaseStatus[]`, so a status renamed in
 * the runtime breaks the build here rather than quietly matching nothing.
 *
 * `active` is everything still in flight: a case at `assessed` IS active,
 * because a human still has to review and lock the report, and `reported`
 * never is -- a finalised report is a frozen document, not a case in flight.
 * `done` counts `reported` and only `reported`.
 */
export const CASE_STAGE_STATUSES: Record<CaseStage, readonly CaseStatus[]> = {
  inPreparation: ["draft", "sources_ready"],
  awaitingPlanApproval: ["prep_generated"],
  readyToInterview: ["prep_approved"],
  inEvidenceReview: ["interview_complete", "evidence_review"],
  awaitingReport: ["assessed"],
  active: [
    "draft",
    "sources_ready",
    "prep_generated",
    "prep_approved",
    "interview_in_progress",
    "interview_complete",
    "evidence_review",
    "assessed",
  ],
  done: ["reported"],
};

/** Narrow an arbitrary string to a stage, or null. Used where a stage arrives
 *  from a URL: a stale bookmark shows the unfiltered list rather than a
 *  validation error, exactly as the applications list already behaves. */
export function asCaseStage(value: string | null | undefined): CaseStage | null {
  return value && (CASE_STAGES as readonly string[]).includes(value) ? (value as CaseStage) : null;
}

/** Does this case belong to that stage? The one predicate both the counter and
 *  the list use. */
export function caseIsInStage(status: string, stage: CaseStage): boolean {
  return (CASE_STAGE_STATUSES[stage] as readonly string[]).includes(status);
}
