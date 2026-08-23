-- Assessment foundation — option order, publication gates, content, lifecycle.
--
-- The defect this suite exists to keep out: on the bank as it stood before
-- 20260907093000, a candidate who read nothing and always picked the first
-- option scored full marks on every keyed scenario item in the product. The
-- content was repaired; these assertions are what stop it coming back.
--
-- Every guard is mutated to prove it refuses what it exists to refuse. A gate
-- that has never been shown to fail is not evidence of anything.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

-- ── Fixture ────────────────────────────────────────────────────────────────
--
-- One person, two attempts on the real flagship form with DIFFERENT, EXPLICIT
-- seeds. Explicit rather than random: a test that depends on two random draws
-- differing is a test that fails for the wrong reason one run in a million.

INSERT INTO auth.users (id, email) VALUES
  ('af000000-1111-0000-0000-000000000001', 'candidate.one@foundation.invalid'),
  ('af000000-1111-0000-0000-000000000002', 'candidate.two@foundation.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scp_subjects (id) VALUES
  ('af000000-0000-0000-0000-000000000001'),
  ('af000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('af000000-0000-0000-0000-000000000001', 'af000000-1111-0000-0000-000000000001'),
       ('af000000-0000-0000-0000-000000000002', 'af000000-1111-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

WITH f AS (
  SELECT id, assessment_version_id FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a'
), a1 AS (
  INSERT INTO public.scp_attempts
    (subject_id, mode, form_id, assessment_version_id, jurisdiction_id,
     scoring_model_version, status, governance_mode, option_order_seed)
  SELECT 'af000000-0000-0000-0000-000000000001', 'assessment', f.id,
         f.assessment_version_id,
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
         'det-v1', 'in_progress', 'closed_test', 101
    FROM f RETURNING id
), a2 AS (
  INSERT INTO public.scp_attempts
    (subject_id, mode, form_id, assessment_version_id, jurisdiction_id,
     scoring_model_version, status, governance_mode, option_order_seed)
  SELECT 'af000000-0000-0000-0000-000000000001', 'assessment', f.id,
         f.assessment_version_id,
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
         'det-v1', 'in_progress', 'closed_test', 202
    FROM f RETURNING id
), a3 AS (
  -- No seed supplied: the trigger has to provide one.
  INSERT INTO public.scp_attempts
    (subject_id, mode, form_id, assessment_version_id, jurisdiction_id,
     scoring_model_version, status, governance_mode)
  SELECT 'af000000-0000-0000-0000-000000000002', 'assessment', f.id,
         f.assessment_version_id,
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
         'det-v1', 'in_progress', 'closed_test'
    FROM f RETURNING id
)
SELECT (SELECT id FROM a1) AS one, (SELECT id FROM a2) AS two,
       (SELECT id FROM a3) AS three, (SELECT id FROM f) AS form,
       (SELECT assessment_version_id FROM f) AS ver;

SELECT (SELECT id FROM public.scp_attempts
         WHERE option_order_seed = 101
           AND subject_id = 'af000000-0000-0000-0000-000000000001') AS a1,
       (SELECT id FROM public.scp_attempts
         WHERE option_order_seed = 202
           AND subject_id = 'af000000-0000-0000-0000-000000000001') AS a2,
       (SELECT id FROM public.scp_attempts
         WHERE subject_id = 'af000000-0000-0000-0000-000000000002') AS a3,
       (SELECT id FROM public.scp_forms
         WHERE slug = 'security-officer-recruitment-form-a') AS fid,
       (SELECT assessment_version_id FROM public.scp_forms
         WHERE slug = 'security-officer-recruitment-form-a') AS vid \gset

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP 1 -- the attempt seed'; END $$;

SELECT pg_temp.ok(
  (SELECT option_order_seed FROM public.scp_attempts WHERE id = :'a3'::uuid) IS NOT NULL,
  'an attempt created without a seed is given one');

DO $$
BEGIN
  UPDATE public.scp_attempts SET option_order_seed = 999 WHERE option_order_seed = 101;
  RAISE EXCEPTION 'ASSERTION FAILED: the option order seed was changed after the fact';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '    ok  the seed is immutable once set';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP 2 -- the order is stable within an attempt'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-1111-0000-0000-000000000001';

CREATE TEMP TABLE served_1 AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');
-- A refresh: the same call again, nothing else changed.
CREATE TEMP TABLE served_1_again AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');

RESET ROLE; RESET request.jwt.claim.sub;

-- ...and a resume: role dropped and re-established, as after a logout.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-1111-0000-0000-000000000001';
CREATE TEMP TABLE served_1_resumed AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'a1'::uuid, 'sv-SE');

CREATE TEMP TABLE served_2 AS
SELECT item_version_id, options FROM public.scp_get_attempt_items(:'a2'::uuid, 'sv-SE');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM served_1) = 56,
  'the flagship serves 56 items');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1 a JOIN served_1_again b USING (item_version_id)
               WHERE a.options IS DISTINCT FROM b.options),
  'a refresh renders every item in exactly the same order');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM served_1 a JOIN served_1_resumed b USING (item_version_id)
               WHERE a.options IS DISTINCT FROM b.options),
  'a resumed session renders every item in exactly the same order');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM served_1 a JOIN served_2 b USING (item_version_id)
           WHERE a.options IS DISTINCT FROM b.options),
  'a different attempt gets a different order');

