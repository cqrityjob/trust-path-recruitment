-- Removes the rollback fixtures so the suites that follow see the database
-- they expect. Deliberately explicit about which rows: a cleanup that deleted
-- by pattern would be the destructive operation these files exist to test for.

\set ON_ERROR_STOP on

DELETE FROM public.sp_claim_certification_lifecycle WHERE holder_user_id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444');
DELETE FROM public.sp_passport_events WHERE holder_user_id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444');
DELETE FROM public.sp_claims WHERE holder_user_id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444');
DELETE FROM public.sp_pilot_members WHERE user_id = '22222222-2222-4222-8222-222222222222';
DELETE FROM public.sp_passport_profiles WHERE holder_user_id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444');
DELETE FROM public.user_roles WHERE user_id = '33333333-3333-4333-8333-333333333333';
DELETE FROM auth.users WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444');
DROP TABLE IF EXISTS public.zz_rollback_fixture_snapshot;
