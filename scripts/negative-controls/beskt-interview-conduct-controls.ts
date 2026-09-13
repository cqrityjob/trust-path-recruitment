/**
 * BESKT PR 5A negative controls: every material assertion of the
 * interview-conduct guard must detect a planted defect in the REAL
 * computation — the migration's function bodies, DDL, triggers, indexes,
 * policies and grants, the rollback's refusals and drop order, the harness
 * ordering and the release bookkeeping — never a comment, and never an
 * error-message string on its own.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 */
import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261113090000_bcp_interview_conduct.sql";
const RB = "supabase/rollback/20261113090000_bcp_interview_conduct_rollback.sql";
const SUITE = "supabase/tests/bcp_interview_conduct_test.sql";
const RACE = "supabase/tests/bcp_conduct_race_fixture.sql";
const DB = "scripts/db-test.sh";
const RB_SUITE = "supabase/tests/scp_a_rollback_test.sql";
const STATE = "supabase/release-state.json";
const PKG = "package.json";
const TSCONFIG = "tsconfig.scripts.json";
const CI = ".github/workflows/ci.yml";
const FRONTIER = "scripts/release-frontier-check.ts";
const GUARD = "beskt-interview-conduct:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- No parallel system ---------------------------------------------------
  {
    id: "CND-NC-PARALLEL-CASE",
    defect: "PR 5A opens a case store of its own instead of using the one that exists",
    file: MIG,
    find: "CREATE TABLE public.bcp_conduct_positions (",
    replace:
      "CREATE TABLE public.bcp_conduct_interview_cases (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid()\n);\n\nCREATE TABLE public.bcp_conduct_positions (",
    guard: GUARD,
    expect: "CONDUCT-NO-PARALLEL",
  },
  {
    id: "CND-NC-ADVANCES-THE-CASE",
    defect:
      "the conduct layer starts mutating the interview case it is only supposed to work within",
    file: MIG,
    find: "  INSERT INTO public.bcp_conduct_sessions\n    (link_id, case_id, employer_id, assignment_id,",
    replace:
      "  UPDATE public.scp_interview_cases SET status = 'in_progress' WHERE id = _l.case_id;\n  INSERT INTO public.bcp_conduct_sessions\n    (link_id, case_id, employer_id, assignment_id,",
    guard: GUARD,
    expect: "CONDUCT-REUSE",
  },
  {
    id: "CND-NC-SECOND-LEDGER",
    defect: "the conduct layer stops writing to PR 3's ledger and keeps its own events instead",
    file: MIG,
    find: "  PERFORM public.bcp_record_event(\n    _l.assignment_id, _l.bound_response_id, _l.employer_id, _l.bound_method_version_id,\n    'conduct_session_started',",
    replace:
      "  PERFORM public.bcp_record_event_disabled(\n    _l.assignment_id, _l.bound_response_id, _l.employer_id, _l.bound_method_version_id,\n    'conduct_session_started',",
    guard: GUARD,
    expect: "CONDUCT-REUSE",
  },

  // ---- The information model ------------------------------------------------
  {
    id: "CND-NC-MODEL-COLLAPSED",
    defect:
      "the alternative explanation loses its own column, so a counter-explanation can only be filed inside another field",
    file: MIG,
    find: "  alternative_explanation text,  -- another reading, or what contradicts the first",
    replace: "",
    guard: GUARD,
    expect: "CONDUCT-MODEL",
  },
  {
    id: "CND-NC-PROTECTIVE-FACTOR-GONE",
    defect: "there is nowhere to record what speaks in the candidate's favour",
    file: MIG,
    find: "  protective_factor text,        -- what speaks in the candidate's favour",
    replace: "",
    guard: GUARD,
    expect: "CONDUCT-MODEL",
  },
  {
    id: "CND-NC-JSONB-BLOB",
    defect:
      "a free-form jsonb appears on the entry, so the method's distinctions can quietly collapse back into one blob",
    file: MIG,
    find: "  sensitivity_class text NOT NULL DEFAULT 'ordinary'",
    replace: "  extra jsonb,\n  sensitivity_class text NOT NULL DEFAULT 'ordinary'",
    guard: GUARD,
    expect: "CONDUCT-MODEL",
  },
  {
    id: "CND-NC-EMPTY-ENTRY-ALLOWED",
    defect: "an entry that records nothing at all becomes storable",
    file: MIG,
    find: "  CONSTRAINT bcp_conduct_entries_not_empty CHECK (",
    replace: "  CONSTRAINT bcp_conduct_entries_anything_goes CHECK (true OR",
    guard: GUARD,
    expect: "CONDUCT-MODEL",
  },
  {
    id: "CND-NC-VERIFICATION-FREE-TEXT",
    defect: "the verification state stops being a governed vocabulary and becomes free text",
    file: MIG,
    find: "  verification_state text NOT NULL DEFAULT 'not_required'\n    CHECK (verification_state IN (\n      'not_required', 'requested', 'in_progress',\n      'verified', 'not_verified', 'inconclusive')),",
    replace: "  verification_state text NOT NULL DEFAULT 'not_required',",
    guard: GUARD,
    expect: "CONDUCT-MODEL",
  },

  // ---- Nowhere to put a judgement -------------------------------------------
  {
    id: "CND-NC-SCORE-COLUMN",
    defect: "a score appears on the position, which is the whole thing BESKT forbids",
    file: MIG,
    find: "  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'locked')),\n  locked_at timestamptz,",
    replace:
      "  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'locked')),\n  total_score integer,\n  locked_at timestamptz,",
    guard: GUARD,
    expect: "CONDUCT-NO-JUDGEMENT",
  },
  {
    id: "CND-NC-RISK-COLUMN",
    defect: "a risk reading appears on the entry",
    file: MIG,
    find: "  verification_need text,\n  verification_state text NOT NULL DEFAULT 'not_required'",
    replace:
      "  verification_need text,\n  risk_note text,\n  verification_state text NOT NULL DEFAULT 'not_required'",
    guard: GUARD,
    expect: "CONDUCT-NO-JUDGEMENT",
  },
  {
    id: "CND-NC-THIRD-RESOLUTION",
    defect:
      "the panel gains an averaging outcome, so a disagreement can be collapsed into a middle position",
    file: MIG,
    find: "  resolution_kind text NOT NULL CHECK (resolution_kind IN ('agreed', 'disagreed')),",
    replace:
      "  resolution_kind text NOT NULL CHECK (resolution_kind IN ('agreed', 'disagreed', 'averaged')),",
    guard: GUARD,
    expect: "CONDUCT-NO-JUDGEMENT",
  },
  {
    id: "CND-NC-EMPTY-DISAGREEMENT",
    defect:
      "a disagreement can be recorded without saying what the parties differ on, leaving only a rumour that there was one",
    file: MIG,
    find: "  IF _resolution_kind = 'disagreed' AND length(btrim(coalesce(_divergent_statement, ''))) = 0 THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "CONDUCT-DISAGREEMENT",
  },
  {
    id: "CND-NC-WORKSPACE-CLAIMS-SCORE",
    defect: "the workspace starts claiming to produce a score",
    file: MIG,
    find: "    'produces_score', false,\n    'produces_ranking', false,",
    replace: "    'produces_score', true,\n    'produces_ranking', false,",
    guard: GUARD,
    expect: "CONDUCT-NO-JUDGEMENT",
  },

  // ---- Independence ---------------------------------------------------------
  {
    id: "CND-NC-SEE-BEFORE-OWN-LOCK",
    defect:
      "THE CORE DEFECT: an assessor can read the others' positions before locking their own, so they can anchor on someone else's view",
    file: MIG,
    find: "     AND EXISTS (SELECT 1 FROM public.bcp_conduct_positions me\n                  WHERE me.session_id = _session_id\n                    AND me.assessor_id = auth.uid()\n                    AND me.state = 'locked')",
    replace:
      "     AND EXISTS (SELECT 1 FROM public.bcp_conduct_positions me\n                  WHERE me.session_id = _session_id\n                    AND me.assessor_id = auth.uid())",
    guard: GUARD,
    expect: "CONDUCT-INDEPENDENCE",
  },
  {
    id: "CND-NC-REVEAL-WHILE-OPEN",
    defect:
      "positions become visible while somebody is still working, so the last person sees everyone else's before finishing",
    file: MIG,
    find: "       OR NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions o\n                       WHERE o.session_id = _session_id AND o.state <> 'locked')",
    replace: "       OR true",
    guard: GUARD,
    expect: "CONDUCT-INDEPENDENCE",
  },
  {
    id: "CND-NC-POLICY-DROPS-THE-RULE",
    defect:
      "the entries policy stops asking the visibility question, so the rule survives only in the read model a screen could bypass",
    file: MIG,
    find: "      EXISTS (SELECT 1 FROM public.bcp_conduct_positions p\n               WHERE p.id = position_id AND p.assessor_id = auth.uid())\n      OR public.bcp_conduct_may_see_others(session_id)",
    replace:
      "      EXISTS (SELECT 1 FROM public.bcp_conduct_positions p\n               WHERE p.id = position_id AND p.assessor_id = auth.uid())\n      OR public.bcp_conduct_can_read_session(session_id)",
    guard: GUARD,
    expect: "CONDUCT-INDEPENDENCE",
  },
  {
    id: "CND-NC-REOPEN-AFTER-REVEAL",
    defect:
      "a position can be reopened after the panel has read it, so a recorded view can be revised in the light of other people's",
    file: MIG,
    find: "  IF EXISTS (SELECT 1 FROM public.bcp_conduct_panels p\n              WHERE p.session_id = _p.session_id AND p.state IN ('revealed', 'concluded')) THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "CONDUCT-INDEPENDENCE",
  },
  {
    id: "CND-NC-REVEAL-GUARD-REMOVED",
    defect:
      "the reveal-after-everyone-locks rule leaves the row trigger, so it no longer holds against the table owner",
    file: MIG,
    find: "      IF EXISTS (SELECT 1 FROM public.bcp_conduct_positions p\n                  WHERE p.session_id = NEW.session_id AND p.state <> 'locked') THEN",
    replace: "      IF false THEN",
    guard: GUARD,
    expect: "CONDUCT-INDEPENDENCE",
  },
  {
    id: "CND-NC-RECORD-INTO-ANOTHERS-POSITION",
    defect: "one assessor can record into another's position",
    file: MIG,
    // Two RPCs carry this check in the same words, so the anchor runs on into
    // the line only the save path has after it.
    find: "  -- YOUR OWN POSITION ONLY. Recording into someone else's is exactly the\n  -- contamination the independence rule exists to prevent.\n  IF _p.assessor_id <> _caller THEN",
    replace:
      "  -- YOUR OWN POSITION ONLY. Recording into someone else's is exactly the\n  -- contamination the independence rule exists to prevent.\n  IF false THEN",
    guard: GUARD,
    expect: "CONDUCT-INDEPENDENCE",
  },

  // ---- Append-only and correction -------------------------------------------
  {
    id: "CND-NC-ENTRY-EDITABLE",
    defect:
      "what an entry says becomes editable in place, so a record can change with no trace that it did",
    file: MIG,
    find: "       OR NEW.observable_fact IS DISTINCT FROM OLD.observable_fact\n",
    replace: "",
    guard: GUARD,
    expect: "CONDUCT-APPEND-ONLY",
  },
  {
    id: "CND-NC-ENTRY-DELETABLE",
    defect: "an entry can be deleted, so a recorded statement can vanish",
    file: MIG,
    find: "  IF TG_OP = 'DELETE' THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NO_DELETE: a recorded entry is superseded, never deleted.'",
    replace:
      "  IF false THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NO_DELETE: a recorded entry is superseded, never deleted.'",
    guard: GUARD,
    expect: "CONDUCT-APPEND-ONLY",
  },
  {
    id: "CND-NC-VERIFICATION-WITHOUT-HISTORY",
    defect:
      "the verification state can be moved in place with no history row behind it, so the entry and the history can disagree",
    file: MIG,
    find: "      IF NOT EXISTS (\n        SELECT 1 FROM public.bcp_conduct_verifications v\n         WHERE v.entry_id = NEW.id",
    replace:
      "      IF false AND NOT EXISTS (\n        SELECT 1 FROM public.bcp_conduct_verifications v\n         WHERE v.entry_id = NEW.id",
    guard: GUARD,
    expect: "CONDUCT-APPEND-ONLY",
  },
  {
    id: "CND-NC-LIVE-ENTRY-NOT-UNIQUE",
    defect:
      "one-live-entry-per-item stops being an index, so two live records of the same question can coexist",
    file: MIG,
    find: "CREATE UNIQUE INDEX bcp_conduct_entries_one_live_per_position_item_idx",
    replace: "CREATE INDEX bcp_conduct_entries_one_live_per_position_item_idx",
    guard: GUARD,
    expect: "CONDUCT-APPEND-ONLY",
  },
  {
    id: "CND-NC-CORRECTION-NO-REASON",
    defect: "a correction stops having to say why, so the history cannot be read afterwards",
    file: MIG,
    find: "    IF length(btrim(coalesce(_correction_reason, ''))) < 3 THEN",
    replace: "    IF false THEN",
    guard: GUARD,
    expect: "CONDUCT-CORRECTION",
  },
  {
    id: "CND-NC-CORRECTION-ORDER",
    defect:
      "the successor is inserted before the predecessor vacates the live slot, which the one-live-entry index refuses -- the exact bug the behavioural suite caught",
    file: MIG,
    find: "  _new_id := gen_random_uuid();\n  IF _corrects_entry_id IS NOT NULL THEN\n    UPDATE public.bcp_conduct_entries\n       SET superseded_by_entry_id = _new_id\n     WHERE id = _corrects_entry_id;\n  END IF;\n",
    replace: "  _new_id := gen_random_uuid();\n",
    guard: GUARD,
    expect: "CONDUCT-CORRECTION",
  },
  {
    id: "CND-NC-DEFERRAL-REMOVED",
    defect:
      "the self-reference stops being deferred, so the ordering the correction path depends on becomes illegal",
    file: MIG,
    find: "    DEFERRABLE INITIALLY DEFERRED,",
    replace: "    ,",
    guard: GUARD,
    expect: "CONDUCT-CORRECTION",
  },
  {
    id: "CND-NC-VERIFICATION-HISTORY-MUTABLE",
    defect: "the verification history becomes rewritable",
    file: MIG,
    find: "CREATE TRIGGER bcp_conduct_verifications_append_only\n  BEFORE UPDATE OR DELETE ON public.bcp_conduct_verifications",
    replace:
      "CREATE TRIGGER bcp_conduct_verifications_append_only\n  BEFORE TRUNCATE ON public.bcp_conduct_verifications",
    guard: GUARD,
    expect: "CONDUCT-APPEND-ONLY",
  },

  // ---- Idempotency, revision, concurrency, authorisation --------------------
  {
    id: "CND-NC-REPLAY-AFTER-WRITE",
    defect:
      "the lock path's replay check moves after its write, so a retried request locks twice before it is recognised",
    file: MIG,
    find: "  _replay := public.bcp_operation_begin(_operation_id, _hash);\n  IF _replay IS NOT NULL THEN RETURN _replay; END IF;\n\n  -- Serialise on the position: two simultaneous lock attempts produce one lock\n  -- and one refusal, deterministically, rather than a race.\n",
    replace: "",
    guard: GUARD,
    expect: "CONDUCT-IDEMPOTENCY",
  },
  {
    id: "CND-NC-NO-ADVISORY-LOCK",
    defect:
      "the lock path stops serialising, so two simultaneous locks can tear the row instead of settling",
    file: MIG,
    find: "  PERFORM pg_advisory_xact_lock(hashtextextended(_position_id::text, 0));\n\n  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.assessor_id <> _caller THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only lock your own position.'",
    replace:
      "  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.assessor_id <> _caller THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only lock your own position.'",
    guard: GUARD,
    expect: "CONDUCT-CONCURRENCY",
  },
  {
    id: "CND-NC-LOCK-NO-CAS",
    defect: "the lock path stops refusing a stale revision",
    file: MIG,
    find: "      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',\n      _p.revision, _expected_revision USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.state = 'locked' THEN",
    replace:
      "      'BCP_REVISION_NOTE: the position is at revision % but the request expected %.',\n      _p.revision, _expected_revision USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.state = 'locked' THEN",
    guard: GUARD,
    expect: "CONDUCT-REVISION",
  },
  {
    id: "CND-NC-BYPASSES-CASE-AUTHORITY",
    defect:
      "the save path stops using the existing case authority, so a cancelled or retained case would still take new interview work",
    file: MIG,
    find: "  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;\n  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;\n\n  IF _expected_revision IS NULL THEN\n    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'\n      USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.revision <> _expected_revision THEN\n    RAISE EXCEPTION\n      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',\n      _p.revision, _expected_revision USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.state <> 'open' THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'\n      USING ERRCODE = 'check_violation';\n  END IF;\n\n  _item_key := _entry ->> 'item_key';",
    replace:
      "  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;\n\n  IF _expected_revision IS NULL THEN\n    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'\n      USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.revision <> _expected_revision THEN\n    RAISE EXCEPTION\n      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',\n      _p.revision, _expected_revision USING ERRCODE = 'check_violation';\n  END IF;\n  IF _p.state <> 'open' THEN\n    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'\n      USING ERRCODE = 'check_violation';\n  END IF;\n\n  _item_key := _entry ->> 'item_key';",
    guard: GUARD,
    expect: "CONDUCT-AUTHORISATION",
  },

  // ---- RLS, grants, PostgREST surface --------------------------------------
  {
    id: "CND-NC-FORCE-RLS",
    defect:
      "FORCE RLS is removed from the entries table, so the owner's own writes bypass the policy",
    file: MIG,
    find: "ALTER TABLE public.bcp_conduct_entries            FORCE  ROW LEVEL SECURITY;",
    replace: "ALTER TABLE public.bcp_conduct_entries            NO FORCE ROW LEVEL SECURITY;",
    guard: GUARD,
    expect: "CONDUCT-RLS",
  },
  {
    id: "CND-NC-SERVICE-ROLE-NOT-REVOKED",
    defect: "the positions table is left with service_role's default write privileges",
    file: MIG,
    find: "REVOKE ALL ON public.bcp_conduct_positions         FROM PUBLIC, anon, authenticated, service_role;",
    replace: "REVOKE ALL ON public.bcp_conduct_positions         FROM PUBLIC, anon, authenticated;",
    guard: GUARD,
    expect: "CONDUCT-GRANTS",
  },
  {
    id: "CND-NC-CLIENT-WRITE-GRANT",
    defect: "a client role is granted INSERT on the entries table",
    file: MIG,
    find: "GRANT SELECT ON public.bcp_conduct_entries           TO authenticated, service_role;",
    replace:
      "GRANT SELECT ON public.bcp_conduct_entries           TO authenticated, service_role;\nGRANT INSERT ON public.bcp_conduct_entries TO authenticated;",
    guard: GUARD,
    expect: "CONDUCT-GRANTS",
  },
  {
    id: "CND-NC-UNCONDITIONAL-POLICY",
    defect:
      "the sessions policy becomes unconditional, so every signed-in user reads every session",
    file: MIG,
    find: "CREATE POLICY bcp_conduct_sessions_member_read ON public.bcp_conduct_sessions\n  FOR SELECT TO authenticated\n  USING (public.scp_iv_can_read_case(case_id));",
    replace:
      "CREATE POLICY bcp_conduct_sessions_member_read ON public.bcp_conduct_sessions\n  FOR SELECT TO authenticated\n  USING (true OR public.scp_iv_can_read_case(case_id));",
    guard: GUARD,
    expect: "CONDUCT-RLS",
  },
  {
    id: "CND-NC-TRIGGER-FN-PUBLISHED",
    defect:
      "the entry guard keeps its default PUBLIC EXECUTE, so PostgREST publishes an invariant-checker as a callable API",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_guard_conduct_entry()\n  FROM PUBLIC, anon, authenticated, service_role;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_guard_conduct_entry() FROM anon;",
    guard: GUARD,
    expect: "CONDUCT-SURFACE",
  },
  {
    id: "CND-NC-SEARCH-PATH-UNPINNED",
    defect: "a SECURITY DEFINER RPC loses its pinned search_path",
    file: MIG,
    find: "CREATE OR REPLACE FUNCTION public.bcp_conduct_workspace(_session_id uuid)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public",
    replace:
      "CREATE OR REPLACE FUNCTION public.bcp_conduct_workspace(_session_id uuid)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER",
    guard: GUARD,
    expect: "CONDUCT-SURFACE",
  },
  {
    id: "CND-NC-ANON-GRANTED",
    defect: "anon is left able to execute the workspace read model",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_conduct_workspace(uuid) FROM PUBLIC, anon;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_conduct_workspace(uuid) FROM PUBLIC;",
    guard: GUARD,
    expect: "CONDUCT-SURFACE",
  },

  // ---- Vocabulary and audit -------------------------------------------------
  {
    id: "CND-NC-VOCABULARY-NARROWED",
    defect: "the rebuilt event CHECK silently drops a PR 4 member, breaking PR 4's own writes",
    file: MIG,
    find: "    'case_linked', 'case_unlinked',\n    -- PR 5A",
    replace: "    'case_linked',\n    -- PR 5A",
    guard: GUARD,
    expect: "CONDUCT-VOCABULARY",
  },
  {
    id: "CND-NC-AUDIT-EVENT-MISSING",
    defect:
      "reopening a position stops being an auditable event, so how a locked record came to change cannot be explained",
    file: MIG,
    find: "    'conduct_position_locked', 'conduct_position_reopened',",
    replace: "    'conduct_position_locked',",
    guard: GUARD,
    expect: "CONDUCT-AUDIT",
  },

  // ---- Preflight and postflight --------------------------------------------
  {
    id: "CND-NC-NO-PREFLIGHT",
    defect:
      "the migration stops refusing early when PR 3 or PR 4 is absent, so it fails obscurely instead of by name",
    file: MIG,
    find: "    RAISE EXCEPTION 'BCP_CONDUCT_PREFLIGHT: required table(s) missing: %. '",
    replace: "    RAISE NOTICE 'note: required table(s) missing: %. '",
    guard: GUARD,
    expect: "CONDUCT-PREFLIGHT",
  },
  {
    id: "CND-NC-POSTFLIGHT-TRUSTS-ITSELF",
    defect:
      "the postflight stops reading real privileges from the catalogue and merely restates the GRANTs above it",
    file: MIG,
    find: "      IF has_table_privilege('authenticated', 'public.' || _t, _fn)",
    replace:
      "      IF false AND has_table_privilege_disabled('authenticated', 'public.' || _t, _fn)",
    guard: GUARD,
    expect: "CONDUCT-POSTFLIGHT",
  },
  {
    id: "CND-NC-SEEDS-SOMETHING",
    defect: "the migration stops proving that it seeded nothing",
    file: MIG,
    find: "'BCP_CONDUCT_PROOF: the migration created % session(s); it must seed none.', _n;",
    replace: "'BCP_CONDUCT_PROOF: session count is %.', _n;",
    guard: GUARD,
    expect: "CONDUCT-POSTFLIGHT",
  },

  // ---- Rollback -------------------------------------------------------------
  {
    id: "CND-NC-ROLLBACK-DISCARDS-INTERVIEWS",
    defect:
      "the rollback stops refusing while conduct sessions exist, so it would silently destroy the record of real interviews about named people",
    file: RB,
    find: "  SELECT count(*) INTO _n FROM public.bcp_conduct_sessions;",
    replace: "  SELECT 0 INTO _n;",
    guard: GUARD,
    expect: "CONDUCT-ROLLBACK",
  },
  {
    id: "CND-NC-ROLLBACK-NARROWS-OVER-HISTORY",
    defect:
      "the rollback narrows the event vocabulary unconditionally, so once a single conduct event exists it can never run again -- an append-only ledger cannot be cleared to make the constraint fit",
    file: RB,
    find: "  SELECT count(*) INTO _n FROM public.bcp_events WHERE event LIKE 'conduct\\_%';\n  IF _n = 0 THEN",
    replace:
      "  SELECT count(*) INTO _n FROM public.bcp_events WHERE event LIKE 'conduct\\_%';\n  IF true THEN",
    guard: GUARD,
    expect: "CONDUCT-ROLLBACK",
  },
  {
    id: "CND-NC-ROLLBACK-SILENT-OVER-HISTORY",
    defect:
      "the rollback stops saying that it left the vocabulary wide, so an operator cannot tell the difference between a full restore and a partial one",
    file: RB,
    find: "      'vocabulary keeps admitting them. Nothing can write them any more -- the conduct RPCs are '",
    replace:
      "      'vocabulary was handled. Nothing can write them any more -- the conduct RPCs are '",
    guard: GUARD,
    expect: "CONDUCT-ROLLBACK",
  },
  {
    id: "CND-NC-ROLLBACK-CASCADE",
    defect: "the rollback drops with CASCADE, taking whatever else depends on it without saying so",
    file: RB,
    find: "DROP TABLE IF EXISTS public.bcp_conduct_sessions;",
    replace: "DROP TABLE IF EXISTS public.bcp_conduct_sessions CASCADE;",
    guard: GUARD,
    expect: "CONDUCT-ROLLBACK",
  },
  {
    id: "CND-NC-ROLLBACK-DROP-ORDER",
    defect: "the rollback drops a parent before its child",
    file: RB,
    find: "DROP TABLE IF EXISTS public.bcp_conduct_panel_resolutions;\nDROP TABLE IF EXISTS public.bcp_conduct_panels;",
    replace:
      "DROP TABLE IF EXISTS public.bcp_conduct_panels;\nDROP TABLE IF EXISTS public.bcp_conduct_panel_resolutions;",
    guard: GUARD,
    expect: "CONDUCT-ROLLBACK",
  },
  {
    id: "CND-NC-ROLLBACK-MISSES-A-FUNCTION",
    defect:
      "a function the migration creates is not dropped by the rollback, so it survives an unwind that claims nothing of PR 5A does",
    file: RB,
    find: "DROP FUNCTION IF EXISTS public.bcp_conduct_reveal_panel(uuid, uuid, integer);\n",
    replace: "",
    guard: GUARD,
    expect: "CONDUCT-ROLLBACK",
  },
  {
    id: "CND-NC-ROLLBACK-TAKES-PR4",
    defect:
      "the rollback stops proving it left PR 4 standing, so unwinding PR 5A could quietly take PR 4's tables with it",
    file: RB,
    find: "    RAISE EXCEPTION 'BCP_CONDUCT_ROLLBACK: PR 4''s tables were dropped; this rollback unwinds PR 5A only.';",
    replace: "    RAISE NOTICE 'note: PR 4 tables absent.';",
    guard: GUARD,
    expect: "CONDUCT-ROLLBACK",
  },

  // ---- Registration ---------------------------------------------------------
  {
    id: "CND-NC-SUITE-NOT-RUN",
    defect: "the behaviour suite stops running in the database harness",
    file: DB,
    find: '  -f supabase/tests/bcp_interview_conduct_test.sql 2>&1)"',
    replace: "  -c 'SELECT 1' 2>&1)\"",
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-SUITE-FLOOR-REMOVED",
    defect:
      "the assertion floor is lowered to nothing, so a suite that stopped asserting would pass",
    file: DB,
    find: 'if [ "$CND_PASSED" -lt 90 ]; then',
    replace: 'if [ "$CND_PASSED" -lt 0 ]; then',
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-RACE-NOT-RUN",
    defect: "the two-connection lock race stops running, so nothing proves the concurrency claim",
    file: DB,
    find: "\\i supabase/tests/bcp_conduct_race_fixture.sql",
    replace: "SELECT 1;",
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-REFUSAL-NOT-PROVED",
    defect:
      "the harness stops proving that the rollback REFUSES to discard a recorded interview, and tests only the success path",
    file: DB,
    find: '  echo "    ok  the rollback REFUSES to discard a recorded interview, and says so by name"',
    replace: '  echo "    ok  rollback checked"',
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-STOOD-DOWN-TOO-LATE",
    defect:
      "PR 5A is stood down after PR 4's rollback runs, so the replay would break on the conduct layer's foreign keys -- the exact bug the guard caught",
    file: DB,
    find: "# Stand PR 5A down so PR 4 can be unwound below: bcp_conduct_sessions holds",
    replace: "# Stand PR 5A down eventually: bcp_conduct_sessions holds",
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-DOCUMENTED-UNWIND-ORDER",
    defect:
      "the documented full-unwind drops PR 4's tables before the conduct layer that points into them",
    file: RB_SUITE,
    find: "DROP TABLE IF EXISTS public.bcp_conduct_sessions;\nDROP FUNCTION IF EXISTS public.bcp_conduct_can_read_session(uuid);",
    replace: "DROP FUNCTION IF EXISTS public.bcp_conduct_can_read_session(uuid);",
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-CLAIMED-PENDING",
    defect:
      "the applied migration is walked back to pending, so the repository stops recording a hosted apply that really happened",
    file: STATE,
    find: '"file": "20261113090000_bcp_interview_conduct.sql",\n      "hostedState": "applied",',
    replace: '"file": "20261113090000_bcp_interview_conduct.sql",\n      "hostedState": "pending",',
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-APPLIED-WITHOUT-EVIDENCE",
    defect:
      "the applied entry keeps its status but loses the evidence naming the hosted version and project, leaving an owner-level claim about production with nothing behind it",
    file: STATE,
    // Several entries open their evidence with the same phrase, so the anchor
    // runs on into the clause only this one has -- and it renames the KEY,
    // because softening the prose would leave an evidenceSource in place.
    find: '"evidenceSource": "Applied to owner production wrygicdfxwjnrugduxnt through the official Supabase GitHub integration when PR #233 merged',
    replace:
      '"evidenceSourceRemoved": "Applied to owner production wrygicdfxwjnrugduxnt through the official Supabase GitHub integration when PR #233 merged',
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-FRONTIER-STALE-PENDING",
    defect:
      "the applied migration is put back on the owner-level frontier list, where a resolved name hides the next genuinely stuck migration behind an expectation",
    file: FRONTIER,
    find: "const expectedPending: string[] = [];",
    replace:
      'const expectedPending: string[] = [\n  "20261113090000_bcp_interview_conduct.sql",\n];',
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-CONTROLS-NOT-IN-ALL",
    defect: "these very controls are dropped from negative-controls:all",
    file: PKG,
    find: "bun run negative-controls:beskt-interview-conduct && ",
    replace: "",
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-GUARD-NOT-IN-CI",
    defect: "the guard stops running in CI",
    file: CI,
    find: "        run: bun run beskt-interview-conduct:check",
    replace: "        run: true",
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },
  {
    id: "CND-NC-GUARD-NOT-TYPECHECKED",
    defect: "the guard leaves the typecheck net, which is how a guard silently stops enforcing",
    file: TSCONFIG,
    find: '    "scripts/beskt-interview-conduct-check.ts",\n',
    replace: "",
    guard: GUARD,
    expect: "CONDUCT-REGISTRATION",
  },

  // ---- The suite proves rather than reports --------------------------------
  {
    id: "CND-NC-SUITE-SEEDS-THE-DATABASE",
    defect: "the suite stops rolling back, so every run leaves synthetic interview material behind",
    file: SUITE,
    find: "\nROLLBACK;",
    replace: "\nCOMMIT;",
    guard: GUARD,
    expect: "CONDUCT-SUITE",
  },
  {
    id: "CND-NC-RACE-FIXTURE-COLLIDES",
    defect:
      "the race fixture stops using its own actor prefix, so it collides with the suite's synthetic people",
    file: RACE,
    find: "_emp_a uuid := 'b6000000-0000-4000-8000-00000000ea01';",
    replace: "_emp_a uuid := 'b5000000-0000-4000-8000-00000000ea01';",
    guard: GUARD,
    expect: "CONDUCT-SUITE",
  },
];

runControls("beskt-interview-conduct", MUTATIONS);
