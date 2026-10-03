-- Employer report ACCESS MATRIX: who can read, release and finalise what, as the
-- database answers it today.
--
-- THIS SUITE DOCUMENTS AND PINS THE CURRENT BEHAVIOUR. It changes nothing and
-- decides nothing. Every assertion below is a fact about the hosted functions and
-- policies as they are on the full migration chain; none of it is a requirement
-- this suite imposes. If one of them is changed on purpose, this is the file
-- that must change with it -- and the assertions tagged MEMBER-WIDE-MODEL are the
-- ones a decision on the security finding below would change.
--
-- ── THE FINDING THIS SUITE IS WRITTEN AROUND ────────────────────────────────
--
-- The employer report is readable by EVERY active member of the commissioning
-- organisation, whatever their role: scp_report_snapshot_readable('employer', ..)
-- is has_active_employer_role(auth.uid(), organisation) with no role list, and
-- scp_employer_report / _v3 / _identity, the scp_report_snapshots_employer policy
-- and the interview-case reads built on scp_iv_can_read_case /
-- has_active_employer_role(.., NULL) all inherit it. A plain member -- and a
-- member who merely holds a reviewer grant -- therefore reads what the owner
-- reads. Whether that is intended is a decision for the owner, who has been sent
-- a separate security finding on member-wide report reads and has not yet decided.
-- Releasing and finalising are different: those are owner/admin only, and are
-- asserted as such.
--
-- If the decision narrows reads to owner/admin (or owner/admin/reviewer), the
-- assertions marked  -- MEMBER-WIDE-MODEL  (RM5.x, and the plain-member and
-- reviewer columns of the matrices in RM4/RM5) change and nothing else does.
--
-- ── THE MATRIX ──────────────────────────────────────────────────────────────
--
--   anon      logged out                              refused: no execute, no grant
--   ow / ad   owner and admin of A (active org)       read; ow/ad alone read the participant document
--   gr        member of A holding a reviewer grant    reads like a plain member   [MEMBER-WIDE-MODEL]
--   pm        plain member of A                       reads                       [MEMBER-WIDE-MODEL]
--   su        admin of A, SUSPENDED                   refused
--   rv        admin of A, REMOVED                     refused
--   rm        member of A, REMOVED                    refused
--   xo        owner of an unrelated company B         refused
--   pa        platform admin, NOT a member of A       refused (through the app-level report functions)
--   p         the candidate the report is about       reads own participant document only
--   p2        another candidate                       reads own participant document only, nothing of p's
--
-- Read paths per principal: scp_employer_report, scp_employer_report_v3,
-- scp_employer_report_identity, scp_participant_report, scp_participant_report_for_issuer,
-- scp_report_snapshot_readable (both audiences), the scp_report_snapshots row
-- policies (read through a grant that exists only inside this transaction),
-- scp_iv_can_read_case, scp_interview_cases, scp_interview_case_events,
-- scp_interview_session_notes and scp_interview_notes. Actions: the release
-- (scp_release_attempt_report) and the finalisation of an interview report
-- (scp_iv_finalise_report, scp_iv_finalise_previewed_report).
--
-- ── HOW AN ACTION IS PROBED ─────────────────────────────────────────────────
--
-- Releasing and finalising check the role FIRST and readiness after. The probes
-- use a sitting still waiting for review and a case that is not ready, so a
-- principal the gate admits is stopped by readiness (SCP_RELEASE_BEFORE_SCORED,
-- SCP_IV_REPORT_BLOCKED) and one it refuses is stopped by the role
-- (SCP_NOT_AUTHORISED_TO_RELEASE, SCP_IV_FINALISE_ROLE). Nothing is written, and
-- one real release by an admin is performed in the fixture to show that the gate
-- admits one.
--
-- ── OFFBOARDING, THE WAY THE ADMIN SCREEN DOES IT ───────────────────────────
--
-- RM10 removes, suspends and restores a member through update_employer_membership
-- as a platform administrator -- the function behind the member controls on
-- /admin/employers/$employerId -- and shows that access follows the status at
-- once, that an owner cannot call it, and that the final-owner refusal still
-- says what the page's error mapping looks for.
--
-- Synthetic principals and data; everything rolls back. auth.uid() resolves from
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
CREATE TEMP TABLE rm AS SELECT
  'e5a00000-1111-4000-8000-000000000001'::uuid AS e,    -- company A
  'e5a00000-1111-4000-8000-000000000002'::uuid AS x,    -- company B
  'e5a00000-0000-4000-8000-000000000001'::uuid AS ow,   -- owner of A
  'e5a00000-0000-4000-8000-000000000002'::uuid AS ad,   -- admin of A
  'e5a00000-0000-4000-8000-000000000003'::uuid AS gr,   -- member of A with a reviewer grant
  'e5a00000-0000-4000-8000-000000000004'::uuid AS pm,   -- plain member of A
  'e5a00000-0000-4000-8000-000000000005'::uuid AS su,   -- admin of A, suspended
  'e5a00000-0000-4000-8000-000000000006'::uuid AS rv,   -- admin of A, removed
  'e5a00000-0000-4000-8000-000000000007'::uuid AS rmm,  -- member of A, removed
  'e5a00000-0000-4000-8000-000000000008'::uuid AS xo,   -- owner of B
  'e5a00000-0000-4000-8000-000000000009'::uuid AS pa,   -- platform admin, no membership
  'e5a00000-0000-4000-8000-00000000000a'::uuid AS p,    -- the candidate
  'e5a00000-0000-4000-8000-00000000000b'::uuid AS p2,   -- another candidate
  'e5a00000-2222-4000-8000-000000000001'::uuid AS emp,
  'e5a00000-2222-4000-8000-000000000002'::uuid AS emp2;
