-- Security Career Discovery v3.0 — internal-test enablement and atomic
-- report completion.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND c.relname = 'scp_item_versions'
      AND p.proname = 'scp_guard_version_starts_as_draft'
  ) THEN
    EXECUTE 'CREATE TRIGGER scp_item_versions_insert_status
             BEFORE INSERT ON public.scp_item_versions
             FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft()';
    RAISE NOTICE 'Restored the scp_item_versions draft guard dropped by the Cloud sync re-issue.';
  END IF;
END $$;

CREATE TABLE public.cd_internal_testers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

COMMENT ON TABLE public.cd_internal_testers IS
  'Named, informed participants authorised to run internal_test sessions of Security Career Discovery.';

ALTER TABLE public.cd_internal_testers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cd_internal_testers TO authenticated;
GRANT ALL    ON public.cd_internal_testers TO service_role;

CREATE POLICY "cd testers see own membership" ON public.cd_internal_testers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.cd_is_internal_tester(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_platform_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.cd_internal_testers t WHERE t.user_id = _user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.cd_is_internal_tester(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_is_internal_tester(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cd_grant_internal_tester(_user_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'CD_GRANT_REQUIRES_ADMIN: only a platform administrator may authorise an internal tester'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.cd_internal_testers (user_id, granted_by, note)
  VALUES (_user_id, auth.uid(), _note)
  ON CONFLICT (user_id) DO NOTHING;
END; $$;

REVOKE ALL ON FUNCTION public.cd_grant_internal_tester(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_grant_internal_tester(uuid, text) TO authenticated, service_role;

UPDATE public.cd_definition_versions
SET lifecycle_status = 'internal_test'
WHERE assessment_id = 'security-career-discovery-v3'
  AND definition_version = '2026-scd-v3.0.0'
  AND lifecycle_status = 'design';

DO $$
DECLARE _status text; _visible boolean;
BEGIN
  SELECT lifecycle_status INTO _status FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3';
  SELECT employer_visible INTO _visible FROM public.assessments
   WHERE id = 'security-career-discovery-v3';

  IF _status <> 'internal_test' THEN
    RAISE EXCEPTION 'CD_PROMOTION_FAILED: expected internal_test, got %', _status;
  END IF;
  IF _visible THEN
    RAISE EXCEPTION 'CD_EMPLOYER_VISIBILITY_LEAKED: employer_visible must remain false';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cd_begin_internal_test_session(
  _definition_version_id uuid,
  _locale text DEFAULT 'sv',
  _context_status text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _new_id uuid; _existing uuid;
BEGIN
  IF NOT public.cd_is_internal_tester(auth.uid()) THEN
    RAISE EXCEPTION 'CD_INTERNAL_TEST_NOT_AUTHORISED: caller is not an authorised internal tester'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT lifecycle_status INTO _status
  FROM public.cd_definition_versions WHERE id = _definition_version_id;

  IF _status IS DISTINCT FROM 'internal_test' THEN
    RAISE EXCEPTION
      'CD_NOT_AN_INTERNAL_TEST_VERSION: lifecycle_status is %, expected internal_test',
      COALESCE(_status, 'unknown') USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO _existing FROM public.cd_sessions
   WHERE user_id = auth.uid()
     AND definition_version_id = _definition_version_id
     AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  PERFORM set_config('cqj.cd_internal_test', 'on', true);

  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, context_status, is_internal_test)
  VALUES (_definition_version_id, auth.uid(), _locale, _context_status, true)
  RETURNING id INTO _new_id;

  PERFORM set_config('cqj.cd_internal_test', '', true);
  RETURN _new_id;
END; $$;

REVOKE ALL ON FUNCTION public.cd_begin_internal_test_session(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_begin_internal_test_session(uuid, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cd_complete_session(
  _session_id uuid,
  _dna_scores jsonb,
  _career_areas jsonb,
  _confidence jsonb,
  _coverage jsonb,
  _contextual_tags text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _session public.cd_sessions%ROWTYPE;
  _snapshot_id uuid;
  _core record;
BEGIN
  SELECT * INTO _session FROM public.cd_sessions
   WHERE id = _session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CD_SESSION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF _session.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'CD_NOT_SESSION_OWNER: caller does not own this session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _session.status = 'completed' THEN
    RAISE EXCEPTION 'CD_ALREADY_COMPLETED: session is already finished'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _core FROM public.cd_session_core_completion(_session_id);
  IF _core.answered <> _core.expected
     OR array_length(_core.missing, 1) IS NOT NULL
     OR array_length(_core.unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'CD_CORE_INCOMPLETE: core answers do not match the definition (expected=%, answered=%, missing=%, unexpected=%)',
      _core.expected, _core.answered, _core.missing, _core.unexpected
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version,
     dna_scores, career_areas, confidence, coverage, contextual_tags)
  VALUES
    (_session_id, 'derived', 'derived', 'derived', 'derived',
     COALESCE(_dna_scores, '{}'::jsonb), _career_areas,
     COALESCE(_confidence, '{}'::jsonb), COALESCE(_coverage, '{}'::jsonb),
     COALESCE(_contextual_tags, ARRAY[]::text[]))
  RETURNING id INTO _snapshot_id;

  PERFORM set_config('cqj.cd_completing', _session_id::text, true);

  UPDATE public.cd_sessions
     SET status = 'completed', completed_at = now()
   WHERE id = _session_id;

  PERFORM set_config('cqj.cd_completing', '', true);

  RETURN _snapshot_id;
END; $$;

REVOKE ALL ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[])
  TO service_role;

COMMENT ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[]) IS
  'The only path to a completed Security Career Discovery session.';

CREATE OR REPLACE FUNCTION public.cd_guard_completion_is_server_side()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'CD_COMPLETED_IS_TERMINAL: a completed session cannot be reopened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF COALESCE(current_setting('cqj.cd_completing', true), '') <> NEW.id::text THEN
      RAISE EXCEPTION
        'CD_COMPLETION_REQUIRES_SERVER_PATH: a session is completed only by cd_complete_session()'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status <> 'completed' AND NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_COMPLETED_AT_WITHOUT_COMPLETION: completed_at may only be set when status is completed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'CD_COMPLETED_AT_IMMUTABLE: completed_at cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE VIEW public.cd_my_report_history
WITH (security_invoker = true) AS
SELECT
  r.id            AS snapshot_id,
  r.session_id,
  r.generated_at,
  r.definition_version,
  r.content_version,
  r.scoring_version,
  r.taxonomy_version,
  r.context_status,
  r.discovery_goal,
  s.locale,
  s.is_internal_test,
  (r.career_areas -> 0 ->> 'areaId') AS top_area_id
FROM public.cd_report_snapshots r
JOIN public.cd_sessions s ON s.id = r.session_id
ORDER BY r.generated_at DESC;

COMMENT ON VIEW public.cd_my_report_history IS
  'Owner-scoped Security Career Discovery report history, newest first.';

GRANT SELECT ON public.cd_my_report_history TO authenticated;
GRANT SELECT ON public.cd_my_report_history TO service_role;