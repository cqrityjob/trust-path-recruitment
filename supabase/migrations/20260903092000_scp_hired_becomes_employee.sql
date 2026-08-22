-- Being hired does not make you a new person.
--
-- ── THE BREAK IN THE LIFECYCLE ──────────────────────────────────────────
--
-- set_application_status() has accepted 'hired' since H3.4A. It sets a column
-- and writes an audit event, and that is all it does. Nothing anywhere in the
-- product reacts to it: grep for 'hired' across every other migration and
-- there is not one match.
--
-- So the lifecycle stopped at the recruitment outcome. The employer then had
-- to open Medarbetare and TYPE THE PERSON IN AGAIN — a second row, a second
-- name, no subject, and therefore:
--
--   * the assessment the employer itself commissioned during recruitment did
--     not appear on the person's page, because that page resolves through
--     employees.subject_id and the new row had none;
--   * a development assessment assigned to them afterwards created evidence
--     against the SAME subject the recruitment evidence belongs to, which the
--     employment record could not reach;
--   * and if the employer later bound that row to an account (or an
--     assignment did it for them), the platform had two employment records
--     for one human in one organisation, which #51's unique index exists
--     specifically to prevent.
--
-- ── THE MODEL ───────────────────────────────────────────────────────────
--
--   job_applications.applicant_user_id
--        -> scp_subject_identities (UNIQUE (user_id))   <- one human, one subject
--             -> employees.subject_id
--
-- The subject is resolved, never invented: scp_subject_identities has a UNIQUE
-- constraint on user_id, so the subject an employment record is bound to here
-- is BY CONSTRUCTION the same subject scp_employer_assign resolved for the
-- recruitment assessment, and the same one a future development assessment
-- will resolve. There is no second identity to keep in step.
--
-- ── AND IT DOES NOT DUPLICATE AN EXISTING RECORD ────────────────────────
--
-- Three cases, in order:
--
--   1. an employment record in this organisation ALREADY carries this
--      subject -> reuse it. Re-hiring a former employee reactivates their
--      record and their history; it does not fork it.
--   2. exactly one UNBOUND record in this organisation carries the
--      applicant's own confirmed account address -> bind it. This fills a
--      blank on a placeholder the employer typed themselves; it never merges
--      two established professional identities, which is the line #51 draws.
--   3. otherwise -> create one.
--
-- ── THE EMPLOYER STILL DECIDES ──────────────────────────────────────────
--
-- Nothing here scores, ranks, recommends or decides. The bridge runs only
-- because a human the product already trusts to record 'hired' recorded it on
-- an application, and the assessment engine has no path to this function. Its
-- authorisation is deliberately the SAME gate as the outcome's -- an active
-- membership in the owning organisation -- so it can neither widen who may
-- hire nor refuse somebody the product already lets do it. What changes is
-- that the employer's decision now lands in one place instead of two.
--
-- ── CAREER INTELLIGENCE, NOT A NEW ROLE VOCABULARY ──────────────────────
--
-- The employment record inherits jobs.profession_slug, which is already a
-- foreign key into cig_professions -- the same canonical profession the
-- advertisement was classified under, the same slug sp_passport_profiles
-- carries, the same graph Career Discovery reads. role_title stays free text
-- for what the employer calls the job; the profession is the governed
-- concept, and it is not re-invented here.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- Three columns on employees, narrowed column grants, one new function, and
-- set_application_status extended by one call. The transition allow-list,
-- the role derivation, the audit row and every existing refusal are carried
-- forward byte-for-byte.
--
-- Remediation: restore set_application_status from 20260720150000, drop
-- scp_employment_from_application, restore the table-wide grants, drop the
-- three columns.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Lineage on the employment record
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hired_from_application_id uuid
    REFERENCES public.job_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hired_from_job_id uuid
    REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cig_profession_slug text
    REFERENCES public.cig_professions(slug) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.hired_from_application_id IS
  'The application this employment relationship came out of, when it came out '
  'of one. Lineage, not a dependency: an employee added directly still has '
  'NULL here and works exactly as before.';
