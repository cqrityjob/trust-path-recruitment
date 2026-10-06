-- =============================================================================
-- Security Passport -- the United States as a country a person may STATE, and a
-- destination a person may WANT. Nothing opens.
-- =============================================================================
--
-- PR 1 of the global-registration delivery (schema first, the app follows).
-- DATA ONLY against existing tables: one jurisdiction row, one credential-
-- jurisdiction row, one widened CHECK. No object is created, replaced or
-- dropped; the application's generated types are unaffected.
--
-- ── WHAT A HOLDER COULD NOT SAY ──────────────────────────────────────────
--
-- Four facts about a person are kept apart in this schema, and each has its
-- own vocabulary:
--
--   where they LIVE               candidate_current_location    any ISO country
--   where they WORK now           sp_passport_profiles          sp_jurisdictions
--   where they would LIKE to work candidate_job_preferences     a closed list
--   where a CREDENTIAL is valid   sp_claims / the definition    the catalogue
--
-- A person living in Texas could already record that (the first row takes any
-- ISO code). They could not say that they WORK in the United States, because
-- sp_jurisdictions held SE, GB, AE and IN and the profile's foreign key refuses
-- anything else, and they could not WANT to work there, because the
-- destination CHECK lists five markets. The product therefore had no truthful
-- answer for the market the owner has now prioritised, and the only options
-- were to leave the field empty or to pick a country that is not true.
--
-- ── WHAT CHANGES ──────────────────────────────────────────────────────────
--
--   sp_jurisdictions              + US  (Swedish "USA", English "United States")
--   sp_credential_jurisdictions   + US, national. The 20261118100000 seed copied
--                                 sp_jurisdictions ONCE; a later country has to
--                                 be added by hand or the international form's
--                                 country filter cannot name it.
--   candidate_job_preferences     the destination vocabulary admits 'US'; the
--                                 cardinality cap grows with it (one per value)
--
-- ── WHAT DOES NOT CHANGE, AND IS PROVED BELOW ─────────────────────────────
--
--   * No market pack. sp_market_access(_, 'US') answers 'closed' for everyone,
--     by the same COALESCE that answers for an unknown code.
--   * No credential definition, no authority, no regulated role, no title, no
--     regulatory source. The approved catalogue is byte-for-byte what it was.
--   * No claim can be filed under 'US': a regulated claim names a definition,
--     and no definition names this country; a general claim's jurisdiction is
--     provenance, which a foreign key to this table already permitted for the
--     four countries and now permits for a fifth.
--   * Stating the United States as a work country grants nothing. The claim
--     rules read the definition's own territory and the pack table, never the
--     profile; the work country decides which catalogue is SHOWN first, and
--     for this country that catalogue is empty. The international
--     certifications stay available from any country, as they always were,
--     and none of them is a US work licence.
--
-- State catalogues (Texas, California, Florida ...) are NOT here. The
-- sub-jurisdiction model (sp_sub_jurisdictions, 20260907090000) can carry them
-- as 'US-TX' and so on once a reviewed source names each state's licensing
-- authority; the proposal is docs/passport/united-states-market-entry.md and it
-- authors nothing until the owner decides.
--
-- One transaction: the change and its proof commit together or not at all.
--
-- Rollback: supabase/rollback/20270219090000_sp_united_states_jurisdiction_and_destinations_rollback.sql
-- =============================================================================

BEGIN;

-- What must stand still, fingerprinted BEFORE anything moves.
CREATE TEMP TABLE _sp_us_before ON COMMIT DROP AS
SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.code), ''))
     FROM public.sp_market_packs p)                                                     AS packs,
  (SELECT md5(coalesce(string_agg(t.code || ':' || t.is_active::text || ':' || t.pilot_state
                                  || ':' || t.legal_review_state, '|' ORDER BY t.code), ''))
     FROM public.sp_credential_types t)                                                AS definitions,
  (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
     FROM public.sp_claims c)                                                           AS claims,
  (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY a.code), ''))
     FROM public.sp_authorities a)                                                      AS authorities,
  (SELECT count(*) FROM public.sp_jurisdictions)                                        AS jurisdictions,
  (SELECT count(*) FROM public.sp_credential_jurisdictions)                             AS credential_jurisdictions;

-- ── Preflight ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sp_jurisdictions WHERE code = 'US') THEN
    RAISE EXCEPTION 'SP_US_PREFLIGHT: sp_jurisdictions already holds US; this migration has run';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_jurisdictions WHERE code = 'US') THEN
    RAISE EXCEPTION 'SP_US_PREFLIGHT: sp_credential_jurisdictions already holds US';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidate_job_preferences'::regclass
       AND conname  = 'candidate_job_preferences_desired_destinations_check'
       AND pg_get_constraintdef(oid) LIKE '%''IN''%''AE-DU''%''AE''%''GB''%''SE''%'
       AND pg_get_constraintdef(oid) NOT LIKE '%''US''%'
  ) THEN
    RAISE EXCEPTION 'SP_US_PREFLIGHT: the destination CHECK is not the 20261215090000 vocabulary';
  END IF;
