-- The TRUST conduct layer, as a contract.
--
-- The claim being tested: an interviewer gets real support during a live
-- conversation, and that support is governed rows rather than a model — with
-- the techniques this product must never import named specifically enough that
-- their absence is checkable.
--
-- Deterministic. No AI is invoked, no network is touched. Everything rolls back.

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

CREATE TEMP TABLE cdx (methods integer) ON COMMIT DROP;
INSERT INTO cdx SELECT count(*) FROM public.scp_interview_methods;
GRANT SELECT ON cdx TO authenticated, anon;


-- ###########################################################################
-- GROUP CD1 — the conduct sequence exists, is ordered, and is complete
-- ###########################################################################
DO $$
DECLARE _m integer := (SELECT methods FROM cdx);
BEGIN
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_conduct_steps) = _m * 6,
    'CD1.1 six conduct steps exist for every TRUST method');

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_steps s
     GROUP BY s.method_id
    HAVING array_agg(s.step_key ORDER BY s.ordinal)
        <> ARRAY['invite','listen','reflect','clarify','substantiate','confirm']),
    'CD1.2 the order is invite, listen, reflect, clarify, substantiate, confirm');

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_steps
     GROUP BY method_id HAVING array_agg(ordinal ORDER BY ordinal) <> ARRAY[1,2,3,4,5,6]),
    'CD1.3 ordinals 1-6 with no gaps and no duplicates');

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_steps
     WHERE btrim(label_en) = '' OR btrim(guidance_en) = ''
        OR btrim(label_sv) = '' OR btrim(guidance_sv) = ''),
    'CD1.4 every step reads in both languages');
END $$;

-- The ordinal and key uniqueness is enforced, not merely true today.
SELECT pg_temp.must_fail($$
  INSERT INTO public.scp_interview_conduct_steps
    (method_id, step_key, ordinal, label_sv, label_en, guidance_sv, guidance_en)
  SELECT id, 'invite', 6, 'x', 'x', 'x', 'x' FROM public.scp_interview_methods LIMIT 1 $$,
  'scp_interview_conduct_steps_method_id_step_key_key',
  'CD1.5 a duplicate step key is refused');

-- The ordinal uniqueness cannot be exercised against an existing method: all
-- six approved keys are already taken, so a duplicate ordinal is always also a
-- duplicate key. It is asserted structurally instead, which is the property
-- that matters -- two steps cannot claim the same position in the sequence.
DO $$
BEGIN
  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.scp_interview_conduct_steps'::regclass
       AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) = 'UNIQUE (method_id, ordinal)'),
    'CD1.6 two steps cannot claim the same position in the sequence');
END $$;

SELECT pg_temp.must_fail($$
  INSERT INTO public.scp_interview_conduct_steps
    (method_id, step_key, ordinal, label_sv, label_en, guidance_sv, guidance_en)
  SELECT id, 'confront', 7, 'x', 'x', 'x', 'x' FROM public.scp_interview_methods LIMIT 1 $$,
  'violates check constraint',
  'CD1.7 a step outside the approved sequence is refused');


-- ###########################################################################
-- GROUP CD2 — the prohibited techniques are named, not gestured at
-- ###########################################################################
DO $$
DECLARE _m integer := (SELECT methods FROM cdx);
  _terms text[] := ARRAY[
    'Scharff', 'Reid', 'minimization', 'interrogation', 'credibility',
    'body language', 'fabricated', 'personality', 'protected characteristics',
    'ranking', 'hire or reject'];
  _term text;
BEGIN
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_conduct_prohibitions) = _m * 8,
    'CD2.1 eight conduct prohibitions exist for every TRUST method');

  -- "Be fair" is advice. A named technique is a boundary someone can be held
  -- to, so each term is asserted individually and a dropped one fails loudly.
  FOREACH _term IN ARRAY _terms LOOP
    PERFORM pg_temp.ok(EXISTS (
      SELECT 1 FROM public.scp_interview_conduct_prohibitions
       WHERE statement_en ILIKE '%' || _term || '%'),
      format('CD2.x the prohibitions name %L explicitly', _term));
  END LOOP;

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_prohibitions
     WHERE btrim(statement_en) = '' OR btrim(statement_sv) = ''),
    'CD2.13 every prohibition reads in both languages');
END $$;


-- ###########################################################################
-- GROUP CD3 — Target, Ready and Trace guidance
-- ###########################################################################
DO $$
DECLARE _m integer := (SELECT methods FROM cdx);
  _pair record;
