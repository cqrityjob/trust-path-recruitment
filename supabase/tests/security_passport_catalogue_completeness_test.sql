-- Security Passport — CATALOGUE COMPLETENESS.
--
-- Every researched definition inside the agreed scope is accounted for, by its
-- stable code, and proven through the REAL path: visible in the approved
-- catalogue to the right principal, saved through sp_save_international_credential
-- with the contract its definition demands, and read back as that holder.
--
-- The expected set is PINNED here, code by code. A catalogue that silently
-- shrinks to "whatever the query returns" fails this suite, which is the point:
--
--   14 international certifications     (global, no market, no entitlement)
--    8 Sweden                           (production)
--   13 Great Britain + 1 Northern Ireland   (internal pilot)
--   30 Dubai                            (internal pilot)
--    7 Abu Dhabi                        (CLOSED by owner decision: never listed)
--
-- GB, GB-NI and Dubai definitions are NOT approved in the product. This suite
-- approves them INSIDE ITS OWN ROLLED-BACK TRANSACTION, as a catalogue
-- administrator would by reviewed migration, to prove that once the owner
-- approves a definition every one of them registers. It takes no decision for
-- the product and activates no market pack.
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

-- ── the pinned expectation ──────────────────────────────────────────────
CREATE TEMP TABLE expected(code text PRIMARY KEY, principal text NOT NULL);
INSERT INTO expected VALUES
 ('INTL_ASIS_APP','se'),('INTL_ASIS_CPP','se'),('INTL_ASIS_PCI','se'),('INTL_ASIS_PSP','se'),
 ('INTL_ISC2_CC','se'),('INTL_ISC2_CGRC','se'),('INTL_ISC2_SSCP','se'),('INTL_ISC2_CISSP','se'),('INTL_ISC2_CCSP','se'),
 ('INTL_ISACA_CISA','se'),('INTL_ISACA_CISM','se'),('INTL_ISACA_CRISC','se'),('INTL_ACFE_CFE','se'),('INTL_ACAMS_CAMS','se'),
 ('VU1','se'),('VU2','se'),('OV_TRAINING','se'),('OV_REFRESHER','se'),('OV_TRANSPORT','se'),('OV','se'),('SV','se'),('SE_PERSONNEL_APPROVAL','se'),
 ('UK_SIA_LICENCE_SG','gb'),('UK_SIA_LICENCE_DS','gb'),('UK_SIA_LICENCE_CCTV','gb'),('UK_SIA_LICENCE_CP','gb'),('UK_SIA_LICENCE_CVIT','gb'),
 ('UK_SIA_LICENCE_KH','gb'),('UK_SIA_LICENCE_NFL','gb'),
 ('UK_SIA_QUAL_SG','gb'),('UK_SIA_QUAL_DS','gb'),('UK_SIA_QUAL_CCTV','gb'),('UK_SIA_QUAL_CP','gb'),('UK_SIA_QUAL_CVIT','gb'),('UK_SIA_TOP_UP','gb'),
 ('UK_SIA_LICENCE_VI','ni'),
 ('AE_DU_SIRA_CARD_GUARD','du'),('AE_DU_SIRA_CARD_MONEY_TRANSPORT','du'),('AE_DU_SIRA_CARD_EVENT_GUARD','du'),('AE_DU_SIRA_CARD_BODYGUARD','du'),
 ('AE_DU_SIRA_CARD_WATCHMAN','du'),('AE_DU_SIRA_CARD_SUPERVISOR','du'),('AE_DU_SIRA_CARD_OPS_MANAGER','du'),('AE_DU_SIRA_CARD_SECURITY_MANAGER','du'),
 ('AE_DU_SIRA_CARD_HEAD_OF_SECURITY','du'),('AE_DU_SIRA_CARD_SYSTEMS_OPERATOR','du'),('AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN','du'),
 ('AE_DU_SIRA_CARD_SYSTEMS_ENGINEER','du'),('AE_DU_SIRA_CARD_TRAINER','du'),('AE_DU_SIRA_CARD_EXPERT','du'),('AE_DU_SIRA_CARD_CONSULTANT','du'),
 ('AE_DU_SIRA_GUARD_COURSE','du'),('AE_DU_SUPERVISOR_COURSE','du'),('AE_DU_OPS_MANAGER_COURSE','du'),('AE_DU_SECURITY_MANAGER_COURSE','du'),
 ('AE_DU_SYSTEMS_OPERATOR_COURSE','du'),('AE_DU_SYSTEMS_TECHNICIAN_COURSE','du'),('AE_DU_SYSTEMS_ENGINEER_COURSE','du'),('AE_DU_TRAINER_COURSE','du'),
 ('AE_DU_EVENTS_COURSE','du'),('AE_DU_CASH_TRANSPORT_COURSE','du'),('AE_DU_BASIC_FIRE_SAFETY','du'),('AE_DU_BASIC_LIFE_SUPPORT','du'),
 ('AE_DU_PEOPLE_OF_DETERMINATION','du'),('AE_DU_SPECIALIST_COURSE','du'),('AE_DU_FITNESS_CHECKED','du');
