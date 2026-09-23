-- The employer recruitment workspace: the parts of a recruitment the product
-- did not yet hold.
--
-- ── WHAT ALREADY EXISTED, AND IS REUSED UNCHANGED ─────────────────────────
--
-- A recruitment IS a job. `jobs` holds the vacancy and its publication state,
-- `job_applications` holds one application per candidate and vacancy, and
-- `set_application_status()` is the one path a recruitment stage moves
-- through, writing one `job_application_status_events` row per move. None of
-- that is replaced, renamed or re-derived here: every table below hangs off a
-- job or an application by foreign key, so there is no second candidate
-- database and no second recruitment entity.
--
-- ── WHAT WAS MISSING (audit 2026-09-23) ───────────────────────────────────
--
--   recruitment_settings        who is responsible for the recruitment, and
--                               whether it has been COMPLETED -- which is not
--                               the same act as closing the advertisement.
--   recruitment_requirements    mandatory ("krav") and desirable
--                               ("meriterande") requirements as rows, so a
--                               question can be linked to the requirement it
--                               asks about.
--   recruitment_questions       the application questions the candidate
--                               answers.
--   job_application_answers     what the candidate answered, per application,
--                               with the question as it was asked.
--   recruitment_application_meta  per application: who handles it, and when
--                               it was first opened -- deliberately NOT a
--                               stage. Opening an application never moves it.
--   recruitment_comments        internal notes. Never candidate-visible.
--   recruitment_messages        candidate-visible communication with a
--                               truthful delivery state and an idempotency
--                               key, so a double-click is one message.
--   recruitment_interview_bookings  a time, a timezone, a place or a link,
--                               and the candidate's answer.
--
-- ── PERMISSIONS, ENFORCED HERE AND NOT IN THE BROWSER ─────────────────────
--
-- The organisation roles are unchanged (owner, admin, member). What this adds
-- is one rule on top of them, taken from the Varbi practice the product
-- follows: reading, commenting, planning interviews and moving a candidate
-- between review stages is the whole recruitment team's work; RECORDING A
-- DECISION (hired / rejected), writing to candidates and completing the
-- recruitment belong to an owner or admin, or to the person named responsible
-- for that recruitment. The decision rule is a trigger on job_applications, so
-- it holds for every path that reaches the row -- including a hand-made call
-- to set_application_status() that skips every server function in the app.
--
-- Every table is SELECT-only for `authenticated` (and for anon only where the
-- advertisement itself is public), and every write is a SECURITY DEFINER
-- function that re-derives the caller's organisation from the row it touches.
-- Candidate answers are the single exception: they are written by the
-- candidate, under RLS, inside the same transaction that creates the
-- application -- which a deferred constraint trigger then requires.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.recruitment_settings (
  job_id              uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id         uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completion_state    text NOT NULL DEFAULT 'open'
                        CHECK (completion_state IN ('open', 'completed', 'cancelled')),
  completed_at        timestamptz,
  completed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completion_note     text CHECK (completion_note IS NULL OR char_length(completion_note) <= 2000),
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_settings_completion_shape CHECK (
    (completion_state = 'open' AND completed_at IS NULL)
    OR (completion_state <> 'open' AND completed_at IS NOT NULL)
  )
);
CREATE INDEX recruitment_settings_employer_idx ON public.recruitment_settings (employer_id);

CREATE TABLE public.recruitment_requirements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('mandatory', 'desirable')),
  label_sv    text CHECK (label_sv IS NULL OR char_length(label_sv) BETWEEN 1 AND 300),
  label_en    text CHECK (label_en IS NULL OR char_length(label_en) BETWEEN 1 AND 300),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_requirements_has_label CHECK (num_nonnulls(label_sv, label_en) >= 1)
);
CREATE INDEX recruitment_requirements_job_idx ON public.recruitment_requirements (job_id, position);

CREATE TABLE public.recruitment_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id    uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.recruitment_requirements(id) ON DELETE SET NULL,
  prompt_sv      text CHECK (prompt_sv IS NULL OR char_length(prompt_sv) BETWEEN 1 AND 500),
  prompt_en      text CHECK (prompt_en IS NULL OR char_length(prompt_en) BETWEEN 1 AND 500),
  answer_kind    text NOT NULL CHECK (answer_kind IN ('text', 'yes_no')),
  is_required    boolean NOT NULL DEFAULT false,
  position       integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_questions_has_prompt CHECK (num_nonnulls(prompt_sv, prompt_en) >= 1)
);
CREATE INDEX recruitment_questions_job_idx ON public.recruitment_questions (job_id, position);

CREATE TABLE public.job_application_answers (
  application_id     uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  question_id        uuid NOT NULL REFERENCES public.recruitment_questions(id) ON DELETE CASCADE,
  employer_id        uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  -- The question AS ASKED. The question row is locked once applications
  -- exist, but a snapshot keeps the answer readable on its own.
  prompt_sv_snapshot text,
  prompt_en_snapshot text,
  answer_kind        text NOT NULL CHECK (answer_kind IN ('text', 'yes_no')),
  answer_text        text CHECK (answer_text IS NULL OR char_length(answer_text) <= 2000),
  answer_bool        boolean,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, question_id),
  CONSTRAINT job_application_answers_shape CHECK (
    (answer_kind = 'text' AND answer_bool IS NULL)
    OR (answer_kind = 'yes_no' AND answer_text IS NULL)
  )
);
CREATE INDEX job_application_answers_employer_idx ON public.job_application_answers (employer_id);

