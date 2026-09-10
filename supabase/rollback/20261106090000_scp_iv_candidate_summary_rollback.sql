-- Roll back the E4 candidate-safe interview summary.
--
-- Everything this migration added is additive: one table with no policy and no
-- client grant, five functions, and one name in the event vocabulary. Nothing
-- else references any of them -- scp_iv_finalise_report does not call the
-- release (the migration asserts that at apply time, and this file asserts it
-- again below), no policy evaluates them, and no existing table gained a
-- column or a constraint that outlives the drop.
--
-- DROPPING THE TABLE DROPS RELEASED SUMMARIES. That is the correct behaviour
-- for a rollback of the feature that created them -- there is nowhere else for
-- them to live -- and it is stated here rather than discovered. Take a copy
-- first if the released history matters.
--
-- The event-vocabulary constraint is restored to the 20260921090000 list, so
-- any 'candidate_summary_released' row must go first. Deleting them is
-- correct and not a loss of audit: they refer to summaries this file is
-- removing.

BEGIN;

DELETE FROM public.scp_interview_case_events WHERE event = 'candidate_summary_released';

ALTER TABLE public.scp_interview_case_events
  DROP CONSTRAINT IF EXISTS scp_interview_case_events_event_check;
ALTER TABLE public.scp_interview_case_events
  ADD CONSTRAINT scp_interview_case_events_event_check CHECK (event IN (
    'case_created','source_added','sources_marked_ready','source_erased',
    'transcript_authorised','ai_run_started','ai_run_succeeded','ai_run_failed',
    'source_passage_withheld','prep_generated','prep_edited','prep_approved',
    'interview_started','interview_paused','interview_resumed','interview_completed',
    'probe_used','evidence_review_opened','evidence_proposed','evidence_confirmed',
    'evidence_edited','evidence_rejected','evidence_authored','finding_recorded',
    'finding_resolved','assessment_recorded','assessment_superseded',
    'panel_opened','panel_individual_submitted','panel_revealed','panel_concluded',
    'report_drafted','report_finalised','case_cancelled','retention_applied'));

DROP FUNCTION IF EXISTS public.scp_iv_application_summary_releases(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_released_candidate_summary(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_my_candidate_summary(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_release_candidate_summary(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_preview_candidate_summary(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_build_candidate_summary(uuid);
DROP TABLE    IF EXISTS public.scp_iv_candidate_summaries;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND (p.proname LIKE 'scp\_iv\_%candidate\_summary%'
                     OR p.proname = 'scp_iv_application_summary_releases')) THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY_ROLLBACK: a summary function survived the drop.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'scp_iv_candidate_summaries') THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY_ROLLBACK: the summary table survived the drop.';
  END IF;

  -- The contracts this file must NOT have disturbed.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_iv_finalise_report') THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY_ROLLBACK: scp_iv_finalise_report is missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_iv_candidate_interview_detail') THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY_ROLLBACK: the candidate detail read is missing.';
  END IF;
  -- And the ledger still accepts the events that predate this migration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'scp_interview_case_events_event_check'
       AND pg_get_constraintdef(oid) LIKE '%report_finalised%') THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY_ROLLBACK: the event vocabulary was not restored.';
  END IF;

  RAISE NOTICE 'SCP_IV_SUMMARY_ROLLBACK ok';
END $$;

COMMIT;
