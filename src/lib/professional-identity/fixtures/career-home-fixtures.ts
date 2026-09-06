// Fictional accounts for the career home — every state the correction
// pass names, in one place.
//
// Two consumers share them: the guard that renders every section to static
// markup, and the browser harness that mounts the REAL route against these
// as stubbed server-function responses. What CI checks, what a reviewer
// screenshots and what the browser test clicks through are one account.
//
// Every value is invented. Nothing here reaches a database.

import type { CandidateInterviewRow } from "@/lib/interview-intelligence/candidate.functions";
import type { MyApplicationRow } from "@/lib/job-intelligence/applications.functions";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";
import type { AcademyWorkItem } from "@/lib/security-competency/academy-training.functions";
import type { MyAssessmentRow } from "@/lib/security-competency/assessment-lifecycle.functions";
import type { MyVerificationRequest } from "@/lib/security-passport/verification.functions";
import type { ActiveReport } from "@/lib/career-discovery/active-report.functions";
import type { StoredReportResult } from "@/lib/career-discovery/stored-report.functions";
import {
  deriveVerificationAttention,
  VERIFICATION_ATTENTION_UNAVAILABLE,
} from "../verification-attention";
import type { DiscoveryReportRow, HomePresentationInput, LegacyRunRow } from "../home-presentation";
import type { IdentityClaim, ProfessionalIdentityV1 } from "../types";

export const FIXTURE_NOW = new Date("2026-09-05T10:00:00Z");

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

const EMPTY_IDENTITY: ProfessionalIdentityV1 = {
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
  unavailable: [],
};

type IdentityOverride = Partial<Omit<ProfessionalIdentityV1, "workload">> & {
  readonly workload?: Partial<ProfessionalIdentityV1["workload"]>;
};

export const identity = (over: IdentityOverride = {}): ProfessionalIdentityV1 => ({
  ...EMPTY_IDENTITY,
  ...over,
  workload: { ...EMPTY_IDENTITY.workload, ...(over.workload ?? {}) },
});

