-- An assignment names WHY it processes a person, or it does not happen.
--
-- scp_employer_assign used to choose the processing purpose with
--
--   WHERE p.is_active AND pv.published_at IS NOT NULL
--   ORDER BY pv.published_at DESC LIMIT 1
--
-- across ALL purposes, never reading the use case. With one purpose published
-- the wrong answer is invisible; with two it silently mislabels every
-- assignment. 20260820090000 replaced that with an explicit mapping that fails
-- closed, and this suite is what stops the fallback coming back.
--
-- The three properties it protects:
--
--   * the mapping is explicit and total over what the product supports
--   * a purpose with no approved published version REFUSES rather than
--     substituting a different one
--   * once an attempt records a purpose, that purpose cannot be rewritten
--
-- Recruitment and reassessment are deliberately closed here. That is not a gap
-- in the test — publishing those purpose versions asserts a lawful basis and a
-- privacy notice, which is a Product Owner and legal decision. The suite
-- asserts the closure is real and safe.
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
-- Fixture: one organisation, an owner who may assign, a participant.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE pg_fx AS
SELECT
  'ee000000-0000-0000-0000-000000000001'::uuid AS employer,
  'ee000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'ee000000-0000-0000-0000-000000000003'::uuid AS participant;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user  FROM pg_fx), 'owner@purpose-gov.test'),
  ((SELECT participant FROM pg_fx), 'participant@purpose-gov.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Purpose Governance AB', 'purpose-governance-test', 'active' FROM pg_fx;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM pg_fx;

CREATE TEMP TABLE pg_ver AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC
 LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM pg_ver),
       'Purpose governance suite', owner_user, now() + interval '30 days'
  FROM pg_fx;

GRANT SELECT ON pg_fx, pg_ver TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP PG1 — the mapping is explicit and total'; END $$;

-- =========================================================================
-- Group PG1 — one mapping, no guessing
-- =========================================================================

SELECT pg_temp.ok(
  public.scp_required_purpose_code('workforce') = 'competence_development',
  'PG1.1 an employee/development assignment asks for competence_development');

SELECT pg_temp.ok(
  public.scp_required_purpose_code('recruitment') = 'selection_support',
  'PG1.2 a recruitment assignment asks for selection_support');

-- The three-argument form, added when closed-test recruitment became a truthful
-- context. The OPERATIONAL answer is unchanged and is still what the
-- two-argument form gives, so anything that has not been taught about closed
-- testing keeps asking for the purpose that is correctly unavailable.
SELECT pg_temp.ok(
  public.scp_required_purpose_code('recruitment', NULL, 'recruitment') = 'selection_support',
  'PG1.2b operational recruitment still asks for selection_support');

SELECT pg_temp.ok(
  public.scp_required_purpose_code('recruitment', NULL, 'closed_test') = 'closed_test_recruitment',
  'PG1.2c a closed test asks for its own recruitment purpose, not selection_support');

SELECT pg_temp.ok(
  public.scp_required_purpose_code('workforce', NULL, 'closed_test') = 'competence_development',
  'PG1.2d a workforce assignment is unaffected by the governance mode');

-- Refusing to answer is the point: a caller that never established it was in a
-- closed test must not be handed the permissive purpose by omission.
SELECT pg_temp.must_fail(
  'SELECT public.scp_required_purpose_code(''recruitment'', NULL, NULL::public.scp_governance_mode)',
  'SCP_PURPOSE_NEEDS_GOVERNANCE_MODE',
  'PG1.2e the mapping will not name a recruitment purpose without a governance basis');

SELECT pg_temp.ok(
  public.scp_required_purpose_code('workforce', 'reassessment') = 'reassessment',
  'PG1.3 a reassessment asks for the reassessment purpose, not the workforce one');

-- The intent overrides the use case rather than being blended with it: a
-- reassessment of an employee is still a workforce CONTEXT, and only the
-- purpose differs.
SELECT pg_temp.ok(
  public.scp_required_purpose_code('workforce') <> public.scp_required_purpose_code('workforce', 'reassessment'),
  'PG1.4 the same person context can carry two different purposes');

