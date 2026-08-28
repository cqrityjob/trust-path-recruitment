-- ===========================================================================
-- CQrity Interview Intelligence — Phase 2: the employer interview runtime
-- ===========================================================================
--
-- Canonical, additive migration. Turns the governed Role Interview Pack domain
-- (20260918090000) into a working employer product: interview cases, sources,
-- AI runs, preparation plans, sessions, notes, evidence proposals, confirmed
-- evidence, findings, human assessments and immutable reports.
--
-- Filename note: the next CANONICAL slot after
-- 20260919090000_scp_interview_intelligence_registries.sql. Repository migration versions
-- run ahead of the wall clock; only the filename was chosen this way.
--
-- ---------------------------------------------------------------------------
-- THE RULE THAT SHAPES EVERY TABLE HERE
-- ---------------------------------------------------------------------------
-- An AI output must never silently become confirmed evidence.
--
-- So layer 4 (AI suggestion) and layer 5 (human-confirmed evidence) are
-- different TABLES -- scp_interview_evidence_proposals and
-- scp_interview_evidence -- and the only path between them is
-- scp_interview_confirm_evidence_proposal(), which records a human actor and
-- whether they accepted, edited or replaced the text. A single table with a
-- `confirmed boolean` would put "the model said it" and "a person stands
-- behind it" one UPDATE apart. The report reads ONLY the confirmed table.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY ABSENT
-- ---------------------------------------------------------------------------
--   * No decision table. The employment decision stays in job_applications,
--     outside the AI engine. This domain records THAT the decision is the
--     employer's and never what it was.
--   * No total, weighted score, threshold, ranking, suitability, credibility,
--     deception, emotion, stress or personality column -- not dormant, not
--     unused. scripts/interview-runtime-contract-check.ts fails the build on
--     the identifiers.
--   * No aggregation of the human 0-4 levels anywhere: no view, no function,
--     no generated column.
--
-- Two numeric columns exist and are defended in the ADR:
--   * evidence_proposals.extraction_confidence -- confidence in the EXTRACTION
--     operation, 0..1, never about the candidate, never aggregated, and
--     forbidden on a human-authored row by CHECK.
--   * assessments.level -- the human's 0-4 judgement against the pack anchors.
--
-- See docs/architecture/adr-interview-intelligence-runtime.md.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Fail fast. This migration is meaningless without the Phase 1 content domain
-- and the employer/recruitment identities it reuses rather than duplicates.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.scp_interview_pack_versions') IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_PRECONDITION: the Phase 1 Role Interview Pack domain (20260918090000) must be applied first.';
  END IF;
  IF to_regclass('public.scp_interview_core_questions') IS NULL
     OR to_regclass('public.scp_interview_approved_probes') IS NULL
     OR to_regclass('public.scp_interview_evidence_dimensions') IS NULL
     OR to_regclass('public.scp_interview_rating_anchors') IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_PRECONDITION: the governed pack content tables are missing.';
  END IF;
  IF to_regclass('public.employers') IS NULL
     OR to_regclass('public.jobs') IS NULL
     OR to_regclass('public.job_applications') IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_PRECONDITION: the recruitment model is missing; this domain reuses it and must not duplicate it.';
  END IF;
  IF to_regproc('public.has_employer_role') IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_PRECONDITION: public.has_employer_role() is missing.';
  END IF;
  IF to_regproc('public.is_platform_admin') IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_PRECONDITION: public.is_platform_admin() is missing.';
  END IF;
END $$;


-- ###########################################################################
-- SECTION 1 -- Platform configuration and the pilot grant
-- ###########################################################################

-- Feature flags that a human can see and an auditor can read, rather than an
-- environment variable nobody can inspect after the fact.
CREATE TABLE public.scp_interview_ai_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),   -- singleton

  -- Whether the orchestrator may reach a real provider at all. FALSE here means
  -- every task runs against the deterministic mock, which is a working product,
  -- not a stub.
  ai_enabled boolean NOT NULL DEFAULT false,

  -- Transcript ingestion is off until an owner turns it on AND the employer
  -- confirms a lawful basis per case. Two gates, both required.
  transcript_enabled boolean NOT NULL DEFAULT false,

  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_ai_config IS
  'Platform-level Interview Intelligence flags. ai_enabled=false is the shipped '
  'state: the product runs end to end on the deterministic mock provider. '
  'Turning it on is an owner decision, and it still requires a provider '
  'credential in the server environment.';

INSERT INTO public.scp_interview_ai_config (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;


-- An employer may run a pilot against a pack version that is NOT published --
-- the Vaktare pilot is a draft/pilot_hypothesis by design. This grant is how
-- that happens WITHOUT weakening the Phase 1 publish gate or letting the pack
-- claim validation it does not have.
CREATE TABLE public.scp_interview_pack_pilot_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  -- Why this employer may pilot unvalidated content, in words.
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  UNIQUE (employer_id, pack_version_id)
);

COMMENT ON TABLE public.scp_interview_pack_pilot_grants IS
  'A platform-admin grant letting ONE employer run a controlled pilot against a '
  'pack version that is not published. It does not mark the pack validated, '
  'does not change its content_status, and does not survive the pack being '
  'retired. Owner decision: provisional competency mappings block scientific '
  'and production claims, not controlled internal pilots.';

CREATE INDEX scp_interview_pack_pilot_grants_employer_idx
  ON public.scp_interview_pack_pilot_grants (employer_id) WHERE revoked_at IS NULL;


-- ###########################################################################
-- SECTION 2 -- The case: the runtime spine
-- ###########################################################################

CREATE TABLE public.scp_interview_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy. Every child row resolves to this employer, and every policy in
  -- this domain is ultimately a has_employer_role() check against it.
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,

  -- The recruitment context, REUSED rather than duplicated. All optional
  -- because an employer may interview for a role before a job advert exists,
  -- but at least one candidate identity is required (see the CHECK below).
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,

  -- The candidate. Either a platform account (when they applied through
  -- CQrityjob) or an external reference the employer typed in. Never both, and
  -- never neither: an interview case without a candidate is not a case.
  candidate_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  candidate_external_ref text,
  candidate_display_name text NOT NULL,

  -- WHAT IS BEING ASSESSED, pinned. A later pack revision must never change a
  -- running interview or a finished report, so these are the exact versions and
  -- they are frozen once the plan is approved.
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  role_version_id uuid NOT NULL
    REFERENCES public.scp_role_versions(id) ON DELETE RESTRICT,
  -- The pack's content hash at the moment the case pinned it. Proves
  -- retrospectively which exact content the interview ran against.
  pack_content_hash text,

  title text NOT NULL,

  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'sources_ready',
    'prep_generated',
    'prep_approved',
    'interview_in_progress',
    'interview_complete',
    'evidence_review',
    'assessed',
    'reported',
    'cancelled')),

  -- GDPR. Purpose is not optional: a source without a stated purpose is a
  -- source nobody can justify holding.
  purpose_code text NOT NULL DEFAULT 'recruitment_interview',
  retention_state text NOT NULL DEFAULT 'active'
    CHECK (retention_state IN ('active', 'restricted', 'erased')),
  retain_until date,

  -- The transcript gate, per case. The platform flag is the other half.
  transcript_lawful_basis_confirmed_at timestamptz,
  transcript_lawful_basis_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transcript_lawful_basis_statement text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_reason text,

  CONSTRAINT scp_interview_cases_candidate_identity
    CHECK (num_nonnulls(candidate_user_id, candidate_external_ref) = 1),
  CONSTRAINT scp_interview_cases_transcript_confirmation
    CHECK ((transcript_lawful_basis_confirmed_at IS NULL)
           = (transcript_lawful_basis_confirmed_by IS NULL))
);

COMMENT ON TABLE public.scp_interview_cases IS
  'One employer interviewing one candidate against one PINNED governed pack '
  'version. Carries no score, no ranking and no outcome: the employment '
  'decision lives in job_applications, outside this engine.';

COMMENT ON COLUMN public.scp_interview_cases.pack_content_hash IS
  'The pack version content hash at pinning time. A finished report states the '
  'hash it was built against, so "which content did this interview use" is '
  'answerable years later.';

CREATE INDEX scp_interview_cases_employer_idx
  ON public.scp_interview_cases (employer_id, updated_at DESC);
CREATE INDEX scp_interview_cases_status_idx
  ON public.scp_interview_cases (employer_id, status);
CREATE INDEX scp_interview_cases_application_idx
  ON public.scp_interview_cases (application_id) WHERE application_id IS NOT NULL;


-- ###########################################################################
-- SECTION 3 -- Layer 1: original sources and their immutable passages
-- ###########################################################################

CREATE TABLE public.scp_interview_case_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,

  source_kind text NOT NULL CHECK (source_kind IN (
    'job_description',
    'employer_requirements',
    'candidate_cv',
    'application_answers',
    'interviewer_notes',
    'transcript',
    'passport_disclosure')),

  label text NOT NULL,

  -- The content itself, for text sources. NULL when the source is a pointer to
  -- a record the platform already holds (linked_application_id), which is how
  -- the CV a candidate already submitted is used without being copied.
  content_text text,
  linked_application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,

  -- GDPR, required on every source. A source that cannot state its purpose and
  -- lawful basis does not get created.
  purpose_code text NOT NULL,
  lawful_basis_note text NOT NULL CHECK (length(btrim(lawful_basis_note)) > 0),

  -- Provenance of the source itself, distinct from anything derived from it.
  provided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provided_at timestamptz NOT NULL DEFAULT now(),
  origin text NOT NULL DEFAULT 'employer_supplied' CHECK (origin IN (
    'employer_supplied', 'candidate_application', 'candidate_shared', 'interviewer')),

  retention_state text NOT NULL DEFAULT 'active'
    CHECK (retention_state IN ('active', 'erased')),
  erased_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_interview_case_sources_has_content
    CHECK (content_text IS NOT NULL OR linked_application_id IS NOT NULL
           OR retention_state = 'erased'),
  CONSTRAINT scp_interview_case_sources_erasure
    CHECK ((retention_state = 'erased') = (erased_at IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_case_sources IS
  'Layer 1 of the trust model: what was actually supplied, before anything was '
  'derived from it. Erasure blanks the content and the passages while leaving '
  'the row, so the audit trail still records that a source existed.';

CREATE INDEX scp_interview_case_sources_case_idx
  ON public.scp_interview_case_sources (case_id, source_kind);


-- Immutable, addressable slices of a text source.
--
-- Every AI claim cites a passage id, never a character offset into mutable
-- text. An offset rots silently the moment the text is re-saved, and a citation
-- that rots is worse than no citation because it still looks like provenance.
CREATE TABLE public.scp_interview_source_passages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL
    REFERENCES public.scp_interview_case_sources(id) ON DELETE CASCADE,
  passage_index integer NOT NULL CHECK (passage_index >= 1),
  content text NOT NULL,
  -- Where it sat in the original, for rendering a source view. Advisory only:
  -- the passage text itself is the citable artefact.
  char_start integer,
  char_end integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, passage_index)
);

COMMENT ON TABLE public.scp_interview_source_passages IS
  'The citable unit. Written once at ingest and never updated: an immutability '
  'trigger refuses UPDATE, so a citation always resolves to the exact words the '
  'model was shown.';

CREATE INDEX scp_interview_source_passages_source_idx
  ON public.scp_interview_source_passages (source_id, passage_index);


-- ###########################################################################
-- SECTION 4 -- The AI run ledger (provenance for layers 3 and 4)
-- ###########################################################################

