-- Security Passport — the catalogue research foundation (SCHEMA).
--
-- Additive, with three RELAXED constraints (named in section 3) and no change
-- to any existing row. This is the SCHEMA release of the certification
-- research integration; the data is 20270213090000 and the publication of
-- the definitions it creates is 20270214090000. Application code that reads
-- anything below ships separately, after this is applied and recorded.
--
-- ══ WHAT THIS ADDS ═══════════════════════════════════════════════════════
--
--   1. four credential classes, so the KIND of an award is stated, not guessed:
--      professional qualification, professional designation, assessed subject
--      certificate and course certificate (a personal certification keeps the
--      class `certification`);
--   2. three subject domains for the existing subject filter: insurance,
--      risk and compliance, resilience and safety;
--   3. three relaxed constraints on sp_certification_definitions: an
--      abbreviation may be NULL (an issuer that publishes none gets none, the
--      catalogue invents none) and up to 24 characters (ICA's own designations
--      are longer than 12), and a maintenance policy may be 'not_assessed';
--   4. sp_certification_definition_aliases: former and alternative names, for
--      SEARCH only, with the same shape as the issuer aliases;
--   5. sp_catalogue_research_records: the staging record of each researched
--      programme, with its source, evidence level, decision, reviewer, date
--      and reason. It is NOT a second catalogue: a definition exists only in
--      sp_credential_types, and this table points at it;
--   6. sp_catalogue_requests: a holder's request that a missing credential be
--      considered. It creates no definition and no claim, and has no write
--      path except the RPCs below;
--   7. five functions: one holder search of what is NOT yet available, one
--      holder request, one holder read of their own requests, and two
--      platform-administrator decisions, each audited.
--
-- ══ THE SEPARATIONS THIS KEEPS ═══════════════════════════════════════════
--
--   research approval   !=  publication of a definition  !=  verification of a holder
--
--   * A research decision is a row here. A definition becomes selectable only
--     through sp_credential_types.is_active, by a reviewed migration.
--   * No row, function or policy here writes sp_claims, assertion_level or any
--     holder trust field. A request or an approved record verifies nobody.
--   * research_scope and jurisdiction_context are research metadata. Nothing
--     here derives a jurisdiction, a market, an access rule or a work
--     permission from them.
--
-- Production schema: nothing here is read by the running application until the
-- application release. Rollback: supabase/rollback/
-- 20270212090000_sp_catalogue_research_foundation_rollback.sql, which refuses
-- once any request exists or any definition uses a new class.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The kinds of award
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_credential_classes (code, name_sv, name_en) VALUES
  ('professional_qualification', 'Professionell kvalifikation',  'Professional qualification'),
  ('professional_designation',   'Professionell beteckning',     'Professional designation'),
  ('assessed_certificate',       'Examinerat ämnesintyg',        'Assessed subject certificate'),
  ('course_certificate',         'Kursintyg',                    'Course certificate')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Subject domains for the existing subject filter
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_credential_definition_reviews
  DROP CONSTRAINT IF EXISTS sp_credential_definition_reviews_professional_domain_check;
ALTER TABLE public.sp_credential_definition_reviews
  ADD CONSTRAINT sp_credential_definition_reviews_professional_domain_check
  CHECK (professional_domain = ANY (ARRAY[
    'security_operations', 'security_management', 'physical_security',
    'information_security', 'investigation', 'financial_crime',
    'insurance', 'risk_compliance', 'resilience_safety']));

-- ---------------------------------------------------------------------------
-- 3. Three RELAXED constraints on sp_certification_definitions
-- ---------------------------------------------------------------------------
-- RELAXED, never tightened: no existing row can become invalid.
--
-- abbreviation: NULL means "the issuer publishes no abbreviation for this
-- award". The catalogue never invents one (the plate legend is a separate,
-- governed column). The bound moves from 12 to 24 because an issuer's own
-- designation such as Adv.Cert(Sanctions) is longer than 12 and truncating a
-- credential's own abbreviation is how a catalogue prints something nobody
-- awarded.
ALTER TABLE public.sp_certification_definitions
  ALTER COLUMN abbreviation DROP NOT NULL;
