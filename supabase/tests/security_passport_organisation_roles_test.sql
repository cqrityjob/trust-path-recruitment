\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.denied(q text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok %',label; RETURN; END;
 RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_approved_credential_catalogue d LEFT JOIN public.sp_credential_definition_reviews r ON r.credential_code=d.code WHERE r.credential_code IS NULL),'every selectable definition audited');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_credential_types d LEFT JOIN public.sp_credential_definition_reviews r ON r.credential_code=d.code WHERE d.is_active AND r.credential_code IS NULL),'every active definition audited');
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.sp_credential_organisation_roles r JOIN public.sp_certification_issuers i ON i.id=r.certification_issuer_id JOIN public.sp_certification_definitions d ON d.credential_code=r.credential_code AND d.issuer_id=i.id WHERE r.role='issuer' AND r.credential_code IN ('INTL_ASIS_CPP','INTL_ASIS_PSP','INTL_ASIS_PCI') AND i.issuer_code='ASIS'),'ASIS existing identities reused');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.sp_credential_organisation_roles WHERE credential_code IN ('VU1','VU2') AND role='issuer' AND document_specific AND authority_id IS NULL),'VU issuer not falsely attributed to Police');
SELECT pg_temp.ok((SELECT count(*)=8 FROM public.sp_credential_organisation_roles r JOIN public.sp_authorities a ON a.id=r.authority_id WHERE r.credential_code LIKE 'UK_SIA_LICENCE_%' AND role='issuer' AND a.code='GB_SIA'),'eight SIA licence issuers correct');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_credential_types WHERE code LIKE 'UK_%' AND is_active),'UK market remains inactive');
SELECT pg_temp.ok((SELECT count(*)=2 FROM pg_class WHERE oid IN ('public.sp_credential_organisation_roles'::regclass,'public.sp_credential_definition_reviews'::regclass) AND relrowsecurity AND relforcerowsecurity),'both governed tables force RLS');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.sp_credential_payload_v2(uuid,uuid[],text[],text,text,timestamptz,timestamptz)','EXECUTE'),'private payload remains inaccessible');
INSERT INTO auth.users(id,email) VALUES ('fa230000-0000-4000-8000-000000000001','roles-owner@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id) VALUES ('fa230000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa230000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","identifier":"PRIVATE-ROLE-TEST"}');
RESET ROLE;
SELECT pg_temp.ok((SELECT public.sp_credential_payload_v2(holder_user_id,ARRAY[id],ARRAY[]::text[],'preview','en',now()+interval '1 day',now()) #>> '{verified_claims,0,issuer}'='ASIS International' FROM public.sp_claims WHERE holder_user_id='fa230000-0000-4000-8000-000000000001'),'recipient issuer resolved from existing governed identity');
SELECT pg_temp.ok((SELECT public.sp_credential_payload_v2(holder_user_id,ARRAY[id],ARRAY[]::text[],'preview','en',now()+interval '1 day',now()) #>> '{verified_claims,0,credential_identifier}' IS NULL FROM public.sp_claims WHERE holder_user_id='fa230000-0000-4000-8000-000000000001'),'recipient identifier remains opt-in');
-- Simulate the existing verification workflow context; never grant it to a client.
SELECT set_config('sp.verification_context','on',true);
UPDATE public.sp_claims SET lifecycle_state='revoked' WHERE holder_user_id='fa230000-0000-4000-8000-000000000001';
SELECT pg_temp.ok((SELECT public.sp_credential_payload_v2(holder_user_id,ARRAY[id],ARRAY[]::text[],'preview','en',now()+interval '1 day',now()) #>> '{verified_claims,0,lifecycle}'='revoked' FROM public.sp_claims WHERE holder_user_id='fa230000-0000-4000-8000-000000000001'),'pinned selection shows subsequent revocation');
SELECT pg_temp.ok((SELECT jsonb_array_length(public.sp_credential_payload_v2(holder_user_id,ARRAY[]::uuid[],ARRAY[]::text[],'preview','en',now()+interval '1 day',now())->'verified_claims')=0 FROM public.sp_claims WHERE holder_user_id='fa230000-0000-4000-8000-000000000001'),'revocation never discloses an unselected claim');
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*)>0 FROM public.sp_credential_organisation_roles),'candidate can read governed role facts');
SELECT pg_temp.denied($q$UPDATE public.sp_credential_organisation_roles SET document_specific=true$q$,'candidate cannot change organisation roles');
SELECT pg_temp.denied($q$DELETE FROM public.sp_credential_definition_reviews$q$,'candidate cannot delete audit');
SELECT pg_temp.denied($q$INSERT INTO public.sp_credential_definition_reviews VALUES ('INTL_ASIS_CPP','investigation','https://fake.invalid',current_date,'fake','fake')$q$,'candidate cannot create catalogue review');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.denied($q$SELECT * FROM public.sp_credential_organisation_roles$q$,'anonymous cannot read internal catalogue role table');
RESET ROLE;
ROLLBACK;
