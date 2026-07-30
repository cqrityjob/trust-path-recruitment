-- Security Career Discovery v3.1 — ACTIVATION.
--
-- ⚠ THIS FILE IS NOT A MIGRATION AND MUST NOT BE MOVED INTO
--   supabase/migrations/. Anything in that directory applies automatically on
--   deploy, which would promote the instrument without a human deciding to.
--   That is precisely what the review-gate control exists to prevent.
--
-- Run BY THE OWNER, by hand, once every review gate has genuinely been
-- approved. Until then v3.1 stays at lifecycle_status = 'internal_test' and the
-- database refuses candidate sessions against it — which is the correct
-- behaviour, not a defect.
--
-- ── WHAT BLOCKS ACTIVATION TODAY ───────────────────────────────────────
--
-- public.cd_sessions has two BEFORE INSERT guards:
--
--   CD_VERSION_NOT_ADMINISTRABLE   lifecycle_status must be 'pilot' or 'active'
--   CD_REVIEW_GATES_OUTSTANDING    every review_status gate must be true
--
-- Both must pass before a real candidate can start or save a v3.1 run. The
-- public assessment route reads this state through getV31Availability() and
-- shows a "not yet available" message rather than letting someone answer
-- twenty questions that cannot be saved.
--
-- ── STEP 1 — CONFIRM THE GATES ARE ACTUALLY APPROVED ───────────────────
--
-- Do not run step 2 until each of these has a real, recorded approval. Setting
-- a gate to true is a statement that the review happened.
--
--   content_review          candidate-facing wording signed off
--   sme_review              subject-matter review of the instrument
--   language_review         Swedish source + English equivalence
--   accessibility_review    keyboard, screen reader, contrast, reduced motion
--   bias_review             §7 pilot criteria and fairness review
--   privacy_legal_review    GDPR, data minimisation, retention
--   psychometric_review     coverage, dominance, differentiation
--
-- Inspect the current state first:
--
--   SELECT definition_version, lifecycle_status, review_status
--     FROM public.cd_definition_versions
--    WHERE definition_version = '2026-scd-v3.1.0';
--
-- ── STEP 2 — PROMOTE ──────────────────────────────────────────────────
--
-- Set ONLY the gates that are genuinely approved. Listing a gate here that has
-- not been reviewed defeats the entire control.
--
-- Promote to 'pilot' first (invited candidates), not straight to 'active'.
-- 'pilot' is reversible in one statement; a public 'active' run that produces
-- real immutable snapshots is not.

BEGIN;

UPDATE public.cd_definition_versions
   SET review_status = jsonb_build_object(
         'content_review',       true,
         'sme_review',           true,
         'language_review',      true,
         'accessibility_review', true,
         'bias_review',          true,
         'privacy_legal_review', true,
         'psychometric_review',  true
       ),
       lifecycle_status = 'pilot',
       updated_at = now()
 WHERE definition_version = '2026-scd-v3.1.0';

-- Verify before committing. If this raises, the transaction rolls back and
-- nothing is promoted.
DO $$
DECLARE _status text; _outstanding integer;
BEGIN
  SELECT lifecycle_status,
         (SELECT count(*) FROM jsonb_each(review_status) g WHERE g.value <> 'true'::jsonb)
    INTO _status, _outstanding
    FROM public.cd_definition_versions
   WHERE definition_version = '2026-scd-v3.1.0';

  IF _status IS NULL THEN
    RAISE EXCEPTION 'v3.1 definition version not found — nothing was promoted';
  END IF;
  IF _status NOT IN ('pilot','active') THEN
    RAISE EXCEPTION 'lifecycle_status is still %', _status;
  END IF;
  IF _outstanding <> 0 THEN
    RAISE EXCEPTION '% review gate(s) still outstanding', _outstanding;
  END IF;

  RAISE NOTICE 'v3.1 promoted to % with all review gates cleared.', _status;
END $$;

COMMIT;

-- ── STEP 3 — LATER, FOR FULL PUBLIC LAUNCH ────────────────────────────
--
--   UPDATE public.cd_definition_versions
--      SET lifecycle_status = 'active', updated_at = now()
--    WHERE definition_version = '2026-scd-v3.1.0';
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────
--
-- Returns v3.1 to internal-only in one statement. Existing snapshots are
-- untouched and stay readable — they always do; nothing rewrites a stored
-- report.
--
--   UPDATE public.cd_definition_versions
--      SET lifecycle_status = 'internal_test', updated_at = now()
--    WHERE definition_version = '2026-scd-v3.1.0';
