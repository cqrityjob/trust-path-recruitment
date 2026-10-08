\set ON_ERROR_STOP on
INSERT INTO auth.users(id,email) VALUES
 ('b7070000-0000-4000-8000-000000000001','snapshot-owner@test.invalid'),
 ('b7070000-0000-4000-8000-000000000002','snapshot-member@test.invalid'),
 ('b7070000-0000-4000-8000-000000000003','snapshot-other@test.invalid');
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('b7070000-1111-4000-8000-000000000001','Snapshot synthetic','snapshot-synthetic','active');
INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES
 ('b7070000-1111-4000-8000-000000000001','b7070000-0000-4000-8000-000000000001','owner','active'),
 ('b7070000-1111-4000-8000-000000000001','b7070000-0000-4000-8000-000000000002','member','active');
CREATE TABLE public.ri_snapshot_test_cases(label text PRIMARY KEY,id uuid);
CREATE TABLE public.ri_snapshot_test_old_report AS SELECT payload,content_hash FROM public.scp_interview_reports WHERE false;
GRANT ALL ON public.ri_snapshot_test_cases TO authenticated;
DO $$ DECLARE _pack uuid; _case uuid; _source uuid; _plan uuid; _session uuid; _q uuid; _hash text; _report uuid;
BEGIN
 SELECT v.id INTO _pack FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug='vaktare-se' AND v.version_number=1;
 PERFORM set_config('request.jwt.claim.sub','b7070000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 _case:=public.scp_iv_create_case('b7070000-1111-4000-8000-000000000001','Legacy active',_pack,'Synthetic legacy',NULL,'SNAP-LEGACY');
 INSERT INTO public.ri_snapshot_test_cases VALUES('legacy',_case);
 _case:=public.scp_iv_create_case('b7070000-1111-4000-8000-000000000001','Legacy report',_pack,'Synthetic report',NULL,'SNAP-REPORT');
 INSERT INTO public.ri_snapshot_test_cases VALUES('old_report_case',_case);
 _source:=public.scp_iv_add_source(_case,'employer_requirements','Synthetic role','Syntetiskt kravutdrag.','recruitment','Syntetiskt test');
 PERFORM public.scp_iv_mark_sources_ready(_case);
 _plan:=public.scp_iv_record_manual_prep_plan(_case,'60 minuter','Ingen AI används.','Erbjud sakrättelse.');
 PERFORM public.scp_iv_approve_prep_plan(_plan,'Granskat manuellt.');
 _session:=public.scp_iv_start_session(_case,'Syntetisk intervjuare');
 PERFORM public.scp_iv_set_session_state(_session,'in_progress');
 PERFORM public.scp_iv_set_session_state(_session,'completed','evaluation');
 PERFORM public.scp_iv_begin_evidence_review(_case);
 FOR _q IN SELECT id FROM public.scp_interview_core_questions WHERE pack_version_id=_pack LOOP
  PERFORM public.scp_iv_record_assessment(_case,_q,0,'Otillräckligt underlag.');
 END LOOP;
 PERFORM public.scp_iv_mark_assessed(_case);
 SELECT basis_hash INTO _hash FROM public.scp_iv_preview_report(_case);
 _report:=public.scp_iv_finalise_previewed_report(_case,_hash,NULL);
 INSERT INTO public.ri_snapshot_test_cases VALUES('old_report',_report);
 RESET ROLE;
 INSERT INTO public.ri_snapshot_test_old_report SELECT payload,content_hash FROM public.scp_interview_reports WHERE id=_report;
 PERFORM set_config('request.jwt.claim.sub','',true);
END $$;
