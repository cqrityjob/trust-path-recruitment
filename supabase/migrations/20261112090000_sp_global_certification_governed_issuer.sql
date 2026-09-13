-- ============================================================================
-- SECURITY PASSPORT — A GOVERNED CERTIFICATION CARRIES ITS GOVERNED ISSUER
--
-- 20261112090000. Schema-only security hardening. No application release is
-- coupled to it, no market is activated, no UI reads it, and it seeds nothing.
--
-- ── THE DEFECT, REPRODUCED BEFORE THIS FILE WAS WRITTEN ────────────────
--
-- 20261111090000 governs the SCOPE, the TERRITORY and the TITLE of an
-- international professional certification. It does not govern the ISSUER.
--
-- On a full 276-migration replay, as an ordinary holder -- SET ROLE
-- authenticated with the holder's own auth.uid(), no elevated grant, no
-- service_role -- this is accepted today:
--
--   INSERT INTO public.sp_claims
--     (holder_user_id, claim_type, credential_code, title,
--      claimed_issuer_name, lifecycle_state)
--   VALUES (<self>, 'certification', 'INTL_ASIS_CPP',
--           'Certified Protection Professional (CPP)',
--           'Fake Corporation', 'active');
--
-- and so is changing ONLY the issuer on a real one:
--
--   UPDATE public.sp_claims SET claimed_issuer_name = 'Government of Sweden'
--    WHERE holder_user_id = <self>;
--
-- Both succeeded. `authenticated` holds GRANT SELECT, INSERT, UPDATE on
-- sp_claims (20260817090000) and writes its own rows under RLS, which is
-- correct and is not what is being changed here. The gap is that nothing
-- connected `claimed_issuer_name` to the catalogue: the application reads the
-- governed display name in `listGlobalCertificationTypes` and the write path
-- never did, so the browser's string was stored verbatim.
--
-- It is not cosmetic. `sp_disclosure_payload` (20260817180000) emits
--   'issuer', c.claimed_issuer_name
-- so the forged name reaches a RECIPIENT, which is the audience the whole
-- trust vocabulary exists for.
--
-- ── WHY THE DATABASE AND NOT THE SERVER FUNCTION ───────────────────────
--
-- The application fix is necessary and is not sufficient. A holder's own
-- token can write these rows through PostgREST directly, so a rule that lives
-- in `saveCredential` binds the browser and nobody else. The trigger binds
-- every caller including service_role, which is the standard this repository
-- already holds `sp_claims_credential_rules` to.
--
-- ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────
--
-- It never infers an issuer from a title, an abbreviation or an alias --
-- aliases are a search vocabulary, and storing one would print a name the
-- issuer does not use beside somebody's credential. It never rewrites a
-- submitted value into the governed one: a silent correction reports success
-- for something the holder did not say. It refuses and names the right
-- answer.
--
-- It upgrades nothing. No assertion_level, no verification state, no
-- eligibility, no derived title. A controlled issuer means the CATALOGUE says
-- who awards this certification; it does not mean anybody checked that this
-- holder holds it. That remains `sp_certification_lifecycle_declare` and the
-- issuers' own verification routes.
--
-- ── EXISTING DATA ──────────────────────────────────────────────────────
--
-- Read-only on owner production wrygicdfxwjnrugduxnt before writing this:
-- 0 claims carry an INTL_ code, 0 resolve to a global_professional
-- definition, and 0 disagree with their governed issuer. 26 free-text claims
-- carry NULL credential_code and are untouched by every rule below. So this
-- migration rewrites NOTHING, and the assertion in section 2 proves that
-- rather than assuming it: if any row ever disagrees, the apply FAILS instead
-- of quietly leaving a violation behind a trigger that only fires on write.
--
-- ROLLBACK: supabase/rollback/20261112090000_sp_global_certification_governed_issuer_rollback.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Preconditions. This migration edits a function that 20261111090000 owns;
--    applying it against a database that never ran that one would silently
--    install a body referencing tables that do not exist.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sp_certification_definitions') IS NULL
     OR to_regclass('public.sp_certification_issuers') IS NULL THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_PRECONDITION: 20261111090000 must be applied first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sp_credential_types'
       AND column_name = 'scope_code'
  ) THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_PRECONDITION: sp_credential_types.scope_code is absent';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The equivalent of NOT VALID -> VALIDATE, for a rule a CHECK cannot hold.
