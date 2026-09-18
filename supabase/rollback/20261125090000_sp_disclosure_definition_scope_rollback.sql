-- Local/test rollback only. Restores the 20261123090000 body of
-- sp_credential_payload_v2 (no 'scope_code' key). No application rows are touched.
BEGIN;
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
   'validity_jurisdiction',m.validity_jurisdiction_code,'no_expiry',m.no_expiry) ORDER BY c.ord)
 FROM (SELECT c.*,row_number() OVER(ORDER BY c.issued_on DESC NULLS LAST,c.id) ord FROM public.sp_claims c
   WHERE c.holder_user_id=_holder AND c.id=ANY(_ids) AND c.lifecycle_state IN ('active','expired','revoked')
   AND public.sp_is_passport_credential(c.claim_type,c.credential_code)) c
 LEFT JOIN public.sp_credential_details m ON m.claim_id=c.id
 LEFT JOIN LATERAL (SELECT d.* FROM public.sp_verification_decisions d JOIN public.sp_verification_requests r ON r.id=d.request_id
    WHERE r.claim_id=c.id ORDER BY d.decided_at DESC,d.id DESC LIMIT 1) latest ON true
 LEFT JOIN public.sp_verification_decisions v ON v.id=latest.id AND v.decision='approved'
 ),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.sp_credential_payload_v2(uuid,uuid[],text[],text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
