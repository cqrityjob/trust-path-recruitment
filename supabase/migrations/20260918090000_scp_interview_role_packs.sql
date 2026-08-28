-- ===========================================================================
-- CQrity Interview Intelligence — Phase 1: the Role Interview Pack domain
-- ===========================================================================
--
-- Canonical, additive migration. Creates the governed content foundation for
-- role interviews: a versioned, immutable, human-reviewed package of
-- competencies, fixed core questions, approved probes, evidence dimensions,
-- behavioural anchors, verification rules and prohibited areas.
--
-- Filename note: the version is the next CANONICAL slot after
-- 20260917090000_superadmin_permanent_account_deletion.sql. Repository migration
-- versions deliberately run ahead of the wall clock; only the filename was
-- chosen this way, nothing about the content depends on the date.
--
-- WHAT THIS IS NOT
-- ----------------
--   * It is not an assessment. It scores nobody and produces no result.
--   * It touches no existing table. scp_interview_guide_prompts — the
--     assessment-support interview content — is deliberately untouched and
--     keeps its own separate meaning. So do scp_interview_notes,
--     scp_report_snapshots and every recruitment/Passport/Career Discovery
--     object.
--   * It activates no AI. There is no provider, model, prompt or key here.
--   * It creates no employer-facing surface.
--
-- THE PROHIBITION THAT SHAPES THE SCHEMA
-- --------------------------------------
-- No column in this migration stores a total, a weight, a score, a pass
-- threshold, a ranking, a hire recommendation, a credibility value or a
-- deception probability -- not even dormant, not even unused. The only
-- numbers here are version_number, display_order, an anchor level in 0..4 and
-- a recommended duration in minutes. See the ADR at
-- docs/architecture/adr-interview-intelligence-role-pack-domain.md.
--
-- WHY NEW GUARDS RATHER THAN THE EXISTING GENERIC ONES
-- ----------------------------------------------------
-- Verified against their latest definitions before writing this file:
--
--   scp_guard_version_starts_as_draft()  (20260728181901) accepts 'draft' OR
--     'in_review'. This domain must begin in 'draft' and nothing else.
--
--   scp_guard_published_immutable()      (20260728181422) treats everything
--     outside {draft, in_review} as frozen. This domain's review ladder is
--     draft -> expert_review -> legal_review -> cognitive_review -> published,
--     so that guard would freeze a version the moment it entered review and a
--     reviewer's correction could never be applied.
--
--   scp_guard_child_of_published()       (20260728181803) dispatches on a
--     hardcoded TG_TABLE_NAME list and RETURNS the row unchanged for any table
--     it does not recognise. Attached to these tables it would enforce
--     NOTHING while appearing in pg_trigger as protection. It fails OPEN.
--
-- The three guards below are purpose-built, use this domain's vocabulary, and
-- fail CLOSED. The existing guards are left exactly as they are.
--
-- The status vocabulary itself is NOT invented: it is copied verbatim from
-- scp_role_versions / scp_behaviour_versions (20260802090000), which already
-- carry precisely this ladder.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Fail fast: this migration is meaningless without the competency graph and
-- the content-role model it pins itself to.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.scp_role_versions') IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PRECONDITION: public.scp_role_versions is missing; the Phase 0 competency graph must be applied first.';
  END IF;
  IF to_regclass('public.scp_competency_versions') IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PRECONDITION: public.scp_competency_versions is missing.';
  END IF;
  IF to_regclass('public.scp_behaviour_versions') IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PRECONDITION: public.scp_behaviour_versions is missing.';
  END IF;
  IF to_regclass('public.scp_content_roles') IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PRECONDITION: public.scp_content_roles is missing.';
  END IF;
  IF to_regproc('public.scp_has_content_role') IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PRECONDITION: public.scp_has_content_role() is missing.';
  END IF;
  IF to_regproc('public.is_platform_admin') IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PRECONDITION: public.is_platform_admin() is missing.';
  END IF;
  -- The coexistence contract: the assessment-support interview content must
  -- still be there and is not ours to touch.
  IF to_regclass('public.scp_interview_guide_prompts') IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PRECONDITION: public.scp_interview_guide_prompts is missing; this migration coexists with it and must not be applied to a database that lost it.';
  END IF;
END $$;


-- ###########################################################################
-- SECTION 1 -- Identity and the versioned aggregate
-- ###########################################################################

CREATE TABLE public.scp_interview_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  -- The stable role this package interviews for. RESTRICT: a role that has a
  -- governed interview package is not deletable out from under it.
  role_id uuid NOT NULL REFERENCES public.scp_roles(id) ON DELETE RESTRICT,
  name_sv text NOT NULL,
  name_en text,
  purpose_sv text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_packs IS
  'Stable identity of a governed Role Interview Pack. Carries no content: all '
  'content lives on an immutable version. Distinct from '
  'scp_interview_guide_prompts, which is assessment-support content keyed to a '
  'competency/facet and is NOT part of this domain.';

CREATE INDEX scp_interview_packs_role_idx ON public.scp_interview_packs (role_id);


CREATE TABLE public.scp_interview_pack_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.scp_interview_packs(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),

  -- The review ladder. Vocabulary copied verbatim from scp_role_versions.
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft', 'expert_review', 'legal_review', 'cognitive_review',
      'published', 'suspended', 'retired')),

  -- What may be CLAIMED about this content scientifically. Deliberately
  -- separate from content_status: a package can be fully published as process
  -- content and still be an unvalidated hypothesis. Owner decision 3.
  validation_label text NOT NULL DEFAULT 'pilot_hypothesis'
    CHECK (validation_label IN ('pilot_hypothesis', 'content_validated')),

  locale text NOT NULL CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),

  -- The exact canonical role version this package interviews for. Pinned, so a
  -- later role revision cannot silently change what the questions are about.
  role_version_id uuid NOT NULL
    REFERENCES public.scp_role_versions(id) ON DELETE RESTRICT,

  -- Provenance of the governed source document.
  source_reference text NOT NULL,
  source_document_version text NOT NULL,

  -- Deterministic hash of the whole aggregate, maintained by
  -- scp_interview_pack_content_hash(). A review is bound to the hash it saw.
  content_hash text,

  summary_sv text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at timestamptz,
  suspended_reason text,
  retired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  retired_at timestamptz,
  retired_reason text,

  UNIQUE (pack_id, version_number)
);

COMMENT ON TABLE public.scp_interview_pack_versions IS
  'The immutable versioned aggregate. Content is editable only while '
  'content_status is draft or one of the three review states; from published '
  'onward the row and all its children are frozen and a substantive change '
  'requires a new version. There is no total, weight, threshold or '
  'recommendation column here, and there must never be one.';

COMMENT ON COLUMN public.scp_interview_pack_versions.validation_label IS
  'pilot_hypothesis = content is a considered product hypothesis that has NOT '
  'been empirically validated and supports no predictive claim. Never set to '
  'content_validated without a documented job analysis and expert panel.';

CREATE INDEX scp_interview_pack_versions_pack_idx
  ON public.scp_interview_pack_versions (pack_id, version_number DESC);
CREATE INDEX scp_interview_pack_versions_status_idx
  ON public.scp_interview_pack_versions (content_status);
CREATE INDEX scp_interview_pack_versions_role_version_idx
  ON public.scp_interview_pack_versions (role_version_id);


-- ###########################################################################
-- SECTION 2 -- Competencies and their mapping to canonical constructs
-- ###########################################################################

CREATE TABLE public.scp_interview_pack_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^C[0-9]{1,2}$'),
  display_order integer NOT NULL CHECK (display_order >= 1),
  name_sv text NOT NULL,
  name_en text,
  definition_sv text NOT NULL,
  definition_en text,
  -- What a competent person visibly DOES. Never a trait, never an inference.
  observable_indicators_sv text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_version_id, code),
  UNIQUE (pack_version_id, display_order)
);

COMMENT ON TABLE public.scp_interview_pack_competencies IS
  'The pack''s own governed competency definition (Vaktare C1..C6). It is NOT '
  'a duplicate of scp_competencies: the canonical construct it corresponds to '
  'is recorded, with an explicit relation and rationale, in '
  'scp_interview_pack_competency_map.';


CREATE TABLE public.scp_interview_pack_competency_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_competency_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_competencies(id) ON DELETE RESTRICT,

  -- The EXACT canonical competency version. Pinned by id, never by code.
  competency_version_id uuid NOT NULL
    REFERENCES public.scp_competency_versions(id) ON DELETE RESTRICT,

  -- Optional: the exact observable behaviour version this mapping leans on.
  behaviour_version_id uuid
    REFERENCES public.scp_behaviour_versions(id) ON DELETE RESTRICT,

  -- How the pack competency relates to the canonical one. A pack competency
  -- that spans two canonical competencies is 'broader_than_source' against
  -- each of them -- it is NOT an equivalence.
  relation text NOT NULL CHECK (relation IN (
    'equivalent', 'broader_than_source', 'narrower_than_source',
    'partial_overlap')),

  -- provisional = an expert has not yet confirmed this correspondence. A pack
  -- version with ANY provisional mapping cannot be published.
  mapping_state text NOT NULL DEFAULT 'provisional'
    CHECK (mapping_state IN ('provisional', 'confirmed')),

  rationale_sv text NOT NULL,

  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (pack_competency_id, competency_version_id),
  CHECK ((mapping_state = 'confirmed') = (confirmed_at IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_pack_competency_map IS
  'The explicit mapping artifact required before a pack competency may be '
  'treated as measuring a canonical construct. It exists because Vaktare '
  'C1..C6 are COMPOUND and SCC-01..SCC-12 are atomic: five of the six pack '
  'competencies span two canonical ones, and no source document supplies a '
  'weighting between them. Recording the correspondence as directional and '
  'provisional is what keeps the import from inventing an equivalence.';

CREATE INDEX scp_interview_pack_competency_map_competency_idx
  ON public.scp_interview_pack_competency_map (competency_version_id);


-- ###########################################################################
-- SECTION 3 -- Core questions and everything hanging off them
-- ###########################################################################

CREATE TABLE public.scp_interview_core_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^Q[0-9]{1,2}$'),
  display_order integer NOT NULL CHECK (display_order >= 1),
  question_type text NOT NULL CHECK (question_type IN ('behavioural', 'situational')),

  -- Read verbatim. Generative AI may never rewrite or replace this string in
  -- governed mode; there is no code path in this phase that writes it except
  -- an editor editing a draft.
  prompt_sv text NOT NULL,
  -- NULL on import by design: an English rendering of a governed interview
  -- question is itself governed content and needs its own review pass.
  -- Machine-translating it here would create a second, unreviewed instrument.
  prompt_en text,

  recommended_duration_min_minutes integer
    CHECK (recommended_duration_min_minutes IS NULL OR recommended_duration_min_minutes > 0),
  recommended_duration_max_minutes integer
    CHECK (recommended_duration_max_minutes IS NULL OR recommended_duration_max_minutes > 0),

  -- Which source type an answer to this question IS. An interview statement is
  -- self-reported evidence and is never a verified fact.
  evidence_source_note_sv text,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (pack_version_id, code),
  UNIQUE (pack_version_id, display_order),
  CHECK (
    recommended_duration_min_minutes IS NULL
    OR recommended_duration_max_minutes IS NULL
    OR recommended_duration_min_minutes <= recommended_duration_max_minutes)
);

COMMENT ON TABLE public.scp_interview_core_questions IS
  'The fixed core questions, asked in display_order to every candidate in the '
  'same process and pack version. Order and wording are part of the published '
  'contract.';


CREATE TABLE public.scp_interview_question_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,
  pack_competency_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_competencies(id) ON DELETE RESTRICT,
  -- A situational question legitimately carries several competencies; exactly
  -- one of them is primary.
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, pack_competency_id)
);

COMMENT ON TABLE public.scp_interview_question_competencies IS
  'Which pack competencies a core question gathers evidence for. Carries no '
  'weight column: weighting competencies is forbidden in Phase 1.';

CREATE INDEX scp_interview_question_competencies_competency_idx
  ON public.scp_interview_question_competencies (pack_competency_id);


CREATE TABLE public.scp_interview_approved_probes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  -- NULL = a pack-level general probe, usable after any core question.
  question_id uuid
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,

  -- The permitted purpose. Every probe has one: in governed mode a follow-up
  -- with no approved purpose may not be used at all.
  purpose text NOT NULL CHECK (purpose IN (
    'example',        -- get one specific situation
    'own_role',       -- separate the candidate's part from the team's
    'exact_action',   -- what was actually done, in order
    'reasoning',      -- what information was weighed
    'effect',         -- what the outcome was and how they know
    'reflection',     -- what was learned
    'neutral_check',  -- "have I understood you correctly"
    'correction')),   -- invite the candidate to correct the summary

  -- source_stated: the source document itself labels this probe's purpose.
  -- derived_in_import: the purpose was assigned while importing and is part of
  -- what the expert gate must confirm. Recording which is which keeps the
  -- import honest.
  purpose_provenance text NOT NULL
    CHECK (purpose_provenance IN ('source_stated', 'derived_in_import')),

  wording_sv text NOT NULL,
  wording_en text,
  display_order integer NOT NULL CHECK (display_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- A question-scoped probe must belong to the same version as its question;
  -- enforced by scp_interview_guard_probe_scope() below.
  UNIQUE (pack_version_id, question_id, display_order)
);

COMMENT ON TABLE public.scp_interview_approved_probes IS
  'The ONLY follow-up questions permitted in governed mode. Unrestricted '
  'AI-generated probing is not a feature that exists: a probe must be a row '
  'here, with an approved purpose.';

