-- #47 — The durable Assessment & Training Library: tenancy, lifecycle, maturity.
--
-- Four properties this suite exists to protect, in order of how expensive they
-- would be to discover in production:
--
--   1. TRAINING NEVER MOVES MEASURED MATURITY. Not up, not down, not by one
--      threshold quantity. Evidence is append-only, so a wrong answer here is
--      permanent. Group L4 asserts it in both directions and proves the
--      counterfactual, so the test fails if someone "simplifies" the rule away.
--
--   2. ONE EMPLOYER NEVER SEES ANOTHER'S CONTENT. Including the behaviour map,
--      which describes what a private module is ABOUT.
--
--   3. THE LIBRARY NEVER ADVERTISES WHAT THE ASSIGN PATH WOULD REFUSE.
--
--   4. HISTORY IS PINNED. A published v2 does not rewrite what a completed
--      participant did against v1.
--
-- One transaction, ends in ROLLBACK.

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

-- ---------------------------------------------------------------------------
-- Fixture: TWO organisations. Everything about tenancy is meaningless with one.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE lib_fx AS
SELECT
  'cc000000-0000-0000-0000-000000000001'::uuid AS employer_a,
  'cc000000-0000-0000-0000-000000000002'::uuid AS owner_a,
  'cc000000-0000-0000-0000-000000000003'::uuid AS employer_b,
  'cc000000-0000-0000-0000-000000000004'::uuid AS owner_b,
  'cc000000-0000-0000-0000-000000000005'::uuid AS participant;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_a     FROM lib_fx), 'owner-a@library.test'),
  ((SELECT owner_b     FROM lib_fx), 'owner-b@library.test'),
  ((SELECT participant FROM lib_fx), 'participant@library.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer_a, 'Library Alpha AB', 'library-alpha-test', 'active' FROM lib_fx
UNION ALL
SELECT employer_b, 'Library Beta AB',  'library-beta-test',  'active' FROM lib_fx;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer_a, owner_a, 'owner', 'active' FROM lib_fx
UNION ALL
SELECT employer_b, owner_b, 'owner', 'active' FROM lib_fx;

GRANT SELECT ON lib_fx TO authenticated;

-- Employer B owns a private module. This is the row the whole tenancy story is
-- about, and it does not exist anywhere in seeded content.
CREATE TEMP TABLE lib_private AS
WITH m AS (
  INSERT INTO public.scp_modules (slug, owner_employer_id)
  SELECT 'beta-private-site-instructions', employer_b FROM lib_fx
  RETURNING id
), pv AS (
  SELECT id FROM public.scp_program_versions ORDER BY created_at LIMIT 1
), mv AS (
  INSERT INTO public.scp_module_versions
    (module_id, program_version_id, version_number, display_order, content_status,
     name_sv, name_en, summary_sv, summary_en, estimated_minutes)
  SELECT m.id, pv.id, 1, 99, 'draft',
         'Betas platsinstruktion', 'Beta site instruction',
         'Privat', 'Private', 20
    FROM m, pv
  RETURNING id, module_id
)
SELECT mv.id AS module_version_id, mv.module_id FROM mv;

INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
SELECT (SELECT module_version_id FROM lib_private),
       (SELECT id FROM public.scp_behaviour_versions LIMIT 1);

GRANT SELECT ON lib_private TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP L1 — lifecycle normalisation'; END $$;

-- =========================================================================
-- Group L1 — the five presentation states, over BOTH governed vocabularies
-- =========================================================================

SELECT pg_temp.ok(public.scp_lifecycle_state('draft', NULL, false) = 'draft',
  'L1.1 draft normalises to draft');
SELECT pg_temp.ok(public.scp_lifecycle_state('published', NULL, false) = 'published',
  'L1.2 published normalises to published');
SELECT pg_temp.ok(public.scp_lifecycle_state('in_review', NULL, false) = 'under_review',
  'L1.3 the assessment review state normalises to under_review');
SELECT pg_temp.ok(public.scp_lifecycle_state('legal_review', NULL, false) = 'under_review',
  'L1.4 the programme legal-review state normalises to under_review');
SELECT pg_temp.ok(public.scp_lifecycle_state('cognitive_review', NULL, false) = 'under_review',
  'L1.5 the programme cognitive-review state normalises to under_review');
SELECT pg_temp.ok(public.scp_lifecycle_state('published', NULL, true) = 'internal_testing',
  'L1.6 a PUBLISHED test fixture is internal testing, not a customer product');
SELECT pg_temp.ok(public.scp_lifecycle_state('published', now(), false) = 'retired',
  'L1.7 retirement outranks publication');

-- Totality: nothing stored anywhere falls through the mapping.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM (
      SELECT DISTINCT content_status AS s FROM public.scp_assessment_versions
      UNION SELECT DISTINCT content_status FROM public.scp_program_versions
      UNION SELECT DISTINCT content_status FROM public.scp_module_versions
    ) v
     WHERE public.scp_lifecycle_state(v.s, NULL, false)
           NOT IN ('draft','internal_testing','under_review','published','retired')),
  'L1.8 every stored content_status in the database normalises to a known state');

