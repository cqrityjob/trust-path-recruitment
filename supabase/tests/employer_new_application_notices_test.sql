-- E-mail to the employer on a NEW application (20270205090000), proved by
-- EXECUTING every rule as the role that would really meet it.
--
--   F  · fixture        organisations with owners, admins, a plain member, a
--                       responsible person, and every membership state
--   EN1 · recipients    the responsible person beats owners/admins; otherwise
--                       active owners and admins; a plain member only when
--                       responsible; suspended / removed / invited members and
--                       organisations that are not active get nothing; a
--                       disabled, address-less or unconfirmed account is not
--                       written to; the cap; the address comes from auth.users
--   EN2 · privileges    no client role executes anything or touches the table;
--                       the server's own table privilege is read-only; no
--                       client-callable function returns an address
--   EN3 · enqueue       idempotent and set-once, never retroactive, never for a
--                       withdrawn or old application, kind-aware
--   EN4 · claim         atomic, leased, bounded, re-checks eligibility, hands
--                       over only what the mail needs; a sent row is never
--                       claimed again
--   EN5 · settle        only a claimed row, only for the attempt it names
--   EN6 · retry         retryable statuses, the attempt cap, the backoff, the
--                       23-hour window, the sweep across applications
--   EN7 · shape         constraints, cascade, nothing about the candidate
--   EN9 · another kind  a later migration widens the kind allow-list and the
--                       claim, settle and retention serve the new kind without
--                       being rewritten
--   EN8 · retention     settled rows older than 90 days go; a 89-day row and
--                       every pending, claimed or still-retryable row stay;
--                       no client role can call it; a purged row cannot cause
--                       a second notice
--
-- Everything is synthetic. The suite runs as the migration owner in ONE
-- transaction that ends in ROLLBACK, and moves the clock by writing the
-- timestamps a row would have (now() is fixed inside a transaction). The
-- concurrency proofs are in scripts/db-test.sh (two real sessions).

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
BEGIN;
-- An organisation's status moves only inside moderate_employer(); this suite
-- changes it directly, to put organisations in every state, so it sets the
-- marker that function sets (transaction-local, rolled back with the rest).
SELECT set_config('app.employer_moderation_in_progress', 'on', true);

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
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement succeeded', label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

-- The recipients of an application, as a sorted array of the fixture's short
-- names, for one-line comparisons.
CREATE OR REPLACE FUNCTION pg_temp.who(_app uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(u.email, ',' ORDER BY u.email), '')
    FROM public.rec_employer_notice_recipients(_app) r
    JOIN auth.users u ON u.id = r.recipient_user_id;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.who(uuid) TO PUBLIC;

DO $$ BEGIN RAISE NOTICE 'GROUP F — the fixture'; END $$;

-- ── People ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('e7000000-0000-0000-0000-000000000001', 'own1@en.test',    now(), '{"display_name":"Owner One","locale":"en"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000002', 'own2@en.test',    now(), '{"display_name":"Owner Two"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000003', 'adm1@en.test',    now(), '{"display_name":"Admin One"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000004', 'adm2@en.test',    now(), '{"display_name":"Admin Two"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000005', 'mem@en.test',     now(), '{"display_name":"Plain Member"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000006', 'resp@en.test',    now(), '{"display_name":"Responsible"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000007', 'susp@en.test',    now(), '{"display_name":"Suspended Admin"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000008', 'remo@en.test',    now(), '{"display_name":"Removed Admin"}'::jsonb),
  ('e7000000-0000-0000-0000-000000000009', 'invi@en.test',    now(), '{"display_name":"Invited Admin"}'::jsonb),
  ('e7000000-0000-0000-0000-00000000000a', NULL,              now(), '{"display_name":"No Address"}'::jsonb),
  ('e7000000-0000-0000-0000-00000000000b', 'unconf@en.test',  NULL,  '{"display_name":"Unconfirmed"}'::jsonb),
  ('e7000000-0000-0000-0000-00000000000c', 'banned@en.test',  now(), '{"display_name":"Disabled"}'::jsonb),
  ('e7000000-0000-0000-0000-00000000000d', 'platform@en.test', now(), '{"display_name":"Platform Admin"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000b1', 'ownb@en.test',    now(), '{"display_name":"Owner B"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000c1', 'memc@en.test',    now(), '{"display_name":"Member C"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000d1', 'ownd@en.test',    now(), '{"display_name":"Owner D"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000d2', 'respd@en.test',   now(), '{"display_name":"Responsible D"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000f1', 'ownf@en.test',    now(), '{"display_name":"Owner F"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000a1', 'owna@en.test',    now(), '{"display_name":"Owner Archived"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000e1', 'owne1@en.test',   now(), '{"display_name":"Owner E1"}'::jsonb),
  ('e7000000-0000-0000-0000-0000000000e2', 'owne2@en.test',   now(), '{"display_name":"Owner E2"}'::jsonb);
UPDATE auth.users SET banned_until = now() + interval '30 days'
 WHERE id = 'e7000000-0000-0000-0000-00000000000c';
INSERT INTO public.user_roles (user_id, role) VALUES ('e7000000-0000-0000-0000-00000000000d', 'admin');
-- Candidates: one address each, never present in any mail.
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT ('e7000000-0000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid,
       'cand' || i || '@en.test', now(), ('{"display_name":"Kandidat ' || i || '"}')::jsonb
  FROM generate_series(16, 31) AS i;   -- 0x10 .. 0x1f
-- Twelve admins for the cap.
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT ('e7000000-0000-0000-0000-0000000e' || lpad(i::text, 4, '0'))::uuid,
       'adme' || lpad(i::text, 2, '0') || '@en.test', now(), '{"display_name":"Admin E"}'::jsonb
  FROM generate_series(1, 12) AS i;

-- ── Organisations ──────────────────────────────────────────────────────────
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('e7000000-1111-0000-0000-00000000000a', 'Notis A AB',       'notis-a',  'active'),
  ('e7000000-1111-0000-0000-00000000000b', 'Notis B AB',       'notis-b',  'active'),
  ('e7000000-1111-0000-0000-00000000000c', 'Notis C AB',       'notis-c',  'active'),
  ('e7000000-1111-0000-0000-00000000000d', 'Notis D AB',       'notis-d',  'active'),
  ('e7000000-1111-0000-0000-00000000000e', 'Notis E AB',       'notis-e',  'active'),
  ('e7000000-1111-0000-0000-00000000000f', 'Notis F AB',       'notis-f',  'active'),
  ('e7000000-1111-0000-0000-0000000000a1', 'Notis Arkiv AB',   'notis-arkiv', 'active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_at) VALUES
  -- A: two owners, two admins, a plain member, the responsible person, and
  -- every state that must NOT be written to.
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000001', 'owner',  'active',    now() - interval '10 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000002', 'owner',  'active',    now() - interval '9 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 'admin',  'active',    now() - interval '8 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000004', 'admin',  'active',    now() - interval '7 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000005', 'member', 'active',    now() - interval '6 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000006', 'member', 'active',    now() - interval '5 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000007', 'admin',  'suspended', now() - interval '4 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000008', 'admin',  'removed',   now() - interval '4 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000009', 'admin',  'invited',   now() - interval '4 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000a', 'admin',  'active',    now() - interval '4 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000b', 'admin',  'active',    now() - interval '4 days'),
  ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000c', 'admin',  'active',    now() - interval '4 days'),
  -- B (suspended organisation), F (draft), Arkiv (archived): an active owner each.
  ('e7000000-1111-0000-0000-00000000000b', 'e7000000-0000-0000-0000-0000000000b1', 'owner',  'active',    now() - interval '3 days'),
  ('e7000000-1111-0000-0000-00000000000f', 'e7000000-0000-0000-0000-0000000000f1', 'owner',  'active',    now() - interval '3 days'),
  ('e7000000-1111-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-0000000000a1', 'owner',  'active',    now() - interval '3 days'),
  -- C: plain members only.
  ('e7000000-1111-0000-0000-00000000000c', 'e7000000-0000-0000-0000-0000000000c1', 'member', 'active',    now() - interval '3 days'),
  -- D: an owner, and a responsible person who is suspended.
  ('e7000000-1111-0000-0000-00000000000d', 'e7000000-0000-0000-0000-0000000000d1', 'owner',  'active',    now() - interval '3 days'),
  ('e7000000-1111-0000-0000-00000000000d', 'e7000000-0000-0000-0000-0000000000d2', 'member', 'suspended', now() - interval '3 days'),
  -- E: two owners and twelve admins (the cap).
  ('e7000000-1111-0000-0000-00000000000e', 'e7000000-0000-0000-0000-0000000000e1', 'owner',  'active',    now() - interval '30 days'),
  ('e7000000-1111-0000-0000-00000000000e', 'e7000000-0000-0000-0000-0000000000e2', 'owner',  'active',    now() - interval '29 days');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, created_at)
