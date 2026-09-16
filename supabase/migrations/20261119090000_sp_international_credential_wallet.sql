BEGIN;
-- GoTrue logout revokes refresh tokens, but a signed access JWT remains
-- cryptographically valid until exp. Passport checks its live session as well.
-- No JWT user_metadata is trusted and no other user's session is exposed.
CREATE FUNCTION public.sp_passport_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE
   -- SQL/admin operations carry no Auth JWT; existing owner/role checks still apply.
   WHEN coalesce(auth.jwt(), '{}'::jsonb) = '{}'::jsonb THEN true
   WHEN auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN true
   ELSE EXISTS (SELECT 1 FROM auth.sessions s
     WHERE s.id::text = auth.jwt()->>'session_id' AND s.user_id = auth.uid()
       AND (s.not_after IS NULL OR s.not_after > now()))
 END
$$;
REVOKE ALL ON FUNCTION public.sp_passport_session_active() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sp_passport_session_active() TO authenticated;

CREATE FUNCTION public.sp_passport_session_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _row jsonb := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
 -- The shared claim spine also carries CV records. Their behaviour is unchanged.
 IF TG_TABLE_NAME = 'sp_claims' AND NOT public.sp_is_passport_credential(_row->>'claim_type',_row->>'credential_code') THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sp_passport_session_write_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE POLICY sp_credential_session_read ON public.sp_claims AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT public.sp_is_passport_credential(claim_type,credential_code) OR public.sp_passport_session_active())
 WITH CHECK (NOT public.sp_is_passport_credential(claim_type,credential_code) OR public.sp_passport_session_active());
CREATE TRIGGER sp_credential_session_write BEFORE INSERT OR UPDATE OR DELETE ON public.sp_claims
 FOR EACH ROW EXECUTE FUNCTION public.sp_passport_session_write_guard();

DO $$ DECLARE _table text; BEGIN
 FOREACH _table IN ARRAY ARRAY['sp_passport_profiles','sp_credential_details','sp_evidence','sp_verification_requests','sp_verification_decisions','sp_disclosures','sp_disclosure_items'] LOOP
   EXECUTE format('CREATE POLICY sp_private_session_read ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.sp_passport_session_active()) WITH CHECK (public.sp_passport_session_active())',_table);
   EXECUTE format('CREATE TRIGGER sp_private_session_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sp_passport_session_write_guard()',_table);
 END LOOP;
END $$;
CREATE POLICY sp_evidence_session_read ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id <> 'passport-evidence' OR public.sp_passport_session_active())
 WITH CHECK (bucket_id <> 'passport-evidence' OR public.sp_passport_session_active());

-- One transaction for the legacy claim/version spine and its international
-- metadata. Input is a command, not a JSON document used as domain storage.
CREATE FUNCTION public.sp_save_international_credential(_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid; _old public.sp_claims%ROWTYPE; _class text; _type text;
 _valid_country text; _valid_subdivision text; _country text; _issued date; _expiry date; _no_expiry boolean; _title text; _issuer text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_input) IS DISTINCT FROM 'object' OR EXISTS (
 SELECT 1 FROM jsonb_object_keys(_input) k WHERE k <> ALL(ARRAY['claim_id','version','class','title','issuer','country','issuing_jurisdiction','validity_jurisdiction','language','identifier','issued_on','valid_until','no_expiry']))
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 _class:=_input->>'class'; _title:=btrim(_input->>'title'); _issuer:=btrim(_input->>'issuer');
 IF NOT EXISTS(SELECT 1 FROM public.sp_credential_classes WHERE code=_class)
 OR coalesce(length(_title),0) NOT BETWEEN 1 AND 240 OR coalesce(length(_issuer),0) NOT BETWEEN 1 AND 240
 OR length(coalesce(_input->>'identifier',''))>120
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 _type:=CASE WHEN _class IN ('professional_licence','regulated_authorisation','permit') THEN 'licence' ELSE 'certification' END;
 _country:=nullif(_input->>'country',''); _issued:=nullif(_input->>'issued_on','')::date;
 _expiry:=nullif(_input->>'valid_until','')::date; _no_expiry:=(_input->>'no_expiry')::boolean;
 IF _no_expiry IS TRUE AND _expiry IS NOT NULL THEN RAISE EXCEPTION 'SP_EXPIRY_CONFLICT'; END IF;
 IF _issued IS NOT NULL AND _expiry IS NOT NULL AND _expiry<=_issued THEN RAISE EXCEPTION 'SP_INVALID_DATES'; END IF;
 SELECT country_code,subdivision_code INTO _valid_country,_valid_subdivision FROM public.sp_credential_jurisdictions WHERE code=nullif(_input->>'validity_jurisdiction','');
 IF NOT EXISTS(SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id=auth.uid()) THEN RAISE EXCEPTION 'SP_NO_PASSPORT'; END IF;
 IF nullif(_input->>'claim_id','') IS NOT NULL THEN
   SELECT * INTO _old FROM public.sp_claims WHERE id=(_input->>'claim_id')::uuid AND holder_user_id=auth.uid() FOR UPDATE;
   IF NOT FOUND OR _old.credential_code IS NOT NULL OR _old.claim_type NOT IN ('certification','licence') THEN RAISE EXCEPTION 'SP_NOT_EDITABLE'; END IF;
   IF _old.version_no IS DISTINCT FROM (_input->>'version')::integer THEN RAISE EXCEPTION 'SP_STALE_VERSION'; END IF;
   IF _old.claim_type<>_type THEN RAISE EXCEPTION 'SP_CLASS_CHANGE_REQUIRES_NEW_CREDENTIAL'; END IF;
   _id:=public.sp_correct_claim(_old.id,_title,_issuer,_valid_country,_issued,_issued,_expiry,
      'Holder corrected international credential',NULL,nullif(_input->>'identifier',''),NULL,NULL,NULL,_valid_subdivision,NULL);
   -- The existing correction path preserves a verification for non-material
   -- edits. Additional international metadata must never inherit it silently.
   IF EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_id AND assertion_level<>'self_declared')
   THEN RAISE EXCEPTION 'SP_METADATA_REVIEW_REQUIRED'; END IF;
 ELSE
   INSERT INTO public.sp_claims(holder_user_id,claim_type,title,claimed_issuer_name,jurisdiction_code,
     issued_on,valid_from,valid_until,credential_reference,sub_jurisdiction_code)
   VALUES(auth.uid(),_type,_title,_issuer,_valid_country,_issued,_issued,_expiry,nullif(_input->>'identifier',''),_valid_subdivision) RETURNING id INTO _id;
 END IF;
 INSERT INTO public.sp_credential_details(claim_id,credential_class,original_language,issuing_country_code,
   issuing_jurisdiction_code,validity_jurisdiction_code,no_expiry)
 VALUES(_id,_class,nullif(_input->>'language',''),_country,nullif(_input->>'issuing_jurisdiction',''),
   nullif(_input->>'validity_jurisdiction',''),_no_expiry);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sp_save_international_credential(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_save_international_credential(jsonb) TO authenticated;
COMMIT;
