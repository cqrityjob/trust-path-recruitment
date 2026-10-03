-- P1-B (1/4), 20270108090000: employer reports and assessment reads require an
-- ACTIVE organisation, through the canonical has_active_employer_role.
--
--   AR-F the fixture: one person assessed by employer E through the real
--        assign -> answer -> submit -> review -> release flow, a second sitting
--        waiting for review, a training assignment, an open invitation and an
--        employer decision. While E is active its owner and its authorised
--        reviewer read every one of them; a PLAIN MEMBER reads none (20270203090000:
--        membership alone no longer reads -- this suite used to assert that a
--        plain member read the same as the owner, AR-F.2).
--   AR0  REPRODUCTION. E is suspended. Inside a savepoint the access model
--        (20270204090000, 20270203090000) and then the pre-fix bodies and
--        policies of 20270108090000 are restored by running the real rollback
--        files, and E's owner still reads the participants, pipeline, released
--        report, subject progress, recommendations, decisions, invitations,
--        training and review board. Rolled back.
--   AR1  with E suspended, every read gives E's owner, member and reviewer
--        exactly what a member of an unrelated employer gets: nothing.
--   AR2  the same for every other non-active status (pending, rejected,
--        archived, draft).
--   AR3  re-activating E restores every read to the counts of AR-F.
--   AR4  the participant's own reads do not depend on E's status.
--   AR5  the primitive itself: memberships, roles, statuses, unknown ids and
--        NULLs, and who may execute it.
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
CREATE TEMP TABLE ar AS SELECT
  'a1b00000-1111-4000-8000-000000000001'::uuid AS e,
  'a1b00000-1111-4000-8000-000000000002'::uuid AS x,
  'a1b00000-0000-4000-8000-000000000001'::uuid AS o,
  'a1b00000-0000-4000-8000-000000000002'::uuid AS m,
  'a1b00000-0000-4000-8000-000000000003'::uuid AS r,
  'a1b00000-0000-4000-8000-000000000004'::uuid AS p,
  'a1b00000-0000-4000-8000-000000000005'::uuid AS xo,
  'a1b00000-0000-4000-8000-00000000000a'::uuid AS adm,
  'a1b00000-2222-4000-8000-000000000001'::uuid AS emp;
GRANT SELECT ON ar TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT o, 'ar-owner@test.invalid' FROM ar UNION ALL
SELECT m, 'ar-member@test.invalid' FROM ar UNION ALL
SELECT r, 'ar-reviewer@test.invalid' FROM ar UNION ALL
SELECT p, 'ar-participant@test.invalid' FROM ar UNION ALL
SELECT xo, 'ar-other-owner@test.invalid' FROM ar UNION ALL
SELECT adm, 'ar-admin@test.invalid' FROM ar;
INSERT INTO public.user_roles (user_id, role) SELECT adm, 'admin' FROM ar;
INSERT INTO public.employers (id, name, slug, status)
SELECT e, 'AR Employer', 'ar-employer', 'active' FROM ar UNION ALL
SELECT x, 'AR Other Employer', 'ar-other-employer', 'active' FROM ar;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, o, 'owner', 'active' FROM ar UNION ALL
SELECT e, m, 'member', 'active' FROM ar UNION ALL
SELECT e, r, 'member', 'active' FROM ar UNION ALL
SELECT x, xo, 'owner', 'active' FROM ar;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e, r, ARRAY['workforce','recruitment']::text[], o FROM ar;
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by)
SELECT emp, e, 'AR', 'Deltagare', 'ar-participant@test.invalid', 'active', o FROM ar;
INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
SELECT e, 'Employer active reads suite', o FROM ar;

CREATE TEMP TABLE arv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON arv TO PUBLIC;
INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT e, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM arv), 'Employer active reads suite', o, now() + interval '30 days' FROM ar;

-- One sitting: assigned by the owner, answered and submitted by the
-- participant; when _release, reviewed by the reviewer and released.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt(_release boolean) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM ar)::text, true);
  SELECT attempt_id INTO _att FROM public.scp_employer_assign(
    (SELECT e FROM ar), (SELECT version_id FROM arv), 'ar-participant@test.invalid',
    NULL, 'sv', 'workforce', (SELECT emp FROM ar), NULL);
  PERFORM set_config('request.jwt.claim.sub', (SELECT p FROM ar)::text, true);
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
  IF _release THEN
    PERFORM set_config('request.jwt.claim.sub', (SELECT r FROM ar)::text, true);
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
    PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM ar)::text, true);
    PERFORM public.scp_release_attempt_report(_att);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _att;
END $$;

