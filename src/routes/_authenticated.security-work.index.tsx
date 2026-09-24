import { createFileRoute } from "@tanstack/react-router";
import { SecurityWorkEntry } from "@/components/security-work/Entry";
export const Route = createFileRoute("/_authenticated/security-work/")({
  component: SecurityWorkEntry,
});
