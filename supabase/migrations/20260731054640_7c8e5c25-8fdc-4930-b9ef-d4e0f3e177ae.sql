-- Security Career Discovery v3.1 — PR 3: atomic, idempotent completion. ADDITIVE ONLY.

CREATE OR REPLACE FUNCTION public.cd_v31_validate_session_evidence(_session_id uuid)
RETURNS TABLE (code text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s record;
  _dv record;
  _expected integer;
  _answered integer;
  _bad_option text;
  _violations integer;
BEGIN
  SELECT * INTO _s FROM public.cd_sessions WHERE id = _session_id;
  IF _s.id IS NULL THEN
    RETURN QUERY SELECT 'CD_SESSION_NOT_FOUND', _session_id::text;
    RETURN;
  END IF;

  SELECT * INTO _dv FROM public.cd_definition_versions WHERE id = _s.definition_version_id;
  IF _dv.id IS NULL THEN
    RETURN QUERY SELECT 'CD_DEFINITION_VERSION_MISSING', _s.definition_version_id::text;
    RETURN;
  END IF;

  IF _dv.lifecycle_status NOT IN ('internal_test', 'pilot', 'active') THEN
    RETURN QUERY SELECT 'CD_VERSION_NOT_ADMINISTRABLE', _dv.lifecycle_status;
  END IF;

  SELECT count(*) INTO _expected
    FROM public.cd_definition_items
   WHERE definition_version_id = _s.definition_version_id
     AND is_scored AND item_kind IN ('scale', 'single_choice');

  SELECT count(*) INTO _answered
    FROM public.cd_evidence e
    JOIN public.cd_definition_items di
      ON di.definition_version_id = _s.definition_version_id
     AND di.item_id = e.item_id
   WHERE e.session_id = _session_id
     AND di.is_scored AND di.item_kind IN ('scale', 'single_choice');

  IF _expected = 0 THEN
    RETURN QUERY SELECT 'CD_NO_SCORED_ITEMS',
      'the definition version registers no scale or single_choice items';
  ELSIF _answered <> _expected THEN
    RETURN QUERY SELECT 'CD_CORE_INCOMPLETE',
      format('%s of %s scored items answered', _answered, _expected);
  END IF;

  SELECT string_agg(e.item_id || ' <- ' || e.option_id, ', ') INTO _bad_option
    FROM public.cd_evidence e
   WHERE e.session_id = _session_id
     AND e.option_id IS NOT NULL
     AND e.option_id NOT LIKE e.item_id || '\_%';

  IF _bad_option IS NOT NULL THEN
    RETURN QUERY SELECT 'CD_OPTION_ITEM_MISMATCH', _bad_option;
  END IF;

  SELECT string_agg(DISTINCT e.option_id, ', ') INTO _bad_option
    FROM public.cd_evidence e
   WHERE e.session_id = _session_id
     AND e.option_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.cd_option_loadings l
        WHERE l.option_id = e.option_id
          AND l.scoring_version = _dv.scoring_version);

  IF _bad_option IS NOT NULL THEN
    RETURN QUERY SELECT 'CD_OPTION_NOT_IN_MATRIX', _bad_option;
  END IF;

  SELECT count(*) INTO _violations
    FROM public.cd_validate_option_matrix(_dv.scoring_version);
  IF _violations > 0 THEN
    RETURN QUERY SELECT 'CD_OPTION_MATRIX_INVALID',
      format('%s set-level violation(s) in scoring version %s', _violations, _dv.scoring_version);
  END IF;

  RETURN;
END $$;

COMMENT ON FUNCTION public.cd_v31_validate_session_evidence(uuid) IS
  'Returns one row per reason this session may not be completed. Zero rows means the evidence is fit to score. Read-only and side-effect free.';

