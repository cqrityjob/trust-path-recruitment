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
      -- TWO separate saves, because that is what a person does: pick the best,
      -- then pick the worst. Saving both in one call -- which this test used to
      -- do -- proved the row shape but never the SEQUENCE, and the product
      -- shipped with a best/worst item that could not be answered at all.
      PERFORM public.scp_save_response(_aid, _items[_i], NULL, _bests[_i], NULL, NULL);
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


DO $$ BEGIN RAISE NOTICE 'GROUP J7 — employer operations'; END $$;

-- =========================================================================
-- Group J7 — library, assignment, participants, reassessment, progress
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE lib AS
SELECT * FROM public.scp_employer_library('c3000000-1111-0000-0000-000000000001');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM lib WHERE assignable) >= 1,
  'J7.1 the library offers at least one assignable programme');
SELECT pg_temp.ok(
  (SELECT bool_and(is_test_fixture) FROM lib WHERE assignable),
  'J7.2 every ASSIGNABLE programme is a fixture — no real content is assignable');
SELECT pg_temp.ok((SELECT count(*) FROM lib WHERE NOT assignable) >= 1,
  'J7.3 in-development programmes are listed, honestly marked unassignable');

-- A different organisation's owner gets an empty library for this employer id.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE lib_x AS
SELECT count(*) AS n FROM public.scp_employer_library('c3000000-1111-0000-0000-000000000001');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM lib_x) = 0,
  'J7.4 a non-member gets nothing from another organisation''s library');

-- The real Security Guard programme cannot be assigned, by RPC, ever.
DO $$
DECLARE _real uuid;
BEGIN
  SELECT av.id INTO _real
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE NOT d.is_test_fixture LIMIT 1;
  IF _real IS NULL THEN
    PERFORM pg_temp.ok(true, 'J7.5 (no real programme exists to attempt)');
    RETURN;
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','c3000000-0000-0000-0000-000000000001', true);
  PERFORM pg_temp.must_fail(
    format('SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
           'c3000000-1111-0000-0000-000000000001', _real, 'participant@journey.invalid'),
    'SCP_PROGRAMME_NOT_ASSIGNABLE',
    'J7.5 the real Security Guard programme cannot be assigned');
  RESET ROLE;
END $$;

-- A plain member cannot assign at all.
DO $$
DECLARE _av uuid;
BEGIN
  -- Resolve everything BEFORE the role switch: a temp table is unreadable once
  -- SET LOCAL ROLE has taken effect.
  SELECT a.assessment_version_id INTO _av
    FROM public.scp_attempts a WHERE a.id = (SELECT attempt_id FROM jfx);

  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES ('c3000000-1111-0000-0000-000000000001',
          'c3000000-0000-0000-0000-000000000004','member','active');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','c3000000-0000-0000-0000-000000000004', true);
  PERFORM pg_temp.must_fail(
    format('SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L)',
           'c3000000-1111-0000-0000-000000000001', _av, 'x@journey.invalid'),
    'SCP_NOT_AUTHORISED_TO_ASSIGN',
    'J7.6 a plain member cannot assign a programme');
  RESET ROLE;
END $$;

-- Participants: counts, never content.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE parts AS
SELECT * FROM public.scp_employer_participants('c3000000-1111-0000-0000-000000000001');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM parts) >= 1,
  'J7.7 the employer sees its own participants');
SELECT pg_temp.ok((SELECT bool_and(answered = 4 AND total_items = 4) FROM parts),
  'J7.8 progress is reported as counts answered of total');
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.routines r
     JOIN LATERAL unnest(string_to_array(pg_get_function_result(
       (SELECT oid FROM pg_proc WHERE proname='scp_employer_participants' LIMIT 1)), ',')) col ON true
    WHERE col ILIKE '%response%' OR col ILIKE '%email%' OR col ILIKE '%name_of_person%') = 0,
  'J7.9 the participants projection returns no response text and no contact field');

-- Reassessment: allowed after a released result, and it creates a fresh attempt.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE reass AS
SELECT * FROM public.scp_schedule_reassessment(
  'c3000000-1111-0000-0000-000000000001', :'sid'::uuid, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM reass) = 1,
  'J7.10 a reassessment can be scheduled once a result has been released');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts
    WHERE subject_id = :'sid'::uuid AND mode = 'assessment') = 2,
  'J7.11 the reassessment is a NEW attempt — the first one is untouched');