GRANT SELECT ON rm TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT ow,  'rm-owner@test.invalid' FROM rm UNION ALL
SELECT ad,  'rm-admin@test.invalid' FROM rm UNION ALL
SELECT gr,  'rm-reviewer@test.invalid' FROM rm UNION ALL
SELECT pm,  'rm-member@test.invalid' FROM rm UNION ALL
SELECT su,  'rm-suspended@test.invalid' FROM rm UNION ALL
SELECT rv,  'rm-removed-admin@test.invalid' FROM rm UNION ALL
SELECT rmm, 'rm-removed-member@test.invalid' FROM rm UNION ALL
SELECT xo,  'rm-other-owner@test.invalid' FROM rm UNION ALL
SELECT pa,  'rm-platform-admin@test.invalid' FROM rm UNION ALL
SELECT p,   'rm-candidate@test.invalid' FROM rm UNION ALL
SELECT p2,  'rm-candidate-two@test.invalid' FROM rm;
INSERT INTO public.user_roles (user_id, role) SELECT pa, 'admin' FROM rm;
INSERT INTO public.employers (id, name, slug, status)
SELECT e, 'RM Company A', 'rm-company-a', 'active' FROM rm UNION ALL
SELECT x, 'RM Company B', 'rm-company-b', 'active' FROM rm;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, ow,  'owner',  'active' FROM rm UNION ALL
SELECT e, ad,  'admin',  'active' FROM rm UNION ALL
SELECT e, gr,  'member', 'active' FROM rm UNION ALL
SELECT e, pm,  'member', 'active' FROM rm UNION ALL
SELECT e, su,  'admin',  'active' FROM rm UNION ALL
SELECT e, rv,  'admin',  'active' FROM rm UNION ALL
SELECT e, rmm, 'member', 'active' FROM rm UNION ALL
SELECT x, xo,  'owner',  'active' FROM rm;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e, gr, ARRAY['workforce','recruitment']::text[], ow FROM rm;
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by)
SELECT emp,  e, 'RM', 'Deltagare', 'rm-candidate@test.invalid', 'active', ow FROM rm UNION ALL
SELECT emp2, e, 'RM', 'Deltagare Två', 'rm-candidate-two@test.invalid', 'active', ow FROM rm;
INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
SELECT e, 'Employer report access matrix suite', ow FROM rm;

CREATE TEMP TABLE rmv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON rmv TO PUBLIC;
INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT e, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM rmv),
       'Employer report access matrix suite', ow, now() + interval '30 days' FROM rm;

-- Offboarding goes through the real function, as a platform administrator: the
-- one the member controls on the admin organisation page call. Used for the
-- fixture here (su, rv, rmm are made what they are by it) and again in RM10.
CREATE OR REPLACE FUNCTION pg_temp.set_status(_uid uuid, _status text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT pa FROM rm)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT u.status INTO _r FROM public.update_employer_membership(
    (SELECT m.id FROM public.employer_memberships m
      WHERE m.employer_id = (SELECT e FROM rm) AND m.user_id = _uid), NULL, _status) u;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- One sitting: assigned by the owner to a participant, answered and submitted by
