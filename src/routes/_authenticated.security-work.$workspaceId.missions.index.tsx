import { createFileRoute } from "@tanstack/react-router";
import { SecurityMissions } from "@/components/security-work/missions/Missions";
import { offeredMissionKinds, type MissionKind } from "@/lib/security-work/missions/model";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/missions/")({
  validateSearch: (search: Record<string, unknown>): { new?: MissionKind } => ({
    new: offeredMissionKinds.includes(search.new as MissionKind)
      ? (search.new as MissionKind)
      : undefined,
  }),
  component: function MissionsRoute() {
    const { new: kind } = Route.useSearch();
    return <SecurityMissions key={kind ?? "list"} startWith={kind} />;
  },
});
