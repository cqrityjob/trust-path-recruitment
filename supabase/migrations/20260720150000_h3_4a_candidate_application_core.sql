-- =============================================================================
-- H3.4A — Candidate Application Core.
--
-- Ground truth (confirmed by direct migration/code inspection before writing
-- this file): `job_applications` already exists
-- (20260719173615_a71beb5d-e303-4dcb-8938-d87c1d982bd4.sql), with owner-
-- scoped SELECT/INSERT RLS, employer-scoped SELECT RLS, and NO update grant
-- at all for `authenticated` (`GRANT SELECT, INSERT ON job_applications TO
-- authenticated` -- no UPDATE). All prior status changes
-- (withdrawMyApplication / updateApplicationAsEmployer) went through
-- `supabaseAdmin` (service role) directly, with authorization enforced only
-- in TypeScript -- functionally safe today only because there is no other
-- write path, but with no database-level transition validation and no
-- audit trail. This migration closes both gaps from day one, applying the
-- same discipline already established (and hard-won) for employer
-- moderation in H3.3: a single validated, audited, SECURITY DEFINER RPC as
-- the only path a status can ever change through.
--
-- Additive only. Does not edit any already-applied migration; the two
-- pre-existing job_applications functions/constraints touched below are
-- updated via CREATE OR REPLACE / DROP+ADD CONSTRAINT, not by editing the
-- original file.
--
-- What this migration does:
--   1. Extends job_applications.status to the H3.4A model: submitted,
--      reviewing, interview, rejected, hired, withdrawn (was: submitted,
--      viewed, withdrawn -- 'viewed' rows, if any, are migrated to
--      'reviewing').
--   2. Replaces the flat UNIQUE(job_id, applicant_user_id) constraint with
--      a partial unique index that only blocks a second ACTIVE (non-
--      withdrawn) application -- a candidate may re-apply after
--      withdrawing.
--   3. Extends job_applications_stamp_employer_id() (the existing BEFORE
--      INSERT trigger) to also validate, at the database level, that the
--      referenced job is published AND application_method='internal' --
--      "only published internal jobs are applicable" is now enforced
--      structurally, not just by the UI/TS layer that happens to call this
--      insert path today.
--   4. Adds job_application_status_events -- a dedicated, narrowly-columned,
--      append-only audit table (mirrors employer_moderation_events'
--      already-proven design exactly), readable by the applicant, the
--      employer, and platform admins; writable only by the RPC below.
--   5. Adds set_application_status() -- the sole path any existing
--      application's status can ever change through. SECURITY DEFINER,
--      role-derived (candidate vs. employer, never a client-supplied flag),
--      fixed transition allow-list, atomic status update + audit insert.
--      A candidate can only ever request 'withdrawn'; an employer can never
--      request 'withdrawn'. No general UPDATE RLS policy exists for
--      job_applications beyond the pre-existing admin-only one (unchanged),
--      so there remains no client-side raw-update path for a non-admin --
--      the H3.3 "direct authenticated bypass" class of bug is avoided here
--      from the start rather than retrofitted.
--
-- Rollback: revert job_applications_stamp_employer_id() to its pre-this-
-- migration body (20260719173615_a71beb5d-e303-4dcb-8938-d87c1d982bd4.sql);
-- drop set_application_status() and job_application_status_events; restore
-- the flat UNIQUE(job_id, applicant_user_id) constraint; revert the status
-- CHECK constraint to ('submitted','viewed','withdrawn') (only safe if no
-- row has since taken a new status value).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. job_applications.status -- extend to the H3.4A model.
-- -----------------------------------------------------------------------------
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_status_check;

UPDATE public.job_applications SET status = 'reviewing' WHERE status = 'viewed';

ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_status_check
    CHECK (status IN ('submitted','reviewing','interview','rejected','hired','withdrawn'));

COMMENT ON COLUMN public.job_applications.status IS
  'H3.4A lifecycle: submitted -> reviewing -> interview -> rejected|hired '
  '(employer-driven), or submitted/reviewing/interview -> withdrawn '
  '(candidate-driven, own application only). rejected/hired/withdrawn are '
  'terminal. The ONLY path this column can change on an existing row is '
  'set_application_status() below -- there is no UPDATE grant/policy for '
  '`authenticated` on this table at all (see the original H1 migration''s '
  'own comment to that effect, unchanged).';


