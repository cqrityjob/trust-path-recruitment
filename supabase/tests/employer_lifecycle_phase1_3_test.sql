-- The employer lifecycle, phases 1–3: the two database rules behind them.
--
-- Both are asserted by EXECUTING the thing, never by reading a policy string:
-- a policy that says the right words and a database that refuses the wrong
-- write are different claims, and only the second one protects anybody.
--
--   W · WORKFORCE RECORDS BELONG TO AN APPROVED ORGANISATION (20261205090000)
--       A pending or draft organisation keeps its job drafts and may not
--       create an employment record — through the portal, and through
--       service_role, which RLS does not constrain.
--
--   D · ASSIGNING DEVELOPMENT KEEPS THE PERSON (20261206090000)
--       scp_assign_training takes the employment record the activity is about,
--       checks it belongs to the caller's organisation, and binds it to the
--       resolved subject when — and only when — it carries none.
--
-- Training never becomes evidence of competence. That boundary is data, and it
-- is asserted where the data lives: scp_content_library_test.sql L4.5 proves
-- training_completion.counts_toward_maturity is false and that flipping it
-- changes a computed maturity. Nothing here weakens it.
--
-- One transaction, ends in ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

-- ---------------------------------------------------------------------------
-- Fixture
--
-- Four organisations, because the rule is about STATUS and one organisation
-- cannot be four statuses at once: pending, draft, archived and active. One
-- owner in each, two learners with real accounts, and one employment record in
-- the active organisation that starts life unbound — which is the majority
-- case in production and the one the binding exists for.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE elf AS
SELECT
  'e1f00000-1111-0000-0000-00000000000a'::uuid AS employer_active,
  'e1f00000-1111-0000-0000-00000000000b'::uuid AS employer_pending,
  'e1f00000-1111-0000-0000-00000000000c'::uuid AS employer_draft,
  'e1f00000-1111-0000-0000-00000000000d'::uuid AS employer_archived,
  'e1f00000-1111-0000-0000-00000000000e'::uuid AS employer_other,
  'e1f00000-0000-0000-0000-00000000000a'::uuid AS owner_active,
  'e1f00000-0000-0000-0000-00000000000b'::uuid AS owner_pending,
  'e1f00000-0000-0000-0000-00000000000c'::uuid AS owner_draft,
  'e1f00000-0000-0000-0000-00000000000d'::uuid AS owner_archived,
  'e1f00000-0000-0000-0000-00000000000e'::uuid AS owner_other,
  'e1f00000-0000-0000-0000-00000000000f'::uuid AS member_active,
  'e1f00000-2222-0000-0000-000000000001'::uuid AS learner,
  'e1f00000-2222-0000-0000-000000000002'::uuid AS other_learner,
  'e1f00000-3333-0000-0000-000000000001'::uuid AS employee_unbound,
  'e1f00000-3333-0000-0000-000000000002'::uuid AS employee_bound_elsewhere,
  'e1f00000-3333-0000-0000-000000000003'::uuid AS employee_other_org;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_active   FROM elf), 'owner-active@lifecycle.test'),
  ((SELECT owner_pending  FROM elf), 'owner-pending@lifecycle.test'),
  ((SELECT owner_draft    FROM elf), 'owner-draft@lifecycle.test'),
  ((SELECT owner_archived FROM elf), 'owner-archived@lifecycle.test'),
  ((SELECT owner_other    FROM elf), 'owner-other@lifecycle.test'),
  ((SELECT member_active  FROM elf), 'member-active@lifecycle.test'),
  ((SELECT learner        FROM elf), 'learner@lifecycle.test'),
  ((SELECT other_learner  FROM elf), 'other-learner@lifecycle.test');

