-- =============================================================================
-- Security Work programme: mandate, protected assets, baseline, gaps, actions
-- across the whole product, AI suggestions, 90-day plan, management reports.
-- =============================================================================
--
-- Created as the next canonical ledger slot under docs/release/release-sequence.md
-- (the ledger leads the clock). Schema only: no provider, key, Storage or
-- schedule is activated and no existing row is rewritten.
--
-- WHAT THIS ADDS. Security Work already holds monitoring, analyses, risks,
-- actions, reports and evidence inside one workspace boundary
-- (20261210090000, 20261211090000). It has no record of the security
-- function's mandate, of what the organisation must protect, of how
-- structured the security work is (baseline), or of gaps that have not yet
-- become actions. Risks and actions can exist only under an analysis, and
-- nothing stores an AI proposal that a human has not yet accepted.
--
-- THE INVARIANTS (unchanged from the foundation and extended to every new
-- table):
--   * every row carries workspace_id; membership is the only authority;
--   * writes are human-only (sw_private.is_human), editor-only
--     (sw_private.can_edit), creator-pinned and version-bumped
--     (sw_private.guard_record); every change is audited
--     (sw_private.record_change);
--   * decisions are stamped by triggers, never by the caller;
--   * an AI suggestion is a proposal in its own table. Approving or rejecting
--     it changes only that row. Nothing in this file writes a suggestion into
--     an authoritative record: that happens through the ordinary editor
--     path, as an explicit user action, after approval.
--
-- BACKWARD COMPATIBILITY. sw_risks.assessment_id and sw_actions.assessment_id
-- become nullable so that a risk or an action can also be created directly
-- from the programme (protected asset, gap, plan). Existing rows keep their
-- analysis parent and every existing rule still applies to them. The only
-- lifecycle change is that a risk WITHOUT an analysis parent can be accepted
-- without an approved analysis (an approver and a rationale are still
-- required). Nothing else in sw_private.guard_lifecycle changes.
--
-- NOT CHANGED: foundation RLS, analysis approval bundles, processing jobs,
-- AI activations, exports, Storage policies.
--
-- Rollback: supabase/rollback/20270111090000_security_work_programme_rollback.sql
-- Suite:    supabase/tests/security_work_programme_test.sql
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Mission & Mandate (one per workspace)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_security_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.sw_workspaces(id),
  organisation_description text NOT NULL DEFAULT '' CHECK (char_length(organisation_description) <= 8000),
  security_mission text NOT NULL DEFAULT '' CHECK (char_length(security_mission) <= 8000),
  reporting_line text NOT NULL DEFAULT '' CHECK (char_length(reporting_line) <= 2000),
  key_stakeholders text NOT NULL DEFAULT '' CHECK (char_length(key_stakeholders) <= 4000),
  decision_authority text NOT NULL DEFAULT '' CHECK (char_length(decision_authority) <= 4000),
  risk_acceptance_authority text NOT NULL DEFAULT '' CHECK (char_length(risk_acceptance_authority) <= 4000),
  geographic_scope text NOT NULL DEFAULT '' CHECK (char_length(geographic_scope) <= 2000),
  key_requirements text NOT NULL DEFAULT '' CHECK (char_length(key_requirements) <= 8000),
  review_date date,
  -- The accepted mandate text. Written by the user, or copied from an
  -- APPROVED sw_ai_suggestions row by the user. Provenance is recorded here
  -- so a reader can always tell which.
  mandate_document text NOT NULL DEFAULT '' CHECK (char_length(mandate_document) <= 32000),
  document_provenance jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(document_provenance) = 'object' AND octet_length(document_provenance::text) <= 2048),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id)
);

