-- Employer report ACCESS MATRIX: who can read, release and finalise what, as the
-- database answers it. Migrations 20270202090000, 20270203090000 and 20270204090000.
--
-- This suite used to PIN the member-wide model (every active member of an
-- organisation read every report, case and note; the assertions were tagged
-- MEMBER-WIDE-MODEL). The owner decided otherwise, and this is the file that
-- changed with it. Every tag is gone; what is asserted now is the model of
-- docs/release/2026-10-03-employer-report-access-design.md:
--
--   an ACTIVE member of an ACTIVE organisation reads the employer-audience material
--   about a person only if they are NOT its subject and are
--     R1  owner or admin, or
--     R2  holders of an active reviewer grant for the USE CASE of the item, or
--     R3  for a recruitment item, the named responsible recruiter of its VACANCY, or
--     R4  (an interview case only) its creator or a member of its panel;
--   an ordinary member with none of these reads NOTHING: no row, no count.
--   The security-vetting restriction is additive. Release and finalise stay owner/admin.
--
-- ── THE MATRIX ──────────────────────────────────────────────────────────────
--   anon       logged out                                  refused: no execute, no grant
--   ow / ad    owner and admin of A                        everything; the participant document
--   gr         member, grant workforce + recruitment       both use cases, every vacancy
--   gw         member, grant workforce                     workforce items only
--   gc         member, grant recruitment                   recruitment items only (both vacancies)
--   r1 / r2    plain members, responsible for V1 / V2      that vacancy's recruitment items only
--   sm         ADMIN, and the subject of the V1 assessment everything except what is about them
--   sg         member with both grants, subject of the workforce assessment  likewise
--   pm         plain member                                NOTHING
--   cr / pn    plain members: creator / panel of case A    case A only; no report, no list, no count
--   su, rv, rmm  suspended admin, removed admin, removed member   refused
--   xo         owner of an unrelated company B             refused
--   pa         platform admin, NOT a member of A           refused (through the app-level functions)
--   p, p2      the candidates                              their OWN participant document only
--
-- The expectations are explicit lists per principal (who reads which attempt, which
-- invitation, which case), not a recomputation of the rule, so a regression in the rule
-- cannot move the expectation with it.
--
-- RM0 reproduces the member-wide model on the PRE-FIX state inside this suite: the real
-- rollbacks of 20270204090000 and 20270203090000 inside a savepoint.
--
-- Synthetic principals and data; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

-- Existing history tests use the pre-launch contract. The new final-state
-- runner explicitly enables the owner decision while reusing this full matrix.
\if :{?participant_launch_gate}
\else
\set participant_launch_gate false
\endif
BEGIN;
CREATE TEMP TABLE rm_launch AS SELECT :'participant_launch_gate'::boolean AS enabled;
GRANT SELECT ON rm_launch TO PUBLIC;

\ir employer_report_access_fixture.sql

