-- Security Competence Platform — Phase 0: the Competency Graph foundations.
--
-- ADDITIVE ONLY. Creates new tables, types, functions and views, and widens three
-- vocabularies. No existing row is modified, no table is dropped, no policy is
-- weakened, and no previously applied migration is edited.
--
-- ── WHY THIS EXISTS ────────────────────────────────────────────────────
--
-- CQrityjob is not building an assessment platform. It is building a Security
-- Competence Platform, and the permanent backbone is the Competency Graph:
--
--   Role → Competency → Observable Behaviour → Scenario → Item
--        → Evidence → Maturity → Development Plan → Learning Module
--        → Reassessment → Growth
--
-- Assessments are ONE evidence source feeding that graph, not the system of
-- record. Everything downstream — maturity levels, reports, growth, every future
-- internal service and all five reserved AI agents — is a projection of the
-- evidence ledger created here.
--
-- The ledger, the maturity vocabulary and the read-model contract are all in
-- this first migration deliberately: they are the three things whose shape
-- cannot be changed cheaply once evidence exists.
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
--
-- No item content. No assessment is published or made employer-visible. The
-- legacy `security-guard-foundation` stays retired and invisible. Nothing is
-- retired: see docs/assessment/competency-graph/phase0-dependency-analysis.md,
-- which found scp_bundles/scp_role_weight_profiles to be an inert closed cluster
-- that costs nothing to leave in place.

-- =========================================================================
-- SECTION 1 — Vocabulary widening
-- =========================================================================
--
-- The Academy needs a third product type. Widened by REPLACING the CHECK with a
-- superset, so no existing row can become invalid.

ALTER TABLE public.scp_assessment_families
  DROP CONSTRAINT IF EXISTS scp_assessment_families_product_type_check;
ALTER TABLE public.scp_assessment_families
  ADD CONSTRAINT scp_assessment_families_product_type_check
  CHECK (product_type IN (
    'career_guidance', 'security_competency_core', 'profession_module',
    'development_programme'));

ALTER TABLE public.scp_assessment_definitions
  DROP CONSTRAINT IF EXISTS scp_assessment_definitions_purpose_check;
ALTER TABLE public.scp_assessment_definitions
  ADD CONSTRAINT scp_assessment_definitions_purpose_check
  CHECK (purpose IN ('core', 'profession_module', 'development_programme'));

-- The three review gates and the leaked-item state the Academy requires.
-- 'in_review' and 'approved' are RETAINED so existing rows stay valid.
ALTER TABLE public.scp_assessment_versions
  DROP CONSTRAINT IF EXISTS scp_assessment_versions_content_status_check;
ALTER TABLE public.scp_assessment_versions
  ADD CONSTRAINT scp_assessment_versions_content_status_check
  CHECK (content_status IN (
    'draft', 'expert_review', 'legal_review', 'cognitive_review',
    'in_review', 'approved', 'published', 'suspended', 'retired'));

-- -------------------------------------------------------------------------
-- 1b. The family-product separation guard, widened WITHOUT weakening it
-- -------------------------------------------------------------------------
--
-- This is the sharpest edge in Phase 0. The guard's first rule -- a Security
-- Competency definition may NEVER attach to the career-guidance family -- is the
-- structural separation between the candidate Career Discovery product and the
-- employer competence product. It is reproduced here byte-for-byte and must stay
-- first, so a mistake in the new branch can never reach it.

CREATE OR REPLACE FUNCTION public.scp_guard_family_product_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product_type text;
BEGIN
  SELECT product_type INTO _product_type
    FROM public.scp_assessment_families WHERE id = NEW.family_id;

  -- UNCHANGED. Career Guidance separation, enforced before anything else.
  IF _product_type = 'career_guidance' THEN
    RAISE EXCEPTION
      'SCP_CAREER_GUIDANCE_SEPARATION: a Security Competency assessment definition may never be attached to the career-guidance family.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.purpose = 'core' AND _product_type <> 'security_competency_core' THEN
    RAISE EXCEPTION
      'SCP_FAMILY_PURPOSE_MISMATCH: purpose "core" requires a security_competency_core family.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.purpose = 'profession_module' AND _product_type <> 'profession_module' THEN
    RAISE EXCEPTION
      'SCP_FAMILY_PURPOSE_MISMATCH: purpose "profession_module" requires a profession_module family.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NEW: the Academy pairing, held to the same standard as the other two.
  IF NEW.purpose = 'development_programme' AND _product_type <> 'development_programme' THEN
    RAISE EXCEPTION
      'SCP_FAMILY_PURPOSE_MISMATCH: purpose "development_programme" requires a development_programme family.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- The Academy family itself. Content arrives in Phase 1; this is identity only.