CREATE INDEX scp_interview_approved_probes_question_idx
  ON public.scp_interview_approved_probes (question_id);


CREATE TABLE public.scp_interview_evidence_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]+$'),
  label_sv text NOT NULL,
  label_en text,
  description_sv text,
  display_order integer NOT NULL CHECK (display_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, code),
  UNIQUE (question_id, display_order)
);

COMMENT ON TABLE public.scp_interview_evidence_dimensions IS
  'What evidence the interviewer should seek for a question -- the CONTENT '
  'definition only. Whether a dimension was present, partial or missing for a '
  'given candidate is runtime evidence and belongs to a later phase; no '
  'candidate data is stored in this domain.';


CREATE TABLE public.scp_interview_rating_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of the two: an anchor belongs either to a question or to a
  -- pack competency, never to both and never to neither.
  question_id uuid
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,
  pack_competency_id uuid
    REFERENCES public.scp_interview_pack_competencies(id) ON DELETE RESTRICT,

  level integer NOT NULL CHECK (level BETWEEN 0 AND 4),
  label_sv text NOT NULL,
  label_en text,
  anchor_sv text NOT NULL,
  anchor_en text,

  -- Level 0 means INSUFFICIENT EVIDENCE, not low competence. It must never be
  -- averaged in, never trigger rejection and never be read as dishonesty.
  -- Encoding it as a constraint makes that true of the data, not merely of the
  -- screen that draws it. This is a permission flag; it holds no number.
  counts_toward_aggregation boolean NOT NULL,

  is_safety_critical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (num_nonnulls(question_id, pack_competency_id) = 1),
  CHECK ((level = 0) = (counts_toward_aggregation = false))
);

COMMENT ON TABLE public.scp_interview_rating_anchors IS
  'Behaviourally anchored levels 0-4. There is no threshold, no cut score and '
  'no mapping from a level to a decision: a level is a human judgement about '
  'described behaviour, recorded with cited evidence, and nothing in this '
  'domain aggregates it.';

COMMENT ON COLUMN public.scp_interview_rating_anchors.counts_toward_aggregation IS
  'False at level 0 by constraint. Source section 6.1: level 0 "far anvandas i '
  'sammanvagning? Nej". Not a weight -- a boolean permission.';

CREATE UNIQUE INDEX scp_interview_rating_anchors_question_level_idx
  ON public.scp_interview_rating_anchors (question_id, level)
  WHERE question_id IS NOT NULL;
CREATE UNIQUE INDEX scp_interview_rating_anchors_competency_level_idx
  ON public.scp_interview_rating_anchors (pack_competency_id, level)
  WHERE pack_competency_id IS NOT NULL;


-- ###########################################################################
-- SECTION 4 -- Verification boundaries and prohibited areas
-- ###########################################################################

CREATE TABLE public.scp_interview_verification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]+$'),
  requirement_sv text NOT NULL,

  -- The source statuses this requirement may legitimately carry. They are kept
  -- SEPARATE on purpose: a candidate-declared fact never silently becomes a
  -- verified one.
  permitted_source_states text[] NOT NULL DEFAULT
    ARRAY['verified', 'candidate_declared', 'partial', 'no_evidence_yet', 'conflicting_facts']::text[],

  interview_action_sv text NOT NULL,
  subsequent_verification_sv text NOT NULL,

  -- What this rule may and may not do to the Security Passport. The default
  -- and only correct answer in Phase 1 is: nothing.
  passport_boundary_sv text NOT NULL,

  display_order integer NOT NULL CHECK (display_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_version_id, code),
  UNIQUE (pack_version_id, display_order),
  CHECK (permitted_source_states <@ ARRAY[
    'verified', 'candidate_declared', 'partial',
    'no_evidence_yet', 'conflicting_facts']::text[])
);

COMMENT ON TABLE public.scp_interview_verification_rules IS
  'Facts, credentials or qualifications that require verification OUTSIDE the '
  'interview. An interview statement is self-reported evidence: this domain '
  'never writes to the Security Passport and never converts a statement into '
  'a verified claim.';


CREATE TABLE public.scp_interview_prohibited_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  area_type text NOT NULL CHECK (area_type IN (
    'capability',      -- a system capability that must not exist
    'inference',       -- an inference nobody may draw
    'topic',           -- a subject that must not be asked about
    'probe_practice')),-- a way of asking that is not permitted
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]+$'),
  statement_sv text NOT NULL,
  rationale_sv text NOT NULL,
  display_order integer NOT NULL CHECK (display_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_version_id, code),
  UNIQUE (pack_version_id, display_order)
);

COMMENT ON TABLE public.scp_interview_prohibited_areas IS
  'Interview topics, inferences and capabilities that must not be used. This '
  'table DOCUMENTS the prohibitions for the interviewer; the prohibitions '
  'themselves are enforced by the absence of any column, function or code path '
  'that could implement them.';


-- ###########################################################################
-- SECTION 5 -- Review records and the append-only audit ledger
-- ###########################################################################

CREATE TABLE public.scp_interview_pack_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  gate text NOT NULL CHECK (gate IN ('expert', 'legal', 'cognitive', 'product')),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),

  -- The exact aggregate this reviewer saw. An approval is worthless if the
  -- content can change underneath it, so publication requires four approvals
  -- AT THE CURRENT HASH. Editing a version after approval invalidates every
  -- gate, by construction rather than by policy.
  content_hash_at_review text NOT NULL,

  decided_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_pack_reviews IS
  'Append-only record of the expert, legal, cognitive and product gates. A '
  'reviewer may never be the author of the version under review, and an '
  'approval binds to the content hash it was given.';

CREATE INDEX scp_interview_pack_reviews_version_idx
  ON public.scp_interview_pack_reviews (pack_version_id, gate, decided_at DESC);


CREATE TABLE public.scp_interview_pack_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A total order over the ledger. `at` cannot provide one: now() is the
  -- transaction timestamp, so several events written by one governed operation
  -- share it exactly and would be unorderable. A sequence is also
  -- non-transactional, so it keeps increasing across rollbacks and a gap is
  -- itself evidence rather than a corruption.
  seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,

  pack_id uuid NOT NULL REFERENCES public.scp_interview_packs(id) ON DELETE RESTRICT,
  pack_version_id uuid REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,

  event text NOT NULL CHECK (event IN (
    'pack_created',
    'version_created',
    'draft_updated',
    'submitted_for_expert_review',
    'expert_review_approved',
    'expert_review_rejected',
    'submitted_for_legal_review',
    'legal_review_approved',
    'legal_review_rejected',
    'submitted_for_cognitive_review',
    'cognitive_review_approved',
    'cognitive_review_rejected',
    'submitted_for_product_approval',
    'product_approved',
    'product_rejected',
    'published',
    'suspended',
    'retired',
    'new_version_created')),

  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  reason text,
  content_hash text,
  source_version text,

  -- Governance metadata only. No candidate ever appears in this domain, so no
  -- candidate data can appear here.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_pack_events IS
  'Append-only governance history. Unlike scp_content_events this table grants '
  'no INSERT to any client role: the only writer is a SECURITY DEFINER RPC, so '
  'a browser cannot forge, backdate or omit an event.';

CREATE INDEX scp_interview_pack_events_pack_idx
  ON public.scp_interview_pack_events (pack_id, seq DESC);
CREATE INDEX scp_interview_pack_events_version_idx
  ON public.scp_interview_pack_events (pack_version_id, seq DESC);


-- ###########################################################################
-- SECTION 6 -- The content hash
-- ###########################################################################
--
-- Deterministic over the whole aggregate. Every field a reviewer reads is in
-- it, in a fixed order, so that "the content I approved" is a checkable claim
-- rather than a promise. Lifecycle columns (status, timestamps, actors) are
-- deliberately EXCLUDED: publishing a version must not change its content
-- hash, or every approval would be invalidated by the act of publishing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scp_interview_pack_content_hash(_pack_version_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT md5(
    coalesce((
      SELECT string_agg(
        concat_ws('|', v.locale, v.role_version_id::text, v.source_reference,
                       v.source_document_version, coalesce(v.summary_sv, '')),
        E'\n')
      FROM public.scp_interview_pack_versions v
      WHERE v.id = _pack_version_id), '')
    || E'\n#competencies\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', c.code, c.display_order::text, c.name_sv,
                       coalesce(c.name_en, ''), c.definition_sv,
                       coalesce(c.definition_en, ''),
                       array_to_string(c.observable_indicators_sv, '~')),
        E'\n' ORDER BY c.display_order)
      FROM public.scp_interview_pack_competencies c
      WHERE c.pack_version_id = _pack_version_id), '')
    || E'\n#competency_map\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', c.code, m.competency_version_id::text,
                       coalesce(m.behaviour_version_id::text, ''),
                       m.relation, m.mapping_state, m.rationale_sv),
        E'\n' ORDER BY c.display_order, m.competency_version_id)
      FROM public.scp_interview_pack_competency_map m
      JOIN public.scp_interview_pack_competencies c ON c.id = m.pack_competency_id
      WHERE c.pack_version_id = _pack_version_id), '')
    || E'\n#questions\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', q.code, q.display_order::text, q.question_type,
                       q.prompt_sv, coalesce(q.prompt_en, ''),
                       coalesce(q.recommended_duration_min_minutes::text, ''),
                       coalesce(q.recommended_duration_max_minutes::text, ''),
                       coalesce(q.evidence_source_note_sv, '')),
        E'\n' ORDER BY q.display_order)
      FROM public.scp_interview_core_questions q
      WHERE q.pack_version_id = _pack_version_id), '')
    || E'\n#question_competencies\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', q.code, c.code, qc.is_primary::text),
        E'\n' ORDER BY q.display_order, c.display_order)
      FROM public.scp_interview_question_competencies qc
      JOIN public.scp_interview_core_questions q ON q.id = qc.question_id
      JOIN public.scp_interview_pack_competencies c ON c.id = qc.pack_competency_id
      WHERE q.pack_version_id = _pack_version_id), '')
    || E'\n#probes\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', coalesce(q.code, '*'), p.display_order::text, p.purpose,
                       p.purpose_provenance, p.wording_sv, coalesce(p.wording_en, '')),
        E'\n' ORDER BY coalesce(q.display_order, 0), p.display_order)
      FROM public.scp_interview_approved_probes p
      LEFT JOIN public.scp_interview_core_questions q ON q.id = p.question_id
      WHERE p.pack_version_id = _pack_version_id), '')
    || E'\n#dimensions\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', q.code, d.display_order::text, d.code, d.label_sv,
                       coalesce(d.label_en, ''), coalesce(d.description_sv, '')),
        E'\n' ORDER BY q.display_order, d.display_order)
      FROM public.scp_interview_evidence_dimensions d
      JOIN public.scp_interview_core_questions q ON q.id = d.question_id
      WHERE q.pack_version_id = _pack_version_id), '')
    || E'\n#anchors\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', coalesce(q.code, c.code), a.level::text, a.label_sv,
                       a.anchor_sv, a.counts_toward_aggregation::text,
                       a.is_safety_critical::text),
        E'\n' ORDER BY coalesce(q.display_order, 1000 + c.display_order), a.level)
      FROM public.scp_interview_rating_anchors a
      LEFT JOIN public.scp_interview_core_questions q ON q.id = a.question_id
      LEFT JOIN public.scp_interview_pack_competencies c ON c.id = a.pack_competency_id
      WHERE coalesce(q.pack_version_id, c.pack_version_id) = _pack_version_id), '')
    || E'\n#verification\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', r.display_order::text, r.code, r.requirement_sv,
                       array_to_string(r.permitted_source_states, '~'),
                       r.interview_action_sv, r.subsequent_verification_sv,
                       r.passport_boundary_sv),
        E'\n' ORDER BY r.display_order)
      FROM public.scp_interview_verification_rules r
      WHERE r.pack_version_id = _pack_version_id), '')
    || E'\n#prohibited\n' || coalesce((
      SELECT string_agg(
        concat_ws('|', pa.display_order::text, pa.area_type, pa.code,
                       pa.statement_sv, pa.rationale_sv),
        E'\n' ORDER BY pa.display_order)
      FROM public.scp_interview_prohibited_areas pa
      WHERE pa.pack_version_id = _pack_version_id), '')
  );
$$;

REVOKE ALL ON FUNCTION public.scp_interview_pack_content_hash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_pack_content_hash(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_pack_content_hash(uuid) IS
  'Deterministic hash of a pack version''s complete content. Excludes every '
  'lifecycle column, so publishing does not change it and an approval survives '
  'the transition it authorised.';


-- ###########################################################################
-- SECTION 7 -- Authority helpers
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_interview_can_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
       public.is_platform_admin(_user_id)
    OR public.scp_has_content_role(_user_id, 'editor')
    OR public.scp_has_content_role(_user_id, 'reviewer')
    OR public.scp_has_content_role(_user_id, 'publisher'));
$$;

