-- Phase 1F — content completeness and the candidate-payload boundary.
--
-- Proves the content is genuinely finished, and that finishing it did not open
-- a path from a candidate-facing payload to an answer key.

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

DO $$ BEGIN RAISE NOTICE 'GROUP F1 — every item is bilingual and complete'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id WHERE i.slug LIKE 'sg-b-%') = 18,
  'F1.1 eighteen items exist');

-- Swedish AND English for every one of the eighteen.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%'
      AND (SELECT count(*) FROM public.scp_item_texts t
            WHERE t.item_version_id = iv.id AND t.language = 'sv-SE') = 1
      AND (SELECT count(*) FROM public.scp_item_texts t
            WHERE t.item_version_id = iv.id AND t.language = 'en-GB') = 1) = 18,
  'F1.2 every item has exactly one Swedish and one English text');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_texts t
     JOIN public.scp_item_versions iv ON iv.id = t.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%'
      AND (length(btrim(t.scenario)) = 0 OR length(btrim(t.prompt)) = 0)) = 0,
  'F1.3 no scenario or prompt is empty');

-- Every item is Swedish-jurisdiction and carries its scenario metadata.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
     JOIN public.scp_jurisdictions j ON j.id = iv.jurisdiction_id
    WHERE i.slug LIKE 'sg-b-%' AND j.code = 'SE') = 18,
  'F1.4 every item is marked for Swedish jurisdiction');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%'
      AND (work_context_sv IS NULL OR information_available_sv IS NULL
        OR information_withheld_sv IS NULL OR difficulty IS NULL
        OR cognitive_demand IS NULL)) = 0,
  'F1.5 every item states its context, available and withheld information');

-- Every item is authored by AI and marked as such, for reviewer transparency.
SELECT pg_temp.ok(
  (SELECT bool_and(authored_by_ai) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id WHERE i.slug LIKE 'sg-b-%'),
  'F1.6 every item is flagged as AI-authored for reviewers');

DO $$ BEGIN RAISE NOTICE 'GROUP F2 — options, keys and rationales'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
    SELECT o.item_version_id FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.item_format <> 'constructed_response'
    GROUP BY o.item_version_id HAVING count(*) <> 4) bad) = 0,
  'F2.1 every SJT and best/worst item has exactly four options');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%'
      AND (o.scoring_rationale_sv IS NULL OR length(btrim(o.scoring_rationale_sv)) = 0
        OR o.scoring_rationale_en IS NULL OR o.score_value IS NULL)) = 0,
  'F2.2 every option has a score and a rationale in both languages');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%'
      AND (o.learning_feedback_sv IS NULL OR o.learning_feedback_en IS NULL)) = 0,
  'F2.3 every option carries Learning Mode feedback in both languages');

-- Every distractor names the professional error it represents — no arbitrary
-- scoring.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND o.score_value < 3 AND o.distractor_error_type IS NULL) = 0,
  'F2.4 every non-preferred option names the professional error it represents');

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
    SELECT o.item_version_id FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    WHERE iv.item_format = 'sjt_best_response' AND o.is_preferred
    GROUP BY o.item_version_id HAVING count(*) <> 1) bad) = 0,
  'F2.5 every single-best-response item has exactly one preferred response');

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
    SELECT o.item_version_id FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    WHERE iv.item_format = 'sjt_best_worst'
    GROUP BY o.item_version_id
    HAVING count(*) FILTER (WHERE o.is_best_key) <> 1
        OR count(*) FILTER (WHERE o.is_worst_key) <> 1) bad) = 0,
  'F2.6 every best/worst item has exactly one best and one worst key');

-- The worst option must not be absurd: it still scores on the same 0-3 scale
-- and carries a named professional error rather than an ethical caricature.
SELECT pg_temp.ok(
  (SELECT bool_and(distractor_error_type IS NOT NULL) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    WHERE iv.item_format = 'sjt_best_worst' AND o.is_worst_key),
  'F2.7 the worst option is a named professional error, not a caricature');

