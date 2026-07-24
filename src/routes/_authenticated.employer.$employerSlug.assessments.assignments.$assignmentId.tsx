// Employer-authorised assignment result report.
//
// Reuses EmployerReportView unchanged -- purely presentational, fed by
// getEmployerAssignmentReport's already-computed, cached EngineResultV1.
// No re-scoring, no second report implementation.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { EmployerReportView } from "@/components/assessment/result/EmployerReportView";
import { getEmployerAssignmentReport } from "@/lib/job-intelligence/assessment-assignments.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/assignments/$assignmentId",
)({
  ssr: false,
  component: EmployerAssignmentReportPage,
  errorComponent: EmployerErrorState,
});

function EmployerAssignmentReportPage() {
  const { employerSlug, assignmentId } = Route.useParams();
  const { t } = useT();
  const ws = useEmployerWorkspace(employerSlug);

  if (!ws.portalEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }
  if (ws.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }
  if (ws.isError || !ws.workspace) {
    return <EmployerAccessDenied workspaces={ws.workspaces} />;
  }

  return (
    <ReportBody
      employerId={ws.workspace.employerId}
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
      assignmentId={assignmentId}
    />
  );
}

function ReportBody({
  employerId,
  employerSlug,
  employerName,
  role,
  status,
  hasMultipleWorkspaces,
  assignmentId,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
  assignmentId: string;
}) {
  const { t, lang } = useT();
  const getReportFn = useServerFn(getEmployerAssignmentReport);

  const query = useQuery({
    queryKey: ["employer", employerId, "assignment-report", assignmentId],
    queryFn: () => getReportFn({ data: { employerId, assignmentId } }),
  });

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="assessments"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <Link
        to="/employer/$employerSlug/assessments/assignments"
        params={{ employerSlug }}
        className="text-sm font-medium text-accent hover:underline"
      >
        ← {t("assignment.report.back")}
      </Link>

      <div className="mt-4">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : query.isError || !query.data ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            {t("assignment.report.notFound")}
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <p className="font-medium text-foreground">
                {query.data.employeeName ?? query.data.recipientEmail}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {lang === "sv" ? query.data.assessmentNameSv : query.data.assessmentNameEn}
                {query.data.jobTitleSv || query.data.jobTitleEn
                  ? ` · ${lang === "sv" ? query.data.jobTitleSv : query.data.jobTitleEn}`
                  : ""}
              </p>
            </div>
            <EmployerReportView
              result={query.data.engineResult}
              lang={lang}
              completedAt={query.data.completedAt}
              assessmentVersionLabel={query.data.assessmentVersionLabel}
            />
          </>
        )}
      </div>
    </EmployerAppShell>
  );
}