CREATE TABLE public.scp_interview_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,

  -- WHICH governed task, at WHICH version, with WHICH prompt. All three are
  -- required: "the AI did it" is not provenance.
  task text NOT NULL CHECK (task IN (
    'role_requirement_extraction',
    'candidate_source_extraction',
    'interview_preparation_generation',
    'governed_probe_selection',
    'contextual_probe_suggestion',
    'evidence_extraction',
    'evidence_dimension_mapping',
    'gap_and_contradiction_detection',
    'verification_item_detection',
    'interview_summary_draft',
    'report_draft_generation')),
  task_version text NOT NULL,
  prompt_version text NOT NULL,
  -- The rest of the pinned contract. Without these, "why did the system say
  -- that" stops being answerable the moment a policy or a schema moves.
  policy_version text NOT NULL DEFAULT '1.0.0',
  input_schema_version text NOT NULL DEFAULT '1.0.0',
  output_schema_version text NOT NULL DEFAULT '1.0.0',
  eval_set_version text,
  -- The registry row this run was executed under.
  ai_task_id uuid REFERENCES public.scp_ai_tasks(id) ON DELETE RESTRICT,

  -- WHICH engine produced it. 'mock' is a first-class provider, not a stub:
  -- the product is designed to work with no external provider configured.
  provider text NOT NULL,
  model text NOT NULL,

  status text NOT NULL DEFAULT 'running' CHECK (status IN (
    'running',
    'succeeded',
    -- Abstention is a SUCCESS of governance, not a failure of the model: the
    -- engine is expected to say "the sources do not support an answer" rather
    -- than produce one. It is a distinct status so it can be measured.
    'abstained',
    'schema_invalid',     -- the model returned something the contract rejects
    'policy_rejected',    -- the output tried to do something forbidden
    'citation_invalid',   -- claims without resolvable sources
    'provider_error',
    'timed_out',
    'cancelled')),

  -- Why the engine declined, in the governed vocabulary. Only set when
  -- status = 'abstained'.
  abstention_reason text CHECK (abstention_reason IS NULL OR abstention_reason IN (
    'insufficient_source_information',
    'not_establishable_from_evidence',
    'requires_human_clarification',
    'requires_separate_verification',
    'conflicting_sources',
    'prohibited_inference_requested',
    'outside_approved_task')),

  -- Why a non-success ended the way it did, in words a reviewer can act on.
  failure_reason text,
  -- The raw exchange, kept for audit only. NEVER the canonical business record:
  -- everything the product acts on is a typed row in the tables below.
  raw_request jsonb,
  raw_response jsonb,
  -- Hash of the exact input, so an identical re-run is recognisable.
  input_hash text,

  -- Operational metadata. No candidate content lives in these.
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_micros integer CHECK (cost_micros IS NULL OR cost_micros >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),

  -- Everything this engine produces is a proposal until a human says otherwise.
  requires_human_review boolean NOT NULL DEFAULT true,

  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,

  CONSTRAINT scp_interview_ai_runs_failure_has_reason
    CHECK (status IN ('running', 'succeeded', 'abstained') OR failure_reason IS NOT NULL),
  CONSTRAINT scp_interview_ai_runs_abstention
    CHECK ((status = 'abstained') = (abstention_reason IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_ai_runs IS
  'Every AI execution, successful or not. A failed run is KEPT: quarantining a '
  'bad output and being able to show it is the difference between a governed '
  'engine and one that silently retries until something passes.';

COMMENT ON COLUMN public.scp_interview_ai_runs.raw_response IS
  'Audit snapshot of the provider exchange. Deliberately jsonb and deliberately '
  'NOT the canonical record -- governed product state is typed and queryable in '
  'the tables that reference this run.';

CREATE INDEX scp_interview_ai_runs_case_idx
  ON public.scp_interview_ai_runs (case_id, started_at DESC);
CREATE INDEX scp_interview_ai_runs_task_idx
  ON public.scp_interview_ai_runs (task, status);


-- ###########################################################################
-- SECTION 5 -- Layer 3: AI extraction, typed
-- ###########################################################################

-- What the ROLE requires, extracted from the employer's own material.
CREATE TABLE public.scp_interview_role_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  ai_run_id uuid REFERENCES public.scp_interview_ai_runs(id) ON DELETE SET NULL,

  requirement_kind text NOT NULL CHECK (requirement_kind IN
    ('mandatory', 'preferred', 'contextual')),
  statement text NOT NULL,

  -- The trust classification. A source_grounded row MUST cite a passage; the
  -- constraint below is what makes that true of the data rather than of a
  -- prompt instruction the model may ignore.
  claim_class text NOT NULL DEFAULT 'source_grounded'
    CHECK (claim_class IN ('source_grounded', 'governed_content', 'ai_inference')),
  source_passage_id uuid
    REFERENCES public.scp_interview_source_passages(id) ON DELETE SET NULL,
  source_quote text,

  human_state text NOT NULL DEFAULT 'proposed'
    CHECK (human_state IN ('proposed', 'confirmed', 'edited', 'rejected')),
  human_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  human_actor_at timestamptz,

  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_interview_role_requirements_citation
    CHECK ((claim_class = 'source_grounded') = (source_passage_id IS NOT NULL)),
  CONSTRAINT scp_interview_role_requirements_human_actor
    CHECK ((human_state = 'proposed') = (human_actor_at IS NULL))
);

COMMENT ON TABLE public.scp_interview_role_requirements IS
  'Layer 3. What the employer''s material says the role needs. Every '
  'source_grounded row cites the exact passage it came from, enforced by CHECK.';

CREATE INDEX scp_interview_role_requirements_case_idx
  ON public.scp_interview_role_requirements (case_id, requirement_kind, display_order);


-- What the CANDIDATE's supplied sources factually say. Facts only: this table
-- has no opinion column, no suitability column and no rating.
CREATE TABLE public.scp_interview_candidate_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  ai_run_id uuid REFERENCES public.scp_interview_ai_runs(id) ON DELETE SET NULL,

  fact_kind text NOT NULL CHECK (fact_kind IN (
    'employment', 'education', 'credential', 'skill_claim', 'language', 'other')),
  statement text NOT NULL,

  claim_class text NOT NULL DEFAULT 'source_grounded'
    CHECK (claim_class IN ('source_grounded', 'governed_content', 'ai_inference')),
  source_passage_id uuid
    REFERENCES public.scp_interview_source_passages(id) ON DELETE SET NULL,
  source_quote text,

  -- Kept SEPARATE from anything the interview establishes. A CV statement is
  -- candidate-declared; it does not become verified by being extracted.
  source_status text NOT NULL DEFAULT 'candidate_declared' CHECK (source_status IN (
    'verified', 'candidate_declared', 'partial', 'no_evidence_yet', 'conflicting_facts')),

  human_state text NOT NULL DEFAULT 'proposed'
    CHECK (human_state IN ('proposed', 'confirmed', 'edited', 'rejected')),
  human_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  human_actor_at timestamptz,

  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_interview_candidate_facts_citation
    CHECK ((claim_class = 'source_grounded') = (source_passage_id IS NOT NULL)),
  CONSTRAINT scp_interview_candidate_facts_human_actor
    CHECK ((human_state = 'proposed') = (human_actor_at IS NULL))
);

COMMENT ON TABLE public.scp_interview_candidate_facts IS
  'Layer 3. What the candidate''s sources SAY, with a source_status that keeps '
  'declared apart from verified. Extraction never promotes a claim: a CV line '
  'stays candidate_declared no matter how confidently it was written.';

CREATE INDEX scp_interview_candidate_facts_case_idx
  ON public.scp_interview_candidate_facts (case_id, fact_kind, display_order);


-- ###########################################################################
-- SECTION 6 -- Layer 4: the preparation plan (AI suggestion → human approval)
-- ###########################################################################

CREATE TABLE public.scp_interview_prep_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  ai_run_id uuid REFERENCES public.scp_interview_ai_runs(id) ON DELETE SET NULL,

  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'superseded')),

  -- Narrative sections of the brief. Text, not JSON blobs of business rules:
  -- these are prose a human reads, and every candidate-specific claim they
  -- contain is carried as a cited row in prep_items.
  role_summary text,
  candidate_summary text,
  time_plan text,
  opening_guidance text,
  closing_guidance text,
  ai_disclosure text NOT NULL DEFAULT
    'Ett AI-stöd har strukturerat underlaget. Människor bedömer och beslutar. '
    'AI har inte poängsatt, rangordnat eller rekommenderat någon kandidat.',

  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  -- What the approver changed before approving. Substantive edits are recorded,
  -- because "the human approved it" means little if nobody can see what they
  -- changed.
  approval_note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (case_id, version_number),
  CONSTRAINT scp_interview_prep_plans_approval
    CHECK ((status = 'approved') = (approved_at IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_prep_plans IS
  'The Interview Preparation Brief. A draft is a suggestion; approving it makes '
  'it the ACTIVE interview plan. Only an approved plan can start an interview.';

CREATE INDEX scp_interview_prep_plans_case_idx
  ON public.scp_interview_prep_plans (case_id, version_number DESC);


-- The individual, citable elements of the brief.
CREATE TABLE public.scp_interview_prep_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.scp_interview_prep_plans(id) ON DELETE CASCADE,

  item_kind text NOT NULL CHECK (item_kind IN (
    'focus_area',        -- what to spend time on
    'relevant_experience',
    'missing_information',
    'ambiguity',         -- needs clarifying, NOT a suspicion
    'verification_point',
    'probe',             -- an approved probe selected from the pinned pack
    'clarification',     -- a permitted neutral contextual clarification
    'prohibited_reminder')),

  -- Which governed question this attaches to, when it attaches to one.
  question_id uuid
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,
  -- Task 4 is constrained SELECTION, not generation: a probe item must name a
  -- probe that already exists in the pinned pack. The trigger below proves the
  -- probe belongs to this case's pack version.
  probe_id uuid
    REFERENCES public.scp_interview_approved_probes(id) ON DELETE RESTRICT,

  statement text NOT NULL,

  claim_class text NOT NULL DEFAULT 'ai_inference'
    CHECK (claim_class IN ('source_grounded', 'governed_content', 'ai_inference')),
  source_passage_id uuid
    REFERENCES public.scp_interview_source_passages(id) ON DELETE SET NULL,
  source_quote text,

  human_state text NOT NULL DEFAULT 'proposed'
    CHECK (human_state IN ('proposed', 'confirmed', 'edited', 'rejected')),

  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_interview_prep_items_citation
    CHECK ((claim_class = 'source_grounded') = (source_passage_id IS NOT NULL)),
  CONSTRAINT scp_interview_prep_items_probe_kind
    CHECK ((item_kind = 'probe') = (probe_id IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_prep_items IS
  'Layer 4, itemised. A "probe" item can only point at a probe that already '
  'exists in the pinned pack -- selection, never generation. A "clarification" '
  'is the one place a neutral contextual question may be suggested, and it can '
  'never replace or rewrite a governed core question.';

CREATE INDEX scp_interview_prep_items_plan_idx
  ON public.scp_interview_prep_items (plan_id, item_kind, display_order);


-- ###########################################################################
-- SECTION 7 -- The interview session (PEACE state, notes, probe usage)
-- ###########################################################################

CREATE TABLE public.scp_interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  -- The plan actually in force. NOT NULL: an interview without an approved plan
  -- is not a governed interview.
  plan_id uuid NOT NULL REFERENCES public.scp_interview_prep_plans(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'paused', 'completed', 'abandoned')),

  -- PEACE as the session state machine. This describes the PROCESS, never the
  -- candidate.
  peace_stage text NOT NULL DEFAULT 'planning' CHECK (peace_stage IN (
    'planning', 'engage_explain', 'account', 'closure', 'evaluation')),

  interviewer_names text,
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  completed_at timestamptz,

  -- Deviations from the protocol are documented with a reason, per the source
  -- pack's binding rules.
  protocol_deviations text,

  -- ORBIT: the interviewer's own reflection on their conduct. About the
  -- INTERVIEWER. There is deliberately no counterpart column about the
  -- candidate anywhere in this table.
  process_reflection text,

  -- Autosave bookkeeping, so a browser crash mid-interview is recoverable.
  last_autosave_at timestamptz,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_sessions IS
  'One conducted interview. peace_stage and process_reflection are PROCESS '
  'quality about the interviewer''s conduct. No column here rates the '
  'candidate, and none may be added: PEACE and ORBIT are interviewer methods, '
  'not candidate measurements.';

CREATE INDEX scp_interview_sessions_case_idx
  ON public.scp_interview_sessions (case_id, started_at DESC);


-- Per-question progress. One row per governed question in the pinned pack.
CREATE TABLE public.scp_interview_session_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.scp_interview_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,

  -- Copied from the pack at session start so the workspace can order questions
  -- without a join, and so the ORDER a candidate was actually asked in is a
  -- recorded fact rather than a re-derivation.
  display_order integer NOT NULL,

  state text NOT NULL DEFAULT 'not_started' CHECK (state IN (
    'not_started', 'in_progress', 'answered', 'incomplete', 'revisit', 'skipped')),

  -- Documented, because skipping a governed question breaks comparability
  -- between candidates and must be explainable.
  skip_reason text,

  started_at timestamptz,
  completed_at timestamptz,
  elapsed_seconds integer CHECK (elapsed_seconds IS NULL OR elapsed_seconds >= 0),

  UNIQUE (session_id, question_id),
  CONSTRAINT scp_interview_session_questions_skip_reason
    CHECK (state <> 'skipped' OR (skip_reason IS NOT NULL AND length(btrim(skip_reason)) > 0))
);

CREATE INDEX scp_interview_session_questions_session_idx
  ON public.scp_interview_session_questions (session_id, display_order);


-- Structured interviewer notes. Layer 1: what the interviewer wrote down.
CREATE TABLE public.scp_interview_session_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.scp_interview_sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,

  note_kind text NOT NULL DEFAULT 'observation' CHECK (note_kind IN (
    'observation',      -- what was said or done
    'clarification',    -- what was asked to clarify
    'process',          -- something about the process, e.g. an accommodation
    'closing_summary')),-- the factual summary read back for correction

  body text NOT NULL,

  -- The candidate's own correction to a read-back summary. PEACE closure gives
  -- the candidate the right to correct the record, so the record has a place
  -- for it.
  candidate_correction text,

  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_session_notes IS
  'Interviewer notes -- a SOURCE, not evidence. Evidence is what a human later '
  'confirms from these, in scp_interview_evidence.';

CREATE INDEX scp_interview_session_notes_session_idx
  ON public.scp_interview_session_notes (session_id, created_at);


-- Which approved probe was actually used, and when. FR-05 traceability: in
-- governed mode a follow-up must be one of the pack's approved probes, and the
-- record shows which.
CREATE TABLE public.scp_interview_probe_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.scp_interview_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,

  -- Either an approved probe from the pack, or a permitted contextual
  -- clarification that a human chose to ask. Never free AI generation.
  probe_id uuid REFERENCES public.scp_interview_approved_probes(id) ON DELETE RESTRICT,
  contextual_text text,
  -- When a suggestion was offered and the interviewer declined it, that is
  -- itself a fact worth keeping: it shows the human stayed in control.
  outcome text NOT NULL DEFAULT 'used' CHECK (outcome IN ('used', 'suggested_not_used')),

  used_at timestamptz NOT NULL DEFAULT now(),
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT scp_interview_probe_usages_identity
    CHECK (num_nonnulls(probe_id, contextual_text) = 1)
);

CREATE INDEX scp_interview_probe_usages_session_idx
  ON public.scp_interview_probe_usages (session_id, question_id);


-- ###########################################################################
-- SECTION 8 -- Layer 4: AI-PROPOSED evidence
-- ###########################################################################
--
-- This table is the model's opinion. It is not evidence, it never reaches a
-- report, and there is no column here a human can flip to make it evidence.
-- ---------------------------------------------------------------------------

CREATE TABLE public.scp_interview_evidence_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  ai_run_id uuid NOT NULL REFERENCES public.scp_interview_ai_runs(id) ON DELETE RESTRICT,

  -- WHERE the excerpt came from. Exactly one of the two, and both are layer-1
  -- artefacts: an interviewer note or an authorised transcript passage.
  note_id uuid REFERENCES public.scp_interview_session_notes(id) ON DELETE CASCADE,
  source_passage_id uuid
    REFERENCES public.scp_interview_source_passages(id) ON DELETE CASCADE,

  -- The bounded excerpt itself. Bounded on purpose: an "excerpt" that is the
  -- whole document is not provenance.
  excerpt text NOT NULL CHECK (length(excerpt) <= 2000),

  -- WHAT it is evidence about, in the governed vocabulary of the pinned pack.
  question_id uuid NOT NULL
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,
  evidence_dimension_id uuid
    REFERENCES public.scp_interview_evidence_dimensions(id) ON DELETE RESTRICT,
  pack_competency_id uuid
    REFERENCES public.scp_interview_pack_competencies(id) ON DELETE RESTRICT,

  -- Confidence in the EXTRACTION AND MAPPING OPERATION. Not about the
  -- candidate: not quality, not credibility, not truthfulness, not competence,
  -- not suitability, not hiring confidence. The column comment and a test both
  -- say so, and it is never aggregated anywhere.
  extraction_confidence numeric(3,2)
    CHECK (extraction_confidence IS NULL
           OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),

  -- ---- The explainability contract -------------------------------------
  -- A suggestion an employer cannot interrogate is a suggestion they cannot
  -- meaningfully review, and "based on the candidate profile" is not an
  -- explanation. Every material proposal must be able to answer: why is this
  -- relevant, which governed rule applies, what is uncertain, and what the
  -- engine is NOT allowed to conclude from it.
  relevance_rationale text NOT NULL DEFAULT '',
  uncertainty_note text,
  prohibited_conclusion_note text,

  review_state text NOT NULL DEFAULT 'pending' CHECK (review_state IN (
    'pending', 'confirmed', 'edited', 'rejected', 'unresolved')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,

  -- WHY a human changed or rejected it. This taxonomy is the learning loop's
  -- input: it separates a model error from an ambiguous source from a reviewer
  -- simply preferring different words, which are four different fixes.
  correction_class text CHECK (correction_class IS NULL OR correction_class IN (
    'ai_model_error',
    'retrieval_error',
    'missing_source',
    'ambiguous_source',
    'incorrect_mapping',
    'inappropriate_probe',
    'policy_violation',
    'user_preference',
    'reviewer_disagreement')),

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_interview_evidence_proposals_correction_class
    CHECK (review_state NOT IN ('edited', 'rejected') OR correction_class IS NOT NULL),
  CONSTRAINT scp_interview_evidence_proposals_origin
    CHECK (num_nonnulls(note_id, source_passage_id) = 1),
  CONSTRAINT scp_interview_evidence_proposals_reviewed
    CHECK ((review_state = 'pending') = (reviewed_at IS NULL))
);

COMMENT ON TABLE public.scp_interview_evidence_proposals IS
  'Layer 4. AI-proposed evidence, always carrying its run (and through it the '
  'task, prompt, provider and model versions). Nothing here reaches a report. '
  'A human turns a proposal into evidence through '
  'scp_interview_confirm_evidence_proposal(), which writes a DIFFERENT table.';

COMMENT ON COLUMN public.scp_interview_evidence_proposals.extraction_confidence IS
  'Confidence in the extraction/mapping OPERATION, 0..1. Never candidate '
  'quality, credibility, truthfulness, competence, suitability or hiring '
  'confidence. Never aggregated. Absent on human-authored evidence by design -- '
  'that row lives in scp_interview_evidence, which has no such column at all.';

CREATE INDEX scp_interview_evidence_proposals_case_idx
  ON public.scp_interview_evidence_proposals (case_id, review_state);
CREATE INDEX scp_interview_evidence_proposals_question_idx
  ON public.scp_interview_evidence_proposals (question_id);


-- ###########################################################################
-- SECTION 9 -- Layer 5: HUMAN-CONFIRMED evidence
-- ###########################################################################
--
-- Note what this table does NOT have: no confidence column of any kind. Once a
-- human stands behind an excerpt, a machine's confidence in having found it is
-- no longer part of the record.
-- ---------------------------------------------------------------------------

CREATE TABLE public.scp_interview_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,

  -- Where it came from, if it began as a proposal. NULL means a human wrote it
  -- from scratch, which is always allowed and never requires an AI run.
  proposal_id uuid UNIQUE
    REFERENCES public.scp_interview_evidence_proposals(id) ON DELETE SET NULL,

  origin text NOT NULL CHECK (origin IN (
    'ai_proposed_accepted',   -- human took the excerpt as-is
    'ai_proposed_edited',     -- human corrected it; both texts are kept
    'human_authored')),       -- no AI involved

  note_id uuid REFERENCES public.scp_interview_session_notes(id) ON DELETE SET NULL,
  source_passage_id uuid
    REFERENCES public.scp_interview_source_passages(id) ON DELETE SET NULL,

  excerpt text NOT NULL CHECK (length(excerpt) <= 2000),
  -- The AI's original wording when the human edited it. Keeping both is what
  -- makes the human correction rate measurable and the correction auditable.
  original_excerpt text,

  question_id uuid NOT NULL
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,
  evidence_dimension_id uuid
    REFERENCES public.scp_interview_evidence_dimensions(id) ON DELETE RESTRICT,
  pack_competency_id uuid
    REFERENCES public.scp_interview_pack_competencies(id) ON DELETE RESTRICT,

  -- WHO stands behind it. Not nullable: unattributed evidence is not evidence.
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  -- Required when the human changed the AI's text, so a material correction is
  -- always explained.
  correction_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_interview_evidence_edited_keeps_original
    CHECK (origin <> 'ai_proposed_edited'
           OR (original_excerpt IS NOT NULL AND correction_note IS NOT NULL)),
  CONSTRAINT scp_interview_evidence_proposal_origin
    CHECK ((origin = 'human_authored') = (proposal_id IS NULL))
);

