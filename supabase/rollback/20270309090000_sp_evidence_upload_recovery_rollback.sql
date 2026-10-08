-- Application rollback may safely leave this additive journal/fence installed.
-- Do not destroy pending recovery or account-erasure intentions on schema rollback.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.sp_evidence_upload_attempts) THEN
  RAISE EXCEPTION 'SP_UPLOAD_ROLLBACK_REQUIRES_EMPTY_JOURNAL';
 END IF;
END $$;
DROP POLICY sp_evidence_upload_insert_fence ON storage.objects;
DROP POLICY sp_evidence_upload_update_fence ON storage.objects;
DROP TRIGGER sp_evidence_upload_attachment_guard ON public.sp_evidence;
DROP FUNCTION public.sp_evidence_upload_attachment_guard();
DROP FUNCTION public.sp_evidence_upload_storage_writable(text);
DROP FUNCTION public.sp_begin_evidence_upload(uuid,uuid,uuid,text,text,integer,text);
DROP FUNCTION public.sp_list_my_evidence_upload_attempts(uuid,uuid);
DROP FUNCTION public.sp_authorize_evidence_upload_cleanup(uuid);
DROP FUNCTION public.sp_confirm_evidence_upload_cleanup(uuid);
DROP FUNCTION public.sp_reconcile_evidence_upload(uuid);
DROP FUNCTION public.sp_evidence_upload_payload(public.sp_evidence_upload_attempts);
DROP TABLE public.sp_evidence_upload_attempts;
DROP FUNCTION public.sp_evidence_upload_intent_immutable();
DROP FUNCTION public.sp_evidence_upload_erasure_manifest();
NOTIFY pgrst,'reload schema';
COMMIT;