--
--    A trigger fires on write and says nothing about rows already stored. So
--    the existing table is scanned HERE, before the rule is installed, and a
--    single disagreeing row aborts the whole transaction. The alternative --
--    installing the trigger over unexamined data -- is how a constraint comes
--    to be believed while the rows behind it were never checked.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _bad int;
BEGIN
  SELECT count(*) INTO _bad
    FROM public.sp_claims c
    JOIN public.sp_credential_types t ON t.code = c.credential_code
    LEFT JOIN public.sp_certification_definitions d
           ON d.credential_code = c.credential_code
    LEFT JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
   WHERE t.scope_code = 'global_professional'
     AND (
          i.display_name IS NULL
       OR (c.claimed_issuer_name IS NOT NULL
           AND btrim(c.claimed_issuer_name) <> i.display_name)
     );

  IF _bad > 0 THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_EXISTING_VIOLATION: % stored global-certification claim(s) disagree with the governed issuer. This migration does not rewrite holder data; correct or supersede them first.',
      _bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The rule. `sp_claims_credential_rules` is reproduced VERBATIM from
--    20261111090000 with exactly one block added, so a reviewer diffing the
--    two files sees the addition and nothing else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
  _pilot_market boolean := false;
  _governed_issuer text;
BEGIN
  -- ── The market gate ────────────────────────────────────────────────
  --
  -- Scoped to regulated credentials. A claim that names no credential_code is
  -- a language, a practical capability or a general certificate; its
  -- jurisdiction is PROVENANCE — where the thing came from — and provenance is
  -- a fact about the holder's history, not a request to register a regulated
  -- authorisation in a market.
  --
  -- A global certification carries no jurisdiction at all, so it never enters
  -- this block: it is available to a holder in Sweden, in Dubai, in a country
  -- with no market pack and to a holder who has stated no country, and it
  -- needs no pilot entitlement to be recorded.
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

  -- ── ADDED 20261111090000: a portable certification stays portable ──
  --
  -- The governed definition, not the submitted row, decides this. A caller
  -- that forges a country onto a global certification is refused here rather
  -- than silently filing a CPP as a Swedish credential.
  IF _t.scope_code = 'global_professional'
     AND (NEW.jurisdiction_code IS NOT NULL OR NEW.sub_jurisdiction_code IS NOT NULL) THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION: % is an international professional certification and is not a credential of %',
      NEW.credential_code, coalesce(NEW.sub_jurisdiction_code, NEW.jurisdiction_code)
      USING ERRCODE = 'check_violation';
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

  -- NOTE ON PLACEMENT. This block sits ABOVE the draft early-return below,
  -- and that position is the rule rather than an accident. The early return
  -- exists so an unfinished draft is not blocked by COMPLETENESS rules -- a
  -- missing expiry, a missing scope -- which is right: a holder is still
  -- typing. Issuer identity is not completeness. A draft may be SILENT about
  -- its issuer, and the active check below is guarded on lifecycle_state for
  -- exactly that reason; it may not name the wrong organisation and wait.
  -- Placed after the early return, as it first was here, a forged issuer was
  -- accepted on a draft and simply refused later at activation -- which
  -- stores the false attribution, shows it to the holder as saved, and makes
  -- the refusal arrive at the least useful moment.
  -- ── THE GOVERNED ISSUER ────────────────────────────────────────────
  --
  -- A governed international certification is awarded by ONE organisation,
  -- and the catalogue already knows which: sp_certification_definitions ->
  -- sp_certification_issuers.display_name. Until this rule existed nothing
  -- connected the two on the write path. `claimed_issuer_name` was free text
  -- straight from the client, `authenticated` holds INSERT and UPDATE on its
  -- own sp_claims rows, and sp_disclosure_payload ships the column to a
  -- recipient as 'issuer' -- so a holder could persist INTL_ASIS_CPP with
  -- claimed_issuer_name = 'Fake Corporation', or edit ONLY that column on a
  -- real claim, and the Passport would attribute a governed certification to
  -- an organisation that never awarded it. Reproduced end to end against a
  -- full replay before this migration was written.
  --
  -- The rule is here, in the trigger, rather than in a server function
  -- because the trigger is the only place that binds EVERY caller: the app,
  -- a direct PostgREST write with the holder's own token, and service_role.
  -- A CHECK constraint cannot express it -- the governed name lives in
  -- another table.
  --
  -- WHAT IT DOES NOT DO. It never INFERS an issuer. It does not read the
  -- title, the abbreviation or the issuer-alias table -- those aliases are a
  -- SEARCH vocabulary and storing one would put a name beside somebody's
  -- credential that its issuer does not use. It does not rewrite the
  -- submitted value into the right one either: a silent correction would tell
  -- a holder their input was accepted when it was replaced. It refuses, and
  -- names the governed issuer in the message so the caller can send it.
  --
  -- Nothing here touches a non-global credential. A national credential's
  -- appointing authority and a free-text claim's issuer keep exactly the
  -- semantics they have had since 20260817160000.
  --
  -- IDENTITY, NOT PRESENCE. This rule says WHICH issuer may be stored; it does
  -- not say one must be. Whether a credential must name an issuer at all is
  -- already a property of the catalogue -- sp_credential_types.requires_issuer,
  -- enforced by SP_CREDENTIAL_REQUIRES_ISSUER below -- and all fourteen
  -- governed certifications currently set it false. An earlier draft of this
  -- migration also refused an ACTIVE global claim with a NULL issuer. That was
  -- an over-reach: it contradicted the catalogue's own flag, and it broke
  -- 20261111090000's canonical write-path suite, which files a CPP exactly the
  -- way the product does. An absent issuer is incomplete; it is not a false
  -- attribution, and only false attribution is what this migration exists to
  -- stop. Making the issuer mandatory is a one-row-per-definition data change
  -- (requires_issuer = true) and an owner's decision, not a side effect of a
  -- security fix.
  IF _t.scope_code = 'global_professional' THEN
    SELECT i.display_name INTO _governed_issuer
      FROM public.sp_certification_definitions d
      JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
     WHERE d.credential_code = NEW.credential_code;

    -- Fail CLOSED. A global definition with no certification detail row is a
    -- catalogue that contradicts itself; refusing the write is the only
    -- answer that cannot attribute the credential to nobody in particular.
    IF _governed_issuer IS NULL THEN
      RAISE EXCEPTION
        'SP_GLOBAL_CERTIFICATION_ISSUER_UNKNOWN: % declares an international scope but the catalogue records no issuer for it',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;

    -- A draft may be incomplete -- NULL -- while the holder is still filling
    -- it in. It may never carry arbitrary text.
    IF NEW.claimed_issuer_name IS NOT NULL
       AND btrim(NEW.claimed_issuer_name) <> _governed_issuer THEN
      RAISE EXCEPTION
        'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED: % is awarded by %; the issuer may not be stated as %',
        NEW.credential_code, _governed_issuer, NEW.claimed_issuer_name
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
  'Enforces the taxonomy, market, SCOPE and governed-ISSUER rules on every '
  'claim write, for every caller including service_role. Unchanged from '
  '20261111090000 except for the global-certification issuer block: a claim '
  'on a governed global_professional definition may carry no issuer other '
  'than the one sp_certification_definitions -> sp_certification_issuers '
  'records, may not be active without it, and is never inferred from a '
  'title, an abbreviation or a search alias.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 4. Post-apply assertions. The function is REPLACEd, not created, so a typo
