/**
 * Operator-only negative controls: every material assertion of the
 * cd_outstanding_reviews correction must detect a planted defect in the real
 * computation -- the view's reloptions, its operator predicate, the postflight,
 * the actor matrix and the reviewed definer view it must leave alone -- never a
 * comment or an error-message string. Each mutation changes exactly one thing,
 * the guard must fail with the named diagnostic, and every file is restored
 * byte-for-byte (proved by the shared runner).
 *
 * The database-level control -- the ORIGINAL defect planted back into the
 * replayed schema, with the suite required to fail on an assertion -- lives in
 * scripts/db-test.sh, because it needs a database rather than a source read.
 *
 * Run: bun run negative-controls:cd-outstanding-reviews
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261116090000_cd_outstanding_reviews_operator_only.sql";
const SUITE = "supabase/tests/cd_outstanding_reviews_operator_only_test.sql";
const LINEAGE = "supabase/migrations/20260801100000_scp_restore_scoring_lineage_readability.sql";
const GUARD = "cd-outstanding-reviews:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The two halves of the fix, each removed on its own ------------------
  {
    id: "CDO-NC-INVOKER-DROPPED",
    defect:
      "the view is re-declared without security_invoker, exactly as the bare CREATE OR REPLACE in 20260731100000 did -- it silently becomes a definer view again",
    file: MIG,
    find: "CREATE OR REPLACE VIEW public.cd_outstanding_reviews\nWITH (security_invoker = true, security_barrier = true) AS",
    replace: "CREATE OR REPLACE VIEW public.cd_outstanding_reviews AS",
    guard: GUARD,
    expect: "CDO-GUARD-NOT-INVOKER",
  },
  {
    id: "CDO-NC-INVOKER-FALSE",
    defect: "security_invoker is stated but set to false -- the linter would be satisfied, the caller would not be constrained",
    file: MIG,
    find: "WITH (security_invoker = true, security_barrier = true) AS",
    replace: "WITH (security_invoker = false, security_barrier = true) AS",
    guard: GUARD,
    expect: "CDO-GUARD-NOT-INVOKER",
  },
  {
    id: "CDO-NC-BARRIER-DROPPED",
    defect:
      "security_barrier is removed, so a caller-supplied function in an outer WHERE can be evaluated against rows before the operator predicate filters them",
    file: MIG,
    find: "WITH (security_invoker = true, security_barrier = true) AS",
    replace: "WITH (security_invoker = true) AS",
    guard: GUARD,
    expect: "CDO-GUARD-NOT-BARRIER",
  },
  {
    id: "CDO-NC-OPERATOR-PREDICATE-DROPPED",
    defect:
      "the operator gate is removed and only security_invoker is left -- the naive linter fix, which still exposes every pilot/active instrument through the OR-ed 'live readable' policy",
    file: MIG,
    find: "WHERE g.value <> 'true'::jsonb\n  AND public.cd_is_internal_tester(auth.uid());",
    replace: "WHERE g.value <> 'true'::jsonb;",
    guard: GUARD,
    expect: "CDO-GUARD-NO-OPERATOR-PREDICATE",
  },
  {
    id: "CDO-NC-OPERATOR-PREDICATE-CONSTANT",
    defect: "the operator gate is replaced by a constant true, so every authenticated caller passes it",
    file: MIG,
    find: "  AND public.cd_is_internal_tester(auth.uid());",
    replace: "  AND true;",
    guard: GUARD,
    expect: "CDO-GUARD-NO-OPERATOR-PREDICATE",
  },
  {
    id: "CDO-NC-OPERATOR-PREDICATE-CLIENT-SUPPLIED",
    defect:
      "the gate stops deriving identity from auth.uid() and trusts a client-supplied JWT claim instead",
    file: MIG,
    find: "  AND public.cd_is_internal_tester(auth.uid());",
    replace:
      "  AND public.cd_is_internal_tester(((current_setting('request.jwt.claims', true)::jsonb) ->> 'sub')::uuid);",
    guard: GUARD,
    expect: "CDO-GUARD-NO-OPERATOR-PREDICATE",
  },

  // ---- A later migration undoing it --------------------------------------
  {
    id: "CDO-NC-ALTERED-BACK-LATER",
    defect:
      "a later statement in the same file flips the view back to definer semantics after the correction",
    file: MIG,
    find: "-- The access model, restated so this file alone documents it.",
    replace:
      "ALTER VIEW public.cd_outstanding_reviews SET (security_invoker = false);\n\n-- The access model, restated so this file alone documents it.",
    guard: GUARD,
    expect: "CDO-GUARD-ALTERED-BACK",
  },

  // ---- The postflight ------------------------------------------------------
  {
    id: "CDO-NC-POSTFLIGHT-PROOF-GONE",
    defect: "the migration stops raising its postflight proof, so a silent partial apply looks clean",
    file: MIG,
    find: "RAISE NOTICE 'CD_OUTSTANDING_REVIEWS_OPERATOR_ONLY_PROOF ok';",
    replace: "RAISE NOTICE 'done';",
    guard: GUARD,
    expect: "CDO-GUARD-POSTFLIGHT-GONE",
  },
  {
    id: "CDO-NC-POSTFLIGHT-NO-PRINCIPAL-CHECK-GONE",
    defect:
      "the one behavioural postflight check -- empty with no authenticated subject -- is removed, so a predicate that is present in the text but not wired into the body would apply cleanly",
    file: MIG,
    find: "      'CD_OUTSTANDING_REVIEWS_LEAKS_WITHOUT_PRINCIPAL: % row(s) readable with no authenticated subject', _rows;",
    replace: "      'CD_OUTSTANDING_REVIEWS_UNEXPECTED: % row(s)', _rows;",
    guard: GUARD,
    expect: "CDO-GUARD-POSTFLIGHT-WEAKENED",
  },
  {
    id: "CDO-NC-ANON-REVOKE-GONE",
    defect: "anon is no longer revoked on the view, so an inherited default privilege could supply access",
    file: MIG,
    find: "REVOKE ALL ON public.cd_outstanding_reviews FROM anon;",
    replace: "-- (revoke removed)",
    guard: GUARD,
    expect: "CDO-GUARD-ANON-NOT-REVOKED",
  },

  // ---- The reviewed definer view must be left alone ------------------------
  {
    id: "CDO-NC-LINEAGE-FLIPPED",
    defect:
      "the reviewed definer view scp_scoring_version_lineage is 'fixed' too -- the generic linter remediation that caused a real outage in 20260731053218",
    file: LINEAGE,
    find: "ALTER VIEW public.scp_scoring_version_lineage SET (security_invoker = false);",
    replace: "ALTER VIEW public.scp_scoring_version_lineage SET (security_invoker = true);",
    guard: GUARD,
    expect: "CDO-GUARD-LINEAGE-FLIPPED",
  },

  // ---- The actor matrix ----------------------------------------------------
  {
    id: "CDO-NC-ACTOR-CANDIDATE-DROPPED",
    defect: "the ordinary-candidate denial assertion is removed from the suite",
    file: SUITE,
    find: "format('CDO7 ordinary candidate -> 0 rows (saw %s)', _n)",
    replace: "format('CDOx ordinary candidate -> 0 rows (saw %s)', _n)",
    guard: GUARD,
    expect: "CDO-GUARD-ACTOR-DROPPED",
  },
  {
    id: "CDO-NC-ACTOR-CROSS-TENANT-DROPPED",
    defect: "the cross-tenant employer denial assertion is removed from the suite",
    file: SUITE,
    find: "format('CDO9 cross-tenant employer (tenant B) -> 0 rows (saw %s)', _n)",
    replace: "format('CDOx cross-tenant employer (tenant B) -> 0 rows (saw %s)', _n)",
    guard: GUARD,
    expect: "CDO-GUARD-ACTOR-DROPPED",
  },
  {
    id: "CDO-NC-ACTOR-OPERATOR-DROPPED",
    defect:
      "the internal-tester ACCESS assertion is removed, so a fix that locks operators out too would pass",
    file: SUITE,
    find: "format('CDO10 internal tester -> ALL %s gate row(s), including internal_test (saw %s)', _total, _n)",
    replace: "format('CDOx internal tester -> ALL %s gate row(s) (saw %s)', _total, _n)",
    guard: GUARD,
    expect: "CDO-GUARD-ACTOR-DROPPED",
  },
  {
    id: "CDO-NC-ACTOR-ANON-DROPPED",
    defect: "the anonymous denial assertion is removed from the suite",
    file: SUITE,
    find: "'CDO6 anonymous  -> refused (permission denied)'",
    replace: "'CDOx anonymous -> refused (permission denied)'",
    guard: GUARD,
    expect: "CDO-GUARD-ACTOR-DROPPED",
  },
];

runControls("cd-outstanding-reviews", MUTATIONS);
