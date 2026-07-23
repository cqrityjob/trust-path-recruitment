// Employer OS Phase 1 — Competencies & Certificates module (controlled
// future state). No competency-framework or certificate-tracking backend
// exists yet; this page states the module's real intent rather than
// simulating data.

import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerModuleComingSoon } from "@/components/employer/EmployerModuleComingSoon";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/competencies")({
  ssr: false,
  component: EmployerCompetenciesPage,
  errorComponent: EmployerErrorState,
});

function EmployerCompetenciesPage() {
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

  return (
    <EmployerAppShell
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      activeSection="competencies"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <EmployerModuleComingSoon
        icon={<BadgeCheck className="h-5 w-5" aria-hidden="true" />}
        title={t("employer.competencies.heading")}
        purpose={t("employer.competencies.purpose")}
        value={t("employer.competencies.value")}
        milestone={t("employer.competencies.milestone")}
      />
    </EmployerAppShell>
  );
}
