-- Rollback for 20261024090000_scp_trust_evidence_report_r2a_audience_reads.sql
-- (PR-R2A-1, EXPAND).
--
-- Drops the four routines EXPAND added: the two audience entry points, the
-- brief projection and the shared read predicate. EXPAND removed nothing, so
-- there is nothing to put back: the direct snapshot read, the row policies
-- and the subject's ledger policy were never touched by it.
--
-- ── REFUSES WHILE A LATER STEP DEPENDS ON THESE ─────────────────────────
--
-- If PR-R2A-3 (CONTRACT) has been applied, the two row policies evaluate
-- scp_report_snapshot_readable and the direct read is gone, so dropping the
-- entry points here would leave every released report unreadable by every
-- audience. Roll R2A-3 back first; this file checks both conditions.
--
-- If PR-R2A-2 (the application cutover) is live without R2A-3, the deployed
-- code calls these entry points: rolling EXPAND back then blanks every
-- report until the code is rolled back too. That is a deployment fact this
-- file cannot check -- confirm it before running. Nothing here touches a row.

DO $guard$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'ROLLBACK BLOCKED: the direct snapshot read is withdrawn (PR-R2A-3 CONTRACT is applied) and this file drops the only remaining audience read path. Roll R2A-3 back first.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots'
                AND qual LIKE '%scp_report_snapshot_readable%') THEN
    RAISE EXCEPTION 'ROLLBACK BLOCKED: a row policy on scp_report_snapshots evaluates scp_report_snapshot_readable (PR-R2A-3 is applied). Roll R2A-3 back first.';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.scp_participant_report(uuid);
DROP FUNCTION IF EXISTS public.scp_employer_report(uuid);
DROP FUNCTION IF EXISTS public.scp_audience_brief(jsonb);
DROP FUNCTION IF EXISTS public.scp_report_snapshot_readable(text, uuid, uuid);

DO $proof$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('scp_participant_report', 'scp_employer_report',
                                  'scp_audience_brief', 'scp_report_snapshot_readable')) THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_ROLLBACK: an entry point survived';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_ROLLBACK: the direct read must still be in place';
  END IF;
END
$proof$;
