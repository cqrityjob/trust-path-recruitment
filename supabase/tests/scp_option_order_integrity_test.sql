-- Option-order integrity -- Väktare Recruitment Assessment v1 (PR-V1).
--
-- The defect this suite keeps out: on the flagship as authored, the preferred
-- option is written first on all 22 scenario items and the delivery path
-- served the authored order, so a candidate who read nothing and always chose
-- the first option was right 22 times out of 22. 20261021090000 makes the
-- delivery order a per-attempt permutation. These assertions are the contract:
--
--   T1  same attempt + same item -> same order on repeated reads
--   T2  same attempt after a saved response -> same order
--   T3  two attempts -> at least one scenario item differs
--   T4  the preferred option is not delivered first on all 22 items, and its
--       position covers more than one slot (plus a refusing-only balance gate
--       over 200 seeds)
--   T5  every option id delivered exactly once, none missing, none added
--   T6  ordered self-report scales keep their authored order
--   T7  a fixed set of chosen option ids scores identically under two
--       different permutations and under the authored order
--   T8  a submitted attempt is immutable: order, seed and answers
--   T9  a candidate cannot choose, change or null the seed
--   T10 another user cannot read an attempt's order or its seed
--   T11 an attempt created before the migration (NULL seed) keeps the
--       authored order, before and after answering -- compatibility rule A
--   T12 the form still carries exactly 50 items; 22 + 24 + 4
--
-- Plus a read-only DIAGNOSTIC on option length. It changes nothing and gates
-- nothing; it records the imbalance the baseline audit found so the
-- content-review PR that fixes it has a number to move.
--
-- Everything runs inside one transaction and is rolled back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(_sql text, _sqlstate text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'ASSERTION FAILED: % (the statement succeeded)', _label;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    IF SQLSTATE <> _sqlstate THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % (expected %, got % %)', _label, _sqlstate, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE '    ok  %', _label;
END $$;

-- The served order of one item's options, as the candidate sees it.
CREATE OR REPLACE FUNCTION pg_temp.served_keys(_options jsonb)
RETURNS text[] LANGUAGE sql AS $$
  SELECT array_agg((e->>'option_key') ORDER BY ord)
    FROM jsonb_array_elements(_options) WITH ORDINALITY AS t(e, ord);
$$;

-- ── Fixture ────────────────────────────────────────────────────────────────
--
-- One candidate, three attempts on the real flagship form: seeds 101 and 202
-- pinned explicitly (a test that depends on two random draws differing fails
-- for the wrong reason one run in a million), and one attempt with no seed at
-- all, created with the assign trigger disabled, which is exactly the shape
-- of an attempt that existed before the migration. A second candidate for the
-- tenancy assertions, whose attempt takes whatever seed the trigger gives.

INSERT INTO auth.users (id, email) VALUES
  ('a0010000-1111-0000-0000-000000000001', 'candidate.one@optionorder.invalid'),
  ('a0010000-1111-0000-0000-000000000002', 'candidate.two@optionorder.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scp_subjects (id) VALUES
  ('a0010000-0000-0000-0000-000000000001'),
  ('a0010000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('a0010000-0000-0000-0000-000000000001', 'a0010000-1111-0000-0000-000000000001'),
       ('a0010000-0000-0000-0000-000000000002', 'a0010000-1111-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.new_attempt(_subject uuid, _seed integer)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.scp_attempts
    (subject_id, mode, form_id, assessment_version_id, jurisdiction_id,
     scoring_model_version, status, governance_mode, option_order_seed)
  SELECT _subject, 'assessment', f.id, f.assessment_version_id,
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
         'det-v1', 'in_progress', 'closed_test', _seed
    FROM public.scp_forms f
   WHERE f.slug = 'security-officer-recruitment-form-a'
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE TEMP TABLE fx AS
SELECT pg_temp.new_attempt('a0010000-0000-0000-0000-000000000001', 101) AS a1,
       pg_temp.new_attempt('a0010000-0000-0000-0000-000000000001', 202) AS a2,
       pg_temp.new_attempt('a0010000-0000-0000-0000-000000000002', NULL) AS other,
       (SELECT id FROM public.scp_forms
         WHERE slug = 'security-officer-recruitment-form-a') AS form_id;

-- The pre-migration shape. Superuser-only fixture technique: the product has
-- no path that creates a seedless attempt any more, which T11 relies on.
ALTER TABLE public.scp_attempts DISABLE TRIGGER scp_attempts_assign_option_seed;
ALTER TABLE fx ADD COLUMN legacy uuid;
UPDATE fx SET legacy = pg_temp.new_attempt('a0010000-0000-0000-0000-000000000001', NULL);
ALTER TABLE public.scp_attempts ENABLE TRIGGER scp_attempts_assign_option_seed;

SELECT a1, a2, other, legacy, form_id FROM fx \gset

GRANT SELECT ON fx TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T12 -- the content did not move'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items WHERE form_id = :'form_id'::uuid) = 50,
  'T12.1 the Väktare form carries exactly 50 items');

SELECT pg_temp.ok(
  (SELECT count(*) FILTER (WHERE iv.item_format = 'sjt_best_response') = 22
      AND count(*) FILTER (WHERE iv.item_format = 'biq_frequency') = 24
      AND count(*) FILTER (WHERE iv.item_format = 'constructed_response') = 4
     FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id = :'form_id'::uuid),
  'T12.2 22 scenario, 24 self-report, 4 free-text -- exactly as authored');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id = :'form_id'::uuid AND fi.randomise_options
      AND NOT public.scp_item_order_is_meaningful(iv.item_format)) = 22,
  'T12.3 all 22 scenario items are eligible for per-attempt ordering (AC2)');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id = :'form_id'::uuid AND iv.item_format = 'sjt_best_response'
      AND (SELECT count(*) FROM public.scp_item_options o WHERE o.item_version_id = iv.id) = 3) = 22,
  'T12.4 every scenario item still has exactly three options');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T9 -- the seed is the database''s, not the candidate''s'; END $$;