DO $$ BEGIN RAISE NOTICE 'GROUP L2 — tenant isolation'; END $$;

-- =========================================================================
-- Group L2 — employer A cannot see employer B's private content
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000002';  -- owner A

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_modules
               WHERE slug = 'beta-private-site-instructions'),
  'L2.1 employer A sees zero rows of employer B''s private MODULE');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_module_versions mv
               WHERE mv.id = (SELECT module_version_id FROM lib_private)),
  'L2.2 employer A sees zero rows of employer B''s private MODULE VERSION');

-- The map describes what the private module is about. It leaks the shape of
-- the content even when the content itself is protected.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_module_behaviour_map bm
               WHERE bm.module_version_id = (SELECT module_version_id FROM lib_private)),
  'L2.3 employer A sees zero rows of employer B''s private BEHAVIOUR MAP');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library(
                (SELECT employer_a FROM lib_fx))
               WHERE slug = 'beta-private-site-instructions'),
  'L2.4 employer B''s private content is absent from employer A''s library');

-- And the library refuses an organisation the caller is not a member of. This
-- is the "employerId from the route is a claim, not a fact" boundary.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library(
                (SELECT employer_b FROM lib_fx))),
  'L2.5 owner A calling the library for employer B receives zero rows');

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000004';  -- owner B
SET LOCAL ROLE authenticated;

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_modules
           WHERE slug = 'beta-private-site-instructions'),
  'L2.6 employer B CAN see its own private module (isolation is not a blanket deny)');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_module_behaviour_map bm
           WHERE bm.module_version_id = (SELECT module_version_id FROM lib_private)),
  'L2.7 employer B CAN see its own private behaviour map');

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP L3 — the library never advertises what assign would refuse'; END $$;

-- =========================================================================
-- Group L3 — eligibility
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000002';  -- owner A

-- No test grant and no fixture access: the internal material is not even listed.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library(
                (SELECT employer_a FROM lib_fx)) WHERE is_test_fixture),
  'L3.1 without fixture access, internal test material is not listed at all');

-- The real Security Guard baseline is draft/design, so it must appear (an
-- employer may see what is coming) but must NOT be assignable.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_employer_content_library(
            (SELECT employer_a FROM lib_fx))
           WHERE slug = 'sg-operational-baseline' AND lifecycle_state = 'draft'),
  'L3.2 draft customer content is visible as draft');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library(
                (SELECT employer_a FROM lib_fx))
               WHERE slug = 'sg-operational-baseline' AND assignable),
  'L3.3 draft content is NOT assignable without a closed-test grant');

-- Every listed item agrees with the engine. This is the invariant that stops
-- the library and the assign path drifting apart again.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_employer_content_library((SELECT employer_a FROM lib_fx)) l
     WHERE l.library_kind = 'assessment'
       AND l.assignable
       AND l.governance_mode IS NULL),
  'L3.4 nothing is marked assignable without a governance basis');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_employer_content_library((SELECT employer_a FROM lib_fx)) l
     WHERE l.assignable AND l.lifecycle_state = 'retired'),
  'L3.5 retired content is never assignable');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_employer_content_library((SELECT employer_a FROM lib_fx)) l
     WHERE l.assignable AND l.unassignable_reason IS NOT NULL),
  'L3.6 assignable and a refusal reason are mutually exclusive');

-- The training side is present and honest about not being deliverable yet.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_employer_content_library(
            (SELECT employer_a FROM lib_fx)) WHERE library_kind = 'training'),
  'L3.7 training programmes appear in the same library as assessments');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library(
                (SELECT employer_a FROM lib_fx))
               WHERE library_kind = 'training' AND assignable),
  'L3.8 training is not advertised as assignable while delivery does not exist');

-- Presentation: no raw scaffolding name reaches a customer surface.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library(
                (SELECT employer_a FROM lib_fx))
               WHERE name_sv LIKE 'TESTFIXTUR%' OR name_en LIKE 'TESTFIXTUR%'),
  'L3.9 no raw TESTFIXTUR label is returned by the library');

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP L4 — training completion never moves measured maturity'; END $$;

