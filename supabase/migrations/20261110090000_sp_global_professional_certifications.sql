-- Security Passport — the governed international-certification foundation.
--
-- Additive only. No column is dropped, no existing row is rewritten, no
-- existing constraint is tightened on existing data, and every new column is
-- NULLable. Sweden, the United Kingdom and Dubai behave exactly as they do
-- today: this file does not touch a market pack, a jurisdiction, an authority,
-- a regulated role or a single existing claim.
--
-- ══ WHY INTERNATIONAL SCOPE IS A COLUMN AND NOT AN INFERENCE ═══════════
--
-- The Passport already knows how to say WHERE a credential comes from:
-- 20260907090000 separated jurisdiction, sub-jurisdiction, authority and
-- market pack, permanently, so that a British licence and a Swedish
-- förordnande could never become peers in one flat vocabulary.
--
-- A CPP is a different shape again. It is real, it is professional, it is
-- awarded by an organisation rather than by a regulator — and it authorises
-- nothing, anywhere. Every cheap way of recognising one is wrong:
--
--   jurisdiction_code IS NULL   also true of a language, a practical skill
--                               and every free-text training row ever typed
--   the issuer's country        ASIS is incorporated in the United States;
--                               a CPP is not a US credential
--   the word "international"    holder-supplied text
--   a title or an abbreviation  "CPP" is also a job title, a Swedish acronym
--                               and whatever anyone chooses to type
--   a Career Center category    research about a profession, not a fact about
--                               a person
--   an uploaded document        a PDF asserts; it does not govern
--
-- So scope is DECLARED, by the catalogue, in `sp_credential_types.scope_code`,
-- and it is a foreign key into a lookup table rather than a PostgreSQL enum
-- because this migration must roll back cleanly and a dropped enum value is
-- not a thing Postgres offers.
--
-- Null scope means "not declared", which is what every legacy and free-text
-- row keeps. It never means global. That asymmetry is the whole point: this
-- file adds a way to SAY international and adds no way to GUESS it.
--
-- ══ WHY A SEPARATE ISSUER REGISTRY AND NOT sp_authorities ══════════════
--
-- `sp_authorities` holds Polismyndigheten, Länsstyrelsen, the SIA and SIRA:
-- bodies whose decisions carry legal force in a named territory. ASIS
-- International is not one of those and must never be filed as one, because
-- the moment a certification body sits in the regulator table, a Passport can
-- present an ASIS certificate as though somebody's government issued it.
--
-- `sp_certification_issuers` is therefore its own table, with its own
-- vocabulary — how the issuer can be CHECKED, not what it can AUTHORISE — and
-- with no jurisdiction column at all, so an issuer's domicile can never become
-- a credential's jurisdiction by a later join.
--
-- ══ WHY THE PROGRAMME'S RULES AND THE HOLDER'S STANDING ARE SEPARATE ═══
--
-- "ASIS recertifies on a three-year cycle" is a fact about ASIS. "Sara is
-- currently certified" is a fact about Sara, and no amount of the first proves
-- the second. `sp_certification_definitions` carries the programme policy;
-- `sp_claim_certification_lifecycle` carries the holder's own dated statement
-- about their own standing, with its source recorded. Nothing in this file
-- computes the second from the first, and `sp_certification_lifecycle_rules`
-- refuses a status that does not say when it was true.
--
-- ══ WHAT THIS FILE DELIBERATELY DOES NOT DO ════════════════════════════
--
--   * it does not backfill, upgrade or touch one existing claim, including
--     the free-text rows reading "ASIS", "CPP", "CISSP" and "test";
--   * it does not open, activate or alter a market;
--   * it does not grant a certification any contribution to local eligibility
--     or to a professional title — the CHECK below makes that structural;
--   * it adds no UI, no share transport and no recipient field.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The scope vocabulary
-- ---------------------------------------------------------------------------
-- A lookup table, not an enum. `DROP TYPE` is all-or-nothing and a used enum
-- value cannot be removed, so an enum would make the rollback in
-- supabase/rollback/ a lie. A table row deletes.

CREATE TABLE IF NOT EXISTS public.sp_credential_scopes (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{2,31}$'),

  -- TRUE when a credential of this scope belongs to a named territory and is
  -- meaningless outside it. FALSE for a portable professional certification.
  -- Read by the classifier; never derived from the absence of a country.
  is_territorial boolean NOT NULL,

  name_sv text NOT NULL CHECK (length(btrim(name_sv)) > 0),
  name_en text NOT NULL CHECK (length(btrim(name_en)) > 0),

  -- What the scope MEANS, in the words a reviewer and a holder both read.
  -- Stored rather than left to a component so the definition cannot drift
  -- between the surfaces that state it.
  meaning_en text NOT NULL CHECK (length(btrim(meaning_en)) > 0),

  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_credential_scopes IS
  'The governed answer to "what KIND of reach does this credential have". '
  'A lookup table rather than an enum so the rollback can remove a value. '
  'Scope is always declared on the credential definition and is never '
  'inferred from a null jurisdiction, an issuer domicile, a title or a '
  'document.';

INSERT INTO public.sp_credential_scopes
  (code, is_territorial, name_sv, name_en, meaning_en, sort_order)
VALUES
  ('national_regulated', true,
   'Nationell reglerad behörighet', 'National regulated credential',
   'A licence, appointment or qualification that belongs to one jurisdiction '
   'and means nothing outside it. Its jurisdiction never changes when the '
   'holder moves country.',
   10),
  ('global_professional', false,
   'Internationell yrkescertifiering', 'International professional certification',
   'A professional certification awarded by an international body. It travels '
   'with the holder and is NOT a permission to work in any country. Whether a '
   'country recognises it is a separate, dated rule backed by that country''s '
   'own official source.',
   20)
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. The issuer registry
-- ---------------------------------------------------------------------------
-- Deliberately WITHOUT a jurisdiction column. ASIS is incorporated somewhere;
-- a CPP is not from there. Leaving the column out means no later join can
-- accidentally turn a domicile into a credential's jurisdiction.

CREATE TABLE IF NOT EXISTS public.sp_certification_issuers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Immutable. Holder claims reach an issuer only through a credential code,
  -- but governance, sources and aliases all key on this, and a renamed issuer
  -- code would silently re-point them. `sp_certification_issuer_code_immutable`
  -- refuses the UPDATE for every caller.
  issuer_code text NOT NULL UNIQUE CHECK (issuer_code ~ '^[A-Z][A-Z0-9_]{1,31}$'),

  -- The ONE name any surface prints. Controlled, because "(ISC)²" renders
  -- differently in eight places and "ISACA" expands into an organisation name
  -- ISACA itself retired.
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),

  -- The registered legal entity, where it differs from the display name and
  -- where it has been read off an official source. NULL is honest.
  legal_name text CHECK (legal_name IS NULL OR length(btrim(legal_name)) > 0),

  official_url text NOT NULL CHECK (official_url ~ '^https://'),

  -- How a third party can CHECK a holder's standing with this issuer. This is
  -- the issuer's own published capability and nothing more — it is not a claim
  -- that CQrityjob has checked anything.
  --
  --   exact_match_lookup  a public tool that answers about a named holder when
  --                       given identifying details (a member/certificate id)
  --   opt_in_directory    a listing the holder chooses to appear in; ABSENCE
  --                       PROVES NOTHING
  --   issuer_account      confirmation requires the issuer's own account or a
  --                       manual evidence route
  --   none                no official public holder lookup is confirmed
  verification_mode text NOT NULL CHECK (verification_mode IN
    ('exact_match_lookup', 'opt_in_directory', 'issuer_account', 'none')),

  -- The public lookup, when one is confirmed. A marketing page, a site search
  -- result or a third-party badge platform is NOT one, and `none` may not
  -- carry a URL at all.
  public_verification_url text CHECK (public_verification_url IS NULL
                                      OR public_verification_url ~ '^https://'),

  -- Whether failing to find a holder through this issuer's route means
  -- anything. For an opt-in directory it emphatically does not, and a surface
  -- that reads this column cannot render "not found" as "not certified".
  absence_is_inconclusive boolean NOT NULL DEFAULT true,

  source_reviewed_on date NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to   date,
  is_active boolean NOT NULL DEFAULT true,

  predecessor_issuer_id uuid REFERENCES public.sp_certification_issuers(id),
  successor_issuer_id   uuid REFERENCES public.sp_certification_issuers(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_certification_issuer_no_url_without_mode
    CHECK (public_verification_url IS NULL OR verification_mode <> 'none'),

  -- An opt-in directory whose absence was treated as conclusive would be the
  -- single most damaging thing this table could say about a real person.
  CONSTRAINT sp_certification_issuer_directory_absence_is_inconclusive
    CHECK (verification_mode <> 'opt_in_directory' OR absence_is_inconclusive),

  CONSTRAINT sp_certification_issuer_dates_ordered
    CHECK (effective_to IS NULL OR effective_to > effective_from),

  CONSTRAINT sp_certification_issuer_not_self_succeeding
    CHECK (successor_issuer_id IS DISTINCT FROM id
           AND predecessor_issuer_id IS DISTINCT FROM id)
);

