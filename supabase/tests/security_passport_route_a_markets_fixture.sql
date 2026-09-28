-- Security Passport -- the three pilot markets, pinned to INTERNAL pilot.
--
-- Included (\ir) by the suites that prove the members-only route (Route A,
-- owner decision 2026-09-18): an internal_pilot definition in an
-- internal_pilot pack is registrable by a valid member of THAT pack, and by
-- nobody else.
--
-- Since 20261221090000 Great Britain, Northern Ireland and Dubai are a PUBLIC
-- pilot in the replayed database. Route A is unchanged and still governs every
-- market in internal pilot, and these suites go on proving it on the markets
-- they were written against: inside the including suite's OWN transaction,
-- which always ends in ROLLBACK, the three packs and the definitions that
-- migration opened go back to internal_pilot. Nothing is committed.
--
-- A no-op before 20261221090000. The public pilot itself -- every signed-in
-- holder, no grant -- is proven by security_passport_open_uk_dubai_test.sql.
--
-- Refuses to run outside a transaction block, where it would commit.

-- Outside a transaction block every statement commits on its own, so a
-- temporary table created ON COMMIT DROP is gone by the next statement; inside
-- BEGIN it is still there.
CREATE TEMP TABLE IF NOT EXISTS _route_a_fixture_guard (x int) ON COMMIT DROP;
DO $$
BEGIN
  IF to_regclass('pg_temp._route_a_fixture_guard') IS NULL THEN
    RAISE EXCEPTION 'ROUTE_A_FIXTURE: include this inside BEGIN ... ROLLBACK, never at top level';
  END IF;
END $$;

UPDATE public.sp_market_packs
   SET pilot_state = 'internal_pilot'
 WHERE code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'public_pilot';
UPDATE public.sp_credential_types
   SET pilot_state = 'internal_pilot'
 WHERE market_pack_code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'public_pilot';
