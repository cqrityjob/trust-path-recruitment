-- Actual database/RPC acceptance oracle: synthetic only, not a pure model.
-- Defaults to rollback. RI_P1_KEEP_FIXTURE=1 commits the unchanged baseline
-- after every destructive scenario is rolled back to its savepoint.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(cond boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.fails(stmt text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE msg text; BEGIN
 BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN msg:=SQLERRM; IF position(needle IN msg)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % expected %, got %',label,needle,msg; END IF; RAISE NOTICE 'ok %',label; RETURN; END;
 RAISE EXCEPTION 'ASSERTION FAILED: % unexpectedly succeeded',label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.fails(text,text,text) TO PUBLIC;
CREATE TEMP TABLE fixture AS SELECT
 'ee100000-1111-4000-8000-000000000001'::uuid employer,
 'ee100000-0000-4000-8000-000000000001'::uuid owner,
 'ee100000-0000-4000-8000-000000000002'::uuid bob,
 'ee100000-0000-4000-8000-000000000003'::uuid member,
 'ee100000-0000-4000-8000-000000000004'::uuid outsider,
 'ee100000-2222-4000-8000-000000000001'::uuid job,
 'ee100000-2222-4000-8000-000000000002'::uuid empty_job;
CREATE TEMP TABLE seq AS SELECT n,('ee10aaaa-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid uid,
 ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid app,
 NOT(n BETWEEN 56 AND 60 OR n BETWEEN 66 AND 75 OR n BETWEEN 91 AND 95) has_cv FROM generate_series(1,100)n;
GRANT SELECT ON fixture,seq TO PUBLIC;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 SELECT owner,'ri-p1-owner@synthetic.invalid',now(),'{"display_name":"Alice synthetic"}'::jsonb FROM fixture UNION ALL
 SELECT bob,'ri-p1-bob@synthetic.invalid',now(),'{"display_name":"Bob synthetic"}'::jsonb FROM fixture UNION ALL
 SELECT member,'ri-p1-member@synthetic.invalid',now(),'{"display_name":"Member synthetic"}'::jsonb FROM fixture UNION ALL
 SELECT outsider,'ri-p1-outsider@synthetic.invalid',now(),'{}'::jsonb FROM fixture UNION ALL
 SELECT uid,'ri-p1-candidate-'||n||'@synthetic.invalid',now(),jsonb_build_object('display_name','Synthetic A'||lpad(n::text,3,'0')) FROM seq;
INSERT INTO public.user_roles(user_id,role) SELECT owner,'admin' FROM fixture;
INSERT INTO public.employers(id,name,slug,status) SELECT employer,'RI P1 synthetic organisation','ri-p1-synthetic','active' FROM fixture;
INSERT INTO public.employer_memberships(employer_id,user_id,role,status)
 SELECT employer,owner,'owner','active' FROM fixture UNION ALL SELECT employer,bob,'admin','active' FROM fixture UNION ALL SELECT employer,member,'member','active' FROM fixture;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000001';
INSERT INTO public.jobs(id,slug,short_id,employer_id,title_sv,title_en,application_method,status)
 SELECT job,'ri-p1-security-officer','RIP1001',employer,'Syntetisk väktare','Synthetic security officer','internal','draft' FROM fixture UNION ALL
 SELECT empty_job,'ri-p1-empty','RIP1002',employer,'Tom kravprofil','Empty profile','internal','draft' FROM fixture;
RESET ROLE;
INSERT INTO public.recruitment_requirements(id,job_id,employer_id,kind,label_sv,label_en,position)
 SELECT ('10000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,job,employer,CASE WHEN g<=4 THEN 'mandatory' ELSE 'desirable' END,'Krav R'||g,'Criterion R'||g,g FROM fixture,generate_series(1,6)g;
INSERT INTO public.recruitment_questions(id,job_id,employer_id,requirement_id,prompt_sv,prompt_en,answer_kind,is_required,position)
 SELECT ('20000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,job,employer,('10000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'Har du R'||g||'?','Do you hold R'||g||'?','yes_no',false,g FROM fixture,generate_series(1,6)g;
SET LOCAL ROLE authenticated;
UPDATE public.jobs SET status='published',published_at=now()-interval '1 day',expires_at=now()+interval '30 days' WHERE id IN(SELECT job FROM fixture UNION ALL SELECT empty_job FROM fixture);
RESET ROLE;
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,status,consent_given_at,created_at,cv_storage_path,cv_original_filename,cv_mime_type,cv_size_bytes)
 SELECT app,job,employer,uid,CASE WHEN n<=50 THEN 'submitted' WHEN n<=80 THEN 'reviewing' ELSE 'interview' END,now(),timestamptz '2026-10-01 00:00:00Z'+n*interval '1 minute',CASE WHEN has_cv THEN uid||'/'||app||'/synthetic.pdf' END,CASE WHEN has_cv THEN 'synthetic.pdf' END,CASE WHEN has_cv THEN 'application/pdf' END,CASE WHEN has_cv THEN 512 END FROM seq,fixture;
INSERT INTO storage.buckets(id,name,public) VALUES('job-application-cvs','job-application-cvs',false) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.objects(id,bucket_id,name,owner,created_at)
 SELECT gen_random_uuid(),'job-application-cvs',uid||'/'||app||'/synthetic.pdf',uid,now() FROM seq WHERE has_cv;
-- Boolean originals: explicit no dominates a second gap (A056–060).
INSERT INTO public.job_application_answers(application_id,question_id,employer_id,answer_kind,answer_bool)
 SELECT app,q.id,fixture.employer,'yes_no',CASE WHEN q.position=1 AND n BETWEEN 41 AND 60 THEN false ELSE true END FROM seq,fixture,public.recruitment_questions q WHERE q.job_id=fixture.job AND q.position<>6
 AND NOT(q.position=1 AND n BETWEEN 86 AND 90) AND NOT(q.position=4 AND n BETWEEN 96 AND 100);
UPDATE public.recruitment_application_meta m SET responsible_user_id=CASE WHEN s.n%2=1 THEN f.owner ELSE f.bob END FROM seq s,fixture f WHERE m.application_id=s.app;
CREATE TEMP TABLE rules AS SELECT jsonb_agg(jsonb_build_object('requirementId',r.id,'kind',r.kind,'acceptedSources',CASE WHEN r.position=2 THEN '["application_cv","interview_source"]'::jsonb ELSE '["application_answer"]'::jsonb END,'decisionRule',CASE WHEN r.position=2 THEN 'valid_at_start' ELSE 'boolean_yes' END,'questionId',q.id,'instructionSv','Kontrollera R'||r.position||' mot beslutad källa','instructionEn','Check criterion R'||r.position||' against agreed original') ORDER BY r.position) body FROM public.recruitment_requirements r JOIN public.recruitment_questions q ON q.requirement_id=r.id,fixture f WHERE r.job_id=f.job;
GRANT SELECT ON rules TO PUBLIC;
SET LOCAL ROLE authenticated;
SELECT public.rec_ri_confirm_profile((SELECT job FROM fixture),0,'ee100000-3333-4000-8000-000000000001','2026-11-01',(SELECT body FROM rules));
-- Makes the human decisions with current citations returned by the public RPC.
CREATE FUNCTION pg_temp.decisions(n integer,v jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE c jsonb;s jsonb;wanted text;until date;result jsonb:='[]';pos integer;BEGIN
 FOR c IN SELECT * FROM jsonb_array_elements(v->'criteria') LOOP
  pos:=(c->>'position')::integer;wanted:=c->>'state';s:=NULL;until:=NULL;
  IF pos=2 THEN
   SELECT value INTO s FROM jsonb_array_elements(v->'availableSources') WHERE value->>'kind'='application_cv';
   until:=CASE WHEN n BETWEEN 31 AND 40 THEN '2026-11-15'::date WHEN n BETWEEN 61 AND 65 THEN '2026-10-15'::date ELSE '2027-11-01'::date END;
   wanted:=CASE WHEN s IS NULL OR n BETWEEN 76 AND 80 THEN 'clarify' WHEN until<'2026-11-01'::date THEN 'not_met' ELSE 'met' END;
   IF s IS NULL THEN until:=NULL; END IF;
  ELSE SELECT value INTO s FROM jsonb_array_elements(v->'availableSources') WHERE value->>'kind'='application_answer' AND value->>'reference'=c->>'questionId'; END IF;
  IF pos=3 AND n BETWEEN 81 AND 85 THEN wanted:='clarify'; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('requirementId',c->>'requirementId','state',wanted,'sourceKind',s->>'kind','sourceReference',s->>'reference','sourceVersion',s->>'version','sourceLabel',s->>'label','validUntil',until,'note','Synthetic human check A'||n||' R'||pos,'neutralQuestion',CASE WHEN wanted='clarify' THEN 'Vilket underlag kan klargöra R'||pos||'?' END));
 END LOOP;RETURN result;END $$;
GRANT EXECUTE ON FUNCTION pg_temp.decisions(integer,jsonb) TO PUBLIC;
DO $$ DECLARE s record;v jsonb;confirmed boolean; BEGIN FOR s IN SELECT * FROM seq ORDER BY n LOOP
 v:=public.rec_ri_get_review(s.app);confirmed:=s.n BETWEEN 1 AND 10 OR s.n BETWEEN 41 AND 47 OR s.n BETWEEN 66 AND 75;
 PERFORM public.rec_ri_save_review(s.app,(v->>'profileId')::uuid,0,v->>'bindingToken',('ee100000-4444-4000-8000-'||lpad(s.n::text,12,'0'))::uuid,pg_temp.decisions(s.n,v),confirmed,'Kontrollera återstående underlag',CASE WHEN s.n%2=1 THEN (SELECT owner FROM fixture) ELSE (SELECT bob FROM fixture) END,(v->>'assignmentVersion')::integer);
 END LOOP;END $$;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"received":100,"reviewed":27,"remaining":73,"green":40,"yellow":25,"gray":35,"notEstablished":0}', '100 applications: 40 green / 25 yellow / 35 gray, 27 reviewed / 73 remaining');
CREATE TEMP TABLE pages AS SELECT p,public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,p,25,NULL) v FROM generate_series(1,4)p;
GRANT SELECT ON pages TO PUBLIC;
SELECT pg_temp.ok((SELECT count(*)=100 AND count(DISTINCT r->>'id')=100 FROM pages,jsonb_array_elements(v->'rows')r),'four pages: exactly 100 distinct rows');
SELECT pg_temp.ok((SELECT array_agg((r->>'id')::uuid ORDER BY p,(r->>'rank')::integer) FROM pages,jsonb_array_elements(v->'rows')r)=(SELECT array_agg(app ORDER BY CASE WHEN n<=40 THEN 0 WHEN n<=65 THEN 1 ELSE 2 END,n DESC)FROM seq),'global color/date/id order precedes pagination');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received","requirement":"yellow","review":"remaining"}','requirements',NULL,1,25,NULL)->>'total')::integer=18,'yellow unreviewed applications remain visible');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received","review":"remaining"}','requirements',NULL,3,25,NULL)->>'to')::integer=73,'remaining pages are 25, 25, 23');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received","q":"Synthetic A099"}','requirements',NULL,1,25,NULL)->>'total')::integer=1,'global search sees A099 before paging');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),jsonb_build_object('stage','received','owner',(SELECT owner FROM fixture)),'requirements',NULL,1,25,NULL)->>'total')::integer=50,'owner filter applies globally');
SELECT pg_temp.ok((SELECT (x->'intelligenceCounts')@>'{"received":100,"reviewed":27,"green":40,"yellow":25,"gray":35}' FROM jsonb_array_elements(public.rec_ri_overview_counts((SELECT employer FROM fixture)))x WHERE x->>'jobId'=(SELECT job::text FROM fixture)),'overview and candidate list share authoritative counts');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,(SELECT app FROM seq WHERE n=16))->'rows'->2->>'id')=(SELECT app::text FROM seq WHERE n=15),'neighbors cross a page edge in same global ordering');
SELECT pg_temp.ok(public.rec_ri_get_review((SELECT app FROM seq WHERE n=56))->>'requirementStatus'='yellow','explicit no dominates missing accepted document');
SELECT pg_temp.ok(public.rec_ri_get_review((SELECT app FROM seq WHERE n=96))->>'requirementStatus'='gray','missing originals never become met from positive draft assumptions');
RESET ROLE;
-- Empty profile cannot be green even with no gaps to count.
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,status,consent_given_at) SELECT 'ee100000-5555-4000-8000-000000000001',empty_job,employer,(SELECT uid FROM seq WHERE n=1),'submitted',now() FROM fixture;
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(public.rec_ri_get_review('ee100000-5555-4000-8000-000000000001')->>'requirementStatus'='not_established','empty requirement profile is never green');
RESET ROLE;
DELETE FROM public.job_applications WHERE id='ee100000-5555-4000-8000-000000000001';
SAVEPOINT archived_population;
UPDATE public.job_applications SET employer_archived_at=now() WHERE id IN(SELECT app FROM seq WHERE n<=20);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"new"}','requirements',NULL,1,25,NULL)->'counts')@>'{"total":80,"new":30,"review":30,"interview":20}', 'active stage counts exclude twenty archived submitted applications');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"received":100,"archived":20,"green":40,"yellow":25,"gray":35}', 'received counts keep archived history and explicit received link includes all hundred');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"new"}','requirements',NULL,1,25,NULL)->>'total')::integer=30,'new stage chip and clicked global list agree');
RESET ROLE;
ROLLBACK TO archived_population;
SAVEPOINT explicit_no_priority;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v jsonb;BEGIN v:=public.rec_ri_get_review((SELECT app FROM seq WHERE n=41));PERFORM public.rec_ri_save_review((v->>'applicationId')::uuid,(v->>'profileId')::uuid,(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),jsonb_build_array(jsonb_build_object('requirementId','10000000-0000-4000-8000-000000000001','state','clarify','sourceKind',NULL,'sourceReference',NULL,'sourceVersion',NULL,'sourceLabel',NULL,'validUntil',NULL,'note','Human clarification requested','neutralQuestion','Please clarify your explicit no')),false,'Clarify original answer',(SELECT owner FROM fixture),(v->>'assignmentVersion')::integer);END $$;
SELECT pg_temp.ok(public.rec_ri_get_review((SELECT app FROM seq WHERE n=41))->>'requirementStatus'='yellow','an accepted original explicit no dominates a human clarify draft');
RESET ROLE;
ROLLBACK TO explicit_no_priority;
SAVEPOINT nullable_rule_contract;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE normalized_profile AS SELECT public.rec_ri_confirm_profile((SELECT job FROM fixture),1,gen_random_uuid(),'2026-11-01',(SELECT body#-'{0,instructionEn}'#-'{1,questionId}' FROM rules))v;
SELECT pg_temp.ok((SELECT v#>'{rules,0,instructionEn}'='null'::jsonb AND v#>'{rules,1,questionId}'='null'::jsonb FROM normalized_profile),'direct profile RPC normalizes missing nullable rule keys to explicit JSON null');
RESET ROLE;
ROLLBACK TO nullable_rule_contract;
SAVEPOINT profile_change;
SET LOCAL ROLE authenticated;
SELECT public.rec_ri_confirm_profile((SELECT job FROM fixture),1,'ee100000-3333-4000-8000-000000000002','2026-12-01',(SELECT body FROM rules));
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"green":30,"yellow":35,"gray":35,"reviewed":0,"remaining":100}','V1 to V2 date change: 30/35/35, no prior review silently current');
SELECT pg_temp.fails('UPDATE public.rec_requirement_profiles SET start_date=''2027-01-01''','permission denied','direct profile mutation denied');
RESET ROLE;
ROLLBACK TO profile_change;
SAVEPOINT revoke_source;
DELETE FROM storage.objects WHERE bucket_id='job-application-cvs' AND name IN(SELECT uid||'/'||app||'/synthetic.pdf' FROM seq WHERE n<=5);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"green":35,"yellow":25,"gray":40,"reviewed":22,"remaining":78}','U1 revoked current source invalidates five accepted decisions and reviews immediately');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.rec_ri_get_review((SELECT app FROM seq WHERE n=1))->'availableSources')s WHERE s->>'kind'='application_cv'),'no new product source choice after revocation');
RESET ROLE;
-- U2: a replacement original has a new identity; old confirmation cannot return
-- merely because an object with the same path exists again.
INSERT INTO storage.objects(id,bucket_id,name,owner,created_at) SELECT gen_random_uuid(),'job-application-cvs',uid||'/'||app||'/synthetic.pdf',uid,clock_timestamp() FROM seq WHERE n<=5;
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"green":35,"yellow":25,"gray":40,"reviewed":22}', 'U2 replacement original does not reuse stale accepted facts');
DO $$ DECLARE s record;v jsonb;BEGIN FOR s IN SELECT * FROM seq WHERE n<=5 LOOP v:=public.rec_ri_get_review(s.app);PERFORM public.rec_ri_save_review(s.app,(v->>'profileId')::uuid,(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),pg_temp.decisions(s.n,v),false,'Check replacement',(SELECT owner FROM fixture),(v->>'assignmentVersion')::integer);END LOOP;END $$;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"green":40,"yellow":25,"gray":35,"reviewed":22}', 'U2 accepted new facts restore green but explicit whole-case review remains stale');
DO $$ DECLARE s record;v jsonb;BEGIN FOR s IN SELECT * FROM seq WHERE n<=5 LOOP v:=public.rec_ri_get_review(s.app);PERFORM public.rec_ri_save_review(s.app,(v->>'profileId')::uuid,(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),pg_temp.decisions(s.n,v),true,'Replacement checked',(SELECT owner FROM fixture),(v->>'assignmentVersion')::integer);END LOOP;END $$;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"green":40,"yellow":25,"gray":35,"reviewed":27}', 'U2 five explicit re-confirmations restore current reviewed count');
RESET ROLE;
ROLLBACK TO revoke_source;
SAVEPOINT changed_source;
-- Metadata identity changes model replacement; not a guarantee of signed-URL/CDN byte revocation.
UPDATE storage.objects SET created_at=created_at+interval '1 second' WHERE name=(SELECT uid||'/'||app||'/synthetic.pdf' FROM seq WHERE n=6);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"green":39,"yellow":25,"gray":36,"reviewed":26}','U3 replacement invalidates old confirmation and basis');
DO $$ DECLARE v jsonb;d jsonb;BEGIN v:=public.rec_ri_get_review((SELECT app FROM seq WHERE n=6));d:=pg_temp.decisions(61,v);PERFORM public.rec_ri_save_review((v->>'applicationId')::uuid,(v->>'profileId')::uuid,(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),d,true,'New expiry confirmed',(SELECT bob FROM fixture),(v->>'assignmentVersion')::integer); END $$;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"green":39,"yellow":26,"gray":35,"reviewed":27}','new human-accepted expiry is yellow and explicitly reviewed');
RESET ROLE;
ROLLBACK TO changed_source;
SAVEPOINT assignment_concurrency;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE assignment_draft AS SELECT public.rec_ri_get_review((SELECT app FROM seq WHERE n=1))v;
GRANT SELECT ON assignment_draft TO PUBLIC;
SELECT public.rec_set_application_responsible((SELECT app FROM seq WHERE n=1),(SELECT bob FROM fixture),(SELECT (v->>'assignmentVersion')::integer FROM assignment_draft));
SELECT pg_temp.ok(public.rec_ri_get_review((SELECT app FROM seq WHERE n=1))->>'reviewState'='reviewed','responsible reassignment alone does not stale current requirement review');
SELECT pg_temp.fails(format('SELECT public.rec_ri_save_review(%L,%L,1,%L,gen_random_uuid(),%L::jsonb,true,%L,%L,%L)',v->>'applicationId',v->>'profileId',v->>'bindingToken',pg_temp.decisions(1,v),'Stale next action',(SELECT owner FROM fixture),v->>'assignmentVersion'),'STALE_VERSION','stale review cannot overwrite newly assigned responsible person') FROM assignment_draft;
SELECT pg_temp.fails(format('SELECT public.rec_ri_save_review(%L,%L,1,%L,gen_random_uuid(),%L::jsonb,true,%L,%L,%L)',v->>'applicationId',v->>'profileId',v->>'bindingToken',pg_temp.decisions(1,v),'Stale next action',(SELECT bob FROM fixture),v->>'assignmentVersion'),'STALE_VERSION','assignment CAS is checked even if responsible selection now matches') FROM assignment_draft;
SELECT pg_temp.ok((SELECT responsible_user_id=(SELECT bob FROM fixture) FROM public.recruitment_application_meta WHERE application_id=(SELECT app FROM seq WHERE n=1)) AND (SELECT revision=1 AND next_action='Kontrollera återstående underlag' FROM public.rec_requirement_review_heads WHERE application_id=(SELECT app FROM seq WHERE n=1)),'stale assignment requests leave responsible, decisions and next action unchanged');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.rec_requirement_review_events WHERE application_id=(SELECT app FROM seq WHERE n=1)),'failed assignment CAS creates no review event');
ROLLBACK TO assignment_concurrency;