-- ── What a principal reads ───────────────────────────────────────────────
-- A read that raises insufficient_privilege (no EXECUTE, no table grant) is -1,
-- a function that does not exist is -2, anything else is the number of rows.
CREATE OR REPLACE FUNCTION pg_temp.cnt(_sql text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE _n int;
BEGIN
  EXECUTE _sql INTO _n;
  RETURN coalesce(_n, 0);
EXCEPTION
  WHEN insufficient_privilege THEN RETURN -1;
  WHEN undefined_function THEN RETURN -2;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.cnt(text) TO PUBLIC;

-- Everything a principal reads, as `authenticated` (or `anon` for NULL). One key
-- per read, so a failure names the read that leaked.
CREATE OR REPLACE FUNCTION pg_temp.reads_as(_uid uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  _e uuid := (SELECT e FROM rm);
  _a record; _s record; _c record;
  _q jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO _a FROM rma; SELECT * INTO _s FROM rms; SELECT * INTO _c FROM rmc;
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  _q := jsonb_build_object(
    -- the document, through the audience contract (one key per attempt)
    'report_r1',  pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report(%L)', _a.r1)),
    'report_ws',  pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report(%L)', _a.ws)),
    'report_v1',  pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report(%L)', _a.v1)),
    'report_vs',  pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report(%L)', _a.vs)),
    'report_v2',  pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report(%L)', _a.v2)),
    'v3_r1',      pg_temp.cnt(format('SELECT (public.scp_employer_report_v3(%L) IS NOT NULL)::int', _a.r1)),
    'v3_v1',      pg_temp.cnt(format('SELECT (public.scp_employer_report_v3(%L) IS NOT NULL)::int', _a.v1)),
    'identity_r1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report_identity(%L)', _a.r1)),
    'identity_v1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report_identity(%L)', _a.v1)),
    'participant_for_issuer_r1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_participant_report_for_issuer(%L)', _a.r1)),
    'participant_own_r1',   pg_temp.cnt(format('SELECT count(*) FROM public.scp_participant_report(%L)', _a.r1)),
    'participant_other_r3', pg_temp.cnt(format('SELECT count(*) FROM public.scp_participant_report(%L)', _a.r3)),
    -- the audience rule and the snapshot row policies
    'readable_r1', pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L, %L)::int', 'employer', _s.s1, _e, _a.r1)),
    'readable_ws', pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L, %L)::int', 'employer', _s.sws, _e, _a.ws)),
    'readable_v1', pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L, %L)::int', 'employer', _s.sv1, _e, _a.v1)),
    'readable_vs', pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L, %L)::int', 'employer', _s.svs, _e, _a.vs)),
    'readable_v2', pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L, %L)::int', 'employer', _s.sv2, _e, _a.v2)),
    'readable_unscoped_r1', pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L)::int', 'employer', _s.s1, _e)),
    'readable_participant_r1', pg_temp.cnt(format('SELECT public.scp_report_snapshot_readable(%L, %L, %L)::int', 'participant', _s.s1, _e)),
    'policy_r1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _a.r1, 'employer')),
    'policy_ws', pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _a.ws, 'employer')),
    'policy_v1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _a.v1, 'employer')),
    'policy_vs', pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _a.vs, 'employer')),
    'policy_v2', pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _a.v2, 'employer')),
    'policy_participant_r1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = %L AND audience = %L', _a.r1, 'participant')));
  _q := _q || jsonb_build_object(
    -- decisions and attempt-level notes: functions and tables
    'decisions_r1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_decisions(%L)', _a.r1)),
    'decisions_v1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_decisions(%L)', _a.v1)),
    'decisions_v2', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_decisions(%L)', _a.v2)),
    'rls_decisions', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_report_decisions WHERE employer_id = %L', _e)),
    'notes_r1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_notes(%L)', _a.r1)),
    'notes_v1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_notes(%L)', _a.v1)),
    'notes_v2', pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_notes(%L)', _a.v2)),
    'rls_notes', pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_notes WHERE employer_id = %L', _e)),
    -- the lists
    'participants', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_participants(%L)', _e)),
    'pipeline', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_assessment_pipeline(%L)', _e)),
    'person_assessments_v1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_person_overview(%L, %L) WHERE row_kind = %L', _e, _s.sv1, 'assessment')),
    'person_notes_v1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_person_overview(%L, %L) WHERE row_kind = %L', _e, _s.sv1, 'interview_note')),
    'person_applications_v1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_person_overview(%L, %L) WHERE row_kind = %L', _e, _s.sv1, 'application')),
    'application_assessments_ap1', pg_temp.cnt(format('SELECT count(*) FROM public.scp_application_assessments(%L)', (SELECT ap1 FROM rm))),
    'invitations', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_invitations(%L)', _e)),
    'rls_invitations', pg_temp.cnt(format('SELECT count(*) FROM public.scp_assessment_invitations WHERE employer_id = %L', _e)),
    'rls_assignments', pg_temp.cnt(format('SELECT count(*) FROM public.assessment_assignments WHERE employer_id = %L', _e)),
    -- the counts
    'review_blocked', pg_temp.cnt(format('SELECT coalesce(max(attempts_blocked), 0) FROM public.scp_employer_review_pressure(%L)', _e)),
    'review_awaiting_any', pg_temp.cnt(format('SELECT (coalesce(max(awaiting_review), 0) > 0)::int FROM public.scp_employer_review_pressure(%L)', _e)),
    'review_board', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_review_board(%L)', _e)),
    -- progress and recommendations of a person
    'progress_r1', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_subject_progress(%L)', _s.s1)),
    'progress_v1', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_subject_progress(%L)', _s.sv1)),
    'progress_vs', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_subject_progress(%L)', _s.svs)),
    'progress_ws', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_subject_progress(%L)', _s.sws)),
    'recommendations_r1', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_development_recommendations(%L)', _s.s1)),
    -- workforce training
    'training', pg_temp.cnt(format('SELECT count(*) FROM public.scp_employer_training_status(%L)', _e)),
    'rls_training', pg_temp.cnt(format('SELECT count(*) FROM public.scp_training_assignments WHERE employer_id = %L', _e)),
    'rls_training_progress', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_training_module_progress tp JOIN public.scp_training_assignments ta ON ta.id = tp.assignment_id WHERE ta.employer_id = %L', _e)),
    -- interview cases
    'case_readable_c0', pg_temp.cnt(format('SELECT public.scp_iv_can_read_case(%L)::int', _c.kase)),
    'case_readable_cA', pg_temp.cnt(format('SELECT public.scp_iv_can_read_case(%L)::int', _c.case_a)),
    'case_readable_cB', pg_temp.cnt(format('SELECT public.scp_iv_can_read_case(%L)::int', _c.case_b)),
    'case_writable_c0', pg_temp.cnt(format('SELECT public.scp_iv_can_write_case(%L)::int', _c.kase)),
    'case_writable_cA', pg_temp.cnt(format('SELECT public.scp_iv_can_write_case(%L)::int', _c.case_a)),
    'case_writable_cB', pg_temp.cnt(format('SELECT public.scp_iv_can_write_case(%L)::int', _c.case_b)),
    'case_rows', pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_cases WHERE employer_id = %L', _e)),
    'case_events_cA', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_interview_case_events WHERE case_id = %L', _c.case_a)),
    'case_events_c0', pg_temp.cnt(format('SELECT (count(*) > 0)::int FROM public.scp_interview_case_events WHERE case_id = %L', _c.kase)),
    'session_notes_cA', pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_session_notes WHERE session_id = %L', _c.sess_a)),
    'session_notes_c0', pg_temp.cnt(format('SELECT count(*) FROM public.scp_interview_session_notes WHERE session_id = %L', _c.sess)));
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

-- ── The expected answers, as explicit lists per principal ────────────────
-- atts: the attempts whose material they may read.  invs: the invitations (wf = the
-- workforce one, v1, v2).  train: workforce training.  cases: c0, cA, cB.
-- iss: owner or admin (the issuer-admin reads).  member: an active member of A.
-- own: the attempts the person is THE SUBJECT/RECIPIENT of (their participant branch).
CREATE TEMP TABLE rmscope (who text PRIMARY KEY, uid uuid, atts text[], invs text[], train boolean,
                           cases text[], iss boolean, member boolean, own text[] DEFAULT ARRAY[]::text[]);
