-- Phase 2 — the complete Assessment Center journey, proven end to end.
--
-- Employer assigns the fixture programme → the participant starts, answers every
-- supported format and submits → closed formats score deterministically into the
-- graph → the constructed response routes to a human → the reviewer decides →
-- the attempt becomes scored → the employer releases → immutable snapshots exist,
-- maturity is computed from evidence, and only now can the employer resolve who
-- the participant is.
--
-- Every hostile direction is asserted alongside the happy path, because a
-- journey that only works when everyone behaves has not been tested.
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

DO $$ BEGIN RAISE NOTICE 'GROUP J1 — the fixture is assignable, the real programme is not'; END $$;

-- =========================================================================
-- Group J1 — what may be assigned
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE d.slug = 'fixture-delivery-e2e' AND av.content_status = 'published') = 1,
  'J1.1 the fixture programme is published');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE av.content_status = 'published' AND NOT d.is_test_fixture) = 0,
  'J1.2 no real programme is published — Security Guard still awaits review');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_form_items fi
     JOIN public.scp_forms f ON f.id = fi.form_id
     JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE d.slug = 'fixture-delivery-e2e') = 4,
  'J1.3 the fixture form serves four items, one per supported format');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT iv.item_format) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     JOIN public.scp_forms f ON f.id = fi.form_id
     JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE d.slug = 'fixture-delivery-e2e') = 4,
  'J1.4 all four formats are distinct — single-best, best/worst, rated, constructed');

DO $$ BEGIN RAISE NOTICE 'GROUP J2 — the journey'; END $$;

-- =========================================================================
-- Group J2 — assign → deliver → answer → submit
-- =========================================================================

-- Fixture cast: an employer owner, an unrelated author/reviewer, a participant,
-- and a second participant used only to prove isolation.
CREATE TEMP TABLE jfx AS
WITH u AS (
  INSERT INTO auth.users (id, email) VALUES
    ('c3000000-0000-0000-0000-000000000001','owner@journey.invalid'),
    ('c3000000-0000-0000-0000-000000000002','reviewer@journey.invalid'),
    ('c3000000-0000-0000-0000-000000000003','participant@journey.invalid'),
    ('c3000000-0000-0000-0000-000000000004','stranger@journey.invalid')
  RETURNING id
), e AS (
  INSERT INTO public.employers (id, name, slug, status)
  VALUES ('c3000000-1111-0000-0000-000000000001','Journey AB','journey-ab','active')
  RETURNING id
), m AS (
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES ('c3000000-1111-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','owner','active')
  RETURNING id
), cr AS (
  -- The reviewer is an authoring principal, NOT anyone in the employer.
  INSERT INTO public.scp_content_roles (user_id, role)
  VALUES ('c3000000-0000-0000-0000-000000000002','reviewer')
  RETURNING id
), s AS (
  INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id
), s2 AS (
  INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id
), si AS (
  INSERT INTO public.scp_subject_identities (subject_id, user_id)
  SELECT s.id, 'c3000000-0000-0000-0000-000000000003' FROM s RETURNING subject_id
), si2 AS (
  INSERT INTO public.scp_subject_identities (subject_id, user_id)
  SELECT s2.id, 'c3000000-0000-0000-0000-000000000004' FROM s2 RETURNING subject_id
), pv AS (
  INSERT INTO public.scp_purpose_versions
    (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
     jurisdiction_id, published_at)
  SELECT 'competence_development', 91, 'pn-journey', 'GDPR Art.6(1)(f)',
         (SELECT id FROM public.scp_jurisdictions WHERE code='SE'), now()
  RETURNING id
), f AS (
  SELECT f.id FROM public.scp_forms f
    JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1
), av AS (
  SELECT av.id FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1
), asg AS (
  -- The Academy lineage: scp_assessment_version_id set, legacy columns NULL.
  -- Phase 1H's single-lineage CHECK is what makes this unambiguous.
  INSERT INTO public.assessment_assignments
    (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email,
     recipient_user_id, assigned_by, invitation_token_hash, expires_at, status)
  SELECT 'c3000000-1111-0000-0000-000000000001', av.id, 'fixture', 'workforce',
         'participant@journey.invalid', 'c3000000-0000-0000-0000-000000000003',
         'c3000000-0000-0000-0000-000000000001', 'journey-token-hash',
         now() + interval '30 days', 'invited'
    FROM av RETURNING id
), at AS (
  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, assignment_id, mode, form_id,
     assessment_version_id, purpose_version_id,
     jurisdiction_id, scoring_model_version, status)
  SELECT s.id, 'c3000000-1111-0000-0000-000000000001', asg.id, 'assessment', f.id,
         av.id, pv.id,
         (SELECT id FROM public.scp_jurisdictions WHERE code='SE'), 'det-v1', 'in_progress'
    FROM s, asg, f, av, pv RETURNING id
)
SELECT (SELECT id FROM s) AS subject_id, (SELECT id FROM s2) AS stranger_id,
       (SELECT id FROM at) AS attempt_id, (SELECT id FROM f) AS form_id,
       (SELECT id FROM asg) AS assignment_id;