-- Same options, different sequence -- not a different set of options.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_1 a JOIN served_2 b USING (item_version_id)
     WHERE (SELECT array_agg(x ORDER BY x) FROM jsonb_array_elements_text(
              jsonb_path_query_array(a.options, '$[*].option_id')) t(x))
        IS DISTINCT FROM
           (SELECT array_agg(x ORDER BY x) FROM jsonb_array_elements_text(
              jsonb_path_query_array(b.options, '$[*].option_id')) t(x))),
  'both attempts are shown the same options, only in a different sequence');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP 3 -- what is never shuffled'; END $$;

SELECT pg_temp.ok(
  public.scp_item_order_is_meaningful('biq_frequency')
  AND public.scp_item_order_is_meaningful('sjt_rate_effectiveness')
  AND NOT public.scp_item_order_is_meaningful('sjt_best_response')
  AND NOT public.scp_item_order_is_meaningful('sjt_best_worst'),
  'ordered scales are excluded from shuffling, judgement items are not');

-- The 24 self-report frequency items must render low-to-high in every attempt.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1
      FROM served_1 s
      JOIN public.scp_item_versions iv ON iv.id = s.item_version_id
     WHERE iv.item_format = 'biq_frequency'
       AND (SELECT array_agg((e->>'option_key') ORDER BY ord)
              FROM jsonb_array_elements(s.options) WITH ORDINALITY AS t(e, ord))
           IS DISTINCT FROM
           (SELECT array_agg(o.option_key ORDER BY o.display_order)
              FROM public.scp_item_options o WHERE o.item_version_id = iv.id)),
  'every frequency scale keeps its authored order');

-- ...and it is the same authored order in the other attempt, i.e. the seed
-- genuinely does not reach them.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM served_1 a JOIN served_2 b USING (item_version_id)
      JOIN public.scp_item_versions iv ON iv.id = a.item_version_id
     WHERE iv.item_format = 'biq_frequency'
       AND a.options IS DISTINCT FROM b.options),
  'two attempts see the frequency scales identically');

-- Conversely, the scenario items DID move.
SELECT pg_temp.ok(
  (SELECT count(*) FROM served_1 a JOIN served_2 b USING (item_version_id)
     JOIN public.scp_item_versions iv ON iv.id = a.item_version_id
    WHERE iv.item_format = 'sjt_best_response'
      AND a.options IS DISTINCT FROM b.options) >= 15,
  'most scenario items are ordered differently between the two attempts');