SELECT pg_temp.must_fail(
  'SELECT public.scp_required_purpose_code(''something_else'')',
  'SCP_UNKNOWN_PURPOSE_MAPPING',
  'PG1.5 an unmapped use case refuses instead of guessing');

SELECT pg_temp.must_fail(
  'SELECT public.scp_required_purpose_code(''workforce'', ''marketing'')',
  'SCP_UNKNOWN_PURPOSE_MAPPING',
  'PG1.6 an unmapped purpose intent refuses instead of guessing');

DO $$ BEGIN RAISE NOTICE 'GROUP PG2 — the development purpose is approved and actually used'; END $$;

-- =========================================================================
-- Group PG2 — the one purpose that IS approved
-- =========================================================================

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_purpose_versions pv
            JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
           WHERE pv.purpose_code = 'competence_development'
             AND p.is_active AND pv.published_at IS NOT NULL AND pv.retired_at IS NULL),
  'PG2.1 competence_development has an active, published, non-retired version');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ee000000-0000-0000-0000-000000000002';

CREATE TEMP TABLE pg_assigned AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM pg_fx), (SELECT version_id FROM pg_ver),
  'participant@purpose-gov.test', NULL, 'sv', 'workforce', NULL, NULL);

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT p.purpose_code FROM public.scp_attempts a
     JOIN public.scp_purpose_versions p ON p.id = a.purpose_version_id
    WHERE a.id = (SELECT attempt_id FROM pg_assigned)) = 'competence_development',
  'PG2.2 the attempt records the purpose its use case asked for');

SELECT pg_temp.ok(
  (SELECT a.governance_mode FROM public.scp_attempts a
    WHERE a.id = (SELECT attempt_id FROM pg_assigned))::text = 'closed_test',
  'PG2.3 purpose and governance basis are separate facts, both recorded');

DO $$ BEGIN RAISE NOTICE 'GROUP PG3 — recruitment fails closed on the purpose gate'; END $$;

-- =========================================================================
-- Group PG3 — recruitment
--
-- Two independent gates refuse recruitment, and both matter. The governance
-- gate refuses unvalidated content; the purpose gate refuses a purpose nobody
-- has approved. This group reaches the SECOND one by making the content
-- validated, which is the only way to prove the purpose gate is real rather
-- than shadowed by the gate in front of it.
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ee000000-0000-0000-0000-000000000002';

-- A closed-test grant now carries a RECRUITMENT context, and lands on its own
-- purpose. This is the case that used to be refused outright, which forced a
-- recruitment candidate to be assigned as workforce and therefore recorded as
-- an employee under a competence-development purpose. The refusal was correct
-- about operational selection and wrong about everything else.
CREATE TEMP TABLE pg_ct AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM pg_fx), (SELECT version_id FROM pg_ver),
  'participant@purpose-gov.test', NULL, 'sv', 'recruitment');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT governance_mode FROM pg_ct)::text = 'closed_test',
  'PG3.1 a recruitment context is permitted under a closed-test grant');

SELECT pg_temp.ok(
  (SELECT pv.purpose_code FROM public.scp_attempts a
     JOIN public.scp_purpose_versions pv ON pv.id = a.purpose_version_id
    WHERE a.id = (SELECT attempt_id FROM pg_ct)) = 'closed_test_recruitment',
  'PG3.1b and is recorded under closed_test_recruitment, never selection_support');

-- The whole point of the change: this person is a candidate.
SELECT pg_temp.ok(
  (SELECT aa.use_case FROM public.assessment_assignments aa
    WHERE aa.id = (SELECT assignment_id FROM pg_ct)) = 'recruitment'
  AND (SELECT aa.employee_id FROM public.assessment_assignments aa
        WHERE aa.id = (SELECT assignment_id FROM pg_ct)) IS NULL,
  'PG3.1c the candidate is recorded as a candidate, with no employment record');