-- -----------------------------------------------------------------------------
-- 2. Protected assets
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_protected_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 300),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 8000),
  category text NOT NULL CHECK (category IN ('people', 'operations', 'facilities', 'information', 'systems', 'suppliers', 'reputation', 'other')),
  -- An owner is a workspace member (owner_id; not owner_user_id, which
  -- sw_private.guard_record pins as immutable), or a named person/function outside the
  -- workspace. Either satisfies "visible ownership"; neither is chosen by AI.
  owner_id uuid,
  owner_label text NOT NULL DEFAULT '' CHECK (char_length(owner_label) <= 200),
  business_importance text NOT NULL DEFAULT 'medium' CHECK (business_importance IN ('low', 'medium', 'high', 'critical')),
  -- Selected by the user. NULL means "not yet assessed", never "low".
  consequence_level smallint CHECK (consequence_level BETWEEN 1 AND 5),
  consequence_description text NOT NULL DEFAULT '' CHECK (char_length(consequence_description) <= 8000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  review_date date,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, owner_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id)
);

-- Risk ⇄ protected asset. Existing risks have no rows here and keep working.
CREATE TABLE public.sw_risk_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  risk_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, risk_id, asset_id),
  FOREIGN KEY (workspace_id, risk_id) REFERENCES public.sw_risks(workspace_id, id),
  FOREIGN KEY (workspace_id, asset_id) REFERENCES public.sw_protected_assets(workspace_id, id)
);

-- -----------------------------------------------------------------------------
-- 3. Risks and actions become reusable across the programme
-- -----------------------------------------------------------------------------
ALTER TABLE public.sw_risks
  ALTER COLUMN assessment_id DROP NOT NULL,
  ADD COLUMN owner_id uuid,
  ADD COLUMN threat_scenario text NOT NULL DEFAULT '' CHECK (char_length(threat_scenario) <= 8000),
  ADD COLUMN source_kind text NOT NULL DEFAULT 'analysis' CHECK (source_kind IN ('analysis', 'programme', 'monitoring', 'manual')),
  ADD CONSTRAINT sw_risks_owner_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id);

-- -----------------------------------------------------------------------------
-- 4. Security baseline (versioned repository content; answers only here)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_baseline_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  content_version text NOT NULL CHECK (char_length(content_version) BETWEEN 1 AND 80),
  market text NOT NULL DEFAULT 'global' CHECK (market IN ('global', 'se')),
  mode text NOT NULL DEFAULT 'quick' CHECK (mode IN ('quick', 'detailed')),
  assessment_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  completed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id)
);
CREATE UNIQUE INDEX sw_one_open_baseline ON public.sw_baseline_assessments(workspace_id) WHERE status = 'open';

CREATE TABLE public.sw_baseline_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  baseline_id uuid NOT NULL,
  question_id text NOT NULL CHECK (char_length(question_id) BETWEEN 1 AND 120),
  answer text NOT NULL CHECK (answer IN ('yes', 'partly', 'no', 'not_applicable')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, baseline_id, question_id),
  FOREIGN KEY (workspace_id, baseline_id) REFERENCES public.sw_baseline_assessments(workspace_id, id)
);

-- -----------------------------------------------------------------------------
-- 5. Gaps (unified; a gap never creates an action by itself)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  source_kind text NOT NULL CHECK (source_kind IN ('baseline', 'risk', 'monitoring', 'analysis', 'incident', 'manual')),
  domain text CHECK (domain IS NULL OR domain IN ('governance', 'personnel', 'physical', 'information_cyber', 'incident', 'continuity', 'suppliers', 'travel_events', 'culture_training', 'compliance')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 8000),
  evidence_note text NOT NULL DEFAULT '' CHECK (char_length(evidence_note) <= 4000),
  business_impact text NOT NULL DEFAULT 'medium' CHECK (business_impact IN ('low', 'medium', 'high')),
  -- Related records use their own column names on purpose: guard_record pins
  -- assessment_id/risk_id as immutable parents, and a gap may be linked to a
  -- risk or asset after it was recorded.
  related_asset_id uuid,
  related_risk_id uuid,
  related_assessment_id uuid,
  baseline_id uuid,
  baseline_question_id text CHECK (baseline_question_id IS NULL OR char_length(baseline_question_id) BETWEEN 1 AND 120),
  suggested_action text NOT NULL DEFAULT '' CHECK (char_length(suggested_action) <= 4000),
  owner_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'accepted')),
  resolution_note text NOT NULL DEFAULT '' CHECK (char_length(resolution_note) <= 4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  CHECK ((baseline_id IS NULL) = (baseline_question_id IS NULL)),
  FOREIGN KEY (workspace_id, related_asset_id) REFERENCES public.sw_protected_assets(workspace_id, id),
  FOREIGN KEY (workspace_id, related_risk_id) REFERENCES public.sw_risks(workspace_id, id),
  FOREIGN KEY (workspace_id, related_assessment_id) REFERENCES public.sw_assessments(workspace_id, id),
  FOREIGN KEY (workspace_id, baseline_id) REFERENCES public.sw_baseline_assessments(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id)
);
CREATE UNIQUE INDEX sw_one_gap_per_baseline_question ON public.sw_gaps(workspace_id, baseline_id, baseline_question_id) WHERE baseline_question_id IS NOT NULL;

