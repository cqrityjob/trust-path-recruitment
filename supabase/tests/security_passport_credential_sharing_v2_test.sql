\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text,needle text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN IF position(needle IN SQLERRM)=0 THEN RAISE; END IF;
 RAISE NOTICE 'ok refused %',needle; RETURN; END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',needle; END $$;
INSERT INTO auth.users(id,email) VALUES
 ('f2000000-0000-4000-8000-000000000001','share-owner@fixture.invalid'),
 ('f2000000-0000-4000-8000-000000000002','share-other@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,privacy_mode) VALUES('f2000000-0000-4000-8000-000000000001','full_name');
UPDATE public.profiles SET display_name='Canonical Name' WHERE id='f2000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential('{"class":"permit","title":"Permit original","issuer":"Reported authority","country":"SE","validity_jurisdiction":"GB","identifier":"PRIVATE-123","valid_until":"2020-01-01"}') AS claim_id \gset
INSERT INTO public.sp_claims(holder_user_id,claim_type,title) VALUES(auth.uid(),'education','Unrelated CV') RETURNING id AS cv_id \gset
SELECT pg_temp.refused(format('SELECT public.sp_preview_credential_disclosure_v2(ARRAY[%L]::uuid[],ARRAY[]::text[],7,NULL,''en'')',:'cv_id'),'SP_CREDENTIAL_NOT_SHAREABLE');
SELECT pg_temp.refused(format('SELECT public.sp_preview_credential_disclosure_v2(ARRAY[%L]::uuid[],ARRAY[''evidence''],7,NULL,''en'')',:'claim_id'),'SP_INVALID_CREDENTIAL_SELECTION');
SELECT pg_temp.refused(format('SELECT public.sp_preview_credential_disclosure_v2(ARRAY[%L]::uuid[],ARRAY[]::text[],365,NULL,''en'')',:'claim_id'),'SP_');
SELECT public.sp_create_credential_disclosure_v2(ARRAY[:'claim_id']::uuid[],'{}',7,NULL,NULL,'en','f2000000-0000-4000-8000-000000000099') AS result \gset
SELECT (:'result'::jsonb->>'disclosure_id') AS disclosure_id \gset
SELECT (:'result'::jsonb->>'token') AS share_token \gset
SELECT pg_temp.ok((public.sp_create_credential_disclosure_v2(ARRAY[:'claim_id']::uuid[],'{}',7,NULL,NULL,'en','f2000000-0000-4000-8000-000000000099')->>'status')='already_created','same request produces one share');
SELECT pg_temp.refused(format('SELECT public.sp_create_credential_disclosure_v2(ARRAY[%L]::uuid[],ARRAY[''holder_name''],7,NULL,NULL,''en'',''f2000000-0000-4000-8000-000000000099'')',:'claim_id'),'SP_REQUEST_KEY_CONFLICT');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_credential_share_events WHERE disclosure_id=:'disclosure_id'),'creation audited without tokens');
SELECT pg_temp.refused(format('UPDATE public.sp_credential_disclosure_policy SET permitted_fields=ARRAY[''identifier''] WHERE disclosure_id=%L',:'disclosure_id'),'permission denied');
RESET ROLE;
SELECT public.sp_get_disclosure(:'share_token') AS payload \gset
SELECT pg_temp.ok((:'payload'::jsonb->>'schema_version')='2' AND (:'payload'::jsonb->'holder')='null'::jsonb,'v2 defaults anonymous');
SELECT pg_temp.ok(jsonb_array_length(:'payload'::jsonb->'verified_claims')=1 AND jsonb_array_length(:'payload'::jsonb->'verified_experience')=0,'recipient gets only selected credential');
SELECT pg_temp.ok(:'payload' NOT LIKE '%PRIVATE-123%' AND :'payload' NOT LIKE '%Unrelated CV%' AND :'payload' NOT LIKE '%storage%' AND :'payload' NOT LIKE '%'||:'claim_id'||'%','no private identifiers CV evidence paths or internal claim IDs');
SELECT pg_temp.ok(:'payload'::jsonb#>>'{verified_claims,0,lifecycle}'='expired','calendar expiry cannot appear active');
SET LOCAL ROLE authenticated;
SELECT public.sp_preview_credential_disclosure_v2(ARRAY[:'claim_id']::uuid[],ARRAY['holder_name','identifier'],7,NULL,'en') AS preview \gset
SELECT pg_temp.ok(:'preview'::jsonb->>'holder'='Canonical Name' AND :'preview'::jsonb#>>'{verified_claims,0,credential_identifier}'='PRIVATE-123','explicit fields disclose canonical name and identifier');
SELECT public.sp_replace_selected_disclosure(:'disclosure_id',false,'f2000000-0000-4000-8000-000000000098') AS replacement \gset
SELECT pg_temp.ok((SELECT permitted_fields='{}' FROM public.sp_credential_disclosure_policy WHERE disclosure_id=(:'replacement'::jsonb->>'disclosure_id')::uuid),'direct legacy reissue preserves v2 privacy');
SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_credential_disclosure_policy),'cross-owner policies hidden');
SELECT pg_temp.refused(format('SELECT public.sp_preview_credential_disclosure_v2(ARRAY[%L]::uuid[],ARRAY[]::text[],7,NULL,''en'')',:'claim_id'),'SP_CREDENTIAL_NOT_SHAREABLE');
SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
SELECT public.sp_revoke_disclosure(:'disclosure_id');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_credential_share_events WHERE disclosure_id=:'disclosure_id' AND event_type='revoked'),'revocation audited');
RESET ROLE;
SELECT pg_temp.ok(public.sp_get_disclosure(:'share_token')->>'status'='unavailable','revoked token immediately unavailable');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.sp_credential_payload_v2(uuid,uuid[],text[],text,text,timestamptz,timestamptz)','EXECUTE'),'private builder inaccessible to holders');
-- A issued session must recheck the package every time, not trust the cookie.
INSERT INTO public.sp_share_sessions(disclosure_id,session_hash,expires_at)
 VALUES(:'disclosure_id',encode(digest(repeat('d',64),'sha256'),'hex'),now()+interval '20 minutes');
