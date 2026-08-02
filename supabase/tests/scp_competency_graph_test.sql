-- Security Competence Platform — Phase 0: the Competency Graph.
--
-- Proves the four properties the whole platform rests on:
--
--   1. The graph is connected: item → behaviour → competency → role.
--   2. Evidence is append-only and accumulates; nothing is overwritten.
--   3. Maturity is a LEVEL decided by two independent gates, never a percentage.
--   4. Consumers read the contract; evidence stays private.
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

DO $$ BEGIN RAISE NOTICE 'GROUP G1 — vocabularies widened, separation intact'; END $$;

-- =========================================================================
-- Group G1 — the widening did not reopen the Career Guidance separation
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT product_type FROM public.scp_assessment_families
    WHERE slug = 'security-competence-academy') = 'development_programme',
  'G1.1 the Academy family exists as a development_programme');

-- THE assertion that matters most in Phase 0. Widening a guard is exactly where
-- a separation quietly reopens, so it is tested from the hostile direction.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.scp_assessment_definitions (family_id, slug, purpose, name_sv, name_en)
          SELECT id, ''hostile-cg'', ''core'', ''x'', ''x'' FROM public.scp_assessment_families
           WHERE product_type = ''career_guidance'' LIMIT 1'),
  'SCP_CAREER_GUIDANCE_SEPARATION',
  'G1.2 a definition still cannot attach to the career-guidance family');

-- The new pairing is held to the same standard as the existing two.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.scp_assessment_definitions (family_id, slug, purpose, name_sv, name_en)
          SELECT id, ''mismatch'', ''development_programme'', ''x'', ''x''
            FROM public.scp_assessment_families WHERE product_type = ''security_competency_core'' LIMIT 1'),
  'SCP_FAMILY_PURPOSE_MISMATCH',
  'G1.3 development_programme purpose requires a development_programme family');

-- No existing row fell outside the widened vocabulary.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_versions
    WHERE content_status NOT IN ('draft','expert_review','legal_review','cognitive_review',
                                 'in_review','approved','published','suspended','retired')) = 0,
  'G1.4 every existing assessment version is still a valid status');

-- The legacy assessment stays retired and invisible.
SELECT pg_temp.ok(
  (SELECT NOT employer_visible FROM public.assessments WHERE id = 'security-guard-foundation'),
  'G1.5 the legacy assessment stays employer-invisible');
SELECT pg_temp.ok(
  (SELECT bool_and(retired_at IS NOT NULL) FROM public.assessment_versions
    WHERE assessment_id = 'security-guard-foundation'),
  'G1.6 every legacy version stays retired');

DO $$ BEGIN RAISE NOTICE 'GROUP G2 — the graph is connected'; END $$;

-- =========================================================================
-- Group G2 — graph integrity
-- =========================================================================

-- Build a minimal but real graph: role → competency → behaviour.
CREATE TEMP TABLE g AS
WITH r AS (
  INSERT INTO public.scp_roles (slug) VALUES ('security-guard-test') RETURNING id
), rv AS (
  INSERT INTO public.scp_role_versions
    (role_id, version_number, content_status, name_sv, name_en, description_sv, description_en)
  SELECT id, 1, 'published', 'Väktare', 'Security Guard', 'Test', 'Test' FROM r RETURNING id
), b AS (
  INSERT INTO public.scp_observable_behaviours (slug) VALUES ('deescalates-verbally') RETURNING id
), cv AS (
  SELECT id FROM public.scp_competency_versions LIMIT 1
), bv AS (
  INSERT INTO public.scp_behaviour_versions
    (behaviour_id, version_number, content_status, statement_sv, statement_en)
  SELECT id, 1, 'draft', 'Trappar ned verbalt', 'De-escalates verbally' FROM b RETURNING id
)
SELECT (SELECT id FROM rv) AS role_version_id,
       (SELECT id FROM bv) AS behaviour_version_id,
       (SELECT id FROM cv) AS competency_version_id;

-- A behaviour that reaches no competency cannot be published: its evidence
-- would be collected and then read by nothing.
SELECT pg_temp.must_fail(
  format('UPDATE public.scp_behaviour_versions SET content_status = ''published'' WHERE id = %L',
         (SELECT behaviour_version_id FROM g)),
  'SCP_BEHAVIOUR_WITHOUT_COMPETENCY',
  'G2.1 a behaviour with no competency cannot be published');

INSERT INTO public.scp_behaviour_competency_map (behaviour_version_id, competency_version_id)
SELECT behaviour_version_id, competency_version_id FROM g;

UPDATE public.scp_behaviour_versions SET content_status = 'published'
 WHERE id = (SELECT behaviour_version_id FROM g);

SELECT pg_temp.ok(
  (SELECT content_status FROM public.scp_behaviour_versions
    WHERE id = (SELECT behaviour_version_id FROM g)) = 'published',
  'G2.2 once mapped to a competency it publishes');

