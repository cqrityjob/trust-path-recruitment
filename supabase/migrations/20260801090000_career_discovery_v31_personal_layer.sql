-- Security Career Discovery v3.1 — register the personal layer.
--
-- ADDITIVE ONLY. No table, constraint, trigger, function or existing row is
-- changed. This migration inserts 22 registry rows and nothing else.
--
-- ── WHAT THIS CLOSES ───────────────────────────────────────────────────
--
-- v3.0's registry holds 42 items: 2 context + 20 core + 20 adaptive.
-- v3.1's registry (20260730100000) holds only the 20 scored core items, so a
-- v3.1 session could serve 20 questions, not the frozen MVP's 26. The two
-- context questions and the 20 adaptive items already exist in
-- src/lib/career-discovery/context-items.ts and adaptive-items.ts and are
-- already registered for v3.0 — they were simply never registered against the
-- v3.1 definition version.
--
-- This registers them. It does not author a question, change a question, or
-- introduce a second adaptive engine.
--
-- ── OWNER DECISION (MVP v1.0) ──────────────────────────────────────────
--
-- The adaptive bank already implemented in this repository is the canonical
-- adaptive bank for MVP v1.0. The Career Intelligence Excel is NOT the
-- assessment question bank — it is the Career Intelligence Engine, applied
-- AFTER the assessment. Sheet 12's alternative wording is therefore
-- deliberately not used here.
--
-- ── WHY CAREER DNA CANNOT MOVE ─────────────────────────────────────────
--
-- Every row below is `contextual_self_report`, and
-- cd_definition_items_scoring_boundary makes is_scored = false mechanically
-- true for that class — it is a table constraint, not a convention.
--
-- cd_v31_validate_session_evidence counts expected answers with
--
--   WHERE is_scored AND item_kind IN ('scale', 'single_choice')
--
-- so these 22 rows are excluded twice over: by is_scored and by item_kind.
-- The scored set stays exactly the 20 CQ items, the completion contract is
-- unchanged, and no stored report can shift. The v3.1 assertion below proves
-- the scored count is still 20 after this migration runs.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────
--
-- DELETE the 22 rows for definition_version '2026-scd-v3.1.0' where
-- evidence_class = 'contextual_self_report'. Nothing else was touched.

-- =========================================================================
-- 1. The 22 personal-layer items
-- =========================================================================
--
-- item_id, item_kind, evidence_class and item_version are transcribed from
-- the v3.0 registry unchanged, because they describe the same questions.
--
-- section_id is likewise inherited from v3.0 so a single item id does not
-- carry two different section meanings across versions. display_order is
-- v3.1's own: core items occupy 1–20 globally, so the personal layer takes
-- 1–2 (context, before the core block) and 21–24 (adaptive, after it),
-- matching the frozen MVP sequence 2 → 20 → 4.
--
-- Only four adaptive items are ever served in one session — the path derived
-- from C1 selects which four. All 20 are registered because a registry
-- describes what MAY be answered under a definition version, and
-- cd_guard_evidence_matches_definition already refuses an item from any path
-- other than the session's own.

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, adaptive_path, section_id, display_order)
SELECT
  dv.id, v.item_id, 1, v.item_kind, 'contextual_self_report', false,
  v.adaptive_path, v.section_id, v.display_order
FROM public.cd_definition_versions dv
CROSS JOIN (VALUES
  -- Stage 1 · the two owner-locked context questions. section_id is NULL:
  -- they sit before any Discovery section, and
  -- cd_definition_items_section_presence requires exactly that for 'context'.
  ('CTX_CURRENT_STATUS','context', NULL, NULL,              1),
  ('CTX_DISCOVERY_GOAL','context', NULL, NULL,              2),

  -- Stage 3 · the adaptive bank, 4 per path.
  ('ADAPT_EXPLORE_01','adaptive','A','approach',           21),
  ('ADAPT_EXPLORE_02','adaptive','A','others',             22),
  ('ADAPT_EXPLORE_03','adaptive','A','responsibility',     23),
  ('ADAPT_EXPLORE_04','adaptive','A','development',        24),
  ('ADAPT_WORKING_01','adaptive','B','approach',           21),
  ('ADAPT_WORKING_02','adaptive','B','others',             22),
  ('ADAPT_WORKING_03','adaptive','B','responsibility',     23),
  ('ADAPT_WORKING_04','adaptive','B','development',        24),
  ('ADAPT_DEVELOP_01','adaptive','C','approach',           21),
  ('ADAPT_DEVELOP_02','adaptive','C','others',             22),
  ('ADAPT_DEVELOP_03','adaptive','C','responsibility',     23),
  ('ADAPT_DEVELOP_04','adaptive','C','development',        24),
  ('ADAPT_CHANGE_01', 'adaptive','D','approach',           21),
  ('ADAPT_CHANGE_02', 'adaptive','D','others',             22),
  ('ADAPT_CHANGE_03', 'adaptive','D','responsibility',     23),
  ('ADAPT_CHANGE_04', 'adaptive','D','development',        24),
  ('ADAPT_LEADER_01', 'adaptive','E','approach',           21),
  ('ADAPT_LEADER_02', 'adaptive','E','others',             22),
  ('ADAPT_LEADER_03', 'adaptive','E','responsibility',     23),
  ('ADAPT_LEADER_04', 'adaptive','E','development',        24)
) AS v(item_id, item_kind, adaptive_path, section_id, display_order)
WHERE dv.assessment_id = 'security-career-discovery-v3'
  AND dv.definition_version = '2026-scd-v3.1.0'
