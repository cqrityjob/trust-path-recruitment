-- Security Career Discovery v3.1 — test-group feedback, funnel analytics,
-- and career-goal persistence (Execution Mandate §17, §31, §34).
--
-- Three small, independent, additive tables. None of this touches
-- cd_sessions, cd_evidence or cd_report_snapshots, and none of it weakens
-- any existing RLS policy.
--
-- ── PRIVACY BY CONSTRUCTION ───────────────────────────────────────────────
--
-- cd_v31_funnel_events never stores a free-text field, an IP, a user agent
-- or any fingerprinting signal — only a closed set of event names (CHECK
-- constraint, not app-trusted) plus small, structured jsonb detail the
-- caller controls (format/profession id, never PII). Anyone may INSERT
-- (anonymous funnel events are the whole point of a pre-login flow); only
-- platform admins may SELECT.
--
-- cd_test_feedback is opt-in, short-form, structured — closed enum answers
-- plus two short optional free-text fields, never the candidate's raw
-- assessment answers. Same anon-insert / admin-only-select shape.
--
-- cd_career_goals is the one table here that carries real ownership: a
-- signed-in candidate's chosen direction from their OWN recommendations.
-- user_id is NOT NULL — goals only exist once a result is claimed, exactly
-- like every other write in this product's authenticated pipeline.

CREATE TABLE IF NOT EXISTS public.cd_v31_funnel_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   text NOT NULL CHECK (event_name IN (
    'assessment_started', 'assessment_completed', 'result_viewed',
    'profession_explored', 'pathway_opened', 'jobs_clicked',
    'career_card_opened', 'career_card_generated', 'share_initiated',
    'image_saved', 'save_journey_clicked', 'result_claimed',
    'feedback_submitted'
  )),
  -- Structured, closed-shape detail only (e.g. {"format":"story"} or
  -- {"professionId":"SP005"}) — the app writes this, never the browser's
  -- raw event payload. No free text, no PII, enforced by convention at the
  -- server-function boundary rather than a jsonb schema (Postgres has none
  -- cheap enough here); RLS still guarantees only admins can ever read it.
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id   uuid REFERENCES public.cd_sessions(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cd_v31_funnel_events IS
  'Privacy-safe funnel events for the v3.1 anonymous-first flow (Execution '
  'Mandate §34). No fingerprinting, no free text, no platform-post '
  'confirmation — only what this app itself observes.';

ALTER TABLE public.cd_v31_funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cd_v31_funnel_events_insert ON public.cd_v31_funnel_events;
CREATE POLICY cd_v31_funnel_events_insert ON public.cd_v31_funnel_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS cd_v31_funnel_events_admin_read ON public.cd_v31_funnel_events;
CREATE POLICY cd_v31_funnel_events_admin_read ON public.cd_v31_funnel_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

REVOKE UPDATE, DELETE ON public.cd_v31_funnel_events FROM anon, authenticated;
GRANT INSERT ON public.cd_v31_funnel_events TO anon, authenticated;
GRANT SELECT ON public.cd_v31_funnel_events TO authenticated;

-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cd_test_feedback (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid REFERENCES public.cd_sessions(id) ON DELETE SET NULL,
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  relevant              smallint CHECK (relevant BETWEEN 1 AND 5),
  understood_why        boolean,
  pathway_realistic     boolean,
  requirements_useful   boolean,
  missing_career_note   text CHECK (char_length(missing_career_note) <= 500),
  explored_profession_id text,
  free_text             text CHECK (char_length(free_text) <= 1000),
  locale                text NOT NULL CHECK (locale IN ('sv', 'en')),
  submitted_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cd_test_feedback IS
  'Lightweight, opt-in test-group feedback (Execution Mandate §31). Never '
  'the candidate''s raw assessment answers.';

ALTER TABLE public.cd_test_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cd_test_feedback_insert ON public.cd_test_feedback;
CREATE POLICY cd_test_feedback_insert ON public.cd_test_feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS cd_test_feedback_admin_read ON public.cd_test_feedback;
CREATE POLICY cd_test_feedback_admin_read ON public.cd_test_feedback
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

REVOKE UPDATE, DELETE ON public.cd_test_feedback FROM anon, authenticated;
GRANT INSERT ON public.cd_test_feedback TO anon, authenticated;
GRANT SELECT ON public.cd_test_feedback TO authenticated;

-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cd_career_goals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id          uuid NOT NULL REFERENCES public.cd_sessions(id) ON DELETE CASCADE,
  chosen_profession_id text NOT NULL,
  note                text CHECK (char_length(note) <= 500),
  set_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

COMMENT ON TABLE public.cd_career_goals IS
  'A candidate''s own chosen direction from THEIR OWN frozen recommendation '
  'set (Execution Mandate §17) — never validated against the catalogue here; '
  'the UI only ever offers professions already in the candidate''s own '
  'snapshot, and this table just remembers the choice.';

ALTER TABLE public.cd_career_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cd_career_goals_owner_all ON public.cd_career_goals;
CREATE POLICY cd_career_goals_owner_all ON public.cd_career_goals
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.cd_career_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cd_career_goals TO authenticated;