SAVEPOINT concurrent_review;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE stale AS SELECT public.rec_ri_get_review((SELECT app FROM seq WHERE n=76)) v;
GRANT SELECT ON stale TO PUBLIC;
DO $$ DECLARE v jsonb;i integer;BEGIN FOR i IN 1..6 LOOP v:=public.rec_ri_get_review((SELECT app FROM seq WHERE n=76));PERFORM public.rec_ri_save_review((v->>'applicationId')::uuid,(v->>'profileId')::uuid,(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),pg_temp.decisions(76,v),false,'Clarify document',(SELECT bob FROM fixture),(v->>'assignmentVersion')::integer);END LOOP;END $$;
CREATE TEMP TABLE winner AS SELECT public.rec_ri_get_review((SELECT app FROM seq WHERE n=76)) v;
GRANT SELECT ON winner TO PUBLIC;
SELECT pg_temp.ok((SELECT (v->>'revision')::integer=7 FROM winner),'two readers share revision seven');
DO $$ DECLARE v jsonb:=(SELECT v FROM winner);result jsonb;op uuid:=gen_random_uuid();d jsonb;BEGIN d:=pg_temp.decisions(76,v);result:=public.rec_ri_save_review((v->>'applicationId')::uuid,(v->>'profileId')::uuid,7,v->>'bindingToken',op,d,true,'Verify unreadable document',(SELECT bob FROM fixture),(v->>'assignmentVersion')::integer);PERFORM pg_temp.ok((result->>'revision')::integer=8,'CAS winner is revision eight');PERFORM pg_temp.ok(result=public.rec_ri_save_review((v->>'applicationId')::uuid,(v->>'profileId')::uuid,7,v->>'bindingToken',op,d,true,'Verify unreadable document',(SELECT bob FROM fixture),(v->>'assignmentVersion')::integer),'retry of same operation is idempotent');END $$;
SELECT pg_temp.fails(format('SELECT public.rec_ri_save_review(%L,%L,7,%L,gen_random_uuid(),%L::jsonb,true,%L,%L,%L)',v->>'applicationId',v->>'profileId',v->>'bindingToken',pg_temp.decisions(76,v),'Overwrite',(SELECT bob FROM fixture),v->>'assignmentVersion'),'RI_STALE_VERSION','CAS stale reader is rejected and draft not applied') FROM winner;
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"received":100,"reviewed":28,"remaining":72,"green":40,"yellow":25,"gray":35}','no double counting after winner/retry/stale loser');
RESET ROLE;
ROLLBACK TO concurrent_review;
SAVEPOINT peace_handoff;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE handoff AS SELECT public.scp_iv_create_case((SELECT employer FROM fixture),'P1 explicit PEACE handoff',(SELECT v.id FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug='vaktare-se' AND v.version_number=1),'Synthetic A001',(SELECT uid FROM seq WHERE n=1),NULL,(SELECT job FROM fixture),(SELECT app FROM seq WHERE n=1)) case_id;
GRANT SELECT ON handoff TO PUBLIC;
DO $$ DECLARE v jsonb;result jsonb;op uuid:=gen_random_uuid();sel uuid[]:=ARRAY['10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid];BEGIN
 v:=public.rec_ri_get_review((SELECT app FROM seq WHERE n=1));
 result:=public.rec_ri_transfer_requirements((v->>'applicationId')::uuid,(SELECT case_id FROM handoff),(v->>'revision')::integer,v->>'bindingToken',op,sel);
 PERFORM pg_temp.ok((result->>'count')::integer=2,'explicitly selected two requirements transferred to same application case');
 PERFORM pg_temp.ok(result=public.rec_ri_transfer_requirements((v->>'applicationId')::uuid,(SELECT case_id FROM handoff),(v->>'revision')::integer,v->>'bindingToken',op,sel),'handoff operation retry is idempotent');
 PERFORM pg_temp.ok(result=public.rec_ri_transfer_requirements((v->>'applicationId')::uuid,(SELECT case_id FROM handoff),(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),sel),'repeated same selection with new operation reuses sources');
 PERFORM pg_temp.ok(public.rec_ri_get_review((v->>'applicationId')::uuid)->>'reviewState'='reviewed','handoff itself does not invalidate current human review');
 PERFORM pg_temp.fails(format('SELECT public.rec_ri_transfer_requirements(%L,%L,0,%L,gen_random_uuid(),ARRAY[%L]::uuid[])',v->>'applicationId',(SELECT case_id FROM handoff),v->>'bindingToken',sel[1]),'RI_SOURCE_STALE','stale handoff revision is refused');
 PERFORM pg_temp.fails(format('SELECT public.rec_ri_transfer_requirements(%L,%L,1,%L,gen_random_uuid(),ARRAY[%L]::uuid[])',(SELECT app FROM seq WHERE n=2),(SELECT case_id FROM handoff),v->>'bindingToken',sel[1]),'RECRUITMENT_NOT_PERMITTED','handoff refuses another application case');
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=2 AND bool_and(source_kind='employer_requirements' AND content_text::jsonb ? 'requirementId') FROM public.scp_interview_case_sources WHERE case_id=(SELECT case_id FROM handoff)),'handoff does not copy entire CV or create evidence');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.scp_interview_evidence WHERE case_id=(SELECT case_id FROM handoff)),'selected requirements are preparation sources, never automatically confirmed evidence');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000003';
SELECT pg_temp.fails(format('SELECT public.rec_ri_transfer_requirements(%L,%L,1,''token'',gen_random_uuid(),ARRAY[%L]::uuid[])',(SELECT app FROM seq WHERE n=1),(SELECT case_id FROM handoff),'10000000-0000-4000-8000-000000000002'),'RECRUITMENT_NOT_PERMITTED','ordinary member handoff direct RPC denied');
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000001';
DO $$ DECLARE sid uuid;v jsonb;source jsonb;BEGIN
 sid:=public.scp_iv_add_source((SELECT case_id FROM handoff),'candidate_cv','Private synthetic original','Synthetic original expiry 2027-11-01','recruitment','Synthetic test only');
 v:=public.rec_ri_get_review((SELECT app FROM seq WHERE n=1));SELECT value INTO source FROM jsonb_array_elements(v->'availableSources')WHERE value->>'reference'=sid::text;
 PERFORM public.rec_ri_save_review((v->>'applicationId')::uuid,(v->>'profileId')::uuid,(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),jsonb_build_array(jsonb_build_object('requirementId','10000000-0000-4000-8000-000000000002','state','met','sourceKind','interview_source','sourceReference',sid,'sourceVersion',source->>'version','sourceLabel','Private synthetic original','validUntil','2027-11-01','note','Private original human text','neutralQuestion','Private original question')),false,'Application follow-up',(SELECT owner FROM fixture),(v->>'assignmentVersion')::integer);
