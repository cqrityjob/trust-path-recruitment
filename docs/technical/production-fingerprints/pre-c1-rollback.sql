-- ============================================================================
-- C1 ROLLBACK — prepared BEFORE execution
--
-- Database:  zrahptwsnjcdyzfywbeh
-- Lovable:   9ec625ef-34a1-4b4b-8cbb-712cae168579
-- Captured:  19 August 2026, immediately before
--            20260820120000_scp_employer_report_decisions was applied.
-- Ledger at capture: 99
--
-- HOW TO USE: apply as a NEW tracked Lovable migration. Never delete hosted
-- ledger history.
--
-- ── THE HARD PRECONDITION ──────────────────────────────────────────────
--
-- This rollback is permitted ONLY while scp_employer_report_decisions is
-- EMPTY. Every row in it is an employer's documented conclusion about a named
-- person, recorded append-only precisely so it cannot be quietly removed.
-- Dropping the table with rows in it would destroy exactly the evidence the
-- table exists to preserve.
--
-- The guard below refuses rather than trusting whoever runs this.
--
-- ── WHY C1 IS THE CLEANEST ROLLBACK OF THE THREE ───────────────────────
--
-- C1 is purely additive. It creates one table, two indexes, one policy, one
-- guard trigger and three functions. It modifies no existing policy, no
-- existing grant, no existing function and no existing row. So the rollback is
-- a drop of exactly what it made, and nothing else can regress.
-- ============================================================================

DO $$
DECLARE _n int;
BEGIN
  IF to_regclass('public.scp_employer_report_decisions') IS NULL THEN
    RAISE NOTICE 'C1 rollback: table already absent, nothing to do.';
    RETURN;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_employer_report_decisions;
  IF _n > 0 THEN
    RAISE EXCEPTION
      'C1_ROLLBACK_REFUSED: scp_employer_report_decisions holds % employer '
      'decision row(s). These are documented decisions about real people and '
      'are append-only by design. Rollback is permitted only while the table '
      'is empty. STOP and obtain an explicit owner decision.', _n
      USING ERRCODE = 'check_violation';
  END IF;

  -- Empty: safe to unwind.
  EXECUTE 'DROP TRIGGER IF EXISTS scp_employer_decisions_append_only ON public.scp_employer_report_decisions';
  EXECUTE 'DROP TABLE IF EXISTS public.scp_employer_report_decisions CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.scp_guard_decision_append_only()';
  EXECUTE 'DROP FUNCTION IF EXISTS public.scp_record_employer_decision(uuid, text, text, text, text, text, uuid)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.scp_employer_decisions(uuid)';

  RAISE NOTICE 'C1 rollback complete: table was empty, all C1-owned objects removed.';
END $$;

-- ============================================================================
-- OBJECTS THIS ROLLBACK REMOVES — and nothing else
-- ============================================================================
--   table     public.scp_employer_report_decisions
--   indexes   scp_employer_report_decisions_attempt_idx
--             scp_employer_report_decisions_supersedes_once   (dropped with the table)
--   policy    scp_employer_decisions_member_read              (dropped with the table)
--   trigger   scp_employer_decisions_append_only              (dropped with the table)
--   functions scp_guard_decision_append_only()
--             scp_record_employer_decision(uuid,text,text,text,text,text,uuid)
--             scp_employer_decisions(uuid)
--
-- MUST NOT be touched by this rollback:
--   scp_attempts, scp_report_snapshots, scp_competency_evidence,
--   scp_human_reviews, assessment_assignments, employers, employer_memberships
--   — C1 only references them, it never modifies them.
--   C2 (scp_attempt_maturity, scp_attempt_evidence_state,
--   scp_release_attempt_report) and Phase B (policies, grants, scp_open) are
--   unrelated to C1 and must survive its rollback untouched.
--
-- ============================================================================
-- PRE-C1 STATE (for post-rollback comparison)
-- ============================================================================
--   ledger 99 · report snapshots 2 (md5 c4a1336ccc441f5bd9e4415774cb6dd0)
--   attempts 2 · evidence 4 · human reviews 1 · assignments 6
-- ============================================================================
