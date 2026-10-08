-- Local substitute-Auth browser/API fixture. Never a hosted GoTrue seed.
-- The actual SQL acceptance suite owns the 100-case oracle and rolls every
-- destructive scenario back before committing its original baseline.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() NOT IN ('ri_p1_seed_ci_test','ri_p1_browser_ci_test','ri_p1_api_ci_test') THEN
  RAISE EXCEPTION 'RI_P1_BROWSER_WRONG_DATABASE';
 END IF;
END $$;
\set RI_P1_KEEP_FIXTURE 1
\ir ../../supabase/tests/recruiter_intelligence_p1_test.sql
BEGIN;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS aud text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role text;
-- These are synthetic namespace accounts only. This enables the local
-- gateway's real bcrypt verification; it does not prove GoTrue sessions.
UPDATE auth.users SET encrypted_password=crypt('LocalJourney!2026',gen_salt('bf')),
 aud='authenticated',role='authenticated'
 WHERE email LIKE 'ri-p1-%@synthetic.invalid';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.job_applications WHERE employer_id='ee100000-1111-4000-8000-000000000001')<>100
 OR (SELECT count(*) FROM auth.users WHERE email LIKE 'ri-p1-%@synthetic.invalid')<>104 THEN
  RAISE EXCEPTION 'RI_P1_BROWSER_FIXTURE_WRONG_POPULATION';
 END IF;
END $$;
COMMIT;
