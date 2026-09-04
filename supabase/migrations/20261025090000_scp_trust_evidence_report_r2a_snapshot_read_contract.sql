-- =============================================================================
-- TRUST Evidence Report — PR-R2A audience boundary hardening, PHASE 2 of 2:
-- CONTRACT
--
-- Withdraws the direct authenticated read of public.scp_report_snapshots.
-- After this file, the only way a participant or an employer member reaches a
-- report snapshot is scp_participant_report(uuid) / scp_employer_report(uuid)
-- from 20261024090000 (EXPAND), which project the audience document and
-- nothing internal. That is what closes R0-X1 and R0-X3 at the row: the row
-- an audience could read no longer exists for that audience.
--
-- ── DEPLOY PRECONDITION (a deployment fact no repo file can check) ────────
--
-- The application code that calls the two entry points -- getAcademyReport
-- in src/lib/security-competency/academy-employer.functions.ts and
-- readAssessment in src/lib/interview-intelligence/context.functions.ts --
-- must be LIVE before this is applied. Applied against the previous code,
-- every released report reads as "not released" (getAcademyReport returned
-- null on any error) and the Interview Intelligence briefing loses its
-- assessment context, until the code catches up. Nothing is lost or written;
-- it is a blank, not a corruption. Roll this file back
-- (supabase/rollback/20261025090000_..._rollback.sql) to restore the read
-- while the code deploys, then re-apply.
--
-- ── WHAT STAYS ────────────────────────────────────────────────────────────
--
-- The two row policies stay in place. With no table privilege they decide
-- nothing for authenticated any more, but a future re-grant of SELECT would
-- still be bounded to the audience's own rows rather than to every row, and
-- the policies are where the audience rule is visible to a reader of
-- pg_policies. service_role keeps ALL (it bypasses RLS and is the
-- server-side path); postgres owns the table.
--
-- This file introduces no object. It refuses to run unless EXPAND is in place,
-- because a snapshot table nobody can read through any path is the outage the
-- phase split exists to prevent.
-- =============================================================================

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_participant_report')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report') THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_MISSING: apply 20261024090000 (the audience entry points) before withdrawing the direct snapshot read.';
  END IF;
END
$pre$;

REVOKE SELECT ON public.scp_report_snapshots FROM authenticated;

DO $proof$
BEGIN
  IF has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
     OR EXISTS (SELECT 1 FROM information_schema.table_privileges
                 WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
                   AND grantee IN ('authenticated', 'anon', 'PUBLIC'))
     OR EXISTS (SELECT 1 FROM information_schema.column_privileges
                 WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
                   AND grantee IN ('authenticated', 'anon', 'PUBLIC')) THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: an audience role still holds a privilege on scp_report_snapshots';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: service_role lost its read of scp_report_snapshots';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') <> 2 THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: the two audience row policies must stay in place';
  END IF;
END
$proof$;
