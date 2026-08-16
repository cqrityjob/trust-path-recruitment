-- Security Career Discovery v3.1 -- content v2: Regulatory & Compliance
-- Orientation (CID17) and the recalibrated first-wave profession catalogue.
--
-- Final Autonomous Matching Engine Completion Mandate. ADDITIVE ONLY:
--
--   1. Two new scored core items (CQ21, CQ22) registered against the
--      EXISTING '2026-scd-v3.1.0' definition_version_id -- same pattern
--      20260801090000_career_discovery_v31_personal_layer.sql already used
--      to add the personal layer's 22 rows without a new definition version.
--   2. cd_definition_versions.content_version / scoring_version updated in
--      place, from 'v3.1-draft-1' to 'v3.1-draft-3', on that SAME row (no
--      new definition_version row -- see the note below on why this is safe
--      here, unlike a normal content change).
--   3. A complete, freshly-generated set of cd_profession_profiles rows for
--      all 14 first-wave professions under a NEW calibration_version
--      ('layer4-recalibrated-2026-08-16'), generated programmatically from
--      scripts/fixtures/first-wave-profession-catalog.ts -- the existing
--      'layer4-first-wave-2026-08-14' rows are untouched.
--
-- ── WHY THE CONTENT/SCORING VERSION IS UPDATED IN PLACE, NOT VERSIONED
--    FORWARD AS A NEW DEFINITION VERSION ─────────────────────────────────
--
-- cd_definition_versions is keyed uniquely on (assessment_id,
-- definition_version), and definition_version stays '2026-scd-v3.1.0' here
-- (see version.ts: this is a same-generation content addition, not a new
-- product-level instrument).
--
-- lifecycle_status is 'active' (access is gated separately by
-- cd_is_internal_tester()/is_platform_admin(), not by lifecycle -- see
-- version.ts's LIFECYCLE_STATUS comment), and 13 real cd_report_snapshots
-- rows already exist under content_version/scoring_version
-- 'v3.1-draft-1' -- checked live against the hosted project before writing
-- this migration. Updating cd_definition_versions in place is still safe
-- for those, NOT because nothing was ever scored, but because
-- cd_report_snapshots freezes its OWN content_version/scoring_version/
-- pattern_definition_version columns per row at generation time (see
-- 20260730090000_career_discovery_v3_1_schema.sql) -- nothing re-derives a
-- stored snapshot's interpretation from the live parent
-- cd_definition_versions row, so those 13 rows stay exactly reproducible
-- against 'v3.1-draft-1' regardless of what this row says afterward. The
-- 13 in-progress (never completed) sessions from the same definition are
-- all 2+ weeks stale (2026-07-31, launch-day testing) with zero activity
-- since -- if one were ever resumed, cd_v31_validate_session_evidence would
-- correctly require CQ21/CQ22 like any other core item, exactly as
-- intended for an instrument that has genuinely grown by two questions.
-- The same reasoning already governs
-- 20260816083319_cd_layer4_polis_operational_central.sql's in-place
-- correction of calibration_version 'layer4-first-wave-2026-08-14'.
--
-- ── WHY THE PROFESSION RECALIBRATION *IS* A NEW calibration_version ──────
--
-- Unlike the content/scoring version above, this is not a small correction
-- to a handful of rows -- it is a systematic re-derivation of every
-- profession's central/supporting split (DOMAIN_ONLY_CENTRAL_RULE, see
-- src/lib/career-discovery/v31/professions.ts) plus a genuinely new
-- dimension (CID17) for one profession. A new calibration_version keeps the
-- prior 'layer4-first-wave-2026-08-14' rows queryable and comparable
-- side-by-side rather than silently overwritten, which is the more useful
-- audit trail for a change this size, even though (per the same reasoning
-- above) no live candidate data is actually at stake yet.
--
-- Reversible: DELETE the CQ21/CQ22 registry rows, UPDATE content_version/
-- scoring_version back to 'v3.1-draft-1', and DELETE calibration_version =
-- 'layer4-recalibrated-2026-08-16' from cd_profession_profiles. Nothing else
-- is touched.

-- =========================================================================
-- 1. Register CQ21 + CQ22
-- =========================================================================

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, section_id, display_order)
SELECT dv.id, v.item_id, 1, v.item_kind, 'orientation_self_report', true,
       v.section_id, v.display_order
