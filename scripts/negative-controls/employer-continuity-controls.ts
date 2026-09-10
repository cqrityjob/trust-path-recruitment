/**
 * E1 employer-continuity negative controls — seventeen mutations.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * The E1 guard asserts that one application stays one process. None of its 352
 * assertions, on its own, proves it would NOTICE if that stopped being true: a
 * regex that no longer matches, a table test over a union that lost a member,
 * or an assertion whose subject was renamed all go on printing "ok".
 *
 * Each mutation below introduces exactly one of the defects E1 exists to
 * prevent -- the real defect, in the real file, in the shape a careless edit
 * would actually produce -- and requires the guard to fail with a named
 * diagnostic. Where the defect belongs to a boundary E1 did not build but must
 * not have weakened (the Passport separation, the interview guide's source
 * labels, the audience split), the mutation is pointed at the guard that owns
 * that boundary, which is the honest way to prove those are still live.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:employer-continuity
 */

import { runControls, type Mutation } from "./runner";

const PROJECTION = "src/lib/employer-continuity/process-projection.ts";
const STRIP = "src/components/employer/ProcessContinuityStrip.tsx";
const PANEL = "src/components/academy/ApplicationAssessmentPanel.tsx";
const APP_ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx";
const II_CASE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.index.tsx";
const II_INDEX =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx";
const DICT = "src/i18n/dictionaries.ts";
const CONTEXT = "src/lib/interview-intelligence/context.ts";