ALTER TABLE public.sw_actions
  ALTER COLUMN assessment_id DROP NOT NULL,
  ADD COLUMN gap_id uuid,
  ADD COLUMN asset_id uuid,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'analysis' CHECK (source_kind IN ('analysis', 'gap', 'risk', 'plan', 'manual')),
  ADD COLUMN approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN approval_note text NOT NULL DEFAULT '' CHECK (char_length(approval_note) <= 4000),
  ADD CONSTRAINT sw_actions_gap_fk FOREIGN KEY (workspace_id, gap_id) REFERENCES public.sw_gaps(workspace_id, id),
  ADD CONSTRAINT sw_actions_asset_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES public.sw_protected_assets(workspace_id, id);

-- -----------------------------------------------------------------------------
-- 6. Evidence links: the shared library attached to any programme record
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  source_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('mandate', 'asset', 'risk', 'baseline_answer', 'gap', 'action', 'report', 'management_report')),
  target_id uuid NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, source_id, target_kind, target_id),
  FOREIGN KEY (workspace_id, source_id) REFERENCES public.sw_sources(workspace_id, id)
);

-- -----------------------------------------------------------------------------
-- 7. AI suggestions: proposed → approved | rejected. Content is immutable.
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  kind text NOT NULL CHECK (kind IN ('mandate_draft', 'asset_suggestions', 'risk_scenario', 'gap_action', 'report_narrative', 'explanation', 'question_list')),
  context_kind text CHECK (context_kind IS NULL OR context_kind IN ('workspace', 'mandate', 'asset', 'risk', 'gap', 'baseline_question', 'action', 'management_report')),
  context_id uuid,
  request_text text NOT NULL DEFAULT '' CHECK (char_length(request_text) <= 4000),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 65536),
  -- Which workspace records were sent to the model: [{table, id}] only.
  source_records jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(source_records) = 'array' AND octet_length(source_records::text) <= 16384),
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 160),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 80),
  decision_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '' CHECK (char_length(decision_note) <= 2000),
  -- What the user created from an approved suggestion ({table, ids}), for traceability.
  applied_target jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(applied_target) = 'object' AND octet_length(applied_target::text) <= 4096),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  CHECK ((status = 'proposed' AND decided_by IS NULL AND decided_at IS NULL) OR (status <> 'proposed' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

-- -----------------------------------------------------------------------------
-- 8. 90-day plan (fixed, versioned repository checklist; progress only here)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_programme_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.sw_workspaces(id),
  checklist_version text NOT NULL CHECK (char_length(checklist_version) BETWEEN 1 AND 80),
  started_on date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'completed')),
  completed_task_ids text[] NOT NULL DEFAULT '{}' CHECK (array_length(completed_task_ids, 1) IS NULL OR array_length(completed_task_ids, 1) <= 200),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id)
);