INSERT INTO rmscope
SELECT 'ow', ow, ARRAY['r1','w','r2','r3','ws','v1','vs','v2','v2w'], ARRAY['wf','v1','v2'], true, ARRAY['c0','cA','cB'], true, true FROM rm UNION ALL
SELECT 'ad', ad, ARRAY['r1','w','r2','r3','ws','v1','vs','v2','v2w'], ARRAY['wf','v1','v2'], true, ARRAY['c0','cA','cB'], true, true FROM rm UNION ALL
SELECT 'gr', gr, ARRAY['r1','w','r2','r3','ws','v1','vs','v2','v2w'], ARRAY['wf','v1','v2'], true, ARRAY['c0','cA','cB'], false, true FROM rm UNION ALL
SELECT 'gw', gw, ARRAY['r1','w','r2','r3','ws'], ARRAY['wf'], true, ARRAY[]::text[], false, true FROM rm UNION ALL
SELECT 'gc', gc, ARRAY['v1','vs','v2','v2w'], ARRAY['v1','v2'], false, ARRAY['c0','cA','cB'], false, true FROM rm UNION ALL
SELECT 'r1', r1, ARRAY['v1','vs'], ARRAY['v1'], false, ARRAY['cA','cB'], false, true FROM rm UNION ALL
SELECT 'r2', r2, ARRAY['v2','v2w'], ARRAY['v2'], false, ARRAY[]::text[], false, true FROM rm UNION ALL
SELECT 'sm', sm, ARRAY['r1','w','r2','r3','ws','v1','v2','v2w'], ARRAY['wf','v1','v2'], true, ARRAY['c0','cA'], true, true FROM rm UNION ALL
SELECT 'sg', sg, ARRAY['r1','w','r2','r3','v1','vs','v2','v2w'], ARRAY['wf','v1','v2'], true, ARRAY['c0','cA','cB'], false, true FROM rm UNION ALL
SELECT 'pm', pm, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, true FROM rm UNION ALL
SELECT 'cr', cr, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY['cA'], false, true FROM rm UNION ALL
SELECT 'pn', pn, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY['cA'], false, true FROM rm UNION ALL
SELECT 'su', su, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm UNION ALL
SELECT 'rv', rv, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm UNION ALL
SELECT 'rmm', rmm, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm UNION ALL
SELECT 'xo', xo, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm UNION ALL
SELECT 'pa', pa, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm UNION ALL
SELECT 'p', p, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm UNION ALL
SELECT 'p2', p2, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm UNION ALL
SELECT 'c1', c1, ARRAY[]::text[], ARRAY[]::text[], false, ARRAY[]::text[], false, false FROM rm;
UPDATE rmscope SET own = ARRAY['r1','w','r2'] WHERE who = 'p';
UPDATE rmscope SET own = ARRAY['r3'] WHERE who = 'p2';
UPDATE rmscope SET own = ARRAY['ws'] WHERE who = 'sg';
UPDATE rmscope SET own = ARRAY['vs'] WHERE who = 'sm';
UPDATE rmscope SET own = ARRAY['v1'] WHERE who = 'c1';
GRANT SELECT ON rmscope TO PUBLIC;

