-- Career Discovery: the ranking-eligibility guard follows the recommendation.
--
-- ── WHY THIS MIGRATION EXISTS ─────────────────────────────────────────────
--
-- 20260818100000 made profession ranking a PER-MATCH check: every profession
-- written into a candidate-facing snapshot must itself exist, be approved for
-- ranking, and not be derived from an area. It checked the two places a
-- profession could be named at the time -- `professions.matches` and
-- `professions.currentProfessionMatch`.
--
-- The report now carries a third, and it is the most prominent of the three:
-- `professions.ranked`, the always-present top-3 occupational recommendation
-- (see src/lib/career-discovery/v31/professions.ts, RankedProfession). It
-- exists because every threshold in the matching engine is an exclusion, so a
-- genuinely balanced profile could clear nothing and a candidate could finish
-- twenty-eight questions with no occupation named at all.
--
-- A new candidate-facing field that names professions and is NOT covered by
-- the eligibility guard would be precisely the hole 20260818100000 was written
-- to close, reopened one field along -- and reopened at the headline of the
-- report rather than in a list further down. So the guard follows it.
--
-- ── WHAT THIS CHANGES ─────────────────────────────────────────────────────
--
-- One UNION ALL branch inside cd_v31_complete_session's eligibility SELECT.
-- Nothing else: no scoring, no calibration, no band, no weight, no profession
-- row, no approval state, no policy, no grant, no column, and no already-
-- written snapshot. The failure mode is unchanged and still fails closed --
-- the exception aborts before the snapshot INSERT, so nothing partial
-- persists and no ineligible profession is quietly filtered out after
-- scoring, which would be a different lie.
--
-- ── WHY IT IS SAFE ON A PAYLOAD THAT HAS NO `ranked` ──────────────────────
--
-- COALESCE(..., '[]'::jsonb) over a missing key yields an empty array, so an
-- older client -- or a replay of an older payload -- contributes no rows and
-- behaves exactly as it does today. The field is additive in both directions.
--
-- Reversible: supabase/rollback/20260912090000_cd_ranking_guard_recommendation_rollback.sql

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
      UNION ALL
      -- The ranked recommendation. A THIRD candidate-facing place a
      -- profession is named, and the most prominent of the three: it is the
      -- headline of the report. It is checked by exactly the same rule, so
      -- adding it could not become the one door an unapproved or
      -- area-derived profile walks through.
      --
      -- `match.professionId` is the shape v31/professions.ts writes
      -- (RankedProfession wraps a ProfessionMatch); the flat spellings are
      -- accepted as aliases for the same reason `id` is accepted above --
      -- an unexpected payload shape must be VALIDATED, not skipped.
      SELECT COALESCE(r->'match'->>'professionId',
                      r->>'professionId',
                      r->>'id') AS pid
        FROM jsonb_array_elements(
               COALESCE(_payload->'professions'->'ranked', '[]'::jsonb)) r
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
  -- The per-match guard from 20260818100000 must still be intact. This
  -- migration extends it; it must never be the thing that removed it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_v31_complete_session'
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%p.approved_for_ranking%'
       AND pg_get_functiondef(p.oid) LIKE '%derived_from_area%') THEN
    RAISE EXCEPTION 'CD_RANK_REC: the per-match guard is not present';
  END IF;

  -- The new branch is actually in the body. Without this the migration could
  -- report success while leaving the recommendation unguarded, which is the
  -- one outcome that matters here.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_v31_complete_session'
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%professions''->''ranked%') THEN
    RAISE EXCEPTION 'CD_RANK_REC: the ranked recommendation is not covered by the eligibility guard';
  END IF;

  -- The coarse global-existence form must still be absent.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cd_v31_complete_session'
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%NOT EXISTS (SELECT 1 FROM public.cd_professions WHERE approved_for_ranking)%') THEN
    RAISE EXCEPTION 'CD_RANK_REC: the old global check is back in the body';
  END IF;

  -- Nothing was done to the catalogue itself. Approval is an owner act and
  -- this migration is not one.
  SELECT count(*) INTO _n FROM public.cd_professions WHERE approved_for_ranking;
  IF _n <> (SELECT count(*) FROM public.cd_professions) THEN
    RAISE EXCEPTION 'CD_RANK_REC: profession approval state changed (% of %)',
      _n, (SELECT count(*) FROM public.cd_professions);
  END IF;
END $ctg$;