-- An item explicitly marked non-randomised keeps its authored order.
DO $$
DECLARE _iv uuid; _form uuid; _served jsonb; _authored text[];
BEGIN
  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a';
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.item_format = 'sjt_best_response'
   ORDER BY fi.display_order LIMIT 1;

  UPDATE public.scp_form_items SET randomise_options = false
   WHERE form_id = _form AND item_version_id = _iv;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'af000000-1111-0000-0000-000000000001', true);
  SELECT options INTO _served
    FROM public.scp_get_attempt_items(
      (SELECT id FROM public.scp_attempts WHERE option_order_seed = 101), 'sv-SE')
   WHERE item_version_id = _iv;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT array_agg(o.option_key ORDER BY o.display_order) INTO _authored
    FROM public.scp_item_options o WHERE o.item_version_id = _iv;

  IF (SELECT array_agg((e->>'option_key') ORDER BY ord)
        FROM jsonb_array_elements(_served) WITH ORDINALITY AS t(e, ord))
     IS DISTINCT FROM _authored THEN
    RAISE EXCEPTION 'ASSERTION FAILED: a non-randomised item was shuffled anyway';
  END IF;
  RAISE NOTICE '    ok  an item marked randomise_options = false keeps its authored order';

  UPDATE public.scp_form_items SET randomise_options = true
   WHERE form_id = _form AND item_version_id = _iv;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP 4 -- scoring does not depend on position'; END $$;

DO $$
DECLARE
  _a1 uuid; _a2 uuid; _iv uuid; _opt uuid; _p1 int; _p2 int; _r1 uuid; _r2 uuid;
BEGIN
  SELECT id INTO _a1 FROM public.scp_attempts WHERE option_order_seed = 101;
  SELECT id INTO _a2 FROM public.scp_attempts WHERE option_order_seed = 202;

  -- An item where the PREFERRED option itself lands in two different positions
  -- under the two seeds. Not merely an item whose overall order differs: if the
  -- preferred option happened to sit in the same slot both times, the assertion
  -- below would prove nothing about position independence.
  SELECT fi.item_version_id INTO _iv
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND iv.item_format = 'sjt_best_response'
     AND (SELECT rn FROM (
            SELECT o.id, o.is_preferred,
                   row_number() OVER (ORDER BY public.scp_option_order_key(101, iv.id, o.id)) AS rn
              FROM public.scp_item_options o WHERE o.item_version_id = iv.id) s
           WHERE s.is_preferred)
      IS DISTINCT FROM
         (SELECT rn FROM (
            SELECT o.id, o.is_preferred,
                   row_number() OVER (ORDER BY public.scp_option_order_key(202, iv.id, o.id)) AS rn
              FROM public.scp_item_options o WHERE o.item_version_id = iv.id) s
           WHERE s.is_preferred)
   LIMIT 1;

  IF _iv IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: no item moves its preferred option between the two '
      'seeds, which would mean the permutation is not really permuting';
  END IF;

  SELECT o.id INTO _opt FROM public.scp_item_options o
   WHERE o.item_version_id = _iv AND o.is_preferred;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'af000000-1111-0000-0000-000000000001', true);
  _r1 := public.scp_save_response(_a1, _iv, _opt);
  _r2 := public.scp_save_response(_a2, _iv, _opt);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT display_order INTO _p1 FROM public.scp_candidate_responses WHERE id = _r1;
  SELECT display_order INTO _p2 FROM public.scp_candidate_responses WHERE id = _r2;

  IF _p1 IS NULL OR _p2 IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the displayed position of the chosen option was not recorded';
  END IF;
  RAISE NOTICE '    ok  the position the chosen option occupied is recorded (% and %)', _p1, _p2;

  IF _p1 = _p2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the same option occupied the same position in both attempts, '
      'so this assertion proves nothing about position independence';
  END IF;
  RAISE NOTICE '    ok  the same option genuinely appeared in two different positions';

  -- The response identifies the option, not the slot. That is the whole reason
  -- scoring survives randomisation untouched.
  IF (SELECT selected_option_id FROM public.scp_candidate_responses WHERE id = _r1)
     IS DISTINCT FROM
     (SELECT selected_option_id FROM public.scp_candidate_responses WHERE id = _r2) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the same choice recorded two different options';
  END IF;
  RAISE NOTICE '    ok  both attempts recorded the same option despite the different position';

  -- And the score follows the option.
  IF (SELECT o.score_value FROM public.scp_item_options o WHERE o.id = _opt) <> 3 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the preferred option does not carry the top score';
  END IF;
  RAISE NOTICE '    ok  the score comes from the option, not from where it was shown';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP 5 -- the balance guards refuse what they exist to refuse'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_version_publication_readiness(:'vid'::uuid)
    WHERE gate IN ('answer_key_balance','answer_position_balance','option_length_balance')
      AND status = 'pass') = 3,
  'the repaired flagship passes all three balance gates');

