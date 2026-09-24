import { createFileRoute } from "@tanstack/react-router";
import { SecurityMonitoringPage } from "@/components/security-work/Monitoring";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/monitoring")({
  component: SecurityMonitoringPage,
});