DO $$ BEGIN RAISE NOTICE 'GROUP F3 — rubrics'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'constructed_response'
      AND (SELECT count(*) FROM public.scp_rubric_versions rv
            WHERE rv.item_version_id = iv.id) = 1) = 3,
  'F3.1 every constructed-response item has exactly one rubric');

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
    SELECT rv.id FROM public.scp_rubric_versions rv
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id
     JOIN public.scp_rubric_dimensions d ON d.rubric_version_id = rv.id
    WHERE r.slug LIKE 'sg-cr-%'
    GROUP BY rv.id HAVING count(*) < 3 OR count(*) > 5) bad) = 0,
  'F3.2 every rubric has between three and five dimensions');

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
    SELECT d.id FROM public.scp_rubric_dimensions d
     JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id
     JOIN public.scp_rubric_levels l ON l.rubric_dimension_id = d.id
    WHERE r.slug LIKE 'sg-cr-%'
    GROUP BY d.id HAVING count(*) <> 5
       OR min(l.level) <> 0 OR max(l.level) <> 4) bad) = 0,
  'F3.3 every dimension defines all five levels, 0 through 4');

-- Content and writing quality are separated, and style is explicitly
-- non-material.
SELECT pg_temp.ok(
  (SELECT count(*) FROM (
    SELECT rv.id FROM public.scp_rubric_versions rv
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id
     JOIN public.scp_rubric_dimensions d ON d.rubric_version_id = rv.id
    WHERE r.slug LIKE 'sg-cr-%'
    GROUP BY rv.id
    HAVING count(*) FILTER (WHERE d.assesses_writing_quality) <> 1
        OR count(*) FILTER (WHERE NOT d.assesses_writing_quality) < 2) bad) = 0,
  'F3.4 each rubric separates content from writing, with style a single dimension');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_rubric_versions rv
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id
    WHERE r.slug LIKE 'sg-cr-%'
      AND EXISTS (SELECT 1 FROM public.scp_anchor_responses a
        JOIN public.scp_rubric_dimensions d ON d.id = a.rubric_dimension_id
       WHERE d.rubric_version_id = rv.id AND a.anchor_type = 'safety_critical_error')) = 3,
  'F3.5 every rubric names at least one safety-critical error');

-- The pair the brief requires: simple-but-correct scores well; polished-but-wrong does not.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_anchor_responses a
     JOIN public.scp_rubric_dimensions d ON d.id = a.rubric_dimension_id
     JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id
    WHERE r.slug LIKE 'sg-cr-%' AND a.anchor_type = 'positive' AND a.level >= 3) > 0
  AND (SELECT count(*) FROM public.scp_anchor_responses a
     JOIN public.scp_rubric_dimensions d ON d.id = a.rubric_dimension_id
     JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id
    WHERE r.slug LIKE 'sg-cr-%' AND a.anchor_type = 'borderline') > 0,
  'F3.6 anchors include a simple-language high scorer and a polished borderline');

SELECT pg_temp.ok(
  (SELECT bool_and(array_length(must_not_infer, 1) >= 5) FROM public.scp_rubric_versions rv
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id WHERE r.slug LIKE 'sg-cr-%'),
  'F3.7 every rubric states what reviewers and AI must not infer');

DO $$ BEGIN RAISE NOTICE 'GROUP F4 — graph, mode and draft boundary'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.primary_behaviour_id IS NOT NULL) = 18,
  'F4.1 every item maps to exactly one primary observable behaviour');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.content_status <> 'draft') = 0,
  'F4.2 every item is still draft');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_rubric_versions WHERE content_status <> 'draft') = 0
  AND (SELECT count(*) FROM public.scp_prompt_versions WHERE content_status <> 'draft') = 0,
  'F4.3 rubrics and prompts are still draft');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessments WHERE employer_visible) = 0,
  'F4.4 no assessment is employer-visible or assignable');

-- Learning and Assessment item versions remain disjoint.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.mode <> 'assessment') = 0,
  'F4.5 all eighteen authored items are assessment-mode');
SELECT pg_temp.ok(
  (SELECT count(*) FROM (
    SELECT fi.form_id FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE iv.mode IS NOT NULL
    GROUP BY fi.form_id HAVING count(DISTINCT iv.mode) > 1) bad) = 0,
  'F4.6 no form mixes learning and assessment items');

-- The review register: populated, nothing cleared.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_requirements) >= 90,
  'F4.7 every item carries its review requirements');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_requirements WHERE status <> 'outstanding') = 0,
  'F4.8 no review requirement has been cleared by authoring');
