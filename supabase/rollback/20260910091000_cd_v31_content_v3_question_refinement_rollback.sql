-- Rollback for 20260910091000_cd_v31_content_v3_question_refinement.sql.
--
-- Restores cd_definition_versions.content_version to 'v3.1-draft-3' for the
-- v3.1 definition. Nothing else was changed, so nothing else is restored.
--
-- ── WHAT THIS DOES *NOT* UNDO, AND WHY THAT IS CORRECT ─────────────────
--
-- Reports generated while draft-4 was in force keep their own frozen
-- content_version of 'v3.1-draft-4'. That is not leftover state to clean
-- up -- it is the true record of which wording those candidates read, and
-- rewriting it would be falsifying history to make a column tidy. The
-- snapshot columns are immutable by design (see the migration's header on
-- cd_v31_stored_reports).
--
-- Rolling the DATABASE back without also reverting version.ts's
-- CONTENT_VERSION recreates exactly the disagreement the migration exists
-- to prevent. Revert the code and the database together, in that order.

UPDATE public.cd_definition_versions
SET content_version = 'v3.1-draft-3'
WHERE assessment_id = 'security-career-discovery-v3'
  AND definition_version = '2026-scd-v3.1.0'
  AND content_version = 'v3.1-draft-4';

DO $$
DECLARE _content text; _scoring text;
BEGIN
  SELECT content_version, scoring_version INTO _content, _scoring
    FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3'
     AND definition_version = '2026-scd-v3.1.0';

  IF _content IS DISTINCT FROM 'v3.1-draft-3' THEN
    RAISE EXCEPTION 'CD_V32_ROLLBACK_INCOMPLETE: content_version is %, expected v3.1-draft-3', _content;
  END IF;

  IF _scoring IS DISTINCT FROM 'v3.1-draft-3' THEN
    RAISE EXCEPTION 'CD_V32_ROLLBACK_SCORING_DRIFT: scoring_version is %, expected v3.1-draft-3', _scoring;
  END IF;
END $$;