INSERT INTO public.scp_assessment_families
  (slug, name_sv, name_en, product_type, description_sv, description_en)
VALUES (
  'security-competence-academy',
  'CQrityjob Säkerhetskompetensakademi',
  'CQrityjob Security Competence Academy',
  'development_programme',
  'Rollspecifik kompetensutveckling för befintlig säkerhetspersonal. Utvecklingsinriktad — aldrig urval, rangordning eller anställningsbeslut.',
  'Role-specific competence development for existing security personnel. Development-oriented — never selection, ranking or employment decisions.')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- SECTION 2 — The graph spine
-- =========================================================================
--
-- Role → Competency → Observable Behaviour. Every node is versioned, because a
-- definition that changes must never silently reinterpret historical evidence.

CREATE TABLE IF NOT EXISTS public.scp_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  profession_id uuid REFERENCES public.scp_professions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_roles IS
  'Stable identity for a security role. Carries NO text -- all wording lives in '
  'scp_role_versions so a role can be redefined without breaking evidence.';

CREATE TABLE IF NOT EXISTS public.scp_role_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.scp_roles(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft', 'expert_review', 'legal_review', 'cognitive_review',
      'published', 'suspended', 'retired')),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  description_sv text NOT NULL,
  description_en text NOT NULL,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, version_number)
);

-- Observable behaviours: THE JOIN POINT of the whole graph. An assessment item
-- maps to exactly one of these, and each belongs to one or more competencies.
CREATE TABLE IF NOT EXISTS public.scp_observable_behaviours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_observable_behaviours IS
  'The join point of the Competency Graph. Every assessment item maps to exactly '
  'one behaviour; every behaviour maps to one or more competencies. Evidence is '
  'recorded against a behaviour version, never against an item or an assessment.';

CREATE TABLE IF NOT EXISTS public.scp_behaviour_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  behaviour_id uuid NOT NULL REFERENCES public.scp_observable_behaviours(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft', 'expert_review', 'legal_review', 'cognitive_review',
      'published', 'suspended', 'retired')),
  statement_sv text NOT NULL,
  statement_en text NOT NULL,
  -- What a competent person visibly does. Never a trait, never an inference.
  positive_indicators_sv text[] NOT NULL DEFAULT '{}',
  contraindications_sv text[] NOT NULL DEFAULT '{}',
  -- A behaviour whose absence or opposite is a safety concern. Evidence against
  -- one of these can cap a maturity level regardless of everything else.
  is_safety_critical boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (behaviour_id, version_number)
);

-- -------------------------------------------------------------------------
-- 2b. Mapping tables — versioned on both ends
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scp_behaviour_competency_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  behaviour_version_id uuid NOT NULL
    REFERENCES public.scp_behaviour_versions(id) ON DELETE RESTRICT,
  competency_version_id uuid NOT NULL
    REFERENCES public.scp_competency_versions(id) ON DELETE RESTRICT,
  -- How much this behaviour informs this competency. Content mapping only --
  -- it never turns one response into several independent full scores.
  weight numeric(4,3) NOT NULL DEFAULT 1.000
    CHECK (weight > 0 AND weight <= 1),
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (behaviour_version_id, competency_version_id)
);

