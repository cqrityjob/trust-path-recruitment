// The application's place in the recruiter's working day, as pure functions.
//
// Three questions every list row and every application page answers from the
// SAME facts the server returned -- never from a second classifier:
//
//   1. Which VIEW is this application in: Aktiva, Avslutade, Arkiv, or the
//      secondary "Alla"? The list's primary tabs are the server's existing
//      stage filters (open / decided / archived / all / received) under the
//      names a recruiter uses. No new database status is introduced: the
//      sub-steps (Ny, Granskas, Behöver klarläggande, Intervju) are views over
//      `job_applications.status` and the server's requirement status.
//
//   2. What is the ONE next thing to do for this application? Derived from the
//      stage, the server's requirement status and the human-review state. It
//      is a suggestion of the next working step, worded as such; it never
//      ranks a candidate and never changes anything.
//
//   3. Where does the candidate's NOTICE stand after a decision? "Ej aktuell"
//      is an internal decision; whether the candidate has been told is a
//      separate fact read from the messages on the application. A failed
//      e-mail is never reported as sent.
//
// Pure: no I/O, no clock, so a guard can exhaust every branch.

import type { CandidateView, StageFilter } from "./definitions";

// ── 1. Views ──────────────────────────────────────────────────────────────

/** The primary views a recruiter switches between. `all` is the secondary
 *  "everything that is not archived" view; `received` adds the archive. */
export const PRIMARY_VIEWS = ["open", "decided", "archived", "all"] as const;
export type PrimaryView = (typeof PRIMARY_VIEWS)[number];

/** Which primary view a stage filter belongs to. The sub-steps of the active
 *  list (new / review / interview) are the "open" view narrowed. */
export function primaryViewOf(stage: StageFilter | undefined): PrimaryView {
  switch (stage ?? "open") {
    case "decided":
      return "decided";
    case "archived":
      return "archived";
    case "all":
    case "received":
      return "all";
    default:
      return "open";
  }
}

/** The sub-steps of the ACTIVE view. `clarify` is not a stage: it is the open
 *  applications whose requirement status says a mandatory requirement still
 *  needs clarifying -- the same rows the server's `requirement=gray` filter
 *  returns -- so it is a view, never a status. */
export const ACTIVE_SUBSTEPS = ["all", "new", "review", "clarify", "interview"] as const;
export type ActiveSubstep = (typeof ACTIVE_SUBSTEPS)[number];

export function activeSubstepOf(view: Pick<CandidateView, "stage" | "requirement">): ActiveSubstep {
  const stage = view.stage ?? "open";
  if (stage === "new") return "new";
  if (stage === "review") return "review";
  if (stage === "interview") return "interview";
  if (stage === "open" && view.requirement === "gray") return "clarify";
  return "all";
}

/** The view to navigate to for a sub-step, from the current view. Switching
 *  sub-step keeps every other filter and drops the page. */
export function viewForSubstep(view: CandidateView, step: ActiveSubstep): CandidateView {
  const { page: _page, ...rest } = view;
  switch (step) {
    case "new":
      return {
        ...rest,
        stage: "new",
        requirement: rest.requirement === "gray" ? undefined : rest.requirement,
      };
    case "review":
      return {
        ...rest,
        stage: "review",
        requirement: rest.requirement === "gray" ? undefined : rest.requirement,
      };
    case "interview":
      return {
        ...rest,
        stage: "interview",
        requirement: rest.requirement === "gray" ? undefined : rest.requirement,
      };
    case "clarify":
      return { ...rest, stage: undefined, requirement: "gray" };
    default:
      return {
        ...rest,
        stage: undefined,
        requirement: rest.requirement === "gray" ? undefined : rest.requirement,
      };
  }
}

/** The view to navigate to for a primary view, from the current view. The
 *  recruitment, the responsible person and the search are kept -- they say
 *  WHOSE applications, which does not change with the view -- while the
 *  sub-step and the review/requirement narrowing are dropped, because they
 *  describe work on open applications only. */
export function viewForPrimary(view: CandidateView, primary: PrimaryView): CandidateView {
  const base: CandidateView = {};
  if (view.job) base.job = view.job;
  if (view.owner) base.owner = view.owner;
  if (view.q) base.q = view.q;
  if (view.sort) base.sort = view.sort;
  if (view.dir) base.dir = view.dir;
  switch (primary) {
    case "decided":
      return { ...base, stage: "decided" };
    case "archived":
      return { ...base, stage: "archived" };
    case "all":
      return { ...base, stage: "all" };
    default:
      return base;
  }
}

