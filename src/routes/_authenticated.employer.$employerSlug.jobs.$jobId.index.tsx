// The recruitment case — /employer/$employerSlug/jobs/$jobId.
//
// ── ONE CASE, FIVE STEPS ───────────────────────────────────────────────
//
// A recruitment IS a job: the vacancy row, its publication state, and every
// application joined to it. This page renders that join as one case with a
// persistent five-step process, the way a recruiter thinks about the work:
//
//   1 Kravprofil  →  2 Annons  →  3 Publiceringsläge  →  4 Ansökningar  →
//   5 Beslut & avslut
//
// The steps are navigation, not a wizard. Every step is reachable at any
// time; a step's "done" mark is computed from the data (stepStatesOf), never
// from having been visited; and what may change on each step is decided by
// the database and said in words on that step. Team and settings, and the
// case's activity log, are not steps -- they are views reached from the
// header, so the sequence stays a sequence.
//
// The page orders itself the way the work reads, top to bottom: the case's
// title and facts, the process nav, and then the step -- which on step 4 is
// filters, the persistent action bar, the candidate table, and the pager.
//
// ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────
//
// The candidate page arrives from the server already filtered, ordered and
// sliced (listRecruitmentCandidatesPage), from the same definitions the
// controls edit, together with unfiltered counts for the vacancy. Every
// count on this page -- the header's total, the step nav's badge, the stage
// filter's numbers, the pipeline chips -- reads those, so a number and the
// rows it opens cannot disagree.
//
// The assessment half of the pipeline (how many candidates have a test
// open) is read through the pair of existing employer-wide reads in
// src/lib/employer-continuity/open-assessments.ts, on the cache keys the
// assessment workspace already uses. Nothing here reads a SCORE: no "3
// passed", no average, no ranking. A test being open is a fact about the
// process; how somebody did is a separate, permission-gated page.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  Eye,
  Lock,
  Users,
} from "lucide-react";
import { useT, type PluralKey } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ConfirmAction, usePendingConfirm } from "@/components/employer/ConfirmAction";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { JobsPage } from "@/components/academy/AcademyWorkspace";
import { translateJobServerError } from "@/components/employer/EmployerJobForm";
import { JobAdPreview } from "@/components/employer/job-form/JobAdPreview";
import { PUBLICATION_MODEL, fromJobRow } from "@/components/employer/job-form/model";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  getEmployerJob,
  submitEmployerJob,
  publishEmployerJob,
  closeEmployerJob,
  deleteEmployerJob,
  restoreEmployerJob,
  duplicateEmployerJob,
  CLOSEABLE_STATUSES,
  DELETE_REFUSED_CODES,
} from "@/lib/job-intelligence/employer-jobs.functions";
import type { ApplicationStatus } from "@/lib/job-intelligence/applications.functions";
import { z } from "zod";
import { CandidateTable } from "@/components/recruitment/CandidateTable";
import { PhaseBadge } from "@/components/recruitment/RecruitmentStatus";
import { ProcessStepNav } from "@/components/recruitment/ProcessStepNav";
import {
  RecruitmentActivity,
  RecruitmentSettings,
  VacancyStructureSummary,
} from "@/components/recruitment/RecruitmentWorkspaceTabs";
import {
  getRecruitment,
  listRecruitmentCandidatesPage,
} from "@/lib/recruitment/recruitment.functions";
import {
  candidateViewSchema,
  compactView,
  currentStepOf,
  phaseOf,
  stepStatesOf,
  RECRUITMENT_STEPS,
  type CandidateView,
  type RecruitmentStep,
  type StepInput,
} from "@/lib/recruitment/definitions";
import { checkJobReadiness, type JobReadinessInput } from "@/lib/job-intelligence/job-readiness";
import {
  projectJobPipelineFromCounts,
  type JobNextActionKind,
  type JobPipelineStage,
  type PipelineRead,
  type StageCount,
} from "@/lib/employer-continuity/job-pipeline";
import { useOpenAssessmentApplications } from "@/lib/employer-continuity/open-assessments";

/** What this page reads off the row. getEmployerJob() is a `select("*")` and
 *  is typed as the untyped Supabase row, so the shape is declared here rather
 *  than asserted field by field at every use. Every field is optional: a
 *  column this build does not know about is absent, never wrong. */
type JobHubRow = JobReadinessInput & {
  status: string;
  slug?: string | null;
  short_id?: string | null;
  published_at?: string | null;
  deadline_at?: string | null;
  updated_at: string;
  requirements_sv?: string | null;
  requirements_en?: string | null;
};