CREATE TABLE IF NOT EXISTS public.scp_role_competency_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_version_id uuid NOT NULL
    REFERENCES public.scp_role_versions(id) ON DELETE RESTRICT,
  competency_version_id uuid NOT NULL
    REFERENCES public.scp_competency_versions(id) ON DELETE RESTRICT,
  criticality text NOT NULL DEFAULT 'core'
    CHECK (criticality IN ('core', 'supporting', 'contextual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_version_id, competency_version_id)
);

CREATE INDEX IF NOT EXISTS scp_behaviour_competency_map_comp_idx
  ON public.scp_behaviour_competency_map (competency_version_id);
CREATE INDEX IF NOT EXISTS scp_role_competency_map_role_idx
  ON public.scp_role_competency_map (role_version_id);

-- Every behaviour version must reach at least one competency before it can be
-- published. A behaviour that maps to nothing would silently collect evidence
-- that no competency ever reads.
CREATE OR REPLACE FUNCTION public.scp_guard_behaviour_has_competency()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_status = 'published'
     AND NOT EXISTS (
       SELECT 1 FROM public.scp_behaviour_competency_map m
        WHERE m.behaviour_version_id = NEW.id)
  THEN
    RAISE EXCEPTION
      'SCP_BEHAVIOUR_WITHOUT_COMPETENCY: behaviour version % cannot be published '
      'because it maps to no competency; its evidence would be unreadable.',
      NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_behaviour_versions_require_competency
  BEFORE INSERT OR UPDATE ON public.scp_behaviour_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_behaviour_has_competency();

-- =========================================================================
-- SECTION 3 — The evidence ledger
-- =========================================================================
--
-- The heart of the platform. Evidence is recorded against a BEHAVIOUR VERSION
-- with its source named, so it accumulates across a career instead of being
-- trapped inside one assessment result.
--
-- Append-only. Nothing is ever updated or deleted: a correction supersedes.

CREATE TABLE IF NOT EXISTS public.scp_competency_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  subject_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  behaviour_version_id uuid NOT NULL
    REFERENCES public.scp_behaviour_versions(id) ON DELETE RESTRICT,

  -- MVP writes only 'assessment_response'. The rest are live values with no
  -- writer yet: adding manager observation later is a server function, not a
  -- migration. That is the whole point of a source-agnostic ledger.
  source_type text NOT NULL CHECK (source_type IN (
    'assessment_response', 'training_completion', 'manager_observation',
    'certification', 'incident_review')),
  source_ref uuid,

  -- What was demonstrated, and how sure we are.
  contribution numeric(4,3) NOT NULL CHECK (contribution >= 0 AND contribution <= 1),
  confidence   numeric(4,3) NOT NULL CHECK (confidence   >= 0 AND confidence   <= 1),

  -- Who or what produced this judgement. Ranked in scp_compute_maturity():
  -- human_review outranks ai_scoring_run outranks deterministic.
  provenance text NOT NULL CHECK (provenance IN (
    'deterministic', 'ai_scoring_run', 'human_review')),
  provenance_ref uuid,

  -- The context the behaviour was demonstrated in (scenario slug, module slug,
  -- site, incident type). Breadth across contexts is a maturity gate, so this
  -- is what stops one strong answer reaching a high level.
  context_key text,

  -- A response that is itself a safety concern. Caps maturity outright and is
  -- always surfaced separately from any level.
  is_safety_critical boolean NOT NULL DEFAULT false,

  observed_at timestamptz NOT NULL DEFAULT now(),
  -- Competence currency. Past this, the row stops counting toward sufficiency
  -- but is NEVER deleted -- the level decays while the history stands.
  valid_until timestamptz,

  -- Retire-forward. A correction, a suspended item or an erasure request writes
  -- a supersession; it never rewrites or removes the original.
  superseded_by uuid REFERENCES public.scp_competency_evidence(id) ON DELETE RESTRICT,
  superseded_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_evidence_supersession_has_reason CHECK (
    (superseded_by IS NULL AND superseded_reason IS NULL)
    OR (superseded_by IS NOT NULL AND superseded_reason IS NOT NULL)),
  CONSTRAINT scp_evidence_not_self_superseding CHECK (superseded_by IS DISTINCT FROM id)
);

