-- Phase 2 — read models and the scoped identity RPC.
--
-- The property under test: an employer can see aggregated competence and
-- pseudonymous subject references freely, and can resolve a subject to a person
-- ONLY through scp_resolve_participant_identity(), only inside its own scope,
-- and only once a result has been released.
--
-- Everything rolls back.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP P2A — no read model reaches identity'; END $$;

-- =========================================================================
-- Group P2A — the structural rule
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_depend d
     JOIN pg_rewrite rw ON rw.oid = d.objid
     JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind = 'v'
     JOIN pg_class t ON t.oid = d.refobjid
    WHERE t.relname = 'scp_subject_identities' AND v.relname LIKE 'scp_rm_%') = 0,
  'P2A.1 no scp_rm_ read model reaches scp_subject_identities');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scp_subject_identities'
      AND (coalesce(qual,'') IN ('true','(true)') OR qual ILIKE '%employer%')) = 0,
  'P2A.2 scp_subject_identities gained no employer-facing policy');

-- The read models are security_invoker, so they cannot become a definer
-- back door either.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_class c
    WHERE c.relname IN ('scp_rm_employer_assignments','scp_rm_review_queue')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions,'{}'::text[])) o
                       WHERE o = 'security_invoker=true')) = 0,
  'P2A.3 both new read models are security_invoker');

-- The review queue exposes no protected scoring content.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_rm_review_queue'
      AND (column_name ILIKE '%rubric_level%' OR column_name ILIKE '%anchor%'
        OR column_name ILIKE '%prompt%' OR column_name ILIKE '%score_value%')) = 0,
  'P2A.4 the review queue carries no rubric level, anchor or prompt');

DO $$ BEGIN RAISE NOTICE 'GROUP P2B — the identity RPC refuses every unauthorised path'; END $$;

-- =========================================================================
-- Group P2B — the scoped identity RPC
-- =========================================================================

-- Fixture: two employers, one participant, one attempt commissioned by employer A.
CREATE TEMP TABLE fx AS
WITH u AS (
  INSERT INTO auth.users (id, email) VALUES
    ('b2000000-0000-0000-0000-000000000001','owner-a@test.invalid'),
    ('b2000000-0000-0000-0000-000000000002','member-a@test.invalid'),
    ('b2000000-0000-0000-0000-000000000003','owner-b@test.invalid'),
    ('b2000000-0000-0000-0000-000000000004','participant@test.invalid')
  RETURNING id
), e AS (
  INSERT INTO public.employers (id, name, slug, status) VALUES
    ('b2000000-1111-0000-0000-000000000001','Org A','org-a-p2','active'),
    ('b2000000-1111-0000-0000-000000000002','Org B','org-b-p2','active')
  RETURNING id
), m AS (
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
    ('b2000000-1111-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','owner','active'),
    ('b2000000-1111-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','member','active'),
    ('b2000000-1111-0000-0000-000000000002','b2000000-0000-0000-0000-000000000003','owner','active')
  RETURNING id
), s AS (
  INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id
), si AS (
  INSERT INTO public.scp_subject_identities (subject_id, user_id)
  SELECT s.id, 'b2000000-0000-0000-0000-000000000004' FROM s RETURNING subject_id
), pv AS (
  INSERT INTO public.scp_purpose_versions
    (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
     jurisdiction_id, published_at)
  SELECT 'competence_development', 90, 'pn-p2', 'GDPR Art.6(1)(f)',
         (SELECT id FROM public.scp_jurisdictions WHERE code='SE'), now()
  RETURNING id
), at AS (
  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, mode, form_id, purpose_version_id, status)
  SELECT s.id, 'b2000000-1111-0000-0000-000000000001', 'assessment',
         (SELECT id FROM public.scp_forms LIMIT 1), pv.id, 'scored'
    FROM s, pv RETURNING id
)
SELECT (SELECT id FROM s) AS subject_id, (SELECT id FROM at) AS attempt_id;

SELECT subject_id AS sid, attempt_id AS aid FROM fx \gset

