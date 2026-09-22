-- Rollback of 20261205090000_employer_workforce_active_only.
--
-- !! THIS REOPENS A KNOWN GAP !!
-- After it, an organisation nobody has approved -- draft or pending -- can
-- again create employment records naming real people, through the portal and
-- through service_role alike. Run it ONLY in an isolated test database
-- (scripts/db-test.sh cycles it to prove it restores the previous state
-- exactly), never against production.
--
-- It touches no data. Employment records created while the gate was in force
-- are ordinary rows and are left exactly as they are.
DO $guard$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM pg_policy pol
         WHERE pol.polrelid = 'public.employees'::regclass
           AND pol.polname = 'employees_employer_insert'
           AND pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%employer_is_active_status%')
     OR (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'employer_operational_guard')
        NOT LIKE '%EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE%' THEN
    RAISE EXCEPTION
      'WORKFORCE_ACTIVE_GATE_ROLLBACK: the database is not in the state 20261205090000 leaves.';
  END IF;
END $guard$;

DROP POLICY "employees_employer_insert" ON public.employees;

CREATE POLICY "employees_employer_insert" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
    AND created_by = auth.uid()
  );

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

  IF _status IS NULL THEN
    RETURN NEW;
  END IF;

  IF _status NOT IN ('active', 'draft', 'pending') THEN
    RAISE EXCEPTION
      'EMPLOYER_NOT_OPERATIONAL: organisation status is %, no new % records can be created for it.',
      _status, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.employer_operational_guard() IS
  'BEFORE INSERT guard: refuses new operational records for a suspended, '
  'rejected or archived organisation, for every Postgres role including '
  'service_role and platform admins. Historical rows are never touched.';
