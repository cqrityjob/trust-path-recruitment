-- Security Career Discovery v3.1 — PR 1: schema only.
--
-- ADDITIVE ONLY. No column is dropped, no data is backfilled, no existing
-- row is rewritten, and no v3.0 behaviour changes. Applying this migration
-- alone leaves the product working exactly as it does today: every object
-- created here is unreferenced until PR 2 seeds it and PR 3 reads it.
--
-- Scoped entirely to cd_* objects. Nothing about career-guidance,
-- public-career-assessment, assessment_runs, assessment_responses,
-- assessment_run_reports, the scp_* namespace or any existing candidate
-- route is read, altered or referenced.
--
-- What this migration adds, and why each piece exists:
--
--   1. cd_definition_items.item_kind gains 'scale' and 'single_choice'.
--      v3.1's 20 core items are 12 scales and 8 single-choice items. The
--      v3.0 vocabulary has no honest name for either.
--   2. cd_sessions.option_order_seed — the per-session permutation seed
--      that makes randomised option order reproducible (owner decision A-5).
--   3. cd_evidence gains option_id + display_order, so an answer records
--      WHICH option was chosen and WHERE it appeared on screen.
--   4. cd_report_snapshots gains pattern_definition_version, patterns
--      (Output A) and candidate_story (Output B).
--   5. cd_option_loadings — the option-level dimension loadings, with a
--      mandatory written rationale per row (owner decision A-3).
--   6. cd_professions + cd_profession_profiles — Layer 4, created now and
--      dark until calibration lands.
--   7. cd_shared_reports — voluntary, revocable, privacy-safe sharing.
--
-- Seeding is deliberately NOT here. The 22 item-registry rows and the 137
-- option loadings must match TypeScript modules that do not exist yet, so
-- they land in PR 2 alongside the modules and the parity guard that proves
-- the two agree. A migration that seeds content its code cannot yet read is
-- a migration nobody can verify.

-- =========================================================================
-- 1. Item kinds: 'scale' and 'single_choice'
-- =========================================================================
--
-- v3.0 kinds ('context','single_axis','trade_off','behavioural','adaptive')
-- describe an 8-axis instrument. v3.1 is 16 dimensions with two item
-- formats, and calling a 1-10 scale item 'single_axis' would be false: a
-- v3.1 scale item loads a primary AND a secondary dimension.
--
-- Widening a CHECK constraint cannot invalidate an existing row.

ALTER TABLE public.cd_definition_items
  DROP CONSTRAINT IF EXISTS cd_definition_items_item_kind_check;

ALTER TABLE public.cd_definition_items
  ADD CONSTRAINT cd_definition_items_item_kind_check
  CHECK (item_kind IN (
    'context','single_axis','trade_off','behavioural','adaptive',
    'scale','single_choice'));

-- The scoring-boundary constraints reference item_kind. Both are restated
-- so the two new kinds are covered rather than silently exempt.
--
-- 'scale' and 'single_choice' are SCORED orientation self-report. They are
-- therefore forbidden from being contextual, which the existing
-- cd_definition_items_scoring_boundary constraint already enforces via
-- evidence_class. What needs restating is the contextual-kinds rule, which
-- listed the kinds that MUST be contextual.

ALTER TABLE public.cd_definition_items
  DROP CONSTRAINT IF EXISTS cd_definition_items_contextual_kinds;

ALTER TABLE public.cd_definition_items
  ADD CONSTRAINT cd_definition_items_contextual_kinds CHECK (
    (item_kind NOT IN ('context','adaptive'))
    OR (evidence_class = 'contextual_self_report')
  );

-- A scored item may never be contextual. Stated directly rather than left
-- as an inference from two other constraints, because this is the rule the
-- whole architecture rests on: adaptive and context answers must never
-- become scoring inputs.
ALTER TABLE public.cd_definition_items
  DROP CONSTRAINT IF EXISTS cd_definition_items_v31_kinds_are_scored;

ALTER TABLE public.cd_definition_items
  ADD CONSTRAINT cd_definition_items_v31_kinds_are_scored CHECK (
    (item_kind NOT IN ('scale','single_choice'))
    OR (evidence_class = 'orientation_self_report' AND is_scored)
  );

