/**
 * E4 employer final-report negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * employer-final-report-check asserts that the canonical output of this
 * process is provable. None of its 157 assertions, on its own, proves it would
 * NOTICE if that stopped being true: a regex that no longer matches, a table
 * test over a union that lost a member, or an assertion whose subject was
 * renamed all go on printing "ok".
 *
 * Each mutation below introduces exactly one of the defects E4 exists to
 * prevent -- the real defect, in the real file, in the shape a careless edit
 * would actually produce -- and requires a named guard to fail with a named
 * diagnostic. Several are the ORIGINAL defect restored verbatim: the md5
 * hash, the basis that did not name the recruitment, the evidence that all
 * looked the same.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:final-report
 */

import { runControls, type Mutation } from "./runner";

const SEQ = "src/lib/interview-intelligence/final-report.ts";
const PANEL = "src/components/employer/interview/FinalReportSequence.tsx";
const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const MIGRATION = "supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql";
const DICT = "src/i18n/dictionaries.ts";

const E4 = "employer-final-report:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- The digest ------------------------------------------------- */
  {
    id: "E4-HASH-BACK-TO-MD5",
    defect: "the finalised basis is hashed with md5 again, the original defect restored",
    file: MIGRATION,
    find: "  _hash := encode(sha256(_payload::text::bytea), 'hex');",
    replace: "  _hash := md5(_payload::text);",
    guard: E4,
    expect: "8.2 and md5 is gone from the write path",
  },
  {
    id: "E4-HASH-VIA-PGCRYPTO",
    defect:
      "the digest goes through pgcrypto's digest(), which cannot resolve under a pinned search_path on the hosted project",
    file: MIGRATION,
    find: "  _hash := encode(sha256(_payload::text::bytea), 'hex');",
    replace: "  _hash := encode(digest(_payload::text, 'sha256'), 'hex');",
    guard: E4,
    expect: "8.3 and it does NOT use pgcrypto digest()",
  },
  {
    id: "E4-ALGORITHM-NOT-RECORDED",
    defect: "the stored hash no longer says which algorithm produced it",
    file: MIGRATION,
    find: "          _hash, 'sha256', _c.pack_version_id",
    replace: "          _hash, NULL, _c.pack_version_id",
    guard: E4,
    expect: "8.5 as sha256 on every new finalisation",
  },

  /* ---- The basis --------------------------------------------------- */
  {
    id: "E4-ROLE-IS-THE-INTERNAL-TITLE",
    defect:
      "the advertised role is dropped, so the report names only the internal title a recruiter typed for themselves",
    file: MIGRATION,
    find: "      'advertised_role_sv', (SELECT j.title_sv FROM public.jobs j WHERE j.id = _c.job_id),",
    replace: "      'internal_title_only', _c.title,",
    guard: E4,
    expect: "8.6 the basis names the ADVERTISED role in both languages",
  },
  {
    id: "E4-BASIS-FORGETS-THE-APPLICATION",
    defect: "the report stops naming the application and advert it belongs to",
    file: MIGRATION,
    find: "      'application_id', _c.application_id,\n      'job_id', _c.job_id,",
    replace: "      'unnamed', true,",
    guard: E4,
    expect: "8.7 and the application and the advert it belongs to",
  },
  {
    id: "E4-ASSESSMENT-MATERIAL-DROPPED",
    defect: "the report no longer records which assessment material the process ran on",
    file: MIGRATION,
    find: "    'assessment_material', coalesce((",
    replace: "    'unused_block', coalesce((",
    guard: E4,
    expect: "8.8 and the assessment material the process ran on",
  },

  /* ---- Evidence that all looks the same ---------------------------- */
  {
    id: "E4-EVIDENCE-UNCLASSIFIED",
    defect:
      "evidence stops carrying what KIND of thing it is, so a candidate statement and an interviewer observation render identically",
    file: MIGRATION,
    find: "                          'classification',",
    replace: "                          'unused_field',",
    guard: E4,
    expect: "8.9 every evidence item is classified",
  },
  {
    id: "E4-LEVEL-PRESENTED-AS-FACT",
    defect:
      "a human level stops being labelled an interpretation and is presented as a further fact about the person",
    file: MIGRATION,
    find: "                          'kind', 'human_interpretation')",
    replace: "                          'kind', 'established_fact')",
    guard: E4,
    expect: "8.10 and a human level is named an interpretation, not a further fact",
  },
  {
    id: "E4-UNSOURCED-EVIDENCE-GUESSED",
    defect:
      "an evidence item with no source link is silently called an interviewer observation rather than reported as unattributed",
    file: MIGRATION,
    find: "                            ELSE 'unattributed'",
    replace: "                            ELSE 'interviewer_observation'",
    guard: E4,
    expect: "8.11 an item with no source link is reported as unattributed",
  },

  /* ---- The invariants the schema already held ---------------------- */
  {
    id: "E4-BUILDER-READS-LIVE-APPLICATION",
    defect:
      "the report builder reads the live job_applications row again, so material nobody confirmed into evidence reaches a finalised report",
    file: MIGRATION,
    find: "      'application_id', _c.application_id,",
    replace:
      "      'application_id', (SELECT a.id FROM public.job_applications a WHERE a.id = _c.application_id),",
    guard: E4,
    expect: "8.12 the builder reads no live application, Passport, CV or note table",
  },
  {
    id: "E4-SUPERSEDED-BECOMES-EDITABLE",
    defect:
      "the immutability guard stops protecting a superseded version, so a correction no longer preserves the previous one",
    file: MIGRATION,
    find: "  IF OLD.status = 'superseded' THEN\n    RAISE EXCEPTION",
    replace: "  IF false THEN\n    RAISE EXCEPTION",
    guard: E4,
    expect: "8.21 and a superseded version is immutable too",
  },
];

