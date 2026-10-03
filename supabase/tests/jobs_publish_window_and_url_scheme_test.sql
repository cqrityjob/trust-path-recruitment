-- Publishing needs a live window and a web address. Migration 20270131090000.
--
--   PW0  the fixture
--   PW1  an advert whose expires_at has passed cannot be PUBLISHED -- including
--        the restore -> publish route that used to publish an invisible ad
--   PW2  a deadline in the past is still refused at publication (pinned)
--   PW3  application_url must be an http(s) address when it is written
--   PW4  rows stored before the rule are tolerated, and checked when published
--   PW5  nothing legitimate got harder
--
-- Everything that asks "may THIS person do THIS to THAT row" runs as
-- `authenticated` with a JWT subject set. The negative controls in
-- scripts/db-test.sh put the previous body back and require this suite to fail
-- on PW1.x / PW3.x.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE 'ok  %', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(_sql text, _needle text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%' || _needle || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with "%"', _label, _msg;
    END IF;
    RAISE NOTICE 'ok  %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- it was allowed', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jid(_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a1d0000-2222-4000-8000-0000000000' || lpad(_n::text, 2, '0'))::uuid
$$;

-- M: an ordinary member of E.  A: a platform admin outside E.
INSERT INTO auth.users (id, email) VALUES
  ('7a1d0000-0000-4000-8000-000000000001','member@window.invalid'),
  ('7a1d0000-0000-4000-8000-000000000003','admin@window.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('7a1d0000-0000-4000-8000-000000000003','admin');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('7a1d0000-1111-4000-8000-000000000001','Fönster AB','pw-ab','active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('7a1d0000-1111-4000-8000-000000000001','7a1d0000-0000-4000-8000-000000000001','member','active',now());

-- Complete drafts. The number says what each one is for (see below).
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, description_sv, status,
   application_method, application_url, expires_at)
SELECT pg_temp.jid(n), '7a1d0000-1111-4000-8000-000000000001',
       'pw-job-' || n, 'pwjob' || lpad(n::text, 5, '0'),
       'Rubrik ' || n, 'Beskrivning ' || n, 'draft',
       'external', 'https://exempel.invalid/ansok/' || n, now() + interval '30 days'
  FROM generate_series(1, 30) n;

--  01 expired draft            02 restore -> publish (scenario A)
--  03 deadline in the past     04 future by a minute
--  05 89 days                  06 91 days (existing rule, pinned)
--  07 admin: pending past      08 admin: pending future
--  09 admin: already published, expired       10 internal job, no url
--  11 url scheme matrix        12 email job
--  13 legacy bad url, edited   14 legacy bad url, publish refused then fixed
--  15 legacy bad url, internal 31 legacy PUBLISHED bad url (inserted)
--  17 expires exactly now()    18 admin INSERT published, past
--  19 url written NULL/''      20 case/port/fragment

CREATE OR REPLACE FUNCTION pg_temp.as_member() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '7a1d0000-0000-4000-8000-000000000001', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '7a1d0000-0000-4000-8000-000000000003', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs WHERE employer_id = '7a1d0000-1111-4000-8000-000000000001') = 30
  AND (SELECT count(*) FROM public.jobs WHERE status <> 'draft'
        AND employer_id = '7a1d0000-1111-4000-8000-000000000001') = 0,
  'PW0.1 thirty complete drafts, all legitimately created');

-- PW0.2 Reproduction on the previous body (the real rollback, in a savepoint):
-- an expired advert publishes without a word, and a javascript: address passes.
DO $$ BEGIN RAISE NOTICE 'GROUP PW0 -- reproduction on the pre-fix body'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20270131090000_jobs_publish_window_and_url_scheme_rollback.sql
UPDATE public.jobs SET expires_at = now() - interval '2 days' WHERE id = pg_temp.jid(28);
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(28);
UPDATE public.jobs SET application_url = 'javascript:alert(document.domain)' WHERE id = pg_temp.jid(29);
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(29);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = pg_temp.jid(28)) = 'published'
  AND NOT (SELECT public.job_is_active(status, published_at, deadline_at, expires_at)
             FROM public.jobs WHERE id = pg_temp.jid(28)),
  'PW0.2 PRE-FIX: an advert with an expires_at in the past was PUBLISHED, and is not visible (scenario A)');
SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = pg_temp.jid(29)) = 'published'
  AND (SELECT application_url FROM public.jobs WHERE id = pg_temp.jid(29)) LIKE 'javascript:%'
  AND (SELECT public.job_is_active(status, published_at, deadline_at, expires_at)
         FROM public.jobs WHERE id = pg_temp.jid(29)),
  'PW0.3 PRE-FIX: a javascript: apply address was stored and published LIVE (scenario B)');
