-- Security Competence Platform — Phase 0: the Security Competency Graph.
--
-- Proves the properties the whole platform rests on:
--
--   1. The graph is connected: role → competency → behaviour.
--   2. The subject is pseudonymous, and erasure unlinks without touching the ledger.
--   3. Evidence is append-only, accumulates, and records its own interpretation context.
--   4. Maturity is a LEVEL decided by two independent gates, never a percentage.
--   5. Consumers read the contract; evidence and identity stay private.
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
-- a separation quietly reopens, so it is tested from the hostile direction and
-- demands the SPECIFIC error, not merely any error.
SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_assessment_definitions (family_id, slug, purpose, name_sv, name_en)
    SELECT id, ''hostile-cg'', ''core'', ''x'', ''x'' FROM public.scp_assessment_families
     WHERE product_type = ''career_guidance'' LIMIT 1',
  'SCP_CAREER_GUIDANCE_SEPARATION',
  'G1.2 a definition still cannot attach to the career-guidance family');

SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_assessment_definitions (family_id, slug, purpose, name_sv, name_en)
    SELECT id, ''mismatch'', ''development_programme'', ''x'', ''x''
      FROM public.scp_assessment_families WHERE product_type = ''security_competency_core'' LIMIT 1',
  'SCP_FAMILY_PURPOSE_MISMATCH',
  'G1.3 development_programme purpose requires a development_programme family');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_versions
    WHERE content_status NOT IN ('draft','expert_review','legal_review','cognitive_review',
                                 'in_review','approved','published','suspended','retired')) = 0,
  'G1.4 every existing assessment version is still a valid status');

SELECT pg_temp.ok(
  (SELECT NOT employer_visible FROM public.assessments WHERE id = 'security-guard-foundation'),
  'G1.5 the legacy assessment stays employer-invisible');
SELECT pg_temp.ok(
  (SELECT bool_and(retired_at IS NOT NULL) FROM public.assessment_versions
    WHERE assessment_id = 'security-guard-foundation'),
  'G1.6 every legacy version stays retired');

DO $$ BEGIN RAISE NOTICE 'GROUP G2 — identity separation and data minimisation'; END $$;

-- =========================================================================
-- Group G2 — the privacy foundation
-- =========================================================================

-- The ledger must carry no identifying column at all. Asserted structurally so
-- a future column addition cannot quietly reintroduce personal data.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_competency_evidence'
      AND (column_name ILIKE '%name%' OR column_name ILIKE '%email%'
        OR column_name ILIKE '%personnummer%' OR column_name ILIKE '%national_id%'
        OR column_name ILIKE '%comment%' OR column_name ILIKE '%note%')) = 0,
  'G2.1 the evidence ledger holds no name, email, identity number or free text');

-- The subject table itself carries nothing but a key.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_subjects') = 2,
  'G2.2 a subject is a key and a timestamp — nothing else');

-- Evidence references the pseudonymous subject, never auth.users directly.
-- Resolved through pg_constraint so the FK on the subject_id COLUMN is checked,
-- rather than whichever foreign key information_schema happens to return first.
SELECT pg_temp.ok(
  (SELECT confrelid::regclass::text
     FROM pg_constraint c
    WHERE c.conrelid = 'public.scp_competency_evidence'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.scp_competency_evidence'::regclass
           AND attname = 'subject_id')]::smallint[]
  ) = 'scp_subjects',
  'G2.3 evidence points at a pseudonymous subject, not at an auth identity');

-- And deleting a person must never destroy evidence.
SELECT pg_temp.ok(
  (SELECT confdeltype FROM pg_constraint c
    WHERE c.conrelid = 'public.scp_competency_evidence'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.scp_competency_evidence'::regclass
           AND attname = 'subject_id')]::smallint[]) = 'r',
  'G2.4 the subject FK is RESTRICT, so a deletion can never cascade into evidence');

DO $$ BEGIN RAISE NOTICE 'GROUP G3 — the graph is connected'; END $$;

-- =========================================================================
-- Group G3 — graph integrity
-- =========================================================================

