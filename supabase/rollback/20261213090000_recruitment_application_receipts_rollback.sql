-- Rollback of 20261213090000_recruitment_application_receipts.sql.
--
-- Refuses once a receipt has been written: a receipt is a message the
-- candidate has read, and this rollback would have to delete it to restore
-- the old kind constraint. Deleting candidate-facing history is a decision,
-- not a rollback. Before any receipt exists it stands the whole migration
-- down, in reverse order.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.recruitment_messages WHERE kind = 'receipt') THEN
    RAISE EXCEPTION 'REC_RECEIPT_ROLLBACK_REFUSED: receipts exist; deleting candidate-facing history is not a rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recruitment_messages WHERE email_status = 'unknown') THEN
    RAISE EXCEPTION 'REC_RECEIPT_ROLLBACK_REFUSED: a message carries the unknown e-mail outcome';
  END IF;
END $$;

DROP TRIGGER IF EXISTS job_applications_zz_receipt ON public.job_applications;
DROP FUNCTION IF EXISTS public.rec_create_application_receipt();
DROP FUNCTION IF EXISTS public.rec_settle_receipt_send(uuid, text, text);
DROP FUNCTION IF EXISTS public.rec_claim_receipt_send(uuid, boolean);
DROP FUNCTION IF EXISTS public.rec_receipt_actor(public.job_applications);
DROP FUNCTION IF EXISTS public.rec_set_receipt_settings(uuid, boolean, text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.rec_render_receipt(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.rec_receipt_default(text, text);

DROP INDEX IF EXISTS public.recruitment_messages_receipt_once_idx;
ALTER TABLE public.recruitment_messages DROP CONSTRAINT IF EXISTS recruitment_messages_email_status_check;
ALTER TABLE public.recruitment_messages ADD CONSTRAINT recruitment_messages_email_status_check
  CHECK (email_status IN ('not_attempted', 'sending', 'sent', 'failed', 'not_configured'));
ALTER TABLE public.recruitment_messages DROP CONSTRAINT IF EXISTS recruitment_messages_kind_check;
ALTER TABLE public.recruitment_messages ADD CONSTRAINT recruitment_messages_kind_check
  CHECK (kind IN ('general', 'interview_invitation', 'rejection', 'offer', 'information'));

ALTER TABLE public.recruitment_settings DROP CONSTRAINT IF EXISTS recruitment_settings_receipt_text_shape;
ALTER TABLE public.recruitment_settings
  DROP COLUMN IF EXISTS receipt_enabled,
  DROP COLUMN IF EXISTS receipt_subject_sv,
  DROP COLUMN IF EXISTS receipt_body_sv,
  DROP COLUMN IF EXISTS receipt_subject_en,
  DROP COLUMN IF EXISTS receipt_body_en,
  DROP COLUMN IF EXISTS receipt_updated_at,
  DROP COLUMN IF EXISTS receipt_updated_by;
