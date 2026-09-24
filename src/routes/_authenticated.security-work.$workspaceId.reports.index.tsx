import { createFileRoute } from "@tanstack/react-router";
import { SecurityReports } from "@/components/security-work/Reports";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/reports/")({
  component: SecurityReports,
});