SELECT 'e7000000-1111-0000-0000-00000000000e',
       ('e7000000-0000-0000-0000-0000000e' || lpad(i::text, 4, '0'))::uuid,
       'admin', 'active', now() - interval '20 days' + (i || ' hours')::interval
  FROM generate_series(1, 12) AS i;

-- ── Vacancies and applications (written directly: this suite is about the
--    outbox, not about the submission, which has its own) ─────────────────────
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status) VALUES
  ('e7000000-2222-0000-0000-00000000000a', 'en-job-plain', 'EN00001', 'e7000000-1111-0000-0000-00000000000a', 'Väktare, Gävle',  'Security officer, Gävle', 'internal', 'draft'),
  ('e7000000-2222-0000-0000-00000000000b', 'en-job-resp',  'EN00002', 'e7000000-1111-0000-0000-00000000000a', 'Väktare, Luleå',  'Security officer, Luleå', 'internal', 'draft'),
  ('e7000000-2222-0000-0000-00000000000c', 'en-job-susp',  'EN00003', 'e7000000-1111-0000-0000-00000000000b', 'Väktare, B',      'Guard, B',                'internal', 'draft'),
  ('e7000000-2222-0000-0000-00000000000d', 'en-job-c',     'EN00004', 'e7000000-1111-0000-0000-00000000000c', 'Väktare, C',      'Guard, C',                'internal', 'draft'),
  ('e7000000-2222-0000-0000-00000000000e', 'en-job-d',     'EN00005', 'e7000000-1111-0000-0000-00000000000d', 'Väktare, D',      'Guard, D',                'internal', 'draft'),
  ('e7000000-2222-0000-0000-00000000000f', 'en-job-e',     'EN00006', 'e7000000-1111-0000-0000-00000000000e', 'Väktare, E',      'Guard, E',                'internal', 'draft'),
  ('e7000000-2222-0000-0000-0000000000f1', 'en-job-draft', 'EN00007', 'e7000000-1111-0000-0000-00000000000f', 'Väktare, F',      'Guard, F',                'internal', 'draft'),
  ('e7000000-2222-0000-0000-0000000000a1', 'en-job-arch',  'EN00008', 'e7000000-1111-0000-0000-0000000000a1', 'Väktare, Arkiv',  'Guard, Archive',          'internal', 'draft');
-- A responsible person for job_resp (a plain member), for job_d (suspended) and
-- for job_c (the only members there are plain ones, and none is responsible).
INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id) VALUES
  ('e7000000-2222-0000-0000-00000000000b', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000006'),
  ('e7000000-2222-0000-0000-00000000000e', 'e7000000-1111-0000-0000-00000000000d', 'e7000000-0000-0000-0000-0000000000d2');

ALTER TABLE public.job_applications DISABLE TRIGGER USER;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at) VALUES
  ('e7000000-3333-0000-0000-000000000001', 'e7000000-2222-0000-0000-00000000000a', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000010', 'submitted', now()),
  ('e7000000-3333-0000-0000-000000000002', 'e7000000-2222-0000-0000-00000000000b', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000010', 'submitted', now()),
  ('e7000000-3333-0000-0000-000000000003', 'e7000000-2222-0000-0000-00000000000c', 'e7000000-1111-0000-0000-00000000000b', 'e7000000-0000-0000-0000-000000000010', 'submitted', now()),
  ('e7000000-3333-0000-0000-000000000004', 'e7000000-2222-0000-0000-00000000000d', 'e7000000-1111-0000-0000-00000000000c', 'e7000000-0000-0000-0000-000000000010', 'submitted', now()),
  ('e7000000-3333-0000-0000-000000000005', 'e7000000-2222-0000-0000-00000000000e', 'e7000000-1111-0000-0000-00000000000d', 'e7000000-0000-0000-0000-000000000010', 'submitted', now()),
  ('e7000000-3333-0000-0000-000000000006', 'e7000000-2222-0000-0000-00000000000f', 'e7000000-1111-0000-0000-00000000000e', 'e7000000-0000-0000-0000-000000000010', 'submitted', now()),
  ('e7000000-3333-0000-0000-000000000007', 'e7000000-2222-0000-0000-0000000000f1', 'e7000000-1111-0000-0000-00000000000f', 'e7000000-0000-0000-0000-000000000010', 'submitted', now()),
  ('e7000000-3333-0000-0000-000000000008', 'e7000000-2222-0000-0000-0000000000a1', 'e7000000-1111-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-000000000010', 'submitted', now());
-- More applications to the plain vacancy, one per candidate, for the cases
-- that change an application's state.
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT ('e7000000-3333-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid,
       'e7000000-2222-0000-0000-00000000000a', 'e7000000-1111-0000-0000-00000000000a',
       ('e7000000-0000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid, 'submitted', now()
  FROM generate_series(17, 31) AS i;           -- 0x11 .. 0x1f
ALTER TABLE public.job_applications ENABLE TRIGGER USER;
-- Organisations that are not active (an operational guard refuses new vacancies
-- for them, so they are set after the vacancies exist).
UPDATE public.employers SET status = 'suspended' WHERE id = 'e7000000-1111-0000-0000-00000000000b';
UPDATE public.employers SET status = 'draft'     WHERE id = 'e7000000-1111-0000-0000-00000000000f';
UPDATE public.employers SET status = 'archived'  WHERE id = 'e7000000-1111-0000-0000-0000000000a1';

CREATE TEMP TABLE fx AS
SELECT 'e7000000-3333-0000-0000-000000000001'::uuid AS app_plain,
       'e7000000-3333-0000-0000-000000000002'::uuid AS app_resp,
       'e7000000-3333-0000-0000-000000000003'::uuid AS app_susp_org,
       'e7000000-3333-0000-0000-000000000004'::uuid AS app_members_only,
       'e7000000-3333-0000-0000-000000000005'::uuid AS app_resp_suspended,
       'e7000000-3333-0000-0000-000000000006'::uuid AS app_cap,
       'e7000000-3333-0000-0000-000000000007'::uuid AS app_draft_org,
       'e7000000-3333-0000-0000-000000000008'::uuid AS app_archived_org,
       'e7000000-1111-0000-0000-00000000000a'::uuid AS org_a;
GRANT SELECT ON fx TO PUBLIC;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications WHERE id::text LIKE 'e7000000-3333-%') = 23
  AND (SELECT count(*) FROM public.employer_memberships WHERE employer_id::text LIKE 'e7000000-1111-%') = 32,
  'F1 the fixture is in place: 23 applications, 32 memberships in seven organisations');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN1 — who is written to'; END $$;

SELECT pg_temp.ok(
  pg_temp.who((SELECT app_resp FROM fx)) = 'resp@en.test',
  'EN1.1 the responsible person is the only recipient, although owners and admins exist');
SELECT pg_temp.ok(
  (SELECT r.via FROM public.rec_employer_notice_recipients((SELECT app_resp FROM fx)) r) = 'responsible',
  'EN1.2 and a plain member is a recipient because they are responsible');
SELECT pg_temp.ok(
  pg_temp.who((SELECT app_plain FROM fx)) = 'adm1@en.test,adm2@en.test,own1@en.test,own2@en.test',
  'EN1.3 with no responsible person: all active owners and admins, and nobody else');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.rec_employer_notice_recipients((SELECT app_plain FROM fx)) r
               WHERE r.recipient_user_id IN (
                 'e7000000-0000-0000-0000-000000000005',    -- a plain member
                 'e7000000-0000-0000-0000-000000000006',    -- a member who is responsible for ANOTHER vacancy
                 'e7000000-0000-0000-0000-000000000007',    -- suspended
                 'e7000000-0000-0000-0000-000000000008',    -- removed
                 'e7000000-0000-0000-0000-000000000009',    -- invited
                 'e7000000-0000-0000-0000-00000000000d')),  -- a platform admin who is not a member
  'EN1.4 a plain member, a suspended, removed or invited member and a non-member platform admin are never recipients');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.rec_employer_notice_recipients((SELECT app_plain FROM fx)) r
               WHERE r.recipient_user_id IN (
                 'e7000000-0000-0000-0000-00000000000a',    -- no address
                 'e7000000-0000-0000-0000-00000000000b',    -- address never confirmed
                 'e7000000-0000-0000-0000-00000000000c')),  -- account disabled
  'EN1.5 an account with no address, an unconfirmed address or a disabled account is not written to');
SELECT pg_temp.ok(
  pg_temp.who((SELECT app_resp_suspended FROM fx)) = 'ownd@en.test',
  'EN1.6 a responsible person who has been suspended falls through to the active owners and admins');
UPDATE public.employer_memberships SET status = 'removed'
 WHERE employer_id = 'e7000000-1111-0000-0000-00000000000a' AND user_id = 'e7000000-0000-0000-0000-000000000006';
SELECT pg_temp.ok(
  pg_temp.who((SELECT app_resp FROM fx)) = 'adm1@en.test,adm2@en.test,own1@en.test,own2@en.test',
  'EN1.7 a responsible person who has been removed falls through the same way');