ALTER TABLE public.sp_certification_definitions
  DROP CONSTRAINT IF EXISTS sp_certification_definitions_abbreviation_check;
ALTER TABLE public.sp_certification_definitions
  ADD CONSTRAINT sp_certification_definitions_abbreviation_check
  CHECK (abbreviation IS NULL OR length(btrim(abbreviation)) BETWEEN 1 AND 24);

-- maintenance_policy_type: 'not_assessed' says the programme's maintenance
-- rules were never reviewed for this entry. It is not 'none_published' ("nothing
-- official was found") and it is never lifetime validity. The cycle-matches-
-- policy constraint is unchanged: a not_assessed policy carries no cycle.
ALTER TABLE public.sp_certification_definitions
  DROP CONSTRAINT IF EXISTS sp_certification_definitions_maintenance_policy_type_check;
ALTER TABLE public.sp_certification_definitions
  ADD CONSTRAINT sp_certification_definitions_maintenance_policy_type_check
  CHECK (maintenance_policy_type = ANY (ARRAY[
    'recertification_cycle', 'cycle_plus_annual_maintenance',
    'annual_compliance', 'none_published', 'not_assessed']));

-- ---------------------------------------------------------------------------
-- 4. Definition aliases (search and reconciliation only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_certification_definition_aliases (
  credential_code text NOT NULL REFERENCES public.sp_credential_types(code),
  alias           text NOT NULL CHECK (length(btrim(alias)) BETWEEN 1 AND 80),
  -- NONE of these is a display name: a definition has one controlled name.
  alias_kind      text NOT NULL CHECK (alias_kind IN ('historical_name', 'search_alias')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (credential_code, alias)
);

COMMENT ON TABLE public.sp_certification_definition_aliases IS
  'Former and alternative names of a definition, for SEARCH and for deterministic '
  'reconciliation only. Never a display name and never a rule that could upgrade '
  'a holder''s claim. An alias is readable only where its definition is.';

ALTER TABLE public.sp_certification_definition_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_certification_definition_aliases FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sp_certification_definition_aliases TO authenticated;
-- Not USING (true): the alias of a definition the caller cannot see is not
-- readable either. The subquery runs as the caller, under sp_credential_types'
-- own read policy.
CREATE POLICY sp_certification_definition_aliases_read
  ON public.sp_certification_definition_aliases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sp_credential_types t
                  WHERE t.code = sp_certification_definition_aliases.credential_code));

-- ---------------------------------------------------------------------------
-- 5. The research records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_catalogue_research_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── As researched. Immutable provenance (sp_catalogue_research_provenance_immutable).
  -- The research id is deterministic for a snapshot. Renaming an award needs an
  -- explicit crosswalk in a LATER snapshot, never an automatic delete and re-insert.
  research_id        text NOT NULL UNIQUE CHECK (research_id ~ '^cred_[0-9a-f]{16}$'),
  snapshot_date      date NOT NULL,
  issuer_research_id text NOT NULL,
  issuer_name        text NOT NULL CHECK (length(btrim(issuer_name)) > 0),
  acronym            text,
  official_name      text NOT NULL CHECK (length(btrim(official_name)) > 0),
  research_area      text NOT NULL CHECK (research_area IN ('cyber', 'insurance', 'physical', 'resilience', 'risk')),
  research_domain    text NOT NULL,
  credential_kind    text NOT NULL CHECK (credential_kind IN
    ('person_certification', 'professional_qualification', 'designation', 'assessed_certificate', 'course_certificate')),
  -- PROVISIONAL research metadata. Not a passport scope code, not an ISO country
  -- array and not an access rule: an award's national origin never prevents a
  -- holder abroad from registering it, and international availability never
  -- confers a permission to work.
  research_scope        text NOT NULL CHECK (research_scope IN ('international', 'regional', 'national')),
  jurisdiction_context  text,
  recommended_priority  text NOT NULL CHECK (recommended_priority IN ('P1', 'P2', 'P3')),
  source_id          text NOT NULL,
  source_url         text NOT NULL CHECK (source_url ~ '^https://'),
  source_title       text,
  source_checked_on  date NOT NULL,
  evidence_level     text NOT NULL CHECK (evidence_level IN ('official_page', 'issuer_badge_page', 'official_search_excerpt')),
  evidence_supported_fields text,
  evidence_note      text,
  -- Narrative only. Unknown is not "non-expiring".
  renewal_note       text,
  limitations        text,
  research_status    text NOT NULL CHECK (research_status IN ('catalogue_review_required', 'source_recheck_required')),
  -- Constants, by CHECK, so no row can be edited into implying a verification
  -- or a legal recognition.
  legal_recognition_status   text NOT NULL DEFAULT 'not_assessed' CHECK (legal_recognition_status = 'not_assessed'),
  holder_verification_policy text NOT NULL DEFAULT 'separate_holder_evidence_required'
    CHECK (holder_verification_policy = 'separate_holder_evidence_required'),

  -- ── The decision.
  catalogue_decision text NOT NULL DEFAULT 'pending'
    CHECK (catalogue_decision IN ('pending', 'approved', 'needs_information', 'excluded')),
  reconciliation_outcome text NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_outcome IN
      ('unreconciled', 'matched_existing', 'added_approved', 'retained_for_review', 'excluded')),
  -- The definition this record IS (matched) or BECAME (added). NULL otherwise.
  credential_code    text REFERENCES public.sp_credential_types(code),
  mapped_credential_class      text REFERENCES public.sp_credential_classes(code),
  mapped_professional_domain   text CHECK (mapped_professional_domain IN (
    'security_operations', 'security_management', 'physical_security',
    'information_security', 'investigation', 'financial_crime',
    'insurance', 'risk_compliance', 'resilience_safety')),
  decision_note      text,
  unresolved_issue   text,
  required_action    text,
  -- Why the holder sees this record as "not available yet": a controlled
  -- vocabulary, so the explanation is the same in Swedish and English and no
  -- internal note is ever shown to a holder.
  holder_reason      text CHECK (holder_reason IN
    ('awaiting_source_check', 'awaiting_name_check', 'awaiting_issuer_check',
     'awaiting_kind_check', 'retired_for_new_candidates', 'not_offered')),
  recheck_checked_on date,
  recheck_note       text,
  reviewer           text,
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_research_decision_matches_outcome CHECK (
       (catalogue_decision = 'pending'           AND reconciliation_outcome = 'unreconciled')
    OR (catalogue_decision = 'approved'          AND reconciliation_outcome IN ('matched_existing', 'added_approved'))
    OR (catalogue_decision = 'needs_information' AND reconciliation_outcome = 'retained_for_review')
    OR (catalogue_decision = 'excluded'          AND reconciliation_outcome = 'excluded')),

  -- A record that names a definition is matched or added, and only then.
  CONSTRAINT sp_research_code_iff_definition CHECK (
    (reconciliation_outcome IN ('matched_existing', 'added_approved')) = (credential_code IS NOT NULL)),

  CONSTRAINT sp_research_added_has_mapping CHECK (
    reconciliation_outcome <> 'added_approved'
    OR (mapped_credential_class IS NOT NULL AND mapped_professional_domain IS NOT NULL)),

  -- Nothing is retained without saying what is unresolved, what to do about
  -- it, and what the holder is told.
  CONSTRAINT sp_research_retained_is_actionable CHECK (
    reconciliation_outcome <> 'retained_for_review'
    OR (length(btrim(coalesce(unresolved_issue, ''))) > 0
        AND length(btrim(coalesce(required_action, ''))) > 0
        AND holder_reason IS NOT NULL AND holder_reason <> 'not_offered')),

  CONSTRAINT sp_research_excluded_has_reason CHECK (
    reconciliation_outcome <> 'excluded'
    OR (length(btrim(coalesce(decision_note, ''))) > 0 AND holder_reason = 'not_offered')),

  -- A decision without a reviewer, a date and a reason is not a decision.
  CONSTRAINT sp_research_decision_has_provenance CHECK (
    catalogue_decision = 'pending'
    OR (reviewer IS NOT NULL AND reviewed_at IS NOT NULL
        AND length(btrim(coalesce(decision_note, ''))) > 0))
);

