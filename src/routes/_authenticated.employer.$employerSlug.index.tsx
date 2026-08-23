// Employer OS — the employer landing page, "Översikt".
//
// Replaces the earlier "Command Center", which read as a technical admin
// console: a header CTA, three competing quick actions, and five stacked
// module lanes. A responsible manager should instead land on the four
// areas they actually work in -- recruitment, their people, assessment,
// development -- at equal weight, with everything that needs their
// judgement immediately below.
//
// Nothing here is a placeholder metric: every number is a direct read
// (dashboard stats, workforce summary, assessment assignments). The
// entry points that used to be top-level quick actions now sit inside
// the area they belong to -- applications under Mina annonser, adding an
// employee under Min personal. Every action on this page leads somewhere
// finished: the shortcut into Kompetens was removed because that module is
// still a stated intention rather than a working area.
//
// Access-resolution pattern unchanged from every other
// /employer/$employerSlug/* route: the slug is a lookup key only,
// re-verified independently via listMyEmployerWorkspaces() on every load.

import { createFileRoute, Link, type LinkComponentProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getEmployerAssessmentPipeline } from "@/lib/security-competency/assessment-lifecycle.functions";
import { getEmployerReviewBoard } from "@/lib/security-competency/academy-employer.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Hourglass,
  Inbox,
  Info,
  ShieldCheck,
  Sparkles,
  UserCheck,
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
import { listTrainingStatus } from "@/lib/security-competency/academy-employer.functions";
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

/** One piece of work, with the exact place it is done.
 *
 *  The contract this board keeps, and the reason it is separate from the
 *  status cards below it: every row is a NUMBER OF THINGS and a LINK THAT
 *  LANDS ON EXACTLY THOSE THINGS. A count whose link opens an unfiltered list
 *  is not an action, it is a reading comprehension exercise -- the employer
 *  has to re-find the five rows the number was about.
 *
 *  `tone` distinguishes work the employer owns from work they are waiting on
 *  somebody else to finish. Both belong here (a recruiter needs to know an
 *  assessment has been sitting with a candidate for a week), and they are not
 *  the same call to action, so they do not look the same. */
