-- Workforce records belong to an APPROVED organisation.
--
-- ── THE FINDING THIS CLOSES (audit 2026-09-22, S1) ──────────────────────
--
-- `employer_members_can_edit()` returns true for status IN ('active','draft',
-- 'pending'), and `employees_employer_insert` is written in terms of it. So an
-- organisation nobody has approved yet could create employment records for
-- named people, and the trigger guard added by 20260911090000 did not catch it
-- either: `employer_accepts_operations()` allows draft and pending on purpose,
-- because that is what lets a new owner build JOB DRAFTS while they wait.
--
-- Those two are not the same act and the Product Owner has now separated them:
--
--   JOB DRAFT        an advertisement about the organisation's own vacancy.
--                    Nothing leaves the organisation until a moderator
--                    publishes it, so preparing one while pending is safe and
--                    stays permitted. NOTHING in this migration touches jobs.
--
--   EMPLOYMENT       a statement that a NAMED PERSON works for this
--   RECORD           organisation, which becomes the spine other people's
--                    assessment, training and Passport history hangs off. An
--                    unapproved organisation must not be able to make it.
--
-- ── TWO LAYERS, BECAUSE A DISABLED BUTTON IS NOT ENFORCEMENT ────────────
--
--   1. RLS  `employees_employer_insert` additionally requires
--           employer_is_active_status(). This is the authorisation boundary
--           for everything that arrives as `authenticated` -- the portal, a
--           hand-made PostgREST call, a CSV import driven through the app.
--
--   2. TRIGGER  `employer_operational_guard()` gains a workforce-specific
--           rule, so the refusal holds for EVERY Postgres role, service_role
--           and platform admin included, and for any future import path that
--           has not been written yet. RLS alone would leave a service-role
--           script free to do what the product refuses.
--
-- ── WHAT STAYS OPEN, DELIBERATELY ───────────────────────────────────────
--
-- SELECT and UPDATE on `employees` are untouched. An organisation that was
-- active and is now suspended still has employment records; being unable to
-- read or correct them would make a suspension destroy data rather than stop
-- new work. The rule the owner asked for is about CREATING and IMPORTING.
--
-- `scp_employment_from_application()` (the hire bridge) is unaffected: it
-- already refuses unless `employer_is_active_status()` holds, so a hire that
-- is permitted today is permitted after this migration, and one that is not
-- was already refused a step earlier with a better message.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The authorisation boundary
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "employees_employer_insert" ON public.employees;

CREATE POLICY "employees_employer_insert" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    -- Kept as well as the active check, not replaced by it: membership is a
    -- different question from approval, and dropping it here would make the
    -- policy read as though an active organisation were open to anyone.
    AND public.employer_members_can_edit(employer_id)
    AND public.employer_is_active_status(employer_id)
    AND created_by = auth.uid()
  );

COMMENT ON POLICY "employees_employer_insert" ON public.employees IS
  'An employment record names a person and may only be created by an active '
  'member of an APPROVED organisation. Draft and pending organisations keep '
  'their job drafts and lose nothing else; see 20261205090000.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The same rule, for every role
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One guard function, two rules, because the five tables it serves do not all
-- mean the same thing. The operational rule runs first so an archived
-- organisation still gets EMPLOYER_NOT_OPERATIONAL -- the same code, with the
-- same meaning, that the admin lifecycle suite already asserts.

CREATE OR REPLACE FUNCTION public.employer_operational_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _employer uuid;
  _status text;
BEGIN
  _employer := NEW.employer_id;
  IF _employer IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO _status FROM public.employers WHERE id = _employer;

  -- An employer row that does not exist is somebody else's foreign key
  -- problem, not this guard's; let the constraint raise its own error.
  IF _status IS NULL THEN
    RETURN NEW;
  END IF;

  IF _status NOT IN ('active', 'draft', 'pending') THEN
    RAISE EXCEPTION
      'EMPLOYER_NOT_OPERATIONAL: organisation status is %, no new % records can be created for it.',
      _status, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  -- The workforce rule. An employment record is a statement about a named
  -- person, so it waits for approval; a job draft does not, and is not
  -- mentioned here.
  IF TG_TABLE_NAME = 'employees' AND _status <> 'active' THEN
    RAISE EXCEPTION
      'EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE: organisation status is %, so no employment record can be created for it. Job drafts remain available while the organisation is reviewed.',
      _status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.employer_operational_guard() IS
  'BEFORE INSERT guard: refuses new operational records for a suspended, '
  'rejected or archived organisation, for every Postgres role including '
  'service_role and platform admins, and refuses an EMPLOYMENT record for any '
  'organisation that is not yet active. Historical rows are never touched.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Prove it at apply time
--
-- Executed, not asserted in prose: the policy text and the guard body are both
-- read back, and the refusal is exercised against a real pending organisation
-- through service_role -- the role that RLS does not constrain -- so the proof
-- is about the trigger and not about the policy that shadows it.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _qual text;
  _employer uuid := gen_random_uuid();
  _actor uuid;
  _raised text := NULL;
BEGIN
  SELECT pg_get_expr(pol.polwithcheck, pol.polrelid) INTO _qual
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.employees'::regclass
     AND pol.polname = 'employees_employer_insert';

  IF _qual IS NULL OR _qual NOT LIKE '%employer_is_active_status%' THEN
    RAISE EXCEPTION
      'WORKFORCE_ACTIVE_GATE_MISSING: employees_employer_insert does not '
      'require an active organisation (with check: %).', coalesce(_qual, 'absent');
  END IF;

  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'employer_operational_guard')
     NOT LIKE '%EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE%' THEN
    RAISE EXCEPTION
      'WORKFORCE_ACTIVE_GATE_MISSING: the operational guard carries no '
      'workforce rule, so service_role could still create the record.';
  END IF;

  -- A pending organisation, and an author who really exists: created_by is a
  -- foreign key into auth.users, and a made-up uuid would fail for that reason
  -- instead of the one being proved.
  SELECT id INTO _actor FROM auth.users ORDER BY created_at LIMIT 1;
  IF _actor IS NULL THEN
    RAISE NOTICE 'WORKFORCE_ACTIVE_GATE: no auth.users row on this database; '
                 'the executed half of the proof is skipped.';
    RETURN;
  END IF;

  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_employer, 'Gate Proof AB', 'gate-proof-' || replace(_employer::text, '-', ''), 'pending');

  BEGIN
    INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
    VALUES (_employer, 'Ska', 'Refuseras', _actor);
  EXCEPTION WHEN OTHERS THEN
    _raised := SQLERRM;
  END;

  IF _raised IS NULL OR _raised NOT LIKE '%EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE%' THEN
    DELETE FROM public.employees WHERE employer_id = _employer;
    DELETE FROM public.employers WHERE id = _employer;
    RAISE EXCEPTION
      'WORKFORCE_ACTIVE_GATE_NOT_ENFORCED: a pending organisation created an '
      'employment record (error was: %).', coalesce(_raised, 'none');
  END IF;

  -- And the same organisation, once approved, may.
  UPDATE public.employers SET status = 'active' WHERE id = _employer;
  INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
  VALUES (_employer, 'Ska', 'Tillatas', _actor);

  DELETE FROM public.employees WHERE employer_id = _employer;
  DELETE FROM public.employers WHERE id = _employer;

  RAISE NOTICE 'WORKFORCE_ACTIVE_GATE: pending refused, active permitted.';
END $$;
