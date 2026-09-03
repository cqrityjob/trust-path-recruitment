// The personal home's presentation model — one owner per status, one
// most-important thing, decided once.
//
// ── WHY THIS MODULE EXISTS ─────────────────────────────────────────────
//
// /my-career used to let every product speak for itself: the report card,
// the Passport card, the journey strip, the attention panel and the next
// action each announced the same released report, the same nine entries
// under review, the same verified credential — in five places, in five
// tones, with the Passport's navy surface outshouting the one thing the
// ranking engine had actually chosen. A person had to read the whole page
// to find out what the page wanted them to do.
//
// So the page is now assembled from THIS object. `computeNextBestActions`
// still decides what matters most; this module decides where each fact is
// SHOWN, and shows it once. Every event has an id, the primary card claims
// the ids it is about, and every other section filters those ids out.
//
// ── WHAT IT DOES NOT DO ────────────────────────────────────────────────
//
// It does not rank. The engine ranks and this file reads `primary[0]`. It
// does not read anything: every input is a query result the route already
// holds, passed in as data, so the same inputs give the same page and a
// guard can prove it without a database. And it does not turn a failed
// read into a zero: each source carries whether it answered, and the
// sections say "could not be read" rather than "nothing".

import type { CandidateInterviewRow } from "@/lib/interview-intelligence/candidate.functions";
import type { MyApplicationRow } from "@/lib/job-intelligence/applications.functions";
import type { MyAssignment } from "@/lib/security-competency/academy-learning.functions";
import {
  computeNextBestActions,
  type NextBestAction,
  type NextBestActionSignals,
  type StatusClassification,
} from "./next-best-action";
import { computeProfileCompleteness, type CompletenessSection } from "./completeness";
import { summariseTrust } from "./trust-summary";
import { isUnavailable, type ProfessionalIdentityV1 } from "./types";
import type { VerificationAttention } from "./verification-attention";

export const HOME_PRESENTATION_VERSION = "home-presentation-v1" as const;

/** Maximum secondary statuses beside the primary action. */
export const MAX_SECONDARY_STATUSES = 2;
/** Maximum recent-activity rows on the home. */
export const MAX_RECENT_ACTIVITY = 3;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** A query result as the model sees it: answered with rows, answered with
 *  an error, or not answered yet. Never a bare array — an array cannot say
 *  which of the three it is, and that is the whole point. */
export type Source<T> =
  | { readonly state: "ready"; readonly rows: readonly T[] }
  | { readonly state: "error" }
  | { readonly state: "loading" };

export function sourceOf<T>(rows: readonly T[] | undefined, isError: boolean): Source<T> {
  if (isError) return { state: "error" };
  if (rows === undefined) return { state: "loading" };
  return { state: "ready", rows };
}

export interface HomePresentationInput {
  readonly identity: ProfessionalIdentityV1;
  /** Null while the verification read has not answered. */
  readonly verificationAttention: VerificationAttention | null;
  /** Everything an employer has asked of this person — `listMyAcademyWork`. */
  readonly assignments: Source<MyAssignment>;
  readonly interviews: Source<CandidateInterviewRow>;
  readonly applications: Source<MyApplicationRow>;
  /** Saved CVs. Undefined when not known. */
  readonly savedCvCount?: number;
  /** Whether Career Discovery would admit this person. Undefined: not asked. */
  readonly careerDiscoveryOpen?: boolean;
  /** The clock, so recency is testable. */
  readonly now: Date;
}

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

/** A stable id for one thing that happened to this person. The primary
 *  card claims the ids it is about; nothing else may render them. */
export type HomeEventId = string;

/** Who asked, what for, by when — the metadata the primary card may state
 *  beside the action. Every field is null when the row could not be named. */
export interface PrimaryMeta {
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly deadline: string | null;
}

export interface PrimaryAction {
  readonly action: NextBestAction;
  readonly classification: StatusClassification;
  readonly eventIds: readonly HomeEventId[];
  readonly meta: PrimaryMeta | null;
}

export type SecondaryStatusKind =
  /** A lower-ranked engine action from the blocking band. */
  | "engine_action"
  /** Entries under review. Explicitly nothing to do. */
  | "passport_under_review"
  /** A submitted assessment the employer has not released yet. */
  | "assessment_awaiting_release"
  /** An interview is done and the employer is deciding. */
  | "interview_process_continuing"
  /** The report names careers, so the card can be opened. */
  | "career_card_available";