ROLLBACK TO SAVEPOINT before_fix;

-- ═══════════════════════════════════════════════════════════════════════════
-- PW1  An advert whose expires_at has passed cannot be published
-- ═══════════════════════════════════════════════════════════════════════════

-- Scenario A, step by step: publish, close, restore, let the date pass, publish.
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(2);
UPDATE public.jobs SET status = 'archived'  WHERE id = pg_temp.jid(2);
UPDATE public.jobs SET status = 'draft'     WHERE id = pg_temp.jid(2);
SELECT pg_temp.as_owner();
-- The stored expiry passes while the advert sits restored as a draft.
UPDATE public.jobs SET expires_at = now() - interval '2 days' WHERE id = pg_temp.jid(2);
UPDATE public.jobs SET expires_at = now() - interval '3 days' WHERE id = pg_temp.jid(1);

SELECT pg_temp.as_member();
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET status = ''published'' WHERE id = %L', pg_temp.jid(2)),
  'expires_at must be in the future to publish a job',
  'PW1.1 a RESTORED advert whose expires_at has passed cannot be published (it used to publish, invisibly)');
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET status = ''published'' WHERE id = %L', pg_temp.jid(1)),
  'expires_at must be in the future to publish a job',
  'PW1.2 nor can a draft whose expires_at is in the past');
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT bool_and(status = 'draft') FROM public.jobs WHERE id IN (pg_temp.jid(1), pg_temp.jid(2))),
  'PW1.3 both are still drafts, so the employer can correct the date');

-- ...and correcting the date is all it takes.
SELECT pg_temp.as_member();
UPDATE public.jobs SET expires_at = now() + interval '30 days' WHERE id = pg_temp.jid(2);
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(2);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT public.job_is_active(status, published_at, deadline_at, expires_at)
     FROM public.jobs WHERE id = pg_temp.jid(2)),
  'PW1.4 with a future date the restored advert publishes and is VISIBLE (job_is_active)');

-- The boundary: a minute ahead is fine; "now" is not; 89 days is fine; 91 is not.
SELECT pg_temp.as_owner();
UPDATE public.jobs SET expires_at = now() + interval '1 minute' WHERE id = pg_temp.jid(4);
UPDATE public.jobs SET expires_at = now() + interval '89 days'  WHERE id = pg_temp.jid(5);
UPDATE public.jobs SET expires_at = now() + interval '91 days'  WHERE id = pg_temp.jid(6);
UPDATE public.jobs SET expires_at = now()                       WHERE id = pg_temp.jid(17);
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'published' WHERE id IN (pg_temp.jid(4), pg_temp.jid(5));
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET status = ''published'' WHERE id = %L', pg_temp.jid(17)),
  'expires_at must be in the future to publish a job',
  'PW1.5 an expires_at that is not after now() is refused');
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET status = ''published'' WHERE id = %L', pg_temp.jid(6)),
  'expires_at cannot be more than 90 days after published_at',
  'PW1.6 the 90-day ceiling is still enforced (pinned)');
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT bool_and(status = 'published') FROM public.jobs WHERE id IN (pg_temp.jid(4), pg_temp.jid(5))),
  'PW1.7 a minute ahead and 89 days ahead both publish');

-- Every caller, not only members: a moderator publishing a pending advert.
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'pending_review' WHERE id IN (pg_temp.jid(7), pg_temp.jid(8));
SELECT pg_temp.as_owner();
UPDATE public.jobs SET expires_at = now() - interval '1 day' WHERE id = pg_temp.jid(7);
SELECT pg_temp.as_admin();
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET status = ''published'' WHERE id = %L', pg_temp.jid(7)),
  'expires_at must be in the future to publish a job',
  'PW1.8 a platform admin cannot publish an already-expired pending advert either');
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(8);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = pg_temp.jid(8)) = 'published'
  AND (SELECT status FROM public.jobs WHERE id = pg_temp.jid(7)) = 'pending_review',
  'PW1.9 ...while the moderator publishes the one with a future date');

-- Only the ACT of publishing is held to it. An advert that is already
-- published and has run past its date can still be corrected by a moderator.
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(9);
SELECT pg_temp.as_owner();
UPDATE public.jobs SET expires_at = now() - interval '1 day' WHERE id = pg_temp.jid(9);
SELECT pg_temp.as_admin();
UPDATE public.jobs SET description_sv = 'Rättad efter att datumet passerat' WHERE id = pg_temp.jid(9);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT description_sv FROM public.jobs WHERE id = pg_temp.jid(9)) = 'Rättad efter att datumet passerat',
  'PW1.10 an admin can still edit an already-published advert whose date has passed');
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'archived' WHERE id = pg_temp.jid(9);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = pg_temp.jid(9)) = 'archived',
  'PW1.11 ...and the member can still close it');

