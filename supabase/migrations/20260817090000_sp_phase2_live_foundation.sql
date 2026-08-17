-- =============================================================================
-- Security Passport — Phase 2: Live Foundation
--
-- Creates the additive `sp_*` domain for a PRIVATE, authenticated Security
-- Passport: one profile per holder, their experience periods, their
-- self-declared claims, and an append-only event history.
--
-- Scope discipline (owner decision, Phase 2):
--   * NO verification requests, evidence documents, disclosures, share
--     tokens, social artifacts, SCP projections or ledger anchoring. Those
--     belong to Phases 3-5 and each needs its own approval.
--   * Every holder-created claim is SELF_DECLARED and stays that way. There
--     is no code path in this migration that can produce a
--     DOCUMENT_PROVIDED or VERIFIED assertion.
--
-- Boundaries, enforced rather than intended:
--   * No foreign key into any `scp_*` or `cd_*` table (asserted in
--     supabase/tests/security_passport_phase2_test.sql).
--   * Profession is referenced as a CIG slug in TEXT, deliberately without a
--     foreign key: the CIG taxonomy is separately governed and frozen for
--     this phase, and a hard FK would make Passport rows undeletable from a
--     taxonomy correction. Validated on write by the RPCs instead.
--   * `auth.users` and `public.profiles` are reused. Nothing here duplicates
--     identity.
--
-- Every table: RLS enabled, deny-by-default, holder-owned, UUID keys,
-- timestamps, minimal grants.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Reference data
-- -----------------------------------------------------------------------------
-- Jurisdictions are Passport-owned rather than joined to `scp_jurisdictions`.
-- That table has the right shape, but it lives inside the frozen Security
-- Competence Platform domain, and a foreign key into it would be the first
-- crack in the boundary this architecture depends on. Three rows of
-- reference data is a cheap price for a boundary that stays provable.

