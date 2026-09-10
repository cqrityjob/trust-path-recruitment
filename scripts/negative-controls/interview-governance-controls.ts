/**
 * E3 interview-governance negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * The E3 guard asserts that a read which did not land is never rendered as a
 * fact about the world. None of its assertions, on its own, proves it would
 * NOTICE if that stopped being true.
 *
 * Every mutation below restores one of the collapses E3 corrected -- most of
 * them the ORIGINAL defect, verbatim: the unreadable application returned as a
 * standalone interview, the failed advert read returned as an advert with no
 * requirements, the unread assessment returned as an absent one, the case
 * read's failure modes thrown as messages, and the retention region that
 * rendered as nothing at all.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:interview-governance
 */

import { runControls, type Mutation } from "./runner";

const CONTEXT = "src/lib/interview-intelligence/context.ts";
const CONTEXT_FN = "src/lib/interview-intelligence/context.functions.ts";
const NOTICE = "src/lib/interview-intelligence/candidate-notice.ts";
const PANEL = "src/components/employer/interview/InterviewContextPanel.tsx";
const OUTCOME = "src/components/employer/interview/InterviewContextOutcome.tsx";
const NOTICE_PANEL = "src/components/employer/interview/CandidateNoticePanel.tsx";
const PREPARE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx";
const LIVE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx";
const CANDIDATE_PAGE = "src/routes/_authenticated.my-career.interviews.$caseId.tsx";

