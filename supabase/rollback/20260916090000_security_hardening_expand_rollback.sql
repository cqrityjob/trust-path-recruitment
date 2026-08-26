-- =============================================================================
-- ROLLBACK — security hardening, PHASE 1 of 2: EXPAND
--
-- Reverses 20260916090000_security_hardening_expand.sql.
--
-- ── RUN THE CONTRACT ROLLBACK FIRST ────────────────────────────────────
--
--   supabase/rollback/20260916091000_security_hardening_contract_rollback.sql
--
-- Reverse migration order, and not merely as a convention: this file DROPs the
-- two governed entry points, and once they are gone the only remaining write
-- path into either telemetry table is the legacy INSERT that CONTRACT removed.
-- Running this one alone would leave both tables with no anonymous write path
-- at all — the outage the phase split exists to prevent, produced by the
-- rollback instead of by the deploy. This file refuses to run in that state.
--
-- ── READ THIS BEFORE RUNNING IT ────────────────────────────────────────
--
-- A rollback puts back what was there. What was there is the vulnerable
-- state, and this file reinstates all of it deliberately:
--
--   * EXECUTE on save_career_report(...) back to PUBLIC, so an unauthenticated
--     caller holding the publishable key can again forge a completed career
--     assessment run against any user in the system;
--   * the full table grant set on the legacy backup, TRUNCATE included, which
--     row-level security does not cover.
--
-- The `WITH CHECK (true)` INSERT policies are restored by the CONTRACT
-- rollback rather than by this file, because CONTRACT is what removed them.
--
-- Run it only to unblock a genuine regression, and only as a step on the way
-- back to a fixed forward migration.
--
-- ── WHAT IS DELIBERATELY NOT REVERSED ──────────────────────────────────
--
-- Rows. Every funnel event, feedback row and career report written while the
-- hardening was in place stays exactly where it is: nothing here deletes data.
--
-- The search_path pinning on the 26 previously-unpinned functions also stays.
-- Reversing it would hand back a real attack surface (a caller-controlled
-- temp schema shadowing an unqualified table reference inside a trigger guard)
-- in exchange for nothing — those functions behave identically with the
-- setting, which is why the forward migration could add it without touching a
-- single body. If a future change genuinely needs the old resolution back,
-- that is an ALTER on the one function that needs it, not a blanket undo.
--
-- The three ALTER DEFAULT PRIVILEGES statements this repository uses to mirror
-- the hosted grants locally are likewise left alone, for the same reason
-- Phase 7b and Phase 9b left theirs: removing the mirror does not remove a
-- grant, it only makes the test suite stop being able to see one.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 0 · Refuse to strand the telemetry tables
--
-- The CONTRACT rollback restores the legacy INSERT policy. If it has not run,
-- dropping the entry points below removes the last remaining write path.
-- ---------------------------------------------------------------------------
DO $ordering$
DECLARE _legacy integer;
BEGIN
  SELECT count(*) INTO _legacy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('cd_v31_funnel_events', 'cd_test_feedback')
     AND cmd = 'INSERT';

  IF _legacy <> 2 THEN
    RAISE EXCEPTION
      'SECURITY_HARDENING_EXPAND_ROLLBACK_BLOCKED: % of 2 legacy INSERT policies are in '
      'place. Run 20260916091000_security_hardening_contract_rollback.sql first, or this '
      'rollback leaves both telemetry tables with no anonymous write path at all.',
      _legacy;
  END IF;
END
$ordering$;

-- ---------------------------------------------------------------------------
-- 1 · The telemetry entry points and the constraints EXPAND added
--
-- The legacy INSERT policy and grant are NOT restored here: EXPAND never
-- removed them, so there is nothing for this file to put back. The CONTRACT
-- rollback owns them, and section 0 has already confirmed it ran.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.cd_record_funnel_event(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.cd_submit_test_feedback(
  text, smallint, boolean, boolean, boolean, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.cd_assert_session_writable(uuid, uuid);
DROP FUNCTION IF EXISTS public.cd_v31_funnel_event_names();

ALTER TABLE public.cd_v31_funnel_events
  DROP CONSTRAINT IF EXISTS cd_v31_funnel_events_detail_bounded;
ALTER TABLE public.cd_test_feedback
  DROP CONSTRAINT IF EXISTS cd_test_feedback_explored_profession_id_bounded;

-- Exactly the grants 20260815090000 left behind: INSERT for both roles,
-- SELECT for authenticated, no UPDATE and no DELETE.
--
-- The inherited anon SELECT and anon TRUNCATE that EXPAND revoked are
-- deliberately NOT restored. They were never written by this repository -- they
-- arrived from Supabase's default privileges -- and re-granting an anonymous
-- role the ability to TRUNCATE a table, which row-level security does not
-- cover, in the name of fidelity to a state nobody chose, would be the one
-- irreversible mistake in an otherwise reversible file.
REVOKE UPDATE, DELETE ON public.cd_v31_funnel_events FROM anon, authenticated;
GRANT INSERT ON public.cd_v31_funnel_events TO anon, authenticated;
GRANT SELECT ON public.cd_v31_funnel_events TO authenticated;

REVOKE UPDATE, DELETE ON public.cd_test_feedback FROM anon, authenticated;
GRANT INSERT ON public.cd_test_feedback TO anon, authenticated;
GRANT SELECT ON public.cd_test_feedback TO authenticated;

COMMENT ON TABLE public.cd_v31_funnel_events IS
  'Privacy-safe funnel events for the v3.1 anonymous-first flow (Execution '
  'Mandate §34). No fingerprinting, no free text, no platform-post '
  'confirmation — only what this app itself observes.';

COMMENT ON TABLE public.cd_test_feedback IS
  'Lightweight, opt-in test-group feedback (Execution Mandate §31). Never '
  'the candidate''s raw assessment answers.';

-- ---------------------------------------------------------------------------
-- 2 · save_career_report — body and grants as they were
-- ---------------------------------------------------------------------------

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
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid;
  v_inserted_run_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'save_career_report: p_user_id is required';
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

COMMENT ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text
) IS NULL;

-- proacl NULL is the pre-hardening state: PostgreSQL's default, which is
-- EXECUTE to PUBLIC. Restored by revoking every explicit entry.
REVOKE ALL ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text
) TO PUBLIC;

