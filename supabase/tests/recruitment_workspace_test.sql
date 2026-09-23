-- The recruitment workspace (20261207090000): every rule proved by EXECUTING
-- it, as the role that would really attempt it -- never by reading a policy.
--
--   A · isolation        two organisations, a candidate, a stranger and anon
--   V · vacancy frame    requirements and questions, public read, lock on
--                        first application
--   S · submission       answers in the same transaction, required answers,
--                        idempotent retry, closed vacancy
--   T · stages           stale moves refused, decisions only by the people who
--                        may decide, opening never moves a candidate, two
--                        applications by one person stay independent
--   B · bookings         planning, visibility to the candidate, response
--   M · messages         drafts private, one message per key, one e-mail in
--                        flight, truthful settle, no cross-tenant claim
--   C · completion       closing is not completing, unresolved candidates
--                        block it, only owner/admin reopen
--
-- One transaction, ends in ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
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

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

-- ---------------------------------------------------------------------------
-- Fixture: organisation A (owner, admin, two members), organisation B (owner),
-- a platform admin who publishes, two candidates, one stranger.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE rw AS
SELECT
  'ae000000-1111-0000-0000-00000000000a'::uuid AS emp_a,
  'ae000000-1111-0000-0000-00000000000b'::uuid AS emp_b,
  'ae000000-0000-0000-0000-00000000000a'::uuid AS owner_a,
  'ae000000-0000-0000-0000-00000000000c'::uuid AS admin_a,
  'ae000000-0000-0000-0000-00000000000d'::uuid AS member_a,
  'ae000000-0000-0000-0000-00000000000e'::uuid AS member2_a,
  'ae000000-0000-0000-0000-00000000000b'::uuid AS owner_b,
  'ae000000-0000-0000-0000-0000000000ad'::uuid AS moderator,
  'ae000000-0000-0000-0000-000000000c01'::uuid AS cand1,
  'ae000000-0000-0000-0000-000000000c02'::uuid AS cand2,
  'ae000000-0000-0000-0000-000000000c03'::uuid AS stranger,
  'ae000000-2222-0000-0000-000000000001'::uuid AS job1,
  'ae000000-2222-0000-0000-000000000002'::uuid AS job2,
  'ae000000-2222-0000-0000-000000000003'::uuid AS job_closed,
  'ae000000-2222-0000-0000-000000000004'::uuid AS job_draft,
  'ae000000-2222-0000-0000-00000000000b'::uuid AS job_b,
  'ae000000-3333-0000-0000-000000000001'::uuid AS app1,   -- cand1 → job1
  'ae000000-3333-0000-0000-000000000002'::uuid AS app2,   -- cand1 → job2
  'ae000000-3333-0000-0000-000000000003'::uuid AS app3,   -- cand2 → job1
  'ae000000-3333-0000-0000-00000000000b'::uuid AS app_b;  -- cand2 → job_b

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_a,   'owner-a@rec.test',   now() FROM rw UNION ALL
SELECT admin_a,   'admin-a@rec.test',   now() FROM rw UNION ALL
SELECT member_a,  'member-a@rec.test',  now() FROM rw UNION ALL
SELECT member2_a, 'member2-a@rec.test', now() FROM rw UNION ALL
SELECT owner_b,   'owner-b@rec.test',   now() FROM rw UNION ALL
SELECT moderator, 'moderator@rec.test', now() FROM rw UNION ALL
SELECT cand1,     'cand1@rec.test',     now() FROM rw UNION ALL
SELECT cand2,     'cand2@rec.test',     now() FROM rw UNION ALL
SELECT stranger,  'stranger@rec.test',  now() FROM rw;

INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM rw;

INSERT INTO public.employers (id, name, slug, status)
SELECT emp_a, 'Rekrytering A AB', 'rekrytering-a', 'active' FROM rw UNION ALL
SELECT emp_b, 'Rekrytering B AB', 'rekrytering-b', 'active' FROM rw;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT emp_a, owner_a,   'owner',  'active' FROM rw UNION ALL
SELECT emp_a, admin_a,   'admin',  'active' FROM rw UNION ALL
SELECT emp_a, member_a,  'member', 'active' FROM rw UNION ALL
SELECT emp_a, member2_a, 'member', 'active' FROM rw UNION ALL
SELECT emp_b, owner_b,   'owner',  'active' FROM rw;

GRANT SELECT ON rw TO PUBLIC;

