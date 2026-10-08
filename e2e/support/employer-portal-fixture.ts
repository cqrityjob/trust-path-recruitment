// One synthetic organisation for the employer-portal evidence suite.
//
// Everything a signed-in owner's overview, recruitment list, application list,
// tests overview, interview list and reports page ask the server for, answered
// from here by e2e/support/public-entry-harness.ts. Nothing is real: the ids
// are fixed UUIDs, the people are invented, and the suite refuses any request
// that would leave the machine.
//
// The numbers are chosen so every surface has something to show AND so the
// two application populations on the overview differ: "Nya ansökningar" counts
// status=submitted across non-archived recruitments (2), while the review
// block counts every application ever received, archived included (5).

export const EMPLOYER_ID = "00000000-0000-4000-8000-00000000e0c1";
export const SLUG = "exempelvakt";
const USER = "00000000-0000-4000-8000-0000publicentry".slice(0, 36);
const JOB_UPPSALA = "00000000-0000-4000-8000-0000000000a1";
const JOB_DRAFT = "00000000-0000-4000-8000-0000000000a2";
const JOB_READY = "00000000-0000-4000-8000-0000000000a3";
const APP = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const CASE = (n: number) => `00000000-0000-4000-8000-0000000000c${n}`;
const ATTEMPT = (n: number) => `00000000-0000-4000-8000-0000000000d${n}`;
const AT = "2026-10-01T09:00:00.000Z";

export const workspace = {
  employerId: EMPLOYER_ID,
  employerSlug: SLUG,
  employerName: "Exempelvakt AB",
  employerLogoUrl: null,
  employerStatus: "active",
  employerCreatedAt: "2026-06-01T09:00:00.000Z",
  role: "owner",
};

const intelligence = (
  received: number,
  reviewed: number,
  green: number,
  yellow: number,
  gray: number,
  notEstablished: number,
  archived: number,
  decided: number,
) => ({
  received,
  reviewed,
  remaining: received - reviewed,
  green,
  yellow,
  gray,
  notEstablished,
  filtered: received,
  filteredReviewed: reviewed,
  filteredRemaining: received - reviewed,
  archived,
  withdrawn: 0,
  decided,
});

const recruitment = (
  jobId: string,
  title: string,
  phase: "draft" | "published" | "closed",
  jobStatus: string,
  counts: { total: number; newCount: number; unresolved: number; interviewStage: number },
  intelligenceCounts: ReturnType<typeof intelligence>,
) => ({
  intelligenceCounts,
  archivedAt: null,
  jobId,
  titleSv: title,
  titleEn: title,
  jobStatus,
  phase,
  applicationMethod: "platform",
  publishedAt: phase === "draft" ? null : "2026-09-10T08:00:00.000Z",
  deadlineAt: phase === "published" ? "2026-11-30T22:59:59.000Z" : "2026-09-30T22:59:59.000Z",
  updatedAt: AT,
  responsibleUserId: USER,
  responsibleName: "Rita Rekryterare",
  ...counts,
  nextInterviewAt: phase === "published" ? "2026-10-14T08:00:00.000Z" : null,
});

const candidate = (
  n: number,
  name: string,
  status: string,
  requirementStatus: "green" | "yellow" | "gray" | "not_established",
  reviewState: "reviewed" | "pending" | "stale",
) => ({
  requirementStatus,
  reviewState,
  analysisState: "not_used",
  nextAction: reviewState === "pending" && requirementStatus === "gray" ? "Be om intyg" : null,
  reviewRevision: reviewState === "reviewed" ? 2 : 0,
  profileVersion: 1,
  canManage: true,
  applicationId: APP(n),
  jobId: JOB_UPPSALA,
  jobTitle: "Väktare, Uppsala",
  jobTitleSv: "Väktare, Uppsala",
  jobTitleEn: "Security guard, Uppsala",
  name,
  status,
  appliedAt: `2026-09-2${n}T07:00:00.000Z`,
  updatedAt: AT,
  firstViewedAt: n === 1 ? null : AT,
  responsibleUserId: n === 2 ? USER : null,
  responsibleName: n === 2 ? "Rita Rekryterare" : null,
  metaVersion: 1,
  nextActivityAt: null,
  nextActivityTimezone: null,
  nextActivityStatus: null,
  hasCv: true,
  mandatoryNoCount: requirementStatus === "yellow" ? 1 : 0,
  answeredCount: 3,
  answers: {},
  notesCount: 0,
  messagesCount: 0,
});

