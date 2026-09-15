\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok %',label; RETURN; END;
 RAISE EXCEPTION 'ASSERTION FAILED: % was allowed',label;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('f1800000-0000-4000-8000-000000000001','international-one@fixture.invalid'),
 ('f1800000-0000-4000-8000-000000000002','international-two@fixture.invalid');
SELECT pg_temp.ok((SELECT count(*)=7 FROM public.sp_credential_classes),'seven international classes');
SELECT pg_temp.ok(NOT public.sp_is_passport_credential('education',NULL),'education excluded');
SELECT pg_temp.ok(NOT public.sp_is_passport_credential('training',NULL),'generic course excluded');
SELECT pg_temp.ok(public.sp_is_passport_credential('training','VU1'),'governed training included');
SELECT pg_temp.ok(NOT has_table_privilege('anon','public.sp_credential_details','SELECT'),'anon cannot read details');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.sp_evidence_extractions','INSERT'),'holder cannot insert machine extraction');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.sp_credential_definition_metadata','INSERT'),'holder cannot govern definitions');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f1800000-0000-4000-8000-000000000001',true);
INSERT INTO public.sp_claims(id,holder_user_id,claim_type,title,claimed_issuer_name,issued_on)
 VALUES ('f1800000-0000-4000-8000-000000000011','f1800000-0000-4000-8000-000000000001','certification','Original credential title','Unverified issuer','2026-01-01');
INSERT INTO public.sp_credential_details(claim_id,credential_class,original_language,issuing_country_code,no_expiry)
 VALUES ('f1800000-0000-4000-8000-000000000011','certification','en','SE',true);
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_credential_details),'holder reads own details');
SELECT pg_temp.refused($q$UPDATE public.sp_claims SET assertion_level='verified' WHERE id='f1800000-0000-4000-8000-000000000011'$q$,'holder cannot verify claim');
SELECT pg_temp.refused($q$UPDATE public.sp_credential_details SET issuing_jurisdiction_code='GB',issuing_country_code='SE' WHERE claim_id='f1800000-0000-4000-8000-000000000011'$q$,'country and jurisdiction cannot contradict');
SELECT pg_temp.refused($q$UPDATE public.sp_credential_details SET validity_jurisdiction_code='GB' WHERE claim_id='f1800000-0000-4000-8000-000000000011'$q$,'metadata cannot contradict claim validity');
SELECT pg_temp.refused($q$UPDATE public.sp_claims SET valid_until='2030-01-01' WHERE id='f1800000-0000-4000-8000-000000000011'$q$,'no-expiry metadata prevents contradictory expiry write');
SELECT set_config('request.jwt.claim.sub','f1800000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_credential_details),'other holder cannot read details');
SELECT pg_temp.refused($q$INSERT INTO public.sp_credential_details(claim_id,credential_class) VALUES ('f1800000-0000-4000-8000-000000000011','permit')$q$,'other holder cannot attach metadata');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=7 FROM pg_class WHERE relname IN ('sp_credential_classes','sp_credential_jurisdictions','sp_credential_definition_metadata','sp_credential_definition_jurisdictions','sp_credential_adapter_mappings','sp_credential_details','sp_evidence_extractions') AND relrowsecurity),'all seven tables enable RLS');
SELECT pg_temp.refused('DROP TABLE public.sp_claims','core claim dependency protected');
ROLLBACK;