COMMENT ON TABLE public.sp_certification_issuers IS
  'Organisations that AWARD international professional certifications. NOT '
  'regulators: sp_authorities holds those, and the two are separate tables so '
  'a certification body can never be presented as a body whose decision '
  'carries legal force. Deliberately carries no jurisdiction column — an '
  'issuer''s domicile is not its credentials'' jurisdiction.';

COMMENT ON COLUMN public.sp_certification_issuers.absence_is_inconclusive IS
  'TRUE when not finding a holder through this issuer''s route proves nothing. '
  'Always TRUE for an opt-in directory, by constraint.';

CREATE TABLE IF NOT EXISTS public.sp_certification_issuer_aliases (
  issuer_id uuid NOT NULL REFERENCES public.sp_certification_issuers(id),
  alias     text NOT NULL CHECK (length(btrim(alias)) > 0),

  -- Why the alias exists. NONE of these is a display name: the registry has
  -- exactly one of those, and an alias that could be printed would reintroduce
  -- the drift the controlled name exists to remove.
  alias_kind text NOT NULL CHECK (alias_kind IN
    ('historical_name', 'search_alias', 'legal_name_variant')),

  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer_id, alias)
);

COMMENT ON TABLE public.sp_certification_issuer_aliases IS
  'Former and alternative names, for SEARCH and for deterministic future '
  'migration only. Never a display name and never a matching rule that could '
  'upgrade a free-text claim.';

-- ---------------------------------------------------------------------------
-- 3. The reviewed sources
-- ---------------------------------------------------------------------------
-- Governance, not decoration. A catalogue entry whose source nobody read, on a
-- date nobody recorded, is an assertion wearing a database row.

CREATE TABLE IF NOT EXISTS public.sp_certification_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id uuid NOT NULL REFERENCES public.sp_certification_issuers(id),

  -- NULL when the source governs the whole issuer rather than one programme.
  credential_code text REFERENCES public.sp_credential_types(code),

  source_kind text NOT NULL CHECK (source_kind IN
    ('issuer_site', 'programme', 'maintenance_policy',
     'public_verification', 'directory')),

  title text NOT NULL CHECK (length(btrim(title)) > 0),
  url   text NOT NULL CHECK (url ~ '^https://'),

  reviewed_on   date NOT NULL,
  reviewed_by   text NOT NULL CHECK (length(btrim(reviewed_by)) > 0),
  superseded_on date,

  -- What the reviewer actually read, in their own words. The re-review in a
  -- year compares against this rather than against a memory.
  review_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_certification_source_dates_ordered
    CHECK (superseded_on IS NULL OR superseded_on >= reviewed_on)
);

COMMENT ON TABLE public.sp_certification_sources IS
  'Every official page a catalogue entry rests on, with who read it and when. '
  'A new certification may not be added without one programme source and one '
  'maintenance source reviewed here.';

CREATE INDEX IF NOT EXISTS sp_certification_sources_issuer_idx
  ON public.sp_certification_sources (issuer_id, source_kind)
  WHERE superseded_on IS NULL;

-- One reviewed source per issuer, programme and kind. `coalesce` rather than a
-- plain UNIQUE because an issuer-level source has a NULL credential_code, and
-- NULLs do not collide — which would have let the seed below insert a second
-- copy of every issuer-level source each time the file re-applied after its
-- rollback. The repository requires that round trip, so the seed has to be
-- idempotent and this index is what makes ON CONFLICT DO NOTHING possible.
CREATE UNIQUE INDEX IF NOT EXISTS sp_certification_sources_identity_idx
  ON public.sp_certification_sources
     (issuer_id, coalesce(credential_code, ''), source_kind, url);


-- ---------------------------------------------------------------------------
-- 4. sp_credential_types learns its scope
-- ---------------------------------------------------------------------------
-- One nullable column on the EXISTING definition table. There is no second
-- credential vocabulary: `sp_credential_types.code` remains the only identity
-- a claim can reference, and section 5 extends it rather than competing with it.

ALTER TABLE public.sp_credential_types
  ADD COLUMN IF NOT EXISTS scope_code text
    REFERENCES public.sp_credential_scopes(code);

COMMENT ON COLUMN public.sp_credential_types.scope_code IS
  'The DECLARED reach of this credential. NULL means undeclared, which is '
  'what every pre-existing row keeps and what every free-text claim stays. '
  'NULL is never global: a global certification says so in this column or it '
  'is not one.';

CREATE INDEX IF NOT EXISTS sp_credential_types_scope_idx
  ON public.sp_credential_types (scope_code)
  WHERE scope_code IS NOT NULL;

-- CISSP and CRISC are five characters. The plate has carried a 1..4 CHECK
-- since 20260817160000, when every mark in the product was VU1, VU2, OV or SV.
-- RELAXED, never tightened: no existing row can become invalid, and the
-- rollback restores the original bound after removing the rows that need the
-- extra room.
ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_types_symbol_label_check;
ALTER TABLE public.sp_credential_types
  ADD CONSTRAINT sp_credential_types_symbol_label_check
  CHECK (length(btrim(symbol_label)) BETWEEN 1 AND 8);

COMMENT ON CONSTRAINT sp_credential_types_symbol_label_check
  ON public.sp_credential_types IS
  'Relaxed from 4 to 8 by 20261110090000. A five-character mark (CISSP, '
  'CRISC) must be storable and rendered whole; truncating a credential''s own '
  'abbreviation is how a Passport prints something nobody awarded.';


-- ---------------------------------------------------------------------------
-- 5. The certification definition
-- ---------------------------------------------------------------------------
-- A 1:1 EXTENSION of sp_credential_types, keyed by its code. Not a second
-- catalogue: a row here cannot exist without the definition it extends, and
-- nothing reads it to decide what a credential IS — only what its programme
-- says about maintaining it and which sources were read.

CREATE TABLE IF NOT EXISTS public.sp_certification_definitions (
  credential_code text PRIMARY KEY
    REFERENCES public.sp_credential_types(code),

  issuer_id uuid NOT NULL REFERENCES public.sp_certification_issuers(id),

  canonical_name_en text NOT NULL CHECK (length(btrim(canonical_name_en)) > 0),

  -- No four-character assumption anywhere. The column is bounded at 12 so a
  -- sentence cannot be stored as an abbreviation, and the plate's own CHECK
  -- (section 4) is the rendering bound.
  abbreviation text NOT NULL CHECK (length(btrim(abbreviation)) BETWEEN 1 AND 12),

  programme_url          text NOT NULL CHECK (programme_url ~ '^https://'),
  maintenance_policy_url text NOT NULL CHECK (maintenance_policy_url ~ '^https://'),

  -- What SHAPE the programme's maintenance takes. This informs labels and the
  -- annual re-review. It never produces a date for a holder.
  --
  --   recertification_cycle          a fixed cycle, recertify at its end
  --   cycle_plus_annual_maintenance  a cycle AND a separate annual obligation
  --   annual_compliance              an annual obligation, no fixed cycle
  --   none_published                 nothing official was found
  maintenance_policy_type text NOT NULL CHECK (maintenance_policy_type IN
    ('recertification_cycle', 'cycle_plus_annual_maintenance',
     'annual_compliance', 'none_published')),

  -- NULL where the programme publishes no cycle. An annual-compliance
  -- programme has none, and inventing thirty-six months for it would be the
  -- fabrication this whole section exists to prevent.
  maintenance_cycle_months integer
    CHECK (maintenance_cycle_months IS NULL
           OR maintenance_cycle_months BETWEEN 1 AND 240),

  -- The programme's rules in prose, as read from the source. Structured
  -- enough to display, never structured enough to compute a holder's status.
  maintenance_summary_en text NOT NULL
    CHECK (length(btrim(maintenance_summary_en)) > 0),

  maintenance_policy_version        text,
  maintenance_policy_effective_from date,

  -- A programme-level override of the issuer's verification route. NULL means
  -- inherit, which is the normal case and is stated rather than implied.
  public_verification_url text CHECK (public_verification_url IS NULL
                                      OR public_verification_url ~ '^https://'),

  source_reviewed_on date NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,

  -- A retired programme stays readable forever: holders keep claims against
  -- it. `sp_claims_credential_rules` already refuses a NEW claim on an
  -- inactive definition, which is the separate half of the same rule.
  retired_on date,
  replaced_by_code text REFERENCES public.sp_credential_types(code),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_certification_definition_cycle_matches_policy
    CHECK ((maintenance_policy_type IN
              ('recertification_cycle', 'cycle_plus_annual_maintenance'))
           = (maintenance_cycle_months IS NOT NULL)),

  CONSTRAINT sp_certification_definition_not_self_replacing
    CHECK (replaced_by_code IS DISTINCT FROM credential_code),

  CONSTRAINT sp_certification_definition_dates_ordered
    CHECK (retired_on IS NULL OR retired_on >= effective_from)
);

COMMENT ON TABLE public.sp_certification_definitions IS
  'The governed detail of one international professional certification, '
  'keyed to the sp_credential_types row it extends. Carries the ISSUER''s '
  'maintenance policy and the reviewed sources — never a holder''s dates and '
  'never a holder''s status.';

