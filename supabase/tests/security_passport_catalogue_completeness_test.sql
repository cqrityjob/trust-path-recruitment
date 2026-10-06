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
--    4 India                            (national qualifications: approved for
--                                        everyone, no market pack — 20261214090000)
--   13 Great Britain + 1 Northern Ireland   (public pilot)
--   30 Dubai                            (public pilot)
--    7 Abu Dhabi                        (public pilot since 20270220090000; NOT pinned
--                                        here: it carries no definition-review row, and
--                                        its own suite proves it)
--
-- THE PUBLIC PILOT (20261221090000). GB, GB-NI and Dubai definitions are
-- public_pilot and keep is_active = false for the WHOLE suite: nothing is
-- approved here, temporarily or otherwise. They are reached exactly as an
-- ordinary registered holder reaches them -- signed in, with NO pilot grant.
-- The members-only route (Route A) is proven on its own by the pilot suites,
-- which pin those markets back to internal pilot inside their transactions.
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
 ('IN_MEPSC_Q7101','se'),('IN_MEPSC_Q7201','se'),('IN_MEPSC_Q7104','se'),('IN_MEPSC_Q7204','se'),
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

SELECT pg_temp.ok((SELECT count(*)=70 FROM expected),'the pinned expectation is 70 definitions: 14 international, 8 Sweden, 4 India, 13 GB, 1 NI, 30 Dubai');
-- 20270213090000 (the certification research import) ADDED 140 definitions, inactive,
-- and 20270214090000 (the publication) activates exactly those. They are accounted for
-- here by name of their record and NEVER folded into the 70 pinned below: every count of
-- "the 70" excludes them, and the suite is true both before and after the publication.
-- Their own suite pins them one by one.
CREATE TEMP TABLE research_added AS
  SELECT credential_code AS code FROM public.sp_catalogue_research_records
   WHERE reconciliation_outcome='added_approved' AND credential_code IS NOT NULL;
CREATE TEMP TABLE research_active AS
  SELECT a.code FROM research_added a JOIN public.sp_credential_types t ON t.code=a.code WHERE t.is_active;
GRANT SELECT ON research_added, research_active TO authenticated;
SELECT pg_temp.ok((SELECT count(*)=77 FROM public.sp_credential_types t WHERE NOT EXISTS(SELECT 1 FROM research_added a WHERE a.code=t.code)),'the taxonomy holds 77 definitions outside the research import: the 70 in scope and 7 Abu Dhabi rows');
SELECT pg_temp.ok((SELECT count(*)=140 FROM research_added)
 AND (SELECT count(*) FROM research_active) IN (0, 140),
 'the research import added 140 definitions, and they are all inactive (before the publication) or all active (after it): never part-way, and never part of the 70');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM expected e WHERE NOT EXISTS(SELECT 1 FROM public.sp_credential_types t WHERE t.code=e.code)),
 'every pinned code is a real taxonomy row');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_credential_types t WHERE t.market_pack_code IS DISTINCT FROM 'AE-AZ' AND NOT EXISTS(SELECT 1 FROM expected e WHERE e.code=t.code) AND NOT EXISTS(SELECT 1 FROM research_added a WHERE a.code=t.code)),
 'and no taxonomy row outside Abu Dhabi and the research import is missing from the expectation');
-- Organisation roles: every definition in scope names a regulator OR a governed issuer.
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM expected e WHERE NOT EXISTS(
   SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=e.code AND r.role='issuer')),
 'every definition in scope has an issuer role (governed, or stated on the document)');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM expected e JOIN public.sp_credential_types t ON t.code=e.code
   WHERE t.scope_code IN ('national_regulated','national_qualification') AND NOT EXISTS(
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
-- No pilot grant for anybody: the UK and Dubai are a public pilot.
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_pilot_members WHERE user_id::text LIKE 'fc260000-%'),
 'no principal of this suite holds a pilot grant');

