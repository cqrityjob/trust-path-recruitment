-- Security Passport: the holder's number, the founder designation, the network
-- count's founder rule, and the separate PUBLIC social share -- executed.
--
-- Proves 20270217090000 does what it says:
--
--   GROUP 1  numbering is server-held, unique, idempotent and never reused; #1 is
--            reserved for the one designated founder; no client can assign a
--            number or the designation; a role, a name or user metadata grants
--            nothing
--   GROUP 2  the network count: exactly one qualifying holder is 1, two are 2,
--            the founder counts once, every OTHER staff account and every
--            excluded account does not, and nothing is published
--   GROUP 3  the public social share: only the holder's own current, unexpired
--            credentials can be pinned; the name label is approved and closed-list; creation is
--            idempotent; the anonymous payload is bounded to an allow-list; the
--            opened page shows CURRENT standing; expiry and revocation answer
--            the one 'unavailable' payload
--   GROUP 4  the boundary: anon reads exactly one function, no table; another
--            user can neither read, revoke nor enumerate a holder's shares
--   GROUP 5  the real rollback refuses to destroy data, restores the previous
--            count function byte for byte, and the migration re-applies
--
-- All inside one transaction that is rolled back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
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


-- ── Everybody who already exists is outside this suite's arithmetic ──────
-- Other suites may have committed Passports. They are excluded for the
-- duration, so "1" and "2" below are exact rather than relative.
INSERT INTO public.sp_statistics_exclusions (holder_user_id, reason)
SELECT holder_user_id, 'pre-existing fixture, outside this suite'
  FROM public.sp_passport_profiles
ON CONFLICT DO NOTHING;

-- ── People ──────────────────────────────────────────────────────────────
--   ...01 founder (superadmin)         ...02 another admin
--   ...03 normal holder A              ...04 normal holder B
--   ...05 excluded (test) holder       ...06 incomplete holder
--   ...07 completed but undeclared     ...08 a would-be founder (user metadata)
--   ...09 a normal holder given an admin role later
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('5a000000-0000-4000-8000-000000000001', 'founder@test.invalid',   now(), '{}'),
  ('5a000000-0000-4000-8000-000000000002', 'admin2@test.invalid',    now(), '{}'),
  ('5a000000-0000-4000-8000-000000000003', 'holder-a@test.invalid',  now(), '{}'),
  ('5a000000-0000-4000-8000-000000000004', 'holder-b@test.invalid',  now(), '{}'),
  ('5a000000-0000-4000-8000-000000000005', 'excluded@test.invalid',  now(), '{}'),
  ('5a000000-0000-4000-8000-000000000006', 'incomplete@test.invalid',now(), '{}'),
  ('5a000000-0000-4000-8000-000000000007', 'nodecl@test.invalid',    now(), '{}'),
  ('5a000000-0000-4000-8000-000000000008', 'claims-founder@test.invalid', now(),
     '{"founder": true, "designation": "founder", "passport_number": 1}'),
  ('5a000000-0000-4000-8000-000000000009', 'promoted@test.invalid',  now(), '{}');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('5a000000-0000-4000-8000-000000000001', 'superadmin'),
  ('5a000000-0000-4000-8000-000000000002', 'admin'),
  ('5a000000-0000-4000-8000-000000000009', 'admin');

-- Profiles are written by the owner (no JWT), as the other suites do.
INSERT INTO public.sp_passport_profiles
  (holder_user_id, display_name, onboarding_state, declared_accurate_at,
   jurisdiction_code, work_location_confirmed_at, privacy_mode)
VALUES
  ('5a000000-0000-4000-8000-000000000001', 'Founder Holder', 'completed', now(), 'SE', now(), 'full_name'),
  ('5a000000-0000-4000-8000-000000000002', 'Other Admin',    'completed', now(), 'SE', now(), 'full_name'),
  ('5a000000-0000-4000-8000-000000000006', 'Incomplete',     'in_progress', NULL, NULL, NULL, 'full_name'),
  ('5a000000-0000-4000-8000-000000000008', 'Metadata Claimant', 'completed', now(), 'SE', now(), 'full_name'),
  ('5a000000-0000-4000-8000-000000000009', 'Promoted Later', 'completed', now(), 'SE', now(), 'full_name');
-- 'completed' REQUIRES the declaration (CHECK), so "undeclared" is the legacy
-- shape: declared_accurate_at set later to the absence of a completed state.
INSERT INTO public.sp_passport_profiles
  (holder_user_id, display_name, onboarding_state, jurisdiction_code, work_location_confirmed_at)
VALUES ('5a000000-0000-4000-8000-000000000007', 'No Declaration', 'in_progress', 'SE', now());

-- ── GROUP 1: the number ─────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 1 — numbering'; END $$;

-- Staff (other than the founder) take no public number; nor does an incomplete holder.
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers
                               WHERE holder_user_id IN ('5a000000-0000-4000-8000-000000000001',
                                                        '5a000000-0000-4000-8000-000000000002',
                                                        '5a000000-0000-4000-8000-000000000006',
                                                        '5a000000-0000-4000-8000-000000000007',
                                                        '5a000000-0000-4000-8000-000000000009')),
  '1.1 the founder (before designation), two admins, an incomplete and an undeclared holder have no number');

