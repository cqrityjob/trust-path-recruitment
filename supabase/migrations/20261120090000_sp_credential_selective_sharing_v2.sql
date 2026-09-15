-- Additive credential-only disclosure, retaining v1 payload and token gateway.
-- No personal data cleanup. Hosted application requires separate owner approval.
BEGIN;
CREATE TABLE public.sp_credential_disclosure_policy (
 disclosure_id uuid PRIMARY KEY REFERENCES public.sp_disclosures(id) ON DELETE RESTRICT,
 permitted_fields text[] NOT NULL DEFAULT '{}',
 schema_version integer NOT NULL DEFAULT 2 CHECK(schema_version=2),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (permitted_fields <@ ARRAY['holder_name','identifier']::text[] AND array_position(permitted_fields,NULL) IS NULL)
);
CREATE TABLE public.sp_credential_share_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 disclosure_id uuid NOT NULL REFERENCES public.sp_credential_disclosure_policy(disclosure_id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN ('created','access','revoked','expiry_observed','claim_changed','denied')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sp_credential_share_events_disclosure ON public.sp_credential_share_events(disclosure_id,occurred_at);
ALTER TABLE public.sp_credential_disclosure_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_credential_share_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_credential_disclosure_policy, public.sp_credential_share_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sp_credential_disclosure_policy, public.sp_credential_share_events TO authenticated;
CREATE POLICY owner_read ON public.sp_credential_disclosure_policy FOR SELECT TO authenticated USING
 (EXISTS(SELECT 1 FROM public.sp_disclosures d WHERE d.id=disclosure_id AND d.holder_user_id=(SELECT auth.uid())));
CREATE POLICY owner_read ON public.sp_credential_share_events FOR SELECT TO authenticated USING
 (EXISTS(SELECT 1 FROM public.sp_disclosures d WHERE d.id=disclosure_id AND d.holder_user_id=(SELECT auth.uid())));
CREATE TRIGGER sp_credential_policy_immutable BEFORE UPDATE OR DELETE ON public.sp_credential_disclosure_policy
 FOR EACH ROW EXECUTE FUNCTION public.sp_extractions_append_only();
CREATE TRIGGER sp_credential_events_immutable BEFORE UPDATE OR DELETE ON public.sp_credential_share_events
 FOR EACH ROW EXECUTE FUNCTION public.sp_extractions_append_only();

CREATE FUNCTION public.sp_assert_credential_selection(_ids uuid[],_fields text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 IF coalesce(cardinality(_ids),0) NOT BETWEEN 1 AND 200 OR array_position(_ids,NULL) IS NOT NULL
 OR _fields IS NULL OR cardinality(_fields)>2 OR array_position(_fields,NULL) IS NOT NULL
 OR NOT _fields <@ ARRAY['holder_name','identifier']::text[] THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_SELECTION'; END IF;
 -- Row locks prevent correction/revocation changing selection during issuance.
 PERFORM 1 FROM public.sp_claims c WHERE c.id=ANY(_ids) ORDER BY c.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(_ids) AS selected(id) WHERE NOT EXISTS(
   SELECT 1 FROM public.sp_claims c WHERE c.id=selected.id AND c.holder_user_id=auth.uid()
    AND c.lifecycle_state='active' AND public.sp_is_passport_credential(c.claim_type,c.credential_code)))
 THEN RAISE EXCEPTION 'SP_CREDENTIAL_NOT_SHAREABLE'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sp_assert_credential_selection(uuid[],text[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sp_credential_payload_v2(_holder uuid,_ids uuid[],_fields text[],_purpose text,_locale text,_expires timestamptz,_created timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE _p public.sp_passport_profiles%ROWTYPE; _name text;
BEGIN
 SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id=_holder;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 SELECT display_name INTO _name FROM public.profiles WHERE id=_holder;
 RETURN jsonb_build_object('status','active','package','selected_merits','schema_version',2,'focus','passport',
 'purpose',_purpose,'locale',_locale,'expires_at',_expires,'authorised_at',_created,
 'holder',CASE WHEN NOT 'holder_name'=ANY(_fields) OR _p.privacy_mode='anonymous' THEN NULL
   WHEN _p.privacy_mode='initials' THEN regexp_replace(coalesce(_name,''),'(\S)\S*','\1.','g') ELSE _name END,
 'privacy_mode',CASE WHEN 'holder_name'=ANY(_fields) THEN _p.privacy_mode ELSE 'anonymous' END,
 'profession_slug',NULL,'jurisdiction',NULL,'sub_jurisdiction',NULL,
 'verified_experience','[]'::jsonb,'verified_experience_days',0,
 'last_updated',(SELECT max(updated_at) FROM public.sp_claims WHERE holder_user_id=_holder AND id=ANY(_ids)),
 'verified_claims',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'key','c'||c.ord,'type',c.claim_type,'title',c.title,'credential_code',c.credential_code,
   'issuer',c.claimed_issuer_name,'jurisdiction',c.jurisdiction_code,'sub_jurisdiction',c.sub_jurisdiction_code,
   'scope_limited',nullif(btrim(c.authorisation_scope),'') IS NOT NULL,'authorisation_scope',NULL,
   'issued_on',c.issued_on,'valid_until',c.valid_until,
   'assertion',CASE WHEN c.assertion_level='verified' AND (v.id IS NULL OR (v.valid_until IS NOT NULL AND v.valid_until<current_date))
      THEN 'document_provided' ELSE c.assertion_level::text END,
   'lifecycle',CASE WHEN c.valid_until<current_date THEN 'expired' ELSE c.lifecycle_state::text END,
   'verified_at',CASE WHEN v.id IS NOT NULL AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN c.verified_at END,
   'verification_method',CASE WHEN c.assertion_level='verified' AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN v.verification_method END,
   'verifier_organisation',CASE WHEN c.assertion_level='verified' AND (v.valid_until IS NULL OR v.valid_until>=current_date) THEN v.decider_organisation END,
   'credential_identifier',CASE WHEN 'identifier'=ANY(_fields) THEN c.credential_reference END,
   'credential_class',m.credential_class,'original_language',m.original_language,
   'issuing_country',m.issuing_country_code,'issuing_jurisdiction',m.issuing_jurisdiction_code,
   'validity_jurisdiction',m.validity_jurisdiction_code,'no_expiry',m.no_expiry) ORDER BY c.ord)
 FROM (SELECT c.*,row_number() OVER(ORDER BY c.issued_on DESC NULLS LAST,c.id) ord FROM public.sp_claims c
   WHERE c.holder_user_id=_holder AND c.id=ANY(_ids) AND c.lifecycle_state='active'
   AND public.sp_is_passport_credential(c.claim_type,c.credential_code)) c
 LEFT JOIN public.sp_credential_details m ON m.claim_id=c.id
 LEFT JOIN LATERAL (SELECT d.* FROM public.sp_verification_decisions d JOIN public.sp_verification_requests r ON r.id=d.request_id
    WHERE r.claim_id=c.id ORDER BY d.decided_at DESC,d.id DESC LIMIT 1) latest ON true
 LEFT JOIN public.sp_verification_decisions v ON v.id=latest.id AND v.decision='approved'
 ),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.sp_credential_payload_v2(uuid,uuid[],text[],text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.sp_disclosure_payload(uuid) RENAME TO sp_disclosure_payload_v1;
REVOKE ALL ON FUNCTION public.sp_disclosure_payload_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.sp_disclosure_payload(_disclosure_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE _d public.sp_disclosures%ROWTYPE; _f text[];
BEGIN
 SELECT permitted_fields INTO _f FROM public.sp_credential_disclosure_policy WHERE disclosure_id=_disclosure_id;
 IF NOT FOUND THEN RETURN public.sp_disclosure_payload_v1(_disclosure_id); END IF;
 SELECT * INTO _d FROM public.sp_disclosures WHERE id=_disclosure_id;
 IF NOT FOUND OR _d.revoked_at IS NOT NULL OR _d.expires_at IS NULL OR _d.expires_at<=now() THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 RETURN public.sp_credential_payload_v2(_d.holder_user_id,
  ARRAY(SELECT claim_id FROM public.sp_disclosure_items WHERE disclosure_id=_d.id AND claim_id IS NOT NULL),
  _f,_d.purpose,_d.locale,_d.expires_at,_d.created_at);
END $$;
REVOKE ALL ON FUNCTION public.sp_disclosure_payload(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sp_preview_credential_disclosure_v2(_claim_ids uuid[],_fields text[],_expires_days integer,_purpose text,_locale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.sp_assert_credential_selection(_claim_ids,_fields);
 PERFORM public.sp_assert_share_inputs(_expires_days,_locale,_purpose,NULL);
 RETURN public.sp_credential_payload_v2(auth.uid(),_claim_ids,_fields,_purpose,_locale,now()+make_interval(days=>_expires_days),now());
END $$;
REVOKE ALL ON FUNCTION public.sp_preview_credential_disclosure_v2(uuid[],text[],integer,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_preview_credential_disclosure_v2(uuid[],text[],integer,text,text) TO authenticated;

CREATE FUNCTION public.sp_create_credential_disclosure_v2(_claim_ids uuid[],_fields text[],_expires_days integer,_purpose text,_recipient_hint text,_locale text,_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _r jsonb; _id uuid; _fields_sorted text[]; _old text[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 IF _request_key IS NULL THEN RAISE EXCEPTION 'SP_REQUEST_KEY_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sp_share:'||auth.uid()::text||':'||_request_key::text,0));
 PERFORM public.sp_assert_credential_selection(_claim_ids,_fields);
 SELECT array_agg(DISTINCT f ORDER BY f) INTO _fields_sorted FROM unnest(_fields) f;
 _fields_sorted:=coalesce(_fields_sorted,'{}'::text[]);
 SELECT d.id,p.permitted_fields INTO _id,_old FROM public.sp_disclosures d LEFT JOIN public.sp_credential_disclosure_policy p ON p.disclosure_id=d.id
 WHERE d.holder_user_id=auth.uid() AND d.request_key=_request_key;
 IF FOUND AND _old IS DISTINCT FROM _fields_sorted THEN RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT'; END IF;
 _r:=public.sp_create_selected_disclosure(_claim_ids,'{}'::uuid[],_expires_days,_purpose,_recipient_hint,_locale,_request_key);
 IF _r->>'status'='created' THEN
   _id:=(_r->>'disclosure_id')::uuid;
   INSERT INTO public.sp_credential_disclosure_policy(disclosure_id,permitted_fields) VALUES(_id,_fields_sorted);
   INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES(_id,'created');
 END IF;
 RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.sp_create_credential_disclosure_v2(uuid[],text[],integer,text,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_create_credential_disclosure_v2(uuid[],text[],integer,text,text,text,uuid) TO authenticated;

-- Reissuing through the existing v1 RPC must preserve v2 minimisation, even
-- when called directly rather than through the application wrapper.
ALTER FUNCTION public.sp_replace_selected_disclosure(uuid,boolean,uuid) RENAME TO sp_replace_selected_disclosure_v1;
REVOKE ALL ON FUNCTION public.sp_replace_selected_disclosure_v1(uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.sp_replace_selected_disclosure(_disclosure_id uuid,_revoke_previous boolean,_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _f text[]; _r jsonb; _ids uuid[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 SELECT p.permitted_fields INTO _f FROM public.sp_credential_disclosure_policy p JOIN public.sp_disclosures d ON d.id=p.disclosure_id
 WHERE d.id=_disclosure_id AND d.holder_user_id=auth.uid();
 IF FOUND THEN
   SELECT array_agg(claim_id) INTO _ids FROM public.sp_disclosure_items WHERE disclosure_id=_disclosure_id;
   PERFORM public.sp_assert_credential_selection(_ids,_f);
 END IF;
 _r:=public.sp_replace_selected_disclosure_v1(_disclosure_id,_revoke_previous,_request_key);
 IF _f IS NOT NULL AND _r->>'status'='created' THEN
   INSERT INTO public.sp_credential_disclosure_policy(disclosure_id,permitted_fields) VALUES((_r->>'disclosure_id')::uuid,_f);
   INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES((_r->>'disclosure_id')::uuid,'created');
 END IF;
 RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.sp_replace_selected_disclosure(uuid,boolean,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_replace_selected_disclosure(uuid,boolean,uuid) TO authenticated;

CREATE FUNCTION public.sp_audit_credential_share() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='sp_disclosures' THEN
   IF EXISTS(SELECT 1 FROM public.sp_credential_disclosure_policy WHERE disclosure_id=NEW.id) THEN
     IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at AND NEW.revoked_at IS NOT NULL THEN
       INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES(NEW.id,'revoked');
     END IF;
     IF NEW.access_count>OLD.access_count THEN
       INSERT INTO public.sp_credential_share_events(disclosure_id,event_type) VALUES(NEW.id,'access');
     END IF;
   END IF;
 ELSE
   INSERT INTO public.sp_credential_share_events(disclosure_id,event_type)
   SELECT p.disclosure_id,'claim_changed' FROM public.sp_credential_disclosure_policy p JOIN public.sp_disclosure_items i ON i.disclosure_id=p.disclosure_id
   WHERE i.claim_id=CASE WHEN TG_TABLE_NAME='sp_credential_details' THEN (to_jsonb(NEW)->>'claim_id')::uuid ELSE (to_jsonb(NEW)->>'id')::uuid END;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_audit_credential_share() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sp_credential_share_audit AFTER UPDATE ON public.sp_disclosures FOR EACH ROW EXECUTE FUNCTION public.sp_audit_credential_share();
CREATE TRIGGER sp_shared_claim_audit AFTER UPDATE ON public.sp_claims FOR EACH ROW EXECUTE FUNCTION public.sp_audit_credential_share();
CREATE TRIGGER sp_shared_metadata_audit AFTER UPDATE ON public.sp_credential_details FOR EACH ROW EXECUTE FUNCTION public.sp_audit_credential_share();
-- Existing gateway body with minimal known-session denial audit.
CREATE OR REPLACE FUNCTION public.sp_get_disclosure_session(_session text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  _session_id uuid;
  _disclosure_id uuid;
  _package_code text;
  _payload jsonb;
  _denied_id uuid;
  _package_expired boolean;
BEGIN
  IF coalesce(_session, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT s.id, d.id, d.package_code
    INTO _session_id, _disclosure_id, _package_code
    FROM public.sp_share_sessions s
    JOIN public.sp_disclosures d ON d.id = s.disclosure_id
   WHERE s.session_hash = encode(digest(_session, 'sha256'), 'hex')
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
     WHERE s.session_hash=encode(digest(_session,'sha256'),'hex');
    IF FOUND THEN INSERT INTO public.sp_credential_share_events(disclosure_id,event_type)
      VALUES(_denied_id,CASE WHEN _package_expired THEN 'expiry_observed' ELSE 'denied' END); END IF;
    RETURN jsonb_build_object('status', 'unavailable');
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
  IF _payload ->> 'status' <> 'active' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF _package_code = 'selected_merits' THEN
    _payload := jsonb_set(_payload, '{verified_claims}', coalesce((
      SELECT jsonb_agg((row.value - 'id')
                       || jsonb_build_object('key', coalesce(row.value ->> 'key', 'c' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> 'verified_claims')
               WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

    _payload := jsonb_set(_payload, '{verified_experience}', coalesce((
      SELECT jsonb_agg((row.value - 'id')
                       || jsonb_build_object('key', coalesce(row.value ->> 'key', 'e' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> 'verified_experience')
               WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

    RETURN _payload || jsonb_build_object('checked_at', now());
  END IF;

  RETURN _payload;
END;
$function$;
REVOKE ALL ON FUNCTION public.sp_get_disclosure_session(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure_session(text) TO service_role;
COMMIT;
