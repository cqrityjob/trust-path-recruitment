// The personal career home's ONE view model.
//
// ── WHY THIS MODULE EXISTS ─────────────────────────────────────────────
//
// /my-career used to let every product speak for itself: the report card,
// the Passport card, the journey strip, the attention panel and the next
// action each announced the same released report, the same nine entries
// under review, the same verified credential — in five places, in five
// tones, with the employer report's surface outshouting the one thing the
// ranking engine had actually chosen. A person had to read the whole page
// to find out what the page wanted them to do, and two sections could
// disagree about the same fact because two derivations produced it.
//
// So the page is assembled from THIS object, and only from this object.
// `computeNextBestActions` decides what matters most; `countMerits` decides
// what the Passport holds; `deriveCareerDirection` reads the frozen report.
// This module composes those three and decides where each fact is SHOWN —
// once. Every event has an id, the primary action claims the ids it is
// about, and every other section filters those ids out.
//
// ── WHAT IT DOES NOT DO ────────────────────────────────────────────────
//
// It does not rank. It does not read: every input is a query result the
// route already holds, passed in as data, so the same inputs give the same
// page and a guard can prove it without a database. It creates no second
// store, no parallel count and no new scoring. And it does not turn a
// failed read into a zero: each source carries whether it answered, and the
// sections say "could not be read" rather than "nothing".

import type { CandidateInterviewRow } from "@/lib/interview-intelligence/candidate.functions";
import type {
  MyApplicationRow,
  ApplicationStatus,
} from "@/lib/job-intelligence/applications.functions";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";
import type { MyAssignment } from "@/lib/security-competency/academy-learning.functions";
import type { ActiveReport } from "@/lib/career-discovery/active-report.functions";
import type { StoredReportResult } from "@/lib/career-discovery/stored-report.functions";
import {
  computeNextBestActions,
  type NextBestAction,
  type NextBestActionSignals,
  type StatusClassification,
} from "./next-best-action";
import { computeProfileCompleteness, type CompletenessSection } from "./completeness";
import { countMerits, type MeritCounts } from "./passport-merits";
import { deriveCareerDirection, type CareerDirection } from "./career-direction";
import { computeCvReadiness } from "./cv/readiness";
import { isUnavailable, professionLabel, type ProfessionalIdentityV1 } from "./types";
import type { VerificationAttention } from "./verification-attention";

export const HOME_PRESENTATION_VERSION = "career-home-view-model-v1" as const;

/** Maximum recent-activity rows on the home. */
export const MAX_RECENT_ACTIVITY = 3;
/** Maximum job recommendations on the home. */
export const MAX_RECOMMENDED_JOBS = 3;

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
  /** Jobs from the existing profile-driven family filter. */
  readonly jobs: Source<PublicJobCard>;
  /** Which report is the CURRENT one, resolved on the server by
   *  `getActiveCareerReport`. It is the only thing that can tell a v3 report
   *  from a v2.1 one from none at all, and the home must never tell somebody
   *  whose only assessment is legacy that they have not taken one. */
  readonly activeReport?: ActiveReport;
  readonly activeReportError?: boolean;
  /** The frozen career-analysis snapshot, when one has been loaded. */
  readonly storedReport?: StoredReportResult;
  readonly storedReportError?: boolean;
  /** The name the account holder set for themselves, when they set one.
   *  Never an email local part — see `profile.preferredName`. */
  readonly preferredName?: string | null;
  /** Saved CVs. Undefined when not known. */
  readonly savedCvCount?: number;
  /** Whether the career analysis would admit this person. Undefined: not asked. */
  readonly careerDiscoveryOpen?: boolean;
  /** The clock, so recency is testable. */
  readonly now: Date;
}

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

/** A stable id for one thing that happened to this person. The primary
 *  action claims the ids it is about; nothing else may render them. */
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

/* ---- who this person is ------------------------------------------- */

