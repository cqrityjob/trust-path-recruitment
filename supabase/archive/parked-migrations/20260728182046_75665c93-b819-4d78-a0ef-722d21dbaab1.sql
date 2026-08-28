INSERT INTO public.assessments (id, name_sv, name_en, kind, employer_visible)
VALUES ('security-career-discovery-v3', 'Din karriär inom säkerhet', 'Security Career Discovery', 'career_guidance', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, notes)
SELECT 'security-career-discovery-v3', '2026-scd-v3.0.0', 'v1',
  'Security Career Discovery v3.0 — 2 context + 20 core scored + 4 path-specific adaptive items. NOT ACTIVE: lifecycle status is design and all six content review gates are outstanding.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.assessment_versions WHERE assessment_id = 'security-career-discovery-v3' AND model_version = '2026-scd-v3.0.0'
);

CREATE TABLE public.cd_definition_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id text NOT NULL REFERENCES public.assessments(id) ON DELETE RESTRICT,
  assessment_version_id uuid NOT NULL REFERENCES public.assessment_versions(id) ON DELETE RESTRICT,
  definition_version text NOT NULL,
  content_version    text NOT NULL,
  scoring_version    text NOT NULL,
  taxonomy_version   text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'design' CHECK (lifecycle_status IN ('design','internal_test','pilot','active','retired')),
  available_locales text[] NOT NULL DEFAULT ARRAY['sv','en']::text[],
  review_status jsonb NOT NULL DEFAULT jsonb_build_object(
    'content_review', false, 'sme_review', false, 'language_review', false,
    'accessibility_review', false, 'bias_review', false,
    'privacy_legal_review', false, 'psychometric_review', false
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, definition_version)
);

CREATE INDEX cd_definition_versions_assessment_idx ON public.cd_definition_versions (assessment_id, lifecycle_status);
CREATE TRIGGER set_cd_definition_versions_updated_at BEFORE UPDATE ON public.cd_definition_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cd_definition_versions (
  assessment_id, assessment_version_id, definition_version, content_version, scoring_version, taxonomy_version, lifecycle_status
)
SELECT 'security-career-discovery-v3', av.id, '2026-scd-v3.0.0', 'scd-content-v3.0.0', 'scd-scoring-v3.0.0', 'cig-areas-v1', 'design'
FROM public.assessment_versions av
WHERE av.assessment_id = 'security-career-discovery-v3' AND av.model_version = '2026-scd-v3.0.0'
ON CONFLICT (assessment_id, definition_version) DO NOTHING;

