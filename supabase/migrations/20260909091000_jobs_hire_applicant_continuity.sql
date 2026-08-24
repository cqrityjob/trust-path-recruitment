-- Marking a candidate as hired makes them the same person in Medarbetare.
--
-- ── WHAT WAS MISSING ────────────────────────────────────────────────────
--
-- "Markera som anställd" moved job_applications.status to 'hired' and stopped.
-- The person stayed a candidate forever: they never appeared under
-- Medarbetare, and an employer who wanted them there re-typed their name into
-- the employee form -- creating a SECOND record of one human being, with no
-- link to the application, the assessment history or the Passport.
--
-- ── NO SECOND IDENTITY MODEL ────────────────────────────────────────────
--
-- The canonical spine already exists and is not extended here:
--
--   job_applications.applicant_user_id  -> auth.users
--   scp_subject_identities (subject_id, user_id)
--   scp_subjects                        the canonical person
--   employees.subject_id                -> scp_subjects
--
-- So "the same person continues into workforce" is not a new concept, it is a
-- row in employees carrying the subject the application already resolves to.
-- Every assessment, every report and every Passport relationship hangs off
-- that subject and therefore follows the person across, with nothing copied.
--
-- The email-match fallback is lifted from scp_resolve_employment_for_assignment
-- deliberately: an employer who added this person as an employee months ago,
-- by hand, before any of this existed, should have that record bound rather
-- than duplicated. Exactly one active unbound match, or nothing -- two people
-- sharing an address is not a match, and guessing there would attach one
-- person's assessment history to another.
--
-- ── IDEMPOTENCE, AND WHY THE INDEX EXISTS ───────────────────────────────
--
-- Pressing the button twice, or a double-submitted form, must not produce two
-- employees. The function returns the existing row when it finds one, which
-- handles the ordinary case. The partial unique index handles the case the
-- lookup cannot: two concurrent transactions both finding nothing and both
-- inserting. There are no existing duplicates to migrate (verified: zero
-- (employer_id, subject_id) groups with more than one row).
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────
--
-- It does not change the application's status. set_application_status() is the
-- single authority on the recruitment lifecycle and keeps its transition
-- allow-list; this function REQUIRES status 'hired' and refuses otherwise, so
-- it can never bring an employee into existence for somebody who was not
-- actually hired. It also writes nothing to the Passport: a Passport belongs
-- to its holder, and being employed is not consent to alter it.
--
-- Forward-only. Additive. Remediation:
--   DROP FUNCTION public.jobs_hire_applicant(uuid, uuid);
--   DROP INDEX  public.employees_employer_subject_uniq;
-- No existing row is modified by the migration itself.

-- ---------------------------------------------------------------------------
-- 1. One employment record per person per organisation
-- ---------------------------------------------------------------------------

-- Partial, because subject_id is NULLable on purpose: an employer may add an
-- employee who has no CQrityjob account at all, and several such rows must
-- stay legal.
CREATE UNIQUE INDEX IF NOT EXISTS employees_employer_subject_uniq
  ON public.employees (employer_id, subject_id)
  WHERE subject_id IS NOT NULL;

COMMENT ON INDEX public.employees_employer_subject_uniq IS
  'One employment record per canonical person per organisation. Partial: '
  'subject_id stays NULLable for employees with no account, and several of '
  'those are legal.';