CREATE TEMP TABLE g AS
WITH r AS (
  INSERT INTO public.scp_roles (slug) VALUES ('security-guard-test') RETURNING id
), rv AS (
  INSERT INTO public.scp_role_versions
    (role_id, version_number, content_status, name_sv, name_en, description_sv, description_en,
     jurisdiction_id)
  SELECT r.id, 1, 'published', 'Väktare', 'Security Guard', 'Test', 'Test',
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE')
    FROM r RETURNING id
), b AS (
  INSERT INTO public.scp_observable_behaviours (slug) VALUES ('deescalates-verbally') RETURNING id
), cv AS (
  SELECT id FROM public.scp_competency_versions LIMIT 1
), bv AS (
  INSERT INTO public.scp_behaviour_versions
    (behaviour_id, version_number, content_status, statement_sv, statement_en)
  SELECT id, 1, 'draft', 'Trappar ned verbalt', 'De-escalates verbally' FROM b RETURNING id
), s AS (
  INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id
), pv AS (
  INSERT INTO public.scp_purpose_versions
    (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
     jurisdiction_id, published_at)
  SELECT 'competence_development', 1, 'pn-v1', 'GDPR Art.6(1)(f) legitimate interest — competence development',
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), now()
  RETURNING id
)
SELECT (SELECT id FROM rv) AS role_version_id,
       (SELECT id FROM bv) AS behaviour_version_id,
       (SELECT id FROM cv) AS competency_version_id,
       (SELECT id FROM s)  AS subject_id,
       (SELECT id FROM pv) AS purpose_version_id;

SELECT pg_temp.must_fail(
  format('UPDATE public.scp_behaviour_versions SET content_status = ''published'' WHERE id = %L',
         (SELECT behaviour_version_id FROM g)),
  'SCP_BEHAVIOUR_WITHOUT_COMPETENCY',
  'G3.1 a behaviour with no competency cannot be published');

INSERT INTO public.scp_behaviour_competency_map (behaviour_version_id, competency_version_id)
SELECT behaviour_version_id, competency_version_id FROM g;

UPDATE public.scp_behaviour_versions SET content_status = 'published'
 WHERE id = (SELECT behaviour_version_id FROM g);

SELECT pg_temp.ok(
  (SELECT content_status FROM public.scp_behaviour_versions
    WHERE id = (SELECT behaviour_version_id FROM g)) = 'published',
  'G3.2 once mapped to a competency it publishes');

INSERT INTO public.scp_role_competency_map (role_version_id, competency_version_id, criticality)
SELECT role_version_id, competency_version_id, 'core' FROM g;

-- Scoped to this fixture's own behaviour. Counting every mapping on the
-- competency would make the assertion depend on how much real content the
-- Academy has seeded, which is not what this is testing.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_role_competency_map rc
     JOIN public.scp_behaviour_competency_map bc
       ON bc.competency_version_id = rc.competency_version_id
    WHERE rc.role_version_id = (SELECT role_version_id FROM g)
      AND bc.behaviour_version_id = (SELECT behaviour_version_id FROM g)) = 1,
  'G3.3 role → competency → behaviour is traversable end to end');

DO $$ BEGIN RAISE NOTICE 'GROUP G4 — evidence: append-only, contextual, source-gated'; END $$;

-- =========================================================================
-- Group G4 — the ledger
-- =========================================================================

INSERT INTO auth.users (id, email)
VALUES ('c0000000-0000-0000-0000-000000000001', 'subject@graph.test');
INSERT INTO public.scp_subject_identities (subject_id, user_id)
SELECT subject_id, 'c0000000-0000-0000-0000-000000000001' FROM g;

-- A reserved source type has no writer and must be refused.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.scp_competency_evidence
            (subject_id, behaviour_version_id, source_type, source_ref, contribution,
             confidence, provenance_type, jurisdiction_id, purpose_version_id)
          SELECT %L, behaviour_version_id, ''manager_observation'', gen_random_uuid(), 0.9,
                 1.0, ''human_review'',
                 (SELECT id FROM public.scp_jurisdictions WHERE code = ''SE''), purpose_version_id
            FROM g', (SELECT subject_id FROM g)),
  'SCP_EVIDENCE_SOURCE_NOT_ENABLED',
  'G4.1 a reserved evidence source has no active writer');

-- A safety-critical observation must state its severity.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.scp_competency_evidence
            (subject_id, behaviour_version_id, source_type, source_ref, contribution,
             confidence, provenance_type, is_safety_critical)
          SELECT %L, behaviour_version_id, ''assessment_response'', gen_random_uuid(), 0.9,
                 1.0, ''deterministic'', true FROM g', (SELECT subject_id FROM g)),
  'scp_evidence_safety_is_specified',
  'G4.2 a safety-critical observation must state a severity');

