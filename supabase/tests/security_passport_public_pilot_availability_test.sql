-- Security Passport — public-pilot availability and the operation policy
-- (20261220090000).
--
--   1. Nothing moves: no pack or definition is public_pilot, and the UK and
--      Dubai are exactly as members-only as before.
--   2. A market in the new state (a fixture, inside this transaction) is
--      registrable by an ordinary signed-in holder with NO grant, through the
--      real save RPC -- while is_active stays false, the legal review stays
--      pending, and a pack still cannot be made active over a pending review.
--      Abu Dhabi stays closed; a single definition can still be held back.
--   3. Blocked registration cannot be bypassed through UPDATE: once a
--      definition is withdrawn, no reactivation, draft activation, change of
--      credential or jurisdiction, in-place edit or correction registers it.
--   4. Maintenance and review of an EXISTING claim stay possible after a
--      withdrawal and after a grant is revoked: evidence, a review request, a
--      decision by a reviewer who holds no grant, and withdrawal. (G3)
--   5. Each write layer enforces the policy on its own: with the catalogue
--      guard stood down, the claim rules still refuse, in availability terms.
--   6. Every other check is unchanged: scope, issuer, trust fields.
--
-- Everything is inside one transaction and rolled back.
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
-- The input the Passport entry form sends (international.functions.ts), built
-- from the catalogue row the CALLER can see.
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

INSERT INTO auth.users(id,email) VALUES
 ('fe220000-0000-4000-8000-000000000001','pp-holder@fixture.invalid'),
 ('fe220000-0000-4000-8000-000000000002','pp-second@fixture.invalid'),
 ('fe220000-0000-4000-8000-000000000003','pp-reviewer@fixture.invalid'),
 ('fe220000-0000-4000-8000-000000000004','pp-ni-member@fixture.invalid'),
 ('fe220000-0000-4000-8000-000000000005','pp-admin@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,sub_jurisdiction_code,work_location_confirmed_at) VALUES
 ('fe220000-0000-4000-8000-000000000001','SE',NULL,now()),
 ('fe220000-0000-4000-8000-000000000002','GB',NULL,now()),
 ('fe220000-0000-4000-8000-000000000004','GB','GB-NI',now());
INSERT INTO public.user_roles(user_id,role) VALUES
 ('fe220000-0000-4000-8000-000000000003','passport_verifier'),
 ('fe220000-0000-4000-8000-000000000005','admin');

-- ── 1. What is public, and where the rest of this suite starts ─────────
-- The availability model moved no data; 20261221090000 then opened exactly
-- three markets and 44 definitions, and nothing else is public_pilot.
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.sp_market_packs
                    WHERE pilot_state='public_pilot' AND code IN ('GB','GB-NI','AE-DU'))
   AND (SELECT count(*)=3 FROM public.sp_market_packs WHERE pilot_state='public_pilot')
   AND (SELECT count(*)=44 FROM public.sp_credential_types
         WHERE pilot_state='public_pilot' AND market_pack_code IN ('GB','GB-NI','AE-DU'))
   AND (SELECT count(*)=44 FROM public.sp_credential_types WHERE pilot_state='public_pilot'),
 '1.1 only what 20261221090000 opened is public_pilot: the UK, Northern Ireland, Dubai and their 44 definitions');
SELECT pg_temp.ok((SELECT bool_and(NOT is_active AND legal_review_state='pending')
     FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU'))
   AND (SELECT NOT is_active AND pilot_state='closed' FROM public.sp_market_packs WHERE code='AE-AZ'),
 '1.2 the UK and Dubai are public pilots under pending review, never active; Abu Dhabi stays closed');
-- The groups below prove the TRANSITIONS, from the state 20261220090000 left:
-- the three markets in internal pilot. Pinned back for this transaction only.
\ir security_passport_route_a_markets_fixture.sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'GB')='closed'
   AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='GB' OR region='AE-DU'),
 '1.3 with the markets in internal pilot, an ordinary holder is offered no UK or Dubai credential');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',pg_temp.save_input('UK_SIA_LICENCE_DS')),
 'SP_APPROVED_DEFINITION_REQUIRED','1.4 and cannot save one');