-- them; when _releaser is given, reviewed by the reviewer and released by them.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt(_pid uuid, _email text, _emp uuid, _releaser uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT ow FROM rm)::text, true);
  SELECT attempt_id INTO _att FROM public.scp_employer_assign(
    (SELECT e FROM rm), (SELECT version_id FROM rmv), _email,
    NULL, 'sv', 'workforce', _emp, NULL);
  PERFORM set_config('request.jwt.claim.sub', _pid::text, true);
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
  IF _releaser IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', (SELECT gr FROM rm)::text, true);
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
    PERFORM set_config('request.jwt.claim.sub', _releaser::text, true);
    PERFORM public.scp_release_attempt_report(_att);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _att;
END $$;

-- R1  p's sitting, released by the OWNER.        W   p's sitting, waiting for review.
-- R2  p's sitting, released by an ADMIN.         R3  p2's own sitting, released by the owner.
CREATE TEMP TABLE rma AS SELECT
  pg_temp.run_attempt((SELECT p FROM rm), 'rm-candidate@test.invalid', (SELECT emp FROM rm), (SELECT ow FROM rm)) AS r1,
  NULL::uuid AS w, NULL::uuid AS r2, NULL::uuid AS r3;
UPDATE rma SET w  = pg_temp.run_attempt((SELECT p FROM rm), 'rm-candidate@test.invalid', (SELECT emp FROM rm), NULL);
UPDATE rma SET r2 = pg_temp.run_attempt((SELECT p FROM rm), 'rm-candidate@test.invalid', (SELECT emp FROM rm), (SELECT ad FROM rm));
UPDATE rma SET r3 = pg_temp.run_attempt((SELECT p2 FROM rm), 'rm-candidate-two@test.invalid', (SELECT emp2 FROM rm), (SELECT ow FROM rm));
GRANT SELECT ON rma TO PUBLIC;
CREATE TEMP TABLE rms AS SELECT
  (SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT r1 FROM rma)) AS s1;
GRANT SELECT ON rms TO PUBLIC;

-- An interview case on the openly available pack, built through the governed
-- functions as the product builds one, with a session note written under row
-- level security as the owner. Plus an attempt-level interview note.
CREATE TEMP TABLE rmc (kase uuid, sess uuid);
DO $$
DECLARE _packv uuid; _case uuid; _plan uuid; _sess uuid; _q uuid;
  _o uuid := (SELECT ow FROM rm); _e uuid := (SELECT e FROM rm);
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs pk ON pk.id = ver.pack_id
   WHERE pk.slug = 'vaktare-se' AND ver.pilot_availability = 'open' LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  _case := public.scp_iv_create_case(_e, 'RM-fall', _packv, 'Kandidat RM.', NULL, 'EXT-RM-1');
  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_case);
  _plan := public.scp_iv_record_manual_prep_plan(_case, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sess := public.scp_iv_start_session(_case, 'Intervju 1');
  SELECT id INTO _q FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv ORDER BY display_order LIMIT 1;
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_sess, _q, 'observation', 'RM:s konfidentiella anteckning.', _o);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO rmc VALUES (_case, _sess);
  INSERT INTO public.scp_interview_notes (attempt_id, employer_id, area_code, outcome, note, recorded_by)
  VALUES ((SELECT r1 FROM rma), _e, 'situational_judgement', 'additional_context', 'RM-anteckning.', _o);
END $$;
GRANT SELECT ON rmc TO PUBLIC;

-- The snapshot table has no client grant -- its policies are reached through
-- scp_report_snapshot_readable and the report functions. To exercise the POLICIES
-- themselves as each principal, authenticated is given SELECT here, inside this
-- transaction; the final ROLLBACK takes it back. The first assertion in RM11
-- proves it was absent before.
CREATE TEMP TABLE rm_before AS SELECT
  has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') AS auth_select,
  has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT') AS anon_select;
GRANT SELECT ON rm_before TO PUBLIC;
GRANT SELECT ON public.scp_report_snapshots TO authenticated;

