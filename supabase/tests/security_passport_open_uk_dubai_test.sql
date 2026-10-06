-- Security Passport — the UK and Dubai as a PUBLIC PILOT (20261221090000),
-- on the real opened state: no fixture moves a market here.
--
--   1. Exactly the UK (GB), Northern Ireland (GB-NI) and Dubai (AE-DU) and 44
--      definitions are public pilot -- not active, legal review pending --
--      and every signed-in holder reaches them; an anonymous caller does not.
--   2. A fresh ordinary account with NO grant saves a credential from every
--      market -- Sweden, India, Great Britain, Northern Ireland, Dubai and the
--      international catalogue -- through the real RPC, and reads each back.
--   3. The rules still hold: Dubai's scope, a course's lack of one, the
--      emirate (never the whole UAE), Northern Ireland's own licence, Abu
--      Dhabi closed.
--   4. A work-country change moves no credential and no availability.
--   5. Review: evidence -> request -> clarification -> answer -> decision, by
--      a reviewer who holds no grant, for a Dubai and a Northern Ireland
--      claim; the holder sees each outcome.
--   6. Another holder can neither read nor change the holder's records, nor
--      can the holder raise their own trust.
--   7. A definition held back from the public pilot cannot be newly
--      registered, even through UPDATE; its existing claim stays visible with
--      unchanged trust, and can still be withdrawn and reviewed.
--   8. No pilot grant was created by any of it.
--
-- Everything is inside one transaction and rolled back.
\set ON_ERROR_STOP on
BEGIN;
-- The 140 definitions the certification research import added, by code, captured BEFORE any
-- role switch: the research records are administrator-only, so an authenticated holder (the
-- role these assertions count as) could not read them, and counting "except those" would
-- silently count none.
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
-- The input the Passport wizard sends (international.functions.ts), built from
-- the catalogue row the CALLER can see.
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

INSERT INTO auth.users(id,email) VALUES
 ('fe221000-0000-4000-8000-000000000001','open-dubai@fixture.invalid'),
 ('fe221000-0000-4000-8000-000000000002','open-ni@fixture.invalid'),
 ('fe221000-0000-4000-8000-000000000003','open-reviewer@fixture.invalid'),
 ('fe221000-0000-4000-8000-000000000004','open-other@fixture.invalid'),
 ('fe221000-0000-4000-8000-000000000005','open-mixed@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,sub_jurisdiction_code,work_location_confirmed_at) VALUES
 ('fe221000-0000-4000-8000-000000000001','AE','AE-DU',now()),
 ('fe221000-0000-4000-8000-000000000002','GB','GB-NI',now()),
 ('fe221000-0000-4000-8000-000000000004','GB',NULL,now()),
 ('fe221000-0000-4000-8000-000000000005','SE',NULL,now());
INSERT INTO public.user_roles(user_id,role) VALUES ('fe221000-0000-4000-8000-000000000003','passport_verifier');

-- ── 1. The opened state ─────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.sp_market_packs
                    WHERE code IN ('GB','GB-NI','AE-DU') AND pilot_state='public_pilot'
                      AND NOT is_active AND legal_review_state='pending' AND superseded_on IS NULL),
 '1.1 the UK, Northern Ireland and Dubai are public pilots: not active, legal review pending');
SELECT pg_temp.ok((SELECT count(*)=44 FROM public.sp_credential_types
                    WHERE pilot_state='public_pilot' AND NOT is_active AND legal_review_state='pending'
                      AND market_pack_code IN ('GB','GB-NI','AE-DU'))
   AND (SELECT count(*)=13 FROM public.sp_credential_types WHERE pilot_state='public_pilot' AND market_pack_code='GB')
   AND (SELECT count(*)=1 FROM public.sp_credential_types WHERE pilot_state='public_pilot' AND market_pack_code='GB-NI')
   AND (SELECT count(*)=30 FROM public.sp_credential_types WHERE pilot_state='public_pilot' AND market_pack_code='AE-DU'),
 '1.2 their 44 definitions are public pilot -- 13 GB, 1 Northern Ireland, 30 Dubai -- none approved, none reviewed');
