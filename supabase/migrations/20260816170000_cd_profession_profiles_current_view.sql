-- Security Career Discovery v3.1 -- fix: cd_profession_profiles carries two
-- coexisting calibration_version batches per profession
-- ('layer4-first-wave-2026-08-14' and 'layer4-recalibrated-2026-08-16', the
-- latter a confirmed complete superset -- 238 rows = 14 professions x 17
-- dimensions), and the two application-layer catalog readers
-- (fetchFullCatalog in v31-owner-preview.functions.ts,
-- fetchApprovedProfessionCatalog in v31-public.functions.ts) both select
-- from the raw table with no calibration_version filter, pushing BOTH
-- batches' bands into ProfessionCatalogEntry.bands for every profession.
--
-- Found during the Release Completion mandate's real-data verification
-- (owner's own saved Säkerhetschef report): a real, deliberate design
-- decision in 20260816150000_cd_v31_content_v2_compliance_dimension.sql
-- kept the prior calibration_version "queryable and comparable side-by-side"
-- as an audit trail, on the stated assumption that "no downstream code
-- branches on calibration_version" -- true, but incomplete: neither reader
-- DEDUPES by it either, so both batches' bands are silently combined into
-- one profession's scoring input. Isolated empirically as a secondary,
-- independent contributor to profession-matching noise (the primary
-- overmatching defect, fixed in professions.ts by the same mandate, persists
-- identically with only the latest calibration_version present -- this
-- migration is data hygiene, not the scoring fix).
--
-- Fix: a security_invoker view exposing only the most recently authored
-- calibration_version's rows per (profession_id, dimension_id), keyed by
-- the row's own created_at rather than a hardcoded version string, so a
-- future recalibration needs no further code or migration change here.
-- Both readers are updated (separately, in the same mandate) to select from
-- this view instead of the raw table. The raw table and its full audit
-- trail (both calibration_version batches) are untouched -- purely additive.

CREATE VIEW public.cd_profession_profiles_current
WITH (security_invoker = true) AS
SELECT DISTINCT ON (profession_id, dimension_id)
  profession_id,
  calibration_version,
  dimension_id,
  band_low,
  band_high,
  weight,
  centrality,
  evidence_basis,
  confidence,
  source_reference,
  created_at
FROM public.cd_profession_profiles
ORDER BY profession_id, dimension_id, created_at DESC;

COMMENT ON VIEW public.cd_profession_profiles_current IS
  'The single, most-recently-authored calibration_version row per '
  '(profession_id, dimension_id) -- cd_profession_profiles keeps every '
  'historical calibration batch for audit purposes, but a profession''s '
  'ACTIVE band data must never mix two batches. security_invoker: RLS on '
  'the base table (cd_profession_profiles_read, SELECT true for '
  'authenticated) still governs, this view widens nothing.';

GRANT SELECT ON public.cd_profession_profiles_current TO authenticated;
