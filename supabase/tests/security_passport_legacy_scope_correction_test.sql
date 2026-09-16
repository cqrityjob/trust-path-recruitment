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
 _ov uuid; _new uuid; _before jsonb; _scope text;
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
 PERFORM pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue WHERE code='SV'),'1.3 candidate-scoped SV is not selectable');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',_h::text,true);
 PERFORM pg_temp.ok(EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_legacy),'2.1 holder can read historical record');
 PERFORM pg_temp.denied(format('SELECT public.sp_correct_claim(%L,''Skyddsvaktsförordnande'',''Candidate issuer'',''SE'',NULL,NULL,current_date+300,''Edit'',''SV'',NULL,NULL)',_legacy),'SP_APPROVED_DEFINITION_REQUIRED','2.2 legacy correction cannot create a candidate issuer');
 FOREACH _scope IN ARRAY ARRAY['New candidate scope','   '] LOOP
  PERFORM pg_temp.denied(format('SELECT public.sp_correct_claim(%L,''Skyddsvaktsförordnande'',''Länsstyrelsen'',''SE'',NULL,NULL,current_date+300,''Edit'',''SV'',NULL,NULL,NULL,NULL,NULL,%L)',_scoped,_scope),'SP_APPROVED_DEFINITION_REQUIRED','3.1 historical scope cannot be replaced or blanked');
 END LOOP;
 PERFORM pg_temp.denied(format('UPDATE public.sp_claims SET authorisation_scope=''New scope'' WHERE id=%L',_legacy),'SP_APPROVED_DEFINITION_REQUIRED','3.2 direct SQL cannot supply missing scope');
 PERFORM pg_temp.denied(format('UPDATE public.sp_claims SET credential_reference=''REF'' WHERE id=%L',_legacy),'SP_APPROVED_DEFINITION_REQUIRED','3.3 unapproved definition cannot be re-authored through instance edit');
 RESET ROLE;
 PERFORM pg_temp.ok((SELECT to_jsonb(c) FROM public.sp_claims c WHERE id=_legacy)=_before,'4.1 denied corrections preserve every original column');
 PERFORM pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE supersedes_id=_legacy OR supersedes_id=_scoped),'4.2 denied corrections create no successor');
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