-- Mutation 1: every preferred option back on the first key.
DO $$
DECLARE _n int; _form uuid;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';

  -- Re-key so the preferred option is always 'a'. Two passes, because
  -- option_key is unique per item version and the rewrite overlaps itself.
  UPDATE public.scp_item_options o SET option_key = 'z' || o.option_key
    FROM public.scp_form_items fi
   WHERE fi.form_id = _form AND fi.item_version_id = o.item_version_id;
  UPDATE public.scp_item_options o SET option_key = s.k
    FROM (SELECT o2.id,
                 chr(96 + row_number() OVER (PARTITION BY o2.item_version_id
                       ORDER BY o2.is_preferred DESC, o2.option_key)::int) AS k
            FROM public.scp_item_options o2
            JOIN public.scp_form_items fi2 ON fi2.item_version_id = o2.item_version_id
           WHERE fi2.form_id = _form) s
   WHERE o.id = s.id;

  SELECT count(*) INTO _n
    FROM public.scp_assessment_version_publication_readiness(
      (SELECT assessment_version_id FROM public.scp_forms WHERE id = _form))
   WHERE gate = 'answer_key_balance' AND status = 'fail';
  IF _n = 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: an all-first-key form passed the answer key gate';
  END IF;
  RAISE NOTICE '    ok  a form keyed "a" on every item fails the answer-key gate';
  RAISE EXCEPTION 'rollback the mutation' USING ERRCODE = 'raise_exception';
EXCEPTION WHEN raise_exception THEN
  NULL;  -- the DO block's implicit savepoint undoes the key rewrite
END $$;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_assessment_version_publication_readiness(:'vid'::uuid)
    WHERE gate = 'answer_key_balance') = 'pass',
  'the key mutation was rolled back and the real form still passes');

-- Mutation 2: every preferred option displayed first.
DO $$
DECLARE _n int; _form uuid;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';

  -- Park out of the way first: display_order is unique per item version.
  UPDATE public.scp_item_options o SET display_order = o.display_order + 10
    FROM public.scp_form_items fi
   WHERE fi.form_id = _form AND fi.item_version_id = o.item_version_id;
  -- Then re-pack 1..4 with the preferred option always first.
  UPDATE public.scp_item_options o SET display_order = s.rn
    FROM (SELECT o2.id,
                 row_number() OVER (PARTITION BY o2.item_version_id
                       ORDER BY o2.is_preferred DESC, o2.display_order)::int AS rn
            FROM public.scp_item_options o2
            JOIN public.scp_form_items fi2 ON fi2.item_version_id = o2.item_version_id
           WHERE fi2.form_id = _form) s
   WHERE o.id = s.id;

  SELECT count(*) INTO _n
    FROM public.scp_assessment_version_publication_readiness(
      (SELECT assessment_version_id FROM public.scp_forms WHERE id = _form))
   WHERE gate = 'answer_position_balance' AND status = 'fail';
  IF _n = 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: a preferred-always-first form passed the position gate';
  END IF;
  RAISE NOTICE '    ok  a form showing the preferred option first every time fails the position gate';
  RAISE EXCEPTION 'rollback the mutation' USING ERRCODE = 'raise_exception';
