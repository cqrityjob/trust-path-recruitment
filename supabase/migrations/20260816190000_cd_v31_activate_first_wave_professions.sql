-- Security Career Discovery v3.1 -- OWNER APPROVAL & PRODUCTION ACTIVATION.
--
-- Explicit owner instruction: "I explicitly approve activation of all 14
-- first-wave professions for public profession ranking." Following the
-- Release Gate (853/853 regression, real-data verification, owner
-- diagnostics review) and the Profession Scoring Framework v1 stabilisation.
--
-- This migration does exactly one thing: flips review_state and
-- approved_for_ranking for the 14 already-calibrated first-wave professions.
-- No band, weight, centrality, dimension, or rationale data is touched --
-- see 20260816150000/20260816170000/20260816180000 for the calibration and
-- evidence-consistency work this activation builds on, all already applied
-- and verified before this step.
--
-- cd_guard_profession_ranking_approval (20260730090000, tightened
-- 20260816161000) independently re-verifies at the database level that
-- every row here has review_state = 'approved_for_ranking',
-- derived_from_area = false, and all 17 dimensions calibrated before
-- allowing approved_for_ranking = true -- this UPDATE supplies the two
-- columns the guard reads, it does not bypass it.
--
-- The instant this commits, fetchApprovedProfessionCatalog
-- (v31-public.functions.ts) starts returning all 14 rows to every NEW
-- report a real candidate generates. Existing cd_report_snapshots rows are
-- untouched -- each one already freezes its own professions output at
-- generation time (see snapshot.ts), so no historical report changes
-- meaning as a result of this migration.

UPDATE public.cd_professions
SET review_state = 'approved_for_ranking',
    approved_for_ranking = true
WHERE profession_id IN (
  'SP001','SP002','SP003','SP004','SP005','SP006','SP007',
  'SP008','SP009','SP010','SP011','SP012','SP013','SP014'
);