-- 20270219090000 opened Abu Dhabi as a public pilot by its own decision; this
-- suite proves the UK and Dubai, and only notes that Abu Dhabi is neither
-- active nor approved. Its own suite (open_abu_dhabi) proves the rest.
SELECT pg_temp.ok((SELECT NOT is_active AND pilot_state='public_pilot' AND legal_review_state='pending' FROM public.sp_market_packs WHERE code='AE-AZ')
   AND (SELECT count(*)=0 FROM public.sp_credential_types WHERE market_pack_code='AE-AZ' AND (is_active OR pilot_state<>'public_pilot'))
   AND (SELECT is_active AND pilot_state='closed' FROM public.sp_market_packs WHERE code='SE'),
 '1.3 Abu Dhabi is a public pilot since 20270219090000, never active; Sweden stays the one active market');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_pilot_members WHERE user_id::text LIKE 'fe221000-%'),
 '1.4 nobody in this suite holds a pilot grant');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000005',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'GB')='public_pilot'
   AND public.sp_market_access(auth.uid(),'GB-NI')='public_pilot'
   AND public.sp_market_access(auth.uid(),'AE-DU')='public_pilot'
   AND public.sp_market_access(auth.uid(),'AE-AZ')='public_pilot'
   AND public.sp_market_access(auth.uid(),'SE')='production'
   AND public.sp_market_access(auth.uid(),'ZZ')='closed',
 '1.5 the canonical decision, for a signed-in holder with no grant: public pilot for the three and for Abu Dhabi, closed for the unknown');
SELECT pg_temp.ok((SELECT count(*)=70 FROM public.sp_approved_credential_catalogue WHERE code NOT IN (SELECT code FROM research_codes) AND region IS DISTINCT FROM 'AE-AZ')
   AND (SELECT count(*) FROM public.sp_approved_credential_catalogue WHERE code IN (SELECT code FROM research_codes)) IN (0,140)
   AND (SELECT count(*)=13 FROM public.sp_approved_credential_catalogue WHERE country='GB' AND region IS NULL)
   AND (SELECT count(*)=1 FROM public.sp_approved_credential_catalogue WHERE region='GB-NI')
   AND (SELECT count(*)=30 FROM public.sp_approved_credential_catalogue WHERE region='AE-DU')
   AND (SELECT count(*)=7 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 '1.6 the catalogue offers the 70 this migration accounts for (the 140 researched definitions are offered all or none, and counted apart): 14 international, 8 Sweden, 4 India, 13 GB, 1 Northern Ireland, 30 Dubai -- and Abu Dhabi''s 7 since 20270219090000');
RESET ROLE;
SELECT pg_temp.ok(public.sp_market_access(NULL,'GB')='closed' AND public.sp_market_access(NULL,'AE-DU')='closed',
 '1.7 without a signed-in user the public pilot is closed');
SET LOCAL ROLE anon;
SELECT pg_temp.refused($q$SELECT count(*) FROM public.sp_approved_credential_catalogue$q$,'permission denied',
 '1.8 an anonymous caller cannot list the catalogue at all');
RESET ROLE;

-- ── 2. A fresh ordinary account saves from every market ─────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000005',true);
SELECT public.sp_save_international_credential(pg_temp.save_input('VU1')) AS m_se \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('IN_MEPSC_Q7101')) AS m_in \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_DS')) AS m_gb \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_VI')) AS m_ni \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_DU_SIRA_CARD_GUARD')) AS m_du \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('INTL_ASIS_CPP')) AS m_intl \gset
SELECT pg_temp.ok((SELECT count(*)=6 FROM public.sp_claims
                    WHERE id IN (:'m_se',:'m_in',:'m_gb',:'m_ni',:'m_du',:'m_intl')
                      AND holder_user_id=auth.uid() AND lifecycle_state='active' AND assertion_level='self_declared'),
 '2.1 one credential from each of Sweden, India, Great Britain, Northern Ireland, Dubai and the international catalogue saves, self-declared');
SELECT pg_temp.ok(
     (SELECT jurisdiction_code='SE' AND sub_jurisdiction_code IS NULL FROM public.sp_claims WHERE id=:'m_se')
 AND (SELECT jurisdiction_code='IN' AND sub_jurisdiction_code IS NULL FROM public.sp_claims WHERE id=:'m_in')
 AND (SELECT jurisdiction_code='GB' AND sub_jurisdiction_code IS NULL FROM public.sp_claims WHERE id=:'m_gb')
 AND (SELECT jurisdiction_code='GB' AND sub_jurisdiction_code='GB-NI' FROM public.sp_claims WHERE id=:'m_ni')
 AND (SELECT jurisdiction_code='AE' AND sub_jurisdiction_code='AE-DU' AND authorisation_scope='Fiktivt bevakningsbolag LLC'
        FROM public.sp_claims WHERE id=:'m_du')
 AND (SELECT jurisdiction_code IS NULL AND sub_jurisdiction_code IS NULL FROM public.sp_claims WHERE id=:'m_intl'),
 '2.2 each reads back under its own jurisdiction: Northern Ireland as Northern Ireland, Dubai as Dubai, the certification with no country');
