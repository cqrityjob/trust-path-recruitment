-- ============================================================================
-- PHASE B ROLLBACK — prepared BEFORE execution, from the captured production state
--
-- Database:  zrahptwsnjcdyzfywbeh
-- Lovable:   9ec625ef-34a1-4b4b-8cbb-712cae168579
-- Captured:  19 August 2026, immediately before
--            20260821090000_scp_pilot_security_gate was applied.
-- Ledger at capture: 98
--
-- HOW TO USE: apply this as a NEW tracked Lovable migration. Never delete
-- hosted ledger history, and never "un-apply" the gate by removing its row.
--
-- ── WHAT THIS RESTORES ─────────────────────────────────────────────────
-- The exact pre-Phase-B authorisation state, read from pg_policies and
-- pg_proc.proacl on the live database.
--
-- ── WHAT THIS MUST NOT DO — READ THIS FIRST ────────────────────────────
--
-- scp_attempt_maturity and scp_attempt_evidence_state BELONG TO C2, which is
-- already applied and is NOT being rolled back. Phase B only REVOKES EXECUTE
-- on them; it does not create them.
--
--   * This rollback RESTORES their EXECUTE grant.
--   * This rollback MUST NOT DROP THEM. Dropping them would silently undo C2
--     and break scp_release_attempt_report, which calls both.
--
-- The same applies to scp_compute_maturity and scp_display_evidence_state:
-- restore the grant, never drop the function.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Restore the four author-write policies (exposure A pre-state)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS scp_attempts_author_read        ON public.scp_attempts;
DROP POLICY IF EXISTS scp_responses_author_read       ON public.scp_candidate_responses;
DROP POLICY IF EXISTS scp_evidence_author_read        ON public.scp_competency_evidence;
DROP POLICY IF EXISTS scp_human_reviews_author_read   ON public.scp_human_reviews;

CREATE POLICY scp_attempts_author_write ON public.scp_attempts
  FOR ALL TO authenticated
  USING (scp_can_author(auth.uid()))
  WITH CHECK (scp_can_author(auth.uid()));

CREATE POLICY scp_responses_author_write ON public.scp_candidate_responses
  FOR ALL TO authenticated
  USING (scp_can_author(auth.uid()))
  WITH CHECK (scp_can_author(auth.uid()));

CREATE POLICY scp_evidence_author_write ON public.scp_competency_evidence
  FOR ALL TO authenticated
  USING (scp_can_author(auth.uid()))
  WITH CHECK (scp_can_author(auth.uid()));

CREATE POLICY scp_human_reviews_author_only ON public.scp_human_reviews
  FOR ALL TO authenticated
  USING (scp_can_author(auth.uid()))
  WITH CHECK (scp_can_author(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Restore the assignment policies (exposure B pre-state, NULL::text[])
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS assignments_employer_insert ON public.assessment_assignments;
CREATE POLICY assignments_employer_insert ON public.assessment_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    has_employer_role(auth.uid(), employer_id, NULL::text[])
    AND employer_is_active_status(employer_id)
    AND (assigned_by = auth.uid()));

DROP POLICY IF EXISTS assignments_employer_update ON public.assessment_assignments;
CREATE POLICY assignments_employer_update ON public.assessment_assignments
  FOR UPDATE TO authenticated
  USING (
    has_employer_role(auth.uid(), employer_id, NULL::text[])
    AND employer_members_can_edit(employer_id))
  WITH CHECK (
    has_employer_role(auth.uid(), employer_id, NULL::text[])
    AND employer_members_can_edit(employer_id));

-- Restore the full table-level UPDATE grant the gate narrowed to two columns.
REVOKE UPDATE (status, cancelled_at) ON public.assessment_assignments FROM authenticated;
GRANT  UPDATE ON public.assessment_assignments TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Restore EXECUTE (exposure C pre-state) — GRANT ONLY, NEVER DROP
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.scp_display_evidence_state(uuid, uuid, text)          TO authenticated;
-- C2-owned. Restore the grant C2 made; do not drop these functions.
GRANT EXECUTE ON FUNCTION public.scp_attempt_maturity(uuid, uuid, text, timestamptz)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.scp_attempt_evidence_state(uuid, uuid, text)          TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Remove ONLY Phase-B-owned lifecycle objects (exposure D pre-state)
-- ---------------------------------------------------------------------------
DROP INDEX  IF EXISTS public.scp_assignments_one_open_per_subject_idx;

DROP TRIGGER IF EXISTS scp_assignments_mark_open_trg      ON public.assessment_assignments;
DROP TRIGGER IF EXISTS scp_assignments_clear_open_trg     ON public.scp_attempts;
DROP TRIGGER IF EXISTS scp_assignments_one_open_trg       ON public.assessment_assignments;
DROP TRIGGER IF EXISTS scp_assignments_terminal_sync_trg  ON public.assessment_assignments;

DROP FUNCTION IF EXISTS public.scp_mark_assignment_open();
DROP FUNCTION IF EXISTS public.scp_clear_assignment_open();
DROP FUNCTION IF EXISTS public.scp_guard_one_open_assignment();
DROP FUNCTION IF EXISTS public.scp_sync_assignment_terminal_status();

ALTER TABLE public.assessment_assignments DROP COLUMN IF EXISTS scp_open;

COMMIT;

-- ============================================================================
-- POST-ROLLBACK VERIFICATION
-- ============================================================================
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE tablename IN ('scp_attempts','scp_candidate_responses',
--                      'scp_competency_evidence','scp_human_reviews')
--  ORDER BY tablename;                      -- EXPECT cmd = ALL on all four
--
-- SELECT has_function_privilege('authenticated',
--   'public.scp_attempt_maturity(uuid,uuid,text,timestamptz)','EXECUTE');  -- true
-- SELECT to_regprocedure('public.scp_attempt_maturity(uuid,uuid,text,timestamptz)')
--        IS NOT NULL;                                                      -- true (C2 intact)
-- SELECT to_regprocedure('public.scp_release_attempt_report(uuid)') IS NOT NULL; -- true
--
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_name='assessment_assignments' AND column_name='scp_open';   -- 0
--
-- Row-count invariants that must be unchanged by rollback:
--   assessment_assignments 6 · scp_attempts 2 (1 released, 1 in_progress)
--   scp_candidate_responses 7 · scp_human_reviews 1 · scp_competency_evidence 4
--   scp_report_snapshots 2 · cd_sessions 40 · cd_report_snapshots 22 · jobs 15
-- ============================================================================
