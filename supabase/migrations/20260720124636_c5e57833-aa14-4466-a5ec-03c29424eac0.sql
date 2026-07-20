-- Phase H3.3 combined: platform admin employer moderation + status transition guard
CREATE TABLE public.employer_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved', 'rejected', 'suspended', 'reactivated')),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX employer_moderation_events_employer_idx
  ON public.employer_moderation_events (employer_id, created_at DESC);

COMMENT ON TABLE public.employer_moderation_events IS
  'H3.3. One row per platform-admin moderation decision on an employer''s status. Written exclusively by moderate_employer() (SECURITY DEFINER). Readable only by platform admins.';

GRANT SELECT ON public.employer_moderation_events TO authenticated;
GRANT ALL ON public.employer_moderation_events TO service_role;

ALTER TABLE public.employer_moderation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer_moderation_events_admin_select"
  ON public.employer_moderation_events
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- moderate_employer() with the transaction-local marker (final H3.3 form combining both migrations)
CREATE OR REPLACE FUNCTION public.employers_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.employer_moderation_in_progress', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'employers.status can only be changed via moderate_employer()'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT public.is_platform_admin(auth.uid()) THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'slug cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.employers_validate_before_write() IS
  'H3.2 + H3.3 database-integrity fix. Enforces (1) status can only change inside moderate_employer(); (2) slug cannot be changed by a non-admin employer member.';

CREATE OR REPLACE FUNCTION public.moderate_employer(
  _employer_id uuid,
  _action text,
  _note text DEFAULT NULL
)
RETURNS TABLE (
  employer_id uuid,
  previous_status text,
  new_status text,
  action text,
  admin_user_id uuid,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _current_status text;
  _expected_previous text;
  _target_status text;
  _clean_note text;
  _event_id uuid;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  IF _action NOT IN ('approved', 'rejected', 'suspended', 'reactivated') THEN
    RAISE EXCEPTION 'Invalid moderation action: %', _action;
  END IF;

  _clean_note := NULLIF(btrim(_note), '');
  IF _action IN ('rejected', 'suspended') AND _clean_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for action %', _action
      USING ERRCODE = 'check_violation';
  END IF;
  IF _clean_note IS NOT NULL AND char_length(_clean_note) > 2000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO _current_status
  FROM public.employers
  WHERE id = _employer_id
  FOR UPDATE;

  IF _current_status IS NULL THEN
    RAISE EXCEPTION 'Employer not found';
  END IF;

  CASE _action
    WHEN 'approved' THEN
      _expected_previous := 'pending';
      _target_status := 'active';
    WHEN 'rejected' THEN
      _expected_previous := 'pending';
      _target_status := 'rejected';
    WHEN 'suspended' THEN
      _expected_previous := 'active';
      _target_status := 'suspended';
    WHEN 'reactivated' THEN
      _expected_previous := 'suspended';
      _target_status := 'active';
  END CASE;

  IF _current_status <> _expected_previous THEN
    RAISE EXCEPTION 'Invalid transition: employer status is %, action % requires %',
      _current_status, _action, _expected_previous
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);

  UPDATE public.employers
  SET status = _target_status, updated_at = _now
  WHERE id = _employer_id;

  INSERT INTO public.employer_moderation_events (
    employer_id, action, previous_status, new_status, admin_user_id, note, created_at
  ) VALUES (
    _employer_id, _action, _current_status, _target_status, _caller, _clean_note, _now
  )
  RETURNING id INTO _event_id;

  RETURN QUERY
    SELECT e.employer_id, e.previous_status, e.new_status, e.action, e.admin_user_id, e.note, e.created_at
    FROM public.employer_moderation_events e
    WHERE e.id = _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_employer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_employer(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.moderate_employer(uuid, text, text) IS
  'H3.3, hardened by the H3.3 database-integrity fix. Platform-admin-only. Fixed transition allow-list, note required for rejected/suspended, atomic UPDATE + INSERT, sets transaction-local marker before UPDATE.';