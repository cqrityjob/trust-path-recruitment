/**
 * Pilot blocker 2 negative controls: every material assertion of the
 * interview-method library tenant-read guard must detect a planted defect in
 * the real computation -- the predicate's body, its grants, the five policy
 * predicates, the surviving policy state, the postflight, the rollback, the
 * suite and the release bookkeeping -- never a comment or an error-message
 * string. Each mutation changes exactly one thing, the guard must fail with
 * the named diagnostic, and every file is restored byte-for-byte (proved by
 * the shared runner).
 *
 * Run: bun run negative-controls:interview-method-tenant-read
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261115090000_scp_interview_method_library_tenant_read.sql";
const RB = "supabase/rollback/20261115090000_scp_interview_method_library_tenant_read_rollback.sql";
const SUITE = "supabase/tests/scp_interview_method_library_tenant_read_test.sql";
const UNWIND = "supabase/tests/scp_a_rollback_test.sql";
const DB = "scripts/db-test.sh";
const STATE = "supabase/release-state.json";
const FRONTIER = "scripts/release-frontier-check.ts";
const GUARD = "interview-method-tenant-read:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The predicate -------------------------------------------------------
  {
    id: "IMTR-NC-APPROVAL-DROPPED",
    defect:
      "the approved-contract branch admits ANY method to any member -- a draft counts as approved content",
    file: MIG,
    find: "WHERE m.id = _method_id AND m.approval_state = 'approved')",
    replace: "WHERE m.id = _method_id)",
    guard: GUARD,
    expect: "IMTR-PREDICATE",
  },
  {
    id: "IMTR-NC-CASE-LINK-ANY-CASE",
    defect:
      "the case-linked branch stops requiring that the case pins THIS method, so one case anywhere opens the whole library",
    file: MIG,
    find: "WHERE c.trust_method_id = _method_id\n                    AND em.user_id = auth.uid() AND em.status = 'active')",
    replace: "WHERE em.user_id = auth.uid() AND em.status = 'active')",
    guard: GUARD,
    expect: "IMTR-PREDICATE",
  },
  {
    id: "IMTR-NC-CASE-LINK-OTHER-TENANT",
    defect:
      "the case-linked branch stops joining the case to the CALLER'S employer, so a case of any employer opens the method to everyone",
    file: MIG,
    find: "JOIN public.employer_memberships em ON em.employer_id = c.employer_id\n                  WHERE c.trust_method_id = _method_id",
    replace:
      "JOIN public.employer_memberships em ON true\n                  WHERE c.trust_method_id = _method_id",
    guard: GUARD,
    expect: "IMTR-PREDICATE",
  },
  {
    id: "IMTR-NC-MEMBERSHIP-STATUS",
    defect: "an invited, suspended or removed membership counts on the approved-contract branch",
    file: MIG,
    find: "WHERE em.user_id = auth.uid() AND em.status = 'active'))",
    replace: "WHERE em.user_id = auth.uid()))",
    guard: GUARD,
    expect: "IMTR-PREDICATE",
  },
  {
    id: "IMTR-NC-JWT-CLAIM",
    defect: "a forged user_metadata role claim becomes a way in",
    file: MIG,
    find: "  SELECT auth.uid() IS NOT NULL\n     AND _method_id IS NOT NULL\n     AND (",
    replace:
      "  SELECT auth.uid() IS NOT NULL\n     AND _method_id IS NOT NULL\n     AND ((current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') = 'admin' OR",
    guard: GUARD,
    expect: "IMTR-PREDICATE",
  },
  {
    id: "IMTR-NC-SEARCH-PATH-UNPINNED",
    defect: "the SECURITY DEFINER predicate loses its pinned search_path",
    file: MIG,
    find: "STABLE\nSECURITY DEFINER\nSET search_path = public\nAS $$\n  SELECT auth.uid() IS NOT NULL",
    replace: "STABLE\nSECURITY DEFINER\nAS $$\n  SELECT auth.uid() IS NOT NULL",
    guard: GUARD,
    expect: "IMTR-PREDICATE",
  },
  {
    id: "IMTR-NC-EMPLOYER-STATUS-REGATED",
    defect:
      "continuity is re-gated on employer status, so a suspended employer loses the case that exists -- a behaviour change the fix must not make",
    file: MIG,
    find: "WHERE c.trust_method_id = _method_id\n                    AND em.user_id = auth.uid() AND em.status = 'active')",
    replace:
      "WHERE c.trust_method_id = _method_id\n                    AND public.employer_is_active_status(c.employer_id)\n                    AND em.user_id = auth.uid() AND em.status = 'active')",
    guard: GUARD,
    expect: "IMTR-PREDICATE",
  },

  // ---- The grants ----------------------------------------------------------
  {
    id: "IMTR-NC-ANON-EXECUTE",
    defect: "anon is granted execution of the predicate",
    file: MIG,
    find: "GRANT EXECUTE ON FUNCTION public.scp_iv_employer_may_read_method(uuid) TO authenticated, service_role;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.scp_iv_employer_may_read_method(uuid) TO anon, authenticated, service_role;",
    guard: GUARD,
    expect: "IMTR-GRANTS",
  },
  {
    id: "IMTR-NC-PUBLIC-NOT-REVOKED",
    defect:
      "PUBLIC keeps PostgreSQL's default EXECUTE on the new function, which is what every new function starts life with",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.scp_iv_employer_may_read_method(uuid) FROM PUBLIC, anon;",
    replace: "REVOKE ALL ON FUNCTION public.scp_iv_employer_may_read_method(uuid) FROM anon;",
    guard: GUARD,
    expect: "IMTR-GRANTS",
  },

  // ---- The five policies ---------------------------------------------------
  {
    id: "IMTR-NC-POLICY-MEMBERSHIP-ONLY",
    defect:
      "the method policy goes back to deciding on membership alone -- the original finding, verbatim",
    file: MIG,
    find: "ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods\n  USING (public.scp_iv_employer_may_read_method(id));",
    replace:
      "ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods\n  USING (EXISTS (SELECT 1 FROM public.employer_memberships em WHERE em.user_id = auth.uid() AND em.status = 'active'));",
    guard: GUARD,
    expect: "IMTR-POLICIES",
  },
  {
    id: "IMTR-NC-POLICY-UNCONDITIONAL",
    defect: "the practices policy becomes unconditional",
    file: MIG,
    find: "ALTER POLICY scp_interview_method_practices_employer_read ON public.scp_interview_method_practices\n  USING (public.scp_iv_employer_may_read_method(method_id));",
    replace:
      "ALTER POLICY scp_interview_method_practices_employer_read ON public.scp_interview_method_practices\n  USING (true);",
    guard: GUARD,
    expect: "IMTR-POLICIES",
  },
  {
    id: "IMTR-NC-GOVERNANCE-READ-LOST",
    defect:
      "the conduct-steps policy drops the governance-reader read, locking content roles out of what they govern",
    file: MIG,
    find: "ALTER POLICY scp_interview_conduct_steps_read ON public.scp_interview_conduct_steps\n  USING (public.scp_interview_can_read(auth.uid())\n         OR public.scp_iv_employer_may_read_method(method_id));",
    replace:
      "ALTER POLICY scp_interview_conduct_steps_read ON public.scp_interview_conduct_steps\n  USING (public.scp_iv_employer_may_read_method(method_id));",
    guard: GUARD,
    expect: "IMTR-POLICIES",
  },
  {
    id: "IMTR-NC-POLICY-NOT-ROUTED",
    defect:
      "the guidance policy is simply not touched, so the last surviving definition in the history is 20261003090000's membership-only one",
    file: MIG,
    find: "ALTER POLICY scp_interview_conduct_guidance_read ON public.scp_interview_conduct_guidance\n  USING (public.scp_interview_can_read(auth.uid())\n         OR public.scp_iv_employer_may_read_method(method_id));",
    replace: "-- (guidance policy left as it was)",
    guard: GUARD,
    expect: "IMTR-SURVIVING",
  },

  // ---- The postflight ------------------------------------------------------
  {
    id: "IMTR-NC-POSTFLIGHT-ANON-SOFTENED",
    defect: "the postflight stops refusing an anon-executable predicate",
    file: MIG,
    find: "  IF has_function_privilege('anon', _fn, 'EXECUTE') THEN\n    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: anon can execute the predicate.';",
    replace:
      "  IF false THEN\n    RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF: anon can execute the predicate.';",
    guard: GUARD,
    expect: "IMTR-POSTFLIGHT",
  },
  {
    id: "IMTR-NC-POSTFLIGHT-NOT-EXERCISED",
    defect:
      "the postflight stops exercising the predicate with no principal, inspecting the catalogue only",
    file: MIG,
    find: "  IF coalesce((SELECT bool_or(public.scp_iv_employer_may_read_method(m.id))\n                 FROM public.scp_interview_methods m), false) THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "IMTR-POSTFLIGHT",
  },

  // ---- The rollback --------------------------------------------------------
  {
    id: "IMTR-NC-ROLLBACK-KEEPS-PREDICATE",
    defect: "the rollback leaves the predicate behind",
    file: RB,
    find: "DROP FUNCTION IF EXISTS public.scp_iv_employer_may_read_method(uuid);",
    replace: "-- (predicate kept)",
    guard: GUARD,
    expect: "IMTR-ROLLBACK",
  },
  {
    id: "IMTR-NC-ROLLBACK-WRONG-PREDICATE",
    defect:
      "the rollback restores the method policy to something other than the previous predicate",
    file: RB,
    find: "ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods\n  USING (EXISTS (SELECT 1 FROM public.employer_memberships em\n                  WHERE em.user_id = auth.uid() AND em.status = 'active'));",
    replace:
      "ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods\n  USING (true);",
    guard: GUARD,
    expect: "IMTR-ROLLBACK",
  },
  {
    id: "IMTR-NC-FULL-UNWIND-FORGETS",
    defect: "the documented full unwind forgets the predicate",
    file: UNWIND,
    find: "DROP FUNCTION IF EXISTS public.scp_iv_employer_may_read_method(uuid);\n",
    replace: "",
    guard: GUARD,
    expect: "IMTR-ROLLBACK",
  },

  // ---- The suite -----------------------------------------------------------
  {
    id: "IMTR-NC-SUITE-NO-FORGED-CLAIMS",
    defect: "the suite stops forging metadata claims, so a policy that trusted one would pass",
    file: SUITE,
    find: "    'user_metadata', json_build_object(",
    replace: "    'unused_metadata', json_build_object(",
    guard: GUARD,
    expect: "IMTR-SUITE",
  },
  {
    id: "IMTR-NC-SUITE-CONTROL-REMOVED",
    defect:
      "the in-suite grant control is removed, so a widened grant would no longer be shown to be detectable",
    file: SUITE,
    find: "-- Control 3: the grant is widened to anon.\nSAVEPOINT ml_weakened_grant;\n",
    replace: "-- Control 3: the grant is widened to anon.\n",
    guard: GUARD,
    expect: "IMTR-SUITE",
  },
  {
    id: "IMTR-NC-SUITE-ANON-HANDLE",
    defect:
      "anon loses SELECT on the fixture handle, so 'permission denied' on the handle would pass for the function refusal",
    file: SUITE,
    find: "GRANT SELECT ON ml TO authenticated, anon;",
    replace: "GRANT SELECT ON ml TO authenticated;",
    guard: GUARD,
    expect: "IMTR-SUITE",
  },
  {
    id: "IMTR-NC-SUITE-ALLOWLIST-LOOSENED",
    defect: "the exact executor set is no longer pinned",
    file: SUITE,
    find: "  PERFORM pg_temp.ok(_grantees = 'authenticated, service_role',\n    format('ML10.3",
    replace: "  PERFORM pg_temp.ok(_grantees LIKE '%authenticated%',\n    format('ML10.3",
    guard: GUARD,
    expect: "IMTR-SUITE",
  },

  // ---- Registration --------------------------------------------------------
  {
    id: "IMTR-NC-FLOOR-LOWERED",
    defect: "the harness assertion floor is lowered so a shrinking suite passes",
    file: DB,
    find: 'if [ "$ML_PASSED" -lt 120 ]; then',
    replace: 'if [ "$ML_PASSED" -lt 1 ]; then',
    guard: GUARD,
    expect: "IMTR-REGISTRATION",
  },
  {
    id: "IMTR-NC-WEAK-RUN-DROPPED",
    defect: "the harness stops requiring the suite to FAIL against the rolled-back schema",
    file: DB,
    find: 'if [ "$ML_WEAK_RC" -eq 0 ] || ! echo "$ML_WEAK" | grep -q "ASSERTION FAILED"; then',
    replace: "if false; then",
    guard: GUARD,
    expect: "IMTR-REGISTRATION",
  },
  // The migration is now APPLIED on production, so these three controls plant
  // the defects that state makes possible: a bare flip with the evidence taken
  // away, evidence that names some other database, and a frontier that still
  // expects a migration production has already run. Each is an owner-level
  // claim about production that nothing stands behind.
  {
    id: "IMTR-NC-APPLIED-WITHOUT-EVIDENCE",
    defect:
      "the applied state keeps its evidence under a different key, so the frontier asserts an owner-level fact about production with nothing behind it",
    file: STATE,
    find: '"hostedState": "applied",\n      "evidenceSource": "Applied to owner production wrygicdfxwjnrugduxnt by the official Supabase GitHub integration when PR #241',
    replace:
      '"hostedState": "applied",\n      "evidenceWithheld": "Applied to owner production wrygicdfxwjnrugduxnt by the official Supabase GitHub integration when PR #241',
    guard: GUARD,
    expect: "IMTR-REGISTRATION",
  },
  {
    id: "IMTR-NC-EVIDENCE-WRONG-PROJECT",
    defect:
      "the evidence names a database that is not the one canonical hosted project, so it proves nothing about wrygicdfxwjnrugduxnt",
    file: STATE,
    // Anchored on THIS migration's own entry. Several entries now open their
    // evidence with the same sentence, so the bare prefix is ambiguous and the
    // harness refuses it -- correctly: an ambiguous anchor is a broken control.
    find: '"file": "20261115090000_scp_interview_method_library_tenant_read.sql",\n      "hostedState": "applied",\n      "evidenceSource": "Applied to owner production wrygicdfxwjnrugduxnt by the official',
    replace:
      '"file": "20261115090000_scp_interview_method_library_tenant_read.sql",\n      "hostedState": "applied",\n      "evidenceSource": "Applied to owner production lovable-cloud-substitute by the official',
    guard: GUARD,
    expect: "IMTR-REGISTRATION",
  },
  {
    id: "IMTR-NC-FRONTIER-STILL-PENDING",
    defect:
      "the frontier selection check still expects the migration pending after production has applied it, which would mask the next genuinely stuck migration behind a stale expectation",
    file: FRONTIER,
    // Insert the applied version while preserving genuinely pending migrations.
    find: "const expectedPending: string[] = [",
    replace:
      'const expectedPending: string[] = ["20261115090000_scp_interview_method_library_tenant_read.sql",',
    guard: GUARD,
    expect: "IMTR-REGISTRATION",
  },

  // ---- Nothing else moves --------------------------------------------------
  {
    id: "IMTR-NC-TOUCHES-BESKT",
    defect: "the migration reaches into the BESKT domain",
    file: MIG,
    find: "  RAISE NOTICE 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF ok';\nEND $proof$;",
    replace:
      "  RAISE NOTICE 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF ok';\nEND $proof$;\n\nALTER TABLE public.beskt_method_versions NO FORCE ROW LEVEL SECURITY;",
    guard: GUARD,
    expect: "IMTR-NO-REGRESSION",
  },
];

runControls("interview-method-tenant-read", MUTATIONS);