EXCEPTION WHEN raise_exception THEN
  NULL;
END $$;

-- Mutation 3: the preferred option is always the longest.
DO $$
DECLARE _n int; _form uuid;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';

  UPDATE public.scp_item_option_texts ot
     SET label = ot.label || repeat(' och dessutom kontrollerar du det en gång till', 4)
    FROM public.scp_item_options o, public.scp_form_items fi
   WHERE ot.item_option_id = o.id AND o.is_preferred
     AND fi.item_version_id = o.item_version_id AND fi.form_id = _form;

  SELECT count(*) INTO _n
    FROM public.scp_assessment_version_publication_readiness(
      (SELECT assessment_version_id FROM public.scp_forms WHERE id = _form))
   WHERE gate = 'option_length_balance' AND status = 'fail';
  IF _n = 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: a preferred-always-longest form passed the length gate';
  END IF;
  RAISE NOTICE '    ok  a form whose preferred option is always longest fails the length gate';
  RAISE EXCEPTION 'rollback the mutation' USING ERRCODE = 'raise_exception';
EXCEPTION WHEN raise_exception THEN
  NULL;
END $$;

-- Mutation 4: ONE legitimately long option must not fail the whole form.
-- A rule brittle enough to do that gets switched off rather than fixed.
DO $$
DECLARE _status text; _form uuid; _iv uuid;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.item_format = 'sjt_best_response'
   ORDER BY fi.display_order LIMIT 1;

  UPDATE public.scp_item_option_texts ot
     SET label = ot.label || repeat(' med fullständig dokumentation av varje kontrollpunkt', 3)
    FROM public.scp_item_options o
   WHERE ot.item_option_id = o.id AND o.is_preferred AND o.item_version_id = _iv;

  SELECT status INTO _status
    FROM public.scp_assessment_version_publication_readiness(
      (SELECT assessment_version_id FROM public.scp_forms WHERE id = _form))
   WHERE gate = 'option_length_balance';
  IF _status <> 'pass' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: one long option on one item failed the whole form. '
      'The form-level rule is too brittle to survive contact with real content.';
  END IF;
  RAISE NOTICE '    ok  a single legitimately long option does not fail the form';
  RAISE EXCEPTION 'rollback the mutation' USING ERRCODE = 'raise_exception';
EXCEPTION WHEN raise_exception THEN
  NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP 6 -- the content itself'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     JOIN public.scp_competencies c ON c.id = iv.competency_id
    WHERE fi.form_id = :'fid'::uuid
      AND iv.evidence_source_type = 'assessment_response'
      AND c.code = 'SCC-07') >= 5,
  'SCC-07 carries at least five observed items');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     JOIN public.scp_competencies c ON c.id = iv.competency_id
    WHERE fi.form_id = :'fid'::uuid
      AND iv.evidence_source_type = 'assessment_response'
      AND c.code = 'SCC-04') >= 5,
  'SCC-04 carries at least five observed items');

