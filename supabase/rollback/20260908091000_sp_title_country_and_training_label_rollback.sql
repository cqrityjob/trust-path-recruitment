-- =============================================================================
-- ROLLBACK — title country suffix and training label
--
-- Reverses 20260908091000_sp_title_country_and_training_label.sql by restoring
-- the labels the market-pack seeds originally carried.
--
-- Ordering is irrelevant here: this touches only two text columns on
-- sp_professional_titles and no function, so it may run at any point in the
-- chain. It is listed first for consistency with the others.
--
-- ── WHAT ROLLING THIS BACK RESTORES ────────────────────────────────────
--
--   * `Public Order Guard (Ordningsvakt) · Sweden · Sweden` on screen, because
--     the surfaces append the jurisdiction themselves; and
--   * `Väktare` for a holder who has completed VU1 and VU2 and holds no
--     appointment at all.
--
-- The second is the reason to think twice. It does not change what the engine
-- derives — the tier and the rules are untouched either way — but it changes
-- what a reader is told, in the direction of claiming more.
--
-- No data is lost: these are label columns, and no holder value lives in them.
--
-- The TypeScript mirror in src/lib/security-passport/identity/market-rules.ts
-- must be reverted in the same change, or
-- scripts/passport-title-derivation-check.ts will fail — which is that guard
-- working, not a problem to route around.
-- =============================================================================

BEGIN;

UPDATE public.sp_professional_titles
   SET name_local = 'Väktare', name_en = 'Security Guard · Sweden'
 WHERE code = 'SE_VAKTARE_COMPETENCE';

UPDATE public.sp_professional_titles
   SET name_local = 'Ordningsvakt', name_en = 'Public Order Guard (Ordningsvakt) · Sweden'
 WHERE code = 'SE_ORDNINGSVAKT_TITLE';

UPDATE public.sp_professional_titles
   SET name_local = 'Skyddsvakt', name_en = 'Protective Security Guard (Skyddsvakt) · Sweden'
 WHERE code = 'SE_SKYDDSVAKT_TITLE';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Guard (SIA licensed) · United Kingdom',
       name_en    = 'Security Guard (SIA licensed) · United Kingdom'
 WHERE code = 'GB_SIA_TITLE_SG';

UPDATE public.sp_professional_titles
   SET name_local = 'Door Supervisor (SIA licensed) · United Kingdom',
       name_en    = 'Door Supervisor (SIA licensed) · United Kingdom'
 WHERE code = 'GB_SIA_TITLE_DS';

UPDATE public.sp_professional_titles
   SET name_local = 'CCTV Operator (SIA licensed) · United Kingdom',
       name_en    = 'CCTV Operator (SIA licensed) · United Kingdom'
 WHERE code = 'GB_SIA_TITLE_CCTV';

UPDATE public.sp_professional_titles
   SET name_local = 'Close Protection Operative (SIA licensed) · United Kingdom',
       name_en    = 'Close Protection Operative (SIA licensed) · United Kingdom'
 WHERE code = 'GB_SIA_TITLE_CP';

UPDATE public.sp_professional_titles
   SET name_local = 'Cash and Valuables in Transit Operative (SIA licensed) · United Kingdom',
       name_en    = 'Cash and Valuables in Transit Operative (SIA licensed) · United Kingdom'
 WHERE code = 'GB_SIA_TITLE_CVIT';

UPDATE public.sp_professional_titles
   SET name_local = 'Key Holder (SIA licensed) · United Kingdom',
       name_en    = 'Key Holder (SIA licensed) · United Kingdom'
 WHERE code = 'GB_SIA_TITLE_KH';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Guard (SIRA cadre card) · Dubai, UAE',
       name_en    = 'Security Guard (SIRA cadre card) · Dubai, UAE'
 WHERE code = 'AE_DU_TITLE_GUARD';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Supervisor (SIRA cadre card) · Dubai, UAE',
       name_en    = 'Security Supervisor (SIRA cadre card) · Dubai, UAE'
 WHERE code = 'AE_DU_TITLE_SUPERVISOR';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Operations Manager (SIRA cadre card) · Dubai, UAE',
       name_en    = 'Security Operations Manager (SIRA cadre card) · Dubai, UAE'
 WHERE code = 'AE_DU_TITLE_OPS_MANAGER';

COMMIT;
