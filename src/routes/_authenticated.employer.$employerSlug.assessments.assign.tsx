// RETIRED — legacy assessment-engine assign wizard.
//
// ── WHY THIS IS A REDIRECT ──────────────────────────────────────────────
//
// This route used to host the token-based assign wizard of the retired
// assessment engine (legacy `assessments` / `assessment_versions` tables). Its
// only catalogue definition, security-guard-foundation, was retired in July
// 2026 and every version carries retired_at; a BEFORE INSERT trigger on
// assessment_assignments refuses assignment to a retired version. So a form
// here could be filled in and never sent. Nothing in the product linked to it
// any more; it was reachable only by typing the URL.
//
// Assignment now happens in the Assessment Center: an employer picks a
// programme in the library and invites the candidate from there (the Väktare
// journey, scp_employer_assign / scp_invite_participant). That is where a
// direct visit lands. Deliberately NOT a second assignment surface and NOT a
// bare 404: the address still means "I want to assign something".
//
// The legacy server functions in src/lib/job-intelligence/
// assessment-assignments.functions.ts are untouched -- the historical result
// viewer (assessments/assignments/$assignmentId) and the My Career linking
// step still read the legacy rows, which are retired, not deleted.
//
// Guarded by scripts/legacy-assessment-route-guard-check.ts.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/assign")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/employer/$employerSlug/assessments/library",
      params: { employerSlug: params.employerSlug },
      replace: true,
    });
  },
  component: () => null,
});