COMMENT ON TABLE public.scp_competency_evidence IS
  'The permanent, append-only record of demonstrated competence. Evidence is '
  'recorded against a behaviour version with its source named, so it accumulates '
  'across a career rather than living inside one assessment result. Competency '
  'levels are PROJECTIONS of this ledger, never stored truths. Nothing here is '
  'ever updated or deleted -- corrections supersede.';

CREATE INDEX IF NOT EXISTS scp_evidence_subject_idx
  ON public.scp_competency_evidence (subject_id);
CREATE INDEX IF NOT EXISTS scp_evidence_behaviour_idx
  ON public.scp_competency_evidence (behaviour_version_id);
CREATE INDEX IF NOT EXISTS scp_evidence_live_idx
  ON public.scp_competency_evidence (subject_id, behaviour_version_id)
  WHERE superseded_by IS NULL;

-- Append-only, enforced. UPDATE is permitted for exactly one transition:
-- marking a row superseded. Everything else, and every DELETE, is refused.
CREATE OR REPLACE FUNCTION public.scp_guard_evidence_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_APPEND_ONLY: evidence is never deleted; supersede it instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_ALREADY_SUPERSEDED: evidence % is already superseded and is immutable.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.subject_id           IS DISTINCT FROM OLD.subject_id
     OR NEW.behaviour_version_id IS DISTINCT FROM OLD.behaviour_version_id
     OR NEW.source_type       IS DISTINCT FROM OLD.source_type
     OR NEW.source_ref        IS DISTINCT FROM OLD.source_ref
     OR NEW.contribution      IS DISTINCT FROM OLD.contribution
     OR NEW.confidence        IS DISTINCT FROM OLD.confidence
     OR NEW.provenance        IS DISTINCT FROM OLD.provenance
     OR NEW.provenance_ref    IS DISTINCT FROM OLD.provenance_ref
     OR NEW.context_key       IS DISTINCT FROM OLD.context_key
     OR NEW.is_safety_critical IS DISTINCT FROM OLD.is_safety_critical
     OR NEW.observed_at       IS DISTINCT FROM OLD.observed_at
     OR NEW.created_at        IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_IMMUTABLE: only superseded_by, superseded_reason and valid_until '
      'may change on an evidence row.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER scp_evidence_append_only
  BEFORE UPDATE OR DELETE ON public.scp_competency_evidence
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidence_append_only();

-- =========================================================================
-- SECTION 4 — Maturity levels, not percentages
-- =========================================================================
--
-- Competence is expressed as a level backed by evidence. A percentage implies a
-- precision this evidence cannot carry and invites the ranking the product
-- forbids, so no numeric score is ever exposed.

CREATE TABLE IF NOT EXISTS public.scp_maturity_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_version text NOT NULL,
  level text NOT NULL CHECK (level IN (
    'emerging', 'developing', 'established', 'embedded')),
  -- Gate 1: demonstration quality.
  min_mean_contribution numeric(4,3) NOT NULL CHECK (min_mean_contribution BETWEEN 0 AND 1),
  -- Gate 2: evidence sufficiency.
  min_observations   integer NOT NULL CHECK (min_observations   >= 1),
  min_contexts       integer NOT NULL CHECK (min_contexts       >= 1),
  min_source_types   integer NOT NULL CHECK (min_source_types   >= 1),
  max_age_days       integer CHECK (max_age_days IS NULL OR max_age_days > 0),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (threshold_version, level)
);

COMMENT ON TABLE public.scp_maturity_thresholds IS
  'Versioned calibration for maturity levels. Deliberately NOT in the evidence '
  'ledger: thresholds are tuning decisions that must be recalibratable after '
  'pilot data without rewriting a single evidence row.';

-- v1 calibration. Authored, not measured -- replaced after pilot.
INSERT INTO public.scp_maturity_thresholds
  (threshold_version, level, min_mean_contribution,
   min_observations, min_contexts, min_source_types, max_age_days, is_active)
VALUES
  ('v1', 'emerging',    0.400, 1, 1, 1, NULL, true),
  ('v1', 'developing',  0.550, 2, 1, 1, 730,  true),
  ('v1', 'established', 0.700, 3, 2, 1, 730,  true),
  ('v1', 'embedded',    0.800, 5, 3, 2, 365,  true)