REVOKE ALL ON FUNCTION public.scp_interview_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_can_read(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_can_read(uuid) IS
  'Who may SEE governed interview-pack content. Platform content roles and '
  'platform admins only. An employer member, a candidate and anon are all '
  'false, in Phase 1 and until an owner decision says otherwise.';


-- Deliberately NOT scp_can_author(): that function treats a platform admin as
-- an author, which is right for the assessment domain but wrong here. Phase 1
-- separates oversight from authorship, so admin reads and editors write.
CREATE OR REPLACE FUNCTION public.scp_interview_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND public.scp_has_content_role(_user_id, 'editor');
$$;

REVOKE ALL ON FUNCTION public.scp_interview_can_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_can_edit(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_interview_version_is_editable(_pack_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scp_interview_pack_versions v
     WHERE v.id = _pack_version_id
       AND v.content_status IN ('draft', 'expert_review', 'legal_review', 'cognitive_review'));
$$;

REVOKE ALL ON FUNCTION public.scp_interview_version_is_editable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_version_is_editable(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_version_is_editable(uuid) IS
  'True while a version is a draft or under review. False from published '
  'onward, and false for a version that does not exist -- so it fails closed.';


-- ###########################################################################
-- SECTION 8 -- Guards. Purpose-built, this domain's vocabulary, fail closed.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 8.1  A version begins as 'draft'. Not 'in_review', not anything else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_version_starts_as_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.content_status <> 'draft' THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_MUST_START_AS_DRAFT: a new interview pack version must be inserted with content_status = "draft", not "%". Publication is reached through the review ladder, never by insert.',
      NEW.content_status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL
     OR NEW.suspended_at IS NOT NULL OR NEW.retired_at IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_MUST_START_AS_DRAFT: a new interview pack version may not be inserted with lifecycle attribution already set.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_version_starts_as_draft() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_versions_starts_as_draft
  BEFORE INSERT ON public.scp_interview_pack_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_version_starts_as_draft();


-- ---------------------------------------------------------------------------
-- 8.2  Status transitions, and immutability from 'published' onward.
--
--      Two things at once, because they are one rule: which moves are legal,
--      and what may still change after each move. A transition into a
--      governed state is additionally refused unless the governed RPC set the
--      transaction-local marker -- so a client with UPDATE rights on the table
--      still cannot walk a version up the ladder by hand.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_version_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Columns that a governed transition is allowed to write. Everything else on
  -- this table is CONTENT and is frozen once the version leaves the editable
  -- states. Named explicitly for THIS table: a shared list from another domain
  -- is how a column silently becomes writable.
  _lifecycle text[] := ARRAY[
    'content_status', 'validation_label', 'content_hash', 'updated_at',
    'published_by', 'published_at',
    'suspended_by', 'suspended_at', 'suspended_reason',
    'retired_by', 'retired_at', 'retired_reason'];
  _editable  text[] := ARRAY['draft', 'expert_review', 'legal_review', 'cognitive_review'];
  _governed boolean := coalesce(current_setting('scp_interview.governed_transition', true), '') = 'on';
  _col text;
  _old jsonb := to_jsonb(OLD);
  _new jsonb := to_jsonb(NEW);
  _legal boolean;
BEGIN
  -- Identity never changes, in any state.
  IF NEW.pack_id IS DISTINCT FROM OLD.pack_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_VERSION_IDENTITY: pack_id and version_number are immutable.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.content_status IS DISTINCT FROM OLD.content_status THEN
    _legal := CASE OLD.content_status
      WHEN 'draft'            THEN NEW.content_status = 'expert_review'
      WHEN 'expert_review'    THEN NEW.content_status IN ('legal_review', 'draft')
      WHEN 'legal_review'     THEN NEW.content_status IN ('cognitive_review', 'draft')
      WHEN 'cognitive_review' THEN NEW.content_status IN ('published', 'draft')
      WHEN 'published'        THEN NEW.content_status IN ('suspended', 'retired')
      WHEN 'suspended'        THEN NEW.content_status IN ('published', 'retired')
      WHEN 'retired'          THEN false
      ELSE false
    END;

    IF NOT _legal THEN
      RAISE EXCEPTION
        'SCP_INTERVIEW_ILLEGAL_TRANSITION: "%" -> "%" is not a permitted interview pack version transition.',
        OLD.content_status, NEW.content_status USING ERRCODE = 'check_violation';
    END IF;

    IF NOT _governed THEN
      RAISE EXCEPTION
        'SCP_INTERVIEW_UNGOVERNED_TRANSITION: content_status may only be changed by a governed RPC (submit, review, publish, suspend, retire), never by a direct table update.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Content is frozen once the version has left the editable states. A
  -- correction after publication requires a NEW VERSION.
  IF NOT (OLD.content_status = ANY (_editable)) THEN
    FOR _col IN SELECT jsonb_object_keys(_old) LOOP
      IF _col = ANY (_lifecycle) THEN CONTINUE; END IF;
      IF (_old -> _col) IS DISTINCT FROM (_new -> _col) THEN
        RAISE EXCEPTION
          'SCP_INTERVIEW_PUBLISHED_IMMUTABLE: column "%" cannot be modified once content_status is "%". Create a new version instead.',
          _col, OLD.content_status USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_version_transition() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_versions_transition
  BEFORE UPDATE ON public.scp_interview_pack_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_version_transition();


-- ---------------------------------------------------------------------------
-- 8.3  Governed content is never deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_no_version_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.content_status <> 'draft' THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_NO_DELETE: an interview pack version that has entered review or publication is never deleted (status "%"). Retire it instead.',
      OLD.content_status USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_no_version_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_versions_no_delete
  BEFORE DELETE ON public.scp_interview_pack_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_no_version_delete();


-- ---------------------------------------------------------------------------
-- 8.4  Child immutability.
--
--      The replacement for scp_guard_child_of_published(). The difference that
--      matters is the ELSE branch: an unknown table RAISES rather than being
--      waved through, so attaching this trigger to a table it has not been
--      taught about is a loud failure instead of a silent no-op.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_child_of_locked_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _version_id uuid;
  _status text;
BEGIN
  _row := COALESCE(NEW, OLD);

  CASE TG_TABLE_NAME
    WHEN 'scp_interview_pack_competencies',
         'scp_interview_core_questions',
         'scp_interview_approved_probes',
         'scp_interview_verification_rules',
         'scp_interview_prohibited_areas' THEN
      _version_id := _row.pack_version_id;

    WHEN 'scp_interview_pack_competency_map' THEN
      SELECT c.pack_version_id INTO _version_id
        FROM public.scp_interview_pack_competencies c
       WHERE c.id = _row.pack_competency_id;

    WHEN 'scp_interview_question_competencies' THEN
      SELECT q.pack_version_id INTO _version_id
        FROM public.scp_interview_core_questions q
       WHERE q.id = _row.question_id;

    WHEN 'scp_interview_evidence_dimensions' THEN
      SELECT q.pack_version_id INTO _version_id
        FROM public.scp_interview_core_questions q
       WHERE q.id = _row.question_id;

    WHEN 'scp_interview_rating_anchors' THEN
      SELECT coalesce(q.pack_version_id, c.pack_version_id) INTO _version_id
        FROM (SELECT 1) _
        LEFT JOIN public.scp_interview_core_questions q ON q.id = _row.question_id
        LEFT JOIN public.scp_interview_pack_competencies c ON c.id = _row.pack_competency_id;

    ELSE
      RAISE EXCEPTION
        'SCP_INTERVIEW_GUARD_UNKNOWN_TABLE: scp_interview_guard_child_of_locked_parent() was attached to "%", which it does not know how to resolve to a pack version. Refusing rather than allowing an unguarded write.',
        TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END CASE;

  IF _version_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_GUARD_UNRESOLVED_PARENT: could not resolve the owning pack version for a row in "%". Refusing the write.',
      TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;

  SELECT v.content_status INTO _status
    FROM public.scp_interview_pack_versions v
   WHERE v.id = _version_id;

  IF _status IS NULL THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_GUARD_UNRESOLVED_PARENT: pack version % does not exist.',
      _version_id USING ERRCODE = 'check_violation';
  END IF;

  IF _status NOT IN ('draft', 'expert_review', 'legal_review', 'cognitive_review') THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PUBLISHED_IMMUTABLE: % cannot be modified because its pack version is "%". Create a new version instead.',
      TG_TABLE_NAME, _status USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_child_of_locked_parent() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_competencies_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_pack_competencies
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_pack_competency_map_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_pack_competency_map
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_core_questions_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_core_questions
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_question_competencies_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_question_competencies
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_approved_probes_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_approved_probes
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_evidence_dimensions_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_evidence_dimensions
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_rating_anchors_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_rating_anchors
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_verification_rules_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_verification_rules
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();
CREATE TRIGGER scp_interview_prohibited_areas_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_prohibited_areas
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_child_of_locked_parent();


-- ---------------------------------------------------------------------------
-- 8.5  A probe scoped to a question must belong to that question's version.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_probe_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _question_version uuid;
BEGIN
  IF NEW.question_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT q.pack_version_id INTO _question_version
    FROM public.scp_interview_core_questions q WHERE q.id = NEW.question_id;
  IF _question_version IS NULL OR _question_version <> NEW.pack_version_id THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PROBE_SCOPE: an approved probe must belong to the same pack version as the question it is attached to.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_probe_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_approved_probes_scope
  BEFORE INSERT OR UPDATE ON public.scp_interview_approved_probes
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_probe_scope();


-- ---------------------------------------------------------------------------
-- 8.6  A question's competencies must come from the same version.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_question_competency_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _qv uuid;
  _cv uuid;
BEGIN
  SELECT q.pack_version_id INTO _qv
    FROM public.scp_interview_core_questions q WHERE q.id = NEW.question_id;
  SELECT c.pack_version_id INTO _cv
    FROM public.scp_interview_pack_competencies c WHERE c.id = NEW.pack_competency_id;
  IF _qv IS NULL OR _cv IS NULL OR _qv <> _cv THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_QUESTION_COMPETENCY_SCOPE: a question may only reference a competency from its own pack version.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_question_competency_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_question_competencies_scope
  BEFORE INSERT OR UPDATE ON public.scp_interview_question_competencies
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_question_competency_scope();


-- ---------------------------------------------------------------------------
-- 8.7  Reviews and events are append-only. No client may rewrite history.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_reviews_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'SCP_INTERVIEW_REVIEW_APPEND_ONLY: a review record is never updated or deleted. Record a further review instead.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_reviews_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.scp_interview_pack_reviews
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_reviews_append_only();


CREATE OR REPLACE FUNCTION public.scp_interview_guard_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'SCP_INTERVIEW_EVENT_APPEND_ONLY: governance history is never updated or deleted.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_events_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_events_append_only
  BEFORE UPDATE OR DELETE ON public.scp_interview_pack_events
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_events_append_only();


-- ---------------------------------------------------------------------------
-- 8.8  A reviewer is never the author of what they review.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_reviewer_not_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _author uuid;
BEGIN
  SELECT v.created_by INTO _author
    FROM public.scp_interview_pack_versions v WHERE v.id = NEW.pack_version_id;
  IF _author IS NOT NULL AND _author = NEW.reviewer_id THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_SELF_REVIEW: the author of a pack version may not review it. Review gates exist to be a second pair of eyes.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_reviewer_not_author() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_reviews_not_author
  BEFORE INSERT ON public.scp_interview_pack_reviews
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_reviewer_not_author();


-- ###########################################################################
-- SECTION 9 -- Validation: what makes a pack version complete
-- ###########################################################################
--
-- Returns one row per blocking reason. An empty result means publishable.
-- The publish RPC calls this INSIDE the publishing transaction, so a pack that
-- is incomplete, unmapped or unapproved cannot become published even for an
-- instant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scp_interview_pack_validate(_pack_version_id uuid)
RETURNS TABLE (code text, severity text, message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
  _hash text;
  _gate text;
BEGIN
  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'VERSION_NOT_FOUND'::text, 'blocking'::text,
      'The pack version does not exist.'::text;
    RETURN;
  END IF;

  -- The pinned role version must still resolve.
  IF NOT EXISTS (SELECT 1 FROM public.scp_role_versions r WHERE r.id = _v.role_version_id) THEN
    RETURN QUERY SELECT 'ROLE_VERSION_MISSING'::text, 'blocking'::text,
      'The pinned role version no longer exists.'::text;
  END IF;

  -- ---- competencies -------------------------------------------------------
  IF (SELECT count(*) FROM public.scp_interview_pack_competencies c
       WHERE c.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_COMPETENCIES'::text, 'blocking'::text,
      'The pack defines no competencies.'::text;
  END IF;

  RETURN QUERY
    SELECT 'COMPETENCY_WITHOUT_INDICATORS', 'blocking',
           format('Competency %s has no observable indicators.', c.code)
      FROM public.scp_interview_pack_competencies c
     WHERE c.pack_version_id = _pack_version_id
       AND coalesce(array_length(c.observable_indicators_sv, 1), 0) = 0;

  RETURN QUERY
    SELECT 'COMPETENCY_UNMAPPED', 'blocking',
           format('Competency %s is not mapped to any canonical competency version.', c.code)
      FROM public.scp_interview_pack_competencies c
     WHERE c.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_pack_competency_map m
                        WHERE m.pack_competency_id = c.id);

  -- The ambiguity gate. A provisional mapping is an unconfirmed scientific
  -- claim, and an unconfirmed scientific claim does not get published.
  RETURN QUERY
    SELECT 'COMPETENCY_MAPPING_PROVISIONAL', 'blocking',
           format('The mapping from %s to canonical competency versions is still provisional and must be confirmed by expert review.', c.code)
      FROM public.scp_interview_pack_competencies c
     WHERE c.pack_version_id = _pack_version_id
       AND EXISTS (SELECT 1 FROM public.scp_interview_pack_competency_map m
                    WHERE m.pack_competency_id = c.id AND m.mapping_state = 'provisional');

  -- ---- questions ----------------------------------------------------------
  IF (SELECT count(*) FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_QUESTIONS'::text, 'blocking'::text,
      'The pack defines no core questions.'::text;
  END IF;

  -- display_order must be a gapless 1..n.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT q.display_order,
             row_number() OVER (ORDER BY q.display_order) AS expected
        FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _pack_version_id) t
     WHERE t.display_order <> t.expected) THEN
    RETURN QUERY SELECT 'QUESTION_ORDER_NOT_CONTIGUOUS'::text, 'blocking'::text,
      'Core question display_order must run 1..n with no gaps and no duplicates.'::text;
  END IF;

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_COMPETENCY', 'blocking',
           format('Question %s is not linked to any competency.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_question_competencies qc
                        WHERE qc.question_id = q.id);

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_PRIMARY_COMPETENCY', 'blocking',
           format('Question %s has no primary competency.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_question_competencies qc
                        WHERE qc.question_id = q.id AND qc.is_primary);

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_EVIDENCE_DIMENSION', 'blocking',
           format('Question %s defines no evidence dimensions.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_evidence_dimensions d
                        WHERE d.question_id = q.id);

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_PROBE', 'blocking',
           format('Question %s has no approved probes, so an interviewer has no permitted way to follow up.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_approved_probes p
                        WHERE p.question_id = q.id);

  -- Every question needs the complete 0..4 anchor set. Five rows, levels 0-4.
  RETURN QUERY
    SELECT 'QUESTION_ANCHOR_SET_INCOMPLETE', 'blocking',
           format('Question %s must define exactly one anchor for each level 0,1,2,3,4 (found %s).',
                  q.code,
                  (SELECT count(*) FROM public.scp_interview_rating_anchors a WHERE a.question_id = q.id))
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND (SELECT count(DISTINCT a.level) FROM public.scp_interview_rating_anchors a
             WHERE a.question_id = q.id) <> 5;

  -- ---- verification and prohibitions --------------------------------------
  IF (SELECT count(*) FROM public.scp_interview_verification_rules r
       WHERE r.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_VERIFICATION_RULES'::text, 'blocking'::text,
      'The pack states no verification boundaries, so nothing distinguishes an interview statement from a verified fact.'::text;
  END IF;

  IF (SELECT count(*) FROM public.scp_interview_prohibited_areas p
       WHERE p.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_PROHIBITED_AREAS'::text, 'blocking'::text,
      'The pack states no prohibited areas.'::text;
  END IF;

  -- ---- review gates, bound to the current content hash --------------------
  _hash := public.scp_interview_pack_content_hash(_pack_version_id);

  FOREACH _gate IN ARRAY ARRAY['expert', 'legal', 'cognitive', 'product'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.scp_interview_pack_reviews rv
       WHERE rv.pack_version_id = _pack_version_id
         AND rv.gate = _gate
         AND rv.decision = 'approved'
         AND rv.content_hash_at_review = _hash) THEN
      RETURN QUERY SELECT
        ('REVIEW_GATE_' || upper(_gate) || '_NOT_APPROVED')::text,
        'blocking'::text,
        format('The %s review gate has not been approved for the current content. If it was approved earlier, the content has changed since and must be reviewed again.', _gate);
    END IF;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_pack_validate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_pack_validate(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_pack_validate(uuid) IS
  'Every reason this pack version cannot be published, as rows. Empty means '
  'publishable. Called by the publish RPC inside the publishing transaction, '
  'and by the admin UI to show a publisher the blocking reasons before they '
  'try.';


-- ###########################################################################
-- SECTION 10 -- The append-only event writer
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_interview_record_event(
  _pack_id uuid,
  _pack_version_id uuid,
  _event text,
  _previous_status text,
  _new_status text,
  _reason text,
  _content_hash text,
  _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.scp_interview_pack_events
    (pack_id, pack_version_id, event, actor_id, previous_status, new_status,
     reason, content_hash, metadata)
  VALUES
    (_pack_id, _pack_version_id, _event, auth.uid(), _previous_status, _new_status,
     _reason, _content_hash, coalesce(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Not granted to authenticated: the audit ledger has no client writer at all.
-- Every caller below is itself a SECURITY DEFINER function in this schema.
REVOKE ALL ON FUNCTION public.scp_interview_record_event(uuid, uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_interview_record_event(uuid, uuid, text, text, text, text, text, jsonb) TO service_role;


-- ###########################################################################
-- SECTION 11 -- The governed lifecycle RPCs
-- ###########################################################################
--
-- Every one of them authorises itself. None of them trusts the caller to have
-- been checked upstream, because a server function, a browser and a psql
-- session all arrive here the same way.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scp_interview_create_pack(
  _slug text,
  _role_id uuid,
  _name_sv text,
  _purpose_sv text,
  _name_en text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_EDITOR: creating a role interview pack requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _slug IS NULL OR btrim(_slug) = '' OR _slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_INVALID_SLUG: slug must be lower-case letters, digits and hyphens.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_roles r WHERE r.id = _role_id) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_ROLE_NOT_FOUND: no such role.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, name_en, purpose_sv, created_by)
  VALUES (btrim(_slug), _role_id, _name_sv, _name_en, _purpose_sv, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_interview_record_event(
    _id, NULL, 'pack_created', NULL, NULL, NULL, NULL,
    jsonb_build_object('slug', btrim(_slug)));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_create_pack(text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_create_pack(text, uuid, text, text, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_interview_create_version(
  _pack_id uuid,
  _locale text,
  _role_version_id uuid,
  _source_reference text,
  _source_document_version text,
  _summary_sv text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _next integer;
  _is_first boolean;
BEGIN
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_EDITOR: creating a pack version requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p WHERE p.id = _pack_id) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PACK_NOT_FOUND: no such pack.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_role_versions r WHERE r.id = _role_version_id) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_ROLE_VERSION_NOT_FOUND: the pinned role version does not exist.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One open draft at a time. Two concurrent drafts of the same pack is how a
  -- reviewer ends up approving the one that never ships.
  IF EXISTS (
    SELECT 1 FROM public.scp_interview_pack_versions v
     WHERE v.pack_id = _pack_id
       AND v.content_status IN ('draft', 'expert_review', 'legal_review', 'cognitive_review')) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_OPEN_VERSION_EXISTS: this pack already has a version in draft or review. Finish or retire it before starting another.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(v.version_number), 0) + 1,
         count(*) = 0
    INTO _next, _is_first
    FROM public.scp_interview_pack_versions v WHERE v.pack_id = _pack_id;

  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, content_status, locale, role_version_id,
     source_reference, source_document_version, summary_sv, created_by)
  VALUES
    (_pack_id, _next, 'draft', _locale, _role_version_id,
     _source_reference, _source_document_version, _summary_sv, auth.uid())
  RETURNING id INTO _id;

  UPDATE public.scp_interview_pack_versions
     SET content_hash = public.scp_interview_pack_content_hash(_id)
   WHERE id = _id;

  PERFORM public.scp_interview_record_event(
    _pack_id, _id,
    CASE WHEN _is_first THEN 'version_created' ELSE 'new_version_created' END,
    NULL, 'draft', NULL, public.scp_interview_pack_content_hash(_id),
    jsonb_build_object('version_number', _next, 'source_document_version', _source_document_version));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_create_version(uuid, text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_create_version(uuid, text, uuid, text, text, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Recompute the hash after a content edit and record that the draft moved.
-- The UI calls this once per save, not once per row, so the audit trail reads
-- as a human's edit rather than as a hundred column writes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_touch_draft(
  _pack_version_id uuid,
  _summary text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
  _hash text;
BEGIN
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_EDITOR: editing a pack version requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_interview_version_is_editable(_pack_version_id) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PUBLISHED_IMMUTABLE: version is "%" and can no longer be edited.', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  _hash := public.scp_interview_pack_content_hash(_pack_version_id);

  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions
     SET content_hash = _hash, updated_at = now()
   WHERE id = _pack_version_id;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _pack_version_id, 'draft_updated',
    _v.content_status, _v.content_status, _summary, _hash, '{}'::jsonb);

  RETURN _hash;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_touch_draft(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_touch_draft(uuid, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Submit for a named gate. Moves the status where the ladder has a state for
-- it; the product gate has no status of its own (see the ADR) and is recorded
-- while the version sits in cognitive_review.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_submit_for_review(
  _pack_version_id uuid,
  _gate text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
  _hash text;
  _target text;
  _required_prior text;
  _event text;
BEGIN
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_EDITOR: submitting for review requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _gate NOT IN ('expert', 'legal', 'cognitive', 'product') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_UNKNOWN_GATE: "%".', _gate USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  _hash := public.scp_interview_pack_content_hash(_pack_version_id);

  SELECT t.target, t.prior, t.event INTO _target, _required_prior, _event
    FROM (VALUES
      ('expert',    'expert_review',    'draft',            'submitted_for_expert_review'),
      ('legal',     'legal_review',     'expert_review',    'submitted_for_legal_review'),
      ('cognitive', 'cognitive_review', 'legal_review',     'submitted_for_cognitive_review'),
      ('product',   'cognitive_review', 'cognitive_review', 'submitted_for_product_approval')
    ) AS t(gate, target, prior, event)
   WHERE t.gate = _gate;

  IF _v.content_status <> _required_prior THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_GATE_OUT_OF_ORDER: the % gate is reached from "%", but this version is "%". The review ladder cannot be skipped.',
      _gate, _required_prior, _v.content_status USING ERRCODE = 'check_violation';
  END IF;

  -- Reaching a later gate requires the previous one approved at this hash.
  IF _gate = 'legal' AND NOT EXISTS (
      SELECT 1 FROM public.scp_interview_pack_reviews r
       WHERE r.pack_version_id = _pack_version_id AND r.gate = 'expert'
         AND r.decision = 'approved' AND r.content_hash_at_review = _hash) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_GATE_NOT_APPROVED: the expert gate is not approved for the current content.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _gate = 'cognitive' AND NOT EXISTS (
      SELECT 1 FROM public.scp_interview_pack_reviews r
       WHERE r.pack_version_id = _pack_version_id AND r.gate = 'legal'
         AND r.decision = 'approved' AND r.content_hash_at_review = _hash) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_GATE_NOT_APPROVED: the legal gate is not approved for the current content.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _gate = 'product' AND NOT EXISTS (
      SELECT 1 FROM public.scp_interview_pack_reviews r
       WHERE r.pack_version_id = _pack_version_id AND r.gate = 'cognitive'
         AND r.decision = 'approved' AND r.content_hash_at_review = _hash) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_GATE_NOT_APPROVED: the cognitive gate is not approved for the current content.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _target <> _v.content_status THEN
    PERFORM set_config('scp_interview.governed_transition', 'on', true);
    UPDATE public.scp_interview_pack_versions
       SET content_status = _target, content_hash = _hash, updated_at = now()
     WHERE id = _pack_version_id;
    PERFORM set_config('scp_interview.governed_transition', 'off', true);
  ELSE
    PERFORM set_config('scp_interview.governed_transition', 'on', true);
    UPDATE public.scp_interview_pack_versions
       SET content_hash = _hash, updated_at = now()
     WHERE id = _pack_version_id;
    PERFORM set_config('scp_interview.governed_transition', 'off', true);
  END IF;

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _pack_version_id, _event, _v.content_status, _target, NULL, _hash,
    jsonb_build_object('gate', _gate));

  RETURN _target;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_submit_for_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_submit_for_review(uuid, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Record a review decision. A rejection sends the version back to draft.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_record_review(
  _pack_version_id uuid,
  _gate text,
  _decision text,
  _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
  _hash text;
  _id uuid;
  _event text;
  _new_status text;
  _expected_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_has_content_role(auth.uid(), 'reviewer') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_REVIEWER: recording a review gate requires the platform content reviewer role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _gate NOT IN ('expert', 'legal', 'cognitive', 'product') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_UNKNOWN_GATE: "%".', _gate USING ERRCODE = 'check_violation';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_UNKNOWN_DECISION: "%".', _decision USING ERRCODE = 'check_violation';
  END IF;
  IF _rationale IS NULL OR btrim(_rationale) = '' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_RATIONALE_REQUIRED: a review decision must carry a written rationale.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  _expected_status := CASE _gate
    WHEN 'expert' THEN 'expert_review'
    WHEN 'legal' THEN 'legal_review'
    ELSE 'cognitive_review' END;

  IF _v.content_status <> _expected_status THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_GATE_NOT_OPEN: the % gate is reviewed while the version is "%", but it is "%". Submit it for that gate first.',
      _gate, _expected_status, _v.content_status USING ERRCODE = 'check_violation';
  END IF;

  _hash := public.scp_interview_pack_content_hash(_pack_version_id);

  INSERT INTO public.scp_interview_pack_reviews
    (pack_version_id, gate, decision, reviewer_id, rationale, content_hash_at_review)
  VALUES (_pack_version_id, _gate, _decision, auth.uid(), btrim(_rationale), _hash)
  RETURNING id INTO _id;

  _event := _gate || CASE WHEN _gate = 'product' THEN '' ELSE '_review' END
          || CASE _decision WHEN 'approved' THEN '_approved' ELSE '_rejected' END;

  IF _decision = 'rejected' THEN
    _new_status := 'draft';
    PERFORM set_config('scp_interview.governed_transition', 'on', true);
    UPDATE public.scp_interview_pack_versions
       SET content_status = 'draft', updated_at = now()
     WHERE id = _pack_version_id;
    PERFORM set_config('scp_interview.governed_transition', 'off', true);
  ELSE
    _new_status := _v.content_status;
  END IF;

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _pack_version_id, _event, _v.content_status, _new_status,
    btrim(_rationale), _hash, jsonb_build_object('gate', _gate, 'review_id', _id));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_record_review(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_record_review(uuid, text, text, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Publish. Transactional and fail-closed: validation runs inside the same
-- transaction that would flip the status, so a partial or unapproved pack
-- never becomes published, not even momentarily.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_publish_version(
  _pack_version_id uuid,
  _reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
  _hash text;
  _blockers text;
  _blocker_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_PUBLISHER: publishing requires the platform publisher role. An editor cannot publish their own work.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  IF _v.content_status <> 'cognitive_review' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_READY_TO_PUBLISH: a version is published from "cognitive_review", not from "%".',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', code, message), E'\n' ORDER BY code)
    INTO _blocker_count, _blockers
    FROM public.scp_interview_pack_validate(_pack_version_id)
   WHERE severity = 'blocking';

  IF _blocker_count > 0 THEN
    RAISE EXCEPTION E'SCP_INTERVIEW_PUBLISH_BLOCKED: this pack version is not complete or not fully approved.\n%',
      _blockers USING ERRCODE = 'check_violation';
  END IF;

  _hash := public.scp_interview_pack_content_hash(_pack_version_id);

  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions
     SET content_status = 'published',
         content_hash   = _hash,
         published_by   = auth.uid(),
         published_at   = now(),
         updated_at     = now()
   WHERE id = _pack_version_id;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _pack_version_id, 'published', _v.content_status, 'published',
    _reason, _hash,
    jsonb_build_object('validation_label', _v.validation_label,
                       'version_number', _v.version_number));

  RETURN _hash;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_publish_version(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_publish_version(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_publish_version(uuid, text) IS
  'The ONLY path to published. Requires the publisher role, the cognitive '
  'review state, and an empty result from scp_interview_pack_validate() -- '
  'which includes all four review gates approved at the CURRENT content hash.';


CREATE OR REPLACE FUNCTION public.scp_interview_suspend_version(
  _pack_version_id uuid,
  _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_PUBLISHER: suspending requires the platform publisher role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_REASON_REQUIRED: suspension must carry a reason.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status <> 'published' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_PUBLISHED: only a published version can be suspended (this one is "%").',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions
     SET content_status = 'suspended', suspended_by = auth.uid(),
         suspended_at = now(), suspended_reason = btrim(_reason), updated_at = now()
   WHERE id = _pack_version_id;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _pack_version_id, 'suspended', 'published', 'suspended',
    btrim(_reason), _v.content_hash, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_suspend_version(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_suspend_version(uuid, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_interview_retire_version(
  _pack_version_id uuid,
  _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_PUBLISHER: retiring requires the platform publisher role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_REASON_REQUIRED: retirement must carry a reason.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status NOT IN ('published', 'suspended') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_RETIRABLE: only a published or suspended version is retired (this one is "%").',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions
     SET content_status = 'retired', retired_by = auth.uid(),
         retired_at = now(), retired_reason = btrim(_reason), updated_at = now()
   WHERE id = _pack_version_id;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _pack_version_id, 'retired', _v.content_status, 'retired',
    btrim(_reason), _v.content_hash, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_retire_version(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_retire_version(uuid, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Confirm a provisional competency mapping. Reviewer authority, because it is
-- a scientific claim rather than a content edit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_confirm_competency_mapping(
  _mapping_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version_id uuid;
  _pack_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_has_content_role(auth.uid(), 'reviewer') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_REVIEWER: confirming a competency mapping requires the platform content reviewer role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.pack_version_id, v.pack_id INTO _version_id, _pack_id
    FROM public.scp_interview_pack_competency_map m
    JOIN public.scp_interview_pack_competencies c ON c.id = m.pack_competency_id
    JOIN public.scp_interview_pack_versions v ON v.id = c.pack_version_id
   WHERE m.id = _mapping_id;

  IF _version_id IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_MAPPING_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_interview_version_is_editable(_version_id) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PUBLISHED_IMMUTABLE: the mapping belongs to a version that is no longer editable.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_interview_pack_competency_map
     SET mapping_state = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
   WHERE id = _mapping_id;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_confirm_competency_mapping(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_confirm_competency_mapping(uuid) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 12 -- Grants and RLS
-- ###########################################################################
--
-- No table below grants anything to anon. Draft content is unreadable to
-- employers and candidates; the only readers are platform content roles and
-- platform admins.
-- ---------------------------------------------------------------------------

ALTER TABLE public.scp_interview_packs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_pack_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_pack_competencies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_pack_competency_map    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_core_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_question_competencies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_approved_probes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_evidence_dimensions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_rating_anchors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_verification_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_prohibited_areas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_pack_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_pack_events            ENABLE ROW LEVEL SECURITY;

-- Supabase ships ALTER DEFAULT PRIVILEGES granting anon AND authenticated the
-- full table privilege set on every newly created table. Silence is therefore a
-- grant, and an explicit GRANT SELECT does not narrow what the default already
-- gave. Both roles are revoked to zero here and re-granted precisely below.
--
-- This matters beyond tidiness: TRUNCATE is a table privilege that RLS does NOT
-- filter, so an authenticated user holding the default grant could empty the
-- audit ledger no matter what the policies say.
REVOKE ALL ON public.scp_interview_packs                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_pack_versions         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_pack_competencies     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_pack_competency_map   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_core_questions        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_question_competencies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_approved_probes       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_evidence_dimensions   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_rating_anchors        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_verification_rules    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_prohibited_areas      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_pack_reviews          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_pack_events           FROM PUBLIC, anon, authenticated;

-- Content tables: read for every content role, write for editors (policies
-- narrow that to editable versions).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_packs                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_pack_competencies     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_pack_competency_map   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_core_questions        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_question_competencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_approved_probes       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_evidence_dimensions   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_rating_anchors        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_verification_rules    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_interview_prohibited_areas      TO authenticated;

-- The version row: readable, never directly writable by a client. Creation and
-- every transition go through the RPCs above.
GRANT SELECT ON public.scp_interview_pack_versions TO authenticated;

-- Reviews and events: read-only to clients. Both are written by definer RPCs.
GRANT SELECT ON public.scp_interview_pack_reviews TO authenticated;
GRANT SELECT ON public.scp_interview_pack_events  TO authenticated;

GRANT ALL ON public.scp_interview_packs                 TO service_role;
GRANT ALL ON public.scp_interview_pack_versions         TO service_role;
GRANT ALL ON public.scp_interview_pack_competencies     TO service_role;
GRANT ALL ON public.scp_interview_pack_competency_map   TO service_role;
GRANT ALL ON public.scp_interview_core_questions        TO service_role;
GRANT ALL ON public.scp_interview_question_competencies TO service_role;
GRANT ALL ON public.scp_interview_approved_probes       TO service_role;
GRANT ALL ON public.scp_interview_evidence_dimensions   TO service_role;
GRANT ALL ON public.scp_interview_rating_anchors        TO service_role;
GRANT ALL ON public.scp_interview_verification_rules    TO service_role;
GRANT ALL ON public.scp_interview_prohibited_areas      TO service_role;
GRANT ALL ON public.scp_interview_pack_reviews          TO service_role;
GRANT ALL ON public.scp_interview_pack_events           TO service_role;

-- ---- packs ----------------------------------------------------------------
CREATE POLICY scp_interview_packs_read ON public.scp_interview_packs
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_packs_editor_insert ON public.scp_interview_packs
  FOR INSERT TO authenticated WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_interview_packs_editor_update ON public.scp_interview_packs
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_edit(auth.uid()))
  WITH CHECK (public.scp_interview_can_edit(auth.uid()));

-- ---- versions: read only; no INSERT/UPDATE/DELETE policy exists at all -----
CREATE POLICY scp_interview_pack_versions_read ON public.scp_interview_pack_versions
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));

-- ---- reviews and events: read only ----------------------------------------
CREATE POLICY scp_interview_pack_reviews_read ON public.scp_interview_pack_reviews
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_pack_events_read ON public.scp_interview_pack_events
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));


-- ---------------------------------------------------------------------------
-- One decision, used by every child policy: may THIS caller write content into
-- THIS version right now? Both halves matter -- the role, and the state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_can_write_version(_pack_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.scp_interview_can_edit(auth.uid())
     AND public.scp_interview_version_is_editable(_pack_version_id);
$$;

REVOKE ALL ON FUNCTION public.scp_interview_can_write_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_can_write_version(uuid) TO authenticated, service_role;


-- Resolve a question to its version, for the policies on question children.
CREATE OR REPLACE FUNCTION public.scp_interview_question_version(_question_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.pack_version_id FROM public.scp_interview_core_questions q WHERE q.id = _question_id;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_question_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_question_version(uuid) TO authenticated, service_role;


-- Resolve a pack competency to its version.
CREATE OR REPLACE FUNCTION public.scp_interview_competency_version(_pack_competency_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.pack_version_id FROM public.scp_interview_pack_competencies c WHERE c.id = _pack_competency_id;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_competency_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_competency_version(uuid) TO authenticated, service_role;


-- ---- pack competencies -----------------------------------------------------
CREATE POLICY scp_interview_pack_competencies_read ON public.scp_interview_pack_competencies
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_pack_competencies_write_insert ON public.scp_interview_pack_competencies
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_pack_competencies_write_update ON public.scp_interview_pack_competencies
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id))
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_pack_competencies_write_delete ON public.scp_interview_pack_competencies
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id));

-- ---- competency map --------------------------------------------------------
CREATE POLICY scp_interview_pack_competency_map_read ON public.scp_interview_pack_competency_map
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_pack_competency_map_write_insert ON public.scp_interview_pack_competency_map
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(public.scp_interview_competency_version(pack_competency_id)));
CREATE POLICY scp_interview_pack_competency_map_write_update ON public.scp_interview_pack_competency_map
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(public.scp_interview_competency_version(pack_competency_id)))
  WITH CHECK (public.scp_interview_can_write_version(public.scp_interview_competency_version(pack_competency_id)));
CREATE POLICY scp_interview_pack_competency_map_write_delete ON public.scp_interview_pack_competency_map
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(public.scp_interview_competency_version(pack_competency_id)));

-- ---- core questions --------------------------------------------------------
CREATE POLICY scp_interview_core_questions_read ON public.scp_interview_core_questions
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_core_questions_write_insert ON public.scp_interview_core_questions
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_core_questions_write_update ON public.scp_interview_core_questions
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id))
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_core_questions_write_delete ON public.scp_interview_core_questions
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id));

-- ---- question competencies -------------------------------------------------
CREATE POLICY scp_interview_question_competencies_read ON public.scp_interview_question_competencies
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_question_competencies_write_insert ON public.scp_interview_question_competencies
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)));
CREATE POLICY scp_interview_question_competencies_write_update ON public.scp_interview_question_competencies
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)))
  WITH CHECK (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)));
CREATE POLICY scp_interview_question_competencies_write_delete ON public.scp_interview_question_competencies
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)));