-- And is refused for somebody with no prior released result.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(
  format('SELECT * FROM public.scp_schedule_reassessment(%L::uuid, %L::uuid)',
         'c3000000-1111-0000-0000-000000000001', :'xid'),
  'SCP_NO_PRIOR_RESULT',
  'J7.12 a reassessment needs an earlier released result to measure against');
RESET ROLE; RESET request.jwt.claim.sub;

-- Progress reads snapshots.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE prog AS
SELECT * FROM public.scp_subject_progress(:'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM prog) >= 1,
  'J7.13 the participant can read their own progress');
SELECT pg_temp.ok(
  (SELECT bool_and(maturity_level IN ('no_evidence','limited_evidence',
     'developing_evidence','consistent_evidence','strong_evidence')) FROM prog),
  'J7.14 progress is expressed only in maturity levels');

-- A genuinely unrelated person cannot read somebody else's progress.
--
-- Note the deliberate choice of principal. User ...004 was made a MEMBER of
-- the commissioning organisation in J7.6, so they can legitimately see progress
-- for a released result — that is the rule working, not a leak. Testing
-- isolation therefore needs somebody with no relationship at all, and an
-- earlier draft of this assertion quietly tested the wrong thing.
INSERT INTO auth.users (id, email)
VALUES ('c3000000-0000-0000-0000-000000000009','outsider@journey.invalid');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000009';
CREATE TEMP TABLE prog_x AS
SELECT count(*) AS n FROM public.scp_subject_progress(:'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM prog_x) = 0,
  'J7.15 an unrelated person cannot read another participant''s progress');

-- And a member of the commissioning organisation CAN, once released. Asserted
-- explicitly so the rule is pinned in both directions.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
CREATE TEMP TABLE prog_m AS
SELECT count(*) AS n FROM public.scp_subject_progress(:'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM prog_m) >= 1,
  'J7.15b a member of the commissioning organisation can read released progress');

DO $$ BEGIN RAISE NOTICE 'GROUP J8 — Learning Mode'; END $$;

-- =========================================================================
-- Group J8 — Learning Mode
-- =========================================================================

CREATE TEMP TABLE lform AS
SELECT f.id FROM public.scp_forms f WHERE f.slug = 'fixture-learning-form';
SELECT id AS lfid FROM lform \gset

SELECT pg_temp.ok(
  (SELECT count(DISTINCT iv.mode) FROM public.scp_form_items fi
     JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id = :'lfid'::uuid) = 1,
  'J8.1 the learning form serves exactly one mode');

-- A learning attempt cannot be started on an ASSESSMENT form.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_start_learning_attempt(%L::uuid)', :'fid'),
  'SCP_NOT_A_LEARNING_FORM',
  'J8.2 Learning Mode refuses to run on the live assessment form');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE lat AS
SELECT public.scp_start_learning_attempt(:'lfid'::uuid) AS id;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT id AS latid FROM lat \gset

SELECT pg_temp.ok(
  (SELECT mode FROM public.scp_attempts WHERE id = :'latid'::uuid) = 'learning',
  'J8.3 a learning attempt is created in learning mode');

-- Resolve the item id as the OWNER and inline it. A participant cannot read
-- scp_form_items — that is the delivery function's whole purpose — so a
-- subquery over it inside a role-switched block silently yields NULL and the
-- assertion would pass for the wrong reason.
SELECT fi.item_version_id AS l_iv
  FROM public.scp_form_items fi
  JOIN public.scp_forms f ON f.id = fi.form_id
 WHERE f.slug = 'fixture-learning-form'
 ORDER BY fi.display_order LIMIT 1 \gset

-- Feedback before answering returns NOTHING. This is the assertion that keeps
-- the preferred answer out of an unattempted question.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE fb_before AS
SELECT count(*) AS n FROM public.scp_get_learning_feedback(
  :'latid'::uuid, :'l_iv'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM fb_before) = 0,
  'J8.4 NO feedback is available before the learner has answered');

-- Answer, then feedback appears.
DO $$
DECLARE _lat uuid; _lf uuid; _iv uuid; _opt uuid;
BEGIN
  -- Again: read the temp tables first, switch role second.
  SELECT id INTO _lat FROM lat;
  SELECT id INTO _lf FROM lform;
  SELECT fi.item_version_id INTO _iv FROM public.scp_form_items fi
   WHERE fi.form_id = _lf ORDER BY fi.display_order LIMIT 1;
  SELECT id INTO _opt FROM public.scp_item_options
   WHERE item_version_id = _iv ORDER BY display_order LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','c3000000-0000-0000-0000-000000000003', true);
  PERFORM public.scp_save_response(_lat, _iv, _opt);
  RESET ROLE;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE fb_after AS
