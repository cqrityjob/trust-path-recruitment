-- Security Career Discovery v3.1 — PR 1: schema only. ADDITIVE ONLY.

ALTER TABLE public.cd_definition_items
  DROP CONSTRAINT IF EXISTS cd_definition_items_item_kind_check;
ALTER TABLE public.cd_definition_items
  ADD CONSTRAINT cd_definition_items_item_kind_check
  CHECK (item_kind IN ('context','single_axis','trade_off','behavioural','adaptive','scale','single_choice'));

ALTER TABLE public.cd_definition_items
  DROP CONSTRAINT IF EXISTS cd_definition_items_contextual_kinds;
ALTER TABLE public.cd_definition_items
  ADD CONSTRAINT cd_definition_items_contextual_kinds CHECK (
    (item_kind NOT IN ('context','adaptive'))
    OR (evidence_class = 'contextual_self_report')
  );

ALTER TABLE public.cd_definition_items
  DROP CONSTRAINT IF EXISTS cd_definition_items_v31_kinds_are_scored;
ALTER TABLE public.cd_definition_items
  ADD CONSTRAINT cd_definition_items_v31_kinds_are_scored CHECK (
    (item_kind NOT IN ('scale','single_choice'))
    OR (evidence_class = 'orientation_self_report' AND is_scored)
  );

ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_item_kind_check;
ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_item_kind_check
  CHECK (item_kind IN ('context','single_axis','trade_off','behavioural','adaptive','scale','single_choice'));

ALTER TABLE public.cd_sessions
  ADD COLUMN IF NOT EXISTS option_order_seed integer;
COMMENT ON COLUMN public.cd_sessions.option_order_seed IS
  'Per-session seed for randomised single-choice option order (A-5). Assigned at session start, immutable thereafter, NULL for v3.0 sessions.';

CREATE OR REPLACE FUNCTION public.cd_guard_option_order_seed_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.option_order_seed IS NOT NULL
     AND NEW.option_order_seed IS DISTINCT FROM OLD.option_order_seed THEN
    RAISE EXCEPTION 'CD_OPTION_SEED_IMMUTABLE'
      USING HINT = 'option_order_seed is fixed at session start so a run stays reproducible.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cd_sessions_option_seed_immutable_trg ON public.cd_sessions;
CREATE TRIGGER cd_sessions_option_seed_immutable_trg
  BEFORE UPDATE ON public.cd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_option_order_seed_immutable();

ALTER TABLE public.cd_evidence
  ADD COLUMN IF NOT EXISTS option_id     text,
  ADD COLUMN IF NOT EXISTS display_order smallint;
COMMENT ON COLUMN public.cd_evidence.option_id IS
  'Stable option identifier (CQ02_A..CQ20_D) for single-choice items. NULL for scale items, whose value stays in answer_value.';
COMMENT ON COLUMN public.cd_evidence.display_order IS
  'Zero-based position this option occupied on screen for this candidate (A-5).';

ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_option_presence;
ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_option_presence CHECK (
    (item_kind = 'single_choice' AND option_id IS NOT NULL)
    OR (item_kind = 'scale' AND option_id IS NULL)
    OR (item_kind NOT IN ('single_choice','scale'))
  );

ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_display_order_requires_option;
ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_display_order_requires_option CHECK (
    display_order IS NULL OR option_id IS NOT NULL
  );

ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_display_order_range;
ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_display_order_range CHECK (
    display_order IS NULL OR (display_order >= 0 AND display_order <= 3)
  );

ALTER TABLE public.cd_report_snapshots
  ADD COLUMN IF NOT EXISTS pattern_definition_version text,
  ADD COLUMN IF NOT EXISTS patterns        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_story jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.cd_report_snapshots.patterns IS
  'Output A: pattern id, score, rank, dimension values, confidence, applied context signals, growth_edge_dimension_id and progression_target_pattern_id.';
COMMENT ON COLUMN public.cd_report_snapshots.candidate_story IS
  'Output B: the frozen seven-answer candidate story, per locale. Never regenerated at read time.';

CREATE OR REPLACE FUNCTION public.cd_guard_snapshot_v31_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.pattern_definition_version IS DISTINCT FROM OLD.pattern_definition_version
     OR NEW.patterns        IS DISTINCT FROM OLD.patterns
     OR NEW.candidate_story IS DISTINCT FROM OLD.candidate_story THEN
    RAISE EXCEPTION 'CD_SNAPSHOT_IMMUTABLE'
      USING HINT = 'A stored report never changes. Issue a new snapshot instead.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cd_report_snapshots_v31_immutable_trg ON public.cd_report_snapshots;
