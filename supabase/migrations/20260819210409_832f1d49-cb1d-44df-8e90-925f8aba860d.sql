-- #47 — Training completion is development activity, never verified competence.
--
-- ── THE LOCKED PRODUCT OWNER RULE ───────────────────────────────────────
--
--     counts_toward_maturity = false   for training_completion
--
-- Completing training must leave measured maturity EXACTLY unchanged: same
-- level, same weighted mean, same observation count, same source-type count,
-- same threshold outcome, same strong-evidence qualification.
--
-- ── WHY A FLAG AND NOT A NUMBER ─────────────────────────────────────────
--
-- The obvious fixes are to tune the numbers on the evidence row. Both fail,
-- in opposite directions, and the arithmetic is worth recording because it is
-- the reason this migration exists in this shape.
--
-- scp_compute_maturity awards the highest threshold satisfied on four
-- quantities computed over ALL live evidence for a competency:
--
--     mean = SUM(contribution x confidence) / SUM(confidence)
--     obs  = number of observations
--     ctx  = number of distinct contexts
--     srcs = number of distinct source types
--
-- Take a subject with three assessment observations at contribution 0.80 /
-- confidence 0.90 across two contexts: mean 0.800, obs 3, ctx 2, srcs 1 ->
-- consistent_evidence. Now add two training completions:
--
--   contribution 0.250 / confidence 0.500 (today's writer)
--       mean = (2.16 + 0.25) / 3.7 = 0.651  -> drops to developing_evidence
--
--   contribution 0.000 / confidence 0.500 ("record it as zero")
--       mean = (2.16 + 0.00) / 3.7 = 0.584  -> drops FURTHER
--
--   contribution 0.000 / confidence 0.000 ("make it weightless")
--       mean unchanged at 0.800, but srcs rises 1 -> 2, which satisfies
--       strong_evidence (min_source_types 2) -> level RISES
--
-- So contribution tuning silently PENALISES a participant for completing the
-- development their employer assigned, and confidence tuning silently REWARDS
-- them for it. Neither is acceptable, and neither is visible in the data --
-- both look like an ordinary evidence row.
--
-- The only neutral answer is to keep the row out of the computation entirely.
-- Filtering in the `live` CTE removes it from mean, obs, ctx, srcs, the
-- threshold walk and the safety cap in one place, because every downstream
-- quantity derives from that CTE.
--
-- ── WHY A COLUMN AND NOT A LITERAL ──────────────────────────────────────
--
-- `AND e.source_type <> 'training_completion'` would work today and would be
-- wrong tomorrow. Five further source types are already registered and unused
-- -- manager_observation, certification, verified_credential,
-- practical_exercise, incident_review -- and each needs a deliberate, reviewable
-- answer to the same question. A column makes the answer data, visible in one
-- SELECT, and makes the next decision an UPDATE with a rationale rather than a
-- rediscovery of this argument.
--
-- ── THE DOOR THAT STAYS OPEN ────────────────────────────────────────────
--
-- If a psychometric case is later made that a validated global training module
-- should contribute, this is a single UPDATE plus its evidence. It is NOT
-- something a writer can do implicitly, and employer-owned training must never
-- be granted it: an employer must not be able to raise their own staff's
-- platform-visible competence by authoring their own course.
--
-- ── ADDITIVE-ONLY ───────────────────────────────────────────────────────
--
-- One column with a safe default, one data UPDATE on a 7-row reference table,
-- two function bodies replaced via CREATE OR REPLACE. No table, constraint or
-- domain row is dropped. Existing evidence rows are not touched: there are
-- currently zero training_completion rows, so no historical result changes.
--
-- Dependencies, verified present: public.scp_evidence_source_types,
-- public.scp_competency_evidence, public.scp_maturity_thresholds,
-- public.scp_compute_maturity, public.scp_attempt_maturity

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The rule becomes data
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_evidence_source_types
  ADD COLUMN IF NOT EXISTS counts_toward_maturity boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.scp_evidence_source_types.counts_toward_maturity IS
  'Whether evidence of this source type participates in scp_compute_maturity. '
  'false means the evidence is still written, still queryable and still shown '
  'as history -- it simply never becomes a claim about measured competence. '
  'training_completion is false by locked Product Owner decision: completing '
  'training is development activity, not proof of competence. Changing this to '
  'true for any source type is a governance decision requiring validation '
  'evidence, and must never be granted to employer-owned content.';

UPDATE public.scp_evidence_source_types
   SET counts_toward_maturity = false
 WHERE code = 'training_completion';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Subject-level maturity honours it
--
-- Only the `live` CTE changes: one JOIN and one predicate. The threshold walk,
-- the safety cap and the returned vocabulary are untouched, so no existing
-- result can move for any subject whose evidence is all counting source types.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_compute_maturity(
  _subject_id uuid,
  _competency_version_id uuid,
  _threshold_version text DEFAULT 'v1',
  _at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _obs int; _ctx int; _srcs int; _mean numeric; _concern boolean;
  _level text := 'no_evidence';
  _t record;
BEGIN
  WITH live AS (
    SELECT e.*,
           CASE e.provenance_type
             WHEN 'human_review'   THEN 3
             WHEN 'ai_scoring_run' THEN 2
             ELSE 1
           END AS rank
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m
        ON m.behaviour_version_id = e.behaviour_version_id
      -- The locked rule. Development activity is recorded, not counted.
      JOIN public.scp_evidence_source_types st
        ON st.code = e.source_type AND st.counts_toward_maturity
     WHERE e.subject_id = _subject_id
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.valid_until IS NULL OR e.valid_until > _at)
  ),
  best AS (
    SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
      FROM live
     ORDER BY source_type, source_ref, behaviour_version_id, rank DESC, observed_at DESC
  )
  SELECT count(*),
         count(DISTINCT coalesce(
           context_type || ':' || coalesce(context_ref::text, ''),
           behaviour_version_id::text)),
         count(DISTINCT source_type),
         coalesce(sum(contribution * confidence) / nullif(sum(confidence), 0), 0),
         coalesce(bool_or(safety_finding IN ('low','medium','high','critical')), false)
    INTO _obs, _ctx, _srcs, _mean, _concern
    FROM best;

  IF _obs = 0 THEN
    RETURN 'no_evidence';
  END IF;

  FOR _t IN
    SELECT * FROM public.scp_maturity_thresholds
     WHERE threshold_version = _threshold_version AND is_active
     ORDER BY min_mean_contribution ASC, min_observations ASC
  LOOP
    IF _mean >= _t.min_mean_contribution
       AND _obs  >= _t.min_observations
       AND _ctx  >= _t.min_contexts
       AND _srcs >= _t.min_source_types
    THEN
      _level := _t.level;
    END IF;
  END LOOP;

  IF _concern AND _level IN ('consistent_evidence', 'strong_evidence') THEN
    _level := 'developing_evidence';
  END IF;

  RETURN _level;
END;
$function$;

COMMENT ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) IS
  'Measured maturity for one competency, from counting evidence only. Source '
  'types marked counts_toward_maturity = false -- training_completion among '
  'them -- are excluded from the mean, the observation count, the context '
  'count, the source-type count and the safety cap alike. Completing training '
  'therefore leaves measured maturity exactly unchanged.';

