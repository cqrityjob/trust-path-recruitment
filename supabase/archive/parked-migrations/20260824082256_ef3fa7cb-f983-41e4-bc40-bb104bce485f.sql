-- Security Passport — the United Kingdom market pack (SIA).
--
-- Ships INACTIVE. Every credential below has is_active = false and the GB
-- market pack's legal_review_state is still 'pending', so a holder cannot
-- select any of this and a claim in GB is refused by
-- SP_MARKET_PACK_NOT_ACTIVE. Two independent gates, deliberately: the pack
-- constraint is the one that cannot be forgotten, and the per-credential flag
-- is the one that lets a reviewer approve the pack while holding back an
-- individual credential they are not satisfied with.
--
-- ── THE ONE MISTAKE THIS PACK EXISTS TO PREVENT ────────────────────────
--
-- A training qualification is not a licence. Somebody who has passed the
-- Level 2 award for door supervision has done the training the SIA requires;
-- they are not licensed until the SIA has decided, and the SIA's decision
-- rests on a suitability check this product neither sees nor stores.
--
-- So the two are separate credential types, never one with a flag. Modelling
-- them as one row with `is_licensed` would mean a single UPDATE could turn a
-- course certificate into a licence, and the difference between those two
-- facts is the difference between somebody who may legally work a door and
-- somebody who may not.
--
-- ── WHY ONE CREDENTIAL PER LICENSABLE ACTIVITY ─────────────────────────
--
-- An SIA licence covers ONE activity. Door supervision and public space
-- surveillance are different licences with different training, and holding
-- one says nothing about the other. A single UK_SIA_LICENCE row with the
-- activity stored as free text would make "is this person licensed for CCTV"
-- a string comparison against something a holder typed.
--
-- Applicability is also per activity and per contract: this pack does NOT
-- assert that every security worker needs a licence, because they do not.
--
-- ── WHAT IS NOT STORED ─────────────────────────────────────────────────
--
-- Nothing about the criminal record check the SIA performs. CQrityjob records
-- whether a LICENCE is current, which is a fact on a public register. It does
-- not record, infer or hint at the suitability investigation behind it.
--
-- Sources: registered in sp_regulatory_sources by 20260907090000 as
-- gb_sia_need_a_licence, gb_sia_apply, gb_sia_training, gb_sia_check_a_licence,
-- gb_sia_public_register and the four ICO entries. Fingerprinted 2026-08-22;
-- the Data (Use and Access) Act has moved parts of the ICO guidance, so the
-- pack's legal review must re-read those four rather than trust this comment.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A credential can now say what its reference number looks like
-- ---------------------------------------------------------------------------
-- An SIA licence number is 16 digits. A SIRA cadre card number has its own
-- shape. Validating either in the form alone would leave the database
-- accepting anything, and hard-coding both in the trigger would mean a schema
-- change per market.
ALTER TABLE public.sp_credential_types
  ADD COLUMN IF NOT EXISTS reference_pattern text,
  ADD COLUMN IF NOT EXISTS reference_label_en text,
  ADD COLUMN IF NOT EXISTS reference_label_local text;

COMMENT ON COLUMN public.sp_credential_types.reference_pattern IS
  'POSIX regex the credential_reference must match, or NULL for no constraint. '
  'Enforced by sp_claims_credential_rules for every caller. Data rather than a '
  'branch in the trigger, so a new market adds a pattern by INSERT.';

COMMENT ON COLUMN public.sp_credential_types.reference_label_en IS
  'What to call the reference in the form. "Licence number" and '
  '"Certificate number" are different questions and asking the wrong one gets '
  'the wrong number typed in.';

-- ---------------------------------------------------------------------------
-- 2. The licensable activities, as regulated roles
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_regulated_roles
  (code, market_pack_code, profession_family_code, authority_id,
   name_local, name_en, is_active, sort_order)
