-- P1-I (20270122090000): an approved organisation that changes its identity
-- goes back to review.
--
--   EI-F the fixture: approved employers E and X with distinct identities;
--        O owns E; P is a platform admin.
--   EI0  REPRODUCTION. With the hosted guard restored by the real rollback, O
--        gives E the name and organisation number of X; E stays active.
--   EI1  the same edit now returns E to 'pending', and E's owner loses every
--        active-organisation capability until moderation decides.
--   EI2  each material field alone -- name, organisation number, website,
--        country -- returns E to review.
--   EI3  profile edits (description, logo) and a cosmetic re-type of the name
--        (case, surrounding space) do not.
--   EI4  a platform admin's edit does not; moderation re-approves E.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

INSERT INTO auth.users (id, email) VALUES
  ('0f220000-0000-4000-8000-000000000001', 'ei-owner@test.invalid'),
  ('0f220000-0000-4000-8000-000000000002', 'ei-platform@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('0f220000-0000-4000-8000-000000000002', 'admin');
INSERT INTO public.employers (id, name, slug, status, registration_number, website, country) VALUES
  ('0f220000-1111-4000-8000-000000000001', 'EI Bevakning AB', 'ei-bevakning', 'active', '556000-0001', 'https://ei-bevakning.example', 'SE'),
  ('0f220000-1111-4000-8000-000000000009', 'EI Annan Säkerhet AB', 'ei-annan', 'active', '556000-0009', 'https://ei-annan.example', 'SE');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f220000-1111-4000-8000-000000000001', '0f220000-0000-4000-8000-000000000001', 'owner', 'active');

-- O updates E with _set. Returns rows updated, or the error code.
CREATE OR REPLACE FUNCTION pg_temp.edit(_as text, _set text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _n bigint; _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _as, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE format('UPDATE public.employers SET %s WHERE id = %L', _set, '0f220000-1111-4000-8000-000000000001');
    GET DIAGNOSTICS _n = ROW_COUNT; _r := 'ok:' || _n;
  EXCEPTION WHEN OTHERS THEN _r := 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.status() RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.employers WHERE id = '0f220000-1111-4000-8000-000000000001';
$$;
-- Put E back to active, the way moderation does (fixture only).
CREATE OR REPLACE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = 'active', name = 'EI Bevakning AB', registration_number = '556000-0001',
         website = 'https://ei-bevakning.example', country = 'SE'
   WHERE id = '0f220000-1111-4000-8000-000000000001';
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;

SELECT pg_temp.ok(pg_temp.status() = 'active'
  AND public.has_active_employer_role('0f220000-0000-4000-8000-000000000001', '0f220000-1111-4000-8000-000000000001', ARRAY['owner']),
  'EI-F E is approved and O acts as its owner');

-- ── EI0 reproduction on the hosted guard ─────────────────────────────────
SAVEPOINT pre_fix;
\ir ../rollback/20270122090000_employer_identity_rereview_rollback.sql
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001',
    'name = ''EI Annan Säkerhet AB'', registration_number = ''556000-0009''') = 'ok:1'
  AND pg_temp.status() = 'active',
  'EI0.1 REPRODUCTION: pre-fix, O gives E another organisation''s name and number and E stays approved');
ROLLBACK TO SAVEPOINT pre_fix;

-- ── EI1 the same edit returns E to review ────────────────────────────────
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001',
    'name = ''EI Annan Säkerhet AB'', registration_number = ''556000-0009''') = 'ok:1'
  AND pg_temp.status() = 'pending',
  'EI1.1 the copied identity is saved, and E is back in review (pending)');
SELECT pg_temp.ok(NOT public.has_active_employer_role('0f220000-0000-4000-8000-000000000001', '0f220000-1111-4000-8000-000000000001', ARRAY['owner']),
  'EI1.2 until moderation decides, O has no active-organisation capability');

-- ── EI2 each material field alone ────────────────────────────────────────
SELECT pg_temp.reset();
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001', 'name = ''EI Ny Bevakning AB''') = 'ok:1'
  AND pg_temp.status() = 'pending', 'EI2.1 a new name returns E to review');
SELECT pg_temp.reset();
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001', 'registration_number = ''556000-0002''') = 'ok:1'
  AND pg_temp.status() = 'pending', 'EI2.2 a new organisation number returns E to review');
SELECT pg_temp.reset();
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001', 'website = ''https://ei-annan.example''') = 'ok:1'
  AND pg_temp.status() = 'pending', 'EI2.3 a new website returns E to review');
SELECT pg_temp.reset();
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001', 'country = ''NO''') = 'ok:1'
  AND pg_temp.status() = 'pending', 'EI2.4 a new country returns E to review');

-- ── EI3 profile edits and cosmetic re-types do not ───────────────────────
SELECT pg_temp.reset();
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001',
    'description_sv = ''Vi bevakar.'', description_en = ''We guard.'', logo_url = ''https://ei-bevakning.example/logo.png''') = 'ok:1'
  AND pg_temp.status() = 'active', 'EI3.1 description and logo edits keep E approved');
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001', 'name = ''  ei bevakning ab ''') = 'ok:1'
  AND pg_temp.status() = 'active', 'EI3.2 a case/space-only re-type of the name keeps E approved');

-- ── EI4 the platform path and re-approval ───────────────────────────────
SELECT pg_temp.reset();
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000002', 'name = ''EI Bevakning Sverige AB''') = 'ok:1'
  AND pg_temp.status() = 'active', 'EI4.1 a platform admin''s identity correction keeps E approved');
SELECT pg_temp.ok(pg_temp.edit('0f220000-0000-4000-8000-000000000001', 'name = ''EI Bevakning Norden AB''') = 'ok:1'
  AND pg_temp.status() = 'pending', 'EI4.2 O''s rename sends E to review');
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f220000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.moderate_employer('0f220000-1111-4000-8000-000000000001', 'approved', 'EI: ny identitet granskad');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.status() = 'active'
  AND (SELECT name FROM public.employers WHERE id = '0f220000-1111-4000-8000-000000000001') = 'EI Bevakning Norden AB',
  'EI4.3 moderation re-approves E under the reviewed identity');

ROLLBACK;
