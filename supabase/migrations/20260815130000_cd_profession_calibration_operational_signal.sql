-- Master Completion Mandate item 1: profession calibration quality.
--
-- SP003 Skyddsvakt and SP004 Personskyddsvakt had no CID01 (Operational
-- Orientation) signal in their central dimension set at all, despite both
-- being fundamentally hands-on, field-presence roles. That gap let a
-- purely desk/analytical profile (no real operational interest) clear
-- "strong" central fit against them on risk-awareness + structure +
-- decisiveness + composure alone -- see
-- docs/career-discovery/v31-layer4-implementation-state.md for the full
-- diagnosis and the golden-persona evidence.
--
-- SP003: add CID01 as central (0.55-0.9, weight 0.7); demote CID11
-- (Structure & Documentation) from central to supporting -- it is central
-- in 7 of 14 first-wave professions, too generic to discriminate this one
-- specifically.
-- SP004: add CID01 as central (0.6-0.9, weight 0.6) -- a pure addition,
-- its other four central dims were already close-protection-specific.
--
-- UPDATE, not new rows: review_state stays 'ai_researched',
-- approved_for_ranking stays false. Copy/rationale text is untouched.

update public.cd_profession_profiles
set band_low = 0.55, band_high = 0.9, weight = 0.7, centrality = 'central'
where profession_id = 'SP003' and dimension_id = 'CID01';

update public.cd_profession_profiles
set centrality = 'supporting', weight = 0.25, band_low = 0.5, band_high = 0.9
where profession_id = 'SP003' and dimension_id = 'CID11';

update public.cd_profession_profiles
set band_low = 0.6, band_high = 0.9, weight = 0.6, centrality = 'central'
where profession_id = 'SP004' and dimension_id = 'CID01';