-- The reads the model predicts for one principal. The owner's own value is used only for
-- the three "is there anything to read at all" reads whose size depends on the content.
CREATE OR REPLACE FUNCTION pg_temp.expected(_who text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _x rmscope%ROWTYPE; _q jsonb;
BEGIN
  SELECT * INTO _x FROM rmscope WHERE who = _who;
  _q := jsonb_build_object(
    'report_r1', (_x.atts @> ARRAY['r1'])::int, 'report_ws', (_x.atts @> ARRAY['ws'])::int,
    'report_v1', (_x.atts @> ARRAY['v1'])::int, 'report_vs', (_x.atts @> ARRAY['vs'])::int,
    'report_v2', (_x.atts @> ARRAY['v2'])::int,
    'v3_r1', (_x.atts @> ARRAY['r1'])::int, 'v3_v1', (_x.atts @> ARRAY['v1'])::int,
    'identity_r1', (_x.atts @> ARRAY['r1'])::int, 'identity_v1', (_x.atts @> ARRAY['v1'])::int,
    'participant_for_issuer_r1', _x.iss::int,
    'participant_own_r1', (_who = 'p' AND NOT (SELECT enabled FROM rm_launch))::int,
    'participant_other_r3', (_who = 'p2' AND NOT (SELECT enabled FROM rm_launch))::int,
    'readable_r1', (_x.atts @> ARRAY['r1'])::int, 'readable_ws', (_x.atts @> ARRAY['ws'])::int,
    'readable_v1', (_x.atts @> ARRAY['v1'])::int, 'readable_vs', (_x.atts @> ARRAY['vs'])::int,
    'readable_v2', (_x.atts @> ARRAY['v2'])::int,
    -- no attempt named: the use case is unknown, so owner/admin only (and never the subject)
    'readable_unscoped_r1', _x.iss::int,
    'readable_participant_r1', (_who = 'p')::int,
    'policy_r1', (_x.atts @> ARRAY['r1'])::int, 'policy_ws', (_x.atts @> ARRAY['ws'])::int,
    'policy_v1', (_x.atts @> ARRAY['v1'])::int, 'policy_vs', (_x.atts @> ARRAY['vs'])::int,
    'policy_v2', (_x.atts @> ARRAY['v2'])::int,
    'policy_participant_r1', (_who = 'p' AND NOT (SELECT enabled FROM rm_launch))::int);
  _q := _q || jsonb_build_object(
    'decisions_r1', (_x.atts @> ARRAY['r1'])::int, 'decisions_v1', (_x.atts @> ARRAY['v1'])::int,
    'decisions_v2', (_x.atts @> ARRAY['v2'])::int,
    'rls_decisions', (SELECT count(*) FROM unnest(_x.atts) a WHERE a IN ('r1','v1','v2')),
    'notes_r1', (_x.atts @> ARRAY['r1'])::int, 'notes_v1', (_x.atts @> ARRAY['v1'])::int,
    'notes_v2', (_x.atts @> ARRAY['v2'])::int,
    'rls_notes', (SELECT count(*) FROM unnest(_x.atts) a WHERE a IN ('r1','v1','v2')),
    'participants', cardinality(_x.atts), 'pipeline', cardinality(_x.atts),
    'person_assessments_v1', (_x.atts @> ARRAY['v1'])::int,
    'person_notes_v1', (_x.atts @> ARRAY['v1'])::int,
    -- the application rows belong to the recruitment pipeline (rec_* model): any active member
    'person_applications_v1', _x.member::int,
    'application_assessments_ap1', (_x.atts @> ARRAY['v1'])::int,
    'invitations', cardinality(_x.invs), 'rls_invitations', cardinality(_x.invs),
    -- the recipient of an assignment also reads their own row (assignments_recipient_select_own)
    -- (and a platform admin reads the table through assignments_admin_select, unchanged)
    'rls_assignments', CASE WHEN _who = 'pa' THEN 9 ELSE (SELECT count(DISTINCT a) FROM unnest(_x.atts || _x.own) a) END,
    'review_blocked', (SELECT count(*) FROM unnest(_x.atts) a WHERE a IN ('w','v2w')),
    'review_awaiting_any', (SELECT (count(*) > 0)::int FROM unnest(_x.atts) a WHERE a IN ('w','v2w')),
    'review_board', (SELECT count(*) FROM unnest(_x.atts) a WHERE a IN ('w','v2w')),
    -- the released attempts of a subject: every one of them must be readable
    -- (a subject keeps their participant branch: their own progress and recommendations)
    'progress_r1', ((_x.atts @> ARRAY['r1']) OR (_x.own @> ARRAY['r1'] AND NOT (SELECT enabled FROM rm_launch)))::int,
    'progress_v1', ((_x.atts @> ARRAY['v1']) OR (_x.own @> ARRAY['v1']))::int,
    'progress_vs', ((_x.atts @> ARRAY['vs']) OR (_x.own @> ARRAY['vs']))::int,
    'progress_ws', ((_x.atts @> ARRAY['ws']) OR (_x.own @> ARRAY['ws'] AND NOT (SELECT enabled FROM rm_launch)))::int,
    'recommendations_r1', CASE WHEN _x.atts @> ARRAY['r1','r2'] OR (_x.own @> ARRAY['r1'] AND NOT (SELECT enabled FROM rm_launch)) THEN
        (SELECT (pg_temp.reads_as_cached('ow') ->> 'recommendations_r1')::int) ELSE 0 END,
    'training', _x.train::int, 'rls_training', (_x.train OR _who = 'p')::int,
    'rls_training_progress', CASE WHEN _x.train OR _who = 'p'
        THEN (SELECT (pg_temp.reads_as_cached('ow') ->> 'rls_training_progress')::int) ELSE 0 END,
    'case_readable_c0', (_x.cases @> ARRAY['c0'])::int, 'case_readable_cA', (_x.cases @> ARRAY['cA'])::int,
    'case_readable_cB', (_x.cases @> ARRAY['cB'])::int,
    'case_writable_c0', (_x.cases @> ARRAY['c0'])::int, 'case_writable_cA', (_x.cases @> ARRAY['cA'])::int,
    'case_writable_cB', (_x.cases @> ARRAY['cB'])::int,
    'case_rows', cardinality(_x.cases),
    'case_events_cA', (_x.cases @> ARRAY['cA'])::int, 'case_events_c0', (_x.cases @> ARRAY['c0'])::int,
    'session_notes_cA', (_x.cases @> ARRAY['cA'])::int, 'session_notes_c0', (_x.cases @> ARRAY['c0'])::int);
  RETURN _q;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expected(text) TO PUBLIC;

-- The owner's reads, computed once (the size of recommendations and training progress depends on content).
CREATE TEMP TABLE rm_cache (who text PRIMARY KEY, reads jsonb);
CREATE OR REPLACE FUNCTION pg_temp.reads_as_cached(_who text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT reads FROM rm_cache WHERE who = _who;
$$;
INSERT INTO rm_cache SELECT 'ow', pg_temp.reads_as((SELECT ow FROM rm));

-- What differs, as text, so a failure names the read that leaked.
CREATE OR REPLACE FUNCTION pg_temp.diff(_got jsonb, _want jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(k || ' got ' || coalesce(g.value::text, '-') || ' want ' || coalesce(w.value::text, '-'), '; ' ORDER BY k), '')
    FROM (SELECT jsonb_object_keys(_got) AS k UNION SELECT jsonb_object_keys(_want)) keys
    LEFT JOIN LATERAL (SELECT value FROM jsonb_each(_got) WHERE key = k) g ON true
    LEFT JOIN LATERAL (SELECT value FROM jsonb_each(_want) WHERE key = k) w ON true
   WHERE g.value IS DISTINCT FROM w.value;
$$;
CREATE OR REPLACE FUNCTION pg_temp.reads_ok(_who text) RETURNS boolean LANGUAGE sql AS $$
  SELECT pg_temp.reads_as((SELECT uid FROM rmscope WHERE who = _who)) = pg_temp.expected(_who);
$$;
CREATE OR REPLACE FUNCTION pg_temp.reads_diff(_who text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.diff(pg_temp.reads_as((SELECT uid FROM rmscope WHERE who = _who)), pg_temp.expected(_who));
$$;
-- Zero everywhere. An active MEMBER still sees the application rows of a person in the
-- person overview: they belong to the recruitment pipeline (rec_* model), not to the
-- report model, and are deliberately unchanged.
CREATE OR REPLACE FUNCTION pg_temp.nothing(_member boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_object_agg(k, CASE WHEN _member AND k = 'person_applications_v1' THEN 1 ELSE 0 END)
    FROM jsonb_object_keys(pg_temp.reads_as_cached('ow')) k;
$$;

-- ── Offboard through the real function (as the admin screen does) ─────────
SELECT pg_temp.set_status((SELECT su  FROM rm), 'suspended');
SELECT pg_temp.set_status((SELECT rv  FROM rm), 'removed');
SELECT pg_temp.set_status((SELECT rmm FROM rm), 'removed');

DO $$ BEGIN RAISE NOTICE 'GROUP RM-F -- the fixture: released reports for two use cases and two vacancies, three cases, offboarded members'; END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE released_at IS NOT NULL AND issuer_organization_id = (SELECT e FROM rm)) = 7
  AND (SELECT count(*) FROM public.scp_attempts WHERE issuer_organization_id = (SELECT e FROM rm) AND released_at IS NULL) = 2,
  'RM-F.1 seven attempts are released (workforce r1 r2 r3 ws, recruitment v1 vs v2); two are waiting for review (w, v2w)');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT r2 FROM rma) AND audience = 'employer') = 1,
  'RM-F.2 an ADMIN released r2: the release gate admits an admin (the employer document exists)');
