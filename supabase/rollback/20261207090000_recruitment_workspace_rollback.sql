-- Rollback for 20261207090000_recruitment_workspace.sql.
--
-- Stands the recruitment workspace down completely: every table, trigger and
-- function the migration introduced. Nothing that existed before it is
-- touched -- jobs, job_applications and set_application_status() are exactly
-- as they were, because the migration never altered them.
--
-- DATA WARNING: dropping the tables deletes every requirement, question,
-- candidate answer, internal comment, candidate message and interview booking
-- recorded since the migration. Export them first if they must be kept. A
-- candidate message that was already delivered stays delivered by e-mail;
-- only the in-product copy disappears.
--
-- The application code that reads these objects must be rolled back FIRST
-- (revert the application PR), or every recruitment workspace read fails, and
-- 20261208090000's backstops must already be stood down by their own rollback.
-- Their two triggers and functions are dropped here as well, IF EXISTS, so a
-- forgotten step cannot leave a trigger calling a function this file drops.

BEGIN;

DROP TRIGGER IF EXISTS job_applications_decision_guard ON public.job_applications;
DROP TRIGGER IF EXISTS job_applications_required_answers ON public.job_applications;
DROP TRIGGER IF EXISTS job_applications_window_guard ON public.job_applications;

DROP FUNCTION IF EXISTS public.rec_settle_message_send(uuid, text, text);
DROP FUNCTION IF EXISTS public.rec_claim_message_send(uuid);
DROP FUNCTION IF EXISTS public.rec_discard_message_draft(uuid);
DROP FUNCTION IF EXISTS public.rec_save_message_draft(uuid, uuid, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.rec_respond_to_booking(uuid, text);
DROP FUNCTION IF EXISTS public.rec_set_booking_status(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.rec_save_booking(uuid, uuid, timestamptz, integer, text, text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.rec_add_comment(uuid, text);
DROP FUNCTION IF EXISTS public.rec_set_application_stage(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rec_set_application_responsible(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.rec_mark_application_viewed(uuid);
DROP FUNCTION IF EXISTS public.rec_submit_application(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean, jsonb);
DROP FUNCTION IF EXISTS public.rec_reopen_recruitment(uuid);
DROP FUNCTION IF EXISTS public.rec_complete_recruitment(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.rec_save_vacancy_structure(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.rec_set_recruitment_responsible(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.rec_settings_row(uuid);

DROP TABLE IF EXISTS public.recruitment_messages;
DROP TABLE IF EXISTS public.recruitment_interview_bookings;
DROP TABLE IF EXISTS public.recruitment_comments;
DROP TABLE IF EXISTS public.recruitment_application_meta;
DROP TABLE IF EXISTS public.job_application_answers;
DROP TABLE IF EXISTS public.recruitment_questions;
DROP TABLE IF EXISTS public.recruitment_requirements;
DROP TABLE IF EXISTS public.recruitment_settings;

DROP FUNCTION IF EXISTS public.rec_answer_stamp();
DROP FUNCTION IF EXISTS public.rec_application_decision_guard();
DROP FUNCTION IF EXISTS public.rec_check_required_answers();
DROP FUNCTION IF EXISTS public.rec_application_window_guard();
DROP FUNCTION IF EXISTS public.rec_can_manage(uuid);
DROP FUNCTION IF EXISTS public.rec_is_member(uuid);

COMMIT;
