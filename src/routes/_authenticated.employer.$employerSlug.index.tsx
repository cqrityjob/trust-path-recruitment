// Employer OS Phase 1 — Command Center.
//
// Replaces the previous job-board-shaped "Overview" (stat cards + quick
// actions) with the real Command Center described in the product vision:
// what needs attention, what changed, recruitment performance, assessment
// activity, and the foundations of workforce/sites/AI — all built from
// data that genuinely exists today. Nothing here is a placeholder metric:
// every number is either a direct read (dashboard stats, jobs,
// applications, assessment catalog, workforce summary) or an explicit,
// labelled "not yet available" state.
//
// Access-resolution pattern unchanged from every other
// /employer/$employerSlug/* route: the slug is a lookup key only,
// re-verified independently via listMyEmployerWorkspaces() on every load.

import { createFileRoute, Link, type LinkComponentProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  Info,
  MapPin,
  PlusCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  getEmployerDashboardStats,
  type EmployerDashboardStats,
} from "@/lib/job-intelligence/employer-dashboard.functions";
import { getEmployerOrganisation } from "@/lib/job-intelligence/employer-settings.functions";
import {
  listEmployerJobs,
  type EmployerJobRow,
} from "@/lib/job-intelligence/employer-jobs.functions";
import {
  listApplicationsForEmployer,
  type EmployerApplicationRow,
} from "@/lib/job-intelligence/applications.functions";
import {
  listEmployerAssessmentCatalog,
  type EmployerAssessmentCatalogEntry,
} from "@/lib/job-intelligence/employer-assessment-catalog.functions";
import { getEmployerWorkforceSummary } from "@/lib/job-intelligence/employer-workforce.functions";
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
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-foreground">{t("employer.comingSoon.heading")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      <div className="mt-6">
        <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
          {t("sca.report.backToMyCareer")}
        </Link>
      </div>
    </div>
  );
}

function EmployerWorkspaceShell() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);

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

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (query.isError || !workspace) {
    return <EmployerAccessDenied workspaces={workspaces} />;
  }

  return (
    <CommandCenter
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={workspaces.length > 1}
    />
  );
}

type Severity = "critical" | "attention" | "opportunity" | "ready";

type AttentionItem = {
  key: string;
  severity: Severity;
  text: string;
  count?: number;
  sourceLabel: string;
  linkProps: LinkComponentProps;
  actionLabel: string;
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  attention: 1,
  opportunity: 2,
  ready: 3,
};

