// Employer Assessment Center — assessment details (foundation phase).
//
// Read-only view of one real, employer_visible Assessment Catalog entry.
// Assign/View results/Assessment analytics are shown as explicit "Coming
// soon" placeholders -- no candidate invitation, assignment, payment,
// result or analytics backend exists yet, so none of those actions are
// ever rendered as active or routed to.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EmployerWorkspaceChrome,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerWorkspaceChrome";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import {
  getEmployerAssessmentCatalogEntry,
  type EmployerAssessmentCatalogEntry,
} from "@/lib/job-intelligence/employer-assessment-catalog.functions";
import { formatDate } from "@/lib/job-intelligence/date-format";

// Same rationale as DESCRIPTION_KEY in the catalogue list route: an
// explicit per-id map, not a generic fallback, so a future catalog entry
// with no authored copy here renders nothing rather than borrowed text.
const DESCRIPTION_KEY: Record<string, TranslationKey> = {
  "security-guard-foundation": "employer.assessments.sgf.description",
};
const INTENDED_FOR_KEY: Record<string, TranslationKey> = {
  "security-guard-foundation": "employer.assessments.sgf.intendedFor",
};

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/$assessmentSlug",
)({
  ssr: false,
  component: EmployerAssessmentDetailsPage,
  errorComponent: EmployerErrorState,
});

function EmployerAssessmentDetailsPage() {
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
        <EmployerAccessDenied workspaces={workspacesQuery.data} />
      </SiteLayout>
    );
  }

  return (
    <AssessmentDetails
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    />
  );
}

function AssessmentDetails({
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
  const { assessmentSlug } = Route.useParams();
  const { t, lang } = useT();
  const getFn = useServerFn(getEmployerAssessmentCatalogEntry);

  const query = useQuery({
    queryKey: ["employer", employerId, "assessment-catalog", assessmentSlug],
    queryFn: () => getFn({ data: { employerId, assessmentId: assessmentSlug } }),
  });

  const entry: EmployerAssessmentCatalogEntry | null | undefined = query.data;

  return (
    <SiteLayout>
      <EmployerWorkspaceChrome
        employerSlug={employerSlug}
        employerName={employerName}
        role={role}
        status={status}
        activeSection="assessments"
        hasMultipleWorkspaces={hasMultipleWorkspaces}
      >
        <Link
          to="/employer/$employerSlug/assessments"
          params={{ employerSlug }}
          className="text-sm font-medium text-accent hover:underline"
        >
          ← {t("employer.assessments.details.back")}
        </Link>

        <div className="mt-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
          ) : query.isError ? (
            <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-6 text-sm">
              <p className="text-destructive">{t("employer.assessments.error.load")}</p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
              >
                {t("employer.assessments.error.retry")}
              </button>
            </div>
          ) : !entry ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("employer.assessments.details.notFound")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
                  {lang === "sv" ? entry.name.sv : entry.name.en}
                </h1>
                <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {t(
                    entry.publicationStatus === "published"
                      ? "employer.assessments.status.published"
                      : "employer.assessments.status.unpublished",
                  )}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  entry.roleCategory === "operational"
                    ? "employer.assessments.tab.operational"
                    : "employer.assessments.tab.strategic",
                )}
              </p>

              {DESCRIPTION_KEY[entry.id] && (
                <p className="mt-4 max-w-2xl text-sm text-foreground">
                  {t(DESCRIPTION_KEY[entry.id])}
                </p>
              )}

              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {INTENDED_FOR_KEY[entry.id] && (
                  <Field label={t("employer.assessments.details.intendedRoles")}>
                    <p className="text-sm text-foreground">{t(INTENDED_FOR_KEY[entry.id])}</p>
                  </Field>
                )}

                <Field label={t("employer.assessments.details.intendedUse")}>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                    <li>{t("employer.assessments.useCase.recruitment.title")}</li>
                    <li>{t("employer.assessments.useCase.development.title")}</li>
                  </ul>
                </Field>

                <Field label={t("employer.assessments.details.competencies")}>
                  {entry.competencies.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {entry.competencies.map((c, i) => (
                        <li
                          key={i}
                          className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
                        >
                          {lang === "sv" ? c.sv : c.en}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </Field>

                <Field label={t("employer.assessments.details.dimensions")}>
                  {entry.dimensions.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {entry.dimensions.map((d, i) => (
                        <li
                          key={i}
                          className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
                        >
                          {lang === "sv" ? d.sv : d.en}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </Field>

                <Field label={t("employer.assessments.details.questionCount")}>
                  <p className="text-sm text-foreground">{entry.questionCount}</p>
                </Field>

                <Field label={t("employer.assessments.details.duration")}>
                  <p className="text-sm text-foreground">~{entry.estimatedMinutes} min</p>
                </Field>

                <Field label={t("employer.assessments.details.languages")}>
                  <p className="text-sm text-foreground">
                    {entry.languages.map((l) => l.toUpperCase()).join(", ")}
                  </p>
                </Field>

                <Field label={t("employer.assessments.details.version")}>
                  <p className="text-sm text-foreground">{entry.version?.modelVersion ?? "—"}</p>
                </Field>

                <Field label={t("employer.assessments.details.status")}>
                  <p className="text-sm text-foreground">
                    {t(
                      entry.publicationStatus === "published"
                        ? "employer.assessments.status.published"
                        : "employer.assessments.status.unpublished",
                    )}
                  </p>
                </Field>

                {entry.lastUpdated && (
                  <Field label={t("employer.assessments.details.lastUpdated")}>
                    <p className="text-sm text-foreground">{formatDate(entry.lastUpdated, lang)}</p>
                  </Field>
                )}
              </div>

              <div className="mt-8 rounded-lg border border-border bg-muted/20 p-4 text-sm text-foreground">
                {t("employer.assessments.details.disclaimer")}
              </div>

              <div className="mt-8">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("employer.dashboard.actions.heading")}
                </h2>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <DisabledAction label={t("employer.assessments.action.assign")} />
                  <DisabledAction label={t("employer.assessments.action.viewResults")} />
                  <DisabledAction label={t("employer.assessments.action.analytics")} />
                </div>
              </div>
            </>
          )}
        </div>
      </EmployerWorkspaceChrome>
    </SiteLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function DisabledAction({ label }: { label: string }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <span className="mt-2 inline-flex rounded-md border border-dashed border-border px-2 py-1 text-xs font-medium text-muted-foreground">
        {t("employer.comingSoonShort")}
      </span>
    </div>
  );
}