SELECT pg_temp.ok(
  (SELECT string_agg(user_id::text || ':' || status, ',' ORDER BY user_id) FROM public.employer_memberships
    WHERE employer_id = (SELECT e FROM rm) AND user_id IN (SELECT su FROM rm UNION SELECT rv FROM rm UNION SELECT rmm FROM rm))
  = (SELECT (SELECT su FROM rm)::text || ':suspended,' || (SELECT rv FROM rm)::text || ':removed,' || (SELECT rmm FROM rm)::text || ':removed'),
  'RM-F.3 su is suspended, rv and rmm are removed -- by update_employer_membership, as a platform administrator');
SELECT pg_temp.ok((SELECT NOT auth_select AND NOT anon_select FROM rm_before),
  'RM-F.4 before this suite granted it, neither authenticated nor anon could SELECT scp_report_snapshots');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_cases WHERE employer_id = (SELECT e FROM rm)) = 3
  AND (SELECT created_by FROM public.scp_interview_cases WHERE id = (SELECT case_a FROM rmc)) = (SELECT cr FROM rm)
  AND EXISTS (SELECT 1 FROM public.scp_interview_panels p JOIN public.scp_interview_panel_members pm ON pm.panel_id = p.id
               WHERE p.case_id = (SELECT case_a FROM rmc) AND pm.user_id = (SELECT pn FROM rm)),
  'RM-F.5 three cases; case A was opened by a plain member (cr) and has a panel with pn on it');
SELECT pg_temp.ok(
  (SELECT (reads ->> 'participants')::int = 9 AND (reads ->> 'invitations')::int = 3
          AND (reads ->> 'recommendations_r1')::int = 1 AND (reads ->> 'rls_training_progress')::int = 1
          AND (reads ->> 'case_rows')::int = 3
     FROM rm_cache WHERE who = 'ow'),
  'RM-F.6 the owner reads nine attempts, three invitations, three cases, recommendations and training progress: the fixture has something to withhold');

-- ── RM0 · reproduction on the pre-fix state ──────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM0 -- reproduction: on the pre-fix state a plain member reads everything'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20270204090000_interview_case_access_model_rollback.sql
\ir ../rollback/20270203090000_employer_report_access_model_rollback.sql
CREATE TEMP TABLE rm0 AS SELECT pg_temp.reads_as((SELECT pm FROM rm)) AS pm_reads, pg_temp.reads_as((SELECT sm FROM rm)) AS sm_reads;
SELECT pg_temp.ok(
  (SELECT (pm_reads ->> 'report_r1')::int = 1 AND (pm_reads ->> 'report_v2')::int = 1 AND (pm_reads ->> 'v3_v1')::int = 1
          AND (pm_reads ->> 'identity_r1')::int = 1 AND (pm_reads ->> 'policy_vs')::int = 1
          AND (pm_reads ->> 'decisions_v1')::int = 1 AND (pm_reads ->> 'notes_v2')::int = 1
     FROM rm0),
  'RM0.1 PRE-FIX: a PLAIN MEMBER reads every released report of either use case and either vacancy, their identity, decisions and notes');
SELECT pg_temp.ok(
  (SELECT (pm_reads ->> 'participants')::int = 9 AND (pm_reads ->> 'pipeline')::int = 9
          AND (pm_reads ->> 'invitations')::int = 3 AND (pm_reads ->> 'rls_assignments')::int = 9
          AND (pm_reads ->> 'review_blocked')::int = 2 AND (pm_reads ->> 'training')::int = 1
     FROM rm0),
  'RM0.2 PRE-FIX: and every list and count: nine participants, nine pipeline rows, three invitations, nine assignments, two attempts waiting, one training assignment');