const E1 = "employer-process-continuity:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- The link itself ------------------------------------------- */
  {
    id: "E1-ASSESSMENT-WRONG-APPLICATION",
    defect:
      "the review is opened without the application it came from, so the reviewer returns to a queue instead of the candidate",
    file: PANEL,
    find: "        params={{ employerSlug, attemptId }}\n        search={{ application: applicationId }}\n",
    replace: "        params={{ employerSlug, attemptId }}\n",
    guard: E1,
    expect: "3 · the review carries the application it was opened from",
  },
  {
    id: "E1-INTERVIEW-WRONG-APPLICATION",
    defect:
      "the case overview returns to an application derived from the case id rather than from the case's own column",
    file: II_CASE,
    find: "params={{ employerSlug, applicationId: d.applicationId }}",
    replace: "params={{ employerSlug, applicationId: caseId }}",
    guard: E1,
    expect: "4 · the case overview links back by the case's own persisted application id",
  },
  {
    id: "E1-LINK-BY-NAME",
    defect: "linkage becomes inferable from a candidate name rather than from an identifier",
    file: PROJECTION,
    find: 'export function processLinkage(applicationId: string | null | undefined): ProcessLinkage {\n  return applicationId ? "recruitmentLinked" : "standalone";',
    replace:
      'export function processLinkage(\n  applicationId: string | null | undefined,\n  candidateName?: string,\n): ProcessLinkage {\n  return applicationId || candidateName ? "recruitmentLinked" : "standalone";',
    guard: E1,
    expect: "5 · linkage takes an identifier and nothing else",
  },
  {
    id: "E1-STANDALONE-SHOWN-AS-LINKED",
    defect:
      "every case is described as recruitment-linked, because linkage is read from the case id",
    file: II_CASE,
    find: "const linkage = processLinkage(d.applicationId);",
    replace: "const linkage = processLinkage(d.id);",
    guard: E1,
    expect: "4 · and decides linkage from that same persisted column",
  },

  /* ---- Identity of the role --------------------------------------- */
  {
    id: "E1-TITLE-AS-ROLE",
    defect: "the interview guide's name is printed as the advertised role again",
    file: II_CASE,
    find: '      : (contextRole ?? t("continuity.role.unknown"));',
    replace: "      : (contextRole ?? d.packName ?? d.title);",
    guard: E1,
    expect: "4 · and never borrows the internal title or the guide's name",
  },

  /* ---- Material versus report ------------------------------------- */
  {
    id: "E1-MATERIAL-COUNTED-AS-FINAL",
    defect: "a case at `assessed` is presented as having a finalised report",
    file: PROJECTION,
    find: '  const material = cases.some((c) => c.status === "assessed");',
    replace:
      '  const material = false;\n  if (cases.some((c) => c.status === "assessed"))\n    return { read, availability: "finalised", finalisedCaseId: cases[0]?.id ?? null };',
    guard: E1,
    expect: "7 · assessed yields report MATERIAL",
  },
  {
    id: "E1-FINAL-COUNTED-AS-ACTIVE",
    defect: "a finalised report is counted as an interview still in flight",
    file: II_INDEX,
    find: '  const active = cases.filter((c) => !["reported", "cancelled"].includes(c.status));',
    replace: '  const active = cases.filter((c) => !["cancelled"].includes(c.status));',
    guard: E1,
    expect: "8 · and the active counter excludes it",
  },
  {
    id: "E1-MATERIAL-CALLED-REPORT",
    defect: "the `assessed` chip goes back to reading as a finished report",
    file: DICT,
    find: '    "iiu.status.assessed": "Rapportunderlag redo",',
    replace: '    "iiu.status.assessed": "Rapport redo",',
    guard: E1,
    expect: "7 · assessed reads Rapportunderlag redo",
  },

  /* ---- Reads that failed ------------------------------------------ */
  {
    id: "E1-FAILED-READ-AS-ZERO",
    defect: "a failed interview read is presented as an application with no interview",
    file: PROJECTION,
    find: '      state: read === "loading" ? "loading" : read === "refused" ? "refused" : "unavailable",\n      proposalsAwaitingReview: 0,',
    replace:
      '      state: read === "loading" ? "loading" : "none",\n      proposalsAwaitingReview: 0,',
    guard: E1,
    expect: 'a failed interview read is not "none"',
  },
  {
    id: "E1-REFUSAL-AS-EMPTY",
    defect:
      "the assessment panel loses its failure branch and renders a refusal as 'no assessment has been sent'",
    file: PANEL,
    find: "  if (assessments.isError) {",
    replace: "  if (false as boolean) {",
    guard: E1,
    expect: "10 · the assessment panel has a failure branch",
  },
  {
    id: "E1-LIST-COUNTS-ZERO-WHILE-UNKNOWN",
    defect: "the interview list prints three confident zeros while the read is in flight or broken",
    file: II_INDEX,
    find: "          value={countsKnown ? active.length : null}",
    replace: "          value={active.length}",
    guard: E1,
    expect: "10 · rather than defaulting to zero",
  },

  /* ---- Capability -------------------------------------------------- */
  {
    id: "E1-MEMBER-OFFERED-FORBIDDEN-ACTION",
    defect: "the review is offered to somebody the board has not authorised",
    file: PROJECTION,
    find: "    return cap.canReviewAssessment && assessment.leadAttemptId",
    replace: "    return assessment.leadAttemptId",
    guard: E1,
    expect: "12 · a non-reviewer is told a colleague must act",
  },
  {
    id: "E1-SHARE-OFFERED-WITHOUT-ROLE",
    defect: "sharing a scored brief is offered to a member the database would refuse",
    file: PROJECTION,
    find: "    return cap.canShareAssessmentBrief",
    replace: "    return true",
    guard: E1,
    expect: "12 · a member is not offered the share",
  },

  /* ---- The next action -------------------------------------------- */
  {
    id: "E1-NEXT-ACTION-RECOMMENDS",
    defect: "the next action becomes an opinion about the candidate",
    file: PROJECTION,
    find: '  | "openFinalisedReport"\n',
    replace: '  | "openFinalisedReport"\n  | "recommendHire"\n',
    guard: E1,
    expect: '13 · no action member mentions "hire"',
  },

  /* ---- Lifecycle separation ---------------------------------------- */
  {
    id: "E1-ASSESSMENT-CHANGES-APPLICATION-STATUS",
    defect: "a completed assessment advances the application's own lifecycle",
    file: PROJECTION,
    find: "    application: input.application,",
    replace:
      '    application:\n      input.assessment.state === "brief_released"\n        ? { ...input.application, status: "interview" }\n        : input.application,',
    guard: E1,
    expect: "6 · no assessment or interview state changes the application's status",
  },
  {
    id: "E1-STRIP-WRITES-STATE",
    defect: "the read-only strip acquires a writer",
    file: STRIP,
    find: 'import { Link } from "@tanstack/react-router";',
    replace:
      'import { Link } from "@tanstack/react-router";\nimport { useMutation } from "@tanstack/react-query";',
    guard: E1,
    expect: "14 · the strip writes nothing",
  },

  /* ---- Boundaries E1 must not have weakened ------------------------ */
  {
    id: "E1-SELF-REPORT-AS-VERIFIED",
    defect: "a continuity state describes shared assessment material as verified competence",
    file: DICT,
    find: '    "continuity.report.finalised": "Fastställd rapport finns",',
    replace: '    "continuity.report.finalised": "Verifierad kompetens finns",',
    guard: E1,
    expect: '15 · "continuity.report.finalised" makes no verification claim',
  },
  {
    id: "E1-FOLLOWUP-LOSES-ITS-SOURCE",
    defect:
      "assessment-derived follow-up areas stop being labelled as assessment-derived, so a candidate's results become indistinguishable from the advert's own requirements",
    file: CONTEXT,
    find: 'export type FollowUpReason = "assessment_follow_up" | "limited_evidence" | "requirement_to_cover";',
    replace: 'export type FollowUpReason = "limited_evidence" | "requirement_to_cover";',
    guard: E1,
    expect: "18 · assessment-derived areas keep their own source label",
  },
  {
    id: "E1-PASSPORT-REACHES-THE-PROJECTION",
    defect: "Passport data enters the process projection, outside any disclosure contract",
    file: PROJECTION,
    find: "  readonly needsHumanAttention: boolean;",
    replace:
      "  readonly needsHumanAttention: boolean;\n  /** Whether the candidate's Passport is shared. */\n  readonly passportDisclosed: boolean;",
    guard: E1,
    expect: "19 · process-projection.ts reads no Passport data",
  },
  {
    id: "E1-EMPLOYER-REPORT-MATERIAL-IN-THE-STRIP",
    defect: "the strip starts carrying the finalised report's own integrity hash",
    file: STRIP,
    find: "  const { application, assessment, interview, report, nextAction } = projection;",
    replace:
      "  const { application, assessment, interview, report, nextAction } = projection;\n  const reportContentHash = (report as { contentHash?: string }).contentHash ?? null;\n  void reportContentHash;",
    guard: E1,
    expect: "20 · the strip reads no reportContentHash",
  },
  {
    id: "E1-PII-IN-A-QUERY-STRING",
    defect: "a human-readable label is put into a URL beside the opaque identifier",
    file: STRIP,
    find: "          search={{ application: applicationId }}",
    replace: "          search={{ application: applicationId, ref: label }}",
    guard: E1,
    expect: "22 · no URL the strip draws carries a name, an address or anything but an opaque id",
  },

  /* ---- Multi-record: hidden work, and wrong destinations ------------ */
  //
  // Seven mutations, each isolating ONE way an application with several
  // records can lie. They are separate on purpose: end to end several of them
  // produce the same visible symptom, and a single control would leave the
  // others free to come back unnoticed.
  {
    id: "E1-TERMINAL-CASE-HIDES-WORK",
    defect:
      "a finished report outranks report material again, so a case at `assessed` is invisible and the strip announces the finished report instead",
    file: PROJECTION,
    find: "  cancelled: 0,\n  reportFinalised: 1,\n  unknown: 2,\n  preparing: 3,\n  readyToInterview: 4,\n  interviewing: 5,\n  evidenceReview: 6,\n  reportMaterialReady: 7,",
    replace:
      "  cancelled: 0,\n  unknown: 1,\n  preparing: 2,\n  readyToInterview: 3,\n  interviewing: 4,\n  evidenceReview: 5,\n  reportMaterialReady: 6,\n  reportFinalised: 7,",
    guard: E1,
    expect: "9a · the interview row names the case that owes work",
  },
  {
    id: "E1-TERMINAL-ATTEMPT-HIDES-WORK",
    defect:
      "a released brief outranks an attempt awaiting review again, so the row reads Slutford while a reviewer owes ten responses",
    file: PROJECTION,
    find: "  under_review: 4,\n  brief_ready: 3,\n  in_progress: 2,\n  invited: 1,\n  brief_released: 0,",
    replace:
      "  brief_released: 4,\n  brief_ready: 3,\n  under_review: 2,\n  in_progress: 1,\n  invited: 0,",
    guard: E1,
    expect: "9a · the row names the attempt that owes work",
  },
  {
    id: "E1-PROPOSALS-WRONG-DESTINATION",
    defect:
      "the evidence action opens the presentation case again, so a summed proposal count sends the recruiter to a case holding none of it",
    file: PROJECTION,
    find: '      destination: { kind: "interviewCase", caseId: interview.proposalsCaseId },',
    replace: '      destination: { kind: "interviewCase", caseId: interview.presentationCaseId! },',
    guard: E1,
    expect: "9a · and opens the case the proposals are actually on",
  },
  {
    id: "E1-REVIEW-WRONG-DESTINATION",
    defect:
      "the assessment review opens the presentation attempt again, so a summed response count opens an attempt with no responses outstanding",
    file: PROJECTION,
    find: '          destination: { kind: "assessmentReview", attemptId: assessment.reviewAttemptId },',
    replace:
      '          destination: { kind: "assessmentReview", attemptId: assessment.presentationAttemptId! },',
    guard: E1,
    expect: "9a · and the review opens the attempt with the responses",
  },
  {
    id: "E1-REPORT-MATERIAL-WRONG-DESTINATION",
    defect:
      "the report-material action opens the presentation case, which in the mixed case is the FINALISED report rather than the material awaiting review",
    file: PROJECTION,
    find: '      destination: { kind: "interviewReport", caseId: interview.reportMaterialCaseId },',
    replace:
      '      destination: { kind: "interviewReport", caseId: interview.presentationCaseId! },',
    guard: E1,
    expect: "9a · and opens the case holding the material, not the finished one",
  },
  {
    id: "E1-MIXED-REPORT-COLLAPSED",
    defect:
      "a finalised report swallows the report material again, so the report row denies work that is outstanding in another case",
    file: PROJECTION,
    find: '    material && finalised\n      ? "materialAndFinalised"\n      : material',
    replace: '    finalised\n      ? "finalised"\n      : material',
    guard: E1,
    expect: "9a · the report row reports BOTH the material and the finalised report",
  },
  {
    id: "E1-SELECTION-NOT-DETERMINISTIC",
    defect:
      "record selection falls back to whatever order the server happened to return, so the same application projects differently between two reads",
    file: PROJECTION,
    find: "    const a = waitingSinceOf(row);\n    const b = waitingSinceOf(best);\n    if (a < b || (a === b && idOf(row) < idOf(best))) best = row;\n  }\n  return best;\n}\n\n/**\n * The record the status row names",
    replace:
      "    void waitingSinceOf;\n    void idOf;\n  }\n  return best;\n}\n\n/**\n * The record the status row names",
    guard: E1,
    expect: "9a · every permutation of the same cases gives the same projection",
  },

  /* ---- False capability and destination signals --------------------- */
  {
    id: "E1-CAPABILITY-NOBODY-READS",
    defect:
      "a capability is declared and passed on every render but consulted by no branch, so it reads as a permission check that is happening when nothing is checking it",
    file: PROJECTION,
    find: "export interface ContinuityCapabilities {",
    replace:
      "export interface ContinuityCapabilities {\n  /** scp_assign_from_application requires owner/admin. */\n  readonly canAssignAssessment: boolean;",
    guard: E1,
    expect: "12 · canAssignAssessment is read by the next-step ladder",
  },
  {
    id: "E1-DESTINATION-NOBODY-PRODUCES",
    defect:
      "a destination stays in the union, and in the strip's switch, after the last branch that could produce it stops doing so",
    file: PROJECTION,
    find: '          destination: { kind: "assessmentParticipants" },',
    replace: "          destination: NO_DESTINATION,",
    guard: E1,
    expect: '21 · some state actually produces the "assessmentParticipants" destination',
  },

  /* ---- Counter units ----------------------------------------------- */
  {
    id: "E1-COUNTER-UNIT-MISMATCH",
    defect:
      "assessed requirements are counted as assessment ROWS again, so a two-assessor panel reads '16 av 8'",
    file: "src/components/employer/interview/InterviewUi.tsx",
    find: "  return new Set(assessments.map((a) => a.questionId)).size;",
    replace: "  return assessments.length;",
    guard: E1,
    expect: "9b · a second assessor does not make sixteen requirements",
  },
  {
    id: "E1-COUNTER-PRIVATE-COPY",
    defect: "one surface goes back to its own private count and drifts from the other three",
    file: II_CASE,
    find: "  const assessed = assessedQuestionCount(d.assessments);",
    replace: "  const assessed = d.assessments.length;",
    guard: E1,
    expect: "counts questions, not assessment rows",
  },

  /* ---- The anchor itself ------------------------------------------- */
  {
    id: "E1-APPLICATION-STOPS-BEING-THE-ANCHOR",
    defect: "the new-interview form forgets the application it was opened from",
    file: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx",
    find: '            to="/employer/$employerSlug/applications/$applicationId"\n            params={{ employerSlug, applicationId }}',
    replace:
      '            to="/employer/$employerSlug/interview-intelligence"\n            params={{ employerSlug }}',
    guard: E1,
    expect: "1 · the new-interview form returns to the application",
  },
];

runControls("employer-continuity", MUTATIONS);