-- Ordinary holders are numbered when their Passport becomes completed.
INSERT INTO public.sp_passport_profiles
  (holder_user_id, display_name, onboarding_state, declared_accurate_at,
   jurisdiction_code, work_location_confirmed_at, privacy_mode)
VALUES
  ('5a000000-0000-4000-8000-000000000003', 'Holder A', 'completed', now(), 'SE', now(), 'full_name'),
  ('5a000000-0000-4000-8000-000000000004', 'Holder B', 'completed', now(), 'GB', now(), 'initials');
SELECT pg_temp.ok((SELECT passport_number FROM public.sp_passport_numbers
                    WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003') >= 2,
  '1.2 an ordinary holder is numbered from 2 upward');
SELECT pg_temp.ok((SELECT passport_number FROM public.sp_passport_numbers
                    WHERE holder_user_id = '5a000000-0000-4000-8000-000000000004')
                  <> (SELECT passport_number FROM public.sp_passport_numbers
                       WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003'),
  '1.3 two holders never share a number');

-- Idempotent: reloading, editing, adding credentials and repeated calls change nothing.
CREATE TEMP TABLE keep AS
  SELECT holder_user_id, passport_number FROM public.sp_passport_numbers;
UPDATE public.sp_passport_profiles SET display_name = 'Holder A (edited)'
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003';
UPDATE public.sp_passport_profiles SET onboarding_state = 'completed', declared_accurate_at = now()
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003';
SELECT public.sp_assign_passport_number('5a000000-0000-4000-8000-000000000003');
SELECT public.sp_assign_passport_number('5a000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok(
  (SELECT count(*) FROM keep k JOIN public.sp_passport_numbers n USING (holder_user_id, passport_number)) =
  (SELECT count(*) FROM keep)
  AND (SELECT count(*) FROM public.sp_passport_numbers) = (SELECT count(*) FROM keep),
  '1.4 editing, re-completing and repeated assignment give no new number');

-- Completion later numbers the holder then.
UPDATE public.sp_passport_profiles
   SET onboarding_state = 'completed', declared_accurate_at = now()
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000006';
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_passport_numbers
                           WHERE holder_user_id = '5a000000-0000-4000-8000-000000000006'),
  '1.5 a holder who completes later is numbered at that moment');

-- The duplicate is refused by the data itself, whatever the caller does.
SELECT pg_temp.must_fail(
  $$INSERT INTO public.sp_passport_numbers (holder_user_id, passport_number)
    VALUES ('5a000000-0000-4000-8000-000000000009',
            (SELECT passport_number FROM public.sp_passport_numbers LIMIT 1))$$,
  'sp_passport_numbers_number_unique', '1.6 a duplicate number is refused by the unique constraint');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.sp_passport_numbers (holder_user_id, passport_number)
    VALUES ('5a000000-0000-4000-8000-000000000009', 1)$$,
  'sp_passport_numbers_founder_is_one', '1.7 #1 cannot be held by anyone without the founder designation');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.sp_passport_numbers (holder_user_id, passport_number, designation)
    VALUES ('5a000000-0000-4000-8000-000000000009', 77, 'founder')$$,
  'sp_passport_numbers_founder_is_one', '1.8 the founder designation cannot sit on any number but 1');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.sp_passport_numbers (holder_user_id, passport_number, designation)
    VALUES ('5a000000-0000-4000-8000-000000000009', 78, 'ambassador')$$,
  'sp_passport_numbers_designation_vocab', '1.9 the designation vocabulary is closed');

-- A metadata claim, a name and a role designate nobody.
SELECT pg_temp.ok(
  (SELECT passport_number FROM public.sp_passport_numbers
    WHERE holder_user_id = '5a000000-0000-4000-8000-000000000008') >= 2
  AND NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers WHERE designation IS NOT NULL OR passport_number = 1),
  '1.10 user metadata claiming "founder" and #1 makes the holder an ordinary numbered holder, not the founder');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers
               WHERE holder_user_id = '5a000000-0000-4000-8000-000000000009'),
  '1.11 a holder who is given an admin role is not numbered, and not designated, by it');

-- The designation: operator-only, one founder, a superadmin with a finished Passport.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail($$SELECT public.sp_designate_founder('5a000000-0000-4000-8000-000000000001')$$,
  'permission denied', '1.12 anon cannot designate');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';
SELECT pg_temp.must_fail($$SELECT public.sp_designate_founder('5a000000-0000-4000-8000-000000000001')$$,
  'permission denied', '1.13 not even the founder''s own signed-in session can designate');
SELECT pg_temp.must_fail($$SELECT public.sp_assign_passport_number('5a000000-0000-4000-8000-000000000003')$$,
  'permission denied', '1.14 a signed-in user cannot assign numbers');
