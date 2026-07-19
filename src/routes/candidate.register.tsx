import { createFileRoute } from "@tanstack/react-router";
import { PortalAuthForm } from "@/components/auth/PortalAuthForm";

// Phase H3.1 — candidate-specific registration entry point.
// docs/auth/candidate-employer-portal-spec-v1.md §4.2.

export const Route = createFileRoute("/candidate/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Create a candidate account — CQrityjob" },
      {
        name: "description",
        content:
          "Create a candidate account to take assessments, build your career profile, and apply to security-sector jobs.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <PortalAuthForm
      portal="candidate"
      mode="signup"
      headingKey="candidate.auth.signup.title"
      introKey="candidate.auth.signup.intro"
      defaultDestination="/my-career"
      swapModeTo="/candidate/login"
      otherPortalHref="/employer/register"
      otherPortalLabelKey="candidate.auth.signup.employerLink"
    />
  ),
});