CREATE TRIGGER cd_report_snapshots_v31_immutable_trg
  BEFORE UPDATE ON public.cd_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_snapshot_v31_immutable();

CREATE TABLE IF NOT EXISTS public.cd_option_loadings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_version text NOT NULL,
  question_id     text NOT NULL,
  option_id       text NOT NULL,
  dimension_id    text NOT NULL,
  role        text NOT NULL CHECK (role IN ('primary','secondary','tertiary')),
  role_weight numeric(4,3) NOT NULL,
  value       numeric(4,3) NOT NULL CHECK (value >= 0 AND value <= 1),
  rationale  text NOT NULL CHECK (length(btrim(rationale)) >= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cd_option_loadings_identity
    UNIQUE (scoring_version, question_id, option_id, dimension_id),
  CONSTRAINT cd_option_loadings_role_weight CHECK (
    (role = 'primary'   AND role_weight = 0.700) OR
    (role = 'secondary' AND role_weight = 0.300) OR
    (role = 'tertiary'  AND role_weight = 0.150)
  ),
  CONSTRAINT cd_option_loadings_option_belongs_to_question CHECK (
    option_id LIKE question_id || '\_%'
  )
);
COMMENT ON TABLE public.cd_option_loadings IS
  'Option-level dimension loadings (owner decision A-3). One row per (scoring_version, question, option, dimension).';
CREATE INDEX IF NOT EXISTS cd_option_loadings_lookup_idx
  ON public.cd_option_loadings (scoring_version, option_id);

CREATE OR REPLACE FUNCTION public.cd_validate_option_matrix(_scoring_version text)
RETURNS TABLE (question_id text, violation text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH spans AS (
    SELECT l.question_id AS qid, l.dimension_id AS did, count(*) AS option_count
      FROM public.cd_option_loadings l
     WHERE l.scoring_version = _scoring_version
     GROUP BY l.question_id, l.dimension_id
  ),
  incomplete AS (
    SELECT s.qid, 'dimension ' || s.did || ' loaded by only '
                  || s.option_count || ' of 4 options' AS violation
      FROM spans s
     WHERE s.option_count <> 4
  ),
  tops AS (
    SELECT DISTINCT l.question_id AS qid, first_value(l.option_id) OVER (
             PARTITION BY l.question_id, l.dimension_id
             ORDER BY l.value DESC, l.option_id
           ) AS option_id
      FROM public.cd_option_loadings l
     WHERE l.scoring_version = _scoring_version
  ),
  dead AS (
    SELECT o.question_id AS qid,
           'option ' || o.option_id || ' is the top signal for no dimension' AS violation
      FROM (SELECT DISTINCT question_id, option_id
              FROM public.cd_option_loadings
             WHERE scoring_version = _scoring_version) o
     WHERE NOT EXISTS (
       SELECT 1 FROM tops t WHERE t.qid = o.question_id AND t.option_id = o.option_id)
  )
  SELECT qid, violation FROM incomplete
  UNION ALL
  SELECT qid, violation FROM dead
  ORDER BY 1, 2;
$$;
COMMENT ON FUNCTION public.cd_validate_option_matrix(text) IS
  'Returns one row per violation of the Delivery A set-level invariants. Zero rows means the matrix is sound.';

CREATE TABLE IF NOT EXISTS public.cd_professions (
  profession_id  text PRIMARY KEY,
  career_area_id text NOT NULL,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  career_stage          text NOT NULL,
  entry_role            boolean NOT NULL DEFAULT false,
  regulated             boolean NOT NULL DEFAULT false,
  transition_difficulty smallint CHECK (
    transition_difficulty IS NULL
    OR (transition_difficulty >= 1 AND transition_difficulty <= 10)),
  review_state text NOT NULL DEFAULT 'ai_researched' CHECK (review_state IN (
    'ai_researched','owner_reviewed','practitioner_reviewed',
    'official_verified','approved_for_ranking')),
  derived_from_area    boolean NOT NULL DEFAULT false,
  approved_for_ranking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cd_professions_id_shape     CHECK (profession_id ~ '^SP[0-9]{3}$'),
  CONSTRAINT cd_professions_area_shape   CHECK (career_area_id ~ '^SCA[0-9]{2}$')
);
COMMENT ON TABLE public.cd_professions IS
  'Layer 4 profession catalogue. approved_for_ranking gates personalised ranking.';

CREATE TABLE IF NOT EXISTS public.cd_profession_profiles (
  profession_id       text NOT NULL
    REFERENCES public.cd_professions(profession_id) ON DELETE CASCADE,
  calibration_version text NOT NULL,
  dimension_id        text NOT NULL,
  band_low  numeric(4,3) NOT NULL CHECK (band_low  >= 0 AND band_low  <= 1),
  band_high numeric(4,3) NOT NULL CHECK (band_high >= 0 AND band_high <= 1),
  weight    numeric(4,3) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1),
  centrality text NOT NULL CHECK (centrality IN ('central','supporting','neutral')),
  evidence_basis text NOT NULL CHECK (
    evidence_basis IN ('official','industry','derived','assumption')),
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profession_id, calibration_version, dimension_id),
  CONSTRAINT cd_profession_profiles_dimension_shape CHECK (dimension_id ~ '^CID[0-9]{2}$'),
  CONSTRAINT cd_profession_profiles_band_order      CHECK (band_low <= band_high),
  CONSTRAINT cd_profession_profiles_cid15_not_matched CHECK (
    dimension_id <> 'CID15' OR weight = 0
  ),
  CONSTRAINT cd_profession_profiles_central_has_weight CHECK (
    centrality <> 'central' OR weight > 0
  )
);
COMMENT ON TABLE public.cd_profession_profiles IS
  'Per-dimension calibrated bands for a profession. CID15 is constrained to weight 0 (owner decision A-4).';