FROM public.cd_definition_versions dv
CROSS JOIN (VALUES
  ('CQ21','scale','responsibility',21),
  ('CQ22','scale','responsibility',22)
) AS v(item_id, item_kind, section_id, display_order)
WHERE dv.assessment_id = 'security-career-discovery-v3'
  AND dv.definition_version = '2026-scd-v3.1.0'
ON CONFLICT (definition_version_id, item_id) DO NOTHING;

-- =========================================================================
-- 2. Content/scoring version bump (same definition_version_id, see header)
-- =========================================================================

UPDATE public.cd_definition_versions
SET content_version = 'v3.1-draft-3',
    scoring_version = 'v3.1-draft-3'
WHERE assessment_id = 'security-career-discovery-v3'
  AND definition_version = '2026-scd-v3.1.0';

-- =========================================================================
-- 3. Recalibrated first-wave profession profiles (238 rows: 14 x 17 dims)
-- =========================================================================
--
-- Generated from FIRST_WAVE_CATALOG. Do not hand-edit: regenerate from the
-- TypeScript source if this ever needs to change again.

INSERT INTO public.cd_profession_profiles
  (profession_id, calibration_version, dimension_id, band_low, band_high, weight, centrality, evidence_basis, confidence, source_reference)
VALUES
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID01', 0.650, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID02', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID03', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID04', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID05', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID06', 0.600, 0.900, 0.800, 'central', 'industry', 'medium', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID07', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID08', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID09', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID10', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID11', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID12', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID13', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID14', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID16', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP001', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID01', 0.600, 0.900, 0.700, 'central', 'industry', 'medium', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID02', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID03', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID04', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID05', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID06', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID07', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID08', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID09', 0.650, 0.950, 0.950, 'central', 'industry', 'medium', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID10', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID11', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID13', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID14', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID16', 0.650, 0.950, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP002', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID01', 0.550, 0.900, 0.700, 'central', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID02', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID03', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID04', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID05', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID06', 0.650, 0.950, 0.900, 'central', 'official', 'medium', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID07', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID08', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID09', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID10', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID11', 0.500, 0.900, 0.250, 'supporting', 'official', 'medium', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID13', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID14', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID16', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP003', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID01', 0.600, 0.900, 0.600, 'central', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID02', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID03', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID04', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID05', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID06', 0.600, 0.900, 0.700, 'central', 'industry', 'medium', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID07', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID08', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID09', 0.600, 0.900, 0.700, 'central', 'industry', 'medium', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID10', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID11', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID12', 0.650, 0.950, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID13', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID14', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID16', 0.700, 0.950, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP004', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID01', 0.550, 0.950, 0.500, 'central', 'official', 'medium', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID02', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID03', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID04', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID05', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID06', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID07', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID08', 0.550, 0.900, 0.600, 'central', 'official', 'medium', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID09', 0.600, 0.900, 0.800, 'central', 'official', 'medium', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID10', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID11', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 0.900, 0.250, 'supporting', 'official', 'medium', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID13', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID14', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID16', 0.600, 0.950, 0.250, 'supporting', 'official', 'medium', NULL),
  ('SP005', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID01', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID02', 0.550, 0.900, 0.700, 'central', 'industry', 'medium', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID03', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID04', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID05', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID06', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID07', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID08', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID09', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID10', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID11', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID13', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID14', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID16', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP006', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID01', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID02', 0.650, 0.950, 0.950, 'central', 'industry', 'medium', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID03', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID04', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID05', 0.600, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID06', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID07', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID08', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID09', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID10', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID11', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID13', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID14', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID16', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP007', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID01', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID02', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID03', 0.650, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID04', 0.650, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID05', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID06', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID07', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID08', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID09', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID10', 0.550, 0.900, 0.600, 'central', 'industry', 'medium', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID11', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID13', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID14', 0.800, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID16', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP008', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID01', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID02', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID03', 0.650, 0.950, 0.850, 'central', 'industry', 'medium', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID04', 0.650, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID05', 0.500, 0.850, 0.400, 'central', 'industry', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID06', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID07', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID08', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID09', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID10', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID11', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID13', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID14', 0.600, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID16', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP009', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID01', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID02', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID03', 0.600, 0.900, 0.600, 'central', 'industry', 'medium', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID04', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID05', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID06', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID07', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID08', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID09', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID10', 0.650, 0.950, 0.950, 'central', 'industry', 'medium', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID11', 0.650, 0.950, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID13', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID14', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID16', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP010', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID01', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID02', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID03', 0.650, 0.950, 0.850, 'central', 'industry', 'medium', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID04', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID05', 0.600, 0.950, 0.850, 'central', 'industry', 'medium', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID06', 0.650, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID07', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID08', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID09', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID10', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID11', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID13', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID14', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID16', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP011', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID01', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID02', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID03', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID04', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID05', 0.550, 0.900, 0.600, 'central', 'industry', 'medium', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID06', 0.600, 0.900, 0.700, 'central', 'industry', 'medium', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID07', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID08', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID09', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID10', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID11', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID13', 0.650, 0.950, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID14', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID16', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP012', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID01', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID02', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID03', 0.650, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID04', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID05', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID06', 0.800, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID07', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID08', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID09', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID10', 0.600, 0.950, 0.850, 'central', 'industry', 'medium', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID11', 0.650, 0.950, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID12', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID13', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID14', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID16', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP013', 'layer4-recalibrated-2026-08-16', 'CID17', 0.600, 0.950, 0.850, 'central', 'derived', 'medium', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID01', 0.500, 0.850, 0.400, 'central', 'industry', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID02', 0.200, 0.600, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID03', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID04', 0.650, 0.950, 0.900, 'central', 'industry', 'medium', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID05', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID06', 0.600, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID07', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID08', 0.400, 0.800, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID09', 0.100, 0.500, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID10', 0.300, 0.700, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID11', 0.550, 0.900, 0.250, 'supporting', 'industry', 'medium', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID12', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID13', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID14', 0.700, 1.000, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID15', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID16', 0.500, 0.900, 0.250, 'supporting', 'derived', 'low', NULL),
  ('SP014', 'layer4-recalibrated-2026-08-16', 'CID17', 0.200, 0.800, 0.000, 'neutral', 'assumption', 'low', NULL)
ON CONFLICT (profession_id, calibration_version, dimension_id) DO NOTHING;

-- =========================================================================
-- 4. Prove the result
-- =========================================================================

DO $$
DECLARE
  _scored_count int;
  _profile_rows int;
  _central_style_violations int;
BEGIN
  SELECT count(*) INTO _scored_count
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
  WHERE dv.definition_version = '2026-scd-v3.1.0'
    AND di.is_scored AND di.item_kind IN ('scale','single_choice');

  IF _scored_count <> 22 THEN
    RAISE EXCEPTION 'expected 22 scored core items after CQ21/CQ22, got %', _scored_count;
  END IF;

  SELECT count(*) INTO _profile_rows
  FROM public.cd_profession_profiles
  WHERE calibration_version = 'layer4-recalibrated-2026-08-16';

  IF _profile_rows <> 238 THEN
    RAISE EXCEPTION 'expected 238 recalibrated profession-profile rows (14 x 17), got %', _profile_rows;
  END IF;

  -- DOMAIN_ONLY_CENTRAL_RULE, mirrored in SQL (see professions.ts's
  -- validateDomainOnlyCentralRule -- this is the same rule, checked twice:
  -- once here at migration time, once in TypeScript at every CI run).
  SELECT count(*) INTO _central_style_violations
  FROM public.cd_profession_profiles
  WHERE calibration_version = 'layer4-recalibrated-2026-08-16'
    AND centrality = 'central'
    AND dimension_id IN ('CID07','CID11','CID12','CID13','CID14','CID15','CID16');

  IF _central_style_violations <> 0 THEN
    RAISE EXCEPTION 'DOMAIN_ONLY_CENTRAL_RULE violated: % central row(s) on a style dimension', _central_style_violations;
  END IF;
END $$;
