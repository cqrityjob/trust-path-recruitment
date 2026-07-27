-- =============================================================================
-- PR-A / SCP-A1 -- Security Competency Platform: domain model foundation.
--
-- Implements chapter 13.1 ("Datamodell, versionering och lineage") of
-- "CQrityjob Security Competency Core Specification v2.0" as an entirely
-- ADDITIVE schema. No existing table is altered, no existing column is
-- renamed or dropped, no existing RLS policy or grant is modified, no
-- existing row's data changes.
--
-- ---------------------------------------------------------------------------
-- Why a NEW `scp_` schema family rather than extending the H4.1 Blueprint
-- Engine (documented decision, not an oversight)
-- ---------------------------------------------------------------------------
-- The Blueprint Engine (20260720180000_h4_1_...) already provides versioned
-- questions/modules/blueprints with draft->published->archived transitions
-- and content-event auditing, and its CONVENTIONS are deliberately reused
-- below. It is NOT extended for this product, for three reasons that the
-- specification makes decisive:
--
--   1. Its competency layer is `cig_competencies` -- the Career Intelligence
--      Graph taxonomy, i.e. Career Guidance lineage. Specification chapter
--      13.2 and the implementation directive both forbid reusing Career
--      Guidance constructs as Security Competency constructs. SCC-01..SCC-12
--      must be their own stable, independently versioned catalogue.
--   2. Its composition model is Purpose x Role x Environment x Level
--      (blueprints), not the specification's Core version + Profession Module
--      version bundle with separately stored scores (chapter 2, 8.1).
--   3. It has no item_format, per-option scoring key with rationale, language
--      ADAPTATION objects (chapter 7.1: "separata, länkade itemversioner" --
--      not two text columns on one row), validation_status, content_hash,
--      SME/bias/legal review evidence, or two-person publication principle.
--
-- The Blueprint Engine is therefore left completely untouched and remains
-- parked exactly as it is. See docs/assessment/implementation/gap-analysis.md.
--
-- ---------------------------------------------------------------------------
-- Naming
-- ---------------------------------------------------------------------------
-- `scp_` = Security Competency Platform, matching this repository's existing
-- `cig_` prefix convention. The specification's chapter 13.1 uses generic
-- names (`competencies`, `assessment_definitions`, `assessment_versions`,
-- ...); three of those collide with live tables (`assessments`,
-- `assessment_versions`, `assessment_assignments`) that belong to the legacy
-- catalogue. The prefix resolves the collision without weakening the model --
-- the spec-name -> table-name mapping is recorded in
-- docs/assessment/security-competency-platform-overview.md.
--
-- Rollback: DROP every object created below in reverse dependency order
-- (docs/assessment/implementation/migration-and-rollback.md). Nothing
-- pre-existing is altered, so rollback cannot lose pre-existing data.
-- =============================================================================


-- #############################################################################
-- SECTION 1 -- Governance roles (separation of duties)
--
-- The specification (chapter 13.3) requires four distinct assessment-content
-- roles: editor, reviewer, publisher, plus platform admin. This repository's
-- `public.app_role` enum has `assessment_editor` but no reviewer/publisher.
--
-- These are added as a dedicated table rather than via ALTER TYPE ... ADD
-- VALUE deliberately: adding an enum value inside a migration transaction
-- cannot then be used in that same transaction, and mutating a live enum used
-- by existing RLS policies is not a backwards-compatible change. A separate
-- grant table is fully additive and leaves `app_role` untouched.
-- #############################################################################

CREATE TABLE public.scp_content_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor', 'reviewer', 'publisher')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

COMMENT ON TABLE public.scp_content_roles IS
  'Security Competency Platform content-governance roles (spec 13.3). Separate '
  'from public.app_role so the live enum is never mutated. editor: create/edit '
  'drafts. reviewer: approve content. publisher: publish once the two-person '
  'principle is satisfied. A user may hold more than one role, but '
  'scp_publish_assessment_version() still requires two DISTINCT humans.';

CREATE INDEX scp_content_roles_user_idx ON public.scp_content_roles (user_id);

GRANT SELECT ON public.scp_content_roles TO authenticated;
GRANT ALL ON public.scp_content_roles TO service_role;
ALTER TABLE public.scp_content_roles ENABLE ROW LEVEL SECURITY;

-- A user may see their own grants; platform admins see all. Only platform
-- admins may grant/revoke (write path is admin-only, never self-service).
CREATE POLICY scp_content_roles_self_select ON public.scp_content_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY scp_content_roles_admin_write ON public.scp_content_roles
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));


