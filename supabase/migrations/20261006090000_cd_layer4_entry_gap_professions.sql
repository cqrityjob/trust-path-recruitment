-- Career Discovery Layer 4 -- four ENTRY-LEVEL professions drafted to close
-- catalogue gaps found by the Profession Recommendation Validation audit.
--
-- ── NOTHING HERE REACHES A CANDIDATE ─────────────────────────────────────
--
-- Every row is approved_for_ranking = false and review_state =
-- 'ai_researched'. cd_guard_profession_ranking_approval enforces that an
-- unapproved profession can never enter a personalised ranking, and the
-- application-layer catalogue reader (fetchApprovedProfessionCatalog in
-- v31-public.functions.ts) filters on the same flag. The TypeScript mirror
-- used by the engine and its guards, scripts/fixtures/first-wave-profession-
-- catalog.ts, is deliberately NOT updated: these professions do not exist as
-- far as scoring is concerned until an owner approves them.
--
-- ── WHY THESE FOUR, AND WHY NO OTHERS ────────────────────────────────────
--
-- Every profession here is a REAL, already-catalogued Swedish security role
-- taken from cig_professions (see the canonical keys in source_reference) --
-- not a title invented to fill a scoring hole. Three are 'published' in CIG
-- and one (Larmoperatör) is quality level A. CIG already records real
-- transition edges into three of them (vaktare -> larmoperator,
-- vaktare -> butikskontrollant, installator-larm <-> sakerhetstekniker).
--
-- The audit found the approved catalogue had no ENTRY-level profession in
-- several directions, so a beginner whose answers pointed that way received
-- only 'possible next step' and 'longer-term' cards and nothing they could
-- actually do now:
--
--   SP015 Butikskontrollant   -- the investigative gap. Retail loss
--     prevention is genuine entry-level investigative work: observing,
--     verifying, documenting and establishing what happened, with no formal
--     certification barrier. Before this, the nearest investigative
--     professions were Säkerhetsutredare and AML-specialist, both
--     'developing', so the Beginner Investigative persona's entire
--     recommendation was roles it could not take yet.
--     Requirements: no statutory authorisation; employer training. Not
--     regulated (detention powers rest on the same general rules that apply
--     to any citizen, not on a guarding authorisation).
--
--   SP016 Larmoperatör        -- the operational-analytical entry gap.
--     Alarm-centre work is triage: assess what an alarm means, prioritise,
--     dispatch, log. Analytical and situation-near at once, and a common
--     genuine first security job.
--     Requirements: employed within an authorised security company
--     (already recorded in CIG); employer training; no individual statutory
--     licence.
--
--   SP017 Säkerhetsreceptionist -- the service/coordination entry gap.
--     Reception combined with access control and first-line response. The
--     service-oriented beginner previously had no entry role expressing
--     that direction at all.
--     Requirements: no statutory authorisation; employer training.
--
--   SP018 Larminstallatör     -- technical entry BREADTH. Säkerhetstekniker
--     (SP014) already covers technical entry and works correctly; this adds
--     the specific alarm/security-systems installation role alongside it.
--     Requirements: electrical-safety competence per employer; industry
--     certification (e.g. SBSC) is employer-driven, not individually
--     statutory.
--
-- ── WHAT IS DELIBERATELY *NOT* ADDED ─────────────────────────────────────
--
-- An entry-level RISK/CRISIS profession. The audit found that gap too, and
-- it is left open on purpose: risk management and crisis preparedness are
-- genuinely not entry-level occupations in the Swedish market, and no real
-- profession in cig_professions fills that slot. Inventing one would be
-- exactly the artificial title this catalogue must not contain. The correct
-- product answer for a beginner with risk/crisis affinity is an honest
-- 'possible next step' / 'longer-term direction' label, which the report now
-- renders on the recommendation cards themselves.
--
-- ── OPEN QUESTIONS FOR OWNER/SME REVIEW ──────────────────────────────────
--
--  1. SP018 vs SP014. CIG itself records these as 'lateral' -- adjacent
--     rather than distinct. Their central sets differ only in the CID04
--     floor (0.60 vs 0.65) and in supporting emphasis. The owner may
--     reasonably decide SP018 is redundant.
--  2. SP015's career area. CIG files butikskontrollant under the
--     operational-security FAMILY (who employs it); this row assigns
--     SCA06 Investigations (what the work IS), because Career Discovery
--     areas describe direction, not employer. The two taxonomies genuinely
--     disagree here and the owner should confirm which reading wins.
--  3. All bands are evidence_basis 'derived', confidence 'low' -- authored
--     from role descriptions, not from official occupational data. They
--     need practitioner review before approved_for_ranking can be set.
--
-- Additive and reversible; no existing row, column, constraint, policy or
-- grant is touched.
-- Rollback: supabase/rollback/20261006090000_cd_layer4_entry_gap_professions_rollback.sql

