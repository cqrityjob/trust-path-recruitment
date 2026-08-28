-- ===========================================================================
-- CQrity Interview Intelligence — the governed knowledge layer
-- ===========================================================================
--
-- Research Evidence Registry, Governed Interview Method Library, AI Task
-- Registry and the Security Recruitment Intelligence Graph.
--
-- Filename note: the next CANONICAL slot after
-- 20260918090000_scp_interview_role_packs.sql. Repository migration versions
-- run ahead of the wall clock; only the filename was chosen this way.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS, AND WHY IT IS A DATABASE RATHER THAN A PROMPT
-- ---------------------------------------------------------------------------
-- A product that says it is "research-informed" has to be able to answer, for
-- any behaviour: which source, which claim, what that claim does NOT support,
-- who reviewed it, and which AI task or pack content it licenses.
--
-- If that chain lives inside a prompt, then the prompt is the only evidence
-- that the method is grounded -- and a prompt is not evidence. It cannot be
-- reviewed by a methodologist, superseded when the literature moves, or shown
-- to a regulator. So the chain lives here, in versioned rows:
--
--   research_source -> research_claim -> product_implication
--       -> interview_method / ai_task / pack content
--
-- ---------------------------------------------------------------------------
-- WHAT THIS LAYER MUST NEVER BECOME
-- ---------------------------------------------------------------------------
--   * A predictive model. Edges are SEMANTIC. There is no weight column on any
--     relationship in this migration, and none may be added: a weighted edge is
--     one refactor away from a scoring model, which section 15 of the product
--     brief forbids outright.
--   * A "candidate fit graph". No node kind in this graph is a candidate, and
--     no edge may terminate on candidate data.
--   * A place to paste copyrighted text. Sources are identified and summarised
--     in CQrityjob's own words; bounded quotation only where lawful.
--
-- A claim nobody has verified is recorded as unverified. Inventing a DOI, an
-- effect size or a validation status would be the single most damaging thing
-- this table could contain, so `access_status` and `review_status` both default
-- to the honest value.
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.scp_interview_pack_versions') IS NULL THEN
    RAISE EXCEPTION 'SCP_IIR_PRECONDITION: the Phase 1 Role Interview Pack domain (20260918090000) must be applied first.';
  END IF;
  IF to_regproc('public.is_platform_admin') IS NULL
     OR to_regproc('public.scp_has_content_role') IS NULL THEN
    RAISE EXCEPTION 'SCP_IIR_PRECONDITION: the platform content-role model is missing.';
  END IF;
END $$;


-- ###########################################################################
-- SECTION 1 -- Research Evidence Registry
-- ###########################################################################

CREATE TABLE public.scp_research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,

  title text NOT NULL,
  authors text,                        -- or the issuing organisation
  issuing_organisation text,
  publication_year integer
    CHECK (publication_year IS NULL OR (publication_year BETWEEN 1900 AND 2200)),

  publication_type text NOT NULL CHECK (publication_type IN (
    'peer_reviewed_article', 'meta_analysis', 'book', 'book_chapter',
    'government_regulation', 'government_guidance', 'professional_standard',
    'industry_report', 'thesis', 'preprint', 'internal_document', 'web_resource')),

  -- Identification. NEVER invented: if the DOI is unknown it stays NULL and
  -- access_status says so.
  doi text,
  url text,
  document_reference text,

  jurisdiction_code text,              -- e.g. SE, GB, AE-DU, or NULL for general
  population_context text,             -- who it was studied on / applies to
  language text,

  -- Whether anyone at CQrityjob has actually read the thing.
  access_status text NOT NULL DEFAULT 'pending_verification' CHECK (access_status IN (
    'verified_read',          -- a named reviewer inspected the actual source
    'pending_verification',   -- registered, not yet inspected
    'unavailable',            -- could not be obtained
    'paywalled')),

  edition_or_version text,

  review_status text NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN (
    'unreviewed', 'in_review', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  -- CQrityjob's own neutral summary. Deliberately capped: this is a summary,
  -- not a place to reproduce a copyrighted work.
  summary text CHECK (summary IS NULL OR length(summary) <= 4000),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_research_sources_reviewed
    CHECK ((review_status IN ('unreviewed', 'in_review')) = (reviewed_at IS NULL))
);

COMMENT ON TABLE public.scp_research_sources IS
  'What CQrityjob has read, or admits it has not. access_status = '
  '"pending_verification" is the honest default; a source nobody inspected must '
  'never be presented as if it had been. DOIs, effect sizes and validation '
  'statuses are recorded only when observed in the actual source -- never '
  'inferred, never generated.';

CREATE INDEX scp_research_sources_review_idx
  ON public.scp_research_sources (review_status, publication_type);


CREATE TABLE public.scp_research_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  source_id uuid NOT NULL
    REFERENCES public.scp_research_sources(id) ON DELETE RESTRICT,

  -- CQrityjob's neutral restatement of what the source supports.
  claim_summary text NOT NULL,
  -- A bounded quotation, only where lawful and only where the exact wording
  -- matters. Capped hard, because "quote" must not become "copy".
  bounded_quote text CHECK (bounded_quote IS NULL OR length(bounded_quote) <= 400),

  construct_or_method text,
  population text,

  -- The two fields that do the real work. supported_use is what the product may
  -- claim; unsupported_use is what it may NOT, and it is NOT NULL because the
  -- limits of a finding are the part most likely to be quietly dropped.
  supported_use text NOT NULL,
  unsupported_use text NOT NULL,
  limitations text NOT NULL,

  evidence_strength text NOT NULL DEFAULT 'insufficient' CHECK (evidence_strength IN (
    'strong',            -- replicated, meta-analytic or regulatory fact
    'moderate',
    'limited',
    'contested',
    'insufficient',      -- registered, nothing may be claimed from it yet
    'regulatory_fact')), -- not an empirical finding: a legal requirement

  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_review', 'approved', 'rejected', 'superseded')),
  superseded_by uuid REFERENCES public.scp_research_claims(id) ON DELETE SET NULL,

  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_research_claims IS
  'One governed claim, tied to one source. unsupported_use and limitations are '
  'NOT NULL on purpose: the boundary of a finding is the part a product is most '
  'tempted to drop, and dropping it is how "structured interviews are more '
  'predictive" becomes "our AI predicts job performance".';

CREATE INDEX scp_research_claims_source_idx
  ON public.scp_research_claims (source_id, status);


CREATE TABLE public.scp_research_implications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.scp_research_claims(id) ON DELETE RESTRICT,

  -- What this licenses the product to do, and what it explicitly does not.
  permits text NOT NULL,
  does_not_justify text NOT NULL,
  required_human_safeguard text NOT NULL,
  legal_or_scientific_warning text,

  -- What it actually affects. All optional, because an implication may bear on
  -- a method, a task, pack content, or several.
  affects_method_id uuid,              -- FK added after the method table below
  affects_ai_task text,
  affects_pack_version_id uuid
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,

  -- The kind of statement this is. The registry must keep these apart: a legal
  -- requirement and somebody's design preference are not the same authority.
  statement_kind text NOT NULL CHECK (statement_kind IN (
    'source_fact',            -- the source says this
    'cqrityjob_interpretation',
    'product_design_decision',
    'unvalidated_hypothesis',
    'expert_judgement',
    'legal_restriction')),

  approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN (
    'draft', 'in_review', 'approved', 'rejected', 'superseded')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_research_implications_approved
    CHECK ((approval_status = 'approved') = (approved_at IS NOT NULL))
);

