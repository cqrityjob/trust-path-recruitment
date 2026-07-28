-- Security Career Discovery v3.0 — Phase 1: versioned definition and
-- persistence.
--
-- ADDITIVE ONLY. This migration:
--   · creates no destructive change of any kind;
--   · does not touch 'career-guidance' or 'public-career-assessment', their
--     versions, their assessment_runs, their assessment_responses or their
--     assessment_run_reports;
--   · does not alter any existing table, column, constraint, policy,
--     function or trigger.
--
-- Historical assessment data and completed reports are therefore preserved
-- untouched, and every pre-existing report stays readable exactly as it was.
--
-- ── WHAT THIS DEFINITION IS NOT ────────────────────────────────────────
--
-- The v3.0 definition ships with lifecycle status 'design'. It is NOT
-- active, NOT administrable to real candidates, and structurally cannot be
-- assigned or completed: cd_guard_session_requires_administrable_version()
-- below refuses to create a session against a non-administrable version,
-- and it is a trigger rather than an RLS policy precisely so it also fires
-- for service_role and other BYPASSRLS callers.
--
-- The catalog row is registered with employer_visible = false (the column
-- default), so it can never appear in the Employer Assessment Center. No
-- employer access to Career Discovery is created here.

-- =========================================================================
-- 1. Assessment Catalog registration
-- =========================================================================

INSERT INTO public.assessments (id, name_sv, name_en, kind, employer_visible)
VALUES (
  'security-career-discovery-v3',
  'Din karriär inom säkerhet',
  'Security Career Discovery',
  'career_guidance',
  false
)
ON CONFLICT (id) DO NOTHING;

-- assessment_versions.published_at is NOT NULL DEFAULT now() in the original
-- schema, so "registered in the catalog" and "published to candidates"
-- cannot be distinguished on that table. The discovery-specific lifecycle
-- therefore lives on cd_definition_versions below, and THAT is the column
-- the guard reads. Registering here only makes the version resolvable by
-- the existing catalog lookups.
INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, notes)
SELECT
  'security-career-discovery-v3',
  '2026-scd-v3.0.0',
  'v1',
  'Security Career Discovery v3.0 — 2 context + 20 core scored + 4 path-specific '
  'adaptive items. NOT ACTIVE: lifecycle status is design and all six content '
  'review gates are outstanding. See docs/assessment/career-discovery/ and '
  'src/lib/career-discovery/version.ts.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.assessment_versions
  WHERE assessment_id = 'security-career-discovery-v3'
    AND model_version = '2026-scd-v3.0.0'
);

-- =========================================================================
-- 2. cd_definition_versions — the discovery lifecycle record
-- =========================================================================
--
-- The "simplest versioned method compatible with the current platform"
-- rather than an admin CMS. One row per definition version, carrying every
-- version string that a report snapshot must be reproducible against.

CREATE TABLE public.cd_definition_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id text NOT NULL REFERENCES public.assessments(id) ON DELETE RESTRICT,
  assessment_version_id uuid NOT NULL REFERENCES public.assessment_versions(id) ON DELETE RESTRICT,

  definition_version text NOT NULL,
  content_version    text NOT NULL,
  scoring_version    text NOT NULL,
  taxonomy_version   text NOT NULL,

  lifecycle_status text NOT NULL DEFAULT 'design'
    CHECK (lifecycle_status IN ('design','internal_test','pilot','active','retired')),

  -- Locales this version is fully adapted for. English is authored as an
  -- adaptation, never produced by runtime machine translation.
  available_locales text[] NOT NULL DEFAULT ARRAY['sv','en']::text[],

  -- The six content review gates from question-blueprint-v3.0.md §8, plus
  -- the content review that precedes them. All false at ship.
  review_status jsonb NOT NULL DEFAULT jsonb_build_object(
    'content_review', false,
    'sme_review', false,
    'language_review', false,
    'accessibility_review', false,
    'bias_review', false,
    'privacy_legal_review', false,
    'psychometric_review', false
  ),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (assessment_id, definition_version)
);

