-- All 45 production USING(true) client-read tables, observed 2026-09-27.
-- Run only against synthetic, fully replayed databases. Everything rolls back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.audit_ok(ok boolean,label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'SECURITY_AUDIT_FAIL: %',label; END IF;
  RAISE NOTICE 'ok AUDIT %',label;
END $$;

CREATE TEMP TABLE audit_catalogue(name text PRIMARY KEY,anon_read boolean);
INSERT INTO audit_catalogue VALUES
('assessment_versions',true),
('assessments',true),
('cd_professions',false),
('graph_versions',true),
('scp_assessment_families',false),
('scp_behaviour_competency_map',false),
('scp_behaviour_versions',false),
('scp_bundle_versions',false),
('scp_bundles',false),
('scp_competencies',false),
('scp_competency_facets',false),
('scp_competency_versions',false),
('scp_contract_versions',false),
('scp_evidence_source_types',false),
('scp_followup_prompts',false),
('scp_form_blocks',false),
('scp_forms',false),
('scp_interview_ai_config',false),
('scp_interview_guide_prompts',false),
('scp_jurisdictions',false),
('scp_maturity_thresholds',false),
('scp_observable_behaviours',false),
('scp_processing_purposes',false),
('scp_professions',false),
('scp_purpose_versions',false),
('scp_recruitment_content_links',false),
('scp_recruitment_role_profiles',false),
('scp_report_versions',false),
('scp_role_competency_map',false),
('scp_role_versions',false),
('scp_role_weight_profiles',false),
('scp_roles',false),
('scp_scenario_versions',false),
('scp_scenarios',false),
('sp_certification_definitions',false),
('sp_certification_issuer_aliases',false),
('sp_certification_issuers',false),
('sp_credential_classes',false),
('sp_credential_definition_reviews',false),
('sp_credential_definition_versions',false),
('sp_credential_organisation_roles',false),
('sp_credential_scopes',false),
('sp_recognition_policies',false),
('sp_skill_types',false),
('sp_sub_jurisdictions',false);
GRANT SELECT ON audit_catalogue TO anon,authenticated;

INSERT INTO auth.users(id,email) VALUES
 ('a9270000-0000-4000-8000-000000000001','audit-candidate@synthetic.test'),
 ('a9270000-0000-4000-8000-000000000002','audit-owner-a@synthetic.test'),
 ('a9270000-0000-4000-8000-000000000003','audit-owner-b@synthetic.test');
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('a9270000-0000-4000-8000-000000000011','Synthetic audit A','synthetic-audit-a','active'),
 ('a9270000-0000-4000-8000-000000000012','Synthetic audit B','synthetic-audit-b','active');
INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES
 ('a9270000-0000-4000-8000-000000000011','a9270000-0000-4000-8000-000000000002','owner','active'),
 ('a9270000-0000-4000-8000-000000000012','a9270000-0000-4000-8000-000000000003','owner','active');

-- A future unreviewed allow-all policy cannot silently join the allowlist.
-- Five legacy catalogue tables have no migration seeds. Add synthetic rows
-- so all 45 read/write checks exercise data rather than empty-table success.
DO $seed$
DECLARE prof uuid; cf uuid; mf uuid; cd uuid; md uuid; cv uuid; mv uuid;
  cform uuid; mform uuid; bundle uuid; scenario uuid;
BEGIN
 SELECT id INTO prof FROM public.scp_professions WHERE slug='security-officer-se';
 SELECT id INTO cf FROM public.scp_assessment_families WHERE slug='security-competency-core';
 SELECT id INTO mf FROM public.scp_assessment_families WHERE slug='security-profession-modules';
 INSERT INTO public.scp_assessment_definitions(family_id,slug,name_sv,name_en,purpose)
 VALUES(cf,'synthetic-audit-core','Syntetisk','Synthetic','core') RETURNING id INTO cd;
 INSERT INTO public.scp_assessment_definitions(family_id,profession_id,slug,name_sv,name_en,purpose)
 VALUES(mf,prof,'synthetic-audit-module','Syntetisk','Synthetic','profession_module') RETURNING id INTO md;
 INSERT INTO public.scp_assessment_versions(definition_id,version_number) VALUES(cd,1) RETURNING id INTO cv;
 INSERT INTO public.scp_assessment_versions(definition_id,version_number) VALUES(md,1) RETURNING id INTO mv;
 INSERT INTO public.scp_forms(assessment_version_id,slug,name_sv,name_en)
 VALUES(cv,'synthetic-audit-core-form','Syntetisk','Synthetic') RETURNING id INTO cform;
 INSERT INTO public.scp_forms(assessment_version_id,slug,name_sv,name_en)
 VALUES(mv,'synthetic-audit-module-form','Syntetisk','Synthetic') RETURNING id INTO mform;
 INSERT INTO public.scp_bundles(slug,profession_id,name_sv,name_en)
 VALUES('synthetic-audit-bundle',prof,'Syntetisk','Synthetic') RETURNING id INTO bundle;
 INSERT INTO public.scp_bundle_versions(bundle_id,version_number,core_assessment_version_id,
   module_assessment_version_id,core_form_id,module_form_id)
 VALUES(bundle,1,cv,mv,cform,mform);
 INSERT INTO public.scp_role_weight_profiles(profession_id,version_number) VALUES(prof,927);
 INSERT INTO public.scp_scenarios(slug) VALUES('synthetic-audit-scenario') RETURNING id INTO scenario;
 INSERT INTO public.scp_scenario_versions(scenario_id,version_number,mode,situation_sv,situation_en)
 VALUES(scenario,1,'learning','Syntetisk situation','Synthetic situation');
END $seed$;

SELECT pg_temp.audit_ok(
 (SELECT count(*)=45 FROM pg_policies WHERE schemaname='public' AND cmd='SELECT'
   AND qual='true' AND ('anon'=ANY(roles) OR 'authenticated'=ANY(roles)))
 AND NOT EXISTS (SELECT FROM pg_policies p WHERE schemaname='public' AND cmd='SELECT'
   AND qual='true' AND ('anon'=ANY(roles) OR 'authenticated'=ANY(roles))
   AND NOT EXISTS (SELECT FROM audit_catalogue a WHERE a.name=p.tablename)),
 'exact production catalogue inventory: 45 tables');

DO $checks$
DECLARE t record; r text; uid text; baseline bigint; actual bigint; affected bigint; col text; cmd text;
BEGIN
 FOR t IN SELECT * FROM audit_catalogue ORDER BY name LOOP
   EXECUTE format('SELECT count(*) FROM public.%I',t.name) INTO baseline;
   PERFORM pg_temp.audit_ok(baseline>0,t.name||' has synthetic seed data');
   FOR r,uid IN SELECT * FROM (VALUES
      ('anon',''),
      ('authenticated','a9270000-0000-4000-8000-000000000001'),
      ('authenticated','a9270000-0000-4000-8000-000000000002'),
      ('authenticated','a9270000-0000-4000-8000-000000000003')
   ) AS principals(role_name,user_id) LOOP
     PERFORM set_config('request.jwt.claim.sub',uid,true);
     PERFORM set_config('request.jwt.claim.role',r,true);
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role',r)::text,true);
     EXECUTE format('SET LOCAL ROLE %I',r);
     BEGIN
       EXECUTE format('SELECT count(*) FROM public.%I',t.name) INTO actual;
       IF r='authenticated' OR t.anon_read THEN
         PERFORM pg_temp.audit_ok(actual=baseline, t.name||' readable by '||r||'/'||uid);
       ELSE
         PERFORM pg_temp.audit_ok(actual=0,t.name||' hidden from anon');
       END IF;
     EXCEPTION WHEN insufficient_privilege THEN
       IF r='authenticated' OR t.anon_read THEN RAISE; END IF;
       RAISE NOTICE 'ok AUDIT % denied to anon',t.name;
     END;
     RESET ROLE;
     SELECT a.attname INTO col FROM pg_attribute a WHERE a.attrelid=format('public.%I',t.name)::regclass
       AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1;
     FOREACH cmd IN ARRAY ARRAY[
       format('UPDATE public.%I SET %I=%I',t.name,col,col),
       format('DELETE FROM public.%I',t.name)
     ] LOOP
       EXECUTE format('SET LOCAL ROLE %I',r);
       BEGIN
         EXECUTE cmd;
         GET DIAGNOSTICS affected=ROW_COUNT;
         PERFORM pg_temp.audit_ok(affected=0,t.name||' rejects mutation by '||r||'/'||uid);
       EXCEPTION WHEN insufficient_privilege THEN
         RAISE NOTICE 'ok AUDIT % mutation denied to %',t.name,r;
       END;
       RESET ROLE;
     END LOOP;
     IF baseline>0 THEN
       EXECUTE format('SET LOCAL ROLE %I',r);
       BEGIN
         EXECUTE format('INSERT INTO public.%I SELECT * FROM public.%I LIMIT 1',t.name,t.name);
         GET DIAGNOSTICS affected=ROW_COUNT;
         -- anon may see zero source rows; any successful insert is a failure.
         PERFORM pg_temp.audit_ok(affected=0,t.name||' insert cannot create a row');
       EXCEPTION WHEN insufficient_privilege THEN
         RAISE NOTICE 'ok AUDIT % insert denied to %',t.name,r;
       END;
       RESET ROLE;
     END IF;
   END LOOP;
   RAISE NOTICE 'ok AUDIT catalogue % seed rows=%',t.name,baseline;
 END LOOP;
END $checks$;

-- Check effective privileges, including PUBLIC/inherited grants, on EVERY
-- application relation, not just the 45 catalogues.
DO $privileges$
DECLARE t record; r text; p text;
BEGIN
 FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
 LOOP
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
     FOREACH p IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
       PERFORM pg_temp.audit_ok(NOT has_table_privilege(r,t.oid,p),t.relname||' no '||r||' '||p);
     END LOOP;
     IF current_setting('server_version_num')::integer>=170000 THEN
       PERFORM pg_temp.audit_ok(NOT has_table_privilege(r,t.oid,'MAINTAIN'),t.relname||' no '||r||' MAINTAIN');
     END IF;
   END LOOP;
 END LOOP;
END $privileges$;

-- Real SQL destruction must fail, not merely disappear from an ACL report.
DO $truncate$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   EXECUTE format('SET LOCAL ROLE %I',r);
   BEGIN
     TRUNCATE public.assessment_responses;
     RAISE EXCEPTION 'SECURITY_AUDIT_FAIL: TRUNCATE succeeded for %',r;
   EXCEPTION WHEN insufficient_privilege THEN
     RAISE NOTICE 'ok AUDIT actual TRUNCATE rejected for %',r;
   END;
   RESET ROLE;
 END LOOP;
END $truncate$;

-- New tables inherit no destructive grants from the application DDL owner.
CREATE TABLE public.security_audit_default_probe(id integer);
SELECT pg_temp.audit_ok(
 NOT has_table_privilege('anon','public.security_audit_default_probe','TRUNCATE,REFERENCES,TRIGGER')
 AND NOT has_table_privilege('authenticated','public.security_audit_default_probe','TRUNCATE,REFERENCES,TRIGGER'),
 'future postgres-owned tables have no client administrative privileges');
DO $$ BEGIN
 IF current_setting('server_version_num')::integer>=170000 THEN
  PERFORM pg_temp.audit_ok(
   NOT has_table_privilege('anon','public.security_audit_default_probe','MAINTAIN')
   AND NOT has_table_privilege('authenticated','public.security_audit_default_probe','MAINTAIN'),
   'future postgres-owned tables have no client MAINTAIN');
 END IF;
END $$;
ROLLBACK;