-- ---- approved probes -------------------------------------------------------
CREATE POLICY scp_interview_approved_probes_read ON public.scp_interview_approved_probes
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_approved_probes_write_insert ON public.scp_interview_approved_probes
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_approved_probes_write_update ON public.scp_interview_approved_probes
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id))
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_approved_probes_write_delete ON public.scp_interview_approved_probes
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id));

-- ---- evidence dimensions ---------------------------------------------------
CREATE POLICY scp_interview_evidence_dimensions_read ON public.scp_interview_evidence_dimensions
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_evidence_dimensions_write_insert ON public.scp_interview_evidence_dimensions
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)));
CREATE POLICY scp_interview_evidence_dimensions_write_update ON public.scp_interview_evidence_dimensions
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)))
  WITH CHECK (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)));
CREATE POLICY scp_interview_evidence_dimensions_write_delete ON public.scp_interview_evidence_dimensions
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(public.scp_interview_question_version(question_id)));

-- ---- rating anchors --------------------------------------------------------
CREATE POLICY scp_interview_rating_anchors_read ON public.scp_interview_rating_anchors
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_rating_anchors_write_insert ON public.scp_interview_rating_anchors
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(
    coalesce(public.scp_interview_question_version(question_id),
             public.scp_interview_competency_version(pack_competency_id))));
