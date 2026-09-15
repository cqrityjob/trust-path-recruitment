BEGIN;
-- One transaction for the legacy claim/version spine and its international
-- metadata. Input is a command, not a JSON document used as domain storage.
CREATE FUNCTION public.sp_save_international_credential(_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid; _old public.sp_claims%ROWTYPE; _class text; _type text;
 _valid_country text; _valid_subdivision text; _country text; _issued date; _expiry date; _no_expiry boolean; _title text; _issuer text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
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
