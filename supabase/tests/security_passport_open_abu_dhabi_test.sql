-- Abu Dhabi opened as a PUBLIC PILOT (20270220090000).
--
--   1. The opened state: the AE-AZ pack and its seven definitions are
--      public_pilot, inactive, review pending; the emirate is active; the
--      Ministry of Interior is regulator and issuer of each; the UK and Dubai
--      are exactly as 20261221090000 left them; every other emirate is closed.
--   2. A fresh ordinary account, with no grant and whatever its work country,
--      is offered the seven and saves one through the governed RPC -- filed
--      under Abu Dhabi, never Dubai, never the whole UAE, with the Ministry as
--      its governed issuer and its scope required.
--   3. The rules still hold: a Dubai card cannot be filed in Abu Dhabi, an Abu
--      Dhabi licence cannot be filed in Dubai or UAE-wide, the issuer cannot be
--      replaced, the scope cannot be dropped, a signed-out session sees nothing.
--   4. Sharing carries the issuer: a selective disclosure of the licence names
--      the Ministry, because the migration added the issuer role.
--   5. Nothing else moved: no claim, title, grant, approval or review state.
--
-- Everything is inside one transaction and rolled back.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE research_codes AS
  SELECT credential_code AS code FROM public.sp_catalogue_research_records
   WHERE reconciliation_outcome='added_approved' AND credential_code IS NOT NULL;
GRANT SELECT ON research_codes TO authenticated;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF position(needle IN SQLERRM)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % refused for another reason: %',label,SQLERRM; END IF;
   RAISE NOTICE 'ok %',label; RETURN;
 END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;
CREATE FUNCTION pg_temp.save_input(_code text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _in jsonb;
BEGIN
 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=_code;
 IF NOT FOUND THEN RETURN jsonb_build_object('definition_code',_code,'market_country','','market_region',''); END IF;
 _in:=jsonb_build_object('definition_code',d.code,'market_country',coalesce(d.country,''),'market_region',coalesce(d.region,''),
   'identifier','','issued_on','2024-05-01','valid_until','2029-05-01','no_expiry',false);
 IF (SELECT requires_scope FROM public.sp_credential_types WHERE code=_code) THEN
   _in:=_in||jsonb_build_object('authorisation_scope','Fiktivt bevakningsbolag LLC'); END IF;
 IF d.issuer_name IS NULL THEN _in:=_in||jsonb_build_object('issuer_name','Fiktiv Utbildning LLC'); END IF;
 RETURN _in;
END $$;
CREATE TEMP TABLE grants_before AS SELECT count(*) AS n FROM public.sp_pilot_members;
CREATE TEMP TABLE az_codes(code text PRIMARY KEY);
INSERT INTO az_codes VALUES ('AE_AZ_PSBD_LICENCE_GUARD'),('AE_AZ_PSBD_LICENCE_CIT'),('AE_AZ_PSBD_LICENCE_BANKS'),
 ('AE_AZ_PSBD_LICENCE_EVENT'),('AE_AZ_PSBD_LICENCE_SUPERVISOR'),('AE_AZ_PSBD_LICENCE_MANAGER'),('AE_AZ_PSBD_LICENCE_TRAINER');
GRANT SELECT ON az_codes TO authenticated;

INSERT INTO auth.users(id,email) VALUES
 ('fe222000-0000-4000-8000-000000000001','open-abudhabi@fixture.invalid'),
 ('fe222000-0000-4000-8000-000000000002','open-az-dubai@fixture.invalid'),
 ('fe222000-0000-4000-8000-000000000003','open-az-reviewer@fixture.invalid'),
 ('fe222000-0000-4000-8000-000000000004','open-az-sweden@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,sub_jurisdiction_code,work_location_confirmed_at) VALUES
 ('fe222000-0000-4000-8000-000000000001','AE','AE-AZ',now()),
 ('fe222000-0000-4000-8000-000000000002','AE','AE-DU',now()),
 ('fe222000-0000-4000-8000-000000000004','SE',NULL,now());
INSERT INTO public.user_roles(user_id,role) VALUES ('fe222000-0000-4000-8000-000000000003','passport_verifier');

-- ── 1. The opened state ─────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT pilot_state='public_pilot' AND NOT is_active AND legal_review_state='pending' AND superseded_on IS NULL
                     FROM public.sp_market_packs WHERE code='AE-AZ'),
 '1.1 Abu Dhabi is a public pilot: not active, legal review pending');
