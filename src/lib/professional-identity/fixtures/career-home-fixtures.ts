// Fictional accounts for the career home — the ten states the brief names.
//
// ── WHY THEY LIVE IN src/ AND NOT IN A TEST FOLDER ─────────────────────
//
// Two consumers need the same data: the guard script that renders every
// section to static markup, and the development-only preview route that
// screenshots them at 375 and 1440. Keeping one copy is what stops "the
// tests pass but the page looks wrong" — they are looking at the same
// account. `src/lib/security-passport/fixtures/personas.ts` established
// this pattern for the Passport prototype.
//
// ── EVERY VALUE IS INVENTED ────────────────────────────────────────────
//
// No real person, employer, credential or report appears here. Nothing in
// this file reaches a database, and the preview route that renders it
// refuses to resolve outside development.

import type { CandidateInterviewRow } from "@/lib/interview-intelligence/candidate.functions";
import type { MyApplicationRow } from "@/lib/job-intelligence/applications.functions";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";
import type { MyAssignment } from "@/lib/security-competency/academy-learning.functions";
import type { MyVerificationRequest } from "@/lib/security-passport/verification.functions";
import type { ActiveReport } from "@/lib/career-discovery/active-report.functions";
import type { StoredReportResult } from "@/lib/career-discovery/stored-report.functions";
import { deriveVerificationAttention } from "../verification-attention";
import type { HomePresentationInput } from "../home-presentation";
import type { IdentityClaim, ProfessionalIdentityV1 } from "../types";

/** The clock every fixture is evaluated against, so a screenshot taken in
 *  six months still shows the same page. */
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
    employerWorkspaceCount: 0,
  },
  unavailable: [],
};

/** `workload` is accepted a field at a time: a fixture that cares about one
 *  count should not have to restate the other six. */
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

export function assignment(over: Partial<MyAssignment> & { attemptId: string }): MyAssignment {
  return {
    mode: "assessment",
    programmeNameSv: "Väktare – rekryteringsbedömning",
    programmeNameEn: "Security officer – recruitment assessment",
    employerName: "Nordväkt AB",
    attemptStatus: "released",
    answered: 56,
    totalItems: 56,
    deadline: null,
    releasedAt: "2026-09-04T08:00:00Z",
    purposeSv: "Rekryteringsbedömning",
    purposeEn: "Recruitment assessment",
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

/** Which report is current, as `getActiveCareerReport` answers it. */
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

/** A stored v3.1 career-analysis result, trimmed to the fields the home
 *  reads. Cast once, here, so no fixture has to restate the whole snapshot
 *  contract to name three professions. */
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
          match: {
            titleSv: r.titleSv,
            titleEn: r.titleEn,
            cigProfessionSlug: r.slug,
          },
        })),
      },
    } as unknown as Extract<StoredReportResult, { status: "v3.1" }>["snapshot"],
  };
}

/* ------------------------------------------------------------------ */
/* The ten fixtures                                                    */
/* ------------------------------------------------------------------ */

export type FixtureId =
  | "new_user"
  | "eight_unverified"
  | "under_verification"
  | "assessment_deadline"
  | "released_and_waiting"
  | "no_matching_jobs"
  | "established"
  | "partial_failure";