// The case's own view state, in the URL: which step (or which of the two
// header views), and the candidate list's filters, sort and page. A reload,
// a shared link and a return from a candidate all land on the same view.
// `tab` is the previous tab vocabulary, still accepted so an older link
// lands on the equivalent step.
const HUB_TABS = ["candidates", "vacancy", "activity", "team"] as const;
const CASE_VIEWS = ["team", "activity"] as const;
type CaseView = (typeof CASE_VIEWS)[number];
const hubSearchSchema = candidateViewSchema.extend({
  step: z.enum(RECRUITMENT_STEPS).optional().catch(undefined),
  view: z.enum(CASE_VIEWS).optional().catch(undefined),
  tab: z.enum(HUB_TABS).optional().catch(undefined),
});
const TAB_TO: Record<(typeof HUB_TABS)[number], { step?: RecruitmentStep; view?: CaseView }> = {
  candidates: { step: "applications" },
  vacancy: { step: "advert" },
  activity: { view: "activity" },
  team: { view: "team" },
};

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/jobs/$jobId/")({
  ssr: false,
  component: JobHubRoute,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => hubSearchSchema.parse(search),
});

function JobHubRoute() {
  const { employerSlug, jobId } = Route.useParams();
  return (
    <JobsPage employerSlug={employerSlug} wide>
      {(ws) => (
        <JobHub
          employerId={ws.employerId}
          employerSlug={employerSlug}
          employerName={ws.employerName}
          jobId={jobId}
          canEdit={ws.role === "owner" || ws.role === "admin"}
        />
      )}
    </JobsPage>
  );
}

