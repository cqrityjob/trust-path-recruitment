-- The employer report and the participant report are different documents.
--
-- Until Phase 8, scp_release_attempt_report built ONE payload and inserted it
-- into both snapshot rows. The suite could not see the problem, because
-- scp_phase2_journey_test J5.4/J5.5 apply the same bool_and predicate to both
-- rows: two byte-identical snapshots pass a test that only ever asserted that
-- nothing BAD was present, never that anything was ABSENT from one side.
--
-- This suite asserts absence in both directions. It is the test that was
-- missing, and it is the reason the allowlists in the release function can be
-- trusted to stay allowlists.
--
-- One transaction, ends in ROLLBACK.

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

-- ---------------------------------------------------------------------------
-- Fixture: two organisations, so cross-tenant denial is a real second tenant
-- rather than a hypothetical one.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE ra AS
SELECT
  'ff000000-0000-0000-0000-000000000001'::uuid AS employer,
  'ff000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'ff000000-0000-0000-0000-000000000003'::uuid AS participant,
  'ff000000-0000-0000-0000-000000000004'::uuid AS other_employer,
  'ff000000-0000-0000-0000-000000000005'::uuid AS other_owner,
  'ff000000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'ff000000-0000-0000-0000-000000000007'::uuid AS stranger;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user     FROM ra), 'owner@report-audience.test'),
  ((SELECT participant    FROM ra), 'participant@report-audience.test'),
  ((SELECT other_owner    FROM ra), 'other-owner@report-audience.test'),
  ((SELECT reviewer_user  FROM ra), 'reviewer@report-audience.test'),
  ((SELECT stranger       FROM ra), 'stranger@report-audience.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Rapport AB', 'rapport-ab-audience', 'active' FROM ra
UNION ALL
SELECT other_employer, 'Annan Rapport AB', 'annan-rapport-audience', 'active' FROM ra;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM ra
UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM ra;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM ra;

CREATE TEMP TABLE rav AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM rav),
       'Report audience suite', owner_user, now() + interval '30 days' FROM ra;

GRANT SELECT ON ra, rav TO authenticated;

-- ---------------------------------------------------------------------------
-- Run the whole thing: assign, answer, submit, review, release.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM ra), (SELECT version_id FROM rav),
  'participant@report-audience.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON run TO authenticated;

-- The item bank and its options are author-only under RLS -- which is the
-- point: a participant may answer an item without being able to enumerate the
-- form. The real player reads them through scp_get_attempt_items, a definer
-- RPC. Here the list is assembled once as the owning role and handed over, so
-- the loop below exercises scp_save_response as the participant without
-- needing a read it is correctly denied.
CREATE TEMP TABLE raitems AS
SELECT fi.display_order,
       iv.id AS ivid,
       iv.item_format,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1)      AS first_option,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS last_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM run));
GRANT SELECT ON raitems TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000003';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM run;
  FOR _it IN SELECT * FROM raitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Jag följer instruktionen, håller avstånd, larmar och dokumenterar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.first_option, _it.last_option, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.first_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000006';
DO $$
DECLARE _att uuid; _rv record;
BEGIN
  SELECT attempt_id INTO _att FROM run;
  FOR _rv IN
    SELECT hr.id, iv.is_safety_critical
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE r.attempt_id = _att AND hr.review_status = 'pending'
  LOOP
    PERFORM public.scp_complete_human_review(_rv.id, 'upheld',
      'Inom mandatet, prioriterar säkerhet, dokumenterar åtgärden.',
      0.5, CASE WHEN _rv.is_safety_critical THEN 'low' ELSE NULL END);
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';
DO $$ DECLARE _att uuid; BEGIN
  SELECT attempt_id INTO _att FROM run;
  PERFORM public.scp_release_attempt_report(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

CREATE TEMP TABLE snaps AS
SELECT audience, payload, safety_flags, evidence_state_version, derivation_input,
       report_version_id, context
  FROM public.scp_report_snapshots
 WHERE attempt_id = (SELECT attempt_id FROM run);

DO $$ BEGIN RAISE NOTICE 'GROUP RA1 — two audiences, two documents'; END $$;

-- =========================================================================
-- Group RA1 — the payloads are genuinely different
-- =========================================================================

SELECT pg_temp.ok((SELECT count(*) FROM snaps) = 2,
  'RA1.1 release produces exactly one snapshot per audience');

-- The assertion that would have caught the original defect.
SELECT pg_temp.ok(
  (SELECT count(DISTINCT md5(payload::text)) FROM snaps) = 2,
  'RA1.2 the two payloads are not the same bytes');

SELECT pg_temp.ok(
  (SELECT bool_and(evidence_state_version = 'des-v1') FROM snaps),
  'RA1.3 both snapshots record which derivation produced them');

SELECT pg_temp.ok(
  (SELECT bool_and(jsonb_array_length(derivation_input) > 0) FROM snaps),
  'RA1.4 the derivation input is frozen so the report can be reproduced');

DO $$ BEGIN RAISE NOTICE 'GROUP RA2 — employer-only fields are absent from the participant'; END $$;

-- =========================================================================
-- Group RA2 — absence, in both directions
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT payload::text LIKE '%followup_sv%' FROM snaps WHERE audience='employer'),
  'RA2.1 the employer report carries an interview follow-up question');

