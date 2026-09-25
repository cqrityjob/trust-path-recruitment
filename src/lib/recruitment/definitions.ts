// The recruitment workspace's vocabulary, in one place.
//
// Every surface that COUNTS something and every surface that LISTS it reads the
// same definition from here. "New applications" on the overview and the rows
// that open when it is clicked are the same predicate over the same rows; a
// second copy of the predicate is how a count and its list come to disagree.
//
// Pure: no I/O, no clock read except where a caller passes `now`, so the same
// input always yields the same answer and the guard can exhaust it.

import { z } from "zod";

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "interview"
  | "rejected"
  | "hired"
  | "withdrawn";

/** Still waiting on the organisation. Everything else is settled business. */
export const UNRESOLVED_STATUSES: readonly ApplicationStatus[] = [
  "submitted",
  "reviewing",
  "interview",
];

export function isUnresolved(status: string): boolean {
  return (UNRESOLVED_STATUSES as readonly string[]).includes(status);
}

/** "New" is a STAGE, not a reading receipt: an application nobody has moved
 *  past its first stage. Opening an application never changes this -- that is
 *  recorded separately as `firstViewedAt`, and shown as "unopened". */
export function isNewApplication(status: string): boolean {
  return status === "submitted";
}

// ── Stage and decision are two things ────────────────────────────────────
//
// job_applications.status carries both where the process has got to and, at
// the end, what was decided. The interface shows them as two columns so a
// rejection is never read as "a stage the candidate is in".

export type RecruitmentStage = "new" | "review" | "interview" | "closed";
export type RecruitmentDecision = "hired" | "rejected" | "withdrawn" | null;

export function stageOf(status: string): RecruitmentStage {
  if (status === "submitted") return "new";
  if (status === "reviewing") return "review";
  if (status === "interview") return "interview";
  return "closed";
}

export function decisionOf(status: string): RecruitmentDecision {
  if (status === "hired" || status === "rejected" || status === "withdrawn") return status;
  return null;
}

// ── The recruitment's own phase ──────────────────────────────────────────

export type RecruitmentPhase =
  | "draft" // not yet published (draft, pending review, rejected by moderation)
  | "published" // taking applications
  | "closed" // no longer taking applications, candidates still being handled
  | "completed"
  | "cancelled";

export type PhaseInput = {
  jobStatus: string;
  publishedAt: string | null;
  deadlineAt: string | null;
  expiresAt: string | null;
  completionState: "open" | "completed" | "cancelled" | null;
};

/** Mirrors job_is_active() in the database for "published". */
export function phaseOf(input: PhaseInput, now: Date): RecruitmentPhase {
  if (input.completionState === "completed") return "completed";
  if (input.completionState === "cancelled") return "cancelled";
  if (
    input.jobStatus === "draft" ||
    input.jobStatus === "pending_review" ||
    input.jobStatus === "rejected"
  ) {
    return "draft";
  }
  const t = now.getTime();
  const live =
    input.jobStatus === "published" &&
    input.publishedAt !== null &&
    Date.parse(input.publishedAt) <= t &&
    (input.deadlineAt === null || Date.parse(input.deadlineAt) > t) &&
    (input.expiresAt === null || Date.parse(input.expiresAt) > t);
  return live ? "published" : "closed";
}

/** A recruitment is ACTIVE while it takes applications, or while it has
 *  closed and still has candidates without an outcome. A closed advert with
 *  nobody left to answer is "ready to complete", which is a task, not work in
 *  progress -- so it does not inflate the active count. */
export function isActiveRecruitment(phase: RecruitmentPhase, unresolved: number): boolean {
  return phase === "published" || (phase === "closed" && unresolved > 0);
}

export function isReadyToComplete(phase: RecruitmentPhase, unresolved: number): boolean {
  return phase === "closed" && unresolved === 0;
}

export const PHASE_FILTERS = [
  "active",
  "draft",
  "published",
  "closed",
  "completed",
  "all",
] as const;
export type PhaseFilter = (typeof PHASE_FILTERS)[number];

export function matchesPhaseFilter(
  filter: PhaseFilter,
  phase: RecruitmentPhase,
  unresolved: number,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return isActiveRecruitment(phase, unresolved);
    case "completed":
      return phase === "completed" || phase === "cancelled";
    default:
      return phase === filter;
  }
}

// ── The candidate list's view state ──────────────────────────────────────
//
// Held in the URL, so it survives a reload, a sign-in redirect and a trip into
// a candidate and back, and so the candidate view can rebuild the SAME ordered
// list to offer previous and next.

export const STAGE_FILTERS = ["new", "review", "interview", "open", "decided", "all"] as const;
export type StageFilter = (typeof STAGE_FILTERS)[number];

export const CANDIDATE_SORTS = ["applied", "name", "stage", "activity"] as const;
export type CandidateSort = (typeof CANDIDATE_SORTS)[number];

export const PAGE_SIZE = 25;

/** Answers to the vacancy's yes/no questions, as one URL parameter:
 *  `<questionId>:y,<questionId>:n`. A malformed entry is dropped, never
 *  guessed at, so a hand-edited URL cannot widen or narrow a filter silently. */
export type AnswerFilter = { questionId: string; value: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAnswerFilter(raw: string | undefined): AnswerFilter[] {
  if (!raw) return [];
  const out: AnswerFilter[] = [];
  for (const part of raw.split(",")) {
    const [id, v] = part.split(":");
    if (!id || !UUID.test(id) || (v !== "y" && v !== "n")) continue;
    if (out.some((f) => f.questionId === id)) continue;
    out.push({ questionId: id, value: v === "y" });
  }
  return out;
}

export function serializeAnswerFilter(filters: readonly AnswerFilter[]): string | undefined {
  if (filters.length === 0) return undefined;
  return filters.map((f) => `${f.questionId}:${f.value ? "y" : "n"}`).join(",");
}

export const candidateViewSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  stage: z.enum(STAGE_FILTERS).optional().catch(undefined),
  owner: z.string().max(40).optional().catch(undefined),
  ans: z.string().max(400).optional().catch(undefined),
  sort: z.enum(CANDIDATE_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
});
export type CandidateView = z.infer<typeof candidateViewSchema>;

