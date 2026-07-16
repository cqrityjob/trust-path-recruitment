import { createFileRoute, redirect } from "@tanstack/react-router";

// Permanent redirect from legacy /careers to /career-center.
export const Route = createFileRoute("/careers")({
  beforeLoad: () => {
    throw redirect({ to: "/career-center", replace: true });
  },
  component: () => null,
});