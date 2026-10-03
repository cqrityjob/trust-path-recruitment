-- A published (or closed) advertisement is not editable in place -- and every
-- legitimate move still works. Migration 20270130090000.
--
-- Everything that asks "may THIS person do THIS to THAT row" runs as
-- `authenticated` with a JWT subject set, never as the owner: the owner can do
-- anything and would prove nothing. NE0 reproduces the defect through the real
-- API role; the negative controls in scripts/db-test.sh put the pre-fix body
-- back and require this suite to fail on NE1.x.
--
-- Groups:
--   NE0  the premise: the policy and grants really do admit the write
--   NE1  a member cannot edit a live, closed or moderated advertisement
--   NE2  bookkeeping (updated_at) is still allowed
--   NE3  every legitimate transition still works
--   NE4  platform admins and the moderation path are untouched
--   NE5  sanctioned (SECURITY DEFINER / service) writers are untouched

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

-- A fingerprint of everything on the row except bookkeeping.
CREATE OR REPLACE FUNCTION pg_temp.fp(_id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT md5((to_jsonb(j) - 'updated_at')::text) FROM public.jobs j WHERE j.id = _id
$$;

-- ── Fixtures ──────────────────────────────────────────────────────────────
-- M: an ordinary member (NOT owner, NOT admin) of E1.   O: a member of E2.
-- A: a platform admin who belongs to no organisation.   MA: a member of E1
-- who is also a platform admin (the shape of the real buller-o-bang owner).

INSERT INTO auth.users (id, email) VALUES
  ('7a1c0000-0000-4000-8000-000000000001','member@noedit.invalid'),
  ('7a1c0000-0000-4000-8000-000000000002','other@noedit.invalid'),
  ('7a1c0000-0000-4000-8000-000000000003','admin@noedit.invalid'),
  ('7a1c0000-0000-4000-8000-000000000004','member-admin@noedit.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('7a1c0000-0000-4000-8000-000000000003','admin'),
  ('7a1c0000-0000-4000-8000-000000000004','admin');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('7a1c0000-1111-4000-8000-000000000001','Ingen Redigering AB','ne-ab','active'),
  ('7a1c0000-1111-4000-8000-000000000002','Annan Redigering AB','ne-annan','active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('7a1c0000-1111-4000-8000-000000000001','7a1c0000-0000-4000-8000-000000000001','member','active',now()),
  ('7a1c0000-1111-4000-8000-000000000001','7a1c0000-0000-4000-8000-000000000004','member','active',now()),
  ('7a1c0000-1111-4000-8000-000000000002','7a1c0000-0000-4000-8000-000000000002','member','active',now());

-- Every job starts as a complete draft, and is walked to its state by the real
-- transitions below -- the database refuses to create one in any other state.
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, description_sv, status,
   application_method, application_url, expires_at, deadline_at, salary_min)
SELECT ('7a1c0000-2222-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '7a1c0000-1111-4000-8000-000000000001',
       'ne-job-' || n, 'nejob' || lpad(n::text, 5, '0'),
       'Original rubrik ' || n, 'Original beskrivning ' || n, 'draft',
       'external', 'https://exempel.invalid/ansok/' || n,
       now() + interval '30 days', now() + interval '20 days', 30000
  FROM generate_series(1, 24) n;
-- one job of the other tenant
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, description_sv, status,
   application_method, expires_at)
VALUES ('7a1c0000-2222-4000-8000-0000000000f1','7a1c0000-1111-4000-8000-000000000002',
        'ne-annan-1','nejobf0001','Annan rubrik','Annan beskrivning','draft','internal',
        now() + interval '30 days');

-- Job numbering used below (E1 unless said otherwise):
--   01 published (member)        02 published, for the stale-bookkeeping case
--   03 archived                  04 pending_review (via member)
--   05 rejected (via admin)      06 published, admin edits it
--   07 draft stays draft         08 draft -> published (transition test)
--   09 draft -> pending_review   10 draft -> archived
--   11 rejected -> published     12 rejected -> pending_review
--   13 rejected -> archived      14 published -> archived
--   15 archived -> draft         16 published, definer writer
--   17 published, service_role   18 published, member+admin edits it
--   19 rejected stays rejected   20 pending_review, admin rejects it
--   21 published, admin rejects  22 draft -> published WITH content edit
--   23 draft, free edits         24 published, owner of the other tenant tries

CREATE OR REPLACE FUNCTION pg_temp.jid(_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a1c0000-2222-4000-8000-0000000000' || lpad(_n::text, 2, '0'))::uuid
$$;

-- ── Walk the jobs into their states, as the member and the admin ──────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '7a1c0000-0000-4000-8000-000000000001';
UPDATE public.jobs SET status = 'published'
 WHERE id IN (pg_temp.jid(1), pg_temp.jid(2), pg_temp.jid(3), pg_temp.jid(6), pg_temp.jid(14),
              pg_temp.jid(16), pg_temp.jid(17), pg_temp.jid(21), pg_temp.jid(24), pg_temp.jid(18));
UPDATE public.jobs SET status = 'archived' WHERE id = pg_temp.jid(3);
UPDATE public.jobs SET status = 'pending_review'
 WHERE id IN (pg_temp.jid(4), pg_temp.jid(5), pg_temp.jid(11), pg_temp.jid(12), pg_temp.jid(13),
              pg_temp.jid(19), pg_temp.jid(20));
RESET ROLE; RESET request.jwt.claim.sub;

-- 15 is archived through the member too (draft -> archived is allowed), then
-- restored by the transition test; it starts the suite closed.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '7a1c0000-0000-4000-8000-000000000001';
UPDATE public.jobs SET status = 'archived' WHERE id = pg_temp.jid(15);
RESET ROLE; RESET request.jwt.claim.sub;

-- 5, 11, 12, 13 and 19 are rejected by the admin, the only way a job is.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '7a1c0000-0000-4000-8000-000000000003';
DO $$
DECLARE _n int;
BEGIN
  FOREACH _n IN ARRAY ARRAY[5, 11, 12, 13, 19] LOOP
    PERFORM public.reject_job(pg_temp.jid(_n), 'Fixture: avvisad.');
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT string_agg(n::text || ':' || status, ',' ORDER BY n)
     FROM (SELECT right(id::text, 2)::int AS n, status FROM public.jobs
            WHERE employer_id = '7a1c0000-1111-4000-8000-000000000001'
              AND right(id::text, 2)::int IN (1,2,3,4,5,6,11,12,13,14,15,16,17,18,19,20,21,24)) s)
  = '1:published,2:published,3:archived,4:pending_review,5:rejected,6:published,11:rejected,'
    || '12:rejected,13:rejected,14:published,15:archived,16:published,17:published,'
    || '18:published,19:rejected,20:pending_review,21:published,24:published',
  'NE0.0 the fixtures reached the states the suite needs, by the real transitions');

-- ═══════════════════════════════════════════════════════════════════════════
-- NE0  The premise: the row policy and the grants admit the write.
--      (The trigger is the only thing between a member and the row.)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'jobs'
             AND policyname = 'jobs_employer_update_editable'
             AND qual LIKE '%published%' AND qual LIKE '%archived%')
  AND has_table_privilege('authenticated', 'public.jobs', 'UPDATE'),
  'NE0.1 the update policy admits published and archived rows and authenticated may UPDATE the table');

