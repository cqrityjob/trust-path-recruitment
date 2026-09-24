import { createFileRoute } from "@tanstack/react-router";
import { SecurityOverview } from "@/components/security-work/Overview";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/")({
  component: SecurityOverview,
});
