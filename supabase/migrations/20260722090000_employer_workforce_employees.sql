-- Employer OS Phase 1 — Workforce Foundation: employees table.
--
-- Additive only: one new table, no ALTER on any existing table, no RLS
-- change to anything else. Mirrors the exact `jobs` table's employer-write
-- RLS pattern (has_employer_role + employer_members_can_edit, both
-- existing helpers from supabase/migrations/20260719181557_...sql) rather
-- than inventing a new authorization mechanism.
--
-- Data minimisation (GDPR): only what an employer genuinely needs to
-- track "who works here, in what role, since when" is stored. No
-- personal identity numbers, no criminal-record data, no health
-- information, no union membership, no security-vetting results. Email
-- is optional -- an employee record does not require (and is never
-- linked to) an auth.users row; adding someone to the Workforce
-- directory never creates or requires a login for them.
--
-- `site_name` is a plain optional text field, not a foreign key. The
-- Sites & Risk module is a foundation/future-state module in this phase
-- (see product plan) -- this column lets the Workforce directory and
-- Command Center report real "sites represented" today without forcing
-- a full Sites schema into this migration. A future `sites` table can
-- backfill a `site_id` FK against these free-text values without any
-- data loss, since nothing here is derived or destroyed by that change.

CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  role_title TEXT,
  site_name TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'inactive')),
  start_date DATE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX employees_employer_idx ON public.employees (employer_id, employment_status);

COMMENT ON TABLE public.employees IS
  'Employer-managed workforce directory (Employer OS Phase 1). Data-minimised: no PII beyond name/optional email/role/site. Never linked to auth.users for the employee themselves -- an employee record never implies or requires a login.';

GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Read: any active-or-draft-employer member (owner/admin/member alike),
-- same shape as jobs_employer_select_own.
CREATE POLICY "employees_employer_select_own" ON public.employees
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

-- Insert: same member gate, plus the row must be created for the
-- caller's own already-authorised employer_id (never someone else's).
CREATE POLICY "employees_employer_insert" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
    AND created_by = auth.uid()
  );

-- Update: same member gate for both the existing row and the proposed
-- new row -- an update can never move an employee to a different
-- employer_id the caller doesn't have access to.
CREATE POLICY "employees_employer_update" ON public.employees
  FOR UPDATE TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

-- No DELETE policy: deactivation is a status update
-- (employment_status = 'inactive'), never a row delete, per the "deactivate
-- rather than permanently delete" product requirement. Platform-admin
-- hard-delete, if ever needed, goes through service_role tooling, not
-- authenticated RLS.

CREATE TRIGGER set_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
