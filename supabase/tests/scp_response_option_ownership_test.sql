-- P0 (20261228090000): an answer's option must belong to the item it answers.
--
--   OO0  REPRODUCTION. Inside a savepoint the pre-fix state is restored by
--        running the real rollback file. The participant then does exactly
--        what the audit found: takes the preferred option id that Learning
--        Mode feedback reveals, and an option of a DIFFERENT assessment, and
--        saves them as answers to fixture assessment items. The saves are
--        accepted and scp_submit_attempt writes full-credit (1.000) evidence
--        from options that do not belong to the scored items. Then the
--        savepoint is rolled back and every later group runs on the fix.
--   OO1  valid answers in every supported format are accepted, and re-saving
--        is idempotent (one row, same id, answer changed in place).
--   OO2  an option of another item on the same form -> rejected, for the
--        selected, best and worst positions alike.
--   OO3  an option of another assessment version -> rejected.
--   OO4  a fabricated option UUID -> rejected, with the SAME error as OO2/OO3
--        (no existence oracle).
--   OO5  the exact exploit: the learning-preferred option on an assessment
--        item -> rejected.
--   OO6  a refused save leaves the stored answer untouched.
--   OO7  another candidate cannot answer this attempt; an item not on the
--        attempt's form is refused; anon cannot execute; no client role can
--        write the table directly.
--   OO8  scoring cannot consume a foreign option: a mismatched row cannot be
--        stored even by the table owner (composite foreign keys), and the
--        submitted evidence is exactly the participant's own options' score.
--   OO9  BIQ (biq_frequency) answers on a recruitment form are accepted with
--        their own option and refused with a foreign one.
--   OO10 no stored response in the database names an option of another item.
--   OO11 defence in depth: each layer alone still refuses the exploit
--        (function check without the keys; keys without the function check).
--
-- Synthetic principals; content is the seeded fixture programme. Everything
-- rolls back. auth.uid() resolves from request.jwt.claim.sub.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Save as a principal through the real RPC. Returns 'ok:<response id>' or
-- 'err:<SQLSTATE>:<message prefix>'.
CREATE OR REPLACE FUNCTION pg_temp.save_as(_uid text, _aid uuid, _iv uuid,
  _sel uuid, _best uuid, _worst uuid, _txt text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _id uuid; _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    _id := public.scp_save_response(_aid, _iv, _sel, _best, _worst, _txt);
    _r := 'ok:' || _id;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLSTATE || ':' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- ── Cast and attempts ───────────────────────────────────────────────────
-- P participant, X another candidate, O employer owner.
INSERT INTO auth.users (id, email) VALUES
  ('0f0a0000-0000-4000-8000-000000000001', 'oo-participant@test.invalid'),
  ('0f0a0000-0000-4000-8000-000000000002', 'oo-other-candidate@test.invalid'),
  ('0f0a0000-0000-4000-8000-000000000003', 'oo-owner@test.invalid');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f0a0000-1111-4000-8000-000000000001', 'OO Employer', 'oo-employer', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f0a0000-1111-4000-8000-000000000001', '0f0a0000-0000-4000-8000-000000000003', 'owner', 'active');
INSERT INTO public.scp_fixture_access (employer_id, reason) VALUES
  ('0f0a0000-1111-4000-8000-000000000001', 'P0 option ownership regression');
INSERT INTO public.scp_subjects (id) VALUES
  ('0f0a0000-2222-4000-8000-000000000001'), ('0f0a0000-2222-4000-8000-000000000002');
INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES
  ('0f0a0000-2222-4000-8000-000000000001', '0f0a0000-0000-4000-8000-000000000001'),
  ('0f0a0000-2222-4000-8000-000000000002', '0f0a0000-0000-4000-8000-000000000002');
INSERT INTO public.scp_purpose_versions
  (id, purpose_code, version_number, privacy_notice_version, lawful_basis_reference, jurisdiction_id, published_at)
VALUES ('0f0a0000-3333-4000-8000-000000000001', 'competence_development', 928, 'pn-oo', 'GDPR Art.6(1)(f)',
        (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), now());

