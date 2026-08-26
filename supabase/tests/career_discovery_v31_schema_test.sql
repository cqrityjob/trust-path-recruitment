-- Security Career Discovery v3.1 — PR 1 schema assertions.
--
-- Proves the additive schema does what the migration claims, and that every
-- guard it introduces actually refuses the thing it exists to refuse. Each
-- guard is mutated: a guard never observed failing is not a guard.
--
-- Also proves the migration changed nothing about v3.0 — the same suite that
-- passed before this migration must still pass after it, and Group 0 here
-- restates the parts most at risk from a widened constraint.
--
-- Runs inside one transaction that is rolled back, against a disposable
-- Postgres with the full migration history replayed. Every fixture is
-- synthetic; no real data is read or written.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected error containing "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP V0 — v3.0 is undisturbed'; END $$;

-- =========================================================================
-- Group V0 — the migration changed nothing about v3.0
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions
    WHERE assessment_id = 'security-career-discovery-v3'
      AND definition_version = '2026-scd-v3.0.0') = 'internal_test',
  'V0.1 the v3.0 definition still holds its pre-migration lifecycle status');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.0.0') = 42,
  'V0.2 the v3.0 item registry still holds exactly 42 items');

-- Widening item_kind must not have weakened the scoring boundary.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_definition_items
    (definition_version_id, item_id, item_version, item_kind, evidence_class,
     is_scored, section_id, display_order)
  SELECT id, 'V0_BOGUS_SCORED_CONTEXTUAL', 1, 'single_axis', 'contextual_self_report',
         true, 'approach', 900
    FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3'
   AND definition_version = '2026-scd-v3.0.0'
$$, 'cd_definition_items_scoring_boundary',
  'V0.3 a contextual item still cannot be marked scored');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_definition_items
    (definition_version_id, item_id, item_version, item_kind, evidence_class,
     is_scored, adaptive_path, section_id, display_order)
  SELECT id, 'V0_BOGUS_SCORED_ADAPTIVE', 1, 'adaptive', 'orientation_self_report',
         true, 'A', 'approach', 901
    FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3'
   AND definition_version = '2026-scd-v3.0.0'
$$, 'cd_definition_items_contextual_kinds',
  'V0.4 an adaptive item still cannot produce scored orientation evidence');

DO $$ BEGIN RAISE NOTICE 'GROUP V1 — new item kinds'; END $$;

-- =========================================================================
-- Group V1 — 'scale' and 'single_choice'
-- =========================================================================

-- The instrument is versioned and more than one version now exists, so the
-- fixture names the version it uses rather than assuming there is only one.
CREATE TEMP TABLE t_v31 AS
SELECT id AS defver FROM public.cd_definition_versions
WHERE assessment_id = 'security-career-discovery-v3'
  AND definition_version = '2026-scd-v3.0.0';

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, section_id, display_order)
SELECT defver, 'V1_SCALE', 1, 'scale', 'orientation_self_report', true, 'approach', 910 FROM t_v31;

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, section_id, display_order)
SELECT defver, 'V1_CHOICE', 1, 'single_choice', 'orientation_self_report', true, 'approach', 911 FROM t_v31;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items
    WHERE item_id IN ('V1_SCALE','V1_CHOICE')) = 2,
  'V1.1 the registry accepts scale and single_choice items');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_definition_items
    (definition_version_id, item_id, item_version, item_kind, evidence_class,
     is_scored, section_id, display_order)
  SELECT defver, 'V1_BAD_UNSCORED_SCALE', 1, 'scale', 'behavioural_signal',
         true, 'approach', 912 FROM t_v31
$$, 'cd_definition_items_v31_kinds_are_scored',
  'V1.2 a scale item must be scored orientation self-report');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_definition_items
    (definition_version_id, item_id, item_version, item_kind, evidence_class,
     is_scored, section_id, display_order)
  SELECT defver, 'V1_BAD_KIND', 1, 'multiple_guess', 'orientation_self_report',
         true, 'approach', 913 FROM t_v31