CREATE OR REPLACE FUNCTION public.scp_has_content_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scp_content_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
REVOKE ALL ON FUNCTION public.scp_has_content_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_has_content_role(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.scp_has_content_role(uuid, text) IS
  'SECURITY DEFINER role check for Security Competency content governance. '
  'Same shape and purpose as public.has_role() for app_role.';


-- Convenience predicate: may this caller author/modify DRAFT content at all?
CREATE OR REPLACE FUNCTION public.scp_can_author(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
      OR public.scp_has_content_role(_user_id, 'editor')
      OR public.scp_has_content_role(_user_id, 'reviewer')
      OR public.scp_has_content_role(_user_id, 'publisher');
$$;
REVOKE ALL ON FUNCTION public.scp_can_author(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_can_author(uuid) TO authenticated;


-- #############################################################################
-- SECTION 2 -- Assessment families (spec 13.1 `assessment_families`)
--
-- The product-separation boundary. `slug` and `product_type` are immutable
-- after insert (trigger in SECTION 12) so a family can never be silently
-- re-pointed at a different product -- this is the structural guarantee that
-- Career Guidance and Security Competency stay separate products.
-- #############################################################################

CREATE TABLE public.scp_assessment_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  product_type text NOT NULL
    CHECK (product_type IN ('career_guidance', 'security_competency_core', 'profession_module')),
  description_sv text,
  description_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_assessment_families IS
  'Spec 13.1 assessment_families. Immutable slug + product_type (spec: "Ja för '
  'slug och produkttyp"). The career-guidance row is a REFERENCE marker only -- '
  'it is deliberately never linked to any scp_assessment_definition, and exists '
  'so the separation is explicit in data rather than merely by omission.';


-- #############################################################################
-- SECTION 3 -- Competency catalogue: SCC-01..SCC-12 and their facets
--
-- Spec 13.1 requires stable competency identifiers stored SEPARATELY from
-- versioned definitions, so `scp_competencies` holds only the stable identity
-- (code + display order) and `scp_competency_versions` holds the versioned
-- normative text.
-- #############################################################################

CREATE TABLE public.scp_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_competencies IS
  'Stable identity for the twelve Security Competency Core constructs '
  '(SCC-01..SCC-12). Deliberately carries NO text -- all normative wording '
  'lives in scp_competency_versions so definitions can be revised without '
  'breaking any item, form or historical score that references the construct.';

CREATE TABLE public.scp_competency_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_id uuid NOT NULL REFERENCES public.scp_competencies(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft', 'published', 'retired')),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  definition_sv text NOT NULL,
  definition_en text NOT NULL,
  -- Spec chapter 6 subsections, kept as structured arrays so report and
  -- authoring surfaces read the same normative source.
  strong_indicators_sv text[] NOT NULL DEFAULT '{}',
  risk_indicators_sv text[] NOT NULL DEFAULT '{}',
  development_indicators_sv text[] NOT NULL DEFAULT '{}',
  does_not_measure_sv text[] NOT NULL DEFAULT '{}',
  interpretation_rule_sv text,
  interpretation_rule_en text,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competency_id, version_number)
);

CREATE INDEX scp_competency_versions_competency_idx
  ON public.scp_competency_versions (competency_id, version_number DESC);

CREATE TABLE public.scp_competency_facets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_id uuid NOT NULL REFERENCES public.scp_competencies(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  definition_sv text NOT NULL,
  definition_en text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competency_id, slug)
);

COMMENT ON TABLE public.scp_competency_facets IS
  'Spec 5.1: facets exist for CONTENT COVERAGE and item design only. They must '
  'not be reported as separate psychometric scales until each facet has enough '
  'well-functioning items and its own validity evidence (prevents false precision).';


-- #############################################################################
-- SECTION 4 -- Professions (spec 13.1 `professions`)
--
-- Explicitly market-scoped. Swedish legally defined roles (ordningsvakt,
-- skyddsvakt) must never be presented as internationally applicable
-- (implementation directive section 7).
-- #############################################################################

CREATE TABLE public.scp_professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  market text NOT NULL,
  legally_regulated boolean NOT NULL DEFAULT false,
  regulator_note_sv text,
  description_sv text,
  description_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.scp_professions.market IS
  'ISO 3166-1 alpha-2 market this profession definition applies to (e.g. SE). '
  'A future country is a SEPARATE profession/market adaptation with its own '
  'lineage and validation -- never an implicit reuse of the Swedish role.';
COMMENT ON COLUMN public.scp_professions.legally_regulated IS
  'True for roles whose mandate/powers are defined in law (ordningsvakt, '
  'skyddsvakt). Drives the mandatory legal-review gate on item versions.';


-- #############################################################################
-- SECTION 5 -- Assessment definitions and versions (spec 13.1)
--
-- A definition is the logical assessment type (Core, or one profession
-- module). A version is a publishable, immutable content snapshot carrying
-- both a content lifecycle (`content_status`) and the specification's
-- product-facing `validation_status` (chapter 9.3 / 14).
-- #############################################################################

CREATE TABLE public.scp_assessment_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.scp_assessment_families(id) ON DELETE RESTRICT,
  profession_id uuid REFERENCES public.scp_professions(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('core', 'profession_module')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Core has no profession; a profession module must name exactly one.
  CONSTRAINT scp_definition_profession_matches_purpose CHECK (
    (purpose = 'core' AND profession_id IS NULL)
    OR (purpose = 'profession_module' AND profession_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.scp_assessment_definitions IS
  'Spec 13.1 assessment_definitions. family_id and purpose are immutable after '
  'insert (spec: "Ja för family-link och syfte") -- enforced in SECTION 12.';

CREATE TABLE public.scp_assessment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES public.scp_assessment_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft', 'in_review', 'approved', 'published', 'retired')),
  -- Spec 9.3 / 14: the product-facing statement of how much evidence backs
  -- this version. NEVER silently upgraded; each step has its own release gate.
  validation_status text NOT NULL DEFAULT 'design'
    CHECK (validation_status IN (
      'design', 'pilot', 'operational-development', 'operational-selection', 'retired'
    )),
  language_scope text[] NOT NULL DEFAULT ARRAY['sv-SE'],
  -- SHA-256 over the canonical published payload (spec 13.2).
  content_hash text,
  notes text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  retired_at timestamptz,
  retired_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (definition_id, version_number)
);

CREATE INDEX scp_assessment_versions_definition_idx
  ON public.scp_assessment_versions (definition_id, version_number DESC);
CREATE INDEX scp_assessment_versions_status_idx
  ON public.scp_assessment_versions (content_status, validation_status);

COMMENT ON COLUMN public.scp_assessment_versions.validation_status IS
  'Spec 14 release gates. design -> internal development only. pilot -> no '
  'selection decisions. operational-development -> development + structured '
  'interview. operational-selection -> may be ONE of several selection '
  'sources, only after specialist approval. Reports must always display this.';


-- #############################################################################
-- SECTION 6 -- Item bank: items, item versions, language adaptations, options
--
-- Spec 7.1 and Bilaga A. Three deliberate structural choices:
--
--  * Item TEXT lives in scp_item_texts, one row per language, each carrying
--    its own adaptation status. Translation is an ADAPTATION with its own
--    review gate (spec 7.1, 11), never a second column on the same row.
--  * The SCORING KEY (score_value + rationale) lives in scp_item_options,
--    which is a SEPARATE table from the candidate-visible option label in
--    scp_item_option_texts. This split is what makes "no scoring key ever
--    reaches the browser" enforceable by SELECT-list, not just by discipline.
--  * Review evidence (SME, bias/accessibility, legal) is first-class columns,
--    because spec 7.4/10.3 make them publication gates, not annotations.
-- #############################################################################

CREATE TABLE public.scp_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_items IS
  'Stable item stem identity. Every published change creates a new '
  'scp_item_versions row (spec 13.2: no published item may be updated in place).';

CREATE TABLE public.scp_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.scp_items(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,

  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft', 'in_review', 'approved', 'published', 'retired')),
  -- Spec Bilaga A `status`, kept distinct from content_status: content_status
  -- is the editorial workflow, validation_status is the evidence claim.
  validation_status text NOT NULL DEFAULT 'design'
    CHECK (validation_status IN (
      'design', 'sme_reviewed', 'pilot', 'operational', 'retired'
    )),

  item_format text NOT NULL CHECK (item_format IN (
    'sjt_best_response', 'sjt_rate_effectiveness', 'biq_frequency'
  )),

  -- Spec 7.2: exactly one primary construct, at most one secondary.
  competency_id uuid NOT NULL REFERENCES public.scp_competencies(id) ON DELETE RESTRICT,
  facet_id uuid REFERENCES public.scp_competency_facets(id) ON DELETE RESTRICT,
  secondary_competency_id uuid REFERENCES public.scp_competencies(id) ON DELETE RESTRICT,

  observable_behavior text NOT NULL,
  response_process text NOT NULL,
  context_note text,

  -- Spec 10.3: market/legal traceability for legally regulated roles.
  market text,
  legal_basis_required boolean NOT NULL DEFAULT false,
  legal_review_status text NOT NULL DEFAULT 'not_required'
    CHECK (legal_review_status IN ('not_required', 'pending', 'approved', 'rejected')),
  legal_source text,
  legal_reviewed_by text,
  legal_reviewed_at timestamptz,
  legal_review_expires_at timestamptz,

  -- Spec 7.4 steps 5-6: publication gates, not decoration.
  bias_review_status text NOT NULL DEFAULT 'pending'
    CHECK (bias_review_status IN ('pending', 'approved', 'rejected')),
  bias_review_notes text,
  sme_review_status text NOT NULL DEFAULT 'pending'
    CHECK (sme_review_status IN ('pending', 'approved', 'rejected')),
  sme_reviewer_count integer NOT NULL DEFAULT 0,
  sme_review_notes text,

  -- Spec Bilaga A pilot stats; populated in PR-F, reserved here so the
  -- item-version row never has to be altered later.
  pilot_stats jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Spec 7.1: authored by AI as a first draft is allowed; becoming assignable
  -- without human review is not. Recorded explicitly so it is auditable.
  authored_by_ai boolean NOT NULL DEFAULT false,

  content_hash text,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, version_number),

  -- Spec 7.2: primary and secondary construct must genuinely differ.
  CONSTRAINT scp_item_secondary_differs CHECK (
    secondary_competency_id IS NULL OR secondary_competency_id <> competency_id
  ),
  -- Spec 10.3: a legally dependent item cannot sit at 'not_required'.
  CONSTRAINT scp_item_legal_gate CHECK (
    legal_basis_required = false OR legal_review_status <> 'not_required'
  )
);

CREATE INDEX scp_item_versions_item_idx
  ON public.scp_item_versions (item_id, version_number DESC);
CREATE INDEX scp_item_versions_competency_idx
  ON public.scp_item_versions (competency_id, item_format);
CREATE INDEX scp_item_versions_status_idx
  ON public.scp_item_versions (content_status, validation_status);


-- Language adaptations. Spec 7.1 / 11: "Forward translation, expert review,
-- reconciliation, kandidatintervjuer och statistisk kontroll; inte
-- maskinöversättning ensam."
CREATE TABLE public.scp_item_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL REFERENCES public.scp_item_versions(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('sv-SE', 'en-GB')),
  -- 'source' = the language the item was authored in. Everything else is an
  -- adaptation and must reach 'approved' before its language can be published.
  adaptation_status text NOT NULL DEFAULT 'adaptation_pending'
    CHECK (adaptation_status IN (
      'source', 'adaptation_pending', 'adaptation_reviewed', 'approved'
    )),
  scenario text NOT NULL,
  prompt text NOT NULL,
  adaptation_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_version_id, language)
);

