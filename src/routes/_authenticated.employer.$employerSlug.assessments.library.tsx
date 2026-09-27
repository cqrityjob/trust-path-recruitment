import { TestBank } from "@/components/recruitment/TestBank";
// Default: the test bank. The separate guides view retains TRUST/BESKT
// method choices and all existing deep links and Back navigation.

import { createFileRoute } from "@tanstack/react-router";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyPage } from "@/components/academy/AcademyWorkspace";
import { RecruitmentLibrary, type LibrarySearch } from "@/components/library/RecruitmentLibrary";
import { isEnvironment, isMethod, isRoleGroup, isRoleProfile } from "@/lib/library/catalogue";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/library")({
  ssr: false,
  component: LibraryRoute,
  errorComponent: EmployerErrorState,
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    ...(search.view === "guides" ? { view: "guides" as const } : {}),
    ...(isMethod(search.method) ? { method: search.method } : {}),
    ...(isRoleGroup(search.group) ? { group: search.group } : {}),
    ...(isRoleProfile(search.role) ? { role: search.role } : {}),
    ...(isEnvironment(search.env) ? { env: search.env } : {}),
  }),
});

function LibraryRoute() {
  const { employerSlug } = Route.useParams();
  const search = Route.useSearch();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) =>
        !search.method && search.view !== "guides" ? (
          <TestBank employerId={ws.employerId} employerSlug={employerSlug} />
        ) : (
          <RecruitmentLibrary
            employerId={ws.employerId}
            employerSlug={employerSlug}
            canAssign={ws.role !== "member"}
            canManage={ws.role === "owner" || ws.role === "admin"}
            search={search}
          />
        )
      }
    </AcademyPage>
  );
}