INSERT INTO public.cd_professions
  (profession_id, career_area_id, title_sv, title_en, career_stage, entry_role, regulated,
   transition_difficulty, review_state, derived_from_area, approved_for_ranking,
   cig_profession_slug, inclusion_rationale_sv, inclusion_rationale_en,
   limitation_note_sv, limitation_note_en)
VALUES
  ('SP015', 'SCA06', 'Butikskontrollant', 'Loss Prevention Officer', 'entry', true, false, 1,
   'ai_researched', false, false, 'butikskontrollant',
   'Ditt svarsmönster visar ett tydligt drag mot att observera, granska och fastställa vad som faktiskt hänt, kombinerat med praktiskt arbete nära händelsen -- kärnan i butikskontrollantens roll.',
   'Your answers show a clear pull toward observing, examining and establishing what actually happened, combined with practical work close to the event -- the core of a loss-prevention role.',
   NULL, NULL),
  ('SP016', 'SCA01', 'Larmoperatör', 'Alarm Centre Operator', 'entry', true, false, 2,
   'ai_researched', false, false, 'larmoperator',
   'Du kombinerar analytisk bedömning med snabbt, situationsnära agerande -- precis vad larmcentralsarbete kräver när inkommande larm ska värderas, prioriteras och åtgärdas.',
   'You combine analytical judgement with fast, situation-near action -- exactly what alarm-centre work requires when incoming alarms must be assessed, prioritised and acted on.',
   'Arbetet utförs normalt inom auktoriserat bevakningsföretag; anställningen sker efter företagets egen utbildning.',
   'The work is normally performed within an authorised security company; employment follows that company''s own training.'),
  ('SP017', 'SCA01', 'Säkerhetsreceptionist', 'Security Receptionist', 'entry', true, false, 1,
   'ai_researched', false, false, 'sakerhetsreceptionist',
   'Din serviceorientering tillsammans med praktiskt, situationsnära arbete matchar en roll där bemötande, passagekontroll och första hantering av händelser hör ihop.',
   'Your service orientation together with practical, situation-near work matches a role where reception, access control and first-line incident handling belong together.',
   NULL, NULL),
  ('SP018', 'SCA03', 'Larminstallatör', 'Alarm Installer', 'entry', true, false, 2,
   'ai_researched', false, false, 'installator-larm',
   'Ditt tekniska intresse i kombination med noggrannhet och praktiskt arbete matchar installation och driftsättning av inbrotts- och brandlarm.',
   'Your technical interest combined with accuracy and hands-on work matches installing and commissioning intrusion and fire alarm systems.',
   NULL, NULL)
ON CONFLICT (profession_id) DO NOTHING;

INSERT INTO public.cd_profession_profiles
  (profession_id, calibration_version, dimension_id, band_low, band_high, weight, centrality,
   evidence_basis, confidence, source_reference)
