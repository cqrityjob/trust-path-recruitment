// Employer OS Phase 1 — Sites & Risk module (controlled future state).
//
// Scope decision: Employee Directory (Workforce module) was prioritised
// this phase over a full Sites CRUD surface, per the product brief's own
// explicit trade-off clause. Sites & Risk is one of the modules the brief
// itself buckets as "foundation or controlled future state" rather than
// "fully working in this phase" (alongside Competencies, Training,
// Reports, Analytics). No sites table exists yet; the Workforce module's
// employees.site_name is a plain optional text field today, forward-
// compatible with a future sites table (a later migration can backfill a
// site_id FK against these values without any data loss).

import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerModuleComingSoon } from "@/components/employer/EmployerModuleComingSoon";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/sites")({
  ssr: false,
  component: EmployerSitesPage,
  errorComponent: EmployerErrorState,
});

function EmployerSitesPage() {
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
      activeSection="sites"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <EmployerModuleComingSoon
        icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
        title={t("employer.sites.heading")}
        purpose={t("employer.sites.purpose")}
        value={t("employer.sites.value")}
        milestone={t("employer.sites.milestone")}
      />
    </EmployerAppShell>
  );
}
