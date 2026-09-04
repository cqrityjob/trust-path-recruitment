-- Rollback for 20261026090000_scp_trust_evidence_report_r2a_contract.sql
-- (PR-R2A-3, CONTRACT).
--
-- Restores the pre-CONTRACT EXPAND state exactly, and nothing older:
--
--   * SELECT on scp_report_snapshots back to authenticated, bounded by the
--     two row policies restored to their 20260808090000 inline predicates;
--   * scp_evidence_own_select restored verbatim from 20260804061230 -- the
--     participant's direct read of their own evidence-ledger rows, which is
--     R0-X2 reinstated;
--   * the ledger's authenticated SELECT and service_role ALL as before.
--
-- It does NOT touch scp_participant_report, scp_employer_report,
-- scp_report_snapshot_readable or scp_audience_brief: the R2A-1 contracts and
-- the #182 LEFT JOIN continuity stay exactly as they are, so every report --
-- historical orphans included -- stays readable through them while the
-- direct read is back.
--
-- What it reinstates is the R0-X1 / R0-X2 / R0-X3 exposure. That is what a
-- rollback is; run it only to unblock a genuine regression, and re-apply
-- CONTRACT afterwards. Nothing here touches a row. It does not re-grant the
-- hosted default-privilege leftovers (TRUNCATE and friends), which no
-- migration in this repository ever granted.

-- Policies first: after CONTRACT they depend on the predicate function, and
-- the inline form is what EXPAND left in place.
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

GRANT SELECT ON public.scp_report_snapshots    TO authenticated;
GRANT SELECT ON public.scp_competency_evidence TO authenticated;
GRANT ALL    ON public.scp_report_snapshots    TO service_role;
GRANT ALL    ON public.scp_competency_evidence TO service_role;

DO $proof$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_ROLLBACK: the direct read was not restored';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots'
         AND qual LIKE '%scp_report_snapshot_readable%') <> 0
     OR (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'scp_competency_evidence' AND policyname = 'scp_evidence_own_select') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_ROLLBACK: the EXPAND-state policies were not restored';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
         AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') <> 2 THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_ROLLBACK: the #182 continuity contracts must be untouched';
  END IF;
END
$proof$;