-- Drafts first, as the employer creates them; the frame is written while they
-- are drafts; publication then goes through the moderator seat the other
-- suites use, because publishing is guarded by jobs_validate_before_write.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000a';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job1, 'rec-job-1', 'REC00001', emp_a, 'Väktare Solna', 'Security Officer Solna', 'internal', 'draft' FROM rw UNION ALL
SELECT job2, 'rec-job-2', 'REC00002', emp_a, 'Ordningsvakt Kista', 'Door Supervisor Kista', 'internal', 'draft' FROM rw UNION ALL
SELECT job_draft, 'rec-job-d', 'REC0000D', emp_a, 'Utkast', 'Draft', 'internal', 'draft' FROM rw;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000b';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job_b, 'rec-job-b', 'REC0000B', emp_b, 'Väktare B', 'Guard B', 'internal', 'draft' FROM rw;
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP V — the vacancy frame'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000d';  -- a member may prepare it
SELECT public.rec_save_vacancy_structure(
  (SELECT job1 FROM rw),
  '[{"key":"r1","kind":"mandatory","label_sv":"Väktarutbildning","label_en":"Security officer training"},
    {"key":"r2","kind":"desirable","label_sv":"Körkort B","label_en":"Driving licence B"}]'::jsonb,
  '[{"requirement_key":"r1","prompt_sv":"Har du genomgått väktarutbildning?","prompt_en":"Have you completed security officer training?","answer_kind":"yes_no","is_required":true},
    {"prompt_sv":"Berätta kort om din erfarenhet.","prompt_en":"Briefly describe your experience.","answer_kind":"text","is_required":false}]'::jsonb);
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_requirements r, rw WHERE r.job_id = rw.job1) = 2
  AND (SELECT count(*) FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1) = 2,
  'V1 a member of the organisation writes the requirements and questions of a draft');
SELECT pg_temp.ok(
  (SELECT q.requirement_id = r.id FROM public.recruitment_questions q
     JOIN public.recruitment_requirements r ON r.job_id = q.job_id AND r.kind = 'mandatory', rw
    WHERE q.job_id = rw.job1 AND q.answer_kind = 'yes_no'),
  'V2 the qualification question is linked to the mandatory requirement it asks about');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000b';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_save_vacancy_structure(%L, '[]', '[]')$f$,
  (SELECT job1 FROM rw)), 'RECRUITMENT_NOT_FOUND',
  'V3 another organisation cannot write this vacancy''s frame, and is told it does not exist');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1) = 0,
  'V4 another organisation cannot read a DRAFT vacancy''s questions');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1) = 0,
  'V5 anon cannot read a draft''s questions');
RESET ROLE;

-- Publication, through the moderator seat. job_closed is born published with a
-- deadline that has passed.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-0000000000ad';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day',
       expires_at = now() + interval '30 days'
 WHERE id IN (SELECT job1 FROM rw UNION ALL SELECT job2 FROM rw UNION ALL SELECT job_b FROM rw);
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method,
                         status, published_at, deadline_at, expires_at)
SELECT job_closed, 'rec-job-c', 'REC0000C', emp_a, 'Stängd', 'Closed', 'internal', 'published',
       now() - interval '10 days', now() - interval '1 day', now() + interval '20 days' FROM rw;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1) = 2
  AND (SELECT count(*) FROM public.recruitment_requirements r, rw WHERE r.job_id = rw.job1) = 2,
  'V6 anon reads the questions and requirements of a PUBLISHED vacancy');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.job_application_answers', 'permission denied',
  'V7 anon cannot read candidate answers at all');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.recruitment_comments', 'permission denied',
  'V8 anon cannot read internal comments at all');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.recruitment_messages', 'permission denied',
  'V9 anon cannot read candidate messages at all');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP S — the candidate''s submission'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c01';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_submit_application(
    %L, %L, NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb)$f$,
  (SELECT app1 FROM rw), (SELECT job1 FROM rw)),
  'APPLICATION_ANSWERS_MISSING',
  'S1 an application that leaves the required question unanswered is refused');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.job_applications a, rw WHERE a.id = rw.app1),
  'S2 and no application row survives the refusal');

