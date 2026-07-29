// CANONICAL session route — /security-career-assessment/session
//
// Thin wrapper. The engine lives in DiscoverySessionView, shared with the
// temporary /discovery/session alias, so there is exactly one 26-question
// implementation.

import { createFileRoute } from "@tanstack/react-router";
import { DiscoverySessionView } from "@/components/career-discovery/DiscoverySessionView";
import {
  CANONICAL_REPORT_PATH,
  CANONICAL_SESSION_PATH,
} from "@/lib/career-discovery/routes";

export const Route = createFileRoute("/_authenticated/security-career-assessment/session")({
  validateSearch: (s: Record<string, unknown>) => ({ session: String(s.session ?? "") }),
  component: CanonicalSessionRoute,
});

function CanonicalSessionRoute() {
  const { session } = Route.useSearch();
  return (
    <DiscoverySessionView
      sessionId={session}
      sessionPath={CANONICAL_SESSION_PATH}
      reportPath={CANONICAL_REPORT_PATH}
    />
  );
}