COMMENT ON TABLE public.scp_item_texts IS
  'One row per language per item version -- the spec''s "separata, länkade '
  'itemversioner". Machine translation alone may never reach adaptation_status '
  '= approved (spec 11). A language cannot be published for a form until every '
  'item text in that language is approved.';


-- THE SCORING KEY. Never exposed to a candidate or employer client.
CREATE TABLE public.scp_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL REFERENCES public.scp_item_versions(id) ON DELETE CASCADE,
  option_key text NOT NULL,
  display_order integer NOT NULL,
  -- Spec Bilaga A: 0-3 partial credit per option, by SME consensus.
  score_value numeric NOT NULL CHECK (score_value >= 0 AND score_value <= 3),
  -- Spec 7.2/Bilaga A: every score must be justified in writing.
  scoring_rationale_sv text NOT NULL,
  scoring_rationale_en text,
  -- Spec 8.1: BIQ items use controlled reverse scoring.
  reverse_scored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_version_id, option_key),
  UNIQUE (item_version_id, display_order)
);

COMMENT ON TABLE public.scp_item_options IS
  'SCORING KEY -- spec 12.1 "Ingen hemlig data, API-nyckel eller scoringnyckel '
  'i klientkod". Deliberately holds NO candidate-visible text, so the candidate '
  'runtime can join scp_item_option_texts alone and structurally cannot leak a '
  'weight. RLS below denies every non-service, non-authoring reader.';

CREATE TABLE public.scp_item_option_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_option_id uuid NOT NULL REFERENCES public.scp_item_options(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('sv-SE', 'en-GB')),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_option_id, language)
);

COMMENT ON TABLE public.scp_item_option_texts IS
  'Candidate-visible option label only. Carries no score_value by design -- '
  'this is the table the candidate runtime reads.';


-- #############################################################################
-- SECTION 7 -- Forms (spec 13.1 `forms`)
--
-- A form is the ordered selection of item versions that an assessment version
-- actually administers.
-- #############################################################################

CREATE TABLE public.scp_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_version_id uuid NOT NULL
    REFERENCES public.scp_assessment_versions(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  target_minutes_min integer,
  target_minutes_max integer,
  -- Spec 7.1: order may be randomised WITHIN controlled blocks only.
  randomise_within_block boolean NOT NULL DEFAULT true,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_version_id, slug)
);

CREATE TABLE public.scp_form_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.scp_forms(id) ON DELETE CASCADE,
  item_version_id uuid NOT NULL REFERENCES public.scp_item_versions(id) ON DELETE RESTRICT,
  block_key text NOT NULL DEFAULT 'default',
  display_order integer NOT NULL,
  -- Spec 7.1: answer options are randomised only where no order dependency
  -- exists (a rate-effectiveness item, for example, has one).
  randomise_options boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, item_version_id),
  UNIQUE (form_id, display_order)
);

CREATE INDEX scp_form_items_form_idx ON public.scp_form_items (form_id, display_order);


-- #############################################################################
-- SECTION 8 -- Bundles (spec 13.1 `module_links`)
--
-- The Core version + Profession Module version pairing a candidate actually
-- receives. Immutable per published bundle version, so an assignment can lock
-- one row and reproduce the exact experience forever.
-- #############################################################################

CREATE TABLE public.scp_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  profession_id uuid NOT NULL REFERENCES public.scp_professions(id) ON DELETE RESTRICT,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scp_bundle_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.scp_bundles(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft', 'in_review', 'approved', 'published', 'retired')),
  validation_status text NOT NULL DEFAULT 'design'
    CHECK (validation_status IN (
      'design', 'pilot', 'operational-development', 'operational-selection', 'retired'
    )),

  core_assessment_version_id uuid NOT NULL
    REFERENCES public.scp_assessment_versions(id) ON DELETE RESTRICT,
  module_assessment_version_id uuid NOT NULL
    REFERENCES public.scp_assessment_versions(id) ON DELETE RESTRICT,
  core_form_id uuid NOT NULL REFERENCES public.scp_forms(id) ON DELETE RESTRICT,
  module_form_id uuid NOT NULL REFERENCES public.scp_forms(id) ON DELETE RESTRICT,

  role_weight_profile_id uuid,
  scoring_version text NOT NULL DEFAULT 'scp-scoring-v1',
  report_version text NOT NULL DEFAULT 'scp-report-v1',
  disclaimer_version text NOT NULL DEFAULT 'scp-disclaimer-v1',

  content_hash text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  retired_at timestamptz,
  retired_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, version_number),
  CONSTRAINT scp_bundle_core_module_differ
    CHECK (core_assessment_version_id <> module_assessment_version_id)
);

CREATE INDEX scp_bundle_versions_bundle_idx
  ON public.scp_bundle_versions (bundle_id, version_number DESC);

COMMENT ON TABLE public.scp_bundle_versions IS
  'Spec 13.1 module_links + the assignment''s full lineage lock (spec 2.1 step '
  '2): Core version, module version, both forms, scoring version, report '
  'version and disclaimer version, all pinned in one immutable published row.';


-- #############################################################################
-- SECTION 9 -- Role weight profiles (spec 13.1 `role_weight_profiles`)
--
-- Spec 5.2 is explicit that the indicative 1-12 table is NOT a validated
-- weighting model and must not be used in production until job analysis, SME
-- judgement and pilot data are approved. `validation_status` carries that.
-- #############################################################################

CREATE TABLE public.scp_role_weight_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.scp_professions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft', 'in_review', 'approved', 'published', 'retired')),
  validation_status text NOT NULL DEFAULT 'design'
    CHECK (validation_status IN (
      'design', 'pilot', 'operational-development', 'operational-selection', 'retired'
    )),
  notes text,
  content_hash text,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, version_number)
);