-- The archived organisation is created active and archived afterwards: its own
-- INSERT would otherwise be refused by the operational guard, which is the
-- rule the older half of this suite is about.
INSERT INTO public.employers (id, name, slug, status) VALUES
  ((SELECT employer_active   FROM elf), 'Lifecycle Aktiv AB',   'lifecycle-aktiv',   'active'),
  ((SELECT employer_pending  FROM elf), 'Lifecycle Vantande AB','lifecycle-vantande','pending'),
  ((SELECT employer_draft    FROM elf), 'Lifecycle Utkast AB',  'lifecycle-utkast',  'draft'),
  ((SELECT employer_archived FROM elf), 'Lifecycle Arkiv AB',   'lifecycle-arkiv',   'active'),
  ((SELECT employer_other    FROM elf), 'Lifecycle Annan AB',   'lifecycle-annan',   'active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer_active,   owner_active,   'owner',  'active' FROM elf
UNION ALL SELECT employer_active,   member_active,  'member', 'active' FROM elf
UNION ALL SELECT employer_pending,  owner_pending,  'owner',  'active' FROM elf
UNION ALL SELECT employer_draft,    owner_draft,    'owner',  'active' FROM elf
UNION ALL SELECT employer_archived, owner_archived, 'owner',  'active' FROM elf
UNION ALL SELECT employer_other,    owner_other,    'owner',  'active' FROM elf;

GRANT SELECT ON elf TO authenticated;

DO $$ BEGIN RAISE NOTICE 'GROUP W — workforce records belong to an approved organisation'; END $$;

-- =========================================================================
-- W · The write rule
-- =========================================================================

-- The owner of a PENDING organisation, acting through the portal's own role.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000b';

SELECT pg_temp.must_fail(format(
  $f$INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
     VALUES (%L, 'Ska', 'Refuseras', %L)$f$,
  (SELECT employer_pending FROM elf), (SELECT owner_pending FROM elf)),
  'EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE',
  'W1 a pending organisation cannot create an employment record');

-- And the thing the Product Owner deliberately kept open. If this ever starts
-- failing, the gate has been drawn in the wrong place: a new owner must be
-- able to prepare an advertisement while the organisation is reviewed.
INSERT INTO public.jobs (employer_id, slug, short_id, title_sv, title_en, status, application_method)
SELECT employer_pending, 'lifecycle-pending-draft', 'lcpend0001', 'Vaktare', 'Guard', 'draft', 'internal'
  FROM elf;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs j, elf
    WHERE j.employer_id = elf.employer_pending AND j.status = 'draft') = 1,
  'W2 and the same pending organisation CAN still create a job draft');

RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000c';
SELECT pg_temp.must_fail(format(
  $f$INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
     VALUES (%L, 'Ska', 'Refuseras', %L)$f$,
  (SELECT employer_draft FROM elf), (SELECT owner_draft FROM elf)),
  'EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE',
  'W3 a draft organisation cannot either');
RESET ROLE; RESET request.jwt.claim.sub;

-- The archived organisation keeps the OLDER refusal, with the older code. The
-- admin lifecycle suite asserts that code; this proves the new rule did not
-- quietly take it over and change what an operator reads.
UPDATE public.employers SET status = 'archived'
 WHERE id = (SELECT employer_archived FROM elf);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000d';
SELECT pg_temp.must_fail(format(
  $f$INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
     VALUES (%L, 'Ska', 'Refuseras', %L)$f$,
  (SELECT employer_archived FROM elf), (SELECT owner_archived FROM elf)),
  'EMPLOYER_NOT_OPERATIONAL',
  'W4 an archived organisation still reports EMPLOYER_NOT_OPERATIONAL');
RESET ROLE; RESET request.jwt.claim.sub;

-- THE ONE THAT MATTERS MOST.
--
-- service_role carries BYPASSRLS, exactly as it does on Supabase, so the
-- policy above is invisible to it. If the rule lived only in RLS, an import
-- script, an edge function or a platform tool would do what the product
-- refuses -- and the owner asked for the rule to be enforced server-side, not
-- merely on a disabled button.
SET LOCAL ROLE service_role;
SELECT pg_temp.must_fail(format(
  $f$INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
     VALUES (%L, 'Import', 'Refuseras', %L)$f$,
  (SELECT employer_pending FROM elf), (SELECT owner_pending FROM elf)),
  'EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE',
  'W5 service_role, which RLS does not constrain, is refused as well');