COMMENT ON TABLE public.sp_catalogue_research_records IS
  'One researched programme and the decision made about it: matched to an '
  'existing definition, added as an approved definition, retained for review '
  'with a specific unresolved issue, or excluded with a reason. NOT a catalogue: '
  'a definition exists only in sp_credential_types. Research approval is '
  'separate from publishing a definition (sp_credential_types.is_active) and '
  'from verifying any holder. Administrator-read only.';

CREATE INDEX IF NOT EXISTS sp_research_records_decision_idx
  ON public.sp_catalogue_research_records (catalogue_decision, recommended_priority);
CREATE INDEX IF NOT EXISTS sp_research_records_code_idx
  ON public.sp_catalogue_research_records (credential_code) WHERE credential_code IS NOT NULL;

-- The provenance of what was researched never changes: a correction is a new
-- snapshot with an explicit crosswalk, not an edit. Holds for every caller.
CREATE OR REPLACE FUNCTION public.sp_catalogue_research_provenance_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF (NEW.research_id, NEW.snapshot_date, NEW.issuer_research_id, NEW.issuer_name, NEW.acronym,
      NEW.official_name, NEW.research_area, NEW.research_domain, NEW.credential_kind,
      NEW.research_scope, NEW.jurisdiction_context, NEW.recommended_priority, NEW.source_id,
      NEW.source_url, NEW.source_title, NEW.source_checked_on, NEW.evidence_level,
      NEW.evidence_supported_fields, NEW.evidence_note, NEW.renewal_note, NEW.limitations,
      NEW.research_status)
     IS DISTINCT FROM
     (OLD.research_id, OLD.snapshot_date, OLD.issuer_research_id, OLD.issuer_name, OLD.acronym,
      OLD.official_name, OLD.research_area, OLD.research_domain, OLD.credential_kind,
      OLD.research_scope, OLD.jurisdiction_context, OLD.recommended_priority, OLD.source_id,
      OLD.source_url, OLD.source_title, OLD.source_checked_on, OLD.evidence_level,
      OLD.evidence_supported_fields, OLD.evidence_note, OLD.renewal_note, OLD.limitations,
      OLD.research_status) THEN
    RAISE EXCEPTION 'SP_RESEARCH_PROVENANCE_IMMUTABLE: the researched facts of % cannot be edited; add a new snapshot with a crosswalk',
      OLD.research_id USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.sp_catalogue_research_provenance_immutable() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS sp_catalogue_research_provenance_immutable_trg ON public.sp_catalogue_research_records;
