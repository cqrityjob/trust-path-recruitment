-- P1-B (4/5), 20270111090000: Interview Intelligence and BESKT require an
-- ACTIVE organisation.
--
--   IB-F the fixture: employer E's owner opens an interview case on the
--        openly available Vaktare pack, a member assesses a core question,
--        and the candidate has filed a correction. While E is active its
--        owner and member read the case, its assessment, its events and the
--        correction, read E's BESKT people, record an assessment and open a
--        panel; finalising is refused only because the case is not ready.
--   IB0  REPRODUCTION. E is suspended. Inside a savepoint the pre-fix bodies
--        and policies are restored by running the real rollback file, and
--        E's members still read and work the case. Rolled back.
--   IB1  with E suspended, E's owner and member read exactly what an
--        unrelated employer's owner reads (nothing); recording an assessment
--        and opening a panel are refused; finalising is refused for the role,
--        not for readiness; nothing is written.
--   IB2  the same for pending, rejected, archived and draft.
--   IB3  reactivation restores every read and action; a platform admin reads
--        internal test activations throughout.
--
-- Synthetic principals; content is the seeded Vaktare pack. Everything rolls
-- back. auth.uid() resolves from request.jwt.claim.sub.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE TEMP TABLE fx(label text PRIMARY KEY, id uuid);
GRANT ALL ON fx TO authenticated;

-- ── Cast ────────────────────────────────────────────────────────────────
-- o owner of E; m member of E; r a second member (panel reviewer);
-- c the candidate; x owner of another employer; adm a platform admin.
INSERT INTO auth.users (id, email) VALUES
  ('0f130000-0000-4000-8000-000000000001', 'ib-owner@test.invalid'),
  ('0f130000-0000-4000-8000-000000000002', 'ib-member@test.invalid'),
  ('0f130000-0000-4000-8000-000000000003', 'ib-reviewer@test.invalid'),
  ('0f130000-0000-4000-8000-000000000004', 'ib-candidate@test.invalid'),
  ('0f130000-0000-4000-8000-000000000009', 'ib-other-owner@test.invalid'),
  ('0f130000-0000-4000-8000-00000000000a', 'ib-admin@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('0f130000-0000-4000-8000-00000000000a', 'admin');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f130000-1111-4000-8000-000000000001', 'IB Employer', 'ib-employer', 'active'),
  ('0f130000-1111-4000-8000-000000000009', 'IB Other Employer', 'ib-other-employer', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f130000-1111-4000-8000-000000000001', '0f130000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('0f130000-1111-4000-8000-000000000001', '0f130000-0000-4000-8000-000000000002', 'member', 'active'),
  ('0f130000-1111-4000-8000-000000000001', '0f130000-0000-4000-8000-000000000003', 'member', 'active'),
  ('0f130000-1111-4000-8000-000000000009', '0f130000-0000-4000-8000-000000000009', 'owner', 'active');
-- The two members' BASIS for working the case: a recruitment reviewer grant made by the
-- owner (membership alone gives none since 20270203090000/20270204090000).
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by) VALUES
  ('0f130000-1111-4000-8000-000000000001', '0f130000-0000-4000-8000-000000000002', ARRAY['recruitment']::text[], '0f130000-0000-4000-8000-000000000001'),
  ('0f130000-1111-4000-8000-000000000001', '0f130000-0000-4000-8000-000000000003', ARRAY['recruitment']::text[], '0f130000-0000-4000-8000-000000000001');