SELECT pg_temp.ok(
  (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'other'::uuid) IS NOT NULL
  AND (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'other'::uuid) > 0,
  'T9.1 an attempt created without a seed is given a positive one by the trigger');

SELECT pg_temp.ok(
  (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'legacy'::uuid) IS NULL,
  'T9.2 fixture: the legacy-shaped attempt genuinely has no seed');

-- Even the owner of the table cannot move it.
SELECT pg_temp.must_fail(
  format('UPDATE public.scp_attempts SET option_order_seed = 999 WHERE id = %L', :'a1'),
  '23514',
  'T9.3 the seed is immutable once set, even for the schema owner');

SELECT pg_temp.must_fail(
  format('UPDATE public.scp_attempts SET option_order_seed = NULL WHERE id = %L', :'a1'),
  '23514',
  'T9.4 the seed cannot be nulled after the fact');

SELECT pg_temp.must_fail(
  format('UPDATE public.scp_attempts SET option_order_seed = 7 WHERE id = %L', :'legacy'),
  '23514',
  'T9.5 a NULL seed cannot be given a value later -- no lazy reseeding of an old attempt');

-- The candidate: no INSERT policy, no UPDATE policy. Their write is not
-- refused with an error -- RLS simply matches no row -- so the proof is that
-- nothing changed.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0010000-1111-0000-0000-000000000001';

SELECT pg_temp.must_fail(
  format('UPDATE public.scp_attempts SET option_order_seed = 5 WHERE id = %L', :'a1'),
  '42501',
  'T9.6 a candidate cannot update their attempt row at all (no UPDATE privilege)');

SELECT pg_temp.must_fail(
  format($q$INSERT INTO public.scp_attempts
           (subject_id, mode, form_id, assessment_version_id, jurisdiction_id,
            scoring_model_version, status, governance_mode, option_order_seed)
         SELECT 'a0010000-0000-0000-0000-000000000001', 'assessment', f.id,
                f.assessment_version_id,
                (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
                'det-v1', 'in_progress', 'closed_test', 1
           FROM public.scp_forms f WHERE f.id = %L$q$, :'form_id'),
  '42501',
  'T9.7 a candidate cannot create an attempt with a seed of their choosing');

SELECT pg_temp.must_fail(
  'SELECT public.scp_option_order_key(1, gen_random_uuid(), gen_random_uuid())',
  '42501',
  'T9.8 the ordering key is not executable by a client role');

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'a1'::uuid) = 101,
  'T9.9 after every attempt to move it, the seed still reads 101');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T1 -- the order is stable within an attempt'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0010000-1111-0000-0000-000000000001';

CREATE TEMP TABLE served_1 AS
SELECT item_version_id, display_order, item_format, options
  FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');
-- A refresh: the same call again, nothing else changed.
CREATE TEMP TABLE served_1_again AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');
-- The other language: the permutation is the attempt's, not the translation's.
CREATE TEMP TABLE served_1_en AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'a1'::uuid, 'en-GB');