-- ---------------------------------------------------------------------------
-- 2. The bridge
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jobs_hire_applicant(
  _employer_id    uuid,
  _application_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _app      public.job_applications%ROWTYPE;
  _subject  uuid;
  _employee uuid;
  _matches  int;
  _display  text;
  _email    text;
  _first    text;
  _last     text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employer_memberships m
     WHERE m.user_id = auth.uid()
       AND m.employer_id = _employer_id
       AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'HIRE_NOT_AUTHORISED: you are not an active member of this organisation.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _app FROM public.job_applications a
   WHERE a.id = _application_id AND a.employer_id = _employer_id;

  IF _app.id IS NULL THEN
    RAISE EXCEPTION 'HIRE_APPLICATION_NOT_FOUND: no such application in this organisation.'
      USING ERRCODE = 'P0001';
  END IF;

  -- The status is set by set_application_status(), which owns the lifecycle.
  -- Requiring it here means this can never manufacture an employee for
  -- somebody the employer did not actually hire.
  IF _app.status <> 'hired' THEN
    RAISE EXCEPTION 'HIRE_NOT_HIRED: this application is not marked as hired.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── The canonical person ────────────────────────────────────────────
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si
   WHERE si.user_id = _app.applicant_user_id;

  -- A candidate who applied but never sat an assessment has no subject yet.
  -- Creating it here is the same act every assessment path already performs,
  -- and it is what makes the identity continuous rather than assessment-only.
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id)
    VALUES (_subject, _app.applicant_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    -- Lost the race: somebody else linked the same user first. Take theirs.
    SELECT si.subject_id INTO _subject
      FROM public.scp_subject_identities si
     WHERE si.user_id = _app.applicant_user_id;
  END IF;

  -- ── Already an employee here? ───────────────────────────────────────
  SELECT e.id INTO _employee FROM public.employees e
   WHERE e.employer_id = _employer_id AND e.subject_id = _subject
   LIMIT 1;
  IF _employee IS NOT NULL THEN
    RETURN _employee;                       -- idempotent: pressing twice is safe
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = _app.applicant_user_id;
  SELECT p.display_name INTO _display FROM public.profiles p
   WHERE p.id = _app.applicant_user_id;

  -- ── An unbound record the employer typed in earlier ─────────────────
  IF _email IS NOT NULL THEN
    SELECT count(*) INTO _matches FROM public.employees e
     WHERE e.employer_id = _employer_id
       AND lower(btrim(e.email)) = lower(btrim(_email))
       AND e.subject_id IS NULL
       AND coalesce(e.employment_status, 'active') = 'active';

    IF _matches = 1 THEN
      SELECT e.id INTO _employee FROM public.employees e
       WHERE e.employer_id = _employer_id
         AND lower(btrim(e.email)) = lower(btrim(_email))
         AND e.subject_id IS NULL
         AND coalesce(e.employment_status, 'active') = 'active'
       LIMIT 1;

      UPDATE public.employees
         SET subject_id = _subject, updated_at = now()
       WHERE id = _employee AND subject_id IS NULL;

      RETURN _employee;
    END IF;
  END IF;

  -- ── Otherwise the person becomes an employee ────────────────────────
  --
  -- first_name and last_name are NOT NULL, and display_name is a single
  -- optional string, so the split is deliberate and lossless in the common
  -- case: everything before the last space is the first name. Where there is
  -- no name at all the employer sees the address and can correct it -- which
  -- is better than refusing the hire over a missing profile field.
  _display := nullif(btrim(coalesce(_display, '')), '');
  IF _display IS NULL THEN
    _first := coalesce(split_part(coalesce(_email, ''), '@', 1), 'Ny');
    _last  := '—';
  ELSIF position(' ' in _display) = 0 THEN
    _first := _display;
    _last  := '—';
  ELSE
    _first := btrim(left(_display, length(_display) - position(' ' in reverse(_display))));
    _last  := btrim(right(_display, position(' ' in reverse(_display)) - 1));
  END IF;

  INSERT INTO public.employees
    (employer_id, subject_id, first_name, last_name, email, employment_status, created_by)
  VALUES
    (_employer_id, _subject, _first, _last, _email, 'active', auth.uid())
  -- The index above, not this lookup, is what makes two concurrent hires
  -- impossible. On collision the other transaction has already created the
  -- row we wanted.
  ON CONFLICT (employer_id, subject_id) WHERE subject_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO _employee;

  IF _employee IS NULL THEN
    SELECT e.id INTO _employee FROM public.employees e
     WHERE e.employer_id = _employer_id AND e.subject_id = _subject
     LIMIT 1;
  END IF;

  RETURN _employee;
END; $function$;

REVOKE ALL ON FUNCTION public.jobs_hire_applicant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jobs_hire_applicant(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.jobs_hire_applicant(uuid, uuid) IS
  'Links or creates the employment record for a hired applicant, using the '
  'canonical scp_subjects identity the application already resolves to. '
  'Requires the application to be status hired -- set_application_status() '
  'owns the lifecycle. Idempotent: returns the existing employee when one '
  'exists. Never writes to the Passport.';
