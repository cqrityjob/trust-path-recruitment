// Phase G2 — /employer/$employerSlug: the minimal per-organisation
// shell. The route param is a lookup key only, never a credential — it
// is located exclusively within the caller's own fresh, RLS-scoped
// listMyEmployerWorkspaces() result (same function and same query key
// as the index route, so React Query's cache is naturally shared and a
// picker->shell navigation doesn't refetch unnecessarily).
//
// Every one of these produces the exact same neutral "access not
// available" state, by construction, because none of them appear in an
// active-membership-only result: an invalid slug, another employer's
// slug, a suspended membership, a removed membership, and a stale
// localStorage selection. This route never distinguishes them in the
// UI — doing so would reveal whether an inaccessible organisation
// exists at all.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { LAST_EMPLOYER_SLUG_KEY } from "@/lib/job-intelligence/last-employer-slug";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug")({
  ssr: false,
  component: EmployerWorkspacePage,
});

function EmployerWorkspacePage() {
  if (!employerPortalEnabled()) {
    return <EmployerComingSoon />;
  }
  return <EmployerWorkspaceShell />;
}

function EmployerComingSoon() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section containerClassName="max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
        <div className="mt-6">
          <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
            {t("sca.report.backToMyCareer")}
          </Link>
        </div>
      </Section>
    </SiteLayout>
  );
}

function EmployerWorkspaceShell() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);

  // Same queryKey as the index route -- shares its cache, and this
  // route's own load re-validates independently regardless of how the
  // caller arrived here (picker click, direct URL, stale bookmark).
  const query = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
  });

  const workspaces = query.data ?? [];
  const workspace = workspaces.find((w) => w.employerSlug === employerSlug);

  useEffect(() => {
    if (!workspace) return;
    try {
      window.localStorage.setItem(LAST_EMPLOYER_SLUG_KEY, workspace.employerSlug);
    } catch {
      /* ignore -- pure UX convenience, never required */
    }
  }, [workspace]);

  // Loading state shown before any access decision is made -- never a
  // flash of denied/shell content while the RLS-scoped list is in flight.
  if (query.isLoading) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }

  if (query.isError || !workspace) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employer.accessDenied.heading")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.accessDenied.body")}</p>
          <div className="mt-6">
            <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
              {t("sca.report.backToMyCareer")}
            </Link>
          </div>
        </Section>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <Section containerClassName="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("employer.workspace.label")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{workspace.employerName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("employer.shell.roleLabel")}:{" "}
          <span className="font-medium text-foreground">
            {t(`employer.role.${workspace.role}`)}
          </span>
        </p>

        <div className="mt-6 rounded-md border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">{t("employer.shell.comingSoonNotice")}</p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          {workspaces.length > 1 && (
            <Link to="/employer" className="text-sm font-medium text-accent hover:underline">
              {t("employer.switchOrg")}
            </Link>
          )}
          <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
            {t("sca.report.backToMyCareer")}
          </Link>
        </div>
      </Section>
    </SiteLayout>
  );
}