SELECT pg_temp.ok(public.sp_get_disclosure_session(repeat('d',64))->>'status'='unavailable','revoked package invalidates existing session');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_credential_share_events WHERE disclosure_id=:'disclosure_id' AND event_type='denied'),'known denied session audited without token');
SELECT (:'replacement'::jsonb->>'disclosure_id') AS replacement_id \gset
INSERT INTO public.sp_share_sessions(disclosure_id,session_hash,expires_at)
 VALUES(:'replacement_id',encode(digest(repeat('e',64),'sha256'),'hex'),now()+interval '20 minutes');
SELECT pg_temp.ok(public.sp_get_disclosure_session(repeat('e',64))->>'status'='active','active v2 session reads through same payload');
UPDATE public.sp_disclosures SET expires_at=now()-interval '1 second' WHERE id=:'replacement_id';
SELECT pg_temp.ok(public.sp_get_disclosure_session(repeat('e',64))->>'status'='unavailable','expired package invalidates live session');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_credential_share_events WHERE disclosure_id=:'replacement_id' AND event_type='expiry_observed'),'observed expiry audited');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_credential_share_events WHERE row_to_json(sp_credential_share_events)::text LIKE '%'||repeat('e',64)||'%'),'audit stores no session secrets');
SET LOCAL ROLE authenticated;
SELECT public.sp_save_international_credential(jsonb_build_object('claim_id',:'claim_id','version',1,'class','permit','title','Corrected credential','issuer','Reported authority','country','SE','validity_jurisdiction','GB')) AS successor \gset
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_credential_share_events WHERE disclosure_id=:'replacement_id' AND event_type='claim_changed'),'correction affecting a selected credential audited');
RESET ROLE;
SELECT pg_temp.ok(jsonb_array_length(public.sp_credential_payload_v2('f2000000-0000-4000-8000-000000000001',ARRAY[:'claim_id']::uuid[],'{}',NULL,'en',now()+interval '1 day',now())->'verified_claims')=0,'superseded selected claim removed without broadening scope');
SELECT pg_temp.ok(to_regprocedure('public.sp_get_disclosure_session_v1(text)') IS NULL,'no legacy session helper bypasses audit');

ROLLBACK;
