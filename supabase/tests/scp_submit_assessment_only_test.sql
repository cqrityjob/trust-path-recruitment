-- P1-1 (20270103090000): only an assessment run is scored by scp_submit_attempt.
--
--   SA-F the fixture: a Learning Mode run started and answered through the
--        real RPCs, with every answer the preferred option that Learning
--        Mode feedback reveals.
--   SA0  REPRODUCTION. Inside a savepoint the pre-fix function is restored by
--        running the real rollback file. The participant submits the learning
--        run through scp_submit_attempt and it is scored as an assessment:
--        full-credit evidence in an 'assessment_form' context. Rolled back.
--   SA1  the learning run is refused, nothing is written, and it stays open.
--   SA2  a learning run carrying an employer (the shape a training module
--        creates) is refused the same way.
--   SA3  the legitimate flows still work: the learning run closes through
--        scp_complete_learning_module with its weak training evidence, and an
--        assessment run is still submitted and scored.
--   SA4  unchanged refusals: another person's run is still "not yours" (the
--        mode is not revealed to them), a closed learning run cannot be
--        re-submitted, anon cannot execute.
--   SA5  no evidence in the database was written by scp_submit_attempt from
--        a learning run.
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

-- Submit as a principal through the real RPC. Returns
-- 'ok:<evidence written>:<status>' or 'err:<SQLSTATE>:<message prefix>'.
CREATE OR REPLACE FUNCTION pg_temp.submit_as(_uid text, _aid uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text; _row record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT * INTO _row FROM public.scp_submit_attempt(_aid);
    _r := 'ok:' || _row.evidence_written || ':' || _row.attempt_status;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLSTATE || ':' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- Answer every item of a run's form as the participant: the learning-feedback
-- preferred option on a learning form, the participant's own top option on an
-- assessment form.
CREATE OR REPLACE FUNCTION pg_temp.answer_all(_uid text, _aid uuid) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE i record; _n int := 0; _pref uuid; _mode text;
BEGIN
  SELECT a.mode INTO _mode FROM public.scp_attempts a WHERE a.id = _aid;
  FOR i IN
    SELECT fi.item_version_id AS iv, iv.item_format AS fmt,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = fi.item_version_id
             ORDER BY o.score_value DESC, o.option_key LIMIT 1) AS top_opt,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = fi.item_version_id
             ORDER BY o.score_value ASC, o.option_key LIMIT 1) AS low_opt
      FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE fi.form_id = (SELECT form_id FROM public.scp_attempts WHERE id = _aid)
     ORDER BY fi.display_order
  LOOP
    PERFORM set_config('request.jwt.claim.sub', _uid, true);
    SET LOCAL ROLE authenticated;
    IF _mode = 'learning' THEN
      -- Answer anything, read the feedback, then save the preferred option.
      PERFORM public.scp_save_response(_aid, i.iv, i.low_opt, NULL, NULL, NULL);
      SELECT f.option_id INTO _pref
        FROM public.scp_get_learning_feedback(_aid, i.iv, 'sv-SE') f WHERE f.is_preferred;
      PERFORM public.scp_save_response(_aid, i.iv, _pref, NULL, NULL, NULL);
    ELSIF i.fmt = 'constructed_response' THEN
      PERFORM public.scp_save_response(_aid, i.iv, NULL, NULL, NULL, 'Jag dokumenterar avvikelsen.');
    ELSIF i.fmt = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_aid, i.iv, NULL, i.top_opt, i.low_opt, NULL);
    ELSE
      PERFORM public.scp_save_response(_aid, i.iv, i.top_opt, NULL, NULL, NULL);
    END IF;
    RESET ROLE;
    _n := _n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _n;
END $$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- P participant, X another candidate, O employer owner.
INSERT INTO auth.users (id, email) VALUES
  ('0f0b0000-0000-4000-8000-000000000001', 'sa-participant@test.invalid'),
  ('0f0b0000-0000-4000-8000-000000000002', 'sa-other-candidate@test.invalid'),
  ('0f0b0000-0000-4000-8000-000000000003', 'sa-owner@test.invalid');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f0b0000-1111-4000-8000-000000000001', 'SA Employer', 'sa-employer', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f0b0000-1111-4000-8000-000000000001', '0f0b0000-0000-4000-8000-000000000003', 'owner', 'active');
