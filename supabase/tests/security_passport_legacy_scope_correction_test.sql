-- Closed catalogue successor to legacy scope correction coverage.
-- Historical SV remains readable/reviewable/withdrawable. A candidate cannot
-- turn its legacy scope or issuer into a new governed definition. Personal
-- corrections on approved definitions still version history and reset trust.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF _cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %',_label; END IF;
RAISE NOTICE 'ok  %',_label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.denied(_sql text,_error text,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE _sql;
 EXCEPTION WHEN OTHERS THEN
  IF position(_error IN SQLERRM)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % wrong error %',_label,SQLERRM; END IF;
  RAISE NOTICE 'ok  %',_label; RETURN;
 END;
 RAISE EXCEPTION 'ASSERTION FAILED: % succeeded',_label;
END $$;
DO $$
DECLARE
 _h uuid:='00000000-0000-0000-0000-00000000a101';
 _v uuid:='00000000-0000-0000-0000-00000000a199';
 _other uuid:='00000000-0000-0000-0000-00000000a102';
 _legacy uuid:='a1000000-0000-4000-8000-00000000d001';
 _scoped uuid:='a1000000-0000-4000-8000-00000000d003';
 _ov uuid; _new uuid; _before jsonb; _scope text; _scoped_before jsonb; _scoped_new uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(_h),(_v),(_other) ON CONFLICT DO NOTHING;
 -- Owner-only pre-catalogue fixture; no candidate mutation runs with a disabled guard.
 ALTER TABLE public.sp_claims DISABLE TRIGGER sp_00_closed_catalogue;
 UPDATE public.sp_credential_types SET requires_scope=false WHERE code='SV';
 INSERT INTO public.sp_claims(id,holder_user_id,claim_type,title,credential_code,jurisdiction_code,claimed_issuer_name,valid_until,assertion_level,verified_by_user_id,verified_at)
 VALUES(_legacy,_h,'licence','Skyddsvaktsförordnande','SV','SE','Länsstyrelsen',current_date+300,'verified',_v,now());
 UPDATE public.sp_credential_types SET requires_scope=true WHERE code='SV';
 INSERT INTO public.sp_claims(id,holder_user_id,claim_type,title,credential_code,jurisdiction_code,claimed_issuer_name,valid_until,authorisation_scope)
 VALUES(_scoped,_h,'licence','Skyddsvaktsförordnande','SV','SE','Länsstyrelsen',current_date+300,'Skyddsobjekt: Hamnen');
 ALTER TABLE public.sp_claims ENABLE TRIGGER sp_00_closed_catalogue;
 SELECT to_jsonb(c) INTO _before FROM public.sp_claims c WHERE id=_legacy;
 PERFORM pg_temp.ok((_before->>'assertion_level')='verified','1.1 historical verified record exists');
 PERFORM pg_temp.ok((_before->>'authorisation_scope') IS NULL,'1.2 historical missing scope is not invented');
 -- Since 20261126090000 SV IS selectable, with its scope as a required field.
 -- The historical record above still has none, and none is invented for it.
 PERFORM pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue WHERE code='SV')
   AND (SELECT requires_scope FROM public.sp_credential_types WHERE code='SV'),'1.3 SV is selectable and still requires its scope');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_h::text,true);
 PERFORM pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_legacy),'2.1 holder can read historical record');
 PERFORM pg_temp.denied(format('SELECT public.sp_correct_claim(%L,''Skyddsvaktsförordnande'',''Candidate issuer'',''SE'',NULL,NULL,current_date+300,''Edit'',''SV'',NULL,NULL)',_legacy),'SP_GOVERNED_METADATA_IMMUTABLE','2.2 legacy correction cannot create a candidate issuer');
 -- 3.1 A scope can never be BLANKED: the definition requires one.
 PERFORM pg_temp.denied(format('SELECT public.sp_correct_claim(%L,''Skyddsvaktsförordnande'',''Länsstyrelsen'',''SE'',NULL,NULL,current_date+300,''Edit'',''SV'',NULL,NULL,NULL,NULL,NULL,%L)',_scoped,'   '),'SP_CREDENTIAL_REQUIRES_SCOPE','3.1 a recorded scope cannot be blanked');
 -- 3.2 / 3.3 The VERIFIED historical record cannot be edited in place, by any route.
 PERFORM pg_temp.denied(format('UPDATE public.sp_claims SET authorisation_scope=''New scope'' WHERE id=%L',_legacy),'row-level security','3.2 direct SQL cannot supply the missing scope on a verified record');
 PERFORM pg_temp.denied(format('UPDATE public.sp_claims SET credential_reference=''REF'' WHERE id=%L',_legacy),'SP_CREDENTIAL_REQUIRES_SCOPE','3.3 a verified record without its scope cannot be re-authored through an instance edit');
 -- 3.4 Since 20261126090000 SV is selectable, so a holder CAN correct the scope of
 -- their own SELF-DECLARED record — as a new version, never in place.
 RESET ROLE;
 SELECT to_jsonb(c) INTO _scoped_before FROM public.sp_claims c WHERE id=_scoped;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_h::text,true);
 SELECT public.sp_correct_claim(_scoped,'Skyddsvaktsförordnande','Länsstyrelsen','SE',NULL,NULL,current_date+300,'Correct scope','SV',NULL,NULL,NULL,NULL,NULL,'Skyddsobjekt: Flygplatsen') INTO _scoped_new;
 RESET ROLE;
 PERFORM pg_temp.ok((SELECT to_jsonb(c) FROM public.sp_claims c WHERE id=_legacy)=_before,'4.1 denied corrections preserve every original column');
 PERFORM pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE supersedes_id=_legacy),'4.2 denied corrections create no successor of the verified record');
 PERFORM pg_temp.ok((SELECT supersedes_id=_scoped AND authorisation_scope='Skyddsobjekt: Flygplatsen' AND assertion_level='self_declared' AND claimed_issuer_name='Länsstyrelsen' FROM public.sp_claims WHERE id=_scoped_new),
   '4.3 a corrected scope is a NEW self-declared version under the governed issuer');
 PERFORM pg_temp.ok((SELECT (to_jsonb(c)-'lifecycle_state'-'updated_at')=(_scoped_before-'lifecycle_state'-'updated_at') AND c.lifecycle_state='superseded' FROM public.sp_claims c WHERE id=_scoped),
   '4.4 the predecessor keeps every original column and is superseded, not rewritten');
 PERFORM pg_temp.ok((SELECT authorisation_scope FROM public.sp_claims WHERE id=_scoped)='Skyddsobjekt: Hamnen','4.3 historical scoped value is intact');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_other::text,true);
 PERFORM pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_legacy),'5.1 stranger cannot read historical record');
 PERFORM pg_temp.denied(format('SELECT public.sp_correct_claim(%L,''Skyddsvaktsförordnande'',''Länsstyrelsen'',''SE'',NULL,NULL,current_date+300,''Edit'',''SV'',NULL,NULL)',_legacy),'SP_NOT_HOLDER','5.2 stranger cannot correct historical record');
 RESET ROLE;
 -- Positive correction control uses an approved definition and personal reference.
 INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,valid_until,assertion_level,verified_by_user_id,verified_at)
 VALUES(_h,'licence','OV','Ordningsvaktsförordnande','Polismyndigheten','SE',current_date+300,'verified',_v,now()) RETURNING id INTO _ov;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_h::text,true);
 SELECT public.sp_correct_claim(_ov,'Ordningsvaktsförordnande','Polismyndigheten','SE',NULL,NULL,current_date+300,'Correct identifier','OV','NEW-REF',NULL) INTO _new;
 RESET ROLE;
 PERFORM pg_temp.ok(_new IS NOT NULL AND _new<>_ov,'6.1 permitted personal correction returns successor');
 PERFORM pg_temp.ok((SELECT supersedes_id=_ov AND version_no=2 FROM public.sp_claims WHERE id=_new),'6.2 successor preserves version chain');
 PERFORM pg_temp.ok((SELECT lifecycle_state='superseded' FROM public.sp_claims WHERE id=_ov),'6.3 predecessor superseded, not deleted');
 PERFORM pg_temp.ok((SELECT assertion_level='verified' AND verified_by_user_id=_v FROM public.sp_claims WHERE id=_ov),'6.4 historical verification retained on predecessor');
 PERFORM pg_temp.ok((SELECT assertion_level='self_declared' AND verified_by_user_id IS NULL AND verified_at IS NULL FROM public.sp_claims WHERE id=_new),'6.5 changed personal fact resets current trust');
 PERFORM pg_temp.ok((SELECT credential_code='OV' AND claimed_issuer_name='Polismyndigheten' AND jurisdiction_code='SE' AND authorisation_scope IS NULL FROM public.sp_claims WHERE id=_new),'6.6 governed identity retained');
 PERFORM pg_temp.ok((SELECT credential_reference='NEW-REF' FROM public.sp_claims WHERE id=_new),'6.7 permitted identifier persisted');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_h::text,true);
 PERFORM public.sp_withdraw_claim(_legacy,'Withdraw historical entry');
 RESET ROLE;
 PERFORM pg_temp.ok((SELECT lifecycle_state='withdrawn' FROM public.sp_claims WHERE id=_legacy),'7.1 historical unapproved claim can be withdrawn');
 PERFORM pg_temp.ok((SELECT assertion_level='verified' AND verified_by_user_id=_v FROM public.sp_claims WHERE id=_legacy),'7.2 withdrawal preserves verification history');
 -- Leave fixtures for the complete runner's rollback data-preservation checks.