export function claim(id: string, over: Partial<IdentityClaim> = {}): IdentityClaim {
  return {
    id,
    claimType: "certification",
    title: `Intyg ${id}`,
    issuerName: "Polismyndigheten",
    issuedOn: "2019-04-01",
    validUntil: null,
    skillLevel: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

export function request(
  over: Partial<MyVerificationRequest> & { id: string },
): MyVerificationRequest {
  return {
    claimId: null,
    periodId: null,
    kind: "cqrityjob_review",
    status: "pending",
    submittedAt: "2026-09-01T09:00:00Z",
    decidedAt: null,
    method: null,
    holderMessage: null,
    validFrom: null,
    validUntil: null,
    targetEmployerId: null,
    ...over,
  };
}

/** One row of the CANONICAL academy work read (scp_my_academy_work). */
export function work(over: Partial<AcademyWorkItem> & { workId: string }): AcademyWorkItem {
  return {
    workKind: "assessment",
    titleSv: "Väktare – rekryteringstest",
    titleEn: "Security officer – recruitment test",
    employerName: "Nordväkt AB",
    status: "in_progress",
    progressDone: 12,
    progressTotal: 56,
    assignedAt: "2026-09-01T08:00:00Z",
    deadline: null,
    releasedAt: null,
    purposeSv: "Rekryteringstest",
    purposeEn: "Recruitment test",
    useCase: "recruitment",
    jobTitleSv: "Väktare, Stockholm",
    jobTitleEn: "Security officer, Stockholm",
    ...over,
  };
}

/** One row of the participant's own pipeline history. */
export function history(over: Partial<MyAssessmentRow> & { attemptId: string }): MyAssessmentRow {
  return {
    assessmentSlug: "vaktare",
    assessmentNameSv: "Väktare – rekryteringstest",
    assessmentNameEn: "Security officer – recruitment test",
    issuerName: "Nordväkt AB",
    purposeCode: "recruitment",
    useCase: "recruitment",
    lifecycleState: "in_progress",
    invitedAt: "2026-09-01T08:00:00Z",
    startedAt: "2026-09-01T09:00:00Z",
    submittedAt: null,
    releasedAt: null,
    participantSnapshotId: null,
    ...over,
  };
}

export function application(over: Partial<MyApplicationRow> & { id: string }): MyApplicationRow {
  return {
    jobId: "job-1",
    jobSlug: "vaktare-stockholm",
    jobTitleSv: "Väktare, Stockholm",
    jobTitleEn: "Security officer, Stockholm",
    employerName: "Nordväkt AB",
    status: "submitted",
    hasCv: true,
    cvSource: "cqrityjob_cv",
    createdAt: "2026-08-30T10:00:00Z",
    updatedAt: "2026-08-30T10:00:00Z",
    ...over,
  };
}

export function interview(
  over: Partial<CandidateInterviewRow> & { caseId: string },
): CandidateInterviewRow {
  return {
    applicationId: null,
    employerName: "Nordväkt AB",
    roleTitle: "Väktare",
    status: "interview_offered",
    updatedAt: "2026-09-02T10:00:00Z",
    ...over,
  };
}

export function job(over: Partial<PublicJobCard> & { id: string; slug: string }): PublicJobCard {
  return {
    title_sv: "Väktare, Stockholm",
    title_en: "Security officer, Stockholm",
    location_text: null,
    country: "SE",
    city: "Stockholm",
    region: null,
    workplace_type: "on_site",
    employment_type: "full_time",
    experience_level: "entry",
    family_id: "guarding",
    profession_slug: "vaktare",
    application_method: "internal",
    application_url: null,
    application_email: null,
    published_at: "2026-09-01T08:00:00Z",
    deadline_at: null,
    employer_id: "emp-1",
    employer: {
      id: "emp-1",
      name: "Nordväkt AB",
      slug: "nordvakt",
      logo_url: null,
      website: null,
      country: "SE",
      description_sv: null,
      description_en: null,
    } as PublicJobCard["employer"],
    ...over,
  };
}

export function activeV31(snapshotId = "snap-1"): ActiveReport {
  return {
    kind: "discovery_v3_1",
    contract: "v3.1",
    snapshotId,
    generatedAt: "2026-08-20T09:00:00Z",
    definitionVersion: "3.1.0",
    scoringVersion: "3.1.0",
    isInternalTest: false,
    locale: "sv",
    identity: { schemaVersion: "cd-report-v3.1.0" } as never,
  };
}
export const ACTIVE_NONE: ActiveReport = { kind: "none" };
export const ACTIVE_LEGACY: ActiveReport = {
  kind: "legacy_v21",
  runId: "run-legacy-1",
  completedAt: "2025-05-01T09:00:00Z",
};

export function storedReport(
  over: {
    snapshotId?: string;
    ranked?: {
      rank: number;
      titleSv: string;
      titleEn: string;
      slug: string | null;
      confidence: "strong" | "moderate" | "indicative";
    }[];
    patterns?: string[];
    locale?: "sv" | "en";
  } = {},
): StoredReportResult {
  const ranked = over.ranked ?? [
    {
      rank: 1,
      titleSv: "Säkerhetssamordnare",
      titleEn: "Security coordinator",
      slug: "sakerhetssamordnare",
      confidence: "moderate" as const,
    },
    {
      rank: 2,
      titleSv: "Ordningsvakt",
      titleEn: "Public order officer",
      slug: "ordningsvakt",
      confidence: "moderate" as const,
    },
    {
      rank: 3,
      titleSv: "Larmoperatör",
      titleEn: "Alarm operator",
      slug: "larmoperator",
      confidence: "indicative" as const,
    },
  ];
  const patterns = over.patterns ?? ["Den strukturerade", "Den lugna problemlösaren"];
  return {
    status: "v3.1",
    snapshotId: over.snapshotId ?? "snap-1",
    sessionId: "sess-1",
    generatedAt: "2026-08-20T09:00:00Z",
    versions: { definition: "3.1.0", content: "3.1.0", scoring: "3.1.0", taxonomy: "3.1.0" },
    snapshot: {
      locale: over.locale ?? "sv",
      completedAt: "2026-08-20T09:00:00Z",
      outputB: {
        leading: { patternId: "p1", name: patterns[0] },
        supporting: patterns.slice(1).map((name, i) => ({ patternId: `p${i + 2}`, name })),
      },
      professions: {
        available: true,
        ranked: ranked.map((r) => ({
          rank: r.rank,
          confidence: r.confidence,
          match: { titleSv: r.titleSv, titleEn: r.titleEn, cigProfessionSlug: r.slug },
        })),
      },
    } as unknown as Extract<StoredReportResult, { status: "v3.1" }>["snapshot"],
  };
}

export const CURRENT_V3_ROW: DiscoveryReportRow = {
  snapshotId: "snap-1",
  generatedAt: "2026-08-20T09:00:00Z",
  definitionVersion: "3.1.0",
};
export const EARLIER_V3_ROW: DiscoveryReportRow = {
  snapshotId: "snap-0",
  generatedAt: "2026-03-02T09:00:00Z",
  definitionVersion: "3.0.0",
};
export const LEGACY_RUN: LegacyRunRow = {
  id: "run-legacy-1",
  completed_at: "2025-05-01T09:00:00Z",
  started_at: "2025-05-01T08:00:00Z",
};
export const OLDER_LEGACY_RUN: LegacyRunRow = {
  id: "run-legacy-0",
  completed_at: "2024-11-11T09:00:00Z",
  started_at: "2024-11-11T08:00:00Z",
};

/* ------------------------------------------------------------------ */
/* The fixtures                                                        */
/* ------------------------------------------------------------------ */

export type FixtureId =
  | "new_user"
  | "eight_unverified"
  | "under_verification"
  | "assessment_deadline"
  | "training_deadline"
  | "sole_primary_test"
  | "released_and_waiting"
  | "no_matching_jobs"
  | "general_jobs"
  | "established"
  | "clarification_exact"
  | "clarifications_many"
  | "history_loading"
  | "legacy_report"
  | "partial_failure"
  | "identity_failed";

export interface HomeFixture {
  readonly id: FixtureId;
  readonly description: string;
  readonly input: HomePresentationInput;
  /** The raw verification requests `input.verificationAttention` was derived
   *  from, so a harness can serve them as listMyVerificationRequests. Null
   *  when the fixture's verification read never answers; "error" when it
   *  failed. */
  readonly requests: readonly MyVerificationRequest[] | null | "error";
}

const BASE_PROFESSIONAL = {
  displayName: "Amina Karlsson",
  accountCountry: "SE",
  workCountry: "SE",
  currentStatus: "working_in_industry" as const,
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  currentProfessionTitleEn: "Security officer",
  yearsOfExperience: "5-10" as const,
  headline: "Väktare med inriktning mot larm och teknik",
  employment: [
    {
      id: "emp-period-1",
      employerName: "Nordväkt AB",
      roleTitle: "Väktare",
      startedOn: "2018-01-01",
      endedOn: null,
      employmentType: "full_time",
      jurisdictionCode: "SE",
      assertionLevel: "self_declared",
      verifierName: null,
      verificationMethod: null,
      verifiedOn: null,
    },
  ],
};
const WITH_REPORT = {
  hasPassport: true,
  discovery: {
    hasCompletedReport: true,
    snapshotId: "snap-1",
    generatedAt: "2026-08-20T09:00:00Z",
    namesCareers: true,
  },
};

/** Seven credentials plus the employment period: eight merits. */
const SEVEN_CLAIMS = Array.from({ length: 7 }, (_, i) => claim(`c${i + 1}`));

const attentionOf = (requests: readonly MyVerificationRequest[]) =>
  deriveVerificationAttention(requests, FIXTURE_NOW);

/* ---- the raw verification requests each fixture is built from --------- */
//
// Named once and referenced twice: the view model derives attention from
// them, and the browser harness serves them as listMyVerificationRequests.
// One source, so the guard, the preview and the real route agree.

export const REQS_NONE: readonly MyVerificationRequest[] = [];
export const REQS_UNDER_REVIEW: readonly MyVerificationRequest[] = [
  ...Array.from({ length: 7 }, (_, i) =>
    request({
      id: `r-c${i + 1}`,
      claimId: `c${i + 1}`,
      submittedAt: `2026-09-0${(i % 3) + 1}T09:00:00Z`,
    }),
  ),
  request({ id: "r-emp", periodId: "emp-period-1", submittedAt: "2026-09-01T09:00:00Z" }),
];
export const REQS_ESTABLISHED: readonly MyVerificationRequest[] = [
  request({ id: "r-open", claimId: "d1", status: "pending" }),
  // Approved a week ago — and the claim it approved has since been
  // superseded, so it is NOT among the current rows the seam holds.
  request({
    id: "r-archived",
    claimId: "c-superseded",
    status: "approved",
    submittedAt: "2026-08-20T09:00:00Z",
    decidedAt: "2026-08-29T09:00:00Z",
    method: "document_review",
  }),
  // Approved recently, on a merit that IS current: the feed names it.
  request({
    id: "r-v1",
    claimId: "v1",
    status: "approved",
    submittedAt: "2026-08-20T09:00:00Z",
    decidedAt: "2026-08-30T09:00:00Z",
    method: "document_review",
  }),
];
export const REQS_CLARIFICATION: readonly MyVerificationRequest[] = [
  request({
    id: "r-q",
    claimId: "c3",
    status: "clarification_requested",
    decidedAt: "2026-09-04T09:00:00Z",
    holderMessage: "Bifoga baksidan av intyget.",
  }),
];

/** THREE open questions, on three merits. With no single entry to open, the
 *  action goes to the Passport's attention REGION rather than guessing one. */
export const REQS_CLARIFICATIONS_MANY: readonly MyVerificationRequest[] = [
  request({
    id: "r-q1",
    claimId: "c1",
    status: "clarification_requested",
    decidedAt: "2026-09-04T09:00:00Z",
    holderMessage: "Bifoga baksidan av intyget.",
  }),
  request({
    id: "r-q2",
    claimId: "c2",
    status: "clarification_requested",
    decidedAt: "2026-09-03T09:00:00Z",
    holderMessage: "Vilket år utfärdades det?",
  }),
  request({
    id: "r-q3",
    periodId: "emp-period-1",
    status: "clarification_requested",
    decidedAt: "2026-09-02T09:00:00Z",
    holderMessage: "Bekräfta slutdatum.",
  }),
];

const READY_EMPTY: Pick<
  HomePresentationInput,
  | "academyWork"
  | "assessmentHistory"
  | "interviews"
  | "applications"
  | "jobs"
  | "legacyRuns"
  | "discoveryReports"
> = {
  academyWork: { state: "ready", rows: [] },
  assessmentHistory: { state: "ready", rows: [] },
  interviews: { state: "ready", rows: [] },
  applications: { state: "ready", rows: [] },
  jobs: { state: "ready", rows: [] },
  legacyRuns: { state: "ready", rows: [] },
  discoveryReports: { state: "ready", rows: [] },
};

/** An established professional with a current v3.1 analysis. */
const PROFESSIONAL_BASE: HomePresentationInput = {
  identity: {
    state: "ready",
    identity: identity({ ...BASE_PROFESSIONAL, ...WITH_REPORT, claims: SEVEN_CLAIMS }),
  },
  verificationAttention: attentionOf(REQS_NONE),
  ...READY_EMPTY,
  jobFilter: { state: "family", familyId: "guarding" },
  jobs: { state: "ready", rows: [job({ id: "j1", slug: "vaktare-stockholm" })] },
  activeReport: activeV31(),
  storedReport: storedReport(),
  discoveryReports: { state: "ready", rows: [CURRENT_V3_ROW] },
  preferredName: "Amina",
  savedCvCount: 0,
  careerDiscoveryOpen: false,
  now: FIXTURE_NOW,
};

const FOUR_APPLICATIONS: MyApplicationRow[] = [
  // Withdrawn, and updated MOST recently: must never stand in for the
  // latest active application.
  application({
    id: "a-withdrawn",
    status: "withdrawn",
    jobTitleSv: "Skyddsvakt, Kiruna",
    jobTitleEn: "Protective security officer, Kiruna",
    employerName: "Gruv AB",
    createdAt: "2026-08-10T09:00:00Z",
    updatedAt: "2026-09-04T12:00:00Z",
  }),
  application({
    id: "a1",
    status: "reviewing",
    createdAt: "2026-08-28T09:00:00Z",
    updatedAt: "2026-09-03T09:00:00Z",
  }),
  application({
    id: "a2",
    status: "submitted",
    jobTitleSv: "Ordningsvakt, Göteborg",
    jobTitleEn: "Public order officer, Gothenburg",
    employerName: "Väst Bevakning",
    createdAt: "2026-09-01T09:00:00Z",
    updatedAt: "2026-09-01T09:00:00Z",
  }),
  application({
    id: "a3",
    status: "interview",
    jobTitleSv: "Larmoperatör, Malmö",
    jobTitleEn: "Alarm operator, Malmö",
    employerName: "Syd Larm",
    createdAt: "2026-08-20T09:00:00Z",
    updatedAt: "2026-08-29T09:00:00Z",
  }),
  application({
    id: "a4",
    status: "submitted",
    createdAt: "2026-08-15T09:00:00Z",
    updatedAt: "2026-08-15T09:00:00Z",
  }),
];

export const FIXTURES: readonly HomeFixture[] = [
  {
    id: "new_user",
    description:
      "A brand-new account: no career analysis, no Passport, nothing recorded, no filter — general jobs.",
    requests: REQS_NONE,
    input: {
      identity: {
        state: "ready",
        identity: identity({ displayName: "Nyregistrerad Användare", accountCountry: "SE" }),
      },
      verificationAttention: attentionOf(REQS_NONE),
      ...READY_EMPTY,
      jobFilter: { state: "none" },
      jobs: {
        state: "ready",
        rows: [
          job({ id: "g1", slug: "vaktare-stockholm" }),
          job({
            id: "g2",
            slug: "ordningsvakt-goteborg",
            title_sv: "Ordningsvakt, Göteborg",
            title_en: "Public order officer, Gothenburg",
            city: "Göteborg",
          }),
        ],
      },
      activeReport: ACTIVE_NONE,
      preferredName: null,
      savedCvCount: 0,
      careerDiscoveryOpen: true,
      now: FIXTURE_NOW,
    },
  },
  {
    id: "eight_unverified",
    description:
      "The brief's screenshot state: a completed career analysis and eight recorded merits, none verified.",
    requests: REQS_NONE,
    input: PROFESSIONAL_BASE,
  },
  {
    id: "under_verification",
    description: "Every merit is under review with the correct verifier. Nothing is required.",
    requests: REQS_UNDER_REVIEW,
    input: {
      ...PROFESSIONAL_BASE,
      verificationAttention: attentionOf(REQS_UNDER_REVIEW),
    },
  },
  {
    id: "assessment_deadline",
    description:
      "A recruitment test with a deadline, requested by an organisation for a named role.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({
          ...BASE_PROFESSIONAL,
          ...WITH_REPORT,
          claims: SEVEN_CLAIMS,
          workload: {
            assessmentAssignmentCount: 1,
            assessmentAssignmentAttemptId: "att-open",
            applicationCount: 1,
          },
        }),
      },
      academyWork: {
        state: "ready",
        rows: [work({ workId: "att-open", deadline: "2026-09-12T23:59:00Z" })],
      },
      assessmentHistory: { state: "ready", rows: [history({ attemptId: "att-open" })] },
      applications: {
        state: "ready",
        rows: [application({ id: "a1", status: "reviewing", updatedAt: "2026-09-02T09:00:00Z" })],
      },
    },
  },
  {
    id: "training_deadline",
    description: "Employer-assigned training with a due date, and nothing else waiting.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      academyWork: {
        state: "ready",
        rows: [
          work({
            workId: "tr-1",
            workKind: "training",
            titleSv: "Brandskydd – grundprogram",
            titleEn: "Fire safety – foundation programme",
            employerName: "Nordväkt AB",
            status: "assigned",
            progressDone: 1,
            progressTotal: 4,
            deadline: "2026-09-20T23:59:00Z",
            useCase: "workforce",
            purposeSv: "Kompetensutveckling",
            purposeEn: "Competence development",
            jobTitleSv: null,
            jobTitleEn: null,
          }),
        ],
      },
    },
  },
  {
    id: "sole_primary_test",
    description:
      "One open test, no deadline: it is the recommended step, and the tests list must not claim no test exists.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({
          ...BASE_PROFESSIONAL,
          ...WITH_REPORT,
          claims: SEVEN_CLAIMS,
          workload: { assessmentAssignmentCount: 1, assessmentAssignmentAttemptId: "att-only" },
        }),
      },
      academyWork: { state: "ready", rows: [work({ workId: "att-only" })] },
      assessmentHistory: { state: "ready", rows: [history({ attemptId: "att-only" })] },
    },
  },
  {
    id: "released_and_waiting",
    description:
      "A released result (no read receipt), three tests waiting on the employer, one attempt in a state the pipeline does not describe, four applications.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({
          ...BASE_PROFESSIONAL,
          ...WITH_REPORT,
          claims: SEVEN_CLAIMS,
          workload: {
            releasedReportCount: 1,
            releasedReportAttemptId: "att-released",
            applicationCount: 5,
          },
        }),
      },
      academyWork: {
        state: "ready",
        rows: [
          work({
            workId: "att-released",
            status: "released",
            progressDone: 56,
            progressTotal: 56,
            releasedAt: "2026-09-04T08:00:00Z",
          }),
          work({
            workId: "att-w1",
            status: "submitted",
            progressDone: 56,
            progressTotal: 56,
            employerName: "Väst Bevakning",
            jobTitleSv: "Ordningsvakt, Göteborg",
            jobTitleEn: "Public order officer, Gothenburg",
          }),
          work({ workId: "att-w2", status: "scored", progressDone: 56, progressTotal: 56 }),
          work({ workId: "att-w3", status: "submitted", progressDone: 56, progressTotal: 56 }),
          // An expired attempt: NOT waiting, NOT released — shown as-is.
          work({
            workId: "att-x",
            status: "expired",
            progressDone: 3,
            progressTotal: 56,
            employerName: "Gruv AB",
            jobTitleSv: "Skyddsvakt, Kiruna",
            jobTitleEn: "Protective security officer, Kiruna",
          }),
        ],
      },
      assessmentHistory: {
        state: "ready",
        rows: [
          history({
            attemptId: "att-released",
            lifecycleState: "result_available",
            submittedAt: "2026-09-02T09:00:00Z",
            releasedAt: "2026-09-04T08:00:00Z",
            participantSnapshotId: "psnap-1",
          }),
          history({
            attemptId: "att-w1",
            lifecycleState: "under_review",
            submittedAt: "2026-09-03T09:00:00Z",
            issuerName: "Väst Bevakning",
          }),
          history({
            attemptId: "att-w2",
            lifecycleState: "processing",
            submittedAt: "2026-09-03T09:00:00Z",
          }),
          history({
            attemptId: "att-w3",
            lifecycleState: "ready_to_release",
            submittedAt: "2026-09-03T09:00:00Z",
          }),
        ],
      },
      applications: { state: "ready", rows: FOUR_APPLICATIONS },
    },
  },
  {
    id: "no_matching_jobs",
    description:
      "A completed analysis names a family with nothing open in it; four live applications.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({
          ...BASE_PROFESSIONAL,
          ...WITH_REPORT,
          claims: SEVEN_CLAIMS.slice(0, 3).map((c) => ({
            ...c,
            assertionLevel: "verified",
            verifierName: "CQrityjob",
            verificationMethod: "document_review",
            verifiedOn: "2026-07-01",
          })),
          workload: { applicationCount: 5 },
        }),
      },
      jobs: { state: "ready", rows: [] },
      applications: { state: "ready", rows: FOUR_APPLICATIONS },
    },
  },
  {
    id: "general_jobs",
    description:
      "A completed analysis is absent, so there is no filter: the newest vacancies, said as such.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({ ...BASE_PROFESSIONAL, hasPassport: true, claims: SEVEN_CLAIMS }),
      },
      activeReport: ACTIVE_NONE,
      storedReport: undefined,
      discoveryReports: { state: "ready", rows: [] },
      jobFilter: { state: "none" },
      jobs: {
        state: "ready",
        rows: [
          job({ id: "g1", slug: "vaktare-stockholm" }),
          job({
            id: "g2",
            slug: "ordningsvakt-goteborg",
            title_sv: "Ordningsvakt, Göteborg",
            title_en: "Public order officer, Gothenburg",
            city: "Göteborg",
          }),
          job({
            id: "g3",
            slug: "larmoperator-malmo",
            title_sv: "Larmoperatör, Malmö",
            title_en: "Alarm operator, Malmö",
            city: "Malmö",
          }),
        ],
      },
      careerDiscoveryOpen: true,
    },
  },
  {
    id: "established",
    description:
      "An established holder: verified merits, an approval on a merit since archived, a saved CV, a Career Card, filtered jobs, an earlier analysis.",
    requests: REQS_ESTABLISHED,
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({
          ...BASE_PROFESSIONAL,
          ...WITH_REPORT,
          claims: [
            claim("v1", {
              title: "Väktarutbildning grundkurs (VU1)",
              assertionLevel: "verified",
              verifierName: "CQrityjob",
              verificationMethod: "document_review",
              verifiedOn: "2026-08-30",
            }),
            claim("v2", {
              title: "Ordningsvaktsförordnande",
              assertionLevel: "verified",
              verifierName: "Nordväkt AB",
              verificationMethod: "employer_attestation",
              verifiedOn: "2026-07-11",
            }),
            claim("v3", {
              title: "Hjärt- och lungräddning",
              assertionLevel: "verified",
              verifierName: "CQrityjob",
              verificationMethod: "document_review",
              verifiedOn: "2024-05-01",
              validUntil: "2026-05-01",
            }),
            claim("d1", { title: "Brandskyddsutbildning", assertionLevel: "document_provided" }),
            claim("s1", {
              title: "Engelska",
              claimType: "language",
              assertionLevel: "self_declared",
            }),
          ],
          workload: { applicationCount: 2 },
        }),
      },
      verificationAttention: attentionOf(REQS_ESTABLISHED),
      applications: {
        state: "ready",
        rows: [
          application({ id: "a1", status: "reviewing", updatedAt: "2026-09-01T09:00:00Z" }),
          application({
            id: "a2",
            status: "submitted",
            jobTitleSv: "Ordningsvakt, Göteborg",
            jobTitleEn: "Public order officer, Gothenburg",
            employerName: "Väst Bevakning",
            createdAt: "2026-08-28T09:00:00Z",
            updatedAt: "2026-08-28T09:00:00Z",
          }),
        ],
      },
      jobs: {
        state: "ready",
        rows: [
          job({ id: "j1", slug: "vaktare-stockholm" }),
          job({
            id: "j2",
            slug: "ordningsvakt-goteborg",
            title_sv: "Ordningsvakt, Göteborg",
            title_en: "Public order officer, Gothenburg",
            city: "Göteborg",
          }),
          job({
            id: "j3",
            slug: "larmoperator-malmo",
            title_sv: "Larmoperatör, Malmö",
            title_en: "Alarm operator, Malmö",
            city: "Malmö",
          }),
        ],
      },
      discoveryReports: { state: "ready", rows: [CURRENT_V3_ROW, EARLIER_V3_ROW] },
      legacyRuns: { state: "ready", rows: [LEGACY_RUN] },
      savedCvCount: 1,
      careerDiscoveryOpen: true,
    },
  },
  {
    id: "clarification_exact",
    description: "One reviewer question, on one merit: the action opens that merit.",
    requests: REQS_CLARIFICATION,
    input: {
      ...PROFESSIONAL_BASE,
      verificationAttention: attentionOf(REQS_CLARIFICATION),
    },
  },
  {
    id: "clarifications_many",
    description:
      "Three reviewer questions on three merits: no single entry to open, so the action goes to the Passport's attention region.",
    requests: REQS_CLARIFICATIONS_MANY,
    input: {
      ...PROFESSIONAL_BASE,
      verificationAttention: attentionOf(REQS_CLARIFICATIONS_MANY),
    },
  },
  {
    id: "history_loading",
    description:
      "The career report is ready while the report history is still loading: no disclosure, no crash.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      legacyRuns: { state: "loading" },
      discoveryReports: { state: "loading" },
    },
  },
  {
    id: "legacy_report",
    description:
      "The newest analysis is a v2.1 report; an older legacy run is the only earlier one.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({ ...BASE_PROFESSIONAL, hasPassport: true, claims: SEVEN_CLAIMS }),
      },
      activeReport: ACTIVE_LEGACY,
      storedReport: undefined,
      discoveryReports: { state: "ready", rows: [] },
      legacyRuns: { state: "ready", rows: [LEGACY_RUN, OLDER_LEGACY_RUN] },
      jobFilter: { state: "family", familyId: "guarding" },
    },
  },
  {
    id: "partial_failure",
    description:
      "The verification read, jobs and applications failed; interviews still loading; provenance unreadable. Nothing renders as a zero, nothing is a permanent skeleton.",
    requests: "error",
    input: {
      ...PROFESSIONAL_BASE,
      identity: {
        state: "ready",
        identity: identity({
          ...BASE_PROFESSIONAL,
          ...WITH_REPORT,
          claims: SEVEN_CLAIMS,
          unavailable: ["provenance"],
        }),
      },
      verificationAttention: VERIFICATION_ATTENTION_UNAVAILABLE,
      interviews: { state: "loading" },
      applications: { state: "error" },
      jobs: { state: "error" },
      activeReportError: true,
      activeReport: undefined,
      storedReportError: true,
      savedCvCount: undefined,
      careerDiscoveryOpen: undefined,
    },
  },
  {
    id: "identity_failed",
    description:
      "The identity read failed while every other read succeeded — and a test with a deadline is still waiting.",
    requests: REQS_NONE,
    input: {
      ...PROFESSIONAL_BASE,
      identity: { state: "error" },
      academyWork: {
        state: "ready",
        rows: [work({ workId: "att-open", deadline: "2026-09-12T23:59:00Z" })],
      },
      assessmentHistory: { state: "ready", rows: [history({ attemptId: "att-open" })] },
      applications: {
        state: "ready",
        rows: [application({ id: "a1", status: "reviewing", updatedAt: "2026-09-02T09:00:00Z" })],
      },
      preferredName: "Amina",
    },
  },
];

export function fixtureById(id: string): HomeFixture | undefined {
  return FIXTURES.find((f) => f.id === id);
}
