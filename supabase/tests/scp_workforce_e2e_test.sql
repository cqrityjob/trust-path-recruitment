-- #51 — The employer self-service workforce lifecycle, end to end.
--
-- Every lifecycle transition below happens through the SAME governed function
-- the product calls. Nothing here sets a status by hand after setup: no UPDATE
-- to scp_attempts, no INSERT into scp_human_reviews, no snapshot written
-- directly. If the product cannot do it, this test cannot do it either.
--
-- Four distinct people in Employer A, because the separation-of-duties rules
-- only mean something when the roles are actually held by different humans:
--
--   ownerA     -- authorises the reviewer, releases the result
--   assignerA  -- admin who assigns, and who must therefore NOT be able to review
--   reviewerA  -- the employer's own authorised response reviewer
--   personUser -- the employee being assessed
--
-- Employer B exists to prove that a shared professional identity is not a
-- channel between tenants. The same human is employed by both.
--
-- No platform admin appears anywhere in the journey.
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

/** The lifecycle state one surface reports for one attempt. Written once so the
 *  cross-surface assertions compare like with like. */
CREATE OR REPLACE FUNCTION pg_temp.employer_state(_emp uuid, _att uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT p.lifecycle_state FROM public.scp_employer_assessment_pipeline(_emp) p
   WHERE p.attempt_id = _att;
$$;
CREATE OR REPLACE FUNCTION pg_temp.person_state(_emp uuid, _empl uuid, _att uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT q.lifecycle_state FROM public.scp_employer_person_assessments(_emp, _empl) q
   WHERE q.attempt_id = _att;
$$;
CREATE OR REPLACE FUNCTION pg_temp.participant_state(_att uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT h.lifecycle_state FROM public.scp_my_assessment_history() h
   WHERE h.attempt_id = _att;
$$;

-- ── Fixture ───────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('e2e00000-0000-0000-0000-00000000000a','ownerA@e2e.test'),
  ('e2e00000-0000-0000-0000-00000000000b','assignerA@e2e.test'),
  ('e2e00000-0000-0000-0000-00000000000c','reviewerA@e2e.test'),
  ('e2e00000-0000-0000-0000-00000000000d','person@e2e.test'),
  ('e2e00000-0000-0000-0000-00000000000e','ownerB@e2e.test'),
  ('e2e00000-0000-0000-0000-00000000000f','reviewerB@e2e.test');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('e2e00000-1111-0000-0000-00000000000a','Alpha Vakt AB','alpha-vakt-e2e','active'),
  ('e2e00000-1111-0000-0000-00000000000b','Beta Vakt AB','beta-vakt-e2e','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e2e00000-1111-0000-0000-00000000000a','e2e00000-0000-0000-0000-00000000000a','owner','active'),
  ('e2e00000-1111-0000-0000-00000000000a','e2e00000-0000-0000-0000-00000000000b','admin','active'),
  ('e2e00000-1111-0000-0000-00000000000a','e2e00000-0000-0000-0000-00000000000c','member','active'),
  ('e2e00000-1111-0000-0000-00000000000b','e2e00000-0000-0000-0000-00000000000e','owner','active'),
  ('e2e00000-1111-0000-0000-00000000000b','e2e00000-0000-0000-0000-00000000000f','member','active');

INSERT INTO public.scp_test_grants (employer_id, purpose, reason, authorised_by) VALUES
  ('e2e00000-1111-0000-0000-00000000000a','closed_test','e2e fixture','e2e00000-0000-0000-0000-00000000000a'),
  ('e2e00000-1111-0000-0000-00000000000b','closed_test','e2e fixture','e2e00000-0000-0000-0000-00000000000e');

INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by) VALUES
  ('e2e00000-3333-0000-0000-00000000000a','e2e00000-1111-0000-0000-00000000000a',
   'Alva','Väktare','person@e2e.test','active','e2e00000-0000-0000-0000-00000000000a'),
  ('e2e00000-3333-0000-0000-00000000000b','e2e00000-1111-0000-0000-00000000000b',
   'Alva','Väktare','person@e2e.test','active','e2e00000-0000-0000-0000-00000000000e');

CREATE TEMP TABLE e2efx AS
SELECT
  (SELECT av.id FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id=av.definition_id
    WHERE d.slug='sg-situational-awareness' LIMIT 1) AS av1,
  (SELECT av.id FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id=av.definition_id
    WHERE d.slug='sg-access-control' LIMIT 1) AS av2;
SELECT av1, av2 FROM e2efx \gset

-- ═══ 1. The employer staffs itself: owner authorises its own reviewer ═══

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT public.scp_grant_employer_reviewer(
  'e2e00000-1111-0000-0000-00000000000a'::uuid,
  'e2e00000-0000-0000-0000-00000000000c'::uuid,
  ARRAY['workforce']::text[]);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000e';
SELECT public.scp_grant_employer_reviewer(
  'e2e00000-1111-0000-0000-00000000000b'::uuid,
  'e2e00000-0000-0000-0000-00000000000f'::uuid,
  ARRAY['workforce']::text[]);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT public.scp_can_author('e2e00000-0000-0000-0000-00000000000c'::uuid),
  'F1 the employer''s reviewer holds NO platform content capability');
SELECT pg_temp.ok(
  NOT public.is_platform_admin('e2e00000-0000-0000-0000-00000000000a'::uuid)
  AND NOT public.is_platform_admin('e2e00000-0000-0000-0000-00000000000b'::uuid)
  AND NOT public.is_platform_admin('e2e00000-0000-0000-0000-00000000000c'::uuid),
  'F2 nobody in this journey is a CQrityjob platform administrator');

-- ═══ 2. Assign ═══

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000b';
CREATE TEMP TABLE a1 AS
SELECT * FROM public.scp_employer_assign(
  'e2e00000-1111-0000-0000-00000000000a'::uuid, :'av1'::uuid,
  'person@e2e.test', NULL, 'sv', 'workforce',
  'e2e00000-3333-0000-0000-00000000000a'::uuid, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT attempt_id AS att1, subject_id AS subj FROM a1 \gset

SELECT pg_temp.ok(
  (SELECT subject_id FROM public.employees WHERE id='e2e00000-3333-0000-0000-00000000000a')
  = :'subj'::uuid,
  'F3 assigning bound the employment relationship to the canonical subject');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  pg_temp.employer_state('e2e00000-1111-0000-0000-00000000000a', :'att1'::uuid) = 'invited',
  'F4 Employer Tester shows invited');
SELECT pg_temp.ok(
  pg_temp.person_state('e2e00000-1111-0000-0000-00000000000a',
                       'e2e00000-3333-0000-0000-00000000000a', :'att1'::uuid) = 'invited',
  'F5 Person page shows invited');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000d';
SELECT pg_temp.ok(pg_temp.participant_state(:'att1'::uuid) = 'invited',
  'F6 Participant history shows invited');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═══ 3. Participant works ═══

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000d';
-- Items are served by the product, not read from the content tables: a
-- participant has no direct read on scp_form_items, which is correct.
CREATE TEMP TABLE served1 AS
SELECT * FROM public.scp_get_attempt_items(:'att1'::uuid, 'sv-SE');

SELECT public.scp_save_response(
  :'att1'::uuid, s.item_version_id,
  CASE WHEN s.item_format <> 'constructed_response'
       THEN ((s.options -> 0) ->> 'option_id')::uuid END,
  NULL, NULL,
  CASE WHEN s.item_format = 'constructed_response'
       THEN 'E2E: jag noterar tid, plats och egen iakttagelse, skilt från tolkning.' END)
  FROM served1 s ORDER BY s.display_order LIMIT 1;
SELECT pg_temp.ok(pg_temp.participant_state(:'att1'::uuid) = 'in_progress',
  'F7 answering one item moves the participant view to in_progress');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  pg_temp.employer_state('e2e00000-1111-0000-0000-00000000000a', :'att1'::uuid) = 'in_progress'
  AND pg_temp.person_state('e2e00000-1111-0000-0000-00000000000a',
                           'e2e00000-3333-0000-0000-00000000000a', :'att1'::uuid) = 'in_progress',
  'F8 employer and person surfaces move to in_progress together');
