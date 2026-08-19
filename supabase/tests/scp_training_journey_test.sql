-- #47 — The training delivery journey, and the boundaries around it.
--
-- Two things this suite exists to protect:
--
--   1. THE JOURNEY ACTUALLY WORKS, end to end, in one transaction: assign,
--      discover, start, answer, get feedback, LEAVE AND RESUME, complete
--      module, complete programme, record history, and see it as the employer.
--      A journey asserted only in pieces passes while the seams are broken.
--
--   2. THE BOUNDARIES HOLD while it does. Authorisation, tenancy, purpose,
--      content eligibility, response privacy, and -- above all -- that measured
--      maturity is byte-identical before and after.
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
-- Fixture: two organisations, an owner and a plain member in each, two learners.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tf AS
SELECT
  'ff000000-0000-0000-0000-000000000001'::uuid AS employer_a,
  'ff000000-0000-0000-0000-000000000002'::uuid AS owner_a,
  'ff000000-0000-0000-0000-000000000003'::uuid AS member_a,
  'ff000000-0000-0000-0000-000000000004'::uuid AS employer_b,
  'ff000000-0000-0000-0000-000000000005'::uuid AS owner_b,
  'ff000000-0000-0000-0000-000000000006'::uuid AS learner,
  'ff000000-0000-0000-0000-000000000007'::uuid AS other_learner;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_a       FROM tf), 'owner-a@training.test'),
  ((SELECT member_a      FROM tf), 'member-a@training.test'),
  ((SELECT owner_b       FROM tf), 'owner-b@training.test'),
  ((SELECT learner       FROM tf), 'learner@training.test'),
  ((SELECT other_learner FROM tf), 'other@training.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer_a, 'Training Alpha AB', 'training-alpha-test', 'active' FROM tf
UNION ALL SELECT employer_b, 'Training Beta AB', 'training-beta-test', 'active' FROM tf;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer_a, owner_a,  'owner',  'active' FROM tf
UNION ALL SELECT employer_a, member_a, 'member', 'active' FROM tf
UNION ALL SELECT employer_b, owner_b,  'owner',  'active' FROM tf;

CREATE TEMP TABLE tp AS
SELECT pv.id AS program_version_id, p.id AS program_id
  FROM public.scp_program_versions pv
  JOIN public.scp_programs p ON p.id = pv.program_id
 WHERE p.slug = 'internal-dev-exercise-situational-reporting';

-- A draft programme, to prove ineligible content is refused.
CREATE TEMP TABLE tdraft AS
SELECT pv.id AS program_version_id
  FROM public.scp_program_versions pv
  JOIN public.scp_programs p ON p.id = pv.program_id
 WHERE p.slug = 'security-guard-operational-development';

GRANT SELECT ON tf, tp, tdraft TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP T1 — who may assign, and what may be assigned'; END $$;

-- =========================================================================
-- Group T1 — authorisation, tenancy, content eligibility, purpose
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000003';  -- member A

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L)',
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tp), 'learner@training.test'),
  'SCP_NOT_AUTHORISED_TO_ASSIGN',
  'T1.1 a plain member cannot assign training');

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000005';  -- owner B
SET LOCAL ROLE authenticated;

-- Owner B is an owner, but not of employer A.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L)',
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tp), 'learner@training.test'),
  'SCP_NOT_AUTHORISED_TO_ASSIGN',
  'T1.2 an owner of another organisation cannot assign into this one');

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';  -- owner A
SET LOCAL ROLE authenticated;

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L)',
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tdraft), 'learner@training.test'),
  'SCP_TRAINING_NOT_ASSIGNABLE',
  'T1.3 a DRAFT programme cannot be assigned');

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L)',
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tp), 'nobody@training.test'),
  'SCP_RECIPIENT_HAS_NO_ACCOUNT',
  'T1.4 a recipient with no account is refused');

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L, %L)',
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tp), 'learner@training.test', 'de'),
  'SCP_UNSUPPORTED_LANGUAGE',
  'T1.5 an unsupported language is refused');

-- The purpose is resolved, and it is the ONE that is approved. The inactive
-- codes are never selectable: scp_required_purpose_code refuses to map to them.
SELECT pg_temp.ok(
  public.scp_required_purpose_code('workforce') = 'competence_development',
  'T1.6 the development journey resolves to competence_development');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_processing_purposes
               WHERE code IN ('training_follow_up','compliance_support') AND is_active),
  'T1.7 training_follow_up and compliance_support remain inactive');

