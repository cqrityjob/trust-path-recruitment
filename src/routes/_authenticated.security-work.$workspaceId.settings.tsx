import { createFileRoute } from "@tanstack/react-router";
import { SecurityProfilePage } from "@/components/security-work/Profile";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/settings")({
  component: SecurityProfilePage,
});