CREATE TABLE public.recruitment_application_meta (
  application_id      uuid PRIMARY KEY REFERENCES public.job_applications(id) ON DELETE CASCADE,
  job_id              uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id         uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_viewed_at     timestamptz,
  first_viewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version             integer NOT NULL DEFAULT 1,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruitment_application_meta_job_idx ON public.recruitment_application_meta (job_id);

CREATE TABLE public.recruitment_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  job_id         uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id    uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body           text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruitment_comments_application_idx ON public.recruitment_comments (application_id, created_at);

CREATE TABLE public.recruitment_interview_bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  job_id                uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id           uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  starts_at             timestamptz NOT NULL,
  duration_minutes      integer NOT NULL CHECK (duration_minutes BETWEEN 10 AND 480),
  -- An IANA zone name, so the invitation says "14:00 Europe/Stockholm" and
  -- means it whatever the reader's own clock says.
  timezone              text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  location_kind         text NOT NULL CHECK (location_kind IN ('onsite', 'video', 'phone')),
  location_text         text CHECK (location_text IS NULL OR char_length(location_text) <= 300),
  meeting_url           text CHECK (meeting_url IS NULL OR (char_length(meeting_url) <= 500 AND meeting_url ~ '^https://')),
  interviewer_names     text CHECK (interviewer_names IS NULL OR char_length(interviewer_names) <= 300),
  status                text NOT NULL DEFAULT 'planned'
                          CHECK (status IN ('planned', 'invited', 'confirmed', 'declined', 'cancelled', 'completed')),
  invited_at            timestamptz,
  candidate_response_at timestamptz,
  cancelled_reason      text CHECK (cancelled_reason IS NULL OR char_length(cancelled_reason) <= 500),
  version               integer NOT NULL DEFAULT 1,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_bookings_where CHECK (
    (location_kind = 'video' AND meeting_url IS NOT NULL)
    OR (location_kind = 'onsite' AND location_text IS NOT NULL)
    OR (location_kind = 'phone')
  ),
  CONSTRAINT recruitment_bookings_invited_shape CHECK (
    status = 'planned' OR status = 'cancelled' OR invited_at IS NOT NULL
  )
);
CREATE INDEX recruitment_bookings_application_idx ON public.recruitment_interview_bookings (application_id);
CREATE INDEX recruitment_bookings_upcoming_idx ON public.recruitment_interview_bookings (employer_id, starts_at);

CREATE TABLE public.recruitment_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id     uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  booking_id      uuid REFERENCES public.recruitment_interview_bookings(id) ON DELETE SET NULL,
  kind            text NOT NULL
                    CHECK (kind IN ('general', 'interview_invitation', 'rejection', 'offer', 'information')),
  subject         text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200),
  body            text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
  language        text NOT NULL CHECK (language IN ('sv', 'en')),
  -- draft: only the organisation sees it. sent: the candidate sees it in
  -- CQrityjob. discarded: a draft somebody threw away.
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'discarded')),
  -- The e-mail copy is a second channel with its own truth. 'sent' means the
  -- provider accepted it -- never that it arrived.
  email_status    text NOT NULL DEFAULT 'not_attempted'
                    CHECK (email_status IN ('not_attempted', 'sending', 'sent', 'failed', 'not_configured')),
  email_error     text CHECK (email_error IS NULL OR char_length(email_error) <= 200),
  email_attempts  integer NOT NULL DEFAULT 0,
  email_claimed_at timestamptz,
  idempotency_key text CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 120),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_messages_sent_shape CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT recruitment_messages_email_after_send CHECK (status = 'sent' OR email_status = 'not_attempted')
);
CREATE UNIQUE INDEX recruitment_messages_idempotency_idx
  ON public.recruitment_messages (employer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX recruitment_messages_application_idx ON public.recruitment_messages (application_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Access: nothing by default, then exactly what each audience reads
--
-- Hosted default privileges grant anon and authenticated EVERYTHING on a new
-- table, TRUNCATE included, and RLS does not cover TRUNCATE. So every table is
-- revoked to nothing first and granted back narrowly.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'recruitment_settings', 'recruitment_requirements', 'recruitment_questions',
    'job_application_answers', 'recruitment_application_meta', 'recruitment_comments',
    'recruitment_interview_bookings', 'recruitment_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', _t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', _t);
  END LOOP;
END $$;

-- The public advertisement shows its requirements and the questions a
-- candidate will be asked, so anon may read those two -- through the jobs
-- policy, never around it.
GRANT SELECT ON TABLE public.recruitment_requirements TO anon;
GRANT SELECT ON TABLE public.recruitment_questions TO anon;

-- The candidate's only write: their own answers, and only the answer columns.
GRANT INSERT (application_id, question_id, answer_text, answer_bool)
  ON TABLE public.job_application_answers TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Who may do what
-- ═══════════════════════════════════════════════════════════════════════════

-- An active member of an ACTIVE organisation. Every recruitment read and every
-- recruitment write below starts here.
CREATE OR REPLACE FUNCTION public.rec_is_member(_employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, NULL)
     AND public.employer_is_active_status(_employer_id);
$$;
REVOKE ALL ON FUNCTION public.rec_is_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_is_member(uuid) TO authenticated;

-- Decisions, candidate communication and completion: an owner or admin, or the
-- person named responsible for THIS recruitment.
CREATE OR REPLACE FUNCTION public.rec_can_manage(_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.jobs j
     WHERE j.id = _job_id
       AND public.rec_is_member(j.employer_id)
       AND (
         public.has_employer_role(auth.uid(), j.employer_id, ARRAY['owner', 'admin'])
         OR EXISTS (SELECT 1 FROM public.recruitment_settings s
                     WHERE s.job_id = j.id AND s.responsible_user_id = auth.uid())
       )
  );
$$;
REVOKE ALL ON FUNCTION public.rec_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_can_manage(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Read policies
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY recruitment_settings_member_read ON public.recruitment_settings
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));

-- Whoever may see the job may see what it asks for. The subquery is itself
-- subject to the jobs policies: anon sees an active advertisement, a member
-- sees their own organisation's drafts, and nobody sees anybody else's draft.
CREATE POLICY recruitment_requirements_read ON public.recruitment_requirements
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id));

