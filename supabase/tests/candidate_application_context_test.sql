-- The candidate keeps the context of their own application -- JB-01, executed.
--
-- A candidate who applied to a vacancy that has since closed still gets the
-- job's title, the employer's name and (only while the advertisement is
-- public) its link -- through rec_my_application_context(), and ONLY for
-- their own applications. The public jobs and employers policies are
-- untouched: the closed advertisement stays invisible to a direct read.

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

-- ── People, organisation, two jobs, two applications ────────────────────
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('3b010000-0000-4000-8000-00000000000a', 'jb01-owner@test.invalid',       now()),
  ('3b010000-0000-4000-8000-00000000000c', 'jb01-candidate-a@test.invalid', now()),
  ('3b010000-0000-4000-8000-00000000000d', 'jb01-candidate-b@test.invalid', now());
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('3b010000-1111-4000-8000-00000000000a', 'JB01 Bevakning AB', 'jb01-bevakning', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('3b010000-1111-4000-8000-00000000000a', '3b010000-0000-4000-8000-00000000000a', 'owner', 'active', now());
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status) VALUES
  ('3b010000-2222-4000-8000-00000000000a', 'jb01-bevakning-vaktare-open',   'jb01op', '3b010000-1111-4000-8000-00000000000a', 'Väktare (öppen)',   'Security officer (open)',   'internal', 'draft'),
  ('3b010000-2222-4000-8000-00000000000b', 'jb01-bevakning-vaktare-closed', 'jb01cl', '3b010000-1111-4000-8000-00000000000a', 'Väktare (stängd)', 'Security officer (closed)', 'internal', 'draft');
ALTER TABLE public.jobs DISABLE TRIGGER USER;
UPDATE public.jobs SET status = 'published', published_at = now() - interval '10 days', expires_at = now() + interval '30 days'
 WHERE id = '3b010000-2222-4000-8000-00000000000a';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '40 days', expires_at = now() + interval '30 days'
 WHERE id = '3b010000-2222-4000-8000-00000000000b';
ALTER TABLE public.jobs ENABLE TRIGGER USER;
-- Applications go in while both jobs are live (the stamp trigger refuses a
-- closed job, which is the point of JB-01: the closing comes AFTER).
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at, created_at) VALUES
  ('3b010000-3333-4000-8000-00000000000a', '3b010000-2222-4000-8000-00000000000a', '3b010000-1111-4000-8000-00000000000a', '3b010000-0000-4000-8000-00000000000c', 'submitted', now(), now()),
  ('3b010000-3333-4000-8000-00000000000b', '3b010000-2222-4000-8000-00000000000b', '3b010000-1111-4000-8000-00000000000a', '3b010000-0000-4000-8000-00000000000c', 'reviewing', now() - interval '20 days', now() - interval '20 days'),
  ('3b010000-3333-4000-8000-00000000000c', '3b010000-2222-4000-8000-00000000000b', '3b010000-1111-4000-8000-00000000000a', '3b010000-0000-4000-8000-00000000000d', 'rejected',  now() - interval '20 days', now() - interval '20 days');
-- Then the second vacancy closes: expired and archived (the hosted case).
ALTER TABLE public.jobs DISABLE TRIGGER USER;
UPDATE public.jobs SET status = 'archived', expires_at = now() - interval '1 day', archived_at = now() - interval '1 day'
 WHERE id = '3b010000-2222-4000-8000-00000000000b';
ALTER TABLE public.jobs ENABLE TRIGGER USER;

-- ── GROUP 1: Candidate A ────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 1 — the applicant keeps the context'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b010000-0000-4000-8000-00000000000c';
SELECT pg_temp.ok((SELECT count(*) FROM public.jobs WHERE id = '3b010000-2222-4000-8000-00000000000b') = 0, '1.1 the closed advertisement is invisible to a direct read (public jobs policy untouched)');
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_my_application_context()) = 2, '1.2 the context read returns exactly the candidate''s two applications');
SELECT pg_temp.ok((SELECT title_sv FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000b') = 'Väktare (stängd)', '1.3 the closed job''s title survives');
SELECT pg_temp.ok((SELECT employer_name FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000b') = 'JB01 Bevakning AB', '1.4 and its employer');
SELECT pg_temp.ok((SELECT job_open FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000b') = false, '1.5 and it is reported closed (no link)');
SELECT pg_temp.ok((SELECT job_open FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000a') = true, '1.6 the open job is reported open');
SELECT pg_temp.ok((SELECT job_slug FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000a') = 'jb01-bevakning-vaktare-open', '1.7 with its slug');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000c'), '1.8 Candidate B''s application is not among them');
RESET ROLE;

-- ── GROUP 2: Candidate B, anon, and a closed employer ───────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 2 — everyone else'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b010000-0000-4000-8000-00000000000d';
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_my_application_context()) = 1, '2.1 Candidate B sees only their own');
SELECT pg_temp.ok((SELECT application_id FROM public.rec_my_application_context()) = '3b010000-3333-4000-8000-00000000000c', '2.2 and it is theirs');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM public.rec_my_application_context()', 'permission denied', '2.3 anon may not execute it');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b010000-0000-4000-8000-00000000000a';
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_my_application_context()) = 0, '2.4 an employer member with no application of their own gets nothing');
RESET ROLE;
-- Suspending the organisation goes through the guarded path, as in production.
ALTER TABLE public.employers DISABLE TRIGGER USER;
UPDATE public.employers SET status = 'suspended' WHERE id = '3b010000-1111-4000-8000-00000000000a';
ALTER TABLE public.employers ENABLE TRIGGER USER;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '3b010000-0000-4000-8000-00000000000c';
SELECT pg_temp.ok((SELECT job_open FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000a') = false, '2.5 a suspended employer''s open ad is reported closed, as the public policy says');
SELECT pg_temp.ok((SELECT employer_name FROM public.rec_my_application_context() WHERE application_id = '3b010000-3333-4000-8000-00000000000a') = 'JB01 Bevakning AB', '2.6 but the candidate still knows whom they applied to');
RESET ROLE;

ROLLBACK;