-- A read that raises insufficient_privilege (no EXECUTE, no table grant) is -1;
-- anything else is 0 or 1 (a count is "any row").
CREATE OR REPLACE FUNCTION pg_temp.cnt(_sql text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE _n int;
BEGIN
  EXECUTE _sql INTO _n;
  RETURN CASE WHEN _n > 0 THEN 1 ELSE 0 END;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.cnt(text) TO PUBLIC;

-- Everything a principal reads, as `authenticated` (or `anon` for NULL). One key
-- per read, so a failure names the read that leaked.
CREATE OR REPLACE FUNCTION pg_temp.reads_as(_uid uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  _e uuid := (SELECT e FROM rm);
  _r1 uuid := (SELECT r1 FROM rma);
  _r3 uuid := (SELECT r3 FROM rma);
  _s1 uuid := (SELECT s1 FROM rms);
  _case uuid := (SELECT kase FROM rmc);
  _sess uuid := (SELECT sess FROM rmc);
  _q jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  _q := jsonb_build_object(
    'employer_report',               pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report(%L)', _r1)),
    'employer_report_v3',            pg_temp.cnt(format('SELECT (public.scp_employer_report_v3(%L) IS NOT NULL)::int', _r1)),
    'report_identity',               pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report_identity(%L)', _r1)),
    'participant_report_for_issuer', pg_temp.cnt(format('SELECT count(*) FROM public.scp_participant_report_for_issuer(%L)', _r1)),
    'participant_report_own',        pg_temp.cnt(format('SELECT count(*) FROM public.scp_participant_report(%L)', _r1)),
    'participant_report_other',      pg_temp.cnt(format('SELECT count(*) FROM public.scp_participant_report(%L)', _r3)),
    'readable_employer',             pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L)::int', 'employer', _s1, _e)),
    'readable_participant',          pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L)::int', 'participant', _s1, _e)),
    'snapshot_policy_employer',      pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _r1, 'employer')),
    'snapshot_policy_participant',   pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _r1, 'participant')),
    'case_readable',                 pg_temp.cnt(format('SELECT public.scp_iv_can_read_case(%L)::int', _case)),
    'case_row',                      pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_cases WHERE id = %L', _case)),
    'case_events',                   pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L', _case)),
    'session_notes',                 pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_session_notes WHERE session_id = %L', _sess)),
    'attempt_notes',                 pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_notes WHERE attempt_id = %L', _r1)));
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _q;
END $$;

-- One action as a principal, undone: the refusal code it raised, or 'ok'.
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _what text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
  _w uuid := (SELECT w FROM rma); _case uuid := (SELECT kase FROM rmc);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  BEGIN
    IF _what = 'release' THEN
      PERFORM public.scp_release_attempt_report(_w);
    ELSIF _what = 'finalise' THEN
      PERFORM public.scp_iv_finalise_report(_case, NULL);
    ELSIF _what = 'finalise_previewed' THEN
      PERFORM public.scp_iv_finalise_previewed_report(_case, 'rm-basis', NULL);
    END IF;
    RAISE EXCEPTION 'RM_PROBE_UNDO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'RM_PROBE_UNDO' THEN
      IF SQLERRM LIKE 'permission denied%' THEN _r := 'PERMISSION_DENIED';
      ELSE _r := split_part(split_part(SQLERRM, ':', 1), E'\n', 1); END IF;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- ── The expected answers, as data ────────────────────────────────────────
