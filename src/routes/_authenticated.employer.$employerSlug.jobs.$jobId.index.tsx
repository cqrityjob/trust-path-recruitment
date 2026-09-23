// The Job Recruitment Hub — /employer/$employerSlug/jobs/$jobId.
//
// ── WHY THIS PAGE EXISTS ────────────────────────────────────────────────
//
// Until now a job advertisement was a row in a table with a "Redigera" button
// on it, and only while it was a draft. Once published, the single most
// important object in the whole product -- the thing the employer actually
// hired for -- had no destination at all. You could not click it. There was
// nowhere to go.
//
// So a recruiter working one vacancy had to hold it together themselves:
// Mina annonser to see the advertisement, Ansokningar to see who applied to
// it (unfiltered, every job mixed into one list), and their own memory to know
// which of those people belonged to this vacancy. The database has always
// joined applications to a job. The interface simply never did.
//
// This page is that join, rendered. One vacancy, its state, and everyone in
// its pipeline, on one screen.
//
// ── THE PIPELINE, AND WHERE ITS NUMBERS COME FROM ───────────────────────
//
// This page used to say that a per-vacancy assessment aggregate could not be
// answered in one read, and that was true of the read it was looking at:
// scp_application_assessments is scoped to ONE application, so a per-job total
// through it means N round trips.
//
// It is answerable through a different pair, and both of them already exist:
// the governed assessment pipeline carries one row per attempt WITH its
// assignment, and assessment_assignments maps an assignment to an application.
// Joined, they give every application in the organisation the state of its
// assessments -- employer-wide, two requests, on the cache keys the assessment
// workspace already uses, and no new read model and no migration. See
// src/lib/employer-continuity/open-assessments.ts.
//
// What is still deliberately absent is any number that would require the page
// to read a SCORE: no "3 passed", no average, no quality. The assessment
// column counts whether a process is open, which is a process fact.
//
// ── AND A NUMBER IS NEVER INVENTED ──────────────────────────────────────
//
// Every count on this page can be `null`, and `null` draws a dash and names
// the reason. `applicationsQuery.data ?? []` used to be the whole story, so a
// failed read rendered as "no applications yet" under a published
// advertisement -- a confident, wrong sentence about the employer's own
// vacancy. The projection has no path from a failed read to a zero.
//
// No new lifecycle vocabulary. The columns below are job_applications.status
// as it already is, labelled through APPLICATION_STATUS_LABEL_KEY, in the
// order the employer transition table already permits. This page introduces
// no state the rest of the product does not have.
//
// Access resolution is the same as every other /employer/$employerSlug/*
// route: the slug is a lookup key, re-verified through
// listMyEmployerWorkspaces() by the shared frame on every load.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleDashed, ExternalLink, Users } from "lucide-react";
import { useT, type PluralKey } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ConfirmAction, usePendingConfirm } from "@/components/employer/ConfirmAction";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { JobsPage } from "@/components/academy/AcademyWorkspace";
import { translateJobServerError } from "@/components/employer/EmployerJobForm";
import { formatDate } from "@/lib/job-intelligence/date-format";
import { jobStatusLabel } from "@/lib/job-intelligence/enum-labels";
import {
  getEmployerJob,
  submitEmployerJob,
  closeEmployerJob,
  deleteEmployerJob,
  restoreEmployerJob,
  duplicateEmployerJob,
  CLOSEABLE_STATUSES,
  DELETE_REFUSED_CODES,
} from "@/lib/job-intelligence/employer-jobs.functions";
import {
  listApplicationsForEmployer,
  type EmployerApplicationRow,
} from "@/lib/job-intelligence/applications.functions";
import { APPLICATION_STATUS_LABEL_KEY } from "@/lib/job-intelligence/application-status";
import type { ApplicationStatus } from "@/lib/job-intelligence/applications.functions";
import { checkJobReadiness, type JobReadinessInput } from "@/lib/job-intelligence/job-readiness";
import {
  projectJobPipeline,
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
  updated_at: string;
};

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/jobs/$jobId/")({
  ssr: false,
  component: JobHubRoute,
  errorComponent: EmployerErrorState,
});

function JobHubRoute() {
  const { employerSlug, jobId } = Route.useParams();
  return (
    <JobsPage employerSlug={employerSlug}>
      {(ws) => (
        <JobHub
          employerId={ws.employerId}
          employerSlug={employerSlug}
          jobId={jobId}
          canEdit={ws.role === "owner" || ws.role === "admin"}
        />
      )}
    </JobsPage>
  );
}