UPDATE public.employer_memberships SET status = 'active'
 WHERE employer_id = 'e7000000-1111-0000-0000-00000000000a' AND user_id = 'e7000000-0000-0000-0000-000000000006';
SELECT pg_temp.ok(
  pg_temp.who((SELECT app_susp_org FROM fx)) = ''
  AND pg_temp.who((SELECT app_draft_org FROM fx)) = ''
  AND pg_temp.who((SELECT app_archived_org FROM fx)) = '',
  'EN1.8 a suspended, draft or archived organisation has no recipient, though its owner is an active member');
SELECT pg_temp.ok(
  pg_temp.who((SELECT app_members_only FROM fx)) = '',
  'EN1.9 an organisation with only plain members and no responsible person has no recipient');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.rec_employer_notice_recipients((SELECT app_cap FROM fx))) = 10
  AND (SELECT count(*) FROM public.rec_employer_notice_recipients((SELECT app_cap FROM fx)) r WHERE r.via = 'owner') = 2
  AND (SELECT count(*) FROM public.rec_employer_notice_recipients((SELECT app_cap FROM fx)) r WHERE r.via = 'admin') = 8
  AND NOT EXISTS (SELECT 1 FROM public.rec_employer_notice_recipients((SELECT app_cap FROM fx)) r
                   WHERE r.recipient_user_id IN (
                     'e7000000-0000-0000-0000-0000000e0009', 'e7000000-0000-0000-0000-0000000e0010',
                     'e7000000-0000-0000-0000-0000000e0011', 'e7000000-0000-0000-0000-0000000e0012')),
  'EN1.10 fourteen owners and admins give TEN recipients: both owners first, then the eight longest-serving admins');
-- The address is auth.users.email, read at the moment of the call.
UPDATE auth.users SET email = 'own1-new@en.test' WHERE id = 'e7000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT r.recipient_email FROM public.rec_employer_notice_recipients((SELECT app_plain FROM fx)) r
    WHERE r.recipient_user_id = 'e7000000-0000-0000-0000-000000000001') = 'own1-new@en.test',
  'EN1.11 the address is auth.users.email, as it is when asked');
UPDATE auth.users SET email = 'own1@en.test' WHERE id = 'e7000000-0000-0000-0000-000000000001';
-- A person who is "responsible" here but only a member of ANOTHER organisation.
INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id)
VALUES ('e7000000-2222-0000-0000-00000000000a', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-0000000000c1');
SELECT pg_temp.ok(
  pg_temp.who((SELECT app_plain FROM fx)) = 'adm1@en.test,adm2@en.test,own1@en.test,own2@en.test',
  'EN1.12 a "responsible" person who is not a member of the application''s organisation is nobody');
DELETE FROM public.recruitment_settings WHERE job_id = 'e7000000-2222-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.rec_employer_notice_recipients('00000000-0000-0000-0000-000000000000')) = 0,
  'EN1.13 an application that does not exist has no recipient');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN2 — privileges'; END $$;

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.rec_employer_notice_recipients(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_employer_notice_recipients(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_enqueue_employer_new_application_notices(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_enqueue_employer_new_application_notices(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_claim_employer_notices(uuid,integer,text[])', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_claim_employer_notices(uuid,integer,text[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_settle_employer_notice(uuid,text,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_settle_employer_notice(uuid,text,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_employer_notice_backoff(integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_employer_notice_backoff(integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_purge_employer_notices(interval)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_purge_employer_notices(interval)', 'EXECUTE'),
  'EN2.1 neither anon nor authenticated can execute any of the six functions');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               WHERE p.pronamespace = 'public'::regnamespace
                 AND p.proname IN ('rec_employer_notice_recipients', 'rec_enqueue_employer_new_application_notices',
                                   'rec_claim_employer_notices', 'rec_settle_employer_notice', 'rec_employer_notice_backoff',
                                   'rec_purge_employer_notices')
                 AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
  'EN2.2 PUBLIC holds no EXECUTE on any of them');
SELECT pg_temp.ok(
  has_function_privilege('service_role', 'public.rec_employer_notice_recipients(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.rec_enqueue_employer_new_application_notices(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.rec_claim_employer_notices(uuid,integer,text[])', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.rec_settle_employer_notice(uuid,text,integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.rec_purge_employer_notices(interval)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.rec_employer_notice_backoff(integer)', 'EXECUTE'),
  'EN2.3 the server can execute the five entry points, and not the internal helper');
SELECT pg_temp.ok(
  (SELECT bool_and(p.prosecdef AND p.proconfig::text LIKE '%search_path=public, pg_temp%')
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('rec_employer_notice_recipients', 'rec_enqueue_employer_new_application_notices',
                        'rec_claim_employer_notices', 'rec_settle_employer_notice', 'rec_purge_employer_notices')),
  'EN2.4 each entry point is SECURITY DEFINER with a pinned search_path');
SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.recruitment_employer_notices', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.recruitment_employer_notices', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.recruitment_employer_notices', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.recruitment_employer_notices', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.recruitment_employer_notices', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.recruitment_employer_notices', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.recruitment_employer_notices', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.recruitment_employer_notices', 'DELETE'),
  'EN2.5 neither anon nor authenticated holds any privilege on the outbox');
SELECT pg_temp.ok(
  has_table_privilege('service_role', 'public.recruitment_employer_notices', 'SELECT')
  AND NOT has_table_privilege('service_role', 'public.recruitment_employer_notices', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.recruitment_employer_notices', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.recruitment_employer_notices', 'DELETE'),
  'EN2.6 the server may read the outbox and write it only through the functions');
SELECT pg_temp.ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c WHERE c.oid = 'public.recruitment_employer_notices'::regclass)
  AND NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.recruitment_employer_notices'::regclass),
  'EN2.7 row-level security is enabled and forced on the outbox, and there is no policy to widen it');

-- As the roles themselves.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e7000000-0000-0000-0000-000000000001';   -- an OWNER of the organisation
SELECT pg_temp.must_fail('SELECT count(*) FROM public.recruitment_employer_notices', 'permission denied',
  'EN2.8 an owner of the organisation cannot read the outbox');
SELECT pg_temp.must_fail('SELECT * FROM public.rec_employer_notice_recipients(''e7000000-3333-0000-0000-000000000001'')', 'permission denied',
  'EN2.9 nor ask who would be written to (the addresses)');
SELECT pg_temp.must_fail('SELECT public.rec_enqueue_employer_new_application_notices(''e7000000-3333-0000-0000-000000000001'')', 'permission denied',
  'EN2.10 nor queue a notice');
SELECT pg_temp.must_fail('SELECT * FROM public.rec_claim_employer_notices()', 'permission denied',
  'EN2.11 nor claim one');
SELECT pg_temp.must_fail('SELECT public.rec_settle_employer_notice(gen_random_uuid(), ''sent'', 200)', 'permission denied',
  'EN2.12 nor settle one as sent');
SELECT pg_temp.must_fail('SELECT public.rec_purge_employer_notices()', 'permission denied',
  'EN2.19 nor purge the outbox');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e7000000-0000-0000-0000-000000000010';   -- the CANDIDATE
SELECT pg_temp.must_fail('SELECT count(*) FROM public.recruitment_employer_notices', 'permission denied',
  'EN2.13 the candidate cannot read the outbox');
SELECT pg_temp.must_fail('SELECT * FROM public.rec_claim_employer_notices()', 'permission denied',
  'EN2.14 the candidate cannot claim');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.recruitment_employer_notices', 'permission denied',
  'EN2.15 anon cannot read the outbox');
SELECT pg_temp.must_fail('SELECT * FROM public.rec_employer_notice_recipients(''e7000000-3333-0000-0000-000000000001'')', 'permission denied',
  'EN2.16 anon cannot ask for recipients');
SELECT pg_temp.must_fail('SELECT public.rec_purge_employer_notices()', 'permission denied',
  'EN2.20 anon cannot purge the outbox');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.must_fail('INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid())', 'permission denied',
  'EN2.17 even the server cannot write the outbox except through the functions');
RESET ROLE;
-- No function a client role may execute can return an address from the outbox
-- or from the recipient list.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p
               WHERE p.pronamespace = 'public'::regnamespace
                 AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                 AND (p.prosrc ILIKE '%recruitment_employer_notices%' OR p.prosrc ILIKE '%rec_employer_notice_recipients%')),
  'EN2.18 no function a client role can execute reads the outbox or the recipient list');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN3 — enqueue'; END $$;

