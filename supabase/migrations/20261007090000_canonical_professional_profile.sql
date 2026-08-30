-- EXPAND: one canonical Professional Profile, with the old writer still working.
--
-- ══ THIS IS HALF OF A TWO-PHASE RELEASE ══════════════════════════════════
--
--   PHASE A (this file)   EXPAND. Safe with the CURRENT application still
--                         running. It removes no column, adds no constraint
--                         an existing client would violate, and invalidates
--                         no existing client contract. The Passport's writer
--                         keeps working exactly as it does today.
--
--   PHASE B (application) CONTRACT. Removes professionSlug from the Passport
--                         write schemas and delegates the editor to the
--                         canonical Career Profile.
--
--   PHASE C (migration)   CONTRACT. Drops the compatibility trigger this
--                         file installs, once no client writes the Passport
--                         column any more. Ships WITH Phase B and is applied
--                         AFTER it is live -- see
--                         20261008090000_canonical_professional_profile_contract.sql.
--
-- The split exists because Lovable rebuilds the application from `origin/main`
-- the moment a PR merges, while migrations run when somebody applies them.
-- Between those two events the deployed code and the database disagree, and a
-- release that needs both to change at once has no safe ordering. So neither
-- half ever needs the other to have happened first:
--
--   OLD CODE + NEW DATABASE  works -- proven in Group F of
--                            supabase/tests/canonical_professional_profile_test.sql
--   NEW CODE + NEW DATABASE  works -- the Passport simply stops writing a
--                            column the database now maintains for it.
--
-- ══ WHAT WAS WRONG ═══════════════════════════════════════════════════════
--
-- "What is your current profession?" was answered in three places and owned
-- by none:
--
--   * security_career_profiles.current_profession_slug   (My Career →
--     "Din karriärprofil", and the pre-assessment profile step)
--   * sp_passport_profiles.cig_profession_slug           (Security Passport
--     → "Mina uppgifter", plus a third copy mirrored into that row's
--     onboarding_answers JSON under 'profession.profession')
--   * cd_sessions.current_profession_slug                (the post-
--     assessment career-context step)
--
-- The third is not a duplicate and is not touched here: a cd_sessions row is
-- an IMMUTABLE record of one assessment run, and freezing what a candidate
-- said at the moment they said it is the entire basis on which a historical
-- report stays honest. The first two are the defect. Both were editable,
-- both were user-facing, neither knew the other existed, and a candidate who
-- corrected their profession in one surface watched the other keep the old
-- answer with no indication anything was wrong.
--
-- ══ WHAT THIS MIGRATION DOES ═════════════════════════════════════════════
--
--   1. Designates security_career_profiles as the canonical home for
--      self-reported professional-profile facts, in a table comment, so the
--      next reader is told rather than left to infer it.
--   2. Records what the two copies said BEFORE anything was changed, in
--      security_career_profile_reconciliations. Nothing is reconciled
--      silently and nothing is discarded.
--   3. Reconciles the existing rows under a deterministic rule that cannot
--      lose a user's answer (see below).
--   4. Installs a ONE-WAY mirror so sp_passport_profiles.cig_profession_slug
--      keeps following the canonical value. The Passport UI stops writing it
--      in the same release; the column stays populated because four
--      disclosure functions read it into the package an employer receives,
--      and stopping the writer without replacing it would empty a
--      recipient-facing field.
--
-- ══ THE RECONCILIATION RULE ══════════════════════════════════════════════
--
-- When two stored values disagree the database does not get to decide which
-- one is true, so it does not try:
--
--   canonical set, passport empty      → canonical stands
--   canonical empty, passport set      → the passport value is ADOPTED into
--                                        the canonical row. Nothing is
--                                        invented: it is the user's own
--                                        answer, moved to the surface that
--                                        now owns it.
--   both set and EQUAL                 → nothing to do
--   both set and DIFFERENT             → the canonical value stands and the
--                                        conflict is LOGGED with both
--                                        values. The user is asked to
--                                        confirm in the application (see
--                                        the unresolved-conflict read in
--                                        profile.functions.ts). The
--                                        database never picks a winner.
--
-- The last case is the only one that could have destroyed information, and
-- it is the one case where nothing is overwritten.
--
-- ══ WHAT IS DELIBERATELY *NOT* MOVED ═════════════════════════════════════
--
-- Work country stays Passport-only. It is not a duplicate: sp_passport_
-- profiles.jurisdiction_code carries a confirmation timestamp, drives which
-- regulated credentials a holder may even claim, and is governed by the
-- market packs. Copying it into a self-reported profile would create the
-- second writer this migration exists to remove.
--
-- Employment history stays Passport-only for the same reason. sp_experience_
-- periods are dated, evidence-bearing, reviewable rows with an assertion
-- level; security_career_profiles.years_of_experience is a coarse band
-- somebody typed. They answer different questions and must not be merged.
--
-- Additive and forward-safe. No column is dropped, no policy is loosened, no
-- Passport verification semantics are touched: nothing here reads or writes
-- assertion_level, lifecycle_state, verified_at or verified_by_user_id.
--
-- Reversible: supabase/rollback/20261007090000_canonical_professional_profile_rollback.sql

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Say which table is canonical
-- ═════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.security_career_profiles IS
  'CANONICAL self-reported Professional Profile: one row per user, the single '
  'writable home for overlapping career facts (current status, current '
  'profession, experience band). Self-reported only -- it is never verified '
  'and never carries Passport evidence. Passport credentials, verified '
  'experience periods and work country stay in sp_* tables; cd_sessions keeps '
  'its own immutable per-run copy of what a candidate said during one '
  'assessment. Career DNA and profession affinity never read this table.';