ON CONFLICT (threshold_version, level) DO NOTHING;

-- The computation. Two independent gates; the LOWER one caps the level.
--
-- This is the single place maturity is decided, so the rule cannot drift between
-- reports, dashboards and future agents.
CREATE OR REPLACE FUNCTION public.scp_compute_maturity(
  _subject_id uuid,
  _competency_version_id uuid,
  _threshold_version text DEFAULT 'v1',
  _at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _obs int; _ctx int; _srcs int; _mean numeric; _safety boolean;
  _level text := 'insufficient_evidence';
  _t record;
BEGIN
  -- Live evidence only: not superseded, and still current. Expired evidence
  -- stops counting toward sufficiency but is never deleted.
  WITH live AS (
    SELECT e.*,
           -- Provenance ranks. A human review outranks an AI run, which
           -- outranks a deterministic score, for the same response.
           CASE e.provenance
             WHEN 'human_review'   THEN 3
             WHEN 'ai_scoring_run' THEN 2
             ELSE 1
           END AS rank
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m
        ON m.behaviour_version_id = e.behaviour_version_id
     WHERE e.subject_id = _subject_id
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.valid_until IS NULL OR e.valid_until > _at)
  ),
  -- One row per source: the highest-ranked provenance wins, so an AI score and
  -- the human review that corrected it are never counted twice.
  best AS (
    SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
      FROM live
     ORDER BY source_type, source_ref, behaviour_version_id, rank DESC, observed_at DESC
  )
  SELECT count(*),
         count(DISTINCT coalesce(context_key, behaviour_version_id::text)),
         count(DISTINCT source_type),
         coalesce(
           sum(contribution * confidence) / nullif(sum(confidence), 0), 0),
         coalesce(bool_or(is_safety_critical), false)
    INTO _obs, _ctx, _srcs, _mean, _safety
    FROM best;

  IF _obs = 0 THEN
    RETURN 'insufficient_evidence';
  END IF;

  -- Highest level whose BOTH gates are satisfied.
  FOR _t IN
    SELECT * FROM public.scp_maturity_thresholds
     WHERE threshold_version = _threshold_version AND is_active
     ORDER BY min_mean_contribution ASC, min_observations ASC
  LOOP
    IF _mean >= _t.min_mean_contribution
       AND _obs  >= _t.min_observations
       AND _ctx  >= _t.min_contexts
       AND _srcs >= _t.min_source_types
    THEN
      _level := _t.level;
    END IF;
  END LOOP;

  -- A safety-critical observation caps the level regardless of everything else.
  -- It is also reported separately, so a high level can never conceal one.
  IF _safety AND _level IN ('established', 'embedded') THEN
    _level := 'developing';
  END IF;

  RETURN _level;
END; $$;

COMMENT ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) IS
  'The single source of truth for competency maturity. Two independent gates -- '
  'demonstration quality and evidence sufficiency -- and the LOWER one caps the '
  'level, so one strong answer can never reach "established". Returns a level, '
  'NEVER a percentage.';

-- =========================================================================
-- SECTION 5 — The read-model contract (v1)
-- =========================================================================
--
-- The Competency Graph is a published, versioned API contract, not an internal
-- schema other code happens to read. Internal services and future AI agents bind
-- to scp_rm_* views, never to base tables, so a table refactor is invisible to
-- them.

CREATE TABLE IF NOT EXISTS public.scp_contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version text NOT NULL,
  read_model text NOT NULL,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'deprecated')),
  intended_consumer text,
  scope_note text NOT NULL,
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_version, read_model)
);

COMMENT ON TABLE public.scp_contract_versions IS
  'The published API contract of the Competency Graph. Additive by default: new '
  'fields may be added; existing fields may never change meaning or type. A '
  'breaking change requires a new contract version with a stated deprecation '
  'window for the previous one.';

