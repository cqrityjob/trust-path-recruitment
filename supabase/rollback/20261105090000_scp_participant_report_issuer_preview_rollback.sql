-- Roll back the E2 issuer preview read.
--
-- Both functions are pure additions: nothing else in the schema references
-- them, no policy evaluates them, no table depends on them, and neither one
-- was ever a writer. Dropping them removes exactly one capability -- an owner
-- or admin reading the participant document of an attempt their organisation
-- commissioned -- and restores the state 20260904134520 left, in which the
-- participant document has one reader and that reader is the participant.
--
-- No snapshot, release, template or grant on any other object is touched.

DROP FUNCTION IF EXISTS public.scp_participant_report_for_issuer(uuid);
DROP FUNCTION IF EXISTS public.scp_report_issuer_admin(uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('scp_participant_report_for_issuer',
                                  'scp_report_issuer_admin')) THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW_ROLLBACK: a function survived the drop.';
  END IF;
  -- The contract this file must NOT have disturbed.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_participant_report') THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW_ROLLBACK: scp_participant_report is missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_report_snapshot_readable') THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW_ROLLBACK: scp_report_snapshot_readable is missing.';
  END IF;
  RAISE NOTICE 'SCP_ISSUER_PREVIEW_ROLLBACK ok';
END $$;
