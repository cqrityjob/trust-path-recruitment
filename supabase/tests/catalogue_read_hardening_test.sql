-- Catalogue read hardening (20270101090000), executed.
--
-- With the migration applied:
--   CH1  an ordinary signed-in user (candidate, employer member, employer
--        owner, a holder of the legacy assessment_editor role) reads PUBLISHED
--        behaviour and role versions only; content authors and platform
--        admins read every row; anon is refused by grant.
--   CH2  an ordinary signed-in user reads professions approved for ranking
--        only, including by exact id; a platform admin reads every row; a
--        content author who is not a platform admin does not.
--   CH3  no candidate or employer reads the interviewer guide (listen_for
--        included) from the table; content authors and admins do; the
--        employer's legitimate path -- the brief built by the SECURITY DEFINER
--        scp_release_attempt_report() -- is structurally unaffected.
--   CH4  no client role holds INSERT/UPDATE/DELETE on scp_followup_prompts,
--        scp_form_blocks or scp_interview_guide_prompts -- not even a content
--        author -- and real statements are refused; SELECT is kept. (The
--        service role is not touched by the migration and not asserted here.)
--   CH5  nothing else moved: author-write policies and the 39 remaining
--        USING (true) catalogue reads are as before.
--   CH6  negative controls: each pre-hardening state is planted back inside a
--        savepoint and the SAME probes must observe the leak, so a probe that
--        cannot see a leak cannot pass.
--
-- Synthetic data only. Everything rolls back. auth.uid() resolves from
-- request.jwt.claim.sub (supabase/tests/00_bootstrap.sql).

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

-- ── Fixtures: one published and one draft of each graph definition ─────
-- Publication guards are trigger-enforced review gates; they are not under
-- test here, so the fixture rows are written with user triggers off.
ALTER TABLE public.scp_behaviour_versions DISABLE TRIGGER USER;
ALTER TABLE public.scp_role_versions      DISABLE TRIGGER USER;
ALTER TABLE public.cd_professions         DISABLE TRIGGER USER;
INSERT INTO public.scp_observable_behaviours (id, slug) VALUES
  ('c4280000-2222-4000-8000-000000000001', 'ch-synthetic-behaviour');
INSERT INTO public.scp_behaviour_versions
  (id, behaviour_id, version_number, content_status, statement_sv, statement_en) VALUES
  ('c4280000-2222-4000-8000-0000000000a1', 'c4280000-2222-4000-8000-000000000001', 1, 'published', 'CH publicerad', 'CH published'),
  ('c4280000-2222-4000-8000-0000000000a2', 'c4280000-2222-4000-8000-000000000001', 2, 'draft',     'CH utkast',     'CH draft');
INSERT INTO public.scp_roles (id, slug) VALUES
  ('c4280000-3333-4000-8000-000000000001', 'ch-synthetic-role');
INSERT INTO public.scp_role_versions
  (id, role_id, version_number, content_status, name_sv, name_en, description_sv, description_en) VALUES
  ('c4280000-3333-4000-8000-0000000000a1', 'c4280000-3333-4000-8000-000000000001', 1, 'published', 'CH roll', 'CH role', 'p', 'p'),
  ('c4280000-3333-4000-8000-0000000000a2', 'c4280000-3333-4000-8000-000000000001', 2, 'draft',     'CH roll', 'CH role', 'd', 'd');
INSERT INTO public.cd_professions
  (profession_id, career_area_id, title_sv, title_en, career_stage, review_state, approved_for_ranking) VALUES
  ('SP991', 'SCA99', 'CH godkänd', 'CH approved', 'entry', 'approved_for_ranking', true),
  ('SP992', 'SCA99', 'CH ej godkänd', 'CH unapproved', 'entry', 'ai_researched', false);
ALTER TABLE public.scp_behaviour_versions ENABLE TRIGGER USER;
ALTER TABLE public.scp_role_versions      ENABLE TRIGGER USER;
ALTER TABLE public.cd_professions         ENABLE TRIGGER USER;
INSERT INTO public.scp_competencies (id, code, display_order) VALUES
  ('c4280000-4444-4000-8000-000000000001', 'CH_SYNTHETIC', 999);
INSERT INTO public.scp_interview_guide_prompts
  (id, competency_id, focus, content_status, question_sv, question_en, followup_sv, followup_en, listen_for_sv, listen_for_en) VALUES
  ('c4280000-4444-4000-8000-0000000000a1', 'c4280000-4444-4000-8000-000000000001', 'confirm_strength', 'published',
   'CH fråga', 'CH question', 'CH följdfråga', 'CH follow-up', ARRAY['CH lyssna efter'], ARRAY['CH listen for']);

