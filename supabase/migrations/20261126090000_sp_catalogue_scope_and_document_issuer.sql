-- The approved catalogue reaches EVERY researched definition: scoped
-- authorisations, document-stated issuers, and the Dubai organisation roles.
--
-- ── WHAT WAS WITHHELD, AND WHY THAT WAS A GAP, NOT A RULE ──────────────
--
-- The closed catalogue (20261121090000) projected 19 of 73 definitions. Three
-- Swedish rows and every scoped Dubai card were unreachable BY CONSTRUCTION,
-- whatever an administrator approved:
--
--   VU1, VU2 and six UK licence-linked qualifications / top-up training
--       The view required a governed AUTHORITY as issuer. These are awarded by
--       an awarding organisation or an authorised training provider, which the
--       organisation-role model (20261123090000) already records as
--       issuer.document_specific = true under a governed REGULATOR. The view
--       never read that model.
--   SV and the fifteen SIRA Security Cadre cards (requires_scope)
--       The view excluded them with NOT requires_scope, and the governed save
--       RPC had no scope key. The scope rule itself has been enforced by
--       sp_claims_credential_rules since 20260907091000.
--
-- ── WHAT CHANGES ───────────────────────────────────────────────────────
--
--   1. sp_approved_credential_catalogue (body only; column list unchanged, so
--      every %ROWTYPE reader keeps its shape): a scoped definition is listed;
--      a national definition is listed when its issuer is a governed authority
--      OR the role model says document-stated under a governed, active regulator.
--   2. sp_save_international_credential (body only; same signature): two new
--      input keys. authorisation_scope is REQUIRED on a scoped definition and
--      REFUSED on every other one. issuer_name is REQUIRED where the catalogue
--      names no issuer (document-stated) and REFUSED where it names one.
--   3. sp_closed_catalogue_claim_guard (body only): the same two rules at the
--      table, so no other writer can bypass them.
--   4. sp_credential_payload_v2 (body only): a document-stated issuer is
--      disclosed as the holder stated it, instead of as nothing.
--   5. Organisation roles and definition reviews for the thirty Dubai
--      definitions, which 20261123090000 never covered. Sources are the ones
--      already registered in sp_regulatory_sources and found reachable on
--      2026-08-22 (docs/passport/regulatory-source-register.md). Abu Dhabi is
--      closed by owner decision and receives nothing.
--
-- ── WHAT DOES NOT CHANGE ───────────────────────────────────────────────
--
-- No definition is approved and no market is activated: is_active, pilot_state
-- and legal_review_state are untouched on every row. The scope requirement is
-- not removed from any definition. No table, column, function, grant, policy
-- or trigger is introduced — EXPAND, bodies and seed rows only. A candidate
-- still cannot create a credential type, an issuer or a catalogue row.
--
-- Rollback: supabase/rollback/20261126090000_sp_catalogue_scope_and_document_issuer_rollback.sql

BEGIN;

-- ── 1. the catalogue view ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.sp_approved_credential_catalogue WITH (security_invoker=true,security_barrier=true) AS
SELECT t.code, t.claim_type, t.name_sv, t.name_en,
 coalesce(m.credential_class,CASE t.claim_type WHEN 'licence' THEN 'regulated_authorisation' WHEN 'training' THEN 'mandatory_training' ELSE 'certification' END) AS credential_class,
 t.scope_code, t.jurisdiction_code AS country, t.sub_jurisdiction_code AS region,
 coalesce(i.id,a.id) AS issuer_id, coalesce(i.display_name,a.name_local) AS issuer_name,
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
 t.is_active AND m.deprecated_at IS NULL
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

-- ── 2. the governed save RPC ───────────────────────────────────────────
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