END $$;

-- ── 8. The VERIFIED legacy record gains its scope through the governed save ──
-- Completion work order revision 3, PR 1 (A1). Everything above proves the
-- verified, scopeless record cannot be re-authored in place. This is the other
-- half: through the real save path the holder CAN correct it by stating the
-- scope, the correction is a new self-declared version that carries no
-- verification over, and the same save without a scope is refused.
--
-- It runs in its own transaction and rolls back, so the fixtures the complete
-- runner's rollback checks rely on are exactly what the block above leaves.
BEGIN;
DO $$
DECLARE
 _h uuid:='00000000-0000-0000-0000-00000000a104';
 _v uuid:='00000000-0000-0000-0000-00000000a199';
 _legacy uuid:='a1000000-0000-4000-8000-00000000d008';
 _d public.sp_approved_credential_catalogue%ROWTYPE;
 _before jsonb; _base jsonb; _new uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(_h),(_v) ON CONFLICT DO NOTHING;
 INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,sub_jurisdiction_code,work_location_confirmed_at)
 VALUES(_h,'SE',NULL,now());
 -- The same owner-only pre-catalogue fixture as above: a record verified
 -- before SV required its scope.
 ALTER TABLE public.sp_claims DISABLE TRIGGER sp_00_closed_catalogue;
 UPDATE public.sp_credential_types SET requires_scope=false WHERE code='SV';
 INSERT INTO public.sp_claims(id,holder_user_id,claim_type,title,credential_code,jurisdiction_code,claimed_issuer_name,valid_until,assertion_level,verified_by_user_id,verified_at)
 VALUES(_legacy,_h,'licence','Skyddsvaktsförordnande','SV','SE','Länsstyrelsen',current_date+300,'verified',_v,now());
 UPDATE public.sp_credential_types SET requires_scope=true WHERE code='SV';
 ALTER TABLE public.sp_claims ENABLE TRIGGER sp_00_closed_catalogue;
 SELECT * INTO _d FROM public.sp_approved_credential_catalogue WHERE code='SV';
 SELECT to_jsonb(c) INTO _before FROM public.sp_claims c WHERE id=_legacy;
 PERFORM pg_temp.ok((_before->>'assertion_level')='verified' AND (_before->>'authorisation_scope') IS NULL
   AND (SELECT requires_scope FROM public.sp_credential_types WHERE code='SV'),
   '8.1 fixture: a verified SV record with no scope, on a definition that now requires one');
 -- The input the Passport entry form sends for an edit (international.functions.ts).
 _base:=jsonb_build_object('claim_id',_legacy,'version',1,'definition_code','SV',
   'market_country',_d.country,'market_region',coalesce(_d.region,''),'identifier','',
   'issued_on',(current_date-400)::text,'valid_until',(current_date+300)::text,'no_expiry',false);
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_h::text,true);
 PERFORM pg_temp.denied(format('SELECT public.sp_save_international_credential(%L::jsonb)',_base),
   'SP_CREDENTIAL_REQUIRES_SCOPE','8.2 the governed save refuses to correct it without a scope');
 PERFORM pg_temp.denied(format('SELECT public.sp_save_international_credential(%L::jsonb)',
   _base||jsonb_build_object('authorisation_scope','   ')),
   'SP_CREDENTIAL_REQUIRES_SCOPE','8.3 a blank scope is no scope');
 RESET ROLE;
 PERFORM pg_temp.ok((SELECT to_jsonb(c) FROM public.sp_claims c WHERE id=_legacy)=_before
   AND NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE supersedes_id=_legacy),
   '8.4 the refused saves changed nothing and created no successor');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_h::text,true);
 _new:=public.sp_save_international_credential(_base||jsonb_build_object('authorisation_scope','Skyddsobjekt: Hamnen'));
 RESET ROLE;
 PERFORM pg_temp.ok(_new IS NOT NULL AND _new<>_legacy,'8.5 with a scope, the same save corrects the verified record');
 PERFORM pg_temp.ok((SELECT supersedes_id=_legacy AND version_no=2 AND lifecycle_state='active'
     AND authorisation_scope='Skyddsobjekt: Hamnen' FROM public.sp_claims WHERE id=_new),
   '8.6 the correction is the next version, active, carrying the stated scope');
 PERFORM pg_temp.ok((SELECT assertion_level='self_declared' AND verified_by_user_id IS NULL AND verified_at IS NULL
     FROM public.sp_claims WHERE id=_new),
   '8.7 the new version is self-declared: no verification carries over to a scope nobody reviewed');
 PERFORM pg_temp.ok((SELECT credential_code='SV' AND jurisdiction_code='SE' AND sub_jurisdiction_code IS NULL
     AND claimed_issuer_name=_d.issuer_name AND title=_d.name_en FROM public.sp_claims WHERE id=_new),
   '8.8 the governed identity is kept: code, country, governed issuer and title');
 PERFORM pg_temp.ok((SELECT lifecycle_state='superseded' AND assertion_level='verified' AND verified_by_user_id=_v
     AND authorisation_scope IS NULL
     AND (to_jsonb(c)-'lifecycle_state'-'updated_at')=(_before-'lifecycle_state'-'updated_at')
     FROM public.sp_claims c WHERE id=_legacy),
   '8.9 the verified predecessor is superseded, not rewritten: its history and missing scope stay as they were');
 PERFORM pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_credential_details WHERE claim_id=_new),
   '8.10 the new version has its credential details');
END $$;
ROLLBACK;