SELECT pg_temp.ok((SELECT count(*)=7 FROM public.sp_credential_types t JOIN az_codes a ON a.code=t.code
                    WHERE t.market_pack_code='AE-AZ' AND t.pilot_state='public_pilot' AND NOT t.is_active AND t.legal_review_state='pending')
   AND (SELECT count(*)=7 FROM public.sp_credential_types WHERE market_pack_code='AE-AZ'),
 '1.2 its seven definitions are public pilot -- none approved, none reviewed');
SELECT pg_temp.ok((SELECT is_active FROM public.sp_sub_jurisdictions WHERE code='AE-AZ')
   AND (SELECT count(*)=2 FROM public.sp_sub_jurisdictions WHERE jurisdiction_code='AE' AND is_active)
   AND (SELECT count(*)=5 FROM public.sp_sub_jurisdictions WHERE jurisdiction_code='AE' AND NOT is_active),
 '1.3 the emirate is active; Dubai and Abu Dhabi are the two, the other five stay listed and inactive');
SELECT pg_temp.ok((SELECT count(*)=14 FROM public.sp_credential_organisation_roles r JOIN az_codes a ON a.code=r.credential_code
                    JOIN public.sp_authorities au ON au.id=r.authority_id
                    WHERE r.role IN ('regulator','issuer') AND au.code='AE_MOI_PSBD' AND NOT r.document_specific)
   AND NOT EXISTS(SELECT 1 FROM public.sp_credential_organisation_roles r JOIN az_codes a ON a.code=r.credential_code WHERE r.role NOT IN ('regulator','issuer')),
 '1.4 the Ministry of Interior is regulator and issuer of each of the seven, and nothing else is claimed about them');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_credential_definition_reviews v JOIN az_codes a ON a.code=v.credential_code)
   AND (SELECT checked_on IS NULL AND review_state='review_needed' FROM public.sp_regulatory_sources WHERE source_key='ae_moi_private_security'),
 '1.5 no definition review is claimed and the Ministry source is still registered unread: opening is availability, not review');
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_market_packs WHERE pilot_state='public_pilot' AND NOT is_active AND legal_review_state='pending')
   AND (SELECT count(*)=3 FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU') AND pilot_state='public_pilot')
   AND (SELECT count(*)=51 FROM public.sp_credential_types WHERE pilot_state='public_pilot' AND NOT is_active)
   AND (SELECT count(*)=44 FROM public.sp_credential_types WHERE pilot_state='public_pilot' AND market_pack_code IN ('GB','GB-NI','AE-DU'))
   AND (SELECT is_active AND pilot_state='closed' FROM public.sp_market_packs WHERE code='SE'),
 '1.6 four public pilots and 51 definitions (44 + 7); the UK and Dubai exactly as before; Sweden the one active market');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_pilot_members WHERE user_id::text LIKE 'fe222000-%'),
 '1.7 nobody in this suite holds a pilot grant');
SELECT pg_temp.ok(public.sp_market_access(NULL,'AE-AZ')='closed','1.8 without a signed-in user the public pilot is closed');

-- ── 2. A fresh ordinary account saves an Abu Dhabi licence ──────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe222000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'AE-AZ')='public_pilot' AND public.sp_market_access(auth.uid(),'AE-DU')='public_pilot',
 '2.1 the canonical decision, for a signed-in holder with no grant: public pilot for Abu Dhabi, as for Dubai');