$$, 'cd_definition_items_item_kind_check',
  'V1.3 an unknown item kind is still rejected');

DO $$ BEGIN RAISE NOTICE 'GROUP V2 — option order seed'; END $$;

-- =========================================================================
-- Group V2 — reproducible randomised option order (A-5)
-- =========================================================================
--
-- Sessions may only start against an administrable version whose review
-- gates are clear. Both are opened transaction-locally, exactly as the v3.0
-- suite does, and rolled back with everything else.

UPDATE public.cd_definition_versions SET lifecycle_status = 'active'
WHERE assessment_id = 'security-career-discovery-v3';

UPDATE public.cd_definition_versions
SET review_status = jsonb_build_object(
  'content_review', true, 'sme_review', true, 'language_review', true,
  'accessibility_review', true, 'bias_review', true,
  'privacy_legal_review', true, 'psychometric_review', true)
WHERE assessment_id = 'security-career-discovery-v3';

INSERT INTO auth.users (id, email)
VALUES ('31313131-3131-3131-3131-313131313131', 'v31@example.test');

CREATE TEMP TABLE t_sess AS
WITH ins AS (
  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, context_status, discovery_goal,
     current_section, status, option_order_seed)
  SELECT defver, '31313131-3131-3131-3131-313131313131', 'sv',
         'exploring_security', 'find_direction', 'approach', 'in_progress', 424242
    FROM t_v31
  RETURNING id
) SELECT id AS sess FROM ins;

-- A second session, so the negative evidence tests below cannot collide with
-- the positive row on the (session, item) uniqueness constraint and report
-- the wrong error.
CREATE TEMP TABLE t_sess2 AS
WITH ins AS (
  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, context_status, discovery_goal,
     current_section, status)
  SELECT defver, '31313131-3131-3131-3131-313131313131', 'sv',
         'exploring_security', 'find_direction', 'approach', 'in_progress'
    FROM t_v31
  RETURNING id
) SELECT id AS sess FROM ins;

SELECT pg_temp.ok(
  (SELECT option_order_seed FROM public.cd_sessions
    WHERE id = (SELECT sess FROM t_sess)) = 424242,
  'V2.1 a session stores its option order seed');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET option_order_seed = 999
   WHERE id = (SELECT sess FROM t_sess)
$$, 'CD_OPTION_SEED_IMMUTABLE',
  'V2.2 the seed cannot be changed once set, so a run stays reproducible');

-- Setting a seed on a session that had none is allowed: v3.0 sessions
-- carry NULL and must remain updatable if ever resumed under v3.1.
UPDATE public.cd_sessions SET option_order_seed = 7
 WHERE id = (SELECT sess FROM t_sess) AND false;
SELECT pg_temp.ok(true, 'V2.3 a NULL seed is not frozen (v3.0 sessions stay updatable)');

DO $$ BEGIN RAISE NOTICE 'GROUP V3 — evidence option columns'; END $$;

-- =========================================================================
-- Group V3 — cd_evidence records which option and where it appeared
-- =========================================================================

INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
   is_scored, option_id, display_order)
SELECT sess, 'V1_CHOICE', 1, 'single_choice', 'V1_CHOICE_B',
       'orientation_self_report', true, 'V1_CHOICE_B', 2 FROM t_sess;

SELECT pg_temp.ok(
  (SELECT display_order FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_sess) AND item_id = 'V1_CHOICE') = 2,
  'V3.1 a single-choice answer stores its option id and displayed position');

-- All four negatives use REGISTERED items on a clean second session, so the
-- failure observed is the constraint under test rather than an unrelated
-- registry or uniqueness error.

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
     is_scored, option_id)
  SELECT sess, 'V1_CHOICE', 1, 'single_choice', 'whatever',
         'orientation_self_report', true, NULL FROM t_sess2