CREATE TABLE public.scp_role_weight_profile_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_weight_profile_id uuid NOT NULL
    REFERENCES public.scp_role_weight_profiles(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.scp_competencies(id) ON DELETE RESTRICT,
  -- Spec 5.2 uses an internal 1-12 relevance scale.
  weight numeric NOT NULL CHECK (weight >= 0 AND weight <= 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_weight_profile_id, competency_id)
);

ALTER TABLE public.scp_bundle_versions
  ADD CONSTRAINT scp_bundle_versions_role_weight_profile_fkey
  FOREIGN KEY (role_weight_profile_id)
  REFERENCES public.scp_role_weight_profiles(id) ON DELETE RESTRICT;


-- #############################################################################
-- SECTION 10 -- Content events (spec 13.1 `audit_events`, append-only)
--
-- Mirrors the Blueprint Engine's *_content_events convention. Deliberately a
-- dedicated table rather than public.audit_logs: audit_logs has no client
-- grants at all (service_role only), whereas assessment governance needs
-- platform admins to READ the change log in the admin UI (PR-B).
-- #############################################################################

CREATE TABLE public.scp_content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN (
    'family', 'competency', 'competency_version', 'facet', 'profession',
    'definition', 'assessment_version', 'item', 'item_version', 'item_text',
    'item_option', 'form', 'form_item', 'bundle', 'bundle_version',
    'role_weight_profile', 'legacy_retirement'
  )),
  subject_id uuid,
  subject_ref text,
  action text NOT NULL CHECK (action IN (
    'created', 'updated', 'submitted_for_review', 'approved', 'rejected',
    'published', 'retired', 'role_granted', 'role_revoked'
  )),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scp_content_events_subject_idx
  ON public.scp_content_events (subject_type, subject_id, at DESC);
CREATE INDEX scp_content_events_actor_idx
  ON public.scp_content_events (actor_id, at DESC);

COMMENT ON TABLE public.scp_content_events IS
  'Append-only change log for every Security Competency content object. No '
  'UPDATE or DELETE grant is issued to any client role, so history cannot be '
  'rewritten from the application.';


-- #############################################################################
-- SECTION 11 -- Publication approvals (two-person principle, spec 13.3)
-- #############################################################################

CREATE TABLE public.scp_publication_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN (
    'assessment_version', 'item_version', 'bundle_version', 'role_weight_profile'
  )),
  subject_id uuid NOT NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (subject_type, subject_id, approved_by)
);

COMMENT ON TABLE public.scp_publication_approvals IS
  'Spec 13.3 / T-013: an assessment editor must not be able to create, approve '
  'and publish the same content alone. A publish RPC requires at least one '
  'approval row from a reviewer who is NOT the publisher.';


-- #############################################################################
-- SECTION 12 -- Immutability and separation guards
--
-- These triggers are the structural half of acceptance criteria 8, 9 and T-004
-- ("Ändra publicerat item via UI/API/SQL -> blockeras"). They fire for every
-- caller including service_role and direct SQL, which is exactly the point:
-- the specification requires that a published version cannot be edited
-- "genom UI, API, direct update eller service role".
-- #############################################################################

-- Generic helper: forbid any UPDATE to a row that has left draft/in_review,
-- except for the narrow set of lifecycle columns a legitimate transition
-- needs to write.
CREATE OR REPLACE FUNCTION public.scp_guard_published_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed text[] := ARRAY[
    'content_status', 'validation_status', 'approved_by', 'approved_at',
    'published_by', 'published_at', 'retired_at', 'retired_reason',
    'content_hash', 'updated_at', 'pilot_stats'
  ];
  _col text;
  _old jsonb := to_jsonb(OLD);
  _new jsonb := to_jsonb(NEW);
BEGIN
  -- Draft and in-review content is freely editable; that is the whole point
  -- of a draft. Immutability begins the moment content is approved.
  IF OLD.content_status IN ('draft', 'in_review') THEN
    RETURN NEW;
  END IF;

  FOR _col IN SELECT jsonb_object_keys(_old) LOOP
    IF _col = ANY (_allowed) THEN
      CONTINUE;
    END IF;
    IF (_old -> _col) IS DISTINCT FROM (_new -> _col) THEN
      RAISE EXCEPTION
        'SCP_PUBLISHED_IMMUTABLE: column "%" cannot be modified on % once content_status is "%". Create a new version instead.',
        _col, TG_TABLE_NAME, OLD.content_status
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.scp_guard_published_immutable() IS
  'Spec 13.2 / acceptance criteria 8-9 / T-004. Blocks in-place edits of '
  'approved, published or retired content for EVERY caller (including '
  'service_role and raw SQL). Lifecycle columns stay writable so a legitimate '
  'publish/retire transition is still possible.';

CREATE TRIGGER scp_assessment_versions_immutable
  BEFORE UPDATE ON public.scp_assessment_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_published_immutable();

CREATE TRIGGER scp_item_versions_immutable
  BEFORE UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_published_immutable();

CREATE TRIGGER scp_bundle_versions_immutable
  BEFORE UPDATE ON public.scp_bundle_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_published_immutable();

CREATE TRIGGER scp_role_weight_profiles_immutable
  BEFORE UPDATE ON public.scp_role_weight_profiles
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_published_immutable();


-- Child rows (texts, options, form items) of a non-draft parent are equally
-- immutable -- otherwise a published item's wording or scoring key could be
-- changed without touching the version row at all.
CREATE OR REPLACE FUNCTION public.scp_guard_child_of_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
  _item_version_id uuid;
  _row record;
BEGIN
  _row := COALESCE(NEW, OLD);

  IF TG_TABLE_NAME = 'scp_item_texts' THEN
    SELECT content_status INTO _status
      FROM public.scp_item_versions WHERE id = _row.item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_item_options' THEN
    SELECT content_status INTO _status
      FROM public.scp_item_versions WHERE id = _row.item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_item_option_texts' THEN
    SELECT o.item_version_id INTO _item_version_id
      FROM public.scp_item_options o WHERE o.id = _row.item_option_id;
    SELECT content_status INTO _status
      FROM public.scp_item_versions WHERE id = _item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_form_items' THEN
    SELECT av.content_status INTO _status
      FROM public.scp_forms f
      JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
      WHERE f.id = _row.form_id;
  ELSIF TG_TABLE_NAME = 'scp_role_weight_profile_weights' THEN
    SELECT content_status INTO _status
      FROM public.scp_role_weight_profiles WHERE id = _row.role_weight_profile_id;
  END IF;

  IF _status IS NOT NULL AND _status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'SCP_PUBLISHED_IMMUTABLE: % cannot be modified because its parent version is "%". Create a new version instead.',
      TG_TABLE_NAME, _status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER scp_item_texts_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_item_texts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_child_of_published();

CREATE TRIGGER scp_item_options_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_item_options
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_child_of_published();

CREATE TRIGGER scp_item_option_texts_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_item_option_texts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_child_of_published();

CREATE TRIGGER scp_form_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_form_items
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_child_of_published();

CREATE TRIGGER scp_role_weight_profile_weights_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_role_weight_profile_weights
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_child_of_published();


