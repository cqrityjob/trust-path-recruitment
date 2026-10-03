-- Interview Intelligence: a case is read and worked on by the people on it, not by
-- every member. Migration 20270204090000.
--
--   IC0  REPRODUCTION on the pre-fix state (the real rollback of 20270204090000 inside a
--        savepoint): a plain member reads AND WRITES another colleague's case; a member
--        who is the candidate reads the case about themselves; a candidate's corrections on
--        a vetting-restricted case are readable by a member who may not open the case.
--   IC1  who reads a case: owner, admin, creator, panel member, a recruitment reviewer, the
--        responsible recruiter of the case's vacancy -- and nobody else -- by the gate, by
--        the row policy and by the child tables.
--   IC2  who WRITES: the same people, by a governed function and by a row policy. A plain
--        member who is not on the case is refused; so is a workforce reviewer.
--   IC3  the candidate who is a member (and the creator of a case about themselves).
--   IC4  the panel: a member put on the panel gains the case at once, and loses it with
--        their standing.
--   IC5  the security-vetting restriction is additive. A restricted case is refused to
--        every basis (owner, admin, creator, panel, reviewer, recruiter) that is not an
--        appointed security officer; an officer who has no basis does not gain one.
--        A candidate's corrections follow the case gate (finding a: defence in depth; IC0.6 measures
--        that the pre-fix policy was already hidden by the case row policy).
--   IC6  grants and posture.
--
-- IC5 marks cases as vetting-restricted through a test seam: bcp_case_vetting_restricted is
-- replaced INSIDE this transaction by a function that reads a temp table. The real BESKT
-- linkage (bcp_case_links to a security-vetting assignment) is exercised in
-- scp_interview_case_vetting_read_test.sql, which asserts the same boundary on real rows.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

\ir employer_report_access_fixture.sql

