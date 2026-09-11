/**
 * BESKT PR 2 negative controls: every material assertion of the governed-
 * content guard must detect a planted defect in the real computation --
 * the migration's function bodies, DDL, triggers and grants, the rollback,
 * the runner registration and the release bookkeeping -- never a comment
 * or an error-message string. Each mutation changes exactly one thing, the
 * guard must fail with the named diagnostic, and every file is restored
 * byte-for-byte (proved by the shared runner).
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261108090000_beskt_governed_method_content.sql";
const RB = "supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql";
const DB = "scripts/db-test.sh";
const ADR = "docs/architecture/beskt-recruitment-method-discovery.md";
const STATE = "supabase/release-state.json";
const GUARD = "beskt-governed-content:check";

const anchorComponent = (component: string, what: string): Mutation => ({
  id: `BESKT-NC-DB-ANCHOR-${component}`,
  defect: `a missing ${what} component no longer blocks publication (downgraded to advisory)`,
  file: MIG,
  find: `SELECT 'ANCHOR_COMPONENT_MISSING_${component}', 'blocking',`,
  replace: `SELECT 'ANCHOR_COMPONENT_MISSING_${component}', 'advisory',`,
  guard: GUARD,
  expect: "BESKT-DB-ANCHOR-COMPONENTS",
});

const MUTATIONS: readonly Mutation[] = [
  // ---- RLS, grants, execute ------------------------------------------------
  {
    id: "BESKT-NC-DB-FORCE-RLS",
    defect: "FORCE RLS is removed from the review table",
    file: MIG,
    find: "ALTER TABLE public.beskt_method_reviews          FORCE ROW LEVEL SECURITY;",
    replace: "ALTER TABLE public.beskt_method_reviews          NO FORCE ROW LEVEL SECURITY;",
    guard: GUARD,
    expect: "BESKT-DB-FORCE-RLS",
  },
  {
    id: "BESKT-NC-DB-ANON-EXECUTE",
    defect: "anon is granted execution of the publish RPC",
    file: MIG,
    find: "GRANT EXECUTE ON FUNCTION public.beskt_publish_version(uuid, uuid, integer, text) TO authenticated, service_role;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.beskt_publish_version(uuid, uuid, integer, text) TO anon, authenticated, service_role;",
    guard: GUARD,
    expect: "BESKT-DB-ANON-EXECUTE",
  },
  {
    id: "BESKT-NC-DB-INTERNAL-EXECUTE",
    defect: "the event writer becomes callable by authenticated",
    file: MIG,
    find: "GRANT EXECUTE ON FUNCTION public.beskt_record_event(uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb)\n  TO service_role;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.beskt_record_event(uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb)\n  TO authenticated, service_role;",
    guard: GUARD,
    expect: "BESKT-DB-ANON-EXECUTE",
  },
  {
    id: "BESKT-NC-DB-TABLE-GRANT",
    defect: "authenticated is granted INSERT on the ledger",
    file: MIG,
    find: "GRANT SELECT ON public.beskt_method_events           TO authenticated;",
    replace: "GRANT SELECT, INSERT ON public.beskt_method_events   TO authenticated;",
    guard: GUARD,
    expect: "BESKT-DB-TABLE-GRANTS",
  },
  {
    id: "BESKT-NC-DB-OPEN-POLICY",
    defect: "the item read policy becomes unconditional",
    file: MIG,
    find: "CREATE POLICY beskt_items_governance_read ON public.beskt_items\n  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));",
    replace:
      "CREATE POLICY beskt_items_governance_read ON public.beskt_items\n  FOR SELECT TO authenticated USING (true);",
    guard: GUARD,
    expect: "BESKT-DB-TABLE-GRANTS",
  },
  {
    id: "BESKT-NC-DB-SEARCH-PATH",
    defect: "the publish RPC loses its pinned search_path",
    file: MIG,
    find: "  _reason text DEFAULT NULL)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  _request_hash text;\n  _replay jsonb;\n  _v public.beskt_method_versions%ROWTYPE;\n  _hash text;\n  _blockers text;",
    replace:
      "  _reason text DEFAULT NULL)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  _request_hash text;\n  _replay jsonb;\n  _v public.beskt_method_versions%ROWTYPE;\n  _hash text;\n  _blockers text;",
    guard: GUARD,
    expect: "BESKT-DB-DEFINER-SEARCH-PATH",
  },
  // ---- the old flow --------------------------------------------------------
  {
    id: "BESKT-NC-DB-PACK-KIND-FILTER",
    defect: "the startable list stops filtering on pack_kind",
    file: MIG,
    find: "     WHERE p.pack_kind = 'role_interview'   -- BESKT PR 2: never a BESKT method\n       AND b.basis IS NOT NULL",
    replace: "     WHERE b.basis IS NOT NULL",
    guard: GUARD,
    expect: "BESKT-DB-PACK-KIND",
  },
  {
    id: "BESKT-NC-DB-START-BASIS-FILTER",
    defect: "the shared start basis stops joining on pack_kind",
    file: MIG,
    find: "   WHERE v.id = _pack_version_id\n     AND p.pack_kind = 'role_interview';",
    replace: "   WHERE v.id = _pack_version_id;",
    guard: GUARD,
    expect: "BESKT-DB-PACK-KIND",
  },
  {
    id: "BESKT-NC-DB-ROLE-BY-KIND",
    defect: "a BESKT method may carry a fake canonical role",
    file: MIG,
    find: "    OR (pack_kind = 'beskt_method' AND role_id IS NULL));",
    replace: "    OR (pack_kind = 'beskt_method'));",
    guard: GUARD,
    expect: "BESKT-DB-PACK-KIND",
  },
  {
    id: "BESKT-NC-DB-VERSION-SPINE-OPEN",
    defect: "the role-interview version trigger stops refusing other kinds",
    file: MIG,
    find: "  IF _kind IS DISTINCT FROM 'role_interview' THEN\n    RAISE EXCEPTION\n      'SCP_INTERVIEW_PACK_KIND_MISMATCH",
    replace: "  IF false THEN\n    RAISE EXCEPTION\n      'SCP_INTERVIEW_PACK_KIND_MISMATCH",
    guard: GUARD,
    expect: "BESKT-DB-PACK-KIND",
  },
  {
    id: "BESKT-NC-DB-OLD-VALIDATOR",
    defect: "the role-interview validator validates a BESKT pack against the 0-4 contract",
    file: MIG,
    find: "  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p\n                  WHERE p.id = _v.pack_id AND p.pack_kind = 'role_interview') THEN\n    RETURN QUERY SELECT 'PACK_KIND_NOT_ROLE_INTERVIEW'::text, 'blocking'::text,",
    replace:
      "  IF false THEN\n    RETURN QUERY SELECT 'PACK_KIND_NOT_ROLE_INTERVIEW'::text, 'blocking'::text,",
    guard: GUARD,
    expect: "BESKT-DB-OLD-VALIDATOR",
  },
  // ---- scoring and runtime data --------------------------------------------
  {
    id: "BESKT-NC-DB-SCORE-COLUMN",
    defect: "an option gains a risk weight",
    file: MIG,
    find: "  label_sv text,\n  label_en text,\n  UNIQUE (item_id, option_key)",
    replace:
      "  label_sv text,\n  label_en text,\n  risk_weight integer,\n  UNIQUE (item_id, option_key)",
    guard: GUARD,
    expect: "BESKT-DB-FORBIDDEN-COLUMNS",
  },
  {
    id: "BESKT-NC-DB-JSONB-CONTENT",
    defect: "an item gains an opaque jsonb attribute bag",
    file: MIG,
    find: "  discuss_orally_allowed boolean NOT NULL DEFAULT true,\n",
    replace:
      "  discuss_orally_allowed boolean NOT NULL DEFAULT true,\n  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,\n",
    guard: GUARD,
    expect: "BESKT-DB-FORBIDDEN-COLUMNS",
  },
  {
    id: "BESKT-NC-DB-CANDIDATE-TABLE",
    defect: "a candidate response table is smuggled into PR 2",
    file: MIG,
    find: "CREATE INDEX beskt_method_events_pack_idx ON public.beskt_method_events (pack_id, seq DESC);",
    replace:
      "CREATE TABLE public.beskt_candidate_responses (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid()\n);\nCREATE INDEX beskt_method_events_pack_idx ON public.beskt_method_events (pack_id, seq DESC);",
    guard: GUARD,
    expect: "BESKT-DB-TABLES",
  },
  // ---- hash ----------------------------------------------------------------
  {
    id: "BESKT-NC-DB-HASH-MD5",
    defect: "the content hash falls back to md5",
    file: MIG,
    find: "  SELECT encode(sha256(convert_to(public.beskt_canonical_content(_method_version_id), 'UTF8')), 'hex');",
    replace: "  SELECT md5(public.beskt_canonical_content(_method_version_id));",
    guard: GUARD,
    expect: "BESKT-DB-HASH",
  },
  {
    id: "BESKT-NC-DB-HASH-UNORDERED",
    defect: "the routing rules aggregate follows heap order",
    file: MIG,
    find: "        E'\\n' ORDER BY r.rule_key)\n        FROM public.beskt_routing_rules r",
    replace: "        E'\\n')\n        FROM public.beskt_routing_rules r",
    guard: GUARD,
    expect: "BESKT-DB-HASH",
  },
  // ---- validator: states, components, gates, activation ----------------------
  {
    id: "BESKT-NC-DB-EVIDENCE-STATE",
    defect: "conflicting_information is no longer a required evidence state",
    file: MIG,
    find: "    'external_verification_needed', 'conflicting_information',\n    'insufficient_basis', 'not_applicable'];\n  _review_gates",
    replace:
      "    'external_verification_needed',\n    'insufficient_basis', 'not_applicable'];\n  _review_gates",
    guard: GUARD,
    expect: "BESKT-DB-EVIDENCE-STATES",
  },
  {
    id: "BESKT-NC-DB-EVIDENCE-LEVEL",
    defect: "a numeric risk level joins the anchor state vocabulary",
    file: MIG,
    find: "    'insufficient_basis', 'not_applicable')),\n\n  -- The seven governed components",
    replace:
      "    'insufficient_basis', 'not_applicable', 'risk_level_4')),\n\n  -- The seven governed components",
    guard: GUARD,
    expect: "BESKT-DB-EVIDENCE-STATES",
  },
  anchorComponent("DEFINITION", "definition"),
  anchorComponent("INCLUSION_CRITERIA", "inclusion-criteria"),
  anchorComponent("EXCLUSION_CRITERIA", "exclusion-criteria"),
  anchorComponent("SUPPORTING_EVIDENCE_EXAMPLES", "supporting-evidence-examples"),
  anchorComponent("COUNTER_EVIDENCE_AND_PROTECTIVE_FACTORS", "counter-evidence/protective-factors"),
  anchorComponent("PROHIBITED_INFERENCES", "prohibited-inferences"),
  anchorComponent("REQUIRED_NEXT_ACTION", "required-next-action"),
  {
    id: "BESKT-NC-DB-STALE-REVIEW-HASH",
    defect: "a stale review counts towards publication",
    file: MIG,
    find: "           AND rv.decision = 'approved'\n           AND rv.content_hash_at_review = _hash) THEN",
    replace: "           AND rv.decision = 'approved') THEN",
    guard: GUARD,
    expect: "BESKT-DB-REVIEW-GATES",
  },
  {
    id: "BESKT-NC-DB-FOUR-GATES",
    defect: "data_protection is dropped from the review gates",
    file: MIG,
    find: "  _review_gates text[] := ARRAY[\n    'personnel_security', 'senior_hr', 'recruitment',\n    'employment_privacy_legal', 'data_protection'];",
    replace:
      "  _review_gates text[] := ARRAY[\n    'personnel_security', 'senior_hr', 'recruitment',\n    'employment_privacy_legal'];",
    guard: GUARD,
    expect: "BESKT-DB-REVIEW-GATES",
  },
  {
    id: "BESKT-NC-DB-SELF-REVIEW",
    defect: "the author may review their own method",
    file: MIG,
    find: "  IF _v.created_by IS NOT NULL AND _v.created_by = NEW.reviewer_id THEN\n    RAISE EXCEPTION\n      'BESKT_SELF_REVIEW",
    replace: "  IF false THEN\n    RAISE EXCEPTION\n      'BESKT_SELF_REVIEW",
    guard: GUARD,
    expect: "BESKT-DB-REVIEW-GATES",
  },
  {
    id: "BESKT-NC-DB-PUBLISH-WITHOUT-VALIDATOR",
    defect: "publication no longer runs the validator with the review gates",
    file: MIG,
    find: "    FROM public.beskt_method_validate(_method_version_id, true) bv",
    replace: "    FROM public.beskt_method_validate(_method_version_id, false) bv",
    guard: GUARD,
    expect: "BESKT-DB-REVIEW-GATES",
  },
  {
    id: "BESKT-NC-DB-SV-GATE-LAWFUL-BASIS",
    defect: "the lawful-basis activation requirement is no longer required",
    file: MIG,
    find: "                      AND a.requirement_key = 'lawful_basis_recorded') THEN",
    replace: "                      AND true) THEN",
    guard: GUARD,
    expect: "BESKT-DB-SV-GATES",
  },
  {
    id: "BESKT-NC-DB-SV-GATE-OWNER",
    defect: "the authorised-security-owner requirement is no longer required",
    file: MIG,
    find: "                      AND a.requirement_key = 'authorised_security_owner_assigned'\n                      AND a.satisfied_by_role = 'authorised_security_function') THEN",
    replace: "                      AND a.satisfied_by_role = 'authorised_security_function') THEN",
    guard: GUARD,
    expect: "BESKT-DB-SV-GATES",
  },
  {
    id: "BESKT-NC-DB-SV-GATE-ATTESTED",
    defect: "the security-sensitive-role requirement is no longer required",
    file: MIG,
    find: "                      AND a.requirement_key = 'security_sensitive_role_attested')\n       OR EXISTS",
    replace: "                      AND true)\n       OR EXISTS",
    guard: GUARD,
    expect: "BESKT-DB-SV-GATES",
  },
  // ---- routing -------------------------------------------------------------
  {
    id: "BESKT-NC-DB-CROSS-VERSION-ROUTE",
    defect: "a route may connect items of another version",
    file: MIG,
    find: "    IF _src.method_version_id IS DISTINCT FROM NEW.method_version_id\n       OR _tgt.method_version_id IS DISTINCT FROM NEW.method_version_id THEN",
    replace: "    IF false THEN",
    guard: GUARD,
    expect: "BESKT-DB-CROSS-VERSION",
  },
  {
    id: "BESKT-NC-DB-MODE-ESCALATION-GUARD",
    defect: "a recruitment-support rule may route into security-vetting content at write time",
    file: MIG,
    find: "    IF NEW.applies_mode = 'recruitment_support'\n       AND (_tgt.permitted_mode = 'security_vetting_support'\n            OR _src.permitted_mode = 'security_vetting_support') THEN",
    replace:
      "    IF NEW.applies_mode = 'security_vetting_support'\n       AND (_tgt.permitted_mode = 'security_vetting_support'\n            OR _src.permitted_mode = 'security_vetting_support') THEN",
    guard: GUARD,
    expect: "BESKT-DB-MODE-ESCALATION",
  },
  {
    id: "BESKT-NC-DB-MODE-ESCALATION-VALIDATOR",
    defect: "the validator stops re-proving the mode boundary on the stored graph",
    file: MIG,
    find: "       AND r.applies_mode = 'recruitment_support'\n       AND (ti.permitted_mode = 'security_vetting_support' OR si.permitted_mode = 'security_vetting_support');",
    replace:
      "       AND r.applies_mode = 'security_vetting_support'\n       AND (ti.permitted_mode = 'security_vetting_support' OR si.permitted_mode = 'security_vetting_support');",
    guard: GUARD,
    expect: "BESKT-DB-MODE-ESCALATION",
  },
  {
    id: "BESKT-NC-DB-OMISSION-CONDITION",
    defect: "an omitted answer becomes a routing condition",
    file: MIG,
    find: "    CHECK (condition_kind IN ('always', 'option_selected', 'boolean_equals')),",
    replace:
      "    CHECK (condition_kind IN ('always', 'option_selected', 'boolean_equals', 'omitted')),",
    guard: GUARD,
    expect: "BESKT-DB-OMISSION-NEUTRAL",
  },
  {
    id: "BESKT-NC-DB-OMISSION-RESOLVER",
    defect:
      "the resolver fires an option rule on any non-empty answer, including a discuss-orally state",
    file: MIG,
    find: "      WHEN 'option_selected' THEN\n        _answer IS NOT NULL\n        AND _answer ->> 'kind' = 'option'",
    replace: "      WHEN 'option_selected' THEN\n        _answer IS NOT NULL",
    guard: GUARD,
    expect: "BESKT-DB-OMISSION-NEUTRAL",
  },
  {
    id: "BESKT-NC-DB-ROUTE-CYCLE",
    defect: "cycles no longer block publication",
    file: MIG,
    find: "    SELECT 1 FROM walk WHERE walk.node = walk.origin) THEN\n    RETURN QUERY SELECT 'ROUTE_CYCLE'::text, 'blocking'::text,",
    replace:
      "    SELECT 1 FROM walk WHERE walk.node = walk.origin) THEN\n    RETURN QUERY SELECT 'ROUTE_CYCLE'::text, 'advisory'::text,",
    guard: GUARD,
    expect: "BESKT-DB-ROUTING",
  },
  // ---- idempotency and revision ---------------------------------------------
  {
    id: "BESKT-NC-DB-STALE-REVISION",
    defect: "a stale expected revision is accepted",
    file: MIG,
    find: "  IF _v.revision <> _expected_revision THEN\n    RAISE EXCEPTION 'BESKT_STALE_REVISION",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BESKT_STALE_REVISION",
    guard: GUARD,
    expect: "BESKT-DB-STALE-REVISION",
  },
  {
    id: "BESKT-NC-DB-REPLAY-PAYLOAD",
    defect: "a replay with a changed payload is served the old result",
    file: MIG,
    find: "  IF _receipt.request_hash IS DISTINCT FROM _request_hash THEN\n    RAISE EXCEPTION 'BESKT_OPERATION_PAYLOAD_MISMATCH",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BESKT_OPERATION_PAYLOAD_MISMATCH",
    guard: GUARD,
    expect: "BESKT-DB-REPLAY",
  },
  {
    id: "BESKT-NC-DB-REPLAY-AFTER-CAS",
    defect: "the touch RPC checks the compare-and-swap before answering a replay",
    file: MIG,
    find: "  -- Replay is answered BEFORE the compare-and-swap.\n  _replay := public.beskt_operation_begin(_operation_id, _request_hash);\n  IF _replay IS NOT NULL THEN RETURN _replay; END IF;\n\n  IF NOT public.scp_interview_can_edit(auth.uid()) THEN\n    RAISE EXCEPTION 'BESKT_NOT_EDITOR: editing a method version requires the platform content editor role.'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;\n\n  _v := public.beskt_lock_version(_method_version_id, _expected_revision);",
    replace:
      "  IF NOT public.scp_interview_can_edit(auth.uid()) THEN\n    RAISE EXCEPTION 'BESKT_NOT_EDITOR: editing a method version requires the platform content editor role.'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;\n\n  _v := public.beskt_lock_version(_method_version_id, _expected_revision);\n  _replay := public.beskt_operation_begin(_operation_id, _request_hash);\n  IF _replay IS NOT NULL THEN RETURN _replay; END IF;",
    guard: GUARD,
    expect: "BESKT-DB-REPLAY",
  },
  {
    id: "BESKT-NC-DB-REPLAY-BROKEN",
    defect: "the review RPC never answers a replay",
    file: MIG,
    find: "    'rationale', _rationale));\n  _replay := public.beskt_operation_begin(_operation_id, _request_hash);\n  IF _replay IS NOT NULL THEN RETURN _replay; END IF;",
    replace:
      "    'rationale', _rationale));\n  _replay := public.beskt_operation_begin(_operation_id, _request_hash);",
    guard: GUARD,
    expect: "BESKT-DB-REPLAY",
  },
  {
    id: "BESKT-NC-DB-OPERATION-NOT-UNIQUE",
    defect: "an operation id may be recorded twice",
    file: MIG,
    find: "CREATE UNIQUE INDEX beskt_method_events_operation_idx\n  ON public.beskt_method_events (operation_id) WHERE operation_id IS NOT NULL;",
    replace:
      "CREATE INDEX beskt_method_events_operation_idx\n  ON public.beskt_method_events (operation_id) WHERE operation_id IS NOT NULL;",
    guard: GUARD,
    expect: "BESKT-DB-REPLAY",
  },
  // ---- immutability and append-only ------------------------------------------
  {
    id: "BESKT-NC-DB-REVIEW-UPDATE",
    defect: "reviews become updatable (the trigger only covers DELETE)",
    file: MIG,
    find: "CREATE TRIGGER beskt_method_reviews_append_only\n  BEFORE UPDATE OR DELETE ON public.beskt_method_reviews",
    replace:
      "CREATE TRIGGER beskt_method_reviews_append_only\n  BEFORE DELETE ON public.beskt_method_reviews",
    guard: GUARD,
    expect: "BESKT-DB-APPEND-ONLY",
  },
  {
    id: "BESKT-NC-DB-EVENT-DELETE",
    defect: "events become deletable (the trigger only covers UPDATE)",
    file: MIG,
    find: "CREATE TRIGGER beskt_method_events_append_only\n  BEFORE UPDATE OR DELETE ON public.beskt_method_events",
    replace:
      "CREATE TRIGGER beskt_method_events_append_only\n  BEFORE UPDATE ON public.beskt_method_events",
    guard: GUARD,
    expect: "BESKT-DB-APPEND-ONLY",
  },
  {
    id: "BESKT-NC-DB-PUBLISHED-CHILD",
    defect: "children of a published version become editable",
    file: MIG,
    find: "  IF _status NOT IN ('draft', 'in_review') THEN\n    RAISE EXCEPTION\n      'BESKT_PUBLISHED_IMMUTABLE: % cannot be modified",
    replace:
      "  IF _status NOT IN ('draft', 'in_review', 'published') THEN\n    RAISE EXCEPTION\n      'BESKT_PUBLISHED_IMMUTABLE: % cannot be modified",
    guard: GUARD,
    expect: "BESKT-DB-PUBLISHED-IMMUTABLE",
  },
  {
    id: "BESKT-NC-DB-UNGUARDED-CHILD",
    defect: "the options table loses its child guard on UPDATE",
    file: MIG,
    find: "CREATE TRIGGER beskt_item_options_child_guard\n  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_item_options",
    replace:
      "CREATE TRIGGER beskt_item_options_child_guard\n  BEFORE INSERT OR DELETE ON public.beskt_item_options",
    guard: GUARD,
    expect: "BESKT-DB-PUBLISHED-IMMUTABLE",
  },
  {
    id: "BESKT-NC-DB-REVISION-REGRESSION",
    defect: "an older revision may overwrite newer content",
    file: MIG,
    find: "  IF NEW.revision < OLD.revision THEN\n    RAISE EXCEPTION 'BESKT_REVISION_REGRESSION",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BESKT_REVISION_REGRESSION",
    guard: GUARD,
    expect: "BESKT-DB-PUBLISHED-IMMUTABLE",
  },
  // ---- the read contract -----------------------------------------------------
  {
    id: "BESKT-NC-DB-READ-SECURITY-VETTING",
    defect: "employer members may read security-vetting content",
    file: MIG,
    find: "         AND v.content_status = 'published'\n         AND v.mode = 'recruitment_support'\n         AND EXISTS (SELECT 1 FROM public.employer_memberships em",
    replace:
      "         AND v.content_status = 'published'\n         AND EXISTS (SELECT 1 FROM public.employer_memberships em",
    guard: GUARD,
    expect: "BESKT-DB-READ-CONTRACT",
  },
  {
    id: "BESKT-NC-DB-READ-DRAFTS",
    defect: "the read contract returns drafts",
    file: MIG,
    find: "  IF _v.content_status <> 'published' THEN\n    RAISE EXCEPTION 'BESKT_NOT_PUBLISHED",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BESKT_NOT_PUBLISHED",
    guard: GUARD,
    expect: "BESKT-DB-READ-CONTRACT",
  },
  // ---- registration, rollback, bookkeeping, PR 1 -----------------------------
  {
    id: "BESKT-NC-DB-ROLLBACK-NOT-EXERCISED",
    defect: "db-test.sh stops applying the rollback file",
    file: DB,
    find: '  -f supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql 2>&1)"',
    replace: '  -c "SELECT \'BESKT_GOVERNED_CONTENT_ROLLBACK ok\'" 2>&1)"',
    guard: GUARD,
    expect: "BESKT-DB-SUITE",
  },
  {
    id: "BESKT-NC-DB-SUITE-FLOOR",
    defect: "the suite's assertion floor is lowered to nothing",
    file: DB,
    find: '  if [ "$BG_PASSED" -lt 190 ]; then',
    replace: '  if [ "$BG_PASSED" -lt 1 ]; then',
    guard: GUARD,
    expect: "BESKT-DB-SUITE",
  },
  {
    id: "BESKT-NC-DB-ROLLBACK-ROLE",
    defect: "the rollback leaves role_id nullable",
    file: RB,
    find: "ALTER TABLE public.scp_interview_packs ALTER COLUMN role_id SET NOT NULL;\n",
    replace: "",
    guard: GUARD,
    expect: "BESKT-DB-ROLLBACK",
  },
  {
    id: "BESKT-NC-DB-HOSTED-CLAIM",
    defect: "release-state.json claims the migration is applied on the owner project",
    file: STATE,
    find: '      "file": "20261108090000_beskt_governed_method_content.sql",\n      "hostedState": "pending",',
    replace:
      '      "file": "20261108090000_beskt_governed_method_content.sql",\n      "hostedState": "applied",',
    guard: GUARD,
    expect: "BESKT-DB-NO-HOSTED",
  },
  {
    id: "BESKT-NC-DB-PR1-CONTRACT",
    defect: "PR 1's contract is weakened to inherit the role-interview scoring",
    file: ADR,
    find: '"inheritRoleInterviewScoring": false',
    replace: '"inheritRoleInterviewScoring": true',
    guard: GUARD,
    expect: "BESKT-DB-PR1-CONTRACT",
  },
];

runControls("beskt-governed-content", MUTATIONS);