-- 1 = reads / allowed, 0 = reads nothing, -1 = refused outright (no execute / no grant).
CREATE TEMP TABLE rmx AS SELECT
  -- ow, ad: everything of A's, and the participant document through the issuer-admin read
  jsonb_build_object('employer_report',1,'employer_report_v3',1,'report_identity',1,
    'participant_report_for_issuer',1,'participant_report_own',0,'participant_report_other',0,
    'readable_employer',1,'readable_participant',0,'snapshot_policy_employer',1,'snapshot_policy_participant',0,
    'case_readable',1,'case_row',1,'case_events',1,'session_notes',1,'attempt_notes',1) AS owner_admin,
  -- gr, pm: the same, except the issuer-admin participant document.   MEMBER-WIDE-MODEL
  jsonb_build_object('employer_report',1,'employer_report_v3',1,'report_identity',1,
    'participant_report_for_issuer',0,'participant_report_own',0,'participant_report_other',0,
    'readable_employer',1,'readable_participant',0,'snapshot_policy_employer',1,'snapshot_policy_participant',0,
    'case_readable',1,'case_row',1,'case_events',1,'session_notes',1,'attempt_notes',1) AS member_wide,
  -- su, rv, rmm, xo, pa, p2 (about p's report), anyone who is not on the case: nothing
  jsonb_build_object('employer_report',0,'employer_report_v3',0,'report_identity',0,
    'participant_report_for_issuer',0,'participant_report_own',0,'participant_report_other',0,
    'readable_employer',0,'readable_participant',0,'snapshot_policy_employer',0,'snapshot_policy_participant',0,
    'case_readable',0,'case_row',0,'case_events',0,'session_notes',0,'attempt_notes',0) AS nothing,
  -- logged out: refused before any row is looked at
  jsonb_build_object('employer_report',-1,'employer_report_v3',-1,'report_identity',-1,
    'participant_report_for_issuer',-1,'participant_report_own',-1,'participant_report_other',-1,
    'readable_employer',-1,'readable_participant',-1,'snapshot_policy_employer',-1,'snapshot_policy_participant',-1,
    'case_readable',-1,'case_row',-1,'case_events',-1,'session_notes',-1,'attempt_notes',-1) AS anon_refused;
GRANT SELECT ON rmx TO PUBLIC;

-- The two principals who are not employer staff but ARE in the report.
-- p: the subject of R1 -> own participant document only. p2: subject of R3.
CREATE TEMP TABLE rmx_p AS SELECT
  (SELECT nothing FROM rmx) || jsonb_build_object('participant_report_own',1,'readable_participant',1,'snapshot_policy_participant',1) AS subject_of_r1_reads_own,
  (SELECT nothing FROM rmx) || jsonb_build_object('participant_report_other',1) AS subject_of_r3_reads_own;
GRANT SELECT ON rmx_p TO PUBLIC;

-- ── Offboard through the real function (as the admin screen does) ─────────
SELECT pg_temp.set_status((SELECT su  FROM rm), 'suspended');
SELECT pg_temp.set_status((SELECT rv  FROM rm), 'removed');
SELECT pg_temp.set_status((SELECT rmm FROM rm), 'removed');

DO $$ BEGIN RAISE NOTICE 'GROUP RM-F -- the fixture: three released reports, one waiting, one case, offboarded members'; END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE id IN (SELECT r1 FROM rma UNION SELECT r2 FROM rma UNION SELECT r3 FROM rma) AND released_at IS NOT NULL) = 3
  AND (SELECT released_at IS NULL FROM public.scp_attempts WHERE id = (SELECT w FROM rma)),
  'RM-F.1 R1 (owner), R2 (admin) and R3 are released; W is still waiting for review');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT r2 FROM rma) AND audience = 'employer') = 1,
  'RM-F.2 an ADMIN released R2: the release gate admits an admin (the employer document exists)');
SELECT pg_temp.ok(
  (SELECT string_agg(user_id::text || ':' || status, ',' ORDER BY user_id) FROM public.employer_memberships
    WHERE employer_id = (SELECT e FROM rm) AND user_id IN (SELECT su FROM rm UNION SELECT rv FROM rm UNION SELECT rmm FROM rm))
  = (SELECT (SELECT su FROM rm)::text || ':suspended,' || (SELECT rv FROM rm)::text || ':removed,' || (SELECT rmm FROM rm)::text || ':removed'),
  'RM-F.3 su is suspended, rv and rmm are removed -- by update_employer_membership, as a platform administrator');
SELECT pg_temp.ok((SELECT NOT auth_select AND NOT anon_select FROM rm_before),
  'RM-F.4 before this suite granted it, neither authenticated nor anon could SELECT scp_report_snapshots');

-- ── RM1 · logged out ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM1 -- logged out: refused'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as(NULL) = (SELECT anon_refused FROM rmx),
  'RM1.1 anon: every one of the 15 reads is refused outright: ' || pg_temp.reads_as(NULL)::text);
SELECT pg_temp.ok(pg_temp.act_as(NULL, 'release') = 'PERMISSION_DENIED'
  AND pg_temp.act_as(NULL, 'finalise') = 'PERMISSION_DENIED'
  AND pg_temp.act_as(NULL, 'finalise_previewed') = 'PERMISSION_DENIED',
  'RM1.2 anon cannot release or finalise: no EXECUTE');
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM unnest(ARRAY[
    'public.scp_employer_report(uuid)', 'public.scp_employer_report_v3(uuid)', 'public.scp_employer_report_identity(uuid)',
    'public.scp_report_snapshot_readable(text,uuid,uuid)', 'public.scp_iv_can_read_case(uuid)',
    'public.scp_release_attempt_report(uuid)', 'public.scp_iv_finalise_report(uuid,uuid)',
    'public.scp_iv_finalise_previewed_report(uuid,text,uuid)', 'public.scp_participant_report(uuid)',
    'public.scp_participant_report_for_issuer(uuid)', 'public.has_active_employer_role(uuid,uuid,text[])']) f
   WHERE has_function_privilege('anon', f::regprocedure, 'EXECUTE')),
  'RM1.3 none of the eleven report/gate functions is executable by anon');

