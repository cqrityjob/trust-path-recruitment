-- Job advertisement archiving — behaviour under real RLS.
--
-- Everything here runs as `authenticated` with a JWT subject set, never as the
-- owner, because the questions being asked are all "may THIS person do THIS to
-- THAT row" and the owner can do anything.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(_sql text, _needle text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%' || _needle || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with "%"', _label, _msg;
    END IF;
    RAISE NOTICE '    ok  %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- it was allowed', _label;
END $$;

-- ── Two organisations, so "another organisation's job" is a real row ────────

INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-0000-0000-000000000001','owner-a@arch.invalid'),
  ('a1000000-0000-0000-0000-000000000002','owner-b@arch.invalid');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('a1000000-1111-0000-0000-000000000001','Arkiv A AB','arkiv-a','active'),
  ('a1000000-1111-0000-0000-000000000002','Arkiv B AB','arkiv-b','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('a1000000-1111-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','owner','active',now()),
  ('a1000000-1111-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','owner','active',now());

INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, title_en, status, application_method) VALUES
  ('a1000000-2222-0000-0000-000000000001','a1000000-1111-0000-0000-000000000001',
   'arkiv-a-utkast','arkaaa0001','Utkast A','Draft A','draft','internal'),
  ('a1000000-2222-0000-0000-000000000002','a1000000-1111-0000-0000-000000000002',
   'arkiv-b-utkast','arkbbb0001','Utkast B','Draft B','draft','internal');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. An employer can archive its own draft
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.jobs SET status = 'archived'
 WHERE id = 'a1000000-2222-0000-0000-000000000001';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = 'a1000000-2222-0000-0000-000000000001') = 'archived',
  'A1 an employer can archive its own draft');

SELECT pg_temp.ok(
  (SELECT archived_at FROM public.jobs
    WHERE id = 'a1000000-2222-0000-0000-000000000001') IS NOT NULL,
  'A2 archived_at was stamped by the trigger, not by the caller');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. An employer cannot archive another organisation's job
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS makes the row invisible, so the UPDATE matches nothing rather than
-- raising. Zero rows affected IS the refusal, and the row must be untouched.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.jobs SET status = 'archived'
 WHERE id = 'a1000000-2222-0000-0000-000000000002';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = 'a1000000-2222-0000-0000-000000000002') = 'draft',
  'A3 an employer cannot archive another organisation''s job');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Archived is absent from the active list, present in the archive view
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs
    WHERE employer_id = 'a1000000-1111-0000-0000-000000000001'
      AND status <> 'archived') = 0,
  'A4 the archived advertisement is absent from the active list');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs
    WHERE employer_id = 'a1000000-1111-0000-0000-000000000001'
      AND status = 'archived') = 1,
  'A5 the archived advertisement appears in the archive view');

-- It must also stop being publicly visible.
SELECT pg_temp.ok(
  NOT public.job_is_active('archived', now(), NULL, now() + interval '30 days'),
  'A6 an archived advertisement is not publicly active');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Restore
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.jobs SET status = 'draft'
 WHERE id = 'a1000000-2222-0000-0000-000000000001';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = 'a1000000-2222-0000-0000-000000000001') = 'draft',
  'A7 an archived advertisement can be restored');

SELECT pg_temp.ok(
  (SELECT archived_at FROM public.jobs
    WHERE id = 'a1000000-2222-0000-0000-000000000001') IS NULL,
  'A8 restoring clears archived_at, leaving no stale archive date');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Restore cannot be used to skip moderation
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.jobs SET status = 'archived'
 WHERE id = 'a1000000-2222-0000-0000-000000000001';

-- Straight back into the moderation queue would let archiving be used as a
-- way to re-publish without re-review. Only draft and rejected may reach
-- pending_review, so archived cannot.
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001', true);
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''pending_review'' '
    'WHERE id = ''a1000000-2222-0000-0000-000000000001''',
    'Employers cannot change status',
    'A9 archived cannot re-enter moderation directly — it must go via draft');
  EXECUTE 'RESET ROLE';
END $$;

-- pending_review stays in the moderator's hands.
UPDATE public.jobs SET status = 'draft'
 WHERE id = 'a1000000-2222-0000-0000-000000000001';
UPDATE public.jobs SET status = 'pending_review'
 WHERE id = 'a1000000-2222-0000-0000-000000000001';

-- Refused by RLS rather than by the trigger: the update policy's USING clause
-- never included pending_review, so the row is not updatable by the employer
-- at all while a moderator holds it. That shows up as zero rows affected, not
-- as an error -- so the row itself is what gets asserted.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.jobs SET status = 'archived'
 WHERE id = 'a1000000-2222-0000-0000-000000000001';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs
    WHERE id = 'a1000000-2222-0000-0000-000000000001') = 'pending_review',
  'A10 an advertisement awaiting moderation cannot be archived out from under it');

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Archiving destroys no history
-- ═══════════════════════════════════════════════════════════════════════════
-- The whole reason archive was chosen over delete.

-- A fresh advertisement rather than the one above, which is deliberately left
-- sitting in pending_review by A10 and must stay there.
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, title_en, status, application_method)
VALUES ('a1000000-2222-0000-0000-000000000003','a1000000-1111-0000-0000-000000000001',
        'arkiv-a-historik','arkaaa0003','Historik A','History A','draft','internal');

INSERT INTO public.job_audit_events (job_id, action, actor_id)
VALUES ('a1000000-2222-0000-0000-000000000003','created',
        'a1000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'archived'
 WHERE id = 'a1000000-2222-0000-0000-000000000003';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs
    WHERE id = 'a1000000-2222-0000-0000-000000000003') = 'archived',
  'A11 the advertisement carrying audit history archived cleanly');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_audit_events
    WHERE job_id = 'a1000000-2222-0000-0000-000000000003') >= 1,
  'A12 archiving preserves the audit trail');

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.jobs
   WHERE id IN ('a1000000-2222-0000-0000-000000000001',
                'a1000000-2222-0000-0000-000000000002',
                'a1000000-2222-0000-0000-000000000003');
  IF _n <> 3 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: A13 a job row disappeared during the suite';
  END IF;
  RAISE NOTICE '    ok  A13 no job row was destroyed anywhere in this suite';
END $$;

DO $$ BEGIN RAISE NOTICE '    ok  13 job archive assertions passed'; END $$;

ROLLBACK;
