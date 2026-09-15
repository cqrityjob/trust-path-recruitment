\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.denied(q text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE NOT IN ('23514','23503','42501','P0001') THEN RAISE; END IF;
   RAISE NOTICE 'ok %',label; RETURN;
 END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;
INSERT INTO auth.users(id,email) VALUES ('fc210000-0000-4000-8000-000000000001','closed-owner@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id) VALUES ('fc210000-0000-4000-8000-000000000001');
CREATE TEMP TABLE catalogue_before AS SELECT (SELECT count(*) FROM public.sp_credential_types) types,
 (SELECT count(*) FROM public.sp_certification_definitions) definitions,(SELECT count(*) FROM public.sp_certification_issuers) issuers;
GRANT SELECT ON catalogue_before TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc210000-0000-4000-8000-000000000001',true);
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"title":"Custom","issuer":"Fake","class":"certification"}')$q$,'custom command rejected');
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"unknown"}')$q$,'unknown definition rejected');
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","issuer":"Fake"}')$q$,'RPC issuer injection rejected');
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","country":"SE"}')$q$,'RPC governed country injection rejected');
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","market_country":"SE"}')$q$,'international definition cannot be filed in a national market');
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"OV","market_country":"GB","valid_until":"2030-01-01"}')$q$,'national definition cannot be filed in another market');
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","no_expiry":true}')$q$,'unapproved no-expiry rejected');
SELECT public.sp_save_international_credential(jsonb_build_object('definition_code',code,'identifier','TEST-'||code,'issued_on','2026-01-01'))
 FROM public.sp_approved_credential_catalogue WHERE code IN ('INTL_ASIS_CPP','INTL_ASIS_PSP','INTL_ASIS_PCI');
SELECT pg_temp.ok((SELECT count(*)=3 AND count(DISTINCT c.credential_code)=3 FROM public.sp_claims c
 JOIN public.sp_certification_definitions d ON d.credential_code=c.credential_code
 JOIN public.sp_certification_issuers i ON i.id=d.issuer_id
 WHERE c.holder_user_id=auth.uid() AND i.issuer_code='ASIS' AND c.claimed_issuer_name=i.display_name),'CPP PSP PCI reuse existing ASIS definitions and issuer');
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.sp_claims WHERE holder_user_id=auth.uid() AND assertion_level='self_declared'),'catalogue selection never verifies holder');
SELECT pg_temp.denied($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,title) VALUES(auth.uid(),'certification','Custom')$q$,'direct custom claim rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_claims SET title='Custom' WHERE holder_user_id=auth.uid()$q$,'direct title tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_claims SET claimed_issuer_name='Fake' WHERE holder_user_id=auth.uid()$q$,'direct issuer tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_claims SET jurisdiction_code='SE' WHERE holder_user_id=auth.uid()$q$,'direct country tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_claims SET sub_jurisdiction_code='AE-DU' WHERE holder_user_id=auth.uid()$q$,'direct region tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_claims SET authorisation_scope='global' WHERE holder_user_id=auth.uid()$q$,'direct scope tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_claims SET credential_code=NULL WHERE holder_user_id=auth.uid()$q$,'definition cannot be detached');
SELECT pg_temp.denied($q$UPDATE public.sp_credential_details SET credential_class='permit'$q$,'detail class tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_credential_details SET original_language='sv'$q$,'detail language tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_credential_details SET issuing_country_code='SE'$q$,'detail country tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_credential_details SET validity_jurisdiction_code='SE'$q$,'detail validity jurisdiction tampering rejected');
SELECT pg_temp.denied($q$UPDATE public.sp_credential_details SET no_expiry=true$q$,'direct no-expiry tampering rejected');
SELECT pg_temp.denied($q$SELECT public.sp_correct_claim(id,'Custom',claimed_issuer_name,NULL,NULL,NULL,NULL,'Test',credential_code,NULL,NULL) FROM public.sp_claims WHERE holder_user_id=auth.uid() LIMIT 1$q$,'legacy correction RPC cannot alter governed name');
DO $$ DECLARE t text; privilege text; BEGIN
 FOREACH t IN ARRAY ARRAY['sp_credential_types','sp_authorities','sp_jurisdictions','sp_sub_jurisdictions','sp_market_packs',
 'sp_credential_scopes','sp_certification_definitions','sp_certification_issuers','sp_certification_issuer_aliases','sp_certification_sources',
 'sp_credential_classes','sp_credential_jurisdictions','sp_credential_definition_metadata','sp_credential_definition_jurisdictions','sp_credential_adapter_mappings'] LOOP
 FOREACH privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
 PERFORM pg_temp.ok(NOT has_table_privilege('authenticated','public.'||t,privilege),t||' denies '||privilege);
 END LOOP; END LOOP;
END $$;
SELECT pg_temp.denied($q$UPDATE public.sp_certification_issuers SET display_name='Fake' WHERE issuer_code='ASIS'$q$,'issuer direct update denied');
SELECT pg_temp.denied($q$INSERT INTO public.sp_authorities(code,jurisdiction_code,name_local,name_en) VALUES('FAKE','SE','Fake','Fake')$q$,'authority direct insert denied');
RESET ROLE;
SELECT pg_temp.ok((SELECT types=(SELECT count(*) FROM public.sp_credential_types) AND definitions=(SELECT count(*) FROM public.sp_certification_definitions) AND issuers=(SELECT count(*) FROM public.sp_certification_issuers) FROM catalogue_before),'claim flow inserts zero catalogue or issuer rows');
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.sp_passport_complete_first_merit('fc210000-0000-4000-8000-000000000099','certification','Custom','Fake',NULL,NULL,NULL,true)$q$,'legacy onboarding RPC cannot create a custom credential');
RESET ROLE;
-- Administrator approval only inside this rolled-back local test.
UPDATE public.sp_credential_types SET allows_no_expiry=true WHERE code='INTL_ASIS_APP';
SET LOCAL ROLE authenticated;
SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_APP","no_expiry":true}') AS no_expiry_claim \gset
SELECT pg_temp.ok((SELECT no_expiry FROM public.sp_credential_details WHERE claim_id=:'no_expiry_claim'),'explicit administrator-approved no-expiry accepted');
SELECT public.sp_save_international_credential('{"definition_code":"OV","market_country":"SE","valid_until":"2030-01-01"}') AS national_claim \gset
SELECT pg_temp.ok((SELECT jurisdiction_code='SE' AND claimed_issuer_name='Polismyndigheten' FROM public.sp_claims WHERE id=:'national_claim'),'national definition uses its existing governed authority and country');
RESET ROLE;
UPDATE public.sp_credential_types SET is_active=false WHERE code='INTL_ASIS_CPP';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP"}')$q$,'inactive definition rejected');
RESET ROLE;
UPDATE public.sp_credential_types SET is_active=true WHERE code='INTL_ASIS_CPP';
INSERT INTO public.sp_credential_definition_metadata(credential_code,credential_class,original_name,deprecated_at)
 VALUES('INTL_ASIS_CPP','certification','Certified Protection Professional (CPP)',now());
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP"}')$q$,'deprecated definition rejected');
RESET ROLE;
UPDATE public.sp_certification_definitions SET retired_on=current_date WHERE credential_code='INTL_ASIS_PCI';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_PCI"}')$q$,'retired definition rejected');
RESET ROLE;
UPDATE public.sp_certification_issuers SET is_active=false WHERE issuer_code='ASIS';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_PSP"}')$q$,'inactive issuer rejected');
RESET ROLE;
ROLLBACK;