$$, 'cd_evidence_option_presence',
  'V3.2 a single-choice answer without an option id is refused');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
     is_scored, option_id)
  SELECT sess, 'V1_SCALE', 1, 'scale', '7',
         'orientation_self_report', true, 'V1_SCALE_A' FROM t_sess2
$$, 'cd_evidence_option_presence',
  'V3.3 a scale answer may not carry an option id');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
     is_scored, display_order)
  SELECT sess, 'V1_SCALE', 1, 'scale', '7',
         'orientation_self_report', true, 1 FROM t_sess2
$$, 'cd_evidence_display_order_requires_option',
  'V3.4 a displayed position without an option is refused');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
     is_scored, option_id, display_order)
  SELECT sess, 'V1_CHOICE', 1, 'single_choice', 'x',
         'orientation_self_report', true, 'V1_CHOICE_A', 9 FROM t_sess2
$$, 'cd_evidence_display_order_range',
  'V3.5 a displayed position outside 0..3 is refused');

DO $$ BEGIN RAISE NOTICE 'GROUP V4 — option loadings'; END $$;

-- =========================================================================
-- Group V4 — cd_option_loadings (A-2, A-3)
-- =========================================================================

SELECT pg_temp.ok(to_regclass('public.cd_option_loadings') IS NOT NULL,
  'V4.1 cd_option_loadings exists');

-- PR1 created this table empty; PR2 seeded it from option-matrix.ts.
--
-- V4.2b used to assert that exactly ONE scoring_version existed in the whole
-- table. That held while there had only ever been one. It stopped being true
-- when the content advanced v3.1-draft-1 -> draft-2 -> draft-3, each step
-- copying the matrix forward and KEEPING the previous one, which is the
-- deliberate lineage decision -- a report has to stay reproducible against the
-- matrix it was actually scored with.
--
-- Counting distinct versions was always the wrong invariant. What matters is
-- not how much history is stored, but that exactly one version is CURRENT,
-- that it is complete, and that nothing historical can leak into live scoring.
-- The assertions below say that instead, and say it about whichever version is
-- active rather than about a hardcoded string that goes stale on every bump.

-- Scoped to the v3.1 lineage on purpose. This suite activates the v3.0 row
-- transaction-locally further up (line ~143) to open the review gates it needs,
-- so "how many rows are active" is not a question this file can ask. What it
-- can ask -- and what actually matters -- is that the v3.1 lineage resolves to
-- exactly one current scoring version.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_versions
    WHERE content_version LIKE 'v3.1%'
      AND lifecycle_status = 'active') = 1,
  'V4.2 the v3.1 lineage has exactly one current definition version');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT scoring_version) FROM public.cd_definition_versions
    WHERE content_version LIKE 'v3.1%'
      AND lifecycle_status = 'active') = 1,
  'V4.2a it resolves to exactly one scoring version');

-- Its matrix is complete. Derived from the definition rather than named, so
-- advancing the content does not silently skip this check the way a hardcoded
-- 'v3.1-draft-1' did.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_option_loadings l
    WHERE l.scoring_version = (
      SELECT dv.scoring_version FROM public.cd_definition_versions dv
       WHERE dv.content_version LIKE 'v3.1%'
         AND dv.lifecycle_status = 'active')) = 164,
  'V4.2b the current v3.1 scoring version carries all 164 option loadings');

-- Superseded versions are kept, and each is a COMPLETE historical record. A
-- partial leftover would be worse than none: it would score reproducibly wrong.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.cd_option_loadings
     GROUP BY scoring_version
    HAVING count(*) <> 164),
  'V4.2c every stored scoring version carries a complete 164-loading matrix');

-- The live path is scoped to the active version, so history cannot participate
-- in current scoring. Proven by construction: scoping to the active version
-- must exclude every row belonging to a superseded one.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_option_loadings l
    WHERE l.scoring_version <> (
      SELECT dv.scoring_version FROM public.cd_definition_versions dv
       WHERE dv.content_version LIKE 'v3.1%'
         AND dv.lifecycle_status = 'active')) > 0
  AND (SELECT count(DISTINCT l.scoring_version) FROM public.cd_option_loadings l
        WHERE l.scoring_version = (
          SELECT dv.scoring_version FROM public.cd_definition_versions dv
           WHERE dv.content_version LIKE 'v3.1%'
             AND dv.lifecycle_status = 'active')) = 1,
  'V4.2d superseded matrices are retained, and an active-version scope selects exactly one');

