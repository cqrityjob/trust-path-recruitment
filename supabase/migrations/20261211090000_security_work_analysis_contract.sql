-- Created by `supabase migration new security_work_analysis_contract` as
-- 20260924060136; moved to next canonical ledger slot (ledger leads clock).
-- Schema-only. No provider/key activation, runtime deployment or private data.
-- Business conflicts use PT409 (HTTP 409), never serialization_failure 40001:
-- PostgREST retries 40001. These are final stale-input decisions, not transient
-- database serialization failures. See analysis-release.md for the vendor note.
BEGIN;

CREATE TABLE public.sw_method_versions (
 id text PRIMARY KEY, analysis_type text NOT NULL CHECK (analysis_type IN ('rsa','monitoring','legacy_security')),
 definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object' AND octet_length(definition::text)<=32768),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sw_method_versions(id,analysis_type,definition) VALUES
 ('rsa-v1','rsa','{"version":1,"matrix":[["green","green","green","green","green"],["green","green","yellow","yellow","yellow"],["green","yellow","yellow","orange","orange"],["green","yellow","orange","red","red"],["green","yellow","red","red","red"]],"matrixOwnerApproved":"2026-09-24","scaleCalibrationRequired":true,"unknownIsLow":false}'),
 ('monitoring-v1','monitoring','{"version":1,"requiresSourceReview":true,"unknownIsLow":false}'),
 ('legacy-security-v1','legacy_security','{"version":1,"legacyApprovalRulesPreserved":true}');
CREATE TABLE public.sw_report_templates (
 id text PRIMARY KEY, method_version_id text NOT NULL REFERENCES public.sw_method_versions(id),
 required_sections text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sw_report_templates(id,method_version_id,required_sections) VALUES
 ('rsa-report-v1','rsa-v1',ARRAY['introduction','method','context','risk_analysis','vulnerability','conclusions_actions']),
 ('monitoring-report-v1','monitoring-v1',ARRAY['summary','threats','technology','regulation','incidents','recommendations']),
 ('legacy-security-report-v1','legacy-security-v1',ARRAY['executive_summary','overall_description','risk_assessment','identified_risks','security_arrangement','preparedness_incident_management','conclusion','contacts']);
ALTER TABLE public.sw_method_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_report_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sw_method_versions,public.sw_report_templates FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sw_method_versions,public.sw_report_templates TO authenticated;
CREATE POLICY sw_method_read ON public.sw_method_versions FOR SELECT TO authenticated USING (sw_private.is_human());
CREATE POLICY sw_template_read ON public.sw_report_templates FOR SELECT TO authenticated USING (sw_private.is_human());
CREATE TRIGGER sw_immutable BEFORE UPDATE OR DELETE ON public.sw_method_versions FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_immutable BEFORE UPDATE OR DELETE ON public.sw_report_templates FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();

ALTER TABLE public.sw_assessments
 ADD COLUMN analysis_type text NOT NULL DEFAULT 'legacy_security' CHECK (analysis_type IN ('rsa','monitoring','legacy_security')),
 ADD COLUMN method_version_id text NOT NULL DEFAULT 'legacy-security-v1' REFERENCES public.sw_method_versions(id),
 ADD COLUMN purpose text NOT NULL DEFAULT '', ADD COLUMN horizon text NOT NULL DEFAULT '',
 ADD COLUMN context_snapshot jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(context_snapshot)='object' AND octet_length(context_snapshot::text)<=65536),
 ADD COLUMN knowledge_gaps jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(knowledge_gaps)='array' AND octet_length(knowledge_gaps::text)<=16000),
 ADD COLUMN conflicts jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(conflicts)='array' AND octet_length(conflicts::text)<=16000),
 ADD COLUMN supersedes_id uuid, ADD COLUMN supersedes_version integer,
 ADD CONSTRAINT sw_assessment_revision_fk FOREIGN KEY(workspace_id,supersedes_id) REFERENCES public.sw_assessments(workspace_id,id),
 ADD CONSTRAINT sw_assessment_revision_pair CHECK ((supersedes_id IS NULL)=(supersedes_version IS NULL) AND (supersedes_version IS NULL OR supersedes_version>0));
ALTER TABLE public.sw_reports
 ADD COLUMN template_version_id text NOT NULL DEFAULT 'legacy-security-report-v1' REFERENCES public.sw_report_templates(id),
 ADD COLUMN sections jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(sections)='object' AND octet_length(sections::text)<=100000),
 ADD COLUMN supersedes_id uuid, ADD COLUMN supersedes_version integer,
 ADD CONSTRAINT sw_report_revision_fk FOREIGN KEY(workspace_id,supersedes_id) REFERENCES public.sw_reports(workspace_id,id),
 ADD CONSTRAINT sw_report_revision_pair CHECK ((supersedes_id IS NULL)=(supersedes_version IS NULL) AND (supersedes_version IS NULL OR supersedes_version>0));
ALTER TABLE public.sw_risks ALTER COLUMN likelihood DROP NOT NULL, ALTER COLUMN consequence DROP NOT NULL;
ALTER TABLE public.sw_risks ADD CONSTRAINT sw_accepted_risk_rated CHECK(status='proposed' OR (likelihood IS NOT NULL AND consequence IS NOT NULL));
ALTER TABLE public.sw_sources DROP CONSTRAINT sw_sources_source_type_check;
ALTER TABLE public.sw_sources ADD CONSTRAINT sw_sources_source_type_check CHECK(source_type IN ('manual','url_reference','document'));
ALTER TABLE public.sw_source_items DROP CONSTRAINT sw_source_items_retrieval_status_check;
ALTER TABLE public.sw_source_items ADD CONSTRAINT sw_source_items_retrieval_status_check CHECK(retrieval_status IN ('manual','extracted'));

