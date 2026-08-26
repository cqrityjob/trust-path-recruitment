-- =============================================================================
-- Security hardening — the five Lovable/Supabase advisor findings
--
-- One migration, five findings, no product feature removed. Anonymous funnel
-- analytics and anonymous test-group feedback BOTH remain supported; what goes
-- away is the ability to forge who they belong to.
--
-- ── THE FIVE FINDINGS, MAPPED TO REAL OBJECTS ────────────────────────────
--
--  1. "Legacy backup table has no read path but no public exposure issue"
--       -> public.cig_profession_families_legacy_backup (13 archived rows).
--          RLS is on and only an admin policy exists, so nothing leaks. But
--          Supabase's ALTER DEFAULT PRIVILEGES had handed anon and
--          authenticated the FULL table grant set, TRUNCATE included — and
--          TRUNCATE is not subject to RLS. Grants tightened; table KEPT.
--
--  2. "cd_test_feedback allows unrestricted INSERT from anon/authenticated"
--  3. "cd_v31_funnel_events allows unrestricted INSERT from anon/authenticated"
--       -> both carried `FOR INSERT TO anon, authenticated WITH CHECK (true)`
--          over tables with a user_id column referencing auth.users and a
--          session_id referencing cd_sessions. Verified against a replay that
--          reproduces the hosted grants: an anonymous caller could attach a
--          `result_claimed` event, or a feedback row, to ANOTHER user's id and
--          ANOTHER user's session; and `detail` accepted a 200 KB free-text
--          blob into a table whose own comment promises "no free text, no
--          PII". Replaced by two narrow SECURITY DEFINER entry points.
--
--  4. "Public can execute SECURITY DEFINER function(s)"
--       -> six, enumerated exactly (identical on a clean replay and on one
--          that reproduces the hosted default privileges):
--            a. save_career_report(...)                    ESCALATION — closed
--            b. assessment_runs_block_retired_definition()  trigger  — closed
--            c. scp_guard_decision_append_only()            trigger  — closed
--            d. scp_guard_governance_lineage_immutable()    trigger  — closed
--            e. cd_get_shared_report(text)                  PUBLIC   — kept
--            f. employer_is_active_status(uuid)             PUBLIC   — kept
--
--  5. "Function search_path mutable"
--       -> 26 repository-owned functions in `public` with no search_path at
--          all: 25 `scp_guard_*` trigger functions and one SQL helper. None is
--          SECURITY DEFINER, and every one of them resolves only public and
--          pg_catalog objects, so `public, pg_temp` preserves resolution
--          exactly while pinning it. (The 36 pgcrypto and 4 unaccent functions
--          in `public` are extension-owned and deliberately untouched: ALTERing
--          an extension's functions breaks its upgrade path.)
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────────
--
-- It does not delete the legacy backup table, does not change Career Discovery
-- scoring or the question methodology, does not touch Passport governance, and
-- does not change market activation.
-- =============================================================================

-- =============================================================================
-- FINDING 5 — pin search_path on the 26 functions that had none
--
-- Reviewed individually, not blanket-applied: each of these resolves only
-- public and pg_catalog objects (verified by scanning every body for an
-- auth./storage./extensions./vault./graphql./net./cron. reference — none has
-- one), so `public, pg_temp` is the minimal trusted path that preserves
-- resolution. pg_temp is named LAST on purpose: leaving it out does not remove
-- it, it only leaves it implicitly FIRST for table lookups, which is the whole
-- attack this setting exists to stop.
-- =============================================================================

ALTER FUNCTION public.scp_attempt_lifecycle_state(text, timestamptz, timestamptz, timestamptz, timestamptz, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.scp_guard_attempt_mode_matches_form()          SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_behaviour_has_competency()           SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_best_worst_keys()                    SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_block_asks_agrees()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_closed_test_purpose_agrees()         SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_construct_honesty()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_evidence_append_only()               SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_evidence_source_has_writer()         SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_evidence_source_honesty()            SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_form_single_mode()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_interview_notes_append_only()        SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_item_behaviour_agrees()              SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_item_mode_disjoint()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_learning_counterpart()               SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_no_learning_feedback_on_assessment() SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_programme_states_limits()            SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_report_states_limits()               SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_response_matches_format()            SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_review_immutable_once_done()         SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_rubric_complete()                    SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_rubric_score_append_only()           SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_scoring_run_append_only()            SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_scoring_run_consistent()             SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_single_enabled_provider()            SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_snapshot_immutable()                 SET search_path = public, pg_temp;

-- =============================================================================
-- FINDING 4a — save_career_report: the one that actually mattered
--
-- SECURITY DEFINER, thirteen parameters, and the FIRST of them is the user the
-- report gets attributed to. It validates that p_user_id exists in auth.users
-- and nothing else — there is no check that the caller IS that user. Its own
-- source comment calls it "service-role-only" and says it "cannot be called by
-- any client-side code"; the grants said otherwise. proacl was NULL, which in
-- PostgreSQL means the default: EXECUTE to PUBLIC, and PUBLIC includes anon.
-- Anyone holding the publishable key could therefore forge a completed career
-- assessment run and its report against any user id in the system.
--
-- Both real call sites (saveMyCareerReport and linkAssignmentRun) already go
-- through the service-role client, so restricting EXECUTE to service_role
-- restores the documented intent rather than changing behaviour.
--
-- The body also gains an internal authorization check. It is a BACKSTOP, not
-- the control: the grant above is the control. auth.uid() is NULL for
-- service_role (a service key carries no `sub` claim), so the legitimate path
-- is unaffected, while a future restored grant cannot be used by a signed-in
-- candidate to write somebody else's report.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_career_report(
  p_user_id uuid,
  p_completion_id uuid,
  p_assessment_id text,
  p_assessment_version_id uuid,
  p_graph_version text,
  p_locale text,
  p_result_summary jsonb,
  p_profile_snapshot jsonb,
  p_report jsonb,
  p_report_version text,
  p_engine_version text,
  p_profile_version text,
  p_inputs_hash text
)
RETURNS TABLE(run_id uuid, created_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_run_id uuid;
  v_inserted_run_id uuid;
  v_caller uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'save_career_report: p_user_id is required';
  END IF;

  -- Backstop, not the boundary. A signed-in principal may only ever write a
  -- report for themselves; service_role and postgres carry no auth.uid() and
  -- are the intended callers.
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION
      'SAVE_CAREER_REPORT_NOT_OWNER: a signed-in caller may only save their own report'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'save_career_report: unknown user_id %', p_user_id;
  END IF;

  SELECT arr.run_id INTO v_run_id
    FROM public.assessment_run_reports AS arr
   WHERE arr.completion_id = p_completion_id
     AND arr.user_id = p_user_id;
  IF v_run_id IS NOT NULL THEN
    RETURN QUERY SELECT v_run_id, false;
    RETURN;
  END IF;

  INSERT INTO public.assessment_runs (
    user_id, assessment_id, assessment_version_id, graph_version,
    locale, status, completed_at, result_summary, profile_snapshot
  ) VALUES (
    p_user_id, p_assessment_id, p_assessment_version_id, p_graph_version,
    p_locale, 'completed', now(), p_result_summary, p_profile_snapshot
  ) RETURNING assessment_runs.id INTO v_run_id;

  INSERT INTO public.assessment_run_reports (
    run_id, user_id, completion_id, report_version, engine_version,
    graph_version, profile_version, locale, inputs_hash, report
  ) VALUES (
    v_run_id, p_user_id, p_completion_id, p_report_version, p_engine_version,
    p_graph_version, p_profile_version, p_locale, p_inputs_hash, p_report
  )
  ON CONFLICT (user_id, completion_id) DO NOTHING
  RETURNING assessment_run_reports.run_id INTO v_inserted_run_id;

  IF v_inserted_run_id IS NOT NULL THEN
    RETURN QUERY SELECT v_run_id, true;
    RETURN;
  END IF;

  DELETE FROM public.assessment_runs AS ar WHERE ar.id = v_run_id;

  SELECT arr.run_id INTO v_run_id
    FROM public.assessment_run_reports AS arr
   WHERE arr.completion_id = p_completion_id
     AND arr.user_id = p_user_id;

  IF v_run_id IS NULL THEN
    RAISE EXCEPTION 'save_career_report: lost insert race for completion_id % but could not locate the winning row', p_completion_id;
  END IF;

  RETURN QUERY SELECT v_run_id, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text
) IS
  'Persists one scored assessment run and its report atomically. SERVICE ROLE '
  'ONLY: EXECUTE is revoked from PUBLIC, anon and authenticated because the '
  'first parameter names the user the report is attributed to and the function '
  'runs as its owner. A signed-in caller is additionally refused unless '
  'auth.uid() = p_user_id.';

-- =============================================================================
-- FINDING 4b/c/d — trigger functions are not an API
--
-- Three of the six anon-executable SECURITY DEFINER functions are trigger
-- functions. PostgreSQL refuses to call a `RETURNS trigger` function directly
-- ("trigger functions can only be called as triggers"), so the practical risk
-- was nil — but the grant made the invariant "anon executes nothing here"
-- unaskable, which is the same reasoning Phase 7b applied to
-- sp_claims_credential_rules.
--
-- Rather than name the three, this closes the whole class: EXECUTE on EVERY
-- trigger function in `public` is revoked from PUBLIC, anon and authenticated.
-- Verified safe by construction — trigger firing does NOT check EXECUTE on the
-- trigger function (only CREATE TRIGGER does), unlike a column DEFAULT, a CHECK
-- constraint or an RLS policy expression, all three of which do. The suite
-- proves that empirically rather than taking this comment's word for it.
-- =============================================================================

DO $trigger_execute$
DECLARE
  _fn   record;
  _done integer := 0;
BEGIN
  FOR _fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'pg_catalog.trigger'::regtype
       -- Never touch an extension's own objects: ALTERing them breaks the
       -- extension upgrade path and they are not this repository's to govern.
       AND NOT EXISTS (
             SELECT 1 FROM pg_depend d
              WHERE d.objid = p.oid
                AND d.classid = 'pg_proc'::regclass
                AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', _fn.sig);
    _done := _done + 1;
  END LOOP;

  RAISE NOTICE 'security hardening: EXECUTE revoked on % trigger function(s)', _done;
END
$trigger_execute$;

-- =============================================================================
-- FINDING 4e/f — the two that stay public, made explicit
--
-- Both are genuinely required by an unauthenticated visitor and neither
-- exposes anything the visitor could not already see:
--
--   cd_get_shared_report(text)   the share-token read behind /p/<token>. It
--                                returns only the three fields the candidate
--                                deliberately published, and only for a token
--                                that has not been revoked.
--   employer_is_active_status()  named inside jobs_public_active_select, the
--                                RLS policy that lets anon see live adverts.
--                                RLS policy expressions DO check EXECUTE, so
--                                revoking this would black out the public job
--                                board.
--
-- Their ACLs are made explicit rather than inherited, so "anon may execute
-- this" is a recorded decision that a reviewer can see, and PUBLIC — which is
-- broader than anon and authenticated together — is removed from both.
-- =============================================================================

REVOKE ALL ON FUNCTION public.cd_get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_get_shared_report(text) TO anon, authenticated, service_role;

ALTER FUNCTION public.employer_is_active_status(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.employer_is_active_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_is_active_status(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.cd_get_shared_report(text) IS
  'Deliberately anon-executable: the /p/<token> share read. Returns only the '
  'share fields the candidate published, only for an unrevoked token.';

COMMENT ON FUNCTION public.employer_is_active_status(uuid) IS
  'Deliberately anon-executable: named by the jobs_public_active_select RLS '
  'policy. RLS policy expressions check EXECUTE, so anon must hold it for the '
  'public job board to render.';

-- =============================================================================
-- FINDINGS 2 AND 3 — the telemetry tables
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────
--
-- Both tables had `FOR INSERT TO anon, authenticated WITH CHECK (true)` plus a
-- direct INSERT grant. The app's own write path never sets user_id or
-- session_id on either table — but PostgREST is not the app, and the
-- publishable key is public. Reproduced on a replay carrying the hosted
-- grants: an anonymous caller inserted a `result_claimed` funnel event and a
-- feedback row, both attributed to another user's id and another user's
-- session, and both readable afterwards by a platform admin as though the
-- victim had written them. `detail` accepted 200 KB of arbitrary text.
--
-- The hosted default privileges had also handed anon SELECT and TRUNCATE on
-- both tables. SELECT is bounded by RLS (there is no anon SELECT policy) so
-- nothing was readable — but TRUNCATE is NOT subject to RLS at all.
--
-- ── WHY THE ANSWER IS NOT "REQUIRE A LOGIN" ──────────────────────────────
--
-- Anonymous telemetry is the product requirement, not an oversight: v3.1 is an
-- anonymous-first flow and a funnel that only records signed-in users measures
-- the wrong half of it. Anonymous feedback is likewise opt-in test-group input
-- from people who have not claimed a result. BOTH REMAIN SUPPORTED.
--
-- What changes is that the row's identity stops being caller-supplied. The
-- direct table INSERT is withdrawn and replaced by two narrow SECURITY DEFINER
-- entry points that:
--   * take no user_id parameter at all — it is derived from auth.uid();
--   * accept a session_id only if that session is unclaimed or already the
--     caller's own, so an event can never be pinned on another user's run;
--   * validate the event name against the same closed list the table's own
--     CHECK constraint carries (the suite proves the two agree);
--   * bound the detail payload's shape, key count, value types and size, so
--     "no free text, no PII" is enforced rather than promised;
--   * can only INSERT — there is no update or delete path from either.
-- =============================================================================

-- The event-name allowlist, in one place the RPC can read. The table's CHECK
-- constraint is deliberately NOT rewritten to call this function: a CHECK that
-- depends on a function silently changes meaning when the function is replaced,
-- with no revalidation. The suite asserts the two lists are identical instead,
-- so drift fails a test rather than opening the allowlist.
CREATE OR REPLACE FUNCTION public.cd_v31_funnel_event_names()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'assessment_started', 'assessment_completed', 'career_context_completed',
    'result_viewed', 'profession_explored', 'pathway_opened', 'jobs_clicked',
    'career_card_opened', 'career_card_generated', 'share_initiated',
    'image_saved', 'save_journey_clicked', 'result_claimed',
    'feedback_submitted', 'result_downloaded'
  ]::text[];
$$;

REVOKE ALL ON FUNCTION public.cd_v31_funnel_event_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_v31_funnel_event_names() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared session-ownership rule for both entry points.
--
-- Three cases, and the third is the finding:
--   session does not exist          -> refuse (a typo must not become a row)
--   session is unclaimed (NULL)     -> allow (this is the anonymous flow)
--   session belongs to somebody     -> allow ONLY if that somebody is the caller
--
-- An anonymous caller therefore cannot attach anything to a claimed run, and a
-- signed-in caller cannot attach anything to another candidate's run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cd_assert_session_writable(_session_id uuid, _caller uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _owner uuid;
BEGIN
  IF _session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT s.user_id INTO _owner FROM public.cd_sessions s WHERE s.id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CD_SESSION_UNKNOWN: no such session'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _owner IS NOT NULL AND _owner IS DISTINCT FROM _caller THEN
    RAISE EXCEPTION 'CD_SESSION_NOT_YOURS: that session belongs to another candidate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.cd_assert_session_writable(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.cd_assert_session_writable(uuid, uuid) IS
  'Internal helper for the two anonymous telemetry entry points. Not callable '
  'by anon or authenticated: it takes the caller identity as a parameter, so '
  'exposing it would hand back exactly the spoofing it exists to prevent.';

-- ---------------------------------------------------------------------------
-- The funnel entry point.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cd_record_funnel_event(
  _event_name text,
  _detail     jsonb DEFAULT '{}'::jsonb,
  _session_id uuid  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean  jsonb := COALESCE(_detail, '{}'::jsonb);
  _key    text;
  _val    jsonb;
  _keys   integer := 0;
BEGIN
  IF _event_name IS NULL
     OR NOT (_event_name = ANY (public.cd_v31_funnel_event_names())) THEN
    RAISE EXCEPTION 'CD_FUNNEL_EVENT_UNKNOWN: %', COALESCE(_event_name, '<null>')
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(_clean) <> 'object' THEN
    RAISE EXCEPTION 'CD_FUNNEL_DETAIL_NOT_OBJECT: detail must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;

  IF length(_clean::text) > 2048 THEN
    RAISE EXCEPTION 'CD_FUNNEL_DETAIL_TOO_LARGE: detail exceeds 2048 bytes'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR _key, _val IN SELECT e.key, e.value FROM jsonb_each(_clean) AS e LOOP
    _keys := _keys + 1;
    IF char_length(_key) > 64 THEN
      RAISE EXCEPTION 'CD_FUNNEL_DETAIL_KEY_TOO_LONG: %', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(_val) NOT IN ('string', 'number', 'boolean') THEN
      RAISE EXCEPTION 'CD_FUNNEL_DETAIL_VALUE_SHAPE: "%" is %', _key, jsonb_typeof(_val)
        USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(_val) = 'string' AND char_length(_val #>> '{}') > 200 THEN
      RAISE EXCEPTION 'CD_FUNNEL_DETAIL_VALUE_TOO_LONG: "%"', _key
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF _keys > 12 THEN
    RAISE EXCEPTION 'CD_FUNNEL_DETAIL_TOO_MANY_KEYS: % keys', _keys
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.cd_assert_session_writable(_session_id, _caller);

  -- user_id is DERIVED. There is no parameter for it, by design.
  INSERT INTO public.cd_v31_funnel_events (event_name, detail, session_id, user_id)
  VALUES (_event_name, _clean, _session_id, _caller);
END
$$;

REVOKE ALL ON FUNCTION public.cd_record_funnel_event(text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_record_funnel_event(text, jsonb, uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.cd_record_funnel_event(text, jsonb, uuid) IS
  'The ONLY write path into cd_v31_funnel_events for anon and authenticated. '
  'Anonymous funnel tracking stays supported; user_id is derived from '
  'auth.uid() and never accepted from the caller, session_id is refused unless '
  'the session is unclaimed or the caller''s own, the event name must be in '
  'cd_v31_funnel_event_names(), and detail is bounded in shape, size and type.';

-- ---------------------------------------------------------------------------
-- The feedback entry point.
--
-- Parameters mirror the product's own form exactly — the closed answers plus
-- two bounded free-text fields — so there is nothing to pass that the form
-- does not collect. The length limits repeat the client validator's on purpose:
-- a limit enforced only in TypeScript is a suggestion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cd_submit_test_feedback(
  _locale                text,
  _relevant              smallint DEFAULT NULL,
  _understood_why        boolean  DEFAULT NULL,
  _pathway_realistic     boolean  DEFAULT NULL,
  _requirements_useful   boolean  DEFAULT NULL,
  _missing_career_note   text     DEFAULT NULL,
  _explored_profession_id text    DEFAULT NULL,
  _free_text             text     DEFAULT NULL,
  _session_id            uuid     DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _locale IS NULL OR _locale NOT IN ('sv', 'en') THEN
    RAISE EXCEPTION 'CD_FEEDBACK_LOCALE_INVALID: %', COALESCE(_locale, '<null>')
      USING ERRCODE = 'check_violation';
  END IF;

  IF _relevant IS NOT NULL AND (_relevant < 1 OR _relevant > 5) THEN
    RAISE EXCEPTION 'CD_FEEDBACK_RELEVANT_OUT_OF_RANGE: %', _relevant
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(_missing_career_note, '')) > 500 THEN
    RAISE EXCEPTION 'CD_FEEDBACK_NOTE_TOO_LONG' USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(_free_text, '')) > 1000 THEN
    RAISE EXCEPTION 'CD_FEEDBACK_FREE_TEXT_TOO_LONG' USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(_explored_profession_id, '')) > 20 THEN
    RAISE EXCEPTION 'CD_FEEDBACK_PROFESSION_ID_TOO_LONG' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.cd_assert_session_writable(_session_id, _caller);

  -- user_id is DERIVED. There is no parameter for it, by design.
  INSERT INTO public.cd_test_feedback (
    session_id, user_id, relevant, understood_why, pathway_realistic,
    requirements_useful, missing_career_note, explored_profession_id,
    free_text, locale
  ) VALUES (
    _session_id, _caller, _relevant, _understood_why, _pathway_realistic,
    _requirements_useful, _missing_career_note, _explored_profession_id,
    _free_text, _locale
  );
END
$$;

REVOKE ALL ON FUNCTION public.cd_submit_test_feedback(
  text, smallint, boolean, boolean, boolean, text, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cd_submit_test_feedback(
  text, smallint, boolean, boolean, boolean, text, text, text, uuid
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.cd_submit_test_feedback(
  text, smallint, boolean, boolean, boolean, text, text, text, uuid
) IS
  'The ONLY write path into cd_test_feedback for anon and authenticated. '
  'Anonymous test-group feedback stays supported; user_id is derived from '
  'auth.uid() and never accepted from the caller, and session_id is refused '
  'unless the session is unclaimed or the caller''s own.';

-- ---------------------------------------------------------------------------
-- Withdraw the direct write path the entry points replace.
--
-- The tables keep RLS enabled and keep their admin-only SELECT policies. What
-- goes is the `WITH CHECK (true)` INSERT policy and every table privilege anon
-- and authenticated held — SELECT and TRUNCATE included, both of which arrived
-- through the hosted default privileges and neither of which was ever
-- intended. `authenticated` keeps SELECT because the admin read policy is what
-- narrows it to platform admins; without the grant that policy is dead.
--
-- The entry points above run as their owner, so they insert without needing a
-- policy. That is a deliberate, narrow bypass through one audited function per
-- table, not a widened policy: there is no statement in either function that
-- can update or delete an existing row.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS cd_v31_funnel_events_insert ON public.cd_v31_funnel_events;
DROP POLICY IF EXISTS cd_test_feedback_insert     ON public.cd_test_feedback;

REVOKE ALL ON public.cd_v31_funnel_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cd_test_feedback     FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.cd_v31_funnel_events TO authenticated;
GRANT SELECT ON public.cd_test_feedback     TO authenticated;

-- Structural bounds that bind even the service-role path, added NOT VALID so
-- no existing row is rewritten or rejected: a NOT VALID CHECK is still enforced
-- on every INSERT and UPDATE from here on, it simply does not re-scan history.
DO $bounds$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cd_v31_funnel_events'::regclass
       AND conname  = 'cd_v31_funnel_events_detail_bounded'
  ) THEN
    ALTER TABLE public.cd_v31_funnel_events
      ADD CONSTRAINT cd_v31_funnel_events_detail_bounded
      CHECK (jsonb_typeof(detail) = 'object' AND length(detail::text) <= 2048)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cd_test_feedback'::regclass
       AND conname  = 'cd_test_feedback_explored_profession_id_bounded'
  ) THEN
    ALTER TABLE public.cd_test_feedback
      ADD CONSTRAINT cd_test_feedback_explored_profession_id_bounded
      CHECK (char_length(explored_profession_id) <= 64)
      NOT VALID;
  END IF;
END
$bounds$;

COMMENT ON TABLE public.cd_v31_funnel_events IS
  'Privacy-safe funnel events for the v3.1 anonymous-first flow (Execution '
  'Mandate §34). Anonymous tracking is supported and intended; the ONLY write '
  'path for anon and authenticated is cd_record_funnel_event(), which derives '
  'user_id from auth.uid() and bounds the detail payload. Direct INSERT was '
  'withdrawn: WITH CHECK (true) let any caller attribute an event to any user.';

COMMENT ON TABLE public.cd_test_feedback IS
  'Lightweight, opt-in test-group feedback (Execution Mandate §31). Never the '
  'candidate''s raw assessment answers. Anonymous submission is supported and '
  'intended; the ONLY write path for anon and authenticated is '
  'cd_submit_test_feedback(), which derives user_id from auth.uid(). Direct '
  'INSERT was withdrawn: WITH CHECK (true) let any caller attribute feedback '
  'to any user.';

-- =============================================================================
-- FINDING 1 — the legacy backup table
--
-- Kept, deliberately. It is the only record of the 13 archived profession
-- family rows that Epic 2 P7 hard-deleted, nothing in the application or in any
-- RPC references it, and deleting a backup to silence an advisory is exactly
-- the wrong trade. The finding itself says no public exposure was found, and
-- that is confirmed here: RLS is on, the sole policy requires has_role(...,
-- 'admin'), and an anon SELECT returns zero rows.
--
-- What IS closed is the grant surface underneath. The hosted default privileges
-- gave anon and authenticated the full set — SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER. Six of those seven were latent (RLS matches no
-- rows for a non-admin). TRUNCATE was not latent in the same way: TRUNCATE is
-- not subject to row-level security at all, so the grant was the only thing
-- standing between a caller who could issue one and an emptied backup.
--
-- The FOR ALL policy also becomes FOR SELECT. An admin reading the backup is
-- the documented use; an admin mutating it through the Data API is not, and
-- restoring from it is a service-role operation, which is untouched.
-- =============================================================================

REVOKE ALL ON public.cig_profession_families_legacy_backup
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.cig_profession_families_legacy_backup TO authenticated;

DROP POLICY IF EXISTS "legacy_family_backup_admin_all"
  ON public.cig_profession_families_legacy_backup;
DROP POLICY IF EXISTS "legacy_family_backup_admin_read"
  ON public.cig_profession_families_legacy_backup;

CREATE POLICY "legacy_family_backup_admin_read"
  ON public.cig_profession_families_legacy_backup
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.cig_profession_families_legacy_backup IS
  'INTENTIONAL LEGACY STATE — do not delete. The permanent snapshot of the 13 '
  'archived profession family rows hard-deleted by Epic 2 P7 '
  '(20260717172039). No application code and no RPC reads it; it exists so the '
  'deletion is reversible. Read access is platform-admin only; anon and '
  'authenticated hold no write and no TRUNCATE.';

-- =============================================================================
-- Make the local replay able to answer the question it is asked
--
-- Phase 7b (20260817190000) and Phase 9b (20260817210000) already reproduce two
-- of Supabase's four default-privilege grants locally, for exactly this reason:
-- an assertion like "anon holds no SELECT on the telemetry tables" passed on a
-- clean replay and was FALSE on hosted, because the local database never had
-- the grant to begin with. That is a test proving nothing.
--
-- This adds the third: ALL on new TABLES to anon. It changes nothing about any
-- existing table — default privileges only apply at CREATE time, and this is
-- the last migration in the history — but from here on a new public table
-- arrives locally with the same anon grants it will arrive with hosted, so the
-- security suite's grant assertions are answerable on both.
-- =============================================================================

DO $mirror$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon';
  END IF;
END
$mirror$;

-- =============================================================================
-- Post-conditions. A migration that silently half-applied is worse than one
-- that failed.
-- =============================================================================

DO $post$
DECLARE
  _no_path      integer;
  _anon_secdef  text;
  _anon_tbl     integer;
  _bad_policy   integer;
BEGIN
  -- 1. No repository-owned function in public is left without a search_path.
  SELECT count(*) INTO _no_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                        AND d.deptype = 'e');
  IF _no_path <> 0 THEN
    RAISE EXCEPTION 'SECURITY_HARDENING_INCOMPLETE: % function(s) still have a mutable search_path', _no_path;
  END IF;

  -- 2. Exactly two SECURITY DEFINER functions remain anon-executable, and they
  --    are the two reviewed as legitimately public.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO _anon_secdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                        AND d.deptype = 'e');
  IF COALESCE(_anon_secdef, '') <> 'cd_get_shared_report, cd_record_funnel_event, cd_submit_test_feedback, employer_is_active_status' THEN
    RAISE EXCEPTION 'SECURITY_HARDENING_INCOMPLETE: unexpected anon-executable SECURITY DEFINER set: [%]', COALESCE(_anon_secdef, '<none>');
  END IF;

  -- 3. anon holds no table privilege at all on the telemetry tables or on the
  --    legacy backup.
  SELECT count(*) INTO _anon_tbl
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee = 'anon'
     AND table_name IN ('cd_v31_funnel_events', 'cd_test_feedback',
                        'cig_profession_families_legacy_backup');
  IF _anon_tbl <> 0 THEN
    RAISE EXCEPTION 'SECURITY_HARDENING_INCOMPLETE: anon still holds % table grant(s) on the hardened tables', _anon_tbl;
  END IF;

  -- 4. No WITH CHECK (true) INSERT policy survives on either telemetry table.
  SELECT count(*) INTO _bad_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('cd_v31_funnel_events', 'cd_test_feedback')
     AND cmd = 'INSERT';
  IF _bad_policy <> 0 THEN
    RAISE EXCEPTION 'SECURITY_HARDENING_INCOMPLETE: % INSERT policy/policies still on the telemetry tables', _bad_policy;
  END IF;

  RAISE NOTICE 'security hardening: all four post-conditions hold';
END
$post$;
