-- Disposable local QA only. Run after interview-regression-prerequisites.sql.
-- Both adverts/candidates are synthetic. This extends fixture data, never
-- method approval, AI settings, real recipients or report permissions.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION 'SCP_P0_FIXTURE_WRONG_DATABASE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'journey@local.test') THEN
    RAISE EXCEPTION 'SCP_P0_FIXTURE_MISSING_JOURNEY';
  END IF;
END $$;
BEGIN;
-- Starting from an application deliberately reuses its existing interview,
-- even after finalisation. Each viewport therefore gets its own synthetic
-- advert/application pair. Repeating the full walk requires a fresh seeded
-- database; do not rewrite reports or unwind their append-only history.
DO $$
DECLARE cohort integer; role_code integer; job_id uuid; app_id uuid;
BEGIN
 FOR cohort IN 0..2 LOOP
  FOR role_code IN 3..4 LOOP
   job_id := ('e4000000-0000-4000-8000-00000000ff' || cohort || role_code)::uuid;
   app_id := ('e4000000-0000-4000-8000-00000000aa' || cohort || role_code)::uuid;
   INSERT INTO public.jobs(id,employer_id,slug,short_id,title_sv,title_en,status,application_method,requirements)
   VALUES(job_id,'9e000000-0000-4000-8000-00000000000a',
    'p0-synthetic-' || CASE role_code WHEN 3 THEN 'security-manager-' ELSE 'security-guard-' END || cohort,
    'P0' || CASE role_code WHEN 3 THEN 'SM' ELSE 'SG' END || cohort || '1',
    CASE role_code WHEN 3 THEN 'Säkerhetschef (syntetiskt QA)' ELSE 'Väktare (syntetiskt QA)' END,
    CASE role_code WHEN 3 THEN 'Security manager (synthetic QA)' ELSE 'Security guard (synthetic QA)' END,
    'draft','internal',
    CASE role_code WHEN 3 THEN '["Erfarenhet av incidentledning", "Dokumenterat säkerhetsarbete"]'::jsonb
      ELSE '["Väktarutbildning", "Dokumentation av incidenter"]'::jsonb END)
   ON CONFLICT(id) DO NOTHING;
   UPDATE public.jobs SET status='published',expires_at=now()+interval '30 days'
    WHERE id=job_id AND status='draft';
   INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,consent_given_at,cover_note)
   VALUES(app_id,job_id,'9e000000-0000-4000-8000-00000000000a','e4000000-0000-4000-8000-0000000000c1',now(),
    CASE role_code WHEN 3 THEN
     'Syntetiskt QA-underlag. Jag samordnade en incidentövning; mitt eget ansvar behöver klarläggas.'
    ELSE 'Syntetiskt QA-underlag. Jag har arbetat i bevakning; utbildningsunderlaget behöver kontrolleras.' END)
   ON CONFLICT(id) DO NOTHING;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
