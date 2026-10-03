-- P1-5 (20270107090000): a panel reviewer sees no other reviewer's
-- assessment before the reveal.
--
--   PR-F the fixture: one Interview Intelligence case with a two-reviewer
--        panel (A, B). Each reviewer records every core question through
--        scp_iv_record_assessment, with a rationale only they wrote. A second
--        case has no panel.
--   PR0  REPRODUCTION. Inside a savepoint the pre-fix policies and report
--        functions are restored by running the real rollback file. Before
--        the reveal, B reads A's assessments with a plain SELECT, reads A's
--        levels in the case events, and previews a report that carries A's
--        rationale. Rolled back.
--   PR1  before the reveal, each reviewer reads only their own assessments
--        and assessment events; a case reader who is not on the panel reads
--        neither reviewer's.
--   PR2  before the reveal, the report is neither previewed nor finalised.
--   PR3  after both submit and the panel reveals, each reads both, the
--        report blocker is gone and the preview is built again.
--   PR4  a case with no panel is unchanged: its readers see every
--        assessment and assessment event.
--   PR5  unchanged refusals: another employer and anon.
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

-- A count as a principal.
CREATE OR REPLACE FUNCTION pg_temp.count_as(_uid text, _sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _n;
END $$;

-- Run a statement as a principal: 'ok' or 'err:<SQLSTATE>:<message prefix>'.
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE _sql;
    _r := 'ok';
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLSTATE || ':' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- o owner (opens the panel, reads the case, is NOT on the panel); a, b panel
-- reviewers; x owner of another employer.
INSERT INTO auth.users (id, email) VALUES
  ('0f0f0000-0000-4000-8000-000000000001', 'pr-owner@test.invalid'),
  ('0f0f0000-0000-4000-8000-00000000000a', 'pr-reviewer-a@test.invalid'),
  ('0f0f0000-0000-4000-8000-00000000000b', 'pr-reviewer-b@test.invalid'),
  ('0f0f0000-0000-4000-8000-000000000009', 'pr-other-owner@test.invalid');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f0f0000-1111-4000-8000-000000000001', 'PR Employer', 'pr-employer', 'active'),
  ('0f0f0000-1111-4000-8000-000000000009', 'PR Other Employer', 'pr-other-employer', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f0f0000-1111-4000-8000-000000000001', '0f0f0000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('0f0f0000-1111-4000-8000-000000000001', '0f0f0000-0000-4000-8000-00000000000a', 'member', 'active'),
  ('0f0f0000-1111-4000-8000-000000000001', '0f0f0000-0000-4000-8000-00000000000b', 'member', 'active'),
  ('0f0f0000-1111-4000-8000-000000000009', '0f0f0000-0000-4000-8000-000000000009', 'owner', 'active');
-- The two reviewers' BASIS for working the case: a recruitment reviewer grant (membership alone gives
-- none since 20270203090000/20270204090000).
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by) VALUES
  ('0f0f0000-1111-4000-8000-000000000001', '0f0f0000-0000-4000-8000-00000000000a', ARRAY['recruitment']::text[], '0f0f0000-0000-4000-8000-000000000001'),
  ('0f0f0000-1111-4000-8000-000000000001', '0f0f0000-0000-4000-8000-00000000000b', ARRAY['recruitment']::text[], '0f0f0000-0000-4000-8000-000000000001');

CREATE TEMP TABLE fx(label text PRIMARY KEY, id uuid);
GRANT ALL ON fx TO authenticated;

