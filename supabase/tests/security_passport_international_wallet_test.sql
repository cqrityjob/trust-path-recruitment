\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
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
SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","identifier":"EXAMPLE-1","issued_on":"2026-01-01","valid_until":"2027-01-01","no_expiry":false}') AS claim_id \gset
SELECT pg_temp.ok((SELECT assertion_level='self_declared' AND jurisdiction_code IS NULL FROM public.sp_claims WHERE id=:'claim_id'),'save never promotes trust; validity is separate from issuance');
SELECT pg_temp.ok((SELECT issuing_country_code IS NULL AND validity_jurisdiction_code IS NULL FROM public.sp_credential_details WHERE claim_id=:'claim_id'),'international fields persisted separately');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"class":"certification","title":"bad","issuer":"x","verified":true}')$q$,'SP_INVALID_CREDENTIAL_INPUT');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"class":"education","title":"bad","issuer":"x"}')$q$,'SP_INVALID_CREDENTIAL_INPUT');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","no_expiry":true,"valid_until":"2027-01-01"}')$q$,'SP_NO_EXPIRY_NOT_APPROVED');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',jsonb_build_object('claim_id',:'claim_id','version',9,'definition_code','INTL_ASIS_CPP')),'SP_STALE_VERSION');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","language":"not a language"}')$q$,'SP_INVALID_CREDENTIAL_INPUT');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE title='must roll back'),'metadata refusal rolls back the whole claim');
SELECT public.sp_save_international_credential(jsonb_build_object('claim_id',:'claim_id','version',1,'definition_code','INTL_ASIS_CPP','identifier','CORRECTED-1')) AS corrected_id \gset
SELECT pg_temp.ok((SELECT lifecycle_state='superseded' FROM public.sp_claims WHERE id=:'claim_id'),'correction preserves superseded history');
SELECT pg_temp.ok((SELECT assertion_level='self_declared' AND version_no=2 FROM public.sp_claims WHERE id=:'corrected_id'),'successor starts without inherited verification');
SELECT set_config('request.jwt.claim.sub','f1900000-0000-4000-8000-000000000002',true);
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',jsonb_build_object('claim_id',:'corrected_id','version',2,'definition_code','INTL_ASIS_CPP')),'SP_NOT_EDITABLE');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE id=:'corrected_id'),'other holder cannot read corrected claim');
RESET ROLE;
-- Real GoTrue session semantics, in addition to the isolated SQL role probes.

INSERT INTO auth.sessions(id,user_id) VALUES ('f1900000-0000-4000-8000-000000000090','f1900000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"f1900000-0000-4000-8000-000000000001","session_id":"f1900000-0000-4000-8000-000000000090"}',true);
SELECT set_config('request.jwt.claim.sub','f1900000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(public.sp_passport_session_active(),'active GoTrue session admitted');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_claims WHERE id=:'corrected_id'),'active session can read own credential');
RESET ROLE;
DELETE FROM auth.sessions WHERE id='f1900000-0000-4000-8000-000000000090';
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(NOT public.sp_passport_session_active(),'revoked JWT session denied despite unexpired signature');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE id=:'corrected_id'),'revoked session cannot read credential through RLS');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"class":"permit","title":"revoked write","issuer":"x"}')$q$,'SP_SESSION_REVOKED');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"f1900000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.ok(NOT public.sp_passport_session_active(),'authenticated JWT without session fails closed');
RESET ROLE;
ROLLBACK;
