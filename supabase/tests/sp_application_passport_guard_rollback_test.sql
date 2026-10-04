-- F09 rollback contract. Exercise the actual rollback file transactionally;
-- leave the fully migrated schema in place for every following suite.
\set ON_ERROR_STOP on

DO $$ BEGIN
  IF to_regprocedure('public.sp_require_application_verified_content()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.sp_disclosures'::regclass
         AND tgname = 'sp_application_verified_content'
         AND tgfoid = to_regprocedure('public.sp_require_application_verified_content()')
         AND NOT tgisinternal AND tgenabled = 'O'
     ) THEN
    RAISE EXCEPTION 'F09 rollback test requires the active application guard';
  END IF;
  RAISE NOTICE 'ok  F09 rollback precondition: correct function and enabled trigger installed';
END $$;

BEGIN;
\ir ../rollback/20270215090000_application_passport_verified_content_guard_rollback.sql
DO $$ BEGIN
  IF to_regprocedure('public.sp_require_application_verified_content()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sp_disclosures'::regclass
                AND tgname = 'sp_application_verified_content') THEN
    RAISE EXCEPTION 'F09 rollback left its function or trigger installed';
  END IF;
  RAISE NOTICE 'ok  F09 rollback removes its trigger and function';
END $$;
ROLLBACK;

DO $$ BEGIN
  IF to_regprocedure('public.sp_require_application_verified_content()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.sp_disclosures'::regclass
         AND tgname = 'sp_application_verified_content'
         AND tgfoid = to_regprocedure('public.sp_require_application_verified_content()')
         AND NOT tgisinternal AND tgenabled = 'O'
     ) THEN
    RAISE EXCEPTION 'F09 rollback test did not restore the current schema';
  END IF;
  RAISE NOTICE 'ok  F09 rollback verification restored the correct enabled guard';
END $$;