CREATE TEMP TABLE fx AS
SELECT (SELECT f.id FROM public.scp_forms f JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
          JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
         WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1) AS form_id,
       (SELECT av.id FROM public.scp_assessment_versions av JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
         WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1) AS av_id,
       (SELECT f.id FROM public.scp_forms f WHERE f.slug = 'fixture-learning-form' LIMIT 1) AS learning_form_id,
       (SELECT f.id FROM public.scp_forms f WHERE f.slug = 'security-officer-recruitment-form-a' LIMIT 1) AS biq_form_id,
       (SELECT f.assessment_version_id FROM public.scp_forms f WHERE f.slug = 'security-officer-recruitment-form-a' LIMIT 1) AS biq_av_id;
SELECT pg_temp.ok((SELECT form_id IS NOT NULL AND av_id IS NOT NULL AND learning_form_id IS NOT NULL
                          AND biq_form_id IS NOT NULL FROM fx),
  'OO.0 the seeded fixture, learning and recruitment forms are present');

-- Attempt creation as in scp_phase2_journey_test: assignment + attempt rows.
CREATE TEMP TABLE att(who text PRIMARY KEY, aid uuid);
DO $$
DECLARE _g uuid; _a uuid; _t uuid; f record;
BEGIN
  SELECT * INTO f FROM fx;
  -- P: assessment attempt on the fixture form; X: their own attempt on it.
  FOR _a IN SELECT unnest(ARRAY['0f0a0000-2222-4000-8000-000000000001','0f0a0000-2222-4000-8000-000000000002']::uuid[]) LOOP
    INSERT INTO public.assessment_assignments
      (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email,
       recipient_user_id, assigned_by, invitation_token_hash, expires_at, status)
    VALUES ('0f0a0000-1111-4000-8000-000000000001', f.av_id, 'fixture', 'workforce',
            'oo@test.invalid',
            (SELECT user_id FROM public.scp_subject_identities WHERE subject_id = _a),
            '0f0a0000-0000-4000-8000-000000000003', 'oo-token-' || _a, now() + interval '30 days', 'invited')
    RETURNING id INTO _g;
    INSERT INTO public.scp_attempts
      (subject_id, issuer_organization_id, assignment_id, mode, form_id, assessment_version_id,
       purpose_version_id, jurisdiction_id, scoring_model_version, status)
    VALUES (_a, '0f0a0000-1111-4000-8000-000000000001', _g, 'assessment', f.form_id, f.av_id,
            '0f0a0000-3333-4000-8000-000000000001',
            (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), 'det-v1', 'in_progress')
    RETURNING id INTO _t;
    INSERT INTO att VALUES (CASE WHEN _a = '0f0a0000-2222-4000-8000-000000000001' THEN 'P' ELSE 'X' END, _t);
  END LOOP;
END $$;

-- Every option fact the suite needs, gathered as the table owner.
CREATE TEMP TABLE items AS
SELECT fi.item_version_id AS iv, iv.item_format AS fmt,
       (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = fi.item_version_id
         ORDER BY o.score_value DESC, o.option_key LIMIT 1) AS top_opt,
       (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = fi.item_version_id
         ORDER BY o.score_value ASC, o.option_key LIMIT 1) AS low_opt,
       (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = fi.item_version_id AND o.is_best_key) AS best_key,
       (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = fi.item_version_id AND o.is_worst_key) AS worst_key
  FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT form_id FROM fx);
SELECT pg_temp.ok((SELECT count(DISTINCT fmt) FROM items) = 4,
  'OO.1 the fixture form carries the four delivered formats (best-response, rated, best/worst, constructed)');

-- A foreign but valid-looking option from ANOTHER assessment version, carrying
-- the top score of its own item.
CREATE TEMP TABLE foreign_opt AS
SELECT o.id, o.item_version_id FROM public.scp_item_options o
 WHERE o.item_version_id NOT IN (SELECT fi.item_version_id FROM public.scp_form_items fi
                                  WHERE fi.form_id IN ((SELECT form_id FROM fx), (SELECT learning_form_id FROM fx),
                                                       (SELECT biq_form_id FROM fx)))
   AND o.score_value = (SELECT max(o2.score_value) FROM public.scp_item_options o2 WHERE o2.item_version_id = o.item_version_id)
 ORDER BY o.id LIMIT 1;
