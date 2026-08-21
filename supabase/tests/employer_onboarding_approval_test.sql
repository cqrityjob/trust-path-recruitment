-- Employer onboarding — registration, review, approval, refusal.
--
-- The journey these assertions protect:
--
--   register -> organisation created as `pending`
--            -> visible to a platform administrator
--            -> approved (or rejected) by that administrator, and only by one
--            -> employer access follows the decision, not the registration
--
-- The defect that made this suite necessary: a registration produced an
-- auth.users row and nothing else, so the moderation queue -- which reads
-- `employers` -- had nothing to show, and the journey ended in silence.
--
-- The second defect, found while auditing the first: nothing in the interface
-- reflected `pending`, so an unapproved employer was walked into a workspace
-- where roughly thirty RLS policies refused every real action. These
-- assertions pin the database half of that boundary; the redirect half is a
-- convenience and is deliberately NOT treated as security here.
--
-- Everything happens in one transaction that ends in ROLLBACK.

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

DO $$ BEGIN RAISE NOTICE 'GROUP EO — registration -> review -> decision'; END $$;

-- ---------------------------------------------------------------------------
-- Fixture: two applicants who each register a company, one platform admin,
-- and one organisation that was already approved long ago. The last one is
-- there to prove this work cannot disturb employers who are already trading.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_f AS
SELECT
  'bb000000-0000-0000-0000-000000000001'::uuid AS applicant_a,
  'bb000000-0000-0000-0000-000000000002'::uuid AS applicant_b,
  'bb000000-0000-0000-0000-000000000003'::uuid AS admin_user,
  'bb000000-0000-0000-0000-000000000004'::uuid AS outsider,
  'bb000000-0000-0000-0000-000000000010'::uuid AS existing_employer;

GRANT SELECT ON t_f TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT applicant_a FROM t_f), 'applicant-a@example.test'),
  ((SELECT applicant_b FROM t_f), 'applicant-b@example.test'),
  ((SELECT admin_user  FROM t_f), 'platform-admin@example.test'),
  ((SELECT outsider    FROM t_f), 'outsider@example.test');

-- An organisation approved before any of this existed.
INSERT INTO public.employers (id, name, slug, country, status)
VALUES ((SELECT existing_employer FROM t_f), 'Redan Aktiv AB', 'redan-aktiv-onb', 'SE', 'active');

-- ---------------------------------------------------------------------------
-- 1. Registration creates a PENDING organisation and an owner membership.
--
--    create_my_employer_company is SECURITY DEFINER and reads auth.uid(), so
--    the caller's identity is impersonated the way the RLS suites already do.
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT applicant_a FROM t_f)::text, true);

CREATE TEMP TABLE t_a AS
SELECT * FROM public.create_my_employer_company(
  'Nordisk Bevakning AB', 'nordisk-bevakning-onb', 'SE', NULL, NULL, 'VD');

GRANT SELECT ON t_a TO authenticated;

RESET role;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM t_a) = 1,
  'registration creates exactly one organisation');

SELECT pg_temp.ok(
  (SELECT e.status FROM public.employers e
    WHERE e.id = (SELECT employer_id FROM t_a)) = 'pending',
  'a newly registered organisation is pending, never active');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.employer_memberships m
           WHERE m.employer_id = (SELECT employer_id FROM t_a)
             AND m.user_id = (SELECT applicant_a FROM t_f)
             AND m.role = 'owner'
             AND m.status = 'active'),
  'the applicant is recorded as the organisation owner at registration');

-- ---------------------------------------------------------------------------
-- 2. A platform administrator can see it waiting.
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.employers e
           WHERE e.id = (SELECT employer_id FROM t_a) AND e.status = 'pending'),
  'the pending organisation is discoverable by the moderation queue');

-- ---------------------------------------------------------------------------
-- 3. A pending organisation cannot act. This is the boundary that matters --
--    not the redirect in the browser.
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  public.employer_is_active_status((SELECT employer_id FROM t_a)) = false,
  'a pending organisation does not satisfy the active-status gate');

SELECT pg_temp.ok(
  public.employer_is_active_status((SELECT existing_employer FROM t_f)) = true,
  'an approved organisation does satisfy it');

-- ---------------------------------------------------------------------------
-- 4. Only a platform administrator may decide.
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT applicant_a FROM t_f)::text, true);

SELECT pg_temp.must_fail(
  format('SELECT public.moderate_employer(%L::uuid, %L, %L)',
         (SELECT employer_id FROM t_a), 'approved', 'self-approval attempt'),
  'Forbidden',
  'an applicant cannot approve their own organisation');

SELECT set_config('request.jwt.claim.sub', (SELECT outsider FROM t_f)::text, true);

SELECT pg_temp.must_fail(
  format('SELECT public.moderate_employer(%L::uuid, %L, %L)',
         (SELECT employer_id FROM t_a), 'approved', 'outsider attempt'),
  'Forbidden',
  'an unrelated signed-in user cannot approve an organisation');

RESET role;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT pg_temp.ok(
  (SELECT e.status FROM public.employers e
    WHERE e.id = (SELECT employer_id FROM t_a)) = 'pending',
  'a refused approval attempt leaves the organisation pending');

-- ---------------------------------------------------------------------------
-- 5. Approval activates, and records who decided.
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
VALUES ((SELECT admin_user FROM t_f), 'admin')
ON CONFLICT DO NOTHING;

SET LOCAL role TO authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT admin_user FROM t_f)::text, true);