-- =========================================================================
-- Group L4 — the locked Product Owner rule
--
-- Asserted as a BEFORE/AFTER identity on the real function, not as a property
-- of the flag, because the flag is only interesting if the computation honours
-- it. L4.6 deliberately re-enables the rule to prove the assertion has teeth.
-- =========================================================================

CREATE TEMP TABLE lib_mat AS
SELECT
  (SELECT id FROM public.scp_competency_versions LIMIT 1) AS cv,
  (SELECT bcm.behaviour_version_id FROM public.scp_behaviour_competency_map bcm
    WHERE bcm.competency_version_id = (SELECT id FROM public.scp_competency_versions LIMIT 1)
    LIMIT 1) AS bv,
  (SELECT id FROM public.scp_purpose_versions WHERE published_at IS NOT NULL LIMIT 1) AS pv,
  (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE') AS jur;

INSERT INTO public.scp_subjects (id) VALUES ('cc000000-0000-0000-0000-0000000000aa');

-- Three assessment observations across two contexts: consistent_evidence.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, provenance_type,
   created_by_service, purpose_version_id, jurisdiction_id, context_type,
   context_ref, contribution, confidence, disclosure_class, observed_at)
SELECT 'cc000000-0000-0000-0000-0000000000aa', bv, 'assessment_response',
       gen_random_uuid(), 'deterministic', 'library-test', pv, jur, 'module',
       gen_random_uuid(), 0.800, 0.900, 'participant_visible', now()
  FROM lib_mat, generate_series(1, 3);

CREATE TEMP TABLE lib_before AS
SELECT public.scp_compute_maturity('cc000000-0000-0000-0000-0000000000aa',
         (SELECT cv FROM lib_mat), 'v1', now()) AS level,
       (SELECT count(DISTINCT e.source_type) FROM public.scp_competency_evidence e
         WHERE e.subject_id = 'cc000000-0000-0000-0000-0000000000aa') AS srcs;

SELECT pg_temp.ok((SELECT level FROM lib_before) = 'consistent_evidence',
  'L4.1 baseline: assessment evidence alone produces consistent_evidence');

-- Now complete two training modules against the same behaviour.
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, provenance_type,
   created_by_service, purpose_version_id, jurisdiction_id, context_type,
   context_ref, contribution, confidence, disclosure_class, observed_at)
SELECT 'cc000000-0000-0000-0000-0000000000aa', bv, 'training_completion',
       gen_random_uuid(), 'deterministic', 'library-test', pv, jur, 'module',
       gen_random_uuid(), 0.250, 0.500, 'participant_visible', now()
  FROM lib_mat, generate_series(1, 2);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = 'cc000000-0000-0000-0000-0000000000aa'
      AND source_type = 'training_completion') = 2,
  'L4.2 the training completions WERE recorded — this is history, not a no-op');

SELECT pg_temp.ok(
  public.scp_compute_maturity('cc000000-0000-0000-0000-0000000000aa',
    (SELECT cv FROM lib_mat), 'v1', now()) = (SELECT level FROM lib_before),
  'L4.3 measured maturity is EXACTLY unchanged after training completion');

-- Training alone can never manufacture a verified level.
INSERT INTO public.scp_subjects (id) VALUES ('cc000000-0000-0000-0000-0000000000bb');
INSERT INTO public.scp_competency_evidence
  (subject_id, behaviour_version_id, source_type, source_ref, provenance_type,
   created_by_service, purpose_version_id, jurisdiction_id, context_type,
   context_ref, contribution, confidence, disclosure_class, observed_at)
SELECT 'cc000000-0000-0000-0000-0000000000bb', bv, 'training_completion',
       gen_random_uuid(), 'deterministic', 'library-test', pv, jur, 'module',
       gen_random_uuid(), 0.900, 1.000, 'participant_visible', now()
  FROM lib_mat, generate_series(1, 8);

SELECT pg_temp.ok(
  public.scp_compute_maturity('cc000000-0000-0000-0000-0000000000bb',
    (SELECT cv FROM lib_mat), 'v1', now()) = 'no_evidence',
  'L4.4 eight perfect training completions still produce no_evidence');

SELECT pg_temp.ok(
  (SELECT counts_toward_maturity FROM public.scp_evidence_source_types
    WHERE code = 'training_completion') = false,
  'L4.5 the rule is data: training_completion.counts_toward_maturity is false');