-- And a development basis is still not a recruitment basis. Proven on FIXTURE
-- content, because that is the only place a development basis exists:
-- scp_grant_permits_assignment returns 'development' for a fixture and nothing
-- else, so a second organisation holding a plain development grant over real
-- content would be refused for having no basis at all — a true refusal, but
-- the wrong one to be asserting here.
INSERT INTO auth.users (id, email)
VALUES ('ee000000-0000-0000-0000-00000000000d', 'devowner@purpose-gov.test');
INSERT INTO public.employers (id, name, slug, status)
VALUES ('ee000000-1111-0000-0000-00000000000d', 'Development Only AB', 'dev-only-purpose-gov', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('ee000000-1111-0000-0000-00000000000d', 'ee000000-0000-0000-0000-00000000000d', 'owner', 'active');

CREATE TEMP TABLE pg_fix AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.is_test_fixture
   AND EXISTS (SELECT 1 FROM public.scp_forms f
                 JOIN public.scp_form_items fi ON fi.form_id = f.id
                WHERE f.assessment_version_id = av.id)
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON pg_fix TO authenticated;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT 'ee000000-1111-0000-0000-00000000000d', 'development', (SELECT definition_id FROM pg_fix),
       'Development-only grant', 'ee000000-0000-0000-0000-00000000000d', now() + interval '30 days';

SELECT pg_temp.ok(
  public.scp_grant_permits_assignment(
    'ee000000-1111-0000-0000-00000000000d', (SELECT definition_id FROM pg_fix),
    'published', 'pilot', true)::text = 'development',
  'PG3.1d the development grant genuinely yields a development basis');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ee000000-0000-0000-0000-00000000000d';

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, ''sv'', ''recruitment'')',
  'ee000000-1111-0000-0000-00000000000d', (SELECT version_id FROM pg_fix), 'participant@purpose-gov.test'),
  'SCP_NOT_VALID_FOR_RECRUITMENT',
  'PG3.1e and a development basis is still refused a recruitment context');

RESET ROLE; RESET request.jwt.claim.sub;