COMMENT ON COLUMN public.employees.cig_profession_slug IS
  'The canonical Career Intelligence profession this role is an instance of, '
  'inherited from the advertisement at hire. The same vocabulary jobs, '
  'Career Discovery and the Security Passport use -- never a parallel one.';

CREATE INDEX IF NOT EXISTS employees_hired_from_application_idx
  ON public.employees (hired_from_application_id)
  WHERE hired_from_application_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Identity columns become function-only
--
-- employees carried table-wide INSERT and UPDATE for `authenticated`, so an
-- employer member could write subject_id directly -- attaching an employment
-- record to any subject id they came to know, or detaching one from the
-- person whose history it is. RLS confined that to their own organisation but
-- did not make it legitimate: whose professional history a record belongs to
-- is not an employer-editable field.
--
-- Same column-grant shape as assessment_assignments.scp_open (Phase B): the
-- ordinary fields stay client-writable, identity and lineage move behind the
-- SECURITY DEFINER functions that check who is asking.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE ON public.employees FROM authenticated;

GRANT INSERT (employer_id, first_name, last_name, email, role_title, site_name,
              employment_status, start_date, created_by)
  ON public.employees TO authenticated;

GRANT UPDATE (first_name, last_name, email, role_title, site_name,
              employment_status, start_date, updated_at)
  ON public.employees TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The bridge
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employment_from_application(
  _application_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _app public.job_applications%ROWTYPE;
  _subject uuid; _employee uuid; _email text; _display text;
  _first text; _last text; _cut integer; _profession text; _job_title text;
BEGIN
  SELECT * INTO _app FROM public.job_applications WHERE id = _application_id;
  IF _app.id IS NULL THEN
    RAISE EXCEPTION 'SCP_APPLICATION_NOT_FOUND: no such job application.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- EXACTLY the gate set_application_status already applies to recording the
  -- outcome, deliberately -- not the stricter owner/admin gate that assigning
  -- an assessment carries.
  --
  -- Two reasons. Adding a person to the workforce directory is already open to
  -- any active member (employees_employer_insert), so a stricter rule here
  -- would refuse the automatic path while leaving the manual one open, which
  -- means a duplicate record typed by hand. And a gate stricter than the
  -- outcome's own would break a transition that works today: whoever the
  -- product lets record 'hired' must be able to complete it.
  IF NOT (public.has_employer_role(auth.uid(), _app.employer_id, NULL)
          AND public.employer_is_active_status(_app.employer_id)) THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_HIRE: completing a hire requires an '
      'active membership in the organisation that owns this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The recruitment outcome is the employer's, and it must already have been
  -- recorded. This function does not decide anything; it follows a decision.
  IF _app.status <> 'hired' THEN
    RAISE EXCEPTION 'SCP_APPLICATION_NOT_HIRED: an employment record follows a '
      'recorded hire; this application is %.', _app.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- One human, one professional identity. UNIQUE (user_id) on
  -- scp_subject_identities is what makes this the SAME subject the assessment
  -- path resolves, rather than a second one that agrees today.
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _app.applicant_user_id;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id)
    VALUES (_subject, _app.applicant_user_id);
  END IF;

  SELECT j.profession_slug, coalesce(j.title_sv, j.title_en)
    INTO _profession, _job_title
    FROM public.jobs j WHERE j.id = _app.job_id;

  SELECT lower(btrim(u.email)) INTO _email
    FROM auth.users u WHERE u.id = _app.applicant_user_id;

  -- Which employment record is this, if any? Answered by the resolver the
  -- assignment path already uses (20260829097000), so "do we already have this
  -- person on file" has ONE rule in the product rather than two that agree
  -- until they don't:
  --
  --   1. a record here already bound to this subject -> that one, reused;
  --   2. exactly one unbound ACTIVE record carrying this person's own
  --      confirmed address -> bound now, filling a blank the employer typed
  --      themselves;
  --   3. ambiguous, or no match -> NULL, and a new record is created below.
  --
  -- It never moves an established subject from one record to another.
  _employee := public.scp_resolve_employment_for_assignment(
                 _app.employer_id, _email, _subject);

  IF _employee IS NOT NULL THEN
    UPDATE public.employees e
       SET subject_id                = _subject,
           employment_status         = 'active',
           hired_from_application_id = coalesce(e.hired_from_application_id, _application_id),
           hired_from_job_id         = coalesce(e.hired_from_job_id, _app.job_id),
           cig_profession_slug       = coalesce(e.cig_profession_slug, _profession),
           role_title                = coalesce(e.role_title, _job_title),
           start_date                = coalesce(e.start_date, current_date),
           updated_at                = now()
     WHERE e.id = _employee;
    RETURN _employee;
  END IF;

  -- Case 3 — a new employment relationship. The name is the one the employer
  -- has already been shown on the application, so the hire discloses nothing
  -- new; the address deliberately is NOT copied across.
  SELECT coalesce(nullif(btrim(p.display_name), ''),
                  split_part(coalesce(u.email, ''), '@', 1))
    INTO _display
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.id = _app.applicant_user_id;

  _display := coalesce(nullif(btrim(_display), ''), '—');
  _cut := position(' ' in reverse(_display));
  IF _cut > 0 THEN
    _first := btrim(substring(_display from 1 for length(_display) - _cut));
    _last  := btrim(substring(_display from length(_display) - _cut + 2));
  ELSE
    _first := _display;
    -- Not invented and not blank: the surname is simply not known to the
    -- platform, and the employer can correct it in the directory.
    _last  := '—';
  END IF;

  INSERT INTO public.employees (
    employer_id, first_name, last_name, email, role_title, site_name,
    employment_status, start_date, created_by, subject_id,
    hired_from_application_id, hired_from_job_id, cig_profession_slug)
  VALUES (
    _app.employer_id, _first, coalesce(nullif(_last, ''), '—'), NULL,
    _job_title, NULL, 'active', current_date, auth.uid(), _subject,
    _application_id, _app.job_id, _profession)
  RETURNING id INTO _employee;

  RETURN _employee;
