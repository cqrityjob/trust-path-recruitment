-- Full-schema SQL/role tests; Auth/Storage are the documented test bootstrap.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(cond boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok WORKSPACE %',label; END $$;
CREATE FUNCTION pg_temp.fails(stmt text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE msg text; BEGIN
 BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 IF position(needle IN msg)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % expected %, got %',label,needle,msg; END IF; RAISE NOTICE 'ok WORKSPACE %',label; RETURN; END;
 RAISE EXCEPTION 'ASSERTION FAILED: % unexpectedly succeeded',label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.fails(text,text,text) TO PUBLIC;
\ir fixtures/recruiter_workspace_100.sql
SELECT pg_temp.ok(public.rec_ri_next_unreviewed((SELECT employer FROM fixture),(SELECT job FROM fixture))->>'remaining'='73','queuecount73beforepagination');
SELECT pg_temp.ok(public.rec_ri_next_unreviewed((SELECT employer FROM fixture),(SELECT job FROM fixture))->'next'->>'applicationId'=(SELECT app::text FROM seq WHERE n=11),'nextactiveinchronologicalorder');
SELECT pg_temp.ok(public.rec_ri_profile_change_impact((SELECT job FROM fixture),1)@>'{"received":100,"active":100,"reviewedActive":27}', 'impact covers100 and27reviewed');
SELECT pg_temp.fails(format('SELECT public.rec_ri_profile_change_impact(%L,0)',(SELECT job FROM fixture)),'RI_STALE_VERSION','stale impact refuses');
CREATE TEMP TABLE old_profile AS SELECT public.rec_ri_get_profile((SELECT job FROM fixture)) p;
GRANT SELECT ON old_profile TO PUBLIC;
SELECT pg_temp.ok((SELECT count(*) FROM jsonb_object_keys(public.rec_ri_page_evidence((SELECT job FROM fixture),(SELECT (p->>'profileId')::uuid FROM old_profile),ARRAY[(SELECT app FROM seq WHERE n=1),(SELECT app FROM seq WHERE n=60),(SELECT app FROM seq WHERE n=90)],ARRAY['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid])))=3,'pageevidenceonlyselectedapplications');
SELECT pg_temp.ok(jsonb_array_length(public.rec_ri_page_evidence((SELECT job FROM fixture),(SELECT (p->>'profileId')::uuid FROM old_profile),ARRAY[(SELECT app FROM seq WHERE n=1)],ARRAY['10000000-0000-4000-8000-000000000002'::uuid])->(SELECT app::text FROM seq WHERE n=1))=1,'pageevidenceonlyexistingboundcriterion');
SELECT pg_temp.fails(format('SELECT public.rec_ri_page_evidence(%L,%L,ARRAY[%L::uuid],ARRAY[%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),'10000000-0000-4000-8000-000000009999'),'RI_COMPARISON_INVALID','displaycolumncannotinventcriterion');
SELECT pg_temp.ok(jsonb_array_length(public.rec_ri_compare_applications((SELECT job FROM fixture),(SELECT (p->>'profileId')::uuid FROM old_profile),ARRAY[(SELECT app FROM seq WHERE n=1),(SELECT app FROM seq WHERE n=60),(SELECT app FROM seq WHERE n=90)]))=3,'three selections acrosspages includingyellowandgray');
SELECT pg_temp.fails(format('SELECT public.rec_ri_compare_applications(%L,%L,ARRAY[%L::uuid,%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),(SELECT app FROM seq WHERE n=1)),'RI_COMPARISON_INVALID','duplicatecomparisonrejected');
SELECT pg_temp.fails(format('SELECT public.rec_ri_compare_applications(%L,%L,ARRAY[%L::uuid,%L::uuid,%L::uuid,%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),(SELECT app FROM seq WHERE n=2),(SELECT app FROM seq WHERE n=3),(SELECT app FROM seq WHERE n=4)),'RI_COMPARISON_INVALID','fourcomparisonrejected');
SELECT pg_temp.fails(format('SELECT public.rec_ri_compare_applications(%L,%L,ARRAY[%L::uuid,%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),'ee100000-2222-4000-8000-000000009999'),'RI_COMPARISON_INVALID','unknownorwrongapplicationrefuses');
SELECT pg_temp.fails(format('SELECT public.rec_ri_confirm_reviewed_profile(%L,1,gen_random_uuid(),%L,%L::jsonb,%L)',(SELECT job FROM fixture),'2026-11-01',(SELECT body FROM rules),'  '),'RI_CHANGE_REASON_REQUIRED','reasonrequired');
SELECT public.rec_ri_confirm_reviewed_profile((SELECT job FROM fixture),1,'ee100000-7777-4000-8000-000000000001','2026-12-01',(SELECT body FROM rules),'Startdatum flyttas; alla aktiva omgranskas');
SELECT pg_temp.ok((public.rec_ri_get_profile((SELECT job FROM fixture))->>'version')::integer=2,'createsexactversion2');
SELECT pg_temp.ok(public.rec_ri_profile_change_history((SELECT job FROM fixture))->0->>'reason'='Startdatum flyttas; alla aktiva omgranskas','reasonvisibleviaauthorizedhistory');
SELECT pg_temp.ok(public.rec_ri_profile_change_history((SELECT job FROM fixture))->0->'priorProfile'=(SELECT p FROM old_profile),'oldprofilebytesretained');
SELECT pg_temp.ok((public.rec_ri_candidate_view((SELECT employer FROM fixture),(SELECT job FROM fixture),'{"stage":"received"}','requirements',NULL,1,25,NULL)->'intelligenceCounts')@>'{"received":100,"reviewed":0,"remaining":100}','wholepopulationrequiresnewreview');
SELECT pg_temp.ok(public.rec_ri_confirm_reviewed_profile((SELECT job FROM fixture),1,'ee100000-7777-4000-8000-000000000001','2026-12-01',(SELECT body FROM rules),'Startdatum flyttas; alla aktiva omgranskas')->>'version'='2','sameoperationidempotentafterversionchange');
SELECT pg_temp.fails(format('SELECT public.rec_ri_confirm_reviewed_profile(%L,1,%L,%L,%L::jsonb,%L)',(SELECT job FROM fixture),'ee100000-7777-4000-8000-000000000001','2026-12-01',(SELECT body FROM rules),'annat skäl'),'RI_OPERATION_CONFLICT','sameoperationdifferentreasonrefuses');
SELECT pg_temp.fails(format('SELECT public.rec_ri_compare_applications(%L,%L,ARRAY[%L::uuid,%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),(SELECT app FROM seq WHERE n=60)),'RI_SOURCE_STALE','lateV1comparisonrefuses');
SELECT pg_temp.fails(format('SELECT public.rec_ri_page_evidence(%L,%L,ARRAY[%L::uuid],ARRAY[%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),'10000000-0000-4000-8000-000000000001'),'RI_SOURCE_STALE','lateV1displaybindingrefuses');
RESET ROLE;
UPDATE public.job_applications SET employer_archived_at=now() WHERE id=(SELECT app FROM seq WHERE n=1);
UPDATE public.job_applications SET withdrawn_at=now(),status='withdrawn' WHERE id=(SELECT app FROM seq WHERE n=2);
UPDATE public.job_applications SET status='rejected' WHERE id=(SELECT app FROM seq WHERE n=3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(public.rec_ri_profile_change_impact((SELECT job FROM fixture),2)@>'{"received":100,"active":97,"archived":1,"withdrawn":1,"decided":1}', 'historicalandactionablecountsseparate');
SELECT pg_temp.ok(public.rec_ri_next_unreviewed((SELECT employer FROM fixture),(SELECT job FROM fixture))@>'{"remaining":97,"historicalExcluded":3}', 'archivedwithdrawndecidednotrequiredwork');
SELECT pg_temp.fails('SELECT * FROM recruiter_intelligence.profile_change_reviews','permission denied','privateaudittablenotreadable');
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(public.rec_ri_profile_change_impact((SELECT job FROM fixture),2)->>'received'='100','membercanreadscopedimpact');
SELECT pg_temp.fails(format('SELECT public.rec_ri_confirm_reviewed_profile(%L,2,gen_random_uuid(),%L,%L::jsonb,%L)',(SELECT job FROM fixture),'2026-12-01',(SELECT body FROM rules),'new'),'RECRUITMENT_NOT_PERMITTED','membercannotconfirm');
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000004';
SELECT pg_temp.fails(format('SELECT public.rec_ri_profile_change_impact(%L,2)',(SELECT job FROM fixture)),'RECRUITMENT_NOT_PERMITTED','outsidercannotreadimpact');
SELECT pg_temp.fails(format('SELECT public.rec_ri_profile_change_history(%L)',(SELECT job FROM fixture)),'RECRUITMENT_NOT_PERMITTED','outsidercannotreadhistory');
SELECT pg_temp.fails(format('SELECT public.rec_ri_next_unreviewed(%L,%L)',(SELECT employer FROM fixture),(SELECT job FROM fixture)),'RECRUITMENT_NOT_PERMITTED','outsidercannotreadqueue');
SELECT pg_temp.fails(format('SELECT public.rec_ri_page_evidence(%L,%L,ARRAY[%L::uuid],ARRAY[%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),'10000000-0000-4000-8000-000000000001'),'RECRUITMENT_NOT_PERMITTED','outsidercannotreaddisplayevidence');
SELECT pg_temp.fails(format('SELECT public.rec_ri_compare_applications(%L,%L,ARRAY[%L::uuid,%L::uuid])',(SELECT job FROM fixture),(SELECT p->>'profileId' FROM old_profile),(SELECT app FROM seq WHERE n=1),(SELECT app FROM seq WHERE n=60)),'RECRUITMENT_NOT_PERMITTED','outsidercannotcompare');
RESET ROLE;
INSERT INTO public.recruitment_settings(job_id,employer_id,completion_state,completed_at,archived_at)
 SELECT job,employer,'completed',now(),now() FROM fixture;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ee100000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(public.rec_ri_next_unreviewed((SELECT employer FROM fixture),(SELECT job FROM fixture))@>'{"remaining":0,"historicalExcluded":100,"next":null}','archivedrecruitmentnotrequiredqueue');
RESET ROLE;
SELECT pg_temp.fails('UPDATE recruiter_intelligence.profile_change_reviews SET reason=''changed''','RI_HISTORY_IMMUTABLE','ownerSQLcannotrestampaudit');
SELECT pg_temp.fails('TRUNCATE recruiter_intelligence.profile_change_reviews','RI_HISTORY_IMMUTABLE','audittruncateprotected');
SELECT pg_temp.fails('DELETE FROM recruiter_intelligence.profile_change_reviews','RI_HISTORY_IMMUTABLE','auditdeleteprotected');
-- New helper never acquires report writes, stage writes or AI privileges.
SELECT pg_temp.ok((SELECT count(*) FROM public.job_applications WHERE job_id=(SELECT job FROM fixture))=100,'all100retained');
ROLLBACK;