-- Family slug/product_type and definition family/purpose immutability
-- (spec 13.1 "Immutable efter publicering: Ja för slug och produkttyp" /
-- "Ja för family-link och syfte").
CREATE OR REPLACE FUNCTION public.scp_guard_family_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.product_type IS DISTINCT FROM OLD.product_type THEN
    RAISE EXCEPTION
      'SCP_FAMILY_IDENTITY_IMMUTABLE: assessment family slug and product_type can never change.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scp_assessment_families_identity_immutable
  BEFORE UPDATE ON public.scp_assessment_families
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_family_identity();

CREATE OR REPLACE FUNCTION public.scp_guard_definition_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION
      'SCP_DEFINITION_IDENTITY_IMMUTABLE: assessment definition slug, family link and purpose can never change.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scp_assessment_definitions_identity_immutable
  BEFORE UPDATE ON public.scp_assessment_definitions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_definition_identity();


-- Product separation, enforced in data (implementation directive section 5).
-- No Security Competency definition may ever hang off the career-guidance
-- family, in either direction.
CREATE OR REPLACE FUNCTION public.scp_guard_family_product_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product_type text;
BEGIN
  SELECT product_type INTO _product_type
    FROM public.scp_assessment_families WHERE id = NEW.family_id;

  IF _product_type = 'career_guidance' THEN
    RAISE EXCEPTION
      'SCP_CAREER_GUIDANCE_SEPARATION: a Security Competency assessment definition may never be attached to the career-guidance family.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.purpose = 'core' AND _product_type <> 'security_competency_core' THEN
    RAISE EXCEPTION
      'SCP_FAMILY_PURPOSE_MISMATCH: purpose "core" requires a security_competency_core family.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.purpose = 'profession_module' AND _product_type <> 'profession_module' THEN
    RAISE EXCEPTION
      'SCP_FAMILY_PURPOSE_MISMATCH: purpose "profession_module" requires a profession_module family.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER scp_assessment_definitions_separation
  BEFORE INSERT OR UPDATE ON public.scp_assessment_definitions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_family_product_separation();


-- Bundle sanity: a bundle version must genuinely pair a Core version with a
-- profession-module version, and each form must belong to its own version.
CREATE OR REPLACE FUNCTION public.scp_guard_bundle_composition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _core_purpose text;
  _module_purpose text;
  _core_form_version uuid;
  _module_form_version uuid;
BEGIN
  SELECT d.purpose INTO _core_purpose
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE av.id = NEW.core_assessment_version_id;

  SELECT d.purpose INTO _module_purpose
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE av.id = NEW.module_assessment_version_id;

  IF _core_purpose <> 'core' THEN
    RAISE EXCEPTION 'SCP_BUNDLE_CORE_INVALID: core_assessment_version_id must reference a Core definition.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _module_purpose <> 'profession_module' THEN
    RAISE EXCEPTION 'SCP_BUNDLE_MODULE_INVALID: module_assessment_version_id must reference a profession-module definition.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT assessment_version_id INTO _core_form_version
    FROM public.scp_forms WHERE id = NEW.core_form_id;
  SELECT assessment_version_id INTO _module_form_version
    FROM public.scp_forms WHERE id = NEW.module_form_id;

  IF _core_form_version IS DISTINCT FROM NEW.core_assessment_version_id THEN
    RAISE EXCEPTION 'SCP_BUNDLE_FORM_MISMATCH: core_form_id does not belong to core_assessment_version_id.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _module_form_version IS DISTINCT FROM NEW.module_assessment_version_id THEN
    RAISE EXCEPTION 'SCP_BUNDLE_FORM_MISMATCH: module_form_id does not belong to module_assessment_version_id.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER scp_bundle_versions_composition
  BEFORE INSERT OR UPDATE ON public.scp_bundle_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_bundle_composition();


-- #############################################################################
-- SECTION 13 -- updated_at triggers (reuses the repo's existing helper)
-- #############################################################################

CREATE TRIGGER set_scp_assessment_families_updated_at BEFORE UPDATE ON public.scp_assessment_families
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_competency_versions_updated_at BEFORE UPDATE ON public.scp_competency_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_professions_updated_at BEFORE UPDATE ON public.scp_professions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_assessment_definitions_updated_at BEFORE UPDATE ON public.scp_assessment_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_assessment_versions_updated_at BEFORE UPDATE ON public.scp_assessment_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_item_versions_updated_at BEFORE UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_item_texts_updated_at BEFORE UPDATE ON public.scp_item_texts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_item_option_texts_updated_at BEFORE UPDATE ON public.scp_item_option_texts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_forms_updated_at BEFORE UPDATE ON public.scp_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_bundle_versions_updated_at BEFORE UPDATE ON public.scp_bundle_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_scp_role_weight_profiles_updated_at BEFORE UPDATE ON public.scp_role_weight_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- #############################################################################
-- SECTION 14 -- Grants and RLS
--
-- Access model (spec 13.3), stated once and applied per table below:
--
--   * Catalogue metadata (families, competencies, facets, professions,
--     definitions, versions, bundles) -- readable by any authenticated user.
--     It is product information, not test content. Writable only by
--     authoring/governance roles.
--   * Item bank (items, item versions, texts, form items) -- NEVER readable by
--     a candidate or employer client. Authoring roles and service_role only.
--     The candidate runtime (PR-C) reads it through a SECURITY DEFINER
--     function that returns only the current attempt's items, never the bank.
--   * Scoring keys (scp_item_options) -- authoring roles and service_role
--     ONLY. No employer, no candidate, ever, under any condition.
-- #############################################################################

-- ---- Catalogue metadata: authenticated read, authoring write -------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_assessment_families', 'scp_competencies', 'scp_competency_versions',
    'scp_competency_facets', 'scp_professions', 'scp_assessment_definitions',
    'scp_assessment_versions', 'scp_bundles', 'scp_bundle_versions',
    'scp_role_weight_profiles', 'scp_role_weight_profile_weights', 'scp_forms'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.scp_can_author(auth.uid())) '
      'WITH CHECK (public.scp_can_author(auth.uid()))',
      t || '_author_write', t);
  END LOOP;
END $$;

-- ---- Item bank + scoring keys: authoring roles and service_role ONLY -----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_items', 'scp_item_versions', 'scp_item_texts',
    'scp_item_options', 'scp_item_option_texts', 'scp_form_items'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- No permissive policy for ordinary authenticated users: RLS default-deny
    -- means a candidate or employer account sees zero rows.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.scp_can_author(auth.uid())) '
      'WITH CHECK (public.scp_can_author(auth.uid()))',
      t || '_author_only', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.scp_items IS
  'Item bank. RLS is default-deny for every account without a Security '
  'Competency content role -- spec 13.3 "aldrig itembank eller scoringnyckel" '
  'for employers, and acceptance criterion 13.';

-- ---- Content events: platform admin + authoring read, append-only --------
GRANT SELECT, INSERT ON public.scp_content_events TO authenticated;
GRANT ALL ON public.scp_content_events TO service_role;
ALTER TABLE public.scp_content_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY scp_content_events_read ON public.scp_content_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.scp_can_author(auth.uid()));

CREATE POLICY scp_content_events_append ON public.scp_content_events
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_can_author(auth.uid()) AND actor_id = auth.uid());

-- Deliberately NO update/delete policy: the log is append-only.

