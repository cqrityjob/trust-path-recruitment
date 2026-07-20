// Shared "Åtkomst ej tillgänglig" state for every /employer/$employerSlug/*
// route. Previously each route hand-rolled its own copy of this block;
// only the dashboard route included a link back to "Min karriär" and none
// included a link to a workspace the user actually does have access to.
// Consolidated into one component so every route behaves identically.
//
// Security: this component never reveals whether the attempted slug
// belongs to a real employer, another organisation's name, or any
// membership detail beyond the caller's own already-authorised
// workspaces (workspaces is exactly the caller's own fresh
// listMyEmployerWorkspaces() result, never fetched or filtered here).
// The heading/body text is intentionally identical whether the slug is
// invalid, belongs to another employer, or the caller has no membership
// at all -- distinguishing those cases would itself leak information.

import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";

export function EmployerAccessDenied({
  workspaces,
}: {
  workspaces?: ReadonlyArray<{ employerSlug: string }>;
}) {
  const { t } = useT();
  const firstWorkspace = workspaces?.[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-foreground">
        {t("employer.accessDenied.heading")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("employer.accessDenied.body")}</p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
          {t("sca.report.backToMyCareer")}
        </Link>
        {firstWorkspace && (
          <Link
            to="/employer/$employerSlug"
            params={{ employerSlug: firstWorkspace.employerSlug }}
            className="text-sm font-medium text-accent hover:underline"
          >
            {t("employer.accessDenied.goToWorkspace")}
          </Link>
        )}
      </div>
    </div>
  );
}