CREATE POLICY recruitment_questions_read ON public.recruitment_questions
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id));

CREATE POLICY job_application_answers_member_read ON public.job_application_answers
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));

CREATE POLICY job_application_answers_applicant_read ON public.job_application_answers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.job_applications a
                  WHERE a.id = application_id AND a.applicant_user_id = auth.uid()));

-- Only inside the transaction that created the application: its created_at is
-- that transaction's now(). An answer cannot be added, changed or removed
-- afterwards by anybody.
CREATE POLICY job_application_answers_applicant_insert ON public.job_application_answers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.job_applications a
                       WHERE a.id = application_id
                         AND a.applicant_user_id = auth.uid()
                         AND a.status = 'submitted'
                         AND a.created_at = now()));

CREATE POLICY recruitment_application_meta_member_read ON public.recruitment_application_meta
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));

-- Internal comments have NO candidate policy at all.
CREATE POLICY recruitment_comments_member_read ON public.recruitment_comments
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));

CREATE POLICY recruitment_bookings_member_read ON public.recruitment_interview_bookings
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));

-- A candidate sees a booking once they have been invited to it, never a slot
-- the organisation is still planning.
CREATE POLICY recruitment_bookings_applicant_read ON public.recruitment_interview_bookings
  FOR SELECT TO authenticated
  USING (invited_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.job_applications a
                      WHERE a.id = application_id AND a.applicant_user_id = auth.uid()));

CREATE POLICY recruitment_messages_member_read ON public.recruitment_messages
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));