COMMENT ON COLUMN public.security_career_profiles.current_profession_slug IS
  'The canonical self-reported current profession (cig_professions.slug). '
  'sp_passport_profiles.cig_profession_slug is a read-only MIRROR of this '
  'column, maintained by career_profile_mirror_profession_to_passport(); the Passport '
  'is not a second writer.';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. The reconciliation record
-- ═════════════════════════════════════════════════════════════════════════
--
-- A conflict is a fact about a user's data, so the user may read their own
-- rows. Nobody may write one from the application: rows are created by the
-- backfill below and by nothing else, which is why no INSERT policy exists
-- and no INSERT grant is issued to authenticated.

CREATE TABLE IF NOT EXISTS public.security_career_profile_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which fact was reconciled. One value today; named rather than implied so
  -- a second field can be added without a second table.
  field text NOT NULL CHECK (field IN ('current_profession_slug')),
  canonical_value text,
  passport_value text,
  resolution text NOT NULL CHECK (resolution IN (
    'adopted_from_passport',   -- canonical was empty; the passport answer moved in
    'kept_canonical_conflict'  -- both set and different; canonical stands, user confirms
  )),
  -- Set when the user confirms which value is right. A conflict that is
  -- never surfaced is the same as one that was never recorded.
  --
  -- The ONLY column an authenticated holder holds an UPDATE privilege on --
  -- see the column-level grant below. Every other column here is evidence.
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.security_career_profile_reconciliations IS
  'What the duplicate profile copies said before consolidation, and how each '
  'was resolved. Exists so a conflict is surfaced to the user rather than '
  'guessed at, and so the pre-consolidation values survive a rollback.';

CREATE INDEX IF NOT EXISTS security_career_profile_reconciliations_open_idx
  ON public.security_career_profile_reconciliations (user_id)
  WHERE resolved_at IS NULL;

ALTER TABLE public.security_career_profile_reconciliations ENABLE ROW LEVEL SECURITY;

