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

export const candidateViewSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  stage: z.enum(STAGE_FILTERS).optional().catch(undefined),
  owner: z.string().max(40).optional().catch(undefined),
  sort: z.enum(CANDIDATE_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});
export type CandidateView = z.infer<typeof candidateViewSchema>;

/** The fields of a candidate row the view reads. */
export type CandidateViewRow = {
  applicationId: string;
  name: string | null;
  jobTitle: string | null;
  status: string;
  appliedAt: string;
  responsibleUserId: string | null;
  nextActivityAt: string | null;
};

const STAGE_ORDER: Record<string, number> = {
  submitted: 0,
  reviewing: 1,
  interview: 2,
  hired: 3,
  rejected: 4,
  withdrawn: 5,
};

export function matchesStageFilter(filter: StageFilter | undefined, status: string): boolean {
  switch (filter ?? "open") {
    case "all":
      return true;
    case "open":
      return isUnresolved(status);
    case "decided":
      return !isUnresolved(status);
    case "new":
      return status === "submitted";
    case "review":
      return status === "reviewing";
    case "interview":
      return status === "interview";
  }
}

/** Filter and order candidate rows exactly as the list shows them. Stable:
 *  ties break on application id so previous/next never jumps. */
export function applyCandidateView<T extends CandidateViewRow>(
  rows: readonly T[],
  view: CandidateView,
): T[] {
  const q = (view.q ?? "").toLocaleLowerCase("sv");
  const owner = view.owner;
  const filtered = rows.filter((r) => {
    if (!matchesStageFilter(view.stage, r.status)) return false;
    if (owner === "none" && r.responsibleUserId !== null) return false;
    if (owner && owner !== "none" && r.responsibleUserId !== owner) return false;
    if (q) {
      const hay = `${r.name ?? ""} ${r.jobTitle ?? ""}`.toLocaleLowerCase("sv");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sort = view.sort ?? "applied";
  const dir = view.dir ?? (sort === "applied" ? "desc" : "asc");
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: T, b: T): number => {
    let c = 0;
    if (sort === "name") c = (a.name ?? "￿").localeCompare(b.name ?? "￿", "sv");
    else if (sort === "stage") c = (STAGE_ORDER[a.status] ?? 9) - (STAGE_ORDER[b.status] ?? 9);
    else if (sort === "activity") {
      // Candidates with no planned activity sort last whichever way round.
      const av = a.nextActivityAt ? Date.parse(a.nextActivityAt) : null;
      const bv = b.nextActivityAt ? Date.parse(b.nextActivityAt) : null;
      if (av === null && bv === null) c = 0;
      else if (av === null) return 1;
      else if (bv === null) return -1;
      else c = av - bv;
    } else c = Date.parse(a.appliedAt) - Date.parse(b.appliedAt);
    if (c !== 0) return c * sign;
    return a.applicationId < b.applicationId ? -1 : a.applicationId > b.applicationId ? 1 : 0;
  };
  return [...filtered].sort(cmp);
}

export function neighbours<T extends { applicationId: string }>(
  ordered: readonly T[],
  applicationId: string,
): { previous: T | null; next: T | null; position: number; total: number } {
  const i = ordered.findIndex((r) => r.applicationId === applicationId);
  if (i < 0) return { previous: null, next: null, position: 0, total: ordered.length };
  return {
    previous: i > 0 ? ordered[i - 1] : null,
    next: i < ordered.length - 1 ? ordered[i + 1] : null,
    position: i + 1,
    total: ordered.length,
  };
}

/** Only the keys that differ from the defaults, so a link carries a short,
 *  readable query string and an unfiltered list has none. */
export function compactView(view: CandidateView): CandidateView {
  const out: CandidateView = {};
  if (view.q) out.q = view.q;
  if (view.stage && view.stage !== "open") out.stage = view.stage;
  if (view.owner) out.owner = view.owner;
  if (view.sort && view.sort !== "applied") out.sort = view.sort;
  if (view.dir) out.dir = view.dir;
  return out;
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

export function isUpcomingBooking(status: string, startsAt: string, now: Date): boolean {
  return (
    (BOOKING_OPEN_STATUSES as readonly string[]).includes(status) &&
    Date.parse(startsAt) >= now.getTime() - 60 * 60 * 1000
  );
}