SELECT v.code, 'GB', 'SECURITY_GUARD', a.id, v.name, v.name, false, v.sort_order
FROM (VALUES
    ('GB_SIA_SECURITY_GUARDING',   'Security guarding',                  10),
    ('GB_SIA_DOOR_SUPERVISION',    'Door supervision',                   20),
    ('GB_SIA_PUBLIC_SPACE_CCTV',   'Public space surveillance (CCTV)',   30),
    ('GB_SIA_CLOSE_PROTECTION',    'Close protection',                   40),
    ('GB_SIA_CVIT',                'Cash and valuables in transit',      50),
    ('GB_SIA_KEY_HOLDING',         'Key holding',                        60),
    ('GB_SIA_NON_FRONT_LINE',      'Non-front-line',                     70)
  ) AS v(code, name, sort_order)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'GB_SIA') a
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Licences and qualifications, kept apart
-- ---------------------------------------------------------------------------
-- A front-line licence: time-limited, granted by the SIA, carries a 16-digit
-- number, and is the ONLY thing here that can produce an active title.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, symbol_label,
   requires_valid_until, requires_issuer, is_active, sort_order,
   market_pack_code, jurisdiction_code, legal_review_state, contributes_to,
   authority_id, regulated_role_id, reference_pattern,
   reference_label_en, reference_label_local)
SELECT
  v.code, 'licence', 'appointment',
  v.name_en, v.name_en, v.symbol,
  true, true, false, v.sort_order,
  'GB', 'GB', 'pending',
  ARRAY['local_eligibility', 'active_title']::text[],
  a.id, r.id,
  -- Sixteen digits. Stored because it is what the public register is checked
  -- against; PRIVATE, like every credential_reference, and never disclosed.
  '^[0-9]{16}$',
  'SIA licence number (16 digits)', 'SIA licence number (16 digits)'
FROM (VALUES
    ('UK_SIA_LICENCE_SG',   'SIA Licence — Security Guarding',                'SG',   110, 'GB_SIA_SECURITY_GUARDING'),
    ('UK_SIA_LICENCE_DS',   'SIA Licence — Door Supervision',                 'DS',   120, 'GB_SIA_DOOR_SUPERVISION'),
    ('UK_SIA_LICENCE_CCTV', 'SIA Licence — Public Space Surveillance (CCTV)',  'CCTV', 130, 'GB_SIA_PUBLIC_SPACE_CCTV'),
    ('UK_SIA_LICENCE_CP',   'SIA Licence — Close Protection',                 'CP',   140, 'GB_SIA_CLOSE_PROTECTION'),
    ('UK_SIA_LICENCE_CVIT', 'SIA Licence — Cash and Valuables in Transit',    'CVIT', 150, 'GB_SIA_CVIT'),
    ('UK_SIA_LICENCE_KH',   'SIA Licence — Key Holding',                      'KH',   160, 'GB_SIA_KEY_HOLDING'),
    ('UK_SIA_LICENCE_NFL',  'SIA Licence — Non-Front-Line',                   'NFL',  170, 'GB_SIA_NON_FRONT_LINE')
  ) AS v(code, name_en, symbol, sort_order, role_code)
CROSS JOIN (SELECT id FROM public.sp_authorities WHERE code = 'GB_SIA') a
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- The qualification behind a licence. Awarded by an awarding organisation and
-- delivered by an approved training provider — neither of which is the SIA,
-- which is why authority_id is deliberately NULL here and set above.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, symbol_label,
   requires_valid_until, requires_issuer, is_active, sort_order,
   market_pack_code, jurisdiction_code, legal_review_state, contributes_to,
   regulated_role_id, reference_label_en, reference_label_local)
SELECT
  v.code, 'training', 'qualification',
  v.name_en, v.name_en, v.symbol,
  false, true, false, v.sort_order,
  'GB', 'GB', 'pending',
  ARRAY['education_completed']::text[],
  r.id, 'Certificate number', 'Certificate number'
FROM (VALUES
    ('UK_SIA_QUAL_SG',   'Licence-linked qualification — Security Guarding',               'QSG',  210, 'GB_SIA_SECURITY_GUARDING'),
    ('UK_SIA_QUAL_DS',   'Licence-linked qualification — Door Supervision',                'QDS',  220, 'GB_SIA_DOOR_SUPERVISION'),
    ('UK_SIA_QUAL_CCTV', 'Licence-linked qualification — Public Space Surveillance',       'QCTV', 230, 'GB_SIA_PUBLIC_SPACE_CCTV'),
    ('UK_SIA_QUAL_CP',   'Licence-linked qualification — Close Protection',                'QCP',  240, 'GB_SIA_CLOSE_PROTECTION'),
    ('UK_SIA_QUAL_CVIT', 'Licence-linked qualification — Cash and Valuables in Transit',   'QCVT', 250, 'GB_SIA_CVIT'),
    ('UK_SIA_TOP_UP',    'SIA top-up / refresher training',                                'TOPU', 260, NULL)
  ) AS v(code, name_en, symbol, sort_order, role_code)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.sp_credential_types IS
  'Controlled vocabulary of the named credentials the Passport supports. '
  'Adding a supported credential is an INSERT here, not a schema change. '
  'A licence and the qualification behind it are always SEPARATE rows: '
  'passing the training the SIA requires is not the same fact as holding the '
  'licence the SIA decided to grant.';


