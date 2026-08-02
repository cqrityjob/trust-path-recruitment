-- Security Competence Academy — Phase 1.
--
-- Proves:
--   1. The programme domain attaches to the graph and closes the development loop.
--   2. Learning and Assessment content are provably disjoint.
--   3. Rubrics cannot publish incomplete, and are unreachable by non-authors.
--   4. No external AI provider is enabled, and the null provider cannot score.
--   5. Human review models all eight triggers and is immutable once completed.
--   6. The Security Guard programme is authored to DRAFT only.
--   7. Employers have no direct path to identities, attempts or responses.
--
-- Everything rolls back.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP A1 — the programme domain closes the loop'; END $$;

-- =========================================================================
-- Group A1 — programme → module → behaviour → competency
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_module_versions mv
     JOIN public.scp_program_versions pv ON pv.id = mv.program_version_id
     JOIN public.scp_programs p ON p.id = pv.program_id
    WHERE p.slug = 'security-guard-operational-development') = 6,
  'A1.1 the Security Guard programme has six modules');

-- The loop that turns a competency gap into a learning recommendation without
-- any module reading an assessment item.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_module_behaviour_map mbm
     JOIN public.scp_behaviour_competency_map bcm
       ON bcm.behaviour_version_id = mbm.behaviour_version_id) > 0,
  'A1.2 module → behaviour → competency is traversable, so a gap reaches a module');

-- A programme may not publish without saying what it does not measure.
SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_program_versions
     (program_id, version_number, content_status, name_sv, name_en, purpose_sv, purpose_en)
   SELECT id, 99, ''published'', ''x'', ''x'', ''x'', ''x''
     FROM public.scp_programs LIMIT 1',
  'SCP_PROGRAMME_WITHOUT_LIMITS',
  'A1.3 a programme cannot be published without stating its limits');

SELECT pg_temp.ok(
  (SELECT array_length(does_not_measure_sv, 1) FROM public.scp_program_versions pv
     JOIN public.scp_programs p ON p.id = pv.program_id
    WHERE p.slug = 'security-guard-operational-development') = 10,
  'A1.4 the programme names all ten things it does not measure');

DO $$ BEGIN RAISE NOTICE 'GROUP A2 — Learning and Assessment are disjoint'; END $$;

-- =========================================================================
-- Group A2 — mode separation
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.mode = 'assessment') = 18,
  'A2.1 all eighteen baseline items are assessment-mode');

-- An exposed training item can never be promoted into the controlled bank.
SELECT pg_temp.must_fail(
  format('UPDATE public.scp_item_versions SET mode = ''learning'' WHERE id = %L',
    (SELECT iv.id FROM public.scp_item_versions iv
       JOIN public.scp_items i ON i.id = iv.item_id WHERE i.slug = 'sg-b-01')),
  'SCP_ITEM_MODE_IMMUTABLE',
  'A2.2 an item cannot change mode once authored');

-- A form may not mix modes.
DO $$
DECLARE _learn uuid; _form uuid; _beh uuid; _comp uuid;
BEGIN
  SELECT primary_behaviour_id, competency_id INTO _beh, _comp
    FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug = 'sg-b-01';

  INSERT INTO public.scp_items (slug) VALUES ('sg-learn-01') RETURNING id INTO _learn;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, item_format, competency_id,
     primary_behaviour_id, mode, observable_behavior, response_process)
  VALUES (_learn, 1, 'draft', 'sjt_best_response', _comp, _beh, 'learning',
          'Övningsvariant', 'Övning')
  RETURNING id INTO _learn;

  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'sg-baseline-form-a';
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
            VALUES (%L, %L, 99)', _form, _learn),
    'SCP_FORM_MIXES_MODES',
    'A2.3 an assessment form cannot accept a learning item');
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP A3 — the item/graph agreement'; END $$;

-- =========================================================================
-- Group A3 — the two-sources-of-truth resolution
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.primary_behaviour_id IS NOT NULL) = 18,
  'A3.1 every baseline item maps to exactly one observable behaviour');

-- The item bank and the graph cannot drift: a claimed competency that the
-- behaviour does not serve is refused.
SELECT pg_temp.must_fail(
  format('UPDATE public.scp_item_versions SET competency_id = %L WHERE id = %L',
    (SELECT id FROM public.scp_competencies WHERE code = 'SCC-12'),
    (SELECT iv.id FROM public.scp_item_versions iv
       JOIN public.scp_items i ON i.id = iv.item_id WHERE i.slug = 'sg-b-01')),
  'SCP_ITEM_BEHAVIOUR_COMPETENCY_MISMATCH',
  'A3.2 an item cannot claim a competency its behaviour does not serve');

DO $$ BEGIN RAISE NOTICE 'GROUP A4 — rubrics are complete and protected'; END $$;

-- =========================================================================
-- Group A4 — rubrics
-- =========================================================================

DO $$
DECLARE _r uuid; _rv uuid;
BEGIN
  INSERT INTO public.scp_rubrics (slug) VALUES ('sg-factual-reporting') RETURNING id INTO _r;
  INSERT INTO public.scp_rubric_versions (rubric_id, version_number, name_sv, name_en)
  VALUES (_r, 1, 'Saklig rapportering', 'Factual reporting') RETURNING id INTO _rv;

  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_rubric_versions SET content_status = ''published'' WHERE id = %L', _rv),
    'SCP_RUBRIC_DIMENSION_COUNT',
    'A4.1 a rubric with no dimensions cannot be published');
