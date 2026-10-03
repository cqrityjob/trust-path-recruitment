-- P1-2 (20270104090000): development recommendations show an employer only
-- what its own evidence supports.
--
--   DR-F the fixture: one person assessed by two employers. Employer 1's
--        evidence covers competency A only. Employer 2's evidence covers A
--        (more and better observations) and B.
--   DR0  REPRODUCTION. Inside a savepoint the pre-fix function is restored by
--        running the real rollback file. Employer 1's owner receives the
--        competency-B module (selected only by employer 2's evidence) and
--        competency A levelled with employer 2's evidence. Rolled back.
--   DR1  employer 1 sees only competency-A modules, levelled from its own
--        evidence alone; a plain member sees the same.
--   DR2  employer 2 sees its own A and B, levelled from its own evidence.
--   DR3  the participant still sees everything, levelled exactly as
--        scp_compute_maturity levels it; a member of both employers sees the
--        union.
--   DR4  a suspended member, an unrelated employer's owner and anon get
--        nothing; no client role may run the scoped maturity helper.
--
-- Synthetic principals; content is the seeded module catalogue. Everything
-- rolls back. auth.uid() resolves from request.jwt.claim.sub.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- The recommendations a principal receives, as module id + maturity level.
CREATE OR REPLACE FUNCTION pg_temp.recs_as(_uid text)
RETURNS TABLE(module_version_id uuid, maturity_level text)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  RETURN QUERY SELECT r.module_version_id, r.maturity_level
                 FROM public.scp_development_recommendations('0f0c0000-2222-4000-8000-000000000001') r;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- p participant; o1/o2 owners of e1/e2; m1 plain member of e1; s1 suspended
-- member of e1; both member of e1 and e2; o3 owner of e3 (no attempt).
INSERT INTO auth.users (id, email) VALUES
  ('0f0c0000-0000-4000-8000-000000000001', 'dr-participant@test.invalid'),
  ('0f0c0000-0000-4000-8000-000000000002', 'dr-owner-1@test.invalid'),
  ('0f0c0000-0000-4000-8000-000000000003', 'dr-owner-2@test.invalid'),
  ('0f0c0000-0000-4000-8000-000000000004', 'dr-member-1@test.invalid'),
  ('0f0c0000-0000-4000-8000-000000000005', 'dr-suspended-1@test.invalid'),
  ('0f0c0000-0000-4000-8000-000000000006', 'dr-both@test.invalid'),
  ('0f0c0000-0000-4000-8000-000000000007', 'dr-owner-3@test.invalid');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f0c0000-1111-4000-8000-000000000001', 'DR Employer 1', 'dr-employer-1', 'active'),
  ('0f0c0000-1111-4000-8000-000000000002', 'DR Employer 2', 'dr-employer-2', 'active'),
  ('0f0c0000-1111-4000-8000-000000000003', 'DR Employer 3', 'dr-employer-3', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f0c0000-1111-4000-8000-000000000001', '0f0c0000-0000-4000-8000-000000000002', 'owner', 'active'),
  ('0f0c0000-1111-4000-8000-000000000002', '0f0c0000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('0f0c0000-1111-4000-8000-000000000001', '0f0c0000-0000-4000-8000-000000000004', 'member', 'active'),
  ('0f0c0000-1111-4000-8000-000000000001', '0f0c0000-0000-4000-8000-000000000005', 'member', 'suspended'),
  -- Admin of BOTH employers: this suite writes its attempts without an assignment, so their use case is
  -- unknown and, since 20270203090000, only an owner or an admin reads them. The plain member (…04) reads nothing.
  ('0f0c0000-1111-4000-8000-000000000001', '0f0c0000-0000-4000-8000-000000000006', 'admin', 'active'),
  ('0f0c0000-1111-4000-8000-000000000002', '0f0c0000-0000-4000-8000-000000000006', 'admin', 'active'),
  ('0f0c0000-1111-4000-8000-000000000003', '0f0c0000-0000-4000-8000-000000000007', 'owner', 'active');
INSERT INTO public.scp_subjects (id) VALUES ('0f0c0000-2222-4000-8000-000000000001');
INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES
  ('0f0c0000-2222-4000-8000-000000000001', '0f0c0000-0000-4000-8000-000000000001');

-- Two competencies, each with a behaviour that a published, globally-owned
-- module addresses. A has two such modules, B one.
CREATE TEMP TABLE comp AS
WITH pub AS (
  SELECT bv.id AS behaviour, bcm.competency_version_id AS cv, mv.id AS module
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
    JOIN public.scp_module_behaviour_map mbm ON mbm.behaviour_version_id = bv.id
    JOIN public.scp_module_versions mv ON mv.id = mbm.module_version_id
    JOIN public.scp_modules m ON m.id = mv.module_id
   WHERE mv.content_status = 'published' AND mv.retired_at IS NULL AND m.owner_employer_id IS NULL
     -- one competency per behaviour, so a behaviour's evidence levels exactly one competency
     AND (SELECT count(*) FROM public.scp_behaviour_competency_map x WHERE x.behaviour_version_id = bv.id) = 1
), cvs AS (
  SELECT cv, min(behaviour::text)::uuid AS behaviour FROM pub GROUP BY cv ORDER BY cv LIMIT 2
)
SELECT CASE WHEN row_number() OVER (ORDER BY c.cv) = 1 THEN 'A' ELSE 'B' END AS tag, c.cv, c.behaviour,
       (SELECT array_agg(DISTINCT p.module) FROM pub p WHERE p.behaviour = c.behaviour) AS modules
  FROM cvs c;
SELECT pg_temp.ok((SELECT count(*) FROM comp) = 2
                  AND NOT EXISTS (SELECT 1 FROM comp a, comp b WHERE a.tag = 'A' AND b.tag = 'B' AND a.modules && b.modules),
  'DR-F.1 two competencies with disjoint published modules exist in the catalogue');

-- One released attempt per employer, and the evidence each one issued.
DO $$
DECLARE _form uuid := (SELECT f.id FROM public.scp_forms f JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
                         JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
                        WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1);
        _e uuid;
BEGIN
  FOREACH _e IN ARRAY ARRAY['0f0c0000-1111-4000-8000-000000000001', '0f0c0000-1111-4000-8000-000000000002']::uuid[] LOOP
    INSERT INTO public.scp_attempts (subject_id, issuer_organization_id, mode, form_id, status,
                                     submitted_at, scored_at, released_at)
    VALUES ('0f0c0000-2222-4000-8000-000000000001', _e, 'assessment', _form, 'released', now(), now(), now());
  END LOOP;
  -- e1: one observation of A at 0.5            -> A alone: limited_evidence
  -- e2: two observations of A at 0.6, one of B -> A alone: developing_evidence
  -- all of A together: 3 observations, mean 0.567 -> developing_evidence
  INSERT INTO public.scp_competency_evidence
    (subject_id, behaviour_version_id, source_type, source_ref, provenance_type,
     issuer_organization_id, context_type, context_ref, contribution, confidence)
  SELECT '0f0c0000-2222-4000-8000-000000000001', c.behaviour, 'assessment_response', gen_random_uuid(),
         'deterministic', v.issuer, 'assessment_form', _form, v.contribution, 1.000
    FROM (VALUES ('A', '0f0c0000-1111-4000-8000-000000000001'::uuid, 0.500),
                 ('A', '0f0c0000-1111-4000-8000-000000000002'::uuid, 0.600),
                 ('A', '0f0c0000-1111-4000-8000-000000000002'::uuid, 0.600),
                 ('B', '0f0c0000-1111-4000-8000-000000000002'::uuid, 0.500)) v(tag, issuer, contribution)
    JOIN comp c ON c.tag = v.tag;
END $$;
SELECT pg_temp.ok(public.scp_compute_maturity('0f0c0000-2222-4000-8000-000000000001', (SELECT cv FROM comp WHERE tag = 'A'), 'v1', now()) = 'developing_evidence'
                  AND public.scp_compute_maturity('0f0c0000-2222-4000-8000-000000000001', (SELECT cv FROM comp WHERE tag = 'B'), 'v1', now()) = 'limited_evidence',
  'DR-F.2 over all evidence, A is developing and B limited');
GRANT SELECT ON comp TO authenticated;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DR0 — reproduction: the pre-fix function builds on the other employer''s evidence'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20270104090000_scp_development_recommendations_employer_scope_rollback.sql
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000002') r
                           WHERE r.module_version_id = ANY ((SELECT modules FROM comp WHERE tag = 'B')::uuid[])),
  'DR0.1 PRE-FIX: employer 1 receives the B module, which only employer 2''s evidence selects');
SELECT pg_temp.ok((SELECT bool_and(r.maturity_level = 'developing_evidence') FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000002') r
                    WHERE r.module_version_id = ANY ((SELECT modules FROM comp WHERE tag = 'A')::uuid[])),
  'DR0.2 PRE-FIX: employer 1 sees A levelled with employer 2''s observations (developing, not limited)');
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DR1 — employer 1 sees only what its own evidence supports'; END $$;
-- =========================================================================
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000002') r
                               WHERE r.module_version_id = ANY ((SELECT modules FROM comp WHERE tag = 'B')::uuid[])),
  'DR1.1 employer 1 does not receive the B module');
