-- Rollback of 20270205090000_employer_new_application_notices.
--
-- Drops the four entry points, the backoff helper and the outbox with every
-- notice it holds. After it the application's employer-notification step finds
-- no function (PGRST202 / 42883) and is a logged no-op: applications are still
-- accepted, candidates still get their receipt, and the employer simply is not
-- e-mailed. Nothing else is touched: no application, receipt, membership or
-- recruitment setting changes.
--
-- Run it ONLY after the application change is rolled back or tolerated (the
-- application tolerates the absence, which is the point of the order in
-- docs/release/2026-10-03-employer-new-application-notification.md). A notice
-- that was queued and not yet sent is lost by this rollback; one that was sent
-- has already left. Idempotent.
--
-- The drops are by exact signature, so a function of another signature with
-- the same name is never touched. (Nothing is restored: all five functions and
-- the table are new in this migration. Their md5(prosrc) is recorded in the
-- release note, for comparing the hosted bodies with the reviewed ones.)

DROP FUNCTION IF EXISTS public.rec_settle_employer_notice(uuid, text, integer);
DROP FUNCTION IF EXISTS public.rec_claim_employer_notices(uuid, integer, text[]);
DROP FUNCTION IF EXISTS public.rec_enqueue_employer_new_application_notices(uuid);
DROP FUNCTION IF EXISTS public.rec_employer_notice_recipients(uuid);
DROP FUNCTION IF EXISTS public.rec_employer_notice_backoff(integer);
DROP TABLE IF EXISTS public.recruitment_employer_notices;

DO $$
BEGIN
  IF to_regclass('public.recruitment_employer_notices') IS NOT NULL
     OR to_regprocedure('public.rec_settle_employer_notice(uuid,text,integer)') IS NOT NULL
     OR to_regprocedure('public.rec_claim_employer_notices(uuid,integer,text[])') IS NOT NULL
     OR to_regprocedure('public.rec_enqueue_employer_new_application_notices(uuid)') IS NOT NULL
     OR to_regprocedure('public.rec_employer_notice_recipients(uuid)') IS NOT NULL
     OR to_regprocedure('public.rec_employer_notice_backoff(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'EMPLOYER_NOTICES_ROLLBACK: an outbox object is still in place';
  END IF;
  RAISE NOTICE 'EMPLOYER_NOTICES_ROLLBACK ok: the outbox and its five functions are removed';
END $$;
