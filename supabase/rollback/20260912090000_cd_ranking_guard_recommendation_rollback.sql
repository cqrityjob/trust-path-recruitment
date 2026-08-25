-- Rollback for 20260912090000_cd_ranking_guard_recommendation.sql.
--
-- Restores cd_v31_complete_session to the 20260818100000 body: the per-match
-- eligibility guard over `professions.matches` and
-- `professions.currentProfessionMatch`, WITHOUT the `professions.ranked`
-- branch.
--
-- ── READ THIS BEFORE RUNNING IT ───────────────────────────────────────────
--
-- Rolling this back removes eligibility checking from the most prominent
-- profession-naming field in the report. Do it ONLY together with reverting
-- the application code that writes `professions.ranked`
-- (src/lib/career-discovery/v31/professions.ts and snapshot.ts). Rolling the
-- database back alone leaves a client that still writes `ranked` and a
-- database that no longer validates it -- strictly worse than either state.
--
-- Already-written snapshots are untouched, here and by the migration. They
-- were validated by whichever guard was in force when they were created,
-- which is the true record of how they were admitted.

CREATE OR REPLACE FUNCTION public.cd_v31_complete_session(_session_id uuid, _payload jsonb, _pattern_definition_version text, _completed_at timestamp with time zone)
 RETURNS TABLE(snapshot_id uuid, was_created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _bad_profession text;
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

  SELECT string_agg(DISTINCT claimed.pid, ', ' ORDER BY claimed.pid)
    INTO _bad_profession
    FROM (
      SELECT COALESCE(m->>'professionId', m->>'id') AS pid
        FROM jsonb_array_elements(
               COALESCE(_payload->'professions'->'matches', '[]'::jsonb)) m
      UNION ALL
      SELECT COALESCE(_payload->'professions'->'currentProfessionMatch'->>'professionId',
                      _payload->'professions'->'currentProfessionMatch'->>'id')
       WHERE _payload->'professions'->'currentProfessionMatch' IS NOT NULL
         AND jsonb_typeof(_payload->'professions'->'currentProfessionMatch') = 'object'
    ) claimed
    LEFT JOIN public.cd_professions p ON p.profession_id = claimed.pid
   WHERE claimed.pid IS NOT NULL
     AND (p.profession_id IS NULL
          OR NOT p.approved_for_ranking
          OR COALESCE(p.derived_from_area, false));

  IF _bad_profession IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_UNAPPROVED_PROFESSION_RANKING: not eligible for ranking: %', _bad_profession
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
END $function$;

DO $rb$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_v31_complete_session'
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%professions''->''ranked%') THEN
    RAISE EXCEPTION 'CD_RANK_REC_ROLLBACK_INCOMPLETE: the ranked branch is still in the body';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_v31_complete_session'
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%p.approved_for_ranking%'
       AND pg_get_functiondef(p.oid) LIKE '%derived_from_area%') THEN
    RAISE EXCEPTION 'CD_RANK_REC_ROLLBACK_BROKE_GUARD: the per-match guard is gone';
  END IF;
END $rb$;