/** The pipeline columns, in the order a recruitment actually moves. `withdrawn`
 *  is the candidate's own action and belongs with the closed outcomes, not in
 *  its own column. */
const PIPELINE: { key: string; statuses: ApplicationStatus[]; labelKey: TranslationKey }[] = [
  { key: "new", statuses: ["submitted"], labelKey: "employer.jobHub.stage.new" },
  { key: "reviewing", statuses: ["reviewing"], labelKey: "employer.jobHub.stage.reviewing" },
  { key: "interview", statuses: ["interview"], labelKey: "employer.jobHub.stage.interview" },
  { key: "hired", statuses: ["hired"], labelKey: "employer.jobHub.stage.hired" },
  {
    key: "closed",
    statuses: ["rejected", "withdrawn"],
    labelKey: "employer.jobHub.stage.closed",
  },
];

function JobHub({
  employerId,
  employerSlug,
  jobId,
  canEdit,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string;
  canEdit: boolean;
}) {
  const { t, tp, lang } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFn = useServerFn(getEmployerJob);
  const listApplicationsFn = useServerFn(listApplicationsForEmployer);
  const submitFn = useServerFn(submitEmployerJob);
  const closeFn = useServerFn(closeEmployerJob);
  const deleteFn = useServerFn(deleteEmployerJob);
  const restoreFn = useServerFn(restoreEmployerJob);
  const dupFn = useServerFn(duplicateEmployerJob);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = usePendingConfirm<"delete" | "close" | "duplicate">();
  // Set when jobs_delete_draft() refuses. This page cannot see whether a draft
  // has assignments or invitations attached; only the database can, so it
  // stops offering the delete and offers the close instead. See jobs.index.tsx.
  const [deleteRefused, setDeleteRefused] = useState(false);

  const jobQuery = useQuery({
    queryKey: ["employer", employerId, "job", jobId],
    queryFn: () => getFn({ data: { employerId, jobId } }),
  });

  // Scoped in the database, not filtered in the browser: listApplicationsForEmployer
  // already takes a jobId and applies it to the RLS-scoped query, so this page
  // never holds another vacancy's candidates.
  const applicationsQuery = useQuery({
    queryKey: ["employer", employerId, "applications", "job", jobId],
    queryFn: () => listApplicationsFn({ data: { employerId, jobId } }),
  });

  // The assessment half of the pipeline. Always on here -- this is the one
  // surface whose job is to summarise the vacancy -- and shared with the
  // assessment workspace's own cache keys, so an employer who has both open
  // pays for one fetch.
  const openAssessments = useOpenAssessmentApplications(employerId, true);

  /** Every mutation on this page refreshes the same three caches: this job,
   *  the list it came from, and the dashboard counters that read both. */
  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "job", jobId] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
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

  const backLink = (
    <Link
      to="/employer/$employerSlug/jobs"
      params={{ employerSlug }}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("employer.jobHub.backToJobs")}
    </Link>
  );

  if (jobQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {backLink}
        <p className="mt-6 text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {backLink}
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

  const readiness = checkJobReadiness(job);
  const rows: EmployerApplicationRow[] = applicationsQuery.data ?? [];

  // How the read WENT, kept apart from what it found. There is no client-side
  // way to tell a policy refusal from any other failure here, and guessing
  // would be the same lie in the other direction, so both are reported as
  // "could not be read" -- which is what we actually know.
  const applicationsRead: PipelineRead = applicationsQuery.isLoading
    ? "loading"
    : applicationsQuery.isError
      ? "failed"
      : "ready";

  const pipeline = projectJobPipeline({
    jobStatus: status,
    applicationsRead,
    applications: rows,
    assessmentRead: openAssessments.read,
    applicationsWithOpenAssessment: openAssessments.ids,
  });

  const editable = status === "draft" || status === "rejected";
  const submittable = editable;
  // Same rule as the list, from the same constants the server enforces: a
  // never-published draft with nothing attached can go, and anything else that
  // was ever live is closed instead. See jobs.index.tsx.
  const deletable =
    job !== null && status === "draft" && job.published_at === null && !deleteRefused;
  const closeable = !deletable && CLOSEABLE_STATUSES.includes(status);
  const restorable = status === "archived";
  const busy =
    submitMutation.isPending ||
    closeMutation.isPending ||
    deleteMutation.isPending ||
    restoreMutation.isPending ||
    dupMutation.isPending;

  return (
    <div className="mx-auto w-full max-w-4xl">
      {backLink}

      {/* ── The advertisement ───────────────────────────────────────── */}
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {t("employer.jobHub.eyebrow")}
        </p>
        <h1
          className="mt-1 text-[1.5rem] font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
            {jobStatusLabel(status, lang) || status}
          </span>
          <span className="text-xs text-muted-foreground">{job.short_id}</span>
          {/* The live advertisement, as a candidate sees it. Only offered when
              there genuinely is one to look at. */}
          {status === "published" && job.slug && (
            <Link
              to="/jobs/$slug"
              params={{ slug: String(job.slug) }}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              {t("employer.jobHub.viewPublic")}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
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

      {/* ── What to do with the advertisement itself ────────────────── */}
      {canEdit && (
        <div className="mt-6 flex flex-wrap gap-2">
          {editable && (
            <Link
              to="/employer/$employerSlug/jobs/$jobId/edit"
              params={{ employerSlug, jobId }}
              className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("employer.jobs.list.edit")}
            </Link>
          )}
          {submittable && (
            // Disabled only while something is genuinely outstanding, and the
            // checklist below says what. A submit that the server will refuse
            // is not an action, it is a trap.
            <button
              type="button"
              disabled={busy || !readiness.ready}
              onClick={() => submitMutation.mutate()}
              className="inline-flex min-h-[36px] items-center rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {t("employer.jobHub.action.submit")}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setActionError(null);
              setPending({ kind: "duplicate", id: jobId });
            }}
            className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("employer.jobs.list.duplicate")}
          </button>
          {restorable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setActionError(null);
                restoreMutation.mutate();
              }}
              className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("employer.jobs.list.restore")}
            </button>
          )}
          {deletable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setActionError(null);
                setPending({ kind: "delete", id: jobId });
              }}
              className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("employer.jobs.list.delete")}
            </button>
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
                    ? "employer.jobs.confirm.close.body"
                    : "employer.jobs.confirm.duplicate.body",
              )}
              confirmLabel={t(
                pending.kind === "delete"
                  ? "employer.jobs.list.delete"
                  : pending.kind === "close"
                    ? "employer.jobs.list.close"
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
          {closeable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setActionError(null);
                setPending({ kind: "close", id: jobId });
              }}
              className="inline-flex min-h-[36px] items-center rounded-md border border-destructive/60 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("employer.jobs.list.close")}
            </button>
          )}
        </div>
      )}

      {/* ── Ready to publish? ───────────────────────────────────────── */}
      {/*  Shown only where it can still change something: once an
          advertisement is in a moderator's queue or live, a checklist telling
          the employer what to fill in is describing a decision they no longer
          own. */}
      {editable && (
        <section className="mt-8" aria-labelledby="job-readiness">
          <h2 id="job-readiness" className="text-lg font-semibold text-foreground">
            {t("employer.jobHub.readiness.heading")}
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            {readiness.ready
              ? t("employer.jobHub.readiness.ready")
              : t("employer.jobHub.readiness.notReady")}
          </p>
          <ul className="mt-4 space-y-1.5">
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
        </section>
      )}

      {/* ── The facts ──────────────────────────────────────────────── */}
      <section className="mt-8" aria-labelledby="job-facts">
        <h2 id="job-facts" className="text-lg font-semibold text-foreground">
          {t("employer.jobHub.facts.heading")}
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <Fact label={t("employer.jobHub.fact.location")}>
            {job.location_text || job.city || "—"}
          </Fact>
          <Fact label={t("employer.jobHub.fact.published")}>
            {job.published_at ? formatDate(job.published_at, lang) : "—"}
          </Fact>
          <Fact label={t("employer.jobs.list.expires")}>
            {job.expires_at ? formatDate(job.expires_at, lang) : "—"}
          </Fact>
          <Fact label={t("employer.jobs.list.updated")}>{formatDate(job.updated_at, lang)}</Fact>
        </dl>
      </section>

      {/* ── The pipeline ───────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="job-pipeline">
        <h2 id="job-pipeline" className="text-lg font-semibold text-foreground">
          {t("employer.jobHub.pipeline.heading")}
        </h2>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.jobHub.pipeline.lede")}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE_CARDS.map((card) => (
            <PipelineCard
              key={card.stage}
              labelKey={card.labelKey}
              count={pipeline.counts[card.stage]}
              employerSlug={employerSlug}
              jobId={jobId}
              search={card.search}
            />
          ))}
        </dl>

        {/* ── The one next thing ──────────────────────────────────────
            One sentence about this vacancy's own work, and never about the
            people in it: no ranking, no assessment of the field, no advice to
            close or extend. Where the honest answer is a statement it is a
            statement, and no button is drawn. */}
        <div className="mt-4 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t("employer.jobHub.next.heading")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="max-w-[68ch] text-[13px] leading-relaxed text-foreground" role="status">
              {(() => {
                // A quantity where there is one, a sentence where there is
                // not. The three quantified actions are the only ones whose
                // number means anything; the rest are statements and reading
                // "0 …" for them would be noise.
                const plural = JOB_NEXT_PLURAL[pipeline.nextAction.kind];
                return plural && pipeline.nextAction.count > 0
                  ? `${pipeline.nextAction.count} ${tp(plural, pipeline.nextAction.count)}`
                  : t(JOB_NEXT_BODY[pipeline.nextAction.kind]);
              })()}
            </p>
            {pipeline.nextAction.stage && (
              <Link
                to="/employer/$employerSlug/applications"
                params={{ employerSlug }}
                search={{
                  job: jobId,
                  ...(PIPELINE_SEARCH[pipeline.nextAction.stage] ?? {}),
                }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("employer.jobHub.next.open")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            {pipeline.nextAction.kind === "unavailable" && (
              <button
                type="button"
                onClick={() => void applicationsQuery.refetch()}
                className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("continuity.next.retry")}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── The people ─────────────────────────────────────────────── */}
      <section className="mt-10 pb-4" aria-labelledby="job-candidates">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="job-candidates" className="text-lg font-semibold text-foreground">
            {t("employer.jobHub.candidates.heading")}
          </h2>
          {rows.length > 0 && (
            <Link
              to="/employer/$employerSlug/applications"
              params={{ employerSlug }}
              search={{ job: jobId }}
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              {t("employer.jobHub.candidates.openList")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>

        {applicationsQuery.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : applicationsQuery.isError ? (
          /* NOT an empty state. "Nobody has applied" and "we could not find
             out who applied" are different sentences, and the second one is
             the only honest thing to say here. */
          <div
            role="alert"
            className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-900 dark:text-amber-200"
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
        ) : rows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {status === "published"
              ? t("employer.jobHub.candidates.emptyPublished")
              : t("employer.jobHub.candidates.emptyUnpublished")}
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {PIPELINE.map((stage) => {
              const inStage = rows.filter((r) => stage.statuses.includes(r.status));
              if (inStage.length === 0) return null;
              return (
                <div key={stage.key}>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(stage.labelKey)}
                    <span className="tabular-nums">({inStage.length})</span>
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {inStage.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-background p-3"
                      >
                        {/* The person is the link. Everything an employer
                            does next -- assessment, review, interview,
                            decision -- happens on their page. */}
                        <Link
                          to="/employer/$employerSlug/applications/$applicationId"
                          params={{ employerSlug, applicationId: r.id }}
                          className="min-w-0 text-sm font-medium text-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {r.applicantDisplayName ?? t("employer.applications.anonymousCandidate")}
                        </Link>
                        <span className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {t(APPLICATION_STATUS_LABEL_KEY[r.status])}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatDate(r.createdAt, lang)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
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
/* The pipeline's five cards                                           */
/* ------------------------------------------------------------------ */

/** The search parameters that land on exactly the rows a count counted.
 *
 *  Written once and used by both the cards and the next action, so the number
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

/** One count.
 *
 *  A `null` value draws an em dash and, when the read actually failed, says so
 *  underneath. There is no branch here that renders a zero for an unknown
 *  number, and the whole card stops being a link when there is nothing to open
 *  -- a link promising "0 awaiting review" is a link to an empty list. */
function PipelineCard({
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
      <dd className="text-2xl font-semibold tabular-nums text-foreground">
        {count.value === null ? <span aria-hidden="true">—</span> : count.value}
      </dd>
      <dt className="mt-1 text-xs leading-snug text-muted-foreground">{t(labelKey)}</dt>
      {count.read === "failed" && (
        <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {t("continuity.report.unavailable")}
        </p>
      )}
    </>
  );

  const cls =
    "rounded-[12px] border border-border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  if (count.value === null || count.value === 0) {
    return <div className={cls}>{body}</div>;
  }
  return (
    <Link
      to="/employer/$employerSlug/applications"
      params={{ employerSlug }}
      search={{ job: jobId, ...search }}
      className={`${cls} block transition-colors hover:border-accent/60`}
    >
      {body}
    </Link>
  );
}