-- -----------------------------------------------------------------------------
-- 2. job_applications -- duplicate-active-application constraint.
--    "Duplicate active applications blocked" means exactly that: a second
--    non-withdrawn row for the same (job_id, applicant_user_id) is
--    rejected; a withdrawn one is not, so a candidate may re-apply.
-- -----------------------------------------------------------------------------
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_job_id_applicant_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_active_unique_idx
  ON public.job_applications (job_id, applicant_user_id)
  WHERE status <> 'withdrawn';

COMMENT ON INDEX public.job_applications_active_unique_idx IS
  'H3.4A. Partial unique index: blocks a second ACTIVE (non-withdrawn) '
  'application to the same job by the same candidate. Replaces the '
  'original flat UNIQUE(job_id, applicant_user_id), which incorrectly '
  'also blocked re-applying after a withdrawal.';


-- -----------------------------------------------------------------------------
-- 3. job_applications_stamp_employer_id() -- extend the existing BEFORE
--    INSERT trigger to also validate job eligibility at the database
--    level. employer_id continues to be derived exclusively from the
--    referenced job row, never from client input (unchanged from the
--    original definition).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_applications_stamp_employer_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_employer_id uuid;
  _job_status text;
  _job_application_method text;
BEGIN
  SELECT employer_id, status, application_method
    INTO _job_employer_id, _job_status, _job_application_method
  FROM public.jobs
  WHERE id = NEW.job_id;

  IF _job_employer_id IS NULL THEN
    RAISE EXCEPTION 'job_id does not reference an existing job';
  END IF;

  -- H3.4A: "only published internal jobs are applicable" -- enforced here,
  -- not only in the TS layer that happens to be the sole caller today.
  IF _job_status <> 'published' OR _job_application_method <> 'internal' THEN
    RAISE EXCEPTION 'This job is not open for on-platform applications'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.employer_id := _job_employer_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.job_applications_stamp_employer_id() IS
  'H1 original + H3.4A extension. BEFORE INSERT on job_applications: '
  'derives employer_id exclusively from the referenced job (never client-'
  'supplied), and rejects the insert unless that job is currently '
  'status=published AND application_method=internal.';


-- -----------------------------------------------------------------------------
-- 4. job_application_status_events -- dedicated, append-only audit table.
--    Mirrors employer_moderation_events' proven H3.3 design.
-- -----------------------------------------------------------------------------
CREATE TABLE public.job_application_status_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id       uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  actor_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role        text NOT NULL CHECK (actor_role IN ('candidate','employer')),
  previous_status   text NOT NULL,
  new_status        text NOT NULL,
  note              text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_application_status_events_application_idx
  ON public.job_application_status_events (application_id, created_at DESC);

COMMENT ON TABLE public.job_application_status_events IS
  'H3.4A. One row per application status change. Written exclusively by '
  'set_application_status() (SECURITY DEFINER) -- no direct INSERT/UPDATE/'
  'DELETE grant exists for authenticated. Readable by the applicant (their '
  'own application), the employer (their own employer''s applications), '
  'and platform admins.';

REVOKE ALL ON public.job_application_status_events FROM anon;
GRANT SELECT ON public.job_application_status_events TO authenticated;
GRANT ALL ON public.job_application_status_events TO service_role;

ALTER TABLE public.job_application_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_application_status_events_applicant_select"
  ON public.job_application_status_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_applications ja
      WHERE ja.id = application_id AND ja.applicant_user_id = auth.uid()
    )
  );

CREATE POLICY "job_application_status_events_employer_select"
  ON public.job_application_status_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
  );

CREATE POLICY "job_application_status_events_admin_select"
  ON public.job_application_status_events
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));


-- -----------------------------------------------------------------------------
-- 5. set_application_status() -- the sole path an existing application's
--    status can ever change through.
-- -----------------------------------------------------------------------------
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
  'job_applications and inserts exactly one job_application_status_events '
  'row.';