GRANT SELECT ON expected TO authenticated;
CREATE TEMP TABLE seen(code text PRIMARY KEY, principal text, claim_id uuid);
GRANT SELECT,INSERT ON seen TO authenticated;

SELECT pg_temp.ok((SELECT count(*)=66 FROM expected),'the pinned expectation is 66 definitions: 14 international, 8 Sweden, 13 GB, 1 NI, 30 Dubai');
SELECT pg_temp.ok((SELECT count(*)=73 FROM public.sp_credential_types),'the taxonomy holds 73 definitions: the 66 in scope and 7 Abu Dhabi rows');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM expected e WHERE NOT EXISTS(SELECT 1 FROM public.sp_credential_types t WHERE t.code=e.code)),
 'every pinned code is a real taxonomy row');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_credential_types t WHERE t.market_pack_code IS DISTINCT FROM 'AE-AZ' AND NOT EXISTS(SELECT 1 FROM expected e WHERE e.code=t.code)),
 'and no taxonomy row outside Abu Dhabi is missing from the expectation');
-- Organisation roles: every definition in scope names a regulator OR a governed issuer.
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM expected e WHERE NOT EXISTS(
   SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=e.code AND r.role='issuer')),
 'every definition in scope has an issuer role (governed, or stated on the document)');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM expected e JOIN public.sp_credential_types t ON t.code=e.code
   WHERE t.scope_code='national_regulated' AND NOT EXISTS(
   SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=e.code AND r.role='regulator' AND r.authority_id IS NOT NULL)),
 'every national definition in scope has a governed regulator');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_credential_organisation_roles r JOIN public.sp_authorities a ON a.id=r.authority_id
   WHERE r.role='training_provider' AND a.code<>'SE_POLISMYNDIGHETEN'),
 'no regulator is labelled a training provider, except the Police for the ordningsvakt courses it delivers itself');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM expected e WHERE NOT EXISTS(SELECT 1 FROM public.sp_credential_definition_reviews v WHERE v.credential_code=e.code)),
 'every definition in scope has a source-backed review row and a professional area');

-- ── fixtures ────────────────────────────────────────────────────────────
INSERT INTO auth.users(id,email) VALUES
 ('fc260000-0000-4000-8000-000000000001','complete-se@fixture.invalid'),
 ('fc260000-0000-4000-8000-000000000002','complete-gb@fixture.invalid'),
 ('fc260000-0000-4000-8000-000000000003','complete-ni@fixture.invalid'),
 ('fc260000-0000-4000-8000-000000000004','complete-du@fixture.invalid'),
 ('fc260000-0000-4000-8000-000000000009','complete-admin@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,sub_jurisdiction_code,work_location_confirmed_at) VALUES
 ('fc260000-0000-4000-8000-000000000001','SE',NULL,now()),
 ('fc260000-0000-4000-8000-000000000002','GB',NULL,now()),
 ('fc260000-0000-4000-8000-000000000003','GB','GB-NI',now()),
 ('fc260000-0000-4000-8000-000000000004','AE','AE-DU',now());
INSERT INTO public.sp_pilot_members(user_id,market_pack_code,granted_by,note) VALUES
 ('fc260000-0000-4000-8000-000000000002','GB','fc260000-0000-4000-8000-000000000009','completeness suite'),
 ('fc260000-0000-4000-8000-000000000003','GB-NI','fc260000-0000-4000-8000-000000000009','completeness suite'),
 ('fc260000-0000-4000-8000-000000000004','AE-DU','fc260000-0000-4000-8000-000000000009','completeness suite');

-- ── BEFORE any approval: what the product offers today ──────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=22 FROM public.sp_approved_credential_catalogue),
 'today a Swedish holder is offered 22: all 14 international and all 8 Swedish definitions, VU1, VU2 and SV included');
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.sp_approved_credential_catalogue WHERE code IN ('VU1','VU2','SV')),
 'VU1, VU2 and SV are no longer withheld');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='AE'),
 'today an entitled Dubai member is offered no Dubai definition: none is approved, and membership approves nothing');
