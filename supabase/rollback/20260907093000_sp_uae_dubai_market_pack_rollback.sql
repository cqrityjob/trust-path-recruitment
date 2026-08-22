-- =============================================================================
-- ROLLBACK — Security Passport Dubai (SIRA) market pack
--
-- Reverses 20260907093000_sp_uae_dubai_market_pack.sql. Runs FIRST in the
-- chain: Dubai, then UK, then the Swedish truth model, then the three-market
-- foundation.
--
-- That order is not a convention, it is enforced. The Swedish rollback
-- restores the original 16-character limit on credential codes, and
-- AE_DU_PEOPLE_OF_DETERMINATION is 30. Running the Swedish file first aborts
-- with ROLLBACK BLOCKED naming the count — which is how this ordering was
-- discovered rather than assumed.
--
-- ── UNLIKE THE OTHERS, THIS ONE TOUCHES NO FUNCTION ────────────────────
--
-- The Dubai migration changed no trigger and no RPC. It added one column and a
-- set of rows, which is what a market pack should be once the foundation is in
-- place — and is the clearest evidence that the foundation carried its weight.
--
-- ── PREFER THE SWITCH ──────────────────────────────────────────────────
--
--   UPDATE public.sp_market_packs
--      SET is_active = false, legal_review_state = 'pending'
--    WHERE code = 'AE-DU';
--
-- The pack already ships that way, so this file only matters if it was
-- activated and is now being removed entirely.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
-- Every Dubai claim, because a credential type cannot be dropped while claims
-- reference it. Export first:
--
--   \copy (SELECT * FROM public.sp_claims WHERE sub_jurisdiction_code = 'AE-DU')
--         TO 'sp_claims_dubai.csv' CSV HEADER
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The Dubai content
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles WHERE market_pack_code = 'AE-DU';
DELETE FROM public.sp_claims
 WHERE credential_code IN (SELECT code FROM public.sp_credential_types
                            WHERE market_pack_code = 'AE-DU');
-- Any remaining claim that named the emirate without a Dubai credential code.
DELETE FROM public.sp_claims WHERE sub_jurisdiction_code = 'AE-DU';
DELETE FROM public.sp_credential_types WHERE market_pack_code = 'AE-DU';
DELETE FROM public.sp_regulated_roles  WHERE market_pack_code = 'AE-DU';

-- ---------------------------------------------------------------------------
-- 2. The added column
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_credential_types
  DROP COLUMN IF EXISTS typical_validity_months;

-- ---------------------------------------------------------------------------
-- 3. Prove the other two markets are untouched
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV','OV_TRAINING','SE_PERSONNEL_APPROVAL')) <> 6 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: a Swedish credential went with the Dubai pack';
  END IF;

  IF (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code = 'GB') < 13 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED THE UK PACK: SIA credentials are missing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE market_pack_code = 'AE-DU') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: a Dubai credential survived';
  END IF;

  -- The Swedish narrow-result guard must survive the loss of its Dubai
  -- counterpart. They are asserted together in the forward migration, so a
  -- rollback that took both would pass that assertion for the wrong reason.
  IF (SELECT narrow_result_only FROM public.sp_credential_types
       WHERE code = 'SE_PERSONNEL_APPROVAL') IS NOT TRUE THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: the personnel approval is no longer narrow-result';
  END IF;
END $$;

COMMIT;