const E3 = "interview-context-governance:check";
const E1 = "employer-process-continuity:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- The unreadable application as a standalone interview -------- */
  {
    id: "E3-UNREADABLE-APPLICATION-AS-STANDALONE",
    defect:
      "THE ORIGINAL DEFECT: an application that could not be read produces a standalone context, so a recruiter is told there is no advertised role when there is one",
    file: CONTEXT,
    find: '    return input.reads.application === "absent"\n      ? standaloneContext(input.candidateName)\n      : emptyContext(input.candidateName, "linkedUnreadable", input.reads);',
    replace: "    return standaloneContext(input.candidateName);",
    guard: E3,
    expect: "is linkedUnreadable, NOT standalone",
  },
  {
    id: "E3-SERVER-RETURNS-STANDALONE-ON-A-FAILED-READ",
    defect:
      "the server function itself falls back to standalone when the application read produces nothing",
    file: CONTEXT_FN,
    find: "          application: resolveSourceRead({\n            referenced: true,\n            error: appErr,\n            hasRow: Boolean(a),\n          }),",
    replace: '          application: "absent",',
    guard: E3,
    expect: "`absent` is never written by hand",
  },
  {
    id: "E3-EMPTY-CONTEXT-CLAIMS-NO-CV",
    defect:
      "an unreadable case claims the candidate applied without a CV, because a failed read is written down as an absence",
    file: CONTEXT,
    find: '    cvPresence: reads.cv === "ok" || reads.cv === "absent" ? "none" : "unreadable",',
    replace: '    cvPresence: "none",',
    guard: E3,
    expect: 'an empty context claims "no CV" only when the CV read landed',
  },

  /* ---- The failed source read as an absence ------------------------ */
  {
    id: "E3-ADVERT-READ-FAILURE-AS-ABSENCE",
    defect:
      "THE ORIGINAL DEFECT: a failed advert read reports as an advert that states no requirements",
    file: CONTEXT_FN,
    find: "  const read = resolveSourceRead({ referenced: true, error, hasRow: Boolean(data) });",
    replace: '  const read: SourceRead = error ? "absent" : data ? "ok" : "absent";',
    guard: E3,
    expect: "the advert's reader never writes",
  },
  {
    id: "E3-ADVERT-MISSING-ROW-AS-ABSENCE",
    defect:
      "a job row the employer filter excluded reports as an advert with nothing in it, rather than as one that could not be reached",
    file: CONTEXT_FN,
    find: "  const read = resolveSourceRead({ referenced: true, error, hasRow: Boolean(data) });",
    replace: '  const read: SourceRead = error ? "failed" : data ? "ok" : "absent";',
    guard: E3,
    expect: "the advert's reader delegates its read outcome",
  },
  {
    id: "E3-ASSESSMENT-READ-FAILURE-AS-ABSENCE",
    defect:
      "THE ORIGINAL DEFECT: a failed assessment read reports as 'no assessment has been sent'",
    file: CONTEXT_FN,
    find: "    return {\n      brief: null,\n      pending: false,\n      read: resolveSourceRead({ referenced: true, error, hasRow: false }),\n    };",
    replace: '    return { brief: null, pending: false, read: "absent" };',
    guard: E3,
    expect: "the released assessment's reader never writes",
  },
  {
    id: "E3-CV-READ-FAILURE-AS-ABSENCE",
    defect: "a CV read that threw reports as an application submitted without one",
    file: CONTEXT_FN,
    find: "    return {\n      value: null,\n      read: resolveSourceRead({\n        referenced: true,\n        error: err as { message?: string },\n        hasRow: false,\n      }),\n    };",
    replace: '    return { value: null, read: "absent" };',
    guard: E3,
    expect: "the CV's reader delegates its read outcome",
  },

  /* ---- The case read's failure modes ------------------------------- */
  {
    id: "E3-CASE-FAILURE-THROWN-AGAIN",
    defect:
      "the case read goes back to throwing the database's own message, which three screens then tell apart by substring",
    file: CONTEXT_FN,
    find: '      console.error("[interview-context] case read failed", caseRes.error);\n      return { kind: "caseReadFailed" };',
    replace: "      throw new Error(caseRes.error.message);",
    guard: E3,
    expect: "a broken case read is a result member",
  },
  {
    id: "E3-CASE-NOT-FOUND-THROWN-AGAIN",
    defect: "an empty case read goes back to a thrown sentinel string",
    file: CONTEXT_FN,
    find: '    if (!caseRes.data) return { kind: "caseNotFoundOrRefused" };',
    replace: '    if (!caseRes.data) throw new Error("INTERVIEW_CASE_NOT_FOUND");',
    guard: E3,
    expect: "and so is an empty one",
  },
  {
    id: "E3-UNKNOWN-FAILURE-CALLED-A-REFUSAL",
    defect:
      "an unrecognised failure is classified as a refusal, so an outage is reported as a decision somebody made and the retry is withheld",
    file: CONTEXT,
    find: '  return "failed";\n}',
    replace: '  return "refused";\n}',
    guard: E3,
    expect: "an unrecognised failure falls to failed, never to refused",
  },
  {
    id: "E3-UNKNOWN-RESULT-MEMBER-AS-ABSENCE",
    defect:
      "a result member this build has never heard of renders as the standalone case rather than failing closed",
    file: OUTCOME,
    find: '            ["iic.error", "iic.error.hint", true];',
    replace: '            ["iic.unlinked", "iic.unlinked.hint", false];',
    guard: E3,
    expect: "an unknown result member renders as a failure, not as an absence",
  },
  {
    id: "E3-RETRY-OFFERED-AGAINST-A-REFUSAL",
    defect:
      "a retry is offered against a case that is not found or not yours, inviting somebody to keep pressing a button against a decision",
    file: OUTCOME,
    find: '        ? ["iic.caseUnavailable.notFound", "iic.caseUnavailable.notFound.hint", false]',
    replace:
      '        ? ["iic.caseUnavailable.notFound", "iic.caseUnavailable.notFound.hint", true]',
    guard: E3,
    expect: "offers no retry",
  },

  /* ---- The screens ------------------------------------------------- */
  {
    id: "E3-PANEL-RENDERS-UNREADABLE-AS-STANDALONE",
    defect:
      "the context panel renders an unreadable application with the standalone sentence again",
    file: PANEL,
    find: '  if (context.link === "linkedUnreadable")',
    replace: '  if (false && context.link === "linkedUnreadable")',
    guard: E3,
    expect: "it says the application could not be read",
  },
  {
    id: "E3-ROLE-FIELD-CLAIMS-NO-ADVERTISED-ROLE",
    defect: "the role field falls back to 'no advertised role' for an advert nobody could fetch",
    file: PANEL,
    find: '                context.reads.job === "absent"\n                  ? "iic.field.noRole"\n                  : context.reads.job === "refused"',
    replace:
      '                true\n                  ? "iic.field.noRole"\n                  : context.reads.job === "refused"',
    guard: E3,
    expect: "and never as",
  },
  {
    id: "E3-ASSESSMENT-FAILURE-FALLS-THROUGH",
    defect:
      "the assessment line stops checking the read first, so a failed read falls through to 'no assessment material is available'",
    file: PANEL,
    find: '  if (read === "refused")',
    replace: '  if (false && read === "refused")',
    guard: E3,
    expect: "the released assessment's reader never writes",
  },
  {
    id: "E3-CONTEXT-OF-MANUFACTURES-A-CONTEXT",
    defect:
      "the shared helper defaults an unhappy result to an empty context, so every screen renders a set of claims nobody earned",
    file: OUTCOME,
    find: '  return result?.kind === "context" ? result.context : null;',
    replace:
      '  return result?.kind === "context"\n    ? result.context\n    : ({ link: "standalone", reads: {} } as unknown as InterviewContext);',
    guard: E3,
    expect: "contextOf returns null for a failure",
  },
  {
    id: "E3-USABLE-MEANS-MERELY-PRESENT",
    defect:
      "'usable' becomes 'an object arrived', so an approval is offered against requirements nobody read",
    file: OUTCOME,
    find: '  return c.link !== "linkedUnreadable";',
    replace: "  return true;",
    guard: E3,
    expect: "although it IS an object",
  },
  {
    id: "E3-APPROVAL-OFFERED-WITHOUT-CONTEXT",
    defect: "the preparation screen offers to approve the plan whatever the context read did",
    file: PREPARE,
    find: "                          {contextIsUsable(contextQ.data) ? (",
    replace: "                          {true ? (",
    guard: E3,
    expect: "the preparation screen asks whether the context is usable",
  },
  {
    id: "E3-LIVE-BRIEFING-SILENTLY-EMPTY",
    defect:
      "the live interview renders an unfetched briefing as no briefing — silently, mid-interview, when the interviewer can least go and check",
    file: LIVE,
    find: "              {contextAreas.length === 0 && !contextAreasKnown && (",
    replace: "              {false && (",
    guard: E3,
    expect: "says so rather than rendering nothing at all",
  },

  /* ---- The notice --------------------------------------------------- */
  {
    id: "E3-RETENTION-SILENCE-RESTORED",
    defect:
      "THE ORIGINAL DEFECT: the candidate's page renders retention only when there is a date, so every case without a transcript says nothing at all about it",
    file: CANDIDATE_PAGE,
    find: '          {retention === "stated" && d.retainUntil ? (',
    replace: "          {d.retainUntil ? (",
    guard: E3,
    expect: "no longer renders retention only when there is a date",
  },
  {
    id: "E3-MISSING-RETENTION-CALLED-CONFIGURED",
    defect: "a case with no retention date is reported as having one",
    file: NOTICE,
    find: '          ? "stated"\n          : "notConfigured",',
    replace: '          ? "stated"\n          : "stated",',
    guard: E3,
    expect: "says the employer has not set one",
  },
  {
    id: "E3-FAILED-RETENTION-READ-BLAMES-THE-EMPLOYER",
    defect:
      "a retention read that failed is reported as 'the employer has not set one' — a claim about somebody's setup made on the strength of an outage",
    file: NOTICE,
    find: '      input.retentionRead === "refused" || input.retentionRead === "failed"\n        ? "unknown"',
    replace: '      false\n        ? "unknown"',
    guard: E3,
    expect: "is unknown, never notConfigured",
  },
  {
    id: "E3-UNREAD-ROLE-CALLED-ABSENT",
    defect:
      "a role whose read was refused is reported to the candidate as a role that does not exist",
    file: NOTICE,
    find: '      : input.roleRead === "absent"\n        ? "notConfigured"\n        : input.roleRead === "ok"\n          ? "notConfigured"\n          : "unknown",',
    replace: '      : "notConfigured",',
    guard: E3,
    expect: "is unknown, never reported as absent",
  },
  {
    id: "E3-NOTICE-INVENTS-A-RETENTION-PERIOD",
    defect:
      "the product fills the retention gap with a period nobody configured — the single thing this notice must never do",
    file: "src/i18n/dictionaries.ts",
    find: '    "iin.retention.howToSet":\n      "The retention period is set when you confirm a lawful basis for recording or transcribing the interview. Without that step there is no period, and the candidate is told exactly that — CQrityjob does not invent one on your behalf.",',
    replace:
      '    "iin.retention.howToSet":\n      "Material is kept for 90 days by default until you set a period.",',
    guard: E3,
    expect: "invents no retention period to fill the gap",
  },
  {
    id: "E3-NOTICE-ASKS-FOR-CONSENT",
    defect:
      "the notice starts describing itself as consent, which asserts a legal basis nobody in this product has chosen",
    file: "src/i18n/dictionaries.ts",
    find: '    "iin.el.purpose": "Why the information is being collected",',
    replace: '    "iin.el.purpose": "Why the information is collected, which you consent to",',
    guard: E3,
    expect: "neither does its copy",
  },
  {
    id: "E3-NOTICE-CLAIMS-COMPLIANCE",
    defect:
      "the employer panel drops the sentence saying the content still needs legal review, so a list of ticks reads as an assurance",
    file: "src/i18n/dictionaries.ts",
    find: '    "iin.footnote":\n      "This list says what the product can tell the candidate. It does not say the information is sufficient in law. The content and the lawful basis need legal review before any pilot with real candidates.",',
    replace: '    "iin.footnote": "This list says what the product can tell the candidate.",',
    guard: E3,
    expect: "says the content still needs legal review",
  },
  {
    id: "E3-NOTICE-PANEL-BECOMES-A-CONTROL",
    defect:
      "the notice panel grows a checkbox recording an acknowledgement the product never collected",
    file: NOTICE_PANEL,
    find: '      <Eyebrow>{t("iin.stated")}</Eyebrow>',
    replace:
      '      <label>\n        <input type="checkbox" /> acknowledged\n      </label>\n      <Eyebrow>{t("iin.stated")}</Eyebrow>',
    guard: E3,
    expect: "records no acknowledgement",
  },
  {
    id: "E3-NOTICE-DROPS-AN-ELEMENT",
    defect:
      "an element the interviewed person is entitled to understand quietly stops being enumerated",
    file: NOTICE,
    find: '  /** Who can reach the material. */\n  "whoCanAccess",',
    replace: "",
    guard: E3,
    expect: "eleven elements",
  },

  /* ---- The invariants E1 established, still holding ---------------- */
  {
    id: "E3-LOOKUP-BY-CANDIDATE-NAME",
    defect:
      "the context read starts finding an application by the candidate's display name rather than by an identifier",
    file: CONTEXT_FN,
    find: '      .eq("id", data.caseId)\n      .maybeSingle();',
    replace: '      .eq("candidate_display_name", data.caseId)\n      .maybeSingle();',
    guard: E3,
    expect: "nothing is looked up by a candidate name",
  },
  {
    id: "E3-JOB-FROM-THE-REQUEST",
    defect:
      "the job is taken from the case row rather than from the application, so a hand-edited case could name another employer's advert",
    file: CONTEXT_FN,
    find: "    const jobId = str(a.job_id);",
    replace: "    const jobId = str(c.job_id);",
    guard: E1,
    expect: "the interview's job is read from the application row",
  },
  {
    id: "E3-SERVICE-ROLE-IN-THE-CONTEXT-READ",
    defect:
      "the context read acquires a service-role client, which would make every downstream RLS check decorative",
    file: CONTEXT_FN,
    find: "    const db = context.supabase;",
    replace:
      "    const db = (context as { service_role?: typeof context.supabase }).service_role ?? context.supabase;",
    guard: E3,
    expect: "still holds no service-role client",
  },
];

await runControls("negative-controls:interview-governance", MUTATIONS);
