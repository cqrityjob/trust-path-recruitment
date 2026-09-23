-- The recruitment workspace, CONTRACT half: the two backstops on
-- job_applications that 20261207090000 (the EXPAND half) deliberately left out.
--
-- ── WHY THIS IS ITS OWN MIGRATION ──────────────────────────────────────────
--
-- Both triggers refuse something the application on `main` BEFORE the
-- recruitment workspace does as a matter of course:
--
--   * its decision buttons call set_application_status() for every member of
--     the organisation, and the decision guard refuses hired/rejected from a
--     member who is neither owner, admin nor responsible;
--   * its apply dialog sends no answers, and the required-answers trigger
--     refuses an application to a vacancy that has required questions.
--
-- That application can only show "Kunde inte uppdatera ansökans status." for
-- the first, so these triggers must never be live while it is. They ship WITH
-- the application that explains them (the application PR carries this file),
-- and on an application rollback they are stood down FIRST, with
-- supabase/rollback/20261208090000_recruitment_workspace_backstops_rollback.sql.
--
-- Nothing is weakened by the split. The new application enforces both rules
-- itself through rec_set_application_stage and rec_submit_application (see
-- 20261207090000); these triggers add the same rules for every OTHER path to
-- the row -- a hand-made RPC call or a direct INSERT that skips the app.
--
-- Precondition: 20261207090000 applied. Checked below, because a trigger
-- function referencing a missing table only fails when a row arrives.

DO $$
BEGIN
  IF to_regclass('public.recruitment_settings') IS NULL
     OR to_regclass('public.recruitment_questions') IS NULL
     OR to_regclass('public.job_application_answers') IS NULL
     OR to_regprocedure('public.rec_can_manage(uuid)') IS NULL THEN
    RAISE EXCEPTION 'REC_BACKSTOPS_PRECONDITION: 20261207090000_recruitment_workspace.sql is not applied';
  END IF;
END $$;

-- 5b. Every required question is answered, whatever path created the row. A
-- deferred constraint trigger checks at COMMIT, so the application and its
-- answers are one transaction or neither exists.
CREATE OR REPLACE FUNCTION public.rec_check_required_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.job_applications WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.recruitment_questions q
     WHERE q.job_id = NEW.job_id
       AND q.is_required
       AND NOT EXISTS (
         SELECT 1 FROM public.job_application_answers a
          WHERE a.application_id = NEW.id AND a.question_id = q.id
            AND ((q.answer_kind = 'yes_no' AND a.answer_bool IS NOT NULL)
              OR (q.answer_kind = 'text' AND nullif(btrim(a.answer_text), '') IS NOT NULL))
       )
  ) THEN
    RAISE EXCEPTION 'APPLICATION_ANSWERS_MISSING' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.rec_check_required_answers() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER job_applications_required_answers
  AFTER INSERT ON public.job_applications
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.rec_check_required_answers();

-- 5c. Decisions belong to the people who may make them, and a completed
-- recruitment does not move.
--
-- This is a trigger rather than an edit to set_application_status() so the
-- canonical RPC stays byte-identical, and so the rule holds for every path to
-- the row. auth.uid() is the JWT subject of the request that started the
-- transaction; it is NULL for service_role and for migrations, which are not
-- employer acts. The applicant's own withdrawal is not an employer decision.
CREATE OR REPLACE FUNCTION public.rec_application_decision_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR auth.uid() IS NULL
     OR auth.uid() = NEW.applicant_user_id
     OR public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.recruitment_settings s
              WHERE s.job_id = NEW.job_id AND s.completion_state <> 'open') THEN
    RAISE EXCEPTION 'RECRUITMENT_COMPLETED' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('hired', 'rejected') AND NOT public.rec_can_manage(NEW.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_DECISION_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.rec_application_decision_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER job_applications_decision_guard
  BEFORE UPDATE OF status ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.rec_application_decision_guard();


-- ═══════════════════════════════════════════════════════════════════════════
-- Self-verification
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.job_applications'::regclass
                    AND tgname = 'job_applications_required_answers' AND tgdeferrable AND tginitdeferred) THEN
    RAISE EXCEPTION 'REC_BACKSTOP_MISSING: job_applications_required_answers is not a deferred constraint trigger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.job_applications'::regclass
                    AND tgname = 'job_applications_decision_guard') THEN
    RAISE EXCEPTION 'REC_BACKSTOP_MISSING: job_applications_decision_guard';
  END IF;
  IF has_function_privilege('anon', 'public.rec_application_decision_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rec_application_decision_guard()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rec_check_required_answers()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rec_check_required_answers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'REC_BACKSTOP_EXECUTABLE: a backstop trigger function is directly executable';
  END IF;
END $$;