CREATE TABLE IF NOT EXISTS public.sp_jurisdictions (
  code       text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name_sv    text NOT NULL,
  name_en    text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_jurisdictions IS
  'ISO 3166-1 alpha-2 jurisdictions for Security Passport. Sweden-first, but '
  'jurisdiction is first-class data: a Swedish credential never implies '
  'eligibility elsewhere.';

INSERT INTO public.sp_jurisdictions (code, name_sv, name_en)
VALUES ('SE', 'Sverige', 'Sweden')
ON CONFLICT (code) DO NOTHING;


-- The recognition ladder, versioned. A milestone must always be explainable
-- by the policy that produced it, and policies change.
CREATE TABLE IF NOT EXISTS public.sp_recognition_policies (
  version          text PRIMARY KEY,
  threshold_years  integer[] NOT NULL,
  -- What the thresholds are measured against. 'verified_elapsed' means the
  -- interval union of VERIFIED periods, in elapsed calendar time — never
  -- FTE-converted, never self-reported.
  basis            text NOT NULL CHECK (basis IN ('verified_elapsed')),
  is_active        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_recognition_policies IS
  'Versioned recognition ladder. A branded recognition may only be shown '
  'when the whole qualifying threshold is covered by VERIFIED experience; '
  'mixed evidence yields no recognition. Recognitions are COMPUTED, never '
  'stored — this table records the rule, not results.';

INSERT INTO public.sp_recognition_policies (version, threshold_years, basis, is_active)
VALUES ('v1', ARRAY[1, 3, 5, 10, 15, 20], 'verified_elapsed', true)
ON CONFLICT (version) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. sp_passport_profiles — one private Passport per authenticated human
-- -----------------------------------------------------------------------------
-- Keyed BY the auth user id rather than carrying a surrogate key plus a
-- unique constraint: there is exactly one Passport per human, and making
-- that a primary key means the database cannot hold a second one.

CREATE TABLE IF NOT EXISTS public.sp_passport_profiles (
  holder_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Professional identity
  display_name        text,
  headline            text,
  profession_family   text,
  cig_profession_slug text,
  jurisdiction_code   text NOT NULL DEFAULT 'SE'
                        REFERENCES public.sp_jurisdictions(code),

  -- Privacy. Private by default, always: nothing in Phase 2 publishes.
  privacy_mode text NOT NULL DEFAULT 'full_name'
    CHECK (privacy_mode IN ('full_name', 'initials', 'anonymous')),
  is_private   boolean NOT NULL DEFAULT true,

  -- Progressive onboarding. Held here rather than in its own table: it is
  -- 1:1 with the profile, short-lived, and splitting it would buy nothing
  -- but a join.
  onboarding_state text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_state IN ('not_started', 'in_progress', 'completed')),
  onboarding_step  integer NOT NULL DEFAULT 0 CHECK (onboarding_step >= 0),
  onboarding_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Which authored question set the answers were given against. An answer
  -- means what the question asked at the time; without this, a later edit to
  -- the wording silently rewrites history.
  question_version text NOT NULL DEFAULT 'sp-q-v1',

  -- Truthfulness declaration, recorded rather than assumed.
  declared_accurate_at timestamptz,

  recognition_policy_version text NOT NULL DEFAULT 'v1'
    REFERENCES public.sp_recognition_policies(version),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_profile_completed_has_declaration CHECK (
    onboarding_state <> 'completed' OR declared_accurate_at IS NOT NULL)
);

COMMENT ON TABLE public.sp_passport_profiles IS
  'One private Security Passport per authenticated human. Never duplicates '
  'auth.users or public.profiles: identity is referenced, not copied. '
  'Private by default — Phase 2 has no publication path of any kind.';


-- -----------------------------------------------------------------------------
-- 3. sp_experience_periods
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sp_experience_periods (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  employer_name  text NOT NULL CHECK (length(btrim(employer_name)) > 0),
  -- Optional link to a known employer. NOT a requirement: most Väktare
  -- employers are not on the platform, and demanding a match would make the
  -- holder's own history unrecordable.
  employer_id    uuid REFERENCES public.employers(id) ON DELETE SET NULL,

  role_title          text NOT NULL CHECK (length(btrim(role_title)) > 0),
  profession_family   text,
  cig_profession_slug text,
  jurisdiction_code   text NOT NULL DEFAULT 'SE'
                        REFERENCES public.sp_jurisdictions(code),

  employment_type text NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time', 'hourly', 'temporary')),
  -- Elapsed time and FTE are kept apart on purpose. A 50% Väktare for four
  -- years worked in the profession for four years; converting that silently
  -- would rewrite someone's career.
  fte_fraction numeric(3, 2) NOT NULL DEFAULT 1.00
    CHECK (fte_fraction > 0 AND fte_fraction <= 1),

  security_relevance text NOT NULL DEFAULT 'primary'
    CHECK (security_relevance IN ('primary', 'partial', 'none')),
  security_fraction numeric(3, 2) NOT NULL DEFAULT 1.00
    CHECK (security_fraction >= 0 AND security_fraction <= 1),

  started_on date NOT NULL,
  ended_on   date,

  -- The two independent axes. Phase 2 writes only 'self_declared'; the
  -- other values exist so Phase 3 does not need a destructive migration.
  assertion_level text NOT NULL DEFAULT 'self_declared'
    CHECK (assertion_level IN ('self_declared', 'document_provided', 'verified')),
  lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN
      ('draft', 'active', 'expired', 'revoked', 'superseded', 'disputed', 'withdrawn')),

  -- Correction lineage. A correction supersedes; it never overwrites.
  version_no  integer NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  supersedes_id uuid REFERENCES public.sp_experience_periods(id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_period_dates_ordered CHECK (ended_on IS NULL OR ended_on > started_on),
  CONSTRAINT sp_period_not_self_superseding CHECK (supersedes_id IS DISTINCT FROM id),
  -- A 'partial' period must state its fraction explicitly. The calculation
  -- never guesses one: guessing would fabricate experience.
  CONSTRAINT sp_period_partial_states_fraction CHECK (
    security_relevance <> 'partial' OR (security_fraction > 0 AND security_fraction < 1)),
  CONSTRAINT sp_period_primary_is_whole CHECK (
    security_relevance <> 'primary' OR security_fraction = 1.00)
);

CREATE INDEX IF NOT EXISTS sp_periods_holder_idx
  ON public.sp_experience_periods (holder_user_id, started_on DESC);

COMMENT ON TABLE public.sp_experience_periods IS
  'Holder-owned professional experience. Overlapping periods are counted '
  'once by the interval-union calculation; part-time elapsed time is '
  'reported separately from FTE. Phase 2 rows are always self_declared.';


-- -----------------------------------------------------------------------------
-- 4. sp_claims
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sp_claims (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  claim_type text NOT NULL CHECK (claim_type IN
    ('training', 'certification', 'licence', 'education',
     'professional_membership', 'specialisation')),

  title      text NOT NULL CHECK (length(btrim(title)) > 0),
  -- Claimed issuer, as stated by the holder. Phase 2 cannot confirm it, and
  -- the UI says so; the column name says "claimed" for the same reason.
  claimed_issuer_name text,
  jurisdiction_code   text REFERENCES public.sp_jurisdictions(code),

  issued_on   date,
  valid_from  date,
  valid_until date,

  assertion_level text NOT NULL DEFAULT 'self_declared'
    CHECK (assertion_level IN ('self_declared', 'document_provided', 'verified')),
  lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN
      ('draft', 'active', 'expired', 'revoked', 'superseded', 'disputed', 'withdrawn')),

  -- Reserved for Phase 3+. Never written by Phase 2 code; present so that
  -- adding verification later is additive rather than a rewrite of live rows.
  verified_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         timestamptz,

  version_no    integer NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  supersedes_id uuid REFERENCES public.sp_claims(id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_claim_validity_ordered CHECK (
    valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  CONSTRAINT sp_claim_not_self_superseding CHECK (supersedes_id IS DISTINCT FROM id),

  -- THE SELF-VERIFICATION RULE, at row level.
  --
  -- A holder may never be the verifier of their own claim. Phase 2 creates
  -- no verifications at all, so this can only fire on bad data — which is
  -- precisely when a constraint earns its place, and it means Phase 3
  -- inherits the guarantee rather than having to introduce it.
  CONSTRAINT sp_claim_no_self_verification CHECK (
    verified_by_user_id IS NULL OR verified_by_user_id <> holder_user_id),

  -- A verified claim must name who verified it and when. This is what stops
  -- a stray UPDATE from producing a VERIFIED row with no accountable party.
  CONSTRAINT sp_claim_verified_is_attributed CHECK (
    assertion_level <> 'verified'
    OR (verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS sp_claims_holder_idx
  ON public.sp_claims (holder_user_id, claim_type);

COMMENT ON TABLE public.sp_claims IS
  'Holder-owned claims. Phase 2 creates only self_declared claims. The '
  'holder can never set assertion_level or lifecycle_state: both are pinned '
  'by sp_guard_trust_fields_immutable() for every caller.';


-- -----------------------------------------------------------------------------
-- 5. sp_passport_events — append-only history
-- -----------------------------------------------------------------------------
-- The audit spine. `public.audit_logs` remains the platform-wide actor log;
-- this table is the Passport's own provenance record, keyed to the holder
-- and to the specific row that changed, because "who changed this claim and
-- what did it say before" is a question the platform log cannot answer.

CREATE TABLE IF NOT EXISTS public.sp_passport_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  event_type text NOT NULL CHECK (event_type IN (
    'passport_created', 'onboarding_progressed', 'onboarding_completed',
    'experience_created', 'experience_corrected', 'experience_withdrawn',
    'claim_created', 'claim_corrected', 'claim_withdrawn',
    'privacy_changed', 'declaration_recorded')),

  subject_type text CHECK (subject_type IN ('profile', 'experience', 'claim')),
  subject_id   uuid,

  -- What changed, as stated at the time. Deliberately jsonb rather than a
  -- column per field: the shape of a correction differs by subject, and the
  -- record must survive later schema evolution unchanged.
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,

  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sp_events_holder_idx
  ON public.sp_passport_events (holder_user_id, occurred_at DESC);

COMMENT ON TABLE public.sp_passport_events IS
  'Append-only provenance for one Passport. UPDATE and DELETE are refused '
  'for every caller including service_role, so a correction can add to the '
  'record but never rewrite it.';


-- =============================================================================
-- 6. Guards
-- =============================================================================

-- The trust fields are not the holder's to set.
--
-- RLS WITH CHECK cannot express "unchanged" — it sees only the proposed row —
-- so the pin is a trigger, which applies to every caller including a
-- service-role client and direct SQL. Phase 2 legitimately has no trust
-- transition at all, so this refuses ALL changes to assertion_level and
-- allows lifecycle_state to move only into the holder-initiated states a
-- correction produces. Phase 3 will widen this deliberately, in its own
-- reviewed migration.
CREATE OR REPLACE FUNCTION public.sp_guard_trust_fields_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assertion_level IS DISTINCT FROM OLD.assertion_level THEN
    RAISE EXCEPTION 'SP_TRUST_FIELD_IMMUTABLE: assertion_level cannot be changed (Phase 2 has no verification path)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     AND NEW.lifecycle_state NOT IN ('superseded', 'withdrawn') THEN
    RAISE EXCEPTION 'SP_LIFECYCLE_TRANSITION_NOT_ALLOWED: % -> % is not a Phase 2 transition',
      OLD.lifecycle_state, NEW.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sp_claims_trust_immutable ON public.sp_claims;
CREATE TRIGGER sp_claims_trust_immutable
  BEFORE UPDATE ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.sp_guard_trust_fields_immutable();

DROP TRIGGER IF EXISTS sp_periods_trust_immutable ON public.sp_experience_periods;
CREATE TRIGGER sp_periods_trust_immutable
  BEFORE UPDATE ON public.sp_experience_periods
  FOR EACH ROW EXECUTE FUNCTION public.sp_guard_trust_fields_immutable();


-- History is append-only — but append-only must not mean "this account can
-- never be erased".
--
-- An unconditional refusal here was the first version, and production
-- verification caught what it actually did: auth.users cascades into this
-- table, so deleting a holder's account raised inside the cascade and the
-- whole deletion failed. A holder who created a Passport could never be
-- erased, which is a GDPR problem, not merely an inconvenience.
--
-- During a cascade the parent row is already gone by the time the child
-- delete fires, so the holder's absence from auth.users is a reliable
-- signal that this delete IS the erasure. A direct delete, where the holder
-- still exists, stays refused for every caller including service_role.
CREATE OR REPLACE FUNCTION public.sp_guard_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SP_EVENTS_APPEND_ONLY: passport history cannot be updated'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.holder_user_id) THEN
    RAISE EXCEPTION 'SP_EVENTS_APPEND_ONLY: passport history cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sp_events_append_only ON public.sp_passport_events;
CREATE TRIGGER sp_events_append_only
  BEFORE UPDATE OR DELETE ON public.sp_passport_events
  FOR EACH ROW EXECUTE FUNCTION public.sp_guard_events_append_only();


-- updated_at maintenance, reusing the project's existing helper.
DROP TRIGGER IF EXISTS sp_profiles_set_updated_at ON public.sp_passport_profiles;
CREATE TRIGGER sp_profiles_set_updated_at
  BEFORE UPDATE ON public.sp_passport_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sp_periods_set_updated_at ON public.sp_experience_periods;
CREATE TRIGGER sp_periods_set_updated_at
  BEFORE UPDATE ON public.sp_experience_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sp_claims_set_updated_at ON public.sp_claims;
CREATE TRIGGER sp_claims_set_updated_at
  BEFORE UPDATE ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 7. Row Level Security — deny by default, holder-owned
-- =============================================================================
-- There is no policy anywhere below that grants a non-holder access to
-- another holder's Passport. Not for employers, not for platform admins.
-- Admin oversight of Passport CONTENT is a Phase 3+ decision with its own
-- legal review; silently granting it here because admins can see everything
-- else would be exactly the kind of default nobody chose.

ALTER TABLE public.sp_passport_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_experience_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_claims             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_passport_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_jurisdictions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_recognition_policies ENABLE ROW LEVEL SECURITY;

-- Reference data is readable by signed-in users only. Even the jurisdiction
-- list is not anonymous-readable: Phase 2 has no anonymous surface at all,
-- and opening one "because it is harmless" is how anonymous surfaces appear.
DROP POLICY IF EXISTS sp_jurisdictions_read ON public.sp_jurisdictions;
CREATE POLICY sp_jurisdictions_read ON public.sp_jurisdictions
  FOR SELECT TO authenticated USING (is_active);

DROP POLICY IF EXISTS sp_recognition_policies_read ON public.sp_recognition_policies;
CREATE POLICY sp_recognition_policies_read ON public.sp_recognition_policies
  FOR SELECT TO authenticated USING (true);

-- Profile: the holder, and only the holder.
DROP POLICY IF EXISTS sp_profiles_self_select ON public.sp_passport_profiles;
CREATE POLICY sp_profiles_self_select ON public.sp_passport_profiles
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_profiles_self_insert ON public.sp_passport_profiles;
CREATE POLICY sp_profiles_self_insert ON public.sp_passport_profiles
  FOR INSERT TO authenticated WITH CHECK (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_profiles_self_update ON public.sp_passport_profiles;
CREATE POLICY sp_profiles_self_update ON public.sp_passport_profiles
  FOR UPDATE TO authenticated
  USING (holder_user_id = auth.uid())
  WITH CHECK (holder_user_id = auth.uid() AND is_private = true);

-- Experience: holder-owned. INSERT is additionally pinned to the only
-- assertion level Phase 2 may create, so a hand-rolled client request cannot
-- insert a "verified" row that no verifier ever saw.
DROP POLICY IF EXISTS sp_periods_self_select ON public.sp_experience_periods;
CREATE POLICY sp_periods_self_select ON public.sp_experience_periods
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_periods_self_insert ON public.sp_experience_periods;
CREATE POLICY sp_periods_self_insert ON public.sp_experience_periods
  FOR INSERT TO authenticated
  WITH CHECK (
    holder_user_id = auth.uid()
    AND assertion_level = 'self_declared'
    AND lifecycle_state IN ('draft', 'active'));

DROP POLICY IF EXISTS sp_periods_self_update ON public.sp_experience_periods;
CREATE POLICY sp_periods_self_update ON public.sp_experience_periods
  FOR UPDATE TO authenticated
  USING (holder_user_id = auth.uid())
  WITH CHECK (holder_user_id = auth.uid() AND assertion_level = 'self_declared');

-- No DELETE policy anywhere. A Passport entry is corrected or withdrawn,
-- never erased — account deletion is a separate, staged flow with its own
-- legal gate (see the migration footer).

DROP POLICY IF EXISTS sp_claims_self_select ON public.sp_claims;
CREATE POLICY sp_claims_self_select ON public.sp_claims
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_claims_self_insert ON public.sp_claims;
CREATE POLICY sp_claims_self_insert ON public.sp_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    holder_user_id = auth.uid()
    AND assertion_level = 'self_declared'
    AND lifecycle_state IN ('draft', 'active')
    AND verified_by_user_id IS NULL
    AND verified_at IS NULL);

DROP POLICY IF EXISTS sp_claims_self_update ON public.sp_claims;
CREATE POLICY sp_claims_self_update ON public.sp_claims
  FOR UPDATE TO authenticated
  USING (holder_user_id = auth.uid())
  WITH CHECK (
    holder_user_id = auth.uid()
    AND assertion_level = 'self_declared'
    AND verified_by_user_id IS NULL);

-- Events: the holder may read their own history and append to it. No
-- UPDATE or DELETE policy exists, and the trigger refuses both regardless.
DROP POLICY IF EXISTS sp_events_self_select ON public.sp_passport_events;
CREATE POLICY sp_events_self_select ON public.sp_passport_events
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_events_self_insert ON public.sp_passport_events;
CREATE POLICY sp_events_self_insert ON public.sp_passport_events
  FOR INSERT TO authenticated
  WITH CHECK (holder_user_id = auth.uid() AND actor_user_id = auth.uid());


-- =============================================================================
-- 8. Grants — minimal, and explicitly nothing for anon
-- =============================================================================
-- Supabase grants broadly to anon/authenticated by default. RLS would still
-- return zero rows, but a table-level grant that nobody intended is a poor
-- second line of defence, so it is revoked outright.

REVOKE ALL ON public.sp_passport_profiles    FROM anon;
REVOKE ALL ON public.sp_experience_periods   FROM anon;
REVOKE ALL ON public.sp_claims               FROM anon;
REVOKE ALL ON public.sp_passport_events      FROM anon;
REVOKE ALL ON public.sp_jurisdictions        FROM anon;
REVOKE ALL ON public.sp_recognition_policies FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.sp_passport_profiles  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sp_experience_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sp_claims             TO authenticated;
GRANT SELECT, INSERT         ON public.sp_passport_events    TO authenticated;
GRANT SELECT                 ON public.sp_jurisdictions        TO authenticated;
GRANT SELECT                 ON public.sp_recognition_policies TO authenticated;

-- service_role, stated explicitly rather than inherited.
--
-- Supabase grants service_role broadly through default privileges, so
-- staying silent here would mean the production posture is whatever the
-- platform decided and the local harness's posture is something else — and
-- the difference would only surface the first time server-side code ran
-- against real data. Granting it deliberately also makes the trust-field
-- trigger meaningful: service_role carries BYPASSRLS, so the trigger, not
-- RLS, is what actually stops a server-side shortcut from writing a
-- VERIFIED row. That is asserted in the Phase 2 test suite.
--
-- No DELETE for anyone: Passport entries are corrected or withdrawn.
GRANT SELECT, INSERT, UPDATE ON public.sp_passport_profiles  TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sp_experience_periods TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sp_claims             TO service_role;
GRANT SELECT, INSERT         ON public.sp_passport_events    TO service_role;
GRANT SELECT                 ON public.sp_jurisdictions        TO service_role;
GRANT SELECT                 ON public.sp_recognition_policies TO service_role;


-- =============================================================================
-- 9. Correction RPCs — supersede, never overwrite
-- =============================================================================
-- A correction inserts a new version and marks the prior row superseded, in
-- one transaction, and writes the event. Exposed as SECURITY DEFINER
-- functions with an explicit holder check so the two writes cannot drift
-- apart and so `lifecycle_state = 'superseded'` has exactly one author.

CREATE OR REPLACE FUNCTION public.sp_correct_claim(
  _claim_id uuid,
  _title text,
  _claimed_issuer_name text,
  _jurisdiction_code text,
  _issued_on date,
  _valid_from date,
  _valid_until date,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old public.sp_claims%ROWTYPE;
  _new_id uuid;
BEGIN
  SELECT * INTO _old FROM public.sp_claims WHERE id = _claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  -- The function is SECURITY DEFINER, so RLS does not protect it. The
  -- ownership check has to be explicit, and it is the only thing standing
  -- between this RPC and someone else's Passport.
  IF _old.holder_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _old.lifecycle_state <> 'active' THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_CORRECTABLE: state is %', _old.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.sp_claims (
    holder_user_id, claim_type, title, claimed_issuer_name, jurisdiction_code,
    issued_on, valid_from, valid_until,
    assertion_level, lifecycle_state, version_no, supersedes_id)
  VALUES (
    _old.holder_user_id, _old.claim_type, _title, _claimed_issuer_name,
    _jurisdiction_code, _issued_on, _valid_from, _valid_until,
    -- A correction never upgrades trust. It carries the prior level
    -- forward, which in Phase 2 is always 'self_declared'.
    _old.assertion_level, 'active', _old.version_no + 1, _old.id)
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
      'previous_title', _old.title));

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_correct_claim(uuid, text, text, text, date, date, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_correct_claim(uuid, text, text, text, date, date, date, text) TO authenticated;

COMMENT ON FUNCTION public.sp_correct_claim IS
  'Corrects a claim by supersession: inserts version_no + 1, marks the prior '
  'row superseded and appends an event, atomically. Never changes '
  'assertion_level. Refuses any caller who is not the holder.';


CREATE OR REPLACE FUNCTION public.sp_withdraw_claim(_claim_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _holder uuid;
BEGIN
  SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _holder <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.sp_claims SET lifecycle_state = 'withdrawn' WHERE id = _claim_id;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_holder, auth.uid(), 'claim_withdrawn', 'claim', _claim_id,
          jsonb_build_object('reason', _reason));
END;
$$;

REVOKE ALL ON FUNCTION public.sp_withdraw_claim(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_withdraw_claim(uuid, text) TO authenticated;


-- =============================================================================
-- 10. What this migration deliberately does NOT create
-- =============================================================================
--   * sp_verification_requests / sp_disputes            -> Phase 3
--   * evidence document storage or storage buckets      -> Phase 3 (DPIA gate)
--   * sp_disclosures / share tokens / public read paths -> Phase 4
--   * signed credential, proof or status-list tables    -> Phase 5
--   * any ledger, anchor, wallet or token object        -> not proposed
--   * any SCP projection object                         -> owned by SCP
--
-- Account deletion: `ON DELETE CASCADE` from auth.users removes the profile,
-- periods, claims and events together. That is correct for Phase 2, where
-- every row is the holder's own self-reported statement and no third party
-- has attested to anything. It will NOT be correct once Phase 3 records an
-- employer's confirmation, because that attestation is also the employer's
-- record — the unlink-and-retain design in Product Architecture v1.1 §21.5
-- needs legal validation before verification ships, and it is called out
-- here so the cascade is revisited deliberately rather than inherited.
-- =============================================================================