SELECT pg_temp.must_fail($$SELECT public.sp_network_counts_holder('5a000000-0000-4000-8000-000000000003')$$,
  'permission denied', '1.15 the qualification helper is internal');
RESET ROLE;

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';
SELECT pg_temp.must_fail($$SELECT public.sp_designate_founder('5a000000-0000-4000-8000-000000000001')$$,
  'SP_FOUNDER_OPERATOR_ONLY', '1.16 a call carrying a signed-in identity is refused even with the grant');
SET LOCAL request.jwt.claim.sub = '';
SELECT pg_temp.must_fail($$SELECT public.sp_designate_founder('5a000000-0000-4000-8000-000000000003')$$,
  'SP_FOUNDER_NOT_SUPERADMIN', '1.17 an ordinary holder cannot be the founder');
SELECT pg_temp.must_fail($$SELECT public.sp_designate_founder('5a000000-0000-4000-8000-000000000002')$$,
  'SP_FOUNDER_NOT_SUPERADMIN', '1.18 an admin who is not a superadmin cannot be the founder');
SELECT pg_temp.ok(public.sp_designate_founder('5a000000-0000-4000-8000-000000000001') = 1,
  '1.19 the operator designates the superadmin founder: #1');
SELECT pg_temp.ok(public.sp_designate_founder('5a000000-0000-4000-8000-000000000001') = 1,
  '1.20 designating the same holder again is idempotent');
RESET ROLE;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_passport_numbers WHERE designation = 'founder') = 1
  AND (SELECT count(*) FROM public.sp_passport_numbers WHERE passport_number = 1) = 1
  AND (SELECT holder_user_id FROM public.sp_passport_numbers WHERE passport_number = 1)
        = '5a000000-0000-4000-8000-000000000001',
  '1.21 exactly one founder and exactly one #1, and it is that holder');

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.sub = '';
UPDATE public.user_roles SET role = 'superadmin' WHERE user_id = '5a000000-0000-4000-8000-000000000002';
SELECT pg_temp.must_fail($$SELECT public.sp_designate_founder('5a000000-0000-4000-8000-000000000002')$$,
  'SP_FOUNDER_ALREADY_DESIGNATED', '1.22 there is exactly one founder: a second designation is refused');
RESET ROLE;
UPDATE public.user_roles SET role = 'admin' WHERE user_id = '5a000000-0000-4000-8000-000000000002';

-- Clients: read their own number only; write nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_passport_numbers) = 1,
  '1.23 a signed-in holder reads exactly their own number row');
SELECT pg_temp.must_fail($$UPDATE public.sp_passport_numbers SET passport_number = 1$$,
  'permission denied', '1.24 a holder cannot write a number');
SELECT pg_temp.must_fail($$DELETE FROM public.sp_passport_numbers$$,
  'permission denied', '1.25 a holder cannot delete a number');
SELECT pg_temp.must_fail($$INSERT INTO public.sp_passport_numbers (holder_user_id, passport_number)
                           VALUES ('5a000000-0000-4000-8000-000000000003', 999)$$,
  'permission denied', '1.26 a holder cannot insert a number');
SELECT pg_temp.ok((public.sp_my_passport_number()->>'passport_number')::int >= 2
                  AND public.sp_my_passport_number()->'designation' = 'null'::jsonb,
  '1.27 sp_my_passport_number returns the holder''s own number, idempotently, with no designation');
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';
SELECT pg_temp.ok((public.sp_my_passport_number()->>'passport_number')::int = 1
                  AND public.sp_my_passport_number()->>'designation' = 'founder',
  '1.28 the founder reads #1 and the founder designation');
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000002';
SELECT pg_temp.ok(public.sp_my_passport_number()->'passport_number' = 'null'::jsonb,
  '1.29 another admin receives no number');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail($$SELECT * FROM public.sp_passport_numbers$$,
  'permission denied', '1.30 anon cannot read numbers');
SELECT pg_temp.must_fail($$SELECT public.sp_my_passport_number()$$,
  'permission denied', '1.31 anon cannot call the holder''s number read');
SELECT pg_temp.must_fail($$SELECT nextval('public.sp_passport_number_seq')$$,
  'permission denied', '1.32 anon cannot draw from the sequence');
RESET ROLE;

-- Never reused: a deleted holder's number is retired, #1 included.
SAVEPOINT founder_gone;
DELETE FROM auth.users WHERE id = '5a000000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_passport_numbers_retired WHERE passport_number = 1),
  '1.33 deleting the founder retires #1');
UPDATE public.user_roles SET role = 'superadmin' WHERE user_id = '5a000000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.sub = '';
SELECT pg_temp.must_fail($$SELECT public.sp_designate_founder('5a000000-0000-4000-8000-000000000002')$$,
  'SP_FOUNDER_NUMBER_RETIRED', '1.34 #1 is never issued twice, even after the founder is gone');
RESET ROLE;
ROLLBACK TO SAVEPOINT founder_gone;

SELECT pg_temp.ok((SELECT last_value FROM public.sp_passport_number_seq) >= 2,
  '1.35 the sequence starts at 2, so #1 is never drawn');

