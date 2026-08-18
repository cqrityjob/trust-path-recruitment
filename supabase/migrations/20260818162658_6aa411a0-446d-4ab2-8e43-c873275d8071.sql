-- Employer Assessment Center — the people model.
--
-- One human is one professional identity. What changes between assessments is
-- the RELATIONSHIP the assessment is taken under, not the person.
--
-- ── THE MODEL ───────────────────────────────────────────────────────────
--
--   auth.users                one login, one human
--     └─ scp_subject_identities (UNIQUE user_id, PK subject_id)   1:1
--          └─ scp_subjects      the pseudonymous assessment identity
--               └─ scp_attempts every attempt this human ever makes
--
-- scp_subjects deliberately holds NO personal data — only an id and a
-- created_at. Names, emails and employment facts live in `profiles`,
-- `employees` and `job_applications`, and are joined to a subject only through
-- scp_subject_identities. That is the data-minimisation boundary Phase 0
-- established, and this migration does not move it.
--
-- The employment relationship is a property of the ASSIGNMENT:
--
--   assessment_assignments.use_case = 'recruitment'
--     → the person is a CANDIDATE: someone being considered for a role.
--       Optionally tied to a job_id / application_id.
--
--   assessment_assignments.use_case = 'workforce'
--     → the person is an EMPLOYEE: existing workforce being assessed or
--       developed. Optionally tied to an employees.id.
--
-- The same human can hold both, over time, against the same subject_id — hired
-- as a candidate, later developed as an employee — and their attempt history
-- stays continuous and reproducible. That is the point of keeping identity on
-- the subject and context on the assignment.
--
-- ── WHAT THIS MIGRATION FIXES ───────────────────────────────────────────
--
-- Nothing stopped a row from claiming one context while pointing at the other
-- kind of person. `use_case` and the recipient were independent inputs on the
-- assign form, so a 'recruitment' assignment could carry an employee_id, and a
-- 'workforce' assignment could carry an application_id. Either one silently
-- reclassifies a real person: an employee appears in the recruitment pipeline,
-- or a job candidate is counted as staff.
--
-- The rule enforced here is deliberately the narrow one — it forbids the
-- CONTRADICTION, not the sparse case:
--
--   * a recruitment assignment may not reference an employee record
--   * a workforce assignment may not reference a job or an application
--
-- Assigning to a bare email stays legitimate in both directions: a candidate
-- who has not formally applied yet, and a staff member not yet in the employee
-- register, are both real situations. Requiring the link would push users into
-- picking the wrong context to get their work done, which is how bad data
-- starts.
--
-- ── WHY NOT VALID ───────────────────────────────────────────────────────
--
-- Added NOT VALID: the constraint binds every INSERT and UPDATE from now on,
-- but does not retroactively reject historical rows written before the rule
-- existed. Those rows are real history. If a back-fill is ever wanted, it is a
-- separate, reviewed decision — `VALIDATE CONSTRAINT` can be run then, and
-- will report exactly which rows disagree rather than failing this deploy.
--
-- Reversible: DROP the constraint. No data is written or altered.

ALTER TABLE public.assessment_assignments
  ADD CONSTRAINT assessment_assignments_person_context_agrees
  CHECK (
    CASE use_case
      WHEN 'recruitment' THEN employee_id IS NULL
      WHEN 'workforce'   THEN application_id IS NULL AND job_id IS NULL
      ELSE true
    END
  ) NOT VALID;

COMMENT ON CONSTRAINT assessment_assignments_person_context_agrees
  ON public.assessment_assignments IS
  'A recruitment assignment describes a candidate and may not reference an '
  'employee record; a workforce assignment describes existing staff and may '
  'not reference a job or application. Assigning to a bare email is allowed in '
  'both directions. NOT VALID: binds new writes, leaves history alone.';

COMMENT ON COLUMN public.assessment_assignments.use_case IS
  'The relationship the assessment is taken under: recruitment (the person is '
  'a candidate) or workforce (the person is existing staff). This is a property '
  'of the assignment, never of the person — the same human keeps one '
  'scp_subjects identity across both.';

