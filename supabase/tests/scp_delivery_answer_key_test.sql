-- Release-blocking (20261229090000): the delivery payload must not carry the
-- answer key.
--
--   DK0  REPRODUCTION. Inside a savepoint the pre-fix delivery function is
--        restored by running the real rollback file. A candidate reading the
--        payload of their own seeded attempt on the real recruitment form
--        sees each option's option_key, and "pick the option keyed a" is the
--        top-scoring answer on 22 of 22 scenario items -- whatever order the
--        shuffle showed. A seedless attempt is also served key-first.
--   DK1  On the fix, every served option is exactly {option_id, label}, on
--        every item, in both languages; the candidate still cannot read
--        scp_item_options to map an id back to a key.
--   DK2  The per-attempt shuffle is unchanged: a seeded attempt is stable on
--        re-read and differs from the authored order; ordered scales keep
--        their authored order.
--   DK3  scp_seed_unanswered_legacy_attempts() seeds a seedless attempt with
--        NO saved answer (it is no longer served key-first) and leaves a
--        seedless attempt that HAS an answer exactly as it was (AC14: nobody
--        is reordered mid-run); the immutability guard is back on afterwards.
--   DK4  Grants: the helper is owner-only; the delivery function is not anon.
--
-- Synthetic principals on the real seeded form. Everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- What the participant receives, read through the real RPC as that participant.
CREATE OR REPLACE FUNCTION pg_temp.served(_uid uuid, _attempt uuid, _lang text DEFAULT 'sv-SE')
RETURNS TABLE (item_version_id uuid, item_format text, options jsonb)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  SET LOCAL ROLE authenticated;
  RETURN QUERY SELECT s.item_version_id, s.item_format, s.options
                 FROM public.scp_get_attempt_items(_attempt, _lang) s;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- ── Fixture ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('dc000000-1111-4000-8000-000000000001', 'dk-candidate@test.invalid');
INSERT INTO public.scp_subjects (id) VALUES ('dc000000-2222-4000-8000-000000000001');
INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('dc000000-2222-4000-8000-000000000001', 'dc000000-1111-4000-8000-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.new_attempt(_seed integer) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.scp_attempts
    (subject_id, mode, form_id, assessment_version_id, jurisdiction_id,
     scoring_model_version, status, governance_mode, option_order_seed)
  SELECT 'dc000000-2222-4000-8000-000000000001', 'assessment', f.id, f.assessment_version_id,
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
         'det-v1', 'in_progress', 'closed_test', _seed
    FROM public.scp_forms f WHERE f.slug = 'security-officer-recruitment-form-a'
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE TEMP TABLE fx AS SELECT pg_temp.new_attempt(101) AS seeded;
-- Two pre-seed shapes (superuser fixture: the product no longer creates one).
ALTER TABLE public.scp_attempts DISABLE TRIGGER scp_attempts_assign_option_seed;
ALTER TABLE fx ADD COLUMN legacy_unanswered uuid, ADD COLUMN legacy_answered uuid;
UPDATE fx SET legacy_unanswered = pg_temp.new_attempt(NULL), legacy_answered = pg_temp.new_attempt(NULL);
ALTER TABLE public.scp_attempts ENABLE TRIGGER scp_attempts_assign_option_seed;
GRANT SELECT ON fx TO authenticated;

-- The authored truth, as the table owner: per scenario item, the top option
-- and its key.
CREATE TEMP TABLE truth AS
SELECT fi.item_version_id AS iv, iv.item_format AS fmt,
       (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = fi.item_version_id
         ORDER BY o.score_value DESC, o.display_order LIMIT 1) AS top_id,
       (SELECT array_agg(o.id ORDER BY o.display_order) FROM public.scp_item_options o
         WHERE o.item_version_id = fi.item_version_id) AS authored_ids
  FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT form_id FROM public.scp_attempts WHERE id = (SELECT seeded FROM fx));
SELECT pg_temp.ok((SELECT count(*) FILTER (WHERE fmt = 'sjt_best_response') FROM truth) = 22,
  'DK.0 the real recruitment form carries its 22 scenario items');

