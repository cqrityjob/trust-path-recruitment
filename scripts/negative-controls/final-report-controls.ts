/**
 * E4 employer final-report negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * employer-final-report-check asserts that the canonical output of this
 * process is provable. None of its assertions, on its own, proves it would
 * NOTICE if that stopped being true: a regex that no longer matches, a table
 * test over a union that lost a member, or an assertion whose subject was
 * renamed all go on printing "ok".
 *
 * Each mutation below introduces exactly one of the defects E4 exists to
 * prevent -- the real defect, in the real file, in the shape a careless edit
 * would actually produce -- and requires a named guard to fail with a named
 * diagnostic. Several are the ORIGINAL defect restored verbatim: the md5
 * hash, the one assessor chosen by LIMIT 1 with no ORDER BY, the aggregate
 * with no ORDER BY, the Passport disclosure called verified, the finalisation
 * that took no previewed identity, the report drawn from live data.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:final-report
 */

import { runControls, type Mutation } from "./runner";

const SEQ = "src/lib/interview-intelligence/final-report.ts";
const PANEL = "src/components/employer/interview/FinalReportSequence.tsx";
const DOCUMENT = "src/components/employer/interview/FinalReportDocument.tsx";
const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const MIGRATION = "supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql";
const ROLLBACK = "supabase/rollback/20261107090000_scp_iv_report_basis_integrity_rollback.sql";
const DB_TEST = "scripts/db-test.sh";
const DICT = "src/i18n/dictionaries.ts";

