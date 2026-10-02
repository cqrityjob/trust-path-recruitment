-- P1-B (3/5), 20270110090000: assessment actions require an ACTIVE
-- organisation.
--
--   AA-F the fixture: employer E has one released sitting, one fully reviewed
--        but unreleased, one waiting for review, an open invitation and a
--        recorded assessment setup. While E is active its reviewer sees the
--        review queue and may complete a review; its owner may release,
--        decide, cancel the invitation and record a setup.
--   AA0  REPRODUCTION. E is suspended. Inside a savepoint the pre-fix bodies
--        and policy are restored by running the real rollback file, and every
--        one of those actions still succeeds. Rolled back.
--   AA1  with E suspended, the reviewer sees no queue and is not authorised,
--        every action is refused with its existing refusal, nothing is
--        written, and the setup is no longer readable.
--   AA2  the same for pending, rejected, archived and draft.
--   AA3  reactivation restores every read and action. A platform admin's
--        break-glass review stays available throughout.
--
-- Synthetic principals; everything rolls back. auth.uid() resolves from
-- request.jwt.claim.sub.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key, CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- ── Cast ────────────────────────────────────────────────────────────────
--   e    the employer under test;  x  an unrelated active employer
--   o    owner of e;  m  plain member of e;  r  authorised reviewer of e
--   p    the participant;  xo  owner of x;  adm  a platform admin
CREATE TEMP TABLE aa AS SELECT
  'a2c00000-1111-4000-8000-000000000001'::uuid AS e,
  'a2c00000-1111-4000-8000-000000000002'::uuid AS x,
  'a2c00000-0000-4000-8000-000000000001'::uuid AS o,
  'a2c00000-0000-4000-8000-000000000002'::uuid AS m,
  'a2c00000-0000-4000-8000-000000000003'::uuid AS r,
  'a2c00000-0000-4000-8000-000000000004'::uuid AS p,
  'a2c00000-0000-4000-8000-000000000005'::uuid AS xo,
  'a2c00000-0000-4000-8000-00000000000a'::uuid AS adm,
  'a2c00000-2222-4000-8000-000000000001'::uuid AS emp;
GRANT SELECT ON aa TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT o, 'aa-owner@test.invalid' FROM aa UNION ALL
SELECT m, 'aa-member@test.invalid' FROM aa UNION ALL
SELECT r, 'aa-reviewer@test.invalid' FROM aa UNION ALL
SELECT p, 'aa-participant@test.invalid' FROM aa UNION ALL
SELECT xo, 'aa-other-owner@test.invalid' FROM aa UNION ALL
SELECT adm, 'aa-admin@test.invalid' FROM aa;
INSERT INTO public.user_roles (user_id, role) SELECT adm, 'admin' FROM aa;
INSERT INTO public.employers (id, name, slug, status)
SELECT e, 'AA Employer', 'aa-employer', 'active' FROM aa UNION ALL
SELECT x, 'AA Other Employer', 'aa-other-employer', 'active' FROM aa;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, o, 'owner', 'active' FROM aa UNION ALL
SELECT e, m, 'member', 'active' FROM aa UNION ALL
SELECT e, r, 'member', 'active' FROM aa UNION ALL
SELECT x, xo, 'owner', 'active' FROM aa;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e, r, ARRAY['workforce','recruitment']::text[], o FROM aa;
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by)
SELECT emp, e, 'AA', 'Deltagare', 'aa-participant@test.invalid', 'active', o FROM aa;
INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
SELECT e, 'Assessment actions suite', o FROM aa;

CREATE TEMP TABLE aav AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON aav TO PUBLIC;
INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT e, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM aav), 'Assessment actions suite', o, now() + interval '30 days' FROM aa;

