// Tester & bedömningar — Översikt.
//
// The operational summary for one organisation's recruitment assessments:
// what is running, what needs a person, what is waiting on the employer, what
// is done, and the one button that clears each of those. The page itself is
// the frame; AcademyOverview is the content.
//
// ── WHAT THIS PAGE NO LONGER CARRIES ──────────────────────────────────
//
// It used to render a second, older catalogue underneath the overview: a
// duplicate heading, two "use case" cards (one of them competence
// development, which belongs under Kompetensutveckling and not on a
// recruitment surface), an Operational/Strategic tab strip and a list. Every
// row behind it is employer_visible = false, so for a customer it was a
// heading, a subheading, four boxes and an empty list stacked under the part
// of the page that works.
//
// Testbibliotek is the library this area actually has, it is one tab away,
// and the older catalogue's detail route stays mounted for anything released
// through that engine — so nothing a customer can reach has been removed,
// only something they could not use.

import { createFileRoute } from "@tanstack/react-router";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyPage } from "@/components/academy/AcademyWorkspace";
import { AcademyOverview } from "@/components/academy/AcademyOverview";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/")({
  ssr: false,
  component: EmployerAssessmentsPage,
  errorComponent: EmployerErrorState,
});

function EmployerAssessmentsPage() {
  const { employerSlug } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => <AcademyOverview employerId={ws.employerId} employerSlug={ws.employerSlug} />}
    </AcademyPage>
  );
}