-- ── RM2 · the candidate the report is about ──────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM2 -- the candidate: own participant document only'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT p FROM rm)) = (SELECT subject_of_r1_reads_own FROM rmx_p),
  'RM2.1 the subject reads their OWN participant document (function, helper and row policy) and nothing of the employer''s: ' || pg_temp.reads_as((SELECT p FROM rm))::text);
SELECT pg_temp.ok(pg_temp.act_as((SELECT p FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT p FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE',
  'RM2.2 the subject cannot release their own report or finalise a case');

-- ── RM3 · another candidate ──────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM3 -- another candidate: refused'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT p2 FROM rm)) = (SELECT subject_of_r3_reads_own FROM rmx_p),
  'RM3.1 the other candidate reads their own R3 document and nothing of p''s (participant_report_own is 0 for R1): ' || pg_temp.reads_as((SELECT p2 FROM rm))::text);
SELECT pg_temp.ok(pg_temp.act_as((SELECT p2 FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT p2 FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE',
  'RM3.2 neither can the other candidate');

-- ── RM4 · owner and admin of company A ───────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM4 -- owner and admin of A: read, release, finalise'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT ow FROM rm)) = (SELECT owner_admin FROM rmx),
  'RM4.1 the owner reads all 15 (the issuer-admin participant document included): ' || pg_temp.reads_as((SELECT ow FROM rm))::text);
SELECT pg_temp.ok(pg_temp.reads_as((SELECT ad FROM rm)) = (SELECT owner_admin FROM rmx),
  'RM4.2 the admin reads exactly what the owner reads');
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT ow FROM rm), 'release') = 'SCP_RELEASE_BEFORE_SCORED'
  AND pg_temp.act_as((SELECT ad FROM rm), 'release') = 'SCP_RELEASE_BEFORE_SCORED',
  'RM4.3 owner and admin pass the release gate (stopped only by the sitting still being unreviewed)');
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT ow FROM rm), 'finalise') = 'SCP_IV_REPORT_BLOCKED'
  AND pg_temp.act_as((SELECT ad FROM rm), 'finalise') = 'SCP_IV_REPORT_BLOCKED'
  AND pg_temp.act_as((SELECT ow FROM rm), 'finalise_previewed') = 'SCP_IV_REPORT_BLOCKED'
  AND pg_temp.act_as((SELECT ad FROM rm), 'finalise_previewed') = 'SCP_IV_REPORT_BLOCKED',
  'RM4.4 owner and admin pass the finalise gate, both variants (stopped only by the case not being ready)');

-- ── RM5 · the CURRENT member-wide model ──────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM5 -- MEMBER-WIDE-MODEL: the current behaviour under owner review'; END $$;
-- MEMBER-WIDE-MODEL ----------------------------------------------------------
-- The two assertions below are the CURRENT member-wide model and nothing else:
-- a plain member, and a member who holds a reviewer grant, read the employer
-- report, its identity, the snapshot row, the interview case, its events, its
-- session notes and the attempt notes -- the same as the owner, short only of the
-- issuer-admin participant document. A decision on the security finding on
-- member-wide report reads changes these, and exactly these (and the
-- member_wide expectation row above).
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(pg_temp.reads_as((SELECT pm FROM rm)) = (SELECT member_wide FROM rmx),
  'RM5.1 MEMBER-WIDE-MODEL a PLAIN MEMBER reads the employer report, the case and its notes: ' || pg_temp.reads_as((SELECT pm FROM rm))::text);
SELECT pg_temp.ok(pg_temp.reads_as((SELECT gr FROM rm)) = (SELECT member_wide FROM rmx),
  'RM5.2 MEMBER-WIDE-MODEL a REVIEWER-GRANTED MEMBER reads exactly what a plain member reads (the grant is about reviewing, not reading)');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT pm FROM rm)) = pg_temp.reads_as((SELECT ow FROM rm)) - 'participant_report_for_issuer' || '{"participant_report_for_issuer":0}'::jsonb,
  'RM5.3 MEMBER-WIDE-MODEL the plain member differs from the owner in ONE read only: the issuer-admin participant document');