INSERT INTO public.scp_role_competency_map (role_version_id, competency_version_id, criticality)
SELECT role_version_id, competency_version_id, 'core' FROM g;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_role_competency_map rc
     JOIN public.scp_behaviour_competency_map bc
       ON bc.competency_version_id = rc.competency_version_id
    WHERE rc.role_version_id = (SELECT role_version_id FROM g)) = 1,
  'G2.3 role → competency → behaviour is traversable end to end');

DO $$ BEGIN RAISE NOTICE 'GROUP G3 — evidence is append-only'; END $$;

-- =========================================================================
-- Group G3 — the ledger
-- =========================================================================

INSERT INTO auth.users (id, email)
VALUES ('c0000000-0000-0000-0000-000000000001', 'subject@graph.test');

INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance, context_key, observed_at)
SELECT 'c0000000-0000-0000-0000-000000000001', behaviour_version_id,
       'assessment_response', gen_random_uuid(), 0.900, 1.000, 'deterministic', 'ctx-1', now()
  FROM g;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = 'c0000000-0000-0000-0000-000000000001') = 1,
  'G3.1 evidence persists');

SELECT pg_temp.must_fail(
  'DELETE FROM public.scp_competency_evidence WHERE subject_id = ''c0000000-0000-0000-0000-000000000001''',
  'SCP_EVIDENCE_APPEND_ONLY',
  'G3.2 evidence is never deleted');

SELECT pg_temp.must_fail(
  'UPDATE public.scp_competency_evidence SET contribution = 0.100
     WHERE subject_id = ''c0000000-0000-0000-0000-000000000001''',
  'SCP_EVIDENCE_IMMUTABLE',
  'G3.3 a stored judgement cannot be rewritten');

SELECT pg_temp.must_fail(
  'UPDATE public.scp_competency_evidence SET superseded_by = id
     WHERE subject_id = ''c0000000-0000-0000-0000-000000000001''',
  'violates check constraint',
  'G3.4 evidence cannot supersede itself');

DO $$ BEGIN RAISE NOTICE 'GROUP G4 — maturity: two gates, never a percentage'; END $$;

-- =========================================================================
-- Group G4 — the maturity computation
-- =========================================================================
--
-- The rule this group exists to protect: ONE strong answer must never reach a
-- high level. That is the difference between a competence platform and a quiz
-- score with a nicer label.

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    'c0000000-0000-0000-0000-000000000001', (SELECT competency_version_id FROM g)) = 'emerging',
  'G4.1 one strong observation reaches only "emerging"');

-- Add a second observation in the SAME context: the sufficiency gate still caps
-- the level, because breadth has not increased.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance, context_key, observed_at)
SELECT 'c0000000-0000-0000-0000-000000000001', behaviour_version_id,
       'assessment_response', gen_random_uuid(), 0.950, 1.000, 'deterministic', 'ctx-1', now()
  FROM g;

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    'c0000000-0000-0000-0000-000000000001', (SELECT competency_version_id FROM g)) = 'developing',
  'G4.2 a second observation in the same context reaches only "developing"');

-- A third observation in a NEW context satisfies both gates.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance, context_key, observed_at)
SELECT 'c0000000-0000-0000-0000-000000000001', behaviour_version_id,
       'assessment_response', gen_random_uuid(), 0.900, 1.000, 'deterministic', 'ctx-2', now()
  FROM g;

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    'c0000000-0000-0000-0000-000000000001', (SELECT competency_version_id FROM g)) = 'established',
  'G4.3 breadth across contexts reaches "established"');

-- Evidence ACCUMULATES rather than overwriting: the count keeps rising.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = 'c0000000-0000-0000-0000-000000000001') = 3,
  'G4.4 a reassessment adds evidence rather than replacing it');

-- A safety-critical observation caps the level regardless of everything else.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance, context_key, is_safety_critical, observed_at)
SELECT 'c0000000-0000-0000-0000-000000000001', behaviour_version_id,
       'assessment_response', gen_random_uuid(), 0.950, 1.000, 'human_review', 'ctx-3', true, now()
  FROM g;

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    'c0000000-0000-0000-0000-000000000001', (SELECT competency_version_id FROM g)) = 'developing',
  'G4.5 a safety-critical observation caps the level despite strong performance');

-- And it is surfaced separately, so a level can never conceal it.
SELECT pg_temp.ok(
  (SELECT has_safety_flag FROM public.scp_rm_competency_profile
    WHERE subject_id = 'c0000000-0000-0000-0000-000000000001'
      AND competency_version_id = (SELECT competency_version_id FROM g)),
  'G4.6 the safety flag is reported separately from the level');