-- An admin INSERT of a published job with a past expiry is refused too.
SELECT pg_temp.as_admin();
SELECT pg_temp.must_fail(
  $q$INSERT INTO public.jobs (employer_id, slug, short_id, title_sv, description_sv, status,
       application_method, expires_at, published_at)
     VALUES ('7a1d0000-1111-4000-8000-000000000001','pw-ins-1','pwins00001','T','D','published',
             'internal', now() - interval '1 day', now() - interval '5 days')$q$,
  'expires_at must be in the future to publish a job',
  'PW1.12 inserting an already-expired published advert is refused');
SELECT pg_temp.as_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- PW2  A deadline in the past is refused at publication (existing rule, pinned)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.as_owner();
UPDATE public.jobs SET deadline_at = now() - interval '1 day' WHERE id = pg_temp.jid(3);
SELECT pg_temp.as_member();
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET status = ''published'' WHERE id = %L', pg_temp.jid(3)),
  'deadline_at must be on or after published_at',
  'PW2.1 a deadline in the past cannot be published');
SELECT pg_temp.as_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- PW3  application_url is an http(s) address when it is written
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.set_url(_n int, _url text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.jobs SET application_url = _url WHERE id = pg_temp.jid(_n);
END $$;

SELECT pg_temp.as_member();
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'javascript:alert(document.domain)'),
  'application_url must be an http or https address', 'PW3.1 javascript: is refused');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'JaVaScRiPt:alert(1)'),
  'application_url must be an http or https address', 'PW3.2 ...in any case');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'data:text/html,<script>alert(1)</script>'),
  'application_url must be an http or https address', 'PW3.3 data: is refused');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'file:///etc/passwd'),
  'application_url must be an http or https address', 'PW3.4 file: is refused');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'ftp://exempel.invalid/cv'),
  'application_url must be an http or https address', 'PW3.5 ftp: is refused');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', ' https://exempel.invalid/'),
  'application_url must be an http or https address',
  'PW3.6 leading whitespace is refused (a browser would strip it and read the scheme after it)');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', E'java\tscript:alert(1)'),
  'application_url must be an http or https address', 'PW3.7 a tab inside the scheme is refused');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'https://'),
  'application_url must be an http or https address', 'PW3.8 a scheme with no host is refused');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', '//exempel.invalid/ansok'),
  'application_url must be an http or https address', 'PW3.9 a scheme-relative address is refused');
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'exempel.invalid/ansok'),
  'application_url must be an http or https address', 'PW3.10 a bare host is refused');
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET application_url = %L, status = ''published'' WHERE id = %L',
         'javascript:alert(1)', pg_temp.jid(11)),
  'application_url must be an http or https address', 'PW3.11 nor can it be written in the same statement that publishes');
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT application_url FROM public.jobs WHERE id = pg_temp.jid(11)) = 'https://exempel.invalid/ansok/11',
  'PW3.12 none of those touched the stored address');

SELECT pg_temp.as_member();
SELECT pg_temp.set_url(11, 'HTTPS://Exempel.invalid/Ansok');
SELECT pg_temp.set_url(20, 'http://exempel.invalid:8080/p%20q?x=1#frag');
SELECT pg_temp.set_url(19, NULL);
SELECT pg_temp.set_url(19, '');
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT application_url FROM public.jobs WHERE id = pg_temp.jid(11)) = 'HTTPS://Exempel.invalid/Ansok'
  AND (SELECT application_url FROM public.jobs WHERE id = pg_temp.jid(20)) = 'http://exempel.invalid:8080/p%20q?x=1#frag'
  AND (SELECT application_url FROM public.jobs WHERE id = pg_temp.jid(19)) = '',
  'PW3.13 upper-case scheme, port, query and fragment are accepted; NULL and the empty string are not an address and are allowed');

-- Every caller: the database owner's INSERT, and an admin's, are held to it too.
SELECT pg_temp.must_fail(
  $q$INSERT INTO public.jobs (employer_id, slug, short_id, title_sv, status, application_method, application_url)
     VALUES ('7a1d0000-1111-4000-8000-000000000001','pw-ins-2','pwins00002','T','draft','external','javascript:alert(1)')$q$,
  'application_url must be an http or https address', 'PW3.14 an INSERT carrying javascript: is refused for every caller');
SELECT pg_temp.as_admin();
SELECT pg_temp.must_fail(format('SELECT pg_temp.set_url(11, %L)', 'javascript:alert(1)'),
  'application_url must be an http or https address', 'PW3.15 ...including a platform admin');
