// Employer OS Phase 1 — Ask CQrity foundation.
//
// No generative AI assistant exists yet. Rather than simulate one with
// invented insights, this page offers a small, fixed set of deterministic
// shortcuts — each one a real, working link to an existing, real
// destination (Applications, Assessment Center, Workforce, Job postings).
// Nothing here is generated, ranked, or scored; it is plain navigation,
// clearly labelled as a foundation for the future assistant described in
// the product vision, not the assistant itself.

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/ask-cqrity")({
  ssr: false,
  component: EmployerAskCqrityPage,
  errorComponent: EmployerErrorState,
});

function EmployerAskCqrityPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const ws = useEmployerWorkspace(employerSlug);

  if (!ws.portalEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }
  if (ws.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }
  if (ws.isError || !ws.workspace) {
    return <EmployerAccessDenied workspaces={ws.workspaces} />;
  }

  const employerSlugValue = ws.workspace.employerSlug;

  const shortcuts: Array<{
    labelKey: TranslationKey;
    to:
      | "/employer/$employerSlug/applications"
      | "/employer/$employerSlug/assessments"
      | "/employer/$employerSlug/workforce"
      | "/employer/$employerSlug/jobs";
  }> = [
    {
      labelKey: "employer.askCqrity.query.applications",
      to: "/employer/$employerSlug/applications",
    },
    { labelKey: "employer.askCqrity.query.assessments", to: "/employer/$employerSlug/assessments" },
    {
      labelKey: "employer.askCqrity.query.employeesWithoutRole",
      to: "/employer/$employerSlug/workforce",
    },
    { labelKey: "employer.askCqrity.query.draftJobs", to: "/employer/$employerSlug/jobs" },
  ];

  return (
    <EmployerAppShell
      employerSlug={employerSlugValue}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      activeSection="ask-cqrity"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      {/* ── SHORTCUTS, AND NOTHING THAT LOOKS LIKE AN ANSWER ─────────────
          The route keeps its old name; the page is what it has always done:
          four links to existing pages (MVP text specification §11.2). No
          chat field, no AI icon or animation, and no label that reads as a
          question that has been analysed or a filter that is not applied. */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {t("employer.askCqrity.heading")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("employer.askCqrity.body")}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shortcuts.map((s) => (
          <Link
            key={s.labelKey}
            to={s.to}
            params={{ employerSlug: employerSlugValue }}
            className="group flex items-center justify-between rounded-xl border border-border bg-background p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md"
          >
            <span className="text-sm font-medium text-foreground">{t(s.labelKey)}</span>
            <ArrowRight
              className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </EmployerAppShell>
  );
}
