-- Employer Assessment Assignment workflow — additive schema.
--
-- One new table only: public.assessment_assignments. No ALTER on
-- assessments, assessment_versions, assessment_runs, assessment_run_reports,
-- job_applications, employees, or employer_memberships. No question
-- content, mapping, or scoring touched.
--
-- Design rationale (see architecture map in the implementation notes):
--
-- 1. assessment_runs.user_id is NOT NULL — a run can only ever belong to a
--    real, signed-in auth.users identity, and there is no existing
--    "anonymous run, claimed later" pattern anywhere in this schema. Rather
--    than weaken that constraint (which would touch the core, historical
--    assessment_runs table), a completed assignment caches its own
--    `answers` + `engine_result` (the computed EngineResultV1) directly on
--    this new row. That cache is the single source of truth the employer
--    report reads from — it works identically whether or not the
--    recipient ever creates an account. A real assessment_runs /
--    assessment_run_reports pair is created additionally, via the
--    existing saveMyCareerReport()/save_career_report() pipeline (verbatim,
--    no duplicate scoring), the moment a real user_id is known — either
--    immediately (recipient was already a known applicant/employee
--    account) or later when they sign in/register and the assignment's
--    recipient_email matches their verified auth email. That is the only
--    place `assessment_assignments.assessment_run_id` gets set, and only
--    once — this is what "does not duplicate the run" means structurally.
--
-- 2. The invitation token is the recipient's bearer credential (same
--    threat model as a password-reset link). Only a SHA-256 hash is ever
--    stored (`invitation_token_hash`); the plaintext token is generated
--    server-side, returned once in the create-assignment response, and
--    never persisted or logged anywhere. Recipient access to a specific
--    assignment therefore never goes through row-level security (an
--    anonymous visitor has no Postgres role matching any owner check) —
--    it goes through a dedicated server function that hashes the incoming
--    token, looks the row up via the service-role client, and is itself
--    the entire authorization boundary for that one lookup. This mirrors
--    the codebase's existing, already-approved rationale for service-role
--    use (see getApplicationCvSignedUrl, save_career_report()) — RLS
--    still fully applies to every other access path (employer reads/
--    writes, a signed-in recipient's own-assignment reads).
--
-- 3. Assigning a *real* assessment to a *real* person is gated on
--    employer_is_active_status() (strict, active-only) — the same tier
--    used for job publishing (jobs_validate_before_write) and for an
--    employer seeing real applications (job_applications_employer_select).
--    Viewing the catalogue remains gated on the looser
--    employer_members_can_edit() (active/draft/pending), unchanged.

CREATE TABLE public.assessment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  employer_id UUID NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  assessment_id TEXT NOT NULL REFERENCES public.assessments(id),
  assessment_version_id UUID NOT NULL REFERENCES public.assessment_versions(id),
  -- Question Library AssessmentProfileId (e.g. 'security_professional').
  -- Not a FK -- the profile pool concept lives in code
  -- (src/lib/question-library/types.ts), not in a database table. Fixed
  -- per assessment_id today; persisted per-row for reproducibility if a
  -- future assessment definition ever supports more than one profile.
  profile_id TEXT NOT NULL,

  use_case TEXT NOT NULL CHECK (use_case IN ('recruitment', 'workforce')),
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,

  -- Always captured at assignment time, even when the recipient is a known
  -- applicant/employee account -- this is what a direct-email assignment
  -- (no linked applicant/employee) is matched against later.
  recipient_email TEXT NOT NULL,
  -- Known upfront for an applicant/employee who already has a CQrityjob
  -- account; filled in later (exactly once) when an unknown recipient
  -- signs in/registers with the matching verified email.
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  language TEXT NOT NULL DEFAULT 'sv' CHECK (language IN ('sv', 'en')),
  employer_message TEXT,

  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'opened', 'started', 'completed', 'expired', 'cancelled')),

  invitation_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,

  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Client-generated idempotency key for the completion attempt (same
  -- pattern as security-career-assessment.tsx's completionId), so a
  -- duplicate submit (double-click, retry after a flaky response) can
  -- never be processed twice. Set on first "start", never changed after.
  completion_id UUID,

  -- Captured at completion. Immutable afterward (see trigger below).
  answers JSONB,
  engine_result JSONB,

  -- Set once a real assessment_runs row exists for this completion (see
  -- rationale #1 above). Null forever for a recipient who never creates
  -- an account -- the employer report never depends on this being set.
  assessment_run_id UUID REFERENCES public.assessment_runs(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX assessment_assignments_employer_idx
  ON public.assessment_assignments (employer_id, status, created_at DESC);
CREATE INDEX assessment_assignments_application_idx
  ON public.assessment_assignments (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX assessment_assignments_employee_idx
  ON public.assessment_assignments (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX assessment_assignments_recipient_user_idx
  ON public.assessment_assignments (recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX assessment_assignments_run_idx
  ON public.assessment_assignments (assessment_run_id) WHERE assessment_run_id IS NOT NULL;

COMMENT ON TABLE public.assessment_assignments IS
  'Employer-initiated assessment assignments (recruitment or workforce development). Caches its own completion (answers + computed EngineResultV1) so an employer report never depends on the recipient having a CQrityjob account; assessment_run_id is set only when a real assessment_runs row exists for the same completion, via the existing saveMyCareerReport pipeline -- never a second scoring implementation.';
COMMENT ON COLUMN public.assessment_assignments.invitation_token_hash IS
  'SHA-256 hex digest of the recipient''s bearer invitation token. The plaintext token is never stored -- it is generated and returned exactly once, at creation, for the employer to copy/send.';

GRANT SELECT, INSERT, UPDATE ON public.assessment_assignments TO authenticated;
GRANT ALL ON public.assessment_assignments TO service_role;

ALTER TABLE public.assessment_assignments ENABLE ROW LEVEL SECURITY;

-- Employer read: any active-or-draft-employer member may see their own
-- organisation's assignments (same viewing tier as the catalogue itself).
CREATE POLICY "assignments_employer_select" ON public.assessment_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

-- Employer create: assigning a real assessment to a real person is a
-- real-consequence action -- gated on the organisation being genuinely
-- active, exactly like job publishing.
CREATE POLICY "assignments_employer_insert" ON public.assessment_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
    AND assigned_by = auth.uid()
  );

-- Employer update: used only for cancellation in practice (the
-- immutability trigger below blocks every other meaningful column from
-- being changed by this policy alone).
CREATE POLICY "assignments_employer_update" ON public.assessment_assignments
  FOR UPDATE TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

-- A signed-in recipient may see their own assignment(s) directly once
-- recipient_user_id has been set (either known upfront, or after linking).
-- Recipient access *before* that point is exclusively via the invitation
-- token through a dedicated server function using the service-role client
-- -- never raw RLS, since an anonymous visitor has no Postgres role a
-- policy could match.
CREATE POLICY "assignments_recipient_select_own" ON public.assessment_assignments
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

-- Immutability guard: once set, the identity of what was assigned, to
-- whom, and under what token can never change. Only status/timestamp/
-- completion-data columns and recipient_user_id (set exactly once, by the
-- linking step) may move forward.
CREATE OR REPLACE FUNCTION public.assessment_assignments_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employer_id <> OLD.employer_id
     OR NEW.assessment_id <> OLD.assessment_id
     OR NEW.assessment_version_id <> OLD.assessment_version_id
     OR NEW.profile_id <> OLD.profile_id
     OR NEW.recipient_email <> OLD.recipient_email
     OR NEW.invitation_token_hash <> OLD.invitation_token_hash
     OR NEW.assigned_by <> OLD.assigned_by
     OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'ASSIGNMENT_IMMUTABLE_FIELD_CHANGE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.recipient_user_id IS NOT NULL AND NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id THEN
    RAISE EXCEPTION 'ASSIGNMENT_IMMUTABLE_FIELD_CHANGE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.assessment_run_id IS NOT NULL AND NEW.assessment_run_id IS DISTINCT FROM OLD.assessment_run_id THEN
    RAISE EXCEPTION 'ASSIGNMENT_IMMUTABLE_FIELD_CHANGE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'completed' AND (NEW.answers IS DISTINCT FROM OLD.answers OR NEW.engine_result IS DISTINCT FROM OLD.engine_result) THEN
    RAISE EXCEPTION 'ASSIGNMENT_IMMUTABLE_FIELD_CHANGE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_assignments_immutable_guard() FROM PUBLIC;

CREATE TRIGGER assessment_assignments_immutable_guard_trg
  BEFORE UPDATE ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.assessment_assignments_immutable_guard();

CREATE TRIGGER set_assessment_assignments_updated_at
  BEFORE UPDATE ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