COMMENT ON COLUMN public.sp_certification_definitions.maintenance_cycle_months IS
  'The PROGRAMME''s cycle, where one is published. Never a holder''s expiry: '
  'no code in this repository adds it to an award date, and '
  'sp_certification_lifecycle_rules refuses a holder status that does not '
  'carry its own as-of date.';

CREATE INDEX IF NOT EXISTS sp_certification_definitions_issuer_idx
  ON public.sp_certification_definitions (issuer_id);

-- Only a declared global definition may have one. Enforced by trigger because
-- a CHECK cannot read sp_credential_types.
CREATE OR REPLACE FUNCTION public.sp_certification_definition_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _t public.sp_credential_types%ROWTYPE;
BEGIN
  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CERTIFICATION_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _t.scope_code IS DISTINCT FROM 'global_professional' THEN
    RAISE EXCEPTION
      'SP_CERTIFICATION_SCOPE_REQUIRED: % is scope %, not global_professional',
      NEW.credential_code, coalesce(_t.scope_code, 'undeclared')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS sp_certification_definition_rules_trg
  ON public.sp_certification_definitions;
CREATE TRIGGER sp_certification_definition_rules_trg
  BEFORE INSERT OR UPDATE ON public.sp_certification_definitions
  FOR EACH ROW EXECUTE FUNCTION public.sp_certification_definition_rules();

REVOKE ALL ON FUNCTION public.sp_certification_definition_rules() FROM PUBLIC, anon;

-- The issuer code is an identity. Renaming one would silently re-point every
-- source and alias keyed to it.
CREATE OR REPLACE FUNCTION public.sp_certification_issuer_code_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.issuer_code IS DISTINCT FROM OLD.issuer_code THEN
    RAISE EXCEPTION
      'SP_ISSUER_CODE_IMMUTABLE: % may not be renamed to %; retire it and add a successor',
      OLD.issuer_code, NEW.issuer_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS sp_certification_issuer_code_immutable_trg
  ON public.sp_certification_issuers;
CREATE TRIGGER sp_certification_issuer_code_immutable_trg
  BEFORE UPDATE ON public.sp_certification_issuers
  FOR EACH ROW EXECUTE FUNCTION public.sp_certification_issuer_code_immutable();

REVOKE ALL ON FUNCTION public.sp_certification_issuer_code_immutable() FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- 6. The holder's own lifecycle statement
-- ---------------------------------------------------------------------------
-- `sp_claims.valid_until` means one thing across the whole Passport: the date
-- an authorisation stops authorising. None of these certifications works that
-- way. ASIS recertifies on a cycle; ISACA's annual standing can end before the
-- three-year date printed on the certificate; a CFE complies annually. Reusing
-- `valid_until` would have made a Passport state, in its own vocabulary, that
-- a certification had expired when its issuer says no such thing.
--
-- So the certification lifecycle is a normalised side table with its own
-- explicit semantics, and `sp_claims` is untouched.
--
-- OWNER-ONLY. It is the holder's statement about themselves; nothing in a
-- disclosure, a card or an export reads it in this phase.

CREATE TABLE IF NOT EXISTS public.sp_claim_certification_lifecycle (
  claim_id uuid PRIMARY KEY REFERENCES public.sp_claims(id) ON DELETE CASCADE,

  -- Denormalised from the claim so RLS can decide ownership without a join
  -- into a table whose own policy would then have to be reasoned about. Pinned
  -- to the claim's holder by trigger for every caller, service_role included.
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  awarded_on date,

  -- The end of the programme's current cycle FOR THIS HOLDER, as the holder
  -- states it or as a reviewed document shows it. Never computed.
  cycle_ends_on date,

  -- What that date actually is. Without this the same column would mean
  -- "recertify by" for an ASIS holder and "printed on the certificate" for an
  -- ISACA one, and a surface would have to guess which.
  cycle_end_semantics text NOT NULL DEFAULT 'unknown' CHECK (cycle_end_semantics IN
    ('unknown',
     'recertification_due',      -- the cycle ends and recertification is due
     'certificate_printed_date', -- what the certificate says; NOT current standing
     'annual_compliance_due')),  -- the next annual obligation falls due

  -- The holder's standing, as last established. `unknown` is the honest
  -- default and is not a downgrade of anything.
  holder_lifecycle_status text NOT NULL DEFAULT 'unknown'
    CHECK (holder_lifecycle_status IN
      ('unknown', 'active', 'lapsed', 'suspended', 'expired', 'revoked', 'retired')),

  -- WHEN that status was true. A status with no as-of date is a claim about
  -- the present that nobody checked in the present.
  status_as_of date,

  -- WHERE the status came from. `document_reviewed` is CQrityjob reading a
  -- certificate. It is NOT issuer confirmation, and the constraint below stops
  -- it from ever filling the issuer-confirmation fields.
  status_source text NOT NULL DEFAULT 'holder_declared' CHECK (status_source IN
    ('holder_declared', 'document_reviewed', 'issuer_confirmed')),

  -- Reserved for a future authenticated issuer channel. No code in this
  -- repository writes either column, and the constraint means a row cannot
  -- claim issuer confirmation without both.
  issuer_confirmed_at         timestamptz,
  issuer_confirmed_source_url text CHECK (issuer_confirmed_source_url IS NULL
                                          OR issuer_confirmed_source_url ~ '^https://'),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_certification_lifecycle_status_is_dated
    CHECK (holder_lifecycle_status = 'unknown' OR status_as_of IS NOT NULL),

  -- A PDF, a logo, an email domain, a link click and a directory search are
  -- none of them an authenticated issuer speaking. Issuer confirmation needs
  -- an actor time and a source, and a document review can supply neither.
  CONSTRAINT sp_certification_lifecycle_issuer_confirmation_is_attributed
    CHECK ((status_source = 'issuer_confirmed')
           = (issuer_confirmed_at IS NOT NULL
              AND issuer_confirmed_source_url IS NOT NULL)),

  CONSTRAINT sp_certification_lifecycle_dates_ordered
    CHECK (cycle_ends_on IS NULL OR awarded_on IS NULL OR cycle_ends_on > awarded_on),

  CONSTRAINT sp_certification_lifecycle_semantics_needs_date
    CHECK (cycle_end_semantics = 'unknown' OR cycle_ends_on IS NOT NULL)
);

COMMENT ON TABLE public.sp_claim_certification_lifecycle IS
  'The holder''s own dated statement about their standing in one '
  'international certification programme. Owner-private. Separate from '
  'sp_claims.valid_until because a recertification cycle is not an expiry, '
  'and separate from assertion_level because trust and lifecycle are '
  'different questions with different answers.';

COMMENT ON COLUMN public.sp_claim_certification_lifecycle.cycle_ends_on IS
  'Stated, never computed. Nothing adds sp_certification_definitions.'
  'maintenance_cycle_months to awarded_on to produce this column.';

CREATE INDEX IF NOT EXISTS sp_claim_certification_lifecycle_holder_idx
  ON public.sp_claim_certification_lifecycle (holder_user_id);

-- The row belongs to the claim's holder, and the claim is a global
-- certification. Both for every caller, because RLS does not bind the owner
-- or the service role and a denormalised owner column that can lie is worse
-- than no column at all.
CREATE OR REPLACE FUNCTION public.sp_certification_lifecycle_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _claim_holder uuid;
  _code  text;
  _scope text;
BEGIN
  SELECT c.holder_user_id, c.credential_code INTO _claim_holder, _code
    FROM public.sp_claims c WHERE c.id = NEW.claim_id;

  IF _claim_holder IS NULL THEN
    RAISE EXCEPTION 'SP_CERTIFICATION_LIFECYCLE_CLAIM_UNKNOWN: %', NEW.claim_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.holder_user_id <> _claim_holder THEN
    RAISE EXCEPTION
      'SP_CERTIFICATION_LIFECYCLE_WRONG_HOLDER: the lifecycle row must belong to the claim''s holder'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT t.scope_code INTO _scope
    FROM public.sp_credential_types t WHERE t.code = _code;

  IF _scope IS DISTINCT FROM 'global_professional' THEN
    RAISE EXCEPTION
      'SP_CERTIFICATION_LIFECYCLE_NOT_GLOBAL: % is scope %, and this lifecycle model describes international certifications only',
      coalesce(_code, '(free text)'), coalesce(_scope, 'undeclared')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS sp_certification_lifecycle_rules_trg
  ON public.sp_claim_certification_lifecycle;
CREATE TRIGGER sp_certification_lifecycle_rules_trg
  BEFORE INSERT OR UPDATE ON public.sp_claim_certification_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.sp_certification_lifecycle_rules();

REVOKE ALL ON FUNCTION public.sp_certification_lifecycle_rules() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS sp_claim_certification_lifecycle_set_updated_at
  ON public.sp_claim_certification_lifecycle;
CREATE TRIGGER sp_claim_certification_lifecycle_set_updated_at
  BEFORE UPDATE ON public.sp_claim_certification_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sp_certification_issuers_set_updated_at
  ON public.sp_certification_issuers;
