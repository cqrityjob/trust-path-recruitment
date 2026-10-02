import { createFileRoute } from "@tanstack/react-router";
import { SecurityManagementReportPage } from "@/components/security-work/ManagementReport";
export const Route = createFileRoute(
  "/_authenticated/security-work/$workspaceId/reports/management/$reportId",
)({ component: Page });
function Page() {
  const { reportId } = Route.useParams();
  return <SecurityManagementReportPage key={reportId} reportId={reportId} />;
}
