-- Expand only. No data deletion, date backfill, scheduler or production activation.
-- Archive is presentation state, independent of advertisement/completion status.
CREATE SCHEMA IF NOT EXISTS recruitment_erasure;
REVOKE ALL ON SCHEMA recruitment_erasure FROM PUBLIC, anon, authenticated;
ALTER TABLE public.job_applications ADD COLUMN employer_archived_at timestamptz;
GRANT SELECT(employer_archived_at) ON public.job_applications TO authenticated;
ALTER TABLE public.recruitment_settings ADD COLUMN archived_at timestamptz;
ALTER TABLE public.employers ADD COLUMN recruitment_retention_months integer NOT NULL DEFAULT 24
  CHECK (recruitment_retention_months IN (6,24));
CREATE TABLE public.recruitment_erasure_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employer_id uuid NOT NULL,
  job_id uuid NOT NULL, application_ids uuid[] NOT NULL, reason text NOT NULL,
  scope_application_id uuid, confirmation_fingerprint text,
  requested_by uuid, requested_at timestamptz NOT NULL DEFAULT now(),
  rows_deleted_at timestamptz, completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, last_error text, lease_until timestamptz,
  lease_token uuid, next_attempt_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recruitment_erasure_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_erasure_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT(id,employer_id,job_id,application_ids,reason,requested_by,requested_at,rows_deleted_at,completed_at,attempts,last_error,next_attempt_at)
 ON public.recruitment_erasure_jobs TO authenticated;
GRANT ALL ON public.recruitment_erasure_jobs TO service_role;
CREATE POLICY recruitment_erasure_jobs_read ON public.recruitment_erasure_jobs
  FOR SELECT TO authenticated USING (public.rec_is_member(employer_id));
CREATE INDEX recruitment_erasure_pending ON public.recruitment_erasure_jobs(next_attempt_at)
 WHERE completed_at IS NULL;
ALTER TABLE public.storage_erasure_queue ADD COLUMN recruitment_erasure_job_id uuid
 REFERENCES public.recruitment_erasure_jobs(id);
CREATE TABLE recruitment_erasure.activation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO recruitment_erasure.activation DEFAULT VALUES;
REVOKE ALL ON ALL TABLES IN SCHEMA recruitment_erasure FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION recruitment_erasure.allowed_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
SELECT ARRAY['job_applications','job_application_status_events','assessment_assignments','scp_attempts','scp_candidate_responses','scp_item_exposure','scp_integrity_flags','scp_ai_scoring_runs','scp_ai_scoring_dimensions','scp_human_reviews','scp_report_snapshots','sp_disclosures','sp_disclosure_accesses','scp_employer_report_decisions','scp_review_rubric_scores','scp_interview_notes','scp_assessment_invitations','scp_report_computation_manifests','scp_interview_cases','scp_interview_case_sources','scp_interview_source_passages','scp_interview_ai_runs','scp_interview_role_requirements','scp_interview_candidate_facts','scp_interview_prep_plans','scp_interview_prep_items','scp_interview_sessions','scp_interview_session_questions','scp_interview_session_notes','scp_interview_probe_usages','scp_interview_evidence_proposals','scp_interview_evidence','scp_interview_findings','scp_interview_assessments','scp_interview_reports','scp_interview_case_events','scp_interview_ai_run_retrievals','scp_interview_candidate_corrections','scp_interview_panels','scp_interview_panel_members','sp_disclosure_items','sp_share_handoffs','sp_share_sessions','bcp_assignments','bcp_notice_acknowledgements','bcp_responses','bcp_answers','bcp_events','bcp_case_links','bcp_case_topics','bcp_conduct_sessions','bcp_conduct_positions','bcp_conduct_entries','bcp_conduct_verifications','bcp_conduct_panels','bcp_conduct_panel_resolutions','bcp_conduct_reports','sp_credential_disclosure_policy','sp_credential_share_events','bcp_invitations','bcp_candidate_supplements','bcp_conduct_stances','bcp_conduct_actions','scp_recruitment_setups','scp_assessment_setups','scp_interview_starts','job_application_answers','recruitment_application_meta','recruitment_comments','recruitment_interview_bookings','recruitment_messages','recruitment_employer_notices','sentinel_sessions']::text[] $$;

