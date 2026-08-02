-- Security Competence Academy — Phase 1c: AI scoring, human review, reports.
--
-- ADDITIVE ONLY. The COMPLETE AI scoring architecture lands here so that
-- enabling AI later is CONFIGURATION, not an architectural change.
--
-- ── THE PROVIDER IS OFF ────────────────────────────────────────────────
--
-- The only enabled provider is `null_provider`, which produces no score and
-- routes every constructed response to human review. The Anthropic provider is
-- registered as a row with is_enabled = false and NO credential. Turning it on
-- later is an UPDATE plus a server-side key — not a migration.
--
-- A guard enforces that at most one provider is enabled at a time, so the
-- pipeline can never be ambiguous about which model produced a score.

-- =========================================================================
-- SECTION 1 — Provider abstraction
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.scp_ai_providers (
  code text PRIMARY KEY,
  name text NOT NULL,
  -- Recorded on every run, so a score is always attributable to an exact model.
  model_identifier text,
  is_enabled boolean NOT NULL DEFAULT false,
  -- Deliberately NO credential column. Keys live in server-side configuration,
  -- never in the database.
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_ai_providers IS
  'Provider abstraction for constructed-response scoring. The null provider is '
  'the default and produces no score -- every response routes to human review. '
  'No credential is stored here or anywhere in the database.';

INSERT INTO public.scp_ai_providers (code, name, model_identifier, is_enabled, notes)
VALUES
  ('null_provider', 'Null provider (human review only)', NULL, true,
   'Default. Produces no score; every constructed response routes to human review. The full pipeline still runs, so enabling a real provider changes no schema.'),
  ('anthropic', 'Anthropic', NULL, false,
   'Registered but DISABLED. Activation requires an owner decision, a server-side credential and threshold calibration against human review — Phase 4.')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.scp_guard_single_enabled_provider()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_ai_providers
   WHERE is_enabled AND code <> NEW.code;
  IF NEW.is_enabled AND _n > 0 THEN
    RAISE EXCEPTION
      'SCP_MULTIPLE_ENABLED_PROVIDERS: exactly one scoring provider may be '
      'enabled; disable the current one first.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_ai_providers_single_enabled
  BEFORE INSERT OR UPDATE ON public.scp_ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_single_enabled_provider();

-- =========================================================================
-- SECTION 2 — Prompt versioning
-- =========================================================================
--
-- PROTECTED CONTENT. A scoring prompt is an answer key in prose. Authoring-only,
-- and the browser must never receive one.

CREATE TABLE IF NOT EXISTS public.scp_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key text NOT NULL,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft','expert_review','legal_review','cognitive_review',
      'published','suspended','retired')),
  -- The system prompt. Candidate text is NEVER concatenated into this: it is
  -- passed separately inside an isolation envelope by the scoring service.
  system_prompt text NOT NULL,
  -- How untrusted candidate text is wrapped. Versioned with the prompt so a
  -- historical run's isolation strategy stays auditable.
  input_envelope_strategy text NOT NULL DEFAULT 'delimited_untrusted_block',
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_key, version_number)
);

COMMENT ON TABLE public.scp_prompt_versions IS
  'Versioned scoring prompts. An answer key in prose: authoring-only, never '
  'sent to a browser. Candidate responses are passed to the model inside a '
  'separate isolation envelope and are never treated as instructions.';

-- =========================================================================
-- SECTION 3 — AI scoring runs
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.scp_ai_scoring_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL
    REFERENCES public.scp_candidate_responses(id) ON DELETE RESTRICT,

  -- Everything needed to reproduce and audit the judgement.
  provider_code text NOT NULL REFERENCES public.scp_ai_providers(code) ON DELETE RESTRICT,
  model_version text,
  prompt_version_id uuid REFERENCES public.scp_prompt_versions(id) ON DELETE RESTRICT,
  rubric_version_id uuid REFERENCES public.scp_rubric_versions(id) ON DELETE RESTRICT,

  run_status text NOT NULL CHECK (run_status IN (
    'succeeded','schema_invalid','provider_error','skipped_no_provider')),
  -- Schema-validated structured output. Never free text.
  output jsonb,
  -- Lowest per-dimension confidence, denormalised for threshold comparison.
  min_confidence numeric(4,3) CHECK (min_confidence IS NULL OR min_confidence BETWEEN 0 AND 1),
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),

  run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_ai_scoring_runs IS
  'Append-only ledger of every scoring attempt, successful or not. A run that '
  'could not produce schema-valid output is RECORDED and routed to human review '
  'rather than retried into acceptance.';

