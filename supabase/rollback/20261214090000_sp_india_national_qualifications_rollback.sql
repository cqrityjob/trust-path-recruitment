-- Rollback of 20261214090000_sp_india_national_qualifications.sql
--
-- REFUSES once adopted: a saved Indian credential, a stated definition
-- version, or a holder who has stated India as their work country is personal
-- data this rollback must not delete or orphan. After adoption, forward-fix.
--
-- Before adoption it restores, VERBATIM, the view (20261126090000), the claim
-- rules (20261114090000), the details guard (20261121090000), the save RPC
-- (20261126090000) and the reviewer detail (20261014090000), then removes the
-- rows and objects the migration added.

BEGIN;

DO $guard$
DECLARE _n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.sp_claims WHERE credential_code IN (SELECT code FROM public.sp_credential_types WHERE jurisdiction_code='IN'))
       + (SELECT count(*) FROM public.sp_claims WHERE jurisdiction_code='IN')
       + (SELECT count(*) FROM public.sp_credential_details WHERE definition_version IS NOT NULL)
       + (SELECT count(*) FROM public.sp_passport_profiles WHERE jurisdiction_code='IN')
       + (SELECT count(*) FROM public.sp_experience_periods WHERE jurisdiction_code='IN')
    INTO _n;
  IF _n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED_ADOPTED: % row(s) depend on 20261214090000; forward-fix instead', _n;
  END IF;
END
$guard$;

CREATE OR REPLACE VIEW public.sp_approved_credential_catalogue WITH (security_invoker=true,security_barrier=true) AS
SELECT t.code, t.claim_type, t.name_sv, t.name_en,
 coalesce(m.credential_class,CASE t.claim_type WHEN 'licence' THEN 'regulated_authorisation' WHEN 'training' THEN 'mandatory_training' ELSE 'certification' END) AS credential_class,
 t.scope_code, t.jurisdiction_code AS country, t.sub_jurisdiction_code AS region,
 CASE WHEN EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
      THEN NULL::uuid ELSE coalesce(i.id,a.id) END AS issuer_id,
 CASE WHEN EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
      THEN NULL::text ELSE coalesce(i.display_name,a.name_local) END AS issuer_name,
 coalesce(d.programme_url,a.official_url) AS official_url,
 coalesce(d.public_verification_url,i.public_verification_url) AS verification_url,
 i.verification_mode, t.requires_valid_until, t.allows_no_expiry,
 t.reference_pattern, m.original_language,
 d.maintenance_summary_en, t.typical_validity_months
FROM public.sp_credential_types t
LEFT JOIN public.sp_certification_definitions d ON d.credential_code=t.code
LEFT JOIN public.sp_certification_issuers i ON i.id=d.issuer_id AND i.is_active
 AND i.effective_from<=current_date AND (i.effective_to IS NULL OR i.effective_to>current_date)