CREATE TEMP TABLE s_res ON COMMIT DROP AS
SELECT public.rec_submit_application(
  (SELECT app1 FROM rw), (SELECT job1 FROM rw), NULL, 'Hej', 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(
    jsonb_build_object('question_id', (SELECT q.id FROM public.recruitment_questions q, rw
                                        WHERE q.job_id = rw.job1 AND q.answer_kind = 'yes_no'),
                       'answer_bool', true),
    jsonb_build_object('question_id', (SELECT q.id FROM public.recruitment_questions q, rw
                                        WHERE q.job_id = rw.job1 AND q.answer_kind = 'text'),
                       'answer_text', '  Fem år inom bevakning.  '))) AS r;
SELECT pg_temp.ok((SELECT (r->>'replayed')::boolean = false FROM s_res),
  'S3 a complete application is accepted');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_application_answers a, rw WHERE a.application_id = rw.app1) = 2
  AND (SELECT answer_text FROM public.job_application_answers a, rw
        WHERE a.application_id = rw.app1 AND a.answer_kind = 'text') = 'Fem år inom bevakning.'
  AND (SELECT employer_id FROM public.job_application_answers a, rw
        WHERE a.application_id = rw.app1 LIMIT 1) = (SELECT emp_a FROM rw)
  AND (SELECT prompt_sv_snapshot FROM public.job_application_answers a, rw
        WHERE a.application_id = rw.app1 AND a.answer_kind = 'yes_no') = 'Har du genomgått väktarutbildning?',
  'S4 answers are stamped from the question: organisation, kind and wording as asked');

SELECT pg_temp.ok(
  (SELECT (public.rec_submit_application(
     (SELECT app1 FROM rw), (SELECT job1 FROM rw), NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100,
     'upload', NULL, false, '[]'::jsonb)->>'replayed')::boolean),
  'S5 a retry with the same id is recognised as the same application');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications a, rw WHERE a.job_id = rw.job1 AND a.applicant_user_id = rw.cand1) = 1,
  'S6 and the retry did not create a second application');

SELECT pg_temp.must_fail(format($f$SELECT public.rec_submit_application(
    gen_random_uuid(), %L, NULL, NULL, 'x/cv2.pdf', 'cv.pdf', 100, 'upload', NULL, false,
    jsonb_build_array(jsonb_build_object('question_id', %L, 'answer_bool', true)))$f$,
  (SELECT job1 FROM rw),
  (SELECT q.id FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1 AND q.answer_kind = 'yes_no')),
  'job_applications_active_unique_idx',
  'S7 a second, different submission to the same vacancy is refused as a duplicate');

SELECT pg_temp.must_fail(format($f$INSERT INTO public.job_application_answers (application_id, question_id, answer_text)
    VALUES (%L, %L, 'efterhand')$f$,
  (SELECT app1 FROM rw),
  (SELECT q.id FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1 AND q.answer_kind = 'text')),
  'duplicate key',
  'S8 an answer cannot be written twice');

SELECT pg_temp.must_fail(format($f$SELECT public.rec_submit_application(
    gen_random_uuid(), %L, NULL, NULL, 'x/cv3.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb)$f$,
  (SELECT job_closed FROM rw)),
  'VACANCY_CLOSED',
  'S9 a vacancy past its deadline takes no application, whatever the page still shows');

-- The same person applies to a second vacancy, which has no questions.
SELECT public.rec_submit_application((SELECT app2 FROM rw), (SELECT job2 FROM rw), NULL, NULL,
  'x/cv4.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c02';
SELECT public.rec_submit_application((SELECT app3 FROM rw), (SELECT job1 FROM rw), NULL, NULL,
  'x/cv5.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1 AND q.answer_kind = 'yes_no'),
    'answer_bool', false)));
SELECT public.rec_submit_application((SELECT app_b FROM rw), (SELECT job_b FROM rw), NULL, NULL,
  'x/cv6.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb);
SELECT pg_temp.must_fail(format($f$INSERT INTO public.job_application_answers (application_id, question_id, answer_bool)
    VALUES (%L, %L, true)$f$,
  (SELECT app1 FROM rw),
  (SELECT q.id FROM public.recruitment_questions q, rw WHERE q.job_id = rw.job1 AND q.answer_kind = 'yes_no')),
  'row-level security',
  'S10 nobody writes answers onto somebody else''s application');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_application_answers a, rw WHERE a.application_id = rw.app1) = 0,
  'S11 a candidate cannot read another candidate''s answers');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000d';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_save_vacancy_structure(%L, '[]', '[]')$f$,
  (SELECT job1 FROM rw)), 'VACANCY_STRUCTURE_LOCKED',
  'V10 the frame locks once the first application has arrived');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP A — isolation'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000a';
