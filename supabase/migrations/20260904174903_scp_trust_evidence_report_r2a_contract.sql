-- =============================================================================
-- TRUST Evidence Report — PR-R2A-3: CONTRACT
--
-- The last of three steps that close the audience exposures PR-R0 pinned
-- (R0-X1, R0-X2, R0-X3). The first two are live and verified on
-- wrygicdfxwjnrugduxnt:
--
--   R2A-1 EXPAND     20261024090000  the audience read contracts exist
--   R2A-2 CUTOVER    PR #181/#182    the application reads only through them;
--                                    20261025090000 keeps historical reports
--                                    readable when their template row is gone
--   R2A-3 CONTRACT   this file       the legacy direct paths are withdrawn
--
-- ── DEPLOY PRECONDITION (a deployment fact no repo file can check) ────────
--
-- The application that calls scp_participant_report / scp_employer_report
-- must be LIVE before this is applied. It is: PR #181 deployed at ac4bdcb,
-- PR #182 at 28ea3b3, both verified by the Product Owner against a released
-- candidate report, an employer report and an Interview Intelligence
-- briefing. Applied against the previous application, every released report
-- would read as "not released" until the code caught up. The rollback
-- restores the read.
--
-- ── WHAT THIS FILE DOES ───────────────────────────────────────────────────
--
--   1. Withdraws the direct SELECT on scp_report_snapshots from
--      authenticated. Row-level security decided WHICH ROW an audience could
--      read; the grant covered EVERY COLUMN, and a signed-in caller with the
--      publishable key could select derivation_input on their own row
--      (R0-X1, R0-X3) and the stored brief with its mean/spread. After this,
--      an audience reaches a snapshot only through the two entry points,
--      which project exactly the released document.
--
--   2. Re-points the two row policies at scp_report_snapshot_readable, the
--      predicate R2A-1 introduced verbatim from those policies. Same rows by
--      construction; now ONE definition, evaluated by the policies and both
--      entry points. The policies stay as defence in depth: with no table
--      privilege they decide nothing for authenticated, but a future re-grant
--      of SELECT would still be bounded to the audience's own rows.
--
--   3. Drops scp_evidence_own_select (R0-X2). The subject could select their
--      own evidence-ledger rows in full -- contribution, confidence, the
--      reviewer's rubric basis, the safety finding and its severity, all with
--      disclosure_class = 'internal_employer', which the policy never read.
--      No product surface reads the ledger directly (guard G4), every routine
--      that reads it is SECURITY DEFINER, and the participant's report is the
--      audience document. The author read (20260821090000) stays exactly as
--      it is; the review and release workflow is untouched.
--
--   4. Makes the grant set on the two tables explicit. A clean replay shows
--      authenticated holding SELECT only, but the hosted project created both
--      tables under default privileges that hand anon and authenticated the
--      full set -- TRUNCATE included, which neither RLS nor the append-only
--      triggers bound. REVOKE ALL then re-grant exactly what is used: nothing
--      to anon, SELECT on the ledger to authenticated (for the author policy),
--      nothing on the snapshots to authenticated, ALL to service_role. The
--      owner is untouched. Only these two tables; this is not a platform sweep.
--
-- ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────
--
-- It does not touch either entry point, the predicate or scp_audience_brief:
-- the #182 LEFT JOIN continuity stays, the 16 historical reports stay
-- readable, the projections stay identical. It introduces no object. It
-- writes, rewrites and deletes no row. No scoring, maturity, competency,
-- item, template, report content or Interview Intelligence change.
--
-- Rollback: supabase/rollback/20261026090000_scp_trust_evidence_report_r2a_contract_rollback.sql
-- restores the pre-CONTRACT EXPAND state exactly.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §0  Refuse unless the ground this stands on is there
-- ═══════════════════════════════════════════════════════════════════════════

DO $pre$
DECLARE _fn text;
BEGIN
  FOR _fn IN SELECT unnest(ARRAY['scp_participant_report','scp_employer_report']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn AND p.prosecdef
                      AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%'
                      AND p.prosrc LIKE '%scp_report_snapshot_readable%') THEN
      RAISE EXCEPTION 'SCP_R2A_CONTRACT_PRECONDITION: %() is missing, or is not the #182 continuity definition (20261024090000 + 20261025090000 must be applied first)', _fn;
    END IF;
    IF NOT has_function_privilege('authenticated', ('public.' || _fn || '(uuid)')::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_R2A_CONTRACT_PRECONDITION: authenticated cannot execute %() -- withdrawing the direct read now would leave no audience read path', _fn;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_report_snapshot_readable' AND p.prosecdef) THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PRECONDITION: scp_report_snapshot_readable is missing';
  END IF;
END
$pre$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The row policies evaluate the one audience rule
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS scp_report_snapshots_own ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_own ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (audience = 'participant'
         AND public.scp_report_snapshot_readable(audience, subject_id, issuer_organization_id));