-- Ground truth as the table owner (no RLS).
CREATE TEMP TABLE truth AS SELECT
  (SELECT count(*) FROM public.scp_behaviour_versions)                                AS beh_all,
  (SELECT count(*) FROM public.scp_behaviour_versions WHERE content_status = 'published') AS beh_pub,
  (SELECT count(*) FROM public.scp_role_versions)                                     AS role_all,
  (SELECT count(*) FROM public.scp_role_versions WHERE content_status = 'published')  AS role_pub,
  (SELECT count(*) FROM public.cd_professions)                                        AS prof_all,
  (SELECT count(*) FROM public.cd_professions WHERE approved_for_ranking)             AS prof_appr,
  (SELECT count(*) FROM public.scp_interview_guide_prompts)                           AS guide_all;
GRANT SELECT ON truth TO anon, authenticated;
SELECT pg_temp.ok((SELECT beh_all > beh_pub AND beh_pub > 0 AND role_all > role_pub AND role_pub > 0
                          AND prof_all > prof_appr AND prof_appr > 0 AND guide_all > 0 FROM truth),
  'CH0.1 fixtures hold drafts, published rows, unapproved and approved professions, and guide rows');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CH1 — drafts are author-only'; END $$;
-- =========================================================================
DO $ch1$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM ordinary LOOP
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.scp_behaviour_versions')
                         = (SELECT beh_pub FROM truth),
      'CH1.1 ' || p.who || ' reads exactly the published behaviour versions');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, $q$SELECT count(*) FROM public.scp_behaviour_versions WHERE content_status <> 'published'$q$) = 0,
      'CH1.2 ' || p.who || ' reads no draft behaviour version');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, $q$SELECT count(*) FROM public.scp_behaviour_versions WHERE id = 'c4280000-2222-4000-8000-0000000000a2'$q$) = 0,
      'CH1.3 ' || p.who || ' cannot fetch a draft behaviour version by id');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.scp_role_versions')
                         = (SELECT role_pub FROM truth),
      'CH1.4 ' || p.who || ' reads exactly the published role versions');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, $q$SELECT count(*) FROM public.scp_role_versions WHERE id = 'c4280000-3333-4000-8000-0000000000a2'$q$) = 0,
      'CH1.5 ' || p.who || ' cannot fetch a draft role version by id');
  END LOOP;
  FOR p IN SELECT * FROM authors LOOP
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.scp_behaviour_versions')
                         = (SELECT beh_all FROM truth),
      'CH1.6 ' || p.who || ' reads every behaviour version, drafts included');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.scp_role_versions')
                         = (SELECT role_all FROM truth),
      'CH1.7 ' || p.who || ' reads every role version (the role-pack authoring screens)');
  END LOOP;
  PERFORM pg_temp.ok(pg_temp.count_as('', 'SELECT count(*) FROM public.scp_behaviour_versions') = -1
                 AND pg_temp.count_as('', 'SELECT count(*) FROM public.scp_role_versions') = -1,
    'CH1.8 anon is refused by grant on both');