-- -----------------------------------------------------------------------------
-- 9. Management reports: facts, system-calculated values and narrative are
--    stored apart so a reader can always tell them apart.
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_management_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  language text NOT NULL DEFAULT 'sv' CHECK (language IN ('sv', 'en')),
  content_version text NOT NULL DEFAULT 'management-report-v1' CHECK (char_length(content_version) BETWEEN 1 AND 80),
  period_start date,
  period_end date,
  facts jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(facts) = 'object' AND octet_length(facts::text) <= 262144),
  computed jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(computed) = 'object' AND octet_length(computed::text) <= 65536),
  -- {section: {text, origin: 'user' | 'ai', suggestion_id?}}
  narrative jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(narrative) = 'object' AND octet_length(narrative::text) <= 131072),
  decisions_required jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(decisions_required) = 'array' AND octet_length(decisions_required::text) <= 32768),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  CHECK ((status = 'draft' AND approved_by IS NULL AND approved_at IS NULL) OR (status <> 'draft' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end)
);

CREATE INDEX sw_risk_assets_risk ON public.sw_risk_assets(workspace_id, risk_id);
CREATE INDEX sw_risk_assets_asset ON public.sw_risk_assets(workspace_id, asset_id);
CREATE INDEX sw_baseline_answers_baseline ON public.sw_baseline_answers(workspace_id, baseline_id);
CREATE INDEX sw_gaps_status ON public.sw_gaps(workspace_id, status);
CREATE INDEX sw_actions_gap ON public.sw_actions(workspace_id, gap_id) WHERE gap_id IS NOT NULL;
CREATE INDEX sw_evidence_links_target ON public.sw_evidence_links(workspace_id, target_kind, target_id);
CREATE INDEX sw_ai_suggestions_context ON public.sw_ai_suggestions(workspace_id, context_kind, context_id);

