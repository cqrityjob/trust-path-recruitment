// THE public registration entrance.
//
// Minimal by design: a name, an email address and a password. Everything
// else is asked for by the product that needs it, when it needs it — the
// Passport asks for evidence, an application asks for application answers,
// Career Discovery asks its own questions. Collect once, structure once,
// reuse many times.
//
// The one disclosed exception is registering on behalf of an organisation,
// which is a collapsed section of THIS form rather than a second form. It
// grants nothing: it selects a post-signup destination and carries two
// strings into user metadata, and every permission is still derived from
// employer_memberships server-side.
//
// See docs/architecture/adr-unified-account-and-professional-identity.md.

import { createFileRoute } from "@tanstack/react-router";
import { UnifiedAuthForm } from "@/components/auth/UnifiedAuthForm";

export const Route = createFileRoute("/signup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Skapa konto — CQrityjob" },
      {
        name: "description",
        content:
          "Create a CQrityjob account — one account for your professional profile, Security Passport, assessments and job applications.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <UnifiedAuthForm mode="signup" />,
});