RESET ROLE; RESET request.jwt.claim.sub;

-- Answer the rest, then submit -- both through product functions.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000d';
SELECT public.scp_save_response(
  :'att1'::uuid, s.item_version_id,
  CASE WHEN s.item_format <> 'constructed_response'
       THEN ((s.options -> 0) ->> 'option_id')::uuid END,
  NULL, NULL,
  CASE WHEN s.item_format = 'constructed_response'
       THEN 'E2E: jag noterar tid, plats och egen iakttagelse, skilt från tolkning.' END)
  FROM served1 s;
CREATE TEMP TABLE sub1 AS SELECT * FROM public.scp_submit_attempt(:'att1'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT reviews_opened FROM sub1) > 0,
  'F9 submitting opened human reviews, so the result is genuinely blocked');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  pg_temp.employer_state('e2e00000-1111-0000-0000-00000000000a', :'att1'::uuid) = 'under_review',
  'F10 Employer Tester shows under_review');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═══ 4. Review: separation of duties, then the real work ═══

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_queue('sv-SE')) = 0,
  'F11 the assigner sees no review work for the assessment they assigned');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000f';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_queue('sv-SE')) = 0,
  'F12 Employer B''s reviewer sees none of Employer A''s work');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000c';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_review_queue('sv-SE')) = (SELECT reviews_opened FROM sub1),
  'F13 Employer A''s authorised reviewer sees exactly the opened reviews');
