-- Rollback for 20261028090000_scp_trust_evidence_report_r3a_contract.sql
-- (PR-R3A, REPORT V3 DATA CONTRACT, employer audience).
--
-- Drops the two routines the migration created (the V3 document and the
-- rds-v1 process-step rule). Nothing else was created,
-- changed or written: no table, no column, no policy, no grant on an existing
-- object, no row. The audience contracts scp_participant_report and
-- scp_employer_report, the release function, the private manifest and every
-- released snapshot are untouched in both directions.
--
-- Safe to run at any time. A client that has already started calling
-- scp_employer_report_v3 receives a "function does not exist" error after
-- this runs and must fall back to scp_employer_report; nothing is lost,
-- because the V3 document was only ever a projection of that one.

DROP FUNCTION IF EXISTS public.scp_employer_report_v3(uuid);
DROP FUNCTION IF EXISTS public.scp_report_next_step(boolean, integer, integer, integer);

DO $proof$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('scp_employer_report_v3', 'scp_report_next_step')) THEN
    RAISE EXCEPTION 'SCP_R3A_ROLLBACK: a PR-R3A routine survived';
  END IF;
  -- What must still be there afterwards.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
         AND p.prosecdef AND p.prosrc LIKE '%scp_report_snapshot_readable%') <> 2 THEN
    RAISE EXCEPTION 'SCP_R3A_ROLLBACK: an audience contract is missing -- this rollback must not have touched it';
  END IF;
  IF has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R3A_ROLLBACK: the direct snapshot read must still be withdrawn';
  END IF;
  RAISE NOTICE 'PR-R3A rolled back: scp_employer_report_v3 and scp_report_next_step dropped; audience contracts, release function and snapshots untouched';
END
$proof$;
