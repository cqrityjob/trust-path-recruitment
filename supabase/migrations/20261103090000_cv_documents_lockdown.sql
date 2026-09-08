-- cv_documents: close the direct write door. Phase 3 of 3.
--
-- ═════════════════════════════════════════════════════════════════════════
-- DO NOT APPLY THIS UNTIL PHASE 2 IS PUBLISHED
-- ═════════════════════════════════════════════════════════════════════════
--
-- The moment this runs, `authenticated` loses INSERT, UPDATE and DELETE on
-- cv_documents. Any deployed application that writes the table directly stops
-- being able to save a CV — not degraded, not slower: refused, with
-- `permission denied for table cv_documents`.
--
-- So the precondition is not "PR #199 is merged". It is:
--
--   1. PR #199 is merged to main, AND
--   2. Lovable has rebuilt from main and the published site is serving it,
--      AND
--   3. the owner has confirmed 2 by using the live site — saving a CV, not
--      reading one.
--
-- Merged and published are different events with an uncontrolled gap between
-- them, and this migration is only safe on the far side of the second.
--
-- ── WHY THIS IS A SEPARATE MIGRATION AT ALL ────────────────────────────
--
-- Because 20261102090000 had to be applicable on its own, today, with the
-- currently published application still running. That migration installs the
-- controlled write path BESIDE the direct one and takes nothing away; this
-- one takes the direct one away once nothing needs it. Putting both in one
-- file would have forced a choice between breaking the live site and leaving
-- the defect open, and there is no version of that choice worth making.
--
-- ── WHAT WAS PROTECTING PEOPLE IN THE MEANTIME ─────────────────────────
--
-- Between phase 1 and phase 3 a holder can still write a fabricated CV to
-- their own row. What they cannot do is SEND one:
-- `sp_submit_application_with_cv_source` verifies every fact on the document
-- against the holder's own live records, by value, before copying anything to
-- an employer-readable application. That check stays exactly as it is — this
-- migration removes the ability to write the lie, not the check that stops it
-- travelling. Both, from here on.
--
-- ═════════════════════════════════════════════════════════════════════════
-- WHAT CHANGES
-- ═════════════════════════════════════════════════════════════════════════
--
--   authenticated   SELECT only. Reading their own CVs directly, under the
--                   same owner-only policy as before.
--   writes          cv_create / cv_save / cv_refresh_from_profile /
--                   cv_delete, which take the owner from auth.uid() and
--                   derive every factual value from the caller's own records.
--   TRUNCATE        revoked explicitly. It was never granted, and it is named
--                   here anyway because it is the one privilege row-level
--                   security cannot constrain at all: a role holding it can
--                   empty the table regardless of every policy on it. The
--                   Supabase default-privilege trap grants it on new objects,
--                   so "it was never granted" is a claim worth re-checking
--                   rather than assuming.
--   policies        UNCHANGED, and deliberately kept. They are belt rather
--                   than boundary now, and worth having: if a future
--                   migration re-grants INSERT by accident — which is exactly
--                   how this table got here — the WITH CHECK still stops one
--                   person writing a row owned by another.
--
-- Reversible: supabase/rollback/20261103090000_cv_documents_lockdown_rollback.sql
-- Idempotent: safe to replay over itself.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Refuse to lock a door with nothing behind it
-- ═════════════════════════════════════════════════════════════════════════
--
-- If phase 1 is not applied, this migration would leave a database in which
-- NOBODY can write a CV: the direct path revoked and the controlled path
-- absent. That is a worse state than either phase on its own, and it is
-- silent — the table looks fine and every save fails.
--
-- A migration that can produce that state must refuse to run instead. The
-- check is on the four entry points a client is meant to call.

DO $$
DECLARE _missing text;
BEGIN
  SELECT string_agg(want, ', ' ORDER BY want) INTO _missing
    FROM unnest(ARRAY['cv_create', 'cv_save', 'cv_refresh_from_profile', 'cv_delete']) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = want);

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION
      'CV_LOCKDOWN_PRECONDITION_MISSING: %. Apply 20261102090000_cv_documents_controlled_writes.sql first; revoking the direct writes without the controlled path leaves no way to save a CV at all.',
      _missing
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Revoke
-- ═════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cv_documents FROM authenticated;

-- Restated rather than assumed. The default-privilege trap re-arms on every
-- new object and a REVOKE that is already true costs nothing.
REVOKE ALL ON public.cv_documents FROM PUBLIC, anon;

-- Unchanged, and named so that a reader can see it was considered: the
-- service role is how migrations, backups and support tooling reach the
-- table, and it bypasses RLS by design.
GRANT ALL ON public.cv_documents TO service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Say what the table now is
-- ═════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.cv_documents IS
  'PRIVATE, owner-only CV documents. READ directly by the owner; WRITTEN only '
  'through cv_create / cv_save / cv_refresh_from_profile / cv_delete, which '
  'take the owner from auth.uid() and derive every factual value from the '
  'caller''s own active Passport and profile rows. `authenticated` holds no '
  'INSERT, UPDATE, DELETE or TRUNCATE privilege: before 20261103090000 it '
  'did, and a signed-in holder could POST an invented employment history '
  'straight to the Data API. Presentation over facts that live in '
  'security_career_profiles, sp_experience_periods, sp_claims and profiles -- '
  'never a second home for any of them.';

