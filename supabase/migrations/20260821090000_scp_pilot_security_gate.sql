-- Phase 8.5A — the four pre-pilot security findings, closed.
--
-- Additive only. No previously applied migration is edited, no domain or
-- historical row is deleted, and nothing about scoring, thresholds, report
-- meaning or released snapshots changes. The only backfill writes the new
-- derived lifecycle flag from exact attempt lineage. Every change here is about
-- WHO MAY DO WHAT.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FINDING 1 — direct PostgREST writes to attempts, responses and evidence
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four policies were `FOR ALL`:
--
--   scp_attempts_author_write      USING scp_can_author(auth.uid())
--   scp_responses_author_write     USING scp_can_author(auth.uid())
--   scp_evidence_author_write      USING scp_can_author(auth.uid())
--   scp_human_reviews_author_only  USING scp_can_author(auth.uid())
--
-- scp_can_author() is true for any holder of editor/reviewer/publisher, and for
-- platform admins. A reviewer needs those rows to REVIEW; the policies also let
-- them INSERT fabricated evidence, UPDATE an attempt's lifecycle, or DELETE a
-- participant's responses straight through PostgREST, with every RPC gate --
-- ownership checks, severity requirements, submit completeness -- bypassed.
--
-- The append-only and immutability triggers were the only thing standing in the
-- way, and they guard mutation of existing rows, not creation of new ones.
--
-- Participants and employers were never the problem here: they hold SELECT-only
-- policies already, and those are left exactly as they are.
--
-- The fix is to make the author policies read-only. Every legitimate write path
-- is a SECURITY DEFINER function owned by postgres -- scp_save_response,
-- scp_submit_attempt, scp_complete_human_review, scp_release_attempt_report,
-- scp_employer_assign -- and a definer function runs as its owner, so RLS on
-- these tables does not apply to it. Removing the write policy therefore closes
-- the direct path without touching a single legitimate flow.

DROP POLICY IF EXISTS scp_attempts_author_write ON public.scp_attempts;
CREATE POLICY scp_attempts_author_read ON public.scp_attempts
  FOR SELECT TO authenticated USING (public.scp_can_author(auth.uid()));

DROP POLICY IF EXISTS scp_responses_author_write ON public.scp_candidate_responses;
CREATE POLICY scp_responses_author_read ON public.scp_candidate_responses
  FOR SELECT TO authenticated USING (public.scp_can_author(auth.uid()));

DROP POLICY IF EXISTS scp_evidence_author_write ON public.scp_competency_evidence;
CREATE POLICY scp_evidence_author_read ON public.scp_competency_evidence
  FOR SELECT TO authenticated USING (public.scp_can_author(auth.uid()));

DROP POLICY IF EXISTS scp_human_reviews_author_only ON public.scp_human_reviews;
CREATE POLICY scp_human_reviews_author_read ON public.scp_human_reviews
  FOR SELECT TO authenticated USING (public.scp_can_author(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- FINDING 2 — the legacy assignment path accepted a broader role
-- ═══════════════════════════════════════════════════════════════════════════
--
-- assignments_employer_insert and assignments_employer_update called
--
--   has_employer_role(auth.uid(), employer_id, NULL::text[])
--
-- and a NULL role array means ANY active membership. So an ordinary `member`
-- could create or cancel a legacy assignment directly, while the canonical
-- scp_employer_assign refuses anyone who is not owner or admin. Two doors into
-- the same building, one of them wider.
--
-- has_employer_role already takes a role array, so the narrower boundary is the
-- same helper with the roles named rather than a competing role model. SELECT is
-- deliberately untouched: reading the assignment list is a normal member
-- activity and the product already depends on it.
--
-- The legacy model and its routes are NOT removed in this phase. They remain in
-- use for the token-invite path (src/routes/invite.$token.tsx and
-- src/lib/job-intelligence/assessment-assignments.functions.ts), which is the
-- only way to reach a recipient without an account and which Phase 8.5B will
-- replace.

DROP POLICY IF EXISTS assignments_employer_insert ON public.assessment_assignments;
CREATE POLICY assignments_employer_insert ON public.assessment_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, ARRAY['owner','admin'])
    AND public.employer_is_active_status(employer_id)
  );

