-- Rollback for 20261006090000_cd_layer4_entry_gap_professions.sql.
--
-- Safe unconditionally: these four professions were never approved for
-- ranking, so no stored report can reference them and no candidate ever saw
-- them. The profile rows cascade from cd_professions, but are deleted
-- explicitly first so the rollback is readable rather than relying on the
-- foreign key's ON DELETE CASCADE.

DELETE FROM public.cd_profession_profiles
WHERE profession_id IN ('SP015','SP016','SP017','SP018');

DELETE FROM public.cd_professions
WHERE profession_id IN ('SP015','SP016','SP017','SP018')
  AND approved_for_ranking = false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cd_professions WHERE profession_id IN ('SP015','SP016','SP017','SP018')
  ) THEN
    RAISE EXCEPTION 'rollback failed: a drafted entry-gap profession survived (was it approved?)';
  END IF;
END $$;
