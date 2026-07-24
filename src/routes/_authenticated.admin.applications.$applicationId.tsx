// Admin Portal — application detail. Read-only oversight: shows the
// applicant, employer, job, status history, and the linked assessment
// assignment when one exists -- never a control to change the status
// itself (that stays the candidate's withdraw or the employer's own
// review decision).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { adminGetApplicationDetail } from "@/lib/job-intelligence/admin-applications.functions";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/applications/$applicationId")({
  ssr: false,
  component: AdminApplicationDetailPage,
  errorComponent: AdminErrorState,
});

function AdminApplicationDetailPage() {
  const { applicationId } = Route.useParams();
  const { t, lang } = useT();
  const getFn = useServerFn(adminGetApplicationDetail);

  const q = useQuery({
    queryKey: ["admin", "application-detail", applicationId],
    queryFn: () => getFn({ data: { applicationId } }),
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="applications">
          <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
        </AdminShellChrome>
      </SiteLayout>
    );
  }
  if (q.isError || !q.data) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="applications">
          <h1 className="text-xl font-semibold text-foreground">
            {t("admin.applications.detail.notFound")}
          </h1>
          <div className="mt-4">
            <Link
              to="/admin/applications"
              className="text-sm font-medium text-accent hover:underline"
            >
              {t("admin.applications.detail.backToList")}
            </Link>
          </div>
        </AdminShellChrome>
      </SiteLayout>
    );
  }

  const a = q.data;

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="applications">
        <Link to="/admin/applications" className="text-xs font-medium text-accent hover:underline">
          ← {t("admin.applications.detail.backToList")}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {a.applicantDisplayName ?? a.applicantEmail ?? a.applicantUserId}
          </h1>
          <Badge variant="outline">
            {t(`admin.applications.status.${a.status}` as TranslationKey)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{a.applicantEmail}</p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.applications.detail.section.context")}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.applications.list.column.employer")}
                </dt>
                <dd>
                  <Link
                    to="/admin/employers/$employerId"
                    params={{ employerId: a.employerId }}
                    className="text-accent hover:underline"
                  >
                    {a.employerName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.applications.list.column.job")}
                </dt>
                <dd className="text-foreground">{a.jobTitleSv || a.jobTitleEn || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.applications.list.column.created")}
                </dt>
                <dd className="text-foreground">{formatDateTime(a.createdAt, lang)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.applications.detail.section.assignment")}
            </h2>
            {a.linkedAssignmentId ? (
              <div className="mt-3 text-sm">
                <p className="text-foreground">{a.linkedAssignmentStatus}</p>
                <Link
                  to="/admin/assignments/$assignmentId"
                  params={{ assignmentId: a.linkedAssignmentId }}
                  className="mt-2 inline-block text-accent hover:underline"
                >
                  {t("admin.applications.detail.viewAssignment")}
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("admin.applications.detail.noAssignment")}
              </p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.applications.detail.section.history")}
          </h2>
          {a.statusHistory.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("admin.applications.detail.noHistory")}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {a.statusHistory.map((ev) => (
                <li key={ev.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {ev.previousStatus} → {ev.newStatus}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(ev.createdAt, lang)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{ev.actorRole}</p>
                  {ev.note && <p className="mt-2 text-foreground">{ev.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </AdminShellChrome>
    </SiteLayout>
  );
}