-- One sitting: assigned by the owner, answered and submitted by the
-- participant; then, by _stage: 'submitted' stops there, 'reviewed' has every
-- review completed by the reviewer, 'released' is also released by the owner.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt(_stage text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM aa)::text, true);
  SELECT attempt_id INTO _att FROM public.scp_employer_assign(
    (SELECT e FROM aa), (SELECT version_id FROM aav), 'aa-participant@test.invalid',
    NULL, 'sv', 'workforce', (SELECT emp FROM aa), NULL);
  PERFORM set_config('request.jwt.claim.sub', (SELECT p FROM aa)::text, true);
  FOR _it IN
    SELECT iv.id AS ivid, iv.item_format,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1) AS a,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS z
      FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_attempts at ON at.id = _att AND at.form_id = fi.form_id
     ORDER BY fi.display_order
  LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL, 'Svar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.a, _it.z, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.a, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
  IF _stage IN ('reviewed', 'released') THEN
    PERFORM set_config('request.jwt.claim.sub', (SELECT r FROM aa)::text, true);
    FOR _rv IN
      SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format
        FROM public.scp_human_reviews hr
        JOIN public.scp_candidate_responses r ON r.id = hr.response_id
        JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
       WHERE r.attempt_id = _att AND hr.review_status = 'pending'
    LOOP
      PERFORM public.scp_complete_human_review(_rv.id, 'upheld', 'Inom mandatet.',
        CASE WHEN _rv.is_safety_critical THEN 'no_concern' END,
        pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
    END LOOP;
    IF _stage = 'released' THEN
      PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM aa)::text, true);
      PERFORM public.scp_release_attempt_report(_att);
    END IF;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _att;
END $$;

CREATE TEMP TABLE aat AS SELECT
  pg_temp.run_attempt('released') AS released,
  NULL::uuid AS reviewed, NULL::uuid AS waiting;
UPDATE aat SET reviewed = pg_temp.run_attempt('reviewed');
UPDATE aat SET waiting = pg_temp.run_attempt('submitted');
GRANT SELECT ON aat TO PUBLIC;

-- An open invitation (to somebody with no account) and a recorded setup.
SELECT set_config('request.jwt.claim.sub', (SELECT o FROM aa)::text, true);
CREATE TEMP TABLE aainv AS
SELECT invitation_id FROM public.scp_invite_participant(
  (SELECT e FROM aa), (SELECT version_id FROM aav), 'aa-invitee@test.invalid', 'workforce', 'AA Inbjuden', 'sv');
GRANT SELECT ON aainv TO PUBLIC;
SELECT public.scp_record_assessment_setup((SELECT e FROM aa),
  (SELECT assignment_id FROM public.scp_attempts WHERE id = (SELECT waiting FROM aat)), 'operational', 'vaktare', 'general');
SELECT set_config('request.jwt.claim.sub', '', true);

-- Reads, as the authenticated role: 'queue:<n>|workload:<n>|authz:<r>|setups:<n>'.
CREATE OR REPLACE FUNCTION pg_temp.reads_as(_uid uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _q int; _w int; _a text; _s int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _q FROM public.scp_review_queue('sv') q
   WHERE q.attempt_id IN (SELECT waiting FROM aat);
  SELECT coalesce(sum(attempts_waiting), 0) INTO _w FROM public.scp_my_review_workload();
  _a := public.scp_review_authorisation(_uid, (SELECT waiting FROM aat));
  SELECT count(*) INTO _s FROM public.scp_assessment_setups WHERE employer_id = (SELECT e FROM aa);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN format('queue:%s|workload:%s|authz:%s|setups:%s', _q, _w, _a, _s);
END $$;

-- One action, as the authenticated role, undone: 'ok' or its refusal code.
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _what text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok'; _rv record; _levels jsonb; _asg uuid;
BEGIN
  -- The review to complete, read as the table owner (the reviews table has no
  -- client grant; the reviewer reaches it through the function).
  SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format INTO _rv
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE r.attempt_id = (SELECT waiting FROM aat) AND hr.review_status = 'pending'
   ORDER BY hr.id LIMIT 1;
  _levels := pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format);
  _asg := (SELECT assignment_id FROM public.scp_attempts WHERE id = (SELECT reviewed FROM aat));
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    IF _what = 'review' THEN
      PERFORM public.scp_complete_human_review(_rv.id, 'upheld', 'Inom mandatet.',
        CASE WHEN _rv.is_safety_critical THEN 'no_concern' END, _levels);
    ELSIF _what = 'release' THEN
      PERFORM public.scp_release_attempt_report((SELECT reviewed FROM aat));
    ELSIF _what = 'decision' THEN
      PERFORM public.scp_record_employer_decision((SELECT released FROM aat), 'assign_development', 'evidence_thin',
        'Underlaget bygger på en källa.', 'Boka praktiskt moment', 'Driftchef', NULL);
    ELSIF _what = 'cancel' THEN
      PERFORM public.scp_cancel_assessment_invitation((SELECT invitation_id FROM aainv), 'AA probe');
    ELSIF _what = 'setup' THEN
      PERFORM public.scp_record_assessment_setup((SELECT e FROM aa), _asg, 'operational', 'vaktare', 'general');
    END IF;
    RAISE EXCEPTION 'AA_PROBE_UNDO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'AA_PROBE_UNDO' THEN _r := split_part(SQLERRM, ':', 1); END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- All five actions by the principals allowed to take them.