RESET ROLE;

-- The permitted half, from the same seat that was just refused.
UPDATE public.employers SET status = 'active'
 WHERE id = (SELECT employer_pending FROM elf);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000b';
INSERT INTO public.employees (employer_id, first_name, last_name, created_by)
SELECT employer_pending, 'Nu', 'Tillaten', owner_pending FROM elf;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employees e, elf
    WHERE e.employer_id = elf.employer_pending) = 1,
  'W6 once approved, the same owner may create the record that was refused');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policy pol
    WHERE pol.polrelid = 'public.employees'::regclass
      AND pol.polname IN ('employees_employer_select', 'employees_employer_update')) = 2,
  'W7 reading and correcting existing records is untouched');

DO $$ BEGIN RAISE NOTICE 'GROUP D — assigning development keeps the person'; END $$;

-- =========================================================================
-- D · The person travels with the assignment
-- =========================================================================

-- Three employment records in the active organisation: one unbound (the
-- production majority), one already bound to somebody else, and one belonging
-- to a different organisation entirely.
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, created_by)
SELECT employee_unbound, employer_active, 'Olle', 'Obunden', 'learner@lifecycle.test', owner_active FROM elf
UNION ALL
SELECT employee_other_org, employer_other, 'Annan', 'Organisation', 'other-learner@lifecycle.test', owner_other FROM elf;

-- The already-bound one gets a subject that is NOT the learner's, which is
-- what makes "never rebound" testable rather than merely stated.
INSERT INTO public.scp_subjects DEFAULT VALUES;
CREATE TEMP TABLE elf_foreign_subject AS
SELECT id AS subject FROM public.scp_subjects ORDER BY created_at DESC LIMIT 1;

INSERT INTO public.employees (id, employer_id, first_name, last_name, email, created_by, subject_id)
SELECT employee_bound_elsewhere, employer_active, 'Bunden', 'Redan',
       'other-learner@lifecycle.test', owner_active, (SELECT subject FROM elf_foreign_subject)
  FROM elf;

-- An assignable programme, on the same terms the training journey suite uses:
-- scaffolding content needs deliberate fixture access, and without it the
-- assignment is correctly refused for a reason that has nothing to do with
-- this suite.
INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
SELECT employer_active, 'Employer lifecycle phase 1-3 suite', owner_active FROM elf;

CREATE TEMP TABLE elf_prog AS
SELECT pv.id AS program_version_id
  FROM public.scp_program_versions pv
  JOIN public.scp_programs p ON p.id = pv.program_id
 WHERE p.slug = 'internal-dev-exercise-situational-reporting';

SELECT pg_temp.ok((SELECT count(*) FROM elf_prog) = 1,
  'D0 an assignable development programme version exists');

GRANT SELECT ON elf_prog, elf_foreign_subject TO authenticated;

-- ── D1 · one definition, so a named-argument call is unambiguous ──────────
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_assign_training') = 1,
  'D1 exactly one scp_assign_training definition exists');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000a';

-- ── D2 · an employment record from another organisation is refused ────────
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L, %L, NULL, NULL, NULL, %L)',
  (SELECT employer_active FROM elf), (SELECT program_version_id FROM elf_prog),
  'learner@lifecycle.test', 'sv', (SELECT employee_other_org FROM elf)),
  'SCP_EMPLOYEE_NOT_FOUND',
  'D2 an employment record from another organisation is refused');

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_training_assignments ta, elf
    WHERE ta.employer_id = elf.employer_active) = 0,
  'D3 and the refusal wrote nothing');

