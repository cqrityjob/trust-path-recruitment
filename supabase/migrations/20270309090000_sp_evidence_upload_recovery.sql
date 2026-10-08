-- Created with `supabase migration new sp_evidence_upload_recovery` as
-- 20261008082331; only the filename was moved to the approved next canonical slot.
-- Private holder-owned upload intentions survive response loss and reload.
-- No worker, cron, mail, AI, public read, privileged Storage adapter or backfill.
-- Legacy evidence/paths without a journal retain their existing contract.
BEGIN;

CREATE TABLE public.sp_evidence_upload_attempts (
  id uuid PRIMARY KEY,
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Keep original target IDs even if an entry disappears: its orphan must
  -- remain discoverable and explicitly removable by the holder.
  claim_id uuid,
  period_id uuid,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 300),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/heic')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','registered','cleanup_pending','cleaned')),
  evidence_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((claim_id IS NULL) <> (period_id IS NULL)),
  CHECK (storage_path = holder_user_id::text || '/' || id::text || '.' ||
    CASE mime_type WHEN 'application/pdf' THEN 'pdf' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'heic' END)
);
CREATE INDEX sp_evidence_upload_holder_idx ON public.sp_evidence_upload_attempts(holder_user_id,updated_at DESC,id);
ALTER TABLE public.sp_evidence_upload_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_evidence_upload_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sp_evidence_upload_attempts TO authenticated;
CREATE POLICY sp_evidence_upload_own_read ON public.sp_evidence_upload_attempts FOR SELECT TO authenticated
  USING (holder_user_id = (SELECT auth.uid()) AND public.sp_passport_session_active());

CREATE FUNCTION public.sp_evidence_upload_payload(_attempt public.sp_evidence_upload_attempts)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('id',_attempt.id,'claimId',_attempt.claim_id,'periodId',_attempt.period_id,
  'storagePath',_attempt.storage_path,'fileName',_attempt.file_name,'mimeType',_attempt.mime_type,
  'sizeBytes',_attempt.size_bytes,'sha256',_attempt.sha256,'status',_attempt.status,
  'revision',_attempt.revision,'createdAt',_attempt.created_at,'updatedAt',_attempt.updated_at,
  'evidence', (SELECT jsonb_build_object('id',e.id,'claimId',e.claim_id,'periodId',e.period_id,
    'fileName',e.file_name,'mimeType',e.mime_type,'sizeBytes',e.size_bytes,
    'uploadedAt',e.uploaded_at,'lifecycleState',e.lifecycle_state)
    FROM public.sp_evidence e WHERE e.id=_attempt.evidence_id AND e.holder_user_id=_attempt.holder_user_id
      AND e.storage_path=_attempt.storage_path))
