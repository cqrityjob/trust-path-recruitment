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
-- ---------------------------------------------------------------------------
-- Refuse rather than destroy a holder's record
-- ---------------------------------------------------------------------------
-- The blind `DELETE FROM sp_claims` below had two failure modes, and both were
-- real:
--
--   * `sp_claims.supersedes_id` is ON DELETE RESTRICT. A holder who CORRECTED
--     one of these credentials has two rows, and when the correction changed
--     the credential_code the filter catches only one of them — so the delete
--     aborts on a foreign key, mid-transaction, reporting a constraint name
--     rather than what actually happened. Reproduced against a real database.
--
--   * When it did NOT abort, it silently deleted a holder's claims, their
--     version history and their verifier attributions, to tidy a schema.
--
-- CI never saw either: the suites clean up after themselves, so by the time
-- the rollback ran there was nothing left to delete.
--
-- Count first, and refuse. A rollback that destroys holder data is not a
-- rollback, and making it succeed quietly is worse than making it stop.
DO $rbae$
DECLARE
  _claims    integer;
  _corrected integer;
  _opted_in  text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  SELECT count(*) INTO _claims FROM public.sp_claims c WHERE (c.credential_code IN (SELECT t.code FROM public.sp_credential_types t WHERE t.market_pack_code = 'AE-DU') OR c.sub_jurisdiction_code = 'AE-DU');

  SELECT count(*) INTO _corrected FROM public.sp_claims c
   WHERE ((c.credential_code IN (SELECT t.code FROM public.sp_credential_types t WHERE t.market_pack_code = 'AE-DU') OR c.sub_jurisdiction_code = 'AE-DU'))
     AND (c.supersedes_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.sp_claims s WHERE s.supersedes_id = c.id));

  IF _claims > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % Dubai holder claim(s) exist, % of them corrected. '
      'This rollback will not destroy a holder''s record to tidy a schema. '
      'RECOVERY: export the rows (see the header of this file), have each '
      'holder withdraw or correct the claim so their history survives, or '
      'accept the loss deliberately with '
      'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; then re-run.',
      _claims, _corrected;
  END IF;

  IF _claims > 0 THEN
    RAISE WARNING
      'Deleting % Dubai holder claim(s) — opted in explicitly.', _claims;
  END IF;
END $rbae$;

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
