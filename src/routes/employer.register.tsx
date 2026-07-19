import { createFileRoute } from "@tanstack/react-router";
import { PortalAuthForm } from "@/components/auth/PortalAuthForm";

// Phase H3.1 — employer-specific registration entry point. Public, same
// static-vs-dynamic routing rationale as employer.login.tsx above.
// Creating the auth.users row here is distinct from creating a company
// (that happens at /employer/onboarding, right after this) — a user may
// register and abandon before naming a company, so the account must not
// require one to exist. Post-auth destination is "/employer", which
// (per the existing G2 index route, extended in H3.1) sends a
// zero-workspace user straight into onboarding.

export const Route = createFileRoute("/employer/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Create an employer account — CQrityjob" },
      {
        name: "description",
        content:
          "Create an employer account to publish jobs, manage recruitment, and order assessments.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <PortalAuthForm
      portal="employer"
      mode="signup"
      headingKey="employer.auth.signup.title"
      introKey="employer.auth.signup.intro"
      defaultDestination="/employer"
      swapModeTo="/employer/login"
      otherPortalHref="/candidate/register"
      otherPortalLabelKey="employer.auth.signup.candidateLink"
    />
  ),
});
