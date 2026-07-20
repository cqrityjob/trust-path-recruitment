// Phase H3.2 — /employer/$employerSlug/applications: employer-scoped
// applications view. New in this phase. Backend it reads from
// (job_applications table + RLS, listApplicationsForEmployer,
// updateApplicationAsEmployer, getApplicationCvSignedUrl) already existed
// end-to-end before this phase (Jobs MVP v1 H1, delivered independently) —
// only the employer-facing view was missing, per the H3.2 audit. Follows
// the exact same access-resolution pattern as every other employer route:
// slug is a lookup key only, re-verified independently via
// listMyEmployerWorkspaces() on every load.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EmployerWorkspaceChrome,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerWorkspaceChrome";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import {
  listApplicationsForEmployer,
  getApplicationCvSignedUrl,
  updateApplicationAsEmployer,
  type EmployerApplicationRow,
} from "@/lib/job-intelligence/applications.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/applications")({
  ssr: false,
  component: EmployerApplicationsPage,
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
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employer.comingSoon.heading")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
        </Section>
      </SiteLayout>
    );
  }

  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  if (workspacesQuery.isLoading) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }

  if (workspacesQuery.isError || !workspace) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employer.accessDenied.heading")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.accessDenied.body")}</p>
        </Section>
      </SiteLayout>
    );
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

const STATUS_LABEL_KEY: Record<EmployerApplicationRow["status"], TranslationKey> = {
  submitted: "employer.applications.status.submitted",
  viewed: "employer.applications.status.viewed",
  withdrawn: "employer.applications.status.withdrawn",
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
  const markViewedFn = useServerFn(updateApplicationAsEmployer);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["employer", employerId, "applications"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  const markViewed = useMutation({
    mutationFn: (applicationId: string) =>
      markViewedFn({ data: { applicationId, markViewed: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employer", employerId, "applications"] }),
    onError: () => setActionError(t("employer.applications.error.markViewed")),
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
    <SiteLayout>
      <EmployerWorkspaceChrome
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
                          {new Date(r.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                        {t(STATUS_LABEL_KEY[r.status])}
                      </span>
                    </div>
                    {r.coverNote && <p className="mt-3 text-sm text-foreground">{r.coverNote}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.status === "submitted" && (
                        <button
                          type="button"
                          disabled={markViewed.isPending}
                          onClick={() => markViewed.mutate(r.id)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                        >
                          {t("employer.applications.action.markViewed")}
                        </button>
                      )}
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
      </EmployerWorkspaceChrome>
    </SiteLayout>
  );
}