-- ── GROUP 2: the network count ──────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 2 — the network count'; END $$;

-- Publication is not touched by this suite beyond opening it inside the transaction.
UPDATE public.sp_network_stats_policy SET display = 'public';

-- Exclude holders that must not count, and the staff admin stays staff.
INSERT INTO public.sp_statistics_exclusions (holder_user_id, reason)
VALUES ('5a000000-0000-4000-8000-000000000005', 'test account');
INSERT INTO public.sp_passport_profiles
  (holder_user_id, display_name, onboarding_state, declared_accurate_at,
   jurisdiction_code, work_location_confirmed_at)
VALUES ('5a000000-0000-4000-8000-000000000005', 'Test Holder', 'completed', now(), 'SE', now());
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers
                               WHERE holder_user_id = '5a000000-0000-4000-8000-000000000005'),
  '2.0 a listed test account takes no public number');
-- Everything except the founder is excluded to make the arithmetic exact.
INSERT INTO public.sp_statistics_exclusions (holder_user_id, reason)
SELECT holder_user_id, 'suite arithmetic' FROM public.sp_passport_profiles
 WHERE holder_user_id <> '5a000000-0000-4000-8000-000000000001'
ON CONFLICT DO NOTHING;

SELECT pg_temp.ok((public.sp_network_stats()->>'passports')::int = 1,
  '2.1 exactly one qualifying holder (the founder, a superadmin) is counted as 1');
SELECT pg_temp.ok(
  NOT public.sp_network_counts_holder('5a000000-0000-4000-8000-000000000002'),
  '2.2 another admin account does not count');
SELECT pg_temp.ok(
  NOT public.sp_network_counts_holder('5a000000-0000-4000-8000-000000000005'),
  '2.3 a listed test account does not count');

-- A second real holder makes it 2.
DELETE FROM public.sp_statistics_exclusions WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok((public.sp_network_stats()->>'passports')::int = 2,
  '2.4 two qualifying holders make the count 2 (nothing is hard-coded to 1)');

-- Reserving a number changes no statistic.
DELETE FROM public.sp_statistics_exclusions WHERE holder_user_id = '5a000000-0000-4000-8000-000000000004';
SELECT pg_temp.ok((public.sp_network_stats()->>'passports')::int = 3,
  '2.5 a third holder makes it 3; numbers are labels, not the count');

-- The exclusion list still decides, the founder included.
INSERT INTO public.sp_statistics_exclusions (holder_user_id, reason)
VALUES ('5a000000-0000-4000-8000-000000000001', 'excluded deliberately');
SELECT pg_temp.ok((public.sp_network_stats()->>'passports')::int = 2,
  '2.6 the exclusion list still removes the founder');
DELETE FROM public.sp_statistics_exclusions WHERE holder_user_id = '5a000000-0000-4000-8000-000000000001';

-- A profile with credentials but not completed is not a Passport.
UPDATE public.sp_passport_profiles SET onboarding_state = 'in_progress'
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000004';
SELECT pg_temp.ok((public.sp_network_stats()->>'passports')::int = 2,
  '2.7 a holder who is not completed does not count');
UPDATE public.sp_passport_profiles SET onboarding_state = 'completed'
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000004';

SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.sp_network_stats()) k)
    = ARRAY['credentials','display','markets','otherMarkets','passports'],
  '2.8 the response shape is unchanged');
UPDATE public.sp_network_stats_policy SET display = 'hidden';
SELECT pg_temp.ok(public.sp_network_stats() = '{"display":"hidden"}'::jsonb,
  '2.9 hidden still publishes no number');

-- ── GROUP 3: the public social share ────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 3 — public social share'; END $$;

INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
   issued_on, valid_until)
VALUES
  ('5c000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000003', 'certification',
     'Certified Protection Professional (CPP)', 'INTL_ASIS_CPP', 'ASIS International', DATE '2024-01-01', NULL),
  ('5c000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000003', 'certification',
     'Associate Protection Professional (APP)', 'INTL_ASIS_APP', 'ASIS International', DATE '2025-05-05', current_date + 400),
  ('5c000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000003', 'certification',
     'Physical Security Professional (PSP)', 'INTL_ASIS_PSP', 'ASIS International', DATE '2020-01-01', current_date - 10),
  ('5c000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000003', 'certification',
     'Professional Certified Investigator (PCI)', 'INTL_ASIS_PCI', 'ASIS International', DATE '2021-01-01', NULL),
  ('5c000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000004', 'certification',
     'Certified Protection Professional (CPP)', 'INTL_ASIS_CPP', 'ASIS International', DATE '2022-02-02', NULL);
UPDATE public.sp_claims SET lifecycle_state = 'withdrawn'
 WHERE id = '5c000000-0000-4000-8000-000000000004';

