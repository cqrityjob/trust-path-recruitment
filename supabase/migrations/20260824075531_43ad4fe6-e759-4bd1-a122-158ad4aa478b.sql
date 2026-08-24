-- Security Passport — the Swedish truth model.
--
-- Additive. Nothing existing is reinterpreted: 'OV' meant the förordnande
-- before this migration and still does, so no stored claim changes meaning.
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────
--
-- Sweden shipped with four credentials, and between them they cannot say
-- three things the Swedish system actually distinguishes:
--
--   1. Completing ordningsvakt TRAINING is not being appointed. The source of
--      authority is the förordnande from Polismyndigheten, not the course.
--      With only 'OV' available, somebody who had done the training and not
--      been appointed had a choice between recording nothing and recording an
--      appointment they do not hold.
--
--   2. Personnel in an authorised guarding company need Länsstyrelsen
--      approval. That is a separate fact from VU1/VU2, and completing the
--      training says nothing about whether it was granted.
--
--   3. A skyddsvakt approval is scoped — to an employer, a principal, or a
--      protected object. Presented without its scope it reads as a general
--      national security licence, which it is not.
--
-- ── WHAT THIS MIGRATION REFUSES TO STORE ───────────────────────────────
--
-- Personnel approval is the most sensitive record in the Swedish model,
-- because the thing behind it is a police register check. Nothing here stores
-- register contents, suspicions, offences, Säpo material, or the reason for a
-- refusal — and that is enforced rather than documented. The credential is
-- marked narrow_result_only, which makes the database refuse any claim on it
-- carrying a holder note or a title other than the controlled label. The
-- product can say "Personalgodkännande kontrollerat", with an authority and a
-- date, and it structurally cannot say anything else.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Room for a credential code that says what it is
-- ---------------------------------------------------------------------------
-- The original check capped a code at 16 characters, which was ample for VU1
-- and OV and is not for SE_PERSONNEL_APPROVAL, UK_SIA_QUALIFICATION or
-- AE_DU_SIRA_CADRE_CARD. Abbreviating those to fit would make the identifier
-- worse at the one job it has.
--
-- This RELAXES the constraint: every code that satisfied the old rule
-- satisfies the new one, so no stored row is affected and nothing that
-- validated before stops validating.
ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_types_code_check;

ALTER TABLE public.sp_credential_types
  ADD CONSTRAINT sp_credential_types_code_check
  CHECK (code ~ '^[A-Z0-9_]{2,48}$');

-- ---------------------------------------------------------------------------
-- 1. Two new properties a credential can have
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_credential_types
  -- The credential may only ever carry a controlled result. No free text, no
  -- holder commentary. For facts whose underlying material must never be
  -- stored: a register check, a fitness certificate, a good-conduct result.
  ADD COLUMN IF NOT EXISTS narrow_result_only boolean NOT NULL DEFAULT false,

  -- The authorisation is limited to an employer, a principal or a protected
  -- object, and is misleading without it.
  ADD COLUMN IF NOT EXISTS requires_scope boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sp_credential_types.narrow_result_only IS
  'When true the database refuses any claim on this credential that carries a '
  'holder note or a title other than the controlled label. Used for facts '
  'whose underlying material -- register checks, medical results, conduct '
  'certificates -- must never enter the Passport at all.';

COMMENT ON COLUMN public.sp_credential_types.requires_scope IS
  'When true the claim must state what the authorisation is limited to. A '
  'skyddsvakt approval without its employer, principal or protected object '
  'reads as a general national licence, which is not what was granted.';

-- ---------------------------------------------------------------------------
-- 2. Where a scope is recorded
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_claims
  ADD COLUMN IF NOT EXISTS authorisation_scope text
    CHECK (authorisation_scope IS NULL
           OR length(btrim(authorisation_scope)) BETWEEN 1 AND 200);

COMMENT ON COLUMN public.sp_claims.authorisation_scope IS
  'What a scoped authorisation is limited to -- employer, principal or '
  'protected object. Travels with the credential into every disclosure: a '
  'scope the reader cannot see is a scope that has been dropped.';