CREATE OR REPLACE FUNCTION pg_temp.actions() RETURNS text
LANGUAGE sql AS $$
  SELECT format('review:%s|release:%s|decision:%s|cancel:%s|setup:%s',
    pg_temp.act_as((SELECT r FROM aa), 'review'), pg_temp.act_as((SELECT o FROM aa), 'release'),
    pg_temp.act_as((SELECT o FROM aa), 'decision'), pg_temp.act_as((SELECT o FROM aa), 'cancel'),
    pg_temp.act_as((SELECT o FROM aa), 'setup'));
$$;

CREATE OR REPLACE FUNCTION pg_temp.moderate(_action text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT adm FROM aa)::text, true);
  PERFORM public.moderate_employer((SELECT e FROM aa), _action, 'P1-B regression');
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.force_status(_s text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = (SELECT e FROM aa);
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.state() RETURNS text
LANGUAGE sql AS $$
  SELECT format('pending_reviews:%s|released:%s|decisions:%s|invitation:%s|setups:%s',
    (SELECT count(*) FROM public.scp_human_reviews hr JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      WHERE r.attempt_id = (SELECT waiting FROM aat) AND hr.review_status = 'pending'),
    (SELECT released_at IS NOT NULL FROM public.scp_attempts WHERE id = (SELECT reviewed FROM aat)),
    (SELECT count(*) FROM public.scp_employer_report_decisions WHERE attempt_id = (SELECT released FROM aat)),
    (SELECT status FROM public.scp_assessment_invitations WHERE id = (SELECT invitation_id FROM aainv)),
    (SELECT count(*) FROM public.scp_assessment_setups WHERE employer_id = (SELECT e FROM aa)));
$$;

CREATE TEMP TABLE aa_base AS SELECT
  pg_temp.reads_as((SELECT r FROM aa)) AS reviewer_reads,
  pg_temp.reads_as((SELECT o FROM aa)) AS owner_reads,
  pg_temp.reads_as((SELECT xo FROM aa)) AS outsider_reads,
  pg_temp.state() AS state_before;

-- ── AA-F · while E is active ────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AA-F -- while E is active every action is allowed'; END $$;
SELECT pg_temp.ok((SELECT reviewer_reads FROM aa_base) ~ '^queue:[1-9][0-9]*\|workload:[1-9][0-9]*\|authz:authorised\|setups:1$',
  'AA-F.1 the reviewer sees the queue and its workload, is authorised, and reads the setup: ' || (SELECT reviewer_reads FROM aa_base));
SELECT pg_temp.ok((SELECT outsider_reads FROM aa_base) = 'queue:0|workload:0|authz:not_authorised|setups:0',
  'AA-F.2 an unrelated employer''s owner sees nothing and is not authorised: ' || (SELECT outsider_reads FROM aa_base));
SELECT pg_temp.ok(pg_temp.actions() = 'review:ok|release:ok|decision:ok|cancel:ok|setup:ok',
  'AA-F.3 the reviewer may review; the owner may release, decide, cancel and record a setup: ' || pg_temp.actions());
SELECT pg_temp.ok(pg_temp.state() = (SELECT state_before FROM aa_base),
  'AA-F.4 the probes left nothing behind: ' || pg_temp.state());

-- ── AA0 · reproduction on the pre-fix state ─────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AA0 -- reproduction: a suspended employer acts on the pre-fix state'; END $$;
SELECT pg_temp.moderate('suspended');
SAVEPOINT before_fix;
\ir ../rollback/20270110090000_assessment_actions_active_employer_rollback.sql
SELECT pg_temp.ok(pg_temp.actions() = 'review:ok|release:ok|decision:ok|cancel:ok|setup:ok',
  'AA0.1 PRE-FIX: the suspended employer still reviews, releases, decides, cancels and records a setup');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM aa)) = (SELECT reviewer_reads FROM aa_base),
  'AA0.2 PRE-FIX: and its reviewer still sees the queue and is authorised');
