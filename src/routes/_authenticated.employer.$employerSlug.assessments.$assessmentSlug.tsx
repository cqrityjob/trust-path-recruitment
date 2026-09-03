// RETIRED — legacy assessment-engine catalogue detail page.
//
// This page described one definition of the retired engine (legacy
// `assessments` table) and linked into the retired assign wizard. The only
// definition it could show, security-guard-foundation, is employer_visible =
// false, so the page had nothing to show and nothing led to it. The current
// catalogue is the Assessment Center library, whose detail view says what a
// programme is evidence about and what it does not establish. A direct visit
// goes there.
//
// This is a dynamic segment, so it also catches any unknown
// /assessments/<something> address. Sending those to the library rather than
// to a bare 404 is deliberate: the static Assessment Center routes (library,
// participants, reviews, results, assignments/$id) match before this one, so
// the only thing that lands here is an address that does not exist.
//
// Guarded by scripts/legacy-assessment-route-guard-check.ts.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/$assessmentSlug",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/employer/$employerSlug/assessments/library",
      params: { employerSlug: params.employerSlug },
      replace: true,
    });
  },
  component: () => null,
});