$$;
REVOKE ALL ON FUNCTION public.sp_evidence_upload_payload(public.sp_evidence_upload_attempts) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sp_begin_evidence_upload(_attempt_id uuid,_claim_id uuid,_period_id uuid,
  _file_name text,_mime_type text,_size_bytes integer,_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _holder uuid:=auth.uid(); _owner uuid; _path text; _row public.sp_evidence_upload_attempts;
BEGIN
 IF _holder IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.sp_passport_session_active()
 THEN RAISE EXCEPTION 'SP_UPLOAD_NOT_AUTHENTICATED' USING ERRCODE='42501'; END IF;
 IF _attempt_id IS NULL OR (_claim_id IS NULL)=(_period_id IS NULL)
 THEN RAISE EXCEPTION 'SP_TARGET_AMBIGUOUS' USING ERRCODE='23514'; END IF;
 IF _mime_type IS NULL OR _mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/heic')
 OR _size_bytes IS NULL OR _size_bytes NOT BETWEEN 1 AND 8388608
 OR _sha256 IS NULL OR _sha256 !~ '^[0-9a-f]{64}$'
 OR _file_name IS NULL OR length(_file_name) NOT BETWEEN 1 AND 300
 THEN RAISE EXCEPTION 'SP_UPLOAD_INVALID_INPUT' USING ERRCODE='23514'; END IF;
 _path:=_holder::text||'/'||_attempt_id::text||'.'||CASE _mime_type WHEN 'application/pdf' THEN 'pdf' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'heic' END;
 SELECT * INTO _row FROM public.sp_evidence_upload_attempts WHERE id=_attempt_id FOR UPDATE;
 IF NOT FOUND THEN
   IF _claim_id IS NOT NULL THEN SELECT holder_user_id INTO _owner FROM public.sp_claims WHERE id=_claim_id;
   ELSE SELECT holder_user_id INTO _owner FROM public.sp_experience_periods WHERE id=_period_id; END IF;
   IF _owner IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF _owner<>_holder THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='42501'; END IF;
   INSERT INTO public.sp_evidence_upload_attempts(id,holder_user_id,claim_id,period_id,storage_path,file_name,mime_type,size_bytes,sha256)
   VALUES(_attempt_id,_holder,_claim_id,_period_id,_path,_file_name,_mime_type,_size_bytes,_sha256)
   ON CONFLICT (id) DO NOTHING;
   SELECT * INTO _row FROM public.sp_evidence_upload_attempts WHERE id=_attempt_id FOR UPDATE;
 END IF;
 IF _row.holder_user_id IS DISTINCT FROM _holder THEN RAISE EXCEPTION 'SP_UPLOAD_ATTEMPT_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF (_row.claim_id,_row.period_id,_row.file_name,_row.mime_type,_row.size_bytes,_row.sha256)
    IS DISTINCT FROM (_claim_id,_period_id,_file_name,_mime_type,_size_bytes,_sha256)
 THEN RAISE EXCEPTION 'SP_UPLOAD_INTENT_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN public.sp_evidence_upload_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.sp_begin_evidence_upload(uuid,uuid,uuid,text,text,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_begin_evidence_upload(uuid,uuid,uuid,text,text,integer,text) TO authenticated;

CREATE FUNCTION public.sp_reconcile_evidence_upload(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _row public.sp_evidence_upload_attempts; _evidence public.sp_evidence;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.sp_passport_session_active()
 THEN RAISE EXCEPTION 'SP_UPLOAD_NOT_AUTHENTICATED' USING ERRCODE='42501'; END IF;
 SELECT * INTO _row FROM public.sp_evidence_upload_attempts WHERE id=_attempt_id AND holder_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_UPLOAD_ATTEMPT_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO _evidence FROM public.sp_evidence WHERE storage_path=_row.storage_path;
 IF FOUND THEN
   IF _evidence.holder_user_id<>_row.holder_user_id OR (_evidence.claim_id,_evidence.period_id,_evidence.sha256,_evidence.size_bytes,_evidence.mime_type,_evidence.file_name)
     IS DISTINCT FROM (_row.claim_id,_row.period_id,_row.sha256,_row.size_bytes,_row.mime_type,_row.file_name)
   THEN RAISE EXCEPTION 'SP_UPLOAD_BOUND_METADATA_MISMATCH' USING ERRCODE='23514'; END IF;
   IF _row.status<>'registered' OR _row.evidence_id IS DISTINCT FROM _evidence.id THEN
     UPDATE public.sp_evidence_upload_attempts SET status='registered',evidence_id=_evidence.id,revision=revision+1,updated_at=clock_timestamp()
      WHERE id=_row.id RETURNING * INTO _row;
   END IF;
 END IF;
 RETURN public.sp_evidence_upload_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.sp_reconcile_evidence_upload(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_reconcile_evidence_upload(uuid) TO authenticated;

CREATE FUNCTION public.sp_list_my_evidence_upload_attempts(_claim_id uuid,_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.sp_passport_session_active()
 THEN RAISE EXCEPTION 'SP_UPLOAD_NOT_AUTHENTICATED' USING ERRCODE='42501'; END IF;
 IF _claim_id IS NOT NULL AND _period_id IS NOT NULL THEN RAISE EXCEPTION 'SP_TARGET_AMBIGUOUS' USING ERRCODE='23514'; END IF;
 RETURN coalesce((SELECT jsonb_agg(public.sp_evidence_upload_payload(a) ORDER BY a.updated_at DESC,a.id)
  FROM public.sp_evidence_upload_attempts a WHERE a.holder_user_id=auth.uid()
    AND (a.status IN ('prepared','cleanup_pending') OR
      (a.status='registered' AND NOT EXISTS(SELECT 1 FROM public.sp_evidence e WHERE e.storage_path=a.storage_path)))
    AND (_claim_id IS NULL OR a.claim_id=_claim_id) AND (_period_id IS NULL OR a.period_id=_period_id)), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.sp_list_my_evidence_upload_attempts(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_list_my_evidence_upload_attempts(uuid,uuid) TO authenticated;

CREATE FUNCTION public.sp_authorize_evidence_upload_cleanup(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _row public.sp_evidence_upload_attempts; _resolved jsonb;
BEGIN
 -- Reconcile takes the same row lock as every later attachment and Storage
 -- metadata write. A late commit wins before this fence or is refused after.
 _resolved:=public.sp_reconcile_evidence_upload(_attempt_id);
 SELECT * INTO _row FROM public.sp_evidence_upload_attempts WHERE id=_attempt_id AND holder_user_id=auth.uid() FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.sp_evidence WHERE storage_path=_row.storage_path)
 THEN RETURN _resolved; END IF;
 IF _row.status<>'cleaned' AND _row.status<>'cleanup_pending' THEN
   UPDATE public.sp_evidence_upload_attempts SET status='cleanup_pending',revision=revision+1,updated_at=clock_timestamp()
    WHERE id=_row.id RETURNING * INTO _row;
 END IF;
 RETURN public.sp_evidence_upload_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.sp_authorize_evidence_upload_cleanup(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_authorize_evidence_upload_cleanup(uuid) TO authenticated;

CREATE FUNCTION public.sp_confirm_evidence_upload_cleanup(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _row public.sp_evidence_upload_attempts;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.sp_passport_session_active()
 THEN RAISE EXCEPTION 'SP_UPLOAD_NOT_AUTHENTICATED' USING ERRCODE='42501'; END IF;
 SELECT * INTO _row FROM public.sp_evidence_upload_attempts WHERE id=_attempt_id AND holder_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_UPLOAD_ATTEMPT_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF _row.status NOT IN ('cleanup_pending','cleaned') OR EXISTS(SELECT 1 FROM public.sp_evidence WHERE storage_path=_row.storage_path)
 OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='passport-evidence' AND name=_row.storage_path)
 THEN RAISE EXCEPTION 'SP_UPLOAD_CLEANUP_UNCONFIRMED' USING ERRCODE='23514'; END IF;
 IF _row.status<>'cleaned' THEN
  UPDATE public.sp_evidence_upload_attempts SET status='cleaned',revision=revision+1,updated_at=clock_timestamp()
   WHERE id=_row.id RETURNING * INTO _row;
 END IF;
 RETURN public.sp_evidence_upload_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.sp_confirm_evidence_upload_cleanup(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_confirm_evidence_upload_cleanup(uuid) TO authenticated;

CREATE FUNCTION public.sp_evidence_upload_attachment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _row public.sp_evidence_upload_attempts;
BEGIN
 IF TG_OP='UPDATE' AND OLD.storage_path IS DISTINCT FROM NEW.storage_path AND EXISTS(
  SELECT 1 FROM public.sp_evidence_upload_attempts WHERE storage_path=OLD.storage_path)
 THEN RAISE EXCEPTION 'SP_UPLOAD_BOUND_METADATA_IMMUTABLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO _row FROM public.sp_evidence_upload_attempts WHERE storage_path=NEW.storage_path FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF; -- no backfill or change to legacy evidence
 IF _row.status IN ('cleanup_pending','cleaned') THEN RAISE EXCEPTION 'SP_UPLOAD_CLEANUP_FENCED' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='passport-evidence' AND name=_row.storage_path)
 THEN RAISE EXCEPTION 'SP_UPLOAD_OBJECT_NOT_FOUND' USING ERRCODE='23514'; END IF;
 IF (_row.holder_user_id,_row.claim_id,_row.period_id,_row.file_name,_row.mime_type,_row.size_bytes,_row.sha256)
 IS DISTINCT FROM (NEW.holder_user_id,NEW.claim_id,NEW.period_id,NEW.file_name,NEW.mime_type,NEW.size_bytes,NEW.sha256)
 THEN RAISE EXCEPTION 'SP_UPLOAD_BOUND_METADATA_MISMATCH' USING ERRCODE='23514'; END IF;
 UPDATE public.sp_evidence_upload_attempts SET status='registered',evidence_id=NEW.id,
  revision=CASE WHEN status='registered' AND evidence_id=NEW.id THEN revision ELSE revision+1 END,
  updated_at=CASE WHEN status='registered' AND evidence_id=NEW.id THEN updated_at ELSE clock_timestamp() END
  WHERE id=_row.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_evidence_upload_attachment_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sp_evidence_upload_attachment_guard BEFORE INSERT OR UPDATE ON public.sp_evidence
 FOR EACH ROW EXECUTE FUNCTION public.sp_evidence_upload_attachment_guard();

CREATE FUNCTION public.sp_evidence_upload_storage_writable(_path text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _status text;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.sp_passport_session_active()
 OR split_part(_path,'/',1) IS DISTINCT FROM auth.uid()::text THEN RETURN false; END IF;
 SELECT status INTO _status FROM public.sp_evidence_upload_attempts
  WHERE holder_user_id=auth.uid() AND storage_path=_path FOR UPDATE;
 RETURN NOT FOUND OR _status='prepared';
END $$;
REVOKE ALL ON FUNCTION public.sp_evidence_upload_storage_writable(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_evidence_upload_storage_writable(text) TO authenticated;
-- These only restrict existing holder policies. The row lock is retained
-- through Storage's metadata transaction, serialising it with the cleanup fence.
CREATE POLICY sp_evidence_upload_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'passport-evidence' OR public.sp_evidence_upload_storage_writable(name));
CREATE POLICY sp_evidence_upload_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'passport-evidence' OR public.sp_evidence_upload_storage_writable(name))
 WITH CHECK(bucket_id<>'passport-evidence' OR public.sp_evidence_upload_storage_writable(name));

CREATE FUNCTION public.sp_evidence_upload_intent_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF (OLD.id,OLD.holder_user_id,OLD.claim_id,OLD.period_id,OLD.storage_path,OLD.file_name,OLD.mime_type,OLD.size_bytes,OLD.sha256,OLD.created_at)
 IS DISTINCT FROM (NEW.id,NEW.holder_user_id,NEW.claim_id,NEW.period_id,NEW.storage_path,NEW.file_name,NEW.mime_type,NEW.size_bytes,NEW.sha256,NEW.created_at)
 THEN RAISE EXCEPTION 'SP_UPLOAD_INTENT_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('cleanup_pending','cleaned') AND NEW.status NOT IN ('cleanup_pending','cleaned')
 THEN RAISE EXCEPTION 'SP_UPLOAD_CLEANUP_FENCED' USING ERRCODE='23514'; END IF;
 IF OLD.status='cleaned' AND NEW.status<>'cleaned'
 THEN RAISE EXCEPTION 'SP_UPLOAD_CLEANUP_FENCED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_evidence_upload_intent_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sp_evidence_upload_intent_immutable BEFORE UPDATE ON public.sp_evidence_upload_attempts
 FOR EACH ROW EXECUTE FUNCTION public.sp_evidence_upload_intent_immutable();

CREATE FUNCTION public.sp_evidence_upload_erasure_manifest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 -- Capture the path before ON DELETE CASCADE removes its last journal.
 -- Reuse the existing erasure queue; do not enable or add any worker/cron.
 IF OLD.status<>'cleaned' AND NOT EXISTS(SELECT 1 FROM public.storage_erasure_queue
  WHERE bucket_id='passport-evidence' AND object_path=OLD.storage_path AND completed_at IS NULL) THEN
  INSERT INTO public.storage_erasure_queue(bucket_id,object_path,reason,subject_user_id,requested_by)
  VALUES('passport-evidence',OLD.storage_path,'account_permanently_deleted',OLD.holder_user_id,auth.uid());
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.sp_evidence_upload_erasure_manifest() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sp_evidence_upload_erasure_manifest BEFORE DELETE ON public.sp_evidence_upload_attempts
 FOR EACH ROW EXECUTE FUNCTION public.sp_evidence_upload_erasure_manifest();

COMMENT ON TABLE public.sp_evidence_upload_attempts IS 'Private immutable upload intentions; pending is not proof of missing bytes. Cleanup is explicitly fenced before holder Storage deletion. No legacy backfill.';
NOTIFY pgrst,'reload schema';
COMMIT;