-- The caller must be signed in, name the attempt and choose a supported lifetime.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'sv', 30, 'full_name', gen_random_uuid())$f$),
  'permission denied', '3.1 anon cannot create a public share');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'sv', 30, 'full_name', NULL)$f$),
  'SP_REQUEST_KEY_REQUIRED', '3.2 a create must name its attempt');
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'de', 30, 'full_name', gen_random_uuid())$f$),
  'SP_UNSUPPORTED_LOCALE', '3.3 only sv and en');
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'sv', 45, 'full_name', gen_random_uuid())$f$),
  'SP_UNSUPPORTED_EXPIRY', '3.4 only 7, 30 or 90 days');
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share('{}'::uuid[], 'sv', 30, 'full_name', gen_random_uuid())$f$),
  'SP_NOTHING_SELECTED', '3.5 a share of nothing is refused');
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000005']::uuid[], 'sv', 30, 'full_name', gen_random_uuid())$f$),
  'SP_MERIT_NOT_SHAREABLE', '3.6 another holder''s credential cannot be pinned');
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000003']::uuid[], 'sv', 30, 'full_name', gen_random_uuid())$f$),
  'SP_MERIT_NOT_SHAREABLE', '3.7 a credential that has lapsed cannot be published as current');
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000004']::uuid[], 'sv', 30, 'full_name', gen_random_uuid())$f$),
  'SP_MERIT_NOT_SHAREABLE', '3.8 a withdrawn credential cannot be pinned');
SELECT pg_temp.must_fail(
  $f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'sv', 30, 'everything', gen_random_uuid())$f$,
  'SP_HOLDER_LABEL_INVALID', '3.9 a share must say how much of the name it shows, from a closed list');
SELECT pg_temp.must_fail(
  $f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'sv', 30, NULL, gen_random_uuid())$f$,
  'SP_HOLDER_LABEL_INVALID', '3.10 a missing name label is refused, not defaulted to the most revealing one');
SELECT pg_temp.ok(
  to_regprocedure('public.sp_create_social_share(uuid[],text,integer,bytea,uuid)') IS NULL
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'sp_social_shares'
                     AND column_name ~ 'image|png'),
  '3.11 no client-supplied image can be passed to, or stored by, a public share');

-- A real create.
SET LOCAL app.k1 = '5b000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE made (pid text, created_at timestamptz, expires_at timestamptz);
GRANT ALL ON made TO PUBLIC;
INSERT INTO made
SELECT r->>'public_id', (r->>'created_at')::timestamptz, (r->>'expires_at')::timestamptz
  FROM (SELECT public.sp_create_social_share(
          ARRAY['5c000000-0000-4000-8000-000000000001','5c000000-0000-4000-8000-000000000002']::uuid[],
          'sv', 30, 'full_name', current_setting('app.k1')::uuid) AS r) s;
SELECT pg_temp.ok((SELECT pid ~ '^[A-Za-z0-9_-]{24}$' FROM made),
  '3.13 the public id is 24 URL-safe characters');
SELECT pg_temp.ok((SELECT pid FROM made) NOT LIKE '%5a000000%'
                  AND (SELECT pid FROM made) NOT LIKE '%5c000000%',
  '3.14 the public id carries no user or credential identifier');
SELECT pg_temp.ok(
  (SELECT public.sp_create_social_share(
      ARRAY['5c000000-0000-4000-8000-000000000002','5c000000-0000-4000-8000-000000000001']::uuid[],
      'sv', 30, 'full_name', current_setting('app.k1')::uuid)->>'status') = 'already_created'
  AND (SELECT public.sp_create_social_share(
      ARRAY['5c000000-0000-4000-8000-000000000002','5c000000-0000-4000-8000-000000000001']::uuid[],
      'sv', 30, 'full_name', current_setting('app.k1')::uuid)->>'public_id') = (SELECT pid FROM made),
  '3.15 a retry with the same attempt key returns the same public id (idempotent, any order)');
SELECT pg_temp.must_fail(
  format($f$SELECT public.sp_create_social_share(ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'sv', 30, 'initials', %L)$f$,
         current_setting('app.k1')),
  'SP_REQUEST_KEY_CONFLICT', '3.16 the same attempt key with different contents is refused');
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_social_shares) = 1,
  '3.17 the retries created exactly one share');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_social_shares WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003') = 1,
  '3.18 the holder sees their own share');
SELECT pg_temp.must_fail($$SELECT request_fingerprint FROM public.sp_social_shares$$,
  'permission denied', '3.19 the request fingerprint is not readable through a table grant');
SELECT pg_temp.must_fail($$UPDATE public.sp_social_shares SET revoked_at = NULL$$,
  'permission denied', '3.20 a holder cannot write a share directly');
SELECT pg_temp.must_fail($$SELECT * FROM public.sp_social_share_items$$,
  'permission denied', '3.21 a holder cannot read the pin table directly');
RESET ROLE;

-- The anonymous read: exactly the allow-list, nothing private.
SET LOCAL ROLE anon;
CREATE TEMP TABLE got AS
  SELECT public.sp_get_social_share((SELECT pid FROM made)) AS j;