export interface HomeProfile {
  /**
   * The name the person chose for themselves, and only that.
   *
   * Deliberately NOT the local part of an email address. "Din karriär,
   * sandleradam191" is the product addressing somebody by a string they
   * never offered as a name, and the brief's rule — preferred name when
   * explicitly available, otherwise the account first name, otherwise no
   * name at all — exists to stop exactly that.
   */
  readonly preferredName: string | null;
  /** The first name on the account record (`profiles.display_name`). */
  readonly accountFirstName: string | null;
  /** Whichever of the two the heading may use, already decided. Null means
   *  the heading omits the name rather than inventing one. */
  readonly greetingName: string | null;
  readonly headline: string | null;
  readonly professionTitleSv: string | null;
  readonly professionTitleEn: string | null;
  readonly workCountry: string | null;
  readonly workSubJurisdiction: string | null;
  /** Every applicable BASIC section answered. Never a percentage. */
  readonly complete: boolean;
  /** At least one read behind this profile did not answer. */
  readonly degraded: boolean;
}

/* ---- the Passport -------------------------------------------------- */

export type PassportSummaryModel =
  /** The reads did not answer. Never rendered as zeroes. */
  | { readonly state: "unavailable" }
  /** The review state has not come back yet. Distinct from `unavailable`
   *  because "we could not read your merits" is a false sentence to show
   *  somebody for the 300ms before the answer arrives. */
  | { readonly state: "loading" }
  /** No Passport exists yet. */
  | { readonly state: "not_opened" }
  | { readonly state: "counts"; readonly counts: MeritCounts };

/* ---- tests and results --------------------------------------------- */

/** An assessment that is waiting on THIS person. */
export interface AssessmentAction {
  readonly id: HomeEventId;
  readonly attemptId: string;
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly deadline: string | null;
  readonly answered: number;
  readonly totalItems: number;
  readonly href: string;
}

/** A result the employer has released to this person. */
export interface ReportSummary {
  readonly id: HomeEventId;
  readonly attemptId: string;
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly releasedAt: string;
  readonly href: string;
}

export type AssessmentsModel =
  | { readonly state: "unavailable" }
  | {
      readonly state: "ready";
      readonly actionRequired: readonly AssessmentAction[];
      /**
       * Results released to this person, newest first.
       *
       * NOT "unread": this product records no read receipt for a released
       * report, so nothing here may claim one. See the delivery notes —
       * asserting "unread" would be a statement about the person that no
       * stored fact supports.
       */
      readonly released: readonly ReportSummary[];
      /** Submitted, and the employer has not released a result. Passive by
       *  definition: it asks nothing of the candidate and is rendered last. */
      readonly waitingCount: number;
    };

/* ---- jobs and applications ----------------------------------------- */

export interface JobSummary {
  readonly id: string;
  readonly slug: string;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly location: string | null;
  readonly employerName: string | null;
}

export type JobsModel =
  | { readonly state: "unavailable" }
  | {
      readonly state: "ready";
      /** At most three, from the SAME family filter the jobs surface uses.
       *  Empty is a real answer and gets the compact empty state. */
      readonly recommended: readonly JobSummary[];
      /** Null when the applications read did not answer. */
      readonly activeApplicationCount: number | null;
      /** The most recent application's status, when there is one. */
      readonly latestStatus: ApplicationStatus | null;
      readonly latestAt: string | null;
      readonly interviewCount: number;
    };

/* ---- career tools --------------------------------------------------- */

export type ToolKey = "cv" | "career_card" | "professions" | "profile";

export interface ToolItem {
  readonly key: ToolKey;
  readonly href: string;
  /** True when the person already has one of these. Lets the copy say
   *  "open" rather than "create". */
  readonly existing: boolean;
}

/* ---- activity ------------------------------------------------------- */

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

/** How many rows the expanded activity list may hold. Bounded: this is a
 *  recent-activity feed, not an audit log. */
export const MAX_ALL_ACTIVITY = 12;

