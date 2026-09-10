/**
 * E2 assessment-release negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * The E2 guard asserts that the release action opens the exact attempt it
 * chose, that the recruiter is told what the candidate will and will not
 * receive, that a write is not a success until a read says so, and that the
 * preview is the candidate's own document. None of those assertions, on its
 * own, proves it would NOTICE if the property stopped holding: a regex that no
 * longer matches, a table test over a union that lost a member, or an
 * assertion whose subject was renamed all go on printing "ok".
 *
 * Each mutation below introduces exactly one of the defects E2 exists to
 * prevent -- the real defect, in the real file, in the shape a careless edit
 * would actually produce -- and requires a named guard to fail with a named
 * diagnostic. Several are the ORIGINAL defect restored verbatim: the
 * destination that named a filter, the success printed without a read-back,
 * the preview that re-rendered rather than reproduced.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:assessment-release
 */

import { runControls, type Mutation } from "./runner";

const RELEASE = "src/lib/employer-continuity/assessment-release.ts";
const PROJECTION = "src/lib/employer-continuity/process-projection.ts";
const STRIP = "src/components/employer/ProcessContinuityStrip.tsx";
const ROUTE = "src/routes/_authenticated.employer.$employerSlug.assessments.participants.tsx";
const PREVIEW = "src/components/academy/CandidateCopyPreview.tsx";
const CANDIDATE_ROUTE = "src/routes/_authenticated.academy.report.$attemptId.tsx";
const MIGRATION = "supabase/migrations/20261105090000_scp_participant_report_issuer_preview.sql";
const DICT = "src/i18n/dictionaries.ts";

