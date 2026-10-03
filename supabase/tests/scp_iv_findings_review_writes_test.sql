-- P1-C (20270116090000): only an owner or admin reviews an interview finding,
-- only its review fields, and the database records who did it.
--
--   FR-F the fixture: one Interview Intelligence case of employer E with two
--        findings, a contradiction (open) and a verification
--        (needs_verification). Both are on the report's unresolved list.
--   FR0  REPRODUCTION. Inside a savepoint the pre-fix grants and policy are
--        restored by running the real rollback file. A plain member marks the
--        contradiction 'not_relevant' -- it leaves the unresolved list a
--        finalised report carries -- rewrites the other finding's statement,
--        and attributes the review to the owner. Rolled back.
--   FR1  a plain member can do none of it: the review columns update no row,
--        and the other columns are not writable at all. The unresolved list
--        is unchanged.
--   FR2  an owner and an admin review a finding (resolution, human state,
--        note); the database stamps each as the reviewer, now. Neither can
--        rewrite the statement, kind, class or attribution.
--   FR3  another employer's owner updates nothing; anon holds no UPDATE.
--   FR4  the policy holds alone: with table-level UPDATE restored, a plain
--        member still updates nothing.
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

-- Run one statement as a principal (authenticated role, or anon when _uid is
-- NULL). Returns 'ok:<rows>' or 'err:<SQLSTATE>'.
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _n bigint; _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid, ''), true);
  IF _uid IS NULL THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _r := 'ok:' || _n;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

CREATE TEMP TABLE fx(label text PRIMARY KEY, id uuid);
GRANT ALL ON fx TO authenticated, anon;

-- The findings the report lists as unresolved (the predicate of
-- scp_iv_finalise_report and scp_iv_build_report_basis).
CREATE OR REPLACE FUNCTION pg_temp.unresolved() RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM public.scp_interview_findings
   WHERE case_id = (SELECT id FROM fx WHERE label = 'case')
     AND resolution_state IN ('open', 'needs_verification', 'unresolved_difference');
$$;

CREATE OR REPLACE FUNCTION pg_temp.f(_label text) RETURNS public.scp_interview_findings
LANGUAGE sql AS $$
  SELECT * FROM public.scp_interview_findings WHERE id = (SELECT id FROM fx WHERE label = _label);
$$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- o owner of E; ad admin of E; m plain member of E; x owner of another employer.
INSERT INTO auth.users (id, email) VALUES
  ('0f110000-0000-4000-8000-000000000001', 'fr-owner@test.invalid'),
  ('0f110000-0000-4000-8000-000000000002', 'fr-admin@test.invalid'),
  ('0f110000-0000-4000-8000-000000000003', 'fr-member@test.invalid'),
  ('0f110000-0000-4000-8000-000000000009', 'fr-other-owner@test.invalid');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f110000-1111-4000-8000-000000000001', 'FR Employer', 'fr-employer', 'active'),
  ('0f110000-1111-4000-8000-000000000009', 'FR Other Employer', 'fr-other-employer', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f110000-1111-4000-8000-000000000001', '0f110000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('0f110000-1111-4000-8000-000000000001', '0f110000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('0f110000-1111-4000-8000-000000000001', '0f110000-0000-4000-8000-000000000003', 'member', 'active'),
  ('0f110000-1111-4000-8000-000000000009', '0f110000-0000-4000-8000-000000000009', 'owner', 'active');
-- The member's BASIS for working the case: a recruitment reviewer grant (membership alone gives none
-- since 20270203090000/20270204090000). What this suite proves is that, with a basis, writing
-- the review of a finding is still the owner's and the admin's.
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
VALUES ('0f110000-1111-4000-8000-000000000001', '0f110000-0000-4000-8000-000000000003', ARRAY['recruitment']::text[],
        '0f110000-0000-4000-8000-000000000001');

-- The case, created by the owner on the openly available Vaktare pack. The two
-- findings are written as the table owner, as scp_iv_record_findings (a
-- SECURITY DEFINER insert) would write an AI run's output.
DO $$
DECLARE _packv uuid; _case uuid; _f1 uuid; _f2 uuid;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'vaktare-se' AND ver.pilot_availability = 'open' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '0f110000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  _case := public.scp_iv_create_case('0f110000-1111-4000-8000-000000000001', 'Fynd', _packv, 'Kandidat F.', NULL, 'EXT-FR-1');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.scp_interview_findings (case_id, finding_kind, statement, rationale, claim_class)
  VALUES (_case, 'contradiction', 'CV och referens anger olika slutdatum hos förra arbetsgivaren.', 'Två källor.', 'ai_inference')
  RETURNING id INTO _f1;
  INSERT INTO public.scp_interview_findings (case_id, finding_kind, statement, rationale, claim_class, resolution_state)
  VALUES (_case, 'verification', 'Ordningsvaktsförordnandet behöver kontrolleras mot original.', 'Krav i paketet.', 'governed_content', 'needs_verification')
  RETURNING id INTO _f2;
  INSERT INTO fx VALUES ('case', _case), ('f1', _f1), ('f2', _f2);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.upd(_label text, _set text) RETURNS text
LANGUAGE sql AS $$
  SELECT format('UPDATE public.scp_interview_findings SET %s WHERE id = %L', _set, (SELECT id FROM fx WHERE label = _label));
$$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP FR-F — two findings on the report''s unresolved list'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.unresolved() = 2
                  AND (pg_temp.f('f1')).human_actor_id IS NULL AND (pg_temp.f('f2')).human_actor_id IS NULL,
  'FR-F.1 both findings are unresolved and unreviewed');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP FR0 — reproduction: a plain member settles and rewrites findings'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20270116090000_scp_iv_findings_review_writes_rollback.sql
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f1', 'resolution_state = ''not_relevant''')) = 'ok:1'
  AND pg_temp.unresolved() = 1,
  'FR0.1 PRE-FIX: a plain member marks the contradiction not relevant and it leaves the unresolved list');
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f2', 'statement = ''Inget att kontrollera.''')) = 'ok:1',
  'FR0.2 PRE-FIX: and rewrites the other finding''s recorded statement');
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000003',
    pg_temp.upd('f1', 'human_actor_id = ''0f110000-0000-4000-8000-000000000001'', human_state = ''confirmed''')) = 'ok:1'
  AND (pg_temp.f('f1')).human_actor_id = '0f110000-0000-4000-8000-000000000001',
  'FR0.3 PRE-FIX: and attributes the review to the owner');
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP FR1 — a plain member can do none of it'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f1', 'resolution_state = ''not_relevant''')) = 'ok:0',
  'FR1.1 a plain member''s resolution update touches no row');
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f1', 'human_state = ''rejected'', human_note = ''x''')) = 'ok:0',
  'FR1.2 nor does a human-state or note update');
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f2', 'statement = ''Inget att kontrollera.''')) = 'err:42501'
  AND pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f2', 'finding_kind = ''gap''')) = 'err:42501'
  AND pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f1', 'human_actor_id = ''0f110000-0000-4000-8000-000000000001''')) = 'err:42501',
  'FR1.3 statement, kind and attribution are not writable at all (permission denied)');