-- ── REVOKE FIRST, THEN GRANT WHAT IS INTENDED ────────────────────────
--
-- Silence is a grant here. This project runs with Supabase's default
-- privileges, under which a newly created table arrives already granted to
-- `anon` and `authenticated` -- INSERT, DELETE and TRUNCATE included, and
-- TRUNCATE is not something RLS constrains. A migration that only ADDS the
-- grants it wants therefore ships every grant it did not think about.
--
-- So the table is stripped and then given exactly what is intended, to
-- exactly one role.
--
-- ── WHY THE UPDATE GRANT NAMES A COLUMN ──────────────────────────────
--
-- A conflict record is EVIDENCE: it is the only surviving statement of what
-- the two former writers actually held before consolidation, and the expand
-- rollback reads it to put those values back. Nobody may manufacture one and
-- nobody may destroy one. The single change a person may make is to say they
-- have settled it.
--
-- Row-level security cannot express that. RLS decides WHICH ROWS a statement
-- may touch; it has nothing to say about WHICH COLUMNS. A table-wide
-- `GRANT UPDATE` therefore let a holder rewrite `canonical_value`,
-- `passport_value`, `resolution`, `field` or `created_at` on their own row --
-- editing the evidence about their own case, which is precisely the thing
-- this table exists to make impossible. The policy looked like the control
-- and was not.
--
-- PostgreSQL has the right instrument: a column-level grant. `resolved_at` is
-- the only field a person is answering a question about, so it is the only
-- field they may write. An UPDATE naming any other column -- including one
-- that also sets `resolved_at` -- is refused by the privilege system before
-- RLS is consulted at all.
--
-- Executed rather than asserted: Group G of
-- supabase/tests/canonical_professional_profile_test.sql runs each of these
-- statements as a signed-in holder and proves which succeed and which fail.
REVOKE ALL ON public.security_career_profile_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.security_career_profile_reconciliations TO authenticated;
GRANT UPDATE (resolved_at) ON public.security_career_profile_reconciliations TO authenticated;
GRANT ALL ON public.security_career_profile_reconciliations TO service_role;

DROP POLICY IF EXISTS "own scp reconciliation select"
  ON public.security_career_profile_reconciliations;
CREATE POLICY "own scp reconciliation select"
  ON public.security_career_profile_reconciliations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- The ROW half of the same rule. The column grant above decides that only
-- `resolved_at` may be written; this decides that it may be written only on
-- the holder's own row. Both are required: privileges cannot express "your
-- own", and policies cannot express "this column".
DROP POLICY IF EXISTS "own scp reconciliation resolve"
  ON public.security_career_profile_reconciliations;
CREATE POLICY "own scp reconciliation resolve"
  ON public.security_career_profile_reconciliations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Reconcile what is already stored
-- ═════════════════════════════════════════════════════════════════════════

-- 3a. Record every disagreement BEFORE touching anything.
INSERT INTO public.security_career_profile_reconciliations
  (user_id, field, canonical_value, passport_value, resolution)
SELECT
  p.holder_user_id,
  'current_profession_slug',
  s.current_profession_slug,
  p.cig_profession_slug,
  CASE
    WHEN s.user_id IS NULL OR (s.current_profession_slug IS NULL
                               AND s.current_profession_other IS NULL)
      THEN 'adopted_from_passport'
    ELSE 'kept_canonical_conflict'
  END
FROM public.sp_passport_profiles p
LEFT JOIN public.security_career_profiles s ON s.user_id = p.holder_user_id
WHERE p.cig_profession_slug IS NOT NULL
  AND s.current_profession_slug IS DISTINCT FROM p.cig_profession_slug;

-- 3b. Adopt the Passport answer where the canonical row has none. A user who
--     only ever filled in the Passport keeps their answer; it simply lives
--     where it is now owned.
INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
SELECT p.holder_user_id, p.cig_profession_slug
FROM public.sp_passport_profiles p
WHERE p.cig_profession_slug IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.security_career_profiles s WHERE s.user_id = p.holder_user_id
  )
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.security_career_profiles s
   SET current_profession_slug = p.cig_profession_slug
  FROM public.sp_passport_profiles p
 WHERE p.holder_user_id = s.user_id
   AND p.cig_profession_slug IS NOT NULL
   AND s.current_profession_slug IS NULL
   AND s.current_profession_other IS NULL;

