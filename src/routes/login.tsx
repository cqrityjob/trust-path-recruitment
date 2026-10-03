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
import { useLocalizedHead } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";

/** The head is the Swedish pair (the site's default, and what a crawler or a
 *  first paint sees); useLocalizedHead() swaps in the English one on the
 *  client, so the tab and the page agree. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: SV["meta.login.title"] },
      { name: "description", content: SV["meta.login.description"] },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  useLocalizedHead("meta.login.title", "meta.login.description");
  return <UnifiedAuthForm mode="signin" />;
}
