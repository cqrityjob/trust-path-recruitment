-- Local synthetic prerequisites formerly present only in a developer's database.
-- Run after interview-journey-fixture.sql, before context/continuity fixtures.
-- No hosted execution. The runner must validate its loopback database binding.
\set ON_ERROR_STOP on
\ir employer-final-report-fixture.sql
BEGIN;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
 email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
SELECT instance_id,'11110000-1111-4000-8000-000000000001','authenticated','authenticated',
 'uiowner@local.test',encrypted_password,now(),raw_app_meta_data,'{}',now(),now(),'','','','','','','',''
FROM auth.users WHERE id='9e000000-0000-4000-8000-000000000001'
ON CONFLICT(id) DO NOTHING;
INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
VALUES('11110000-1111-4000-8000-000000000001','11110000-1111-4000-8000-000000000001',
 '{"sub":"11110000-1111-4000-8000-000000000001","email":"uiowner@local.test","email_verified":true}',
 'email',now(),now(),now()) ON CONFLICT(provider,provider_id) DO NOTHING;
INSERT INTO public.employers(id,name,slug,status)
VALUES('11110000-1111-0000-0000-00000000000a','UI Vakt AB (synthetic)','ui-vakt','active') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.employer_memberships(user_id,employer_id,role,status)
VALUES('11110000-1111-4000-8000-000000000001','11110000-1111-0000-0000-00000000000a','owner','active') ON CONFLICT(user_id,employer_id) DO NOTHING;
INSERT INTO public.jobs(id,employer_id,slug,short_id,title_sv,title_en,status,application_method,requirements)
VALUES('aa112222-0000-0000-0000-000000000001','11110000-1111-0000-0000-00000000000a',
 'regression-ui-vaktare','RGUI01','Väktare','Security guard','draft','internal','["Erfarenhet av incidenthantering"]') ON CONFLICT(id) DO NOTHING;
UPDATE public.jobs SET status='published',expires_at=now()+interval '80 days' WHERE id='aa112222-0000-0000-0000-000000000001' AND status='draft';
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,consent_given_at,cover_note)
SELECT v.id,'aa112222-0000-0000-0000-000000000001','11110000-1111-0000-0000-00000000000a',v.candidate,now(),'Synthetic cover note'
FROM (VALUES ('aa113333-0000-0000-0000-000000000002'::uuid,'e4000000-0000-4000-8000-0000000000c1'::uuid),
 ('aa113333-0000-0000-0000-000000000003'::uuid,'9e000000-0000-4000-8000-0000000000c1'::uuid)) v(id,candidate) ON CONFLICT(id) DO NOTHING;
-- Uploaded CV metadata is sufficient here; the upload/download journey is exercised separately.
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,consent_given_at,cover_note,cv_source,cv_storage_path,cv_original_filename,cv_mime_type,cv_size_bytes)
SELECT 'e67aba08-88a9-4ca6-8042-895290ba0d64','e4000000-0000-4000-8000-00000000ff01',employer_id,
 '9e000000-0000-4000-8000-0000000000c1',now(),'Personligt brev bifogat. Synthetic fixture.',
 'upload','9e000000-0000-4000-8000-0000000000c1/regression/cv.pdf','synthetic-cv.pdf','application/pdf',100
FROM public.jobs WHERE id='e4000000-0000-4000-8000-00000000ff01' ON CONFLICT(id) DO NOTHING;
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,consent_given_at)
SELECT '9e000000-0000-4000-8000-00000000e001','e4000000-0000-4000-8000-00000000ff02',employer_id,
 '9e000000-0000-4000-8000-0000000000c1',now() FROM public.jobs WHERE id='e4000000-0000-4000-8000-00000000ff02' ON CONFLICT(id) DO NOTHING;
-- Build both statuses through the real governed interview lifecycle. The
-- mixed legacy application link is owner-seeded after those transitions.
CREATE TEMP TABLE regression_cases(kind text,id uuid);
INSERT INTO regression_cases SELECT 'ready',pg_temp.e4_walk('Regression ready report',NULL,NULL,NULL);
INSERT INTO regression_cases SELECT 'reported',pg_temp.e4_walk('Regression reported history',NULL,NULL,NULL);
DO $$ DECLARE c uuid; BEGIN
 SELECT id INTO c FROM regression_cases WHERE kind='reported';
 PERFORM set_config('request.jwt.claims',json_build_object('sub','9e000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub','9e000000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 IF NOT EXISTS(SELECT 1 FROM public.scp_interview_reports WHERE case_id=c AND status='final') THEN
  PERFORM public.scp_iv_finalise_previewed_report(c,(SELECT basis_hash FROM public.scp_iv_preview_report(c)),NULL);
 END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',NULL,true); PERFORM set_config('request.jwt.claim.sub',NULL,true);
END $$;
UPDATE public.scp_interview_cases SET application_id='9e000000-0000-4000-8000-00000000e001',job_id='e4000000-0000-4000-8000-00000000ff02'
WHERE id IN (SELECT id FROM regression_cases);
COMMIT;
\ir interview-context-assessment-fixture.sql
SELECT json_object_agg(kind,id) FROM regression_cases;
