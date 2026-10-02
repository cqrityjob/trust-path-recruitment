-- P1-D (20270113090000): only an ACTIVE (approved, not suspended) organisation
-- assigns, invites, schedules, trains or binds people.
--
--   PE-F the fixture, built while employer E is active: a participant with a
--        released sitting, an unbound employment record, a registered user U
--        who applied to E's job, and an invitation to an address with no
--        account yet. While E is active its owner may assign, invite, assign
--        training, schedule a reassessment, assign from the application and
--        bind the employment record (each probe undone).
--   PE0  REPRODUCTION. E is set back to 'pending' (not yet approved). Inside a
--        savepoint the pre-fix bodies are restored by running the real
--        rollback file: every one of those actions still succeeds. Rolled back.
--   PE1  with E pending, every action is refused with its existing refusal
--        and nothing is written.
--   PE2  the same for suspended, rejected, archived and draft.
--   PE3  the invitee signs up while E is pending: claiming binds nothing and
--        leaves the invitation pending. Once E is approved, the next claim
--        binds it.
--   PE4  approval restores every action; a plain member is still refused.
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
CREATE TEMP TABLE pe AS SELECT
  'd1e00000-1111-4000-8000-000000000001'::uuid AS e,
  'd1e00000-1111-4000-8000-000000000002'::uuid AS x,
  'd1e00000-0000-4000-8000-000000000001'::uuid AS o,
  'd1e00000-0000-4000-8000-000000000002'::uuid AS m,
  'd1e00000-0000-4000-8000-000000000003'::uuid AS r,
  'd1e00000-0000-4000-8000-000000000004'::uuid AS p,
  'd1e00000-0000-4000-8000-000000000005'::uuid AS xo,
  'd1e00000-0000-4000-8000-00000000000a'::uuid AS adm,
  'd1e00000-2222-4000-8000-000000000001'::uuid AS emp,
  'd1e00000-0000-4000-8000-000000000006'::uuid AS u,
  'd1e00000-0000-4000-8000-000000000007'::uuid AS w,
  'd1e00000-2222-4000-8000-000000000002'::uuid AS emp_unbound;
GRANT SELECT ON pe TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT o, 'pe-owner@test.invalid' FROM pe UNION ALL
SELECT m, 'pe-member@test.invalid' FROM pe UNION ALL
SELECT r, 'pe-reviewer@test.invalid' FROM pe UNION ALL
SELECT p, 'pe-participant@test.invalid' FROM pe UNION ALL
SELECT xo, 'pe-other-owner@test.invalid' FROM pe UNION ALL
SELECT adm, 'pe-admin@test.invalid' FROM pe UNION ALL
SELECT u, 'pe-user@test.invalid' FROM pe;
INSERT INTO public.user_roles (user_id, role) SELECT adm, 'admin' FROM pe;
INSERT INTO public.employers (id, name, slug, status)
SELECT e, 'PE Employer', 'pe-employer', 'active' FROM pe UNION ALL
SELECT x, 'PE Other Employer', 'pe-other-employer', 'active' FROM pe;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, o, 'owner', 'active' FROM pe UNION ALL
SELECT e, m, 'member', 'active' FROM pe UNION ALL
SELECT e, r, 'member', 'active' FROM pe UNION ALL
SELECT x, xo, 'owner', 'active' FROM pe;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e, r, ARRAY['workforce','recruitment']::text[], o FROM pe;
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by)
SELECT emp, e, 'PE', 'Deltagare', 'pe-participant@test.invalid', 'active', o FROM pe UNION ALL
SELECT emp_unbound, e, 'PE', 'Obunden', 'pe-user@test.invalid', 'active', o FROM pe;
INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
SELECT e, 'Pending employer actions suite', o FROM pe;

CREATE TEMP TABLE pev AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON pev TO PUBLIC;
INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT e, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM pev), 'Pending employer actions suite', o, now() + interval '30 days' FROM pe;

-- One sitting: assigned by the owner, answered and submitted by the
-- participant; when _release, reviewed by the reviewer and released.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt(_release boolean) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM pe)::text, true);
  SELECT attempt_id INTO _att FROM public.scp_employer_assign(
    (SELECT e FROM pe), (SELECT version_id FROM pev), 'pe-participant@test.invalid',
    NULL, 'sv', 'workforce', (SELECT emp FROM pe), NULL);
  PERFORM set_config('request.jwt.claim.sub', (SELECT p FROM pe)::text, true);
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
    PERFORM set_config('request.jwt.claim.sub', (SELECT r FROM pe)::text, true);
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
    PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM pe)::text, true);
    PERFORM public.scp_release_attempt_report(_att);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _att;
END $$;

CREATE TEMP TABLE pea AS SELECT pg_temp.run_attempt(true) AS released;
GRANT SELECT ON pea TO PUBLIC;
CREATE TEMP TABLE pesubj AS SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT released FROM pea);
GRANT SELECT ON pesubj TO PUBLIC;