COMMENT ON TABLE public.scp_research_implications IS
  'The bridge from literature to product. statement_kind is what stops a design '
  'preference being read later as a research finding: source_fact, '
  'cqrityjob_interpretation, product_design_decision, unvalidated_hypothesis, '
  'expert_judgement and legal_restriction are different authorities and are '
  'never collapsed into one.';

CREATE INDEX scp_research_implications_claim_idx
  ON public.scp_research_implications (claim_id, approval_status);
CREATE INDEX scp_research_implications_task_idx
  ON public.scp_research_implications (affects_ai_task) WHERE affects_ai_task IS NOT NULL;


-- ###########################################################################
-- SECTION 2 -- Governed Interview Method Library
-- ###########################################################################

CREATE TABLE public.scp_interview_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  name text NOT NULL,
  method_family text NOT NULL CHECK (method_family IN (
    'structured_behavioural',
    'situational',
    'peace',
    'orbit',
    'rapport_based',
    'evidence_oriented_probing',
    'verification_boundary',
    'process_quality',
    'prohibited_practice')),

  purpose text NOT NULL,
  intended_context text NOT NULL,

  -- What the method asks the INTERVIEWER to do. Never what it proves about a
  -- candidate.
  supported_behaviours text[] NOT NULL DEFAULT '{}',
  -- The readings this method must never be given. NOT NULL because "PEACE
  -- validates suitability" is exactly the sentence this column exists to
  -- prevent somebody writing.
  prohibited_interpretations text[] NOT NULL DEFAULT '{}',

  -- How it actually shows up in the product, in concrete terms.
  product_implementation text NOT NULL,

  required_reviewer_qualification text,
  locale_notes text,
  jurisdiction_code text,

  approval_state text NOT NULL DEFAULT 'draft' CHECK (approval_state IN (
    'draft', 'in_review', 'approved', 'retired')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (slug, version_number),
  CONSTRAINT scp_interview_methods_approved
    CHECK ((approval_state = 'approved') = (approved_at IS NOT NULL))
);

COMMENT ON TABLE public.scp_interview_methods IS
  'PEACE, ORBIT and the rest as GOVERNED CONTENT rather than marketing labels. '
  'product_implementation is required because a method that cannot name the '
  'concrete behaviour it produces in the product is a label. '
  'prohibited_interpretations is required because the most likely misuse of an '
  'interviewing method is to present it as proof about the candidate.';

CREATE INDEX scp_interview_methods_family_idx
  ON public.scp_interview_methods (method_family, approval_state);


-- The concrete, orderable steps a method contributes to the workspace: a
-- planning checklist item, an opening script, an active-listening prompt, a
-- closure step, an interviewer self-evaluation question, a warning.
CREATE TABLE public.scp_interview_method_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id uuid NOT NULL REFERENCES public.scp_interview_methods(id) ON DELETE CASCADE,

  -- Which PEACE stage this belongs to, when it belongs to one. This is what
  -- turns the method library into live interviewer guidance rather than a
  -- document nobody opens during an interview.
  peace_stage text CHECK (peace_stage IN (
    'planning', 'engage_explain', 'account', 'closure', 'evaluation')),

  practice_kind text NOT NULL CHECK (practice_kind IN (
    'checklist_item',
    'opening_script',
    'engagement_guidance',
    'listening_prompt',
    'clarification_guidance',
    'probing_guidance',
    'closure_step',
    'self_evaluation_question',
    'warning')),

  statement_sv text NOT NULL,
  statement_en text,
  rationale text,

  -- The research this practice leans on, when it leans on any. NULL is honest:
  -- plenty of good interviewing practice is craft, not literature.
  claim_id uuid REFERENCES public.scp_research_claims(id) ON DELETE RESTRICT,

  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_method_practices IS
  'The rows the Interview Workspace actually renders. A practice may cite a '
  'research claim; a NULL claim_id is an honest statement that the practice is '
  'craft rather than a finding, and the UI labels it that way.';

CREATE INDEX scp_interview_method_practices_method_idx
  ON public.scp_interview_method_practices (method_id, peace_stage, display_order);

-- Deferred FK: implications may point at a method.
ALTER TABLE public.scp_research_implications
  ADD CONSTRAINT scp_research_implications_method_fkey
  FOREIGN KEY (affects_method_id) REFERENCES public.scp_interview_methods(id) ON DELETE RESTRICT;


-- ###########################################################################
-- SECTION 3 -- AI Task Registry
-- ###########################################################################
--
-- Every AI capability is a versioned governed task, not an informal prompt
-- call. The registry is the thing an AI run pins, so "why did the system say
-- that" stays answerable after prompts, policies, packs and providers change.
-- ---------------------------------------------------------------------------

CREATE TABLE public.scp_ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key text NOT NULL,
  task_version text NOT NULL,

  business_purpose text NOT NULL,

  -- The contract surface. These are the authority; the TypeScript registry
  -- mirrors them and a CI guard asserts the two agree, so neither can drift.
  input_schema_version text NOT NULL,
  output_schema_version text NOT NULL,
  prompt_version text NOT NULL,
  policy_version text NOT NULL,

  allowed_source_kinds text[] NOT NULL DEFAULT '{}',
  prohibited_inputs text[] NOT NULL DEFAULT '{}',
  required_governed_context text[] NOT NULL DEFAULT '{}',
  allowed_provider_capabilities text[] NOT NULL DEFAULT '{}',

  -- Always true for every task shipped in this MVP. Kept as a column rather
  -- than assumed, so switching it off is a visible, reviewable diff.
  requires_human_review boolean NOT NULL DEFAULT true,

  risk_classification text NOT NULL DEFAULT 'high' CHECK (risk_classification IN (
    'low', 'limited', 'high')),

  retention_behaviour text NOT NULL,
  evaluation_set_version text,

  activation_status text NOT NULL DEFAULT 'inactive' CHECK (activation_status IN (
    'inactive', 'shadow', 'active', 'rolled_back')),
  rollback_to_version text,

  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (task_key, task_version),
  CONSTRAINT scp_ai_tasks_activated
    CHECK ((activation_status IN ('inactive', 'shadow')) OR activated_at IS NOT NULL)
);

COMMENT ON TABLE public.scp_ai_tasks IS
  'The AI Task Registry. A run pins task_version, prompt_version, '
  'policy_version and both schema versions, so a suggestion made months ago '
  'can still be explained even though every one of those has since moved. '
  'requires_human_review is a stored column, not an assumption, so turning it '
  'off would be a diff somebody has to approve.';

CREATE INDEX scp_ai_tasks_key_idx ON public.scp_ai_tasks (task_key, activation_status);

-- One ACTIVE version per task. A newer version does not become active by
-- existing: activation is a governed act, gated on evaluation floors.
CREATE UNIQUE INDEX scp_ai_tasks_one_active_idx
  ON public.scp_ai_tasks (task_key) WHERE activation_status = 'active';