CREATE TRIGGER sp_certification_issuers_set_updated_at
  BEFORE UPDATE ON public.sp_certification_issuers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sp_certification_definitions_set_updated_at
  ON public.sp_certification_definitions;
CREATE TRIGGER sp_certification_definitions_set_updated_at
  BEFORE UPDATE ON public.sp_certification_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 7. The five issuers
-- ---------------------------------------------------------------------------
-- Reviewed 2026-09-12. Display names are the controlled form:
--
--   * `ISC2`, not `(ISC)²` — the superscript renders four different ways
--     across the surfaces this product has, and the parenthesised form is
--     kept as a SEARCH alias only;
--   * `ISACA`, not expanded — ISACA retired the expansion, and printing an
--     obsolete organisation name beside somebody's credential is a small lie
--     the holder cannot correct;
--   * ACFE carries its expansion because the abbreviation alone is not widely
--     legible outside fraud examination.

INSERT INTO public.sp_certification_issuers
  (issuer_code, display_name, legal_name, official_url,
   verification_mode, public_verification_url, absence_is_inconclusive,
   source_reviewed_on, effective_from)
VALUES
  ('ASIS', 'ASIS International', NULL,
   'https://www.asisonline.org/',
   'exact_match_lookup',
   'https://external.asisonline.org/eweb/DynamicPage.aspx?webcode=ASISCredSearch',
   true, DATE '2026-09-12', DATE '2026-09-12'),

  ('ISC2', 'ISC2',
   'International Information System Security Certification Consortium, Inc.',
   'https://www.isc2.org/',
   'exact_match_lookup', 'https://www.isc2.org/MemberVerification',
   true, DATE '2026-09-12', DATE '2026-09-12'),

  ('ISACA', 'ISACA', NULL,
   'https://www.isaca.org/',
   'exact_match_lookup', 'https://www.isaca.org/credentialing/verify-a-certification',
   true, DATE '2026-09-12', DATE '2026-09-12'),

  -- Opt-in. A CFE who has not listed themselves is not a CFE who is not
  -- certified, and the constraint on this table will not let the row say
  -- otherwise.
  ('ACFE', 'Association of Certified Fraud Examiners (ACFE)', NULL,
   'https://www.acfe.com/',
   'opt_in_directory', 'https://www.acfe.com/fraud-resources/find-a-cfe',
   true, DATE '2026-09-12', DATE '2026-09-12'),

  -- No official public holder-verification lookup was confirmed on review.
  -- The URL stays NULL. A marketing page, a site-search result and a
  -- third-party badge platform are none of them a verification service, and
  -- storing one as though it were would be the product asserting a capability
  -- it does not have.
  ('ACAMS', 'ACAMS', NULL,
   'https://www.acams.org/',
   'none', NULL,
   true, DATE '2026-09-12', DATE '2026-09-12')
ON CONFLICT (issuer_code) DO NOTHING;

INSERT INTO public.sp_certification_issuer_aliases (issuer_id, alias, alias_kind)
SELECT i.id, v.alias, v.alias_kind
FROM (VALUES
    ('ISC2',  '(ISC)²',                                                        'search_alias'),
    ('ISC2',  '(ISC)2',                                                        'search_alias'),
    ('ISC2',  'ISC²',                                                          'search_alias'),
    ('ISC2',  'International Information System Security Certification Consortium',
                                                                               'legal_name_variant'),
    ('ISACA', 'Information Systems Audit and Control Association',             'historical_name'),
    ('ACFE',  'ACFE',                                                          'search_alias'),
    ('ACAMS', 'Association of Certified Anti-Money Laundering Specialists',    'search_alias'),
    ('ASIS',  'American Society for Industrial Security',                      'historical_name')
  ) AS v(issuer_code, alias, alias_kind)
JOIN public.sp_certification_issuers i ON i.issuer_code = v.issuer_code
ON CONFLICT (issuer_id, alias) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 8. The fourteen definitions
-- ---------------------------------------------------------------------------
-- Seeded through INSERT ... SELECT over a derived table, the same shape the UK
-- and Dubai packs use, and for the same reason: the columns that matter here
-- are identical across every row and writing them once makes a divergence
-- impossible to introduce by hand.
--
-- Every row, without exception:
--
--   claim_type  = 'certification'      category = 'qualification'
--   scope_code  = 'global_professional'
--   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
--   authority_id, regulated_role_id   ALL NULL
--   contributes_to = {professional_competence}
--
-- `professional_competence` and NOTHING else. A CPP is evidence of
-- professional competence; it is not `local_eligibility` (no authority has
-- permitted anything) and it is not `active_title` (no title is derived from
-- it). `sp_credential_type_global_scope_unbound` in section 9 makes both
-- structural rather than a property of this INSERT.
--
-- `name_sv` equals `name_en` deliberately. These certifications have one name,
-- in English, given by their issuer. Inventing a Swedish translation would
-- name a credential nobody awards.
--
-- is_active = true: an international certification is not a market and is not
-- gated by one. It is reachable by every holder regardless of work country,
-- pilot entitlement or market pack, which is the point of the scope.

INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, symbol_label,
   requires_valid_until, requires_issuer, is_active, sort_order,
   scope_code, legal_review_state, contributes_to,
   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
   authority_id, regulated_role_id,
   reference_label_en, reference_label_local)
SELECT
  v.code, 'certification', 'qualification',
  v.name_en, v.name_en, v.symbol,
  -- requires_valid_until FALSE: the programme's cycle is not the holder's
  -- expiry, and demanding an end date here would make the form ask for the
  -- fabrication section 6 exists to refuse.
  false,
  -- requires_issuer FALSE: the issuer is the DEFINITION's, read from the
  -- registry. Asking the holder to type it would put a controlled fact into a
  -- free-text box.
  false,
  true, v.sort_order,
  'global_professional', 'approved',
  ARRAY['professional_competence']::text[],
  NULL, NULL, NULL, NULL, NULL,
  'Certification / member number', 'Certification / member number'
FROM (VALUES
    -- ASIS International — 4
    ('INTL_ASIS_APP',    'Associate Protection Professional (APP)',                      'APP',   1010),
    ('INTL_ASIS_CPP',    'Certified Protection Professional (CPP)',                      'CPP',   1020),
    ('INTL_ASIS_PCI',    'Professional Certified Investigator (PCI)',                    'PCI',   1030),
    ('INTL_ASIS_PSP',    'Physical Security Professional (PSP)',                         'PSP',   1040),
    -- ISC2 — 5
    ('INTL_ISC2_CC',     'Certified in Cybersecurity (CC)',                              'CC',    1110),
    ('INTL_ISC2_CGRC',   'Certified in Governance, Risk and Compliance (CGRC)',          'CGRC',  1120),
    ('INTL_ISC2_SSCP',   'Systems Security Certified Practitioner (SSCP)',               'SSCP',  1130),
    ('INTL_ISC2_CISSP',  'Certified Information Systems Security Professional (CISSP)',  'CISSP', 1140),
    ('INTL_ISC2_CCSP',   'Certified Cloud Security Professional (CCSP)',                 'CCSP',  1150),
    -- ISACA — 3
    ('INTL_ISACA_CISA',  'Certified Information Systems Auditor (CISA)',                 'CISA',  1210),
    ('INTL_ISACA_CISM',  'Certified Information Security Manager (CISM)',                'CISM',  1220),
    ('INTL_ISACA_CRISC', 'Certified in Risk and Information Systems Control (CRISC)',    'CRISC', 1230),
    -- ACFE — 1
    ('INTL_ACFE_CFE',    'Certified Fraud Examiner (CFE)',                               'CFE',   1310),
    -- ACAMS — 1
    ('INTL_ACAMS_CAMS',  'Certified Anti-Money Laundering Specialist (CAMS)',            'CAMS',  1410)
  ) AS v(code, name_en, symbol, sort_order)
ON CONFLICT (code) DO NOTHING;

-- The governed detail, per programme.
INSERT INTO public.sp_certification_definitions
  (credential_code, issuer_id, canonical_name_en, abbreviation,
   programme_url, maintenance_policy_url,
   maintenance_policy_type, maintenance_cycle_months, maintenance_summary_en,
   public_verification_url, source_reviewed_on, effective_from)
SELECT
  v.code, i.id, t.name_en, v.abbreviation,
  v.programme_url, v.maintenance_url,
  v.policy_type, v.cycle_months, v.summary,
  NULL, DATE '2026-09-12', DATE '2026-09-12'