-- ── Making a version publishable (publication quality gates, 20260907092000) ──
--
-- Publishing an assessment version now requires that every review is cleared,
-- that the preferred answer is not always the same key or the same position,
-- and that it is not systematically the longest option. That is the whole
-- point of those gates, and it means a test can no longer publish content by
-- writing content_status = 'published' over unreviewed, unbalanced items.
--
-- This helper builds the state a genuinely publishable assessment would be in.
-- It runs inside this suite's transaction, which ends in ROLLBACK, so it
-- changes no authored content: it is scaffolding for the assertions that come
-- AFTER publication, which are what this file is actually about.
CREATE OR REPLACE FUNCTION pg_temp.make_publishable(_ver uuid)
RETURNS void LANGUAGE plpgsql AS $mp$
BEGIN
  -- 1. Every review cleared, on every item of every form of the version.
  --
  -- The immutability guard is stood down for exactly this write. Once an item
  -- version is published, scp_guard_published_immutable refuses any change to
  -- its review columns -- correctly, because in production those reviews are
  -- completed BEFORE publication, never after. A test fixture reaches the two
  -- states in whichever order the assertions need, so the scaffolding has to be
  -- able to describe a published item as the reviewed item it is standing in
  -- for. The guard goes straight back on.
  ALTER TABLE public.scp_item_versions DISABLE TRIGGER USER;

  UPDATE public.scp_item_versions iv
     SET sme_review_status         = 'approved',
         sme_reviewer_count        = 2,
         bias_review_status        = 'approved',
         cognitive_review_status   = 'passed',
         language_review_status    = 'passed',
         accessibility_review_status = 'passed'
    -- Legal review is deliberately NOT touched. Several groups construct a
    -- specific legal state -- pending, lapsed, approved -- and assert on what
    -- the assignability gate does with it. Scaffolding that quietly approved
    -- legal review would erase the very state those assertions are about.
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE fi.item_version_id = iv.id AND f.assessment_version_id = _ver;

  ALTER TABLE public.scp_item_versions ENABLE TRIGGER USER;

  UPDATE public.scp_review_requirements rr SET status = 'cleared'
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE rr.item_version_id = fi.item_version_id AND f.assessment_version_id = _ver;

  -- 2. Any constructed response needs a published rubric.
  UPDATE public.scp_rubric_versions rv
     SET content_status = 'published', published_at = now()
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE rv.item_version_id = fi.item_version_id
     AND f.assessment_version_id = _ver
     AND rv.content_status <> 'published';

  -- 3. Spread the preferred key and the preferred position across the form,
  --    instead of every item answering 'a' in first place.
  UPDATE public.scp_item_options o SET option_key = 'zz' || o.option_key
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE fi.item_version_id = o.item_version_id AND f.assessment_version_id = _ver;
  UPDATE public.scp_item_options o SET display_order = o.display_order + 20
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE fi.item_version_id = o.item_version_id AND f.assessment_version_id = _ver;

  -- Rotate by the item's ordinal on the form, so consecutive items put the
  -- preferred option on a different key and in a different place.
  UPDATE public.scp_item_options o
     SET option_key    = chr(96 + s.slot),
         display_order = s.slot
    FROM (
      SELECT o2.id,
             1 + ((row_number() OVER (PARTITION BY o2.item_version_id
                                      ORDER BY o2.is_preferred DESC, o2.display_order)
                   - 1 + it.rank) % it.n)::int AS slot
        FROM public.scp_item_options o2
        JOIN (SELECT fi.item_version_id,
                     row_number() OVER (ORDER BY fi.display_order)::int AS rank,
                     (SELECT count(*) FROM public.scp_item_options x
                       WHERE x.item_version_id = fi.item_version_id)::int AS n
                FROM public.scp_form_items fi
                JOIN public.scp_forms f ON f.id = fi.form_id
               WHERE f.assessment_version_id = _ver) it
          ON it.item_version_id = o2.item_version_id) s
   WHERE o.id = s.id;

  -- 4. Equal-length labels, so no option can be picked out by being longest.
  --    The wording is irrelevant to every assertion downstream of publication.
  UPDATE public.scp_item_option_texts ot
     SET label = rpad('Alternativ ' || o.option_key || ' ', 60, '.')
    FROM public.scp_item_options o
    JOIN public.scp_form_items fi ON fi.item_version_id = o.item_version_id
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE ot.item_option_id = o.id AND f.assessment_version_id = _ver;
END $mp$;

-- Now make the content genuinely selection-grade, so the governance gate opens
-- and the purpose gate is the only thing left.
SELECT pg_temp.make_publishable((SELECT version_id FROM pg_ver));

-- Six of sg-operational-baseline's eighteen items rest on a legal basis, and
-- the publication gate will not let a version go out with legal review
-- pending. make_publishable deliberately leaves legal review alone, because
-- other suites assert on specific legal states -- so this one records it
-- explicitly. This file has no legal-state assertion of its own; it is about
-- the PURPOSE gate, which sits further downstream.
ALTER TABLE public.scp_item_versions DISABLE TRIGGER USER;
UPDATE public.scp_item_versions iv
   SET legal_review_status = 'approved',
       legal_source        = coalesce(iv.legal_source, 'purpose-governance test scaffolding'),
       legal_reviewed_by   = coalesce(iv.legal_reviewed_by, 'purpose-governance test scaffolding'),
       legal_reviewed_at   = coalesce(iv.legal_reviewed_at, now())
  FROM public.scp_form_items fi
  JOIN public.scp_forms f ON f.id = fi.form_id
 WHERE fi.item_version_id = iv.id
   AND f.assessment_version_id = (SELECT version_id FROM pg_ver)
   AND iv.legal_basis_required;
ALTER TABLE public.scp_item_versions ENABLE TRIGGER USER;

UPDATE public.scp_assessment_versions
   SET content_status = 'published', validation_status = 'operational-selection'
 WHERE id = (SELECT version_id FROM pg_ver);