END $$;
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.rec_ri_get_review((SELECT app FROM seq WHERE n=1))->'availableSources')s WHERE s->>'kind'='interview_source'),'application membership does not reveal private interview source choices');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(public.rec_ri_get_review((SELECT app FROM seq WHERE n=1))->'criteria')c WHERE c->>'requirementId'='10000000-0000-4000-8000-000000000002' AND c->'source'='null'::jsonb AND c->'note'='null'::jsonb AND c->'neutralQuestion'='null'::jsonb),'private source citation and human text are redacted in public review RPC');
SELECT pg_temp.fails('SELECT * FROM public.rec_requirement_review_events','permission denied','raw audit payload cannot bypass private case permission');
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000001';
DO $$ DECLARE c uuid:=(SELECT case_id FROM handoff);plan uuid;s uuid;q uuid;hash text;BEGIN
 PERFORM public.scp_iv_mark_sources_ready(c);plan:=public.scp_iv_record_manual_prep_plan(c,'60 minutes','No AI preparation used.','Summarise and offer factual correction.');PERFORM public.scp_iv_approve_prep_plan(plan,'Explicitly reviewed');s:=public.scp_iv_start_session(c,'Synthetic interviewer');PERFORM public.scp_iv_set_session_state(s,'completed','evaluation');PERFORM public.scp_iv_begin_evidence_review(c);
 FOR q IN SELECT cq.id FROM public.scp_interview_core_questions cq JOIN public.scp_interview_cases cc ON cc.pack_version_id=cq.pack_version_id WHERE cc.id=c LOOP PERFORM public.scp_iv_record_assessment(c,q,0,'Insufficient material; human decision only.');END LOOP;
 PERFORM public.scp_iv_mark_assessed(c);SELECT basis_hash INTO hash FROM public.scp_iv_preview_report(c);PERFORM public.scp_iv_finalise_previewed_report(c,hash,NULL);
