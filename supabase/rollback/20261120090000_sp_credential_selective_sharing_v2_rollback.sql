BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.sp_credential_disclosure_policy) THEN
 RAISE EXCEPTION 'SP_V2_ROLLBACK_REFUSED: adopted shares require a forward migration'; END IF;
END $$;
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
DROP TRIGGER sp_credential_share_audit ON public.sp_disclosures;
DROP TRIGGER sp_shared_claim_audit ON public.sp_claims;
DROP TRIGGER sp_shared_metadata_audit ON public.sp_credential_details;
DROP FUNCTION public.sp_audit_credential_share();
DROP FUNCTION public.sp_create_credential_disclosure_v2(uuid[],text[],integer,text,text,text,uuid);
DROP FUNCTION public.sp_preview_credential_disclosure_v2(uuid[],text[],integer,text,text);
DROP FUNCTION public.sp_replace_selected_disclosure(uuid,boolean,uuid);
ALTER FUNCTION public.sp_replace_selected_disclosure_v1(uuid,boolean,uuid) RENAME TO sp_replace_selected_disclosure;
GRANT EXECUTE ON FUNCTION public.sp_replace_selected_disclosure(uuid,boolean,uuid) TO authenticated;
DROP FUNCTION public.sp_disclosure_payload(uuid);
ALTER FUNCTION public.sp_disclosure_payload_v1(uuid) RENAME TO sp_disclosure_payload;
DROP FUNCTION public.sp_credential_payload_v2(uuid,uuid[],text[],text,text,timestamptz,timestamptz);
DROP FUNCTION public.sp_assert_credential_selection(uuid[],text[]);
DROP TABLE public.sp_credential_share_events;
DROP TABLE public.sp_credential_disclosure_policy;
COMMIT;
