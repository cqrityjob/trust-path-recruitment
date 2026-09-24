import { createFileRoute } from "@tanstack/react-router";
import { SecurityAnalysisDetail } from "@/components/security-work/AnalysisDetail";
export const Route = createFileRoute(
  "/_authenticated/security-work/$workspaceId/analyses/$analysisId",
)({ component: Page });
function Page() {
  const { analysisId } = Route.useParams();
  return <SecurityAnalysisDetail key={analysisId} analysisId={analysisId} />;
}
