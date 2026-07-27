-- =============================================================================
-- Assessment invitation email — duplicate-send protection (safe minimum).
--
-- Found during pre-merge review of the email delivery fix (checklist item
-- 12: "retrying or refreshing cannot unintentionally send repeated
-- invitation emails"). createAssessmentAssignment has no idempotency key
-- on CREATION (unlike completion, which already has completion_id) -- a
-- double-click, a resubmit-after-timeout, or two browser tabs could each
-- insert a second row for the same recipient/assessment/employer and
-- send a second email. The assign-form's submit button is already
-- disabled while the mutation is pending (client-side first line of
-- defense, unchanged here) -- this migration adds the real, database-
-- level guarantee.
--
-- Exactly mirrors the already-applied, already-proven job_applications
-- pattern (20260720150000_h3_4a_candidate_application_core.sql): a
-- partial unique index that blocks a second ACTIVE row for the same key,
-- while still allowing a brand-new assignment once the previous one is
-- no longer active (completed, expired, or cancelled) -- "assign
-- another assessment" to the same person after their first one finishes
-- keeps working exactly as it does today.
--
-- Additive only (one new index, no column/table change, no data
-- migration). Not expected to conflict with any existing row: this
-- table was introduced in this same work stream and has no production
-- traffic pattern that would have created a live duplicate; if it ever
-- did, this CREATE would simply fail loudly at apply time rather than
-- silently accept bad data, which is the correct, safe failure mode for
-- a uniqueness guarantee.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS assessment_assignments_active_unique_idx
  ON public.assessment_assignments (employer_id, assessment_id, recipient_email)
  WHERE status IN ('invited', 'opened', 'started');

COMMENT ON INDEX public.assessment_assignments_active_unique_idx IS
  'Partial unique index: blocks a second ACTIVE (invited/opened/started) '
  'assignment for the same employer+assessment+recipient combination -- '
  'the database-level duplicate-send guard for the assessment invitation '
  'email fix. A completed/expired/cancelled assignment does not count, '
  'so assigning the same person the same assessment again later (after '
  'their first one finishes) is unaffected.';