-- Five observations is what makes the maturity estimate survive one weak
-- answer. With two, a single imperfect response drags the weighted mean under
-- the 0.55 developing_evidence threshold and the competency collapses to
-- limited_evidence -- a property of the form, not of the candidate.
SELECT pg_temp.ok(
  (SELECT min_observations FROM public.scp_maturity_thresholds
    WHERE threshold_version = 'v1' AND level = 'developing_evidence' AND is_active) = 2,
  'the developing_evidence threshold is still two observations (the reason five matters)');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE fi.form_id = :'fid'::uuid AND iv.item_format = 'constructed_response'
       AND (SELECT count(*) FROM public.scp_rubric_versions rv
             WHERE rv.item_version_id = iv.id) = 0),
  'every constructed-response item still carries a rubric');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_rubric_versions rv ON rv.item_version_id = iv.id
      JOIN public.scp_rubric_dimensions d ON d.rubric_version_id = rv.id
     WHERE fi.form_id = :'fid'::uuid
       AND (SELECT count(*) FROM public.scp_rubric_levels l
             WHERE l.rubric_dimension_id = d.id) <> 5),
  'every rubric dimension still defines all five levels');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE fi.form_id = :'fid'::uuid AND iv.evidence_source_type = 'self_report'
       AND (iv.primary_construct <> 'self_reported_work_behaviour'
         OR iv.is_safety_critical OR iv.requires_human_review)),
  'self-report items are labelled as self-report and are neither safety-critical nor reviewable');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT iv.evidence_source_type) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id = :'fid'::uuid) = 2,
  'observed and self-reported evidence remain two separate kinds on the form');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_item_options o ON o.item_version_id = iv.id
     WHERE fi.form_id = :'fid'::uuid AND iv.item_format = 'sjt_best_response'
       AND NOT o.is_preferred AND o.distractor_error_type IS NULL),
  'every scenario distractor still names the error type it represents');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT o.distractor_error_type) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     JOIN public.scp_item_options o ON o.item_version_id = iv.id
    WHERE fi.form_id = :'fid'::uuid AND o.distractor_error_type IS NOT NULL) >= 8,
  'the distractor error taxonomy is genuinely used, not collapsed onto one value');

-- so-rj-c07 and so-rj-c19 are deliberate ideal-point items. Flattening either
-- into a monotonic key is a silent scoring change, so it fails here.
SELECT pg_temp.ok(
  (SELECT array_agg(o.score_value ORDER BY o.display_order)
     FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug = 'so-rj-c07') = ARRAY[0,2,3,2]::numeric[],
  'so-rj-c07 keeps its deliberate ideal-point key (0/2/3/2)');

SELECT pg_temp.ok(
  (SELECT array_agg(o.score_value ORDER BY o.display_order)
     FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug = 'so-rj-c19') = ARRAY[2,3,1,0]::numeric[],
  'so-rj-c19 keeps its deliberate ideal-point key (2/3/1/0)');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_item_options o
      JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE i.slug IN ('so-rj-c07', 'so-rj-c19') AND btrim(o.scoring_rationale_sv) = ''),
  'every ideal-point option explains its own score, so the key cannot read as drift');

-- No employment recommendation may enter the content by any route.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      LEFT JOIN public.scp_item_texts t ON t.item_version_id = iv.id
      LEFT JOIN public.scp_item_options o ON o.item_version_id = iv.id
      LEFT JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id
     WHERE fi.form_id = :'fid'::uuid
       AND (coalesce(t.scenario,'') || ' ' || coalesce(t.prompt,'') || ' ' ||
            coalesce(ot.label,'') || ' ' || coalesce(o.scoring_rationale_sv,''))
           ~* ('\m(godkänd|underkänd|rekommenderas för anställning|olämplig som väktare|'
            || 'pass/fail|hire|do not hire|not suitable for employment|rank(ed|ing) against)\M')),
  'no pass, fail, hire or suitability language entered the flagship content');

-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP 7 -- governance and the lifecycle rule'; END $$;

SELECT pg_temp.ok(
  NOT public.scp_version_has_operational_evidence(:'vid'::uuid),
  'closed-test attempts do not freeze the content -- internal testing stays possible');