SELECT pg_temp.ok(
  (SELECT count(DISTINCT item_version_id) FROM public.scp_review_requirements
    WHERE review_type = 'swedish_legal') = 6,
  'F4.9 the six mandate/disclosure items are flagged for Swedish legal review');

DO $$ BEGIN RAISE NOTICE 'GROUP F5 — nothing protected can reach a candidate'; END $$;

-- =========================================================================
-- Group F5 — the payload boundary
-- =========================================================================
--
-- Authoring real answer keys is exactly when this stops being theoretical.

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('scp_item_options','scp_rubric_versions','scp_rubric_levels',
                        'scp_anchor_responses','scp_prompt_versions')
      AND cmd IN ('SELECT','ALL') AND coalesce(qual,'') IN ('true','(true)')) = 0,
  'F5.1 no unconditional read policy exists on keys, rubrics, anchors or prompts');

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_item_options',
  'permission denied', 'F5.2 anon cannot read option scores');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_anchor_responses',
  'permission denied', 'F5.3 anon cannot read anchor responses');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_prompt_versions',
  'permission denied', 'F5.4 anon cannot read scoring prompts');
RESET ROLE;

-- A candidate-facing delivery may only ever select these columns. Asserted as a
-- structural fact so a future server function has an authority to match.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_item_option_texts'
      AND column_name IN ('score_value','scoring_rationale_sv','is_preferred',
                          'is_best_key','is_worst_key','learning_feedback_sv')) = 0,
  'F5.5 the option TEXT table carries no score, key, rationale or feedback');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_item_texts'
      AND (column_name ILIKE '%score%' OR column_name ILIKE '%key%'
        OR column_name ILIKE '%rationale%' OR column_name ILIKE '%answer%')) = 0,
  'F5.6 the item TEXT table carries no score, key, rationale or answer');

-- The AI provider is still off, and candidate text is still isolated.
SELECT pg_temp.ok(
  (SELECT string_agg(code, ',') FROM public.scp_ai_providers WHERE is_enabled) = 'null_provider',
  'F5.7 the null provider is still the only enabled provider');
SELECT pg_temp.ok(
  (SELECT bool_and(input_envelope_strategy = 'delimited_untrusted_block')
     FROM public.scp_prompt_versions),
  'F5.8 candidate text is passed inside an untrusted-input envelope');
SELECT pg_temp.ok(
  (SELECT bool_and(system_prompt ILIKE '%never follow instructions%')
     FROM public.scp_prompt_versions),
  'F5.9 the prompt instructs the scorer never to follow candidate instructions');

DO $$ BEGIN RAISE NOTICE 'GROUP F6 — Phase 1G corrections'; END $$;

-- =========================================================================
-- Group F6 — the Phase 1G corrections
-- =========================================================================

-- THE 1F defect: a candidate label must never be its internal rationale.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_option_texts t
     JOIN public.scp_item_options o ON o.id = t.item_option_id
    WHERE btrim(t.label) IN (btrim(coalesce(o.scoring_rationale_sv,'~')),
                             btrim(coalesce(o.scoring_rationale_en,'~')))) = 0,
  'F6.1 no candidate option label reuses its internal scoring rationale');

-- Candidate-facing labels must not leak the error taxonomy or scoring language.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_option_texts t
    WHERE t.label ILIKE '%rätt:%' OR t.label ILIKE '%correct:%'
       OR t.label ILIKE '%sämst%' OR t.label ILIKE '%worst:%'
       OR t.label ILIKE '%bäst:%' OR t.label ILIKE '%best:%'
       OR t.label ILIKE '%utanför mandat%' OR t.label ILIKE '%outside mandate%') = 0,
  'F6.2 no candidate label reveals scoring, preference or error type');

-- Every item classified by primary construct, with its legal framing written out.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%'
      AND (primary_construct IS NULL OR tests_what IS NULL
        OR legal_assumption_sv IS NULL OR overgeneralisation_guard_sv IS NULL)) = 0,
  'F6.3 every item states its construct, legal assumption and overgeneralisation guard');

