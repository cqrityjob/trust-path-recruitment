\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text,needle text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
 IF position(needle IN SQLERRM)=0 THEN RAISE; END IF;
 RAISE NOTICE 'ok refused %',needle; RETURN; END;
 RAISE EXCEPTION 'ASSERTION FAILED: accepted %',needle; END $$;
INSERT INTO auth.users(id,email) VALUES
 ('f1900000-0000-4000-8000-000000000001','wallet-one@fixture.invalid'),
 ('f1900000-0000-4000-8000-000000000002','wallet-two@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id) VALUES ('f1900000-0000-4000-8000-000000000001'), ('f1900000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f1900000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential('{"class":"permit","title":"Original permit","issuer":"Self-reported issuer","country":"SE","validity_jurisdiction":"GB","language":"en","identifier":"EXAMPLE-1","issued_on":"2026-01-01","valid_until":"2027-01-01","no_expiry":false}') AS claim_id \gset
SELECT pg_temp.ok((SELECT assertion_level='self_declared' AND jurisdiction_code='GB' FROM public.sp_claims WHERE id=:'claim_id'),'save never promotes trust; validity is separate from issuance');
SELECT pg_temp.ok((SELECT issuing_country_code='SE' AND validity_jurisdiction_code='GB' FROM public.sp_credential_details WHERE claim_id=:'claim_id'),'international fields persisted separately');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"class":"certification","title":"bad","issuer":"x","verified":true}')$q$,'SP_INVALID_CREDENTIAL_INPUT');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"class":"education","title":"bad","issuer":"x"}')$q$,'SP_INVALID_CREDENTIAL_INPUT');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"class":"certification","title":"bad","issuer":"x","no_expiry":true,"valid_until":"2027-01-01"}')$q$,'SP_EXPIRY_CONFLICT');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',jsonb_build_object('claim_id',:'claim_id','version',9,'class','permit','title','New name','issuer','x')),'SP_STALE_VERSION');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"class":"certification","title":"must roll back","issuer":"x","language":"not a language"}')$q$,'check constraint');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE title='must roll back'),'metadata refusal rolls back the whole claim');
SELECT public.sp_save_international_credential(jsonb_build_object('claim_id',:'claim_id','version',1,'class','permit','title','Corrected permit','issuer','New issuer','country','SE','validity_jurisdiction','GB','language','en')) AS corrected_id \gset
SELECT pg_temp.ok((SELECT lifecycle_state='superseded' FROM public.sp_claims WHERE id=:'claim_id'),'correction preserves superseded history');
SELECT pg_temp.ok((SELECT assertion_level='self_declared' AND version_no=2 FROM public.sp_claims WHERE id=:'corrected_id'),'successor starts without inherited verification');
SELECT set_config('request.jwt.claim.sub','f1900000-0000-4000-8000-000000000002',true);
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',jsonb_build_object('claim_id',:'corrected_id','version',2,'class','permit','title','stolen','issuer','x')),'SP_NOT_EDITABLE');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE id=:'corrected_id'),'other holder cannot read corrected claim');
RESET ROLE;
ROLLBACK;