SELECT subject_id AS sid, stranger_id AS xid, attempt_id AS aid,
       form_id AS fid, assignment_id AS gid FROM jfx \gset

-- ── Delivery ───────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE served AS
SELECT * FROM public.scp_get_attempt_items(:'aid'::uuid, 'sv-SE');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM served) = 4,
  'J2.1 the participant is served all four items');

SELECT pg_temp.ok(
  (SELECT count(*) FROM served WHERE scenario IS NOT NULL AND prompt IS NOT NULL) = 4,
  'J2.2 every served item carries its scenario and prompt');

-- The payload guard, asserted on real returned data rather than on the schema.
SELECT pg_temp.ok(
  (SELECT bool_and(NOT (o::text ILIKE '%score%' OR o::text ILIKE '%rationale%'
                     OR o::text ILIKE '%is_preferred%' OR o::text ILIKE '%best_key%'
                     OR o::text ILIKE '%worst_key%' OR o::text ILIKE '%feedback%'))
     FROM served, jsonb_array_elements(served.options) o),
  'J2.3 NO served option carries a score, key, rationale or feedback');

SELECT pg_temp.ok(
  (SELECT count(*) FROM served WHERE jsonb_array_length(options) > 0) = 3,
  'J2.4 the three closed items carry option labels; the constructed one carries none');

-- English parity: the same attempt serves English.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE served_en AS
SELECT * FROM public.scp_get_attempt_items(:'aid'::uuid, 'en-GB');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM served_en) = 4,
  'J2.5 the same attempt delivers in English — Swedish/English parity');
SELECT pg_temp.ok(
  (SELECT count(*) FROM served s JOIN served_en e USING (item_version_id)
    WHERE s.scenario = e.scenario) = 0,
  'J2.6 the English text is genuinely different text, not a Swedish fallback');

-- A stranger cannot read somebody else's attempt.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
CREATE TEMP TABLE served_x AS
SELECT count(*) AS n FROM public.scp_get_attempt_items(:'aid'::uuid, 'sv-SE');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM served_x) = 0,
  'J2.7 another participant is served nothing for an attempt that is not theirs');

-- ── Answering ──────────────────────────────────────────────────────────
DO $$
DECLARE
  _aid uuid; _fid uuid; _r record; _i int;
  _items uuid[] := '{}'; _formats text[] := '{}';
  _picks uuid[] := '{}'; _bests uuid[] := '{}'; _worsts uuid[] := '{}';
BEGIN
  -- Gather the form and its keys FIRST, as the table owner. A participant
  -- cannot read scp_form_items, scp_item_versions or scp_item_options -- that
  -- is the whole point of the delivery function -- so a loop over those tables
  -- would silently return nothing once the role is switched.
  SELECT attempt_id, form_id INTO _aid, _fid FROM jfx;

  FOR _r IN SELECT fi.item_version_id AS ivid, iv.item_format AS fmt
              FROM public.scp_form_items fi
              JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
             WHERE fi.form_id = _fid
             ORDER BY fi.display_order
  LOOP
    _items   := _items   || _r.ivid;
    _formats := _formats || _r.fmt;
    -- Deliberately the highest-scoring option, so the deterministic
    -- contribution is a known 1.000 and the assertion below is exact.
    _picks  := _picks  || COALESCE((SELECT id FROM public.scp_item_options
                                     WHERE item_version_id = _r.ivid
                                     ORDER BY score_value DESC LIMIT 1),
                                   '00000000-0000-0000-0000-000000000000'::uuid);
    _bests  := _bests  || COALESCE((SELECT id FROM public.scp_item_options
                                     WHERE item_version_id = _r.ivid AND is_best_key),
                                   '00000000-0000-0000-0000-000000000000'::uuid);
    _worsts := _worsts || COALESCE((SELECT id FROM public.scp_item_options
                                     WHERE item_version_id = _r.ivid AND is_worst_key),
                                   '00000000-0000-0000-0000-000000000000'::uuid);
  END LOOP;

  -- Now answer as the participant, through the same function the UI calls.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','c3000000-0000-0000-0000-000000000003', true);

  FOR _i IN 1 .. array_length(_items, 1) LOOP
    IF _formats[_i] = 'constructed_response' THEN
      PERFORM public.scp_save_response(_aid, _items[_i], NULL, NULL, NULL,
        'Jag skulle dokumentera vad som avvek, nar det skedde och vad jag gjorde.');
    ELSIF _formats[_i] = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_aid, _items[_i], NULL, _bests[_i], _worsts[_i], NULL);
    ELSE
      PERFORM public.scp_save_response(_aid, _items[_i], _picks[_i], NULL, NULL, NULL);
    END IF;
  END LOOP;
  RESET ROLE;
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_candidate_responses WHERE attempt_id = :'aid'::uuid) = 4,
  'J2.8 all four answers are saved');

