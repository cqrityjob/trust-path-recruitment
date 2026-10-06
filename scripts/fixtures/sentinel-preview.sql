-- Disposable loopback-only fixture. Never run on a hosted project.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'sentinel_e2e' THEN RAISE EXCEPTION 'SENTINEL_LOCAL_ONLY'; END IF; END $$;
BEGIN;
\ir ../../supabase/tests/recruitment_assignment_fixture.sql
INSERT INTO public.scp_fixture_access(employer_id,reason) SELECT employer,'Sentinel browser preview' FROM rj;
INSERT INTO public.scp_test_grants(employer_id,purpose,definition_id,reason,authorised_by,expires_at)
SELECT employer,'closed_test',v.definition_id,'Sentinel browser preview',owner_user,now()+interval '1 day'
FROM rj,public.scp_assessment_versions v JOIN public.scp_assessment_definitions d ON d.id=v.definition_id WHERE d.slug='abstract_reasoning_v1';
UPDATE public.sentinel_forms SET preview_only=true,assignments_enabled=true;
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,status,consent_given_at)
SELECT 'ea000000-3333-0000-0000-000000000002',job,employer,bo,'submitted',now() FROM rj;
-- Sign-in compatible with the repository's local auth substitute.
UPDATE auth.users SET encrypted_password=crypt('LocalJourney!2026',gen_salt('bf')), aud='authenticated', role='authenticated' WHERE email LIKE '%@journey.test';
COMMIT;