SELECT pg_temp.must_fail(
  'SELECT public.scp_required_purpose_code(''workforce'', ''training_follow_up'')',
  'SCP_UNKNOWN_PURPOSE_MAPPING',
  'T1.8 an inactive purpose cannot be requested through the intent parameter');

DO $$ BEGIN RAISE NOTICE 'GROUP T2 — the journey'; END $$;

-- =========================================================================
-- Group T2 — assign -> discover -> start -> answer -> resume -> complete
-- =========================================================================

CREATE TEMP TABLE ta AS
SELECT * FROM public.scp_assign_training(
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tp),
  'learner@training.test', 'sv', now() + interval '30 days', 'Kör igång', NULL);
GRANT SELECT ON ta TO authenticated;

SELECT pg_temp.ok((SELECT modules_seeded FROM ta) = 2,
  'T2.1 assignment seeds a progress row per module');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_training_assignments WHERE id = (SELECT assignment_id FROM ta))
    = 'assigned',
  'T2.2 a new assignment starts as assigned');

-- Version pinning: the assignment references a programme VERSION.
SELECT pg_temp.ok(
  (SELECT program_version_id FROM public.scp_training_assignments
    WHERE id = (SELECT assignment_id FROM ta)) = (SELECT program_version_id FROM tp),
  'T2.3 the assignment is pinned to the exact programme version');

-- One live assignment per person per programme version.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L)',
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tp), 'learner@training.test'),
  'duplicate key',
  'T2.4 the same programme cannot be assigned twice while one is live');

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000006';  -- the learner
SET LOCAL ROLE authenticated;

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_my_academy_work()
           WHERE work_kind = 'training' AND work_id = (SELECT assignment_id FROM ta)),
  'T2.5 the training appears in the participant''s combined Academy list');

-- The combined read model returns training WITHOUT a phantom attempt.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_attempts a
               JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
              WHERE si.user_id = auth.uid()),
  'T2.6 no attempt exists yet — training did not mint a phantom one');

SELECT pg_temp.ok(
  (SELECT modules_total FROM public.scp_my_training_programme((SELECT assignment_id FROM ta))) = 2,
  'T2.7 the participant can open the programme and sees its modules');

-- Run both modules: start, answer everything, resume, complete.
DO $$
DECLARE _a uuid; _m record; _att uuid; _att2 uuid; _it record; _fb int;
BEGIN
  SELECT assignment_id INTO _a FROM ta;
  FOR _m IN SELECT module_version_id FROM public.scp_my_training_modules(_a) ORDER BY display_order
  LOOP
    _att := public.scp_start_training_module(_a, _m.module_version_id);
    IF _att IS NULL THEN RAISE EXCEPTION 'T2 module produced no learning attempt'; END IF;

    FOR _it IN SELECT item_version_id, options FROM public.scp_get_attempt_items(_att, 'sv-SE')
    LOOP
      PERFORM public.scp_save_response(
        _att, _it.item_version_id, ((_it.options->0)->>'option_id')::uuid, NULL, NULL, NULL);

      -- Learning Mode feedback exists, and only AFTER an answer.
      SELECT count(*) INTO _fb
        FROM public.scp_get_learning_feedback(_att, _it.item_version_id, 'sv-SE');
      IF _fb = 0 THEN
        RAISE EXCEPTION 'T2 no learning feedback returned after answering';
      END IF;
    END LOOP;

    -- LEAVE AND RESUME: starting again must return the SAME attempt, with the
    -- answers still on it. This is the assertion that a reload cannot lose work.
    _att2 := public.scp_start_training_module(_a, _m.module_version_id);
    IF _att2 IS DISTINCT FROM _att THEN
      RAISE EXCEPTION 'T2 resume created a second attempt (% vs %)', _att2, _att;
    END IF;

    PERFORM public.scp_complete_training_module(_a, _m.module_version_id);
  END LOOP;
  RAISE NOTICE 'ok  T2.8 both modules started, answered, resumed and completed';
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_training_module_progress
    WHERE assignment_id = (SELECT assignment_id FROM ta) AND status = 'completed') = 2,
  'T2.9 module progress is persisted, not derived from client state');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_training_assignments WHERE id = (SELECT assignment_id FROM ta))
    = 'in_progress',
  'T2.10 the assignment moved to in_progress when the first module started');