RESET ROLE; RESET request.jwt.claim.sub;

-- ...and a resume: role dropped and re-established, as after a logout.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0010000-1111-0000-0000-000000000001';
CREATE TEMP TABLE served_1_resumed AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');
CREATE TEMP TABLE served_2 AS
SELECT item_version_id, item_format, options FROM public.scp_get_attempt_items(:'a2'::uuid, 'sv-SE');
CREATE TEMP TABLE served_legacy AS
SELECT item_version_id, item_format, options FROM public.scp_get_attempt_items(:'legacy'::uuid, 'sv-SE');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM served_1) = 50,
  'T1.0 the attempt serves all 50 items');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1 a JOIN served_1_again b USING (item_version_id)
               WHERE a.options IS DISTINCT FROM b.options),
  'T1.1 a refresh renders every item in exactly the same order');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1 a JOIN served_1_resumed b USING (item_version_id)
               WHERE a.options IS DISTINCT FROM b.options),
  'T1.2 a resumed session (logout, login) renders every item in exactly the same order');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1 a JOIN served_1_en b USING (item_version_id)
               WHERE jsonb_path_query_array(a.options, '$[*].option_id')
                  IS DISTINCT FROM jsonb_path_query_array(b.options, '$[*].option_id')),
  'T1.3 switching language keeps the same option order -- the permutation is the attempt''s');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T5 -- the same options, every one exactly once'; END $$;

CREATE TEMP TABLE authored AS
SELECT o.item_version_id,
       array_agg(o.id::text ORDER BY o.id::text) AS ids_sorted,
       array_agg(o.option_key ORDER BY o.display_order) AS keys_authored,
       count(*) AS n
  FROM public.scp_item_options o
  JOIN public.scp_form_items fi ON fi.item_version_id = o.item_version_id
 WHERE fi.form_id = :'form_id'::uuid
 GROUP BY o.item_version_id;

CREATE OR REPLACE FUNCTION pg_temp.served_ids_sorted(_options jsonb)
RETURNS text[] LANGUAGE sql AS $$
  SELECT array_agg(x ORDER BY x)
    FROM jsonb_array_elements_text(jsonb_path_query_array(_options, '$[*].option_id')) t(x);
$$;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_1 s JOIN authored a USING (item_version_id)
     WHERE pg_temp.served_ids_sorted(s.options) IS DISTINCT FROM a.ids_sorted
        OR jsonb_array_length(s.options) <> a.n),
  'T5.1 attempt A: every authored option id is delivered exactly once, nothing added, nothing missing');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_2 s JOIN authored a USING (item_version_id)
     WHERE pg_temp.served_ids_sorted(s.options) IS DISTINCT FROM a.ids_sorted
        OR jsonb_array_length(s.options) <> a.n),
  'T5.2 attempt B: every authored option id is delivered exactly once');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_1 s, jsonb_array_elements(s.options) e
     GROUP BY s.item_version_id, e->>'option_id' HAVING count(*) > 1),
  'T5.3 no option id appears twice within one item');

SELECT pg_temp.ok(
  (SELECT bool_and(
     (SELECT bool_and(k IN ('option_id','option_key','label')) FROM jsonb_object_keys(e) k))
     FROM served_1 s, jsonb_array_elements(s.options) e),
  'T5.4 a served option still carries only id, key and label -- no scoring metadata');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T3 -- different attempts, different order'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM served_1 a JOIN served_2 b USING (item_version_id)
    WHERE a.item_format = 'sjt_best_response'
      AND a.options IS DISTINCT FROM b.options) >= 1,
  'T3.1 at least one scenario item is ordered differently between the two attempts');

SELECT pg_temp.ok(
  (SELECT count(*) FROM served_1 a JOIN served_2 b USING (item_version_id)
    WHERE a.item_format = 'sjt_best_response'
      AND a.options IS DISTINCT FROM b.options) >= 12,
  'T3.2 ...and in fact most of them are (at least 12 of 22 under seeds 101 and 202)');

SELECT pg_temp.ok(
  (SELECT count(*) FROM served_1 a JOIN served_legacy c USING (item_version_id)
    WHERE a.item_format = 'sjt_best_response'
      AND a.options IS DISTINCT FROM c.options) >= 1,
  'T3.3 a seeded attempt differs from the authored order too');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T4 -- the preferred option is not always first'; END $$;

