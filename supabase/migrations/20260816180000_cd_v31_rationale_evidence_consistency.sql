-- Security Career Discovery v3.1 -- PROFESSION SCORING FRAMEWORK v1
-- stabilisation: "why this appeared" evidence consistency (mandate section 9).
--
-- Found by checking all 14 professions' authored inclusion_rationale_sv/en
-- against their ACTUAL current central-dimension set (cd_profession_profiles,
-- calibration_version 'layer4-recalibrated-2026-08-16', the DOMAIN_ONLY_
-- CENTRAL_RULE-compliant one): 8 of 14 professions' authored rationale text
-- foregrounds a "style" dimension (Structure/CID11, Independent Decisions/
-- CID12, Collaboration/CID13, Composure/CID16, Communication/CID07,
-- Learning/CID14) that is NOT central for that profession under the current
-- calibration, and in several cases OMITS a dimension that IS central
-- (SP003/SP004/SP005 never mention CID01 Operational Orientation despite it
-- being central; SP009 never mentions CID05 Strategic Orientation; SP013
-- never mentions CID17 Regulatory & Compliance Orientation -- the exact
-- dimension CID17 was added to differentiate it from Sakerhetsutredare).
--
-- The authored text predates the DOMAIN_ONLY_CENTRAL_RULE recalibration and
-- was never updated afterward -- a genuinely stale explanation, not a
-- scoring defect. Per the mandate's own rule ("If the structured evidence
-- cannot support the explanation: change the explanation, not the
-- evidence"), this is a text-only fix: no band, weight, centrality or
-- scoring column is touched. cd_professions.inclusion_rationale_sv/en are
-- read live by fetchApprovedProfessionCatalog on every match, never frozen
-- into a stored ReportSnapshot except as the verbatim
-- ProfessionMatch.inclusionRationaleSv/En captured at generation time -- so
-- this changes future reports only; no historical snapshot is rewritten
-- (Definition of Done: historical reproducibility).
--
-- TS source of truth updated in the same commit:
-- scripts/fixtures/first-wave-profession-catalog.ts.

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Ditt svarsmönster visar ett tydligt drag mot praktiskt, situationsnära arbete kombinerat med stark riskmedvetenhet -- kärnan i en väktarroll.',
  inclusion_rationale_en = 'Your answers show a clear pull toward practical, situation-near work combined with strong risk awareness -- the core of a security-officer role.'
WHERE profession_id = 'SP001';

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Din operativa handlingskraft tillsammans med hög riskmedvetenhet passar väl med skyddsvaktens roll att skydda skyddsobjekt enligt skyddslagen.',
  inclusion_rationale_en = 'Your operational drive combined with high risk awareness fits well with a protective-security-guard''s role safeguarding protected sites under the Protective Security Act.'
WHERE profession_id = 'SP003';

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Din kombination av operativ handlingskraft, riskmedvetenhet och konflikthantering matchar personskyddets krav på ständig vaksamhet och snabba avgöranden.',
  inclusion_rationale_en = 'Your combination of operational drive, risk awareness and conflict handling matches close protection''s demand for constant vigilance and fast judgement.'
WHERE profession_id = 'SP004';

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Din kombination av operativ handlingskraft, serviceorientering och konflikthantering liknar den bredd som polisyrket kräver i det dagliga arbetet.',
  inclusion_rationale_en = 'Your combination of operational drive, service orientation and conflict handling resembles the breadth policing calls for day to day.'
WHERE profession_id = 'SP005';

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Du visar ett tydligt ledarskapsintresse -- ett drag som ofta förekommer hos den som samordnar säkerhetsarbete mellan flera team och funktioner.',
  inclusion_rationale_en = 'You show a clear leadership interest -- a trait that often shows up in people who coordinate security work across teams and functions.'
WHERE profession_id = 'SP006';

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Din tekniska, analytiska och strategiska profil passar en roll som kräver att ligga steget före ständigt föränderliga hot mot informationstillgångar.',
  inclusion_rationale_en = 'Your technical, analytical and strategic profile fits a role that requires staying ahead of constantly changing threats to information assets.'
WHERE profession_id = 'SP009';

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Ditt strategiska tänkande tillsammans med hög riskmedvetenhet matchar arbetet med att förbereda organisationer för kriser innan de inträffar.',
  inclusion_rationale_en = 'Your strategic thinking combined with strong risk awareness matches the work of preparing organisations for crises before they happen.'
WHERE profession_id = 'SP012';

UPDATE public.cd_professions SET
  inclusion_rationale_sv = 'Din analytiska och utredande läggning, tillsammans med en stark känsla för regelverk och regelefterlevnad, matchar arbetet med att granska transaktioner och identifiera misstänkta mönster.',
  inclusion_rationale_en = 'Your analytical and investigative bent, combined with a strong sense for regulatory and compliance requirements, matches the work of reviewing transactions and identifying suspicious patterns.'
WHERE profession_id = 'SP013';
