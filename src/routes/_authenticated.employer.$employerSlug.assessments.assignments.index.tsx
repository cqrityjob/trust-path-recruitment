// RETIRED — legacy assessment-engine assignment list.
//
// This list read the retired engine's assessment_assignments rows with their
// legacy status vocabulary and offered "cancel" on them. No navigation reached
// it any more (its only inbound links were the two other retired routes), and
// the current recruitment list -- Kandidater, under the Assessment Center --
// is where an employer follows the people they have assessed. A direct visit
// goes there.
//
// The per-assignment historical result viewer next to this file
// (assessments/assignments/$assignmentId) is NOT retired: Workforce still
// links to it for a completed legacy assignment, and the rows it reads are
// retired, not deleted.
//
// Guarded by scripts/legacy-assessment-route-guard-check.ts.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/assignments/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/employer/$employerSlug/assessments/participants",
      params: { employerSlug: params.employerSlug },
      replace: true,
    });
  },
  component: () => null,
});
