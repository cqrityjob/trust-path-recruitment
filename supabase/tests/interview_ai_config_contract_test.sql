\set ON_ERROR_STOP on
BEGIN;
\ir employer_report_access_fixture.sql
CREATE FUNCTION pg_temp.ia_config_as(_uid uuid,_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',coalesce(_uid::text,''),true);
 EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
 BEGIN EXECUTE _sql INTO r; EXCEPTION WHEN insufficient_privilege THEN r:='DENIED'; END;
 RESET ROLE; PERFORM set_config('request.jwt.claim.sub','',true); RETURN r;
END $$;
SELECT pg_temp.set_status((SELECT rv FROM rm),'removed');
UPDATE public.scp_interview_ai_config SET ai_enabled=true,transcript_enabled=true,updated_by=(SELECT pa FROM rm);
DO $$ DECLARE u uuid; r text; BEGIN
 FOREACH u IN ARRAY ARRAY[NULL::uuid,(SELECT c1 FROM rm),(SELECT gr FROM rm),(SELECT pm FROM rm),(SELECT rv FROM rm),(SELECT xo FROM rm),(SELECT ow FROM rm)] LOOP
  r:=pg_temp.ia_config_as(u,'SELECT count(*) FROM public.scp_interview_ai_config');
  PERFORM pg_temp.ok(r IN ('0','DENIED'),'ICF1 non-admin cannot read full config or metadata');
  r:=pg_temp.ia_config_as(u,'SELECT updated_by FROM public.scp_interview_ai_config');
  PERFORM pg_temp.ok(r IS NULL OR r='DENIED','ICF2 explicit metadata column hidden');
 END LOOP;
 PERFORM pg_temp.ok(pg_temp.ia_config_as((SELECT pa FROM rm),'SELECT updated_by FROM public.scp_interview_ai_config')=(SELECT pa::text FROM rm),'ICF3 platform admin reads administrative metadata');
 PERFORM pg_temp.ok(pg_temp.ia_config_as((SELECT gr FROM rm),format('SELECT ai_enabled::text FROM public.scp_iv_case_capabilities(%L)',(SELECT case_a FROM rmc)))='true',
  'ICF4 authorised runtime path works without direct config read');
 FOREACH u IN ARRAY ARRAY[(SELECT pa FROM rm),(SELECT ow FROM rm),(SELECT gr FROM rm),(SELECT c1 FROM rm)] LOOP
  PERFORM pg_temp.ok(pg_temp.ia_config_as(u,'UPDATE public.scp_interview_ai_config SET ai_enabled=false RETURNING ai_enabled')='DENIED','ICF5 no client UPDATE including admin');
  PERFORM pg_temp.ok(pg_temp.ia_config_as(u,'DELETE FROM public.scp_interview_ai_config RETURNING id')='DENIED','ICF6 no client DELETE');
  PERFORM pg_temp.ok(pg_temp.ia_config_as(u,'INSERT INTO public.scp_interview_ai_config(id) VALUES(true) RETURNING id')='DENIED','ICF7 no client INSERT');
 END LOOP;
END $$;
SAVEPOINT old_config;
\ir ../rollback/20270207090000_interview_ai_config_contract_rollback.sql
SELECT pg_temp.ok(pg_temp.ia_config_as((SELECT c1 FROM rm),'SELECT updated_by FROM public.scp_interview_ai_config')=(SELECT pa::text FROM rm),
 'ICF8 pre-fix candidate can read administrative actor ID');
ROLLBACK TO old_config;
SELECT pg_temp.ok(pg_temp.ia_config_as((SELECT c1 FROM rm),'SELECT updated_by FROM public.scp_interview_ai_config') IS NULL,'ICF9 negative control undone');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.scp_iv_ai_real_model_permitted()','EXECUTE'),
 'ICF10 internal AI enforcement is not a public capability oracle');
DO $$ BEGIN RAISE NOTICE 'interview_ai_config_contract_test: ALL ASSERTIONS PASSED'; END $$;
ROLLBACK;