REVOKE ALL ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Attempt-scoped maturity honours it too
--
-- Attempt scoping already excludes training structurally: it filters evidence
-- to source_ref values that are candidate responses of THIS attempt, and a
-- training completion references an attempt or an assignment, never a response.
-- The join is added anyway. Defence in depth is cheap here, and a reader
-- should not have to reconstruct a two-step argument to be sure that a
-- released report cannot contain training.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_attempt_maturity(
  _attempt_id uuid,
  _competency_version_id uuid,
  _threshold_version text DEFAULT 'v1',
  _at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _obs int; _ctx int; _srcs int; _mean numeric; _concern boolean;
  _level text := 'no_evidence';
  _t record;
BEGIN
  WITH live AS (
    SELECT e.*,
           CASE e.provenance_type
             WHEN 'human_review'   THEN 3
             WHEN 'ai_scoring_run' THEN 2
             ELSE 1
           END AS rank
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m
        ON m.behaviour_version_id = e.behaviour_version_id
      JOIN public.scp_evidence_source_types st
        ON st.code = e.source_type AND st.counts_toward_maturity
     WHERE m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.valid_until IS NULL OR e.valid_until > _at)
       AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                             WHERE r.attempt_id = _attempt_id)
  ),
  best AS (
    SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
      FROM live
     ORDER BY source_type, source_ref, behaviour_version_id, rank DESC, observed_at DESC
  )
  SELECT count(*),
         count(DISTINCT coalesce(
           context_type || ':' || coalesce(context_ref::text, ''),
           behaviour_version_id::text)),
         count(DISTINCT source_type),
         coalesce(sum(contribution * confidence) / nullif(sum(confidence), 0), 0),
         coalesce(bool_or(safety_finding IN ('low','medium','high','critical')), false)
    INTO _obs, _ctx, _srcs, _mean, _concern
    FROM best;

  IF _obs = 0 THEN
    RETURN 'no_evidence';
  END IF;

  FOR _t IN
    SELECT * FROM public.scp_maturity_thresholds
     WHERE threshold_version = _threshold_version AND is_active
     ORDER BY min_mean_contribution ASC, min_observations ASC
  LOOP
    IF _mean >= _t.min_mean_contribution
       AND _obs  >= _t.min_observations
       AND _ctx  >= _t.min_contexts
       AND _srcs >= _t.min_source_types
    THEN
      _level := _t.level;
    END IF;
  END LOOP;

  IF _concern AND _level IN ('consistent_evidence', 'strong_evidence') THEN
    _level := 'developing_evidence';
  END IF;

  RETURN _level;
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_attempt_maturity(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _counts boolean; _n int;
BEGIN
  -- 4a. The column exists and training is excluded.
  SELECT counts_toward_maturity INTO _counts
    FROM public.scp_evidence_source_types WHERE code = 'training_completion';
  IF _counts IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SCP_TRAINING_STILL_COUNTS: training_completion.counts_toward_maturity is %', _counts;
  END IF;

  -- 4b. Assessment evidence is untouched -- this migration must not silently
  --     disable the source type the whole product depends on.
  SELECT counts_toward_maturity INTO _counts
    FROM public.scp_evidence_source_types WHERE code = 'assessment_response';
  IF _counts IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SCP_ASSESSMENT_EXCLUDED: assessment_response must still count';
  END IF;

  -- 4c. Both maturity functions actually consult the flag.
  IF pg_get_functiondef('public.scp_compute_maturity(uuid,uuid,text,timestamptz)'::regprocedure)
       NOT LIKE '%counts_toward_maturity%' THEN
    RAISE EXCEPTION 'SCP_MATURITY_IGNORES_FLAG: scp_compute_maturity does not consult counts_toward_maturity';
  END IF;
  IF pg_get_functiondef('public.scp_attempt_maturity(uuid,uuid,text,timestamptz)'::regprocedure)
       NOT LIKE '%counts_toward_maturity%' THEN
    RAISE EXCEPTION 'SCP_MATURITY_IGNORES_FLAG: scp_attempt_maturity does not consult counts_toward_maturity';
  END IF;

  -- 4d. Exactly one source type is excluded today. If a future migration
  --     excludes another, that is a governance decision and this assertion is
  --     the place it gets noticed.
  SELECT count(*) INTO _n FROM public.scp_evidence_source_types
   WHERE NOT counts_toward_maturity;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_MATURITY_EXCLUSION_SET: expected exactly 1 excluded source type, found %', _n;
  END IF;
END $$;