-- The United States as a stated country and a wanted destination (20270218090000).
--
--   1. The rows exist, and NOTHING regulatory names the country: no pack, no
--      definition, no authority, no sub-jurisdiction; the canonical market
--      decision answers closed; the approved catalogue offers nothing there.
--   2. A holder may STATE the United States as their work country, may WANT it
--      as a destination, may file provenance (a practical skill, an employment
--      period) there -- and may not file a regulated credential there, nor
--      move an existing credential there by changing their country.
--   3. The four facts stay apart: stating the country rewrites no claim.
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
CREATE FUNCTION pg_temp.save_input(_code text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _in jsonb;
BEGIN
 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=_code;
 IF NOT FOUND THEN RETURN jsonb_build_object('definition_code',_code,'market_country','','market_region',''); END IF;
 _in:=jsonb_build_object('definition_code',d.code,'market_country',coalesce(d.country,''),'market_region',coalesce(d.region,''),
   'identifier','','issued_on','2024-05-01','valid_until','2029-05-01','no_expiry',false);
 IF (SELECT requires_scope FROM public.sp_credential_types WHERE code=_code) THEN
   _in:=_in||jsonb_build_object('authorisation_scope','Fiktivt bevakningsbolag AB'); END IF;
 IF d.issuer_name IS NULL THEN _in:=_in||jsonb_build_object('issuer_name','Fiktiv Utbildning AB'); END IF;
 RETURN _in;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('fd180000-0000-4000-8000-000000000001','us-holder@fixture.invalid'),
 ('fd180000-0000-4000-8000-000000000002','us-other@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,sub_jurisdiction_code,work_location_confirmed_at) VALUES
 ('fd180000-0000-4000-8000-000000000001','SE',NULL,now());

-- ── 1. The rows, and the absence around them ───────────────────────────
SELECT pg_temp.ok((SELECT is_active AND name_sv='USA' AND name_en='United States' FROM public.sp_jurisdictions WHERE code='US'),
 '1.1 the United States is a jurisdiction a person may state: active, named in both languages');
SELECT pg_temp.ok((SELECT jurisdiction_type='national' AND country_code='US' AND subdivision_code IS NULL AND is_active
                     FROM public.sp_credential_jurisdictions WHERE code='US'),
 '1.2 and a national credential jurisdiction, so the international form''s country filter can name it');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_market_packs WHERE jurisdiction_code='US')
   AND NOT EXISTS(SELECT 1 FROM public.sp_credential_types WHERE jurisdiction_code='US')
   AND NOT EXISTS(SELECT 1 FROM public.sp_authorities WHERE jurisdiction_code='US')
   AND NOT EXISTS(SELECT 1 FROM public.sp_sub_jurisdictions WHERE jurisdiction_code='US')
   AND NOT EXISTS(SELECT 1 FROM public.sp_regulated_roles r JOIN public.sp_market_packs p ON p.code=r.market_pack_code WHERE p.jurisdiction_code='US'),
 '1.3 no market pack, definition, authority, state or regulated role names the United States');
SELECT pg_temp.ok(public.sp_market_access(NULL,'US')='closed','1.4 the canonical market decision is closed with no signed-in user');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd180000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'US')='closed' AND public.sp_market_access(auth.uid(),'SE')='production',
 '1.5 and closed for a signed-in holder, while Sweden stays production');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='US'),
 '1.6 the approved catalogue offers nothing under the United States');
SELECT pg_temp.ok((SELECT count(*)>0 FROM public.sp_approved_credential_catalogue WHERE scope_code='global_professional'),
 '1.7 the international certifications are still offered -- to this holder as to everyone, from any country');
RESET ROLE;

-- ── 2. What a holder may say, and may not ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd180000-0000-4000-8000-000000000001',true);
-- A Swedish credential exists BEFORE the country changes, so 2.5 can prove it survives.
SELECT public.sp_save_international_credential(pg_temp.save_input('VU1')) AS se_claim \gset
SELECT pg_temp.ok((SELECT jurisdiction_code='SE' AND sub_jurisdiction_code IS NULL AND lifecycle_state='active'
                     FROM public.sp_claims WHERE id=:'se_claim' AND holder_user_id=auth.uid()),
 '2.1 fixture: the holder registers a Swedish credential while working in Sweden');

UPDATE public.sp_passport_profiles SET jurisdiction_code='US', sub_jurisdiction_code=NULL, work_location_confirmed_at=now()
 WHERE holder_user_id=auth.uid();
