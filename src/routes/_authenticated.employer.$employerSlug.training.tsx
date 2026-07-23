// Employer OS Phase 1 — Training module (controlled future state).

import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerModuleComingSoon } from "@/components/employer/EmployerModuleComingSoon";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/training")({
  ssr: false,
  component: EmployerTrainingPage,
  errorComponent: EmployerErrorState,
});

function EmployerTrainingPage() {
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
      activeSection="training"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <EmployerModuleComingSoon
        icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
        title={t("employer.training.heading")}
        purpose={t("employer.training.purpose")}
        value={t("employer.training.value")}
        milestone={t("employer.training.milestone")}
      />
    </EmployerAppShell>
  );
}
