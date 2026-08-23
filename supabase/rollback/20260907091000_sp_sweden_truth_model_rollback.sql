-- =============================================================================
-- ROLLBACK — Security Passport Swedish truth model
--
-- Reverses 20260907091000_sp_sweden_truth_model.sql.
--
-- MUST run BEFORE the three-market rollback, because it restores the claim
-- trigger to the three-market version that file then replaces with the
-- pre-market one. Run in the other order and the trigger ends up describing a
-- schema that no longer exists.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
--   * every claim recorded against OV_TRAINING, OV_REFRESHER, OV_TRANSPORT or
--     SE_PERSONNEL_APPROVAL — the credentials themselves cannot be dropped
--     while claims reference them, so this file DELETES those claims;
--   * the authorisation_scope of every scoped credential, which for a
--     skyddsvakt approval is the thing that stops it reading as a general
--     national licence;
--   * the eleven Swedish derivation rules, after which every surface falls
--     back to the honest empty state rather than to the old hardcoded string.
--
-- Export before running in anger:
--
--   \copy (SELECT * FROM public.sp_claims WHERE credential_code IN
--          ('OV_TRAINING','OV_REFRESHER','OV_TRANSPORT','SE_PERSONNEL_APPROVAL')
--          OR authorisation_scope IS NOT NULL) TO 'sp_claims_sweden.csv' CSV HEADER
--
-- Prefer fixing forward. Deactivating a credential (`is_active = false` on
-- sp_credential_types) hides it from every form without destroying a single
-- holder's record, and is almost always the change actually wanted.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Restore the three-market trigger (without the Swedish rules)
-- ---------------------------------------------------------------------------
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
-- 2. The Swedish derivation rules and the credentials they name
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles WHERE market_pack_code = 'SE';

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
DO $rbse$
DECLARE
  _claims    integer;
  _corrected integer;
  _opted_in  text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  SELECT count(*) INTO _claims FROM public.sp_claims c WHERE c.credential_code IN ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL');

  SELECT count(*) INTO _corrected FROM public.sp_claims c
   WHERE (c.credential_code IN ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL'))
     AND (c.supersedes_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.sp_claims s WHERE s.supersedes_id = c.id));

  IF _claims > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % Swedish truth-model holder claim(s) exist, % of them corrected. '
      'This rollback will not destroy a holder''s record to tidy a schema. '
      'RECOVERY: export the rows (see the header of this file), have each '
      'holder withdraw or correct the claim so their history survives, or '
      'accept the loss deliberately with '
      'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; then re-run.',
      _claims, _corrected;
  END IF;

  IF _claims > 0 THEN
    RAISE WARNING
      'Deleting % Swedish truth-model holder claim(s) — opted in explicitly.', _claims;
  END IF;
END $rbse$;

DELETE FROM public.sp_claims
 WHERE credential_code IN
   ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL');

DELETE FROM public.sp_credential_types
 WHERE code IN ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL');

-- ---------------------------------------------------------------------------
-- 3. The added columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_claims DROP COLUMN IF EXISTS authorisation_scope;

ALTER TABLE public.sp_credential_types
  DROP COLUMN IF EXISTS narrow_result_only,
  DROP COLUMN IF EXISTS requires_scope;

-- ---------------------------------------------------------------------------
-- 4. The code-length check
-- ---------------------------------------------------------------------------
-- Restoring the 16-character cap is only safe once the long codes are gone,
-- which section 2 guaranteed. Verified rather than assumed: re-adding a CHECK
-- that existing rows violate would abort this transaction, and finding that
-- out from a constraint error rather than a sentence is a poor way to learn it.
DO $$
DECLARE _too_long integer;
BEGIN
  SELECT count(*) INTO _too_long FROM public.sp_credential_types WHERE length(code) > 16;
  IF _too_long > 0 THEN
    RAISE EXCEPTION
      'ROLLBACK BLOCKED: % credential code(s) are longer than the original 16-character limit. '
      'They arrived with a later market pack, which must be rolled back first.', _too_long;
  END IF;
END $$;

ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_types_code_check;

ALTER TABLE public.sp_credential_types
  ADD CONSTRAINT sp_credential_types_code_check
  CHECK (code ~ '^[A-Z0-9_]{2,16}$');

-- ---------------------------------------------------------------------------
-- 5. Prove Sweden still works
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV')) <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: the four launch credentials are not intact';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'sp_claims'
                AND column_name = 'authorisation_scope') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: sp_claims.authorisation_scope survived';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE code IN ('OV_TRAINING','OV_REFRESHER','OV_TRANSPORT','SE_PERSONNEL_APPROVAL')) THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: a Swedish truth-model credential survived';
  END IF;
END $$;

COMMIT;