LEFT JOIN public.sp_authorities a ON a.id=t.authority_id AND a.is_active
LEFT JOIN public.sp_credential_definition_metadata m ON m.credential_code=t.code
WHERE
 -- The DEFINITION must be approved (is_active) for everyone alike: pilot
 -- membership opens a market, it never approves a definition.
 -- A scoped definition (SV, a SIRA cadre card) is in the catalogue: the scope is a
 -- REQUIRED holder field enforced by the write path, not a reason to withhold it.
 --
 -- ROUTE A (owner decision, 2026-09-18). A definition is admitted when it is
 -- approved for everyone (is_active), OR when ALL of these hold: the definition
 -- itself is internal_pilot; ITS OWN market pack is internal_pilot and not
 -- active; and the caller holds a valid membership of THAT pack. The owner's
 -- per-definition pilot authorisation (20260915090000) is what is honoured:
 -- is_active stays false, so the day a pack is activated publicly a pilot-only
 -- definition is offered to NOBODY until it is approved on its own. A single
 -- definition is held back by setting its pilot_state to 'closed'.
 (t.is_active
  OR (t.pilot_state='internal_pilot' AND t.market_pack_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.sp_market_packs pp WHERE pp.code=t.market_pack_code
                   AND pp.pilot_state='internal_pilot' AND NOT pp.is_active AND pp.superseded_on IS NULL)
      AND public.sp_is_pilot_member(auth.uid(), t.market_pack_code)))
 AND m.deprecated_at IS NULL
 -- GUARDED RELEASE. A definition that needs a holder-written scope or a
 -- document-stated issuer can only be saved by an application that sends those
 -- fields. Over the REST LISTING of this view, such a row is offered only to a
 -- caller that declares the contract (header x-passport-catalogue-contract: 2).
 -- An application deployed before this migration sends no such header and is
 -- therefore never offered a credential its form cannot save. Every other
 -- reader — the save RPC, the table guards, SQL — sees the full catalogue.
 AND (NOT (t.requires_scope OR EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific))
      OR coalesce(current_setting('request.path', true),'') <> '/sp_approved_credential_catalogue'
      OR coalesce(nullif(current_setting('request.headers', true),'')::json->>'x-passport-catalogue-contract','') = '2')
 AND (d.effective_from IS NULL OR d.effective_from<=current_date)
 AND (d.retired_on IS NULL OR d.retired_on>current_date)
 AND public.sp_is_passport_credential(t.claim_type,t.code)
 AND ((t.scope_code='global_professional' AND i.id IS NOT NULL)
 OR (t.scope_code='national_regulated'
 -- The issuer is a governed authority, OR the governed organisation-role model
 -- says the issuer is stated on the document (an awarding organisation or an
 -- authorised training provider) under a governed, active REGULATOR.
 AND (a.id IS NOT NULL OR (
   EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
   AND EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            JOIN public.sp_authorities ra ON ra.id=r.authority_id AND ra.is_active
            WHERE r.credential_code=t.code AND r.role='regulator')))
 AND EXISTS (SELECT 1 FROM public.sp_jurisdictions j WHERE j.code=t.jurisdiction_code AND j.is_active)
 AND (t.sub_jurisdiction_code IS NULL OR EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions j WHERE j.code=t.sub_jurisdiction_code AND j.is_active))
 AND EXISTS (
   SELECT 1 FROM public.sp_market_packs p WHERE p.code=t.market_pack_code
   -- An active market, or an internal-pilot market for its own pilot member:
   -- the same two states sp_market_access() reports as 'production' / 'pilot'.
   AND (p.is_active
        OR (p.pilot_state='internal_pilot' AND public.sp_is_pilot_member(auth.uid(), p.code)))
   AND p.superseded_on IS NULL
   AND p.jurisdiction_code=t.jurisdiction_code
   AND p.sub_jurisdiction_code IS NOT DISTINCT FROM t.sub_jurisdiction_code)));

-- Re-stated, not assumed: a replaced view keeps its grants, and this says so.
REVOKE ALL ON public.sp_approved_credential_catalogue FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sp_approved_credential_catalogue TO authenticated,service_role;


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