-- The real write path.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance_type, created_by_service, jurisdiction_id, purpose_version_id,
   role_version_id, context_type, context_ref, observed_at)
SELECT subject_id, behaviour_version_id, 'assessment_response', gen_random_uuid(),
       0.900, 1.000, 'deterministic', 'phase0-test',
       (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
       purpose_version_id, role_version_id, 'assessment_form', gen_random_uuid(), now()
  FROM g;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = (SELECT subject_id FROM g)) = 1,
  'G4.3 evidence persists with its full interpretation context');

-- Every row records where and under what rules it was collected.
SELECT pg_temp.ok(
  (SELECT bool_and(jurisdiction_id IS NOT NULL AND purpose_version_id IS NOT NULL)
     FROM public.scp_competency_evidence WHERE subject_id = (SELECT subject_id FROM g)),
  'G4.4 evidence pins a jurisdiction and a processing purpose version');

-- Conservative disclosure default: internal to the issuing employer.
SELECT pg_temp.ok(
  (SELECT bool_and(disclosure_class = 'internal_employer')
     FROM public.scp_competency_evidence WHERE subject_id = (SELECT subject_id FROM g)),
  'G4.5 evidence defaults to internal_employer disclosure');

SELECT pg_temp.must_fail(
  format('DELETE FROM public.scp_competency_evidence WHERE subject_id = %L',
         (SELECT subject_id FROM g)),
  'SCP_EVIDENCE_APPEND_ONLY',
  'G4.6 evidence is never deleted');

SELECT pg_temp.must_fail(
  format('UPDATE public.scp_competency_evidence SET contribution = 0.100 WHERE subject_id = %L',
         (SELECT subject_id FROM g)),
  'SCP_EVIDENCE_IMMUTABLE',
  'G4.7 a stored judgement cannot be rewritten');

SELECT pg_temp.must_fail(
  format('UPDATE public.scp_competency_evidence SET disclosure_class = ''shareable_projection_eligible''
           WHERE subject_id = %L', (SELECT subject_id FROM g)),
  'SCP_EVIDENCE_IMMUTABLE',
  'G4.8 disclosure classification cannot be changed after the fact');

-- Review outcome IS mutable: that is the human-review path, not a rewrite.
UPDATE public.scp_competency_evidence
   SET review_status = 'upheld'
 WHERE subject_id = (SELECT subject_id FROM g);
SELECT pg_temp.ok(
  (SELECT bool_and(review_status = 'upheld') FROM public.scp_competency_evidence
    WHERE subject_id = (SELECT subject_id FROM g)),
  'G4.9 a review outcome may be recorded without rewriting the judgement');

DO $$ BEGIN RAISE NOTICE 'GROUP G5 — erasure unlinks, it does not rewrite'; END $$;

-- =========================================================================
-- Group G5 — the erasure path
-- =========================================================================
--
-- Being append-only is NOT a claim that personal data can never be erased.

DELETE FROM public.scp_subject_identities WHERE subject_id = (SELECT subject_id FROM g);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_subject_identities
    WHERE subject_id = (SELECT subject_id FROM g)) = 0,
  'G5.1 unlinking removes the identity mapping');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = (SELECT subject_id FROM g)) = 1,
  'G5.2 the evidence survives, now pseudonymous and unresolvable');

-- Re-link so the remaining groups can exercise the subject path.
INSERT INTO public.scp_subject_identities (subject_id, user_id)
SELECT subject_id, 'c0000000-0000-0000-0000-000000000001' FROM g;

DO $$ BEGIN RAISE NOTICE 'GROUP G6 — maturity: two gates, never a percentage'; END $$;

-- =========================================================================
-- Group G6 — the maturity computation
-- =========================================================================
--
-- The rule this group protects: ONE strong answer must never reach a high
-- level. That is the difference between a competence platform and a quiz score
-- with a nicer label.

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    (SELECT subject_id FROM g), (SELECT competency_version_id FROM g)) = 'limited_evidence',
  'G6.1 one strong observation reaches only "limited_evidence"');