/** Only the keys that differ from the defaults, so a link carries a short,
 *  readable query string and an unfiltered list has none. */
export function compactView(view: CandidateView): CandidateView {
  const out: CandidateView = {};
  if (view.q) out.q = view.q;
  if (view.stage && view.stage !== "open") out.stage = view.stage;
  if (view.owner) out.owner = view.owner;
  if (view.ans) out.ans = view.ans;
  if (view.sort && view.sort !== "applied") out.sort = view.sort;
  if (view.dir) out.dir = view.dir;
  if (view.page && view.page > 1) out.page = view.page;
  return out;
}

/** The same view with the page dropped: what a filter or sort change should
 *  navigate to, since page 4 of the old list is nowhere in the new one. */
export function firstPage(view: CandidateView): CandidateView {
  const { page: _page, ...rest } = view;
  return rest;
}

// ── The recruitment's five steps ─────────────────────────────────────────
//
// One case, five steps, always all visible: 1 the requirements profile,
// 2 the advert, 3 publishing, 4 applications, 5 decision and close. A step
// is DONE on a criterion the data satisfies, never because it was visited;
// and it can be revisited at any time -- the steps navigate, they never
// lock. "Current" is the step the case is at, so somebody opening the case
// lands where the work is.

export const RECRUITMENT_STEPS = [
  "requirements",
  "advert",
  "publishing",
  "applications",
  "closing",
] as const;
export type RecruitmentStep = (typeof RECRUITMENT_STEPS)[number];
export type StepState = "done" | "current" | "todo";

export type StepInput = {
  /** Structured requirements and questions saved for the vacancy. */
  requirementsCount: number;
  questionsCount: number;
  /** Free-text requirements on the advert itself. */
  hasRequirementsText: boolean;
  /** Title and description present, the advert's own readiness. */
  advertReady: boolean;
  phase: RecruitmentPhase;
  total: number;
  unresolved: number;
};

export function stepStatesOf(i: StepInput): Record<RecruitmentStep, StepState> {
  const requirementsDone = i.requirementsCount > 0 || i.questionsCount > 0 || i.hasRequirementsText;
  const advertDone = i.advertReady;
  const publishingDone = i.phase !== "draft";
  const closed = i.phase === "completed" || i.phase === "cancelled";
  // Applications are "done" once every candidate has an outcome and the
  // advert no longer takes new ones -- an empty published advert is still
  // waiting, and so is a closed one with somebody undecided.
  const applicationsDone = closed || (i.phase === "closed" && i.total > 0 && i.unresolved === 0);
  const closingDone = closed;

  let current: RecruitmentStep;
  if (closed) current = "closing";
  else if (i.phase === "draft") {
    current = !requirementsDone ? "requirements" : !advertDone ? "advert" : "publishing";
  } else if (i.phase === "published") current = "applications";
  else current = i.unresolved > 0 ? "applications" : "closing";

  const done: Record<RecruitmentStep, boolean> = {
    requirements: requirementsDone,
    advert: advertDone,
    publishing: publishingDone,
    applications: applicationsDone,
    closing: closingDone,
  };
  const out = {} as Record<RecruitmentStep, StepState>;
  for (const step of RECRUITMENT_STEPS) {
    out[step] = step === current ? "current" : done[step] ? "done" : "todo";
  }
  return out;
}

export function currentStepOf(i: StepInput): RecruitmentStep {
  const states = stepStatesOf(i);
  return (RECRUITMENT_STEPS.find((s) => states[s] === "current") ??
    "applications") as RecruitmentStep;
}

// ── Messages and bookings: states as the interface names them ────────────

export type MessageDelivery =
  | "draft"
  | "delivered_email_sent"
  | "delivered_email_sending"
  | "delivered_email_failed"
  | "delivered_email_not_configured"
  | "delivered_in_app_only"
  | "discarded";

export function messageDeliveryOf(status: string, emailStatus: string): MessageDelivery {
  if (status === "draft") return "draft";
  if (status === "discarded") return "discarded";
  switch (emailStatus) {
    case "sent":
      return "delivered_email_sent";
    case "sending":
      return "delivered_email_sending";
    case "failed":
      return "delivered_email_failed";
    case "not_configured":
      return "delivered_email_not_configured";
    default:
      return "delivered_in_app_only";
  }
}

export const BOOKING_OPEN_STATUSES = ["planned", "invited", "confirmed"] as const;

/** An interview still ahead IN A LIVE PROCESS: the booking is open and not
 *  long past, the candidate has no outcome yet, and the recruitment has not
 *  been completed or cancelled. A confirmed time for somebody who has since
 *  been hired, rejected or has withdrawn is history, not an upcoming
 *  interview -- counting it would send the recruiter to a closed case. */
export function isOpenInterview(
  b: { status: string; startsAt: string },
  applicationStatus: string,
  completionState: string | null,
  now: Date,
): boolean {
  return (
    isUpcomingBooking(b.status, b.startsAt, now) &&
    isUnresolved(applicationStatus) &&
    (completionState === null || completionState === "open")
  );
}

export function isUpcomingBooking(status: string, startsAt: string, now: Date): boolean {
  return (
    (BOOKING_OPEN_STATUSES as readonly string[]).includes(status) &&
    Date.parse(startsAt) >= now.getTime() - 60 * 60 * 1000
  );
}