GRANT SELECT ON got TO PUBLIC;
SELECT pg_temp.ok((SELECT j->>'status' FROM got) = 'active', '3.22 anon opens an active share');
SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM got, jsonb_object_keys(got.j) k)
    = ARRAY['claims','designation','expires_at','holder','holder_label','jurisdiction','locale','passport_number',
            'snapshot_at','status'],
  '3.23 the payload has exactly the approved top-level keys (no image unless asked)');
SELECT pg_temp.ok(
  (SELECT bool_and(k IN ('key','title','credential_code','jurisdiction','sub_jurisdiction',
                         'valid_until','assertion','lifecycle','verified_at',
                         'verifier_organisation','verification_method'))
     FROM got, jsonb_array_elements(got.j->'claims') c, jsonb_object_keys(c) k),
  '3.24 each credential carries only approved keys (no issuer, issue date, scope or employment)');
SELECT pg_temp.ok(
  (SELECT jsonb_array_length(j->'claims') FROM got) = 2,
  '3.25 exactly the two pinned credentials are shown');
SELECT pg_temp.ok(
  (SELECT j::text FROM got) NOT LIKE '%ASIS International%'
  AND (SELECT j::text FROM got) NOT LIKE '%issuer%'
    AND (SELECT j::text FROM got) NOT LIKE '%5a000000%'
  AND (SELECT j::text FROM got) NOT LIKE '%test.invalid%'
  AND (SELECT j::text FROM got) NOT LIKE '%token%',
  '3.26 no issuer, protected object, user id, e-mail or token appears anywhere in the payload');
SELECT pg_temp.ok((SELECT j->>'holder' FROM got) = 'Holder A (edited)'
                  AND (SELECT j->>'holder_label' FROM got) = 'full_name',
  '3.27 the holder label is the more restrictive of what was approved and the holder''s privacy setting');
SELECT pg_temp.ok(
  (SELECT j::text FROM got) NOT LIKE '%image%' AND (SELECT j::text FROM got) NOT LIKE '%png%'
  AND (SELECT j::text FROM got) NOT LIKE '%base64%',
  '3.28 the public payload carries no image: the preview is drawn from this payload alone');
SELECT pg_temp.ok(
  public.sp_get_social_share('not-a-real-id') = '{"status":"unavailable"}'::jsonb
  AND public.sp_get_social_share('AAAAAAAAAAAAAAAAAAAAAAAA') = '{"status":"unavailable"}'::jsonb
  AND public.sp_get_social_share(NULL) = '{"status":"unavailable"}'::jsonb
  AND public.sp_get_social_share('x'' OR ''1''=''1') = '{"status":"unavailable"}'::jsonb,
  '3.30 unknown, malformed and hostile ids all answer the one unavailable payload');
RESET ROLE;

-- Privacy settings are honoured by the payload.
UPDATE public.sp_passport_profiles SET privacy_mode = 'initials'
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(public.sp_get_social_share((SELECT pid FROM made))->>'holder' ~ '^H\.',
  '3.31 initials mode publishes initials only');
UPDATE public.sp_passport_profiles SET privacy_mode = 'anonymous'
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(public.sp_get_social_share((SELECT pid FROM made))->'holder' = 'null'::jsonb,
  '3.32 anonymous mode publishes no name');
SELECT pg_temp.ok(public.sp_get_social_share((SELECT pid FROM made))->>'holder_label' = 'anonymous',
  '3.32a the label says anonymous too, so a renderer cannot draw a name');
UPDATE public.sp_passport_profiles SET privacy_mode = 'full_name'
 WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(public.sp_get_social_share((SELECT pid FROM made))->>'holder' = 'Holder A (edited)',
  '3.32b loosening the setting back restores what THIS share was approved to show');
SET LOCAL ROLE authenticated;
-- A STABLE read cannot see a row its own statement's sibling just inserted, so
-- the create and the read are separate statements.
CREATE TEMP TABLE made_i AS
  SELECT public.sp_create_social_share(
    ARRAY['5c000000-0000-4000-8000-000000000001']::uuid[], 'sv', 7, 'initials',
    '5b000000-0000-4000-8000-0000000000e1')->>'public_id' AS pid;
GRANT SELECT ON made_i TO PUBLIC;
SELECT pg_temp.ok(
  public.sp_get_social_share((SELECT pid FROM made_i))->>'holder' ~ '^H\.'
  AND public.sp_get_social_share((SELECT pid FROM made_i))->>'holder_label' = 'initials',
  '3.32c a share approved as initials never shows more, even when the profile setting allows the full name');
SELECT public.sp_revoke_social_share(pid) FROM made_i;
RESET ROLE;

-- The opened page shows CURRENT standing of exactly the pinned credentials.
UPDATE public.sp_claims SET lifecycle_state = 'withdrawn'
 WHERE id = '5c000000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(jsonb_array_length(public.sp_get_social_share((SELECT pid FROM made))->'claims') = 1,
  '3.33 a credential withdrawn after the post drops off the opened page');
UPDATE public.sp_claims SET valid_until = current_date - 1
 WHERE id = '5c000000-0000-4000-8000-000000000002';