-- ---- Publication approvals ----------------------------------------------
GRANT SELECT, INSERT ON public.scp_publication_approvals TO authenticated;
GRANT ALL ON public.scp_publication_approvals TO service_role;
ALTER TABLE public.scp_publication_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY scp_publication_approvals_read ON public.scp_publication_approvals
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.scp_can_author(auth.uid()));

-- Only a reviewer may record an approval, and only in their own name.
CREATE POLICY scp_publication_approvals_reviewer_insert ON public.scp_publication_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    approved_by = auth.uid()
    AND (
      public.scp_has_content_role(auth.uid(), 'reviewer')
      OR public.is_platform_admin(auth.uid())
    )
  );


-- #############################################################################
-- SECTION 15 -- Seed: families, the twelve SCC competencies and their facets,
-- and the three Swedish professions.
--
-- Content only, no behaviour. Every construct definition below is transcribed
-- from chapter 5/6 of the specification, which is the normative source.
-- #############################################################################

INSERT INTO public.scp_assessment_families (slug, name_sv, name_en, product_type, description_sv, description_en)
VALUES
  ('career-guidance', 'Karriärvägledning', 'Career Guidance', 'career_guidance',
   'Karriärintressen, motivation och arbetsmiljöpreferenser. Separat produkt -- får aldrig återanvändas som kompetensbedömning.',
   'Career interests, motivation and work-environment preferences. A separate product -- never reusable as competence measurement.'),
  ('security-competency-core', 'Security Competency Core', 'Security Competency Core', 'security_competency_core',
   'Gemensamma arbetsrelaterade säkerhetskompetenser (SCC-01--SCC-12).',
   'Shared work-related security competencies (SCC-01--SCC-12).'),
  ('security-profession-modules', 'Yrkesmoduler', 'Profession Modules', 'profession_module',
   'Rollspecifika situationer, kunskap och beteenden per yrke och marknad.',
   'Role-specific situations, knowledge and behaviours per profession and market.')
ON CONFLICT (slug) DO NOTHING;


INSERT INTO public.scp_competencies (code, display_order) VALUES
  ('SCC-01', 1), ('SCC-02', 2), ('SCC-03', 3), ('SCC-04', 4),
  ('SCC-05', 5), ('SCC-06', 6), ('SCC-07', 7), ('SCC-08', 8),
  ('SCC-09', 9), ('SCC-10', 10), ('SCC-11', 11), ('SCC-12', 12)
ON CONFLICT (code) DO NOTHING;


INSERT INTO public.scp_competency_versions
  (competency_id, version_number, content_status, name_sv, name_en, definition_sv, definition_en, published_at)
SELECT c.id, 1, 'published', v.name_sv, v.name_en, v.def_sv, v.def_en, now()
FROM (VALUES
  ('SCC-01', 'Integritet och etik', 'Integrity & Ethics',
   'Förmågan och benägenheten att handla ärligt, rättssäkert och konsekvent med yrkesetik, policy och uppdragets legitima syfte – även när det är obekvämt, när ingen ser eller när det finns socialt eller praktiskt tryck att välja en genväg.',
   'The ability and disposition to act honestly, lawfully and consistently with professional ethics, policy and the legitimate purpose of the assignment — including when it is uncomfortable, when no one is watching, or when there is social or practical pressure to take a shortcut.'),
  ('SCC-02', 'Säkerhetsmedvetenhet', 'Security Awareness',
   'Förmågan att förstå skyddsvärden, riskorsaker, barriärer och konsekvenser samt att konsekvent väga in säkerhet i vardagliga beslut utan att skapa onödig friktion eller överdriven kontroll.',
   'The ability to understand protected assets, risk causes, barriers and consequences, and to consistently factor security into everyday decisions without creating unnecessary friction or excessive control.'),
  ('SCC-03', 'Situationsmedvetenhet', 'Situational Awareness',
   'Förmågan att uppmärksamma relevant information i en föränderlig situation, förstå vad informationen betyder och bedöma vad som sannolikt kan hända härnäst.',
   'The ability to notice relevant information in a changing situation, understand what that information means, and judge what is likely to happen next.'),
  ('SCC-04', 'Beslutsfattande under press', 'Decision Making Under Pressure',
   'Förmågan att fatta tillräckligt snabba, proportionerliga och säkerhetsmässigt rimliga beslut när tid, information eller handlingsutrymme är begränsat.',
   'The ability to make sufficiently fast, proportionate and security-sound decisions when time, information or room for action is limited.'),
  ('SCC-05', 'Emotionell självreglering', 'Emotional Regulation',
   'Förmågan att behålla professionellt beteende, kontrollera impulser och återgå till funktionellt agerande när situationer väcker frustration, rädsla, provokation eller starkt engagemang.',
   'The ability to maintain professional behaviour, control impulses and return to functional action when situations provoke frustration, fear, provocation or strong involvement.'),
  ('SCC-06', 'Kommunikation och informationskvalitet', 'Communication',
   'Förmågan att lyssna, formulera och överföra relevant information tydligt, sakligt och mottagaranpassat i tal, skrift och eskalering.',
   'The ability to listen, formulate and transfer relevant information clearly, factually and appropriately for the recipient — in speech, in writing and in escalation.'),
  ('SCC-07', 'Respektfull service och gränshållning', 'Service Orientation',
   'Förmågan att ge respektfullt, lösningsorienterat och professionellt bemötande samtidigt som säkerhetskrav, mandat och likabehandling upprätthålls.',
   'The ability to provide respectful, solution-oriented and professional treatment while upholding security requirements, mandate and equal treatment.'),
  ('SCC-08', 'Samarbete och samordning', 'Teamwork & Collaboration',
   'Förmågan att bidra till gemensam lägesbild, tillförlitlig samordning och ömsesidigt stöd inom och mellan roller, utan att ansvar blir otydligt.',
   'The ability to contribute to a shared situational picture, reliable coordination and mutual support within and across roles, without responsibility becoming unclear.'),
  ('SCC-09', 'Ansvarstagande och tillförlitlighet', 'Accountability',
   'Förmågan att ta ägarskap för uppgifter, hålla överenskommelser, följa upp avvikelser och skapa spårbarhet från uppdrag till avslut.',
   'The ability to take ownership of tasks, keep agreements, follow up on deviations and create traceability from assignment to closure.'),
  ('SCC-10', 'Anpassningsförmåga', 'Adaptability',
   'Förmågan att ändra arbetssätt när förutsättningar, information eller prioriteringar förändras, utan att överge säkerhetsprinciper eller skapa onödig instabilitet.',
   'The ability to change working methods when conditions, information or priorities change, without abandoning security principles or creating unnecessary instability.'),
  ('SCC-11', 'Professionellt omdöme och proportionalitet', 'Professional Judgement',
   'Förmågan att väga fakta, regler, risk, rättigheter, verksamhetsbehov och möjliga konsekvenser för att välja en rimlig och proportionerlig åtgärd inom mandatet.',
   'The ability to weigh facts, rules, risk, rights, operational needs and possible consequences in order to choose a reasonable and proportionate action within mandate.'),
  ('SCC-12', 'Lärandeorientering', 'Learning Orientation',
   'Förmågan och viljan att söka återkoppling, reflektera över erfarenheter, uppdatera sin kunskap och omsätta lärdomar i förbättrat arbetssätt.',
   'The ability and willingness to seek feedback, reflect on experience, update one''s knowledge and translate lessons into improved practice.')
) AS v(code, name_sv, name_en, def_sv, def_en)
JOIN public.scp_competencies c ON c.code = v.code
ON CONFLICT (competency_id, version_number) DO NOTHING;


