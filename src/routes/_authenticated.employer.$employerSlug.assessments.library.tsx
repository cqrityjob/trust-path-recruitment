// Bibliotek — Tester & intervjuer.
//
// METHOD → ROLE → WORK ENVIRONMENT → SETUP → START (TRUST/BESKT product
// structure v2.0). TRUST and BESKT are the two entrances, side by side and of
// equal weight; the Väktare test lives inside TRUST's operational setup, not
// beside the two methods. The choices ride the URL, so Back steps back through
// them instead of discarding the setup. See src/components/library/.

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
      {(ws) => (
        <RecruitmentLibrary
          employerId={ws.employerId}
          employerSlug={employerSlug}
          canAssign={ws.role !== "member"}
          canManage={ws.role === "owner" || ws.role === "admin"}
          search={search}
        />
      )}
    </AcademyPage>
  );
}