-- Two cases on the openly available Vaktare pack, created by the owner. The
-- panel case gets a panel of A and B; every core question is assessed at
-- level 0 (no evidence needed) by each reviewer, with their own rationale.
DO $$
DECLARE _packv uuid; _panel_case uuid; _plain_case uuid; _q record;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'vaktare-se' AND ver.pilot_availability = 'open' LIMIT 1;
  INSERT INTO fx VALUES ('packv', _packv);
  PERFORM set_config('request.jwt.claim.sub', '0f0f0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  _panel_case := public.scp_iv_create_case('0f0f0000-1111-4000-8000-000000000001', 'Panelfall', _packv, 'Kandidat P.', NULL, 'EXT-PR-PANEL');
  _plain_case := public.scp_iv_create_case('0f0f0000-1111-4000-8000-000000000001', 'Enskilt fall', _packv, 'Kandidat E.', NULL, 'EXT-PR-PLAIN');
  PERFORM public.scp_iv_panel_open(_panel_case, ARRAY['0f0f0000-0000-4000-8000-00000000000a', '0f0f0000-0000-4000-8000-00000000000b']::uuid[]);
  RESET ROLE;
  INSERT INTO fx VALUES ('panel_case', _panel_case), ('plain_case', _plain_case);
  FOR _q IN SELECT id FROM public.scp_interview_core_questions WHERE pack_version_id = _packv LOOP
    PERFORM set_config('request.jwt.claim.sub', '0f0f0000-0000-4000-8000-00000000000a', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.scp_iv_record_assessment(_panel_case, _q.id, 0, 'A-RATIONALE-PRIVATE', NULL, NULL);
    PERFORM public.scp_iv_record_assessment(_plain_case, _q.id, 0, 'A-ALONE-ON-PLAIN-CASE', NULL, NULL);
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '0f0f0000-0000-4000-8000-00000000000b', true);
    SET LOCAL ROLE authenticated;
    PERFORM public.scp_iv_record_assessment(_panel_case, _q.id, 0, 'B-RATIONALE-PRIVATE', NULL, NULL);
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP PR-F — a two-reviewer panel, each assessment recorded through the RPC'; END $$;
-- =========================================================================
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_interview_assessments
                    WHERE case_id = (SELECT id FROM fx WHERE label = 'panel_case')) =
                  2 * (SELECT count(*) FROM public.scp_interview_core_questions WHERE pack_version_id = (SELECT id FROM fx WHERE label = 'packv'))
                  AND (SELECT state FROM public.scp_interview_panels WHERE case_id = (SELECT id FROM fx WHERE label = 'panel_case')) = 'individual',
  'PR-F.1 both reviewers assessed every core question; the panel is in its individual phase');
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_interview_case_events
                    WHERE case_id = (SELECT id FROM fx WHERE label = 'panel_case') AND event = 'assessment_recorded'
                      AND actor_id = '0f0f0000-0000-4000-8000-00000000000a' AND metadata ? 'level') > 0,
  'PR-F.2 each assessment wrote an assessment_recorded event carrying its level');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP PR0 — reproduction: before the reveal B reads A''s assessments'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20270107090000_scp_iv_panel_reveal_boundary_rollback.sql
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L AND rationale = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'A-RATIONALE-PRIVATE')) > 0,
  'PR0.1 PRE-FIX: B reads A''s assessments and rationale with a plain SELECT before the reveal');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L AND event = %L AND actor_id = %L AND metadata ? %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'assessment_recorded', '0f0f0000-0000-4000-8000-00000000000a', 'level')) > 0,
  'PR0.2 PRE-FIX: B reads A''s levels in the case events');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_iv_preview_report(%L) WHERE payload::text LIKE %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), '%A-RATIONALE-PRIVATE%')) = 1,
  'PR0.3 PRE-FIX: B previews a report carrying A''s rationale');
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP PR1 — before the reveal, only your own'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L AND assessor_id <> %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), '0f0f0000-0000-4000-8000-00000000000b')) = 0,
  'PR1.1 B reads none of A''s assessments');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case')))
                  = (SELECT count(*) FROM public.scp_interview_core_questions WHERE pack_version_id = (SELECT id FROM fx WHERE label = 'packv')),
  'PR1.2 B still reads every one of B''s own');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000a',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L AND assessor_id <> %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), '0f0f0000-0000-4000-8000-00000000000a')) = 0,
  'PR1.3 and A reads none of B''s');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L AND event IN (%L, %L) AND actor_id <> %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'assessment_recorded', 'assessment_superseded', '0f0f0000-0000-4000-8000-00000000000b')) = 0
                  AND pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L AND event = %L AND actor_id = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'assessment_recorded', '0f0f0000-0000-4000-8000-00000000000b')) > 0,
  'PR1.4 B reads B''s own assessment events and none of A''s');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L AND event = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'panel_opened')) = 1,
  'PR1.5 other case events stay readable (panel_opened)');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'))) = 0
                  AND pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L AND event = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'assessment_recorded')) = 0,
  'PR1.6 the owner, who reads the case but is not on the panel, reads neither reviewer''s assessments or events');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_iv_panel_visible_assessments(%L) WHERE NOT is_mine',
                           (SELECT id FROM fx WHERE label = 'panel_case'))) = 0,
  'PR1.7 the panel function agrees: nothing of the others before the reveal');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP PR2 — before the reveal, no report'; END $$;