CREATE TRIGGER sp_catalogue_research_provenance_immutable_trg
  BEFORE UPDATE ON public.sp_catalogue_research_records
  FOR EACH ROW EXECUTE FUNCTION public.sp_catalogue_research_provenance_immutable();

ALTER TABLE public.sp_catalogue_research_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_catalogue_research_records FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sp_catalogue_research_records TO authenticated;
-- Administrators only. A holder reaches the NOT-YET-AVAILABLE subset through
-- sp_catalogue_unavailable_matches, which returns four fixed columns.
CREATE POLICY sp_catalogue_research_records_admin_read
  ON public.sp_catalogue_research_records FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. Holder requests for a missing credential
-- ---------------------------------------------------------------------------
-- A REQUEST, not a definition and not a claim. It has no reference to
-- sp_claims and no column that any definition, issuer or trust state is read
-- from. The only writers are the three functions below.
CREATE TABLE IF NOT EXISTS public.sp_catalogue_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_name         text NOT NULL CHECK (length(btrim(requested_name)) BETWEEN 3 AND 160),
  requested_issuer       text NOT NULL CHECK (length(btrim(requested_issuer)) BETWEEN 2 AND 160),
  requested_abbreviation text CHECK (requested_abbreviation IS NULL OR length(btrim(requested_abbreviation)) BETWEEN 1 AND 24),
  source_url             text CHECK (source_url IS NULL OR (source_url ~ '^https://' AND length(source_url) <= 500)),
  note                   text CHECK (note IS NULL OR length(note) <= 600),
  -- The research record the holder was looking at, where they came from one.
  research_record_id     uuid REFERENCES public.sp_catalogue_research_records(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered_existing', 'in_research', 'declined')),
  -- Shown to the HOLDER. Never an internal note.
  resolution_note        text CHECK (resolution_note IS NULL OR length(resolution_note) <= 300),
  answered_credential_code text REFERENCES public.sp_credential_types(code),
  resolved_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at            timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_catalogue_request_resolution_is_complete CHECK (
    (status = 'open' AND resolved_at IS NULL AND answered_credential_code IS NULL)
    OR (status = 'answered_existing' AND resolved_at IS NOT NULL AND answered_credential_code IS NOT NULL)
    OR (status = 'in_research'       AND resolved_at IS NOT NULL AND research_record_id IS NOT NULL)
    OR (status = 'declined'          AND resolved_at IS NOT NULL
        AND length(btrim(coalesce(resolution_note, ''))) > 0))
);

