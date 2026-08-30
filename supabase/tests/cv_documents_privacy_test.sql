-- CV DOCUMENTS + PROFESSIONAL IDENTITY — privacy, ownership, isolation.
--
-- ── WHAT THIS SUITE IS FOR ─────────────────────────────────────────────
--
-- The unified account release added one surface that reads five products
-- together (the Professional Identity seam) and one table that stores the
-- most disclosive thing a candidate owns (a CV: employer names, dates,
-- credentials). Both are exactly where a boundary quietly stops holding,
-- and neither can be proved by a source-level guard:
--
--   * a guard can assert the seam uses the caller's own client. Only the
--     database can assert that a caller using it learns nothing about
--     anybody else.
--   * a guard can assert no code writes a share token. Only the database
--     can assert that no grant, policy or default privilege lets one
--     person read another's CV.
--
-- ── THE DEFAULT-PRIVILEGE TRAP THIS EXISTS TO CATCH ────────────────────
--
-- This project runs with Supabase's default privileges, under which a NEW
-- table arrives already granted to `anon` and `authenticated` -- INSERT,
-- DELETE and TRUNCATE included, and TRUNCATE is not something RLS
-- constrains. Group B therefore reproduces those defaults and then proves
-- the migration's REVOKE actually took them away. Asserting the policies
-- alone would pass on a table an anonymous visitor could still truncate.
--
-- Runs inside one transaction that is rolled back. Every fixture is
-- synthetic; no real data is read or written.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected error containing "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

-- ── FIXTURES ───────────────────────────────────────────────────────────
--
-- Two candidates who must not see each other, and two recruiters at two
-- different organisations who must not see each other's organisation or
-- either candidate's CV.

INSERT INTO auth.users (id, email) VALUES
  ('cf000001-0000-0000-0000-000000000001', 'anna@example.test'),
  ('cf000002-0000-0000-0000-000000000002', 'bosse@example.test'),
  ('cf000003-0000-0000-0000-000000000003', 'recruiter-a@example.test'),
  ('cf000004-0000-0000-0000-000000000004', 'recruiter-b@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, country, locale) VALUES
  ('cf000001-0000-0000-0000-000000000001', 'Anna Andersson', 'SE', 'sv'),
  ('cf000002-0000-0000-0000-000000000002', 'Bosse Bergman', 'SE', 'sv')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.security_career_profiles (user_id, current_status, years_of_experience) VALUES
  ('cf000001-0000-0000-0000-000000000001', 'working_in_industry', '10+'),
  ('cf000002-0000-0000-0000-000000000002', 'working_in_industry', '1-3')
ON CONFLICT (user_id) DO NOTHING;

-- Two organisations, one recruiter each.
INSERT INTO public.employers (id, name, slug, country, status) VALUES
  ('ef000001-0000-0000-0000-000000000001', 'Org A', 'org-a-cvtest', 'SE', 'active'),
  ('ef000002-0000-0000-0000-000000000002', 'Org B', 'org-b-cvtest', 'SE', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('ef000001-0000-0000-0000-000000000001', 'cf000003-0000-0000-0000-000000000003', 'owner', 'active', now()),
  ('ef000002-0000-0000-0000-000000000002', 'cf000004-0000-0000-0000-000000000004', 'owner', 'active', now())
ON CONFLICT DO NOTHING;

-- Anna's CV. Written as the service role so the fixture exists regardless of
-- whether the owner-insert policy works -- Group A then tests that policy on
-- its own terms rather than assuming it while depending on it.
INSERT INTO public.cv_documents (id, owner_user_id, title, locale, purpose, origin)
VALUES ('11110000-0000-0000-0000-000000000001',
        'cf000001-0000-0000-0000-000000000001',
        'Anna CV', 'sv', 'general', 'factual');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP A — a CV belongs to exactly one person'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cf000001-0000-0000-0000-000000000001', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents) = 1,
  'A1 the owner reads their own CV');

-- The owner may write one, and may write one only for themselves.
INSERT INTO public.cv_documents (owner_user_id, title)
VALUES ('cf000001-0000-0000-0000-000000000001', 'Anna CV 2');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents) = 2,
  'A2 and may create another of their own');

-- The WITH CHECK on INSERT. A policy with USING and no WITH CHECK would
-- permit exactly this, which is why the migration writes four policies
-- rather than one FOR ALL.
SELECT pg_temp.must_fail(
  $$INSERT INTO public.cv_documents (owner_user_id, title)
    VALUES ('cf000002-0000-0000-0000-000000000002', 'planted')$$,
  'row-level security',
  'A3 nobody may create a CV owned by somebody else');

-- The WITH CHECK on UPDATE. Handing your own row to another account is the
-- same disclosure as reading theirs, in the opposite direction.
SELECT pg_temp.must_fail(
  $$UPDATE public.cv_documents
       SET owner_user_id = 'cf000002-0000-0000-0000-000000000002'
     WHERE owner_user_id = 'cf000001-0000-0000-0000-000000000001'$$,
  'row-level security',
  'A4 nor reassign their own CV to somebody else');