SELECT pg_temp.ok((SELECT count(*)=6 FROM public.sp_credential_details
                    WHERE claim_id IN (:'m_se',:'m_in',:'m_gb',:'m_ni',:'m_du',:'m_intl')),
 '2.3 and each carries its governed details');
RESET ROLE;
SELECT pg_temp.ok((SELECT n FROM grants_before)=(SELECT count(*) FROM public.sp_pilot_members),
 '2.4 and no pilot grant was created to make it possible');

-- ── 3. The rules still hold ─────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000001',true);
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false}')$q$,
 'SP_CREDENTIAL_REQUIRES_SCOPE','3.1 a Dubai cadre card still needs the company it is tied to');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_BASIC_FIRE_SAFETY","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag","issuer_name":"Fiktiv Utbildning LLC"}')$q$,
 'SP_SCOPE_NOT_APPLICABLE','3.2 a Dubai course still cannot carry a scope');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag"}')$q$,
 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET','3.3 a Dubai card filed as UAE-wide is refused: the emirate, never the whole UAE');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"UK_SIA_LICENCE_VI","market_country":"GB","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false}')$q$,
 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET','3.4 Northern Ireland''s licence cannot be filed as a GB-wide one');
SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"AE-AZ","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag"}') AS az_by_dubai \gset
SELECT pg_temp.ok((SELECT jurisdiction_code='AE' AND sub_jurisdiction_code='AE-AZ' FROM public.sp_claims WHERE id=:'az_by_dubai'),
 '3.5 a Dubai holder may register an Abu Dhabi licence since 20270219090000, and it is filed under Abu Dhabi, never Dubai');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2029-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag","issuer_name":"Fake SIRA"}')$q$,
 'SP_ISSUER_IS_GOVERNED','3.6 SIRA stays the governed issuer of the card');
RESET ROLE;

-- ── 4. A work-country change moves nothing ──────────────────────────────
CREATE TEMP TABLE mixed_before AS
 SELECT id, jurisdiction_code, sub_jurisdiction_code, credential_code, lifecycle_state, assertion_level
   FROM public.sp_claims WHERE holder_user_id='fe221000-0000-4000-8000-000000000005';
UPDATE public.sp_passport_profiles SET jurisdiction_code='AE', sub_jurisdiction_code='AE-DU'
 WHERE holder_user_id='fe221000-0000-4000-8000-000000000005';
UPDATE public.sp_passport_profiles SET jurisdiction_code='IN', sub_jurisdiction_code=NULL
 WHERE holder_user_id='fe221000-0000-4000-8000-000000000005';
SELECT pg_temp.ok(NOT EXISTS(
   SELECT id, jurisdiction_code, sub_jurisdiction_code, credential_code, lifecycle_state, assertion_level
     FROM public.sp_claims WHERE holder_user_id='fe221000-0000-4000-8000-000000000005'
   EXCEPT SELECT * FROM mixed_before)
 AND (SELECT count(*)=6 FROM public.sp_claims WHERE holder_user_id='fe221000-0000-4000-8000-000000000005'),
 '4.1 moving to Dubai and then India changes none of the six: the international and foreign credentials keep their own territory');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000005',true);
SELECT pg_temp.ok((SELECT count(*)=70 FROM public.sp_approved_credential_catalogue WHERE code NOT IN (SELECT code FROM research_codes) AND region IS DISTINCT FROM 'AE-AZ'),
 '4.2 and availability does not follow the work country: the same 70');
RESET ROLE;

