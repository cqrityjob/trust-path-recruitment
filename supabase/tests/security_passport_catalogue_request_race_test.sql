-- Security Passport — the catalogue-request allowance under real concurrency.
--
-- Covers the per-holder lock in sp_request_catalogue_definition and in the
-- reopen transition of sp_admin_resolve_catalogue_request
-- (20270212090000_sp_catalogue_research_foundation.sql).
--
-- One psql session cannot demonstrate this race: its second call would read a
-- committed row whether or not anything ever blocked. The two sessions are run
-- by scripts/catalogue-request-race-test.sh; this file is its fixture
-- (-v phase=setup) and its verdict (-v phase=verify -v holder=<uuid>
-- -v expect_open=<n>). It runs in a throwaway clone database and COMMITS its
-- fixtures, because the two sessions must see them.
--
-- Synthetic holders only.
\set ON_ERROR_STOP on

\if :{?phase}
\else
  \echo 'catalogue request race: pass -v phase=setup or -v phase=verify'
  \quit
\endif

SELECT :'phase' = 'setup' AS is_setup \gset
\if :is_setup

BEGIN;
INSERT INTO auth.users(id, email) VALUES
  ('fd280000-0000-4000-8000-000000000001', 'request-race-two-requests@fixture.invalid'),
  ('fd280000-0000-4000-8000-000000000002', 'request-race-reopen@fixture.invalid'),
  ('fd280000-0000-4000-8000-000000000003', 'request-race-control-requests@fixture.invalid'),
  ('fd280000-0000-4000-8000-000000000004', 'request-race-control-reopen@fixture.invalid'),
  ('fd280000-0000-4000-8000-0000000000ad', 'request-race-admin@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id, jurisdiction_code) VALUES
  ('fd280000-0000-4000-8000-000000000001', 'SE'),
  ('fd280000-0000-4000-8000-000000000002', 'SE'),
  ('fd280000-0000-4000-8000-000000000003', 'SE'),
  ('fd280000-0000-4000-8000-000000000004', 'SE');
INSERT INTO public.user_roles(user_id, role) VALUES ('fd280000-0000-4000-8000-0000000000ad', 'admin');

-- Every holder starts one below the allowance: nine open requests.
INSERT INTO public.sp_catalogue_requests (holder_user_id, requested_name, requested_issuer)
SELECT h.id, 'Race fixture award ' || i, 'Race Fixture Body'
  FROM (VALUES ('fd280000-0000-4000-8000-000000000001'::uuid),
               ('fd280000-0000-4000-8000-000000000002'::uuid),
               ('fd280000-0000-4000-8000-000000000003'::uuid),
               ('fd280000-0000-4000-8000-000000000004'::uuid)) h(id),
       generate_series(1, 9) i;
-- The reopen holders also have one declined request an administrator can reopen.
INSERT INTO public.sp_catalogue_requests
  (id, holder_user_id, requested_name, requested_issuer, status, resolution_note, resolved_at)
VALUES
  ('fd28aaaa-0000-4000-8000-000000000002', 'fd280000-0000-4000-8000-000000000002',
   'Race declined award', 'Race Fixture Body', 'declined', 'Declined in the fixture.', now()),
  ('fd28aaaa-0000-4000-8000-000000000004', 'fd280000-0000-4000-8000-000000000004',
   'Race declined award', 'Race Fixture Body', 'declined', 'Declined in the fixture.', now());
COMMIT;

DO $$ BEGIN
  IF (SELECT count(*) FROM public.sp_catalogue_requests
       WHERE holder_user_id::text LIKE 'fd280000-%' AND status = 'open') <> 36 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RR0 the fixture is not four holders with nine open requests each';
  END IF;
  RAISE NOTICE 'ok  RR0 four synthetic holders each start with nine open requests';
END $$;

\else

-- The verdict for one holder after one race.
SELECT set_config('rr.holder', :'holder', false), set_config('rr.expect_open', :'expect_open', false);
DO $$
DECLARE
  _holder uuid := current_setting('rr.holder')::uuid;
  _expect integer := current_setting('rr.expect_open')::integer;
  _open integer;
BEGIN
  SELECT count(*) INTO _open FROM public.sp_catalogue_requests
   WHERE holder_user_id = _holder AND status = 'open';
  IF _open <> _expect THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RR1 holder % has % open requests after the race, expected %',
      _holder, _open, _expect;
  END IF;
  RAISE NOTICE 'ok  RR1 holder ends the race with exactly % open requests', _open;
END $$;

\endif