-- A published job (only a platform admin may create one directly) and U's
-- application to it; an invitation to an address with no account yet.
SELECT set_config('request.jwt.claim.sub', (SELECT adm FROM pe)::text, true);
INSERT INTO public.jobs (id, employer_id, title_sv, title_en, status, application_method, slug, short_id, published_at, expires_at)
SELECT 'd1e00000-4444-4000-8000-000000000001', e, 'Väktare', 'Security guard', 'published', 'internal',
       'pe-vaktare', 'PEJ0001', now(), now() + interval '30 days' FROM pe;
SELECT set_config('request.jwt.claim.sub', (SELECT u FROM pe)::text, true);
INSERT INTO public.job_applications (id, job_id, applicant_user_id, phone, cover_note, consent_given_at)
SELECT 'd1e00000-5555-4000-8000-000000000001', 'd1e00000-4444-4000-8000-000000000001', u,
       '070-5550177', 'Jag söker tjänsten.', now() FROM pe;
SELECT set_config('request.jwt.claim.sub', (SELECT o FROM pe)::text, true);
CREATE TEMP TABLE peinv AS
SELECT invitation_id FROM public.scp_invite_participant(
  (SELECT e FROM pe), (SELECT version_id FROM pev), 'pe-invitee@test.invalid', 'workforce', 'PE Inbjuden', 'sv');
GRANT SELECT ON peinv TO PUBLIC;
SELECT set_config('request.jwt.claim.sub', '', true);
CREATE TEMP TABLE peprog AS
SELECT pv.id AS program_version_id FROM public.scp_program_versions pv
  JOIN public.scp_programs pg ON pg.id = pv.program_id
 WHERE pg.slug = 'internal-dev-exercise-situational-reporting';
GRANT SELECT ON peprog TO PUBLIC;

-- One action, as the authenticated role, undone: 'ok' or its refusal code.
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _what text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok'; _e uuid := (SELECT e FROM pe); _v uuid := (SELECT version_id FROM pev);
        _prog uuid := (SELECT program_version_id FROM peprog); _s uuid := (SELECT subject_id FROM pesubj);
        _eu uuid := (SELECT emp_unbound FROM pe); _u uuid := (SELECT u FROM pe);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    IF _what = 'assign' THEN
      PERFORM public.scp_employer_assign(_e, _v, 'pe-user@test.invalid', NULL, 'sv', 'workforce', NULL, NULL);
    ELSIF _what = 'invite' THEN
      PERFORM public.scp_invite_participant(_e, _v, 'pe-someone-else@test.invalid', 'workforce', 'PE Annan', 'sv');
    ELSIF _what = 'training' THEN
      PERFORM public.scp_assign_training(_e, _prog, 'pe-participant@test.invalid', 'sv', NULL, NULL, NULL, NULL);
    ELSIF _what = 'reassess' THEN
      PERFORM public.scp_schedule_reassessment(_e, _s, NULL);
    ELSIF _what = 'from_application' THEN
      PERFORM public.scp_assign_from_application(_e, 'd1e00000-5555-4000-8000-000000000001', _v, NULL, 'sv');
    ELSIF _what = 'bind' THEN
      PERFORM public.scp_bind_employee_subject(_eu, _u);
    END IF;
    RAISE EXCEPTION 'PE_PROBE_UNDO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PE_PROBE_UNDO' THEN _r := split_part(SQLERRM, ':', 1); END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.actions(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format('assign:%s|invite:%s|training:%s|reassess:%s|from_application:%s|bind:%s',
    pg_temp.act_as(_uid, 'assign'), pg_temp.act_as(_uid, 'invite'), pg_temp.act_as(_uid, 'training'),
    pg_temp.act_as(_uid, 'reassess'), pg_temp.act_as(_uid, 'from_application'), pg_temp.act_as(_uid, 'bind'));
$$;

CREATE OR REPLACE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
  SELECT format('assignments:%s|invitations:%s|training:%s|bound:%s',
    (SELECT count(*) FROM public.assessment_assignments WHERE employer_id = (SELECT e FROM pe)),
    (SELECT count(*) FROM public.scp_assessment_invitations WHERE employer_id = (SELECT e FROM pe)),
    (SELECT count(*) FROM public.scp_training_assignments WHERE employer_id = (SELECT e FROM pe)),
    (SELECT subject_id IS NOT NULL FROM public.employees WHERE id = (SELECT emp_unbound FROM pe)));
$$;
CREATE OR REPLACE FUNCTION pg_temp.force_status(_s text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = (SELECT e FROM pe);
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;

-- What an organisation allowed to act gets back. Scheduling a reassessment
-- passes the authorisation gate and then stops on the fixture's purpose
-- catalogue (SCP_PURPOSE_NOT_AVAILABLE): that is past the gate this suite is
-- about, and different from the refusal a non-active organisation gets.
CREATE OR REPLACE FUNCTION pg_temp.allowed() RETURNS text LANGUAGE sql AS $$
  SELECT 'assign:ok|invite:ok|training:ok|reassess:SCP_PURPOSE_NOT_AVAILABLE|from_application:ok|bind:ok'::text;
$$;

-- The answer a caller who may not act gets: each function's existing refusal.
CREATE OR REPLACE FUNCTION pg_temp.refused() RETURNS text LANGUAGE sql AS $$
  SELECT 'assign:SCP_NOT_AUTHORISED_TO_ASSIGN|invite:SCP_NOT_AUTHORISED_TO_ASSIGN|training:SCP_NOT_AUTHORISED_TO_ASSIGN|reassess:SCP_NOT_AUTHORISED_TO_ASSIGN|from_application:SCP_NOT_AUTHORISED_TO_ASSIGN|bind:SCP_NOT_AUTHORISED_TO_BIND'::text;
$$;

CREATE TEMP TABLE pe_base AS SELECT pg_temp.state() AS state_before;

-- ── PE-F · while E is active ────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PE-F -- while E is active its owner may act'; END $$;
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) = pg_temp.allowed(),
  'PE-F.1 E''s owner may assign, invite, assign training, schedule a reassessment, assign from an application and bind: '
  || pg_temp.actions((SELECT o FROM pe)));
