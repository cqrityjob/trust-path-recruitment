-- CLI-created 20260915192619; ordered after the three unpublished Passport units.
-- Closed catalogue owner decision. No personal rows changed or deleted.
BEGIN;
ALTER TABLE public.sp_credential_types ADD COLUMN allows_no_expiry boolean NOT NULL DEFAULT false;
-- An absent expiry requirement is NOT evidence of lifetime validity.
COMMENT ON COLUMN public.sp_credential_types.allows_no_expiry IS 'Catalogue administrator approval for an explicit holder no-expiry declaration. Defaults false; no inferred approvals.';

CREATE VIEW public.sp_approved_credential_catalogue WITH (security_invoker=true,security_barrier=true) AS
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
WHERE t.is_active AND NOT t.requires_scope AND m.deprecated_at IS NULL
 AND (d.effective_from IS NULL OR d.effective_from<=current_date)
 AND (d.retired_on IS NULL OR d.retired_on>current_date)
 AND public.sp_is_passport_credential(t.claim_type,t.code)
 AND ((t.scope_code='global_professional' AND i.id IS NOT NULL)
 OR (t.scope_code='national_regulated' AND a.id IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.sp_jurisdictions j WHERE j.code=t.jurisdiction_code AND j.is_active)
 AND (t.sub_jurisdiction_code IS NULL OR EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions j WHERE j.code=t.sub_jurisdiction_code AND j.is_active))
 AND EXISTS (
   SELECT 1 FROM public.sp_market_packs p WHERE p.code=t.market_pack_code
   AND p.is_active AND p.superseded_on IS NULL
   AND p.jurisdiction_code=t.jurisdiction_code
   AND p.sub_jurisdiction_code IS NOT DISTINCT FROM t.sub_jurisdiction_code)));
REVOKE ALL ON public.sp_approved_credential_catalogue FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sp_approved_credential_catalogue TO authenticated,service_role;

-- Catalogue DML is an administrative migration operation, never a candidate API.
-- No admin membership is inferred from candidate-editable JWT metadata.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sp_credential_types','sp_authorities','sp_jurisdictions','sp_sub_jurisdictions',
 'sp_market_packs','sp_credential_scopes','sp_certification_definitions','sp_certification_issuers',
 'sp_certification_issuer_aliases','sp_certification_sources','sp_credential_classes','sp_credential_jurisdictions',
 'sp_credential_definition_metadata','sp_credential_definition_jurisdictions','sp_credential_adapter_mappings'] LOOP
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;

CREATE FUNCTION public.sp_closed_catalogue_claim_guard()
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
 IF NOT public.sp_is_passport_credential(NEW.claim_type,NEW.credential_code) THEN RETURN NEW; END IF;
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
CREATE TRIGGER sp_00_closed_catalogue BEFORE INSERT OR UPDATE ON public.sp_claims
 FOR EACH ROW EXECUTE FUNCTION public.sp_closed_catalogue_claim_guard();

-- Claim details contain a governed snapshot plus the permitted no-expiry fact.
CREATE FUNCTION public.sp_closed_catalogue_details_guard()
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
CREATE TRIGGER sp_00_closed_catalogue_details BEFORE INSERT OR UPDATE ON public.sp_credential_details
 FOR EACH ROW EXECUTE FUNCTION public.sp_closed_catalogue_details_guard();

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
COMMIT;
