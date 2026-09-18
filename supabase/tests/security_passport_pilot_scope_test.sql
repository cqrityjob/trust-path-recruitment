-- Security Passport — pilot registration (GB, Dubai) and disclosed definition
-- scope, as the database enforces them.
--
-- Ported from scripts/passport-live-local-journey-check.mjs (the browser-side
-- proof against a live local stack) so that CI's migration replay proves the
-- same four things on every push:
--
--   1. an ENTITLED GB or Dubai pilot member sees their market's approved
--      definitions in the closed catalogue, saves through the real RPC and
--      reads the credential back with the right jurisdiction;
--   2. a NON-MEMBER, a session without a subject, a member of the OTHER
--      market and a REVOKED member are all refused — catalogue and RPC;
--   3. a disclosed package carries each credential's governed scope_code
--      (global / national / NULL = unknown) and ONLY the selected credentials;
--   4. (in db-test.sh) both 20261124090000 and 20261125090000 roll back and
--      reapply, with this suite green on either side.
--
-- Everything is inside one transaction and rolled back. The entitlement rows
-- are written directly, as a platform administrator would grant them in
-- production; everything downstream — access, catalogue, write, readback,
-- disclosure — is the real path under `authenticated`, and the recipient
-- reads through the share session, exactly as the gateway does.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
-- Refused FOR THE STATED REASON: a refusal with another message is a failure,
-- so a broken fixture cannot pass as a correct rejection.
CREATE FUNCTION pg_temp.refused(q text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF position(needle IN SQLERRM)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % refused for another reason: %',label,SQLERRM; END IF;
   RAISE NOTICE 'ok %',label; RETURN;
 END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;

-- ── fixtures ────────────────────────────────────────────────────────────
INSERT INTO auth.users(id,email) VALUES
 ('fc240000-0000-4000-8000-000000000001','pilot-ordinary@fixture.invalid'),
 ('fc240000-0000-4000-8000-000000000002','pilot-gb@fixture.invalid'),
 ('fc240000-0000-4000-8000-000000000003','pilot-du@fixture.invalid'),
 ('fc240000-0000-4000-8000-000000000004','pilot-admin@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id) VALUES ('fc240000-0000-4000-8000-000000000001');
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,sub_jurisdiction_code,work_location_confirmed_at) VALUES
 ('fc240000-0000-4000-8000-000000000002','GB',NULL,now()),
 ('fc240000-0000-4000-8000-000000000003','AE','AE-DU',now());
INSERT INTO public.sp_pilot_members(user_id,market_pack_code,granted_by,note) VALUES
 ('fc240000-0000-4000-8000-000000000002','GB','fc240000-0000-4000-8000-000000000004','db-test pilot member'),
 ('fc240000-0000-4000-8000-000000000003','AE-DU','fc240000-0000-4000-8000-000000000004','db-test pilot member');

-- ── preconditions: it is the PILOT branch that is exercised ─────────────
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.sp_market_packs WHERE code IN ('GB','AE-DU') AND pilot_state='internal_pilot' AND NOT is_active),
 'GB and Dubai packs are internal_pilot and not active');
SELECT pg_temp.ok((SELECT count(*)=2 AND bool_and(pilot_state='internal_pilot' AND authority_id IS NOT NULL AND NOT requires_scope AND NOT is_active)
 FROM public.sp_credential_types WHERE code IN ('UK_SIA_LICENCE_SG','AE_DU_BASIC_FIRE_SAFETY')),
 'the SIA licence and the Dubai course are approved, inactive pilot definitions');
SELECT pg_temp.ok((SELECT requires_scope FROM public.sp_credential_types WHERE code='AE_DU_SIRA_CARD_GUARD'),
 'the SIRA guard card is a scoped definition');

-- ── the ordinary holder: no entitlement ──────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc240000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'GB')='closed' AND public.sp_market_access(auth.uid(),'AE-DU')='closed'
 AND public.sp_market_access(auth.uid(),'SE')='production','ordinary holder: GB and Dubai closed, Sweden production');