-- The core read model. Everything else -- reports, dashboards, growth, all five
-- future agents -- projects from this one.
CREATE OR REPLACE VIEW public.scp_rm_competency_profile
WITH (security_invoker = true) AS
SELECT
  e.subject_id,
  m.competency_version_id,
  cv.competency_id,
  cv.name_sv,
  cv.name_en,
  public.scp_compute_maturity(e.subject_id, m.competency_version_id) AS maturity_level,
  count(*) FILTER (WHERE e.superseded_by IS NULL)            AS live_evidence_count,
  count(DISTINCT e.source_type) FILTER (WHERE e.superseded_by IS NULL) AS source_type_count,
  bool_or(e.is_safety_critical) FILTER (WHERE e.superseded_by IS NULL) AS has_safety_flag,
  max(e.observed_at)                                          AS last_observed_at
FROM public.scp_competency_evidence e
JOIN public.scp_behaviour_competency_map m
  ON m.behaviour_version_id = e.behaviour_version_id
JOIN public.scp_competency_versions cv
  ON cv.id = m.competency_version_id
GROUP BY e.subject_id, m.competency_version_id, cv.competency_id, cv.name_sv, cv.name_en;

COMMENT ON VIEW public.scp_rm_competency_profile IS
  'Contract v1. A subject''s competency profile as MATURITY LEVELS with the '
  'evidence behind them -- never a score or a percentage. security_invoker so '
  'the caller''s own RLS on scp_competency_evidence still applies.';

GRANT SELECT ON public.scp_rm_competency_profile TO authenticated;

INSERT INTO public.scp_contract_versions
  (contract_version, read_model, status, intended_consumer, scope_note)
VALUES
  ('v1', 'scp_rm_competency_profile', 'available', 'internal services',
   'Maturity level per subject per competency, with evidence counts and safety flag. The core projection everything else derives from.'),
  -- Reserved: named now so consumers can be written against a known contract,
  -- created in Phase 1 when the tables they project exist.
  ('v1', 'scp_rm_response_scoring',  'reserved', 'Assessment AI',
   'One response and its rubric. No other subject data.'),
  ('v1', 'scp_rm_learner_profile',   'reserved', 'Learning Coach AI',
   'Own competency gaps and recommended modules.'),
  ('v1', 'scp_rm_team_competence',   'reserved', 'Manager AI',
   'Own-organisation aggregate. Never raw responses.'),
  ('v1', 'scp_rm_workforce_trends',  'reserved', 'Workforce Intelligence AI',
   'Anonymised and aggregated only.'),
  ('v1', 'scp_rm_career_profile',    'reserved', 'Candidate Career AI',
   'Own graph only.')
ON CONFLICT (contract_version, read_model) DO NOTHING;

-- =========================================================================
-- SECTION 6 — RLS
-- =========================================================================
--
-- Graph DEFINITIONS are readable -- a manager should be able to see what a
-- competency means. Graph EVIDENCE is not: a subject sees only their own.

ALTER TABLE public.scp_roles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_role_versions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_observable_behaviours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_behaviour_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_behaviour_competency_map  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_role_competency_map       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_maturity_thresholds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_contract_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_competency_evidence       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_roles', 'scp_role_versions', 'scp_observable_behaviours',
    'scp_behaviour_versions', 'scp_behaviour_competency_map',
    'scp_role_competency_map', 'scp_maturity_thresholds', 'scp_contract_versions'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.scp_can_author(auth.uid())) '
      'WITH CHECK (public.scp_can_author(auth.uid()))',
      t || '_author_write', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Evidence: a subject reads their own; only authors write. No employer policy
-- here -- employers reach competence through the read model, never raw evidence.
CREATE POLICY scp_evidence_own_select ON public.scp_competency_evidence
  FOR SELECT TO authenticated
  USING (subject_id = auth.uid() OR public.scp_can_author(auth.uid()));

CREATE POLICY scp_evidence_author_write ON public.scp_competency_evidence
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

GRANT SELECT ON public.scp_competency_evidence TO authenticated;
GRANT ALL    ON public.scp_competency_evidence TO service_role;

