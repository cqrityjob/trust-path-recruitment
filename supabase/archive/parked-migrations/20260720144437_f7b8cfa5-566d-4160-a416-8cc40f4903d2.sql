-- =============================================================================
-- H3.4A — Candidate Application Core.
-- =============================================================================
ALTER TABLE public.job_applications DROP CONSTRAINT IF EXISTS job_applications_status_check;
UPDATE public.job_applications SET status = 'reviewing' WHERE status = 'viewed';
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_status_check
    CHECK (status IN ('submitted','reviewing','interview','rejected','hired','withdrawn'));

ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_job_id_applicant_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS job_applications_active_unique_idx
  ON public.job_applications (job_id, applicant_user_id)
  WHERE status <> 'withdrawn';

CREATE OR REPLACE FUNCTION public.job_applications_stamp_employer_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _job_employer_id uuid;
  _job_status text;
  _job_application_method text;
BEGIN
  SELECT employer_id, status, application_method
    INTO _job_employer_id, _job_status, _job_application_method
  FROM public.jobs WHERE id = NEW.job_id;
  IF _job_employer_id IS NULL THEN
    RAISE EXCEPTION 'job_id does not reference an existing job';
  END IF;
  IF _job_status <> 'published' OR _job_application_method <> 'internal' THEN
    RAISE EXCEPTION 'This job is not open for on-platform applications'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.employer_id := _job_employer_id;
  RETURN NEW;
END;
$$;

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

REVOKE ALL ON public.job_application_status_events FROM anon;
GRANT SELECT ON public.job_application_status_events TO authenticated;
GRANT ALL ON public.job_application_status_events TO service_role;
ALTER TABLE public.job_application_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_application_status_events_applicant_select"
  ON public.job_application_status_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.job_applications ja
    WHERE ja.id = application_id AND ja.applicant_user_id = auth.uid()));

CREATE POLICY "job_application_status_events_employer_select"
  ON public.job_application_status_events FOR SELECT TO authenticated
  USING (public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id));

CREATE POLICY "job_application_status_events_admin_select"
  ON public.job_application_status_events FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_application_status(
  _application_id uuid, _new_status text, _note text DEFAULT NULL
) RETURNS TABLE (application_id uuid, previous_status text, new_status text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _new_status NOT IN ('reviewing','interview','rejected','hired','withdrawn') THEN
    RAISE EXCEPTION 'Invalid application status: %', _new_status;
  END IF;
  _clean_note := NULLIF(btrim(_note), '');
  IF _clean_note IS NOT NULL AND char_length(_clean_note) > 1000 THEN
    RAISE EXCEPTION 'Note is too long' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  _is_applicant := (_app.applicant_user_id = _caller);
  _is_employer := public.has_employer_role(_caller, _app.employer_id, NULL)
                  AND public.employer_is_active_status(_app.employer_id);
  IF _is_applicant AND _new_status = 'withdrawn' THEN
    IF _app.status NOT IN ('submitted','reviewing','interview') THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, cannot withdraw', _app.status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'candidate';
  ELSIF _is_employer AND _new_status <> 'withdrawn' THEN
    IF NOT (
      (_app.status = 'submitted' AND _new_status IN ('reviewing','rejected')) OR
      (_app.status = 'reviewing' AND _new_status IN ('interview','rejected')) OR
      (_app.status = 'interview' AND _new_status IN ('hired','rejected'))
    ) THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, action % not allowed', _app.status, _new_status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'employer';
  ELSE
    RAISE EXCEPTION 'Forbidden: not authorised to set this application status';
  END IF;
  UPDATE public.job_applications
  SET status = _new_status, updated_at = _now,
      withdrawn_at = CASE WHEN _new_status = 'withdrawn' THEN _now ELSE withdrawn_at END,
      employer_note = CASE WHEN _actor_role = 'employer' AND _clean_note IS NOT NULL THEN _clean_note ELSE employer_note END
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

-- =============================================================================
-- H3.4B — Beta Feedback.
-- =============================================================================
CREATE TABLE public.beta_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category    text NOT NULL CHECK (category IN ('bug','idea','other')),
  message     text NOT NULL CHECK (char_length(btrim(message)) > 0 AND char_length(message) <= 4000),
  page_path   text CHECK (page_path IS NULL OR char_length(page_path) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beta_feedback_created_idx ON public.beta_feedback (created_at DESC);

REVOKE ALL ON public.beta_feedback FROM anon, authenticated;
GRANT INSERT, SELECT ON public.beta_feedback TO authenticated;
GRANT ALL ON public.beta_feedback TO service_role;
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beta_feedback_owner_insert"
  ON public.beta_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "beta_feedback_admin_select"
  ON public.beta_feedback FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));