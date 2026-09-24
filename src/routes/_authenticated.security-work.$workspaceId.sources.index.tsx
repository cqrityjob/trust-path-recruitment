import { createFileRoute } from "@tanstack/react-router";
import { SecuritySourcesPage } from "@/components/security-work/Sources";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/sources/")({
  component: SecuritySourcesPage,
});