CREATE TEMP TABLE ara AS SELECT pg_temp.run_attempt(true) AS released, NULL::uuid AS waiting;
UPDATE ara SET waiting = pg_temp.run_attempt(false);
GRANT SELECT ON ara TO PUBLIC;
CREATE TEMP TABLE arsubj AS SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT released FROM ara);
GRANT SELECT ON arsubj TO PUBLIC;

-- Training, an invitation to somebody without an account, and a decision.
SELECT set_config('request.jwt.claim.sub', (SELECT o FROM ar)::text, true);
SELECT public.scp_assign_training(
  (SELECT e FROM ar),
  (SELECT pv.id FROM public.scp_program_versions pv JOIN public.scp_programs pg ON pg.id = pv.program_id
    WHERE pg.slug = 'internal-dev-exercise-situational-reporting'),
  'ar-participant@test.invalid', 'sv', NULL, NULL, NULL, (SELECT emp FROM ar));
SELECT public.scp_invite_participant(
  (SELECT e FROM ar), (SELECT version_id FROM arv), 'ar-invitee@test.invalid', 'workforce', 'AR Inbjuden', 'sv');
SELECT public.scp_record_employer_decision(
  (SELECT released FROM ara), 'assign_development', 'evidence_thin',
  'Underlaget bygger på en källa.', 'Boka praktiskt moment', 'Driftchef', NULL);
SELECT set_config('request.jwt.claim.sub', '', true);

