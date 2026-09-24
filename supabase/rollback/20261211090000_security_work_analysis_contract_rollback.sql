-- Pre-adoption only; refuse to destroy source material, approvals, jobs or keys.
-- Remove dependent application code before executing this atomic rollback.
BEGIN;
LOCK TABLE public.sw_workspaces,public.sw_assessments,public.sw_reports IN ACCESS EXCLUSIVE MODE;
DO $preserve$
DECLARE t text; adopted boolean;
BEGIN
 FOREACH t IN ARRAY ARRAY['sw_analysis_inputs','sw_analysis_questions','sw_documents','sw_extraction_segments','sw_report_approvals','sw_revision_requests','sw_processing_jobs','sw_ai_activations','sw_ai_activation_revocations','sw_report_exports','sw_ai_draft_applications'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t) INTO adopted;
  IF adopted THEN RAISE EXCEPTION 'SW_ANALYSIS_ROLLBACK_DATA_PRESENT: preserve adopted records' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM sw_private.worker_keys) OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='sw-documents')
 OR EXISTS(SELECT 1 FROM public.sw_assessments WHERE analysis_type<>'legacy_security' OR method_version_id<>'legacy-security-v1' OR purpose<>'' OR horizon<>'' OR context_snapshot<>'{}'::jsonb OR knowledge_gaps<>'[]'::jsonb OR conflicts<>'[]'::jsonb OR supersedes_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.sw_reports WHERE template_version_id<>'legacy-security-report-v1' OR sections<>'{}'::jsonb OR supersedes_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.sw_risks WHERE likelihood IS NULL OR consequence IS NULL)
 OR EXISTS(SELECT 1 FROM public.sw_sources WHERE source_type='document')
 OR EXISTS(SELECT 1 FROM public.sw_source_items WHERE retrieval_status='extracted') THEN RAISE EXCEPTION 'SW_ANALYSIS_ROLLBACK_DATA_PRESENT: preserve adopted records' USING ERRCODE='23514'; END IF;
