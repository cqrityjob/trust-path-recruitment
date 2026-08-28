-- Security Career Discovery v3.1 — register the personal layer.
-- ADDITIVE ONLY: inserts 22 registry rows and nothing else.
-- Source file: supabase/migrations/20260801090000_career_discovery_v31_personal_layer.sql

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, adaptive_path, section_id, display_order)
SELECT
  dv.id, v.item_id, 1, v.item_kind, 'contextual_self_report', false,
  v.adaptive_path, v.section_id, v.display_order
FROM public.cd_definition_versions dv
CROSS JOIN (VALUES
  ('CTX_CURRENT_STATUS','context', NULL, NULL,              1),
  ('CTX_DISCOVERY_GOAL','context', NULL, NULL,              2),
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

  SELECT count(*) INTO _v30_total
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
  WHERE dv.definition_version = '2026-scd-v3.0.0';

  IF _v30_total <> 42 THEN
    RAISE EXCEPTION 'CD_V30_REGISTRY_DISTURBED: v3.0 should still hold 42 items, got %',
      _v30_total;
  END IF;
END $$;

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