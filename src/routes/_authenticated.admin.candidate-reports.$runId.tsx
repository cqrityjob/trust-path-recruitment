// Employer Report MVP (Public Assessment v2.0, Phase E) -- admin-only
// preview route. Nested under /_authenticated/admin, which already gates
// on is_platform_admin() (see _authenticated.admin.tsx). See
// src/lib/job-intelligence/candidate-report.functions.ts for the scoping
// rationale: this previews report content/format for testing, it is not a
// general employer self-service sharing feature.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";
import { adminGetCandidateReport } from "@/lib/job-intelligence/candidate-report.functions";
import { EmployerReportView } from "@/components/assessment/result/EmployerReportView";

export const Route = createFileRoute("/_authenticated/admin/candidate-reports/$runId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Candidate Report Preview — CQrityjob Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminCandidateReportPreview,
});

function AdminCandidateReportPreview() {
  const { runId } = Route.useParams();
  const { lang } = useT();
  const getReport = useServerFn(adminGetCandidateReport);
  const q = useQuery({
    queryKey: ["admin", "candidate-report", runId],
    queryFn: () => getReport({ data: { runId } }),
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-sm text-muted-foreground">
          {lang === "sv" ? "Laddar…" : "Loading…"}
        </div>
      </SiteLayout>
    );
  }

  if (q.isError || !q.data?.run || !q.data?.report) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-sm text-muted-foreground">
          {lang === "sv"
            ? "Ingen rapport hittades för denna bedömning."
            : "No report found for this assessment run."}
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <EmployerReportView
        result={q.data.report.engineResult}
        lang={lang}
        completedAt={q.data.run.completedAt}
        assessmentVersionLabel={q.data.report.reportVersion}
      />
    </SiteLayout>
  );
}