END $$;
RESET ROLE;
CREATE TEMP TABLE immutable_report AS SELECT id,payload,content_hash FROM public.scp_interview_reports WHERE case_id=(SELECT case_id FROM handoff);
GRANT SELECT ON immutable_report TO PUBLIC;
SET LOCAL ROLE authenticated;
SELECT public.rec_ri_confirm_profile((SELECT job FROM fixture),1,gen_random_uuid(),'2026-12-01',(SELECT body FROM rules));
RESET ROLE;
DELETE FROM storage.objects WHERE name=(SELECT uid||'/'||app||'/synthetic.pdf' FROM seq WHERE n=1);
SELECT pg_temp.ok((SELECT r.payload=f.payload AND r.content_hash=f.content_hash FROM public.scp_interview_reports r JOIN immutable_report f USING(id)),'later profile/source change preserves final report byte-for-byte');
SELECT pg_temp.fails(format('UPDATE public.scp_interview_reports SET payload=payload||''{"rewrite":true}'' WHERE id=%L',(SELECT id FROM immutable_report)),'SCP_IV_REPORT_IMMUTABLE','even table owner cannot rewrite finalized report');
ROLLBACK TO peace_handoff;
SAVEPOINT ai_isolation;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE ai_case AS SELECT public.scp_iv_create_case((SELECT employer FROM fixture),'P1 AI proposal isolation',(SELECT v.id FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug='vaktare-se' AND v.version_number=1),'Synthetic A096',(SELECT uid FROM seq WHERE n=96),NULL,(SELECT job FROM fixture),(SELECT app FROM seq WHERE n=96)) case_id;
GRANT SELECT ON ai_case TO PUBLIC;
RESET ROLE;
INSERT INTO public.scp_interview_ai_runs(case_id,task,task_version,prompt_version,provider,model,status,raw_response,requires_human_review)
 SELECT case_id,'candidate_source_extraction','synthetic','synthetic','mock','synthetic','succeeded',jsonb_build_object('requirementId','10000000-0000-4000-8000-000000000004','state',state),true FROM ai_case,unnest(ARRAY['met','not_met'])state;