SELECT public.rec_add_comment((SELECT app1 FROM rw), 'Stark kandidat, kolla referenser.');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_application_answers a, rw WHERE a.application_id IN (rw.app1, rw.app3)) = 3,
  'A1 organisation A reads the answers on its own applications');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_application_answers a, rw WHERE a.employer_id = rw.emp_a) = 0
  AND (SELECT count(*) FROM public.recruitment_comments c, rw WHERE c.employer_id = rw.emp_a) = 0,
  'A2 organisation B reads none of A''s answers or comments');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_add_comment(%L, 'intrång')$f$, (SELECT app1 FROM rw)),
  'APPLICATION_NOT_FOUND',
  'A3 organisation B cannot comment on A''s application, and is told it does not exist');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_mark_application_viewed(%L)$f$, (SELECT app1 FROM rw)),
  'APPLICATION_NOT_FOUND', 'A4 nor mark it opened');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_set_application_stage(%L, 'submitted', 'reviewing')$f$,
  (SELECT app1 FROM rw)), 'APPLICATION_NOT_FOUND', 'A5 nor move it');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c01';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_comments) = 0,
  'A6 the candidate never sees an internal comment about themselves');
SELECT pg_temp.must_fail('UPDATE public.recruitment_comments SET body = body', 'permission denied',
  'A7 no table in the workspace is directly writable by a signed-in user');
SELECT pg_temp.must_fail('DELETE FROM public.job_application_answers', 'permission denied',
  'A8 a candidate cannot delete their answers either');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP T — stages and decisions'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000d';
SELECT public.rec_mark_application_viewed((SELECT app1 FROM rw));
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, rw WHERE a.id = rw.app1) = 'submitted'
  AND (SELECT first_viewed_at IS NOT NULL FROM public.recruitment_application_meta m, rw WHERE m.application_id = rw.app1),
  'T1 opening an application records that it was opened and does NOT move its stage');

SELECT * FROM public.rec_set_application_stage((SELECT app1 FROM rw), 'submitted', 'reviewing', NULL);
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_set_application_stage(%L, 'submitted', 'reviewing')$f$,
  (SELECT app1 FROM rw)), 'STALE_APPLICATION_STAGE',
  'T2 a move made from a stale view is refused instead of silently repeated');
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, rw WHERE a.id = rw.app2) = 'submitted',
  'T3 moving the person''s application for vacancy 1 leaves vacancy 2 untouched');

SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_set_application_stage(%L, 'reviewing', 'rejected')$f$,
  (SELECT app1 FROM rw)), 'RECRUITMENT_DECISION_NOT_PERMITTED',
  'T4 a member who is not responsible for the recruitment cannot record a rejection');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.set_application_status(%L, 'rejected', NULL)$f$,
  (SELECT app1 FROM rw)), 'RECRUITMENT_DECISION_NOT_PERMITTED',
  'T5 nor by calling the canonical RPC directly, around every server function');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_recruitment_responsible(%L, %L)$f$,
  (SELECT job1 FROM rw), (SELECT member_a FROM rw)), 'RECRUITMENT_NOT_PERMITTED',
  'T6 a member cannot appoint themselves responsible');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000a';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_recruitment_responsible(%L, %L)$f$,
  (SELECT job1 FROM rw), (SELECT owner_b FROM rw)), 'RESPONSIBLE_NOT_A_MEMBER',
  'T7 the responsible person must belong to the organisation');
SELECT pg_temp.ok(
  public.rec_set_recruitment_responsible((SELECT job1 FROM rw), (SELECT member_a FROM rw)) = 2,
  'T8 the owner appoints a member responsible for this recruitment');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_recruitment_responsible(%L, %L, 1)$f$,
  (SELECT job1 FROM rw), (SELECT admin_a FROM rw)), 'STALE_VERSION',
  'T9 a colleague saving over a newer version is told so instead of overwriting it');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000d';
SELECT * FROM public.rec_set_application_stage((SELECT app3 FROM rw), 'submitted', 'rejected', 'Uppfyller inte kravet');
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, rw WHERE a.id = rw.app3) = 'rejected',
  'T10 once responsible, the same member records the decision');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000e';
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_set_application_stage(%L, 'submitted', 'rejected')$f$,
  (SELECT app2 FROM rw)), 'RECRUITMENT_DECISION_NOT_PERMITTED',
  'T11 responsibility is per recruitment: it gives nobody else decisions on vacancy 2');