SELECT pg_temp.ok((SELECT count(*) FROM foreign_opt) = 1, 'OO.2 a top-scoring option of another assessment exists');

GRANT SELECT ON fx, att, items, foreign_opt TO authenticated;

-- Learning Mode, through the real RPCs: start, answer one item, read feedback.
-- This is how a candidate learns a preferred (top-scoring) option id.
CREATE TEMP TABLE learn(aid uuid, iv uuid, preferred uuid);
GRANT ALL ON learn TO authenticated;
DO $$
DECLARE _aid uuid; _iv uuid; _any uuid; _pref uuid;
BEGIN
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
   WHERE fi.form_id = (SELECT learning_form_id FROM fx) ORDER BY fi.display_order LIMIT 1;
  SELECT o.id INTO _any FROM public.scp_item_options o WHERE o.item_version_id = _iv ORDER BY o.option_key LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '0f0a0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  _aid := public.scp_start_learning_attempt((SELECT learning_form_id FROM fx));
  PERFORM public.scp_save_response(_aid, _iv, _any, NULL, NULL, NULL);
  SELECT f.option_id INTO _pref FROM public.scp_get_learning_feedback(_aid, _iv, 'sv-SE') f WHERE f.is_preferred;
  RESET ROLE;
  INSERT INTO learn VALUES (_aid, _iv, _pref);
END $$;
SELECT pg_temp.ok((SELECT preferred IS NOT NULL FROM learn),
  'OO.3 Learning Mode feedback hands the participant a preferred option id (client-visible)');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO0 — reproduction: the pre-fix state accepts and scores foreign options'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20261228090000_scp_response_option_ownership_rollback.sql
DO $$
DECLARE _p uuid := (SELECT aid FROM att WHERE who = 'P'); i record; _r text; _ok int := 0;
BEGIN
  FOR i IN SELECT * FROM items LOOP
    IF i.fmt = 'constructed_response' THEN
      _r := pg_temp.save_as('0f0a0000-0000-4000-8000-000000000001', _p, i.iv, NULL, NULL, NULL, 'Jag dokumenterar avvikelsen.');
    ELSIF i.fmt = 'sjt_best_worst' THEN
      -- Another item's best and worst keys.
      _r := pg_temp.save_as('0f0a0000-0000-4000-8000-000000000001', _p, i.iv, NULL,
              (SELECT o.id FROM public.scp_item_options o WHERE o.is_best_key AND o.item_version_id <> i.iv ORDER BY o.id LIMIT 1),
              (SELECT o.id FROM public.scp_item_options o WHERE o.is_worst_key AND o.item_version_id <> i.iv ORDER BY o.id LIMIT 1), NULL);
    ELSIF i.fmt = 'sjt_best_response' THEN
      _r := pg_temp.save_as('0f0a0000-0000-4000-8000-000000000001', _p, i.iv, (SELECT preferred FROM learn), NULL, NULL, NULL);
    ELSE
      _r := pg_temp.save_as('0f0a0000-0000-4000-8000-000000000001', _p, i.iv, (SELECT id FROM foreign_opt), NULL, NULL, NULL);
    END IF;
    IF _r LIKE 'ok:%' THEN _ok := _ok + 1; END IF;
  END LOOP;
  PERFORM pg_temp.ok(_ok = 4, 'OO0.1 PRE-FIX: all four saves accepted, three of them naming options of other items/assessments');
END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses r
     JOIN public.scp_item_options o ON o.id IN (r.selected_option_id, r.best_option_id, r.worst_option_id)
    WHERE r.attempt_id = (SELECT aid FROM att WHERE who = 'P') AND o.item_version_id <> r.item_version_id) >= 3,
  'OO0.2 PRE-FIX: the stored answers reference options that do not belong to their items');
DO $$
DECLARE _s record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f0a0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO _s FROM public.scp_submit_attempt((SELECT aid FROM att WHERE who = 'P'));
  RESET ROLE;
  PERFORM pg_temp.ok(_s.attempt_status = 'submitted' AND _s.evidence_written = 3,
    'OO0.3 PRE-FIX: submission accepts them and writes deterministic evidence for the three closed items');