-- Graph closure follows only reviewed application-owned dependencies; never
-- follows references UP to users, subjects, credentials, own runs or content.
CREATE FUNCTION recruitment_erasure.plan(_ids uuid[], _employer uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _plan jsonb := jsonb_build_object('job_applications',to_jsonb(_ids));
 _edge record; _rows jsonb; _before jsonb; _pk text; _pass integer; _foreign boolean;
BEGIN
 FOR _pass IN 1..100 LOOP
  _before := _plan;
  FOR _edge IN
   SELECT c.conrelid::regclass child, cl.relname child_name, par.relname parent_name,
          a.attname child_col, b.attname parent_col
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid
    JOIN pg_class par ON par.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=cl.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1]
   WHERE c.contype='f' AND n.nspname='public' AND cardinality(c.conkey)=1
     AND cl.relname=ANY(recruitment_erasure.allowed_tables()) AND _plan ? par.relname
  LOOP
   SELECT a.attname INTO _pk FROM pg_constraint c JOIN pg_attribute a
    ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='p' AND c.conrelid=_edge.child;
   IF _pk IS NULL THEN RAISE EXCEPTION 'RETENTION_UNMAPPED_PRIMARY_KEY'; END IF;
   EXECUTE format('SELECT coalesce(jsonb_agg(DISTINCT ch.%I ORDER BY ch.%I), ''[]''::jsonb) FROM %s ch
     JOIN public.%I pa ON ch.%I=pa.%I WHERE pa.%I::text IN
     (SELECT jsonb_array_elements_text($1))', _pk,_pk,_edge.child,_edge.parent_name,
      _edge.child_col,_edge.parent_col,
      (SELECT a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid
        AND a.attnum=c.conkey[1] WHERE c.contype='p' AND c.conrelid=('public.'||_edge.parent_name)::regclass))
    INTO _rows USING _plan->_edge.parent_name;
   SELECT coalesce(jsonb_agg(DISTINCT v ORDER BY v),'[]'::jsonb) INTO _rows
    FROM jsonb_array_elements(coalesce(_plan->_edge.child_name,'[]')||_rows) v;
   IF _rows <> '[]'::jsonb THEN _plan := jsonb_set(_plan,ARRAY[_edge.child_name],_rows); END IF;
  END LOOP;
  EXIT WHEN _before=_plan;
 END LOOP;
 IF _pass=100 THEN RAISE EXCEPTION 'RETENTION_GRAPH_TOO_DEEP'; END IF;
 -- A graph crossing an organisation/application boundary is shared material.
 -- Refuse, visibly, rather than delete another case or silently call it erased.
 FOR _edge IN SELECT key tab,value ids FROM jsonb_each(_plan) LOOP
  SELECT a.attname INTO _pk FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid
   AND a.attnum=c.conkey[1] WHERE c.contype='p' AND c.conrelid=('public.'||_edge.tab)::regclass;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE r.%I::text IN
   (SELECT jsonb_array_elements_text($1)) AND
   ((to_jsonb(r) ? ''employer_id'' AND to_jsonb(r)->>''employer_id'' IS DISTINCT FROM $2)
    OR (to_jsonb(r)->>''issuer_organization_id'' IS NOT NULL AND to_jsonb(r)->>''issuer_organization_id'' IS DISTINCT FROM $2)
    OR (to_jsonb(r)->>''use_case'' = ''workforce'')
    OR (to_jsonb(r)->>''case_id'' IS NOT NULL AND to_jsonb(r)->>''case_id'' NOT IN (SELECT jsonb_array_elements_text(coalesce($4->''scp_interview_cases'',''[]''))))
    OR (to_jsonb(r)->>''interview_case_id'' IS NOT NULL AND to_jsonb(r)->>''interview_case_id'' NOT IN (SELECT jsonb_array_elements_text(coalesce($4->''scp_interview_cases'',''[]''))))
    OR (to_jsonb(r)->>''application_id'' IS NOT NULL AND to_jsonb(r)->>''application_id'' NOT IN
     (SELECT jsonb_array_elements_text($3)))))',_edge.tab,_pk)
   INTO _foreign USING _edge.ids,_employer::text,to_jsonb(_ids),_plan;
  IF _foreign THEN RAISE EXCEPTION 'RETENTION_SHARED_MATERIAL_REQUIRES_HANDLING'; END IF;
 END LOOP;
 RETURN _plan;
END $$;
REVOKE ALL ON FUNCTION recruitment_erasure.plan(uuid[],uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rec_retention_scope(_job_id uuid, _application_id uuid DEFAULT NULL)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _emp uuid; _ids uuid[];
BEGIN
 SELECT employer_id INTO _emp FROM public.jobs WHERE id=_job_id FOR UPDATE;
 IF _emp IS NULL OR NOT public.rec_is_member(_emp) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND'; END IF;
 IF NOT public.rec_can_manage(_job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recruitment_settings WHERE job_id=_job_id
   AND completion_state IN ('completed','cancelled') AND completed_at IS NOT NULL)
   OR EXISTS(SELECT 1 FROM public.job_applications WHERE job_id=_job_id
      AND status IN ('submitted','reviewing','interview'))
   OR EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id
       AND public.job_is_active(status,published_at,deadline_at,expires_at))
 THEN RAISE EXCEPTION 'RETENTION_RECRUITMENT_NOT_COMPLETED'; END IF;
 SELECT array_agg(id ORDER BY id) INTO _ids FROM public.job_applications
  WHERE job_id=_job_id AND (_application_id IS NULL OR id=_application_id);
 IF _application_id IS NOT NULL AND _ids IS NULL THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND'; END IF;
 RETURN coalesce(_ids,'{}');