-- -----------------------------------------------------------------------------
-- 10. Lifecycle: a risk without an analysis parent may be accepted by an
--     approver with a rationale. Everything else is the 20261211090000 body.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sw_private.guard_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _before text; _after text; _changed boolean; _old jsonb; _new jsonb;
BEGIN
  _after := NEW.status; _new := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'sw_actions' THEN
    IF NEW.assignee_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships m WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.assignee_user_id AND m.active) THEN
      RAISE EXCEPTION 'SW_ACTIVE_ASSIGNEE_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF _after <> (CASE TG_TABLE_NAME WHEN 'sw_intelligence_items' THEN 'pending' WHEN 'sw_risks' THEN 'proposed' WHEN 'sw_actions' THEN 'open' ELSE 'draft' END) THEN
      RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  _before := OLD.status; _old := to_jsonb(OLD); _changed := _after IS DISTINCT FROM _before;
  -- Stamp fields are never caller-editable, even on an otherwise valid transition.
  IF _new->'approved_by' IS DISTINCT FROM _old->'approved_by' OR _new->'approved_at' IS DISTINCT FROM _old->'approved_at'
      OR _new->'accepted_by' IS DISTINCT FROM _old->'accepted_by' OR _new->'accepted_at' IS DISTINCT FROM _old->'accepted_at'
      OR _new->'closed_by' IS DISTINCT FROM _old->'closed_by' OR _new->'closed_at' IS DISTINCT FROM _old->'closed_at'
      OR _new->'decided_by' IS DISTINCT FROM _old->'decided_by' OR _new->'decided_at' IS DISTINCT FROM _old->'decided_at' THEN
      RAISE EXCEPTION 'SW_DECISION_STAMP_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'sw_intelligence_items' THEN
    IF _changed AND NOT ((_before = 'pending' AND _after IN ('relevant', 'dismissed')) OR (_before = 'relevant' AND _after IN ('dismissed', 'promoted')) OR (_before = 'dismissed' AND _after = 'relevant')) THEN
      RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
    END IF;
    IF _before = 'promoted' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF NOT _changed AND _before <> 'pending' AND NEW.human_rationale IS DISTINCT FROM OLD.human_rationale THEN
      RAISE EXCEPTION 'SW_DECISION_RATIONALE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF _changed THEN
      IF btrim(NEW.human_rationale) = '' THEN RAISE EXCEPTION 'SW_DECISION_RATIONALE_REQUIRED' USING ERRCODE = '23514'; END IF;
      IF _after = 'promoted' AND NOT EXISTS (SELECT 1 FROM public.sw_assessments a WHERE a.workspace_id = NEW.workspace_id AND a.intelligence_item_id = NEW.id) THEN
        RAISE EXCEPTION 'SW_ASSESSMENT_REQUIRED' USING ERRCODE = '23514';
      END IF;
      NEW.decided_by := auth.uid(); NEW.decided_at := now();
    END IF;
  ELSIF TG_TABLE_NAME IN ('sw_assessments', 'sw_reports') THEN
    IF _before IN ('approved', 'exported', 'archived') AND NOT _changed THEN
      RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
    END IF;
    IF _before IN ('approved', 'exported', 'archived') AND
      (_new - ARRAY['status', 'version', 'updated_at']) IS DISTINCT FROM (_old - ARRAY['status', 'version', 'updated_at']) THEN
      RAISE EXCEPTION 'SW_APPROVED_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'sw_assessments' THEN
      IF _changed AND NOT ((_before = 'draft' AND _after = 'in_review') OR (_before = 'in_review' AND _after IN ('draft', 'approved')) OR (_before = 'approved' AND _after = 'archived')) THEN
        RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF _changed AND NOT ((_before = 'draft' AND _after = 'approved') OR (_before = 'approved' AND _after IN ('exported', 'archived')) OR (_before = 'exported' AND _after = 'archived')) THEN
        RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF _before = 'archived' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF _changed AND _after IN ('approved', 'exported', 'archived') AND NOT sw_private.can_approve(NEW.workspace_id) THEN
      RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF _changed AND _after = 'approved' THEN
      IF TG_TABLE_NAME = 'sw_assessments' THEN
        IF NEW.analysis_type<>'legacy_security' AND (btrim(NEW.purpose)='' OR btrim(NEW.scope)='' OR btrim(NEW.horizon)='' OR EXISTS(SELECT 1 FROM public.sw_analysis_inputs i WHERE i.workspace_id=NEW.workspace_id AND i.assessment_id=NEW.id AND i.review_status='pending')) THEN RAISE EXCEPTION 'SW_ANALYSIS_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
        IF btrim(NEW.professional_conclusion) = '' OR (NEW.analysis_type='legacy_security' AND (NEW.likelihood IS NULL OR NEW.consequence IS NULL)) THEN
          RAISE EXCEPTION 'SW_ASSESSMENT_CONCLUSION_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sw_citations c WHERE c.workspace_id = NEW.workspace_id AND c.assessment_id = NEW.id) THEN
          RAISE EXCEPTION 'SW_CITATION_REQUIRED' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF NEW.template_version_id='legacy-security-report-v1' AND (btrim(NEW.executive_summary) = '' OR btrim(NEW.conclusion) = '' OR
          (NEW.report_type <> 'briefing' AND (btrim(NEW.overall_description) = '' OR btrim(NEW.risk_assessment) = '' OR btrim(NEW.identified_risks) = '' OR btrim(NEW.security_arrangement) = '' OR btrim(NEW.preparedness_incident_management) = '' OR btrim(NEW.contacts) = ''))) THEN
          RAISE EXCEPTION 'SW_REPORT_SECTIONS_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF NEW.template_version_id<>'legacy-security-report-v1' AND EXISTS(SELECT 1 FROM public.sw_report_templates t,unnest(t.required_sections) s WHERE t.id=NEW.template_version_id AND (jsonb_typeof(NEW.sections->s) IS DISTINCT FROM 'string' OR btrim(coalesce(NEW.sections->>s,''))='')) THEN RAISE EXCEPTION 'SW_REPORT_SECTIONS_REQUIRED' USING ERRCODE='23514'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sw_assessments a WHERE a.workspace_id = NEW.workspace_id AND a.id = NEW.assessment_id AND a.status = 'approved') THEN
          RAISE EXCEPTION 'SW_APPROVED_ASSESSMENT_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sw_citations c WHERE c.workspace_id = NEW.workspace_id AND c.report_id = NEW.id) THEN
          RAISE EXCEPTION 'SW_CITATION_REQUIRED' USING ERRCODE = '23514';
        END IF;
      END IF;
      NEW.approved_by := auth.uid(); NEW.approved_at := now();
    END IF;
  ELSIF TG_TABLE_NAME = 'sw_risks' THEN
    IF _changed AND NOT ((_before = 'proposed' AND _after = 'accepted') OR (_before = 'accepted' AND _after = 'closed')) THEN
      RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
    END IF;
    IF _before IN ('accepted', 'closed') AND (_new - ARRAY['status', 'decision_rationale', 'version', 'updated_at']) IS DISTINCT FROM (_old - ARRAY['status', 'decision_rationale', 'version', 'updated_at']) THEN
      RAISE EXCEPTION 'SW_APPROVED_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF _before = 'closed' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF _changed THEN
      IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
      IF btrim(NEW.decision_rationale) = '' THEN RAISE EXCEPTION 'SW_DECISION_RATIONALE_REQUIRED' USING ERRCODE = '23514'; END IF;
      IF _after = 'accepted' THEN
        -- 20270111090000: a programme risk (no analysis parent) needs no approved analysis.
        IF NEW.assessment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_assessments a WHERE a.workspace_id = NEW.workspace_id AND a.id = NEW.assessment_id AND a.status = 'approved') THEN
          RAISE EXCEPTION 'SW_APPROVED_ASSESSMENT_REQUIRED' USING ERRCODE = '23514';
        END IF;
        NEW.accepted_by := auth.uid(); NEW.accepted_at := now();
      END IF;
    ELSIF _before = 'accepted' AND NEW.decision_rationale IS DISTINCT FROM OLD.decision_rationale THEN
      RAISE EXCEPTION 'SW_APPROVED_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
    ELSIF _before = 'accepted' THEN
      RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'sw_actions' THEN
    IF _before IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF _changed AND _after IN ('completed', 'cancelled', 'blocked') AND btrim(NEW.decision_rationale) = '' THEN
      RAISE EXCEPTION 'SW_DECISION_RATIONALE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF _changed AND _after = 'completed' AND btrim(NEW.completion_evidence) = '' THEN
      RAISE EXCEPTION 'SW_COMPLETION_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF _changed AND _after IN ('completed', 'cancelled') THEN NEW.closed_by := auth.uid(); NEW.closed_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 11. Programme lifecycle guards (own trigger; never touches other tables)