-- ---------------------------------------------------------------------------
-- 3. The credentials Sweden actually distinguishes
-- ---------------------------------------------------------------------------
-- legal_review_state stays 'pending' on all four. They are authored from the
-- official Polisen and Länsstyrelsen pages registered in
-- sp_regulatory_sources, and nobody has reviewed them; recording that as
-- anything else would be inventing a sign-off. They are nonetheless ACTIVE,
-- because each one makes an already-live market MORE truthful -- withholding
-- OV_TRAINING does not protect anybody, it just leaves the person who has
-- done the course with only "appointment" to choose from.

INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, symbol_label,
   requires_valid_until, requires_issuer, sort_order,
   market_pack_code, jurisdiction_code, legal_review_state, contributes_to)
VALUES
  -- The course. NOT the appointment, and it is the whole point of this row.
  ('OV_TRAINING', 'training', 'qualification',
   'Ordningsvaktsutbildning (grundutbildning)', 'Public Order Guard Training',
   'OVU', false, false, 25,
   'SE', 'SE', 'pending', ARRAY['education_completed']::text[]),

  -- Fortbildning. Renewal training, which keeps an appointment renewable but
  -- is not itself an appointment either.
  ('OV_REFRESHER', 'training', 'qualification',
   'Fortbildning för ordningsvakter', 'Public Order Guard Refresher Training',
   'OVF', false, false, 26,
   'SE', 'SE', 'pending', ARRAY['education_completed']::text[]),

  ('OV_TRANSPORT', 'training', 'qualification',
   'Ordningsvakt — särskild utbildning för transport',
   'Public Order Guard — Special Transport Training',
   'OVT', false, false, 27,
   'SE', 'SE', 'pending', ARRAY['education_completed']::text[]),

  -- The Länsstyrelsen personnel approval. A narrow result and nothing else.
  ('SE_PERSONNEL_APPROVAL', 'licence', 'appointment',
   'Personalgodkännande (bevakningsföretag)',
   'Personnel approval (authorised guarding company)',
   'PG', false, true, 15,
   'SE', 'SE', 'pending', ARRAY['local_eligibility']::text[])
ON CONFLICT (code) DO NOTHING;

UPDATE public.sp_credential_types SET
  narrow_result_only = true,
  authority_id       = (SELECT id FROM public.sp_authorities WHERE code = 'SE_LANSSTYRELSEN'),
  regulated_role_id  = (SELECT id FROM public.sp_regulated_roles WHERE code = 'SE_VAKTARE')
WHERE code = 'SE_PERSONNEL_APPROVAL';

UPDATE public.sp_credential_types SET
  authority_id      = (SELECT id FROM public.sp_authorities WHERE code = 'SE_POLISMYNDIGHETEN'),
  regulated_role_id = (SELECT id FROM public.sp_regulated_roles WHERE code = 'SE_ORDNINGSVAKT')
WHERE code IN ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT');

-- A skyddsvakt approval must say what it covers.
UPDATE public.sp_credential_types SET requires_scope = true WHERE code = 'SV';

-- ---------------------------------------------------------------------------
-- 4. The trigger learns the two new properties
-- ---------------------------------------------------------------------------
-- Still one trigger on sp_claims. Two would mean two places to read before
-- anyone could say what the database actually refuses.
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

  -- ── The narrow-result rule ───────────────────────────────────────────
  -- Applies to DRAFTS TOO, unlike the completeness rules below. A draft that
  -- has already stored somebody's police-register commentary has already done
  -- the harm; refusing it at submit time would be far too late.
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

  -- ── The scope rule, grandfathered ────────────────────────────────────
  -- Binds every INSERT, so nothing new can be recorded without its scope.
  --
  -- On UPDATE it binds only rows that ALREADY had one. Skyddsvakt claims
  -- exist in production from before this column did, and the trigger fires on
  -- UPDATE as well as INSERT — so enforcing it unconditionally would have
  -- meant that correcting, verifying, expiring or disputing one of those rows
  -- was refused outright. A holder would have found their own record frozen,
  -- with an error about a field the form never asked them for.
  --
  -- What the rule still guarantees on an old row: an existing scope cannot be
  -- removed. It can only ever be added or changed.
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
  'Enforces the taxonomy, market and Swedish narrow-result rules on every '
  'claim write, for every caller including service_role. Drafts are exempt '
  'from COMPLETENESS only -- never from the market gate and never from the '
  'narrow-result rule, because a draft that already stored register '
  'commentary has already done the harm.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- 5. The Swedish derivation rules