-- ── 5. Review, by a reviewer who holds no grant ─────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_DU_SIRA_CARD_GUARD')) AS du \gset
SELECT public.sp_attach_evidence(:'du'::uuid,NULL,'fe221000-0000-4000-8000-000000000001/sira-card.pdf','sira-card.pdf','application/pdf',4096,repeat('ab',32));
SELECT public.sp_submit_for_verification(:'du'::uuid,NULL,'cqrityjob_review',NULL) AS du_req \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000002',true);
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_VI')) AS ni \gset
SELECT public.sp_attach_evidence(:'ni'::uuid,NULL,'fe221000-0000-4000-8000-000000000002/sia-vi.pdf','sia-vi.pdf','application/pdf',2048,repeat('cd',32));
SELECT public.sp_submit_for_verification(:'ni'::uuid,NULL,'cqrityjob_review',NULL) AS ni_req \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok(position(:'du_req' IN public.sp_verifier_queue('pending')::text)>0
   AND position(:'ni_req' IN public.sp_verifier_queue('pending')::text)>0,
 '5.1 the reviewer, who holds no grant, finds both requests in the queue');
SELECT public.sp_verifier_request_detail(:'du_req'::uuid) AS det \gset
SELECT pg_temp.ok((:'det'::jsonb#>>'{claim,credential_code}')='AE_DU_SIRA_CARD_GUARD'
   AND jsonb_array_length(:'det'::jsonb->'evidence')=1,
 '5.2 and opens the Dubai credential with its evidence');
SELECT public.sp_verifier_decide(:'du_req'::uuid,'clarification_requested',NULL,'Card back missing','Please add the back of the card.',NULL,NULL);
RESET ROLE;
-- One transaction has one now(): the clarification is moved an hour back so
-- the answer and the approval below are later than it, as they would be.
ALTER TABLE public.sp_verification_decisions DISABLE TRIGGER sp_decisions_append_only;
UPDATE public.sp_verification_decisions SET decided_at=decided_at-interval '1 hour' WHERE request_id=:'du_req';
ALTER TABLE public.sp_verification_decisions ENABLE TRIGGER sp_decisions_append_only;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT status='clarification_requested' FROM public.sp_verification_requests WHERE id=:'du_req'),
 '5.3 the holder sees that a clarification was requested');
SELECT public.sp_attach_evidence(:'du'::uuid,NULL,'fe221000-0000-4000-8000-000000000001/sira-card-back.pdf','sira-card-back.pdf','application/pdf',2048,repeat('ef',32));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok(jsonb_array_length(public.sp_verifier_request_detail(:'du_req'::uuid)->'evidence')=2,
 '5.4 the reviewer sees the answer');
-- The reviewer decides on the version the page shows, the one with the added
-- document (20270126090000: the answer moved the request's version).
SELECT public.sp_verifier_decide_reviewed(:'du_req'::uuid,
  (public.sp_verifier_request_detail(:'du_req'::uuid)->>'submitted_at')::timestamptz,
  'approved','document_review','Checked against the card','',NULL,NULL);
SELECT public.sp_verifier_decide(:'ni_req'::uuid,'rejected','document_review','Name does not match','The name on the licence does not match your profile.',NULL,NULL);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT assertion_level='verified' FROM public.sp_claims WHERE id=:'du'),
 '5.5 the Dubai holder sees the credential verified -- by the reviewer''s decision, and nothing else');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT status='rejected' FROM public.sp_verification_requests WHERE id=:'ni_req')
   AND (SELECT assertion_level<>'verified' FROM public.sp_claims WHERE id=:'ni'),
 '5.6 the Northern Ireland holder sees the rejection, and the credential is not verified');
RESET ROLE;

-- ── 6. Another holder, and the holder's own trust ───────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_claims WHERE holder_user_id='fe221000-0000-4000-8000-000000000001')
   AND (SELECT count(*)=0 FROM public.sp_credential_details WHERE claim_id=:'du')
   AND (SELECT count(*)=0 FROM public.sp_evidence WHERE claim_id=:'du'),
 '6.1 another holder cannot read the Dubai holder''s claims, details or evidence');
UPDATE public.sp_claims SET authorisation_scope='HIJACK' WHERE id=:'du';
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_claims WHERE authorisation_scope='HIJACK'),
 '6.2 an update of another holder''s claim touches nothing');
SELECT pg_temp.refused(format($q$SELECT public.sp_submit_for_verification(%L,NULL,'cqrityjob_review',NULL)$q$,:'m_gb'),
 'SP_NOT_HOLDER','6.3 nor can they submit it for review');