SELECT pg_temp.ok(
  (SELECT payload::text NOT LIKE '%followup_sv%' FROM snaps WHERE audience='participant'),
  'RA2.2 the employer follow-up question is ABSENT from the participant payload');

SELECT pg_temp.ok(
  (SELECT payload::text LIKE '%reflection_sv%' FROM snaps WHERE audience='participant'),
  'RA2.3 the participant report carries its own reflection prompt');

SELECT pg_temp.ok(
  (SELECT payload::text NOT LIKE '%reflection_sv%' FROM snaps WHERE audience='employer'),
  'RA2.4 the participant reflection prompt is ABSENT from the employer payload');

SELECT pg_temp.ok(
  (SELECT payload::text LIKE '%human_reviewed%' FROM snaps WHERE audience='participant'),
  'RA2.5 the participant is told a person reviewed a safety-critical answer');

DO $$ BEGIN RAISE NOTICE 'GROUP RA3 — severity and reviewer judgement never reach the participant'; END $$;

-- =========================================================================
-- Group RA3 — the reviewer's internal grading stays internal
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(safety_flags) > 0 FROM snaps WHERE audience='employer'),
  'RA3.1 the employer receives the safety observations');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(safety_flags) = 0 FROM snaps WHERE audience='participant'),
  'RA3.2 the participant receives NO severity-bearing safety flags');

SELECT pg_temp.ok(
  (SELECT payload::text NOT LIKE '%severity%' FROM snaps WHERE audience='participant'),
  'RA3.3 no severity word appears anywhere in the participant payload');

SELECT pg_temp.ok(
  (SELECT bool_and(payload::text NOT LIKE '%reviewer_rationale%') FROM snaps),
  'RA3.4 reviewer-private reasoning reaches NEITHER audience');

DO $$ BEGIN RAISE NOTICE 'GROUP RA4 — no scoring secrets, no internal vocabulary'; END $$;

-- =========================================================================
-- Group RA4 — what neither audience may ever see
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT bool_and(payload::text NOT LIKE '%maturity_level%') FROM snaps),
  'RA4.1 the internal maturity vocabulary is absent from both payloads');

SELECT pg_temp.ok(
  (SELECT bool_and(derivation_input::text LIKE '%maturity_level%') FROM snaps),
  'RA4.2 but it IS retained internally, so the derivation stays reproducible');

SELECT pg_temp.ok(
  (SELECT bool_and(
     payload::text NOT LIKE '%score_value%' AND
     payload::text NOT LIKE '%is_preferred%' AND
     payload::text NOT LIKE '%is_best_key%' AND
     payload::text NOT LIKE '%scoring_rationale%' AND
     payload::text NOT LIKE '%distractor%') FROM snaps),
  'RA4.3 no scoring key, preferred answer or item rationale in either payload');

SELECT pg_temp.ok(
  (SELECT bool_and(
     payload::text NOT LIKE '%percent%' AND
     payload::text NOT LIKE '%ranking%' AND
     payload::text NOT LIKE '%percentile%' AND
     payload::text NOT LIKE '%suitab%' AND
     payload::text NOT LIKE '%recommend%') FROM snaps),
  'RA4.4 no percentage, ranking, percentile or suitability claim in either payload');

DO $$ BEGIN RAISE NOTICE 'GROUP RA5 — the report describes itself truthfully'; END $$;

-- =========================================================================
-- Group RA5 — templates and evidence states
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM snaps s
     JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE v.governance_mode = 'closed_test') = 2,
  'RA5.1 a closed-test run gets the closed-test template, not the fixture one');

SELECT pg_temp.ok(
  (SELECT count(*) FROM snaps s
     JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE v.report_key LIKE 'fixture-%') = 0,
  'RA5.2 no released report describes real content as a test fixture');