END $$;
REVOKE ALL ON FUNCTION public.rec_retention_scope(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rec_archive_material(_job_id uuid,_application_id uuid,_archive boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _emp uuid;
BEGIN
 SELECT employer_id INTO _emp FROM public.jobs WHERE id=_job_id FOR UPDATE;
 IF _emp IS NULL OR NOT public.rec_is_member(_emp) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND'; END IF;
 IF NOT public.rec_can_manage(_job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'; END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_erasure_jobs WHERE job_id=_job_id AND completed_at IS NULL)
 THEN RAISE EXCEPTION 'RETENTION_ERASURE_PENDING'; END IF;
 IF _application_id IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.recruitment_settings WHERE job_id=_job_id AND completion_state<>'open')
   THEN RAISE EXCEPTION 'RETENTION_RECRUITMENT_NOT_COMPLETED'; END IF;
  UPDATE public.recruitment_settings SET archived_at=CASE WHEN _archive THEN coalesce(archived_at,now()) END
   WHERE job_id=_job_id;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.job_applications WHERE id=_application_id AND job_id=_job_id
    AND status IN ('hired','rejected','withdrawn')) THEN RAISE EXCEPTION 'APPLICATION_NOT_CLOSED'; END IF;
  UPDATE public.job_applications SET employer_archived_at=CASE WHEN _archive THEN coalesce(employer_archived_at,now()) END
   WHERE id=_application_id AND job_id=_job_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.rec_archive_material(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_archive_material(uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION public.rec_set_retention(_employer_id uuid,_months integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.rec_is_member(_employer_id) OR NOT public.has_employer_role(auth.uid(),_employer_id,ARRAY['owner','admin'])
 THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'; END IF;
 IF _months NOT IN (6,24) OR _months IS NULL THEN RAISE EXCEPTION 'RETENTION_PERIOD_INVALID'; END IF;
 UPDATE public.employers SET recruitment_retention_months=_months WHERE id=_employer_id;
END $$;
REVOKE ALL ON FUNCTION public.rec_set_retention(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_set_retention(uuid,integer) TO authenticated;

CREATE FUNCTION public.rec_retention_overview(_employer_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.rec_is_member(_employer_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND'; END IF;
 RETURN jsonb_build_object('canSetRetention',public.has_employer_role(auth.uid(),_employer_id,ARRAY['owner','admin']),'months',(SELECT recruitment_retention_months FROM public.employers WHERE id=_employer_id),
 'jobs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'archivedAt',s.archived_at,
 'completedAt',s.completed_at,'state',coalesce(s.completion_state,'open'),
 'canManage',public.rec_can_manage(j.id),
 'missingDate',s.completed_at IS NULL AND (j.status='archived' OR s.completion_state<>'open'),
 'purgeAt',CASE WHEN s.completion_state<>'open' AND s.completed_at IS NOT NULL
  THEN s.completed_at + make_interval(months=>e.recruitment_retention_months) END))
 FROM public.jobs j JOIN public.employers e ON e.id=j.employer_id LEFT JOIN public.recruitment_settings s ON s.job_id=j.id
 WHERE j.employer_id=_employer_id),'[]'::jsonb),
 'applications',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'jobId',a.job_id,'archivedAt',a.employer_archived_at,
 'recruitmentArchivedAt',s.archived_at,'status',a.status)) FROM public.job_applications a
 LEFT JOIN public.recruitment_settings s ON s.job_id=a.job_id WHERE a.employer_id=_employer_id),'[]'::jsonb),
 'erasures',coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'jobId',q.job_id,
 'applicationIds',q.application_ids,'completedAt',q.completed_at,'rowsDeletedAt',q.rows_deleted_at,
 'attempts',q.attempts,'error',q.last_error,'pendingFiles',(SELECT count(*) FROM public.storage_erasure_queue f
 WHERE f.recruitment_erasure_job_id=q.id AND f.completed_at IS NULL))) FROM public.recruitment_erasure_jobs q
 WHERE q.employer_id=_employer_id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.rec_retention_overview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_retention_overview(uuid) TO authenticated;

