-- Security Passport — say the country once, and call training training.
--
-- Two wording changes to `sp_professional_titles`. Neither touches the tier
-- architecture, the derivation rules or any credential requirement.
--
-- ── A4 · THE COUNTRY WAS PRINTED TWICE ─────────────────────────────────
--
-- Observed on screen:
--
--     Public Order Guard (Ordningsvakt) · Sweden · Sweden
--
-- `name_en` ends in `· Sweden`, and PassportCard, PassportOverview,
-- RecipientVerification and share-image each append the jurisdiction
-- separately. Every market pack uses the same suffix, so this repeats for every
-- market rather than being a Swedish quirk.
--
-- Fixed in the DATA, not the four components. A component that strips a suffix
-- has to know which suffixes exist, and the next market adds another one.
--
-- ── DUBAI KEEPS ITS EMIRATE ────────────────────────────────────────────
--
-- `· Dubai, UAE` is not a country suffix. The country is UAE; Dubai is the
-- emirate, and it is in the label deliberately so a reader cannot take a SIRA
-- cadre card for a national licence. Nothing else renders the emirate — the
-- surfaces append the JURISDICTION, which is the country.
--
-- So only `, UAE` goes. The result reads `… · Dubai` plus the appended country:
-- emirate once, country once, and the claim it makes is unchanged.
--
-- ── A5 · VU1 + VU2 IS TRAINING, NOT A CURRENT APPOINTMENT ──────────────
--
-- `SE_VAKTARE_COMPETENCE` rendered as `Väktare` / `Security Guard · Sweden`.
-- Completing VU1 and VU2 is grundutbildning. It is not a personnel approval and
-- not an appointment, and a holder who has done both is not thereby something an
-- employer may treat as cleared to work.
--
-- The rule already refuses to derive an ACTIVE TITLE from them — this is a
-- competence row, and 20260907091000 asserts no authority-bearing rule may rest
-- on a qualification. The wording lagged behind the rule; it now says what the
-- evidence actually is.
--
-- ── WHY THE TIER DELIBERATELY DOES NOT CHANGE ──────────────────────────
--
-- An education-sounding label now sits in the `professional_competence` tier,
-- which looks untidy. It stays.
--
-- Moving it to `education_completed` would be a semantic claim, not a tidy-up:
-- the tier is what `headlineTitles` ranks, so demoting it would change which
-- surfaces show it and in what order.
--
-- Erring toward the conservative label inside the existing tier changes what a
-- reader is told without changing what the engine derives. That is the safe
-- direction, and this note exists so nobody "corrects" it back.

BEGIN;

-- ---------------------------------------------------------------------------
-- A5 · the Swedish training label
-- ---------------------------------------------------------------------------
UPDATE public.sp_professional_titles
   SET name_local = 'Väktarutbildning (VU1 + VU2)',
       name_en    = 'Security Guard Training (VU1 + VU2)'
 WHERE code = 'SE_VAKTARE_COMPETENCE';

-- ---------------------------------------------------------------------------
-- A4 · the country, once
-- ---------------------------------------------------------------------------
UPDATE public.sp_professional_titles
   SET name_local = 'Ordningsvakt', name_en = 'Public Order Guard (Ordningsvakt)'
 WHERE code = 'SE_ORDNINGSVAKT_TITLE';

UPDATE public.sp_professional_titles
   SET name_local = 'Skyddsvakt', name_en = 'Protective Security Guard (Skyddsvakt)'
 WHERE code = 'SE_SKYDDSVAKT_TITLE';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Guard (SIA licensed)', name_en = 'Security Guard (SIA licensed)'
 WHERE code = 'GB_SIA_TITLE_SG';

UPDATE public.sp_professional_titles
   SET name_local = 'Door Supervisor (SIA licensed)', name_en = 'Door Supervisor (SIA licensed)'
 WHERE code = 'GB_SIA_TITLE_DS';

UPDATE public.sp_professional_titles
   SET name_local = 'CCTV Operator (SIA licensed)', name_en = 'CCTV Operator (SIA licensed)'
 WHERE code = 'GB_SIA_TITLE_CCTV';

UPDATE public.sp_professional_titles
   SET name_local = 'Close Protection Operative (SIA licensed)',
       name_en    = 'Close Protection Operative (SIA licensed)'
 WHERE code = 'GB_SIA_TITLE_CP';

UPDATE public.sp_professional_titles
   SET name_local = 'Cash and Valuables in Transit Operative (SIA licensed)',
       name_en    = 'Cash and Valuables in Transit Operative (SIA licensed)'
 WHERE code = 'GB_SIA_TITLE_CVIT';

UPDATE public.sp_professional_titles
   SET name_local = 'Key Holder (SIA licensed)', name_en = 'Key Holder (SIA licensed)'
 WHERE code = 'GB_SIA_TITLE_KH';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Guard (SIRA cadre card) · Dubai',
       name_en    = 'Security Guard (SIRA cadre card) · Dubai'
 WHERE code = 'AE_DU_TITLE_GUARD';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Supervisor (SIRA cadre card) · Dubai',
       name_en    = 'Security Supervisor (SIRA cadre card) · Dubai'
 WHERE code = 'AE_DU_TITLE_SUPERVISOR';

UPDATE public.sp_professional_titles
   SET name_local = 'Security Operations Manager (SIRA cadre card) · Dubai',
       name_en    = 'Security Operations Manager (SIRA cadre card) · Dubai'
 WHERE code = 'AE_DU_TITLE_OPS_MANAGER';

-- ---------------------------------------------------------------------------
-- Prove it, at migration time
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE _country_suffixed integer; _vaktare text;
BEGIN
  -- No title may end in a COUNTRY. `· Dubai` is an emirate and is allowed.
  SELECT count(*) INTO _country_suffixed
    FROM public.sp_professional_titles
   WHERE name_en ~ '(Sweden|United Kingdom|UAE|United Arab Emirates)\s*$'
      OR name_local ~ '(Sverige|Sweden|United Kingdom|UAE|United Arab Emirates)\s*$';
  IF _country_suffixed > 0 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: % title(s) still end in a country name. The surfaces '
      'append the jurisdiction themselves, so the country would print twice.',
      _country_suffixed;
  END IF;

  SELECT name_en INTO _vaktare FROM public.sp_professional_titles
   WHERE code = 'SE_VAKTARE_COMPETENCE';
  IF _vaktare <> 'Security Guard Training (VU1 + VU2)' THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: the Väktare training label did not apply';
  END IF;

  -- The Dubai titles must still name their emirate: that is what stops a cadre
  -- card being read as a national licence.
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE market_pack_code = 'AE-DU' AND output_kind = 'active_title'
                AND name_en NOT LIKE '%Dubai%') THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: a Dubai title lost its emirate';
  END IF;
END $mig$;

COMMIT;