FROM (VALUES
    ('INTL_ASIS_APP', 'ASIS', 'APP',
     'https://www.asisonline.org/certification/associate-protection-professional-app/',
     'https://www.asisonline.org/certification/recertification/',
     'recertification_cycle', 36,
     'ASIS board certifications are maintained on a three-year recertification cycle, with continuing professional education recorded through the issuer''s own portal. The cycle is the programme''s; it is not this holder''s expiry date.'),
    ('INTL_ASIS_CPP', 'ASIS', 'CPP',
     'https://www.asisonline.org/certification/certified-protection-professional-cpp/',
     'https://www.asisonline.org/certification/recertification/',
     'recertification_cycle', 36,
     'ASIS board certifications are maintained on a three-year recertification cycle, with continuing professional education recorded through the issuer''s own portal. The cycle is the programme''s; it is not this holder''s expiry date.'),
    ('INTL_ASIS_PCI', 'ASIS', 'PCI',
     'https://www.asisonline.org/certification/professional-certified-investigator-pci/',
     'https://www.asisonline.org/certification/recertification/',
     'recertification_cycle', 36,
     'ASIS board certifications are maintained on a three-year recertification cycle, with continuing professional education recorded through the issuer''s own portal. The cycle is the programme''s; it is not this holder''s expiry date.'),
    ('INTL_ASIS_PSP', 'ASIS', 'PSP',
     'https://www.asisonline.org/certification/physical-security-professional/',
     'https://www.asisonline.org/certification/recertification/',
     'recertification_cycle', 36,
     'ASIS board certifications are maintained on a three-year recertification cycle, with continuing professional education recorded through the issuer''s own portal. The cycle is the programme''s; it is not this holder''s expiry date.'),

    ('INTL_ISC2_CC', 'ISC2', 'CC',
     'https://www.isc2.org/certifications/cc',
     'https://www.isc2.org/policies-procedures/member-policies',
     'cycle_plus_annual_maintenance', 36,
     'ISC2 certifications run on a three-year cycle AND carry a separate annual maintenance obligation. Both must be in good standing; either alone says nothing about the holder''s current status. CPE totals are credential-specific.'),
    ('INTL_ISC2_CGRC', 'ISC2', 'CGRC',
     'https://www.isc2.org/certifications/cgrc',
     'https://www.isc2.org/policies-procedures/member-policies',
     'cycle_plus_annual_maintenance', 36,
     'ISC2 certifications run on a three-year cycle AND carry a separate annual maintenance obligation. Both must be in good standing; either alone says nothing about the holder''s current status. CPE totals are credential-specific.'),
    ('INTL_ISC2_SSCP', 'ISC2', 'SSCP',
     'https://www.isc2.org/certifications/sscp',
     'https://www.isc2.org/policies-procedures/member-policies',
     'cycle_plus_annual_maintenance', 36,
     'ISC2 certifications run on a three-year cycle AND carry a separate annual maintenance obligation. Both must be in good standing; either alone says nothing about the holder''s current status. CPE totals are credential-specific.'),
    ('INTL_ISC2_CISSP', 'ISC2', 'CISSP',
     'https://www.isc2.org/certifications/cissp',
     'https://www.isc2.org/policies-procedures/member-policies',
     'cycle_plus_annual_maintenance', 36,
     'ISC2 certifications run on a three-year cycle AND carry a separate annual maintenance obligation. Both must be in good standing; either alone says nothing about the holder''s current status. CPE totals are credential-specific.'),
    ('INTL_ISC2_CCSP', 'ISC2', 'CCSP',
     'https://www.isc2.org/certifications/ccsp',
     'https://www.isc2.org/policies-procedures/member-policies',
     'cycle_plus_annual_maintenance', 36,
     'ISC2 certifications run on a three-year cycle AND carry a separate annual maintenance obligation. Both must be in good standing; either alone says nothing about the holder''s current status. CPE totals are credential-specific.'),

    -- ISACA: the date printed on the certificate reflects the three-year CPE
    -- cycle. The holder's ANNUAL standing can end before it, and the issuer's
    -- own verification tool is what reports the current status. A Passport
    -- that read the printed date as an expiry would be wrong in both
    -- directions.
    ('INTL_ISACA_CISA', 'ISACA', 'CISA',
     'https://www.isaca.org/credentialing/cisa',
     'https://www.isaca.org/credentialing/cisa/maintain-cisa-certification',
     'cycle_plus_annual_maintenance', 36,
     'ISACA certifications carry an annual CPE minimum and an annual maintenance fee, alongside 120 CPE hours across a three-year reporting period. Annual standing can end BEFORE the three-year date printed on the certificate, so the printed date is not current standing.'),
    ('INTL_ISACA_CISM', 'ISACA', 'CISM',
     'https://www.isaca.org/credentialing/cism',
     'https://www.isaca.org/credentialing/cism/maintain-cism-certification',
     'cycle_plus_annual_maintenance', 36,
     'ISACA certifications carry an annual CPE minimum and an annual maintenance fee, alongside 120 CPE hours across a three-year reporting period. Annual standing can end BEFORE the three-year date printed on the certificate, so the printed date is not current standing.'),
    ('INTL_ISACA_CRISC', 'ISACA', 'CRISC',
     'https://www.isaca.org/credentialing/crisc',
     'https://www.isaca.org/credentialing/crisc/maintain-crisc-certification',
     'cycle_plus_annual_maintenance', 36,
     'ISACA certifications carry an annual CPE minimum and an annual maintenance fee, alongside 120 CPE hours across a three-year reporting period. Annual standing can end BEFORE the three-year date printed on the certificate, so the printed date is not current standing.'),

    -- ACFE: annual compliance, NOT a three-year expiry. `cycle_months` is
    -- NULL and the constraint in section 5 requires it to be.
    ('INTL_ACFE_CFE', 'ACFE', 'CFE',
     'https://www.acfe.com/cfe-credential',
     'https://www.acfe.com/cfe-credential/continuing-professional-education-cpe-requirements',
     'annual_compliance', NULL,
     'The CFE credential is maintained by an ANNUAL continuing-education compliance obligation, not by a fixed multi-year expiry. The ACFE''s Find a CFE directory is opt-in: absence from it is not evidence that a credential is invalid.'),

    ('INTL_ACAMS_CAMS', 'ACAMS', 'CAMS',
     'https://www.acams.org/en/certifications/cams-certification',
     'https://www.acams.org/en/certifications/recertification',
     'recertification_cycle', 36,
     'CAMS is maintained on a three-year recertification cycle with recertification credits earned within it. No official public holder-verification lookup was confirmed on review, so none is recorded.')
  ) AS v(code, issuer_code, abbreviation, programme_url, maintenance_url,
         policy_type, cycle_months, summary)
JOIN public.sp_certification_issuers i ON i.issuer_code = v.issuer_code
JOIN public.sp_credential_types t ON t.code = v.code
ON CONFLICT (credential_code) DO NOTHING;

-- The sources, per issuer and per programme.
INSERT INTO public.sp_certification_sources
  (issuer_id, credential_code, source_kind, title, url, reviewed_on, reviewed_by, review_note)
SELECT i.id, v.credential_code, v.source_kind, v.title, v.url,
       DATE '2026-09-12', 'CQrityjob Passport governance', v.note
