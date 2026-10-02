import { createFileRoute } from "@tanstack/react-router";
import { SecurityPlanPage } from "@/components/security-work/Plan";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/plan")({
  component: SecurityPlanPage,
});