INSERT INTO public.scp_interview_findings(case_id,ai_run_id,finding_kind,statement,claim_class,human_state)
 SELECT case_id,id,'unclear','Synthetic proposal, no original evidence','ai_inference','proposed' FROM public.scp_interview_ai_runs WHERE case_id=(SELECT case_id FROM ai_case);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(public.rec_ri_get_review((SELECT app FROM seq WHERE n=96))->>'requirementStatus'='gray' AND EXISTS(SELECT 1 FROM jsonb_array_elements(public.rec_ri_get_review((SELECT app FROM seq WHERE n=96))->'criteria')c WHERE c->>'requirementId'='10000000-0000-4000-8000-000000000004' AND c->>'state'='clarify'),'actual positive and negative AI drafts without original never create met or not_met');
SELECT pg_temp.fails(format('SELECT public.rec_ri_save_review(%L,%L,1,%L,gen_random_uuid(),%L::jsonb,false,NULL,NULL,%L)',v->>'applicationId',v->>'profileId',v->>'bindingToken',jsonb_build_array(jsonb_build_object('requirementId','10000000-0000-4000-8000-000000000004','state','met','sourceKind',NULL,'sourceReference',NULL,'sourceVersion',NULL,'sourceLabel',NULL,'validUntil',NULL,'note','AI draft only','neutralQuestion',NULL)),v->>'assignmentVersion'),'RI_ACCEPTED_SOURCE_REQUIRED','direct API positive assertion without accepted original is rejected') FROM (SELECT public.rec_ri_get_review((SELECT app FROM seq WHERE n=96))v)x;
RESET ROLE;
SELECT pg_temp.ok(NOT (SELECT ai_enabled OR transcript_enabled FROM public.scp_interview_ai_config WHERE id),'AI and transcript switches stay off; historical synthetic proposal rows do not execute AI');
ROLLBACK TO ai_isolation;

