-- Security Passport — the Dubai (SIRA) market pack.
--
-- Ships INACTIVE, on both gates, exactly as the UK pack does.
--
-- ── DUBAI, NOT THE UAE ─────────────────────────────────────────────────
--
-- Every row here is scoped to AE-DU. SIRA regulates the private security
-- industry in Dubai; the other six emirates have their own authorities, their
-- own vocabularies and their own processes, none of which have been reviewed
-- here. 20260907090000 lists all seven emirates and activates one, so a claim
-- for Abu Dhabi is refused with SP_SUB_JURISDICTION_NOT_SUPPORTED — a true
-- statement the UI can render — rather than being silently stored as "UAE".
--
-- A SIRA cadre card is not a UAE licence, and nothing in this pack says it is.
--
-- ── THE CARD IS NOT THE COURSES ────────────────────────────────────────
--
-- SIRA requires training before it issues a Security Cadre Card, and the
-- courses are separate facts from the card. Somebody who has completed the
-- Security Guard course and the fire-safety and life-support training but has
-- no card is not licensed to work — and with only a card credential available
-- they would have had nothing truthful to record. So the courses are their own
-- credentials, and they produce completed education and nothing else.
--
-- ── WHAT IS NOT STORED, AND WHY THE FITNESS CERTIFICATE IS NARROW ──────
--
-- No Emirates ID number or image. No residence-visa details. No good-conduct
-- certificate contents. No criminal information. No medical or fitness detail.
-- No reason for a rejection. No internal authority note.
--
-- The fitness certificate is the one place a medical detail could plausibly
-- have arrived, so it is marked narrow_result_only like the Swedish personnel
-- approval: the database refuses any holder note on it and any title other
-- than its controlled label. The product can record "Requirement checked",
-- with an authority and a date, and it structurally cannot record more.
--
-- ── ARABIC IS DELIBERATELY ABSENT ──────────────────────────────────────
--
-- name_ar is NULL on every row. Filling it with a machine translation of
-- Emirati security-law vocabulary would produce terms that LOOK authoritative
-- and that nobody competent has checked, which is worse than showing the
-- English. `labelFor` in the derivation engine already falls back to nameEn
-- when nameAr is null, and there is a test asserting exactly that. A native
-- and legal reviewer supplies these before the pack is ever activated.
--
-- Sources: registered by 20260907090000 as ae_du_sira_services,
-- ae_du_sira_cadre_card, ae_du_sira_cadre_card_individual,
-- ae_du_sira_training_centres, ae_du_sira_portal, ae_business_regulations and
-- ae_data_protection_laws. Fingerprinted 2026-08-22, at which point
-- portal.sira.gov.ae did not answer the checker at all — a standing limitation
-- that belongs in this pack's legal review, not in a weekly alert.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. How long a credential is normally granted for
-- ---------------------------------------------------------------------------
-- SIRA states that cadre licences are generally valid for two years. Recording
-- that as data lets the renewal engine offer a sensible default and lets a
-- form pre-fill an expiry the holder can correct.
--
-- It is explicitly NOT used to compute an expiry the holder did not give us.
-- The card says when it expires; a typical duration is not that date, and
-- inventing one would put a fabricated fact on a trust record.
ALTER TABLE public.sp_credential_types
  ADD COLUMN IF NOT EXISTS typical_validity_months integer
    CHECK (typical_validity_months IS NULL OR typical_validity_months BETWEEN 1 AND 240);

COMMENT ON COLUMN public.sp_credential_types.typical_validity_months IS
  'How long this credential is normally granted for, as published by its '
  'authority. A hint for renewal reminders and form defaults ONLY. Never used '
  'to derive an expiry date: the document states its own, and computing one '
  'would fabricate a fact on a trust record.';

-- ---------------------------------------------------------------------------
-- 2. The cadre roles
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_regulated_roles
  (code, market_pack_code, profession_family_code, authority_id,
   name_local, name_en, name_ar, is_active, sort_order)
SELECT v.code, 'AE-DU', 'SECURITY_GUARD', a.id, v.name, v.name, NULL, false, v.sort_order
FROM (VALUES
    ('AE_DU_SIRA_SECURITY_GUARD',      'Security Guard',              10),
    ('AE_DU_SIRA_SECURITY_SUPERVISOR', 'Security Supervisor',         20),
    ('AE_DU_SIRA_SECURITY_OPS_MANAGER','Security Operations Manager', 30)
  ) AS v(code, name, sort_order)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA') a
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The Security Cadre Card, one per cadre profession
-- ---------------------------------------------------------------------------
-- requires_scope is true: SIRA links a cadre card to the licensed company the
-- holder works for. A card shown without saying which company it is tied to
-- reads as a portable personal licence, which is not what was issued.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, name_ar, symbol_label,
   requires_valid_until, requires_issuer, requires_scope, is_active, sort_order,
   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
   legal_review_state, contributes_to, authority_id, regulated_role_id,
   typical_validity_months, reference_pattern, reference_label_en, reference_label_local)
