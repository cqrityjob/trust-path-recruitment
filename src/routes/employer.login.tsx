// COMPATIBILITY REDIRECT — superseded by the unified entrance.
//
// /employer/login was a public route for ten months and is bookmarked, indexed and
// linked from mail already sent, so it keeps working. It renders nothing and
// resolves in `beforeLoad`, so there is no form to flash and no second
// authentication implementation living on behind a redirect.
//
// The validated `redirect` parameter travels with it; `intent` does not,
// because there is one door now and intent was never a permission. See
// docs/architecture/adr-unified-account-and-professional-identity.md and
// src/lib/auth/legacy-entry.ts.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { unifiedAuthHref } from "@/lib/auth/legacy-entry";

export const Route = createFileRoute("/employer/login")({
  ssr: false,
  beforeLoad: ({ location }) => {
    throw redirect({ href: unifiedAuthHref("signin", location.searchStr ?? ""), replace: true });
  },
});