REVOKE ALL ON FUNCTION public.cd_v31_validate_session_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_v31_validate_session_evidence(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cd_v31_complete_session(
  _session_id                 uuid,
  _payload                    jsonb,
  _pattern_definition_version text,
  _completed_at               timestamptz
)
RETURNS TABLE (snapshot_id uuid, was_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s          record;
  _existing   uuid;
  _new        uuid;
  _failures   text;
  _areas      jsonb;
BEGIN
  SELECT * INTO _s FROM public.cd_sessions WHERE id = _session_id FOR UPDATE;

  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'CD_SESSION_NOT_FOUND: %', _session_id USING ERRCODE = 'no_data_found';
  END IF;

  IF auth.uid() IS NOT NULL AND _s.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CD_NOT_SESSION_OWNER: a session may only be completed by its owner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO _existing FROM public.cd_report_snapshots WHERE session_id = _session_id;
  IF _existing IS NOT NULL THEN
    RETURN QUERY SELECT _existing, false;
    RETURN;
  END IF;

  IF _s.status = 'completed' THEN
    RAISE EXCEPTION 'CD_COMPLETED_WITHOUT_SNAPSHOT: session % is completed but has no report',
      _session_id USING ERRCODE = 'internal_error';
  END IF;

  SELECT string_agg(code || ' (' || detail || ')', '; ') INTO _failures
    FROM public.cd_v31_validate_session_evidence(_session_id);

  IF _failures IS NOT NULL THEN
    RAISE EXCEPTION 'CD_VALIDATION_FAILED: %', _failures USING ERRCODE = 'check_violation';
  END IF;

  IF _payload IS NULL OR _payload->'outputA' IS NULL OR _payload->'outputB' IS NULL THEN
    RAISE EXCEPTION 'CD_PAYLOAD_INCOMPLETE: outputA and outputB are both required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _payload->'versions'->>'reportSchemaVersion' IS NULL THEN
    RAISE EXCEPTION 'CD_PAYLOAD_UNVERSIONED: the payload carries no report schema version'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _pattern_definition_version IS NULL
     OR _pattern_definition_version <> (_payload->'versions'->>'patternDefinitionVersion') THEN
    RAISE EXCEPTION 'CD_PATTERN_VERSION_MISMATCH: column and payload disagree'
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_array_length(COALESCE(_payload->'professions'->'matches', '[]'::jsonb)) > 0
     AND NOT EXISTS (SELECT 1 FROM public.cd_professions WHERE approved_for_ranking) THEN
    RAISE EXCEPTION 'CD_UNAPPROVED_PROFESSION_RANKING: no profession is approved for ranking'
      USING ERRCODE = 'check_violation';
  END IF;

  _areas := COALESCE(_payload->'outputA'->'areas', '[]'::jsonb);
  IF jsonb_array_length(_areas) = 0 THEN
    RAISE EXCEPTION 'CD_EMPTY_RANKING: a report cannot be stored with no ranked Security Career Areas'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version,
     dna_scores, career_areas, confidence, coverage, contextual_tags,
     pattern_definition_version, patterns, candidate_story, generated_at)
  VALUES
    (_session_id, 'derived', 'derived', 'derived', 'derived',
     jsonb_build_object('report', _payload),
     _areas,
     COALESCE(_payload->'outputA'->'confidence', '{}'::jsonb),
     COALESCE(_payload->'outputA'->'coverage', '{}'::jsonb),
     ARRAY[]::text[],
     _pattern_definition_version,
     COALESCE(_payload->'outputA', '{}'::jsonb),
     COALESCE(_payload->'outputB', '{}'::jsonb),
     _completed_at)
  RETURNING id INTO _new;

  PERFORM set_config('cqj.cd_completing', _session_id::text, true);

  UPDATE public.cd_sessions
     SET status = 'completed', completed_at = _completed_at
   WHERE id = _session_id;

  PERFORM set_config('cqj.cd_completing', '', true);

  RETURN QUERY SELECT _new, true;
END $$;

COMMENT ON FUNCTION public.cd_v31_complete_session(uuid, jsonb, text, timestamptz) IS
  'Atomic, idempotent v3.1 completion. Returns (snapshot_id, was_created).';

REVOKE ALL ON FUNCTION public.cd_v31_complete_session(uuid, jsonb, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_v31_complete_session(uuid, jsonb, text, timestamptz)
  TO authenticated, service_role;

DROP VIEW IF EXISTS public.cd_v31_stored_reports;
CREATE VIEW public.cd_v31_stored_reports
WITH (security_invoker = true) AS
SELECT
  s.id                          AS snapshot_id,
  s.session_id,
  s.generated_at,
  s.definition_version,
  s.content_version,
  s.scoring_version,
  s.pattern_definition_version,
  s.dna_scores -> 'report' -> 'versions'  AS versions,
  s.dna_scores -> 'report' -> 'locale'    AS locale,
  s.patterns                    AS output_a,
  s.candidate_story             AS output_b,
  s.career_areas
FROM public.cd_report_snapshots s;

COMMENT ON VIEW public.cd_v31_stored_reports IS
  'A stored report, read from the snapshot alone. Joins no definition, item or matrix table. security_invoker so snapshot RLS still applies to the reader.';

GRANT SELECT ON public.cd_v31_stored_reports TO authenticated;

DO $$
DECLARE _fn integer; _view integer;
BEGIN
  SELECT count(*) INTO _fn FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('cd_v31_complete_session', 'cd_v31_validate_session_evidence');
  IF _fn <> 2 THEN
    RAISE EXCEPTION 'v3.1 completion functions did not install (found %)', _fn;
  END IF;

  SELECT count(*) INTO _view FROM information_schema.views
   WHERE table_schema = 'public' AND table_name = 'cd_v31_stored_reports';
  IF _view <> 1 THEN
    RAISE EXCEPTION 'cd_v31_stored_reports view did not install';
  END IF;

  -- The v3.0 six-argument completion contract must still exist, untouched.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session' AND p.pronargs = 6)
  THEN
    RAISE EXCEPTION 'the v3.0 completion contract changed arity';
  END IF;

  RAISE NOTICE 'Career Discovery v3.1 completion layer installed and verified.';
END $$;