-- cd_evidence carries its OWN independent item_kind CHECK. Widening only the
-- registry would have registered v3.1 items that no answer could ever be
-- stored against: the registry would accept a single_choice item, and the
-- first candidate who answered it would hit a constraint violation.
--
-- Found by the v3.1 schema suite, not by reading the migration.

ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_item_kind_check;

ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_item_kind_check
  CHECK (item_kind IN (
    'context','single_axis','trade_off','behavioural','adaptive',
    'scale','single_choice'));

-- =========================================================================
-- 2. cd_sessions.option_order_seed — reproducible randomised order
-- =========================================================================
--
-- Owner decision A-5: option order is randomised per session, the displayed
-- permutation is stored, the same session always renders the same order,
-- and back navigation preserves it.
--
-- One integer does all of that. The alternative — a permutation table, or
-- persisting an array per item — costs a join or a write per item to store
-- something a seed already determines. The seed is assigned once at session
-- start and never changes.
--
-- NULL for every v3.0 session, which had no randomised items.

ALTER TABLE public.cd_sessions
  ADD COLUMN IF NOT EXISTS option_order_seed integer;

COMMENT ON COLUMN public.cd_sessions.option_order_seed IS
  'Per-session seed for randomised single-choice option order (A-5). Assigned '
  'at session start, immutable thereafter, NULL for v3.0 sessions.';

-- Immutable once set. A seed that could change mid-session would silently
-- reorder options under a candidate who navigated back, and would make a
-- completed run unreproducible.
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

-- =========================================================================
-- 3. cd_evidence — which option, and where it appeared
-- =========================================================================

ALTER TABLE public.cd_evidence
  ADD COLUMN IF NOT EXISTS option_id     text,
  ADD COLUMN IF NOT EXISTS display_order smallint;

COMMENT ON COLUMN public.cd_evidence.option_id IS
  'Stable option identifier (CQ02_A..CQ20_D) for single-choice items. NULL '
  'for scale items, whose value stays in answer_value.';
COMMENT ON COLUMN public.cd_evidence.display_order IS
  'Zero-based position this option occupied on screen for this candidate (A-5).';

-- A single-choice answer without an option id is not an answer. Scale items
-- must NOT carry one, so the two formats can never be confused at read time.
ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_option_presence;

ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_option_presence CHECK (
    (item_kind = 'single_choice' AND option_id IS NOT NULL)
    OR (item_kind = 'scale' AND option_id IS NULL)
    OR (item_kind NOT IN ('single_choice','scale'))
  );

-- display_order is meaningless without an option.
ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_display_order_requires_option;

ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_display_order_requires_option CHECK (
    display_order IS NULL OR option_id IS NOT NULL
  );

-- Four options per item, so a stored position outside 0..3 is a bug.
ALTER TABLE public.cd_evidence
  DROP CONSTRAINT IF EXISTS cd_evidence_display_order_range;

ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_display_order_range CHECK (
    display_order IS NULL OR (display_order >= 0 AND display_order <= 3)
  );

-- =========================================================================
-- 4. cd_report_snapshots — patterns and the candidate story
-- =========================================================================
--
-- Output A (patterns) is structured data for the system. Output B
-- (candidate_story) is the frozen seven-answer text the candidate reads.
-- Both are written once at completion and never recomputed, which is what
-- makes a report readable in 2028 exactly as it read the day it was made.

ALTER TABLE public.cd_report_snapshots
  ADD COLUMN IF NOT EXISTS pattern_definition_version text,
  ADD COLUMN IF NOT EXISTS patterns        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_story jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cd_report_snapshots.patterns IS
  'Output A: pattern id, score, rank, dimension values, confidence, applied '
  'context signals, growth_edge_dimension_id and progression_target_pattern_id.';
COMMENT ON COLUMN public.cd_report_snapshots.candidate_story IS
  'Output B: the frozen seven-answer candidate story, per locale. Never '
  'regenerated at read time.';

-- Snapshots are immutable. v3.0 already freezes its own columns; the three
-- new ones join that guarantee rather than sitting outside it.
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

-- =========================================================================
-- 5. cd_option_loadings — how an option becomes evidence
-- =========================================================================
--
-- Owner decision A-3: for every option-level loading store question, option,
-- dimension, role, role weight, normalised value, rationale and scoring
-- version, so the system can always explain why an option contributed to a
-- dimension.
--
-- rationale is NOT NULL by design. Owner decision A-2 requires every
-- tertiary loading to have a written reason and forbids loadings added
-- only to improve coverage statistics. A nullable column would let that
-- discipline decay one row at a time.

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

  -- The approved role weights, stated as data rather than trusted to the
  -- caller. A CHECK does this without a trigger.
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
  'Option-level dimension loadings (owner decision A-3). One row per '
  '(scoring_version, question, option, dimension). Seeded in PR 2 from '
  'src/lib/career-discovery/option-matrix.ts, which a guard script asserts '
  'is identical to this table.';