END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    WHERE r.attempt_id = (SELECT aid FROM att WHERE who = 'P') AND e.contribution = 1.000) = 3,
  'OO0.4 PRE-FIX: every closed item scores FULL credit (1.000) from options it does not own -- the P0');
ROLLBACK TO SAVEPOINT pre_fix;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT aid FROM att WHERE who = 'P')) = 0,
  'OO0.5 the reproduction is undone; every following group runs on the database as migrated');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO2..OO5 — foreign, cross-assessment, fabricated and learning-revealed options are refused'; END $$;
-- =========================================================================
DO $$
DECLARE _p uuid := (SELECT aid FROM att WHERE who = 'P'); i record; o record; _r text;
  _fake uuid := '0f0a0000-dead-4000-8000-00000000beef';
  _u text := '0f0a0000-0000-4000-8000-000000000001';
BEGIN
  FOR i IN SELECT * FROM items WHERE fmt IN ('sjt_best_response', 'sjt_rate_effectiveness') LOOP
    SELECT * INTO o FROM items WHERE iv <> i.iv AND top_opt IS NOT NULL ORDER BY iv LIMIT 1;
    _r := pg_temp.save_as(_u, _p, i.iv, o.top_opt, NULL, NULL, NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO2.1 ' || i.fmt || ': another item''s option on the same form is refused (' || _r || ')');
    _r := pg_temp.save_as(_u, _p, i.iv, (SELECT id FROM foreign_opt), NULL, NULL, NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO3.1 ' || i.fmt || ': another assessment version''s option is refused (' || _r || ')');
    _r := pg_temp.save_as(_u, _p, i.iv, _fake, NULL, NULL, NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO4.1 ' || i.fmt || ': a fabricated option id is refused with the same error (' || _r || ')');
    _r := pg_temp.save_as(_u, _p, i.iv, (SELECT preferred FROM learn), NULL, NULL, NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO5.1 ' || i.fmt || ': the learning-revealed preferred option is refused (' || _r || ')');
  END LOOP;

  FOR i IN SELECT * FROM items WHERE fmt = 'sjt_best_worst' LOOP
    _r := pg_temp.save_as(_u, _p, i.iv, NULL,
            (SELECT x.id FROM public.scp_item_options x WHERE x.is_best_key AND x.item_version_id <> i.iv ORDER BY x.id LIMIT 1), NULL, NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO2.2 best/worst: another item''s BEST key is refused (' || _r || ')');
    _r := pg_temp.save_as(_u, _p, i.iv, NULL, i.best_key,
            (SELECT x.id FROM public.scp_item_options x WHERE x.is_worst_key AND x.item_version_id <> i.iv ORDER BY x.id LIMIT 1), NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO2.3 best/worst: own best plus another item''s WORST key is refused (' || _r || ')');
    _r := pg_temp.save_as(_u, _p, i.iv, (SELECT id FROM foreign_opt), i.best_key, NULL, NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO2.4 best/worst: a foreign option smuggled in the selected position is refused (' || _r || ')');
    _r := pg_temp.save_as(_u, _p, i.iv, NULL, _fake, NULL, NULL);
    PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO4.2 best/worst: a fabricated best id is refused (' || _r || ')');
  END LOOP;

  FOR i IN SELECT * FROM items WHERE fmt = 'constructed_response' LOOP
    _r := pg_temp.save_as(_u, _p, i.iv, (SELECT id FROM foreign_opt), NULL, NULL, 'text');
    PERFORM pg_temp.ok(_r LIKE 'err:23514:%', 'OO2.5 constructed: an option of any kind is refused (' || _r || ')');
  END LOOP;
END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT aid FROM att WHERE who = 'P')) = 0,
  'OO2.6 not one refused save left a row behind');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO1/OO6 — every supported format still works, idempotently; a refusal changes nothing'; END $$;
-- =========================================================================
DO $$
DECLARE _p uuid := (SELECT aid FROM att WHERE who = 'P'); i record; _r text; _r2 text; _r3 text;
  _u text := '0f0a0000-0000-4000-8000-000000000001';
BEGIN
  FOR i IN SELECT * FROM items ORDER BY fmt LOOP
    IF i.fmt = 'constructed_response' THEN
      _r := pg_temp.save_as(_u, _p, i.iv, NULL, NULL, NULL, 'Jag dokumenterar vad som avvek och när.');
      _r2 := pg_temp.save_as(_u, _p, i.iv, NULL, NULL, NULL, 'Jag dokumenterar vad som avvek, när och vad jag gjorde.');
    ELSIF i.fmt = 'sjt_best_worst' THEN
      _r := pg_temp.save_as(_u, _p, i.iv, NULL, i.best_key, NULL, NULL);          -- best first
      _r2 := pg_temp.save_as(_u, _p, i.iv, NULL, i.best_key, i.worst_key, NULL);  -- then worst
    ELSE
      _r := pg_temp.save_as(_u, _p, i.iv, i.low_opt, NULL, NULL, NULL);           -- first choice
      _r2 := pg_temp.save_as(_u, _p, i.iv, i.top_opt, NULL, NULL, NULL);          -- changed mind
    END IF;
    PERFORM pg_temp.ok(_r LIKE 'ok:%' AND _r2 = _r, 'OO1.1 ' || i.fmt || ': own answer accepted, and re-saving keeps the same response id (' || _r || ')');
    -- A malicious re-save after a good one is refused and changes nothing.
    IF i.fmt <> 'constructed_response' THEN
      _r3 := pg_temp.save_as(_u, _p, i.iv, CASE WHEN i.fmt = 'sjt_best_worst' THEN NULL ELSE (SELECT id FROM foreign_opt) END,
                             CASE WHEN i.fmt = 'sjt_best_worst' THEN (SELECT id FROM foreign_opt) END, NULL, NULL);
      PERFORM pg_temp.ok(_r3 LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO6.1 ' || i.fmt || ': a foreign re-save over a saved answer is refused');
    END IF;
  END LOOP;
END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = (SELECT aid FROM att WHERE who = 'P')) = 4,
  'OO1.2 exactly one row per item: retries are idempotent');
SELECT pg_temp.ok(
  (SELECT bool_and(CASE i.fmt WHEN 'sjt_best_worst' THEN r.best_option_id = i.best_key AND r.worst_option_id = i.worst_key
                              WHEN 'constructed_response' THEN r.response_text LIKE '%vad jag gjorde%'
                              ELSE r.selected_option_id = i.top_opt END)
     FROM public.scp_candidate_responses r JOIN items i ON i.iv = r.item_version_id
    WHERE r.attempt_id = (SELECT aid FROM att WHERE who = 'P')),
  'OO6.2 every stored answer is the participant''s last VALID choice -- refused saves changed nothing');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO7 — ownership of the attempt, the form and the table'; END $$;
-- =========================================================================
DO $$
DECLARE i record; _r text;
BEGIN
  SELECT * INTO i FROM items WHERE fmt = 'sjt_best_response';
  _r := pg_temp.save_as('0f0a0000-0000-4000-8000-000000000002', (SELECT aid FROM att WHERE who = 'P'), i.iv, i.top_opt, NULL, NULL, NULL);
  PERFORM pg_temp.ok(_r LIKE 'err:42501:SCP_ATTEMPT_NOT_YOURS%', 'OO7.1 another candidate cannot answer this attempt, even with a valid option (' || _r || ')');
  _r := pg_temp.save_as('0f0a0000-0000-4000-8000-000000000001', (SELECT aid FROM att WHERE who = 'X'), i.iv, i.top_opt, NULL, NULL, NULL);
  PERFORM pg_temp.ok(_r LIKE 'err:42501:SCP_ATTEMPT_NOT_YOURS%', 'OO7.2 the participant cannot answer the other candidate''s attempt (' || _r || ')');
  _r := pg_temp.save_as('0f0a0000-0000-4000-8000-000000000001', (SELECT aid FROM att WHERE who = 'P'),
          (SELECT item_version_id FROM foreign_opt), (SELECT id FROM foreign_opt), NULL, NULL, NULL);
  PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_ITEM_NOT_ON_FORM%', 'OO7.3 an item that is not on the attempt''s form is refused, even with its own option (' || _r || ')');
END $$;
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE'),
  'OO7.4 anon cannot execute scp_save_response');
-- Behavioural, so it holds whether the environment's default privileges grant
-- table writes (a Supabase stack) or not (a plain replay): RLS refuses them.
DO $$
DECLARE _r text; _n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f0a0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.scp_candidate_responses SET selected_option_id = (SELECT id FROM foreign_opt)
     WHERE attempt_id = (SELECT aid FROM att WHERE who = 'P');
    GET DIAGNOSTICS _n = ROW_COUNT; _r := 'rows=' || _n;
  EXCEPTION WHEN OTHERS THEN _r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM pg_temp.ok(_r IN ('42501', 'rows=0'),
    'OO7.5 the participant cannot write their own responses around the function (' || _r || ')');
END $$;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_candidate_responses'
                AND cmd IN ('INSERT', 'UPDATE', 'ALL') AND roles && ARRAY['anon', 'authenticated', 'public']::name[]),
  'OO7.6 no RLS policy lets a client role insert or update scp_candidate_responses');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO8 — scoring cannot consume an option of another item'; END $$;