-- Facets, transcribed from chapter 6's "Facets för innehållstäckning" tables.
INSERT INTO public.scp_competency_facets (competency_id, slug, name_sv, name_en, definition_sv, definition_en, display_order)
SELECT c.id, v.slug, v.name_sv, v.name_en, v.def_sv, v.def_en, v.ord
FROM (VALUES
  ('SCC-01','etisk-konsekvens','Etisk konsekvens','Ethical consistency','Tillämpar samma principer oavsett vem som ber om undantag.','Applies the same principles regardless of who asks for an exception.',1),
  ('SCC-01','transparens','Transparens','Transparency','Redovisar relevanta fel, begränsningar och intressekonflikter.','Discloses relevant errors, limitations and conflicts of interest.',2),
  ('SCC-01','regel-och-syfteslojalitet','Regel- och syfteslojalitet','Rule and purpose loyalty','Följer regler och förstår varför de finns; eskalerar när instruktioner kolliderar.','Follows rules and understands why they exist; escalates when instructions collide.',3),
  ('SCC-01','motstand-mot-otillborlig-paverkan','Motstånd mot otillbörlig påverkan','Resistance to undue influence','Står emot favorisering, social press, gåvor och informella genvägar.','Resists favouritism, social pressure, gifts and informal shortcuts.',4),

  ('SCC-02','skyddsvardesforstaelse','Skyddsvärdesförståelse','Protected-asset understanding','Identifierar vad som behöver skyddas och varför.','Identifies what needs protecting and why.',1),
  ('SCC-02','barriartankande','Barriärtänkande','Barrier thinking','Förstår hur rutiner, teknik och människor tillsammans minskar risk.','Understands how procedures, technology and people together reduce risk.',2),
  ('SCC-02','forebyggande-orientering','Förebyggande orientering','Preventive orientation','Agerar innan en svaghet blir en incident.','Acts before a weakness becomes an incident.',3),
  ('SCC-02','sakerhetsbalans','Säkerhetsbalans','Security balance','Väger skydd mot verksamhet, proportionalitet och användbarhet.','Weighs protection against operations, proportionality and usability.',4),

  ('SCC-03','aktiv-scanning','Aktiv scanning','Active scanning','Söker systematiskt efter relevant information.','Systematically seeks relevant information.',1),
  ('SCC-03','avvikelseigenkanning','Avvikelseigenkänning','Anomaly recognition','Ser sådant som inte stämmer med förväntat mönster.','Notices what does not match the expected pattern.',2),
  ('SCC-03','situationssyntes','Situationssyntes','Situational synthesis','Kombinerar flera svaga signaler till en begriplig helhet.','Combines several weak signals into a coherent whole.',3),
  ('SCC-03','framatblick','Framåtblick','Anticipation','Bedömer sannolika nästa händelser och uppdaterar bilden.','Judges likely next events and updates the picture.',4),

  ('SCC-04','prioritering','Prioritering','Prioritisation','Identifierar vad som är mest tidskritiskt.','Identifies what is most time-critical.',1),
  ('SCC-04','beslutsbalans','Beslutsbalans','Decision balance','Väger handlingskraft mot risk och informationsbehov.','Weighs decisiveness against risk and information needs.',2),
  ('SCC-04','eskalering','Eskalering','Escalation','Känner igen när mandat eller resurser inte räcker.','Recognises when mandate or resources are insufficient.',3),
  ('SCC-04','aterhamtning','Återhämtning','Recovery','Omprövar beslut när läget förändras.','Reconsiders decisions when the situation changes.',4),

  ('SCC-05','impulskontroll','Impulskontroll','Impulse control','Undviker ogenomtänkta verbala eller praktiska reaktioner.','Avoids ill-considered verbal or practical reactions.',1),
  ('SCC-05','professionell-distans','Professionell distans','Professional distance','Skiljer personligt bemötande från uppdragets krav.','Separates personal treatment from the demands of the assignment.',2),
  ('SCC-05','aterstallning','Återställning','Restoration','Kan återfokusera efter belastning eller misstag.','Can refocus after strain or a mistake.',3),
  ('SCC-05','sjalvmedvetenhet','Självmedvetenhet','Self-awareness','Känner igen egna signaler och använder fungerande strategier.','Recognises one''s own signals and uses strategies that work.',4),

  ('SCC-06','aktivt-lyssnande','Aktivt lyssnande','Active listening','Säkerställer att relevant information förstås.','Ensures relevant information is understood.',1),
  ('SCC-06','saklig-tydlighet','Saklig tydlighet','Factual clarity','Skiljer observation, tolkning och rekommendation.','Separates observation, interpretation and recommendation.',2),
  ('SCC-06','eskalering-och-overlamning','Eskalering och överlämning','Escalation and handover','Ger rätt information till rätt mottagare i rätt tid.','Gives the right information to the right recipient at the right time.',3),
  ('SCC-06','dokumentation','Dokumentation','Documentation','Skapar spårbar, neutral och användbar skriftlig information.','Creates traceable, neutral and usable written information.',4),

  ('SCC-07','respektfullt-bemotande','Respektfullt bemötande','Respectful treatment','Behandlar människor värdigt även vid avslag eller kontroll.','Treats people with dignity even when refusing or checking.',1),
  ('SCC-07','losningsorientering','Lösningsorientering','Solution orientation','Söker säkra alternativ i stället för ett mekaniskt nej.','Seeks safe alternatives instead of a mechanical no.',2),
  ('SCC-07','granshallning','Gränshållning','Boundary maintenance','Upprätthåller krav utan maktkamp eller favorisering.','Upholds requirements without power struggle or favouritism.',3),
  ('SCC-07','likvardighet','Likvärdighet','Equal treatment','Tillämpar regler konsekvent och anpassar kommunikation utan att sänka sakkrav.','Applies rules consistently and adapts communication without lowering substantive requirements.',4),

  ('SCC-08','informationsdelning','Informationsdelning','Information sharing','Delar relevant information i tid.','Shares relevant information in time.',1),
  ('SCC-08','rollklarhet','Rollklarhet','Role clarity','Förstår eget mandat och andras ansvar.','Understands one''s own mandate and the responsibilities of others.',2),
  ('SCC-08','omsesidigt-stod','Ömsesidigt stöd','Mutual support','Hjälper utan att ta över eller skapa beroende.','Helps without taking over or creating dependency.',3),
  ('SCC-08','samordnad-problemlosning','Samordnad problemlösning','Coordinated problem-solving','Integrerar perspektiv och hanterar oenighet sakligt.','Integrates perspectives and handles disagreement factually.',4),

  ('SCC-09','agarskap','Ägarskap','Ownership','Tar ansvar för uppgift och konsekvens inom sitt mandat.','Takes responsibility for the task and its consequences within mandate.',1),
  ('SCC-09','genomforandedisciplin','Genomförandedisciplin','Execution discipline','Planerar, prioriterar och avslutar uppgifter.','Plans, prioritises and completes tasks.',2),
  ('SCC-09','sparbar-uppfoljning','Spårbar uppföljning','Traceable follow-up','Dokumenterar status och återkopplar.','Documents status and reports back.',3),
  ('SCC-09','fel-och-avvikelseansvar','Fel- och avvikelseansvar','Error and deviation responsibility','Korrigerar brister och lär av dem.','Corrects shortcomings and learns from them.',4),

  ('SCC-10','kognitiv-flexibilitet','Kognitiv flexibilitet','Cognitive flexibility','Överväger alternativa förklaringar och lösningar.','Considers alternative explanations and solutions.',1),
  ('SCC-10','operativ-omstallning','Operativ omställning','Operational adjustment','Ändrar plan eller metod när läget kräver.','Changes plan or method when the situation demands it.',2),
  ('SCC-10','tolerans-for-osakerhet','Tolerans för osäkerhet','Tolerance for uncertainty','Fungerar med ofullständig information utan att låtsas säkerhet.','Functions with incomplete information without feigning certainty.',3),
  ('SCC-10','stabil-karna','Stabil kärna','Stable core','Behåller syfte, etik och säkerhetskrav genom förändringen.','Retains purpose, ethics and security requirements through the change.',4),

  ('SCC-11','faktabaserad-bedomning','Faktabaserad bedömning','Fact-based assessment','Skiljer relevant fakta från antaganden och bias.','Separates relevant fact from assumption and bias.',1),
  ('SCC-11','proportionalitet','Proportionalitet','Proportionality','Matchar åtgärdens styrka mot risk och mandat.','Matches the strength of the action to risk and mandate.',2),
  ('SCC-11','konsekvensanalys','Konsekvensanalys','Consequence analysis','Väger kort- och långsiktiga följder.','Weighs short- and long-term consequences.',3),
  ('SCC-11','rattssaker-gransdragning','Rättssäker gränsdragning','Lawful boundary-setting','Respekterar rättigheter, likabehandling och ansvarsfördelning.','Respects rights, equal treatment and the division of responsibility.',4),

  ('SCC-12','feedbackmottaglighet','Feedbackmottaglighet','Feedback receptivity','Tar emot och prövar relevant återkoppling.','Receives and tests relevant feedback.',1),
  ('SCC-12','reflektion','Reflektion','Reflection','Identifierar orsaker, antaganden och alternativa ageranden.','Identifies causes, assumptions and alternative actions.',2),
  ('SCC-12','kunskapsuppdatering','Kunskapsuppdatering','Knowledge updating','Söker och tillämpar ny relevant kunskap.','Seeks and applies new relevant knowledge.',3),
  ('SCC-12','overforing','Överföring','Transfer','Omsätter lärdom till rutin, beteende eller delad praxis.','Translates lessons into routine, behaviour or shared practice.',4)
) AS v(code, slug, name_sv, name_en, def_sv, def_en, ord)
JOIN public.scp_competencies c ON c.code = v.code
ON CONFLICT (competency_id, slug) DO NOTHING;