-- A second observation in the SAME context: breadth has not increased.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance_type, jurisdiction_id, purpose_version_id, context_type, context_ref, observed_at)
SELECT subject_id, behaviour_version_id, 'assessment_response', gen_random_uuid(),
       0.950, 1.000, 'deterministic',
       (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
       purpose_version_id, 'assessment_form',
       (SELECT context_ref FROM public.scp_competency_evidence
         WHERE subject_id = (SELECT subject_id FROM g) LIMIT 1), now()
  FROM g;

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    (SELECT subject_id FROM g), (SELECT competency_version_id FROM g)) = 'developing_evidence',
  'G6.2 a second observation in the same context reaches only "developing_evidence"');

-- A third observation in a NEW context satisfies both gates.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance_type, jurisdiction_id, purpose_version_id, context_type, context_ref, observed_at)
SELECT subject_id, behaviour_version_id, 'assessment_response', gen_random_uuid(),
       0.900, 1.000, 'deterministic',
       (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
       purpose_version_id, 'scenario', gen_random_uuid(), now()
  FROM g;

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    (SELECT subject_id FROM g), (SELECT competency_version_id FROM g)) = 'consistent_evidence',
  'G6.3 breadth across contexts reaches "consistent_evidence"');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = (SELECT subject_id FROM g)) = 3,
  'G6.4 a reassessment adds evidence rather than replacing it');

-- There is no `expert` level in the MVP.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_maturity_thresholds WHERE level = 'expert') = 0,
  'G6.5 no "expert" level exists');

-- A safety-critical observation caps the level regardless of everything else.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance_type, jurisdiction_id, purpose_version_id, context_type, context_ref,
   is_safety_critical, safety_severity, requires_human_review, review_status, observed_at)
SELECT subject_id, behaviour_version_id, 'assessment_response', gen_random_uuid(),
       0.950, 1.000, 'human_review',
       (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
       purpose_version_id, 'scenario', gen_random_uuid(),
       true, 'high', true, 'pending', now()
  FROM g;

SELECT pg_temp.ok(
  public.scp_compute_maturity(
    (SELECT subject_id FROM g), (SELECT competency_version_id FROM g)) = 'developing_evidence',
  'G6.6 a safety-critical observation caps the level despite strong performance');

-- THE property from the brief: later good evidence must NOT bury a safety flag.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
   provenance_type, jurisdiction_id, purpose_version_id, context_type, context_ref, observed_at)
SELECT subject_id, behaviour_version_id, 'assessment_response', gen_random_uuid(),
       1.000, 1.000, 'deterministic',
       (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
       purpose_version_id, 'module', gen_random_uuid(), now()
  FROM g;

SELECT pg_temp.ok(
  (SELECT has_safety_flag FROM public.scp_rm_competency_profile
    WHERE subject_id = (SELECT subject_id FROM g)
      AND competency_version_id = (SELECT competency_version_id FROM g)),
  'G6.7 later strong evidence does NOT clear a safety flag');
SELECT pg_temp.ok(
  public.scp_compute_maturity(
    (SELECT subject_id FROM g), (SELECT competency_version_id FROM g)) = 'developing_evidence',
  'G6.8 the level stays capped while the safety flag stands');
SELECT pg_temp.ok(
  (SELECT has_open_review FROM public.scp_rm_competency_profile
    WHERE subject_id = (SELECT subject_id FROM g)
      AND competency_version_id = (SELECT competency_version_id FROM g)),
  'G6.9 the open human review is surfaced on the projection');

-- No evidence reads as no_evidence, not as zero.
INSERT INTO public.scp_subjects DEFAULT VALUES;
SELECT pg_temp.ok(
  public.scp_compute_maturity(
    (SELECT id FROM public.scp_subjects
      WHERE id <> (SELECT subject_id FROM g) ORDER BY created_at DESC LIMIT 1),
    (SELECT competency_version_id FROM g)) = 'no_evidence',
  'G6.10 no evidence yields no_evidence, never a zero score');

-- Recency decays the level without deleting the evidence.
CREATE TEMP TABLE g2 AS
SELECT id FROM public.scp_competency_evidence
 WHERE subject_id = (SELECT subject_id FROM g) AND context_type = 'module';
UPDATE public.scp_competency_evidence
   SET valid_until = now() - interval '1 day' WHERE id = (SELECT id FROM g2);
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence WHERE id = (SELECT id FROM g2)) = 1,
  'G6.11 expired evidence is retained for audit, not deleted');