-- One answer on the answered legacy attempt, through the real save path.
DO $$
DECLARE _iv uuid; _opt uuid;
BEGIN
  SELECT t.iv, t.authored_ids[1] INTO _iv, _opt FROM truth t WHERE t.fmt = 'sjt_best_response' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', 'dc000000-1111-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.scp_save_response((SELECT legacy_answered FROM fx), _iv, _opt, NULL, NULL, NULL);
  RESET ROLE;
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DK0 — reproduction: the pre-fix payload hands over the answer key'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20261229090000_scp_delivery_answer_key_leak_rollback.sql
CREATE TEMP TABLE pre AS
SELECT s.item_version_id, s.item_format, s.options
  FROM pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT seeded FROM fx)) s;
SELECT pg_temp.ok(
  (SELECT bool_and(e ? 'option_key') FROM pre, jsonb_array_elements(pre.options) e),
  'DK0.1 PRE-FIX: every served option carries its option_key');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pre p JOIN truth t ON t.iv = p.item_version_id
    WHERE t.fmt = 'sjt_best_response'
      AND (SELECT (e->>'option_id')::uuid FROM jsonb_array_elements(p.options) e
            WHERE lower(e->>'option_key') = 'a') = t.top_id) = 22,
  'DK0.2 PRE-FIX: "choose the option keyed a" is the full-credit answer on 22 of 22 scenario items');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pre p JOIN truth t ON t.iv = p.item_version_id
    WHERE t.fmt = 'sjt_best_response'
      AND (p.options->0->>'option_id')::uuid = t.top_id) < 22,
  'DK0.3 PRE-FIX: ...even though the shuffle moved the top option off the first slot -- the key gives it away');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT legacy_unanswered FROM fx)) p
     JOIN truth t ON t.iv = p.item_version_id
    WHERE t.fmt = 'sjt_best_response' AND (p.options->0->>'option_id')::uuid = t.top_id) = 22,
  'DK0.4 PRE-FIX: a seedless attempt is served key-first: the first option is the answer on 22 of 22');
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DK1 — the served option is {option_id, label}'; END $$;
-- =========================================================================
CREATE TEMP TABLE post_sv AS
SELECT * FROM pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT seeded FROM fx), 'sv-SE');
CREATE TEMP TABLE post_en AS
SELECT * FROM pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT seeded FROM fx), 'en-GB');
SELECT pg_temp.ok((SELECT count(*) FROM post_sv) = 50 AND (SELECT count(*) FROM post_en) = 50,
  'DK1.1 the attempt is still served all 50 items, in Swedish and in English');
SELECT pg_temp.ok(
  (SELECT bool_and((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) k) = ARRAY['label','option_id'])
     FROM (SELECT options FROM post_sv UNION ALL SELECT options FROM post_en) x, jsonb_array_elements(x.options) e),
  'DK1.2 every served option, in both languages, has exactly the keys option_id and label');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM post_sv, jsonb_array_elements(post_sv.options) e WHERE e::text ~* 'key|score|prefer|rationale|feedback'),
  'DK1.3 no served option text mentions a key, score, preference, rationale or feedback');
SELECT pg_temp.ok(
  (SELECT count(*) FROM post_sv p JOIN truth t ON t.iv = p.item_version_id
    WHERE t.fmt = 'sjt_best_response'
      AND (SELECT count(*) FROM jsonb_array_elements(p.options) e) = cardinality(t.authored_ids)) = 22,
  'DK1.4 every scenario item still serves every one of its options');
DO $$
DECLARE _r text; _n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'dc000000-1111-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  BEGIN SELECT count(*) INTO _n FROM public.scp_item_options; _r := 'rows=' || _n;
  EXCEPTION WHEN insufficient_privilege THEN _r := 'refused'; END;
  RESET ROLE;
  PERFORM pg_temp.ok(_r IN ('refused', 'rows=0'),
    'DK1.5 the candidate cannot read scp_item_options to map an id back to its key (' || _r || ')');
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DK2 — the per-attempt order is unchanged'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  (SELECT bool_and(a.options = b.options)
     FROM post_sv a JOIN pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT seeded FROM fx)) b
       ON b.item_version_id = a.item_version_id),
  'DK2.1 the same attempt is served the same order on re-read');