SELECT pg_temp.ok(
  (SELECT responses_waiting FROM public.scp_my_review_workload())
  = (SELECT count(*) FROM public.scp_review_queue('sv-SE')),
  'F14 their workload count equals their queue');

-- Complete every review through the product function.
DO $$
DECLARE _r record; _sc boolean;
BEGIN
  FOR _r IN SELECT review_id, is_safety_critical FROM public.scp_review_queue('sv-SE') LOOP
    PERFORM public.scp_complete_human_review(
      _r.review_id, 'upheld',
      'E2E: svaret följer den föredragna handlingslinjen och prioriterar korrekt.',
      CASE WHEN _r.is_safety_critical THEN 'no_concern' ELSE NULL END);
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id = :'att1'::uuid) = 'scored',
  'F15 the last review moved the attempt to scored automatically');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_human_reviews hr
                JOIN public.scp_candidate_responses cr ON cr.id = hr.response_id
               WHERE cr.attempt_id = :'att1'::uuid AND hr.reviewed_under_break_glass),
  'F16 no review was completed under platform-admin break-glass');

-- ═══ 5. Release ═══

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  pg_temp.employer_state('e2e00000-1111-0000-0000-00000000000a', :'att1'::uuid) = 'ready_to_release',
  'F17 Employer Tester shows ready_to_release');
SELECT pg_temp.ok(
  (SELECT can_release FROM public.scp_employer_assessment_pipeline(
     'e2e00000-1111-0000-0000-00000000000a'::uuid) WHERE attempt_id = :'att1'::uuid),
  'F18 and the owner is told they may release it');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = :'att1'::uuid) = 0,
  'F19 before release there is NO report of any audience');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000d';
-- The STATE is shared -- one derivation, one value. What differs by audience is
-- the wording: LifecycleChip renders 'ready_to_release' as "Klar att frisläppa"
-- to the employer and "Resultatet förbereds" to the participant. So the thing
-- to assert here is the state's identity across surfaces, and that the
-- participant is given no result to open yet.
SELECT pg_temp.ok(pg_temp.participant_state(:'att1'::uuid) = 'ready_to_release',
  'F20 the participant sees the SAME lifecycle state the employer sees');
SELECT pg_temp.ok(
  (SELECT participant_snapshot_id IS NULL FROM public.scp_my_assessment_history()
    WHERE attempt_id = :'att1'::uuid),
  'F20b but has no report to open before release');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000c';
SELECT pg_temp.must_fail(
  format('SELECT public.scp_release_attempt_report(%L::uuid)', :'att1'),
  'SCP_NOT_AUTHORISED_TO_RELEASE',
  'F21 the reviewer cannot release -- reviewing and releasing are different acts');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE rel1 AS SELECT * FROM public.scp_release_attempt_report(:'att1'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT participant_snapshot IS NOT NULL AND employer_snapshot IS NOT NULL FROM rel1),
  'F22 release created exactly one participant and one employer report');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = :'att1'::uuid AND audience = 'participant') = 1
  AND (SELECT count(*) FROM public.scp_report_snapshots
        WHERE attempt_id = :'att1'::uuid AND audience = 'employer') = 1,
  'F23 one of each audience, no more');

