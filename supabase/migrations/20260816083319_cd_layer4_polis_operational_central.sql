-- Autonomous Final Career Discovery Quality Pass: profession-DNA-profile audit.
--
-- Finding: Polis (SP005) was the one first-wave profession whose central
-- dimension set (CID08 Service, CID09 Conflict, CID12 Independent Decision,
-- CID16 Composure) contained nothing distinctly operational -- CID01
-- (Operational Orientation) was only "supporting" at weight 0.25. Empirical
-- evidence from the golden persona suite (docs/career-discovery/
-- v31-golden-persona-report.md, regenerated against this fixture before
-- this migration): Polis matched as "explore_now"/strong for Student,
-- New-to-security, Väktare, and Career changer, and as a career_pivot for
-- Experienced Säkerhetssamordnare -- i.e. it matched almost every
-- generalist/frontline-adjacent profile, regardless of whether that
-- candidate showed any genuine operational disposition. This is exactly the
-- named concern from the mandate: "Police should not become a generic
-- high-fit profession for broad profiles."
--
-- Fix: promote CID01 from supporting (weight 0.25) to central (weight 0.5,
-- band 0.55-0.95) for SP005 only. Police work substantively involves
-- patrol/response/operational action, not just service+conflict+decision+
-- composure in the abstract -- the previous calibration let a candidate
-- with zero operational lean still match on the remaining four generic
-- traits alone. No other profession's bands are touched. This is an
-- additive UPDATE against calibration_version 'layer4-first-wave-2026-08-14'
-- -- same version, corrected values -- not a new calibration version, since
-- no downstream code branches on calibration_version today and the row
-- being corrected has not yet been used for any live candidate scoring
-- (approved_for_ranking remains false throughout).

UPDATE public.cd_profession_profiles
SET
  centrality = 'central',
  band_low = 0.550,
  band_high = 0.950,
  weight = 0.500,
  evidence_basis = 'official',
  confidence = 'medium'
WHERE profession_id = 'SP005'
  AND calibration_version = 'layer4-first-wave-2026-08-14'
  AND dimension_id = 'CID01';
