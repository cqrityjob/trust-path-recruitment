-- =============================================================================
-- ROLLBACK — Security Passport three-market regulatory foundation
--
-- Reverses 20260907090000_sp_three_market_foundation.sql.
--
-- ── PREFER THE SWITCH TO THE HAMMER ────────────────────────────────────
--
-- This file exists for completeness, but it is almost never the right tool.
-- The forward migration was built so that a market can be withdrawn WITHOUT
-- any schema change at all:
--
--   UPDATE public.sp_market_packs SET is_active = false WHERE code = 'GB';
--
-- The claim trigger turns that single row into an immediate, fail-closed
-- refusal of every new claim in that market, while every stored row keeps its
-- history, its evidence and its verification. Nothing is destroyed and nothing
-- needs re-applying. Reach for that first.
--
-- Run this file only to remove the foundation itself — for example if the
-- release is abandoned before any market beyond Sweden ever ships.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
--   * every market pack, authority, regulated role and sub-jurisdiction;
--   * the regulatory source registry and its review history;
--   * every derivation rule in sp_professional_titles;
--   * the market columns on sp_credential_types and sp_claims, INCLUDING the
--     sub_jurisdiction_code of any claim that recorded one.
--
-- That last point is real data loss for a UAE holder. Export first:
--
--   \copy (SELECT id, holder_user_id, sub_jurisdiction_code FROM public.sp_claims
--           WHERE sub_jurisdiction_code IS NOT NULL) TO 'sp_claims_emirates.csv' CSV HEADER
--   \copy (SELECT * FROM public.sp_professional_titles) TO 'sp_titles.csv' CSV HEADER
--   \copy (SELECT * FROM public.sp_regulatory_sources)  TO 'sp_sources.csv' CSV HEADER
--
-- Swedish Passports are untouched by this rollback: VU1, VU2, OV and SV keep
-- working, because they worked before the forward migration and it only ever
-- added columns beside them.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Restore the claim trigger to its pre-migration behaviour
-- ---------------------------------------------------------------------------
-- Restored verbatim from 20260817160000_sp_phase6_credential_taxonomy.sql.
-- It must be put back BEFORE the market tables are dropped, otherwise the
-- function body would reference sp_market_packs after it has gone.
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _t public.sp_credential_types%ROWTYPE;
BEGIN
  IF NEW.credential_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.claim_type <> _t.claim_type THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CLAIM_TYPE_MISMATCH: % expects claim_type %, got %',
      NEW.credential_code, _t.claim_type, NEW.claim_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.lifecycle_state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _t.requires_valid_until AND NEW.valid_until IS NULL THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_VALID_UNTIL: % is a time-limited appointment',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.requires_issuer
     AND (NEW.claimed_issuer_name IS NULL OR length(btrim(NEW.claimed_issuer_name)) = 0) THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_ISSUER: % must name an appointing authority',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 2. The added columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_claims
  DROP COLUMN IF EXISTS sub_jurisdiction_code;

ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_type_review_state,
  DROP CONSTRAINT IF EXISTS sp_credential_type_contributes_to_known,
  DROP CONSTRAINT IF EXISTS sp_credential_type_sub_matches_country,
  DROP COLUMN IF EXISTS market_pack_code,
  DROP COLUMN IF EXISTS jurisdiction_code,
  DROP COLUMN IF EXISTS sub_jurisdiction_code,
  DROP COLUMN IF EXISTS authority_id,
  DROP COLUMN IF EXISTS regulated_role_id,
  DROP COLUMN IF EXISTS name_ar,
  DROP COLUMN IF EXISTS legal_review_state,
  DROP COLUMN IF EXISTS contributes_to;

-- ---------------------------------------------------------------------------
-- 3. The new objects, dropped in dependency order
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sp_professional_title_rule_integrity_trg ON public.sp_professional_titles;
DROP FUNCTION IF EXISTS public.sp_professional_title_rule_integrity();

DROP TABLE IF EXISTS public.sp_professional_titles;
DROP TABLE IF EXISTS public.sp_source_review_items;
DROP TABLE IF EXISTS public.sp_regulatory_sources;
DROP TABLE IF EXISTS public.sp_regulated_roles;
DROP TABLE IF EXISTS public.sp_authorities;
DROP TABLE IF EXISTS public.sp_profession_families;
DROP TABLE IF EXISTS public.sp_market_packs;
DROP TABLE IF EXISTS public.sp_sub_jurisdictions;

-- ---------------------------------------------------------------------------
-- 4. The two added countries
-- ---------------------------------------------------------------------------
-- Deliberately conditional. If a claim in GB or AE somehow survived, deleting
-- the jurisdiction would either fail on the foreign key or orphan the row;
-- leaving it is the safer of the two, and the DELETE says so by only removing
-- what nothing references.
DELETE FROM public.sp_jurisdictions j
 WHERE j.code IN ('GB', 'AE')
   AND NOT EXISTS (SELECT 1 FROM public.sp_claims c WHERE c.jurisdiction_code = j.code)
   AND NOT EXISTS (SELECT 1 FROM public.sp_experience_periods e WHERE e.jurisdiction_code = j.code)
   AND NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles p WHERE p.jurisdiction_code = j.code);

-- ---------------------------------------------------------------------------
-- 5. Prove nothing still points at what was dropped
-- ---------------------------------------------------------------------------
DO $$
DECLARE _left integer;
BEGIN
  SELECT count(*) INTO _left
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('sp_sub_jurisdictions','sp_market_packs','sp_profession_families',
                       'sp_authorities','sp_regulated_roles','sp_regulatory_sources',
                       'sp_source_review_items','sp_professional_titles');
  IF _left <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % three-market table(s) survived', _left;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'sp_claims'
                AND column_name = 'sub_jurisdiction_code') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: sp_claims.sub_jurisdiction_code survived';
  END IF;

  -- Sweden must still work. A rollback that took the launch credentials with
  -- it would be a far worse outcome than the release it is undoing.
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV')) <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: the four launch credentials are not intact';
  END IF;
END $$;

COMMIT;