-- ###########################################################################
-- SECTION 4 -- The Security Recruitment Intelligence Graph
-- ###########################################################################
--
-- An EDGE table over records that already exist in their own canonical tables.
-- It does not copy them, does not replace the Security Competency Graph, and
-- does not become a second source of truth: a node is a (kind, id, version)
-- pointer, and the canonical row remains authoritative.
--
-- ---------------------------------------------------------------------------
-- THE MISSING COLUMN
-- ---------------------------------------------------------------------------
-- There is no `weight`, `strength`, `score` or `confidence` on this table, and
-- none may be added. Every edge here is SEMANTIC -- "this question addresses
-- that competency", "this method rests on that claim". The moment an edge
-- carries a number, the graph stops describing meaning and starts describing
-- prediction, and a traversal that multiplies those numbers is a suitability
-- model. That is precisely what section 15 of the product brief prohibits, and
-- the cheapest place to prevent it is by never creating the column.
--
-- There is likewise no node kind for a candidate. The graph connects ROLE
-- KNOWLEDGE and GOVERNED CONTENT. Case-level records (confirmed evidence, a
-- human assessment, a report) appear only as the terminal, tenant-scoped end of
-- a provenance chain, and edges to them are written by the runtime, never
-- authored by hand.
-- ---------------------------------------------------------------------------

CREATE TABLE public.scp_intel_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  from_kind text NOT NULL,
  from_id uuid NOT NULL,
  -- The exact version of the thing at each end, where it has one. Free text
  -- rather than an FK because the versions live in a dozen different tables;
  -- the (kind, id) pair is the resolvable pointer and this is the pin.
  from_version text,

  relation text NOT NULL,

  to_kind text NOT NULL,
  to_id uuid NOT NULL,
  to_version text,

  -- Which governed decision put this edge here.
  implication_id uuid REFERENCES public.scp_research_implications(id) ON DELETE SET NULL,
  note text,

  -- Tenant scope. NULL means platform-level knowledge, readable by any content
  -- role. NOT NULL means a case-derived provenance edge, readable only by that
  -- employer -- which is what keeps the graph from becoming a cross-tenant leak.
  employer_id uuid REFERENCES public.employers(id) ON DELETE CASCADE,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_intel_edges_from_kind CHECK (from_kind IN (
    'profession', 'role', 'role_version', 'role_responsibility',
    'work_environment', 'risk_context', 'regulatory_requirement',
    'scc_competency', 'scc_competency_version',
    'interview_competency', 'observable_behaviour', 'behaviour_version',
    'behavioural_indicator',
    'interview_pack', 'interview_pack_version',
    'interview_question', 'approved_probe', 'evidence_dimension',
    'rating_anchor', 'verification_rule', 'prohibited_area',
    'research_source', 'research_claim', 'research_implication',
    'interview_method', 'method_practice', 'ai_task',
    'confirmed_evidence', 'human_assessment', 'report_conclusion')),
  CONSTRAINT scp_intel_edges_to_kind CHECK (to_kind IN (
    'profession', 'role', 'role_version', 'role_responsibility',
    'work_environment', 'risk_context', 'regulatory_requirement',
    'scc_competency', 'scc_competency_version',
    'interview_competency', 'observable_behaviour', 'behaviour_version',
    'behavioural_indicator',
    'interview_pack', 'interview_pack_version',
    'interview_question', 'approved_probe', 'evidence_dimension',
    'rating_anchor', 'verification_rule', 'prohibited_area',
    'research_source', 'research_claim', 'research_implication',
    'interview_method', 'method_practice', 'ai_task',
    'confirmed_evidence', 'human_assessment', 'report_conclusion')),
  CONSTRAINT scp_intel_edges_relation CHECK (relation IN (
    'supports',            -- claim supports implication / method
    'derived_from',        -- claim derived from source
    'implements',          -- method implements implication
    'governs',             -- method or rule governs pack content
    'addresses',           -- question addresses competency / dimension
    'maps_to',             -- interview competency maps to SCC version
    'requires',            -- role requires regulatory requirement
    'observed_in',         -- behaviour observed in role
    'evidences',           -- confirmed evidence evidences a dimension
    'assessed_against',    -- assessment made against an anchor
    'reported_in',         -- evidence/assessment appears in a report
    'restricts',           -- prohibited area restricts a task or method
    'supersedes')),
  CONSTRAINT scp_intel_edges_no_self CHECK (NOT (from_kind = to_kind AND from_id = to_id)),
  UNIQUE (from_kind, from_id, relation, to_kind, to_id)
);

COMMENT ON TABLE public.scp_intel_edges IS
  'Semantic, version-pinned edges over canonical records. Deliberately has NO '
  'weight, strength or confidence column: a weighted edge is one traversal away '
  'from a hidden suitability model. Deliberately has no candidate node kind. '
  'employer_id NULL = platform knowledge; NOT NULL = a tenant-scoped provenance '
  'edge written by the runtime.';

CREATE INDEX scp_intel_edges_from_idx ON public.scp_intel_edges (from_kind, from_id);
CREATE INDEX scp_intel_edges_to_idx ON public.scp_intel_edges (to_kind, to_id);
CREATE INDEX scp_intel_edges_relation_idx ON public.scp_intel_edges (relation);
CREATE INDEX scp_intel_edges_employer_idx
  ON public.scp_intel_edges (employer_id) WHERE employer_id IS NOT NULL;

-- Case-derived node kinds are tenant data and must carry their tenant. A
-- platform-level edge must not terminate on one.
CREATE OR REPLACE FUNCTION public.scp_intel_guard_edge_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_kinds text[] := ARRAY['confirmed_evidence', 'human_assessment', 'report_conclusion'];
  _touches_case boolean;
BEGIN
  _touches_case := (NEW.from_kind = ANY (_case_kinds)) OR (NEW.to_kind = ANY (_case_kinds));

  IF _touches_case AND NEW.employer_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_INTEL_EDGE_SCOPE: an edge touching case data (%, %) must carry employer_id, or it would be readable across tenants.',
      NEW.from_kind, NEW.to_kind USING ERRCODE = 'check_violation';
  END IF;

  IF NOT _touches_case AND NEW.employer_id IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_INTEL_EDGE_SCOPE: platform knowledge edges must not be tenant-scoped; employer_id belongs only on case-derived provenance.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_intel_guard_edge_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_intel_edges_scope
  BEFORE INSERT OR UPDATE ON public.scp_intel_edges
  FOR EACH ROW EXECUTE FUNCTION public.scp_intel_guard_edge_scope();


-- ###########################################################################
-- SECTION 5 -- Grants and RLS
-- ###########################################################################
--
-- Supabase's default privileges grant anon AND authenticated the full table
-- privilege set on every new table, TRUNCATE included -- and TRUNCATE is not
-- filtered by RLS. Both roles are therefore revoked to zero before anything is
-- granted back.
-- ---------------------------------------------------------------------------

ALTER TABLE public.scp_research_sources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_research_claims             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_research_implications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_methods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_interview_method_practices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_ai_tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_intel_edges                 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.scp_research_sources           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_research_claims            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_research_implications      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_methods          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_method_practices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_ai_tasks                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_intel_edges                FROM PUBLIC, anon, authenticated;