SAVEPOINT immutable_history;
-- Exercise alternate writes as the table owner, not only through RLS.
SELECT pg_temp.fails(format('UPDATE public.rec_requirement_profiles SET confirmed_by=NULL WHERE job_id=%L',(SELECT job FROM fixture)),'RI_PROFILE_IMMUTABLE','direct actor-null cannot disguise a profile edit as user erasure');
SELECT pg_temp.fails(format('DELETE FROM public.rec_requirement_profiles WHERE job_id=%L',(SELECT job FROM fixture)),'RI_PROFILE_IMMUTABLE','confirmed profile cannot be deleted while its job exists');
SELECT pg_temp.fails(format('UPDATE public.rec_requirement_review_events SET actor_id=NULL WHERE application_id=%L',(SELECT app FROM seq WHERE n=1)),'RI_HISTORY_IMMUTABLE','direct actor-null cannot disguise an audit edit as user erasure');
SELECT pg_temp.fails(format('DELETE FROM public.rec_requirement_review_events WHERE application_id=%L',(SELECT app FROM seq WHERE n=1)),'RI_HISTORY_IMMUTABLE','review audit cannot be directly deleted');
SELECT pg_temp.fails(format('UPDATE recruiter_intelligence.operations SET result=''{}'' WHERE scope_id=%L',(SELECT app FROM seq WHERE n=1)),'RI_HISTORY_IMMUTABLE','idempotency result cannot be rewritten');
SELECT pg_temp.fails(format('DELETE FROM recruiter_intelligence.operations WHERE scope_id=%L',(SELECT app FROM seq WHERE n=1)),'RI_HISTORY_IMMUTABLE','idempotency history cannot be directly deleted');
SELECT pg_temp.fails('TRUNCATE public.rec_requirement_profiles CASCADE','RI_HISTORY_TRUNCATE','TRUNCATE cannot erase profile history through cascade');
SELECT pg_temp.fails('TRUNCATE public.rec_requirement_review_heads','RI_HISTORY_TRUNCATE','TRUNCATE cannot erase current review heads');
SELECT pg_temp.fails('TRUNCATE public.rec_requirement_decisions','RI_HISTORY_TRUNCATE','TRUNCATE cannot erase accepted decisions');
SELECT pg_temp.fails('TRUNCATE public.rec_requirement_review_events','RI_HISTORY_TRUNCATE','TRUNCATE cannot erase audit events');
SELECT pg_temp.fails('TRUNCATE recruiter_intelligence.operations','RI_HISTORY_TRUNCATE','TRUNCATE cannot erase idempotency operations');
SELECT pg_temp.fails('TRUNCATE public.recruitment_requirements CASCADE','RI_HISTORY_TRUNCATE','TRUNCATE cannot remove requirement IDs pinned by a profile');
SELECT pg_temp.fails('TRUNCATE public.recruitment_questions CASCADE','RI_HISTORY_TRUNCATE','TRUNCATE cannot remove question IDs pinned by a profile');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM (VALUES('public.rec_requirement_profiles'),('public.rec_requirement_review_heads'),('public.rec_requirement_decisions'),('public.rec_requirement_review_events'),('recruiter_intelligence.operations'))t(name) WHERE has_table_privilege('service_role',t.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),'service role has no raw table bypass on canonical P1 records');
SET LOCAL ROLE service_role;
SELECT pg_temp.fails('UPDATE public.rec_requirement_profiles SET confirmed_by=NULL','permission denied','RLS-bypassing service role cannot mutate confirmed profiles');
SELECT pg_temp.fails('DELETE FROM public.rec_requirement_review_events','permission denied','RLS-bypassing service role cannot delete review audit');
RESET ROLE;
ROLLBACK TO immutable_history;