-- Where the preferred option landed, per attempt, per scenario item.
CREATE TEMP TABLE pref_pos AS
SELECT 'A' AS attempt, s.item_version_id, t.ord::int AS pos
  FROM served_1 s, jsonb_array_elements(s.options) WITH ORDINALITY AS t(e, ord)
  JOIN public.scp_item_options o ON o.id = (t.e->>'option_id')::uuid
 WHERE s.item_format = 'sjt_best_response' AND o.is_preferred
UNION ALL
SELECT 'B', s.item_version_id, t.ord::int
  FROM served_2 s, jsonb_array_elements(s.options) WITH ORDINALITY AS t(e, ord)
  JOIN public.scp_item_options o ON o.id = (t.e->>'option_id')::uuid
 WHERE s.item_format = 'sjt_best_response' AND o.is_preferred
UNION ALL
SELECT 'legacy', s.item_version_id, t.ord::int
  FROM served_legacy s, jsonb_array_elements(s.options) WITH ORDINALITY AS t(e, ord)
  JOIN public.scp_item_options o ON o.id = (t.e->>'option_id')::uuid
 WHERE s.item_format = 'sjt_best_response' AND o.is_preferred;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pref_pos WHERE attempt = 'legacy' AND pos = 1) = 22,
  'T4.0 baseline stated: in the authored order the preferred option IS first on all 22 items');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pref_pos WHERE attempt = 'A' AND pos = 1) < 22
  AND (SELECT count(*) FROM pref_pos WHERE attempt = 'B' AND pos = 1) < 22,
  'T4.1 in neither seeded attempt is the preferred option first on all 22 items (AC6)');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT pos) FROM pref_pos WHERE attempt = 'A') > 1
  AND (SELECT count(DISTINCT pos) FROM pref_pos WHERE attempt = 'B') > 1,
  'T4.2 within one attempt the preferred option''s position covers more than one slot');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pref_pos WHERE attempt = 'A' AND pos = 1) BETWEEN 2 AND 14
  AND (SELECT count(*) FROM pref_pos WHERE attempt = 'B' AND pos = 1) BETWEEN 2 AND 14,
  'T4.3 the preferred-first count per attempt is nowhere near 0 or 22 (seed 101 and 202)');

-- Refusing-only balance gate over the permutation itself: 200 seeds x 22
-- items = 4400 draws. With three options the preferred option should sit
-- first about a third of the time; the bounds are ~12 standard deviations
-- wide, so a fair permutation cannot trip this, and a biased one cannot pass
-- it. Deterministic: hashtextextended has no randomness in it. This is a
-- property of the mechanism, never a rule about any candidate.
CREATE TEMP TABLE balance AS
SELECT seed, o.item_version_id,
       row_number() OVER (PARTITION BY seed, o.item_version_id
                          ORDER BY public.scp_option_order_key(seed, o.item_version_id, o.id),
                                   o.display_order) AS pos,
       o.is_preferred
  FROM generate_series(1, 200) AS seed
  CROSS JOIN public.scp_item_options o
  JOIN public.scp_form_items fi ON fi.item_version_id = o.item_version_id
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = :'form_id'::uuid AND iv.item_format = 'sjt_best_response';

SELECT pg_temp.ok(
  (SELECT count(*) FILTER (WHERE pos = 1)::numeric / count(*)
     FROM balance WHERE is_preferred) BETWEEN 0.25 AND 0.42,
  'T4.4 over 200 seeds the preferred option is first about a third of the time -- not always, not never');

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
     SELECT item_version_id FROM balance WHERE is_preferred
      GROUP BY item_version_id HAVING count(DISTINCT pos) = 3) s) = 22,
  'T4.5 over 200 seeds every one of the 22 items shows its preferred option in all three slots');

DO $$
DECLARE _first int; _second int; _third int;
BEGIN
  SELECT count(*) FILTER (WHERE pos = 1), count(*) FILTER (WHERE pos = 2),
         count(*) FILTER (WHERE pos = 3)
    INTO _first, _second, _third FROM balance WHERE is_preferred;
  RAISE NOTICE '    diag  preferred-option slot distribution over 200 seeds x 22 items: first=% second=% third=%',
    _first, _second, _third;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T6 -- what is never shuffled'; END $$;