-- ── BEFORE any approval: what the product offers today ──────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=70 FROM public.sp_approved_credential_catalogue WHERE code NOT IN (SELECT code FROM research_added) AND region IS DISTINCT FROM 'AE-AZ')
 AND (SELECT count(*)=7 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 'today a Swedish holder, with no grant, is offered the 70 pinned here: all 14 international, all 8 Swedish (VU1, VU2 and SV included), the 4 Indian qualifications and the 44 UK and Dubai public-pilot definitions -- and, counted apart, Abu Dhabi''s 7 (public pilot since 20270220090000)');
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.sp_approved_credential_catalogue WHERE code IN ('VU1','VU2','SV')),
 'VU1, VU2 and SV are no longer withheld');
-- The researched definitions are offered exactly when they are active: every active one, no inactive one.
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_approved_credential_catalogue WHERE code IN (SELECT code FROM research_added))
   = (SELECT count(*) FROM research_active)
 AND NOT EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue c WHERE c.code IN (SELECT code FROM research_added) AND c.code NOT IN (SELECT code FROM research_active)),
 'a Swedish holder is offered every ACTIVE researched definition and no inactive one: nothing becomes selectable except by the publication');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=30 FROM public.sp_approved_credential_catalogue WHERE country='AE' AND region='AE-DU'),
 'an ordinary Dubai holder, with no grant, is offered all 30 Dubai public-pilot definitions, with none of them approved');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_credential_types WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active)
 AND (SELECT count(*)=0 FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active),
 'no pilot definition and no pilot market is active: this suite approves nothing');

-- ── NEW database, OLD application: never offered what its form cannot save ──
-- PostgREST publishes the request path and headers as settings. A listing with
-- no contract header is an application from before 20261126090000.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000001',true);
SELECT set_config('request.path','/sp_approved_credential_catalogue',true);
SELECT set_config('request.headers','{"user-agent":"an application deployed before the migration"}',true);
SELECT pg_temp.ok((SELECT count(*)=27 FROM public.sp_approved_credential_catalogue WHERE code NOT IN (SELECT code FROM research_added))
 AND NOT EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue c WHERE c.code IN ('VU1','VU2','SV'))
 AND NOT EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue c WHERE c.region='AE-DU'),
 'an OLD application lists the 27 it can save: no scoped and no document-issuer definition — so none of the four Indian qualifications and none of Dubai''s thirty, only the eight UK licences that need neither — is offered to it');
-- A researched definition needs no scope and no document issuer, so even an application from
-- before the contract can list and save it: the old application is offered all the active ones.
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_approved_credential_catalogue WHERE code IN (SELECT code FROM research_added))
   = (SELECT count(*) FROM research_active),
 'an OLD application is offered exactly the active researched definitions too: it can save every one of them');
