import { createFileRoute } from "@tanstack/react-router";
import { SecurityMandatePage } from "@/components/security-work/Mandate";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/mandate")({
  component: SecurityMandatePage,
});