END; $function$;

COMMENT ON FUNCTION public.scp_employment_from_application(uuid) IS
  'Turns a recorded hire into an employment relationship for the SAME person. '
  'Resolves the subject through scp_subject_identities rather than minting a '
  'new identity, reuses or binds an existing employment record rather than '
  'creating a duplicate, and inherits the advertisement''s canonical Career '
  'Intelligence profession. Idempotent: calling it twice returns the same '
  'employment record.';

REVOKE ALL     ON FUNCTION public.scp_employment_from_application(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employment_from_application(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The outcome and the workforce record become one act
--
-- Body carried forward from 20260720150000. The transition allow-list, the
-- role derivation, the note handling and the audit insert are unchanged. One
-- addition, at the end: a hire creates the employment relationship in the same
-- transaction, so there is no window in which an application says 'hired' and
-- the workforce does not know about the person.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_application_status(
  _application_id uuid,
  _new_status text,
  _note text DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  previous_status text,
  new_status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _app public.job_applications%ROWTYPE;
  _is_applicant boolean;
  _is_employer boolean;
  _clean_note text;
  _actor_role text;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _new_status NOT IN ('reviewing', 'interview', 'rejected', 'hired', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid application status: %', _new_status;
  END IF;

  _clean_note := NULLIF(btrim(_note), '');
  IF _clean_note IS NOT NULL AND char_length(_clean_note) > 1000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _app
  FROM public.job_applications
  WHERE id = _application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  _is_applicant := (_app.applicant_user_id = _caller);
  _is_employer := public.has_employer_role(_caller, _app.employer_id, NULL)
                  AND public.employer_is_active_status(_app.employer_id);

  -- Role-derived permission, never a client-supplied flag. A candidate may
  -- only ever request 'withdrawn' on their own application; an employer
  -- may never request 'withdrawn'.
  IF _is_applicant AND _new_status = 'withdrawn' THEN
    IF _app.status NOT IN ('submitted', 'reviewing', 'interview') THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, cannot withdraw',
        _app.status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'candidate';

  ELSIF _is_employer AND _new_status <> 'withdrawn' THEN
    IF NOT (
      (_app.status = 'submitted' AND _new_status IN ('reviewing', 'rejected')) OR
      (_app.status = 'reviewing' AND _new_status IN ('interview', 'rejected')) OR
      (_app.status = 'interview' AND _new_status IN ('hired', 'rejected'))
    ) THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, action % not allowed',
        _app.status, _new_status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'employer';

  ELSE
    RAISE EXCEPTION 'Forbidden: not authorised to set this application status';
  END IF;

  UPDATE public.job_applications
  SET
    status = _new_status,
    updated_at = _now,
    withdrawn_at = CASE WHEN _new_status = 'withdrawn' THEN _now ELSE withdrawn_at END,
    employer_note = CASE
      WHEN _actor_role = 'employer' AND _clean_note IS NOT NULL THEN _clean_note
      ELSE employer_note
    END
  WHERE id = _application_id;

  INSERT INTO public.job_application_status_events (
    application_id, job_id, employer_id, actor_user_id, actor_role,
    previous_status, new_status, note, created_at
  ) VALUES (
    _application_id, _app.job_id, _app.employer_id, _caller, _actor_role,
    _app.status, _new_status, _clean_note, _now
  );

  -- The same person joins the workforce, in the same transaction. If this
  -- cannot be done the hire does not silently half-happen: the whole act
  -- rolls back and the employer is told why.
  IF _new_status = 'hired' THEN
    PERFORM public.scp_employment_from_application(_application_id);
  END IF;

  RETURN QUERY SELECT _application_id, _app.status, _new_status, _now;
END;
$$;

REVOKE ALL ON FUNCTION public.set_application_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_application_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_application_status(uuid, text, text) IS
  'H3.4A. The only path an existing job_applications row''s status can '
  'change through. Role is derived server-side (applicant vs. active '
  'employer member) -- never trusted from client input. Candidates may '
  'only request ''withdrawn'' from submitted/reviewing/interview; '
  'employers may request reviewing/interview/rejected/hired per a fixed '
  'transition allow-list, never ''withdrawn''. Atomically updates '
  'job_applications, inserts exactly one job_application_status_events '
  'row, and -- on ''hired'' -- creates or binds the employment '
  'relationship for the SAME subject, so being hired never makes somebody '
  'a new person.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Self-verification
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='employees'
                    AND column_name='hired_from_application_id') THEN
    RAISE EXCEPTION 'SCP_HIRE_LINEAGE_MISSING: employees.hired_from_application_id did not install';
  END IF;

  IF pg_get_functiondef('public.set_application_status(uuid,text,text)'::regprocedure)
       NOT LIKE '%scp_employment_from_application%' THEN
    RAISE EXCEPTION 'SCP_HIRE_NOT_BRIDGED: a hire no longer reaches the workforce';
  END IF;

  IF has_column_privilege('authenticated','public.employees','subject_id','UPDATE')
     OR has_column_privilege('authenticated','public.employees','subject_id','INSERT') THEN
    RAISE EXCEPTION 'SCP_SUBJECT_CLIENT_WRITABLE: whose history an employment record is is client-editable';
  END IF;

  IF NOT has_column_privilege('authenticated','public.employees','first_name','UPDATE')
     OR NOT has_column_privilege('authenticated','public.employees','employment_status','UPDATE')
     OR NOT has_column_privilege('authenticated','public.employees','first_name','INSERT') THEN
    RAISE EXCEPTION 'SCP_DIRECTORY_BROKEN: the ordinary employee directory can no longer be edited';
  END IF;

  IF has_function_privilege('anon','public.scp_employment_from_application(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'SCP_HIRE_BRIDGE_ANON: the hire bridge is callable by anon';
  END IF;
END $$;