SELECT set_config('request.headers','{"x-passport-catalogue-contract":"2"}',true);
SELECT pg_temp.ok((SELECT count(*)=70 FROM public.sp_approved_credential_catalogue WHERE code NOT IN (SELECT code FROM research_added) AND region IS DISTINCT FROM 'AE-AZ')
 AND (SELECT count(*)=7 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 'the NEW application declares the contract and is offered all 70, and Abu Dhabi''s 7 scoped licences with them');
SELECT set_config('request.path','/rpc/sp_save_international_credential',true);
SELECT set_config('request.headers','{}',true);
SELECT pg_temp.ok((SELECT count(*)=70 FROM public.sp_approved_credential_catalogue WHERE code NOT IN (SELECT code FROM research_added) AND region IS DISTINCT FROM 'AE-AZ')
 AND (SELECT count(*)=7 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ'),
 'the guard narrows the LISTING only: the save RPC and the table guards read the whole catalogue');
SELECT set_config('request.path','',true);
SELECT set_config('request.headers','',true);
RESET ROLE;
-- Abu Dhabi is a public pilot (20270220090000): offered as its own seven, approved by nobody.

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
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSERTION FAILED: % is not in the catalogue for an ordinary holder of its market',e.code; END IF;
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
 PERFORM pg_temp.ok(_n=70,'all 70 definitions in scope are visible to an ordinary holder with no grant, save through the governed RPC and read back with the right territory, issuer and scope');
END $$;
RESET ROLE;

SELECT pg_temp.ok((SELECT count(*)=15+1 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id WHERE c.authorisation_scope IS NOT NULL),
 'exactly the 16 scoped definitions carry a scope: SV and the fifteen SIRA cards');
SELECT pg_temp.ok((SELECT count(*)=27 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id WHERE c.claimed_issuer_name='Fiktiv Utbildning AB'),
 'exactly the 27 document-issuer definitions carry a holder-stated issuer: VU1, VU2, the four Indian qualifications, six UK qualifications and the fifteen Dubai courses and checks');
SELECT pg_temp.ok((SELECT count(*)=15 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id WHERE c.claimed_issuer_name='Security Industry Regulatory Agency')
 AND NOT EXISTS(SELECT 1 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id JOIN public.sp_credential_types t ON t.code=s.code
                 WHERE t.market_pack_code='AE-DU' AND t.category<>'appointment' AND c.claimed_issuer_name='Security Industry Regulatory Agency'),
 'SIRA is the issuer of the fifteen cadre cards and of no course: it approves the centres, it does not award the certificate');
SELECT pg_temp.ok((SELECT count(*)=14 FROM seen s JOIN public.sp_claims c ON c.id=s.claim_id WHERE c.jurisdiction_code IS NULL AND c.sub_jurisdiction_code IS NULL),
 'the 14 international certifications carry no country: they did not inherit the holder''s');

-- ── the researched definitions: saved and read back when active, refused when not ──
-- State-agnostic. Before 20270214090000 every one of the 140 is inactive and every save is
-- refused; after it every one is active and every save reads back as an international
-- certification with no country, its governed issuer and no scope.
CREATE TEMP TABLE research_seen(code text PRIMARY KEY, claim_id uuid);
GRANT SELECT,INSERT ON research_seen TO authenticated;
DO $$
DECLARE r record; d public.sp_approved_credential_catalogue%ROWTYPE; _id uuid; _c public.sp_claims%ROWTYPE;
 _saved integer := 0; _refused integer := 0; _msg text;
BEGIN
 FOR r IN SELECT a.code, EXISTS(SELECT 1 FROM research_active x WHERE x.code=a.code) AS active FROM research_added a ORDER BY a.code LOOP
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000001',true);
  IF r.active THEN
   SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=r.code;
   IF NOT FOUND THEN RAISE EXCEPTION 'ASSERTION FAILED: active researched definition % is not offered to an ordinary holder',r.code; END IF;
   _id := public.sp_save_international_credential(jsonb_build_object('definition_code',r.code,'market_country','','market_region','',
            'identifier','','issued_on','2024-05-01','valid_until','2027-05-01','no_expiry',false));
   SELECT * INTO _c FROM public.sp_claims WHERE id=_id AND holder_user_id=auth.uid();
   IF NOT FOUND OR _c.credential_code<>r.code OR _c.jurisdiction_code IS NOT NULL OR _c.sub_jurisdiction_code IS NOT NULL
      OR _c.claimed_issuer_name IS DISTINCT FROM d.issuer_name OR _c.authorisation_scope IS NOT NULL
      OR _c.assertion_level<>'self_declared' OR _c.lifecycle_state<>'active' THEN
     RAISE EXCEPTION 'ASSERTION FAILED: researched definition % read back wrong (territory %/% issuer % level %)',r.code,_c.jurisdiction_code,_c.sub_jurisdiction_code,_c.claimed_issuer_name,_c.assertion_level;
   END IF;
   INSERT INTO research_seen VALUES(r.code,_id);
   _saved := _saved + 1;
  ELSE
   BEGIN
    PERFORM public.sp_save_international_credential(jsonb_build_object('definition_code',r.code,'market_country','','market_region','',
            'identifier','','issued_on','2024-05-01','valid_until','2027-05-01','no_expiry',false));
    RAISE EXCEPTION 'ASSERTION FAILED: an inactive researched definition (%) was saved',r.code;
   EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF position('ASSERTION FAILED' IN _msg) > 0 THEN RAISE; END IF;
    IF position('SP_APPROVED_DEFINITION_REQUIRED' IN _msg) = 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % refused for another reason: %',r.code,_msg; END IF;
    _refused := _refused + 1;
   END;
  END IF;
  RESET ROLE;
 END LOOP;
 PERFORM pg_temp.ok(_saved + _refused = 140 AND _saved = (SELECT count(*) FROM research_active),
   'every researched definition is saved and read back as an international certification (when active) or refused as unapproved (when not): '||_saved||' saved, '||_refused||' refused');
END $$;
RESET ROLE;

-- ── Abu Dhabi: a public pilot of its own, approved by nobody ────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc260000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=7 FROM public.sp_approved_credential_catalogue WHERE region='AE-AZ')
 AND (SELECT count(*)=0 FROM public.sp_credential_types WHERE market_pack_code='AE-AZ' AND is_active),
 'Abu Dhabi is offered to a Dubai holder as its own seven, none of them approved: a public pilot since 20270220090000, proved in full by its own suite');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"AE_AZ_PSBD_LICENCE_GUARD","market_country":"AE","market_region":"AE-AZ","identifier":"","issued_on":"2024-05-01","valid_until":"2027-05-01","no_expiry":false}')$q$,
 'SP_CREDENTIAL_REQUIRES_SCOPE','an Abu Dhabi licence without the company it is tied to cannot be saved');

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
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"VU1","market_country":"SE","market_region":"","identifier":"","issued_on":"2024-05-01","valid_until":"","no_expiry":false,"issuer_name":"Polismyndigheten"}')$q$,
 'SP_ISSUER_IS_A_REGULATOR','the regulator cannot be named as the training provider of a course it does not deliver');
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
SELECT pg_temp.ok(jsonb_array_length(:'payload'::jsonb->'verified_claims')=2,'only the two selected credentials are disclosed out of twenty-six');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
 WHERE c->>'credential_code'='VU1' AND c->>'issuer'='Fiktiv Utbildning AB'),'VU1 discloses the training provider the holder stated, not nothing');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
 WHERE c->>'credential_code'='SV' AND (c->>'scope_limited')::boolean AND c->'authorisation_scope'='null'::jsonb AND c->>'issuer'='Länsstyrelsen'),
 'SV discloses that it is scope-limited, withholds the scope text, and names Länsstyrelsen');
