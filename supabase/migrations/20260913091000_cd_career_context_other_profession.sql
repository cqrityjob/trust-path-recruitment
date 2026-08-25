-- Career Discovery: "my profession is not listed" gets somewhere to say what.
--
-- ── THE GAP ───────────────────────────────────────────────────────────────
--
-- The career-context step lets a candidate say their current profession is
-- not in the catalogue -- and then records only THAT. The fact was captured;
-- the profession was not. So a senior person whose title genuinely has no
-- canonical row (a säkerhetsskyddschef before this release, a title specific
-- to one employer, a role from another country) could tell the product that
-- it did not know their job, and the product kept no record of what the job
-- was. The control looked like it worked and lost the answer.
--
-- ── WHY A SEPARATE COLUMN AND NOT A cig_professions ROW ──────────────────
--
-- Because free text must never enter the canonical vocabulary. The catalogue
-- is owner-curated, joined to career-area families, transitions, Career
-- Center content and Layer 4 calibration; a row minted from whatever
-- somebody typed would appear in the picker for the next candidate, in the
-- transitions graph, and eventually in a report, with nobody having reviewed
-- it. This column is deliberately NOT a foreign key, is never joined to
-- cig_professions, and nothing reads it for matching.
--
-- It is contextual self-report, exactly like current_profession_status and
-- current_experience_band next to it: never scored, never a dimension, never
-- an input to profession matching or to the recommendation. It exists so the
-- answer is not thrown away, and so the owner can see which real titles the
-- catalogue is missing.
--
-- ── THE CONSTRAINTS ARE THE CONTRACT ─────────────────────────────────────
--
--   * bounded length -- a free-text field with no ceiling is an invitation;
--   * only present when the holder actually said "not listed", so it cannot
--     become a shadow title sitting alongside a selected canonical one;
--   * trimmed non-empty when present, so '' is not stored as if it were an
--     answer.
--
-- Additive and forward-safe: the column is nullable, every existing row
-- satisfies both checks, and a client that never sends it behaves exactly as
-- it does today.
--
-- Reversible: supabase/rollback/20260913091000_cd_career_context_other_profession_rollback.sql

ALTER TABLE public.cd_sessions
  ADD COLUMN IF NOT EXISTS current_profession_other text;

COMMENT ON COLUMN public.cd_sessions.current_profession_other IS
  'Free-text current profession, ONLY when current_profession_status = ''not_listed''. '
  'Contextual self-report: never scored, never matched, never joined to cig_professions, '
  'and never promoted into the canonical profession vocabulary.';

ALTER TABLE public.cd_sessions
  DROP CONSTRAINT IF EXISTS cd_sessions_current_profession_other_check;

ALTER TABLE public.cd_sessions
  ADD CONSTRAINT cd_sessions_current_profession_other_check
    CHECK (
      current_profession_other IS NULL
      OR (
        current_profession_status = 'not_listed'
        AND length(btrim(current_profession_other)) BETWEEN 1 AND 120
      )
    );

-- =========================================================================
-- Self-verification
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cd_sessions'
       AND column_name = 'current_profession_other') THEN
    RAISE EXCEPTION 'CD_CTX_OTHER: the column was not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cd_sessions_current_profession_other_check'
       AND conrelid = 'public.cd_sessions'::regclass) THEN
    RAISE EXCEPTION 'CD_CTX_OTHER: the check constraint is missing';
  END IF;

  -- Additive means additive: no existing session may have been invalidated.
  SELECT count(*) INTO _n FROM public.cd_sessions WHERE current_profession_other IS NOT NULL;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'CD_CTX_OTHER: % rows already carry a value; this migration adds an empty column', _n;
  END IF;
END $$;