-- Releasing and finalising are NOT member-wide: they are owner/admin only, and
-- that stays true under every outcome of the decision above.
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT pm FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT gr FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE',
  'RM5.4 a plain member and a reviewer-granted member cannot RELEASE a report (owner/admin only)');
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT pm FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT gr FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT pm FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT gr FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE',
  'RM5.5 a plain member and a reviewer-granted member cannot FINALISE an interview report, either variant (owner/admin only)');

-- ── RM6 · suspended and removed members ──────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM6 -- a suspended or removed member of A: refused'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT su FROM rm)) = (SELECT nothing FROM rmx),
  'RM6.1 a SUSPENDED admin of A reads nothing: ' || pg_temp.reads_as((SELECT su FROM rm))::text);
SELECT pg_temp.ok(pg_temp.reads_as((SELECT rv FROM rm)) = (SELECT nothing FROM rmx),
  'RM6.2 a REMOVED admin of A reads nothing: ' || pg_temp.reads_as((SELECT rv FROM rm))::text);
SELECT pg_temp.ok(pg_temp.reads_as((SELECT rmm FROM rm)) = (SELECT nothing FROM rmx),
  'RM6.3 a REMOVED member of A reads nothing');
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT su FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT rv FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT rmm FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE',
  'RM6.4 none of them can release (a suspended or removed ADMIN holds the role and not the standing)');
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT su FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT rv FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT rmm FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT su FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT rv FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE',
  'RM6.5 nor finalise, either variant');
SELECT pg_temp.ok(
  NOT public.has_active_employer_role((SELECT su FROM rm), (SELECT e FROM rm))
  AND NOT public.has_active_employer_role((SELECT rv FROM rm), (SELECT e FROM rm))
  AND NOT public.has_active_employer_role((SELECT rmm FROM rm), (SELECT e FROM rm))
  AND NOT public.has_employer_role((SELECT su FROM rm), (SELECT e FROM rm)),
  'RM6.6 the primitives agree: has_active_employer_role and has_employer_role are false for all three');

-- ── RM7 · a member of another company ────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM7 -- the owner of an unrelated company B: refused'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT xo FROM rm)) = (SELECT nothing FROM rmx),
  'RM7.1 the owner of company B reads nothing of A''s: ' || pg_temp.reads_as((SELECT xo FROM rm))::text);
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT xo FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT xo FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT xo FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE',
  'RM7.2 and releases and finalises nothing of A''s, although an owner of their own company');

-- ── RM8 · a platform administrator who is not a member ───────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM8 -- a platform admin who is not a member: refused through the app-level report functions'; END $$;
SELECT pg_temp.ok(public.is_platform_admin((SELECT pa FROM rm)),
  'RM8.0 the principal really is a platform administrator');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT pa FROM rm)) = (SELECT nothing FROM rmx),
  'RM8.1 through scp_employer_report*, the snapshot policies and the interview reads a platform admin who is not a member reads nothing: ' || pg_temp.reads_as((SELECT pa FROM rm))::text);
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT pa FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT pa FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT pa FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE',
  'RM8.2 and releases and finalises nothing: platform administration is not an employer role');