SELECT pg_temp.ok(
  public.scp_grant_permits_assignment(
    (SELECT employer FROM pg_fx), (SELECT definition_id FROM pg_ver),
    'published', 'operational-selection', false)::text = 'recruitment',
  'PG3.2 with validated content the governance gate now permits recruitment');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_purpose_versions pv
                JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
               WHERE pv.purpose_code = 'selection_support'
                 AND p.is_active AND pv.published_at IS NOT NULL),
  'PG3.3 selection_support has no approved published version');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ee000000-0000-0000-0000-000000000002';

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, ''sv'', ''recruitment'')',
  (SELECT employer FROM pg_fx), (SELECT version_id FROM pg_ver), 'participant@purpose-gov.test'),
  'SCP_PURPOSE_NOT_AVAILABLE',
  'PG3.4 OPERATIONAL recruitment still refuses — on the purpose, not on the content');

RESET ROLE; RESET request.jwt.claim.sub;

-- The refusal wrote nothing. Exactly one recruitment assignment exists: the
-- closed-test one from PG3.1.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_assignments aa
    WHERE aa.employer_id = (SELECT employer FROM pg_fx) AND aa.use_case = 'recruitment') = 1,
  'PG3.5 the refused operational assignment left no assignment row behind');

-- A closed test can never present itself as operational selection, whatever
-- writes the row.
SELECT pg_temp.must_fail(format(
  'UPDATE public.scp_attempts SET governance_mode = ''recruitment'' WHERE id = %L::uuid',
  (SELECT attempt_id FROM pg_ct)),
  'SCP_',
  'PG3.6 an attempt on the closed-test recruitment purpose cannot be relabelled operational');

DO $$ BEGIN RAISE NOTICE 'GROUP PG4 — reassessment asks for its own purpose'; END $$;

-- =========================================================================
-- Group PG4 — reassessment
--
-- Before this change scp_schedule_reassessment called scp_employer_assign with
-- four arguments, so _use_case defaulted to 'workforce' and the reassessment
-- purpose was never recorded on anything.
-- =========================================================================

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_purpose_versions pv
                JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
               WHERE pv.purpose_code = 'reassessment'
                 AND p.is_active AND pv.published_at IS NOT NULL),
  'PG4.1 the reassessment purpose has no approved published version');

-- Give the attempt a released result so the reassessment precondition is met
-- and the refusal we see is the PURPOSE one, not "no prior result".
UPDATE public.scp_attempts
   SET status = 'released', submitted_at = now(), scored_at = now(), released_at = now()
 WHERE id = (SELECT attempt_id FROM pg_assigned);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ee000000-0000-0000-0000-000000000002';

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_schedule_reassessment(%L::uuid, %L::uuid, NULL)',
  (SELECT employer FROM pg_fx), (SELECT subject_id FROM pg_assigned)),
  'SCP_PURPOSE_NOT_AVAILABLE',
  'PG4.2 a reassessment refuses on its own purpose rather than borrowing another');

RESET ROLE; RESET request.jwt.claim.sub;

-- Two attempts exist for this organisation and both were created deliberately:
-- the closed-test recruitment one from PG3.1 and the workforce one PG4 set up.
-- Stated as a count AND as an absence of the reassessment purpose, because the
-- count alone would start passing for the wrong reason the next time a group
-- above adds a fixture.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts a
    WHERE a.issuer_organization_id = (SELECT employer FROM pg_fx)) = 2,
  'PG4.3 the refused reassessment created no further attempt');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_attempts a
                JOIN public.scp_purpose_versions pv ON pv.id = a.purpose_version_id
               WHERE a.issuer_organization_id = (SELECT employer FROM pg_fx)
                 AND pv.purpose_code = 'reassessment'),
  'PG4.3b and no attempt anywhere carries the reassessment purpose');

DO $$ BEGIN RAISE NOTICE 'GROUP PG5 — a recorded purpose is frozen'; END $$;

-- =========================================================================
-- Group PG5 — immutability
--
-- The participant answered under one stated purpose. Relabelling it afterwards
-- would rewrite the justification for processing that already happened.
-- =========================================================================