CREATE TEMP TABLE t_dec AS
SELECT * FROM public.moderate_employer(
  (SELECT employer_id FROM t_a), 'approved', 'Company verified against the register.');

SELECT pg_temp.ok(
  (SELECT new_status FROM t_dec) = 'active',
  'approval moves the organisation to active');

SELECT pg_temp.ok(
  (SELECT previous_status FROM t_dec) = 'pending',
  'approval records what the organisation was before the decision');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.employer_moderation_events ev
           WHERE ev.employer_id = (SELECT employer_id FROM t_a)
             AND ev.action = 'approved'
             AND ev.admin_user_id = (SELECT admin_user FROM t_f)
             AND ev.created_at IS NOT NULL),
  'the decision records who approved it and when');

-- ---------------------------------------------------------------------------
-- 6. The owner is unchanged by approval -- no second membership appears.
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employer_memberships m
    WHERE m.employer_id = (SELECT employer_id FROM t_a)) = 1,
  'approval does not create a duplicate membership');

SELECT pg_temp.ok(
  public.employer_is_active_status((SELECT employer_id FROM t_a)) = true,
  'the approved organisation can now act');

-- ---------------------------------------------------------------------------
-- 7. Approving twice is safe. The row is already active, so the transition
--    allow-list refuses -- it cannot silently duplicate or re-decide.
-- ---------------------------------------------------------------------------
SELECT pg_temp.must_fail(
  format('SELECT public.moderate_employer(%L::uuid, %L, %L)',
         (SELECT employer_id FROM t_a), 'approved', 'second click'),
  'Invalid transition',
  'a second approval is refused rather than applied twice');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.employer_moderation_events ev
    WHERE ev.employer_id = (SELECT employer_id FROM t_a) AND ev.action = 'approved') = 1,
  'only one approval event exists after a double decision attempt');

-- ---------------------------------------------------------------------------
-- 8. Rejection withholds access.
-- ---------------------------------------------------------------------------
RESET role;
SELECT set_config('request.jwt.claim.sub', '', true);

SET LOCAL role TO authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT applicant_b FROM t_f)::text, true);

CREATE TEMP TABLE t_b AS
SELECT * FROM public.create_my_employer_company(
  'Tvivelaktig Bevakning AB', 'tvivelaktig-onb', 'SE', NULL, NULL, NULL);

GRANT SELECT ON t_b TO authenticated;

RESET role;
SELECT set_config('request.jwt.claim.sub', '', true);

SET LOCAL role TO authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT admin_user FROM t_f)::text, true);

SELECT public.moderate_employer(
  (SELECT employer_id FROM t_b), 'rejected', 'Could not verify the organisation.');

RESET role;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT pg_temp.ok(
  (SELECT e.status FROM public.employers e
    WHERE e.id = (SELECT employer_id FROM t_b)) = 'rejected',
  'rejection is recorded on the organisation');

SELECT pg_temp.ok(
  public.employer_is_active_status((SELECT employer_id FROM t_b)) = false,
  'a rejected organisation cannot act');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.employer_moderation_events ev
           WHERE ev.employer_id = (SELECT employer_id FROM t_b)
             AND ev.action = 'rejected'
             AND ev.admin_user_id = (SELECT admin_user FROM t_f)),
  'the refusal records who decided it');

-- ---------------------------------------------------------------------------
-- 9. Tenant isolation across the decision boundary.
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.employer_memberships m
               WHERE m.employer_id = (SELECT employer_id FROM t_b)
                 AND m.user_id = (SELECT applicant_a FROM t_f)),
  'approving one organisation grants no membership in another');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.employer_memberships m
               WHERE m.employer_id = (SELECT existing_employer FROM t_f)
                 AND m.user_id IN ((SELECT applicant_a FROM t_f), (SELECT applicant_b FROM t_f))),
  'neither applicant gained access to an unrelated organisation');

-- ---------------------------------------------------------------------------
-- 9b. Every non-active status withholds access, not just the ones a
--     registration passes through. `archived` is here because the first
--     version of the workspace gate let it through -- an organisation that has
--     been closed is the last one that should open a dashboard.
-- ---------------------------------------------------------------------------
UPDATE public.employers SET status = 'suspended' WHERE id = (SELECT employer_id FROM t_a);
SELECT pg_temp.ok(
  public.employer_is_active_status((SELECT employer_id FROM t_a)) = false,
  'a suspended organisation cannot act');

UPDATE public.employers SET status = 'archived' WHERE id = (SELECT employer_id FROM t_a);
SELECT pg_temp.ok(
  public.employer_is_active_status((SELECT employer_id FROM t_a)) = false,
  'an archived organisation cannot act');

UPDATE public.employers SET status = 'draft' WHERE id = (SELECT employer_id FROM t_a);
SELECT pg_temp.ok(
  public.employer_is_active_status((SELECT employer_id FROM t_a)) = false,
  'a draft organisation cannot act');

-- Restore, so the closing assertions read the state the decision left.
UPDATE public.employers SET status = 'active' WHERE id = (SELECT employer_id FROM t_a);

-- ---------------------------------------------------------------------------
-- 10. Employers that were already trading are untouched.
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  (SELECT e.status FROM public.employers e
    WHERE e.id = (SELECT existing_employer FROM t_f)) = 'active',
  'an already-approved organisation is not reset by this work');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.employer_moderation_events ev
               WHERE ev.employer_id = (SELECT existing_employer FROM t_f)),
  'no moderation decision was invented for an organisation nobody reviewed');

ROLLBACK;
