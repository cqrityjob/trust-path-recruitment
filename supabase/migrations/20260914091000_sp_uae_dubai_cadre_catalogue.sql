-- Security Passport — the Dubai (SIRA) Security Cadre catalogue, completed.
--
-- Ships INACTIVE on both gates. The AE-DU pack's legal_review_state stays
-- 'pending' and every row below has is_active = false, exactly as
-- 20260907093000 left the three it seeded.
--
-- ── WHAT WAS WRONG, AND WHY IT MATTERED ────────────────────────────────
--
-- 20260907093000 modelled three cadre categories: Security Guard, Security
-- Supervisor and Security Operations Manager. SIRA's Security Cadre covers
-- considerably more than three, and the missing ones are not exotic — a money
-- transport guard, a control-room systems operator and a bodyguard are
-- ordinary Dubai security jobs.
--
-- A catalogue that stops at three does not fail loudly. It fails by making the
-- holder pick the nearest thing on the list, and the nearest thing to
-- "Security Systems Technician" is "Security Guard" — which is a different
-- SIRA category, with different training and a different card. The Passport
-- would then carry a licence claim its holder does not hold, entered honestly
-- by somebody who had no truthful option.
--
-- ── THE FOUR GROUPS ARE SIRA'S, NOT OURS ───────────────────────────────
--
-- Operational and guarding; control room and systems; supervision and
-- management; specialist. The grouping is descriptive and lives in sort_order
-- alone: there is no table here relating a Security Supervisor to a Security
-- Manager, because holding one card says nothing about the other.
--
-- And nothing here maps to another market. A SIRA Security Guard is not a
-- Väktare, a Security Supervisor is not an Ordningsvakt, and a Bodyguard is
-- not an SIA Close Protection Operative. sp_professional_title_rule_integrity
-- refuses any derivation rule that reaches across a market pack, so those
-- equivalences are not merely absent — they are unstorable.
--
-- ── THE CARD IS STILL NOT THE COURSE ───────────────────────────────────
--
-- Nine more SIRA-approved courses arrive with the twelve cadre categories, and
-- they stay what the existing five are: separate credentials producing
-- completed education and nothing else. Somebody who has passed the Security
-- Supervisor Course and holds no card derives a completed course and no
-- professional title, which is the truth about their position.
--
-- ── TWO YEARS IS A HINT, AND ONLY WHERE SIRA SAYS SO ───────────────────
--
-- SIRA states that Security Cadre Licences are generally valid for two years
-- for the company-submitted cadre categories. typical_validity_months is set
-- to 24 for those and left NULL for the three specialist categories, where
-- that statement has not been confirmed to apply.
--
-- The column is a form default and a renewal hint. It is NEVER used to compute
-- an expiry the holder did not give us — see the comment on the column itself,
-- added by 20260907093000. Every card row still has requires_valid_until =
-- true, so the date comes from the card.
--
-- ── ARABIC IS STILL DELIBERATELY ABSENT ────────────────────────────────
--
-- name_ar is NULL on every row, for the reason 20260907093000 gives at length:
-- a machine translation of Emirati security-law vocabulary looks authoritative
-- and has been checked by nobody. A native and legal reviewer supplies these
-- before the pack is ever activated.
--
-- Sources: ae_du_sira_services, ae_du_sira_cadre_card,
-- ae_du_sira_cadre_card_individual and ae_du_sira_training_centres, registered
-- in sp_regulatory_sources by 20260907090000. Read 25 August 2026. Confirming
-- that reading is this pack's legal review, which has not happened.

--
-- ── WHY THE VERSION MOVED ──────────────────────────────────────────────
--
-- Authored as 20260908095000 against main at 0a2677f. Main advanced 99 commits
-- before this branch was opened, and the original slot now sorts behind a dozen
-- migrations that did not exist when it was written, so it would replay out of order.
-- This file was therefore reallocated to the next canonical slot AFTER the
-- current head of the active path (20260913092000). The SQL is unchanged; only
-- the version is.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The remaining cadre categories, as regulated roles
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_regulated_roles
  (code, market_pack_code, profession_family_code, authority_id,
   name_local, name_en, name_ar, is_active, sort_order)