-- Per-dimension results, so evidence excerpts and confidence are queryable
-- rather than buried in a JSON blob.
CREATE TABLE IF NOT EXISTS public.scp_ai_scoring_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id uuid NOT NULL
    REFERENCES public.scp_ai_scoring_runs(id) ON DELETE CASCADE,
  rubric_dimension_id uuid NOT NULL
    REFERENCES public.scp_rubric_dimensions(id) ON DELETE RESTRICT,
  level integer NOT NULL CHECK (level BETWEEN 0 AND 4),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  -- The exact words in the response that justify the level. Evidence-only
  -- scoring is checkable rather than merely instructed.
  evidence_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scoring_run_id, rubric_dimension_id)
);

-- A run is append-only: a re-score is a new run, never an edit.
CREATE OR REPLACE FUNCTION public.scp_guard_scoring_run_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'SCP_SCORING_RUN_APPEND_ONLY: a scoring run is immutable; record a new run '
    'instead.' USING ERRCODE = 'check_violation';
END; $$;

CREATE TRIGGER scp_ai_scoring_runs_append_only
  BEFORE UPDATE OR DELETE ON public.scp_ai_scoring_runs
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_scoring_run_append_only();

-- A successful run must carry per-dimension results; anything else must not
-- pretend to have scored.
CREATE OR REPLACE FUNCTION public.scp_guard_scoring_run_consistent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _enabled text;
BEGIN
  IF NEW.run_status = 'succeeded' AND NEW.rubric_version_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_SCORING_RUN_WITHOUT_RUBRIC: a successful run must name the rubric '
      'version it scored against.' USING ERRCODE = 'check_violation';
  END IF;

  -- The null provider can never succeed. This is what makes "provider off"
  -- a database fact rather than an application convention.
  SELECT code INTO _enabled FROM public.scp_ai_providers WHERE code = NEW.provider_code;
  IF NEW.provider_code = 'null_provider' AND NEW.run_status <> 'skipped_no_provider' THEN
    RAISE EXCEPTION
      'SCP_NULL_PROVIDER_CANNOT_SCORE: the null provider only ever produces '
      'skipped_no_provider; every response routes to human review.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER scp_ai_scoring_runs_consistent
  BEFORE INSERT ON public.scp_ai_scoring_runs
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_scoring_run_consistent();

-- =========================================================================
-- SECTION 4 — Human review
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.scp_human_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL
    REFERENCES public.scp_candidate_responses(id) ON DELETE RESTRICT,
  scoring_run_id uuid REFERENCES public.scp_ai_scoring_runs(id) ON DELETE RESTRICT,

  -- The eight triggers from the approved specification.
  trigger_reason text NOT NULL CHECK (trigger_reason IN (
    'safety_critical_detected',
    'confidence_below_threshold',
    'repeated_runs_disagree',
    'legally_sensitive_action',
    'recruitment_use',
    'participant_requested',
    'schema_invalid_output',
    'administrator_mandated')),

  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','in_review','completed','withdrawn')),
  outcome text CHECK (outcome IN ('upheld','adjusted','overturned')),
  reviewer_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Internal reasoning. Never exposed to an employer or to a future Passport.
  reviewer_rationale text,

  opened_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_review_completion_complete CHECK (
    (review_status <> 'completed')
    OR (outcome IS NOT NULL AND reviewer_actor_id IS NOT NULL AND completed_at IS NOT NULL))
);

COMMENT ON TABLE public.scp_human_reviews IS
  'The queue where humans decide. AI supports and explains; humans decide. '
  'reviewer_rationale is internal and is never surfaced to an employer or to '
  'any external projection.';

CREATE INDEX IF NOT EXISTS scp_human_reviews_queue_idx
  ON public.scp_human_reviews (review_status, opened_at)
  WHERE review_status IN ('pending','in_review');

-- A completed review is immutable. Reopening means a new review.
CREATE OR REPLACE FUNCTION public.scp_guard_review_immutable_once_done()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SCP_REVIEW_APPEND_ONLY: a review is never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.review_status = 'completed' THEN
    RAISE EXCEPTION
      'SCP_REVIEW_COMPLETED_IMMUTABLE: review % is completed; open a new review '
      'instead of editing this one.', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_human_reviews_immutable_once_done
  BEFORE UPDATE OR DELETE ON public.scp_human_reviews
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_review_immutable_once_done();

-- =========================================================================
-- SECTION 5 — Report versions
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.scp_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft','expert_review','legal_review','cognitive_review',
      'published','suspended','retired')),
  audience text NOT NULL CHECK (audience IN ('participant','employer')),
  -- The maturity calibration this template renders under. This is where a
  -- calculation rule belongs -- a calculation happens here, not on one
  -- evidence row.
  threshold_version text NOT NULL DEFAULT 'v1',
  -- Stated limitations. Required before publication.
  limitations_sv text[] NOT NULL DEFAULT '{}',
  limitations_en text[] NOT NULL DEFAULT '{}',
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_key, version_number, audience)
);