CREATE OR REPLACE FUNCTION public.cd_guard_profession_ranking_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _dims integer;
BEGIN
  IF NOT NEW.approved_for_ranking THEN
    RETURN NEW;
  END IF;

  IF NEW.review_state <> 'approved_for_ranking' THEN
    RAISE EXCEPTION 'CD_PROFESSION_NOT_REVIEWED'
      USING HINT = 'review_state must reach approved_for_ranking first.';
  END IF;

  IF NEW.derived_from_area THEN
    RAISE EXCEPTION 'CD_PROFESSION_DERIVED_FROM_AREA'
      USING HINT = 'A profile mechanically derived from its Career Area may not be offered as a personalised recommendation.';
  END IF;

  SELECT count(DISTINCT dimension_id) INTO _dims
    FROM public.cd_profession_profiles
   WHERE profession_id = NEW.profession_id;

  IF _dims <> 16 THEN
    RAISE EXCEPTION 'CD_PROFESSION_PROFILE_INCOMPLETE'
      USING HINT = 'All 16 dimensions must be calibrated before ranking. Found ' || _dims || '.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cd_professions_ranking_approval_trg ON public.cd_professions;
CREATE TRIGGER cd_professions_ranking_approval_trg
  BEFORE INSERT OR UPDATE ON public.cd_professions
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_profession_ranking_approval();

