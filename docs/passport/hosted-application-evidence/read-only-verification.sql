-- Read-only hosted verification. Always target wrygicdfxwjnrugduxnt explicitly.
-- Per-migration checks were executed immediately after their corresponding apply.

-- 20261118100000
SELECT 'tables_rls' AS check_name,count(*)=7 AND bool_and(relrowsecurity) AS passed FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sp_credential_classes','sp_credential_jurisdictions','sp_credential_definition_metadata','sp_credential_definition_jurisdictions','sp_credential_adapter_mappings','sp_credential_details','sp_evidence_extractions')
UNION ALL SELECT 'catalogue_read_only',count(*)=5 AND bool_and(has_table_privilege('authenticated',oid,'SELECT') AND NOT has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege('anon',oid,'SELECT')) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sp_credential_classes','sp_credential_jurisdictions','sp_credential_definition_metadata','sp_credential_definition_jurisdictions','sp_credential_adapter_mappings')
UNION ALL SELECT 'seed_counts',(SELECT count(*)=7 FROM public.sp_credential_classes) AND (SELECT count(*)=11 FROM public.sp_credential_jurisdictions)
UNION ALL SELECT 'no_holder_backfill',(SELECT count(*)=0 FROM public.sp_credential_details) AND (SELECT count(*)=0 FROM public.sp_evidence_extractions)
UNION ALL SELECT 'policies',count(*)=6 FROM pg_policies WHERE schemaname='public' AND tablename IN ('sp_credential_classes','sp_credential_jurisdictions','sp_credential_definition_metadata','sp_credential_definition_jurisdictions','sp_credential_adapter_mappings','sp_credential_details','sp_evidence_extractions')
UNION ALL SELECT 'triggers',count(*)=3 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('sp_guard_credential_details','sp_extractions_append_only','sp_guard_credential_expiry')
UNION ALL SELECT 'extraction_private',NOT has_table_privilege('authenticated','public.sp_evidence_extractions','SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege('service_role','public.sp_evidence_extractions','INSERT') AND NOT has_table_privilege('service_role','public.sp_evidence_extractions','UPDATE,DELETE');
SELECT e.name, count(p.oid)=1 AND bool_and(p.prosrc=e.body AND p.prosecdef=e.definer AND EXISTS(SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) AS matches_pinned_body_and_security FROM (VALUES ('sp_is_passport_credential','
 SELECT _type IN (''certification'',''licence'')
    OR (_code IS NOT NULL AND _type IN (''training'',''specialisation''));
',false),('sp_guard_credential_details','
DECLARE c public.sp_claims%ROWTYPE; j public.sp_credential_jurisdictions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.sp_claims WHERE id = NEW.claim_id FOR UPDATE;
 IF NOT FOUND OR NOT public.sp_is_passport_credential(c.claim_type,c.credential_code)
 THEN RAISE EXCEPTION ''SP_NOT_A_CREDENTIAL''; END IF;
 IF auth.uid() IS DISTINCT FROM c.holder_user_id THEN RAISE EXCEPTION ''SP_NOT_OWNER''; END IF;
 IF c.assertion_level <> ''self_declared'' OR c.lifecycle_state NOT IN (''draft'',''active'')
    OR EXISTS (SELECT 1 FROM public.sp_verification_requests WHERE claim_id=c.id)
 THEN RAISE EXCEPTION ''SP_CORRECTION_REQUIRED''; END IF;
 IF TG_OP=''UPDATE'' AND (NEW.claim_id<>OLD.claim_id OR NEW.created_at<>OLD.created_at)
 THEN RAISE EXCEPTION ''SP_DETAILS_IDENTITY_IMMUTABLE''; END IF;
 IF NEW.credential_class IN (''professional_licence'',''regulated_authorisation'',''permit'') AND c.claim_type <> ''licence''
 THEN RAISE EXCEPTION ''SP_CREDENTIAL_CLASS_CONFLICT''; END IF;
 IF NEW.no_expiry IS TRUE AND c.valid_until IS NOT NULL THEN RAISE EXCEPTION ''SP_EXPIRY_CONFLICT''; END IF;
 IF NEW.issuing_jurisdiction_code IS NOT NULL THEN
   SELECT * INTO j FROM public.sp_credential_jurisdictions WHERE code=NEW.issuing_jurisdiction_code;
   IF j.country_code IS NOT NULL AND j.country_code IS DISTINCT FROM NEW.issuing_country_code
   THEN RAISE EXCEPTION ''SP_ISSUING_COUNTRY_CONFLICT''; END IF;
 END IF;
 IF NEW.validity_jurisdiction_code IS NOT NULL THEN
   SELECT * INTO j FROM public.sp_credential_jurisdictions WHERE code=NEW.validity_jurisdiction_code;
   IF j.country_code IS DISTINCT FROM c.jurisdiction_code OR j.subdivision_code IS DISTINCT FROM c.sub_jurisdiction_code
   THEN RAISE EXCEPTION ''SP_VALIDITY_SCOPE_CONFLICT''; END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END ',true),('sp_extractions_append_only','
BEGIN RAISE EXCEPTION ''SP_EXTRACTION_APPEND_ONLY''; END ',false),('sp_guard_credential_expiry','
BEGIN
 IF NEW.valid_until IS NOT NULL AND EXISTS (SELECT 1 FROM public.sp_credential_details WHERE claim_id=NEW.id AND no_expiry IS TRUE)
 THEN RAISE EXCEPTION ''SP_EXPIRY_CONFLICT''; END IF;
 RETURN NEW;
END ',true)) e(name,body,definer) LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace GROUP BY e.name ORDER BY e.name;

-- 20261119090000
SELECT 'restrictive_policies' AS check_name,count(*)=9 AND bool_and(permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[] AND qual LIKE '%sp_passport_session_active%' AND with_check LIKE '%sp_passport_session_active%') AS passed FROM pg_policies WHERE policyname IN ('sp_credential_session_read','sp_private_session_read','sp_evidence_session_read')
UNION ALL SELECT 'session_triggers',count(*)=8 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('sp_credential_session_write','sp_private_session_write')
UNION ALL SELECT 'rpc_grants',has_function_privilege('authenticated','public.sp_save_international_credential(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.sp_save_international_credential(jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','public.sp_save_international_credential(jsonb)','EXECUTE')
UNION ALL SELECT 'internal_guard_private',NOT has_function_privilege('authenticated','public.sp_passport_session_write_guard()','EXECUTE') AND NOT has_function_privilege('anon','public.sp_passport_session_write_guard()','EXECUTE')
UNION ALL SELECT 'evidence_stays_private',NOT public FROM storage.buckets WHERE id='passport-evidence';
SELECT e.name, count(p.oid)=1 AND bool_and(p.prosrc=e.body AND p.prosecdef=e.definer AND EXISTS(SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) AS matches_pinned_body_and_security FROM (VALUES ('sp_passport_session_active','
 SELECT CASE
   -- SQL/admin operations carry no Auth JWT; existing owner/role checks still apply.
   WHEN coalesce(auth.jwt(), ''{}''::jsonb) = ''{}''::jsonb THEN true
   WHEN auth.jwt()->>''role'' IS DISTINCT FROM ''authenticated'' THEN true
   ELSE EXISTS (SELECT 1 FROM auth.sessions s
     WHERE s.id::text = auth.jwt()->>''session_id'' AND s.user_id = auth.uid()
       AND (s.not_after IS NULL OR s.not_after > now()))
 END
',true),('sp_passport_session_write_guard','
DECLARE _row jsonb := CASE WHEN TG_OP=''DELETE'' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
 -- The shared claim spine also carries CV records. Their behaviour is unchanged.
 IF TG_TABLE_NAME = ''sp_claims'' AND NOT public.sp_is_passport_credential(_row->>''claim_type'',_row->>''credential_code'') THEN
   IF TG_OP=''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION ''SP_SESSION_REVOKED'' USING ERRCODE=''42501''; END IF;
 IF TG_OP=''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END ',true),('sp_save_international_credential','
DECLARE _id uuid; _old public.sp_claims%ROWTYPE; _class text; _type text;
 _valid_country text; _valid_subdivision text; _country text; _issued date; _expiry date; _no_expiry boolean; _title text; _issuer text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION ''SP_NOT_AUTHENTICATED''; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION ''SP_SESSION_REVOKED'' USING ERRCODE=''42501''; END IF;
 IF jsonb_typeof(_input) IS DISTINCT FROM ''object'' OR EXISTS (
 SELECT 1 FROM jsonb_object_keys(_input) k WHERE k <> ALL(ARRAY[''claim_id'',''version'',''class'',''title'',''issuer'',''country'',''issuing_jurisdiction'',''validity_jurisdiction'',''language'',''identifier'',''issued_on'',''valid_until'',''no_expiry'']))
 THEN RAISE EXCEPTION ''SP_INVALID_CREDENTIAL_INPUT''; END IF;
 _class:=_input->>''class''; _title:=btrim(_input->>''title''); _issuer:=btrim(_input->>''issuer'');
 IF NOT EXISTS(SELECT 1 FROM public.sp_credential_classes WHERE code=_class)
 OR coalesce(length(_title),0) NOT BETWEEN 1 AND 240 OR coalesce(length(_issuer),0) NOT BETWEEN 1 AND 240
 OR length(coalesce(_input->>''identifier'',''''))>120
 THEN RAISE EXCEPTION ''SP_INVALID_CREDENTIAL_INPUT''; END IF;
 _type:=CASE WHEN _class IN (''professional_licence'',''regulated_authorisation'',''permit'') THEN ''licence'' ELSE ''certification'' END;
 _country:=nullif(_input->>''country'',''''); _issued:=nullif(_input->>''issued_on'','''')::date;
 _expiry:=nullif(_input->>''valid_until'','''')::date; _no_expiry:=(_input->>''no_expiry'')::boolean;
 IF _no_expiry IS TRUE AND _expiry IS NOT NULL THEN RAISE EXCEPTION ''SP_EXPIRY_CONFLICT''; END IF;
 IF _issued IS NOT NULL AND _expiry IS NOT NULL AND _expiry<=_issued THEN RAISE EXCEPTION ''SP_INVALID_DATES''; END IF;
 SELECT country_code,subdivision_code INTO _valid_country,_valid_subdivision FROM public.sp_credential_jurisdictions WHERE code=nullif(_input->>''validity_jurisdiction'','''');
 IF NOT EXISTS(SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id=auth.uid()) THEN RAISE EXCEPTION ''SP_NO_PASSPORT''; END IF;
 IF nullif(_input->>''claim_id'','''') IS NOT NULL THEN
   SELECT * INTO _old FROM public.sp_claims WHERE id=(_input->>''claim_id'')::uuid AND holder_user_id=auth.uid() FOR UPDATE;
   IF NOT FOUND OR _old.credential_code IS NOT NULL OR _old.claim_type NOT IN (''certification'',''licence'') THEN RAISE EXCEPTION ''SP_NOT_EDITABLE''; END IF;
   IF _old.version_no IS DISTINCT FROM (_input->>''version'')::integer THEN RAISE EXCEPTION ''SP_STALE_VERSION''; END IF;
   IF _old.claim_type<>_type THEN RAISE EXCEPTION ''SP_CLASS_CHANGE_REQUIRES_NEW_CREDENTIAL''; END IF;
   _id:=public.sp_correct_claim(_old.id,_title,_issuer,_valid_country,_issued,_issued,_expiry,
      ''Holder corrected international credential'',NULL,nullif(_input->>''identifier'',''''),NULL,NULL,NULL,_valid_subdivision,NULL);
   -- The existing correction path preserves a verification for non-material
   -- edits. Additional international metadata must never inherit it silently.
   IF EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_id AND assertion_level<>''self_declared'')
   THEN RAISE EXCEPTION ''SP_METADATA_REVIEW_REQUIRED''; END IF;
 ELSE
   INSERT INTO public.sp_claims(holder_user_id,claim_type,title,claimed_issuer_name,jurisdiction_code,
     issued_on,valid_from,valid_until,credential_reference,sub_jurisdiction_code)
   VALUES(auth.uid(),_type,_title,_issuer,_valid_country,_issued,_issued,_expiry,nullif(_input->>''identifier'',''''),_valid_subdivision) RETURNING id INTO _id;
 END IF;
 INSERT INTO public.sp_credential_details(claim_id,credential_class,original_language,issuing_country_code,
   issuing_jurisdiction_code,validity_jurisdiction_code,no_expiry)
 VALUES(_id,_class,nullif(_input->>''language'',''''),_country,nullif(_input->>''issuing_jurisdiction'',''''),
   nullif(_input->>''validity_jurisdiction'',''''),_no_expiry);
 RETURN _id;
END ',true)) e(name,body,definer) LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace GROUP BY e.name ORDER BY e.name;

-- 20261120090000
SELECT 'new_tables_private_rls' AS check_name,count(*)=2 AND bool_and(relrowsecurity AND has_table_privilege('authenticated',oid,'SELECT') AND NOT has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege('anon',oid,'SELECT')) AS passed FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sp_credential_disclosure_policy','sp_credential_share_events')
UNION ALL SELECT 'owner_policies',count(*)=2 AND bool_and(cmd='SELECT' AND qual LIKE '%holder_user_id%' AND qual LIKE '%auth.uid%') FROM pg_policies WHERE schemaname='public' AND tablename IN ('sp_credential_disclosure_policy','sp_credential_share_events')
UNION ALL SELECT 'new_tables_empty',(SELECT count(*)=0 FROM public.sp_credential_disclosure_policy) AND (SELECT count(*)=0 FROM public.sp_credential_share_events)
UNION ALL SELECT 'triggers',count(*)=5 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('sp_credential_policy_immutable','sp_credential_events_immutable','sp_credential_share_audit','sp_shared_claim_audit','sp_shared_metadata_audit')
UNION ALL SELECT 'v1_bodies_preserved',count(*)=2 AND bool_and(md5(p.prosrc)=e.hash AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) FROM (VALUES ('sp_disclosure_payload_v1','1eb33d7ded1429431849934db6f2fbf6'),('sp_replace_selected_disclosure_v1','d244c1aeb8c3a388fbda792158779ef2')) e(name,hash) JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace
UNION ALL SELECT 'internal_grants',count(*)=4 AND bool_and(NOT has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('service_role',oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sp_assert_credential_selection','sp_credential_payload_v2','sp_disclosure_payload','sp_audit_credential_share')
UNION ALL SELECT 'client_grants',count(*)=3 AND bool_and(has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('service_role',oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sp_preview_credential_disclosure_v2','sp_create_credential_disclosure_v2','sp_replace_selected_disclosure')
UNION ALL SELECT 'gateway_service_only',count(*)=1 AND bool_and(has_function_privilege('service_role',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='sp_get_disclosure_session';
SELECT e.name, count(p.oid)=1 AND bool_and(p.prosrc=e.body AND p.prosecdef=e.definer AND EXISTS(SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) AS matches_pinned_body_and_security FROM (VALUES ('sp_assert_credential_selection','
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION ''SP_NOT_AUTHENTICATED''; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION ''SP_SESSION_REVOKED'' USING ERRCODE=''42501''; END IF;
 IF coalesce(cardinality(_ids),0) NOT BETWEEN 1 AND 200 OR array_position(_ids,NULL) IS NOT NULL
 OR _fields IS NULL OR cardinality(_fields)>2 OR array_position(_fields,NULL) IS NOT NULL
 OR NOT _fields <@ ARRAY[''holder_name'',''identifier'']::text[] THEN RAISE EXCEPTION ''SP_INVALID_CREDENTIAL_SELECTION''; END IF;
 -- Row locks prevent correction/revocation changing selection during issuance.
 PERFORM 1 FROM public.sp_claims c WHERE c.id=ANY(_ids) ORDER BY c.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(_ids) AS selected(id) WHERE NOT EXISTS(
   SELECT 1 FROM public.sp_claims c WHERE c.id=selected.id AND c.holder_user_id=auth.uid()
    AND c.lifecycle_state=''active'' AND public.sp_is_passport_credential(c.claim_type,c.credential_code)))
 THEN RAISE EXCEPTION ''SP_CREDENTIAL_NOT_SHAREABLE''; END IF;
END ',true),('sp_credential_payload_v2','
DECLARE _p public.sp_passport_profiles%ROWTYPE; _name text;
BEGIN
 SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id=_holder;
 IF NOT FOUND THEN RETURN jsonb_build_object(''status'',''unavailable''); END IF;
 SELECT display_name INTO _name FROM public.profiles WHERE id=_holder;
 RETURN jsonb_build_object(''status'',''active'',''package'',''selected_merits'',''schema_version'',2,''focus'',''passport'',
 ''purpose'',_purpose,''locale'',_locale,''expires_at'',_expires,''authorised_at'',_created,
 ''holder'',CASE WHEN NOT ''holder_name''=ANY(_fields) OR _p.privacy_mode=''anonymous'' THEN NULL
   WHEN _p.privacy_mode=''initials'' THEN regexp_replace(coalesce(_name,''''),''(\S)\S*'',''\1.'',''g'') ELSE _name END,
 ''privacy_mode'',CASE WHEN ''holder_name''=ANY(_fields) THEN _p.privacy_mode ELSE ''anonymous'' END,
 ''profession_slug'',NULL,''jurisdiction'',NULL,''sub_jurisdiction'',NULL,
 ''verified_experience'',''[]''::jsonb,''verified_experience_days'',0,
 ''last_updated'',(SELECT max(updated_at) FROM public.sp_claims WHERE holder_user_id=_holder AND id=ANY(_ids)),
 ''verified_claims'',coalesce((SELECT jsonb_agg(jsonb_build_object(
   ''key'',''c''||c.ord,''type'',c.claim_type,''title'',c.title,''credential_code'',c.credential_code,
   ''issuer'',c.claimed_issuer_name,''jurisdiction'',c.jurisdiction_code,''sub_jurisdiction'',c.sub_jurisdiction_code,
   ''scope_limited'',nullif(btrim(c.authorisation_scope),'''') IS NOT NULL,''authorisation_scope'',NULL,
   ''issued_on'',c.issued_on,''valid_until'',c.valid_until,
   ''assertion'',CASE WHEN c.assertion_level=''verified'' AND (v.id IS NULL OR (v.valid_until IS NOT NULL AND v.valid_until<current_date))
      THEN ''document_provided'' ELSE c.assertion_level::text END,
   ''lifecycle'',CASE WHEN c.valid_until<current_date THEN ''expired'' ELSE c.lifecycle_state::text END,
   ''verified_at'',CASE WHEN v.id IS NOT NULL AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN c.verified_at END,
   ''verification_method'',CASE WHEN c.assertion_level=''verified'' AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN v.verification_method END,
   ''verifier_organisation'',CASE WHEN c.assertion_level=''verified'' AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN v.decider_organisation END,
   ''credential_identifier'',CASE WHEN ''identifier''=ANY(_fields) THEN c.credential_reference END,
   ''credential_class'',m.credential_class,''original_language'',m.original_language,
   ''issuing_country'',m.issuing_country_code,''issuing_jurisdiction'',m.issuing_jurisdiction_code,
   ''validity_jurisdiction'',m.validity_jurisdiction_code,''no_expiry'',m.no_expiry) ORDER BY c.ord)
 FROM (SELECT c.*,row_number() OVER(ORDER BY c.issued_on DESC NULLS LAST,c.id) ord FROM public.sp_claims c
   WHERE c.holder_user_id=_holder AND c.id=ANY(_ids) AND c.lifecycle_state=''active''
   AND public.sp_is_passport_credential(c.claim_type,c.credential_code)) c
 LEFT JOIN public.sp_credential_details m ON m.claim_id=c.id
 LEFT JOIN LATERAL (SELECT d.* FROM public.sp_verification_decisions d JOIN public.sp_verification_requests r ON r.id=d.request_id
    WHERE r.claim_id=c.id ORDER BY d.decided_at DESC,d.id DESC LIMIT 1) latest ON true
 LEFT JOIN public.sp_verification_decisions v ON v.id=latest.id AND v.decision=''approved''
 ),''[]''::jsonb));
END ',true),('sp_disclosure_payload','
DECLARE _d public.sp_disclosures%ROWTYPE; _f text[];
BEGIN
 SELECT permitted_fields INTO _f FROM public.sp_credential_disclosure_policy WHERE disclosure_id=_disclosure_id;
 IF NOT FOUND THEN RETURN public.sp_disclosure_payload_v1(_disclosure_id); END IF;
 SELECT * INTO _d FROM public.sp_disclosures WHERE id=_disclosure_id;
 IF NOT FOUND OR _d.revoked_at IS NOT NULL OR _d.expires_at IS NULL OR _d.expires_at<=now() THEN RETURN jsonb_build_object(''status'',''unavailable''); END IF;
 RETURN public.sp_credential_payload_v2(_d.holder_user_id,
  ARRAY(SELECT claim_id FROM public.sp_disclosure_items WHERE disclosure_id=_d.id AND claim_id IS NOT NULL),
  _f,_d.purpose,_d.locale,_d.expires_at,_d.created_at);
END ',true),('sp_preview_credential_disclosure_v2','
BEGIN
 PERFORM public.sp_assert_credential_selection(_claim_ids,_fields);
 PERFORM public.sp_assert_share_inputs(_expires_days,_locale,_purpose,NULL);
 RETURN public.sp_credential_payload_v2(auth.uid(),_claim_ids,_fields,_purpose,_locale,now()+make_interval(days=>_expires_days),now());
END ',true),('sp_create_credential_disclosure_v2','
DECLARE _r jsonb; _id uuid; _fields_sorted text[]; _old text[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION ''SP_NOT_AUTHENTICATED''; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION ''SP_SESSION_REVOKED'' USING ERRCODE=''42501''; END IF;
 IF _request_key IS NULL THEN RAISE EXCEPTION ''SP_REQUEST_KEY_REQUIRED''; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(''sp_share:''||auth.uid()::text||'':''||_request_key::text,0));
 PERFORM public.sp_assert_credential_selection(_claim_ids,_fields);
 SELECT array_agg(DISTINCT f ORDER BY f) INTO _fields_sorted FROM unnest(_fields) f;
 _fields_sorted:=coalesce(_fields_sorted,''{}''::text[]);
 SELECT d.id,p.permitted_fields INTO _id,_old FROM public.sp_disclosures d LEFT JOIN public.sp_credential_disclosure_policy p ON p.disclosure_id=d.id
 WHERE d.holder_user_id=auth.uid() AND d.request_key=_request_key;
 IF FOUND AND _old IS DISTINCT FROM _fields_sorted THEN RAISE EXCEPTION ''SP_REQUEST_KEY_CONFLICT''; END IF;
 _r:=public.sp_create_selected_disclosure(_claim_ids,''{}''::uuid[],_expires_days,_purpose,_recipient_hint,_locale,_request_key);
 IF _r->>''status''=''created'' THEN
   _id:=(_r->>''disclosure_id'')::uuid;
   INSERT INTO public.sp_credential_disclosure_policy(disclosure_id,permitted_fields) VALUES(_id,_fields_sorted);
   INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES(_id,''created'');
 END IF;
 RETURN _r;
END ',true),('sp_replace_selected_disclosure','
DECLARE _f text[]; _r jsonb; _ids uuid[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION ''SP_NOT_AUTHENTICATED''; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION ''SP_SESSION_REVOKED'' USING ERRCODE=''42501''; END IF;
 SELECT p.permitted_fields INTO _f FROM public.sp_credential_disclosure_policy p JOIN public.sp_disclosures d ON d.id=p.disclosure_id
 WHERE d.id=_disclosure_id AND d.holder_user_id=auth.uid();
 IF FOUND THEN
   SELECT array_agg(claim_id) INTO _ids FROM public.sp_disclosure_items WHERE disclosure_id=_disclosure_id;
   PERFORM public.sp_assert_credential_selection(_ids,_f);
 END IF;
 _r:=public.sp_replace_selected_disclosure_v1(_disclosure_id,_revoke_previous,_request_key);
 IF _f IS NOT NULL AND _r->>''status''=''created'' THEN
   INSERT INTO public.sp_credential_disclosure_policy(disclosure_id,permitted_fields) VALUES((_r->>''disclosure_id'')::uuid,_f);
   INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES((_r->>''disclosure_id'')::uuid,''created'');
 END IF;
 RETURN _r;
END ',true),('sp_audit_credential_share','
BEGIN
 IF TG_TABLE_NAME=''sp_disclosures'' THEN
   IF EXISTS(SELECT 1 FROM public.sp_credential_disclosure_policy WHERE disclosure_id=NEW.id) THEN
     IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at AND NEW.revoked_at IS NOT NULL THEN
       INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES(NEW.id,''revoked'');
     END IF;
     IF NEW.access_count>OLD.access_count THEN
       INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES(NEW.id,''access'');
     END IF;
   END IF;
 ELSE
   INSERT INTO public.sp_credential_share_events(disclosure_id,event_type)
   SELECT p.disclosure_id,''claim_changed'' FROM public.sp_credential_disclosure_policy p JOIN public.sp_disclosure_items i ON i.disclosure_id=p.disclosure_id
   WHERE i.claim_id=CASE WHEN TG_TABLE_NAME=''sp_credential_details'' THEN (to_jsonb(NEW)->>''claim_id'')::uuid ELSE (to_jsonb(NEW)->>''id'')::uuid END;
 END IF;
 RETURN NEW;
END ',true),('sp_get_disclosure_session','
DECLARE
  _session_id uuid;
  _disclosure_id uuid;
  _package_code text;
  _payload jsonb;
  _denied_id uuid;
  _package_expired boolean;
BEGIN
  IF coalesce(_session, '''') !~ ''^[0-9a-f]{64}$'' THEN
    RETURN jsonb_build_object(''status'', ''unavailable'');
  END IF;

  SELECT s.id, d.id, d.package_code
    INTO _session_id, _disclosure_id, _package_code
    FROM public.sp_share_sessions s
    JOIN public.sp_disclosures d ON d.id = s.disclosure_id
   WHERE s.session_hash = encode(digest(_session, ''sha256''), ''hex'')
     AND s.expires_at >= now()
     AND d.application_id IS NULL
     AND d.revoked_at IS NULL
     AND (d.expires_at IS NULL OR d.expires_at >= now())
   FOR UPDATE OF s;

  IF NOT FOUND THEN
    -- Only a known opaque session produces a minimal denied-access event.
    SELECT d.id,d.expires_at<=now() INTO _denied_id,_package_expired
      FROM public.sp_share_sessions s JOIN public.sp_disclosures d ON d.id=s.disclosure_id
      JOIN public.sp_credential_disclosure_policy p ON p.disclosure_id=d.id
     WHERE s.session_hash=encode(digest(_session,''sha256''),''hex'');
    IF FOUND THEN INSERT INTO public.sp_credential_share_events(disclosure_id,event_type)
      VALUES(_denied_id,CASE WHEN _package_expired THEN ''expiry_observed'' ELSE ''denied'' END); END IF;
    RETURN jsonb_build_object(''status'', ''unavailable'');
  END IF;

  UPDATE public.sp_share_sessions
     SET last_accessed_at = now()
   WHERE id = _session_id;
  UPDATE public.sp_disclosures
     SET access_count = access_count + 1
   WHERE id = _disclosure_id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id)
  VALUES (_disclosure_id);

  _payload := public.sp_disclosure_payload(_disclosure_id);
  IF _payload ->> ''status'' <> ''active'' THEN
    RETURN jsonb_build_object(''status'', ''unavailable'');
  END IF;

  IF _package_code = ''selected_merits'' THEN
    _payload := jsonb_set(_payload, ''{verified_claims}'', coalesce((
      SELECT jsonb_agg((row.value - ''id'')
                       || jsonb_build_object(''key'', coalesce(row.value ->> ''key'', ''c'' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> ''verified_claims'')
               WITH ORDINALITY AS row(value, ord)), ''[]''::jsonb));

    _payload := jsonb_set(_payload, ''{verified_experience}'', coalesce((
      SELECT jsonb_agg((row.value - ''id'')
                       || jsonb_build_object(''key'', coalesce(row.value ->> ''key'', ''e'' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> ''verified_experience'')
               WITH ORDINALITY AS row(value, ord)), ''[]''::jsonb));

    RETURN _payload || jsonb_build_object(''checked_at'', now());
  END IF;

  RETURN _payload;
END;
',true)) e(name,body,definer) LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace GROUP BY e.name ORDER BY e.name;

-- 20261121090000
SELECT 'catalogue_grants' AS check_name,count(*)=15 AND bool_and(NOT has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('anon',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS passed FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sp_credential_types','sp_authorities','sp_jurisdictions','sp_sub_jurisdictions','sp_market_packs','sp_credential_scopes','sp_certification_definitions','sp_certification_issuers','sp_certification_issuer_aliases','sp_certification_sources','sp_credential_classes','sp_credential_jurisdictions','sp_credential_definition_metadata','sp_credential_definition_jurisdictions','sp_credential_adapter_mappings')
UNION ALL SELECT 'view_security',count(*)=1 AND bool_and(reloptions @> ARRAY['security_invoker=true','security_barrier=true'] AND NOT has_table_privilege('anon',oid,'SELECT') AND has_table_privilege('authenticated',oid,'SELECT')) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='sp_approved_credential_catalogue'
UNION ALL SELECT 'default_no_expiry_false',count(*)=1 AND bool_and(column_default='false' AND is_nullable='NO') FROM information_schema.columns WHERE table_schema='public' AND table_name='sp_credential_types' AND column_name='allows_no_expiry'
UNION ALL SELECT 'claim_and_details_triggers',count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('sp_00_closed_catalogue','sp_00_closed_catalogue_details')
UNION ALL SELECT 'guards_private',count(*)=2 AND bool_and(NOT has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('service_role',oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sp_closed_catalogue_claim_guard','sp_closed_catalogue_details_guard')
UNION ALL SELECT 'approved_view_excludes_inactive_deprecated',NOT EXISTS (SELECT 1 FROM public.sp_approved_credential_catalogue a JOIN public.sp_credential_types t ON t.code=a.code LEFT JOIN public.sp_credential_definition_metadata m ON m.credential_code=a.code WHERE NOT t.is_active OR m.deprecated_at IS NOT NULL)
UNION ALL SELECT 'asis_existing_issuer',count(*)=3 AND bool_and(issuer_id='42f5ac4b-b7ab-4c8f-9687-ae1da5fa4999'::uuid) FROM public.sp_approved_credential_catalogue WHERE code IN ('INTL_ASIS_CPP','INTL_ASIS_PSP','INTL_ASIS_PCI');
SELECT e.name, count(p.oid)=1 AND bool_and(p.prosrc=e.body AND p.prosecdef=e.definer AND EXISTS(SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) AS matches_pinned_body_and_security FROM (VALUES ('sp_closed_catalogue_claim_guard','
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE;
BEGIN
 -- Historical claims can still be archived/reviewed. This exception cannot
 -- change any holder content, ownership, definition or governed metadata.
 IF TG_OP=''UPDATE'' AND NOT (OLD.lifecycle_state<>''active'' AND NEW.lifecycle_state=''active'') AND (to_jsonb(NEW)-ARRAY[''lifecycle_state'',''assertion_level'',''verified_by_user_id'',''verified_at'',''updated_at''])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY[''lifecycle_state'',''assertion_level'',''verified_by_user_id'',''verified_at'',''updated_at'']) THEN RETURN NEW; END IF;
 IF TG_OP=''UPDATE'' AND public.sp_is_passport_credential(OLD.claim_type,OLD.credential_code)
   AND (NEW.claim_type IS DISTINCT FROM OLD.claim_type OR NEW.credential_code IS DISTINCT FROM OLD.credential_code)
 THEN RAISE EXCEPTION ''SP_DEFINITION_IMMUTABLE'' USING ERRCODE=''23514''; END IF;
 -- Legacy correction RPCs insert a successor rather than UPDATE the old row.
 -- The successor must still describe the same holder and governed definition.
 IF NEW.supersedes_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.sp_claims previous WHERE previous.id=NEW.supersedes_id
   AND public.sp_is_passport_credential(previous.claim_type,previous.credential_code)
   AND (NEW.holder_user_id IS DISTINCT FROM previous.holder_user_id
     OR NEW.claim_type IS DISTINCT FROM previous.claim_type
     OR NEW.credential_code IS DISTINCT FROM previous.credential_code)
 ) THEN RAISE EXCEPTION ''SP_DEFINITION_IMMUTABLE'' USING ERRCODE=''23514''; END IF;
 IF NOT public.sp_is_passport_credential(NEW.claim_type,NEW.credential_code) THEN RETURN NEW; END IF;
 -- PostgreSQL accepts infinity as a date. It must not bypass governed no-expiry.
 IF NOT isfinite(NEW.issued_on) OR NOT isfinite(NEW.valid_from) OR NOT isfinite(NEW.valid_until)
 OR NEW.issued_on NOT BETWEEN DATE ''1900-01-01'' AND DATE ''2200-12-31''
 OR NEW.valid_from NOT BETWEEN DATE ''1900-01-01'' AND DATE ''2200-12-31''
 OR NEW.valid_until NOT BETWEEN DATE ''1900-01-01'' AND DATE ''2200-12-31''
 THEN RAISE EXCEPTION ''SP_INVALID_CREDENTIAL_DATE'' USING ERRCODE=''23514''; END IF;

 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=NEW.credential_code;
 IF NOT FOUND THEN RAISE EXCEPTION ''SP_APPROVED_DEFINITION_REQUIRED'' USING ERRCODE=''23514''; END IF;
 IF NEW.claim_type IS DISTINCT FROM d.claim_type OR NEW.title NOT IN (d.name_sv,d.name_en)
 OR NEW.claimed_issuer_name IS DISTINCT FROM d.issuer_name
 OR NEW.jurisdiction_code IS DISTINCT FROM d.country OR NEW.sub_jurisdiction_code IS DISTINCT FROM d.region
 OR NEW.authorisation_scope IS NOT NULL OR NEW.holder_note IS NOT NULL
 THEN RAISE EXCEPTION ''SP_GOVERNED_METADATA_IMMUTABLE'' USING ERRCODE=''23514''; END IF;
 RETURN NEW;
END ',true),('sp_closed_catalogue_details_guard','
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE;
BEGIN
 SELECT a.* INTO d FROM public.sp_approved_credential_catalogue a JOIN public.sp_claims c ON c.credential_code=a.code WHERE c.id=NEW.claim_id;
 IF NOT FOUND THEN RAISE EXCEPTION ''SP_APPROVED_DEFINITION_REQUIRED''; END IF;
 IF NEW.credential_class IS DISTINCT FROM d.credential_class
 OR NEW.original_language IS DISTINCT FROM d.original_language
 OR NEW.issuing_country_code IS DISTINCT FROM d.country
 OR NEW.issuing_jurisdiction_code IS DISTINCT FROM coalesce(d.region,d.country)
 OR NEW.validity_jurisdiction_code IS DISTINCT FROM coalesce(d.region,d.country)
 THEN RAISE EXCEPTION ''SP_GOVERNED_METADATA_IMMUTABLE''; END IF;
 IF NEW.no_expiry IS TRUE AND (NOT d.allows_no_expiry OR d.requires_valid_until)
 THEN RAISE EXCEPTION ''SP_NO_EXPIRY_NOT_APPROVED''; END IF;
 RETURN NEW;
END ',true),('sp_save_international_credential','
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _old public.sp_claims%ROWTYPE;
 _id uuid; _issued date; _expiry date; _no_expiry boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION ''SP_NOT_AUTHENTICATED''; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION ''SP_SESSION_REVOKED'' USING ERRCODE=''42501''; END IF;
 IF jsonb_typeof(_input) IS DISTINCT FROM ''object'' OR EXISTS (
 SELECT 1 FROM jsonb_object_keys(_input) k WHERE k<>ALL(ARRAY[''claim_id'',''version'',''definition_code'',''market_country'',''market_region'',''identifier'',''issued_on'',''valid_until'',''no_expiry'']))
 THEN RAISE EXCEPTION ''SP_INVALID_CREDENTIAL_INPUT''; END IF;
 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=_input->>''definition_code'';
 IF NOT FOUND THEN RAISE EXCEPTION ''SP_APPROVED_DEFINITION_REQUIRED''; END IF;
 IF nullif(_input->>''market_country'','''') IS DISTINCT FROM d.country
 OR nullif(_input->>''market_region'','''') IS DISTINCT FROM d.region
 THEN RAISE EXCEPTION ''SP_DEFINITION_NOT_AVAILABLE_IN_MARKET''; END IF;
 IF length(coalesce(_input->>''identifier'',''''))>120 THEN RAISE EXCEPTION ''SP_INVALID_CREDENTIAL_INPUT''; END IF;
 IF nullif(_input->>''issued_on'','''') !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$''
 OR nullif(_input->>''valid_until'','''') !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$''
 THEN RAISE EXCEPTION ''SP_INVALID_CREDENTIAL_DATE''; END IF;
 _issued:=nullif(_input->>''issued_on'','''')::date; _expiry:=nullif(_input->>''valid_until'','''')::date;
 _no_expiry:=(_input->>''no_expiry'')::boolean;
 IF _no_expiry IS TRUE AND (NOT d.allows_no_expiry OR d.requires_valid_until) THEN RAISE EXCEPTION ''SP_NO_EXPIRY_NOT_APPROVED''; END IF;
 IF _no_expiry IS TRUE AND _expiry IS NOT NULL THEN RAISE EXCEPTION ''SP_EXPIRY_CONFLICT''; END IF;
 IF _issued IS NOT NULL AND _expiry IS NOT NULL AND _expiry<=_issued THEN RAISE EXCEPTION ''SP_INVALID_DATES''; END IF;
 IF d.requires_valid_until AND _expiry IS NULL THEN RAISE EXCEPTION ''SP_CREDENTIAL_REQUIRES_VALID_UNTIL''; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id=auth.uid()) THEN RAISE EXCEPTION ''SP_NO_PASSPORT''; END IF;
 IF nullif(_input->>''claim_id'','''') IS NOT NULL THEN
 SELECT * INTO _old FROM public.sp_claims WHERE id=(_input->>''claim_id'')::uuid AND holder_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR _old.credential_code IS DISTINCT FROM d.code THEN RAISE EXCEPTION ''SP_NOT_EDITABLE''; END IF;
 IF _old.version_no IS DISTINCT FROM (_input->>''version'')::integer THEN RAISE EXCEPTION ''SP_STALE_VERSION''; END IF;
 _id:=public.sp_correct_claim(_old.id,d.name_en,d.issuer_name,d.country,_issued,_issued,_expiry,
 ''Holder corrected personal credential data'',d.code,nullif(_input->>''identifier'',''''),NULL,NULL,NULL,d.region,NULL);
 IF EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_id AND assertion_level<>''self_declared'') THEN RAISE EXCEPTION ''SP_METADATA_REVIEW_REQUIRED''; END IF;
 ELSE
 INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,
 issued_on,valid_from,valid_until,credential_reference)
 VALUES(auth.uid(),d.claim_type,d.code,d.name_en,d.issuer_name,d.country,d.region,_issued,_issued,_expiry,nullif(_input->>''identifier'','''')) RETURNING id INTO _id;
 END IF;
 INSERT INTO public.sp_credential_details(claim_id,credential_class,original_language,issuing_country_code,issuing_jurisdiction_code,validity_jurisdiction_code,no_expiry)
 VALUES(_id,d.credential_class,d.original_language,d.country,coalesce(d.region,d.country),coalesce(d.region,d.country),_no_expiry);
 RETURN _id;
END ',true)) e(name,body,definer) LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace GROUP BY e.name ORDER BY e.name;

-- 20261122090000
SELECT 'owner_wrapper_grants' AS check_name,has_function_privilege('authenticated','public.cv_owned_application_snapshot(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.cv_owned_application_snapshot(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.cv_owned_application_snapshot(uuid)','EXECUTE') AS passed
UNION ALL SELECT 'private_helpers_retained',count(*)=3 AND bool_and(NOT has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('cv_application_snapshot','cv_facts_unverified','cv_bundle_is_ready')
UNION ALL SELECT 'application_invoker',count(*)=1 AND bool_and(NOT prosecdef AND has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='sp_submit_application_with_cv_source'
UNION ALL SELECT 'application_rls_retained',relrowsecurity FROM pg_class WHERE oid='public.job_applications'::regclass;
SELECT e.name, count(p.oid)=1 AND bool_and(p.prosrc=e.body AND p.prosecdef=e.definer AND EXISTS(SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) AS matches_pinned_body_and_security FROM (VALUES ('cv_owned_application_snapshot','
DECLARE _cv public.cv_documents%ROWTYPE; _bundle jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION ''CV_NOT_AUTHENTICATED'' USING ERRCODE = ''42501'';
  END IF;
  SELECT * INTO _cv FROM public.cv_documents
    WHERE id = _document_id AND owner_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION ''CV_DOCUMENT_NOT_FOUND'' USING ERRCODE = ''P0002'';
  END IF;
  _bundle := coalesce(_cv.source_bundle, ''{}''::jsonb);
  IF NOT public.cv_bundle_is_ready(_bundle) THEN
    RAISE EXCEPTION ''CV_DOCUMENT_NOT_READY'' USING ERRCODE = ''23514'';
  END IF;
  IF public.cv_facts_unverified(_bundle) > 0 THEN
    RAISE EXCEPTION ''CV_DOCUMENT_STALE_FACTS'' USING ERRCODE = ''23514'';
  END IF;
  RETURN public.cv_application_snapshot(_cv, now());
END;
',true),('sp_submit_application_with_cv_source','
DECLARE
  _status    text;
  _shared    boolean := false;
  _eligible  boolean := false;
  _cv        public.cv_documents%ROWTYPE;
  _snapshot  jsonb   := NULL;
  _bundle    jsonb;
  _now       timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION ''SP_NOT_AUTHENTICATED'' USING ERRCODE = ''insufficient_privilege'';
  END IF;

  IF _cv_source NOT IN (''upload'', ''cqrityjob_cv'') THEN
    RAISE EXCEPTION ''CV_SOURCE_INVALID'' USING ERRCODE = ''check_violation'';
  END IF;

  IF _cv_source = ''cqrityjob_cv'' THEN
    IF _cv_document_id IS NULL THEN
      RAISE EXCEPTION ''CV_DOCUMENT_REQUIRED'' USING ERRCODE = ''check_violation'';
    END IF;

    -- The narrowly scoped definer reads only the authenticated holder''s CV.
    -- Application INSERT below remains invoker and retains every RLS check.
    _snapshot := public.cv_owned_application_snapshot(_cv_document_id);
  END IF;

  INSERT INTO public.job_applications (
    id, job_id, applicant_user_id, phone, cover_note,
    cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
    cv_source, cv_document_id, cv_document_snapshot,
    consent_given_at)
  VALUES (
    _application_id, _job_id, auth.uid(), _phone, _cover_note,
    CASE WHEN _cv_source = ''upload'' THEN _cv_storage_path END,
    CASE WHEN _cv_source = ''upload'' THEN _cv_original_filename END,
    CASE WHEN _cv_source = ''upload'' AND _cv_storage_path IS NOT NULL
         THEN ''application/pdf'' END,
    CASE WHEN _cv_source = ''upload'' THEN _cv_size_bytes END,
    _cv_source,
    CASE WHEN _cv_source = ''cqrityjob_cv'' THEN _cv_document_id END,
    _snapshot,
    _now)
  RETURNING status INTO _status;

  IF _include_passport THEN
    SELECT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                    WHERE holder_user_id = auth.uid())
       AND (EXISTS (SELECT 1 FROM public.sp_claims c
                     WHERE c.holder_user_id = auth.uid()
                       AND c.assertion_level = ''verified''
                       AND c.lifecycle_state = ''active'')
         OR EXISTS (SELECT 1 FROM public.sp_experience_periods e
                     WHERE e.holder_user_id = auth.uid()
                       AND e.assertion_level = ''verified''
                       AND e.lifecycle_state = ''active''))
      INTO _eligible;

    IF _eligible THEN
      PERFORM public.sp_share_passport_with_application(
        _application_id, ''employer_review'', 30, NULL, NULL);
      _shared := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    ''id'', _application_id,
    ''status'', _status,
    ''cv_source'', _cv_source,
    ''passport_requested'', _include_passport,
    ''passport_shared'', _shared,
    ''passport_eligible'', _eligible);
END; ',false)) e(name,body,definer) LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace GROUP BY e.name ORDER BY e.name;

-- Final corrected security probes
SELECT 'all_passport_tables_rls' AS check_name,bool_and(relrowsecurity) AS passed FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'sp_%'
UNION ALL SELECT 'private_passport_no_anon',bool_and(NOT has_table_privilege('anon',oid,'SELECT')) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sp_passport_profiles','sp_claims','sp_evidence','sp_disclosures','sp_disclosure_items','sp_credential_details','sp_evidence_extractions')
UNION ALL SELECT 'self_verification_refused',prosrc LIKE '%SP_SELF_VERIFICATION_FORBIDDEN%' AND prosrc LIKE '%_r.holder_user_id = auth.uid()%' FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='sp_verifier_decide'
UNION ALL SELECT 'verification_direct_writes_denied',NOT has_table_privilege('authenticated','public.sp_verification_decisions','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.sp_verification_decisions','INSERT,UPDATE,DELETE')
UNION ALL SELECT 'claim_insert_self_declared',EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sp_claims' AND cmd='INSERT' AND with_check LIKE '%self_declared%' AND with_check LIKE '%auth.uid%')
UNION ALL SELECT 'trust_trigger_attached',EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.sp_claims'::regclass AND p.proname='sp_guard_trust_fields_immutable' AND NOT t.tgisinternal)
UNION ALL SELECT 'credential_requires_governed_definition',prosrc LIKE '%SP_APPROVED_DEFINITION_REQUIRED%' AND prosrc LIKE '%SP_GOVERNED_METADATA_IMMUTABLE%' AND prosrc LIKE '%SP_DEFINITION_IMMUTABLE%' FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='sp_closed_catalogue_claim_guard'
UNION ALL SELECT 'inactive_and_deprecated_filter',pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass,true) LIKE '%t.is_active%' AND pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass,true) LIKE '%m.deprecated_at IS NULL%'
UNION ALL SELECT 'storage_private',NOT public FROM storage.buckets WHERE id='passport-evidence';