CREATE FUNCTION public.rec_preview_erasure(_job_id uuid,_application_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _ids uuid[]; _emp uuid; _plan jsonb; _counts jsonb:='{}'; _paths text[]; _shared_paths text[]; _t record; _pk text; _n bigint;
BEGIN
 _ids:=public.rec_retention_scope(_job_id,_application_id);
 SELECT employer_id INTO _emp FROM public.jobs WHERE id=_job_id;
 _plan:=recruitment_erasure.plan(_ids,_emp);
 FOR _t IN SELECT key tab,value ids FROM jsonb_each(_plan) LOOP
  SELECT a.attname INTO _pk FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='p' AND c.conrelid=('public.'||_t.tab)::regclass;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text IN (SELECT jsonb_array_elements_text($1))',_t.tab,_pk)
   INTO _n USING _t.ids;
  _counts:=_counts||jsonb_build_object(_t.tab,_n);
 END LOOP;
 SELECT array_agg(DISTINCT cv_storage_path ORDER BY cv_storage_path) INTO _paths FROM public.job_applications WHERE id=ANY(_ids) AND cv_storage_path IS NOT NULL;
 SELECT array_agg(DISTINCT cv_storage_path ORDER BY cv_storage_path) INTO _shared_paths
  FROM public.job_applications WHERE NOT id=ANY(_ids) AND cv_storage_path=ANY(_paths);
 RETURN jsonb_build_object('applications',cardinality(_ids),'counts',coalesce(_counts,'{}'),
  'files',coalesce(cardinality(_paths),0),'sharedFiles',coalesce(cardinality(_shared_paths),0),
  'fingerprint',md5(_plan::text||_counts::text||coalesce(to_jsonb(_paths)::text,'')||coalesce(to_jsonb(_shared_paths)::text,'')));
END $$;
REVOKE ALL ON FUNCTION public.rec_preview_erasure(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_preview_erasure(uuid,uuid) TO authenticated;

CREATE FUNCTION public.rec_request_erasure(_job_id uuid,_application_id uuid,_fingerprint text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _preview jsonb; _ids uuid[]; _id uuid; _emp uuid;
BEGIN
 SELECT employer_id INTO _emp FROM public.jobs WHERE id=_job_id FOR UPDATE;
 IF _emp IS NULL OR NOT public.rec_is_member(_emp) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND'; END IF;
 IF NOT public.rec_can_manage(_job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'; END IF;
 SELECT id INTO _id FROM public.recruitment_erasure_jobs WHERE job_id=_job_id
  AND scope_application_id IS NOT DISTINCT FROM _application_id AND confirmation_fingerprint=_fingerprint ORDER BY requested_at LIMIT 1;
 IF _id IS NOT NULL THEN RETURN _id; END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_erasure_jobs WHERE job_id=_job_id AND completed_at IS NULL)
  THEN RAISE EXCEPTION 'RETENTION_ERASURE_PENDING'; END IF;
 _preview:=public.rec_preview_erasure(_job_id,_application_id);
 IF _fingerprint IS DISTINCT FROM _preview->>'fingerprint' THEN RAISE EXCEPTION 'RETENTION_PREVIEW_CHANGED'; END IF;
 _ids:=public.rec_retention_scope(_job_id,_application_id);
 SELECT employer_id INTO _emp FROM public.jobs WHERE id=_job_id;
 SELECT id INTO _id FROM public.recruitment_erasure_jobs WHERE job_id=_job_id AND application_ids=_ids AND completed_at IS NULL;
 IF _id IS NOT NULL THEN RETURN _id; END IF;
 INSERT INTO public.recruitment_erasure_jobs(employer_id,job_id,application_ids,reason,requested_by,scope_application_id,confirmation_fingerprint)
 VALUES(_emp,_job_id,_ids,'employer_request',auth.uid(),_application_id,_fingerprint) RETURNING id INTO _id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.rec_request_erasure(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_request_erasure(uuid,uuid,text) TO authenticated;

-- The old, unscheduled 12-month/updated_at sweep must never be used again.
CREATE OR REPLACE FUNCTION public.sweep_application_retention() RETURNS TABLE(application_id uuid,cv_storage_path text)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'RETENTION_LEGACY_SWEEP_DISABLED'; END $$;
REVOKE ALL ON FUNCTION public.sweep_application_retention() FROM PUBLIC,anon,authenticated,service_role;

-- Prevent reopening/status changes/late child writes while erasure is owed.
CREATE FUNCTION recruitment_erasure.guard_pending() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE _job uuid; _app uuid; _case uuid; _session uuid; _assignment uuid; _attempt uuid;
BEGIN
 -- Serialize path ownership with queue creation. A second application may
 -- never acquire a CV path while its physical erasure is pending.
 IF TG_TABLE_NAME='job_applications' AND (to_jsonb(NEW)->>'cv_storage_path') IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('recruitment-cv:'||(to_jsonb(NEW)->>'cv_storage_path'),0));
  IF EXISTS(SELECT 1 FROM public.storage_erasure_queue WHERE bucket_id='job-application-cvs'
   AND object_path=(to_jsonb(NEW)->>'cv_storage_path') AND recruitment_erasure_job_id IS NOT NULL)
  THEN RAISE EXCEPTION 'RETENTION_FILE_ERASURE_PENDING'; END IF;
 END IF;
 IF TG_TABLE_NAME='jobs' THEN _job:=NEW.id;
 ELSE _job:=(to_jsonb(NEW)->>'job_id')::uuid; END IF;
 _app:=(to_jsonb(NEW)->>'application_id')::uuid;
 IF TG_TABLE_NAME='job_applications' THEN _app:=NEW.id; END IF;
 IF _job IS NULL AND _app IS NOT NULL THEN SELECT job_id INTO _job FROM public.job_applications WHERE id=_app; END IF;
 IF _job IS NULL THEN
  _case:=(to_jsonb(NEW)->>'case_id')::uuid;
  _session:=(to_jsonb(NEW)->>'session_id')::uuid;
  IF _case IS NULL AND _session IS NOT NULL THEN
   SELECT case_id INTO _case FROM public.scp_interview_sessions WHERE id=_session;
   IF _case IS NULL THEN SELECT case_id INTO _case FROM public.bcp_conduct_sessions WHERE id=_session; END IF;
  END IF;
  IF _case IS NOT NULL THEN SELECT job_id INTO _job FROM public.scp_interview_cases WHERE id=_case; END IF;
  _assignment:=(to_jsonb(NEW)->>'assignment_id')::uuid;
  _attempt:=(to_jsonb(NEW)->>'attempt_id')::uuid;
  IF _assignment IS NULL AND _attempt IS NOT NULL THEN SELECT assignment_id INTO _assignment FROM public.scp_attempts WHERE id=_attempt; END IF;
  IF _job IS NULL AND _assignment IS NOT NULL THEN
   SELECT job_id INTO _job FROM public.assessment_assignments WHERE id=_assignment;
   IF _job IS NULL THEN SELECT job_id INTO _job FROM public.bcp_assignments WHERE id=_assignment; END IF;
  END IF;
 END IF;
 -- Serialize child writes with confirmation and row erasure, including
 -- requests whose debt is not yet visible because its transaction is open.
 PERFORM 1 FROM public.jobs WHERE id=_job FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.recruitment_erasure_jobs WHERE job_id=_job AND completed_at IS NULL)
 THEN RAISE EXCEPTION 'RETENTION_ERASURE_PENDING'; END IF;
 IF TG_TABLE_NAME='recruitment_settings' AND to_jsonb(NEW)->>'completion_state'='open'
  AND to_jsonb(OLD)->>'completion_state'<>'open' THEN NEW.archived_at:=NULL; END IF;
 RETURN NEW;
END $$;
-- Security definer needed only for reading the private job debt under RLS.
ALTER FUNCTION recruitment_erasure.guard_pending() SECURITY DEFINER;
CREATE TRIGGER retention_pending_guard BEFORE UPDATE ON public.recruitment_settings
 FOR EACH ROW EXECUTE FUNCTION recruitment_erasure.guard_pending();
CREATE TRIGGER retention_pending_guard BEFORE INSERT OR UPDATE ON public.job_applications
 FOR EACH ROW EXECUTE FUNCTION recruitment_erasure.guard_pending();
CREATE TRIGGER retention_pending_guard BEFORE UPDATE ON public.jobs
 FOR EACH ROW EXECUTE FUNCTION recruitment_erasure.guard_pending();

-- Freeze application-owned writes after a confirmed request, so notes and
-- communications cannot add material behind its confirmed scope.
DO $$ DECLARE _t record;
BEGIN
 FOR _t IN SELECT DISTINCT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relname=ANY(recruitment_erasure.allowed_tables())
 AND c.relname<>'job_applications' AND a.attname IN ('job_id','application_id','case_id','session_id','assignment_id','attempt_id')
 LOOP
  EXECUTE format('CREATE TRIGGER retention_pending_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION recruitment_erasure.guard_pending()',_t.relname);
 END LOOP;
END $$;

-- Bidirectional report/invitation links stay enforced at transaction end.
-- RESTRICT is immediate even when DEFERRABLE, so it cannot support atomic
-- erasure of both ends. NO ACTION changes no committed-data invariant.
ALTER TABLE public.scp_report_computation_manifests DROP CONSTRAINT scp_manifest_participant_snapshot_fkey,
 DROP CONSTRAINT scp_manifest_employer_snapshot_fkey;
ALTER TABLE public.scp_report_computation_manifests ADD CONSTRAINT scp_manifest_participant_snapshot_fkey
 FOREIGN KEY(participant_snapshot_id) REFERENCES public.scp_report_snapshots(id) DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT scp_manifest_employer_snapshot_fkey FOREIGN KEY(employer_snapshot_id)
 REFERENCES public.scp_report_snapshots(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.bcp_invitations DROP CONSTRAINT bcp_invitations_assignment_id_fkey;
ALTER TABLE public.bcp_invitations ADD CONSTRAINT bcp_invitations_assignment_id_fkey
 FOREIGN KEY(assignment_id) REFERENCES public.bcp_assignments(id) DEFERRABLE INITIALLY DEFERRED;
-- A row-level erasure capability, private and impossible to grant via a GUC.
-- Append-only guards release DELETE only for rows in this exact worker manifest.
CREATE TABLE recruitment_erasure.row_capability (
 tx bigint NOT NULL, table_oid oid NOT NULL, pk text NOT NULL, ids uuid[] NOT NULL,
 PRIMARY KEY(tx,table_oid)
);
REVOKE ALL ON recruitment_erasure.row_capability FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION recruitment_erasure.releases(_table oid,_row jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM recruitment_erasure.row_capability c WHERE c.tx=txid_current()
 AND c.table_oid=_table AND (_row->>c.pk)::uuid=ANY(c.ids)) $$;
REVOKE ALL ON FUNCTION recruitment_erasure.releases(oid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve all normal immutability rules. Add an exact-row DELETE exception
-- to reviewed runtime triggers (not content/Passport/account triggers).
DO $$ DECLARE _f record; _def text;
BEGIN
 FOR _f IN SELECT DISTINCT p.oid FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
 JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(recruitment_erasure.allowed_tables())
 AND NOT t.tgisinternal AND (t.tgtype & 8)>0
 LOOP
  _def:=pg_get_functiondef(_f.oid);
  IF _def NOT LIKE '%LANGUAGE plpgsql%' THEN RAISE EXCEPTION 'RETENTION_UNMAPPED_TRIGGER'; END IF;
  _def:=regexp_replace(_def,'(?i)\mBEGIN\M',
   'BEGIN
 IF TG_OP = ''DELETE'' AND recruitment_erasure.releases(TG_RELID,to_jsonb(OLD)) THEN RETURN OLD; END IF;', '');
  EXECUTE _def;
 END LOOP;
END $$;

CREATE FUNCTION public.rec_claim_erasure() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _q public.recruitment_erasure_jobs%ROWTYPE;
BEGIN
 SELECT * INTO _q FROM public.recruitment_erasure_jobs WHERE completed_at IS NULL
 AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now())
 ORDER BY next_attempt_at,requested_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.recruitment_erasure_jobs SET lease_until=now()+interval '10 minutes',
 lease_token=gen_random_uuid(), attempts=attempts+1 WHERE id=_q.id RETURNING * INTO _q;
 RETURN to_jsonb(_q);
END $$;
REVOKE ALL ON FUNCTION public.rec_claim_erasure() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rec_claim_erasure() TO service_role;

CREATE FUNCTION public.rec_erase_rows(_id uuid,_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _q public.recruitment_erasure_jobs%ROWTYPE; _plan jsonb; _t record; _pk text;
 _remaining jsonb; _before jsonb; _deleted integer; _pass integer; _edge record; _outside boolean; _blocked boolean;
BEGIN
 SELECT * INTO _q FROM public.recruitment_erasure_jobs WHERE id=_id AND lease_token=_token
 AND lease_until>now() AND completed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RETENTION_LEASE_LOST'; END IF;
 IF _q.rows_deleted_at IS NOT NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.jobs WHERE id=_q.job_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.recruitment_settings WHERE job_id=_q.job_id
 AND completion_state<>'open' AND completed_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.job_applications WHERE job_id=_q.job_id AND status IN ('submitted','reviewing','interview'))
 OR EXISTS(SELECT 1 FROM public.jobs WHERE id=_q.job_id AND public.job_is_active(status,published_at,deadline_at,expires_at))
 THEN RAISE EXCEPTION 'RETENTION_RECRUITMENT_NOT_COMPLETED'; END IF;
 IF _q.reason='automatic_retention' AND NOT EXISTS(SELECT 1 FROM public.recruitment_settings s JOIN public.employers e ON e.id=s.employer_id
  WHERE s.job_id=_q.job_id AND s.completed_at+make_interval(months=>e.recruitment_retention_months)<=now())
  THEN RAISE EXCEPTION 'RETENTION_PERIOD_NOT_DUE'; END IF;
 IF EXISTS(SELECT 1 FROM public.job_applications WHERE id=ANY(_q.application_ids) AND job_id<>_q.job_id) THEN RAISE EXCEPTION 'RETENTION_SCOPE_CHANGED'; END IF;
 _plan:=recruitment_erasure.plan(_q.application_ids,_q.employer_id);
 -- Check even CASCADE dependencies; unknown cascades must never silently erase
 -- new tables. Known employee/training references may only be detached by FK.
 FOR _t IN SELECT key tab,value ids FROM jsonb_each(_plan) LOOP
  SELECT a.attname INTO _pk FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid
  AND a.attnum=c.conkey[1] WHERE c.contype='p' AND c.conrelid=('public.'||_t.tab)::regclass;
  INSERT INTO recruitment_erasure.row_capability VALUES(txid_current(),('public.'||_t.tab)::regclass,_pk,
   ARRAY(SELECT jsonb_array_elements_text(_t.ids)::uuid));
  FOR _edge IN SELECT c.*,cl.relname child,a.attname col FROM pg_constraint c
   JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='f' AND c.confrelid=('public.'||_t.tab)::regclass
  LOOP
   IF NOT _plan ? _edge.child AND NOT (_edge.child='employees' AND _edge.confdeltype='n') THEN
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I::text IN (SELECT jsonb_array_elements_text($1)))',
     _edge.conrelid::regclass,_edge.col) INTO _outside USING _t.ids;
    IF _outside THEN RAISE EXCEPTION 'RETENTION_UNMAPPED_OR_SHARED_DEPENDENCY: %',_edge.child; END IF;
   END IF;
  END LOOP;
 END LOOP;
 -- Same ordered path locks as application inserts/updates, held through
 -- shared-reference checking and queue commit, prevent late shared-file races.
 FOR _t IN SELECT DISTINCT cv_storage_path path FROM public.job_applications
  WHERE id=ANY(_q.application_ids) AND cv_storage_path IS NOT NULL ORDER BY cv_storage_path
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('recruitment-cv:'||_t.path,0));
 END LOOP;
 -- Queue unique application CV paths only after checking all other applications.
 -- A shared file stays with its remaining owner. No path-prefix deletion.
 INSERT INTO public.storage_erasure_queue(bucket_id,object_path,reason,requested_by,recruitment_erasure_job_id)
 SELECT DISTINCT 'job-application-cvs',a.cv_storage_path,'recruitment_material_deleted',_q.requested_by,_id
 FROM public.job_applications a WHERE a.id=ANY(_q.application_ids) AND a.cv_storage_path IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.job_applications other WHERE other.cv_storage_path=a.cv_storage_path
  AND NOT other.id=ANY(_q.application_ids));
 _remaining:=_plan;
 FOR _pass IN 1..100 LOOP
  _before:=_remaining;
  FOR _t IN SELECT key tab,value ids FROM jsonb_each(_remaining) LOOP
   SELECT pk INTO _pk FROM recruitment_erasure.row_capability WHERE tx=txid_current() AND table_oid=('public.'||_t.tab)::regclass;
   -- Remove children before their parents, including SET NULL dependencies;
   -- otherwise FK updates could mutate a frozen child before its deletion.
   _blocked:=false;
   FOR _edge IN SELECT c.*,a.attname col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid=('public.'||_t.tab)::regclass AND c.conrelid<>c.confrelid
    AND NOT (c.confdeltype='a' AND c.condeferrable)
    AND _remaining ? (SELECT relname FROM pg_class WHERE oid=c.conrelid)
   LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I::text IN (SELECT jsonb_array_elements_text($1)))',_edge.conrelid::regclass,_edge.col)
     INTO _outside USING _t.ids;
    IF _outside THEN _blocked:=true; EXIT; END IF;
   END LOOP;
   IF _blocked THEN CONTINUE; END IF;
   BEGIN
    EXECUTE format('DELETE FROM public.%I WHERE %I::text IN (SELECT jsonb_array_elements_text($1))',_t.tab,_pk) USING _t.ids;
    _remaining:=_remaining-_t.tab;
   EXCEPTION WHEN foreign_key_violation THEN NULL;
   END;
  END LOOP;
  EXIT WHEN _remaining='{}'::jsonb;
  IF _before=_remaining THEN RAISE EXCEPTION 'RETENTION_DEPENDENCY_BLOCKED'; END IF;
 END LOOP;
 IF _remaining<>'{}'::jsonb THEN RAISE EXCEPTION 'RETENTION_DEPENDENCY_BLOCKED'; END IF;
 DELETE FROM recruitment_erasure.row_capability WHERE tx=txid_current();
 UPDATE public.recruitment_erasure_jobs SET rows_deleted_at=now(),last_error=NULL WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.rec_erase_rows(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rec_erase_rows(uuid,uuid) TO service_role;

CREATE FUNCTION public.rec_settle_erasure(_id uuid,_token uuid,_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _done boolean;
BEGIN
 SELECT rows_deleted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.storage_erasure_queue
 WHERE recruitment_erasure_job_id=_id AND completed_at IS NULL) AND _error IS NULL INTO _done
 FROM public.recruitment_erasure_jobs WHERE id=_id AND lease_token=_token AND completed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RETENTION_LEASE_LOST'; END IF;
 UPDATE public.recruitment_erasure_jobs SET completed_at=CASE WHEN _done THEN now() END,
 last_error=CASE WHEN _done THEN NULL ELSE left(coalesce(_error,'RETENTION_FILES_PENDING'),2000) END,
 lease_until=NULL,lease_token=NULL,next_attempt_at=now()+interval '15 minutes' WHERE id=_id;
 RETURN coalesce(_done,false);
END $$;
REVOKE ALL ON FUNCTION public.rec_settle_erasure(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rec_settle_erasure(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.rec_enqueue_due_retention(_limit integer DEFAULT 50) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _s record; _ids uuid[]; _n integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM recruitment_erasure.activation WHERE enabled) THEN RETURN 0; END IF;
 FOR _s IN SELECT s.* FROM public.recruitment_settings s JOIN public.employers e ON e.id=s.employer_id
 WHERE s.completion_state<>'open' AND s.completed_at IS NOT NULL
 AND s.completed_at+make_interval(months=>e.recruitment_retention_months)<=now()
 AND NOT EXISTS(SELECT 1 FROM public.recruitment_erasure_jobs q WHERE q.job_id=s.job_id AND q.completed_at IS NULL)
 AND EXISTS(SELECT 1 FROM public.job_applications a WHERE a.job_id=s.job_id)
 ORDER BY s.completed_at LIMIT least(greatest(_limit,1),100)
 LOOP
  PERFORM 1 FROM public.jobs WHERE id=_s.job_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  PERFORM 1 FROM public.recruitment_settings WHERE job_id=_s.job_id AND completion_state<>'open' AND completed_at IS NOT NULL
   AND completed_at+make_interval(months=>(SELECT recruitment_retention_months FROM public.employers WHERE id=_s.employer_id))<=now() FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.recruitment_erasure_jobs WHERE job_id=_s.job_id AND completed_at IS NULL) THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.job_applications WHERE job_id=_s.job_id AND status IN ('submitted','reviewing','interview'))
   OR EXISTS(SELECT 1 FROM public.jobs WHERE id=_s.job_id AND public.job_is_active(status,published_at,deadline_at,expires_at)) THEN CONTINUE; END IF;
  SELECT array_agg(id ORDER BY id) INTO _ids FROM public.job_applications WHERE job_id=_s.job_id;
  INSERT INTO public.recruitment_erasure_jobs(employer_id,job_id,application_ids,reason)
   VALUES(_s.employer_id,_s.job_id,_ids,'automatic_retention');
  _n:=_n+1;
 END LOOP;
 RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.rec_enqueue_due_retention(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rec_enqueue_due_retention(integer) TO service_role;

ALTER FUNCTION public.rec_retention_overview(uuid) SET timezone='UTC';
ALTER FUNCTION public.rec_enqueue_due_retention(integer) SET timezone='UTC';
CREATE FUNCTION recruitment_erasure.guard_period() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.recruitment_retention_months IS DISTINCT FROM OLD.recruitment_retention_months
 AND NOT public.has_employer_role(auth.uid(),OLD.id,ARRAY['owner','admin'])
 THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retention_period_guard BEFORE UPDATE ON public.employers FOR EACH ROW EXECUTE FUNCTION recruitment_erasure.guard_period();

CREATE FUNCTION public.rec_erasure_file_exists(_bucket text,_path text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=_bucket AND name=_path) $$;
REVOKE ALL ON FUNCTION public.rec_erasure_file_exists(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rec_erasure_file_exists(text,text) TO service_role;

-- Extend the existing paginated candidate view in place, including its URL
-- stage vocabulary. Restore never changes the stage or completed_at.
DO $$ DECLARE _def text;
BEGIN
 _def:=pg_get_functiondef('public.rec_candidate_view(uuid,text,text,text,jsonb,text,text,integer,integer,uuid)'::regprocedure);
 _def:=replace(_def, '''all'', ''open'', ''decided'', ''new'', ''review'', ''interview''' , '''all'', ''open'', ''decided'', ''new'', ''review'', ''interview'', ''archived''' );
 _def:=replace(_def, 'AND ja.employer_id = _employer', 'AND ja.employer_id = _employer AND ((_stage_v = ''archived'') = (ja.employer_archived_at IS NOT NULL))');
 _def:=replace(_def, 'WHEN ''all'' THEN true', 'WHEN ''archived'' THEN true WHEN ''all'' THEN true');
 IF _def NOT LIKE '%WHEN ''archived'' THEN true%' THEN RAISE EXCEPTION 'RETENTION_CANDIDATE_VIEW_NOT_PATCHED'; END IF;
 EXECUTE _def;
END $$;

CREATE FUNCTION public.rec_retry_erasure(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _q public.recruitment_erasure_jobs%ROWTYPE;
BEGIN
 SELECT * INTO _q FROM public.recruitment_erasure_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.rec_is_member(_q.employer_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND'; END IF;
 IF NOT public.rec_can_manage(_q.job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'; END IF;
 IF _q.completed_at IS NULL AND (_q.lease_until IS NULL OR _q.lease_until<now()) THEN
  UPDATE public.recruitment_erasure_jobs SET next_attempt_at=now() WHERE id=_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.rec_retry_erasure(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_retry_erasure(uuid) TO authenticated;

ALTER FUNCTION public.rec_erase_rows(uuid,uuid) SET timezone='UTC';
