-- =============================================================================
-- ROLLBACK — Security Passport UK vehicle immobilisation (Northern Ireland)
--
-- Reverses 20260914090000_sp_uk_vehicle_immobilisation.sql.
--
-- Runs after the Abu Dhabi and Dubai-catalogue rollbacks and BEFORE the UK
-- market pack rollback. The ordering matters twice over:
--
--   * the UK pack rollback deletes `market_pack_code = 'GB'`, which does NOT
--     match 'GB-NI'. Left in place, UK_SIA_LICENCE_VI survives the UK
--     rollback and then blocks the Swedish one, which restores the original
--     16-character credential-code limit;
--
--   * and sp_market_packs.sub_jurisdiction_code references
--     sp_sub_jurisdictions, so the GB-NI pack must go before its
--     sub-jurisdiction row.
--
-- ── WHAT IS DELIBERATELY LEFT BEHIND ───────────────────────────────────
--
-- Nothing belonging to the seven Great Britain licences. This file names GB-NI
-- everywhere and never 'GB', so the national pack cannot be caught by it —
-- asserted in section 3.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
-- Claims on the vehicle immobilisation licence. Export first:
--
--   \copy (SELECT * FROM public.sp_claims WHERE sub_jurisdiction_code = 'GB-NI')
--         TO 'sp_claims_northern_ireland.csv' CSV HEADER
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refuse rather than destroy a holder's record
-- ---------------------------------------------------------------------------
DO $rbni$
DECLARE
  _claims    integer;
  _corrected integer;
  _opted_in  text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  SELECT count(*) INTO _claims FROM public.sp_claims c
   WHERE c.credential_code = 'UK_SIA_LICENCE_VI'
      OR c.sub_jurisdiction_code = 'GB-NI';

  SELECT count(*) INTO _corrected FROM public.sp_claims c
   WHERE (c.credential_code = 'UK_SIA_LICENCE_VI' OR c.sub_jurisdiction_code = 'GB-NI')
     AND (c.supersedes_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.sp_claims s WHERE s.supersedes_id = c.id));

  IF _claims > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % Northern Ireland holder claim(s) exist, % of them '
      'corrected. This rollback will not destroy a holder''s record to tidy a '
      'schema. RECOVERY: export the rows (see the header of this file), have '
      'each holder withdraw or correct the claim so their history survives, or '
      'accept the loss deliberately with '
      'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; then re-run.',
      _claims, _corrected;
  END IF;

  IF _claims > 0 THEN
    RAISE WARNING
      'Deleting % Northern Ireland holder claim(s) — opted in explicitly.', _claims;
  END IF;
END $rbni$;

-- ---------------------------------------------------------------------------
-- 2. The Northern Ireland content
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles WHERE market_pack_code = 'GB-NI';
DELETE FROM public.sp_claims WHERE credential_code = 'UK_SIA_LICENCE_VI';
DELETE FROM public.sp_claims WHERE sub_jurisdiction_code = 'GB-NI';
DELETE FROM public.sp_credential_types WHERE market_pack_code = 'GB-NI';
DELETE FROM public.sp_regulated_roles  WHERE market_pack_code = 'GB-NI';
DELETE FROM public.sp_market_packs     WHERE code = 'GB-NI';
-- Added by this migration, so removed by this rollback — unlike the seven
-- emirates, which 20260907090000 seeded and 20260907090000 removes.
DELETE FROM public.sp_sub_jurisdictions WHERE code = 'GB-NI';

-- ---------------------------------------------------------------------------
-- 3. Prove Great Britain is untouched
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE code = 'UK_SIA_LICENCE_VI') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: the vehicle immobilisation licence survived';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions WHERE code = 'GB-NI') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: the GB-NI sub-jurisdiction survived';
  END IF;

  -- The seven Great Britain licences and six qualifications. This is the
  -- assertion that would catch a rollback written against 'GB' instead of
  -- 'GB-NI'.
  IF (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code = 'GB') <> 13 THEN
    RAISE EXCEPTION
      'ROLLBACK DAMAGED THE UK PACK: expected 13 GB credentials, found %',
      (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code = 'GB');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'GB') THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED THE UK PACK: the GB national pack went with GB-NI';
  END IF;

  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV')) <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: a Swedish credential went with GB-NI';
  END IF;
END $$;

COMMIT;