SELECT
  v.code, 'licence', 'appointment',
  v.name_en, v.name_en, NULL, v.symbol,
  true, true, true, false, v.sort_order,
  'AE-DU', 'AE', 'AE-DU',
  'pending',
  ARRAY['local_eligibility', 'active_title']::text[],
  a.id, r.id,
  -- SIRA publishes two years as the general cadre validity. A hint, never a
  -- computed expiry: see the column comment above.
  24,
  -- Deliberately permissive. We have no confirmed specification for the card
  -- number's format, and inventing a pattern would reject valid cards — a far
  -- worse failure than accepting an oddly shaped one, because the holder has
  -- no way to argue with a regex. Tightened when the format is confirmed.
  '^[A-Za-z0-9/-]{4,32}$',
  'SIRA cadre card number', 'SIRA cadre card number'
FROM (VALUES
    ('AE_DU_SIRA_CARD_GUARD',       'SIRA Security Cadre Card — Security Guard',              'SCG',  410, 'AE_DU_SIRA_SECURITY_GUARD'),
    ('AE_DU_SIRA_CARD_SUPERVISOR',  'SIRA Security Cadre Card — Security Supervisor',         'SCS',  420, 'AE_DU_SIRA_SECURITY_SUPERVISOR'),
    ('AE_DU_SIRA_CARD_OPS_MANAGER', 'SIRA Security Cadre Card — Security Operations Manager', 'SCM',  430, 'AE_DU_SIRA_SECURITY_OPS_MANAGER')
  ) AS v(code, name_en, symbol, sort_order, role_code)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA') a
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. The training, which is not the card
-- ---------------------------------------------------------------------------
-- Issuer is required on all of them: a SIRA-certified training centre is a
-- named organisation, and a course nobody delivered is not a course.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, name_ar, symbol_label,
   requires_valid_until, requires_issuer, is_active, sort_order,
   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
   legal_review_state, contributes_to, authority_id,
   reference_label_en, reference_label_local)
SELECT
  v.code, 'training', 'qualification',
  v.name_en, v.name_en, NULL, v.symbol,
  false, true, false, v.sort_order,
  'AE-DU', 'AE', 'AE-DU',
  'pending',
  ARRAY['education_completed']::text[],
  a.id,
  'Certificate number', 'Certificate number'
FROM (VALUES
    ('AE_DU_SIRA_GUARD_COURSE',     'SIRA Security Guard course',                  'SGC', 510),
    ('AE_DU_BASIC_FIRE_SAFETY',     'Basic Fire Safety training',                  'BFS', 520),
    ('AE_DU_BASIC_LIFE_SUPPORT',    'Basic Life Support training',                 'BLS', 530),
    ('AE_DU_PEOPLE_OF_DETERMINATION','People of Determination training',           'POD', 540),
    ('AE_DU_SPECIALIST_COURSE',     'SIRA specialist security course',             'SPC', 550)
  ) AS v(code, name_en, symbol, sort_order)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA') a
ON CONFLICT (code) DO NOTHING;

-- The fitness certificate. A checked requirement and NOTHING else: no note may
-- be attached and the title must be the controlled label, enforced by
-- sp_claims_credential_rules for every caller including service_role. This is
-- the same mechanism the Swedish personnel approval uses, and it is here for
-- the same reason — it is the one row where a medical detail could plausibly
-- have arrived.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, name_ar, symbol_label,
   requires_valid_until, requires_issuer, narrow_result_only, is_active, sort_order,
   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
   legal_review_state, contributes_to, authority_id)
SELECT
  'AE_DU_FITNESS_CHECKED', 'certification', 'qualification',
  'Fitness requirement checked', 'Fitness requirement checked', NULL, 'FIT',
  false, true, true, false, 560,
  'AE-DU', 'AE', 'AE-DU',
  'pending',
  -- Deliberately EMPTY. A fitness check is a recorded fact, not a derived
  -- anything.
  --
  -- The first draft had it produce local_eligibility, and the Swedish suite
  -- immediately failed it: "an authority-bearing rule rests on a
  -- qualification". The suite was right. Eligibility means an authority
  -- currently permits this person to work, and passing a medical does not —
  -- SIRA issues the card, and the card is what permits anything.
  --
  -- Weakening that assertion to accommodate this row would have removed a real
  -- guard to make a wrong model fit. The credential still appears in the
  -- holder's record and in an employer's view of a disclosure; it simply does
  -- not derive a status of its own.
  ARRAY[]::text[],
  a.id
