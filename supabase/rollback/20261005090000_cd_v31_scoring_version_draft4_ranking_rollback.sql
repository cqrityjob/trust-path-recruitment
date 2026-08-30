-- Rollback for 20261005090000_cd_v31_scoring_version_draft4_ranking.sql.
--
-- Restores cd_definition_versions.scoring_version to 'v3.1-draft-3' and
-- removes the re-tagged option-loading rows. The 'v3.1-draft-3' rows were
-- never touched by the forward migration, so the lockstep
-- cd_v31_validate_session_evidence requires is restored by this alone.
--
-- Run this ONLY together with reverting version.ts to 'v3.1-draft-3';
-- the two must always move as a pair.

UPDATE public.cd_definition_versions
SET scoring_version = 'v3.1-draft-3',
    updated_at = now()
WHERE definition_version = '2026-scd-v3.1.0'
  AND scoring_version = 'v3.1-draft-4';

DELETE FROM public.cd_option_loadings
WHERE scoring_version = 'v3.1-draft-4';

DO $$
DECLARE
  _scoring text;
BEGIN
  SELECT scoring_version INTO _scoring
  FROM public.cd_definition_versions
  WHERE definition_version = '2026-scd-v3.1.0';

  IF _scoring IS DISTINCT FROM 'v3.1-draft-3' THEN
    RAISE EXCEPTION 'rollback failed: scoring_version is %, expected v3.1-draft-3', _scoring;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cd_option_loadings WHERE scoring_version = 'v3.1-draft-3'
  ) THEN
    RAISE EXCEPTION 'rollback failed: no v3.1-draft-3 option loadings remain';
  END IF;
END $$;