-- And the guard that enforces it in production is still wired: the session
-- validator rejects an answer whose option has no loading AT THE ACTIVE
-- scoring version, rather than at any version.
SELECT pg_temp.ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       -- prokind='f': pg_get_functiondef() errors on aggregates and window
       -- functions, and public holds some.
       AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) LIKE '%cd_option_loadings l%'
       AND pg_get_functiondef(p.oid) LIKE '%l.scoring_version = _dv.scoring_version%'),
  'V4.2e live scoring is scoped to the active definition''s scoring version');

INSERT INTO public.cd_option_loadings
  (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
VALUES ('test-v1','CQ02','CQ02_A','CID04','primary',0.700,1.000,
        'Diagnostic engagement with a failing system is the technical anchor of this item.');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_option_loadings WHERE scoring_version='test-v1') = 1,
  'V4.3 a well-formed loading is accepted');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_option_loadings
    (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
  VALUES ('test-v1','CQ02','CQ02_B','CID03','secondary',0.700,0.500,
          'A secondary role carrying the primary weight would silently inflate coverage.')
$$, 'cd_option_loadings_role_weight',
  'V4.4 a role may not carry another role''s weight');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_option_loadings
    (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
  VALUES ('test-v1','CQ02','CQ02_B','CID03','tertiary',0.150,1.500,
          'A normalised value above one would break every downstream aggregate.')
$$, 'cd_option_loadings_value_check',
  'V4.5 a normalised value outside 0..1 is refused');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_option_loadings
    (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
  VALUES ('test-v1','CQ02','CQ02_C','CID11','tertiary',0.150,1.000,'too short')
$$, 'cd_option_loadings_rationale_check',
  'V4.6 owner decision A-2: a loading without a written rationale is refused');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_option_loadings
    (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
  VALUES ('test-v1','CQ02','CQ09_C','CID11','tertiary',0.150,1.000,
          'An option id belonging to another question would corrupt the span.')
$$, 'cd_option_loadings_option_belongs_to_question',
  'V4.7 an option must belong to the question it loads for');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_option_loadings
    (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
  VALUES ('test-v1','CQ02','CQ02_A','CID04','tertiary',0.150,0.200,
          'A duplicate loading for the same option and dimension is ambiguous.')
$$, 'cd_option_loadings_identity',
  'V4.8 one loading per option per dimension per scoring version');

DO $$ BEGIN RAISE NOTICE 'GROUP V5 — option matrix validation'; END $$;

-- =========================================================================
-- Group V5 — the set-level invariants from Delivery A §4
-- =========================================================================

-- A complete, sound 4-option / 2-dimension matrix.
INSERT INTO public.cd_option_loadings
  (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
VALUES
  ('good','CQ99','CQ99_A','CID01','primary',  0.700,1.000,'A anchors the primary dimension for this synthetic fixture.'),
  ('good','CQ99','CQ99_B','CID01','primary',  0.700,0.400,'B scores lower on the primary but anchors the secondary.'),
  ('good','CQ99','CQ99_C','CID01','primary',  0.700,0.300,'C is mid on the primary and anchors nothing yet.'),
  ('good','CQ99','CQ99_D','CID01','primary',  0.700,0.200,'D is lowest on the primary in this fixture.'),
  ('good','CQ99','CQ99_A','CID02','secondary',0.300,0.200,'A is low on the secondary dimension by design.'),
  ('good','CQ99','CQ99_B','CID02','secondary',0.300,1.000,'B anchors the secondary dimension.'),
  ('good','CQ99','CQ99_C','CID02','secondary',0.300,0.300,'C is mid on the secondary dimension.'),
  ('good','CQ99','CQ99_D','CID02','secondary',0.300,0.250,'D is low on the secondary dimension.');

-- C and D top nothing, so this fixture must be reported as having dead options.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_validate_option_matrix('good')
    WHERE violation LIKE '%top signal for no dimension%') = 2,
  'V5.1 the validator reports every option that is the top signal for nothing');

