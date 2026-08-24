-- Rollback for 20260908093000_sp_profile_work_country.sql
--
-- Restores the previous shape: a NOT NULL jurisdiction_code defaulting to
-- 'SE', and no sub-jurisdiction column.
--
-- ── THIS ROLLBACK LOSES INFORMATION, ON PURPOSE ────────────────────────
--
-- Going back means the column must be NOT NULL again, and any profile whose
-- holder has NOT yet stated a country is NULL. There is no honest value to put
-- there — that is the whole point of the forward migration — so restoring the
-- constraint necessarily writes 'SE' over "not stated", re-creating exactly
-- the fabricated fact the forward migration removed.
--
-- It is written down rather than hidden because a rollback that silently
-- invents a country for every unfinished holder is the kind of thing an
-- operator must decide to do, not discover afterwards. The UPDATE below is
-- deliberately narrow: it touches ONLY rows that are NULL, so a holder who
-- explicitly chose Sweden and one who was never asked end up indistinguishable
-- again — which is the pre-migration state, and the reason it was changed.
--
-- Any recorded emirate is dropped with the column. A holder who said "Dubai"
-- becomes a holder who said "United Arab Emirates" if their country survives,
-- and the emirate cannot be recovered from anywhere else.

BEGIN;

ALTER TABLE public.sp_passport_profiles
  DROP CONSTRAINT IF EXISTS sp_profile_confirmed_needs_country;

ALTER TABLE public.sp_passport_profiles
  DROP CONSTRAINT IF EXISTS sp_profile_sub_matches_country;

-- Provenance is lost with the column. After this, a confirmed Swedish holder
-- and a legacy row that was never asked are indistinguishable again — which is
-- the pre-migration state, and the reason the column was added.
ALTER TABLE public.sp_passport_profiles
  DROP COLUMN IF EXISTS work_location_confirmed_at;

ALTER TABLE public.sp_passport_profiles
  DROP COLUMN IF EXISTS sub_jurisdiction_code;

-- See the note above: this invents Sweden for holders who never stated one,
-- because NOT NULL leaves no alternative.
UPDATE public.sp_passport_profiles
   SET jurisdiction_code = 'SE'
 WHERE jurisdiction_code IS NULL;

ALTER TABLE public.sp_passport_profiles
  ALTER COLUMN jurisdiction_code SET NOT NULL;

ALTER TABLE public.sp_passport_profiles
  ALTER COLUMN jurisdiction_code SET DEFAULT 'SE';

COMMIT;