SELECT pg_temp.ok(
  (public.sp_get_social_share((SELECT pid FROM made))->'claims'->0->>'valid_until')::date < current_date,
  '3.34 a credential that lapses after the post reports its expiry, so the page can say so');
-- A claim added to the Passport after the post is NOT in it.
-- (The same governed definition as the withdrawn one: titles are governed.)
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, credential_code, claimed_issuer_name, issued_on)
VALUES ('5c000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000003',
        'certification', 'Professional Certified Investigator (PCI)', 'INTL_ASIS_PCI',
        'ASIS International', DATE '2026-01-01');
SELECT pg_temp.ok(jsonb_array_length(public.sp_get_social_share((SELECT pid FROM made))->'claims') = 1
                  AND public.sp_get_social_share((SELECT pid FROM made))::text NOT LIKE '%5c000000-0000-4000-8000-000000000006%',
  '3.35 a credential added after the share is never published by it (consent is not widened)');

-- Another user.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000004';
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_social_shares) = 0,
  '3.36 another holder sees none of the first holder''s shares');
SELECT pg_temp.ok(public.sp_list_my_social_shares() = '[]'::jsonb,
  '3.37 another holder''s list is empty');
SELECT pg_temp.must_fail(format($f$SELECT public.sp_revoke_social_share(%L)$f$, (SELECT pid FROM made)),
  'SP_SOCIAL_SHARE_NOT_FOUND', '3.38 another holder cannot revoke it');
SELECT pg_temp.ok(
  public.sp_get_social_share((SELECT pid FROM made))->>'status' = 'active',
  '3.39 and it is still active afterwards');
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok((public.sp_list_my_social_shares()->0->>'status') = 'active'
                  AND (public.sp_list_my_social_shares()->0->>'claims')::int = 2,
  '3.40 the holder lists their own share: active, two credentials');
RESET ROLE;

-- Expiry and revocation: one unavailable payload.
UPDATE public.sp_social_shares SET expires_at = now() - interval '1 second', created_at = now() - interval '1 day'
 WHERE public_id = (SELECT pid FROM made);
SELECT pg_temp.ok(
  public.sp_get_social_share((SELECT pid FROM made)) = '{"status":"unavailable"}'::jsonb,
  '3.41 an expired share answers the one unavailable payload');
UPDATE public.sp_social_shares SET expires_at = now() + interval '30 days'
 WHERE public_id = (SELECT pid FROM made);
SELECT pg_temp.ok(public.sp_get_social_share((SELECT pid FROM made))->>'status' = 'active',
  '3.42 (control) it was the expiry that closed it');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(public.sp_revoke_social_share((SELECT pid FROM made))->>'status' = 'revoked',
  '3.43 the holder revokes their share');
SELECT pg_temp.ok(public.sp_revoke_social_share((SELECT pid FROM made))->>'status' = 'revoked',
  '3.44 revoking again is harmless');
RESET ROLE;
SELECT pg_temp.ok(
  public.sp_get_social_share((SELECT pid FROM made)) = '{"status":"unavailable"}'::jsonb,
  '3.45 a revoked share answers the identical unavailable payload');
SELECT pg_temp.ok(
  (SELECT revoked_at IS NOT NULL FROM public.sp_social_shares WHERE public_id = (SELECT pid FROM made)),
  '3.46 revocation is stamped on the share');

-- A holder's other shares are bounded.
DO $$
DECLARE _i integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  FOR _i IN 1..25 LOOP
    PERFORM public.sp_create_social_share(
      ARRAY['5c000000-0000-4000-8000-000000000006']::uuid[], 'en', 7, 'full_name',
      gen_random_uuid());
  END LOOP;
  BEGIN
    PERFORM public.sp_create_social_share(
      ARRAY['5c000000-0000-4000-8000-000000000006']::uuid[], 'en', 7, 'full_name',
      gen_random_uuid());
    RAISE EXCEPTION 'ASSERTION FAILED: 3.47 the 26th active share was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%SP_TOO_MANY_SOCIAL_SHARES%' THEN RAISE; END IF;
    RAISE NOTICE 'ok  3.47 at most 25 public shares are active at once';
  END;
  RESET ROLE;
END $$;

-- The private link mechanism is a separate structure and is not touched.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM information_schema.table_constraints c
               JOIN information_schema.constraint_column_usage u USING (constraint_name, constraint_schema)
              WHERE c.table_name IN ('sp_social_shares', 'sp_social_share_items')
                AND u.table_name = 'sp_disclosures'),
  '3.48 a public share has no relation to a private disclosure token');

-- Deleting the holder removes their public shares.
SAVEPOINT holder_gone;
DELETE FROM auth.users WHERE id = '5a000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_social_shares
                    WHERE holder_user_id = '5a000000-0000-4000-8000-000000000003') = 0
                  AND NOT EXISTS (SELECT 1 FROM public.sp_social_share_items),
  '3.49 deleting the account deletes its public shares');
ROLLBACK TO SAVEPOINT holder_gone;