SELECT pg_temp.ok(pg_temp.actions((SELECT m FROM pe)) = pg_temp.refused(),
  'PE-F.2 a plain member may do none of it, as before');
SELECT pg_temp.ok(pg_temp.state() = (SELECT state_before FROM pe_base), 'PE-F.3 the probes left nothing behind');

-- ── PE0 · reproduction on the pre-fix bodies ────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PE0 -- reproduction: a pending employer acts on the pre-fix bodies'; END $$;
SELECT pg_temp.force_status('pending');
SAVEPOINT before_fix;
\ir ../rollback/20270113090000_pending_employer_actions_rollback.sql
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) = pg_temp.allowed(),
  'PE0.1 PRE-FIX: the owner of a PENDING organisation still does all six');
ROLLBACK TO SAVEPOINT before_fix;

-- ── PE1 · pending ───────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PE1 -- a pending organisation may not act'; END $$;
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) =
  pg_temp.refused(),
  'PE1.1 every action is refused with its existing refusal: ' || pg_temp.actions((SELECT o FROM pe)));
SELECT pg_temp.ok(pg_temp.state() = (SELECT state_before FROM pe_base), 'PE1.2 nothing was written');

-- ── PE2 · every other non-active status ─────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PE2 -- suspended, rejected, archived and draft'; END $$;
SELECT pg_temp.force_status('suspended');
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) = pg_temp.refused(), 'PE2.1 suspended: no action');
SELECT pg_temp.force_status('rejected');
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) = pg_temp.refused(), 'PE2.2 rejected: no action');
SELECT pg_temp.force_status('archived');
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) = pg_temp.refused(), 'PE2.3 archived: no action');
SELECT pg_temp.force_status('draft');
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) = pg_temp.refused(), 'PE2.4 draft: no action');
SELECT pg_temp.force_status('pending');

-- ── PE3 · claiming an invitation from a pending organisation ────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PE3 -- an invitation binds only once the organisation is active'; END $$;
INSERT INTO auth.users (id, email, email_confirmed_at) SELECT w, 'pe-invitee@test.invalid', now() FROM pe;
CREATE OR REPLACE FUNCTION pg_temp.claim() RETURNS text LANGUAGE plpgsql AS $$
DECLARE _n int; _bound int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT w FROM pe)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), count(*) FILTER (WHERE outcome = 'bound') INTO _n, _bound FROM public.scp_claim_assessment_invitations();
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN format('rows:%s|bound:%s|status:%s', _n, _bound,
    (SELECT status FROM public.scp_assessment_invitations WHERE id = (SELECT invitation_id FROM peinv)));
END $$;
SELECT pg_temp.ok(pg_temp.claim() = 'rows:0|bound:0|status:pending',
  'PE3.1 the invitee signs up while E is pending: nothing is bound and the invitation stays pending');
SELECT pg_temp.force_status('active');
SELECT pg_temp.ok(pg_temp.claim() = 'rows:1|bound:1|status:bound',
  'PE3.2 once E is approved, the next claim binds it');

-- ── PE4 · approval restores every action ────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PE4 -- approval restores every action'; END $$;
SELECT pg_temp.ok(pg_temp.actions((SELECT o FROM pe)) = pg_temp.allowed(),
  'PE4.1 the owner of the approved organisation may act again');
SELECT pg_temp.ok(pg_temp.actions((SELECT m FROM pe)) = pg_temp.refused(), 'PE4.2 a plain member still may not');

ROLLBACK;