INSERT INTO public.scp_professions (slug, name_sv, name_en, market, legally_regulated, regulator_note_sv)
VALUES
  ('security-officer-se', 'Väktare', 'Security Officer – Sweden', 'SE', true,
   'Väktare är en reglerad roll enligt svensk rätt. Innehåll som bygger på lag, myndighetsföreskrifter eller formella befogenheter kräver juridisk granskning.'),
  ('public-order-officer-se', 'Ordningsvakt', 'Public Order Officer – Sweden', 'SE', true,
   'Ordningsvakt är en reglerad roll med särskilda befogenheter enligt svensk rätt. Svenska krav gäller inte automatiskt i andra länder.'),
  ('protective-security-officer-se', 'Skyddsvakt', 'Protective Security Officer – Sweden', 'SE', true,
   'Skyddsvakt är en reglerad roll enligt skyddslagstiftningen. Svenska krav gäller inte automatiskt i andra länder.')
ON CONFLICT (slug) DO NOTHING;


-- #############################################################################
-- SECTION 16 -- Legacy retirement: security-guard-foundation
--
-- Specification 2.2 and implementation directive section 6. The legacy row is
-- NEVER deleted or mutated in content: the questions, the scoring, the
-- historical assignments and the historical reports all stay exactly as they
-- are and stay reproducible. Only two things change:
--
--   1. assessment_versions.retired_at is stamped (column already exists since
--      the genesis migration -- no schema change needed).
--   2. A BEFORE INSERT trigger blocks any NEW assignment against a retired
--      version, with the stable error code the specification's T-002 requires.
--
-- The trigger is INSERT-only by design. Existing rows -- including the one
-- already-completed employer assignment in the live environment -- are never
-- evaluated, never updated and never blocked from being read or re-rendered.
-- #############################################################################

-- Additive column: why a version was retired, for the historical report label.
ALTER TABLE public.assessment_versions
  ADD COLUMN IF NOT EXISTS retired_reason TEXT;

COMMENT ON COLUMN public.assessment_versions.retired_reason IS
  'Why this legacy catalogue version was retired. Rendered on historical '
  'reports so a reader can see the result came from a retired legacy version.';

UPDATE public.assessment_versions
SET retired_at = COALESCE(retired_at, now()),
    retired_reason = COALESCE(
      retired_reason,
      'Retired per Security Competency Core Specification v2.0 §2.2: this definition''s '
      'content was the byte-for-byte preserved Public Assessment v2.1 career-guidance '
      'content, not role-specific competence content. Historical attempts and reports are '
      'preserved unchanged and remain reproducible. Superseded by the Security Competency '
      'Platform (security-competency-core + profession modules).'
    )
WHERE assessment_id = 'security-guard-foundation';

-- Remove it from the employer-facing catalogue so it can no longer be picked.
-- (employer_visible is metadata added by 20260721120000; flipping it back to
-- its own default is not a content mutation.)
UPDATE public.assessments
SET employer_visible = false
WHERE id = 'security-guard-foundation';


CREATE OR REPLACE FUNCTION public.assessment_assignments_block_retired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _retired_at timestamptz;
BEGIN
  SELECT retired_at INTO _retired_at
    FROM public.assessment_versions
    WHERE id = NEW.assessment_version_id;

  IF _retired_at IS NOT NULL AND _retired_at <= now() THEN
    RAISE EXCEPTION
      'ASSESSMENT_RETIRED: assessment version % was retired at % and can no longer receive new assignments.',
      NEW.assessment_version_id, _retired_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assessment_assignments_block_retired() IS
  'Spec T-002 / acceptance criteria 4. BEFORE INSERT only -- existing '
  'assignments (including historical completed ones) are never evaluated, so '
  'acceptance criteria 5 and 6 (historical attempts still open, historical '
  'scores unchanged) are structurally unaffected. Error text is prefixed with '
  'the stable code ASSESSMENT_RETIRED (repository SCREAMING_SNAKE_CASE '
  'convention for the specification''s "assessment_retired").';

CREATE TRIGGER assessment_assignments_block_retired_trg
  BEFORE INSERT ON public.assessment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.assessment_assignments_block_retired();


INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'legacy_retirement',
  'security-guard-foundation',
  'retired',
  'Security Competency Core Specification v2.0 §2.2 -- legacy definition reused Career Guidance content.',
  jsonb_build_object(
    'migration', '20260727120000_scp_a1_security_competency_platform_domain',
    'historical_data_mutated', false,
    'blocks', 'new assignments only'
  )
);
