-- CI ONLY: stand down the new feature before historical destructive rollback
-- tests. This is not an operational rollback and must never run on Supabase.
-- The application-retention suite above uses transactionally rolled-back data.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT LIKE '%ci_test%' AND current_database() NOT LIKE 'retention_%'
 THEN RAISE EXCEPTION 'DISPOSABLE_RETENTION_TEST_DATABASE_REQUIRED'; END IF;
 IF current_setting('is_superuser') <> 'on'
 OR EXISTS(SELECT 1 FROM public.recruitment_erasure_jobs)
 OR EXISTS(SELECT 1 FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id IS NOT NULL)
 THEN RAISE EXCEPTION 'RETENTION_TEST_TEARDOWN_REFUSED'; END IF;
END $$;
DO $$ DECLARE _f record; _def text;
BEGIN
 FOR _f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc LIKE '%recruitment_erasure.releases%'
 LOOP
  _def:=replace(pg_get_functiondef(_f.oid), E'\n IF TG_OP = ''DELETE'' AND recruitment_erasure.releases(TG_RELID,to_jsonb(OLD)) THEN RETURN OLD; END IF;', '');
  EXECUTE _def;
 END LOOP;
 _def:=pg_get_functiondef('public.rec_candidate_view(uuid,text,text,text,jsonb,text,text,integer,integer,uuid)'::regprocedure);
 _def:=replace(_def, ', ''archived''', '');
 _def:=replace(_def, ' AND ((_stage_v = ''archived'') = (ja.employer_archived_at IS NOT NULL))', '');
 _def:=replace(_def, 'WHEN ''archived'' THEN true ', '');
 EXECUTE _def;
END $$;
DROP FUNCTION public.rec_retention_scope(uuid,uuid), public.rec_archive_material(uuid,uuid,boolean),
 public.rec_set_retention(uuid,integer), public.rec_retention_overview(uuid),
 public.rec_preview_erasure(uuid,uuid), public.rec_request_erasure(uuid,uuid,text),
 public.rec_claim_erasure(), public.rec_erase_rows(uuid,uuid), public.rec_settle_erasure(uuid,uuid,text),
 public.rec_enqueue_due_retention(integer), public.rec_erasure_file_exists(text,text), public.rec_retry_erasure(uuid);
ALTER TABLE public.storage_erasure_queue DROP COLUMN recruitment_erasure_job_id;
DROP TABLE public.recruitment_erasure_jobs;
DROP SCHEMA recruitment_erasure CASCADE;
ALTER TABLE public.job_applications DROP COLUMN employer_archived_at;
ALTER TABLE public.recruitment_settings DROP COLUMN archived_at;
ALTER TABLE public.employers DROP COLUMN recruitment_retention_months;
ALTER TABLE public.scp_report_computation_manifests DROP CONSTRAINT scp_manifest_participant_snapshot_fkey,
 DROP CONSTRAINT scp_manifest_employer_snapshot_fkey;
ALTER TABLE public.scp_report_computation_manifests ADD CONSTRAINT scp_manifest_participant_snapshot_fkey
 FOREIGN KEY(participant_snapshot_id) REFERENCES public.scp_report_snapshots(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT scp_manifest_employer_snapshot_fkey FOREIGN KEY(employer_snapshot_id)
 REFERENCES public.scp_report_snapshots(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.bcp_invitations DROP CONSTRAINT bcp_invitations_assignment_id_fkey;
ALTER TABLE public.bcp_invitations ADD CONSTRAINT bcp_invitations_assignment_id_fkey
 FOREIGN KEY(assignment_id) REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT;
COMMIT;
