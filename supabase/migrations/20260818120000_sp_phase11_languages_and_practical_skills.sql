-- Security Passport — Phase 11: languages and practical skills.
--
-- Additive only. No column is dropped, no existing constraint is tightened on
-- existing rows, every new column is NULLable, and every row written before
-- this migration stays valid.
--
-- ── WHY THIS EXTENDS sp_claims INSTEAD OF ADDING TWO NEW TABLES ────────
--
-- A language and a driving licence are the same KIND of fact as everything
-- else in the Passport: something the holder asserts, may document, may have
-- reviewed, may correct into a new immutable version, may withdraw, and may
-- disclose. All of that already exists on `sp_claims` — evidence linkage,
-- assertion levels, lifecycle, versioning, the correction contract, the
-- append-only audit trail, and the disclosure packages.
--
-- Two new tables would have meant re-implementing every one of those, and
-- getting one of them subtly wrong. So `claim_type` gains two values and the
-- specifics live in a controlled vocabulary, exactly as Phase 6 did for
-- VU1/VU2/OV/SV.
--
-- ── WHY A SECOND VOCABULARY TABLE AND NOT sp_credential_types ──────────
--
-- `sp_credential_types` answers "which named Swedish credential is this",
-- and carries a symbol label because those four get a trust glyph. A language
-- is not a credential and must never wear a credential symbol — that is the
-- whole reason the two stay apart. `sp_skill_types` answers a different
-- question: "which controlled capability is this, and what scale does its
-- level come from".
--
-- ── WHY A LEVEL SCALE AND NOT FREE TEXT ────────────────────────────────
--
-- "Flytande" typed into a box is not a proficiency, and turning it into a
-- badge would be exactly the decorative trust this product exists to avoid.
-- Levels therefore come from a named scale, and the database refuses a level
-- that is not on the scale the type declares.
--
-- Nothing here grants trust. A language is self-declared until somebody
-- reviews evidence for it, through the same `sp_verifier_decide` path as
-- everything else.

-- ---------------------------------------------------------------------------
-- 1. claim_type gains two values
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_claims DROP CONSTRAINT IF EXISTS sp_claims_claim_type_check;

ALTER TABLE public.sp_claims
  ADD CONSTRAINT sp_claims_claim_type_check CHECK (claim_type = ANY (ARRAY[
    'training',
    'certification',
    'licence',
    'education',
    'professional_membership',
    'specialisation',
    'language',
    'practical_skill'
  ]));