SELECT pg_temp.as_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- PW4  Rows stored before the rule are tolerated, and checked at publication
-- ═══════════════════════════════════════════════════════════════════════════
-- The three legacy rows are written with user triggers off, the way a row that
-- predates the rule exists. Nothing is rewritten by the migration.

SET LOCAL session_replication_role = replica;
UPDATE public.jobs SET application_url = 'javascript:legacy(1)'
 WHERE id IN (pg_temp.jid(13), pg_temp.jid(14), pg_temp.jid(15));
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, description_sv, status, application_method,
   application_url, expires_at, published_at)
VALUES (pg_temp.jid(31), '7a1d0000-1111-4000-8000-000000000001','pw-legacy-live','pwleg00031',
        'Äldre annons','Äldre text','published','external','javascript:legacy(2)',
        now() + interval '30 days', now() - interval '3 days');
SET LOCAL session_replication_role = origin;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs WHERE application_url LIKE 'javascript:legacy%') = 4,
  'PW4.0 four stored rows hold a non-http(s) address, as rows from before the rule would');

-- A legacy draft can be edited in any other column.
SELECT pg_temp.as_member();
UPDATE public.jobs SET title_sv = 'Äldre utkast, ny rubrik' WHERE id = pg_temp.jid(13);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT title_sv FROM public.jobs WHERE id = pg_temp.jid(13)) = 'Äldre utkast, ny rubrik',
  'PW4.1 a legacy draft is still editable in every other column');

-- ...and PUBLISHING it as an external job is refused until the address is fixed.
SELECT pg_temp.as_member();
SELECT pg_temp.must_fail(
  format('UPDATE public.jobs SET status = ''published'' WHERE id = %L', pg_temp.jid(14)),
  'Published external job requires an http or https application_url',
  'PW4.2 publishing a legacy external advert with a non-http(s) address is refused');
UPDATE public.jobs SET application_url = 'https://exempel.invalid/rattad' WHERE id = pg_temp.jid(14);
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(14);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok((SELECT status FROM public.jobs WHERE id = pg_temp.jid(14)) = 'published',
  'PW4.3 ...and it publishes once the address is fixed');

-- A legacy row whose method does not use the address is not blocked by it.
SELECT pg_temp.as_member();
UPDATE public.jobs SET application_method = 'internal' WHERE id = pg_temp.jid(15);
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(15);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok((SELECT status FROM public.jobs WHERE id = pg_temp.jid(15)) = 'published',
  'PW4.4 an internal-application advert is not held to a leftover address it never uses');

-- A legacy PUBLISHED row can still be closed, and moderated.
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'archived' WHERE id = pg_temp.jid(31);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok((SELECT status FROM public.jobs WHERE id = pg_temp.jid(31)) = 'archived',
  'PW4.5 a legacy published advert with such an address can still be closed');
SELECT pg_temp.as_admin();
UPDATE public.jobs SET description_sv = 'Moderatorns rättelse' WHERE id = pg_temp.jid(31);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok((SELECT description_sv FROM public.jobs WHERE id = pg_temp.jid(31)) = 'Moderatorns rättelse',
  'PW4.6 ...and a moderator can still edit any other column of it');

-- ═══════════════════════════════════════════════════════════════════════════
-- PW5  Nothing legitimate got harder
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.as_owner();
UPDATE public.jobs SET application_method = 'email', application_url = NULL,
       application_email = 'jobb@exempel.invalid' WHERE id = pg_temp.jid(12);
SELECT pg_temp.as_member();
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(12);
UPDATE public.jobs SET application_method = 'internal', application_url = NULL
 WHERE id = pg_temp.jid(10);
UPDATE public.jobs SET status = 'published' WHERE id = pg_temp.jid(10);
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT bool_and(status = 'published') FROM public.jobs WHERE id IN (pg_temp.jid(10), pg_temp.jid(12))),
  'PW5.1 an email advert and an internal advert (no address) publish exactly as before');

SELECT pg_temp.ok(
  (SELECT prosrc LIKE '%expires_at must be in the future to publish a job%'
      AND prosrc LIKE '%application_url must be an http or https address%'
      AND prosrc LIKE '%Published external job requires an http or https application_url%'
      AND prosrc LIKE '%Job is not in an employer-editable state%'
      FROM pg_proc WHERE proname = 'jobs_validate_before_write' AND pronamespace = 'public'::regnamespace),
  'PW5.2 the installed body carries the new rules and the earlier in-place refusal');

DO $$ BEGIN RAISE NOTICE 'jobs_publish_window_and_url_scheme suite complete'; END $$;

ROLLBACK;
