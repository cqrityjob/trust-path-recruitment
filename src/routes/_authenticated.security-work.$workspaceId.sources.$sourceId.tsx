import { createFileRoute } from "@tanstack/react-router";
import { SecuritySourceDetailPage } from "@/components/security-work/SourceDetail";
export const Route = createFileRoute(
  "/_authenticated/security-work/$workspaceId/sources/$sourceId",
)({ component: SourceRoute });
function SourceRoute() {
  const { sourceId } = Route.useParams();
  return <SecuritySourceDetailPage key={sourceId} sourceId={sourceId} />;
}
