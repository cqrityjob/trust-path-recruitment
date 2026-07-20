-- Phase H3.2 local validation — test runner.
-- Convention (reused from phase-g1/phase-h3-1):
--   SELECT set_config('request.jwt.claim.sub', '<uuid>', false); SET ROLE authenticated;
--   RESET ROLE; to reset.

\set ON_ERROR_STOP off
\pset pager off

\echo '=== T1: owner of a PENDING employer can update name/website/country/registration_number/description ==='
SELECT set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employers
  SET name = 'Fictional Company A Renamed',
      website = 'https://example.invalid',
      country = 'NO',
      registration_number = '556677-1234',
      description_sv = 'Uppdaterad beskrivning'
  WHERE id = 'e0000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT name, website, country, registration_number, description_sv FROM public.employers WHERE id = 'e0000001-0000-0000-0000-000000000001';

\echo '=== T2: plain member (not owner/admin) CANNOT update ==='
SELECT set_config('request.jwt.claim.sub', 'd0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
UPDATE public.employers SET name = 'Should not change' WHERE id = 'e0000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT name FROM public.employers WHERE id = 'e0000001-0000-0000-0000-000000000001';

\echo '=== T3: owner CANNOT change status via direct UPDATE ==='
SELECT set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employers SET status = 'active' WHERE id = 'e0000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e0000001-0000-0000-0000-000000000001';

\echo '=== T4: owner CANNOT change slug via direct UPDATE ==='
SELECT set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employers SET slug = 'renamed-slug-attempt' WHERE id = 'e0000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT slug FROM public.employers WHERE id = 'e0000001-0000-0000-0000-000000000001';

\echo '=== T5: owner CAN change name in the SAME statement that leaves status/slug untouched (sanity: guard is field-specific, not a blanket block) ==='
SELECT set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employers SET name = 'Fictional Company A Renamed Again' WHERE id = 'e0000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT name, status, slug FROM public.employers WHERE id = 'e0000001-0000-0000-0000-000000000001';

\echo '=== T6: owner of a SUSPENDED employer cannot update at all (employer_members_can_edit false) ==='
SELECT set_config('request.jwt.claim.sub', 'd0000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
UPDATE public.employers SET name = 'Should not change either' WHERE id = 'e0000003-0000-0000-0000-000000000003';
RESET ROLE;
SELECT name FROM public.employers WHERE id = 'e0000003-0000-0000-0000-000000000003';

\echo '=== T7: cross-tenant -- owner of company A cannot update company B ==='
SELECT set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employers SET name = 'Hijacked' WHERE id = 'e0000002-0000-0000-0000-000000000002';
RESET ROLE;
SELECT name FROM public.employers WHERE id = 'e0000002-0000-0000-0000-000000000002';

\echo '=== T8: platform admin CAN change status (exempt from the non-admin guard) ==='
SELECT set_config('request.jwt.claim.sub', 'd0000005-0000-0000-0000-000000000005', false);
SET ROLE authenticated;
UPDATE public.employers SET status = 'active' WHERE id = 'e0000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e0000001-0000-0000-0000-000000000001';

\echo '=== T9: anon cannot update at all ==='
SET ROLE anon;
UPDATE public.employers SET name = 'Anon should not do this' WHERE id = 'e0000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT name FROM public.employers WHERE id = 'e0000001-0000-0000-0000-000000000001';

\echo '=== T10: confirm the new policy exists exactly as expected, nothing else changed on employers ==='
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='employers' ORDER BY policyname;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.employers'::regclass AND NOT tgisinternal;

\echo '=== DONE ==='
