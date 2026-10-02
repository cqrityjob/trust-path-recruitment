import { createFileRoute } from "@tanstack/react-router";
import { SecurityGapsPage } from "@/components/security-work/Gaps";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/gaps")({
  component: SecurityGapsPage,
});