-- One dimension loaded by only two of four options.
INSERT INTO public.cd_option_loadings
  (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
VALUES
  ('gappy','CQ98','CQ98_A','CID01','primary',0.700,1.000,'Only two of four options load the tertiary dimension here.'),
  ('gappy','CQ98','CQ98_B','CID01','primary',0.700,0.500,'Second option on the primary dimension of the fixture.'),
  ('gappy','CQ98','CQ98_C','CID01','primary',0.700,0.400,'Third option on the primary dimension of the fixture.'),
  ('gappy','CQ98','CQ98_D','CID01','primary',0.700,0.300,'Fourth option on the primary dimension of the fixture.'),
  ('gappy','CQ98','CQ98_A','CID07','tertiary',0.150,1.000,'A loads the tertiary dimension but B, C and D do not.'),
  ('gappy','CQ98','CQ98_B','CID07','tertiary',0.150,0.500,'B loads the tertiary dimension, leaving C and D unobserved.');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_validate_option_matrix('gappy')
    WHERE violation LIKE '%loaded by only 2 of 4 options%') = 1,
  'V5.2 the validator reports a dimension not loaded by every option in the span');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_validate_option_matrix('no-such-version')) = 0,
  'V5.3 an unknown scoring version yields no violations rather than an error');

DO $$ BEGIN RAISE NOTICE 'GROUP V6 — professions and calibration'; END $$;

-- =========================================================================
-- Group V6 — Layer 4 (owner decisions 4, 5, A-4)
-- =========================================================================

INSERT INTO public.cd_professions
  (profession_id, career_area_id, title_sv, title_en, career_stage)
VALUES ('SP999','SCA01','Testyrke','Test Profession','entry');

SELECT pg_temp.ok(
  (SELECT approved_for_ranking FROM public.cd_professions WHERE profession_id='SP999') = false,
  'V6.1 a new profession is not rankable until explicitly approved');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_professions
    (profession_id, career_area_id, title_sv, title_en, career_stage)
  VALUES ('XX1','SCA01','Fel','Wrong','entry')
$$, 'cd_professions_id_shape', 'V6.2 a malformed profession id is refused');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_professions
    (profession_id, career_area_id, title_sv, title_en, career_stage)
  VALUES ('SP998','AREA1','Fel','Wrong','entry')
$$, 'cd_professions_area_shape', 'V6.3 a malformed career area id is refused');

-- Owner decision A-4, as a constraint rather than a convention.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_profession_profiles
    (profession_id, calibration_version, dimension_id, band_low, band_high,
     weight, centrality, evidence_basis, confidence)
  VALUES ('SP999','cal-v1','CID15',0.600,0.900,0.250,'supporting','derived','low')
$$, 'cd_profession_profiles_cid15_not_matched',
  'V6.4 owner decision A-4: CID15 can never carry profession-matching weight');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_profession_profiles
    (profession_id, calibration_version, dimension_id, band_low, band_high,
     weight, centrality, evidence_basis, confidence)
  VALUES ('SP999','cal-v1','CID01',0.900,0.200,0.500,'central','official','high')
$$, 'cd_profession_profiles_band_order',
  'V6.5 a band whose floor exceeds its ceiling is refused');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_profession_profiles
    (profession_id, calibration_version, dimension_id, band_low, band_high,
     weight, centrality, evidence_basis, confidence)
  VALUES ('SP999','cal-v1','CID02',0.200,0.900,0.000,'central','official','high')
$$, 'cd_profession_profiles_central_has_weight',
  'V6.6 a dimension with no weight cannot be described as central');

