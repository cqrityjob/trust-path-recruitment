-- Rollback of 20261126090000_sp_catalogue_scope_and_document_issuer.
-- Restores the 20261124090000 view body, the 20261121090000 save RPC and claim
-- guard, and the 20261125090000 payload, and removes the Dubai role and review
-- rows this migration seeded. Claims saved meanwhile are NOT deleted: a scoped
-- or document-issuer claim simply becomes uneditable again, as before.
BEGIN;
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
 t.is_active AND NOT t.requires_scope AND m.deprecated_at IS NULL
 AND (d.effective_from IS NULL OR d.effective_from<=current_date)
 AND (d.retired_on IS NULL OR d.retired_on>current_date)
 AND public.sp_is_passport_credential(t.claim_type,t.code)
 AND ((t.scope_code='global_professional' AND i.id IS NOT NULL)
 OR (t.scope_code='national_regulated' AND a.id IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.sp_save_international_credential(_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _old public.sp_claims%ROWTYPE;
 _id uuid; _issued date; _expiry date; _no_expiry boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_input) IS DISTINCT FROM 'object' OR EXISTS (
 SELECT 1 FROM jsonb_object_keys(_input) k WHERE k<>ALL(ARRAY['claim_id','version','definition_code','market_country','market_region','identifier','issued_on','valid_until','no_expiry']))
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=_input->>'definition_code';
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_APPROVED_DEFINITION_REQUIRED'; END IF;
 IF nullif(_input->>'market_country','') IS DISTINCT FROM d.country
 OR nullif(_input->>'market_region','') IS DISTINCT FROM d.region
 THEN RAISE EXCEPTION 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET'; END IF;
 IF length(coalesce(_input->>'identifier',''))>120 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
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
 _id:=public.sp_correct_claim(_old.id,d.name_en,d.issuer_name,d.country,_issued,_issued,_expiry,
 'Holder corrected personal credential data',d.code,nullif(_input->>'identifier',''),NULL,NULL,NULL,d.region,NULL);
 IF EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_id AND assertion_level<>'self_declared') THEN RAISE EXCEPTION 'SP_METADATA_REVIEW_REQUIRED'; END IF;
 ELSE
 INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,
 issued_on,valid_from,valid_until,credential_reference)
 VALUES(auth.uid(),d.claim_type,d.code,d.name_en,d.issuer_name,d.country,d.region,_issued,_issued,_expiry,nullif(_input->>'identifier','')) RETURNING id INTO _id;
 END IF;
 INSERT INTO public.sp_credential_details(claim_id,credential_class,original_language,issuing_country_code,issuing_jurisdiction_code,validity_jurisdiction_code,no_expiry)
 VALUES(_id,d.credential_class,d.original_language,d.country,coalesce(d.region,d.country),coalesce(d.region,d.country),_no_expiry);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sp_save_international_credential(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_save_international_credential(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sp_closed_catalogue_claim_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE;
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
 IF NEW.claim_type IS DISTINCT FROM d.claim_type OR NEW.title NOT IN (d.name_sv,d.name_en)
 OR NEW.claimed_issuer_name IS DISTINCT FROM d.issuer_name
 OR NEW.jurisdiction_code IS DISTINCT FROM d.country OR NEW.sub_jurisdiction_code IS DISTINCT FROM d.region
 OR NEW.authorisation_scope IS NOT NULL OR NEW.holder_note IS NOT NULL
 THEN RAISE EXCEPTION 'SP_GOVERNED_METADATA_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_closed_catalogue_claim_guard() FROM PUBLIC,anon,authenticated,service_role;

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
   'issuer',(SELECT coalesce(a.name_local,i.display_name) FROM public.sp_credential_organisation_roles r LEFT JOIN public.sp_authorities a ON a.id=r.authority_id LEFT JOIN public.sp_certification_issuers i ON i.id=r.certification_issuer_id WHERE r.credential_code=c.credential_code AND r.role='issuer'),'jurisdiction',c.jurisdiction_code,'sub_jurisdiction',c.sub_jurisdiction_code,
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

DELETE FROM public.sp_credential_organisation_roles WHERE credential_code IN (SELECT code FROM public.sp_credential_types WHERE market_pack_code='AE-DU');
DELETE FROM public.sp_credential_definition_reviews WHERE credential_code IN (SELECT code FROM public.sp_credential_types WHERE market_pack_code='AE-DU');
COMMIT;