COMMENT ON TABLE public.scp_interview_evidence IS
  'Layer 5. Evidence a named human confirmed. The ONLY table a report reads. '
  'It has no confidence column: once a person stands behind an excerpt, a '
  'model''s confidence in having found it is not part of the record.';

CREATE INDEX scp_interview_evidence_case_idx
  ON public.scp_interview_evidence (case_id, question_id);


-- ###########################################################################
-- SECTION 10 -- Gaps, contradictions and verification items
-- ###########################################################################

CREATE TABLE public.scp_interview_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  ai_run_id uuid REFERENCES public.scp_interview_ai_runs(id) ON DELETE SET NULL,

  finding_kind text NOT NULL CHECK (finding_kind IN (
    'gap',              -- something the account did not cover
    'unclear',          -- something said that is not yet understandable
    'contradiction',    -- two sources disagree -- a DIFFERENCE, not a lie
    'verification')),   -- a claim to be checked outside the interview

  statement text NOT NULL,
  -- Why it matters, in neutral language.
  rationale text,

  question_id uuid REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,
  -- The pack's own verification rule this finding falls under, when it does.
  verification_rule_id uuid
    REFERENCES public.scp_interview_verification_rules(id) ON DELETE RESTRICT,

  claim_class text NOT NULL DEFAULT 'ai_inference'
    CHECK (claim_class IN ('source_grounded', 'governed_content', 'ai_inference')),
  source_passage_id uuid
    REFERENCES public.scp_interview_source_passages(id) ON DELETE SET NULL,

  -- The neutral vocabulary the source pack mandates. There is deliberately no
  -- value here meaning "lie", "deceptive" or "not credible": a difference
  -- between two documents is a difference, and resolving it is a separate,
  -- lawful process outside this engine.
  resolution_state text NOT NULL DEFAULT 'open' CHECK (resolution_state IN (
    'open',
    'needs_verification',
    'corrected_by_candidate',
    'unresolved_difference',
    'resolved',
    'not_relevant')),

  human_state text NOT NULL DEFAULT 'proposed'
    CHECK (human_state IN ('proposed', 'confirmed', 'edited', 'rejected')),
  human_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  human_actor_at timestamptz,
  human_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_interview_findings_citation
    CHECK ((claim_class = 'source_grounded') = (source_passage_id IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_findings IS
  'Gaps, unclear points, differences between sources, and things needing '
  'verification. resolution_state has no value meaning dishonesty: the source '
  'pack forbids recording "lie" or "deceptive" without a separate authorised '
  'and lawful process outside this engine.';

CREATE INDEX scp_interview_findings_case_idx
  ON public.scp_interview_findings (case_id, finding_kind, resolution_state);


-- ###########################################################################
-- SECTION 11 -- Layer 5: the human assessment
-- ###########################################################################

CREATE TABLE public.scp_interview_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,

  question_id uuid NOT NULL
    REFERENCES public.scp_interview_core_questions(id) ON DELETE RESTRICT,

  -- The human's judgement against the pack's own anchors for THIS question.
  -- The anchor is referenced, not copied: an assessment is meaningless without
  -- the behavioural description it was made against.
  anchor_id uuid NOT NULL
    REFERENCES public.scp_interview_rating_anchors(id) ON DELETE RESTRICT,
  level integer NOT NULL CHECK (level BETWEEN 0 AND 4),

  -- Not optional. A level without reasoning is a number, not an assessment.
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  -- Where the assessor is unsure, or what else could explain the account.
  uncertainty_note text,

  assessor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assessed_at timestamptz NOT NULL DEFAULT now(),

  -- Individual judgements lock before any panel discussion, so one assessor
  -- cannot be anchored by another's number. A locked row is immutable; a later
  -- change is a NEW row superseding it, never an edit.
  locked_at timestamptz,
  superseded_by uuid REFERENCES public.scp_interview_assessments(id) ON DELETE SET NULL,
  supersede_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- One live assessment per assessor per question. A superseded row keeps its
  -- place in history.
  CONSTRAINT scp_interview_assessments_supersede
    CHECK ((superseded_by IS NULL) = (supersede_reason IS NULL))
);

COMMENT ON TABLE public.scp_interview_assessments IS
  'Layer 5. A named human''s 0-4 judgement against a named pack anchor, with '
  'written reasoning. There is NO view, function or generated column anywhere '
  'in this schema that sums, averages, weights or ranks these levels, and a '
  'test asserts none appears. Level 0 means INSUFFICIENT EVIDENCE -- the anchor '
  'it references carries counts_toward_aggregation = false, which is the same '
  'fact said in the content layer.';

CREATE UNIQUE INDEX scp_interview_assessments_live_idx
  ON public.scp_interview_assessments (case_id, question_id, assessor_id)
  WHERE superseded_by IS NULL;
CREATE INDEX scp_interview_assessments_case_idx
  ON public.scp_interview_assessments (case_id, question_id);


-- ###########################################################################
-- SECTION 12 -- The immutable report
-- ###########################################################################

CREATE TABLE public.scp_interview_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'final', 'superseded')),

  -- The AI's draft language, kept SEPARATE from the finalised payload so a
  -- reader can always see what the model wrote and what the human published.
  draft_summary text,
  draft_ai_run_id uuid REFERENCES public.scp_interview_ai_runs(id) ON DELETE SET NULL,

  -- The frozen snapshot. jsonb here is correct: it is a point-in-time RENDERING
  -- of rows that remain individually queryable in their own typed tables. No
  -- business rule, permission or lifecycle state lives only in here.
  payload jsonb,
  -- Hash of the payload, so tampering is detectable.
  content_hash text,

  -- What the report was built against. Copied, not joined: the whole purpose of
  -- a snapshot is that it survives the content changing.
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  pack_content_hash text,
  role_version_id uuid NOT NULL
    REFERENCES public.scp_role_versions(id) ON DELETE RESTRICT,

  finalised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalised_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (case_id, version_number),
  CONSTRAINT scp_interview_reports_final
    CHECK ((status = 'final') = (finalised_at IS NOT NULL)),
  CONSTRAINT scp_interview_reports_final_has_payload
    CHECK (status <> 'final' OR (payload IS NOT NULL AND content_hash IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_reports IS
  'The immutable Candidate Interview Report. Built ONLY from human-confirmed '
  'evidence and human assessments; an AI proposal cannot reach it. It states '
  'that the employment decision is the employer''s and records no outcome, '
  'because this engine does not make or store one.';

CREATE INDEX scp_interview_reports_case_idx
  ON public.scp_interview_reports (case_id, version_number DESC);


-- ###########################################################################
-- SECTION 13 -- Append-only audit
-- ###########################################################################

CREATE TABLE public.scp_interview_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,

  event text NOT NULL CHECK (event IN (
    'case_created',
    'source_added',
    'source_erased',
    'transcript_authorised',
    'ai_run_started',
    'ai_run_succeeded',
    'ai_run_failed',
    'prep_generated',
    'prep_edited',
    'prep_approved',
    'interview_started',
    'interview_paused',
    'interview_resumed',
    'interview_completed',
    'probe_used',
    'evidence_proposed',
    'evidence_confirmed',
    'evidence_edited',
    'evidence_rejected',
    'evidence_authored',
    'finding_recorded',
    'finding_resolved',
    'assessment_recorded',
    'assessment_superseded',
    'report_drafted',
    'report_finalised',
    'case_cancelled',
    'retention_applied')),

  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 'human' or 'ai'. The audit trail must make it possible to answer "did a
  -- person do this or did the engine" without inferring it from the event name.
  actor_kind text NOT NULL DEFAULT 'human' CHECK (actor_kind IN ('human', 'ai', 'system')),

  ai_run_id uuid REFERENCES public.scp_interview_ai_runs(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  reason text,

  -- Governance metadata ONLY. No candidate source content, no excerpt, no note
  -- body. A test asserts the writer cannot be used to smuggle content here.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_case_events IS
  'Append-only governance history for a case. No client INSERT grant exists: '
  'the only writer is a SECURITY DEFINER RPC, so a browser cannot forge, '
  'backdate or omit an event.';

CREATE INDEX scp_interview_case_events_case_idx
  ON public.scp_interview_case_events (case_id, seq DESC);


-- ###########################################################################
-- SECTION 14 -- Retrieval provenance
-- ###########################################################################
--
-- If the engine retrieves governed knowledge to ground a run, WHICH records it
-- retrieved is part of the answer to "why did it say that". Similarity is not
-- truth: retrieval only proposes candidates, the canonical record id and
-- version are what get pinned, and deterministic filtering happens after
-- retrieval, never instead of it.
--
-- The vector index, if one is ever added, is a cache over these canonical rows
-- and never the source of truth.
-- ---------------------------------------------------------------------------

CREATE TABLE public.scp_interview_ai_run_retrievals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_run_id uuid NOT NULL REFERENCES public.scp_interview_ai_runs(id) ON DELETE CASCADE,

  -- The canonical record that was retrieved, by kind and id -- never a vector
  -- id, never a chunk id without a canonical anchor.
  record_kind text NOT NULL CHECK (record_kind IN (
    'interview_pack_version', 'interview_question', 'approved_probe',
    'evidence_dimension', 'rating_anchor', 'verification_rule',
    'prohibited_area', 'interview_competency',
    'research_claim', 'interview_method', 'method_practice',
    'case_source', 'source_passage')),
  record_id uuid NOT NULL,
  record_version text,

  -- How it was found, and how strongly it matched. The score is about the
  -- RETRIEVAL operation and is never shown as a fact about anything.
  retrieval_method text NOT NULL DEFAULT 'deterministic' CHECK (retrieval_method IN (
    'deterministic', 'lexical', 'vector')),
  similarity numeric(4,3) CHECK (similarity IS NULL OR (similarity >= 0 AND similarity <= 1)),
  embedding_model_version text,

  -- Whether it survived the deterministic filter and actually reached the
  -- prompt. Retrieved-but-filtered is kept: it explains what the engine chose
  -- NOT to use.
  used_in_prompt boolean NOT NULL DEFAULT true,
  filtered_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ai_run_id, record_kind, record_id)
);

COMMENT ON TABLE public.scp_interview_ai_run_retrievals IS
  'Which canonical governed records influenced an AI run. similarity describes '
  'the RETRIEVAL match, never truth and never anything about a candidate. '
  'Records that were retrieved and then filtered out are kept, because what the '
  'engine declined to use is part of explaining what it did.';

CREATE INDEX scp_interview_ai_run_retrievals_run_idx
  ON public.scp_interview_ai_run_retrievals (ai_run_id);


-- ###########################################################################
-- SECTION 15 -- Interview process quality
-- ###########################################################################
--
-- Measures of how the INTERVIEW was conducted and how complete the EVIDENCE is.
-- Every measure here is about the process or the interviewer. None is about the
-- candidate, and the view below is deliberately built so that it CANNOT become
-- a candidate score: it contains no assessment level, no average of levels and
-- no per-candidate comparison.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.scp_interview_process_quality
WITH (security_invoker = true) AS
SELECT
  c.id                                      AS case_id,
  c.employer_id,
  c.status,

  -- Coverage: did we actually run the interview we said we would?
  (SELECT count(*) FROM public.scp_interview_core_questions q
    WHERE q.pack_version_id = c.pack_version_id)                  AS questions_in_pack,
  (SELECT count(*) FROM public.scp_interview_session_questions sq
     JOIN public.scp_interview_sessions se ON se.id = sq.session_id
    WHERE se.case_id = c.id AND sq.state = 'answered')            AS questions_answered,
  (SELECT count(*) FROM public.scp_interview_session_questions sq
     JOIN public.scp_interview_sessions se ON se.id = sq.session_id
    WHERE se.case_id = c.id AND sq.state IN ('incomplete','revisit','not_started'))
                                                                  AS questions_unresolved,
  (SELECT count(*) FROM public.scp_interview_session_questions sq
     JOIN public.scp_interview_sessions se ON se.id = sq.session_id
    WHERE se.case_id = c.id AND sq.state = 'skipped')             AS questions_skipped,

  -- Evidence coverage: how much of the evidence we set out to gather exists,
  -- and has a human stood behind it.
  (SELECT count(DISTINCT d.id) FROM public.scp_interview_evidence_dimensions d
     JOIN public.scp_interview_core_questions q ON q.id = d.question_id
    WHERE q.pack_version_id = c.pack_version_id)                  AS dimensions_in_pack,
  (SELECT count(DISTINCT ev.evidence_dimension_id) FROM public.scp_interview_evidence ev
    WHERE ev.case_id = c.id AND ev.evidence_dimension_id IS NOT NULL)
                                                                  AS dimensions_with_confirmed_evidence,

  -- Human control: how much of what the engine proposed a person actually
  -- reviewed, and how often they had to change it.
  (SELECT count(*) FROM public.scp_interview_evidence_proposals p
    WHERE p.case_id = c.id)                                       AS proposals_total,
  (SELECT count(*) FROM public.scp_interview_evidence_proposals p
    WHERE p.case_id = c.id AND p.review_state = 'pending')        AS proposals_awaiting_review,
  (SELECT count(*) FROM public.scp_interview_evidence_proposals p
    WHERE p.case_id = c.id AND p.review_state IN ('edited','rejected'))
                                                                  AS proposals_corrected,
  (SELECT count(*) FROM public.scp_interview_evidence ev
    WHERE ev.case_id = c.id AND ev.origin = 'human_authored')     AS evidence_human_authored,

  -- Unresolved work: what still needs a person.
  (SELECT count(*) FROM public.scp_interview_findings f
    WHERE f.case_id = c.id AND f.finding_kind = 'verification'
      AND f.resolution_state IN ('open','needs_verification'))    AS verifications_outstanding,
  (SELECT count(*) FROM public.scp_interview_findings f
    WHERE f.case_id = c.id AND f.finding_kind IN ('gap','unclear')
      AND f.resolution_state = 'open')                            AS gaps_open,

  -- Insufficient evidence is a PROCESS outcome. Counting it here, next to
  -- coverage, is the whole point: it says "we did not establish this", not
  -- "the candidate is weak".
  (SELECT count(*) FROM public.scp_interview_assessments a
    WHERE a.case_id = c.id AND a.level = 0 AND a.superseded_by IS NULL)
                                                                  AS insufficient_evidence_count,
  (SELECT count(*) FROM public.scp_interview_assessments a
    WHERE a.case_id = c.id AND a.superseded_by IS NULL)           AS assessments_recorded,
  (SELECT count(DISTINCT a.assessor_id) FROM public.scp_interview_assessments a
    WHERE a.case_id = c.id AND a.superseded_by IS NULL)           AS assessors_involved,

  -- Process fidelity: was the interview conducted as the method requires?
  (SELECT bool_or(se.process_reflection IS NOT NULL) FROM public.scp_interview_sessions se
    WHERE se.case_id = c.id)                                      AS interviewer_reflected,
  (SELECT bool_or(se.protocol_deviations IS NOT NULL) FROM public.scp_interview_sessions se
    WHERE se.case_id = c.id)                                      AS protocol_deviation_recorded
FROM public.scp_interview_cases c;

COMMENT ON VIEW public.scp_interview_process_quality IS
  'Interview PROCESS quality. Every column counts questions, dimensions, '
  'proposals, corrections or unresolved work -- artefacts of how the interview '
  'was run. There is deliberately NO assessment level, no average, no total and '
  'no cross-candidate comparison here, and a test asserts none appears: the '
  'moment this view could be read as a candidate score it would have become '
  'the ranking the product forbids.';

-- A VIEW picks up Supabase's default privileges exactly as a table does, so the
-- revoke is as necessary here as anywhere else. security_invoker = true means
-- the caller's RLS applies to the underlying tables, but an anon grant on the
-- view would still be a grant nobody intended -- and the platform's own suite
-- asserts that no scp_ relation carries one.
REVOKE ALL ON public.scp_interview_process_quality FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scp_interview_process_quality TO authenticated;
GRANT ALL    ON public.scp_interview_process_quality TO service_role;


-- ###########################################################################
-- SECTION 16 -- Tenancy helpers
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_case_employer(_case_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.employer_id FROM public.scp_interview_cases c WHERE c.id = _case_id;
$$;
REVOKE ALL ON FUNCTION public.scp_iv_case_employer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_employer(uuid) TO authenticated, service_role;

-- Read access to a case. NULL case -> false, so it fails closed on a bad id.
CREATE OR REPLACE FUNCTION public.scp_iv_can_read_case(_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id), NULL);
$$;
REVOKE ALL ON FUNCTION public.scp_iv_can_read_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_can_read_case(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_can_read_case(uuid) IS
  'Membership of the case''s employer, and nothing else. A platform admin is '
  'deliberately NOT included: candidate interview material is tenant data, and '
  'oversight of it is a separate, narrower decision than oversight of governed '
  'content.';

-- Write access. Members write; only owners and admins finalise (enforced in the
-- RPCs, which is where the destructive acts live).
CREATE OR REPLACE FUNCTION public.scp_iv_can_write_case(_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id),
                                  ARRAY['owner','admin','member'])
     AND EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = _case_id
                    AND c.status <> 'cancelled'
                    AND c.retention_state = 'active');