COMMENT ON TABLE public.cd_definition_versions IS
  'Security Career Discovery version lifecycle. lifecycle_status governs '
  'whether a version may be administered; only pilot and active may be, and '
  'only when every review_status gate is true. Enforced by '
  'cd_guard_session_requires_administrable_version() as a trigger, so the '
  'rule holds for BYPASSRLS callers too.';

CREATE INDEX cd_definition_versions_assessment_idx
  ON public.cd_definition_versions (assessment_id, lifecycle_status);

CREATE TRIGGER set_cd_definition_versions_updated_at
  BEFORE UPDATE ON public.cd_definition_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed v3.0 as `design`, every gate outstanding.
INSERT INTO public.cd_definition_versions (
  assessment_id, assessment_version_id,
  definition_version, content_version, scoring_version, taxonomy_version,
  lifecycle_status
)
SELECT
  'security-career-discovery-v3',
  av.id,
  '2026-scd-v3.0.0',
  'scd-content-v3.0.0',
  'scd-scoring-v3.0.0',
  'cig-areas-v1',
  'design'
FROM public.assessment_versions av
WHERE av.assessment_id = 'security-career-discovery-v3'
  AND av.model_version = '2026-scd-v3.0.0'
ON CONFLICT (assessment_id, definition_version) DO NOTHING;

-- =========================================================================
-- 3. cd_sessions — one row per discovery attempt
-- =========================================================================
--
-- Supports both an authenticated user and an anonymous visitor. Exactly one
-- of user_id / anon_session_token is set, enforced below: the product is
-- takeable without an account, and an account is only needed to save and
-- revisit.