INSERT INTO public.scp_fixture_access (employer_id, reason) VALUES
  ('0f0b0000-1111-4000-8000-000000000001', 'P1-1 assessment-only submission regression');
INSERT INTO public.scp_subjects (id) VALUES
  ('0f0b0000-2222-4000-8000-000000000001'), ('0f0b0000-2222-4000-8000-000000000002');
INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES
  ('0f0b0000-2222-4000-8000-000000000001', '0f0b0000-0000-4000-8000-000000000001'),
  ('0f0b0000-2222-4000-8000-000000000002', '0f0b0000-0000-4000-8000-000000000002');
INSERT INTO public.scp_purpose_versions
  (id, purpose_code, version_number, privacy_notice_version, lawful_basis_reference, jurisdiction_id, published_at)
VALUES ('0f0b0000-3333-4000-8000-000000000001', 'competence_development', 929, 'pn-sa', 'GDPR Art.6(1)(f)',
        (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), now());

CREATE TEMP TABLE fx AS
SELECT (SELECT f.id FROM public.scp_forms f JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
          JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
         WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1) AS form_id,
       (SELECT av.id FROM public.scp_assessment_versions av JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
         WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1) AS av_id,
       (SELECT f.id FROM public.scp_forms f WHERE f.slug = 'fixture-learning-form' LIMIT 1) AS learning_form_id;
CREATE TEMP TABLE att(who text PRIMARY KEY, aid uuid);
GRANT SELECT ON fx, att TO authenticated;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SA-F — a learning run answered with the revealed preferred options'; END $$;
-- =========================================================================
SELECT pg_temp.ok((SELECT form_id IS NOT NULL AND av_id IS NOT NULL AND learning_form_id IS NOT NULL FROM fx),
  'SA-F.1 the seeded fixture assessment and learning forms are present');

DO $$
DECLARE _aid uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f0b0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  _aid := public.scp_start_learning_attempt((SELECT learning_form_id FROM fx));
  RESET ROLE;
  INSERT INTO att VALUES ('learn', _aid);
END $$;
SELECT pg_temp.ok(pg_temp.answer_all('0f0b0000-0000-4000-8000-000000000001', (SELECT aid FROM att WHERE who = 'learn')) = 2,
  'SA-F.2 both learning items are answered with the preferred option the feedback revealed');
SELECT pg_temp.ok((SELECT mode = 'learning' AND status = 'in_progress' FROM public.scp_attempts
                    WHERE id = (SELECT aid FROM att WHERE who = 'learn')),
  'SA-F.3 the learning run is open');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SA0 — reproduction: the pre-fix function scores a learning run as an assessment'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20270103090000_scp_submit_assessment_only_rollback.sql
DO $$
DECLARE _l uuid := (SELECT aid FROM att WHERE who = 'learn'); _r text;
BEGIN
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000001', _l);
  PERFORM pg_temp.ok(_r LIKE 'ok:2:%', 'SA0.1 PRE-FIX: the learning run is submitted and scored (' || _r || ')');
  PERFORM pg_temp.ok((SELECT count(*) = 2 AND bool_and(e.contribution = 1.000 AND e.confidence = 1.000
                                                     AND e.context_type = 'assessment_form')
                        FROM public.scp_competency_evidence e
                        JOIN public.scp_candidate_responses r ON r.id = e.provenance_ref
                       WHERE r.attempt_id = _l AND e.created_by_service = 'scp_submit_attempt'),
    'SA0.2 PRE-FIX: it wrote full-credit assessment evidence from answers the feedback gave away');
