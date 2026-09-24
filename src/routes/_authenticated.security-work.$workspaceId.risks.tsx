import { createFileRoute } from "@tanstack/react-router";
import { SecurityRisksActions } from "@/components/security-work/RisksActions";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/risks")({
  component: SecurityRisksActions,
});