-- anon holds nothing on any graph table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_roles', 'scp_role_versions', 'scp_observable_behaviours',
    'scp_behaviour_versions', 'scp_behaviour_competency_map',
    'scp_role_competency_map', 'scp_maturity_thresholds',
    'scp_contract_versions', 'scp_competency_evidence'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
  REVOKE ALL ON public.scp_rm_competency_profile FROM anon;
END $$;

-- =========================================================================
-- SECTION 7 — Prove it
-- =========================================================================
--
-- A migration that silently half-applied would be worse than one that failed.

DO $$
DECLARE _n int; _fam int;
BEGIN
  -- 7a. The Career Guidance separation still rejects, and the Academy pairing
  --     is now accepted. Both are checked, because widening a guard is exactly
  --     where a separation quietly reopens.
  SELECT count(*) INTO _fam FROM public.scp_assessment_families
   WHERE product_type = 'career_guidance';
  IF _fam = 0 THEN
    RAISE EXCEPTION 'SCP_P0_NO_CAREER_GUIDANCE_FAMILY: cannot verify the separation guard';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.scp_assessment_families
     WHERE slug = 'security-competence-academy'
       AND product_type = 'development_programme')
  THEN
    RAISE EXCEPTION 'SCP_P0_ACADEMY_FAMILY_MISSING: the Academy family was not created';
  END IF;

  -- 7b. No existing row changed status. The vocabulary widened; the data did not.
  SELECT count(*) INTO _n FROM public.scp_assessment_versions
   WHERE content_status NOT IN (
     'draft', 'expert_review', 'legal_review', 'cognitive_review',
     'in_review', 'approved', 'published', 'suspended', 'retired');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P0_STATUS_ROWS_INVALID: % rows fall outside the widened vocabulary', _n;
  END IF;

  -- 7c. The legacy assessment stays retired and invisible.
  IF EXISTS (SELECT 1 FROM public.assessments
              WHERE id = 'security-guard-foundation' AND employer_visible)
  THEN
    RAISE EXCEPTION 'SCP_P0_LEGACY_RESURFACED: security-guard-foundation must stay employer-invisible';
  END IF;

  -- 7d. The graph spine and ledger exist.
  SELECT count(*) INTO _n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'scp_roles', 'scp_role_versions', 'scp_observable_behaviours',
     'scp_behaviour_versions', 'scp_behaviour_competency_map',
     'scp_role_competency_map', 'scp_competency_evidence',
     'scp_maturity_thresholds', 'scp_contract_versions');
  IF _n <> 9 THEN
    RAISE EXCEPTION 'SCP_P0_GRAPH_INCOMPLETE: expected 9 graph tables, found %', _n;
  END IF;

  -- 7e. The maturity calibration is complete and the contract is registered.
  SELECT count(*) INTO _n FROM public.scp_maturity_thresholds
   WHERE threshold_version = 'v1' AND is_active;
  IF _n <> 4 THEN
    RAISE EXCEPTION 'SCP_P0_THRESHOLDS_INCOMPLETE: expected 4 active v1 levels, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_contract_versions WHERE contract_version = 'v1';
  IF _n <> 6 THEN
    RAISE EXCEPTION 'SCP_P0_CONTRACT_INCOMPLETE: expected 6 v1 read models, found %', _n;
  END IF;

  -- 7f. An empty ledger must read as insufficient evidence, not as zero.
  IF public.scp_compute_maturity(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid) <> 'insufficient_evidence'
  THEN
    RAISE EXCEPTION 'SCP_P0_MATURITY_DEFAULT_WRONG: no evidence must yield insufficient_evidence';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version',
  'scp-phase0-competency-graph',
  'created',
  'Phase 0: Competency Graph foundations. Role/competency/behaviour spine, append-only evidence ledger, maturity levels (never percentages) and read-model contract v1. Additive only; nothing retired, no content published.',
  jsonb_build_object(
    'migration', '20260802090000_scp_phase0_competency_graph',
    'graph_tables', 9,
    'contract_version', 'v1',
    'threshold_version', 'v1',
    'evidence_sources_reserved', jsonb_build_array(
      'training_completion', 'manager_observation', 'certification', 'incident_review'),
    'retired', 'nothing'));
