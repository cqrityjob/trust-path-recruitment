-- Security Career Discovery v3.0 — Phase 1 database-integrity hardening.
--
-- ADDITIVE ONLY, and scoped entirely to the cd_* objects created by
-- 20260728120000_career_discovery_v3_phase1.sql. Nothing about
-- career-guidance, public-career-assessment, assessment_runs,
-- assessment_responses, assessment_run_reports, existing scoring, existing
-- reports or existing candidate routes is read, altered or referenced.
--
-- Closes five integrity gaps in the Phase 1 migration:
--
--   1. Evidence was validated by COUNT, not by IDENTITY. Twenty fabricated
--      item ids satisfied the completion guard. Now every answer is
--      resolved against a versioned item registry, and its metadata is
--      DERIVED from that registry rather than accepted from the caller.
--   2. adaptive_path was frozen after insert but never proved correct at
--      insert. Now it is derived from context_status inside the database.
--   3. Snapshot version tuples were caller-supplied and merely immutable
--      afterwards, so a wrong tuple could be frozen permanently. Now they
--      are derived from the session's definition version.
--   4. A client could mark its own session `completed` with no snapshot,
--      producing a false completed state. Now only a server-side
--      transactional path may complete a session, and in Phase 1 that path
--      deliberately refuses because no report generator exists yet.
--   5. `internal_test` had no route into the database at all. Now it has
--      exactly one: an admin-authorised function. `design` still has none.

-- =========================================================================
-- 1. cd_definition_items — the versioned item registry
-- =========================================================================
--
-- The authoritative statement of which items exist in a definition version,
-- what kind they are, what evidence they produce, whether they are scored,
-- which adaptive path owns them, and where they sit. Mirrors
-- src/lib/career-discovery/ exactly; scripts/career-discovery-check.ts
-- asserts the two agree, item for item.

