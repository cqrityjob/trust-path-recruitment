// Phase H3 — /employer/$employerSlug/jobs: employer's own job list.
// Reads exclusively via listEmployerJobs (RLS + active-membership
// verified server-side). Actions link to /new and /$jobId/edit.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { ConfirmAction, usePendingConfirm } from "@/components/employer/ConfirmAction";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  listEmployerJobs,
  closeEmployerJob,
  deleteEmployerJob,
  restoreEmployerJob,
  duplicateEmployerJob,
  CLOSEABLE_STATUSES,
  DELETE_REFUSED_CODES,
  type EmployerJobRow,
} from "@/lib/job-intelligence/employer-jobs.functions";
import { translateJobServerError } from "@/components/employer/EmployerJobForm";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { jobStatusLabel } from "@/lib/job-intelligence/enum-labels";
import { formatDate } from "@/lib/job-intelligence/date-format";
import { listApplicationsForEmployer } from "@/lib/job-intelligence/applications.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { z } from "zod";
import { PhaseBadge } from "@/components/recruitment/RecruitmentStatus";
import { getRecruitmentOverview } from "@/lib/recruitment/recruitment.functions";
import { matchesPhaseFilter, PHASE_FILTERS, type PhaseFilter } from "@/lib/recruitment/definitions";
import { formatDay } from "@/lib/recruitment/format";
import type { TranslationKey } from "@/i18n/dictionaries";

// Every filter is in the URL, so the overview's "active recruitments" count can
// link to exactly the rows it counted, and a reload keeps the view.
const searchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  phase: z.enum(PHASE_FILTERS).optional().catch(undefined),
  owner: z.string().max(40).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/jobs/")({
  ssr: false,
  component: EmployerJobsListPage,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

function EmployerJobsListPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: employerPortalEnabled(),
  });

  if (!employerPortalEnabled()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }

  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  if (workspacesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (workspacesQuery.isError || !workspace) {
    return <EmployerAccessDenied workspaces={workspacesQuery.data} />;
  }

  return (
    <JobsList
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    />
  );
}

