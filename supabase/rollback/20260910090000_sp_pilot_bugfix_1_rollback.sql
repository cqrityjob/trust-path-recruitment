-- Rollback for 20260910090000_sp_pilot_bugfix_1.sql
--
-- Restores `sp_claims_credential_rules` to the definition that shipped in
-- 20260908090000_sp_legacy_scope_correctable.sql — the LATEST one before the
-- pilot fix, not 20260907092000, which is the one that looks latest if you
-- search for the market gate. Reproduced verbatim, so rolling back is a true
-- reversal rather than a hand-written approximation of one, and in particular
-- does not quietly take the grandfathered-scope branch with it. Also drops the
-- three functions the migration added.
--
-- ── WHAT ROLLING BACK COSTS ────────────────────────────────────────────
--
-- Nothing is lost from storage. Every claim, event, verification and piece of
-- evidence written while the migration was in place stays exactly where it is,
-- including entries archived through `sp_archive_claim` (they are `withdrawn`,
-- which the schema has understood since Phase 2) and disputes resolved through
-- `sp_resolve_dispute` (`active` or `withdrawn`, both original states).
--
-- What returns is the four defects:
--
--   * a governed credential's title becomes the holder's to type again, for
--     every credential that is not narrow_result_only
--   * a British or UAE driving licence becomes unrecordable again, because the
--     security market pack gate goes back to running on claims that name no
--     credential at all
--   * a dispute goes back to having no queue and no way out
--   * a verified credential goes back to having no holder-facing archive
--
-- ── TWO THINGS THIS ROLLBACK DELIBERATELY LEAVES ───────────────────────
--
-- 1. `sp_credential_types.title_is_holder_written` is NOT dropped. The column
--    is inert once the trigger above stops reading it, dropping it would make
--    re-applying the migration a data change rather than a no-op, and a
--    boolean nobody reads costs nothing.
--
-- 2. `dispute_resolved` stays in the event-type allowlist. Narrowing it would
--    make the CHECK refuse rows that are ALREADY in the table — an
--    append-only audit log cannot be rewritten to fit a constraint, so the
--    rollback would fail on exactly the databases where the feature was used.
--    The allowlist keeps a word nothing writes any more, which is harmless.

BEGIN;

DROP FUNCTION IF EXISTS public.sp_archive_claim(uuid, text);
DROP FUNCTION IF EXISTS public.sp_resolve_dispute(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.sp_dispute_queue();

CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
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

  -- ── The scope rule, grandfathered on BOTH shapes of write ────────────
  IF _t.requires_scope
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0) THEN

    _scope_missing := true;

    IF TG_OP = 'UPDATE' THEN
      -- Unchanged: a row that already had no scope stays writable; a row that
      -- HAS one cannot have it taken away.
      _scope_missing := (OLD.authorisation_scope IS NOT NULL
                         AND length(btrim(OLD.authorisation_scope)) > 0);

    ELSIF NEW.supersedes_id IS NOT NULL THEN
      -- A correction. It inherits its predecessor's grandfathered status, and
      -- nothing else: if the predecessor had a scope, this one must too, so a
      -- correction can never quietly widen an authorisation.
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
  'Enforces the taxonomy, market, narrow-result, reference-format and scope '
  'rules on every claim write, for every caller including service_role. '
  'Drafts are exempt from COMPLETENESS only -- never from the market gate, the '
  'narrow-result rule or the reference format, because each of those is wrong '
  'the moment it is stored rather than wrong at submit time.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;

COMMIT;
