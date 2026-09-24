import { createFileRoute } from "@tanstack/react-router";
import { SecurityWorkspaceProvider } from "@/components/security-work/context";
import { SecurityWorkLayout } from "@/components/security-work/SecurityWorkLayout";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId")({
  component: WorkspaceRoute,
});
function WorkspaceRoute() {
  const { workspaceId } = Route.useParams();
  return (
    <SecurityWorkspaceProvider key={workspaceId} workspaceId={workspaceId}>
      <SecurityWorkLayout />
    </SecurityWorkspaceProvider>
  );
}
