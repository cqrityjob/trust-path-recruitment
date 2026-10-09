-- Prefer an application rollback. This DDL rollback refuses to discard
-- recorded supplement requests or reopen operations: they are history.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.rec_requirement_supplement_requests)
     OR EXISTS (SELECT 1 FROM recruiter_intelligence.operations WHERE kind IN ('reopen', 'supplement_request'))
     OR EXISTS (SELECT 1 FROM public.recruitment_messages WHERE kind = 'supplement_request') THEN
    RAISE EXCEPTION 'REC_ROLLBACK_REQUIRES_PRESERVED_DATA';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.rec_reopen_application(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.rec_ri_resolve_supplement(uuid, text, text);
DROP FUNCTION IF EXISTS public.rec_ri_supplement_state(uuid);
DROP FUNCTION IF EXISTS public.rec_ri_request_supplement(uuid, uuid, uuid[], text, text, text, uuid);
DROP TABLE public.rec_requirement_supplement_requests;
DROP FUNCTION IF EXISTS public.rec_supplement_request_guard();
ALTER TABLE public.recruitment_messages DROP CONSTRAINT recruitment_messages_kind_check;
ALTER TABLE public.recruitment_messages ADD CONSTRAINT recruitment_messages_kind_check
  CHECK (kind IN ('general', 'interview_invitation', 'rejection', 'offer', 'information', 'receipt'));
COMMIT;
