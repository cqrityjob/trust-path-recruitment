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
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  listEmployerJobs,
  closeEmployerJob,
  archiveEmployerJob,
  restoreEmployerJob,
  duplicateEmployerJob,
  type EmployerJobRow,
} from "@/lib/job-intelligence/employer-jobs.functions";
import { translateJobServerError } from "@/components/employer/EmployerJobForm";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { jobStatusLabel } from "@/lib/job-intelligence/enum-labels";
import { formatDate } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/jobs/")({
  ssr: false,
  component: EmployerJobsListPage,
  errorComponent: EmployerErrorState,
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
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployerJobs);
  const closeFn = useServerFn(closeEmployerJob);
  const dupFn = useServerFn(duplicateEmployerJob);
  const archiveFn = useServerFn(archiveEmployerJob);
  const restoreFn = useServerFn(restoreEmployerJob);

  const jobsQuery = useQuery({
    queryKey: ["employer", employerId, "jobs"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Archived is a separate view rather than another row in the same list.
  // Putting away a draft has to actually make it go away, or the feature has
  // not solved the clutter it exists for.
  const [showArchived, setShowArchived] = useState(false);

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

  const archiveMutation = useMutation({
    mutationFn: (jobId: string) => archiveFn({ data: { employerId, jobId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employer", employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", employerId, "dashboard-stats"] });
    },
    onError: (e: any) => setActionError(e?.message ?? "ARCHIVE_JOB_FAILED"),
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
  const archivedCount = allRows.filter((r) => r.status === "archived").length;
  const needle = search.trim().toLowerCase();
  const rows = allRows
    .filter((r) => (showArchived ? r.status === "archived" : r.status !== "archived"))
    .filter(
      (r) =>
        needle === "" ||
        (r.title_sv ?? "").toLowerCase().includes(needle) ||
        (r.title_en ?? "").toLowerCase().includes(needle) ||
        (r.short_id ?? "").toLowerCase().includes(needle),
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
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("employer.jobs.list.heading")}
        </h1>
        <Link
          to="/employer/$employerSlug/jobs/new"
          params={{ employerSlug }}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          {t("employer.jobs.list.newJob")}
        </Link>
      </div>

      {actionError && (
        <div className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {translateJobServerError(actionError, t)}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="job-search">
          {t("employer.jobs.list.searchLabel")}
        </label>
        <input
          id="job-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("employer.jobs.list.searchLabel")}
          className="h-10 w-full max-w-xs rounded-md border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <div className="inline-flex overflow-hidden rounded-md border border-border" role="group">
          <button
            type="button"
            aria-pressed={!showArchived}
            onClick={() => setShowArchived(false)}
            className={
              !showArchived
                ? "bg-foreground px-3 py-2 text-xs font-semibold text-background"
                : "px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
            }
          >
            {t("employer.jobs.list.filterActive")}
          </button>
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => setShowArchived(true)}
            className={
              showArchived
                ? "bg-foreground px-3 py-2 text-xs font-semibold text-background"
                : "px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
            }
          >
            {t("employer.jobs.list.filterArchived")} ({archivedCount})
          </button>
        </div>
      </div>

      <div className="mt-6">
        {jobsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            {needle !== ""
              ? t("employer.jobs.list.emptySearch")
              : showArchived
                ? t("employer.jobs.list.emptyArchived")
                : t("employer.jobs.list.empty")}
          </div>
        ) : (
          // Five columns and a row of actions do not fit a phone. The wrapper
          // was overflow-hidden, so on a narrow screen the last column was
          // simply cut off rather than reachable.
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("employer.jobs.list.title")}</th>
                  <th className="px-4 py-3">{t("employer.jobs.list.status")}</th>
                  <th className="px-4 py-3">{t("employer.jobs.list.expires")}</th>
                  <th className="px-4 py-3">{t("employer.jobs.list.updated")}</th>
                  <th className="px-4 py-3 text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const editable = r.status === "draft" || r.status === "rejected";
                  const closeable = r.status === "published";
                  // published has its own "close" wording; these are the ones
                  // that were previously stuck with no action at all.
                  const archivable = r.status === "draft" || r.status === "rejected";
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
                        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                          {jobStatusLabel(r.status, lang) || r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.expires_at ? formatDate(r.expires_at, lang) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(r.updated_at, lang)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {/* Open works for every status; Redigera only for
                              the two the database will actually accept an
                              edit on. */}
                          <Link
                            to="/employer/$employerSlug/jobs/$jobId"
                            params={{ employerSlug, jobId: r.id }}
                            className="rounded-md border border-accent/50 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
                          >
                            {t("employer.jobs.list.open")}
                          </Link>
                          {editable && (
                            <Link
                              to="/employer/$employerSlug/jobs/$jobId/edit"
                              params={{ employerSlug, jobId: r.id }}
                              className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                            >
                              {t("employer.jobs.list.edit")}
                            </Link>
                          )}
                          <button
                            type="button"
                            disabled={dupMutation.isPending}
                            onClick={() => {
                              if (window.confirm(t("employer.jobs.list.confirmDuplicate"))) {
                                setActionError(null);
                                dupMutation.mutate(r.id);
                              }
                            }}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                          >
                            {t("employer.jobs.list.duplicate")}
                          </button>
                          {archivable && (
                            <button
                              type="button"
                              disabled={archiveMutation.isPending}
                              onClick={() => {
                                if (window.confirm(t("employer.jobs.list.confirmArchive"))) {
                                  setActionError(null);
                                  archiveMutation.mutate(r.id);
                                }
                              }}
                              className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                            >
                              {t("employer.jobs.list.archive")}
                            </button>
                          )}
                          {restorable && (
                            <button
                              type="button"
                              disabled={restoreMutation.isPending}
                              onClick={() => {
                                setActionError(null);
                                restoreMutation.mutate(r.id);
                              }}
                              className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                            >
                              {t("employer.jobs.list.restore")}
                            </button>
                          )}
                          {closeable && (
                            <button
                              type="button"
                              disabled={closeMutation.isPending}
                              onClick={() => {
                                if (window.confirm(t("employer.jobs.list.confirmClose"))) {
                                  setActionError(null);
                                  closeMutation.mutate(r.id);
                                }
                              }}
                              className="rounded-md border border-destructive/60 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                            >
                              {t("employer.jobs.list.close")}
                            </button>
                          )}
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