SELECT pg_temp.ok((SELECT count(*)=7 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ')
   AND (SELECT count(*)=77 FROM public.sp_approved_credential_catalogue WHERE code NOT IN (SELECT code FROM research_codes))
   AND (SELECT count(*)=30 FROM public.sp_approved_credential_catalogue WHERE region='AE-DU'),
 '2.2 the catalogue offers the seven, beside the 70 it offered before: 77 (the researched definitions counted apart)');
SELECT pg_temp.ok((SELECT bool_and(issuer_name='Ministry of Interior — Private Security Business Department' AND country='AE' AND region='AE-AZ')
                     FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 '2.3 each names the Ministry as its governed issuer and Abu Dhabi as its territory');
SELECT pg_temp.ok((SELECT count(*)=7 FROM public.sp_credential_types WHERE market_pack_code='AE-AZ'),
 '2.4 the definitions themselves are readable to that holder (every layer agrees)');
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_AZ_PSBD_LICENCE_GUARD')) AS az_guard \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_AZ_PSBD_LICENCE_SUPERVISOR')) AS az_sup \gset
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.sp_claims WHERE id IN (:'az_guard',:'az_sup')
     AND holder_user_id=auth.uid() AND lifecycle_state='active' AND assertion_level='self_declared'),
 '2.5 the holder saves a guard licence and a supervisor licence through the real RPC, self-declared');
SELECT pg_temp.ok((SELECT jurisdiction_code='AE' AND sub_jurisdiction_code='AE-AZ' AND authorisation_scope='Fiktivt bevakningsbolag LLC'
                     AND claimed_issuer_name='Ministry of Interior — Private Security Business Department'
                     AND valid_until=DATE '2029-05-01'
                     FROM public.sp_claims WHERE id=:'az_guard'),
 '2.6 filed under Abu Dhabi -- never Dubai, never the whole UAE -- with the Ministry as issuer, its scope and its own expiry');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.sp_credential_details WHERE claim_id IN (:'az_guard',:'az_sup')),
 '2.7 and each carries its governed details');
RESET ROLE;
SELECT pg_temp.ok((SELECT n FROM grants_before)=(SELECT count(*) FROM public.sp_pilot_members),
 '2.8 and no pilot grant was created to make it possible');
-- Availability does not follow the work country: a Swedish holder reaches the seven too.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe222000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=7 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 '2.9 a Swedish holder is offered the same seven: availability is the market''s, not the holder''s country''s');
RESET ROLE;

-- ── 3. The rules still hold ─────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe222000-0000-4000-8000-000000000002',true);
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"AE-AZ","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false}')$q$,
 'SP_CREDENTIAL_REQUIRES_SCOPE','3.1 an Abu Dhabi licence still needs the company it is tied to');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag"}')$q$,
 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET','3.2 an Abu Dhabi licence cannot be filed in Dubai');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag"}')$q$,
 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET','3.3 nor UAE-wide: the emirate, never the whole UAE');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"AE-AZ","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag"}')$q$,
 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET','3.4 a Dubai cadre card cannot be filed in Abu Dhabi: Abu Dhabi does not inherit Dubai');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"AE-AZ","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag","issuer_name":"Fake Ministry"}')$q$,
 'SP_ISSUER_IS_GOVERNED','3.5 the Ministry stays the governed issuer');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"AE-AZ","identifier":"","issued_on":"2024-05-01","no_expiry":true,"authorisation_scope":"Fiktivt bolag"}')$q$,
 'SP_','3.6 a licence that requires an expiry cannot be saved without one');
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,valid_until)
  SELECT auth.uid(),'licence','AE_AZ_PSBD_LICENCE_GUARD',name_en,issuer_name,country,region,'2030-01-01' FROM public.sp_approved_credential_catalogue WHERE code='AE_AZ_PSBD_LICENCE_GUARD'$q$,
 'SP_CREDENTIAL_REQUIRES_SCOPE','3.7 a direct table insert cannot bypass the scope either');