CREATE POLICY scp_interview_rating_anchors_write_update ON public.scp_interview_rating_anchors
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(
    coalesce(public.scp_interview_question_version(question_id),
             public.scp_interview_competency_version(pack_competency_id))))
  WITH CHECK (public.scp_interview_can_write_version(
    coalesce(public.scp_interview_question_version(question_id),
             public.scp_interview_competency_version(pack_competency_id))));
CREATE POLICY scp_interview_rating_anchors_write_delete ON public.scp_interview_rating_anchors
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(
    coalesce(public.scp_interview_question_version(question_id),
             public.scp_interview_competency_version(pack_competency_id))));

-- ---- verification rules ----------------------------------------------------
CREATE POLICY scp_interview_verification_rules_read ON public.scp_interview_verification_rules
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_verification_rules_write_insert ON public.scp_interview_verification_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_verification_rules_write_update ON public.scp_interview_verification_rules
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id))
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_verification_rules_write_delete ON public.scp_interview_verification_rules
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id));

-- ---- prohibited areas ------------------------------------------------------
CREATE POLICY scp_interview_prohibited_areas_read ON public.scp_interview_prohibited_areas
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_prohibited_areas_write_insert ON public.scp_interview_prohibited_areas
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_prohibited_areas_write_update ON public.scp_interview_prohibited_areas
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id))
  WITH CHECK (public.scp_interview_can_write_version(pack_version_id));
CREATE POLICY scp_interview_prohibited_areas_write_delete ON public.scp_interview_prohibited_areas
  FOR DELETE TO authenticated
  USING (public.scp_interview_can_write_version(pack_version_id));