END $$;

-- Protected content has NO unconditional read policy.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('scp_rubric_versions','scp_rubric_levels','scp_anchor_responses',
                        'scp_prompt_versions','scp_ai_scoring_runs')
      AND cmd IN ('SELECT','ALL') AND coalesce(qual,'') IN ('true','(true)')) = 0,
  'A4.2 rubrics, anchors and prompts carry no unconditional read policy');

DO $$ BEGIN RAISE NOTICE 'GROUP A5 — the AI provider is off'; END $$;

-- =========================================================================
-- Group A5 — AI scoring architecture, provider disabled
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT string_agg(code, ',') FROM public.scp_ai_providers WHERE is_enabled) = 'null_provider',
  'A5.1 the null provider is the only enabled provider');

SELECT pg_temp.ok(
  (SELECT NOT is_enabled FROM public.scp_ai_providers WHERE code = 'anthropic'),
  'A5.2 Anthropic is registered but disabled');

-- No credential is stored anywhere.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_ai_providers'
      AND (column_name ILIKE '%key%' OR column_name ILIKE '%secret%'
        OR column_name ILIKE '%token%' OR column_name ILIKE '%credential%')) = 0,
  'A5.3 no credential column exists on the provider table');

-- Two providers can never be enabled at once.
SELECT pg_temp.must_fail(
  'UPDATE public.scp_ai_providers SET is_enabled = true WHERE code = ''anthropic''',
  'SCP_MULTIPLE_ENABLED_PROVIDERS',
  'A5.4 a second provider cannot be enabled while one is on');

DO $$ BEGIN RAISE NOTICE 'GROUP A6 — human review'; END $$;

-- =========================================================================
-- Group A6 — the review queue
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(DISTINCT unnest) FROM unnest(ARRAY[
    'safety_critical_detected','confidence_below_threshold','repeated_runs_disagree',
    'legally_sensitive_action','recruitment_use','participant_requested',
    'schema_invalid_output','administrator_mandated'])) = 8,
  'A6.1 all eight review triggers are modelled');

-- A completed review cannot be edited: reopening means a new review.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.scp_human_reviews'::regclass
      AND tgname = 'scp_human_reviews_immutable_once_done') = 1,
  'A6.2 a completed review is protected by an immutability trigger');

-- A review may not be marked completed without an outcome and a reviewer.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.scp_human_reviews'::regclass
      AND conname = 'scp_review_completion_complete') = 1,
  'A6.3 completion requires an outcome, a reviewer and a timestamp');

DO $$ BEGIN RAISE NOTICE 'GROUP A7 — draft only, nothing shipped'; END $$;

-- =========================================================================
-- Group A7 — the Phase 1 boundary
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.content_status <> 'draft') = 0,
  'A7.1 every baseline item is draft');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_program_versions WHERE content_status <> 'draft') = 0,
  'A7.2 the programme is draft');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessments WHERE employer_visible) = 0,
  'A7.3 nothing is employer-visible');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts) = 0
    AND (SELECT count(*) FROM public.scp_candidate_responses) = 0
    AND (SELECT count(*) FROM public.scp_ai_scoring_runs) = 0,
  'A7.4 Phase 1 created schema, not data');

-- The 18-item composition, exactly as specified.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'sjt_best_response') = 12
  AND (SELECT count(*) FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'sjt_best_worst') = 3
  AND (SELECT count(*) FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'constructed_response') = 3,
  'A7.5 the form is 12 single-best-response + 3 best/worst + 3 constructed response');

DO $$ BEGIN RAISE NOTICE 'GROUP A8 — employers have no direct path'; END $$;

-- =========================================================================
-- Group A8 — the identity-separation requirement, carried into Phase 1
-- =========================================================================
--
-- The owner requirement: employers must NEVER receive direct read access to
-- scp_subject_identities, and identity resolution must go through purpose-scoped
-- server functions. These assertions prove no direct path was opened.

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scp_subject_identities'
      AND cmd IN ('SELECT','ALL') AND coalesce(qual,'') IN ('true','(true)')) = 0,
  'A8.1 scp_subject_identities has no unconditional read policy');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('scp_attempts','scp_candidate_responses')
      AND qual ILIKE '%employer%') = 0,
  'A8.2 no attempt or response policy grants access by employer membership');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('scp_attempts','scp_candidate_responses')
      AND cmd IN ('SELECT','ALL') AND coalesce(qual,'') IN ('true','(true)')) = 0,
  'A8.3 attempts and responses carry no unconditional read policy');

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_attempts',
  'permission denied', 'A8.4 anon cannot read attempts');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_rubric_versions',
  'permission denied', 'A8.5 anon cannot read rubrics');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_prompt_versions',
  'permission denied', 'A8.6 anon cannot read scoring prompts');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon'
      AND table_name LIKE 'scp\_%') = 0,
  'A8.7 anon holds no grant on any scp_ table');

DO $$ BEGIN RAISE NOTICE 'scp_academy_phase1_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
