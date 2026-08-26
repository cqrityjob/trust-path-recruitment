-- =============================================================================
-- ROLLBACK — Security Passport internal-pilot market entitlement
--
-- Reverses 20260915090000_sp_market_pilot_entitlement.sql.
--
-- ── WHY THIS RUNS FIRST IN THE PASSPORT ROLLBACK CHAIN ─────────────────
--
-- `sp_pilot_members.market_pack_code` carries a foreign key to
-- `sp_market_packs(code)`. Every Passport rollback below this one eventually
-- reaches `DROP TABLE sp_market_packs`, and Postgres refuses that while a
-- dependent table exists:
--
--   ERROR: cannot drop table sp_market_packs because other objects depend on it
--
-- So this file runs BEFORE the Abu Dhabi rollback, at the top of the chain.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
-- The record of who was authorised to exercise an unreviewed market, by whom,
-- and when. That is an audit trail, and the whole reason revocation is an
-- UPDATE rather than a DELETE. Export it before running this:
--
--   \copy (SELECT * FROM public.sp_pilot_members)
--         TO 'sp_pilot_members.csv' CSV HEADER
--
-- ── WHAT IS DELIBERATELY NOT LOST ──────────────────────────────────────
--
-- Claims. Nothing here touches `sp_claims`. A credential a pilot member
-- registered in GB or Dubai keeps its own jurisdiction, its evidence and its
-- lifecycle after this file runs; it simply stops being possible to register a
-- NEW one, which is the same position the product was in before the pilot.
--
-- The claim trigger is restored to its pre-pilot definition rather than
-- dropped, so the market and credential gates keep working — without the
-- pilot branch. It is restored from 20260908090000's lineage, which is the
-- definition the pilot migration rebased on.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Restore the claim trigger to its pre-pilot definition
-- ---------------------------------------------------------------------------
--
-- Byte-for-byte the body that shipped before the pilot migration: the market
-- gate refuses any pack that is not `is_active`, and the credential gate
-- refuses any type that is not `is_active`. Everything below those two gates
-- was never changed by the pilot migration and is unchanged again here.
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
BEGIN
  IF NEW.credential_code IS NOT NULL AND NEW.jurisdiction_code IS NOT NULL THEN
    SELECT * INTO _pack
      FROM public.sp_market_packs
     WHERE jurisdiction_code = NEW.jurisdiction_code
       AND sub_jurisdiction_code IS NOT DISTINCT FROM NEW.sub_jurisdiction_code
       AND superseded_on IS NULL;

    IF NOT FOUND THEN
      SELECT EXISTS (
        SELECT 1 FROM public.sp_market_packs
         WHERE jurisdiction_code = NEW.jurisdiction_code
           AND sub_jurisdiction_code IS NOT NULL
      ) INTO _country_needs_sub;

      IF _country_needs_sub AND NEW.sub_jurisdiction_code IS NULL THEN
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_REQUIRED: % regulates security locally; name the emirate or region',
          NEW.jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.sub_jurisdiction_code IS NOT NULL THEN
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is not supported yet',
          NEW.sub_jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      RAISE EXCEPTION
        'SP_JURISDICTION_NOT_SUPPORTED: no market pack covers %',
        NEW.jurisdiction_code
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT _pack.is_active THEN
      RAISE EXCEPTION
        'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
        _pack.code, _pack.legal_review_state
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.credential_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT _t.is_active AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_NOT_AVAILABLE: % is not available yet',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.jurisdiction_code IS NOT NULL
     AND NEW.jurisdiction_code IS NOT NULL
     AND _t.jurisdiction_code <> NEW.jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_JURISDICTION_MISMATCH: % is a % credential, filed as %',
      NEW.credential_code, _t.jurisdiction_code, NEW.jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.sub_jurisdiction_code IS NOT NULL
     AND NEW.sub_jurisdiction_code IS DISTINCT FROM _t.sub_jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is issued in % and is not valid elsewhere',
      NEW.credential_code, _t.sub_jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.claim_type <> _t.claim_type THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CLAIM_TYPE_MISMATCH: % expects claim_type %, got %',
      NEW.credential_code, _t.claim_type, NEW.claim_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.narrow_result_only THEN
    IF NEW.holder_note IS NOT NULL AND length(btrim(NEW.holder_note)) > 0 THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_NARROW_RESULT_ONLY: % records a checked result and nothing else; no note may be attached',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT _t.title_is_holder_written
     AND (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title)
     AND btrim(NEW.title) NOT IN (_t.name_sv, _t.name_en) THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_TITLE_CONTROLLED: % is named by its definition (% / %), not by the holder',
      NEW.credential_code, _t.name_sv, _t.name_en
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.reference_pattern IS NOT NULL
     AND NEW.credential_reference IS NOT NULL
     AND length(btrim(NEW.credential_reference)) > 0
     AND btrim(NEW.credential_reference) !~ _t.reference_pattern THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_REFERENCE_FORMAT: % expects a reference matching %',
      NEW.credential_code, _t.reference_pattern
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

  IF _t.requires_scope
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0) THEN

    _scope_missing := true;

    IF TG_OP = 'UPDATE' THEN
      _scope_missing := (OLD.authorisation_scope IS NOT NULL
                         AND length(btrim(OLD.authorisation_scope)) > 0);

    ELSIF NEW.supersedes_id IS NOT NULL THEN
      SELECT authorisation_scope INTO _prev_scope
        FROM public.sp_claims WHERE id = NEW.supersedes_id;

      _scope_missing := (_prev_scope IS NOT NULL AND length(btrim(_prev_scope)) > 0);
    END IF;

    IF _scope_missing THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_REQUIRES_SCOPE: % is limited to an employer, principal or protected object and must say which',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Drop the entitlement model
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sp_market_access(uuid, text);
DROP FUNCTION IF EXISTS public.sp_grant_pilot_member(uuid, text, text);
DROP FUNCTION IF EXISTS public.sp_revoke_pilot_member(uuid, text);
DROP FUNCTION IF EXISTS public.sp_is_pilot_member(uuid, text);

DROP TABLE IF EXISTS public.sp_pilot_members;

-- ---------------------------------------------------------------------------
-- 3. Drop the pilot axis
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_type_pilot_state_known;
ALTER TABLE public.sp_credential_types
  DROP COLUMN IF EXISTS pilot_state;

ALTER TABLE public.sp_market_packs
  DROP CONSTRAINT IF EXISTS sp_market_pack_pilot_state_known;
ALTER TABLE public.sp_market_packs
  DROP COLUMN IF EXISTS pilot_state;

-- ---------------------------------------------------------------------------
-- 4. Prove the pilot left nothing behind, and took nothing with it
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('sp_market_packs', 'sp_credential_types')
     AND column_name = 'pilot_state';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: pilot_state survives on % table(s)', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('sp_is_pilot_member', 'sp_market_access',
                       'sp_grant_pilot_member', 'sp_revoke_pilot_member');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % pilot function(s) survive', _n;
  END IF;

  -- Sweden is still open and still the only open market: the rollback must
  -- not have disturbed the market that was never part of the pilot.
  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK CHANGED PRODUCTION: % active market pack(s), expected 1 (SE)', _n;
  END IF;
END $$;

COMMIT;
