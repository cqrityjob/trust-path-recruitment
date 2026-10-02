import { createFileRoute } from "@tanstack/react-router";
import { SecurityBaselinePage } from "@/components/security-work/Baseline";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/baseline")({
  component: SecurityBaselinePage,
});
