-- The purpose a person is shown, said in their language rather than in ours.
--
-- scp_processing_purposes.name_sv / name_en are not internal labels. They are
-- printed to the participant under "SYFTE OCH BEHANDLING" on every assessment
-- they are asked to take, and to the employer on every released report. The
-- closed-test recruitment purpose was seeded (20260831090000) as
-- "Rekryteringstest (sluten testning)" / "Recruitment-context product testing
-- (closed test)". That is how we describe it to ourselves: it names our
-- release process, not what is happening to the person reading it.
--
-- A candidate being asked to sit an assessment as part of a job application
-- needs to know two things -- that this is a recruitment assessment, and that
-- the material is a preview -- and both fit in four words.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────
--
-- Nothing but the display name changes. The purpose code, its published
-- version, its privacy notice reference and its lawful basis are untouched,
-- and no assignment, attempt or released report changes meaning. In
-- particular this does NOT bring the purpose any closer to selection_support:
-- closed_test_recruitment still confers no basis for an operational selection
-- decision, selection_support remains unpublished, and the guards that
-- enforce that are not referenced here.
--
-- Frozen report snapshots are likewise untouched. A report released last week
-- keeps the wording it was released with; history is not rewritten to look
-- better in a demo.

BEGIN;

UPDATE public.scp_processing_purposes
   SET name_sv = 'Rekryteringsbedömning (förhandsversion)',
       name_en = 'Recruitment assessment (preview)'
 WHERE code = 'closed_test_recruitment';

-- Fail loudly rather than silently leaving the old wording in place: this
-- migration exists for exactly one row, and if that row is missing the
-- deployment is not the one this was written against.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_processing_purposes
     WHERE code = 'closed_test_recruitment'
       AND name_sv = 'Rekryteringsbedömning (förhandsversion)'
       AND name_en = 'Recruitment assessment (preview)'
  ) THEN
    RAISE EXCEPTION 'SCP_PURPOSE_DISPLAY_NAME_NOT_UPDATED: closed_test_recruitment '
      'did not receive its customer-facing name.';
  END IF;

  -- The words we removed must not survive anywhere a person can read them.
  IF EXISTS (
    SELECT 1 FROM public.scp_processing_purposes
     WHERE name_sv ILIKE '%sluten testning%'
        OR name_en ILIKE '%closed test%'
        OR name_sv ILIKE '%testning%'
  ) THEN
    RAISE EXCEPTION 'SCP_PURPOSE_DISPLAY_NAME_STILL_INTERNAL: a processing '
      'purpose is still named after our release process.';
  END IF;

  -- The separation this purpose exists to hold. Renaming a label must never
  -- be the change that quietly publishes selection_support.
  IF EXISTS (
    SELECT 1
      FROM public.scp_purpose_versions pv
     WHERE pv.purpose_code = 'selection_support'
       AND pv.published_at IS NOT NULL
       AND pv.retired_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SCP_SELECTION_SUPPORT_PUBLISHED: selection_support must '
      'remain unpublished.';
  END IF;
END $$;

COMMIT;