const E2 = "employer-assessment-release:check";
const E1 = "employer-process-continuity:check";
const SQLSEC = "sql-security:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- The destination that named a set --------------------------- */
  {
    id: "E2-DESTINATION-DROPS-THE-ATTEMPT",
    defect:
      "THE ORIGINAL DEFECT: the release action links to a filtered list again, discarding the attempt the ladder just chose",
    file: STRIP,
    find: 'search={{ state: "ready_to_release" as const, attempt: destination.attemptId }}',
    replace: 'search={{ state: "ready_to_release" as const }}',
    guard: E2,
    expect: "and the exact attempt travels in it",
  },
  {
    id: "E2-DESTINATION-NAMES-THE-WRONG-ATTEMPT",
    defect:
      "the release action opens the attempt the ROW names rather than the one whose brief is ready — the presentation record used as a destination",
    file: PROJECTION,
    find: '      destination: { kind: "assessmentParticipants", attemptId: assessment.releaseAttemptId },',
    replace:
      '      destination: { kind: "assessmentParticipants", attemptId: assessment.presentationAttemptId ?? "" },',
    guard: E1,
    expect: "attempt destination field presentationAttemptId is an action target",
  },
  {
    id: "E2-ROUTE-IGNORES-THE-ATTEMPT",
    defect:
      "the participants route stops validating the attempt, so the link carries a parameter the destination discards",
    file: ROUTE,
    find: "  attempt: z.string().uuid().catch(undefined as unknown as string).optional(),",
    replace: "",
    guard: E2,
    expect: "the participants route validates the attempt as a uuid",
  },

  /* ---- Focus resolved against the wrong set ----------------------- */
  {
    id: "E2-FOCUS-AGAINST-THE-FILTERED-VIEW",
    defect:
      "focus is resolved against the FILTERED rows, so a chip that merely hides the record is reported as the record not existing",
    file: ROUTE,
    find: "    return orderWithFocus(sorted, recruitment, focusAttempt(search.attempt, recruitment));",
    replace: "    return orderWithFocus(sorted, sorted, focusAttempt(search.attempt, sorted));",
    guard: E2,
    expect: "focus is never resolved against the filtered view",
  },
  {
    id: "E2-UNREACHABLE-BECOMES-NO-REQUEST",
    defect:
      "a link naming an attempt this employer cannot see is silently downgraded to 'no record requested', so the list looks perfectly ordinary",
    file: RELEASE,
    find: '  return rows.some((r) => r.attemptId === requested)\n    ? { kind: "focused", attemptId: requested }\n    : { kind: "notInReach", attemptId: requested };',
    replace:
      '  return rows.some((r) => r.attemptId === requested)\n    ? { kind: "focused", attemptId: requested }\n    : { kind: "noneRequested" };',
    guard: E2,
    expect: "an unreachable attempt is NOT silently downgraded to no request",
  },
  {
    id: "E2-FOCUS-DROPPED-BY-THE-FILTER",
    defect:
      "the focused record is only shown when the filter already contained it — the dead end a recruiter hits when a colleague shared it first",
    file: RELEASE,
    find: "  return [target, ...filtered.filter((r) => r.attemptId !== focus.attemptId)];",
    replace: "  return filtered;",
    guard: E2,
    expect: "the focused record is first even when the filter hid it",
  },

  /* ---- A write treated as a success ------------------------------- */
  {
    id: "E2-SUCCESS-WITHOUT-READBACK",
    defect:
      "THE ORIGINAL DEFECT: any row read back counts as confirmation, so a refetch that returned the stale unreleased row prints success",
    file: RELEASE,
    find: '  if (row?.releasedAt) return { kind: "confirmed", releasedAt: row.releasedAt };\n  return { kind: "writtenNotConfirmed" };',
    replace:
      '  if (row) return { kind: "confirmed", releasedAt: row.releasedAt ?? "" };\n  return { kind: "writtenNotConfirmed" };',
    guard: E2,
    expect: "a row that does NOT carry a release time is not a success",
  },
  {
    id: "E2-FAILED-READBACK-AS-SUCCESS",
    defect: "a refetch that broke is reported as a confirmed release",
    file: RELEASE,
    find: '  if (row?.releasedAt) return { kind: "confirmed", releasedAt: row.releasedAt };',
    replace:
      '  if (row?.releasedAt || row === undefined)\n    return { kind: "confirmed", releasedAt: row?.releasedAt ?? "" };',
    guard: E2,
    expect: "and neither is a refetch that broke",
  },
  {
    id: "E2-MUTATION-SETTLING-IS-THE-END",
    defect:
      "the route goes back to treating the mutation settling as the end of the story, with no read-back at all",
    file: ROUTE,
    find: "        setOutcome(releaseReadback(await refreshAfterRelease()));",
    replace:
      '        void refreshAfterRelease();\n        setOutcome({ kind: "confirmed", releasedAt: new Date().toISOString() });',
    guard: E2,
    expect: "the outcome is decided by the row that came back",
  },
  {
    id: "E2-UNKNOWN-CODE-FALLS-INTO-THE-LAST-BRANCH",
    defect:
      "an error code this product has never seen is mapped to 'already released', so an unknown failure reads as a success",
    file: RELEASE,
    find: '  return RELEASE_ERROR[code] ?? { kind: "failed" };',
    replace: '  return RELEASE_ERROR[code] ?? { kind: "alreadyReleased" };',
    guard: E2,
    expect: "an unknown code falls to failed rather than into the last branch",
  },
  {
    id: "E2-OFFER-THE-IRREVERSIBLE-ACT-AGAIN",
    defect:
      "the release control is offered again after the write landed but the read did not — inviting a second irreversible act",
    file: RELEASE,
    find: '  return outcome.kind === "idle" || outcome.kind === "failed";',
    replace: '  return outcome.kind !== "releasing";',
    guard: E2,
    expect: "the control is NOT offered again after writtenNotConfirmed",
  },
  {
    id: "E2-SHARE-FROM-A-BLOCKED-GATE",
    defect:
      "the release control is live from any gate, so a card with an outstanding review offers to share over it",
    file: RELEASE,
    find: '  if (gate.kind !== "ready") return false;',
    replace: '  if (gate.kind === "notScored") return false;',
    guard: E2,
    expect: "never from the reviewsOutstanding gate",
  },

  /* ---- The gate loses its priority -------------------------------- */
  {
    id: "E2-REVIEWS-OUTRANKED-BY-A-SCORE",
    defect:
      "a scored attempt with responses still awaiting a human reads as ready, which is exactly what SCP_RELEASE_BEFORE_SCORED refuses after the click",
    file: RELEASE,
    find: '  if (row.reviewsOpen > 0)\n    return { kind: "reviewsOutstanding", open: row.reviewsOpen, total: row.reviewsTotal };\n  if (!row.scoredAt) return { kind: "notScored" };',
    replace:
      '  if (!row.scoredAt) return { kind: "notScored" };\n  if (row.reviewsOpen > 0)\n    return { kind: "reviewsOutstanding", open: row.reviewsOpen, total: row.reviewsTotal };',
    guard: E2,
    expect: "an outstanding review outranks a score",
  },
  {
    id: "E2-RELEASED-IS-NOT-TERMINAL",
    defect: "a released attempt whose reviews were reopened offers to be shared a second time",
    file: RELEASE,
    find: '  if (row.releasedAt) return { kind: "released", releasedAt: row.releasedAt };',
    replace: "",
    guard: E2,
    expect: "a released attempt is released, whatever else is true",
  },

  /* ---- The boundary shown before an irreversible disclosure ------- */
  {
    id: "E2-BOUNDARY-PROMISES-A-RANKING",
    defect:
      "the shared side of the boundary starts promising the candidate something the participant document does not contain",
    file: DICT,
    find: '    "academy.participants.boundary.shared.developmentAreas": "Development areas",',
    replace:
      '    "academy.participants.boundary.shared.developmentAreas": "Development areas and their ranking",',
    guard: E2,
    expect: 'the shared side never promises "ranking"',
  },
  {
    id: "E2-BOUNDARY-STOPS-NAMING-THE-SCORE",
    defect:
      "the withheld side stops saying that no total score is produced, leaving a recruiter to assume one exists",
    file: DICT,
    find: '      "A total score, a ranking or a pass/fail — none of these is produced",',
    replace: '      "Some internal material",',
    guard: E2,
    expect: "the withheld side names a total score explicitly",
  },
  {
    id: "E2-RETRY-AN-IRREVERSIBLE-ACT",
    defect:
      "the written-not-confirmed sentence tells the recruiter to share it again — the one thing that must never be suggested",
    file: DICT,
    find: '      "The sharing is done, but the list could not be re-read to confirm it. Do not do it again — sharing is one-way. Re-read to see the updated status.",',
    replace: '      "The sharing may not have gone through. Please try again.",',
    guard: E2,
    expect: "never suggests repeating an irreversible act",
  },

  /* ---- The preview stops being the document ----------------------- */
  {
    id: "E2-PREVIEW-RENDERS-ITS-OWN-MARKUP",
    defect:
      "THE ORIGINAL RISK: the preview renders its own version of the candidate's document, which drifts the first time the candidate's page changes",
    file: PREVIEW,
    find: "          <CandidateReportDocument report={preview.data} />",
    replace: "          <p>{preview.data.releasedAt}</p>",
    guard: E2,
    expect: "the employer preview renders the shared document component",
  },
  {
    id: "E2-CANDIDATE-PAGE-KEEPS-A-PRIVATE-COPY",
    defect:
      "the candidate's own page goes back to rendering its own competency lines, so the two surfaces are two pieces of markup again",
    file: CANDIDATE_ROUTE,
    find: "      <CandidateReportDocument report={r} />",
    replace: '      <EvidenceStateRow name="x" state={"limited" as never} observations={0} />',
    guard: E2,
    expect: "the candidate's own page renders the shared document component",
  },
  {
    id: "E2-PREVIEW-FAILURE-AS-ABSENCE",
    defect:
      "a failed preview read falls through to 'there is no shared copy', which is the failed-read-as-zero defect in the one place a reader would most believe it",
    file: PREVIEW,
    find: "      {preview.isError && (",
    replace: "      {false && preview.isError && (",
    guard: E2,
    expect: "a failed preview read says it failed",
  },

  /* ---- The governed read is bypassed or widened ------------------- */
  {
    id: "E2-PREVIEW-READS-THE-SNAPSHOT-TABLE",
    defect:
      "the preview reaches for scp_report_snapshots directly instead of the audience entry point",
    file: PREVIEW,
    find: "  const previewFn = useServerFn(getParticipantReportAsIssuer);",
    replace:
      "  // scp_report_snapshots\n  const previewFn = useServerFn(getParticipantReportAsIssuer);",
    guard: E2,
    expect: "and never at the snapshot table",
  },
  {
    id: "E2-ISSUER-READ-LEAKS-SEVERITIES",
    defect:
      "the issuer read returns the stored safety flags, so an employer previewing the candidate's document sees severities the candidate never received",
    file: MIGRATION,
    find: "         public.scp_audience_brief(s.brief),\n         '[]'::jsonb,\n         s.context,\n         coalesce(v.limitations_sv, ARRAY[]::text[]),",
    replace:
      "         public.scp_audience_brief(s.brief),\n         s.safety_flags,\n         s.context,\n         coalesce(v.limitations_sv, ARRAY[]::text[]),",
    guard: E2,
    expect: "never the stored safety flags",
  },
  {
    id: "E2-ISSUER-READ-ADMITS-ANY-MEMBER",
    defect:
      "the issuer predicate drops the role check, handing the participant document to every active member of every organisation",
    file: MIGRATION,
    find: "          AND m.status = 'active'\n          AND m.role IN ('owner','admin'));",
    replace: "          AND m.status = 'active');",
    guard: E2,
    expect: "the predicate requires owner or admin",
  },
  {
    id: "E2-ISSUER-READ-ADMITS-A-SUSPENDED-SEAT",
    defect: "the issuer predicate stops checking that the membership is active",
    file: MIGRATION,
    find: "          AND m.status = 'active'\n          AND m.role IN ('owner','admin'));",
    replace: "          AND m.role IN ('owner','admin'));",
    guard: E2,
    expect: "with an active membership",
  },
  {
    id: "E2-ISSUER-READ-REACHABLE-BY-ANON",
    defect: "the revoke is dropped, so an unauthenticated visitor can execute the read",
    file: MIGRATION,
    find: "REVOKE ALL     ON FUNCTION public.scp_participant_report_for_issuer(uuid) FROM PUBLIC, anon;",
    replace: "",
    guard: SQLSEC,
    expect: "scp_participant_report_for_issuer",
  },
  {
    id: "E2-ISSUER-READ-LOSES-TEMPLATE-CONTINUITY",
    defect:
      "the issuer read inner-joins the template, so the sixteen historical snapshots whose template row is gone read as 'not released' to the employer while the candidate still sees them",
    file: MIGRATION,
    find: "    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id\n   WHERE s.attempt_id = _attempt_id\n     AND s.audience = 'participant'\n     AND public.scp_report_issuer_admin(s.issuer_organization_id);",
    replace:
      "    JOIN public.scp_report_versions v ON v.id = s.report_version_id\n   WHERE s.attempt_id = _attempt_id\n     AND s.audience = 'participant'\n     AND public.scp_report_issuer_admin(s.issuer_organization_id);",
    guard: E2,
    expect: "the issuer read carries LEFT JOIN public.scp_report_versions",
  },
  {
    id: "E2-ISSUER-READ-WIDENS-THE-CANONICAL-RULE",
    defect:
      "the migration edits scp_report_snapshot_readable instead of adding its own predicate, which would widen every existing reader at once",
    file: MIGRATION,
    find: "     AND public.scp_report_issuer_admin(s.issuer_organization_id);",
    replace:
      "     AND public.scp_report_snapshot_readable('participant', s.subject_id, s.issuer_organization_id);",
    guard: E2,
    expect: "the canonical audience predicate is not touched",
  },

  /* ---- The caches the release changed ----------------------------- */
  {
    id: "E2-CONTINUITY-STRIP-LEFT-STALE",
    defect:
      "the application's continuity projection is not invalidated, so the strip goes on proposing 'share the candidate material' for an attempt that has just been shared",
    file: ROUTE,
    find: '        queryKey: ["employer", employerId, "application", applicationId, "assessments"],',
    replace: '        queryKey: ["employer", employerId, "application", applicationId, "nothing"],',
    guard: E2,
    expect: "the application's continuity projection is invalidated",
  },
  {
    id: "E2-PIPELINE-ONLY-INVALIDATED",
    defect:
      "the pipeline is invalidated rather than refetched, so the read-back consults a cache entry that has not been refreshed yet",
    file: ROUTE,
    find: '    await qc.refetchQueries({ queryKey: ["academy", "participants", employerId] });',
    replace:
      '    await qc.invalidateQueries({ queryKey: ["academy", "participants", employerId] });',
    guard: E2,
    expect: "the pipeline is refetched, not merely invalidated",
  },
  {
    id: "E2-ALREADY-RELEASED-LEAVES-CACHES-STALE",
    defect:
      "the already-released path stops refreshing, so the success case arriving late leaves the card offering the button again",
    file: ROUTE,
    find: '        void refreshAfterRelease().then((r) => {\n          if (r?.releasedAt) setOutcome({ kind: "confirmed", releasedAt: r.releasedAt });\n        });',
    replace: "        return;",
    guard: E2,
    expect: "the already-released path refreshes too",
  },

  /* ---- A score creeps into the projection ------------------------- */
  {
    id: "E2-SCORE-IN-THE-PROJECTION",
    defect:
      "the release projection starts carrying a total score — the single thing this product must never produce",
    file: RELEASE,
    find: "export function releaseGate(row: PipelineRow): ReleaseGate {",
    replace:
      "export function totalScore(row: PipelineRow): number {\n  return row.answered;\n}\n\nexport function releaseGate(row: PipelineRow): ReleaseGate {",
    guard: E2,
    expect: "the release projection expresses a score nowhere",
  },
  {
    id: "E2-RECOMMENDATION-IN-THE-PROJECTION",
    defect: "the release projection starts producing a hiring recommendation",
    file: RELEASE,
    find: "export function releaseGate(row: PipelineRow): ReleaseGate {",
    replace:
      "export function recommendHire(row: PipelineRow): boolean {\n  return row.reviewsOpen === 0;\n}\n\nexport function releaseGate(row: PipelineRow): ReleaseGate {",
    guard: E2,
    expect: "the release projection expresses a hiring verdict nowhere",
  },

  /* ---- Copy that stops existing ----------------------------------- */
  {
    id: "E2-READINESS-LOSES-ITS-NUMBERS",
    defect:
      "the outstanding-review sentence loses its placeholders, so a recruiter is told a review is outstanding without being told how much of one",
    file: DICT,
    find: '      "{open} of {total} responses are still waiting on a reviewer. The result cannot be shared until the review is finished.",',
    replace: '      "Some responses are still waiting on a reviewer.",',
    guard: E2,
    expect: "keeps {open} in English",
  },
  {
    id: "E2-FOCUS-BADGE-IS-COLOUR-ONLY",
    defect:
      "the focused card is marked by its border alone, which is not an affordance a colour-blind or screen-reader user can use",
    file: ROUTE,
    find: '          {t("academy.participants.focus.badge")}',
    replace: '          {"\\u200b"}',
    guard: E2,
    expect: "the focused card names itself in words",
  },
];

await runControls("negative-controls:assessment-release", MUTATIONS);