export interface HomeFixture {
  readonly id: FixtureId;
  /** What state of the world this account is in, in one line. */
  readonly description: string;
  readonly input: HomePresentationInput;
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

const EMPTY_SOURCES = {
  assignments: { state: "ready" as const, rows: [] },
  interviews: { state: "ready" as const, rows: [] },
  applications: { state: "ready" as const, rows: [] },
  jobs: { state: "ready" as const, rows: [] },
};

/** Eight recorded MERITS in total, none verified, none under review: seven
 *  credentials plus the one employment period on BASE_PROFESSIONAL. The
 *  Passport counts employment as a merit, so a fixture that wanted eight
 *  merits and listed eight credentials would have nine. */
const EIGHT_CLAIMS = Array.from({ length: 7 }, (_, i) => claim(`c${i + 1}`));

export const FIXTURES: readonly HomeFixture[] = [
  {
    id: "new_user",
    description: "A brand-new account: no career analysis, no Passport, nothing recorded.",
    input: {
      identity: identity({ displayName: "Nyregistrerad Användare", accountCountry: "SE" }),
      verificationAttention: deriveVerificationAttention([], FIXTURE_NOW),
      ...EMPTY_SOURCES,
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
    input: {
      identity: identity({
        ...BASE_PROFESSIONAL,
        hasPassport: true,
        claims: EIGHT_CLAIMS,
        discovery: {
          hasCompletedReport: true,
          snapshotId: "snap-1",
          generatedAt: "2026-08-20T09:00:00Z",
          namesCareers: true,
        },
      }),
      verificationAttention: deriveVerificationAttention([], FIXTURE_NOW),
      ...EMPTY_SOURCES,
      jobs: { state: "ready", rows: [job({ id: "j1", slug: "vaktare-stockholm" })] },
      activeReport: activeV31(),
      storedReport: storedReport(),
      preferredName: "Amina",
      savedCvCount: 0,
      careerDiscoveryOpen: false,
      now: FIXTURE_NOW,
    },
  },
  {
    id: "under_verification",
    description: "Merits are under review with the correct verifier. Nothing is required.",
    input: {
      identity: identity({
        ...BASE_PROFESSIONAL,
        hasPassport: true,
        claims: EIGHT_CLAIMS,
        discovery: {
          hasCompletedReport: true,
          snapshotId: "snap-1",
          generatedAt: "2026-08-20T09:00:00Z",
          namesCareers: true,
        },
      }),
      // EVERY merit, the employment period included: "nothing is required of
      // you" is only true when nothing is left unsubmitted, and an employment
      // nobody has been asked about is exactly something to submit.
      verificationAttention: deriveVerificationAttention(
        [
          ...EIGHT_CLAIMS.map((c, i) =>
            request({
              id: `r-${c.id}`,
              claimId: c.id,
              submittedAt: `2026-09-0${(i % 3) + 1}T09:00:00Z`,
            }),
          ),
          request({ id: "r-emp", periodId: "emp-period-1", submittedAt: "2026-09-01T09:00:00Z" }),
        ],
        FIXTURE_NOW,
      ),
      ...EMPTY_SOURCES,
      activeReport: activeV31(),
      storedReport: storedReport(),
      preferredName: "Amina",
      savedCvCount: 0,
      careerDiscoveryOpen: false,
      now: FIXTURE_NOW,
    },
  },
  {
    id: "assessment_deadline",
    description: "An employer is waiting on an assessment that carries a deadline.",
    input: {
      identity: identity({
        ...BASE_PROFESSIONAL,
        hasPassport: true,
        claims: EIGHT_CLAIMS,
        workload: { assessmentAssignmentCount: 1, assessmentAssignmentAttemptId: "att-open" },
        discovery: {
          hasCompletedReport: true,
          snapshotId: "snap-1",
          generatedAt: "2026-08-20T09:00:00Z",
          namesCareers: true,
        },
      }),
      verificationAttention: deriveVerificationAttention([], FIXTURE_NOW),
      ...EMPTY_SOURCES,
      assignments: {
        state: "ready",
        rows: [
          assignment({
            attemptId: "att-open",
            attemptStatus: "in_progress",
            answered: 12,
            totalItems: 56,
            deadline: "2026-09-12T23:59:00Z",
            releasedAt: null,
          }),
        ],
      },
      activeReport: activeV31(),
      storedReport: storedReport(),
      preferredName: "Amina",
      savedCvCount: 0,
      careerDiscoveryOpen: false,
      now: FIXTURE_NOW,
    },
  },
  {
    id: "released_and_waiting",
    description: "A released result, plus three assessments still waiting on the employer.",
    input: {
      identity: identity({
        ...BASE_PROFESSIONAL,
        hasPassport: true,
        claims: EIGHT_CLAIMS,
        workload: {
          releasedReportCount: 1,
          releasedReportAttemptId: "att-released",
          applicationCount: 4,
        },
        discovery: {
          hasCompletedReport: true,
          snapshotId: "snap-1",
          generatedAt: "2026-08-20T09:00:00Z",
          namesCareers: true,
        },
      }),
      verificationAttention: deriveVerificationAttention([], FIXTURE_NOW),
      ...EMPTY_SOURCES,
      assignments: {
        state: "ready",
        rows: [
          assignment({ attemptId: "att-released" }),
          assignment({ attemptId: "att-w1", attemptStatus: "submitted", releasedAt: null }),
          assignment({ attemptId: "att-w2", attemptStatus: "submitted", releasedAt: null }),
          assignment({ attemptId: "att-w3", attemptStatus: "submitted", releasedAt: null }),
        ],
      },
      applications: {
        state: "ready",
        rows: [
          application({ id: "a1", status: "reviewing", createdAt: "2026-09-01T09:00:00Z" }),
          application({ id: "a2", status: "submitted", createdAt: "2026-08-28T09:00:00Z" }),
          application({ id: "a3", status: "interview", createdAt: "2026-08-20T09:00:00Z" }),
          application({ id: "a4", status: "submitted", createdAt: "2026-08-15T09:00:00Z" }),
        ],
      },
      activeReport: activeV31(),
      storedReport: storedReport(),
      preferredName: "Amina",
      savedCvCount: 0,
      careerDiscoveryOpen: false,
      now: FIXTURE_NOW,
    },
  },
  {
    id: "no_matching_jobs",
    description:
      "Four live applications, a completed analysis, and no open roles in the stated family.",
    input: {
      identity: identity({
        ...BASE_PROFESSIONAL,
        hasPassport: true,
        claims: EIGHT_CLAIMS.slice(0, 3).map((c) => ({
          ...c,
          assertionLevel: "verified",
          verifierName: "CQrityjob",
          verificationMethod: "document_review",
          verifiedOn: "2026-07-01",
        })),
        workload: { applicationCount: 4 },
        discovery: {
          hasCompletedReport: true,
          snapshotId: "snap-1",
          generatedAt: "2026-08-20T09:00:00Z",
          namesCareers: true,
        },
      }),
      verificationAttention: deriveVerificationAttention([], FIXTURE_NOW),
      ...EMPTY_SOURCES,
      applications: {
        state: "ready",
        rows: [
          application({ id: "a1", status: "reviewing", createdAt: "2026-09-01T09:00:00Z" }),
          application({ id: "a2", status: "submitted", createdAt: "2026-08-28T09:00:00Z" }),
          application({ id: "a3", status: "interview", createdAt: "2026-08-20T09:00:00Z" }),
          application({ id: "a4", status: "submitted", createdAt: "2026-08-15T09:00:00Z" }),
        ],
      },
      activeReport: activeV31(),
      storedReport: storedReport(),
      preferredName: "Amina",
      savedCvCount: 0,
      careerDiscoveryOpen: false,
      now: FIXTURE_NOW,
    },
  },
  {
    id: "established",
    description:
      "An established holder: verified merits, a saved CV, a Career Card, and nothing waiting.",
    input: {
      identity: identity({
        ...BASE_PROFESSIONAL,
        hasPassport: true,
        claims: [
          claim("v1", {
            title: "Väktarutbildning grundkurs (VU1)",
            assertionLevel: "verified",
            verifierName: "CQrityjob",
            verificationMethod: "document_review",
            verifiedOn: "2026-06-01",
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
        workload: { applicationCount: 2, draftClaimCount: 0 },
        discovery: {
          hasCompletedReport: true,
          snapshotId: "snap-1",
          generatedAt: "2026-08-20T09:00:00Z",
          namesCareers: true,
        },
      }),
      verificationAttention: deriveVerificationAttention(
        [request({ id: "r-open", claimId: "d1", status: "pending" })],
        FIXTURE_NOW,
      ),
      ...EMPTY_SOURCES,
      applications: {
        state: "ready",
        rows: [
          application({ id: "a1", status: "reviewing", createdAt: "2026-09-01T09:00:00Z" }),
          application({ id: "a2", status: "submitted", createdAt: "2026-08-28T09:00:00Z" }),
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
      activeReport: activeV31(),
      storedReport: storedReport(),
      preferredName: "Amina",
      savedCvCount: 1,
      careerDiscoveryOpen: true,
      now: FIXTURE_NOW,
    },
  },
  {
    id: "partial_failure",
    description: "One module failed and one is still loading: nothing may render as a zero.",
    input: {
      identity: identity({
        ...BASE_PROFESSIONAL,
        hasPassport: true,
        claims: EIGHT_CLAIMS,
        discovery: {
          hasCompletedReport: true,
          snapshotId: "snap-1",
          generatedAt: "2026-08-20T09:00:00Z",
          namesCareers: true,
        },
        unavailable: ["provenance"],
      }),
      verificationAttention: null,
      assignments: { state: "error" },
      interviews: { state: "loading" },
      applications: { state: "error" },
      jobs: { state: "error" },
      activeReportError: true,
      storedReportError: true,
      preferredName: "Amina",
      savedCvCount: undefined,
      careerDiscoveryOpen: undefined,
      now: FIXTURE_NOW,
    },
  },
];

export function fixtureById(id: string): HomeFixture | undefined {
  return FIXTURES.find((f) => f.id === id);
}
