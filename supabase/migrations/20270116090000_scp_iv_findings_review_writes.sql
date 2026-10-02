-- =============================================================================
-- P1-C -- only an owner or admin reviews an interview finding, only its review
-- fields, and the database records who did it
-- =============================================================================
--
-- THE DEFECT (2026-10-02 full re-audit, P1-C, confirmed from grants, policy
-- and triggers):
--
--   scp_interview_findings holds what an interview case still has to settle:
--   gaps, unclear points, differences between sources. authenticated held
--   UPDATE on EVERY column, and the only row rule
--   (scp_interview_findings_update) was scp_iv_can_write_case(case_id) --
--   any member of the employer, plain members included. The two triggers
--   check only that a finding cites its own case and pinned pack.
--
--   The report builder (scp_iv_finalise_report, scp_iv_build_report_basis)
--   lists a finding as unresolved only while resolution_state is open,
--   needs_verification or unresolved_difference. So a plain member could:
--     - set resolution_state = 'resolved' or 'not_relevant' and drop a
--       finding from the report an owner or admin then finalises;
--     - rewrite statement, finding_kind, claim_class or the cited source --
--       the AI run's recorded output;
--     - write human_actor_id / human_actor_at to attribute the review to
--       somebody else.
--   Finalising a report already requires an owner or admin
--   (SCP_IV_FINALISE_ROLE); settling what goes into it did not.
--
-- THE FIX (three layers; hosted has 0 findings, so nothing to repair):
--   1. Privileges. UPDATE on the table is revoked from client roles and
--      granted back on the three review columns only: resolution_state,
--      human_state, human_note. Statement, kind, class, rationale, citations,
--      run, case, attribution and timestamps are not client-writable.
--   2. Policy. scp_interview_findings_update additionally requires an owner or
--      admin of the case's employer -- the same bar as finalising the report.
--   3. Attribution. A BEFORE UPDATE trigger stamps human_actor_id = auth.uid()
--      and human_actor_at = now() whenever a review column changes, so the
--      record of who settled a finding is the database's, not the caller's.
--
-- NOT CHANGED: reading findings (scp_interview_findings_read); recording them
-- (scp_iv_record_findings, a SECURITY DEFINER insert); the report builders;
-- the existing citation triggers; any row. No application code writes this
-- table (src/lib/interview-intelligence/runtime.functions.ts only reads it).
--
-- Rollback: supabase/rollback/20270116090000_scp_iv_findings_review_writes_rollback.sql
-- Suite:    supabase/tests/scp_iv_findings_review_writes_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.scp_interview_findings') IS NULL
     OR to_regprocedure('public.scp_iv_can_write_case(uuid)') IS NULL
     OR to_regprocedure('public.scp_iv_case_employer(uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'scp_interview_findings'
                     AND policyname = 'scp_interview_findings_update') THEN
    RAISE EXCEPTION 'SCP_IV_FINDINGS_PRECONDITION: the findings table, its update policy or a case helper is missing';
  END IF;
END $$;

-- ── 1. Privileges: the three review columns only ──────────────────────────
REVOKE UPDATE ON public.scp_interview_findings FROM PUBLIC, anon, authenticated;
GRANT UPDATE (resolution_state, human_state, human_note)
  ON public.scp_interview_findings TO authenticated;

-- ── 2. Policy: an owner or admin of the case's employer ──────────────────
ALTER POLICY scp_interview_findings_update ON public.scp_interview_findings
  USING (public.scp_iv_can_write_case(case_id)
         AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(case_id),
                                      ARRAY['owner','admin']))
  WITH CHECK (public.scp_iv_can_write_case(case_id)
              AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(case_id),
                                           ARRAY['owner','admin']));

-- ── 3. Attribution: the database records who reviewed a finding ─────────
CREATE OR REPLACE FUNCTION public.scp_iv_stamp_finding_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A review column changed: the reviewer is the caller, now. A client cannot
  -- write either column (they are not in its UPDATE grant); this sets them.
  -- With no caller (a maintenance write as the table owner or service role)
  -- the row is left as written.
  IF (NEW.resolution_state IS DISTINCT FROM OLD.resolution_state
      OR NEW.human_state IS DISTINCT FROM OLD.human_state
      OR NEW.human_note IS DISTINCT FROM OLD.human_note)
     AND auth.uid() IS NOT NULL THEN
    NEW.human_actor_id := auth.uid();
    NEW.human_actor_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_iv_stamp_finding_review() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_interview_findings_review_stamp ON public.scp_interview_findings;
CREATE TRIGGER scp_interview_findings_review_stamp
  BEFORE UPDATE ON public.scp_interview_findings
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_stamp_finding_review();

-- ── 4. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _c text;
BEGIN
  IF has_table_privilege('authenticated', 'public.scp_interview_findings', 'UPDATE') THEN
    RAISE EXCEPTION 'SCP_IV_FINDINGS_PROOF: authenticated still holds table-level UPDATE';
  END IF;
  FOREACH _c IN ARRAY ARRAY['resolution_state', 'human_state', 'human_note'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.scp_interview_findings', _c, 'UPDATE') THEN
      RAISE EXCEPTION 'SCP_IV_FINDINGS_PROOF: authenticated cannot update review column %', _c;
    END IF;
  END LOOP;
  FOREACH _c IN ARRAY ARRAY['id', 'case_id', 'ai_run_id', 'finding_kind', 'statement', 'rationale',
                            'question_id', 'verification_rule_id', 'claim_class', 'source_passage_id',
                            'human_actor_id', 'human_actor_at', 'created_at'] LOOP
    IF has_column_privilege('authenticated', 'public.scp_interview_findings', _c, 'UPDATE')
       OR has_column_privilege('anon', 'public.scp_interview_findings', _c, 'UPDATE') THEN
      RAISE EXCEPTION 'SCP_IV_FINDINGS_PROOF: a client role may update %', _c;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                  AND tablename = 'scp_interview_findings' AND policyname = 'scp_interview_findings_update'
                  AND qual LIKE '%owner%admin%' AND with_check LIKE '%owner%admin%') THEN
    RAISE EXCEPTION 'SCP_IV_FINDINGS_PROOF: the update policy does not require an owner or admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'scp_interview_findings_review_stamp'
                  AND tgrelid = 'public.scp_interview_findings'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'SCP_IV_FINDINGS_PROOF: the attribution trigger is missing';
  END IF;
  RAISE NOTICE 'SCP_IV_FINDINGS_PROOF ok: only owners/admins review findings, only the review columns, and the database records who';
END $$;