VALUES
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID01', 0.500, 0.850, 0.600, 'central', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID02', 0.200, 0.500, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID03', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID04', 0.350, 0.650, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID05', 0.150, 0.450, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID06', 0.550, 0.850, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID07', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID08', 0.350, 0.650, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID09', 0.550, 0.850, 0.300, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID10', 0.550, 0.900, 0.800, 'central', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID11', 0.550, 0.850, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID12', 0.550, 0.850, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID13', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID14', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID15', 0.000, 0.350, 0.000, 'neutral', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID16', 0.550, 0.850, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP015', 'layer4-entry-gap-2026-10-05', 'CID17', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.butiksvakt'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID01', 0.500, 0.850, 0.600, 'central', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID02', 0.200, 0.500, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID03', 0.550, 0.900, 0.700, 'central', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID04', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID05', 0.200, 0.500, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID06', 0.550, 0.850, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID07', 0.550, 0.850, 0.300, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID08', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID09', 0.250, 0.550, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID10', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID11', 0.600, 0.900, 0.300, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID12', 0.550, 0.850, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID13', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID14', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID15', 0.000, 0.350, 0.000, 'neutral', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID16', 0.600, 0.900, 0.300, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP016', 'layer4-entry-gap-2026-10-05', 'CID17', 0.350, 0.650, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.larmoperator'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID01', 0.450, 0.800, 0.500, 'central', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID02', 0.250, 0.550, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID03', 0.300, 0.600, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID04', 0.350, 0.650, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID05', 0.150, 0.450, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID06', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID07', 0.600, 0.900, 0.300, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID08', 0.600, 0.950, 0.800, 'central', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID09', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID10', 0.250, 0.550, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID11', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID12', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID13', 0.550, 0.850, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID14', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID15', 0.000, 0.350, 0.000, 'neutral', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID16', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP017', 'layer4-entry-gap-2026-10-05', 'CID17', 0.350, 0.650, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.receptionist-med-sakerhet'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID01', 0.450, 0.800, 0.450, 'central', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID02', 0.200, 0.500, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID03', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID04', 0.600, 0.950, 0.850, 'central', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID05', 0.200, 0.500, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID06', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID07', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID08', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID09', 0.100, 0.400, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID10', 0.300, 0.600, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID11', 0.550, 0.850, 0.300, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID12', 0.500, 0.800, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID13', 0.450, 0.750, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID14', 0.600, 0.900, 0.300, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID15', 0.000, 0.350, 0.000, 'neutral', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID16', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm'),
  ('SP018', 'layer4-entry-gap-2026-10-05', 'CID17', 0.400, 0.700, 0.250, 'supporting', 'derived', 'low', 'cig:se.security.installatorlarm')
ON CONFLICT (profession_id, calibration_version, dimension_id) DO NOTHING;

-- =========================================================================
-- Self-verification. The two things that must be true of this migration:
-- a complete 17-dimension profile per profession (so the rows are actually
-- reviewable), and NOTHING approved for ranking.
-- =========================================================================

DO $$
DECLARE
  _p text;
  _n int;
BEGIN
  FOREACH _p IN ARRAY ARRAY['SP015','SP016','SP017','SP018'] LOOP
    SELECT count(*) INTO _n
    FROM public.cd_profession_profiles
    WHERE profession_id = _p AND calibration_version = 'layer4-entry-gap-2026-10-05';
    IF _n <> 17 THEN
      RAISE EXCEPTION 'CD_ENTRY_GAP_PROFILE: % has % calibration rows, expected 17', _p, _n;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.cd_professions
    WHERE profession_id IN ('SP015','SP016','SP017','SP018')
      AND (approved_for_ranking OR review_state <> 'ai_researched')
  ) THEN
    RAISE EXCEPTION
      'CD_ENTRY_GAP_APPROVED: a drafted profession is approved for ranking -- these must stay unapproved until owner review';
  END IF;

  -- Every "central" band must be a DOMAIN dimension (professions.ts's
  -- DOMAIN_ONLY_CENTRAL_RULE). A work-style dimension marked central is the
  -- taxonomy defect that produced the owner's original Guarding-#1 result.
  IF EXISTS (
    SELECT 1 FROM public.cd_profession_profiles
    WHERE calibration_version = 'layer4-entry-gap-2026-10-05'
      AND centrality = 'central'
      AND dimension_id NOT IN
        ('CID01','CID02','CID03','CID04','CID05','CID06','CID08','CID09','CID10','CID17')
  ) THEN
    RAISE EXCEPTION
      'CD_ENTRY_GAP_CENTRAL: a work-style dimension is marked central -- only domain dimensions may be';
  END IF;
END $$;