CREATE INDEX IF NOT EXISTS cd_option_loadings_lookup_idx
  ON public.cd_option_loadings (scoring_version, option_id);

-- -------------------------------------------------------------------------
-- Set-level validation
-- -------------------------------------------------------------------------
--
-- Two invariants from Delivery A cannot be expressed as row constraints,
-- because both are properties of a complete option set and would reject the
-- first row inserted:
--
--   * every option must load EVERY dimension in its question's span, so no
--     candidate ever leaves a spanned dimension unobserved;
--   * every option must be the top scorer on at least one dimension, so no
--     option is dead weight that reads as the wrong answer.
--
-- They are therefore a validation function the test suite and the guard
-- script assert returns zero rows. A deferred constraint trigger would also
-- work and would be considerably harder to read for the same guarantee.

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
  -- Every dimension in a span must be loaded by all four options.
  incomplete AS (
    SELECT s.qid, 'dimension ' || s.did || ' loaded by only '
                  || s.option_count || ' of 4 options' AS violation
      FROM spans s
     WHERE s.option_count <> 4
  ),
  -- Every option must top at least one dimension in its span.
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
  'Returns one row per violation of the Delivery A set-level invariants: '
  'every option loads every dimension in its span, and no option is the top '
  'signal for nothing. Zero rows means the matrix is sound.';

-- =========================================================================
-- 6. Layer 4 — professions and their calibrated profiles
-- =========================================================================
--
-- Created now, dark until calibration lands. approved_for_ranking defaults
-- to false, so an unpopulated Layer 4 does not render an empty state — the
-- profession section simply does not appear.

CREATE TABLE IF NOT EXISTS public.cd_professions (
  profession_id  text PRIMARY KEY,          -- SP001..SP037
  career_area_id text NOT NULL,             -- SCA01..SCA10

  title_sv text NOT NULL,
  title_en text NOT NULL,

  career_stage          text NOT NULL,
  entry_role            boolean NOT NULL DEFAULT false,
  regulated             boolean NOT NULL DEFAULT false,
  transition_difficulty smallint CHECK (
    transition_difficulty IS NULL
    OR (transition_difficulty >= 1 AND transition_difficulty <= 10)),

  -- Owner decision 5: the review progression, and the gate that reads it.
  review_state text NOT NULL DEFAULT 'ai_researched' CHECK (review_state IN (
    'ai_researched','owner_reviewed','practitioner_reviewed',
    'official_verified','approved_for_ranking')),

  -- Only true professions may be ranked. A profile mechanically derived
  -- from its Career Area is visible in Career Center content but must never
  -- appear as a personalised recommendation.
  derived_from_area    boolean NOT NULL DEFAULT false,
  approved_for_ranking boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cd_professions_id_shape     CHECK (profession_id ~ '^SP[0-9]{3}$'),
  CONSTRAINT cd_professions_area_shape   CHECK (career_area_id ~ '^SCA[0-9]{2}$')
);

COMMENT ON TABLE public.cd_professions IS
  'Layer 4 profession catalogue. approved_for_ranking gates personalised '
  'ranking; unapproved professions may still appear in general Career Center '
  'content (owner decision 4).';

CREATE TABLE IF NOT EXISTS public.cd_profession_profiles (
  profession_id       text NOT NULL
    REFERENCES public.cd_professions(profession_id) ON DELETE CASCADE,
  calibration_version text NOT NULL,
  dimension_id        text NOT NULL,

  band_low  numeric(4,3) NOT NULL CHECK (band_low  >= 0 AND band_low  <= 1),
  band_high numeric(4,3) NOT NULL CHECK (band_high >= 0 AND band_high <= 1),
  weight    numeric(4,3) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1),

  centrality text NOT NULL CHECK (centrality IN ('central','supporting','neutral')),

  -- Owner decision 5: every row states where it came from and how sure it is.
  evidence_basis text NOT NULL CHECK (
    evidence_basis IN ('official','industry','derived','assumption')),
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  source_reference text,

  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (profession_id, calibration_version, dimension_id),

  CONSTRAINT cd_profession_profiles_dimension_shape CHECK (dimension_id ~ '^CID[0-9]{2}$'),
  CONSTRAINT cd_profession_profiles_band_order      CHECK (band_low <= band_high),

  -- Owner decision A-4: CID15 has profession-matching weight 0 and may not
  -- differentiate profession matches. Enforced as a constraint so no
  -- calibration row can reintroduce it, in any version, by any author.
  CONSTRAINT cd_profession_profiles_cid15_not_matched CHECK (
    dimension_id <> 'CID15' OR weight = 0
  ),

  -- A dimension the engine gives no weight cannot be described as central.
  CONSTRAINT cd_profession_profiles_central_has_weight CHECK (
    centrality <> 'central' OR weight > 0
  )
);

