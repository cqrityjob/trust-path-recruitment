import { createFileRoute } from "@tanstack/react-router";
import { SecurityAssetsPage } from "@/components/security-work/Assets";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/assets")({
  component: SecurityAssetsPage,
});