-- Content roles author the knowledge layer; employers only ever READ the
-- approved parts of it, through the runtime.
GRANT SELECT, INSERT, UPDATE ON public.scp_research_sources           TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scp_research_claims            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scp_research_implications      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scp_interview_methods          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scp_interview_method_practices TO authenticated;
GRANT SELECT                 ON public.scp_ai_tasks                   TO authenticated;
GRANT SELECT                 ON public.scp_intel_edges                TO authenticated;

GRANT ALL ON public.scp_research_sources           TO service_role;
GRANT ALL ON public.scp_research_claims            TO service_role;
GRANT ALL ON public.scp_research_implications      TO service_role;
GRANT ALL ON public.scp_interview_methods          TO service_role;
GRANT ALL ON public.scp_interview_method_practices TO service_role;
GRANT ALL ON public.scp_ai_tasks                   TO service_role;
GRANT ALL ON public.scp_intel_edges                TO service_role;

-- Readable by any platform content role. This is governed knowledge, not
-- tenant data -- but it is still not public, and anon holds nothing.
CREATE POLICY scp_research_sources_read ON public.scp_research_sources
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_research_claims_read ON public.scp_research_claims
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_research_implications_read ON public.scp_research_implications
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_methods_read ON public.scp_interview_methods
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_interview_method_practices_read ON public.scp_interview_method_practices
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY scp_ai_tasks_read ON public.scp_ai_tasks
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));

-- Editors author; nobody self-approves (the approval columns are written only
-- by the governed RPCs in the runtime migration).
CREATE POLICY scp_research_sources_write ON public.scp_research_sources
  FOR INSERT TO authenticated WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_research_sources_update ON public.scp_research_sources
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_edit(auth.uid()))
  WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_research_claims_write ON public.scp_research_claims
  FOR INSERT TO authenticated WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_research_claims_update ON public.scp_research_claims
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_edit(auth.uid()))
  WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_research_implications_write ON public.scp_research_implications
  FOR INSERT TO authenticated WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_research_implications_update ON public.scp_research_implications
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_edit(auth.uid()))
  WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_interview_methods_write ON public.scp_interview_methods
  FOR INSERT TO authenticated WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_interview_methods_update ON public.scp_interview_methods
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_edit(auth.uid()))
  WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_interview_method_practices_write ON public.scp_interview_method_practices
  FOR INSERT TO authenticated WITH CHECK (public.scp_interview_can_edit(auth.uid()));
CREATE POLICY scp_interview_method_practices_update ON public.scp_interview_method_practices
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_edit(auth.uid()))
  WITH CHECK (public.scp_interview_can_edit(auth.uid()));

-- The graph: platform knowledge to content roles, tenant provenance to that
-- tenant only. This single policy is what prevents the graph becoming a
-- cross-employer read.
CREATE POLICY scp_intel_edges_read ON public.scp_intel_edges
  FOR SELECT TO authenticated USING (
    (employer_id IS NULL AND public.scp_interview_can_read(auth.uid()))
    OR (employer_id IS NOT NULL AND public.has_employer_role(auth.uid(), employer_id, NULL))
  );


-- ###########################################################################
-- SECTION 6 -- Seed: the sources this product actually rests on
-- ###########################################################################
--
-- Every row below comes from the reference list of the four supplied product
-- documents. Nothing here is invented: where a DOI is unknown it is NULL, and
-- access_status records honestly whether anyone has inspected the source.
--
-- review_status is 'unreviewed' for all of them. That is the true state: a
-- methodologist has not yet signed these off, and pretending otherwise in the
-- seed would be the exact failure this registry exists to prevent.
-- ---------------------------------------------------------------------------

INSERT INTO public.scp_research_sources
  (slug, title, issuing_organisation, publication_year, publication_type,
   url, jurisdiction_code, population_context, language, access_status, summary)
VALUES
  ('opm-structured-interviews',
   'Structured Interviews: A Practical Guide',
   'U.S. Office of Personnel Management', 2008, 'government_guidance',
   'https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/',
   'US', 'Public-sector selection', 'en', 'pending_verification',
   'Official guidance on structured interviewing: the same predetermined questions in the same order, with standardised rating scales anchored to observable behaviour. Used here as the basis for fixed core questions and a fixed order.'),

  ('siop-ai-talent-assessment',
   'Artificial Intelligence in Talent Assessment and Selection',
   'Society for Industrial and Organizational Psychology', 2024, 'professional_standard',
   'https://siop.org/wp-content/uploads/2024/12/Artificial-Intelligence-in-Talent-Assessment-and-Selection.pdf',
   NULL, 'Talent assessment practitioners', 'en', 'pending_verification',
   'Professional guidance on relevance, effectiveness, fairness and human oversight when AI is used in assessment and selection. Used here as the basis for requiring human confirmation and for prohibiting autonomous recommendations.'),

  ('pmfs-2017-10-fap-573-1',
   'PMFS 2017:10, FAP 573-1 — foreskrifter och allmanna rad om bevakningsforetag och bevakningspersonal',
   'Polismyndigheten', 2017, 'government_regulation',
   'https://polisen.se/51c6d188c6f3e356864df71f694502a6/siteassets/forfattningssamling/fap-nummer/fap573-01-pmfs2017-10/',
   'SE', 'Swedish contract security personnel', 'sv', 'pending_verification',
   'Swedish regulation governing security companies and security personnel. A regulatory fact, not an empirical finding: it defines mandate boundaries and authorisation requirements the interview must respect and must not attempt to replace.'),

  ('av-vald-och-hot',
   'Vald och hot om vald — forebyggande arbete, rutiner och riskhantering',
   'Arbetsmiljoverket', NULL, 'government_guidance',
   'https://www.av.se/halsa-och-sakerhet/vald-och-hot-om-vald/',
   'SE', 'Swedish workplaces exposed to violence and threats', 'sv', 'pending_verification',
   'Occupational safety guidance on preventing violence and threats, including lone working. Used here as context for why de-escalation, escalation thresholds and support resources are job-relevant interview content.'),

  ('peace-investigative-interviewing',
   'PEACE investigative interviewing framework (as described in the CQrityjob product pack)',
   NULL, NULL, 'internal_document',
   NULL, 'GB', 'Investigative interviewing', 'en', 'unavailable',
   'The PEACE process frame (Planning and Preparation, Engage and Explain, Account, Closure, Evaluation) as summarised in the supplied CQrityjob product documents. The primary literature has NOT been inspected by CQrityjob, which is why access_status is "unavailable": the product uses PEACE as a process structure only and makes no empirical claim from it.'),

  ('orbit-rapport-based-interviewing',
   'ORBIT rapport-based interviewing principles (as described in the CQrityjob product pack)',
   NULL, NULL, 'internal_document',
   NULL, 'GB', 'Investigative interviewing', 'en', 'unavailable',
   'ORBIT-inspired principles for respectful, adaptive interviewer behaviour, as summarised in the supplied CQrityjob product documents. The primary literature has NOT been inspected. The product applies these to INTERVIEWER conduct only and never as a hidden candidate measure.'),

  ('cqrityjob-vaktare-pack-v1',
   'CQrityjob Vaktare Role Interview Pack v1.0',
   'CQrityjob', 2026, 'internal_document',
   NULL, 'SE', 'Swedish security guards (vaktare)', 'sv', 'verified_read',
   'The governed content package imported in Phase 1. A considered product hypothesis, explicitly NOT an empirically validated selection method.')