-- Resume: re-reading the attempt returns the saved answers.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE resumed AS
SELECT * FROM public.scp_get_attempt_items(:'aid'::uuid, 'sv-SE');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT count(*) FROM resumed
    WHERE saved_option_id IS NOT NULL OR saved_best_id IS NOT NULL
       OR saved_text IS NOT NULL) = 4,
  'J2.9 a resumed run returns every saved answer');

DO $$ BEGIN RAISE NOTICE 'GROUP J3 — submission, scoring and routing to review'; END $$;

-- =========================================================================
-- Group J3 — submission
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE submitted AS SELECT * FROM public.scp_submit_attempt(:'aid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT evidence_written FROM submitted) = 3,
  'J3.1 the three closed formats wrote deterministic evidence');
SELECT pg_temp.ok((SELECT reviews_opened FROM submitted) = 1,
  'J3.2 the constructed response opened exactly one human review');
SELECT pg_temp.ok((SELECT attempt_status FROM submitted) = 'submitted',
  'J3.3 the attempt is submitted, NOT scored, while a review is outstanding');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence e
    WHERE e.subject_id = :'sid'::uuid AND e.provenance_type = 'deterministic') = 3,
  'J3.4 three deterministic evidence rows are in the ledger');

SELECT pg_temp.ok(
  (SELECT bool_and(contribution = 1.000) FROM public.scp_competency_evidence
    WHERE subject_id = :'sid'::uuid AND provenance_type = 'deterministic'),
  'J3.5 scoring is exact: the best option contributes 1.000 on every format');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = :'sid'::uuid AND source_ref IS NULL) = 0,
  'J3.6 every evidence row carries a source_ref — no silent dedup collapse');

-- A submitted attempt is closed to further answers.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_save_response(%L::uuid, (SELECT item_version_id FROM public.scp_form_items WHERE form_id = %L::uuid LIMIT 1))',
         :'aid', :'fid'),
  'SCP_ATTEMPT_NOT_OPEN', 'J3.7 an answer cannot be changed after submission');
RESET ROLE; RESET request.jwt.claim.sub;

-- Release is refused while the review is open. This is the assertion that
-- matters most: it is what stops a report going out over an unreviewed answer.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(
  format('SELECT * FROM public.scp_release_attempt_report(%L::uuid)', :'aid'),
  'SCP_RELEASE_BEFORE_SCORED', 'J3.8 a report cannot be released while a review is open');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP J4 — human review'; END $$;

-- =========================================================================
-- Group J4 — the reviewer
-- =========================================================================

CREATE TEMP TABLE rvw AS
SELECT hr.id FROM public.scp_human_reviews hr
  JOIN public.scp_candidate_responses r ON r.id = hr.response_id
 WHERE r.attempt_id = :'aid'::uuid;
SELECT id AS rid FROM rvw \gset

SELECT pg_temp.ok(
  (SELECT trigger_reason FROM public.scp_human_reviews WHERE id = :'rid'::uuid)
    = 'no_provider_available',
  'J4.1 the review was opened because no provider can score it — the null provider is honest');

-- The employer owner may NOT adjudicate their own candidate's evidence.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_complete_human_review(%L::uuid, %L, %L)', :'rid', 'upheld', 'ok'),
  'SCP_NOT_A_REVIEWER', 'J4.2 an employer owner cannot complete a review of their own candidate');
RESET ROLE; RESET request.jwt.claim.sub;

-- A decision without reasons is refused -- asserted as the REVIEWER, so the
-- capability check cannot be what makes this pass.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_complete_human_review(%L::uuid, %L, %L)', :'rid', 'upheld', '   '),
  'SCP_REVIEW_WITHOUT_RATIONALE', 'J4.3 a review decision must state its reasons');
RESET ROLE; RESET request.jwt.claim.sub;

-- The reviewer completes it.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE rev_ev AS
SELECT public.scp_complete_human_review(
  :'rid'::uuid, 'adjusted',
  'Svaret beskriver vad som ska dokumenteras men inte varfor.', 0.6) AS evidence_id;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT review_status FROM public.scp_human_reviews WHERE id = :'rid'::uuid) = 'completed',
  'J4.4 the review is completed');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = :'sid'::uuid AND provenance_type = 'human_review') = 1,
  'J4.5 the reviewer''s decision entered the graph as human_review evidence');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = :'aid'::uuid) = 'scored',
  'J4.6 with no review outstanding, the attempt is now scored');

