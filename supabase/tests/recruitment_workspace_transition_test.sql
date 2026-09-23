-- The recruitment workspace between its two halves.
--
-- Runs with 20261207090000 (EXPAND) applied and 20261208090000 (the
-- job_applications backstops, CONTRACT) NOT applied. That database state
-- happens twice in a release, and both times the application in front of it
-- is the OLD one -- the code on `main` before the recruitment workspace:
--
--   1. between the schema release and the application release;
--   2. after an application rollback, once the backstops' own rollback ran.
--
-- The old application reaches the database through exactly two calls this
-- suite reproduces: sp_submit_application_with_cv_source() from its apply
-- dialog, and set_application_status() from its decision buttons. Each must
-- behave as it did before the recruitment workspace existed, or fail with a
-- code the old application already turns into a TRUE sentence.
--
--   X · the old application's two calls
--   N · the new application's own path still holds both rules without the
--       backstops, so the EXPAND state is never a hole for the new code
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
-- Like the main suite's must_fail, but pins the SQLSTATE as well: the old
-- application reads only the code, so the code IS the user-visible sentence.
CREATE OR REPLACE FUNCTION pg_temp.must_fail_code(stmt text, needle text, code text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text; _state text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM; _state := SQLSTATE;
    IF position(needle in _msg) = 0 OR _state <> code THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%" (%), got "%" (%)', label, needle, code, _msg, _state;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail_code(text, text, text, text) TO PUBLIC;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.job_applications'::regclass
               AND tgname IN ('job_applications_decision_guard', 'job_applications_required_answers'))
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.job_applications'::regclass
               AND tgname = 'job_applications_window_guard'),
  'X0 the state under test: EXPAND applied, the two backstops not');

-- ---------------------------------------------------------------------------
-- Fixture: one organisation (owner, plain member), a moderator, one candidate.
-- job_q has a REQUIRED question; job_x is published but past its deadline.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tx AS
SELECT
  'af000000-1111-0000-0000-00000000000a'::uuid AS emp,
  'af000000-0000-0000-0000-00000000000a'::uuid AS owner_u,
  'af000000-0000-0000-0000-00000000000d'::uuid AS member_u,
  'af000000-0000-0000-0000-0000000000ad'::uuid AS moderator,
  'af000000-0000-0000-0000-000000000c01'::uuid AS cand,
  'af000000-2222-0000-0000-000000000001'::uuid AS job_q,
  'af000000-2222-0000-0000-000000000002'::uuid AS job_x,
  'af000000-2222-0000-0000-000000000003'::uuid AS job_n,
  'af000000-3333-0000-0000-000000000001'::uuid AS app_old,
  'af000000-3333-0000-0000-000000000003'::uuid AS app_new;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_u,   'tx-owner@rec.test',  now() FROM tx UNION ALL
SELECT member_u,  'tx-member@rec.test', now() FROM tx UNION ALL
SELECT moderator, 'tx-mod@rec.test',    now() FROM tx UNION ALL
SELECT cand,      'tx-cand@rec.test',   now() FROM tx;
INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM tx;
INSERT INTO public.employers (id, name, slug, status) SELECT emp, 'Övergång AB', 'overgang-rec', 'active' FROM tx;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT emp, owner_u,  'owner',  'active' FROM tx UNION ALL
SELECT emp, member_u, 'member', 'active' FROM tx;
GRANT SELECT ON tx TO PUBLIC;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-0000-0000-0000-00000000000a';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job_q, 'tx-job-q', 'TXREC001', emp, 'Väktare med frågor', 'Guard with questions', 'internal', 'draft' FROM tx UNION ALL
SELECT job_n, 'tx-job-n', 'TXREC003', emp, 'Väktare med frågor 2', 'Guard with questions 2', 'internal', 'draft' FROM tx;
SELECT public.rec_save_vacancy_structure((SELECT job_q FROM tx), '[]'::jsonb,
  '[{"prompt_sv":"Har du väktarutbildning?","prompt_en":"Security officer training?","answer_kind":"yes_no","is_required":true}]'::jsonb);