ON CONFLICT (slug) DO NOTHING;


INSERT INTO public.scp_research_claims
  (slug, source_id, claim_summary, construct_or_method, population,
   supported_use, unsupported_use, limitations, evidence_strength, status)
SELECT v.slug, s.id, v.claim_summary, v.construct, v.population,
       v.supported, v.unsupported, v.limitations, v.strength, 'draft'
FROM (VALUES
  ('claim-structured-same-questions', 'opm-structured-interviews',
   'Structured interviews ask every candidate the same predetermined questions in the same order and rate answers against behaviourally anchored scales.',
   'Structured interviewing', 'Selection interviews',
   'Justifies fixing Q1-Q8 and their order, forbidding AI rewriting of core questions, and anchoring every rating to described behaviour.',
   'Does NOT justify any claim that THIS pack predicts job performance, nor any specific validity coefficient for the Vaktare content.',
   'Guidance describes the method class, not this instrument. No study of this pack exists.',
   'strong', 'draft'),

  ('claim-human-oversight-required', 'siop-ai-talent-assessment',
   'AI used in assessment and selection requires meaningful human oversight, transparency about its role, and evaluation for relevance and fairness.',
   'AI governance in selection', 'Talent assessment',
   'Justifies requiring human confirmation before any AI output becomes evidence, requiring AI disclosure in the report, and prohibiting autonomous recommendations.',
   'Does NOT justify presenting AI output as verified fact, nor treating human review as a formality that can be defaulted to accept.',
   'Professional guidance, not a legal standard, and not specific to security recruitment.',
   'moderate', 'draft'),

  ('claim-mandate-boundaries', 'pmfs-2017-10-fap-573-1',
   'Swedish security personnel operate within defined regulatory mandate and authorisation boundaries.',
   'Regulatory mandate', 'Swedish contract security',
   'Justifies treating mandate awareness as job-relevant interview content and requiring that formal authorisation is verified OUTSIDE the interview.',
   'Does NOT justify the interview establishing, replacing or evidencing any statutory authorisation, and does not permit the product to assert a candidate is authorised.',
   'A regulatory fact about the role, carrying no evidence about how to assess an individual.',
   'regulatory_fact', 'draft'),

  ('claim-violence-risk-context', 'av-vald-och-hot',
   'Preventing violence and threats in exposed workplaces depends on routines, risk assessment, escalation paths and limits on lone working.',
   'Occupational safety', 'Exposed Swedish workplaces',
   'Justifies asking about de-escalation, escalation thresholds and use of support resources as job-relevant behaviour.',
   'Does NOT justify inferring a candidate''s future safety behaviour from an interview account, nor treating a limited answer as a risk indicator.',
   'Describes the work context, not a method for assessing individuals.',
   'regulatory_fact', 'draft'),

  ('claim-peace-process-structure', 'peace-investigative-interviewing',
   'PEACE structures an interview into planning, engagement and explanation, obtaining an uninterrupted account, closure, and interviewer evaluation.',
   'PEACE', 'Investigative interviewing',
   'Justifies the session stage machine, the standardised opening, the read-back-and-correct closure, and interviewer self-evaluation after the interview.',
   'Does NOT justify any claim that PEACE validates candidate suitability, competence or truthfulness. PEACE is a process frame for the INTERVIEWER.',
   'The primary literature has not been inspected by CQrityjob, and PEACE originates in investigative rather than selection interviewing. Transfer to recruitment is a CQrityjob design decision, not a finding.',
   'insufficient', 'draft'),

  ('claim-orbit-interviewer-behaviour', 'orbit-rapport-based-interviewing',
   'Rapport-based, autonomy-supportive and non-judgemental interviewer behaviour supports fuller accounts; coercive or confrontational behaviour is counterproductive.',
   'ORBIT', 'Investigative interviewing',
   'Justifies interviewer guidance on rapport, active listening, neutral clarification and avoidance of coercive conduct, and justifies recording interviewer self-reflection.',
   'Does NOT justify scoring the candidate on their responsiveness, nor inferring anything from a candidate who gives short answers or declines to elaborate.',
   'Primary literature not inspected. Applied to interviewer conduct only. No candidate-facing measure is derived from it.',
   'insufficient', 'draft'),

  ('claim-vaktare-pack-is-hypothesis', 'cqrityjob-vaktare-pack-v1',
   'The Vaktare competencies, questions and anchors are a considered product hypothesis awaiting documented job analysis and an expert panel.',
   'Content validity', 'Swedish vaktare recruitment',
   'Justifies using the pack for controlled internal pilots and content review.',
   'Does NOT justify marketing it as scientifically validated, nor using it for consequential selection decisions before expert content validation.',
   'No job analysis, expert panel, cognitive testing or inter-rater study has been completed.',
   'insufficient', 'draft')
) AS v(slug, source_slug, claim_summary, construct, population, supported, unsupported, limitations, strength)
JOIN public.scp_research_sources s ON s.slug = v.source_slug
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Product implications: what each claim licenses, and what it does not.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_research_implications
  (claim_id, permits, does_not_justify, required_human_safeguard,
   legal_or_scientific_warning, affects_ai_task, statement_kind, approval_status)
SELECT c.id, v.permits, v.does_not, v.safeguard, v.warning, v.task, v.kind, 'draft'
FROM (VALUES
  ('claim-structured-same-questions',
   'Fix Q1-Q8 and their order for every candidate in the same process and pack version. Refuse any AI output that alters a governed question.',
   'Any claim that this instrument predicts job performance.',
   'A human reads the questions verbatim; the workspace shows the exact wording and records deviations with a reason.',
   NULL, 'governed_probe_selection', 'source_fact', 'draft'),

  ('claim-human-oversight-required',
   'Require a named human to confirm every AI-proposed evidence item before it can appear in a report, and disclose AI involvement in the report.',
   'Presenting AI output as verified fact, or a bulk "accept all" that makes review a formality.',
   'Confirmation writes a different table and records the actor; edits preserve the original wording.',
   'AI-assisted recruitment is high-risk decision support; human oversight must be real, not nominal.',
   'evidence_extraction', 'source_fact', 'draft'),

  ('claim-mandate-boundaries',
   'Treat mandate and authorisation as job-relevant interview content, and route every formal credential to separate verification.',
   'Establishing or evidencing statutory authorisation from anything said in an interview.',
   'Verification items are raised as findings for a human to action outside the interview.',
   'Regulatory requirement, not an empirical finding.',
   'verification_item_detection', 'legal_restriction', 'draft'),

  ('claim-violence-risk-context',
   'Ask about de-escalation, escalation thresholds and support resources as job-relevant behaviour.',
   'Inferring future safety behaviour from an interview account, or reading a short answer as a risk signal.',
   'Missing evidence stays insufficient evidence and never becomes a negative rating.',
   NULL, 'gap_and_contradiction_detection', 'legal_restriction', 'draft'),

  ('claim-peace-process-structure',
   'Structure the session into PEACE stages, provide a standardised opening, a read-back-and-correct closure, and interviewer self-evaluation.',
   'Any claim that PEACE validates candidate suitability, competence or truthfulness.',
   'PEACE stage state describes the process; no candidate value is derived from it.',
   'Primary literature not inspected; transfer from investigative to selection interviewing is a CQrityjob design decision, not a finding.',
   'interview_preparation_generation', 'product_design_decision', 'draft'),

  ('claim-orbit-interviewer-behaviour',
   'Show rapport, listening and neutral-clarification guidance to the interviewer, and record the interviewer''s own reflection.',
   'Scoring the candidate on responsiveness, elaboration or cooperativeness.',
   'Every ORBIT-derived field describes the interviewer''s conduct. No counterpart candidate field exists.',
   'Primary literature not inspected. Applied to interviewer conduct only.',
   'contextual_probe_suggestion', 'product_design_decision', 'draft'),

  ('claim-vaktare-pack-is-hypothesis',
   'Run controlled internal pilots on the pack and collect content-review feedback.',
   'Marketing the pack as scientifically validated, or using it for consequential selection before expert content validation.',
   'The pack carries validation_label = pilot_hypothesis everywhere it is shown, and publication requires four human review gates.',
   'No job analysis, expert panel, cognitive testing or inter-rater study has been completed.',
   NULL, 'unvalidated_hypothesis', 'draft')
) AS v(claim_slug, permits, does_not, safeguard, warning, task, kind)
JOIN public.scp_research_claims c ON c.slug = v.claim_slug;