SELECT pg_temp.ok((SELECT array_agg(r.module_version_id ORDER BY r.module_version_id) FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000002') r)
                    = (SELECT array_agg(x ORDER BY x) FROM comp, unnest(modules) x WHERE tag = 'A')
                  AND (SELECT bool_and(r.maturity_level = 'limited_evidence') FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000002') r),
  'DR1.2 employer 1 receives every A module, levelled from its own single observation (limited)');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000004')),
  'DR1.3 a plain member of employer 1 (no basis) receives nothing, since 20270203090000; the admin of both employers is asserted in DR3');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DR2 — employer 2 sees its own evidence'; END $$;
-- =========================================================================
SELECT pg_temp.ok((SELECT count(*) FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000003') r
                    WHERE r.module_version_id = ANY ((SELECT modules FROM comp WHERE tag = 'B')::uuid[])
                      AND r.maturity_level = 'limited_evidence')
                    = (SELECT cardinality(modules) FROM comp WHERE tag = 'B'),
  'DR2.1 employer 2 receives its B module (limited)');
SELECT pg_temp.ok((SELECT count(*) FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000003') r
                    WHERE r.module_version_id = ANY ((SELECT modules FROM comp WHERE tag = 'A')::uuid[])
                      AND r.maturity_level = 'developing_evidence')
                    = (SELECT cardinality(modules) FROM comp WHERE tag = 'A'),
  'DR2.2 employer 2 receives the A modules, levelled from its own two observations (developing)');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DR3 — the participant and a member of both employers'; END $$;
-- =========================================================================
SELECT pg_temp.ok((SELECT count(*) FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000001'))
                    = (SELECT sum(cardinality(modules)) FROM comp)
                  AND NOT EXISTS (
                    SELECT 1 FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000001') r
                      JOIN comp c ON r.module_version_id = ANY (c.modules)
                     WHERE r.maturity_level IS DISTINCT FROM
                           public.scp_compute_maturity('0f0c0000-2222-4000-8000-000000000001', c.cv, 'v1', now())),
  'DR3.1 the participant receives every module, levelled exactly as scp_compute_maturity levels it');
SELECT pg_temp.ok((SELECT array_agg(r ORDER BY r) FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000006') r)
                    = (SELECT array_agg(r ORDER BY r) FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000001') r),
  'DR3.2 an admin of both employers receives what both employers'' evidence supports');
SELECT pg_temp.ok(public.scp_compute_maturity_for_issuers('0f0c0000-2222-4000-8000-000000000001', c.cv, 'v1', now(),
                    ARRAY['0f0c0000-1111-4000-8000-000000000001', '0f0c0000-1111-4000-8000-000000000002']::uuid[])
                  = public.scp_compute_maturity('0f0c0000-2222-4000-8000-000000000001', c.cv, 'v1', now()),
  'DR3.3 over every issuer of the evidence, the scoped helper agrees with scp_compute_maturity')
  FROM comp c WHERE c.tag = 'A';

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP DR4 — refusals'; END $$;
-- =========================================================================
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000005')),
  'DR4.1 a suspended member of employer 1 receives nothing');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.recs_as('0f0c0000-0000-4000-8000-000000000007')),
  'DR4.2 the owner of an employer with no attempt receives nothing');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.scp_development_recommendations(uuid)', 'EXECUTE'),
  'DR4.3 anon cannot execute scp_development_recommendations');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.scp_compute_maturity_for_issuers(uuid,uuid,text,timestamp with time zone,uuid[])', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.scp_compute_maturity_for_issuers(uuid,uuid,text,timestamp with time zone,uuid[])', 'EXECUTE'),
  'DR4.4 no client role may run the scoped maturity helper');

DO $$ BEGIN RAISE NOTICE 'ALL scp_development_recommendations_scope assertions passed'; END $$;
ROLLBACK;
