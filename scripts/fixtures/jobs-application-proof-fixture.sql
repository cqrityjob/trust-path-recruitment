-- Only for an isolated local test stack, after job-back-navigation-fixture.sql.
-- This enables the real application's existing receipt behavior on a synthetic
-- vacancy. It neither configures nor sends external email.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('job-application-cvs', 'job-application-cvs', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.recruitment_settings (job_id, employer_id, receipt_enabled)
SELECT id, employer_id, true FROM public.jobs
WHERE slug = 'jobbnav-sakerhetschef-stockholm'
ON CONFLICT (job_id) DO UPDATE SET receipt_enabled = true;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('b7100000-0000-4000-8000-000000000001',
        'b7000000-0000-4000-8000-000000000001', 'owner', 'active')
ON CONFLICT (employer_id, user_id) DO NOTHING;
COMMIT;
