-- Employer OS Phase 1 — Assessment Catalog visibility + Workforce (Employees)
-- Two additive migrations combined per the approved main branch state.

-- === 1) Assessment Catalog visibility ===
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS employer_visible BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS role_category TEXT
    CHECK (role_category IN ('operational', 'strategic'));

COMMENT ON COLUMN public.assessments.employer_visible IS
  'Whether this Assessment Definition may appear in the employer-facing Assessment Center. Default false -- must be explicitly opted in.';
COMMENT ON COLUMN public.assessments.role_category IS
  'Employer Assessment Center primary category: operational (frontline security roles) or strategic (specialist/analytical/management roles). Null for non-employer-facing definitions.';

UPDATE public.assessments
SET employer_visible = true, role_category = 'operational'
WHERE id = 'security-guard-foundation';

-- === 2) Workforce employees table ===
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
  'Employer-managed workforce directory (Employer OS Phase 1). Data-minimised: no PII beyond name/optional email/role/site. Never linked to auth.users for the employee themselves.';

GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_employer_select_own" ON public.employees
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

CREATE POLICY "employees_employer_insert" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
    AND created_by = auth.uid()
  );

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

CREATE TRIGGER set_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();