CREATE TABLE public.cd_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_version_id uuid NOT NULL REFERENCES public.cd_definition_versions(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_session_token uuid,
  locale text NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv','en')),
  context_status text CHECK (context_status IN ('exploring_security','working_in_security','developing_current_role','changing_career_area','security_leader')),
  discovery_goal text CHECK (discovery_goal IN ('find_direction','confirm_direction','discover_opportunities','understand_strengths','curious')),
  adaptive_path text CHECK (adaptive_path IN ('A','B','C','D','E')),
  current_section text CHECK (current_section IN ('approach','others','decisions','responsibility','development')),
  current_item text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  consent jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cd_sessions_owner_exactly_one CHECK (
    (user_id IS NOT NULL AND anon_session_token IS NULL)
    OR (user_id IS NULL AND anon_session_token IS NOT NULL)
  ),
  CONSTRAINT cd_sessions_completed_has_timestamp CHECK ((status <> 'completed') OR (completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX cd_sessions_anon_token_key ON public.cd_sessions (anon_session_token) WHERE anon_session_token IS NOT NULL;
CREATE INDEX cd_sessions_user_idx ON public.cd_sessions (user_id, started_at DESC);
CREATE TRIGGER set_cd_sessions_updated_at BEFORE UPDATE ON public.cd_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cd_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cd_sessions(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_version integer NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('context','single_axis','trade_off','behavioural','adaptive')),
  answer_value text NOT NULL,
  answer_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_class text NOT NULL CHECK (evidence_class IN ('orientation_self_report','behavioural_signal','contextual_self_report')),
  is_scored boolean NOT NULL,
  adaptive_path text CHECK (adaptive_path IN ('A','B','C','D','E')),
  answered_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, item_id)
);
CREATE INDEX cd_evidence_session_idx ON public.cd_evidence (session_id);
CREATE INDEX cd_evidence_scored_idx ON public.cd_evidence (session_id) WHERE is_scored;
CREATE TRIGGER set_cd_evidence_updated_at BEFORE UPDATE ON public.cd_evidence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cd_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.cd_sessions(id) ON DELETE CASCADE,
  definition_version text NOT NULL,
  content_version    text NOT NULL,
  scoring_version    text NOT NULL,
  taxonomy_version   text NOT NULL,
  dna_scores    jsonb NOT NULL DEFAULT '{}'::jsonb,
  career_areas  jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  coverage      jsonb NOT NULL DEFAULT '{}'::jsonb,
  contextual_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  context_status  text,
  discovery_goal  text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cd_report_snapshots_generated_idx ON public.cd_report_snapshots (generated_at DESC);

CREATE OR REPLACE FUNCTION public.cd_guard_session_requires_administrable_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _gates jsonb; _ungated int;
BEGIN
  SELECT lifecycle_status, review_status INTO _status, _gates FROM public.cd_definition_versions WHERE id = NEW.definition_version_id;
  IF _status IS NULL THEN
    RAISE EXCEPTION 'CD_UNKNOWN_DEFINITION_VERSION: %', NEW.definition_version_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF _status NOT IN ('pilot', 'active') THEN
    RAISE EXCEPTION 'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is %, must be pilot or active before a session may be created', _status USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO _ungated FROM jsonb_each(_gates) AS g(key, value) WHERE g.value <> 'true'::jsonb;
  IF _ungated > 0 THEN
    RAISE EXCEPTION 'CD_REVIEW_GATES_OUTSTANDING: % review gate(s) not cleared', _ungated USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cd_sessions_require_administrable_version_trg BEFORE INSERT ON public.cd_sessions FOR EACH ROW EXECUTE FUNCTION public.cd_guard_session_requires_administrable_version();

CREATE OR REPLACE FUNCTION public.cd_guard_adaptive_path_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.adaptive_path IS NOT NULL AND NEW.adaptive_path IS DISTINCT FROM OLD.adaptive_path THEN
    RAISE EXCEPTION 'CD_ADAPTIVE_PATH_IMMUTABLE: path was % and cannot be changed to %', OLD.adaptive_path, NEW.adaptive_path USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.context_status IS NOT NULL AND NEW.context_status IS DISTINCT FROM OLD.context_status THEN
    RAISE EXCEPTION 'CD_CONTEXT_STATUS_IMMUTABLE: context_status was % and cannot be changed to %', OLD.context_status, NEW.context_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cd_sessions_adaptive_path_immutable_trg BEFORE UPDATE ON public.cd_sessions FOR EACH ROW EXECUTE FUNCTION public.cd_guard_adaptive_path_immutable();

CREATE OR REPLACE FUNCTION public.cd_guard_evidence_scoring_boundary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _expected boolean;
BEGIN
  _expected := (NEW.evidence_class <> 'contextual_self_report');
  IF NEW.is_scored IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'CD_SCORING_BOUNDARY_VIOLATION: evidence_class % implies is_scored=%, got %', NEW.evidence_class, _expected, NEW.is_scored USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.item_kind IN ('adaptive', 'context') AND NEW.evidence_class <> 'contextual_self_report' THEN
    RAISE EXCEPTION 'CD_SCORING_BOUNDARY_VIOLATION: item_kind % must carry evidence_class contextual_self_report, got %', NEW.item_kind, NEW.evidence_class USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.item_kind <> 'adaptive' AND array_length(NEW.answer_tags, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'CD_REPORT_TAGS_ONLY_ON_ADAPTIVE: item_kind % may not carry answer_tags', NEW.item_kind USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cd_evidence_scoring_boundary_trg BEFORE INSERT OR UPDATE ON public.cd_evidence FOR EACH ROW EXECUTE FUNCTION public.cd_guard_evidence_scoring_boundary();

CREATE OR REPLACE FUNCTION public.cd_guard_adaptive_matches_session_path()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _session_path text;
BEGIN
  IF NEW.item_kind <> 'adaptive' THEN RETURN NEW; END IF;
  SELECT adaptive_path INTO _session_path FROM public.cd_sessions WHERE id = NEW.session_id;
  IF _session_path IS NULL THEN
    RAISE EXCEPTION 'CD_ADAPTIVE_BEFORE_PATH_ASSIGNED: session % has no adaptive_path yet', NEW.session_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.adaptive_path IS DISTINCT FROM _session_path THEN
    RAISE EXCEPTION 'CD_ADAPTIVE_PATH_MISMATCH: session is on path %, evidence claims path %', _session_path, NEW.adaptive_path USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cd_evidence_adaptive_path_match_trg BEFORE INSERT OR UPDATE ON public.cd_evidence FOR EACH ROW EXECUTE FUNCTION public.cd_guard_adaptive_matches_session_path();

CREATE OR REPLACE FUNCTION public.cd_guard_snapshot_requires_core_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _scored int;
BEGIN
  SELECT count(*) INTO _scored FROM public.cd_evidence WHERE session_id = NEW.session_id AND is_scored;
  IF _scored <> 20 THEN
    RAISE EXCEPTION 'CD_CORE_INCOMPLETE: % of 20 scored core items answered', _scored USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cd_report_snapshots_require_core_complete_trg BEFORE INSERT ON public.cd_report_snapshots FOR EACH ROW EXECUTE FUNCTION public.cd_guard_snapshot_requires_core_complete();

CREATE OR REPLACE FUNCTION public.cd_guard_snapshot_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.definition_version IS DISTINCT FROM OLD.definition_version
     OR NEW.content_version  IS DISTINCT FROM OLD.content_version
     OR NEW.scoring_version  IS DISTINCT FROM OLD.scoring_version
     OR NEW.taxonomy_version IS DISTINCT FROM OLD.taxonomy_version
     OR NEW.session_id       IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'CD_SNAPSHOT_VERSIONS_IMMUTABLE: a stored report''s version references cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cd_report_snapshots_versions_immutable_trg BEFORE UPDATE ON public.cd_report_snapshots FOR EACH ROW EXECUTE FUNCTION public.cd_guard_snapshot_versions_immutable();

ALTER TABLE public.cd_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_evidence            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_report_snapshots    ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cd_definition_versions TO anon, authenticated;
GRANT ALL    ON public.cd_definition_versions TO service_role;
CREATE POLICY "cd definition versions readable" ON public.cd_definition_versions FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cd_sessions TO authenticated;
GRANT ALL ON public.cd_sessions TO service_role;
CREATE POLICY "cd own sessions select" ON public.cd_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "cd own sessions insert" ON public.cd_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cd own sessions update" ON public.cd_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cd own sessions delete" ON public.cd_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cd_evidence TO authenticated;
GRANT ALL ON public.cd_evidence TO service_role;
CREATE POLICY "cd own evidence select" ON public.cd_evidence FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.cd_sessions s WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own evidence insert" ON public.cd_evidence FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.cd_sessions s WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own evidence update" ON public.cd_evidence FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.cd_sessions s WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.cd_sessions s WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own evidence delete" ON public.cd_evidence FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.cd_sessions s WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));

GRANT SELECT, DELETE ON public.cd_report_snapshots TO authenticated;
GRANT ALL ON public.cd_report_snapshots TO service_role;
CREATE POLICY "cd own snapshots select" ON public.cd_report_snapshots FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.cd_sessions s WHERE s.id = cd_report_snapshots.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own snapshots delete" ON public.cd_report_snapshots FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.cd_sessions s WHERE s.id = cd_report_snapshots.session_id AND s.user_id = auth.uid()));