END $ch1$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CH2 — unapproved professions are admin-only'; END $$;
-- =========================================================================
DO $ch2$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM ordinary
           UNION ALL SELECT * FROM authors WHERE who <> 'platform admin' LOOP
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.cd_professions')
                         = (SELECT prof_appr FROM truth),
      'CH2.1 ' || p.who || ' reads exactly the professions approved for ranking');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, $q$SELECT count(*) FROM public.cd_professions WHERE profession_id = 'SP992'$q$) = 0,
      'CH2.2 ' || p.who || ' cannot fetch an unapproved profession by id');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, $q$SELECT count(*) FROM public.cd_professions WHERE profession_id = 'SP991'$q$) = 1,
      'CH2.3 ' || p.who || ' still reads an approved profession by id (the career journey path)');
  END LOOP;
  PERFORM pg_temp.ok(pg_temp.count_as('c4280000-0000-4000-8000-000000000008', 'SELECT count(*) FROM public.cd_professions')
                       = (SELECT prof_all FROM truth),
    'CH2.4 a platform admin reads every profession (the owner preview)');
  PERFORM pg_temp.ok(pg_temp.count_as('', 'SELECT count(*) FROM public.cd_professions') = -1,
    'CH2.5 anon is refused by grant');
  -- The candidate catalogue is read through the service role with an explicit
  -- approved filter (v31-public.functions.ts); it is not narrowed by RLS.
  PERFORM pg_temp.ok((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'),
    'CH2.6 the service-role catalogue read is untouched by the policy');
END $ch2$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CH3 — the interviewer guide is not a candidate read'; END $$;
-- =========================================================================
DO $ch3$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM ordinary LOOP
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.scp_interview_guide_prompts') = 0,
      'CH3.1 ' || p.who || ' reads no interviewer guide row');
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.scp_interview_guide_prompts WHERE listen_for_sv IS NOT NULL OR listen_for_en IS NOT NULL') = 0,
      'CH3.2 ' || p.who || ' reads no listen_for guidance');
  END LOOP;
  FOR p IN SELECT * FROM authors LOOP
    PERFORM pg_temp.ok(pg_temp.count_as(p.uid, 'SELECT count(*) FROM public.scp_interview_guide_prompts')
                         = (SELECT guide_all FROM truth),
      'CH3.3 ' || p.who || ' reads the whole guide');
  END LOOP;
  PERFORM pg_temp.ok(pg_temp.count_as('', 'SELECT count(*) FROM public.scp_interview_guide_prompts') = -1,
    'CH3.4 anon is refused by grant');
  -- The employer's path: the released employer brief, built by a definer
  -- function owned by the table owner, on a table without FORCE RLS.
  PERFORM pg_temp.ok(
    (SELECT fn.prosecdef AND fn.proowner = c.relowner AND NOT c.relforcerowsecurity
       FROM pg_proc fn, pg_class c
      WHERE fn.oid = 'public.scp_release_attempt_report'::regproc
        AND c.oid = 'public.scp_interview_guide_prompts'::regclass),
    'CH3.5 scp_release_attempt_report still reads the guide as its owner (employer brief path intact)');
  PERFORM pg_temp.ok(
    position('scp_interview_guide_prompts' in (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_release_attempt_report'::regproc)) > 0
    AND position('listen_for_sv' in (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_release_attempt_report'::regproc)) > 0,
    'CH3.6 and it still places listen_for in the employer brief');
END $ch3$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CH4 — no client write privilege on three catalogues'; END $$;
-- =========================================================================
DO $ch4$
DECLARE t text; p record; r text; col text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scp_followup_prompts', 'scp_form_blocks', 'scp_interview_guide_prompts'] LOOP
    PERFORM pg_temp.ok(NOT has_table_privilege('authenticated', 'public.' || t, 'INSERT,UPDATE,DELETE')
                   AND NOT has_table_privilege('anon', 'public.' || t, 'INSERT,UPDATE,DELETE'),
      'CH4.1 no client role holds INSERT, UPDATE or DELETE on ' || t);
    PERFORM pg_temp.ok(has_table_privilege('authenticated', 'public.' || t, 'SELECT'),
      'CH4.2 authenticated keeps SELECT on ' || t || ' (rows are the policy''s decision)');
    SELECT a.attname INTO col FROM pg_attribute a
     WHERE a.attrelid = ('public.' || t)::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum LIMIT 1;
    FOR p IN SELECT * FROM ordinary UNION ALL SELECT * FROM authors LOOP
      r := pg_temp.write_as(p.uid, format('UPDATE public.%I SET %I = %I', t, col, col));
      PERFORM pg_temp.ok(r = '42501', 'CH4.4 UPDATE on ' || t || ' by ' || p.who || ' is refused by grant (' || r || ')');
      r := pg_temp.write_as(p.uid, format('DELETE FROM public.%I', t));
      PERFORM pg_temp.ok(r = '42501', 'CH4.5 DELETE on ' || t || ' by ' || p.who || ' is refused by grant (' || r || ')');
      r := pg_temp.write_as(p.uid, format('INSERT INTO public.%I DEFAULT VALUES', t));
      PERFORM pg_temp.ok(r = '42501', 'CH4.6 INSERT on ' || t || ' by ' || p.who || ' is refused by grant (' || r || ')');
    END LOOP;
  END LOOP;
END $ch4$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CH5 — nothing else moved'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND cmd = 'SELECT'
     AND qual = 'true' AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles))) = 39,
  'CH5.1 exactly 39 USING (true) catalogue reads remain (45 minus four catalogue reads and the raw scenario/configuration banks)');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
     AND policyname IN ('scp_behaviour_versions_author_write', 'scp_role_versions_author_write',
                        'scp_followup_prompts_author_write')
     AND qual = 'scp_can_author(auth.uid())' AND with_check = 'scp_can_author(auth.uid())') = 3,
  'CH5.2 the author-write policies are unchanged');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
     AND tablename IN ('scp_behaviour_versions', 'scp_role_versions', 'cd_professions',
                       'scp_interview_guide_prompts', 'scp_followup_prompts', 'scp_form_blocks')) = 9,
  'CH5.3 no policy was added or removed on the six touched tables');