SET LOCAL ROLE service_role;
CREATE TEMP TABLE e3a ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices((SELECT app_plain FROM fx)) AS n;
CREATE TEMP TABLE e3b ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices((SELECT app_plain FROM fx)) AS n;
RESET ROLE;
GRANT SELECT ON e3a, e3b TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM e3a) = 4
  AND (SELECT count(*) FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_plain FROM fx)) = 4
  AND (SELECT string_agg(u.email, ',' ORDER BY u.email)
         FROM public.recruitment_employer_notices n JOIN auth.users u ON u.id = n.recipient_user_id
        WHERE n.application_id = (SELECT app_plain FROM fx)) = 'adm1@en.test,adm2@en.test,own1@en.test,own2@en.test',
  'EN3.1 enqueue queues one notice per eligible recipient, and the call reports four');
SELECT pg_temp.ok(
  (SELECT bool_and(n.status = 'pending' AND n.attempts = 0 AND n.attempt_id IS NULL AND n.claimed_at IS NULL
                   AND n.sent_at IS NULL AND n.last_status IS NULL AND n.kind = 'new_application'
                   AND n.employer_id = (SELECT org_a FROM fx))
     FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_plain FROM fx)),
  'EN3.2 each is pending, untried, of kind new_application, and belongs to the organisation');
SELECT pg_temp.ok(
  (SELECT n FROM e3b) = 0
  AND (SELECT count(*) FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_plain FROM fx)) = 4,
  'EN3.3 a second call creates nothing: enqueue is idempotent');
-- The recipients change; the replay still creates nothing (set-once).
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('e7000000-0000-0000-0000-0000000000aa', 'adm3@en.test', now());
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-0000000000aa', 'admin', 'active');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE e3c ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices((SELECT app_plain FROM fx)) AS n;
RESET ROLE;
GRANT SELECT ON e3c TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM e3c) = 0
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n
                   WHERE n.application_id = (SELECT app_plain FROM fx)
                     AND n.recipient_user_id = 'e7000000-0000-0000-0000-0000000000aa'),
  'EN3.4 a replay after the recipients changed adds nobody: the set is fixed by the first enqueue');
DELETE FROM public.employer_memberships WHERE user_id = 'e7000000-0000-0000-0000-0000000000aa';
DELETE FROM auth.users WHERE id = 'e7000000-0000-0000-0000-0000000000aa';
SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, kind)
    SELECT application_id, employer_id, recipient_user_id, kind FROM public.recruitment_employer_notices LIMIT 1$$,
  'recruitment_employer_notices_once',
  'EN3.5 the table itself refuses a second row for the same application, recipient and kind');
SELECT pg_temp.ok(
  (SELECT array_agg(a.attname::text ORDER BY k.ord)
     FROM pg_constraint c
     JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.conname = 'recruitment_employer_notices_once' AND c.contype = 'u')
    = ARRAY['application_id', 'recipient_user_id', 'kind'],
  'EN3.6 the unique key is (application, recipient, kind): another kind of notice can share the table');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, kind)
    VALUES ('e7000000-3333-0000-0000-000000000001', 'e7000000-1111-0000-0000-00000000000a',
            'e7000000-0000-0000-0000-000000000005', 'candidate_replied')$$,
  'recruitment_employer_notices_kind_check',
  'EN3.7 only the allow-listed kind exists today; nothing else can be queued');
SET LOCAL ROLE service_role;
SELECT pg_temp.must_fail(
  $$SELECT public.rec_enqueue_employer_new_application_notices('00000000-0000-0000-0000-000000000000')$$,
  'APPLICATION_NOT_FOUND', 'EN3.8 an application that does not exist is refused');
CREATE TEMP TABLE e3d ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices((SELECT app_resp FROM fx)) AS n,
       public.rec_enqueue_employer_new_application_notices((SELECT app_susp_org FROM fx)) AS n_inactive,
       public.rec_enqueue_employer_new_application_notices((SELECT app_members_only FROM fx)) AS n_members;
RESET ROLE;
GRANT SELECT ON e3d TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM e3d) = 1
  AND (SELECT n.recipient_user_id FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_resp FROM fx))
      = 'e7000000-0000-0000-0000-000000000006',
  'EN3.9 a recruitment with a responsible person queues exactly one notice, for that person');
SELECT pg_temp.ok(
  (SELECT n_inactive FROM e3d) = 0 AND (SELECT n_members FROM e3d) = 0
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n
                   WHERE n.application_id IN ((SELECT app_susp_org FROM fx), (SELECT app_members_only FROM fx))),
  'EN3.10 an inactive organisation, or one nobody in which may be written to, queues nothing and does not fail');
-- Not retroactive: an old application, and a withdrawn one.
UPDATE public.job_applications SET created_at = now() - interval '2 hours'
 WHERE id = 'e7000000-3333-0000-0000-000000000011';
UPDATE public.job_applications SET status = 'withdrawn', withdrawn_at = now()
 WHERE id = 'e7000000-3333-0000-0000-000000000012';
UPDATE public.job_applications SET status = 'reviewing'
 WHERE id = 'e7000000-3333-0000-0000-00000000001f';
SET LOCAL ROLE service_role;
CREATE TEMP TABLE e3e ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices('e7000000-3333-0000-0000-000000000011') AS n_old,
       public.rec_enqueue_employer_new_application_notices('e7000000-3333-0000-0000-000000000012') AS n_withdrawn,
       public.rec_enqueue_employer_new_application_notices('e7000000-3333-0000-0000-00000000001f') AS n_moved;
RESET ROLE;
GRANT SELECT ON e3e TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n_old FROM e3e) = 0 AND (SELECT n_withdrawn FROM e3e) = 0 AND (SELECT n_moved FROM e3e) = 0
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n
                   WHERE n.application_id IN ('e7000000-3333-0000-0000-000000000011', 'e7000000-3333-0000-0000-000000000012',
                                              'e7000000-3333-0000-0000-00000000001f')),
  'EN3.11 an application older than an hour, a withdrawn one, or one an employer has already moved, is not announced');
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recruitment_employer_notices'
      AND column_name IN ('email', 'recipient_email', 'address', 'display_name', 'name', 'phone', 'cover_note', 'body', 'subject', 'response')) = 0,
  'EN3.12 the outbox has no column for an address, a name, a text or a provider response');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN4 — claim'; END $$;

-- What a claim hands over, for the application with four recipients.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c1 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_plain FROM fx));
RESET ROLE;
GRANT SELECT ON c1 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c1) = 4
  AND (SELECT count(DISTINCT attempt_id) FROM c1) = 4
  AND (SELECT bool_and(attempts = 1 AND kind = 'new_application' AND application_id = (SELECT app_plain FROM fx)) FROM c1),
  'EN4.1 a claim hands over every due notice of the application, one attempt each');
SELECT pg_temp.ok(
  (SELECT string_agg(recipient_email, ',' ORDER BY recipient_email) FROM c1) = 'adm1@en.test,adm2@en.test,own1@en.test,own2@en.test'
  AND (SELECT bool_and(provider_key = 'employer-new-application:' || notice_id::text) FROM c1)
  AND (SELECT bool_and(employer_name = 'Notis A AB' AND employer_slug = 'notis-a') FROM c1),
  'EN4.2 the address is the account''s, the provider key is employer-new-application:<row id>, and the organisation is named');
SELECT pg_temp.ok(
  (SELECT language FROM c1 WHERE recipient_email = 'own1@en.test') = 'en'
  AND (SELECT job_title FROM c1 WHERE recipient_email = 'own1@en.test') = 'Security officer, Gävle'
  AND (SELECT language FROM c1 WHERE recipient_email = 'own2@en.test') = 'sv'
  AND (SELECT job_title FROM c1 WHERE recipient_email = 'own2@en.test') = 'Väktare, Gävle',
  'EN4.3 the language is the recipient''s own profile language (Swedish when none), and so is the vacancy title');
SELECT pg_temp.ok(
  (SELECT bool_and(n.status = 'claimed' AND n.attempts = 1 AND n.claimed_at IS NOT NULL AND n.attempt_id IS NOT NULL)
     FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_plain FROM fx)),
  'EN4.4 the rows are claimed, with a lease and an attempt id');
SELECT pg_temp.ok(
  (SELECT pg_get_function_result('public.rec_claim_employer_notices(uuid,integer,text[])'::regprocedure)) !~* '(applicant|candidate|display_name|cover|phone|cv_|answer|passport)',
  'EN4.5 nothing the claim returns can name the candidate: no applicant, name, cover note, phone, CV or answer');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c2 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_plain FROM fx));
CREATE TEMP TABLE c2b ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices(NULL, 50);
RESET ROLE;
GRANT SELECT ON c2, c2b TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c2) = 0
  AND NOT EXISTS (SELECT 1 FROM c2b WHERE application_id = (SELECT app_plain FROM fx)),
  'EN4.6 a second claim straight after, by application or by sweep, gets nothing: the lease holds');