-- -----------------------------------------------------------------------------
-- Actions that require approval may be completed only by an approver.
CREATE FUNCTION sw_private.guard_action_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed' AND NEW.approval_required THEN
    IF NOT sw_private.can_approve(NEW.workspace_id) THEN
      RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF btrim(NEW.approval_note) = '' THEN
      RAISE EXCEPTION 'SW_APPROVAL_NOTE_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION sw_private.guard_programme() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _old jsonb; _new jsonb;
BEGIN
  _new := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'sw_ai_suggestions' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'proposed' OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
        RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
    _old := to_jsonb(OLD);
    IF OLD.status <> 'proposed' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    -- The proposal itself never changes: only the human decision about it.
    IF (_new - ARRAY['status', 'decision_note', 'applied_target', 'decided_by', 'decided_at', 'version', 'updated_at'])
       IS DISTINCT FROM (_old - ARRAY['status', 'decision_note', 'applied_target', 'decided_by', 'decided_at', 'version', 'updated_at']) THEN
      RAISE EXCEPTION 'SW_SUGGESTION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF _new->'decided_by' IS DISTINCT FROM _old->'decided_by' OR _new->'decided_at' IS DISTINCT FROM _old->'decided_at' THEN
      RAISE EXCEPTION 'SW_DECISION_STAMP_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF NEW.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
    END IF;
    NEW.decided_by := auth.uid(); NEW.decided_at := now();
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sw_management_reports' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
        RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
    _old := to_jsonb(OLD);
    IF _new->'approved_by' IS DISTINCT FROM _old->'approved_by' OR _new->'approved_at' IS DISTINCT FROM _old->'approved_at' THEN
      RAISE EXCEPTION 'SW_DECISION_STAMP_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'archived' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF OLD.status = 'approved' THEN
      IF NEW.status <> 'archived' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
      IF (_new - ARRAY['status', 'version', 'updated_at']) IS DISTINCT FROM (_old - ARRAY['status', 'version', 'updated_at']) THEN
        RAISE EXCEPTION 'SW_APPROVED_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
      END IF;
      IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
      RETURN NEW;
    END IF;
    IF NEW.status = 'archived' THEN RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514'; END IF;
    IF NEW.status = 'approved' THEN
      IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
      IF btrim(coalesce(NEW.narrative->'executive_position'->>'text', '')) = '' THEN
        RAISE EXCEPTION 'SW_REPORT_SECTIONS_REQUIRED' USING ERRCODE = '23514';
      END IF;
      NEW.approved_by := auth.uid(); NEW.approved_at := now();
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sw_baseline_assessments' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'open' OR NEW.completed_at IS NOT NULL THEN RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.status = 'completed' AND (NEW.status <> 'completed' OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
      RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'completed' AND OLD.status = 'open' THEN NEW.completed_at := now(); END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 12. Privileges, policies, triggers: the foundation pattern, applied again.