SELECT v.code, 'AE-DU', 'SECURITY_GUARD', a.id, v.name, v.name, NULL, false, v.sort_order
FROM (VALUES
    -- Operational and guarding. Security Guard is already seeded at 10.
    ('AE_DU_SIRA_MONEY_TRANSPORT_GUARD',  'Money Transport Guard',                 11),
    ('AE_DU_SIRA_EVENT_SECURITY_GUARD',   'Event Security Guard',                  12),
    ('AE_DU_SIRA_BODYGUARD',              'Bodyguard',                             13),
    ('AE_DU_SIRA_WATCHMAN',               'Watchman',                              14),

    -- Control room and systems.
    ('AE_DU_SIRA_SYSTEMS_OPERATOR',       'Security Systems Operator',             40),
    ('AE_DU_SIRA_SYSTEMS_TECHNICIAN',     'Security Systems Technician',           41),
    ('AE_DU_SIRA_SYSTEMS_ENGINEER',       'Security Systems Engineer',             42),

    -- Supervision and management. Supervisor (20) and Operations Manager (30)
    -- are already seeded.
    ('AE_DU_SIRA_SECURITY_MANAGER',       'Security Manager',                      31),
    ('AE_DU_SIRA_HEAD_OF_SECURITY',       'Head of Security Department',           32),

    -- Specialist.
    ('AE_DU_SIRA_SECURITY_TRAINER',       'Security Trainer',                      50),
    ('AE_DU_SIRA_SECURITY_EXPERT',        'Security Expert',                       51),
    ('AE_DU_SIRA_SECURITY_CONSULTANT',    'Security Consultant',                   52)
  ) AS v(code, name, sort_order)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA') a
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. One Security Cadre Card per category
-- ---------------------------------------------------------------------------
-- requires_scope stays true for all of them, for the reason 20260907093000
-- gives: SIRA links a cadre card to the licensed company the holder works for,
-- and a card shown without saying which company reads as a portable personal
-- licence, which is not what was issued.
--
-- The reference pattern stays the same deliberately permissive shape. We still
-- have no confirmed specification for the card number's format, and inventing
-- one would reject valid cards from holders who have no way to argue with a
-- regex.
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
  v.validity_months,
  '^[A-Za-z0-9/-]{4,32}$',
  'SIRA cadre card number', 'SIRA cadre card number'