-- Another application's notices: a claim for NULL takes them, a claim for a
-- kind the worker cannot render does not.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE e4 ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices((SELECT app_cap FROM fx)) AS n;
CREATE TEMP TABLE c3 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_cap FROM fx), 10, ARRAY['candidate_replied']);
CREATE TEMP TABLE c3b ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_cap FROM fx), 3, ARRAY['new_application']);
RESET ROLE;
GRANT SELECT ON e4, c3, c3b TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM e4) = 10 AND (SELECT count(*) FROM c3) = 0,
  'EN4.7 a worker that can render only another kind is handed nothing');
SELECT pg_temp.ok(
  (SELECT count(*) FROM c3b) = 3
  AND (SELECT count(*) FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_cap FROM fx) AND n.status = 'pending') = 7,
  'EN4.8 the limit bounds a claim: three taken, seven left pending');
-- Lease expiry: the worker that held them died.
UPDATE public.recruitment_employer_notices SET claimed_at = now() - interval '4 minutes'
 WHERE application_id = (SELECT app_plain FROM fx);
CREATE TEMP TABLE prior_attempts ON COMMIT DROP AS
SELECT id, attempt_id FROM public.recruitment_employer_notices WHERE application_id = (SELECT app_plain FROM fx);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c4 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_plain FROM fx));
RESET ROLE;
GRANT SELECT ON prior_attempts, c4 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c4) = 4
  AND (SELECT bool_and(attempts = 2) FROM c4)
  AND NOT EXISTS (SELECT 1 FROM c4 JOIN prior_attempts p ON p.id = c4.notice_id AND p.attempt_id = c4.attempt_id),
  'EN4.9 a claim whose lease expired is taken over, as a second attempt under a NEW attempt id');
SELECT pg_temp.ok(
  (SELECT bool_and(c4.provider_key = c1.provider_key) FROM c4 JOIN c1 ON c1.notice_id = c4.notice_id),
  'EN4.10 and the provider key does not change between attempts, so the provider can deduplicate');

-- A sent row is never claimed again, and neither is a skipped one.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s1 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice(attempt_id, 'sent', 200) AS r, notice_id FROM c4 WHERE recipient_email = 'own1@en.test';
RESET ROLE;
GRANT SELECT ON s1 TO PUBLIC;
UPDATE public.recruitment_employer_notices
   SET claimed_at = now() - interval '1 day', next_attempt_at = now() - interval '1 day'
 WHERE id = (SELECT notice_id FROM s1);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c5 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices(NULL, 50);
RESET ROLE;
GRANT SELECT ON c5 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM s1) = 'sent'
  AND NOT EXISTS (SELECT 1 FROM c5 WHERE notice_id = (SELECT notice_id FROM s1))
  AND (SELECT n.status || '/' || n.attempts FROM public.recruitment_employer_notices n WHERE n.id = (SELECT notice_id FROM s1)) = 'sent/2',
  'EN4.11 a sent row is never claimed again, however old its timestamps are');

-- Eligibility is decided again at the claim.
UPDATE public.employer_memberships SET status = 'suspended'
 WHERE employer_id = 'e7000000-1111-0000-0000-00000000000a' AND user_id = 'e7000000-0000-0000-0000-000000000004';
UPDATE public.recruitment_employer_notices SET claimed_at = now() - interval '4 minutes'
 WHERE application_id = (SELECT app_plain FROM fx) AND status = 'claimed';
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c6 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_plain FROM fx));
RESET ROLE;
GRANT SELECT ON c6 TO PUBLIC;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM c6 WHERE recipient_email = 'adm2@en.test')
  AND (SELECT count(*) FROM c6) = 2
  AND (SELECT n.status || '/' || n.skip_reason FROM public.recruitment_employer_notices n
        WHERE n.application_id = (SELECT app_plain FROM fx) AND n.recipient_user_id = 'e7000000-0000-0000-0000-000000000004')
      = 'skipped/RECIPIENT_NOT_ELIGIBLE',
  'EN4.12 a person suspended after the notice was queued is skipped, and their address is not handed over');
UPDATE public.employer_memberships SET status = 'active'
 WHERE employer_id = 'e7000000-1111-0000-0000-00000000000a' AND user_id = 'e7000000-0000-0000-0000-000000000004';
UPDATE public.recruitment_employer_notices SET claimed_at = now() - interval '4 minutes', next_attempt_at = now() - interval '1 day'
 WHERE application_id = (SELECT app_plain FROM fx) AND status = 'claimed';
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c7 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_plain FROM fx));
RESET ROLE;
GRANT SELECT ON c7 TO PUBLIC;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM c7 WHERE recipient_email = 'adm2@en.test'),
  'EN4.13 and a skipped row stays skipped when the person is back: a skip is final');
-- A withdrawn application. (The sweep in EN4.6 took this application's notice
-- too, as it takes anything due: put it back to untried first.)
UPDATE public.recruitment_employer_notices
   SET status = 'pending', attempts = 0, attempt_id = NULL, claimed_at = NULL
 WHERE application_id = (SELECT app_resp FROM fx);
UPDATE public.job_applications SET status = 'withdrawn', withdrawn_at = now()
 WHERE id = (SELECT app_resp FROM fx);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c8 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app_resp FROM fx));
RESET ROLE;
GRANT SELECT ON c8 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c8) = 0
  AND (SELECT n.status || '/' || n.skip_reason FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_resp FROM fx))
      = 'skipped/APPLICATION_WITHDRAWN',
  'EN4.14 an application withdrawn before the notice went is skipped, not announced');
UPDATE public.job_applications SET status = 'submitted', withdrawn_at = NULL WHERE id = (SELECT app_resp FROM fx);
-- Organisation no longer active.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE e4b ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices('e7000000-3333-0000-0000-000000000013') AS n;
RESET ROLE;
GRANT SELECT ON e4b TO PUBLIC;
UPDATE public.employers SET status = 'suspended' WHERE id = (SELECT org_a FROM fx);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c9 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices('e7000000-3333-0000-0000-000000000013');
RESET ROLE;
GRANT SELECT ON c9 TO PUBLIC;
UPDATE public.employers SET status = 'active' WHERE id = (SELECT org_a FROM fx);
SELECT pg_temp.ok(
  (SELECT n FROM e4b) = 4 AND (SELECT count(*) FROM c9) = 0
  AND (SELECT count(*) FROM public.recruitment_employer_notices n
        WHERE n.application_id = 'e7000000-3333-0000-0000-000000000013' AND n.skip_reason = 'RECIPIENT_NOT_ELIGIBLE') = 4,
  'EN4.15 an organisation suspended after the notices were queued: all skipped, nothing handed over');
-- Never tried and too old.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE e4c ON COMMIT DROP AS
SELECT public.rec_enqueue_employer_new_application_notices('e7000000-3333-0000-0000-000000000014') AS n;
RESET ROLE;
GRANT SELECT ON e4c TO PUBLIC;
UPDATE public.recruitment_employer_notices SET created_at = now() - interval '24 hours'
 WHERE application_id = 'e7000000-3333-0000-0000-000000000014';
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c10 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices('e7000000-3333-0000-0000-000000000014');
RESET ROLE;
GRANT SELECT ON c10 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM e4c) = 4 AND (SELECT count(*) FROM c10) = 0
  AND (SELECT count(*) FROM public.recruitment_employer_notices n
        WHERE n.application_id = 'e7000000-3333-0000-0000-000000000014' AND n.status = 'skipped' AND n.skip_reason = 'EXPIRED') = 4,
  'EN4.16 a notice never tried within 23 hours is skipped as EXPIRED, not left pending for ever');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN5 — settle'; END $$;

-- c7 holds the two live claims (adm1, own2) for app_plain; c1, c4 and c6 hold the
-- earlier, now superseded, attempts.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s2 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice((SELECT attempt_id FROM c7 WHERE recipient_email = 'adm1@en.test'), 'sent', 202) AS r;
RESET ROLE;
GRANT SELECT ON s2 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM s2) = 'sent'
  AND (SELECT n.status || '/' || n.last_status || '/' || (n.sent_at IS NOT NULL)::text
        FROM public.recruitment_employer_notices n WHERE n.id = (SELECT notice_id FROM c7 WHERE recipient_email = 'adm1@en.test'))
      = 'sent/202/true',
  'EN5.1 settling a claimed row as sent records sent, the HTTP status and the time');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s3 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice((SELECT attempt_id FROM c7 WHERE recipient_email = 'adm1@en.test'), 'failed', 500) AS r;
RESET ROLE;
GRANT SELECT ON s3 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM s3) = 'sent'
  AND (SELECT n.status || '/' || n.last_status FROM public.recruitment_employer_notices n
        WHERE n.id = (SELECT notice_id FROM c7 WHERE recipient_email = 'adm1@en.test')) = 'sent/202',
  'EN5.2 a row that is already sent cannot be settled again: a later "failed" does not undo it');
-- A late answer from an attempt that was taken over.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s4 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice((SELECT attempt_id FROM c1 WHERE recipient_email = 'own2@en.test'), 'sent', 200) AS r;
RESET ROLE;
GRANT SELECT ON s4 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM s4) = 'stale'
  AND (SELECT n.status FROM public.recruitment_employer_notices n WHERE n.id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test')) = 'claimed',
  'EN5.3 an answer for an earlier attempt is stale and changes nothing');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s5 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice(gen_random_uuid(), 'sent', 200) AS r;
