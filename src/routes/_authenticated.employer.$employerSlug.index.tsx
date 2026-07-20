// Phase G2/G3, updated H3.2 — /employer/$employerSlug: the per-organisation
// dashboard ("Overview"). The route param is a lookup key only, never a
// credential — it is located exclusively within the caller's own fresh,
// RLS-scoped listMyEmployerWorkspaces() result (same function and same
// query key as the index route, so React Query's cache is naturally
// shared and a picker->shell navigation doesn't refetch unnecessarily).
//
// Every one of these produces the exact same neutral "access not
// available" state, by construction, because none of them appear in an
// active-membership-only result: an invalid slug, another employer's
// slug, a suspended membership, a removed membership, and a stale
// localStorage selection. This route never distinguishes them in the
// UI — doing so would reveal whether an inaccessible organisation
// exists at all.
//
// H3.2: now wraps its content in the shared EmployerWorkspaceChrome
// (navigation + status badge + account menu), and the "assessment
// invitations" stat/quick-action is explicitly marked "coming soon"
// rather than presented as a real 0 count or a working action — no
// assessment-invitation backend exists anywhere in this schema
// (confirmed by repository audit). "Organisation settings" is now a real
// link (H3.2 built that route + its RLS foundation); "Create job"/
// "Manage jobs" were already real.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import {
  EmployerWorkspaceChrome,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerWorkspaceChrome";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
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
  errorComponent: EmployerErrorState,
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
        <EmployerAccessDenied workspaces={workspaces} />
      </SiteLayout>
    );
  }

  return (
    <EmployerDashboard
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={workspaces.length > 1}
    />
  );
}

function EmployerDashboard({
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
  const { t } = useT();
  const loadStats = useServerFn(getEmployerDashboardStats);
  const stats = useQuery({
    queryKey: ["employer", employerId, "dashboard-stats"],
    queryFn: () => loadStats({ data: { employerId } }),
  });

  const data: EmployerDashboardStats = stats.data ?? {
    activeJobs: 0,
    draftJobs: 0,
    applications: 0,
    assessmentInvitations: 0,
  };

  const noJobsYet =
    stats.isSuccess && data.activeJobs === 0 && data.draftJobs === 0 && data.applications === 0;

  return (
    <SiteLayout>
      <EmployerWorkspaceChrome
        employerSlug={employerSlug}
        employerName={employerName}
        role={role}
        status={status}
        activeSection="overview"
        hasMultipleWorkspaces={hasMultipleWorkspaces}
      >
        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label={t("employer.dashboard.card.activeJobs")}
            value={data.activeJobs}
            loading={stats.isLoading}
          />
          <StatCard
            label={t("employer.dashboard.card.draftJobs")}
            value={data.draftJobs}
            loading={stats.isLoading}
          />
          <StatCard
            label={t("employer.dashboard.card.applications")}
            value={data.applications}
            loading={stats.isLoading}
            href={`/employer/${employerSlug}/applications`}
          />
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("employer.dashboard.card.assessmentInvitations")}
            </p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {t("employer.comingSoonShort")}
            </p>
          </div>
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
            <QuickAction
              label={t("employer.dashboard.action.createJob")}
              href={`/employer/${employerSlug}/jobs/new`}
            />
            <QuickAction
              label={t("employer.dashboard.action.manageJobs")}
              href={`/employer/${employerSlug}/jobs`}
            />
            <QuickAction
              label={t("employer.dashboard.action.orgSettings")}
              href={`/employer/${employerSlug}/settings`}
            />
            <QuickAction
              label={t("employer.dashboard.action.inviteAssessment")}
              disabledReason={t("employer.comingSoonShort")}
            />
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
      </EmployerWorkspaceChrome>
    </SiteLayout>
  );
}

function StatCard({
  label,
  value,
  loading,
  href,
}: {
  label: string;
  value: number;
  loading: boolean;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-border bg-background p-4 transition-colors hover:border-accent/50 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl" aria-live="polite">
        {loading ? "—" : value}
      </p>
    </div>
  );
  if (href) {
    return (
      <Link to={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function QuickAction({
  label,
  href,
  disabledReason,
}: {
  label: string;
  href?: string;
  disabledReason?: string;
}) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {href ? (
          <Link
            to={href}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("employer.dashboard.action.open")}
          </Link>
        ) : (
          <span className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {t("employer.comingSoonShort")}
          </span>
        )}
      </div>
      {disabledReason && !href && (
        <p className="mt-3 text-xs text-muted-foreground">{disabledReason}</p>
      )}
    </div>
  );
}