-- The counterfactual. If this assertion ever fails, the exclusion has been
-- removed and L4.3 has become vacuous.
DO $$
DECLARE _with text; _without text;
BEGIN
  _with := public.scp_compute_maturity('cc000000-0000-0000-0000-0000000000aa',
             (SELECT cv FROM lib_mat), 'v1', now());
  UPDATE public.scp_evidence_source_types
     SET counts_toward_maturity = true WHERE code = 'training_completion';
  _without := public.scp_compute_maturity('cc000000-0000-0000-0000-0000000000aa',
                (SELECT cv FROM lib_mat), 'v1', now());
  UPDATE public.scp_evidence_source_types
     SET counts_toward_maturity = false WHERE code = 'training_completion';

  IF _with = _without THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: L4.6 the exclusion changes nothing, so it is not being '
      'applied. With the rule: %. Without it: %.', _with, _without;
  END IF;
  RAISE NOTICE 'ok  L4.6 counterfactual: without the rule maturity would move % -> %',
    _with, _without;
END $$;

SELECT pg_temp.ok(
  (SELECT counts_toward_maturity FROM public.scp_evidence_source_types
    WHERE code = 'assessment_response') = true,
  'L4.7 assessment evidence still counts — the exclusion is targeted, not global');

DO $$ BEGIN RAISE NOTICE 'GROUP L5 — recommendations point only at deliverable content'; END $$;

-- =========================================================================
-- Group L5 — development recommendations
-- =========================================================================

SELECT pg_temp.ok(
  pg_get_functiondef('public.scp_development_recommendations(uuid)'::regprocedure)
    LIKE '%content_status = ''published''%',
  'L5.1 recommendations filter on published content_status');

SELECT pg_temp.ok(
  pg_get_functiondef('public.scp_development_recommendations(uuid)'::regprocedure)
    LIKE '%retired_at IS NULL%',
  'L5.2 recommendations exclude retired module versions');

SELECT pg_temp.ok(
  pg_get_functiondef('public.scp_development_recommendations(uuid)'::regprocedure)
    LIKE '%owner_employer_id IS NULL%',
  'L5.3 recommendations never surface another employer''s private module');

-- Behavioural, not just textual: the draft sg-* modules must not be recommended.
INSERT INTO public.scp_subject_identities (subject_id, user_id)
SELECT 'cc000000-0000-0000-0000-0000000000aa', participant FROM lib_fx;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000005';  -- participant

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_development_recommendations(
      'cc000000-0000-0000-0000-0000000000aa') r
      JOIN public.scp_module_versions mv ON mv.id = r.module_version_id
     WHERE mv.content_status <> 'published' OR mv.retired_at IS NOT NULL),
  'L5.4 no draft or retired module is returned to a real caller');

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP L6 — versioning and history'; END $$;

-- =========================================================================
-- Group L6 — publishing a new version never rewrites the old one
-- =========================================================================

CREATE TEMP TABLE lib_v AS
SELECT av.id AS v1_id, av.definition_id, av.version_number, av.content_status
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;

-- An attempt pins the version it ran against.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name = 'scp_attempts' AND column_name = 'assessment_version_id'),
  'L6.1 an attempt records the exact assessment version it ran against');

INSERT INTO public.scp_assessment_versions
  (definition_id, version_number, content_status, validation_status)
SELECT definition_id, version_number + 1, 'draft', 'design' FROM lib_v;

SELECT pg_temp.ok(
  (SELECT content_status FROM public.scp_assessment_versions WHERE id = (SELECT v1_id FROM lib_v))
    = (SELECT content_status FROM lib_v),
  'L6.2 creating a new version does not mutate the previous version''s status');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_assessment_versions
    WHERE definition_id = (SELECT definition_id FROM lib_v)) >= 2,
  'L6.3 both versions coexist — history is never replaced');

-- The library reports a version number so an employer can tell them apart.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cc000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library(
                (SELECT employer_a FROM lib_fx)) WHERE version_number IS NULL),
  'L6.4 every library row carries its version number');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP L7 — least privilege'; END $$;

-- =========================================================================
-- Group L7 — grants
-- =========================================================================

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_employer_content_library(uuid)', 'EXECUTE'),
  'L7.1 anon cannot execute the library read model');

SELECT pg_temp.ok(
  has_function_privilege('authenticated', 'public.scp_employer_content_library(uuid)', 'EXECUTE'),
  'L7.2 authenticated can execute the library read model');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_lifecycle_state(text,timestamptz,boolean)', 'EXECUTE'),
  'L7.3 anon cannot execute the lifecycle helper');

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated', 'public.scp_compute_maturity(uuid,uuid,text,timestamptz)', 'EXECUTE'),
  'L7.4 maturity is still not a public scoring endpoint');

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.scp_modules', 'SELECT'),
  'L7.5 anon has no read on the content spine');

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.scp_module_behaviour_map', 'SELECT'),
  'L7.6 anon has no read on the behaviour map');

DO $$ BEGIN RAISE NOTICE 'GROUP L8 — cleanup'; END $$;
ROLLBACK;