COMMENT ON TABLE public.sp_catalogue_requests IS
  'A holder''s request that a missing certification be considered for the '
  'catalogue. It creates no definition, no claim and no verification, and '
  'changes no availability. Administrator-read; holders read their own rows '
  'through sp_list_my_catalogue_requests.';

CREATE INDEX IF NOT EXISTS sp_catalogue_requests_holder_idx
  ON public.sp_catalogue_requests (holder_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sp_catalogue_requests_status_idx
  ON public.sp_catalogue_requests (status, created_at DESC);
-- One open request per holder, name and issuer: a double submit is refused by
-- the database, not only by the form.
CREATE UNIQUE INDEX IF NOT EXISTS sp_catalogue_requests_one_open
  ON public.sp_catalogue_requests (holder_user_id, lower(btrim(requested_name)), lower(btrim(requested_issuer)))
  WHERE status = 'open';

ALTER TABLE public.sp_catalogue_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_catalogue_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sp_catalogue_requests TO authenticated;
CREATE POLICY sp_catalogue_requests_admin_read
  ON public.sp_catalogue_requests FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. Functions
-- ---------------------------------------------------------------------------

-- 7a. A holder searches what is NOT available yet, so "I cannot find it" is
-- answered with a reason. Four fixed columns; no note, reviewer or URL.
CREATE OR REPLACE FUNCTION public.sp_catalogue_unavailable_matches(_search text, _limit integer DEFAULT 8)
RETURNS TABLE (research_id text, official_name text, acronym text, issuer_name text, holder_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  _term text := lower(btrim(coalesce(_search, '')));
  _tokens text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(_term) < 2 OR length(_term) > 120 THEN RETURN; END IF;
  -- Letters and digits only, every other character a space: "CIPP/E" and
  -- "cipp e" are the same words. A term is text, never a pattern.
  _tokens := regexp_split_to_array(btrim(regexp_replace(_term, '[^a-z0-9]+', ' ', 'g')), ' ');
  IF array_length(_tokens, 1) IS NULL OR _tokens = ARRAY['']::text[] THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.research_id, r.official_name, r.acronym, r.issuer_name, r.holder_reason
    FROM public.sp_catalogue_research_records r
   WHERE r.reconciliation_outcome IN ('retained_for_review', 'excluded')
     AND r.credential_code IS NULL
     -- Each word of the search must START a word of the record, so "cpp" does
     -- not find "IFCPP".
     AND NOT EXISTS (
       SELECT 1 FROM unnest(_tokens) AS tok
        WHERE strpos(' ' || btrim(regexp_replace(lower(r.official_name || ' ' || coalesce(r.acronym, '') || ' ' || r.issuer_name),
                                                  '[^a-z0-9]+', ' ', 'g')) || ' ', ' ' || tok) = 0)
   ORDER BY (lower(coalesce(r.acronym, '')) = _term) DESC, r.recommended_priority, r.official_name
   LIMIT least(greatest(coalesce(_limit, 8), 1), 20);
END $fn$;

-- 7b. A holder asks for a missing credential to be considered.
CREATE OR REPLACE FUNCTION public.sp_request_catalogue_definition(_input jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _name text; _issuer text; _abbr text; _url text; _note text;
  _record uuid; _research text; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_input) IS DISTINCT FROM 'object' OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(_input) k
        WHERE k <> ALL (ARRAY['requested_name', 'requested_issuer', 'requested_abbreviation', 'source_url', 'note', 'research_id'])) THEN
    RAISE EXCEPTION 'SP_INVALID_CATALOGUE_REQUEST: unknown or malformed input' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _uid) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE = 'check_violation';
  END IF;

  _name   := btrim(coalesce(_input->>'requested_name', ''));
  _issuer := btrim(coalesce(_input->>'requested_issuer', ''));
  _abbr   := nullif(btrim(coalesce(_input->>'requested_abbreviation', '')), '');
  _url    := nullif(btrim(coalesce(_input->>'source_url', '')), '');
  _note   := nullif(btrim(coalesce(_input->>'note', '')), '');
  _research := nullif(btrim(coalesce(_input->>'research_id', '')), '');

  IF length(_name) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'SP_REQUEST_NAME_INVALID: the certification name must be 3 to 160 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF length(_issuer) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'SP_REQUEST_ISSUER_INVALID: the issuing organisation must be 2 to 160 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF _abbr IS NOT NULL AND length(_abbr) > 24 THEN
    RAISE EXCEPTION 'SP_REQUEST_ABBREVIATION_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  IF _url IS NOT NULL AND (_url !~ '^https://[^\s]+$' OR length(_url) > 500) THEN
    RAISE EXCEPTION 'SP_REQUEST_URL_INVALID: a source link must start with https://' USING ERRCODE = 'check_violation';
  END IF;
  IF _note IS NOT NULL AND length(_note) > 600 THEN
    RAISE EXCEPTION 'SP_REQUEST_NOTE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF _research IS NOT NULL THEN
    SELECT r.id INTO _record FROM public.sp_catalogue_research_records r
     WHERE r.research_id = _research AND r.credential_code IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_REQUEST_UNKNOWN_RECORD' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A small, fixed allowance of open requests per holder. The count and the
  -- INSERT are one step per holder: without the lock, two concurrent requests
  -- with different names both count nine and both insert. The same key is
  -- taken by an administrator reopening a request (sp_admin_resolve_catalogue_
  -- request), so a reopen cannot slip past the allowance either. The lock is
  -- transaction-scoped and is released however this call ends. Two sessions
  -- prove it in supabase/tests/security_passport_catalogue_request_race_test.sql.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('sp_catalogue_request_quota:' || _uid::text, 0));
  IF (SELECT count(*) FROM public.sp_catalogue_requests
       WHERE holder_user_id = _uid AND status = 'open') >= 10 THEN
    RAISE EXCEPTION 'SP_REQUEST_LIMIT: you already have ten open requests' USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    INSERT INTO public.sp_catalogue_requests
      (holder_user_id, requested_name, requested_issuer, requested_abbreviation, source_url, note, research_record_id)
    VALUES (_uid, _name, _issuer, _abbr, _url, _note, _record)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SP_REQUEST_DUPLICATE: you already have an open request for this certification' USING ERRCODE = 'check_violation';
  END;
  RETURN _id;