-- ---------------------------------------------------------------------------
-- 4. The reference pattern is enforced, not merely declared
-- ---------------------------------------------------------------------------
-- Extends the single claim trigger again rather than adding a second one.
-- Everything the previous version did, it still does, in the same order.
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
BEGIN
  IF NEW.jurisdiction_code IS NOT NULL THEN
    SELECT * INTO _pack
      FROM public.sp_market_packs
     WHERE jurisdiction_code = NEW.jurisdiction_code
       AND sub_jurisdiction_code IS NOT DISTINCT FROM NEW.sub_jurisdiction_code
       AND superseded_on IS NULL;

    IF NOT FOUND THEN
      SELECT EXISTS (
        SELECT 1 FROM public.sp_market_packs
         WHERE jurisdiction_code = NEW.jurisdiction_code
           AND sub_jurisdiction_code IS NOT NULL
      ) INTO _country_needs_sub;

      IF _country_needs_sub AND NEW.sub_jurisdiction_code IS NULL THEN
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_REQUIRED: % regulates security locally; name the emirate or region',
          NEW.jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.sub_jurisdiction_code IS NOT NULL THEN
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is not supported yet',
          NEW.sub_jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      RAISE EXCEPTION
        'SP_JURISDICTION_NOT_SUPPORTED: no market pack covers %',
        NEW.jurisdiction_code
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT _pack.is_active THEN
      RAISE EXCEPTION
        'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
        _pack.code, _pack.legal_review_state
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.credential_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- A credential that has been switched off must stop accepting new claims,
  -- even inside an active market. This is the per-credential gate that lets a
  -- reviewer approve a pack while holding back one credential in it.
  --
  -- Deliberately INSERT-only: an existing claim on a credential that was later
  -- withdrawn must still be correctable, verifiable and expirable. Freezing
  -- somebody's record because the product changed its mind about a credential
  -- would punish the holder for a decision that was not theirs.
  IF NOT _t.is_active AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_NOT_AVAILABLE: % is not available yet',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.jurisdiction_code IS NOT NULL
     AND NEW.jurisdiction_code IS NOT NULL
     AND _t.jurisdiction_code <> NEW.jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_JURISDICTION_MISMATCH: % is a % credential, filed as %',
      NEW.credential_code, _t.jurisdiction_code, NEW.jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.sub_jurisdiction_code IS NOT NULL
     AND NEW.sub_jurisdiction_code IS DISTINCT FROM _t.sub_jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is issued in % and is not valid elsewhere',
      NEW.credential_code, _t.sub_jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.claim_type <> _t.claim_type THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CLAIM_TYPE_MISMATCH: % expects claim_type %, got %',
      NEW.credential_code, _t.claim_type, NEW.claim_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.narrow_result_only THEN
    IF NEW.holder_note IS NOT NULL AND length(btrim(NEW.holder_note)) > 0 THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_NARROW_RESULT_ONLY: % records a checked result and nothing else; no note may be attached',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;

    IF btrim(NEW.title) NOT IN (_t.name_sv, _t.name_en) THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_NARROW_RESULT_ONLY: % must carry its controlled label, not free text',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A malformed licence number is a fact about the credential, not about how
  -- complete the form is, so it binds a draft too: a sixteen-digit field
  -- holding eight digits is wrong the moment it is stored, and telling the
  -- holder at submit time means telling them after they have moved on.
  IF _t.reference_pattern IS NOT NULL
     AND NEW.credential_reference IS NOT NULL
     AND length(btrim(NEW.credential_reference)) > 0
     AND btrim(NEW.credential_reference) !~ _t.reference_pattern THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_REFERENCE_FORMAT: % expects a reference matching %',
      NEW.credential_code, _t.reference_pattern
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.lifecycle_state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _t.requires_valid_until AND NEW.valid_until IS NULL THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_VALID_UNTIL: % is a time-limited appointment',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.requires_issuer
     AND (NEW.claimed_issuer_name IS NULL OR length(btrim(NEW.claimed_issuer_name)) = 0) THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_ISSUER: % must name an appointing authority',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.requires_scope
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0)
     AND (TG_OP = 'INSERT'
          OR (OLD.authorisation_scope IS NOT NULL
              AND length(btrim(OLD.authorisation_scope)) > 0)) THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_REQUIRES_SCOPE: % is limited to an employer, principal or protected object and must say which',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy, market, narrow-result, reference-format and scope '
  'rules on every claim write, for every caller including service_role. '
  'Drafts are exempt from COMPLETENESS only — never from the market gate, the '
  'narrow-result rule or the reference format, because each of those is wrong '
  'the moment it is stored rather than at submit time.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- 5. The UK derivation rules