RESET ROLE;

-- ── 2. A market in the new state ─────────────────────────────────────────
-- Fixture, owner-side and rolled back: the UK and Dubai move to public_pilot.
-- Nothing else about them changes.
UPDATE public.sp_market_packs SET pilot_state='public_pilot' WHERE code IN ('GB','AE-DU');
UPDATE public.sp_credential_types SET pilot_state='public_pilot'
 WHERE market_pack_code IN ('GB','AE-DU') AND pilot_state='internal_pilot';
SELECT pg_temp.ok((SELECT bool_and(NOT is_active AND legal_review_state='pending') FROM public.sp_market_packs WHERE code IN ('GB','AE-DU'))
   AND (SELECT bool_and(NOT is_active) FROM public.sp_credential_types WHERE market_pack_code IN ('GB','AE-DU')),
 '2.1 the new state changes availability only: is_active stays false, the legal review stays pending');
SELECT pg_temp.refused($q$UPDATE public.sp_market_packs SET is_active=true WHERE code='GB'$q$,
 'sp_market_pack_active_needs_review','2.2 and a public-pilot pack still cannot be made active over a pending review');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'GB')='public_pilot' AND public.sp_market_access(auth.uid(),'AE-DU')='public_pilot'
   AND public.sp_market_access(auth.uid(),'AE-AZ')='closed' AND public.sp_market_access(auth.uid(),'SE')='production',
 '2.3 the canonical market decision reports public_pilot for an ordinary holder, closed for Abu Dhabi');
SELECT pg_temp.ok((SELECT count(*)>0 FROM public.sp_approved_credential_catalogue WHERE country='GB' AND region IS NULL)
   AND (SELECT count(*)>0 FROM public.sp_approved_credential_catalogue WHERE region='AE-DU')
   AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 '2.4 the catalogue offers UK and Dubai credentials to a holder with no grant, and still no Abu Dhabi one');
SELECT pg_temp.ok((SELECT count(*)=13 FROM public.sp_credential_types WHERE market_pack_code='GB'),
 '2.5 the definitions themselves are readable to that holder (every layer agrees)');
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_DS')) AS gb_claim \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_DU_SIRA_CARD_GUARD')) AS du_claim \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('AE_DU_BASIC_FIRE_SAFETY')) AS du_course \gset
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.sp_claims WHERE id IN (:'gb_claim',:'du_claim',:'du_course')
     AND holder_user_id=auth.uid() AND lifecycle_state='active' AND assertion_level='self_declared'),
 '2.6 the holder saves a UK licence, a Dubai card and a Dubai course through the real RPC, self-declared');
SELECT pg_temp.ok((SELECT jurisdiction_code='GB' AND sub_jurisdiction_code IS NULL FROM public.sp_claims WHERE id=:'gb_claim')
   AND (SELECT jurisdiction_code='AE' AND sub_jurisdiction_code='AE-DU' AND authorisation_scope IS NOT NULL FROM public.sp_claims WHERE id=:'du_claim'),
 '2.7 each is filed under the definition''s own jurisdiction -- Dubai, never the whole UAE');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_pilot_members WHERE user_id='fe220000-0000-4000-8000-000000000001'),
 '2.8 no grant was created for that holder');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000001',true);
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   jsonb_build_object('definition_code','AE_AZ_PSBD_LICENCE_GUARD','market_country','AE','market_region','AE-AZ','identifier','',
     'issued_on','2024-05-01','valid_until','2029-05-01','no_expiry',false,'authorisation_scope','Fiktivt bolag')),
 'SP_APPROVED_DEFINITION_REQUIRED','2.9 Abu Dhabi stays closed');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   pg_temp.save_input('AE_DU_SIRA_CARD_GUARD')-'authorisation_scope'),
 'SP_CREDENTIAL_REQUIRES_SCOPE','2.10 a scoped Dubai card still requires its scope');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   pg_temp.save_input('UK_SIA_LICENCE_DS')||jsonb_build_object('issuer_name','Fake SIA')),
 'SP_ISSUER_IS_GOVERNED','2.11 a governed issuer still cannot be restated');
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET assertion_level=''verified'' WHERE id=%L',:'gb_claim'),
 'SP_TRUST_FIELD_IMMUTABLE','2.12 and the holder still cannot raise their own trust');