END $fn$;

-- 7c. A holder reads their own requests: fixed columns, no administrator identity.
CREATE OR REPLACE FUNCTION public.sp_list_my_catalogue_requests()
RETURNS TABLE (id uuid, requested_name text, requested_issuer text, requested_abbreviation text,
               status text, resolution_note text, created_at timestamptz, resolved_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT q.id, q.requested_name, q.requested_issuer, q.requested_abbreviation,
         q.status, q.resolution_note, q.created_at, q.resolved_at
    FROM public.sp_catalogue_requests q
   WHERE q.holder_user_id = auth.uid()
   ORDER BY q.created_at DESC
   LIMIT 50;
END $fn$;

-- 7d. A platform administrator resolves a request. Links existing rows only:
-- it can never create a definition, publish one or touch a claim.
CREATE OR REPLACE FUNCTION public.sp_admin_resolve_catalogue_request(
  _request_id uuid, _status text, _note text DEFAULT NULL,
  _credential_code text DEFAULT NULL, _research_record_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  _caller uuid := auth.uid();
  _q public.sp_catalogue_requests%ROWTYPE;
  _holder uuid;
  _clean text := nullif(btrim(coalesce(_note, '')), '');
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'SP_CATALOGUE_ADMIN_REQUIRED: only a platform administrator may resolve a catalogue request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _status IS NULL OR _status NOT IN ('open', 'answered_existing', 'in_research', 'declined') THEN
    RAISE EXCEPTION 'SP_REQUEST_STATUS_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  IF _clean IS NOT NULL AND length(_clean) > 300 THEN
    RAISE EXCEPTION 'SP_REQUEST_NOTE_INVALID: the note shown to the holder is at most 300 characters' USING ERRCODE = 'check_violation';
  END IF;

  -- Reopening counts against the holder's allowance, under the same per-holder
  -- key sp_request_catalogue_definition takes. The key is taken BEFORE the row
  -- lock, in the same order as the holder path (key, then rows), so the two
  -- cannot deadlock. The holder of a request never changes, so reading it
  -- unlocked to name the key is safe.
  IF _status = 'open' THEN
    SELECT q.holder_user_id INTO _holder FROM public.sp_catalogue_requests q WHERE q.id = _request_id;
    IF FOUND THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('sp_catalogue_request_quota:' || _holder::text, 0));
    END IF;
  END IF;

  SELECT * INTO _q FROM public.sp_catalogue_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE = 'no_data_found'; END IF;

  IF _status = 'open' AND _q.status <> 'open' AND (SELECT count(*) FROM public.sp_catalogue_requests
       WHERE holder_user_id = _q.holder_user_id AND status = 'open') >= 10 THEN
    RAISE EXCEPTION 'SP_REQUEST_LIMIT: the holder already has ten open requests' USING ERRCODE = 'check_violation';
  END IF;

  IF _status = 'answered_existing' THEN
    IF _credential_code IS NULL OR NOT EXISTS (SELECT 1 FROM public.sp_credential_types WHERE code = _credential_code) THEN
      RAISE EXCEPTION 'SP_REQUEST_DEFINITION_REQUIRED: name an existing definition' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _status = 'in_research' THEN
    IF _research_record_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.sp_catalogue_research_records WHERE id = _research_record_id) THEN
      RAISE EXCEPTION 'SP_REQUEST_RECORD_REQUIRED: name a research record' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _status = 'declined' AND _clean IS NULL THEN
    RAISE EXCEPTION 'SP_REQUEST_REASON_REQUIRED: say why, in a note the holder can read' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.sp_catalogue_requests SET
    status = _status,
    resolution_note = CASE WHEN _status = 'open' THEN NULL ELSE _clean END,
    answered_credential_code = CASE WHEN _status = 'answered_existing' THEN _credential_code ELSE NULL END,
    research_record_id = CASE WHEN _status = 'in_research' THEN _research_record_id ELSE research_record_id END,
    resolved_by_user_id = CASE WHEN _status = 'open' THEN NULL ELSE _caller END,
    resolved_at = CASE WHEN _status = 'open' THEN NULL ELSE now() END
  WHERE id = _request_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'platform_admin', 'catalogue_request_resolved', 'sp_catalogue_request', _request_id::text,
          jsonb_build_object('previous_status', _q.status, 'status', _status,
                             'credential_code', _credential_code, 'research_record_id', _research_record_id));