SELECT * FROM public.scp_get_learning_feedback(:'latid'::uuid, :'l_iv'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM fb_after) = 3,
  'J8.5 after answering, feedback covers EVERY option, not only the chosen one');
SELECT pg_temp.ok((SELECT count(*) FROM fb_after WHERE is_preferred) = 1,
  'J8.6 exactly one option is marked preferred');
SELECT pg_temp.ok((SELECT count(*) FROM fb_after WHERE chosen) = 1,
  'J8.7 the learner''s own choice is marked');
SELECT pg_temp.ok((SELECT bool_and(feedback IS NOT NULL) FROM fb_after),
  'J8.8 every option explains itself — weaker ones say why they are weaker');

-- Completion writes WEAK evidence.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE lcomp AS
SELECT public.scp_complete_learning_module(:'latid'::uuid) AS n;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT n FROM lcomp) >= 1,
  'J8.9 completing a module writes training_completion evidence');
SELECT pg_temp.ok(
  (SELECT bool_and(contribution <= 0.250 AND confidence <= 0.500)
     FROM public.scp_competency_evidence
    WHERE subject_id = :'sid'::uuid AND source_type = 'training_completion'),
  'J8.10 training evidence is deliberately WEAK — nobody trains their way to a level');

-- And a learner cannot complete somebody else's run.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_complete_learning_module(%L::uuid)', :'latid'),
  'SCP_LEARNING_ATTEMPT_NOT_YOURS',
  'J8.11 a learning run cannot be completed by anybody but its owner');
RESET ROLE; RESET request.jwt.claim.sub;

-- The participant's own work list.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE mywork AS SELECT * FROM public.scp_my_academy_assignments();
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM mywork WHERE mode = 'assessment') = 2,
  'J8.12 the participant sees both their original assessment and the reassessment');
SELECT pg_temp.ok((SELECT count(*) FROM mywork WHERE mode = 'learning') = 1,
  'J8.13 and their learning run');
SELECT pg_temp.ok((SELECT bool_and(purpose_sv IS NOT NULL) FROM mywork WHERE mode='assessment'),
  'J8.14 every assignment names its processing purpose');


DO $$ BEGIN RAISE NOTICE 'GROUP J9 — Phase 2h corrections'; END $$;

-- =========================================================================
-- Group J9 — the two staging corrections
-- =========================================================================

-- ── 1. Learning feedback cannot exist on Assessment Mode content ────────

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    WHERE iv.mode = 'assessment'
      AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL)) = 0,
  'J9.1 NO assessment-mode option carries learning feedback');

-- The guard, not the cleanup, is the fix — so it is the guard that is tested.
-- Without this the assertion above would pass on a database where the next
-- author is free to reintroduce exactly what Phase 1G did.
DO $$
DECLARE _iv uuid;
BEGIN
  SELECT fi.item_version_id INTO _iv
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE iv.mode = 'assessment' LIMIT 1;

  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_item_options SET learning_feedback_sv = %L WHERE item_version_id = %L::uuid',
           'the preferred answer is A', _iv),
    'SCP_LEARNING_FEEDBACK_ON_ASSESSMENT_ITEM',
    'J9.2 learning feedback CANNOT be added to an assessment option');
END $$;

-- And the same on INSERT, not only UPDATE.
DO $$
DECLARE _iv uuid;
BEGIN
  SELECT fi.item_version_id INTO _iv
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE iv.mode = 'assessment' AND iv.content_status <> 'published' LIMIT 1;
  IF _iv IS NULL THEN
    SELECT id INTO _iv FROM public.scp_item_versions
     WHERE mode = 'assessment' AND content_status <> 'published' LIMIT 1;
  END IF;

  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_item_options (item_version_id, option_key, display_order, score_value, scoring_rationale_sv, learning_feedback_sv) VALUES (%L::uuid, %L, 99, 1, %L, %L)',
           _iv, 'zz', 'r', 'this explains the right answer'),
    'SCP_LEARNING_FEEDBACK_ON_ASSESSMENT_ITEM',
    'J9.3 and cannot be inserted with one either');
END $$;

-- The feature itself survived: learning items still carry their feedback.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    WHERE iv.mode = 'learning' AND o.learning_feedback_sv IS NOT NULL) >= 3,
  'J9.4 learning items keep their feedback — the misplaced copies went, not the feature');