SELECT pg_temp.ok((SELECT jurisdiction_code='US' AND sub_jurisdiction_code IS NULL AND work_location_confirmed_at IS NOT NULL
                     FROM public.sp_passport_profiles WHERE holder_user_id=auth.uid()),
 '2.2 the holder states that they work in the United States, and the foreign key accepts it');
SELECT pg_temp.refused($q$UPDATE public.sp_passport_profiles SET sub_jurisdiction_code='US-TX' WHERE holder_user_id=auth.uid()$q$,
 'violates','2.3 a state is refused until one is authored as a sub-jurisdiction: no US-TX exists');
SELECT pg_temp.refused($q$UPDATE public.sp_passport_profiles SET jurisdiction_code='NO' WHERE holder_user_id=auth.uid()$q$,
 'violates','2.4 a country nobody has added is still refused as a work country (the list is governed, not open)');

-- The four facts stay apart: the Swedish credential is untouched by the move.
SELECT pg_temp.ok((SELECT jurisdiction_code='SE' AND sub_jurisdiction_code IS NULL AND lifecycle_state='active' AND assertion_level='self_declared'
                     FROM public.sp_claims WHERE id=:'se_claim'),
 '2.5 the Swedish credential keeps its own country, status and trust after the work country moved');

-- Provenance may name the country: a practical skill, an employment period.
INSERT INTO public.sp_claims (holder_user_id, claim_type, skill_code, skill_level, title, jurisdiction_code, lifecycle_state)
 VALUES (auth.uid(),'practical_skill','driving_licence','B','Driver license','US','active');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_claims WHERE holder_user_id=auth.uid() AND skill_code='driving_licence' AND jurisdiction_code='US'),
 '2.6 a practical skill may carry the United States as its provenance');
INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, jurisdiction_code, started_on)
 VALUES (auth.uid(),'Fictional Security Services Inc.','Security Officer','US',DATE '2023-01-01');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_experience_periods WHERE holder_user_id=auth.uid() AND jurisdiction_code='US'),
 '2.7 and so may an employment period');

-- A regulated credential may not: no definition names this country.
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims (holder_user_id, claim_type, credential_code, title, claimed_issuer_name, jurisdiction_code, lifecycle_state)
  VALUES (auth.uid(),'training','VU1','Väktarutbildning 1','Fiktiv Utbildning AB','US','active')$q$,
 'SP_','2.8 a governed definition cannot be filed under the United States');
SELECT pg_temp.refused(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   pg_temp.save_input('VU1')||jsonb_build_object('market_country','US')),
 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET','2.9 nor through the governed save RPC');
SELECT pg_temp.refused(format($q$UPDATE public.sp_claims SET jurisdiction_code='US' WHERE id=%L$q$, :'se_claim'),
 'SP_','2.10 and an existing credential cannot be moved there by an update');

-- Destinations: the sixth value, and the rules around it.
INSERT INTO public.candidate_job_preferences(user_id,desired_destinations,relocation_interest)
 VALUES (auth.uid(),ARRAY['US','SE'],'open');
SELECT pg_temp.ok((SELECT desired_destinations=ARRAY['US','SE'] FROM public.candidate_job_preferences WHERE user_id=auth.uid()),
 '2.11 the holder may want to work in the United States, in their own order');
UPDATE public.candidate_job_preferences SET desired_destinations=ARRAY['IN','AE-DU','AE','GB','SE','US'] WHERE user_id=auth.uid();
SELECT pg_temp.ok((SELECT cardinality(desired_destinations)=6 FROM public.candidate_job_preferences WHERE user_id=auth.uid()),
 '2.12 all six destinations fit; the cap grew with the vocabulary');
SELECT pg_temp.refused($q$UPDATE public.candidate_job_preferences SET desired_destinations=ARRAY['US','US'] WHERE user_id=auth.uid()$q$,
 'candidate_job_preferences_destinations_distinct','2.13 a duplicate is still refused');
SELECT pg_temp.refused($q$UPDATE public.candidate_job_preferences SET desired_destinations=ARRAY['NO'] WHERE user_id=auth.uid()$q$,
 'check constraint','2.14 a destination outside the vocabulary is still refused');
SELECT pg_temp.refused($q$UPDATE public.candidate_job_preferences SET desired_destinations=ARRAY['US',NULL] WHERE user_id=auth.uid()$q$,
 'check constraint','2.15 and so is NULL');
RESET ROLE;

-- ── 3. Nobody else reads it ───────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd180000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.candidate_job_preferences)
   AND (SELECT count(*)=0 FROM public.sp_passport_profiles WHERE holder_user_id='fd180000-0000-4000-8000-000000000001'),
 '3.1 another holder reads neither the destination list nor the work country');
RESET ROLE;

ROLLBACK;