-- A CV is a draft of a person's own presentation. Unlike a Passport entry --
-- a record other people act on, which is withdrawn rather than deleted --
-- nobody else has seen this, so deleting it destroys no evidence.
DELETE FROM public.cv_documents WHERE title = 'Anna CV 2';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents) = 1,
  'A5 the owner may delete their own CV');

-- ── The other candidate ────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', 'cf000002-0000-0000-0000-000000000002', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents) = 0,
  'A6 another signed-in candidate sees no CV at all');

-- Naming the row explicitly proves the emptiness above is RLS and not an
-- accident of the fixture: zero rows is what a working policy and a broken
-- query look like alike.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents
    WHERE id = '11110000-0000-0000-0000-000000000001') = 0,
  'A7 not even when they name the exact id');

-- A row they cannot see is a row they cannot change. UPDATE and DELETE match
-- nothing rather than erroring, so the assertion is on the row surviving.
UPDATE public.cv_documents SET title = 'stolen'
 WHERE id = '11110000-0000-0000-0000-000000000001';
DELETE FROM public.cv_documents
 WHERE id = '11110000-0000-0000-0000-000000000001';
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT title FROM public.cv_documents
    WHERE id = '11110000-0000-0000-0000-000000000001') = 'Anna CV',
  'A8 a stranger''s UPDATE and DELETE reach no row');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP B — the Supabase default-privilege trap'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- Reproduce the hosted defaults over this table, then prove the migration's
-- REVOKE holds. Without this, a suite can pass on a table `anon` may still
-- TRUNCATE -- and TRUNCATE is not something RLS constrains at all.

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.cv_documents',
  'permission denied',
  'B1 an anonymous visitor cannot read any CV');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.cv_documents (owner_user_id) VALUES ('cf000001-0000-0000-0000-000000000001')$$,
  'permission denied',
  'B2 nor create one');
SELECT pg_temp.must_fail(
  'DELETE FROM public.cv_documents',
  'permission denied',
  'B3 nor delete one');
SELECT pg_temp.must_fail(
  'TRUNCATE public.cv_documents',
  'permission denied',
  'B4 nor truncate the table — the privilege RLS cannot constrain');
RESET ROLE;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'cv_documents' AND grantee = 'anon'),
  'B5 anon holds no grant of any kind on cv_documents');

SELECT pg_temp.ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cv_documents'::regclass),
  'B6 row-level security is enabled');

-- Four policies, one per verb. A FOR ALL policy cannot express a WITH CHECK
-- that differs from its USING, and reads as one rule when it is four.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cv_documents') = 4,
  'B7 exactly four policies, one per verb');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'cv_documents'
       AND (qual = 'true' OR with_check = 'true')),
  'B8 no policy is unconditional');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP C — no sharing mechanism exists yet'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- The Career Card's public-sharing semantics are deliberately NOT inherited.
-- A Career Card carries three profession matches and an optional first name;
-- a CV carries employment history, employer names, dates and credentials.
-- Those are different disclosures and the second needs an access model
-- designed on purpose -- not one that arrived because the mechanism was
-- already lying around. This group fails the moment one appears without a
-- decision.

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cv_documents'
       AND column_name ~ '(token|public|share|expires|recipient|visibility)'),
  'C1 cv_documents carries no share token, public flag, expiry or recipient');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'cv_documents'
       AND 'anon' = ANY (roles)),
  'C2 and no policy addresses anon');

-- A CV must not become a way to mint verification. The table holds a COPY of
-- what the Passport said, for rendering; it is not, and must never become,
-- a source.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cv_documents'
       AND column_name IN ('assertion_level', 'lifecycle_state', 'verified_at',
                           'verified_by_user_id')),
  'C3 cv_documents carries no verification state of its own');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP D — what the identity seam can and cannot see'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- Every table the Professional Identity seam reads, exercised as the
-- caller. The seam takes no input at all, so there is no identifier to
-- tamper with; what remains to prove is that the tables it reads are
-- owner-scoped underneath it.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cf000002-0000-0000-0000-000000000002', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.security_career_profiles
    WHERE user_id = 'cf000001-0000-0000-0000-000000000001') = 0,
  'D1 one candidate cannot read another''s canonical professional profile');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_experience_periods
    WHERE holder_user_id = 'cf000001-0000-0000-0000-000000000001') = 0,
  'D2 nor their employment history');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_claims
    WHERE holder_user_id = 'cf000001-0000-0000-0000-000000000001') = 0,
  'D3 nor their Passport claims');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_passport_profiles
    WHERE holder_user_id = 'cf000001-0000-0000-0000-000000000001') = 0,
  'D4 nor their Passport profile');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employer_memberships
    WHERE user_id = 'cf000003-0000-0000-0000-000000000003') = 0,
  'D5 nor anybody else''s organisation membership');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP E — one organisation cannot read another'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claim.sub', 'cf000003-0000-0000-0000-000000000003', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employer_memberships) = 1,
  'E1 a recruiter sees only their own membership row');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employer_memberships
    WHERE employer_id = 'ef000002-0000-0000-0000-000000000002') = 0,
  'E2 and nothing about the other organisation''s members');