SELECT pg_temp.ok(pg_temp.unresolved() = 2
                  AND (pg_temp.f('f2')).statement = 'Ordningsvaktsförordnandet behöver kontrolleras mot original.'
                  AND (pg_temp.f('f1')).human_actor_id IS NULL AND (pg_temp.f('f1')).human_state = 'proposed',
  'FR1.4 both findings are exactly as recorded');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP FR2 — owner and admin review; the database records who'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000001',
    pg_temp.upd('f1', 'resolution_state = ''resolved'', human_state = ''confirmed'', human_note = ''Slutdatum bekräftat med referensen.''')) = 'ok:1',
  'FR2.1 the owner reviews the contradiction');
SELECT pg_temp.ok((pg_temp.f('f1')).human_actor_id = '0f110000-0000-4000-8000-000000000001'
                  AND (pg_temp.f('f1')).human_actor_at IS NOT NULL
                  AND (pg_temp.f('f1')).resolution_state = 'resolved' AND pg_temp.unresolved() = 1,
  'FR2.2 the database records the owner as reviewer, with a time');
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000002',
    pg_temp.upd('f2', 'human_note = ''Original uppvisat.'', resolution_state = ''resolved''')) = 'ok:1'
  AND (pg_temp.f('f2')).human_actor_id = '0f110000-0000-4000-8000-000000000002',
  'FR2.3 an admin reviews the verification and is recorded as its reviewer');
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000001', pg_temp.upd('f2', 'statement = ''x''')) = 'err:42501'
  AND pg_temp.try_as('0f110000-0000-4000-8000-000000000001', pg_temp.upd('f2', 'claim_class = ''ai_inference''')) = 'err:42501'
  AND pg_temp.try_as('0f110000-0000-4000-8000-000000000001', pg_temp.upd('f2', 'human_actor_id = ''0f110000-0000-4000-8000-000000000001''')) = 'err:42501'
  AND pg_temp.try_as('0f110000-0000-4000-8000-000000000001', pg_temp.upd('f2', 'human_actor_at = now() - interval ''1 year''')) = 'err:42501',
  'FR2.4 the owner cannot rewrite the statement, the class or the attribution either');
SELECT pg_temp.ok((pg_temp.f('f2')).human_actor_id = '0f110000-0000-4000-8000-000000000002',
  'FR2.5 the admin''s review stands as recorded');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP FR3 — outsiders'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000009', pg_temp.upd('f1', 'resolution_state = ''open''')) = 'ok:0',
  'FR3.1 another employer''s owner updates nothing');
SELECT pg_temp.ok(
  pg_temp.try_as(NULL, pg_temp.upd('f1', 'resolution_state = ''open''')) = 'err:42501'
  AND NOT has_table_privilege('anon', 'public.scp_interview_findings', 'UPDATE')
  AND NOT has_column_privilege('anon', 'public.scp_interview_findings', 'resolution_state', 'UPDATE'),
  'FR3.2 anon holds no UPDATE');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP FR4 — the policy alone keeps a plain member out'; END $$;
-- =========================================================================
SAVEPOINT grants_back;
GRANT UPDATE ON public.scp_interview_findings TO authenticated;
SELECT pg_temp.ok(
  pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f2', 'resolution_state = ''not_relevant''')) = 'ok:0'
  AND pg_temp.try_as('0f110000-0000-4000-8000-000000000003', pg_temp.upd('f2', 'statement = ''x''')) = 'ok:0',
  'FR4.1 with table-level UPDATE restored, a plain member still updates no row');
ROLLBACK TO SAVEPOINT grants_back;

ROLLBACK;