-- The removed text was preserved, so it can be reinstated where it belongs.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_content_events
    WHERE metadata->>'migration' = '20260810090000_scp_phase2h_staging_corrections'
      AND metadata->>'removed_learning_feedback_sv' IS NOT NULL) = 60,
  'J9.5 all 60 removed strings are preserved verbatim in the content event log');

-- Nothing published was touched by the correction.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_content_events
    WHERE metadata->>'migration' = '20260810090000_scp_phase2h_staging_corrections'
      AND metadata->>'item_content_status' IS NOT NULL
      AND metadata->>'item_content_status' <> 'draft') = 0,
  'J9.6 every corrected row was draft — no published content was rewritten');

-- ── 2. The programme lookup matches the right version ───────────────────

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_program_versions) >= 2,
  'J9.7 more than one programme version exists, so a wrong match is possible');

-- A THIRD programme version, created last and carrying unmistakable text. If
-- the library ever reverts to "first/oldest" or "any", this text appears
-- somewhere it does not belong and the assertions below fail.
DO $$
DECLARE _p uuid; _pv uuid;
BEGIN
  INSERT INTO public.scp_programs (slug) VALUES ('decoy-programme-j9')
  RETURNING id INTO _p;
  INSERT INTO public.scp_program_versions
    (program_id, version_number, content_status, validation_status,
     name_sv, name_en, purpose_sv, purpose_en,
     does_not_measure_sv, does_not_measure_en)
  VALUES
    (_p, 1, 'published', 'design', 'Decoy', 'Decoy',
     'DECOY-PURPOSE-SV', 'DECOY-PURPOSE-EN',
     ARRAY['DECOY-LIMIT-SV'], ARRAY['DECOY-LIMIT-EN'])
  RETURNING id INTO _pv;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE lib2 AS
SELECT * FROM public.scp_employer_library('c3000000-1111-0000-0000-000000000001');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM lib2
    WHERE programme_purpose_sv = 'DECOY-PURPOSE-SV'
       OR 'DECOY-LIMIT-SV' = ANY(coalesce(does_not_measure_sv, '{}'))) = 0,
  'J9.8 an unrelated programme version never supplies purpose or limitations');

-- Each row's text belongs to its OWN linked programme version, or is absent.
SELECT pg_temp.ok(
  (SELECT count(*) FROM lib2 l
     JOIN public.scp_assessment_versions av ON av.id = l.assessment_version_id
     LEFT JOIN public.scp_program_versions pv ON pv.id = av.program_version_id
    WHERE l.programme_purpose_sv IS DISTINCT FROM pv.purpose_sv) = 0,
  'J9.9 every library row shows its OWN programme version''s purpose, or none');

SELECT pg_temp.ok(
  (SELECT count(*) FROM lib2 l
     JOIN public.scp_assessment_versions av ON av.id = l.assessment_version_id
    WHERE av.program_version_id IS NULL
      AND (l.programme_purpose_sv IS NOT NULL
        OR coalesce(array_length(l.does_not_measure_sv, 1), 0) > 0)) = 0,
  'J9.10 an UNLINKED assessment version borrows nobody else''s limitations');

-- The specific defect: the fixture must not display the real Security Guard
-- programme's boundary statements.
SELECT pg_temp.ok(
  (SELECT count(*) FROM lib2 l
    WHERE l.is_test_fixture
      AND EXISTS (
        SELECT 1 FROM public.scp_program_versions pv
          JOIN public.scp_programs p ON p.id = pv.program_id
         WHERE p.slug NOT LIKE 'fixture-%' AND p.slug <> 'decoy-programme-j9'
           AND pv.purpose_sv = l.programme_purpose_sv)) = 0,
  'J9.11 a fixture never shows the REAL programme''s purpose — the original defect');


DO $$ BEGIN RAISE NOTICE 'GROUP J10 — the seeded preconditions a real database needs'; END $$;

-- =========================================================================
-- Group J10 — preconditions, tested WITHOUT a fixture
-- =========================================================================
--
-- These assertions deliberately query the SEEDED state and build nothing.
-- Every other group creates its own purpose version, which is exactly how the
-- Assessment Center shipped unable to assign anything on a clean database: the
-- fixtures supplied the precondition production lacked, and 85 assertions
-- passed over the gap. Anything a real database must already contain belongs
-- here, where a fixture cannot paper over it.

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_purpose_versions pv
     JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
    WHERE p.is_active AND pv.published_at IS NOT NULL) >= 1,
  'J10.1 a clean database already has an active, published processing purpose');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_purpose_versions pv
     JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
    WHERE NOT p.is_active AND pv.published_at IS NOT NULL) = 0,
  'J10.2 no INACTIVE purpose is published — selection_support stays unusable');

