// TEMPORARY ALIAS — /discovery
//
// The implementation-phase route. It is not the product architecture: the
// canonical route is /security-career-assessment. This redirects there and
// renders nothing, so /discovery can never become a second competing
// product surface.
//
// Loop safety: the target is a CANONICAL path constant, and
// isCanonicalPath() is asserted in the guard suite. An alias may never
// redirect to another alias.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";

export const Route = createFileRoute("/discovery")({
  beforeLoad: () => {
    throw redirect({ to: CANONICAL_ASSESSMENT_PATH, replace: true });
  },
});