END $fn$;

-- 7e. A platform administrator records a RESEARCH decision. It can move a record
-- between pending, needs_information and excluded. It can never approve one,
-- publish a definition, or touch a record that already names a definition:
-- approval and publication are reviewed migrations.
CREATE OR REPLACE FUNCTION public.sp_admin_review_research_record(
  _record_id uuid, _decision text, _note text,
  _unresolved_issue text DEFAULT NULL, _required_action text DEFAULT NULL, _holder_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  _caller uuid := auth.uid();
  _r public.sp_catalogue_research_records%ROWTYPE;
  _n text := nullif(btrim(coalesce(_note, '')), '');
  _issue text := nullif(btrim(coalesce(_unresolved_issue, '')), '');
  _action text := nullif(btrim(coalesce(_required_action, '')), '');
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'SP_CATALOGUE_ADMIN_REQUIRED: only a platform administrator may record a research decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _decision IS NULL OR _decision NOT IN ('pending', 'needs_information', 'excluded') THEN
    RAISE EXCEPTION 'SP_RESEARCH_DECISION_INVALID: approval and publication are reviewed catalogue migrations, not an in-app decision'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _n IS NULL OR length(_n) > 2000 THEN
    RAISE EXCEPTION 'SP_RESEARCH_REASON_REQUIRED: a decision needs a reason of at most 2000 characters' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.sp_catalogue_research_records WHERE id = _record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_RESEARCH_RECORD_NOT_FOUND' USING ERRCODE = 'no_data_found'; END IF;
  IF _r.credential_code IS NOT NULL THEN
    RAISE EXCEPTION 'SP_RESEARCH_RECORD_IS_PUBLISHED: % already names definition %; withdrawing or changing a definition is a reviewed migration',
      _r.research_id, _r.credential_code USING ERRCODE = 'check_violation';
  END IF;

  IF _decision = 'needs_information' THEN
    IF _issue IS NULL OR _action IS NULL OR _holder_reason IS NULL OR _holder_reason = 'not_offered' THEN
      RAISE EXCEPTION 'SP_RESEARCH_ISSUE_REQUIRED: retaining a record needs the unresolved issue, the action and the reason shown to the holder'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.sp_catalogue_research_records SET
    catalogue_decision = _decision,
    reconciliation_outcome = CASE _decision WHEN 'pending' THEN 'unreconciled'
                                            WHEN 'needs_information' THEN 'retained_for_review' ELSE 'excluded' END,
    decision_note = _n,
    unresolved_issue = CASE WHEN _decision = 'needs_information' THEN _issue ELSE NULL END,
    required_action  = CASE WHEN _decision = 'needs_information' THEN _action ELSE NULL END,
    holder_reason    = CASE _decision WHEN 'needs_information' THEN _holder_reason
                                      WHEN 'excluded' THEN 'not_offered' ELSE NULL END,
    reviewer = 'platform_admin',
    reviewed_by_user_id = _caller,
    reviewed_at = now()
  WHERE id = _record_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'platform_admin', 'catalogue_research_decided', 'sp_catalogue_research_record', _record_id::text,
          jsonb_build_object('research_id', _r.research_id, 'previous_decision', _r.catalogue_decision,
                             'decision', _decision, 'reason', _n));
END $fn$;

-- Grants. The hosted default privileges give anon EXECUTE on a new function,
-- so every one is revoked from PUBLIC and anon explicitly.
REVOKE ALL ON FUNCTION public.sp_catalogue_unavailable_matches(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_catalogue_unavailable_matches(text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.sp_request_catalogue_definition(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_request_catalogue_definition(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.sp_list_my_catalogue_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_list_my_catalogue_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.sp_admin_resolve_catalogue_request(uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_admin_resolve_catalogue_request(uuid, text, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.sp_admin_review_research_record(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_admin_review_research_record(uuid, text, text, text, text, text) TO authenticated;

COMMIT;
