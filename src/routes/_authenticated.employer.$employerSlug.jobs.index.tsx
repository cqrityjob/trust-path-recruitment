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

  const jobsQuery = useQuery({
    queryKey: ["employer", employerId, "jobs"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  const [actionError, setActionError] = useState<string | null>(null);

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

  const rows: EmployerJobRow[] = jobsQuery.data ?? [];

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

      <div className="mt-8">
        {jobsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            {t("employer.jobs.list.empty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
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
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {r.title_sv || r.title_en || (
                            <span className="text-muted-foreground">(untitled)</span>
                          )}
                        </div>
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
