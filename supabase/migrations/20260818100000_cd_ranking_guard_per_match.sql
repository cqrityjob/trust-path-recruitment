-- Career Discovery: profession ranking becomes a per-match check.
--
-- AUTHORISED NARROW PRODUCTION GOVERNANCE FIX. The only runtime change is the
-- ranking-eligibility guard inside cd_v31_complete_session. Scoring, option
-- loadings, Career DNA, profession weights, calibration, ranking order,
-- profession profiles, Career Areas and every already-written snapshot are
-- untouched, and no data migration is required.
--
-- ── THE DEFECT ────────────────────────────────────────────────────────────
--
-- The guard asked one question: "is ANY profession approved for ranking?"
--
--   IF matches > 0 AND NOT EXISTS (SELECT 1 FROM cd_professions
--                                   WHERE approved_for_ranking) THEN raise
--
-- It never looked at the professions in the payload. All 14 professions now
-- carry approved_for_ranking = true, so it could not fire at all, and a
-- completion payload could rank a profession that was unapproved or
-- derived_from_area = true -- straight into an immutable report snapshot a
-- candidate reads.
--
-- That contradicts a recorded owner decision the schema suite states plainly:
-- a mechanically derived profile may never be ranked. It was enforced at
-- APPROVAL time by cd_guard_profession_ranking_approval and unenforced at
-- RANKING time, which is where the consequence actually lands.
--
-- ── THE INVARIANT NOW ─────────────────────────────────────────────────────
--
-- Every profession written into a candidate-facing snapshot must itself be
-- individually eligible: it must exist in cd_professions, be approved for
-- ranking, and not be derived from an area.
--
-- Fails closed. The exception aborts the whole function before the snapshot
-- INSERT, so nothing partial persists and no unapproved profession is quietly
-- filtered out after scoring -- a silently shortened ranking would be a
-- different lie.

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

  -- Per-match eligibility. The previous version asked only whether ANY
  -- profession was approved for ranking -- a global switch that could never
  -- fire once one profession was approved, and that never looked at the
  -- professions actually in this payload.
  --
  -- Both candidate-facing places are checked: the ranked `matches` list and
  -- `currentProfessionMatch`, which is shown just as prominently. `professionId`
  -- is the canonical key (see v31/professions.ts ProfessionMatch); `id` is
  -- accepted as an alias so an older payload shape is validated rather than
  -- slipping past unexamined.
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

-- ── Assertions ────────────────────────────────────────────────────────────

DO $ctg$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_v31_complete_session'
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%p.approved_for_ranking%'
       AND pg_get_functiondef(p.oid) LIKE '%derived_from_area%') THEN
    RAISE EXCEPTION 'CD_RANK_FIX: the per-match guard is not present';
  END IF;

  -- The global-existence form must be gone, or the coarse check survives
  -- alongside the precise one and the defect is only half closed.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_v31_complete_session'
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%NOT EXISTS (SELECT 1 FROM public.cd_professions WHERE approved_for_ranking)%') THEN
    RAISE EXCEPTION 'CD_RANK_FIX: the old global check is still in the body';
  END IF;

  -- Nothing was done to the catalogue itself.
  SELECT count(*) INTO _n FROM public.cd_professions WHERE approved_for_ranking;
  IF _n <> (SELECT count(*) FROM public.cd_professions) THEN
    RAISE EXCEPTION 'CD_RANK_FIX: profession approval state changed (% of %)',
      _n, (SELECT count(*) FROM public.cd_professions);
  END IF;
END $ctg$;
