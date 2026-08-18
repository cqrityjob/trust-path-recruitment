-- =============================================================================
-- H4.1 -- Assessment Blueprint Engine, Phase 1: secure database + backend
-- foundation only. Schema, RLS, SECURITY DEFINER RPCs. No UI, no real launch
-- content, no feature activation. Implements the seven approved architecture
-- documents under docs/architecture/blueprint-engine-*.md (corrected per the
-- Architecture Quality Review -- findings C1/C2/C3/I1-I7 are already baked
-- into the design below, not re-litigated here).
--
-- Two blockers were found during pre-implementation schema inspection that
-- the approved architecture did not anticipate, both resolved with the
-- smallest safe, additive fix (documented fully in the Phase 1 report):
--
--   1. public.assessment_run_reports has no CREATE TABLE anywhere in this
--      repository's migration history, even though save_career_report()
--      (20260718190227_...sql) already reads/writes it successfully against
--      the live project. Resolved with a CREATE TABLE IF NOT EXISTS
--      reconstruction (exact columns/types inferred from that RPC's own
--      INSERT statement) so local disposable-Postgres testing is possible;
--      baseline grants/RLS for that table are ONLY laid down if no policy
--      already exists for it (i.e. never touches whatever is already live).
--   2. public.assessment_runs already grants authenticated
--      SELECT/INSERT/UPDATE/DELETE on "own rows" with no column-level
--      restriction (20260717052749_...sql). Without a guard, a signed-in
--      user could directly UPDATE the new blueprint_version_id /
--      scoring_profile_version_id / requirement_profile_version_id /
--      blueprint_run_stage columns this migration adds, or flip status on a
--      Blueprint-driven run without ever calling compute_standard_result() --
--      the exact same class of gap H3.3/H3.4 closed for employers.status and
--      jobs.status. Resolved the same way: a BEFORE UPDATE trigger that
--      blocks any change to those specific new columns (and to `status` on
--      any row that already has a blueprint_version_id) unless a
--      transaction-local marker is set, which only this migration's RPCs
--      ever set. Every EXISTING column and the public assessment's own
--      completion path (save_career_report()) are completely unaffected.
--
-- Two small, obviously-necessary RPC groups were implied by the architecture
-- but not spelled out as literal entries in the Backend document's RPC
-- inventory table; both are additive, Phase-1-scoped, and not later-phase
-- functionality:
--   - attach/detach RPCs to populate the many-to-many association tables
--     (question<->evidence signal, question<->module, module<->competency,
--     scoring/requirement weight upserts) -- these tables cannot be reached
--     any other way once direct client writes are (correctly) forbidden.
--   - public.assessment_run_answers, a per-question-version answer-storage
--     table -- required for "answers stored" / "finalize answers" /
--     "compute Standard Competency Result from answers" to be possible at
--     all; the architecture's Backend doc described this pipeline stage but
--     never gave it a literal table.
--
-- Additive only. No existing table's existing columns are altered or
-- dropped. No existing RLS policy, grant, or RPC is modified. No existing
-- row's data changes.
--
-- Rollback: DROP every object created below, in reverse dependency order
-- (see Phase 1 report). Nothing pre-existing is altered, so rollback cannot
-- lose pre-existing data.
-- =============================================================================


-- #############################################################################
-- SECTION 1 -- Lookup tables: assessment_purposes, assessment_levels (fixes I1)
-- #############################################################################

CREATE TABLE public.assessment_purposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  is_assessable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assessment_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  is_assessable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Minimum seed for Phase 1 tests and the approved MVP: Recruitment is the
-- only Purpose with an employer-facing journey planned (Phase 3/4, not this
-- phase); the other five Purpose values from the approved architecture are
-- inserted so the lookup table matches the approved vocabulary, but are not
-- flagged is_assessable -- no journey consumes them yet. career_self_assessment
-- is seeded per the approved public-assessment convergence path (DDD §6) so
-- that value exists when that later, separately-scoped initiative begins;
-- it is not used by anything in Phase 1.
INSERT INTO public.assessment_purposes (slug, title_sv, title_en, is_assessable) VALUES
  ('recruitment',                'Rekrytering',                 'Recruitment',                 true),
  ('annual_competency_review',   'Årlig kompetensöversyn',      'Annual Competency Review',    false),
  ('supplier_audit',             'Leverantörsgranskning',       'Supplier Audit',              false),
  ('post_training_evaluation',   'Utvärdering efter utbildning','Post-Training Evaluation',    false),
  ('promotion_assessment',       'Befordringsbedömning',        'Promotion Assessment',        false),
  ('certification',              'Certifiering',                'Certification',               false),
  ('career_self_assessment',     'Karriärsjälvskattning',       'Career Self-Assessment',      false);

INSERT INTO public.assessment_levels (slug, title_sv, title_en, is_assessable) VALUES
  ('baseline', 'Baslinje', 'Baseline', true),
  ('standard', 'Standard', 'Standard', false),
  ('advanced', 'Avancerad', 'Advanced', false);

GRANT SELECT ON public.assessment_purposes, public.assessment_levels TO anon, authenticated;
GRANT ALL ON public.assessment_purposes, public.assessment_levels TO service_role;

ALTER TABLE public.assessment_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessment_purposes_public_read" ON public.assessment_purposes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "assessment_levels_public_read" ON public.assessment_levels
  FOR SELECT TO anon, authenticated USING (true);

COMMENT ON TABLE public.assessment_purposes IS
  'H4.1 Blueprint Engine. Data-driven Purpose vocabulary (fixes architecture '
  'finding I1) -- adding a future Purpose is a data insert, never a schema '
  'or code change. No authenticated write grant exists; content is seeded '
  'by migration only in Phase 1.';
COMMENT ON TABLE public.assessment_levels IS
  'H4.1 Blueprint Engine. Data-driven Assessment Level vocabulary (fixes '
  'architecture finding I1), same convention as assessment_purposes.';


-- #############################################################################
-- SECTION 2 -- Curation flags on the existing Career Intelligence Graph
-- #############################################################################

ALTER TABLE public.cig_professions
  ADD COLUMN is_assessable boolean NOT NULL DEFAULT false;

ALTER TABLE public.cig_work_environments
  ADD COLUMN is_assessable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cig_professions.is_assessable IS
  'H4.1 Blueprint Engine. Curates which roles appear in the Universal '
  'Assessment Builder''s Role dropdown. No row is flagged true by this '
  'migration -- real launch-catalogue curation (Security Officer / Security '
  'Supervisor) is Phase 2 content work, not Phase 1 schema work.';
COMMENT ON COLUMN public.cig_work_environments.is_assessable IS
  'H4.1 Blueprint Engine. Same convention as cig_professions.is_assessable.';


-- #############################################################################
-- SECTION 3 -- Versioned libraries: Evidence Signals, Questions, Modules
-- #############################################################################

CREATE TABLE public.evidence_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft','published','archived')),
  question_type text NOT NULL CHECK (question_type IN ('single','multi','rating','scenario')),
  scale_min integer,
  scale_max integer,
  text_sv text NOT NULL,
  text_en text NOT NULL,
  options jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, version_number)
);

CREATE TABLE public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.module_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft','published','archived')),
  title_sv text NOT NULL,
  title_en text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, version_number)
);

CREATE INDEX question_versions_question_idx ON public.question_versions (question_id, version_number DESC);
CREATE INDEX module_versions_module_idx ON public.module_versions (module_id, version_number DESC);


-- #############################################################################
-- SECTION 4 -- Association entities (the many-to-many layer). ON DELETE
-- RESTRICT on every FK to a *_versions table (fixes C3) -- a published,
-- possibly historically-referenced version row cannot be deleted out from
-- under an association, only archived.
-- #############################################################################

CREATE TABLE public.question_version_evidence_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  evidence_signal_id uuid NOT NULL REFERENCES public.evidence_signals(id) ON DELETE RESTRICT,
  signal_weight numeric NOT NULL DEFAULT 1.0,
  signal_polarity smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_version_id, evidence_signal_id)
);

CREATE TABLE public.question_version_module_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  module_version_id uuid NOT NULL REFERENCES public.module_versions(id) ON DELETE RESTRICT,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_version_id, module_version_id)
);

CREATE TABLE public.module_version_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_version_id uuid NOT NULL REFERENCES public.module_versions(id) ON DELETE RESTRICT,
  competency_id uuid NOT NULL REFERENCES public.cig_competencies(id) ON DELETE RESTRICT,
  importance smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_version_id, competency_id)
);

-- Advisory baseline weighting for Environment, mirroring cig_profession_competency_req
-- for Role. Read-only, authoring-time advisory data only (fixes I4) -- consumed by the
-- future Builder UI (Phase 3) to suggest Modules, never read by the run-time scoring
-- pipeline. References cig_* rows directly (not a *_versions table) so ON DELETE CASCADE
-- here carries none of the historical-reproducibility risk C3 addresses.
CREATE TABLE public.environment_competency_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid NOT NULL REFERENCES public.cig_work_environments(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.cig_competencies(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment_id, competency_id)
);