SELECT pg_temp.ok(
  (SELECT count(*) FROM post_sv p JOIN truth t ON t.iv = p.item_version_id
    WHERE t.fmt = 'sjt_best_response'
      AND (SELECT array_agg((e->>'option_id')::uuid ORDER BY o) FROM jsonb_array_elements(p.options) WITH ORDINALITY x(e, o))
          IS DISTINCT FROM t.authored_ids) > 0,
  'DK2.2 a seeded attempt still differs from the authored order');
SELECT pg_temp.ok(
  (SELECT bool_and((SELECT array_agg((e->>'option_id')::uuid ORDER BY o) FROM jsonb_array_elements(p.options) WITH ORDINALITY x(e, o))
                   = t.authored_ids)
     FROM post_sv p JOIN truth t ON t.iv = p.item_version_id WHERE t.fmt = 'biq_frequency'),
  'DK2.3 ordered self-report scales keep their authored order');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DK3 — unanswered seedless attempts leave the key-first order'; END $$;
-- =========================================================================
CREATE TEMP TABLE before_answered AS
SELECT * FROM pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT legacy_answered FROM fx));
SELECT pg_temp.ok(public.scp_seed_unanswered_legacy_attempts() >= 1,
  'DK3.1 the helper seeds at least the unanswered seedless attempt');
SELECT pg_temp.ok(
  (SELECT option_order_seed IS NOT NULL FROM public.scp_attempts WHERE id = (SELECT legacy_unanswered FROM fx)),
  'DK3.2 the unanswered seedless attempt now has a seed');
SELECT pg_temp.ok(
  (SELECT option_order_seed IS NULL FROM public.scp_attempts WHERE id = (SELECT legacy_answered FROM fx)),
  'DK3.3 the seedless attempt that already has an answer keeps NO seed (never reordered mid-run, AC14)');
SELECT pg_temp.ok(
  (SELECT bool_and(a.options = b.options) FROM before_answered a
     JOIN pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT legacy_answered FROM fx)) b
       ON b.item_version_id = a.item_version_id),
  'DK3.4 ...and is served exactly the order it was served before');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_temp.served('dc000000-1111-4000-8000-000000000001', (SELECT legacy_unanswered FROM fx)) p
     JOIN truth t ON t.iv = p.item_version_id
    WHERE t.fmt = 'sjt_best_response' AND (p.options->0->>'option_id')::uuid = t.top_id) < 22,
  'DK3.5 the newly seeded attempt is no longer served key-first');
SELECT pg_temp.ok(
  (SELECT tgenabled <> 'D' FROM pg_trigger WHERE tgname = 'scp_attempts_option_seed_immutable'
     AND tgrelid = 'public.scp_attempts'::regclass),
  'DK3.6 the seed immutability guard is enabled again after the helper ran');
DO $$
DECLARE _r text;
BEGIN
  BEGIN
    UPDATE public.scp_attempts SET option_order_seed = 7 WHERE id = (SELECT seeded FROM fx);
    _r := 'changed';
  EXCEPTION WHEN check_violation THEN _r := 'refused';
  END;
  PERFORM pg_temp.ok(_r = 'refused', 'DK3.7 outside the helper a seed still cannot be changed (' || _r || ')');
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DK4 — grants'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated', 'public.scp_seed_unanswered_legacy_attempts()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_seed_unanswered_legacy_attempts()', 'EXECUTE'),
  'DK4.1 the seeding helper is owner-only');
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_get_attempt_items(uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_get_attempt_items(uuid,text)', 'EXECUTE'),
  'DK4.2 delivery stays authenticated-only');

DO $$ BEGIN RAISE NOTICE 'scp_delivery_answer_key_test: ALL ASSERTIONS PASSED'; END $$;
ROLLBACK;