-- =========================================================================
DO $$
DECLARE i record; _state text;
BEGIN
  SELECT * INTO i FROM items WHERE fmt = 'sjt_best_response';
  -- Even the table owner, bypassing the function, cannot store the mismatch.
  BEGIN
    UPDATE public.scp_candidate_responses SET selected_option_id = (SELECT id FROM foreign_opt)
     WHERE attempt_id = (SELECT aid FROM att WHERE who = 'P') AND item_version_id = i.iv;
    _state := 'stored';
  EXCEPTION WHEN foreign_key_violation THEN _state := 'refused';
  END;
  PERFORM pg_temp.ok(_state = 'refused', 'OO8.1 the table refuses a foreign selected option even from the owner (composite key)');
  SELECT * INTO i FROM items WHERE fmt = 'sjt_best_worst';
  BEGIN
    UPDATE public.scp_candidate_responses
       SET worst_option_id = (SELECT x.id FROM public.scp_item_options x WHERE x.is_worst_key AND x.item_version_id <> i.iv ORDER BY x.id LIMIT 1)
     WHERE attempt_id = (SELECT aid FROM att WHERE who = 'P') AND item_version_id = i.iv;
    _state := 'stored';
  EXCEPTION WHEN foreign_key_violation THEN _state := 'refused';
  END;
  PERFORM pg_temp.ok(_state = 'refused', 'OO8.2 the table refuses a foreign worst key even from the owner (composite key)');