export interface SecondaryStatus {
  readonly id: string;
  readonly kind: SecondaryStatusKind;
  readonly classification: StatusClassification;
  readonly count: number | null;
  readonly href: string;
  /** Present when `kind === "engine_action"`. */
  readonly action: NextBestAction | null;
  readonly eventIds: readonly HomeEventId[];
}

export interface PriorityWorkspaceModel {
  /** The engine's top action, or null when nothing at all qualified. */
  readonly primary: PrimaryAction | null;
  /** True when nothing needs attention: the primary, if any, is the
   *  product's own suggestion rather than something waiting on the person. */
  readonly calm: boolean;
  readonly secondary: readonly SecondaryStatus[];
}

export type PassportPillar =
  | { readonly state: "unavailable" }
  | { readonly state: "not_opened" }
  | {
      readonly state: "counts";
      /** Verified claims AND verified employment, from the one summariser
       *  every trust surface uses. A header that counted claims alone said
       *  "nothing verified" beside a confirmed employment. */
      readonly verified: number;
      /** Open reviews, when the verification read answered. Null when it
       *  did not — never 0. */
      readonly underReview: number | null;
      readonly actionRequired: number;
    };

export type AssessmentsPillar =
  | { readonly state: "unavailable" }
  | {
      readonly state: "counts";
      readonly open: number;
      readonly released: number;
      readonly awaitingRelease: number;
    };

export type JobsPillar =
  | { readonly state: "unavailable" }
  | {
      readonly state: "counts";
      readonly activeApplications: number;
      readonly interviews: number;
    };

export interface SnapshotModel {
  readonly passport: PassportPillar;
  readonly assessments: AssessmentsPillar;
  readonly jobs: JobsPillar;
}

export type ActivityKind =
  | "report_released"
  | "verification_approved"
  | "verification_rejected"
  | "interview_offered"
  | "interview_in_progress"
  | "interview_completed"
  | "application_submitted";

export interface ActivityItem {
  readonly id: HomeEventId;
  readonly kind: ActivityKind;
  /** ISO timestamp. */
  readonly at: string;
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly href: string;
}

export interface ActivityModel {
  readonly items: readonly ActivityItem[];
  /** At least one source did not answer. The list is a floor, not a fact. */
  readonly partial: boolean;
  /** Every source failed. Nothing can be said. */
  readonly unavailable: boolean;
}

export type ActiveWorkKind =
  | "assessment_in_progress"
  | "interview"
  | "verification_action_required"
  | "verification_outcome";

export interface ActiveWorkItem {
  readonly id: HomeEventId;
  readonly kind: ActiveWorkKind;
  readonly href: string;
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly deadline: string | null;
  /** answered / total, for an assessment in progress. */
  readonly progress: { readonly answered: number; readonly total: number } | null;
  readonly interviewStatus: CandidateInterviewRow["status"] | null;
  /** For verification items: which Passport entry. */
  readonly subject: { readonly kind: "claim" | "experience"; readonly id: string } | null;
}

export type ExploreDestination =
  | "career_discovery"
  | "career_card"
  | "cv"
  | "professions"
  | "profile"
  | "jobs";

export interface ExploreItem {
  readonly id: string;
  readonly destination: ExploreDestination;
  readonly href: string;
  /** The engine action this row stands for, when there is one. */
  readonly action: NextBestAction | null;
}

