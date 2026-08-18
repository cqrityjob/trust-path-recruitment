// Admin Portal — Overview. Real operational metrics only (no fabricated
// numbers): every count/feed comes from adminGetOverviewMetrics, which
// reads the exact same tables every other admin module reads.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { adminGetOverviewMetrics } from "@/lib/job-intelligence/admin-overview.functions";
import { passportReviewCounts } from "@/lib/security-passport/verification.functions";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/")({
  ssr: false,
  component: AdminOverviewPage,
});

function MetricCard({
  label,
  value,
  to,
  loading,
}: {
  label: string;
  value: number;
  to: string;
  loading: boolean;
}) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-background p-5 transition-colors hover:border-accent/50"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? "—" : value}</p>
    </Link>
  );
}

function AdminOverviewPage() {
  const { t, lang } = useT();
  const metricsFn = useServerFn(adminGetOverviewMetrics);
  const q = useQuery({
    queryKey: ["admin", "overview-metrics"],
    queryFn: () => metricsFn(),
  });

  const m = q.data;
  const loading = q.isLoading;

  // Passport reviews are work waiting on a person, so the overview says how
  // much of it there is. Its own query, because a Passport outage must not
  // take the rest of the dashboard down with it.
  const passportCountsFn = useServerFn(passportReviewCounts);
  const passportQ = useQuery({
    queryKey: ["admin", "passport-review-counts"],
    queryFn: () => passportCountsFn({ data: undefined }),
    staleTime: 30_000,
    retry: false,
  });
  const passport = passportQ.data;

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="overview">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.overview.heading")}
        </h1>

        {q.isError && <p className="mt-4 text-sm text-destructive">{(q.error as Error).message}</p>}

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.overview.section.passport")}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label={t("admin.overview.metric.passportOpen")}
              value={passport?.open ?? 0}
              to="/admin/passport-verification"
              loading={passportQ.isLoading}
            />
            <MetricCard
              label={t("admin.overview.metric.passportClarification")}
              value={passport?.clarification ?? 0}
              to="/admin/passport-verification"
              loading={passportQ.isLoading}
            />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.overview.section.employers")}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label={t("admin.overview.metric.employersPending")}
              value={m?.employersPending ?? 0}
              to="/admin/employers"
              loading={loading}
            />
            <MetricCard
              label={t("admin.overview.metric.employersActive")}
              value={m?.employersActive ?? 0}
              to="/admin/employers"
              loading={loading}
            />
            <MetricCard
              label={t("admin.overview.metric.employersSuspended")}
              value={m?.employersSuspended ?? 0}
              to="/admin/employers"
              loading={loading}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.overview.section.jobsApplications")}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label={t("admin.overview.metric.jobsPendingModeration")}
              value={m?.jobsPendingModeration ?? 0}
              to="/admin/jobs"
              loading={loading}
            />
            <MetricCard
              label={t("admin.overview.metric.jobsPublished")}
              value={m?.jobsPublished ?? 0}
              to="/admin/jobs"
              loading={loading}
            />
            <MetricCard
              label={t("admin.overview.metric.applicationsActive")}
              value={m?.applicationsActive ?? 0}
              to="/admin/applications"
              loading={loading}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.overview.section.assignments")}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <MetricCard
              label={t("admin.overview.metric.assignmentsInvited")}
              value={m?.assignmentsInvited ?? 0}
              to="/admin/assignments"
              loading={loading}
            />
            <MetricCard
              label={t("admin.overview.metric.assignmentsInProgress")}
              value={m?.assignmentsInProgress ?? 0}
              to="/admin/assignments"
              loading={loading}
            />
            <MetricCard
              label={t("admin.overview.metric.assignmentsCompleted")}
              value={m?.assignmentsCompleted ?? 0}
              to="/admin/results"
              loading={loading}
            />
            <MetricCard
              label={t("admin.overview.metric.assignmentsExpired")}
              value={m?.assignmentsExpired ?? 0}
              to="/admin/assignments"
              loading={loading}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.overview.section.workforce")}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label={t("admin.overview.metric.employeesTotal")}
              value={m?.employeesTotal ?? 0}
              to="/admin/workforce"
              loading={loading}
            />
          </div>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.overview.section.recentFeedback")}
            </h2>
            {!m || m.recentFeedback.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("admin.overview.noRecentFeedback")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {m.recentFeedback.map((f) => (
                  <li key={f.id} className="border-b border-border pb-2 last:border-0">
                    <p className="text-foreground">{f.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {f.category} · {formatDateTime(f.createdAt, lang)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/admin/feedback"
              className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
            >
              {t("admin.overview.viewAllFeedback")}
            </Link>
          </section>

          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.overview.section.recentActions")}
            </h2>
            {!m || m.recentAdminActions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("admin.overview.noRecentActions")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {m.recentAdminActions.map((a) => (
                  <li
                    key={`${a.source}-${a.id}`}
                    className="border-b border-border pb-2 last:border-0"
                  >
                    <p className="text-foreground">{a.action}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.subjectType ?? "—"} · {formatDateTime(a.at, lang)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </AdminShellChrome>
    </SiteLayout>
  );
}