const E4 = "employer-final-report:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- The digest ------------------------------------------------- */
  {
    id: "E4-HASH-BACK-TO-MD5",
    defect: "the finalised basis is hashed with md5 again, the original defect restored",
    file: MIGRATION,
    find: "  _hash := public.scp_iv_content_hash(_payload);",
    replace: "  _hash := md5(_payload::text);",
    guard: E4,
    expect: "8.2 md5 is gone from the write path",
  },
  {
    id: "E4-HASH-VIA-PGCRYPTO",
    defect:
      "the digest goes through pgcrypto's digest(), which cannot resolve under a pinned search_path on the hosted project",
    file: MIGRATION,
    find: "  SELECT encode(sha256(convert_to(_payload::text, 'UTF8')), 'hex');",
    replace: "  SELECT encode(digest(_payload::text, 'sha256'), 'hex');",
    guard: E4,
    expect: "8.3 and it does NOT use pgcrypto digest()",
  },
  {
    id: "E4-HASH-OVER-BYTEA-CAST",
    defect:
      "the digest is taken over text::bytea, which parses bytea escape syntax and fails on a payload containing a quote",
    file: MIGRATION,
    find: "  SELECT encode(sha256(convert_to(_payload::text, 'UTF8')), 'hex');",
    replace: "  SELECT encode(sha256(_payload::text::bytea), 'hex');",
    guard: E4,
    expect: "8.1b and nothing casts text to bytea",
  },
  {
    id: "E4-ALGORITHM-NOT-RECORDED",
    defect: "the stored hash no longer says which algorithm produced it",
    file: MIGRATION,
    find: "          _hash, 'sha256', _basis, _c.pack_version_id, _c.pack_content_hash,",
    replace: "          _hash, NULL, _basis, _c.pack_version_id, _c.pack_content_hash,",
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

  /* ---- The assessment RESULT, bound ------------------------------- */
  {
    id: "E4-RESULT-NOT-BOUND-TO-VERSION",
    defect:
      "the released result is carried without the release version it came from, so a later re-release could pass as this one",
    file: MIGRATION,
    find: "                          'report_version_id', ident.report_version_id,",
    replace: "                          'unbound', NULL,",
    guard: E4,
    expect: "8.8c bound to the exact snapshot, release version and release time",
  },
  {
    id: "E4-FINDINGS-NAMED-NOT-CARRIED",
    defect:
      "the assessment material is named but its released findings are dropped -- the report says an assessment happened and not what it found",
    file: MIGRATION,
    find: "                          'findings', er.safety_flags,\n                          'context', er.context,\n",
    replace:
      "                          'findings', '[]'::jsonb,\n                          'context', er.context,\n",
    guard: E4,
    expect: "8.8e the released findings are carried in the bound result itself",
  },
  {
    id: "E4-SNAPSHOT-TABLE-READ-DIRECTLY",
    defect:
      "the builder reads the assessment snapshot table itself instead of the assessment domain's governed projection (TR12.3)",
    file: MIGRATION,
    find: "                   FROM public.scp_employer_report(at.id) er",
    replace:
      "                   FROM (SELECT s.id, s.payload, s.brief, s.safety_flags, s.context, s.limitations_sv, s.limitations_en FROM public.scp_report_snapshots s WHERE s.attempt_id = at.id) er",
    guard: E4,
    expect: "8.13 and no scp_iv_ function names the assessment snapshot or evidence table (TR12.3)",
  },

  /* ---- Every assessor, in a declared order ------------------------ */
  {
    id: "E4-ONE-ASSESSOR-BY-HEAP",
    defect:
      "one assessment per question is picked with LIMIT 1 and no ORDER BY -- the original defect, where the heap chose whose judgement became the employer's report",
    file: MIGRATION,
    find: "               'assessor_count', (",
    replace:
      "               'assessment', (SELECT to_jsonb(a) FROM public.scp_interview_assessments a WHERE a.case_id = _case_id AND a.question_id = q.id AND a.superseded_by IS NULL LIMIT 1),\n               'assessor_count', (",
    guard: E4,
    expect: "8.25 no assessment is picked with LIMIT 1",
  },
  {
    id: "E4-ASSESSORS-IN-HEAP-ORDER",
    defect:
      "the assessments aggregate loses its ORDER BY, so which assessor comes first -- and the digest -- depends on physical row order",
    file: MIGRATION,
    find: "                        ORDER BY a.assessor_id, a.assessed_at, a.id)",
    replace: "                        )",
    guard: E4,
    expect: "8.27 in an order declared by who assessed, when, and an immutable id",
  },
  {
    id: "E4-AGGREGATE-UNORDERED",
    defect:
      "the evidence aggregate loses its ORDER BY, so the same case can produce two payloads with two digests",
    file: MIGRATION,
    find: "                        ORDER BY ev.confirmed_at, ev.id)",
    replace: "                        )",
    guard: E4,
    expect: "8.31 and every one of them carries an ORDER BY inside its own parentheses",
  },
  {
    id: "E4-TIEBREAKER-DROPPED",
    defect:
      "the evidence ORDER BY loses its immutable tie-breaker, so two items confirmed in the same instant can swap places between two builds",
    file: MIGRATION,
    find: "                        ORDER BY ev.confirmed_at, ev.id)",
    replace: "                        ORDER BY ev.confirmed_at)",
    guard: E4,
    expect: "8.32 and each ORDER BY ends in an immutable tie-breaker",
  },
  {
    id: "E4-LIMIT-WITHOUT-ORDER",
    defect: "a LIMIT 1 in the builder is left without an ORDER BY above it",
    file: MIGRATION,
    find: "                  ORDER BY er.id\n                  LIMIT 1))",
    replace: "                  LIMIT 1))",
    guard: E4,
    expect: "8.34 and every LIMIT 1 left in the builder sits under an ORDER BY",
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
    id: "E4-DISCLOSURE-CALLED-VERIFIED",
    defect:
      "a line from a Passport disclosure is classified as verified material on the strength of its source kind alone -- the original defect restored",
    file: MIGRATION,
    find: "WHEN 'passport_disclosure'   THEN 'passport_disclosure'",
    replace: "WHEN 'passport_disclosure'   THEN 'verified_material'",
    guard: E4,
    expect: "8.11b a Passport disclosure is classified as what it is",
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

  /* ---- Preview equals finalisation --------------------------------- */
  {
    id: "E4-FINALISE-TAKES-NO-IDENTITY",
    defect:
      "the previewed identity becomes optional on the finalisation function, so a client can finalise what nobody previewed",
    file: MIGRATION,
    find: "  _case_id uuid, _expected_basis_hash text, _draft_run_id uuid DEFAULT NULL)",
    replace:
      "  _case_id uuid, _expected_basis_hash text DEFAULT NULL, _draft_run_id uuid DEFAULT NULL)",
    guard: E4,
    expect: "8.36 finalisation takes the identity the owner previewed",
  },
  {
    id: "E4-STALE-PREVIEW-ACCEPTED",
    defect:
      "the comparison between the previewed identity and the basis about to be locked is short-circuited, so a stale preview finalises",
    file: MIGRATION,
    find: "  IF _expected_basis_hash <> _basis THEN",
    replace: "  IF false THEN",
    guard: E4,
    expect: "8.38 finalisation refuses without an identity and refuses a stale one",
  },
  {
    id: "E4-PREVIEW-IS-ANOTHER-BUILDER",
    defect:
      "the preview stops calling the builder finalisation calls, so what the owner reads and what is locked are two code paths again",
    file: MIGRATION,
    find: "  _p := public.scp_iv_build_report_basis(_case_id);",
    replace: "  _p := jsonb_build_object('case', jsonb_build_object('candidate', 'preview'));",
    guard: E4,
    expect: "8.35 preview and finalisation call the SAME builder",
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

  /* ---- A finding can be written ------------------------------------ */
  {
    id: "E4-FINDINGS-GUARD-READS-A-MISSING-COLUMN",
    defect:
      "the origin guard reads NEW.note_id on every table again, so no row can be written to scp_interview_findings and the report's unresolved section is always empty -- the defect the fixture found, restored",
    file: MIGRATION,
    find: "  IF TG_TABLE_NAME IN ('scp_interview_evidence_proposals', 'scp_interview_evidence') THEN\n    IF NEW.note_id IS NOT NULL THEN",
    replace: "  IF true THEN\n    IF NEW.note_id IS NOT NULL THEN",
    guard: E4,
    expect: "8.41 the guard reads the note link only on the two tables that have one",
  },
  {
    id: "E4-EVIDENCE-CALLED-COMPLETE-WITHOUT-CAPTURES",
    defect: "the evidence index stops calling the phase blocked while no capture exists",
    file: "artifacts/employer-final-report-e4/INDEX.md",
    find: "**STATUS: BLOCKED — no captures exist yet.**",
    replace: "**STATUS: complete.**",
    guard: E4,
    expect: "13.9 and calls #216 blocked exactly while no captures exist",
  },
  {
    id: "E4-EVIDENCE-SPEC-WRITES-ANYWHERE",
    defect: "the evidence spec's database side-effects stop refusing a non-loopback host",
    file: "e2e/employer-final-report-evidence.spec.ts",
    find: "  if (!/^(127\\.0\\.0\\.1|localhost)$/.test(PG.host)) {\n    throw new Error(`E4 evidence writes only to the local stack, not ${PG.host}`);\n  }",
    replace: "  // any host",
    guard: E4,
    expect: "13.2 and its database side-effects refuse any host that is not loopback",
  },

  /* ---- The rollback ----------------------------------------------- */
  {
    id: "E4-ROLLBACK-DOES-NOT-RESTORE",
    defect:
      "the rollback drops the new finalisation but restores the previous one under another name, leaving no scp_iv_finalise_report at all",
    file: ROLLBACK,
    find: "CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(_case_id uuid, _draft_run_id uuid DEFAULT NULL)",
    replace:
      "CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report_previous(_case_id uuid, _draft_run_id uuid DEFAULT NULL)",
    guard: E4,
    expect: "12.2 and restores the previous two-argument one",
  },
  {
    id: "E4-ROLLBACK-NOT-EXERCISED",
    defect:
      "the suite stops applying the rollback and merely reads a constant, so rollback is described rather than exercised",
    file: DB_TEST,
    find: '  -f supabase/rollback/20261107090000_scp_iv_report_basis_integrity_rollback.sql 2>&1)"',
    replace: '  -c "SELECT \'SCP_IV_REPORT_BASIS_ROLLBACK ok\'" 2>&1)"',
    guard: E4,
    expect: "12.6 the suite APPLIES the rollback and reads its proof",
  },
];

/* ---- The readback and the client ---------------------------------- */
const MORE: readonly Mutation[] = [
  {
    id: "E4-READBACK-IS-A-TABLE-SELECT",
    defect:
      "the readback selects the reports table directly, so nothing recomputes the digest and integrity is asserted rather than checked",
    file: RUNTIME,
    find: '    const { data: rows, error } = await context.supabase.rpc("scp_iv_final_report", {\n      _case_id: data.caseId,\n    });',
    replace:
      '    const { data: rows, error } = await context.supabase\n      .from("scp_interview_reports")\n      .select("*")\n      .eq("case_id", data.caseId);',
    guard: E4,
    expect: "9.1 the readback goes through the governed RPC",
  },
  {
    id: "E4-ERROR-CODE-DISCARDED",
    defect:
      "the readback throws away the error code, so a refusal and a breakage become the same thing to the screen",
    file: RUNTIME,
    find: '    const { data: rows, error } = await context.supabase.rpc("scp_iv_final_report", {\n      _case_id: data.caseId,\n    });\n    if (error) {\n      const e = new Error(error.message) as Error & { code?: string };\n      e.code = error.code;\n      throw e;\n    }',
    replace:
      '    const { data: rows, error } = await context.supabase.rpc("scp_iv_final_report", {\n      _case_id: data.caseId,\n    });\n    if (error) {\n      throw new Error(error.message);\n    }',
    guard: E4,
    expect: "9.6 and preserves the error code",
  },
  {
    id: "E4-ACTOR-NOT-CARRIED-TO-THE-SCREEN",
    defect:
      "the readback mapping drops the governed name and address, so the screen has only an account id to show for who finalised",
    file: RUNTIME,
    find: "    finalisedByName: row.finalised_by_name,\n    finalisedByEmail: row.finalised_by_email,",
    replace: "    finalisedByName: null,\n    finalisedByEmail: null,",
    guard: E4,
    expect: "9.5b and the actor's name and address",
  },
  {
    id: "E4-FINALISE-WITHOUT-HASH",
    defect:
      "the server function stops requiring the previewed identity, so the client can send an empty one and the database's check is met with a blank",
    file: RUNTIME,
    find: "        expectedBasisHash: z.string().min(1),",
    replace: "        expectedBasisHash: z.string().optional(),",
    guard: E4,
    expect: "9.16 it REQUIRES the previewed identity",
  },
  {
    id: "E4-IDENTITY-NOT-FROM-THE-PREVIEW",
    defect:
      "the identity sent to finalisation is no longer the one from the preview in hand, so the screen could lock something the owner did not read",
    file: ROUTE,
    find: "        expectedBasisHash: previewInHand.basisHash,",
    replace: '        expectedBasisHash: "recomputed-elsewhere",',
    guard: E4,
    expect: "9.19 the identity sent is the identity of the preview IN HAND",
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
    id: "E4-ACTOR-FALLS-BACK-TO-A-PLACEHOLDER",
    defect:
      "an actor that cannot be resolved is given a placeholder string, which the screen would print as if it were a name",
    file: SEQ,
    find: "  return r.finalisedByName?.trim() || r.finalisedByEmail?.trim() || null;",
    replace: '  return r.finalisedByName?.trim() || r.finalisedByEmail?.trim() || "unknown";',
    guard: E4,
    expect: "3.15 and null, never a uuid, when neither can be resolved",
  },

  /* ---- The preview gate -------------------------------------------- */
  {
    id: "E4-NO-PREVIEW-STILL-FINALISES",
    defect:
      "the finalise control is enabled with no preview in hand, so there is no identity to send",
    file: SEQ,
    find: "  if (!preview || preview.blockerCount > 0) return false;",
    replace: "  if (preview && preview.blockerCount > 0) return false;",
    guard: E4,
    expect: "2.9 with NO preview in hand it may not",
  },
  {
    id: "E4-STALE-PREVIEW-STILL-COUNTS",
    defect:
      "a preview the server called stale still enables the finalise control, inviting the owner to send the same stale identity again",
    file: SEQ,
    find: '  if (outcome.kind === "stalePreview") return false;',
    replace: "  // a stale preview is treated as current",
    guard: E4,
    expect: "2.10 and a preview the server called stale is not a preview",
  },
  {
    id: "E4-STALE-IS-JUST-A-FAILURE",
    defect:
      "SCP_IV_STALE_PREVIEW is no longer told apart from a breakage, so the owner is not told to preview again",
    file: SEQ,
    find: '  ["SCP_IV_STALE_PREVIEW", { kind: "stalePreview" }],\n',
    replace: "",
    guard: E4,
    expect: "2.15 SCP_IV_STALE_PREVIEW is a stale preview",
  },
  {
    id: "E4-STALE-NOT-RENDERED",
    defect:
      "the stale state no longer reaches the finalisation control, so the screen shows nothing when the server refuses",
    file: ROUTE,
    find: '                stale={outcome.kind === "stalePreview"}',
    replace: "                stale={false}",
    guard: E4,
    expect: "9.23 a stale preview reaches the finalisation control as a state",
  },

  /* ---- The document ------------------------------------------------ */
  {
    id: "E4-DOCUMENT-READS-LIVE",
    defect:
      "the document component starts querying, so a 'locked' report can render live case data rather than the finalised payload",
    file: DOCUMENT,
    find: 'import { useT } from "@/i18n/context";',
    replace:
      'import { useT } from "@/i18n/context";\nimport { useQuery } from "@tanstack/react-query";',
    guard: E4,
    expect: "11.35 the document imports no server function, query or client",
  },
  {
    id: "E4-ONE-ASSESSOR-RENDERED",
    defect:
      "the document renders only the first assessor, so a two-person panel reads as one judgement",
    file: DOCUMENT,
    find: "                  {q.assessments.map((a) => (",
    replace: "                  {q.assessments.slice(0, 1).map((a) => (",
    guard: E4,
    expect: "11.7 sv: BOTH assessors' rationales are on the page",
  },
  {
    id: "E4-DISAGREEMENT-HIDDEN",
    defect: "the parser reports every panel as agreeing, so disagreement is never stated",
    file: SEQ,
    find: "        levelsAgree: q.levels_agree !== false,",
    replace: "        levelsAgree: true,",
    guard: E4,
    expect: "11.2 and the disagreement",
  },
  {
    id: "E4-DISCLOSURE-BADGE-SAYS-VERIFIED",
    defect: "the Passport disclosure badge claims the material was verified",
    file: DICT,
    find: '    "iir.doc.cls.passport_disclosure": "Passport disclosure (not verified here)",',
    replace: '    "iir.doc.cls.passport_disclosure": "Verified Passport material",',
    guard: E4,
    expect: "10.6 the Passport disclosure badge says in words, in each language",
  },
  {
    id: "E4-UNNAMED-ACTOR-PRINTS-A-UUID",
    defect: "an actor that cannot be named is printed as the account id",
    file: DOCUMENT,
    find: '                  : t("iir.doc.identity.byUnknown")}',
    replace:
      '                  : t("iir.doc.identity.by").replace("{who}", readback.finalisedBy ?? "")}',
    guard: E4,
    expect: "11.39 sv: and never printed as an account id",
  },
  {
    id: "E4-PREVIEW-IS-NOT-THE-DOCUMENT",
    defect:
      "the preview mounting is fed something other than the server's preview, so what the owner reads is not what is locked",
    file: ROUTE,
    find: '              mode={{ kind: "preview", preview: previewInHand }}',
    replace:
      '              mode={{ kind: "final", readback: readbackState.kind === "verified" ? readbackState.report : (null as never) }}',
    guard: E4,
    expect: "9.21 the preview mounting is fed the server's preview",
  },
  {
    id: "E4-HISTORY-RENDERED-UNVERIFIED",
    defect: "an opened earlier version is rendered without its digest having recomputed",
    file: ROUTE,
    find: "            opened.data.report.hashVerified &&\n",
    replace: "",
    guard: E4,
    expect: "9.27 an opened historical version is rendered only when its digest recomputes",
  },
  {
    id: "E4-DOCUMENT-NOT-MOUNTED",
    defect:
      "the current final report is disabled behind a falsy literal and the page shows no document",
    file: ROUTE,
    find: "              payload={readbackState.report.payload}",
    replace: "              payload={(false && readbackState.report.payload) as never}",
    guard: E4,
    expect: "9.22 and the final and historical mountings are fed the readback's exact payload",
  },

  /* ---- The readback panel ------------------------------------------ */
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
    find: "      const [rb] = await Promise.all([readback.refetch(), versions.refetch()]);",
    replace: "      const [rb] = await Promise.all([versions.refetch()]);",
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
