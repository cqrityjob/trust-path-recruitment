-- Security Passport — the Abu Dhabi market pack (Ministry of Interior / PSBD).
--
-- Ships INACTIVE on both gates, and this pack means it more than any other.
--
-- ── WHY ABU DHABI IS NOT DUBAI ─────────────────────────────────────────
--
-- SIRA is Dubai's regulator. It is not the UAE's. The federal path runs
-- through the Ministry of Interior's Private Security Business Department, and
-- an Abu Dhabi private security guard is licensed under that framework — not
-- by SIRA, not with a SIRA cadre card, and not with anything this repository
-- may describe as one.
--
-- Before this migration, Abu Dhabi had a sub-jurisdiction row and no pack, so
-- a claim naming it was refused with SP_SUB_JURISDICTION_NOT_SUPPORTED. That
-- was correct and it stays correct in effect: what changes is only WHICH true
-- statement the database makes. Abu Dhabi now has an authored catalogue whose
-- legal review has not happened, so the refusal becomes
-- SP_MARKET_PACK_NOT_ACTIVE — "authored, pending review" rather than "we have
-- never heard of this place". Both fail closed. Neither leaks a credential.
--
-- security_passport_three_market_foundation_test.sql is updated in the same
-- change to assert the new message for Abu Dhabi and to keep asserting
-- SP_SUB_JURISDICTION_NOT_SUPPORTED for an emirate that genuinely has no pack.
--
-- ── THE GOVERNANCE GATE IS THE POINT OF THIS FILE ──────────────────────
--
-- legal_review_state = 'pending' and is_active = false, and section 5 below
-- refuses to complete the migration if either has been changed. Seeding a
-- catalogue from a regulatory framework is authoring work; approving it is a
-- named human's decision, and this repository contains no evidence that anyone
-- has made it for Abu Dhabi. Switching the pack on to make the UI show options
-- would convert an honest "not supported yet" into an unreviewed regulatory
-- claim about a country's licensing law.
--
-- ── THE SOURCE IS REGISTERED UNREAD, ON PURPOSE ────────────────────────
--
-- The MOI source below is seeded with availability 'unchecked', no
-- checked_on and no fingerprint, so sp_source_current_has_been_checked keeps
-- its review_state at 'review_needed'. That is the honest record: the category
-- list here is authored from the Ministry of Interior's private security
-- regulatory framework, and NOBODY IN THIS REPOSITORY HAS PINNED THE EXACT
-- PAGE. Identifying the authoritative page and confirming the category names
-- against it is the first item of this pack's legal review, not a detail to be
-- settled by a plausible-looking URL in a migration.
--
-- ── WHAT IS NOT MODELLED, AND WILL NOT BE GUESSED ──────────────────────
--
-- Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah and Fujairah get NO pack and
-- NO credentials. They are listed as sub-jurisdictions by 20260907090000 so
-- the product can name them and say it does not support them yet. Inventing a
-- catalogue for an emirate whose regulatory framework nobody here has read
-- would be the same error this whole phase exists to remove, committed in a
-- new place.
--
-- Licence reference format is likewise NOT constrained: reference_pattern is
-- NULL on every row, because we have no confirmed specification and a regex
-- that rejects a valid licence is a wall the holder cannot argue with.
-- typical_validity_months is NULL for the same reason — SIRA's two-year
-- statement is SIRA's, and carrying it across to a different regulator would
-- be exactly the cross-market inference this pack forbids.

--
-- ── WHY THE VERSION MOVED ──────────────────────────────────────────────
--
-- Authored as 20260908096000 against main at 0a2677f. Main advanced 99 commits
-- before this branch was opened, and the original slot now sorts behind a dozen
-- migrations that did not exist when it was written, so it would replay out of order.
-- This file was therefore reallocated to the next canonical slot AFTER the
-- current head of the active path (20260913092000). The SQL is unchanged; only
-- the version is.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The authority
-- ---------------------------------------------------------------------------
-- Federal, and recorded as federal: sub_jurisdiction_code is NULL because the
-- Ministry of Interior is not an Abu Dhabi body. The PACK is scoped to Abu
-- Dhabi; the AUTHORITY is scoped to the UAE. Collapsing those two would either
-- invent an emirate-level ministry or claim the framework covers all seven
-- emirates, and neither is something this repository knows.
INSERT INTO public.sp_authorities
  (code, jurisdiction_code, sub_jurisdiction_code, name_local, name_en, official_url)
