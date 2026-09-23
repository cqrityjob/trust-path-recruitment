// Program — the training side of the governed content library.
//
// Same component and same read model as Testbibliotek, filtered to training.
// This is where Utvecklingsprogram lives now: it used to be the fifth tab
// inside Tester, rendering learning modules in the assessment workspace.
//
// The assignment flow lives inside programme detail, where it already worked,
// rather than being lifted out into a separate step for symmetry.
//
// ── WHY THIS ROUTE TAKES AN EMPLOYEE ────────────────────────────────────
//
// "Assign a development programme" on an employee used to land here carrying
// nothing, so the employer chose a programme and was then asked to type the
// address of the colleague whose page they had just left. `?employee=<id>` is
// the person travelling with the navigation: the library assigns through the
// employee-bound path, the server resolves who they are from the employment
// record, and the way back is drawn at the top of the page so the flow returns
// where it started.
//
// A product-level identifier and never a subject. `catch` rather than a hard
// failure: a stale link shows the ordinary catalogue.

import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { TrainingPage } from "@/components/academy/AcademyWorkspace";
import { ContentLibrary } from "@/components/academy/ContentLibrary";

const searchSchema = z.object({
  employee: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/training/programmes")({
  ssr: false,
  component: TrainingProgrammesRoute,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

function TrainingProgrammesRoute() {
  const { employerSlug } = Route.useParams();
  const { employee } = Route.useSearch();
  const { t } = useT();
  return (
    <TrainingPage employerSlug={employerSlug}>
      {(ws) => (
        <>
          {employee && (
            <Link
              to="/employer/$employerSlug/workforce/$personId"
              params={{ employerSlug, personId: employee }}
              className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("academy.assign.employee.backToPerson")}
            </Link>
          )}
          <ContentLibrary
            employerId={ws.employerId}
            canAssign={ws.role !== "member"}
            area="workforce"
            title={t("training.programmes.title")}
            lede={t("training.programmes.lede")}
            employeeId={employee ?? null}
          />
        </>
      )}
    </TrainingPage>
  );
}