-- ###########################################################################
-- SECTION 13 -- The Vaktare v1 pilot import
-- ###########################################################################
--
-- Source: "CQrityjob Vaktare Role Interview Pack v1.0", 27 August 2026.
--
-- Imported EXACTLY and traceably: eight core questions in fixed order with
-- their governed wording, six competencies, the approved probes, the evidence
-- dimensions, the 0-4 behavioural anchors, the verification boundaries and the
-- prohibited areas.
--
-- It enters as content_status = 'draft' and validation_label =
-- 'pilot_hypothesis'. It CANNOT be published by this migration or by any
-- automatic process: every competency mapping is provisional and all four
-- review gates are unapproved, both of which scp_interview_pack_validate()
-- reports as blocking. Publication requires four human review decisions.
--
-- The source document is a Swedish instrument whose core questions must be
-- read verbatim. English renderings are therefore left NULL rather than
-- machine-translated: an English version of a governed interview question is
-- itself governed content and needs its own review.
--
-- Idempotent: re-running does nothing once the pack exists.
-- No candidate data appears anywhere in this section, and none can.
-- ---------------------------------------------------------------------------

DO $seed$
DECLARE
  _role_id uuid;
  _role_version_id uuid;
  _pack_id uuid;
  _version_id uuid;
  _hash text;
  _q uuid;
  _c uuid;
  _comp jsonb;
  _rec record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_interview_packs WHERE slug = 'vaktare-se') THEN
    RAISE NOTICE 'SCP_INTERVIEW_SEED: vaktare-se already present, skipping.';
    RETURN;
  END IF;

  SELECT r.id INTO _role_id FROM public.scp_roles r WHERE r.slug = 'security-guard-se';
  IF _role_id IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_SEED: scp_roles slug "security-guard-se" is missing; the Vaktare role must exist before its interview pack.';
  END IF;

  SELECT v.id INTO _role_version_id
    FROM public.scp_role_versions v
   WHERE v.role_id = _role_id
   ORDER BY v.version_number DESC
   LIMIT 1;
  IF _role_version_id IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_SEED: no scp_role_versions row for security-guard-se.';
  END IF;

  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, name_en, purpose_sv, created_by)
  VALUES ('vaktare-se', _role_id, 'Väktare', 'Security Guard',
          'Strukturerad, PEACE-baserad och evidensinformerad pilotintervju. Skapa likvärdiga intervjuer som samlar in konkret jobbrelevant evidens. AI får förbereda och strukturera; intervjuaren bedömer och beslutar.',
          NULL)
  RETURNING id INTO _pack_id;

  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, content_status, validation_label, locale,
     role_version_id, source_reference, source_document_version, summary_sv, created_by)
  VALUES
    (_pack_id, 1, 'draft', 'pilot_hypothesis', 'sv-SE', _role_version_id,
     'CQrityjob Väktare Role Interview Pack',
     'v1.0 (2026-08-27)',
     'Pilotversion. Kompetenser, frågor och ankare är en genomarbetad hypotes som måste innehållsvalideras genom dokumenterad arbetsanalys och panel med svenska väktarexperter innan skarpa urvalsbeslut. Ingen empiriskt validerad prediktionsmodell.',
     NULL)
  RETURNING id INTO _version_id;

  -- ---- competencies C1..C6 (source section 3) -----------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('C1', 1, 'Situationsmedvetenhet och riskprioritering',
       'Upptäcker relevanta avvikelser, söker tillräcklig information, skiljer brådskande från viktigt och agerar utan att skapa onödig risk.',
       ARRAY['Selektiv uppmärksamhet','Kontroll av antaganden','Prioritering','Tidig eskalering']),
      ('C2', 2, 'Konflikthantering och självkontroll',
       'Kommunicerar lugnt och respektfullt, sätter tydliga gränser, anpassar taktik och skyddar människor utan onödig konfrontation.',
       ARRAY['De-eskalering','Avstånd','Tonläge','Autonomi och respekt','Stöd och avbrytande']),
      ('C3', 3, 'Integritet, regelmedvetenhet och mandat',
       'Följer lagliga instruktioner och dokumenterade rutiner, känner mandatgränser och rapporterar fel även när det är obekvämt.',
       ARRAY['Regelprioritet','Transparens','Motstånd mot otillbörlig påverkan','Korrigering']),
      ('C4', 4, 'Kommunikation och dokumentation',
       'Överför relevant information sakligt, strukturerat och anpassat till mottagaren samt skiljer observation från tolkning.',
       ARRAY['Tydlighet','Fakta och tolkning','Tidslinje','Mottagaranpassning','Kontroll av förståelse']),
      ('C5', 5, 'Omdöme och agerande under press',
       'Väljer proportionerliga åtgärder, omprövar vid ny information, använder stödresurser och bevarar säkerhetsmarginaler.',
       ARRAY['Alternativ','Konsekvens','Prioritet','Eskalering','Omprövning']),
      ('C6', 6, 'Service, samarbete och professionellt bemötande',
       'Skapar samarbete och god service utan att ge avkall på säkerhet, integritet eller likabehandling.',
       ARRAY['Rollklarhet','Samverkan','Respekt','Lösningsfokus','Gränssättning'])
    ) AS t(code, ord, name_sv, definition_sv, indicators)
  LOOP
    INSERT INTO public.scp_interview_pack_competencies
      (pack_version_id, code, display_order, name_sv, definition_sv, observable_indicators_sv)
    VALUES (_version_id, _rec.code, _rec.ord, _rec.name_sv, _rec.definition_sv, _rec.indicators);
  END LOOP;

  -- ---- the competency mapping artifact ------------------------------------
  -- Every row is PROVISIONAL. Vaktare C1..C6 are compound constructs and
  -- SCC-01..SCC-12 are atomic, so five of the six span two canonical
  -- competencies. No source supplies a weighting between them, and inventing
  -- one would be an unsupported scientific assumption -- so the correspondence
  -- is recorded as directional, with a rationale, and the pack cannot publish
  -- until an expert confirms it.
  FOR _rec IN
    SELECT * FROM (VALUES
      ('C1', 'SCC-03', 'broader_than_source', 'C1 omfattar SCC-03 Situationsmedvetenhet (upptäcka och tolka signaler) men lägger till riskprioritering och proportionerligt agerande. Ingen ren ekvivalens.'),
      ('C1', 'SCC-02', 'broader_than_source', 'Riskprioriteringsdelen av C1 motsvarar delar av SCC-02 Säkerhetsmedvetenhet. Fördelningen mellan SCC-02 och SCC-03 är inte fastställd i källan.'),
      ('C2', 'SCC-05', 'broader_than_source', 'C2 bygger på SCC-05 Emotionell självreglering men innefattar även taktisk de-eskalering och avståndshållning som konstruktet inte täcker.'),
      ('C2', 'SCC-07', 'broader_than_source', 'Gränssättningsdelen av C2 överlappar SCC-07 Respektfull service och gränshållning. Överlappet är partiellt och obekräftat.'),
      ('C3', 'SCC-01', 'broader_than_source', 'C3 vilar på SCC-01 Integritet och etik men lägger till mandatgränser och rapporteringsskyldighet.'),
      ('C3', 'SCC-11', 'broader_than_source', 'Mandat- och regeldelen av C3 överlappar SCC-11 Professionellt omdöme och proportionalitet, särskilt facetten rättssäker gränsdragning.'),
      ('C4', 'SCC-06', 'equivalent', 'C4 Kommunikation och dokumentation motsvarar SCC-06 Kommunikation och informationskvalitet konstruktmässigt, inklusive facetterna saklig tydlighet och dokumentation. Detta är den enda kandidaten för ren ekvivalens och markeras ändå provisorisk så att expertgranskningen godkänner hela mappningen som en artefakt.'),
      ('C5', 'SCC-04', 'broader_than_source', 'C5 bygger på SCC-04 Beslutsfattande under press.'),
      ('C5', 'SCC-11', 'broader_than_source', 'Proportionalitets- och omprövningsdelen av C5 överlappar SCC-11 Professionellt omdöme. Fördelningen mellan SCC-04 och SCC-11 är inte fastställd.'),
      ('C6', 'SCC-07', 'broader_than_source', 'C6 bygger på SCC-07 Respektfull service och gränshållning.'),
      ('C6', 'SCC-08', 'broader_than_source', 'Samarbetsdelen av C6 motsvarar SCC-08 Samarbete och samordning. Fördelningen mellan SCC-07 och SCC-08 är inte fastställd.')
    ) AS t(pack_code, scc_code, relation, rationale)
  LOOP
    INSERT INTO public.scp_interview_pack_competency_map
      (pack_competency_id, competency_version_id, relation, mapping_state, rationale_sv)
    SELECT c.id, cv.id, _rec.relation, 'provisional', _rec.rationale
      FROM public.scp_interview_pack_competencies c,
           public.scp_competency_versions cv
      JOIN public.scp_competencies sc ON sc.id = cv.competency_id
     WHERE c.pack_version_id = _version_id
       AND c.code = _rec.pack_code
       AND sc.code = _rec.scc_code
       AND cv.version_number = 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCP_INTERVIEW_SEED: could not pin % -> % version 1; the canonical competency library is not what this import expects.',
        _rec.pack_code, _rec.scc_code;
    END IF;
  END LOOP;

  -- ---- the eight core questions (source section 5) ------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'behavioural',
       'Berätta om en konkret situation där du upptäckte något som andra först inte verkade uppmärksamma och där det kunde ha fått betydelse för säkerheten eller verksamheten.'),
      ('Q2', 2, 'behavioural',
       'Berätta om en situation där en person blev arg, hotfull eller starkt frustrerad och du behövde förhindra att läget eskalerade.'),
      ('Q3', 3, 'behavioural',
       'Berätta om en situation där någon ville att du skulle göra ett undantag från en regel eller rutin, eller där det hade varit enklare att inte rapportera ett problem.'),
      ('Q4', 4, 'behavioural',
       'Berätta om en incident där din rapport eller överlämning behövde göra det möjligt för någon annan att förstå vad som hänt och agera vidare.'),
      ('Q5', 5, 'behavioural',
       'Berätta om en situation där du behövde fatta ett snabbt beslut med ofullständig information och där säkerheten kunde påverkas.'),
      ('Q6', 6, 'behavioural',
       'Berätta om en situation där en kund, besökare eller kollega ville ha en snabb lösning som stod i konflikt med en säkerhetsrutin eller ditt uppdrag.'),
      ('Q7', 7, 'situational',
       'Du arbetar vid en behörighetskontrollerad entré. En välkänd medarbetare kommer med en person som saknar giltig behörighet och säger att det bara gäller några minuter. Det är kö bakom och medarbetaren blir irriterad. Hur hanterar du situationen?'),
      ('Q8', 8, 'situational',
       'Under en rond får du ett larm från ett område samtidigt som du ser en upprörd grupp nära den tänkta vägen dit. Du är ensam i den omedelbara närheten och har begränsad information. Beskriv hur du skulle resonera och agera steg för steg.')
    ) AS t(code, ord, qtype, prompt_sv)
  LOOP
    INSERT INTO public.scp_interview_core_questions
      (pack_version_id, code, display_order, question_type, prompt_sv, prompt_en,
       recommended_duration_min_minutes, recommended_duration_max_minutes,
       evidence_source_note_sv)
    VALUES (_version_id, _rec.code, _rec.ord, _rec.qtype, _rec.prompt_sv, NULL, 6, 8,
            'Kandidatens svar i denna intervju; separat från CV, test och Passport. En intervjuutsaga är självrapporterad evidens.');
  END LOOP;

  -- ---- question -> competency links (source section 5 question map) -------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 'C1', true),
      ('Q2', 'C2', true),
      ('Q3', 'C3', true),
      ('Q4', 'C4', true),
      ('Q5', 'C5', true),
      ('Q6', 'C6', true),
      ('Q7', 'C1', true),  ('Q7', 'C3', false), ('Q7', 'C6', false),
      ('Q8', 'C1', true),  ('Q8', 'C2', false), ('Q8', 'C4', false), ('Q8', 'C5', false)
    ) AS t(qcode, ccode, is_primary)
  LOOP
    INSERT INTO public.scp_interview_question_competencies (question_id, pack_competency_id, is_primary)
    SELECT q.id, c.id, _rec.is_primary
      FROM public.scp_interview_core_questions q,
           public.scp_interview_pack_competencies c
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode
       AND c.pack_version_id = _version_id AND c.code = _rec.ccode;
  END LOOP;

  -- ---- the eight general probes (source section 4.2) ----------------------
  -- purpose_provenance = 'source_stated': the source table names the purpose.
  FOR _rec IN
    SELECT * FROM (VALUES
      (1, 'example',       'Kan du välja en specifik situation?'),
      (2, 'own_role',      'Vad var just ditt ansvar i den situationen?'),
      (3, 'exact_action',  'Vad gjorde du först, och vad gjorde du därefter?'),
      (4, 'reasoning',     'Vilken information vägde du in när du valde den åtgärden?'),
      (5, 'effect',        'Vad blev resultatet, och hur vet du det?'),
      (6, 'reflection',    'Vad lärde du dig, och vad skulle du göra annorlunda i dag?'),
      (7, 'neutral_check', 'Jag vill kontrollera att jag förstått: menar du att …?'),
      (8, 'correction',    'Är min sammanfattning korrekt, eller vill du ändra något?')
    ) AS t(ord, purpose, wording)
  LOOP
    INSERT INTO public.scp_interview_approved_probes
      (pack_version_id, question_id, purpose, purpose_provenance, wording_sv, display_order)
    VALUES (_version_id, NULL, _rec.purpose, 'source_stated', _rec.wording, _rec.ord);
  END LOOP;

  -- ---- question-specific probes (source, per question) --------------------
  -- purpose_provenance = 'derived_in_import': the source lists the wording but
  -- does not label its 5E purpose. The label was assigned during import and is
  -- an explicit item for the expert review gate to confirm.
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'example',      'Vad lade du först märke till?'),
      ('Q1', 2, 'reasoning',    'Vilken information kontrollerade du innan du agerade?'),
      ('Q1', 3, 'reasoning',    'Hur prioriterade du mellan möjliga risker?'),
      ('Q1', 4, 'own_role',     'Vad gjorde du själv och när involverade du andra?'),
      ('Q1', 5, 'effect',       'Vad blev resultatet?'),

      ('Q2', 1, 'reasoning',    'Hur bedömde du risken i början?'),
      ('Q2', 2, 'exact_action', 'Vad sa och gjorde du konkret?'),
      ('Q2', 3, 'exact_action', 'Hur satte du gränser utan att öka konflikten?'),
      ('Q2', 4, 'own_role',     'När övervägde eller begärde du stöd?'),
      ('Q2', 5, 'effect',       'Vad blev resultatet och vad lärde du dig?'),

      ('Q3', 1, 'reasoning',    'Vilken regel eller princip var relevant?'),
      ('Q3', 2, 'reasoning',    'Vilka intressen stod mot varandra?'),
      ('Q3', 3, 'exact_action', 'Hur kommunicerade du ditt beslut?'),
      ('Q3', 4, 'exact_action', 'Hur dokumenterade eller eskalerade du?'),
      ('Q3', 5, 'effect',       'Vad blev konsekvensen?'),

      ('Q4', 1, 'reasoning',    'Vilka fakta var viktigast?'),
      ('Q4', 2, 'exact_action', 'Hur skilde du observation från egen tolkning?'),
      ('Q4', 3, 'exact_action', 'Hur strukturerade du tidslinjen?'),
      ('Q4', 4, 'exact_action', 'Hur säkerställde du att mottagaren förstått?'),
      ('Q4', 5, 'effect',       'Fick rapporten någon konkret betydelse?'),

      ('Q5', 1, 'reasoning',    'Vad visste du och vad var osäkert?'),
      ('Q5', 2, 'reasoning',    'Vilka alternativ övervägde du?'),
      ('Q5', 3, 'reasoning',    'Vilken risk prioriterade du först?'),
      ('Q5', 4, 'own_role',     'När använde du kollega, arbetsledning eller larmväg?'),
      ('Q5', 5, 'reflection',   'När omprövade du beslutet?'),

      ('Q6', 1, 'reasoning',    'Vad behövde personen egentligen?'),
      ('Q6', 2, 'reasoning',    'Vilken säkerhetsgräns behövde du hålla?'),
      ('Q6', 3, 'exact_action', 'Hur förklarade du detta?'),
      ('Q6', 4, 'exact_action', 'Vilket alternativ erbjöd du?'),
      ('Q6', 5, 'effect',       'Hur påverkades samarbetet?'),

      ('Q7', 1, 'exact_action', 'Vad gör du först?'),
      ('Q7', 2, 'reasoning',    'Vilken information behöver du?'),
      ('Q7', 3, 'exact_action', 'Hur kommunicerar du beslutet?'),
      ('Q7', 4, 'exact_action', 'Vilket säkert alternativ erbjuder du?'),
      ('Q7', 5, 'exact_action', 'När dokumenterar eller eskalerar du?'),

      ('Q8', 1, 'reasoning',    'Vilka omedelbara risker identifierar du?'),
      ('Q8', 2, 'reasoning',    'Vilken information försöker du få innan du närmar dig?'),
      ('Q8', 3, 'own_role',     'Hur använder du larmcentral, kollega eller arbetsledning?'),
      ('Q8', 4, 'reasoning',    'Vad får dig att avvakta, välja annan väg eller avbryta?'),
      ('Q8', 5, 'exact_action', 'Vad rapporterar du under och efter händelsen?')
    ) AS t(qcode, ord, purpose, wording)
  LOOP
    INSERT INTO public.scp_interview_approved_probes
      (pack_version_id, question_id, purpose, purpose_provenance, wording_sv, display_order)
    SELECT _version_id, q.id, _rec.purpose, 'derived_in_import', _rec.wording, _rec.ord
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode;
  END LOOP;

  -- ---- evidence dimensions, five per question -----------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'specifik_signal',        'Specifik signal/avvikelse'),
      ('Q1', 2, 'kontroll_av_antaganden', 'Kontroll av antaganden'),
      ('Q1', 3, 'riskprioritering',       'Riskprioritering'),
      ('Q1', 4, 'proportionerlig_atgard', 'Proportionerlig åtgärd'),
      ('Q1', 5, 'resultat_reflektion',    'Resultat/reflektion'),

      ('Q2', 1, 'riskbedomning',          'Riskbedömning'),
      ('Q2', 2, 'lugn_kommunikation',     'Lugn kommunikation'),
      ('Q2', 3, 'granssattning',          'Gränssättning'),
      ('Q2', 4, 'avstand_stod',           'Avstånd/stöd'),
      ('Q2', 5, 'resultat_reflektion',    'Resultat/reflektion'),

      ('Q3', 1, 'relevant_regel',         'Relevant regel'),
      ('Q3', 2, 'intressekonflikt',       'Intressekonflikt'),
      ('Q3', 3, 'mandatgrans',            'Mandatgräns'),
      ('Q3', 4, 'transparens_rapportering','Transparens/rapportering'),
      ('Q3', 5, 'konsekvens',             'Konsekvens'),

      ('Q4', 1, 'relevans',               'Relevans'),
      ('Q4', 2, 'fakta_tolkning',         'Fakta/tolkning'),
      ('Q4', 3, 'tidslinje',              'Tidslinje'),
      ('Q4', 4, 'mottagaranpassning',     'Mottagaranpassning'),
      ('Q4', 5, 'effekt',                 'Effekt'),

      ('Q5', 1, 'osakerhet',              'Osäkerhet'),
      ('Q5', 2, 'alternativ',             'Alternativ'),
      ('Q5', 3, 'riskprioritet',          'Riskprioritet'),
      ('Q5', 4, 'stod_eskalering',        'Stöd/eskalering'),
      ('Q5', 5, 'omprovning',             'Omprövning'),

      ('Q6', 1, 'behovsbild',             'Behovsbild'),
      ('Q6', 2, 'sakerhetsgrans',         'Säkerhetsgräns'),
      ('Q6', 3, 'respektfull_forklaring', 'Respektfull förklaring'),
      ('Q6', 4, 'alternativ_losning',     'Alternativ lösning'),
      ('Q6', 5, 'samarbete',              'Samarbete'),

      ('Q7', 1, 'kontroll_fore_passage',  'Kontroll före passage'),
      ('Q7', 2, 'likvardig_regel',        'Likvärdig regel'),
      ('Q7', 3, 'lugn_granssattning',     'Lugn gränssättning'),
      ('Q7', 4, 'sakert_alternativ',      'Säkert alternativ'),
      ('Q7', 5, 'dokumentation_eskalering','Dokumentation/eskalering'),

      ('Q8', 1, 'egen_sakerhet',          'Egen säkerhet/ensamarbete'),
      ('Q8', 2, 'informationsinhamtning', 'Informationsinhämtning'),
      ('Q8', 3, 'stodresurser',           'Stödresurser'),
      ('Q8', 4, 'trosklar_for_avbrytande','Trösklar för avbrytande'),
      ('Q8', 5, 'lagesrapport',           'Lägesrapport')
    ) AS t(qcode, ord, code, label)
  LOOP
    INSERT INTO public.scp_interview_evidence_dimensions
      (question_id, code, label_sv, display_order)
    SELECT q.id, _rec.code, _rec.label, _rec.ord
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode;
  END LOOP;

  -- ---- behavioural anchors, levels 0-4 per question -----------------------
  -- Level 0 is INSUFFICIENT EVIDENCE. counts_toward_aggregation is false there
  -- by table constraint, and the level-0 anchor text says explicitly that it is
  -- not the same thing as low competence. Levels 1-4 carry the source wording.
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'Riskfyllt/otillräckligt',   'Missar eller bortförklarar tydliga signaler; agerar impulsivt eller utan relevant kontroll; eget agerande kan ha ökat risken.'),
      ('Q1', 2, 'Grundläggande/ojämnt',      'Identifierar en avvikelse men beskrivningen av kontroll, prioritering eller eget ansvar är begränsad; åtgärden är huvudsakligen reaktiv.'),
      ('Q1', 3, 'Effektivt och säkert',      'Identifierar relevant avvikelse, kontrollerar centrala fakta, prioriterar rimligt och vidtar en säker, proportionerlig åtgärd med tydligt eget ansvar.'),
      ('Q1', 4, 'Mycket starkt/systematiskt','Arbetar systematiskt, söker motstridig information, förutser följdrisker, skapar säkerhetsmarginal och delar lärande som förbättrar förebyggandet.'),

      ('Q2', 1, 'Riskfyllt/otillräckligt',   'Beskriver prestige, hot, förnedring, onödig konfrontation eller oproportionerligt agerande; saknar säkerhetstänk.'),
      ('Q2', 2, 'Grundläggande/ojämnt',      'Behåller i huvudsak lugnet men förklarar begränsat hur beteendet anpassades; gränser, avstånd eller stödresurser är otydliga.'),
      ('Q2', 3, 'Effektivt och säkert',      'Kommunicerar lugnt och respektfullt, sätter tydliga gränser, bevarar säkerhet och använder stöd/eskalering proportionerligt.'),
      ('Q2', 4, 'Mycket starkt/systematiskt','Läser förändringar över tid, anpassar strategi utan att tappa mandat, skapar valmöjligheter, förebygger smittoeffekt och reflekterar nyanserat över resultatet.'),

      ('Q3', 1, 'Riskfyllt/otillräckligt',   'Accepterar eller döljer ett säkerhetsrelevant regelbrott; överskrider mandat; kan inte redogöra för ansvar.'),
      ('Q3', 2, 'Grundläggande/ojämnt',      'Vill göra rätt men är osäker på regel, dokumentation eller eskalering; utfallet beror delvis på andra.'),
      ('Q3', 3, 'Effektivt och säkert',      'Identifierar relevant regel och mandat, kommunicerar sakligt, står emot otillbörlig påverkan och dokumenterar/eskalerar korrekt.'),
      ('Q3', 4, 'Mycket starkt/systematiskt','Hanterar komplex målkonflikt öppet, söker behörigt stöd, skyddar både säkerhet och relation samt bidrar till att rutinen förbättras.'),

      ('Q4', 1, 'Riskfyllt/otillräckligt',   'Informationen är osammanhängande, spekulativ eller saknar kritiska fakta; mottagaren kan inte agera säkert.'),
      ('Q4', 2, 'Grundläggande/ojämnt',      'Grundläggande fakta finns men struktur, precision, källskillnad eller kontroll av förståelse är begränsad.'),
      ('Q4', 3, 'Effektivt och säkert',      'Ger en saklig, kronologisk och relevant redogörelse, skiljer observation från tolkning och anpassar till mottagarens behov.'),
      ('Q4', 4, 'Mycket starkt/systematiskt','Skapar mycket hög spårbarhet, identifierar osäkerhet och kvarstående risk, kvalitetssäkrar mottagandet och förbättrar senare rapporteringspraxis.'),

      ('Q5', 1, 'Riskfyllt/otillräckligt',   'Agerar utan att identifiera central risk eller mandat; låser sig vid första antagandet; saknar säkerhetsmarginal.'),
      ('Q5', 2, 'Grundläggande/ojämnt',      'Fattar ett begripligt beslut men redogör svagt för alternativ, osäkerhet, stödresurser eller omprövning.'),
      ('Q5', 3, 'Effektivt och säkert',      'Prioriterar omedelbar säkerhet, väljer proportionerlig åtgärd, använder tillgängligt stöd och omprövar när ny information kommer.'),
      ('Q5', 4, 'Mycket starkt/systematiskt','Hanterar flera samtidiga risker, bygger redundans, kommunicerar beslut och trösklar tydligt samt skapar en kontrollerad övergång när läget förändras.'),

      ('Q6', 1, 'Riskfyllt/otillräckligt',   'Ger efter för kritisk säkerhetsregel eller bemöter personen respektlöst/avvisande utan att försöka lösa situationen.'),
      ('Q6', 2, 'Grundläggande/ojämnt',      'Håller i huvudsak gränsen men kommunikationen eller alternativet är begränsat; relationen hanteras reaktivt.'),
      ('Q6', 3, 'Effektivt och säkert',      'Håller säkerhetsgränsen, förklarar sakligt och respektfullt, erbjuder ett möjligt alternativ och bevarar professionellt samarbete.'),
      ('Q6', 4, 'Mycket starkt/systematiskt','Förutser intressekonflikten, samordnar lösning med rätt funktion, minskar friktion utan regelavsteg och skapar förbättring som förebygger upprepning.'),

      ('Q7', 1, 'Riskfyllt/otillräckligt',   'Släpper in utan kontroll, improviserar mandat eller trappar upp konflikten i onödan.'),
      ('Q7', 2, 'Grundläggande/ojämnt',      'Stoppar eller fördröjer passagen men processen, kommunikationen eller alternativet är otydligt; begränsad dokumentation.'),
      ('Q7', 3, 'Effektivt och säkert',      'Förhindrar obehörig passage, kontrollerar enligt rutin, kommunicerar lugnt, erbjuder behörig lösning och dokumenterar/eskalerar vid behov.'),
      ('Q7', 4, 'Mycket starkt/systematiskt','Hanterar samtidigt kö, social press och relation; samordnar verifiering effektivt, skyddar integritet och lämnar tydlig återkoppling för förebyggande förbättring.'),

      ('Q8', 1, 'Riskfyllt/otillräckligt',   'Går in i oklar risksituation utan relevant informationsinhämtning eller stöd; saknar avbrytandetröskel eller kommunikation.'),
      ('Q8', 2, 'Grundläggande/ojämnt',      'Identifierar risk och söker visst stöd men prioritering, alternativa vägar, lägesrapport eller omprövning är ofullständig.'),
      ('Q8', 3, 'Effektivt och säkert',      'Prioriterar säkerhet, inhämtar information, kommunicerar läge, använder stödresurser och väljer/ändrar åtgärd utifrån tydliga risktrösklar.'),
      ('Q8', 4, 'Mycket starkt/systematiskt','Bygger en sammanhängande plan med reservväg, fortlöpande lägesbild, definierade beslutspunkter och säker överlämning; undviker både passivitet och onödig exponering.')
    ) AS t(qcode, lvl, label, anchor)
  LOOP
    INSERT INTO public.scp_interview_rating_anchors
      (question_id, level, label_sv, anchor_sv, counts_toward_aggregation, is_safety_critical)
    SELECT q.id, _rec.lvl, _rec.label, _rec.anchor, true, (_rec.lvl = 1)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode;
  END LOOP;

  -- Level 0, identical across all eight questions in the source.
  INSERT INTO public.scp_interview_rating_anchors
    (question_id, level, label_sv, anchor_sv, counts_toward_aggregation, is_safety_critical)
  SELECT q.id, 0, 'Otillräcklig evidens',
         'Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.',
         false, false
    FROM public.scp_interview_core_questions q
   WHERE q.pack_version_id = _version_id;

  -- ---- verification boundaries (source section 7.1 and 7.2) ---------------
  FOR _rec IN
    SELECT * FROM (VALUES
      (1, 'vaktarutbildning', 'VU1/VU2 eller tillämplig väktarutbildning',
       ARRAY['verified','candidate_declared','no_evidence_yet']::text[],
       'Fråga inte om redan verifierad fakta; klargör endast oklarhet.',
       'Kontroll enligt arbetsgivarens lagliga process och godkänd källa.',
       'Passport kan visa verifierad utbildning om kandidaten delar den för ändamålet. Intervjun skriver aldrig till Passport.'),
      (2, 'anstallning_uppdragstyp', 'Relevant anställning och uppdragstyp',
       ARRAY['verified','candidate_declared','partial']::text[],
       'Klargör faktisk roll, miljö och ansvar genom beteendeexempel.',
       'Arbetsgivar- eller referenskontroll efter information och tillämpligt samtycke.',
       'Anställningsfakta i Passport är kandidatens att dela. En intervjuutsaga blir aldrig automatiskt verifierad Passport-evidens.'),
      (3, 'rapporteringsvana', 'Rapporteringsvana',
       ARRAY['candidate_declared','no_evidence_yet']::text[],
       'Använd fråga 4; sök konkret exempel.',
       'Arbetsprov eller referens om rollen kräver det.',
       'Ingen Passport-koppling. Rapporteringsvana är inte en verifierbar merit.'),
      (4, 'hot_konflikterfarenhet', 'Hot- och konflikterfarenhet',
       ARRAY['candidate_declared','no_evidence_yet']::text[],
       'Använd fråga 2 utan att kräva traumatiska privata detaljer.',
       'Ingen verifiering av privat incident; bedöm endast jobbrelevant redogörelse.',
       'Ingen Passport-koppling. Privata incidenter registreras inte.'),
      (5, 'sprak_sakkrav', 'Språk eller andra sakkrav',
       ARRAY['verified','candidate_declared']::text[],
       'Bedöm endast dokumenterat jobbkrav med tillgänglig anpassning.',
       'Godkänd kontroll eller metod kopplad till arbetets faktiska krav.',
       'Verifierad utbildning visar att ett formellt krav är styrkt; den bevisar inte automatiskt arbetsprestation.')
    ) AS t(ord, code, requirement, states, action, subsequent, boundary)
  LOOP
    INSERT INTO public.scp_interview_verification_rules
      (pack_version_id, code, requirement_sv, permitted_source_states,
       interview_action_sv, subsequent_verification_sv, passport_boundary_sv, display_order)
    VALUES (_version_id, _rec.code, _rec.requirement, _rec.states,
            _rec.action, _rec.subsequent, _rec.boundary, _rec.ord);
  END LOOP;

  -- ---- prohibited areas (source sections 1.2, 4.3 and 6) ------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      (1,  'capability', 'ingen_logndetektion',
       'Ingen lögndetektor, trovärdighetsbedömning eller bedrägeriskattning.',
       'Trovärdighet är inte mätbar i en anställningsintervju och en sådan bedömning saknar rättssäkert stöd. Registrera aldrig "lögn" eller "bedräglig" utan en separat behörig process utanför bedömningen.'),
      (2,  'capability', 'ingen_biometrisk_analys',
       'Ingen analys av ansikte, blick, röst, känsloläge eller stressnivå.',
       'Sådan analys mäter inte jobbrelevant beteende och skulle straffa nervositet, funktionsnedsättning och språkvariation.'),
      (3,  'inference',  'ingen_personlighetstolkning',
       'Ingen personlighetstolkning eller culture fit-modell.',
       'Paketet bedömer beskrivna handlingar mot ankare, inte vem kandidaten antas vara.'),
      (4,  'inference',  'inga_skyddade_egenskaper',
       'Ingen slutsats om skyddade egenskaper från språk, brytning, namn, bild eller beteende.',
       'Otillåtet och irrelevant för arbetet.'),
      (5,  'inference',  'nervositet_far_inte_sanka',
       'Nervositet, tystnad, språkvariation, funktionsnedsättning eller begärd anpassning får aldrig sänka bedömningen.',
       'Dessa är egenskaper hos intervjusituationen, inte evidens om yrkesutövning.'),
      (6,  'capability', 'ingen_totalpoang',
       'Ingen automatisk totalpoäng, viktning, rangordning eller anställningsrekommendation.',
       'Pilotens mål är innehållsvaliditet, bedömaröverensstämmelse och processkvalitet. Eventuell senare viktning kräver arbetsanalys och valideringsplan.'),
      (7,  'capability', 'ingen_ai_poangsattning',
       'AI får markera evidensgap men aldrig poängsätta, rangordna eller rekommendera anställning.',
       'AI förbereder, extraherar, strukturerar och föreslår. Människan verifierar, bedömer och beslutar.'),
      (8,  'capability', 'ingen_fri_ai_fraga',
       'AI får inte skriva om eller ersätta kärnfrågorna, och får inte generera följdfrågor utanför de godkända.',
       'Likvärdighet mellan kandidater kräver samma åtta frågor i samma ordning och endast godkända följdfrågor.'),
      (9,  'capability', 'ingen_passport_skrivning',
       'Intervjuuppgifter överförs aldrig automatiskt till Security Passport.',
       'En intervjuutsaga är självrapporterad evidens och blir inte verifierad fakta genom att sägas.'),
      (10, 'probe_practice', 'inga_ledande_fragor',
       'Ledande följdfrågor är inte tillåtna, till exempel "Du ringde väl polisen direkt?".',
       'En ledande fråga skapar det svar den påstår sig mäta.'),
      (11, 'probe_practice', 'inga_anklagande_fragor',
       'Anklagande följdfrågor före klarlagda fakta är inte tillåtna, till exempel "Varför följde du inte reglerna?".',
       'PEACE kräver fri redogörelse före prövning.'),
      (12, 'probe_practice', 'inga_trovardighetsfragor',
       'Trovärdighetsbedömande kommentarer är inte tillåtna, till exempel "Det låter inte sant.".',
       'Se ingen_logndetektion.'),
      (13, 'topic', 'inga_irrelevanta_personuppgifter',
       'Skyddade eller irrelevanta personuppgifter utan tydlig koppling till arbetet får inte efterfrågas.',
       'Endast dokumenterade jobbkrav är legitima frågeområden.'),
      (14, 'topic', 'inga_hypotetiska_valdsscenarier',
       'Hypotetiska tvångs- eller våldsscenarier som premierar aggressivitet framför säkerhet och mandat får inte användas.',
       'De mäter vilja till konfrontation, inte säkert yrkesutövande.')
    ) AS t(ord, atype, code, statement, rationale)
  LOOP
    INSERT INTO public.scp_interview_prohibited_areas
      (pack_version_id, area_type, code, statement_sv, rationale_sv, display_order)
    VALUES (_version_id, _rec.atype, _rec.code, _rec.statement, _rec.rationale, _rec.ord);
  END LOOP;

  -- ---- stamp the content hash and record the import -----------------------
  _hash := public.scp_interview_pack_content_hash(_version_id);

  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions
     SET content_hash = _hash WHERE id = _version_id;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM public.scp_interview_record_event(
    _pack_id, NULL, 'pack_created', NULL, NULL,
    'Import av CQrityjob Väktare Role Interview Pack v1.0.', NULL,
    jsonb_build_object('slug', 'vaktare-se', 'imported_by', 'migration 20260918090000'));

  PERFORM public.scp_interview_record_event(
    _pack_id, _version_id, 'version_created', NULL, 'draft',
    'Pilothypotes. Ej vetenskapligt validerad. Publicering kräver dokumenterade granskningsgrindar.',
    _hash,
    jsonb_build_object(
      'version_number', 1,
      'validation_label', 'pilot_hypothesis',
      'source_document_version', 'v1.0 (2026-08-27)',
      'competency_mapping_state', 'provisional'));

  RAISE NOTICE 'SCP_INTERVIEW_SEED: vaktare-se v1 imported as draft/pilot_hypothesis, content_hash=%', _hash;