-- =========================================================================
DO $$
DECLARE _r text;
BEGIN
  _r := pg_temp.try_as('0f0f0000-0000-4000-8000-00000000000b',
          format('SELECT * FROM public.scp_iv_preview_report(%L)', (SELECT id FROM fx WHERE label = 'panel_case')));
  PERFORM pg_temp.ok(_r = 'err:23514:SCP_IV_PANEL_NOT_REVEALED', 'PR2.1 a reviewer cannot preview the report (' || _r || ')');
  _r := pg_temp.try_as('0f0f0000-0000-4000-8000-000000000001',
          format('SELECT * FROM public.scp_iv_preview_report(%L)', (SELECT id FROM fx WHERE label = 'panel_case')));
  PERFORM pg_temp.ok(_r = 'err:23514:SCP_IV_PANEL_NOT_REVEALED', 'PR2.2 nor can the owner (' || _r || ')');
END $$;
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_iv_report_blockers(%L) WHERE code = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'PANEL_NOT_REVEALED')) = 1,
  'PR2.3 the report blockers name the unrevealed panel, so finalising is refused too');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP PR3 — after the reveal, both are visible again'; END $$;
-- =========================================================================
DO $$
DECLARE _c uuid := (SELECT id FROM fx WHERE label = 'panel_case');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f0f0000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.scp_iv_panel_submit(_c);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '0f0f0000-0000-4000-8000-00000000000b', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.scp_iv_panel_submit(_c);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '0f0f0000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.scp_iv_panel_reveal(_c);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L AND rationale = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'A-RATIONALE-PRIVATE')) > 0
                  AND pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L AND event = %L AND actor_id = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'assessment_recorded', '0f0f0000-0000-4000-8000-00000000000a')) > 0,
  'PR3.1 after the reveal B reads A''s assessments and assessment events');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case')))
                  = 2 * (SELECT count(*) FROM public.scp_interview_core_questions WHERE pack_version_id = (SELECT id FROM fx WHERE label = 'packv')),
  'PR3.2 and the owner reads both reviewers'' assessments');
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_iv_report_blockers(%L) WHERE code = %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), 'PANEL_NOT_REVEALED')) = 0
                  AND pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_iv_preview_report(%L) WHERE payload::text LIKE %L AND payload::text LIKE %L',
                           (SELECT id FROM fx WHERE label = 'panel_case'), '%A-RATIONALE-PRIVATE%', '%B-RATIONALE-PRIVATE%')) = 1,
  'PR3.3 the panel blocker is gone and the preview carries both reviewers'' assessments');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP PR4 — a case with no panel is unchanged'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-00000000000b',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = %L AND rationale = %L',
                           (SELECT id FROM fx WHERE label = 'plain_case'), 'A-ALONE-ON-PLAIN-CASE')) > 0
                  AND pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = %L AND event = %L',
                           (SELECT id FROM fx WHERE label = 'plain_case'), 'assessment_recorded')) > 0,
  'PR4.1 on a case with no panel every case reader sees the assessments and their events');
SELECT pg_temp.ok(pg_temp.try_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT * FROM public.scp_iv_preview_report(%L)', (SELECT id FROM fx WHERE label = 'plain_case'))) = 'ok'
                  AND pg_temp.count_as('0f0f0000-0000-4000-8000-000000000001',
                    format('SELECT count(*) FROM public.scp_iv_report_blockers(%L) WHERE code = %L',
                           (SELECT id FROM fx WHERE label = 'plain_case'), 'PANEL_NOT_REVEALED')) = 0,
  'PR4.2 and its report previews with no panel blocker');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP PR5 — unchanged refusals'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.count_as('0f0f0000-0000-4000-8000-000000000009',
                    format('SELECT count(*) FROM public.scp_interview_assessments WHERE case_id IN (%L, %L)',
                           (SELECT id FROM fx WHERE label = 'panel_case'), (SELECT id FROM fx WHERE label = 'plain_case'))) = 0
                  AND pg_temp.try_as('0f0f0000-0000-4000-8000-000000000009',
                    format('SELECT * FROM public.scp_iv_preview_report(%L)', (SELECT id FROM fx WHERE label = 'plain_case'))) LIKE 'err:42501:%',
  'PR5.1 another employer reads no assessment and previews no report');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.scp_iv_panel_hides_others(uuid)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.scp_iv_preview_report(uuid)', 'EXECUTE')
                  AND NOT has_table_privilege('anon', 'public.scp_interview_assessments', 'SELECT')
                  AND NOT has_table_privilege('anon', 'public.scp_interview_case_events', 'SELECT'),
  'PR5.2 anon reads none of it');

DO $$ BEGIN RAISE NOTICE 'ALL scp_iv_panel_reveal_boundary assertions passed'; END $$;
ROLLBACK;