ON CONFLICT (definition_version_id, item_id) DO NOTHING;

-- =========================================================================
-- 2. Prove the result, and prove what did NOT change
-- =========================================================================
--
-- A silent partial seed is the failure mode that matters here: a session
-- would serve fewer than 26 questions and nothing would report it. This
-- block fails the migration instead.

DO $$
DECLARE
  _total int; _scored int; _context int; _adaptive int; _paths int;
  _v30_total int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE di.is_scored),
         count(*) FILTER (WHERE di.item_kind = 'context'),
         count(*) FILTER (WHERE di.item_kind = 'adaptive'),
         count(DISTINCT di.adaptive_path) FILTER (WHERE di.item_kind = 'adaptive')
    INTO _total, _scored, _context, _adaptive, _paths
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
  WHERE dv.definition_version = '2026-scd-v3.1.0';

  IF _total <> 42 THEN
    RAISE EXCEPTION
      'CD_V31_REGISTRY_INCOMPLETE: expected 42 items (2 context + 20 core + 20 adaptive), got %',
      _total;
  END IF;

  -- The load-bearing assertion. If this ever moves, Career DNA has changed.
  IF _scored <> 20 THEN
    RAISE EXCEPTION
      'CD_V31_SCORED_SET_CHANGED: the scored set must remain exactly the 20 core items, got %',
      _scored;
  END IF;

  IF _context <> 2 OR _adaptive <> 20 OR _paths <> 5 THEN
    RAISE EXCEPTION
      'CD_V31_PERSONAL_LAYER_INCOMPLETE: got % context, % adaptive across % paths',
      _context, _adaptive, _paths;
  END IF;

  -- v3.0 is untouched: same 42 rows it has had since 20260728130000.
  SELECT count(*) INTO _v30_total
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
  WHERE dv.definition_version = '2026-scd-v3.0.0';

  IF _v30_total <> 42 THEN
    RAISE EXCEPTION 'CD_V30_REGISTRY_DISTURBED: v3.0 should still hold 42 items, got %',
      _v30_total;
  END IF;
END $$;

-- Every registered adaptive item must be reachable: each of the five paths
-- carries exactly the four items one session is served. A path with three
-- would strand a candidate mid-assessment with no honest way to finish.
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(format('%s=%s', adaptive_path, n), ', ' ORDER BY adaptive_path)
    INTO _bad
  FROM (
    SELECT di.adaptive_path, count(*) AS n
    FROM public.cd_definition_items di
    JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.1.0'
      AND di.item_kind = 'adaptive'
    GROUP BY di.adaptive_path
    HAVING count(*) <> 4
  ) bad;

  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'CD_V31_ADAPTIVE_PATH_NOT_FOUR: %', _bad;
  END IF;
END $$;

COMMENT ON TABLE public.cd_definition_items IS
  'Versioned item registry for Security Career Discovery. The authority on '
  'which items exist in a definition version and what metadata they carry. '
  'cd_evidence DERIVES item_version, item_kind, evidence_class, is_scored '
  'and adaptive_path from this table -- caller-supplied metadata is never '
  'trusted, only rejected when it conflicts. Both v3.0 and v3.1 hold the '
  'same 42 items: 2 context + 20 scored core + 20 adaptive. The context and '
  'adaptive rows are contextual_self_report and therefore never scored.';