SELECT count(*) AS se_n FROM public.sp_approved_credential_catalogue WHERE country='SE' \gset
SELECT pg_temp.ok(:se_n>0,'ordinary holder sees the Swedish catalogue');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='GB'),'ordinary holder sees no GB definition');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='AE' AND region='AE-DU'),'ordinary holder sees no Dubai definition');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"UK_SIA_LICENCE_SG","market_country":"GB","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','ordinary holder cannot save a GB licence');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_BASIC_FIRE_SAFETY","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','ordinary holder cannot save a Dubai course');
RESET ROLE;

-- ── a session without a subject sees no pilot row ───────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.ok(auth.uid() IS NULL AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country IN ('GB','AE')),
 'a session without a subject sees no GB or Dubai definition');
RESET ROLE;

-- ── the GB pilot member ─────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc240000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'GB')='pilot' AND public.sp_market_access(auth.uid(),'AE-DU')='closed','GB member: GB pilot, Dubai closed');
SELECT pg_temp.ok((SELECT count(*)>0 FROM public.sp_approved_credential_catalogue WHERE country='GB')
 AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='AE' AND region='AE-DU')
 AND (SELECT count(*)=:se_n FROM public.sp_approved_credential_catalogue WHERE country='SE'),'GB member sees GB, not Dubai; Sweden unchanged');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue WHERE code='UK_SIA_LICENCE_SG' AND country='GB' AND coalesce(issuer_name,'')<>''),
 'the SIA licence is offered to the GB member with its governed issuer');
SELECT public.sp_save_international_credential('{"definition_code":"UK_SIA_LICENCE_SG","market_country":"GB","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}') AS gb_claim \gset
SELECT pg_temp.ok((SELECT credential_code='UK_SIA_LICENCE_SG' AND jurisdiction_code='GB' AND sub_jurisdiction_code IS NULL AND coalesce(claimed_issuer_name,'')<>''
 AND issued_on='2024-05-01' AND valid_until='2027-05-01' AND assertion_level='self_declared' AND lifecycle_state='active'
 FROM public.sp_claims WHERE id=:'gb_claim' AND holder_user_id=auth.uid()),
 'read back: GB, no sub-jurisdiction, governed issuer, dates kept, self-declared and active');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_BASIC_FIRE_SAFETY","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','entitlement is per market: the GB member cannot save a Dubai course');
RESET ROLE;

-- ── the Dubai pilot member ──────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc240000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'AE-DU')='pilot' AND public.sp_market_access(auth.uid(),'GB')='closed','Dubai member: Dubai pilot, GB closed');
SELECT pg_temp.ok((SELECT count(*)>0 FROM public.sp_approved_credential_catalogue WHERE country='AE' AND region='AE-DU')
 AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='GB')
 AND (SELECT count(*)=:se_n FROM public.sp_approved_credential_catalogue WHERE country='SE'),'Dubai member sees Dubai, not GB; Sweden unchanged');
SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_BASIC_FIRE_SAFETY","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}') AS du_claim \gset
SELECT pg_temp.ok((SELECT credential_code='AE_DU_BASIC_FIRE_SAFETY' AND jurisdiction_code='AE' AND sub_jurisdiction_code='AE-DU' AND coalesce(claimed_issuer_name,'')<>''
 AND assertion_level='self_declared' AND lifecycle_state='active' FROM public.sp_claims WHERE id=:'du_claim' AND holder_user_id=auth.uid()),
 'read back: AE with sub-jurisdiction AE-DU, governed issuer, self-declared and active');
-- A course save proves nothing about SIRA CARD registration: no scoped card is
-- offered, and the RPC refuses one. This is the functional gap, stated by the suite.
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue c JOIN public.sp_credential_types t ON t.code=c.code WHERE c.region='AE-DU' AND t.requires_scope),
 'no scoped SIRA card is offered through the catalogue, only the courses');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','a scoped SIRA card is unavailable through the RPC even to the Dubai member');
