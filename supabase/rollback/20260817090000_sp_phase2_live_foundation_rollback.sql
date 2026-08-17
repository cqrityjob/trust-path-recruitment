-- =============================================================================
-- ROLLBACK — Security Passport Phase 2 Live Foundation
--
-- Reverses 20260817090000_sp_phase2_live_foundation.sql completely.
--
-- ── WHY THIS IS SAFE ───────────────────────────────────────────────────
--
-- The forward migration is purely additive: it creates six `sp_*` tables,
-- four `sp_*` functions and their triggers/policies, and touches no
-- pre-existing object. Its only dependencies on the existing schema are
-- READ references — `auth.users`, `public.employers` and the shared
-- `public.set_updated_at()` helper — none of which is modified.
--
-- So dropping the `sp_*` objects restores the database to exactly its prior
-- state. No other object references them: verified by the FK query at the
-- foot of this file, which fails loudly if that ever stops being true.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
-- Every Security Passport a holder created. That is the intended meaning of
-- rolling back this release — the feature did not ship — but it IS data
-- loss for anyone who used it in the window, so prefer fixing forward once
-- real Passports exist. Before running this in anger, export:
--
--   \copy (SELECT * FROM public.sp_passport_profiles)  TO 'sp_profiles.csv'  CSV HEADER
--   \copy (SELECT * FROM public.sp_experience_periods) TO 'sp_periods.csv'   CSV HEADER
--   \copy (SELECT * FROM public.sp_claims)             TO 'sp_claims.csv'    CSV HEADER
--   \copy (SELECT * FROM public.sp_passport_events)    TO 'sp_events.csv'    CSV HEADER
--
-- Run inside a transaction so a partial rollback cannot happen.
-- =============================================================================

BEGIN;

-- 1. Guard: refuse to run if anything outside the sp_* domain has taken a
--    dependency on these tables since the forward migration. Dropping them
--    would then be destructive to another domain, which this script must
--    never be.
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid
   WHERE con.contype = 'f'
     AND tgt.relname LIKE 'sp\_%'
     AND src.relname NOT LIKE 'sp\_%';
  IF _n > 0 THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % foreign key(s) outside the sp_* domain now depend on these tables', _n;
  END IF;
END $$;

-- 2. Functions (and, with them, the triggers that reference them).
DROP FUNCTION IF EXISTS public.sp_correct_claim(uuid, text, text, text, date, date, date, text);
DROP FUNCTION IF EXISTS public.sp_withdraw_claim(uuid, text);

-- 3. Tables. CASCADE removes their own triggers, policies, indexes and
--    constraints. Ordered child-first so the intent is explicit even though
--    CASCADE would cope either way.
DROP TABLE IF EXISTS public.sp_passport_events    CASCADE;
DROP TABLE IF EXISTS public.sp_claims             CASCADE;
DROP TABLE IF EXISTS public.sp_experience_periods CASCADE;
DROP TABLE IF EXISTS public.sp_passport_profiles  CASCADE;
DROP TABLE IF EXISTS public.sp_recognition_policies CASCADE;
DROP TABLE IF EXISTS public.sp_jurisdictions      CASCADE;

-- 4. Guard functions last: the triggers using them are gone with the tables.
DROP FUNCTION IF EXISTS public.sp_guard_trust_fields_immutable();
DROP FUNCTION IF EXISTS public.sp_guard_events_append_only();

-- 5. Assert a clean reversal.
DO $$
DECLARE _objects integer; _functions integer;
BEGIN
  SELECT count(*) INTO _objects
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'sp\_%';
  SELECT count(*) INTO _functions
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'sp\_%';
  IF _objects <> 0 OR _functions <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % object(s), % function(s) remain', _objects, _functions;
  END IF;
  RAISE NOTICE 'Security Passport Phase 2 rolled back cleanly.';
END $$;

COMMIT;
