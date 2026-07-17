
BEGIN;

-- 1. Governance columns.
ALTER TABLE public.cig_profession_families
  ADD COLUMN IF NOT EXISTS canonical_id           text,
  ADD COLUMN IF NOT EXISTS resolves_to_canonical  text,
  ADD COLUMN IF NOT EXISTS archived_at            timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS cig_profession_families_canonical_id_key
  ON public.cig_profession_families (canonical_id)
  WHERE canonical_id IS NOT NULL;

-- 2. Widen the whitelist FIRST (jobs trigger uses it).
CREATE OR REPLACE FUNCTION public.assert_cig_family_id(p_family_id text)
 RETURNS boolean
 LANGUAGE sql IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT p_family_id IN (
    'protective_operations','public_safety_justice','corrections_secure_transport',
    'defence_national_security','corporate_security','critical_infrastructure_security',
    'risk_management','crisis_management','business_continuity_resilience',
    'cyber_information_security','financial_crime_compliance','security_technology',
    'security_leadership_governance','investigations_intelligence',
    'exploring','guarding','police_public','defence_protective','corporate',
    'physical_technical','risk_crisis','investigations_intel','financial_crime',
    'critical_infra','cyber_infosec','consulting_specialist'
  );
$$;

-- 3. Redirect pointer on 13 legacy rows.
UPDATE public.cig_profession_families SET resolves_to_canonical = CASE slug
  WHEN 'operational-security'              THEN 'protective_operations'
  WHEN 'public-order'                      THEN 'protective_operations'
  WHEN 'private-protection-close-security' THEN 'protective_operations'
  WHEN 'physical-protective-security'      THEN 'protective_operations'
  WHEN 'law-enforcement'                   THEN 'public_safety_justice'
  WHEN 'customs-border'                    THEN 'public_safety_justice'
  WHEN 'emergency-rescue'                  THEN 'public_safety_justice'
  WHEN 'defence'                           THEN 'defence_national_security'
  WHEN 'corporate-security-leadership'     THEN 'security_leadership_governance'
  WHEN 'risk-crisis-management'            THEN 'risk_management'
  WHEN 'cyber-information-security'        THEN 'cyber_information_security'
  WHEN 'security-technology'               THEN 'security_technology'
  WHEN 'investigation-intelligence'        THEN 'investigations_intelligence'
END
WHERE resolves_to_canonical IS NULL
  AND slug IN (
    'operational-security','public-order','private-protection-close-security',
    'physical-protective-security','law-enforcement','customs-border',
    'emergency-rescue','defence','corporate-security-leadership',
    'risk-crisis-management','cyber-information-security','security-technology',
    'investigation-intelligence'
  );

-- 4. Insert 14 canonical rows.
INSERT INTO public.cig_profession_families
  (slug, title_sv, title_en, description_sv, description_en,
   content_status, graph_version, canonical_id)
