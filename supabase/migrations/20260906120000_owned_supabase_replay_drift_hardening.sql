-- Owned Supabase replay-drift hardening.
--
-- A clean chronological replay exposed three end-state defects that the
-- Lovable-hosted ledger happened to mask by applying generated re-issues in a
-- different order:
--   1. cd_outstanding_reviews lost security_invoker=true;
--   2. 25 public functions lost their pinned search_path;
--   3. jobs_archive_lifecycle replaced, rather than extended, the job audit
--      action vocabulary used by the application.
--
-- This migration states the canonical end state explicitly. It is safe to run
-- repeatedly and does not modify product records.

-- -------------------------------------------------------------------------
-- 1. The operator view must obey the querying user's RLS context.
-- -------------------------------------------------------------------------

ALTER VIEW public.cd_outstanding_reviews
  SET (security_invoker = true);

REVOKE ALL ON public.cd_outstanding_reviews FROM anon;
GRANT SELECT ON public.cd_outstanding_reviews TO authenticated;

-- -------------------------------------------------------------------------
-- 2. Pin the resolution context of every function reported by the Supabase
--    mutable-search-path advisor. public remains first because these existing
--    bodies intentionally use unqualified application objects; pg_temp is
--    placed last so temporary objects cannot shadow them.
-- -------------------------------------------------------------------------

ALTER FUNCTION public.scp_attempt_lifecycle_state(text, timestamptz, timestamptz, timestamptz, timestamptz, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_attempt_mode_matches_form()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_behaviour_has_competency()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_best_worst_keys()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_block_asks_agrees()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_closed_test_purpose_agrees()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_evidence_append_only()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_evidence_source_has_writer()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_evidence_source_honesty()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_form_single_mode()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_interview_notes_append_only()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_item_behaviour_agrees()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_item_mode_disjoint()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_learning_counterpart()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_no_learning_feedback_on_assessment()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_programme_states_limits()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_report_states_limits()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_response_matches_format()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_review_immutable_once_done()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_rubric_complete()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_rubric_score_append_only()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_scoring_run_append_only()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_scoring_run_consistent()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_single_enabled_provider()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.scp_guard_snapshot_immutable()
  SET search_path = public, pg_temp;

-- Trigger functions cannot be called as ordinary RPCs. Remove the inherited
-- EXECUTE surface from the three SECURITY DEFINER trigger functions that the
-- advisor otherwise reports as anonymously callable. Existing triggers keep
-- executing normally.
REVOKE EXECUTE ON FUNCTION public.assessment_runs_block_retired_definition()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assessment_runs_block_retired_definition()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.scp_guard_decision_append_only()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_guard_decision_append_only()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.scp_guard_governance_lineage_immutable()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_guard_governance_lineage_immutable()
  TO service_role;

-- -------------------------------------------------------------------------
-- 3. Preserve the union of every job-audit action introduced by the Jobs MVP
--    and the later archive lifecycle. This also closes the live mismatch where
--    duplicateEmployerJob writes "duplicated_from" but no historical CHECK
--    version admitted it.
-- -------------------------------------------------------------------------

DO $$
DECLARE _bad text[];
BEGIN
  SELECT array_agg(DISTINCT action ORDER BY action)
    INTO _bad
    FROM public.job_audit_events
   WHERE action <> ALL (ARRAY[
     'created','updated','submitted','approved','rejected','published',
     'expired','archived','restored','duplicated','duplicate_marked',
     'duplicated_from','deleted','changes_requested','resubmitted','closed'
   ]::text[]);

  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'JOB_AUDIT_ACTION_UNKNOWN: existing action(s) are outside the canonical vocabulary: %', _bad;
  END IF;
END $$;

ALTER TABLE public.job_audit_events
  DROP CONSTRAINT IF EXISTS job_audit_events_action_check;

ALTER TABLE public.job_audit_events
  ADD CONSTRAINT job_audit_events_action_check CHECK (action IN (
    'created','updated','submitted','approved','rejected','published',
    'expired','archived','restored','duplicated','duplicate_marked',
    'duplicated_from','deleted','changes_requested','resubmitted','closed'
  ));

-- -------------------------------------------------------------------------
-- 4. Postconditions. Abort atomically if any part of the intended end state
--    was not reached.
-- -------------------------------------------------------------------------

DO $$
DECLARE
  _reloptions text[];
  _mutable_count integer;
  _anon_trigger_count integer;
  _constraint text;
BEGIN
  SELECT c.reloptions INTO _reloptions
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'cd_outstanding_reviews';

  IF _reloptions IS NULL OR NOT ('security_invoker=true' = ANY (_reloptions)) THEN
    RAISE EXCEPTION 'OWNED_REPLAY_DRIFT: cd_outstanding_reviews is not security_invoker=true';
  END IF;

  SELECT count(*) INTO _mutable_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND l.lanname NOT IN ('c','internal')
     -- This migration owns the 25 functions listed above. Keep the
     -- postcondition scoped to that set so an unrelated function introduced
     -- by the disposable CI harness cannot make this migration non-replayable.
     AND p.proname IN (
       'scp_attempt_lifecycle_state',
       'scp_guard_attempt_mode_matches_form',
       'scp_guard_behaviour_has_competency',
       'scp_guard_best_worst_keys',
       'scp_guard_block_asks_agrees',
       'scp_guard_closed_test_purpose_agrees',
       'scp_guard_evidence_append_only',
       'scp_guard_evidence_source_has_writer',
       'scp_guard_evidence_source_honesty',
       'scp_guard_form_single_mode',
       'scp_guard_interview_notes_append_only',
       'scp_guard_item_behaviour_agrees',
       'scp_guard_item_mode_disjoint',
       'scp_guard_learning_counterpart',
       'scp_guard_no_learning_feedback_on_assessment',
       'scp_guard_programme_states_limits',
       'scp_guard_report_states_limits',
       'scp_guard_response_matches_format',
       'scp_guard_review_immutable_once_done',
       'scp_guard_rubric_complete',
       'scp_guard_rubric_score_append_only',
       'scp_guard_scoring_run_append_only',
       'scp_guard_scoring_run_consistent',
       'scp_guard_single_enabled_provider',
       'scp_guard_snapshot_immutable'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
     );

  IF _mutable_count <> 0 THEN
    RAISE EXCEPTION 'OWNED_REPLAY_DRIFT: % public function(s) still have a mutable search_path', _mutable_count;
  END IF;

  SELECT count(*) INTO _anon_trigger_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'assessment_runs_block_retired_definition',
       'scp_guard_decision_append_only',
       'scp_guard_governance_lineage_immutable'
     )
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF _anon_trigger_count <> 0 THEN
    RAISE EXCEPTION 'OWNED_REPLAY_DRIFT: % SECURITY DEFINER trigger function(s) remain executable by anon', _anon_trigger_count;
  END IF;

  SELECT pg_get_constraintdef(c.oid, true) INTO _constraint
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'public'
     AND r.relname = 'job_audit_events'
     AND c.conname = 'job_audit_events_action_check';

  IF _constraint IS NULL
     OR _constraint NOT LIKE '%duplicated_from%'
     OR _constraint NOT LIKE '%changes_requested%'
     OR _constraint NOT LIKE '%restored%' THEN
    RAISE EXCEPTION 'OWNED_REPLAY_DRIFT: job audit vocabulary is incomplete: %', _constraint;
  END IF;
END $$;