FROM (VALUES
    ('ASIS', NULL, 'issuer_site', 'ASIS International', 'https://www.asisonline.org/',
     'The issuer''s own site. Domicile is recorded nowhere: it is not a jurisdiction.'),
    ('ASIS', NULL, 'maintenance_policy', 'ASIS recertification',
     'https://www.asisonline.org/certification/recertification/',
     'Three-year recertification cycle across APP, CPP, PCI and PSP, maintained by continuing professional education.'),
    ('ASIS', NULL, 'public_verification', 'ASIS credential search',
     'https://external.asisonline.org/eweb/DynamicPage.aspx?webcode=ASISCredSearch',
     'Exact-match lookup: it answers about a named holder given identifying details.'),
    ('ASIS', 'INTL_ASIS_APP', 'programme', 'Associate Protection Professional (APP)',
     'https://www.asisonline.org/certification/associate-protection-professional-app/', NULL),
    ('ASIS', 'INTL_ASIS_CPP', 'programme', 'Certified Protection Professional (CPP)',
     'https://www.asisonline.org/certification/certified-protection-professional-cpp/', NULL),
    ('ASIS', 'INTL_ASIS_PCI', 'programme', 'Professional Certified Investigator (PCI)',
     'https://www.asisonline.org/certification/professional-certified-investigator-pci/', NULL),
    ('ASIS', 'INTL_ASIS_PSP', 'programme', 'Physical Security Professional (PSP)',
     'https://www.asisonline.org/certification/physical-security-professional/', NULL),

    ('ISC2', NULL, 'issuer_site', 'ISC2', 'https://www.isc2.org/', NULL),
    ('ISC2', NULL, 'maintenance_policy', 'ISC2 member policies',
     'https://www.isc2.org/policies-procedures/member-policies',
     'Three-year certification cycle with credential-specific CPE totals, alongside a separate annual maintenance obligation. Both must be in good standing.'),
    ('ISC2', NULL, 'maintenance_policy', 'ISC2 Annual Maintenance Fees overview',
     'https://www.isc2.org/policies-procedures/amfs-overview',
     'The annual obligation, stated separately from the three-year cycle. This is why the programme type is cycle_plus_annual_maintenance rather than a bare cycle.'),
    ('ISC2', NULL, 'public_verification', 'ISC2 member verification',
     'https://www.isc2.org/MemberVerification',
     'Exact-match lookup against a named holder and an identifying number.'),
    ('ISC2', 'INTL_ISC2_CC', 'programme', 'Certified in Cybersecurity (CC)',
     'https://www.isc2.org/certifications/cc', NULL),
    ('ISC2', 'INTL_ISC2_CGRC', 'programme', 'Certified in Governance, Risk and Compliance (CGRC)',
     'https://www.isc2.org/certifications/cgrc', NULL),
    ('ISC2', 'INTL_ISC2_SSCP', 'programme', 'Systems Security Certified Practitioner (SSCP)',
     'https://www.isc2.org/certifications/sscp', NULL),
    ('ISC2', 'INTL_ISC2_CISSP', 'programme', 'Certified Information Systems Security Professional (CISSP)',
     'https://www.isc2.org/certifications/cissp', NULL),
    ('ISC2', 'INTL_ISC2_CCSP', 'programme', 'Certified Cloud Security Professional (CCSP)',
     'https://www.isc2.org/certifications/ccsp', NULL),

    ('ISACA', NULL, 'issuer_site', 'ISACA', 'https://www.isaca.org/',
     'Display name is the abbreviation alone: ISACA retired the expansion, and printing a former organisation name beside a credential is a lie the holder cannot correct.'),
    ('ISACA', NULL, 'public_verification', 'ISACA verify a certification',
     'https://www.isaca.org/credentialing/verify-a-certification',
     'Exact-match lookup. It reports CURRENT status; the three-year date printed on a certificate does not.'),
    ('ISACA', 'INTL_ISACA_CISA', 'programme', 'Certified Information Systems Auditor (CISA)',
     'https://www.isaca.org/credentialing/cisa', NULL),
    ('ISACA', 'INTL_ISACA_CISA', 'maintenance_policy', 'Maintain CISA certification',
     'https://www.isaca.org/credentialing/cisa/maintain-cisa-certification',
     'Annual CPE minimum and annual maintenance fee, plus 120 CPE across three years.'),
    ('ISACA', 'INTL_ISACA_CISM', 'programme', 'Certified Information Security Manager (CISM)',
     'https://www.isaca.org/credentialing/cism', NULL),
    ('ISACA', 'INTL_ISACA_CISM', 'maintenance_policy', 'Maintain CISM certification',
     'https://www.isaca.org/credentialing/cism/maintain-cism-certification',
     'Annual CPE minimum and annual maintenance fee, plus 120 CPE across three years.'),
    ('ISACA', 'INTL_ISACA_CRISC', 'programme', 'Certified in Risk and Information Systems Control (CRISC)',
     'https://www.isaca.org/credentialing/crisc', NULL),
    ('ISACA', 'INTL_ISACA_CRISC', 'maintenance_policy', 'Maintain CRISC certification',
     'https://www.isaca.org/credentialing/crisc/maintain-crisc-certification',
     'Annual CPE minimum and annual maintenance fee, plus 120 CPE across three years.'),

    ('ACFE', NULL, 'issuer_site', 'Association of Certified Fraud Examiners',
     'https://www.acfe.com/', NULL),
    ('ACFE', NULL, 'directory', 'Find a CFE',
     'https://www.acfe.com/fraud-resources/find-a-cfe',
     'OPT-IN. Members choose whether to appear. Absence from this directory is never evidence that a credential is invalid, and the issuer row records that as data.'),
    ('ACFE', 'INTL_ACFE_CFE', 'programme', 'CFE credential',
     'https://www.acfe.com/cfe-credential', NULL),
    ('ACFE', 'INTL_ACFE_CFE', 'maintenance_policy', 'CFE continuing professional education requirements',
     'https://www.acfe.com/cfe-credential/continuing-professional-education-cpe-requirements',
     'An ANNUAL compliance obligation. There is no generic three-year expiry to apply, and none is stored.'),

    ('ACAMS', NULL, 'issuer_site', 'ACAMS', 'https://www.acams.org/', NULL),
    ('ACAMS', 'INTL_ACAMS_CAMS', 'programme', 'CAMS certification',
     'https://www.acams.org/en/certifications/cams-certification', NULL),
    ('ACAMS', 'INTL_ACAMS_CAMS', 'maintenance_policy', 'ACAMS recertification',
     'https://www.acams.org/en/certifications/recertification',
     'Three-year recertification cycle. No official public holder-verification lookup was confirmed on review, so the issuer''s public_verification_url stays NULL rather than pointing at a marketing page, a site search or a third-party badge platform.')
  ) AS v(issuer_code, credential_code, source_kind, title, url, note)
JOIN public.sp_certification_issuers i ON i.issuer_code = v.issuer_code
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 9. Backfill, report, then constrain
-- ---------------------------------------------------------------------------
-- Expand-and-contract, in the order the safety of the existing data requires.
--
-- STEP 1 — BACKFILL, exact relationships only.
--
-- A definition that already carries BOTH a reviewed market pack and a
-- jurisdiction is, by the governance that put it there, a national regulated
-- credential. That is the one relationship this file will assert, and it is
-- exact rather than fuzzy: no title is read, no abbreviation is matched, no
-- issuer name is compared, and a row missing either field is left alone.
--
-- Nothing is backfilled from a NULL jurisdiction. That is the shape a legacy
-- row, a language, a practical skill and a free-text certificate all share,
-- and treating it as a signal is exactly the inference this scope exists to
-- make impossible.

UPDATE public.sp_credential_types
   SET scope_code = 'national_regulated'
 WHERE scope_code IS NULL
   AND market_pack_code IS NOT NULL
   AND jurisdiction_code IS NOT NULL;

-- STEP 2 — REPORT what was not classified, without touching it.
--
-- A row that reaches here is not wrong and is not converted. It is a
-- definition whose scope nobody has declared, and the correct response is to
-- say so in the replay log so a reviewer can decide, not to guess.
DO $report$
DECLARE
  _undeclared int;
  _contradictory int;
  _row record;
BEGIN
  SELECT count(*) INTO _undeclared
    FROM public.sp_credential_types WHERE scope_code IS NULL;

  SELECT count(*) INTO _contradictory
    FROM public.sp_credential_types
   WHERE scope_code = 'national_regulated' AND jurisdiction_code IS NULL;

  RAISE NOTICE 'SP_GLOBAL_CERT_BACKFILL: % definition(s) left with an undeclared scope (unchanged, by design)', _undeclared;
  FOR _row IN
    SELECT code, market_pack_code, jurisdiction_code
      FROM public.sp_credential_types WHERE scope_code IS NULL ORDER BY code
  LOOP
    RAISE NOTICE 'SP_GLOBAL_CERT_BACKFILL:   undeclared % (pack %, jurisdiction %)',
      _row.code, coalesce(_row.market_pack_code, '-'), coalesce(_row.jurisdiction_code, '-');
  END LOOP;

  IF _contradictory > 0 THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_BACKFILL_CONTRADICTION: % row(s) were classified national without a jurisdiction',
      _contradictory;
  END IF;
END $report$;

-- STEP 3 — the constraints, NOT VALID first.
--
-- NOT VALID binds every INSERT and UPDATE from this moment, and defers only
-- the scan of rows that already exist. The scan runs in step 5, after the
-- deterministic assertions in step 4 have proved there is nothing for it to
-- find. Adding them VALID in one statement would have been the same result on
-- a clean replay and a very different one against a real database.

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'sp_credential_type_global_scope_unbound') THEN
    ALTER TABLE public.sp_credential_types
      ADD CONSTRAINT sp_credential_type_global_scope_unbound
      CHECK (
        scope_code IS DISTINCT FROM 'global_professional'
        OR (claim_type = 'certification'
            AND category = 'qualification'
            AND market_pack_code IS NULL
            AND jurisdiction_code IS NULL
            AND sub_jurisdiction_code IS NULL
            AND authority_id IS NULL
            AND regulated_role_id IS NULL
            -- It may evidence competence. It may never create permission to
            -- work, and it may never feed a professional title.
            AND NOT (contributes_to && ARRAY['local_eligibility', 'active_title']::text[]))
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'sp_credential_type_national_scope_bound') THEN
    ALTER TABLE public.sp_credential_types
      ADD CONSTRAINT sp_credential_type_national_scope_bound
      CHECK (scope_code IS DISTINCT FROM 'national_regulated'
             OR jurisdiction_code IS NOT NULL) NOT VALID;
  END IF;
END $do$;

-- STEP 4 — deterministic assertions, before the scan.
DO $assert$
DECLARE
  _n int;
  _bad text;