RESET ROLE;

-- ── revocation: an UPDATE, attributed, and the door closes ──────────────
UPDATE public.sp_pilot_members SET revoked_by='fc240000-0000-4000-8000-000000000004',revoked_at=now()
 WHERE user_id='fc240000-0000-4000-8000-000000000002' AND market_pack_code='GB';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc240000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'GB')='closed' AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='GB'),
 'a revoked GB member loses market access and the GB catalogue');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"UK_SIA_LICENCE_SG","market_country":"GB","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','a revoked GB member cannot save another GB licence');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_claims WHERE id=:'gb_claim' AND holder_user_id=auth.uid()),'the credential saved while entitled is retained');
RESET ROLE;

-- ── disclosed definition scope, and selected-credential isolation ───────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc240000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","identifier":"PILOT-PRIVATE-1","issued_on":"2026-01-01"}') AS cpp \gset
SELECT public.sp_save_international_credential('{"definition_code":"OV","market_country":"SE","valid_until":"2030-01-01"}') AS ov \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_PSP","issued_on":"2026-01-01"}') AS psp \gset
SELECT public.sp_create_credential_disclosure_v2(ARRAY[:'cpp',:'ov']::uuid[],'{}',7,NULL,NULL,'en','fc240000-0000-4000-8000-000000000091') AS share \gset
RESET ROLE;
-- The recipient's read model is the share session (the gateway's path), as in
-- the sharing_v2 suite: the token itself is never read by anon here.
INSERT INTO public.sp_share_sessions(disclosure_id,session_hash,expires_at)
 VALUES((:'share'::jsonb->>'disclosure_id')::uuid,encode(digest(repeat('a',64),'sha256'),'hex'),now()+interval '20 minutes');
SELECT public.sp_get_disclosure_session(repeat('a',64)) AS payload \gset
SELECT pg_temp.ok((:'payload'::jsonb->>'status')='active','the recipient reads an active package');
SELECT pg_temp.ok(jsonb_array_length(:'payload'::jsonb->'verified_claims')=2 AND position('INTL_ASIS_PSP' IN :'payload')=0,
 'isolation: only the two selected credentials are disclosed, the third is absent');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
 WHERE c->>'credential_code'='INTL_ASIS_CPP' AND c->>'scope_code'='global_professional' AND c->'jurisdiction'='null'::jsonb),
 'international: scope_code global_professional, no country');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
 WHERE c->>'credential_code'='OV' AND c->>'scope_code'='national_regulated' AND c->>'jurisdiction'='SE'),
 'national: scope_code national_regulated with its country');
SELECT pg_temp.ok(position('PILOT-PRIVATE-1' IN :'payload')=0,'the identifier is not disclosed without consent');

-- A definition whose scope the administrator has withdrawn (inside this
-- rolled-back test only) is disclosed with scope_code NULL: unknown, never guessed.
UPDATE public.sp_credential_types SET scope_code=NULL WHERE code='INTL_ASIS_PSP';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc240000-0000-4000-8000-000000000001',true);
SELECT public.sp_create_credential_disclosure_v2(ARRAY[:'psp']::uuid[],'{}',7,NULL,NULL,'en','fc240000-0000-4000-8000-000000000092') AS share2 \gset
RESET ROLE;
INSERT INTO public.sp_share_sessions(disclosure_id,session_hash,expires_at)
 VALUES((:'share2'::jsonb->>'disclosure_id')::uuid,encode(digest(repeat('b',64),'sha256'),'hex'),now()+interval '20 minutes');
SELECT public.sp_get_disclosure_session(repeat('b',64)) AS payload2 \gset
SELECT pg_temp.ok((:'payload2'::jsonb#>>'{verified_claims,0,credential_code}')='INTL_ASIS_PSP' AND (:'payload2'::jsonb#>'{verified_claims,0,scope_code}')='null'::jsonb,
 'a definition without a scope is disclosed with scope_code null, unknown and never guessed');
ROLLBACK;