const uppsalaIntelligence = intelligence(5, 1, 1, 1, 1, 1, 1, 1);

export const recruitmentOverview = {
  recruitments: [
    recruitment(
      JOB_UPPSALA,
      "Väktare, Uppsala",
      "published",
      "published",
      { total: 4, newCount: 2, unresolved: 4, interviewStage: 1 },
      uppsalaIntelligence,
    ),
    recruitment(
      JOB_DRAFT,
      "Ordningsvakt, Gävle",
      "draft",
      "draft",
      { total: 0, newCount: 0, unresolved: 0, interviewStage: 0 },
      intelligence(0, 0, 0, 0, 0, 0, 0, 0),
    ),
    recruitment(
      JOB_READY,
      "Skyddsvakt, Västerås",
      "closed",
      "published",
      { total: 2, newCount: 0, unresolved: 0, interviewStage: 0 },
      intelligence(2, 2, 2, 0, 0, 0, 0, 2),
    ),
  ],
  upcomingInterviews: [
    {
      bookingId: "00000000-0000-4000-8000-0000000000f1",
      applicationId: APP(3),
      jobId: JOB_UPPSALA,
      jobTitleSv: "Väktare, Uppsala",
      jobTitleEn: "Security guard, Uppsala",
      candidateName: "Kim Kandidat",
      startsAt: "2026-10-14T08:00:00.000Z",
      durationMinutes: 45,
      timezone: "Europe/Stockholm",
      locationKind: "video",
      status: "confirmed",
    },
  ],
  team: [{ userId: USER, name: "Rita Rekryterare", role: "owner", isSelf: true }],
  myUserId: USER,
  role: "owner",
  receiptsNeedingAttention: 0,
};

export const candidatePage = {
  rows: [
    candidate(1, "Ali Ansökande", "submitted", "gray", "pending"),
    candidate(2, "Birgitta Bevakning", "reviewing", "green", "reviewed"),
    candidate(3, "Kim Kandidat", "interview", "yellow", "stale"),
    candidate(4, "Dana Dörrvakt", "submitted", "not_established", "pending"),
  ],
  total: 4,
  page: 1,
  pages: 1,
  from: 1,
  to: 4,
  counts: { total: 5, new: 2, review: 1, interview: 1, hired: 0, decided: 1 },
  intelligenceCounts: uppsalaIntelligence,
  yesNoQuestions: [],
};

const job = (id: string, title: string, status: string, published: boolean) => ({
  id,
  slug: title.toLowerCase().replace(/[^a-z]+/g, "-"),
  short_id: id.slice(-4),
  status,
  title_sv: title,
  title_en: title,
  application_method: "platform",
  published_at: published ? "2026-09-10T08:00:00.000Z" : null,
  deadline_at: published ? "2026-11-30T22:59:59.000Z" : null,
  expires_at: null,
  updated_at: AT,
});

const interviewCase = (n: number, name: string, status: string, proposals = 0) => ({
  id: CASE(n),
  title: `Intervju ${name}`,
  candidateDisplayName: name,
  status,
  updatedAt: AT,
  packName: "Väktare (SEV1)",
  validationLabel: "pilot_hypothesis",
  proposalsAwaitingReview: proposals,
});