CREATE TABLE public.sw_analysis_inputs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
 assessment_id uuid NOT NULL, source_item_id uuid NOT NULL,
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected')),
 review_note text NOT NULL DEFAULT '', created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,assessment_id,source_item_id),
 FOREIGN KEY(workspace_id,assessment_id) REFERENCES public.sw_assessments(workspace_id,id),
 FOREIGN KEY(workspace_id,source_item_id) REFERENCES public.sw_source_items(workspace_id,id)
);
CREATE TABLE public.sw_analysis_questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),assessment_id uuid NOT NULL,
 question text NOT NULL CHECK(char_length(btrim(question)) BETWEEN 1 AND 4000),answer text NOT NULL DEFAULT '',
 evidence_kind text NOT NULL DEFAULT 'user_input' CHECK(evidence_kind IN ('user_input','assumption')),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1000),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,assessment_id) REFERENCES public.sw_assessments(workspace_id,id)
);
CREATE TABLE public.sw_documents (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),source_id uuid NOT NULL,
 filename text NOT NULL CHECK(char_length(filename) BETWEEN 1 AND 255),mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 object_path text NOT NULL UNIQUE,status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','ready','failed')),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,source_id) REFERENCES public.sw_sources(workspace_id,id)
);
CREATE TABLE public.sw_extraction_segments (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,document_id uuid NOT NULL,source_item_id uuid NOT NULL,job_id uuid NOT NULL,
 parser_version text NOT NULL CHECK(char_length(parser_version) BETWEEN 1 AND 200),
 locator text NOT NULL CHECK(char_length(btrim(locator)) BETWEEN 1 AND 500),page_number integer CHECK(page_number BETWEEN 1 AND 100),section text CHECK(char_length(section)<=500),
 text_sha256 text NOT NULL CHECK(text_sha256 ~ '^[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,source_item_id),
 FOREIGN KEY(workspace_id,document_id) REFERENCES public.sw_documents(workspace_id,id),
 FOREIGN KEY(workspace_id,source_item_id) REFERENCES public.sw_source_items(workspace_id,id)
);
CREATE TABLE public.sw_report_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,report_id uuid NOT NULL,report_version integer NOT NULL,
 bundle jsonb NOT NULL CHECK(jsonb_typeof(bundle)='object' AND octet_length(bundle::text)<=2097152),
 bundle_hash text NOT NULL CHECK(bundle_hash ~ '^[0-9a-f]{64}$'),approved_by uuid NOT NULL REFERENCES auth.users(id),approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,report_id,report_version),FOREIGN KEY(workspace_id,report_id) REFERENCES public.sw_reports(workspace_id,id)
);
CREATE TABLE public.sw_revision_requests (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('assessment','report')),original_id uuid NOT NULL,original_version integer NOT NULL,new_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sw_ai_activations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),environment text NOT NULL CHECK(environment IN ('production','internal_qa')),purpose text NOT NULL DEFAULT 'draft_analysis' CHECK(purpose='draft_analysis'),max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 1 AND 8192),timeout_ms integer NOT NULL CHECK(timeout_ms BETWEEN 1000 AND 60000),provider text NOT NULL CHECK(char_length(btrim(provider)) BETWEEN 1 AND 100),model text NOT NULL CHECK(char_length(btrim(model)) BETWEEN 1 AND 200),
 task_version text NOT NULL,prompt_version text NOT NULL,policy_version text NOT NULL,output_schema_version text NOT NULL,
 data_processing_approval text NOT NULL CHECK(char_length(btrim(data_processing_approval)) BETWEEN 1 AND 2000),
 approved_by uuid NOT NULL REFERENCES auth.users(id),approved_at timestamptz NOT NULL DEFAULT now(),valid_until timestamptz NOT NULL,
 max_cost_micros bigint NOT NULL CHECK(max_cost_micros BETWEEN 1 AND 100000000),daily_budget_micros bigint NOT NULL CHECK(daily_budget_micros>=max_cost_micros),
 CHECK(valid_until>approved_at)
);
CREATE TABLE public.sw_ai_activation_revocations (
 activation_id uuid PRIMARY KEY REFERENCES public.sw_ai_activations(id),revoked_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE TABLE sw_private.worker_keys (
 key_id text PRIMARY KEY CHECK(char_length(key_id) BETWEEN 1 AND 100),secret text NOT NULL CHECK(octet_length(secret)>=32),active boolean NOT NULL DEFAULT true
);
ALTER TABLE sw_private.worker_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sw_private.worker_keys FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.sw_processing_jobs (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),kind text NOT NULL CHECK(kind IN ('extraction','ai')),
 assessment_id uuid,document_id uuid,expected_version integer,activation_id uuid REFERENCES public.sw_ai_activations(id),
 input_manifest jsonb NOT NULL CHECK(octet_length(input_manifest::text)<=1048576),input_hash text NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','dispatched','succeeded','failed','outcome_unknown')),
 fence uuid,dispatched_at timestamptz,completed_at timestamptz,output jsonb,output_hash text,error_code text,
 reserved_cost_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_cost_micros>=0),actual_cost_micros bigint CHECK(actual_cost_micros BETWEEN 0 AND reserved_cost_micros),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,assessment_id) REFERENCES public.sw_assessments(workspace_id,id),
 FOREIGN KEY(workspace_id,document_id) REFERENCES public.sw_documents(workspace_id,id),
 CHECK((kind='extraction' AND document_id IS NOT NULL AND assessment_id IS NULL AND activation_id IS NULL) OR (kind='ai' AND assessment_id IS NOT NULL AND document_id IS NULL AND activation_id IS NOT NULL)),
 CHECK((status='reserved')=(fence IS NULL)),CHECK(output IS NULL OR octet_length(output::text)<=262144)
);
ALTER TABLE public.sw_extraction_segments ADD CONSTRAINT sw_segment_job_fk FOREIGN KEY(workspace_id,job_id) REFERENCES public.sw_processing_jobs(workspace_id,id);
CREATE UNIQUE INDEX sw_one_document_extraction ON public.sw_processing_jobs(workspace_id,document_id) WHERE kind='extraction';
CREATE UNIQUE INDEX sw_ai_input_once ON public.sw_processing_jobs(workspace_id,input_hash) WHERE kind='ai';
CREATE INDEX sw_jobs_budget ON public.sw_processing_jobs(workspace_id,created_at) WHERE kind='ai';
CREATE INDEX sw_inputs_assessment ON public.sw_analysis_inputs(workspace_id,assessment_id);
CREATE INDEX sw_questions_assessment ON public.sw_analysis_questions(workspace_id,assessment_id);
CREATE INDEX sw_segments_document ON public.sw_extraction_segments(workspace_id,document_id);
CREATE INDEX sw_approvals_report ON public.sw_report_approvals(workspace_id,report_id);
CREATE INDEX sw_assessment_revision ON public.sw_assessments(workspace_id,supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX sw_report_revision ON public.sw_reports(workspace_id,supersedes_id) WHERE supersedes_id IS NOT NULL;

DO $security$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['sw_analysis_inputs','sw_analysis_questions','sw_documents','sw_extraction_segments','sw_report_approvals','sw_revision_requests','sw_processing_jobs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY sw_member_read ON public.%I FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id))',t);
  EXECUTE format('CREATE INDEX ON public.%I(workspace_id)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['sw_analysis_inputs','sw_analysis_questions'] LOOP
  EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY sw_editor_write ON public.%I FOR ALL TO authenticated USING(sw_private.can_edit(workspace_id)) WITH CHECK(sw_private.can_edit(workspace_id))',t);
  EXECUTE format('CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record()',t);
  EXECUTE format('CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.record_change()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['sw_extraction_segments','sw_report_approvals','sw_revision_requests','sw_ai_activations','sw_ai_activation_revocations'] LOOP
  EXECUTE format('CREATE TRIGGER sw_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change()',t);
 END LOOP;
END $security$;
ALTER TABLE public.sw_ai_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_ai_activation_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sw_ai_activations,public.sw_ai_activation_revocations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sw_ai_activations,public.sw_ai_activation_revocations TO authenticated;
CREATE POLICY sw_config_read ON public.sw_ai_activations FOR SELECT TO authenticated USING(sw_private.can_read(workspace_id));
CREATE POLICY sw_revocation_read ON public.sw_ai_activation_revocations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.sw_ai_activations a WHERE a.id=activation_id AND sw_private.can_read(a.workspace_id)));

-- Canonical hash uses PostgreSQL jsonb for database-owned manifests/bundles;
-- signed completion payloads instead hash their exact UTF-8 wire text.
CREATE FUNCTION sw_private.hash_text(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT encode(sha256(convert_to(v,'UTF8')),'hex')$$;
DO $hmac$
DECLARE n text;
BEGIN
 SELECT ns.nspname INTO n FROM pg_extension e JOIN pg_namespace ns ON ns.oid=e.extnamespace WHERE e.extname='pgcrypto';
 IF n IS NULL THEN RAISE EXCEPTION 'SW_PGCRYPTO_REQUIRED'; END IF;
 EXECUTE format('CREATE FUNCTION sw_private.receipt_mac(message text,secret text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='''' AS $fn$ SELECT encode(%I.hmac(convert_to(message,''UTF8''),convert_to(secret,''UTF8''),''sha256''),''hex'') $fn$',n);
END $hmac$;
CREATE FUNCTION sw_private.check_receipt(_kind text,_job uuid,_fence uuid,_key text,_payload text,_signature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret_value text; expected text;
BEGIN
 SELECT secret INTO secret_value FROM sw_private.worker_keys WHERE key_id=_key AND active;
 IF secret_value IS NULL OR _signature IS NULL OR _signature !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'SW_WORKER_RECEIPT_REQUIRED' USING ERRCODE='42501'; END IF;
 expected:=sw_private.receipt_mac(_kind||E'\n'||_job::text||E'\n'||_fence::text||E'\n'||sw_private.hash_text(_payload),secret_value);
 IF expected IS DISTINCT FROM _signature THEN RAISE EXCEPTION 'SW_WORKER_RECEIPT_INVALID' USING ERRCODE='42501'; END IF;
END $$;

-- Child mutation and bundle reading share the assessment row as serialization point.
CREATE FUNCTION sw_private.guard_analysis_child() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; aid uuid; a public.sw_assessments; verified_locator text;
BEGIN
 IF TG_TABLE_NAME='sw_citations' AND TG_OP<>'DELETE' THEN
  SELECT e.locator INTO verified_locator FROM public.sw_extraction_segments e WHERE e.workspace_id=NEW.workspace_id AND e.source_item_id=NEW.source_item_id;
  IF FOUND THEN NEW.locator:=verified_locator; END IF;
 END IF;
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 aid:=(r->>'assessment_id')::uuid;
 IF TG_TABLE_NAME IN ('sw_controls','sw_citations') AND r->>'risk_id' IS NOT NULL THEN SELECT assessment_id INTO aid FROM public.sw_risks WHERE workspace_id=(r->>'workspace_id')::uuid AND id=(r->>'risk_id')::uuid; END IF;
 IF TG_TABLE_NAME='sw_citations' AND r->>'report_id' IS NOT NULL THEN SELECT assessment_id INTO aid FROM public.sw_reports WHERE workspace_id=(r->>'workspace_id')::uuid AND id=(r->>'report_id')::uuid; END IF;
 IF aid IS NULL THEN RETURN coalesce(NEW,OLD); END IF;
 SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=(r->>'workspace_id')::uuid AND id=aid FOR UPDATE;
 IF NOT sw_private.can_edit(a.workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 IF a.analysis_type<>'legacy_security' AND a.status IN ('approved','archived') AND TG_TABLE_NAME IN ('sw_analysis_inputs','sw_analysis_questions','sw_controls') THEN RAISE EXCEPTION 'SW_APPROVED_INPUTS_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='sw_risks' THEN
  IF a.analysis_type<>'legacy_security' AND a.status IN ('approved','archived') AND (TG_OP='INSERT' OR (to_jsonb(NEW)-ARRAY['status','decision_rationale','version','updated_at','accepted_by','accepted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decision_rationale','version','updated_at','accepted_by','accepted_at'])) THEN RAISE EXCEPTION 'SW_APPROVED_RISKS_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF a.analysis_type='legacy_security' AND (NEW.likelihood IS NULL OR NEW.consequence IS NULL) THEN RAISE EXCEPTION 'SW_LEGACY_RISK_RATING_REQUIRED' USING ERRCODE='23514'; END IF;
  IF a.analysis_type='rsa' AND (NEW.likelihood IS NOT NULL OR NEW.consequence IS NOT NULL) AND NOT sw_private.rsa_calibrated(a.context_snapshot,a.horizon) THEN RAISE EXCEPTION 'SW_CALIBRATION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE FUNCTION sw_private.rsa_calibrated(c jsonb,h text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce((btrim(coalesce(h,''))<>'' AND jsonb_typeof(c->'calibration'->'likelihood')='array' AND jsonb_typeof(c->'calibration'->'consequence')='array'
 AND jsonb_array_length(c->'calibration'->'likelihood')=5 AND jsonb_array_length(c->'calibration'->'consequence')=5
 AND btrim(coalesce(c->'calibration'->>'riskAcceptance',''))<>''
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c->'calibration'->'likelihood','[]')) v WHERE jsonb_typeof(v)<>'string' OR btrim(v#>>'{}')='')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c->'calibration'->'consequence','[]')) v WHERE jsonb_typeof(v)<>'string' OR btrim(v#>>'{}')='')),false)
$$;
DO $children$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sw_analysis_inputs','sw_analysis_questions','sw_risks','sw_controls','sw_actions','sw_citations'] LOOP
  EXECUTE format('CREATE TRIGGER sw_05_analysis_parent BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.guard_analysis_child()',t);
 END LOOP;
END $children$;

CREATE FUNCTION sw_private.guard_analysis_definition() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m public.sw_method_versions; t public.sw_report_templates; a public.sw_assessments;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id OR NEW.supersedes_version IS DISTINCT FROM OLD.supersedes_version) THEN RAISE EXCEPTION 'SW_REVISION_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='sw_assessments' THEN
  SELECT * INTO m FROM public.sw_method_versions WHERE id=NEW.method_version_id;
  IF m.analysis_type IS DISTINCT FROM NEW.analysis_type THEN RAISE EXCEPTION 'SW_METHOD_MISMATCH' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.analysis_type IS DISTINCT FROM OLD.analysis_type OR NEW.method_version_id IS DISTINCT FROM OLD.method_version_id) THEN RAISE EXCEPTION 'SW_METHOD_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW.analysis_type='rsa' AND (NEW.likelihood IS NOT NULL OR NEW.consequence IS NOT NULL OR EXISTS(SELECT 1 FROM public.sw_risks r WHERE r.workspace_id=NEW.workspace_id AND r.assessment_id=NEW.id AND (r.likelihood IS NOT NULL OR r.consequence IS NOT NULL))) AND NOT sw_private.rsa_calibrated(NEW.context_snapshot,NEW.horizon) THEN RAISE EXCEPTION 'SW_CALIBRATION_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO t FROM public.sw_report_templates WHERE id=NEW.template_version_id;
  SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=NEW.workspace_id AND id=NEW.assessment_id;
  IF t.method_version_id IS DISTINCT FROM a.method_version_id THEN RAISE EXCEPTION 'SW_TEMPLATE_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sw_15_analysis_definition BEFORE INSERT OR UPDATE ON public.sw_assessments FOR EACH ROW EXECUTE FUNCTION sw_private.guard_analysis_definition();
CREATE TRIGGER sw_15_analysis_definition BEFORE INSERT OR UPDATE ON public.sw_reports FOR EACH ROW EXECUTE FUNCTION sw_private.guard_analysis_definition();
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


CREATE FUNCTION sw_private.report_bundle(_workspace_id uuid,_report_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.sw_reports; a public.sw_assessments; result jsonb;
BEGIN
 IF NOT sw_private.can_read(_workspace_id) THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.sw_reports WHERE workspace_id=_workspace_id AND id=_report_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'SW_REPORT_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=r.assessment_id FOR UPDATE;
 SELECT jsonb_build_object('formatVersion',1,'report',to_jsonb(r),'assessment',to_jsonb(a),
  'method',(SELECT to_jsonb(m) FROM public.sw_method_versions m WHERE id=a.method_version_id),
  'template',(SELECT to_jsonb(t) FROM public.sw_report_templates t WHERE id=r.template_version_id),
  'inputs',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.sw_analysis_inputs i WHERE i.workspace_id=_workspace_id AND i.assessment_id=a.id),'[]'),
  'questions',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position,q.id) FROM public.sw_analysis_questions q WHERE q.workspace_id=_workspace_id AND q.assessment_id=a.id),'[]'),
  'risks',coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.id) FROM public.sw_risks k WHERE k.workspace_id=_workspace_id AND k.assessment_id=a.id),'[]'),
  'controls',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.sw_controls c JOIN public.sw_risks k ON k.workspace_id=c.workspace_id AND k.id=c.risk_id WHERE k.workspace_id=_workspace_id AND k.assessment_id=a.id),'[]'),
  'actions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.sw_actions x WHERE x.workspace_id=_workspace_id AND x.assessment_id=a.id),'[]'),
  'citations',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.sw_citations c WHERE c.workspace_id=_workspace_id AND (c.report_id=r.id OR c.assessment_id=a.id OR c.risk_id IN(SELECT k.id FROM public.sw_risks k WHERE k.workspace_id=_workspace_id AND k.assessment_id=a.id))),'[]'),
  'sources',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('extraction',(SELECT to_jsonb(e)||jsonb_build_object('document',(SELECT to_jsonb(d) FROM public.sw_documents d WHERE d.workspace_id=e.workspace_id AND d.id=e.document_id)) FROM public.sw_extraction_segments e WHERE e.workspace_id=s.workspace_id AND e.source_item_id=s.id)) ORDER BY s.id) FROM public.sw_source_items s WHERE s.workspace_id=_workspace_id AND (s.id IN(SELECT i.source_item_id FROM public.sw_analysis_inputs i WHERE i.workspace_id=_workspace_id AND i.assessment_id=a.id) OR s.id IN(SELECT c.source_item_id FROM public.sw_citations c WHERE c.workspace_id=_workspace_id AND (c.report_id=r.id OR c.assessment_id=a.id OR c.risk_id IN(SELECT k.id FROM public.sw_risks k WHERE k.workspace_id=_workspace_id AND k.assessment_id=a.id))))),'[]')) INTO result;
 IF octet_length(result::text)>2097152 THEN RAISE EXCEPTION 'SW_REPORT_BUNDLE_TOO_LARGE' USING ERRCODE='23514'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.sw_preview_report(_workspace_id uuid,_report_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE b jsonb; BEGIN
 b:=sw_private.report_bundle(_workspace_id,_report_id);
 RETURN jsonb_build_object('bundle',b,'bundle_hash',sw_private.hash_text(b::text));
END $$;

-- Every approval path, including direct RLS UPDATE, creates a complete immutable
-- bundle. The public approval RPC additionally compares the reviewed preview.
CREATE FUNCTION sw_private.capture_report_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb;
BEGIN
 IF NEW.status='approved' AND OLD.status='draft' THEN
  IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE='42501'; END IF;
  b:=sw_private.report_bundle(NEW.workspace_id,NEW.id);
  INSERT INTO public.sw_report_approvals(workspace_id,report_id,report_version,bundle,bundle_hash,approved_by)
   VALUES(NEW.workspace_id,NEW.id,NEW.version,b,sw_private.hash_text(b::text),auth.uid());
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER sw_95_complete_bundle AFTER UPDATE ON public.sw_reports FOR EACH ROW EXECUTE FUNCTION sw_private.capture_report_approval();
CREATE TABLE sw_private.approval_intents(report_id uuid PRIMARY KEY,transaction_id bigint NOT NULL,actor uuid NOT NULL);
ALTER TABLE sw_private.approval_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sw_private.approval_intents FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION sw_private.require_reviewed_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='approved' AND OLD.status='draft' AND NEW.template_version_id<>'legacy-security-report-v1' AND NOT EXISTS(SELECT 1 FROM sw_private.approval_intents WHERE report_id=NEW.id AND transaction_id=txid_current() AND actor=auth.uid()) THEN RAISE EXCEPTION 'SW_REVIEWED_BUNDLE_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sw_18_reviewed_approval BEFORE UPDATE ON public.sw_reports FOR EACH ROW EXECUTE FUNCTION sw_private.require_reviewed_approval();
CREATE FUNCTION sw_private.approve_report(_workspace_id uuid,_report_id uuid,_expected_version integer,_expected_bundle_hash text) RETURNS public.sw_report_approvals
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb; r public.sw_reports; a public.sw_assessments; receipt public.sw_report_approvals;
BEGIN
 IF NOT sw_private.can_approve(_workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE='42501'; END IF;
 b:=sw_private.report_bundle(_workspace_id,_report_id);
 SELECT * INTO r FROM public.sw_reports WHERE workspace_id=_workspace_id AND id=_report_id;
 IF r.version IS DISTINCT FROM _expected_version OR sw_private.hash_text(b::text) IS DISTINCT FROM _expected_bundle_hash THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=r.assessment_id;
 IF a.status='draft' THEN UPDATE public.sw_assessments SET status='in_review' WHERE workspace_id=_workspace_id AND id=a.id; END IF;
 IF a.status IN ('draft','in_review') THEN UPDATE public.sw_assessments SET status='approved' WHERE workspace_id=_workspace_id AND id=a.id; END IF;
 INSERT INTO sw_private.approval_intents(report_id,transaction_id,actor) VALUES(_report_id,txid_current(),auth.uid());
 UPDATE public.sw_reports SET status='approved' WHERE workspace_id=_workspace_id AND id=_report_id AND version=_expected_version AND status='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
 DELETE FROM sw_private.approval_intents WHERE report_id=_report_id;
 SELECT * INTO receipt FROM public.sw_report_approvals WHERE workspace_id=_workspace_id AND report_id=_report_id ORDER BY report_version DESC LIMIT 1;
 RETURN receipt;
END $$;

CREATE FUNCTION public.sw_approve_report(_workspace_id uuid,_report_id uuid,_expected_version integer,_expected_bundle_hash text) RETURNS public.sw_report_approvals LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.approve_report(_workspace_id,_report_id,_expected_version,_expected_bundle_hash)$$;

CREATE FUNCTION sw_private.revise(_workspace_id uuid,_id uuid,_version integer,_request_id uuid,_kind text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.sw_revision_requests; a public.sw_assessments; r public.sw_reports; new_id uuid; k public.sw_risks; new_risk uuid;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.sw_workspaces WHERE id=_workspace_id FOR UPDATE;
 SELECT * INTO previous FROM public.sw_revision_requests WHERE id=_request_id;
 IF FOUND THEN
  IF previous.workspace_id<>_workspace_id OR previous.original_id<>_id OR previous.original_version<>_version OR previous.kind<>_kind OR previous.created_by<>auth.uid() THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN previous.new_id;
 END IF;
 new_id:=gen_random_uuid();
 INSERT INTO public.sw_revision_requests(id,workspace_id,kind,original_id,original_version,new_id,created_by) VALUES(_request_id,_workspace_id,_kind,_id,_version,new_id,auth.uid());
 IF _kind='assessment' THEN
  SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=_id FOR UPDATE;
  IF a.id IS NULL OR a.version IS DISTINCT FROM _version OR a.status NOT IN ('approved','archived') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.sw_assessments(id,workspace_id,title,situation,scope,affected_activity,assets,threat,vulnerability,existing_controls,likelihood,consequence,uncertainty,assumptions,proposed_measures,professional_conclusion,analysis_type,method_version_id,purpose,horizon,context_snapshot,knowledge_gaps,conflicts,supersedes_id,supersedes_version)
  VALUES(new_id,_workspace_id,a.title,a.situation,a.scope,a.affected_activity,a.assets,a.threat,a.vulnerability,a.existing_controls,a.likelihood,a.consequence,a.uncertainty,a.assumptions,a.proposed_measures,a.professional_conclusion,a.analysis_type,a.method_version_id,a.purpose,a.horizon,a.context_snapshot,a.knowledge_gaps,a.conflicts,a.id,a.version);
  INSERT INTO public.sw_analysis_inputs(workspace_id,assessment_id,source_item_id,review_status,review_note) SELECT _workspace_id,new_id,source_item_id,'pending',review_note FROM public.sw_analysis_inputs WHERE workspace_id=_workspace_id AND assessment_id=_id;
  INSERT INTO public.sw_analysis_questions(workspace_id,assessment_id,question,answer,evidence_kind,position) SELECT _workspace_id,new_id,question,answer,evidence_kind,position FROM public.sw_analysis_questions WHERE workspace_id=_workspace_id AND assessment_id=_id;
  INSERT INTO public.sw_citations(workspace_id,assessment_id,source_item_id,claim,excerpt,locator) SELECT _workspace_id,new_id,source_item_id,claim,excerpt,locator FROM public.sw_citations WHERE workspace_id=_workspace_id AND assessment_id=_id;
  FOR k IN SELECT * FROM public.sw_risks WHERE workspace_id=_workspace_id AND assessment_id=_id ORDER BY id LOOP
   INSERT INTO public.sw_risks(workspace_id,assessment_id,title,description,affected_assets,likelihood,consequence,uncertainty) VALUES(_workspace_id,new_id,k.title,k.description,k.affected_assets,k.likelihood,k.consequence,k.uncertainty) RETURNING id INTO new_risk;
   INSERT INTO public.sw_controls(workspace_id,risk_id,title,description,effectiveness) SELECT _workspace_id,new_risk,title,description,effectiveness FROM public.sw_controls WHERE workspace_id=_workspace_id AND risk_id=k.id;
   INSERT INTO public.sw_citations(workspace_id,risk_id,source_item_id,claim,excerpt,locator) SELECT _workspace_id,new_risk,source_item_id,claim,excerpt,locator FROM public.sw_citations WHERE workspace_id=_workspace_id AND risk_id=k.id;
  END LOOP;
 ELSE
  SELECT * INTO r FROM public.sw_reports WHERE workspace_id=_workspace_id AND id=_id FOR UPDATE;
  IF r.id IS NULL OR r.version IS DISTINCT FROM _version OR r.status NOT IN ('approved','exported','archived') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.sw_reports(id,workspace_id,assessment_id,title,report_type,language,executive_summary,overall_description,risk_assessment,identified_risks,security_arrangement,preparedness_incident_management,conclusion,contacts,uncertainty,template_version_id,sections,supersedes_id,supersedes_version)
  VALUES(new_id,_workspace_id,r.assessment_id,r.title,r.report_type,r.language,r.executive_summary,r.overall_description,r.risk_assessment,r.identified_risks,r.security_arrangement,r.preparedness_incident_management,r.conclusion,r.contacts,r.uncertainty,r.template_version_id,r.sections,r.id,r.version);
  INSERT INTO public.sw_citations(workspace_id,report_id,source_item_id,claim,excerpt,locator) SELECT _workspace_id,new_id,source_item_id,claim,excerpt,locator FROM public.sw_citations WHERE workspace_id=_workspace_id AND report_id=_id;
 END IF;
 RETURN new_id;
END $$;
CREATE FUNCTION public.sw_revise_analysis(_workspace_id uuid,_assessment_id uuid,_expected_version integer,_request_id uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.revise(_workspace_id,_assessment_id,_expected_version,_request_id,'assessment')$$;
CREATE FUNCTION public.sw_revise_report(_workspace_id uuid,_report_id uuid,_expected_version integer,_request_id uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.revise(_workspace_id,_report_id,_expected_version,_request_id,'report')$$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('sw-documents','sw-documents',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
CREATE POLICY sw_document_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='sw-documents' AND EXISTS(SELECT 1 FROM public.sw_documents d WHERE d.object_path=name AND sw_private.can_read(d.workspace_id)));
CREATE POLICY sw_document_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='sw-documents' AND EXISTS(SELECT 1 FROM public.sw_documents d WHERE d.object_path=name AND d.status='reserved' AND d.created_by=(SELECT auth.uid()) AND sw_private.can_edit(d.workspace_id)));
CREATE TABLE sw_private.source_write_intents(source_id uuid PRIMARY KEY,workspace_id uuid NOT NULL,text_hash text,transaction_id bigint NOT NULL);
ALTER TABLE sw_private.source_write_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sw_private.source_write_intents FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION sw_private.reserve_document(_workspace_id uuid,_request_id uuid,_filename text,_mime_type text,_size_bytes bigint,_sha256 text) RETURNS public.sw_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sw_documents; sid uuid;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.sw_workspaces WHERE id=_workspace_id FOR UPDATE;
 SELECT * INTO d FROM public.sw_documents WHERE id=_request_id;
 IF FOUND THEN
  IF d.workspace_id<>_workspace_id OR d.created_by<>auth.uid() OR d.filename IS DISTINCT FROM _filename OR d.mime_type IS DISTINCT FROM _mime_type OR d.size_bytes IS DISTINCT FROM _size_bytes OR d.sha256 IS DISTINCT FROM _sha256 THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN d;
 END IF;
 sid:=gen_random_uuid();
 INSERT INTO sw_private.source_write_intents VALUES(sid,_workspace_id,NULL,txid_current());
 INSERT INTO public.sw_sources(id,workspace_id,name,source_type) VALUES(sid,_workspace_id,left(_filename,200),'document');
 DELETE FROM sw_private.source_write_intents WHERE source_id=sid;
 INSERT INTO public.sw_documents(id,workspace_id,source_id,filename,mime_type,size_bytes,sha256,object_path)
 VALUES(_request_id,_workspace_id,sid,_filename,_mime_type,_size_bytes,_sha256,_workspace_id::text||'/'||_request_id::text||'/original.'||CASE WHEN _mime_type='application/pdf' THEN 'pdf' ELSE 'docx' END) RETURNING * INTO d;
 RETURN d;
END $$;
CREATE FUNCTION public.sw_reserve_document(_workspace_id uuid,_request_id uuid,_filename text,_mime_type text,_size_bytes bigint,_sha256 text) RETURNS public.sw_documents LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.reserve_document(_workspace_id,_request_id,_filename,_mime_type,_size_bytes,_sha256)$$;

CREATE FUNCTION sw_private.reserve_processing(_workspace_id uuid,_request_id uuid,_kind text,_assessment_id uuid,_document_id uuid,_expected_version integer,_activation_id uuid) RETURNS public.sw_processing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.sw_processing_jobs; a public.sw_assessments; d public.sw_documents; cfg public.sw_ai_activations; manifest jsonb; budget bigint;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.sw_workspaces WHERE id=_workspace_id FOR UPDATE;
 SELECT * INTO j FROM public.sw_processing_jobs WHERE id=_request_id;
 IF FOUND THEN
  IF j.workspace_id<>_workspace_id OR j.created_by<>auth.uid() OR j.kind IS DISTINCT FROM _kind OR j.assessment_id IS DISTINCT FROM _assessment_id OR j.document_id IS DISTINCT FROM _document_id OR j.expected_version IS DISTINCT FROM _expected_version OR j.activation_id IS DISTINCT FROM _activation_id THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN j;
 END IF;
 IF _kind='extraction' THEN
  SELECT * INTO d FROM public.sw_documents WHERE workspace_id=_workspace_id AND id=_document_id;
  IF d.id IS NULL OR d.status<>'reserved' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='sw-documents' AND name=d.object_path) THEN RAISE EXCEPTION 'SW_UPLOAD_REQUIRED' USING ERRCODE='23514'; END IF;
  manifest:=jsonb_build_object('document',to_jsonb(d));budget:=0;
 ELSIF _kind='ai' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=_activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations v WHERE v.activation_id=_activation_id);
  IF cfg.id IS NULL OR NOT EXISTS(SELECT 1 FROM sw_private.worker_keys WHERE active) THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=_assessment_id FOR UPDATE;
  IF a.id IS NULL OR a.version IS DISTINCT FROM _expected_version OR a.status NOT IN ('draft','in_review') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.sw_analysis_inputs i WHERE i.workspace_id=_workspace_id AND i.assessment_id=a.id AND i.review_status='pending') THEN RAISE EXCEPTION 'SW_SOURCE_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  manifest:=jsonb_build_object('assessment',to_jsonb(a),'method',(SELECT to_jsonb(m) FROM public.sw_method_versions m WHERE id=a.method_version_id),
   'activation',to_jsonb(cfg),'questions',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position,q.id) FROM public.sw_analysis_questions q WHERE q.workspace_id=_workspace_id AND q.assessment_id=a.id),'[]'),
   'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('segmentId',coalesce(e.id,s.id),'sourceItemId',s.id,'text',s.factual_extract,'sha256',sw_private.hash_text(s.factual_extract),'locator',coalesce(e.locator,'Manual source'),'reviewVersion',i.version) ORDER BY s.id) FROM public.sw_analysis_inputs i JOIN public.sw_source_items s ON s.workspace_id=i.workspace_id AND s.id=i.source_item_id LEFT JOIN public.sw_extraction_segments e ON e.workspace_id=s.workspace_id AND e.source_item_id=s.id WHERE i.workspace_id=_workspace_id AND i.assessment_id=a.id AND i.review_status='accepted'),'[]'));
  IF jsonb_array_length(manifest->'sources')=0 THEN RAISE EXCEPTION 'SW_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND kind='ai' AND input_hash=sw_private.hash_text(manifest::text);
  IF FOUND THEN
   IF j.created_by<>auth.uid() THEN RAISE EXCEPTION 'SW_JOB_ALREADY_RESERVED' USING ERRCODE='42501'; END IF;
   RETURN j;
  END IF;
  budget:=cfg.max_cost_micros;
  IF coalesce((SELECT sum(coalesce(actual_cost_micros,reserved_cost_micros)) FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND kind='ai' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)+budget>cfg.daily_budget_micros THEN RAISE EXCEPTION 'SW_AI_BUDGET_EXCEEDED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'SW_PROCESSING_KIND_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO public.sw_processing_jobs(id,workspace_id,kind,assessment_id,document_id,expected_version,activation_id,input_manifest,input_hash,reserved_cost_micros)
 VALUES(_request_id,_workspace_id,_kind,_assessment_id,_document_id,_expected_version,_activation_id,manifest,sw_private.hash_text(manifest::text),budget) RETURNING * INTO j;
 RETURN j;
END $$;
CREATE FUNCTION public.sw_reserve_processing(_workspace_id uuid,_request_id uuid,_kind text,_assessment_id uuid DEFAULT NULL,_document_id uuid DEFAULT NULL,_expected_version integer DEFAULT NULL,_activation_id uuid DEFAULT NULL) RETURNS public.sw_processing_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.reserve_processing(_workspace_id,_request_id,_kind,_assessment_id,_document_id,_expected_version,_activation_id)$$;

CREATE FUNCTION sw_private.dispatch_processing(_workspace_id uuid,_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.sw_processing_jobs; cfg public.sw_ai_activations;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.created_by<>auth.uid() THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF j.status<>'reserved' THEN RETURN jsonb_build_object('job',to_jsonb(j),'dispatch',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM sw_private.worker_keys WHERE active) THEN RAISE EXCEPTION 'SW_WORKER_NOT_CONFIGURED' USING ERRCODE='42501'; END IF;
 IF j.kind='ai' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=j.activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations WHERE activation_id=j.activation_id);
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
  -- Child review writes take this same lock. Read their committed state only
  -- after acquiring it, and hold it until dispatch has been recorded.
  PERFORM 1 FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=j.assessment_id AND version=j.expected_version AND status IN ('draft','in_review') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  -- Sources are unique per assessment and in the server-built manifest.
  -- Equal cardinality plus the ID/version check below proves exact equality,
  -- including a newly accepted input that did not bump assessment.version.
  IF (SELECT count(*) FROM public.sw_analysis_inputs WHERE workspace_id=_workspace_id AND assessment_id=j.assessment_id AND review_status='accepted') <> jsonb_array_length(j.input_manifest->'sources') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(j.input_manifest->'sources') source WHERE NOT EXISTS(SELECT 1 FROM public.sw_analysis_inputs i WHERE i.workspace_id=_workspace_id AND i.assessment_id=j.assessment_id AND i.source_item_id=(source->>'sourceItemId')::uuid AND i.review_status='accepted' AND i.version=(source->>'reviewVersion')::integer)) OR j.input_manifest->'questions' IS DISTINCT FROM coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position,q.id) FROM public.sw_analysis_questions q WHERE q.workspace_id=_workspace_id AND q.assessment_id=j.assessment_id),'[]') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
 END IF;
 UPDATE public.sw_processing_jobs SET status='dispatched',fence=gen_random_uuid(),dispatched_at=now() WHERE id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('job',to_jsonb(j),'dispatch',true);
END $$;
CREATE FUNCTION public.sw_dispatch_processing(_workspace_id uuid,_job_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.dispatch_processing(_workspace_id,_job_id)$$;

CREATE FUNCTION sw_private.complete_processing(_workspace_id uuid,_job_id uuid,_fence uuid,_key_id text,_payload text,_signature text) RETURNS public.sw_processing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.sw_processing_jobs; d public.sw_documents; cfg public.sw_ai_activations; body jsonb; segment jsonb; sid uuid; total_chars integer:=0; count_segments integer:=0; actual_cost bigint; outcome text;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 IF _payload IS NULL OR octet_length(_payload)>1048576 THEN RAISE EXCEPTION 'SW_PAYLOAD_TOO_LARGE' USING ERRCODE='23514'; END IF;
 SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.created_by<>auth.uid() OR j.fence IS DISTINCT FROM _fence OR _fence IS NULL THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM sw_private.check_receipt(j.kind,j.id,j.fence,_key_id,_payload,_signature);
 IF j.output_hash IS NOT NULL THEN
  IF j.output_hash IS DISTINCT FROM sw_private.hash_text(_payload) THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN j;
 END IF;
 IF j.status<>'dispatched' THEN RAISE EXCEPTION 'SW_JOB_FINAL' USING ERRCODE='23514'; END IF;
 body:=_payload::jsonb;outcome:=body->>'status';
 IF jsonb_typeof(body)<>'object' OR outcome IS NULL OR outcome NOT IN ('succeeded','failed','outcome_unknown') THEN RAISE EXCEPTION 'SW_OUTPUT_INVALID' USING ERRCODE='23514'; END IF;
 IF j.kind='extraction' AND outcome='succeeded' THEN
  SELECT * INTO d FROM public.sw_documents WHERE workspace_id=_workspace_id AND id=j.document_id FOR UPDATE;
  IF body->>'sha256' IS DISTINCT FROM d.sha256 OR jsonb_typeof(body->'segments') IS DISTINCT FROM 'array' OR char_length(coalesce(body->>'parserVersion','')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SW_EXTRACTION_INVALID' USING ERRCODE='23514'; END IF;
  FOR segment IN SELECT * FROM jsonb_array_elements(body->'segments') LOOP
   total_chars:=total_chars+char_length(coalesce(segment->>'text',''));count_segments:=count_segments+1;
   IF char_length(btrim(coalesce(segment->>'text',''))) NOT BETWEEN 1 AND 16000 OR total_chars>200000 OR count_segments>200 THEN RAISE EXCEPTION 'SW_EXTRACTION_LIMIT' USING ERRCODE='23514'; END IF;
   sid:=(segment->>'id')::uuid;
   INSERT INTO sw_private.source_write_intents VALUES(sid,_workspace_id,sw_private.hash_text(segment->>'text'),txid_current());
   INSERT INTO public.sw_source_items(id,workspace_id,source_id,deduplication_key,original_title,factual_extract,retrieval_status)
   VALUES(sid,_workspace_id,d.source_id,j.id::text||':'||sid::text,d.filename,segment->>'text','extracted');
   INSERT INTO public.sw_extraction_segments(id,workspace_id,document_id,source_item_id,job_id,parser_version,locator,page_number,section,text_sha256)
   VALUES(sid,_workspace_id,d.id,sid,j.id,body->>'parserVersion',segment->>'locator',(segment->>'pageNumber')::integer,segment->>'section',sw_private.hash_text(segment->>'text'));
   DELETE FROM sw_private.source_write_intents WHERE source_id=sid;
  END LOOP;
  IF count_segments=0 THEN RAISE EXCEPTION 'SW_EMPTY_EXTRACTION' USING ERRCODE='23514'; END IF;
  UPDATE public.sw_documents SET status='ready' WHERE id=d.id;
 ELSIF j.kind='extraction' AND outcome='failed' THEN UPDATE public.sw_documents SET status='failed' WHERE id=j.document_id;
 ELSIF j.kind='ai' AND outcome='succeeded' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=j.activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations WHERE activation_id=j.activation_id);
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
  IF body->>'provider' IS DISTINCT FROM cfg.provider OR body->>'model' IS DISTINCT FROM cfg.model OR jsonb_typeof(body->'output') IS DISTINCT FROM 'object' OR octet_length((body->'output')::text)>262144 OR body->>'inputTokens' IS NULL OR body->>'outputTokens' IS NULL OR (body->>'outputTokens')::bigint>cfg.max_output_tokens OR (body->>'inputTokens')::bigint<0 OR (body->>'outputTokens')::bigint<0 THEN RAISE EXCEPTION 'SW_AI_OUTPUT_INVALID' USING ERRCODE='23514'; END IF;
  actual_cost:=(body->>'costMicros')::bigint;
 END IF;
 IF outcome<>'succeeded' AND char_length(coalesce(body->>'errorCode','')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'SW_ERROR_CODE_REQUIRED' USING ERRCODE='23514'; END IF;
 UPDATE public.sw_processing_jobs SET status=outcome,completed_at=now(),output=CASE WHEN j.kind='ai' THEN body->'output' ELSE jsonb_build_object('segmentCount',count_segments) END,
  output_hash=sw_private.hash_text(_payload),error_code=body->>'errorCode',actual_cost_micros=actual_cost WHERE id=j.id RETURNING * INTO j;
 RETURN j;
END $$;
CREATE FUNCTION public.sw_complete_processing(_workspace_id uuid,_job_id uuid,_fence uuid,_key_id text,_payload text,_signature text) RETURNS public.sw_processing_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.complete_processing(_workspace_id,_job_id,_fence,_key_id,_payload,_signature)$$;

-- Only signed completion/reservation creates server-labelled source records.
CREATE FUNCTION sw_private.require_extraction_provenance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF (TG_TABLE_NAME='sw_source_items' AND to_jsonb(NEW)->>'retrieval_status'='extracted') OR (TG_TABLE_NAME='sw_sources' AND to_jsonb(NEW)->>'source_type'='document' AND (TG_OP='INSERT' OR to_jsonb(OLD)->>'source_type' IS DISTINCT FROM to_jsonb(NEW)->>'source_type')) THEN
  IF NOT EXISTS(SELECT 1 FROM sw_private.source_write_intents i WHERE i.source_id=NEW.id AND i.workspace_id=NEW.workspace_id AND i.transaction_id=txid_current() AND (TG_TABLE_NAME='sw_sources' OR i.text_hash=sw_private.hash_text(to_jsonb(NEW)->>'factual_extract'))) THEN RAISE EXCEPTION 'SW_EXTRACTION_PROVENANCE_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sw_08_verified_extraction BEFORE INSERT ON public.sw_source_items FOR EACH ROW EXECUTE FUNCTION sw_private.require_extraction_provenance();
CREATE TRIGGER sw_08_document_source BEFORE INSERT OR UPDATE ON public.sw_sources FOR EACH ROW EXECUTE FUNCTION sw_private.require_extraction_provenance();

CREATE FUNCTION sw_private.require_revision_provenance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sw_revision_requests q WHERE q.workspace_id=NEW.workspace_id AND q.new_id=NEW.id AND q.original_id=NEW.supersedes_id AND q.original_version=NEW.supersedes_version AND q.kind=CASE TG_TABLE_NAME WHEN 'sw_assessments' THEN 'assessment' ELSE 'report' END) THEN RAISE EXCEPTION 'SW_REVISION_PROVENANCE_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sw_revision_provenance AFTER INSERT ON public.sw_assessments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sw_private.require_revision_provenance();
CREATE CONSTRAINT TRIGGER sw_revision_provenance AFTER INSERT ON public.sw_reports DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sw_private.require_revision_provenance();
CREATE TABLE public.sw_report_exports (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,report_id uuid NOT NULL,approval_id uuid NOT NULL,
 exported_by uuid NOT NULL REFERENCES auth.users(id),exported_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,report_id) REFERENCES public.sw_reports(workspace_id,id),
 FOREIGN KEY(workspace_id,approval_id) REFERENCES public.sw_report_approvals(workspace_id,id)
);
CREATE INDEX sw_exports_scope ON public.sw_report_exports(workspace_id,report_id);
ALTER TABLE public.sw_report_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sw_report_exports FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sw_report_exports TO authenticated;
CREATE POLICY sw_export_read ON public.sw_report_exports FOR SELECT TO authenticated USING(sw_private.can_read(workspace_id));
CREATE TRIGGER sw_immutable BEFORE UPDATE OR DELETE ON public.sw_report_exports FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE FUNCTION sw_private.export_report(_workspace_id uuid,_report_id uuid,_approval_id uuid,_request_id uuid) RETURNS public.sw_report_approvals
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.sw_report_approvals; e public.sw_report_exports;
BEGIN
 IF NOT sw_private.can_read(_workspace_id) THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.sw_workspaces WHERE id=_workspace_id FOR UPDATE;
 SELECT * INTO a FROM public.sw_report_approvals WHERE workspace_id=_workspace_id AND report_id=_report_id AND id=_approval_id;
 IF a.id IS NULL THEN RAISE EXCEPTION 'SW_APPROVAL_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sw_report_exports WHERE id=_request_id;
 IF FOUND THEN
  IF e.workspace_id<>_workspace_id OR e.report_id<>_report_id OR e.approval_id<>_approval_id OR e.exported_by<>auth.uid() THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
 ELSE INSERT INTO public.sw_report_exports(id,workspace_id,report_id,approval_id,exported_by) VALUES(_request_id,_workspace_id,_report_id,_approval_id,auth.uid()); END IF;
 RETURN a;
END $$;
CREATE FUNCTION public.sw_export_report(_workspace_id uuid,_report_id uuid,_approval_id uuid,_request_id uuid) RETURNS public.sw_report_approvals LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.export_report(_workspace_id,_report_id,_approval_id,_request_id)$$;

CREATE TABLE public.sw_ai_draft_applications (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),job_id uuid NOT NULL,assessment_id uuid NOT NULL,
 assessment_version_before integer NOT NULL,report_id uuid,risk_ids uuid[] NOT NULL DEFAULT '{}',action_ids uuid[] NOT NULL DEFAULT '{}',question_ids uuid[] NOT NULL DEFAULT '{}',
 applied_by uuid NOT NULL REFERENCES auth.users(id),applied_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,job_id),FOREIGN KEY(workspace_id,job_id) REFERENCES public.sw_processing_jobs(workspace_id,id),
 FOREIGN KEY(workspace_id,assessment_id) REFERENCES public.sw_assessments(workspace_id,id),FOREIGN KEY(workspace_id,report_id) REFERENCES public.sw_reports(workspace_id,id)
);
ALTER TABLE public.sw_ai_draft_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sw_ai_draft_applications FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sw_ai_draft_applications TO authenticated;
CREATE POLICY sw_application_read ON public.sw_ai_draft_applications FOR SELECT TO authenticated USING(sw_private.can_read(workspace_id));
CREATE TRIGGER sw_immutable BEFORE UPDATE OR DELETE ON public.sw_ai_draft_applications FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE FUNCTION sw_private.narrative_text(n jsonb,lang text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '['||CASE n->>'kind' WHEN 'source_fact' THEN CASE WHEN lang='sv' THEN 'Källuppgift' ELSE 'Source fact' END WHEN 'user_interpretation' THEN CASE WHEN lang='sv' THEN 'Användarbedömning' ELSE 'User interpretation' END WHEN 'assumption' THEN CASE WHEN lang='sv' THEN 'Antagande' ELSE 'Assumption' END ELSE CASE WHEN lang='sv' THEN 'AI-förslag' ELSE 'AI proposal' END END||'] '||coalesce(n->>'statement','')||CASE WHEN btrim(coalesce(n->>'uncertainty',''))<>'' THEN E'\n'||CASE WHEN lang='sv' THEN 'Osäkerhet: ' ELSE 'Uncertainty: ' END||(n->>'uncertainty') ELSE '' END
$$;
CREATE FUNCTION sw_private.apply_narrative_citations(w uuid,kind text,target uuid,n jsonb,manifest jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb; sid uuid; locator_value text;
BEGIN
 FOR c IN SELECT * FROM jsonb_array_elements(coalesce(n->'citations','[]')) LOOP
  sid:=(c->>'sourceItemId')::uuid;
  SELECT source->>'locator' INTO locator_value FROM jsonb_array_elements(manifest->'sources') source WHERE source->>'sourceItemId'=sid::text LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SW_AI_CITATION_OUTSIDE_MANIFEST' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sw_citations x WHERE x.workspace_id=w AND x.source_item_id=sid AND x.claim=n->>'statement' AND x.excerpt=c->>'quote' AND CASE kind WHEN 'assessment' THEN x.assessment_id=target WHEN 'risk' THEN x.risk_id=target ELSE x.report_id=target END) THEN
   INSERT INTO public.sw_citations(workspace_id,assessment_id,risk_id,report_id,source_item_id,claim,excerpt,locator)
   VALUES(w,CASE WHEN kind='assessment' THEN target END,CASE WHEN kind='risk' THEN target END,CASE WHEN kind='report' THEN target END,sid,n->>'statement',c->>'quote',coalesce(locator_value,''));
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION sw_private.apply_ai_draft(_workspace_id uuid,_job_id uuid,_expected_version integer,_request_id uuid) RETURNS public.sw_ai_draft_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt public.sw_ai_draft_applications; j public.sw_processing_jobs; a public.sw_assessments; lang text; n jsonb; risk jsonb; section jsonb; content text; sections jsonb:='{}'; rid uuid; tid uuid; qid uuid; report_uuid uuid; riskids uuid[]:='{}';actionids uuid[]:='{}';questionids uuid[]:='{}'; template_id text;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT language INTO lang FROM public.sw_workspaces WHERE id=_workspace_id FOR UPDATE;
 SELECT * INTO receipt FROM public.sw_ai_draft_applications WHERE id=_request_id OR (workspace_id=_workspace_id AND job_id=_job_id) ORDER BY id LIMIT 1;
 IF FOUND THEN
  IF receipt.workspace_id<>_workspace_id OR receipt.job_id<>_job_id OR receipt.assessment_version_before IS DISTINCT FROM _expected_version OR receipt.applied_by<>auth.uid() THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN receipt;
 END IF;
 SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND id=_job_id FOR UPDATE;
 SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=j.assessment_id FOR UPDATE;
 IF j.id IS NULL OR j.kind<>'ai' OR j.status<>'succeeded' OR j.expected_version IS DISTINCT FROM _expected_version OR a.version IS DISTINCT FROM _expected_version OR a.status NOT IN ('draft','in_review') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
 -- The assessment lock also serializes source review. Match the whole accepted
 -- set, not just the sources that happened to exist when this job was reserved.
 IF (SELECT count(*) FROM public.sw_analysis_inputs WHERE workspace_id=_workspace_id AND assessment_id=a.id AND review_status='accepted') <> jsonb_array_length(j.input_manifest->'sources') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(j.input_manifest->'sources') source WHERE NOT EXISTS(SELECT 1 FROM public.sw_analysis_inputs i WHERE i.workspace_id=_workspace_id AND i.assessment_id=a.id AND i.source_item_id=(source->>'sourceItemId')::uuid AND i.review_status='accepted' AND i.version=(source->>'reviewVersion')::integer)) OR j.input_manifest->'questions' IS DISTINCT FROM coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position,q.id) FROM public.sw_analysis_questions q WHERE q.workspace_id=_workspace_id AND q.assessment_id=a.id),'[]') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF j.output->>'schemaVersion'<>'sw-analysis-output-1.0.0' OR jsonb_typeof(j.output->'risks') IS DISTINCT FROM 'array' OR jsonb_array_length(j.output->'risks')>20 THEN RAISE EXCEPTION 'SW_AI_OUTPUT_INVALID' USING ERRCODE='23514'; END IF;
 UPDATE public.sw_assessments SET
  assumptions=concat_ws(E'\n\n',nullif(assumptions,''),(SELECT string_agg(sw_private.narrative_text(value,lang),E'\n\n') FROM jsonb_array_elements(j.output->'assumptions'))),
  proposed_measures=concat_ws(E'\n\n',nullif(proposed_measures,''),(SELECT string_agg(sw_private.narrative_text(value,lang),E'\n\n') FROM jsonb_array_elements(j.output->'proposals'))),
  uncertainty=concat_ws(E'\n\n',nullif(uncertainty,''),nullif('[AI] '||coalesce(j.output->>'uncertainty',''), '[AI] ')),
  conflicts=conflicts||coalesce(j.output->'contradictions','[]')
 WHERE workspace_id=_workspace_id AND id=a.id;
 FOR n IN SELECT value FROM jsonb_array_elements(coalesce(j.output->'facts','[]')||coalesce(j.output->'userInterpretations','[]')||coalesce(j.output->'assumptions','[]')||coalesce(j.output->'proposals','[]')) LOOP
  PERFORM sw_private.apply_narrative_citations(_workspace_id,'assessment',a.id,n,j.input_manifest);
 END LOOP;
 FOR risk IN SELECT * FROM jsonb_array_elements(j.output->'risks') LOOP
  INSERT INTO public.sw_risks(workspace_id,assessment_id,title,description,likelihood,consequence,uncertainty)
  VALUES(_workspace_id,a.id,risk->>'title',sw_private.narrative_text(risk->'description',lang),(risk->>'likelihood')::smallint,(risk->>'consequence')::smallint,sw_private.narrative_text(risk->'rationale',lang)) RETURNING id INTO rid;
  riskids:=array_append(riskids,rid);
  PERFORM sw_private.apply_narrative_citations(_workspace_id,'risk',rid,risk->'description',j.input_manifest);
  PERFORM sw_private.apply_narrative_citations(_workspace_id,'risk',rid,risk->'rationale',j.input_manifest);
  FOR n IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(risk->'currentControls')='array' THEN risk->'currentControls' ELSE '[]'::jsonb END) LOOP
   INSERT INTO public.sw_controls(workspace_id,risk_id,title,description) VALUES(_workspace_id,rid,left(n->>'statement',200),sw_private.narrative_text(n,lang));
   PERFORM sw_private.apply_narrative_citations(_workspace_id,'risk',rid,n,j.input_manifest);
  END LOOP;
  FOR n IN SELECT * FROM jsonb_array_elements(coalesce(risk->'proposedActions','[]')) LOOP
   INSERT INTO public.sw_actions(workspace_id,assessment_id,risk_id,title,description) VALUES(_workspace_id,a.id,rid,left(n->>'statement',200),sw_private.narrative_text(n,lang)) RETURNING id INTO tid;
   actionids:=array_append(actionids,tid);
  END LOOP;
 END LOOP;
 FOR n IN SELECT * FROM jsonb_array_elements(coalesce(j.output->'followups','[]')) LOOP
  INSERT INTO public.sw_analysis_questions(workspace_id,assessment_id,question,evidence_kind) VALUES(_workspace_id,a.id,n->>'statement','user_input') RETURNING id INTO qid;
  questionids:=array_append(questionids,qid);
 END LOOP;
 IF jsonb_typeof(j.output->'report')='object' THEN
  IF j.output->'report'->>'kind' IS DISTINCT FROM a.analysis_type THEN RAISE EXCEPTION 'SW_AI_REPORT_METHOD_MISMATCH' USING ERRCODE='23514'; END IF;
  SELECT id INTO template_id FROM public.sw_report_templates WHERE method_version_id=a.method_version_id ORDER BY id LIMIT 1;
  FOR section IN SELECT * FROM jsonb_array_elements(j.output->'report'->'sections') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.sw_report_templates t WHERE t.id=template_id AND section->>'key'=ANY(t.required_sections)) OR sections ? (section->>'key') THEN RAISE EXCEPTION 'SW_AI_REPORT_SECTION_INVALID' USING ERRCODE='23514'; END IF;
   SELECT string_agg(sw_private.narrative_text(value,lang),E'\n\n') INTO content FROM jsonb_array_elements(section->'content');
   content:=concat_ws(E'\n\n',content,CASE WHEN btrim(coalesce(section->>'missingInformation',''))<>'' THEN CASE WHEN lang='sv' THEN 'Saknat underlag: ' ELSE 'Missing information: ' END||(section->>'missingInformation') END);
   sections:=sections||jsonb_build_object(section->>'key',coalesce(content,''));
  END LOOP;
  INSERT INTO public.sw_reports(workspace_id,assessment_id,title,report_type,language,template_version_id,sections,
   executive_summary,overall_description,risk_assessment,identified_risks,security_arrangement,preparedness_incident_management,conclusion,contacts)
  VALUES(_workspace_id,a.id,a.title,CASE a.analysis_type WHEN 'rsa' THEN 'risk_report' WHEN 'monitoring' THEN 'briefing' ELSE 'security_assessment' END,lang,template_id,sections,
   coalesce(sections->>'executive_summary',''),coalesce(sections->>'overall_description',''),coalesce(sections->>'risk_assessment',''),coalesce(sections->>'identified_risks',''),coalesce(sections->>'security_arrangement',''),coalesce(sections->>'preparedness_incident_management',''),coalesce(sections->>'conclusion',''),coalesce(sections->>'contacts','')) RETURNING id INTO report_uuid;
  FOR section IN SELECT * FROM jsonb_array_elements(j.output->'report'->'sections') LOOP
   FOR n IN SELECT * FROM jsonb_array_elements(section->'content') LOOP PERFORM sw_private.apply_narrative_citations(_workspace_id,'report',report_uuid,n,j.input_manifest); END LOOP;
  END LOOP;
 END IF;
 INSERT INTO public.sw_ai_draft_applications(id,workspace_id,job_id,assessment_id,assessment_version_before,report_id,risk_ids,action_ids,question_ids,applied_by)
 VALUES(_request_id,_workspace_id,j.id,a.id,_expected_version,report_uuid,riskids,actionids,questionids,auth.uid()) RETURNING * INTO receipt;
 RETURN receipt;
END $$;
CREATE FUNCTION public.sw_apply_ai_draft(_workspace_id uuid,_job_id uuid,_expected_version integer,_request_id uuid) RETURNS public.sw_ai_draft_applications LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT sw_private.apply_ai_draft(_workspace_id,_job_id,_expected_version,_request_id)$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sw_private FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION sw_private.is_human(),sw_private.can_read(uuid),sw_private.can_edit(uuid),sw_private.can_approve(uuid),sw_private.create_personal_workspace(text),sw_private.export_report(uuid,uuid,uuid,uuid),sw_private.apply_ai_draft(uuid,uuid,integer,uuid),sw_private.hash_text(text),sw_private.rsa_calibrated(jsonb,text),sw_private.report_bundle(uuid,uuid),sw_private.approve_report(uuid,uuid,integer,text),sw_private.revise(uuid,uuid,integer,uuid,text),sw_private.reserve_document(uuid,uuid,text,text,bigint,text),sw_private.reserve_processing(uuid,uuid,text,uuid,uuid,integer,uuid),sw_private.dispatch_processing(uuid,uuid),sw_private.complete_processing(uuid,uuid,uuid,text,text,text) TO authenticated;
DO $grants$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sw_apply_ai_draft','sw_export_report','sw_preview_report','sw_approve_report','sw_revise_analysis','sw_revise_report','sw_reserve_document','sw_reserve_processing','sw_dispatch_processing','sw_complete_processing') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);
 END LOOP;
END $grants$;
COMMENT ON TABLE sw_private.worker_keys IS 'Out-of-band server/DB HMAC provisioning only. No seed credential. Never exposed to Data API or generic service_role.';
COMMENT ON TABLE public.sw_ai_activations IS 'Immutable domain-specific owner/data-processing approval. Empty means disabled; no inherited interview activation.';
COMMENT ON TABLE public.sw_processing_jobs IS 'One dispatch fence per request. Ambiguous provider outcome is terminal and retains budget; no automatic replay or claim lease stealing.';
COMMIT;