VALUES
  ('AE_MOI_PSBD', 'AE', NULL,
   'Ministry of Interior — Private Security Business Department',
   'Ministry of Interior — Private Security Business Department',
   'https://www.moi.gov.ae/en/default.aspx')
ON CONFLICT (code) DO NOTHING;

-- Registered UNREAD. See the header: pinning the authoritative page is the
-- first item of this pack's legal review.
INSERT INTO public.sp_regulatory_sources
  (source_key, jurisdiction_code, market_pack_code, authority_id,
   title, url, source_type)
SELECT 'ae_moi_private_security', 'AE', NULL, a.id,
       'UAE Ministry of Interior — Private Security Business Department',
       'https://www.moi.gov.ae/en/default.aspx',
       'authority_guidance'
FROM (SELECT id FROM public.sp_authorities WHERE code = 'AE_MOI_PSBD') a
ON CONFLICT (source_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The market pack — authored, unreviewed, switched off
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_market_packs
  (code, jurisdiction_code, sub_jurisdiction_code,
   name_sv, name_en, legal_review_state, is_active)
VALUES
  ('AE-AZ', 'AE', 'AE-AZ',
   'Abu Dhabi (Inrikesministeriet)', 'Abu Dhabi (Ministry of Interior)',
   'pending', false)
ON CONFLICT (code) DO NOTHING;

-- Now that the pack exists, the source can point at it.
UPDATE public.sp_regulatory_sources
   SET market_pack_code = 'AE-AZ'
 WHERE source_key = 'ae_moi_private_security'
   AND market_pack_code IS NULL;

-- ---------------------------------------------------------------------------
-- 3. The individual licence categories
-- ---------------------------------------------------------------------------
-- Named as the framework names them, with "Private" retained. That word is
-- doing work: these are private security licences, and dropping it to make the
-- names read more like SIRA's would be the first quiet step towards treating
-- the two catalogues as one.
INSERT INTO public.sp_regulated_roles
  (code, market_pack_code, profession_family_code, authority_id,
   name_local, name_en, name_ar, is_active, sort_order)
SELECT v.code, 'AE-AZ', 'SECURITY_GUARD', a.id, v.name, v.name, NULL, false, v.sort_order
FROM (VALUES
    ('AE_AZ_PSBD_SECURITY_GUARD',      'Private Security Guard',       10),
    ('AE_AZ_PSBD_CIT_GUARD',           'Private C-I-T Guard',          11),
    ('AE_AZ_PSBD_BANKS_GUARD',         'Private Banks Security Guard', 12),
    ('AE_AZ_PSBD_EVENT_GUARD',         'Event Security Guard',         13),
    ('AE_AZ_PSBD_SECURITY_SUPERVISOR', 'Private Security Supervisor',  20),
    ('AE_AZ_PSBD_SECURITY_MANAGER',    'Private Security Manager',     30),
    ('AE_AZ_PSBD_SECURITY_TRAINER',    'Private Security Trainer',     40)
  ) AS v(code, name, sort_order)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_MOI_PSBD') a
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. The licences
-- ---------------------------------------------------------------------------
-- requires_scope is true for the same reason it is in Dubai: an individual
-- private security licence is held in connection with a licensed company, and
-- one shown without saying which reads as a portable personal permission.
--
-- No reference_pattern and no typical_validity_months. Both are unknown, and
-- both are left unknown rather than borrowed from the emirate next door.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, name_ar, symbol_label,
   requires_valid_until, requires_issuer, requires_scope, is_active, sort_order,
   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
   legal_review_state, contributes_to, authority_id, regulated_role_id,
   reference_label_en, reference_label_local)