-- ---------------------------------------------------------------------------
-- These replace the stored profession_family string that the Passport Card
-- prints today. Read them as the answer to "what may this person be called,
-- and on what evidence".
--
-- ── WHY requires_current_validity IS TRUE EVERYWHERE ───────────────────
--
-- It is tempting to set it false for a completed course, on the grounds that
-- finishing VU1 in 2019 is still true in 2026. But the flag does not only
-- govern expiry: it governs whether the credential is EFFECTIVELY ACTIVE on
-- the evaluation date, which is also how a revoked, disputed or superseded
-- credential stops counting. A VU1 has no valid_until, so requiring currency
-- costs it nothing and never lapses — while a VU1 that was withdrawn after a
-- correction correctly stops producing a title. Setting it false would buy no
-- accuracy and would keep revoked evidence alive.
--
-- ── THE FOUR OUTPUTS, IN SWEDISH TERMS ─────────────────────────────────
--
--   education_completed      you finished a course
--   professional_competence  you hold the competence the role is built on
--   local_eligibility        an authority currently permits you to work
--   active_title             what you may currently be CALLED
--
-- VU1 produces ONE row here, and it is an education row. That single fact is
-- the difference between an honest Passport and a certificate mill.

INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, requires_credential_codes,
   requires_assertion_level, requires_current_validity, priority)
SELECT v.code, 'SE', v.family, r.id, v.output_kind, v.name_local, v.name_en,
       v.creds, 'verified', true, v.priority
FROM (VALUES
  -- ── Education ───────────────────────────────────────────────────────
  ('SE_VU1_COMPLETED', NULL, NULL, 'education_completed',
   'Väktarutbildning 1 (VU1) genomförd', 'Security Guard Training 1 (VU1) completed',
   ARRAY['VU1']::text[], 10),

  ('SE_VU2_COMPLETED', NULL, NULL, 'education_completed',
   'Väktarutbildning 2 (VU2) genomförd', 'Security Guard Training 2 (VU2) completed',
   ARRAY['VU2']::text[], 11),

  ('SE_OV_TRAINING_COMPLETED', NULL, NULL, 'education_completed',
   'Ordningsvaktsutbildning genomförd', 'Public order guard training completed',
   ARRAY['OV_TRAINING']::text[], 12),

  ('SE_OV_REFRESHER_COMPLETED', NULL, NULL, 'education_completed',
   'Fortbildning genomförd', 'Refresher training completed',
   ARRAY['OV_REFRESHER']::text[], 13),

  ('SE_OV_TRANSPORT_COMPLETED', NULL, NULL, 'education_completed',
   'Särskild transportutbildning genomförd', 'Special transport training completed',
   ARRAY['OV_TRANSPORT']::text[], 14),

  -- ── Competence ──────────────────────────────────────────────────────
  -- BOTH steps. This is an AND, and it is the rule the mutation test in
  -- scripts/passport-identity-engine-check.ts exists to defend: VU1 on its
  -- own can never produce it.
  ('SE_VAKTARE_COMPETENCE', 'SECURITY_GUARD', 'SE_VAKTARE', 'professional_competence',
   'Väktare', 'Security Guard · Sweden',
   ARRAY['VU1','VU2']::text[], 20),

  -- ── Local eligibility ───────────────────────────────────────────────
  -- Deliberately NOT an active title. A personnel approval says an authority
  -- checked something and permits the person to work for an authorised
  -- guarding company; it does not by itself make them anything.
  ('SE_PERSONNEL_APPROVAL_CHECKED', 'SECURITY_GUARD', 'SE_VAKTARE', 'local_eligibility',
   'Personalgodkännande kontrollerat', 'Personnel approval checked',
   ARRAY['SE_PERSONNEL_APPROVAL']::text[], 30),

  ('SE_ORDNINGSVAKT_ELIGIBILITY', 'SECURITY_GUARD', 'SE_ORDNINGSVAKT', 'local_eligibility',
   'Förordnande giltigt', 'Appointment valid',
   ARRAY['OV']::text[], 31),

  ('SE_SKYDDSVAKT_ELIGIBILITY', 'SECURITY_GUARD', 'SE_SKYDDSVAKT', 'local_eligibility',
   'Godkännande giltigt', 'Approval valid',
   ARRAY['SV']::text[], 32),

  -- ── Active titles ───────────────────────────────────────────────────
  -- Both come from the APPOINTMENT, never from the training. A holder may
  -- carry several of these at once and they are never collapsed: Väktare,
  -- Ordningsvakt and Skyddsvakt are three different things and inventing a
  -- combined title would name a job that does not exist.
  ('SE_ORDNINGSVAKT_TITLE', 'SECURITY_GUARD', 'SE_ORDNINGSVAKT', 'active_title',
   'Ordningsvakt', 'Public Order Guard (Ordningsvakt) · Sweden',
   ARRAY['OV']::text[], 40),

  ('SE_SKYDDSVAKT_TITLE', 'SECURITY_GUARD', 'SE_SKYDDSVAKT', 'active_title',
   'Skyddsvakt', 'Protective Security Guard (Skyddsvakt) · Sweden',
   ARRAY['SV']::text[], 41)
) AS v(code, family, role_code, output_kind, name_local, name_en, creds, priority)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 6. The rules mean nothing if a component can ignore them
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.sp_professional_titles IS
  'Credential-to-title derivation rules. The ONLY place this mapping exists. '
  'Sweden is seeded here; UK and Dubai arrive with their own packs. Read by '
  'exactly one consumer, src/lib/security-passport/identity/, and no React '
  'component may carry its own mapping -- enforced by '
  'scripts/passport-title-derivation-check.ts.';