-- Exercised against a value that is genuinely different. An UPDATE that sets
-- the column to what it already holds proves nothing, and a conditional
-- assertion that skips itself when the database happens to hold one purpose
-- version would be a test that passes by not running.
DO $$
DECLARE _a uuid; _other uuid;
BEGIN
  SELECT attempt_id INTO _a FROM pg_assigned;
  INSERT INTO public.scp_purpose_versions
    (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
     jurisdiction_id, published_at)
  VALUES ('competence_development', 999, 'pn-test-only',
          'test-only — never published outside this rolled-back transaction',
          (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'), NULL)
  RETURNING id INTO _other;

  BEGIN
    UPDATE public.scp_attempts SET purpose_version_id = _other WHERE id = _a;
    RAISE EXCEPTION 'ASSERTION FAILED: PG5.1 the purpose was rewritten';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  PG5.1 the guard refuses a genuine purpose change';
  END;
END $$;

SELECT pg_temp.must_fail(format(
  'UPDATE public.scp_attempts SET content_status_at_assignment = ''published'' WHERE id = %L::uuid',
  (SELECT attempt_id FROM pg_assigned)),
  'SCP_GOVERNANCE_LINEAGE_IMMUTABLE',
  'PG5.3 the content status recorded at assignment cannot be rewritten');

SELECT pg_temp.must_fail(format(
  'UPDATE public.scp_attempts SET governance_mode = ''recruitment'' WHERE id = %L::uuid',
  (SELECT attempt_id FROM pg_assigned)),
  'SCP_GOVERNANCE_LINEAGE_IMMUTABLE',
  'PG5.4 the governance basis is still frozen (unchanged behaviour)');

DO $$ BEGIN RAISE NOTICE 'GROUP PG6 — no fallback, no retired purpose'; END $$;

-- =========================================================================
-- Group PG6 — the fallback cannot come back
-- =========================================================================

-- A retired version of the required purpose must not be selected. Retire the
-- real one and prove the assignment refuses rather than reaching past it.
UPDATE public.scp_purpose_versions
   SET retired_at = now()
 WHERE purpose_code = 'competence_development' AND published_at IS NOT NULL;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ee000000-0000-0000-0000-000000000002';

SELECT pg_temp.must_fail(format(
  'SELECT * FROM public.scp_employer_assign(%L::uuid, %L::uuid, %L, NULL, ''sv'', ''workforce'')',
  (SELECT employer FROM pg_fx), (SELECT version_id FROM pg_ver), 'participant@purpose-gov.test'),
  'SCP_PURPOSE_NOT_AVAILABLE',
  'PG6.1 a retired purpose version is not usable, and nothing else is substituted');

RESET ROLE; RESET request.jwt.claim.sub;

-- Still the same two deliberate attempts from PG3.1 and PG4: nothing was added
-- by a refusal.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts a
    WHERE a.issuer_organization_id = (SELECT employer FROM pg_fx)) = 2,
  'PG6.2 the refusal created no attempt');

-- An ALLOWLIST, not a count. Two purposes are published and each was a
-- deliberate decision: competence_development, and closed_test_recruitment for
-- running a recruitment assessment inside an explicit closed-test grant.
-- Anything else appearing here is a purpose somebody published without the
-- review that publishing a purpose requires.
DO $$
DECLARE _extra text;
BEGIN
  SELECT string_agg(purpose_code, ', ') INTO _extra
    FROM public.scp_purpose_versions
   WHERE published_at IS NOT NULL
     AND purpose_code NOT IN ('competence_development', 'closed_test_recruitment');
  IF _extra IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: PG6.3 an unapproved purpose was published: %', _extra;
  END IF;
  RAISE NOTICE 'ok  PG6.3 only competence_development and closed_test_recruitment are published';
END $$;

-- And the one that would actually justify deciding about somebody is not among
-- them. Stated separately because it is the load-bearing half.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_purpose_versions
               WHERE purpose_code = 'selection_support' AND published_at IS NOT NULL),
  'PG6.4 selection_support remains unpublished — operational selection is still closed');

ROLLBACK;
