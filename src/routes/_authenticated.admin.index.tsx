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
import {
  adminListEmployersForModeration,
  type AdminEmployerListRow,
} from "@/lib/job-intelligence/admin-employer-moderation.functions";
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

  // ── THE ADMINISTRATOR'S NOTIFICATION THAT A COMPANY WANTS TO JOIN ────
  //
  // A pending count is a number. It does not say WHICH company, WHO
  // registered it, how to reach them, or where to open it -- so an
  // administrator who noticed it still had to go and look, which is exactly
  // what "we were never notified" describes.
  //
  // This is the in-product half of the notification, and it is the half that
  // does not depend on email working: it reads the same
  // adminListEmployersForModeration the queue at /admin/employers reads, with
  // the same admin-only RLS behind it, and it is correct even when no mail
  // provider is configured at all.
  //
  // Its own query, so a failure here cannot take the rest of the dashboard
  // down, and so it can say "we could not load this" rather than rendering a
  // confident empty list -- an empty queue and an unread queue are not the
  // same fact.
  const pendingEmployersFn = useServerFn(adminListEmployersForModeration);
  const pendingEmployersQ = useQuery({
    queryKey: ["admin", "employers-moderation", "pending", ""],
    queryFn: () => pendingEmployersFn({ data: { status: "pending" as const } }),
    staleTime: 30_000,
    retry: false,
  });

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

        <PendingEmployerApplications
          rows={pendingEmployersQ.data ?? []}
          loading={pendingEmployersQ.isLoading}
          failed={pendingEmployersQ.isError}
        />

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

/**
 * Every company waiting for a decision, with what a decision needs.
 *
 * Four facts and a link, matching the administrator email exactly: which
 * company, who registered it, how to reach them, and the row to open. The
 * link goes to /admin/employers/<id>, which is inside the authenticated admin
 * shell and behind `is_platform_admin` at the database -- holding the URL
 * grants nothing.
 *
 * "Pending" is the only status shown here. An approved or rejected company is
 * not waiting for anybody, and listing it would turn a to-do list into a log.
 */
function PendingEmployerApplications(props: {
  rows: AdminEmployerListRow[];
  loading: boolean;
  failed: boolean;
}) {
  const { t, lang } = useT();
  return (
    <section className="mt-8" data-testid="admin-pending-employer-applications">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("admin.overview.section.pendingEmployers")}
      </h2>

      {props.loading && <p className="mt-3 text-sm text-muted-foreground">{t("admin.loading")}</p>}

      {/* A read that did not answer is not an empty queue. */}
      {props.failed && (
        <p className="mt-3 text-sm text-destructive">
          {t("admin.overview.pendingEmployers.loadError")}
        </p>
      )}

      {!props.loading && !props.failed && props.rows.length === 0 && (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {t("admin.overview.pendingEmployers.empty")}
        </p>
      )}

      {!props.loading && !props.failed && props.rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {props.rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.ownerDisplayName ?? t("admin.employers.list.ownerUnknown")}
                  {r.ownerEmail ? ` · ${r.ownerEmail}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {(r.country ?? "—") + " · " + formatDateTime(r.createdAt, lang)}
                </p>
              </div>
              <Link
                to="/admin/employers/$employerId"
                params={{ employerId: r.id }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
              >
                {t("admin.overview.pendingEmployers.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