SELECT pg_temp.ok(
  public.scp_item_order_is_meaningful('biq_frequency')
  AND public.scp_item_order_is_meaningful('sjt_rate_effectiveness')
  AND NOT public.scp_item_order_is_meaningful('sjt_best_response')
  AND NOT public.scp_item_order_is_meaningful('sjt_best_worst'),
  'T6.1 ordered scales are excluded structurally; judgement items are not');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_1 s JOIN authored a USING (item_version_id)
     WHERE s.item_format = 'biq_frequency'
       AND pg_temp.served_keys(s.options) IS DISTINCT FROM a.keys_authored),
  'T6.2 all 24 frequency scales render in authored order in attempt A');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_2 s JOIN authored a USING (item_version_id)
     WHERE s.item_format = 'biq_frequency'
       AND pg_temp.served_keys(s.options) IS DISTINCT FROM a.keys_authored),
  'T6.3 ...and in attempt B: the seed never reaches an ordered scale');

-- The structural half: even with randomise_options forced ON for a frequency
-- item, the format rule keeps its authored order. A flag cannot shuffle a
-- scale.
DO $$
DECLARE _iv uuid; _served jsonb; _authored text[];
BEGIN
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = (SELECT form_id FROM fx) AND iv.item_format = 'biq_frequency'
   ORDER BY fi.display_order LIMIT 1;

  UPDATE public.scp_form_items SET randomise_options = true
   WHERE form_id = (SELECT form_id FROM fx) AND item_version_id = _iv;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0010000-1111-0000-0000-000000000001', true);
  SELECT options INTO _served
    FROM public.scp_get_attempt_items((SELECT a1 FROM fx), 'sv-SE')
   WHERE item_version_id = _iv;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT keys_authored INTO _authored FROM authored WHERE item_version_id = _iv;
  IF pg_temp.served_keys(_served) IS DISTINCT FROM _authored THEN
    RAISE EXCEPTION 'ASSERTION FAILED: a frequency scale was shuffled because a flag said so';
  END IF;
  RAISE NOTICE '    ok  T6.4 a frequency scale keeps its authored order even with randomise_options forced on (AC3)';

  UPDATE public.scp_form_items SET randomise_options = false
   WHERE form_id = (SELECT form_id FROM fx) AND item_version_id = _iv;
END $$;

-- And the converse: a scenario item explicitly marked non-randomised keeps
-- its authored order. The flag is honoured in both directions.
DO $$
DECLARE _iv uuid; _served jsonb; _authored text[];
BEGIN
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = (SELECT form_id FROM fx) AND iv.item_format = 'sjt_best_response'
   ORDER BY fi.display_order LIMIT 1;

  UPDATE public.scp_form_items SET randomise_options = false
   WHERE form_id = (SELECT form_id FROM fx) AND item_version_id = _iv;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0010000-1111-0000-0000-000000000001', true);
  SELECT options INTO _served
    FROM public.scp_get_attempt_items((SELECT a1 FROM fx), 'sv-SE')
   WHERE item_version_id = _iv;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT keys_authored INTO _authored FROM authored WHERE item_version_id = _iv;
  IF pg_temp.served_keys(_served) IS DISTINCT FROM _authored THEN
    RAISE EXCEPTION 'ASSERTION FAILED: a non-randomised scenario item was shuffled anyway';
  END IF;
  RAISE NOTICE '    ok  T6.5 a scenario item marked randomise_options = false keeps its authored order';

  UPDATE public.scp_form_items SET randomise_options = true
   WHERE form_id = (SELECT form_id FROM fx) AND item_version_id = _iv;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T11 -- an attempt from before the migration keeps the authored order'; END $$;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_legacy s JOIN authored a USING (item_version_id)
     WHERE s.item_format <> 'constructed_response'
       AND pg_temp.served_keys(s.options) IS DISTINCT FROM a.keys_authored),
  'T11.1 a NULL-seed attempt is served every item in authored order (compatibility rule A)');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T2 / T7 -- one logical answer set, three permutations, one score'; END $$;

-- The fixed logical answer set. Chosen by OPTION IDENTITY, from the item
-- bank, and deliberately mixed: scenario items cycle through the authored
-- keys a, b, c so the set contains preferred and non-preferred answers;
-- frequency items take the top of the scale; free-text items get a sentence.
CREATE TEMP TABLE answer_set AS
WITH items AS (
  SELECT fi.item_version_id, iv.item_format,
         (row_number() OVER (ORDER BY fi.display_order) % 3)::int AS pick
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = :'form_id'::uuid
)
SELECT i.item_version_id, i.item_format,
       CASE WHEN i.item_format = 'sjt_best_response' THEN
              (SELECT o.id FROM public.scp_item_options o
                WHERE o.item_version_id = i.item_version_id
                ORDER BY o.display_order OFFSET i.pick LIMIT 1)
            WHEN i.item_format = 'biq_frequency' THEN
              -- The top of the scale. Four of the 24 scales have only two
              -- points, so a fixed offset would leave them unanswered.
              (SELECT o.id FROM public.scp_item_options o
                WHERE o.item_version_id = i.item_version_id
                ORDER BY o.display_order DESC LIMIT 1)
       END AS option_id,
       CASE WHEN i.item_format = 'constructed_response'
            THEN 'Jag noterar tid, plats och vad jag själv såg, skilt från tolkning, och rapporterar till arbetsledaren.'
       END AS response_text
  FROM items i;

