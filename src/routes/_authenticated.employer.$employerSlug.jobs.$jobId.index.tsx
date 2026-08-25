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
// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────
//
// No assessment aggregate. A recruiter would reasonably want "3 sent, 1
// completed, 7 responses to review" per vacancy, and the honest position is
// that the platform cannot answer it in one read today: scp_application_
// assessments is scoped to ONE application, so a per-job total would mean
// either N round trips or a new read model, and a new read model is a hosted
// migration. Each candidate carries their own assessment state on their own
// page, which is where a recruiter acts on it anyway. Inventing a number here
// that no read model produces would be worse than not showing one.
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
import { useT } from "@/i18n/context";
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
  const { t, lang } = useT();
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