END $$;
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SA1 — a learning run is refused and nothing is written'; END $$;
-- =========================================================================
DO $$
DECLARE _l uuid := (SELECT aid FROM att WHERE who = 'learn'); _r text;
BEGIN
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000001', _l);
  PERFORM pg_temp.ok(_r = 'err:23514:SCP_NOT_AN_ASSESSMENT',
    'SA1.1 submitting the learning run is refused (' || _r || ')');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_competency_evidence e
                                   JOIN public.scp_candidate_responses r ON r.id = e.provenance_ref
                                  WHERE r.attempt_id = _l),
    'SA1.2 no evidence was written from the learning answers');
  PERFORM pg_temp.ok((SELECT status = 'in_progress' AND submitted_at IS NULL AND scored_at IS NULL
                        FROM public.scp_attempts WHERE id = _l),
    'SA1.3 the learning run is untouched and still open');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_human_reviews hr
                                   JOIN public.scp_candidate_responses r ON r.id = hr.response_id
                                  WHERE r.attempt_id = _l),
    'SA1.4 no human review was opened for it');
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SA2 — a learning run under an employer (training shape) is refused'; END $$;
-- =========================================================================
INSERT INTO public.scp_attempts
  (subject_id, issuer_organization_id, mode, form_id, purpose_version_id, jurisdiction_id,
   scoring_model_version, status)
VALUES ('0f0b0000-2222-4000-8000-000000000001', '0f0b0000-1111-4000-8000-000000000001', 'learning',
        (SELECT learning_form_id FROM fx), '0f0b0000-3333-4000-8000-000000000001',
        (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), 'det-v1', 'in_progress');
INSERT INTO att SELECT 'train', a.id FROM public.scp_attempts a
 WHERE a.subject_id = '0f0b0000-2222-4000-8000-000000000001' AND a.mode = 'learning'
   AND a.issuer_organization_id = '0f0b0000-1111-4000-8000-000000000001';
SELECT pg_temp.ok(pg_temp.answer_all('0f0b0000-0000-4000-8000-000000000001', (SELECT aid FROM att WHERE who = 'train')) = 2,
  'SA2.0 the employer learning run is answered with the revealed preferred options');
DO $$
DECLARE _t uuid := (SELECT aid FROM att WHERE who = 'train'); _r text;
BEGIN
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000001', _t);
  PERFORM pg_temp.ok(_r = 'err:23514:SCP_NOT_AN_ASSESSMENT',
    'SA2.1 an employer-issued learning run is refused too (' || _r || ')');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_competency_evidence e
                                   JOIN public.scp_candidate_responses r ON r.id = e.provenance_ref
                                  WHERE r.attempt_id = _t)
                     AND (SELECT status FROM public.scp_attempts WHERE id = _t) = 'in_progress',
    'SA2.2 nothing was written and the run is still open');
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SA3 — the legitimate learning and assessment flows still work'; END $$;
-- =========================================================================
DO $$
DECLARE _l uuid := (SELECT aid FROM att WHERE who = 'learn'); _n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f0b0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  _n := public.scp_complete_learning_module(_l);
  RESET ROLE;
  PERFORM pg_temp.ok(_n > 0, 'SA3.1 the learning run completes through scp_complete_learning_module');
  PERFORM pg_temp.ok((SELECT count(*) = _n AND bool_and(source_type = 'training_completion'
                                                       AND contribution = 0.250 AND confidence = 0.500)
                        FROM public.scp_competency_evidence
                       WHERE source_ref = _l AND created_by_service = 'scp_complete_learning_module'),
    'SA3.2 it records only its weak training-completion evidence');
  PERFORM pg_temp.ok((SELECT status FROM public.scp_attempts WHERE id = _l) = 'scored',
    'SA3.3 the learning run is closed');
END $$;