RESET ROLE;
GRANT SELECT ON s5 TO PUBLIC;
SELECT pg_temp.ok((SELECT r FROM s5) = 'stale', 'EN5.4 an attempt id that no row has is stale');
SET LOCAL ROLE service_role;
SELECT pg_temp.must_fail($$SELECT public.rec_settle_employer_notice(NULL, 'sent', 200)$$, 'NOTICE_NOT_FOUND',
  'EN5.5 a settle with no attempt id is refused');
SELECT pg_temp.must_fail(
  format($f$SELECT public.rec_settle_employer_notice(%L, 'delivered', 200)$f$, (SELECT attempt_id FROM c7 WHERE recipient_email = 'own2@en.test')),
  'NOTICE_RESULT_INVALID', 'EN5.6 a result other than sent, failed or not_configured is refused');
RESET ROLE;
-- Failed: the status, the backoff, and what is kept.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s6 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice((SELECT attempt_id FROM c7 WHERE recipient_email = 'own2@en.test'), 'failed', 429) AS r;
RESET ROLE;
GRANT SELECT ON s6 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM s6) = 'failed'
  AND (SELECT n.status || '/' || n.last_status || '/' || (n.sent_at IS NULL)::text || '/' || (n.next_attempt_at = now() + public.rec_employer_notice_backoff(n.attempts) AND n.attempts >= 2)::text
        FROM public.recruitment_employer_notices n WHERE n.id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test'))
      = 'failed/429/true/true',
  'EN5.7 a failed attempt records the status and waits the backoff for its attempt number (values: EN6.6)');
-- A status outside HTTP's range is not stored; not_configured records its state.
UPDATE public.recruitment_employer_notices SET status = 'claimed', claimed_at = now(), attempt_id = gen_random_uuid()
 WHERE id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s7 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice(
  (SELECT attempt_id FROM public.recruitment_employer_notices WHERE id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test')),
  'not_configured', 9999) AS r;
RESET ROLE;
GRANT SELECT ON s7 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM s7) = 'not_configured'
  AND (SELECT n.last_status IS NULL FROM public.recruitment_employer_notices n WHERE n.id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test')),
  'EN5.8 not_configured is recorded as such, and an out-of-range status is not stored');
-- Only a claimed row settles: a pending row has no attempt to name.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_employer_notices n
    WHERE n.status = 'pending' AND n.attempt_id IS NOT NULL) = 0,
  'EN5.9 a pending row has no attempt id, so nothing can settle it');
UPDATE public.recruitment_employer_notices SET status = 'failed', last_status = 500
 WHERE id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s8 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice(
  (SELECT attempt_id FROM public.recruitment_employer_notices WHERE id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test')),
  'sent', 200) AS r;
RESET ROLE;
GRANT SELECT ON s8 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM s8) = 'failed'
  AND (SELECT n.status || '/' || n.last_status FROM public.recruitment_employer_notices n WHERE n.id = (SELECT notice_id FROM c7 WHERE recipient_email = 'own2@en.test')) = 'failed/500',
  'EN5.10 a row that is not claimed is not settled: "sent" for a failed row is ignored');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN6 — retry'; END $$;

-- Ten fresh single-recipient notices, one per case, on the responsible-person
-- vacancy's sibling applications: use applications 0x15..0x1e of the plain
-- vacancy, each with ONE row inserted by hand.
CREATE TEMP TABLE r6 (case_name text PRIMARY KEY, nid uuid, app uuid);
GRANT SELECT ON r6 TO PUBLIC;
INSERT INTO r6 (case_name, nid, app)
SELECT c, gen_random_uuid(), ('e7000000-3333-0000-0000-0000000000' || lpad(to_hex(20 + ord::int), 2, '0'))::uuid
  FROM unnest(ARRAY['f500','f0','f409','f429','f422','f400','nc','cap','old','future']) WITH ORDINALITY AS t(c, ord);
INSERT INTO public.recruitment_employer_notices
  (id, application_id, employer_id, recipient_user_id, status, attempts, attempt_id, claimed_at, last_status, next_attempt_at)
SELECT r6.nid, r6.app, 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000001',
       CASE WHEN r6.case_name = 'nc' THEN 'not_configured' ELSE 'failed' END,
       CASE r6.case_name WHEN 'cap' THEN 6 ELSE 1 END,
       gen_random_uuid(), now() - interval '1 hour',
       CASE r6.case_name WHEN 'f500' THEN 500 WHEN 'f0' THEN 0 WHEN 'f409' THEN 409 WHEN 'f429' THEN 429
            WHEN 'f422' THEN 422 WHEN 'f400' THEN 400 WHEN 'nc' THEN NULL ELSE 503 END,
       CASE r6.case_name WHEN 'future' THEN now() + interval '10 minutes' ELSE now() - interval '1 minute' END
  FROM r6;
UPDATE public.recruitment_employer_notices SET created_at = now() - interval '24 hours'
 WHERE id = (SELECT nid FROM r6 WHERE case_name = 'old');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c11 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices(NULL, 50);
RESET ROLE;
GRANT SELECT ON c11 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT bool_and((SELECT count(*) FROM c11 WHERE notice_id = r6.nid) = 1)
     FROM r6 WHERE case_name IN ('f500', 'f0', 'f409', 'f429', 'nc')),
  'EN6.1 retried when due: no answer (0), 409, 429, 5xx, and a transport that was not configured');
SELECT pg_temp.ok(
  (SELECT bool_and((SELECT count(*) FROM c11 WHERE notice_id = r6.nid) = 0)
     FROM r6 WHERE case_name IN ('f422', 'f400')),
  'EN6.2 a definite refusal (400, 422) is final: never retried');
SELECT pg_temp.ok(
  (SELECT count(*) FROM c11 WHERE notice_id = (SELECT nid FROM r6 WHERE case_name = 'future')) = 0,
  'EN6.3 a notice still inside its backoff is not claimed');
SELECT pg_temp.ok(
  (SELECT count(*) FROM c11 WHERE notice_id = (SELECT nid FROM r6 WHERE case_name = 'cap')) = 0
  AND (SELECT n.status || '/' || n.attempts FROM public.recruitment_employer_notices n WHERE n.id = (SELECT nid FROM r6 WHERE case_name = 'cap')) = 'failed/6',
  'EN6.4 after six attempts there is no seventh: the row keeps its honest "failed"');
SELECT pg_temp.ok(
  (SELECT count(*) FROM c11 WHERE notice_id = (SELECT nid FROM r6 WHERE case_name = 'old')) = 0,
  'EN6.5 nothing is retried once the notice is 23 hours old (the provider''s idempotency window)');
-- Backoff growth, by the attempt number settled.
CREATE TEMP TABLE bo ON COMMIT DROP AS
SELECT i AS attempts, public.rec_employer_notice_backoff(i) AS wait FROM generate_series(1, 6) AS i;
GRANT SELECT ON bo TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT array_agg(wait ORDER BY attempts) FROM bo)
    = ARRAY[interval '5 minutes', interval '15 minutes', interval '45 minutes', interval '2 hours', interval '4 hours', interval '4 hours'],
  'EN6.6 the backoff is 5 min, 15 min, 45 min, 2 h, then 4 h');
-- The last permitted attempt, then no more.
UPDATE public.recruitment_employer_notices SET attempts = 5, status = 'failed', last_status = 503, next_attempt_at = now() - interval '1 minute'
 WHERE id = (SELECT nid FROM r6 WHERE case_name = 'cap');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c12 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app FROM r6 WHERE case_name = 'cap'));
RESET ROLE;
GRANT SELECT ON c12 TO PUBLIC;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE s9 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice((SELECT attempt_id FROM c12), 'failed', 503) AS r;
RESET ROLE;
GRANT SELECT ON s9 TO PUBLIC;
UPDATE public.recruitment_employer_notices SET next_attempt_at = now() - interval '1 minute'
 WHERE id = (SELECT nid FROM r6 WHERE case_name = 'cap');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c13 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app FROM r6 WHERE case_name = 'cap'));
RESET ROLE;
GRANT SELECT ON c13 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c12) = 1 AND (SELECT attempts FROM c12) = 6
  AND (SELECT r FROM s9) = 'failed' AND (SELECT count(*) FROM c13) = 0,
  'EN6.7 the sixth attempt is the last: claimed, settled, and then never offered again');
-- A claim that was never settled on the last attempt becomes "failed", not "claimed" for ever.
UPDATE public.recruitment_employer_notices SET status = 'claimed', attempts = 6, claimed_at = now() - interval '5 minutes', last_status = 503
 WHERE id = (SELECT nid FROM r6 WHERE case_name = 'f500');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c14 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices((SELECT app FROM r6 WHERE case_name = 'f500'));
