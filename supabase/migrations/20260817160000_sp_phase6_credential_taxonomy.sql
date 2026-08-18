-- Security Passport — Phase 6: the launch credential taxonomy.
--
-- Additive only. No column is dropped, no constraint is tightened on existing
-- rows, and every new column is NULLable, so every row written before this
-- migration remains valid and every existing query keeps working.
--
-- ── WHY A TAXONOMY TABLE RATHER THAN MORE claim_type VALUES ────────────
--
-- `claim_type` answers "what kind of thing is this" (training, licence,
-- certification…). It is deliberately generic and shared across every
-- jurisdiction the Passport will ever cover.
--
-- VU1, VU2, ordningsvaktsförordnande and skyddsvaktsförordnande are something
-- narrower: four NAMED Swedish credentials the product supports at launch.
-- Adding them to `claim_type` would conflate the two questions and force a
-- schema migration for every future credential. Adding them as free text in
-- `title` would mean identifying a credential by pattern-matching whatever the
-- holder typed — far too weak to hang a trust symbol on.
--
-- So: a controlled vocabulary table, referenced by FK. A new supported
-- credential is then an INSERT, not a migration, and `credential_code` is a
-- reliable key for the symbol system.
--
-- ── WHY THE RULES LIVE IN THE TABLE ────────────────────────────────────
--
-- An appointment (förordnande) and a completed course are different kinds of
-- fact. An appointment is time-limited and made BY an authority, so a missing
-- valid-until date or a missing authority would misrepresent it. A completed
-- VU1 has no expiry at all, and inventing one would misrepresent that.
--
-- Those differences are per-credential data (`category`,
-- `requires_valid_until`, `requires_issuer`), enforced by a trigger, rather
-- than branches in application code. The database therefore refuses a
-- misrepresented credential no matter which caller writes it.

-- ---------------------------------------------------------------------------
-- 1. The controlled vocabulary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_credential_types (
  code       text PRIMARY KEY CHECK (code ~ '^[A-Z0-9_]{2,16}$'),

  -- Which generic claim_type a credential of this code is recorded as. The
  -- taxonomy REFINES claim_type; it does not replace it.
  claim_type text NOT NULL CHECK (claim_type IN
    ('training', 'certification', 'licence', 'education',
     'professional_membership', 'specialisation')),

  -- 'qualification' — something completed or awarded, e.g. a course.
  -- 'appointment'   — an authorisation to act, granted by an authority.
  -- The distinction is load-bearing: it decides the wording the holder sees
  -- and whether an end date is mandatory.
  category   text NOT NULL CHECK (category IN ('qualification', 'appointment')),

  name_sv    text NOT NULL CHECK (length(btrim(name_sv)) > 0),
  name_en    text NOT NULL CHECK (length(btrim(name_en)) > 0),

  -- Short label for the credential symbol. Kept separate from the code so the
  -- displayed glyph text is a presentation decision, not an identifier.
  symbol_label text NOT NULL CHECK (length(btrim(symbol_label)) BETWEEN 1 AND 4),

  -- A time-limited appointment MUST carry an end date. A qualification that
  -- genuinely has no expiry MUST NOT be forced to invent one.
  requires_valid_until boolean NOT NULL DEFAULT false,

  -- An appointment without a named appointing authority is unattributable.
  requires_issuer      boolean NOT NULL DEFAULT false,

  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_credential_types IS
  'Controlled vocabulary of the named credentials the Passport supports. '
  'Adding a supported credential is an INSERT here, not a schema change. '
  'requires_valid_until / requires_issuer are enforced by '
  'sp_claims_credential_rules_trg, so the database refuses a misrepresented '
  'credential regardless of caller.';

-- The four launch credentials.
--
-- VU1/VU2 are grundutbildning steps: completed training, no expiry of their
-- own. Ordningsvakt and skyddsvakt are förordnanden: time-limited
-- authorisations granted by an authority, so both an authority and an end
-- date are mandatory.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, symbol_label,
   requires_valid_until, requires_issuer, sort_order)