-- ---------------------------------------------------------------------------
-- The method library: PEACE and ORBIT as concrete product behaviour.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_interview_methods
  (slug, version_number, name, method_family, purpose, intended_context,
   supported_behaviours, prohibited_interpretations, product_implementation,
   jurisdiction_code, approval_state)
VALUES
  ('peace-recruitment', 1, 'PEACE (recruitment adaptation)', 'peace',
   'Give the interview a predictable shape so every candidate gets the same process and the account comes before any evaluation.',
   'Structured recruitment interviews for security roles.',
   ARRAY['Plan against the approved brief','Explain the process and the AI role','Take an uninterrupted account first','Read the facts back for correction','Evaluate individually against anchors after the account'],
   ARRAY['PEACE does not validate candidate suitability','PEACE is not a credibility method','Completing the stages says nothing about the candidate'],
   'The session state machine (planning, engage_explain, account, closure, evaluation), the standardised opening, the read-back closure with a candidate_correction field, and interviewer self-evaluation at the end.',
   'SE', 'draft'),

  ('orbit-interviewer-conduct', 1, 'ORBIT-informed interviewer conduct', 'orbit',
   'Support rapport-based, autonomy-supportive and non-judgemental interviewer behaviour, and warn against counterproductive conduct.',
   'Any interview conducted through the workspace.',
   ARRAY['Build rapport before the account','Support the candidate''s autonomy','Listen actively and reflect back','Clarify without judgement','Adapt within approved bounds'],
   ARRAY['Never a measure of the candidate','A short or hesitant answer means nothing about the person','Rapport is not a technique for extracting admissions'],
   'Stage-scoped interviewer guidance rendered in the workspace, permitted-probe purposes, and the process_reflection field which is about the interviewer.',
   NULL, 'draft'),

  ('structured-behavioural-vaktare', 1, 'Structured behavioural interviewing', 'structured_behavioural',
   'Ask every candidate the same behavioural questions in the same order and rate against behavioural anchors.',
   'Vaktare recruitment, and any role with a governed pack.',
   ARRAY['Same questions, same order','Past behaviour described by the candidate','Rating against described behaviour, not impression'],
   ARRAY['Question order is not a difficulty ramp','An anchor level is not a score to be totalled'],
   'Q1-Q8 pinned from the pack version, rendered verbatim, with per-question anchors 0-4 and no aggregation anywhere.',
   NULL, 'draft'),

  ('evidence-oriented-probing', 1, 'Evidence-oriented probing', 'evidence_oriented_probing',
   'Follow up only to fill defined evidence gaps, using approved neutral wording.',
   'The account stage of any governed interview.',
   ARRAY['Probe against a named evidence dimension','Use the pack''s approved wording','Record which probe was used'],
   ARRAY['A probe is not a challenge','Repeated probing is not a credibility test'],
   'Approved probes selected from the pinned pack, probe_usages recording what was actually asked, and a bounded contextual clarification path.',
   NULL, 'draft'),

  ('prohibited-interview-practice', 1, 'Prohibited interviewing practice', 'prohibited_practice',
   'Name the practices that must not be used, so the product can warn rather than assume.',
   'All interviews.',
   ARRAY[]::text[],
   ARRAY['Leading questions','Accusatory questions before facts are established','Credibility commentary','Irrelevant protected personal information','Hypothetical coercion scenarios that reward aggression'],
   'Prohibited areas from the pinned pack rendered as workspace warnings, and a policy validator that rejects AI output attempting any of them.',
   NULL, 'draft')
ON CONFLICT (slug, version_number) DO NOTHING;


INSERT INTO public.scp_interview_method_practices
  (method_id, peace_stage, practice_kind, statement_sv, rationale, claim_id, display_order)
SELECT m.id, v.stage, v.kind, v.sv, v.rationale,
       (SELECT c.id FROM public.scp_research_claims c WHERE c.slug = v.claim_slug),
       v.ord
FROM (VALUES
  ('peace-recruitment','planning','checklist_item','Rätt rollpaketsversion vald och godkänd intervjuplan finns.','Comparability depends on every candidate meeting the same pinned content.','claim-structured-same-questions',1),
  ('peace-recruitment','planning','checklist_item','Anpassningar och tekniska förutsättningar kontrollerade.','An accommodation must never disadvantage the candidate.','claim-orbit-interviewer-behaviour',2),
  ('peace-recruitment','planning','checklist_item','Bedömare känner inte till varandras kommande bedömningar.','Individual judgement before panel discussion prevents anchoring.','claim-structured-same-questions',3),
  ('peace-recruitment','engage_explain','opening_script','Vi ställer samma kärnfrågor till alla kandidater för den här tjänsten. Vi vill förstå konkreta situationer, vad du själv gjorde och vad resultatet blev.','A standardised opening is part of treating candidates equally.','claim-structured-same-questions',1),
  ('peace-recruitment','engage_explain','opening_script','Vi använder ett AI-stöd för att strukturera underlaget, men det är människor som bedömer och fattar beslut.','Transparency about the AI role is required, not optional.','claim-human-oversight-required',2),
  ('peace-recruitment','engage_explain','engagement_guidance','Säg att kandidaten när som helst kan be dig upprepa eller förklara en fråga.','Autonomy-supportive framing produces fuller accounts.','claim-orbit-interviewer-behaviour',3),
  ('peace-recruitment','account','listening_prompt','Låt kandidaten tala färdigt innan du ställer följdfrågor.','An uninterrupted account first is the core of the method.','claim-peace-process-structure',1),
  ('peace-recruitment','account','probing_guidance','Använd endast godkända följdfrågor och notera vilken du använde.','Governed mode means approved probes only.','claim-structured-same-questions',2),
  ('peace-recruitment','account','warning','Tolka inte nervositet, tystnad, språkvariation eller begärd anpassning som information om kandidaten.','These are properties of the interview situation, not of the person.','claim-orbit-interviewer-behaviour',3),
  ('peace-recruitment','closure','closure_step','Sammanfatta fakta och låt kandidaten korrigera dig.','The candidate has a right to correct the record before evaluation.','claim-peace-process-structure',1),
  ('peace-recruitment','closure','closure_step','Fråga om något relevant saknas som du inte hunnit fråga om.','Missing evidence is a process gap, not a candidate deficit.','claim-violence-risk-context',2),
  ('peace-recruitment','evaluation','self_evaluation_question','Ställde jag alla kärnfrågor i rätt ordning, och dokumenterade jag varje avvikelse?','Process fidelity is measurable and is about the interviewer.','claim-structured-same-questions',1),
  ('peace-recruitment','evaluation','self_evaluation_question','Bedömde jag mot ankaret och citerad evidens, inte mot mitt första intryck?','Anchored judgement after the account is what the method requires.','claim-structured-same-questions',2),
  ('orbit-interviewer-conduct','engage_explain','engagement_guidance','Bygg kontakt innan redogörelsen; en trygg kandidat berättar mer konkret.','Rapport supports fuller accounts.','claim-orbit-interviewer-behaviour',1),
  ('orbit-interviewer-conduct','account','listening_prompt','Spegla tillbaka det du hört och be om bekräftelse innan du går vidare.','Checking understanding is non-judgemental clarification.','claim-orbit-interviewer-behaviour',2),
  ('orbit-interviewer-conduct','account','warning','Undvik konfrontation, prestige och pressande upprepning. Det ger sämre underlag, inte bättre.','Coercive interviewing is counterproductive.','claim-orbit-interviewer-behaviour',3),
  ('orbit-interviewer-conduct','evaluation','self_evaluation_question','Var mitt bemötande respektfullt och autonomistödjande genom hela intervjun?','ORBIT is about the interviewer''s conduct.','claim-orbit-interviewer-behaviour',1)
) AS v(method_slug, stage, kind, sv, rationale, claim_slug, ord)
JOIN public.scp_interview_methods m ON m.slug = v.method_slug AND m.version_number = 1;