DO $$ BEGIN RAISE NOTICE 'GROUP NE0 -- reproduction on the pre-fix body'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20270130090000_jobs_not_editable_in_place_rollback.sql

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '7a1c0000-0000-4000-8000-000000000001';
UPDATE public.jobs
   SET title_sv = 'HACKAD rubrik (före rättelsen)', description_sv = 'HACKAD',
       application_method = 'external', application_url = 'https://phish.invalid/'
 WHERE id = pg_temp.jid(1);
UPDATE public.jobs SET title_sv = 'HACKAD arkiverad rubrik' WHERE id = pg_temp.jid(3);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT title_sv FROM public.jobs WHERE id = pg_temp.jid(1)) = 'HACKAD rubrik (före rättelsen)'
  AND (SELECT application_url FROM public.jobs WHERE id = pg_temp.jid(1)) = 'https://phish.invalid/'
  AND (SELECT title_sv FROM public.jobs WHERE id = pg_temp.jid(3)) = 'HACKAD arkiverad rubrik',
  'NE0.2 PRE-FIX: a member rewrote the title, text and apply link of a LIVE advertisement, and of an archived one, through the API');
ROLLBACK TO SAVEPOINT before_fix;

-- ═══════════════════════════════════════════════════════════════════════════
-- NE1  A member cannot edit a live, closed or moderated advertisement
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE ne_fp AS
SELECT n, pg_temp.fp(pg_temp.jid(n)) AS fp FROM generate_series(1, 24) n;

DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);

  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET title_sv = ''HACKAD rubrik'' WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.1 a member cannot rewrite the title of a LIVE advertisement');
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET description_sv = ''HACKAD beskrivning'', description_en = ''x'' WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.2 ...nor its description');
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET application_method = ''external'', application_url = ''https://phish.invalid/'' WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.3 ...nor where candidates are sent to apply');
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET expires_at = now() + interval ''80 days'' WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.4 ...nor stretch how long it stays live');
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET deadline_at = now() + interval ''25 days'' WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.5 ...nor its deadline');
  -- Columns the archive-immutability list never named: the rule is the whole
  -- row, so none of them is a way round it.
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET salary_min = 99999 WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.6 ...nor a column the archive list forgot (salary_min)');
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET slug = ''ne-job-1-new'' WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.7 ...nor its slug, which is the public address');
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET title_sv = ''HACKAD'', updated_at = now() WHERE id = pg_temp.jid(1)',
    'not in an employer-editable state',
    'NE1.8 ...and sending updated_at alongside does not make an edit a bookkeeping write');
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET title_sv = ''Redigerad medan arkiverad'' WHERE id = pg_temp.jid(3)',
    'not in an employer-editable state',
    'NE1.9 a member cannot edit an ARCHIVED advertisement either');
  EXECUTE 'RESET ROLE';
END $$;

-- None of that touched a row.
SELECT pg_temp.ok(
  (SELECT bool_and(pg_temp.fp(pg_temp.jid(n)) = f.fp) FROM ne_fp f WHERE f.n IN (1, 3)),
  'NE1.10 the live and the archived advertisement are byte-for-byte what they were');

-- pending_review is not reachable at all by the row policy: 0 rows, no change.
DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);
  UPDATE public.jobs SET title_sv = 'HACKAD' WHERE id = pg_temp.jid(4);
  GET DIAGNOSTICS _n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.ok(_n = 0, 'NE1.11 a legacy pending_review advertisement matches no row for the member (RLS)');
END $$;
SELECT pg_temp.ok(pg_temp.fp(pg_temp.jid(4)) = (SELECT fp FROM ne_fp WHERE n = 4),
  'NE1.12 ...and is unchanged');

-- The other tenant never reaches the row.
DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000002', true);
  UPDATE public.jobs SET title_sv = 'HACKAD' WHERE id = pg_temp.jid(24);
  GET DIAGNOSTICS _n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.ok(_n = 0, 'NE1.13 a member of ANOTHER organisation matches no row (tenant isolation intact)');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- NE2  Bookkeeping is still allowed
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);
  UPDATE public.jobs SET updated_at = now() WHERE id = pg_temp.jid(2);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE2.1 touching updated_at on a live advertisement is allowed');
  UPDATE public.jobs SET title_sv = title_sv, description_sv = description_sv, updated_at = now()
   WHERE id = pg_temp.jid(2);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE2.2 a write that changes no value is allowed');
  EXECUTE 'RESET ROLE';
END $$;
SELECT pg_temp.ok(pg_temp.fp(pg_temp.jid(2)) = (SELECT fp FROM ne_fp WHERE n = 2),
  'NE2.3 ...and nothing but bookkeeping moved');

-- ═══════════════════════════════════════════════════════════════════════════
-- NE3  Every legitimate transition still works, as the ordinary member
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.member_sets(_n int, _status text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);
  UPDATE public.jobs SET status = _status WHERE id = pg_temp.jid(_n);
  EXECUTE 'RESET ROLE';
  RETURN (SELECT status FROM public.jobs WHERE id = pg_temp.jid(_n));
END $$;

SELECT pg_temp.ok(pg_temp.member_sets(8, 'published') = 'published',
  'NE3.1 draft -> published');
SELECT pg_temp.ok(pg_temp.member_sets(9, 'pending_review') = 'pending_review',
  'NE3.2 draft -> pending_review');
SELECT pg_temp.ok(pg_temp.member_sets(10, 'archived') = 'archived',
  'NE3.3 draft -> archived');
SELECT pg_temp.ok(pg_temp.member_sets(11, 'published') = 'published',
  'NE3.4 rejected -> published');
SELECT pg_temp.ok(pg_temp.member_sets(12, 'pending_review') = 'pending_review',
  'NE3.5 rejected -> pending_review');
SELECT pg_temp.ok(pg_temp.member_sets(13, 'archived') = 'archived',
  'NE3.6 rejected -> archived');
SELECT pg_temp.ok(pg_temp.member_sets(14, 'archived') = 'archived',
  'NE3.7 published -> archived (the close action: status and updated_at only)');
SELECT pg_temp.ok(pg_temp.member_sets(15, 'draft') = 'draft',
  'NE3.8 archived -> draft (restore)');

-- The restored draft is editable again, and a rejected job is too.
DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);
  UPDATE public.jobs SET title_sv = 'Återställd och ändrad', description_sv = 'Ny text',
         expires_at = now() + interval '45 days', updated_at = now()
   WHERE id = pg_temp.jid(15);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE3.9 a restored draft is freely editable (title, text, dates)');
  UPDATE public.jobs SET title_sv = 'Korrigerad efter avvisning', updated_at = now()
   WHERE id = pg_temp.jid(19);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE3.10 a rejected job is freely editable so it can be corrected');
  UPDATE public.jobs SET title_sv = 'Utkast ändrat', application_method = 'internal',
         application_url = NULL, updated_at = now()
   WHERE id = pg_temp.jid(23);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE3.11 a draft is freely editable');
  -- Content change AND publication in the one statement: the draft was
  -- editable, and the publication gate judges the row that results.
  UPDATE public.jobs SET status = 'published', title_sv = 'Publicerad med ny rubrik',
         updated_at = now()
   WHERE id = pg_temp.jid(22);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE3.12 draft -> published may carry the final edit with it');
  EXECUTE 'RESET ROLE';