-- 3c. Bring the mirror into line with the canonical value. Where the two
--     disagreed, the canonical value wins the MIRROR while the conflict stays
--     open in the log above -- so the two copies stop contradicting each
--     other immediately, and the user is still asked which is right.
UPDATE public.sp_passport_profiles p
   SET cig_profession_slug = s.current_profession_slug
  FROM public.security_career_profiles s
 WHERE s.user_id = p.holder_user_id
   AND s.current_profession_slug IS NOT NULL
   AND p.cig_profession_slug IS DISTINCT FROM s.current_profession_slug;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Keep the mirror in step, one direction only
-- ═════════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER because this is a system-maintained denormalisation, not
-- something the user is performing: it must behave identically whether the
-- canonical row is written by the holder, by a support action or by a
-- service-role backfill, and it must not depend on the writer happening to
-- hold UPDATE on a Passport row.
--
-- search_path is pinned, and EXECUTE is revoked from PUBLIC and anon.
-- PostgreSQL does not check EXECUTE when firing a trigger, so the revoke
-- costs nothing and closes the Supabase default that would otherwise make a
-- definer function callable by an anonymous visitor.
--
-- It writes ONE column. It cannot create a Passport row (a profile is
-- created by Passport onboarding, and minting one here would give a person a
-- Passport they never opened), and it touches nothing that carries an
-- assertion level, a lifecycle state or a verification attribution.

CREATE OR REPLACE FUNCTION public.career_profile_mirror_profession_to_passport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.sp_passport_profiles
     SET cig_profession_slug = NEW.current_profession_slug
   WHERE holder_user_id = NEW.user_id
     AND cig_profession_slug IS DISTINCT FROM NEW.current_profession_slug;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.career_profile_mirror_profession_to_passport() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.career_profile_mirror_profession_to_passport() IS
  'One-way mirror: canonical security_career_profiles.current_profession_slug '
  '-> sp_passport_profiles.cig_profession_slug, so the disclosure package '
  'keeps a profession while the Passport stops being a second writer. Never '
  'the reverse direction, and never anything but that one column.';

DROP TRIGGER IF EXISTS career_profile_mirror_profession_trg
  ON public.security_career_profiles;
CREATE TRIGGER career_profile_mirror_profession_trg
  AFTER INSERT OR UPDATE OF current_profession_slug ON public.security_career_profiles
  FOR EACH ROW EXECUTE FUNCTION public.career_profile_mirror_profession_to_passport();

-- ── 4b. THE OTHER ORDER ───────────────────────────────────────────────
--
-- The trigger above fires when the canonical row is written. It does
-- nothing when there is no Passport row to write to yet -- correctly, since
-- filling in a career profile must not mint somebody a Passport they never
-- opened.
--
-- But that leaves the reverse ordering unhandled, and it is the COMMON one
-- for a new candidate: fill in /my-career first, open a Passport weeks
-- later. The canonical answer already exists, the mirror already fired
-- against nothing, and the new Passport row would arrive empty -- so "Mina
-- uppgifter" would report the profession unanswered and a disclosure would
-- carry no profession, for a person who had answered the question.
--
-- So the seed happens at the moment the Passport row is created. Still
-- one-way: this function READS the canonical row and writes only its own
-- NEW record. There is no statement here, and none in the mirror above,
-- that writes security_career_profiles -- which is what "canonical" means.
--
-- BEFORE INSERT rather than AFTER, so the value is present in the row from
-- the first instant it exists and no reader can observe a Passport that
-- momentarily disagrees with the profile.

CREATE OR REPLACE FUNCTION public.career_profile_seed_passport_profession()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.cig_profession_slug IS NULL THEN
    SELECT s.current_profession_slug INTO NEW.cig_profession_slug
      FROM public.security_career_profiles s
     WHERE s.user_id = NEW.holder_user_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.career_profile_seed_passport_profession() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.career_profile_seed_passport_profession() IS
  'Seeds a NEW sp_passport_profiles row with the canonical current '
  'profession, for the common case of a candidate who filled in their '
  'career profile before opening a Passport. Reads the canonical row and '
  'writes only its own NEW record -- never the reverse direction.';