export interface ActivityModel {
  readonly items: readonly ActivityItem[];
  /** Everything the model could show, for the in-place "show all"
   *  disclosure. There is no all-activity ROUTE in this product, and
   *  linking to one that does not exist is worse than not offering it, so
   *  the extra rows are revealed here instead. */
  readonly all: readonly ActivityItem[];
  /** At least one source did not answer. The list is a floor, not a fact. */
  readonly partial: boolean;
  /** Every source failed. Nothing can be said. */
  readonly unavailable: boolean;
  /** More happened than is shown. */
  readonly hasMore: boolean;
}

/* ---- the whole thing ------------------------------------------------ */

export interface CareerHomeViewModel {
  readonly version: typeof HOME_PRESENTATION_VERSION;
  readonly profile: HomeProfile;
  /** The ONE visually primary action, or null when nothing qualified. */
  readonly nextAction: PrimaryAction | null;
  /** True when the primary, if any, is the product's own suggestion rather
   *  than something waiting on the person. Decides the calm treatment. */
  readonly calm: boolean;
  readonly passport: PassportSummaryModel;
  readonly career: CareerDirection;
  readonly jobs: JobsModel;
  readonly assessments: AssessmentsModel;
  readonly tools: readonly ToolItem[];
  readonly activity: ActivityModel;
  /** The signals handed to the engine, exposed so a guard can see them. */
  readonly signals: NextBestActionSignals;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The sections that make up the basic profile. Education, skills and
 *  languages are enrichment and never gate "complete". */
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

const ACTIVE_APPLICATION_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "submitted",
  "reviewing",
  "interview",
]);

function assessmentRows(assignments: Source<MyAssignment>): readonly MyAssignment[] {
  return rowsOf(assignments).filter((r) => r.mode === "assessment");
}