-- ── 3. the table guard ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sp_closed_catalogue_claim_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _requires_scope boolean;
BEGIN
 -- Historical claims can still be archived/reviewed. This exception cannot
 -- change any holder content, ownership, definition or governed metadata.
 IF TG_OP='UPDATE' AND NOT (OLD.lifecycle_state<>'active' AND NEW.lifecycle_state='active') AND (to_jsonb(NEW)-ARRAY['lifecycle_state','assertion_level','verified_by_user_id','verified_at','updated_at'])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['lifecycle_state','assertion_level','verified_by_user_id','verified_at','updated_at']) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND public.sp_is_passport_credential(OLD.claim_type,OLD.credential_code)
   AND (NEW.claim_type IS DISTINCT FROM OLD.claim_type OR NEW.credential_code IS DISTINCT FROM OLD.credential_code)
 THEN RAISE EXCEPTION 'SP_DEFINITION_IMMUTABLE' USING ERRCODE='23514'; END IF;
 -- Legacy correction RPCs insert a successor rather than UPDATE the old row.
 -- The successor must still describe the same holder and governed definition.
 IF NEW.supersedes_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.sp_claims previous WHERE previous.id=NEW.supersedes_id
   AND public.sp_is_passport_credential(previous.claim_type,previous.credential_code)
   AND (NEW.holder_user_id IS DISTINCT FROM previous.holder_user_id
     OR NEW.claim_type IS DISTINCT FROM previous.claim_type
     OR NEW.credential_code IS DISTINCT FROM previous.credential_code)
 ) THEN RAISE EXCEPTION 'SP_DEFINITION_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NOT public.sp_is_passport_credential(NEW.claim_type,NEW.credential_code) THEN RETURN NEW; END IF;
 -- PostgreSQL accepts infinity as a date. It must not bypass governed no-expiry.
 IF NOT isfinite(NEW.issued_on) OR NOT isfinite(NEW.valid_from) OR NOT isfinite(NEW.valid_until)
 OR NEW.issued_on NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31'
 OR NEW.valid_from NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31'
 OR NEW.valid_until NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31'
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_DATE' USING ERRCODE='23514'; END IF;

 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=NEW.credential_code;
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_APPROVED_DEFINITION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT t.requires_scope INTO _requires_scope FROM public.sp_credential_types t WHERE t.code=d.code;
 -- A governed issuer is fixed. A NULL catalogue issuer means the organisation-role
 -- model says the issuer is stated on the document: the holder must name it.
 -- A scope is REQUIRED on a scoped definition and refused on every other one.
 IF NEW.claim_type IS DISTINCT FROM d.claim_type OR NEW.title NOT IN (d.name_sv,d.name_en)
 OR (d.issuer_name IS NOT NULL AND NEW.claimed_issuer_name IS DISTINCT FROM d.issuer_name)
 OR NEW.jurisdiction_code IS DISTINCT FROM d.country OR NEW.sub_jurisdiction_code IS DISTINCT FROM d.region
 OR (NOT _requires_scope AND NEW.authorisation_scope IS NOT NULL) OR NEW.holder_note IS NOT NULL
 THEN RAISE EXCEPTION 'SP_GOVERNED_METADATA_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF d.issuer_name IS NULL AND nullif(btrim(NEW.claimed_issuer_name),'') IS NULL
 THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_ISSUER' USING ERRCODE='23514'; END IF;
 IF _requires_scope AND nullif(btrim(NEW.authorisation_scope),'') IS NULL
 THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_SCOPE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_closed_catalogue_claim_guard() FROM PUBLIC,anon,authenticated,service_role;