-- Only an explicit supersession clears a safety flag.
DO $$
DECLARE _new uuid; _old uuid;
BEGIN
  SELECT id INTO _old FROM public.scp_competency_evidence
   WHERE subject_id = (SELECT subject_id FROM g) AND is_safety_critical;

  INSERT INTO public.scp_competency_evidence
    (subject_id, behaviour_version_id, source_type, source_ref, contribution, confidence,
     provenance_type, jurisdiction_id, purpose_version_id, context_type, context_ref, observed_at)
  SELECT subject_id, behaviour_version_id, 'assessment_response', gen_random_uuid(),
         0.950, 1.000, 'human_review',
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
         purpose_version_id, 'scenario', gen_random_uuid(), now()
    FROM g RETURNING id INTO _new;

  UPDATE public.scp_competency_evidence
     SET superseded_by = _new,
         superseded_reason = 'Human review overturned the safety flag',
         superseded_at = now()
   WHERE id = _old;
END $$;

SELECT pg_temp.ok(
  (SELECT NOT has_safety_flag FROM public.scp_rm_competency_profile
    WHERE subject_id = (SELECT subject_id FROM g)
      AND competency_version_id = (SELECT competency_version_id FROM g)),
  'G6.12 an explicit supersession clears the flag');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = (SELECT subject_id FROM g) AND superseded_by IS NOT NULL) = 1,
  'G6.13 the superseded row is retained with its reason and timestamp');

DO $$ BEGIN RAISE NOTICE 'GROUP G7 — the read-model contract'; END $$;

-- =========================================================================
-- Group G7 — contract v1
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_contract_versions
    WHERE contract_version = 'v1' AND status = 'available') = 3,
  'G7.1 three read models are available in contract v1');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_contract_versions
    WHERE contract_version = 'v1' AND status = 'reserved') = 5,
  'G7.2 five agent read models are reserved and unimplemented');

-- A contract row must never claim "available" for a view that does not exist.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_contract_versions cv
    WHERE cv.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM information_schema.views v
                       WHERE v.table_schema='public' AND v.table_name = cv.read_model)) = 0,
  'G7.2b every available read model has a real view behind it');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scp_rm_competency_profile'
      AND (column_name ILIKE '%percent%' OR column_name ILIKE '%score%'
           OR column_name ILIKE '%rank%')) = 0,
  'G7.3 the read model exposes no percentage, score or rank column');

SELECT pg_temp.ok(
  (SELECT maturity_level FROM public.scp_rm_competency_profile
    WHERE subject_id = (SELECT subject_id FROM g)
      AND competency_version_id = (SELECT competency_version_id FROM g))
  IN ('no_evidence','limited_evidence','developing_evidence','consistent_evidence','strong_evidence'),
  'G7.4 the read model returns a level from the closed vocabulary');

DO $$ BEGIN RAISE NOTICE 'GROUP G8 — access control'; END $$;

-- =========================================================================
-- Group G8 — RLS
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE own AS SELECT count(*) AS n FROM public.scp_competency_evidence;
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM own) > 0, 'G8.1 a subject can read their own evidence');

INSERT INTO auth.users (id, email)
VALUES ('c0000000-0000-0000-0000-000000000009', 'stranger@graph.test');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000009';
CREATE TEMP TABLE other AS SELECT count(*) AS n FROM public.scp_competency_evidence;
CREATE TEMP TABLE ident AS SELECT count(*) AS n FROM public.scp_subject_identities;
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM other) = 0, 'G8.2 a different user sees no evidence at all');
SELECT pg_temp.ok((SELECT n FROM ident) = 0,
  'G8.3 a different user cannot resolve any subject to a person');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000009';
CREATE TEMP TABLE defs AS SELECT count(*) AS n FROM public.scp_behaviour_versions;
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT n FROM defs) > 0,
  'G8.4 graph definitions stay readable — a manager must see what a competency means');

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_competency_evidence',
  'permission denied', 'G8.5 anon cannot read evidence');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_subject_identities',
  'permission denied', 'G8.6 anon cannot read the identity mapping');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_behaviour_versions',
  'permission denied', 'G8.7 anon cannot read graph definitions');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_rm_competency_profile',
  'permission denied', 'G8.8 anon cannot read the contract read model');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon'
      AND table_name LIKE 'scp\_%') = 0,
  'G8.9 anon holds no grant on any scp_ table');

DO $$ BEGIN RAISE NOTICE 'scp_competency_graph_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