-- ── D4 · the assignment binds the unbound record ──────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE elf_a1 AS
SELECT * FROM public.scp_assign_training(
  (SELECT employer_active FROM elf),
  (SELECT program_version_id FROM elf_prog),
  'learner@lifecycle.test', 'sv', NULL, NULL, NULL,
  (SELECT employee_unbound FROM elf));
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT e.subject_id FROM public.employees e, elf WHERE e.id = elf.employee_unbound)
    = (SELECT subject_id FROM elf_a1),
  'D4 assigning bound the employment record to the resolved subject');

-- ── D5 · which is what makes the assignment findable on that employee ─────
--
-- The employer read model returns assignments by SUBJECT. Before the binding
-- this query returned the row and nothing could attribute it to the person the
-- employer had been looking at; that silence is the defect, and this is the
-- assertion that it is gone.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE elf_status AS
SELECT * FROM public.scp_employer_training_status((SELECT employer_active FROM elf));
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM elf_status s
     JOIN public.employees e ON e.subject_id = s.subject_id
     JOIN elf ON true
    WHERE e.id = elf.employee_unbound) = 1,
  'D5 the employee''s own page can find the programme just assigned to them');

-- ── D6 · a record that already belongs to somebody else is never rebound ──
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000a';
SELECT public.scp_assign_training(
  (SELECT employer_active FROM elf),
  (SELECT program_version_id FROM elf_prog),
  'learner@lifecycle.test', 'sv', NULL, NULL, NULL,
  (SELECT employee_bound_elsewhere FROM elf));
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT e.subject_id FROM public.employees e, elf WHERE e.id = elf.employee_bound_elsewhere)
    = (SELECT subject FROM elf_foreign_subject),
  'D6 an employment record already bound to somebody else keeps its subject');

-- ── D7 · the old contract still holds ─────────────────────────────────────
--
-- Every existing caller passes seven arguments. If this ever fails, the
-- migration changed the meaning of a call it promised not to touch.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE elf_a2 AS
SELECT * FROM public.scp_assign_training(
  (SELECT employer_active FROM elf),
  (SELECT program_version_id FROM elf_prog),
  'other-learner@lifecycle.test');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM elf_a2 WHERE assignment_id IS NOT NULL AND subject_id IS NOT NULL) = 1,
  'D7 a seven-argument call still assigns exactly as it did');

-- ── D8 · assigning is still owner/admin, and still tenancy-scoped ─────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1f00000-0000-0000-0000-00000000000f';  -- plain member
SELECT pg_temp.must_fail(format(
  'SELECT public.scp_assign_training(%L, %L, %L, %L, NULL, NULL, NULL, %L)',
  (SELECT employer_active FROM elf), (SELECT program_version_id FROM elf_prog),
  'learner@lifecycle.test', 'sv', (SELECT employee_unbound FROM elf)),
  'SCP_NOT_AUTHORISED_TO_ASSIGN',
  'D8 a plain member still cannot assign, employee context or not');
RESET ROLE; RESET request.jwt.claim.sub;

-- ── D9 · anon cannot reach the writer at all ──────────────────────────────
SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid,uuid)', 'EXECUTE'),
  'D9 anon holds no EXECUTE on the assignment writer');

DO $$ BEGIN RAISE NOTICE 'GROUP E — the lineage Employee 360 reads'; END $$;

-- =========================================================================
-- E · The hired-from link the employee page renders
--
-- The column has existed since 20260903092000 and nothing read it. These two
-- assertions are what stop a later migration from removing the thing the
-- employee page's "Hired from" link is built on.
-- =========================================================================

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'employees'
             AND column_name = 'hired_from_application_id'),
  'E1 employees carries the application it came from');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'employees'
             AND column_name = 'cig_profession_slug'),
  'E2 and the canonical profession the competence section resolves through');

-- An employer member may not write either of them: whose professional history
-- a record belongs to, and which profession it is an instance of, are not
-- employer-editable fields.
SELECT pg_temp.ok(
  NOT has_column_privilege('authenticated', 'public.employees', 'subject_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.employees', 'hired_from_application_id', 'INSERT'),
  'E3 identity and lineage stay behind the governed functions');

ROLLBACK;