GRANT SELECT ON answer_set TO authenticated;

SELECT pg_temp.ok(
  (SELECT count(*) FROM answer_set WHERE option_id IS NULL AND response_text IS NULL) = 0
  AND (SELECT count(*) FROM answer_set a JOIN public.scp_item_options o ON o.id = a.option_id
        WHERE o.is_preferred) BETWEEN 5 AND 10,
  'T7.0 fixture: every item has an answer and the scenario answers mix preferred with non-preferred');

-- Answer all three attempts with exactly the same option ids, through the
-- product function, as the candidate.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0010000-1111-0000-0000-000000000001';

SELECT public.scp_save_response(:'a1'::uuid, a.item_version_id, a.option_id, NULL, NULL, a.response_text)
  FROM answer_set a;
SELECT public.scp_save_response(:'a2'::uuid, a.item_version_id, a.option_id, NULL, NULL, a.response_text)
  FROM answer_set a;
SELECT public.scp_save_response(:'legacy'::uuid, a.item_version_id, a.option_id, NULL, NULL, a.response_text)
  FROM answer_set a;

-- T2: the order after answering is the order before answering.
CREATE TEMP TABLE served_1_answered AS
SELECT item_version_id, options, saved_option_id
  FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');
CREATE TEMP TABLE served_legacy_answered AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'legacy'::uuid, 'sv-SE');

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1 a JOIN served_1_answered b USING (item_version_id)
               WHERE a.options IS DISTINCT FROM b.options),
  'T2.1 after saving every answer the attempt renders in exactly the same order');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1_answered s JOIN answer_set a USING (item_version_id)
               WHERE a.option_id IS NOT NULL AND s.saved_option_id IS DISTINCT FROM a.option_id),
  'T2.2 the saved answer comes back as the option id that was chosen, whatever its position');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_legacy a JOIN served_legacy_answered b USING (item_version_id)
               WHERE a.options IS DISTINCT FROM b.options),
  'T11.2 the NULL-seed attempt is NOT reordered after the candidate starts answering (AC14)');

-- The recorded answer is an identity, not a slot.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses r1
     JOIN public.scp_candidate_responses r2
       ON r2.item_version_id = r1.item_version_id AND r2.attempt_id = :'a2'::uuid
    WHERE r1.attempt_id = :'a1'::uuid
      AND r1.selected_option_id IS NOT DISTINCT FROM r2.selected_option_id
      AND r1.response_text IS NOT DISTINCT FROM r2.response_text) = 50,
  'T7.1 both attempts recorded the same 50 answers by option identity');

-- ...and the SAME option sat in DIFFERENT slots between the attempts for a
-- good share of items, or the invariance below would prove nothing.
SELECT pg_temp.ok(
  (SELECT count(*)
     FROM answer_set a
     JOIN served_1 s1 ON s1.item_version_id = a.item_version_id
     JOIN served_2 s2 ON s2.item_version_id = a.item_version_id
    WHERE a.item_format = 'sjt_best_response'
      AND (SELECT ord FROM jsonb_array_elements(s1.options) WITH ORDINALITY t(e, ord)
            WHERE (e->>'option_id')::uuid = a.option_id)
       <> (SELECT ord FROM jsonb_array_elements(s2.options) WITH ORDINALITY t(e, ord)
            WHERE (e->>'option_id')::uuid = a.option_id)) >= 8,
  'T7.2 the chosen option occupied a different slot in the two attempts on at least 8 scenario items');

