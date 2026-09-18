-- DEPLOYMENT COMPATIBILITY — the NEW application against the OLD database.
--
-- db-test.sh runs this ONLY in the rolled-back state, i.e. with the catalogue
-- view, the save RPC and the guard exactly as the owner project has them BEFORE
-- 20261126090000 is applied. It answers one question: what happens if the new
-- application reaches a database that has not received the migration yet?
--
--   1. The old view lists no scoped and no document-issuer definition, so the new
--      wizard — which offers only what the view returns — cannot select one.
--   2. If a scope or an issuer is sent anyway, the old RPC REFUSES the whole
--      request. It does not save the credential and drop the field: a required
--      scope or issuer is never silently discarded.
--   3. An ordinary save, which carries neither key, works exactly as before.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF position(needle IN SQLERRM)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % refused for another reason: %',label,SQLERRM; END IF;
   RAISE NOTICE 'ok %',label; RETURN;
 END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;
INSERT INTO auth.users(id,email) VALUES ('fc270000-0000-4000-8000-000000000001','old-rpc-compat@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id) VALUES ('fc270000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc270000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE code IN ('SV','VU1','VU2')),
 'old database: no scoped and no document-issuer definition is offered, so the new wizard cannot select one');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"OV","market_country":"SE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2030-01-01","no_expiry":false,"authorisation_scope":"Skyddsobjekt A"}')$q$,
 'SP_INVALID_CREDENTIAL_INPUT','old database: a request carrying a scope is REFUSED whole, never saved without it');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"OV_TRAINING","market_country":"SE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"","no_expiry":false,"issuer_name":"Fiktiv Utbildning AB"}')$q$,
 'SP_INVALID_CREDENTIAL_INPUT','old database: a request carrying a stated issuer is REFUSED whole, never saved without it');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_claims WHERE holder_user_id=auth.uid()),'the two refusals stored nothing');
SELECT public.sp_save_international_credential('{"definition_code":"OV","market_country":"SE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2030-01-01","no_expiry":false}') AS ov \gset
SELECT pg_temp.ok((SELECT credential_code='OV' AND claimed_issuer_name='Polismyndigheten' FROM public.sp_claims WHERE id=:'ov'),
 'old database: an ordinary save, which carries neither key, works exactly as before');
ROLLBACK;