-- ── 4. the disclosure payload ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sp_credential_payload_v2(_holder uuid,_ids uuid[],_fields text[],_purpose text,_locale text,_expires timestamptz,_created timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE _p public.sp_passport_profiles%ROWTYPE; _name text; _profile_title text;
BEGIN
 SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id=_holder;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 SELECT display_name INTO _name FROM public.profiles WHERE id=_holder;
 IF 'profile_title'=ANY(_fields) THEN
 SELECT coalesce(nullif(btrim(CASE WHEN _locale='sv' THEN p.title_sv ELSE p.title_en END),''),nullif(btrim(c.current_profession_other),''))
 INTO _profile_title FROM public.security_career_profiles c
 LEFT JOIN public.cig_professions p ON p.slug=c.current_profession_slug AND p.content_status='published'
 WHERE c.user_id=_holder;
 END IF;
 RETURN jsonb_build_object('status','active','package','selected_merits','schema_version',2,'focus','passport',
 'purpose',_purpose,'locale',_locale,'expires_at',_expires,'authorised_at',_created,
 'holder',CASE WHEN NOT 'holder_name'=ANY(_fields) OR _p.privacy_mode='anonymous' THEN NULL
   WHEN _p.privacy_mode='initials' THEN regexp_replace(coalesce(_name,''),'(\S)\S*','\1.','g') ELSE _name END,
 'privacy_mode',CASE WHEN 'holder_name'=ANY(_fields) THEN _p.privacy_mode ELSE 'anonymous' END,
 'profile_title',_profile_title,'profession_slug',NULL,'jurisdiction',NULL,'sub_jurisdiction',NULL,
 'verified_experience','[]'::jsonb,'verified_experience_days',0,
 'last_updated',(SELECT max(updated_at) FROM public.sp_claims WHERE holder_user_id=_holder AND id=ANY(_ids)),
 'verified_claims',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'key','c'||c.ord,'type',c.claim_type,'title',c.title,'credential_code',c.credential_code,
   'issuer',(SELECT coalesce(a.name_local,i.display_name,CASE WHEN r.document_specific THEN nullif(btrim(c.claimed_issuer_name),'') END) FROM public.sp_credential_organisation_roles r LEFT JOIN public.sp_authorities a ON a.id=r.authority_id LEFT JOIN public.sp_certification_issuers i ON i.id=r.certification_issuer_id WHERE r.credential_code=c.credential_code AND r.role='issuer'),'jurisdiction',c.jurisdiction_code,'sub_jurisdiction',c.sub_jurisdiction_code,
   'scope_limited',nullif(btrim(c.authorisation_scope),'') IS NOT NULL,'authorisation_scope',NULL,
   'issued_on',c.issued_on,'valid_until',c.valid_until,
   'assertion',CASE WHEN c.assertion_level='verified' AND (v.id IS NULL OR (v.valid_until IS NOT NULL AND v.valid_until<current_date))
      THEN 'document_provided' ELSE c.assertion_level::text END,
   'lifecycle',CASE WHEN c.lifecycle_state='active' AND c.valid_until<current_date THEN 'expired' ELSE c.lifecycle_state::text END,
   'verified_at',CASE WHEN v.id IS NOT NULL AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN c.verified_at END,
   'verification_method',CASE WHEN c.assertion_level='verified' AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN v.verification_method END,
   'verifier_organisation',CASE WHEN c.assertion_level='verified' AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN v.decider_organisation END,
   'credential_identifier',CASE WHEN 'identifier'=ANY(_fields) THEN c.credential_reference END,
   'credential_class',m.credential_class,'original_language',m.original_language,
   'issuing_country',m.issuing_country_code,'issuing_jurisdiction',m.issuing_jurisdiction_code,
   'validity_jurisdiction',m.validity_jurisdiction_code,'no_expiry',m.no_expiry,
   -- The DEFINITION's own scope, read from the governed catalogue row and never
   -- from the claim: 'global_professional' for an international certification,
   -- 'national_regulated' for a country's or region's, NULL when the claim
   -- carries no governed code. A recipient surface may draw a globe only for
   -- the first, and must leave the last unknown.
   'scope_code',ct.scope_code) ORDER BY c.ord)
 FROM (SELECT c.*,row_number() OVER(ORDER BY c.issued_on DESC NULLS LAST,c.id) ord FROM public.sp_claims c
   WHERE c.holder_user_id=_holder AND c.id=ANY(_ids) AND c.lifecycle_state IN ('active','expired','revoked')
   AND public.sp_is_passport_credential(c.claim_type,c.credential_code)) c
 LEFT JOIN public.sp_credential_details m ON m.claim_id=c.id
 LEFT JOIN public.sp_credential_types ct ON ct.code=c.credential_code
 LEFT JOIN LATERAL (SELECT d.* FROM public.sp_verification_decisions d JOIN public.sp_verification_requests r ON r.id=d.request_id
    WHERE r.claim_id=c.id ORDER BY d.decided_at DESC,d.id DESC LIMIT 1) latest ON true
 LEFT JOIN public.sp_verification_decisions v ON v.id=latest.id AND v.decision='approved'
 ),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.sp_credential_payload_v2(uuid,uuid[],text[],text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

-- ── 5. Dubai: definition reviews and organisation roles ────────────────
INSERT INTO public.sp_credential_definition_reviews(credential_code,professional_domain,source_url,checked_on,validity_sv,validity_en)
SELECT t.code,
 CASE WHEN t.code IN ('AE_DU_SIRA_CARD_OPS_MANAGER','AE_DU_SIRA_CARD_SECURITY_MANAGER','AE_DU_SIRA_CARD_HEAD_OF_SECURITY',
                      'AE_DU_SIRA_CARD_CONSULTANT','AE_DU_SIRA_CARD_EXPERT','AE_DU_OPS_MANAGER_COURSE','AE_DU_SECURITY_MANAGER_COURSE')
      THEN 'security_management'
      WHEN t.code LIKE 'AE\_DU\_%SYSTEMS\_%' THEN 'physical_security'
      ELSE 'security_operations' END,
 CASE WHEN t.category='appointment' THEN 'https://www.sira.gov.ae/en/services/security-cadre-card'
      ELSE 'https://www.sira.gov.ae/en/information-center/certified-security-training-centers' END,
 DATE '2026-08-22',
 CASE WHEN t.category='appointment'
      THEN 'SIRA:s säkerhetskort är knutet till det licensierade företag innehavaren arbetar för och anger sitt eget slutdatum. SIRA anger generellt två års giltighet för företagsansökta kategorier; datumet beräknas aldrig, det läses från kortet.'
      ELSE 'Kursintyg från ett SIRA-certifierat utbildningscenter. En genomförd kurs är inte ett säkerhetskort och ger ingen behörighet att arbeta.' END,
 CASE WHEN t.category='appointment'
      THEN 'A SIRA Security Cadre card is tied to the licensed company its holder works for and states its own expiry. SIRA publishes a general two-year validity for company-submitted categories; the date is never computed, it is read from the card.'
      ELSE 'A course certificate from a SIRA-certified training centre. A completed course is not a cadre card and permits no work.' END
FROM public.sp_credential_types t WHERE t.market_pack_code='AE-DU'
ON CONFLICT (credential_code) DO NOTHING;

INSERT INTO public.sp_credential_organisation_roles(credential_code,role,authority_id,certification_issuer_id,document_specific,source_url,checked_on)
SELECT t.code, r.role, a.id, NULL, false,
 CASE WHEN t.category='appointment' THEN 'https://www.sira.gov.ae/en/services/security-cadre-card'
      ELSE 'https://www.sira.gov.ae/en/information-center/certified-security-training-centers' END,
 DATE '2026-08-22'
FROM public.sp_credential_types t
CROSS JOIN (VALUES ('regulator'),('issuer'),('verification_authority')) r(role)
JOIN public.sp_authorities a ON a.code='AE_DU_SIRA'
WHERE t.market_pack_code='AE-DU'
ON CONFLICT (credential_code,role) DO NOTHING;

-- A course is delivered by a SIRA-certified training CENTRE, named on the
-- certificate. SIRA regulates the centres; it is not recorded as the trainer.
INSERT INTO public.sp_credential_organisation_roles(credential_code,role,authority_id,certification_issuer_id,document_specific,source_url,checked_on)
SELECT t.code,'training_provider',NULL,NULL,true,
 'https://www.sira.gov.ae/en/information-center/certified-security-training-centers',DATE '2026-08-22'
FROM public.sp_credential_types t
WHERE t.market_pack_code='AE-DU' AND t.claim_type='training'
ON CONFLICT (credential_code,role) DO NOTHING;

-- The view must still carry the reloptions the closed catalogue declared, and
-- nothing in this migration may have approved or activated anything.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='sp_approved_credential_catalogue'
   AND reloptions @> ARRAY['security_invoker=true','security_barrier=true']) THEN
   RAISE EXCEPTION 'sp_approved_credential_catalogue lost security_invoker/security_barrier'; END IF;
 IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active) THEN
   RAISE EXCEPTION 'a pilot or closed market definition is active: this migration approves nothing'; END IF;
END $$;

COMMIT;
