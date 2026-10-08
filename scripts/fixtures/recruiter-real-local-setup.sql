-- Synthetic operational setup template, executed ONLY by recruiter-real-local-setup.mjs.
-- The wrapper allowlists one owned loopback stack and passes UUIDs of accounts
-- already created and signed in through real GoTrue. No auth.users/identities
-- insertion, password copying, fake JWT, mail, report or approval mutation.
-- Any hosted reuse needs its own reviewed allowlist and explicit release gates.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE ri_ops_actors(alias text PRIMARY KEY,user_id uuid UNIQUE NOT NULL);
INSERT INTO ri_ops_actors VALUES
 ('O1', :'o1'::uuid),('A1', :'a1'::uuid),('R1', :'r1'::uuid),('M1', :'m1'::uuid),
 ('C1', :'c1'::uuid),('C2', :'c2'::uuid),('X2', :'x2'::uuid),('V1', :'v1'::uuid);
DO $$ BEGIN
 IF current_database() <> 'postgres' OR current_user <> 'postgres'
    OR (SELECT count(*) FROM ri_ops_actors) <> 8
    OR (SELECT count(*) FROM ri_ops_actors a JOIN auth.users u ON u.id=a.user_id
      WHERE u.email LIKE 'ri-real-%@fixture.invalid' AND u.email_confirmed_at IS NOT NULL
        AND u.encrypted_password ~ '^\$2[aby]\$') <> 8
    OR (SELECT count(*) FROM auth.users) <> 8 THEN
  RAISE EXCEPTION 'RI_REAL_LOCAL_AUTH_PRECONDITION';
 END IF;
 IF EXISTS(SELECT 1 FROM public.employers WHERE id IN
   ('e8050000-1111-4000-8000-000000000001','e8050000-1111-4000-8000-000000000002')
   OR slug IN ('ri-real-20261008','ri-real-other-20261008')) THEN
  RAISE EXCEPTION 'RI_REAL_LOCAL_SETUP_ALREADY_EXISTS: never reset used cases or reports';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.scp_interview_pack_versions v
   JOIN public.scp_interview_packs p ON p.id=v.pack_id
   WHERE p.slug='security-manager-se' AND v.version_number=1
     AND v.content_status='draft' AND v.pilot_availability='open'
     AND (SELECT count(*) FROM public.scp_interview_core_questions q WHERE q.pack_version_id=v.id)=8
     AND (SELECT count(*) FROM public.scp_interview_pack_competencies c WHERE c.pack_version_id=v.id)=6)
 OR NOT EXISTS(SELECT 1 FROM public.scp_interview_pack_versions v
   JOIN public.scp_interview_packs p ON p.id=v.pack_id
   WHERE p.slug='vaktare-se' AND v.version_number=1
     AND v.content_status='draft' AND v.pilot_availability='open'
     AND (SELECT count(*) FROM public.scp_interview_core_questions q WHERE q.pack_version_id=v.id)=8
     AND (SELECT count(*) FROM public.scp_interview_pack_competencies c WHERE c.pack_version_id=v.id)=6)
 THEN RAISE EXCEPTION 'RI_REAL_LOCAL_ROLE_CONTENT_PRECONDITION'; END IF;
 IF (SELECT ai_enabled OR transcript_enabled FROM public.scp_interview_ai_config WHERE id) THEN
  RAISE EXCEPTION 'RI_REAL_LOCAL_AI_NOT_OFF';
 END IF;
END $$;
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('e8050000-1111-4000-8000-000000000001','RI real E1 (synthetic)','ri-real-20261008','active'),
 ('e8050000-1111-4000-8000-000000000002','RI real E2 (synthetic)','ri-real-other-20261008','active');
INSERT INTO public.employer_memberships(user_id,employer_id,role,status)
 SELECT user_id,'e8050000-1111-4000-8000-000000000001'::uuid,
   CASE alias WHEN 'O1' THEN 'owner' WHEN 'A1' THEN 'admin' ELSE 'member' END,'active'
 FROM ri_ops_actors WHERE alias IN ('O1','A1','R1','M1');
INSERT INTO public.employer_memberships(user_id,employer_id,role,status)
 SELECT user_id,'e8050000-1111-4000-8000-000000000002','owner','active'
 FROM ri_ops_actors WHERE alias='X2';
-- R1 is a real recruitment reviewer, with no report-owner/admin grant.
INSERT INTO public.scp_employer_reviewers(employer_id,user_id,allowed_use_cases,granted_by)
 SELECT 'e8050000-1111-4000-8000-000000000001',r.user_id,ARRAY['recruitment'],o.user_id
 FROM ri_ops_actors r CROSS JOIN ri_ops_actors o WHERE r.alias='R1' AND o.alias='O1';