RESET ROLE;

-- ── the administrator's approval, inside this rolled-back test only ─────
UPDATE public.sp_credential_types SET is_active=true WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active),
 'approving definitions activates no market pack');

-- ── every definition: visible, saved, read back ─────────────────────────
DO $$
DECLARE e record; d public.sp_approved_credential_catalogue%ROWTYPE; _t public.sp_credential_types%ROWTYPE;
 _uid uuid; _input jsonb; _id uuid; _c public.sp_claims%ROWTYPE; _n integer := 0;
BEGIN
 FOR e IN SELECT * FROM expected ORDER BY principal, code LOOP
  _uid := CASE e.principal WHEN 'se' THEN 'fc260000-0000-4000-8000-000000000001' WHEN 'gb' THEN 'fc260000-0000-4000-8000-000000000002'
                           WHEN 'ni' THEN 'fc260000-0000-4000-8000-000000000003' ELSE 'fc260000-0000-4000-8000-000000000004' END::uuid;
  SELECT * INTO _t FROM public.sp_credential_types WHERE code=e.code;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub',_uid::text,true);
  SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=e.code;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSERTION FAILED: % is not in the catalogue for its entitled holder',e.code; END IF;
  _input := jsonb_build_object('definition_code',e.code,'market_country',coalesce(d.country,''),'market_region',coalesce(d.region,''),
     'identifier','','issued_on','2024-05-01','valid_until','2027-05-01','no_expiry',false);
  IF _t.requires_scope THEN _input := _input || jsonb_build_object('authorisation_scope','Fiktivt bevakningsbolag AB'); END IF;
  IF d.issuer_name IS NULL THEN _input := _input || jsonb_build_object('issuer_name','Fiktiv Utbildning AB'); END IF;
  _id := public.sp_save_international_credential(_input);
  SELECT * INTO _c FROM public.sp_claims WHERE id=_id AND holder_user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSERTION FAILED: % saved but cannot be read back by its holder',e.code; END IF;
  IF _c.credential_code<>e.code OR _c.jurisdiction_code IS DISTINCT FROM d.country OR _c.sub_jurisdiction_code IS DISTINCT FROM d.region
     OR nullif(btrim(_c.claimed_issuer_name),'') IS NULL
     OR (d.issuer_name IS NOT NULL AND _c.claimed_issuer_name<>d.issuer_name)
     OR (d.issuer_name IS NULL AND _c.claimed_issuer_name<>'Fiktiv Utbildning AB')
     OR (_t.requires_scope AND _c.authorisation_scope IS DISTINCT FROM 'Fiktivt bevakningsbolag AB')
     OR (NOT _t.requires_scope AND _c.authorisation_scope IS NOT NULL)
     OR _c.assertion_level<>'self_declared' OR _c.lifecycle_state<>'active'
     OR NOT EXISTS(SELECT 1 FROM public.sp_credential_details x WHERE x.claim_id=_id)
  THEN RAISE EXCEPTION 'ASSERTION FAILED: % read back wrong: terr %/% issuer % scope % level %',e.code,_c.jurisdiction_code,_c.sub_jurisdiction_code,_c.claimed_issuer_name,_c.authorisation_scope,_c.assertion_level; END IF;
  INSERT INTO seen VALUES(e.code,e.principal,_id);
  RESET ROLE;
  _n := _n + 1;
 END LOOP;
 PERFORM pg_temp.ok(_n=66,'all 66 definitions in scope are visible to their entitled holder, save through the governed RPC and read back with the right territory, issuer and scope');
END $$;
RESET ROLE;

SELECT pg_temp.ok((SELECT count(*)=15+1 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id WHERE c.authorisation_scope IS NOT NULL),
 'exactly the 16 scoped definitions carry a scope: SV and the fifteen SIRA cards');
SELECT pg_temp.ok((SELECT count(*)=8 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id WHERE c.claimed_issuer_name='Fiktiv Utbildning AB'),
 'exactly the 8 document-issuer definitions carry a holder-stated issuer: VU1, VU2 and the six UK qualifications');
SELECT pg_temp.ok((SELECT count(*)=14 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id WHERE c.jurisdiction_code IS NULL AND c.sub_jurisdiction_code IS NULL),
 'the 14 international certifications carry no country: they did not inherit the holder''s');

-- ── Abu Dhabi stays closed even with its definitions approved ───────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 'Abu Dhabi is offered to nobody, a Dubai member included: the market is closed, not in pilot');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"AE-AZ","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag"}')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','an Abu Dhabi licence cannot be saved');