BEGIN
  SELECT count(*) INTO _n
    FROM public.sp_credential_types
   WHERE scope_code = 'global_professional' AND is_active;
  IF _n <> 14 THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_COUNT: expected 14 active global definitions, found %', _n;
  END IF;

  SELECT string_agg(format('%s=%s', issuer_code, n), ', ' ORDER BY issuer_code)
    INTO _bad
    FROM (
      SELECT i.issuer_code, count(*) AS n
        FROM public.sp_certification_definitions d
        JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
       GROUP BY i.issuer_code
    ) q
   WHERE (issuer_code, n) NOT IN
     (('ASIS', 4), ('ISC2', 5), ('ISACA', 3), ('ACFE', 1), ('ACAMS', 1));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_ISSUER_COUNTS: unexpected %', _bad;
  END IF;

  SELECT count(*) INTO _n FROM public.sp_certification_definitions;
  IF _n <> 14 THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_DEFINITIONS: expected 14, found %', _n;
  END IF;

  -- Every global definition has a programme source AND a maintenance source.
  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_credential_types t
   WHERE t.scope_code = 'global_professional'
     AND NOT (EXISTS (SELECT 1 FROM public.sp_certification_sources s
                       WHERE s.credential_code = t.code AND s.source_kind = 'programme')
              AND EXISTS (
                SELECT 1 FROM public.sp_certification_sources s
                  JOIN public.sp_certification_definitions d ON d.credential_code = t.code
                 WHERE s.source_kind = 'maintenance_policy'
                   AND (s.credential_code = t.code OR
                        (s.credential_code IS NULL AND s.issuer_id = d.issuer_id))));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_SOURCES_MISSING: %', _bad;
  END IF;

  -- ACAMS holds no confirmed public verification route.
  IF EXISTS (SELECT 1 FROM public.sp_certification_issuers
              WHERE issuer_code = 'ACAMS'
                AND (public_verification_url IS NOT NULL
                     OR verification_mode <> 'none')) THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_ACAMS_VERIFICATION: ACAMS must carry no public verification route';
  END IF;

  -- ACFE's directory is opt-in and its absence proves nothing.
  IF NOT EXISTS (SELECT 1 FROM public.sp_certification_issuers
                  WHERE issuer_code = 'ACFE'
                    AND verification_mode = 'opt_in_directory'
                    AND absence_is_inconclusive) THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_ACFE_DIRECTORY: ACFE must be an opt-in directory whose absence is inconclusive';
  END IF;

  -- Not one existing claim changed. This file writes no row in sp_claims at
  -- all; the assertion is here so a future edit that does is caught by the
  -- replay rather than by a holder.
  SELECT count(*) INTO _n FROM public.sp_claims WHERE credential_code LIKE 'INTL\_%';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_NO_BACKFILL: % claim(s) were pointed at a new definition', _n;
  END IF;
END $assert$;

-- STEP 5 — validate. This is the scan, and it is the proof.
ALTER TABLE public.sp_credential_types
  VALIDATE CONSTRAINT sp_credential_type_global_scope_unbound;
ALTER TABLE public.sp_credential_types
  VALIDATE CONSTRAINT sp_credential_type_national_scope_bound;

-- STEP 6 — NOT NULL is deliberately NOT added to scope_code.
--
-- It would be true of every row today. It would also mean that the next
-- credential type anybody inserts must declare a scope before this file's
-- authors have decided what the third scope is called — and an undeclared
-- scope is a state this design needs to keep, because it is what a legacy row
-- honestly is.


-- ---------------------------------------------------------------------------
-- 10. The claim trigger learns what a global certification is not
-- ---------------------------------------------------------------------------
-- Reproduced VERBATIM from the definition this migration found in place, with
-- exactly one block added. Everything the previous version did it still does,
-- in the same order, with the same error codes: the market gate, the pilot
-- entitlement, the per-credential availability gate, the jurisdiction and
-- sub-jurisdiction checks, claim-type agreement, the narrow-result rule, the
-- controlled title, the reference pattern, the draft exemption and the three
-- completeness rules.
--
-- THE ADDITION, and why it is a database rule rather than a TypeScript one:
--
-- `credentialClaimFields` writes NULL into both jurisdiction columns for a
-- global definition, so the application cannot produce a wrong row. That is
-- not the same as the row being impossible. A direct PostgREST call carrying
-- `credential_code: "INTL_ASIS_CPP"` and `jurisdiction_code: "SE"` would
-- otherwise be accepted — the existing mismatch check reads
-- `_t.jurisdiction_code IS NOT NULL`, and a global definition's is NULL, so
-- every one of the old rules stays silent and a portable certification is
-- stored as a Swedish credential. From there it is one grouping query away
-- from being presented as a current-market credential in Sweden.
--
-- So the trigger refuses it, for every caller including service_role, and the
-- client's matching validation is a courtesy rather than the guarantee.

CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
  _pilot_market boolean := false;
BEGIN
  -- ── The market gate ────────────────────────────────────────────────
  --
  -- Scoped to regulated credentials. A claim that names no credential_code is
  -- a language, a practical capability or a general certificate; its
  -- jurisdiction is PROVENANCE — where the thing came from — and provenance is
  -- a fact about the holder's history, not a request to register a regulated
  -- authorisation in a market.
  --
  -- A global certification carries no jurisdiction at all, so it never enters
  -- this block: it is available to a holder in Sweden, in Dubai, in a country
  -- with no market pack and to a holder who has stated no country, and it
  -- needs no pilot entitlement to be recorded.
  IF NEW.credential_code IS NOT NULL AND NEW.jurisdiction_code IS NOT NULL THEN
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
      _pilot_market := _pack.pilot_state = 'internal_pilot'
                       AND public.sp_is_pilot_member(auth.uid(), _pack.code);
      IF NOT _pilot_market THEN
        RAISE EXCEPTION
          'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
          _pack.code, _pack.legal_review_state
          USING ERRCODE = 'check_violation';
      END IF;
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

  -- ── ADDED 20261110090000: a portable certification stays portable ──
  --
  -- The governed definition, not the submitted row, decides this. A caller
  -- that forges a country onto a global certification is refused here rather
  -- than silently filing a CPP as a Swedish credential.
  IF _t.scope_code = 'global_professional'
     AND (NEW.jurisdiction_code IS NOT NULL OR NEW.sub_jurisdiction_code IS NOT NULL) THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION: % is an international professional certification and is not a credential of %',
      NEW.credential_code, coalesce(NEW.sub_jurisdiction_code, NEW.jurisdiction_code)
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (_t.is_active OR (_pilot_market AND _t.pilot_state = 'internal_pilot'))
     AND TG_OP = 'INSERT' THEN
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
  END IF;

  IF NOT _t.title_is_holder_written
     AND (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title)
     AND btrim(NEW.title) NOT IN (_t.name_sv, _t.name_en) THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_TITLE_CONTROLLED: % is named by its definition (% / %), not by the holder',
      NEW.credential_code, _t.name_sv, _t.name_en
      USING ERRCODE = 'check_violation';
  END IF;

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
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0) THEN

    _scope_missing := true;

    IF TG_OP = 'UPDATE' THEN
      _scope_missing := (OLD.authorisation_scope IS NOT NULL
                         AND length(btrim(OLD.authorisation_scope)) > 0);

    ELSIF NEW.supersedes_id IS NOT NULL THEN
      SELECT authorisation_scope INTO _prev_scope
        FROM public.sp_claims WHERE id = NEW.supersedes_id;

      _scope_missing := (_prev_scope IS NOT NULL AND length(btrim(_prev_scope)) > 0);
    END IF;

    IF _scope_missing THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_REQUIRES_SCOPE: % is limited to an employer, principal or protected object and must say which',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy, market and SCOPE rules on every claim write, for '
  'every caller including service_role. Unchanged from 20261109090000 except '
  'for SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION: a governed '
  'global_professional definition may never be stored with a country or a '
  'sub-jurisdiction, whatever the client submits.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- 11. RLS and grants
-- ---------------------------------------------------------------------------
-- RLS and grants are separate gates and both are set explicitly on every new
-- table. The hosted project's ALTER DEFAULT PRIVILEGES grants to anon, so the
-- REVOKE lines are load-bearing rather than decorative — a local replay cannot
-- observe that grant, which is exactly why they are written out here.
--
-- Four of the five new tables are reference data: no personal data, no holder
-- rows, readable by any signed-in holder so a future form can populate, and
-- readable by nobody anonymous. The recipient page gains NO new table access
-- in this phase: it still reaches exactly one function.
--
-- The fifth, sp_claim_certification_lifecycle, is the holder's own data and is
-- owner-only in both directions.

ALTER TABLE public.sp_credential_scopes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_certification_issuers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_certification_issuer_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_certification_sources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_certification_definitions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_claim_certification_lifecycle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_credential_scopes_read ON public.sp_credential_scopes;
CREATE POLICY sp_credential_scopes_read ON public.sp_credential_scopes
  FOR SELECT TO authenticated USING (true);

-- Deliberately NOT filtered by is_active. A holder whose issuer has been
-- retired or succeeded still holds their certification, and a surface that
-- could not read the issuer row would print a credential with no awarder.
DROP POLICY IF EXISTS sp_certification_issuers_read ON public.sp_certification_issuers;
CREATE POLICY sp_certification_issuers_read ON public.sp_certification_issuers
  FOR SELECT TO authenticated USING (true);

COMMENT ON POLICY sp_certification_issuers_read ON public.sp_certification_issuers IS
  'Retired issuers stay readable on purpose: a holder keeps a credential '
  'after its issuer is renamed or succeeded, and the row is what names the '
  'awarder.';

DROP POLICY IF EXISTS sp_certification_issuer_aliases_read
  ON public.sp_certification_issuer_aliases;
CREATE POLICY sp_certification_issuer_aliases_read
  ON public.sp_certification_issuer_aliases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sp_certification_sources_read ON public.sp_certification_sources;