RESET ROLE;
GRANT SELECT ON c14 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c14) = 0
  AND (SELECT n.status || '/' || n.last_status FROM public.recruitment_employer_notices n WHERE n.id = (SELECT nid FROM r6 WHERE case_name = 'f500')) = 'failed/0',
  'EN6.8 a claim whose last attempt never reported becomes "failed" with no answer, not "claimed" for ever');
-- The sweep: bounded across applications.
UPDATE public.recruitment_employer_notices SET status = 'failed', last_status = 500, attempts = 1, next_attempt_at = now() - interval '1 minute', claimed_at = now() - interval '1 hour'
 WHERE id IN (SELECT nid FROM r6 WHERE case_name IN ('f500', 'f0', 'f409', 'f429'));
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c15 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices(NULL, 2);
RESET ROLE;
GRANT SELECT ON c15 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c15) = 2 AND (SELECT count(DISTINCT application_id) FROM c15) = 2,
  'EN6.9 the sweep (no application) takes due notices from several applications, bounded by its limit');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE c16 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices(NULL, 1000);
RESET ROLE;
GRANT SELECT ON c16 TO PUBLIC;
-- Sixty more notices, due now: six applications to the organisation with ten
-- eligible recipients. Whatever limit is asked for, a claim takes at most 50.
ALTER TABLE public.job_applications DISABLE TRIGGER USER;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT ('e7000000-3333-0000-0000-0000000f00' || lpad(i::text, 2, '0'))::uuid,
       'e7000000-2222-0000-0000-00000000000f', 'e7000000-1111-0000-0000-00000000000e',
       ('e7000000-0000-0000-0000-0000000000' || lpad(to_hex(16 + i), 2, '0'))::uuid, 'submitted', now()
  FROM generate_series(1, 6) AS i;
ALTER TABLE public.job_applications ENABLE TRIGGER USER;
SET LOCAL ROLE service_role;
SELECT public.rec_enqueue_employer_new_application_notices(('e7000000-3333-0000-0000-0000000f00' || lpad(i::text, 2, '0'))::uuid)
  FROM generate_series(1, 6) AS i;
CREATE TEMP TABLE c17 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices(NULL, 1000);
CREATE TEMP TABLE c18 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices(NULL, 1000);
RESET ROLE;
GRANT SELECT ON c17, c18 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM c17) = 50 AND (SELECT count(*) FROM c18) = 10
  AND (SELECT count(DISTINCT notice_id) FROM (SELECT notice_id FROM c17 UNION ALL SELECT notice_id FROM c18) x) = 60,
  'EN6.10 whatever limit is asked for a claim takes at most 50; the next takes the remaining ten, and no notice is handed over twice');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN8 — retention'; END $$;

-- One row per case, all for recipient adm1 on applications 0x15..0x1e (which
-- already hold an unrelated row for another recipient). Timestamps are the
-- ones a row of that age would have; the suite cannot move the clock.
CREATE TEMP TABLE r8 (case_name text PRIMARY KEY, nid uuid, app uuid, purged boolean);
GRANT SELECT ON r8 TO PUBLIC;
INSERT INTO r8 (case_name, nid, app, purged)
SELECT c, gen_random_uuid(), ('e7000000-3333-0000-0000-0000000000' || lpad(to_hex(20 + ord::int), 2, '0'))::uuid, p
  FROM unnest(ARRAY['sent_91', 'sent_89', 'skipped_91', 'refused_91', 'exhausted_91', 'window_91',
                    'retryable_100', 'unconfigured_100', 'pending_100', 'claimed_100'],
               ARRAY[true, false, true, true, true, true, false, false, false, false]) WITH ORDINALITY AS t(c, p, ord);
INSERT INTO public.recruitment_employer_notices
  (id, application_id, employer_id, recipient_user_id, status, attempts, attempt_id, claimed_at,
   last_status, sent_at, skip_reason, settled_at, created_at)
SELECT r.nid, r.app, 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003',
       CASE r.case_name
         WHEN 'sent_91' THEN 'sent' WHEN 'sent_89' THEN 'sent' WHEN 'skipped_91' THEN 'skipped'
         WHEN 'unconfigured_100' THEN 'not_configured' WHEN 'pending_100' THEN 'pending'
         WHEN 'claimed_100' THEN 'claimed' ELSE 'failed' END,
       CASE r.case_name WHEN 'pending_100' THEN 0 WHEN 'exhausted_91' THEN 6 WHEN 'window_91' THEN 2 ELSE 1 END,
       CASE WHEN r.case_name = 'claimed_100' THEN gen_random_uuid() END,
       CASE WHEN r.case_name = 'claimed_100' THEN now() - interval '100 days' END,
       CASE r.case_name WHEN 'sent_91' THEN 202 WHEN 'sent_89' THEN 202 WHEN 'refused_91' THEN 422
         WHEN 'exhausted_91' THEN 503 WHEN 'window_91' THEN 503 WHEN 'retryable_100' THEN 503 END,
       CASE WHEN r.case_name IN ('sent_91', 'sent_89') THEN now() - interval '100 days' END,
       CASE WHEN r.case_name = 'skipped_91' THEN 'RECIPIENT_NOT_ELIGIBLE' END,
       CASE r.case_name
         WHEN 'sent_91' THEN now() - interval '91 days' WHEN 'sent_89' THEN now() - interval '89 days'
         WHEN 'skipped_91' THEN now() - interval '91 days' WHEN 'refused_91' THEN now() - interval '91 days'
         WHEN 'exhausted_91' THEN now() - interval '91 days' WHEN 'window_91' THEN now() - interval '91 days'
         WHEN 'pending_100' THEN NULL ELSE now() - interval '100 days' END,
       -- Terminal by status or by exhaustion, or old enough that the window closed; the
       -- rows that must stay are recent (so they could still be retried) or never tried.
       CASE r.case_name WHEN 'retryable_100' THEN now() WHEN 'unconfigured_100' THEN now()
         WHEN 'refused_91' THEN now() WHEN 'exhausted_91' THEN now() ELSE now() - interval '200 days' END
  FROM r8 r;

SET LOCAL ROLE service_role;
CREATE TEMP TABLE pg1 ON COMMIT DROP AS SELECT public.rec_purge_employer_notices() AS n;
RESET ROLE;
GRANT SELECT ON pg1 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM pg1) = 5
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n JOIN r8 ON r8.nid = n.id WHERE r8.purged)
  AND (SELECT count(*) FROM public.recruitment_employer_notices n JOIN r8 ON r8.nid = n.id WHERE NOT r8.purged) = 5,
  'EN8.1 the purge returns five: a sent, a skipped and three final failed rows older than 90 days are deleted');
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.recruitment_employer_notices n JOIN r8 ON r8.nid = n.id
           WHERE r8.case_name = 'sent_89' AND n.status = 'sent'),
  'EN8.2 a sent row settled 89 days ago stays');
SELECT pg_temp.ok(
  (SELECT string_agg(r8.case_name || ':' || n.status, ',' ORDER BY r8.case_name)
     FROM public.recruitment_employer_notices n JOIN r8 ON r8.nid = n.id)
    = 'claimed_100:claimed,pending_100:pending,retryable_100:failed,sent_89:sent,unconfigured_100:not_configured',
  'EN8.3 a pending, a claimed and a still-retryable failed or not_configured row stay, whatever their timestamps say');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE pg2 ON COMMIT DROP AS SELECT public.rec_purge_employer_notices() AS n;
RESET ROLE;
GRANT SELECT ON pg2 TO PUBLIC;
SELECT pg_temp.ok((SELECT n FROM pg2) = 0, 'EN8.4 a second purge finds nothing: it returns zero');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_employer_notices n
    WHERE n.settled_at >= now() - interval '1 minute' OR n.settled_at IS NULL) > 0
  AND EXISTS (SELECT 1 FROM public.recruitment_employer_notices n WHERE n.status = 'sent' AND n.settled_at >= now() - interval '1 minute'),
  'EN8.5 rows settled today, sent among them, are untouched');
SET LOCAL ROLE service_role;
SELECT pg_temp.must_fail($$SELECT public.rec_purge_employer_notices(interval '0')$$, 'NOTICE_RETENTION_TOO_SHORT',
  'EN8.6 a window of nothing is refused');
SELECT pg_temp.must_fail($$SELECT public.rec_purge_employer_notices(interval '12 hours')$$, 'NOTICE_RETENTION_TOO_SHORT',
  'EN8.7 so is anything under a day');
SELECT pg_temp.must_fail($$SELECT public.rec_purge_employer_notices(NULL)$$, 'NOTICE_RETENTION_TOO_SHORT',
  'EN8.8 and no window at all');
