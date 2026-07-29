// TEMPORARY ALIAS — /discovery/session
//
// Redirects to the canonical session route, PRESERVING the session uuid.
// Losing it here would reproduce the exact dead end this branch fixes, so
// the search param is carried across and validated on arrival.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { CANONICAL_SESSION_PATH } from "@/lib/career-discovery/routes";
import { parseSessionId } from "@/lib/career-discovery/session-id";

export const Route = createFileRoute("/_authenticated/discovery/session")({
  validateSearch: (s: Record<string, unknown>) => ({ session: String(s.session ?? "") }),
  beforeLoad: ({ search }) => {
    // Carry a valid id across; drop a malformed one rather than propagate
    // it. The canonical route recovers from a missing id on its own.
    const sessionId = parseSessionId((search as { session?: unknown })?.session);
    throw redirect({
      to: CANONICAL_SESSION_PATH,
      search: (sessionId ? { session: sessionId } : {}) as never,
      replace: true,
    });
  },
});