BEGIN
  FOR _pair IN SELECT * FROM (VALUES
      ('target_purpose', 4), ('target_evidence_class', 5), ('ready_plan', 8),
      ('recall_prompt', 5), ('trace_self_review', 5), ('trace_closure', 3)
    ) AS v(surface, n)
  LOOP
    PERFORM pg_temp.ok(
      (SELECT count(*) FROM public.scp_interview_conduct_guidance g
        WHERE g.surface = _pair.surface) = _m * _pair.n,
      format('CD3.x %s carries %s governed rows per method', _pair.surface, _pair.n));
  END LOOP;

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_guidance
     WHERE btrim(statement_sv) = '' OR btrim(statement_en) = ''),
    'CD3.7 every guidance row reads in both languages');

  -- The five evidence classes are the anti-confirmation-bias device: conflate
  -- them and a candidate's statement silently becomes an established fact.
  PERFORM pg_temp.ok(
    (SELECT count(DISTINCT guidance_key) FROM public.scp_interview_conduct_guidance
      WHERE surface = 'target_evidence_class') = 5,
    'CD3.8 the five evidence classes are distinct');

  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_guidance
     WHERE surface = 'target_purpose' AND guidance_key = 'must_not_infer'
       AND statement_en ILIKE '%must not be inferred%'),
    'CD3.9 Target states what must NOT be inferred from an interview');

  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_guidance
     WHERE surface = 'trace_closure' AND statement_en ILIKE '%inconsistency is not dishonesty%'),
    'CD3.10 Trace states that an inconsistency is not dishonesty');
END $$;


-- ###########################################################################
-- GROUP CD4 — Understand still permits zero model calls
-- ###########################################################################
DO $$
DECLARE _understand uuid;
BEGIN
  FOR _understand IN
    SELECT id FROM public.scp_trust_stages WHERE stage_key = 'understand'
  LOOP
    PERFORM pg_temp.ok(NOT EXISTS (
      SELECT 1 FROM public.scp_trust_stage_ai_tasks t WHERE t.stage_id = _understand),
      'CD4.1 the Understand stage permits no AI task at all');
  END LOOP;

  -- And the conduct layer did not quietly become a stage that permits one.
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_conduct_guidance WHERE trust_stage = 'understand'),
    'CD4.2 no conduct guidance row claims the Understand stage');
END $$;


-- ###########################################################################
-- GROUP CD5 — notes stay notes; a proposal cites its source; nothing
--             becomes evidence without a human
-- ###########################################################################
DO $$
BEGIN
  -- The structural guarantee: a proposal must cite exactly one source — the
  -- note it was read out of, or a source passage. Neither, or both, is refused.
  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.scp_interview_evidence_proposals'::regclass
       AND pg_get_constraintdef(c.oid) ILIKE '%num_nonnulls(note_id, source_passage_id) = 1%'),
    'CD5.1 every AI proposal must cite exactly one source, by constraint');

  -- Confirmed evidence records who confirmed it and when. A row that appeared
  -- without a person is structurally impossible, not merely discouraged.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'scp_interview_evidence'
        AND column_name IN ('confirmed_by', 'confirmed_at')
        AND is_nullable = 'NO') = 2,
    'CD5.2 confirmed evidence cannot exist without a named human and a time');

  -- Notes and evidence are different tables. Nothing promotes one to the other
  -- except the governed confirm RPC.
  PERFORM pg_temp.ok(
    to_regclass('public.scp_interview_session_notes') IS NOT NULL
    AND to_regclass('public.scp_interview_evidence') IS NOT NULL,
    'CD5.3 a note and a piece of evidence are different tables');

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'scp_interview_session_notes'
       AND column_name IN ('confirmed_by', 'is_evidence', 'evidence_dimension_id')),
    'CD5.4 a note carries no column that could make it evidence in place');

  -- No trigger promotes a proposal into evidence. Only the RPC a human calls.
  -- Checked against each trigger FUNCTION's body: matching the trigger
  -- definition text would match the proposals table's own name and pass or
  -- fail for the wrong reason.
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
     JOIN pg_proc pr ON pr.oid = tg.tgfoid
     WHERE tg.tgrelid = 'public.scp_interview_evidence_proposals'::regclass
       AND NOT tg.tgisinternal
       AND pr.prosrc ~* 'insert\s+into\s+public\.scp_interview_evidence\s*\('),
    'CD5.5 no trigger on proposals writes into the evidence table');

  -- Belt and braces: the only routines that insert confirmed evidence are the
  -- two governed writers, both of which require a caller who is a person.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
      WHERE n.nspname = 'public'
        AND pr.prosrc ~* 'insert\s+into\s+public\.scp_interview_evidence\s*\(')
    = 2,
    'CD5.6 exactly two governed routines can create confirmed evidence');
END $$;


