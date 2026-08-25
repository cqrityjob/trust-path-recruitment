-- =============================================================================
-- ROLLBACK — Security Passport Abu Dhabi (Ministry of Interior / PSBD) pack
--
-- Reverses 20260908096000_sp_uae_abu_dhabi_market_pack.sql. Runs FIRST in the
-- chain, before the Dubai catalogue, the UK vehicle immobilisation pack, and
-- everything that came before them.
--
-- That order is enforced rather than conventional, for the reason the Dubai
-- rollback gives: the Swedish rollback restores the original 16-character
-- limit on credential codes, and AE_AZ_PSBD_LICENCE_SUPERVISOR is 29. Running
-- the Swedish file first aborts with ROLLBACK BLOCKED naming the count.
--
-- ── PREFER THE SWITCH ──────────────────────────────────────────────────
--
--   UPDATE public.sp_market_packs
--      SET is_active = false, legal_review_state = 'pending'
--    WHERE code = 'AE-AZ';
--
-- The pack already ships that way and the forward migration refuses to
-- complete if it does not, so this file only matters if Abu Dhabi was
-- activated and is now being removed entirely.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
-- Every Abu Dhabi claim, because a credential type cannot be dropped while
-- claims reference it. Export first:
--
--   \copy (SELECT * FROM public.sp_claims WHERE sub_jurisdiction_code = 'AE-AZ')
--         TO 'sp_claims_abu_dhabi.csv' CSV HEADER
--
-- ── WHAT IS DELIBERATELY LEFT BEHIND ───────────────────────────────────
--
-- The AE-AZ row in sp_sub_jurisdictions. It was seeded by 20260907090000, not
-- by this migration, and Abu Dhabi existing as a named, unsupported emirate is
-- that migration's decision to reverse. Removing it here would make the
-- three-market foundation's own rollback assert against a state this file
-- created.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refuse rather than destroy a holder's record
-- ---------------------------------------------------------------------------
-- Same guard, and the same reasoning, as the Dubai and UK rollbacks: a
-- rollback that silently deletes a holder's claims, their version history and
-- their verifier attributions in order to tidy a schema is not a rollback.
DO $rbaz$
DECLARE
  _claims    integer;
  _corrected integer;
  _opted_in  text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  SELECT count(*) INTO _claims FROM public.sp_claims c
   WHERE c.credential_code IN (SELECT t.code FROM public.sp_credential_types t
                                WHERE t.market_pack_code = 'AE-AZ')
      OR c.sub_jurisdiction_code = 'AE-AZ';

  SELECT count(*) INTO _corrected FROM public.sp_claims c
   WHERE (c.credential_code IN (SELECT t.code FROM public.sp_credential_types t
                                 WHERE t.market_pack_code = 'AE-AZ')
          OR c.sub_jurisdiction_code = 'AE-AZ')
     AND (c.supersedes_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.sp_claims s WHERE s.supersedes_id = c.id));

  IF _claims > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % Abu Dhabi holder claim(s) exist, % of them corrected. '
      'This rollback will not destroy a holder''s record to tidy a schema. '
      'RECOVERY: export the rows (see the header of this file), have each '
      'holder withdraw or correct the claim so their history survives, or '
      'accept the loss deliberately with '
      'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; then re-run.',
      _claims, _corrected;
  END IF;

  IF _claims > 0 THEN
    RAISE WARNING
      'Deleting % Abu Dhabi holder claim(s) — opted in explicitly.', _claims;
  END IF;
END $rbaz$;

-- ---------------------------------------------------------------------------
-- 2. The Abu Dhabi content
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles WHERE market_pack_code = 'AE-AZ';
DELETE FROM public.sp_claims
 WHERE credential_code IN (SELECT code FROM public.sp_credential_types
                            WHERE market_pack_code = 'AE-AZ');
DELETE FROM public.sp_claims WHERE sub_jurisdiction_code = 'AE-AZ';
DELETE FROM public.sp_credential_types WHERE market_pack_code = 'AE-AZ';
DELETE FROM public.sp_regulated_roles  WHERE market_pack_code = 'AE-AZ';

-- The source goes BEFORE the pack and the authority, because it references
-- both. Written the other way round first, and sp_market_packs refused the
-- delete with sp_regulatory_sources_market_pack_code_fkey — which is the
-- registry doing its job: a rule's source cannot outlive the market it
-- describes, and it cannot be orphaned to let the market go either.
DELETE FROM public.sp_source_review_items
 WHERE source_id IN (SELECT id FROM public.sp_regulatory_sources
                      WHERE source_key = 'ae_moi_private_security');
DELETE FROM public.sp_regulatory_sources WHERE source_key = 'ae_moi_private_security';

DELETE FROM public.sp_market_packs WHERE code = 'AE-AZ';
DELETE FROM public.sp_authorities  WHERE code = 'AE_MOI_PSBD';

-- ---------------------------------------------------------------------------
-- 3. Prove the other markets are untouched
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE market_pack_code = 'AE-AZ') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: an Abu Dhabi credential survived';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'AE-AZ') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: the Abu Dhabi market pack survived';
  END IF;

  -- Dubai is a DIFFERENT emirate with a different regulator, and removing Abu
  -- Dhabi must not touch it. This is the assertion that would catch a rollback
  -- written as "delete where jurisdiction_code = 'AE'".
  IF NOT EXISTS (SELECT 1 FROM public.sp_credential_types
                  WHERE code = 'AE_DU_SIRA_CARD_GUARD') THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED DUBAI: a SIRA cadre card went with the Abu Dhabi pack';
  END IF;

  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV')) <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: a Swedish credential went with the Abu Dhabi pack';
  END IF;

  IF (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code = 'GB') < 13 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED THE UK PACK: SIA credentials are missing';
  END IF;
END $$;

COMMIT;