DO $$ BEGIN RAISE NOTICE 'GROUP T3 — completion, history and maturity neutrality'; END $$;

-- =========================================================================
-- Group T3 — the completion, and the invariant that matters most
-- =========================================================================

RESET ROLE;
CREATE TEMP TABLE tmat AS
SELECT
  (SELECT subject_id FROM ta) AS subject,
  (SELECT id FROM public.scp_competency_versions LIMIT 1) AS cv,
  public.scp_compute_maturity(
    (SELECT subject_id FROM ta),
    (SELECT id FROM public.scp_competency_versions LIMIT 1), 'v1', now()) AS before_level,
  (SELECT count(DISTINCT source_type) FROM public.scp_competency_evidence
    WHERE subject_id = (SELECT subject_id FROM ta)) AS before_sources;
GRANT SELECT ON tmat TO authenticated;

SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000006';
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE tdone AS
SELECT public.scp_complete_training_programme((SELECT assignment_id FROM ta)) AS evidence_rows;

SELECT pg_temp.ok((SELECT evidence_rows FROM tdone) >= 1,
  'T3.1 completion records development history as training_completion evidence');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_training_assignments WHERE id = (SELECT assignment_id FROM ta))
    = 'completed'
  AND (SELECT completed_at FROM public.scp_training_assignments
        WHERE id = (SELECT assignment_id FROM ta)) IS NOT NULL,
  'T3.2 the assignment is completed and timestamped');

RESET ROLE;

SELECT pg_temp.ok(
  public.scp_compute_maturity((SELECT subject FROM tmat), (SELECT cv FROM tmat), 'v1', now())
    = (SELECT before_level FROM tmat),
  'T3.3 measured maturity is EXACTLY unchanged by completing the programme');

SELECT pg_temp.ok(
  (SELECT count(DISTINCT e.source_type)
     FROM public.scp_competency_evidence e
     JOIN public.scp_evidence_source_types st
       ON st.code = e.source_type AND st.counts_toward_maturity
    WHERE e.subject_id = (SELECT subject FROM tmat)) = (SELECT before_sources FROM tmat),
  'T3.4 the COUNTING source-type count is unchanged — no strong-evidence gate is unlocked');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence
    WHERE subject_id = (SELECT subject FROM tmat) AND source_type = 'training_completion') >= 1,
  'T3.5 the evidence really was written — T3.3 is not vacuous');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_competency_evidence
               WHERE subject_id = (SELECT subject FROM tmat)
                 AND source_type = 'training_completion'
                 AND context_type IS DISTINCT FROM 'module'),
  'T3.6 training evidence is module-scoped');

-- Training alone can never produce a measured level.
SELECT pg_temp.ok(
  public.scp_compute_maturity((SELECT subject FROM tmat), (SELECT cv FROM tmat), 'v1', now())
    = 'no_evidence',
  'T3.7 a subject with only training evidence computes no_evidence');

DO $$ BEGIN RAISE NOTICE 'GROUP T4 — what other people cannot see or do'; END $$;

-- =========================================================================
-- Group T4 — isolation
-- =========================================================================

SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000007';  -- a different learner
SET LOCAL ROLE authenticated;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_my_academy_work()),
  'T4.1 another participant sees none of this training');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_my_training_programme((SELECT assignment_id FROM ta))),
  'T4.2 another participant cannot open the programme');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_my_training_modules((SELECT assignment_id FROM ta))),
  'T4.3 another participant cannot list its modules');

SELECT pg_temp.must_fail(format(
  'SELECT public.scp_start_training_module(%L, %L)',
  (SELECT assignment_id FROM ta),
  (SELECT module_version_id FROM public.scp_training_module_progress
    WHERE assignment_id = (SELECT assignment_id FROM ta) LIMIT 1)),
  'SCP_TRAINING_NOT_YOURS',
  'T4.4 another participant cannot start somebody else''s module');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_training_assignments
               WHERE id = (SELECT assignment_id FROM ta)),
  'T4.5 RLS hides the assignment row itself from an unrelated participant');

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000005';  -- owner B
SET LOCAL ROLE authenticated;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_training_status((SELECT employer_a FROM tf))),
  'T4.6 another organisation gets nothing from the training status read model');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_training_assignments
               WHERE employer_id = (SELECT employer_a FROM tf)),
  'T4.7 RLS hides another organisation''s training assignments');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_training_module_progress mp
               JOIN public.scp_training_assignments t2 ON t2.id = mp.assignment_id
              WHERE t2.employer_id = (SELECT employer_a FROM tf)),
  'T4.8 RLS hides another organisation''s module progress');

