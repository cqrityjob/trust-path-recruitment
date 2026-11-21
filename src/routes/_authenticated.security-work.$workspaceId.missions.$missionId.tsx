import { createFileRoute } from "@tanstack/react-router";
import { SecurityMissionDetail } from "@/components/security-work/missions/MissionDetail";
export const Route = createFileRoute(
  "/_authenticated/security-work/$workspaceId/missions/$missionId",
)({
  component: function MissionRoute() {
    const { missionId } = Route.useParams();
    // Keyed so switching missions never shows the previous one's state.
    return <SecurityMissionDetail key={missionId} missionId={missionId} />;
  },
});