/* ---- The readback -------------------------------------------------- */
const MORE: readonly Mutation[] = [
  {
    id: "E4-READBACK-IS-A-TABLE-SELECT",
    defect:
      "the readback selects the reports table directly, so nothing recomputes the digest and integrity is asserted rather than checked",
    file: RUNTIME,
    find: 'const { data: rows, error } = await context.supabase.rpc("scp_iv_final_report", {\n        _case_id: data.caseId,\n      });',
    replace:
      'const { data: rows, error } = await context.supabase\n        .from("scp_interview_reports")\n        .select("*")\n        .eq("case_id", data.caseId);',
    guard: E4,
    expect: "9.1 the readback goes through the governed RPC",
  },
  {
    id: "E4-ERROR-CODE-DISCARDED",
    defect:
      "the readback throws away the error code, so a refusal and a breakage become the same thing to the screen",
    file: RUNTIME,
    find: "      if (error) {\n        const e = new Error(error.message) as Error & { code?: string };\n        e.code = error.code;\n        throw e;\n      }\n      const row = (Array.isArray(rows) ? rows[0] : null) as",
    replace:
      "      if (error) {\n        throw new Error(error.message);\n      }\n      const row = (Array.isArray(rows) ? rows[0] : null) as",
    guard: E4,
    expect: "9.6 and preserves the error code",
  },
  {
    id: "E4-FAILED-READ-IS-A-ZERO",
    defect:
      'a failed or refused read is reported as `none`, so an outage renders as "no report has been finalised"',
    file: SEQ,
    find: 'export function readbackErrorOutcome(code: string | null | undefined): ReadbackOutcome {\n  return code && REFUSAL_CODES.has(code) ? { kind: "refused" } : { kind: "failed" };\n}',
    replace:
      'export function readbackErrorOutcome(_code: string | null | undefined): ReadbackOutcome {\n  return { kind: "none" };\n}',
    guard: E4,
    expect: "3.10 42501 is a refusal",
  },
  {
    id: "E4-MISMATCH-TREATED-AS-VERIFIED",
    defect:
      "a report whose stored digest does not match its stored basis is presented as a finalised report anyway",
    file: SEQ,
    find: '  return row.hashVerified\n    ? { kind: "verified", report: row }\n    : { kind: "notVerified", report: row };',
    replace: '  return { kind: "verified", report: row };',
    guard: E4,
    expect: "3.2 a mismatching digest is NOT",
  },
  {
    id: "E4-UNVERIFIED-IS-TRUSTWORTHY",
    defect: "an unverified readback is treated as trustworthy enough to present as the report",
    file: SEQ,
    find: 'export function readbackIsTrustworthy(o: ReadbackOutcome): boolean {\n  return o.kind === "verified";\n}',
    replace:
      'export function readbackIsTrustworthy(o: ReadbackOutcome): boolean {\n  return o.kind === "verified" || o.kind === "notVerified";\n}',
    guard: E4,
    expect: "3.5 a mismatch is not",
  },
  {
    id: "E4-REFUSAL-OFFERS-A-RETRY",
    defect:
      "a refusal offers a retry button, inviting a person to press it forever against a permission rule",
    file: PANEL,
    find: "        {!refused && (\n          <button",
    replace: "        {true && (\n          <button",
    guard: E4,
    expect: "5.12 sv: a refusal offers NO retry",
  },
  {
    id: "E4-MISMATCH-NOT-ANNOUNCED",
    defect: "a digest mismatch is styled but never announced, so a screen reader never hears it",
    file: PANEL,
    find: '        <p role="alert" className="mt-1 text-sm text-foreground">\n          {t("iir.readback.notVerified")}',
    replace:
      '        <p className="mt-1 text-sm text-foreground">\n          {t("iir.readback.notVerified")}',
    guard: E4,
    expect: "9.15 and a mismatch is announced rather than only styled",
  },

  /* ---- The sequence ------------------------------------------------ */
  {
    id: "E4-TWO-STEPS-CURRENT",
    defect: "more than one act is current, so the page stops offering ONE clear next action",
    file: SEQ,
    find: '    if (i === at) return { step, state: "current" as const };',
    replace: '    if (i === at || i === at + 1) return { step, state: "current" as const };',
    guard: E4,
    expect: "1.5 exactly one act is current, in every combination",
  },
  {
    id: "E4-FINALISE-WHILE-BLOCKED",
    defect: "finalising becomes the current act while the server still reports a blocker",
    file: SEQ,
    find: "  if (p.blockerCount > 0 || p.assessedCount < p.requirementCount) {",
    replace: "  if (false) {",
    guard: E4,
    expect: "1.6 finalising is never the current act while the server reports a blocker",
  },
  {
    id: "E4-EMPTY-PACK-IS-READY",
    defect:
      "a case with no requirements at all is treated as ready to finalise, because it has no blockers either",
    file: SEQ,
    find: '  if (p.requirementCount === 0) return "reviewAssessmentMaterial";',
    replace: "  if (p.requirementCount === 0) { /* falls through to finalise */ }",
    guard: E4,
    expect: "1.11 a case with NO requirements is never ready to finalise",
  },
  {
    id: "E4-MEMBER-SEES-NOTHING",
    defect:
      "a member who may not finalise is shown no marker at all rather than being told it is somebody else's act",
    file: SEQ,
    find: '    if (step === "finalise" && !p.canFinalise) return { step, state: "notPermitted" as const };',
    replace: "    // removed",
    guard: E4,
    expect: "1.9 a member who may not finalise is TOLD so",
  },
  {
    id: "E4-FINALISE-ENABLED-FOR-MEMBER",
    defect: "the finalise control is offered to a member the database will refuse",
    file: SEQ,
    find: "  if (!p.canFinalise) return false;",
    replace: "  // permission no longer consulted",
    guard: E4,
    expect: "2.3 not without owner or admin",
  },

  /* ---- The boundary ------------------------------------------------ */
  {
    id: "E4-BOUNDARY-DROPS-THE-CANDIDATE",
    defect:
      "the confirmation stops saying the candidate receives nothing -- the one thing a person about to finalise most needs to know",
    file: SEQ,
    find: '  "doesNotShareWithCandidate",',
    replace: "",
    guard: E4,
    expect: "4.2 and the first thing it does NOT do is share with the candidate",
  },
  {
    id: "E4-BOUNDARY-NOT-RENDERED",
    defect: "the boundary is computed but never drawn, so the page states it nowhere",
    file: ROUTE,
    find: "        {!isFinal && <FinaliseBoundary />}",
    replace: "        {false && <FinaliseBoundary />}",
    guard: E4,
    expect: "9.13 and <FinaliseBoundary> is not disabled behind a falsy literal",
  },
  {
    id: "E4-READBACK-NOT-MOUNTED",
    defect: "the readback panel is disabled behind a falsy literal and the page shows no readback",
    file: ROUTE,
    find: "        <FinalReportReadbackPanel",
    replace: "        {false && <FinalReportReadbackPanel",
    guard: E4,
    expect: "9.13 and <FinalReportReadbackPanel> is not disabled behind a falsy literal",
  },
  {
    id: "E4-NO-REFETCH-AFTER-FINALISE",
    defect:
      "finalising no longer refetches the readback, so success is printed from having asked rather than from the server",
    file: ROUTE,
    find: "      void readback.refetch();",
    replace: "      // no refetch",
    guard: E4,
    expect: "9.9 finalising refetches the readback",
  },
  {
    id: "E4-SEQUENCE-COLOUR-ONLY",
    defect: "the current act loses its aria-current, leaving weight and colour as the only signal",
    file: PANEL,
    find: '            aria-current={v.state === "current" ? "step" : undefined}',
    replace: '            data-current={v.state === "current" ? "step" : undefined}',
    guard: E4,
    expect: "6.2 sv: and marked for a screen reader",
  },
  {
    id: "E4-STEP-STATE-NOT-IN-WORDS",
    defect: "the step state stops being named in words, leaving the highlight alone to carry it",
    file: PANEL,
    find: '            <span className="text-xs uppercase tracking-wide">— {t(STATE_LABEL[v.state])}</span>',
    replace: "",
    guard: E4,
    expect: "6.1 sv: the current act is named IN WORDS",
  },

  /* ---- Language ---------------------------------------------------- */
  {
    id: "E4-ENGLISH-COPIES-SWEDISH",
    defect: "an English string is left as the Swedish one, so half the product is untranslated",
    file: DICT,
    find: '    "iir.readback.verified":\n      "Checked: the digest was recomputed from the stored basis and matches.",',
    replace:
      '    "iir.readback.verified":\n      "Kontrollerad: summan räknades om från det sparade underlaget och stämmer.",',
    guard: E4,
    expect: "10.4 and no new key is the same string in both languages",
  },
  {
    id: "E4-COPY-OFFERS-A-VERDICT",
    defect: "the report copy starts offering a suitability verdict",
    file: DICT,
    find: '    "iir.seq.finalise": "Färdigställ rapporten",',
    replace: '    "iir.seq.finalise": "Färdigställ rapporten och rangordna kandidaten",',
    guard: E4,
    expect:
      '10.5 and no string outside the "does not do" list mentions a recommendation or ranking',
  },
];

await runControls("final-report", [...MUTATIONS, ...MORE]);