SELECT pg_temp.ok(
  (SELECT lawful_basis_reference IS NOT NULL AND privacy_notice_version IS NOT NULL
     FROM public.scp_purpose_versions
    WHERE purpose_code = 'competence_development' ORDER BY version_number LIMIT 1),
  'J10.3 the seeded purpose names its lawful basis and privacy notice');

-- A published report template per audience must also already exist, or release
-- fails the same way assignment did.
SELECT pg_temp.ok(
  (SELECT count(DISTINCT audience) FROM public.scp_report_versions
    WHERE content_status = 'published') = 2,
  'J10.4 a published report template exists for BOTH audiences');


DO $$ BEGIN RAISE NOTICE 'GROUP J11 — best/worst is answerable one choice at a time'; END $$;

-- =========================================================================
-- Group J11 — incremental answering
-- =========================================================================
--
-- The completeness invariant is real, but it belongs at SUBMISSION, not on
-- every save. Enforced on every save it made the item unanswerable: the first
-- of the two choices was always refused.

CREATE TEMP TABLE bw AS
SELECT fi.item_version_id AS iv,
       (SELECT id FROM public.scp_item_options o
         WHERE o.item_version_id = fi.item_version_id AND o.is_best_key)  AS best,
       (SELECT id FROM public.scp_item_options o
         WHERE o.item_version_id = fi.item_version_id AND o.is_worst_key) AS worst
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv2 ON iv2.id = fi.item_version_id
 WHERE fi.form_id = (SELECT form_id FROM public.scp_attempts WHERE id = :'aid'::uuid)
   AND iv2.item_format = 'sjt_best_worst';
SELECT iv AS bw_iv, best AS bw_best, worst AS bw_worst FROM bw \gset

-- A fresh attempt to answer partially into, so the released one is untouched.
DO $$
DECLARE _new uuid; _a public.scp_attempts%ROWTYPE;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = (SELECT attempt_id FROM jfx);
  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, mode, form_id, assessment_version_id,
     purpose_version_id, jurisdiction_id, scoring_model_version, status)
  VALUES (_a.subject_id, _a.issuer_organization_id, 'assessment', _a.form_id,
          _a.assessment_version_id, _a.purpose_version_id, _a.jurisdiction_id,
          'det-v1', 'in_progress')
  RETURNING id INTO _new;
  CREATE TEMP TABLE bw_attempt AS SELECT _new AS id;
END $$;
SELECT id AS bw_aid FROM bw_attempt \gset

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE bw_first AS
SELECT public.scp_save_response(:'bw_aid'::uuid, :'bw_iv'::uuid, NULL, :'bw_best'::uuid, NULL, NULL) AS id;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT id FROM bw_first) IS NOT NULL,
  'J11.1 the FIRST of two best/worst choices saves on its own');

SELECT pg_temp.ok(
  (SELECT worst_option_id IS NULL FROM public.scp_candidate_responses
    WHERE attempt_id = :'bw_aid'::uuid AND item_version_id = :'bw_iv'::uuid),
  'J11.2 the half-finished answer is stored as half-finished, not discarded');

-- But it cannot become evidence in that state.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  format('SELECT * FROM public.scp_submit_attempt(%L::uuid)', :'bw_aid'),
  'SCP_INCOMPLETE_BEST_WORST',
  'J11.3 submission refuses a half-finished best/worst answer');
RESET ROLE; RESET request.jwt.claim.sub;

-- Completing it lets submission through.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE bw_done AS
SELECT public.scp_save_response(:'bw_aid'::uuid, :'bw_iv'::uuid, NULL,
                                :'bw_best'::uuid, :'bw_worst'::uuid, NULL) AS id;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT id FROM bw_done) IS NOT NULL,
  'J11.4 adding the second choice completes the same row');

-- The same option cannot be both.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_save_response(%L::uuid, %L::uuid, NULL, %L::uuid, %L::uuid, NULL)',
         :'bw_aid', :'bw_iv', :'bw_best', :'bw_best'),
  'SCP_RESPONSE_SHAPE',
  'J11.5 the best and the worst option cannot be the same');
RESET ROLE; RESET request.jwt.claim.sub;

-- And a row naming neither is still refused.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_save_response(%L::uuid, %L::uuid, NULL, NULL, NULL, NULL)',
         :'bw_aid', :'bw_iv'),
  'SCP_RESPONSE_SHAPE',
  'J11.6 a best/worst answer naming neither option is still refused');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'scp_phase2_journey_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