SELECT pg_temp.ok(
  (SELECT (pm_reads ->> 'case_readable_c0')::int = 1 AND (pm_reads ->> 'case_readable_cA')::int = 1
          AND (pm_reads ->> 'case_writable_cB')::int = 1 AND (pm_reads ->> 'case_rows')::int = 3
          AND (pm_reads ->> 'session_notes_cA')::int = 1
     FROM rm0),
  'RM0.3 PRE-FIX: and reads AND WRITES every interview case, with its session notes');
SELECT pg_temp.ok(
  (SELECT (sm_reads ->> 'report_vs')::int = 1 AND (sm_reads ->> 'case_readable_cB')::int = 1 FROM rm0),
  'RM0.4 PRE-FIX: the admin who is the SUBJECT of the V1 assessment and of case B reads the employer document and the case about themselves');
ROLLBACK TO SAVEPOINT before_fix;
SELECT pg_temp.ok(to_regprocedure('public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)') IS NOT NULL
  AND to_regprocedure('public.scp_attempt_reports_readable(uuid)') IS NOT NULL
  AND to_regprocedure('public.scp_report_snapshot_readable(text,uuid,uuid,uuid)') IS NOT NULL,
  'RM0.5 the savepoint was undone: the single definition and its resolvers are back in place');

-- ── RM1 · logged out ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM1 -- logged out: refused'; END $$;
SELECT pg_temp.ok(
  (SELECT bool_and(v = '-1'::jsonb) FROM jsonb_each(pg_temp.reads_as(NULL)) t(k, v)),
  'RM1.1 anon: every read is refused outright (no EXECUTE, no table grant): ' || pg_temp.reads_as(NULL)::text);
SELECT pg_temp.ok(pg_temp.act_as(NULL, 'release') = 'PERMISSION_DENIED'
  AND pg_temp.act_as(NULL, 'finalise') = 'PERMISSION_DENIED'
  AND pg_temp.act_as(NULL, 'finalise_previewed') = 'PERMISSION_DENIED',
  'RM1.2 anon cannot release or finalise: no EXECUTE');
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM unnest(ARRAY[
    'public.scp_employer_report(uuid)', 'public.scp_employer_report_v3(uuid)', 'public.scp_employer_report_identity(uuid)',
    'public.scp_report_snapshot_readable(text,uuid,uuid)', 'public.scp_report_snapshot_readable(text,uuid,uuid,uuid)',
    'public.scp_iv_can_read_case(uuid)', 'public.scp_iv_can_write_case(uuid)',
    'public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)', 'public.scp_attempt_reports_readable(uuid)',
    'public.scp_release_attempt_report(uuid)', 'public.scp_iv_finalise_report(uuid,uuid)',
    'public.scp_iv_finalise_previewed_report(uuid,text,uuid)', 'public.scp_participant_report(uuid)',
    'public.scp_participant_report_for_issuer(uuid)', 'public.has_active_employer_role(uuid,uuid,text[])',
    'public.scp_employer_participants(uuid)', 'public.scp_employer_assessment_pipeline(uuid)',
    'public.scp_employer_invitations(uuid)', 'public.scp_employer_review_pressure(uuid)',
    'public.scp_employer_decisions(uuid)', 'public.scp_interview_notes(uuid)']) f
   WHERE has_function_privilege('anon', f::regprocedure, 'EXECUTE')),
  'RM1.3 none of the report, case, list, count and gate functions is executable by anon');

-- ── RM2 / RM3 · the candidates ───────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM2 -- the candidates: their own participant document only'; END $$;
SELECT pg_temp.ok(pg_temp.reads_ok('p'),
  'RM2.1 the subject p reads their OWN participant document (function, helper and row policy), their own training row, and nothing of the employer''s: ' || pg_temp.reads_diff('p'));