END $$;
DO $$
DECLARE _s record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f0a0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO _s FROM public.scp_submit_attempt((SELECT aid FROM att WHERE who = 'P'));
  RESET ROLE;
  PERFORM pg_temp.ok(_s.attempt_status = 'submitted' AND _s.evidence_written = 3 AND _s.reviews_opened = 1,
    'OO8.3 the legitimate attempt submits: three closed items scored, the constructed one routed to review');
END $$;
SELECT pg_temp.ok(
  (SELECT bool_and(e.contribution = round(
            CASE WHEN i.fmt = 'sjt_best_worst' THEN 1.0
                 ELSE (SELECT o.score_value FROM public.scp_item_options o WHERE o.id = r.selected_option_id)::numeric
                      / (SELECT max(o.score_value) FROM public.scp_item_options o WHERE o.item_version_id = r.item_version_id) END, 3))
     FROM public.scp_competency_evidence e
     JOIN public.scp_candidate_responses r ON r.id = e.source_ref
     JOIN items i ON i.iv = r.item_version_id
    WHERE r.attempt_id = (SELECT aid FROM att WHERE who = 'P')),
  'OO8.4 every evidence contribution is computed from the participant''s OWN options of that item');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO9 — BIQ self-report answers'; END $$;
-- =========================================================================
DO $$
DECLARE _g uuid; _a uuid; _biq uuid; _own uuid; _r text;
  _u text := '0f0a0000-0000-4000-8000-000000000002';
