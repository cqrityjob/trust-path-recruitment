// Which of this organisation's applications have an assessment still open.
//
// ── WHY IT IS ASSEMBLED RATHER THAN QUERIED ─────────────────────────────
//
// There is no read model that answers "the assessment state of the
// applications on job X", and inventing one would mean a hosted migration for
// a number two existing reads already contain between them:
//
//   scp_employer_assessment_pipeline   one row per attempt, with its lifecycle
//                                      state and the ASSIGNMENT behind it
//   assessment_assignments             assignment -> application, RLS-scoped
//                                      to an active member
//
// Join the two and every application in the organisation carries the state of
// its assessments. Both reads are employer-wide and both already happen
// elsewhere in the product, so the pair is fetched on the SAME cache keys the
// assessment workspace and the participants list use: no extra request where
// one of those surfaces has already been open, and never a second set of
// numbers that can disagree with theirs.
//
// ── WHY A HOOK AND NOT A SERVER FUNCTION ────────────────────────────────
//
// Adding a server function would mean a third read of the same rows and a
// third place for the lifecycle vocabulary to live. This composes what exists.
// Nothing here is an authorisation: both underlying reads are scoped by the
// database to an active member of the organisation, and this only intersects
// their results.
//
// ── AND WHY THE READ STATE TRAVELS WITH THE ANSWER ──────────────────────
//
// Two reads, two ways to fail, and a set that is empty because a read failed
// looks exactly like a set that is empty because nobody is being assessed. So
// the state comes back beside the ids and every caller is forced to decide
// what to draw for `failed` -- which is how "could not be loaded" stops
// turning into a zero.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEmployerAssessmentPipeline } from "@/lib/security-competency/assessment-lifecycle.functions";
import { listAssignmentApplications } from "@/lib/security-competency/academy-employer.functions";
import { assessmentIsOpen, type PipelineRead } from "./job-pipeline";

export interface OpenAssessmentApplications {
  readonly read: PipelineRead;
  /** Application ids whose assessment exists and has not produced a released
   *  result. Empty and meaningless unless `read` is "ready". */
  readonly ids: ReadonlySet<string>;
}

export function useOpenAssessmentApplications(
  employerId: string,
  /** Off by default at every call site that does not need it, so a surface
   *  that never shows an assessment number never pays for one. */
  enabled: boolean,
): OpenAssessmentApplications {
  const pipelineFn = useServerFn(getEmployerAssessmentPipeline);
  const mappingFn = useServerFn(listAssignmentApplications);

  const pipeline = useQuery({
    // The assessment workspace's own key. One fetch, one set of numbers.
    queryKey: ["academy", "participants", employerId],
    queryFn: () => pipelineFn({ data: { employerId } }),
    enabled,
  });
  const mapping = useQuery({
    queryKey: ["academy", "assignment-applications", employerId],
    queryFn: () => mappingFn({ data: { employerId } }),
    enabled,
  });

  if (!enabled) return { read: "loading", ids: new Set() };
  if (pipeline.isError || mapping.isError) return { read: "failed", ids: new Set() };
  if (pipeline.isLoading || mapping.isLoading) return { read: "loading", ids: new Set() };

  const applicationOf = mapping.data ?? {};
  const ids = new Set<string>();
  for (const row of pipeline.data ?? []) {
    // Recruitment attempts only. A colleague's development assessment is a
    // different purpose with a different lawful basis, and counting it on a
    // vacancy's pipeline would be exactly the flattening the two-participation
    // model exists to prevent.
    if (row.useCase !== "recruitment") continue;
    if (!row.assignmentId) continue;
    if (!assessmentIsOpen(row.lifecycleState)) continue;
    const applicationId = applicationOf[row.assignmentId];
    if (applicationId) ids.add(applicationId);
  }
  return { read: "ready", ids };
}
