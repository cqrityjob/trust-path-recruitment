
-- Sprint 09B: Career Intelligence Profile (CIP) tables
-- Additive migration; does not modify Sprint 08 tables.

-- Seed the career-guidance assessment product row (idempotent).
INSERT INTO public.assessments (id, kind, name_en, name_sv)
VALUES ('career-guidance', 'career_guidance', 'Security Career Guidance Assessment', 'Karriärvägledningsbedömning för säkerhetsyrken')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, notes)
SELECT 'career-guidance', '2026.07.1', '2026.07.1', 'Initial CIG v1 baseline'
WHERE NOT EXISTS (
  SELECT 1 FROM public.assessment_versions
  WHERE assessment_id = 'career-guidance' AND model_version = '2026.07.1'
);

-- =============================================================
-- assessment_runs: one row per user attempt
-- =============================================================
CREATE TABLE public.assessment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_id TEXT NOT NULL REFERENCES public.assessments(id),
  assessment_version_id UUID NOT NULL REFERENCES public.assessment_versions(id),
  graph_version TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'sv',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_runs TO authenticated;
GRANT ALL ON public.assessment_runs TO service_role;
ALTER TABLE public.assessment_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs select" ON public.assessment_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own runs insert" ON public.assessment_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own runs update" ON public.assessment_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own runs delete" ON public.assessment_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_assessment_runs_updated_at BEFORE UPDATE ON public.assessment_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_assessment_runs_user ON public.assessment_runs(user_id, started_at DESC);

-- =============================================================
-- assessment_responses: per-question payload for a run
-- =============================================================
CREATE TABLE public.assessment_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.assessment_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_responses TO authenticated;
GRANT ALL ON public.assessment_responses TO service_role;
ALTER TABLE public.assessment_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own responses select" ON public.assessment_responses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own responses insert" ON public.assessment_responses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own responses update" ON public.assessment_responses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own responses delete" ON public.assessment_responses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_assessment_responses_run ON public.assessment_responses(run_id);

-- =============================================================
-- target_professions: chosen career target(s) per user
-- =============================================================
CREATE TABLE public.target_professions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profession_id TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source_run_id UUID REFERENCES public.assessment_runs(id) ON DELETE SET NULL,
  graph_version TEXT NOT NULL,
  chosen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, profession_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_professions TO authenticated;
GRANT ALL ON public.target_professions TO service_role;
ALTER TABLE public.target_professions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own targets select" ON public.target_professions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own targets insert" ON public.target_professions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own targets update" ON public.target_professions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own targets delete" ON public.target_professions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_target_professions_updated_at BEFORE UPDATE ON public.target_professions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_target_professions_user ON public.target_professions(user_id);

-- =============================================================
-- evidence_items: self-reported / (later) verified items
-- Schema supports full future evidence model; beta writes only
-- self_assessment, career_guidance_dimension, formal_self_report.
-- =============================================================
CREATE TABLE public.evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'self_assessment',
    'career_guidance_dimension',
    'formal_self_report',
    'document_upload',
    'identity_document',
    'criminal_record_document',
    'medical_document',
    'government_decision',
    'employer_verification',
    'manual_verification',
    'certification_record',
    'education_record',
    'experience_record'
  )),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('competency','skill','knowledge','formal_requirement','education','certification','experience','assessment_dimension')),
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'self_reported' CHECK (status IN ('self_reported','not_provided','not_applicable','verified','expired','revoked')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_run_id UUID REFERENCES public.assessment_runs(id) ON DELETE SET NULL,
  graph_version TEXT,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_items TO authenticated;
GRANT ALL ON public.evidence_items TO service_role;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own evidence select" ON public.evidence_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own evidence insert" ON public.evidence_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own evidence update" ON public.evidence_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own evidence delete" ON public.evidence_items FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_evidence_items_updated_at BEFORE UPDATE ON public.evidence_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_evidence_user_target ON public.evidence_items(user_id, target_kind, target_id);

-- =============================================================
-- gap_snapshots: computed gap analysis per user+target at a point in time
-- =============================================================
CREATE TABLE public.gap_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_profession_id UUID NOT NULL REFERENCES public.target_professions(id) ON DELETE CASCADE,
  profession_id TEXT NOT NULL,
  graph_version TEXT NOT NULL,
  source_run_id UUID REFERENCES public.assessment_runs(id) ON DELETE SET NULL,
  competence_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  formal_requirement_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gap_snapshots TO authenticated;
GRANT ALL ON public.gap_snapshots TO service_role;
ALTER TABLE public.gap_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gaps select" ON public.gap_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own gaps insert" ON public.gap_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own gaps delete" ON public.gap_snapshots FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_gap_snapshots_user_target ON public.gap_snapshots(user_id, target_profession_id, created_at DESC);

-- =============================================================
-- career_plans: user's plan container for a target
-- =============================================================
CREATE TABLE public.career_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_profession_id UUID NOT NULL REFERENCES public.target_professions(id) ON DELETE CASCADE,
  title TEXT,
  notes TEXT,
  graph_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_profession_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_plans TO authenticated;
GRANT ALL ON public.career_plans TO service_role;
ALTER TABLE public.career_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plans select" ON public.career_plans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own plans insert" ON public.career_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own plans update" ON public.career_plans FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own plans delete" ON public.career_plans FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_career_plans_updated_at BEFORE UPDATE ON public.career_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================
-- career_milestones: ordered actionable steps within a plan
-- =============================================================
CREATE TABLE public.career_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.career_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  milestone_kind TEXT NOT NULL DEFAULT 'action' CHECK (milestone_kind IN ('action','education','certification','formal_requirement','experience','custom')),
  target_ref TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','skipped')),
  position INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_milestones TO authenticated;
GRANT ALL ON public.career_milestones TO service_role;
ALTER TABLE public.career_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own milestones select" ON public.career_milestones FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own milestones insert" ON public.career_milestones FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own milestones update" ON public.career_milestones FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own milestones delete" ON public.career_milestones FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_career_milestones_updated_at BEFORE UPDATE ON public.career_milestones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_career_milestones_plan ON public.career_milestones(plan_id, position);

-- =============================================================
-- recommendation_instances: audit trail of recommendations shown/accepted
-- =============================================================
CREATE TABLE public.recommendation_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_profession_id UUID REFERENCES public.target_professions(id) ON DELETE CASCADE,
  source_run_id UUID REFERENCES public.assessment_runs(id) ON DELETE SET NULL,
  recommendation_kind TEXT NOT NULL CHECK (recommendation_kind IN ('education','certification','formal_requirement','experience','competency','career_transition','next_action')),
  target_ref TEXT NOT NULL,
  rationale JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'shown' CHECK (status IN ('shown','accepted','dismissed','completed')),
  graph_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_instances TO authenticated;
GRANT ALL ON public.recommendation_instances TO service_role;
ALTER TABLE public.recommendation_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recs select" ON public.recommendation_instances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own recs insert" ON public.recommendation_instances FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own recs update" ON public.recommendation_instances FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own recs delete" ON public.recommendation_instances FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_recommendation_instances_updated_at BEFORE UPDATE ON public.recommendation_instances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_reco_user_target ON public.recommendation_instances(user_id, target_profession_id);