DO $$
DECLARE _g uuid; _t uuid; f record;
BEGIN
  SELECT * INTO f FROM fx;
  INSERT INTO public.assessment_assignments
    (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email,
     recipient_user_id, assigned_by, invitation_token_hash, expires_at, status)
  VALUES ('0f0b0000-1111-4000-8000-000000000001', f.av_id, 'fixture', 'workforce',
          'sa@test.invalid', '0f0b0000-0000-4000-8000-000000000001',
          '0f0b0000-0000-4000-8000-000000000003', 'sa-token-1', now() + interval '30 days', 'invited')
  RETURNING id INTO _g;
  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, assignment_id, mode, form_id, assessment_version_id,
     purpose_version_id, jurisdiction_id, scoring_model_version, status)
  VALUES ('0f0b0000-2222-4000-8000-000000000001', '0f0b0000-1111-4000-8000-000000000001', _g,
          'assessment', f.form_id, f.av_id, '0f0b0000-3333-4000-8000-000000000001',
          (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), 'det-v1', 'in_progress')
  RETURNING id INTO _t;
  INSERT INTO att VALUES ('assess', _t);
END $$;
SELECT pg_temp.ok(pg_temp.answer_all('0f0b0000-0000-4000-8000-000000000001', (SELECT aid FROM att WHERE who = 'assess')) = 4,
  'SA3.4 every item of the assessment run is answered');
DO $$
DECLARE _t uuid := (SELECT aid FROM att WHERE who = 'assess'); _r text;
BEGIN
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000001', _t);
  PERFORM pg_temp.ok(_r LIKE 'ok:%' AND _r <> 'ok:0:in_progress',
    'SA3.5 the assessment run is still submitted (' || _r || ')');
  PERFORM pg_temp.ok((SELECT status IN ('submitted', 'scored') AND submitted_at IS NOT NULL
                        FROM public.scp_attempts WHERE id = _t),
    'SA3.6 the assessment run is closed for scoring');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.scp_competency_evidence e
                               JOIN public.scp_candidate_responses r ON r.id = e.provenance_ref
                              WHERE r.attempt_id = _t AND e.created_by_service = 'scp_submit_attempt'
                                AND e.context_type = 'assessment_form'),
    'SA3.7 it wrote its assessment evidence');
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SA4 — existing refusals are unchanged'; END $$;
-- =========================================================================
DO $$
DECLARE _r text;
BEGIN
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000002', (SELECT aid FROM att WHERE who = 'train'));
  PERFORM pg_temp.ok(_r = 'err:42501:SCP_ATTEMPT_NOT_YOURS',
    'SA4.1 another candidate submitting P''s learning run is told it is not theirs, not its mode (' || _r || ')');
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000002', (SELECT aid FROM att WHERE who = 'assess'));
  PERFORM pg_temp.ok(_r = 'err:42501:SCP_ATTEMPT_NOT_YOURS',
    'SA4.2 another candidate cannot submit P''s assessment run (' || _r || ')');
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000001', (SELECT aid FROM att WHERE who = 'learn'));
  PERFORM pg_temp.ok(_r LIKE 'err:23514:%',
    'SA4.3 a completed learning run cannot be submitted either (' || _r || ')');
  _r := pg_temp.submit_as('0f0b0000-0000-4000-8000-000000000001', (SELECT aid FROM att WHERE who = 'assess'));
  PERFORM pg_temp.ok(_r = 'err:23514:SCP_ATTEMPT_ALREADY_SUBMITTED',
    'SA4.4 a submitted assessment run cannot be re-submitted (' || _r || ')');
END $$;
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.scp_submit_attempt(uuid)', 'EXECUTE')
                  AND has_function_privilege('authenticated', 'public.scp_submit_attempt(uuid)', 'EXECUTE'),
  'SA4.5 anon cannot execute scp_submit_attempt; signed-in users can');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SA5 — no learning run in the database carries submission evidence'; END $$;
-- =========================================================================
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM public.scp_competency_evidence e
    JOIN public.scp_candidate_responses r ON r.id = e.provenance_ref
    JOIN public.scp_attempts a ON a.id = r.attempt_id
   WHERE e.created_by_service = 'scp_submit_attempt' AND a.mode <> 'assessment'),
  'SA5.1 no evidence written by scp_submit_attempt comes from a learning run');

DO $$ BEGIN RAISE NOTICE 'ALL scp_submit_assessment_only assertions passed'; END $$;
ROLLBACK;