SELECT * FROM public.rec_set_application_stage((SELECT app2 FROM rw), 'submitted', 'reviewing', NULL);
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, rw WHERE a.id = rw.app2) = 'reviewing',
  'T12 while review work stays open to the whole team');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP B — interview bookings'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000e';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_save_booking(NULL, %L, now() + interval '3 days', 45,
    'Mars/Olympus', 'video', NULL, 'https://meet.example/abc', NULL)$f$, (SELECT app1 FROM rw)),
  'BOOKING_TIMEZONE_INVALID', 'B1 a timezone that does not exist is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_save_booking(NULL, %L, now() + interval '3 days', 45,
    'Europe/Stockholm', 'video', NULL, NULL, NULL)$f$, (SELECT app1 FROM rw)),
  'recruitment_bookings_where', 'B2 a video interview needs a meeting link');
CREATE TEMP TABLE b1 ON COMMIT DROP AS
SELECT (public.rec_save_booking(NULL, (SELECT app1 FROM rw), date_trunc('hour', now()) + interval '3 days', 45,
  'Europe/Stockholm', 'video', NULL, 'https://meet.example/abc', 'Anna, Bo')->>'id')::uuid AS id;
GRANT SELECT ON b1 TO PUBLIC;
SELECT pg_temp.ok((SELECT status FROM public.recruitment_interview_bookings b, b1 WHERE b.id = b1.id) = 'planned',
  'B3 any team member can plan an interview time');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c01';
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_interview_bookings) = 0,
  'B4 the candidate does not see a time the organisation is still planning');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_respond_to_booking(%L, 'confirmed')$f$, (SELECT id FROM b1)),
  'BOOKING_NOT_FOUND', 'B5 nor answer an invitation that was never sent');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP M — candidate messages'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000e';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_save_message_draft(NULL, %L, 'general', 'Hej', 'Text', 'sv')$f$,
  (SELECT app1 FROM rw)), 'RECRUITMENT_NOT_PERMITTED',
  'M1 a member who is not responsible cannot write to candidates');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000d';  -- responsible for job1
CREATE TEMP TABLE m1 ON COMMIT DROP AS
SELECT public.rec_save_message_draft(NULL, (SELECT app1 FROM rw), 'interview_invitation',
  'Inbjudan till intervju', 'Välkommen på intervju.', 'sv', (SELECT id FROM b1), 'key-invite-app1-0001') AS id;
GRANT SELECT ON m1 TO PUBLIC;
SELECT pg_temp.ok(
  public.rec_save_message_draft(NULL, (SELECT app1 FROM rw), 'interview_invitation',
    'Inbjudan till intervju', 'Välkommen på intervju.', 'sv', (SELECT id FROM b1), 'key-invite-app1-0001')
  = (SELECT id FROM m1),
  'M2 the same idempotency key returns the same draft');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_save_message_draft(NULL, %L, 'general', 'X', 'Y', 'sv', NULL, 'key-invite-app1-0001')$f$,
  (SELECT app3 FROM rw)), 'MESSAGE_KEY_REUSED',
  'M3 a key cannot be reused to address a different application');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c01';
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_messages) = 0,
  'M4 the candidate never sees a draft');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000b';
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_message_send(%L)$f$, (SELECT id FROM m1)),
  'MESSAGE_NOT_FOUND', 'M5 another organisation cannot send it');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000d';
CREATE TEMP TABLE c1 ON COMMIT DROP AS SELECT * FROM public.rec_claim_message_send((SELECT id FROM m1));
SELECT pg_temp.ok(
  (SELECT outcome FROM c1) = 'claimed' AND (SELECT recipient_email FROM c1) = 'cand1@rec.test'
  AND (SELECT employer_name FROM c1) = 'Rekrytering A AB',
  'M6 claiming delivers the message and hands the server the address');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_message_send((SELECT id FROM m1))) = 'in_progress',
  'M7 a second click while the e-mail is in flight sends nothing more');
SELECT pg_temp.ok(public.rec_settle_message_send((SELECT id FROM m1), 'failed', 'HTTP_500') = 'failed',
  'M8 a provider failure is recorded as a failure');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_message_send((SELECT id FROM m1))) = 'claimed',
  'M9 a failed e-mail can be retried');
