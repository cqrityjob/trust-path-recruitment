-- Rollback of 20270126090000_sp_evidence_change_under_review.
--
-- Restores sp_attach_evidence to the hosted 20270114090000 body: attaching a
-- document no longer moves an open request's review epoch. No row changes.

CREATE OR REPLACE FUNCTION public.sp_attach_evidence(_claim_id uuid, _period_id uuid, _storage_path text, _file_name text, _mime_type text, _size_bytes integer, _sha256 text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _holder uuid; _id uuid;
BEGIN
  -- 20270114090000: exactly one target. With both named, only the claim's
  -- holder was checked and the period was used as passed -- another
  -- holder's period.
  IF (_claim_id IS NULL) = (_period_id IS NULL) THEN
    RAISE EXCEPTION 'SP_TARGET_AMBIGUOUS: name exactly one of claim or period' USING ERRCODE = 'check_violation';
  END IF;

  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder <> auth.uid() THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;

  -- The path's first segment is the owner, matching the Storage policy. A
  -- mismatch here would mean a row pointing at somebody else's object.
  IF split_part(_storage_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'SP_EVIDENCE_PATH_NOT_OWNED' USING ERRCODE='insufficient_privilege';
  END IF;

  INSERT INTO public.sp_evidence (
    holder_user_id, claim_id, period_id, storage_path, file_name, mime_type, size_bytes, sha256)
  VALUES (_holder, _claim_id, _period_id, _storage_path, _file_name, _mime_type, _size_bytes, _sha256)
  RETURNING id INTO _id;

  PERFORM set_config('sp.evidence_context', 'on', true);
  IF _claim_id IS NOT NULL THEN
    UPDATE public.sp_claims SET assertion_level = 'document_provided'
     WHERE id = _claim_id AND assertion_level = 'self_declared';
  ELSE
    UPDATE public.sp_experience_periods SET assertion_level = 'document_provided'
     WHERE id = _period_id AND assertion_level = 'self_declared';
  END IF;
  PERFORM set_config('sp.evidence_context', 'off', true);

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_holder, auth.uid(), 'claim_corrected',
          CASE WHEN _claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_claim_id, _period_id),
          jsonb_build_object('evidence_id', _id, 'assertion_level', 'document_provided'));
  RETURN _id;
END; $function$
;

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc
          WHERE oid = 'public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text)'::regprocedure))
     <> '37e34877d69efb7e6a057c288df5c625' THEN
    RAISE EXCEPTION 'SP_EVIDENCE_UNDER_REVIEW_ROLLBACK: sp_attach_evidence is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'SP_EVIDENCE_UNDER_REVIEW_ROLLBACK ok: hosted sp_attach_evidence restored';
END $$;