DROP POLICY IF EXISTS assignments_employer_update ON public.assessment_assignments;
CREATE POLICY assignments_employer_update ON public.assessment_assignments
  FOR UPDATE TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, ARRAY['owner','admin'])
    AND public.employer_members_can_edit(employer_id)
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, ARRAY['owner','admin'])
    AND public.employer_members_can_edit(employer_id)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- FINDING 3 — scp_compute_maturity was callable by any signed-in client
-- ═══════════════════════════════════════════════════════════════════════════
--
-- It was granted to `authenticated` and `service_role`. It takes a subject id
-- and returns that person's maturity level for a competency, so any signed-in
-- account holding a subject id could read a competence judgement about somebody
-- else -- a public scoring endpoint nobody designed.
--
-- Audited callers: no application code calls it (the only occurrence in src/ is
-- the generated Database type). One live database function references it,
-- scp_development_recommendations, and the Phase 8 report path uses
-- scp_attempt_maturity instead.
--
-- Revoking from the client roles is therefore sufficient and changes nothing
-- about the computation. Both callers are SECURITY DEFINER functions owned by
-- postgres, and EXECUTE is checked against the function owner inside a definer
-- function, so the authorised path keeps working with the algorithm, the
-- thresholds, the safety cap and every released snapshot untouched.
--
-- The same treatment for the Phase 8 derivation helpers, which are the same
-- class of leak: each takes an id and returns a judgement, and each is only ever
-- called from a definer function.