END $$;

-- ── 1. A country a person may state ───────────────────────────────────────
INSERT INTO public.sp_jurisdictions (code, name_sv, name_en)
VALUES ('US', 'USA', 'United States')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.sp_credential_jurisdictions
  (code, jurisdiction_type, country_code, subdivision_code, name_original, name_sv, name_en)
VALUES ('US', 'national', 'US', NULL, 'United States', 'USA', 'United States')
ON CONFLICT (code) DO NOTHING;

-- ── 2. A destination a person may want ────────────────────────────────────
-- Replaced whole, with the same name, so the next migration that widens it
-- finds one constraint and the rollback can restore the previous text exactly.
ALTER TABLE public.candidate_job_preferences
  DROP CONSTRAINT candidate_job_preferences_desired_destinations_check;
ALTER TABLE public.candidate_job_preferences
  ADD CONSTRAINT candidate_job_preferences_desired_destinations_check
  CHECK (desired_destinations <@ ARRAY['IN','AE-DU','AE','GB','SE','US']::text[]
         AND cardinality(desired_destinations) <= 6
         AND array_position(desired_destinations, NULL) IS NULL);

COMMENT ON COLUMN public.candidate_job_preferences.desired_destinations IS
  'Where the candidate would LIKE to work, from a closed vocabulary: IN, AE-DU '
  '(Dubai), AE (the other emirates), GB, SE and, since 20270219090000, US. A '
  'preference: it grants no market, changes no work country and no credential '
  'jurisdiction, and says nothing about permission to work.';

-- ── Postflight: exactly this, and nothing else ────────────────────────────
DO $$
DECLARE _b _sp_us_before%ROWTYPE;
BEGIN
  SELECT * INTO _b FROM _sp_us_before;

  IF NOT EXISTS (SELECT 1 FROM public.sp_jurisdictions WHERE code = 'US' AND is_active
                   AND name_sv = 'USA' AND name_en = 'United States') THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: the US jurisdiction row is missing or misnamed';
  END IF;
  IF (SELECT count(*) FROM public.sp_jurisdictions) <> _b.jurisdictions + 1 THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: expected exactly one new jurisdiction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_credential_jurisdictions
                  WHERE code = 'US' AND jurisdiction_type = 'national' AND country_code = 'US'
                    AND subdivision_code IS NULL AND is_active) THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: the US credential-jurisdiction row is missing';
  END IF;
  IF (SELECT count(*) FROM public.sp_credential_jurisdictions) <> _b.credential_jurisdictions + 1 THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: expected exactly one new credential jurisdiction';
  END IF;

  -- Nothing opens. No pack, no definition, no authority names this country.
  IF EXISTS (SELECT 1 FROM public.sp_market_packs WHERE jurisdiction_code = 'US')
     OR EXISTS (SELECT 1 FROM public.sp_credential_types WHERE jurisdiction_code = 'US')
     OR EXISTS (SELECT 1 FROM public.sp_authorities WHERE jurisdiction_code = 'US')
     OR EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions WHERE jurisdiction_code = 'US') THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: something regulatory names the United States; nothing may';
  END IF;
  IF public.sp_market_access(NULL, 'US') <> 'closed' THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: sp_market_access must answer closed for a country with no pack';
  END IF;

  -- The destination vocabulary is exactly the six, and still refuses NULL and duplicates.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidate_job_preferences'::regclass
       AND conname  = 'candidate_job_preferences_desired_destinations_check'
       AND pg_get_constraintdef(oid) LIKE '%''US''%'
       AND pg_get_constraintdef(oid) LIKE '%cardinality(desired_destinations) <= 6%'
  ) THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: the destination CHECK was not widened as expected';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidate_job_preferences'::regclass
       AND conname  = 'candidate_job_preferences_destinations_distinct'
  ) THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: the distinct-destinations constraint must survive';
  END IF;

  -- What must stand still, stood still.
  IF (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.code), ''))
        FROM public.sp_market_packs p) IS DISTINCT FROM _b.packs THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: a market pack changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(t.code || ':' || t.is_active::text || ':' || t.pilot_state
                                     || ':' || t.legal_review_state, '|' ORDER BY t.code), ''))
        FROM public.sp_credential_types t) IS DISTINCT FROM _b.definitions THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: a definition''s availability or review state changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
        FROM public.sp_claims c) IS DISTINCT FROM _b.claims THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: a claim changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY a.code), ''))
        FROM public.sp_authorities a) IS DISTINCT FROM _b.authorities THEN
    RAISE EXCEPTION 'SP_US_POSTFLIGHT: an authority changed';
  END IF;

  RAISE NOTICE 'SP_UNITED_STATES_JURISDICTION_PROOF ok: US stated and wanted, nothing opened';
END $$;

COMMIT;
