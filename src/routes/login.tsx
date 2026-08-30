// THE public sign-in entrance.
//
// One door, for everybody. The audience-specific routes that preceded it
// (/candidate/login, /employer/login) are compatibility redirects onto this
// one, and /auth has been a redirect since H3.1. See
// docs/architecture/adr-unified-account-and-professional-identity.md.
//
// noindex, like every other auth surface here: a sign-in form has nothing
// for a search engine, and indexing one produces support tickets from
// people who arrived at a login wall from a search result.

import { createFileRoute } from "@tanstack/react-router";
import { UnifiedAuthForm } from "@/components/auth/UnifiedAuthForm";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Logga in — CQrityjob" },
      {
        name: "description",
        content:
          "Log in to CQrityjob — your professional identity, career development and verified credentials in one place.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <UnifiedAuthForm mode="signin" />,
});