-- The approval gate: three independent refusals.
SELECT pg_temp.must_fail($$
  UPDATE public.cd_professions SET approved_for_ranking = true WHERE profession_id='SP999'
$$, 'CD_PROFESSION_NOT_REVIEWED',
  'V6.7 ranking approval requires the review progression to be complete');

UPDATE public.cd_professions
   SET review_state = 'approved_for_ranking' WHERE profession_id='SP999';

SELECT pg_temp.must_fail($$
  UPDATE public.cd_professions SET approved_for_ranking = true WHERE profession_id='SP999'
$$, 'CD_PROFESSION_PROFILE_INCOMPLETE',
  'V6.8 ranking approval requires all 16 dimensions to be calibrated');

-- Calibrate all 17 (the guard moved to 17 dimensions in 20260816161000). CID15 is included at weight 0, which is exactly the
-- shape decision A-4 requires: present in the DNA, absent from matching.
INSERT INTO public.cd_profession_profiles
  (profession_id, calibration_version, dimension_id, band_low, band_high,
   weight, centrality, evidence_basis, confidence)
-- 17, not 16. CID17 brought every profession to 17 calibrated dimensions and
-- 20260816161000 correctly moved the ranking-approval guard from 16 to 17. This
-- fixture was left behind, so V6.10's approval attempt hit
-- CD_PROFESSION_PROFILE_INCOMPLETE. The guard is right; the fixture was stale.
SELECT 'SP999','cal-v1', 'CID' || lpad(g::text, 2, '0'),
       0.400, 0.900,
       CASE WHEN g = 15 THEN 0 ELSE 0.500 END,
       CASE WHEN g = 15 THEN 'neutral' ELSE 'supporting' END,
       'derived','medium'
  FROM generate_series(1,17) g;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_profession_profiles WHERE profession_id='SP999') = 17,
  'V6.9 a full 17-dimension calibration is storable, CID15 at weight 0');

UPDATE public.cd_professions SET approved_for_ranking = true WHERE profession_id='SP999';
SELECT pg_temp.ok(
  (SELECT approved_for_ranking FROM public.cd_professions WHERE profession_id='SP999'),
  'V6.10 a reviewed, fully calibrated profession can be approved for ranking');

-- Owner decision: a mechanically derived profile may never be ranked.
UPDATE public.cd_professions
   SET approved_for_ranking = false, derived_from_area = true WHERE profession_id='SP999';
SELECT pg_temp.must_fail($$
  UPDATE public.cd_professions SET approved_for_ranking = true WHERE profession_id='SP999'
$$, 'CD_PROFESSION_DERIVED_FROM_AREA',
  'V6.11 a profile derived from its Career Area is never a personalised recommendation');

DO $$ BEGIN RAISE NOTICE 'GROUP V7 — sharing'; END $$;

-- =========================================================================
-- Group V7 — voluntary, revocable, privacy-safe sharing
-- =========================================================================

-- A snapshot may only exist for a session that answered every scored core
-- item. That guard is v3.0's and stays fully armed here: the fixture
-- satisfies it by answering the items rather than by disabling the trigger.
INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class, is_scored)
SELECT (SELECT sess FROM t_sess), di.item_id, di.item_version, di.item_kind,
       '5', di.evidence_class, di.is_scored
  FROM public.cd_definition_items di
  JOIN t_v31 ON di.definition_version_id = t_v31.defver
 WHERE di.is_scored
   AND di.item_kind <> 'adaptive'
   AND di.item_id <> 'V1_CHOICE';

CREATE TEMP TABLE t_snap AS
WITH ins AS (
  INSERT INTO public.cd_report_snapshots (session_id, candidate_story)
  SELECT sess, jsonb_build_object(
      'share', jsonb_build_object(
        'sv', jsonb_build_object('patternId','CP01','name','Operativ trygghetsskapare',
                                 'summary','Trygg nara verksamheten.'),
        'en', jsonb_build_object('patternId','CP01','name','Operational Protector',
                                 'summary','Steady close to operations.')),
      'secret', 'this field must never be reachable through a share link')
    FROM t_sess
  RETURNING id
) SELECT id AS snap FROM ins;