SELECT pg_temp.ok(pg_temp.act_as((SELECT p FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT p FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE',
  'RM2.2 the subject cannot release their own report or finalise a case');
SELECT pg_temp.ok(pg_temp.reads_ok('p2'),
  'RM3.1 the other candidate reads their own R3 document and nothing of p''s: ' || pg_temp.reads_diff('p2'));
SELECT pg_temp.ok(pg_temp.act_as((SELECT p2 FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT p2 FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE',
  'RM3.2 neither can the other candidate');
SELECT pg_temp.ok(pg_temp.reads_ok('c1'),
  'RM3.3 an applicant (not a member) reads nothing as an employer: ' || pg_temp.reads_diff('c1'));

-- ── RM4 · owner and admin of company A ───────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM4 -- owner and admin of A: read everything, release, finalise'; END $$;
SELECT pg_temp.ok(pg_temp.reads_ok('ow'), 'RM4.1 the owner reads every attempt, list, count and case, the issuer-admin participant document included: ' || pg_temp.reads_diff('ow'));
SELECT pg_temp.ok(pg_temp.reads_ok('ad'), 'RM4.2 the admin reads exactly what the owner reads: ' || pg_temp.reads_diff('ad'));
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

-- ── RM5 · the ordinary member, and the authorised ones ───────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM5 -- an ordinary member reads nothing; a use-case reviewer and the vacancy''s recruiter read their scope'; END $$;
SELECT pg_temp.ok(pg_temp.reads_ok('pm'),
  'RM5.1 a PLAIN MEMBER reads no report, identity, decision, note, list, count, invitation, assignment, training row or case -- every read is empty: ' || pg_temp.reads_diff('pm'));
SELECT pg_temp.ok(pg_temp.reads_as((SELECT pm FROM rm)) = pg_temp.nothing(true),
  'RM5.1b and the plain member''s answer is exactly an outsider''s -- zero everywhere -- except the application rows of the recruitment pipeline, which are not part of this model');
SELECT pg_temp.ok(pg_temp.reads_ok('gr'),
  'RM5.2 a reviewer with BOTH grants reads every workforce and recruitment attempt and invitation, and every case, but not the issuer-admin participant document: ' || pg_temp.reads_diff('gr'));
SELECT pg_temp.ok(pg_temp.reads_ok('gw'),
  'RM5.3 a WORKFORCE reviewer reads the workforce attempts, the workforce invitation and training -- and not one recruitment attempt, invitation or case: ' || pg_temp.reads_diff('gw'));
SELECT pg_temp.ok(pg_temp.reads_ok('gc'),
  'RM5.4 a RECRUITMENT reviewer reads both vacancies'' recruitment attempts, invitations and the cases -- and nothing workforce, no training: ' || pg_temp.reads_diff('gc'));
SELECT pg_temp.ok(pg_temp.reads_ok('r1'),
  'RM5.5 the plain member who is the named responsible recruiter of V1 reads V1''s recruitment attempts (v1, vs), its invitation and its cases -- not V2''s, not a workforce one, not a case without that vacancy: ' || pg_temp.reads_diff('r1'));
SELECT pg_temp.ok(pg_temp.reads_ok('r2'),
  'RM5.6 and the responsible recruiter of V2 reads V2''s (v2, v2w) and nothing of V1: ' || pg_temp.reads_diff('r2'));
SELECT pg_temp.ok(pg_temp.reads_ok('cr') AND pg_temp.reads_ok('pn'),
  'RM5.7 the creator of case A and a member of its panel read and write that case only: no report, no list, no count, no other case: cr ' || pg_temp.reads_diff('cr') || ' pn ' || pg_temp.reads_diff('pn'));
-- Releasing and finalising are not widened by any basis: owner/admin only.
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT pm FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT gr FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT gw FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT r1 FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT cr FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE',
  'RM5.8 a plain member, a reviewer, a responsible recruiter and a case creator cannot RELEASE a report (owner/admin only)');
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT pm FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT gr FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT r1 FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT cr FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT pn FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT gc FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE',
  'RM5.9 nor FINALISE an interview report, either variant, whatever their basis (owner/admin only)');

-- ── RM5s · the subject who is a member ───────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM5s -- a member who is the SUBJECT never reads the employer document about themselves'; END $$;
SELECT pg_temp.ok(pg_temp.reads_ok('sm'),
  'RM5s.1 an ADMIN who is the subject of the V1 assessment and of case B reads everything of the organisation''s EXCEPT what is about them (attempt vs, its decisions-free progress, case B): ' || pg_temp.reads_diff('sm'));
SELECT pg_temp.ok(pg_temp.reads_ok('sg'),
  'RM5s.2 a reviewer with both grants who is the subject of a workforce assessment reads the rest, but not the one about them (attempt ws): ' || pg_temp.reads_diff('sg'));
SELECT pg_temp.ok(
  (SELECT (reads ->> 'report_vs')::int = 0 AND (reads ->> 'identity_r1')::int = 1 AND (reads ->> 'readable_vs')::int = 0 AND (reads ->> 'policy_vs')::int = 0 FROM (SELECT pg_temp.reads_as((SELECT sm FROM rm)) AS reads) x),
  'RM5s.3 the exclusion cuts through R1: the owner-level admin sm reads r1 and not vs, by function, helper and row policy alike');

-- ── RM6 · suspended and removed members ──────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM6 -- a suspended or removed member of A: refused'; END $$;
SELECT pg_temp.ok(pg_temp.reads_ok('su'), 'RM6.1 a SUSPENDED admin of A reads nothing: ' || pg_temp.reads_diff('su'));
SELECT pg_temp.ok(pg_temp.reads_ok('rv'), 'RM6.2 a REMOVED admin of A reads nothing: ' || pg_temp.reads_diff('rv'));
SELECT pg_temp.ok(pg_temp.reads_ok('rmm'), 'RM6.3 a REMOVED member of A reads nothing: ' || pg_temp.reads_diff('rmm'));
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
SELECT pg_temp.ok(pg_temp.reads_ok('xo'), 'RM7.1 the owner of company B reads nothing of A''s: ' || pg_temp.reads_diff('xo'));
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT xo FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT xo FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT xo FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE',
  'RM7.2 and releases and finalises nothing of A''s, although an owner of their own company');

-- ── RM8 · a platform administrator who is not a member ───────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM8 -- a platform admin who is not a member: refused through the app-level report functions'; END $$;
SELECT pg_temp.ok(public.is_platform_admin((SELECT pa FROM rm)), 'RM8.0 the principal really is a platform administrator');
SELECT pg_temp.ok(pg_temp.reads_ok('pa'),
  'RM8.1 through the report functions, the snapshot policies, the lists and the interview reads a platform admin who is not a member reads nothing -- bar the raw assignment table, which the platform-admin policy still admits (unchanged): ' || pg_temp.reads_diff('pa'));
SELECT pg_temp.ok(
  pg_temp.act_as((SELECT pa FROM rm), 'release') = 'SCP_NOT_AUTHORISED_TO_RELEASE'
  AND pg_temp.act_as((SELECT pa FROM rm), 'finalise') = 'SCP_IV_FINALISE_ROLE'
  AND pg_temp.act_as((SELECT pa FROM rm), 'finalise_previewed') = 'SCP_IV_FINALISE_ROLE',
  'RM8.2 and releases and finalises nothing: platform administration is not an employer role');

-- ── RM9 · the definitions, stated directly ───────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM9 -- the helper, the gates and the snapshot policies, by definition'; END $$;
SELECT pg_temp.ok(
  (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_report_snapshot_readable(text,uuid,uuid,uuid)'::regprocedure)
    ~ 'employer_reports_readable'
  AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_report_snapshot_readable(text,uuid,uuid,uuid)'::regprocedure)
    !~ 'has_active_employer_role'
  AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_report_snapshot_readable(text,uuid,uuid)'::regprocedure)
    !~ 'has_active_employer_role',
  'RM9.1 neither snapshot gate decides on membership any more: the employer branch asks employer_reports_readable');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') = 2
  AND (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots' AND policyname = 'scp_report_snapshots_employer')
    ~ 'scp_report_snapshot_readable\(audience, subject_id, issuer_organization_id, attempt_id\)'
  AND (SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots' AND policyname = 'scp_report_snapshots_employer') = '{authenticated}',
  'RM9.2 scp_report_snapshots has exactly two policies, both authenticated, the employer one routed through the attempt-aware gate');
SELECT pg_temp.ok(
  public.scp_report_snapshot_readable('nonsense', (SELECT s1 FROM rms), (SELECT e FROM rm)) IS NOT TRUE
  AND public.scp_report_snapshot_readable('nonsense', (SELECT s1 FROM rms), (SELECT e FROM rm), (SELECT r1 FROM rma)) IS NOT TRUE,
  'RM9.3 an unknown audience is never readable');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('scp_iv_can_read_case', 'scp_iv_can_write_case', 'scp_iv_case_row_visible')
     AND p.prosrc ~ 'employer_reports_readable' AND p.prosrc !~ 'has_active_employer_role') = 3,
  'RM9.4 the three interview-case gates ask employer_reports_readable and do not decide on membership');

-- ── RM10 · offboarding, as the admin screen does it ──────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RM10 -- access follows the membership at once; a reviewer grant does not come back'; END $$;
SELECT pg_temp.ok(pg_temp.set_status((SELECT gr FROM rm), 'suspended') = 'suspended'
  AND pg_temp.reads_as((SELECT gr FROM rm)) = pg_temp.reads_as((SELECT xo FROM rm)),
  'RM10.1 a reviewer SUSPENDED by a platform admin reads exactly what an outsider reads, at once');
SELECT pg_temp.ok(pg_temp.set_status((SELECT gr FROM rm), 'active') = 'active'
  AND pg_temp.reads_as((SELECT gr FROM rm)) = pg_temp.nothing(true),
  'RM10.2 and REACTIVATED, reads nothing: the grant was revoked with the suspension and did not return');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_reviewers WHERE user_id = (SELECT gr FROM rm) AND revoked_at IS NULL) = 0
  AND (SELECT count(*) FROM public.scp_employer_reviewers WHERE user_id = (SELECT gr FROM rm) AND revoked_at IS NOT NULL) = 1,
  'RM10.2b the grant row is kept as history, revoked');
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT ow FROM rm)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.scp_grant_employer_reviewer((SELECT e FROM rm), (SELECT gr FROM rm), ARRAY['workforce', 'recruitment']);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.reads_ok('gr'),
  'RM10.3 a fresh grant by the owner restores exactly the reviewer''s reads: ' || pg_temp.reads_diff('gr'));