CREATE OR REPLACE FUNCTION public.sp_closed_catalogue_details_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE;
BEGIN
 SELECT a.* INTO d FROM public.sp_approved_credential_catalogue a JOIN public.sp_claims c ON c.credential_code=a.code WHERE c.id=NEW.claim_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_APPROVED_DEFINITION_REQUIRED'; END IF;
 IF NEW.credential_class IS DISTINCT FROM d.credential_class
 OR NEW.original_language IS DISTINCT FROM d.original_language
 OR NEW.issuing_country_code IS DISTINCT FROM d.country
 OR NEW.issuing_jurisdiction_code IS DISTINCT FROM coalesce(d.region,d.country)
 OR NEW.validity_jurisdiction_code IS DISTINCT FROM coalesce(d.region,d.country)
 THEN RAISE EXCEPTION 'SP_GOVERNED_METADATA_IMMUTABLE'; END IF;
 IF NEW.no_expiry IS TRUE AND (NOT d.allows_no_expiry OR d.requires_valid_until)
 THEN RAISE EXCEPTION 'SP_NO_EXPIRY_NOT_APPROVED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_closed_catalogue_details_guard() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sp_save_international_credential(_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _old public.sp_claims%ROWTYPE;
 _id uuid; _issued date; _expiry date; _no_expiry boolean;
 _requires_scope boolean; _scope text; _issuer text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_input) IS DISTINCT FROM 'object' OR EXISTS (
 SELECT 1 FROM jsonb_object_keys(_input) k WHERE k<>ALL(ARRAY['claim_id','version','definition_code','market_country','market_region','identifier','issued_on','valid_until','no_expiry','authorisation_scope','issuer_name']))
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=_input->>'definition_code';
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_APPROVED_DEFINITION_REQUIRED'; END IF;
 IF nullif(_input->>'market_country','') IS DISTINCT FROM d.country
 OR nullif(_input->>'market_region','') IS DISTINCT FROM d.region
 THEN RAISE EXCEPTION 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET'; END IF;
 IF length(coalesce(_input->>'identifier',''))>120 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 -- SCOPE: required on a scoped definition, refused on every other one. Never inferred.
 SELECT t.requires_scope INTO _requires_scope FROM public.sp_credential_types t WHERE t.code=d.code;
 _scope:=nullif(btrim(coalesce(_input->>'authorisation_scope','')),'');
 IF length(coalesce(_scope,''))>200 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 IF _requires_scope AND _scope IS NULL THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_SCOPE'; END IF;
 IF NOT _requires_scope AND _scope IS NOT NULL THEN RAISE EXCEPTION 'SP_SCOPE_NOT_APPLICABLE'; END IF;
 -- ISSUER: governed and fixed wherever the catalogue names one. Holder-stated only
 -- where the organisation-role model says the issuer is stated on the document.
 _issuer:=nullif(btrim(coalesce(_input->>'issuer_name','')),'');
 IF length(coalesce(_issuer,''))>160 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 IF d.issuer_name IS NULL AND (_issuer IS NULL OR length(_issuer)<2) THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_ISSUER'; END IF;
 IF d.issuer_name IS NOT NULL AND _issuer IS NOT NULL THEN RAISE EXCEPTION 'SP_ISSUER_IS_GOVERNED'; END IF;
 -- A document-stated issuer is an awarding organisation or a training provider.
 -- A governed AUTHORITY is neither: the regulator does not deliver the course.
 IF d.issuer_name IS NULL AND EXISTS (SELECT 1 FROM public.sp_authorities g
   WHERE lower(g.name_local)=lower(_issuer) OR lower(g.name_en)=lower(_issuer))
 THEN RAISE EXCEPTION 'SP_ISSUER_IS_A_REGULATOR'; END IF;
 IF nullif(_input->>'issued_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR nullif(_input->>'valid_until','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_DATE'; END IF;
 _issued:=nullif(_input->>'issued_on','')::date; _expiry:=nullif(_input->>'valid_until','')::date;
 _no_expiry:=(_input->>'no_expiry')::boolean;
 IF _no_expiry IS TRUE AND (NOT d.allows_no_expiry OR d.requires_valid_until) THEN RAISE EXCEPTION 'SP_NO_EXPIRY_NOT_APPROVED'; END IF;
 IF _no_expiry IS TRUE AND _expiry IS NOT NULL THEN RAISE EXCEPTION 'SP_EXPIRY_CONFLICT'; END IF;
 IF _issued IS NOT NULL AND _expiry IS NOT NULL AND _expiry<=_issued THEN RAISE EXCEPTION 'SP_INVALID_DATES'; END IF;
 IF d.requires_valid_until AND _expiry IS NULL THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_VALID_UNTIL'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id=auth.uid()) THEN RAISE EXCEPTION 'SP_NO_PASSPORT'; END IF;
 IF nullif(_input->>'claim_id','') IS NOT NULL THEN
 SELECT * INTO _old FROM public.sp_claims WHERE id=(_input->>'claim_id')::uuid AND holder_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR _old.credential_code IS DISTINCT FROM d.code THEN RAISE EXCEPTION 'SP_NOT_EDITABLE'; END IF;
 IF _old.version_no IS DISTINCT FROM (_input->>'version')::integer THEN RAISE EXCEPTION 'SP_STALE_VERSION'; END IF;
 _id:=public.sp_correct_claim(_old.id,d.name_en,coalesce(d.issuer_name,_issuer),d.country,_issued,_issued,_expiry,
 'Holder corrected personal credential data',d.code,nullif(_input->>'identifier',''),NULL,NULL,NULL,d.region,_scope);
 IF EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_id AND assertion_level<>'self_declared') THEN RAISE EXCEPTION 'SP_METADATA_REVIEW_REQUIRED'; END IF;
 ELSE
 INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,
 issued_on,valid_from,valid_until,credential_reference,authorisation_scope)
 VALUES(auth.uid(),d.claim_type,d.code,d.name_en,coalesce(d.issuer_name,_issuer),d.country,d.region,_issued,_issued,_expiry,nullif(_input->>'identifier',''),_scope) RETURNING id INTO _id;
 END IF;
 INSERT INTO public.sp_credential_details(claim_id,credential_class,original_language,issuing_country_code,issuing_jurisdiction_code,validity_jurisdiction_code,no_expiry)
 VALUES(_id,d.credential_class,d.original_language,d.country,coalesce(d.region,d.country),coalesce(d.region,d.country),_no_expiry);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sp_save_international_credential(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_save_international_credential(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sp_verifier_request_detail(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _out jsonb;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO _r FROM public.sp_verification_requests
   WHERE id = _request_id AND request_kind = 'cqrityjob_review';
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  SELECT jsonb_build_object(
    'id', _r.id,
    'status', _r.status,
    'submitted_at', _r.submitted_at,
    'subject_type', CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
    'is_self', (_r.holder_user_id = auth.uid()),
    'holder_name', (SELECT coalesce(display_name,'') FROM public.sp_passport_profiles
                     WHERE holder_user_id = _r.holder_user_id),
    -- The claim as the CANDIDATE stated it. `credential_code` and
    -- `credential_reference` are what a certificate is matched against;
    -- `sub_jurisdiction_code` is the difference between a Dubai licence and a
    -- UAE-wide one; `authorisation_scope` is the limit that turns a scoped
    -- approval into a general one when it goes missing.
    --
    -- ── WHY credential_reference IS HERE AND NOWHERE ELSE ────────────
    --
    -- Phase 7 documents it as PRIVATE and keeps it out of every disclosure
    -- package, because to a recipient it is a lookup key into someone else's
    -- register. That boundary is unchanged and still asserted for all five
    -- packages (phase 7 suite, GROUP 3).
    --
    -- The verifier is not a recipient. Matching the number on the certificate
    -- against the number on the claim is the specific act being asked for,
    -- and a reviewer who cannot see the claimed reference is checking a title
    -- against a document. This function is verifier-gated and the column is
    -- reachable through no other path.
    --
    -- `holder_note` is deliberately NOT here. Phase 7 calls it the holder's
    -- private words, and unlike the reference it is not something a document
    -- is checked against.
    'claim', (SELECT jsonb_build_object(
                'id', c.id, 'type', c.claim_type, 'title', c.title,
                'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
                'sub_jurisdiction', c.sub_jurisdiction_code,
                'credential_code', c.credential_code,
                'credential_reference', c.credential_reference,
                'authorisation_scope', c.authorisation_scope,
                'issued_on', c.issued_on, 'valid_from', c.valid_from,
                'valid_until', c.valid_until,
                'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
                'version_no', c.version_no)
                FROM public.sp_claims c WHERE c.id = _r.claim_id),
    'period', (SELECT jsonb_build_object(
                'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
                'started_on', e.started_on, 'ended_on', e.ended_on,
                'employment_type', e.employment_type, 'jurisdiction', e.jurisdiction_code,
                'security_relevance', e.security_relevance,
                'security_fraction', e.security_fraction,
                'fte_fraction', e.fte_fraction,
                'version_no', e.version_no,
                'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state)
                FROM public.sp_experience_periods e WHERE e.id = _r.period_id),
    -- Prior versions of THIS fact, for claims and now for periods too. A
    -- correction by supersession is the signal that this is not a first
    -- submission, and it was reaching the reviewer for one object type only.
    'previous_versions', CASE
      WHEN _r.claim_id IS NOT NULL THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'title', pc.title,
                                            'version_no', pc.version_no,
                                            'lifecycle', pc.lifecycle_state)
                         ORDER BY pc.version_no)
          FROM public.sp_claims pc
         WHERE pc.holder_user_id = _r.holder_user_id
           AND pc.id <> _r.claim_id
           AND pc.id IN (SELECT supersedes_id FROM public.sp_claims WHERE id = _r.claim_id)
      ), '[]'::jsonb)
      ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pe.id,
                                            'title', pe.role_title || ' — ' || pe.employer_name,
                                            'version_no', pe.version_no,
                                            'lifecycle', pe.lifecycle_state)
                         ORDER BY pe.version_no)
          FROM public.sp_experience_periods pe
         WHERE pe.holder_user_id = _r.holder_user_id
           AND pe.id <> _r.period_id
           AND pe.id IN (SELECT supersedes_id FROM public.sp_experience_periods
                          WHERE id = _r.period_id)
      ), '[]'::jsonb)
    END,
    'evidence', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', ev.id, 'file_name', ev.file_name, 'mime_type', ev.mime_type,
               'size_bytes', ev.size_bytes, 'storage_path', ev.storage_path,
               'uploaded_at', ev.uploaded_at) ORDER BY ev.uploaded_at)
        FROM public.sp_evidence ev
       WHERE ev.lifecycle_state = 'active'
         AND ((_r.claim_id IS NOT NULL AND ev.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND ev.period_id = _r.period_id))
    ), '[]'::jsonb),
    'prior_decisions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'decision', d.decision, 'organisation', d.decider_organisation,
               'method', d.verification_method, 'decided_at', d.decided_at,
               'note', d.decision_note) ORDER BY d.decided_at DESC)
        FROM public.sp_verification_decisions d
        JOIN public.sp_verification_requests r2 ON r2.id = d.request_id
       WHERE r2.holder_user_id = _r.holder_user_id
         AND ((_r.claim_id IS NOT NULL AND r2.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND r2.period_id = _r.period_id))
    ), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_request_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_request_detail(uuid) TO authenticated;