VALUES
  ('VU1', 'training', 'qualification',
   'Väktarutbildning 1 (VU1)', 'Security Guard Training 1 (VU1)', 'VU1',
   false, false, 10),
  ('VU2', 'training', 'qualification',
   'Väktarutbildning 2 (VU2)', 'Security Guard Training 2 (VU2)', 'VU2',
   false, false, 20),
  ('OV', 'licence', 'appointment',
   'Ordningsvaktsförordnande', 'Public Order Guard Appointment', 'OV',
   true, true, 30),
  ('SV', 'licence', 'appointment',
   'Skyddsvaktsförordnande', 'Protective Security Guard Appointment', 'SV',
   true, true, 40)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.sp_credential_types ENABLE ROW LEVEL SECURITY;

-- Reference data, readable by any signed-in holder so the forms can populate.
-- Deliberately NOT granted to anon: the recipient page never queries this
-- table — sp_get_disclosure carries the labels it needs into the payload, so
-- the public surface stays exactly one function.
DROP POLICY IF EXISTS sp_credential_types_read ON public.sp_credential_types;
CREATE POLICY sp_credential_types_read ON public.sp_credential_types
  FOR SELECT TO authenticated USING (is_active);

GRANT SELECT ON public.sp_credential_types TO authenticated;
REVOKE ALL ON public.sp_credential_types FROM anon;

-- ---------------------------------------------------------------------------
-- 2. The new claim columns
-- ---------------------------------------------------------------------------
-- All three are NULLable: existing claims predate the taxonomy and stay
-- valid, and a holder may still record a credential outside the four
-- supported codes as a free-text claim.
ALTER TABLE public.sp_claims
  ADD COLUMN IF NOT EXISTS credential_code text
    REFERENCES public.sp_credential_types(code),

  -- Certificate number, decision reference, diarienummer. PRIVATE: it is a
  -- lookup key into someone else's register and has no place on a public card
  -- or a social image.
  ADD COLUMN IF NOT EXISTS credential_reference text
    CHECK (credential_reference IS NULL
           OR length(btrim(credential_reference)) BETWEEN 1 AND 120),

  -- The holder's own words about their own credential. PRIVATE by default and
  -- always attributed to the holder in the UI, never presented as a finding.
  ADD COLUMN IF NOT EXISTS holder_note text
    CHECK (holder_note IS NULL OR length(holder_note) <= 2000);

COMMENT ON COLUMN public.sp_claims.credential_code IS
  'FK to the supported-credential taxonomy. NULL means a free-text claim '
  'outside the four launch credentials.';
COMMENT ON COLUMN public.sp_claims.credential_reference IS
  'PRIVATE. Certificate/decision reference. Never included in '
  'sp_get_disclosure output, a card, a social image or analytics.';
COMMENT ON COLUMN public.sp_claims.holder_note IS
  'PRIVATE, holder-authored. Never a verification finding and never '
  'disclosed publicly.';

CREATE INDEX IF NOT EXISTS sp_claims_credential_code_idx
  ON public.sp_claims (holder_user_id, credential_code)
  WHERE credential_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Per-credential integrity
--
-- A CHECK constraint cannot read another table, so the rules that live in
-- sp_credential_types are enforced by a trigger. It fires on the claim, which
-- is where the misrepresentation would otherwise be written.
--
-- Deliberately silent when credential_code IS NULL: a free-text claim is not
-- claiming to be one of these four credentials and is not held to their rules.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _t public.sp_credential_types%ROWTYPE;
BEGIN
  IF NEW.credential_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- The claim_type must match what the taxonomy says this credential is, so a
  -- VU1 cannot be filed as an appointment or a licence.
  IF NEW.claim_type <> _t.claim_type THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CLAIM_TYPE_MISMATCH: % expects claim_type %, got %',
      NEW.credential_code, _t.claim_type, NEW.claim_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- A draft is work in progress and is deliberately exempt: the holder is
  -- still filling the form in. The rules bind when the claim becomes real.
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

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sp_claims_credential_rules_trg ON public.sp_claims;
CREATE TRIGGER sp_claims_credential_rules_trg
  BEFORE INSERT OR UPDATE ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.sp_claims_credential_rules();

COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy rules on every claim write, for every caller '
  'including service_role. Drafts are exempt so a half-filled form can be '
  'saved; the rules bind the moment the claim is no longer a draft.';
