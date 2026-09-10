/**
 * E4 report-sharing negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * The E4 guard asserts that one interview produces two documents for two
 * audiences, that the candidate's is not the employer's with sections hidden,
 * that finalising is a precondition and never a trigger, and that a share is
 * not a share until a read says so. None of those assertions, on its own,
 * proves it would NOTICE if the property stopped holding.
 *
 * Every mutation below introduces the failure that would matter most: the
 * candidate document acquiring a level or a rationale, the release becoming a
 * side effect of finalisation, the preview drifting from the thing previewed,
 * the release announced without a read-back, and the strip going back to
 * reporting a finalised report as the end of the story.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:report-sharing
 */

import { runControls, type Mutation } from "./runner";

const MIGRATION = "supabase/migrations/20261106090000_scp_iv_candidate_summary.sql";
const RELEASE = "src/lib/interview-intelligence/summary-release.ts";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const CANDIDATE_FN = "src/lib/interview-intelligence/candidate.functions.ts";
const DOC = "src/components/employer/interview/CandidateSummaryDocument.tsx";
const RELEASE_UI = "src/components/employer/interview/CandidateSummaryRelease.tsx";
const CANDIDATE_PAGE = "src/routes/_authenticated.my-career.interviews.$caseId.tsx";
const PROJECTION = "src/lib/employer-continuity/process-projection.ts";
const STRIP = "src/components/employer/ProcessContinuityStrip.tsx";
const DICT = "src/i18n/dictionaries.ts";
const ROLLBACK = "supabase/rollback/20261106090000_scp_iv_candidate_summary_rollback.sql";