-- One assessment is one evidence context, and consistent_evidence needs two.
-- So nothing from a single run can read as "shown", and the report has to say
-- why rather than implying the person fell short.
SELECT pg_temp.ok(
  (SELECT bool_and(x->>'evidence_state' = 'follow_up')
     FROM snaps s, jsonb_array_elements(s.payload) x
    WHERE s.audience = 'employer'),
  'RA5.3 a single-context run yields follow_up throughout — the threshold model, stated honestly');

-- The safety route is a human judgement, never a low score.
SELECT pg_temp.ok(
  (SELECT count(*) FROM snaps s, jsonb_array_elements(s.payload) x
    WHERE x->>'evidence_state' = 'critical_follow_up') = 0,
  'RA5.4 severity "low" on every observation produces no critical follow-up');

DO $$ BEGIN RAISE NOTICE 'GROUP RA6 — who may read which document'; END $$;

-- =========================================================================
-- Group RA6 — access
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'participant') = 1,
  'RA6.1 the participant can read their own participant report');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'employer') = 0,
  'RA6.2 the participant cannot read the employer report at all');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'employer') = 1,
  'RA6.3 the commissioning employer can read the employer report');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'participant') = 0,
  'RA6.4 the employer cannot read the participant''s own report');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run)) = 0,
  'RA6.5 a second employer reads nothing of the first employer''s run');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000007';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run)) = 0,
  'RA6.6 an unrelated signed-in account reads nothing');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP RA7 — release stays a one-way door'; END $$;

-- =========================================================================
-- Group RA7 — immutability and release-once, unchanged by Phase 8
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_release_attempt_report(%L::uuid)', (SELECT attempt_id FROM run)),
  'SCP_ALREADY_RELEASED',
  'RA7.1 a second release is still refused');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.must_fail(format(
  'UPDATE public.scp_report_snapshots SET payload = ''[]''::jsonb WHERE attempt_id = %L::uuid',
  (SELECT attempt_id FROM run)),
  'SCP_SNAPSHOT_IMMUTABLE',
  'RA7.2 a released payload cannot be edited afterwards');


DO $$ BEGIN RAISE NOTICE 'GROUP RA8 — Part A: the report says what it is about'; END $$;

-- =========================================================================
-- Group RA8 — context and integrity
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT bool_and(context IS NOT NULL) FROM snaps),
  'RA8.1 both snapshots freeze a context at release');

SELECT pg_temp.ok(
  (SELECT bool_and(
     context ? 'organisation_name' AND context ? 'purpose_code' AND
     context ? 'assessment_name_sv' AND context ? 'assessment_version' AND
     context ? 'governance_mode' AND context ? 'validation_status')
     FROM snaps),
  'RA8.2 both carry organisation, purpose, assessment, version and governance');

SELECT pg_temp.ok(
  (SELECT context ? 'attempt_status' AND context ? 'reviews_total'
      AND context ? 'scoring_model_version' AND context ? 'participant_ref'
     FROM snaps WHERE audience = 'employer'),
  'RA8.3 the employer context carries lifecycle, review counts and lineage');

-- The participant is told what concerns them, not how the machine ran.
SELECT pg_temp.ok(
  (SELECT NOT (context ? 'attempt_status') AND NOT (context ? 'reviews_total')
      AND NOT (context ? 'scoring_model_version')
     FROM snaps WHERE audience = 'participant'),
  'RA8.4 the participant context carries NO lifecycle, review counts or scoring model');

-- A name in an immutable row could never be erased, and identity resolution is
-- an audited act rather than an ambient one.
SELECT pg_temp.ok(
  (SELECT bool_and(context::text NOT ILIKE '%@%')
     FROM snaps),
  'RA8.5 no participant email or name is frozen into either context');

-- Role, customer and site do not exist in the data model yet, so they are
-- omitted rather than emitted as an empty field on every report.
SELECT pg_temp.ok(
  (SELECT bool_and(NOT (context ? 'role_title') AND NOT (context ? 'site_name'))
     FROM snaps),
  'RA8.6 absent role and site are omitted, not fabricated as "not provided"');

DO $$ BEGIN RAISE NOTICE 'GROUP RA9 — Part C: each line carries its own evidence description'; END $$;

-- =========================================================================
-- Group RA9 — competency evidence detail
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT bool_and(x ? 'behaviour_sv') FROM snaps s, jsonb_array_elements(s.payload) x),
  'RA9.1 every line states the observable behaviour it was read through');