BEGIN
  SELECT fi.item_version_id INTO _biq FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = (SELECT biq_form_id FROM fx) AND iv.item_format = 'biq_frequency'
   ORDER BY fi.display_order LIMIT 1;
  SELECT o.id INTO _own FROM public.scp_item_options o WHERE o.item_version_id = _biq ORDER BY o.option_key LIMIT 1;
  INSERT INTO public.assessment_assignments
    (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email,
     recipient_user_id, assigned_by, invitation_token_hash, expires_at, status)
  VALUES ('0f0a0000-1111-4000-8000-000000000001', (SELECT biq_av_id FROM fx), 'fixture', 'workforce',
          'oo-biq@test.invalid', _u::uuid, '0f0a0000-0000-4000-8000-000000000003', 'oo-token-biq',
          now() + interval '30 days', 'invited')
  RETURNING id INTO _g;
  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, assignment_id, mode, form_id, assessment_version_id,
     purpose_version_id, jurisdiction_id, scoring_model_version, status)
  VALUES ('0f0a0000-2222-4000-8000-000000000002', '0f0a0000-1111-4000-8000-000000000001', _g, 'assessment',
          (SELECT biq_form_id FROM fx), (SELECT biq_av_id FROM fx), '0f0a0000-3333-4000-8000-000000000001',
          (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), 'det-v1', 'in_progress')
  RETURNING id INTO _a;
  _r := pg_temp.save_as(_u, _a, _biq, _own, NULL, NULL, NULL);
  PERFORM pg_temp.ok(_r LIKE 'ok:%', 'OO9.1 a BIQ frequency answer with its own option is accepted (' || _r || ')');
  _r := pg_temp.save_as(_u, _a, _biq, (SELECT id FROM foreign_opt), NULL, NULL, NULL);
  PERFORM pg_temp.ok(_r LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%', 'OO9.2 a BIQ answer naming another item''s option is refused (' || _r || ')');
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO10 — every stored response is valid'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_candidate_responses r
               JOIN public.scp_item_options o ON o.id IN (r.selected_option_id, r.best_option_id, r.worst_option_id)
              WHERE o.item_version_id <> r.item_version_id),
  'OO10.1 no stored response anywhere names an option of another item');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.scp_candidate_responses'::regclass
     AND contype = 'f' AND convalidated AND conname LIKE '%_option_on_item_fkey') = 3,
  'OO10.2 the three item-option keys are VALIDATED against every existing row');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OO11 — each layer alone still closes the P0'; END $$;
-- =========================================================================
SAVEPOINT layer_fn_only;
ALTER TABLE public.scp_candidate_responses
  DROP CONSTRAINT scp_candidate_responses_selected_option_on_item_fkey,
  DROP CONSTRAINT scp_candidate_responses_best_option_on_item_fkey,
  DROP CONSTRAINT scp_candidate_responses_worst_option_on_item_fkey;
SELECT pg_temp.ok(
  pg_temp.save_as('0f0a0000-0000-4000-8000-000000000002', (SELECT aid FROM att WHERE who = 'X'),
                  (SELECT iv FROM items WHERE fmt = 'sjt_best_response'), (SELECT preferred FROM learn), NULL, NULL, NULL)
    LIKE 'err:23514:SCP_OPTION_NOT_ON_ITEM%',
  'OO11.1 without the table keys, the save-path check alone refuses the exploit');
ROLLBACK TO SAVEPOINT layer_fn_only;

SAVEPOINT layer_fk_only;
\ir ../rollback/20261228090000_scp_response_option_ownership_rollback.sql
ALTER TABLE public.scp_item_options
  ADD CONSTRAINT scp_item_options_item_version_option_key UNIQUE (item_version_id, id);
ALTER TABLE public.scp_candidate_responses
  ADD CONSTRAINT scp_candidate_responses_selected_option_on_item_fkey
    FOREIGN KEY (item_version_id, selected_option_id) REFERENCES public.scp_item_options (item_version_id, id);
SELECT pg_temp.ok(
  pg_temp.save_as('0f0a0000-0000-4000-8000-000000000002', (SELECT aid FROM att WHERE who = 'X'),
                  (SELECT iv FROM items WHERE fmt = 'sjt_best_response'), (SELECT preferred FROM learn), NULL, NULL, NULL)
    LIKE 'err:23503:%',
  'OO11.2 with the pre-fix function, the table key alone still refuses the exploit');
ROLLBACK TO SAVEPOINT layer_fk_only;

DO $$ BEGIN RAISE NOTICE 'scp_response_option_ownership_test: ALL ASSERTIONS PASSED'; END $$;
ROLLBACK;
