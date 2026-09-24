import { createFileRoute } from "@tanstack/react-router";
import { SecurityReportDetail } from "@/components/security-work/Reports";
export const Route = createFileRoute(
  "/_authenticated/security-work/$workspaceId/reports/$reportId",
)({ component: Page });
function Page() {
  const { reportId } = Route.useParams();
  return <SecurityReportDetail key={reportId} reportId={reportId} />;
}
