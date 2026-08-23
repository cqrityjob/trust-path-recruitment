-- =============================================================================
-- ROLLBACK — legacy scope correctability
--
-- Reverses 20260908090000_sp_legacy_scope_correctable.sql by restoring the
-- claim trigger to the version 20260907092000 (UK pack) left. Runs BEFORE the
-- UK rollback, which replaces the same function in turn:
--
--   this → Dubai → UK → Sweden → foundation
--
-- ── WHAT ROLLING THIS BACK ACTUALLY DOES ───────────────────────────────
--
-- It re-freezes every legacy scopeless Skyddsvakt claim: readable, withdrawable,
-- and impossible to correct. There is one such row in production and its
-- assertion_level is `verified`, so the only escape it would leave the holder
-- is to destroy a real verifier's decision.
--
-- **Do not roll this back to fix something else.** It touches no table, no
-- column and no row — reverting it cannot repair data, and its only effect is
-- to take a right away from a holder. If a later rule needs changing, change
-- that rule forward.
--
-- Nothing is lost by running it: any scope a holder supplied while it was in
-- force stays exactly where it is, because this migration never wrote data.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
BEGIN
  IF NEW.jurisdiction_code IS NOT NULL THEN
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

    IF btrim(NEW.title) NOT IN (_t.name_sv, _t.name_en) THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_NARROW_RESULT_ONLY: % must carry its controlled label, not free text',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
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
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0)
     AND (TG_OP = 'INSERT'
          OR (OLD.authorisation_scope IS NOT NULL
              AND length(btrim(OLD.authorisation_scope)) > 0)) THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_REQUIRES_SCOPE: % is limited to an employer, principal or protected object and must say which',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Warn if the rollback is stranding a holder
-- ---------------------------------------------------------------------------
-- Not an abort: this migration wrote no data, so rolling it back destroys
-- nothing and refusing would be theatre. But the operator should know they are
-- taking correctability away from a real person.
DO $$
DECLARE _stranded integer;
BEGIN
  SELECT count(*) INTO _stranded
    FROM public.sp_claims c
    JOIN public.sp_credential_types t ON t.code = c.credential_code
   WHERE t.requires_scope
     AND (c.authorisation_scope IS NULL OR length(btrim(c.authorisation_scope)) = 0)
     AND c.lifecycle_state = 'active';

  IF _stranded > 0 THEN
    RAISE WARNING
      'ROLLBACK STRANDS % active scopeless claim(s): they become readable and '
      'withdrawable but NOT correctable. The holder''s only escape is to destroy '
      'the claim. Supply the missing scopes before rolling back.', _stranded;
  END IF;
END $$;

COMMIT;