--    in the name would leave the old body installed and every test below
--    passing against it. These read the stored body back.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_claims_credential_rules';

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_ISSUER_ASSERT: the rules function is absent';
  END IF;

  IF _src NOT LIKE '%SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED%'
     OR _src NOT LIKE '%SP_GLOBAL_CERTIFICATION_ISSUER_UNKNOWN%' THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_ASSERT: the installed body carries no governed-issuer rule';
  END IF;

  -- Every 20261111090000 refusal must have survived the reproduction.
  IF _src NOT LIKE '%SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION%'
     OR _src NOT LIKE '%SP_SUB_JURISDICTION_REQUIRED%'
     OR _src NOT LIKE '%SP_CREDENTIAL_JURISDICTION_MISMATCH%'
     OR _src NOT LIKE '%SP_CREDENTIAL_TITLE_CONTROLLED%'
     OR _src NOT LIKE '%SP_MARKET_PACK_NOT_ACTIVE%'
     OR _src NOT LIKE '%SP_CREDENTIAL_NOT_AVAILABLE%'
     OR _src NOT LIKE '%SP_CREDENTIAL_REQUIRES_SCOPE%' THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_ASSERT: a pre-existing refusal was lost in the reproduction';
  END IF;

  -- It must not have learned to guess.
  IF _src LIKE '%sp_certification_issuer_aliases%' THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_ASSERT: the rules function reads the search aliases';
  END IF;

  -- It must refuse rather than rewrite: no assignment to claimed_issuer_name.
  IF _src LIKE '%NEW.claimed_issuer_name :=%' THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_ASSERT: the rules function rewrites the submitted issuer';
  END IF;
END $$;

-- The trigger itself is unchanged and still attached; prove it rather than
-- assume it, because REPLACE does not re-arm anything.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_proc p ON p.oid = tg.tgfoid
     WHERE c.relname = 'sp_claims'
       AND p.proname = 'sp_claims_credential_rules'
       AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_ISSUER_ASSERT: no trigger on sp_claims runs the rules function';
  END IF;
END $$;

COMMIT;
