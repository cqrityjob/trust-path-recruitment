-- The employer's note is the employer's -- JB-02, CONTRACT half, executed.
--
-- With 20261226090000 applied on top of the EXPAND half: Candidate A cannot
-- retrieve the employer-only note on their own application, nor the note on
-- their own status events, by column, by wildcard, or through the two
-- functions. Employer A still reads both through the functions and no longer
-- through the column. anon reads nothing. The service role is untouched. The
-- candidate's own idempotent resubmission (rec_submit_application, an invoker
-- read of their own row) still replays under the narrowed grant, every
-- candidate-visible column is still readable, and the candidate's writes are
-- unchanged.
--
-- auth.uid() resolves from request.jwt.claim.sub (SET LOCAL); the Postgres
-- ROLE is set where the grant is what matters.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

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
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement succeeded', label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

-- ── People and organisations ────────────────────────────────────────────
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('3b020000-0000-4000-8000-00000000000a', 'jb02-owner-a@test.invalid',  now()),
  ('3b020000-0000-4000-8000-00000000000b', 'jb02-owner-b@test.invalid',  now()),
  ('3b020000-0000-4000-8000-00000000000c', 'jb02-candidate@test.invalid', now()),
  ('3b020000-0000-4000-8000-00000000000d', 'jb02-admin@test.invalid',     now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('3b020000-0000-4000-8000-00000000000d', 'admin');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('3b020000-1111-4000-8000-00000000000a', 'JB02 Employer A', 'jb02-employer-a', 'active'),
  ('3b020000-1111-4000-8000-00000000000b', 'JB02 Employer B', 'jb02-employer-b', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('3b020000-1111-4000-8000-00000000000a', '3b020000-0000-4000-8000-00000000000a', 'owner', 'active', now()),
  ('3b020000-1111-4000-8000-00000000000b', '3b020000-0000-4000-8000-00000000000b', 'owner', 'active', now());
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
VALUES ('3b020000-2222-4000-8000-00000000000a', 'jb02-employer-a-vaktare-jb02a', 'jb02a',
        '3b020000-1111-4000-8000-00000000000a', 'Väktare', 'Security officer', 'internal', 'draft');
ALTER TABLE public.jobs DISABLE TRIGGER USER;
UPDATE public.jobs SET status = 'published', published_at = now(), expires_at = now() + interval '30 days'
 WHERE id = '3b020000-2222-4000-8000-00000000000a';
ALTER TABLE public.jobs ENABLE TRIGGER USER;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
VALUES ('3b020000-3333-4000-8000-00000000000a', '3b020000-2222-4000-8000-00000000000a',
        '3b020000-1111-4000-8000-00000000000a', '3b020000-0000-4000-8000-00000000000c', 'submitted', now());

-- Employer A moves the application with an internal note (the real write path).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b020000-0000-4000-8000-00000000000a';
SELECT public.set_application_status('3b020000-3333-4000-8000-00000000000a', 'reviewing', 'Internal: strong CV, check licence');
RESET ROLE;
SELECT pg_temp.ok((SELECT employer_note FROM public.job_applications WHERE id = '3b020000-3333-4000-8000-00000000000a') = 'Internal: strong CV, check licence', '0.1 the note is stored on the application');
SELECT pg_temp.ok((SELECT count(*) FROM public.job_application_status_events WHERE application_id = '3b020000-3333-4000-8000-00000000000a' AND note IS NOT NULL) = 1, '0.2 and on the status event');

-- ── GROUP 1: Candidate A ────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 1 — the applicant'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b020000-0000-4000-8000-00000000000c';
SELECT pg_temp.ok((SELECT status FROM public.job_applications WHERE id = '3b020000-3333-4000-8000-00000000000a') = 'reviewing', '1.1 the applicant still reads their own application and its status');
SELECT pg_temp.ok((SELECT new_status FROM public.job_application_status_events WHERE application_id = '3b020000-3333-4000-8000-00000000000a') = 'reviewing', '1.2 and their own status events with the new stage');
SELECT pg_temp.must_fail('SELECT employer_note FROM public.job_applications WHERE id = ''3b020000-3333-4000-8000-00000000000a''', 'permission denied', '1.3 Candidate A cannot retrieve employer_note');
SELECT pg_temp.must_fail('SELECT note FROM public.job_application_status_events WHERE application_id = ''3b020000-3333-4000-8000-00000000000a''', 'permission denied', '1.4 Candidate A cannot retrieve the status-event note');
SELECT pg_temp.must_fail('SELECT * FROM public.job_applications WHERE id = ''3b020000-3333-4000-8000-00000000000a''', 'permission denied', '1.5 nor through a wildcard select');
SELECT pg_temp.must_fail('SELECT * FROM public.rec_application_status_events(''3b020000-3333-4000-8000-00000000000a'')', 'REC_NOT_MEMBER', '1.6 nor through the employer''s timeline function');
SELECT pg_temp.must_fail('SELECT public.rec_application_employer_note(''3b020000-3333-4000-8000-00000000000a'')', 'REC_NOT_MEMBER', '1.7 nor through the employer''s note function');
-- The candidate's own idempotent resubmission is an invoker-level read of
-- their row. It must still replay under the narrowed grant.
SELECT pg_temp.ok((public.rec_submit_application('3b020000-3333-4000-8000-00000000000a', '3b020000-2222-4000-8000-00000000000a', '+46700000000', NULL, NULL, NULL, NULL) ->> 'replayed') = 'true', '1.8 the candidate''s resubmission still replays (rec_submit_application reads named fields, not *)');
RESET ROLE;

-- ── GROUP 2: Employer A ─────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 2 — the owning employer'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b020000-0000-4000-8000-00000000000a';
SELECT pg_temp.ok((SELECT note FROM public.rec_application_status_events('3b020000-3333-4000-8000-00000000000a') LIMIT 1) = 'Internal: strong CV, check licence', '2.1 Employer A reads its own note on the timeline through the function');
SELECT pg_temp.ok(public.rec_application_employer_note('3b020000-3333-4000-8000-00000000000a') = 'Internal: strong CV, check licence', '2.2 and the current note');
SELECT pg_temp.ok((SELECT count(*) FROM public.job_application_status_events WHERE application_id = '3b020000-3333-4000-8000-00000000000a') = 1, '2.3 the employer still reads the events table for stages');
SELECT pg_temp.must_fail('SELECT note FROM public.job_application_status_events WHERE application_id = ''3b020000-3333-4000-8000-00000000000a''', 'permission denied', '2.4 but not the note column directly -- the function is the only door');
RESET ROLE;

-- ── GROUP 3: anon and the service role ──────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 3 — anon and the service role'; END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT id FROM public.job_applications', 'permission denied', '3.1 anon reads no application');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.ok((SELECT employer_note FROM public.job_applications WHERE id = '3b020000-3333-4000-8000-00000000000a') IS NOT NULL, '3.2 the service role still reads employer_note');
SELECT pg_temp.ok((SELECT note FROM public.job_application_status_events WHERE application_id = '3b020000-3333-4000-8000-00000000000a') IS NOT NULL, '3.3 and the event note');
RESET ROLE;

-- ── GROUP 4: the candidate's own writes are unchanged ─────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 4 — writes unchanged'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b020000-0000-4000-8000-00000000000c';
SELECT public.set_application_status('3b020000-3333-4000-8000-00000000000a', 'withdrawn', NULL);
SELECT pg_temp.ok((SELECT status FROM public.job_applications WHERE id = '3b020000-3333-4000-8000-00000000000a') = 'withdrawn', '4.1 the candidate can still withdraw');
SELECT pg_temp.ok((SELECT count(*) FROM public.job_application_status_events WHERE application_id = '3b020000-3333-4000-8000-00000000000a') = 2, '4.2 and reads the second stage event');
RESET ROLE;
SELECT pg_temp.ok(has_table_privilege('authenticated', 'public.job_applications', 'INSERT'), '4.3 the candidate''s INSERT grant is untouched');

ROLLBACK;