ALTER TABLE public.sp_credential_details DROP COLUMN definition_version;
DROP TABLE public.sp_credential_definition_versions;

DELETE FROM public.sp_regulatory_sources WHERE source_key IN ('in_nqr_register','in_ncvet_home','in_mepsc_security_standards','in_mha_psara');
DELETE FROM public.sp_credential_organisation_roles WHERE credential_code IN (SELECT code FROM public.sp_credential_types WHERE scope_code='national_qualification');
DELETE FROM public.sp_credential_definition_reviews WHERE credential_code IN (SELECT code FROM public.sp_credential_types WHERE scope_code='national_qualification');
DELETE FROM public.sp_credential_definition_jurisdictions WHERE credential_code IN (SELECT code FROM public.sp_credential_types WHERE scope_code='national_qualification');
DELETE FROM public.sp_credential_definition_metadata WHERE credential_code IN (SELECT code FROM public.sp_credential_types WHERE scope_code='national_qualification');
DELETE FROM public.sp_credential_types WHERE scope_code='national_qualification';
ALTER TABLE public.sp_credential_types DROP CONSTRAINT sp_credential_type_national_qualification_bound;
DELETE FROM public.sp_credential_scopes WHERE code='national_qualification';
DELETE FROM public.sp_credential_classes WHERE code='vocational_qualification';
DELETE FROM public.sp_authorities WHERE code='IN_NCVET';
DELETE FROM public.sp_credential_jurisdictions WHERE code='IN';
DELETE FROM public.sp_jurisdictions WHERE code='IN';

COMMIT;