VALUES
  ('protective-operations','Bevakning och operativt skydd','Protective Operations',
   'Operativa bevaknings-, ordnings- och personskyddsroller.',
   'Operational guarding, order and close-protection roles.',
   'published','cig-2026.07-09C.1','protective_operations'),
  ('public-safety-justice','Samhällsskydd och rättsväsende','Public Safety & Justice',
   'Myndighetsutövning inom polis, ordning, gränskontroll, rättsvård samt räddningstjänst.',
   'Government authority roles across policing, public order, border control, justice and emergency response.',
   'published','cig-2026.07-09C.1','public_safety_justice'),
  ('corrections-secure-transport','Kriminalvård och säker transport','Corrections & Secure Transport',
   'Kriminalvård, transportsäkerhet och värdetransport.',
   'Correctional services, transport security and cash-in-transit.',
   'published','cig-2026.07-09C.1','corrections_secure_transport'),
  ('defence-national-security','Försvar och nationell säkerhet','Defence & National Security',
   'Militär säkerhet och roller kopplade till försvar och nationell säkerhet.',
   'Military security roles connected to defence and national security.',
   'published','cig-2026.07-09C.1','defence_national_security'),
  ('corporate-security','Företagssäkerhet','Corporate Security',
   'Interna säkerhetsfunktioner inom företag och organisationer.',
   'In-house security functions within companies and organisations.',
   'published','cig-2026.07-09C.1','corporate_security'),
  ('critical-infrastructure-security','Kritisk infrastruktur och datacenter','Critical Infrastructure Security',
   'Skydd av samhällsviktig verksamhet, hamnar, flygplatser och datacenter.',
   'Protection of essential services, ports, airports and data centres.',
   'published','cig-2026.07-09C.1','critical_infrastructure_security'),
  ('risk-management','Riskhantering','Risk Management',
   'Identifiering, analys och hantering av operativa och organisatoriska risker.',
   'Identification, analysis and management of operational and organisational risk.',
   'published','cig-2026.07-09C.1','risk_management'),
  ('crisis-management','Krishantering och räddning','Crisis Management & Emergency Response',
   'Krisberedskap, incidentledning och räddningstjänst.',
   'Crisis preparedness, incident command and emergency response.',
   'published','cig-2026.07-09C.1','crisis_management'),
  ('business-continuity-resilience','Kontinuitet och motståndskraft','Business Continuity & Resilience',
   'Kontinuitetsplanering och organisatorisk motståndskraft.',
   'Continuity planning and organisational resilience.',
   'published','cig-2026.07-09C.1','business_continuity_resilience'),
  ('cyber-information-security-canonical','Cyber- och informationssäkerhet','Cyber & Information Security',
   'Digital säkerhet, incidenthantering och informationsskydd.',
   'Digital security, incident response and information protection.',
   'published','cig-2026.07-09C.1','cyber_information_security'),
  ('financial-crime-compliance','Finansiell brottslighet och compliance','Financial Crime & Compliance',
   'AML, bedrägeribekämpning och regelefterlevnad.',
   'Anti-money-laundering, fraud prevention and compliance.',
   'published','cig-2026.07-09C.1','financial_crime_compliance'),
  ('security-technology-canonical','Säkerhetsteknik','Security Technology',
   'Installation, drift och integration av tekniska säkerhetssystem.',
   'Installation, operation and integration of technical security systems.',
   'published','cig-2026.07-09C.1','security_technology'),
  ('security-leadership-governance','Säkerhetsledning och styrning','Security Leadership & Governance',
   'Strategisk säkerhet, ledarskap, rådgivning och styrning.',
   'Strategic security leadership, advisory and governance.',
   'published','cig-2026.07-09C.1','security_leadership_governance'),
  ('investigations-intelligence','Utredning och underrättelse','Investigations & Intelligence',
   'Utredning, underrättelse och analys inom offentlig och privat sektor.',
   'Investigations, intelligence and analysis across public and private sectors.',
   'published','cig-2026.07-09C.1','investigations_intelligence')
ON CONFLICT (slug) DO NOTHING;