-- An item testing legal knowledge may not be labelled situational judgement.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions
    WHERE tests_what = 'legal_knowledge'
      AND primary_construct = 'situational_judgement') = 0,
  'F6.4 no legal-knowledge item masquerades as situational judgement');

-- sg-b-02 no longer rests on a coercive ID power.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug = 'sg-b-02' AND o.is_preferred
      AND o.scoring_rationale_sv ILIKE '%tillträdesvillkor%') = 1,
  'F6.5 sg-b-02 preferred response rests on the access condition, not a legal power');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug = 'sg-b-02' AND iv.depends_on_employer_instruction) = 1,
  'F6.6 sg-b-02 is marked as depending on employer instruction');

-- Every legally flagged item carries explicit legal-review metadata.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_requirements rr
     JOIN public.scp_item_versions iv ON iv.id = rr.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE rr.review_type = 'swedish_legal'
      AND i.slug IN ('sg-b-02','sg-b-04','sg-b-05','sg-b-06','sg-b-15','sg-b-18')) = 6,
  'F6.7 all six legally sensitive items carry a Swedish legal review requirement');

-- Every assessment item has a counterpart DECISION, and every required
-- counterpart exists as a separate learning-mode version.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND learning_counterpart_decision IS NULL) = 0,
  'F6.8 every assessment item has a Learning Mode counterpart decision');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions a
     JOIN public.scp_items ai ON ai.id = a.item_id
    WHERE ai.slug LIKE 'sg-b-%'
      AND a.learning_counterpart_decision = 'separate_learning_counterpart_required'
      AND (a.learning_counterpart_id IS NULL OR a.learning_counterpart_id = a.id)) = 0,
  'F6.9 every required counterpart exists and is a different item version');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions l
     JOIN public.scp_items li ON li.id = l.item_id
    WHERE li.slug LIKE 'sg-l-%' AND l.mode <> 'learning') = 0,
  'F6.10 no Learning Mode item reuses an Assessment Mode item version');

-- A counterpart must be a different situation, not a reworded copy.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_texts lt
     JOIN public.scp_item_versions l ON l.id = lt.item_version_id
     JOIN public.scp_items li ON li.id = l.item_id
     JOIN public.scp_items ai ON ai.slug = 'sg-b-' || substr(li.slug, 6)
     JOIN public.scp_item_versions a ON a.item_id = ai.id AND a.version_number = 1
     JOIN public.scp_item_texts at ON at.item_version_id = a.id AND at.language = lt.language
    WHERE li.slug LIKE 'sg-l-%' AND btrim(lt.scenario) = btrim(at.scenario)) = 0,
  'F6.11 no counterpart copies its protected original''s scenario');

-- All four anchor types on every constructed-response rubric.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_rubric_versions rv
     JOIN public.scp_rubrics r ON r.id = rv.rubric_id
    WHERE r.slug LIKE 'sg-cr-%'
      AND (SELECT count(DISTINCT a.anchor_type) FROM public.scp_anchor_responses a
            JOIN public.scp_rubric_dimensions d ON d.id = a.rubric_dimension_id
           WHERE d.rubric_version_id = rv.id) = 4) = 3,
  'F6.12 every rubric has positive, borderline, contraindication and safety-critical anchors');

-- English stays a translation until a bilingual SME says otherwise.
--
-- Scoped to REAL content. A published test fixture legitimately carries
-- approved English, because Swedish/English parity is exactly one of the
-- properties the fixture exists to prove -- and the fixture flag is what keeps
-- that exemption from silently covering content awaiting review.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_texts it
     JOIN public.scp_item_versions iv ON iv.id = it.item_version_id
     JOIN public.scp_form_items fi ON fi.item_version_id = iv.id
     JOIN public.scp_forms f ON f.id = fi.form_id
     JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE it.adaptation_status <> 'adaptation_pending'
      AND NOT d.is_test_fixture) = 0,
  'F6.13 all English content in REAL programmes remains adaptation_pending');

-- Learning content is draft too, and nothing became assignable.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_versions iv
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-l-%' AND iv.content_status <> 'draft') = 0,
  'F6.14 every Learning Mode draft is draft');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE iv.mode = 'learning') = 0,
  'F6.15 no Learning Mode item has been placed on the assessment form');

DO $$ BEGIN RAISE NOTICE 'scp_content_phase1f_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