SELECT pg_temp.ok(position('Fiktivt bevakningsbolag AB' IN :'payload')=0,'the scope text itself is not in the anonymous package');

-- ── a record from before the closed catalogue, whose issuer defaulted to the Police ──
-- Owner-only fixture: no candidate mutation runs with the guard disabled.
ALTER TABLE public.sp_claims DISABLE TRIGGER sp_00_closed_catalogue;
INSERT INTO public.sp_claims(id,holder_user_id,claim_type,title,credential_code,jurisdiction_code,claimed_issuer_name)
 VALUES('fc260000-0000-4000-8000-0000000000a1','fc260000-0000-4000-8000-000000000002','training','Security Guard Training 2 (VU2)','VU2','SE','Polismyndigheten');
ALTER TABLE public.sp_claims ENABLE TRIGGER sp_00_closed_catalogue;
SELECT pg_temp.ok((SELECT public.sp_credential_payload_v2('fc260000-0000-4000-8000-000000000002',ARRAY['fc260000-0000-4000-8000-0000000000a1']::uuid[],'{}',NULL,'en',now()+interval '1 day',now())
  #> '{verified_claims,0,issuer}')='null'::jsonb,
 'a legacy VU2 record whose issuer defaulted to the Police discloses NO issuer: a regulator is never presented as the trainer');
ROLLBACK;