FROM (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA') a
ON CONFLICT (code) DO NOTHING;

COMMENT ON COLUMN public.sp_claims.holder_note IS
  'PRIVATE, holder-authored. Never a verification finding and never '
  'disclosed publicly. REFUSED entirely on narrow_result_only credentials — '
  'the Swedish personnel approval and the Dubai fitness requirement — because '
  'those are the rows where register contents or medical detail would '
  'otherwise arrive.';


-- ---------------------------------------------------------------------------
-- 5. The Dubai derivation rules
-- ---------------------------------------------------------------------------
-- Active titles come from the CARD and only the card. The five courses produce
-- completed education; the fitness check produces eligibility. Somebody with
-- every course and no card derives a list of things they have completed and no
-- professional title at all, which is the truth about their position.

INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, name_ar, requires_credential_codes,
   requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'AE-DU', 'SECURITY_GUARD', r.id, v.output_kind,
       v.name, v.name, NULL, ARRAY[v.cred]::text[], 'verified', true, false, v.priority
FROM (VALUES
  -- Titles, from the cadre card. Each says Dubai out loud: a reader must not
  -- be able to take one of these for a UAE-wide or portable licence.
  ('AE_DU_TITLE_GUARD',      'active_title',
   'Security Guard (SIRA cadre card) · Dubai, UAE',
   'AE_DU_SIRA_CARD_GUARD',       'AE_DU_SIRA_SECURITY_GUARD',       410),
  ('AE_DU_TITLE_SUPERVISOR', 'active_title',
   'Security Supervisor (SIRA cadre card) · Dubai, UAE',
   'AE_DU_SIRA_CARD_SUPERVISOR',  'AE_DU_SIRA_SECURITY_SUPERVISOR',  420),
  ('AE_DU_TITLE_OPS_MANAGER','active_title',
   'Security Operations Manager (SIRA cadre card) · Dubai, UAE',
   'AE_DU_SIRA_CARD_OPS_MANAGER', 'AE_DU_SIRA_SECURITY_OPS_MANAGER', 430),

  -- Eligibility, separately.
  ('AE_DU_ELIG_GUARD',       'local_eligibility', 'SIRA cadre card active — security guard',
   'AE_DU_SIRA_CARD_GUARD',       'AE_DU_SIRA_SECURITY_GUARD',       510),
  ('AE_DU_ELIG_SUPERVISOR',  'local_eligibility', 'SIRA cadre card active — security supervisor',
   'AE_DU_SIRA_CARD_SUPERVISOR',  'AE_DU_SIRA_SECURITY_SUPERVISOR',  520),
  ('AE_DU_ELIG_OPS_MANAGER', 'local_eligibility', 'SIRA cadre card active — security operations manager',
   'AE_DU_SIRA_CARD_OPS_MANAGER', 'AE_DU_SIRA_SECURITY_OPS_MANAGER', 530),
  -- Education. Five courses, five rows, no title among them.
  ('AE_DU_EDU_GUARD_COURSE', 'education_completed', 'SIRA Security Guard course completed',
   'AE_DU_SIRA_GUARD_COURSE',      NULL, 610),
  ('AE_DU_EDU_FIRE',         'education_completed', 'Basic Fire Safety training completed',
   'AE_DU_BASIC_FIRE_SAFETY',      NULL, 620),
  ('AE_DU_EDU_BLS',          'education_completed', 'Basic Life Support training completed',
   'AE_DU_BASIC_LIFE_SUPPORT',     NULL, 630),
  ('AE_DU_EDU_POD',          'education_completed', 'People of Determination training completed',
   'AE_DU_PEOPLE_OF_DETERMINATION',NULL, 640),
  ('AE_DU_EDU_SPECIALIST',   'education_completed', 'SIRA specialist security course completed',
   'AE_DU_SPECIALIST_COURSE',      NULL, 650)
) AS v(code, output_kind, name, cred, role_code, priority)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 6. A standing guard on what may never be stored
-- ---------------------------------------------------------------------------
-- The prohibitions in this file's header are mostly enforced by absence: there
-- is no column for an Emirates ID, a visa status or a conduct certificate, and
-- adding one would be a visible schema change somebody has to justify.
--
-- This assertion covers the one thing absence does not: that nobody quietly
-- un-marks a narrow-result credential later. It runs at migration time and
-- again in supabase/tests/security_passport_uae_dubai_market_pack_test.sql, so
-- a future edit that widens either row fails the build rather than shipping.
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE code IN ('SE_PERSONNEL_APPROVAL', 'AE_DU_FITNESS_CHECKED')
     AND narrow_result_only;
  IF _n <> 2 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: expected 2 narrow-result credentials, found %. '
      'The Swedish personnel approval and the Dubai fitness check are the two '
      'rows where register contents or medical detail could otherwise be '
      'stored, and both must refuse a holder note.', _n;
  END IF;
END $$;

COMMIT;