-- Synthetic fixture copied from main8c9 P1 oracle lines24-91, preserving IDs/rules/100 reviews.
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
SELECT pg_temp.ok(recruiter_intelligence.source_version((SELECT app FROM seq WHERE n=1),'external_reference',' Åsa – 你好 🔒 ')='63b0ba29d36d9461fe65f92af5fa4f628cab431950b6ffd3eb8284eb7a458a0a' AND recruiter_intelligence.source_version((SELECT app FROM seq WHERE n=1),'unknown_source','Åsa') IS NULL,'UTF8 source SHA256 matches fixed independent bytes and preserves absent source NULL');
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