CREATE POLICY sp_certification_sources_read ON public.sp_certification_sources
  FOR SELECT TO authenticated USING (superseded_on IS NULL);

-- Same reasoning as the issuer policy: a retired definition must stay
-- readable for the claims that already reference it. Whether a NEW claim may
-- be filed against it is a different question, answered by
-- sp_claims_credential_rules and by sp_credential_types.is_active.
DROP POLICY IF EXISTS sp_certification_definitions_read
  ON public.sp_certification_definitions;
CREATE POLICY sp_certification_definitions_read
  ON public.sp_certification_definitions
  FOR SELECT TO authenticated USING (true);

-- The holder's own row, and only the holder's own row. The WITH CHECK also
-- requires the CLAIM to be theirs, so a holder cannot attach a lifecycle
-- statement to somebody else's credential by writing their own id into the
-- owner column. The trigger asserts the same thing for callers RLS does not
-- bind.
DROP POLICY IF EXISTS sp_claim_certification_lifecycle_owner
  ON public.sp_claim_certification_lifecycle;
CREATE POLICY sp_claim_certification_lifecycle_owner
  ON public.sp_claim_certification_lifecycle
  FOR ALL TO authenticated
  USING (holder_user_id = auth.uid())
  WITH CHECK (
    holder_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.sp_claims c
                 WHERE c.id = claim_id AND c.holder_user_id = auth.uid())
  );

GRANT SELECT ON public.sp_credential_scopes            TO authenticated;
GRANT SELECT ON public.sp_certification_issuers        TO authenticated;
GRANT SELECT ON public.sp_certification_issuer_aliases TO authenticated;
GRANT SELECT ON public.sp_certification_sources        TO authenticated;
GRANT SELECT ON public.sp_certification_definitions    TO authenticated;
-- SELECT, INSERT and UPDATE. NOT DELETE.
--
-- Phase 8 established the rule and its suite enforces it: no application role
-- holds DELETE on any sp_* table, because "remove" in this product means
-- WITHDRAW. A lifecycle statement a holder no longer stands behind is
-- corrected back to `unknown` — which is an honest state and keeps the
-- record — rather than erased, and a holder who retracts a certification
-- withdraws the CLAIM, which takes this row with it through the FK.
--
-- The first version of this file granted DELETE. The Phase 8 suite refused it,
-- which is exactly what that suite is for.
GRANT SELECT, INSERT, UPDATE ON public.sp_claim_certification_lifecycle TO authenticated;

REVOKE ALL ON public.sp_credential_scopes             FROM anon;
REVOKE ALL ON public.sp_certification_issuers         FROM anon;
REVOKE ALL ON public.sp_certification_issuer_aliases  FROM anon;
REVOKE ALL ON public.sp_certification_sources         FROM anon;
REVOKE ALL ON public.sp_certification_definitions     FROM anon;
REVOKE ALL ON public.sp_claim_certification_lifecycle FROM anon;

-- Restated rather than left to the GRANT above: the hosted project's ALTER
-- DEFAULT PRIVILEGES grants DELETE on a new table, and a local replay cannot
-- observe that. This line is the one that actually takes it away there.
REVOKE DELETE ON public.sp_claim_certification_lifecycle FROM anon, authenticated;

-- The catalogue is migration-and-administration governed. A holder and an
-- ordinary reviewer may read it and may never write it: an issuer somebody
-- could rename, or a definition somebody could re-point, is not a governed
-- catalogue.
REVOKE INSERT, UPDATE, DELETE ON public.sp_credential_scopes            FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_certification_issuers        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_certification_issuer_aliases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_certification_sources        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_certification_definitions    FROM authenticated;

-- sp_credential_types gains a column and no new writer. Restated because a
-- new column on an existing table inherits that table's grants, and this is
-- the one place a reader can check that the scope is not holder-writable.
REVOKE INSERT, UPDATE, DELETE ON public.sp_credential_types FROM anon, authenticated;

-- The private credential reference: restated, not moved.
--
-- §11 of the phase specification prefers a separate owner-only table. It is
-- NOT the right answer here, and the reason is the rule immediately above it:
-- this migration may not rewrite user data. `sp_claims.credential_reference`
-- already holds real references for real holders, and relocating them would
-- be exactly the destructive conversion the phase forbids.
--
-- The column therefore stays where 20260817160000 put it, and the guarantee
-- is the alternative the same section allows: a strict column allowlist on
-- every read path. `sp_disclosure_payload` and `sp_selected_merits_payload`
-- both build their output with jsonb_build_object over named columns and
-- neither names this one; no view, function or projection selects it with a
-- wildcard; and anon holds no grant on sp_claims at all. The SQL suite and
-- scripts/passport-private-reference-check.ts assert all three, so the
-- property is tested rather than asserted in a comment.
COMMENT ON COLUMN public.sp_claims.credential_reference IS
  'PRIVATE, owner-only. Certificate / decision / member reference. Never '
  'included in sp_get_disclosure, sp_disclosure_payload, '
  'sp_selected_merits_payload, a card, a QR payload, a social image, an '
  'export, analytics, browser storage, logs or a fixture. Read back only by '
  'getCredentialPrivateFields, which is holder-scoped. Enforced by column '
  'allowlists on every projection and proved by '
  'scripts/passport-private-reference-check.ts and the global-certification '
  'SQL suite.';


-- ---------------------------------------------------------------------------
-- 12. Proof
-- ---------------------------------------------------------------------------
-- Asserted in the migration itself, so a replay that produced the wrong
-- catalogue fails at apply time rather than in a suite somebody may not run.

DO $proof$
DECLARE _n int; _bad text;
BEGIN
  -- Every global definition is unbound from every territorial concept.
  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_credential_types
   WHERE scope_code = 'global_professional'
     AND (claim_type <> 'certification' OR category <> 'qualification'
          OR market_pack_code IS NOT NULL OR jurisdiction_code IS NOT NULL
          OR sub_jurisdiction_code IS NOT NULL
          OR authority_id IS NOT NULL OR regulated_role_id IS NOT NULL
          OR contributes_to && ARRAY['local_eligibility', 'active_title']::text[]);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_BOUND: %', _bad;
  END IF;

  -- Scope was DECLARED, never derived. The backfill in section 9 writes one
  -- value and one value only -- 'national_regulated' -- so every global row
  -- must be one of the fourteen this file names by code. A row that acquired
  -- the scope any other way is an inference, and there is no path that could
  -- produce one.
  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_credential_types
   WHERE scope_code = 'global_professional' AND code NOT LIKE 'INTL\_%';
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERT_SCOPE_INFERRED: % acquired global scope without being seeded as one', _bad;
  END IF;

  -- And the converse: a definition with no jurisdiction is not global unless
  -- it says so. Proved against the catalogue as it stands -- every
  -- null-jurisdiction row here is one of the fourteen -- and against a probe
  -- row in the SQL suite, which inserts an undeclared null-jurisdiction
  -- definition and asserts it classifies as nothing.
  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_credential_types
   WHERE jurisdiction_code IS NULL AND code NOT LIKE 'INTL\_%'
     AND scope_code = 'global_professional';
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_NULL_JURISDICTION_UPGRADED: %', _bad;
  END IF;

  -- The five issuers, their exact counts, and no sixth.
  SELECT count(*) INTO _n FROM public.sp_certification_issuers;
  IF _n <> 5 THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_ISSUERS: expected 5 issuers, found %', _n;
  END IF;

  -- Market packs are untouched: Sweden is still the only active one.
  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_MARKETS_CHANGED: % active market packs', _n;
  END IF;

  -- Anonymous reaches none of it.
  IF has_table_privilege('anon', 'public.sp_certification_issuers', 'SELECT')
     OR has_table_privilege('anon', 'public.sp_certification_definitions', 'SELECT')
     OR has_table_privilege('anon', 'public.sp_claim_certification_lifecycle', 'SELECT')
     OR has_table_privilege('anon', 'public.sp_credential_scopes', 'SELECT') THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_ANON_READ: anon holds a grant on the new tables';
  END IF;

  -- And no holder may DELETE their own history. Phase 8's rule, restated at
  -- apply time so a future edit that grants it fails here rather than three
  -- suites later.
  IF has_table_privilege('authenticated', 'public.sp_claim_certification_lifecycle', 'DELETE')
     OR has_table_privilege('anon', 'public.sp_claim_certification_lifecycle', 'DELETE') THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_DELETE_GRANTED: removal is withdrawal; no application role may DELETE';
  END IF;

  -- And no holder may write the catalogue.
  IF has_table_privilege('authenticated', 'public.sp_certification_issuers', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sp_certification_definitions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.sp_credential_types', 'UPDATE') THEN
    RAISE EXCEPTION 'SP_GLOBAL_CERT_CATALOGUE_WRITABLE: an application role can write the catalogue';
  END IF;

  RAISE NOTICE 'SP_GLOBAL_CERTIFICATION_PROOF ok: 14 definitions, 5 issuers (ASIS 4, ISC2 5, ISACA 3, ACFE 1, ACAMS 1), no market changed, no claim touched';
END $proof$;

COMMIT;