RESET ROLE;
-- Owner-side, not a holder: the constraint is what stops it, not a grant.
SELECT pg_temp.refused($q$UPDATE public.sp_market_packs SET is_active=true WHERE code='AE-AZ'$q$,
 'sp_market_pack_active_needs_review','3.8 a public-pilot pack still cannot be made active over a pending review');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.ok(auth.uid() IS NULL AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 '3.9 a session without a subject is offered no Abu Dhabi definition');
RESET ROLE;

-- ── 4. Sharing carries the issuer ───────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe222000-0000-4000-8000-000000000001',true);
SELECT public.sp_create_credential_disclosure_v2(ARRAY[:'az_guard']::uuid[],'{}',7,NULL,NULL,'en','fe222000-0000-4000-8000-0000000000aa') AS az_share \gset
SELECT pg_temp.ok((:'az_share'::jsonb->>'token') IS NOT NULL,'4.1 the holder shares the licence selectively');
RESET ROLE;
SELECT public.sp_get_disclosure(:'az_share'::jsonb->>'token') AS az_read \gset
SELECT pg_temp.ok((:'az_read'::jsonb->>'status')='active'
   AND (:'az_read'::jsonb#>>'{verified_claims,0,credential_code}')='AE_AZ_PSBD_LICENCE_GUARD'
   AND (:'az_read'::jsonb#>>'{verified_claims,0,issuer}')='Ministry of Interior — Private Security Business Department'
   AND (:'az_read'::jsonb#>>'{verified_claims,0,sub_jurisdiction}')='AE-AZ'
   AND (:'az_read'::jsonb#>>'{verified_claims,0,scope_limited}')='true'
   AND (:'az_read'::jsonb#>>'{verified_claims,0,authorisation_scope}') IS NULL
   AND (:'az_read'::jsonb#>>'{verified_claims,0,assertion}')='self_declared',
 '4.2 the recipient sees the licence with the Ministry as issuer, Abu Dhabi as territory, a limited scope whose text is withheld, and its honest self-declared label');

-- ── 5. Review, by a reviewer who holds no grant ─────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe222000-0000-4000-8000-000000000001',true);
SELECT public.sp_attach_evidence(:'az_sup'::uuid,NULL,'fe222000-0000-4000-8000-000000000001/psbd-licence.pdf','psbd-licence.pdf','application/pdf',4096,repeat('ab',32));
SELECT public.sp_submit_for_verification(:'az_sup'::uuid,NULL,'cqrityjob_review',NULL) AS az_req \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe222000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok(position(:'az_req' IN public.sp_verifier_queue('pending')::text)>0,
 '5.1 the reviewer, who holds no grant, finds the request in the queue');
SELECT public.sp_verifier_request_detail(:'az_req'::uuid) AS det \gset
SELECT pg_temp.ok((:'det'::jsonb#>>'{claim,credential_code}')='AE_AZ_PSBD_LICENCE_SUPERVISOR'
   AND jsonb_array_length(:'det'::jsonb->'evidence')=1,
 '5.2 and opens the Abu Dhabi credential with its evidence');
SELECT public.sp_verifier_decide(:'az_req'::uuid,'rejected','document_review','Name does not match','The name on the licence does not match your profile.',NULL,NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT assertion_level<>'verified' FROM public.sp_claims WHERE id=:'az_sup')
   AND (SELECT status='rejected' FROM public.sp_verification_requests WHERE id=:'az_req'),
 '5.3 a decision is recorded and the claim''s trust is what the reviewer decided, never raised by the opening');

-- ── 6. Nothing else moved ───────────────────────────────────────────────
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_credential_types WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active)
   AND (SELECT count(*)=0 FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU','AE-AZ') AND (is_active OR legal_review_state<>'pending'))
   AND (SELECT count(*)=0 FROM public.sp_professional_titles WHERE market_pack_code='AE-AZ' AND is_active),
 '6.1 no pilot definition, pack or Abu Dhabi title is active or reviewed: this suite and the migration approve nothing');
ROLLBACK;
