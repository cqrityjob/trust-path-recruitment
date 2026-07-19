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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  getEmployerDashboardStats,
  type EmployerDashboardStats,
} from "@/lib/job-intelligence/employer-dashboard.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { LAST_EMPLOYER_SLUG_KEY } from "@/lib/job-intelligence/last-employer-slug";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/")({
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
    <EmployerDashboard
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      showSwitcher={workspaces.length > 1}
    />
  );
}

function EmployerDashboard({
  employerId,
  employerSlug,
  employerName,
  role,
  showSwitcher,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: "owner" | "admin" | "member";
  showSwitcher: boolean;
}) {
  const { t } = useT();
  const loadStats = useServerFn(getEmployerDashboardStats);
  const stats = useQuery({
    queryKey: ["employer", employerId, "dashboard-stats"],
    queryFn: () => loadStats({ data: { employerId } }),
  });

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const data: EmployerDashboardStats = stats.data ?? {
    activeJobs: 0,
    draftJobs: 0,
    applications: 0,
    assessmentInvitations: 0,
  };

  const noJobsYet =
    stats.isSuccess && data.activeJobs === 0 && data.draftJobs === 0 && data.applications === 0;

  const cards: Array<{ key: string; label: string; value: number }> = [
    { key: "activeJobs", label: t("employer.dashboard.card.activeJobs"), value: data.activeJobs },
    { key: "draftJobs", label: t("employer.dashboard.card.draftJobs"), value: data.draftJobs },
    {
      key: "applications",
      label: t("employer.dashboard.card.applications"),
      value: data.applications,
    },
    {
      key: "assessmentInvitations",
      label: t("employer.dashboard.card.assessmentInvitations"),
      value: data.assessmentInvitations,
    },
  ];

  type Action =
    | { key: string; label: string; kind: "link"; to: "/employer/$employerSlug/jobs" | "/employer/$employerSlug/jobs/new" }
    | { key: string; label: string; kind: "coming-next" };
  const actions: Array<Action> = [
    {
      key: "createJob",
      label: t("employer.dashboard.action.createJob"),
      kind: "link",
      to: "/employer/$employerSlug/jobs/new",
    },
    {
      key: "manageJobs",
      label: t("employer.dashboard.action.manageJobs"),
      kind: "link",
      to: "/employer/$employerSlug/jobs",
    },
    {
      key: "inviteAssessment",
      label: t("employer.dashboard.action.inviteAssessment"),
      kind: "coming-next",
    },
    {
      key: "orgSettings",
      label: t("employer.dashboard.action.orgSettings"),
      kind: "coming-next",
    },
  ];

  return (
    <SiteLayout>
      <Section containerClassName="max-w-5xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("employer.workspace.label")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
              {employerName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("employer.shell.roleLabel")}:{" "}
              <span className="font-medium text-foreground">{t(`employer.role.${role}`)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {showSwitcher && (
              <Link to="/employer" className="font-medium text-accent hover:underline">
                {t("employer.switchOrg")}
              </Link>
            )}
            <Link to="/my-career" className="font-medium text-accent hover:underline">
              {t("sca.report.backToMyCareer")}
            </Link>
          </div>
        </div>

        {/* Overview cards */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-border bg-background p-4 sm:p-5"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {c.label}
              </p>
              <p
                className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl"
                aria-live="polite"
              >
                {stats.isLoading ? "—" : c.value}
              </p>
            </div>
          ))}
        </div>
        {stats.isError && (
          <p className="mt-3 text-sm text-destructive">{t("employer.dashboard.statsError")}</p>
        )}

        {/* Primary actions */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">
            {t("employer.dashboard.actions.heading")}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {actions.map((a) => {
              const active = pendingAction === a.key;
              return (
                <div
                  key={a.key}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{a.label}</span>
                    {a.kind === "link" ? (
                      <Link
                        to={a.to}
                        params={{ employerSlug }}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {t("employer.dashboard.action.open")}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingAction(active ? null : a.key)}
                        aria-expanded={active}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {active
                          ? t("employer.dashboard.action.hideInfo")
                          : t("employer.dashboard.action.open")}
                      </button>
                    )}
                  </div>
                  {a.kind === "coming-next" && active && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("employer.dashboard.comingNext")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* First-time empty state guidance */}
        {noJobsYet && (
          <div className="mt-10 rounded-lg border border-dashed border-border bg-muted/30 p-5">
            <h2 className="text-base font-semibold text-foreground">
              {t("employer.dashboard.empty.heading")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("employer.dashboard.empty.body")}
            </p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("employer.dashboard.empty.step1")}</li>
              <li>{t("employer.dashboard.empty.step2")}</li>
              <li>{t("employer.dashboard.empty.step3")}</li>
            </ol>
          </div>
        )}
      </Section>
    </SiteLayout>
  );
}