RESET ROLE;
-- A single definition is held back the way it always was: pilot_state 'closed'.
UPDATE public.sp_credential_types SET pilot_state='closed' WHERE code='UK_SIA_LICENCE_CP';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_approved_credential_catalogue WHERE code='UK_SIA_LICENCE_CP')
   AND EXISTS (SELECT 1 FROM public.sp_approved_credential_catalogue WHERE code='UK_SIA_LICENCE_DS'),
 '2.13 one held-back definition leaves the catalogue; the rest of its market stays open');
RESET ROLE;

-- ── 3. Blocked registration cannot be bypassed through UPDATE ────────────
-- While UK_SIA_LICENCE_CCTV is open, the second holder registers it, keeps a
-- draft of it and saves another, reviewable one. Then it is withdrawn.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000002',true);
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_CCTV')) AS cctv \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_CCTV')) AS cctv_review \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_CCTV')) AS cctv_dates \gset
INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,lifecycle_state)
SELECT auth.uid(),d.claim_type,d.code,d.name_en,d.issuer_name,d.country,'draft'
  FROM public.sp_approved_credential_catalogue d WHERE d.code='UK_SIA_LICENCE_CCTV'
RETURNING id AS cctv_draft \gset
RESET ROLE;
UPDATE public.sp_credential_types SET pilot_state='closed' WHERE code='UK_SIA_LICENCE_CCTV';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000002',true);
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   jsonb_build_object('definition_code','UK_SIA_LICENCE_CCTV','market_country','GB','market_region','','identifier','',
     'issued_on','2024-05-01','valid_until','2029-05-01','no_expiry',false)),
 'SP_APPROVED_DEFINITION_REQUIRED','3.1 the withdrawn definition cannot be newly registered');
SELECT pg_temp.ok((SELECT lifecycle_state='active' AND assertion_level='self_declared' FROM public.sp_claims WHERE id=:'cctv'),
 '3.2 but the existing claim is still visible to its holder, active, with its trust unchanged');
SELECT public.sp_withdraw_claim(:'cctv','No longer relevant');
SELECT pg_temp.ok((SELECT lifecycle_state='withdrawn' FROM public.sp_claims WHERE id=:'cctv'),
 '3.3 the holder withdraws it: maintenance needs no availability');
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET lifecycle_state=''active'' WHERE id=%L',:'cctv'),
 'SP_APPROVED_DEFINITION_REQUIRED','3.4 reactivating it through an UPDATE is a registration, and is refused');
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET lifecycle_state=''active'', valid_until=''2029-05-01'' WHERE id=%L',:'cctv_draft'),
 'SP_APPROVED_DEFINITION_REQUIRED','3.5 so is activating a draft of it');
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET credential_code=''UK_SIA_LICENCE_DS'' WHERE id=%L',:'cctv_review'),
 'SP_DEFINITION_IMMUTABLE','3.6 a claim cannot be turned into another credential in place');
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET jurisdiction_code=''SE'' WHERE id=%L',:'cctv_review'),
 'SP_APPROVED_DEFINITION_REQUIRED','3.7 nor moved to another jurisdiction');
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET credential_reference=''EDITED'' WHERE id=%L',:'cctv_review'),
 'SP_APPROVED_DEFINITION_REQUIRED','3.8 nor edited in place while its definition is withdrawn');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   jsonb_build_object('claim_id',:'cctv_review','version',1,'definition_code','UK_SIA_LICENCE_CCTV','market_country','GB','market_region','',
     'identifier','','issued_on','2024-05-01','valid_until','2030-05-01','no_expiry',false)),
 'SP_APPROVED_DEFINITION_REQUIRED','3.9 and a correction, which writes a new version, is refused too');
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_claims WHERE holder_user_id=auth.uid() AND credential_code='UK_SIA_LICENCE_CCTV')
   AND EXISTS (SELECT 1 FROM public.sp_credential_types WHERE code='UK_SIA_LICENCE_CCTV'),
 '3.10 nothing was hidden: all four records and their definition stay readable to their holder');