SELECT pg_temp.ok(public.rec_settle_message_send((SELECT id FROM m1), 'sent') = 'sent'
  AND public.rec_settle_message_send((SELECT id FROM m1), 'failed', 'late') = 'sent',
  'M10 a late settle cannot overwrite a delivered e-mail');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_message_send((SELECT id FROM m1))) = 'already_sent',
  'M11 once sent, another click answers already_sent');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_messages m, rw WHERE m.application_id = rw.app1) = 1
  AND (SELECT email_attempts FROM public.recruitment_messages m, m1 WHERE m.id = m1.id) = 2,
  'M12 retries and double-clicks produced ONE message and two recorded attempts');
SELECT pg_temp.ok((SELECT status FROM public.recruitment_interview_bookings b, b1 WHERE b.id = b1.id) = 'invited',
  'M13 delivering the invitation turned its booking into an invitation');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_save_booking(%L, %L, now() + interval '4 days', 45,
    'Europe/Stockholm', 'phone', NULL, NULL, NULL)$f$, (SELECT id FROM b1), (SELECT app1 FROM rw)),
  'BOOKING_NOT_EDITABLE', 'B6 an invitation the candidate holds cannot be moved underneath them');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c02';
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_messages) = 0
  AND (SELECT count(*) FROM public.recruitment_interview_bookings) = 0,
  'M14 another candidate sees neither the message nor the booking');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_respond_to_booking(%L, 'confirmed')$f$, (SELECT id FROM b1)),
  'BOOKING_NOT_FOUND', 'B7 nor answer somebody else''s invitation');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c01';
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_messages) = 1
  AND (SELECT count(*) FROM public.recruitment_interview_bookings) = 1,
  'M15 the candidate sees the delivered message and the booking it invites them to');
SELECT pg_temp.ok(public.rec_respond_to_booking((SELECT id FROM b1), 'confirmed') = 'confirmed',
  'B8 the candidate accepts the time');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP C — completing the recruitment'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000d';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_complete_recruitment(%L, 'completed')$f$, (SELECT job1 FROM rw)),
  'RECRUITMENT_STILL_ACCEPTING', 'C1 a recruitment still taking applications cannot be completed');
UPDATE public.jobs SET status = 'archived' WHERE id = (SELECT job1 FROM rw);
SELECT pg_temp.ok((SELECT status FROM public.jobs j, rw WHERE j.id = rw.job1) = 'archived',
  'C2 closing the advertisement is its own act');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_complete_recruitment(%L, 'completed')$f$, (SELECT job1 FROM rw)),
  'RECRUITMENT_HAS_UNRESOLVED', 'C3 a candidate without an outcome blocks completion; none is assigned for them');
SELECT * FROM public.rec_set_application_stage((SELECT app1 FROM rw), 'reviewing', 'rejected', NULL);
SELECT pg_temp.ok(public.rec_complete_recruitment((SELECT job1 FROM rw), 'completed', 'Tillsatt internt') > 0,
  'C4 with every candidate resolved, the responsible person completes it');
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, rw WHERE a.id = rw.app2) = 'reviewing',
  'C5 completing vacancy 1 did nothing to the same person''s application for vacancy 2');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_recruitment(%L)$f$, (SELECT job1 FROM rw)),
  'RECRUITMENT_NOT_PERMITTED', 'C6 a member cannot reopen a completed recruitment');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_comments c, rw WHERE c.application_id = rw.app1) = 1
  AND (SELECT count(*) FROM public.job_application_answers a, rw WHERE a.application_id = rw.app1) = 2,
  'C7 a completed recruitment stays readable to the team');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000c';
SELECT pg_temp.ok(public.rec_reopen_recruitment((SELECT job1 FROM rw)) > 0,
  'C8 an admin reopens it');
RESET ROLE; RESET request.jwt.claim.sub;

-- A withdrawn application counts as resolved.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-000000000c01';
SELECT * FROM public.set_application_status((SELECT app2 FROM rw), 'withdrawn', NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000a';
UPDATE public.jobs SET status = 'archived' WHERE id = (SELECT job2 FROM rw);
SELECT pg_temp.ok(public.rec_complete_recruitment((SELECT job2 FROM rw), 'cancelled', NULL) > 0,
  'C9 a withdrawn candidate is resolved, and a recruitment can be recorded as cancelled');
RESET ROLE; RESET request.jwt.claim.sub;

-- The whole surface, catalogued: nothing new is executable by anon.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'rec\_%'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  'Z1 no recruitment function is executable by anon');

ROLLBACK;
