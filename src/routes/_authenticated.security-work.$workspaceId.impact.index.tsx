import { createFileRoute } from "@tanstack/react-router";
import { SecurityImpact } from "@/components/security-work/impact/Impact";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/impact/")({
  component: SecurityImpact,
});