-- ---------------------------------------------------------------------------
-- 3 · Trigger functions — EXECUTE back to PUBLIC
--
-- The same class the forward migration closed, reopened the same way: every
-- non-extension trigger function in `public`, not a hand-kept list of three.
-- ---------------------------------------------------------------------------

DO $trigger_execute$
DECLARE _fn record;
BEGIN
  FOR _fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'pg_catalog.trigger'::regtype
       AND NOT EXISTS (
             SELECT 1 FROM pg_depend d
              WHERE d.objid = p.oid
                AND d.classid = 'pg_proc'::regclass
                AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', _fn.sig);
  END LOOP;
END
$trigger_execute$;

-- Phase 7b (20260817190000) revoked EXECUTE on this one trigger function on
-- purpose and independently of this change. Re-close it, so rolling this
-- migration back does not silently undo an earlier, unrelated fix.
REVOKE ALL ON FUNCTION public.sp_claims_credential_rules()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · The two deliberately public functions — back to inherited ACLs
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.cd_get_shared_report(text) IS NULL;
COMMENT ON FUNCTION public.employer_is_active_status(uuid) IS NULL;

GRANT EXECUTE ON FUNCTION public.cd_get_shared_report(text) TO PUBLIC;
ALTER FUNCTION public.employer_is_active_status(uuid) SET search_path TO 'public';
GRANT EXECUTE ON FUNCTION public.employer_is_active_status(uuid) TO PUBLIC;

-- ---------------------------------------------------------------------------
-- 5 · The legacy backup table
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "legacy_family_backup_admin_read"
  ON public.cig_profession_families_legacy_backup;

CREATE POLICY "legacy_family_backup_admin_all"
  ON public.cig_profession_families_legacy_backup
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT ALL ON public.cig_profession_families_legacy_backup TO anon, authenticated;
GRANT ALL ON public.cig_profession_families_legacy_backup TO service_role;

COMMENT ON TABLE public.cig_profession_families_legacy_backup IS NULL;

-- ---------------------------------------------------------------------------
-- 6 · Prove the reversal actually happened, and that no data went with it
-- ---------------------------------------------------------------------------

DO $verify$
DECLARE
  _left      integer;
  _policies  integer;
  _backup    integer;
BEGIN
  SELECT count(*) INTO _left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('cd_record_funnel_event', 'cd_submit_test_feedback',
                       'cd_assert_session_writable', 'cd_v31_funnel_event_names');
  IF _left <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % hardening function(s) survive', _left;
  END IF;

  -- Restored by the CONTRACT rollback, not by this file. Asserted anyway: it is
  -- the state the deployed code needs, and section 0's check happened before
  -- any of the drops above rather than after them.
  SELECT count(*) INTO _policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('cd_v31_funnel_events', 'cd_test_feedback')
     AND cmd = 'INSERT';
  IF _policies <> 2 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % of 2 legacy INSERT policies present', _policies;
  END IF;

  IF NOT has_function_privilege('anon',
        'public.save_career_report(uuid,uuid,text,uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure,
        'EXECUTE') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: save_career_report is still closed to anon';
  END IF;

  -- The point of keeping the table: the 13 archived rows must still be there.
  SELECT count(*) INTO _backup FROM public.cig_profession_families_legacy_backup;
  IF _backup < 13 THEN
    RAISE EXCEPTION 'ROLLBACK DESTROYED DATA: legacy backup holds % rows, expected at least 13', _backup;
  END IF;

  RAISE NOTICE 'security hardening (expand) rollback: reversed, % legacy backup rows intact', _backup;
END
$verify$;

COMMIT;