CREATE TABLE public.cd_definition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_version_id uuid NOT NULL
    REFERENCES public.cd_definition_versions(id) ON DELETE CASCADE,

  item_id      text    NOT NULL,
  item_version integer NOT NULL,
  item_kind    text    NOT NULL
    CHECK (item_kind IN ('context','single_axis','trade_off','behavioural','adaptive')),
  evidence_class text  NOT NULL
    CHECK (evidence_class IN (
      'orientation_self_report','behavioural_signal','contextual_self_report')),
  is_scored boolean NOT NULL,

  -- Set for adaptive items only: the path that owns this item.
  adaptive_path text CHECK (adaptive_path IN ('A','B','C','D','E')),

  -- NULL for the two context items, which sit before any Discovery section.
  section_id text CHECK (section_id IN (
    'approach','others','decisions','responsibility','development')),
  display_order integer NOT NULL,

  -- Retirement is by flag, never by delete: a retired item must stay
  -- resolvable so historical evidence remains interpretable.
  is_active  boolean NOT NULL DEFAULT true,
  retired_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Item identity within a definition version.
  CONSTRAINT cd_definition_items_identity UNIQUE (definition_version_id, item_id),

  -- The scoring boundary, restated as a table constraint so a bad registry
  -- row cannot be authored in the first place.
  CONSTRAINT cd_definition_items_scoring_boundary CHECK (
    is_scored = (evidence_class <> 'contextual_self_report')
  ),
  CONSTRAINT cd_definition_items_contextual_kinds CHECK (
    (item_kind NOT IN ('context','adaptive'))
    OR (evidence_class = 'contextual_self_report')
  ),
  CONSTRAINT cd_definition_items_adaptive_path_presence CHECK (
    (item_kind = 'adaptive' AND adaptive_path IS NOT NULL)
    OR (item_kind <> 'adaptive' AND adaptive_path IS NULL)
  ),
  CONSTRAINT cd_definition_items_section_presence CHECK (
    (item_kind = 'context' AND section_id IS NULL)
    OR (item_kind <> 'context' AND section_id IS NOT NULL)
  ),
  CONSTRAINT cd_definition_items_retired_state CHECK (
    (is_active AND retired_at IS NULL) OR (NOT is_active AND retired_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.cd_definition_items IS
  'Versioned item registry for Security Career Discovery. The authority on '
  'which items exist in a definition version and what metadata they carry. '
  'cd_evidence DERIVES item_version, item_kind, evidence_class, is_scored '
  'and adaptive_path from this table -- caller-supplied metadata is never '
  'trusted, only rejected when it conflicts.';

CREATE INDEX cd_definition_items_version_idx
  ON public.cd_definition_items (definition_version_id, item_kind);
CREATE INDEX cd_definition_items_scored_idx
  ON public.cd_definition_items (definition_version_id)
  WHERE is_scored AND is_active;

ALTER TABLE public.cd_definition_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cd_definition_items TO anon, authenticated;
GRANT ALL    ON public.cd_definition_items TO service_role;
-- Item identity and structure carry no candidate data and no scoring
-- weights (weights live in TypeScript content, not here).
CREATE POLICY "cd definition items readable"
  ON public.cd_definition_items FOR SELECT TO anon, authenticated USING (true);

-- -------------------------------------------------------------------------
-- 1b. Seed the exact Phase 1 definition: 2 context + 20 core + 20 adaptive
-- -------------------------------------------------------------------------

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, adaptive_path, section_id, display_order)
SELECT
  dv.id, v.item_id, 1, v.item_kind,
  CASE v.item_kind
    WHEN 'behavioural' THEN 'behavioural_signal'
    WHEN 'context'     THEN 'contextual_self_report'
    WHEN 'adaptive'    THEN 'contextual_self_report'
    ELSE 'orientation_self_report'
  END,
  v.item_kind NOT IN ('context','adaptive'),
  v.adaptive_path, v.section_id, v.display_order
FROM public.cd_definition_versions dv
CROSS JOIN (VALUES
  -- Context (2) — before any section.
  ('CTX_CURRENT_STATUS','context',    NULL, NULL,             1),
  ('CTX_DISCOVERY_GOAL','context',    NULL, NULL,             2),

  -- Discovery 1 · approach
  ('S1',                'single_axis',NULL, 'approach',       1),
  ('S5',                'single_axis',NULL, 'approach',       2),
  ('T1',                'trade_off',  NULL, 'approach',       3),
  -- Discovery 2 · others
  ('S2',                'single_axis',NULL, 'others',         1),
  ('T2',                'trade_off',  NULL, 'others',         2),
  ('T6',                'trade_off',  NULL, 'others',         3),
  ('B3',                'behavioural',NULL, 'others',         4),
  -- Discovery 3 · decisions (no adaptive slot)
  ('S4',                'single_axis',NULL, 'decisions',      1),
  ('S6',                'single_axis',NULL, 'decisions',      2),
  ('T3',                'trade_off',  NULL, 'decisions',      3),
  ('T7',                'trade_off',  NULL, 'decisions',      4),
  ('B2',                'behavioural',NULL, 'decisions',      5),
  -- Discovery 4 · responsibility
  ('S3',                'single_axis',NULL, 'responsibility', 1),
  ('S7',                'single_axis',NULL, 'responsibility', 2),
  ('T4',                'trade_off',  NULL, 'responsibility', 3),
  ('B1',                'behavioural',NULL, 'responsibility', 4),
  -- Discovery 5 · development
  ('S8',                'single_axis',NULL, 'development',    1),
  ('T5',                'trade_off',  NULL, 'development',    2),
  ('T8',                'trade_off',  NULL, 'development',    3),
  ('B4',                'behavioural',NULL, 'development',    4),

  -- Adaptive bank (20) — 4 per path, slotted into D1, D2, D4, D5.
  ('ADAPT_EXPLORE_01','adaptive','A','approach',      4),
  ('ADAPT_EXPLORE_02','adaptive','A','others',        5),
  ('ADAPT_EXPLORE_03','adaptive','A','responsibility',5),
  ('ADAPT_EXPLORE_04','adaptive','A','development',   5),
  ('ADAPT_WORKING_01','adaptive','B','approach',      4),
  ('ADAPT_WORKING_02','adaptive','B','others',        5),
  ('ADAPT_WORKING_03','adaptive','B','responsibility',5),
  ('ADAPT_WORKING_04','adaptive','B','development',   5),
  ('ADAPT_DEVELOP_01','adaptive','C','approach',      4),
  ('ADAPT_DEVELOP_02','adaptive','C','others',        5),
  ('ADAPT_DEVELOP_03','adaptive','C','responsibility',5),
  ('ADAPT_DEVELOP_04','adaptive','C','development',   5),
  ('ADAPT_CHANGE_01', 'adaptive','D','approach',      4),
  ('ADAPT_CHANGE_02', 'adaptive','D','others',        5),
  ('ADAPT_CHANGE_03', 'adaptive','D','responsibility',5),
  ('ADAPT_CHANGE_04', 'adaptive','D','development',   5),
  ('ADAPT_LEADER_01', 'adaptive','E','approach',      4),
  ('ADAPT_LEADER_02', 'adaptive','E','others',        5),
  ('ADAPT_LEADER_03', 'adaptive','E','responsibility',5),
  ('ADAPT_LEADER_04', 'adaptive','E','development',   5)
) AS v(item_id, item_kind, adaptive_path, section_id, display_order)
WHERE dv.assessment_id = 'security-career-discovery-v3'
  AND dv.definition_version = '2026-scd-v3.0.0'
ON CONFLICT (definition_version_id, item_id) DO NOTHING;

-- Fail the migration loudly if the seed is not exactly 2 + 20 + 20.
DO $$
DECLARE _total int; _scored int; _adaptive int; _context int;
BEGIN
  SELECT count(*) FILTER (WHERE true),
         count(*) FILTER (WHERE is_scored),
         count(*) FILTER (WHERE item_kind = 'adaptive'),
         count(*) FILTER (WHERE item_kind = 'context')
    INTO _total, _scored, _adaptive, _context
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
  WHERE dv.assessment_id = 'security-career-discovery-v3';

  IF _total <> 42 OR _scored <> 20 OR _adaptive <> 20 OR _context <> 2 THEN
    RAISE EXCEPTION
      'CD_SEED_INCOMPLETE: expected 42 items (2 context + 20 scored + 20 adaptive), got total=% scored=% adaptive=% context=%',
      _total, _scored, _adaptive, _context;
  END IF;
END $$;

-- =========================================================================
-- 2. BLOCKER 2 — derive adaptive_path from context_status
-- =========================================================================
--
-- The caller's adaptive_path is never trusted. It is OVERWRITTEN from
-- context_status, deterministically, on every insert and update. A client
-- claiming exploring_security + path E therefore persists as path A.

CREATE OR REPLACE FUNCTION public.cd_derive_adaptive_path(_context_status text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _context_status
    WHEN 'exploring_security'      THEN 'A'
    WHEN 'working_in_security'     THEN 'B'
    WHEN 'developing_current_role' THEN 'C'
    WHEN 'changing_career_area'    THEN 'D'
    WHEN 'security_leader'         THEN 'E'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.cd_derive_adaptive_path(text) IS
  'The single source of truth for C1 -> adaptive path. Mirrors '
  'PATH_BY_CONTEXT_STATUS in src/lib/career-discovery/context-items.ts.';

CREATE OR REPLACE FUNCTION public.cd_guard_derive_adaptive_path()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _derived text;
BEGIN
  IF NEW.context_status IS NULL THEN
    -- No routing answer yet: there must be no path either.
    NEW.adaptive_path := NULL;
    RETURN NEW;
  END IF;

  _derived := public.cd_derive_adaptive_path(NEW.context_status);

  IF _derived IS NULL THEN
    RAISE EXCEPTION
      'CD_UNROUTABLE_CONTEXT_STATUS: no adaptive path is defined for context_status %',
      NEW.context_status USING ERRCODE = 'check_violation';
  END IF;

  -- Assign, never accept. A caller-supplied value is discarded.
  NEW.adaptive_path := _derived;
  RETURN NEW;
END; $$;

-- Must run BEFORE the immutability guard so the derived value is what gets
-- compared. Trigger order within the same timing is alphabetical by name,
-- and 'cd_sessions_aa_' sorts before 'cd_sessions_adaptive_path_'.
CREATE TRIGGER cd_sessions_aa_derive_path_trg
  BEFORE INSERT OR UPDATE ON public.cd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_derive_adaptive_path();

-- Now that the path is derived, an attempt to change context_status shows up
-- first as a path change. Check context_status FIRST so the caller is told
-- what they actually tried to change, rather than its downstream effect.
CREATE OR REPLACE FUNCTION public.cd_guard_adaptive_path_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.context_status IS NOT NULL AND NEW.context_status IS DISTINCT FROM OLD.context_status THEN
    RAISE EXCEPTION
      'CD_CONTEXT_STATUS_IMMUTABLE: context_status was % and cannot be changed to %; routing is fixed once assigned',
      OLD.context_status, NEW.context_status USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.adaptive_path IS NOT NULL AND NEW.adaptive_path IS DISTINCT FROM OLD.adaptive_path THEN
    RAISE EXCEPTION
      'CD_ADAPTIVE_PATH_IMMUTABLE: path was % and cannot be changed to %; the path is fixed at session creation',
      OLD.adaptive_path, NEW.adaptive_path USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

-- =========================================================================
-- 3. BLOCKER 1 — validate every answer against the registry
-- =========================================================================
--
-- Replaces the count-based trust model. Metadata is derived from
-- cd_definition_items; a caller may supply it, but only to be checked, and
-- any conflict is rejected rather than silently corrected.

CREATE OR REPLACE FUNCTION public.cd_guard_evidence_matches_definition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _defver uuid;
  _session_path text;
  _reg record;
BEGIN
  SELECT s.definition_version_id, s.adaptive_path
    INTO _defver, _session_path
  FROM public.cd_sessions s WHERE s.id = NEW.session_id;

  IF _defver IS NULL THEN
    RAISE EXCEPTION 'CD_UNKNOWN_SESSION: %', NEW.session_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT * INTO _reg
  FROM public.cd_definition_items di
  WHERE di.definition_version_id = _defver
    AND di.item_id = NEW.item_id;

  -- Unknown item id, including a semantically duplicated question filed
  -- under a new id: if it is not in the registry, it cannot be answered.
  IF _reg.item_id IS NULL THEN
    RAISE EXCEPTION
      'CD_UNKNOWN_ITEM: item "%" is not part of this session''s definition version',
      NEW.item_id USING ERRCODE = 'check_violation';
  END IF;

  IF NOT _reg.is_active THEN
    RAISE EXCEPTION 'CD_RETIRED_ITEM: item "%" is retired and cannot be answered',
      NEW.item_id USING ERRCODE = 'check_violation';
  END IF;

  -- Caller-supplied metadata is checked, then discarded in favour of the
  -- registry. A conflict is an error, not something to quietly fix.
  IF NEW.item_version IS NOT NULL AND NEW.item_version <> _reg.item_version THEN
    RAISE EXCEPTION
      'CD_ITEM_VERSION_MISMATCH: item "%" is version % in this definition, got %',
      NEW.item_id, _reg.item_version, NEW.item_version USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.item_kind IS NOT NULL AND NEW.item_kind <> _reg.item_kind THEN
    RAISE EXCEPTION
      'CD_ITEM_KIND_MISMATCH: item "%" is kind % in this definition, got %',
      NEW.item_id, _reg.item_kind, NEW.item_kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.evidence_class IS NOT NULL AND NEW.evidence_class <> _reg.evidence_class THEN
    RAISE EXCEPTION
      'CD_EVIDENCE_CLASS_MISMATCH: item "%" produces % evidence, got %',
      NEW.item_id, _reg.evidence_class, NEW.evidence_class USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_scored IS NOT NULL AND NEW.is_scored <> _reg.is_scored THEN
    RAISE EXCEPTION
      'CD_IS_SCORED_MISMATCH: item "%" has is_scored=% in this definition, got %',
      NEW.item_id, _reg.is_scored, NEW.is_scored USING ERRCODE = 'check_violation';
  END IF;

  -- Derive, so the stored row is the registry's truth regardless of input.
  NEW.item_version   := _reg.item_version;
  NEW.item_kind      := _reg.item_kind;
  NEW.evidence_class := _reg.evidence_class;
  NEW.is_scored      := _reg.is_scored;

  IF _reg.item_kind = 'adaptive' THEN
    IF _session_path IS NULL THEN
      RAISE EXCEPTION
        'CD_ADAPTIVE_BEFORE_PATH_ASSIGNED: session % has no adaptive_path yet',
        NEW.session_id USING ERRCODE = 'check_violation';
    END IF;
    -- An adaptive item from another path is never answerable.
    IF _reg.adaptive_path <> _session_path THEN
      RAISE EXCEPTION
        'CD_ADAPTIVE_PATH_MISMATCH: item "%" belongs to path %, session is on path %',
        NEW.item_id, _reg.adaptive_path, _session_path USING ERRCODE = 'check_violation';
    END IF;
    NEW.adaptive_path := _reg.adaptive_path;
  ELSE
    NEW.adaptive_path := NULL;
  END IF;

  -- Report tags remain adaptive-only.
  IF _reg.item_kind <> 'adaptive' AND array_length(NEW.answer_tags, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_REPORT_TAGS_ONLY_ON_ADAPTIVE: item "%" (kind %) may not carry answer_tags',
      NEW.item_id, _reg.item_kind USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- The metadata columns become nullable ON INPUT so a caller can omit them
-- entirely and let the database derive them. They are still NOT NULL in the
-- stored row, because the trigger always assigns before the constraint is
-- checked -- enforced by cd_evidence_derived_metadata_not_null below.
ALTER TABLE public.cd_evidence ALTER COLUMN item_version   DROP NOT NULL;
ALTER TABLE public.cd_evidence ALTER COLUMN item_kind      DROP NOT NULL;
ALTER TABLE public.cd_evidence ALTER COLUMN evidence_class DROP NOT NULL;
ALTER TABLE public.cd_evidence ALTER COLUMN is_scored      DROP NOT NULL;

ALTER TABLE public.cd_evidence
  ADD CONSTRAINT cd_evidence_derived_metadata_not_null CHECK (
    item_version IS NOT NULL AND item_kind IS NOT NULL
    AND evidence_class IS NOT NULL AND is_scored IS NOT NULL
  );

-- Runs before the existing scoring-boundary trigger (alphabetical:
-- 'cd_evidence_aa_' < 'cd_evidence_adaptive_' < 'cd_evidence_scoring_'),
-- so the boundary check validates DERIVED values rather than raw input.
CREATE TRIGGER cd_evidence_aa_matches_definition_trg
  BEFORE INSERT OR UPDATE ON public.cd_evidence
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_evidence_matches_definition();

-- =========================================================================
-- 4. BLOCKER 1 (cont.) — completion proves the exact core set
-- =========================================================================
--
-- Set equality against the registry, in both directions. A count is not a
-- proof of identity.

CREATE OR REPLACE FUNCTION public.cd_session_core_completion(_session_id uuid)
RETURNS TABLE (expected int, answered int, missing text[], unexpected text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _defver uuid;
BEGIN
  SELECT definition_version_id INTO _defver
  FROM public.cd_sessions WHERE id = _session_id;

  RETURN QUERY
  WITH required AS (
    SELECT di.item_id FROM public.cd_definition_items di
    WHERE di.definition_version_id = _defver AND di.is_scored AND di.is_active
  ), given AS (
    SELECT e.item_id FROM public.cd_evidence e
    WHERE e.session_id = _session_id AND e.is_scored
  )
  SELECT
    (SELECT count(*)::int FROM required),
    (SELECT count(*)::int FROM given),
    COALESCE(ARRAY(SELECT r.item_id FROM required r
                    WHERE r.item_id NOT IN (SELECT g.item_id FROM given g)
                    ORDER BY r.item_id), ARRAY[]::text[]),
    COALESCE(ARRAY(SELECT g.item_id FROM given g
                    WHERE g.item_id NOT IN (SELECT r.item_id FROM required r)
                    ORDER BY g.item_id), ARRAY[]::text[]);
END; $$;

CREATE OR REPLACE FUNCTION public.cd_guard_snapshot_requires_exact_core()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c record;
BEGIN
  SELECT * INTO _c FROM public.cd_session_core_completion(NEW.session_id);

  IF _c.expected = 0 THEN
    RAISE EXCEPTION
      'CD_NO_SCORED_ITEMS_DEFINED: the session''s definition version defines no scored core items'
      USING ERRCODE = 'check_violation';
  END IF;

  IF array_length(_c.missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_CORE_INCOMPLETE: % of % scored core items answered; missing %',
      _c.answered, _c.expected, _c.missing USING ERRCODE = 'check_violation';
  END IF;

  IF array_length(_c.unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_CORE_UNEXPECTED_ITEMS: scored evidence contains items outside the definition''s core set: %',
      _c.unexpected USING ERRCODE = 'check_violation';
  END IF;

  IF _c.answered <> _c.expected THEN
    RAISE EXCEPTION
      'CD_CORE_COUNT_MISMATCH: expected exactly % scored core items, found %',
      _c.expected, _c.answered USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER cd_report_snapshots_require_core_complete_trg ON public.cd_report_snapshots;
DROP FUNCTION public.cd_guard_snapshot_requires_core_complete();

CREATE TRIGGER cd_report_snapshots_require_exact_core_trg
  BEFORE INSERT ON public.cd_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_snapshot_requires_exact_core();

-- =========================================================================
-- 5. BLOCKER 3 — derive snapshot versions from the session
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cd_guard_snapshot_derive_versions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v record;
BEGIN
  SELECT dv.definition_version, dv.content_version, dv.scoring_version,
         dv.taxonomy_version, s.context_status, s.discovery_goal
    INTO _v
  FROM public.cd_sessions s
  JOIN public.cd_definition_versions dv ON dv.id = s.definition_version_id
  WHERE s.id = NEW.session_id;

  IF _v IS NULL THEN
    RAISE EXCEPTION 'CD_UNKNOWN_SESSION: %', NEW.session_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Assigned, never accepted. A caller-supplied tuple is discarded, so an
  -- incorrect one cannot be frozen by the immutability guard.
  NEW.definition_version := _v.definition_version;
  NEW.content_version    := _v.content_version;
  NEW.scoring_version    := _v.scoring_version;
  NEW.taxonomy_version   := _v.taxonomy_version;
  NEW.context_status     := _v.context_status;
  NEW.discovery_goal     := _v.discovery_goal;

  RETURN NEW;
END; $$;

-- Runs before the exact-core guard; both are BEFORE INSERT and
-- 'cd_report_snapshots_aa_' sorts first.
CREATE TRIGGER cd_report_snapshots_aa_derive_versions_trg
  BEFORE INSERT ON public.cd_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_snapshot_derive_versions();

-- =========================================================================
-- 6. BLOCKER 4 — completion is server-side and transactional
-- =========================================================================
--
-- A client may update resume position, locale, consent and discovery_goal.
-- It may NOT declare its own run complete. The transition to `completed` is
-- reachable only from inside cd_complete_session(), which sets a
-- transaction-local marker the guard checks for.

CREATE OR REPLACE FUNCTION public.cd_guard_completion_is_server_side()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF COALESCE(current_setting('cqj.cd_completing', true), '') <> NEW.id::text THEN
      RAISE EXCEPTION
        'CD_COMPLETION_REQUIRES_SERVER_PATH: a session is completed only by cd_complete_session(), which verifies the core item set and writes the report snapshot in one transaction'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- completed_at may not be set on a session that is not completed, and may
  -- not be cleared or rewritten once set.
  IF NEW.status <> 'completed' AND NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_COMPLETED_AT_WITHOUT_COMPLETION: completed_at may only be set when status is completed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'CD_COMPLETED_AT_IMMUTABLE: completed_at cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A completed session is terminal: it does not reopen.
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'CD_COMPLETED_IS_TERMINAL: a completed session cannot be reopened'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER cd_sessions_completion_server_side_trg
  BEFORE UPDATE ON public.cd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.cd_guard_completion_is_server_side();

-- The transactional completion path.
--
-- PHASE 1: deliberately refuses at the final step. Steps 1-3 (lock, verify
-- not already complete, verify the exact core set) are implemented and
-- tested now; step 4 needs the Phase 3 report generator, which does not
-- exist. Refusing is correct: a snapshot written today would carry empty
-- dna_scores and career_areas and would be a false record.
CREATE OR REPLACE FUNCTION public.cd_complete_session(_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s record; _c record;
BEGIN
  -- 1. Lock the session for the duration of the transaction.
  SELECT * INTO _s FROM public.cd_sessions WHERE id = _session_id FOR UPDATE;
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'CD_UNKNOWN_SESSION: %', _session_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 2. Repeated completion is rejected with a stable error code.
  IF _s.status = 'completed' THEN
    RAISE EXCEPTION 'CD_ALREADY_COMPLETED: session % is already completed', _session_id
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 3. Verify the exact expected core item set.
  SELECT * INTO _c FROM public.cd_session_core_completion(_session_id);
  IF array_length(_c.missing, 1) IS NOT NULL OR array_length(_c.unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_CORE_INCOMPLETE: % of % scored core items; missing %, unexpected %',
      _c.answered, _c.expected, _c.missing, _c.unexpected USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Generate and persist the report snapshot.  << PHASE 3 >>
  RAISE EXCEPTION
    'CD_REPORT_GENERATOR_NOT_IMPLEMENTED: Security Career DNA computation and Security Career Area ranking are Phase 3. No session may be completed until they exist.'
    USING ERRCODE = 'feature_not_supported';

  -- 5/6. Reserved for Phase 3, and intentionally unreachable today:
  --
  --   PERFORM set_config('cqj.cd_completing', _session_id::text, true);
  --   INSERT INTO public.cd_report_snapshots (session_id, dna_scores, ...)
  --   VALUES (_session_id, <computed>, ...);
  --   UPDATE public.cd_sessions
  --      SET status = 'completed', completed_at = now()
  --    WHERE id = _session_id;
  --   PERFORM set_config('cqj.cd_completing', '', true);
  --
  -- cd_report_snapshots.session_id is UNIQUE, so the INSERT is itself the
  -- duplicate-snapshot guard: a concurrent second completion blocks on the
  -- row lock taken in step 1 and then fails at step 2.
END; $$;

REVOKE ALL ON FUNCTION public.cd_complete_session(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cd_complete_session(uuid) TO service_role;

COMMENT ON FUNCTION public.cd_complete_session(uuid) IS
  'The ONLY path to a completed Security Career Discovery session. Locks the '
  'session, refuses repeat completion, verifies the exact core item set, then '
  'writes the snapshot and flips status atomically. Phase 1: raises '
  'CD_REPORT_GENERATOR_NOT_IMPLEMENTED at step 4 because Phase 3 does not '
  'exist yet.';

-- =========================================================================
-- 7. BLOCKER 5 — internal testing has exactly one authorised route
-- =========================================================================

ALTER TABLE public.cd_sessions
  ADD COLUMN is_internal_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cd_sessions.is_internal_test IS
  'True only for sessions opened by cd_begin_internal_test_session() against '
  'an internal_test version. Never set by a candidate client.';

-- Replaces the Phase 1 guard. Candidate administration is still pilot/active
-- only; internal_test is reachable only with the marker that
-- cd_begin_internal_test_session() sets; `design` is reachable never.
CREATE OR REPLACE FUNCTION public.cd_guard_session_requires_administrable_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _status text;
  _gates  jsonb;
  _ungated int;
  _internal_ok boolean;
BEGIN
  SELECT lifecycle_status, review_status
    INTO _status, _gates
  FROM public.cd_definition_versions
  WHERE id = NEW.definition_version_id;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'CD_UNKNOWN_DEFINITION_VERSION: %', NEW.definition_version_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- `design` is never administrable, by any route, to anyone.
  IF _status = 'design' THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is design; no session may be created against it'
      USING ERRCODE = 'check_violation';
  END IF;

  _internal_ok := COALESCE(current_setting('cqj.cd_internal_test', true), '') = 'on';

  IF _status = 'internal_test' THEN
    IF NOT _internal_ok THEN
      RAISE EXCEPTION
        'CD_INTERNAL_TEST_REQUIRES_AUTHORISED_FUNCTION: an internal_test version is reachable only through cd_begin_internal_test_session()'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT NEW.is_internal_test THEN
      RAISE EXCEPTION
        'CD_INTERNAL_TEST_MUST_BE_MARKED: a session against an internal_test version must record is_internal_test'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Internal testing deliberately runs BEFORE the review gates, which is
    -- the point of it; the participants are named and informed.
    RETURN NEW;
  END IF;

  IF _status NOT IN ('pilot', 'active') THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is %, must be pilot or active before a candidate session may be created',
      _status USING ERRCODE = 'check_violation';
  END IF;

  -- A candidate session may never be flagged as an internal test.
  IF NEW.is_internal_test THEN
    RAISE EXCEPTION
      'CD_INTERNAL_TEST_FLAG_ON_CANDIDATE_SESSION: is_internal_test is reserved for internal_test versions'
      USING ERRCODE = 'check_violation';
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

CREATE OR REPLACE FUNCTION public.cd_begin_internal_test_session(
  _definition_version_id uuid,
  _locale text DEFAULT 'sv',
  _context_status text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _new_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'CD_INTERNAL_TEST_REQUIRES_ADMIN: caller is not a platform administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT lifecycle_status INTO _status
  FROM public.cd_definition_versions WHERE id = _definition_version_id;

  IF _status IS DISTINCT FROM 'internal_test' THEN
    RAISE EXCEPTION
      'CD_NOT_AN_INTERNAL_TEST_VERSION: lifecycle_status is %, expected internal_test',
      COALESCE(_status, 'unknown') USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('cqj.cd_internal_test', 'on', true);

  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, context_status, is_internal_test)
  VALUES (_definition_version_id, auth.uid(), _locale, _context_status, true)
  RETURNING id INTO _new_id;

  PERFORM set_config('cqj.cd_internal_test', '', true);
  RETURN _new_id;
END; $$;

REVOKE ALL ON FUNCTION public.cd_begin_internal_test_session(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_begin_internal_test_session(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cd_begin_internal_test_session(uuid, text, text) IS
  'The only route to an internal_test session. Requires a platform '
  'administrator, refuses any status other than internal_test, and marks the '
  'session is_internal_test. Never reachable for design, and never a bypass '
  'of the pilot/active + review-gate rule for ordinary candidates.';

-- =========================================================================
-- 8. Anonymous session support — RESERVED, not implemented
-- =========================================================================
--
-- Corrects the Phase 1 comment, which described a server function that does
-- not exist. The anon_session_token column and its unique index remain as
-- reserved structure. anon holds no privilege on this table and gains none
-- here; nothing can currently create or read an anonymous session.

COMMENT ON TABLE public.cd_sessions IS
  'One Security Career Discovery attempt. ANONYMOUS SESSIONS ARE RESERVED '
  'AND NOT YET IMPLEMENTED: anon_session_token and its unique index exist as '
  'structure only, no server function creates or reads such a session, and '
  'the anon role holds no privilege on this table. Phase 2 must implement '
  'and test that path before any anonymous run is possible.';

COMMENT ON COLUMN public.cd_sessions.anon_session_token IS
  'RESERVED for Phase 2 anonymous runs. No code path writes or reads this '
  'column today.';