-- ── RM9 · the helper and the policy, stated directly ─────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM9 -- scp_report_snapshot_readable and the snapshot policies, by definition'; END $$;
SELECT pg_temp.ok(
  (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_report_snapshot_readable(text,uuid,uuid)'::regprocedure)
    ~ 'has_active_employer_role\(auth\.uid\(\), _issuer_organization_id\)'
  AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_report_snapshot_readable(text,uuid,uuid)'::regprocedure)
    !~ 'ARRAY\[',
  'RM9.1 MEMBER-WIDE-MODEL the employer branch of scp_report_snapshot_readable names NO role list: any active member of an active organisation');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') = 2
  AND (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots' AND policyname = 'scp_report_snapshots_employer')
    ~ 'scp_report_snapshot_readable\(audience, subject_id, issuer_organization_id\)'
  AND (SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots' AND policyname = 'scp_report_snapshots_employer') = '{authenticated}',
  'RM9.2 scp_report_snapshots has exactly two policies, both authenticated, the employer one routed through the helper');
SELECT pg_temp.ok(
  public.scp_report_snapshot_readable('nonsense', (SELECT s1 FROM rms), (SELECT e FROM rm)) IS NOT TRUE,
  'RM9.3 an unknown audience is never readable');

-- ── RM10 · offboarding, as the admin screen does it ──────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM10 -- access follows the membership status at once, through update_employer_membership'; END $$;
-- A plain member loses every read the moment a platform admin suspends them, and gets exactly them back on reactivation.
SELECT pg_temp.ok(pg_temp.set_status((SELECT pm FROM rm), 'suspended') = 'suspended'
  AND pg_temp.reads_as((SELECT pm FROM rm)) = (SELECT nothing FROM rmx),
  'RM10.1 a plain member SUSPENDED by a platform admin reads nothing at once');
SELECT pg_temp.ok(pg_temp.set_status((SELECT pm FROM rm), 'active') = 'active'
  AND pg_temp.reads_as((SELECT pm FROM rm)) = (SELECT member_wide FROM rmx),
  'RM10.2 and REACTIVATED reads exactly what they read before');
SELECT pg_temp.ok(pg_temp.set_status((SELECT pm FROM rm), 'removed') = 'removed'
  AND pg_temp.reads_as((SELECT pm FROM rm)) = (SELECT nothing FROM rmx),
  'RM10.3 a plain member REMOVED by a platform admin reads nothing at once');
-- A separate statement: a subquery in the statement that makes the change would
-- read the snapshot taken before it.
SELECT pg_temp.ok(
  (SELECT removed_at IS NOT NULL AND status = 'removed' FROM public.employer_memberships
    WHERE employer_id = (SELECT e FROM rm) AND user_id = (SELECT pm FROM rm)),
  'RM10.3b and the row is kept, with removed_at set (removed is a status, never a delete)');
SELECT pg_temp.ok(pg_temp.set_status((SELECT pm FROM rm), 'active') = 'active'
  AND pg_temp.reads_as((SELECT pm FROM rm)) = (SELECT member_wide FROM rmx),
  'RM10.4 and reactivating a removed member restores exactly their reads');
SELECT pg_temp.ok(
  (SELECT removed_at IS NULL AND status = 'active' FROM public.employer_memberships
    WHERE employer_id = (SELECT e FROM rm) AND user_id = (SELECT pm FROM rm)),
  'RM10.4b and clears removed_at');
-- An owner is not a platform administrator: no self-service removal exists.
CREATE OR REPLACE FUNCTION pg_temp.rpc_as(_uid uuid, _target uuid, _role text, _status text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.update_employer_membership(
      (SELECT m.id FROM public.employer_memberships m WHERE m.employer_id = (SELECT e FROM rm) AND m.user_id = _target),
      _role, _status);
  EXCEPTION WHEN OTHERS THEN _r := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
SELECT pg_temp.ok(
  pg_temp.rpc_as((SELECT ow FROM rm), (SELECT pm FROM rm), NULL, 'removed') ~ 'platform admin role required'
  AND pg_temp.rpc_as((SELECT ad FROM rm), (SELECT pm FROM rm), NULL, 'removed') ~ 'platform admin role required',
  'RM10.5 an OWNER and an ADMIN cannot call update_employer_membership: only a platform admin can end a membership today');
SELECT pg_temp.ok(
  (SELECT status FROM public.employer_memberships WHERE employer_id = (SELECT e FROM rm) AND user_id = (SELECT pm FROM rm)) = 'active',
  'RM10.5b and nothing changed');
-- The final-owner rule, with the wording the admin screen's error mapping recognises.
SELECT pg_temp.ok(
  pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), NULL, 'removed') ~ 'it is the only active owner'
  AND pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), 'admin', NULL) ~ 'it is the only active owner'
  AND pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), NULL, 'suspended') ~ 'it is the only active owner',
  'RM10.6 the ONLY active owner cannot be removed, suspended or demoted -- and the refusal says "it is the only active owner" (what membershipRpcFailure recognises)');
SELECT pg_temp.ok(
  (SELECT status || '/' || role FROM public.employer_memberships WHERE employer_id = (SELECT e FROM rm) AND user_id = (SELECT ow FROM rm)) = 'active/owner',
  'RM10.6b and the owner is unchanged');
SELECT pg_temp.ok(
  pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ad FROM rm), 'owner', NULL) = 'ok'
  AND pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), NULL, 'removed') = 'ok'
  AND pg_temp.reads_as((SELECT ow FROM rm)) = (SELECT nothing FROM rmx)
  AND pg_temp.reads_as((SELECT ad FROM rm)) = (SELECT owner_admin FROM rmx),
  'RM10.7 with a second ACTIVE owner appointed, the first can be removed; they then read nothing and the new owner reads everything');

ROLLBACK;