RESET ROLE;

-- ── 4. Maintenance and review after a withdrawal, and after a revocation ──
-- (a) The withdrawn definition's reviewable claim.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000002',true);
SELECT public.sp_attach_evidence(:'cctv_review'::uuid,NULL,'fe220000-0000-4000-8000-000000000002/sia-cctv.pdf','licence.pdf','application/pdf',4096,repeat('ab',32));
SELECT public.sp_submit_for_verification(:'cctv_review'::uuid,NULL,'cqrityjob_review',NULL) AS req_withdrawn \gset
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_evidence WHERE claim_id=:'cctv_review') AND :'req_withdrawn' IS NOT NULL,
 '4.1 after the withdrawal the holder still adds evidence and asks for review');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000003',true);
SELECT public.sp_verifier_decide(:'req_withdrawn'::uuid,'approved','document_review','Licence checked against the document','',NULL,NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT assertion_level='verified' AND lifecycle_state='active' FROM public.sp_claims WHERE id=:'cctv_review'),
 '4.2 and a reviewer holding no grant records the decision (G3)');
-- A decision that also RE-DATES the claim edits holder content, so it follows
-- the registration rule: refused on a withdrawn definition, stated plainly.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000002',true);
SELECT public.sp_attach_evidence(:'cctv_dates'::uuid,NULL,'fe220000-0000-4000-8000-000000000002/sia-cctv-2.pdf','licence.pdf','application/pdf',4096,repeat('ba',32));
SELECT public.sp_submit_for_verification(:'cctv_dates'::uuid,NULL,'cqrityjob_review',NULL) AS req_dates \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000003',true);
SELECT pg_temp.refused(format('SELECT public.sp_verifier_decide(%L::uuid,''approved'',''document_review'',''Checked'','''',''2024-06-01'',''2030-06-01'')',:'req_dates'),
 'SP_APPROVED_DEFINITION_REQUIRED','4.2a a decision that re-dates a withdrawn definition''s claim edits holder content, and is refused');
SELECT public.sp_verifier_decide(:'req_dates'::uuid,'approved','document_review','Checked against the document','',NULL,NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT assertion_level='verified' AND valid_until='2029-05-01' FROM public.sp_claims WHERE id=:'cctv_dates'),
 '4.2b while the same decision on the holder''s own dates is recorded');
-- (b) A public-pilot Dubai claim, decided by the same reviewer.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000001',true);
SELECT public.sp_attach_evidence(:'du_claim'::uuid,NULL,'fe220000-0000-4000-8000-000000000001/sira.pdf','card.pdf','application/pdf',4096,repeat('cd',32));
SELECT public.sp_submit_for_verification(:'du_claim'::uuid,NULL,'cqrityjob_review',NULL) AS req_du \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000003',true);
SELECT public.sp_verifier_decide(:'req_du'::uuid,'approved','document_review','Card checked against the document','',NULL,NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT assertion_level='verified' FROM public.sp_claims WHERE id=:'du_claim'),
 '4.3 the same reviewer decides a Dubai claim');
-- (c) Northern Ireland stays an INTERNAL pilot: a named member registers,
-- then the grant is revoked.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000005',true);
SELECT public.sp_grant_pilot_member('fe220000-0000-4000-8000-000000000004','GB-NI','Fixture: NI member');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000004',true);
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_VI')) AS ni_claim \gset
SELECT public.sp_save_international_credential(pg_temp.save_input('UK_SIA_LICENCE_VI')) AS ni_second \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000005',true);
SELECT public.sp_revoke_pilot_member('fe220000-0000-4000-8000-000000000004','GB-NI');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000004',true);
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   jsonb_build_object('definition_code','UK_SIA_LICENCE_VI','market_country','GB','market_region','GB-NI','identifier','',
     'issued_on','2024-05-01','valid_until','2029-05-01','no_expiry',false)),
 'SP_APPROVED_DEFINITION_REQUIRED','4.4 after the revocation, the former member cannot register again');
SELECT public.sp_attach_evidence(:'ni_claim'::uuid,NULL,'fe220000-0000-4000-8000-000000000004/sia-vi.pdf','licence.pdf','application/pdf',4096,repeat('ef',32));
SELECT public.sp_submit_for_verification(:'ni_claim'::uuid,NULL,'cqrityjob_review',NULL) AS req_ni \gset
SELECT public.sp_withdraw_claim(:'ni_second','Duplicate');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_evidence WHERE claim_id=:'ni_claim')
   AND (SELECT lifecycle_state='withdrawn' FROM public.sp_claims WHERE id=:'ni_second'),
 '4.5 but still adds evidence, asks for review and withdraws a claim they already have');
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET lifecycle_state=''active'' WHERE id=%L',:'ni_second'),
 'SP_APPROVED_DEFINITION_REQUIRED','4.6 while reactivating one stays a registration, and is refused');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000003',true);
SELECT public.sp_verifier_decide(:'req_ni'::uuid,'approved','document_review','Licence checked against the document','',NULL,NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT assertion_level='verified' FROM public.sp_claims WHERE id=:'ni_claim'),
 '4.7 and a reviewer holding no grant decides the internal-pilot claim (G3)');
SELECT pg_temp.ok((SELECT revoked_at IS NOT NULL FROM public.sp_pilot_members
    WHERE user_id='fe220000-0000-4000-8000-000000000004' AND market_pack_code='GB-NI'),
 '4.8 the revoked grant stays on record as history');

-- ── 5. Each write layer holds the line on its own ────────────────────────
-- The catalogue guard fires first and would hide the claim rules. Stood down
-- here, inside the rolled-back transaction, to prove the rules alone refuse.
ALTER TABLE public.sp_claims DISABLE TRIGGER sp_00_closed_catalogue;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000001',true);
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,valid_until)
   VALUES (auth.uid(),'licence','UK_SIA_LICENCE_VI','Door Supervision (Vehicle Immobilisation)','Security Industry Authority','GB','GB-NI','2029-05-01')$q$,
 'not open for new registration','5.1 the claim rules alone refuse a registration in a market not open to the caller');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fe220000-0000-4000-8000-000000000002',true);
SELECT pg_temp.refused(format('UPDATE public.sp_claims SET lifecycle_state=''active'' WHERE id=%L',:'cctv'),
 'SP_CREDENTIAL_NOT_AVAILABLE','5.2 and alone refuse the reactivation of a withdrawn definition''s claim');
SELECT public.sp_withdraw_claim(:'cctv_review','Holder archives it');
SELECT pg_temp.ok((SELECT lifecycle_state='withdrawn' AND assertion_level='verified' FROM public.sp_claims WHERE id=:'cctv_review'),
 '5.3 while withdrawing a claim still passes them, with its verification history kept');
RESET ROLE;
ALTER TABLE public.sp_claims ENABLE TRIGGER sp_00_closed_catalogue;
SELECT pg_temp.ok((SELECT prosrc NOT LIKE '%legal review:%' FROM pg_proc WHERE oid='public.sp_claims_credential_rules()'::regprocedure),
 '5.4 the market gate no longer names the legal review as the reason');

ROLLBACK;
