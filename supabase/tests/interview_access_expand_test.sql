-- Real RLS and case gate; synthetic principals only. Everything rolls back.
\set ON_ERROR_STOP on
BEGIN;
\ir employer_report_access_fixture.sql
CREATE FUNCTION pg_temp.ia_as(_uid uuid, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',coalesce(_uid::text,''),true);
 EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
 BEGIN EXECUTE _sql INTO r; EXCEPTION WHEN insufficient_privilege THEN r := 'DENIED'; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
 RETURN r;
END $$;
CREATE FUNCTION pg_temp.ia_caps(_uid uuid,_case uuid) RETURNS text LANGUAGE sql AS $$
 SELECT pg_temp.ia_as(_uid,format('SELECT row_to_json(c)::text FROM public.scp_iv_case_capabilities(%L) c',_case));
$$;
SELECT pg_temp.set_status((SELECT rv FROM rm),'removed');
SELECT pg_temp.set_status((SELECT su FROM rm),'suspended');
INSERT INTO auth.users(id,email) VALUES ('e5a10000-0000-4000-8000-000000000001','ia-author@synthetic.invalid');
INSERT INTO public.scp_content_roles(user_id,role) VALUES ('e5a10000-0000-4000-8000-000000000001','editor');
UPDATE public.scp_interview_ai_config SET ai_enabled=true,transcript_enabled=true,updated_by=(SELECT pa FROM rm);

DO $$ DECLARE u uuid; BEGIN
 FOREACH u IN ARRAY ARRAY[(SELECT ow FROM rm),(SELECT gr FROM rm),(SELECT cr FROM rm),(SELECT pn FROM rm),(SELECT r1 FROM rm)] LOOP
  PERFORM pg_temp.ok(pg_temp.ia_caps(u,(SELECT case_a FROM rmc))::jsonb = '{"ai_enabled":true,"transcript_enabled":true}'::jsonb,
    'IA1 authorised owner/reviewer/creator/panel/recruiter gets exactly two flags');
 END LOOP;
 FOREACH u IN ARRAY ARRAY[NULL::uuid,(SELECT c1 FROM rm),(SELECT pm FROM rm),(SELECT rv FROM rm),(SELECT su FROM rm),(SELECT xo FROM rm),(SELECT gw FROM rm)] LOOP
  PERFORM pg_temp.ok(pg_temp.ia_caps(u,(SELECT case_a FROM rmc)) = 'DENIED',
    'IA2 anon/candidate/colleague/removed/suspended/company B/wrong-scope reviewer denied');
 END LOOP;
 PERFORM pg_temp.ok(pg_temp.ia_caps((SELECT ow FROM rm),NULL)='DENIED'
  AND pg_temp.ia_caps((SELECT ow FROM rm),'00000000-0000-4000-8000-000000000001')='DENIED',
  'IA3 null and nonexistent case denied identically');
 PERFORM pg_temp.ok(pg_temp.ia_caps((SELECT sm FROM rm),(SELECT case_b FROM rmc))='DENIED',
  'IA4 employer admin who is the subject is denied');
END $$;
-- An already issued caller identity loses its capability when membership ends.
SELECT pg_temp.set_status((SELECT pn FROM rm),'removed');
SELECT pg_temp.ok(pg_temp.ia_caps((SELECT pn FROM rm),(SELECT case_a FROM rmc))='DENIED','IA5 removed panel member loses access immediately');

SAVEPOINT missing_config;
DELETE FROM public.scp_interview_ai_config;
SELECT pg_temp.ok(pg_temp.ia_caps((SELECT ow FROM rm),(SELECT case_a FROM rmc))::jsonb = '{"ai_enabled":false,"transcript_enabled":false}'::jsonb,
 'IA6 missing singleton fails closed');
ROLLBACK TO missing_config;

-- Both modes at draft and published status: none becomes a candidate read.
INSERT INTO public.scp_scenarios(id,slug) VALUES ('e5a10000-1111-4000-8000-000000000001','ia-synthetic');
INSERT INTO public.scp_scenario_versions(scenario_id,version_number,mode,content_status,situation_sv,situation_en)
SELECT 'e5a10000-1111-4000-8000-000000000001',row_number() OVER ()::integer,m,s,'Intern syntetisk situation','Internal synthetic situation'
 FROM unnest(ARRAY['learning','assessment']) m CROSS JOIN unnest(ARRAY['draft','published']) s;
-- Real employer-owned module links, not labels masquerading as tenancy.
DO $ DECLARE pr uuid; pv uuid; m uuid; mv uuid; employer uuid; idx integer:=0; BEGIN
 INSERT INTO public.scp_programs(slug) VALUES('ia-private-program') RETURNING id INTO pr;
 INSERT INTO public.scp_program_versions(program_id,version_number,name_sv,name_en,purpose_sv,purpose_en)
 VALUES(pr,1,'Intern','Internal','Syntetisk','Synthetic') RETURNING id INTO pv;
 FOREACH employer IN ARRAY ARRAY[(SELECT e FROM rm),(SELECT x FROM rm)] LOOP
  idx:=idx+1;
  INSERT INTO public.scp_modules(slug,owner_employer_id) VALUES('ia-private-module-'||idx,employer) RETURNING id INTO m;
  INSERT INTO public.scp_module_versions(module_id,program_version_id,version_number,display_order,name_sv,name_en,summary_sv,summary_en)
  VALUES(m,pv,1,idx,'Intern','Internal','Syntetisk','Synthetic') RETURNING id INTO mv;
  UPDATE public.scp_scenario_versions SET module_version_id=mv
   WHERE scenario_id='e5a10000-1111-4000-8000-000000000001' AND mode=CASE idx WHEN 1 THEN 'learning' ELSE 'assessment' END;
 END LOOP;
END $;
DO $ DECLARE u uuid; r text; BEGIN
 FOREACH u IN ARRAY ARRAY[NULL::uuid,(SELECT c1 FROM rm),(SELECT ow FROM rm),(SELECT gr FROM rm),(SELECT pm FROM rm),(SELECT rv FROM rm),(SELECT xo FROM rm)] LOOP
  r:=pg_temp.ia_as(u,'SELECT count(*) FROM public.scp_scenario_versions');
  PERFORM pg_temp.ok(r IN ('0','DENIED'),'IA7 raw scenario bank denied across modes/statuses');
 END LOOP;
 FOREACH u IN ARRAY ARRAY[(SELECT pa FROM rm),'e5a10000-0000-4000-8000-000000000001'::uuid] LOOP
  PERFORM pg_temp.ok(pg_temp.ia_as(u,'SELECT count(*) FROM public.scp_scenario_versions')='4','IA8 platform admin/content author can read raw bank');
 END LOOP;
END $$;
-- True negative control: restore the old permissive policy and observe the leak
-- with exactly the same unprivileged read (published-only would still fail IA7).
SAVEPOINT old_scenario;
ALTER POLICY scp_scenario_versions_read ON public.scp_scenario_versions USING (true);
SELECT pg_temp.ok(pg_temp.ia_as((SELECT c1 FROM rm),'SELECT count(*) FROM public.scp_scenario_versions')='4',
 'IA9 pre-fix candidate reads all four internal draft/published scenarios');
ROLLBACK TO old_scenario;
SELECT pg_temp.ok(pg_temp.ia_as((SELECT c1 FROM rm),'SELECT count(*) FROM public.scp_scenario_versions')='0','IA10 negative control restored');

SELECT pg_temp.ok(NOT has_function_privilege('anon','public.scp_iv_case_capabilities(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','scp_private.case_capabilities(uuid)','EXECUTE')
 AND NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.scp_iv_case_capabilities(uuid)'::regprocedure),
 'IA11 anon refused, public RPC is invoker, private implementation gated');
SELECT pg_temp.ok((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND qual='true'
 AND tablename IN ('sp_credential_definition_versions','sp_recognition_policies','sp_credential_scopes','sp_credential_organisation_roles','sp_credential_definition_reviews'))=5,
 'IA12 five shared catalogue policies preserved');
-- Inherited vetting restriction must also apply to the new capability route.
SAVEPOINT vetting;
CREATE OR REPLACE FUNCTION public.bcp_case_vetting_restricted(_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $ SELECT _case_id=(SELECT case_a FROM pg_temp.rmc); $;
SELECT pg_temp.ok(pg_temp.ia_caps((SELECT ow FROM rm),(SELECT case_a FROM rmc))='DENIED',
 'IA13 vetting restriction narrows owner capability access');
ROLLBACK TO vetting;

-- Mutant helper: bypassing case authority must produce an observable leak.
SAVEPOINT unscoped_rpc;
CREATE OR REPLACE FUNCTION scp_private.case_capabilities(_case_id uuid)
RETURNS TABLE(ai_enabled boolean, transcript_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $ SELECT c.ai_enabled,c.transcript_enabled FROM public.scp_interview_ai_config c; $;
SELECT pg_temp.ok(pg_temp.ia_caps((SELECT c1 FROM rm),(SELECT case_a FROM rmc))::jsonb =
 '{"ai_enabled":true,"transcript_enabled":true}'::jsonb,'IA14 missing case guard mutant exposes flags to candidate');
ROLLBACK TO unscoped_rpc;
SELECT pg_temp.ok(pg_temp.ia_caps((SELECT c1 FROM rm),(SELECT case_a FROM rmc))='DENIED','IA15 case guard restored');
DO $ BEGIN RAISE NOTICE 'interview_access_expand_test: ALL ASSERTIONS PASSED'; END $;
ROLLBACK;