END $$;

-- The restored draft publishes again, and only THEN becomes uneditable.
SELECT pg_temp.ok(pg_temp.member_sets(15, 'published') = 'published',
  'NE3.13 restore -> publish again works');
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET title_sv = ''efter publicering'' WHERE id = pg_temp.jid(15)',
    'not in an employer-editable state',
    'NE3.14 ...and from then on it is not editable in place again');
  EXECUTE 'RESET ROLE';
END $$;

-- A member still cannot take a published job anywhere the allow-list forbids.
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''draft'' WHERE id = pg_temp.jid(16)',
    'Employers cannot change status from published to draft',
    'NE3.15 published -> draft is still refused by the allow-list');
  EXECUTE 'RESET ROLE';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- NE4  Platform admins and the moderation path are untouched
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000003', true);
  UPDATE public.jobs SET description_sv = 'Moderatorns rättelse', updated_at = now()
   WHERE id = pg_temp.jid(6);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE4.1 a platform admin can still correct a live advertisement');
  UPDATE public.jobs SET description_sv = 'Moderatorns rättelse', updated_at = now()
   WHERE id = pg_temp.jid(3);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, 'NE4.2 ...and an archived one');
  PERFORM public.reject_job(pg_temp.jid(20), 'Moderator: avvisad.');
  PERFORM public.reject_job(pg_temp.jid(21), 'Moderator: avvisad efter publicering.');
  EXECUTE 'RESET ROLE';
END $$;
SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = pg_temp.jid(20)) = 'rejected'
  AND (SELECT status FROM public.jobs WHERE id = pg_temp.jid(21)) = 'rejected',
  'NE4.3 reject_job() still moves a pending_review AND a published job to rejected');

DO $$
DECLARE _n int;
BEGIN
  -- Both an organisation member and a platform admin: the admin path applies.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000004', true);
  UPDATE public.jobs SET title_sv = 'Rättad av medlem som är admin', updated_at = now()
   WHERE id = pg_temp.jid(18);
  GET DIAGNOSTICS _n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.ok(_n = 1, 'NE4.4 a platform admin who is also a member keeps the admin path');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- NE5  Sanctioned writers are untouched
-- ═══════════════════════════════════════════════════════════════════════════
-- The rule is for a direct write through the API (current_user is a client
-- role). A SECURITY DEFINER function runs as its owner, which is how every
-- sanctioned writer -- reject_job above, any future one -- reaches the table.

CREATE FUNCTION public.ne_test_definer_edit(_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  UPDATE public.jobs SET description_sv = 'Skriven av en definer-funktion' WHERE id = _id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
GRANT EXECUTE ON FUNCTION public.ne_test_definer_edit(uuid) TO authenticated;

DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','7a1c0000-0000-4000-8000-000000000001', true);
  BEGIN
    _n := public.ne_test_definer_edit(pg_temp.jid(16));
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ASSERTION FAILED: NE5.1 a SECURITY DEFINER writer called by a member was refused: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.ok(_n = 1, 'NE5.1 a SECURITY DEFINER writer called by a member is not refused');
END $$;

DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    UPDATE public.jobs SET description_sv = 'Skriven av service_role' WHERE id = pg_temp.jid(17);
    GET DIAGNOSTICS _n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ASSERTION FAILED: NE5.2 service_role was refused: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.ok(_n = 1, 'NE5.2 service_role (the server''s own client) is not refused');
END $$;

-- And the installed body says what it should.
SELECT pg_temp.ok(
  (SELECT prosrc LIKE '%Job is not in an employer-editable state%'
      AND prosrc LIKE '%current_user IN (''authenticated'', ''anon'')%'
      AND prosrc LIKE '%Only status may change when archiving a published job%'
      FROM pg_proc WHERE proname = 'jobs_validate_before_write' AND pronamespace = 'public'::regnamespace),
  'NE5.3 the installed body carries the refusal next to the earlier guards');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs
    WHERE employer_id IN ('7a1c0000-1111-4000-8000-000000000001','7a1c0000-1111-4000-8000-000000000002')) = 25,
  'NE5.4 no job row was destroyed anywhere in this suite');

DO $$ BEGIN RAISE NOTICE 'jobs_not_editable_in_place suite complete'; END $$;

ROLLBACK;
