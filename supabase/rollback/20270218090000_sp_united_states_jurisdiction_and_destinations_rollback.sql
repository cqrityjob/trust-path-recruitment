-- =============================================================================
-- ROLLBACK for 20270218090000_sp_united_states_jurisdiction_and_destinations.sql
-- =============================================================================
--
-- Removes the United States from sp_jurisdictions and sp_credential_jurisdictions
-- and restores the five-value destination vocabulary of 20261215090000, with
-- its cardinality cap of 5.
--
-- ── REFUSES ONCE ADOPTED ─────────────────────────────────────────────────
--
-- A profile that says its holder works in the United States, an employment
-- period or a general claim filed there, a definition-jurisdiction row naming
-- it, or a destination list that wants it, is a fact a person stated. A
-- rollback must not delete what a person said, and the foreign keys would
-- refuse to anyway. After adoption the supported path is a forward fix.
--
-- One transaction; refuses unless the world is what the migration left.
-- =============================================================================

BEGIN;

DO $$
DECLARE _n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sp_jurisdictions WHERE code = 'US') THEN
    RAISE EXCEPTION 'SP_US_ROLLBACK: the US jurisdiction is not present; nothing to roll back';
  END IF;

  SELECT (SELECT count(*) FROM public.sp_passport_profiles WHERE jurisdiction_code = 'US')
       + (SELECT count(*) FROM public.sp_claims WHERE jurisdiction_code = 'US')
       + (SELECT count(*) FROM public.sp_experience_periods WHERE jurisdiction_code = 'US')
       + (SELECT count(*) FROM public.sp_credential_definition_jurisdictions WHERE jurisdiction_code = 'US')
       + (SELECT count(*) FROM public.candidate_job_preferences WHERE 'US' = ANY (desired_destinations))
    INTO _n;
  IF _n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED_ADOPTED: % row(s) state the United States; forward-fix instead', _n;
  END IF;

  -- Never a market: the forward migration proved it and nothing since may have.
  IF EXISTS (SELECT 1 FROM public.sp_market_packs WHERE jurisdiction_code = 'US')
     OR EXISTS (SELECT 1 FROM public.sp_credential_types WHERE jurisdiction_code = 'US')
     OR EXISTS (SELECT 1 FROM public.sp_authorities WHERE jurisdiction_code = 'US')
     OR EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions WHERE jurisdiction_code = 'US') THEN
    RAISE EXCEPTION 'SP_US_ROLLBACK: regulatory rows name the United States; this rollback does not own them';
  END IF;
END $$;

ALTER TABLE public.candidate_job_preferences
  DROP CONSTRAINT candidate_job_preferences_desired_destinations_check;
ALTER TABLE public.candidate_job_preferences
  ADD CONSTRAINT candidate_job_preferences_desired_destinations_check
  CHECK (desired_destinations <@ ARRAY['IN','AE-DU','AE','GB','SE']::text[]
         AND cardinality(desired_destinations) <= 5
         AND array_position(desired_destinations, NULL) IS NULL);

COMMENT ON COLUMN public.candidate_job_preferences.desired_destinations IS NULL;

DELETE FROM public.sp_credential_jurisdictions WHERE code = 'US';
DELETE FROM public.sp_jurisdictions WHERE code = 'US';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sp_jurisdictions WHERE code = 'US')
     OR EXISTS (SELECT 1 FROM public.sp_credential_jurisdictions WHERE code = 'US') THEN
    RAISE EXCEPTION 'SP_US_ROLLBACK: the US rows survived';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidate_job_preferences'::regclass
       AND conname  = 'candidate_job_preferences_desired_destinations_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%''US''%'
       AND pg_get_constraintdef(oid) LIKE '%cardinality(desired_destinations) <= 5%'
  ) THEN
    RAISE EXCEPTION 'SP_US_ROLLBACK: the destination CHECK was not restored';
  END IF;
  RAISE NOTICE 'SP_UNITED_STATES_JURISDICTION_ROLLBACK ok';
END $$;

COMMIT;