DROP POLICY IF EXISTS scp_report_snapshots_employer ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_employer ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (audience = 'employer'
         AND public.scp_report_snapshot_readable(audience, subject_id, issuer_organization_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  R0-X2 — the participant's direct ledger read
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS scp_evidence_own_select ON public.scp_competency_evidence;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  Table privileges: exactly what is used, on these two tables only
-- ═══════════════════════════════════════════════════════════════════════════

-- REVOKE ALL then re-grant, rather than revoking a named list: the inherited
-- set is whatever the default privileges happened to include when the table
-- was created hosted, and a named list silently misses anything else in it.
REVOKE ALL ON public.scp_report_snapshots    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_competency_evidence FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.scp_competency_evidence TO authenticated;   -- author policy only
-- scp_report_snapshots: nothing to authenticated. R0-X1 / R0-X3 close here.

GRANT ALL ON public.scp_report_snapshots    TO service_role;
GRANT ALL ON public.scp_competency_evidence TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE _fn text; _priv text; _src text;
BEGIN
  -- The direct read is gone for every audience role, at table and column level.
  IF has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT')
     OR EXISTS (SELECT 1 FROM information_schema.table_privileges
                 WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
                   AND grantee IN ('authenticated','anon','PUBLIC'))
     OR EXISTS (SELECT 1 FROM information_schema.column_privileges
                 WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
                   AND grantee IN ('authenticated','anon','PUBLIC')) THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: an audience role still holds a privilege on scp_report_snapshots';
  END IF;

  -- The ledger: authenticated SELECT and nothing else; anon nothing.
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO _priv
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'scp_competency_evidence' AND grantee = 'authenticated';
  IF _priv IS DISTINCT FROM 'SELECT' THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: authenticated holds [%] on scp_competency_evidence, expected SELECT only', _priv;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE table_schema = 'public' AND table_name = 'scp_competency_evidence'
                AND grantee IN ('anon','PUBLIC')) THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: anon/PUBLIC holds a privilege on scp_competency_evidence';
  END IF;

  -- The backend keeps what it needs.
  IF NOT has_table_privilege('service_role', 'public.scp_report_snapshots', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.scp_report_snapshots', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.scp_competency_evidence', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: service_role lost a required privilege';
  END IF;

  -- The policies: two on the snapshots, both on the canonical predicate; the
  -- subject's ledger policy gone, the author read present.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') <> 2
     OR (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots'
            AND policyname IN ('scp_report_snapshots_own','scp_report_snapshots_employer')
            AND qual LIKE '%scp_report_snapshot_readable%') <> 2 THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: the snapshot row policies do not both evaluate scp_report_snapshot_readable';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename = 'scp_competency_evidence' AND policyname = 'scp_evidence_own_select') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: scp_evidence_own_select survived';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                  AND tablename = 'scp_competency_evidence' AND policyname = 'scp_evidence_author_read') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: the author read policy is missing -- the review workflow would lose its ledger read';
  END IF;

  -- The safe contract is untouched: definer, pinned, continuity LEFT JOIN,
  -- predicate-gated, grants exact, projections exclude the forbidden fields.
  FOR _fn IN SELECT unnest(ARRAY['scp_participant_report','scp_employer_report']) LOOP
    SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn AND p.prosecdef
       AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
    IF _src IS NULL OR _src NOT LIKE '%LEFT JOIN public.scp_report_versions%'
       OR _src NOT LIKE '%scp_report_snapshot_readable%'
       OR _src NOT LIKE '%scp_audience_brief%'
       OR _src LIKE '%s.derivation_input%' THEN
      RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: %() is not the expected definer, continuity-joined, predicate-gated, stripped projection', _fn;
    END IF;
    IF has_function_privilege('anon', ('public.' || _fn || '(uuid)')::regprocedure, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', ('public.' || _fn || '(uuid)')::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: EXECUTE on %() is not authenticated-only', _fn;
    END IF;
  END LOOP;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report';
  IF _src LIKE '%''behaviour_version_id''%' OR _src NOT LIKE '%''finding''%' THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: the employer projection changed shape';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_participant_report';
  IF _src NOT LIKE '%''[]''::jsonb%' THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: the participant projection no longer pins safety_flags to []';
  END IF;
  IF has_function_privilege('authenticated', 'public.scp_audience_brief(jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_audience_brief(jsonb)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_report_snapshot_readable(text,uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: helper grants moved';
  END IF;

  -- The release path still exists and still inserts snapshots as a definer.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_release_attempt_report' AND p.prosecdef
                    AND p.prosrc LIKE '%INSERT INTO public.scp_report_snapshots%') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTRACT_PROOF: the release function is not a definer that writes snapshots';
  END IF;
END
$proof$;
