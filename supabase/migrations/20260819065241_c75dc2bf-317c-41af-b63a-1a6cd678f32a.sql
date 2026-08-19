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

REVOKE EXECUTE ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.scp_attempt_maturity(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scp_display_evidence_state(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scp_attempt_evidence_state(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS scp_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assessment_assignments.scp_open IS
  'SCP lineage only: true while this assignment''s attempt is still open. Maintained by trigger, never by a client. Backs the SCP duplicate-protection index, because assessment_assignments.status is not advanced by the SCP path.';

REVOKE UPDATE ON TABLE public.assessment_assignments FROM authenticated;
GRANT UPDATE (status, cancelled_at) ON public.assessment_assignments TO authenticated;

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

UPDATE public.assessment_assignments aa
   SET scp_open = true
  FROM public.scp_attempts a
 WHERE a.assignment_id = aa.id
   AND a.status = 'in_progress'
   AND aa.scp_assessment_version_id IS NOT NULL
   AND NOT aa.scp_open;

CREATE UNIQUE INDEX IF NOT EXISTS scp_assignments_one_open_per_subject_idx
  ON public.assessment_assignments
     (employer_id, scp_assessment_version_id, recipient_user_id, use_case)
  WHERE scp_open;

CREATE OR REPLACE FUNCTION public.scp_guard_one_open_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
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