const pipelineRow = (n: number, lifecycleState: string, reviewsOpen: number) => ({
  attemptId: ATTEMPT(n),
  assignmentId: `00000000-0000-4000-8000-0000000000e${n}`,
  employeeId: null,
  participantRef: `K-00${n}`,
  participantName: null,
  assessmentSlug: "security-basics-v1",
  assessmentNameSv: "Grundläggande säkerhetskunskap",
  assessmentNameEn: "Security fundamentals",
  purposeCode: "recruitment",
  useCase: "recruitment",
  governanceMode: "governed",
  lifecycleState,
  invitedAt: AT,
  startedAt: lifecycleState === "invited" ? null : AT,
  submittedAt: lifecycleState === "under_review" ? AT : null,
  scoredAt: null,
  releasedAt: null,
  deadline: "2026-10-20T22:59:59.000Z",
  answered: lifecycleState === "invited" ? 0 : 24,
  totalItems: 24,
  reviewsTotal: 3,
  reviewsOpen,
  identityResolvable: false,
});

/** The whole stubbed backend for a signed-in owner. */
export const table: Record<string, unknown> = {
  countMyAcademyWork: 0,
  countMyReviewQueue: 0,
  ensureMyEmployerCompanyFromSignup: null,
  listMyEmployerWorkspaces: [workspace],
  getMyReportAccess: {
    known: true,
    facts: {
      isMember: true,
      ownerOrAdmin: true,
      readableUseCases: ["recruitment", "workforce"],
      responsibleJobIds: [JOB_UPPSALA],
      caseAccess: true,
    },
  },
  getEmployerDashboardStats: {
    activeJobs: 1,
    draftJobs: 1,
    applications: 6,
    assessmentInvitations: 2,
  },
  getEmployerOrganisation: {
    id: EMPLOYER_ID,
    slug: SLUG,
    name: "Exempelvakt AB",
    website: "https://exempelvakt.example",
    logoUrl: null,
    country: "Sverige",
    registrationNumber: null,
    descriptionSv: "Bevakning i Uppland.",
    descriptionEn: "Guarding in Uppland.",
    status: "active",
  },
  listEmployerJobs: [
    job(JOB_UPPSALA, "Väktare, Uppsala", "published", true),
    job(JOB_DRAFT, "Ordningsvakt, Gävle", "draft", false),
    job(JOB_READY, "Skyddsvakt, Västerås", "published", true),
  ],
  listEmployerAssessmentCatalog: [],
  getEmployerWorkforceSummary: { activeEmployees: 12, rolesRepresented: 3, sitesRepresented: 2 },
  listTrainingStatus: [],
  getInterviewWorkload: {
    inPreparation: 1,
    awaitingPlanApproval: 1,
    readyToInterview: 1,
    inEvidenceReview: 1,
    proposalsAwaitingReview: 2,
    awaitingReport: 0,
    reported: 1,
  },
  getEmployerAssessmentPipeline: [pipelineRow(1, "invited", 0), pipelineRow(2, "under_review", 3)],
  getEmployerReviewBoard: [
    { attemptId: ATTEMPT(2), responsesOpen: 3, basis: "authorised", disclosure: null },
  ],
  employerVerificationCounts: { open: 0, total: 0 },
  getRecruitmentOverview: recruitmentOverview,
  listRecruitmentCandidatesPage: candidatePage,
  // Two reads the overview made before this pass and never rendered. Answered
  // so the same suite photographs the base commit; the head asks for neither.
  listApplicationsForEmployer: [],
  listAssignmentsForEmployer: [],
  listAssignmentApplications: {},
  listInterviewCases: {
    cases: [
      interviewCase(1, "Birgitta Bevakning", "prep_generated"),
      interviewCase(2, "Kim Kandidat", "prep_approved"),
      interviewCase(3, "Erik Evidens", "evidence_review", 2),
      interviewCase(4, "Fatima Färdig", "reported"),
    ],
  },
  listBesktAssignments: [],
};