FROM (VALUES
    ('AE_DU_SIRA_CARD_MONEY_TRANSPORT',     'SIRA Security Cadre Card — Money Transport Guard',        'SCMT', 411, 'AE_DU_SIRA_MONEY_TRANSPORT_GUARD',  24),
    ('AE_DU_SIRA_CARD_EVENT_GUARD',         'SIRA Security Cadre Card — Event Security Guard',         'SCEV', 412, 'AE_DU_SIRA_EVENT_SECURITY_GUARD',   24),
    ('AE_DU_SIRA_CARD_BODYGUARD',           'SIRA Security Cadre Card — Bodyguard',                    'SCBG', 413, 'AE_DU_SIRA_BODYGUARD',              24),
    ('AE_DU_SIRA_CARD_WATCHMAN',            'SIRA Security Cadre Card — Watchman',                     'SCWM', 414, 'AE_DU_SIRA_WATCHMAN',               24),

    ('AE_DU_SIRA_CARD_SYSTEMS_OPERATOR',    'SIRA Security Cadre Card — Security Systems Operator',    'SCSO', 440, 'AE_DU_SIRA_SYSTEMS_OPERATOR',       24),
    ('AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN',  'SIRA Security Cadre Card — Security Systems Technician',  'SCST', 441, 'AE_DU_SIRA_SYSTEMS_TECHNICIAN',     24),
    ('AE_DU_SIRA_CARD_SYSTEMS_ENGINEER',    'SIRA Security Cadre Card — Security Systems Engineer',    'SCSE', 442, 'AE_DU_SIRA_SYSTEMS_ENGINEER',       24),

    ('AE_DU_SIRA_CARD_SECURITY_MANAGER',    'SIRA Security Cadre Card — Security Manager',             'SCSM', 431, 'AE_DU_SIRA_SECURITY_MANAGER',       24),
    ('AE_DU_SIRA_CARD_HEAD_OF_SECURITY',    'SIRA Security Cadre Card — Head of Security Department',  'SCHD', 432, 'AE_DU_SIRA_HEAD_OF_SECURITY',       24),

    -- The three specialist categories carry NULL rather than 24. SIRA's
    -- two-year statement is about the company-submitted cadre categories, and
    -- extending it to these three would be putting an unchecked number where
    -- a form will read it as a default.
    ('AE_DU_SIRA_CARD_TRAINER',             'SIRA Security Cadre Card — Security Trainer',             'SCTR', 450, 'AE_DU_SIRA_SECURITY_TRAINER',       NULL),
    ('AE_DU_SIRA_CARD_EXPERT',              'SIRA Security Cadre Card — Security Expert',              'SCEX', 451, 'AE_DU_SIRA_SECURITY_EXPERT',        NULL),
    ('AE_DU_SIRA_CARD_CONSULTANT',          'SIRA Security Cadre Card — Security Consultant',          'SCCO', 452, 'AE_DU_SIRA_SECURITY_CONSULTANT',    NULL)
  ) AS v(code, name_en, symbol, sort_order, role_code, validity_months)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA') a
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The SIRA-approved courses, which are not the cards
-- ---------------------------------------------------------------------------
-- Issuer required on every one: a SIRA-certified training centre is a named
-- organisation, and a course nobody delivered is not a course.
--
-- No regulated_role_id. A course is evidence that training happened; tying it
-- to the regulated role would be the first step towards reading "completed the
-- Security Supervisor Course" as "is a Security Supervisor", which is the one
-- inference this pack exists to prevent.
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
    ('AE_DU_SUPERVISOR_COURSE',          'SIRA Security Supervisor course',           'SVC', 511),
    ('AE_DU_OPS_MANAGER_COURSE',         'SIRA Security Operations Manager course',   'OMC', 512),
    ('AE_DU_SECURITY_MANAGER_COURSE',    'SIRA Security Manager course',              'SMC', 513),
    ('AE_DU_SYSTEMS_OPERATOR_COURSE',    'SIRA Security Systems Operator course',     'SOC', 514),
    ('AE_DU_SYSTEMS_TECHNICIAN_COURSE',  'SIRA Security Systems Technician course',   'STC', 515),
    ('AE_DU_SYSTEMS_ENGINEER_COURSE',    'SIRA Security Systems Engineer course',     'SEC', 516),
    ('AE_DU_TRAINER_COURSE',             'SIRA Security Trainer course',              'STR', 517),
    ('AE_DU_EVENTS_COURSE',              'SIRA Security Events course',               'SEV', 518),
    ('AE_DU_CASH_TRANSPORT_COURSE',      'SIRA Cash Transport Guard course',          'CTC', 519)
  ) AS v(code, name_en, symbol, sort_order)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA') a
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Derivation — titles from cards, education from courses
-- ---------------------------------------------------------------------------
-- Every title name says Dubai out loud, for the reason the first three do: a
-- reader must not be able to take one of these for a UAE-wide or portable
-- licence. SIRA regulates Dubai and says so; so does this catalogue.
INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, name_ar, requires_credential_codes,
   requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'AE-DU', 'SECURITY_GUARD', r.id, v.output_kind,
       v.name, v.name, NULL, ARRAY[v.cred]::text[], 'verified', true, false, v.priority