-- The context switcher is populated from exactly this read. A recruiter who
-- belongs to one organisation can never be offered a second one, because the
-- database never returns it.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employers
    WHERE id = 'ef000002-0000-0000-0000-000000000002') = 0,
  'E3 nor the other organisation itself');

-- A recruiter is not a route to a candidate's CV. There is no employer,
-- reviewer or admin read policy on cv_documents, on purpose: a recruiter who
-- needs a candidate's material receives it through the disclosure machinery
-- that already records who saw what.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents) = 0,
  'E4 a recruiter reads no candidate CV, in either organisation');

RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP F — revoking membership revokes access'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- Hiding a link has never been the boundary. The context switcher lists what
-- RLS returned, so removing somebody from an organisation has to empty that
-- list by itself, with no second edit anywhere.

UPDATE public.employer_memberships
   SET status = 'removed', removed_at = now()
 WHERE user_id = 'cf000003-0000-0000-0000-000000000003';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cf000003-0000-0000-0000-000000000003', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employers
    WHERE id = 'ef000001-0000-0000-0000-000000000001') = 0,
  'F1 a removed member can no longer read the organisation');

RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP G — applying does not disclose a CV'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- The specific thing a candidate would most reasonably fear once CVs are
-- stored: that applying to a company hands that company a browsable copy of
-- every CV they own.
--
-- It does not, and the reason is structural rather than a policy somebody
-- remembered to leave out. cv_documents has ONE read policy and its
-- predicate is `auth.uid() = owner_user_id`. There is no employer branch, no
-- membership branch, no "applied to us" branch and no admin branch, so there
-- is no condition under which a recruiter's SELECT can match a row.
--
-- A recruiter who needs a candidate's material receives it through the
-- application's own disclosure machinery, which records who saw what. This
-- group exists so that a future release which adds a second, quieter route
-- has to delete an assertion to do it.

-- Group F revoked this recruiter's membership, and the groups share one
-- transaction. Restore it first: this group is about what an ACTIVE
-- recruiter with an application in front of them can reach, which is a
-- different question from the one Group F answered.
UPDATE public.employer_memberships
   SET status = 'active', removed_at = NULL
 WHERE user_id = 'cf000003-0000-0000-0000-000000000003';

-- Created as a draft, then self-published through the real lifecycle.
--
-- The advert has to be open, because job_applications refuses an
-- application to a job that is not. Going through the lifecycle rather than
-- around it also keeps the fixture honest: `published_at` is
-- moderation-owned and is stamped by the jobs trigger itself, so it is
-- deliberately NOT set here -- setting it is what the guard refuses.
INSERT INTO public.jobs
  (id, slug, short_id, employer_id, title_sv, application_method, status)
VALUES ('dddd0001-0000-0000-0000-000000000001', 'cvtest-vaktare', 'CVT001',
        'ef000001-0000-0000-0000-000000000001', 'Väktare', 'internal', 'draft');

UPDATE public.jobs
   SET status = 'published',
       expires_at = now() + interval '30 days'
 WHERE id = 'dddd0001-0000-0000-0000-000000000001';

INSERT INTO public.job_applications
  (job_id, employer_id, applicant_user_id, status, consent_given_at)
VALUES ('dddd0001-0000-0000-0000-000000000001',
        'ef000001-0000-0000-0000-000000000001',
        'cf000001-0000-0000-0000-000000000001',
        'submitted', now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cf000003-0000-0000-0000-000000000003', true);

-- The recruiter genuinely can see the application. This assertion exists so
-- that the next one means something: it establishes that the fixture is
-- real and the recruiter's own reads work.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications
    WHERE employer_id = 'ef000001-0000-0000-0000-000000000001') = 1,
  'G1 a recruiter can read an application made to their own organisation');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents) = 0,
  'G2 and still reads no CV belonging to that applicant');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents
    WHERE owner_user_id = 'cf000001-0000-0000-0000-000000000001') = 0,
  'G3 not even when naming the applicant directly');

-- Nor may they write one into existence on somebody else's behalf.
SELECT pg_temp.must_fail(
  $$INSERT INTO public.cv_documents (owner_user_id, title)
    VALUES ('cf000001-0000-0000-0000-000000000001', 'recruiter-planted')$$,
  'row-level security',
  'G4 nor create a CV owned by the applicant');

RESET ROLE;

-- The policy set itself: no branch exists that could ever admit a
-- recruiter. Asserted on the predicate text, because a policy that GAINS an
-- employer branch is exactly the change this group must fail on.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'cv_documents'
       AND (coalesce(qual, '') || coalesce(with_check, '')) ~
           '(employer|membership|has_employer_role|is_platform_admin|application)'),
  'G5 no cv_documents policy mentions employers, membership, admin or applications');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cv_documents'
      AND coalesce(qual, '') LIKE '%owner_user_id%') = 3,
  'G6 all three readable/writable-row policies key on owner_user_id alone');

DO $$ BEGIN RAISE NOTICE 'GROUP H — done'; END $$;

ROLLBACK;