-- ---------------------------------------------------------------------------
-- 7. Correction must carry the new columns, exactly as Phase 6b and 11 did
-- ---------------------------------------------------------------------------
-- Phase 11 put it plainly: "Without this, correcting a language would drop its
-- code and level, and the new version would then be refused by the trigger."
-- The same is now true twice over, and one of the two is a latent fault in the
-- migration immediately before this one:
--
--   * `authorisation_scope`, added above. Correcting a skyddsvakt approval
--     would drop its scope and be refused by SP_CREDENTIAL_REQUIRES_SCOPE.
--     The holder's only route out of a typo would be withdrawing a credential
--     that already carries evidence and a verifier's decision.
--
--   * `sub_jurisdiction_code`, added by 20260907090000. Correcting a Dubai
--     credential would drop its emirate and be refused by
--     SP_SUB_JURISDICTION_REQUIRED. That fault cannot fire today — the AE-DU
--     pack is inactive, so no such claim can exist — but it would have fired
--     on the first correction after Dubai went live, which is the worst
--     possible time to discover it.
--
-- Both follow the Phase 11 pattern exactly: a DEFAULT NULL parameter,
-- coalesced with the stored value, so a thirteen-argument caller keeps working
-- and an omitted value carries forward rather than being blanked. Both are
-- MATERIAL when explicitly changed — a different emirate and a different
-- protected object are both different facts from the one that was verified.
--
-- The known limitation, inherited from the same pattern: a value that has been
-- set cannot be cleared through correction, only changed. For these two that
-- is the right default, because clearing either one would turn a scoped or
-- local credential into a broader claim than the authority granted.

