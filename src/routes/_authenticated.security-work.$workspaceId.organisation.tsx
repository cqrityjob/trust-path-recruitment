import { createFileRoute } from "@tanstack/react-router";
import { SecurityOrganisation } from "@/components/security-work/settings/Organisation";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/organisation")({
  component: SecurityOrganisation,
});