SAVEPOINT genuine_user_erasure;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000002';
SELECT public.rec_ri_confirm_profile((SELECT job FROM fixture),1,gen_random_uuid(),'2026-12-01',(SELECT body FROM rules));
DO $$ DECLARE v jsonb;BEGIN
 v:=public.rec_ri_get_review((SELECT app FROM seq WHERE n=1));
 PERFORM public.rec_ri_save_review((v->>'applicationId')::uuid,(v->>'profileId')::uuid,(v->>'revision')::integer,v->>'bindingToken',gen_random_uuid(),pg_temp.decisions(1,v),false,'Synthetic erasure audit',(SELECT bob FROM fixture),(v->>'assignmentVersion')::integer);
END $$;
RESET ROLE;
CREATE TEMP TABLE erase_profile AS SELECT id,rules,start_date,version,confirmed_at FROM public.rec_requirement_profiles WHERE confirmed_by=(SELECT bob FROM fixture);
CREATE TEMP TABLE erase_event AS SELECT id,payload,binding_token,revision FROM public.rec_requirement_review_events WHERE actor_id=(SELECT bob FROM fixture);
DELETE FROM auth.users WHERE id=(SELECT bob FROM fixture);
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(p.confirmed_by IS NULL AND p.rules=e.rules AND p.start_date=e.start_date AND p.version=e.version AND p.confirmed_at=e.confirmed_at) FROM public.rec_requirement_profiles p JOIN erase_profile e USING(id)),'genuine auth-user FK erasure clears profile actor and preserves version content');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(r.actor_id IS NULL AND r.payload=e.payload AND r.binding_token=e.binding_token AND r.revision=e.revision) FROM public.rec_requirement_review_events r JOIN erase_event e USING(id)),'genuine auth-user FK erasure preserves review event payload');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM recruiter_intelligence.operations WHERE actor_id=(SELECT bob FROM fixture)),'genuine auth-user erasure cascades personal operation cache');
ROLLBACK TO genuine_user_erasure;