-- ---------------------------------------------------------------------------
-- The AI Task Registry.
--
-- activation_status = 'active' means the task may RUN. It does not mean a real
-- provider is reachable: the shipped configuration runs every one of these
-- against the deterministic mock, and scp_interview_ai_config.ai_enabled is
-- false. Activating a PROVIDER is a separate owner decision.
--
-- risk_classification is 'high' for every task that touches candidate material,
-- because recruitment decision support is high-risk by nature and classifying
-- it otherwise would be the first step in treating it casually.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_ai_tasks
  (task_key, task_version, business_purpose,
   input_schema_version, output_schema_version, prompt_version, policy_version,
   allowed_source_kinds, prohibited_inputs, required_governed_context,
   allowed_provider_capabilities, requires_human_review, risk_classification,
   retention_behaviour, evaluation_set_version, activation_status, activated_at)
VALUES
  ('role_requirement_extraction','1.0.0',
   'Extract mandatory, preferred and contextual requirements from the employer''s own role material.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['job_description','employer_requirements'],
   ARRAY['candidate_cv','application_answers','transcript','protected_characteristics'],
   ARRAY['pack_version'], ARRAY['text_completion'], true,'high',
   'Outputs retained with the case; raw provider exchange retained for audit only.','gold-v1','active', now()),

  ('candidate_source_extraction','1.0.0',
   'Extract factual employment, education, credential and skill statements from candidate-supplied sources.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['candidate_cv','application_answers'],
   ARRAY['protected_characteristics','health_information','family_status','photographs'],
   ARRAY['pack_version'], ARRAY['text_completion'], true,'high',
   'Outputs retained with the case; erased when the case source is erased.','gold-v1','active', now()),

  ('interview_preparation_generation','1.0.0',
   'Combine role requirements, candidate facts and the pinned pack into a grounded draft preparation brief.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['job_description','employer_requirements','candidate_cv','application_answers'],
   ARRAY['protected_characteristics'],
   ARRAY['pack_version','core_questions','evidence_dimensions','prohibited_areas'],
   ARRAY['text_completion'], true,'high',
   'Draft plan retained with the case until superseded.','gold-v1','active', now()),

  ('governed_probe_selection','1.0.0',
   'Select relevant probes that already exist in the pinned pack. Selection only: the output schema accepts pack probe ids and nothing else.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['candidate_cv','application_answers'],
   ARRAY['protected_characteristics'],
   ARRAY['pack_version','approved_probes'], ARRAY['text_completion'], true,'limited',
   'Selections retained as preparation items.','gold-v1','active', now()),

  ('contextual_probe_suggestion','1.0.0',
   'Suggest a bounded neutral clarification where a defined evidence gap exists and policy permits it. It may never replace or rewrite a governed question.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['candidate_cv','application_answers','interviewer_notes'],
   ARRAY['protected_characteristics'],
   ARRAY['pack_version','core_questions','prohibited_areas'], ARRAY['text_completion'], true,'high',
   'Suggestions retained as preparation items; declined suggestions retained as evidence of human control.','gold-v1','active', now()),

  ('evidence_extraction','1.0.0',
   'Propose bounded evidence excerpts from interviewer notes or an authorised transcript.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['interviewer_notes','transcript'],
   ARRAY['protected_characteristics'],
   ARRAY['pack_version','core_questions','evidence_dimensions'], ARRAY['text_completion'], true,'high',
   'Proposals retained until confirmed or rejected; the original is preserved even when edited.','gold-v1','active', now()),

  ('evidence_dimension_mapping','1.0.0',
   'Map a proposed excerpt to the governed question, evidence dimension and composite Interview Competency.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['interviewer_notes','transcript'],
   ARRAY['protected_characteristics'],
   ARRAY['pack_version','core_questions','evidence_dimensions','pack_competencies'],
   ARRAY['text_completion'], true,'high',
   'Mapping stored on the proposal row.','gold-v1','active', now()),

  ('gap_and_contradiction_detection','1.0.0',
   'Identify missing, unclear or internally inconsistent information WITHOUT inferring deception.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['candidate_cv','application_answers','interviewer_notes','transcript'],
   ARRAY['protected_characteristics'],
   ARRAY['pack_version','evidence_dimensions'], ARRAY['text_completion'], true,'high',
   'Findings retained with the case.','gold-v1','active', now()),

  ('verification_item_detection','1.0.0',
   'Separate claims requiring external verification from behavioural interview evidence.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['candidate_cv','application_answers','interviewer_notes'],
   ARRAY['protected_characteristics'],
   ARRAY['pack_version','verification_rules'], ARRAY['text_completion'], true,'high',
   'Findings retained with the case.','gold-v1','active', now()),

  ('interview_summary_draft','1.0.0',
   'Draft a factual summary grounded ONLY in human-confirmed evidence.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['interviewer_notes'],
   ARRAY['protected_characteristics','unconfirmed_ai_proposals'],
   ARRAY['confirmed_evidence'], ARRAY['text_completion'], true,'high',
   'Draft retained on the report row alongside the finalised payload.','gold-v1','active', now()),

  ('report_draft_generation','1.0.0',
   'Prepare report language. It does not create, suggest or imply the employer''s decision.',
   '1.0.0','1.0.0','1.0.0','1.0.0',
   ARRAY['interviewer_notes'],
   ARRAY['protected_characteristics','unconfirmed_ai_proposals'],
   ARRAY['confirmed_evidence','human_assessments'], ARRAY['text_completion'], true,'high',
   'Draft retained on the report row.','gold-v1','active', now())