export interface HomePresentation {
  readonly version: typeof HOME_PRESENTATION_VERSION;
  readonly workspace: PriorityWorkspaceModel;
  readonly snapshot: SnapshotModel;
  readonly activity: ActivityModel;
  readonly activeWork: readonly ActiveWorkItem[];
  readonly explore: readonly ExploreItem[];
  /** The onboarding journey strip is for an account that has not started
   *  anything. An established account has moved past it. */
  readonly showJourney: boolean;
  /** "Grundprofil komplett" — every applicable section answered, and the
   *  reads behind them answered. Never a percentage. */
  readonly profileComplete: boolean;
  /** The signals handed to the engine, exposed so a guard can see them. */
  readonly signals: NextBestActionSignals;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The sections that make up the basic profile. Mirrors the set the engine
 *  may recommend (PROFILE_ACTION_SECTIONS): situation, title, profession,
 *  employment and country. Education, skills and languages are enrichment. */
export const BASIC_SECTIONS: readonly CompletenessSection[] = [
  "situation",
  "identity",
  "profession",
  "employment",
  "location",
];

const rowsOf = <T>(s: Source<T>): readonly T[] => (s.state === "ready" ? s.rows : []);

/** An interview that is still asking something of the candidate. */
const isLiveInterview = (i: CandidateInterviewRow) => i.status !== "employer_process_continuing";

const ACTIVE_APPLICATION_STATUSES: ReadonlySet<MyApplicationRow["status"]> = new Set([
  "submitted",
  "reviewing",
  "interview",
]);

function assessmentRows(assignments: Source<MyAssignment>): readonly MyAssignment[] {
  return rowsOf(assignments).filter((r) => r.mode === "assessment");
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

/** Everything the engine needs that the identity read model does not
 *  carry, derived here so every caller derives it the same way. */
export function deriveSignals(input: HomePresentationInput): NextBestActionSignals {
  const attention = input.verificationAttention;
  const live = rowsOf(input.interviews).filter(isLiveInterview);
  return {
    savedCvCount: input.savedCvCount,
    careerDiscoveryOpen: input.careerDiscoveryOpen,
    // Left undefined while the verification read has not answered, and
    // when it failed. Passing 0 would state that nobody is waiting on
    // this person, which is the difference between "nothing to do" and
    // "we could not check".
    clarificationCount:
      attention && !attention.unavailable ? attention.actionRequired.length : undefined,
    verificationOutcomeCount:
      attention && !attention.unavailable ? attention.outcomes.length : undefined,
    underReviewSubjectIds:
      attention && !attention.unavailable ? attention.waiting.map((w) => w.subjectId) : undefined,
    verificationStateUnavailable: attention?.unavailable === true,
    // Only when the interview read answered: an unanswered read is not
    // "no interview".
    interviewCaseId: input.interviews.state === "ready" ? (live[0]?.caseId ?? null) : null,
    interviewCount: input.interviews.state === "ready" ? live.length : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* The primary action and what it owns                                 */
/* ------------------------------------------------------------------ */

function metaFromAssignment(row: MyAssignment | undefined): PrimaryMeta | null {
  if (!row) return null;
  return {
    employerName: row.employerName,
    titleSv: row.programmeNameSv,
    titleEn: row.programmeNameEn,
    purposeSv: row.purposeSv,
    purposeEn: row.purposeEn,
    // A deadline is a fact about work still to do. A released report's row
    // still carries the date the attempt had to be done by, and stating it
    // beside "read your report" is a deadline for nothing.
    deadline: row.attemptStatus === "in_progress" ? row.deadline : null,
  };
}

function metaFromInterview(row: CandidateInterviewRow | undefined): PrimaryMeta | null {
  if (!row) return null;
  return {
    employerName: row.employerName,
    titleSv: row.roleTitle,
    titleEn: row.roleTitle,
    purposeSv: null,
    purposeEn: null,
    deadline: null,
  };
}

/** Which events an action is ABOUT, and what it may say about them. */
function claimAction(
  action: NextBestAction,
  input: HomePresentationInput,
): { eventIds: HomeEventId[]; meta: PrimaryMeta | null } {
  const { identity } = input;
  const assessments = assessmentRows(input.assignments);
  const attention = input.verificationAttention;

  switch (action.kind) {
    case "read_released_report": {
      const named = identity.workload.releasedReportAttemptId;
      const released = assessments.filter((r) => Boolean(r.releasedAt));
      const rows = named ? released.filter((r) => r.attemptId === named) : released;
      const ids = named ? [named] : released.map((r) => r.attemptId);
      return { eventIds: ids.map((id) => `report:${id}`), meta: metaFromAssignment(rows[0]) };
    }
    case "complete_assessment_assignment": {
      const named = identity.workload.assessmentAssignmentAttemptId;
      const open = assessments.filter((r) => r.attemptStatus === "in_progress");
      const rows = named ? open.filter((r) => r.attemptId === named) : open;
      const ids = named ? [named] : open.map((r) => r.attemptId);
      return { eventIds: ids.map((id) => `assignment:${id}`), meta: metaFromAssignment(rows[0]) };
    }
    case "prepare_interview": {
      const live = rowsOf(input.interviews).filter(isLiveInterview);
      const named = live[0];
      return {
        eventIds: live.map((i) => `interview:${i.caseId}`),
        meta: metaFromInterview(named),
      };
    }
    case "respond_to_clarification":
      return {
        eventIds: (attention?.actionRequired ?? []).map((i) => `clarification:${i.requestId}`),
        meta: null,
      };
    case "review_verification_outcome":
      return {
        eventIds: (attention?.outcomes ?? []).map((i) => `outcome:${i.requestId}`),
        meta: null,
      };
    default:
      return { eventIds: [], meta: null };
  }
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildHomePresentation(input: HomePresentationInput): HomePresentation {
  const { identity } = input;
  const signals = deriveSignals(input);
  const engine = computeNextBestActions(identity, signals);
  const attention = input.verificationAttention;
  const attentionKnown = Boolean(attention) && !attention!.unavailable;
  const assessments = assessmentRows(input.assignments);
  const interviews = rowsOf(input.interviews);
  const applications = rowsOf(input.applications);
  const known = (group: Parameters<typeof isUnavailable>[1]) => !isUnavailable(identity, group);

  /* ---- the primary --------------------------------------------------- */

  const top = engine.all[0] ?? null;
  const primary: PrimaryAction | null = top
    ? { action: top, classification: top.classification, ...claimAction(top, input) }
    : null;
  const claimed = new Set<HomeEventId>(primary?.eventIds ?? []);
  const calm = !primary || primary.classification === "suggestion";

  /* ---- secondary statuses -------------------------------------------- */

  const candidates: SecondaryStatus[] = [];
  const usedActions = new Set<NextBestAction["kind"]>(top ? [top.kind] : []);

  // 1 · lower-ranked blocking actions: somebody else is still waiting.
  for (const action of engine.all) {
    if (action === top || action.priority !== 1) continue;
    const { eventIds } = claimAction(action, input);
    candidates.push({
      id: `action:${action.kind}`,
      kind: "engine_action",
      classification: action.classification,
      count: action.count,
      href: action.href,
      action,
      eventIds,
    });
    usedActions.add(action.kind);
  }

  // 2 · under review: the status this page most often mistook for a task.
  if (attentionKnown && attention!.waiting.length > 0) {
    candidates.push({
      id: "status:under_review",
      kind: "passport_under_review",
      classification: "in_progress_no_action",
      count: attention!.waiting.length,
      href: "/passport",
      action: null,
      eventIds: attention!.waiting.map((w) => `waiting:${w.requestId}`),
    });
  }

  // 3 · submitted, not yet released.
  const awaitingRelease = assessments.filter(
    (r) => !r.releasedAt && r.attemptStatus !== "in_progress",
  );
  if (awaitingRelease.length > 0) {
    candidates.push({
      id: "status:awaiting_release",
      kind: "assessment_awaiting_release",
      classification: "in_progress_no_action",
      count: awaitingRelease.length,
      href: "/academy",
      action: null,
      eventIds: awaitingRelease.map((r) => `assignment:${r.attemptId}`),
    });
  }

  // 4 · interview done, employer deciding.
  const continuing = interviews.filter((i) => !isLiveInterview(i));
  if (continuing.length > 0) {
    candidates.push({
      id: "status:interview_continuing",
      kind: "interview_process_continuing",
      classification: "in_progress_no_action",
      count: continuing.length,
      href:
        continuing.length === 1
          ? `/my-career/interviews/${continuing[0]!.caseId}`
          : "/my-career/applications",
      action: null,
      eventIds: continuing.map((i) => `interview:${i.caseId}`),
    });
  }

  // 5 · the Career Card, when the engine offers it and it is not the primary.
  const cardAction = engine.all.find((a) => a.kind === "create_career_card");
  if (cardAction && cardAction !== top) {
    candidates.push({
      id: "status:career_card",
      kind: "career_card_available",
      classification: "suggestion",
      count: null,
      href: cardAction.href,
      action: cardAction,
      eventIds: [],
    });
  }

  const secondary = candidates
    .filter((s) => !s.eventIds.some((id) => claimed.has(id)))
    .slice(0, MAX_SECONDARY_STATUSES);
  for (const s of secondary) {
    if (s.action) usedActions.add(s.action.kind);
    for (const id of s.eventIds) claimed.add(id);
  }

  /* ---- snapshot ------------------------------------------------------ */

  const trust = summariseTrust(identity);
  const passport: PassportPillar =
    !known("passport") || !known("claims")
      ? { state: "unavailable" }
      : !identity.hasPassport
        ? { state: "not_opened" }
        : {
            state: "counts",
            verified: trust.known ? trust.verifiedClaims + trust.verifiedEmployment : 0,
            underReview: attentionKnown ? attention!.waiting.length : null,
            actionRequired: attentionKnown
              ? attention!.actionRequired.length + attention!.outcomes.length
              : 0,
          };
  // A trust summary that could not be counted must not print a zero.
  const passportPillar: PassportPillar =
    passport.state === "counts" && !trust.known ? { state: "unavailable" } : passport;

  const assessmentsPillar: AssessmentsPillar =
    input.assignments.state !== "ready" || !known("assessments")
      ? { state: "unavailable" }
      : {
          state: "counts",
          open: assessments.filter((r) => r.attemptStatus === "in_progress").length,
          released: assessments.filter((r) => Boolean(r.releasedAt)).length,
          awaitingRelease: awaitingRelease.length,
        };

  const jobsPillar: JobsPillar =
    input.applications.state !== "ready"
      ? { state: "unavailable" }
      : {
          state: "counts",
          activeApplications: applications.filter((a) => ACTIVE_APPLICATION_STATUSES.has(a.status))
            .length,
          interviews: interviews.filter(isLiveInterview).length,
        };

  /* ---- recent activity ---------------------------------------------- */

  const events: ActivityItem[] = [];
  for (const r of assessments) {
    if (r.releasedAt) {
      events.push({
        id: `report:${r.attemptId}`,
        kind: "report_released",
        at: r.releasedAt,
        employerName: r.employerName,
        titleSv: r.programmeNameSv,
        titleEn: r.programmeNameEn,
        href: `/academy/report/${r.attemptId}`,
      });
    }
  }
  if (attentionKnown) {
    for (const i of attention!.information) {
      if (!i.decidedAt) continue;
      events.push({
        id: `approved:${i.requestId}`,
        kind: "verification_approved",
        at: i.decidedAt,
        employerName: null,
        titleSv: null,
        titleEn: null,
        href: `/passport/entry/${i.subjectKind}/${i.subjectId}`,
      });
    }
    for (const i of attention!.outcomes) {
      if (!i.decidedAt) continue;
      events.push({
        id: `outcome:${i.requestId}`,
        kind: "verification_rejected",
        at: i.decidedAt,
        employerName: null,
        titleSv: null,
        titleEn: null,
        href: `/passport/entry/${i.subjectKind}/${i.subjectId}`,
      });
    }
  }
  for (const i of interviews) {
    events.push({
      id: `interview:${i.caseId}`,
      kind:
        i.status === "interview_offered"
          ? "interview_offered"
          : i.status === "interview_in_progress"
            ? "interview_in_progress"
            : "interview_completed",
      at: i.updatedAt,
      employerName: i.employerName,
      titleSv: i.roleTitle,
      titleEn: i.roleTitle,
      href: `/my-career/interviews/${i.caseId}`,
    });
  }
  for (const a of applications) {
    events.push({
      id: `application:${a.id}`,
      kind: "application_submitted",
      at: a.createdAt,
      employerName: a.employerName,
      titleSv: a.jobTitleSv ?? a.jobTitleEn,
      titleEn: a.jobTitleEn ?? a.jobTitleSv,
      href: "/my-career/applications",
    });
  }
  const sourceStates = [
    input.assignments.state,
    input.interviews.state,
    input.applications.state,
    attention === null ? "loading" : attention.unavailable ? "error" : "ready",
  ];
  const activity: ActivityModel = {
    items: events
      .filter((e) => !claimed.has(e.id))
      .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
      .slice(0, MAX_RECENT_ACTIVITY),
    partial: sourceStates.some((s) => s === "error"),
    unavailable: sourceStates.every((s) => s === "error"),
  };

  /* ---- active work --------------------------------------------------- */

  const work: ActiveWorkItem[] = [];
  for (const r of assessments) {
    if (r.attemptStatus !== "in_progress") continue;
    work.push({
      id: `assignment:${r.attemptId}`,
      kind: "assessment_in_progress",
      href: `/academy/${r.attemptId}`,
      employerName: r.employerName,
      titleSv: r.programmeNameSv,
      titleEn: r.programmeNameEn,
      deadline: r.deadline,
      progress: { answered: r.answered, total: r.totalItems },
      interviewStatus: null,
      subject: null,
    });
  }
  for (const i of interviews) {
    if (!isLiveInterview(i)) continue;
    work.push({
      id: `interview:${i.caseId}`,
      kind: "interview",
      href: `/my-career/interviews/${i.caseId}`,
      employerName: i.employerName,
      titleSv: i.roleTitle,
      titleEn: i.roleTitle,
      deadline: null,
      progress: null,
      interviewStatus: i.status,
      subject: null,
    });
  }
  if (attentionKnown) {
    for (const i of attention!.actionRequired) {
      work.push({
        id: `clarification:${i.requestId}`,
        kind: "verification_action_required",
        href: `/passport/entry/${i.subjectKind}/${i.subjectId}`,
        employerName: null,
        titleSv: null,
        titleEn: null,
        deadline: null,
        progress: null,
        interviewStatus: null,
        subject: { kind: i.subjectKind, id: i.subjectId },
      });
    }
    for (const i of attention!.outcomes) {
      work.push({
        id: `outcome:${i.requestId}`,
        kind: "verification_outcome",
        href: `/passport/entry/${i.subjectKind}/${i.subjectId}`,
        employerName: null,
        titleSv: null,
        titleEn: null,
        deadline: null,
        progress: null,
        interviewStatus: null,
        subject: { kind: i.subjectKind, id: i.subjectId },
      });
    }
  }
  const activeWork = work.filter((w) => !claimed.has(w.id));

  /* ---- explore and grow ---------------------------------------------- */

  const DESTINATION_OF: Partial<Record<NextBestAction["kind"], ExploreDestination>> = {
    take_career_discovery: "career_discovery",
    create_career_card: "career_card",
    create_cv: "cv",
    open_cv: "cv",
    explore_jobs: "jobs",
    complete_profile_basics: "profile",
  };
  const explore: ExploreItem[] = [];
  const covered = new Set<ExploreDestination>();
  // The engine's remaining suggestions first, in its order.
  for (const action of engine.all) {
    if (usedActions.has(action.kind)) continue;
    const destination = DESTINATION_OF[action.kind];
    if (!destination) {
      // A blocking action that found no slot above still has to be
      // reachable. It is listed here rather than dropped.
      explore.push({
        id: `action:${action.kind}`,
        destination: "profile",
        href: action.href,
        action,
      });
      continue;
    }
    if (covered.has(destination)) continue;
    covered.add(destination);
    explore.push({ id: `action:${action.kind}`, destination, href: action.href, action });
  }
  // Then the standing destinations the engine had nothing to say about.
  const standing: readonly { destination: ExploreDestination; href: string; when: boolean }[] = [
    {
      destination: "career_discovery",
      href: "/security-career-assessment",
      // A retake is offered only to somebody who has a report and whom the
      // gate would admit. Somebody without a report was already offered
      // the assessment by the engine, or refused by the gate.
      when:
        known("discovery") &&
        identity.discovery.hasCompletedReport &&
        input.careerDiscoveryOpen === true,
    },
    { destination: "professions", href: "/career-center", when: true },
    { destination: "cv", href: "/my-career/cv", when: true },
    { destination: "profile", href: "/my-career/profile", when: true },
  ];
  for (const s of standing) {
    if (!s.when || covered.has(s.destination)) continue;
    // The Career Card is offered by the engine or by a secondary status,
    // never by a standing row: the engine already knows whether it exists.
    covered.add(s.destination);
    explore.push({
      id: `standing:${s.destination}`,
      destination: s.destination,
      href: s.href,
      action: null,
    });
  }

  /* ---- onboarding and the profile line ------------------------------- */

  // "Grundprofil komplett" is about the BASICS -- the sections without which
  // nothing downstream works -- never a run to 100% across enrichment
  // sections. The same set the engine is allowed to recommend.
  const completeness = computeProfileCompleteness(identity);
  const basicsMissing = completeness.missingSections.some((s) => BASIC_SECTIONS.includes(s));
  const basicsKnown =
    known("account") && known("profile") && known("passport") && known("employment");
  const showJourney =
    basicsKnown &&
    known("discovery") &&
    known("assessments") &&
    known("applications") &&
    !identity.hasPassport &&
    !identity.discovery.hasCompletedReport &&
    identity.workload.releasedReportCount === 0 &&
    identity.workload.assessmentAssignmentCount === 0 &&
    identity.workload.applicationCount === 0;

  return {
    version: HOME_PRESENTATION_VERSION,
    workspace: { primary, calm, secondary },
    snapshot: { passport: passportPillar, assessments: assessmentsPillar, jobs: jobsPillar },
    activity,
    activeWork,
    explore,
    showJourney,
    profileComplete: basicsKnown && !basicsMissing,
    signals,
  };
}