DO $$
DECLARE _packv uuid; _case uuid; _q uuid; _q2 uuid;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'vaktare-se' AND ver.pilot_availability = 'open' LIMIT 1;
  SELECT id INTO _q FROM public.scp_interview_core_questions WHERE pack_version_id = _packv ORDER BY id LIMIT 1;
  SELECT id INTO _q2 FROM public.scp_interview_core_questions WHERE pack_version_id = _packv ORDER BY id OFFSET 1 LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '0f130000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  _case := public.scp_iv_create_case('0f130000-1111-4000-8000-000000000001', 'IB-fall', _packv, 'Kandidat I.', NULL, 'EXT-IB-1');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '0f130000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.scp_iv_record_assessment(_case, _q, 0, 'IB-RATIONALE', NULL, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.scp_interview_candidate_corrections (case_id, candidate_user_id, what_is_wrong, what_is_correct)
  VALUES (_case, '0f130000-0000-4000-8000-000000000004', 'Fel slutdatum.', 'Rätt slutdatum är 2025-06-30.');
  -- A draft BESKT method version to activate (the replay has none), written
  -- as the table owner.
  INSERT INTO public.scp_interview_packs (id, slug, name_sv, purpose_sv, pack_kind)
  VALUES ('0f130000-5555-4000-8000-000000000001', 'ib-suite-beskt', 'IB-svit BESKT', 'Syntetiskt syfte.', 'beskt_method');
  INSERT INTO public.beskt_method_versions (pack_id, version_number, mode, source_reference,
                                            source_document_version, content_provenance)
  VALUES ('0f130000-5555-4000-8000-000000000001', 1, 'recruitment_support', 'IB suite', 'IB-1', 'cqrity_design_hypothesis');
  -- The activation row only needs to exist for the read policy; the governed
  -- grant also validates full method content this fixture does not build, so
  -- the row is written with the transaction-local marker that grant sets.
  PERFORM set_config('bcp.test_activation_write', 'on', true);
  INSERT INTO public.bcp_internal_test_activations (employer_id, method_version_id, pinned_content_hash,
                                                    decision_reference, decided_by, expires_on, grant_operation_id)
  SELECT '0f130000-1111-4000-8000-000000000001', mv.id, repeat('a', 64), 'IB suite decision',
         '0f130000-0000-4000-8000-00000000000a', current_date + 30, gen_random_uuid()
    FROM public.beskt_method_versions mv WHERE mv.pack_id = '0f130000-5555-4000-8000-000000000001';
  PERFORM set_config('bcp.test_activation_write', '', true);
  INSERT INTO fx VALUES ('packv', _packv), ('case', _case), ('q', _q), ('q2', _q2);
END $$;

-- What a principal reads, as the authenticated role.
CREATE OR REPLACE FUNCTION pg_temp.reads_as(_uid text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text; _case uuid := (SELECT id FROM fx WHERE label = 'case');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  SELECT format('case:%s|assessments:%s|events:%s|corrections:%s|people:%s|activations:%s',
    (SELECT count(*) FROM public.scp_interview_cases WHERE id = _case),
    (SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = _case),
    (SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = _case),
    (SELECT count(*) FROM public.scp_interview_candidate_corrections WHERE case_id = _case),
    (SELECT count(*) FROM public.bcp_employer_people('0f130000-1111-4000-8000-000000000001')),
    (SELECT count(*) FROM public.bcp_internal_test_activations WHERE employer_id = '0f130000-1111-4000-8000-000000000001'))
    INTO _r;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- One action as a principal, undone: 'ok' or its refusal code.
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid text, _what text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok'; _case uuid := (SELECT id FROM fx WHERE label = 'case'); _q uuid := (SELECT id FROM fx WHERE label = 'q2');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    IF _what = 'assess' THEN
      PERFORM public.scp_iv_record_assessment(_case, _q, 0, 'IB-PROBE', NULL, NULL);
    ELSIF _what = 'panel' THEN
      PERFORM public.scp_iv_panel_open(_case, ARRAY['0f130000-0000-4000-8000-000000000002', '0f130000-0000-4000-8000-000000000003']::uuid[]);
    ELSIF _what = 'finalise' THEN
      PERFORM public.scp_iv_finalise_report(_case, NULL);
    END IF;
    RAISE EXCEPTION 'IB_PROBE_UNDO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IB_PROBE_UNDO' THEN _r := split_part(split_part(SQLERRM, ':', 1), E'\n', 1); END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.actions() RETURNS text LANGUAGE sql AS $$
  SELECT format('assess:%s|panel:%s|finalise:%s',
    pg_temp.act_as('0f130000-0000-4000-8000-000000000002', 'assess'),
    pg_temp.act_as('0f130000-0000-4000-8000-000000000001', 'panel'),
    pg_temp.act_as('0f130000-0000-4000-8000-000000000001', 'finalise'));
$$;

CREATE OR REPLACE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
  SELECT format('assessments:%s|panels:%s|reports:%s',
    (SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = (SELECT id FROM fx WHERE label = 'case')),
    (SELECT count(*) FROM public.scp_interview_panels WHERE case_id = (SELECT id FROM fx WHERE label = 'case')),
    (SELECT count(*) FROM public.scp_interview_reports WHERE case_id = (SELECT id FROM fx WHERE label = 'case')));
$$;

CREATE OR REPLACE FUNCTION pg_temp.force_status(_s text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = '0f130000-1111-4000-8000-000000000001';
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.moderate(_action text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f130000-0000-4000-8000-00000000000a', true);
  PERFORM public.moderate_employer('0f130000-1111-4000-8000-000000000001', _action, 'P1-B regression');
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

CREATE TEMP TABLE ib_base AS SELECT
  pg_temp.reads_as('0f130000-0000-4000-8000-000000000001') AS owner_reads,
  pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') AS member_reads,
  pg_temp.reads_as('0f130000-0000-4000-8000-000000000009') AS outsider_reads,
  pg_temp.reads_as('0f130000-0000-4000-8000-00000000000a') AS admin_reads,
  pg_temp.state() AS state_before;

-- ── IB-F · while E is active ────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IB-F -- while E is active its members read and work the case'; END $$;
SELECT pg_temp.ok((SELECT owner_reads FROM ib_base) ~ '^case:1\|assessments:1\|events:[1-9][0-9]*\|corrections:1\|people:3\|activations:1$',
  'IB-F.1 E''s owner reads the case, its assessment, events and correction, E''s BESKT people and test activation: ' || (SELECT owner_reads FROM ib_base));
SELECT pg_temp.ok((SELECT member_reads FROM ib_base) = (SELECT owner_reads FROM ib_base),
  'IB-F.2 a plain member reads the same');
SELECT pg_temp.ok((SELECT outsider_reads FROM ib_base) = 'case:0|assessments:0|events:0|corrections:0|people:0|activations:0',
  'IB-F.3 an unrelated employer''s owner reads nothing');
SELECT pg_temp.ok(pg_temp.actions() = 'assess:ok|panel:ok|finalise:SCP_IV_REPORT_BLOCKED',
  'IB-F.4 the member records an assessment, the owner opens a panel; finalising is refused only because the case is not ready: ' || pg_temp.actions());
SELECT pg_temp.ok(pg_temp.state() = (SELECT state_before FROM ib_base), 'IB-F.5 the probes left nothing behind');

-- ── IB0 · reproduction on the pre-fix state ─────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IB0 -- reproduction: a suspended employer on the pre-fix state'; END $$;
SELECT pg_temp.moderate('suspended');
SAVEPOINT before_fix;
\ir ../rollback/20270111090000_interview_beskt_active_employer_rollback.sql
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') = (SELECT member_reads FROM ib_base),
  'IB0.1 PRE-FIX: the suspended employer''s member still reads the case, assessment, events, correction and BESKT data');
SELECT pg_temp.ok(pg_temp.actions() = 'assess:ok|panel:ok|finalise:SCP_IV_REPORT_BLOCKED',
  'IB0.2 PRE-FIX: and still records assessments and opens panels');
ROLLBACK TO SAVEPOINT before_fix;

-- ── IB1 · suspended ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IB1 -- a suspended employer reads and works nothing'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000001') = (SELECT outsider_reads FROM ib_base),
  'IB1.1 the suspended employer''s owner gets exactly an outsider''s answer: ' || pg_temp.reads_as('0f130000-0000-4000-8000-000000000001'));
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') = (SELECT outsider_reads FROM ib_base),
  'IB1.2 its member gets exactly an outsider''s answer');