SAVEPOINT genuine_job_erasure;
DELETE FROM public.jobs WHERE id=(SELECT job FROM fixture);
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.rec_requirement_profiles WHERE job_id=(SELECT job FROM fixture)) AND NOT EXISTS(SELECT 1 FROM public.rec_requirement_review_heads WHERE employer_id=(SELECT employer FROM fixture)) AND NOT EXISTS(SELECT 1 FROM public.rec_requirement_review_events WHERE employer_id=(SELECT employer FROM fixture)) AND NOT EXISTS(SELECT 1 FROM recruiter_intelligence.operations WHERE job_id=(SELECT job FROM fixture)),'genuine job erasure cascades P1 profiles, heads, audit and operations');
ROLLBACK TO genuine_job_erasure;

SAVEPOINT auth_scenario;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000003';
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->>'total')::integer=100,'ordinary member can read authorized received population');
SELECT pg_temp.fails(format('SELECT public.rec_ri_confirm_profile(%L,1,gen_random_uuid(),NULL,''[]'')',(SELECT job FROM fixture)),'RECRUITMENT_NOT_PERMITTED','ordinary member cannot confirm criteria by direct RPC');
SELECT pg_temp.fails(format('SELECT public.rec_ri_save_review(%L,gen_random_uuid(),1,''token'',gen_random_uuid(),''[]'',false,NULL,NULL,NULL)',(SELECT app FROM seq WHERE n=1)),'RECRUITMENT_NOT_PERMITTED','ordinary member cannot save review by direct RPC');
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000004';
SELECT pg_temp.fails(format('SELECT public.rec_ri_get_review(%L)',(SELECT app FROM seq WHERE n=1)),'APPLICATION_NOT_FOUND','outsider cannot read original-backed review');
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_requirement_profiles)=0,'RLS hides profiles from outsider');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.fails(format('SELECT public.rec_ri_get_profile(%L)',(SELECT job FROM fixture)),'permission denied','anonymous direct RPC denied');
RESET ROLE;
ROLLBACK TO auth_scenario;
-- Baseline is unchanged after scenarios. Storage contains metadata only; real
-- uploads, public Auth and cached signed URLs are separate drift checks.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000001';
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"received":100,"reviewed":27,"remaining":73,"green":40,"yellow":25,"gray":35}','unchanged fixture ready for separate browser/API tests');
RESET ROLE;
\if :{?RI_P1_KEEP_FIXTURE}
COMMIT;
\else
ROLLBACK;
\endif