COMMENT ON TABLE public.cd_profession_profiles IS
  'Per-dimension calibrated bands for a profession. CID15 is constrained to '
  'weight 0 (owner decision A-4).';

-- -------------------------------------------------------------------------
-- The approval gate
-- -------------------------------------------------------------------------
--
-- A profession may only be ranked when it has actually been through review
-- and actually has a complete profile. Both are checked here rather than
-- trusted to whoever runs the UPDATE.

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
      USING HINT = 'A profile mechanically derived from its Career Area may '
                   'not be offered as a personalised recommendation.';
  END IF;

  SELECT count(DISTINCT dimension_id) INTO _dims
    FROM public.cd_profession_profiles
   WHERE profession_id = NEW.profession_id;

  IF _dims <> 16 THEN
    RAISE EXCEPTION 'CD_PROFESSION_PROFILE_INCOMPLETE'
      USING HINT = 'All 16 dimensions must be calibrated before ranking. Found '
                   || _dims || '.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cd_professions_ranking_approval_trg ON public.cd_professions;
CREATE TRIGGER cd_professions_ranking_approval_trg
  BEFORE INSERT OR UPDATE ON public.cd_professions
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_profession_ranking_approval();

-- =========================================================================
-- 7. cd_shared_reports — voluntary, revocable, privacy-safe sharing
-- =========================================================================
--
-- The privacy guarantee is structural, not a promise about what the UI
-- selects. There is NO public read policy on this table and none on
-- cd_report_snapshots. A shared report is readable only through
-- cd_get_shared_report(), which returns the pattern name and one sentence
-- and physically cannot return anything else.
--
-- So a leaked token exposes exactly what the owner chose to publish: a
-- pattern name and a sentence. Not scores, not dimensions, not answers, not
-- eligibility.

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
  'Voluntary share links. No public SELECT policy exists; the public route '
  'reads through cd_get_shared_report(), which returns pattern name and one '
  'sentence only.';

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
    -- You may only share a snapshot that is yours.
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

-- Revocation is the only permitted update, and it is one-way. Un-revoking a
-- link would resurrect a URL the candidate believed they had killed.
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

-- -------------------------------------------------------------------------
-- The only public read path
-- -------------------------------------------------------------------------
--
-- Returns the leading pattern's name and its one shareable sentence, in the
-- locale the sharer chose. Nothing else is selected, so nothing else can
-- leak — including to a future caller who passes a valid token.

-- The projection is the privacy boundary: five scalar fields, none of which
-- is a score, a dimension, an answer or an eligibility statement.
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
  'The ONLY read path for a shared report. Returns pattern name and one '
  'sentence. Cannot return scores, dimensions, answers or eligibility, '
  'because it does not select them.';

REVOKE ALL ON FUNCTION public.cd_get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_get_shared_report(text) TO anon, authenticated;

-- =========================================================================
-- 8. Grants and RLS for the new tables
-- =========================================================================
--
-- cd_option_loadings, cd_professions and cd_profession_profiles are
-- reference data, not candidate data: they describe the instrument and the
-- catalogue, and contain nothing about any person. They are readable by
-- signed-in users so the report can explain itself, and writable by nobody
-- except migrations and service_role.

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

-- anon gets nothing. Anonymous sessions remain reserved and unimplemented
-- (build decision D-7); the only thing a signed-out visitor may reach is
-- cd_get_shared_report(), granted above.

-- =========================================================================
-- 9. Self-verification
-- =========================================================================
--
-- Applying a migration is not evidence that it worked. This block fails the
-- apply if any object it claims to create is absent.

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
