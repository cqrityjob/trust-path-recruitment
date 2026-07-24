// Admin Portal — result report. Reuses EmployerReportView unchanged,
// fed by adminGetAssignmentReport's already-computed, cached
// EngineResultV1 -- no re-scoring, no second report implementation.
// Never shows answer keys, weights, or scoring internals (the component
// itself never receives them); always shows the decision-support
// disclaimer (built into EmployerReportView).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import { EmployerReportView } from "@/components/assessment/result/EmployerReportView";
import { adminGetAssignmentReport } from "@/lib/job-intelligence/admin-assessment-assignments.functions";

export const Route = createFileRoute("/_authenticated/admin/results/$assignmentId")({
  ssr: false,
  component: AdminResultReportPage,
  errorComponent: AdminErrorState,
});

function AdminResultReportPage() {
  const { assignmentId } = Route.useParams();
  const { t, lang } = useT();
  const getReportFn = useServerFn(adminGetAssignmentReport);

  const q = useQuery({
    queryKey: ["admin", "result-report", assignmentId],
    queryFn: () => getReportFn({ data: { assignmentId } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="results">
        <Link to="/admin/results" className="text-sm font-medium text-accent hover:underline">
          ← {t("admin.results.detail.backToList")}
        </Link>

        <div className="mt-4">
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
          ) : q.isError || !q.data ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("admin.results.detail.notFound")}
            </div>
          ) : (
            <>
              <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4 text-sm">
                <p className="font-medium text-foreground">
                  {q.data.employeeName ?? q.data.recipientEmail}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {q.data.employerName} ·{" "}
                  {lang === "sv" ? q.data.assessmentNameSv : q.data.assessmentNameEn}
                  {q.data.jobTitleSv || q.data.jobTitleEn
                    ? ` · ${lang === "sv" ? q.data.jobTitleSv : q.data.jobTitleEn}`
                    : ""}
                </p>
              </div>
              <EmployerReportView
                result={q.data.engineResult}
                lang={lang}
                completedAt={q.data.completedAt}
                assessmentVersionLabel={q.data.assessmentVersionLabel}
              />
            </>
          )}
        </div>
      </AdminShellChrome>
    </SiteLayout>
  );
}