-- Submit all three through the product, as the candidate.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0010000-1111-0000-0000-000000000001';
CREATE TEMP TABLE sub_1 AS SELECT * FROM public.scp_submit_attempt(:'a1'::uuid);
CREATE TEMP TABLE sub_2 AS SELECT * FROM public.scp_submit_attempt(:'a2'::uuid);
CREATE TEMP TABLE sub_l AS SELECT * FROM public.scp_submit_attempt(:'legacy'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

DO $$
DECLARE _r record;
BEGIN
  FOR _r IN SELECT 'A' AS which, * FROM sub_1 UNION ALL SELECT 'B', * FROM sub_2 UNION ALL SELECT 'legacy', * FROM sub_l LOOP
    RAISE NOTICE '    diag  submit %: evidence_written=% reviews_opened=% status=%',
      _r.which, _r.evidence_written, _r.reviews_opened, _r.attempt_status;
  END LOOP;
END $$;

-- Deterministic evidence is written for every closed-format item that is not
-- safety-critical (a safety-critical answer waits for a human); every
-- constructed-response and safety-critical item opens a review. Derived from
-- the form rather than pinned, so the assertion says what it means.
CREATE TEMP TABLE expected_submit AS
SELECT count(*) FILTER (WHERE iv.item_format <> 'constructed_response' AND NOT iv.is_safety_critical) AS evidence,
       count(*) FILTER (WHERE iv.item_format = 'constructed_response' OR iv.is_safety_critical) AS reviews
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = :'form_id'::uuid;

SELECT pg_temp.ok(
  (SELECT evidence_written FROM sub_1) = (SELECT evidence_written FROM sub_2)
  AND (SELECT evidence_written FROM sub_1) = (SELECT evidence_written FROM sub_l)
  AND (SELECT evidence_written FROM sub_1) = (SELECT evidence FROM expected_submit)
  AND (SELECT evidence_written FROM sub_1) = 43
  AND (SELECT reviews_opened FROM sub_1) = (SELECT reviews_opened FROM sub_2)
  AND (SELECT reviews_opened FROM sub_1) = (SELECT reviews_opened FROM sub_l)
  AND (SELECT reviews_opened FROM sub_1) = (SELECT reviews FROM expected_submit)
  AND (SELECT reviews_opened FROM sub_1) = 7,
  'T7.3 all three submissions wrote the same 43 deterministic evidence rows and opened the same 7 reviews');

-- The ledger, item by item. Everything scoring produced -- behaviour, source
-- type, contribution, confidence, safety flag, disclosure class, review
-- requirement -- must be identical per item across the three permutations.
CREATE OR REPLACE FUNCTION pg_temp.ledger(_attempt uuid)
RETURNS TABLE (item_version_id uuid, behaviour_version_id uuid, source_type text,
               provenance_type text, contribution numeric, confidence numeric,
               is_safety_critical boolean, disclosure_class text,
               requires_human_review boolean, review_status text)
LANGUAGE sql AS $$
  SELECT r.item_version_id, e.behaviour_version_id, e.source_type, e.provenance_type,
         e.contribution, e.confidence, e.is_safety_critical, e.disclosure_class,
         e.requires_human_review, e.review_status
    FROM public.scp_competency_evidence e
    JOIN public.scp_candidate_responses r ON r.id = e.source_ref
   WHERE r.attempt_id = _attempt
$$;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT * FROM pg_temp.ledger(:'a1'::uuid) EXCEPT SELECT * FROM pg_temp.ledger(:'a2'::uuid))
  AND NOT EXISTS (SELECT * FROM pg_temp.ledger(:'a2'::uuid) EXCEPT SELECT * FROM pg_temp.ledger(:'a1'::uuid))
  AND (SELECT count(*) FROM pg_temp.ledger(:'a1'::uuid)) = (SELECT evidence FROM expected_submit),
  'T7.4 seed 101 and seed 202: the evidence ledger is identical row for row (AC8)');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT * FROM pg_temp.ledger(:'a1'::uuid) EXCEPT SELECT * FROM pg_temp.ledger(:'legacy'::uuid))
  AND NOT EXISTS (SELECT * FROM pg_temp.ledger(:'legacy'::uuid) EXCEPT SELECT * FROM pg_temp.ledger(:'a1'::uuid)),
  'T7.5 seeded and authored order: the evidence ledger is identical row for row -- scoring never saw the position');

-- The score is the option's own, and the preferred option scores top.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_temp.ledger(:'a1'::uuid) l
      JOIN answer_set a USING (item_version_id)
      JOIN public.scp_item_options o ON o.id = a.option_id
     WHERE a.item_format = 'sjt_best_response'
       AND l.contribution <> round(o.score_value::numeric /
             (SELECT max(o2.score_value) FROM public.scp_item_options o2
               WHERE o2.item_version_id = a.item_version_id), 3)),
  'T7.6 every scenario contribution equals the chosen option''s own score over the item maximum');

