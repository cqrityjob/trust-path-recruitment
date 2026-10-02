-- Rollback for 20270111090000_security_work_programme.sql.
-- Pre-adoption only: refuses to destroy any programme record, any risk or
-- action that exists only because of this migration, and restores the
-- 20261211090000 lifecycle body verbatim. Remove dependent application code
-- before executing this atomic rollback.
BEGIN;
LOCK TABLE public.sw_workspaces, public.sw_risks, public.sw_actions IN ACCESS EXCLUSIVE MODE;
DO $preserve$
DECLARE t text; adopted boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['sw_security_mandates','sw_protected_assets','sw_risk_assets','sw_baseline_assessments','sw_baseline_answers','sw_gaps','sw_evidence_links','sw_ai_suggestions','sw_programme_plans','sw_management_reports'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)', t) INTO adopted;
    IF adopted THEN RAISE EXCEPTION 'SW_PROGRAMME_ROLLBACK_DATA_PRESENT: preserve adopted records' USING ERRCODE = '23514'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.sw_risks WHERE assessment_id IS NULL OR owner_id IS NOT NULL OR threat_scenario <> '' OR source_kind <> 'analysis')
     OR EXISTS (SELECT 1 FROM public.sw_actions WHERE assessment_id IS NULL OR gap_id IS NOT NULL OR asset_id IS NOT NULL OR source_kind <> 'analysis' OR approval_required OR approval_note <> '') THEN
    RAISE EXCEPTION 'SW_PROGRAMME_ROLLBACK_DATA_PRESENT: preserve adopted records' USING ERRCODE = '23514';
  END IF;
END $preserve$;
DROP TRIGGER sw_25_action_approval ON public.sw_actions;
DROP TABLE public.sw_evidence_links;
DROP TABLE public.sw_management_reports;
DROP TABLE public.sw_programme_plans;
DROP TABLE public.sw_ai_suggestions;
ALTER TABLE public.sw_actions DROP CONSTRAINT sw_actions_gap_fk, DROP CONSTRAINT sw_actions_asset_fk;
ALTER TABLE public.sw_actions DROP COLUMN gap_id, DROP COLUMN asset_id, DROP COLUMN source_kind, DROP COLUMN approval_required, DROP COLUMN approval_note;
ALTER TABLE public.sw_actions ALTER COLUMN assessment_id SET NOT NULL;
DROP TABLE public.sw_gaps;
DROP TABLE public.sw_baseline_answers;
DROP TABLE public.sw_baseline_assessments;
DROP TABLE public.sw_risk_assets;
ALTER TABLE public.sw_risks DROP CONSTRAINT sw_risks_owner_fk;
ALTER TABLE public.sw_risks DROP COLUMN owner_id, DROP COLUMN threat_scenario, DROP COLUMN source_kind;
ALTER TABLE public.sw_risks ALTER COLUMN assessment_id SET NOT NULL;
DROP TABLE public.sw_protected_assets;
DROP TABLE public.sw_security_mandates;
DROP FUNCTION sw_private.guard_programme();
DROP FUNCTION sw_private.guard_action_approval();
-- 20261211090000 body, verbatim.
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
        IF NOT EXISTS (SELECT 1 FROM public.sw_assessments a WHERE a.workspace_id = NEW.workspace_id AND a.id = NEW.assessment_id AND a.status = 'approved') THEN
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
COMMIT;