SELECT
  v.code, 'licence', 'appointment',
  v.name_en, v.name_en, NULL, v.symbol,
  true, true, true, false, v.sort_order,
  'AE-AZ', 'AE', 'AE-AZ',
  'pending',
  ARRAY['local_eligibility', 'active_title']::text[],
  a.id, r.id,
  'Licence number', 'Licence number'
FROM (VALUES
    ('AE_AZ_PSBD_LICENCE_GUARD',       'Private Security Guard licence · Abu Dhabi',       'PSG',  710, 'AE_AZ_PSBD_SECURITY_GUARD'),
    ('AE_AZ_PSBD_LICENCE_CIT',         'Private C-I-T Guard licence · Abu Dhabi',          'PCIT', 711, 'AE_AZ_PSBD_CIT_GUARD'),
    ('AE_AZ_PSBD_LICENCE_BANKS',       'Private Banks Security Guard licence · Abu Dhabi', 'PBG',  712, 'AE_AZ_PSBD_BANKS_GUARD'),
    ('AE_AZ_PSBD_LICENCE_EVENT',       'Event Security Guard licence · Abu Dhabi',         'PEG',  713, 'AE_AZ_PSBD_EVENT_GUARD'),
    ('AE_AZ_PSBD_LICENCE_SUPERVISOR',  'Private Security Supervisor licence · Abu Dhabi',  'PSS',  720, 'AE_AZ_PSBD_SECURITY_SUPERVISOR'),
    ('AE_AZ_PSBD_LICENCE_MANAGER',     'Private Security Manager licence · Abu Dhabi',     'PSM',  730, 'AE_AZ_PSBD_SECURITY_MANAGER'),
    ('AE_AZ_PSBD_LICENCE_TRAINER',     'Private Security Trainer licence · Abu Dhabi',     'PST',  740, 'AE_AZ_PSBD_SECURITY_TRAINER')
  ) AS v(code, name_en, symbol, sort_order, role_code)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_MOI_PSBD') a
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Derivation
-- ---------------------------------------------------------------------------
-- Every name says Abu Dhabi out loud, and none of them says SIRA. There are
-- deliberately NO training rows: this repository has not read a published
-- course list for the PSBD framework, and inventing courses to match Dubai's
-- shape would be manufacturing a curriculum.
INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, name_ar, requires_credential_codes,
   requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'AE-AZ', 'SECURITY_GUARD', r.id, v.output_kind,
       v.name, v.name, NULL, ARRAY[v.cred]::text[], 'verified', true, false, v.priority