SELECT pg_temp.refused(format($q$SELECT public.sp_verifier_request_detail(%L)$q$,:'du_req'),'SP_NOT_VERIFIER',
 '6.4 nor read its review');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000005',true);
SELECT pg_temp.refused(format($q$UPDATE public.sp_claims SET assertion_level='verified' WHERE id=%L$q$,:'m_gb'),
 'SP_TRUST_FIELD_IMMUTABLE','6.5 a holder cannot raise their own UK credential to verified');
RESET ROLE;

-- ── 7. A definition held back from the public pilot ─────────────────────
-- The owner holds one definition back (a reviewed migration would do it;
-- here, a rolled-back fixture): the Dubai watchman card goes to 'closed'. The
-- mixed holder registered one BEFORE that.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000001',true);
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_DU_SIRA_CARD_WATCHMAN')) AS held \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_DU_SIRA_CARD_WATCHMAN')) AS held_other \gset
RESET ROLE;
UPDATE public.sp_credential_types SET pilot_state='closed' WHERE code='AE_DU_SIRA_CARD_WATCHMAN';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE code='AE_DU_SIRA_CARD_WATCHMAN')
   AND (SELECT count(*)=29 FROM public.sp_approved_credential_catalogue WHERE region='AE-DU'),
 '7.1 the held-back card leaves the catalogue; the other 29 Dubai definitions stay');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   jsonb_build_object('definition_code','AE_DU_SIRA_CARD_WATCHMAN','market_country','AE','market_region','AE-DU','identifier','',
     'issued_on','2024-05-01','valid_until','2029-05-01','no_expiry',false,'authorisation_scope','Fiktivt bolag')),
 'SP_APPROVED_DEFINITION_REQUIRED','7.2 it cannot be newly registered');
SELECT pg_temp.refused(format($q$UPDATE public.sp_claims SET valid_until='2030-01-01' WHERE id=%L$q$,:'held'),
 'SP_APPROVED_DEFINITION_REQUIRED','7.3 nor reached through an in-place edit of an existing claim');
SELECT pg_temp.refused(format($q$UPDATE public.sp_claims SET credential_code='AE_DU_SIRA_CARD_WATCHMAN' WHERE id=%L$q$,:'du'),
 'SP_DEFINITION_IMMUTABLE','7.3 nor by turning another credential into it');
SELECT pg_temp.ok((SELECT assertion_level='self_declared' AND lifecycle_state='active' FROM public.sp_claims WHERE id=:'held'),
 '7.4 the existing claim stays visible to its holder, with its trust unchanged');
SELECT public.sp_attach_evidence(:'held'::uuid,NULL,'fe221000-0000-4000-8000-000000000001/watchman.pdf','watchman.pdf','application/pdf',1024,repeat('12',32));
SELECT public.sp_submit_for_verification(:'held'::uuid,NULL,'cqrityjob_review',NULL) AS held_req \gset
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_evidence WHERE claim_id=:'held')
   AND (SELECT status='pending' FROM public.sp_verification_requests WHERE id=:'held_req'),
 '7.5 and can still carry evidence and a review request');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000003',true);
SELECT public.sp_verifier_decide(:'held_req'::uuid,'approved','document_review','Checked','',NULL,NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT assertion_level='verified' FROM public.sp_claims WHERE id=:'held'),
 '7.6 a reviewer can still decide it: maintenance and review need no availability');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe221000-0000-4000-8000-000000000001',true);
SELECT public.sp_withdraw_claim(:'held_other'::uuid,'No longer relevant');
SELECT pg_temp.ok((SELECT lifecycle_state='withdrawn' FROM public.sp_claims WHERE id=:'held_other'),
 '7.7 and a holder can still withdraw one');
SELECT pg_temp.refused(format($q$UPDATE public.sp_claims SET lifecycle_state='active' WHERE id=%L$q$,:'held_other'),
 'SP_APPROVED_DEFINITION_REQUIRED','7.8 but a withdrawn one cannot be reactivated into a closed definition');
RESET ROLE;

-- ── 8. No grant was created by any of it ────────────────────────────────
SELECT pg_temp.ok((SELECT n FROM grants_before)=(SELECT count(*) FROM public.sp_pilot_members)
   AND NOT EXISTS(SELECT 1 FROM public.sp_pilot_members WHERE user_id::text LIKE 'fe221000-%'),
 '8.1 registration, review and maintenance in the public pilot created no pilot grant');
ROLLBACK;