-- 5. Per-profession primary family reassignment.
WITH mapping(slug, canonical_id) AS (VALUES
  ('vaktare','protective_operations'),
  ('butikskontrollant','protective_operations'),
  ('flygplatssakerhet','critical_infrastructure_security'),
  ('hamnsakerhetssamordnare','critical_infrastructure_security'),
  ('hundforare','protective_operations'),
  ('larmoperator','protective_operations'),
  ('maritim-sakerhet','critical_infrastructure_security'),
  ('sakerhetsreceptionist','protective_operations'),
  ('vardetransportor','corrections_secure_transport'),
  ('evenemangsvakt','protective_operations'),
  ('ordningsvakt','protective_operations'),
  ('ordningsvaktsledare','protective_operations'),
  ('parkeringsvakt','protective_operations'),
  ('trygghetsvard','protective_operations'),
  ('livvakt','protective_operations'),
  ('personskyddsvakt','protective_operations'),
  ('skyddsvakt','protective_operations'),
  ('polis','public_safety_justice'),
  ('tull-granskontrollant','public_safety_justice'),
  ('tulltjansteman','public_safety_justice'),
  ('ambulanssjukvardare','public_safety_justice'),
  ('brandman','public_safety_justice'),
  ('raddningsledare','public_safety_justice'),
  ('cybersoldat','defence_national_security'),
  ('fm-civil-sakerhetsspecialist','defence_national_security'),
  ('militarpolis','defence_national_security'),
  ('officer','defence_national_security'),
  ('reservofficer','defence_national_security'),
  ('sakerhetssoldat','defence_national_security'),
  ('sjoman','defence_national_security'),
  ('soldat','defence_national_security'),
  ('specialistofficer','defence_national_security'),
  ('underrattelsesoldat','defence_national_security'),
  ('aml-specialist','financial_crime_compliance'),
  ('auditor-sakerhet','security_leadership_governance'),
  ('compliance-officer','financial_crime_compliance'),
  ('sakerhetschef','security_leadership_governance'),
  ('sakerhetssamordnare','corporate_security'),
  ('utbildare-sakerhet','security_leadership_governance'),
  ('arbetsmiljosamordnare','risk_management'),
  ('bcm-specialist','business_continuity_resilience'),
  ('krisberedskapssamordnare','crisis_management'),
  ('krisstod','crisis_management'),
  ('risk-manager','risk_management'),
  ('cybersakerhetsanalytiker','cyber_information_security'),
  ('dataskyddsombud','cyber_information_security'),
  ('iam-specialist','cyber_information_security'),
  ('incident-responder','cyber_information_security'),
  ('informationssakerhetsspecialist','cyber_information_security'),
  ('penetrationstestare','cyber_information_security'),
  ('soc-analytiker','cyber_information_security'),
  ('accesscontrol-tekniker','security_technology'),
  ('cctv-tekniker','security_technology'),
  ('fastighetsskotare-sakerhet','security_technology'),
  ('installator-larm','security_technology'),
  ('sakerhetstekniker','security_technology'),
  ('civil-utredare','investigations_intelligence'),
  ('forensic-analyst','investigations_intelligence'),
  ('forensiker','investigations_intelligence'),
  ('forsakringsutredare','financial_crime_compliance'),
  ('fraud-analyst','financial_crime_compliance'),
  ('osint-analytiker','investigations_intelligence'),
  ('polis-intel-analytiker','investigations_intelligence'),
  ('polisutredare','investigations_intelligence'),
  ('privatdetektiv','investigations_intelligence'),
  ('sakerhetsutredare','investigations_intelligence'),
  ('threat-intel-analytiker','investigations_intelligence')
)
UPDATE public.cig_professions p
   SET primary_family_id = fam.id
  FROM mapping m
  JOIN public.cig_profession_families fam ON fam.canonical_id = m.canonical_id
 WHERE p.slug = m.slug;

DELETE FROM public.cig_profession_family_rel;
INSERT INTO public.cig_profession_family_rel
  (profession_id, family_id, importance, content_status, graph_version)
SELECT p.id, p.primary_family_id, 1, 'published', 'cig-2026.07-09C.1'
  FROM public.cig_professions p
 WHERE p.primary_family_id IS NOT NULL;

-- 6. Jobs — remap 8 demo rows.
UPDATE public.jobs SET family_id = CASE profession_slug
  WHEN 'sakerhetschef'      THEN 'security_leadership_governance'
  WHEN 'soc-analytiker'     THEN 'cyber_information_security'
  WHEN 'skyddsvakt'         THEN 'protective_operations'
  WHEN 'livvakt'            THEN 'protective_operations'
  WHEN 'vaktare'            THEN 'protective_operations'
  WHEN 'sakerhetstekniker'  THEN 'security_technology'
  WHEN 'polis'              THEN 'public_safety_justice'
  WHEN 'ordningsvakt'       THEN 'public_safety_justice'
  ELSE family_id