type ActionItem = {
  key: string;
  icon: ReactNode;
  count: number;
  text: string;
  linkProps: LinkComponentProps;
  actionLabel: string;
  tone: "todo" | "waiting";
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
  const { t, tp, lang } = useT();

  const loadStats = useServerFn(getEmployerDashboardStats);
  const loadOrg = useServerFn(getEmployerOrganisation);
  const loadJobs = useServerFn(listEmployerJobs);
  const loadApplications = useServerFn(listApplicationsForEmployer);
  const loadCatalog = useServerFn(listEmployerAssessmentCatalog);
  const loadWorkforce = useServerFn(getEmployerWorkforceSummary);
  const loadAssignments = useServerFn(listAssignmentsForEmployer);
  const loadTraining = useServerFn(listTrainingStatus);
  const loadPipeline = useServerFn(getEmployerAssessmentPipeline);
  const loadReviewBoard = useServerFn(getEmployerReviewBoard);

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
  const trainingQuery = useQuery({
    queryKey: ["academy", "training-status", employerId],
    queryFn: () => loadTraining({ data: { employerId } }),
  });
  // Shared cache key with the assessment workspace: one fetch, one set of numbers,
  // and the card can never show a total the workspace disagrees with.
  const pipelineQuery = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => loadPipeline({ data: { employerId } }),
  });
  // RESPONSES outstanding, not attempts. "7 svar behover granskas" is the
  // sentence a reviewer can act on; "2 forsok under granskning" is a different
  // number about a different object, and the review workspace already leads
  // with the first. Same cache key as that workspace, so the dashboard can
  // never quote a total the queue disagrees with.
  const reviewBoardQuery = useQuery({
    queryKey: ["academy", "review-board", employerId],
    queryFn: () => loadReviewBoard({ data: { employerId } }),
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
  // Assessment metrics come from the governed pipeline -- the same rows, the same
  // lifecycle derivation, as the workspace this card links into. Counting
  // assignment.status here would be a second status vocabulary on the
  // dashboard, and the two would drift.
  const pipeline = pipelineQuery.data ?? [];
  const testsActiveCount = pipeline.filter(
    (r) => r.lifecycleState === "invited" || r.lifecycleState === "in_progress",
  ).length;
  const testsAwaitingReviewCount = pipeline.filter(
    (r) => r.lifecycleState === "under_review",
  ).length;
  const testsReadyToReleaseCount = pipeline.filter(
    (r) => r.lifecycleState === "ready_to_release",
  ).length;

  // Counted from the training read model, never estimated. The card showed a
  // "coming soon" badge and no numbers because there was nothing to count;
  // there is now, so it shows what is actually there.
  const training = trainingQuery.data ?? [];
  const trainingActiveCount = training.filter(
    (r) => r.status === "assigned" || r.status === "in_progress",
  ).length;
  const trainingCompletedCount = training.filter((r) => r.status === "completed").length;

  const awaitingReviewCount = applications.filter((a) => a.status === "submitted").length;
  const responsesToReview = (reviewBoardQuery.data ?? []).reduce((n, r) => n + r.responsesOpen, 0);
  // Somebody the employer has already picked up and not yet decided about.
  // Deliberately not "everyone who is not rejected": a candidate still at
  // `submitted` is in the first item above, and counting them twice would make
  // the board describe more work than exists.
  const nextStepCount = applications.filter(
    (a) => a.status === "reviewing" || a.status === "interview",
  ).length;
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

  // ---- Today's work. Ordered by who is blocked: things waiting on this
  // employer first, things waiting on somebody else after. Nothing is shown
  // at zero -- an empty row that says "0 svar behover granskas" is a metric,
  // and this section is not for metrics.
  const actions: ActionItem[] = [];

  if (awaitingReviewCount > 0) {
    actions.push({
      key: "new-applications",
      icon: <Inbox className="h-4 w-4" />,
      count: awaitingReviewCount,
      text: tp("employer.actions.newApplications", awaitingReviewCount),
      // The exact rows, not the inbox they live in.
      linkProps: {
        to: "/employer/$employerSlug/applications",
        params: { employerSlug },
        search: { status: "submitted" as const },
      },
      actionLabel: t("employer.actions.open"),
      tone: "todo",
    });
  }

  if (responsesToReview > 0) {
    actions.push({
      key: "responses-to-review",
      icon: <ShieldCheck className="h-4 w-4" />,
      count: responsesToReview,
      text: tp("employer.actions.responsesToReview", responsesToReview),
      linkProps: {
        to: "/employer/$employerSlug/assessments/reviews",
        params: { employerSlug },
        search: { scope: "all" as const },
      },
      actionLabel: t("employer.actions.review"),
      tone: "todo",
    });
  }

  if (testsReadyToReleaseCount > 0) {
    actions.push({
      key: "results-ready",
      icon: <FileCheck2 className="h-4 w-4" />,
      count: testsReadyToReleaseCount,
      text: tp("employer.actions.resultsReady", testsReadyToReleaseCount),
      linkProps: {
        to: "/employer/$employerSlug/assessments/participants",
        params: { employerSlug },
        search: { state: "ready_to_release" as const },
      },
      actionLabel: t("employer.actions.open"),
      tone: "todo",
    });
  }

  if (nextStepCount > 0) {
    actions.push({
      key: "awaiting-next-step",
      icon: <UserCheck className="h-4 w-4" />,
      count: nextStepCount,
      text: tp("employer.actions.awaitingNextStep", nextStepCount),
      linkProps: {
        to: "/employer/$employerSlug/applications",
        params: { employerSlug },
        search: { status: "reviewing" as const },
      },
      actionLabel: t("employer.actions.open"),
      tone: "todo",
    });
  }

  if (data.draftJobs > 0) {
    actions.push({
      key: "draft-jobs",
      icon: <Briefcase className="h-4 w-4" />,
      count: data.draftJobs,
      text: tp("employer.actions.draftJobs", data.draftJobs),
      linkProps: { to: "/employer/$employerSlug/jobs", params: { employerSlug } },
      actionLabel: t("employer.actions.open"),
      tone: "todo",
    });
  }

  // Waiting on the candidate, not on the employer. Still worth surfacing --
  // an invitation nobody has opened is the thing a recruiter chases.
  if (testsActiveCount > 0) {
    actions.push({
      key: "tests-with-candidates",
      icon: <Hourglass className="h-4 w-4" />,
      count: testsActiveCount,
      text: tp("employer.actions.testsWithCandidates", testsActiveCount),
      linkProps: {
        to: "/employer/$employerSlug/assessments/participants",
        params: { employerSlug },
        search: { state: "active" as const },
      },
      actionLabel: t("employer.actions.open"),
      tone: "waiting",
    });
  }

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

  if (publishedNoApplications > 0) {
    items.push({
      key: "jobs-no-applications",
      severity: "attention",
      text: tp("employer.attention.jobsNoApplications", publishedNoApplications),
      count: publishedNoApplications,
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
      text: tp("employer.attention.assessmentsAvailable", catalog.length),
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

      {/* B. Today's work, above the status cards.
       *
       *  Order matters here and it changed: the four area cards used to be the
       *  first thing on the page, so an employer with five new applications
       *  and seven responses to review landed on four totals and had to go
       *  looking. Work first, totals second. */}
      <section className="mt-6" aria-labelledby="employer-actions">
        <h2 id="employer-actions" className="text-lg font-semibold text-foreground">
          {t("employer.actions.heading")}
        </h2>
        {actions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.actions.empty")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {actions.map((item) => (
              <li key={item.key}>
                {/* The whole row is the link. A number that is described as
                    actionable and then needs a second, smaller target to act
                    on is a number the employer has to aim at. */}
                <Link
                  {...item.linkProps}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:border-accent/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md " +
                        (item.tone === "todo"
                          ? "bg-accent/10 text-accent"
                          : "bg-muted text-muted-foreground")
                      }
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        <span className="tabular-nums">{item.count}</span> {item.text}
                      </span>
                      {item.tone === "waiting" && (
                        <span className="block text-xs text-muted-foreground">
                          {t("employer.actions.waitingLabel")}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                    {item.actionLabel}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* C. The four working areas, at equal weight. */}
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
              linkProps: { to: "/employer/$employerSlug/jobs", params: { employerSlug } },
            },
            {
              label: t("employer.overview.card.jobs.stat.applications"),
              value: data.applications,
              loading: stats.isLoading,
              linkProps: { to: "/employer/$employerSlug/applications", params: { employerSlug } },
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
              label: t("employer.overview.card.people.action.openWorkforce"),
              linkProps: { to: "/employer/$employerSlug/workforce", params: { employerSlug } },
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
              label: t("employer.overview.card.tests.stat.active"),
              value: testsActiveCount,
              loading: pipelineQuery.isLoading,
              linkProps: {
                to: "/employer/$employerSlug/assessments/participants",
                params: { employerSlug },
                search: { state: "active" as const },
              },
            },
            {
              label: t("employer.overview.card.tests.stat.awaitingReview"),
              value: testsAwaitingReviewCount,
              loading: pipelineQuery.isLoading,
              linkProps: {
                to: "/employer/$employerSlug/assessments/reviews",
                params: { employerSlug },
                search: { scope: "all" as const },
              },
            },
            {
              label: t("employer.overview.card.tests.stat.readyToRelease"),
              value: testsReadyToReleaseCount,
              loading: pipelineQuery.isLoading,
              linkProps: {
                to: "/employer/$employerSlug/assessments/participants",
                params: { employerSlug },
                search: { state: "ready_to_release" as const },
              },
            },
          ]}
          actions={[
            {
              label: t("employer.overview.card.tests.action.assign"),
              linkProps: {
                to: "/employer/$employerSlug/assessments/library",
                params: { employerSlug },
              },
            },
            {
              label: t("employer.overview.card.tests.action.activity"),
              linkProps: {
                to: "/employer/$employerSlug/assessments/participants",
                params: { employerSlug },
              },
            },
          ]}
        />

        {/* Kompetensutveckling is real now. The "coming soon" badge is gone
            and the two numbers are counted from the training read model --
            nothing on this card is invented. */}
        <PrimaryCard
          icon={<GraduationCap className="h-4 w-4" />}
          title={t("employer.overview.card.development.title")}
          body={t("employer.overview.card.development.body")}
          linkProps={{ to: "/employer/$employerSlug/training", params: { employerSlug } }}
          stats={[
            {
              label: t("employer.overview.card.development.stat.active"),
              value: trainingActiveCount,
              loading: trainingQuery.isLoading,
            },
            {
              label: t("employer.overview.card.development.stat.completed"),
              value: trainingCompletedCount,
              loading: trainingQuery.isLoading,
            },
          ]}
          actions={[
            {
              label: t("employer.overview.card.development.action.programmes"),
              linkProps: {
                to: "/employer/$employerSlug/training/programmes",
                params: { employerSlug },
              },
            },
            {
              label: t("employer.overview.card.development.action.participants"),
              linkProps: {
                to: "/employer/$employerSlug/training/participants",
                params: { employerSlug },
              },
            },
          ]}
        />
      </div>

      {/* D. Organisation and setup notes. Not today's work -- the two are
          separated now, and the actionable half is at the top of the page. */}
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
  stats?: { label: string; value: number; loading: boolean; linkProps?: LinkComponentProps }[];
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
                {/* A stat that names a pile of work is a way into that pile.
                    A stat that is only a total (employees, sites) stays plain
                    text -- making everything clickable teaches an employer
                    that nothing in particular is. */}
                {stat.loading ? (
                  "—"
                ) : stat.linkProps && stat.value > 0 ? (
                  <Link
                    {...stat.linkProps}
                    className="text-foreground underline decoration-border underline-offset-4 hover:text-accent hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {stat.value}
                  </Link>
                ) : (
                  stat.value
                )}
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
