-- Reuses catalogue_read_hardening synthetic principals and helpers.
\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Count rows of a table as a given principal. '' = anon. Returns -1 when the
-- grant refuses the read (42501), so "refused" and "zero rows" stay distinct.
CREATE OR REPLACE FUNCTION pg_temp.count_as(_uid text, _sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint; _role text := CASE WHEN _uid = '' THEN 'anon' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  PERFORM set_config('request.jwt.claim.role', _role, true);
  EXECUTE format('SET LOCAL ROLE %I', _role);
  BEGIN
    EXECUTE _sql INTO _n;
  EXCEPTION WHEN insufficient_privilege THEN
    _n := -1;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _n;
END $$;

-- Run a mutation as a principal; returns the SQLSTATE, or 'rows=N' when it ran.
CREATE OR REPLACE FUNCTION pg_temp.write_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _n bigint; _r text; _role text := CASE WHEN _uid = '' THEN 'anon' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  PERFORM set_config('request.jwt.claim.role', _role, true);
  EXECUTE format('SET LOCAL ROLE %I', _role);
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _r := 'rows=' || _n;
  EXCEPTION WHEN OTHERS THEN
    _r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;

-- ── Principals ──────────────────────────────────────────────────────────
-- 1 candidate A, 2 candidate B, 3 employer A member, 4 employer B owner,
-- 5 legacy assessment_editor (NOT a content author), 6 content editor,
-- 7 content reviewer, 8 platform admin.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('c4280000-0000-4000-8000-000000000001', 'ch-cand-a@test.invalid',    now()),
  ('c4280000-0000-4000-8000-000000000002', 'ch-cand-b@test.invalid',    now()),
  ('c4280000-0000-4000-8000-000000000003', 'ch-emp-a@test.invalid',     now()),
  ('c4280000-0000-4000-8000-000000000004', 'ch-emp-b@test.invalid',     now()),
  ('c4280000-0000-4000-8000-000000000005', 'ch-asmt-editor@test.invalid', now()),
  ('c4280000-0000-4000-8000-000000000006', 'ch-editor@test.invalid',    now()),
  ('c4280000-0000-4000-8000-000000000007', 'ch-reviewer@test.invalid',  now()),
  ('c4280000-0000-4000-8000-000000000008', 'ch-admin@test.invalid',     now());
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('c4280000-1111-4000-8000-00000000000a', 'CH Employer A', 'ch-employer-a', 'active'),
  ('c4280000-1111-4000-8000-00000000000b', 'CH Employer B', 'ch-employer-b', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('c4280000-1111-4000-8000-00000000000a', 'c4280000-0000-4000-8000-000000000003', 'member', 'active', now()),
  ('c4280000-1111-4000-8000-00000000000b', 'c4280000-0000-4000-8000-000000000004', 'owner',  'active', now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('c4280000-0000-4000-8000-000000000005', 'assessment_editor'),
  ('c4280000-0000-4000-8000-000000000008', 'admin');
INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('c4280000-0000-4000-8000-000000000006', 'editor'),
  ('c4280000-0000-4000-8000-000000000007', 'reviewer');

CREATE TEMP TABLE ordinary(uid text, who text);
INSERT INTO ordinary VALUES
  ('c4280000-0000-4000-8000-000000000001', 'candidate A'),
  ('c4280000-0000-4000-8000-000000000002', 'candidate B'),
  ('c4280000-0000-4000-8000-000000000003', 'employer A member'),
  ('c4280000-0000-4000-8000-000000000004', 'employer B owner'),
  ('c4280000-0000-4000-8000-000000000005', 'assessment_editor (not a content author)');
CREATE TEMP TABLE authors(uid text, who text);
INSERT INTO authors VALUES
  ('c4280000-0000-4000-8000-000000000006', 'content editor'),
  ('c4280000-0000-4000-8000-000000000007', 'content reviewer'),
  ('c4280000-0000-4000-8000-000000000008', 'platform admin');
GRANT SELECT ON ordinary, authors TO anon, authenticated;


-- Only synthetic fixtures inside the rolled-back transaction. Publication
-- gates are disabled only while seeding; they are not the subject of this test.
DO $seed$
DECLARE src public.scp_assessment_versions; frm public.scp_forms;
 prof uuid; bundle uuid; ver uuid; fid uuid; i integer; state text;
 states text[] := ARRAY['published','draft','in_review','approved','retired'];
BEGIN
 SELECT * INTO STRICT src FROM public.scp_assessment_versions LIMIT 1;
 SELECT * INTO STRICT frm FROM public.scp_forms LIMIT 1;
 SELECT id INTO STRICT prof FROM public.scp_professions LIMIT 1;
 FOREACH state IN ARRAY ARRAY['scp_assessment_versions','scp_forms','scp_form_blocks','scp_bundle_versions','scp_role_weight_profiles'] LOOP
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',state);
 END LOOP;
 INSERT INTO public.scp_bundles(slug,profession_id,name_sv,name_en)
 VALUES('c5-synthetic',prof,'Syntetisk','Synthetic') RETURNING id INTO bundle;
 FOR i IN 1..5 LOOP
  state:=states[i]; ver:=gen_random_uuid(); fid:=gen_random_uuid();
  INSERT INTO public.scp_assessment_versions SELECT (jsonb_populate_record(NULL::public.scp_assessment_versions,to_jsonb(src)||
   jsonb_build_object('id',ver,'version_number',991100+i,'content_status',state))).*;
  INSERT INTO public.scp_forms SELECT (jsonb_populate_record(NULL::public.scp_forms,to_jsonb(frm)||
   jsonb_build_object('id',fid,'assessment_version_id',ver,'slug','c5-'||state))).*;
  INSERT INTO public.scp_form_blocks(form_id,block_key,display_order,name_sv,name_en,intro_sv,intro_en,asks)
  VALUES(fid,'c5-'||state,1,'Syntetisk','Synthetic','C5 instruction','C5 instruction','what_you_would_do');
  INSERT INTO public.scp_role_weight_profiles(profession_id,version_number,content_status,notes)
  VALUES(prof,991100+i,state,'C5 internal notes');
  INSERT INTO public.scp_bundle_versions(bundle_id,version_number,content_status,
   core_assessment_version_id,module_assessment_version_id,core_form_id,module_form_id,approved_by,published_by,retired_reason)
  VALUES(bundle,991100+i,state,ver,src.id,fid,frm.id,'c4280000-0000-4000-8000-000000000008',
   'c4280000-0000-4000-8000-000000000008','C5 internal reason');
  INSERT INTO public.graph_versions(version,notes,created_by,published_at)
  VALUES('c5-'||state,'C5 internal notes','c4280000-0000-4000-8000-000000000008',CASE WHEN state='published' THEN now() ELSE NULL END);
 END LOOP;
 FOREACH state IN ARRAY ARRAY['scp_assessment_versions','scp_forms','scp_form_blocks','scp_bundle_versions','scp_role_weight_profiles'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',state);
 END LOOP;
END $seed$;
CREATE TEMP TABLE c5_cases(base text,projection text,predicate text,graph boolean);
INSERT INTO c5_cases VALUES
 ('graph_versions','graph_versions_published',$$version LIKE 'c5-%'$$,true),
 ('scp_bundle_versions','scp_bundle_versions_published','version_number BETWEEN 991101 AND 991105',false),
 ('scp_role_weight_profiles','scp_role_weight_profiles_published','version_number BETWEEN 991101 AND 991105',false),
 ('scp_forms','scp_forms',$$slug LIKE 'c5-%'$$,false),
 ('scp_form_blocks','scp_form_blocks',$$block_key LIKE 'c5-%'$$,false);
GRANT SELECT ON c5_cases TO authenticated,anon;
DO $checks$
DECLARE t record; p record; expected bigint; r text;
BEGIN
 FOR t IN SELECT * FROM c5_cases LOOP
  FOR p IN SELECT * FROM ordinary LOOP
   expected:=CASE WHEN t.base IN ('scp_forms','scp_form_blocks') THEN 1 ELSE 0 END;
   PERFORM pg_temp.ok(pg_temp.count_as(p.uid,format('SELECT count(*) FROM public.%I WHERE %s',t.base,t.predicate))=expected,
    'C5 base '||t.base||' '||p.who);
   PERFORM pg_temp.ok(pg_temp.count_as(p.uid,format('SELECT count(*) FROM public.%I WHERE %s',t.projection,t.predicate))=1,
    'C5 published '||t.base||' '||p.who);
  END LOOP;
  FOR p IN SELECT * FROM authors LOOP
   expected:=CASE WHEN t.graph AND p.who <> 'platform admin' THEN 0 ELSE 5 END;
   PERFORM pg_temp.ok(pg_temp.count_as(p.uid,format('SELECT count(*) FROM public.%I WHERE %s',t.base,t.predicate))=expected,
    'C5 author '||t.base||' '||p.who);
  END LOOP;
  PERFORM pg_temp.ok(pg_temp.count_as('',format('SELECT count(*) FROM public.%I WHERE %s',t.base,t.predicate))=-1,'C5 anon base '||t.base);
  expected:=CASE WHEN t.graph THEN 1 ELSE -1 END;
  PERFORM pg_temp.ok(pg_temp.count_as('',format('SELECT count(*) FROM public.%I WHERE %s',t.projection,t.predicate))=expected,'C5 anon published '||t.base);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   PERFORM pg_temp.ok(NOT has_table_privilege(r,'public.'||t.projection,'INSERT,UPDATE,DELETE'),
    'C5 projection no writes '||t.projection||' '||r);
   PERFORM pg_temp.ok(NOT has_table_privilege(r,'public.'||t.base,'INSERT,UPDATE,DELETE')
    AND NOT has_any_column_privilege(r,'public.'||t.base,'INSERT') AND NOT has_any_column_privilege(r,'public.'||t.base,'UPDATE'),
    'C5 no writes '||t.base||' '||r);
  END LOOP;
  FOR p IN SELECT * FROM ordinary UNION ALL SELECT * FROM authors LOOP
   PERFORM pg_temp.ok(pg_temp.write_as(p.uid,format('DELETE FROM public.%I WHERE %s',t.base,t.predicate))='42501','C5 mutation denied '||t.base||' '||p.who);
  END LOOP;
 END LOOP;
END $checks$;
SELECT pg_temp.ok(NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public'
 AND table_name IN ('graph_versions_published','scp_bundle_versions_published','scp_role_weight_profiles_published')
 AND column_name IN ('notes','created_by','approved_by','published_by','retired_reason')),'C5 internal columns excluded');
SELECT pg_temp.ok((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='SELECT' AND qual='true'
 AND ('anon'=ANY(roles) OR 'authenticated'=ANY(roles)))=34,'C5 exactly 34 unchanged unconditional reads');
SELECT pg_temp.ok(pg_temp.count_as('c4280000-0000-4000-8000-000000000001',
 $$SELECT count(*) FROM public.scp_forms WHERE slug='fixture-learning-form'$$)=1,'C5 published learning fixture remains readable');
SELECT pg_temp.ok(pg_temp.count_as('c4280000-0000-4000-8000-000000000006',
 $$SELECT count(*) FROM public.scp_forms WHERE slug='c5-draft'$$)=1,'C5 author draft preview remains readable');
ROLLBACK;