CREATE INDEX qves_question_version_idx ON public.question_version_evidence_signals (question_version_id);
CREATE INDEX qvmv_module_version_idx ON public.question_version_module_versions (module_version_id);
CREATE INDEX mvc_module_version_idx ON public.module_version_competencies (module_version_id);


-- #############################################################################
-- SECTION 5 -- Blueprints, Scoring Profiles, Requirement Profiles
-- #############################################################################

CREATE TABLE public.blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  purpose_id uuid NOT NULL REFERENCES public.assessment_purposes(id),
  role_id uuid NOT NULL REFERENCES public.cig_professions(id),
  environment_id uuid NOT NULL REFERENCES public.cig_work_environments(id),
  assessment_level_id uuid NOT NULL REFERENCES public.assessment_levels(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blueprint_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft','published','archived')),
  default_scoring_profile_version_id uuid,
  assessment_version_id uuid,  -- populated at publish time, C1 bridge, FK added in SECTION 8
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blueprint_id, version_number)
);

CREATE TABLE public.blueprint_version_module_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_version_id uuid NOT NULL REFERENCES public.blueprint_versions(id) ON DELETE RESTRICT,
  module_version_id uuid NOT NULL REFERENCES public.module_versions(id) ON DELETE RESTRICT,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blueprint_version_id, module_version_id)
);

CREATE TABLE public.blueprint_version_question_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_version_id uuid NOT NULL REFERENCES public.blueprint_versions(id) ON DELETE RESTRICT,
  question_version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  override_type text NOT NULL CHECK (override_type IN ('include','exclude')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blueprint_version_id, question_version_id)
);

CREATE TABLE public.scoring_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_version_id uuid NOT NULL REFERENCES public.blueprint_versions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blueprint_version_id, version_number)
);

ALTER TABLE public.blueprint_versions
  ADD CONSTRAINT blueprint_versions_default_scoring_profile_fk
  FOREIGN KEY (default_scoring_profile_version_id)
  REFERENCES public.scoring_profile_versions(id) ON DELETE RESTRICT;

-- Fixes I3: exactly one PUBLISHED Scoring Profile Version per Blueprint
-- Version at a time -- structural, not just RPC-enforced.
CREATE UNIQUE INDEX scoring_profile_versions_one_published_per_blueprint_version
  ON public.scoring_profile_versions (blueprint_version_id)
  WHERE content_status = 'published';

CREATE TABLE public.scoring_profile_version_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_profile_version_id uuid NOT NULL REFERENCES public.scoring_profile_versions(id) ON DELETE RESTRICT,
  evidence_signal_id uuid NOT NULL REFERENCES public.evidence_signals(id) ON DELETE RESTRICT,
  weight numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scoring_profile_version_id, evidence_signal_id)
);

CREATE TABLE public.requirement_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employer_id, slug)
);

CREATE TABLE public.requirement_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_profile_id uuid NOT NULL REFERENCES public.requirement_profiles(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft','published','archived')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_profile_id, version_number)
);

CREATE TABLE public.requirement_profile_version_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_profile_version_id uuid NOT NULL REFERENCES public.requirement_profile_versions(id) ON DELETE RESTRICT,
  competency_id uuid NOT NULL REFERENCES public.cig_competencies(id) ON DELETE RESTRICT,
  importance text NOT NULL CHECK (importance IN ('low','medium','high','critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_profile_version_id, competency_id)
);

CREATE INDEX blueprint_versions_blueprint_idx ON public.blueprint_versions (blueprint_id, version_number DESC);
CREATE INDEX bvmv_blueprint_version_idx ON public.blueprint_version_module_versions (blueprint_version_id);
CREATE INDEX bvqo_blueprint_version_idx ON public.blueprint_version_question_overrides (blueprint_version_id);
CREATE INDEX spv_blueprint_version_idx ON public.scoring_profile_versions (blueprint_version_id, version_number DESC);
CREATE INDEX spvw_scoring_profile_version_idx ON public.scoring_profile_version_weights (scoring_profile_version_id);
CREATE INDEX requirement_profiles_employer_idx ON public.requirement_profiles (employer_id);
CREATE INDEX rpv_requirement_profile_idx ON public.requirement_profile_versions (requirement_profile_id, version_number DESC);
CREATE INDEX rpvw_requirement_profile_version_idx ON public.requirement_profile_version_weights (requirement_profile_version_id);


-- #############################################################################
-- SECTION 6 -- Answer storage (necessary addition -- see header note; not a
-- redesign, the pipeline the architecture describes cannot function without it)
-- #############################################################################

CREATE TABLE public.assessment_run_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.assessment_runs(id) ON DELETE CASCADE,
  question_version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  answer_value jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_version_id)
);

CREATE INDEX assessment_run_answers_run_idx ON public.assessment_run_answers (run_id);

COMMENT ON TABLE public.assessment_run_answers IS
  'H4.1 Blueprint Engine. Per-question-version answer storage for '
  'Blueprint-driven runs (blueprint_version_id IS NOT NULL on the parent '
  'assessment_runs row). Not used by the public 16-question assessment, '
  'which stores its result via result_summary on assessment_runs directly, '
  'unchanged. ON DELETE CASCADE from assessment_runs only (deleting a run '
  'deletes its own answers -- normal ownership cleanup, not a historical- '
  'reproducibility concern since a completed run''s answers are never '
  'deleted independently of the run itself); ON DELETE RESTRICT to '
  'question_versions, consistent with every other reference to a published '
  'version.';


-- #############################################################################
-- SECTION 7 -- Content-authoring audit tables (one per domain, per the
-- established H3.x convention -- never a shared generic audit_logs table)
-- #############################################################################

