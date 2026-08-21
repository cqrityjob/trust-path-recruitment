-- Narrowing the CQrityjob wildcard closed-test grant.
--
-- ── THIS IS NOT A MIGRATION, AND IT HAS NOT BEEN RUN ──────────────────────
--
-- It is the prepared remediation for the finding raised by the recruitment
-- E2E on 2026-08-21. It is deliberately left unexecuted: revoking the wildcard
-- ends a capability the Product Owner created for their own closed test, and
-- that is the owner's call, not a test's.
--
-- Run it by hand, once, in the Lovable Cloud / Supabase SQL editor, ONLY after
-- the owner has decided. It is idempotent and it is one transaction: if any
-- assertion fails, nothing changes.
--
-- ── THE FINDING ───────────────────────────────────────────────────────────
--
-- scp_test_grants row 711936a3-ee00-4113-878a-f9567e8eb813
--   employer      cqrityjob (b901bdaf-6931-4b55-92b5-11053cf8ab6b)
--   purpose       closed_test
--   definition_id NULL  <-- every programme the purpose allows
--   granted       2026-08-20 by mostafa@salvusgroup.se
--   expires       2026-11-18
--
-- Its stated reason is "closed test of real Security Guard content". Its
-- effect is wider than its reason: a NULL definition_id admits every
-- non-fixture draft/design programme, which today is EIGHT definitions --
-- the six SG programmes it was written for, sg-development-learning-container,
-- and security-officer-recruitment, the flagship recruitment assessment. Any
-- programme authored in future is admitted the moment it exists.
--
-- ── WHY IT WAS NOT SIMPLY REVOKED ─────────────────────────────────────────
--
-- Eight attempts cite this grant and are still `submitted`, awaiting human
-- review. Revoking would not harm them -- the grant is consulted only by
-- scp_employer_assign, scp_invite_participant, scp_claim_assessment_invitations,
-- scp_guard_assignment_targets_published and the library read models, never by
-- submit, review, score or release -- but it would end the ability to make NEW
-- SG assignments, and there is no self-service path to re-create a grant.
--
-- So this script preserves exactly the capability the grant was written for,
-- and removes the rest.
--
-- ── WHAT IT DOES ──────────────────────────────────────────────────────────
--
--   1. creates six definition-scoped closed_test grants for cqrityjob, one per
--      SG programme that actually has attempts under the wildcard;
--   2. revokes the wildcard -- revoked_at is SET, the row is never deleted, so
--      every existing attempt can still explain the basis it ran under;
--   3. proves that security-officer-recruitment is no longer assignable by
--      cqrityjob, that the six SG programmes still are, and that no other
--      organisation moved.
--
-- Expiry is carried across unchanged (2026-11-18) rather than extended.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  _wild     uuid := '711936a3-ee00-4113-878a-f9567e8eb813';
  _employer uuid := 'b901bdaf-6931-4b55-92b5-11053cf8ab6b';
  _expires  timestamptz;
  _by       uuid;
  _n        int;
  _slug     text;