-- ###########################################################################
-- GROUP CD6 — no score, ranking, credibility or recommendation, anywhere
-- ###########################################################################
DO $$
DECLARE _c record;
BEGIN
  FOR _c IN
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name LIKE 'scp_interview%'
       AND (column_name ~ '(^|_)(score|ranking|rank|percentile|credibility|deception|suitability|recommendation|verdict)($|_)')
  LOOP
    RAISE EXCEPTION
      'ASSERTION FAILED: CD6.1 %.% exists — this engine stores no score, '
      'ranking, credibility judgement or employment recommendation.',
      _c.table_name, _c.column_name;
  END LOOP;
  PERFORM pg_temp.ok(true,
    'CD6.1 no interview table has a score, ranking, credibility or recommendation column');

  -- 5E is a description. Nothing counts it.
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name LIKE 'scp_interview%'
       AND column_name ~ '(completeness|e_total|five_e_count|elements_present)'),
    'CD6.2 nothing aggregates the 5E fields');

  -- Level 0 means insufficient evidence, and still never aggregates.
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_rating_anchors
     WHERE level = 0 AND counts_toward_aggregation),
    'CD6.3 level 0 never counts toward an aggregation');
END $$;


-- ###########################################################################
-- GROUP CD7 — prohibited technique language cannot reach a model
-- ###########################################################################
--
-- The prohibitions are shown to a HUMAN. They must never travel into a task
-- instruction, because an instruction that names an interrogation technique is
-- an instruction that has described it to the model.
DO $$
DECLARE _term text;
  _banned text[] := ARRAY[
    'Scharff', 'Reid technique', 'minimization', 'maximization',
    'strategic use of evidence', 'deception detection', 'credibility assessment',
    'body language', 'micro-expression', 'confession', 'admission'];
BEGIN
  FOREACH _term IN ARRAY _banned LOOP
    PERFORM pg_temp.ok(NOT EXISTS (
      SELECT 1 FROM public.scp_ai_tasks
       WHERE coalesce(business_purpose, '') ILIKE '%' || _term || '%'
          OR coalesce(risk_classification, '') ILIKE '%' || _term || '%'),
      format('CD7.x no registered AI task describes %L as its purpose', _term));
  END LOOP;

  -- The conduct prohibitions DO name these techniques, on purpose -- that is
  -- what makes them boundaries. They are shown to a HUMAN, and must never be
  -- part of an AI task's governed context, which is why the two live in
  -- different tables and no AI task requires the conduct tables.
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_ai_tasks
     WHERE required_governed_context::text ILIKE '%conduct%'),
    'CD7.12 no AI task takes the conduct layer as governed context');

  -- Nor does any persisted candidate record carry the vocabulary.
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.scp_interview_evidence_dimensions
     WHERE label_sv ILIKE '%trovärdighet%' OR coalesce(label_en, '') ILIKE '%credibility%'
        OR label_sv ILIKE '%kroppsspråk%' OR coalesce(label_en, '') ILIKE '%body language%'),
    'CD7.13 no evidence dimension asks for credibility or body language');
END $$;


-- ###########################################################################
-- GROUP CD8 — who may read the conduct layer
-- ###########################################################################
INSERT INTO auth.users (id, email) VALUES
  ('cddd0000-0000-4000-8000-000000000001', 'conduct-candidate@test.local')
ON CONFLICT (id) DO NOTHING;

-- anon has no grant at all on these tables, which is a harder no than an empty
-- result: it cannot even ask.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_interview_conduct_steps',
  'permission denied', 'CD8.1 anon cannot read the conduct sequence');
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_interview_conduct_prohibitions',
  'permission denied', 'CD8.2 anon cannot read the conduct prohibitions');
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_interview_conduct_guidance',
  'permission denied', 'CD8.3 anon cannot read the conduct guidance');
RESET ROLE;

-- A candidate is an authenticated principal with no employer membership. They
-- have the table grant, and RLS returns them nothing.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"cddd0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
BEGIN
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_conduct_steps) = 0,
    'CD8.4 a candidate reads no conduct sequence');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_conduct_prohibitions) = 0,
    'CD8.5 a candidate reads no conduct prohibitions');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_conduct_guidance) = 0,
    'CD8.6 a candidate reads no conduct guidance');
END $$;

-- And nobody but the platform may write, whatever their membership.
SELECT pg_temp.must_fail($$
  INSERT INTO public.scp_interview_conduct_prohibitions
    (method_id, prohibition_key, statement_sv, statement_en)
  SELECT id, 'sneaked_in', 'x', 'x' FROM public.scp_interview_methods LIMIT 1 $$,
  'permission denied', 'CD8.7 an authenticated principal cannot add a prohibition');

SELECT pg_temp.must_fail($$
  DELETE FROM public.scp_interview_conduct_steps $$,
  'permission denied', 'CD8.8 an authenticated principal cannot delete a conduct step');
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);


DO $$ BEGIN RAISE NOTICE 'TRUST conduct layer assertions passed.'; END $$;
ROLLBACK;