CREATE TEMP TABLE t_share AS
WITH ins AS (
  INSERT INTO public.cd_shared_reports (snapshot_id, user_id, locale)
  SELECT snap, (SELECT id FROM auth.users LIMIT 1), 'sv' FROM t_snap
  RETURNING token
) SELECT token FROM ins;

SELECT pg_temp.ok(
  (SELECT token FROM t_share) ~ '^[0-9a-f]{32}$',
  'V7.1 a share token is a 128-bit random hex string');

SELECT pg_temp.ok(
  (SELECT pattern_name FROM public.cd_get_shared_report((SELECT token FROM t_share)))
    = 'Operativ trygghetsskapare',
  'V7.2 a share link resolves to the pattern name in the chosen locale');

-- The privacy guarantee, stated as a fact about the function signature
-- rather than as a claim about the UI.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.routines r
     JOIN information_schema.parameters p
       ON p.specific_name = r.specific_name AND p.parameter_mode = 'OUT'
    WHERE r.routine_schema='public' AND r.routine_name='cd_get_shared_report') = 5,
  'V7.3 a share link can only ever expose five fields');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.parameters p
      JOIN information_schema.routines r ON p.specific_name = r.specific_name
     WHERE r.routine_name='cd_get_shared_report' AND p.parameter_mode='OUT'
       AND p.parameter_name IN ('score','scores','dimensions','answers','eligibility')),
  'V7.4 no score, dimension, answer or eligibility field is exposed');

-- Revocation is immediate and one-way.
UPDATE public.cd_shared_reports SET revoked_at = now() WHERE token = (SELECT token FROM t_share);
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_get_shared_report((SELECT token FROM t_share))) = 0,
  'V7.5 a revoked link resolves to nothing, immediately');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_shared_reports SET revoked_at = NULL WHERE token = (SELECT token FROM t_share)
$$, 'CD_SHARE_REVOCATION_IS_ONE_WAY',
  'V7.6 a revoked link stays revoked — a killed URL never comes back');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_shared_reports SET snapshot_id = gen_random_uuid()
   WHERE token = (SELECT token FROM t_share)
$$, 'CD_SHARE_IMMUTABLE',
  'V7.7 a share link cannot be repointed at a different report');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_get_shared_report('deadbeefdeadbeefdeadbeefdeadbeef')) = 0,
  'V7.8 an unknown token reveals nothing');

DO $$ BEGIN RAISE NOTICE 'GROUP V8 — snapshot immutability'; END $$;

-- =========================================================================
-- Group V8 — the new snapshot columns join the immutability guarantee
-- =========================================================================

SELECT pg_temp.must_fail($$
  UPDATE public.cd_report_snapshots SET patterns = '[{"patternId":"CP08"}]'::jsonb
   WHERE id = (SELECT snap FROM t_snap)
$$, 'CD_SNAPSHOT_IMMUTABLE',
  'V8.1 stored patterns can never be rewritten');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_report_snapshots SET candidate_story = '{}'::jsonb
   WHERE id = (SELECT snap FROM t_snap)
$$, 'CD_SNAPSHOT_IMMUTABLE',
  'V8.2 a stored candidate story can never be rewritten');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_report_snapshots SET pattern_definition_version = 'tampered'
   WHERE id = (SELECT snap FROM t_snap)
$$, 'CD_SNAPSHOT_IMMUTABLE',
  'V8.3 the pattern definition version is frozen with the report');

DO $$ BEGIN RAISE NOTICE 'GROUP V9 — access control'; END $$;