-- A subject with no evidence at all reads as insufficient, NOT as zero.
INSERT INTO auth.users (id, email)
VALUES ('c0000000-0000-0000-0000-000000000002', 'nobody@graph.test');
SELECT pg_temp.ok(
  public.scp_compute_maturity(
    'c0000000-0000-0000-0000-000000000002', (SELECT competency_version_id FROM g))
    = 'insufficient_evidence',
  'G4.7 no evidence yields insufficient_evidence, never a zero score');

-- Recency decays the level without deleting the evidence.
CREATE TEMP TABLE g2 AS
SELECT id FROM public.scp_competency_evidence
 WHERE subject_id = 'c0000000-0000-0000-0000-000000000001' AND context_key = 'ctx-2';

UPDATE public.scp_competency_evidence
   SET valid_until = now() - interval '1 day'
 WHERE id = (SELECT id FROM g2);

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    'c0000000-0000-0000-0000-000000000001', (SELECT competency_version_id FROM g)) = 'developing',
  'G4.8 expired evidence stops counting toward the level');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence WHERE id = (SELECT id FROM g2)) = 1,
  'G4.9 expired evidence is retained for audit, not deleted');

-- Supersession removes evidence from the level while keeping the history.
DO $$
DECLARE _new uuid; _old uuid;
BEGIN
  SELECT id INTO _old FROM public.scp_competency_evidence
   WHERE subject_id = 'c0000000-0000-0000-0000-000000000001' AND context_key = 'ctx-3';

  INSERT INTO public.scp_competency_evidence
    (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
     provenance, context_key, is_safety_critical, observed_at)
  SELECT 'c0000000-0000-0000-0000-000000000001', behaviour_version_id,
         'assessment_response', gen_random_uuid(), 0.950, 1.000, 'human_review', 'ctx-3', false, now()
    FROM g RETURNING id INTO _new;

  UPDATE public.scp_competency_evidence
     SET superseded_by = _new, superseded_reason = 'Human review overturned the safety flag'
   WHERE id = _old;
END $$;

SELECT pg_temp.ok(
  (SELECT NOT has_safety_flag FROM public.scp_rm_competency_profile
    WHERE subject_id = 'c0000000-0000-0000-0000-000000000001'
      AND competency_version_id = (SELECT competency_version_id FROM g)) IS NOT FALSE,
  'G4.10 superseding the flagged evidence clears the flag from the projection');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = 'c0000000-0000-0000-0000-000000000001'
      AND superseded_by IS NOT NULL) = 1,
  'G4.11 the superseded row is retained with its reason');

DO $$ BEGIN RAISE NOTICE 'GROUP G5 — the read-model contract'; END $$;

-- =========================================================================
-- Group G5 — contract v1
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_contract_versions
    WHERE contract_version = 'v1' AND status = 'available') = 1,
  'G5.1 exactly one read model is available in contract v1');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_contract_versions
    WHERE contract_version = 'v1' AND status = 'reserved') = 5,
  'G5.2 five agent read models are reserved and unimplemented');

-- The contract's currency is a level. A percentage must never appear.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_rm_competency_profile'
      AND (column_name ILIKE '%percent%' OR column_name ILIKE '%score%'
           OR column_name ILIKE '%rank%')) = 0,
  'G5.3 the read model exposes no percentage, score or rank column');

SELECT pg_temp.ok(
  (SELECT maturity_level FROM public.scp_rm_competency_profile
    WHERE subject_id = 'c0000000-0000-0000-0000-000000000001'
      AND competency_version_id = (SELECT competency_version_id FROM g))
  IN ('insufficient_evidence','emerging','developing','established','embedded'),
  'G5.4 the read model returns a level from the closed vocabulary');

DO $$ BEGIN RAISE NOTICE 'GROUP G6 — access control'; END $$;

-- =========================================================================
-- Group G6 — RLS
-- =========================================================================

-- A subject reads their own evidence.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE own AS SELECT count(*) AS n FROM public.scp_competency_evidence;
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM own) > 0, 'G6.1 a subject can read their own evidence');

-- Nobody else's.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE other AS SELECT count(*) AS n FROM public.scp_competency_evidence;
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM other) = 0, 'G6.2 a different subject sees no evidence at all');

-- Graph DEFINITIONS are readable — a manager must be able to see what a
-- competency means — while evidence is not.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE defs AS SELECT count(*) AS n FROM public.scp_behaviour_versions;
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM defs) > 0, 'G6.3 graph definitions are readable');

-- anon holds nothing on any graph table.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_competency_evidence',
  'permission denied', 'G6.4 anon cannot read evidence');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_behaviour_versions',
  'permission denied', 'G6.5 anon cannot read graph definitions');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_rm_competency_profile',
  'permission denied', 'G6.6 anon cannot read the contract read model');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon'
      AND table_name IN ('scp_competency_evidence','scp_behaviour_versions',
                         'scp_maturity_thresholds','scp_contract_versions')) = 0,
  'G6.7 anon holds no grant on any graph table');

DO $$ BEGIN RAISE NOTICE 'scp_competency_graph_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
