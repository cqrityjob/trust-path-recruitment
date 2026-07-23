// Employer Assessment Center — catalogue foundation. Lists only real,
// employer_visible Assessment Catalog rows (see listEmployerAssessmentCatalog
// in employer-assessment-catalog.functions.ts) split into the two primary
// employer-facing categories, Operational roles and Strategic roles. No
// invitation, assignment, payment, training or analytics workflow lives
// here — those are explicitly out of scope for this phase.
//
// Follows the exact same access-resolution pattern as every other
// /employer/$employerSlug/* route: the slug is a lookup key only,
// re-verified independently via listMyEmployerWorkspaces() on every load.

import { useState } from "react";
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
  listEmployerAssessmentCatalog,
  type EmployerAssessmentCatalogEntry,
  type EmployerAssessmentRoleCategory,
} from "@/lib/job-intelligence/employer-assessment-catalog.functions";

// Per-assessment-id description copy. Deliberately a small explicit map,
// not a generic fallback string -- an Assessment Definition with no entry
// here simply renders no description rather than showing borrowed or
// invented copy for content that doesn't exist yet (see "Important
// content rule" in the Assessment Center spec).
const DESCRIPTION_KEY: Record<string, TranslationKey> = {
  "security-guard-foundation": "employer.assessments.sgf.description",
};

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/")({
  ssr: false,
  component: EmployerAssessmentsPage,
  errorComponent: EmployerErrorState,
});

function EmployerAssessmentsPage() {
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
    <AssessmentCatalog
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    />
  );
}

function AssessmentCatalog({
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
  const [category, setCategory] = useState<EmployerAssessmentRoleCategory>("operational");
  const listFn = useServerFn(listEmployerAssessmentCatalog);

  const query = useQuery({
    queryKey: ["employer", employerId, "assessment-catalog"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  const entries: EmployerAssessmentCatalogEntry[] = query.data ?? [];
  const visible = entries.filter((e) => e.roleCategory === category);

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
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("employer.assessments.heading")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t("employer.assessments.subheading")}
        </p>

        {/* Use-case explanation */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">
              {t("employer.assessments.useCase.recruitment.title")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("employer.assessments.useCase.recruitment.body")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">
              {t("employer.assessments.useCase.development.title")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("employer.assessments.useCase.development.body")}
            </p>
          </div>
        </div>

        {/* Primary category navigation */}
        <div
          className="mt-8 inline-flex rounded-lg border border-border bg-muted/20 p-1"
          role="tablist"
          aria-label={t("employer.assessments.categoryNav.ariaLabel")}
        >
          {(["operational", "strategic"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={
                category === c
                  ? "rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm"
                  : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {t(
                c === "operational"
                  ? "employer.assessments.tab.operational"
                  : "employer.assessments.tab.strategic",
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
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
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {category === "strategic"
                ? t("employer.assessments.strategic.empty")
                : t("employer.assessments.operational.empty")}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visible.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border bg-background p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-foreground">
                      {lang === "sv" ? entry.name.sv : entry.name.en}
                    </h2>
                    <span className="inline-flex flex-none rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t(
                        entry.publicationStatus === "published"
                          ? "employer.assessments.status.published"
                          : "employer.assessments.status.unpublished",
                      )}
                    </span>
                  </div>
                  {DESCRIPTION_KEY[entry.id] && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t(DESCRIPTION_KEY[entry.id])}
                    </p>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">
                        {t("employer.assessments.card.questionCount")}
                      </dt>
                      <dd className="font-medium text-foreground">{entry.questionCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("employer.assessments.card.duration")}
                      </dt>
                      <dd className="font-medium text-foreground">~{entry.estimatedMinutes} min</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("employer.assessments.card.roleCategory")}
                      </dt>
                      <dd className="font-medium text-foreground">
                        {t(
                          entry.roleCategory === "operational"
                            ? "employer.assessments.tab.operational"
                            : "employer.assessments.tab.strategic",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("employer.assessments.card.version")}
                      </dt>
                      <dd className="font-medium text-foreground">
                        {entry.version?.modelVersion ?? "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <Link
                      to="/employer/$employerSlug/assessments/$assessmentSlug"
                      params={{ employerSlug, assessmentSlug: entry.id }}
                      className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:bg-muted/40"
                    >
                      {t("employer.assessments.card.viewDetails")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </EmployerWorkspaceChrome>
    </SiteLayout>
  );
}
