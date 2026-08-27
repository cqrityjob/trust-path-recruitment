// Layout-only route, matching the pattern used by the other employer modules.
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence",
)({
  ssr: false,
  component: () => <Outlet />,
  errorComponent: EmployerErrorState,
});