function JobsList({
  employerId,
  employerSlug,
  employerName,
  role,
  status,
  hasMultipleWorkspaces,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
}) {
  const { t, tp, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployerJobs);
  const listApplicationsFn = useServerFn(listApplicationsForEmployer);
  const closeFn = useServerFn(closeEmployerJob);
  const dupFn = useServerFn(duplicateEmployerJob);
  const deleteFn = useServerFn(deleteEmployerJob);
  const restoreFn = useServerFn(restoreEmployerJob);

  const jobsQuery = useQuery({
    queryKey: ["employer", employerId, "jobs"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  // ── WHERE THE APPLICATION COUNTS COME FROM ────────────────────────────
  //
  // "8 ansökningar · 2 nya" is the single most useful thing this table can
  // say, and it needs no new endpoint: listApplicationsForEmployer is already
  // RLS-scoped to this organisation, already carries jobId and status on every
  // row, and is already in the cache under this exact key -- the dashboard and
  // the applications list both hold it. So the counts are a projection of rows
  // the reader is independently authorised to see, tallied in the browser.
  //
  // Nothing is invented and nothing is estimated: a job with no applications
  // renders an em dash, and while the query is still in flight the column is
  // simply blank rather than showing a zero it would later contradict.
  const applicationsQuery = useQuery({
    queryKey: ["employer", employerId, "applications"],
    queryFn: () => listApplicationsFn({ data: { employerId } }),
  });

  const countsByJob = new Map<string, { total: number; fresh: number }>();
  for (const a of applicationsQuery.data ?? []) {
    const c = countsByJob.get(a.jobId) ?? { total: 0, fresh: 0 };
    c.total += 1;
    // "New" means nobody has moved it yet -- the same 'submitted' the
    // dashboard's "nya ansökningar" action counts and links to.
    if (a.status === "submitted") c.fresh += 1;
    countsByJob.set(a.jobId, c);
  }

  const [actionError, setActionError] = useState<string | null>(null);
  const view = Route.useSearch();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState(view.q ?? "");
  const phaseFilter: PhaseFilter = view.phase ?? "active";
  const loadOverview = useServerFn(getRecruitmentOverview);
  // Phase, responsible person and counts come from the same overview read the
  // dashboard uses, so a count there and a row here are computed once.
  const overviewQuery = useQuery({
    queryKey: ["employer", employerId, "recruitment-overview"],
    queryFn: () => loadOverview({ data: { employerId } }),
  });
  const summaryByJob = new Map((overviewQuery.data?.recruitments ?? []).map((r) => [r.jobId, r]));
  function setView(next: Partial<z.infer<typeof searchSchema>>) {
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  }
  const [pending, setPending] = usePendingConfirm<"delete" | "close" | "duplicate">();
  // Advertisements the database refused to delete. The list cannot see whether
  // a draft has assessment assignments or invitations hanging off it -- only
  // jobs_delete_draft() can -- so when it says no, the row stops offering the
  // delete it cannot perform and offers the close it can. Without this the
  // employer is left pressing a button that will refuse every time.
  const [deleteRefused, setDeleteRefused] = useState<ReadonlySet<string>>(new Set());

  const closeMutation = useMutation({
    mutationFn: (jobId: string) => closeFn({ data: { employerId, jobId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
    },
    onError: (e: any) => setActionError(e?.message ?? "CLOSE_JOB_FAILED"),
  });

  const dupMutation = useMutation({
    mutationFn: (jobId: string) => dupFn({ data: { employerId, jobId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
    },
    onError: (e: any) => setActionError(e?.message ?? "DUPLICATE_JOB_FAILED"),
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => deleteFn({ data: { employerId, jobId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
    },
    onError: (e: any, jobId: string) => {
      const code = e?.message ?? "DELETE_JOB_FAILED";
      setActionError(code);
      if (DELETE_REFUSED_CODES.includes(code)) {
        setDeleteRefused((prev) => new Set(prev).add(jobId));
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (jobId: string) => restoreFn({ data: { employerId, jobId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
    },
    onError: (e: any) => setActionError(e?.message ?? "RESTORE_JOB_FAILED"),
  });

  const allRows: EmployerJobRow[] = jobsQuery.data ?? [];
  const needle = (view.q ?? "").trim().toLowerCase();
  const rows = allRows
    .filter((r) => {
      const summary = summaryByJob.get(r.id);
      // Until the overview has answered, the phase of a row is unknown, and a
      // row whose phase is unknown is shown rather than silently hidden.
      if (!summary) return overviewQuery.isSuccess ? phaseFilter === "all" : true;
      return matchesPhaseFilter(phaseFilter, summary.phase, summary.unresolved);
    })
    .filter((r) => {
      if (!view.owner) return true;
      const owner = summaryByJob.get(r.id)?.responsibleUserId ?? null;
      return view.owner === "none" ? owner === null : owner === view.owner;
    })
    .filter(
      (r) =>
        needle === "" ||
        (r.title_sv ?? "").toLowerCase().includes(needle) ||
        (r.title_en ?? "").toLowerCase().includes(needle) ||
        (r.short_id ?? "").toLowerCase().includes(needle),
    );
  const phaseCounts = new Map<PhaseFilter, number>(
    PHASE_FILTERS.map((f) => [
      f,
      allRows.filter((r) => {
        const s = summaryByJob.get(r.id);
        return s ? matchesPhaseFilter(f, s.phase, s.unresolved) : false;
      }).length,
    ]),
  );

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="jobs"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {t("rec.list.heading")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("rec.list.lede")}</p>
        </div>
        <Link
          to="/employer/$employerSlug/jobs/new"
          params={{ employerSlug }}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("rec.overview.create")}
        </Link>
      </div>

      {actionError && (
        <div className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {translateJobServerError(actionError, t)}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="relative min-w-[14rem] flex-1 sm:max-w-xs" htmlFor="job-search">
          <span className="sr-only">{t("employer.jobs.list.searchLabel")}</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="job-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setView({ q: e.target.value || undefined });
            }}
            placeholder={t("employer.jobs.list.searchLabel")}
            className="h-10 w-full rounded-md border border-border bg-card pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("rec.list.filterStatus")}
          <select
            value={phaseFilter}
            onChange={(e) =>
              setView({
                phase: e.target.value === "active" ? undefined : (e.target.value as PhaseFilter),
              })
            }
            className="h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {PHASE_FILTERS.map((f) => (
              <option key={f} value={f}>
                {t(`rec.list.phase.${f}` as TranslationKey)}
                {overviewQuery.isSuccess ? ` (${phaseCounts.get(f) ?? 0})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("rec.col.responsible")}
          <select
            value={view.owner ?? ""}
            onChange={(e) => setView({ owner: e.target.value || undefined })}
            className="h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">{t("rec.filter.owner.all")}</option>
            <option value="none">{t("rec.filter.owner.none")}</option>
            {(overviewQuery.data?.team ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {overviewQuery.isError && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          {t("rec.overview.unavailable")}
        </p>
      )}

      {/* One dialog for the whole list. The pending row decides what it says,
          so a five-row table does not carry five dialogs able to open at once. */}
      {pending && (
        <ConfirmAction
          open
          onOpenChange={(o) => {
            if (!o) setPending(null);
          }}
          tone={pending.kind === "delete" ? "destructive" : "default"}
          busy={deleteMutation.isPending || closeMutation.isPending || dupMutation.isPending}
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
            const { kind, id } = pending;
            setPending(null);
            if (kind === "delete") deleteMutation.mutate(id);
            else if (kind === "close") closeMutation.mutate(id);
            else dupMutation.mutate(id);
          }}
        />
      )}

      <div className="mt-6">
        {jobsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            {needle !== "" || view.owner
              ? t("employer.jobs.list.emptySearch")
              : allRows.length === 0
                ? t("employer.jobs.list.empty")
                : t("rec.list.emptyPhase")}
          </div>
        ) : (
          // Five columns and a row of actions do not fit a phone. The wrapper
          // was overflow-hidden, so on a narrow screen the last column was
          // simply cut off rather than reachable.
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("rec.col.role")}</th>
                  <th className="px-4 py-3">{t("employer.jobs.list.status")}</th>
                  <th className="px-4 py-3">{t("employer.jobs.list.applications")}</th>
                  <th className="px-4 py-3">{t("rec.col.responsible")}</th>
                  <th className="px-4 py-3">{t("rec.col.next")}</th>
                  <th className="px-4 py-3 text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const editable = r.status === "draft" || r.status === "rejected";

                  // ── ONE OUTCOME, ONE BUTTON ───────────────────────────
                  //
                  // "Stäng" and "Arkivera" both set status='archived'. Two
                  // buttons, two confirmations, one result -- which is why a
                  // customer pressed Stäng and then went looking for where
                  // the advertisement had gone.
                  //
                  // Arkivera is gone. What is left is the real distinction:
                  //
                  //   delete  a draft that never went live and has nothing
                  //           attached, which can genuinely be discarded
                  //   close   everything that was ever live, which keeps its
                  //           applications and its history
                  //
                  // published_at, not status alone, decides. restoreEmployerJob
                  // moves a closed advertisement back to 'draft', so a job
                  // that WAS published can be sitting at status 'draft' with
                  // a full recruitment history behind it. The database
                  // refuses to delete that -- this is so the button is not
                  // offered in the first place.
                  //
                  // pending_review is in neither set: it belongs to a
                  // moderator until they are done with it, and the status
                  // trigger refuses both transitions for it.
                  const deletable =
                    r.status === "draft" && r.published_at === null && !deleteRefused.has(r.id);
                  const closeable = !deletable && CLOSEABLE_STATUSES.includes(r.status);
                  const restorable = r.status === "archived";
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3">
                        {/* The advertisement is the way into its own
                            recruitment workspace. It used to be plain text,
                            so a published job -- the one thing a recruiter
                            actually works -- had no destination at all and
                            only a draft could be opened, via Redigera. */}
                        <Link
                          to="/employer/$employerSlug/jobs/$jobId"
                          params={{ employerSlug, jobId: r.id }}
                          className="font-medium text-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {r.title_sv || r.title_en || (
                            <span className="text-muted-foreground">
                              {t("employer.jobs.list.untitled")}
                            </span>
                          )}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.short_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {summaryByJob.get(r.id) ? (
                          <PhaseBadge phase={summaryByJob.get(r.id)!.phase} />
                        ) : (
                          <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                            {jobStatusLabel(r.status, lang) || r.status}
                          </span>
                        )}
                      </td>
                      {/* Applications, and how many nobody has looked at yet.
                          The whole cell is the way into exactly those rows, so
                          the number lands on what it counted. */}
                      <td className="px-4 py-3 text-xs">
                        {applicationsQuery.isLoading ? (
                          <span className="text-muted-foreground">&nbsp;</span>
                        ) : (
                          (() => {
                            const c = countsByJob.get(r.id);
                            if (!c || c.total === 0)
                              return <span className="text-muted-foreground">—</span>;
                            return (
                              <Link
                                to="/employer/$employerSlug/jobs/$jobId"
                                params={{ employerSlug, jobId: r.id }}
                                search={{ tab: "candidates" as const, stage: "all" as const }}
                                className="inline-flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <span className="font-medium tabular-nums text-foreground">
                                  {c.total}
                                </span>
                                {tp("employer.jobs.list.applicationCount", c.total)}
                                {c.fresh > 0 && (
                                  <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                                    {tp("employer.jobs.list.newCount", c.fresh).replace(
                                      "{n}",
                                      String(c.fresh),
                                    )}
                                  </span>
                                )}
                              </Link>
                            );
                          })()
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {summaryByJob.get(r.id)?.responsibleName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {(() => {
                          const sm = summaryByJob.get(r.id);
                          if (sm?.nextInterviewAt)
                            return `${t("rec.overview.nextInterview")} ${formatDay(sm.nextInterviewAt, lang)}`;
                          if (sm?.phase === "published" && r.deadline_at)
                            return `${t("rec.overview.deadline")} ${formatDay(r.deadline_at, lang)}`;
                          if (sm?.phase === "closed")
                            return sm.unresolved > 0
                              ? t("rec.overview.decideRemaining").replace(
                                  "{n}",
                                  String(sm.unresolved),
                                )
                              : t("rec.list.readyToComplete");
                          return `${t("employer.jobs.list.updated")} ${formatDate(r.updated_at, lang)}`;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* ── ONE PRIMARY, THE REST IN A MENU ────────────
                            Open, Edit, Duplicate, Delete, Close and Restore
                            used to sit in one wrapping row of identically
                            sized buttons, so "Ta bort" had the same visual
                            weight as the action a recruiter wants 95% of the
                            time -- and on a narrow screen they wrapped into an
                            unpredictable order. Öppna is now the only button;
                            everything that edits, copies or ENDS the
                            advertisement is one deliberate click further away.
                            Every destructive path keeps its existing
                            ConfirmAction dialog. */}
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to="/employer/$employerSlug/jobs/$jobId"
                            params={{ employerSlug, jobId: r.id }}
                            className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {t("employer.jobs.list.open")}
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={t("employer.jobs.list.moreActions")}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {editable && (
                                <DropdownMenuItem asChild>
                                  <Link
                                    to="/employer/$employerSlug/jobs/$jobId/edit"
                                    params={{ employerSlug, jobId: r.id }}
                                  >
                                    {t("employer.jobs.list.edit")}
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                disabled={dupMutation.isPending}
                                onSelect={() => {
                                  setActionError(null);
                                  setPending({ kind: "duplicate", id: r.id });
                                }}
                              >
                                {t("employer.jobs.list.duplicate")}
                              </DropdownMenuItem>
                              {restorable && (
                                <DropdownMenuItem
                                  disabled={restoreMutation.isPending}
                                  onSelect={() => {
                                    setActionError(null);
                                    restoreMutation.mutate(r.id);
                                  }}
                                >
                                  {t("employer.jobs.list.restore")}
                                </DropdownMenuItem>
                              )}
                              {(closeable || deletable) && <DropdownMenuSeparator />}
                              {closeable && (
                                <DropdownMenuItem
                                  disabled={closeMutation.isPending}
                                  onSelect={() => {
                                    setActionError(null);
                                    setPending({ kind: "close", id: r.id });
                                  }}
                                >
                                  {t("employer.jobs.list.close")}
                                </DropdownMenuItem>
                              )}
                              {deletable && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={deleteMutation.isPending}
                                  onSelect={() => {
                                    setActionError(null);
                                    setPending({ kind: "delete", id: r.id });
                                  }}
                                >
                                  {t("employer.jobs.list.delete")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </EmployerAppShell>
  );
}