/** A trimmed name, or null. Blank strings are not names. */
function trimmed(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

function firstNameOf(value: string | null | undefined): string | null {
  const full = trimmed(value);
  return full ? (full.split(/\s+/)[0] ?? null) : null;
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

/** Everything the engine needs that the identity read model does not
 *  carry, derived here so every caller derives it the same way. */
export function deriveSignals(input: HomePresentationInput): NextBestActionSignals {
  const attention = input.verificationAttention;
  const live = rowsOf(input.interviews).filter(isLiveInterview);
  const open = assessmentRows(input.assignments).filter((r) => r.attemptStatus === "in_progress");
  const named = input.identity.workload.assessmentAssignmentAttemptId;
  const deadlineRow = named ? open.find((r) => r.attemptId === named) : open[0];
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
    // "Not known" rather than "failed": a review state that has not answered
    // YET is just as unable to say whether these merits are already in
    // somebody's hands. Recommending "submit these eight" beside a panel
    // that says the review state could not be read is the page contradicting
    // itself, and both halves of that came from this one flag.
    verificationStateUnavailable: attention === null || attention.unavailable === true,
    // Only when the interview read answered: an unanswered read is not
    // "no interview".
    interviewCaseId: input.interviews.state === "ready" ? (live[0]?.caseId ?? null) : null,
    interviewCount: input.interviews.state === "ready" ? live.length : undefined,
    // Undefined while the jobs read has not answered. P6 claims that
    // relevant jobs EXIST, and a claim needs an answer behind it.
    recommendedJobCount: input.jobs.state === "ready" ? input.jobs.rows.length : undefined,
    assessmentDeadline:
      input.assignments.state === "ready" ? (deadlineRow?.deadline ?? null) : null,
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
    // beside "read your result" is a deadline for nothing.
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

export function buildCareerHomeViewModel(input: HomePresentationInput): CareerHomeViewModel {
  const { identity } = input;
  const signals = deriveSignals(input);
  const engine = computeNextBestActions(identity, signals, input.now);
  const attention = input.verificationAttention;
  const attentionKnown = Boolean(attention) && !attention!.unavailable;
  const assessments = assessmentRows(input.assignments);
  const interviews = rowsOf(input.interviews);
  const applications = rowsOf(input.applications);
  const known = (group: Parameters<typeof isUnavailable>[1]) => !isUnavailable(identity, group);

  /* ---- who this person is -------------------------------------------- */

  const preferredName = firstNameOf(input.preferredName);
  const accountFirstName = firstNameOf(identity.displayName);
  const completeness = computeProfileCompleteness(identity);
  const basicsMissing = completeness.missingSections.some((s) => BASIC_SECTIONS.includes(s));
  const basicsKnown =
    known("account") && known("profile") && known("passport") && known("employment");

  const profile: HomeProfile = {
    preferredName,
    accountFirstName,
    // Preferred name first, the account's first name second, and NO name
    // third. There is no email fallback: an address is not a name.
    greetingName: preferredName ?? accountFirstName,
    headline: trimmed(identity.headline),
    professionTitleSv: identity.currentProfessionTitleSv,
    professionTitleEn: identity.currentProfessionTitleEn,
    workCountry: identity.workCountry ?? identity.accountCountry,
    workSubJurisdiction: identity.workCountry ? identity.workSubJurisdiction : null,
    complete: basicsKnown && !basicsMissing,
    degraded: identity.unavailable.length > 0,
  };

  /* ---- the ONE primary action ---------------------------------------- */

  const top = engine.all[0] ?? null;
  const nextAction: PrimaryAction | null = top
    ? { action: top, classification: top.classification, ...claimAction(top, input) }
    : null;
  const claimed = new Set<HomeEventId>(nextAction?.eventIds ?? []);
  const calm = !nextAction || nextAction.classification === "suggestion";

  /* ---- the Passport --------------------------------------------------- */

  const counts = countMerits(identity, attention, input.now);
  const passport: PassportSummaryModel =
    !known("passport") || !known("claims") || !counts.known
      ? { state: "unavailable" }
      : !identity.hasPassport
        ? { state: "not_opened" }
        : // The merits are counted, but "how many are being verified" is not
          // in yet. A skeleton rather than three numbers one of which would
          // have to say "could not be read" about a read that is simply in
          // flight.
          attention === null
          ? { state: "loading" }
          : { state: "counts", counts };

  /* ---- the career picture --------------------------------------------- */

  // WHICH report is current is a server decision (`getActiveCareerReport`),
  // and it is the only read that can tell a v3 report from a v2.1 one. The
  // identity seam only knows about `cd_report_snapshots`, so a candidate
  // whose sole assessment is legacy looks report-less to it -- which is how
  // a completed candidate came to be shown "not taken yet".
  const active = input.activeReport;
  const career: CareerDirection = input.activeReportError
    ? { state: "unavailable" }
    : !active
      ? { state: "loading" }
      : active.kind === "none"
        ? { state: "none" }
        : active.kind === "legacy_v21"
          ? {
              state: "legacy",
              completedAt: active.completedAt,
              reportHref: `/my-career/reports/${active.runId}`,
            }
          : active.kind === "discovery_unreadable"
            ? { state: "unreadable", completedAt: active.generatedAt }
            : deriveCareerDirection(input.storedReport, { isError: input.storedReportError });

  /* ---- tests and results ---------------------------------------------- */

  const openAssessments = assessments.filter((r) => r.attemptStatus === "in_progress");
  const releasedAssessments = assessments
    .filter((r) => Boolean(r.releasedAt))
    .sort((a, b) => String(b.releasedAt).localeCompare(String(a.releasedAt)));
  const awaitingRelease = assessments.filter(
    (r) => !r.releasedAt && r.attemptStatus !== "in_progress",
  );

  const assessmentsModel: AssessmentsModel =
    input.assignments.state !== "ready" || !known("assessments")
      ? { state: "unavailable" }
      : {
          state: "ready",
          // Filtered by what the primary action already claimed. A released
          // result announced at the top of the page must not also be a row
          // here: the same thing twice, in two weights, is the duplication
          // the redesign exists to remove.
          actionRequired: openAssessments
            .filter((r) => !claimed.has(`assignment:${r.attemptId}`))
            .map((r) => ({
              id: `assignment:${r.attemptId}`,
              attemptId: r.attemptId,
              employerName: r.employerName,
              titleSv: r.programmeNameSv,
              titleEn: r.programmeNameEn,
              purposeSv: r.purposeSv,
              purposeEn: r.purposeEn,
              deadline: r.deadline,
              answered: r.answered,
              totalItems: r.totalItems,
              href: `/academy/${r.attemptId}`,
            })),
          released: releasedAssessments
            .filter((r) => !claimed.has(`report:${r.attemptId}`))
            .map((r) => ({
              id: `report:${r.attemptId}`,
              attemptId: r.attemptId,
              employerName: r.employerName,
              titleSv: r.programmeNameSv,
              titleEn: r.programmeNameEn,
              releasedAt: r.releasedAt!,
              href: `/academy/report/${r.attemptId}`,
            })),
          waitingCount: awaitingRelease.length,
        };

  /* ---- jobs and applications ------------------------------------------ */

  const sortedApplications = [...applications].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const jobs: JobsModel =
    input.jobs.state !== "ready" && input.applications.state !== "ready"
      ? { state: "unavailable" }
      : {
          state: "ready",
          recommended: rowsOf(input.jobs)
            .slice(0, MAX_RECOMMENDED_JOBS)
            .map((j) => ({
              id: j.id,
              slug: j.slug,
              titleSv: j.title_sv,
              titleEn: j.title_en,
              location: [j.location_text, j.city, j.country].filter(Boolean).join(", ") || null,
              employerName: j.employer?.name ?? null,
            })),
          activeApplicationCount:
            input.applications.state === "ready"
              ? applications.filter((a) => ACTIVE_APPLICATION_STATUSES.has(a.status)).length
              : null,
          latestStatus: sortedApplications[0]?.status ?? null,
          latestAt: sortedApplications[0]?.updatedAt ?? null,
          interviewCount: interviews.filter(isLiveInterview).length,
        };

  /* ---- career tools ---------------------------------------------------- */

  // A tool is offered only when it can produce something. The CV is the
  // one that used to break this rule: it was a standing card that said
  // "built from what you have already recorded" to somebody with no
  // employment and no education, whose CV builder would then refuse. So it
  // is gated on the SAME readiness function the builder itself applies.
  const tools: ToolItem[] = [];
  if (computeCvReadiness(identity).state === "ready") {
    tools.push({ key: "cv", href: "/my-career/cv", existing: (input.savedCvCount ?? 0) > 0 });
  }
  if (
    known("discovery") &&
    identity.discovery.hasCompletedReport &&
    identity.discovery.namesCareers
  ) {
    tools.push({ key: "career_card", href: "/my-career/career-card", existing: true });
  }
  tools.push({ key: "professions", href: "/career-center", existing: false });
  tools.push({ key: "profile", href: "/my-career/profile", existing: false });

  /* ---- recent activity ------------------------------------------------- */

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
  const visible = events
    .filter((e) => !claimed.has(e.id))
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const activity: ActivityModel = {
    items: visible.slice(0, MAX_RECENT_ACTIVITY),
    all: visible.slice(0, MAX_ALL_ACTIVITY),
    partial: sourceStates.some((s) => s === "error"),
    unavailable: sourceStates.every((s) => s === "error"),
    hasMore: visible.length > MAX_RECENT_ACTIVITY,
  };

  return {
    version: HOME_PRESENTATION_VERSION,
    profile,
    nextAction,
    calm,
    passport,
    career,
    jobs,
    assessments: assessmentsModel,
    tools,
    activity,
    signals,
  };
}

/** The professional title a surface may print for this person, in one
 *  language. Headline first — it is what they wrote about themselves —
 *  then the catalogue profession. Null when neither exists, so the surface
 *  can say "not filled in" rather than printing a slug. */
export function homeRoleTitle(profile: HomeProfile, lang: "sv" | "en"): string | null {
  return (
    profile.headline ??
    professionLabel(
      {
        currentProfessionOther: null,
        currentProfessionTitleSv: profile.professionTitleSv,
        currentProfessionTitleEn: profile.professionTitleEn,
      },
      lang,
    )
  );
}
