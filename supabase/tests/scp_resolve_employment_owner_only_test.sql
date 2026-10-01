-- P1 2026-10-01 (20261231090000): only the assignment path may bind an
-- employment record to a person. Proved as the real roles; one transaction,
-- ends in ROLLBACK. All records are synthetic.
--
--   RB0  reproduction: on the pre-fix grant (the real rollback, inside a
--        savepoint) a signed-in user with no membership binds another
--        employer's employee record to their own subject, permanently
--   RB1  after the fix the same call is refused, and nothing is bound
--   RB2  the real path still binds: an employer assigning by email alone
--   RB3  privileges: owner-only helper, every caller runs as its owner

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.denied(stmt text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  % (refused: %)', label, SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- statement was ACCEPTED', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.denied(text, text) TO PUBLIC;

-- ── Fixture ──────────────────────────────────────────────────────────────
--   owner     owner of the employer
--   person    the real employee, who has an account
--   attacker  a signed-in user with no membership anywhere
INSERT INTO auth.users (id, email) VALUES
  ('a8000000-0000-4000-8000-000000000001', 'rb-owner@synthetic.test'),
  ('a8000000-0000-4000-8000-000000000002', 'rb-person@synthetic.test'),
  ('a8000000-0000-4000-8000-000000000003', 'rb-attacker@synthetic.test');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b8000000-0000-4000-8000-000000000001', 'RB Bevakning', 'rb-bevakning', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'owner', 'active');
INSERT INTO public.scp_test_grants (employer_id, purpose, reason, authorised_by) VALUES
  ('b8000000-0000-4000-8000-000000000001', 'closed_test', 'binding fixture', 'a8000000-0000-4000-8000-000000000001');
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by) VALUES
  ('e8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
   'Riktig', 'Anställd', 'rb-person@synthetic.test', 'active', 'a8000000-0000-4000-8000-000000000001');
-- The attacker's own professional subject.
INSERT INTO public.scp_subjects (id) VALUES ('c8000000-0000-4000-8000-000000000003');
INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('c8000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000003');

SELECT av.id AS avid FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-situational-awareness' LIMIT 1 \gset

-- ── RB0 · reproduction on the pre-fix grant ─────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RB0 -- reproduction on the pre-fix grant'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20261231090000_scp_resolve_employment_owner_only_rollback.sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(
  public.scp_resolve_employment_for_assignment(
    'b8000000-0000-4000-8000-000000000001', 'rb-person@synthetic.test',
    'c8000000-0000-4000-8000-000000000003') = 'e8000000-0000-4000-8000-000000000001',
  'RB0.1 PRE-FIX: a user with no membership binds another employer''s employee record');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT subject_id = 'c8000000-0000-4000-8000-000000000003' FROM public.employees
    WHERE id = 'e8000000-0000-4000-8000-000000000001'),
  'RB0.2 PRE-FIX: the record now belongs to the attacker''s subject');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE rb_pre AS
SELECT * FROM public.scp_employer_assign(
  'b8000000-0000-4000-8000-000000000001'::uuid, :'avid'::uuid,
  'rb-person@synthetic.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT e.subject_id IS DISTINCT FROM r.subject_id FROM public.employees e, rb_pre r
    WHERE e.id = 'e8000000-0000-4000-8000-000000000001'),
  'RB0.3 PRE-FIX: the real employee can no longer be linked to their own record');
ROLLBACK TO SAVEPOINT before_fix;
SELECT pg_temp.ok(
  (SELECT subject_id IS NULL FROM public.employees WHERE id = 'e8000000-0000-4000-8000-000000000001'),
  'RB0.4 the reproduction left nothing behind');

-- ── RB1 · after the fix ─────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RB1 -- the helper is not a client entry point'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000003';
SELECT pg_temp.denied(
  $q$SELECT public.scp_resolve_employment_for_assignment(
       'b8000000-0000-4000-8000-000000000001', 'rb-person@synthetic.test',
       'c8000000-0000-4000-8000-000000000003')$q$,
  'RB1.1 a user with no membership is refused');
SET LOCAL request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
SELECT pg_temp.denied(
  $q$SELECT public.scp_resolve_employment_for_assignment(
       'b8000000-0000-4000-8000-000000000001', 'rb-person@synthetic.test',
       'c8000000-0000-4000-8000-000000000003')$q$,
  'RB1.2 even the employer''s own owner cannot call it directly (it trusts its arguments)');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE anon;
SELECT pg_temp.denied(
  $q$SELECT public.scp_resolve_employment_for_assignment(
       'b8000000-0000-4000-8000-000000000001', 'rb-person@synthetic.test',
       'c8000000-0000-4000-8000-000000000003')$q$,
  'RB1.3 anon is refused');
RESET ROLE;
SELECT pg_temp.ok(
  (SELECT subject_id IS NULL FROM public.employees WHERE id = 'e8000000-0000-4000-8000-000000000001'),
  'RB1.4 nothing was bound');

-- ── RB2 · the real path still binds ─────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RB2 -- the real assignment path still binds'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE rb_post AS
SELECT * FROM public.scp_employer_assign(
  'b8000000-0000-4000-8000-000000000001'::uuid, :'avid'::uuid,
  'rb-person@synthetic.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT e.subject_id = r.subject_id FROM public.employees e, rb_post r
    WHERE e.id = 'e8000000-0000-4000-8000-000000000001'),
  'RB2.1 the employer assigning by email alone binds the record to the person it assigned');
SELECT pg_temp.ok(
  (SELECT r.subject_id <> 'c8000000-0000-4000-8000-000000000003' FROM rb_post r),
  'RB2.2 and that person is not the attacker');

-- ── RB3 · privileges ────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RB3 -- privileges'; END $$;
SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated', 'public.scp_resolve_employment_for_assignment(uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_resolve_employment_for_assignment(uuid,text,uuid)', 'EXECUTE'),
  'RB3.1 no client role may execute the helper');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p
               WHERE p.proname <> 'scp_resolve_employment_for_assignment'
                 AND p.prosrc LIKE '%scp_resolve_employment_for_assignment%'
                 AND NOT (p.prosecdef AND p.proowner = (SELECT proowner FROM pg_proc
                   WHERE oid = 'public.scp_resolve_employment_for_assignment(uuid,text,uuid)'::regprocedure))),
  'RB3.2 every caller runs as the helper''s owner');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p
    WHERE p.proname <> 'scp_resolve_employment_for_assignment'
      AND p.prosrc LIKE '%scp_resolve_employment_for_assignment%') >= 2,
  'RB3.3 both callers are present (assignment and hire)');

ROLLBACK;