-- The candidate cannot read the ledger, the key or the seed of a peer -- and
-- the position an option was shown in is recorded nowhere, so nothing
-- downstream can ever weight it.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses r
    WHERE r.attempt_id IN (:'a1'::uuid, :'a2'::uuid, :'legacy'::uuid)
      AND r.display_order IS NOT NULL) = 0,
  'T7.7 no response records a rendered position (AC7)');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T8 -- a submitted attempt is immutable'; END $$;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = :'a1'::uuid) <> 'in_progress',
  'T8.0 the attempt left in_progress on submission');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0010000-1111-0000-0000-000000000001';

CREATE TEMP TABLE served_1_submitted AS
SELECT item_version_id, options, saved_option_id
  FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');

SELECT pg_temp.must_fail(
  format('SELECT public.scp_save_response(%L, (SELECT item_version_id FROM answer_set WHERE option_id IS NOT NULL LIMIT 1), (SELECT option_id FROM answer_set WHERE option_id IS NOT NULL LIMIT 1), NULL, NULL, NULL)', :'a1'),
  '23514',
  'T8.1 no answer can be saved on a submitted attempt');

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1 a JOIN served_1_submitted b USING (item_version_id)
               WHERE a.options IS DISTINCT FROM b.options),
  'T8.2 after submission the attempt still renders in the order the candidate saw -- reproducible for review');

SELECT pg_temp.must_fail(
  format('UPDATE public.scp_attempts SET option_order_seed = 303 WHERE id = %L', :'a1'),
  '23514',
  'T8.3 the seed of a submitted attempt cannot be changed');

SELECT pg_temp.ok(
  (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'a1'::uuid) = 101
  AND (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'a2'::uuid) = 202
  AND (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'legacy'::uuid) IS NULL,
  'T8.4 all three seeds read exactly as they were created');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'T10 -- another user reads nothing'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0010000-1111-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE')) = 0,
  'T10.1 the delivery path returns no rows for an attempt that is not the caller''s');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE id IN (:'a1'::uuid, :'a2'::uuid, :'legacy'::uuid)) = 0,
  'T10.2 the peer''s attempt rows -- and with them the seeds -- are invisible under RLS');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_get_attempt_items(:'other'::uuid, 'sv-SE')) = 50,
  'T10.3 ...while the caller''s own attempt is served in full');

SELECT pg_temp.must_fail(
  format('SELECT public.scp_option_order_key(101, gen_random_uuid(), gen_random_uuid())'),
  '42501',
  'T10.4 a client cannot recompute a permutation from a guessed seed: the key function is not theirs to call');

RESET ROLE; RESET request.jwt.claim.sub;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'Security -- the surface this migration added'; END $$;

SELECT pg_temp.ok(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_get_attempt_items')
  AND (SELECT proconfig::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'scp_get_attempt_items') ILIKE '%search_path%',
  'S.1 delivery is still SECURITY DEFINER with a pinned search_path');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_get_attempt_items(uuid, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_get_attempt_items(uuid, text)', 'EXECUTE'),
  'S.2 delivery: anon cannot execute, authenticated can');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('scp_option_order_key','scp_item_order_is_meaningful',
                         'scp_assign_option_order_seed','scp_guard_option_order_seed_immutable')
       AND (p.prosecdef
            OR has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  'S.3 none of the four helpers is SECURITY DEFINER and no client role can execute any of them');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_attempts'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND roles::text[] && ARRAY['authenticated','anon','public']) = 0,
  'S.4 no client role holds a write policy on scp_attempts -- the seed has no client write path');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'Diagnostic -- option length (read-only, gates nothing)'; END $$;

DO $$
DECLARE _sv int; _en int;
BEGIN
  WITH ranked AS (
    SELECT o.item_version_id, t.language, o.is_preferred,
           rank() OVER (PARTITION BY o.item_version_id, t.language ORDER BY length(t.label) DESC) AS len_rank
      FROM public.scp_item_options o
      JOIN public.scp_item_option_texts t ON t.item_option_id = o.id
      JOIN public.scp_form_items fi ON fi.item_version_id = o.item_version_id
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE fi.form_id = (SELECT form_id FROM fx) AND iv.item_format = 'sjt_best_response')
  SELECT count(*) FILTER (WHERE language = 'sv-SE'), count(*) FILTER (WHERE language = 'en-GB')
    INTO _sv, _en
    FROM ranked WHERE is_preferred AND len_rank = 1;
  RAISE NOTICE '    diag  preferred option is the LONGEST on %/22 scenario items (sv-SE) and %/22 (en-GB). '
               'Content review, not this PR, owns that number.', _sv, _en;
END $$;

ROLLBACK;