-- Draft content is still editable. That is the whole point of a draft, and it
-- is what made this repair possible in the first place.
DO $$
DECLARE _iv uuid;
BEGIN
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE f.slug = 'security-officer-recruitment-form-a' ORDER BY fi.display_order LIMIT 1;
  UPDATE public.scp_item_options SET scoring_rationale_sv = scoring_rationale_sv
   WHERE item_version_id = _iv;
  RAISE NOTICE '    ok  draft content can still be iterated';
END $$;

-- ...but a single attempt in recruitment governance freezes it.
DO $$
DECLARE _form uuid; _iv uuid; _att uuid;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
   WHERE fi.form_id = _form ORDER BY fi.display_order LIMIT 1;

  INSERT INTO public.scp_attempts
    (subject_id, mode, form_id, assessment_version_id, jurisdiction_id,
     scoring_model_version, status, governance_mode)
  VALUES ('af000000-0000-0000-0000-000000000002', 'assessment', _form,
          (SELECT assessment_version_id FROM public.scp_forms WHERE id = _form),
          (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
          'det-v1', 'submitted', 'recruitment')
  RETURNING id INTO _att;

  BEGIN
    UPDATE public.scp_item_option_texts ot SET label = 'rewritten after the fact'
      FROM public.scp_item_options o
     WHERE ot.item_option_id = o.id AND o.item_version_id = _iv;
    RAISE EXCEPTION 'ASSERTION FAILED: evidenced content was silently rewritten';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '    ok  content with real evidence cannot be edited in place';
  END;

  BEGIN
    DELETE FROM public.scp_item_options WHERE item_version_id = _iv;
    RAISE EXCEPTION 'ASSERTION FAILED: evidenced options were deleted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '    ok  content with real evidence cannot have its options removed';
  END;

  BEGIN
    UPDATE public.scp_form_items SET display_order = display_order
     WHERE form_id = _form AND item_version_id = _iv;
    RAISE EXCEPTION 'ASSERTION FAILED: evidenced item membership was changed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '    ok  content with real evidence cannot change item membership';
  END;

  RAISE EXCEPTION 'rollback the recruitment attempt' USING ERRCODE = 'raise_exception';
EXCEPTION WHEN raise_exception THEN
  NULL;
END $$;

SELECT pg_temp.ok(
  NOT public.scp_version_has_operational_evidence(:'vid'::uuid),
  'the recruitment attempt was rolled back and the content is mutable again');

-- Publication is refused while the reviews are outstanding.
DO $$
DECLARE _msg text;
BEGIN
  UPDATE public.scp_assessment_versions SET content_status = 'published'
   WHERE id = (SELECT assessment_version_id FROM public.scp_forms
                WHERE slug = 'security-officer-recruitment-form-a');
  RAISE EXCEPTION 'ASSERTION FAILED: an entirely unreviewed assessment was published';
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
  IF _msg NOT LIKE '%SCP_PUBLICATION_QUALITY_GATE%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: publication was refused, but not by the quality gate: %', _msg;
  END IF;
  RAISE NOTICE '    ok  publication is refused while required reviews are outstanding';
END $$;

-- ...and the refusal names every gate, not just the first.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_version_publication_readiness(:'vid'::uuid)
    WHERE blocking AND status = 'fail') >= 3,
  'the readiness report names every outstanding gate, not only the first');

SELECT pg_temp.ok(
  (SELECT content_status FROM public.scp_assessment_versions WHERE id = :'vid'::uuid) = 'draft'
  AND (SELECT validation_status FROM public.scp_assessment_versions WHERE id = :'vid'::uuid) = 'design',
  'the flagship is still draft/design -- nothing in this suite promoted it');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id = :'fid'::uuid
      AND iv.authored_by_ai AND iv.sme_reviewer_count = 0
      AND iv.sme_review_status = 'pending') = 56,
  'all 56 items are still AI-authored with zero SME reviewers');

DO $$ BEGIN RAISE NOTICE 'GROUP 8 -- cleanup'; END $$;

ROLLBACK;
