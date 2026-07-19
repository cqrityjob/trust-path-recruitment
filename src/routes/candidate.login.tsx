import { createFileRoute } from "@tanstack/react-router";
import { PortalAuthForm } from "@/components/auth/PortalAuthForm";

// Phase H3.1 — candidate-specific login entry point.
// docs/auth/candidate-employer-portal-spec-v1.md §4.1.

export const Route = createFileRoute("/candidate/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Log in as a candidate — CQrityjob" },
      {
        name: "description",
        content: "Log in to continue to your career profile, tests, saved jobs, and applications.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <PortalAuthForm
      portal="candidate"
      mode="signin"
      headingKey="candidate.auth.signin.title"
      introKey="candidate.auth.signin.intro"
      defaultDestination="/my-career"
      swapModeTo="/candidate/register"
      otherPortalHref="/employer/login"
      otherPortalLabelKey="candidate.auth.signin.employerLink"
    />
  ),
});