DO $$ BEGIN RAISE NOTICE 'GROUP T5 — what the commissioning employer may see'; END $$;

-- =========================================================================
-- Group T5 — the employer view, and its limits
-- =========================================================================

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';  -- owner A
SET LOCAL ROLE authenticated;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_employer_training_status((SELECT employer_a FROM tf))
    WHERE assignment_id = (SELECT assignment_id FROM ta)) = 'completed',
  'T5.1 the commissioning employer sees the completed status');

SELECT pg_temp.ok(
  (SELECT modules_completed || '/' || modules_total
     FROM public.scp_employer_training_status((SELECT employer_a FROM tf))
    WHERE assignment_id = (SELECT assignment_id FROM ta)) = '2/2',
  'T5.2 the employer sees module progress');

SELECT pg_temp.ok(
  (SELECT completed_at FROM public.scp_employer_training_status((SELECT employer_a FROM tf))
    WHERE assignment_id = (SELECT assignment_id FROM ta)) IS NOT NULL,
  'T5.3 the employer sees the completion date');

-- The boundary: status yes, answers never.
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_candidate_responses r
               JOIN public.scp_attempts a ON a.id = r.attempt_id
              WHERE a.issuer_organization_id = (SELECT employer_a FROM tf)),
  'T5.4 the employer cannot read a single raw learner response');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'scp_training_assignments' AND column_name IN ('answers','response_text')),
  'T5.5 the assignment carries no answer payload at all');

DO $$ BEGIN RAISE NOTICE 'GROUP T6 — private employer content stays private'; END $$;

-- =========================================================================
-- Group T6 — employer-owned training content
-- =========================================================================

RESET ROLE;
CREATE TEMP TABLE tpriv (program_version_id uuid, program_id uuid);

DO $$
DECLARE _p uuid; _pv uuid;
BEGIN
  INSERT INTO public.scp_programs (slug, owner_employer_id, is_test_fixture)
  SELECT 'beta-private-training', employer_b, true FROM tf
  RETURNING id INTO _p;

  INSERT INTO public.scp_program_versions
    (program_id, version_number, jurisdiction_id, content_status, validation_status,
     name_sv, name_en, purpose_sv, purpose_en)
  VALUES
    (_p, 1, (SELECT id FROM public.scp_jurisdictions WHERE code='SE'),
     'draft', 'design', 'Betas interna utbildning', 'Beta internal training',
     'Privat', 'Private')
  RETURNING id INTO _pv;

  INSERT INTO tpriv VALUES (_pv, _p);
END $$;

GRANT SELECT ON tpriv TO authenticated;

SET LOCAL request.jwt.claim.sub = 'ff000000-0000-0000-0000-000000000002';  -- owner A
SET LOCAL ROLE authenticated;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_programs WHERE slug = 'beta-private-training'),
  'T6.1 employer A cannot see employer B''s private training programme');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.scp_employer_content_library((SELECT employer_a FROM tf))
               WHERE slug = 'beta-private-training'),
  'T6.2 it is absent from employer A''s library');

-- Even naming the id directly does not help: the guard checks ownership.
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L)',
  (SELECT employer_a FROM tf), (SELECT program_version_id FROM tpriv), 'learner@training.test'),
  'SCP_TRAINING_NOT_ASSIGNABLE',
  'T6.3 employer A cannot assign employer B''s private programme');

DO $$ BEGIN RAISE NOTICE 'GROUP T7 — grants'; END $$;

-- =========================================================================
-- Group T7 — least privilege on everything this phase added
-- =========================================================================

RESET ROLE;

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.scp_training_assignments', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.scp_training_module_progress', 'SELECT'),
  'T7.1 anon cannot read either training table');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_my_academy_work()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_start_training_module(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_complete_training_programme(uuid)', 'EXECUTE'),
  'T7.2 anon cannot execute any training RPC');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public'
                 AND tablename IN ('scp_training_assignments','scp_training_module_progress')
                 AND cmd <> 'SELECT'),
  'T7.3 there is no client write policy on either training table');

DO $$ BEGIN RAISE NOTICE 'GROUP T8 — cleanup'; END $$;
ROLLBACK;