/** The filters that live behind "Fler filter": anything beyond the view,
 *  the sub-step, the recruitment, the responsible person and the search. */
export function advancedFilterCount(view: CandidateView): number {
  return (
    (view.requirement && view.requirement !== "gray" ? 1 : 0) +
    (view.requirement === "gray" && (view.stage ?? "open") !== "open" ? 1 : 0) +
    (view.review ? 1 : 0) +
    (view.analysis ? 1 : 0) +
    (view.assessment ? 1 : 0) +
    (view.status ? 1 : 0) +
    (view.ans ? view.ans.split(",").filter(Boolean).length : 0)
  );
}

// ── 2. The next working step ──────────────────────────────────────────────

export type NextStepKind =
  /** Nobody has moved it past "new" and no review is confirmed: read it
   *  against the requirements. */
  | "review"
  /** A mandatory requirement is unclear: ask the candidate to clarify, or
   *  record what was found. Never an automatic message. */
  | "clarify"
  /** The recruitment has no confirmed requirement profile: a profile problem,
   *  not a candidate problem. */
  | "profile"
  /** A confirmed review says a mandatory requirement is NOT met: a person
   *  decides whether the application proceeds. */
  | "decideNotMet"
  /** The review is confirmed and green: prepare the interview. */
  | "prepareInterview"
  /** In the interview stage: conduct it, then decide. */
  | "interview"
  /** A review was confirmed but the basis has changed since: re-confirm. */
  | "reconfirm"
  /** The application was decided: tell the candidate if that has not
   *  happened, then archive. */
  | "tellCandidate"
  | "archive"
  /** Archived, hired or withdrawn: nothing to do from this list. */
  | "none";

export type NextStepInput = {
  status: string;
  requirementStatus: "green" | "yellow" | "gray" | "not_established" | null | undefined;
  reviewState: "reviewed" | "pending" | "stale" | null | undefined;
  /** Whether a decision notice (rejection / offer) has been delivered. Only
   *  the application page knows; the list passes undefined and gets
   *  "archive" for a decided application. */
  noticeDelivered?: boolean;
  archived?: boolean;
};

export function nextStepOf(i: NextStepInput): NextStepKind {
  if (i.archived) return "none";
  if (i.status === "rejected") return i.noticeDelivered === false ? "tellCandidate" : "archive";
  if (i.status === "hired") return i.noticeDelivered === false ? "tellCandidate" : "archive";
  if (i.status === "withdrawn") return "archive";
  if (i.status === "interview") return "interview";
  const req = i.requirementStatus ?? "not_established";
  const review = i.reviewState ?? "pending";
  if (req === "not_established") return "profile";
  if (review === "stale") return "reconfirm";
  if (req === "gray") return "clarify";
  if (review !== "reviewed") return "review";
  if (req === "yellow") return "decideNotMet";
  return "prepareInterview";
}

// ── 3. The candidate's notice after a decision ────────────────────────────

/** Where the candidate stands AFTER a decision was recorded. Four states a
 *  recruiter can read without opening the message list:
 *
 *   - `internal`:  the decision is recorded; nothing has been written to the
 *                  candidate. The default, and the only state a decision
 *                  itself ever produces.
 *   - `prepared`:  a notice exists as a draft. Not sent.
 *   - `queued`:    the notice is in the candidate's CQrityjob inbox and the
 *                  e-mail copy is pending or in flight.
 *   - `delivered`: the notice is in the inbox and the e-mail was accepted (or
 *                  the organisation sends no e-mail).
 *   - `failed`:    the notice is in the inbox; the e-mail failed or its outcome
 *                  is unknown. A person has to look. Never "sent". */
export type CandidateNoticeState = "internal" | "prepared" | "queued" | "delivered" | "failed";

export type NoticeMessage = {
  kind: string;
  status: "draft" | "sent" | "discarded";
  emailStatus: "not_attempted" | "sending" | "sent" | "failed" | "not_configured" | "unknown";
};

export function decisionNoticeKind(status: string): "rejection" | "offer" | null {
  if (status === "rejected") return "rejection";
  if (status === "hired") return "offer";
  return null;
}

