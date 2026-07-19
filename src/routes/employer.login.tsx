import { createFileRoute } from "@tanstack/react-router";
import { PortalAuthForm } from "@/components/auth/PortalAuthForm";

// Phase H3.1 — employer-specific login entry point. Public/unauthenticated
// — NOT under the `_authenticated` layout — because a signed-out user must
// be able to reach it. Deliberately a static top-level route
// (src/routes/employer.login.tsx, no "_authenticated." prefix), distinct
// from the authenticated `_authenticated.employer.$employerSlug.tsx`
// dynamic-slug route — TanStack Router ranks the static "/employer/login"
// path above the "$employerSlug" parameter match at the same depth, so
// "login" is never mistaken for a workspace slug. Verified against the
// generated route tree as part of this phase's own testing.
//
// Post-auth destination is simply "/employer" — the existing G2 index
// route already contains the correct 0/1/2+ workspace branching logic
// (now including the H3.1 zero-workspace -> onboarding redirect); this
// route deliberately does not duplicate that logic.

export const Route = createFileRoute("/employer/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Log in as an employer — CQrityjob" },
      {
        name: "description",
        content:
          "Manage job listings, recruitment, candidates, and assessments in CQrityjob's employer portal.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <PortalAuthForm
      portal="employer"
      mode="signin"
      headingKey="employer.auth.signin.title"
      introKey="employer.auth.signin.intro"
      defaultDestination="/employer"
      swapModeTo="/employer/register"
      otherPortalHref="/candidate/login"
      otherPortalLabelKey="employer.auth.signin.candidateLink"
    />
  ),
});