SELECT pg_temp.ok(pg_temp.set_status((SELECT ad FROM rm), 'removed') = 'removed'
  AND pg_temp.reads_as((SELECT ad FROM rm)) = pg_temp.nothing(),
  'RM10.4 an admin REMOVED by a platform admin reads nothing at once');
SELECT pg_temp.ok(
  (SELECT removed_at IS NOT NULL AND status = 'removed' FROM public.employer_memberships
    WHERE employer_id = (SELECT e FROM rm) AND user_id = (SELECT ad FROM rm)),
  'RM10.4b and the row is kept, with removed_at set (removed is a status, never a delete)');
SELECT pg_temp.ok(pg_temp.set_status((SELECT ad FROM rm), 'active') = 'active'
  AND pg_temp.reads_ok('ad'),
  'RM10.5 reactivating the admin restores exactly their reads (the role, not a grant, is what made them an admin): ' || pg_temp.reads_diff('ad'));
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
  'RM10.6 an OWNER and an ADMIN cannot call update_employer_membership: only a platform admin can end a membership today');
SELECT pg_temp.ok(
  (SELECT status FROM public.employer_memberships WHERE employer_id = (SELECT e FROM rm) AND user_id = (SELECT pm FROM rm)) = 'active',
  'RM10.6b and nothing changed');
-- The final-owner rule, with the wording the admin screen's error mapping recognises.
SELECT pg_temp.ok(
  pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), NULL, 'removed') ~ 'it is the only active owner'
  AND pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), 'admin', NULL) ~ 'it is the only active owner'
  AND pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), NULL, 'suspended') ~ 'it is the only active owner',
  'RM10.7 the ONLY active owner cannot be removed, suspended or demoted -- and the refusal says "it is the only active owner" (what membershipRpcFailure recognises)');
SELECT pg_temp.ok(
  (SELECT status || '/' || role FROM public.employer_memberships WHERE employer_id = (SELECT e FROM rm) AND user_id = (SELECT ow FROM rm)) = 'active/owner',
  'RM10.7b and the owner is unchanged');
SELECT pg_temp.ok(
  pg_temp.rpc_as((SELECT pa FROM rm), (SELECT sm FROM rm), 'owner', NULL) = 'ok'
  AND pg_temp.rpc_as((SELECT pa FROM rm), (SELECT ow FROM rm), NULL, 'removed') = 'ok'
  AND pg_temp.reads_as((SELECT ow FROM rm)) = pg_temp.nothing(),
  'RM10.8 with a second ACTIVE owner appointed, the first can be removed; they then read nothing');

ROLLBACK;