RESET ROLE;
-- A shorter window, still at least a day, takes the 89-day row.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE pg3 ON COMMIT DROP AS SELECT public.rec_purge_employer_notices(interval '30 days') AS n;
RESET ROLE;
GRANT SELECT ON pg3 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM pg3) >= 1
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n JOIN r8 ON r8.nid = n.id WHERE r8.case_name = 'sent_89')
  AND (SELECT count(*) FROM public.recruitment_employer_notices n JOIN r8 ON r8.nid = n.id) = 4,
  'EN8.9 the window is a parameter: 30 days takes the 89-day row and still not the four live ones');
SELECT pg_temp.ok(
  position('LIMIT 1000' IN pg_get_functiondef('public.rec_purge_employer_notices(interval)'::regprocedure)) > 0,
  'EN8.10 a purge is bounded: at most 1000 rows per call');
-- A purged row cannot cause a second notice. Application 0x11 is 100 days old
-- and its only row is a sent one settled 91 days ago.
UPDATE public.job_applications SET created_at = now() - interval '100 days', status = 'submitted'
 WHERE id = 'e7000000-3333-0000-0000-000000000011';
INSERT INTO public.recruitment_employer_notices
  (application_id, employer_id, recipient_user_id, status, attempts, attempt_id, sent_at, settled_at, last_status, created_at)
VALUES ('e7000000-3333-0000-0000-000000000011', 'e7000000-1111-0000-0000-00000000000a',
        'e7000000-0000-0000-0000-000000000003', 'sent', 1, gen_random_uuid(),
        now() - interval '100 days', now() - interval '91 days', 200, now() - interval '100 days');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE pg4 ON COMMIT DROP AS SELECT public.rec_purge_employer_notices() AS n;
CREATE TEMP TABLE pg5 ON COMMIT DROP AS SELECT public.rec_enqueue_employer_new_application_notices('e7000000-3333-0000-0000-000000000011') AS n;
RESET ROLE;
GRANT SELECT ON pg4, pg5 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM pg4) >= 1
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n WHERE n.application_id = 'e7000000-3333-0000-0000-000000000011')
  AND (SELECT n FROM pg5) = 0
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n WHERE n.application_id = 'e7000000-3333-0000-0000-000000000011'),
  'EN8.11 the purged row is gone, and a re-enqueue for its (old) application still queues nothing: no second mail');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN9 — a second kind needs no new functions'; END $$;

-- None of the claim, settle, retention or backoff functions names a kind.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('rec_claim_employer_notices', 'rec_settle_employer_notice',
                        'rec_purge_employer_notices', 'rec_employer_notice_backoff', 'rec_employer_notice_recipients')
      AND position('new_application' IN p.prosrc) > 0) = 0,
  'EN9.1 no function but the enqueue of a NEW application names that kind');
CREATE TEMP TABLE bodies_before AS
SELECT p.proname, md5(p.prosrc) AS h FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('rec_claim_employer_notices', 'rec_settle_employer_notice', 'rec_purge_employer_notices',
                     'rec_employer_notice_recipients', 'rec_employer_notice_backoff', 'rec_enqueue_employer_new_application_notices');
GRANT SELECT ON bodies_before TO PUBLIC;

-- What a later migration would do: widen the allow-list. Nothing else.
ALTER TABLE public.recruitment_employer_notices DROP CONSTRAINT recruitment_employer_notices_kind_check;
ALTER TABLE public.recruitment_employer_notices ADD CONSTRAINT recruitment_employer_notices_kind_check
  CHECK (kind IN ('new_application', 'candidate_replied'));
INSERT INTO public.recruitment_employer_notices (id, application_id, employer_id, recipient_user_id, kind) VALUES
  ('e7090000-0000-0000-0000-000000000001', 'e7000000-3333-0000-0000-000000000015', 'e7000000-1111-0000-0000-00000000000a',
   'e7000000-0000-0000-0000-000000000004', 'candidate_replied'),
  ('e7090000-0000-0000-0000-000000000002', 'e7000000-3333-0000-0000-000000000015', 'e7000000-1111-0000-0000-00000000000a',
   'e7000000-0000-0000-0000-000000000004', 'new_application');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_employer_notices n
    WHERE n.application_id = 'e7000000-3333-0000-0000-000000000015'
      AND n.recipient_user_id = 'e7000000-0000-0000-0000-000000000004') = 2,
  'EN9.2 the same person can hold two notices about one application, one per kind');

SET LOCAL ROLE service_role;
CREATE TEMP TABLE k1 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices('e7000000-3333-0000-0000-000000000015', 10, ARRAY['new_application']);
CREATE TEMP TABLE k2 ON COMMIT DROP AS
SELECT * FROM public.rec_claim_employer_notices('e7000000-3333-0000-0000-000000000015', 10, ARRAY['candidate_replied']);
RESET ROLE;
GRANT SELECT ON k1, k2 TO PUBLIC;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM k1 WHERE kind <> 'new_application')
  AND (SELECT count(*) FROM k2) = 1
  AND (SELECT kind || '/' || recipient_email FROM k2) = 'candidate_replied/adm2@en.test',
  'EN9.3 a claim for one kind hands over only that kind, and the new kind is claimed by the same function');
SELECT pg_temp.ok(
  (SELECT provider_key FROM k2) = 'employer-candidate-replied:e7090000-0000-0000-0000-000000000001'
  AND (SELECT provider_key FROM k1 WHERE notice_id = 'e7090000-0000-0000-0000-000000000002')
      = 'employer-new-application:e7090000-0000-0000-0000-000000000002',
  'EN9.4 the provider key is built from the kind and the row id, so each kind has its own keys');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE k3 ON COMMIT DROP AS
SELECT public.rec_settle_employer_notice((SELECT attempt_id FROM k2), 'sent', 200) AS r;
RESET ROLE;
GRANT SELECT ON k3 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT r FROM k3) = 'sent'
  AND (SELECT n.status FROM public.recruitment_employer_notices n WHERE n.id = 'e7090000-0000-0000-0000-000000000001') = 'sent'
  AND (SELECT n.status FROM public.recruitment_employer_notices n WHERE n.id = 'e7090000-0000-0000-0000-000000000002') = 'claimed',
  'EN9.5 settle serves the new kind, and settling one kind leaves the other row of the same pair alone');
UPDATE public.recruitment_employer_notices SET settled_at = now() - interval '91 days'
 WHERE id = 'e7090000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
CREATE TEMP TABLE k4 ON COMMIT DROP AS SELECT public.rec_purge_employer_notices() AS n;
RESET ROLE;
GRANT SELECT ON k4 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT n FROM k4) >= 1
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n WHERE n.id = 'e7090000-0000-0000-0000-000000000001')
  AND EXISTS (SELECT 1 FROM public.recruitment_employer_notices n WHERE n.id = 'e7090000-0000-0000-0000-000000000002'),
  'EN9.6 the retention serves the new kind too, and takes only the settled row');
SELECT pg_temp.ok(
  (SELECT bool_and(md5(p.prosrc) = b.h) FROM pg_proc p JOIN bodies_before b ON b.proname = p.proname
    WHERE p.pronamespace = 'public'::regnamespace),
  'EN9.7 and no function body changed: widening the allow-list was the whole change');

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP EN7 — shape and cascade'; END $$;

SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, status)
    VALUES ('e7000000-3333-0000-0000-00000000001f', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 'sent')$$,
  'recruitment_employer_notices_shape', 'EN7.1 a row cannot be "sent" without a sent time');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, status)
    VALUES ('e7000000-3333-0000-0000-00000000001f', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 'claimed')$$,
  'recruitment_employer_notices_shape', 'EN7.2 a row cannot be "claimed" without a lease and an attempt');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, status, skip_reason)
    VALUES ('e7000000-3333-0000-0000-00000000001f', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 'pending', 'EXPIRED')$$,
  'recruitment_employer_notices_shape', 'EN7.3 a skip reason belongs to a skipped row only');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, status, sent_at)
    VALUES ('e7000000-3333-0000-0000-00000000001f', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 'sent', now())$$,
  'recruitment_employer_notices_shape', 'EN7.8 a sent row has a settled time, the clock the retention runs on');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, last_status)
    VALUES ('e7000000-3333-0000-0000-00000000001f', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 700)$$,
  'recruitment_employer_notices_last_status_check', 'EN7.4 the status column holds an HTTP status, nothing else');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, status)
    VALUES ('e7000000-3333-0000-0000-00000000001f', 'e7000000-1111-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 'delivered')$$,
  'recruitment_employer_notices_status_check', 'EN7.5 only the six states exist');
DELETE FROM public.job_applications WHERE id = (SELECT app_plain FROM fx);
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n WHERE n.application_id = (SELECT app_plain FROM fx)),
  'EN7.6 deleting an application deletes its notices');
DELETE FROM auth.users WHERE id = 'e7000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.recruitment_employer_notices n WHERE n.recipient_user_id = 'e7000000-0000-0000-0000-000000000001'),
  'EN7.7 deleting an account deletes its notices: nothing about the person outlives them');

ROLLBACK;
