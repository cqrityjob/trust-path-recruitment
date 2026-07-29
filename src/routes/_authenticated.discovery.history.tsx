// TEMPORARY ALIAS — /discovery/history must not become a second permanent
// report hub. Redirects to the canonical history.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { CANONICAL_HISTORY_PATH } from "@/lib/career-discovery/routes";

export const Route = createFileRoute("/_authenticated/discovery/history")({
  beforeLoad: () => {
    throw redirect({ to: CANONICAL_HISTORY_PATH, replace: true });
  },
});
