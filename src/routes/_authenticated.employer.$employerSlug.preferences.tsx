// Employer OS Phase 1 — Settings module (controlled future state).
//
// "Organisation" (company profile, sites-of-record, moderation status)
// already has a meaningful, working destination — the existing
// /employer/$employerSlug/settings route (Phase H3.2) — and is mapped to
// its own "Organisation" nav item, unchanged. This route is the distinct
// new "Settings" module from the Employer OS information architecture:
// account-level preferences, billing, notifications, integrations. None
// of that exists yet, so this is a controlled future state rather than a
// duplicate of the Organisation page.

import { createFileRoute } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerModuleComingSoon } from "@/components/employer/EmployerModuleComingSoon";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/preferences")({
  ssr: false,
  component: EmployerPreferencesPage,
  errorComponent: EmployerErrorState,
});

function EmployerPreferencesPage() {
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
      activeSection="settings"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <EmployerModuleComingSoon
        icon={<Settings2 className="h-5 w-5" aria-hidden="true" />}
        title={t("employer.preferences.heading")}
        purpose={t("employer.preferences.purpose")}
        value={t("employer.preferences.value")}
        milestone={t("employer.preferences.milestone")}
      />
    </EmployerAppShell>
  );
}