END
$seed$;


-- ###########################################################################
-- SECTION 14 -- Fail-fast assertions on the imported content
-- ###########################################################################
--
-- The migration refuses to complete if the import is not exactly what the
-- source document says. A silently short seed is the failure mode that would
-- reach a reviewer looking finished.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  _v uuid;
  _n integer;
  _status text;
  _label text;
BEGIN
  SELECT ver.id, ver.content_status, ver.validation_label
    INTO _v, _status, _label
    FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'vaktare-se' AND ver.version_number = 1;

  IF _v IS NULL THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: the Vaktare v1 pack version was not created.';
  END IF;

  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: Vaktare v1 must be draft, is "%".', _status;
  END IF;
  IF _label <> 'pilot_hypothesis' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: Vaktare v1 must be labelled pilot_hypothesis, is "%".', _label;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_pack_competencies WHERE pack_version_id = _v;
  IF _n <> 6 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 6 competencies, found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_core_questions WHERE pack_version_id = _v;
  IF _n <> 8 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 8 core questions, found %.', _n; END IF;

  -- Q1..Q6 behavioural, Q7..Q8 situational, order 1..8.
  SELECT count(*) INTO _n FROM public.scp_interview_core_questions
   WHERE pack_version_id = _v AND display_order BETWEEN 1 AND 6 AND question_type = 'behavioural';
  IF _n <> 6 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: Q1-Q6 must be behavioural, found % such.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_core_questions
   WHERE pack_version_id = _v AND display_order BETWEEN 7 AND 8 AND question_type = 'situational';
  IF _n <> 2 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: Q7-Q8 must be situational, found % such.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_core_questions
   WHERE pack_version_id = _v AND code = ('Q' || display_order::text);
  IF _n <> 8 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: question codes must match their order, % matched.', _n; END IF;

  -- 40 anchors, 8 per level, level 0 never aggregable.
  SELECT count(*) INTO _n FROM public.scp_interview_rating_anchors a
    JOIN public.scp_interview_core_questions q ON q.id = a.question_id
   WHERE q.pack_version_id = _v;
  IF _n <> 40 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 40 anchors (8 questions x levels 0-4), found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_rating_anchors a
    JOIN public.scp_interview_core_questions q ON q.id = a.question_id
   WHERE q.pack_version_id = _v AND a.level = 0 AND a.counts_toward_aggregation;
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: a level-0 anchor claims to count toward aggregation.'; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_evidence_dimensions d
    JOIN public.scp_interview_core_questions q ON q.id = d.question_id
   WHERE q.pack_version_id = _v;
  IF _n <> 40 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 40 evidence dimensions, found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_approved_probes WHERE pack_version_id = _v;
  IF _n <> 48 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 48 approved probes (8 general + 40 question-specific), found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_verification_rules WHERE pack_version_id = _v;
  IF _n <> 5 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 5 verification rules, found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_prohibited_areas WHERE pack_version_id = _v;
  IF _n <> 14 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 14 prohibited areas, found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_pack_competency_map m
    JOIN public.scp_interview_pack_competencies c ON c.id = m.pack_competency_id
   WHERE c.pack_version_id = _v;
  IF _n <> 11 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: expected 11 competency mapping rows, found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_pack_competency_map m
    JOIN public.scp_interview_pack_competencies c ON c.id = m.pack_competency_id
   WHERE c.pack_version_id = _v AND m.mapping_state <> 'provisional';
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: a Vaktare competency mapping was seeded as confirmed; every mapping must arrive provisional.'; END IF;

  -- The whole point: it must NOT be publishable straight out of the migration.
  SELECT count(*) INTO _n FROM public.scp_interview_pack_validate(_v) WHERE severity = 'blocking';
  IF _n = 0 THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_ASSERT: the seeded Vaktare pilot reports no blocking reasons, which would mean it could be published without human review.';
  END IF;

  RAISE NOTICE 'SCP_INTERVIEW_ASSERT: Vaktare v1 import verified; % blocking reasons prevent publication, as intended.', _n;
END
$assert$;