-- ═══════════════════════════════════════════════════════════════════════════
-- The participant read model
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One place to ask "who is this participant to this employer, and under what
-- relationship". Without it every surface re-derives the answer from a
-- different join and they drift apart.
--
-- Deliberately an employer-scoped view over assessment_assignments rather than
-- a new table: there is no new fact here to store, and a second person record
-- is exactly what the people model is meant to prevent.
--
-- security_invoker so the caller's own RLS on assessment_assignments,
-- employees and job_applications decides what they can see. A SECURITY DEFINER
-- view here would quietly become a cross-tenant read.
--
-- ── NO subject_id COLUMN, DELIBERATELY ──────────────────────────────────
--
-- The obvious design is to join scp_subject_identities and expose subject_id,
-- so a caller can see that the candidate and the employee are one human. That
-- is exactly what Phase 2's structural rule forbids: NO scp_rm_ read model may
-- depend on scp_subject_identities (asserted at P2A.1). The pseudonymous
-- subject is the privacy boundary — a read model that carries it turns every
-- employer-facing list into a re-identification surface.
--
-- Identity resolution stays where Phase 2 put it: the scoped, authorisation-
-- checking RPC public.scp_resolve_participant_identity(uuid, uuid). This view
-- answers "what relationships does this employer have with this person", which
-- needs no subject at all — the employer already knows the email it invited.

CREATE OR REPLACE VIEW public.scp_rm_employer_participants
WITH (security_invoker = true) AS
SELECT
  a.employer_id,
  a.recipient_email,
  a.recipient_user_id,
  a.use_case AS relationship,
  a.employee_id,
  a.application_id,
  a.job_id,
  count(*)                                        AS assignment_count,
  count(*) FILTER (WHERE a.status = 'completed')  AS completed_count,
  min(a.invited_at)                               AS first_invited_at,
  max(a.invited_at)                               AS last_invited_at
FROM public.assessment_assignments a
GROUP BY a.employer_id, a.recipient_email, a.recipient_user_id,
         a.use_case, a.employee_id, a.application_id, a.job_id;

COMMENT ON VIEW public.scp_rm_employer_participants IS
  'Participants of one employer, grouped by person and by the relationship the '
  'assessment was assigned under. A person who is both a past candidate and a '
  'current employee yields TWO rows — one human, two relationships — which is '
  'the distinction the Assessment Center must show rather than collapse. '
  'Carries no subject_id: identity resolution goes through '
  'scp_resolve_participant_identity, never through a read model.';

REVOKE ALL ON public.scp_rm_employer_participants FROM anon;
GRANT SELECT ON public.scp_rm_employer_participants TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _emp uuid; _actor uuid; _ver uuid; _employee uuid; _blocked boolean;
BEGIN
  IF to_regclass('public.scp_rm_employer_participants') IS NULL THEN
    RAISE EXCEPTION 'EMPLOYER_PEOPLE_MODEL: the participant read model is missing';
  END IF;

  -- The constraint must actually refuse a contradiction. Proven against real
  -- rows in a savepoint, not by reading the catalogue.
  _actor := gen_random_uuid();
  _emp   := gen_random_uuid();
  INSERT INTO auth.users (id, email) VALUES (_actor, 'people-model@migration.invalid');
  INSERT INTO public.employers (id, name, slug, status)
    VALUES (_emp, 'People Model Probe', 'people-model-probe-' || left(_emp::text, 8), 'active');
  INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
    VALUES (_emp, 'Probe', 'Employee', _actor) RETURNING id INTO _employee;

  SELECT id INTO _ver FROM public.assessment_versions
   WHERE assessment_id = 'security-guard-foundation' LIMIT 1;

  BEGIN
    INSERT INTO public.assessment_assignments
      (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
       employee_id, recipient_email, assigned_by, invitation_token_hash, expires_at)
    VALUES (_emp, 'security-guard-foundation', _ver, 'security_professional',
            'recruitment', _employee, 'probe@migration.invalid', _actor,
            'probe-hash', now() + interval '7 days');
    _blocked := false;
  EXCEPTION WHEN check_violation THEN
    _blocked := true;
  END;

  IF NOT _blocked THEN
    RAISE EXCEPTION
      'EMPLOYER_PEOPLE_MODEL: a recruitment assignment carrying an employee_id '
      'was accepted; the person-context constraint is not binding';
  END IF;

  -- Clean the probe up entirely: this migration adds structure, not rows.
  DELETE FROM public.employees WHERE employer_id = _emp;
  DELETE FROM public.employers WHERE id = _emp;
  DELETE FROM auth.users WHERE id = _actor;
END $$;