-- -----------------------------------------------------------------------------
DO $security$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['sw_security_mandates', 'sw_protected_assets', 'sw_risk_assets', 'sw_baseline_assessments', 'sw_baseline_answers', 'sw_gaps', 'sw_evidence_links', 'sw_ai_suggestions', 'sw_programme_plans', 'sw_management_reports'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', _table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', _table);
    EXECUTE format('CREATE POLICY sw_member_read ON public.%I FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id))', _table);
    EXECUTE format('CREATE INDEX %I ON public.%I (workspace_id)', _table || '_scope_idx', _table);
    EXECUTE format('GRANT INSERT ON TABLE public.%I TO authenticated', _table);
    EXECUTE format('CREATE POLICY sw_editor_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id))', _table);
    IF _table NOT IN ('sw_risk_assets', 'sw_evidence_links') THEN
      EXECUTE format('GRANT UPDATE ON TABLE public.%I TO authenticated', _table);
      EXECUTE format('CREATE POLICY sw_editor_update ON public.%I FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id))', _table);
    ELSE
      EXECUTE format('GRANT DELETE ON TABLE public.%I TO authenticated', _table);
      EXECUTE format('CREATE POLICY sw_editor_delete ON public.%I FOR DELETE TO authenticated USING (sw_private.can_edit(workspace_id))', _table);
    END IF;
    EXECUTE format('CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record()', _table);
    EXECUTE format('CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.record_change()', _table);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['sw_ai_suggestions', 'sw_management_reports', 'sw_baseline_assessments'] LOOP
    EXECUTE format('CREATE TRIGGER sw_20_programme BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.guard_programme()', _table);
  END LOOP;
END;
$security$;
CREATE TRIGGER sw_25_action_approval BEFORE UPDATE ON public.sw_actions FOR EACH ROW EXECUTE FUNCTION sw_private.guard_action_approval();

-- New functions are not executable by anyone but the triggers that fire them.
REVOKE ALL ON FUNCTION sw_private.guard_action_approval(), sw_private.guard_programme() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.sw_ai_suggestions IS 'AI proposals. Approving or rejecting changes only this row; authoritative records are written by the user through the ordinary editor path.';
COMMENT ON TABLE public.sw_management_reports IS 'Management status reports. facts (frozen records), computed (deterministic values) and narrative (user or AI-drafted, marked) are stored apart.';

COMMIT;