ROLLBACK TO SAVEPOINT before_fix;

-- ── AA1 · suspended ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AA1 -- a suspended employer may not act'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM aa)) = (SELECT outsider_reads FROM aa_base),
  'AA1.1 the suspended employer''s reviewer gets exactly an outsider''s answer: ' || pg_temp.reads_as((SELECT r FROM aa)));
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM aa)) = (SELECT outsider_reads FROM aa_base),
  'AA1.2 its owner gets exactly an outsider''s answer');
SELECT pg_temp.ok(pg_temp.actions() =
  'review:SCP_NOT_A_REVIEWER|release:SCP_NOT_AUTHORISED_TO_RELEASE|decision:SCP_NOT_AUTHORISED_TO_DECIDE|cancel:SCP_NOT_AUTHORISED_TO_ASSIGN|setup:SCP_SETUP_NOT_PERMITTED',
  'AA1.3 every action is refused with its existing refusal: ' || pg_temp.actions());
SELECT pg_temp.ok(pg_temp.state() = (SELECT state_before FROM aa_base),
  'AA1.4 nothing was written');

-- ── AA2 · every other non-active status ─────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AA2 -- pending, rejected, archived and draft'; END $$;
SELECT pg_temp.force_status('pending');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM aa)) = (SELECT outsider_reads FROM aa_base)
  AND pg_temp.actions() !~ ':ok', 'AA2.1 pending: no queue, no action');
SELECT pg_temp.force_status('rejected');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM aa)) = (SELECT outsider_reads FROM aa_base)
  AND pg_temp.actions() !~ ':ok', 'AA2.2 rejected: no queue, no action');
SELECT pg_temp.force_status('archived');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM aa)) = (SELECT outsider_reads FROM aa_base)
  AND pg_temp.actions() !~ ':ok', 'AA2.3 archived: no queue, no action');
SELECT pg_temp.force_status('draft');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM aa)) = (SELECT outsider_reads FROM aa_base)
  AND pg_temp.actions() !~ ':ok', 'AA2.4 draft: no queue, no action');
SELECT pg_temp.force_status('suspended');
SELECT pg_temp.ok(public.scp_review_authorisation((SELECT adm FROM aa), (SELECT waiting FROM aat)) = 'break_glass',
  'AA2.5 a platform admin''s break-glass review stays available while E is suspended');

-- ── AA3 · reactivation ──────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AA3 -- reactivation restores every read and action'; END $$;
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM aa)) = (SELECT reviewer_reads FROM aa_base),
  'AA3.1 the reviewer reads exactly what it read before the suspension');
SELECT pg_temp.ok(pg_temp.actions() = 'review:ok|release:ok|decision:ok|cancel:ok|setup:ok',
  'AA3.2 every action is allowed again');
SELECT pg_temp.ok(public.scp_review_authorisation((SELECT adm FROM aa), (SELECT waiting FROM aat)) = 'break_glass',
  'AA3.3 the platform admin''s break-glass review is unchanged');

ROLLBACK;