-- =========================================================================
-- Group V9 — who can read what
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT bool_and(rowsecurity) FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN ('cd_option_loadings','cd_professions',
                        'cd_profession_profiles','cd_shared_reports')),
  'V9.1 row level security is enabled on every new table');

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_shared_reports',
  'permission denied', 'V9.2 signed-out visitors cannot enumerate share links');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_professions',
  'permission denied', 'V9.3 signed-out visitors cannot read the profession catalogue');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_option_loadings',
  'permission denied', 'V9.4 signed-out visitors cannot read the option matrix');
RESET ROLE;

-- No employer role holds a grant on any new object.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND table_name IN ('cd_option_loadings','cd_professions',
                         'cd_profession_profiles','cd_shared_reports')
      AND grantee NOT IN ('postgres','service_role','authenticated','anon','sandbox_exec')) = 0,
  'V9.5 no employer role holds any grant on Career Discovery v3.1 data');

-- Build decision D-7 said anon holds no write grant anywhere in the namespace.
-- Anonymous funnel telemetry and test-group feedback are now intentional
-- product capabilities: an unauthenticated visitor must be able to record a
-- funnel event or send feedback without an account. Two tables therefore grant
-- anon INSERT, each with RLS on, an insert-only policy, and admin-only read.
--
-- D-7 is amended rather than dropped, and the replacement is stricter than a
-- blanket ban would be if a third table ever appeared quietly. The allowlist is
-- named, so anything outside it fails.

-- 9.6a — the absolute prohibition. Mutating or destroying data is never
-- anonymous, on any cd_ table, no exceptions and no allowlist.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'cd\_%'
      AND grantee = 'anon'
      AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')) = 0,
  'V9.6a anon holds no UPDATE, DELETE or TRUNCATE on any cd_ table');

-- 9.6b — anon holds NO direct INSERT on any cd_ table, telemetry included.
--
-- This assertion used to carry a two-table allowlist. The allowlist was the
-- finding: `FOR INSERT TO anon WITH CHECK (true)` over tables with a user_id
-- column let any holder of the publishable key attribute a funnel event or a
-- feedback row to somebody else's account and somebody else's session.
-- 20260916090000 withdrew the direct grant entirely, so the allowlist is now
-- empty and the assertion is a flat prohibition.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'cd\_%'
      AND grantee = 'anon' AND privilege_type = 'INSERT') = 0,
  'V9.6b no cd_ table grants anon a direct INSERT');

-- 9.6c — anon cannot READ either telemetry table. Note this is now asserted of
-- a database that can answer it: before 20260916090000 mirrored Supabase's
-- ALTER DEFAULT PRIVILEGES locally, hosted granted anon SELECT on both tables
-- and this assertion passed anyway, because a clean replay never had the grant.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee = 'anon'
      AND table_name IN ('cd_v31_funnel_events','cd_test_feedback')) = 0,
  'V9.6c anon holds no privilege at all on the telemetry tables');

-- 9.6d — RLS is on for both. It is no longer the only thing standing between a
-- caller and a row, but a table that lost RLS would still be a regression.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('cd_v31_funnel_events','cd_test_feedback')
      AND c.relrowsecurity) = 2,
  'V9.6d RLS is enabled on both telemetry tables');

-- 9.6e — anonymous telemetry is STILL SUPPORTED, through exactly one audited
-- entry point per table. This is the half of the contract that stops the fix
-- from quietly becoming a feature removal: if these two functions disappear,
-- anonymous funnel tracking and anonymous feedback are gone, and that must
-- fail a test rather than pass as "more secure".
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('cd_record_funnel_event','cd_submit_test_feedback')
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')) = 2,
  'V9.6e anonymous telemetry survives as two anon-executable entry points');

-- 9.6f — reading stays separately controlled, for authenticated principals
-- only, so the admin path is not an artefact of the anonymous write path.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('cd_v31_funnel_events','cd_test_feedback')
      AND cmd = 'SELECT'
      AND NOT ('anon' = ANY (roles))) = 2,
  'V9.6f privileged reading of telemetry is controlled separately from anon');

DO $$ BEGIN RAISE NOTICE 'career_discovery_v31_schema_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
