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
//
// The counts are not typed in: they are COMPUTED from the five applications by
// `selectCandidatePage`, which applies the same rules the server's
// rec_ri_candidate_view applies (stage population, review and requirement
// filters, one requirement status per application). So the status groups sum
// to "received", reviewed + remaining = received, and the "selected list"
// numbers describe the list actually returned for the view that was asked
// for. scripts/employer-portal-fixture.test.ts asserts those invariants.

export const EMPLOYER_ID = "00000000-0000-4000-8000-00000000e0c1";
export const SLUG = "exempelvakt";
const USER = "00000000-0000-4000-8000-0000publicentry".slice(0, 36);
export const JOB_UPPSALA = "00000000-0000-4000-8000-0000000000a1";
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

export type RequirementStatus = "green" | "yellow" | "gray" | "not_established";
export type ReviewState = "reviewed" | "pending" | "stale";
export type FixtureCandidate = ReturnType<typeof candidate>;

const candidate = (
  n: number,
  name: string,
  status: string,
  requirementStatus: RequirementStatus,
  reviewState: ReviewState,
  archived = false,
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
  archivedAt: archived ? AT : null,
});

/** Every application the Uppsala recruitment ever received: four open ones
 *  and one that was rejected and archived after its review. */
export const UPPSALA_APPLICATIONS: readonly FixtureCandidate[] = [
  candidate(1, "Ali Ansökande", "submitted", "gray", "pending"),
  candidate(2, "Birgitta Bevakning", "reviewing", "green", "reviewed"),
  candidate(3, "Kim Kandidat", "interview", "yellow", "stale"),
  candidate(4, "Dana Dörrvakt", "submitted", "not_established", "pending"),
  candidate(5, "Erik Efterhand", "rejected", "gray", "reviewed", true),
];

/** The view a list call asks for; the same shape as the app's CandidateView. */
export type FixtureView = {
  stage?: "new" | "review" | "interview" | "open" | "decided" | "all" | "archived" | "received";
  review?: "remaining" | "reviewed" | "pending" | "stale";
  requirement?: RequirementStatus;
  status?: string;
  job?: string;
  page?: number;
};

const OPEN = new Set(["submitted", "reviewing", "interview"]);

/** The stage POPULATION, as rec_ri_candidate_view draws it: "received" is
 *  everything, "archived" only the archived, every other stage excludes the
 *  archived and then narrows by status. */
function inStage(c: FixtureCandidate, stage: FixtureView["stage"]) {
  const s = stage ?? "open";
  if (s === "received") return true;
  if (s === "archived") return c.archivedAt !== null;
  if (c.archivedAt !== null) return false;
  if (s === "open") return OPEN.has(c.status);
  if (s === "decided") return !OPEN.has(c.status);
  if (s === "new") return c.status === "submitted";
  if (s === "review") return c.status === "reviewing";
  if (s === "interview") return c.status === "interview";
  return true;
}

function inReview(c: FixtureCandidate, review: FixtureView["review"]) {
  if (!review) return true;
  if (review === "remaining") return c.reviewState !== "reviewed";
  return c.reviewState === review;
}

/** One page of candidates for `view`, with the counts the server would send:
 *  `counts` and `intelligenceCounts` describe the stage population ("base"),
 *  the `filtered*` numbers describe the rows after every filter. */
export function selectCandidatePage(view: FixtureView, all = UPPSALA_APPLICATIONS) {
  const base = all.filter((c) => inStage(c, view.stage) && (!view.job || c.jobId === view.job));
  const rows = base.filter(
    (c) =>
      inReview(c, view.review) &&
      (!view.requirement || c.requirementStatus === view.requirement) &&
      (!view.status || c.status === view.status),
  );
  const by = (list: readonly FixtureCandidate[], f: (c: FixtureCandidate) => boolean) =>
    list.filter(f).length;
  const unarchived = base.filter((c) => c.archivedAt === null);
  return {
    rows,
    total: rows.length,
    page: 1,
    pages: 1,
    from: rows.length ? 1 : 0,
    to: rows.length,
    counts: {
      total: unarchived.length,
      new: by(unarchived, (c) => c.status === "submitted"),
      review: by(unarchived, (c) => c.status === "reviewing"),
      interview: by(unarchived, (c) => c.status === "interview"),
      hired: by(unarchived, (c) => c.status === "hired"),
      decided: by(unarchived, (c) => !OPEN.has(c.status)),
    },
    intelligenceCounts: {
      received: base.length,
      reviewed: by(base, (c) => c.reviewState === "reviewed"),
      remaining: by(base, (c) => c.reviewState !== "reviewed"),
      green: by(base, (c) => c.requirementStatus === "green"),
      yellow: by(base, (c) => c.requirementStatus === "yellow"),
      gray: by(base, (c) => c.requirementStatus === "gray"),
      notEstablished: by(base, (c) => c.requirementStatus === "not_established"),
      filtered: rows.length,
      filteredReviewed: by(rows, (c) => c.reviewState === "reviewed"),
      filteredRemaining: by(rows, (c) => c.reviewState !== "reviewed"),
      archived: by(base, (c) => c.archivedAt !== null),
      withdrawn: by(base, (c) => c.status === "withdrawn"),
      decided: by(base, (c) => !OPEN.has(c.status)),
    },
    yesNoQuestions: [],
  };
}