-- ---------------------------------------------------------------------------
-- One active title per licensable activity, each from its own LICENCE. The
-- qualifications produce completed education and nothing else — which is the
-- whole reason this pack has twice as many rows as it looks like it needs.
--
-- Every name here is the SIA's own English, so nameLocal and nameEn are the
-- same string. That is not laziness: for a market whose legal language is the
-- reader's language there is nothing to explain, and inventing a different
-- "explanatory" wording would be inventing a second name for one licence.

INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, requires_credential_codes,
   requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'GB', 'SECURITY_GUARD', r.id, v.output_kind,
       v.name, v.name, ARRAY[v.cred]::text[], 'verified', true, false, v.priority
FROM (VALUES
  -- Active titles, from the licence.
  ('GB_SIA_TITLE_SG',   'active_title',        'Security Guard (SIA licensed) · United Kingdom',          'UK_SIA_LICENCE_SG',   'GB_SIA_SECURITY_GUARDING', 110),
  ('GB_SIA_TITLE_DS',   'active_title',        'Door Supervisor (SIA licensed) · United Kingdom',         'UK_SIA_LICENCE_DS',   'GB_SIA_DOOR_SUPERVISION',  120),
  ('GB_SIA_TITLE_CCTV', 'active_title',        'CCTV Operator (SIA licensed) · United Kingdom',           'UK_SIA_LICENCE_CCTV', 'GB_SIA_PUBLIC_SPACE_CCTV', 130),
  ('GB_SIA_TITLE_CP',   'active_title',        'Close Protection Operative (SIA licensed) · United Kingdom','UK_SIA_LICENCE_CP',  'GB_SIA_CLOSE_PROTECTION',  140),
  ('GB_SIA_TITLE_CVIT', 'active_title',        'Cash and Valuables in Transit Operative (SIA licensed) · United Kingdom', 'UK_SIA_LICENCE_CVIT', 'GB_SIA_CVIT', 150),
  ('GB_SIA_TITLE_KH',   'active_title',        'Key Holder (SIA licensed) · United Kingdom',              'UK_SIA_LICENCE_KH',   'GB_SIA_KEY_HOLDING',       160),
  -- Eligibility from the non-front-line licence.
  ('GB_SIA_ELIGIBLE_NFL', 'local_eligibility', 'SIA Non-Front-Line licence held · United Kingdom',        'UK_SIA_LICENCE_NFL',  'GB_SIA_NON_FRONT_LINE',    210),
  -- Education completed from the qualifications.
  ('GB_SIA_EDU_SG',   'education_completed', 'Licence-linked qualification — Security Guarding',        'UK_SIA_QUAL_SG',      'GB_SIA_SECURITY_GUARDING', 310),
  ('GB_SIA_EDU_DS',   'education_completed', 'Licence-linked qualification — Door Supervision',         'UK_SIA_QUAL_DS',      'GB_SIA_DOOR_SUPERVISION',  320),
  ('GB_SIA_EDU_CCTV', 'education_completed', 'Licence-linked qualification — Public Space Surveillance',  'UK_SIA_QUAL_CCTV',    'GB_SIA_PUBLIC_SPACE_CCTV', 330),
  ('GB_SIA_EDU_CP',   'education_completed', 'Licence-linked qualification — Close Protection',           'UK_SIA_QUAL_CP',      'GB_SIA_CLOSE_PROTECTION',  340),
  ('GB_SIA_EDU_CVIT', 'education_completed', 'Licence-linked qualification — Cash and Valuables in Transit','UK_SIA_QUAL_CVIT',    'GB_SIA_CVIT',              350),
  ('GB_SIA_EDU_TOP_UP','education_completed','SIA top-up / refresher training completed',                 'UK_SIA_TOP_UP',       NULL,                       360)
) AS v(code, output_kind, name, cred, role_code, priority)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

COMMIT;