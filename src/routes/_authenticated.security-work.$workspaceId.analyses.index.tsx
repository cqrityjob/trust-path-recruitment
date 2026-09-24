import { createFileRoute } from "@tanstack/react-router";
import { SecurityAnalyses } from "@/components/security-work/Analyses";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/analyses/")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === "true",
  }),
  component: SecurityAnalyses,
});
