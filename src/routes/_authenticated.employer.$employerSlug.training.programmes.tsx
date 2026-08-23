// Program — the training side of the governed content library.
//
// Same component and same read model as Testbibliotek, filtered to training.
// This is where Utvecklingsprogram lives now: it used to be the fifth tab
// inside Tester, rendering learning modules in the assessment workspace.
//
// The assignment flow lives inside programme detail, where it already worked,
// rather than being lifted out into a separate step for symmetry.

import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { TrainingPage } from "@/components/academy/AcademyWorkspace";
import { ContentLibrary } from "@/components/academy/ContentLibrary";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/training/programmes")({
  ssr: false,
  component: TrainingProgrammesRoute,
  errorComponent: EmployerErrorState,
});

function TrainingProgrammesRoute() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  return (
    <TrainingPage employerSlug={employerSlug}>
      {(ws) => (
        <ContentLibrary
          employerId={ws.employerId}
          canAssign={ws.role !== "member"}
          area="workforce"
          title={t("training.programmes.title")}
          lede={t("training.programmes.lede")}
        />
      )}
    </TrainingPage>
  );
}