-- Everything a principal reads about E's people, as the authenticated role.
-- One line per read, so a failure names the read that leaked.
CREATE OR REPLACE FUNCTION pg_temp.reads_as(_uid uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb := '{}'::jsonb; _e uuid := (SELECT e FROM ar); _s uuid := (SELECT subject_id FROM arsubj);
        _rel uuid := (SELECT released FROM ara); _n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _n FROM public.scp_employer_participants(_e);               _r := _r || jsonb_build_object('participants', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_assessment_pipeline(_e);        _r := _r || jsonb_build_object('pipeline', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_person_overview(_e, _s);        _r := _r || jsonb_build_object('person_overview', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_person_assessments(_e, (SELECT emp FROM ar)); _r := _r || jsonb_build_object('person_assessments', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_training_status(_e);            _r := _r || jsonb_build_object('training_status', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_decisions(_rel);                _r := _r || jsonb_build_object('decisions', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_invitations(_e);                _r := _r || jsonb_build_object('invitations', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_review_board(_e);               _r := _r || jsonb_build_object('review_board', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_review_pressure(_e);            _r := _r || jsonb_build_object('review_pressure', _n);
  SELECT count(*) INTO _n FROM public.scp_subject_progress(_s);                    _r := _r || jsonb_build_object('subject_progress', _n);
  SELECT count(*) INTO _n FROM public.scp_development_recommendations(_s);         _r := _r || jsonb_build_object('recommendations', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_report(_rel);                   _r := _r || jsonb_build_object('employer_report', _n);
  _r := _r || jsonb_build_object('employer_report_v3', public.scp_employer_report_v3(_rel) IS NOT NULL);
  SELECT count(*) INTO _n FROM public.scp_employer_report_identity(_rel);          _r := _r || jsonb_build_object('report_identity', _n);
  SELECT count(*) INTO _n FROM public.scp_participant_report_for_issuer(_rel);     _r := _r || jsonb_build_object('participant_report_for_issuer', _n);
  -- Direct table reads under row-level security (scp_report_snapshots has no
  -- client grant; its employer policy is reached only through
  -- scp_report_snapshot_readable, exercised above).
  SELECT count(*) INTO _n FROM public.scp_assessment_invitations WHERE employer_id = _e;       _r := _r || jsonb_build_object('rls_invitations', _n);
  SELECT count(*) INTO _n FROM public.scp_employer_report_decisions WHERE employer_id = _e;   _r := _r || jsonb_build_object('rls_decisions', _n);
  SELECT count(*) INTO _n FROM public.scp_training_assignments WHERE employer_id = _e;        _r := _r || jsonb_build_object('rls_training', _n);
  SELECT count(*) INTO _n FROM public.scp_training_module_progress tp
    JOIN public.scp_training_assignments ta ON ta.id = tp.assignment_id WHERE ta.employer_id = _e; _r := _r || jsonb_build_object('rls_training_progress', _n);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- The keys of a reads_as() result that are not empty (0 or false).
CREATE OR REPLACE FUNCTION pg_temp.nonempty(_r jsonb) RETURNS text[]
LANGUAGE sql AS $$
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[])
    FROM jsonb_each(_r) j(k, v)
   WHERE v <> '0'::jsonb AND v <> 'false'::jsonb;
$$;

-- Suspend / reactivate through the real moderation function, as a platform
-- admin; other statuses through the transaction-local marker it uses.
CREATE OR REPLACE FUNCTION pg_temp.moderate(_action text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT adm FROM ar)::text, true);
  PERFORM public.moderate_employer((SELECT e FROM ar), _action, 'P1-B regression');
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.force_status(_s text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = (SELECT e FROM ar);
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;

CREATE TEMP TABLE ar_base AS SELECT
  pg_temp.reads_as((SELECT o FROM ar)) AS owner_reads,
  pg_temp.reads_as((SELECT m FROM ar)) AS member_reads,
  pg_temp.reads_as((SELECT r FROM ar)) AS reviewer_reads,
  pg_temp.reads_as((SELECT xo FROM ar)) AS outsider_reads;

-- ── AR-F · the fixture, while E is active ───────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AR-F -- while E is active its owner and reviewer read everything, a plain member nothing'; END $$;
SELECT pg_temp.ok(
  pg_temp.nonempty((SELECT owner_reads FROM ar_base)) =
  ARRAY['decisions','employer_report','employer_report_v3','invitations','participant_report_for_issuer',
        'participants','person_assessments','person_overview','pipeline','recommendations','report_identity',
        'review_board','review_pressure','rls_decisions','rls_invitations','rls_training',
        'rls_training_progress','subject_progress','training_status'],
  'AR-F.1 E''s owner reads every one of the 19 reads: ' || (SELECT owner_reads FROM ar_base)::text);
SELECT pg_temp.ok(
  pg_temp.nonempty((SELECT member_reads FROM ar_base)) = ARRAY[]::text[]
  AND (SELECT member_reads FROM ar_base) = (SELECT outsider_reads FROM ar_base),
  'AR-F.2 a PLAIN MEMBER reads nothing -- not one of the 19 reads, no row and no count -- exactly what a member of an unrelated employer reads (was: the same as the owner, bar the issuer-admin report): ' || (SELECT member_reads FROM ar_base)::text);
SELECT pg_temp.ok(
  (SELECT reviewer_reads FROM ar_base) = (SELECT owner_reads FROM ar_base) - 'participant_report_for_issuer'
     || jsonb_build_object('participant_report_for_issuer', 0),
  'AR-F.2b the authorised REVIEWER (a grant for the use case of the assessments) reads the same as the owner, except the issuer-admin participant report: ' || (SELECT reviewer_reads FROM ar_base)::text);
SELECT pg_temp.ok(pg_temp.nonempty((SELECT outsider_reads FROM ar_base)) = ARRAY[]::text[],
  'AR-F.3 a member of an unrelated employer reads nothing');

-- ── AR0 · reproduction on the pre-fix bodies and policies ───────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AR0 -- reproduction: a suspended employer reads on the pre-fix state'; END $$;
SELECT pg_temp.moderate('suspended');
SELECT pg_temp.ok((SELECT status FROM public.employers WHERE id = (SELECT e FROM ar)) = 'suspended',
  'AR0.1 E is suspended through moderate_employer()');
SAVEPOINT before_fix;
\ir ../rollback/20270204090000_interview_case_access_model_rollback.sql
\ir ../rollback/20270203090000_employer_report_access_model_rollback.sql
\ir ../rollback/20270108090000_employer_active_reads_rollback.sql
SELECT pg_temp.ok(
  pg_temp.nonempty(pg_temp.reads_as((SELECT o FROM ar))) = pg_temp.nonempty((SELECT owner_reads FROM ar_base)),
  'AR0.2 PRE-FIX: the suspended employer''s owner still reads all 19');
ROLLBACK TO SAVEPOINT before_fix;

-- ── AR1 · suspended: nothing, exactly as an outsider ────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AR1 -- a suspended employer reads nothing'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ar)) = (SELECT outsider_reads FROM ar_base),
  'AR1.1 the suspended employer''s owner gets exactly an outsider''s answer: ' || pg_temp.reads_as((SELECT o FROM ar))::text);
SELECT pg_temp.ok(pg_temp.reads_as((SELECT m FROM ar)) = (SELECT outsider_reads FROM ar_base),
  'AR1.2 its plain member gets exactly an outsider''s answer');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM ar)) = (SELECT outsider_reads FROM ar_base),
  'AR1.3 its authorised reviewer gets exactly an outsider''s answer');

-- ── AR2 · every other non-active status ─────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AR2 -- pending, rejected, archived and draft read nothing either'; END $$;
SELECT pg_temp.force_status('pending');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ar)) = (SELECT outsider_reads FROM ar_base), 'AR2.1 pending: nothing');
SELECT pg_temp.force_status('rejected');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ar)) = (SELECT outsider_reads FROM ar_base), 'AR2.2 rejected: nothing');
SELECT pg_temp.force_status('archived');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ar)) = (SELECT outsider_reads FROM ar_base), 'AR2.3 archived: nothing');
SELECT pg_temp.force_status('draft');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ar)) = (SELECT outsider_reads FROM ar_base), 'AR2.4 draft: nothing');
SELECT pg_temp.force_status('suspended');

