// Phase H3.2 — /employer/$employerSlug/applications: employer-scoped
// applications view. Backend it reads from (job_applications table + RLS,
// listApplicationsForEmployer, getApplicationCvSignedUrl) existed before
// H3.2 (Jobs MVP v1 H1, delivered independently). Follows the exact same
// access-resolution pattern as every other employer route: slug is a
// lookup key only, re-verified independently via
// listMyEmployerWorkspaces() on every load.
//
// H3.4A — extended with the full status-control model (reviewing /
// interview / rejected / hired), backed by the database-validated,
// atomically-audited set_application_status() RPC (via
// updateApplicationStatusAsEmployer). Only the transitions the RPC's own
// allow-list permits from the current status are ever offered as buttons —
// an employer can never be shown (or send) 'withdrawn'.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  listApplicationsForEmployer,
  getApplicationCvSignedUrl,
  updateApplicationStatusAsEmployer,
  type EmployerApplicationRow,
  type ApplicationStatus,
} from "@/lib/job-intelligence/applications.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/applications")({
  ssr: false,
  component: EmployerApplicationsPage,
  errorComponent: EmployerErrorState,
});

function EmployerApplicationsPage() {
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
    <ApplicationsList
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    />
  );
}

const STATUS_LABEL_KEY: Record<ApplicationStatus, TranslationKey> = {
  submitted: "employer.applications.status.submitted",
  reviewing: "employer.applications.status.reviewing",
  interview: "employer.applications.status.interview",
  rejected: "employer.applications.status.rejected",
  hired: "employer.applications.status.hired",
  withdrawn: "employer.applications.status.withdrawn",
};

type EmployerSettableStatus = "reviewing" | "interview" | "rejected" | "hired";

// Mirrors set_application_status()'s own employer-side transition
// allow-list exactly (supabase/migrations/20260720150000_h3_4a_candidate_
// application_core.sql) -- only ever offer a button for a transition the
// database will actually accept.
const EMPLOYER_NEXT_STATUSES: Partial<Record<ApplicationStatus, EmployerSettableStatus[]>> = {
  submitted: ["reviewing", "rejected"],
  reviewing: ["interview", "rejected"],
  interview: ["hired", "rejected"],
};

const ACTION_LABEL_KEY: Record<EmployerSettableStatus, TranslationKey> = {
  reviewing: "employer.applications.action.markReviewing",
  interview: "employer.applications.action.markInterview",
  rejected: "employer.applications.action.markRejected",
  hired: "employer.applications.action.markHired",
};

function ApplicationsList({
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
  const listFn = useServerFn(listApplicationsForEmployer);
  const signCvFn = useServerFn(getApplicationCvSignedUrl);
  const setStatusFn = useServerFn(updateApplicationStatusAsEmployer);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["employer", employerId, "applications"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  const setStatus = useMutation({
    mutationFn: (vars: { applicationId: string; newStatus: EmployerSettableStatus }) =>
      setStatusFn({ data: { applicationId: vars.applicationId, newStatus: vars.newStatus } }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["employer", employerId, "applications"] });
    },
    onError: () => setActionError(t("employer.applications.error.statusUpdate")),
  });

  async function onDownloadCv(applicationId: string) {
    setActionError(null);
    try {
      const result = await signCvFn({ data: { applicationId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setActionError(t("employer.applications.error.cvDownload"));
    }
  }

  const rows: EmployerApplicationRow[] = query.data ?? [];

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="applications"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
        {t("employer.applications.heading")}
      </h1>

      {actionError && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="mt-6">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{t("employer.applications.error.load")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            {t("employer.applications.empty")}
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const jobTitle =
                (lang === "sv" ? r.jobTitleSv : r.jobTitleEn) ||
                r.jobTitleSv ||
                r.jobTitleEn ||
                "—";
              return (
                <li key={r.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{jobTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.applicantDisplayName ?? t("employer.applications.anonymousCandidate")}
                        {" · "}
                        {formatDate(r.createdAt, lang)}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                      {t(STATUS_LABEL_KEY[r.status])}
                    </span>
                  </div>
                  {r.coverNote && <p className="mt-3 text-sm text-foreground">{r.coverNote}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(EMPLOYER_NEXT_STATUSES[r.status] ?? []).map((next) => (
                      <button
                        key={next}
                        type="button"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ applicationId: r.id, newStatus: next })}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                      >
                        {t(ACTION_LABEL_KEY[next])}
                      </button>
                    ))}
                    {r.hasCv && (
                      <button
                        type="button"
                        onClick={() => onDownloadCv(r.id)}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                      >
                        {t("employer.applications.action.downloadCv")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </EmployerAppShell>
  );
}
