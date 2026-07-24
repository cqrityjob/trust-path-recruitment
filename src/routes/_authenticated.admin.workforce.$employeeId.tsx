// Admin Portal — employee detail: profile, employer context, related
// assessment assignments, deactivate/reactivate (the only two states the
// existing data model supports).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  adminGetEmployeeDetail,
  adminSetEmployeeStatus,
} from "@/lib/job-intelligence/admin-workforce.functions";

export const Route = createFileRoute("/_authenticated/admin/workforce/$employeeId")({
  ssr: false,
  component: AdminEmployeeDetailPage,
  errorComponent: AdminErrorState,
});

function AdminEmployeeDetailPage() {
  const { employeeId } = Route.useParams();
  const { t } = useT();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetEmployeeDetail);
  const setStatusFn = useServerFn(adminSetEmployeeStatus);

  const q = useQuery({
    queryKey: ["admin", "employee-detail", employeeId],
    queryFn: () => getFn({ data: { employeeId } }),
  });

  const setStatus = useMutation({
    mutationFn: (employmentStatus: "active" | "inactive") =>
      setStatusFn({ data: { employeeId, employmentStatus } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "employee-detail", employeeId] });
      qc.invalidateQueries({ queryKey: ["admin", "workforce"] });
    },
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="workforce">
          <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
        </AdminShellChrome>
      </SiteLayout>
    );
  }
  if (q.isError || !q.data) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="workforce">
          <h1 className="text-xl font-semibold text-foreground">
            {t("admin.workforce.detail.notFound")}
          </h1>
          <div className="mt-4">
            <Link to="/admin/workforce" className="text-sm font-medium text-accent hover:underline">
              {t("admin.workforce.detail.backToList")}
            </Link>
          </div>
        </AdminShellChrome>
      </SiteLayout>
    );
  }

  const e = q.data;

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="workforce">
        <Link to="/admin/workforce" className="text-xs font-medium text-accent hover:underline">
          ← {t("admin.workforce.detail.backToList")}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {e.firstName} {e.lastName}
          </h1>
          <Badge variant={e.employmentStatus === "active" ? "default" : "outline"}>
            {t(`admin.workforce.status.${e.employmentStatus}` as TranslationKey)}
          </Badge>
        </div>

        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={setStatus.isPending}
            onClick={() =>
              setStatus.mutate(e.employmentStatus === "active" ? "inactive" : "active")
            }
          >
            {e.employmentStatus === "active"
              ? t("admin.workforce.detail.action.deactivate")
              : t("admin.workforce.detail.action.reactivate")}
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.workforce.detail.section.profile")}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.applications.list.column.employer")}
                </dt>
                <dd>
                  <Link
                    to="/admin/employers/$employerId"
                    params={{ employerId: e.employerId }}
                    className="text-accent hover:underline"
                  >
                    {e.employerName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.users.list.column.email")}
                </dt>
                <dd className="text-foreground">{e.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.workforce.list.column.roleTitle")}
                </dt>
                <dd className="text-foreground">{e.roleTitle ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.workforce.detail.field.site")}
                </dt>
                <dd className="text-foreground">{e.siteName ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.employers.detail.section.assignments")}
            </h2>
            {e.assignments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("admin.employers.detail.noAssignments")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {e.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="text-foreground">{a.assessmentId}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {t(`admin.assignments.status.${a.status}` as TranslationKey)}
                      </Badge>
                      <Link
                        to="/admin/assignments/$assignmentId"
                        params={{ assignmentId: a.id }}
                        className="text-xs text-accent hover:underline"
                      >
                        {t("admin.employers.list.open")}
                      </Link>
                    </div>
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