REVOKE EXECUTE ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.scp_attempt_maturity(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scp_display_evidence_state(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scp_attempt_evidence_state(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- FINDING 4 — duplicate protection keyed on a column that is NULL for SCP
-- ═══════════════════════════════════════════════════════════════════════════
--
-- assessment_assignments_active_unique_idx is
--
--   UNIQUE (employer_id, assessment_id, recipient_email)
--   WHERE status IN ('invited','opened','started')
--
-- assessment_id is the LEGACY lineage column, and the
-- assessment_assignments_single_lineage CHECK requires it to be NULL whenever
-- scp_assessment_version_id is set. NULLs never collide in a unique index, so
-- every SCP assignment slipped past it. The index is left in place: it still
-- does its job for the legacy lineage.
--
-- ── WHY NOT SIMPLY KEY THE SAME INDEX ON THE SCP COLUMN ─────────────────
--
-- Checked against the real data before designing this. The SCP path never
-- advances assessment_assignments.status -- every SCP row sits at 'invited'
-- forever, including the four whose attempts are released. A status-based index
-- on the SCP lineage would therefore:
--
--   * fail to build against the existing rows (two duplicate groups: one per
--     participant who has legitimately sat the assessment twice), and
--   * once built, block every future reassessment permanently, because the
--     earlier assignment never leaves the "active" set.
--
-- Neither is acceptable, and repairing the rows is not an option: they are
-- historical completed work.
--
-- ── THE KEY THAT IS ACTUALLY TRUE ───────────────────────────────────────
--
-- "Active" for an SCP assignment means its attempt is still open. That is
-- lineage, not status, so it is recorded as lineage: a column set when the
-- assignment is created and cleared when its attempt finishes.
--
-- The column is added with DEFAULT false, then derived from the attempt that is
-- actually open. This is deliberately a lifecycle backfill, not an assumption
-- about whichever database happened to be inspected while the migration was
-- authored. Released history remains false; any genuinely in-progress attempt
-- becomes true before the unique index is built.

ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS scp_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assessment_assignments.scp_open IS
  'SCP lineage only: true while this assignment''s attempt is still open. Maintained by trigger, never by a client. Backs the SCP duplicate-protection index, because assessment_assignments.status is not advanced by the SCP path.';

-- The owner/admin UPDATE policy must not make the derived lifecycle bit a
-- client-writeable escape hatch. The employer product only updates these two
-- columns directly (cancellation); all other assignment mutations use trusted
-- service-role or SECURITY DEFINER paths.
REVOKE UPDATE ON TABLE public.assessment_assignments FROM authenticated;
GRANT UPDATE (status, cancelled_at) ON public.assessment_assignments TO authenticated;

-- Set on the way in, by lineage rather than by whoever inserted the row, so any
-- present or future insert path is covered without each having to remember.
CREATE OR REPLACE FUNCTION public.scp_mark_assignment_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.scp_open := (NEW.scp_assessment_version_id IS NOT NULL);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assessment_assignments_scp_open_set ON public.assessment_assignments;
CREATE TRIGGER assessment_assignments_scp_open_set
  BEFORE INSERT ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.scp_mark_assignment_open();

REVOKE ALL ON FUNCTION public.scp_mark_assignment_open()
  FROM PUBLIC, anon, authenticated, service_role;

-- Cleared when the attempt stops being open. Submit, score and release all move
-- the attempt out of 'in_progress', and abandonment does too, so one condition
-- covers every ending.
CREATE OR REPLACE FUNCTION public.scp_clear_assignment_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.assignment_id IS NOT NULL
     AND NEW.status IS DISTINCT FROM 'in_progress'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.assessment_assignments
       SET scp_open = false
     WHERE id = NEW.assignment_id AND scp_open;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS scp_attempts_clear_assignment_open ON public.scp_attempts;
CREATE TRIGGER scp_attempts_clear_assignment_open
  AFTER UPDATE OF status ON public.scp_attempts
  FOR EACH ROW EXECUTE FUNCTION public.scp_clear_assignment_open();

REVOKE ALL ON FUNCTION public.scp_clear_assignment_open()
  FROM PUBLIC, anon, authenticated, service_role;

-- Existing installations are not assumed to have the same fixture state as
-- the author's local database. Derive the flag from exact lineage before the
-- index is created. This changes no attempt, response, evidence or snapshot.
UPDATE public.assessment_assignments aa
   SET scp_open = true
  FROM public.scp_attempts a
 WHERE a.assignment_id = aa.id
   AND a.status = 'in_progress'
   AND aa.scp_assessment_version_id IS NOT NULL
   AND NOT aa.scp_open;

-- The invariant. recipient_user_id rather than recipient_email because the SCP
-- path resolves the address to an account before it assigns anything, and the
-- account is the person; use_case is included because a recruitment assignment
-- and a development assignment for the same person are different governed acts,
-- not duplicates of each other.
CREATE UNIQUE INDEX IF NOT EXISTS scp_assignments_one_open_per_subject_idx
  ON public.assessment_assignments
     (employer_id, scp_assessment_version_id, recipient_user_id, use_case)
  WHERE scp_open;

-- A domain error rather than a raw constraint message. The index is the
-- concurrency backstop -- two simultaneous requests cannot both win -- and this
-- gives the ordinary repeated-click case something the product can say out loud.
-- The API layer masks anything without an SCP_ token, so even the racing loser
-- never shows Postgres text to a user.
CREATE OR REPLACE FUNCTION public.scp_guard_one_open_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Deliberately keyed on the lineage rather than on NEW.scp_open: BEFORE
  -- triggers fire in name order, and this one sorts ahead of the trigger that
  -- sets the flag. Reading the lineage makes the guard independent of that.
  IF NEW.scp_assessment_version_id IS NOT NULL
     AND NEW.recipient_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.assessment_assignments aa
        WHERE aa.scp_open
          AND aa.employer_id = NEW.employer_id
          AND aa.scp_assessment_version_id = NEW.scp_assessment_version_id
          AND aa.recipient_user_id = NEW.recipient_user_id
          AND aa.use_case = NEW.use_case
          AND aa.id <> NEW.id)
  THEN
    RAISE EXCEPTION
      'SCP_ASSIGNMENT_ALREADY_OPEN: this person already has an open assignment '
      'for this assessment in this organisation. Let it finish, or cancel it, '
      'before assigning again.'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assessment_assignments_one_open ON public.assessment_assignments;
CREATE TRIGGER assessment_assignments_one_open
  BEFORE INSERT ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_one_open_assignment();

REVOKE ALL ON FUNCTION public.scp_guard_one_open_assignment()
  FROM PUBLIC, anon, authenticated, service_role;

-- The legacy table owns the employer-facing cancellation status, while the SCP
-- attempt owns the real lifecycle. Keep them atomic: cancelling or expiring an
-- open SCP assignment abandons its in-progress attempt, whose status trigger in
-- turn clears scp_open. A submitted/scored/released attempt is historical work
-- and may not be cosmetically cancelled through the legacy screen.
CREATE OR REPLACE FUNCTION public.scp_sync_assignment_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _attempt_status text;
BEGIN
  IF NEW.scp_assessment_version_id IS NULL
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION
      'SCP_ASSIGNMENT_STATUS_MANAGED: SCP assignment status follows its attempt; '
      'only cancellation or expiry may end an open assignment here.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.status INTO _attempt_status
    FROM public.scp_attempts a
   WHERE a.assignment_id = NEW.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'SCP_ASSIGNMENT_LINEAGE_MISSING: SCP assignment % has no attempt.', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF _attempt_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION
      'SCP_ASSIGNMENT_NOT_CANCELLABLE: attempt is already %.', _attempt_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_attempts
     SET status = 'abandoned'
   WHERE assignment_id = NEW.id
     AND status = 'in_progress';

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assessment_assignments_scp_terminal_sync
  ON public.assessment_assignments;
CREATE TRIGGER assessment_assignments_scp_terminal_sync
  AFTER UPDATE OF status ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.scp_sync_assignment_terminal_status();

REVOKE ALL ON FUNCTION public.scp_sync_assignment_terminal_status()
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove the seeded state rather than assume it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM pg_policies
   WHERE tablename IN ('scp_attempts','scp_candidate_responses',
                       'scp_competency_evidence','scp_human_reviews')
     AND cmd = 'ALL';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SECURITY_GATE: % FOR ALL policy/policies still present on protected tables', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE tablename = 'assessment_assignments' AND cmd IN ('INSERT','UPDATE')
     AND coalesce(with_check,'') NOT LIKE '%owner%';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SECURITY_GATE: a legacy assignment write policy still accepts any role';
  END IF;

  IF has_function_privilege('authenticated',
       'public.scp_compute_maturity(uuid, uuid, text, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_SECURITY_GATE: scp_compute_maturity is still executable by authenticated';
  END IF;

  IF has_column_privilege('authenticated', 'public.assessment_assignments',
       'scp_open', 'UPDATE') THEN
    RAISE EXCEPTION 'SCP_SECURITY_GATE: authenticated may still update scp_open';
  END IF;

  -- The backfill must exactly reflect every unfinished attempt, regardless of
  -- whether this installation contains the author's local fixture rows.
  SELECT count(*) INTO _n FROM public.assessment_assignments aa
    JOIN public.scp_attempts a ON a.assignment_id = aa.id
   WHERE a.status = 'in_progress' AND NOT aa.scp_open;
  IF _n > 0 THEN
    RAISE EXCEPTION
      'SCP_SECURITY_GATE: % assignment(s) have an in-progress attempt but are not marked open', _n;
  END IF;

  RAISE NOTICE 'pilot security gate: direct writes closed, assignment roles narrowed, '
               'maturity execution revoked, SCP duplicate protection keyed on real lineage';
END $$;
