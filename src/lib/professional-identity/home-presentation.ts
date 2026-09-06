// The personal career home's ONE view model.
//
// Every section of /my-career reads this object and nothing else. It does
// not rank (the ladder does), it does not read (the route does), and it
// creates no second store. What it decides is where each fact is SHOWN,
// and it shows each fact once: the primary action claims the ids it is
// about, and every other section carries what it removed as a
// `featuredAbove` marker rather than pretending the thing does not exist.
//
// ── EACH SOURCE STANDS ON ITS OWN ──────────────────────────────────────
//
// v1 built this object only once the identity read had answered, so an
// identity failure left the top of the page as a permanent skeleton and
// hid every section below it. Now every input carries its own state and
// every section resolves from its own inputs: a failed identity read costs
// the header's details and the identity-dependent rungs of the ladder,
// and the career picture, jobs, tests, training and activity still render
// from the reads that DID answer. A skeleton is a loading state only.
//
// ── UNKNOWN IS NEVER ZERO, AND ABSENT IS NEVER "FAILED" ────────────────
//
// Each model below has explicit `loading` and `unavailable` states beside
// its empty one. "No employer has asked you to take a test" is only ever
// said when the tests read ANSWERED with nothing.

import type { CandidateInterviewRow } from "@/lib/interview-intelligence/candidate.functions";
import type {
  MyApplicationRow,
  ApplicationStatus,
} from "@/lib/job-intelligence/applications.functions";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";
import type { AcademyWorkItem } from "@/lib/security-competency/academy-training.functions";
import type {
  LifecycleState,
  MyAssessmentRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";
import type { ActiveReport } from "@/lib/career-discovery/active-report.functions";
import type { StoredReportResult } from "@/lib/career-discovery/stored-report.functions";
import {
  computeNextBestActions,
  type ActionSubject,
  type NextBestAction,
  type NextBestActionSignals,
  type StatusClassification,
} from "./next-best-action";
import { computeProfileCompleteness, type CompletenessSection } from "./completeness";
import { countMerits, currentMeritTitle, type MeritCounts } from "./passport-merits";
import { deriveCareerDirection, type CareerDirection } from "./career-direction";
import { computeCvReadiness } from "./cv/readiness";
import { isUnavailable, professionLabel, type ProfessionalIdentityV1 } from "./types";
import type { VerificationAttention } from "./verification-attention";

export const HOME_PRESENTATION_VERSION = "career-home-view-model-v2" as const;

export const MAX_RECENT_ACTIVITY = 3;
export const MAX_ALL_ACTIVITY = 12;
export const MAX_RECOMMENDED_JOBS = 3;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type Source<T> =
  | { readonly state: "ready"; readonly rows: readonly T[] }
  | { readonly state: "error" }
  | { readonly state: "loading" };

export function sourceOf<T>(rows: readonly T[] | undefined, isError: boolean): Source<T> {
  if (isError) return { state: "error" };
  if (rows === undefined) return { state: "loading" };
  return { state: "ready", rows };
}

/** The identity read, with its own state rather than a bare object. */
export type IdentityInput =
  | { readonly state: "ready"; readonly identity: ProfessionalIdentityV1 }
  | { readonly state: "loading" }
  | { readonly state: "error" };

/** Where the job filter came from. The family is written by the career
 *  analysis (assessment_runs.result_summary), and nowhere else. */
export type JobFilterInput =
  | { readonly state: "loading" }
  | { readonly state: "none" }
  | { readonly state: "family"; readonly familyId: string };

export interface LegacyRunRow {
  readonly id: string;
  readonly completed_at?: string | null;
  readonly started_at?: string | null;
}

export interface DiscoveryReportRow {
  readonly snapshotId: string;
  readonly generatedAt: string;
  readonly definitionVersion: string;
}

export interface HomePresentationInput {
  readonly identity: IdentityInput;
  readonly verificationAttention: VerificationAttention | null;
  /** The canonical academy work read — the SAME one /academy renders. */
  readonly academyWork: Source<AcademyWorkItem>;
  /** The participant's own pipeline states, from scp_my_assessment_history. */
  readonly assessmentHistory: Source<MyAssessmentRow>;
  readonly interviews: Source<CandidateInterviewRow>;
  readonly applications: Source<MyApplicationRow>;
  readonly jobFilter: JobFilterInput;
  readonly jobs: Source<PublicJobCard>;
  readonly activeReport?: ActiveReport;
  readonly activeReportError?: boolean;
  readonly storedReport?: StoredReportResult;
  readonly storedReportError?: boolean;
  readonly legacyRuns: Source<LegacyRunRow>;
  readonly discoveryReports: Source<DiscoveryReportRow>;
  readonly preferredName?: string | null;
  readonly savedCvCount?: number;
  readonly careerDiscoveryOpen?: boolean;
  readonly now: Date;
}

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

export type HomeEventId = string;

export interface PrimaryMeta {
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
  readonly useCase: "workforce" | "recruitment" | null;
  readonly deadline: string | null;
}

export interface PrimaryAction {
  readonly action: NextBestAction;
  readonly classification: StatusClassification;
  readonly eventIds: readonly HomeEventId[];
  readonly meta: PrimaryMeta | null;
}

export type NextActionModel =
  | { readonly state: "loading" }
  /** The identity read failed AND no identity-independent rung fired. */
  | { readonly state: "unavailable" }
  | { readonly state: "ready"; readonly primary: PrimaryAction | null; readonly calm: boolean };

export interface HomeProfileDetails {
  readonly preferredName: string | null;
  readonly accountFirstName: string | null;
  readonly greetingName: string | null;
  readonly headline: string | null;
  readonly professionTitleSv: string | null;
  readonly professionTitleEn: string | null;
  readonly workCountry: string | null;
  readonly workSubJurisdiction: string | null;
  readonly complete: boolean;
  readonly degraded: boolean;
}

export type HomeProfile =
  | { readonly state: "loading"; readonly greetingName: string | null }
  | { readonly state: "unavailable"; readonly greetingName: string | null }
  | ({ readonly state: "ready" } & HomeProfileDetails);

export type PassportSummaryModel =
  | { readonly state: "unavailable" }
  | { readonly state: "loading" }
  | { readonly state: "not_opened" }
  | { readonly state: "counts"; readonly counts: MeritCounts };

/* ---- employer processes ------------------------------------------- */

/** What one test asks of, or tells, the candidate. Derived from the
 *  pipeline's own lifecycle state where the history read answered, and from
 *  the attempt status otherwise. Only explicit pipeline states become
 *  `waiting`; anything else is `unknown` and is never described as waiting. */
export type TestPhase = "action" | "waiting" | "released" | "abandoned" | "unknown";

export interface TestRow {
  readonly id: HomeEventId;
  readonly attemptId: string;
  readonly phase: TestPhase;
  readonly useCase: "workforce" | "recruitment";
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
  readonly deadline: string | null;
  readonly releasedAt: string | null;
  readonly answered: number;
  readonly totalItems: number;
  /** The attempt's raw status, for an `unknown` phase to be shown as-is. */
  readonly rawStatus: string;
  /** Where the row opens: the run, or the released report. Null when the
   *  pipeline has nothing the candidate can open. */
  readonly href: string | null;
  /** The primary action above is about this row. */
  readonly featuredAbove: boolean;
}

export interface TrainingRow {
  readonly id: HomeEventId;
  readonly assignmentId: string;
  readonly employerName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly status: string;
  readonly deadline: string | null;
  readonly modulesDone: number;
  readonly modulesTotal: number;
  readonly completed: boolean;
  readonly href: string;
  readonly featuredAbove: boolean;
}

export type EmployerWorkModel =
  | { readonly state: "loading" }
  | { readonly state: "unavailable" }
  | {
      readonly state: "ready";
      /** Every test, ordered: action, released, waiting, then the rest. */
      readonly tests: readonly TestRow[];
      readonly training: readonly TrainingRow[];
      /** Totals BEFORE anything was claimed by the primary action, so a
       *  section can say "shown above" rather than "nothing here". */
      readonly totalTests: number;
      readonly totalTraining: number;
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
  | { readonly state: "loading" }
  | { readonly state: "unavailable" }
  /** The career analysis named a family and it returned rows. */
  | { readonly state: "filtered"; readonly jobs: readonly JobSummary[] }
  /** The career analysis named a family and nothing is open in it. */
  | { readonly state: "filtered_empty" }
  /** No career analysis, so no filter: the newest vacancies, said as such. */
  | { readonly state: "general"; readonly jobs: readonly JobSummary[] }
  /** No filter and nothing published at all. */
  | { readonly state: "general_empty" };

export interface LatestApplication {
  readonly id: string;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
  readonly employerName: string | null;
  readonly status: ApplicationStatus;
  readonly updatedAt: string;
}

export type ApplicationsModel =
  | { readonly state: "loading" }
  | { readonly state: "unavailable" }
  | {
      readonly state: "ready";
      readonly activeCount: number;
      /** The most recently UPDATED active application, never a concluded
       *  one standing in for it. */
      readonly latestActive: LatestApplication | null;
      /** Concluded: rejected, hired, withdrawn. Kept apart. */
      readonly concludedCount: number;
      readonly interviewCount: number;
    };

/* ---- tools, activity, history -------------------------------------- */

export type ToolKey = "cv" | "career_card" | "professions" | "profile";

export interface ToolItem {
  readonly key: ToolKey;
  readonly href: string;
  readonly existing: boolean;
}

export type ActivityKind =
  | "report_released"
  | "verification_approved"
  | "verification_approved_archived"
  | "verification_rejected"
  | "interview_offered"
  | "interview_in_progress"
  | "interview_completed"
  | "application_submitted";

export interface ActivityItem {
  readonly id: HomeEventId;
  readonly kind: ActivityKind;
  readonly at: string;
  /** The merit, employer or job the line is about. */
  readonly subjectSv: string | null;
  readonly subjectEn: string | null;
  readonly href: string;
}

export interface ActivityModel {
  readonly items: readonly ActivityItem[];
  readonly all: readonly ActivityItem[];
  readonly partial: boolean;
  readonly unavailable: boolean;
  readonly hasMore: boolean;
}

/** Earlier career analyses, excluding the current one — never a disclosure
 *  that opens onto nothing, never the current report listed as "earlier". */
export type EarlierReportsModel =
  | { readonly state: "loading" }
  | { readonly state: "unavailable" }
  | {
      readonly state: "ready";
      readonly legacyRuns: readonly LegacyRunRow[];
      readonly discoveryReports: readonly DiscoveryReportRow[];
      readonly count: number;
    };

export interface CareerHomeViewModel {
  readonly version: typeof HOME_PRESENTATION_VERSION;
  readonly profile: HomeProfile;
  readonly nextAction: NextActionModel;
  readonly passport: PassportSummaryModel;
  readonly career: CareerDirection;
  readonly earlierReports: EarlierReportsModel;
  readonly jobs: JobsModel;
  readonly applications: ApplicationsModel;
  readonly employerWork: EmployerWorkModel;
  readonly tools: readonly ToolItem[];
  readonly activity: ActivityModel;
  readonly signals: NextBestActionSignals;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const BASIC_SECTIONS: readonly CompletenessSection[] = [
  "situation",
  "identity",
  "profession",
  "employment",
  "location",
];

const rowsOf = <T>(s: Source<T>): readonly T[] => (s.state === "ready" ? s.rows : []);
const isLiveInterview = (i: CandidateInterviewRow) => i.status !== "employer_process_continuing";

const ACTIVE_APPLICATION_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "submitted",
  "reviewing",
  "interview",
]);

function trimmed(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}
function firstNameOf(value: string | null | undefined): string | null {
  const full = trimmed(value);
  return full ? (full.split(/\s+/)[0] ?? null) : null;
}

/**
 * An identity that ANSWERED nothing, for the ladder to run on when the
 * read failed. Every group is unavailable, so every identity-dependent
 * rung withholds itself, and the rungs fed by other reads — a test with a
 * deadline, an interview, a reviewer's question — still fire. That is the
 * difference between "we could not read your profile" and "you have
 * nothing to do".
 */
export const UNAVAILABLE_IDENTITY: ProfessionalIdentityV1 = {
  identityVersion: "professional-identity-v1",
  displayName: null,
  accountCountry: null,
  locale: "sv",
  currentStatus: null,
  currentProfessionSlug: null,
  currentProfessionOther: null,
  currentProfessionTitleSv: null,
  currentProfessionTitleEn: null,
  yearsOfExperience: null,
  hasPassport: false,
  headline: null,
  workCountry: null,
  workSubJurisdiction: null,
  employment: [],
  claims: [],
  discovery: {
    hasCompletedReport: false,
    snapshotId: null,
    generatedAt: null,
    namesCareers: false,
  },
  workload: {
    applicationCount: 0,
    assessmentAssignmentCount: 0,
    releasedReportCount: 0,
    releasedReportAttemptId: null,
    assessmentAssignmentAttemptId: null,
    draftClaimCount: 0,
    draftClaimIds: [],
    employerWorkspaceCount: 0,
  },
  unavailable: [
    "account",
    "profile",
    "passport",
    "claims",
    "employment",
    "discovery",
    "applications",
    "assessments",
    "memberships",
    "provenance",
  ],
};

/* ---- the pipeline phase of one test --------------------------------- */

const WAITING_LIFECYCLES: ReadonlySet<LifecycleState> = new Set([
  "under_review",
  "processing",
  "ready_to_release",
]);

/** Attempt statuses that are explicit pipeline states, when no history row
 *  answers for the attempt. Nothing else is ever called waiting. */
const WAITING_STATUSES: ReadonlySet<string> = new Set(["submitted", "scored"]);

export function testPhaseOf(
  work: Pick<AcademyWorkItem, "status" | "releasedAt">,
  history: MyAssessmentRow | undefined,
): TestPhase {
  if (history) {
    switch (history.lifecycleState) {
      case "invited":
      case "in_progress":
        return "action";
      case "result_available":
        return "released";
      case "abandoned":
        return "abandoned";
      default:
        return WAITING_LIFECYCLES.has(history.lifecycleState) ? "waiting" : "unknown";
    }
  }
  if (work.status === "in_progress") return "action";
  if (work.status === "released" || work.releasedAt) return "released";
  if (work.status === "abandoned") return "abandoned";
  return WAITING_STATUSES.has(work.status) ? "waiting" : "unknown";
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

export function deriveSignals(
  input: HomePresentationInput,
  identity: ProfessionalIdentityV1,
): NextBestActionSignals {
  const attention = input.verificationAttention;
  const attentionKnown = Boolean(attention) && !attention!.unavailable;
  const live = rowsOf(input.interviews).filter(isLiveInterview);
  const work = rowsOf(input.academyWork);
  const history = rowsOf(input.assessmentHistory);

  const openTests = work
    .filter((w) => w.workKind === "assessment")
    .filter(
      (w) =>
        testPhaseOf(
          w,
          history.find((h) => h.attemptId === w.workId),
        ) === "action",
    );
  // Earliest deadline first, then the stable id — the same rule the seam
  // applies — so the named test is deterministic across loads.
  const orderedOpen = [...openTests].sort((a, b) => {
    const da = a.deadline ?? "~";
    const db = b.deadline ?? "~";
    return da !== db ? da.localeCompare(db) : a.workId.localeCompare(b.workId);
  });
  const deadlineRow = orderedOpen[0];

  // Training with the EARLIEST deadline first, then the stable id.
  const openTraining = work
    .filter((w) => w.workKind === "training" && w.status !== "completed")
    .sort((a, b) => {
      const da = a.deadline ?? "~";
      const db = b.deadline ?? "~";
      return da !== db ? da.localeCompare(db) : a.workId.localeCompare(b.workId);
    });

  const one = <T extends { subjectKind: "claim" | "experience"; subjectId: string }>(
    list: readonly T[],
  ): ActionSubject | null =>
    list.length === 1 ? { kind: list[0]!.subjectKind, id: list[0]!.subjectId } : null;

  return {
    savedCvCount: input.savedCvCount,
    careerDiscoveryOpen: input.careerDiscoveryOpen,
    clarificationCount: attentionKnown ? attention!.actionRequired.length : undefined,
    clarificationSubject: attentionKnown ? one(attention!.actionRequired) : null,
    verificationOutcomeCount: attentionKnown ? attention!.outcomes.length : undefined,
    verificationOutcomeSubject: attentionKnown ? one(attention!.outcomes) : null,
    underReviewSubjectIds: attentionKnown ? attention!.waiting.map((w) => w.subjectId) : undefined,
    verificationStateUnavailable: attention === null || attention.unavailable === true,
    interviewCaseId: input.interviews.state === "ready" ? (live[0]?.caseId ?? null) : null,
    interviewCount: input.interviews.state === "ready" ? live.length : undefined,
    recommendedJobCount: input.jobs.state === "ready" ? input.jobs.rows.length : undefined,
    recommendedJobsFiltered: input.jobFilter.state === "family",
    openTestCount: input.academyWork.state === "ready" ? orderedOpen.length : undefined,
    openTestAttemptId: input.academyWork.state === "ready" ? (deadlineRow?.workId ?? null) : null,
    assessmentDeadline:
      input.academyWork.state === "ready" ? (deadlineRow?.deadline ?? null) : null,
    trainingCount: input.academyWork.state === "ready" ? openTraining.length : undefined,
    trainingAssignmentId: openTraining[0]?.workId ?? null,
    trainingDeadline: openTraining[0]?.deadline ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* What the primary action owns                                        */
/* ------------------------------------------------------------------ */

function metaFromWork(row: AcademyWorkItem | undefined): PrimaryMeta | null {
  if (!row) return null;
  return {
    employerName: row.employerName,
    titleSv: row.titleSv,
    titleEn: row.titleEn,
    purposeSv: row.purposeSv,
    purposeEn: row.purposeEn,
    jobTitleSv: row.jobTitleSv,
    jobTitleEn: row.jobTitleEn,
    useCase: row.useCase,
    deadline: row.deadline,
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
    jobTitleSv: null,
    jobTitleEn: null,
    useCase: "recruitment",
    deadline: null,
  };
}

function claimAction(
  action: NextBestAction,
  input: HomePresentationInput,
  identity: ProfessionalIdentityV1,
): { eventIds: HomeEventId[]; meta: PrimaryMeta | null } {
  const work = rowsOf(input.academyWork);
  const attention = input.verificationAttention;
  switch (action.kind) {
    case "complete_assessment_assignment": {
      const idFromHref = action.href.startsWith("/academy/")
        ? action.href.slice("/academy/".length)
        : null;
      const target = idFromHref ?? identity.workload.assessmentAssignmentAttemptId;
      const rows = work.filter((w) => w.workKind === "assessment" && w.workId === target);
      return {
        eventIds: target ? [`test:${target}`] : [],
        meta: metaFromWork(rows[0]),
      };
    }
    case "complete_training_assignment": {
      const id = action.href.startsWith("/academy/training/")
        ? action.href.slice("/academy/training/".length)
        : null;
      return {
        eventIds: id ? [`training:${id}`] : [],
        meta: metaFromWork(work.find((w) => w.workKind === "training" && w.workId === id)),
      };
    }
    case "prepare_interview": {
      const live = rowsOf(input.interviews).filter(isLiveInterview);
      return {
        eventIds: live.map((i) => `interview:${i.caseId}`),
        meta: metaFromInterview(live[0]),
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
  const identityReady = input.identity.state === "ready" ? input.identity.identity : null;
  // The ladder runs on what answered. See UNAVAILABLE_IDENTITY.
  const identity = identityReady ?? UNAVAILABLE_IDENTITY;
  const known = (group: Parameters<typeof isUnavailable>[1]) => !isUnavailable(identity, group);
  const attention = input.verificationAttention;
  const attentionKnown = Boolean(attention) && !attention!.unavailable;
  const work = rowsOf(input.academyWork);
  const history = rowsOf(input.assessmentHistory);
  const interviews = rowsOf(input.interviews);
  const applications = rowsOf(input.applications);
  const preferredName = firstNameOf(input.preferredName);

  /* ---- who this person is -------------------------------------------- */

  let profile: HomeProfile;
  if (input.identity.state === "loading") {
    profile = { state: "loading", greetingName: preferredName };
  } else if (input.identity.state === "error") {
    profile = { state: "unavailable", greetingName: preferredName };
  } else {
    const completeness = computeProfileCompleteness(identity);
    const basicsMissing = completeness.missingSections.some((s) => BASIC_SECTIONS.includes(s));
    const basicsKnown =
      known("account") && known("profile") && known("passport") && known("employment");
    const accountFirstName = firstNameOf(identity.displayName);
    profile = {
      state: "ready",
      preferredName,
      accountFirstName,
      greetingName: preferredName ?? accountFirstName,
      headline: trimmed(identity.headline),
      professionTitleSv: identity.currentProfessionTitleSv,
      professionTitleEn: identity.currentProfessionTitleEn,
      workCountry: identity.workCountry ?? identity.accountCountry,
      workSubJurisdiction: identity.workCountry ? identity.workSubJurisdiction : null,
      complete: basicsKnown && !basicsMissing,
      degraded: identity.unavailable.length > 0,
    };
  }

  /* ---- the ONE primary action ---------------------------------------- */

  const signals = deriveSignals(input, identity);
  const engine = computeNextBestActions(identity, signals, input.now);
  const top = engine.all[0] ?? null;
  const primary: PrimaryAction | null = top
    ? { action: top, classification: top.classification, ...claimAction(top, input, identity) }
    : null;
  const nextAction: NextActionModel =
    input.identity.state === "loading"
      ? { state: "loading" }
      : input.identity.state === "error" && !primary
        ? { state: "unavailable" }
        : { state: "ready", primary, calm: !primary || primary.classification === "suggestion" };
  const claimed = new Set<HomeEventId>(primary?.eventIds ?? []);

  /* ---- the Passport --------------------------------------------------- */

  const counts = countMerits(identity, attention, input.now);
  const passport: PassportSummaryModel =
    input.identity.state === "loading"
      ? { state: "loading" }
      : !known("passport") || !known("claims") || !counts.known
        ? { state: "unavailable" }
        : !identity.hasPassport
          ? { state: "not_opened" }
          : attention === null
            ? { state: "loading" }
            : { state: "counts", counts };

  /* ---- the career picture, and what came before it -------------------- */

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

  // The current report is never listed among the earlier ones, and the
  // newest legacy run is only "current" when the active report IS legacy.
  const currentLegacyId = active?.kind === "legacy_v21" ? active.runId : null;
  const currentSnapshotId =
    active &&
    (active.kind === "discovery_v3_0" ||
      active.kind === "discovery_v3_1" ||
      active.kind === "discovery_unreadable")
      ? active.snapshotId
      : null;
  const earlierReports: EarlierReportsModel = (() => {
    if (!active && !input.activeReportError) return { state: "loading" };
    const legacy = input.legacyRuns;
    const v3 = input.discoveryReports;
    if (legacy.state === "loading" || v3.state === "loading") return { state: "loading" };
    if (legacy.state === "error" && v3.state === "error") return { state: "unavailable" };
    const legacyRuns = rowsOf(legacy).filter((r) => r.id !== currentLegacyId);
    const discoveryReports = rowsOf(v3).filter((r) => r.snapshotId !== currentSnapshotId);
    return {
      state: "ready",
      legacyRuns,
      discoveryReports,
      count: legacyRuns.length + discoveryReports.length,
    };
  })();

  /* ---- employer processes ---------------------------------------------- */

  const employerWork: EmployerWorkModel = (() => {
    if (input.academyWork.state === "loading") return { state: "loading" };
    if (input.academyWork.state === "error") return { state: "unavailable" };
    const tests: TestRow[] = work
      .filter((w) => w.workKind === "assessment")
      .map((w) => {
        const h = history.find((r) => r.attemptId === w.workId);
        const phase = testPhaseOf(w, h);
        const readable = phase === "released" && (h ? Boolean(h.participantSnapshotId) : true);
        return {
          id: `test:${w.workId}`,
          attemptId: w.workId,
          phase,
          useCase: w.useCase,
          employerName: w.employerName,
          titleSv: w.titleSv,
          titleEn: w.titleEn,
          purposeSv: w.purposeSv,
          purposeEn: w.purposeEn,
          jobTitleSv: w.jobTitleSv,
          jobTitleEn: w.jobTitleEn,
          deadline: w.deadline,
          releasedAt: w.releasedAt ?? h?.releasedAt ?? null,
          answered: w.progressDone,
          totalItems: w.progressTotal,
          rawStatus: w.status,
          href:
            phase === "action"
              ? `/academy/${w.workId}`
              : readable
                ? `/academy/report/${w.workId}`
                : null,
          featuredAbove: claimed.has(`test:${w.workId}`),
        };
      });
    const ORDER: Record<TestPhase, number> = {
      action: 0,
      released: 1,
      waiting: 2,
      unknown: 3,
      abandoned: 4,
    };
    tests.sort(
      (a, b) =>
        ORDER[a.phase] - ORDER[b.phase] ||
        (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "") ||
        a.attemptId.localeCompare(b.attemptId),
    );
    const training: TrainingRow[] = work
      .filter((w) => w.workKind === "training")
      .map((w) => ({
        id: `training:${w.workId}`,
        assignmentId: w.workId,
        employerName: w.employerName,
        titleSv: w.titleSv,
        titleEn: w.titleEn,
        status: w.status,
        deadline: w.deadline,
        modulesDone: w.progressDone,
        modulesTotal: w.progressTotal,
        completed: w.status === "completed",
        href: `/academy/training/${w.workId}`,
        featuredAbove: claimed.has(`training:${w.workId}`),
      }))
      .sort(
        (a, b) =>
          Number(a.completed) - Number(b.completed) ||
          (a.deadline ?? "~").localeCompare(b.deadline ?? "~"),
      );
    return {
      state: "ready",
      tests,
      training,
      totalTests: tests.length,
      totalTraining: training.length,
      waitingCount: tests.filter((t) => t.phase === "waiting").length,
    };
  })();

  /* ---- jobs ----------------------------------------------------------- */

  const toJob = (j: PublicJobCard): JobSummary => ({
    id: j.id,
    slug: j.slug,
    titleSv: j.title_sv,
    titleEn: j.title_en,
    location: [j.location_text, j.city, j.country].filter(Boolean).join(", ") || null,
    employerName: j.employer?.name ?? null,
  });
  const jobs: JobsModel = (() => {
    if (input.jobFilter.state === "loading" || input.jobs.state === "loading")
      return { state: "loading" };
    if (input.jobs.state === "error") return { state: "unavailable" };
    const rows = input.jobs.rows.slice(0, MAX_RECOMMENDED_JOBS).map(toJob);
    if (input.jobFilter.state === "family") {
      return rows.length > 0 ? { state: "filtered", jobs: rows } : { state: "filtered_empty" };
    }
    return rows.length > 0 ? { state: "general", jobs: rows } : { state: "general_empty" };
  })();

  /* ---- applications ----------------------------------------------------- */

  const applicationsModel: ApplicationsModel = (() => {
    if (input.applications.state === "loading") return { state: "loading" };
    if (input.applications.state === "error") return { state: "unavailable" };
    const active = applications
      .filter((a) => ACTIVE_APPLICATION_STATUSES.has(a.status))
      .sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt),
      );
    const latest = active[0];
    return {
      state: "ready",
      activeCount: active.length,
      latestActive: latest
        ? {
            id: latest.id,
            jobTitleSv: latest.jobTitleSv,
            jobTitleEn: latest.jobTitleEn,
            employerName: latest.employerName,
            status: latest.status,
            updatedAt: latest.updatedAt,
          }
        : null,
      concludedCount: applications.length - active.length,
      interviewCount:
        input.interviews.state === "ready" ? interviews.filter(isLiveInterview).length : 0,
    };
  })();

  /* ---- career tools ------------------------------------------------------ */

  const tools: ToolItem[] = [];
  if (identityReady && computeCvReadiness(identity).state === "ready") {
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

  /* ---- recent activity ---------------------------------------------------- */

  const events: ActivityItem[] = [];
  for (const w of work) {
    if (w.workKind !== "assessment" || !w.releasedAt) continue;
    events.push({
      id: `result:${w.workId}`,
      kind: "report_released",
      at: w.releasedAt,
      subjectSv: w.employerName,
      subjectEn: w.employerName,
      href: `/academy/report/${w.workId}`,
    });
  }
  if (attentionKnown) {
    for (const i of attention!.information) {
      if (!i.decidedAt) continue;
      const subject = { kind: i.subjectKind, id: i.subjectId };
      // The seam holds CURRENT merits only. An approval whose subject is not
      // among them is about a merit that has since been archived — said so,
      // so the feed cannot contradict a summary that counts current merits.
      const title = identityReady ? currentMeritTitle(identity, subject) : null;
      const archived = identityReady && known("claims") && known("employment") && title === null;
      events.push({
        id: `approved:${i.requestId}`,
        kind: archived ? "verification_approved_archived" : "verification_approved",
        at: i.decidedAt,
        subjectSv: title,
        subjectEn: title,
        href: `/passport/entry/${i.subjectKind}/${i.subjectId}`,
      });
    }
    for (const i of attention!.outcomes) {
      if (!i.decidedAt) continue;
      const title = identityReady
        ? currentMeritTitle(identity, { kind: i.subjectKind, id: i.subjectId })
        : null;
      events.push({
        id: `outcome:${i.requestId}`,
        kind: "verification_rejected",
        at: i.decidedAt,
        subjectSv: title,
        subjectEn: title,
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
      subjectSv: i.employerName,
      subjectEn: i.employerName,
      href: `/my-career/interviews/${i.caseId}`,
    });
  }
  for (const a of applications) {
    events.push({
      id: `application:${a.id}`,
      kind: "application_submitted",
      at: a.createdAt,
      subjectSv: a.jobTitleSv ?? a.jobTitleEn,
      subjectEn: a.jobTitleEn ?? a.jobTitleSv,
      href: "/my-career/applications",
    });
  }
  const sourceStates = [
    input.academyWork.state,
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
    passport,
    career,
    earlierReports,
    jobs,
    applications: applicationsModel,
    employerWork,
    tools,
    activity,
    signals,
  };
}

/** The professional title a surface may print, in one language. */
export function homeRoleTitle(profile: HomeProfileDetails, lang: "sv" | "en"): string | null {
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