ON CONFLICT (task_key, task_version) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Graph edges: the traceability chain the addendum asks for, made real.
--
--   research_source -> research_claim -> implication -> method -> pack version
--
-- The remaining links (pack version -> question -> dimension -> confirmed
-- evidence -> assessment -> report) are written by the runtime as a case
-- progresses, tenant-scoped, so the chain completes with real provenance rather
-- than with hand-authored edges pretending to be provenance.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, note)
SELECT 'research_claim', c.id, 'derived_from', 'research_source', c.source_id,
       'Claim registered against the source it was taken from.'
FROM public.scp_research_claims c
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, implication_id, note)
SELECT 'research_implication', i.id, 'supports', 'research_claim', i.claim_id, i.id,
       'Implication states what this claim does and does not license.'
FROM public.scp_research_implications i
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, note)
SELECT 'method_practice', p.id, 'supports', 'research_claim', p.claim_id,
       'Interviewer practice leaning on a registered claim.'
FROM public.scp_interview_method_practices p
WHERE p.claim_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, note)
SELECT 'method_practice', p.id, 'implements', 'interview_method', p.method_id,
       'Practice belongs to its governed method.'
FROM public.scp_interview_method_practices p
ON CONFLICT DO NOTHING;

-- The methods govern the Vaktare pack version imported in Phase 1.
INSERT INTO public.scp_intel_edges
  (from_kind, from_id, from_version, relation, to_kind, to_id, to_version, note)
SELECT 'interview_method', m.id, m.version_number::text, 'governs',
       'interview_pack_version', v.id, v.version_number::text,
       'This governed method shapes how the pack is used in the workspace.'
FROM public.scp_interview_methods m
CROSS JOIN (
  SELECT ver.id, ver.version_number
  FROM public.scp_interview_pack_versions ver
  JOIN public.scp_interview_packs p ON p.id = ver.pack_id
  WHERE p.slug = 'vaktare-se' AND ver.version_number = 1
) v
WHERE m.slug IN ('peace-recruitment','orbit-interviewer-conduct',
                 'structured-behavioural-vaktare','evidence-oriented-probing',
                 'prohibited-interview-practice')
ON CONFLICT DO NOTHING;

-- Every composite Interview Competency to the exact SCC competency versions it
-- spans. This is the owner decision made queryable: many-to-many, version-bound,
-- and carrying NO weight, because the edge table has no weight column.
INSERT INTO public.scp_intel_edges
  (from_kind, from_id, relation, to_kind, to_id, to_version, note)
SELECT 'interview_competency', c.id, 'maps_to',
       'scc_competency_version', m.competency_version_id, cv.version_number::text,
       format('%s mapping, relation=%s, state=%s. Semantic only: unweighted and non-aggregating.',
              c.code, m.relation, m.mapping_state)
FROM public.scp_interview_pack_competency_map m
JOIN public.scp_interview_pack_competencies c ON c.id = m.pack_competency_id
JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
ON CONFLICT DO NOTHING;

-- Each governed question to the competencies it addresses.
INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, note)
SELECT 'interview_question', qc.question_id, 'addresses',
       'interview_competency', qc.pack_competency_id,
       CASE WHEN qc.is_primary THEN 'Primary competency for this question.'
            ELSE 'Additional competency addressed by this question.' END
FROM public.scp_interview_question_competencies qc
ON CONFLICT DO NOTHING;

-- Each evidence dimension to the question it belongs to.
INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, note)
SELECT 'evidence_dimension', d.id, 'addresses', 'interview_question', d.question_id,
       'Evidence sought for this question.'
FROM public.scp_interview_evidence_dimensions d
ON CONFLICT DO NOTHING;

-- Prohibited areas restrict the AI tasks that could otherwise breach them.
INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, note)
SELECT 'prohibited_area', pa.id, 'restricts', 'ai_task', t.id,
       format('%s restricts what %s may output.', pa.code, t.task_key)
FROM public.scp_interview_prohibited_areas pa
CROSS JOIN public.scp_ai_tasks t
WHERE pa.area_type IN ('capability', 'inference')
  AND t.activation_status = 'active'
ON CONFLICT DO NOTHING;


-- ###########################################################################
-- SECTION 7 -- Fail-fast assertions
-- ###########################################################################

DO $assert$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_research_sources;
  IF _n < 7 THEN RAISE EXCEPTION 'SCP_IIR_ASSERT: expected at least 7 research sources, found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_research_claims;
  IF _n < 7 THEN RAISE EXCEPTION 'SCP_IIR_ASSERT: expected at least 7 research claims, found %.', _n; END IF;

  -- Every claim must state its limits. This is the assertion that keeps the
  -- registry honest.
  SELECT count(*) INTO _n FROM public.scp_research_claims
   WHERE btrim(unsupported_use) = '' OR btrim(limitations) = '';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIR_ASSERT: % claim(s) have no stated limits; a finding without its boundary is how overreach starts.', _n;
  END IF;

  -- Nothing may arrive pre-approved. Review is a human act.
  SELECT count(*) INTO _n FROM public.scp_research_claims WHERE status <> 'draft';
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_IIR_ASSERT: % seeded claim(s) are not draft.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_research_sources WHERE review_status <> 'unreviewed';
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_IIR_ASSERT: % seeded source(s) claim review that has not happened.', _n; END IF;

  -- PEACE and ORBIT must each name what they must NOT be read as.
  SELECT count(*) INTO _n FROM public.scp_interview_methods
   WHERE method_family IN ('peace','orbit')
     AND coalesce(array_length(prohibited_interpretations, 1), 0) = 0;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIR_ASSERT: a PEACE/ORBIT method states no prohibited interpretation.';
  END IF;

  SELECT count(*) INTO _n FROM public.scp_ai_tasks WHERE activation_status = 'active';
  IF _n <> 11 THEN RAISE EXCEPTION 'SCP_IIR_ASSERT: expected 11 active AI tasks, found %.', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_ai_tasks WHERE NOT requires_human_review;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIR_ASSERT: % AI task(s) do not require human review.', _n;
  END IF;

  -- The whole traceability chain must actually resolve, not merely exist as
  -- separate tables.
  SELECT count(*) INTO _n
    FROM public.scp_intel_edges e_impl
    JOIN public.scp_intel_edges e_claim
      ON e_claim.from_kind = 'research_claim' AND e_claim.from_id = e_impl.to_id
   WHERE e_impl.from_kind = 'research_implication'
     AND e_impl.relation = 'supports'
     AND e_claim.relation = 'derived_from'
     AND e_claim.to_kind = 'research_source';
  IF _n = 0 THEN
    RAISE EXCEPTION 'SCP_IIR_ASSERT: the implication -> claim -> source chain does not resolve.';
  END IF;

  SELECT count(*) INTO _n FROM public.scp_intel_edges
   WHERE from_kind = 'interview_competency' AND relation = 'maps_to';
  IF _n <> 11 THEN
    RAISE EXCEPTION 'SCP_IIR_ASSERT: expected 11 competency mapping edges, found %.', _n;
  END IF;

  RAISE NOTICE 'SCP_IIR_ASSERT: registries seeded; % graph edges.',
    (SELECT count(*) FROM public.scp_intel_edges);
END
$assert$;