DO $$ BEGIN RAISE NOTICE 'GROUP J5 — release, snapshots and maturity'; END $$;

-- =========================================================================
-- Group J5 — release
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE released AS
SELECT * FROM public.scp_release_attempt_report(:'aid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM released) = 1,
  'J5.1 release produced a snapshot pair');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = :'aid'::uuid) = 2,
  'J5.2 one snapshot per audience — participant and employer');

SELECT pg_temp.ok(
  (SELECT released_at IS NOT NULL FROM public.scp_attempts WHERE id = :'aid'::uuid),
  'J5.3 the attempt is released');

-- The report states a MATURITY LEVEL and nothing that looks like a score.
SELECT pg_temp.ok(
  (SELECT bool_and(payload::text NOT ILIKE '%percent%'
               AND payload::text NOT ILIKE '%pass_fail%'
               AND payload::text NOT ILIKE '%ranking%'
               AND payload::text NOT ILIKE '%suitability%'
               AND payload::text NOT ILIKE '%recommendation%')
     FROM public.scp_report_snapshots WHERE attempt_id = :'aid'::uuid),
  'J5.4 no snapshot contains a percentage, pass/fail, ranking or recommendation');

SELECT pg_temp.ok(
  (SELECT bool_and(payload::text ILIKE '%maturity_level%')
     FROM public.scp_report_snapshots WHERE attempt_id = :'aid'::uuid),
  'J5.5 the snapshot states a maturity level');

-- Four observations from a single context and a single source type must NOT
-- reach a high level. This is the two-gate rule doing its job on real data.
SELECT pg_temp.ok(
  (SELECT bool_and((x->>'maturity_level') IN
                   ('no_evidence','limited_evidence','developing_evidence'))
     FROM public.scp_report_snapshots s,
          jsonb_array_elements(s.payload) x
    WHERE s.attempt_id = :'aid'::uuid),
  'J5.6 one assessment cannot reach consistent_evidence — the sufficiency gate caps it');

-- Snapshots are immutable.
SELECT pg_temp.must_fail(
  format('UPDATE public.scp_report_snapshots SET payload = %L::jsonb WHERE attempt_id = %L::uuid',
         '[]', :'aid'),
  'SCP_SNAPSHOT_IMMUTABLE', 'J5.7 an issued snapshot cannot be edited');
SELECT pg_temp.must_fail(
  format('DELETE FROM public.scp_report_snapshots WHERE attempt_id = %L::uuid', :'aid'),
  'SCP_SNAPSHOT_IMMUTABLE', 'J5.8 an issued snapshot cannot be deleted');

-- Releasing twice is refused.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(
  format('SELECT * FROM public.scp_release_attempt_report(%L::uuid)', :'aid'),
  'SCP_ALREADY_RELEASED', 'J5.9 a report cannot be released twice');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP J6 — what each principal can now see'; END $$;

-- =========================================================================
-- Group J6 — visibility after release
-- =========================================================================

-- The participant reads their own report.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE p_report AS
SELECT count(*) AS n FROM public.scp_report_snapshots;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM p_report) = 1,
  'J6.1 the participant sees exactly their own participant report');

-- The stranger sees nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
CREATE TEMP TABLE x_report AS
SELECT count(*) AS n FROM public.scp_report_snapshots;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM x_report) = 0,
  'J6.2 an unrelated participant sees no report at all');

-- Identity resolution now succeeds — and only now.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE ident AS
SELECT * FROM public.scp_resolve_participant_identity(
  'c3000000-1111-0000-0000-000000000001', :'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM ident) = 1,
  'J6.3 after release the employer can resolve the participant');
SELECT pg_temp.ok((SELECT display_email FROM ident) = 'participant@journey.invalid',
  'J6.4 identity resolution returns the minimum contact field');

-- And still cannot reach the mapping directly.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE ident_direct AS SELECT count(*) AS n FROM public.scp_subject_identities;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM ident_direct) = 0,
  'J6.5 the employer still cannot read scp_subject_identities directly');

-- The employer read model shows the assignment with a PSEUDONYMOUS subject.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE rm AS
SELECT * FROM public.scp_rm_employer_assignments WHERE assignment_id = :'gid'::uuid;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM rm) = 1,
  'J6.6 the assignment appears in the employer read model');
SELECT pg_temp.ok((SELECT attempt_status FROM rm) = 'released',
  'J6.7 the read model reflects the released state');

-- The employer can never reach the candidate's raw words.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE raw AS SELECT count(*) AS n FROM public.scp_candidate_responses;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM raw) = 0,
  'J6.8 the employer cannot read raw candidate responses, released or not');

DO $$ BEGIN RAISE NOTICE 'scp_phase2_journey_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
