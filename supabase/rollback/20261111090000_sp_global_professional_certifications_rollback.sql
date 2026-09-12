-- Roll back the governed international-certification foundation
-- (20261111090000), in reverse order.
--
-- ══ WHAT IT REMOVES ════════════════════════════════════════════════════
--
--   8. sp_credential_scopes                     (the scope vocabulary)
--   7. sp_credential_types_symbol_label_check   (back to 1..4)
--   6. the 14 INTL_* rows in sp_credential_types
--   5. sp_credential_types.scope_code, its index and its two CHECKs
--   4. sp_certification_definitions / _sources / _issuer_aliases / _issuers
--      and their triggers and trigger functions
--   3. sp_claim_certification_lifecycle and its trigger and function
--   2. sp_claims_credential_rules(), restored VERBATIM to the definition
--      20261109090000 left in place
--   1. nothing else
--
-- ══ WHAT IT NEVER TOUCHES ══════════════════════════════════════════════
--
-- Not one row of sp_claims, sp_experience_periods, sp_passport_profiles,
-- sp_passport_events, sp_disclosures, sp_market_packs, sp_authorities,
-- sp_regulated_roles or sp_professional_titles. The 59 pre-existing
-- sp_credential_types rows survive byte-for-byte: `scope_code` was the only
-- column this migration wrote to them, and dropping the column removes the
-- backfill with it.
--
-- No CASCADE appears in this file. A drop that needs one is a drop whose
-- blast radius nobody has counted.
--
-- ══ THE REFUSAL, AND WHY IT IS LOUD ════════════════════════════════════
--
-- Once a real holder records a CPP, rolling this back would have to delete
-- either their claim or the definition their claim points at. Neither is a
-- rollback; both are data loss wearing the word. So the first block below
-- REFUSES, by name and by count, and says what the forward fix is.
--
-- This is the documented limitation: after adoption, this rollback is not
-- available and a defect must be corrected by a forward migration. That is a
-- property of the change, not a gap in this file, and it is stated in
-- docs/passport/global-certification-governance.md as well as here.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Refuse rather than delete
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _claims int;
  _lifecycle int;
  _codes text;
BEGIN
  IF to_regclass('public.sp_certification_definitions') IS NULL THEN
    RAISE NOTICE 'SP_GLOBAL_CERT_ROLLBACK: 20261111090000 is not applied; nothing to do';
    RETURN;
  END IF;

  SELECT count(*), string_agg(DISTINCT credential_code, ', ' ORDER BY credential_code)
    INTO _claims, _codes
    FROM public.sp_claims
   WHERE credential_code IN (SELECT credential_code FROM public.sp_certification_definitions);

  SELECT count(*) INTO _lifecycle FROM public.sp_claim_certification_lifecycle;

  IF _claims > 0 OR _lifecycle > 0 THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ROLLBACK_REFUSED: % claim(s) (%) and % lifecycle row(s) reference the definitions this rollback removes. Rolling back would delete holder data. Correct the defect with a FORWARD migration instead.',
      _claims, coalesce(_codes, '-'), _lifecycle
      USING ERRCODE = 'restrict_violation';
  END IF;
END $guard$;

-- ---------------------------------------------------------------------------
-- 1. sp_claims_credential_rules(), as 20261109090000 left it
-- ---------------------------------------------------------------------------
-- Reproduced verbatim, minus the SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION
-- block. This reinstates the DEFECT the forward file corrects: a direct write
-- carrying credential_code INTL_ASIS_CPP and jurisdiction_code SE would be
-- accepted again — except that the INTL_ definitions are removed below, so
-- after a complete rollback there is no such code to file. The restoration is
-- exact so that a later migration reading this function finds what it expects.

CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
  _pilot_market boolean := false;
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
      _pilot_market := _pack.pilot_state = 'internal_pilot'
                       AND public.sp_is_pilot_member(auth.uid(), _pack.code);
      IF NOT _pilot_market THEN
        RAISE EXCEPTION
          'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
          _pack.code, _pack.legal_review_state
          USING ERRCODE = 'check_violation';
      END IF;
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

  IF NOT (_t.is_active OR (_pilot_market AND _t.pilot_state = 'internal_pilot'))
     AND TG_OP = 'INSERT' THEN
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
END $fn$;

COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy AND market rules on every claim write, for every '
  'caller including service_role. An unknown jurisdiction, an inactive market '
  'pack, a missing emirate and a cross-market credential each fail closed with '
  'a distinguishable SP_* code the UI renders as a state. Drafts are exempt '
  'from completeness only, never from the market gate.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 2. The holder lifecycle table
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sp_claim_certification_lifecycle_set_updated_at
  ON public.sp_claim_certification_lifecycle;
DROP TRIGGER IF EXISTS sp_certification_lifecycle_rules_trg
  ON public.sp_claim_certification_lifecycle;
DROP TABLE IF EXISTS public.sp_claim_certification_lifecycle;
DROP FUNCTION IF EXISTS public.sp_certification_lifecycle_rules();

-- ---------------------------------------------------------------------------
-- 3. The certification catalogue tables
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sp_certification_definitions_set_updated_at
  ON public.sp_certification_definitions;
DROP TRIGGER IF EXISTS sp_certification_definition_rules_trg
  ON public.sp_certification_definitions;
DROP TABLE IF EXISTS public.sp_certification_definitions;
DROP FUNCTION IF EXISTS public.sp_certification_definition_rules();

DROP TABLE IF EXISTS public.sp_certification_sources;
DROP TABLE IF EXISTS public.sp_certification_issuer_aliases;

DROP TRIGGER IF EXISTS sp_certification_issuers_set_updated_at
  ON public.sp_certification_issuers;
DROP TRIGGER IF EXISTS sp_certification_issuer_code_immutable_trg
  ON public.sp_certification_issuers;
DROP TABLE IF EXISTS public.sp_certification_issuers;
DROP FUNCTION IF EXISTS public.sp_certification_issuer_code_immutable();

-- ---------------------------------------------------------------------------
-- 4. The fourteen definitions
-- ---------------------------------------------------------------------------
-- The guard above proved no claim references any of them. DELETE rather than
-- a deactivation, because a rollback must leave the catalogue as it was and
-- an inactive INTL_ row is not that.
DELETE FROM public.sp_credential_types WHERE code IN (
  'INTL_ASIS_APP', 'INTL_ASIS_CPP', 'INTL_ASIS_PCI', 'INTL_ASIS_PSP',
  'INTL_ISC2_CC', 'INTL_ISC2_CGRC', 'INTL_ISC2_SSCP', 'INTL_ISC2_CISSP',
  'INTL_ISC2_CCSP',
  'INTL_ISACA_CISA', 'INTL_ISACA_CISM', 'INTL_ISACA_CRISC',
  'INTL_ACFE_CFE', 'INTL_ACAMS_CAMS');

-- ---------------------------------------------------------------------------
-- 5. The scope column and its constraints
-- ---------------------------------------------------------------------------
-- Dropping the column removes the backfill with it: `scope_code` is the only
-- column 20261111090000 wrote to a pre-existing row, so the 59 rows return to
-- exactly the values they held before it ran.
ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_type_global_scope_unbound;
ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_type_national_scope_bound;
DROP INDEX IF EXISTS public.sp_credential_types_scope_idx;
ALTER TABLE public.sp_credential_types DROP COLUMN IF EXISTS scope_code;

-- ---------------------------------------------------------------------------
-- 6. The symbol plate, back to four characters
-- ---------------------------------------------------------------------------
-- Safe in this order only: the five-character marks (CISSP, CRISC) left with
-- their rows in step 4, so no surviving row can violate the tighter bound.
ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_types_symbol_label_check;
ALTER TABLE public.sp_credential_types
  ADD CONSTRAINT sp_credential_types_symbol_label_check
  CHECK (length(btrim(symbol_label)) >= 1 AND length(btrim(symbol_label)) <= 4);

-- ---------------------------------------------------------------------------
-- 7. The scope vocabulary
-- ---------------------------------------------------------------------------
-- Last, because sp_credential_types.scope_code referenced it until step 5.
DROP TABLE IF EXISTS public.sp_credential_scopes;

-- ---------------------------------------------------------------------------
-- 8. The column comment, as 20260817160000 wrote it
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.sp_claims.credential_reference IS
  'PRIVATE. Certificate/decision reference. Never included in '
  'sp_get_disclosure output, a card, a social image or analytics.';

DO $proof$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.sp_credential_types;
  IF _n <> 59 THEN
    RAISE WARNING 'SP_GLOBAL_CERT_ROLLBACK: sp_credential_types holds % rows (59 expected on a clean replay)', _n;
  END IF;
  RAISE NOTICE 'SP_GLOBAL_CERT_ROLLBACK ok: catalogue, registry, scope column and lifecycle table removed; no claim touched';
END $proof$;

COMMIT;