CREATE TABLE public.cd_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_version_id uuid NOT NULL
    REFERENCES public.cd_definition_versions(id) ON DELETE RESTRICT,

  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Opaque, high-entropy, client-held identifier for an anonymous run.
  -- Never derived from anything about the person.
  anon_session_token uuid,

  locale text NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv','en')),

  -- Context answers, denormalised onto the session because they drive
  -- routing and framing. Also stored as evidence rows in cd_evidence.
  context_status text CHECK (context_status IN (
    'exploring_security','working_in_security','developing_current_role',
    'changing_career_area','security_leader')),
  discovery_goal text CHECK (discovery_goal IN (
    'find_direction','confirm_direction','discover_opportunities',
    'understand_strengths','curious')),

  -- Resolved once from context_status and IMMUTABLE thereafter — see the
  -- guard below. Re-deriving it later from unrelated answers is exactly the
  -- instability the spec forbids.
  adaptive_path text CHECK (adaptive_path IN ('A','B','C','D','E')),

  -- Resume position.
  current_section text CHECK (current_section IN (
    'approach','others','decisions','responsibility','development')),
  current_item text,

  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','abandoned')),

  -- Consent state, recorded where applicable. Absent consent is not
  -- consent: the column is nullable and nothing reads NULL as granted.
  consent jsonb NOT NULL DEFAULT '{}'::jsonb,

  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cd_sessions_owner_exactly_one CHECK (
    (user_id IS NOT NULL AND anon_session_token IS NULL)
    OR (user_id IS NULL AND anon_session_token IS NOT NULL)
  ),
  CONSTRAINT cd_sessions_completed_has_timestamp CHECK (
    (status <> 'completed') OR (completed_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.cd_sessions IS
  'One Security Career Discovery attempt. Anonymous runs carry '
  'anon_session_token instead of user_id; anon has NO direct table access '
  '(no policy is granted to the anon role), so an anonymous run is reached '
  'only through a server function holding the token.';

CREATE UNIQUE INDEX cd_sessions_anon_token_key
  ON public.cd_sessions (anon_session_token)
  WHERE anon_session_token IS NOT NULL;
CREATE INDEX cd_sessions_user_idx ON public.cd_sessions (user_id, started_at DESC);

CREATE TRIGGER set_cd_sessions_updated_at
  BEFORE UPDATE ON public.cd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 4. cd_evidence — the Evidence Objects
-- =========================================================================
--
-- One row per answered question. UNIQUE (session_id, item_id) makes going
-- back and changing an answer an UPDATE, never a duplicate insert.
--
-- Transition screens and the preparation screen are not questions and
-- produce no row here — there is no item_id for them to carry.

CREATE TABLE public.cd_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cd_sessions(id) ON DELETE CASCADE,

  item_id text NOT NULL,
  item_version integer NOT NULL,
  item_kind text NOT NULL
    CHECK (item_kind IN ('context','single_axis','trade_off','behavioural','adaptive')),

  -- The stable, language-independent option value. Never the label, so a
  -- locale switch cannot change what was stored.
  answer_value text NOT NULL,
  -- Contextual report tags carried by the chosen option. Adaptive items only.
  answer_tags text[] NOT NULL DEFAULT ARRAY[]::text[],

  evidence_class text NOT NULL
    CHECK (evidence_class IN (
      'orientation_self_report','behavioural_signal','contextual_self_report')),

  -- Derived from evidence_class and verified by trigger — never trusted
  -- from the caller.
  is_scored boolean NOT NULL,

  -- Recorded per row so a historical answer stays interpretable even if the
  -- session row is later amended.
  adaptive_path text CHECK (adaptive_path IN ('A','B','C','D','E')),

  answered_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (session_id, item_id)
);

COMMENT ON TABLE public.cd_evidence IS
  'Evidence Objects for one discovery session. is_scored is derived from '
  'evidence_class by trigger: contextual_self_report is NEVER scored, which '
  'is how the adaptive-item scoring boundary is enforced in the database '
  'rather than only in application code.';

CREATE INDEX cd_evidence_session_idx ON public.cd_evidence (session_id);
CREATE INDEX cd_evidence_scored_idx ON public.cd_evidence (session_id) WHERE is_scored;

CREATE TRIGGER set_cd_evidence_updated_at
  BEFORE UPDATE ON public.cd_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 5. cd_report_snapshots — structured, reproducible results
-- =========================================================================
--
-- Structured result data, not rendered prose. Candidate-facing language is
-- generated from versioned content at render time, so a wording fix never
-- requires rewriting history and never silently changes what a stored
-- report meant.

CREATE TABLE public.cd_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE
    REFERENCES public.cd_sessions(id) ON DELETE CASCADE,

  -- Immutable version references. Copied as text rather than FK'd so the
  -- snapshot stays interpretable even after a definition row is retired,
  -- while cd_sessions.definition_version_id keeps the live link.
  definition_version text NOT NULL,
  content_version    text NOT NULL,
  scoring_version    text NOT NULL,
  taxonomy_version   text NOT NULL,

  -- Structured payloads. Shapes are owned by Phase 3 and deliberately not
  -- constrained further here.
  dna_scores          jsonb NOT NULL DEFAULT '{}'::jsonb,
  career_areas        jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  coverage            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Contextual layer. Report wording, learning, next steps and examples may
  -- read this. Nothing in dna_scores / career_areas / confidence / coverage
  -- may be derived from it.
  contextual_tags     text[] NOT NULL DEFAULT ARRAY[]::text[],
  context_status      text,
  discovery_goal      text,

  generated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cd_report_snapshots IS
  'Immutable structured snapshot of one discovery result. contextual_tags '
  'is the ONLY place adaptive answers reach a report, and it may influence '
  'wording, learning, next steps and examples — never dna_scores, '
  'career_areas, confidence or coverage. Deleting the person''s cd_sessions '
  'row cascades to here, so immutability never obstructs erasure.';

CREATE INDEX cd_report_snapshots_generated_idx
  ON public.cd_report_snapshots (generated_at DESC);

-- =========================================================================
-- 6. Guards
-- =========================================================================
--
-- All are triggers, not RLS policies. A trigger fires for service_role and
-- any other BYPASSRLS or table-owner caller; an RLS policy does not. These
-- are integrity rules, so they must hold for every caller.

-- 6a. A session may only be created against an administrable version.
CREATE OR REPLACE FUNCTION public.cd_guard_session_requires_administrable_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _status text;
  _gates  jsonb;
  _ungated int;
BEGIN
  SELECT lifecycle_status, review_status
    INTO _status, _gates
  FROM public.cd_definition_versions
  WHERE id = NEW.definition_version_id;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'CD_UNKNOWN_DEFINITION_VERSION: %', NEW.definition_version_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _status NOT IN ('pilot', 'active') THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is %, must be pilot or active before a session may be created',
      _status USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _ungated
  FROM jsonb_each(_gates) AS g(key, value)
  WHERE g.value <> 'true'::jsonb;

  IF _ungated > 0 THEN
    RAISE EXCEPTION
      'CD_REVIEW_GATES_OUTSTANDING: % review gate(s) not cleared; no item may be administered until every gate passes',
      _ungated USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER cd_sessions_require_administrable_version_trg
  BEFORE INSERT ON public.cd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_session_requires_administrable_version();

-- 6b. The adaptive path is assigned once and never changes.
CREATE OR REPLACE FUNCTION public.cd_guard_adaptive_path_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.adaptive_path IS NOT NULL AND NEW.adaptive_path IS DISTINCT FROM OLD.adaptive_path THEN
    RAISE EXCEPTION
      'CD_ADAPTIVE_PATH_IMMUTABLE: path was % and cannot be changed to %; the path is fixed at session creation',
      OLD.adaptive_path, NEW.adaptive_path USING ERRCODE = 'check_violation';
  END IF;
  -- context_status determines the path, so it is equally frozen.
  IF OLD.context_status IS NOT NULL AND NEW.context_status IS DISTINCT FROM OLD.context_status THEN
    RAISE EXCEPTION
      'CD_CONTEXT_STATUS_IMMUTABLE: context_status was % and cannot be changed to %',
      OLD.context_status, NEW.context_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER cd_sessions_adaptive_path_immutable_trg
  BEFORE UPDATE ON public.cd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_adaptive_path_immutable();

-- 6c. is_scored is derived, never asserted. Contextual evidence is never
--     scored; the other two classes always are.
CREATE OR REPLACE FUNCTION public.cd_guard_evidence_scoring_boundary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _expected boolean;
BEGIN
  _expected := (NEW.evidence_class <> 'contextual_self_report');

  IF NEW.is_scored IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION
      'CD_SCORING_BOUNDARY_VIOLATION: evidence_class % implies is_scored=%, got %',
      NEW.evidence_class, _expected, NEW.is_scored USING ERRCODE = 'check_violation';
  END IF;

  -- Adaptive and context items are contextual by construction. This closes
  -- the path where an adaptive answer is relabelled as orientation evidence
  -- and thereby reaches the DNA computation.
  IF NEW.item_kind IN ('adaptive', 'context')
     AND NEW.evidence_class <> 'contextual_self_report' THEN
    RAISE EXCEPTION
      'CD_SCORING_BOUNDARY_VIOLATION: item_kind % must carry evidence_class contextual_self_report, got %',
      NEW.item_kind, NEW.evidence_class USING ERRCODE = 'check_violation';
  END IF;

  -- Only adaptive items may carry report tags.
  IF NEW.item_kind <> 'adaptive' AND array_length(NEW.answer_tags, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_REPORT_TAGS_ONLY_ON_ADAPTIVE: item_kind % may not carry answer_tags',
      NEW.item_kind USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER cd_evidence_scoring_boundary_trg
  BEFORE INSERT OR UPDATE ON public.cd_evidence
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_evidence_scoring_boundary();

-- 6d. An adaptive answer must belong to the session's own path.
CREATE OR REPLACE FUNCTION public.cd_guard_adaptive_matches_session_path()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _session_path text;
BEGIN
  IF NEW.item_kind <> 'adaptive' THEN
    RETURN NEW;
  END IF;

  SELECT adaptive_path INTO _session_path
  FROM public.cd_sessions WHERE id = NEW.session_id;

  IF _session_path IS NULL THEN
    RAISE EXCEPTION
      'CD_ADAPTIVE_BEFORE_PATH_ASSIGNED: session % has no adaptive_path yet',
      NEW.session_id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.adaptive_path IS DISTINCT FROM _session_path THEN
    RAISE EXCEPTION
      'CD_ADAPTIVE_PATH_MISMATCH: session is on path %, evidence claims path %',
      _session_path, NEW.adaptive_path USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER cd_evidence_adaptive_path_match_trg
  BEFORE INSERT OR UPDATE ON public.cd_evidence
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_adaptive_matches_session_path();

-- 6e. A result may not be generated before every scored core item is
--     answered. Positive proof: count the scored rows and require 20.
--     Adaptive answers are deliberately NOT required — that is the
--     structural expression of "adaptive items are never required inputs".
CREATE OR REPLACE FUNCTION public.cd_guard_snapshot_requires_core_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _scored int;
BEGIN
  SELECT count(*) INTO _scored
  FROM public.cd_evidence
  WHERE session_id = NEW.session_id AND is_scored;

  IF _scored <> 20 THEN
    RAISE EXCEPTION
      'CD_CORE_INCOMPLETE: % of 20 scored core items answered; a result cannot be generated',
      _scored USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER cd_report_snapshots_require_core_complete_trg
  BEFORE INSERT ON public.cd_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_snapshot_requires_core_complete();

-- 6f. A snapshot's version references are immutable. Erasure is by DELETE
--     (which cascades from the session), never by mutation — immutability
--     protects against modification, never against the data subject's
--     right to erasure.
CREATE OR REPLACE FUNCTION public.cd_guard_snapshot_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.definition_version IS DISTINCT FROM OLD.definition_version
     OR NEW.content_version  IS DISTINCT FROM OLD.content_version
     OR NEW.scoring_version  IS DISTINCT FROM OLD.scoring_version
     OR NEW.taxonomy_version IS DISTINCT FROM OLD.taxonomy_version
     OR NEW.session_id       IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION
      'CD_SNAPSHOT_VERSIONS_IMMUTABLE: a stored report''s version references cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER cd_report_snapshots_versions_immutable_trg
  BEFORE UPDATE ON public.cd_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_snapshot_versions_immutable();

-- =========================================================================
-- 7. RLS
-- =========================================================================
--
-- Fail closed. RLS is enabled on every new table and NO policy is granted
-- to `anon` — an anonymous run is reachable only through a server function
-- that holds the session token, exactly like the existing
-- save_career_report path. Authenticated users see their own rows only.
--
-- No employer role, and no employer-scoped policy, appears anywhere here.

ALTER TABLE public.cd_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_evidence            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cd_report_snapshots    ENABLE ROW LEVEL SECURITY;

-- Definition metadata is not sensitive: it carries no candidate data and no
-- scoring weights. Readable so a client can tell whether a version is
-- administrable before starting.
GRANT SELECT ON public.cd_definition_versions TO anon, authenticated;
GRANT ALL    ON public.cd_definition_versions TO service_role;
CREATE POLICY "cd definition versions readable"
  ON public.cd_definition_versions FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cd_sessions TO authenticated;
GRANT ALL ON public.cd_sessions TO service_role;
CREATE POLICY "cd own sessions select" ON public.cd_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "cd own sessions insert" ON public.cd_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cd own sessions update" ON public.cd_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Erasure by the data subject.
CREATE POLICY "cd own sessions delete" ON public.cd_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cd_evidence TO authenticated;
GRANT ALL ON public.cd_evidence TO service_role;
CREATE POLICY "cd own evidence select" ON public.cd_evidence
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.cd_sessions s
    WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own evidence insert" ON public.cd_evidence
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.cd_sessions s
    WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own evidence update" ON public.cd_evidence
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.cd_sessions s
    WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cd_sessions s
    WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own evidence delete" ON public.cd_evidence
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.cd_sessions s
    WHERE s.id = cd_evidence.session_id AND s.user_id = auth.uid()));

-- Snapshots are readable and erasable by their owner, never updatable by a
-- client: a stored result is not something the subject rewrites.
GRANT SELECT, DELETE ON public.cd_report_snapshots TO authenticated;
GRANT ALL ON public.cd_report_snapshots TO service_role;
CREATE POLICY "cd own snapshots select" ON public.cd_report_snapshots
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.cd_sessions s
    WHERE s.id = cd_report_snapshots.session_id AND s.user_id = auth.uid()));
CREATE POLICY "cd own snapshots delete" ON public.cd_report_snapshots
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.cd_sessions s
    WHERE s.id = cd_report_snapshots.session_id AND s.user_id = auth.uid()));
