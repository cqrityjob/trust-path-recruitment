// Testbibliotek — the assessment side of the governed content library.
//
// Training programmes are the same read model and the same component, rendered
// under Kompetensutveckling instead. Keeping them out of here is the product
// separation: Tester answers what structured assessment a person completed and
// what evidence it produced, and a development programme answers neither.

import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyPage } from "@/components/academy/AcademyWorkspace";
import { ContentLibrary } from "@/components/academy/ContentLibrary";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/library")({
  ssr: false,
  component: LibraryRoute,
  errorComponent: EmployerErrorState,
});

function LibraryRoute() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => (
        <ContentLibrary
          employerId={ws.employerId}
          canAssign={ws.role !== "member"}
          kind="assessment"
          title={t("academy.library.title")}
          lede={t("academy.library.lede")}
        />
      )}
    </AcademyPage>
  );
}
