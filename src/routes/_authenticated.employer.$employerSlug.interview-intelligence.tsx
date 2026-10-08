// Layout-only route, matching the pattern used by the other employer modules.
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { CaseContentBoundary } from "@/components/employer/interview/CaseContentBoundary";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence",
)({
  ssr: false,
  component: InterviewContentLayout,
  errorComponent: EmployerErrorState,
});

function InterviewContentLayout() {
  const { employerSlug } = Route.useParams();
  const { caseId } = useParams({ strict: false });
  return caseId ? (
    <CaseContentBoundary caseId={caseId} employerSlug={employerSlug}>
      <Outlet />
    </CaseContentBoundary>
  ) : (
    <Outlet />
  );
}