SELECT public.rec_save_vacancy_structure((SELECT job_n FROM tx), '[]'::jsonb,
  '[{"prompt_sv":"Har du väktarutbildning?","prompt_en":"Security officer training?","answer_kind":"yes_no","is_required":true}]'::jsonb);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-0000-0000-0000-0000000000ad';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day',
       expires_at = now() + interval '30 days'
 WHERE id IN (SELECT job_q FROM tx UNION ALL SELECT job_n FROM tx);
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method,
                         status, published_at, deadline_at, expires_at)
SELECT job_x, 'tx-job-x', 'TXREC002', emp, 'Utgången', 'Expired', 'internal', 'published',
       now() - interval '10 days', now() - interval '1 day', now() + interval '20 days' FROM tx;
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP X — the old application''s two calls'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-0000-0000-0000-000000000c01';
SELECT public.sp_submit_application_with_cv_source(
  (SELECT app_old FROM tx), (SELECT job_q FROM tx), NULL, NULL, 'x/tx-cv.pdf', 'cv.pdf', 100,
  'upload', NULL, false);
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.job_applications a, tx WHERE a.id = tx.app_old AND a.status = 'submitted'),
  'X1 the old apply dialog still applies to a vacancy WITH a required question -- it cannot show questions, and nothing refuses it');
SELECT pg_temp.must_fail_code(format($f$SELECT public.sp_submit_application_with_cv_source(
    gen_random_uuid(), %L, NULL, NULL, 'x/tx-cv2.pdf', 'cv.pdf', 100, 'upload', NULL, false)$f$,
  (SELECT job_x FROM tx)), 'VACANCY_CLOSED', '23514',
  'X2 a vacancy past its deadline refuses the old dialog with 23514, which it already shows as "går inte längre att söka via CQrityjob"');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-0000-0000-0000-00000000000d';
SELECT * FROM public.set_application_status((SELECT app_old FROM tx), 'reviewing', NULL);
SELECT * FROM public.set_application_status((SELECT app_old FROM tx), 'rejected', NULL);
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, tx WHERE a.id = tx.app_old) = 'rejected',
  'X3 a plain member records a decision through the old buttons exactly as before -- no bare "could not update"');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP N — the new application''s path without the backstops'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-0000-0000-0000-000000000c01';
SELECT pg_temp.must_fail_code(format($f$SELECT public.rec_submit_application(
    %L, %L, NULL, NULL, 'x/tx-cv3.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb)$f$,
  (SELECT app_new FROM tx), (SELECT job_n FROM tx)), 'APPLICATION_ANSWERS_MISSING', '23514',
  'N1 the new apply path still refuses a missing required answer by itself');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.job_applications a, tx WHERE a.id = tx.app_new),
  'N2 and leaves no application row behind');
SELECT public.rec_submit_application((SELECT app_new FROM tx), (SELECT job_n FROM tx), NULL, NULL,
  'x/tx-cv3.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, tx WHERE q.job_id = tx.job_n), 'answer_bool', true)));
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.job_applications a, tx WHERE a.id = tx.app_new),
  'N3 and accepts it once answered');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-0000-0000-0000-00000000000d';
SELECT pg_temp.must_fail_code(format($f$SELECT * FROM public.rec_set_application_stage(%L, 'submitted', 'rejected')$f$,
  (SELECT app_new FROM tx)), 'RECRUITMENT_DECISION_NOT_PERMITTED', '42501',
  'N4 the new decision path still refuses a plain member by itself');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'af000000-0000-0000-0000-00000000000a';
SELECT * FROM public.rec_set_application_stage((SELECT app_new FROM tx), 'submitted', 'rejected', NULL);
UPDATE public.jobs SET status = 'archived' WHERE id = (SELECT job_n FROM tx);
SELECT public.rec_complete_recruitment((SELECT job_n FROM tx), 'completed', NULL);
SELECT pg_temp.must_fail_code(format($f$SELECT * FROM public.rec_set_application_stage(%L, 'rejected', 'reviewing')$f$,
  (SELECT app_new FROM tx)), 'RECRUITMENT_COMPLETED', '23514',
  'N5 and nothing moves in a completed recruitment through the new path');
RESET ROLE; RESET request.jwt.claim.sub;

ROLLBACK;