CREATE TABLE public.question_content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  question_version_id uuid REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.module_content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE RESTRICT,
  module_version_id uuid REFERENCES public.module_versions(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.blueprint_content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE RESTRICT,
  blueprint_version_id uuid REFERENCES public.blueprint_versions(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.scoring_profile_content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_profile_version_id uuid NOT NULL REFERENCES public.scoring_profile_versions(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.requirement_profile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_profile_id uuid NOT NULL REFERENCES public.requirement_profiles(id) ON DELETE RESTRICT,
  requirement_profile_version_id uuid REFERENCES public.requirement_profile_versions(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX question_content_events_qv_idx ON public.question_content_events (question_version_id);
CREATE INDEX module_content_events_mv_idx ON public.module_content_events (module_version_id);
CREATE INDEX blueprint_content_events_bv_idx ON public.blueprint_content_events (blueprint_version_id);
CREATE INDEX scoring_profile_content_events_spv_idx ON public.scoring_profile_content_events (scoring_profile_version_id);
CREATE INDEX requirement_profile_events_rpv_idx ON public.requirement_profile_events (requirement_profile_version_id);


-- #############################################################################
-- SECTION 8 -- Catalog bridge (fixes C1) + extend assessment_runs /
-- assessment_run_reports (fixes C2 -- no new status value, additive
-- blueprint_run_stage column only) + close the direct-update bypass on the
-- new columns (blocker #2, see header note).
-- #############################################################################

-- --- 8a. Reconstruct assessment_run_reports if genuinely absent locally.
-- No-ops entirely (touches nothing) if the table -- and therefore its real,
-- already-live grants/RLS -- already exists, which it does in any environment
-- where save_career_report() (20260718190227_...sql) already runs.
CREATE TABLE IF NOT EXISTS public.assessment_run_reports (
  run_id uuid PRIMARY KEY REFERENCES public.assessment_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completion_id uuid NOT NULL,
  report_version text NOT NULL,
  engine_version text NOT NULL,
  graph_version text NOT NULL,
  profile_version text NOT NULL,
  locale text NOT NULL DEFAULT 'sv',
  inputs_hash text NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, completion_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assessment_run_reports'
  ) THEN
    EXECUTE 'ALTER TABLE public.assessment_run_reports ENABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT ON public.assessment_run_reports TO authenticated';
    EXECUTE 'GRANT ALL ON public.assessment_run_reports TO service_role';
    EXECUTE $p$CREATE POLICY "own reports select" ON public.assessment_run_reports FOR SELECT TO authenticated USING (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY "own reports insert" ON public.assessment_run_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
END $$;

COMMENT ON TABLE public.assessment_run_reports IS
  'Reconstructed by H4.1 ONLY if not already present (CREATE TABLE IF NOT '
  'EXISTS) -- this table''s original CREATE TABLE is absent from this '
  'repository''s migration history even though save_career_report() '
  '(20260718190227_...sql) already depends on it; see the H4.1 migration '
  'header and Phase 1 report for full evidence and disposition. Baseline '
  'grants/RLS below are laid down only when no policy already exists for '
  'this table (i.e. never touches a pre-existing live configuration).';

-- --- 8b. Blueprint <-> existing catalog bridge FK. blueprints.assessment_id
-- is populated by create_blueprint_draft() (deterministic: 'blueprint:' ||
-- slug, safe because blueprints.slug is itself UNIQUE) so
-- publish_blueprint_version() can create the matching assessment_versions
-- row without a second lookup, and so a Blueprint's mirrored catalog entry
-- is visible directly on the blueprints row.
ALTER TABLE public.blueprints
  ADD COLUMN assessment_id text REFERENCES public.assessments(id) ON DELETE RESTRICT;

ALTER TABLE public.blueprint_versions
  ADD CONSTRAINT blueprint_versions_assessment_version_fk
  FOREIGN KEY (assessment_version_id)
  REFERENCES public.assessment_versions(id) ON DELETE RESTRICT;

-- --- 8c. Extend assessment_runs. No existing column, value, or CHECK
-- constraint is touched (fixes C2 -- reuses 'in_progress'/'completed'/
-- 'abandoned' unchanged).
ALTER TABLE public.assessment_runs
  ADD COLUMN blueprint_version_id uuid NULL REFERENCES public.blueprint_versions(id) ON DELETE RESTRICT,
  ADD COLUMN scoring_profile_version_id uuid NULL REFERENCES public.scoring_profile_versions(id) ON DELETE RESTRICT,
  ADD COLUMN requirement_profile_version_id uuid NULL REFERENCES public.requirement_profile_versions(id) ON DELETE RESTRICT,
  ADD COLUMN blueprint_run_stage text NULL
    CHECK (blueprint_run_stage IN ('answers_submitted','standard_result_computed','requirement_match_computed')),
  ADD CONSTRAINT assessment_runs_blueprint_stage_requires_blueprint
    CHECK (blueprint_run_stage IS NULL OR blueprint_version_id IS NOT NULL);

CREATE INDEX assessment_runs_blueprint_version_idx ON public.assessment_runs (blueprint_version_id) WHERE blueprint_version_id IS NOT NULL;

-- --- 8d. Extend assessment_run_reports with the (A)/(B) separation +
-- reserved AI narrative column. Existing `report` column is untouched and
-- keeps serving the public assessment exactly as today.
ALTER TABLE public.assessment_run_reports
  ADD COLUMN standard_result jsonb NULL,
  ADD COLUMN requirement_match jsonb NULL,
  ADD COLUMN ai_narrative text NULL;

-- --- 8e. Close the direct-update bypass (blocker #2). Mirrors the exact
-- transaction-local-marker pattern already proven in H3.3
-- (employers_validate_before_write) and H3.4 (jobs_validate_before_write /
-- reject_job). Only fires when a Blueprint-Engine-owned column is changing,
-- or when `status` changes on a row that already has a blueprint_version_id
-- -- every existing column, and the entire public-assessment completion path
-- (save_career_report(), which never touches these new columns), is
-- completely unaffected.
CREATE OR REPLACE FUNCTION public.assessment_runs_blueprint_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF (
    NEW.blueprint_version_id IS DISTINCT FROM OLD.blueprint_version_id
    OR NEW.scoring_profile_version_id IS DISTINCT FROM OLD.scoring_profile_version_id
    OR NEW.requirement_profile_version_id IS DISTINCT FROM OLD.requirement_profile_version_id
    OR NEW.blueprint_run_stage IS DISTINCT FROM OLD.blueprint_run_stage
    OR (OLD.blueprint_version_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status)
  ) THEN
    IF current_setting('app.blueprint_run_transition_in_progress', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Blueprint-driven assessment_runs fields can only change via approved Assessment Blueprint Engine RPCs'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER assessment_runs_blueprint_guard_trg
  BEFORE UPDATE ON public.assessment_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.assessment_runs_blueprint_guard();

COMMENT ON FUNCTION public.assessment_runs_blueprint_guard() IS
  'H4.1 integrity guard. assessment_runs already grants authenticated a '
  'broad "own row" UPDATE (20260717052749_...sql) with no column-level '
  'restriction. Without this trigger, a signed-in user could directly '
  'rewrite blueprint_version_id/scoring_profile_version_id/'
  'requirement_profile_version_id/blueprint_run_stage, or flip status on a '
  'Blueprint-driven run, bypassing every RPC in this migration -- the same '
  'class of gap closed for employers.status (H3.3) and jobs.status=rejected '
  '(H3.4). The transaction-local marker app.blueprint_run_transition_in_'
  'progress is set only inside this migration''s own RPCs, immediately '
  'before their internal UPDATE, and reverts automatically at end of '
  'transaction. Every existing column and the public assessment''s own '
  'completion path (save_career_report()) are unaffected.';


-- #############################################################################
-- SECTION 9 -- RLS + grants for every new table. Least-privilege by
-- construction: no table in this section grants authenticated any
-- INSERT/UPDATE/DELETE at all -- every write happens inside a SECURITY
-- DEFINER RPC, which executes as the function owner, not as the invoking
-- role, and therefore needs no such grant. This makes the "no direct
-- authenticated write on protected tables" requirement structural rather
-- than merely RLS-policy-based (fixes C3's DELETE gap the same way, with an
-- extra layer: there is no DELETE grant to revoke a policy against).
-- #############################################################################

-- --- Leaf vocabulary (not versioned): evidence_signals.
GRANT SELECT ON public.evidence_signals TO authenticated;
GRANT ALL ON public.evidence_signals TO service_role;
ALTER TABLE public.evidence_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evidence_signals_authenticated_read" ON public.evidence_signals
  FOR SELECT TO authenticated USING (true);

-- --- Questions / Question Versions.
GRANT SELECT ON public.questions, public.question_versions TO authenticated;
GRANT ALL ON public.questions, public.question_versions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_authenticated_read" ON public.questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "question_versions_read" ON public.question_versions
  FOR SELECT TO authenticated
  USING (content_status = 'published' OR public.is_platform_admin(auth.uid()));

-- --- Modules / Module Versions.
GRANT SELECT ON public.modules, public.module_versions TO authenticated;
GRANT ALL ON public.modules, public.module_versions TO service_role;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules_authenticated_read" ON public.modules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "module_versions_read" ON public.module_versions
  FOR SELECT TO authenticated
  USING (content_status = 'published' OR public.is_platform_admin(auth.uid()));

-- --- Association tables (question<->evidence, question<->module,
-- module<->competency, environment advisory requirements). No non-admin
-- consumer exists in Phase 1 (Phase 3's Builder UI will read these through
-- its own server-side loader); admin-only direct SELECT keeps this narrow
-- rather than speculatively opening broader access before a real consumer
-- is built.
GRANT SELECT ON public.question_version_evidence_signals, public.question_version_module_versions,
  public.module_version_competencies, public.environment_competency_requirements TO authenticated;
GRANT ALL ON public.question_version_evidence_signals, public.question_version_module_versions,
  public.module_version_competencies, public.environment_competency_requirements TO service_role;
ALTER TABLE public.question_version_evidence_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_version_module_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_version_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_competency_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qves_admin_read" ON public.question_version_evidence_signals
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "qvmv_admin_read" ON public.question_version_module_versions
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "mvc_admin_read" ON public.module_version_competencies
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "ecr_admin_read" ON public.environment_competency_requirements
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- --- Blueprints / Blueprint Versions and their associations.
GRANT SELECT ON public.blueprints, public.blueprint_versions,
  public.blueprint_version_module_versions, public.blueprint_version_question_overrides TO authenticated;
GRANT ALL ON public.blueprints, public.blueprint_versions,
  public.blueprint_version_module_versions, public.blueprint_version_question_overrides TO service_role;
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_version_module_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_version_question_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blueprints_authenticated_read" ON public.blueprints
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "blueprint_versions_read" ON public.blueprint_versions
  FOR SELECT TO authenticated
  USING (content_status = 'published' OR public.is_platform_admin(auth.uid()));
CREATE POLICY "bvmv_admin_read" ON public.blueprint_version_module_versions
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "bvqo_admin_read" ON public.blueprint_version_question_overrides
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- --- Scoring Profiles (internal detail; admin-only direct read, matching
-- the fact no employer-facing consumer of raw scoring weights exists or
-- should exist in Phase 1 -- employers see RESULTS via the report, never
-- the scoring rules themselves).
GRANT SELECT ON public.scoring_profile_versions, public.scoring_profile_version_weights TO authenticated;
GRANT ALL ON public.scoring_profile_versions, public.scoring_profile_version_weights TO service_role;
ALTER TABLE public.scoring_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_profile_version_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scoring_profile_versions_admin_read" ON public.scoring_profile_versions
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "spvw_admin_read" ON public.scoring_profile_version_weights
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- --- Requirement Profiles: fixes I6. Published versions readable by the
-- owning employer's active members OR platform admins; draft versions
-- admin-only, regardless of organisation membership.
GRANT SELECT ON public.requirement_profiles, public.requirement_profile_versions,
  public.requirement_profile_version_weights TO authenticated;
GRANT ALL ON public.requirement_profiles, public.requirement_profile_versions,
  public.requirement_profile_version_weights TO service_role;
ALTER TABLE public.requirement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_profile_version_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requirement_profiles_read" ON public.requirement_profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_employer_role(auth.uid(), employer_id));

CREATE POLICY "requirement_profile_versions_read" ON public.requirement_profile_versions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      content_status = 'published'
      AND EXISTS (
        SELECT 1 FROM public.requirement_profiles rp
        WHERE rp.id = requirement_profile_id
          AND public.has_employer_role(auth.uid(), rp.employer_id)
      )
    )
  );

CREATE POLICY "rpvw_read" ON public.requirement_profile_version_weights
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.requirement_profile_versions rpv
      JOIN public.requirement_profiles rp ON rp.id = rpv.requirement_profile_id
      WHERE rpv.id = requirement_profile_version_id
        AND rpv.content_status = 'published'
        AND public.has_employer_role(auth.uid(), rp.employer_id)
    )
  );

-- --- Answer storage: a participant reads only their own answers; platform
-- admins can read any (support/audit). No direct write grant -- only
-- record_assessment_answer() writes, as the function owner.
GRANT SELECT ON public.assessment_run_answers TO authenticated;
GRANT ALL ON public.assessment_run_answers TO service_role;
ALTER TABLE public.assessment_run_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessment_run_answers_own_read" ON public.assessment_run_answers
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.assessment_runs ar WHERE ar.id = run_id AND ar.user_id = auth.uid())
  );

-- --- Content-authoring audit tables: admin-only, no client write grant at all.
GRANT SELECT ON public.question_content_events, public.module_content_events,
  public.blueprint_content_events, public.scoring_profile_content_events,
  public.requirement_profile_events TO authenticated;
GRANT ALL ON public.question_content_events, public.module_content_events,
  public.blueprint_content_events, public.scoring_profile_content_events,
  public.requirement_profile_events TO service_role;
ALTER TABLE public.question_content_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_content_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_content_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_profile_content_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_profile_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "question_content_events_admin_read" ON public.question_content_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "module_content_events_admin_read" ON public.module_content_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "blueprint_content_events_admin_read" ON public.blueprint_content_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "scoring_profile_content_events_admin_read" ON public.scoring_profile_content_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "requirement_profile_events_admin_read" ON public.requirement_profile_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));