-- Not yet released: even the owner of the commissioning org gets nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE r_unreleased AS
SELECT count(*) AS n FROM public.scp_resolve_participant_identity(
  'b2000000-1111-0000-0000-000000000001', :'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM r_unreleased) = 0,
  'P2B.1 identity is not resolvable before the result is released');

-- Release it.
-- scored_at must precede release: scp_attempt_release_after_scoring enforces it.
UPDATE public.scp_attempts SET scored_at = now(), released_at = now() WHERE id = :'aid'::uuid;

-- Owner of the commissioning org: resolves, minimum fields only.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE r_owner AS
SELECT * FROM public.scp_resolve_participant_identity(
  'b2000000-1111-0000-0000-000000000001', :'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM r_owner) = 1,
  'P2B.2 an owner of the commissioning organisation can resolve the participant');
SELECT pg_temp.ok(
  (SELECT display_email FROM r_owner) = 'participant@test.invalid',
  'P2B.3 the minimum contact field is returned');

-- A plain member may NOT resolve a person, even in the right org.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE r_member AS
SELECT count(*) AS n FROM public.scp_resolve_participant_identity(
  'b2000000-1111-0000-0000-000000000001', :'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM r_member) = 0,
  'P2B.4 a plain member cannot resolve a participant to a person');

-- A different organisation gets nothing, even naming the subject exactly.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE r_other AS
SELECT count(*) AS n FROM public.scp_resolve_participant_identity(
  'b2000000-1111-0000-0000-000000000002', :'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM r_other) = 0,
  'P2B.5 another organisation cannot resolve a subject outside its scope');

-- Nor by passing the FIRST employer's id while being a member of the second.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE r_spoof AS
SELECT count(*) AS n FROM public.scp_resolve_participant_identity(
  'b2000000-1111-0000-0000-000000000001', :'sid'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM r_spoof) = 0,
  'P2B.6 naming another employer''s id does not grant that employer''s scope');

-- A subject with no attempt for this employer returns nothing, so the function
-- cannot be used to probe which subjects exist.
DO $$
DECLARE _stranger uuid; _n int;
BEGIN
  INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _stranger;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001', true);
  SELECT count(*) INTO _n FROM public.scp_resolve_participant_identity(
    'b2000000-1111-0000-0000-000000000001', _stranger);
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0,
    'P2B.7 an out-of-scope subject returns nothing — no enumeration oracle');
END $$;

-- Even with everything else right, the identity table itself stays unreadable.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE r_direct AS
SELECT count(*) AS n FROM public.scp_subject_identities;
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM r_direct) = 0,
  'P2B.8 the owner still cannot read scp_subject_identities directly');

-- anon can neither call the RPC nor read the read models.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  'SELECT * FROM public.scp_resolve_participant_identity(gen_random_uuid(), gen_random_uuid())',
  'permission denied', 'P2B.9 anon cannot call the identity RPC');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_rm_employer_assignments',
  'permission denied', 'P2B.10 anon cannot read the assignment read model');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP P2C — the Phase 2 boundary'; END $$;

-- =========================================================================
-- Group P2C — nothing shipped
-- =========================================================================

-- The boundary the owner set: a test fixture may be published so the journey
-- can be proven, the REAL Security Guard programme may not. is_test_fixture
-- makes that a database fact rather than a naming convention, so this
-- assertion cannot be satisfied by calling something a fixture in prose.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE av.content_status = 'published' AND NOT d.is_test_fixture) = 0,
  'P2C.1 no REAL Academy content is published — only the test fixture');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_versions av
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE av.content_status = 'published' AND d.is_test_fixture) >= 1,
  'P2C.1b the test fixture IS published, so the journey has something to run on');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessments WHERE employer_visible) = 0,
  'P2C.2 nothing is employer-visible');
SELECT pg_temp.ok(
  (SELECT string_agg(code, ',') FROM public.scp_ai_providers WHERE is_enabled) = 'null_provider',
  'P2C.3 the null provider is still the only enabled provider');

DO $$ BEGIN RAISE NOTICE 'scp_phase2_identity_and_read_models_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
