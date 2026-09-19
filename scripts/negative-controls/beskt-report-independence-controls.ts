/**
 * BESKT report independence boundary — planted negative controls.
 *
 * Every material assertion of scripts/beskt-report-independence-check.ts must
 * detect a planted defect in the REAL computation: the migration's function
 * bodies, its grants, its postflight, the rollback's restoration, the suite's
 * own proofs and the release bookkeeping. Never a comment, and never a
 * sentence that merely describes the rule.
 *
 * ── THE ONES THAT MATTER MOST ──────────────────────────────────────────
 *
 * The first four DISABLE THE AUTHORISATION COMPUTATION ITSELF — they remove
 * the independence check, remove the case authority, remove the
 * authentication, and neuter the predicate at its call site. If the guard
 * still passes with any of those applied, the guard is decorative and the
 * boundary it claims to protect is unguarded.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner, which refuses to start against a dirty tree and re-checks at the
 * end).
 *
 * Run: bun run negative-controls:beskt-report-independence
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261127090000_bcp_conduct_report_independence_boundary.sql";
const RB = "supabase/rollback/20261127090000_bcp_conduct_report_independence_boundary_rollback.sql";
const SUITE = "supabase/tests/bcp_conduct_report_independence_test.sql";
const PR6 = "supabase/tests/bcp_conduct_prompts_and_report_test.sql";
const DB = "scripts/db-test.sh";
const STATE = "supabase/release-state.json";
const FRONTIER = "scripts/release-frontier-check.ts";
const PKG = "package.json";
const CI = ".github/workflows/ci.yml";

const CB_MIG = "supabase/migrations/20261128090000_scp_iv_case_candidate_binding.sql";

const GUARD = "beskt-report-independence:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The interview-case candidate binding (20261128090000) --------------
  {
    id: "CBD-NC-APPLICANT-CHECK-REMOVED",
    defect:
      "THE ORIGINAL DEFECT: the applicant comparison is gone, so any account can be bound to a case on the employer's own application",
    file: CB_MIG,
    find: "            AND a.applicant_user_id = _candidate_user_id) THEN",
    replace: "            AND true) THEN",
    guard: GUARD,
    expect:
      "CANDIDATE-BINDING: the account must be the applicant of an application of THIS employer",
  },
  {
    id: "CBD-NC-NO-APPLICATION-ALLOWED",
    defect: "a candidate account with no application is accepted again",
    file: CB_MIG,
    find: "    IF _application_id IS NULL THEN\n      RAISE EXCEPTION 'SCP_IV_CANDIDATE_REQUIRES_APPLICATION",
    replace: "    IF false THEN\n      RAISE EXCEPTION 'SCP_IV_CANDIDATE_REQUIRES_APPLICATION",
    guard: GUARD,
    expect: "CANDIDATE-BINDING: a candidate account with no application is refused",
  },
  {
    id: "CBD-NC-EMPLOYER-SCOPE-DROPPED",
    defect:
      "the applicant is matched on any employer's application, so a member binds another employer's applicant",
    file: CB_MIG,
    find: "            AND a.employer_id = _employer_id\n            AND a.applicant_user_id = _candidate_user_id) THEN",
    replace: "            AND a.applicant_user_id = _candidate_user_id) THEN",
    guard: GUARD,
    expect:
      "CANDIDATE-BINDING: the account must be the applicant of an application of THIS employer",
  },
  {
    id: "CBD-NC-OLDER-BODY-COPIED",
    defect:
      "the migration carries an older body without the start-basis rule, re-introducing an earlier defect",
    file: CB_MIG,
    find: "  _basis := public.scp_iv_case_start_basis(_employer_id, _pack_version_id, auth.uid());",
    replace: "  _basis := 'published';",
    guard: GUARD,
    expect:
      "CANDIDATE-BINDING: every later rule of the function is kept, and the employer check still comes first",
  },
  {
    id: "CBD-NC-PRECONDITION-REMOVED",
    defect: "the migration no longer refuses to overwrite a newer definition",
    file: CB_MIG,
    find: "  IF _md5 <> '24cfc8e7f612df1cb3bd6e97af6e805a' THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "CANDIDATE-BINDING: the migration refuses to overwrite any body but the one it extends",
  },
  {
    id: "CBD-NC-PR2-REAPPLY-BURIES-RULE",
    defect:
      "db:test stops putting the binding back after BESKT PR 2's re-apply, so the replayed function silently loses it",
    file: DB,
    find: '  echo "FAIL: BESKT PR 2 was re-applied and the interview-case candidate binding did NOT come back with it." >&2',
    replace: '  echo "FAIL: pr2." >&2',
    guard: GUARD,
    expect: "CANDIDATE-BINDING: after BESKT PR 2's re-apply the rule is put back on top and proved",
  },
  {
    id: "CBD-NC-SUITE-SHRINK",
    defect: "a shrunk candidate binding suite is tolerated",
    file: DB,
    find: 'if [ "$CBD_PASSED" -lt 18 ]; then',
    replace: 'if [ "$CBD_PASSED" -lt 0 ]; then',
    guard: GUARD,
    expect: "CANDIDATE-BINDING: db:test runs the suite and refuses a shrunk or failed one",
  },
  {
    id: "CBD-NC-FRONTIER-STALE",
    defect:
      "the applied migration is put back on the frontier's pending list, hiding the next stuck one",
    file: FRONTIER,
    find: "const expectedPending: string[] = [",
    replace:
      'const expectedPending: string[] = ["20261128090000_scp_iv_case_candidate_binding.sql", ',
    guard: GUARD,
    expect: "CANDIDATE-BINDING: and it is OFF the frontier's pending list",
  },
  {
    id: "CBD-NC-EVIDENCE-LEDGER-ONLY",
    defect:
      "the evidence no longer names the verified body, so a ledger row alone would pass as proof",
    file: STATE,
    find: "945372c712b96b9c29f0683f5bae70ec",
    replace: "ledger-row-only",
    guard: GUARD,
    expect:
      "CANDIDATE-BINDING: the evidence names the verified function body, not only the ledger row",
  },
  {
    id: "CBD-NC-STATE-BACK-TO-PENDING",
    defect:
      "release-state says the applied fix is still pending, so the deploy plan and the record disagree",
    file: STATE,
    find:
      '      "file": "20261128090000_scp_iv_case_candidate_binding.sql", \n' +
      '      "hostedState": "applied",',
    replace:
      '      "file": "20261128090000_scp_iv_case_candidate_binding.sql", \n' +
      '      "hostedState": "pending",',
    guard: GUARD,
    expect: "CANDIDATE-BINDING: declared APPLIED at its hosted version, with its rollback",
  },
  // ---- The authorisation computation itself -------------------------------
  {
    id: "RIB-NC-INDEPENDENCE-REMOVED",
    defect:
      "THE ORIGINAL DEFECT: the independence check is removed from the preview, so an assessor with an open position reads every colleague's record again",
    file: MIG,
    find:
      "  IF NOT public.bcp_conduct_may_see_others(_session_id) THEN\n" +
      "    RAISE EXCEPTION\n" +
      "      'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position first; the report rests on every assessor''s record.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;",
    replace: "",
    guard: GUARD,
    expect: "BOUNDARY-PREVIEW: it refuses unless bcp_conduct_may_see_others(_session_id) is true",
  },
  {
    id: "RIB-NC-INDEPENDENCE-NEUTERED",
    defect:
      "the predicate is still CALLED but its answer is thrown away — the shape of the check survives while the check does not, which is the version a source guard is most likely to miss",
    file: MIG,
    find: "  IF NOT public.bcp_conduct_may_see_others(_session_id) THEN",
    replace: "  IF (NOT public.bcp_conduct_may_see_others(_session_id)) AND false THEN",
    guard: GUARD,
    expect: "BOUNDARY-PREVIEW: it refuses unless bcp_conduct_may_see_others(_session_id) is true",
  },
  {
    id: "RIB-NC-BLOCKERS-AUTH-REMOVED",
    defect:
      "the blocker reader stops authenticating, so it answers an unauthenticated caller exactly as it did before the fix",
    file: MIG,
    find:
      "  IF auth.uid() IS NULL THEN\n" +
      "    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n\n" +
      "  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;",
    replace: "  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;",
    guard: GUARD,
    expect: "BOUNDARY-BLOCKERS: it authenticates",
  },
  {
    id: "RIB-NC-BLOCKERS-CASE-AUTHORITY-REMOVED",
    defect:
      "the blocker reader stops applying the case authority, so any signed-in user reads the shape of a stranger's interview",
    file: MIG,
    find:
      "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n\n" +
      "  SELECT count(*), count(*) FILTER (WHERE state <> 'locked')",
    replace: "  SELECT count(*), count(*) FILTER (WHERE state <> 'locked')",
    guard: GUARD,
    expect: "BOUNDARY-BLOCKERS: and applies the case authority",
  },
  {
    id: "RIB-NC-PREVIEW-CASE-AUTHORITY-REMOVED",
    defect:
      "the preview keeps the independence rule but loses the case authority, so another employer's member reaches it once they hold a position of their own",
    file: MIG,
    find:
      "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n\n" +
      "  -- THE FIX.",
    replace: "  -- THE FIX.",
    guard: GUARD,
    expect: "BOUNDARY-PREVIEW: the existing case authority is kept, not replaced",
  },
  {
    id: "RIB-NC-CHECK-ORDER-INVERTED",
    defect:
      "the independence rule is checked BEFORE the case authority, so a stranger learns the lifecycle state of a case that is none of their business",
    file: MIG,
    find:
      "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n\n" +
      "  -- THE FIX.",
    replace:
      "  IF NOT public.bcp_conduct_may_see_others(_session_id) THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_NOT_VISIBLE_YET: early.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n" +
      "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n" +
      "    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n\n" +
      "  -- THE FIX.",
    guard: GUARD,
    expect: "BOUNDARY-PREVIEW: the case authority is checked BEFORE the independence rule",
  },
  {
    id: "RIB-NC-BASIS-BUILT-BEFORE-CHECK",
    defect:
      "the payload is assembled before the independence rule runs, so the refusal happens after the data has already been gathered",
    file: MIG,
    find:
      "  -- THE FIX. The independence rule, applied to the document as it is applied\n" +
      "  -- to every other read of the record.",
    replace:
      "  _payload := public.bcp_conduct_build_report_basis(_session_id);\n" +
      "  -- THE FIX. The independence rule, applied to the document as it is applied\n" +
      "  -- to every other read of the record.",
    guard: GUARD,
    expect: "BOUNDARY-PREVIEW: the basis is built only after the independence rule has passed",
  },
  {
    id: "RIB-NC-WRONG-ERROR-CLASS",
    defect:
      "the refusal is raised as a check violation rather than insufficient_privilege, so a client maps an authorisation refusal onto a data problem",
    file: MIG,
    find:
      "      'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position first; the report rests on every assessor''s record.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';",
    replace:
      "      'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position first; the report rests on every assessor''s record.'\n" +
      "      USING ERRCODE = 'check_violation';",
    guard: GUARD,
    expect: "BOUNDARY-PREVIEW: raised as insufficient_privilege",
  },

  // ---- The oracle and the blast radius ------------------------------------
  {
    id: "RIB-NC-HELPER-GRANTED",
    defect:
      "the internal basis builder is granted to authenticated, so the whole fix can be walked around by calling the helper directly",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_conduct_report_blockers(uuid) FROM PUBLIC, anon;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.bcp_conduct_build_report_basis(uuid) TO authenticated;\n" +
      "REVOKE ALL ON FUNCTION public.bcp_conduct_report_blockers(uuid) FROM PUBLIC, anon;",
    guard: GUARD,
    expect: "BOUNDARY-ORACLE: and the migration does not grant it to anybody",
  },
  {
    id: "RIB-NC-POSTFLIGHT-ORACLE-PROOF-REMOVED",
    defect:
      "the postflight stops refusing when the basis builder is client-callable, so the one check that keeps the fix from becoming decorative is gone",
    file: MIG,
    find:
      "  IF has_function_privilege('authenticated',\n" +
      "       'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE')\n" +
      "     OR has_function_privilege('anon',\n" +
      "       'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE') THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect:
      "BOUNDARY-ORACLE: the postflight refuses if bcp_conduct_build_report_basis became client-callable",
  },
  {
    id: "RIB-NC-ANON-GRANTED",
    defect: "the preview is left executable by PUBLIC, so anon reaches a governed document",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_conduct_preview_report(uuid) FROM PUBLIC, anon;",
    replace: "",
    guard: GUARD,
    expect: "BOUNDARY-GRANTS: both readers are revoked from PUBLIC and anon",
  },
  {
    id: "RIB-NC-SEARCH-PATH-DROPPED",
    defect:
      "one of the SECURITY DEFINER readers loses its pinned search_path, which is a worse defect than the one being fixed",
    file: MIG,
    find: "RETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  _caller uuid := auth.uid();",
    replace:
      "RETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nAS $$\nDECLARE\n  _caller uuid := auth.uid();",
    guard: GUARD,
    expect: "BOUNDARY-DEFINER: both keep SECURITY DEFINER with a pinned search_path",
  },
  {
    id: "RIB-NC-SCOPE-CREEP-POLICY",
    defect:
      "the security fix quietly changes a row policy as well, which is a second change hiding inside a change nobody will read twice",
    file: MIG,
    find: "COMMIT;",
    replace:
      "CREATE POLICY bcp_conduct_entries_extra_read ON public.bcp_conduct_entries\n  FOR SELECT TO authenticated USING (true);\n\nCOMMIT;",
    guard: GUARD,
    expect: "BOUNDARY-SCOPE: no table and no policy is changed",
  },
  {
    id: "RIB-NC-SCOPE-CREEP-DML",
    defect: "the migration starts writing rows, so a security fix also seeds data",
    file: MIG,
    find: "COMMIT;",
    replace:
      "INSERT INTO public.bcp_events (event) VALUES ('conduct_report_finalised');\n\nCOMMIT;",
    guard: GUARD,
    expect: "BOUNDARY-SCOPE: no row is written",
  },
  {
    id: "RIB-NC-PRECONDITION-REMOVED",
    defect:
      "the migration stops refusing on a base that lacks the predicate it leans on, so it would silently create an unguarded function on a wrong base",
    file: MIG,
    find:
      "  IF to_regprocedure('public.bcp_conduct_may_see_others(uuid)') IS NULL THEN\n" +
      "    RAISE EXCEPTION\n" +
      "      'BCP_PRECONDITION: public.bcp_conduct_may_see_others(uuid) is missing; the base must include 20261113090000.';\n" +
      "  END IF;",
    replace: "",
    guard: GUARD,
    expect: "BOUNDARY-PRECONDITION: it refuses on a base that lacks the predicate it leans on",
  },

  // ---- The rollback --------------------------------------------------------
  {
    id: "RIB-NC-ROLLBACK-DOES-NOT-RESTORE",
    defect:
      "the rollback leaves the independence check in place, so it claims to undo the migration while undoing nothing — and a later re-apply proof would pass for the wrong reason",
    file: RB,
    find: "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;\n\n  _payload := public.bcp_conduct_build_report_basis(_session_id);",
    replace:
      "  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;\n\n  IF NOT public.bcp_conduct_may_see_others(_session_id) THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_NOT_VISIBLE_YET: still guarded.'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;\n\n  _payload := public.bcp_conduct_build_report_basis(_session_id);",
    guard: GUARD,
    expect: "BOUNDARY-ROLLBACK: the restored preview does NOT carry the independence check",
  },
  {
    id: "RIB-NC-ROLLBACK-SILENT-ABOUT-COST",
    defect:
      "the rollback stops saying that running it reopens two authorisation holes, so whoever runs it at two in the morning has to work that out from the diff",
    file: RB,
    find: "-- It REOPENS two authorisation holes. After this script runs:",
    replace: "-- After this script runs:",
    guard: GUARD,
    expect:
      "BOUNDARY-ROLLBACK: it states, in the file somebody runs at two in the morning, that it reopens the holes",
  },
  {
    id: "RIB-NC-ROLLBACK-NOT-ATOMIC",
    defect:
      "the rollback stops being one transaction, so a failure halfway leaves one reader restored and the other guarded",
    file: RB,
    find: "\nBEGIN;\n",
    replace: "\n",
    guard: GUARD,
    expect:
      "BOUNDARY-ROLLBACK: one transaction, so a failure restores nothing rather than half of it",
  },

  // ---- The suite -----------------------------------------------------------
  {
    id: "RIB-NC-SUITE-NOT-THROUGH-THE-ROLE",
    defect:
      "the suite stops acting through the real `authenticated` role, so every refusal would be measured against the owner, who bypasses row policies anyway",
    file: SUITE,
    find: "  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;\n  PERFORM pg_temp.ok(\n    NOT public.bcp_conduct_may_see_others(_r.sess),",
    replace:
      "  PERFORM pg_temp.become(_r.rec_a);\n  PERFORM pg_temp.ok(\n    NOT public.bcp_conduct_may_see_others(_r.sess),",
    guard: GUARD,
    expect: "BOUNDARY-SUITE: it acts through the real `authenticated` role, not as the owner",
  },
  {
    id: "RIB-NC-SUITE-NO-LEAK-CHECK",
    defect:
      "the suite stops searching the WHOLE answer for the colleague's words, so a payload that leaked the same sentence through an audit event would pass",
    file: SUITE,
    find: "    position('KANARIE-AS2-IAKTTAGELSE' in _blob) = 0,",
    replace: "    true,",
    guard: GUARD,
    expect:
      "BOUNDARY-SUITE: and the colleague's own words are searched for in the whole answer, not in one field",
  },
  {
    id: "RIB-NC-SUITE-NO-PERMITTED-CASE",
    defect:
      "the suite stops proving that the document IS returned after the lock, so a fix that simply walled the report off for everyone would pass",
    file: SUITE,
    find: "    position('KANARIE-AS2-IAKTTAGELSE' in _blob) > 0\n      AND position('KANARIE-REC-A-IAKTTAGELSE' in _blob) > 0,",
    replace: "    true,",
    guard: GUARD,
    expect: "BOUNDARY-SUITE: after the lock BOTH assessors are present — the fix is not a wall",
  },
  {
    id: "RIB-NC-SUITE-NO-REOPEN",
    defect:
      "the suite stops proving that reopening closes the boundary again, so a one-way latch would pass",
    file: SUITE,
    find: "  PERFORM public.bcp_conduct_reopen_position(gen_random_uuid(), _r.pos1, _rev,",
    replace:
      "  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _r.pos1, _rev); PERFORM (",
    guard: GUARD,
    expect:
      "BOUNDARY-SUITE: reopening closes it again, so the boundary is a live predicate not a latch",
  },
  {
    id: "RIB-NC-SUITE-NO-HELPER-PROBE",
    defect:
      "the suite stops CALLING the internal helper and only reads its grant, so a privilege that says one thing while the function does another would pass",
    file: SUITE,
    find: "    format('SELECT public.bcp_conduct_build_report_basis(%L)', _r.sess),\n    'permission denied',",
    replace: "    format('SELECT 1 WHERE %L IS NULL', _r.sess),\n    'no such thing',",
    guard: GUARD,
    expect:
      "BOUNDARY-SUITE: the internal helper is proved unreachable by calling it, not by reading a grant",
  },
  {
    id: "RIB-NC-SUITE-NO-OUTSIDERS",
    defect:
      "the suite stops proving the candidate is refused, so a fix that protected assessors from each other but not the candidate would pass",
    file: SUITE,
    // Removes the ASSERTION, not its label. Renaming the label left the
    // candidate refusal fully in place, so the control proved nothing.
    find:
      "  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,\n" +
      "    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),\n" +
      "    'BCP_CONDUCT_NOT_PERMITTED',\n" +
      "    'B2.3 the candidate is refused the report');",
    replace: "",
    guard: GUARD,
    expect: "BOUNDARY-SUITE: another employer and the candidate are both refused",
  },

  // ---- The PR 6 suite ------------------------------------------------------
  {
    id: "RIB-NC-PR6-STILL-ASSERTS-THE-HOLE",
    defect:
      "the PR 6 suite goes back to reading a blocker THROUGH a preview its caller may no longer have, which is the old contract asserting the hole",
    file: PR6,
    find:
      "  PERFORM pg_temp.ok(\n" +
      "    pg_temp.count_as(_r.rec_a, format(\n" +
      "      'SELECT count(*) FROM public.bcp_conduct_report_blockers(%L) b '\n" +
      "      'WHERE b.code = ''BCP_CONDUCT_POSITION_OPEN''', _r.sess)) = 1,\n" +
      "    'R1.2 an open position blocks the report');",
    replace:
      "  _prev := pg_temp.json_as(_r.rec_a,\n" +
      "    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));\n" +
      "  PERFORM pg_temp.ok(\n" +
      "    _prev -> 'blockers' @> '[{\"code\":\"BCP_CONDUCT_POSITION_OPEN\"}]'::jsonb,\n" +
      "    'R1.2 an open position blocks the report');",
    guard: GUARD,
    expect: "BOUNDARY-PR6: it no longer reads a blocker through a preview the caller may not have",
  },

  // ---- Registration and release bookkeeping -------------------------------
  {
    id: "RIB-NC-DB-TEST-NOT-REGISTERED",
    defect: "db-test.sh stops running the suite, so the behavioural proof never executes",
    file: DB,
    find: '  -f supabase/tests/bcp_conduct_report_independence_test.sql 2>&1)"',
    replace: "  -c 'SELECT 1' 2>&1)\"",
    guard: GUARD,
    expect: "BOUNDARY-REGISTRATION: db-test.sh runs the suite",
  },
  {
    id: "RIB-NC-DB-TEST-NO-HOLE-PROOF",
    defect:
      "the harness stops proving the hole is actually open between the rollback and the re-apply, so a rollback that restored nothing would pass",
    file: DB,
    find: '    echo "FAIL: the rollback ran but the independence check is still in place -- it restored nothing." >&2',
    replace: '    echo "FAIL: rollback." >&2',
    guard: GUARD,
    expect:
      "BOUNDARY-REGISTRATION: with the hole PROVED open in between, so a no-op rollback cannot pass",
  },
  {
    id: "RIB-NC-DB-TEST-FAILURE-IGNORED",
    defect: "a failing suite stops failing the run",
    file: DB,
    find: '  suite_failed "BESKT report independence boundary"',
    replace: "  true",
    guard: GUARD,
    expect: "BOUNDARY-REGISTRATION: and a failure actually fails the run",
  },
  {
    id: "RIB-NC-SUITE-SHRINK-TOLERATED",
    defect:
      "the harness stops refusing a run in which the suite silently shrank, so deleting assertions would go unnoticed",
    file: DB,
    find: 'if [ "$RIB_PASSED" -lt 24 ]; then',
    replace: 'if [ "$RIB_PASSED" -lt 0 ]; then',
    guard: GUARD,
    expect: "BOUNDARY-REGISTRATION: and refuses a run in which the suite silently shrank",
  },
  {
    id: "RIB-NC-PR6-REAPPLY-BURIES-BOUNDARY",
    defect:
      "the harness stops re-applying the boundary after PR 6's re-apply, so the replayed schema silently loses the independence check while CI stays green — the exact false-green shape PR #264 found in the Passport rollback loop",
    file: DB,
    find: '    echo "FAIL: PR 6 was re-applied and the independence boundary did NOT come back with it." >&2',
    replace: '    echo "FAIL: pr6." >&2',
    guard: GUARD,
    expect:
      "BOUNDARY-REGISTRATION: the boundary is re-applied after PR 6's re-apply, and proved back",
  },
  {
    id: "RIB-NC-END-STATE-UNCHECKED",
    defect:
      "the harness stops checking the end of the BESKT block for an unguarded report reader, so restoring PR 6 there without the boundary would go unnoticed",
    file: DB,
    find: '  echo "FAIL: the BESKT block ended with a report reader that does not carry the independence boundary." >&2',
    replace: '  echo "FAIL: end." >&2',
    guard: GUARD,
    expect:
      "BOUNDARY-REGISTRATION: no unguarded report reader survives the BESKT block, and a run that ends with one fails",
  },
  {
    id: "RIB-NC-END-STATE-NOT-FATAL",
    defect: "a run that ends with an unguarded report reader is reported and then tolerated",
    file: DB,
    find: '  suite_failed "BESKT report independence boundary (end state)"',
    replace: "  true",
    guard: GUARD,
    expect:
      "BOUNDARY-REGISTRATION: no unguarded report reader survives the BESKT block, and a run that ends with one fails",
  },
  {
    id: "RIB-NC-CI-NOT-RUN",
    defect: "CI stops running the guard",
    file: CI,
    find: "        run: bun run beskt-report-independence:check",
    replace: "        run: echo skipped",
    guard: GUARD,
    expect: "BOUNDARY-REGISTRATION: CI runs the guard",
  },
  {
    id: "RIB-NC-CONTROLS-OUT-OF-CHAIN",
    defect: "these controls drop out of negative-controls:all",
    file: PKG,
    find: "bun run negative-controls:beskt-report-independence && ",
    replace: "",
    guard: GUARD,
    expect: "BOUNDARY-REGISTRATION: its controls run as part of negative-controls:all",
  },
  {
    id: "RIB-NC-STATE-BACK-TO-PENDING",
    defect:
      "release-state says the applied fix is still pending, so the deploy plan and the record disagree",
    file: STATE,
    find:
      '      "file": "20261127090000_bcp_conduct_report_independence_boundary.sql",\n' +
      '      "hostedState": "applied",',
    replace:
      '      "file": "20261127090000_bcp_conduct_report_independence_boundary.sql",\n' +
      '      "hostedState": "pending",',
    guard: GUARD,
    expect: "BOUNDARY-RELEASE: declared APPLIED at the hosted version the ledger holds",
  },
  {
    id: "RIB-NC-EVIDENCE-LEDGER-ONLY",
    defect:
      "the evidence no longer names the verified bodies, so a ledger row alone would pass as proof",
    file: STATE,
    find: "86385edf3343d7c5c3892951831b5674",
    replace: "ledger-row-only",
    guard: GUARD,
    expect: "BOUNDARY-RELEASE: the evidence names the verified function bodies",
  },
  {
    id: "RIB-NC-FRONTIER-STALE",
    defect:
      "the applied migration is put back on the frontier's pending list, hiding the next stuck one",
    file: FRONTIER,
    find: "const expectedPending: string[] = [",
    replace:
      'const expectedPending: string[] = ["20261127090000_bcp_conduct_report_independence_boundary.sql", ',
    guard: GUARD,
    expect: "BOUNDARY-RELEASE: and it is OFF the frontier's pending list",
  },
];

await runControls("beskt-report-independence", MUTATIONS);