-- ── the scope contract ──────────────────────────────────────────────────
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}')$q$,
 'SP_CREDENTIAL_REQUIRES_SCOPE','a SIRA card without its company is refused: the scope requirement was not removed');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false,"authorisation_scope":"   "}')$q$,
 'SP_CREDENTIAL_REQUIRES_SCOPE','a blank scope is not a scope');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_BASIC_FIRE_SAFETY","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag"}')$q$,
 'SP_SCOPE_NOT_APPLICABLE','a course cannot carry a scope it does not have');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_DU_SIRA_CARD_GUARD","market_country":"AE","market_region":"AE-DU","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false,"authorisation_scope":"Fiktivt bolag","issuer_name":"Fake SIRA"}')$q$,
 'SP_ISSUER_IS_GOVERNED','a governed issuer cannot be replaced by the holder');
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,valid_until)
  SELECT auth.uid(),'licence','AE_DU_SIRA_CARD_WATCHMAN',name_en,issuer_name,country,region,'2030-01-01' FROM public.sp_approved_credential_catalogue WHERE code='AE_DU_SIRA_CARD_WATCHMAN'$q$,
 'SP_CREDENTIAL_REQUIRES_SCOPE','a direct table insert cannot bypass the scope either');
RESET ROLE;

-- ── the document-issuer contract ────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000001',true);
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"VU1","market_country":"SE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"","no_expiry":false}')$q$,
 'SP_CREDENTIAL_REQUIRES_ISSUER','VU1 without the training provider on the certificate is refused');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"OV","market_country":"SE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false,"issuer_name":"Fake Police"}')$q$,
 'SP_ISSUER_IS_GOVERNED','an ordningsvakt appointment is issued by the Police and by nobody the holder names');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","identifier":"","issued_on":"2024-05-01","issuer_name":"ASIS"}')$q$,
 'SP_ISSUER_IS_GOVERNED','an international certification keeps its governed awarding body');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","identifier":"","issued_on":"2024-05-01","title":"My own certification"}')$q$,
 'SP_INVALID_CREDENTIAL_INPUT','the catalogue is still closed: a holder cannot name a credential of their own');

-- ── a national credential keeps its own jurisdiction when the holder moves ─
RESET ROLE;
UPDATE public.sp_passport_profiles SET jurisdiction_code='GB', sub_jurisdiction_code=NULL WHERE holder_user_id='fc260000-0000-4000-8000-000000000001';
SELECT pg_temp.ok((SELECT jurisdiction_code='SE' FROM public.sp_claims c JOIN seen s ON s.claim_id=c.id WHERE s.code='OV')
 AND (SELECT jurisdiction_code IS NULL FROM public.sp_claims c JOIN seen s ON s.claim_id=c.id WHERE s.code='INTL_ASIS_CPP'),
 'after the holder''s work country changes, OV is still Swedish and CPP is still without a country');

-- ── disclosure: a document-stated issuer and a scoped credential ────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000001',true);
SELECT public.sp_create_credential_disclosure_v2(ARRAY[(SELECT claim_id FROM seen WHERE code='VU1'),(SELECT claim_id FROM seen WHERE code='SV')]::uuid[],'{}',7,NULL,NULL,'en','fc260000-0000-4000-8000-000000000091') AS share \gset
RESET ROLE;
INSERT INTO public.sp_share_sessions(disclosure_id,session_hash,expires_at)
 VALUES((:'share'::jsonb->>'disclosure_id')::uuid,encode(digest(repeat('c',64),'sha256'),'hex'),now()+interval '20 minutes');
SELECT public.sp_get_disclosure_session(repeat('c',64)) AS payload \gset
SELECT pg_temp.ok(jsonb_array_length(:'payload'::jsonb->'verified_claims')=2,'only the two selected credentials are disclosed out of twenty-two');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
 WHERE c->>'credential_code'='VU1' AND c->>'issuer'='Fiktiv Utbildning AB'),'VU1 discloses the training provider the holder stated, not nothing');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
 WHERE c->>'credential_code'='SV' AND (c->>'scope_limited')::boolean AND c->'authorisation_scope'='null'::jsonb AND c->>'issuer'='Länsstyrelsen'),
 'SV discloses that it is scope-limited, withholds the scope text, and names Länsstyrelsen');
SELECT pg_temp.ok(position('Fiktivt bevakningsbolag AB' IN :'payload')=0,'the scope text itself is not in the anonymous package');
ROLLBACK;
