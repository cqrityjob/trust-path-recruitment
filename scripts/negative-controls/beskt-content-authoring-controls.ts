/**
 * BESKT PR 7 negative controls: every material assertion of the
 * content-authoring guard must detect a planted defect in the REAL
 * computation — the migration's function bodies, signatures, grants and
 * postflight, the rollback's refusal and drop order, the harness ordering and
 * the release bookkeeping — never a comment, and never an error-message string
 * on its own.
 *
 * The defects worth planting here are the ones that would be catastrophic and
 * invisible: a door that stops going through the gate, a door that stops
 * answering a replay before it writes, a payload check that starts ignoring
 * unknown fields, a signature that couples a function to a table's row type,
 * and a door that restates a rule beskt_guard_child_row already owns.
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261118090000_beskt_governed_content_authoring.sql";
const RB = "supabase/rollback/20261118090000_beskt_governed_content_authoring_rollback.sql";
const SUITE = "supabase/tests/beskt_governed_content_authoring_test.sql";
const DB = "scripts/db-test.sh";
const STATE = "supabase/release-state.json";
const PKG = "package.json";
const TSCONFIG = "tsconfig.scripts.json";
const CI = ".github/workflows/ci.yml";
const FRONTIER = "scripts/release-frontier-check.ts";
const GUARD = "beskt-content-authoring:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- Authorisation -------------------------------------------------------
  {
    id: "AUT-NC-NO-EDITOR-CHECK",
    defect:
      "the gate stops requiring the platform content editor role, so any signed-in user can author governed method content",
    file: MIG,
    find:
      "  IF NOT public.scp_interview_can_edit(auth.uid()) THEN\n" +
      "    RAISE EXCEPTION\n" +
      "      'BESKT_NOT_EDITOR: authoring method content requires the platform content editor role.'\n" +
      "      USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;",
    replace: "  IF false THEN RAISE EXCEPTION 'BESKT_NOT_EDITOR'; END IF;",
    guard: GUARD,
    expect: "AUTHORING-GATE",
  },
  {
    id: "AUT-NC-NO-AUTH-CHECK",
    defect: "the gate stops checking that anybody is signed in at all",
    file: MIG,
    find:
      "  IF auth.uid() IS NULL THEN\n" +
      "    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';\n" +
      "  END IF;\n" +
      "  -- The SAME role beskt_touch_draft demands.",
    replace: "  -- The SAME role beskt_touch_draft demands.",
    guard: GUARD,
    expect: "AUTHORING-GATE",
  },
  {
    id: "AUT-NC-NO-REVISION-CAS",
    defect:
      "the gate stops locking the version at the revision the caller saw, so two editors silently overwrite one another",
    file: MIG,
    find: "  _v := public.beskt_lock_version(_method_version_id, _expected_revision);",
    replace: "  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;",
    guard: GUARD,
    expect: "AUTHORING-GATE",
  },
  {
    id: "AUT-NC-PUBLISHED-EDITABLE",
    defect: "a published version becomes editable again through the authoring doors",
    file: MIG,
    find: "  IF _v.content_status NOT IN ('draft', 'in_review') THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "AUTHORING-GATE",
  },
  {
    id: "AUT-NC-LOCK-BEFORE-EDITOR",
    defect:
      "the version row is locked BEFORE the editor check, so a stranger can hold a governed row open while being refused",
    file: MIG,
    find:
      "  -- The SAME role beskt_touch_draft demands. Authoring content and touching a\n" +
      "  -- draft are the same act of editorship; inventing a second role here would\n" +
      "  -- mean two answers to one question.\n" +
      "  IF NOT public.scp_interview_can_edit(auth.uid()) THEN",
    replace:
      "  _v := public.beskt_lock_version(_method_version_id, _expected_revision);\n" +
      "  IF NOT public.scp_interview_can_edit(auth.uid()) THEN",
    guard: GUARD,
    expect: "AUTHORING-ORDER",
  },
  {
    id: "AUT-NC-DOOR-SKIPS-GATE",
    defect:
      "one door stops going through the shared gate and decides for itself who may author a prompt",
    file: MIG,
    find:
      "  _v := public.beskt_content_gate(_method_version_id, _expected_revision);\n" +
      "\n" +
      "  SELECT id INTO _id FROM public.beskt_prompts",
    replace: "  SELECT id INTO _id FROM public.beskt_prompts",
    guard: GUARD,
    expect: "AUTHORING-GATE",
  },

  // ---- Idempotency ---------------------------------------------------------
  {
    id: "AUT-NC-NO-REPLAY",
    defect:
      "the item door stops answering a replay, so a retried save authors the same content twice",
    file: MIG,
    find:
      "    'op', 'author_item', 'method_version_id', _method_version_id,\n" +
      "    'expected_revision', _expected_revision, 'item', _item));\n" +
      "  _replay := public.beskt_operation_begin(_operation_id, _request_hash);\n" +
      "  IF _replay IS NOT NULL THEN RETURN _replay; END IF;",
    replace:
      "    'op', 'author_item', 'method_version_id', _method_version_id,\n" +
      "    'expected_revision', _expected_revision, 'item', _item));",
    guard: GUARD,
    expect: "AUTHORING-IDEMPOTENCY",
  },
  {
    id: "AUT-NC-NO-OPERATION-ID",
    defect: "the deletion door stops requiring an operation id, so the write is not replayable",
    file: MIG,
    find:
      "  IF _operation_id IS NULL THEN\n" +
      "    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'\n" +
      "      USING ERRCODE = 'check_violation';\n" +
      "  END IF;\n" +
      "  IF _family IS NULL OR _family NOT IN",
    replace: "  IF _family IS NULL OR _family NOT IN",
    guard: GUARD,
    expect: "AUTHORING-IDEMPOTENCY",
  },

  // ---- The payload contract ------------------------------------------------
  {
    id: "AUT-NC-UNKNOWN-FIELDS-IGNORED",
    defect:
      "an unknown payload field is silently dropped instead of refused, so a misspelled governed field goes unwritten and unnoticed",
    file: MIG,
    find:
      "  SELECT array_agg(k ORDER BY k) INTO _unknown\n" +
      "    FROM jsonb_object_keys(_payload) k\n" +
      "   WHERE NOT (k = ANY (_allowed));",
    replace: "  _unknown := NULL;",
    guard: GUARD,
    expect: "AUTHORING-PAYLOAD",
  },
  {
    id: "AUT-NC-PAYLOAD-SHAPE-UNCHECKED",
    defect: "a payload that is not a json object is read anyway",
    file: MIG,
    find: "  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "AUTHORING-PAYLOAD",
  },
  {
    id: "AUT-NC-PAYLOAD-CHECKER-IS-DEFINER",
    defect:
      "the pure payload checker is marked SECURITY DEFINER, handing privileges to a function that only compares key names",
    file: MIG,
    find: "RETURNS void\nLANGUAGE plpgsql\nIMMUTABLE\nSET search_path = public\nAS $$\nDECLARE _unknown text[];",
    replace:
      "RETURNS void\nLANGUAGE plpgsql\nIMMUTABLE\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE _unknown text[];",
    guard: GUARD,
    expect: "AUTHORING-PAYLOAD",
  },
  {
    id: "AUT-NC-DOOR-SKIPS-PAYLOAD-CHECK",
    defect: "the routing door stops checking its payload against a declared field list",
    file: MIG,
    find:
      "  PERFORM public.beskt_content_reject_unknown_keys('routing rule', _rule, ARRAY[\n" +
      "    'rule_key', 'evaluation_order', 'applies_mode', 'source_item_key',\n" +
      "    'condition_kind', 'condition_option_key', 'condition_boolean',\n" +
      "    'action', 'target_item_key']);\n",
    replace: "",
    guard: GUARD,
    expect: "AUTHORING-PAYLOAD",
  },
  {
    id: "AUT-NC-NESTED-OPTIONS-UNCHECKED",
    defect:
      "the nested option payload is trusted because it arrived inside a checked one, so an option can carry an invented field",
    file: MIG,
    find:
      "      PERFORM public.beskt_content_reject_unknown_keys('item option', _opt, ARRAY[\n" +
      "        'option_key', 'display_order', 'label_sv', 'label_en']);\n",
    replace: "",
    guard: GUARD,
    expect: "AUTHORING-PAYLOAD",
  },
  {
    id: "AUT-NC-SCORE-FIELD-ACCEPTED",
    defect: "a door starts accepting a field named for a score",
    file: MIG,
    find: "    'content_provenance', 'source_reference', 'prohibited_inferences', 'options']);",
    replace:
      "    'content_provenance', 'source_reference', 'prohibited_inferences', 'options', 'risk_score']);",
    guard: GUARD,
    expect: "AUTHORING-NO-JUDGEMENT",
  },

  // ---- One law -------------------------------------------------------------
  {
    id: "AUT-NC-RESTATES-THE-LAW",
    defect:
      "a door restates a routing rule the child guard already owns, creating a second copy that will drift from the real one",
    file: MIG,
    find: "  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,\n    'content_upserted', 'routing_rule', _key, _id, _created);",
    replace:
      "  IF _created AND false THEN\n    RAISE EXCEPTION 'BESKT_ROUTE_BACKWARD: a rule may only move forward.';\n  END IF;\n  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,\n    'content_upserted', 'routing_rule', _key, _id, _created);",
    guard: GUARD,
    expect: "AUTHORING-ONE-LAW",
  },
  {
    id: "AUT-NC-PREFLIGHT-IGNORES-GUARD",
    defect:
      "the preflight stops refusing to open a door onto a content table that has lost its child guard",
    file: MIG,
    find:
      "      RAISE EXCEPTION\n" +
      "        'BESKT_AUTHORING_PREFLIGHT: public.% does not carry beskt_guard_child_row; refusing to open a door onto an unguarded table.', _t;",
    replace: "      RAISE NOTICE 'public.% has no child guard', _t;",
    guard: GUARD,
    expect: "AUTHORING-ONE-LAW",
  },
  {
    id: "AUT-NC-DISABLES-A-TRIGGER",
    defect: "the migration disables the very trigger its doors stand on",
    file: MIG,
    find: "-- 11 · Postflight.",
    replace:
      "ALTER TABLE public.beskt_items DISABLE TRIGGER beskt_items_child_guard;\n\n-- 11 · Postflight.",
    guard: GUARD,
    expect: "AUTHORING-ONE-LAW",
  },

  // ---- Composite-type coupling --------------------------------------------
  {
    id: "AUT-NC-ROWTYPE-COUPLING",
    defect:
      "the gate goes back to returning the version ROW TYPE, which makes it a dependency of beskt_method_versions and breaks the 20261108090000 rollback with 'cannot drop table because other objects depend on it'",
    file: MIG,
    find:
      "CREATE OR REPLACE FUNCTION public.beskt_content_gate(\n" +
      "  _method_version_id uuid, _expected_revision integer)\n" +
      "RETURNS jsonb",
    replace:
      "CREATE OR REPLACE FUNCTION public.beskt_content_gate(\n" +
      "  _method_version_id uuid, _expected_revision integer)\n" +
      "RETURNS public.beskt_method_versions",
    guard: GUARD,
    expect: "AUTHORING-NO-COUPLING",
  },

  // ---- Client DML ----------------------------------------------------------
  {
    id: "AUT-NC-GRANTS-CLIENT-DML",
    defect:
      "the migration grants the browser role INSERT on a content table, which is the entire thing these doors exist to avoid",
    file: MIG,
    find: "-- ---------------------------------------------------------------------------\n-- 11 · Postflight.",
    replace:
      "GRANT INSERT, UPDATE ON public.beskt_items TO authenticated;\n\n-- ---------------------------------------------------------------------------\n-- 11 · Postflight.",
    guard: GUARD,
    expect: "AUTHORING-NO-DML",
  },
  {
    id: "AUT-NC-POSTFLIGHT-SKIPS-DML-PROOF",
    defect:
      "the postflight stops asking information_schema whether a browser role holds table DML and merely promises it does not",
    file: MIG,
    find:
      "     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')\n" +
      "     AND grantee IN ('anon', 'authenticated', 'PUBLIC');\n" +
      "  IF _n <> 0 THEN",
    replace:
      "     AND privilege_type IN ('SELECT')\n" +
      "     AND grantee IN ('nobody');\n" +
      "  IF _n <> 0 THEN",
    guard: GUARD,
    expect: "AUTHORING-NO-DML",
  },

  // ---- The finisher --------------------------------------------------------
  {
    id: "AUT-NC-HASH-NOT-RECOMPUTED",
    defect:
      "the stored content hash stops being recomputed, so the version's hash no longer names the bytes it has",
    file: MIG,
    find: "  _hash := public.beskt_method_content_hash(_version_id);",
    replace:
      "  _hash := (SELECT content_hash FROM public.beskt_method_versions WHERE id = _version_id);",
    guard: GUARD,
    expect: "AUTHORING-HASH",
  },
  {
    id: "AUT-NC-REVISION-NOT-ADVANCED",
    defect:
      "the revision stops advancing on an authoring write, so a concurrent editor's compare-and-swap can no longer detect the change",
    file: MIG,
    find: "     SET content_hash = _hash, revision = _revision + 1, updated_at = now()",
    replace: "     SET content_hash = _hash, updated_at = now()",
    guard: GUARD,
    expect: "AUTHORING-HASH",
  },
  {
    id: "AUT-NC-UNGOVERNED-VERSION-WRITE",
    defect:
      "the governed-transition flag is dropped, so the version guard no longer distinguishes a governed write from a direct one",
    file: MIG,
    find: "  PERFORM set_config('beskt.governed_transition', 'on', true);\n  UPDATE public.beskt_method_versions",
    replace: "  UPDATE public.beskt_method_versions",
    guard: GUARD,
    expect: "AUTHORING-HASH",
  },
  {
    id: "AUT-NC-DOOR-WRITES-THE-VERSION",
    defect:
      "one door writes the version row itself instead of going through the single finisher, so the nine doors can drift apart",
    file: MIG,
    find: "  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,\n    'content_upserted', 'section', _key, _id, _created);",
    replace:
      "  UPDATE public.beskt_method_versions SET updated_at = now() WHERE id = _method_version_id;\n  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,\n    'content_upserted', 'section', _key, _id, _created);",
    guard: GUARD,
    expect: "AUTHORING-HASH",
  },
  {
    id: "AUT-NC-NO-EVENT",
    defect: "an authoring write stops being recorded on the append-only governance ledger",
    file: MIG,
    find: "  PERFORM public.beskt_record_event(\n    _pack_id, _version_id, _event,",
    replace: "  PERFORM public.beskt_record_event_disabled(\n    _pack_id, _version_id, _event,",
    guard: GUARD,
    expect: "AUTHORING-AUDIT",
  },
  {
    id: "AUT-NC-EVENT-LOSES-SUBJECT",
    defect:
      "the recorded event stops naming which row it touched, so the ledger says something changed but not what",
    file: MIG,
    find: "    jsonb_build_object('family', _family, 'key', _key, 'row_id', _row_id, 'created', _created));",
    replace: "    '{}'::jsonb);",
    guard: GUARD,
    expect: "AUTHORING-AUDIT",
  },
  {
    id: "AUT-NC-RESULT-DROPS-NO-SCORE",
    defect:
      "the authoring result stops saying it produces no score, leaving a reader free to assume one exists",
    file: MIG,
    find: "    'produces_score', false,\n    'interpretation', 'none');",
    replace: "    'interpretation', 'none');",
    guard: GUARD,
    expect: "AUTHORING-NO-JUDGEMENT",
  },

  // ---- Separation of duties ------------------------------------------------
  {
    id: "AUT-NC-AUTHOR-CAN-REVIEW",
    defect: "an authoring door starts writing a review, so the author approves their own content",
    file: MIG,
    find: "  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,\n    'content_upserted', 'item', _key, _id, _created);",
    replace:
      "  INSERT INTO public.beskt_method_reviews (method_version_id, gate) VALUES (_method_version_id, 'recruitment');\n  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,\n    'content_upserted', 'item', _key, _id, _created);",
    guard: GUARD,
    expect: "AUTHORING-SEPARATION",
  },
  {
    id: "AUT-NC-AUTHOR-CAN-PUBLISH",
    defect: "an authoring door starts moving the version's lifecycle status",
    file: MIG,
    find: "     SET content_hash = _hash, revision = _revision + 1, updated_at = now()\n   WHERE id = _version_id;",
    replace:
      "     SET content_hash = _hash, revision = _revision + 1, updated_at = now(), content_status = 'published'\n   WHERE id = _version_id;",
    guard: GUARD,
    expect: "AUTHORING-SEPARATION",
  },

  // ---- Postflight ----------------------------------------------------------
  {
    id: "AUT-NC-POSTFLIGHT-NO-PROOF",
    defect: "the migration stops proving its own outcome before committing",
    file: MIG,
    find: "  RAISE NOTICE 'BESKT_GOVERNED_CONTENT_AUTHORING_PROOF ok';",
    replace: "  NULL;",
    guard: GUARD,
    expect: "AUTHORING-POSTFLIGHT",
  },
  {
    id: "AUT-NC-POSTFLIGHT-SKIPS-ANON",
    defect: "the postflight stops proving that anon can reach none of the doors",
    file: MIG,
    find: "    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN",
    replace: "    IF false THEN",
    guard: GUARD,
    expect: "AUTHORING-POSTFLIGHT",
  },
  {
    id: "AUT-NC-POSTFLIGHT-SKIPS-INTERNALS",
    defect:
      "the postflight stops proving the two internals are closed to authenticated, so an unguarded gate could be published as an API",
    file: MIG,
    find: "        'BESKT_AUTHORING_PROOF: % applies no authorisation of its own and must not be callable by authenticated.', _fn;",
    replace: "        'BESKT_AUTHORING_PROOF: %', _fn;",
    guard: GUARD,
    expect: "AUTHORING-POSTFLIGHT",
  },
  {
    id: "AUT-NC-POSTFLIGHT-SKIPS-JUDGEMENT-SWEEP",
    defect:
      "the postflight stops asking the catalogue whether a judgement column exists in the content domain",
    file: MIG,
    find:
      "                WHERE table_schema = 'public' AND table_name = ANY (_content_tables)\n" +
      "                  AND column_name LIKE '%' || _word || '%') THEN",
    replace: "                WHERE false) THEN",
    guard: GUARD,
    expect: "AUTHORING-POSTFLIGHT",
  },
  {
    id: "AUT-NC-VOCABULARY-NARROWED",
    defect:
      "the rebuilt event CHECK silently drops a lifecycle member, breaking publication with no error at apply time",
    file: MIG,
    find: "    'review_approved', 'review_rejected',\n    'published', 'suspended', 'retired',\n    -- this migration",
    replace:
      "    'review_approved', 'review_rejected',\n    'published', 'suspended',\n    -- this migration",
    guard: GUARD,
    expect: "AUTHORING-VOCABULARY",
  },
  {
    id: "AUT-NC-NO-AUTHORING-EVENT-VOCAB",
    defect:
      "the two authoring events are not admitted, so authoring would fail at runtime rather than at apply time",
    file: MIG,
    find: "    'content_upserted', 'content_deleted'));",
    replace: "    'content_upserted'));",
    guard: GUARD,
    expect: "AUTHORING-AUDIT",
  },

  // ---- The rollback --------------------------------------------------------
  {
    id: "AUT-NC-ROLLBACK-IGNORES-LEDGER",
    defect:
      "the rollback tries to narrow the vocabulary over an append-only ledger that already records authoring, so it fails halfway through having already dropped the doors",
    file: RB,
    find: "   WHERE event IN ('content_upserted', 'content_deleted');\n  IF _events <> 0 THEN",
    replace: "   WHERE event IN ('content_upserted', 'content_deleted');\n  IF false THEN",
    guard: GUARD,
    expect: "AUTHORING-ROLLBACK",
  },
  {
    id: "AUT-NC-ROLLBACK-DELETES-CONTENT",
    defect:
      "the rollback deletes the authored content along with the doors, discarding what five human gates approved",
    file: RB,
    find: "-- ---- the nine doors ------------------------------------------------------",
    replace:
      "DELETE FROM public.beskt_items;\n\n-- ---- the nine doors ------------------------------------------------------",
    guard: GUARD,
    expect: "AUTHORING-ROLLBACK",
  },
  {
    id: "AUT-NC-ROLLBACK-CASCADE",
    defect: "the rollback drops with CASCADE, silently taking whatever else depended on the doors",
    file: RB,
    find: "DROP FUNCTION IF EXISTS public.beskt_content_gate(uuid, integer);",
    replace: "DROP FUNCTION IF EXISTS public.beskt_content_gate(uuid, integer) CASCADE;",
    guard: GUARD,
    expect: "AUTHORING-ROLLBACK",
  },
  {
    id: "AUT-NC-ROLLBACK-LEAVES-A-DOOR",
    defect: "the rollback leaves one door behind while claiming nothing of PR 7 survives",
    file: RB,
    find: "DROP FUNCTION IF EXISTS public.beskt_author_prompt(uuid, uuid, integer, jsonb);\n",
    replace: "",
    guard: GUARD,
    expect: "AUTHORING-ROLLBACK",
  },
  {
    id: "AUT-NC-ROLLBACK-NARROWS-PAST",
    defect:
      "the restored vocabulary drops a lifecycle member too, so unwinding PR 7 breaks the domain beneath it",
    file: RB,
    find: "    'method_created', 'version_created', 'new_version_created',\n    'draft_touched', 'submitted_for_review',",
    replace:
      "    'version_created', 'new_version_created',\n    'draft_touched', 'submitted_for_review',",
    guard: GUARD,
    expect: "AUTHORING-ROLLBACK",
  },
  {
    id: "AUT-NC-ROLLBACK-NO-PROOF",
    defect: "the rollback stops proving the way back is actually clear",
    file: RB,
    find: "  RAISE NOTICE 'BESKT_GOVERNED_CONTENT_AUTHORING_ROLLBACK ok';",
    replace: "  NULL;",
    guard: GUARD,
    expect: "AUTHORING-ROLLBACK",
  },
  {
    id: "AUT-NC-ROLLBACK-SKIPS-LIFECYCLE-PROOF",
    defect:
      "the rollback stops proving the ten governed lifecycle RPCs survived, so an over-broad unwind would go unnoticed",
    file: RB,
    find: "      'BESKT_CONTENT_AUTHORING_ROLLBACK: the ten governed lifecycle RPCs should all survive, found %.', _n;",
    replace: "      'BESKT_CONTENT_AUTHORING_ROLLBACK: %', _n;",
    guard: GUARD,
    expect: "AUTHORING-ROLLBACK",
  },

  // ---- The suite -----------------------------------------------------------
  {
    id: "AUT-NC-SUITE-DROPS-THE-CLAIM",
    defect:
      "the suite stops submitting the authored method, so it proves the functions run but not that they can produce a submittable method",
    file: SUITE,
    find: "    'A1.8 and it SUBMITS to the five gates -- a complete method authored with no service_role, no owner and no migration');",
    replace: "    'A1.8 the submission returned something');",
    guard: GUARD,
    expect: "AUTHORING-SUITE",
  },
  {
    id: "AUT-NC-SUITE-SEEDS",
    defect: "the suite commits its synthetic world instead of rolling it back",
    file: SUITE,
    find: "\nROLLBACK;",
    replace: "\nCOMMIT;",
    guard: GUARD,
    expect: "AUTHORING-SUITE",
  },
  {
    id: "AUT-NC-SUITE-DUPLICATE-LABEL",
    defect: "two assertions share a label, so a failure no longer names exactly one thing",
    file: SUITE,
    find: "'A1d.3 and all three requirement STATEMENTS exist'",
    replace: "'A1d.1 a fresh security-vetting version is blocked on its activation requirements'",
    guard: GUARD,
    expect: "AUTHORING-SUITE",
  },
  {
    id: "AUT-NC-SUITE-STOPS-PROVING-THE-LAW",
    defect:
      "the suite stops proving that a backward routing rule is still refused when it arrives through a door",
    file: SUITE,
    find: "    'BESKT_ROUTE_BACKWARD',",
    replace: "    'BESKT_CONTENT_PARENT_UNKNOWN',",
    guard: GUARD,
    expect: "AUTHORING-SUITE",
  },
  {
    id: "AUT-NC-SUITE-STOPS-EXERCISING-DML-ABSENCE",
    defect:
      "the suite stops EXERCISING an editor's direct table write and only reads the catalogue instead",
    file: SUITE,
    find: "    'A8.2 and an EDITOR writing straight at the table is refused by privilege, not by politeness');",
    replace: "    'A8.2 the direct write path was considered');",
    guard: GUARD,
    expect: "AUTHORING-SUITE",
  },

  // ---- Registration --------------------------------------------------------
  {
    id: "AUT-NC-DB-TEST-UNREGISTERED",
    defect: "the behaviour suite stops running in the database harness",
    file: DB,
    find: '  -f supabase/tests/beskt_governed_content_authoring_test.sql 2>&1)"',
    replace: '  -f supabase/tests/beskt_governed_content_authoring_test_unused.sql 2>&1)"',
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-DB-TEST-FLOOR-LOWERED",
    defect: "the assertion floor is lowered to nothing, so a silently shrinking suite still passes",
    file: DB,
    find: '  if [ "$AUT_PASSED" -lt 55 ]; then',
    replace: '  if [ "$AUT_PASSED" -lt 1 ]; then',
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-DB-TEST-FAILURE-IGNORED",
    defect:
      "a failure in the PR 7 block prints and the run continues, so a red suite reports green",
    file: DB,
    find: '  suite_failed "BESKT content authoring"',
    replace: '  echo "    !!  BESKT content authoring had failures"',
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-CONTROLS-NOT-IN-ALL",
    defect:
      "these controls drop out of negative-controls:all, so a dead assertion stops being visible",
    file: PKG,
    find: "bun run negative-controls:beskt-content-authoring && ",
    replace: "",
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-CI-UNREGISTERED",
    defect: "the guard stops running in CI",
    file: CI,
    find: "        run: bun run beskt-content-authoring:check",
    replace: "        run: echo skipped",
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-TSCONFIG-UNREGISTERED",
    defect: "the guard stops being typechecked",
    file: TSCONFIG,
    find: '    "scripts/beskt-content-authoring-check.ts",\n',
    replace: "",
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-STATE-CLAIMS-APPLIED",
    defect:
      "release-state.json stops saying the migration is applied, so the repository and production disagree and an application PR that depends on it would be blocked for no reason",
    file: STATE,
    find: '"file": "20261118090000_beskt_governed_content_authoring.sql",\n      "hostedState": "applied",',
    replace:
      '"file": "20261118090000_beskt_governed_content_authoring.sql",\n      "hostedState": "unverified",',
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    // The half that matters most now: "applied" is a statement about
    // production, and the only thing separating it from a guess is the
    // evidence beside it. An entry that cannot say how it knows is exactly the
    // entry that goes stale next.
    id: "AUT-NC-STATE-DROPS-EVIDENCE",
    defect:
      "the applied entry keeps its claim but loses the evidence naming the hosted version, slug and project it was verified against",
    file: STATE,
    find: '"file": "20261118090000_beskt_governed_content_authoring.sql",\n      "hostedState": "applied",\n      "evidenceSource": "Applied',
    replace:
      '"file": "20261118090000_beskt_governed_content_authoring.sql",\n      "hostedState": "applied",\n      "evidenceSourceRemoved": "Applied',
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-STATE-HIDES-OBJECT",
    defect:
      "one door stops being declared as introduced, so release-parity can no longer tell whether code may depend on it",
    file: STATE,
    find: '        {\n          "object": "beskt_author_item",\n          "kind": "function"\n        },\n',
    replace: "",
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
  {
    id: "AUT-NC-FRONTIER-NOT-PENDING",
    defect:
      "the migration comes off the owner-level pending list while release-state.json still says pending",
    file: FRONTIER,
    // This migration is APPLIED now, so the defect inverts: putting it back
    // on the owner-level pending list would contradict release-state.json,
    // which records it as applied with hosted evidence. The anchor is the
    // empty list Prettier produces when nothing is pending.
    find: 'const expectedPending: string[] = ["20261123090000_sp_credential_organisation_roles.sql"];',
    replace:
      'const expectedPending: string[] = ["20261123090000_sp_credential_organisation_roles.sql","20261118090000_beskt_governed_content_authoring.sql"];',
    guard: GUARD,
    expect: "AUTHORING-REGISTRATION",
  },
];

runControls("beskt-content-authoring", MUTATIONS);