END
WHERE family_id IS NOT NULL;

-- 7. Invariants.
DO $$
DECLARE
  v_canonical_count      int;
  v_prof_missing_primary int;
  v_prof_wrong_family    int;
  v_rel_orphans          int;
  v_rel_duplicates       int;
  v_jobs_bad             int;
  v_prof_count           int;
  v_rel_count            int;
BEGIN
  SELECT count(*) INTO v_canonical_count
    FROM public.cig_profession_families
   WHERE canonical_id IS NOT NULL;
  IF v_canonical_count <> 14 THEN
    RAISE EXCEPTION 'Expected exactly 14 canonical family rows, got %', v_canonical_count;
  END IF;

  SELECT count(*) INTO v_prof_missing_primary
    FROM public.cig_professions p WHERE p.primary_family_id IS NULL;
  IF v_prof_missing_primary <> 0 THEN
    RAISE EXCEPTION '% professions have no primary_family_id', v_prof_missing_primary;
  END IF;

  SELECT count(*) INTO v_prof_wrong_family
    FROM public.cig_professions p
    JOIN public.cig_profession_families f ON f.id = p.primary_family_id
   WHERE f.canonical_id IS NULL;
  IF v_prof_wrong_family <> 0 THEN
    RAISE EXCEPTION '% professions still point at a non-canonical family', v_prof_wrong_family;
  END IF;

  SELECT count(*) INTO v_rel_orphans
    FROM public.cig_profession_family_rel r
    LEFT JOIN public.cig_professions p ON p.id = r.profession_id
    LEFT JOIN public.cig_profession_families f ON f.id = r.family_id
   WHERE p.id IS NULL OR f.id IS NULL;
  IF v_rel_orphans <> 0 THEN
    RAISE EXCEPTION '% orphaned profession_family_rel rows', v_rel_orphans;
  END IF;

  SELECT count(*) INTO v_rel_duplicates FROM (
    SELECT profession_id FROM public.cig_profession_family_rel
      GROUP BY profession_id HAVING count(*) > 1
  ) d;
  IF v_rel_duplicates <> 0 THEN
    RAISE EXCEPTION '% professions have duplicate family_rel rows', v_rel_duplicates;
  END IF;

  SELECT count(*) INTO v_prof_count FROM public.cig_professions;
  SELECT count(*) INTO v_rel_count  FROM public.cig_profession_family_rel;
  IF v_prof_count <> v_rel_count THEN
    RAISE EXCEPTION 'profession count % differs from family_rel count %', v_prof_count, v_rel_count;
  END IF;

  SELECT count(*) INTO v_jobs_bad
    FROM public.jobs
   WHERE family_id IS NOT NULL
     AND family_id NOT IN (
       'protective_operations','public_safety_justice','corrections_secure_transport',
       'defence_national_security','corporate_security','critical_infrastructure_security',
       'risk_management','crisis_management','business_continuity_resilience',
       'cyber_information_security','financial_crime_compliance','security_technology',
       'security_leadership_governance','investigations_intelligence'
     );
  IF v_jobs_bad <> 0 THEN
    RAISE EXCEPTION '% jobs still reference a non-canonical family_id', v_jobs_bad;
  END IF;
END $$;

-- 8. Soft-archive legacy rows.
UPDATE public.cig_profession_families
   SET archived_at = now()
 WHERE slug IN (
   'operational-security','public-order','private-protection-close-security',
   'physical-protective-security','law-enforcement','customs-border',
   'emergency-rescue','defence','corporate-security-leadership',
   'risk-crisis-management','cyber-information-security','security-technology',
   'investigation-intelligence'
 );

COMMIT;