BEGIN
  -- ── Preflight. Refuse to act on a grant that is not the one described. ──
  SELECT g.expires_at, g.authorised_by INTO _expires, _by
    FROM public.scp_test_grants g
   WHERE g.id = _wild AND g.employer_id = _employer
     AND g.purpose = 'closed_test' AND g.definition_id IS NULL
     AND g.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'PRECONDITION FAILED: % is not an un-revoked wildcard closed_test grant '
      'for cqrityjob. Nothing has been changed -- re-read scp_test_grants '
      'before running this.', _wild;
  END IF;

  -- ── 1. The six replacements, scoped to one definition each ─────────────
  FOREACH _slug IN ARRAY ARRAY['sg-access-control','sg-conflict-deescalation',
                               'sg-incident-response','sg-operational-baseline',
                               'sg-reporting-documentation','sg-situational-awareness']
  LOOP
    INSERT INTO public.scp_test_grants
      (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
    SELECT _employer, 'closed_test', d.id,
           'Product Owner closed test of real Security Guard content in the '
           'CQrityjob test environment. Scoped to ' || _slug || '. Content '
           'remains draft/design and unvalidated; every attempt under this '
           'grant is stamped governance_mode = closed_test and must not be used '
           'for selection, ranking or employment decisions. Replaces the '
           'wildcard grant 711936a3 with the same expiry.',
           _by, _expires
      FROM public.scp_assessment_definitions d
     WHERE d.slug = _slug
       AND NOT EXISTS (
         SELECT 1 FROM public.scp_test_grants g
          WHERE g.employer_id = _employer AND g.purpose = 'closed_test'
            AND g.definition_id = d.id AND g.revoked_at IS NULL);
  END LOOP;

  -- ── 2. Revoke the wildcard. Set, never delete. ─────────────────────────
  UPDATE public.scp_test_grants
     SET revoked_at = now(), revoked_by = _by
   WHERE id = _wild AND revoked_at IS NULL;

  RAISE NOTICE 'wildcard % revoked; six scoped grants in place', _wild;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it, rather than assume it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _employer uuid := 'b901bdaf-6931-4b55-92b5-11053cf8ab6b'; _n int;
BEGIN
  -- The recruitment assessment is the whole point: it was never part of the SG
  -- closed test and must stop being admitted by inheritance.
  IF public.scp_grant_permits_assignment(
       _employer,
       (SELECT id FROM public.scp_assessment_definitions WHERE slug = 'security-officer-recruitment'),
       'draft', 'design', false) IS NOT NULL THEN
    RAISE EXCEPTION
      'CHECK 1 FAILED: cqrityjob still has a basis to run '
      'security-officer-recruitment.';
  END IF;
  RAISE NOTICE 'CHECK 1 ok — security-officer-recruitment is no longer admitted by inheritance';

  -- The six programmes the grant was actually written for still run.
  SELECT count(*) INTO _n
    FROM public.scp_assessment_definitions d
   WHERE d.slug IN ('sg-access-control','sg-conflict-deescalation',
                    'sg-incident-response','sg-operational-baseline',
                    'sg-reporting-documentation','sg-situational-awareness')
     AND public.scp_grant_permits_assignment(_employer, d.id, 'draft', 'design', false)
         = 'closed_test';
  IF _n <> 6 THEN
    RAISE EXCEPTION 'CHECK 2 FAILED: % of 6 SG programmes still assignable', _n;
  END IF;
  RAISE NOTICE 'CHECK 2 ok — all six SG programmes still assignable';

  -- No wildcard closed_test grant survives anywhere.
  SELECT count(*) INTO _n FROM public.scp_test_grants
   WHERE purpose = 'closed_test' AND definition_id IS NULL AND revoked_at IS NULL;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: % un-revoked wildcard closed_test grant(s) remain', _n;
  END IF;
  RAISE NOTICE 'CHECK 3 ok — no un-revoked wildcard closed_test grant remains';

  -- The audit trail survives the revocation.
  SELECT count(*) INTO _n FROM public.scp_attempts
   WHERE test_grant_id = '711936a3-ee00-4113-878a-f9567e8eb813';
  IF _n = 0 THEN
    RAISE EXCEPTION 'CHECK 4 FAILED: attempts lost their reference to the revoked grant';
  END IF;
  RAISE NOTICE 'CHECK 4 ok — % attempt(s) still cite the revoked grant', _n;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- What to expect
-- ═══════════════════════════════════════════════════════════════════════════
--
--   NOTICE:  wildcard 711936a3-... revoked; six scoped grants in place
--   NOTICE:  CHECK 1 ok — security-officer-recruitment is no longer admitted by inheritance
--   NOTICE:  CHECK 2 ok — all six SG programmes still assignable
--   NOTICE:  CHECK 3 ok — no un-revoked wildcard closed_test grant remains
--   NOTICE:  CHECK 4 ok — 9 attempt(s) still cite the revoked grant
--
-- ── A SEPARATE PROBLEM THIS DOES NOT FIX ──────────────────────────────────
--
-- cqrityjob has ONE member, and that member assigned all eight outstanding
-- attempts, so scp_review_conflict excludes them as 'assigned_this_assessment'.
-- The organisation cannot review its own backlog through the normal path. The
-- member is also a platform admin, so scp_review_authorisation returns
-- 'break_glass' and the reviews CAN be completed -- each one stamped
-- reviewed_under_break_glass = true, which is the honest record of what
-- happened. The clean fix is a second member holding a workforce reviewer seat.
