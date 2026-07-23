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
import { useEffect, type ReactNode } from "react";
import {
  ArrowRight,
  Briefcase,
  Building2,
  ClipboardList,
  FileText,
  GraduationCap,
  Inbox,
  PlusCircle,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
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
        {/* Hero: primary CTA + one-line summary of what the workspace is */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("employer.dashboard.hero.summary")}
            </p>
          </div>
          <Link
            to={`/employer/${employerSlug}/jobs/new`}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            {t("employer.dashboard.primaryCta")}
          </Link>
        </div>

        {/* Overview stats — icon + value + label; Applications is the primary,
            clickable card. Assessment invitations is a passive coming-soon
            tile styled to match visually but clearly non-actionable. */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Briefcase className="h-4 w-4" />}
            label={t("employer.dashboard.card.activeJobs")}
            value={data.activeJobs}
            loading={stats.isLoading}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label={t("employer.dashboard.card.draftJobs")}
            value={data.draftJobs}
            loading={stats.isLoading}
          />
          <StatCard
            icon={<Inbox className="h-4 w-4" />}
            label={t("employer.dashboard.card.applications")}
            value={data.applications}
            loading={stats.isLoading}
            href={`/employer/${employerSlug}/applications`}
            emphasis
          />
          <ComingSoonStat
            icon={<GraduationCap className="h-4 w-4" />}
            label={t("employer.dashboard.card.assessmentInvitations")}
            badge={t("employer.comingSoonShort")}
          />
        </div>
        {stats.isError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {t("employer.dashboard.statsError")}
          </p>
        )}

        {/* First-time empty state guidance — surfaces before the actions
            so a brand-new employer sees the "what happens next" narrative
            first, then the action groups below carry them through it. */}
        {noJobsYet && (
          <EmptyStateCard
            title={t("employer.dashboard.empty.heading")}
            body={t("employer.dashboard.empty.body")}
            steps={[
              t("employer.dashboard.empty.step1"),
              t("employer.dashboard.empty.step2"),
              t("employer.dashboard.empty.step3"),
            ]}
            ctaLabel={t("employer.dashboard.empty.cta")}
            ctaHref={`/employer/${employerSlug}/jobs/new`}
          />
        )}

        {/* Grouped quick actions: Recruitment | Organisation | Assessment
            Center. Each group has its own heading + description so a first-
            time employer immediately reads the workspace as three coherent
            areas of the product rather than a flat list of buttons. */}
        <div className="mt-10 space-y-8">
          <ActionGroup
            icon={<Briefcase className="h-4 w-4" />}
            title={t("employer.dashboard.section.recruitment")}
            description={t("employer.dashboard.section.recruitment.desc")}
          >
            <ActionCard
              icon={<PlusCircle className="h-5 w-5" />}
              title={t("employer.dashboard.action.createJob")}
              description={t("employer.dashboard.action.createJob.desc")}
              href={`/employer/${employerSlug}/jobs/new`}
              openLabel={t("employer.dashboard.action.open")}
            />
            <ActionCard
              icon={<ClipboardList className="h-5 w-5" />}
              title={t("employer.dashboard.action.manageJobs")}
              description={t("employer.dashboard.action.manageJobs.desc")}
              href={`/employer/${employerSlug}/jobs`}
              openLabel={t("employer.dashboard.action.open")}
            />
            <ActionCard
              icon={<Users className="h-5 w-5" />}
              title={t("employer.dashboard.action.applications")}
              description={t("employer.dashboard.action.applications.desc")}
              href={`/employer/${employerSlug}/applications`}
              openLabel={t("employer.dashboard.action.open")}
            />
          </ActionGroup>

          <ActionGroup
            icon={<Building2 className="h-4 w-4" />}
            title={t("employer.dashboard.section.company")}
            description={t("employer.dashboard.section.company.desc")}
          >
            <ActionCard
              icon={<Settings2 className="h-5 w-5" />}
              title={t("employer.dashboard.action.orgSettings")}
              description={t("employer.dashboard.action.orgSettings.desc")}
              href={`/employer/${employerSlug}/settings`}
              openLabel={t("employer.dashboard.action.open")}
            />
          </ActionGroup>

          <ActionGroup
            icon={<Sparkles className="h-4 w-4" />}
            title={t("employer.dashboard.section.assessment")}
            description={t("employer.dashboard.section.assessment.desc")}
          >
            <AssessmentCenterCard
              title={t("employer.dashboard.assessmentCenter.heading")}
              body={t("employer.dashboard.assessmentCenter.body")}
              badge={t("employer.dashboard.assessmentCenter.badge")}
              inviteLabelKey={"employer.dashboard.action.inviteAssessment"}
            />
          </ActionGroup>
        </div>
      </EmployerWorkspaceChrome>
    </SiteLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  href,
  emphasis,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  loading: boolean;
  href?: string;
  emphasis?: boolean;
}) {
  const content = (
    <div
      className={
        "group h-full rounded-xl border border-border bg-background p-4 shadow-sm transition-all sm:p-5 " +
        (href
          ? "hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md focus-within:border-accent"
          : "")
      }
    >
      <div className="flex items-center justify-between">
        <span
          className={
            "inline-flex h-8 w-8 items-center justify-center rounded-md " +
            (emphasis
              ? "bg-accent/10 text-accent"
              : "bg-muted text-muted-foreground")
          }
          aria-hidden="true"
        >
          {icon}
        </span>
        {href && (
          <ArrowRight
            className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        aria-live="polite"
      >
        {loading ? "—" : value.toLocaleString()}
      </p>
    </div>
  );
  if (href) {
    return (
      <Link
        to={href}
        aria-label={`${label}: ${loading ? "—" : value}`}
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }
  return content;
}

function ComingSoonStat({
  icon,
  label,
  badge,
}: {
  icon: ReactNode;
  label: string;
  badge: string;
}) {
  return (
    <div className="h-full rounded-xl border border-dashed border-border bg-muted/20 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {badge}
        </span>
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-muted-foreground/70 sm:text-4xl">
        —
      </p>
    </div>
  );
}

function ActionGroup({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function ActionCard({
  icon,
  title,
  description,
  href,
  openLabel,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  openLabel: string;
}) {
  return (
    <Link
      to={href}
      aria-label={title}
      className="group flex h-full flex-col rounded-xl border border-border bg-background p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent"
          aria-hidden="true"
        >
          {icon}
        </span>
        <ArrowRight
          className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground"
          aria-hidden="true"
        />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <span
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent"
        aria-hidden="true"
      >
        {openLabel}
        <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

function AssessmentCenterCard({
  title,
  body,
  badge,
  inviteLabelKey,
}: {
  title: string;
  body: string;
  badge: string;
  inviteLabelKey: TranslationKey;
}) {
  const { t } = useT();
  return (
    <div className="col-span-1 rounded-xl border border-border bg-gradient-to-br from-muted/40 to-background p-6 shadow-sm sm:col-span-2 lg:col-span-3">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
            aria-hidden="true"
          >
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
                {badge}
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex h-10 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-4 text-sm font-medium text-muted-foreground"
        >
          {t(inviteLabelKey)}
        </button>
      </div>
    </div>
  );
}

function EmptyStateCard({
  title,
  body,
  steps,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  body: string;
  steps: string[];
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="mt-8 rounded-xl border border-border bg-gradient-to-br from-accent/5 via-background to-background p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-background p-3 text-sm text-foreground"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>
        <Link
          to={ctaHref}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