-- ---------------------------------------------------------------------------
-- 2. The controlled vocabulary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_skill_types (
  code       text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{2,32}$'),

  -- Which generic claim_type a row of this code is recorded as. Mirrors the
  -- Phase 6 relationship: the vocabulary REFINES claim_type, never replaces it.
  claim_type text NOT NULL CHECK (claim_type IN ('language', 'practical_skill')),

  name_sv    text NOT NULL CHECK (length(btrim(name_sv)) > 0),
  name_en    text NOT NULL CHECK (length(btrim(name_en)) > 0),

  -- Which named scale `sp_claims.skill_level` must come from.
  --   'cefr'     — A1..C2 plus native, for languages.
  --   'driving'  — Swedish driving licence categories.
  --   'truck'    — Swedish truckkort categories.
  --   'none'     — the capability has no level; a level must NOT be recorded.
  level_scale text NOT NULL CHECK (level_scale IN ('cefr', 'driving', 'truck', 'none')),

  -- A driving licence without the country that issued it is unreadable.
  requires_jurisdiction boolean NOT NULL DEFAULT false,

  -- Some practical certificates genuinely lapse; a language does not.
  requires_valid_until  boolean NOT NULL DEFAULT false,

  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_skill_types IS
  'Controlled vocabulary for languages and practical capabilities. Adding a '
  'supported language or skill is an INSERT here, not a schema change. '
  'level_scale, requires_jurisdiction and requires_valid_until are enforced by '
  'sp_claims_skill_rules_trg, so the database refuses a misrepresented entry '
  'regardless of caller. Deliberately separate from sp_credential_types: a '
  'language is not a credential and must never carry a credential symbol.';

ALTER TABLE public.sp_skill_types ENABLE ROW LEVEL SECURITY;

-- Readable by signed-in users because the forms need it to render. Never
-- writable from the application: a new supported skill is a reviewed INSERT.
DROP POLICY IF EXISTS sp_skill_types_read ON public.sp_skill_types;
CREATE POLICY sp_skill_types_read ON public.sp_skill_types
  FOR SELECT TO authenticated USING (true);

-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on every newly created table
-- in `public` to the application roles, so a table created after Phase 9b is
-- born with INSERT, UPDATE, DELETE and TRUNCATE that nobody asked for. The
-- Phase 8 guard catches exactly this, and revoking here is what keeps the
-- vocabulary read-only for the application.
REVOKE ALL ON TABLE public.sp_skill_types FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.sp_skill_types TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. The two new columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_claims
  ADD COLUMN IF NOT EXISTS skill_code  text REFERENCES public.sp_skill_types(code),
  ADD COLUMN IF NOT EXISTS skill_level text;

COMMENT ON COLUMN public.sp_claims.skill_code IS
  'Controlled language or practical-capability code. FK-constrained, so it is '
  'a reliable key for presentation — unlike title, which the holder types.';
COMMENT ON COLUMN public.sp_claims.skill_level IS
  'A value from the scale sp_skill_types.level_scale names. Never free text.';

CREATE INDEX IF NOT EXISTS sp_claims_skill_code_idx
  ON public.sp_claims (skill_code) WHERE skill_code IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 4. The launch vocabulary
-- ---------------------------------------------------------------------------
-- Languages. The list is the ones actually spoken across Swedish security
-- work; it is a starting set, not a claim about which languages matter.
INSERT INTO public.sp_skill_types (code, claim_type, name_sv, name_en, level_scale, sort_order)
VALUES
  ('lang_sv', 'language', 'Svenska',      'Swedish',    'cefr', 10),
  ('lang_en', 'language', 'Engelska',     'English',    'cefr', 20),
  ('lang_ar', 'language', 'Arabiska',     'Arabic',     'cefr', 30),
  ('lang_fa', 'language', 'Persiska',     'Persian',    'cefr', 40),
  ('lang_so', 'language', 'Somaliska',    'Somali',     'cefr', 50),
  ('lang_ti', 'language', 'Tigrinska',    'Tigrinya',   'cefr', 60),
  ('lang_ku', 'language', 'Kurdiska',     'Kurdish',    'cefr', 70),
  ('lang_pl', 'language', 'Polska',       'Polish',     'cefr', 80),
  ('lang_uk', 'language', 'Ukrainska',    'Ukrainian',  'cefr', 90),
  ('lang_ru', 'language', 'Ryska',        'Russian',    'cefr', 100),
  ('lang_bs', 'language', 'Bosniska',     'Bosnian',    'cefr', 110),
  ('lang_sq', 'language', 'Albanska',     'Albanian',   'cefr', 120),
  ('lang_tr', 'language', 'Turkiska',     'Turkish',    'cefr', 130),
  ('lang_es', 'language', 'Spanska',      'Spanish',    'cefr', 140),
  ('lang_fr', 'language', 'Franska',      'French',     'cefr', 150),
  ('lang_de', 'language', 'Tyska',        'German',     'cefr', 160),
  ('lang_fi', 'language', 'Finska',       'Finnish',    'cefr', 170),
  ('lang_da', 'language', 'Danska',       'Danish',     'cefr', 180),
  ('lang_no', 'language', 'Norska',       'Norwegian',  'cefr', 190)
ON CONFLICT (code) DO NOTHING;

-- Practical capabilities. Deliberately few and formal: each one is issued by
-- somebody, carries a real category or expiry, and can be evidenced. A
-- capability nobody can document does not belong in a trust record.
INSERT INTO public.sp_skill_types
  (code, claim_type, name_sv, name_en, level_scale, requires_jurisdiction, requires_valid_until, sort_order)
VALUES
  ('driving_licence', 'practical_skill', 'Körkort',        'Driving licence',
   'driving', true,  false, 10),
  ('truck_licence',   'practical_skill', 'Truckkort',      'Forklift licence',
   'truck',   false, false, 20),
  ('first_aid_cpr',   'practical_skill', 'HLR och första hjälpen', 'CPR and first aid',
   'none',    false, true,  30)
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. The rules, enforced in the database
-- ---------------------------------------------------------------------------
-- Mirrors sp_claims_credential_rules: the same shape, so a reader who knows
-- one knows both, and so no caller can write a misrepresented entry.
CREATE OR REPLACE FUNCTION public.sp_claims_skill_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _t public.sp_skill_types%ROWTYPE; _allowed text[];
BEGIN
  IF NEW.skill_code IS NULL THEN
    -- A language or practical skill without a controlled code would be exactly
    -- the free-text badge this design refuses.
    IF NEW.claim_type IN ('language', 'practical_skill') THEN
      RAISE EXCEPTION 'SP_SKILL_CODE_REQUIRED: % entries must name a controlled type',
        NEW.claim_type USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.skill_level IS NOT NULL THEN
      RAISE EXCEPTION 'SP_SKILL_LEVEL_WITHOUT_CODE: a level needs a skill type'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_skill_types WHERE code = NEW.skill_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_SKILL_CODE_UNKNOWN: %', NEW.skill_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.claim_type <> _t.claim_type THEN
    RAISE EXCEPTION 'SP_SKILL_CLAIM_TYPE_MISMATCH: % expects claim_type %, got %',
      NEW.skill_code, _t.claim_type, NEW.claim_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- A credential symbol belongs to a credential. Carrying both codes would let
  -- a language borrow an appointment's glyph.
  IF NEW.credential_code IS NOT NULL THEN
    RAISE EXCEPTION 'SP_SKILL_NOT_A_CREDENTIAL: % cannot also carry credential_code %',
      NEW.skill_code, NEW.credential_code USING ERRCODE = 'check_violation';
  END IF;

  _allowed := CASE _t.level_scale
    WHEN 'cefr'    THEN ARRAY['A1','A2','B1','B2','C1','C2','native']
    WHEN 'driving' THEN ARRAY['AM','A1','A2','A','B','BE','C1','C1E','C','CE','D1','D1E','D','DE']
    WHEN 'truck'   THEN ARRAY['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','D1','D2']
    ELSE ARRAY[]::text[]
  END;

  IF _t.level_scale = 'none' THEN
    IF NEW.skill_level IS NOT NULL THEN
      RAISE EXCEPTION 'SP_SKILL_LEVEL_NOT_APPLICABLE: % has no level scale', NEW.skill_code
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.skill_level IS NULL THEN
      RAISE EXCEPTION 'SP_SKILL_LEVEL_REQUIRED: % is recorded on the % scale',
        NEW.skill_code, _t.level_scale USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (NEW.skill_level = ANY (_allowed)) THEN
      RAISE EXCEPTION 'SP_SKILL_LEVEL_INVALID: % is not on the % scale',
        NEW.skill_level, _t.level_scale USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Drafts are allowed to be half-finished; everything beyond draft is not.
  IF NEW.lifecycle_state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _t.requires_jurisdiction
     AND (NEW.jurisdiction_code IS NULL OR length(btrim(NEW.jurisdiction_code)) = 0) THEN
    RAISE EXCEPTION 'SP_SKILL_REQUIRES_JURISDICTION: % must name where it was issued',
      NEW.skill_code USING ERRCODE = 'check_violation';
  END IF;

  IF _t.requires_valid_until AND NEW.valid_until IS NULL THEN
    RAISE EXCEPTION 'SP_SKILL_REQUIRES_VALID_UNTIL: % lapses and must carry an end date',
      NEW.skill_code USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.sp_claims_skill_rules() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS sp_claims_skill_rules_trg ON public.sp_claims;
CREATE TRIGGER sp_claims_skill_rules_trg
  BEFORE INSERT OR UPDATE ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.sp_claims_skill_rules();


-- ---------------------------------------------------------------------------
-- 6. Correction must carry the new fields, exactly as Phase 6b did
-- ---------------------------------------------------------------------------
-- Without this, correcting a language would drop its code and level, and the
-- new version would then be refused by the trigger above.
--
-- The Phase 6b contract is unchanged in every respect: parameters are a FULL
-- replacement of the intended state, a correction can never raise trust, and a
-- MATERIAL change resets to self_declared with no verifier attribution. Only
-- two things are added:
--
--   * `skill_code` is carried from the old version and is NOT a parameter —
--     changing "Swedish" into "Arabic" is a different fact, not a correction
--     of the same one, and belongs in a new entry;
--   * `_skill_level` IS a parameter and IS material. B1 and C2 are different
--     assertions about the same person, so a review of one is not a review of
--     the other.
--
-- The 11-argument signature is DROPPED rather than overloaded, following the
-- precedent Phase 6b set when it dropped the 8-argument one: a stale caller
-- must not be able to silently blank a field it does not know about.
DROP FUNCTION IF EXISTS public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text);

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
  -- DEFAULT NULL so the eleven-argument callers that predate this migration
  -- still resolve. That is safe precisely because it fails LOUDLY rather than
  -- silently: for a language or practical skill an omitted level is refused by
  -- sp_claims_skill_rules with SP_SKILL_LEVEL_REQUIRED, and for every other
  -- claim type NULL is already the correct value.
  _skill_level text DEFAULT NULL
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

  _material := (
       _old.title                 IS DISTINCT FROM _title
    OR _old.claimed_issuer_name   IS DISTINCT FROM _claimed_issuer_name
    OR _old.jurisdiction_code     IS DISTINCT FROM _jurisdiction_code
    OR _old.issued_on             IS DISTINCT FROM _issued_on
    OR _old.valid_from            IS DISTINCT FROM _valid_from
    OR _old.valid_until           IS DISTINCT FROM _valid_until
    OR _old.credential_code       IS DISTINCT FROM _credential_code
    OR _old.credential_reference  IS DISTINCT FROM _credential_reference
    OR _old.skill_level           IS DISTINCT FROM _skill_level
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
    issued_on, valid_from, valid_until,
    credential_code, credential_reference, holder_note,
    skill_code, skill_level,
    assertion_level, verified_by_user_id, verified_at,
    lifecycle_state, version_no, supersedes_id)
  VALUES (
    _old.holder_user_id, _old.claim_type, _title, _claimed_issuer_name,
    _jurisdiction_code, _issued_on, _valid_from, _valid_until,
    _credential_code, _credential_reference, _holder_note,
    _old.skill_code, _skill_level,
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
      'previous_skill_level', _old.skill_level,
      'skill_level', _skill_level));

  RETURN _new_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text) TO authenticated;