END $preserve$;
DROP POLICY sw_document_read ON storage.objects;
DROP POLICY sw_document_insert ON storage.objects;
DELETE FROM storage.buckets WHERE id='sw-documents';
DROP TRIGGER sw_05_analysis_parent ON public.sw_risks;
DROP TRIGGER sw_05_analysis_parent ON public.sw_controls;
DROP TRIGGER sw_05_analysis_parent ON public.sw_actions;
DROP TRIGGER sw_05_analysis_parent ON public.sw_citations;
DROP TRIGGER sw_15_analysis_definition ON public.sw_assessments;
DROP TRIGGER sw_15_analysis_definition ON public.sw_reports;
DROP TRIGGER sw_18_reviewed_approval ON public.sw_reports;
DROP TRIGGER sw_95_complete_bundle ON public.sw_reports;
DROP TRIGGER sw_08_verified_extraction ON public.sw_source_items;
DROP TRIGGER sw_08_document_source ON public.sw_sources;
DROP TRIGGER sw_revision_provenance ON public.sw_assessments;
DROP TRIGGER sw_revision_provenance ON public.sw_reports;
DROP TRIGGER sw_05_analysis_parent ON public.sw_analysis_inputs;
DROP TRIGGER sw_05_analysis_parent ON public.sw_analysis_questions;
DROP FUNCTION public.sw_apply_ai_draft(uuid, uuid, integer, uuid);
DROP FUNCTION public.sw_approve_report(uuid, uuid, integer, text);
DROP FUNCTION public.sw_complete_processing(uuid, uuid, uuid, text, text, text);
DROP FUNCTION public.sw_dispatch_processing(uuid, uuid);
DROP FUNCTION public.sw_export_report(uuid, uuid, uuid, uuid);
DROP FUNCTION public.sw_preview_report(uuid, uuid);
DROP FUNCTION public.sw_reserve_document(uuid, uuid, text, text, bigint, text);
DROP FUNCTION public.sw_reserve_processing(uuid, uuid, text, uuid, uuid, integer, uuid);
DROP FUNCTION public.sw_revise_analysis(uuid, uuid, integer, uuid);
DROP FUNCTION public.sw_revise_report(uuid, uuid, integer, uuid);
DROP FUNCTION sw_private.apply_ai_draft(uuid, uuid, integer, uuid);
DROP FUNCTION sw_private.apply_narrative_citations(uuid, text, uuid, jsonb, jsonb);
DROP FUNCTION sw_private.approve_report(uuid, uuid, integer, text);
DROP FUNCTION sw_private.capture_report_approval();
DROP FUNCTION sw_private.check_receipt(text, uuid, uuid, text, text, text);
DROP FUNCTION sw_private.complete_processing(uuid, uuid, uuid, text, text, text);
DROP FUNCTION sw_private.dispatch_processing(uuid, uuid);
DROP FUNCTION sw_private.export_report(uuid, uuid, uuid, uuid);
DROP FUNCTION sw_private.guard_analysis_child();
DROP FUNCTION sw_private.guard_analysis_definition();
DROP FUNCTION sw_private.hash_text(text);
DROP FUNCTION sw_private.narrative_text(jsonb, text);
DROP FUNCTION sw_private.receipt_mac(text, text);
DROP FUNCTION sw_private.report_bundle(uuid, uuid);
DROP FUNCTION sw_private.require_extraction_provenance();
DROP FUNCTION sw_private.require_reviewed_approval();
DROP FUNCTION sw_private.require_revision_provenance();
DROP FUNCTION sw_private.reserve_document(uuid, uuid, text, text, bigint, text);
DROP FUNCTION sw_private.reserve_processing(uuid, uuid, text, uuid, uuid, integer, uuid);
DROP FUNCTION sw_private.revise(uuid, uuid, integer, uuid, text);
DROP FUNCTION sw_private.rsa_calibrated(jsonb, text);
ALTER TABLE public.sw_extraction_segments DROP CONSTRAINT sw_segment_job_fk;
ALTER TABLE public.sw_assessments DROP COLUMN analysis_type,DROP COLUMN method_version_id,DROP COLUMN purpose,DROP COLUMN horizon,DROP COLUMN context_snapshot,DROP COLUMN knowledge_gaps,DROP COLUMN conflicts,DROP COLUMN supersedes_id,DROP COLUMN supersedes_version;
ALTER TABLE public.sw_reports DROP COLUMN template_version_id,DROP COLUMN sections,DROP COLUMN supersedes_id,DROP COLUMN supersedes_version;
DROP TABLE public.sw_ai_draft_applications;
DROP TABLE public.sw_report_exports;
DROP TABLE sw_private.source_write_intents;
DROP TABLE sw_private.approval_intents;
DROP TABLE public.sw_processing_jobs;
DROP TABLE sw_private.worker_keys;
DROP TABLE public.sw_ai_activation_revocations;
DROP TABLE public.sw_ai_activations;
DROP TABLE public.sw_revision_requests;
DROP TABLE public.sw_report_approvals;
DROP TABLE public.sw_extraction_segments;
DROP TABLE public.sw_documents;
DROP TABLE public.sw_analysis_questions;
DROP TABLE public.sw_analysis_inputs;
DROP TABLE public.sw_report_templates;
DROP TABLE public.sw_method_versions;
ALTER TABLE public.sw_risks DROP CONSTRAINT sw_accepted_risk_rated,ALTER COLUMN likelihood SET NOT NULL,ALTER COLUMN consequence SET NOT NULL;
ALTER TABLE public.sw_sources DROP CONSTRAINT sw_sources_source_type_check;
ALTER TABLE public.sw_sources ADD CONSTRAINT sw_sources_source_type_check CHECK(source_type IN ('manual','url_reference'));
ALTER TABLE public.sw_source_items DROP CONSTRAINT sw_source_items_retrieval_status_check;
ALTER TABLE public.sw_source_items ADD CONSTRAINT sw_source_items_retrieval_status_check CHECK(retrieval_status='manual');
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
        IF btrim(NEW.professional_conclusion) = '' OR NEW.likelihood IS NULL OR NEW.consequence IS NULL THEN
          RAISE EXCEPTION 'SW_ASSESSMENT_CONCLUSION_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sw_citations c WHERE c.workspace_id = NEW.workspace_id AND c.assessment_id = NEW.id) THEN
          RAISE EXCEPTION 'SW_CITATION_REQUIRED' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF btrim(NEW.executive_summary) = '' OR btrim(NEW.conclusion) = '' OR
          (NEW.report_type <> 'briefing' AND (btrim(NEW.overall_description) = '' OR btrim(NEW.risk_assessment) = '' OR btrim(NEW.identified_risks) = '' OR btrim(NEW.security_arrangement) = '' OR btrim(NEW.preparedness_incident_management) = '' OR btrim(NEW.contacts) = '')) THEN
          RAISE EXCEPTION 'SW_REPORT_SECTIONS_REQUIRED' USING ERRCODE = '23514';
        END IF;
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
