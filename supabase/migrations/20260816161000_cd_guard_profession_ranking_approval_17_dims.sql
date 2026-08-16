-- Security Career Discovery v3.1 -- fix: cd_guard_profession_ranking_approval
-- still required exactly 16 calibrated dimensions.
--
-- Found during the Final Candidate Result Delivery & Save Flow Fix's broad
-- stale-assumption search (Master Completion Mandate section 6: "do not
-- patch only the first stale count you find"). Not yet triggered in
-- production -- approved_for_ranking has never been set true for any
-- profession -- but it is a real, confirmed defect: CID17 (Final Autonomous
-- Matching Engine Completion Mandate) brought every profession to 17
-- calibrated dimensions (count(DISTINCT dimension_id) FROM
-- cd_profession_profiles WHERE profession_id = X, verified live: all 14
-- professions currently return 17, not 16, since the trigger counts across
-- every calibration_version the profession has ever had and the new
-- 'layer4-recalibrated-2026-08-16' rows are a superset of the old
-- 'layer4-first-wave-2026-08-14' ones). Left at 16, the very first attempt
-- to approve ANY profession for ranking would have failed with
-- CD_PROFESSION_PROFILE_INCOMPLETE, HINT 'Found 17.' -- exactly backwards.
--
-- This migration only changes the literal 16 -> 17. It does not touch the
-- trigger's logic, its other checks, or approved_for_ranking itself.

CREATE OR REPLACE FUNCTION public.cd_guard_profession_ranking_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _dims integer;
BEGIN
  IF NOT NEW.approved_for_ranking THEN
    RETURN NEW;
  END IF;

  IF NEW.review_state <> 'approved_for_ranking' THEN
    RAISE EXCEPTION 'CD_PROFESSION_NOT_REVIEWED'
      USING HINT = 'review_state must reach approved_for_ranking first.';
  END IF;

  IF NEW.derived_from_area THEN
    RAISE EXCEPTION 'CD_PROFESSION_DERIVED_FROM_AREA'
      USING HINT = 'A profile mechanically derived from its Career Area may not be offered as a personalised recommendation.';
  END IF;

  SELECT count(DISTINCT dimension_id) INTO _dims
    FROM public.cd_profession_profiles
   WHERE profession_id = NEW.profession_id;

  IF _dims <> 17 THEN
    RAISE EXCEPTION 'CD_PROFESSION_PROFILE_INCOMPLETE'
      USING HINT = 'All 17 dimensions must be calibrated before ranking. Found ' || _dims || '.';
  END IF;

  RETURN NEW;
END $function$;
