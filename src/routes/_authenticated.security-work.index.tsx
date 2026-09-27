import { createFileRoute } from "@tanstack/react-router";
import { SecurityWorkEntry } from "@/components/security-work/Entry";
export const Route = createFileRoute("/_authenticated/security-work/")({
  validateSearch: (search: Record<string, unknown>): { choose?: boolean } => ({
    choose: search.choose === true || search.choose === "true",
  }),
  component: SecurityWorkEntry,
});