/** The view inside a listRecruitmentCandidatesPage call's arguments. */
export function viewOf(args: Record<string, unknown>): FixtureView {
  const view = args.view;
  return view && typeof view === "object" ? (view as FixtureView) : {};
}

/** The default list (open applications), the page most surfaces ask for. */
export const candidatePage = selectCandidatePage({});

/** The whole recruitment's requirement-review coverage: what
 *  rec_ri_overview_counts reports per job (stage "received"). */
const uppsalaIntelligence = selectCandidatePage({ stage: "received" }).intelligenceCounts;
const uppsalaCounts = candidatePage.counts;

const recruitment = (
  jobId: string,
  title: string,
  phase: "draft" | "published" | "closed",
  jobStatus: string,
  counts: { total: number; newCount: number; unresolved: number; interviewStage: number },
  intelligenceCounts: typeof uppsalaIntelligence,
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

const none = {
  received: 0,
  reviewed: 0,
  remaining: 0,
  green: 0,
  yellow: 0,
  gray: 0,
  notEstablished: 0,
  filtered: 0,
  filteredReviewed: 0,
  filteredRemaining: 0,
  archived: 0,
  withdrawn: 0,
  decided: 0,
};

export const recruitmentOverview = {
  recruitments: [
    recruitment(
      JOB_UPPSALA,
      "Väktare, Uppsala",
      "published",
      "published",
      {
        total: uppsalaCounts.total,
        newCount: uppsalaCounts.new,
        unresolved: uppsalaCounts.new + uppsalaCounts.review + uppsalaCounts.interview,
        interviewStage: uppsalaCounts.interview,
      },
      uppsalaIntelligence,
    ),
    recruitment(
      JOB_DRAFT,
      "Ordningsvakt, Gävle",
      "draft",
      "draft",
      { total: 0, newCount: 0, unresolved: 0, interviewStage: 0 },
      none,
    ),
    recruitment(
      JOB_READY,
      "Skyddsvakt, Västerås",
      "closed",
      "published",
      { total: 2, newCount: 0, unresolved: 0, interviewStage: 0 },
      { ...none, received: 2, reviewed: 2, green: 2, filtered: 2, filteredReviewed: 2, decided: 2 },
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
  city: "Uppsala",
  location_text: "Uppsala",
  description_sv: "Bevakning av handelsplats, dag och kväll.",
  description_en: "Guarding a retail site, days and evenings.",
  requirements_sv: "Godkänd väktarutbildning. B-körkort är meriterande.",
  requirements_en: "Approved security guard training. A driving licence is desirable.",
});
const jobs = [
  job(JOB_UPPSALA, "Väktare, Uppsala", "published", true),
  job(JOB_DRAFT, "Ordningsvakt, Gävle", "draft", false),
  job(JOB_READY, "Skyddsvakt, Västerås", "published", true),
];

// ── The recruitment hub's requirement-profile step ───────────────────────
//
// Two requirements (one mandatory, one desirable), one yes/no question tied
// to the mandatory one, and a confirmed profile version 1 -- enough for the
// form to show every control it has, in the state a recruiter meets most.
const REQ_TRAINING = "00000000-0000-4000-8000-00000000e001";
const REQ_LICENCE = "00000000-0000-4000-8000-00000000e002";
const Q_TRAINING = "00000000-0000-4000-8000-00000000f001";
const Q_MOTIVATION = "00000000-0000-4000-8000-00000000f002";

export const recruitmentDetail = {
  jobId: JOB_UPPSALA,
  settings: {
    responsibleUserId: USER,
    completionState: "open",
    completedAt: null,
    completionNote: null,
    version: 1,
  },
  receipt: {
    enabled: true,
    subjectSv: null,
    bodySv: null,
    subjectEn: null,
    bodyEn: null,
    updatedAt: null,
    defaults: {
      subjectSv: "Vi har tagit emot din ansökan",
      bodySv: "Tack för din ansökan. Vi återkommer.",
      subjectEn: "We have received your application",
      bodyEn: "Thank you for applying. We will be in touch.",
    },
  },
  requirements: [
    {
      id: REQ_TRAINING,
      kind: "mandatory",
      labelSv: "Godkänd väktarutbildning",
      labelEn: "Approved security guard training",
      position: 1,
    },
    {
      id: REQ_LICENCE,
      kind: "desirable",
      labelSv: "B-körkort",
      labelEn: "Driving licence (B)",
      position: 2,
    },
  ],
  questions: [
    {
      id: Q_TRAINING,
      requirementId: REQ_TRAINING,
      promptSv: "Har du godkänd väktarutbildning?",
      promptEn: "Do you have approved security guard training?",
      answerKind: "yes_no",
      isRequired: true,
      position: 1,
    },
    {
      id: Q_MOTIVATION,
      requirementId: null,
      promptSv: "Varför söker du tjänsten?",
      promptEn: "Why are you applying?",
      answerKind: "text",
      isRequired: false,
      position: 2,
    },
  ],
  structureLocked: true,
  team: [{ userId: USER, name: "Rita Rekryterare", role: "owner", isSelf: true }],
  role: "owner",
  myUserId: USER,
  canManage: true,
};

export const requirementProfile = {
  jobId: JOB_UPPSALA,
  profileId: "00000000-0000-4000-8000-00000000a0f1",
  version: 1,
  startDate: "2026-11-01",
  confirmedAt: "2026-09-12T09:00:00.000Z",
  confirmedBy: USER,
  canManage: true,
  rules: [
    {
      requirementId: REQ_TRAINING,
      kind: "mandatory",
      acceptedSources: ["application_answer", "external_reference"],
      decisionRule: "valid_at_start",
      questionId: Q_TRAINING,
      instructionSv:
        "Kontrollera utbildningsbeviset mot utfärdaren; det ska vara giltigt på startdatumet.",
      instructionEn:
        "Check the training certificate with the issuer; it must be valid on the start date.",
      labelSv: "Godkänd väktarutbildning",
      labelEn: "Approved security guard training",
      position: 1,
    },
    {
      requirementId: REQ_LICENCE,
      kind: "desirable",
      acceptedSources: ["application_cv"],
      decisionRule: "human_confirmed",
      questionId: null,
      instructionSv: "Körkortsklass B enligt CV; bekräftas vid intervju.",
      instructionEn: "Licence class B per the CV; confirmed at interview.",
      labelSv: "B-körkort",
      labelEn: "Driving licence (B)",
      position: 2,
    },
  ],
  requirements: recruitmentDetail.requirements,
  questions: recruitmentDetail.questions.map(
    ({ id, requirementId, promptSv, promptEn, answerKind }) => ({
      id,
      requirementId,
      promptSv,
      promptEn,
      answerKind,
    }),
  ),
};

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
export const table: Record<string, unknown | ((args: Record<string, unknown>) => unknown)> = {
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
  listEmployerJobs: jobs,
  // The recruitment hub (one recruitment, its requirement-profile step).
  getEmployerJob: (args: Record<string, unknown>) => jobs.find((j) => j.id === args.jobId) ?? null,
  getRecruitment: (args: Record<string, unknown>) =>
    args.jobId === JOB_UPPSALA ? recruitmentDetail : null,
  getRequirementProfile: (args: Record<string, unknown>) =>
    args.jobId === JOB_UPPSALA ? requirementProfile : null,
  // The hub's material-lifecycle panel: nothing archived, nothing due.
  getLifecycleOverview: {
    months: 24,
    canSetRetention: true,
    jobs: jobs.map((j) => ({
      id: j.id,
      archivedAt: null,
      completedAt: j.id === JOB_READY ? "2026-10-01T09:00:00.000Z" : null,
      state: j.id === JOB_READY ? "completed" : "open",
      canManage: true,
      missingDate: false,
      purgeAt: null,
    })),
    applications: UPPSALA_APPLICATIONS.map((c) => ({
      id: c.applicationId,
      jobId: c.jobId,
      archivedAt: c.archivedAt,
      recruitmentArchivedAt: null,
      status: c.status,
    })),
    erasures: [],
  },
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
  // Answered per call: the overview's coverage block asks for stage
  // "received", the list for the view in its URL, and the numbers must
  // describe the list each of them actually gets.
  listRecruitmentCandidatesPage: (args: Record<string, unknown>) =>
    selectCandidatePage(viewOf(args)),
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
