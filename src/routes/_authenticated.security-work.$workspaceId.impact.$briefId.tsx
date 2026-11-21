import { createFileRoute } from "@tanstack/react-router";
import { SecurityBriefDetail } from "@/components/security-work/impact/BriefDetail";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/impact/$briefId")({
  component: function BriefRoute() {
    const { briefId } = Route.useParams();
    // Keyed so moving to a revision never shows the previous brief's form state.
    return <SecurityBriefDetail key={briefId} briefId={briefId} />;
  },
});