DROP FUNCTION IF EXISTS public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.sp_correct_claim(
  _claim_id uuid,
  _title text,
  _claimed_issuer_name text,
  _jurisdiction_code text,
  _issued_on date,
  _valid_from date,
  _valid_until date,
  _reason text,
  _credential_code text,
  _credential_reference text,
  _holder_note text,
  _skill_code text DEFAULT NULL,
  _skill_level text DEFAULT NULL,
  _sub_jurisdiction_code text DEFAULT NULL,
  _authorisation_scope text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _old public.sp_claims%ROWTYPE;
  _new_id uuid;
  _material boolean;
  _next_level text;
  _next_by uuid;
  _next_at timestamptz;
  _next_sub text;
  _next_scope text;
BEGIN
  SELECT * INTO _old FROM public.sp_claims WHERE id = _claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF _old.holder_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _old.lifecycle_state <> 'active' THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_CORRECTABLE: state is %', _old.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  _next_sub   := coalesce(_sub_jurisdiction_code, _old.sub_jurisdiction_code);
  _next_scope := coalesce(_authorisation_scope, _old.authorisation_scope);

  _material := (
       _old.title                 IS DISTINCT FROM _title
    OR _old.claimed_issuer_name   IS DISTINCT FROM _claimed_issuer_name
    OR _old.jurisdiction_code     IS DISTINCT FROM _jurisdiction_code
    OR _old.issued_on             IS DISTINCT FROM _issued_on
    OR _old.valid_from            IS DISTINCT FROM _valid_from
    OR _old.valid_until           IS DISTINCT FROM _valid_until
    OR _old.credential_code       IS DISTINCT FROM _credential_code
    OR _old.credential_reference  IS DISTINCT FROM _credential_reference
    OR (_skill_code IS NOT NULL AND _old.skill_code IS DISTINCT FROM _skill_code)
    OR _old.skill_level           IS DISTINCT FROM _skill_level
    -- A different emirate and a different protected object are different
    -- facts from the ones somebody checked.
    OR (_sub_jurisdiction_code IS NOT NULL
        AND _old.sub_jurisdiction_code IS DISTINCT FROM _sub_jurisdiction_code)
    OR (_authorisation_scope IS NOT NULL
        AND _old.authorisation_scope IS DISTINCT FROM _authorisation_scope)
  );

  IF _material AND _old.assertion_level <> 'self_declared' THEN
    _next_level := 'self_declared';
    _next_by    := NULL;
    _next_at    := NULL;
  ELSE
    _next_level := _old.assertion_level;
    _next_by    := _old.verified_by_user_id;
    _next_at    := _old.verified_at;
  END IF;

  INSERT INTO public.sp_claims (
    holder_user_id, claim_type, title, claimed_issuer_name, jurisdiction_code,
    sub_jurisdiction_code, authorisation_scope,
    issued_on, valid_from, valid_until,
    credential_code, credential_reference, holder_note,
    skill_code, skill_level,
    assertion_level, verified_by_user_id, verified_at,
    lifecycle_state, version_no, supersedes_id)
  VALUES (
    _old.holder_user_id, _old.claim_type, _title, _claimed_issuer_name,
    _jurisdiction_code, _next_sub, _next_scope,
    _issued_on, _valid_from, _valid_until,
    _credential_code, _credential_reference, _holder_note,
    coalesce(_skill_code, _old.skill_code), _skill_level,
    _next_level, _next_by, _next_at,
    'active', _old.version_no + 1, _old.id)
  RETURNING id INTO _new_id;

  UPDATE public.sp_claims
     SET lifecycle_state = 'superseded'
   WHERE id = _old.id;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (
    _old.holder_user_id, auth.uid(), 'claim_corrected', 'claim', _new_id,
    jsonb_build_object(
      'supersedes', _old.id,
      'version_no', _old.version_no + 1,
      'reason', _reason,
      'previous_title', _old.title,
      'material_change', _material,
      'previous_assertion_level', _old.assertion_level,
      'assertion_level', _next_level,
      'verification_reset', (_material AND _old.assertion_level <> 'self_declared'),
      'previous_credential_code', _old.credential_code,
      'credential_code', _credential_code,
      'previous_skill_code', _old.skill_code,
      'skill_code', coalesce(_skill_code, _old.skill_code),
      'previous_skill_level', _old.skill_level,
      'skill_level', _skill_level,
      'previous_sub_jurisdiction_code', _old.sub_jurisdiction_code,
      'sub_jurisdiction_code', _next_sub,
      'previous_authorisation_scope', _old.authorisation_scope,
      'authorisation_scope', _next_scope));

  RETURN _new_id;
END;
$fn$;

-- The grant and the revoke are restated because DROP FUNCTION took the old
-- ones with it, and the hosted project's ALTER DEFAULT PRIVILEGES would
-- otherwise hand EXECUTE to anon on the replacement.
REVOKE ALL ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text, text, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text, text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text, text, text, text) IS
  'Correction creates a NEW version and supersedes the old one; it never '
  'overwrites and can never raise trust. Carries sub_jurisdiction_code and '
  'authorisation_scope forward when not supplied, so correcting a Dubai or '
  'skyddsvakt credential cannot silently widen what the authority granted.';

COMMIT;