FROM (VALUES
  ('AE_AZ_TITLE_GUARD',      'active_title', 'Private Security Guard (licensed) · Abu Dhabi, UAE',       'AE_AZ_PSBD_LICENCE_GUARD',      'AE_AZ_PSBD_SECURITY_GUARD',      710),
  ('AE_AZ_TITLE_CIT',        'active_title', 'Private C-I-T Guard (licensed) · Abu Dhabi, UAE',          'AE_AZ_PSBD_LICENCE_CIT',        'AE_AZ_PSBD_CIT_GUARD',           711),
  ('AE_AZ_TITLE_BANKS',      'active_title', 'Private Banks Security Guard (licensed) · Abu Dhabi, UAE', 'AE_AZ_PSBD_LICENCE_BANKS',      'AE_AZ_PSBD_BANKS_GUARD',         712),
  ('AE_AZ_TITLE_EVENT',      'active_title', 'Event Security Guard (licensed) · Abu Dhabi, UAE',         'AE_AZ_PSBD_LICENCE_EVENT',      'AE_AZ_PSBD_EVENT_GUARD',         713),
  ('AE_AZ_TITLE_SUPERVISOR', 'active_title', 'Private Security Supervisor (licensed) · Abu Dhabi, UAE',  'AE_AZ_PSBD_LICENCE_SUPERVISOR', 'AE_AZ_PSBD_SECURITY_SUPERVISOR', 720),
  ('AE_AZ_TITLE_MANAGER',    'active_title', 'Private Security Manager (licensed) · Abu Dhabi, UAE',     'AE_AZ_PSBD_LICENCE_MANAGER',    'AE_AZ_PSBD_SECURITY_MANAGER',    730),
  ('AE_AZ_TITLE_TRAINER',    'active_title', 'Private Security Trainer (licensed) · Abu Dhabi, UAE',     'AE_AZ_PSBD_LICENCE_TRAINER',    'AE_AZ_PSBD_SECURITY_TRAINER',    740),

  ('AE_AZ_ELIG_GUARD',       'local_eligibility', 'Private security licence active — guard · Abu Dhabi',            'AE_AZ_PSBD_LICENCE_GUARD',      'AE_AZ_PSBD_SECURITY_GUARD',      810),
  ('AE_AZ_ELIG_CIT',         'local_eligibility', 'Private security licence active — C-I-T guard · Abu Dhabi',      'AE_AZ_PSBD_LICENCE_CIT',        'AE_AZ_PSBD_CIT_GUARD',           811),
  ('AE_AZ_ELIG_BANKS',       'local_eligibility', 'Private security licence active — banks guard · Abu Dhabi',      'AE_AZ_PSBD_LICENCE_BANKS',      'AE_AZ_PSBD_BANKS_GUARD',         812),
  ('AE_AZ_ELIG_EVENT',       'local_eligibility', 'Private security licence active — event guard · Abu Dhabi',      'AE_AZ_PSBD_LICENCE_EVENT',      'AE_AZ_PSBD_EVENT_GUARD',         813),
  ('AE_AZ_ELIG_SUPERVISOR',  'local_eligibility', 'Private security licence active — supervisor · Abu Dhabi',       'AE_AZ_PSBD_LICENCE_SUPERVISOR', 'AE_AZ_PSBD_SECURITY_SUPERVISOR', 820),
  ('AE_AZ_ELIG_MANAGER',     'local_eligibility', 'Private security licence active — manager · Abu Dhabi',          'AE_AZ_PSBD_LICENCE_MANAGER',    'AE_AZ_PSBD_SECURITY_MANAGER',    830),
  ('AE_AZ_ELIG_TRAINER',     'local_eligibility', 'Private security licence active — trainer · Abu Dhabi',          'AE_AZ_PSBD_LICENCE_TRAINER',    'AE_AZ_PSBD_SECURITY_TRAINER',    840)
) AS v(code, output_kind, name, cred, role_code, priority)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. The governance gate, asserted rather than remembered
-- ---------------------------------------------------------------------------
DO $$
DECLARE _pack public.sp_market_packs%ROWTYPE;
        _active_creds integer;
        _other_emirate_packs integer;
BEGIN
  SELECT * INTO _pack FROM public.sp_market_packs WHERE code = 'AE-AZ';

  IF _pack.is_active OR _pack.legal_review_state <> 'pending' THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: the Abu Dhabi pack is active or marked reviewed '
      '(is_active=%, legal_review_state=%). This catalogue is authored from a '
      'regulatory framework nobody in this repository has confirmed against a '
      'pinned official page. Activation is a named human decision.',
      _pack.is_active, _pack.legal_review_state;
  END IF;

  SELECT count(*) INTO _active_creds FROM public.sp_credential_types
   WHERE market_pack_code = 'AE-AZ' AND is_active;
  IF _active_creds <> 0 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: % Abu Dhabi credentials are active before legal review.',
      _active_creds;
  END IF;

  -- The five emirates with no reviewed framework must still have no pack. If
  -- one appears, somebody has invented a catalogue.
  SELECT count(*) INTO _other_emirate_packs FROM public.sp_market_packs
   WHERE sub_jurisdiction_code IN ('AE-SH', 'AE-AJ', 'AE-UQ', 'AE-RK', 'AE-FU');
  IF _other_emirate_packs <> 0 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: % market packs exist for emirates whose regulatory '
      'framework has not been read. Sharjah, Ajman, Umm Al Quwain, Ras Al '
      'Khaimah and Fujairah must have no credential catalogue.',
      _other_emirate_packs;
  END IF;
END $$;

COMMIT;