-- #############################################################################
-- SECTION 10 -- SECURITY DEFINER RPCs. One per controlled state transition,
-- server-derived actor identity, hardcoded allow-lists, atomic write + audit
-- event, explicit search_path, least-privilege EXECUTE grants. Every RPC
-- below follows moderate_employer()/reject_job()/set_application_status()'s
-- exact shape.
-- #############################################################################


-- =============================================================================
-- 10a. Questions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_question_draft(
  _slug text,
  _question_type text,
  _scale_min integer,
  _scale_max integer,
  _text_sv text,
  _text_en text,
  _options jsonb DEFAULT NULL
)
RETURNS TABLE (question_id uuid, question_version_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _question_id uuid;
  _question_version_id uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;
  IF _question_type NOT IN ('single','multi','rating','scenario') THEN
    RAISE EXCEPTION 'Invalid question_type %', _question_type USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(_text_sv), '') IS NULL OR NULLIF(btrim(_text_en), '') IS NULL THEN
    RAISE EXCEPTION 'text_sv and text_en are required' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.questions (slug) VALUES (_slug) RETURNING id INTO _question_id;
  INSERT INTO public.question_versions (
    question_id, version_number, question_type, scale_min, scale_max, text_sv, text_en, options
  ) VALUES (
    _question_id, 1, _question_type, _scale_min, _scale_max, _text_sv, _text_en, _options
  ) RETURNING id INTO _question_version_id;

  INSERT INTO public.question_content_events (question_id, question_version_id, action, actor_id)
  VALUES (_question_id, _question_version_id, 'draft_created', _caller);

  RETURN QUERY SELECT _question_id, _question_version_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_question_draft(text, text, integer, integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_question_draft(text, text, integer, integer, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_question_version(_question_version_id uuid)
RETURNS TABLE (question_version_id uuid, content_status text, published_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _qv public.question_versions%ROWTYPE;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  SELECT * INTO _qv FROM public.question_versions WHERE id = _question_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question version not found';
  END IF;
  IF _qv.content_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft question version can be published (current status: %)', _qv.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.question_versions
  SET content_status = 'published', published_at = _now, updated_at = _now
  WHERE id = _question_version_id;

  INSERT INTO public.question_content_events (question_id, question_version_id, action, actor_id)
  VALUES (_qv.question_id, _question_version_id, 'published', _caller);

  RETURN QUERY SELECT _question_version_id, 'published'::text, _now;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_question_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_question_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_question_version(_question_version_id uuid)
RETURNS TABLE (question_version_id uuid, content_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _qv public.question_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT * INTO _qv FROM public.question_versions WHERE id = _question_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question version not found'; END IF;
  IF _qv.content_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published question version can be archived (current status: %)', _qv.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.question_versions SET content_status = 'archived', updated_at = now() WHERE id = _question_version_id;
  INSERT INTO public.question_content_events (question_id, question_version_id, action, actor_id)
  VALUES (_qv.question_id, _question_version_id, 'archived', _caller);

  RETURN QUERY SELECT _question_version_id, 'archived'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_question_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_question_version(uuid) TO authenticated;


-- =============================================================================
-- 10b. Modules
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_module_draft(_slug text, _title_sv text, _title_en text)
RETURNS TABLE (module_id uuid, module_version_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _module_id uuid;
  _module_version_id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;
  IF NULLIF(btrim(_title_sv), '') IS NULL OR NULLIF(btrim(_title_en), '') IS NULL THEN
    RAISE EXCEPTION 'title_sv and title_en are required' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.modules (slug) VALUES (_slug) RETURNING id INTO _module_id;
  INSERT INTO public.module_versions (module_id, version_number, title_sv, title_en)
  VALUES (_module_id, 1, _title_sv, _title_en) RETURNING id INTO _module_version_id;

  INSERT INTO public.module_content_events (module_id, module_version_id, action, actor_id)
  VALUES (_module_id, _module_version_id, 'draft_created', _caller);

  RETURN QUERY SELECT _module_id, _module_version_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_module_draft(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_module_draft(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_module_version(_module_version_id uuid)
RETURNS TABLE (module_version_id uuid, content_status text, published_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _mv public.module_versions%ROWTYPE;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT * INTO _mv FROM public.module_versions WHERE id = _module_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module version not found'; END IF;
  IF _mv.content_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft module version can be published (current status: %)', _mv.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.question_version_module_versions WHERE module_version_id = _module_version_id) THEN
    RAISE EXCEPTION 'Cannot publish a module version with zero attached question versions'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.module_versions SET content_status = 'published', published_at = _now, updated_at = _now
  WHERE id = _module_version_id;

  INSERT INTO public.module_content_events (module_id, module_version_id, action, actor_id)
  VALUES (_mv.module_id, _module_version_id, 'published', _caller);

  RETURN QUERY SELECT _module_version_id, 'published'::text, _now;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_module_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_module_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_module_version(_module_version_id uuid)
RETURNS TABLE (module_version_id uuid, content_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _mv public.module_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT * INTO _mv FROM public.module_versions WHERE id = _module_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module version not found'; END IF;
  IF _mv.content_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published module version can be archived (current status: %)', _mv.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.module_versions SET content_status = 'archived', updated_at = now() WHERE id = _module_version_id;
  INSERT INTO public.module_content_events (module_id, module_version_id, action, actor_id)
  VALUES (_mv.module_id, _module_version_id, 'archived', _caller);

  RETURN QUERY SELECT _module_version_id, 'archived'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_module_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_module_version(uuid) TO authenticated;


-- =============================================================================
-- 10c. Association-populating RPCs. Necessary additions (see migration
-- header note) -- these tables are unreachable any other way once direct
-- client writes are correctly forbidden. All admin-only, all restricted to
-- while the owning *_version row is still 'draft' (a published version's
-- composition is immutable -- see the versioning guarantee in DB Schema §8).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_evidence_signal(
  _slug text, _title_sv text, _title_en text, _description_sv text DEFAULT NULL, _description_en text DEFAULT NULL
)
RETURNS TABLE (evidence_signal_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  INSERT INTO public.evidence_signals (slug, title_sv, title_en, description_sv, description_en)
  VALUES (_slug, _title_sv, _title_en, _description_sv, _description_en)
  RETURNING id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_evidence_signal(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_evidence_signal(text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_evidence_signal_to_question_version(
  _question_version_id uuid, _evidence_signal_id uuid, _weight numeric DEFAULT 1.0, _polarity smallint DEFAULT 1
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _status text;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _status FROM public.question_versions WHERE id = _question_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only attach evidence signals to a draft question version' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.question_version_evidence_signals (question_version_id, evidence_signal_id, signal_weight, signal_polarity)
  VALUES (_question_version_id, _evidence_signal_id, _weight, _polarity)
  ON CONFLICT (question_version_id, evidence_signal_id) DO UPDATE SET signal_weight = EXCLUDED.signal_weight, signal_polarity = EXCLUDED.signal_polarity
  RETURNING question_version_evidence_signals.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_evidence_signal_to_question_version(uuid, uuid, numeric, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_evidence_signal_to_question_version(uuid, uuid, numeric, smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.detach_evidence_signal_from_question_version(_question_version_id uuid, _evidence_signal_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _status text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _status FROM public.question_versions WHERE id = _question_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only detach evidence signals from a draft question version' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.question_version_evidence_signals
  WHERE question_version_id = _question_version_id AND evidence_signal_id = _evidence_signal_id;
END;
$$;
REVOKE ALL ON FUNCTION public.detach_evidence_signal_from_question_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_evidence_signal_from_question_version(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_question_to_module_version(
  _module_version_id uuid, _question_version_id uuid, _display_order integer DEFAULT 0
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _module_status text;
  _question_status text;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _module_status FROM public.module_versions WHERE id = _module_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module version not found'; END IF;
  IF _module_status <> 'draft' THEN
    RAISE EXCEPTION 'Can only attach questions to a draft module version' USING ERRCODE = 'check_violation';
  END IF;

  SELECT content_status INTO _question_status FROM public.question_versions WHERE id = _question_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question version not found'; END IF;
  IF _question_status <> 'published' THEN
    RAISE EXCEPTION 'A module can only include a published question version' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.question_version_module_versions (question_version_id, module_version_id, display_order)
  VALUES (_question_version_id, _module_version_id, _display_order)
  ON CONFLICT (question_version_id, module_version_id) DO UPDATE SET display_order = EXCLUDED.display_order
  RETURNING question_version_module_versions.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_question_to_module_version(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_question_to_module_version(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.detach_question_from_module_version(_module_version_id uuid, _question_version_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _status text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _status FROM public.module_versions WHERE id = _module_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only detach questions from a draft module version' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.question_version_module_versions
  WHERE module_version_id = _module_version_id AND question_version_id = _question_version_id;
END;
$$;
REVOKE ALL ON FUNCTION public.detach_question_from_module_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_question_from_module_version(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_competency_to_module_version(
  _module_version_id uuid, _competency_id uuid, _importance smallint DEFAULT 1
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _status text;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _status FROM public.module_versions WHERE id = _module_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only attach competencies to a draft module version' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.module_version_competencies (module_version_id, competency_id, importance)
  VALUES (_module_version_id, _competency_id, _importance)
  ON CONFLICT (module_version_id, competency_id) DO UPDATE SET importance = EXCLUDED.importance
  RETURNING module_version_competencies.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_competency_to_module_version(uuid, uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_competency_to_module_version(uuid, uuid, smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.detach_competency_from_module_version(_module_version_id uuid, _competency_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _status text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _status FROM public.module_versions WHERE id = _module_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only detach competencies from a draft module version' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.module_version_competencies
  WHERE module_version_id = _module_version_id AND competency_id = _competency_id;
END;
$$;
REVOKE ALL ON FUNCTION public.detach_competency_from_module_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_competency_from_module_version(uuid, uuid) TO authenticated;


-- =============================================================================
-- 10d. Blueprints. create_blueprint_draft() and publish_blueprint_version()
-- implement the C1 catalog bridge (mirrored assessments/assessment_versions
-- rows), atomically and auditably, exactly as specified in the corrected
-- architecture (DB Schema §5, Backend §3).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_blueprint_draft(
  _slug text, _purpose_id uuid, _role_id uuid, _environment_id uuid, _assessment_level_id uuid,
  _assessment_name_sv text, _assessment_name_en text
)
RETURNS TABLE (blueprint_id uuid, blueprint_version_id uuid, assessment_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _blueprint_id uuid;
  _blueprint_version_id uuid;
  _assessment_id text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.assessment_purposes WHERE id = _purpose_id AND is_assessable) THEN
    RAISE EXCEPTION 'Purpose is not curated as assessable' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cig_professions WHERE id = _role_id AND is_assessable) THEN
    RAISE EXCEPTION 'Role is not curated as assessable' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cig_work_environments WHERE id = _environment_id AND is_assessable) THEN
    RAISE EXCEPTION 'Environment is not curated as assessable' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assessment_levels WHERE id = _assessment_level_id AND is_assessable) THEN
    RAISE EXCEPTION 'Assessment level is not curated as assessable' USING ERRCODE = 'check_violation';
  END IF;

  _assessment_id := 'blueprint:' || _slug;

  -- C1 bridge: mirror this Blueprint into the pre-existing top-level
  -- assessments catalog, kind='professional' (already an allowed value,
  -- distinguishing org-side Blueprint assessments from the public
  -- 'career_guidance' one). No parallel catalog is created.
  INSERT INTO public.assessments (id, name_sv, name_en, kind)
  VALUES (_assessment_id, _assessment_name_sv, _assessment_name_en, 'professional');

  INSERT INTO public.blueprints (slug, purpose_id, role_id, environment_id, assessment_level_id, assessment_id)
  VALUES (_slug, _purpose_id, _role_id, _environment_id, _assessment_level_id, _assessment_id)
  RETURNING id INTO _blueprint_id;

  INSERT INTO public.blueprint_versions (blueprint_id, version_number)
  VALUES (_blueprint_id, 1)
  RETURNING id INTO _blueprint_version_id;

  INSERT INTO public.blueprint_content_events (blueprint_id, blueprint_version_id, action, actor_id)
  VALUES (_blueprint_id, _blueprint_version_id, 'draft_created', _caller);

  RETURN QUERY SELECT _blueprint_id, _blueprint_version_id, _assessment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_blueprint_draft(text, uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_blueprint_draft(text, uuid, uuid, uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_module_to_blueprint_version(
  _blueprint_version_id uuid, _module_version_id uuid, _display_order integer DEFAULT 0
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _bv_status text;
  _mv_status text;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _bv_status FROM public.blueprint_versions WHERE id = _blueprint_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blueprint version not found'; END IF;
  IF _bv_status <> 'draft' THEN
    RAISE EXCEPTION 'Can only attach modules to a draft blueprint version' USING ERRCODE = 'check_violation';
  END IF;

  SELECT content_status INTO _mv_status FROM public.module_versions WHERE id = _module_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module version not found'; END IF;
  IF _mv_status <> 'published' THEN
    RAISE EXCEPTION 'A blueprint can only include a published module version' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.blueprint_version_module_versions (blueprint_version_id, module_version_id, display_order)
  VALUES (_blueprint_version_id, _module_version_id, _display_order)
  ON CONFLICT (blueprint_version_id, module_version_id) DO UPDATE SET display_order = EXCLUDED.display_order
  RETURNING blueprint_version_module_versions.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_module_to_blueprint_version(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_module_to_blueprint_version(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.detach_module_from_blueprint_version(_blueprint_version_id uuid, _module_version_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _status text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _status FROM public.blueprint_versions WHERE id = _blueprint_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blueprint version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only detach modules from a draft blueprint version' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.blueprint_version_module_versions
  WHERE blueprint_version_id = _blueprint_version_id AND module_version_id = _module_version_id;
END;
$$;
REVOKE ALL ON FUNCTION public.detach_module_from_blueprint_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_module_from_blueprint_version(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_blueprint_version_question_override(
  _blueprint_version_id uuid, _question_version_id uuid, _override_type text
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _status text;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;
  IF _override_type NOT IN ('include','exclude') THEN
    RAISE EXCEPTION 'Invalid override_type %', _override_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT content_status INTO _status FROM public.blueprint_versions WHERE id = _blueprint_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blueprint version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only override questions on a draft blueprint version' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.blueprint_version_question_overrides (blueprint_version_id, question_version_id, override_type)
  VALUES (_blueprint_version_id, _question_version_id, _override_type)
  ON CONFLICT (blueprint_version_id, question_version_id) DO UPDATE SET override_type = EXCLUDED.override_type
  RETURNING blueprint_version_question_overrides.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_blueprint_version_question_override(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_blueprint_version_question_override(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_blueprint_version(_blueprint_version_id uuid)
RETURNS TABLE (blueprint_version_id uuid, content_status text, published_at timestamptz, assessment_version_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _bv public.blueprint_versions%ROWTYPE;
  _blueprint public.blueprints%ROWTYPE;
  _now timestamptz := now();
  _assessment_version_id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT * INTO _bv FROM public.blueprint_versions WHERE id = _blueprint_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blueprint version not found'; END IF;
  IF _bv.content_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft blueprint version can be published (current status: %)', _bv.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.blueprint_version_module_versions WHERE blueprint_version_id = _blueprint_version_id) THEN
    RAISE EXCEPTION 'Cannot publish a blueprint version with zero attached modules' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _blueprint FROM public.blueprints WHERE id = _bv.blueprint_id;

  -- C1 bridge: mirror this publish event into the pre-existing
  -- assessment_versions table, atomically with the blueprint_versions
  -- status flip -- this is what lets a run against this blueprint version
  -- satisfy assessment_runs' existing NOT NULL assessment_id/
  -- assessment_version_id columns.
  INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, published_at)
  VALUES (_blueprint.assessment_id, 'blueprint-v' || _bv.version_number, 'standard-v1', _now)
  RETURNING id INTO _assessment_version_id;

  UPDATE public.blueprint_versions
  SET content_status = 'published', published_at = _now, updated_at = _now, assessment_version_id = _assessment_version_id
  WHERE id = _blueprint_version_id;

  INSERT INTO public.blueprint_content_events (blueprint_id, blueprint_version_id, action, actor_id, details)
  VALUES (_bv.blueprint_id, _blueprint_version_id, 'published', _caller, jsonb_build_object('assessment_version_id', _assessment_version_id));

  RETURN QUERY SELECT _blueprint_version_id, 'published'::text, _now, _assessment_version_id;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_blueprint_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_blueprint_version(uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_blueprint_version(uuid) IS
  'H4.1 Blueprint Engine. Fixes architecture finding C1: mirrors this '
  'publish event into the pre-existing public.assessment_versions table in '
  'the same transaction as the content_status flip, so no Blueprint Version '
  'can ever be published without a valid, atomically-created catalog entry '
  'for start_assessment_run() to reference. No second/parallel assessment '
  'catalog is created.';

CREATE OR REPLACE FUNCTION public.archive_blueprint_version(_blueprint_version_id uuid)
RETURNS TABLE (blueprint_version_id uuid, content_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _bv public.blueprint_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT * INTO _bv FROM public.blueprint_versions WHERE id = _blueprint_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blueprint version not found'; END IF;
  IF _bv.content_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published blueprint version can be archived (current status: %)', _bv.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.blueprint_versions SET content_status = 'archived', updated_at = now() WHERE id = _blueprint_version_id;
  INSERT INTO public.blueprint_content_events (blueprint_id, blueprint_version_id, action, actor_id)
  VALUES (_bv.blueprint_id, _blueprint_version_id, 'archived', _caller);

  RETURN QUERY SELECT _blueprint_version_id, 'archived'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_blueprint_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_blueprint_version(uuid) TO authenticated;


-- =============================================================================
-- 10e. Scoring Profiles. publish_scoring_profile_version() enforces I3
-- (exactly one published version per blueprint version) as a hard RPC check
-- in addition to the structural partial unique index in SECTION 5.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_scoring_profile_draft(_blueprint_version_id uuid)
RETURNS TABLE (scoring_profile_version_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _next_version integer;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.blueprint_versions WHERE id = _blueprint_version_id) THEN
    RAISE EXCEPTION 'Blueprint version not found';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO _next_version
  FROM public.scoring_profile_versions WHERE blueprint_version_id = _blueprint_version_id;

  INSERT INTO public.scoring_profile_versions (blueprint_version_id, version_number)
  VALUES (_blueprint_version_id, _next_version)
  RETURNING id INTO _id;

  INSERT INTO public.scoring_profile_content_events (scoring_profile_version_id, action, actor_id)
  VALUES (_id, 'draft_created', _caller);

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_scoring_profile_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_scoring_profile_draft(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_scoring_profile_weight(
  _scoring_profile_version_id uuid, _evidence_signal_id uuid, _weight numeric
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _status text;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT content_status INTO _status FROM public.scoring_profile_versions WHERE id = _scoring_profile_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoring profile version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only set weights on a draft scoring profile version' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scoring_profile_version_weights (scoring_profile_version_id, evidence_signal_id, weight)
  VALUES (_scoring_profile_version_id, _evidence_signal_id, _weight)
  ON CONFLICT (scoring_profile_version_id, evidence_signal_id) DO UPDATE SET weight = EXCLUDED.weight
  RETURNING scoring_profile_version_weights.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_scoring_profile_weight(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_scoring_profile_weight(uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_scoring_profile_version(_scoring_profile_version_id uuid)
RETURNS TABLE (scoring_profile_version_id uuid, content_status text, published_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _spv public.scoring_profile_versions%ROWTYPE;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT * INTO _spv FROM public.scoring_profile_versions WHERE id = _scoring_profile_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoring profile version not found'; END IF;
  IF _spv.content_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft scoring profile version can be published (current status: %)', _spv.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scoring_profile_version_weights WHERE scoring_profile_version_id = _scoring_profile_version_id) THEN
    RAISE EXCEPTION 'Cannot publish a scoring profile version with zero weights' USING ERRCODE = 'check_violation';
  END IF;

  -- I3, explicit RPC-level check in addition to the structural partial
  -- unique index (scoring_profile_versions_one_published_per_blueprint_
  -- version) -- gives a clean, mapped error instead of a raw constraint
  -- violation, matching this codebase's "no raw DB error reaches the UI"
  -- convention.
  IF EXISTS (
    SELECT 1 FROM public.scoring_profile_versions
    WHERE blueprint_version_id = _spv.blueprint_version_id AND content_status = 'published'
  ) THEN
    RAISE EXCEPTION 'A published scoring profile version already exists for this blueprint version; archive it first'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scoring_profile_versions SET content_status = 'published', published_at = _now
  WHERE id = _scoring_profile_version_id;

  UPDATE public.blueprint_versions SET default_scoring_profile_version_id = _scoring_profile_version_id
  WHERE id = _spv.blueprint_version_id;

  INSERT INTO public.scoring_profile_content_events (scoring_profile_version_id, action, actor_id)
  VALUES (_scoring_profile_version_id, 'published', _caller);

  RETURN QUERY SELECT _scoring_profile_version_id, 'published'::text, _now;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_scoring_profile_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_scoring_profile_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_scoring_profile_version(_scoring_profile_version_id uuid)
RETURNS TABLE (scoring_profile_version_id uuid, content_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _spv public.scoring_profile_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;

  SELECT * INTO _spv FROM public.scoring_profile_versions WHERE id = _scoring_profile_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoring profile version not found'; END IF;
  IF _spv.content_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published scoring profile version can be archived (current status: %)', _spv.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scoring_profile_versions SET content_status = 'archived' WHERE id = _scoring_profile_version_id;
  INSERT INTO public.scoring_profile_content_events (scoring_profile_version_id, action, actor_id)
  VALUES (_scoring_profile_version_id, 'archived', _caller);

  RETURN QUERY SELECT _scoring_profile_version_id, 'archived'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_scoring_profile_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_scoring_profile_version(uuid) TO authenticated;


-- =============================================================================
-- 10f. Requirement Profiles. Platform-admin-only creation in this build
-- (PO-confirmed). Employer self-service is a later, separately-scoped phase.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_requirement_profile_draft(_employer_id uuid, _slug text)
RETURNS TABLE (requirement_profile_id uuid, requirement_profile_version_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _rp_id uuid;
  _rpv_id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required (Requirement Profile creation is platform-admin-only for this build)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employers WHERE id = _employer_id) THEN
    RAISE EXCEPTION 'Employer not found';
  END IF;

  INSERT INTO public.requirement_profiles (employer_id, slug) VALUES (_employer_id, _slug)
  RETURNING id INTO _rp_id;

  INSERT INTO public.requirement_profile_versions (requirement_profile_id, version_number, created_by)
  VALUES (_rp_id, 1, _caller)
  RETURNING id INTO _rpv_id;

  INSERT INTO public.requirement_profile_events (requirement_profile_id, requirement_profile_version_id, action, actor_id)
  VALUES (_rp_id, _rpv_id, 'draft_created', _caller);

  RETURN QUERY SELECT _rp_id, _rpv_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_requirement_profile_draft(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_requirement_profile_draft(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_requirement_profile_weight(
  _requirement_profile_version_id uuid, _competency_id uuid, _importance text
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _status text;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;
  IF _importance NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid importance %', _importance USING ERRCODE = 'check_violation';
  END IF;

  SELECT content_status INTO _status FROM public.requirement_profile_versions WHERE id = _requirement_profile_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requirement profile version not found'; END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'Can only set weights on a draft requirement profile version' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.requirement_profile_version_weights (requirement_profile_version_id, competency_id, importance)
  VALUES (_requirement_profile_version_id, _competency_id, _importance)
  ON CONFLICT (requirement_profile_version_id, competency_id) DO UPDATE SET importance = EXCLUDED.importance
  RETURNING requirement_profile_version_weights.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_requirement_profile_weight(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_requirement_profile_weight(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_requirement_profile_version(_requirement_profile_version_id uuid)
RETURNS TABLE (requirement_profile_version_id uuid, content_status text, published_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _rpv public.requirement_profile_versions%ROWTYPE;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required (Requirement Profile publication is platform-admin-only for this build)';
  END IF;

  SELECT * INTO _rpv FROM public.requirement_profile_versions WHERE id = _requirement_profile_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requirement profile version not found'; END IF;
  IF _rpv.content_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft requirement profile version can be published (current status: %)', _rpv.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.requirement_profile_version_weights WHERE requirement_profile_version_id = _requirement_profile_version_id) THEN
    RAISE EXCEPTION 'Cannot publish a requirement profile version with zero weights' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.requirement_profile_versions SET content_status = 'published', published_at = _now
  WHERE id = _requirement_profile_version_id;

  INSERT INTO public.requirement_profile_events (requirement_profile_id, requirement_profile_version_id, action, actor_id)
  VALUES (_rpv.requirement_profile_id, _requirement_profile_version_id, 'published', _caller);

  RETURN QUERY SELECT _requirement_profile_version_id, 'published'::text, _now;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_requirement_profile_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_requirement_profile_version(uuid) TO authenticated;


-- =============================================================================
-- 10g. Assessment Run lifecycle. Pins every version reference at
-- start_assessment_run() (historical reproducibility, DB Schema §8);
-- structurally separates (A) Standard Competency Result from (B)
-- Organisation Requirement Match (fixes the write-path concern directly --
-- compute_requirement_match() below has no statement anywhere in its body
-- that writes standard_result, verified by test in the Phase 1 test suite,
-- not merely by this comment -- see Backend §5 / I7 correction). Every
-- assessment_runs UPDATE below sets the transaction-local
-- app.blueprint_run_transition_in_progress marker immediately before its
-- own UPDATE, exactly mirroring reject_job()'s proven pattern (SECTION 8e).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.start_assessment_run(
  _blueprint_version_id uuid,
  _requirement_profile_version_id uuid DEFAULT NULL,
  _locale text DEFAULT 'sv'
)
RETURNS TABLE (run_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _bv public.blueprint_versions%ROWTYPE;
  _blueprint public.blueprints%ROWTYPE;
  _scoring_profile_version_id uuid;
  _rp_employer_id uuid;
  _graph_version text;
  _run_id uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _bv FROM public.blueprint_versions WHERE id = _blueprint_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blueprint version not found';
  END IF;
  -- Unpublished-version-use guard: a draft or archived blueprint version can
  -- never be run against.
  IF _bv.content_status <> 'published' THEN
    RAISE EXCEPTION 'Cannot start a run against a blueprint version that is not published (status: %)', _bv.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _blueprint FROM public.blueprints WHERE id = _bv.blueprint_id;

  -- I3: resolve the single currently-published Scoring Profile Version for
  -- this Blueprint Version -- never client-supplied.
  SELECT id INTO _scoring_profile_version_id
  FROM public.scoring_profile_versions
  WHERE blueprint_version_id = _blueprint_version_id AND content_status = 'published';
  IF _scoring_profile_version_id IS NULL THEN
    RAISE EXCEPTION 'This blueprint version has no published scoring profile version';
  END IF;

  -- Requirement-profile-access-outside-owning-organisation guard: the
  -- caller may only start a run carrying a Requirement Profile Version they
  -- are authorized to use (their own employer's, or a platform admin).
  IF _requirement_profile_version_id IS NOT NULL THEN
    SELECT rp.employer_id INTO _rp_employer_id
    FROM public.requirement_profile_versions rpv
    JOIN public.requirement_profiles rp ON rp.id = rpv.requirement_profile_id
    WHERE rpv.id = _requirement_profile_version_id AND rpv.content_status = 'published';
    IF _rp_employer_id IS NULL THEN
      RAISE EXCEPTION 'Requirement profile version not found or not published';
    END IF;
    IF NOT (public.is_platform_admin(_caller) OR public.has_employer_role(_caller, _rp_employer_id)) THEN
      RAISE EXCEPTION 'Forbidden: requirement profile version does not belong to your organisation';
    END IF;
  END IF;

  SELECT graph_version INTO _graph_version FROM public.cig_professions WHERE id = _blueprint.role_id;

  -- Pins every version reference now, at run-start, against PUBLISHED,
  -- immutable rows only -- this INSERT (not UPDATE) needs no guard-trigger
  -- marker; the guard only restricts later UPDATEs, which is what prevents
  -- "replacing version references after a run starts."
  INSERT INTO public.assessment_runs (
    user_id, assessment_id, assessment_version_id, graph_version, locale, status,
    blueprint_version_id, scoring_profile_version_id, requirement_profile_version_id
  ) VALUES (
    _caller, _blueprint.assessment_id, _bv.assessment_version_id, COALESCE(_graph_version, 'n/a'), _locale, 'in_progress',
    _blueprint_version_id, _scoring_profile_version_id, _requirement_profile_version_id
  ) RETURNING id INTO _run_id;

  RETURN QUERY SELECT _run_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_assessment_run(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_assessment_run(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_assessment_answer(
  _run_id uuid, _question_version_id uuid, _answer_value jsonb
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _run public.assessment_runs%ROWTYPE;
  _id uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _run FROM public.assessment_runs WHERE id = _run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment run not found'; END IF;
  IF _run.user_id <> _caller THEN
    RAISE EXCEPTION 'Forbidden: not your assessment run';
  END IF;
  IF _run.blueprint_version_id IS NULL THEN
    RAISE EXCEPTION 'Not a Blueprint-driven assessment run';
  END IF;
  IF _run.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot record an answer on a run that is not in progress (status: %)', _run.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF _run.blueprint_run_stage IS NOT NULL THEN
    RAISE EXCEPTION 'Answers are already finalized for this run' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.assessment_run_answers (run_id, question_version_id, answer_value)
  VALUES (_run_id, _question_version_id, _answer_value)
  ON CONFLICT (run_id, question_version_id) DO UPDATE SET answer_value = EXCLUDED.answer_value, answered_at = now()
  RETURNING assessment_run_answers.id INTO _id;

  RETURN QUERY SELECT _id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_assessment_answer(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_assessment_answer(uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_assessment_answers(_run_id uuid)
RETURNS TABLE (run_id uuid, blueprint_run_stage text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _run public.assessment_runs%ROWTYPE;
  _expected_count integer;
  _answered_count integer;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _run FROM public.assessment_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment run not found'; END IF;
  IF _run.user_id <> _caller THEN RAISE EXCEPTION 'Forbidden: not your assessment run'; END IF;
  IF _run.blueprint_version_id IS NULL THEN RAISE EXCEPTION 'Not a Blueprint-driven assessment run'; END IF;
  IF _run.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot finalize answers on a run that is not in progress (status: %)', _run.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF _run.blueprint_run_stage IS NOT NULL THEN
    RAISE EXCEPTION 'Answers are already finalized for this run' USING ERRCODE = 'check_violation';
  END IF;

  -- Every question version reachable from this Blueprint Version's attached,
  -- published Module Versions (minus explicit excludes, plus explicit
  -- includes) must have an answer before finalizing.
  SELECT count(DISTINCT resolved.question_version_id) INTO _expected_count
  FROM (
    SELECT qvmv.question_version_id
    FROM public.blueprint_version_module_versions bvmv
    JOIN public.question_version_module_versions qvmv ON qvmv.module_version_id = bvmv.module_version_id
    WHERE bvmv.blueprint_version_id = _run.blueprint_version_id
    UNION
    SELECT bvqo.question_version_id
    FROM public.blueprint_version_question_overrides bvqo
    WHERE bvqo.blueprint_version_id = _run.blueprint_version_id AND bvqo.override_type = 'include'
  ) resolved
  WHERE resolved.question_version_id NOT IN (
    SELECT question_version_id FROM public.blueprint_version_question_overrides
    WHERE blueprint_version_id = _run.blueprint_version_id AND override_type = 'exclude'
  );

  SELECT count(*) INTO _answered_count FROM public.assessment_run_answers WHERE run_id = _run_id;

  IF _answered_count < _expected_count THEN
    RAISE EXCEPTION 'Cannot finalize: % of % required questions answered', _answered_count, _expected_count
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.blueprint_run_transition_in_progress', 'on', true);
  UPDATE public.assessment_runs SET blueprint_run_stage = 'answers_submitted', updated_at = now() WHERE id = _run_id;

  RETURN QUERY SELECT _run_id, 'answers_submitted'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_assessment_answers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_assessment_answers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_standard_result(_run_id uuid)
RETURNS TABLE (run_id uuid, blueprint_run_stage text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _run public.assessment_runs%ROWTYPE;
  _signal_totals jsonb;
  _weighted_total numeric;
  _signal_labels jsonb;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _run FROM public.assessment_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment run not found'; END IF;
  IF _run.user_id <> _caller AND NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: not your assessment run';
  END IF;
  IF _run.blueprint_run_stage IS DISTINCT FROM 'answers_submitted' THEN
    RAISE EXCEPTION 'Cannot compute the standard result before answers are finalized (current stage: %)', _run.blueprint_run_stage
      USING ERRCODE = 'check_violation';
  END IF;

  -- Deterministic evidence-signal aggregation: sum(answer_value.value *
  -- signal_weight * signal_polarity) per evidence signal, across every
  -- answered question version. Answer convention for Phase 1's disposable
  -- test fixtures: {"value": <numeric>}.
  SELECT jsonb_object_agg(agg.evidence_signal_id::text, agg.total)
    INTO _signal_totals
  FROM (
    SELECT qves.evidence_signal_id,
           sum((ara.answer_value->>'value')::numeric * qves.signal_weight * qves.signal_polarity) AS total
    FROM public.assessment_run_answers ara
    JOIN public.question_version_evidence_signals qves ON qves.question_version_id = ara.question_version_id
    WHERE ara.run_id = _run_id
    GROUP BY qves.evidence_signal_id
  ) agg;

  SELECT sum((agg.value)::numeric * spvw.weight)
    INTO _weighted_total
  FROM public.scoring_profile_version_weights spvw
  JOIN jsonb_each_text(COALESCE(_signal_totals, '{}'::jsonb)) AS agg(key, value)
    ON agg.key = spvw.evidence_signal_id::text
  WHERE spvw.scoring_profile_version_id = _run.scoring_profile_version_id;

  -- I5: snapshot the referenced Evidence Signal display labels into the
  -- report at generation time so later edits to evidence_signals (edited in
  -- place, not versioned) never silently change how a historical report
  -- reads.
  SELECT jsonb_object_agg(es.id::text, jsonb_build_object('title_sv', es.title_sv, 'title_en', es.title_en))
    INTO _signal_labels
  FROM public.evidence_signals es
  WHERE es.id::text IN (SELECT jsonb_object_keys(COALESCE(_signal_totals, '{}'::jsonb)));

  _result := jsonb_build_object(
    'evidence_signal_totals', COALESCE(_signal_totals, '{}'::jsonb),
    'evidence_signal_labels', COALESCE(_signal_labels, '{}'::jsonb),
    'weighted_total', COALESCE(_weighted_total, 0),
    'blueprint_version_id', _run.blueprint_version_id,
    'scoring_profile_version_id', _run.scoring_profile_version_id,
    'computed_at', now()
  );

  INSERT INTO public.assessment_run_reports (
    run_id, user_id, completion_id, report_version, engine_version, graph_version,
    profile_version, locale, inputs_hash, report, standard_result
  ) VALUES (
    _run_id, _run.user_id, _run_id, 'blueprint-v1', 'blueprint-engine-v1', _run.graph_version,
    'n/a', _run.locale, md5(COALESCE(_signal_totals, '{}'::jsonb)::text), '{}'::jsonb, _result
  )
  ON CONFLICT (run_id) DO UPDATE SET standard_result = EXCLUDED.standard_result;

  PERFORM set_config('app.blueprint_run_transition_in_progress', 'on', true);
  UPDATE public.assessment_runs SET blueprint_run_stage = 'standard_result_computed', updated_at = now() WHERE id = _run_id;

  RETURN QUERY SELECT _run_id, 'standard_result_computed'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.compute_standard_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_standard_result(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_requirement_match(_run_id uuid)
RETURNS TABLE (run_id uuid, blueprint_run_stage text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _run public.assessment_runs%ROWTYPE;
  _standard_result jsonb;
  _gap_summary jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _run FROM public.assessment_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment run not found'; END IF;
  IF _run.user_id <> _caller AND NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: not your assessment run';
  END IF;
  IF _run.requirement_profile_version_id IS NULL THEN
    RAISE EXCEPTION 'This run has no attached requirement profile version';
  END IF;
  IF _run.blueprint_run_stage IS DISTINCT FROM 'standard_result_computed' THEN
    RAISE EXCEPTION 'Cannot compute the requirement match before the standard result is computed (current stage: %)', _run.blueprint_run_stage
      USING ERRCODE = 'check_violation';
  END IF;

  -- Read-only input: the already-computed (A). This RPC's body contains no
  -- statement that writes assessment_run_reports.standard_result anywhere
  -- below -- verified structurally by the test suite (fixes I7's precision
  -- correction: enforced by this function's implementation, not by a
  -- Postgres column grant).
  SELECT standard_result INTO _standard_result FROM public.assessment_run_reports WHERE run_id = _run_id;
  IF _standard_result IS NULL THEN
    RAISE EXCEPTION 'Standard result not found for this run';
  END IF;

  -- Deterministic, explanatory-only gap calculation. Never produces an
  -- accept/reject or compliance field of any kind (fixes the non-negotiable
  -- principle from Backend §7 / DB Schema's (A)/(B) separation).
  SELECT jsonb_object_agg(
    c.id::text,
    jsonb_build_object(
      'competency_title_sv', c.title_sv,
      'competency_title_en', c.title_en,
      'required_importance', rpvw.importance
    )
  ) INTO _gap_summary
  FROM public.requirement_profile_version_weights rpvw
  JOIN public.cig_competencies c ON c.id = rpvw.competency_id
  WHERE rpvw.requirement_profile_version_id = _run.requirement_profile_version_id;

  UPDATE public.assessment_run_reports
  SET requirement_match = jsonb_build_object(
    'requirement_profile_version_id', _run.requirement_profile_version_id,
    'competency_requirements', COALESCE(_gap_summary, '{}'::jsonb),
    'computed_at', now()
  )
  WHERE run_id = _run_id;

  PERFORM set_config('app.blueprint_run_transition_in_progress', 'on', true);
  UPDATE public.assessment_runs SET blueprint_run_stage = 'requirement_match_computed', updated_at = now() WHERE id = _run_id;

  RETURN QUERY SELECT _run_id, 'requirement_match_computed'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.compute_requirement_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_requirement_match(uuid) TO authenticated;

COMMENT ON FUNCTION public.compute_requirement_match(uuid) IS
  'H4.1 Blueprint Engine. Structural (A)/(B) separation: this function reads '
  'assessment_run_reports.standard_result but its body contains no UPDATE '
  'or INSERT statement that writes that column -- only requirement_match. '
  'A Requirement Profile can therefore never modify baseline answers, '
  'baseline scoring, or the Standard Competency Result, and never emits an '
  'automatic candidate-decision or supplier-compliance field. Enforced by '
  'this function''s implementation and by test coverage, not by a Postgres '
  'column-level GRANT (a SECURITY DEFINER function runs with its owner''s '
  'full privileges regardless of the caller''s grants -- fixes the '
  'imprecise "granted" framing in an earlier architecture draft, finding I7).';

CREATE OR REPLACE FUNCTION public.complete_assessment_run(_run_id uuid)
RETURNS TABLE (run_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _run public.assessment_runs%ROWTYPE;
  _required_stage text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _run FROM public.assessment_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment run not found'; END IF;
  IF _run.user_id <> _caller AND NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: not your assessment run';
  END IF;
  IF _run.blueprint_version_id IS NULL THEN RAISE EXCEPTION 'Not a Blueprint-driven assessment run'; END IF;
  IF _run.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot complete a run that is not in progress (status: %)', _run.status
      USING ERRCODE = 'check_violation';
  END IF;

  _required_stage := CASE WHEN _run.requirement_profile_version_id IS NOT NULL
    THEN 'requirement_match_computed' ELSE 'standard_result_computed' END;
  IF _run.blueprint_run_stage IS DISTINCT FROM _required_stage THEN
    RAISE EXCEPTION 'Cannot complete this run: expected stage %, found %', _required_stage, _run.blueprint_run_stage
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.blueprint_run_transition_in_progress', 'on', true);
  UPDATE public.assessment_runs SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = _run_id;

  RETURN QUERY SELECT _run_id, 'completed'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_assessment_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_assessment_run(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.abandon_assessment_run(_run_id uuid)
RETURNS TABLE (run_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _run public.assessment_runs%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _run FROM public.assessment_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment run not found'; END IF;
  IF _run.user_id <> _caller THEN RAISE EXCEPTION 'Forbidden: not your assessment run'; END IF;
  IF _run.blueprint_version_id IS NULL THEN RAISE EXCEPTION 'Not a Blueprint-driven assessment run'; END IF;
  IF _run.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot abandon a run that is not in progress (status: %)', _run.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.blueprint_run_transition_in_progress', 'on', true);
  UPDATE public.assessment_runs SET status = 'abandoned', updated_at = now() WHERE id = _run_id;

  RETURN QUERY SELECT _run_id, 'abandoned'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.abandon_assessment_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abandon_assessment_run(uuid) TO authenticated;

-- =============================================================================
-- End of H4.1 Phase 1 migration.
-- =============================================================================
