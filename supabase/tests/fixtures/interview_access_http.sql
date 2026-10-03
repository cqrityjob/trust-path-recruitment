-- Local disposable PostgreSQL only. Synthetic data committed for HTTP probes.
-- Caller must create a fresh replay database before loading this once.
\set ON_ERROR_STOP on
BEGIN;
\ir ../employer_report_access_fixture.sql
SELECT pg_temp.set_status((SELECT rv FROM rm),'removed');
SELECT pg_temp.set_status((SELECT su FROM rm),'suspended');
INSERT INTO auth.users(id,email) VALUES ('e5a10000-0000-4000-8000-000000000001','ia-author@synthetic.invalid');
INSERT INTO public.scp_content_roles(user_id,role) VALUES ('e5a10000-0000-4000-8000-000000000001','editor');
UPDATE public.scp_interview_ai_config SET ai_enabled=true,transcript_enabled=true,updated_by=(SELECT pa FROM rm);
INSERT INTO public.scp_scenarios(id,slug) VALUES ('e5a10000-1111-4000-8000-000000000001','ia-synthetic');
INSERT INTO public.scp_scenario_versions(scenario_id,version_number,mode,content_status,situation_sv,situation_en)
SELECT 'e5a10000-1111-4000-8000-000000000001',row_number() OVER ()::integer,m,s,'Intern syntetisk situation','Internal synthetic situation'
 FROM unnest(ARRAY['learning','assessment']) m CROSS JOIN unnest(ARRAY['draft','published']) s;
-- Restore the test fixture's temporary extra grant before testing real APIs.
DO $$ BEGIN
 IF NOT (SELECT auth_select FROM rm_before) THEN REVOKE SELECT ON public.scp_report_snapshots FROM authenticated; END IF;
END $$;
-- Separate in-progress assigned-attempt delivery fixture; no real candidate.
INSERT INTO public.scp_attempts(id,subject_id,mode,form_id,assessment_version_id,jurisdiction_id,scoring_model_version,status,governance_mode,option_order_seed)
SELECT 'e5a10000-3333-4000-8000-000000000001',(SELECT subject_id FROM public.scp_subject_identities WHERE user_id=(SELECT c1 FROM rm)),'assessment',f.id,f.assessment_version_id,
 (SELECT id FROM public.scp_jurisdictions WHERE code='SE'),'det-v1','in_progress','closed_test',101
 FROM public.scp_forms f WHERE f.slug='security-officer-recruitment-form-a';
SELECT jsonb_build_object('actors',to_jsonb(rm),'cases',to_jsonb(rmc),'author','e5a10000-0000-4000-8000-000000000001',
 'attempt','e5a10000-3333-4000-8000-000000000001') FROM rm CROSS JOIN rmc;
COMMIT;