function JobHub({
  employerId,
  employerSlug,
  employerName,
  jobId,
  canEdit,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  jobId: string;
  canEdit: boolean;
}) {
  const search = Route.useSearch();
  const candidateView: CandidateView = compactView({
    q: search.q,
    stage: search.stage,
    owner: search.owner,
    ans: search.ans,
    sort: search.sort,
    dir: search.dir,
    page: search.page,
  });
  const recruitmentFn = useServerFn(getRecruitment);
  const { t, tp, lang } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFn = useServerFn(getEmployerJob);
  const pageFn = useServerFn(listRecruitmentCandidatesPage);
  const submitFn = useServerFn(submitEmployerJob);
  const publishFn = useServerFn(publishEmployerJob);
  const closeFn = useServerFn(closeEmployerJob);
  const deleteFn = useServerFn(deleteEmployerJob);
  const restoreFn = useServerFn(restoreEmployerJob);
  const dupFn = useServerFn(duplicateEmployerJob);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = usePendingConfirm<"delete" | "close" | "duplicate">();
  const [previewing, setPreviewing] = useState(false);
  // Set when jobs_delete_draft() refuses. This page cannot see whether a draft
  // has assignments or invitations attached; only the database can, so it
  // stops offering the delete and offers the close instead. See jobs.index.tsx.
  const [deleteRefused, setDeleteRefused] = useState(false);

  const jobQuery = useQuery({
    queryKey: ["employer", employerId, "job", jobId],
    queryFn: () => getFn({ data: { employerId, jobId } }),
  });

  // Scoped in the database, not filtered in the browser: the read takes the
  // jobId and applies it with the employer to the RLS-scoped query, filters
  // and orders on the server, and returns ONE page. This page never holds
  // another vacancy's candidates, nor more of this one's than it shows.
  const applicationsQuery = useQuery({
    queryKey: ["employer", employerId, "candidates", "job", jobId, "page", candidateView],
    queryFn: () => pageFn({ data: { employerId, jobId, view: candidateView } }),
    placeholderData: (prev) => prev,
  });
  const page = applicationsQuery.data ?? null;

  // The assessment half of the pipeline. Always on here -- this is the one
  // surface whose job is to summarise the vacancy -- and shared with the
  // assessment workspace's own cache keys, so an employer who has both open
  // pays for one fetch.
  const openAssessments = useOpenAssessmentApplications(employerId, true, jobId);

  /** Every mutation on this page refreshes the same caches: this job, the
   *  candidate pages, the list it came from, and the dashboard counters. */
  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "job", jobId] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "candidates", "job", jobId] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "recruitment-overview"] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "recruitment", jobId] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "applications"] });
  }

  const mutationOptions = {
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
    },
    onError: (e: unknown) =>
      setActionError((e as { message?: string })?.message ?? "JOB_ACTION_FAILED"),
  };

  const submitMutation = useMutation({
    mutationFn: () => submitFn({ data: { employerId, jobId } }),
    ...mutationOptions,
  });
  const publishMutation = useMutation({
    mutationFn: () => publishFn({ data: { employerId, jobId } }),
    ...mutationOptions,
  });
  const closeMutation = useMutation({
    mutationFn: () => closeFn({ data: { employerId, jobId } }),
    ...mutationOptions,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { employerId, jobId } }),
    // Not mutationOptions: this page's subject no longer exists. Refetching it
    // would replace a completed action with JOB_NOT_FOUND, which reads as a
    // failure. The list is where a deleted advertisement leaves you.
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
      void navigate({ to: "/employer/$employerSlug/jobs", params: { employerSlug } });
    },
    onError: (e: unknown) => {
      const code = (e as { message?: string })?.message ?? "DELETE_JOB_FAILED";
      setActionError(code);
      if (DELETE_REFUSED_CODES.includes(code)) setDeleteRefused(true);
    },
  });
  const restoreMutation = useMutation({
    mutationFn: () => restoreFn({ data: { employerId, jobId } }),
    ...mutationOptions,
  });
  const dupMutation = useMutation({
    mutationFn: () => dupFn({ data: { employerId, jobId } }),
    ...mutationOptions,
  });

  const recruitmentQuery = useQuery({
    queryKey: ["employer", employerId, "recruitment", jobId],
    queryFn: () => recruitmentFn({ data: { employerId, jobId } }),
  });
  const recruitment = recruitmentQuery.data ?? null;

  // Step 5 lists who is still undecided, by name. One page of them, with the
  // full count, so a long list does not have to be loaded to be counted.
  const wantsClosing = search.step === "closing";
  const openQuery = useQuery({
    queryKey: ["employer", employerId, "candidates", "job", jobId, "page", { stage: "open" }],
    queryFn: () => pageFn({ data: { employerId, jobId, view: { stage: "open" } } }),
    enabled: wantsClosing,
  });

  const crumbRow = jobQuery.data as unknown as
    | { title_sv?: string | null; title_en?: string | null }
    | undefined;
  const breadcrumbTitle = crumbRow
    ? (lang === "en" ? crumbRow.title_en : crumbRow.title_sv) ||
      crumbRow.title_sv ||
      crumbRow.title_en ||
      t("employer.jobs.list.untitled")
    : "…";
  const breadcrumb = (
    <nav aria-label={t("rec.breadcrumb.label")} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link
            to="/employer/$employerSlug"
            params={{ employerSlug }}
            className="hover:text-foreground hover:underline"
          >
            {t("rec.breadcrumb.employer")}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link
            to="/employer/$employerSlug/jobs"
            params={{ employerSlug }}
            className="hover:text-foreground hover:underline"
          >
            {t("rec.breadcrumb.recruitments")}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="max-w-[40ch] truncate font-medium text-foreground">
          {breadcrumbTitle}
        </li>
      </ol>
    </nav>
  );

  if (jobQuery.isLoading) {
    return (
      <div className="w-full">
        {breadcrumb}
        <p className="mt-6 text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <div className="w-full">
        {breadcrumb}
        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          {t("employer.jobHub.notFound")}
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          {t("employer.jobHub.notFoundBody")}
        </p>
      </div>
    );
  }

  const job = jobQuery.data as unknown as JobHubRow;
  const status = String(job.status);
  const title =
    (lang === "en" ? job.title_en : job.title_sv) ||
    job.title_sv ||
    job.title_en ||
    t("employer.jobs.list.untitled");
  const pick = (sv: string | null | undefined, en: string | null | undefined) =>
    (lang === "en" ? en || sv : sv || en) ?? "";

  const readiness = checkJobReadiness(job);
  const counts = page?.counts ?? null;

  // How the read WENT, kept apart from what it found. There is no client-side
  // way to tell a policy refusal from any other failure here, and guessing
  // would be the same lie in the other direction, so both are reported as
  // "could not be read" -- which is what we actually know.
  const applicationsRead: PipelineRead = applicationsQuery.isLoading
    ? "loading"
    : applicationsQuery.isError
      ? "failed"
      : "ready";

  // Counted by the database over the whole vacancy (rec_job_counts): the
  // chips are about every application, not about the page on screen.
  const pipeline = projectJobPipelineFromCounts({
    jobStatus: status,
    applicationsRead,
    counts: page
      ? {
          total: page.counts.total,
          awaitingReview: page.counts.new,
          interview: page.counts.interview,
          hired: page.counts.hired,
        }
      : null,
    assessmentRead: openAssessments.read,
    assessmentOpen: openAssessments.ids.size,
  });

  const phase = phaseOf(
    {
      jobStatus: status,
      publishedAt: job.published_at ?? null,
      deadlineAt: job.deadline_at ?? null,
      expiresAt: job.expires_at ?? null,
      completionState: recruitment?.settings.completionState ?? null,
    },
    new Date(),
  );
  const total = counts?.total ?? 0;
  const unresolvedCount = counts ? counts.total - counts.decided : 0;
  const stepInput: StepInput = {
    requirementsCount: recruitment?.requirements.length ?? 0,
    questionsCount: recruitment?.questions.length ?? 0,
    hasRequirementsText: Boolean(job.requirements_sv?.trim() || job.requirements_en?.trim()),
    advertReady:
      Boolean(job.title_sv?.trim() || job.title_en?.trim()) &&
      Boolean(job.description_sv?.trim() || job.description_en?.trim()),
    phase,
    total,
    unresolved: unresolvedCount,
  };
  const stepStates = stepStatesOf(stepInput);
  const legacy = search.tab ? TAB_TO[search.tab] : {};
  const view: CaseView | null = search.view ?? legacy.view ?? null;
  const step: RecruitmentStep = search.step ?? legacy.step ?? currentStepOf(stepInput);
  const responsibleName = recruitment?.settings.responsibleUserId
    ? (recruitment.team.find((m) => m.userId === recruitment.settings.responsibleUserId)?.name ??
      null)
    : null;

  const editable = status === "draft" || status === "rejected";
  // Same rule as the list, from the same constants the server enforces: a
  // never-published draft with nothing attached can go, and anything else that
  // was ever live is closed instead. See jobs.index.tsx.
  const deletable =
    job !== null && status === "draft" && job.published_at === null && !deleteRefused;
  const closeable = !deletable && CLOSEABLE_STATUSES.includes(status);
  const restorable = status === "archived" && phase !== "completed" && phase !== "cancelled";
  const busy =
    submitMutation.isPending ||
    publishMutation.isPending ||
    closeMutation.isPending ||
    deleteMutation.isPending ||
    restoreMutation.isPending ||
    dupMutation.isPending;

  function go(next: { step?: RecruitmentStep; view?: CaseView } & CandidateView) {
    const { step: s, view: v, ...rest } = next;
    void navigate({
      to: "/employer/$employerSlug/jobs/$jobId",
      params: { employerSlug, jobId },
      search: { ...(s ? { step: s } : {}), ...(v ? { view: v } : {}), ...compactView(rest) },
      replace: true,
    });
  }
  function setView(next: CandidateView) {
    go({ step: "applications", ...next });
  }

  // The one primary action the header offers, by phase.
  const btnPrimary =
    "inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";
  const btnSecondary =
    "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";
  const primary =
    phase === "draft" && editable && canEdit ? (
      <Link
        to="/employer/$employerSlug/jobs/$jobId/edit"
        params={{ employerSlug, jobId }}
        className={btnPrimary}
      >
        {t("rec.hub.primary.continueVacancy")}
      </Link>
    ) : phase === "closed" && unresolvedCount === 0 && recruitment?.canManage ? (
      <button type="button" onClick={() => go({ step: "closing" })} className={btnPrimary}>
        {t("rec.hub.primary.complete")}
      </button>
    ) : (phase === "published" || phase === "closed") && (counts?.new ?? 0) > 0 ? (
      <button type="button" onClick={() => setView({ stage: "new" })} className={btnPrimary}>
        {t("rec.hub.primary.reviewNew")}
      </button>
    ) : null;

  const viewLink = (v: CaseView, icon: React.ReactNode, label: TranslationKey) => (
    <Link
      to="/employer/$employerSlug/jobs/$jobId"
      params={{ employerSlug, jobId }}
      search={{ view: v }}
      aria-current={view === v ? "page" : undefined}
      className={`${btnSecondary} ${view === v ? "border-accent text-foreground" : ""}`}
    >
      {icon}
      {t(label)}
    </Link>
  );

  const panelHeading = (id: string, label: TranslationKey, lede?: TranslationKey) => (
    <div>
      <h2 id={id} className="text-lg font-semibold text-foreground">
        {t(label)}
      </h2>
      {lede && <p className="mt-0.5 max-w-[68ch] text-sm text-muted-foreground">{t(lede)}</p>}
    </div>
  );
  const editLink = (editorStep: "requirements" | "description" | "application") =>
    editable && canEdit ? (
      <Link
        to="/employer/$employerSlug/jobs/$jobId/edit"
        params={{ employerSlug, jobId }}
        search={{ step: editorStep }}
        className={btnSecondary}
      >
        {t("employer.jobs.list.edit")}
      </Link>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {t(status === "published" ? "rec.case.lockedPublished" : "rec.case.lockedStatus")}
      </span>
    );

  return (
    <div className="w-full">
      {breadcrumb}

      {/* ── The case ─────────────────────────────────────────────────── */}
      <header className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1
              className="text-[1.375rem] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {title}
            </h1>
            {/* "Visa annons": the advert as a candidate would read it, and the
                live page when there is one. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={btnSecondary}>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("rec.case.viewAdvert")}
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onSelect={() => setPreviewing(true)}>
                  {t("rec.case.previewAdvert")}
                </DropdownMenuItem>
                {status === "published" && job.slug && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/jobs/$slug"
                      params={{ slug: String(job.slug) }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("employer.jobHub.viewPublic")}
                      <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <dl className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <Meta label={t("rec.case.reference")}>{job.short_id ?? "—"}</Meta>
            <Sep />
            <Plain>
              {counts ? (
                <span className="tabular-nums">
                  {counts.total} {tp("rec.case.applicationsCount", counts.total)}
                </span>
              ) : applicationsRead === "failed" ? (
                <span className="text-amber-800 dark:text-amber-200">
                  {t("continuity.report.unavailable")}
                </span>
              ) : (
                "…"
              )}
            </Plain>
            <Sep />
            <Meta label={t("rec.col.status")}>
              <PhaseBadge phase={phase} />
            </Meta>
            <Sep />
            <Meta label={t("rec.hub.responsible")}>
              <span className="font-medium text-foreground">
                {responsibleName ?? t("rec.hub.noResponsible")}
              </span>
            </Meta>
            <Sep />
            <Meta label={t("rec.hub.deadline")}>
              {job.deadline_at ? formatDate(job.deadline_at, lang) : "—"}
            </Meta>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewLink(
            "team",
            <Users className="h-3.5 w-3.5" aria-hidden="true" />,
            "rec.hub.tab.team",
          )}
          {viewLink(
            "activity",
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />,
            "rec.hub.tab.activity",
          )}
          {primary}
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {translateJobServerError(actionError, t)}
        </div>
      )}

      {/* ── The process ──────────────────────────────────────────────── */}
      <div className="mt-4">
        <ProcessStepNav
          states={stepStates}
          active={step}
          employerSlug={employerSlug}
          jobId={jobId}
          counts={counts ? { applications: counts.total } : undefined}
        />
      </div>

      {/* ── Header views: team, activity ────────────────────────────── */}
      {view === "team" && (
        <section className="pt-5" aria-labelledby="case-team">
          {panelHeading("case-team", "rec.hub.tab.team", "rec.settings.teamLede")}
          <div className="mt-4">
            <RecruitmentSettings
              employerId={employerId}
              employerSlug={employerSlug}
              jobId={jobId}
              recruitment={recruitment}
              recruitmentError={recruitmentQuery.isError}
              phase={phase}
              unresolved={[]}
              unresolvedTotal={unresolvedCount}
              closeable={closeable && canEdit}
              busy={busy}
              jobTitle={title}
              employerName={employerName}
              sections={["responsible", "team", "communication"]}
              onClose={() => {
                setActionError(null);
                setPending({ kind: "close", id: jobId });
              }}
              onChanged={() => {
                void recruitmentQuery.refetch();
                invalidateAll();
              }}
            />
          </div>
        </section>
      )}
      {view === "activity" && (
        <section className="pt-5" aria-labelledby="case-activity">
          {panelHeading("case-activity", "rec.hub.tab.activity")}
          <div className="mt-2">
            <RecruitmentActivity
              employerId={employerId}
              employerSlug={employerSlug}
              jobId={jobId}
            />
          </div>
        </section>
      )}

      {/* ── 1 · Kravprofil ──────────────────────────────────────────── */}
      {!view && step === "requirements" && (
        <section className="pt-5" aria-labelledby="case-requirements">
          {panelHeading("case-requirements", "rec.step.requirements", "rec.case.requirementsLede")}
          <div className="mt-3 flex flex-wrap items-center gap-2">{editLink("requirements")}</div>
          {recruitmentQuery.isError ? (
            <p role="alert" className="mt-3 text-sm text-amber-900 dark:text-amber-200">
              {t("rec.hub.recruitmentUnavailable")}
            </p>
          ) : !recruitment ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("employer.loading")}</p>
          ) : (
            <VacancyStructureSummary
              requirements={recruitment.requirements}
              questions={recruitment.questions}
              locked={recruitment.structureLocked}
              editHref={null}
            />
          )}
          {pick(job.requirements_sv, job.requirements_en) && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-foreground">
                {t("rec.case.requirementsText")}
              </h3>
              <p className="mt-1 max-w-[72ch] whitespace-pre-wrap text-sm text-foreground">
                {pick(job.requirements_sv, job.requirements_en)}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── 2 · Annons ──────────────────────────────────────────────── */}
      {!view && step === "advert" && (
        <section className="pt-5" aria-labelledby="case-advert">
          {panelHeading("case-advert", "rec.step.advert", "rec.case.advertLede")}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPreviewing(true)} className={btnSecondary}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {t("rec.case.previewAdvert")}
            </button>
            {editLink("description")}
          </div>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
            <Fact label={t("employer.jobHub.fact.location")}>
              {job.location_text || job.city || "—"}
            </Fact>
            <Fact label={t("rec.hub.applicationMethod")}>
              {t(`rec.hub.method.${job.application_method ?? "unavailable"}` as TranslationKey)}
            </Fact>
            <Fact label={t("employer.jobs.list.updated")}>{formatDate(job.updated_at, lang)}</Fact>
          </dl>
          <h3 className="mt-5 text-sm font-semibold text-foreground">{t("rec.case.advertText")}</h3>
          {pick(job.description_sv, job.description_en) ? (
            <p className="mt-1 max-w-[72ch] whitespace-pre-wrap text-sm text-foreground">
              {pick(job.description_sv, job.description_en)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t("rec.case.advertEmpty")}</p>
          )}
        </section>
      )}

      {/* ── 3 · Publiceringsläge ────────────────────────────────────── */}
      {!view && step === "publishing" && (
        <section className="pt-5" aria-labelledby="case-publishing">
          {panelHeading("case-publishing", "rec.step.publishing", "rec.case.publishingLede")}
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
            <Fact label={t("rec.col.status")}>
              <PhaseBadge phase={phase} />
            </Fact>
            <Fact label={t("employer.jobHub.fact.published")}>
              {job.published_at ? formatDate(job.published_at, lang) : "—"}
            </Fact>
            <Fact label={t("rec.hub.deadline")}>
              {job.deadline_at ? formatDate(job.deadline_at, lang) : "—"}
            </Fact>
            <Fact label={t("employer.jobs.list.expires")}>
              {job.expires_at ? formatDate(job.expires_at, lang) : "—"}
            </Fact>
          </dl>

          {/* Actions the database will accept for this state, and only those. */}
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              {editable && PUBLICATION_MODEL === "direct" && (
                <button
                  type="button"
                  disabled={busy || !readiness.ready}
                  onClick={() => publishMutation.mutate()}
                  className={btnPrimary}
                >
                  {t("rec.case.publish")}
                </button>
              )}
              {editable && PUBLICATION_MODEL !== "direct" && (
                <button
                  type="button"
                  disabled={busy || !readiness.ready}
                  onClick={() => submitMutation.mutate()}
                  className={btnPrimary}
                >
                  {t("employer.jobHub.action.submit")}
                </button>
              )}
              {editable && editLink("application")}
              {phase === "published" && closeable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setActionError(null);
                    setPending({ kind: "close", id: jobId });
                  }}
                  className={btnSecondary}
                >
                  {t("rec.hub.closeApplications")}
                </button>
              )}
              {restorable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setActionError(null);
                    restoreMutation.mutate();
                  }}
                  className={btnSecondary}
                >
                  {t("employer.jobs.list.restore")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setPending({ kind: "duplicate", id: jobId });
                }}
                className={btnSecondary}
              >
                {t("employer.jobs.list.duplicate")}
              </button>
              {deletable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setActionError(null);
                    setPending({ kind: "delete", id: jobId });
                  }}
                  className={btnSecondary}
                >
                  {t("employer.jobs.list.delete")}
                </button>
              )}
            </div>
          )}
          {status === "published" && (
            <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
              {t("rec.case.publishedNote")}
            </p>
          )}

          {/* What a new applicant will get, stated before publication and
              after: the receipt is a setting of the recruitment, and its
              state belongs next to the advertisement's own. */}
          {recruitment && (
            <p className="mt-3 text-sm" data-testid="receipt-summary">
              <span className="text-muted-foreground">{t("rec.receipt.summaryLabel")}: </span>
              <span className="font-medium">
                {recruitment.receipt.enabled ? t("rec.receipt.on") : t("rec.receipt.off")}
              </span>
              {" · "}
              <Link
                to="/employer/$employerSlug/jobs/$jobId"
                params={{ employerSlug, jobId }}
                search={{ view: "team" }}
                className="font-medium text-accent hover:underline"
              >
                {t("rec.receipt.summaryChange")}
              </Link>
            </p>
          )}

          {/* ── Ready to publish? ──────────────────────────────────────
              Shown only where it can still change something: once an
              advertisement is in a moderator's queue or live, a checklist
              telling the employer what to fill in is describing a decision
              they no longer own. */}
          {editable && (
            <div className="mt-6" aria-labelledby="job-readiness">
              <h3 id="job-readiness" className="text-sm font-semibold text-foreground">
                {t("employer.jobHub.readiness.heading")}
              </h3>
              <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
                {readiness.ready
                  ? t("employer.jobHub.readiness.ready")
                  : t("employer.jobHub.readiness.notReady")}
              </p>
              <ul className="mt-3 space-y-1.5">
                {readiness.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-sm">
                    {c.ok ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    ) : (
                      <CircleDashed
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className={c.ok ? "text-muted-foreground" : "text-foreground"}>
                      {t(c.labelKey)}
                      {!c.blocking && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("employer.jobHub.readiness.optional")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── 4 · Ansökningar ─────────────────────────────────────────── */}
      {!view && step === "applications" && (
        <div className="pt-4">
          {/* ── The pipeline, in one line ──────────────────────────────
              Five counts and the one next thing, compact, above the work.
              Each count is a link to exactly the rows it counted. */}
          <section aria-labelledby="job-pipeline">
            <h2 id="job-pipeline" className="sr-only">
              {t("employer.jobHub.pipeline.heading")}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <dl className="flex flex-wrap items-center gap-x-1 gap-y-1">
                {PIPELINE_CARDS.map((card) => (
                  <PipelineChip
                    key={card.stage}
                    labelKey={card.labelKey}
                    count={pipeline.counts[card.stage]}
                    employerSlug={employerSlug}
                    jobId={jobId}
                    search={card.search}
                  />
                ))}
              </dl>
              {(pipeline.counts.assessmentOpen.value ?? 0) > 0 && (
                <p className="basis-full text-xs text-muted-foreground">
                  {t("rec.pipeline.overlapNote")}
                </p>
              )}
              <p className="text-[13px] text-muted-foreground" role="status">
                <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]">
                  {t("employer.jobHub.next.heading")}
                </span>
                {(() => {
                  const plural = JOB_NEXT_PLURAL[pipeline.nextAction.kind];
                  return plural && pipeline.nextAction.count > 0
                    ? `${pipeline.nextAction.count} ${tp(plural, pipeline.nextAction.count)}`
                    : t(JOB_NEXT_BODY[pipeline.nextAction.kind]);
                })()}
                {pipeline.nextAction.stage && (
                  <Link
                    to="/employer/$employerSlug/applications"
                    params={{ employerSlug }}
                    search={{
                      job: jobId,
                      ...(PIPELINE_SEARCH[pipeline.nextAction.stage] ?? {}),
                    }}
                    className="ml-2 inline-flex items-center gap-1 font-medium text-accent hover:underline"
                  >
                    {t("employer.jobHub.next.open")}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </p>
            </div>
          </section>

          <section className="mt-3 pb-4" aria-labelledby="job-candidates">
            <h2 id="job-candidates" className="sr-only">
              {t("employer.jobHub.candidates.heading")}
            </h2>
            {applicationsQuery.isLoading && !page ? (
              <p className="text-sm text-muted-foreground" role="status">
                {t("employer.loading")}
              </p>
            ) : applicationsQuery.isError ? (
              /* NOT an empty state. "Nobody has applied" and "we could not find
                 out who applied" are different sentences, and the second one is
                 the only honest thing to say here. */
              <div
                role="alert"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-900 dark:text-amber-200"
              >
                <p>{t("employer.jobHub.candidates.loadFailed")}</p>
                <button
                  type="button"
                  onClick={() => void applicationsQuery.refetch()}
                  className="mt-3 inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("continuity.next.retry")}
                </button>
              </div>
            ) : counts && counts.total === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                {status === "published"
                  ? t("employer.jobHub.candidates.emptyPublished")
                  : job.application_method && job.application_method !== "internal"
                    ? t("rec.hub.externalApplications")
                    : t("employer.jobHub.candidates.emptyUnpublished")}
              </p>
            ) : (
              <CandidateTable
                employerId={employerId}
                employerSlug={employerSlug}
                employerName={employerName}
                jobId={jobId}
                jobTitle={title}
                page={page}
                loading={applicationsQuery.isLoading}
                error={applicationsQuery.isError}
                onRetry={() => void applicationsQuery.refetch()}
                view={candidateView}
                onViewChange={setView}
                team={recruitment?.team ?? []}
                canManage={recruitment?.canManage ?? false}
                canAssignTests={canEdit}
                openAssessmentIds={openAssessments.read === "ready" ? openAssessments.ids : null}
                onChanged={() => {
                  void applicationsQuery.refetch();
                  invalidateAll();
                }}
                labelKey="recruitment"
              />
            )}
          </section>
        </div>
      )}

      {/* ── 5 · Beslut & avslut ─────────────────────────────────────── */}
      {!view && step === "closing" && (
        <section className="pt-5" aria-labelledby="case-closing">
          {panelHeading("case-closing", "rec.step.closing", "rec.case.closingLede")}
          <div className="mt-4">
            <RecruitmentSettings
              employerId={employerId}
              employerSlug={employerSlug}
              jobId={jobId}
              recruitment={recruitment}
              recruitmentError={recruitmentQuery.isError}
              phase={phase}
              unresolved={openQuery.data?.rows ?? []}
              unresolvedTotal={openQuery.data?.total ?? unresolvedCount}
              closeable={closeable && canEdit}
              busy={busy}
              sections={["close", "complete"]}
              onClose={() => {
                setActionError(null);
                setPending({ kind: "close", id: jobId });
              }}
              onChanged={() => {
                void recruitmentQuery.refetch();
                invalidateAll();
              }}
            />
          </div>
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-foreground">{t("rec.case.history")}</h3>
            <div className="mt-1">
              <RecruitmentActivity
                employerId={employerId}
                employerSlug={employerSlug}
                jobId={jobId}
              />
            </div>
          </div>
        </section>
      )}

      {previewing && (
        <Dialog open onOpenChange={(o) => !o && setPreviewing(false)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("rec.case.previewAdvert")}</DialogTitle>
              <DialogDescription>{t("rec.case.previewLede")}</DialogDescription>
            </DialogHeader>
            <JobAdPreview
              values={fromJobRow(job as unknown as Parameters<typeof fromJobRow>[0])}
              employerName={employerName}
            />
          </DialogContent>
        </Dialog>
      )}

      {pending && (
        <ConfirmAction
          open
          onOpenChange={(o) => {
            if (!o) setPending(null);
          }}
          tone={pending.kind === "delete" ? "destructive" : "default"}
          busy={busy}
          title={t(
            pending.kind === "delete"
              ? "employer.jobs.confirm.delete.title"
              : pending.kind === "close"
                ? "employer.jobs.confirm.close.title"
                : "employer.jobs.confirm.duplicate.title",
          )}
          consequence={t(
            pending.kind === "delete"
              ? "employer.jobs.confirm.delete.body"
              : pending.kind === "close"
                ? "rec.hub.closeBody"
                : "employer.jobs.confirm.duplicate.body",
          )}
          confirmLabel={t(
            pending.kind === "delete"
              ? "employer.jobs.list.delete"
              : pending.kind === "close"
                ? "rec.hub.closeApplications"
                : "employer.jobs.list.duplicate",
          )}
          cancelLabel={t("employer.workforce.form.cancel")}
          onConfirm={() => {
            const { kind } = pending;
            setPending(null);
            if (kind === "delete") deleteMutation.mutate();
            else if (kind === "close") closeMutation.mutate();
            else dupMutation.mutate();
          }}
        />
      )}
    </div>
  );
}

/** A fact that needs no label: "32 ansökningar" says what it is. */
function Plain({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1">
      <dt className="sr-only">{"\u200b"}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="text-border">
      ·
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The pipeline's five counts                                          */
/* ------------------------------------------------------------------ */

/** The search parameters that land on exactly the rows a count counted.
 *
 *  Written once and used by both the chips and the next action, so the number
 *  and the list it opens can never be filtered differently. `total` carries
 *  only the job: a vacancy's total includes its closed outcomes, and a status
 *  filter would show fewer rows than the number promised. */
const PIPELINE_SEARCH: Record<
  JobPipelineStage,
  { status?: "submitted" | "interview" | "hired"; assessment?: "open" }
> = {
  total: {},
  awaitingReview: { status: "submitted" },
  assessmentOpen: { assessment: "open" },
  interview: { status: "interview" },
  hired: { status: "hired" },
};

const PIPELINE_CARDS: {
  stage: JobPipelineStage;
  labelKey: TranslationKey;
  search: (typeof PIPELINE_SEARCH)[JobPipelineStage];
}[] = (
  [
    ["total", "employer.jobHub.pipeline.total"],
    ["awaitingReview", "employer.jobHub.pipeline.awaitingReview"],
    ["assessmentOpen", "employer.jobHub.pipeline.assessmentOpen"],
    ["interview", "employer.jobHub.pipeline.interview"],
    ["hired", "employer.jobHub.pipeline.hired"],
  ] satisfies [JobPipelineStage, TranslationKey][]
).map(([stage, labelKey]) => ({ stage, labelKey, search: PIPELINE_SEARCH[stage] }));

/** The sentence for a next action that names no quantity. */
const JOB_NEXT_BODY: Record<JobNextActionKind, TranslationKey> = {
  loading: "employer.loading",
  unavailable: "employer.jobHub.next.unavailable",
  reviewNewApplications: "employer.jobHub.next.reviewNewApplications.other",
  awaitAssessments: "employer.jobHub.next.awaitAssessments.other",
  prepareInterviews: "employer.jobHub.next.prepareInterviews.other",
  noApplicationsYet: "employer.jobHub.next.noApplicationsYet",
  notPublished: "employer.jobHub.next.notPublished",
  nothingOutstanding: "employer.jobHub.next.nothingOutstanding",
};

/** And the plural base for the three that do. */
const JOB_NEXT_PLURAL: Partial<Record<JobNextActionKind, PluralKey>> = {
  reviewNewApplications: "employer.jobHub.next.reviewNewApplications",
  awaitAssessments: "employer.jobHub.next.awaitAssessments",
  prepareInterviews: "employer.jobHub.next.prepareInterviews",
};

/** One count, as a chip.
 *
 *  A `null` value draws an em dash and, when the read actually failed, says so
 *  beside it. There is no branch here that renders a zero for an unknown
 *  number, and the chip stops being a link when there is nothing to open --
 *  a link promising "0 awaiting review" is a link to an empty list. */
function PipelineChip({
  labelKey,
  count,
  employerSlug,
  jobId,
  search,
}: {
  labelKey: TranslationKey;
  count: StageCount;
  employerSlug: string;
  jobId: string;
  search: { status?: "submitted" | "interview" | "hired"; assessment?: "open" };
}) {
  const { t } = useT();
  const body = (
    <>
      <dd className="text-sm font-semibold tabular-nums text-foreground">
        {count.value === null ? <span aria-hidden="true">—</span> : count.value}
      </dd>
      <dt className="text-xs text-muted-foreground">{t(labelKey)}</dt>
      {count.read === "failed" && (
        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {t("continuity.report.unavailable")}
        </span>
      )}
    </>
  );
  const cls =
    "inline-flex items-baseline gap-1 rounded-full border border-border bg-card px-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  if (count.value === null || count.value === 0) {
    return <div className={cls}>{body}</div>;
  }
  return (
    <Link
      to="/employer/$employerSlug/applications"
      params={{ employerSlug }}
      search={{ job: jobId, ...search }}
      className={`${cls} transition-colors hover:border-accent/60`}
    >
      {body}
    </Link>
  );
}
