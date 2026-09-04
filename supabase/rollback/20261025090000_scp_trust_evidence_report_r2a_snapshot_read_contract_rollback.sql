-- Rollback for 20261025090000_scp_trust_evidence_report_r2a_snapshot_read_contract.sql
-- (PR-R2A, CONTRACT phase).
--
-- Restores the direct SELECT on public.scp_report_snapshots to authenticated,
-- bounded as before by the two row policies (which CONTRACT never removed).
-- Run this FIRST if the EXPAND rollback is also needed: the EXPAND rollback
-- refuses while this grant is absent, because it drops the entry points and
-- a table with no read path at all is the outage the phase split prevents.
--
-- What it reinstates is the R0-X1 / R0-X3 exposure: a signed-in audience can
-- again select every column of its own row, derivation_input included, and
-- the employer brief's mean/spread reach the client. That is what a rollback
-- is; run it only to unblock a deploy-order mistake, and re-apply CONTRACT
-- once the migrated code is live. Nothing here touches a row.

GRANT SELECT ON public.scp_report_snapshots TO authenticated;

DO $proof$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_ROLLBACK: the direct read was not restored';
  END IF;
END
$proof$;
