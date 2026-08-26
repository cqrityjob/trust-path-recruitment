-- Security Passport — the eighth SIA licence, and the only one that is not
-- licensable across Great Britain.
--
-- Ships INACTIVE on both gates, exactly as the rest of the UK pack does.
--
-- ── WHY THIS IS NOT SIMPLY AN EIGHTH ROW IN THE GB PACK ────────────────
--
-- The SIA licenses vehicle immobilisation in NORTHERN IRELAND ONLY. Wheel-
-- clamping on private land has been an offence in England and Wales since the
-- Protection of Freedoms Act 2012 and there is no licence to hold there, so a
-- vehicle immobilisation licence recorded as a plain 'GB' credential would
-- assert something that is not true anywhere on the island of Great Britain.
--
-- Putting it in the GB pack with a footnote would leave the footnote as the
-- only thing standing between a holder in Manchester and a licence that
-- cannot exist there — and a footnote is not a constraint.
--
-- So Northern Ireland gets the same treatment Dubai got: its own
-- sub-jurisdiction and its own market pack. The credential carries
-- sub_jurisdiction_code = 'GB-NI', which means sp_claims_credential_rules
-- refuses any claim on it that does not name Northern Ireland — for every
-- caller, including service_role.
--
-- ── WHY THIS DOES NOT MAKE THE UK A SUB-JURISDICTION MARKET ────────────
--
-- The 'GB' national pack stays exactly as it is, and it keeps the other seven
-- licences. The trigger only asks "does this country need a sub-jurisdiction"
-- when the pack lookup FAILS, and a claim of jurisdiction 'GB' with no
-- sub-jurisdiction still finds the national pack on the first try. Nothing
-- about the seven existing licences changes, and no UK holder is asked a
-- question they do not have an answer to.
--
-- The UAE is the opposite case and stays the opposite case: it has NO national
-- pack, so 'AE' with no emirate still fails with SP_SUB_JURISDICTION_REQUIRED.
--
-- Source: gb_sia_need_a_licence, registered in sp_regulatory_sources by
-- 20260907090000. Read 25 August 2026: the SIA lists vehicle immobilisation
-- among its licensable activities and states it applies in Northern Ireland
-- only. That reading is this pack's to confirm at legal review, which has not
-- happened — legal_review_state stays 'pending' and is_active stays false.

--
-- ── WHY THE VERSION MOVED ──────────────────────────────────────────────
--
-- Authored as 20260908094000 against main at 0a2677f. Main advanced 99 commits
-- before this branch was opened, and 20260908094000 is now taken by
-- 20260908094000_sp_disclosure_holder_sub_jurisdiction.sql, which is applied hosted.
-- This file was therefore reallocated to the next canonical slot AFTER the
-- current head of the active path (20260913092000). The SQL is unchanged; only
-- the version is.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Northern Ireland, as a sub-jurisdiction
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_sub_jurisdictions (code, jurisdiction_code, name_sv, name_en, is_active)
VALUES ('GB-NI', 'GB', 'Nordirland', 'Northern Ireland', true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Its market pack — authored, unreviewed, switched off
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_market_packs
  (code, jurisdiction_code, sub_jurisdiction_code,
   name_sv, name_en, legal_review_state, is_active)
VALUES
  ('GB-NI', 'GB', 'GB-NI',
   'Nordirland (SIA)', 'Northern Ireland (SIA)', 'pending', false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The licensable activity
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_regulated_roles
  (code, market_pack_code, profession_family_code, authority_id,
   name_local, name_en, is_active, sort_order)
SELECT 'GB_NI_SIA_VEHICLE_IMMOBILISATION', 'GB-NI', 'SECURITY_GUARD', a.id,
       'Vehicle immobilisation', 'Vehicle immobilisation', false, 80
FROM (SELECT id FROM public.sp_authorities WHERE code = 'GB_SIA') a
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. The licence
-- ---------------------------------------------------------------------------
-- Same sixteen-digit reference and the same authority as every other SIA
-- licence: the SIA issues this one too. Only the territory differs, and the
-- territory is the whole reason the row lives in its own pack.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, symbol_label,
   requires_valid_until, requires_issuer, is_active, sort_order,
   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
   legal_review_state, contributes_to, authority_id, regulated_role_id,
   reference_pattern, reference_label_en, reference_label_local)
SELECT
  'UK_SIA_LICENCE_VI', 'licence', 'appointment',
  'SIA Licence — Vehicle Immobilisation (Northern Ireland)',
  'SIA Licence — Vehicle Immobilisation (Northern Ireland)',
  'VI',
  true, true, false, 180,
  'GB-NI', 'GB', 'GB-NI',
  'pending',
  ARRAY['local_eligibility', 'active_title']::text[],
  a.id, r.id,
  '^[0-9]{16}$',
  'SIA licence number (16 digits)', 'SIA licence number (16 digits)'
FROM (SELECT id FROM public.sp_authorities WHERE code = 'GB_SIA') a
LEFT JOIN public.sp_regulated_roles r
       ON r.code = 'GB_NI_SIA_VEHICLE_IMMOBILISATION'
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Derivation
-- ---------------------------------------------------------------------------
-- Both names say Northern Ireland out loud. A reader must not be able to take
-- this for a licence that means anything in England, Scotland or Wales.
--
-- There is deliberately NO licence-linked qualification row here. The SIA
-- recognises licence-linked qualifications for the front-line sectors listed
-- in 20260907092000; inventing one for vehicle immobilisation to make the
-- pack look symmetrical would be inventing a qualification.
INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, requires_credential_codes,
   requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'GB-NI', 'SECURITY_GUARD', r.id, v.output_kind,
       v.name, v.name, ARRAY['UK_SIA_LICENCE_VI']::text[],
       'verified', true, false, v.priority
FROM (VALUES
  ('GB_NI_SIA_TITLE_VI', 'active_title',
   'Vehicle Immobiliser (SIA licensed) · Northern Ireland', 180),
  ('GB_NI_SIA_ELIG_VI',  'local_eligibility',
   'SIA licence active — vehicle immobilisation (Northern Ireland)', 280)
) AS v(code, output_kind, name, priority)
LEFT JOIN public.sp_regulated_roles r
       ON r.code = 'GB_NI_SIA_VEHICLE_IMMOBILISATION'
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. The national pack is untouched, and this asserts it
-- ---------------------------------------------------------------------------
-- If a later edit moves vehicle immobilisation into the GB national pack, or
-- moves one of the seven national licences into GB-NI, this fails the
-- migration rather than shipping a licence into a territory that does not
-- license it.
DO $$
DECLARE _gb integer; _ni integer;
BEGIN
  SELECT count(*) INTO _gb FROM public.sp_credential_types
   WHERE market_pack_code = 'GB';
  SELECT count(*) INTO _ni FROM public.sp_credential_types
   WHERE market_pack_code = 'GB-NI';

  IF _gb <> 13 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: expected 13 credentials in the GB national pack '
      '(7 licences + 6 qualifications), found %.', _gb;
  END IF;

  IF _ni <> 1 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: expected exactly 1 credential in GB-NI (vehicle '
      'immobilisation), found %.', _ni;
  END IF;
END $$;

COMMIT;