const E4 = "interview-report-sharing:check";
const E1 = "employer-process-continuity:check";
const SQLSEC = "sql-security:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- The candidate document becomes the employer's ---------------- */
  {
    id: "E4-BUILDER-READS-ASSESSMENTS",
    defect:
      "THE FAILURE THAT MATTERS MOST: the candidate builder starts reading the assessments table, which is where the levels and the private rationales live",
    file: MIGRATION,
    find: "        FROM public.scp_interview_pack_competencies pc\n       WHERE pc.pack_version_id = _c.pack_version_id",
    replace:
      "        FROM public.scp_interview_pack_competencies pc\n       CROSS JOIN public.scp_interview_assessments zz\n       WHERE pc.pack_version_id = _c.pack_version_id",
    guard: E4,
    expect: "never reads scp_interview_assessments",
  },
  {
    id: "E4-BUILDER-CARRIES-THE-AI-WORDING",
    defect:
      "the candidate is shown the AI's original wording rather than the text a human confirmed",
    file: MIGRATION,
    find: "            SELECT jsonb_agg(jsonb_build_object('statement', ev.excerpt)",
    replace: "            SELECT jsonb_agg(jsonb_build_object('statement', ev.original_excerpt)",
    guard: E4,
    expect: "never carries original_excerpt",
  },
  {
    id: "E4-BUILDER-CARRIES-THE-REVIEWER",
    defect: "the reviewer who confirmed each statement is named to the candidate",
    file: MIGRATION,
    find: "            SELECT jsonb_agg(jsonb_build_object('statement', ev.excerpt)",
    replace:
      "            SELECT jsonb_agg(jsonb_build_object('statement', ev.excerpt, 'by', ev.confirmed_by)",
    guard: E4,
    expect: "never carries confirmed_by",
  },
  {
    id: "E4-BUILDER-PUBLISHES-THE-QUESTIONS",
    defect:
      "the pinned pack's core questions are published to the candidate, which turns a structured interview into a memory test",
    file: MIGRATION,
    find: "        FROM public.scp_interview_pack_competencies pc\n       WHERE pc.pack_version_id = _c.pack_version_id",
    replace:
      "        FROM public.scp_interview_pack_competencies pc\n       LEFT JOIN public.scp_interview_core_questions zq ON zq.pack_version_id = pc.pack_version_id\n       WHERE pc.pack_version_id = _c.pack_version_id",
    guard: E4,
    expect: "not the core questions",
  },
  {
    id: "E4-PAYLOAD-TYPE-ADMITS-A-LEVEL",
    defect:
      "the client payload type grows a level field, which is the shape a 'it would be helpful to show them how they did' change takes",
    file: RUNTIME,
    find: "  readonly covered: boolean;\n}",
    replace: "  readonly covered: boolean;\n  readonly level: number | null;\n}",
    guard: E4,
    expect: "has no level field",
  },
  {
    id: "E4-PAYLOAD-TYPE-ADMITS-A-RATIONALE",
    defect: "the client payload type grows the employer's private rationale",
    file: RUNTIME,
    find: "  readonly covered: boolean;\n}",
    replace: "  readonly covered: boolean;\n  readonly rationale: string | null;\n}",
    guard: E4,
    expect: "has no rationale field",
  },

  /* ---- Finalising becomes a trigger --------------------------------- */
  {
    id: "E4-RELEASE-WITHOUT-A-FINAL-REPORT",
    defect:
      "the release stops requiring a finalised report, so a summary of a decision nobody has made can be shared",
    file: MIGRATION,
    find: "      'SCP_IV_SUMMARY_BEFORE_REPORT: finalise the employer report before sharing a summary with the interviewed person.'",
    replace: "      'SCP_IV_SUMMARY_NOT_READY: not ready.'",
    guard: E4,
    expect: "refuses until the employer report is final",
  },
  {
    id: "E4-APPLY-TIME-PROOF-DROPPED",
    defect:
      "the migration stops asserting that finalisation does not call the release, leaving the direction to a reader's memory",
    file: MIGRATION,
    find: "    RAISE EXCEPTION 'SCP_IV_SUMMARY: finalising the report must not release the summary.';",
    replace: "    NULL;",
    guard: E4,
    expect: "asserts at apply time rather than leaving to a reader",
  },
  {
    id: "E4-STEPS-CLAIM-RELEASE-IS-DONE",
    defect:
      "the sequence reports sharing as done before it happened, so a recruiter believes the candidate has been sent something",
    file: RELEASE,
    find: '      return { review: "done", finalise: "done", preview: "current", release: "todo" };',
    replace: '      return { review: "done", finalise: "done", preview: "done", release: "done" };',
    guard: E4,
    expect: "sharing is never reported as done from the ready gate",
  },
  {
    id: "E4-STEPS-RECORD-THE-PREVIEW",
    defect:
      "previewing is recorded as done, which is one step from being a consent the product collected without asking",
    file: RELEASE,
    find: '      return { review: "done", finalise: "done", preview: "current", release: "todo" };',
    replace: '      return { review: "done", finalise: "done", preview: "done", release: "todo" };',
    guard: E4,
    expect: "previewing is never recorded as done from the ready gate",
  },
  {
    id: "E4-SHARE-BEFORE-THE-REPORT-IS-FINAL",
    defect: "the gate offers sharing before the employer's own report is final",
    file: RELEASE,
    find: '  if (!input.reportIsFinal) return { kind: "reportNotFinal" };',
    replace: "",
    guard: E4,
    expect: "nothing may be shared before the employer report is final",
  },

  /* ---- The preview stops being the thing previewed ------------------ */
  {
    id: "E4-PREVIEW-BUILDS-ITS-OWN",
    defect:
      "the preview stops calling the shared builder, so what a recruiter approves is not what gets shared",
    file: MIGRATION,
    find: "  RETURN public.scp_iv_build_candidate_summary(_case_id);\nEND; $$;",
    replace: "  RETURN jsonb_build_object('areas', '[]'::jsonb);\nEND; $$;",
    guard: E4,
    expect: "the preview calls the builder",
  },
  {
    id: "E4-PREVIEW-WRITES",
    defect: "previewing quietly creates the release row, making the share button a formality",
    file: MIGRATION,
    find: "  RETURN public.scp_iv_build_candidate_summary(_case_id);\nEND; $$;",
    replace:
      "  INSERT INTO public.scp_iv_candidate_summaries (case_id) VALUES (_case_id);\n  RETURN public.scp_iv_build_candidate_summary(_case_id);\nEND; $$;",
    guard: E4,
    expect: "previewing writes nothing",
  },
  {
    id: "E4-TWO-COMPONENTS",
    defect:
      "the candidate's own page renders its own markup instead of the shared component, so the preview and the thing previewed can drift",
    file: CANDIDATE_PAGE,
    find: "              <CandidateSummaryDocument",
    replace: '              <div data-not-the-component="true" hidden {...({} as never)} ',
    guard: E4,
    expect: "the candidate's own page renders the shared component",
  },
  {
    id: "E4-SECOND-MAPPER",
    defect:
      "the candidate's read grows its own payload mapper, which is how one document becomes two",
    file: CANDIDATE_FN,
    find: "      payload: mapCandidateSummaryPayload(r.payload),",
    replace:
      "      payload: (function mapCandidateSummaryPayload2(x: unknown) {\n        return x as never;\n      })(r.payload),",
    guard: E4,
    expect: "which it does not define",
  },
  {
    id: "E4-DOCUMENT-IGNORES-THE-REQUESTED-LANGUAGE",
    defect:
      "the document renders one language regardless of what was asked for, so the employer previews Swedish while the candidate reads English",
    file: DOC,
    find: '  const scope = lang === "sv" ? payload.scopeSv : payload.scopeEn;',
    replace: "  const scope = payload.scopeSv;",
    guard: E4,
    expect: "the scope is rendered in the requested language",
  },

  /* ---- A share announced without a read-back ------------------------ */
  {
    id: "E4-SHARE-WITHOUT-READBACK",
    defect:
      "any read-back counts as confirmation, so a refetch that returned nothing still prints 'shared'",
    file: RELEASE,
    find: '  if (released) {\n    return {\n      kind: "confirmed",\n      versionNumber: released.versionNumber,\n      releasedAt: released.releasedAt,\n    };\n  }',
    replace:
      '  if (true) {\n    return {\n      kind: "confirmed",\n      versionNumber: released?.versionNumber ?? 0,\n      releasedAt: released?.releasedAt ?? "",\n    };\n  }',
    guard: E4,
    expect: "a read-back that produced nothing is NOT a confirmation",
  },
  {
    id: "E4-OFFER-THE-IRREVERSIBLE-ACT-AGAIN",
    defect:
      "the share control is offered again after the write landed but the read did not, inviting a second irreversible disclosure",
    file: RELEASE,
    find: '  return outcome.kind === "idle" || outcome.kind === "failed";',
    replace: '  return outcome.kind !== "releasing";',
    guard: E4,
    expect: "is NOT offered again after writtenNotConfirmed",
  },
  {
    id: "E4-UNKNOWN-ERROR-CALLED-A-REFUSAL",
    defect:
      "an unrecognised failure is reported as a refusal, so an outage reads as a decision somebody made",
    file: RELEASE,
    find: '  return { kind: "failed" };\n}',
    replace: '  return { kind: "refused" };\n}',
    guard: E4,
    expect: "an unrecognised message falls to failed",
  },
  {
    id: "E4-RETRY-AN-IRREVERSIBLE-ACT",
    defect:
      "the written-not-confirmed sentence tells the recruiter to share it again — the one thing it must never say",
    file: DICT,
    find: '      "The sharing is done, but it could not be read back to confirm it. Do not do it again — sharing is one-way. Re-read to see the current status.",',
    replace: '      "The sharing may not have gone through. Please try again.",',
    guard: E4,
    expect: "never suggests repeating it",
  },
  {
    id: "E4-CONFIRMATION-STOPS-NAMING-THE-EFFECT",
    defect:
      "the confirmation stops saying the sharing cannot be taken back, so an irreversible disclosure is agreed to without its consequence named",
    file: DICT,
    find: '      "The person will be able to read the document above in their own account. The version is frozen as it is — later changes to the case do not alter it, and there is no way to take it back. A correction is shared as a new version.",',
    replace: '      "The person will be able to read the document above.",',
    guard: E4,
    expect: "says the sharing cannot be taken back",
  },

  /* ---- The strip stops telling the audiences apart ------------------ */
  {
    id: "E4-STRIP-FORGETS-THE-CANDIDATE",
    defect:
      "the report track stops carrying whether anything was shared, so a recruiter cannot answer the question a candidate is most likely to ask",
    file: PROJECTION,
    find: '    candidateSharing: !finalised\n      ? "notApplicable"\n      : finalised.candidateSummaryVersion !== null\n        ? "shared"\n        : "notShared",',
    replace: '    candidateSharing: "notApplicable" as const,',
    guard: E4,
    expect: "a finalised report with nothing shared says BOTH",
  },
  {
    id: "E4-FAILED-READ-CLAIMS-NOTHING-SHARED",
    defect:
      "a failed read of the case list claims nothing was shared, which is a statement about the employer made on the strength of an outage",
    file: PROJECTION,
    find: '      candidateSharing: "notApplicable",\n      candidateSummaryVersion: null,',
    replace: '      candidateSharing: "notShared" as const,\n      candidateSummaryVersion: null,',
    guard: E4,
    expect: "does not claim nothing was shared",
  },
  {
    id: "E4-SHARING-ROW-SHOWN-BEFORE-A-REPORT",
    defect:
      "the strip shows 'no summary shared' about an interview nobody has reported on, which reads as a task",
    file: STRIP,
    find: '        {report.candidateSharing !== "notApplicable" && (',
    replace: "        {true && (",
    guard: E4,
    expect: "hides the row entirely before a report is final",
  },
  {
    id: "E4-SHARING-READS-THE-WRONG-CASE",
    defect:
      "sharing is read from the case holding material rather than from the one with a report — a case that cannot have a summary",
    file: PROJECTION,
    find: '    candidateSharing: !finalised\n      ? "notApplicable"\n      : finalised.candidateSummaryVersion !== null\n        ? "shared"\n        : "notShared",',
    replace:
      '    candidateSharing: !material\n      ? "notApplicable"\n      : material.candidateSummaryVersion !== null\n        ? "shared"\n        : "notShared",',
    guard: E4,
    expect: "sharing is read from the finalised case",
  },
  {
    id: "E4-NOT-SHARED-READS-AS-AN-INSTRUCTION",
    defect:
      "the 'no summary shared' row starts telling the employer they must share one, which the product does not require",
    file: DICT,
    find: '    "continuity.candidateSummary.notShared": "No summary shared",',
    replace:
      '    "continuity.candidateSummary.notShared": "No summary shared — you must share one",',
    guard: E4,
    expect: "is a fact, not an instruction",
  },

  /* ---- The doors are widened ---------------------------------------- */
  {
    id: "E4-SUMMARY-TABLE-BECOMES-READABLE",
    defect:
      "the summary table gains a client read, so the document's audience stops being decided by the entry points",
    file: MIGRATION,
    find: "REVOKE ALL ON TABLE public.scp_iv_candidate_summaries FROM PUBLIC, anon, authenticated;",
    replace: "GRANT SELECT ON TABLE public.scp_iv_candidate_summaries TO authenticated;",
    guard: E4,
    expect: "the table has no client read",
  },
  {
    id: "E4-BUILDER-BECOMES-CLIENT-EXECUTABLE",
    defect:
      "the builder is granted to clients, so an unreleased document can be read by anybody who can call it",
    file: MIGRATION,
    find: "REVOKE ALL ON FUNCTION public.scp_iv_build_candidate_summary(uuid)\n  FROM PUBLIC, anon, authenticated;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.scp_iv_build_candidate_summary(uuid) TO authenticated;",
    guard: E4,
    expect: "the builder is not client-executable at all",
  },
  {
    id: "E4-RELEASE-ADMITS-ANY-MEMBER",
    defect:
      "sharing stops requiring an owner or admin, so any member of the organisation can disclose to a candidate",
    file: MIGRATION,
    find: "  IF auth.uid() IS NULL OR NOT public.has_employer_role(\n       auth.uid(), _c.employer_id, ARRAY['owner','admin']) THEN",
    replace: "  IF auth.uid() IS NULL THEN",
    guard: E4,
    expect: "sharing requires the same seat finalising requires",
  },
  {
    id: "E4-FACT-READ-CARRIES-THE-DOCUMENT",
    defect:
      "the fact-only read gains the payload, widening the document's audience from owner/admin to the whole organisation in one word",
    file: MIGRATION,
    find: "  SELECT s.case_id, s.version_number, s.released_at\n    FROM public.scp_iv_candidate_summaries s\n    JOIN public.scp_interview_cases c ON c.id = s.case_id",
    replace:
      "  SELECT s.case_id, s.version_number, s.released_at, s.payload\n    FROM public.scp_iv_candidate_summaries s\n    JOIN public.scp_interview_cases c ON c.id = s.case_id",
    guard: E4,
    expect: "carries neither the payload nor the hash",
  },
  {
    id: "E4-SUMMARY-READ-REACHABLE-BY-ANON",
    defect: "the revoke is dropped, so an unauthenticated visitor can execute the candidate read",
    file: MIGRATION,
    find: "REVOKE ALL     ON FUNCTION public.scp_iv_my_candidate_summary(uuid) FROM PUBLIC, anon;",
    replace: "",
    guard: SQLSEC,
    expect: "scp_iv_my_candidate_summary",
  },

  /* ---- Idempotency and immutability --------------------------------- */
  {
    id: "E4-RE-RELEASE-MAKES-A-SECOND-ROW",
    defect:
      "an unchanged re-release writes a second version, so two clicks are two shares and the candidate's version number jumps for no reason",
    file: MIGRATION,
    find: "  IF _latest_id IS NOT NULL AND _latest_hash = _hash THEN\n    RETURN _latest_id;\n  END IF;",
    replace: "",
    guard: E4,
    expect: "an unchanged re-release returns the version that already exists",
  },
  {
    id: "E4-CHANGED-SUMMARY-OVERWRITES",
    defect:
      "a corrected summary rewrites the previous version rather than superseding it, so what somebody was told in March stops being what they were told",
    file: MIGRATION,
    find: "  UPDATE public.scp_iv_candidate_summaries\n     SET status = 'superseded'",
    replace: "  DELETE FROM public.scp_iv_candidate_summaries\n   WHERE false OR (SELECT true)",
    guard: E4,
    expect: "the previous version is superseded rather than rewritten",
  },

  /* ---- The rollback stops being a rollback -------------------------- */
  {
    id: "E4-ROLLBACK-LEAVES-A-FUNCTION",
    defect:
      "a function survives the rollback, so a rolled-back database still exposes a door to a table that is gone",
    file: ROLLBACK,
    find: "DROP FUNCTION IF EXISTS public.scp_iv_my_candidate_summary(uuid);",
    replace: "",
    guard: E4,
    expect: "the rollback drops scp_iv_my_candidate_summary",
  },
  {
    id: "E4-PRA-UNWIND-FORGETS-THE-NEW-FUNCTIONS",
    defect:
      "the full PR-A unwind stops dropping the new functions, so the sweep that catches an unlisted scp_ function stops catching this one",
    file: "supabase/tests/scp_a_rollback_test.sql",
    find: "DROP FUNCTION IF EXISTS public.scp_iv_build_candidate_summary(uuid) CASCADE;",
    replace: "",
    guard: E4,
    expect: "the full PR-A unwind knows about the new functions",
  },
];

await runControls("negative-controls:report-sharing", MUTATIONS);
