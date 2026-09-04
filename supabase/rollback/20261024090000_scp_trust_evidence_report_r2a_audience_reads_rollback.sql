-- Rollback for 20261024090000_scp_trust_evidence_report_r2a_audience_reads.sql
-- (PR-R2A, EXPAND phase).
--
-- ── RUN THE CONTRACT ROLLBACK FIRST ──────────────────────────────────────
--
--   supabase/rollback/20261025090000_scp_trust_evidence_report_r2a_snapshot_read_contract_rollback.sql
--
-- This file drops the two audience entry points. While CONTRACT is still
-- applied they are the ONLY read path an audience has to a report snapshot,
-- so running this alone would leave every released report unreadable by
-- everyone but the server. It refuses in that state (ROLLBACK BLOCKED).
--
-- ── WHAT IT PUTS BACK ────────────────────────────────────────────────────
--
--   * the two snapshot row policies with their original inline predicates
--     (20260808090000), then the shared predicate function is dropped;
--   * scp_evidence_own_select (20260804061230) -- the participant's direct
--     read of their own evidence ledger rows, which is R0-X2 reinstated;
--   * scp_audience_brief, scp_participant_report, scp_employer_report dropped.
--
-- ── WHAT IT DELIBERATELY DOES NOT PUT BACK ───────────────────────────────
--
-- The privileges the hosted default grants had handed anon and authenticated
-- on scp_report_snapshots, scp_competency_evidence,
-- scp_employer_report_decisions and scp_interview_notes -- INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER. No migration in this repository
-- ever granted them; EXPAND revoked a leftover, and a rollback restores what
-- the repository defined: SELECT for authenticated, ALL for service_role.
-- Nothing here touches a row.

DO $guard$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'ROLLBACK BLOCKED: 20261025090000 (CONTRACT) is still applied -- authenticated has no direct read of scp_report_snapshots, and this file drops the entry points. Run the contract rollback first.';
  END IF;
END
$guard$;

-- Policies first: they depend on the predicate function.
DROP POLICY IF EXISTS scp_report_snapshots_own ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_own ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (
    audience = 'participant'
    AND EXISTS (SELECT 1 FROM public.scp_subject_identities si
                 WHERE si.subject_id = scp_report_snapshots.subject_id
                   AND si.user_id = auth.uid()));

DROP POLICY IF EXISTS scp_report_snapshots_employer ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_employer ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (
    audience = 'employer'
    AND issuer_organization_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.employer_memberships m
                 WHERE m.employer_id = scp_report_snapshots.issuer_organization_id
                   AND m.user_id = auth.uid()
                   AND m.status = 'active'));

DROP POLICY IF EXISTS scp_evidence_own_select ON public.scp_competency_evidence;
CREATE POLICY scp_evidence_own_select ON public.scp_competency_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.scp_subject_identities i
             WHERE i.subject_id = scp_competency_evidence.subject_id
               AND i.user_id = auth.uid())
    OR public.scp_can_author(auth.uid()));

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
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'scp_competency_evidence'
                     AND policyname = 'scp_evidence_own_select') THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_ROLLBACK: the original policies were not restored';
  END IF;
END
$proof$;