-- A candidate sees what was SENT to them, never a draft.
CREATE POLICY recruitment_messages_applicant_read ON public.recruitment_messages
  FOR SELECT TO authenticated
  USING (status = 'sent'
         AND EXISTS (SELECT 1 FROM public.job_applications a
                      WHERE a.id = application_id AND a.applicant_user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Triggers on job_applications
-- ═══════════════════════════════════════════════════════════════════════════

-- 5a. A closed vacancy takes no applications. The advertisement stopped being
-- shown at its deadline, but nothing refused a submission from a page left
-- open since the morning -- the UI hid the button and that was all.
CREATE OR REPLACE FUNCTION public.rec_application_window_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO _job FROM public.jobs WHERE id = NEW.job_id;
  IF FOUND AND ((_job.deadline_at IS NOT NULL AND _job.deadline_at <= now())
                OR (_job.expires_at IS NOT NULL AND _job.expires_at <= now())) THEN
    RAISE EXCEPTION 'VACANCY_CLOSED' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recruitment_settings s
              WHERE s.job_id = NEW.job_id AND s.completion_state <> 'open') THEN
    RAISE EXCEPTION 'VACANCY_CLOSED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.rec_application_window_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER job_applications_window_guard
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.rec_application_window_guard();

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

-- 5d. An answer is stamped from its question, never from the caller: the
-- organisation, the kind and the wording asked.
CREATE OR REPLACE FUNCTION public.rec_answer_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _q public.recruitment_questions%ROWTYPE;
  _job_id uuid;
BEGIN
  SELECT job_id INTO _job_id FROM public.job_applications WHERE id = NEW.application_id;
  SELECT * INTO _q FROM public.recruitment_questions WHERE id = NEW.question_id;
  IF NOT FOUND OR _job_id IS NULL OR _q.job_id <> _job_id THEN
    RAISE EXCEPTION 'ANSWER_QUESTION_MISMATCH' USING ERRCODE = 'check_violation';
  END IF;
  NEW.employer_id := _q.employer_id;
  NEW.answer_kind := _q.answer_kind;
  NEW.prompt_sv_snapshot := _q.prompt_sv;
  NEW.prompt_en_snapshot := _q.prompt_en;
  NEW.created_at := now();
  IF _q.answer_kind = 'text' THEN
    NEW.answer_bool := NULL;
    NEW.answer_text := nullif(btrim(NEW.answer_text), '');
  ELSE
    NEW.answer_text := NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.rec_answer_stamp() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER job_application_answers_stamp
  BEFORE INSERT ON public.job_application_answers
  FOR EACH ROW EXECUTE FUNCTION public.rec_answer_stamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Writes: the recruitment
-- ═══════════════════════════════════════════════════════════════════════════

-- The settings row is created on first use; a job that predates this
-- migration simply has none until somebody sets something.
CREATE OR REPLACE FUNCTION public.rec_settings_row(_job_id uuid)
RETURNS public.recruitment_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _row public.recruitment_settings%ROWTYPE;
BEGIN
  INSERT INTO public.recruitment_settings (job_id, employer_id)
  SELECT j.id, j.employer_id FROM public.jobs j WHERE j.id = _job_id
  ON CONFLICT (job_id) DO NOTHING;
  SELECT * INTO _row FROM public.recruitment_settings WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.rec_settings_row(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rec_set_recruitment_responsible(
  _job_id uuid,
  _user_id uuid,
  _expected_version integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _employer uuid;
  _row public.recruitment_settings%ROWTYPE;
BEGIN
  SELECT employer_id INTO _employer FROM public.jobs WHERE id = _job_id;
  IF _employer IS NULL OR NOT public.rec_is_member(_employer) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.rec_can_manage(_job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _user_id IS NOT NULL AND NOT public.has_employer_role(_user_id, _employer, NULL) THEN
    RAISE EXCEPTION 'RESPONSIBLE_NOT_A_MEMBER' USING ERRCODE = 'check_violation';
  END IF;

  _row := public.rec_settings_row(_job_id);
  IF _expected_version IS NOT NULL AND _row.version <> _expected_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.recruitment_settings
     SET responsible_user_id = _user_id, version = version + 1, updated_at = now()
   WHERE job_id = _job_id
  RETURNING version INTO _row.version;
  RETURN _row.version;
END; $$;
REVOKE ALL ON FUNCTION public.rec_set_recruitment_responsible(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_set_recruitment_responsible(uuid, uuid, integer) TO authenticated;

-- Requirements and questions are written as one set. They are the frame every
-- application is read against, so they lock the moment the first application
-- arrives: a question changed after somebody answered it would make their
-- answer mean something they did not say.
--
-- Pending organisations may prepare them, exactly as they may prepare the job
-- draft they belong to (employer_members_can_edit, not rec_is_member).
CREATE OR REPLACE FUNCTION public.rec_save_vacancy_structure(
  _job_id uuid,
  _requirements jsonb,
  _questions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _employer uuid;
  _req jsonb;
  _q jsonb;
  _keymap jsonb := '{}'::jsonb;
  _new_id uuid;
  _pos integer := 0;
  _req_key text;
BEGIN
  SELECT employer_id INTO _employer FROM public.jobs WHERE id = _job_id;
  IF _employer IS NULL
     OR auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer, NULL)
     OR NOT public.employer_members_can_edit(_employer) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF jsonb_typeof(coalesce(_requirements, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(_questions, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(_requirements, '[]'::jsonb)) > 30
     OR jsonb_array_length(coalesce(_questions, '[]'::jsonb)) > 15 THEN
    RAISE EXCEPTION 'VACANCY_STRUCTURE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.job_applications WHERE job_id = _job_id) THEN
    RAISE EXCEPTION 'VACANCY_STRUCTURE_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.recruitment_questions WHERE job_id = _job_id;
  DELETE FROM public.recruitment_requirements WHERE job_id = _job_id;

  FOR _req IN SELECT * FROM jsonb_array_elements(coalesce(_requirements, '[]'::jsonb)) LOOP
    INSERT INTO public.recruitment_requirements (job_id, employer_id, kind, label_sv, label_en, position)
    VALUES (_job_id, _employer, _req->>'kind',
            nullif(btrim(_req->>'label_sv'), ''), nullif(btrim(_req->>'label_en'), ''), _pos)
    RETURNING id INTO _new_id;
    IF nullif(_req->>'key', '') IS NOT NULL THEN
      _keymap := _keymap || jsonb_build_object(_req->>'key', _new_id);
    END IF;
    _pos := _pos + 1;
  END LOOP;

  _pos := 0;
  FOR _q IN SELECT * FROM jsonb_array_elements(coalesce(_questions, '[]'::jsonb)) LOOP
    _req_key := nullif(_q->>'requirement_key', '');
    IF _req_key IS NOT NULL AND NOT (_keymap ? _req_key) THEN
      RAISE EXCEPTION 'VACANCY_STRUCTURE_INVALID' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.recruitment_questions (
      job_id, employer_id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required, position)
    VALUES (_job_id, _employer,
            CASE WHEN _req_key IS NULL THEN NULL ELSE (_keymap->>_req_key)::uuid END,
            nullif(btrim(_q->>'prompt_sv'), ''), nullif(btrim(_q->>'prompt_en'), ''),
            _q->>'answer_kind', coalesce((_q->>'is_required')::boolean, false), _pos);
    _pos := _pos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'requirements', (SELECT count(*) FROM public.recruitment_requirements WHERE job_id = _job_id),
    'questions', (SELECT count(*) FROM public.recruitment_questions WHERE job_id = _job_id));
END; $$;
REVOKE ALL ON FUNCTION public.rec_save_vacancy_structure(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_save_vacancy_structure(uuid, jsonb, jsonb) TO authenticated;

-- Completing is not closing. The advertisement must already have stopped
-- taking applications, and every candidate must have an outcome: the product
-- lists the unresolved ones rather than assigning outcomes on anybody's behalf.
CREATE OR REPLACE FUNCTION public.rec_complete_recruitment(
  _job_id uuid,
  _state text,
  _note text DEFAULT NULL,
  _expected_version integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _job public.jobs%ROWTYPE;
  _row public.recruitment_settings%ROWTYPE;
BEGIN
  IF _state NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'RECRUITMENT_STATE_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  IF NOT FOUND OR NOT public.rec_is_member(_job.employer_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.rec_can_manage(_job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _row := public.rec_settings_row(_job_id);
  IF _expected_version IS NOT NULL AND _row.version <> _expected_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'serialization_failure';
  END IF;
  IF _row.completion_state <> 'open' THEN
    RAISE EXCEPTION 'RECRUITMENT_ALREADY_COMPLETED' USING ERRCODE = 'check_violation';
  END IF;
  IF public.job_is_active(_job.status, _job.published_at, _job.deadline_at, _job.expires_at) THEN
    RAISE EXCEPTION 'RECRUITMENT_STILL_ACCEPTING' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_applications
              WHERE job_id = _job_id AND status IN ('submitted', 'reviewing', 'interview')) THEN
    RAISE EXCEPTION 'RECRUITMENT_HAS_UNRESOLVED' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.recruitment_settings
     SET completion_state = _state,
         completed_at = now(),
         completed_by = auth.uid(),
         completion_note = nullif(btrim(_note), ''),
         version = version + 1,
         updated_at = now()
   WHERE job_id = _job_id
  RETURNING version INTO _row.version;
  RETURN _row.version;
END; $$;
REVOKE ALL ON FUNCTION public.rec_complete_recruitment(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_complete_recruitment(uuid, text, text, integer) TO authenticated;

-- Reopening a completed recruitment is an owner/admin act only.
CREATE OR REPLACE FUNCTION public.rec_reopen_recruitment(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _employer uuid;
  _version integer;
BEGIN
  SELECT employer_id INTO _employer FROM public.jobs WHERE id = _job_id;
  IF _employer IS NULL OR NOT public.rec_is_member(_employer) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _employer, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.recruitment_settings
     SET completion_state = 'open', completed_at = NULL, completed_by = NULL,
         version = version + 1, updated_at = now()
   WHERE job_id = _job_id AND completion_state <> 'open'
  RETURNING version INTO _version;
  IF _version IS NULL THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_COMPLETED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN _version;
END; $$;
REVOKE ALL ON FUNCTION public.rec_reopen_recruitment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_reopen_recruitment(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Writes: the candidate's submission
-- ═══════════════════════════════════════════════════════════════════════════

-- The existing submission, plus the answers, in one transaction. SECURITY
-- INVOKER like the function it wraps: RLS, the eligibility trigger, the
-- duplicate index, the window guard and the required-answer check all apply.
--
-- Idempotent on the id the client generated: a retry after a dropped
-- connection finds its own application and reports it instead of failing as a
-- duplicate of itself.
CREATE OR REPLACE FUNCTION public.rec_submit_application(
  _application_id        uuid,
  _job_id                uuid,
  _phone                 text,
  _cover_note            text,
  _cv_storage_path       text,
  _cv_original_filename  text,
  _cv_size_bytes         bigint,
  _cv_source             text DEFAULT 'upload',
  _cv_document_id        uuid DEFAULT NULL,
  _include_passport      boolean DEFAULT false,
  _answers               jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _existing public.job_applications%ROWTYPE;
  _result jsonb;
  _a jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _existing FROM public.job_applications
   WHERE id = _application_id AND applicant_user_id = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', _existing.id,
      'status', _existing.status,
      'cv_source', _existing.cv_source,
      'passport_requested', _include_passport,
      'passport_shared', EXISTS (SELECT 1 FROM public.sp_disclosures d
                                  WHERE d.application_id = _existing.id),
      'replayed', true);
  END IF;

  IF jsonb_typeof(coalesce(_answers, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(_answers, '[]'::jsonb)) > 15 THEN
    RAISE EXCEPTION 'APPLICATION_ANSWERS_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  _result := public.sp_submit_application_with_cv_source(
    _application_id, _job_id, _phone, _cover_note, _cv_storage_path,
    _cv_original_filename, _cv_size_bytes, _cv_source, _cv_document_id, _include_passport);

  FOR _a IN SELECT * FROM jsonb_array_elements(coalesce(_answers, '[]'::jsonb)) LOOP
    INSERT INTO public.job_application_answers (application_id, question_id, answer_text, answer_bool)
    VALUES (_application_id, (_a->>'question_id')::uuid,
            left(_a->>'answer_text', 2000),
            CASE WHEN _a ? 'answer_bool' AND jsonb_typeof(_a->'answer_bool') = 'boolean'
                 THEN (_a->>'answer_bool')::boolean END);
  END LOOP;

  -- Checked here as well as at COMMIT, so the caller gets the reason while the
  -- transaction is still theirs rather than as a commit-time failure. Setting
  -- it IMMEDIATE fires the pending check now; setting it back to DEFERRED keeps
  -- a later insert in the same transaction checked at COMMIT, after ITS answers.
  SET CONSTRAINTS public.job_applications_required_answers IMMEDIATE;
  SET CONSTRAINTS public.job_applications_required_answers DEFERRED;

  RETURN _result || jsonb_build_object('replayed', false);
END; $$;
REVOKE ALL ON FUNCTION public.rec_submit_application(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_submit_application(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean, jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Writes: one application
-- ═══════════════════════════════════════════════════════════════════════════

-- Opening an application records that it was opened. It never moves the stage.
CREATE OR REPLACE FUNCTION public.rec_mark_application_viewed(_application_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _app public.job_applications%ROWTYPE;
  _at timestamptz;
BEGIN
  SELECT * INTO _app FROM public.job_applications WHERE id = _application_id;
  IF NOT FOUND OR NOT public.rec_is_member(_app.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.recruitment_application_meta (application_id, job_id, employer_id, first_viewed_at, first_viewed_by)
  VALUES (_app.id, _app.job_id, _app.employer_id, now(), auth.uid())
  ON CONFLICT (application_id) DO UPDATE
    SET first_viewed_at = coalesce(recruitment_application_meta.first_viewed_at, EXCLUDED.first_viewed_at),
        first_viewed_by = coalesce(recruitment_application_meta.first_viewed_by, EXCLUDED.first_viewed_by)
  RETURNING first_viewed_at INTO _at;
  RETURN _at;
END; $$;
REVOKE ALL ON FUNCTION public.rec_mark_application_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_mark_application_viewed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rec_set_application_responsible(
  _application_id uuid,
  _user_id uuid,
  _expected_version integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _app public.job_applications%ROWTYPE;
  _version integer;
BEGIN
  SELECT * INTO _app FROM public.job_applications WHERE id = _application_id;
  IF NOT FOUND OR NOT public.rec_is_member(_app.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.rec_can_manage(_app.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _user_id IS NOT NULL AND NOT public.has_employer_role(_user_id, _app.employer_id, NULL) THEN
    RAISE EXCEPTION 'RESPONSIBLE_NOT_A_MEMBER' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.recruitment_application_meta (application_id, job_id, employer_id)
  VALUES (_app.id, _app.job_id, _app.employer_id)
  ON CONFLICT (application_id) DO NOTHING;

  SELECT version INTO _version FROM public.recruitment_application_meta
   WHERE application_id = _application_id FOR UPDATE;
  IF _expected_version IS NOT NULL AND _version <> _expected_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.recruitment_application_meta
     SET responsible_user_id = _user_id, version = version + 1, updated_at = now()
   WHERE application_id = _application_id
  RETURNING version INTO _version;
  RETURN _version;
END; $$;
REVOKE ALL ON FUNCTION public.rec_set_application_responsible(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_set_application_responsible(uuid, uuid, integer) TO authenticated;

-- A stage move that states which stage it moves FROM. Two colleagues acting on
-- the same candidate from the same screen no longer both succeed: the second
-- is told the candidate moved, instead of silently overwriting the first.
-- set_application_status() stays the one path that changes the row.
CREATE OR REPLACE FUNCTION public.rec_set_application_stage(
  _application_id uuid,
  _expected_status text,
  _new_status text,
  _note text DEFAULT NULL
)
RETURNS TABLE (application_id uuid, previous_status text, new_status text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _current text;
BEGIN
  SELECT a.status INTO _current FROM public.job_applications a
   WHERE a.id = _application_id AND public.rec_is_member(a.employer_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _current IS DISTINCT FROM _expected_status THEN
    RAISE EXCEPTION 'STALE_APPLICATION_STAGE' USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN QUERY SELECT * FROM public.set_application_status(_application_id, _new_status, _note);
END; $$;
REVOKE ALL ON FUNCTION public.rec_set_application_stage(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_set_application_stage(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rec_add_comment(_application_id uuid, _body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _app public.job_applications%ROWTYPE;
  _id uuid;
BEGIN
  SELECT * INTO _app FROM public.job_applications WHERE id = _application_id;
  IF NOT FOUND OR NOT public.rec_is_member(_app.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.recruitment_comments (application_id, job_id, employer_id, author_user_id, body)
  VALUES (_app.id, _app.job_id, _app.employer_id, auth.uid(), btrim(_body))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.rec_add_comment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_add_comment(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Interview bookings
-- ═══════════════════════════════════════════════════════════════════════════

-- Planning a time is team work. Only a PLANNED booking can be edited: once the
-- candidate has been invited to a time, changing it underneath them would make
-- the invitation they hold a lie -- cancel and invite again instead.
CREATE OR REPLACE FUNCTION public.rec_save_booking(
  _booking_id uuid,
  _application_id uuid,
  _starts_at timestamptz,
  _duration_minutes integer,
  _timezone text,
  _location_kind text,
  _location_text text,
  _meeting_url text,
  _interviewer_names text,
  _expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _app public.job_applications%ROWTYPE;
  _b public.recruitment_interview_bookings%ROWTYPE;
BEGIN
  SELECT * INTO _app FROM public.job_applications WHERE id = _application_id;
  IF NOT FOUND OR NOT public.rec_is_member(_app.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _app.status NOT IN ('submitted', 'reviewing', 'interview') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_OPEN' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _timezone) THEN
    RAISE EXCEPTION 'BOOKING_TIMEZONE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF _booking_id IS NULL THEN
    INSERT INTO public.recruitment_interview_bookings (
      application_id, job_id, employer_id, starts_at, duration_minutes, timezone,
      location_kind, location_text, meeting_url, interviewer_names, created_by)
    VALUES (_app.id, _app.job_id, _app.employer_id, _starts_at, _duration_minutes, _timezone,
            _location_kind, nullif(btrim(_location_text), ''), nullif(btrim(_meeting_url), ''),
            nullif(btrim(_interviewer_names), ''), auth.uid())
    RETURNING * INTO _b;
  ELSE
    SELECT * INTO _b FROM public.recruitment_interview_bookings
     WHERE id = _booking_id AND application_id = _app.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'no_data_found';
    END IF;
    IF _expected_version IS NOT NULL AND _b.version <> _expected_version THEN
      RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'serialization_failure';
    END IF;
    IF _b.status <> 'planned' THEN
      RAISE EXCEPTION 'BOOKING_NOT_EDITABLE' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.recruitment_interview_bookings
       SET starts_at = _starts_at, duration_minutes = _duration_minutes, timezone = _timezone,
           location_kind = _location_kind, location_text = nullif(btrim(_location_text), ''),
           meeting_url = nullif(btrim(_meeting_url), ''),
           interviewer_names = nullif(btrim(_interviewer_names), ''),
           version = version + 1, updated_at = now()
     WHERE id = _b.id
    RETURNING * INTO _b;
  END IF;
  RETURN jsonb_build_object('id', _b.id, 'version', _b.version, 'status', _b.status);
END; $$;
REVOKE ALL ON FUNCTION public.rec_save_booking(uuid, uuid, timestamptz, integer, text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_save_booking(uuid, uuid, timestamptz, integer, text, text, text, text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.rec_set_booking_status(
  _booking_id uuid,
  _status text,
  _reason text DEFAULT NULL,
  _expected_version integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _b public.recruitment_interview_bookings%ROWTYPE;
BEGIN
  IF _status NOT IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'BOOKING_STATUS_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _b FROM public.recruitment_interview_bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_is_member(_b.employer_id) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _expected_version IS NOT NULL AND _b.version <> _expected_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'serialization_failure';
  END IF;
  IF _b.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'BOOKING_NOT_EDITABLE' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.recruitment_interview_bookings
     SET status = _status,
         cancelled_reason = CASE WHEN _status = 'cancelled' THEN nullif(btrim(_reason), '') END,
         version = version + 1, updated_at = now()
   WHERE id = _b.id
  RETURNING version INTO _b.version;
  RETURN _b.version;
END; $$;
REVOKE ALL ON FUNCTION public.rec_set_booking_status(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_set_booking_status(uuid, text, text, integer) TO authenticated;

-- The candidate's answer to an invitation. Only the applicant, only their own
-- booking, only once it has been sent to them.
CREATE OR REPLACE FUNCTION public.rec_respond_to_booking(_booking_id uuid, _response text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _b public.recruitment_interview_bookings%ROWTYPE;
BEGIN
  IF _response NOT IN ('confirmed', 'declined') THEN
    RAISE EXCEPTION 'BOOKING_RESPONSE_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  SELECT b.* INTO _b
    FROM public.recruitment_interview_bookings b
    JOIN public.job_applications a ON a.id = b.application_id
   WHERE b.id = _booking_id AND a.applicant_user_id = auth.uid() AND b.invited_at IS NOT NULL
   FOR UPDATE OF b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (_b.status = 'invited' OR (_b.status = 'confirmed' AND _response = 'declined')) THEN
    RAISE EXCEPTION 'BOOKING_NOT_EDITABLE' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.recruitment_interview_bookings
     SET status = _response, candidate_response_at = now(), version = version + 1, updated_at = now()
   WHERE id = _b.id;
  RETURN _response;
END; $$;
REVOKE ALL ON FUNCTION public.rec_respond_to_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_respond_to_booking(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Candidate communication
-- ═══════════════════════════════════════════════════════════════════════════

-- Drafts. The idempotency key makes "create this draft" safe to repeat: the
-- second call returns the first draft instead of making another.
CREATE OR REPLACE FUNCTION public.rec_save_message_draft(
  _message_id uuid,
  _application_id uuid,
  _kind text,
  _subject text,
  _body text,
  _language text,
  _booking_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _app public.job_applications%ROWTYPE;
  _m public.recruitment_messages%ROWTYPE;
BEGIN
  SELECT * INTO _app FROM public.job_applications WHERE id = _application_id;
  IF NOT FOUND OR NOT public.rec_is_member(_app.employer_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.rec_can_manage(_app.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _booking_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.recruitment_interview_bookings
        WHERE id = _booking_id AND application_id = _app.id) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF _message_id IS NULL THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT * INTO _m FROM public.recruitment_messages
       WHERE employer_id = _app.employer_id AND idempotency_key = _idempotency_key;
      IF FOUND THEN
        IF _m.application_id <> _app.id THEN
          RAISE EXCEPTION 'MESSAGE_KEY_REUSED' USING ERRCODE = 'check_violation';
        END IF;
        RETURN _m.id;
      END IF;
    END IF;
    INSERT INTO public.recruitment_messages (
      application_id, job_id, employer_id, booking_id, kind, subject, body, language,
      idempotency_key, created_by)
    VALUES (_app.id, _app.job_id, _app.employer_id, _booking_id, _kind, btrim(_subject), btrim(_body),
            _language, _idempotency_key, auth.uid())
    RETURNING * INTO _m;
    RETURN _m.id;
  END IF;

  SELECT * INTO _m FROM public.recruitment_messages
   WHERE id = _message_id AND application_id = _app.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _m.status <> 'draft' THEN
    RAISE EXCEPTION 'MESSAGE_NOT_EDITABLE' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.recruitment_messages
     SET kind = _kind, subject = btrim(_subject), body = btrim(_body), language = _language,
         booking_id = _booking_id, updated_at = now()
   WHERE id = _m.id;
  RETURN _m.id;
END; $$;
REVOKE ALL ON FUNCTION public.rec_save_message_draft(uuid, uuid, text, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_save_message_draft(uuid, uuid, text, text, text, text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rec_discard_message_draft(_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _m public.recruitment_messages%ROWTYPE;
BEGIN
  SELECT * INTO _m FROM public.recruitment_messages WHERE id = _message_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_is_member(_m.employer_id) THEN
    RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.rec_can_manage(_m.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _m.status <> 'draft' THEN
    RAISE EXCEPTION 'MESSAGE_NOT_EDITABLE' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.recruitment_messages SET status = 'discarded', updated_at = now() WHERE id = _m.id;
END; $$;
REVOKE ALL ON FUNCTION public.rec_discard_message_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_discard_message_draft(uuid) TO authenticated;

-- Sending, step one: claim the message. This is the whole of the duplicate
-- protection. The row is locked; a message already delivered answers
-- 'already_sent', and one whose e-mail copy is in flight answers 'in_progress'
-- -- so a double-click, a retry and a second tab all converge on one message
-- and at most one e-mail in flight.
--
-- Claiming DELIVERS the message in CQrityjob (status 'sent', visible to the
-- candidate) and hands the server the address for the e-mail copy. The address
-- is returned to the calling server function and never to a browser: the
-- server function reads it and returns only the outcome.
CREATE OR REPLACE FUNCTION public.rec_claim_message_send(_message_id uuid)
RETURNS TABLE (
  outcome         text,
  recipient_email text,
  language        text,
  subject         text,
  body            text,
  employer_name   text,
  job_title       text,
  application_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _m public.recruitment_messages%ROWTYPE;
  _email text;
BEGIN
  SELECT * INTO _m FROM public.recruitment_messages WHERE id = _message_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_is_member(_m.employer_id) THEN
    RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.rec_can_manage(_m.job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _m.status = 'discarded' THEN
    RAISE EXCEPTION 'MESSAGE_NOT_EDITABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF _m.email_status = 'sent' THEN
    RETURN QUERY SELECT 'already_sent'::text, NULL::text, _m.language, _m.subject, _m.body, NULL::text, NULL::text, _m.application_id;
    RETURN;
  END IF;
  IF _m.email_status = 'sending' AND _m.email_claimed_at > now() - interval '2 minutes' THEN
    RETURN QUERY SELECT 'in_progress'::text, NULL::text, _m.language, _m.subject, _m.body, NULL::text, NULL::text, _m.application_id;
    RETURN;
  END IF;

  UPDATE public.recruitment_messages
     SET status = 'sent',
         sent_at = coalesce(sent_at, now()),
         sent_by = coalesce(sent_by, auth.uid()),
         email_status = 'sending',
         email_claimed_at = now(),
         email_attempts = email_attempts + 1,
         email_error = NULL,
         updated_at = now()
   WHERE id = _m.id;

  -- An interview invitation that has now been delivered makes its booking an
  -- invitation the candidate can answer.
  IF _m.kind = 'interview_invitation' AND _m.booking_id IS NOT NULL THEN
    UPDATE public.recruitment_interview_bookings
       SET status = 'invited', invited_at = coalesce(invited_at, now()),
           version = version + 1, updated_at = now()
     WHERE id = _m.booking_id AND status = 'planned';
  END IF;

  SELECT u.email INTO _email
    FROM public.job_applications a JOIN auth.users u ON u.id = a.applicant_user_id
   WHERE a.id = _m.application_id;

  RETURN QUERY
  SELECT 'claimed'::text, _email, _m.language, _m.subject, _m.body,
         e.name, coalesce(CASE WHEN _m.language = 'en' THEN j.title_en END, j.title_sv, j.title_en),
         _m.application_id
    FROM public.jobs j JOIN public.employers e ON e.id = j.employer_id
   WHERE j.id = _m.job_id;
END; $$;
REVOKE ALL ON FUNCTION public.rec_claim_message_send(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_claim_message_send(uuid) TO authenticated;

-- Sending, step two: record what the e-mail provider said. Only a claimed
-- message can be settled, so a late or repeated settle cannot overwrite a
-- later truth.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Self-verification
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'recruitment_settings', 'recruitment_requirements', 'recruitment_questions',
    'job_application_answers', 'recruitment_application_meta', 'recruitment_comments',
    'recruitment_interview_bookings', 'recruitment_messages'
  ] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || _t)::regclass) THEN
      RAISE EXCEPTION 'REC_RLS_OFF: %', _t;
    END IF;
    IF has_table_privilege('anon', 'public.' || _t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || _t, 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || _t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || _t, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || _t, 'TRUNCATE') THEN
      RAISE EXCEPTION 'REC_TABLE_WRITABLE: %', _t;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.recruitment_comments', 'SELECT')
     OR has_table_privilege('anon', 'public.recruitment_messages', 'SELECT')
     OR has_table_privilege('anon', 'public.job_application_answers', 'SELECT') THEN
    RAISE EXCEPTION 'REC_ANON_READ: a candidate-private table is readable by anon';
  END IF;

  IF has_function_privilege('anon', 'public.rec_claim_message_send(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rec_submit_application(uuid,uuid,text,text,text,text,bigint,text,uuid,boolean,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REC_ANON_EXECUTE: a recruitment function is callable by anon';
  END IF;
END $$;
