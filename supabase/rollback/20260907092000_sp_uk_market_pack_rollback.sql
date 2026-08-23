-- =============================================================================
-- ROLLBACK — Security Passport United Kingdom (SIA) market pack
--
-- Reverses 20260907092000_sp_uk_market_pack.sql. Runs BEFORE the Swedish and
-- three-market rollbacks, for the same reason they are ordered relative to
-- each other: this file restores the claim trigger to the version the Swedish
-- migration left, which that file then replaces in turn.
--
-- ── ALMOST CERTAINLY THE WRONG TOOL ────────────────────────────────────
--
-- The UK pack ships inactive. Withdrawing it needs no schema change at all:
--
--   UPDATE public.sp_market_packs
--      SET is_active = false, legal_review_state = 'pending'
--    WHERE code = 'GB';
--
-- which the claim trigger turns into an immediate, fail-closed refusal of
-- every new UK claim while leaving stored history, evidence and verification
-- intact. Reach for that first; this file is for removing the pack entirely.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
-- Every UK claim, because a credential type cannot be dropped while claims
-- reference it. Export first:
--
--   \copy (SELECT * FROM public.sp_claims WHERE credential_code LIKE 'UK\_%')
--         TO 'sp_claims_uk.csv' CSV HEADER
--
-- Sweden is untouched: this migration only ever added rows beside it, plus one
-- column pair on sp_credential_types that no Swedish credential populates.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Restore the claim trigger to the Swedish truth model version
-- ---------------------------------------------------------------------------
-- Identical to 20260907091000's function, minus the is_active gate and the
-- reference-format check that this migration added.
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
-- 2. The UK content
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles WHERE market_pack_code = 'GB';
-- ---------------------------------------------------------------------------
-- Refuse rather than destroy a holder's record
-- ---------------------------------------------------------------------------
-- The blind `DELETE FROM sp_claims` below had two failure modes, and both were
-- real:
--
--   * `sp_claims.supersedes_id` is ON DELETE RESTRICT. A holder who CORRECTED
--     one of these credentials has two rows, and when the correction changed
--     the credential_code the filter catches only one of them — so the delete
--     aborts on a foreign key, mid-transaction, reporting a constraint name
--     rather than what actually happened. Reproduced against a real database.
--
--   * When it did NOT abort, it silently deleted a holder's claims, their
--     version history and their verifier attributions, to tidy a schema.
--
-- CI never saw either: the suites clean up after themselves, so by the time
-- the rollback ran there was nothing left to delete.
--
-- Count first, and refuse. A rollback that destroys holder data is not a
-- rollback, and making it succeed quietly is worse than making it stop.
DO $rbuk$
DECLARE
  _claims    integer;
  _corrected integer;
  _opted_in  text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  SELECT count(*) INTO _claims FROM public.sp_claims c WHERE c.credential_code IN (SELECT t.code FROM public.sp_credential_types t WHERE t.market_pack_code = 'GB');

  SELECT count(*) INTO _corrected FROM public.sp_claims c
   WHERE (c.credential_code IN (SELECT t.code FROM public.sp_credential_types t WHERE t.market_pack_code = 'GB'))
     AND (c.supersedes_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.sp_claims s WHERE s.supersedes_id = c.id));

  IF _claims > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % UK holder claim(s) exist, % of them corrected. '
      'This rollback will not destroy a holder''s record to tidy a schema. '
      'RECOVERY: export the rows (see the header of this file), have each '
      'holder withdraw or correct the claim so their history survives, or '
      'accept the loss deliberately with '
      'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; then re-run.',
      _claims, _corrected;
  END IF;

  IF _claims > 0 THEN
    RAISE WARNING
      'Deleting % UK holder claim(s) — opted in explicitly.', _claims;
  END IF;
END $rbuk$;

DELETE FROM public.sp_claims
 WHERE credential_code IN (SELECT code FROM public.sp_credential_types
                            WHERE market_pack_code = 'GB');
DELETE FROM public.sp_credential_types WHERE market_pack_code = 'GB';
DELETE FROM public.sp_regulated_roles  WHERE market_pack_code = 'GB';

-- ---------------------------------------------------------------------------
-- 3. The added columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_credential_types
  DROP COLUMN IF EXISTS reference_pattern,
  DROP COLUMN IF EXISTS reference_label_en,
  DROP COLUMN IF EXISTS reference_label_local;

-- ---------------------------------------------------------------------------
-- 4. Prove Sweden is untouched
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV','OV_TRAINING','SE_PERSONNEL_APPROVAL')) <> 6 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: a Swedish credential went with the UK pack';
  END IF;

  IF (SELECT count(*) FROM public.sp_professional_titles WHERE market_pack_code = 'SE') < 11 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: the Swedish derivation rules are not intact';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE market_pack_code = 'GB') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: a UK credential survived';
  END IF;
END $$;

COMMIT;