$$;
REVOKE ALL ON FUNCTION public.scp_iv_can_write_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_can_write_case(uuid) TO authenticated, service_role;

-- Resolve a session to its case, for the session-child policies.
CREATE OR REPLACE FUNCTION public.scp_iv_session_case(_session_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.case_id FROM public.scp_interview_sessions s WHERE s.id = _session_id;
$$;
REVOKE ALL ON FUNCTION public.scp_iv_session_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_session_case(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_iv_source_case(_source_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.case_id FROM public.scp_interview_case_sources s WHERE s.id = _source_id;
$$;
REVOKE ALL ON FUNCTION public.scp_iv_source_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_source_case(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_iv_plan_case(_plan_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.case_id FROM public.scp_interview_prep_plans p WHERE p.id = _plan_id;
$$;
REVOKE ALL ON FUNCTION public.scp_iv_plan_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_plan_case(uuid) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 17 -- Guards
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 17.1  Case status transitions.
--
--       Same shape as the Phase 1 guard and for the same reason: a legal
--       transition table, a transaction-local marker only the governed RPCs
--       set, and an ELSE that refuses. A client with UPDATE rights still cannot
--       walk a case to 'reported' by hand.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_guard_case_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _governed boolean := coalesce(current_setting('scp_iv.governed_transition', true), '') = 'on';
  _legal boolean;
BEGIN
  IF NEW.employer_id IS DISTINCT FROM OLD.employer_id THEN
    RAISE EXCEPTION 'SCP_IV_TENANT_IMMUTABLE: a case never changes employer.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The pinned content is frozen once the plan is approved. This is the
  -- promise that a later pack revision cannot change a running interview or a
  -- finished report retrospectively.
  IF OLD.status NOT IN ('draft', 'sources_ready', 'prep_generated')
     AND (NEW.pack_version_id IS DISTINCT FROM OLD.pack_version_id
          OR NEW.role_version_id IS DISTINCT FROM OLD.role_version_id
          OR NEW.pack_content_hash IS DISTINCT FROM OLD.pack_content_hash) THEN
    RAISE EXCEPTION
      'SCP_IV_PIN_IMMUTABLE: the pinned pack/role version is frozen from prep_approved onward. Start a new case instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _legal := CASE OLD.status
      WHEN 'draft'                 THEN NEW.status IN ('sources_ready', 'cancelled')
      WHEN 'sources_ready'         THEN NEW.status IN ('prep_generated', 'draft', 'cancelled')
      WHEN 'prep_generated'        THEN NEW.status IN ('prep_approved', 'sources_ready', 'cancelled')
      WHEN 'prep_approved'         THEN NEW.status IN ('interview_in_progress', 'prep_generated', 'cancelled')
      WHEN 'interview_in_progress' THEN NEW.status IN ('interview_complete', 'cancelled')
      WHEN 'interview_complete'    THEN NEW.status IN ('evidence_review', 'cancelled')
      WHEN 'evidence_review'       THEN NEW.status IN ('assessed', 'interview_complete', 'cancelled')
      WHEN 'assessed'              THEN NEW.status IN ('reported', 'evidence_review', 'cancelled')
      WHEN 'reported'              THEN false
      WHEN 'cancelled'             THEN false
      ELSE false
    END;

    IF NOT _legal THEN
      RAISE EXCEPTION 'SCP_IV_ILLEGAL_TRANSITION: "%" -> "%" is not a permitted interview case transition.',
        OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;

    IF NOT _governed THEN
      RAISE EXCEPTION
        'SCP_IV_UNGOVERNED_TRANSITION: case status may only be changed by a governed RPC, never by a direct table update.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_case_transition() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_cases_transition
  BEFORE UPDATE ON public.scp_interview_cases
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_case_transition();


-- ---------------------------------------------------------------------------
-- 17.2  The transcript gate.
--
--       TWO independent conditions, checked in the database rather than in the
--       form: the platform flag, and this employer's explicit confirmation on
--       THIS case that it has a lawful basis and has met its information and
--       consent duties. A transcript source cannot exist without both.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_guard_transcript_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _enabled boolean;
  _confirmed timestamptz;
BEGIN
  IF NEW.source_kind <> 'transcript' THEN RETURN NEW; END IF;

  SELECT transcript_enabled INTO _enabled FROM public.scp_interview_ai_config WHERE id;
  IF NOT coalesce(_enabled, false) THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_DISABLED: transcript ingestion is switched off for this deployment. It is an owner decision, not a per-case setting.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT transcript_lawful_basis_confirmed_at INTO _confirmed
    FROM public.scp_interview_cases WHERE id = NEW.case_id;
  IF _confirmed IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_NO_LAWFUL_BASIS: this case has no recorded confirmation that the employer has a lawful basis and has met its information/consent obligations.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_transcript_gate() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_case_sources_transcript_gate
  BEFORE INSERT OR UPDATE ON public.scp_interview_case_sources
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_transcript_gate();


-- ---------------------------------------------------------------------------
-- 17.3  Passages are written once and never rewritten.
--       A citation must resolve to the exact words the model was shown.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_guard_passage_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Erasure is the one permitted change: blanking content is a GDPR duty, and
  -- it is visible because the source row records erased_at.
  IF TG_OP = 'UPDATE' AND NEW.content = '' AND OLD.content <> '' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'SCP_IV_PASSAGE_IMMUTABLE: a cited passage is never edited. Add a new source instead.'
    USING ERRCODE = 'check_violation';
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_passage_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_source_passages_immutable
  BEFORE UPDATE ON public.scp_interview_source_passages
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_passage_immutable();


-- ---------------------------------------------------------------------------
-- 17.4  A probe used, selected or suggested must belong to the case's PINNED
--       pack version. This is what makes "AI cannot invent probes" true of the
--       data rather than of the prompt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_guard_probe_in_pinned_pack()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_id uuid;
  _pack_version uuid;
  _probe_pack uuid;
BEGIN
  IF NEW.probe_id IS NULL THEN RETURN NEW; END IF;

  -- IF/ELSIF rather than a CASE expression: PL/pgSQL evaluates a CASE as one
  -- expression, so every branch's field would have to exist on NEW -- and
  -- NEW.plan_id does not exist when this fires on probe_usages. Only the taken
  -- branch is executed here.
  IF TG_TABLE_NAME = 'scp_interview_probe_usages' THEN
    _case_id := public.scp_iv_session_case(NEW.session_id);
  ELSIF TG_TABLE_NAME = 'scp_interview_prep_items' THEN
    _case_id := public.scp_iv_plan_case(NEW.plan_id);
  ELSE
    _case_id := NULL;
  END IF;

  IF _case_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_PROBE_GUARD_UNKNOWN_TABLE: scp_iv_guard_probe_in_pinned_pack() was attached to "%", which it cannot resolve to a case. Refusing rather than allowing an unchecked write.',
      TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;

  SELECT pack_version_id INTO _pack_version
    FROM public.scp_interview_cases WHERE id = _case_id;
  SELECT pack_version_id INTO _probe_pack
    FROM public.scp_interview_approved_probes WHERE id = NEW.probe_id;

  IF _pack_version IS NULL OR _probe_pack IS NULL OR _pack_version <> _probe_pack THEN
    RAISE EXCEPTION
      'SCP_IV_PROBE_NOT_IN_PACK: a probe must come from the pack version this case pinned. Governed mode permits approved probes only.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_probe_in_pinned_pack() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_probe_usages_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_probe_usages
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_probe_in_pinned_pack();
CREATE TRIGGER scp_interview_prep_items_probe_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_prep_items
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_probe_in_pinned_pack();


-- ---------------------------------------------------------------------------
-- 17.5  A question referenced anywhere in a case must belong to the pinned
--       pack. Q1-Q8 immutability at runtime: the case can only ever talk about
--       the questions its own pinned pack defines.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_guard_question_in_pinned_pack()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_id uuid;
  _pack_version uuid;
  _question_pack uuid;
BEGIN
  IF NEW.question_id IS NULL THEN RETURN NEW; END IF;

  -- IF/ELSIF, not a CASE expression: PL/pgSQL would otherwise have to resolve
  -- every branch's field against NEW, and these eight tables deliberately do
  -- not share a shape.
  IF TG_TABLE_NAME IN ('scp_interview_session_questions',
                       'scp_interview_session_notes',
                       'scp_interview_probe_usages') THEN
    _case_id := public.scp_iv_session_case(NEW.session_id);
  ELSIF TG_TABLE_NAME = 'scp_interview_prep_items' THEN
    _case_id := public.scp_iv_plan_case(NEW.plan_id);
  ELSIF TG_TABLE_NAME IN ('scp_interview_evidence_proposals',
                          'scp_interview_evidence',
                          'scp_interview_findings',
                          'scp_interview_assessments') THEN
    _case_id := NEW.case_id;
  ELSE
    _case_id := NULL;
  END IF;

  IF _case_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_QUESTION_GUARD_UNKNOWN_TABLE: scp_iv_guard_question_in_pinned_pack() was attached to "%", which it cannot resolve to a case.',
      TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;

  SELECT pack_version_id INTO _pack_version
    FROM public.scp_interview_cases WHERE id = _case_id;
  SELECT pack_version_id INTO _question_pack
    FROM public.scp_interview_core_questions WHERE id = NEW.question_id;

  IF _pack_version IS NULL OR _question_pack IS NULL OR _pack_version <> _question_pack THEN
    RAISE EXCEPTION
      'SCP_IV_QUESTION_NOT_IN_PACK: this case can only reference questions from the pack version it pinned.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_question_in_pinned_pack() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_session_questions_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_session_questions
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();
CREATE TRIGGER scp_interview_session_notes_question_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_session_notes
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();
CREATE TRIGGER scp_interview_probe_usages_question_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_probe_usages
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();
CREATE TRIGGER scp_interview_prep_items_question_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_prep_items
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();
CREATE TRIGGER scp_interview_evidence_proposals_question_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_evidence_proposals
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();
CREATE TRIGGER scp_interview_evidence_question_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_evidence
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();
CREATE TRIGGER scp_interview_findings_question_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_findings
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();
CREATE TRIGGER scp_interview_assessments_question_in_pack
  BEFORE INSERT OR UPDATE ON public.scp_interview_assessments
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_question_in_pinned_pack();


-- ---------------------------------------------------------------------------
-- 17.6  Assessments: the anchor must belong to the question, and a locked
--       assessment is superseded rather than edited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_guard_assessment_anchor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _anchor_question uuid;
  _anchor_level integer;
BEGIN
  SELECT a.question_id, a.level INTO _anchor_question, _anchor_level
    FROM public.scp_interview_rating_anchors a WHERE a.id = NEW.anchor_id;

  IF _anchor_question IS NULL OR _anchor_question <> NEW.question_id THEN
    RAISE EXCEPTION
      'SCP_IV_ANCHOR_MISMATCH: the anchor must belong to the question being assessed. An assessment without its behavioural description is a bare number.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _anchor_level <> NEW.level THEN
    RAISE EXCEPTION
      'SCP_IV_ANCHOR_LEVEL_MISMATCH: level % does not match the referenced anchor (level %).',
      NEW.level, _anchor_level USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_assessment_anchor() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_assessments_anchor
  BEFORE INSERT OR UPDATE ON public.scp_interview_assessments
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_assessment_anchor();


CREATE OR REPLACE FUNCTION public.scp_iv_guard_assessment_locked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NULL THEN RETURN NEW; END IF;
  -- Once locked, the only permitted change is being superseded by a later row.
  IF NEW.superseded_by IS DISTINCT FROM OLD.superseded_by
     OR NEW.supersede_reason IS DISTINCT FROM OLD.supersede_reason THEN
    IF NEW.level = OLD.level AND NEW.rationale = OLD.rationale
       AND NEW.assessor_id = OLD.assessor_id AND NEW.anchor_id = OLD.anchor_id THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION
    'SCP_IV_ASSESSMENT_LOCKED: a locked assessment is never edited. Record a new assessment that supersedes it, so both judgements survive.'
    USING ERRCODE = 'check_violation';
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_assessment_locked() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_assessments_locked
  BEFORE UPDATE ON public.scp_interview_assessments
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_assessment_locked();


-- ---------------------------------------------------------------------------
-- 17.7  Finalised reports and the audit ledger are immutable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_guard_report_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'final' THEN RETURN NEW; END IF;
  -- A final report may only be superseded by a later version.
  IF NEW.status = 'superseded' AND NEW.payload IS NOT DISTINCT FROM OLD.payload
     AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'SCP_IV_REPORT_IMMUTABLE: a finalised report is never edited. Create a new report version instead.'
    USING ERRCODE = 'check_violation';
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_report_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_reports_immutable
  BEFORE UPDATE ON public.scp_interview_reports
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_report_immutable();

CREATE OR REPLACE FUNCTION public.scp_iv_guard_events_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'SCP_IV_EVENT_APPEND_ONLY: case history is never updated or deleted.'
    USING ERRCODE = 'insufficient_privilege';
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_events_append_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_case_events_append_only
  BEFORE UPDATE OR DELETE ON public.scp_interview_case_events
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_events_append_only();

-- The AI run ledger is append-only too, apart from the orchestrator closing out
-- a run it started. A rewritten run is a rewritten explanation.
CREATE OR REPLACE FUNCTION public.scp_iv_guard_ai_run_settled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'running' THEN RETURN NEW; END IF;
  RAISE EXCEPTION
    'SCP_IV_AI_RUN_SETTLED: a finished AI run is never rewritten (status "%"). Start a new run.',
    OLD.status USING ERRCODE = 'check_violation';
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_ai_run_settled() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_ai_runs_settled
  BEFORE UPDATE ON public.scp_interview_ai_runs
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_ai_run_settled();


-- ###########################################################################
-- SECTION 18 -- The append-only event writer
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_record_event(
  _case_id uuid, _event text, _actor_kind text DEFAULT 'human',
  _ai_run_id uuid DEFAULT NULL, _previous_status text DEFAULT NULL,
  _new_status text DEFAULT NULL, _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.scp_interview_case_events
    (case_id, event, actor_id, actor_kind, ai_run_id, previous_status, new_status, reason, metadata)
  VALUES (_case_id, _event, auth.uid(), _actor_kind, _ai_run_id,
          _previous_status, _new_status, _reason, coalesce(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

-- No client grant at all: the ledger's only writer is this function, called
-- from other definer functions in this schema.
REVOKE ALL ON FUNCTION public.scp_iv_record_event(uuid, text, text, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_event(uuid, text, text, uuid, text, text, text, jsonb)
  TO service_role;


-- Internal: move a case, with the marker the transition guard demands.
CREATE OR REPLACE FUNCTION public.scp_iv_set_case_status(_case_id uuid, _new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases
     SET status = _new_status, updated_at = now()
   WHERE id = _case_id;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_set_case_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_iv_set_case_status(uuid, text) TO service_role;


-- ###########################################################################
-- SECTION 19 -- Case lifecycle RPCs
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_create_case(
  _employer_id uuid,
  _title text,
  _pack_version_id uuid,
  _candidate_display_name text,
  _candidate_user_id uuid DEFAULT NULL,
  _candidate_external_ref text DEFAULT NULL,
  _job_id uuid DEFAULT NULL,
  _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _usable boolean;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_EMPLOYER_MEMBER: creating an interview case requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PACK_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- A pack may be used if it is PUBLISHED, or if this employer holds an
  -- explicit pilot grant for it. The grant is how a controlled pilot runs on
  -- pilot-hypothesis content without that content claiming to be validated.
  _usable := _pack.content_status = 'published'
          OR EXISTS (SELECT 1 FROM public.scp_interview_pack_pilot_grants g
                      WHERE g.employer_id = _employer_id
                        AND g.pack_version_id = _pack_version_id
                        AND g.revoked_at IS NULL);
  IF NOT _usable THEN
    RAISE EXCEPTION
      'SCP_IV_PACK_NOT_USABLE: pack version is "%" and this employer holds no pilot grant for it.',
      _pack.content_status USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The job and application, if given, must belong to THIS employer. Without
  -- this check a member could attach another tenant's application to their case.
  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.job_applications a
        WHERE a.id = _application_id AND a.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_APPLICATION: that application belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_external_ref,
     candidate_display_name, pack_version_id, role_version_id, pack_content_hash,
     title, created_by)
  VALUES
    (_employer_id, _job_id, _application_id, _candidate_user_id, _candidate_external_ref,
     _candidate_display_name, _pack_version_id, _pack.role_version_id, _pack.content_hash,
     _title, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_id, 'case_created', 'human', NULL, NULL, 'draft', NULL,
    jsonb_build_object('pack_version_id', _pack_version_id,
                       'pack_content_status', _pack.content_status,
                       'validation_label', _pack.validation_label));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  TO authenticated, service_role;


-- Add a source and split it into immutable passages in one transaction, so a
-- source can never exist without the passages its citations will need.
CREATE OR REPLACE FUNCTION public.scp_iv_add_source(
  _case_id uuid,
  _source_kind text,
  _label text,
  _content_text text,
  _purpose_code text,
  _lawful_basis_note text,
  _origin text DEFAULT 'employer_supplied',
  _linked_application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _para text;
  _idx integer := 0;
  _cursor integer := 1;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER: you cannot add a source to this case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.scp_interview_case_sources
    (case_id, source_kind, label, content_text, linked_application_id,
     purpose_code, lawful_basis_note, provided_by, origin)
  VALUES (_case_id, _source_kind, _label, _content_text, _linked_application_id,
          _purpose_code, _lawful_basis_note, auth.uid(), _origin)
  RETURNING id INTO _id;

  -- Split on blank lines. Deliberately simple and deterministic: the passage
  -- boundary must be reproducible, because a citation points at a passage index.
  IF _content_text IS NOT NULL THEN
    FOR _para IN
      SELECT btrim(p) FROM regexp_split_to_table(_content_text, E'\n\\s*\n') AS p
       WHERE btrim(p) <> ''
    LOOP
      _idx := _idx + 1;
      INSERT INTO public.scp_interview_source_passages
        (source_id, passage_index, content, char_start, char_end)
      VALUES (_id, _idx, _para, _cursor, _cursor + length(_para));
      _cursor := _cursor + length(_para) + 2;
    END LOOP;
  END IF;

  PERFORM public.scp_iv_record_event(_case_id, 'source_added', 'human', NULL, NULL, NULL, NULL,
    jsonb_build_object('source_kind', _source_kind, 'passages', _idx,
                       'purpose_code', _purpose_code));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_add_source(uuid, text, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_add_source(uuid, text, text, text, text, text, text, uuid)
  TO authenticated, service_role;


-- The per-case half of the transcript gate.
CREATE OR REPLACE FUNCTION public.scp_iv_confirm_transcript_basis(
  _case_id uuid, _statement text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CONFIRM_ROLE: confirming a lawful basis for transcript processing requires an employer owner or admin, not any member.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _statement IS NULL OR btrim(_statement) = '' THEN
    RAISE EXCEPTION 'SCP_IV_TRANSCRIPT_STATEMENT_REQUIRED: state the lawful basis in writing.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases
     SET transcript_lawful_basis_confirmed_at = now(),
         transcript_lawful_basis_confirmed_by = auth.uid(),
         transcript_lawful_basis_statement = btrim(_statement),
         updated_at = now()
   WHERE id = _case_id;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  PERFORM public.scp_iv_record_event(_case_id, 'transcript_authorised', 'human', NULL, NULL, NULL,
    btrim(_statement), '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_confirm_transcript_basis(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_confirm_transcript_basis(uuid, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_mark_sources_ready(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT count(*) INTO _n FROM public.scp_interview_case_sources
   WHERE case_id = _case_id AND retention_state = 'active';
  IF _n = 0 THEN
    RAISE EXCEPTION
      'SCP_IV_NO_SOURCES: a preparation brief grounded in nothing is not a brief. Add at least one source.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.scp_iv_set_case_status(_case_id, 'sources_ready');
  PERFORM public.scp_iv_record_event(_case_id, 'source_added', 'human', NULL, 'draft', 'sources_ready',
    NULL, jsonb_build_object('source_count', _n));
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_mark_sources_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_mark_sources_ready(uuid) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 20 -- AI run RPCs (the only way provenance is written)
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_ai_run_start(
  _case_id uuid, _task text, _provider text, _model text,
  _raw_request jsonb DEFAULT NULL, _input_hash text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _t public.scp_ai_tasks%ROWTYPE;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The run pins the ACTIVE registry row. A task with no active version cannot
  -- run at all -- which is how a rolled-back task stops executing immediately.
  SELECT * INTO _t FROM public.scp_ai_tasks
   WHERE task_key = _task AND activation_status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'SCP_IV_TASK_NOT_ACTIVE: AI task "%" has no active registry version. Activation is a governed act.',
      _task USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.scp_interview_ai_runs
    (case_id, task, task_version, prompt_version, policy_version,
     input_schema_version, output_schema_version, eval_set_version, ai_task_id,
     provider, model, status, raw_request, input_hash,
     requires_human_review, started_by)
  VALUES
    (_case_id, _task, _t.task_version, _t.prompt_version, _t.policy_version,
     _t.input_schema_version, _t.output_schema_version, _t.evaluation_set_version, _t.id,
     _provider, _model, 'running', _raw_request, _input_hash,
     _t.requires_human_review, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_case_id, 'ai_run_started', 'ai', _id, NULL, NULL, NULL,
    jsonb_build_object('task', _task, 'task_version', _t.task_version,
                       'prompt_version', _t.prompt_version, 'provider', _provider, 'model', _model));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_ai_run_settle(
  _run_id uuid, _status text, _failure_reason text DEFAULT NULL,
  _abstention_reason text DEFAULT NULL, _raw_response jsonb DEFAULT NULL,
  _input_tokens integer DEFAULT NULL, _output_tokens integer DEFAULT NULL,
  _latency_ms integer DEFAULT NULL, _cost_micros integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_RUN_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.scp_interview_ai_runs
     SET status = _status,
         failure_reason = _failure_reason,
         abstention_reason = _abstention_reason,
         raw_response = _raw_response,
         input_tokens = _input_tokens,
         output_tokens = _output_tokens,
         latency_ms = _latency_ms,
         cost_micros = _cost_micros,
         finished_at = now()
   WHERE id = _run_id;

  PERFORM public.scp_iv_record_event(_case_id,
    CASE WHEN _status = 'succeeded' THEN 'ai_run_succeeded' ELSE 'ai_run_failed' END,
    'ai', _run_id, NULL, NULL, coalesce(_failure_reason, _abstention_reason),
    jsonb_build_object('status', _status));
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer)
  TO authenticated, service_role;


-- Persist extracted role requirements. The jsonb array is TRANSPORT only: every
-- element is unpacked into typed, constrained columns, and the citation
-- constraint rejects a source_grounded row with no passage.
CREATE OR REPLACE FUNCTION public.scp_iv_record_role_requirements(_run_id uuid, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _n integer := 0; _item jsonb;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _n := _n + 1;
    INSERT INTO public.scp_interview_role_requirements
      (case_id, ai_run_id, requirement_kind, statement, claim_class,
       source_passage_id, source_quote, display_order)
    VALUES (_case_id, _run_id,
            _item ->> 'requirementKind', _item ->> 'statement',
            coalesce(_item ->> 'claimClass', 'source_grounded'),
            nullif(_item ->> 'sourcePassageId', '')::uuid,
            _item ->> 'sourceQuote', _n);
  END LOOP;
  RETURN _n;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_role_requirements(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_role_requirements(uuid, jsonb) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_record_candidate_facts(_run_id uuid, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _n integer := 0; _item jsonb;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _n := _n + 1;
    INSERT INTO public.scp_interview_candidate_facts
      (case_id, ai_run_id, fact_kind, statement, claim_class,
       source_passage_id, source_quote, source_status, display_order)
    VALUES (_case_id, _run_id,
            _item ->> 'factKind', _item ->> 'statement',
            coalesce(_item ->> 'claimClass', 'source_grounded'),
            nullif(_item ->> 'sourcePassageId', '')::uuid,
            _item ->> 'sourceQuote',
            coalesce(_item ->> 'sourceStatus', 'candidate_declared'), _n);
  END LOOP;
  RETURN _n;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_candidate_facts(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_candidate_facts(uuid, jsonb) TO authenticated, service_role;


-- The preparation plan and its items, written together.
CREATE OR REPLACE FUNCTION public.scp_iv_record_prep_plan(_run_id uuid, _plan jsonb, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_id uuid; _plan_id uuid; _next integer; _item jsonb; _n integer := 0;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_interview_prep_plans WHERE case_id = _case_id;

  -- An earlier draft is superseded, never deleted: what was proposed before is
  -- part of the record.
  UPDATE public.scp_interview_prep_plans
     SET status = 'superseded' WHERE case_id = _case_id AND status = 'draft';

  INSERT INTO public.scp_interview_prep_plans
    (case_id, ai_run_id, version_number, role_summary, candidate_summary,
     time_plan, opening_guidance, closing_guidance)
  VALUES (_case_id, _run_id, _next,
          _plan ->> 'roleSummary', _plan ->> 'candidateSummary',
          _plan ->> 'timePlan', _plan ->> 'openingGuidance', _plan ->> 'closingGuidance')
  RETURNING id INTO _plan_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _n := _n + 1;
    INSERT INTO public.scp_interview_prep_items
      (plan_id, item_kind, question_id, probe_id, statement, claim_class,
       source_passage_id, source_quote, display_order)
    VALUES (_plan_id, _item ->> 'itemKind',
            nullif(_item ->> 'questionId', '')::uuid,
            nullif(_item ->> 'probeId', '')::uuid,
            _item ->> 'statement',
            coalesce(_item ->> 'claimClass', 'ai_inference'),
            nullif(_item ->> 'sourcePassageId', '')::uuid,
            _item ->> 'sourceQuote', _n);
  END LOOP;

  PERFORM public.scp_iv_set_case_status(_case_id, 'prep_generated');
  PERFORM public.scp_iv_record_event(_case_id, 'prep_generated', 'ai', _run_id,
    'sources_ready', 'prep_generated', NULL,
    jsonb_build_object('plan_version', _next, 'items', _n));
  RETURN _plan_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_prep_plan(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_prep_plan(uuid, jsonb, jsonb) TO authenticated, service_role;


-- The approval gate. A draft becomes the ACTIVE interview plan only here.
CREATE OR REPLACE FUNCTION public.scp_iv_approve_prep_plan(_plan_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _status text;
BEGIN
  SELECT case_id, status INTO _case_id, _status
    FROM public.scp_interview_prep_plans WHERE id = _plan_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_PLAN_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'SCP_IV_PLAN_NOT_DRAFT: this plan is "%".', _status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_interview_prep_plans
     SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
         approval_note = _note, updated_at = now()
   WHERE id = _plan_id;

  PERFORM public.scp_iv_set_case_status(_case_id, 'prep_approved');
  PERFORM public.scp_iv_record_event(_case_id, 'prep_approved', 'human', NULL,
    'prep_generated', 'prep_approved', _note, jsonb_build_object('plan_id', _plan_id));
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_approve_prep_plan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_approve_prep_plan(uuid, text) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 21 -- Session RPCs
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_start_session(_case_id uuid, _interviewer_names text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan_id uuid; _session_id uuid; _pack uuid; _status text;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, pack_version_id INTO _status, _pack
    FROM public.scp_interview_cases WHERE id = _case_id;
  IF _status <> 'prep_approved' THEN
    RAISE EXCEPTION
      'SCP_IV_PREP_NOT_APPROVED: an interview starts from an APPROVED plan. This case is "%".', _status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO _plan_id FROM public.scp_interview_prep_plans
   WHERE case_id = _case_id AND status = 'approved'
   ORDER BY version_number DESC LIMIT 1;

  INSERT INTO public.scp_interview_sessions (case_id, plan_id, interviewer_names, created_by)
  VALUES (_case_id, _plan_id, _interviewer_names, auth.uid())
  RETURNING id INTO _session_id;

  -- Seed one row per governed question, in the pack's own order. The workspace
  -- renders these; it never invents a question, and it cannot reorder them.
  INSERT INTO public.scp_interview_session_questions (session_id, question_id, display_order)
  SELECT _session_id, q.id, q.display_order
    FROM public.scp_interview_core_questions q
   WHERE q.pack_version_id = _pack
   ORDER BY q.display_order;

  PERFORM public.scp_iv_set_case_status(_case_id, 'interview_in_progress');
  PERFORM public.scp_iv_record_event(_case_id, 'interview_started', 'human', NULL,
    'prep_approved', 'interview_in_progress', NULL,
    jsonb_build_object('session_id', _session_id));
  RETURN _session_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_start_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_start_session(uuid, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_set_session_state(
  _session_id uuid, _status text DEFAULT NULL, _peace_stage text DEFAULT NULL,
  _process_reflection text DEFAULT NULL, _protocol_deviations text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _old text;
BEGIN
  _case_id := public.scp_iv_session_case(_session_id);
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO _old FROM public.scp_interview_sessions WHERE id = _session_id;

  UPDATE public.scp_interview_sessions
     SET status = coalesce(_status, status),
         peace_stage = coalesce(_peace_stage, peace_stage),
         process_reflection = coalesce(_process_reflection, process_reflection),
         protocol_deviations = coalesce(_protocol_deviations, protocol_deviations),
         paused_at = CASE WHEN _status = 'paused' THEN now() ELSE paused_at END,
         completed_at = CASE WHEN _status = 'completed' THEN now() ELSE completed_at END,
         last_autosave_at = now(),
         updated_at = now()
   WHERE id = _session_id;

  IF _status = 'paused' AND _old <> 'paused' THEN
    PERFORM public.scp_iv_record_event(_case_id, 'interview_paused', 'human', NULL, _old, _status);
  ELSIF _status = 'in_progress' AND _old = 'paused' THEN
    PERFORM public.scp_iv_record_event(_case_id, 'interview_resumed', 'human', NULL, _old, _status);
  ELSIF _status = 'completed' AND _old <> 'completed' THEN
    PERFORM public.scp_iv_set_case_status(_case_id, 'interview_complete');
    PERFORM public.scp_iv_record_event(_case_id, 'interview_completed', 'human', NULL,
      'interview_in_progress', 'interview_complete');
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_set_session_state(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_set_session_state(uuid, text, text, text, text)
  TO authenticated, service_role;


-- ###########################################################################
-- SECTION 22 -- Evidence: proposal in, human decision out
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_record_evidence_proposals(_run_id uuid, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _n integer := 0; _item jsonb;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _n := _n + 1;
    INSERT INTO public.scp_interview_evidence_proposals
      (case_id, ai_run_id, note_id, source_passage_id, excerpt, question_id,
       evidence_dimension_id, pack_competency_id, extraction_confidence,
       relevance_rationale, uncertainty_note, prohibited_conclusion_note)
    VALUES (_case_id, _run_id,
            nullif(_item ->> 'noteId', '')::uuid,
            nullif(_item ->> 'sourcePassageId', '')::uuid,
            _item ->> 'excerpt',
            (_item ->> 'questionId')::uuid,
            nullif(_item ->> 'evidenceDimensionId', '')::uuid,
            nullif(_item ->> 'packCompetencyId', '')::uuid,
            nullif(_item ->> 'extractionConfidence', '')::numeric,
            coalesce(_item ->> 'relevanceRationale', ''),
            _item ->> 'uncertaintyNote',
            _item ->> 'prohibitedConclusionNote');
  END LOOP;

  PERFORM public.scp_iv_record_event(_case_id, 'evidence_proposed', 'ai', _run_id, NULL, NULL, NULL,
    jsonb_build_object('proposals', _n));
  RETURN _n;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_evidence_proposals(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_evidence_proposals(uuid, jsonb) TO authenticated, service_role;


-- THE boundary between layer 4 and layer 5.
--
-- This is the only function that can turn a proposal into evidence, and it
-- writes a different table while recording who did it. Accepting keeps the
-- text; editing keeps BOTH texts and demands a reason.
CREATE OR REPLACE FUNCTION public.scp_iv_confirm_evidence_proposal(
  _proposal_id uuid,
  _decision text,                       -- 'accept' | 'edit' | 'reject' | 'unresolved'
  _edited_excerpt text DEFAULT NULL,
  _correction_class text DEFAULT NULL,
  _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.scp_interview_evidence_proposals%ROWTYPE;
  _evidence_id uuid;
BEGIN
  SELECT * INTO _p FROM public.scp_interview_evidence_proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PROPOSAL_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_p.case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _p.review_state <> 'pending' THEN
    RAISE EXCEPTION 'SCP_IV_PROPOSAL_ALREADY_REVIEWED: this proposal is already "%".', _p.review_state
      USING ERRCODE = 'check_violation';
  END IF;
  IF _decision NOT IN ('accept', 'edit', 'reject', 'unresolved') THEN
    RAISE EXCEPTION 'SCP_IV_UNKNOWN_DECISION: "%".', _decision USING ERRCODE = 'check_violation';
  END IF;
  IF _decision IN ('edit', 'reject') AND _correction_class IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_CORRECTION_CLASS_REQUIRED: say WHY it was changed or rejected. "the model was wrong" and "I prefer different words" are different problems with different fixes.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _decision = 'edit' AND (_edited_excerpt IS NULL OR btrim(_edited_excerpt) = '') THEN
    RAISE EXCEPTION 'SCP_IV_EDIT_NEEDS_TEXT' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_interview_evidence_proposals
     SET review_state = CASE _decision
           WHEN 'accept' THEN 'confirmed' WHEN 'edit' THEN 'edited'
           WHEN 'reject' THEN 'rejected' ELSE 'unresolved' END,
         reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = _note, correction_class = _correction_class
   WHERE id = _proposal_id;

  -- Only accept and edit produce evidence. A rejected or unresolved proposal
  -- never reaches the confirmed table, and therefore never reaches a report.
  IF _decision IN ('accept', 'edit') THEN
    INSERT INTO public.scp_interview_evidence
      (case_id, proposal_id, origin, note_id, source_passage_id,
       excerpt, original_excerpt, question_id, evidence_dimension_id,
       pack_competency_id, confirmed_by, correction_note)
    VALUES (_p.case_id, _p.id,
            CASE _decision WHEN 'accept' THEN 'ai_proposed_accepted' ELSE 'ai_proposed_edited' END,
            _p.note_id, _p.source_passage_id,
            CASE _decision WHEN 'accept' THEN _p.excerpt ELSE btrim(_edited_excerpt) END,
            CASE _decision WHEN 'edit' THEN _p.excerpt ELSE NULL END,
            _p.question_id, _p.evidence_dimension_id, _p.pack_competency_id,
            auth.uid(),
            CASE _decision WHEN 'edit' THEN coalesce(_note, 'Korrigerad av granskare.') ELSE NULL END)
    RETURNING id INTO _evidence_id;
  END IF;

  PERFORM public.scp_iv_record_event(_p.case_id,
    CASE _decision WHEN 'accept' THEN 'evidence_confirmed' WHEN 'edit' THEN 'evidence_edited'
                   WHEN 'reject' THEN 'evidence_rejected' ELSE 'evidence_rejected' END,
    'human', _p.ai_run_id, 'pending', _decision, _note,
    jsonb_build_object('proposal_id', _proposal_id, 'correction_class', _correction_class));

  RETURN _evidence_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_confirm_evidence_proposal(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_confirm_evidence_proposal(uuid, text, text, text, text)
  TO authenticated, service_role;


-- A human may always write evidence with no AI involved at all.
CREATE OR REPLACE FUNCTION public.scp_iv_author_evidence(
  _case_id uuid, _question_id uuid, _excerpt text,
  _evidence_dimension_id uuid DEFAULT NULL, _pack_competency_id uuid DEFAULT NULL,
  _note_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.scp_interview_evidence
    (case_id, origin, note_id, excerpt, question_id, evidence_dimension_id,
     pack_competency_id, confirmed_by)
  VALUES (_case_id, 'human_authored', _note_id, _excerpt, _question_id,
          _evidence_dimension_id, _pack_competency_id, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_case_id, 'evidence_authored', 'human', NULL, NULL, NULL, NULL,
    jsonb_build_object('evidence_id', _id));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_record_findings(_run_id uuid, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _n integer := 0; _item jsonb;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _n := _n + 1;
    INSERT INTO public.scp_interview_findings
      (case_id, ai_run_id, finding_kind, statement, rationale, question_id,
       verification_rule_id, claim_class, source_passage_id)
    VALUES (_case_id, _run_id, _item ->> 'findingKind', _item ->> 'statement',
            _item ->> 'rationale', nullif(_item ->> 'questionId', '')::uuid,
            nullif(_item ->> 'verificationRuleId', '')::uuid,
            coalesce(_item ->> 'claimClass', 'ai_inference'),
            nullif(_item ->> 'sourcePassageId', '')::uuid);
  END LOOP;

  PERFORM public.scp_iv_record_event(_case_id, 'finding_recorded', 'ai', _run_id, NULL, NULL, NULL,
    jsonb_build_object('findings', _n));
  RETURN _n;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_findings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_findings(uuid, jsonb) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_begin_evidence_review(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.scp_iv_set_case_status(_case_id, 'evidence_review');
  PERFORM public.scp_iv_record_event(_case_id, 'evidence_proposed', 'human', NULL,
    'interview_complete', 'evidence_review');
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_begin_evidence_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_begin_evidence_review(uuid) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 23 -- Assessment and report RPCs
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_record_assessment(
  _case_id uuid, _question_id uuid, _level integer, _rationale text,
  _uncertainty_note text DEFAULT NULL, _supersede_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _anchor_id uuid; _pack uuid; _existing uuid; _id uuid; _evidence_count integer;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _rationale IS NULL OR btrim(_rationale) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_RATIONALE_REQUIRED: a level without reasoning is a number, not an assessment.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pack_version_id INTO _pack FROM public.scp_interview_cases WHERE id = _case_id;
  SELECT a.id INTO _anchor_id FROM public.scp_interview_rating_anchors a
   WHERE a.question_id = _question_id AND a.level = _level;
  IF _anchor_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_NO_ANCHOR: the pinned pack defines no level-% anchor for this question.', _level
      USING ERRCODE = 'check_violation';
  END IF;

  -- A level above 0 asserts something about described behaviour, so there has
  -- to BE described behaviour: confirmed evidence for this question. Level 0 is
  -- exempt, because "insufficient evidence" is precisely the judgement you make
  -- when there is none.
  IF _level > 0 THEN
    SELECT count(*) INTO _evidence_count FROM public.scp_interview_evidence
     WHERE case_id = _case_id AND question_id = _question_id;
    IF _evidence_count = 0 THEN
      RAISE EXCEPTION
        'SCP_IV_NO_CONFIRMED_EVIDENCE: a level above 0 must rest on confirmed evidence for this question. If there is none, the honest level is 0 -- insufficient evidence.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Supersede rather than edit, so both judgements survive.
  SELECT id INTO _existing FROM public.scp_interview_assessments
   WHERE case_id = _case_id AND question_id = _question_id
     AND assessor_id = auth.uid() AND superseded_by IS NULL;

  IF _existing IS NOT NULL AND _supersede_reason IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_SUPERSEDE_REASON_REQUIRED: you have already assessed this question. Changing a recorded judgement requires a documented reason.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_interview_assessments
    (case_id, question_id, anchor_id, level, rationale, uncertainty_note, assessor_id, locked_at)
  VALUES (_case_id, _question_id, _anchor_id, _level, btrim(_rationale),
          _uncertainty_note, auth.uid(), now())
  RETURNING id INTO _id;

  IF _existing IS NOT NULL THEN
    UPDATE public.scp_interview_assessments
       SET superseded_by = _id, supersede_reason = _supersede_reason
     WHERE id = _existing;
    PERFORM public.scp_iv_record_event(_case_id, 'assessment_superseded', 'human', NULL, NULL, NULL,
      _supersede_reason, jsonb_build_object('previous', _existing, 'replacement', _id));
  END IF;

  PERFORM public.scp_iv_record_event(_case_id, 'assessment_recorded', 'human', NULL, NULL, NULL, NULL,
    jsonb_build_object('question_id', _question_id, 'level', _level));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_assessment(uuid, uuid, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_assessment(uuid, uuid, integer, text, text, text)
  TO authenticated, service_role;


-- What still blocks a report. Returned as rows so the UI can show a person
-- exactly what to do next rather than a disabled button with no explanation.
CREATE OR REPLACE FUNCTION public.scp_iv_report_blockers(_case_id uuid)
RETURNS TABLE (code text, message text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.scp_interview_cases%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'CASE_NOT_FOUND'::text, 'The case does not exist.'::text; RETURN;
  END IF;

  IF _c.status NOT IN ('assessed', 'evidence_review') THEN
    RETURN QUERY SELECT 'CASE_NOT_READY'::text,
      format('A report is produced from an assessed case; this one is "%s".', _c.status);
  END IF;

  -- Every question must have been judged by a human, even if the judgement is
  -- "insufficient evidence". Silence is not an assessment.
  RETURN QUERY
    SELECT 'QUESTION_NOT_ASSESSED',
           format('%s has no recorded human assessment.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _c.pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_assessments a
                        WHERE a.case_id = _case_id AND a.question_id = q.id
                          AND a.superseded_by IS NULL);

  -- Nothing the engine proposed may be left dangling: a person has to have
  -- looked at each one, even if the answer was "unresolved".
  RETURN QUERY
    SELECT 'PROPOSALS_AWAITING_REVIEW',
           format('%s AI-proposed evidence item(s) have not been reviewed by a human.',
                  count(*)::text)
      FROM public.scp_interview_evidence_proposals p
     WHERE p.case_id = _case_id AND p.review_state = 'pending'
    HAVING count(*) > 0;

  RETURN;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_report_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_report_blockers(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_mark_assessed(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.scp_iv_set_case_status(_case_id, 'assessed');
  PERFORM public.scp_iv_record_event(_case_id, 'assessment_recorded', 'human', NULL,
    'evidence_review', 'assessed');
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_mark_assessed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_mark_assessed(uuid) TO authenticated, service_role;


-- Build and freeze the report. Transactional and fail-closed: the blockers are
-- evaluated inside the same transaction that would finalise it.
CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(_case_id uuid, _draft_run_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), _c.employer_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_FINALISE_ROLE: finalising a candidate interview report requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', code, message), E'\n')
    INTO _n, _blockers FROM public.scp_iv_report_blockers(_case_id);
  IF _n > 0 THEN
    RAISE EXCEPTION E'SCP_IV_REPORT_BLOCKED: this case is not ready for a report.\n%', _blockers
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_interview_reports WHERE case_id = _case_id;

  -- The snapshot. Built ONLY from confirmed evidence and recorded human
  -- assessments: the proposals table is not read here, and cannot be.
  SELECT jsonb_build_object(
    'case', jsonb_build_object(
      'title', _c.title,
      'candidate', _c.candidate_display_name,
      'employer_id', _c.employer_id,
      'status_at_report', _c.status),
    'pinned', jsonb_build_object(
      'pack_version_id', _c.pack_version_id,
      'pack_content_hash', _c.pack_content_hash,
      'role_version_id', _c.role_version_id),
    'sources', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', s.source_kind, 'label', s.label,
               'purpose', s.purpose_code, 'origin', s.origin) ORDER BY s.created_at)
        FROM public.scp_interview_case_sources s
       WHERE s.case_id = _case_id), '[]'::jsonb),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'code', q.code, 'order', q.display_order, 'prompt', q.prompt_sv,
               'evidence', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'excerpt', ev.excerpt, 'origin', ev.origin,
                          'confirmed_by', ev.confirmed_by, 'confirmed_at', ev.confirmed_at,
                          'was_corrected', ev.original_excerpt IS NOT NULL))
                   FROM public.scp_interview_evidence ev
                  WHERE ev.case_id = _case_id AND ev.question_id = q.id), '[]'::jsonb),
               'assessment', (
                 SELECT jsonb_build_object(
                          'level', a.level, 'rationale', a.rationale,
                          'uncertainty', a.uncertainty_note,
                          'assessor_id', a.assessor_id, 'assessed_at', a.assessed_at,
                          'anchor', an.anchor_sv,
                          'level_meaning', an.label_sv,
                          'counts_toward_aggregation', an.counts_toward_aggregation)
                   FROM public.scp_interview_assessments a
                   JOIN public.scp_interview_rating_anchors an ON an.id = a.anchor_id
                  WHERE a.case_id = _case_id AND a.question_id = q.id
                    AND a.superseded_by IS NULL LIMIT 1)
             ) ORDER BY q.display_order)
        FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _c.pack_version_id), '[]'::jsonb),
    'unresolved', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', f.finding_kind, 'statement', f.statement,
               'state', f.resolution_state) ORDER BY f.created_at)
        FROM public.scp_interview_findings f
       WHERE f.case_id = _case_id
         AND f.resolution_state IN ('open','needs_verification','unresolved_difference')), '[]'::jsonb),
    'ai_disclosure', jsonb_build_object(
      'runs', coalesce((
        SELECT jsonb_agg(DISTINCT jsonb_build_object(
                 'task', r.task, 'task_version', r.task_version,
                 'prompt_version', r.prompt_version, 'policy_version', r.policy_version,
                 'provider', r.provider, 'model', r.model))
          FROM public.scp_interview_ai_runs r
         WHERE r.case_id = _case_id AND r.status = 'succeeded'), '[]'::jsonb),
      'statement',
      'AI har förberett, extraherat och föreslagit. Varje uppgift i denna rapport är bekräftad av en namngiven människa. AI har inte poängsatt, rangordnat eller rekommenderat, och AI har inte fattat anställningsbeslutet.'),
    'decision_boundary',
    'Denna rapport är beslutsstöd. Anställningsbeslutet fattas av behörig människa hos arbetsgivaren och dokumenteras utanför detta underlag.'
  ) INTO _payload;

  INSERT INTO public.scp_interview_reports
    (case_id, version_number, status, draft_ai_run_id, payload, content_hash,
     pack_version_id, pack_content_hash, role_version_id, finalised_by, finalised_at)
  VALUES (_case_id, _next, 'final', _draft_run_id, _payload,
          md5(_payload::text), _c.pack_version_id, _c.pack_content_hash,
          _c.role_version_id, auth.uid(), now())
  RETURNING id INTO _report_id;

  UPDATE public.scp_interview_reports
     SET status = 'superseded'
   WHERE case_id = _case_id AND id <> _report_id AND status = 'final';

  PERFORM public.scp_iv_set_case_status(_case_id, 'reported');
  PERFORM public.scp_iv_record_event(_case_id, 'report_finalised', 'human', NULL,
    'assessed', 'reported', NULL,
    jsonb_build_object('report_id', _report_id, 'version', _next,
                       'content_hash', md5(_payload::text)));

  -- Complete the provenance chain in the graph, tenant-scoped: this report now
  -- carries these confirmed evidence items and these human assessments.
  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'confirmed_evidence', ev.id, 'reported_in', 'report_conclusion', _report_id,
         _c.employer_id, 'Confirmed evidence included in the finalised report.'
    FROM public.scp_interview_evidence ev WHERE ev.case_id = _case_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'human_assessment', a.id, 'assessed_against', 'rating_anchor', a.anchor_id,
         _c.employer_id, 'Human judgement recorded against a governed anchor.'
    FROM public.scp_interview_assessments a
   WHERE a.case_id = _case_id AND a.superseded_by IS NULL
  ON CONFLICT DO NOTHING;

  RETURN _report_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_finalise_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_finalise_report(uuid, uuid) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 24 -- Grants and RLS
-- ###########################################################################
--
-- Supabase's default privileges grant anon AND authenticated the full table
-- privilege set on every new table, TRUNCATE included -- and TRUNCATE is not
-- filtered by RLS. Both are revoked to zero and re-granted precisely.
--
-- Candidate interview material is the most sensitive data this platform holds,
-- so the read rule is the narrowest in the codebase: membership of the owning
-- employer, and nothing else. Not platform admin, not the candidate, not anon.
-- ---------------------------------------------------------------------------

DO $grants$
DECLARE
  _t text;
  _tables text[] := ARRAY[
    'scp_interview_ai_config','scp_interview_pack_pilot_grants','scp_interview_cases',
    'scp_interview_case_sources','scp_interview_source_passages','scp_interview_ai_runs',
    'scp_interview_ai_run_retrievals','scp_interview_role_requirements',
    'scp_interview_candidate_facts','scp_interview_prep_plans','scp_interview_prep_items',
    'scp_interview_sessions','scp_interview_session_questions','scp_interview_session_notes',
    'scp_interview_probe_usages','scp_interview_evidence_proposals','scp_interview_evidence',
    'scp_interview_findings','scp_interview_assessments','scp_interview_reports',
    'scp_interview_case_events'];
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
  END LOOP;
END
$grants$;

-- Content the employer's own members may write directly. Everything else is
-- RPC-only, which is why the grant list below is short.
GRANT SELECT                         ON public.scp_interview_cases              TO authenticated;
GRANT SELECT                         ON public.scp_interview_case_sources       TO authenticated;
GRANT SELECT                         ON public.scp_interview_source_passages    TO authenticated;
GRANT SELECT                         ON public.scp_interview_ai_runs            TO authenticated;
GRANT SELECT                         ON public.scp_interview_ai_run_retrievals  TO authenticated;
GRANT SELECT, UPDATE                 ON public.scp_interview_role_requirements  TO authenticated;
GRANT SELECT, UPDATE                 ON public.scp_interview_candidate_facts    TO authenticated;
GRANT SELECT                         ON public.scp_interview_prep_plans         TO authenticated;
GRANT SELECT, UPDATE                 ON public.scp_interview_prep_items         TO authenticated;
GRANT SELECT                         ON public.scp_interview_sessions           TO authenticated;
GRANT SELECT, UPDATE                 ON public.scp_interview_session_questions  TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.scp_interview_session_notes              TO authenticated;
GRANT SELECT, INSERT                 ON public.scp_interview_probe_usages       TO authenticated;
GRANT SELECT                         ON public.scp_interview_evidence_proposals TO authenticated;
GRANT SELECT                         ON public.scp_interview_evidence           TO authenticated;
GRANT SELECT, UPDATE                 ON public.scp_interview_findings           TO authenticated;
GRANT SELECT                         ON public.scp_interview_assessments        TO authenticated;
GRANT SELECT                         ON public.scp_interview_reports            TO authenticated;
GRANT SELECT                         ON public.scp_interview_case_events        TO authenticated;
GRANT SELECT                         ON public.scp_interview_ai_config          TO authenticated;
GRANT SELECT                         ON public.scp_interview_pack_pilot_grants  TO authenticated;

-- ---- the case, and everything that hangs off it ----------------------------
CREATE POLICY scp_interview_cases_read ON public.scp_interview_cases
  FOR SELECT TO authenticated
  USING (public.has_employer_role(auth.uid(), employer_id, NULL));

CREATE POLICY scp_interview_case_sources_read ON public.scp_interview_case_sources
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY scp_interview_source_passages_read ON public.scp_interview_source_passages
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(public.scp_iv_source_case(source_id)));

CREATE POLICY scp_interview_ai_runs_read ON public.scp_interview_ai_runs
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY scp_interview_ai_run_retrievals_read ON public.scp_interview_ai_run_retrievals
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.scp_interview_ai_runs r
     WHERE r.id = ai_run_id AND public.scp_iv_can_read_case(r.case_id)));

CREATE POLICY scp_interview_role_requirements_read ON public.scp_interview_role_requirements
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));
CREATE POLICY scp_interview_role_requirements_update ON public.scp_interview_role_requirements
  FOR UPDATE TO authenticated
  USING (public.scp_iv_can_write_case(case_id))
  WITH CHECK (public.scp_iv_can_write_case(case_id));

CREATE POLICY scp_interview_candidate_facts_read ON public.scp_interview_candidate_facts
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));
CREATE POLICY scp_interview_candidate_facts_update ON public.scp_interview_candidate_facts
  FOR UPDATE TO authenticated
  USING (public.scp_iv_can_write_case(case_id))
  WITH CHECK (public.scp_iv_can_write_case(case_id));

CREATE POLICY scp_interview_prep_plans_read ON public.scp_interview_prep_plans
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY scp_interview_prep_items_read ON public.scp_interview_prep_items
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(public.scp_iv_plan_case(plan_id)));
CREATE POLICY scp_interview_prep_items_update ON public.scp_interview_prep_items
  FOR UPDATE TO authenticated
  USING (public.scp_iv_can_write_case(public.scp_iv_plan_case(plan_id)))
  WITH CHECK (public.scp_iv_can_write_case(public.scp_iv_plan_case(plan_id)));

CREATE POLICY scp_interview_sessions_read ON public.scp_interview_sessions
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY scp_interview_session_questions_read ON public.scp_interview_session_questions
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(public.scp_iv_session_case(session_id)));
CREATE POLICY scp_interview_session_questions_update ON public.scp_interview_session_questions
  FOR UPDATE TO authenticated
  USING (public.scp_iv_can_write_case(public.scp_iv_session_case(session_id)))
  WITH CHECK (public.scp_iv_can_write_case(public.scp_iv_session_case(session_id)));

-- Notes are the one thing an interviewer types straight into the table, because
-- autosave during a live interview must not go through an RPC round trip.
CREATE POLICY scp_interview_session_notes_read ON public.scp_interview_session_notes
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(public.scp_iv_session_case(session_id)));
CREATE POLICY scp_interview_session_notes_insert ON public.scp_interview_session_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_iv_can_write_case(public.scp_iv_session_case(session_id)));
CREATE POLICY scp_interview_session_notes_update ON public.scp_interview_session_notes
  FOR UPDATE TO authenticated
  USING (public.scp_iv_can_write_case(public.scp_iv_session_case(session_id)))
  WITH CHECK (public.scp_iv_can_write_case(public.scp_iv_session_case(session_id)));

CREATE POLICY scp_interview_probe_usages_read ON public.scp_interview_probe_usages
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(public.scp_iv_session_case(session_id)));
CREATE POLICY scp_interview_probe_usages_insert ON public.scp_interview_probe_usages
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_iv_can_write_case(public.scp_iv_session_case(session_id)));

-- Proposals and confirmed evidence are READ-ONLY to clients. The only writer is
-- scp_iv_confirm_evidence_proposal() / scp_iv_author_evidence(), which is what
-- makes "an AI output cannot silently become evidence" true rather than
-- aspirational: there is no UPDATE path a client could use to flip one.
CREATE POLICY scp_interview_evidence_proposals_read ON public.scp_interview_evidence_proposals
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));
CREATE POLICY scp_interview_evidence_read ON public.scp_interview_evidence
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY scp_interview_findings_read ON public.scp_interview_findings
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));
CREATE POLICY scp_interview_findings_update ON public.scp_interview_findings
  FOR UPDATE TO authenticated
  USING (public.scp_iv_can_write_case(case_id))
  WITH CHECK (public.scp_iv_can_write_case(case_id));

CREATE POLICY scp_interview_assessments_read ON public.scp_interview_assessments
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY scp_interview_reports_read ON public.scp_interview_reports
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY scp_interview_case_events_read ON public.scp_interview_case_events
  FOR SELECT TO authenticated USING (public.scp_iv_can_read_case(case_id));

-- Platform configuration: everyone signed in may READ the flags (the UI has to
-- explain why AI is unavailable), only a platform admin may change them.
CREATE POLICY scp_interview_ai_config_read ON public.scp_interview_ai_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scp_interview_ai_config_admin ON public.scp_interview_ai_config
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY scp_interview_pack_pilot_grants_read ON public.scp_interview_pack_pilot_grants
  FOR SELECT TO authenticated
  USING (public.has_employer_role(auth.uid(), employer_id, NULL)
         OR public.is_platform_admin(auth.uid()));


-- ###########################################################################
-- SECTION 25 -- Fail-fast assertions
-- ###########################################################################

DO $assert$
DECLARE _n integer;
BEGIN
  -- The prohibition surface, asserted at migration time as well as in tests.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (table_name LIKE 'scp\_interview\_%' ESCAPE '\' OR table_name LIKE 'scp\_iv\_%' ESCAPE '\')
     AND (column_name IN ('total_score','suitability_score','fit_score','ranking',
                          'hire_recommendation','pass_threshold','credibility_score',
                          'deception_probability','culture_fit','weight','weighting')
          OR column_name LIKE '%credibility%' OR column_name LIKE '%deception%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IV_ASSERT: % prohibited column(s) exist in the interview domain.', _n;
  END IF;

  -- The process-quality view must not expose an assessment level.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_interview_process_quality'
     AND (column_name LIKE '%level%' OR column_name LIKE '%score%'
          OR column_name LIKE '%avg%' OR column_name LIKE '%rank%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IV_ASSERT: the process-quality view exposes a candidate-level column.';
  END IF;

  -- Confirmed evidence must have no confidence column of any kind.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_interview_evidence'
     AND column_name LIKE '%confidence%';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IV_ASSERT: confirmed evidence has a confidence column; once a human stands behind it, the machine''s confidence is not part of the record.';
  END IF;

  -- The domain must hold no aggregate over assessment levels.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND (p.proname LIKE 'scp\_iv\_%' ESCAPE '\' OR p.proname LIKE 'scp\_interview\_%' ESCAPE '\')
     AND (p.proname LIKE '%total%' OR p.proname LIKE '%rank%'
          OR p.proname LIKE '%recommend%' OR p.proname LIKE '%suitab%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IV_ASSERT: a scoring/ranking function exists in the interview domain.';
  END IF;

  RAISE NOTICE 'SCP_IV_ASSERT: runtime domain created; % tables.',
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'scp\_interview\_%' ESCAPE '\');
END
$assert$;


-- ###########################################################################
-- SECTION 26 -- Employer read access to governed pack content
-- ###########################################################################
--
-- Phase 1 restricted the pack content tables to platform content roles, which
-- was right for AUTHORING and wrong for CONDUCTING an interview: an interviewer
-- has to see the exact question wording, the approved probes, the evidence
-- dimensions and the anchors, or there is no governed interview to conduct.
--
-- These are ADDITIVE, permissive SELECT policies. They widen READ only, on
-- content the employer is already entitled to use, and they change nothing
-- about who may author, review or publish -- Phase 1's write policies are
-- untouched, and an employer still cannot edit a single row of governed
-- content.
--
-- Entitlement is deliberately narrow: the pack version is published, OR this
-- employer holds a live pilot grant for it, OR this employer already has a case
-- pinned to it. An employer cannot browse the content library.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scp_iv_employer_may_read_pack(_pack_version_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    -- Published content, for anyone with an active employer membership.
    (EXISTS (SELECT 1 FROM public.scp_interview_pack_versions v
              WHERE v.id = _pack_version_id AND v.content_status = 'published')
     AND EXISTS (SELECT 1 FROM public.employer_memberships em
                  WHERE em.user_id = auth.uid() AND em.status = 'active'))
    -- Or a live pilot grant held by an employer this user belongs to.
    OR EXISTS (SELECT 1 FROM public.scp_interview_pack_pilot_grants g
                JOIN public.employer_memberships em ON em.employer_id = g.employer_id
               WHERE g.pack_version_id = _pack_version_id
                 AND g.revoked_at IS NULL
                 AND em.user_id = auth.uid() AND em.status = 'active')
    -- Or a case this user's employer already pinned to it.
    OR EXISTS (SELECT 1 FROM public.scp_interview_cases c
                JOIN public.employer_memberships em ON em.employer_id = c.employer_id
               WHERE c.pack_version_id = _pack_version_id
                 AND em.user_id = auth.uid() AND em.status = 'active')
  );
$$;

REVOKE ALL ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) IS
  'Read entitlement to ONE governed pack version for an employer. Published, '
  'pilot-granted, or already pinned by one of their cases -- nothing else. It '
  'grants no write of any kind: Phase 1 remains the only authoring path.';

-- Resolve a question to its pack version, for the child-table policies.
CREATE OR REPLACE FUNCTION public.scp_iv_question_pack(_question_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.pack_version_id FROM public.scp_interview_core_questions q WHERE q.id = _question_id;
$$;
REVOKE ALL ON FUNCTION public.scp_iv_question_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_question_pack(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_iv_pack_competency_pack(_pack_competency_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.pack_version_id FROM public.scp_interview_pack_competencies c WHERE c.id = _pack_competency_id;
$$;
REVOKE ALL ON FUNCTION public.scp_iv_pack_competency_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_pack_competency_pack(uuid) TO authenticated, service_role;


CREATE POLICY scp_interview_pack_versions_employer_read ON public.scp_interview_pack_versions
  FOR SELECT TO authenticated USING (public.scp_iv_employer_may_read_pack(id));

CREATE POLICY scp_interview_packs_employer_read ON public.scp_interview_packs
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.scp_interview_pack_versions v
     WHERE v.pack_id = scp_interview_packs.id
       AND public.scp_iv_employer_may_read_pack(v.id)));

CREATE POLICY scp_interview_core_questions_employer_read ON public.scp_interview_core_questions
  FOR SELECT TO authenticated USING (public.scp_iv_employer_may_read_pack(pack_version_id));

CREATE POLICY scp_interview_pack_competencies_employer_read ON public.scp_interview_pack_competencies
  FOR SELECT TO authenticated USING (public.scp_iv_employer_may_read_pack(pack_version_id));

CREATE POLICY scp_interview_approved_probes_employer_read ON public.scp_interview_approved_probes
  FOR SELECT TO authenticated USING (public.scp_iv_employer_may_read_pack(pack_version_id));

CREATE POLICY scp_interview_verification_rules_employer_read ON public.scp_interview_verification_rules
  FOR SELECT TO authenticated USING (public.scp_iv_employer_may_read_pack(pack_version_id));

CREATE POLICY scp_interview_prohibited_areas_employer_read ON public.scp_interview_prohibited_areas
  FOR SELECT TO authenticated USING (public.scp_iv_employer_may_read_pack(pack_version_id));

CREATE POLICY scp_interview_evidence_dimensions_employer_read ON public.scp_interview_evidence_dimensions
  FOR SELECT TO authenticated
  USING (public.scp_iv_employer_may_read_pack(public.scp_iv_question_pack(question_id)));

CREATE POLICY scp_interview_rating_anchors_employer_read ON public.scp_interview_rating_anchors
  FOR SELECT TO authenticated
  USING (public.scp_iv_employer_may_read_pack(
           coalesce(public.scp_iv_question_pack(question_id),
                    public.scp_iv_pack_competency_pack(pack_competency_id))));

CREATE POLICY scp_interview_question_competencies_employer_read ON public.scp_interview_question_competencies
  FOR SELECT TO authenticated
  USING (public.scp_iv_employer_may_read_pack(public.scp_iv_question_pack(question_id)));

-- The interviewer also needs the method guidance (PEACE/ORBIT practices) that
-- the workspace renders. Approved methods only, and read only.
CREATE POLICY scp_interview_methods_employer_read ON public.scp_interview_methods
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.employer_memberships em
             WHERE em.user_id = auth.uid() AND em.status = 'active'));

CREATE POLICY scp_interview_method_practices_employer_read ON public.scp_interview_method_practices
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.employer_memberships em
             WHERE em.user_id = auth.uid() AND em.status = 'active'));