-- ═══ 6. All three surfaces move together ═══

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  pg_temp.employer_state('e2e00000-1111-0000-0000-00000000000a', :'att1'::uuid) = 'result_available'
  AND pg_temp.person_state('e2e00000-1111-0000-0000-00000000000a',
                           'e2e00000-3333-0000-0000-00000000000a', :'att1'::uuid) = 'result_available',
  'F24 Tester and Person both become result_available');
SELECT pg_temp.ok(
  (SELECT rs.audience FROM public.scp_report_snapshots rs
    WHERE rs.id = (SELECT employer_snapshot_id FROM public.scp_employer_person_assessments(
                     'e2e00000-1111-0000-0000-00000000000a'::uuid,
                     'e2e00000-3333-0000-0000-00000000000a'::uuid)
                    WHERE attempt_id = :'att1'::uuid)) = 'employer',
  'F25 the employer surface offers the EMPLOYER report');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000d';
SELECT pg_temp.ok(pg_temp.participant_state(:'att1'::uuid) = 'result_available',
  'F26 the participant history becomes result_available');
SELECT pg_temp.ok(
  (SELECT rs.audience FROM public.scp_report_snapshots rs
    WHERE rs.id = (SELECT participant_snapshot_id FROM public.scp_my_assessment_history()
                    WHERE attempt_id = :'att1'::uuid)) = 'participant',
  'F27 and offers the PARTICIPANT report, never the employer one');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═══ 7. Employer B sees nothing of it ═══

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000e';
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_assessment_pipeline(
                'e2e00000-1111-0000-0000-00000000000b'::uuid)
               WHERE attempt_id = :'att1'::uuid),
  'F28 Employer B''s pipeline contains none of Employer A''s work');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'e2e00000-1111-0000-0000-00000000000b'::uuid,
     'e2e00000-3333-0000-0000-00000000000b'::uuid)) = 0,
  'F29 and its own record of the SAME human shows no Employer A history');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_assessment_pipeline(
     'e2e00000-1111-0000-0000-00000000000a'::uuid)) = 0,
  'F30 asking about Employer A directly returns nothing');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═══ 8. Identity survives an email change, and history accumulates ═══

UPDATE public.employees SET email = 'changed@e2e.test'
 WHERE id = 'e2e00000-3333-0000-0000-00000000000a';
UPDATE auth.users SET email = 'changed-account@e2e.test'
 WHERE id = 'e2e00000-0000-0000-0000-00000000000d';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  pg_temp.person_state('e2e00000-1111-0000-0000-00000000000a',
                       'e2e00000-3333-0000-0000-00000000000a', :'att1'::uuid) = 'result_available',
  'F31 history survives BOTH the employment and account email changing');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000b';
CREATE TEMP TABLE a2 AS
SELECT * FROM public.scp_employer_assign(
  'e2e00000-1111-0000-0000-00000000000a'::uuid, :'av2'::uuid,
  'changed-account@e2e.test', NULL, 'sv', 'workforce',
  'e2e00000-3333-0000-0000-00000000000a'::uuid, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT subject_id FROM a2) = :'subj'::uuid,
  'F32 the second assessment resolves to the SAME professional identity');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_person_assessments(
     'e2e00000-1111-0000-0000-00000000000a'::uuid,
     'e2e00000-3333-0000-0000-00000000000a'::uuid)) = 2,
  'F33 the person now has two historical assessments');
SELECT pg_temp.ok(
  pg_temp.person_state('e2e00000-1111-0000-0000-00000000000a',
                       'e2e00000-3333-0000-0000-00000000000a', :'att1'::uuid) = 'result_available',
  'F34 and the first one is untouched by the second');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities si
    WHERE si.user_id = 'e2e00000-0000-0000-0000-00000000000d') = 1,
  'F35 one human still has exactly one professional identity');

ROLLBACK;