SELECT pg_temp.ok(
  (SELECT bool_and(x ? 'source_types')
     FROM snaps s, jsonb_array_elements(s.payload) x WHERE s.audience = 'employer'),
  'RA9.2 the employer line states which kinds of task contributed');

SELECT pg_temp.ok(
  (SELECT bool_and(coalesce(x->>'followup_sv','') <> '')
     FROM snaps s, jsonb_array_elements(s.payload) x WHERE s.audience = 'employer'),
  'RA9.3 every employer line carries a curated follow-up question');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT x->>'followup_sv') > 1
     FROM snaps s, jsonb_array_elements(s.payload) x WHERE s.audience = 'employer'),
  'RA9.4 the questions are competency-specific, not one repeated string');

-- Deterministic and versioned: the same prompt row backs every release.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_followup_prompts
    WHERE content_status = 'published' AND audience = 'employer') >= 12,
  'RA9.5 the prompt catalogue is curated and versioned, not generated');

DO $$ BEGIN RAISE NOTICE 'GROUP RA10 — Part F: the employer decision is separate and append-only'; END $$;

-- =========================================================================
-- Group RA10 — employer decision addendum
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE dec1 AS
SELECT public.scp_record_employer_decision(
  (SELECT attempt_id FROM run), 'assign_development', 'evidence_thin',
  'Underlaget bygger på en källa.', 'Boka praktiskt moment', 'Driftchef', NULL) AS id;
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON dec1 TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM dec1) = 1,
  'RA10.1 an owner can record a decision once the report is released');

-- The decision is NOT in the report. That separation is the whole design.
SELECT pg_temp.ok(
  (SELECT bool_and(payload::text NOT ILIKE '%assign_development%'
               AND payload::text NOT ILIKE '%Driftchef%') FROM snaps),
  'RA10.2 the decision does not enter any report payload');

SELECT pg_temp.must_fail(format(
  'UPDATE public.scp_employer_report_decisions SET action = ''no_action_needed'' WHERE id = %L::uuid',
  (SELECT id FROM dec1)),
  'SCP_DECISION_APPEND_ONLY',
  'RA10.3 a recorded decision cannot be edited');

SELECT pg_temp.must_fail(format(
  'DELETE FROM public.scp_employer_report_decisions WHERE id = %L::uuid',
  (SELECT id FROM dec1)),
  'SCP_DECISION_APPEND_ONLY',
  'RA10.4 a recorded decision cannot be deleted');

-- Correction is a new row that points at the old one.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE dec2 AS
SELECT public.scp_record_employer_decision(
  (SELECT attempt_id FROM run), 'follow_up_conversation', 'competency_gap',
  'Rättelse: samtal först.', 'Utvecklingssamtal', 'Driftchef',
  (SELECT id FROM dec1)) AS id;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report_decisions
    WHERE attempt_id = (SELECT attempt_id FROM run)) = 2,
  'RA10.5 a correction adds a record rather than replacing one');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FILTER (WHERE is_current) = 1
      AND count(*) = 2
     FROM public.scp_employer_decisions((SELECT attempt_id FROM run))),
  'RA10.6 exactly one decision is current and the superseded one stays visible');
RESET ROLE; RESET request.jwt.claim.sub;

-- Authorisation: the same bar as releasing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_record_employer_decision(%L::uuid, ''no_action_needed'', ''other'')',
  (SELECT attempt_id FROM run)),
  'SCP_NOT_AUTHORISED_TO_DECIDE',
  'RA10.7 the participant cannot record a decision about themselves');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_decisions((SELECT attempt_id FROM run))) = 0,
  'RA10.8 the participant cannot read the employer decision history');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000005';
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_record_employer_decision(%L::uuid, ''no_action_needed'', ''other'')',
  (SELECT attempt_id FROM run)),
  'SCP_NOT_AUTHORISED_TO_DECIDE',
  'RA10.9 a second employer cannot decide on the first employer''s attempt');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_decisions((SELECT attempt_id FROM run))) = 0,
  'RA10.10 a second employer reads none of the first employer''s decisions');
RESET ROLE; RESET request.jwt.claim.sub;

-- The vocabulary carries no employment verdict.
SELECT pg_temp.ok(
  (SELECT pg_get_constraintdef(oid) NOT ILIKE '%hire%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%reject%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%suitab%'
     FROM pg_constraint
    WHERE conrelid = 'public.scp_employer_report_decisions'::regclass
      AND conname LIKE '%action%'),
  'RA10.11 the action vocabulary offers no hire, reject or suitability verdict');

ROLLBACK;
