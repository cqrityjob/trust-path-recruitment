// Employer OS — the employer landing page, "Översikt".
//
// Replaces the earlier "Command Center", which read as a technical admin
// console: a header CTA, three competing quick actions, and five stacked
// module lanes. A responsible manager should instead land on the four
// areas they actually work in -- recruitment, their people, testing,
// development -- at equal weight, with everything that needs their
// judgement immediately below.
//
// Nothing here is a placeholder metric: every number is a direct read
// (dashboard stats, workforce summary, assessment assignments). The
// entry points that used to be top-level quick actions now sit inside
// the area they belong to -- applications under Mina annonser, adding an
// employee under Min personal -- and nothing has been removed from the
// workspace: sites, reports, analytics and Fråga CQrity are reached from
// the left navigation.
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
  GraduationCap,
  Info,
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
import { listAssignmentsForEmployer } from "@/lib/job-intelligence/assessment-assignments.functions";
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
    <EmployerOverview
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

function EmployerOverview({
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
  const loadAssignments = useServerFn(listAssignmentsForEmployer);

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
  const assignmentsQuery = useQuery({
    queryKey: ["employer", employerId, "assignments", "all"],
    queryFn: () => loadAssignments({ data: { employerId, statusFilter: "all" } }),
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
  const assignments = assignmentsQuery.data ?? [];
  const invitedCount = assignments.filter(
    (a) => a.status === "invited" || a.status === "opened",
  ).length;
  const inProgressCount = assignments.filter((a) => a.status === "started").length;
  const completedAssignmentsCount = assignments.filter((a) => a.status === "completed").length;

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
      activeSection="overview"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      {/* A. Header */}
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {currentPeriod}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t("employer.overview.heading")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("employer.overview.subheading")}
        </p>
      </div>

      {/* B. The four working areas, at equal weight. */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PrimaryCard
          icon={<Briefcase className="h-4 w-4" />}
          title={t("employer.overview.card.jobs.title")}
          body={t("employer.overview.card.jobs.body")}
          linkProps={{ to: "/employer/$employerSlug/jobs", params: { employerSlug } }}
          stats={[
            {
              label: t("employer.overview.card.jobs.stat.active"),
              value: data.activeJobs,
              loading: stats.isLoading,
            },
            {
              label: t("employer.overview.card.jobs.stat.drafts"),
              value: data.draftJobs,
              loading: stats.isLoading,
            },
            {
              label: t("employer.overview.card.jobs.stat.applications"),
              value: data.applications,
              loading: stats.isLoading,
            },
          ]}
          actions={[
            {
              label: t("employer.overview.card.jobs.action.create"),
              linkProps: { to: "/employer/$employerSlug/jobs/new", params: { employerSlug } },
            },
            {
              label: t("employer.overview.card.jobs.action.applications"),
              linkProps: { to: "/employer/$employerSlug/applications", params: { employerSlug } },
            },
          ]}
        />

        <PrimaryCard
          icon={<Users className="h-4 w-4" />}
          title={t("employer.overview.card.people.title")}
          body={t("employer.overview.card.people.body")}
          linkProps={{ to: "/employer/$employerSlug/workforce", params: { employerSlug } }}
          stats={[
            {
              label: t("employer.overview.card.people.stat.employees"),
              value: workforce.activeEmployees,
              loading: workforceQuery.isLoading,
            },
            {
              label: t("employer.overview.card.people.stat.roles"),
              value: workforce.rolesRepresented,
              loading: workforceQuery.isLoading,
            },
            {
              label: t("employer.overview.card.people.stat.sites"),
              value: workforce.sitesRepresented,
              loading: workforceQuery.isLoading,
            },
          ]}
          actions={[
            {
              label: t("employer.overview.card.people.action.competencies"),
              linkProps: { to: "/employer/$employerSlug/competencies", params: { employerSlug } },
            },
          ]}
        />

        <PrimaryCard
          icon={<ClipboardCheck className="h-4 w-4" />}
          title={t("employer.overview.card.tests.title")}
          body={t("employer.overview.card.tests.body")}
          linkProps={{ to: "/employer/$employerSlug/assessments", params: { employerSlug } }}
          stats={[
            {
              label: t("employer.overview.card.tests.stat.invited"),
              value: invitedCount,
              loading: assignmentsQuery.isLoading,
            },
            {
              label: t("employer.overview.card.tests.stat.inProgress"),
              value: inProgressCount,
              loading: assignmentsQuery.isLoading,
            },
            {
              label: t("employer.overview.card.tests.stat.completed"),
              value: completedAssignmentsCount,
              loading: assignmentsQuery.isLoading,
            },
          ]}
          actions={[
            {
              label: t("employer.overview.card.tests.action.assign"),
              linkProps: {
                to: "/employer/$employerSlug/assessments/assign",
                params: { employerSlug },
                search: { assessmentId: "security-guard-foundation" },
              },
            },
            {
              label: t("employer.overview.card.tests.action.activity"),
              linkProps: {
                to: "/employer/$employerSlug/assessments/assignments",
                params: { employerSlug },
              },
            },
          ]}
        />

        {/* The development module is a controlled future state on this
            branch -- the card is structurally correct and routes to the
            real destination, and says plainly that it is not finished
            rather than implying functionality that does not exist. */}
        <PrimaryCard
          icon={<GraduationCap className="h-4 w-4" />}
          title={t("employer.overview.card.development.title")}
          body={t("employer.overview.card.development.body")}
          linkProps={{ to: "/employer/$employerSlug/training", params: { employerSlug } }}
          badge={t("employer.module.comingSoon.badge")}
        />
      </div>

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
    </EmployerAppShell>
  );
}

/** One of the four working areas. The header row is the link to the area
 *  itself; the small actions below are the shortcuts that used to compete
 *  with it as separate top-level quick actions. */
function PrimaryCard({
  icon,
  title,
  body,
  linkProps,
  stats,
  actions,
  badge,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  linkProps: LinkComponentProps;
  stats?: { label: string; value: number; loading: boolean }[];
  actions?: { label: string; linkProps: LinkComponentProps }[];
  badge?: string;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-background p-5 shadow-sm transition-colors hover:border-accent/60">
      <Link {...linkProps} className="group block rounded-md">
        <div className="flex items-start gap-3">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground transition-colors group-hover:text-accent">
                {title}
              </h2>
              {badge && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {badge}
                </span>
              )}
              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent"
                aria-hidden="true"
              />
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
      </Link>

      {stats && (
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {stat.loading ? "—" : stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {actions && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              {...action.linkProps}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/60 hover:bg-muted/40"
            >
              {action.label}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
