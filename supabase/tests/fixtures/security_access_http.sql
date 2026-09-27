-- Synthetic HTTP fixture. Local audit database only; never a migration.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'cqrity_security_access' THEN
  RAISE EXCEPTION 'SECURITY_AUDIT_LOCAL_DATABASE_REQUIRED';
 END IF;
END $$;
-- PostgREST sets a verified claims object, whereas the SQL harness sets the
-- individual claim GUC. Support both in this isolated auth implementation.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')
$$;
ALTER ROLE authenticator PASSWORD 'synthetic-security-audit-only';
INSERT INTO auth.users(id,email) VALUES
 ('a9280000-0000-4000-8000-000000000001','http-candidate-a@synthetic.test'),
 ('a9280000-0000-4000-8000-000000000002','http-candidate-b@synthetic.test'),
 ('a9280000-0000-4000-8000-000000000003','http-owner-a@synthetic.test'),
 ('a9280000-0000-4000-8000-000000000004','http-owner-b@synthetic.test');
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('a9280000-0000-4000-8000-000000000011','Synthetic HTTP A','synthetic-http-a','active'),
 ('a9280000-0000-4000-8000-000000000012','Synthetic HTTP B','synthetic-http-b','active');
INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES
 ('a9280000-0000-4000-8000-000000000011','a9280000-0000-4000-8000-000000000003','owner','active'),
 ('a9280000-0000-4000-8000-000000000012','a9280000-0000-4000-8000-000000000004','owner','active');
INSERT INTO public.candidate_current_location(user_id,country_code,locality)
 VALUES('a9280000-0000-4000-8000-000000000001','SE','Synthetic location');
INSERT INTO public.employees(id,employer_id,first_name,last_name,created_by) VALUES
 ('a9280000-0000-4000-8000-000000000021','a9280000-0000-4000-8000-000000000011',
  'Synthetic','Person','a9280000-0000-4000-8000-000000000003');