FROM (VALUES
  -- Titles, from the cadre card and only from the cadre card.
  ('AE_DU_TITLE_MONEY_TRANSPORT',   'active_title', 'Money Transport Guard (SIRA cadre card) · Dubai, UAE',            'AE_DU_SIRA_CARD_MONEY_TRANSPORT',    'AE_DU_SIRA_MONEY_TRANSPORT_GUARD',  411),
  ('AE_DU_TITLE_EVENT_GUARD',       'active_title', 'Event Security Guard (SIRA cadre card) · Dubai, UAE',             'AE_DU_SIRA_CARD_EVENT_GUARD',        'AE_DU_SIRA_EVENT_SECURITY_GUARD',   412),
  ('AE_DU_TITLE_BODYGUARD',         'active_title', 'Bodyguard (SIRA cadre card) · Dubai, UAE',                        'AE_DU_SIRA_CARD_BODYGUARD',          'AE_DU_SIRA_BODYGUARD',              413),
  ('AE_DU_TITLE_WATCHMAN',          'active_title', 'Watchman (SIRA cadre card) · Dubai, UAE',                         'AE_DU_SIRA_CARD_WATCHMAN',           'AE_DU_SIRA_WATCHMAN',               414),
  ('AE_DU_TITLE_SYSTEMS_OPERATOR',  'active_title', 'Security Systems Operator (SIRA cadre card) · Dubai, UAE',        'AE_DU_SIRA_CARD_SYSTEMS_OPERATOR',   'AE_DU_SIRA_SYSTEMS_OPERATOR',       440),
  ('AE_DU_TITLE_SYSTEMS_TECH',      'active_title', 'Security Systems Technician (SIRA cadre card) · Dubai, UAE',      'AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN', 'AE_DU_SIRA_SYSTEMS_TECHNICIAN',     441),
  ('AE_DU_TITLE_SYSTEMS_ENGINEER',  'active_title', 'Security Systems Engineer (SIRA cadre card) · Dubai, UAE',        'AE_DU_SIRA_CARD_SYSTEMS_ENGINEER',   'AE_DU_SIRA_SYSTEMS_ENGINEER',       442),
  ('AE_DU_TITLE_SECURITY_MANAGER',  'active_title', 'Security Manager (SIRA cadre card) · Dubai, UAE',                 'AE_DU_SIRA_CARD_SECURITY_MANAGER',   'AE_DU_SIRA_SECURITY_MANAGER',       431),
  ('AE_DU_TITLE_HEAD_OF_SECURITY',  'active_title', 'Head of Security Department (SIRA cadre card) · Dubai, UAE',      'AE_DU_SIRA_CARD_HEAD_OF_SECURITY',   'AE_DU_SIRA_HEAD_OF_SECURITY',       432),
  ('AE_DU_TITLE_TRAINER',           'active_title', 'Security Trainer (SIRA cadre card) · Dubai, UAE',                 'AE_DU_SIRA_CARD_TRAINER',            'AE_DU_SIRA_SECURITY_TRAINER',       450),
  ('AE_DU_TITLE_EXPERT',            'active_title', 'Security Expert (SIRA cadre card) · Dubai, UAE',                  'AE_DU_SIRA_CARD_EXPERT',             'AE_DU_SIRA_SECURITY_EXPERT',        451),
  ('AE_DU_TITLE_CONSULTANT',        'active_title', 'Security Consultant (SIRA cadre card) · Dubai, UAE',              'AE_DU_SIRA_CARD_CONSULTANT',         'AE_DU_SIRA_SECURITY_CONSULTANT',    452),

  -- Eligibility, separately, because "card active" is a different question
  -- from "what may this person be called".
  ('AE_DU_ELIG_MONEY_TRANSPORT',    'local_eligibility', 'SIRA cadre card active — money transport guard',             'AE_DU_SIRA_CARD_MONEY_TRANSPORT',    'AE_DU_SIRA_MONEY_TRANSPORT_GUARD',  541),
  ('AE_DU_ELIG_EVENT_GUARD',        'local_eligibility', 'SIRA cadre card active — event security guard',              'AE_DU_SIRA_CARD_EVENT_GUARD',        'AE_DU_SIRA_EVENT_SECURITY_GUARD',   542),
  ('AE_DU_ELIG_BODYGUARD',          'local_eligibility', 'SIRA cadre card active — bodyguard',                         'AE_DU_SIRA_CARD_BODYGUARD',          'AE_DU_SIRA_BODYGUARD',              543),
  ('AE_DU_ELIG_WATCHMAN',           'local_eligibility', 'SIRA cadre card active — watchman',                          'AE_DU_SIRA_CARD_WATCHMAN',           'AE_DU_SIRA_WATCHMAN',               544),
  ('AE_DU_ELIG_SYSTEMS_OPERATOR',   'local_eligibility', 'SIRA cadre card active — security systems operator',         'AE_DU_SIRA_CARD_SYSTEMS_OPERATOR',   'AE_DU_SIRA_SYSTEMS_OPERATOR',       550),
  ('AE_DU_ELIG_SYSTEMS_TECH',       'local_eligibility', 'SIRA cadre card active — security systems technician',       'AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN', 'AE_DU_SIRA_SYSTEMS_TECHNICIAN',     551),
  ('AE_DU_ELIG_SYSTEMS_ENGINEER',   'local_eligibility', 'SIRA cadre card active — security systems engineer',         'AE_DU_SIRA_CARD_SYSTEMS_ENGINEER',   'AE_DU_SIRA_SYSTEMS_ENGINEER',       552),
  ('AE_DU_ELIG_SECURITY_MANAGER',   'local_eligibility', 'SIRA cadre card active — security manager',                  'AE_DU_SIRA_CARD_SECURITY_MANAGER',   'AE_DU_SIRA_SECURITY_MANAGER',       531),
  ('AE_DU_ELIG_HEAD_OF_SECURITY',   'local_eligibility', 'SIRA cadre card active — head of security department',       'AE_DU_SIRA_CARD_HEAD_OF_SECURITY',   'AE_DU_SIRA_HEAD_OF_SECURITY',       532),
  ('AE_DU_ELIG_TRAINER',            'local_eligibility', 'SIRA cadre card active — security trainer',                  'AE_DU_SIRA_CARD_TRAINER',            'AE_DU_SIRA_SECURITY_TRAINER',       560),
  ('AE_DU_ELIG_EXPERT',             'local_eligibility', 'SIRA cadre card active — security expert',                   'AE_DU_SIRA_CARD_EXPERT',             'AE_DU_SIRA_SECURITY_EXPERT',        561),
  ('AE_DU_ELIG_CONSULTANT',         'local_eligibility', 'SIRA cadre card active — security consultant',               'AE_DU_SIRA_CARD_CONSULTANT',         'AE_DU_SIRA_SECURITY_CONSULTANT',    562),

  -- Education. Nine courses, nine rows, no title among them.
  ('AE_DU_EDU_SUPERVISOR',          'education_completed', 'SIRA Security Supervisor course completed',                'AE_DU_SUPERVISOR_COURSE',         NULL, 661),
  ('AE_DU_EDU_OPS_MANAGER',         'education_completed', 'SIRA Security Operations Manager course completed',        'AE_DU_OPS_MANAGER_COURSE',        NULL, 662),
  ('AE_DU_EDU_SECURITY_MANAGER',    'education_completed', 'SIRA Security Manager course completed',                   'AE_DU_SECURITY_MANAGER_COURSE',   NULL, 663),
  ('AE_DU_EDU_SYSTEMS_OPERATOR',    'education_completed', 'SIRA Security Systems Operator course completed',          'AE_DU_SYSTEMS_OPERATOR_COURSE',   NULL, 664),
  ('AE_DU_EDU_SYSTEMS_TECH',        'education_completed', 'SIRA Security Systems Technician course completed',        'AE_DU_SYSTEMS_TECHNICIAN_COURSE', NULL, 665),
  ('AE_DU_EDU_SYSTEMS_ENGINEER',    'education_completed', 'SIRA Security Systems Engineer course completed',          'AE_DU_SYSTEMS_ENGINEER_COURSE',   NULL, 666),
  ('AE_DU_EDU_TRAINER',             'education_completed', 'SIRA Security Trainer course completed',                   'AE_DU_TRAINER_COURSE',            NULL, 667),
  ('AE_DU_EDU_EVENTS',              'education_completed', 'SIRA Security Events course completed',                    'AE_DU_EVENTS_COURSE',             NULL, 668),
  ('AE_DU_EDU_CASH_TRANSPORT',      'education_completed', 'SIRA Cash Transport Guard course completed',               'AE_DU_CASH_TRANSPORT_COURSE',     NULL, 669)
) AS v(code, output_kind, name, cred, role_code, priority)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. The pack is still switched off, and this asserts it
-- ---------------------------------------------------------------------------
-- Seeding a catalogue is not approving it. If a later edit switches the pack
-- or any of its credentials on without a recorded legal review, this fails the
-- migration rather than shipping unreviewed regulatory content to holders.
DO $$
DECLARE _active_pack boolean; _active_creds integer; _cards integer;
BEGIN
  SELECT is_active INTO _active_pack
    FROM public.sp_market_packs WHERE code = 'AE-DU';
  IF _active_pack THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: the AE-DU market pack is active. This catalogue is '
      'authored from official sources and has not been through legal review.';
  END IF;

  SELECT count(*) INTO _active_creds FROM public.sp_credential_types
   WHERE market_pack_code = 'AE-DU' AND is_active;
  IF _active_creds <> 0 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: % Dubai credentials are active before legal review.',
      _active_creds;
  END IF;

  -- Fifteen cadre categories: the three from 20260907093000 and the twelve
  -- here. A count that drifts means a category was added or lost silently.
  SELECT count(*) INTO _cards FROM public.sp_credential_types
   WHERE market_pack_code = 'AE-DU' AND claim_type = 'licence'
     AND code LIKE 'AE\_DU\_SIRA\_CARD\_%';
  IF _cards <> 15 THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: expected 15 SIRA cadre card credentials, found %.', _cards;
  END IF;
END $$;

COMMIT;
