/**
 * BESKT PR 3 negative controls: every material assertion of the
 * candidate-preparation guard must detect a planted defect in the real
 * computation — the migration's function bodies, DDL, triggers and grants,
 * the rollback's verbatim restore and drop order, the harness ordering, the
 * release bookkeeping and the application surface — never a comment and never
 * an error-message string on its own.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261110090000_bcp_candidate_preparation.sql";
const RB = "supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql";
const DB = "scripts/db-test.sh";
const RB_SUITE = "supabase/tests/scp_a_rollback_test.sql";
const STATE = "supabase/release-state.json";
const PKG = "package.json";
const TSCONFIG = "tsconfig.scripts.json";
const CI = ".github/workflows/ci.yml";
const DICT = "src/i18n/dictionaries.ts";
const TYPES = "src/integrations/supabase/types.ts";
const FUNCTIONS = "src/lib/beskt/candidate-preparation.functions.ts";
const LIBRARY = "src/components/beskt/MethodSupportSection.tsx";
const PANEL = "src/components/beskt/BesktApplicationPanel.tsx";
const CANDIDATE = "src/components/beskt/CandidatePreparation.tsx";
const GUARD = "beskt-candidate-preparation:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- RLS, grants and policies -------------------------------------------
  {
    id: "BCP-NC-FORCE-RLS",
    defect: "FORCE RLS is removed from the assignment table",
    file: MIG,
    find: "ALTER TABLE public.bcp_assignments               FORCE ROW LEVEL SECURITY;",
    replace: "ALTER TABLE public.bcp_assignments               NO FORCE ROW LEVEL SECURITY;",
    guard: GUARD,
    expect: "BCP-RLS",
  },
  {
    id: "BCP-NC-SERVICE-ROLE-NOT-REVOKED",
    defect: "the event ledger is left with service_role's default write privileges",
    file: MIG,
    find: "REVOKE ALL ON public.bcp_events                  FROM PUBLIC, anon, authenticated, service_role;",
    replace: "REVOKE ALL ON public.bcp_events                  FROM PUBLIC, anon, authenticated;",
    guard: GUARD,
    expect: "BCP-GRANTS",
  },
  {
    id: "BCP-NC-CLIENT-WRITE-GRANT",
    defect: "a client role is granted INSERT on the answers table",
    file: MIG,
    find: "GRANT SELECT ON public.bcp_answers                 TO authenticated, service_role;",
    replace:
      "GRANT SELECT ON public.bcp_answers                 TO authenticated, service_role;\nGRANT INSERT ON public.bcp_answers TO authenticated;",
    guard: GUARD,
    expect: "BCP-GRANTS",
  },
  {
    id: "BCP-NC-WRITE-POLICY",
    defect: "a client write policy is added to the answers table",
    file: MIG,
    find: "CREATE POLICY bcp_answers_party_read ON public.bcp_answers\n  FOR SELECT TO authenticated",
    replace:
      "CREATE POLICY bcp_answers_party_write ON public.bcp_answers\n  FOR INSERT TO authenticated\n  WITH CHECK (auth.uid() IS NOT NULL);\nCREATE POLICY bcp_answers_party_read ON public.bcp_answers\n  FOR SELECT TO authenticated",
    guard: GUARD,
    expect: "BCP-RLS",
  },

  // ---- No interpretation anywhere in the schema ----------------------------
  {
    id: "BCP-NC-FORBIDDEN-COLUMN",
    defect: "a risk column appears on the assignment",
    file: MIG,
    find: "  -- Compare-and-swap.\n  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),",
    replace:
      "  -- Compare-and-swap.\n  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),\n  risk_note text,",
    guard: GUARD,
    expect: "BCP-NO-SCORE",
  },
  {
    id: "BCP-NC-UNGOVERNED-ANSWER-DOCUMENT",
    defect: "answers gain a free-form jsonb document beside the typed columns",
    file: MIG,
    find: "  value_boolean boolean,\n  value_text text,\n  value_date date,\n  selected_option_keys text[],",
    replace:
      "  value_boolean boolean,\n  value_text text,\n  value_date date,\n  selected_option_keys text[],\n  answer_payload jsonb,",
    guard: GUARD,
    expect: "BCP-TYPED-ANSWERS",
  },
  {
    id: "BCP-NC-FOURTH-RESPONSE-STATE",
    defect: "a fourth candidate response state is admitted",
    file: MIG,
    find: "  response_state text NOT NULL CHECK (response_state IN ('answered', 'omitted', 'discuss_orally')),",
    replace:
      "  response_state text NOT NULL CHECK (response_state IN ('answered', 'omitted', 'discuss_orally', 'refused')),",
    guard: GUARD,
    expect: "BCP-NEUTRAL-STATES",
  },
  {
    id: "BCP-NC-NEUTRAL-CARRIES-VALUE",
    defect: "an omitted answer is allowed to carry a value after all",
    file: MIG,
    find: "  CONSTRAINT bcp_answers_neutral_is_empty_check CHECK (\n    response_state = 'answered'\n    OR (value_boolean IS NULL AND value_text IS NULL\n        AND value_date IS NULL AND selected_option_keys IS NULL)),",
    replace: "  CONSTRAINT bcp_answers_neutral_is_empty_check CHECK (true),",
    guard: GUARD,
    expect: "BCP-NEUTRAL-STATES",
  },
  {
    id: "BCP-NC-SECURITY-VETTING-ASSIGNABLE",
    defect: "security-vetting support becomes representable on an assignment",
    file: MIG,
    find: "  mode text NOT NULL DEFAULT 'recruitment_support' CHECK (mode = 'recruitment_support'),",
    replace:
      "  mode text NOT NULL DEFAULT 'recruitment_support'\n    CHECK (mode IN ('recruitment_support', 'security_vetting_support')),",
    guard: GUARD,
    expect: "BCP-SECURITY-VETTING",
  },

  // ---- Idempotency and compare-and-swap ------------------------------------
  {
    id: "BCP-NC-REPLAY-AFTER-WRITE",
    defect: "the assignment is written before the replay is answered",
    file: MIG,
    find: "  _hash := public.beskt_request_hash(_request);\n  _replay := public.bcp_operation_begin(_operation_id, _hash);\n  IF _replay IS NOT NULL THEN RETURN _replay; END IF;\n\n  -- ---- the existing spine: application, employer, job, candidate ---------",
    replace:
      "  _hash := public.beskt_request_hash(_request);\n\n  -- ---- the existing spine: application, employer, job, candidate ---------",
    guard: GUARD,
    expect: "BCP-IDEMPOTENCY",
  },
  {
    id: "BCP-NC-NO-OPERATION-LEDGER",
    defect: "a governed mutation stops writing its append-only event",
    file: MIG,
    find: "  PERFORM public.bcp_record_event(_assignment_id, NULL, _a.employer_id, _a.method_version_id,\n    'assignment_cancelled', _a.lifecycle_state, 'cancelled', _reason, _a.pinned_content_hash,\n    _a.revision + 1, _operation_id, _hash, _result);\n",
    replace: "",
    guard: GUARD,
    expect: "BCP-LEDGER",
  },
  {
    id: "BCP-NC-STALE-REVISION-AFTER-WRITE",
    defect: "the save writes its answers before it checks the revision it was given",
    file: MIG,
    find: "  IF _r.revision <> _expected_revision THEN\n    RAISE EXCEPTION 'BCP_STALE_REVISION: the draft is at revision % but the request expected revision %. Reload and retry.',\n      _r.revision, _expected_revision USING ERRCODE = 'check_violation';\n  END IF;\n\n  -- ---- what the candidate can currently see -----------------------------",
    replace: "  -- ---- what the candidate can currently see -----------------------------",
    guard: GUARD,
    expect: "BCP-CAS",
  },

  // ---- Internal helpers -----------------------------------------------------
  {
    id: "BCP-NC-INTERNAL-HELPER-EXPOSED",
    defect: "the visibility helper becomes callable by any signed-in user",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_visible_items(uuid, uuid) FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.bcp_visible_items(uuid, uuid) TO service_role;",
    replace:
      "REVOKE ALL ON FUNCTION public.bcp_visible_items(uuid, uuid) FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.bcp_visible_items(uuid, uuid) TO authenticated, service_role;",
    guard: GUARD,
    expect: "BCP-INTERNAL",
  },
  {
    id: "BCP-NC-GUARD-FUNCTION-EXPOSED",
    defect: "a trigger guard becomes executable by a client role",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_guard_answer() FROM PUBLIC, anon, authenticated;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_guard_answer() FROM PUBLIC, anon;",
    guard: GUARD,
    expect: "BCP-INTERNAL",
  },

  // ---- Append-only and immutability ----------------------------------------
  {
    id: "BCP-NC-LEDGER-EDITABLE",
    defect: "the event ledger stops refusing UPDATE",
    file: MIG,
    find: "CREATE TRIGGER bcp_events_append_only\n  BEFORE UPDATE OR DELETE ON public.bcp_events",
    replace: "CREATE TRIGGER bcp_events_append_only\n  BEFORE DELETE ON public.bcp_events",
    guard: GUARD,
    expect: "BCP-APPEND-ONLY",
  },
  {
    id: "BCP-NC-ACK-EDITABLE",
    defect: "a notice acknowledgement becomes editable",
    file: MIG,
    find: "CREATE TRIGGER bcp_notice_acknowledgements_append_only\n  BEFORE UPDATE OR DELETE ON public.bcp_notice_acknowledgements",
    replace:
      "CREATE TRIGGER bcp_notice_acknowledgements_append_only\n  BEFORE DELETE ON public.bcp_notice_acknowledgements",
    guard: GUARD,
    expect: "BCP-APPEND-ONLY",
  },
  {
    id: "BCP-NC-PINNED-HASH-MUTABLE",
    defect: "the pinned content hash can be swapped under an existing assignment",
    file: MIG,
    find: "       OR NEW.pinned_content_hash IS DISTINCT FROM OLD.pinned_content_hash\n",
    replace: "",
    guard: GUARD,
    expect: "BCP-IMMUTABLE",
  },
  {
    id: "BCP-NC-SUBMITTED-RESPONSE-EDITABLE",
    defect: "a submitted response stops being frozen",
    file: MIG,
    find: "  IF OLD.response_state = 'submitted' THEN\n    RAISE EXCEPTION 'BCP_RESPONSE_IMMUTABLE: a submitted response is frozen; a correction is a new version.'\n      USING ERRCODE = 'check_violation';\n  END IF;",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BCP_RESPONSE_IMMUTABLE_unused';\n  END IF;",
    guard: GUARD,
    expect: "BCP-IMMUTABLE",
  },
  {
    id: "BCP-NC-ANSWER-RACE-UNLOCKED",
    defect: "an answer write stops locking its owning response before reading its state",
    file: MIG,
    find: "    SELECT r.response_state INTO _state FROM public.bcp_responses r\n      WHERE r.id = NEW.response_id FOR SHARE;",
    replace:
      "    SELECT r.response_state INTO _state FROM public.bcp_responses r\n      WHERE r.id = NEW.response_id;",
    guard: GUARD,
    expect: "BCP-IMMUTABLE",
  },
  {
    id: "BCP-NC-PILOT-UNGOVERNED-WRITE",
    defect: "the pilot-grant table accepts a write from outside its governed RPCs",
    file: MIG,
    find: "  IF coalesce(current_setting('bcp.pilot_grant_write', true), '') <> 'on' THEN\n    RAISE EXCEPTION 'BCP_PILOT_UNGOVERNED_WRITE: bcp_pilot_grants is written only by bcp_grant_pilot() and bcp_revoke_pilot().'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BCP_PILOT_UNGOVERNED_unused';\n  END IF;",
    guard: GUARD,
    expect: "BCP-AUTHORITY",
  },

  // ---- The one read-contract change, and no more ---------------------------
  {
    id: "BCP-NC-GOVERNANCE-PREDICATE-CONTAMINATED",
    defect: "the governance predicate is widened with the preparation branch too",
    file: MIG,
    find: "  SELECT auth.uid() IS NOT NULL AND (\n    -- Governance readers: every state, both modes.\n    public.scp_interview_can_read(auth.uid())",
    replace:
      "  SELECT auth.uid() IS NOT NULL AND (\n    public.bcp_party_can_read_method_version(_method_version_id)\n    -- Governance readers: every state, both modes.\n    OR public.scp_interview_can_read(auth.uid())",
    guard: GUARD,
    expect: "BCP-READ-CONTRACT",
  },
  {
    id: "BCP-NC-FULL-DOCUMENT-WIDENED",
    defect: "the full governed document is re-gated on the widened predicate",
    file: MIG,
    find: "  IF NOT public.beskt_governance_can_read_version(_method_version_id) THEN\n    RAISE EXCEPTION 'BESKT_NOT_AUTHORISED: you may not read this method version.'",
    replace:
      "  IF NOT public.beskt_can_read_version(_method_version_id) THEN\n    RAISE EXCEPTION 'BESKT_NOT_AUTHORISED: you may not read this method version.'",
    guard: GUARD,
    expect: "BCP-READ-CONTRACT",
  },
  {
    id: "BCP-NC-PARTY-BRANCH-IGNORES-CANCELLED",
    defect: "a cancelled assignment keeps its holder's read of the governed method",
    file: MIG,
    find: "         AND a.lifecycle_state <> 'cancelled'\n",
    replace: "",
    guard: GUARD,
    expect: "BCP-READ-CONTRACT",
  },
  {
    id: "BCP-NC-CANDIDATE-SAFE-IGNORES-ITEMS",
    defect: "candidate-safe stops excluding a version holding security-vetting items",
    file: MIG,
    find: "    AND NOT EXISTS (\n      SELECT 1 FROM public.beskt_items i\n       WHERE i.method_version_id = _method_version_id\n         AND (i.permitted_mode = 'security_vetting_support'\n              OR i.sensitivity_class = 'security_vetting_only'\n              OR i.access_class = 'authorised_security_function'));",
    replace: "    AND true;",
    guard: GUARD,
    expect: "BCP-SECURITY-VETTING",
  },
  {
    id: "BCP-NC-RESOLVER-FORKED",
    defect: "PR 3 forks the PR #218 routing authority instead of reusing it",
    file: MIG,
    find: "    SELECT r.sequence_position, r.item_id, r.item_key, r.section_key\n      FROM public.beskt_resolve_item_sequence(",
    replace:
      "    SELECT r.sequence_position, r.item_id, r.item_key, r.section_key\n      FROM public.bcp_resolve_item_sequence_fork(",
    guard: GUARD,
    expect: "BCP-REUSE",
  },
  {
    id: "BCP-NC-NEUTRAL-STATE-ROUTES",
    defect: "an omitted or discuss-orally answer starts firing routing rules",
    file: MIG,
    find: "   WHERE a.response_id = _response_id\n     AND a.response_state = 'answered';",
    replace: "   WHERE a.response_id = _response_id;",
    guard: GUARD,
    expect: "BCP-NEUTRAL-STATES",
  },

  // ---- The assignability gate ---------------------------------------------
  {
    id: "BCP-NC-NO-PILOT-GATE",
    defect: "the pilot grant stops being required to assign anything",
    file: MIG,
    find: "  IF NOT public.bcp_pilot_grant_active(_ja.employer_id, _method_version_id) THEN\n    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this employer holds no live grant for this BESKT method version.'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE_unused';\n  END IF;",
    guard: GUARD,
    expect: "BCP-GATE",
  },
  {
    id: "BCP-NC-UNPUBLISHED-ASSIGNABLE",
    defect: "a draft, suspended or retired version becomes assignable",
    file: MIG,
    find: "  IF _v.content_status <> 'published' THEN\n    RAISE EXCEPTION 'BCP_METHOD_NOT_PUBLISHED: this method version is \"%\"; only a published version may be assigned.', _v.content_status\n      USING ERRCODE = 'check_violation';\n  END IF;",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BCP_METHOD_NOT_PUBLISHED_unused';\n  END IF;",
    guard: GUARD,
    expect: "BCP-GATE",
  },
  {
    id: "BCP-NC-HASH-NOT-PINNED",
    defect: "the caller's expected content hash stops being checked",
    file: MIG,
    find: "  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN\n    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',",
    replace:
      "  IF false THEN\n    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',",
    guard: GUARD,
    expect: "BCP-GATE",
  },
  {
    id: "BCP-NC-PLATFORM-ADMIN-NOT-REQUIRED",
    defect: "any signed-in user can admit an employer to the pilot",
    file: MIG,
    find: "  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN\n    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may admit an employer to BESKT candidate preparation.'",
    replace:
      "  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may admit an employer to BESKT candidate preparation.'",
    guard: GUARD,
    expect: "BCP-GATE",
  },

  // ---- The notice ----------------------------------------------------------
  {
    id: "BCP-NC-NOTICE-SECTION-DROPPED",
    defect: "the notice stops telling the candidate they may omit questions",
    file: MIG,
    find: "    'may_omit_questions',      -- individual questions may be left out\n",
    replace: "",
    guard: GUARD,
    expect: "BCP-NOTICE",
  },
  {
    id: "BCP-NC-NOTICE-HASH-UNCHECKED",
    defect: "a client may acknowledge a notice it invented",
    file: MIG,
    find: "  IF _notice_content_hash IS DISTINCT FROM _expected THEN\n    RAISE EXCEPTION 'BCP_NOTICE_HASH_MISMATCH: the notice you acknowledged is not the notice this preparation carries. Reload and read it again.'\n      USING ERRCODE = 'check_violation';\n  END IF;",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BCP_NOTICE_HASH_MISMATCH_unused';\n  END IF;",
    guard: GUARD,
    expect: "BCP-NOTICE",
  },
  {
    id: "BCP-NC-ACK-BECOMES-CONSENT",
    defect: "the acknowledgement is allowed to record itself as consent",
    file: MIG,
    find: "  acknowledgement_kind text NOT NULL DEFAULT 'information_received'\n    CHECK (acknowledgement_kind = 'information_received'),\n  acknowledged_at timestamptz NOT NULL DEFAULT now(),",
    replace:
      "  acknowledgement_kind text NOT NULL DEFAULT 'information_received'\n    CHECK (acknowledgement_kind IN ('information_received', 'consent')),\n  acknowledged_at timestamptz NOT NULL DEFAULT now(),",
    guard: GUARD,
    expect: "BCP-NOTICE",
  },
  {
    id: "BCP-NC-ANSWER-BEFORE-NOTICE",
    defect: "questions can be answered before the notice is acknowledged",
    file: MIG,
    find: "  IF _a.acknowledged_at IS NULL THEN\n    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the candidate notice must be read and acknowledged before any question is answered.'\n      USING ERRCODE = 'check_violation';\n  END IF;",
    replace:
      "  IF false THEN\n    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED_unused';\n  END IF;",
    guard: GUARD,
    expect: "BCP-NOTICE",
  },

  // ---- Submission and the employer boundary --------------------------------
  {
    id: "BCP-NC-STALE-HIDDEN-ANSWER-SUBMITTED",
    defect: "an answer the final routing no longer shows is submitted anyway",
    file: MIG,
    find: "  WITH gone AS (\n    DELETE FROM public.bcp_answers a\n     WHERE a.response_id = _r.id AND NOT (a.item_id = ANY (_visible))\n    RETURNING 1)\n  SELECT count(*) INTO _stale FROM gone;",
    replace: "  _stale := 0;",
    guard: GUARD,
    expect: "BCP-SUBMIT",
  },
  {
    id: "BCP-NC-INCOMPLETE-SUBMIT-ALLOWED",
    defect: "a preparation can be submitted with shown questions unaddressed",
    file: MIG,
    find: "    RAISE EXCEPTION 'BCP_INCOMPLETE: every question shown must be answered, skipped or marked for oral discussion first; outstanding: %.',\n      array_to_string(_missing, ', ') USING ERRCODE = 'check_violation';",
    replace: "    NULL;",
    guard: GUARD,
    expect: "BCP-SUBMIT",
  },
  {
    id: "BCP-NC-DRAFT-READABLE-BY-EMPLOYER",
    defect: "the employer readback stops requiring a SUBMITTED response",
    file: MIG,
    find: "  SELECT * INTO _r FROM public.bcp_responses\n   WHERE assignment_id = _assignment_id AND response_state = 'submitted'\n   ORDER BY response_version DESC LIMIT 1;",
    replace:
      "  SELECT * INTO _r FROM public.bcp_responses\n   WHERE assignment_id = _assignment_id\n   ORDER BY response_version DESC LIMIT 1;",
    guard: GUARD,
    expect: "BCP-DRAFT-PRIVACY",
  },
  {
    id: "BCP-NC-APPLICATION-STATUS-WRITTEN",
    defect: "submitting a preparation starts moving the job application's status",
    file: MIG,
    find: "  UPDATE public.bcp_assignments\n     SET lifecycle_state = 'submitted', submitted_at = now(), revision = revision + 1\n   WHERE id = _assignment_id;",
    replace:
      "  UPDATE public.bcp_assignments\n     SET lifecycle_state = 'submitted', submitted_at = now(), revision = revision + 1\n   WHERE id = _assignment_id;\n  UPDATE public.job_applications SET status = 'interview' WHERE id = _a.application_id;",
    guard: GUARD,
    expect: "BCP-BOUNDARY",
  },

  // ---- Rollback ------------------------------------------------------------
  {
    id: "BCP-NC-ROLLBACK-CASCADE",
    defect: "the rollback drops a table with CASCADE",
    file: RB,
    find: "DROP TABLE IF EXISTS public.bcp_answers;",
    replace: "DROP TABLE IF EXISTS public.bcp_answers CASCADE;",
    guard: GUARD,
    expect: "BCP-ROLLBACK",
  },
  {
    id: "BCP-NC-ROLLBACK-PARENT-FIRST",
    defect: "the rollback drops the parent before its children",
    file: RB,
    find: "DROP TABLE IF EXISTS public.bcp_answers;\nDROP TABLE IF EXISTS public.bcp_events;\nDROP TABLE IF EXISTS public.bcp_notice_acknowledgements;\nDROP TABLE IF EXISTS public.bcp_responses;\nDROP TABLE IF EXISTS public.bcp_assignments;",
    replace:
      "DROP TABLE IF EXISTS public.bcp_assignments;\nDROP TABLE IF EXISTS public.bcp_answers;\nDROP TABLE IF EXISTS public.bcp_events;\nDROP TABLE IF EXISTS public.bcp_notice_acknowledgements;\nDROP TABLE IF EXISTS public.bcp_responses;",
    guard: GUARD,
    expect: "BCP-ROLLBACK",
  },
  {
    id: "BCP-NC-ROLLBACK-PARAPHRASES-PR2",
    defect: "the rollback restores a PR #218 contract from memory instead of verbatim",
    file: RB,
    find: "    -- Explicit internal QA: published recruitment-support content only, and\n    -- only when every governed row of it lies within the classes an internal\n    -- tester may read. A document is never returned in part.",
    replace: "    -- Explicit internal QA.",
    guard: GUARD,
    expect: "BCP-ROLLBACK",
  },
  {
    id: "BCP-NC-ROLLBACK-DESTROYS-SUBMITTED",
    defect: "the rollback stops refusing to destroy a submitted candidate basis",
    file: RB,
    find: "    SELECT count(*) INTO _n FROM public.bcp_responses r WHERE r.response_state = 'submitted';",
    replace: "    SELECT 0 INTO _n;",
    guard: GUARD,
    expect: "BCP-ROLLBACK",
  },
  {
    id: "BCP-NC-ROLLBACK-NO-DEPENDENCY-CHECK",
    defect: "the rollback stops refusing an outside foreign key into the domain",
    file: RB,
    find: "  IF _n > 0 THEN\n    RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: % outside table(s) hold a foreign key into the domain (%).', _n, _what;\n  END IF;",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'unused';\n  END IF;",
    guard: GUARD,
    expect: "BCP-ROLLBACK",
  },

  // ---- Harness -------------------------------------------------------------
  {
    id: "BCP-NC-SUITE-FLOOR-LOWERED",
    defect: "the behaviour-suite assertion floor is lowered so a shrinking suite passes",
    file: DB,
    find: 'if [ "$BCP_PASSED" -lt 195 ]; then',
    replace: 'if [ "$BCP_PASSED" -lt 1 ]; then',
    guard: GUARD,
    expect: "BCP-HARNESS",
  },
  {
    id: "BCP-NC-SUITE-NOT-RUN",
    defect: "db-test.sh stops running the PR 3 behaviour suite",
    file: DB,
    find: '  -f supabase/tests/bcp_candidate_preparation_test.sql 2>&1)"',
    replace: '  -f supabase/tests/beskt_governed_content_test.sql 2>&1)"',
    guard: GUARD,
    expect: "BCP-HARNESS",
  },
  {
    id: "BCP-NC-ORDERING-NOT-PROVED",
    defect: "the suite stops asserting WHY PR 3 must be unwound before PR 2",
    file: "supabase/tests/bcp_candidate_preparation_test.sql",
    find: "'C11.3 an assignment pins a governed method version by foreign key, which is why PR 2 cannot unwind first'",
    replace: "'C11.3 an assignment exists'",
    guard: GUARD,
    expect: "BCP-HARNESS",
  },
  {
    id: "BCP-NC-DOCUMENTED-ROLLBACK-ORDER",
    defect: "the documented rollback procedure stops unwinding PR 3 first",
    file: RB_SUITE,
    find: "  RAISE NOTICE 'ROLLBACK TEST -- BESKT PR 3 unwinds first of all';",
    replace: "  RAISE NOTICE 'ROLLBACK TEST -- BESKT PR 3 unwinds at some point';",
    guard: GUARD,
    expect: "BCP-HARNESS",
  },

  // ---- Release bookkeeping -------------------------------------------------
  {
    id: "BCP-NC-CLAIMED-APPLIED",
    defect: "the PR 3 migration is claimed to be applied on the hosted database",
    file: STATE,
    find: '"file": "20261110090000_bcp_candidate_preparation.sql",\n        "hostedState": "pending"',
    replace:
      '"file": "20261110090000_bcp_candidate_preparation.sql",\n        "hostedState": "applied"',
    guard: GUARD,
    expect: "BCP-RELEASE",
  },

  {
    id: "BCP-NC-FRONTIER-UNDECLARED",
    defect: "the pending migration is dropped from the owner-level frontier list",
    file: "scripts/release-frontier-check.ts",
    find: '  "20261110090000_bcp_candidate_preparation.sql",\n',
    replace: "",
    guard: GUARD,
    expect: "BCP-RELEASE",
  },

  // ---- The application surface ---------------------------------------------
  {
    id: "BCP-NC-ENGLISH-COPY-MISSING",
    defect: "an English notice string is dropped, leaving a Swedish-only screen",
    file: DICT,
    find: '    "beskt.notice.may_omit_questions.title": "You may skip questions",\n',
    replace: "",
    guard: GUARD,
    expect: "BCP-UI",
  },
  {
    id: "BCP-NC-CALLED-A-TEST",
    defect: "the method is described to an employer as a personality test",
    file: DICT,
    find: '    "beskt.library.siblingNote":\n      "Ett eget produktområde, skilt från Testbibliotekets bedömningar ovan.",',
    replace: '    "beskt.library.siblingNote": "Ett personlighetstest för rekrytering.",',
    guard: GUARD,
    expect: "BCP-UI",
  },
  {
    id: "BCP-NC-SCORING-CLAIM",
    defect: "the copy starts asserting a score instead of denying one",
    file: DICT,
    find: '    "beskt.library.notAssessment": "Inget resultat, ingen poäng, ingen rangordning",',
    replace: '    "beskt.library.notAssessment": "Resultatet ger poäng och rangordning",',
    guard: GUARD,
    expect: "BCP-NO-SCORE",
  },
  {
    id: "BCP-NC-NO-EMPTY-STATE",
    defect: "the library section drops its honest under-development state",
    file: LIBRARY,
    find: '              <Badge variant="secondary">{t("beskt.library.underDevelopment")}</Badge>',
    replace: '              <Badge variant="secondary">{"\\u00a0"}</Badge>',
    guard: GUARD,
    expect: "BCP-UI",
  },
  {
    id: "BCP-NC-DRAFT-RENDERED",
    defect: "the employer panel stops distinguishing an absent draft from an empty one",
    file: PANEL,
    find: "              ) : detail.data.answers === null ? (",
    replace: "              ) : detail.data.answers?.length === 0 ? (",
    guard: GUARD,
    expect: "BCP-UI",
  },
  {
    id: "BCP-NC-ORAL-CONTROL-REMOVED",
    defect: "the candidate loses the option to take a question orally",
    file: CANDIDATE,
    find: '            {t("beskt.answer.oral")}',
    replace: '            {t("beskt.answer.skip")}',
    guard: GUARD,
    expect: "BCP-UI",
  },
  {
    id: "BCP-NC-RISK-COLOUR",
    defect: "an omission is painted as a warning",
    file: CANDIDATE,
    find: '            <Badge variant="outline" className="gap-1.5 font-normal">\n              {draft.state === "omitted" ? (',
    replace:
      '            <Badge variant="outline" className="gap-1.5 font-normal bg-red-100 text-red-700">\n              {draft.state === "omitted" ? (',
    guard: GUARD,
    expect: "BCP-UI",
  },
  {
    id: "BCP-NC-NO-ERROR-SUMMARY",
    defect: "the error summary stops being announced",
    file: CANDIDATE,
    find: '              role="alert"\n              className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4"',
    replace:
      '              className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4"',
    guard: GUARD,
    expect: "BCP-UI",
  },
  {
    id: "BCP-NC-DIRECT-TABLE-WRITE",
    defect: "the application layer starts writing the runtime tables directly",
    file: FUNCTIONS,
    find: '    const { data: row, error } = await context.supabase.rpc("bcp_cancel", {',
    replace:
      '    const { data: row, error } = await context.supabase.from("bcp_assignments").update({\n      lifecycle_state: "cancelled",\n    }).eq("id", data.assignmentId).select().single().then((r) => r) as never;\n    const _unused = await context.supabase.rpc("bcp_cancel", {',
    guard: GUARD,
    expect: "BCP-SECURITY",
  },
  {
    id: "BCP-NC-TYPES-STALE",
    defect: "the generated types stop carrying a runtime table",
    file: TYPES,
    find: "      bcp_responses: {",
    replace: "      bcp_responses_stale: {",
    guard: GUARD,
    expect: "BCP-TYPES",
  },

  // ---- Registration --------------------------------------------------------
  {
    // Removing the script ENTRY cannot be detected by a guard that entry is
    // what runs, so this control corrupts what it is WIRED TO instead -- the
    // defect that actually ships, because a guard pointed at the wrong file
    // still looks registered.
    id: "BCP-NC-GUARD-MISWIRED",
    defect: "the PR 3 guard entry is wired to a different script",
    file: PKG,
    find: '"beskt-candidate-preparation:check": "bun run scripts/beskt-candidate-preparation-check.ts"',
    replace:
      '"beskt-candidate-preparation:check": "bun run scripts/beskt-candidate-preparation-check.ts "',
    guard: GUARD,
    expect: "BCP-REGISTRATION",
  },
  {
    id: "BCP-NC-CONTROLS-UNREGISTERED",
    defect: "the PR 3 controls stop running with every other negative control",
    file: PKG,
    find: " && bun run negative-controls:beskt-candidate-preparation",
    replace: "",
    guard: GUARD,
    expect: "BCP-REGISTRATION",
  },
  {
    id: "BCP-NC-CI-UNREGISTERED",
    defect: "CI stops running the PR 3 guard",
    file: CI,
    find: "        run: bun run beskt-candidate-preparation:check",
    replace: "        run: echo skipped",
    guard: GUARD,
    expect: "BCP-REGISTRATION",
  },
  {
    id: "BCP-NC-NOT-TYPECHECKED",
    defect: "the PR 3 guard is dropped from the scripts typecheck",
    file: TSCONFIG,
    find: '    "scripts/beskt-candidate-preparation-check.ts",\n',
    replace: "",
    guard: GUARD,
    expect: "BCP-REGISTRATION",
  },
];

runControls("beskt-candidate-preparation", MUTATIONS);
