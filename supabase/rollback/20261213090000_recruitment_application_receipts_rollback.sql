-- Rollback of 20261213090000_recruitment_application_receipts.sql.
--
-- Refuses once a receipt has been written: a receipt is a message the
-- candidate has read, and this rollback would have to delete it to restore
-- the old kind constraint. Deleting candidate-facing history is a decision,
-- not a rollback. Before any receipt exists it stands the whole migration
-- down, in reverse order, and restores 20261207090000's settle for ordinary
-- messages exactly as it was.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.recruitment_messages WHERE kind = 'receipt') THEN
    RAISE EXCEPTION 'REC_RECEIPT_ROLLBACK_REFUSED: receipts exist; deleting candidate-facing history is not a rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recruitment_messages WHERE email_status = 'unknown') THEN
    RAISE EXCEPTION 'REC_RECEIPT_ROLLBACK_REFUSED: a message carries the unknown e-mail outcome';
  END IF;
END $$;

-- 20261207090000's definition, verbatim.
CREATE OR REPLACE FUNCTION public.rec_settle_message_send(
  _message_id uuid,
  _result text,
  _error text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _m public.recruitment_messages%ROWTYPE;
BEGIN
  IF _result NOT IN ('sent', 'failed', 'not_configured') THEN
    RAISE EXCEPTION 'MESSAGE_RESULT_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _m FROM public.recruitment_messages WHERE id = _message_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_is_member(_m.employer_id) OR NOT public.rec_can_manage(_m.job_id) THEN
    RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _m.email_status <> 'sending' THEN
    RETURN _m.email_status;
  END IF;
  UPDATE public.recruitment_messages
     SET email_status = _result,
         email_error = CASE WHEN _result = 'failed' THEN left(coalesce(_error, 'UNKNOWN'), 200) END,
         updated_at = now()
   WHERE id = _m.id;
  RETURN _result;
END; $$;
REVOKE ALL ON FUNCTION public.rec_settle_message_send(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_settle_message_send(uuid, text, text) TO authenticated;

DROP TRIGGER IF EXISTS job_applications_zz_receipt ON public.job_applications;
DROP FUNCTION IF EXISTS public.rec_create_application_receipt();
DROP FUNCTION IF EXISTS public.rec_receipts_needing_attention(uuid);
DROP FUNCTION IF EXISTS public.rec_claim_due_receipts(integer, uuid);
DROP FUNCTION IF EXISTS public.rec_settle_receipt_send(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rec_claim_receipt_send(uuid, uuid, boolean, boolean);
DROP FUNCTION IF EXISTS public.rec_receipt_take_attempt(uuid, uuid);
DROP FUNCTION IF EXISTS public.rec_receipt_provider_key(public.recruitment_messages);
DROP FUNCTION IF EXISTS public.rec_receipt_actor(public.job_applications, uuid);
DROP FUNCTION IF EXISTS public.rec_receipt_window_open(timestamptz);
DROP FUNCTION IF EXISTS public.rec_set_receipt_settings(uuid, boolean, text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.rec_render_receipt(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.rec_receipt_default(text, text);

DROP INDEX IF EXISTS public.recruitment_messages_receipt_due_idx;
DROP INDEX IF EXISTS public.recruitment_messages_email_attempt_idx;
DROP INDEX IF EXISTS public.recruitment_messages_receipt_once_idx;
ALTER TABLE public.recruitment_messages
  DROP COLUMN IF EXISTS email_attempt_id,
  DROP COLUMN IF EXISTS email_provider_id,
  DROP COLUMN IF EXISTS email_recipient,
  DROP COLUMN IF EXISTS email_key_generation,
  DROP COLUMN IF EXISTS email_key_first_used_at,
  DROP COLUMN IF EXISTS email_settled_at;
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
