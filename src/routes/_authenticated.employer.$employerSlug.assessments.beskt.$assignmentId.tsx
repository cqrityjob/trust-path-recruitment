// One BESKT assignment under Tester & bedömningar — reached from the BESKT
// module in Testbibliotek, whichever entrance started it.

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyPage } from "@/components/academy/AcademyWorkspace";
import { BesktAssignmentView } from "@/components/beskt/BesktAssignmentView";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/beskt/$assignmentId",
)({
  ssr: false,
  component: AssignmentRoute,
  errorComponent: EmployerErrorState,
});

function AssignmentRoute() {
  const { employerSlug, assignmentId } = Route.useParams();
  const { t } = useT();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => (
        <div className="mx-auto max-w-3xl">
          <Link
            to="/employer/$employerSlug/assessments/library"
            params={{ employerSlug }}
            className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm underline-offset-2 hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t("beskt.assignment.back")}
          </Link>
          <BesktAssignmentView
            employerId={ws.employerId}
            employerSlug={employerSlug}
            assignmentId={assignmentId}
          />
        </div>
      )}
    </AcademyPage>
  );
}