-- ── AR4 · the participant's own reads (checked while E is suspended) ────
DO $$ BEGIN RAISE NOTICE 'GROUP AR4 -- the participant''s own reads do not depend on E'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.participant_reads() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _a int; _b int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT p FROM ar)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _a FROM public.scp_subject_progress((SELECT subject_id FROM arsubj));
  SELECT count(*) INTO _b FROM public.scp_participant_report((SELECT released FROM ara));
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN format('%s/%s', _a, _b);
END $$;
CREATE TEMP TABLE ar_p_suspended AS SELECT pg_temp.participant_reads() AS v;
SELECT pg_temp.ok((SELECT v FROM ar_p_suspended) !~ '(^|/)0(/|$)',
  'AR4.1 while E is suspended the participant reads their progress and their report: ' || (SELECT v FROM ar_p_suspended));

-- ── AR3 · reactivation restores everything ──────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AR3 -- reactivation restores every read'; END $$;
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok((SELECT status FROM public.employers WHERE id = (SELECT e FROM ar)) = 'active',
  'AR3.1 E is active again through moderate_employer()');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ar)) = (SELECT owner_reads FROM ar_base),
  'AR3.2 the owner reads exactly what it read before the suspension');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT m FROM ar)) = (SELECT member_reads FROM ar_base),
  'AR3.3 the plain member reads exactly what it read before (nothing)');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT r FROM ar)) = (SELECT reviewer_reads FROM ar_base),
  'AR3.4 the reviewer reads exactly what it read before the suspension');
SELECT pg_temp.ok(pg_temp.participant_reads() = (SELECT v FROM ar_p_suspended),
  'AR4.2 the participant reads the same while E is active as while it was suspended');

-- ── AR5 · the primitive ─────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP AR5 -- has_active_employer_role'; END $$;
SELECT pg_temp.ok(public.has_active_employer_role((SELECT o FROM ar), (SELECT e FROM ar)),
  'AR5.1 an active owner of an active organisation: true');
SELECT pg_temp.ok(public.has_active_employer_role((SELECT m FROM ar), (SELECT e FROM ar))
  AND NOT public.has_active_employer_role((SELECT m FROM ar), (SELECT e FROM ar), ARRAY['owner','admin']),
  'AR5.2 a plain member: true without a role list, false for owner/admin');
SELECT pg_temp.ok(NOT public.has_active_employer_role((SELECT xo FROM ar), (SELECT e FROM ar)),
  'AR5.3 a member of another organisation: false');
UPDATE public.employer_memberships SET status = 'suspended'
 WHERE employer_id = (SELECT e FROM ar) AND user_id = (SELECT m FROM ar);
SELECT pg_temp.ok(NOT public.has_active_employer_role((SELECT m FROM ar), (SELECT e FROM ar)),
  'AR5.4 a suspended membership of an active organisation: false');
SELECT pg_temp.force_status('suspended');
SELECT pg_temp.ok(NOT public.has_active_employer_role((SELECT o FROM ar), (SELECT e FROM ar))
  AND public.has_employer_role((SELECT o FROM ar), (SELECT e FROM ar)),
  'AR5.5 an active owner of a suspended organisation: false (has_employer_role alone says true)');
SELECT pg_temp.ok(
  public.has_active_employer_role((SELECT o FROM ar), gen_random_uuid()) IS FALSE
  AND public.has_active_employer_role((SELECT o FROM ar), NULL) IS FALSE
  AND public.has_active_employer_role(NULL, (SELECT x FROM ar)) IS FALSE,
  'AR5.6 an unknown organisation, a NULL organisation and a NULL user: false, never NULL');
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.has_active_employer_role(uuid,uuid,text[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.has_active_employer_role(uuid,uuid,text[])', 'EXECUTE')
  AND (SELECT prosecdef AND proconfig IS NOT NULL FROM pg_proc
        WHERE oid = 'public.has_active_employer_role(uuid,uuid,text[])'::regprocedure),
  'AR5.7 authenticated may execute it, anon may not; it is a definer with a pinned search_path');

ROLLBACK;