SELECT pg_temp.ok(pg_temp.actions() !~ 'assess:ok|panel:ok' AND pg_temp.actions() LIKE '%finalise:SCP_IV_FINALISE_ROLE',
  'IB1.3 assessing and opening a panel are refused; finalising is refused for the role: ' || pg_temp.actions());
SELECT pg_temp.ok(pg_temp.state() = (SELECT state_before FROM ib_base), 'IB1.4 nothing was written');
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-00000000000a') = (SELECT admin_reads FROM ib_base),
  'IB1.5 a platform admin still reads internal test activations');

-- ── IB2 · every other non-active status ─────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IB2 -- pending, rejected, archived and draft'; END $$;
SELECT pg_temp.force_status('pending');
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') = (SELECT outsider_reads FROM ib_base)
  AND pg_temp.actions() !~ 'assess:ok|panel:ok', 'IB2.1 pending: nothing read, nothing done');
SELECT pg_temp.force_status('rejected');
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') = (SELECT outsider_reads FROM ib_base)
  AND pg_temp.actions() !~ 'assess:ok|panel:ok', 'IB2.2 rejected: nothing read, nothing done');
SELECT pg_temp.force_status('archived');
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') = (SELECT outsider_reads FROM ib_base)
  AND pg_temp.actions() !~ 'assess:ok|panel:ok', 'IB2.3 archived: nothing read, nothing done');
SELECT pg_temp.force_status('draft');
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') = (SELECT outsider_reads FROM ib_base)
  AND pg_temp.actions() !~ 'assess:ok|panel:ok', 'IB2.4 draft: nothing read, nothing done');
SELECT pg_temp.force_status('suspended');

-- ── IB3 · reactivation ──────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IB3 -- reactivation restores every read and action'; END $$;
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok(pg_temp.reads_as('0f130000-0000-4000-8000-000000000001') = (SELECT owner_reads FROM ib_base)
  AND pg_temp.reads_as('0f130000-0000-4000-8000-000000000002') = (SELECT member_reads FROM ib_base),
  'IB3.1 owner and member read exactly what they read before the suspension');
SELECT pg_temp.ok(pg_temp.actions() = 'assess:ok|panel:ok|finalise:SCP_IV_REPORT_BLOCKED',
  'IB3.2 every action is allowed again');

ROLLBACK;