-- Dedicated Passport capability (20261015/16), no platform admin/superadmin.
INSERT INTO public.user_roles(user_id,role)
 SELECT user_id,'passport_verifier'::public.app_role FROM ri_ops_actors WHERE alias='V1';
CREATE TEMP TABLE ri_ops_journeys(
 ordinal integer PRIMARY KEY,cohort integer,role_slug text,locale text,
 job_id uuid,application_id uuid,candidate_user_id uuid);
INSERT INTO ri_ops_journeys
 SELECT n,((n-1)/4),CASE WHEN ((n-1)%4)<2 THEN 'security-manager-se' ELSE 'vaktare-se' END,
   CASE WHEN n%2=1 THEN 'sv' ELSE 'en' END,
   ('e8050000-2222-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   ('e8050000-3333-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   (SELECT user_id FROM ri_ops_actors WHERE alias=CASE WHEN n%2=1 THEN 'C1' ELSE 'C2' END)
 FROM generate_series(1,12) n;
INSERT INTO public.jobs(id,employer_id,slug,short_id,title_sv,title_en,status,application_method,requirements)
 SELECT job_id,'e8050000-1111-4000-8000-000000000001',
   'ri-real-'||role_slug||'-'||locale||'-'||cohort,'RIR'||lpad(ordinal::text,3,'0'),
   CASE role_slug WHEN 'security-manager-se' THEN 'Säkerhetschef (syntetiskt)' ELSE 'Väktare (syntetiskt)' END,
   CASE role_slug WHEN 'security-manager-se' THEN 'Security manager (synthetic)' ELSE 'Security guard (synthetic)' END,
   'draft','internal',
   CASE role_slug WHEN 'security-manager-se' THEN '["Erfarenhet av incidentledning","Dokumenterat säkerhetsarbete"]'::jsonb
     ELSE '["Väktarutbildning","Dokumentation av incidenter"]'::jsonb END
 FROM ri_ops_journeys;
-- The receipt gate is set BEFORE applications are inserted (20261213).
INSERT INTO public.recruitment_settings(job_id,employer_id,responsible_user_id,receipt_enabled)
 SELECT j.job_id,'e8050000-1111-4000-8000-000000000001',a.user_id,false
 FROM ri_ops_journeys j CROSS JOIN ri_ops_actors a WHERE a.alias='O1';
UPDATE public.jobs SET status='published',expires_at=now()+interval '30 days'
 WHERE id IN(SELECT job_id FROM ri_ops_journeys);
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,consent_given_at,cover_note)
 SELECT application_id,job_id,'e8050000-1111-4000-8000-000000000001',candidate_user_id,now(),
   CASE role_slug WHEN 'security-manager-se' THEN
     'Syntetiskt lokalt prov. Jag samordnade en incidentövning. Mitt eget ansvar behöver klarläggas.'
   ELSE 'Syntetiskt lokalt prov. Jag arbetade i bevakning. Utbildningsunderlaget behöver kontrolleras.' END
 FROM ri_ops_journeys;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.jobs WHERE employer_id='e8050000-1111-4000-8000-000000000001')<>12
 OR (SELECT count(*) FROM public.job_applications WHERE employer_id='e8050000-1111-4000-8000-000000000001')<>12
 OR (SELECT count(*) FROM public.recruitment_settings WHERE employer_id='e8050000-1111-4000-8000-000000000001' AND NOT receipt_enabled)<>12
 OR EXISTS(SELECT 1 FROM public.scp_interview_cases WHERE employer_id IN
 ('e8050000-1111-4000-8000-000000000001','e8050000-1111-4000-8000-000000000002'))
 THEN RAISE EXCEPTION 'RI_REAL_LOCAL_SETUP_READBACK'; END IF;
END $$;
COMMIT;
SELECT jsonb_build_object('employer_id','e8050000-1111-4000-8000-000000000001',
 'slug','ri-real-20261008','actors',(SELECT jsonb_object_agg(alias,user_id) FROM ri_ops_actors),
 'journeys',(SELECT jsonb_agg(to_jsonb(j) ORDER BY ordinal) FROM ri_ops_journeys j),
 'jobs',12,'applications',12,'cases_before_browser',0,'receipts_enabled',0,
 'role_content_status','draft','content_approval_changed',false,
 'test_actor_transport','real GoTrue password sessions, never setup role');