const SEVERITY_STYLE: Record<Severity, { badge: string; icon: ReactNode }> = {
  critical: {
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  attention: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: <Info className="h-3.5 w-3.5" />,
  },
  opportunity: {
    badge: "border-accent/30 bg-accent/10 text-accent",
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  ready: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
};

function CommandCenter({
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
  const { t, lang } = useT();

  const loadStats = useServerFn(getEmployerDashboardStats);
  const loadOrg = useServerFn(getEmployerOrganisation);
  const loadJobs = useServerFn(listEmployerJobs);
  const loadApplications = useServerFn(listApplicationsForEmployer);
  const loadCatalog = useServerFn(listEmployerAssessmentCatalog);
  const loadWorkforce = useServerFn(getEmployerWorkforceSummary);

  const stats = useQuery({
    queryKey: ["employer", employerId, "dashboard-stats"],
    queryFn: () => loadStats({ data: { employerId } }),
  });
  const org = useQuery({
    queryKey: ["employer", employerId, "settings"],
    queryFn: () => loadOrg({ data: { employerId } }),
  });
  const jobsQuery = useQuery({
    queryKey: ["employer", employerId, "jobs"],
    queryFn: () => loadJobs({ data: { employerId } }),
  });
  const applicationsQuery = useQuery({
    queryKey: ["employer", employerId, "applications"],
    queryFn: () => loadApplications({ data: { employerId } }),
  });
  const catalogQuery = useQuery({
    queryKey: ["employer", employerId, "assessment-catalog"],
    queryFn: () => loadCatalog({ data: { employerId } }),
  });
  const workforceQuery = useQuery({
    queryKey: ["employer", employerId, "workforce-summary"],
    queryFn: () => loadWorkforce({ data: { employerId } }),
  });

  const data: EmployerDashboardStats = stats.data ?? {
    activeJobs: 0,
    draftJobs: 0,
    applications: 0,
    assessmentInvitations: 0,
  };

  const jobs: EmployerJobRow[] = jobsQuery.data ?? [];
  const applications: EmployerApplicationRow[] = applicationsQuery.data ?? [];
  const catalog: EmployerAssessmentCatalogEntry[] = catalogQuery.data ?? [];
  const operationalCount = catalog.filter((c) => c.roleCategory === "operational").length;
  const strategicCount = catalog.filter((c) => c.roleCategory === "strategic").length;
  const sgf = catalog.find((c) => c.id === "security-guard-foundation");

  const awaitingReviewCount = applications.filter((a) => a.status === "submitted").length;
  const publishedJobIds = new Set(jobs.filter((j) => j.status === "published").map((j) => j.id));
  const jobIdsWithApplications = new Set(applications.map((a) => a.jobId));
  const publishedNoApplications = [...publishedJobIds].filter(
    (id) => !jobIdsWithApplications.has(id),
  ).length;

  const orgIncomplete =
    org.isSuccess && !org.data.website && !org.data.descriptionSv && !org.data.descriptionEn;

  const workforce = workforceQuery.data ?? {
    activeEmployees: 0,
    rolesRepresented: 0,
    sitesRepresented: 0,
  };

  // ---- Needs your attention: built only from signals that genuinely
  // exist today. Severity "critical" is reserved for an actually blocking
  // organisation state -- suspended or rejected -- never inflated.
  const items: AttentionItem[] = [];

  if (status === "suspended" || status === "rejected") {
    items.push({
      key: "org-blocked",
      severity: "critical",
      text: t(
        status === "suspended"
          ? "employer.attention.orgSuspended"
          : "employer.attention.orgRejected",
      ),
      sourceLabel: t("employer.attention.source.organisation"),
      linkProps: { to: "/employer/$employerSlug/settings", params: { employerSlug } },
      actionLabel: t("employer.attention.action.viewOrganisation"),
    });
  } else if (status === "pending" || status === "draft") {
    items.push({
      key: "org-pending",
      severity: "attention",
      text: t("employer.attention.orgPending"),
      sourceLabel: t("employer.attention.source.organisation"),
      linkProps: { to: "/employer/$employerSlug/settings", params: { employerSlug } },
      actionLabel: t("employer.attention.action.viewOrganisation"),
    });
  } else if (status === "active") {
    items.push({
      key: "org-active",
      severity: "ready",
      text: t("employer.attention.orgActive"),
      sourceLabel: t("employer.attention.source.organisation"),
      linkProps: { to: "/employer/$employerSlug/settings", params: { employerSlug } },
      actionLabel: t("employer.attention.action.viewOrganisation"),
    });
  }

  if (awaitingReviewCount > 0) {
    items.push({
      key: "applications-awaiting",
      severity: "attention",
      text: t("employer.attention.applicationsAwaiting"),
      count: awaitingReviewCount,
      sourceLabel: t("employer.attention.source.applications"),
      linkProps: { to: "/employer/$employerSlug/applications", params: { employerSlug } },
      actionLabel: t("employer.attention.action.reviewApplications"),
    });
  }

  if (publishedNoApplications > 0) {
    items.push({
      key: "jobs-no-applications",
      severity: "attention",
      text: t("employer.attention.jobsNoApplications"),
      count: publishedNoApplications,
      sourceLabel: t("employer.attention.source.jobs"),
      linkProps: { to: "/employer/$employerSlug/jobs", params: { employerSlug } },
      actionLabel: t("employer.attention.action.manageJobs"),
    });
  }

  if (data.draftJobs > 0) {
    items.push({
      key: "draft-jobs",
      severity: "opportunity",
      text: t("employer.attention.draftJobs"),
      count: data.draftJobs,
      sourceLabel: t("employer.attention.source.jobs"),
      linkProps: { to: "/employer/$employerSlug/jobs", params: { employerSlug } },
      actionLabel: t("employer.attention.action.manageJobs"),
    });
  }

  if (orgIncomplete) {
    items.push({
      key: "org-incomplete",
      severity: "attention",
      text: t("employer.attention.orgIncomplete"),
      sourceLabel: t("employer.attention.source.organisation"),
      linkProps: { to: "/employer/$employerSlug/settings", params: { employerSlug } },
      actionLabel: t("employer.attention.action.viewOrganisation"),
    });
  }

  if (catalog.length > 0) {
    items.push({
      key: "assessments-available",
      severity: "opportunity",
      text: t("employer.attention.assessmentsAvailable"),
      count: catalog.length,
      sourceLabel: t("employer.attention.source.assessments"),
      linkProps: { to: "/employer/$employerSlug/assessments", params: { employerSlug } },
      actionLabel: t("employer.attention.action.viewAssessments"),
    });
  }

  if (workforce.activeEmployees === 0) {
    items.push({
      key: "workforce-empty",
      severity: "opportunity",
      text: t("employer.attention.workforceEmpty"),
      sourceLabel: t("employer.attention.source.workforce"),
      linkProps: { to: "/employer/$employerSlug/workforce", params: { employerSlug } },
      actionLabel: t("employer.attention.action.openWorkforce"),
    });
  }

  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const dataSources = [
    {
      key: "assessments",
      label: t("employer.readiness.source.assessments"),
      connected: catalog.length > 0,
    },
    {
      key: "workforce",
      label: t("employer.readiness.source.workforce"),
      connected: workforce.activeEmployees > 0,
    },
    { key: "competencies", label: t("employer.readiness.source.competencies"), connected: false },
    { key: "certificates", label: t("employer.readiness.source.certificates"), connected: false },
  ];
  const connectedCount = dataSources.filter((s) => s.connected).length;

  const currentPeriod = new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="command-center"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      {/* A. Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {currentPeriod}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t("employer.commandCenter.heading")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("employer.commandCenter.subheading")}
          </p>
        </div>
        <Link
          to="/employer/$employerSlug/jobs/new"
          params={{ employerSlug }}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          {t("employer.commandCenter.action.createJob")}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickActionLink
          icon={<Inbox className="h-4 w-4" />}
          label={t("employer.commandCenter.action.viewApplications")}
          linkProps={{ to: "/employer/$employerSlug/applications", params: { employerSlug } }}
        />
        <QuickActionLink
          icon={<ClipboardCheck className="h-4 w-4" />}
          label={t("employer.commandCenter.action.viewAssessments")}
          linkProps={{ to: "/employer/$employerSlug/assessments", params: { employerSlug } }}
        />
        <QuickActionLink
          icon={<Users className="h-4 w-4" />}
          label={t("employer.commandCenter.action.addEmployee")}
          linkProps={{ to: "/employer/$employerSlug/workforce", params: { employerSlug } }}
        />
      </div>

      {/* B. Readiness foundation */}
      <section className="mt-10 rounded-xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("employer.readiness.eyebrow")}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {t("employer.readiness.heading")}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {t("employer.readiness.body")}
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("employer.readiness.progress")
              .replace("{n}", String(connectedCount))
              .replace("{total}", "4")}
          </span>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dataSources.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              {s.connected ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded-full border border-dashed border-border"
                  aria-hidden="true"
                />
              )}
              <span className={s.connected ? "text-foreground" : "text-muted-foreground"}>
                {s.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* C. Needs your attention */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{t("employer.attention.heading")}</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.attention.empty")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 shadow-sm"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={
                      "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                      SEVERITY_STYLE[item.severity].badge
                    }
                  >
                    {SEVERITY_STYLE[item.severity].icon}
                    {t(`employer.attention.severity.${item.severity}` as TranslationKey)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {item.count !== undefined ? `${item.count} · ` : ""}
                      {item.text}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.sourceLabel}</p>
                  </div>
                </div>
                <Link
                  {...item.linkProps}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/60 hover:bg-muted/40"
                >
                  {item.actionLabel}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* D + E. Recruitment / Workforce lanes */}
      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("employer.lane.recruitment.heading")}
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat
              label={t("employer.dashboard.card.activeJobs")}
              value={data.activeJobs}
              loading={stats.isLoading}
            />
            <MiniStat
              label={t("employer.dashboard.card.draftJobs")}
              value={data.draftJobs}
              loading={stats.isLoading}
            />
            <MiniStat
              label={t("employer.dashboard.card.applications")}
              value={data.applications}
              loading={stats.isLoading}
            />
            <MiniStat
              label={t("employer.lane.recruitment.awaitingReview")}
              value={awaitingReviewCount}
              loading={applicationsQuery.isLoading}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <LaneAction
              label={t("employer.commandCenter.action.createJob")}
              linkProps={{ to: "/employer/$employerSlug/jobs/new", params: { employerSlug } }}
            />
            <LaneAction
              label={t("employer.dashboard.action.manageJobs")}
              linkProps={{ to: "/employer/$employerSlug/jobs", params: { employerSlug } }}
            />
            <LaneAction
              label={t("employer.lane.recruitment.reviewApplications")}
              linkProps={{ to: "/employer/$employerSlug/applications", params: { employerSlug } }}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("employer.lane.workforce.heading")}
            </h2>
          </div>
          {workforceQuery.isSuccess && workforce.activeEmployees === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              {t("employer.lane.workforce.empty")}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MiniStat
                label={t("employer.lane.workforce.activeEmployees")}
                value={workforce.activeEmployees}
                loading={workforceQuery.isLoading}
              />
              <MiniStat
                label={t("employer.lane.workforce.roles")}
                value={workforce.rolesRepresented}
                loading={workforceQuery.isLoading}
              />
              <MiniStat
                label={t("employer.lane.workforce.sites")}
                value={workforce.sitesRepresented}
                loading={workforceQuery.isLoading}
              />
            </div>
          )}
          <div className="mt-4">
            <LaneAction
              label={t("employer.lane.workforce.open")}
              linkProps={{ to: "/employer/$employerSlug/workforce", params: { employerSlug } }}
            />
          </div>
        </section>
      </div>

      {/* F. Assessment activity */}
      <section className="mt-6 rounded-xl border border-border bg-background p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("employer.assessmentActivity.heading")}
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat
            label={t("employer.assessments.tab.operational")}
            value={operationalCount}
            loading={catalogQuery.isLoading}
          />
          <MiniStat
            label={t("employer.assessments.tab.strategic")}
            value={strategicCount}
            loading={catalogQuery.isLoading}
          />
        </div>
        {sgf && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm text-foreground">{lang === "sv" ? sgf.name.sv : sgf.name.en}</p>
            <Link
              to="/employer/$employerSlug/assessments/$assessmentSlug"
              params={{ employerSlug, assessmentSlug: sgf.id }}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t("employer.assessments.card.viewDetails")}
            </Link>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <LaneAction
            label={t("employer.assessmentActivity.viewCenter")}
            linkProps={{ to: "/employer/$employerSlug/assessments", params: { employerSlug } }}
          />
          <span className="inline-flex items-center rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {t("employer.assessments.action.assign")} · {t("employer.comingSoonShort")}
          </span>
        </div>
      </section>

      {/* G. Sites & risk foundation */}
      <section className="mt-6 rounded-xl border border-border bg-background p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("employer.sitesFoundation.heading")}
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {workforce.sitesRepresented > 0
            ? t("employer.sitesFoundation.bodyWithData").replace(
                "{n}",
                String(workforce.sitesRepresented),
              )
            : t("employer.sitesFoundation.bodyEmpty")}
        </p>
        <div className="mt-4">
          <LaneAction
            label={t("employer.sitesFoundation.open")}
            linkProps={{ to: "/employer/$employerSlug/sites", params: { employerSlug } }}
          />
        </div>
      </section>

      {/* H. Ask CQrity foundation */}
      <section className="mt-6 rounded-xl border border-border bg-gradient-to-br from-accent/5 via-background to-background p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"
            aria-hidden="true"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {t("employer.askCqrity.heading")}
              </h2>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("employer.module.comingSoon.badge")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("employer.askCqrity.body")}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <LaneAction
            label={t("employer.askCqrity.query.applications")}
            linkProps={{ to: "/employer/$employerSlug/applications", params: { employerSlug } }}
          />
          <LaneAction
            label={t("employer.askCqrity.query.assessments")}
            linkProps={{ to: "/employer/$employerSlug/assessments", params: { employerSlug } }}
          />
          <LaneAction
            label={t("employer.askCqrity.heading")}
            linkProps={{ to: "/employer/$employerSlug/ask-cqrity", params: { employerSlug } }}
          />
        </div>
      </section>
    </EmployerAppShell>
  );
}

function QuickActionLink({
  icon,
  label,
  linkProps,
}: {
  icon: ReactNode;
  label: string;
  linkProps: LinkComponentProps;
}) {
  return (
    <Link
      {...linkProps}
      className="group flex items-center justify-between rounded-xl border border-border bg-background p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent"
          aria-hidden="true"
        >
          {icon}
        </span>
        {label}
      </span>
      <ArrowRight
        className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}

function MiniStat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {loading ? "—" : value}
      </p>
    </div>
  );
}

function LaneAction({ label, linkProps }: { label: string; linkProps: LinkComponentProps }) {
  return (
    <Link
      {...linkProps}
      className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/60 hover:bg-muted/40"
    >
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}