/** The best state any decision notice on the application has reached, in the
 *  order delivered > failed > queued > prepared > internal: one accepted
 *  delivery means the candidate was told, whatever a later draft says; and a
 *  failure is reported above a draft because it needs a person. */
export function candidateNoticeStateOf(
  status: string,
  messages: readonly NoticeMessage[],
): CandidateNoticeState {
  const kind = decisionNoticeKind(status);
  if (!kind) return "internal";
  const own = messages.filter((m) => m.kind === kind && m.status !== "discarded");
  if (own.length === 0) return "internal";
  const rank: Record<CandidateNoticeState, number> = {
    internal: 0,
    prepared: 1,
    queued: 2,
    failed: 3,
    delivered: 4,
  };
  let best: CandidateNoticeState = "internal";
  for (const m of own) {
    const s = noticeStateOfMessage(m);
    if (rank[s] > rank[best]) best = s;
  }
  return best;
}

export function noticeStateOfMessage(m: NoticeMessage): CandidateNoticeState {
  if (m.status === "draft") return "prepared";
  if (m.status !== "sent") return "internal";
  switch (m.emailStatus) {
    case "sent":
    case "not_configured":
      return "delivered";
    case "sending":
    case "not_attempted":
      return "queued";
    case "failed":
    case "unknown":
      return "failed";
    default:
      return "queued";
  }
}

// ── 4. The requirement summary in the application header ─────────────────
//
// "N of M mandatory requirements confirmed" is counted from the server's own
// criteria. A criterion counts as CONFIRMED only when a person recorded it as
// met: a state the server derived from the application's yes/no answer, with
// nobody's name on it, is preliminary basis -- shown as such, never as a
// completed human review. Merits (desirable requirements) are listed but never
// enter the count: they compensate for nothing.

export type SummaryCriterion = {
  requirementId: string;
  kind: "mandatory" | "desirable";
  state: "met" | "not_met" | "clarify";
  reviewedAt: string | null;
  reviewedBy: string | null;
  source: { kind: string } | null;
  sourceCurrent: boolean;
};

export type RequirementSummary = {
  mandatoryTotal: number;
  /** Met, and a person recorded it. */
  confirmedMet: number;
  /** Met according to allowed data (the candidate's own yes/no answer) with no
   *  human decision: preliminary, never green on its own. */
  preliminaryMet: number;
  notMet: string[];
  unclear: string[];
  /** A confirmed decision whose cited source has changed since. */
  changedSource: string[];
  desirableTotal: number;
  /** All mandatory requirements human-confirmed as met. The ONLY condition
   *  under which the summary may read as complete. */
  allConfirmed: boolean;
};

export function requirementSummaryOf(criteria: readonly SummaryCriterion[]): RequirementSummary {
  const mandatory = criteria.filter((c) => c.kind === "mandatory");
  const human = (c: SummaryCriterion) => c.reviewedAt !== null || c.reviewedBy !== null;
  const confirmedMet = mandatory.filter((c) => c.state === "met" && human(c) && c.sourceCurrent);
  const preliminaryMet = mandatory.filter((c) => c.state === "met" && !human(c));
  return {
    mandatoryTotal: mandatory.length,
    confirmedMet: confirmedMet.length,
    preliminaryMet: preliminaryMet.length,
    notMet: mandatory.filter((c) => c.state === "not_met").map((c) => c.requirementId),
    unclear: mandatory.filter((c) => c.state === "clarify").map((c) => c.requirementId),
    changedSource: mandatory
      .filter((c) => c.state !== "clarify" && human(c) && !c.sourceCurrent)
      .map((c) => c.requirementId),
    desirableTotal: criteria.length - mandatory.length,
    allConfirmed: mandatory.length > 0 && confirmedMet.length === mandatory.length,
  };
}

/** The basis text for a clarification request: the neutral questions a
 *  reviewer wrote for the unclear mandatory requirements, one per line,
 *  nothing else. No requirement is named that has no question -- the message
 *  is the reviewer's words, never a generated one. */
export function clarificationRequestBody(
  criteria: readonly {
    kind: "mandatory" | "desirable";
    state: string;
    neutralQuestion: string | null;
  }[],
): string {
  return criteria
    .filter((c) => c.kind === "mandatory" && c.state === "clarify" && c.neutralQuestion?.trim())
    .map((c) => c.neutralQuestion!.trim())
    .join("\n\n");
}