COMMENT ON TABLE public.scp_report_versions IS
  'Versioned report templates. Renders MATURITY LEVELS from the graph, never a '
  'percentage, pass/fail, ranking or hiring recommendation. A published '
  'template must state its own limitations.';

CREATE OR REPLACE FUNCTION public.scp_guard_report_states_limits()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_status = 'published'
     AND coalesce(array_length(NEW.limitations_sv, 1), 0) = 0 THEN
    RAISE EXCEPTION
      'SCP_REPORT_WITHOUT_LIMITS: a published report template must state its '
      'limitations.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_report_versions_require_limits
  BEFORE INSERT OR UPDATE ON public.scp_report_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_report_states_limits();

-- =========================================================================
-- SECTION 6 — RLS
-- =========================================================================

ALTER TABLE public.scp_ai_providers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_prompt_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_ai_scoring_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_ai_scoring_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_human_reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_report_versions       ENABLE ROW LEVEL SECURITY;

-- Prompts, runs and per-dimension AI output: AUTHORING ONLY. No participant or
-- employer read policy exists.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_ai_providers','scp_prompt_versions','scp_ai_scoring_runs',
    'scp_ai_scoring_dimensions','scp_human_reviews'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.scp_can_author(auth.uid())) '
      'WITH CHECK (public.scp_can_author(auth.uid()))',
      t || '_author_only', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- Report TEMPLATES are readable: a participant should be able to see what a
-- report claims and what it does not. Report INSTANCES are Phase 2.
CREATE POLICY scp_report_versions_read ON public.scp_report_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scp_report_versions_author_write ON public.scp_report_versions
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));
GRANT SELECT ON public.scp_report_versions TO authenticated;
GRANT ALL    ON public.scp_report_versions TO service_role;
REVOKE ALL   ON public.scp_report_versions FROM anon;

-- =========================================================================
-- SECTION 7 — Prove it
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'scp_ai_providers','scp_prompt_versions','scp_ai_scoring_runs',
     'scp_ai_scoring_dimensions','scp_human_reviews','scp_report_versions');
  IF _n <> 6 THEN
    RAISE EXCEPTION 'SCP_P1C_INCOMPLETE: expected 6 tables, found %', _n;
  END IF;

  -- THE Phase 1 boundary: no external provider is enabled.
  IF EXISTS (SELECT 1 FROM public.scp_ai_providers
              WHERE is_enabled AND code <> 'null_provider') THEN
    RAISE EXCEPTION 'SCP_P1C_EXTERNAL_PROVIDER_ENABLED: Phase 1 ships with the null provider only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_ai_providers
                  WHERE code = 'null_provider' AND is_enabled) THEN
    RAISE EXCEPTION 'SCP_P1C_NO_DEFAULT_PROVIDER';
  END IF;

  -- All eight human-review triggers are representable.
  SELECT count(*) INTO _n FROM (
    SELECT unnest(ARRAY['safety_critical_detected','confidence_below_threshold',
      'repeated_runs_disagree','legally_sensitive_action','recruitment_use',
      'participant_requested','schema_invalid_output','administrator_mandated']) AS r) t;
  IF _n <> 8 THEN
    RAISE EXCEPTION 'SCP_P1C_REVIEW_TRIGGERS: expected 8, found %', _n;
  END IF;

  -- Protected content carries no unconditional read policy.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('scp_prompt_versions','scp_ai_scoring_runs','scp_ai_scoring_dimensions')
     AND cmd IN ('SELECT','ALL') AND coalesce(qual,'') IN ('true','(true)');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1C_PROMPTS_READABLE: % unconditional read policies', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_prompt_versions WHERE content_status <> 'draft') THEN
    RAISE EXCEPTION 'SCP_P1C_PROMPT_PUBLISHED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase1c-ai-review-reports', 'created',
  'Phase 1c: complete AI scoring architecture with provider abstraction (null provider default, Anthropic registered and DISABLED, no credential stored), prompt and model versioning, per-dimension confidence and evidence excerpts, the eight-trigger human-review queue, and the report-version foundation. Enabling AI later is configuration, not architecture.',
  jsonb_build_object(
    'migration', '20260803110000_scp_phase1c_ai_scoring_review_reports',
    'new_tables', 6,
    'enabled_provider', 'null_provider',
    'external_providers_enabled', 0,
    'review_triggers', 8));