-- A value as a principal: the first column as text, 'ERR:<sqlstate>' when refused.
CREATE OR REPLACE FUNCTION pg_temp.as_val(_uid uuid, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  BEGIN
    EXECUTE _sql INTO _r;
  EXCEPTION WHEN OTHERS THEN
    _r := 'ERR:' || SQLSTATE || ':' || split_part(SQLERRM, ':', 1);
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
-- A write as a principal, undone: 'ok', or the refusal.
CREATE OR REPLACE FUNCTION pg_temp.write_as(_uid uuid, _what text, _case uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok'; _sess uuid; _q uuid;
BEGIN
  SELECT s.id INTO _sess FROM public.scp_interview_sessions s WHERE s.case_id = _case LIMIT 1;
  SELECT id INTO _q FROM public.scp_interview_core_questions
   WHERE pack_version_id = (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = _case) ORDER BY display_order LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  BEGIN
    IF _what = 'note' THEN
      INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
      VALUES (_sess, _q, 'observation', 'probe', _uid);
    ELSIF _what = 'panel' THEN
      PERFORM public.scp_iv_panel_open(_case, ARRAY[_uid, (SELECT ow FROM rm)]);
    ELSIF _what = 'source' THEN
      PERFORM public.scp_iv_add_source(_case, 'job_description', 'Probe', E'Probe.', 'recruitment_interview', 'Berättigat intresse.');
    END IF;
    RAISE EXCEPTION 'IC_PROBE_UNDO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IC_PROBE_UNDO' THEN
      _r := SQLSTATE || ':' || split_part(split_part(SQLERRM, ':', 1), E'\n', 1);
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.can(_uid uuid, _fn text, _case uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT public.%s(%L)::text', _fn, _case));
$$;
CREATE OR REPLACE FUNCTION pg_temp.rows_of(_uid uuid, _sql text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT count(*)::text FROM (%s) q', _sql));
$$;
-- The cases a principal can SEE through the row policy: a, b, 0 (and c).
CREATE OR REPLACE FUNCTION pg_temp.seen(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format($f$SELECT coalesce(string_agg(n, ',' ORDER BY n), '') FROM (
      SELECT CASE id WHEN %L THEN '0' WHEN %L THEN 'A' WHEN %L THEN 'B' ELSE 'C' END AS n
        FROM public.scp_interview_cases WHERE employer_id = %L) q$f$,
      (SELECT kase FROM rmc), (SELECT case_a FROM rmc), (SELECT case_b FROM rmc), (SELECT e FROM rm)));
$$;

SELECT pg_temp.set_status((SELECT su  FROM rm), 'suspended');
SELECT pg_temp.set_status((SELECT rv  FROM rm), 'removed');

-- One more case, and one more applicant: cr, a plain member, applies to V2 and then opens
-- the case about their own application. cC.
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT 'e5a00000-4444-4000-8000-0000000000c1', j2, e, cr, 'submitted', now() FROM rm;
CREATE TEMP TABLE icc (case_c uuid);
GRANT SELECT ON icc TO PUBLIC;
DO $$
DECLARE _packv uuid; _c uuid;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs pk ON pk.id = ver.pack_id
   WHERE pk.slug = 'vaktare-se' AND ver.pilot_availability = 'open' LIMIT 1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', (SELECT cr FROM rm)::text, true);
  _c := public.scp_iv_create_case((SELECT e FROM rm), 'RM-fall C', _packv, 'Jag själv.',
          (SELECT cr FROM rm), NULL, (SELECT j2 FROM rm), 'e5a00000-4444-4000-8000-0000000000c1');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO icc VALUES (_c);
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP IC-F -- the fixture: case A by a plain member with a panel, case B about an admin, case C by a member about themselves'; END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_cases WHERE employer_id = (SELECT e FROM rm)) = 4
  AND (SELECT created_by FROM public.scp_interview_cases WHERE id = (SELECT case_c FROM icc)) = (SELECT cr FROM rm)
  AND (SELECT candidate_user_id FROM public.scp_interview_cases WHERE id = (SELECT case_c FROM icc)) = (SELECT cr FROM rm),
  'IC-F.1 four cases; case C was opened by cr, whose own application it is about');

-- ── IC0 · reproduction on the pre-fix state ──────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IC0 -- reproduction on the pre-fix state'; END $$;
-- A candidate's correction on case A, planted for the policy checks (a fixture write).
INSERT INTO public.scp_interview_candidate_corrections (case_id, candidate_user_id, what_is_wrong, what_is_correct)
SELECT case_a, (SELECT c1 FROM rm), 'Fel uppgift.', 'Rätt uppgift.' FROM rmc;
INSERT INTO public.scp_interview_candidate_corrections (case_id, candidate_user_id, what_is_wrong, what_is_correct)
SELECT case_b, (SELECT sm FROM rm), 'Fel uppgift B.', 'Rätt uppgift B.' FROM rmc;
SAVEPOINT before_fix;
\ir ../rollback/20270204090000_interview_case_access_model_rollback.sql
SELECT pg_temp.ok(
  pg_temp.can((SELECT pm FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.can((SELECT pm FROM rm), 'scp_iv_can_write_case', (SELECT case_b FROM rmc)) = 'true'
  AND pg_temp.seen((SELECT pm FROM rm)) = '0,A,B,C',
  'IC0.1 PRE-FIX: a PLAIN MEMBER reads and may write every case of the organisation: they see all four rows');
SELECT pg_temp.ok(
  pg_temp.write_as((SELECT pm FROM rm), 'note', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT gw FROM rm), 'source', (SELECT case_a FROM rmc)) = 'ok',
  'IC0.2 PRE-FIX: and writes to a colleague''s case: a session note, a source -- a workforce reviewer too');
SELECT pg_temp.ok(
  pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_read_case', (SELECT case_c FROM icc)) = 'true'
  AND pg_temp.can((SELECT sm FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'true',
  'IC0.3 PRE-FIX: the candidate who is a member reads the case about themselves, the admin the case about the admin');
SELECT pg_temp.ok(
  pg_temp.rows_of((SELECT pm FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '1',
  'IC0.4 PRE-FIX: a plain member reads a candidate''s corrections');
-- Finding a, MEASURED on the pre-fix state: the corrections policy omits bcp_case_access_ok, but its
-- own sub-select reads scp_interview_cases under RLS, and the case row policy already hides a
-- vetting-restricted case from anyone who is not an officer on it. So the omission was not an
-- observable leak; the new policy asks the gate directly and no longer leans on that sub-select.
CREATE TEMP TABLE ic_vet0 (case_id uuid PRIMARY KEY);
GRANT SELECT ON ic_vet0 TO PUBLIC;
CREATE OR REPLACE FUNCTION public.bcp_case_vetting_restricted(_case_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM pg_temp.ic_vet0 v WHERE v.case_id = _case_id); $function$;
INSERT INTO ic_vet0 SELECT case_a FROM rmc;
SELECT pg_temp.ok(
  pg_temp.rows_of((SELECT ow FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT pm FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0'
  AND pg_temp.seen((SELECT ow FROM rm)) = '0,B,C',
  'IC0.6 PRE-FIX, measured: on a vetting-restricted case the corrections were already hidden from the owner and a plain member, because the case row policy hides the case from the policy''s own sub-select (finding a is defence in depth, not an observable leak)');
ROLLBACK TO SAVEPOINT before_fix;
SELECT pg_temp.ok(pg_temp.can((SELECT pm FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false',
  'IC0.5 the savepoint was undone: a plain member does not read case A');

-- ── IC1 · who reads ──────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IC1 -- reading a case'; END $$;
SELECT pg_temp.ok(
  pg_temp.seen((SELECT ow FROM rm)) = '0,A,B,C' AND pg_temp.seen((SELECT ad FROM rm)) = '0,A,B,C',
  'IC1.1 owner and admin see every case');
SELECT pg_temp.ok(
  pg_temp.seen((SELECT cr FROM rm)) = 'A' AND pg_temp.seen((SELECT pn FROM rm)) = 'A',
  'IC1.2 the creator of case A and a member of its panel see case A and nothing else -- not even the case the creator opened about themselves (C)');
SELECT pg_temp.ok(
  pg_temp.seen((SELECT gc FROM rm)) = '0,A,B,C' AND pg_temp.seen((SELECT gr FROM rm)) = '0,A,B,C' AND pg_temp.seen((SELECT gw FROM rm)) = '',
  'IC1.3 a recruitment reviewer (and one with both grants) sees every case: they are recruitment cases; a workforce reviewer sees none');
SELECT pg_temp.ok(
  pg_temp.seen((SELECT r1 FROM rm)) = 'A,B' AND pg_temp.seen((SELECT r2 FROM rm)) = 'C',
  'IC1.4 the responsible recruiter sees the cases of their vacancy: V1''s are A and B, V2''s is C; the case with no vacancy (0) is nobody''s but an owner, admin or reviewer''s');
SELECT pg_temp.ok(
  pg_temp.seen((SELECT pm FROM rm)) = '' AND pg_temp.seen((SELECT su FROM rm)) = '' AND pg_temp.seen((SELECT rv FROM rm)) = ''
  AND pg_temp.seen((SELECT xo FROM rm)) = '' AND pg_temp.seen((SELECT pa FROM rm)) = '' AND pg_temp.seen((SELECT c1 FROM rm)) = '',
  'IC1.5 a plain member, a suspended and a removed admin, another company''s owner, a platform admin and the candidate see no case');
SELECT pg_temp.ok(
  pg_temp.rows_of((SELECT cr FROM rm), format('SELECT 1 FROM public.scp_interview_case_events WHERE case_id = %L', (SELECT case_a FROM rmc))) <> '0'
  AND pg_temp.rows_of((SELECT pn FROM rm), format('SELECT 1 FROM public.scp_interview_session_notes WHERE session_id = %L', (SELECT sess_a FROM rmc))) = '1'
  AND pg_temp.rows_of((SELECT pn FROM rm), format('SELECT 1 FROM public.scp_interview_panels WHERE case_id = %L', (SELECT case_a FROM rmc))) = '1'
  AND pg_temp.rows_of((SELECT pm FROM rm), format('SELECT 1 FROM public.scp_interview_case_events WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT pm FROM rm), format('SELECT 1 FROM public.scp_interview_session_notes WHERE session_id = %L', (SELECT sess_a FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT pm FROM rm), format('SELECT 1 FROM public.scp_interview_panels WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0',
  'IC1.6 the child tables follow: the creator and the panel member read A''s events, notes and panel; a plain member reads none of them');
SELECT pg_temp.ok(
  pg_temp.rows_of((SELECT r1 FROM rm), format('SELECT 1 FROM public.scp_interview_case_events WHERE case_id = %L', (SELECT case_b FROM rmc))) <> '0'
  AND pg_temp.rows_of((SELECT r2 FROM rm), format('SELECT 1 FROM public.scp_interview_case_events WHERE case_id = %L', (SELECT case_b FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT gw FROM rm), format('SELECT 1 FROM public.scp_interview_case_events WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0',
  'IC1.7 V1''s recruiter reads case B''s events, V2''s recruiter does not, a workforce reviewer reads none');
SELECT pg_temp.ok(
  pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'false'
  AND pg_temp.can((SELECT pn FROM rm), 'scp_iv_can_read_case', (SELECT kase FROM rmc)) = 'false'
  AND pg_temp.can((SELECT r1 FROM rm), 'scp_iv_can_read_case', (SELECT kase FROM rmc)) = 'false'
  AND pg_temp.can(NULL, 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'ERR:42501:permission denied for function scp_iv_can_read_case',
  'IC1.8 the gate itself: creator and panel member read their case and not another; a vacancy''s recruiter does not read a case that names no vacancy; logged out is refused outright');
SELECT pg_temp.ok(
  pg_temp.can((SELECT ow FROM rm), 'scp_iv_can_read_case', gen_random_uuid()) = 'false'
  AND pg_temp.as_val((SELECT ow FROM rm), 'SELECT public.scp_iv_can_read_case(NULL)::text') = 'false'
  AND pg_temp.as_val((SELECT ow FROM rm), 'SELECT public.scp_iv_case_row_visible(NULL, NULL)::text') = 'false',
  'IC1.9 an unknown case and NULL are false, never NULL');

-- ── IC2 · who writes ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IC2 -- writing to a case'; END $$;
SELECT pg_temp.ok(
  pg_temp.write_as((SELECT ow FROM rm), 'note', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT cr FROM rm), 'note', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT pn FROM rm), 'note', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT r1 FROM rm), 'note', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT gc FROM rm), 'note', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT sm FROM rm), 'note', (SELECT case_a FROM rmc)) = 'ok',
  'IC2.1 a session note on case A is accepted from the owner, the creator, a panel member, V1''s recruiter, a recruitment reviewer and an admin');
SELECT pg_temp.ok(
  pg_temp.write_as((SELECT pm FROM rm), 'note', (SELECT case_a FROM rmc)) = '42501:new row violates row-level security policy for table "scp_interview_session_notes"'
  AND pg_temp.write_as((SELECT gw FROM rm), 'note', (SELECT case_a FROM rmc)) LIKE '42501:%'
  AND pg_temp.write_as((SELECT r2 FROM rm), 'note', (SELECT case_a FROM rmc)) LIKE '42501:%'
  AND pg_temp.write_as((SELECT su FROM rm), 'note', (SELECT case_a FROM rmc)) LIKE '42501:%'
  AND pg_temp.write_as((SELECT xo FROM rm), 'note', (SELECT case_a FROM rmc)) LIKE '42501:%'
  AND pg_temp.write_as((SELECT pa FROM rm), 'note', (SELECT case_a FROM rmc)) LIKE '42501:%'
  AND pg_temp.write_as(NULL, 'note', (SELECT case_a FROM rmc)) LIKE '42501:%',
  'IC2.2 and is REFUSED to a plain member, a workforce reviewer, V2''s recruiter, a suspended admin, another company''s owner, a platform admin and anon');
SELECT pg_temp.ok(
  pg_temp.write_as((SELECT ow FROM rm), 'source', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT cr FROM rm), 'source', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT pn FROM rm), 'source', (SELECT case_a FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT pm FROM rm), 'source', (SELECT case_a FROM rmc)) = '42501:SCP_IV_NOT_CASE_MEMBER'
  AND pg_temp.write_as((SELECT gw FROM rm), 'source', (SELECT case_a FROM rmc)) = '42501:SCP_IV_NOT_CASE_MEMBER'
  AND pg_temp.write_as((SELECT r2 FROM rm), 'source', (SELECT case_a FROM rmc)) = '42501:SCP_IV_NOT_CASE_MEMBER',
  'IC2.3 the governed function agrees: add_source works for the owner, the creator and the panel, and is refused SCP_IV_NOT_CASE_MEMBER to a plain member, a workforce reviewer and the other vacancy''s recruiter');
SELECT pg_temp.ok(
  pg_temp.write_as((SELECT ow FROM rm), 'panel', (SELECT case_b FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT r1 FROM rm), 'panel', (SELECT case_b FROM rmc)) = 'ok'
  AND pg_temp.write_as((SELECT pm FROM rm), 'panel', (SELECT case_b FROM rmc)) = '42501:SCP_IV_NOT_CASE_MEMBER'
  AND pg_temp.write_as((SELECT cr FROM rm), 'panel', (SELECT case_b FROM rmc)) = '42501:SCP_IV_NOT_CASE_MEMBER'
  AND pg_temp.write_as((SELECT sm FROM rm), 'panel', (SELECT case_b FROM rmc)) = '42501:SCP_IV_NOT_CASE_MEMBER',
  'IC2.4 case B, about the admin sm: the owner and V1''s recruiter may open a panel; a plain member, the creator of ANOTHER case and the admin it is about may not');
SELECT pg_temp.ok(
  pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_write_case', (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.can((SELECT pm FROM rm), 'scp_iv_can_write_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT gw FROM rm), 'scp_iv_can_write_case', (SELECT case_a FROM rmc)) = 'false',
  'IC2.5 the write gate itself');
-- A cancelled case, and one whose retention is not active, are not writable by anybody -- the existing conditions are kept.
UPDATE public.scp_interview_cases SET retention_state = 'restricted' WHERE id = (SELECT case_a FROM rmc);
SELECT pg_temp.ok(
  pg_temp.can((SELECT ow FROM rm), 'scp_iv_can_write_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT ow FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'true',
  'IC2.6 a case whose retention is not active is still readable but no longer writable, by anyone: the existing condition is kept');
UPDATE public.scp_interview_cases SET retention_state = 'active' WHERE id = (SELECT case_a FROM rmc);

-- ── IC3 · the candidate who is a member ──────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IC3 -- the subject of a case'; END $$;
SELECT pg_temp.ok(
  pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_read_case', (SELECT case_c FROM icc)) = 'false'
  AND pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_write_case', (SELECT case_c FROM icc)) = 'false'
  AND pg_temp.write_as((SELECT cr FROM rm), 'panel', (SELECT case_c FROM icc)) = '42501:SCP_IV_NOT_CASE_MEMBER'
  AND pg_temp.rows_of((SELECT cr FROM rm), format('SELECT 1 FROM public.scp_interview_cases WHERE id = %L', (SELECT case_c FROM icc))) = '0',
  'IC3.1 the CREATOR of case C is also its candidate: the subject rule beats the creator basis, for the gate, the write gate, a governed write and the row');
SELECT pg_temp.ok(
  pg_temp.can((SELECT sm FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'false'
  AND pg_temp.can((SELECT sm FROM rm), 'scp_iv_can_write_case', (SELECT case_b FROM rmc)) = 'false'
  AND pg_temp.can((SELECT sm FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'true',
  'IC3.2 an admin who is the candidate of case B reads and writes neither it (the subject rule beats R1), but reads case A');
SELECT pg_temp.ok(
  pg_temp.can((SELECT ow FROM rm), 'scp_iv_can_read_case', (SELECT case_c FROM icc)) = 'true'
  AND pg_temp.can((SELECT r2 FROM rm), 'scp_iv_can_read_case', (SELECT case_c FROM icc)) = 'true',
  'IC3.3 the owner and V2''s recruiter read case C: only the subject is excluded');

-- ── IC4 · the panel ──────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IC4 -- the panel'; END $$;
SELECT pg_temp.ok(pg_temp.can((SELECT gw FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'false',
  'IC4.1 a workforce reviewer does not read case B');
CREATE TEMP TABLE ic4 (k text PRIMARY KEY, v text);
INSERT INTO ic4 VALUES ('open', pg_temp.as_val((SELECT ow FROM rm),
  format('SELECT public.scp_iv_panel_open(%L, ARRAY[%L, %L]::uuid[])::text', (SELECT case_b FROM rmc), (SELECT gw FROM rm), (SELECT ow FROM rm))));
SELECT pg_temp.ok((SELECT v FROM ic4 WHERE k = 'open') NOT LIKE 'ERR:%'
  AND pg_temp.can((SELECT gw FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'true'
  AND pg_temp.can((SELECT gw FROM rm), 'scp_iv_can_write_case', (SELECT case_b FROM rmc)) = 'true'
  AND pg_temp.can((SELECT gw FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false',
  'IC4.2 the owner puts gw on case B''s panel: gw reads and writes case B at once, and still not case A');
SELECT pg_temp.set_status((SELECT gw FROM rm), 'suspended');
SELECT pg_temp.ok(pg_temp.can((SELECT gw FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'false'
  AND pg_temp.seen((SELECT gw FROM rm)) = '',
  'IC4.3 suspended, they lose the case with their standing');
SELECT pg_temp.set_status((SELECT gw FROM rm), 'active');
SELECT pg_temp.ok(pg_temp.can((SELECT gw FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'true',
  'IC4.4 (recorded, deliberate) reactivated by the platform admin, they are still on the panel and read case B again: a panel seat is a case assignment, not an organisation-wide grant (reviewer grants are the ones revoked)');
INSERT INTO ic4 VALUES ('foreign', pg_temp.as_val((SELECT ow FROM rm),
  format('SELECT public.scp_iv_panel_open(%L, ARRAY[%L, %L]::uuid[])::text', (SELECT case_b FROM rmc), (SELECT xo FROM rm), (SELECT ow FROM rm))));
SELECT pg_temp.ok((SELECT v FROM ic4 WHERE k = 'foreign') LIKE 'ERR:42501:SCP_IV_PANEL_MEMBER_NOT_EMPLOYER%',
  'IC4.5 only a member of the organisation can be put on a panel (existing rule, unchanged)');

-- ── IC5 · the security-vetting restriction is additive ───────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IC5 -- vetting-restricted cases (through the test seam)'; END $$;
CREATE TEMP TABLE ic_vet (case_id uuid PRIMARY KEY);
GRANT SELECT ON ic_vet TO PUBLIC;
-- The seam: the same function, with the restriction read from a temp table.
CREATE OR REPLACE FUNCTION public.bcp_case_vetting_restricted(_case_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM pg_temp.ic_vet v WHERE v.case_id = _case_id); $function$;
-- A security officer who is a plain member with no basis (pm), and one who is also on case A's panel (pn).
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', (SELECT ow FROM rm)::text, true);
  PERFORM public.bcp_appoint_security_officer(gen_random_uuid(), (SELECT e FROM rm), (SELECT pm FROM rm), 'Syntetisk säkerhetsskyddschef');
  PERFORM public.bcp_appoint_security_officer(gen_random_uuid(), (SELECT e FROM rm), (SELECT pn FROM rm), 'Syntetisk säkerhetsskyddschef två');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(
  public.bcp_is_security_officer((SELECT e FROM rm), (SELECT pm FROM rm)) AND public.bcp_is_security_officer((SELECT e FROM rm), (SELECT pn FROM rm))
  AND NOT public.bcp_is_security_officer((SELECT e FROM rm), (SELECT ow FROM rm)),
  'IC5.0 pm and pn are appointed security officers; the owner is not');
-- Not restricted yet: the officers change nothing.
SELECT pg_temp.ok(
  pg_temp.can((SELECT pm FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT pn FROM rm), 'scp_iv_can_read_case', (SELECT case_b FROM rmc)) = 'false',
  'IC5.1 being a security officer is not a basis in itself: an officer with no basis reads no (unrestricted) case');
INSERT INTO ic_vet SELECT case_a FROM rmc;
SELECT pg_temp.ok(
  pg_temp.can((SELECT ow FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT ad FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT gr FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT r1 FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.can((SELECT pm FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false',
  'IC5.2 case A made vetting-restricted: the owner, the admin, the creator, a reviewer, V1''s recruiter and an officer WITHOUT a basis are all refused (the restriction narrows every basis; an appointment does not widen)');
SELECT pg_temp.ok(
  pg_temp.can((SELECT pn FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.can((SELECT pn FROM rm), 'scp_iv_can_write_case', (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.seen((SELECT pn FROM rm)) = 'A',
  'IC5.3 the security officer who is also on the panel reads and writes the restricted case: both conditions hold');
SELECT pg_temp.ok(
  pg_temp.seen((SELECT ow FROM rm)) = '0,B,C' AND pg_temp.seen((SELECT cr FROM rm)) = '' AND pg_temp.seen((SELECT r1 FROM rm)) = 'B'
  AND pg_temp.write_as((SELECT ow FROM rm), 'note', (SELECT case_a FROM rmc)) LIKE '42501:%'
  AND pg_temp.write_as((SELECT cr FROM rm), 'source', (SELECT case_a FROM rmc)) = '42501:SCP_IV_NOT_CASE_MEMBER'
  AND pg_temp.rows_of((SELECT ow FROM rm), format('SELECT 1 FROM public.scp_interview_case_events WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0',
  'IC5.4 the row, the writes and the child tables follow: the owner no longer sees A, its events, or writes to it; the creator no longer sees it');
-- Finding a: a candidate's corrections on the restricted case.
SELECT pg_temp.ok(
  pg_temp.rows_of((SELECT ow FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT ad FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT cr FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT pm FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT pn FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '1',
  'IC5.5 finding a: the candidate''s corrections on the restricted case are read by the officer on the case only -- not by the owner, the admin, the creator or an officer without a basis (the policy now asks the gate itself)');
SELECT pg_temp.ok(
  pg_temp.rows_of((SELECT c1 FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '1',
  'IC5.6 the candidate still reads their own corrections (their own policy is untouched)');
-- The unrestricted case B: corrections follow the model.
SELECT pg_temp.ok(
  pg_temp.rows_of((SELECT ow FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_b FROM rmc))) = '1'
  AND pg_temp.rows_of((SELECT r1 FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_b FROM rmc))) = '1'
  AND pg_temp.rows_of((SELECT pm FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_b FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT r2 FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_b FROM rmc))) = '0'
  AND pg_temp.rows_of((SELECT sm FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_b FROM rmc))) = '1',
  'IC5.7 on an unrestricted case corrections are read by the owner and V1''s recruiter, not by a plain member or V2''s recruiter -- and the candidate (an admin, sm) reads their own through the candidate policy');
DELETE FROM ic_vet;
SELECT pg_temp.ok(
  pg_temp.can((SELECT ow FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.can((SELECT cr FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.rows_of((SELECT cr FROM rm), format('SELECT 1 FROM public.scp_interview_candidate_corrections WHERE case_id = %L', (SELECT case_a FROM rmc))) = '1',
  'IC5.8 un-restricted, the case and its corrections are back for the owner and the creator');
-- Revoking the appointment removes the officer's half.
INSERT INTO ic_vet SELECT case_a FROM rmc;
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', (SELECT ow FROM rm)::text, true);
  PERFORM public.bcp_revoke_security_officer(gen_random_uuid(),
    (SELECT id FROM public.bcp_security_officers WHERE user_id = (SELECT pn FROM rm) AND revoked_at IS NULL), 'Syntetiskt återkallande');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.can((SELECT pn FROM rm), 'scp_iv_can_read_case', (SELECT case_a FROM rmc)) = 'false',
  'IC5.9 revoking the appointment removes the officer''s half: the panel member no longer reads the restricted case');
DELETE FROM ic_vet;

-- ── IC6 · grants and posture ─────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP IC6 -- grants and posture'; END $$;
SELECT pg_temp.ok(
  (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   AND p.prosecdef AND p.proconfig IS NOT NULL)
     FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('scp_iv_can_read_case', 'scp_iv_can_write_case', 'scp_iv_case_row_visible')),
  'IC6.1 the three gates keep their grants (authenticated, not anon) and stay SECURITY DEFINER with a pinned search_path');
SELECT pg_temp.ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND policyname = 'scp_iv_corrections_employer') ~ 'scp_iv_can_read_case\(case_id\)'
  AND (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND policyname = 'scp_interview_cases_read') ~ 'scp_iv_case_row_visible',
  'IC6.2 the corrections policy asks the case gate (and so bcp_case_access_ok); the case row policy asks the row gate');
SELECT pg_temp.ok(
  position('bcp_case_access_ok' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_can_read_case(uuid)'::regprocedure)) > 0
  AND position('bcp_case_access_ok' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_can_write_case(uuid)'::regprocedure)) > 0
  AND position('bcp_case_vetting_restricted' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_case_row_visible(uuid,uuid)'::regprocedure)) > 0,
  'IC6.3 bcp_case_access_ok is still in both case gates, and the row gate still carries the vetting expression');

ROLLBACK;