-- ── GROUP 4: the anonymous boundary ─────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 4 — boundary'; END $$;
SELECT pg_temp.ok(
  has_function_privilege('anon', 'public.sp_get_social_share(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_create_social_share(uuid[],text,integer,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_revoke_social_share(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_list_my_social_shares()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_my_passport_number()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_assign_passport_number(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_designate_founder(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_network_counts_holder(uuid)', 'EXECUTE'),
  '4.1 of everything added, anon may execute exactly one read');
SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.sp_social_shares', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.sp_social_share_items', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.sp_passport_numbers', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.sp_passport_numbers_retired', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.sp_passport_numbers_retired', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.sp_social_share_items', 'SELECT'),
  '4.2 no table is readable by anon, and the pin and retired tables by no client role');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('sp_passport_numbers','sp_passport_numbers_retired','sp_social_shares','sp_social_share_items')
      AND c.relrowsecurity) = 4,
  '4.3 row level security is on for all four new tables');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
               WHERE table_schema = 'public'
                 AND table_name IN ('sp_passport_numbers','sp_passport_numbers_retired','sp_social_shares','sp_social_share_items')
                 AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
                 AND grantee IN ('anon','authenticated','PUBLIC','service_role')),
  '4.4 no role holds a write privilege on any new table (writes go through the functions)');
SELECT pg_temp.ok(
  (SELECT bool_and(p.prosecdef AND p.proconfig IS NOT NULL AND 'search_path' = ANY (
        ARRAY(SELECT split_part(c, '=', 1) FROM unnest(p.proconfig) c)))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sp_get_social_share','sp_create_social_share','sp_revoke_social_share',
                        'sp_list_my_social_shares','sp_assign_passport_number','sp_designate_founder',
                        'sp_my_passport_number','sp_network_counts_holder','sp_network_stats')),
  '4.5 every definer function pins its search_path');

-- Existing structures are unchanged: no existing table gained a policy or a grant here.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sp_passport_profiles') = 4
  AND NOT has_table_privilege('anon', 'public.sp_passport_profiles', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.sp_claims', 'SELECT'),
  '4.6 the Passport tables keep their policies and stay closed to anon');

-- ── GROUP 5: the real rollback, and re-applying ─────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 5 — rollback'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_passport_numbers) > 0 AND (SELECT count(*) FROM public.sp_social_shares) > 0,
  '5.1 (setup) numbers and public shares exist');

-- The REAL rollback file, run as written, refuses while it would destroy data.
SELECT set_config('app.sp_rollback_confirm', '', true);
\set rb `cat supabase/rollback/20270217090000_sp_passport_number_and_social_share_rollback.sql`
SELECT pg_temp.must_fail(:'rb', 'SP_NUMBER_ROLLBACK_REFUSED',
  '5.2 the rollback refuses to erase Passport numbers and public shares without an explicit confirmation');
SELECT pg_temp.ok(to_regclass('public.sp_passport_numbers') IS NOT NULL
                  AND to_regclass('public.sp_social_shares') IS NOT NULL,
  '5.3 and after the refusal nothing has been dropped');

-- Only the HISTORY remains: no number, no share. Dropping it would let a number
-- be issued twice, so the rollback must still refuse.
DELETE FROM public.sp_social_shares;
DELETE FROM public.sp_passport_numbers;
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_passport_numbers) = 0
                  AND (SELECT count(*) FROM public.sp_passport_numbers_retired) > 0,
  '5.3a (setup) only retired-number history remains');
SELECT pg_temp.must_fail(:'rb', 'SP_NUMBER_ROLLBACK_REFUSED',
  '5.3b the rollback refuses when only the retired-number history remains');

SELECT set_config('app.sp_rollback_confirm', 'drop-numbers-and-shares', true);
\i supabase/rollback/20270217090000_sp_passport_number_and_social_share_rollback.sql
SELECT pg_temp.ok(
  to_regclass('public.sp_passport_numbers') IS NULL
  AND to_regclass('public.sp_social_shares') IS NULL
  AND to_regprocedure('public.sp_get_social_share(text)') IS NULL
  AND to_regprocedure('public.sp_designate_founder(uuid)') IS NULL
  AND to_regprocedure('public.sp_network_counts_holder(uuid)') IS NULL,
  '5.4 the confirmed rollback removes every object it added');
SELECT pg_temp.ok(
  (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sp_network_stats') = '49f4cf6204e44e9345e886aa74ebfba7',
  '5.5 sp_network_stats is restored to the previous definition, byte for byte');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'sp_passport_number_on_complete_trg') = 0,
  '5.6 the profile trigger is gone');

\i supabase/migrations/20270217090000_sp_passport_number_and_social_share.sql
SELECT pg_temp.ok(
  to_regclass('public.sp_passport_numbers') IS NOT NULL
  AND to_regprocedure('public.sp_get_social_share(text)') IS NOT NULL
  AND (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sp_network_stats') <> '49f4cf6204e44e9345e886aa74ebfba7',
  '5.7 the migration re-applies cleanly after a rollback');

ROLLBACK;
\echo '    ok  Security Passport number and public social share assertions passed'
