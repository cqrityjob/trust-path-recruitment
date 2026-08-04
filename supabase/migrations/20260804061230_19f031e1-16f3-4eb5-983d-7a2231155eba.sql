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

ALTER TABLE public.scp_assessment_versions
  DROP CONSTRAINT IF EXISTS scp_assessment_versions_content_status_check;
ALTER TABLE public.scp_assessment_versions
  ADD CONSTRAINT scp_assessment_versions_content_status_check
  CHECK (content_status IN (
    'draft', 'expert_review', 'legal_review', 'cognitive_review',
    'in_review', 'approved', 'published', 'suspended', 'retired'));

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

  IF NEW.purpose = 'development_programme' AND _product_type <> 'development_programme' THEN
    RAISE EXCEPTION
      'SCP_FAMILY_PURPOSE_MISMATCH: purpose "development_programme" requires a development_programme family.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

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

CREATE TABLE IF NOT EXISTS public.scp_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_subjects IS
  'Pseudonymous subject of competence evidence. Deliberately carries NO '
  'attributes at all -- not a name, not an email, not a reference to auth.users. '
  'The identity mapping lives in scp_subject_identities so it can be revoked '
  'without touching the evidence ledger.';

CREATE TABLE IF NOT EXISTS public.scp_subject_identities (
  subject_id uuid PRIMARY KEY REFERENCES public.scp_subjects(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
COMMENT ON TABLE public.scp_subject_identities IS
  'The ONLY place a pseudonymous subject resolves to a real account. Deleting a '
  'row here unlinks a person from their evidence permanently and is the '
  'supported erasure path; ON DELETE CASCADE from auth.users means account '
  'deletion unlinks rather than destroying evidence. Restricted to the subject '
  'themselves and platform admins -- never readable by an employer.';

CREATE TABLE IF NOT EXISTS public.scp_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.scp_jurisdictions (code, name_sv, name_en, is_active)
VALUES ('SE', 'Sverige', 'Sweden', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.scp_evidence_source_types (
  code text PRIMARY KEY,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  has_active_writer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.scp_evidence_source_types (code, name_sv, name_en, has_active_writer)
VALUES
  ('assessment_response', 'Bedömningssvar',        'Assessment response',   true),
  ('training_completion', 'Genomförd utbildning',  'Training completion',   false),
  ('manager_observation', 'Chefsobservation',      'Manager observation',   false),
  ('certification',       'Certifiering',          'Certification',         false),
  ('verified_credential', 'Verifierat intyg',      'Verified credential',   false),
  ('practical_exercise',  'Praktisk övning',       'Practical exercise',    false),
  ('incident_review',     'Händelsegenomgång',     'Incident review',       false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.scp_processing_purposes (
  code text PRIMARY KEY,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.scp_processing_purposes (code, name_sv, name_en, is_active)
VALUES
  ('competence_development', 'Kompetensutveckling',  'Competence development', true),
  ('reassessment',           'Omvärdering',          'Reassessment',           false),
  ('training_follow_up',     'Utbildningsuppföljning','Training follow-up',    false),
  ('selection_support',      'Urvalsstöd',           'Selection support',      false),
  ('compliance_support',     'Regelefterlevnad',     'Compliance support',     false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.scp_purpose_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose_code text NOT NULL REFERENCES public.scp_processing_purposes(code) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  privacy_notice_version text NOT NULL,
  lawful_basis_reference text NOT NULL,
  jurisdiction_id uuid NOT NULL REFERENCES public.scp_jurisdictions(id) ON DELETE RESTRICT,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purpose_code, version_number, jurisdiction_id)
);
COMMENT ON TABLE public.scp_purpose_versions IS
  'What the participant was actually told, versioned. Evidence pins a row here, '
  'so the privacy notice and lawful basis in force at collection time stay '
  'reconstructable forever without duplicating them onto every row.';

CREATE TABLE IF NOT EXISTS public.scp_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  profession_id uuid REFERENCES public.scp_professions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_roles IS
  'Stable identity for a security role. Role-NEUTRAL by design: the graph must '
  'serve the whole security industry, not only security guards. Carries no text; '
  'wording lives in scp_role_versions.';

CREATE TABLE IF NOT EXISTS public.scp_role_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.scp_roles(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  jurisdiction_id uuid REFERENCES public.scp_jurisdictions(id) ON DELETE RESTRICT,
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

CREATE TABLE IF NOT EXISTS public.scp_observable_behaviours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_observable_behaviours IS
  'The join point of the Competency Graph. Every assessment item maps to exactly '
  'one behaviour; every behaviour maps to one or more competencies. Evidence is '
  'recorded against a behaviour VERSION, never against an item or an assessment, '
  'so services never depend on assessment content.';

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
  positive_indicators_sv text[] NOT NULL DEFAULT '{}',
  contraindications_sv text[] NOT NULL DEFAULT '{}',
  is_safety_critical boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (behaviour_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.scp_behaviour_competency_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  behaviour_version_id uuid NOT NULL
    REFERENCES public.scp_behaviour_versions(id) ON DELETE RESTRICT,
  competency_version_id uuid NOT NULL
    REFERENCES public.scp_competency_versions(id) ON DELETE RESTRICT,
  weight numeric(4,3) NOT NULL DEFAULT 1.000 CHECK (weight > 0 AND weight <= 1),
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

CREATE TABLE IF NOT EXISTS public.scp_competency_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  subject_id uuid NOT NULL REFERENCES public.scp_subjects(id) ON DELETE RESTRICT,

  behaviour_version_id uuid NOT NULL
    REFERENCES public.scp_behaviour_versions(id) ON DELETE RESTRICT,

  source_type text NOT NULL
    REFERENCES public.scp_evidence_source_types(code) ON DELETE RESTRICT,
  source_ref uuid,
  source_snapshot_hash text,

  provenance_type text NOT NULL CHECK (provenance_type IN (
    'deterministic', 'ai_scoring_run', 'human_review')),
  provenance_ref uuid,
  scoring_model_version text,
  created_by_service text,
  assessor_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  issuer_organization_id uuid REFERENCES public.employers(id) ON DELETE RESTRICT,

  jurisdiction_id uuid REFERENCES public.scp_jurisdictions(id) ON DELETE RESTRICT,
  purpose_version_id uuid REFERENCES public.scp_purpose_versions(id) ON DELETE RESTRICT,

  context_type text CHECK (context_type IN (
    'assessment_form', 'scenario', 'module', 'practical_exercise',
    'site', 'incident')),
  context_ref uuid,
  role_version_id uuid REFERENCES public.scp_role_versions(id) ON DELETE RESTRICT,

  contribution numeric(4,3) NOT NULL CHECK (contribution >= 0 AND contribution <= 1),
  confidence   numeric(4,3) NOT NULL CHECK (confidence   >= 0 AND confidence   <= 1),

  is_safety_critical boolean NOT NULL DEFAULT false,
  safety_severity text CHECK (safety_severity IN ('low','medium','high','critical')),
  requires_human_review boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'not_required'
    CHECK (review_status IN ('not_required','pending','in_review','upheld','overturned')),

  disclosure_class text NOT NULL DEFAULT 'internal_employer'
    CHECK (disclosure_class IN (
      'internal_employer', 'participant_visible', 'shareable_projection_eligible')),

  observed_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,

  superseded_by uuid REFERENCES public.scp_competency_evidence(id) ON DELETE RESTRICT,
  superseded_reason text,
  superseded_at timestamptz,
  superseded_by_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_evidence_supersession_complete CHECK (
    (superseded_by IS NULL AND superseded_reason IS NULL AND superseded_at IS NULL)
    OR (superseded_by IS NOT NULL AND superseded_reason IS NOT NULL
        AND superseded_at IS NOT NULL)),
  CONSTRAINT scp_evidence_not_self_superseding CHECK (superseded_by IS DISTINCT FROM id),
  CONSTRAINT scp_evidence_context_pair CHECK (
    (context_type IS NULL AND context_ref IS NULL)
    OR (context_type IS NOT NULL)),
  CONSTRAINT scp_evidence_safety_is_specified CHECK (
    NOT is_safety_critical OR safety_severity IS NOT NULL)
);

COMMENT ON TABLE public.scp_competency_evidence IS
  'The permanent, append-only record of DEMONSTRATED BEHAVIOUR -- not of a '
  'person''s character, honesty, motivation or future performance. Evidence is '
  'recorded against a behaviour version, from a named source, under a named '
  'jurisdiction and processing purpose, so it accumulates across a career and '
  'stays interpretable. Contains NO name, email, personal identity number or '
  'free text: the subject is pseudonymous and resolves only through '
  'scp_subject_identities. Maturity levels are PROJECTIONS of this ledger, '
  'never stored truths. Corrections supersede; identity erasure unlinks.';

COMMENT ON COLUMN public.scp_competency_evidence.disclosure_class IS
  'Classification only -- no sharing workflow exists. Recorded at write time '
  'because retrofitting it would mean guessing the intended disclosure of '
  'historical evidence. A future Security Passport reads a controlled '
  'projection filtered on this; it never reads this table, and never reaches '
  'items, answer keys, rubrics, prompts or reviewer comments.';

CREATE INDEX IF NOT EXISTS scp_evidence_subject_idx
  ON public.scp_competency_evidence (subject_id);
CREATE INDEX IF NOT EXISTS scp_evidence_behaviour_idx
  ON public.scp_competency_evidence (behaviour_version_id);
CREATE INDEX IF NOT EXISTS scp_evidence_issuer_idx
  ON public.scp_competency_evidence (issuer_organization_id);
CREATE INDEX IF NOT EXISTS scp_evidence_live_idx
  ON public.scp_competency_evidence (subject_id, behaviour_version_id)
  WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS scp_evidence_review_queue_idx
  ON public.scp_competency_evidence (review_status)
  WHERE requires_human_review AND review_status IN ('pending','in_review');

CREATE OR REPLACE FUNCTION public.scp_guard_evidence_source_has_writer()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _ok boolean;
BEGIN
  SELECT has_active_writer INTO _ok
    FROM public.scp_evidence_source_types WHERE code = NEW.source_type;
  IF NOT coalesce(_ok, false) THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_SOURCE_NOT_ENABLED: source type "%" is reserved and has no '
      'active writer; enable it deliberately before producing evidence.',
      NEW.source_type USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_evidence_source_must_have_writer
  BEFORE INSERT ON public.scp_competency_evidence
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidence_source_has_writer();

CREATE OR REPLACE FUNCTION public.scp_guard_evidence_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_APPEND_ONLY: evidence is never deleted; supersede it, or '
      'unlink the subject identity if erasure is required.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_ALREADY_SUPERSEDED: evidence % is already superseded and is immutable.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.subject_id             IS DISTINCT FROM OLD.subject_id
     OR NEW.behaviour_version_id   IS DISTINCT FROM OLD.behaviour_version_id
     OR NEW.source_type           IS DISTINCT FROM OLD.source_type
     OR NEW.source_ref            IS DISTINCT FROM OLD.source_ref
     OR NEW.source_snapshot_hash  IS DISTINCT FROM OLD.source_snapshot_hash
     OR NEW.provenance_type       IS DISTINCT FROM OLD.provenance_type
     OR NEW.provenance_ref        IS DISTINCT FROM OLD.provenance_ref
     OR NEW.scoring_model_version IS DISTINCT FROM OLD.scoring_model_version
     OR NEW.created_by_service    IS DISTINCT FROM OLD.created_by_service
     OR NEW.assessor_actor_id     IS DISTINCT FROM OLD.assessor_actor_id
     OR NEW.issuer_organization_id IS DISTINCT FROM OLD.issuer_organization_id
     OR NEW.jurisdiction_id       IS DISTINCT FROM OLD.jurisdiction_id
     OR NEW.purpose_version_id    IS DISTINCT FROM OLD.purpose_version_id
     OR NEW.context_type          IS DISTINCT FROM OLD.context_type
     OR NEW.context_ref           IS DISTINCT FROM OLD.context_ref
     OR NEW.role_version_id       IS DISTINCT FROM OLD.role_version_id
     OR NEW.contribution          IS DISTINCT FROM OLD.contribution
     OR NEW.confidence            IS DISTINCT FROM OLD.confidence
     OR NEW.is_safety_critical    IS DISTINCT FROM OLD.is_safety_critical
     OR NEW.safety_severity       IS DISTINCT FROM OLD.safety_severity
     OR NEW.disclosure_class      IS DISTINCT FROM OLD.disclosure_class
     OR NEW.observed_at           IS DISTINCT FROM OLD.observed_at
     OR NEW.created_at            IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_IMMUTABLE: only superseded_by/_reason/_at/_by_actor_id, '
      'review_status, requires_human_review and valid_until may change.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER scp_evidence_append_only
  BEFORE UPDATE OR DELETE ON public.scp_competency_evidence
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidence_append_only();

CREATE TABLE IF NOT EXISTS public.scp_maturity_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_version text NOT NULL,
  level text NOT NULL CHECK (level IN (
    'limited_evidence', 'developing_evidence', 'consistent_evidence', 'strong_evidence')),
  min_mean_contribution numeric(4,3) NOT NULL CHECK (min_mean_contribution BETWEEN 0 AND 1),
  min_observations   integer NOT NULL CHECK (min_observations   >= 1),
  min_contexts       integer NOT NULL CHECK (min_contexts       >= 1),
  min_source_types   integer NOT NULL CHECK (min_source_types   >= 1),
  max_age_days       integer CHECK (max_age_days IS NULL OR max_age_days > 0),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (threshold_version, level)
);

COMMENT ON TABLE public.scp_maturity_thresholds IS
  'Versioned calibration for evidence maturity. Deliberately NOT in the ledger: '
  'thresholds are tuning decisions that must be recalibratable after pilot data '
  'without rewriting a single evidence row.';

INSERT INTO public.scp_maturity_thresholds
  (threshold_version, level, min_mean_contribution,
   min_observations, min_contexts, min_source_types, max_age_days, is_active)
VALUES
  ('v1', 'limited_evidence',    0.400, 1, 1, 1, NULL, true),
  ('v1', 'developing_evidence', 0.550, 2, 1, 1, 730,  true),
  ('v1', 'consistent_evidence', 0.700, 3, 2, 1, 730,  true),
  ('v1', 'strong_evidence',     0.800, 5, 3, 2, 365,  true)
ON CONFLICT (threshold_version, level) DO NOTHING;

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
  _level text := 'no_evidence';
  _t record;
BEGIN
  WITH live AS (
    SELECT e.*,
           CASE e.provenance_type
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
  best AS (
    SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
      FROM live
     ORDER BY source_type, source_ref, behaviour_version_id, rank DESC, observed_at DESC
  )
  SELECT count(*),
         count(DISTINCT coalesce(
           context_type || ':' || coalesce(context_ref::text, ''),
           behaviour_version_id::text)),
         count(DISTINCT source_type),
         coalesce(sum(contribution * confidence) / nullif(sum(confidence), 0), 0),
         coalesce(bool_or(is_safety_critical), false)
    INTO _obs, _ctx, _srcs, _mean, _safety
    FROM best;

  IF _obs = 0 THEN
    RETURN 'no_evidence';
  END IF;

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

  IF _safety AND _level IN ('consistent_evidence', 'strong_evidence') THEN
    _level := 'developing_evidence';
  END IF;

  RETURN _level;
END; $$;

COMMENT ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) IS
  'The single source of truth for evidence maturity. Two independent gates -- '
  'demonstration quality and evidence sufficiency -- and the LOWER one caps the '
  'level, so one strong answer can never reach "consistent_evidence". Returns a '
  'level describing the EVIDENCE, never a percentage and never a claim about '
  'the person.';

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
  'fields may be added; existing fields may never change meaning or type. This '
  'is what stops future services -- including any Security Passport -- from '
  'depending directly on assessment items, keys, rubrics or prompts.';

CREATE OR REPLACE VIEW public.scp_rm_competency_profile
WITH (security_invoker = true) AS
SELECT
  e.subject_id,
  m.competency_version_id,
  cv.competency_id,
  cv.name_sv,
  cv.name_en,
  public.scp_compute_maturity(e.subject_id, m.competency_version_id) AS maturity_level,
  count(*) FILTER (WHERE e.superseded_by IS NULL)                      AS live_evidence_count,
  count(DISTINCT e.source_type) FILTER (WHERE e.superseded_by IS NULL) AS source_type_count,
  bool_or(e.is_safety_critical) FILTER (WHERE e.superseded_by IS NULL) AS has_safety_flag,
  bool_or(e.requires_human_review AND e.review_status IN ('pending','in_review'))
    FILTER (WHERE e.superseded_by IS NULL)                             AS has_open_review,
  max(e.observed_at)                                                   AS last_observed_at
FROM public.scp_competency_evidence e
JOIN public.scp_behaviour_competency_map m
  ON m.behaviour_version_id = e.behaviour_version_id
JOIN public.scp_competency_versions cv
  ON cv.id = m.competency_version_id
GROUP BY e.subject_id, m.competency_version_id, cv.competency_id, cv.name_sv, cv.name_en;

COMMENT ON VIEW public.scp_rm_competency_profile IS
  'Contract v1. Maturity LEVELS with the evidence behind them -- never a score, '
  'percentage or rank. security_invoker so the caller''s own RLS still applies.';

GRANT SELECT ON public.scp_rm_competency_profile TO authenticated;

INSERT INTO public.scp_contract_versions
  (contract_version, read_model, status, intended_consumer, scope_note)
VALUES
  ('v1', 'scp_rm_competency_profile', 'available', 'internal services',
   'Maturity level per subject per competency, with evidence counts, safety flag and open-review flag.'),
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

ALTER TABLE public.scp_subjects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_subject_identities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_jurisdictions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_evidence_source_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_processing_purposes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_purpose_versions          ENABLE ROW LEVEL SECURITY;
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
    'scp_jurisdictions', 'scp_evidence_source_types', 'scp_processing_purposes',
    'scp_purpose_versions', 'scp_roles', 'scp_role_versions',
    'scp_observable_behaviours', 'scp_behaviour_versions',
    'scp_behaviour_competency_map', 'scp_role_competency_map',
    'scp_maturity_thresholds', 'scp_contract_versions'
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

CREATE POLICY scp_subject_identities_self ON public.scp_subject_identities
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY scp_subject_identities_admin_write ON public.scp_subject_identities
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY scp_subjects_self ON public.scp_subjects
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.scp_subject_identities i
             WHERE i.subject_id = scp_subjects.id AND i.user_id = auth.uid())
    OR public.scp_can_author(auth.uid()));
CREATE POLICY scp_subjects_author_write ON public.scp_subjects
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

CREATE POLICY scp_evidence_own_select ON public.scp_competency_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.scp_subject_identities i
             WHERE i.subject_id = scp_competency_evidence.subject_id
               AND i.user_id = auth.uid())
    OR public.scp_can_author(auth.uid()));
CREATE POLICY scp_evidence_author_write ON public.scp_competency_evidence
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

GRANT SELECT ON public.scp_subjects            TO authenticated;
GRANT SELECT ON public.scp_subject_identities  TO authenticated;
GRANT SELECT ON public.scp_competency_evidence TO authenticated;
GRANT ALL    ON public.scp_subjects            TO service_role;
GRANT ALL    ON public.scp_subject_identities  TO service_role;
GRANT ALL    ON public.scp_competency_evidence TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_subjects', 'scp_subject_identities', 'scp_jurisdictions',
    'scp_evidence_source_types', 'scp_processing_purposes', 'scp_purpose_versions',
    'scp_roles', 'scp_role_versions', 'scp_observable_behaviours',
    'scp_behaviour_versions', 'scp_behaviour_competency_map',
    'scp_role_competency_map', 'scp_maturity_thresholds',
    'scp_contract_versions', 'scp_competency_evidence'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
  REVOKE ALL ON public.scp_rm_competency_profile FROM anon;
END $$;

DO $$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.scp_assessment_families
                  WHERE product_type = 'career_guidance') THEN
    RAISE EXCEPTION 'SCP_P0_NO_CAREER_GUIDANCE_FAMILY: cannot verify the separation guard';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_assessment_families
                  WHERE slug = 'security-competence-academy'
                    AND product_type = 'development_programme') THEN
    RAISE EXCEPTION 'SCP_P0_ACADEMY_FAMILY_MISSING';
  END IF;

  SELECT count(*) INTO _n FROM public.scp_assessment_versions
   WHERE content_status NOT IN ('draft','expert_review','legal_review',
     'cognitive_review','in_review','approved','published','suspended','retired');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P0_STATUS_ROWS_INVALID: % rows outside the vocabulary', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.assessments
              WHERE id = 'security-guard-foundation' AND employer_visible) THEN
    RAISE EXCEPTION 'SCP_P0_LEGACY_RESURFACED';
  END IF;

  SELECT count(*) INTO _n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'scp_subjects','scp_subject_identities','scp_jurisdictions',
     'scp_evidence_source_types','scp_processing_purposes','scp_purpose_versions',
     'scp_roles','scp_role_versions','scp_observable_behaviours',
     'scp_behaviour_versions','scp_behaviour_competency_map',
     'scp_role_competency_map','scp_competency_evidence',
     'scp_maturity_thresholds','scp_contract_versions');
  IF _n <> 15 THEN
    RAISE EXCEPTION 'SCP_P0_GRAPH_INCOMPLETE: expected 15 graph tables, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_competency_evidence'
     AND (column_name ILIKE '%name%' OR column_name ILIKE '%email%'
       OR column_name ILIKE '%personnummer%' OR column_name ILIKE '%national_id%'
       OR column_name ILIKE '%comment%' OR column_name ILIKE '%note%');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P0_LEDGER_HOLDS_IDENTITY: % identifying columns found', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_evidence_source_types WHERE has_active_writer;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_P0_SOURCE_WRITERS: expected exactly 1 active writer, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_processing_purposes WHERE is_active;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_P0_PURPOSES: expected exactly 1 active purpose, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_maturity_thresholds
   WHERE threshold_version = 'v1' AND is_active;
  IF _n <> 4 THEN
    RAISE EXCEPTION 'SCP_P0_THRESHOLDS_INCOMPLETE: expected 4, found %', _n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_maturity_thresholds WHERE level = 'expert') THEN
    RAISE EXCEPTION 'SCP_P0_EXPERT_LEVEL_PRESENT: expert is out of scope for the MVP';
  END IF;

  SELECT count(*) INTO _n FROM public.scp_contract_versions WHERE contract_version = 'v1';
  IF _n <> 6 THEN
    RAISE EXCEPTION 'SCP_P0_CONTRACT_INCOMPLETE: expected 6, found %', _n;
  END IF;

  IF public.scp_compute_maturity(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid) <> 'no_evidence' THEN
    RAISE EXCEPTION 'SCP_P0_MATURITY_DEFAULT_WRONG';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version',
  'scp-phase0-competency-graph',
  'created',
  'Phase 0 (hardened): Security Competency Graph foundations. Pseudonymous subject separation, role/competency/behaviour spine, append-only evidence ledger with issuer, assessor, jurisdiction, processing purpose, context and disclosure classification, evidence maturity levels (never percentages) and read-model contract v1. Additive only; nothing retired, no content published.',
  jsonb_build_object(
    'migration', '20260802090000_scp_phase0_competency_graph',
    'graph_tables', 15,
    'contract_version', 'v1',
    'threshold_version', 'v1',
    'active_evidence_sources', jsonb_build_array('assessment_response'),
    'active_purposes', jsonb_build_array('competence_development'),
    'jurisdictions', jsonb_build_array('SE'),
    'retired', 'nothing'));