DROP TRIGGER IF EXISTS career_profile_seed_passport_profession_trg
  ON public.sp_passport_profiles;
CREATE TRIGGER career_profile_seed_passport_profession_trg
  BEFORE INSERT ON public.sp_passport_profiles
  FOR EACH ROW EXECUTE FUNCTION public.career_profile_seed_passport_profession();

-- ── 4c. THE COMPATIBILITY WINDOW ──────────────────────────────────────
--
-- ══ WHY A SECOND DIRECTION EXISTS, AND WHY IT IS TEMPORARY ═══════════
--
-- Everything above assumes the canonical row is the only thing anybody
-- writes. That becomes true in Phase B. It is NOT true the moment this
-- migration is applied, and pretending otherwise is exactly the failure
-- this release is being restructured to avoid: between applying this file
-- and deploying Phase B, the live application is still the current one, and
-- the current one writes sp_passport_profiles.cig_profession_slug directly
-- from "Mina uppgifter" and from onboarding autosave.
--
-- Two options for that window. Refuse those writes -- which invalidates a
-- contract a running client depends on, and breaks the Passport for every
-- holder until the code catches up. Or make them CORRECT by carrying them
-- through to the canonical row, so that whichever client writes, the two
-- copies say the same thing.
--
-- This is the second. It is a compatibility mechanism with a defined end:
-- Phase C drops it, once nothing writes that column any more. Until then the
-- product is strictly better off than it is today -- today those two writers
-- diverge silently, and during the window they cannot.
--
-- ══ WHY IT CANNOT LOOP ═══════════════════════════════════════════════
--
-- Both directions guard on IS DISTINCT FROM, in the trigger condition AND in
-- the UPDATE's own WHERE. A canonical write fires the mirror, which updates
-- the Passport, which fires this function, whose UPDATE then matches no row
-- because the canonical value is already what it is about to be set to. The
-- chain is two hops in either direction and terminates on the third.
--
-- ══ WHAT IT WILL NOT DO ══════════════════════════════════════════════
--
-- It never overwrites a FREE-TEXT profession. `current_profession_other` is
-- the answer of somebody whose job the catalogue does not contain -- the more
-- specific statement of the two -- and a catalogue slug arriving from the
-- old Passport UI is not grounds to discard it. (The table's CHECK forbids
-- holding both, so "merge them" is not available even if it were wanted.)
-- Such a row simply stays as the user left it, and Phase B removes the
-- writer that could have disagreed with it.

CREATE OR REPLACE FUNCTION public.career_profile_adopt_passport_profession()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A free-text canonical answer is never replaced. See the header.
  IF EXISTS (
    SELECT 1 FROM public.security_career_profiles
     WHERE user_id = NEW.holder_user_id
       AND current_profession_other IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
  VALUES (NEW.holder_user_id, NEW.cig_profession_slug)
  ON CONFLICT (user_id) DO UPDATE
     SET current_profession_slug = EXCLUDED.current_profession_slug
   WHERE public.security_career_profiles.current_profession_slug
         IS DISTINCT FROM EXCLUDED.current_profession_slug;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.career_profile_adopt_passport_profession() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.career_profile_adopt_passport_profession() IS
  'COMPATIBILITY ONLY, for the window between applying the expand migration '
  'and deploying the application phase that stops the Passport writing '
  'cig_profession_slug. Carries an old client''s Passport write through to '
  'the canonical profile so the two cannot diverge. Dropped by '
  '20261008090000_canonical_professional_profile_contract.sql.';

DROP TRIGGER IF EXISTS career_profile_adopt_passport_profession_trg
  ON public.sp_passport_profiles;
CREATE TRIGGER career_profile_adopt_passport_profession_trg
  AFTER UPDATE OF cig_profession_slug ON public.sp_passport_profiles
  FOR EACH ROW
  WHEN (NEW.cig_profession_slug IS DISTINCT FROM OLD.cig_profession_slug)
  EXECUTE FUNCTION public.career_profile_adopt_passport_profession();