CREATE TABLE IF NOT EXISTS public.cd_shared_reports (
  token       text PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  snapshot_id uuid NOT NULL
    REFERENCES public.cd_report_snapshots(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  locale      text NOT NULL CHECK (locale IN ('sv','en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT cd_shared_reports_token_shape CHECK (token ~ '^[0-9a-f]{32}$')
);
COMMENT ON TABLE public.cd_shared_reports IS
  'Voluntary share links. No public SELECT policy exists; the public route reads through cd_get_shared_report(), which returns pattern name and one sentence only.';
CREATE INDEX IF NOT EXISTS cd_shared_reports_owner_idx
  ON public.cd_shared_reports (user_id, created_at DESC);

ALTER TABLE public.cd_shared_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cd_shared_reports_owner_select ON public.cd_shared_reports;
CREATE POLICY cd_shared_reports_owner_select ON public.cd_shared_reports
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cd_shared_reports_owner_insert ON public.cd_shared_reports;
CREATE POLICY cd_shared_reports_owner_insert ON public.cd_shared_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.cd_report_snapshots s
        JOIN public.cd_sessions sess ON sess.id = s.session_id
       WHERE s.id = snapshot_id
         AND sess.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cd_shared_reports_owner_delete ON public.cd_shared_reports;
CREATE POLICY cd_shared_reports_owner_delete ON public.cd_shared_reports
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cd_shared_reports_owner_revoke ON public.cd_shared_reports;
CREATE POLICY cd_shared_reports_owner_revoke ON public.cd_shared_reports
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.cd_guard_share_revocation_is_one_way()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.token       IS DISTINCT FROM OLD.token
     OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
     OR NEW.user_id     IS DISTINCT FROM OLD.user_id
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CD_SHARE_IMMUTABLE'
      USING HINT = 'Only revoked_at may change. Delete and re-share instead.';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'CD_SHARE_REVOCATION_IS_ONE_WAY'
      USING HINT = 'A revoked link stays revoked. Create a new share instead.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cd_shared_reports_revocation_trg ON public.cd_shared_reports;
CREATE TRIGGER cd_shared_reports_revocation_trg
  BEFORE UPDATE ON public.cd_shared_reports
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_share_revocation_is_one_way();

CREATE OR REPLACE FUNCTION public.cd_get_shared_report(_token text)
RETURNS TABLE (
  pattern_id   text,
  pattern_name text,
  summary      text,
  locale       text,
  shared_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (s.candidate_story -> 'share' -> sr.locale ->> 'patternId')::text,
    (s.candidate_story -> 'share' -> sr.locale ->> 'name')::text,
    (s.candidate_story -> 'share' -> sr.locale ->> 'summary')::text,
    sr.locale,
    sr.created_at
  FROM public.cd_shared_reports sr
  JOIN public.cd_report_snapshots s ON s.id = sr.snapshot_id
  WHERE sr.token = _token
    AND sr.revoked_at IS NULL
    AND s.candidate_story -> 'share' -> sr.locale IS NOT NULL;
$$;
COMMENT ON FUNCTION public.cd_get_shared_report(text) IS
  'The ONLY read path for a shared report. Returns pattern name and one sentence.';

REVOKE ALL ON FUNCTION public.cd_get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_get_shared_report(text) TO anon, authenticated;

ALTER TABLE public.cd_option_loadings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_professions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_profession_profiles  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cd_option_loadings_read ON public.cd_option_loadings;
CREATE POLICY cd_option_loadings_read ON public.cd_option_loadings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cd_professions_read ON public.cd_professions;
CREATE POLICY cd_professions_read ON public.cd_professions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cd_profession_profiles_read ON public.cd_profession_profiles;
CREATE POLICY cd_profession_profiles_read ON public.cd_profession_profiles
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.cd_option_loadings     TO authenticated;
GRANT SELECT ON public.cd_professions         TO authenticated;
GRANT SELECT ON public.cd_profession_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cd_shared_reports TO authenticated;

GRANT ALL ON public.cd_option_loadings     TO service_role;
GRANT ALL ON public.cd_professions         TO service_role;
GRANT ALL ON public.cd_profession_profiles TO service_role;
GRANT ALL ON public.cd_shared_reports      TO service_role;

DO $$
DECLARE _missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.cd_option_loadings')     IS NULL THEN _missing := _missing || 'cd_option_loadings'; END IF;
  IF to_regclass('public.cd_professions')         IS NULL THEN _missing := _missing || 'cd_professions'; END IF;
  IF to_regclass('public.cd_profession_profiles') IS NULL THEN _missing := _missing || 'cd_profession_profiles'; END IF;
  IF to_regclass('public.cd_shared_reports')      IS NULL THEN _missing := _missing || 'cd_shared_reports'; END IF;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='cd_evidence'
         AND column_name IN ('option_id','display_order')) <> 2
  THEN _missing := _missing || 'cd_evidence.option_id/display_order'; END IF;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='cd_report_snapshots'
         AND column_name IN ('pattern_definition_version','patterns','candidate_story')) <> 3
  THEN _missing := _missing || 'cd_report_snapshots v3.1 columns'; END IF;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='cd_sessions'
         AND column_name='option_order_seed') <> 1
  THEN _missing := _missing || 'cd_sessions.option_order_seed'; END IF;

  IF array_length(_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'v3.1 PR1 schema did not apply cleanly. Missing: %',
      array_to_string(_missing, ', ');
  END IF;

  RAISE NOTICE 'Career Discovery v3.1 PR1 schema applied and verified.';
END $$;