SELECT pg_temp.ok(
  (SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE oid IN ('public.scp_behaviour_versions'::regclass, 'public.scp_role_versions'::regclass,
                  'public.cd_professions'::regclass, 'public.scp_interview_guide_prompts'::regclass,
                  'public.scp_followup_prompts'::regclass, 'public.scp_form_blocks'::regclass)),
  'CH5.4 RLS stays enabled on all six');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP CH6 — negative controls: the planted pre-hardening state is observed'; END $$;
-- =========================================================================
SAVEPOINT nc1;
ALTER POLICY scp_behaviour_versions_read ON public.scp_behaviour_versions USING (true);
ALTER POLICY scp_role_versions_read ON public.scp_role_versions USING (true);
SELECT pg_temp.ok(pg_temp.count_as('c4280000-0000-4000-8000-000000000001',
  $q$SELECT count(*) FROM public.scp_behaviour_versions WHERE id = 'c4280000-2222-4000-8000-0000000000a2'$q$) = 1
  AND pg_temp.count_as('c4280000-0000-4000-8000-000000000001',
  $q$SELECT count(*) FROM public.scp_role_versions WHERE id = 'c4280000-3333-4000-8000-0000000000a2'$q$) = 1,
  'CH6.1 with USING (true) planted back, the CH1 probe sees the candidate read a draft');
ROLLBACK TO SAVEPOINT nc1;

SAVEPOINT nc2;
ALTER POLICY cd_professions_read ON public.cd_professions USING (true);
SELECT pg_temp.ok(pg_temp.count_as('c4280000-0000-4000-8000-000000000001',
  $q$SELECT count(*) FROM public.cd_professions WHERE profession_id = 'SP992'$q$) = 1,
  'CH6.2 with USING (true) planted back, the CH2 probe sees the candidate read an unapproved profession');
ROLLBACK TO SAVEPOINT nc2;

SAVEPOINT nc3;
ALTER POLICY scp_interview_guide_prompts_read ON public.scp_interview_guide_prompts USING (true);
SELECT pg_temp.ok(pg_temp.count_as('c4280000-0000-4000-8000-000000000001',
  'SELECT count(*) FROM public.scp_interview_guide_prompts WHERE listen_for_sv IS NOT NULL') > 0,
  'CH6.3 with USING (true) planted back, the CH3 probe sees the candidate read listen_for');
ROLLBACK TO SAVEPOINT nc3;

SAVEPOINT nc4;
-- An approved-only predicate that forgot the admin branch would empty the
-- owner preview of the professions it exists to review; CH2.4 must notice.
-- (cd_professions has no other policy, so the admin branch is load-bearing.
-- On the two version tables the FOR ALL *_author_write policies also admit
-- authors to SELECT, so their author branch is belt and braces.)
ALTER POLICY cd_professions_read ON public.cd_professions USING (approved_for_ranking);
SELECT pg_temp.ok(pg_temp.count_as('c4280000-0000-4000-8000-000000000008', 'SELECT count(*) FROM public.cd_professions')
                    < (SELECT prof_all FROM truth),
  'CH6.4 a predicate without the admin branch is observed to hide unapproved professions from the admin');
ROLLBACK TO SAVEPOINT nc4;

SAVEPOINT nc5;
GRANT INSERT, UPDATE, DELETE ON public.scp_form_blocks TO authenticated;
SELECT pg_temp.ok(has_table_privilege('authenticated', 'public.scp_form_blocks', 'UPDATE')
  AND pg_temp.write_as('c4280000-0000-4000-8000-000000000001', 'UPDATE public.scp_form_blocks SET id = id') <> '42501',
  'CH6.5 with the stray grant planted back, the CH4 probe no longer sees a grant refusal');
ROLLBACK TO SAVEPOINT nc5;

DO $$ BEGIN RAISE NOTICE 'catalogue_read_hardening_test: ALL ASSERTIONS PASSED'; END $$;
ROLLBACK;
