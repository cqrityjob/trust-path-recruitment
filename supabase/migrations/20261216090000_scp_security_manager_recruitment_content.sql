-- Säkerhetschef – Recruitment Assessment / Security Manager – Recruitment
-- Assessment, and the Säkerhetschef Role Interview Pack: the TRUST content
-- for the STRATEGIC level, authored as a governed DRAFT for review.
--
-- Filename note: the version is the next canonical slot after
-- 20261215090000_candidate_location_and_destinations.sql. Repository
-- migration versions run ahead of the wall clock; only the filename was
-- chosen this way.
--
-- ── WHY THIS EXISTS ──────────────────────────────────────────────────────
--
-- The employer's "Skicka test" offers two levels, operational and strategic
-- (owner decision 2026-09-26: neither level is hidden). Until this migration
-- the strategic level mapped to NO content at all: the product said, with the
-- content specification's own list (docs/product/
-- trust-beskt-content-gaps-2026-09-19.md §3.1), what was missing -- a
-- requirement profile, an interview guide, a candidate component, a report
-- section and a review -- and refused to offer the Väktare test under a new
-- title. This migration authors every one of those five things as DRAFT
-- content in the same governed model the operational level uses, so the
-- level can be reviewed, piloted and released through the existing ladder
-- rather than invented on the day somebody needs it.
--
-- ── WHAT IS AUTHORED, AND UNDER WHICH RULES ─────────────────────────────
--
--   1. Requirement profile: the profession security-manager-se, the role
--      security-manager-se (version 1, draft) and SIX observable behaviours,
--      one per competency area the specification proposes, each mapped to a
--      canonical SCC competency. A behaviour describes what a person visibly
--      does, with positive indicators and contraindications -- never a trait.
--   2. Candidate component: the assessment security-manager-recruitment,
--      one version, one form, five declared sections, 37 items -- 18
--      scenario items and 3 written reflections that are OBSERVED evidence,
--      and 16 self-descriptions that are SELF-REPORTED and are never
--      presented as observed (20260830090000 makes that separation
--      structural). Three rubrics for the written reflections, read by a
--      person, never by a model.
--   3. Interview guide: the role interview pack security-manager-se in the
--      Väktare format -- six competencies, eight fixed questions in a fixed
--      order, approved probes only, five evidence dimensions and 0-4 anchors
--      per question, verification boundaries and prohibited areas. Version
--      1, draft, pilot_hypothesis, and RESTRICTED: no employer sees it until
--      the platform publisher opens it.
--   4. Report section: the evidence report and the interview preparation
--      are competency-keyed and read this content like any other; eight
--      leadership-phrased self-report interview prompts are added for the
--      facets this assessment describes and no other content used.
--   5. Review: every item carries the five review gates OUTSTANDING; the
--      pack starts at the bottom of the draft -> expert -> legal ->
--      cognitive -> published ladder; the competency mapping is provisional.
--
-- ── GOVERNANCE HONESTY ──────────────────────────────────────────────────
--
-- Every item is content_status = 'draft', validation_status = 'design',
-- authored_by_ai = true, all five gates outstanding. This content was
-- written by an AI assistant against the product's own construct rules and
-- the owner's specification. It is NOT expert-validated, NOT approved and
-- NOT released, and nothing here claims otherwise. No psychometric claim is
-- made: no reliability, no norm group, no cut score, no prediction.
--
-- NOTHING IS ACTIVATED. Two switches release this content, and this
-- migration flips neither:
--
--   * scp_assessment_definitions.standard_for_recruitment stays FALSE, so
--     no organisation can assign the test (scp_grant_permits_assignment
--     answers NULL) until CQrityjob designates it after the content
--     approval -- the same act 20260905090000 performed for the Väktare test;
--   * scp_interview_pack_versions.pilot_availability stays 'restricted', so
--     no organisation can start an interview with the guide until the
--     platform publisher opens the pilot -- the same act 20260925090000
--     performed for vaktare-se.
--
-- Both are asserted at the bottom of this file. The activation is prepared,
-- separately, for the owner's decision: docs/release/
-- 2026-09-26-strategic-level-content-approval.md.
--
-- ── SCENARIO SOURCING ───────────────────────────────────────────────────
--
-- Ordinary Swedish security-management work: budget and control decisions,
-- reporting to management and boards, delegated site security, incidents
-- that cross physical and information security, suppliers, audits and
-- authorities. No item turns on remembering a statute; where a rule matters
-- it is stated in the scenario, and legal_basis_required stays false. The
-- security-manager profession is not a regulated role; where a scenario
-- touches a protective-security (säkerhetsskydd) obligation it says so in
-- the scenario text and the legal review gate is outstanding like the rest.

DO $$
BEGIN
  IF to_regclass('public.scp_competencies') IS NULL
     OR to_regclass('public.scp_interview_packs') IS NULL
     OR to_regclass('public.scp_recruitment_content_links') IS NULL
     OR to_regproc('public.scp_interview_pack_content_hash') IS NULL THEN
    RAISE EXCEPTION 'SCP_SM_PRECONDITION: the competency graph, the interview pack domain and the recruitment content links must exist first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_assessment_definitions WHERE slug = 'security-officer-recruitment') THEN
    RAISE EXCEPTION 'SCP_SM_PRECONDITION: the operational recruitment assessment is missing; the strategic level is authored beside it, never instead of it.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The requirement profile: profession, role, and six observable behaviours
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_professions (slug, name_sv, name_en, market, legally_regulated, regulator_note_sv, description_sv, description_en)
VALUES
  ('security-manager-se', 'Säkerhetschef', 'Security Manager – Sweden', 'SE', false,
   'Säkerhetschef är ingen reglerad yrkesroll. Uppgifter som rör säkerhetsskyddschef enligt säkerhetsskyddslagen, eller andra lagbundna funktioner, kräver juridisk granskning innan de används i innehåll.',
   'Ledande säkerhetsroll med ansvar för riskbedömning, styrning, incident- och krisledning, samverkan, regelefterlevnad och personal. Utvecklingsinriktad beskrivning av arbetet, inte en formell befattning.',
   'Leading security role responsible for risk assessment, governance, incident and crisis leadership, collaboration, compliance and people. A development-oriented description of the work, not a formal appointment.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_roles (slug, profession_id)
SELECT 'security-manager-se', p.id FROM public.scp_professions p WHERE p.slug = 'security-manager-se'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_role_versions
  (role_id, version_number, jurisdiction_id, content_status, name_sv, name_en, description_sv, description_en)
SELECT r.id, 1, j.id, 'draft',
  'Säkerhetschef', 'Security Manager',
  'Strategisk och ledande säkerhetsroll i svensk verksamhet: prioriterar risker och resurser, sätter styrning och mandat, leder incidenter och kriser, samverkar med verksamhet, myndigheter och leverantörer, följer upp regelefterlevnad och leder personal. Kravprofil för rekrytering -- beskriver arbetet, inte formell auktorisation.',
  'Strategic, leading security role in a Swedish organisation: prioritises risks and resources, sets governance and mandate, leads incidents and crises, works with the business, authorities and suppliers, follows up compliance and leads people. A recruitment requirement profile -- it describes the work, not formal authorisation.'
FROM public.scp_roles r, public.scp_jurisdictions j
WHERE r.slug = 'security-manager-se' AND j.code = 'SE'
ON CONFLICT (role_id, version_number) DO NOTHING;

-- The six competency areas the specification proposes, as observable
-- behaviours. Each maps to ONE canonical SCC competency (version 1). The
-- mapping is the author's reading and is one of the things the security_sme
-- gate reviews; the behaviour statements are what the items observe.
INSERT INTO public.scp_observable_behaviours (slug) VALUES
  ('risk_based_prioritisation'), ('governance_and_mandate'),
  ('incident_and_crisis_leadership'), ('cross_functional_collaboration'),
  ('compliance_and_follow_up'), ('people_leadership')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_behaviour_versions
  (behaviour_id, version_number, content_status, statement_sv, statement_en,
   positive_indicators_sv, contraindications_sv, is_safety_critical)
SELECT b.id, 1, 'draft', v.sv, v.en, v.pos, v.contra, false
FROM (VALUES
  ('risk_based_prioritisation',
   'Prioriterar åtgärder och resurser efter skyddsvärde, sannolikhet och konsekvens -- inte efter vem som frågar högst.',
   'Prioritises measures and resources by asset value, likelihood and consequence -- not by who asks loudest.',
   ARRAY['Namnger vad som skyddas och mot vad','Väger konsekvens mot kostnad öppet','Säger vad som INTE prioriteras och varför'],
   ARRAY['Reagerar på senaste nyhet eller starkaste röst','Köper åtgärder utan att kunna säga vilken risk de minskar']),
  ('governance_and_mandate',
   'Klargör mandat, ansvar och beslutsvägar innan hen delegerar, och följer upp det som delegerats.',
   'Clarifies mandate, responsibility and decision paths before delegating, and follows up what was delegated.',
   ARRAY['Skriver ner vem som beslutar vad','Följer upp delegerade uppgifter på utsatt tid','Tar ansvar för utfallet av egna beslut'],
   ARRAY['Delegerar utan att säga vad som får beslutas','Låter en avvikelse passera för att undvika friktion']),
  ('incident_and_crisis_leadership',
   'Leder en incident genom att skapa en gemensam lägesbild, sätta beslutspunkter och återgå till normalläge kontrollerat.',
   'Leads an incident by building a shared picture, setting decision points and returning to normal in a controlled way.',
   ARRAY['Skiljer bekräftat från antaget under händelsen','Bestämmer i förväg vad som utlöser eskalering','Avslutar med en genomgång i stället för att bara gå vidare'],
   ARRAY['Fattar stora beslut på obekräftad uppgift','Håller kvar krisläge längre än läget kräver']),
  ('cross_functional_collaboration',
   'Samordnar säkerhetsarbetet med verksamheten, andra funktioner, myndigheter och leverantörer utan att lämna ifrån sig ansvaret.',
   'Coordinates security work with the business, other functions, authorities and suppliers without handing over the responsibility.',
   ARRAY['Klargör vem som gör vad innan något händer','Delar information med dem som behöver den','Löser problem tillsammans i stället för att peka'],
   ARRAY['Agerar ensam när andra funktioner berörs','Låter en leverantör definiera vad som är tillräckligt']),
  ('compliance_and_follow_up',
   'Följer upp att krav, rutiner och beslut faktiskt efterlevs, och för fel vidare öppet även när det är obekvämt.',
   'Follows up that requirements, procedures and decisions are actually complied with, and reports failures openly even when it is uncomfortable.',
   ARRAY['Rapporterar en brist uppåt utan att förminska den','Skiljer en avvikelse från vem som orsakade den','Står emot påtryckning att tona ner ett fynd'],
   ARRAY['Anpassar ett fynd till vad ledningen vill höra','Låter ett krav vara känt men ouppfyllt utan plan']),
  ('people_leadership',
   'Leder personal genom tydliga förväntningar, lyssnande, dokumenterad uppföljning och likvärdig behandling.',
   'Leads people through clear expectations, listening, documented follow-up and equal treatment.',
   ARRAY['Säger vad som förväntas innan hen bedömer','Lyssnar färdigt innan hen beslutar','Ger återkoppling på handling, inte person'],
   ARRAY['Bedömer utan att ha sagt vad som gäller','Behandlar samma avvikelse olika beroende på person'])
) AS v(slug, sv, en, pos, contra)
JOIN public.scp_observable_behaviours b ON b.slug = v.slug
ON CONFLICT (behaviour_id, version_number) DO NOTHING;

INSERT INTO public.scp_behaviour_competency_map
  (behaviour_version_id, competency_version_id, weight, is_primary)
SELECT bv.id, cv.id, 1.000, true
FROM (VALUES
  ('risk_based_prioritisation',      'SCC-11'),
  ('governance_and_mandate',         'SCC-09'),
  ('incident_and_crisis_leadership', 'SCC-04'),
  ('cross_functional_collaboration', 'SCC-08'),
  ('compliance_and_follow_up',       'SCC-01'),
  ('people_leadership',              'SCC-06')
) AS v(behaviour_slug, competency_code)
JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
JOIN public.scp_competencies c ON c.code = v.competency_code
JOIN public.scp_competency_versions cv ON cv.competency_id = c.id AND cv.version_number = 1
ON CONFLICT (behaviour_version_id, competency_version_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Authoring helpers (pg_temp: they exist only for this migration)
--
-- Three kinds of item, three helpers, exactly as the operational assessment
-- authors its own -- the review reasons name the strategic role.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.sm_scenario(
  _form uuid, _order int, _block text, _slug text,
  _behaviour uuid, _competency uuid, _facet uuid,
  _difficulty text, _demand text, _construct text, _tests_what text,
  _observable text, _context_sv text, _guard_sv text,
  _scenario_sv text, _prompt_sv text, _scenario_en text, _prompt_en text,
  _opts jsonb
) RETURNS uuid
LANGUAGE plpgsql AS $fn$
DECLARE _item uuid; _iv uuid; _o jsonb; _jur uuid; _n int := 0;
BEGIN
  SELECT id INTO _jur FROM public.scp_jurisdictions WHERE code = 'SE';

  INSERT INTO public.scp_items (slug) VALUES (_slug)
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id INTO _item;

  IF EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    SELECT id INTO _iv FROM public.scp_item_versions WHERE item_id = _item LIMIT 1;
    RETURN _iv;
  END IF;

  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, validation_status, item_format,
     competency_id, facet_id, primary_behaviour_id, mode, observable_behavior,
     response_process, legal_basis_required, jurisdiction_id, difficulty,
     cognitive_demand, primary_construct, tests_what, is_safety_critical,
     requires_human_review, work_context_sv, overgeneralisation_guard_sv,
     evidence_source_type, authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', 'sjt_best_response', _competency, _facet,
     _behaviour, 'assessment', _observable,
     'Situationsbedömning: deltagaren väljer handling utifrån det som faktiskt går att observera i scenariot.',
     false, _jur, _difficulty, _demand, _construct, _tests_what, false,
     false, _context_sv, _guard_sv, 'assessment_response', true,
     'pending','pending','pending','pending','pending')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts
    (item_version_id, language, adaptation_status, scenario, prompt)
  VALUES (_iv, 'sv-SE', 'adaptation_pending', _scenario_sv, _prompt_sv),
         (_iv, 'en-GB', 'adaptation_pending', _scenario_en, _prompt_en);

  FOR _o IN SELECT * FROM jsonb_array_elements(_opts) LOOP
    _n := _n + 1;
    WITH ins AS (
      INSERT INTO public.scp_item_options
        (item_version_id, option_key, display_order, score_value,
         scoring_rationale_sv, is_preferred, distractor_error_type)
      VALUES (_iv, _o->>'k', _n, (_o->>'score')::int, _o->>'rat_sv',
              (_o->>'pref')::boolean, nullif(_o->>'err',''))
      RETURNING id
    )
    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT ins.id, l.lang, l.label FROM ins,
      (VALUES ('sv-SE', _o->>'sv'), ('en-GB', _o->>'en')) AS l(lang,label);
  END LOOP;

  INSERT INTO public.scp_review_requirements (item_version_id, review_type, required, reason, status)
  VALUES
    (_iv,'security_sme',        true,'Riktighet i svensk säkerhetslednings- och styrningskontext.','outstanding'),
    (_iv,'cognitive_interview', true,'Att deltagare tolkar scenariot som avsett.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Läsbarhet och kognitiv belastning.','outstanding'),
    (_iv,'pilot',               true,'Empiriska svarsmönster före operativ användning.','outstanding');

  INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
  VALUES (_form, _iv, _block, _order, true);

  RETURN _iv;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.sm_selfreport(
  _form uuid, _order int, _block text, _slug text,
  _behaviour uuid, _competency uuid, _facet uuid,
  _observable text, _guard_sv text,
  _scenario_sv text, _prompt_sv text, _scenario_en text, _prompt_en text,
  _opts jsonb
) RETURNS uuid
LANGUAGE plpgsql AS $fn$
DECLARE _item uuid; _iv uuid; _o jsonb; _jur uuid; _n int := 0;
BEGIN
  SELECT id INTO _jur FROM public.scp_jurisdictions WHERE code = 'SE';

  INSERT INTO public.scp_items (slug) VALUES (_slug)
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id INTO _item;

  IF EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    SELECT id INTO _iv FROM public.scp_item_versions WHERE item_id = _item LIMIT 1;
    RETURN _iv;
  END IF;

  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, validation_status, item_format,
     competency_id, facet_id, primary_behaviour_id, mode, observable_behavior,
     response_process, legal_basis_required, jurisdiction_id, difficulty,
     cognitive_demand, primary_construct, tests_what, is_safety_critical,
     requires_human_review, overgeneralisation_guard_sv,
     evidence_source_type, authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', 'biq_frequency', _competency, _facet,
     _behaviour, 'assessment', _observable,
     'Självrapportering: deltagaren beskriver sitt eget vanliga arbetssätt som ledare. Svaret är en beskrivning, inte en iakttagelse.',
     false, _jur, 'foundational', 'recognition', 'situational_judgement',
     'judgement', false, false, _guard_sv, 'self_report', true,
     'pending','pending','pending','pending','pending')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts
    (item_version_id, language, adaptation_status, scenario, prompt)
  VALUES (_iv, 'sv-SE', 'adaptation_pending', _scenario_sv, _prompt_sv),
         (_iv, 'en-GB', 'adaptation_pending', _scenario_en, _prompt_en);

  FOR _o IN SELECT * FROM jsonb_array_elements(_opts) LOOP
    _n := _n + 1;
    WITH ins AS (
      INSERT INTO public.scp_item_options
        (item_version_id, option_key, display_order, score_value,
         scoring_rationale_sv, is_preferred, reverse_scored)
      VALUES (_iv, _o->>'k', _n, (_o->>'score')::int, _o->>'rat_sv',
              false, coalesce((_o->>'rev')::boolean, false))
      RETURNING id
    )
    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT ins.id, l.lang, l.label FROM ins,
      (VALUES ('sv-SE', _o->>'sv'), ('en-GB', _o->>'en')) AS l(lang,label);
  END LOOP;

  INSERT INTO public.scp_review_requirements (item_version_id, review_type, required, reason, status)
  VALUES
    (_iv,'security_sme',        true,'Att beskrivningen motsvarar verkligt arbetssätt i en ledande säkerhetsroll.','outstanding'),
    (_iv,'cognitive_interview', true,'Att frågan uppfattas som en beskrivning och inte som ett prov.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Läsbarhet och kognitiv belastning.','outstanding'),
    (_iv,'pilot',               true,'Svarsfördelning och social önskvärdhet före operativ användning.','outstanding');

  INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
  VALUES (_form, _iv, _block, _order, false);

  RETURN _iv;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.sm_reflection(
  _form uuid, _order int, _block text, _slug text,
  _behaviour uuid, _competency uuid, _facet uuid,
  _observable text, _guard_sv text,
  _scenario_sv text, _prompt_sv text, _scenario_en text, _prompt_en text
) RETURNS uuid
LANGUAGE plpgsql AS $fn$
DECLARE _item uuid; _iv uuid; _jur uuid;
BEGIN
  SELECT id INTO _jur FROM public.scp_jurisdictions WHERE code = 'SE';

  INSERT INTO public.scp_items (slug) VALUES (_slug)
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id INTO _item;

  IF EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    SELECT id INTO _iv FROM public.scp_item_versions WHERE item_id = _item LIMIT 1;
    RETURN _iv;
  END IF;

  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, validation_status, item_format,
     competency_id, facet_id, primary_behaviour_id, mode, observable_behavior,
     response_process, legal_basis_required, jurisdiction_id, difficulty,
     cognitive_demand, primary_construct, tests_what, is_safety_critical,
     requires_human_review, overgeneralisation_guard_sv,
     evidence_source_type, authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', 'constructed_response', _competency, _facet,
     _behaviour, 'assessment', _observable,
     'Fri redogörelse för en egen erfarenhet. Läses av en människa mot en publicerad rubrik.',
     false, _jur, 'advanced', 'synthesis', 'situational_judgement',
     'judgement', false, true, _guard_sv, 'assessment_response', true,
     'pending','pending','pending','pending','pending')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts
    (item_version_id, language, adaptation_status, scenario, prompt)
  VALUES (_iv, 'sv-SE', 'adaptation_pending', _scenario_sv, _prompt_sv),
         (_iv, 'en-GB', 'adaptation_pending', _scenario_en, _prompt_en);

  INSERT INTO public.scp_review_requirements (item_version_id, review_type, required, reason, status)
  VALUES
    (_iv,'security_sme',        true,'Att frågan går att besvara utifrån verklig ledningserfarenhet inom eller utanför säkerhet.','outstanding'),
    (_iv,'cognitive_interview', true,'Att deltagare förstår vad som efterfrågas.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Skrivbörda och tidsåtgång.','outstanding'),
    (_iv,'pilot',               true,'Bedömarsamstämmighet före operativ användning.','outstanding');

  INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
  VALUES (_form, _iv, _block, _order, false);

  RETURN _iv;
END $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The assessment, its programme statement and its five sections
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _fam uuid; _role uuid; _jur uuid; _prof uuid;
  _prog uuid; _pver uuid; _def uuid; _ver uuid; _form uuid;
BEGIN
  SELECT id INTO _jur  FROM public.scp_jurisdictions WHERE code = 'SE';
  SELECT family_id INTO _fam FROM public.scp_assessment_definitions
   WHERE slug = 'security-officer-recruitment';
  SELECT id INTO _role FROM public.scp_roles WHERE slug = 'security-manager-se';
  SELECT id INTO _prof FROM public.scp_professions WHERE slug = 'security-manager-se';

  IF _fam IS NULL OR _role IS NULL OR _jur IS NULL OR _prof IS NULL THEN
    RAISE EXCEPTION 'SCP_SM_SPINE_MISSING: family, role, profession or jurisdiction absent.';
  END IF;

  INSERT INTO public.scp_programs (slug, role_id)
  VALUES ('security-manager-recruitment', _role)
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions
   WHERE program_id = _prog AND version_number = 1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en,
       does_not_measure_sv, does_not_measure_en)
    VALUES
      (_prog, 1, _jur, 'draft', 'design',
       'Säkerhetschef – Recruitment Assessment',
       'Security Manager – Recruitment Assessment',
       'Rollspecifik bedömning för rekrytering till strategiska och ledande säkerhetsroller. Ger strukturerat evidens- och intervjuunderlag om riskbaserad prioritering, styrning och mandat, incident- och krisledning, samverkan, regelefterlevnad och självrapporterat ledarbeteende. Resultatet är beslutsstöd inför en strukturerad intervju. Det fattar inget anställningsbeslut, rangordnar inga kandidater och uttalar sig inte om lämplighet. Utkast under granskning -- inte validerat.',
       'A role-specific assessment for recruiting to strategic and leading security roles. It produces structured evidence and interview preparation covering risk-based prioritisation, governance and mandate, incident and crisis leadership, collaboration, compliance and self-reported leadership behaviour. The result is decision support ahead of a structured interview. It makes no employment decision, ranks no candidates and makes no statement about suitability. A draft under review -- not validated.',
       ARRAY['Personlighet','Ärlighet som personlighetsdrag','Emotionell stabilitet','Psykisk hälsa','Motivation','Framtida arbetsprestation','Ledarskapsstil som egenskap','Formell auktorisation','Laglig behörighet','Bakgrundskontroll','Säkerhetsprövning','Lämplighet för anställning'],
       ARRAY['Personality','Honesty as a personality trait','Emotional stability','Mental health','Motivation','Future job performance','Leadership style as a trait','Formal authorisation','Legal competence','Background checking','Security vetting','Suitability for employment'])
    RETURNING id INTO _pver;
  END IF;

  -- Same family and purpose as the operational assessment, the same product
  -- label (designed_for confers nothing), and NOT designated: the
  -- standard_for_recruitment default (false) is what keeps this a draft
  -- nobody can assign until the content approval.
  INSERT INTO public.scp_assessment_definitions
    (family_id, profession_id, slug, name_sv, name_en, purpose,
     is_test_fixture, designed_for)
  VALUES (_fam, _prof, 'security-manager-recruitment',
          'Säkerhetschef – Recruitment Assessment',
          'Security Manager – Recruitment Assessment',
          'development_programme', false, 'recruitment_support')
  ON CONFLICT (slug) DO UPDATE
    SET name_sv = EXCLUDED.name_sv,
        name_en = EXCLUDED.name_en,
        profession_id = EXCLUDED.profession_id,
        designed_for = EXCLUDED.designed_for
  RETURNING id INTO _def;

  SELECT id INTO _ver FROM public.scp_assessment_versions
   WHERE definition_id = _def AND version_number = 1;
  IF _ver IS NULL THEN
    INSERT INTO public.scp_assessment_versions
      (definition_id, version_number, content_status, validation_status,
       language_scope, program_version_id, notes)
    VALUES (_def, 1, 'draft', 'design', ARRAY['sv-SE','en-GB'], _pver,
            'Strategic-level recruitment assessment. AI-authored draft against '
            'the product construct rules and the owner specification of '
            '2026-09-19 §3.1; all five review gates outstanding on every item. '
            'No psychometric claim of any kind. Not designated for recruitment.')
    RETURNING id INTO _ver;
  END IF;

  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-manager-recruitment-form-a';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en,
       target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_ver, 'security-manager-recruitment-form-a',
            'Säkerhetschef rekrytering A', 'Security manager recruitment A',
            35, 50, false)
    RETURNING id INTO _form;
  END IF;

  INSERT INTO public.scp_form_blocks
    (form_id, block_key, display_order, name_sv, name_en, intro_sv, intro_en, asks)
  VALUES
    (_form, 'a_risk_governance', 1,
     'Riskbaserad prioritering och styrning', 'Risk-based prioritisation and governance',
     'Åtta situationer ur en säkerhetschefs vardag: budget, kontroller, mandat och rapportering till ledningen. Det finns sällan ett självklart rätt svar -- välj det du faktiskt skulle göra utifrån det som står i situationen.',
     'Eight situations from a security manager''s working life: budget, controls, mandate and reporting to management. There is rarely one obvious right answer -- choose what you would actually do, based on what the situation tells you.',
     'what_you_would_do'),
    (_form, 'b_incident_leadership', 2,
     'Incident- och krisledning', 'Incident and crisis leadership',
     'Fem situationer där något har hänt och du leder hanteringen. Det handlar om lägesbild, beslutspunkter, samordning och återgång -- inte om att själv springa först.',
     'Five situations where something has happened and you lead the response. They are about the shared picture, decision points, coordination and the return to normal -- not about running first yourself.',
     'what_you_would_do'),
    (_form, 'c_leadership_behaviour', 3,
     'Arbetsbeteende som ledare', 'Leadership work behaviour',
     'Sexton frågor om hur du brukar arbeta som ledare. Det här är inte ett personlighetstest och det finns inget facit. Svaren redovisas för arbetsgivaren som det du själv beskriver -- aldrig som något vi har observerat. Svara som det faktiskt ser ut, inte som det borde se ut.',
     'Sixteen questions about how you usually work as a leader. This is not a personality test and there is no answer key. Your answers are reported to the employer as what you describe about yourself -- never as something we observed. Answer as things actually are, not as they ought to be.',
     'how_you_usually_work'),
    (_form, 'd_integrity_stakeholders', 4,
     'Integritet, samverkan och regelefterlevnad', 'Integrity, collaboration and compliance',
     'Fem situationer där ledning, kund, leverantör eller ett krav drar åt olika håll.',
     'Five situations where management, a client, a supplier or a requirement pull in different directions.',
     'what_you_would_do'),
    (_form, 'e_reflection', 5,
     'Reflektion', 'Reflection',
     'Tre korta frågor om egna erfarenheter av att leda och besluta. Svaren läses av en människa, inte av en modell. Skriv några meningar -- det behöver inte vara långt.',
     'Three short questions about your own experience of leading and deciding. A person reads these, not a model. A few sentences is enough.',
     'your_own_experience')
  ON CONFLICT (form_id, block_key) DO NOTHING;

  RAISE NOTICE 'security-manager-recruitment scaffolding ready';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The items
--
-- Behaviour and competency are RESOLVED from the graph rather than hard-coded,
-- so this migration cannot silently attach evidence to the wrong node.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _form uuid;
  b_risk uuid;  c_risk uuid;  -- risk_based_prioritisation      -> SCC-11
  b_gov uuid;   c_gov uuid;   -- governance_and_mandate         -> SCC-09
  b_inc uuid;   c_inc uuid;   -- incident_and_crisis_leadership -> SCC-04
  b_coll uuid;  c_coll uuid;  -- cross_functional_collaboration -> SCC-08
  b_comp uuid;  c_comp uuid;  -- compliance_and_follow_up       -> SCC-01
  b_lead uuid;  c_lead uuid;  -- people_leadership              -> SCC-06
  b_rep uuid;   c_rep uuid;   -- factual_reporting (existing)   -> SCC-11
  b_info uuid;  c_info uuid;  -- integrity_and_information_handling (existing) -> SCC-01
  b_mand uuid;  c_mand uuid;  -- mandate_and_escalation (existing) -> SCC-09
  b_comm uuid;  c_comm uuid;  -- operational_communication (existing) -> SCC-06
  f_kons uuid; f_fakt uuid; f_prop uuid;                 -- SCC-11
  f_own uuid;  f_track uuid; f_disc uuid; f_err uuid;    -- SCC-09
  f_prio uuid; f_esc uuid;   f_recov uuid;               -- SCC-04
  f_joint uuid; f_share uuid; f_role uuid;               -- SCC-08
  f_rule uuid; f_transp uuid; f_resist uuid; f_ethic uuid; -- SCC-01
  f_listen uuid; f_clear uuid;                           -- SCC-06
BEGIN
  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-manager-recruitment-form-a';
  IF EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id = _form) THEN
    RAISE NOTICE 'security-manager-recruitment items already authored';
    RETURN;
  END IF;

  SELECT bv.id, cv.competency_id INTO b_risk, c_risk
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'risk_based_prioritisation' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_gov, c_gov
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'governance_and_mandate' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_inc, c_inc
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'incident_and_crisis_leadership' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_coll, c_coll
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'cross_functional_collaboration' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_comp, c_comp
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'compliance_and_follow_up' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_lead, c_lead
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'people_leadership' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_rep, c_rep
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'factual_reporting' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_info, c_info
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'integrity_and_information_handling' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_mand, c_mand
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'mandate_and_escalation' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_comm, c_comm
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'operational_communication' AND bv.version_number = 1;

  IF b_risk IS NULL OR b_gov IS NULL OR b_inc IS NULL OR b_coll IS NULL
     OR b_comp IS NULL OR b_lead IS NULL OR b_rep IS NULL OR b_info IS NULL
     OR b_mand IS NULL OR b_comm IS NULL THEN
    RAISE EXCEPTION 'SCP_SM_GRAPH_MISSING: the competency graph does not carry '
      'every behaviour this assessment maps to.';
  END IF;

  -- Facets are identified by (competency, slug): a slug alone is not an identity.
  SELECT f.id INTO f_kons   FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-11' AND f.slug = 'konsekvensanalys';
  SELECT f.id INTO f_fakt   FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-11' AND f.slug = 'faktabaserad-bedomning';
  SELECT f.id INTO f_prop   FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-11' AND f.slug = 'proportionalitet';
  SELECT f.id INTO f_own    FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-09' AND f.slug = 'agarskap';
  SELECT f.id INTO f_track  FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-09' AND f.slug = 'sparbar-uppfoljning';
  SELECT f.id INTO f_disc   FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-09' AND f.slug = 'genomforandedisciplin';
  SELECT f.id INTO f_err    FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-09' AND f.slug = 'fel-och-avvikelseansvar';
  SELECT f.id INTO f_prio   FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-04' AND f.slug = 'prioritering';
  SELECT f.id INTO f_esc    FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-04' AND f.slug = 'eskalering';
  SELECT f.id INTO f_recov  FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-04' AND f.slug = 'aterhamtning';
  SELECT f.id INTO f_joint  FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-08' AND f.slug = 'samordnad-problemlosning';
  SELECT f.id INTO f_share  FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-08' AND f.slug = 'informationsdelning';
  SELECT f.id INTO f_role   FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-08' AND f.slug = 'rollklarhet';
  SELECT f.id INTO f_rule   FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-01' AND f.slug = 'regel-och-syfteslojalitet';
  SELECT f.id INTO f_transp FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-01' AND f.slug = 'transparens';
  SELECT f.id INTO f_resist FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-01' AND f.slug = 'motstand-mot-otillborlig-paverkan';
  SELECT f.id INTO f_ethic  FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-01' AND f.slug = 'etisk-konsekvens';
  SELECT f.id INTO f_listen FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-06' AND f.slug = 'aktivt-lyssnande';
  SELECT f.id INTO f_clear  FROM public.scp_competency_facets f JOIN public.scp_competencies c ON c.id = f.competency_id WHERE c.code = 'SCC-06' AND f.slug = 'saklig-tydlighet';

  IF f_kons IS NULL OR f_fakt IS NULL OR f_prop IS NULL OR f_own IS NULL OR f_track IS NULL
     OR f_disc IS NULL OR f_err IS NULL OR f_prio IS NULL OR f_esc IS NULL OR f_recov IS NULL
     OR f_joint IS NULL OR f_share IS NULL OR f_role IS NULL OR f_rule IS NULL
     OR f_transp IS NULL OR f_resist IS NULL OR f_ethic IS NULL OR f_listen IS NULL OR f_clear IS NULL THEN
    RAISE EXCEPTION 'SCP_SM_FACET_MISSING: a facet this assessment maps to is absent from the graph.';
  END IF;

-- ── BLOCK A — Riskbaserad prioritering och styrning (8) ────────────────────

  -- A1  Budget cut: which control to keep
  PERFORM pg_temp.sm_scenario(_form, 1, 'a_risk_governance', 'sm-rj-a01',
    b_risk, c_risk, f_kons, 'advanced','prioritisation','prioritisation','judgement',
    'Prioriterar en minskning efter vilken förlust varje åtgärd förebygger.',
    'Huvudkontor och tre anläggningar; budgetbesked från ledningen.',
    'Ett svar i ett budgetscenario säger något om resonemanget här, inte om personens allmänna ekonomiska omdöme.',
    'Ledningen meddelar att säkerhetsbudgeten ska minskas med 15 procent från nästa kvartal. De största posterna är bevakningstimmar på huvudkontoret, service och underhåll av passersystemet på tre anläggningar, och ett planerat byte av kameraövervakningen i lagret. Ledningen vill ha ditt förslag i morgon.',
    'Vad gör du?',
    'Management announces that the security budget is to be cut by 15 percent from next quarter. The largest items are guarding hours at head office, service and maintenance of the access-control system at three sites, and a planned replacement of the CCTV in the warehouse. Management wants your proposal tomorrow.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Prioriterar efter konsekvens och gör den risk som ökar synlig för den som beslutar.","sv":"Går igenom vilken förlust varje post förebygger, föreslår var minskningen gör minst skada och skriver ut vilken risk som ökar med förslaget.","en":"Work through which loss each item prevents, propose where the cut does the least harm, and state which risk increases with the proposal."},
      {"k":"b","score":1,"pref":false,"err":"poor_proportionality","rat_sv":"Lika fördelning är inte riskbaserad: den skyddar relationer, inte skyddsvärden.","sv":"Fördelar minskningen lika över alla tre posterna så att ingen del av verksamheten drabbas mer än någon annan.","en":"Spread the cut equally over all three items so that no part of the business is hit harder than another."},
      {"k":"c","score":0,"pref":false,"err":"tunnel_vision","rat_sv":"Väljer efter vad som syns i stället för efter vad som skyddar; ett passersystem utan underhåll försämras tyst.","sv":"Behåller bevakningstimmarna oförändrade eftersom synlig bevakning är det ledningen märker, och stryker underhållet av passersystemet.","en":"Keep the guarding hours unchanged because visible guarding is what management notices, and drop the maintenance of the access-control system."}]'::jsonb);

  -- A2  Consultant report versus own incident history
  PERFORM pg_temp.sm_scenario(_form, 2, 'a_risk_governance', 'sm-rj-a02',
    b_risk, c_risk, f_fakt, 'intermediate','judgement','situational_judgement','judgement',
    'Väger extern rapport mot egen incidenthistorik innan prioritering.',
    'Nyanställd säkerhetschef; extern granskningsrapport och egen incidentlogg.',
    'Ett scenario om prioritering säger inget om personens förhållande till konsulter i allmänhet.',
    'En extern granskning har lämnat 40 fynd. Det som markerats som mest kritiskt är en saknad staketsektion runt en av anläggningarna. Er egen incidentlogg för de senaste två åren visar att nio av tio förluster är interna stölder från lagret, som inte nämns i rapporten.',
    'Vad prioriterar du först?',
    'An external review has delivered 40 findings. The one marked most critical is a missing section of perimeter fence at one site. Your own incident log for the last two years shows that nine out of ten losses are internal thefts from the warehouse, which the report does not mention.',
    'What do you prioritise first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Faktabaserat: två underlag ställs mot varandra och båda får plats i planen med motivering.","sv":"Ställer rapportens fynd mot den egna incidenthistoriken och prioriterar utifrån båda: lagret först, staketet i planen med motivering.","en":"Set the findings of the report against your own incident history and prioritise from both: the warehouse first, the fence in the plan with the reasoning stated."},
      {"k":"b","score":1,"pref":false,"err":"unsupported_assumption","rat_sv":"Överlåter bedömningen till rapporten trots att egna data pekar åt ett annat håll.","sv":"Följer rapportens prioritering rakt av eftersom konsulten har sett fler anläggningar än du.","en":"Follow the prioritisation of the report as it stands, since the consultant has seen more sites than you."},
      {"k":"c","score":0,"pref":false,"err":"insufficient_information","rat_sv":"Skjuter upp åtgärder som egna data redan motiverar.","sv":"Beställer en ny och större utredning innan något åtgärdas, eftersom underlagen pekar åt olika håll.","en":"Commission a new and larger investigation before anything is done, since the two sources point in different directions."}]'::jsonb);

  -- A3  A new site manager asks what she may decide
  PERFORM pg_temp.sm_scenario(_form, 3, 'a_risk_governance', 'sm-rj-a03',
    b_gov, c_gov, f_own, 'intermediate','judgement','situational_judgement','mandate',
    'Klargör mandat och beslutsvägar i stället för att improvisera dem.',
    'Flera anläggningar med platschefer; behörigheter beviljas i praktiken olika.',
    'Ett svar om mandat i ett scenario säger inget om hur personen leder i allmänhet.',
    'Platscheferna på era anläggningar har i praktiken beviljat tillträdesbehörigheter var och en på sitt sätt. En ny platschef frågar dig vad hon egentligen får besluta om själv och vad som ska gå via dig.',
    'Vad gör du?',
    'The site managers at your sites have in practice granted access rights each in their own way. A new site manager asks you what she is actually allowed to decide herself and what has to go through you.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Sätter mandatet skriftligt och lika för alla, och äger beslutet om var gränsen går.","sv":"Skriver ner vad platschefer får besluta om tillträde, vad som kräver ditt godkännande, och går igenom det med henne och de andra platscheferna.","en":"Write down what site managers may decide about access, what needs your approval, and go through it with her and the other site managers."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Lämnar mandatet odefinierat och ansvaret hos den som frågade.","sv":"Säger att hon kan göra som de andra platscheferna brukar, och att du hör av dig om något blir fel.","en":"Tell her she can do as the other site managers usually do, and that you will be in touch if something goes wrong."},
      {"k":"c","score":0,"pref":false,"err":"poor_proportionality","rat_sv":"Centraliserar i stället för att styra; skalar inte och löser inte otydligheten.","sv":"Tar över alla behörighetsbeslut själv tills vidare så att inget blir fel.","en":"Take over all access decisions yourself for now so that nothing goes wrong."}]'::jsonb);

  -- A4  A delegated task is overdue
  PERFORM pg_temp.sm_scenario(_form, 4, 'a_risk_governance', 'sm-rj-a04',
    b_gov, c_gov, f_track, 'foundational','judgement','situational_judgement','judgement',
    'Följer upp det som delegerats utan att ta tillbaka ansvaret.',
    'Uppdatering av utrymningsplaner delegerad till en erfaren medarbetare.',
    'Ett scenario om uppföljning säger inget om personens tålamod eller kontrollbehov i allmänhet.',
    'Du gav en erfaren medarbetare i uppdrag att uppdatera utrymningsplanerna för två byggnader till månadsskiftet. Det har gått en vecka sedan dess och du har inte hört något.',
    'Vad gör du?',
    'You asked an experienced member of staff to update the evacuation plans for two buildings by the end of the month. A week has passed since then and you have heard nothing.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Spårbar uppföljning: läget efterfrågas, hindret klarläggs, ett nytt datum sätts och noteras.","sv":"Frågar efter läget samma dag, tar reda på vad som hindrat, sätter ett nytt datum tillsammans och noterar det.","en":"Ask for the status the same day, find out what got in the way, set a new date together and note it down."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Uppföljningen lämnas till slumpen; erfarenhet ersätter inte uppföljning.","sv":"Väntar till nästa månadsmöte. Personen är erfaren och hör av sig om det behövs.","en":"Wait until the next monthly meeting. The person is experienced and will get in touch if needed."},
      {"k":"c","score":0,"pref":false,"err":"poor_proportionality","rat_sv":"Tar tillbaka ansvaret och döljer missen; inget lärs och inget följs upp.","sv":"Gör klart planerna själv under helgen och nämner det inte. Det går snabbast.","en":"Finish the plans yourself over the weekend and do not mention it. It is quickest."}]'::jsonb);

  -- A5  Management wants the report to say incidents are down
  PERFORM pg_temp.sm_scenario(_form, 5, 'a_risk_governance', 'sm-rj-a05',
    b_rep, c_rep, f_fakt, 'intermediate','judgement','factual_reporting','judgement',
    'Rapporterar vad måtten faktiskt visar, skilt från vad som önskas.',
    'Kvartalsrapport till ledningsgruppen.',
    'Ett svar om rapportering i ett scenario säger inget om personens ärlighet som egenskap.',
    'VD vill att kvartalsrapporten ska visa att antalet incidenter minskat. Den faktiska bilden är att antalet rapporterade incidenter ökat, eftersom ni infört ett enklare sätt att rapportera. Antalet allvarliga incidenter är oförändrat.',
    'Vad gör du?',
    'The CEO wants the quarterly report to show that the number of incidents has fallen. The actual picture is that the number of reported incidents has risen, because you introduced an easier way to report. The number of serious incidents is unchanged.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Faktabaserat: ökningen redovisas, förklaras, och rätt mått för risknivån pekas ut.","sv":"Redovisar att antalet rapporterade incidenter ökat, förklarar att det beror på bättre rapportering, och visar vilka mått som faktiskt säger något om risknivån.","en":"Report that the number of reported incidents has risen, explain that this is due to better reporting, and show which measures actually say something about the level of risk."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Byter mått i tysthet; sant i detalj men vilseledande som helhet.","sv":"Byter mått till allvarliga incidenter, som är oförändrade, och nämner inte ökningen i den totala rapporteringen.","en":"Switch the measure to serious incidents, which are unchanged, and do not mention the rise in overall reporting."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Skriver det som önskas i stället för det som är; underlaget stöder inte påståendet.","sv":"Skriver att incidenterna minskat i förhållande till vad som kunde förväntas, eftersom ledningen ändå behöver ett tydligt budskap.","en":"Write that incidents have fallen relative to what could be expected, since management needs a clear message anyway."}]'::jsonb);

  -- A6  A headline, and a board that wants action now
  PERFORM pg_temp.sm_scenario(_form, 6, 'a_risk_governance', 'sm-rj-a06',
    b_risk, c_risk, f_prop, 'advanced','judgement','situational_judgement','judgement',
    'Väljer åtgärd i proportion till en egen bedömning av hotet mot den egna verksamheten.',
    'Styrelsefråga efter en uppmärksammad händelse i en annan bransch.',
    'Ett scenario om proportion säger inget om personens riskvilja i allmänhet.',
    'Nyheterna rapporterar om en drönarattack mot en industrianläggning i ett annat land. Styrelseordföranden ringer och vill att ni skaffar ett system mot drönare omgående.',
    'Vad gör du?',
    'The news reports a drone attack on an industrial facility in another country. The chair of the board calls and wants you to acquire a counter-drone system immediately.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Bedömer hotet mot den egna verksamheten först och föreslår i proportion till den bedömningen.","sv":"Bedömer vad en drönare faktiskt skulle kunna åstadkomma mot er verksamhet, redovisar det för styrelsen och föreslår åtgärd i proportion till bedömningen.","en":"Assess what a drone could actually achieve against your business, report that to the board, and propose action in proportion to the assessment."},
      {"k":"b","score":1,"pref":false,"err":"premature_escalation","rat_sv":"Åtgärden föregår bedömningen; signalvärde ersätter riskbedömning.","sv":"Beställer offert på ett motmedelssystem direkt, så att styrelsen ser att frågan tas på allvar.","en":"Request a quote for a counter-drone system straight away, so that the board sees the matter is taken seriously."},
      {"k":"c","score":0,"pref":false,"err":"tunnel_vision","rat_sv":"Avfärdar utan bedömning; att inget hänt är inte en riskbedömning.","sv":"Avfärdar frågan eftersom inget sådant har hänt hos er, och går vidare med den ordinarie planen.","en":"Dismiss the matter because nothing of the kind has happened to you, and carry on with the ordinary plan."}]'::jsonb);

  -- A7  An audit finding meets a launch deadline
  PERFORM pg_temp.sm_scenario(_form, 7, 'a_risk_governance', 'sm-rj-a07',
    b_comp, c_comp, f_rule, 'intermediate','judgement','situational_judgement','judgement',
    'Åtgärdar en känd brist nu och rapporterar den, i stället för att planera bort den.',
    'Internrevision; produktionslansering om två veckor.',
    'Ett scenario om en revisionsbrist säger inget om personens regelefterlevnad i allmänhet.',
    'Internrevisionen har konstaterat att behörigheter för personer som slutat inte stängs i tid. Verksamheten har en viktig lansering om två veckor och vill inte ha störningar i arbetet innan dess.',
    'Vad gör du?',
    'Internal audit has found that access rights for people who have left are not closed in time. The business has an important launch in two weeks and does not want disruption before then.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Bristen stängs nu, en tillfällig kontroll täcker tiden fram till en fungerande rutin, och ledningen får veta.","sv":"Ser till att avslutade konton stängs nu, sätter en tillfällig kontroll tills rutinen fungerar, och rapporterar bristen och planen till ledningen.","en":"Make sure closed accounts are shut now, put a temporary control in place until the routine works, and report the finding and the plan to management."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"En känd brist lämnas öppen av bekvämlighet; revisionen får ett löfte i stället för en åtgärd.","sv":"Planerar in en ny rutin efter lanseringen så att den inte stör produktionen, och svarar revisionen att åtgärd är planerad.","en":"Schedule a new routine after the launch so that it does not disrupt production, and reply to audit that action is planned."},
      {"k":"c","score":0,"pref":false,"err":"failure_to_document","rat_sv":"Löser symptomet i tysthet; bristen och dess orsak förs inte vidare.","sv":"Löser det tyst genom att be IT göra en engångsrensning, utan att ta upp bristen vidare.","en":"Fix it quietly by asking IT to do a one-off clean-up, without raising the finding further."}]'::jsonb);

  -- A8  A director asks for an exception
  PERFORM pg_temp.sm_scenario(_form, 8, 'a_risk_governance', 'sm-rj-a08',
    b_gov, c_gov, f_disc, 'intermediate','judgement','situational_judgement','mandate',
    'Håller rutinen och löser det verkliga behovet på ett behörigt sätt.',
    'Projektvecka; en avdelningschef vill ha en dörr öppen.',
    'Ett scenario om undantag säger inget om personens flexibilitet i allmänhet.',
    'En avdelningschef ber dig godkänna att hennes team får ställa upp en sidodörr till lastgården under en projektvecka, eftersom de bär in och ut material hela dagarna. Dörren ingår i skalskyddet.',
    'Vad gör du?',
    'A department head asks you to approve that her team may prop open a side door to the loading yard during a project week, since they carry material in and out all day. The door is part of the perimeter protection.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Rutinen hålls, behovet tas på allvar och löses inom mandat.","sv":"Säger nej till att sätta rutinen ur spel, tar reda på vad teamet behöver och ordnar en behörig lösning, till exempel tillfälliga passerkort eller bemannad dörr.","en":"Say no to putting the routine aside, find out what the team needs, and arrange an authorised solution, for example temporary access cards or a staffed door."},
      {"k":"b","score":1,"pref":false,"err":"excessive_informal_trust","rat_sv":"Ansvar för ett team är inte mandat över skalskyddet; tidsbegränsning gör inte ett hål mindre.","sv":"Godkänner undantaget för projektveckan eftersom avdelningschefen ansvarar för sitt team och det är tidsbegränsat.","en":"Approve the exception for the project week, since the department head is responsible for her team and it is time-limited."},
      {"k":"c","score":0,"pref":false,"err":"weak_communication","rat_sv":"Rätt slutsats, fel hantering: behovet lämnas olöst och nästa gång frågar ingen.","sv":"Hänvisar till policyn och avslutar samtalet. Undantag hanteras inte.","en":"Refer to the policy and end the conversation. Exceptions are not handled."}]'::jsonb);

-- ── BLOCK B — Incident- och krisledning (5) ────────────────────────────────

  -- B1  Two things at once
  PERFORM pg_temp.sm_scenario(_form, 9, 'b_incident_leadership', 'sm-rj-b01',
    b_inc, c_inc, f_prio, 'intermediate','prioritisation','prioritisation','judgement',
    'Prioriterar människor framför egendom och använder de resurser som finns i stället för att göra allt själv.',
    'Huvudkontor med reception; fjärrlager med larm och bevakningsavtal.',
    'Ett prioriteringsscenario säger inget om personens stresstålighet.',
    'Klockan 16.40 går inbrottslarmet på ert fjärrlager, som bevakningsbolaget har instruktion att åka till. Samtidigt ringer receptionen på huvudkontoret, där du sitter, och säger att en person hotar personalen. Du är den enda från säkerhetsfunktionen på plats.',
    'Vad gör du?',
    'At 16:40 the intruder alarm goes off at your remote warehouse, which the guarding company is instructed to attend. At the same moment reception at head office, where you are, calls to say a person is threatening staff. You are the only member of the security function on site.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Människor i fara först; larmet hanteras av den resurs som är avsedd för det; lägesbilden hålls.","sv":"Låter bevakningsbolaget hantera larmet enligt instruktion, tar själv hand om hotet i receptionen där människor är i fara, och ber någon hålla dig uppdaterad om larmet.","en":"Let the guarding company handle the alarm as instructed, deal yourself with the threat in reception where people are at risk, and ask someone to keep you updated on the alarm."},
      {"k":"b","score":1,"pref":false,"err":"tunnel_vision","rat_sv":"Egendom prioriteras framför människor och den egna närvaron lämnas där den behövs minst.","sv":"Åker till lagret, eftersom inbrott mot lagret är den största ekonomiska risken, och ber receptionen ringa polisen.","en":"Drive to the warehouse, since a break-in there is the largest financial risk, and ask reception to call the police."},
      {"k":"c","score":0,"pref":false,"err":"premature_escalation","rat_sv":"Krisläge utan lägesbild binder resurser och skapar oro utan att lösa något av de två problemen.","sv":"Utlyser krisläge för hela organisationen och kallar in krisledningsgruppen innan du vet mer.","en":"Declare a crisis for the whole organisation and call in the crisis management team before you know more."}]'::jsonb);

  -- B2  A suspected attack, unconfirmed
  PERFORM pg_temp.sm_scenario(_form, 10, 'b_incident_leadership', 'sm-rj-b02',
    b_inc, c_inc, f_esc, 'advanced','judgement','mandate_and_escalation','mandate',
    'Eskalerar med bekräftat och misstänkt åtskilt, och sätter nästa beslutspunkt.',
    'Logistiksystem; IT-avdelning; ledning på resa.',
    'Ett eskaleringsscenario säger inget om personens allmänna benägenhet att larma.',
    'IT rapporterar att logistiksystemet beter sig konstigt och att det kan vara ett angrepp med utpressningsprogram, men lika gärna ett tekniskt fel. Kundernas leveransfönster stänger om tre timmar. VD och vice VD sitter på ett flyg i två timmar till.',
    'Vad gör du?',
    'IT reports that the logistics system is behaving strangely and that it may be a ransomware attack, but equally may be a technical fault. The delivery window for customers closes in three hours. The CEO and deputy CEO are on a flight for another two hours.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Skadebegränsning nu, eskalering till den som faktiskt finns med bekräftat och misstänkt åtskilt, och en satt beslutspunkt.","sv":"Ber IT isolera det misstänkta systemet nu, informerar ställföreträdande ledning med det som är bekräftat respektive misstänkt, och sätter en tid för nästa besked.","en":"Ask IT to isolate the suspected system now, inform the deputising management with what is confirmed and what is suspected kept apart, and set a time for the next update."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Väntar på visshet som kanske inte kommer i tid; ledningen förlorar beslutstid.","sv":"Väntar tills IT har bekräftat att det är ett angrepp innan du informerar någon, för att inte skapa oro i onödan.","en":"Wait until IT has confirmed that it is an attack before informing anyone, so as not to cause unnecessary alarm."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Kommunicerar ett antagande som faktum, utåt, före ledningen och före bekräftelse.","sv":"Meddelar kunderna att ni är utsatta för ett angrepp så att de kan förbereda sig.","en":"Tell customers that you are under attack so that they can prepare."}]'::jsonb);

  -- B3  Two functions blame each other
  PERFORM pg_temp.sm_scenario(_form, 11, 'b_incident_leadership', 'sm-rj-b03',
    b_coll, c_coll, f_joint, 'intermediate','judgement','situational_judgement','judgement',
    'Löser problemet över funktionsgränser i stället för att fördela skuld eller dra in allt till sig själv.',
    'Efter ett inbrott; fastighet och IT-säkerhet.',
    'Ett samverkansscenario säger inget om personens samarbetsförmåga som egenskap.',
    'Efter ett inbrott via en nödutgång visar det sig att kamerabilderna raderats av ett automatiskt gallringsskript innan någon hann spara dem. Fastighetsavdelningen säger att IT-säkerhet ansvarar för lagringen. IT-säkerhet säger att fastighet skulle ha begärt att bilderna sparades.',
    'Vad gör du?',
    'After a break-in through an emergency exit it turns out the camera footage was deleted by an automatic retention script before anyone saved it. Facilities says IT security is responsible for storage. IT security says facilities should have requested that the footage be kept.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Samordnad problemlösning: förloppet fastställs gemensamt och åtgärderna fördelas på vad som ska ändras.","sv":"Samlar berörda funktioner, fastställer händelseförloppet tillsammans, och fördelar åtgärder på vad som ska ändras, inte på vem som hade fel.","en":"Bring the functions concerned together, establish the sequence of events jointly, and assign actions by what needs to change, not by who was at fault."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Delegerar samordningen uppåt; problemet består tills någon annan tar det.","sv":"Skriver en rapport till ledningen där båda funktionernas brister beskrivs och låter dem avgöra ansvaret.","en":"Write a report to management describing the shortcomings of both functions and let them decide the responsibility."},
      {"k":"c","score":0,"pref":false,"err":"tunnel_vision","rat_sv":"Bygger en egen ö i stället för fungerande samverkan; flyttar problemet, löser det inte.","sv":"Tar över lagringen av kamerabilder till säkerhetsfunktionen så att du inte är beroende av någon annan.","en":"Take over the storage of camera footage into the security function so that you do not depend on anyone else."}]'::jsonb);

  -- B4  The return to normal
  PERFORM pg_temp.sm_scenario(_form, 12, 'b_incident_leadership', 'sm-rj-b04',
    b_inc, c_inc, f_recov, 'intermediate','judgement','situational_judgement','judgement',
    'Återgår till normalläge kontrollerat och stänger händelsen med en genomgång.',
    'Efter en utrymning på grund av bombhot; polisen har friat byggnaden.',
    'Ett återgångsscenario säger inget om personens försiktighet i allmänhet.',
    'Byggnaden utrymdes efter ett bombhot. Polisen har sökt igenom lokalerna och friat byggnaden. Personalen är skakad, och VD vill att alla ska tillbaka till sina platser med en gång så att arbetet kommer igång.',
    'Vad gör du?',
    'The building was evacuated after a bomb threat. The police have searched the premises and cleared the building. Staff are shaken, and the CEO wants everyone back at their desks at once so that work gets going.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Kontrollerad återgång med information, och händelsen avslutas med lärande.","sv":"Låter personalen återgå stegvis med tydlig information om vad som hänt och vad som kontrollerats, och bokar en genomgång av hanteringen inom en vecka.","en":"Let staff return in stages with clear information about what happened and what was checked, and book a review of the handling within a week."},
      {"k":"b","score":1,"pref":false,"err":"failure_to_document","rat_sv":"Sakligt försvarbart att återgå, men utan information och utan genomgång lärs inget.","sv":"Låter alla gå tillbaka direkt som ledningen vill, eftersom polisen har friat byggnaden, och går vidare.","en":"Let everyone go back straight away as management wants, since the police have cleared the building, and move on."},
      {"k":"c","score":0,"pref":false,"err":"poor_proportionality","rat_sv":"Överprövar polisens bedömning utan eget underlag; kostnaden bärs av verksamheten utan riskminskning.","sv":"Håller byggnaden stängd resten av dagen som försiktighetsåtgärd, trots polisens besked.","en":"Keep the building closed for the rest of the day as a precaution, despite the police decision."}]'::jsonb);

  -- B5  A situation report under uncertainty
  PERFORM pg_temp.sm_scenario(_form, 13, 'b_incident_leadership', 'sm-rj-b05',
    b_comm, c_comm, f_clear, 'intermediate','judgement','operational_communication','judgement',
    'Rapporterar bekräftat, okänt, pågående och nästa uppdatering, i den ordningen.',
    'Fyrtio minuter in i en misstänkt dataläcka; ledningen väntar på besked.',
    'Ett kommunikationsscenario säger inget om personens kommunikationsstil i allmänhet.',
    'Fyrtio minuter efter att en extern part visat upp en fil med era kundnamn väntar ledningen på ett besked från dig. Ni vet ännu inte varifrån filen kommer eller hur mycket som läckt.',
    'Hur rapporterar du?',
    'Forty minutes after an external party showed a file containing your customer names, management is waiting to hear from you. You do not yet know where the file came from or how much has leaked.',
    'How do you report?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Saklig tydlighet: bekräftat, okänt, pågående och nästa tidpunkt, utan spekulation.","sv":"Rapporterar exakt vad som är bekräftat, vad som är okänt, vad som görs just nu och när nästa uppdatering kommer.","en":"Report exactly what is confirmed, what is unknown, what is being done right now and when the next update will come."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Fullständighet före aktualitet lämnar ledningen utan lägesbild när den behövs.","sv":"Väntar med rapporten tills du kan ge en fullständig bild, så att ledningen inte får motstridiga uppgifter.","en":"Hold the report until you can give a complete picture, so that management does not receive conflicting information."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"En sannolik källa presenteras som slutsats; ledningen agerar på ett antagande.","sv":"Rapporterar att läckan sannolikt kommer från en leverantör, eftersom det är det vanligaste, så att ledningen kan agera.","en":"Report that the leak probably comes from a supplier, since that is the most common case, so that management can act."}]'::jsonb);

-- ── BLOCK C — Arbetsbeteende som ledare (16, self-reported) ────────────────
-- Frequency scale, never randomised. Half of the statements are keyed the
-- other way round (rev = true), so a habit of agreeing does not read as a
-- habit of leading well. Nothing here is observed: the evidence row says
-- self_report for the rest of its life.

  PERFORM pg_temp.sm_selfreport(_form, 14, 'c_leadership_behaviour', 'sm-rj-c01',
    b_gov, c_gov, f_track,
    'Beskriver hur hen bestämmer uppföljning när hen delegerar.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'När jag delegerat en uppgift bestämmer jag samtidigt när och hur jag följer upp den.',
    'Hur ofta stämmer det?',
    'When I have delegated a task, I decide at the same time when and how I will follow it up.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att uppföljning sällan bestäms vid delegering.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att uppföljning regelmässigt bestäms vid delegering.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 15, 'c_leadership_behaviour', 'sm-rj-c02',
    b_gov, c_gov, f_track,
    'Beskriver om läget för delegerade uppgifter nås först vid fel.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Läget för uppgifter jag delegerat får jag reda på först när något har gått fel.',
    'Hur ofta stämmer det?',
    'I find out the status of tasks I have delegated only once something has gone wrong.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att uppföljningen inte är reaktiv.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att uppföljningen regelmässigt är reaktiv.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 16, 'c_leadership_behaviour', 'sm-rj-c03',
    b_gov, c_gov, f_own,
    'Beskriver om hen själv säger till när ett eget beslut visat sig fel.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'När ett beslut jag fattat visar sig vara fel säger jag det själv innan någon annan gör det.',
    'Hur ofta stämmer det?',
    'When a decision I made turns out to be wrong, I say so myself before anyone else does.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att egna felbeslut sällan lyfts av personen själv.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att egna felbeslut regelmässigt lyfts av personen själv.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 17, 'c_leadership_behaviour', 'sm-rj-c04',
    b_gov, c_gov, f_own,
    'Beskriver om ansvaret för ett ifrågasatt beslut flyttas till underlaget.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Om ett beslut ifrågasätts i efterhand hänvisar jag i första hand till dem som gav mig underlaget.',
    'Hur ofta stämmer det?',
    'If a decision is questioned afterwards, I refer first of all to the people who gave me the basis for it.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att ansvaret stannar hos personen.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att ansvaret regelmässigt flyttas.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 18, 'c_leadership_behaviour', 'sm-rj-c05',
    b_lead, c_lead, f_listen,
    'Beskriver om hen låter en medarbetare beskriva färdigt innan hen avgör.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Innan jag avgör en fråga som rör en medarbetare låter jag personen beskriva den färdigt.',
    'Hur ofta stämmer det?',
    'Before I decide a matter concerning a member of staff, I let the person describe it fully.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att medarbetaren sällan får tala till punkt.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att medarbetaren regelmässigt får tala till punkt.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 19, 'c_leadership_behaviour', 'sm-rj-c06',
    b_lead, c_lead, f_listen,
    'Beskriver om hen bestämt sig innan andra pratat klart.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'I möten med mitt team har jag bestämt mig innan de andra har pratat klart.',
    'Hur ofta stämmer det?',
    'In meetings with my team, I have made up my mind before the others have finished speaking.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att beslutet väntar på att andra talat.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att beslutet regelmässigt föregår lyssnandet.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 20, 'c_leadership_behaviour', 'sm-rj-c07',
    b_lead, c_lead, f_clear,
    'Beskriver om förväntningar sägs innan bedömning.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Mina medarbetare vet vad jag förväntar mig innan jag bedömer hur de har gjort.',
    'Hur ofta stämmer det?',
    'My staff know what I expect before I judge how they have done.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att förväntningar sällan sägs i förväg.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att förväntningar regelmässigt sägs i förväg.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 21, 'c_leadership_behaviour', 'sm-rj-c08',
    b_lead, c_lead, f_clear,
    'Beskriver om återkoppling ges först när något behöver rättas.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Jag ger återkoppling på hur en uppgift gjordes först när något behöver rättas.',
    'Hur ofta stämmer det?',
    'I give feedback on how a task was done only when something needs correcting.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att återkoppling inte bara ges vid fel.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att återkoppling regelmässigt bara ges vid fel.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 22, 'c_leadership_behaviour', 'sm-rj-c09',
    b_comp, c_comp, f_transp,
    'Beskriver om en egen brist rapporteras i samma form som andras.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'När en brist upptäcks i mitt ansvarsområde rapporterar jag den uppåt i samma form som jag skulle rapportera någon annans.',
    'Hur ofta stämmer det?',
    'When a shortcoming is found in my area of responsibility, I report it upwards in the same form as I would report someone else''s.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att egna brister sällan rapporteras likvärdigt.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att egna brister regelmässigt rapporteras likvärdigt.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 23, 'c_leadership_behaviour', 'sm-rj-c10',
    b_comp, c_comp, f_transp,
    'Beskriver om dåliga nyheter hålls tills en lösning finns.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Dåliga nyheter till ledningen väntar jag med tills jag har en lösning att presentera samtidigt.',
    'Hur ofta stämmer det?',
    'I hold bad news for management until I have a solution to present at the same time.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att dåliga nyheter inte hålls inne.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att dåliga nyheter regelmässigt hålls inne.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 24, 'c_leadership_behaviour', 'sm-rj-c11',
    b_comp, c_comp, f_resist,
    'Beskriver om hen står fast vid underlaget under påtryckning uppifrån.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'När någon med mer makt än jag vill tona ner ett fynd står jag fast vid vad underlaget visar.',
    'Hur ofta stämmer det?',
    'When someone with more power than me wants to play down a finding, I stand by what the evidence shows.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att underlaget sällan försvaras under påtryckning.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att underlaget regelmässigt försvaras under påtryckning.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 25, 'c_leadership_behaviour', 'sm-rj-c12',
    b_comp, c_comp, f_resist,
    'Beskriver om ett ogillat fynd mjukas upp tills det inte sticker ut.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Om ledningen ogillar en slutsats mjukar jag upp den tills fyndet inte längre sticker ut.',
    'Hur ofta stämmer det?',
    'If management dislikes a conclusion, I soften it until the finding no longer stands out.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att fynd inte mjukas upp.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att fynd regelmässigt mjukas upp.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 26, 'c_leadership_behaviour', 'sm-rj-c13',
    b_coll, c_coll, f_share,
    'Beskriver om information som berör en annan funktion förs vidare samma dag.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'När jag får information som berör en annan funktion ser jag till att den når dit samma dag.',
    'Hur ofta stämmer det?',
    'When I receive information that concerns another function, I make sure it reaches them the same day.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att information sällan förs vidare i tid.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att information regelmässigt förs vidare i tid.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 27, 'c_leadership_behaviour', 'sm-rj-c14',
    b_coll, c_coll, f_share,
    'Beskriver om säkerhetsinformation hålls inom funktionen tills den är utredd.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Säkerhetsinformation håller jag inom säkerhetsfunktionen tills jag är säker på hur den ska användas, även när andra funktioner berörs.',
    'Hur ofta stämmer det?',
    'I keep security information within the security function until I am sure how it should be used, even when other functions are affected.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att berörda funktioner inte hålls utanför.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att berörda funktioner regelmässigt hålls utanför.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 28, 'c_leadership_behaviour', 'sm-rj-c15',
    b_risk, c_risk, f_fakt,
    'Beskriver om egen incidenthistorik konsulteras före prioritering.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Innan jag prioriterar en åtgärd tar jag reda på vad den egna incidenthistoriken säger.',
    'Hur ofta stämmer det?',
    'Before I prioritise a measure, I find out what our own incident history says.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att egna data sällan konsulteras.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att egna data regelmässigt konsulteras.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.sm_selfreport(_form, 29, 'c_leadership_behaviour', 'sm-rj-c16',
    b_risk, c_risk, f_fakt,
    'Beskriver om prioritering sker på magkänsla snarare än underlag.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt sätt att leda, inte hur personen faktiskt leder.',
    'Jag prioriterar åtgärder utifrån magkänsla och erfarenhet snarare än utifrån underlag.',
    'Hur ofta stämmer det?',
    'I prioritise measures on gut feeling and experience rather than on evidence.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att underlag går före magkänsla.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att magkänsla regelmässigt går före underlag.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

-- ── BLOCK D — Integritet, samverkan och regelefterlevnad (5) ───────────────

  -- D1  The CEO wants a finding removed before the board meeting
  PERFORM pg_temp.sm_scenario(_form, 30, 'd_integrity_stakeholders', 'sm-rj-d01',
    b_comp, c_comp, f_resist, 'advanced','judgement','situational_judgement','judgement',
    'Står emot påtryckning att ta bort ett fynd, och erbjuder saklig form i stället.',
    'Revisionssammanfattning inför styrelsemöte.',
    'Ett scenario om påtryckning säger inget om personens mod som egenskap.',
    'VD ber dig ta bort ett fynd om en avdelningschefs område ur sammanfattningen till styrelsen, eftersom det "ändå är på gång att lösas" och skulle "ta onödigt fokus".',
    'Vad gör du?',
    'The CEO asks you to remove a finding about the area of one department head from the summary to the board, since it is "being resolved anyway" and would "take unnecessary focus".',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Fyndet behålls, formen erbjuds sakligt med pågående åtgärd, och skälet sägs.","sv":"Behåller fyndet, erbjuder dig att formulera det sakligt och med den åtgärd som pågår, och säger varför det inte kan tas bort.","en":"Keep the finding, offer to word it factually and with the action under way, and say why it cannot be removed."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Tekniskt kvar, praktiskt gömt: styrelsen får inte det den ska ha där den läser.","sv":"Flyttar fyndet till en bilaga som styrelsen kan läsa om de vill, så att sammanfattningen blir som VD önskar.","en":"Move the finding to an appendix the board can read if they wish, so that the summary is as the CEO wants."},
      {"k":"c","score":0,"pref":false,"err":"excessive_informal_trust","rat_sv":"Undanhåller information från det organ den är avsedd för; VD:s roll ger inte mandat över vad styrelsen får veta om risk.","sv":"Tar bort fyndet. VD ansvarar inför styrelsen och får avgöra vad som rapporteras.","en":"Remove the finding. The CEO answers to the board and may decide what is reported."}]'::jsonb);

  -- D2  A client asks for the full incident report, with names
  PERFORM pg_temp.sm_scenario(_form, 31, 'd_integrity_stakeholders', 'sm-rj-d02',
    b_info, c_info, f_ethic, 'intermediate','judgement','situational_judgement','judgement',
    'Delar det avtalet ger rätt till, men inte personuppgifter utan rättslig grund, och säger det.',
    'Stor kund; incident på kundens anläggning; avtalsklausul om insyn.',
    'Ett informationsscenario säger inget om personens diskretion i allmänhet.',
    'En stor kund begär den fullständiga incidentrapporten från en händelse på deras anläggning, inklusive namn på era medarbetare som var inblandade, och hänvisar till avtalets klausul om insyn. Klausulen ger kunden rätt till uppgifter om händelsen och åtgärderna.',
    'Vad gör du?',
    'A major client requests the full incident report from an event at their site, including the names of your staff involved, citing the transparency clause of the contract. The clause entitles the client to information about the event and the measures taken.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Skiljer vad avtalet ger från personuppgifter om enskilda, och är öppen med gränsen.","sv":"Lämnar det avtalet ger rätt till om händelsen och åtgärderna, men inte personuppgifter om enskilda medarbetare utan rättslig grund, och säger det till kunden.","en":"Provide what the contract entitles the client to about the event and the measures, but not personal data about individual staff without a legal basis, and tell the client so."},
      {"k":"b","score":1,"pref":false,"err":"excessive_informal_trust","rat_sv":"Kundens vikt är inte en rättslig grund; klausulen omfattar händelsen, inte personerna.","sv":"Skickar hela rapporten eftersom kunden är viktig och har en klausul om insyn.","en":"Send the whole report, since the client is important and has a transparency clause."},
      {"k":"c","score":0,"pref":false,"err":"weak_communication","rat_sv":"Lämnar inte ens det kunden har rätt till; skjuter en enkel gränsdragning till andra.","sv":"Avböjer att lämna något alls tills juristerna har uttalat sig, och låter kunden vänta.","en":"Decline to provide anything at all until the lawyers have spoken, and let the client wait."}]'::jsonb);

  -- D3  A helpful supplier who keeps failing
  PERFORM pg_temp.sm_scenario(_form, 32, 'd_integrity_stakeholders', 'sm-rj-d03',
    b_coll, c_coll, f_role, 'intermediate','judgement','situational_judgement','judgement',
    'Håller isär relation och avtal: avvikelser dokumenteras och hanteras formellt.',
    'Bevakningsleverantör; upprepade avvikelser; god personlig relation.',
    'Ett leverantörsscenario säger inget om personens relationsförmåga i allmänhet.',
    'Er bevakningsleverantör har vid fem tillfällen den senaste månaden skickat ersättare utan den objektsutbildning avtalet kräver. Leverantörens kundansvarige är hjälpsam och ber om ursäkt varje gång.',
    'Vad gör du?',
    'Your guarding supplier has on five occasions in the last month sent substitutes without the site training the contract requires. The account manager of the supplier is helpful and apologises every time.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Rollklarhet: avtalet hanteras formellt med tidsatt krav; relationen bevaras genom tydlighet, inte i stället för den.","sv":"Dokumenterar avvikelserna, tar upp dem formellt mot avtalet med krav på åtgärd inom en bestämd tid, och behåller den goda relationen på det sättet.","en":"Document the deviations, raise them formally against the contract with a requirement for action within a set time, and keep the good relationship that way."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Relationen ersätter styrningen; avvikelsen fortsätter.","sv":"Fortsätter ta det med kundansvarige varje gång. Relationen är god och det brukar lösa sig.","en":"Keep raising it with the account manager each time. The relationship is good and it usually gets resolved."},
      {"k":"c","score":0,"pref":false,"err":"poor_proportionality","rat_sv":"Oproportionerligt utan att först ha ställt ett formellt krav; skapar ett nytt problem.","sv":"Säger upp avtalet direkt vid nästa avvikelse för att markera.","en":"Terminate the contract at the next deviation to make a point."}]'::jsonb);

  -- D4  A reporting obligation missed on your watch
  PERFORM pg_temp.sm_scenario(_form, 33, 'd_integrity_stakeholders', 'sm-rj-d04',
    b_comp, c_comp, f_transp, 'advanced','judgement','situational_judgement','judgement',
    'Rapporterar en försummad skyldighet öppet, inklusive förseningen och orsaken.',
    'Verksamhet med anmälningsskyldighet till en tillsynsmyndighet; skyldigheten framgår av scenariot.',
    'Ett scenario om en missad anmälan säger inget om personens noggrannhet i allmänhet.',
    'Er verksamhet är skyldig att anmäla vissa säkerhetsincidenter till en tillsynsmyndighet inom en viss tid. Du upptäcker att en incident för fyra månader sedan, under din tid som chef, aldrig anmäldes. Ingen har frågat efter den.',
    'Vad gör du?',
    'Your organisation is obliged to report certain security incidents to a supervisory authority within a set time. You discover that an incident four months ago, during your time as manager, was never reported. Nobody has asked about it.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Transparens: anmälan görs nu, förseningen och orsaken redovisas, och rutinen ändras.","sv":"Anmäler händelsen till myndigheten nu, informerar ledningen om förseningen och orsaken, och ändrar rutinen så att det inte upprepas.","en":"Report the incident to the authority now, inform management of the delay and its cause, and change the routine so that it does not happen again."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Anmälan görs men förseningen döljs; det som rapporteras är inte sant i sin helhet.","sv":"Anmäler händelsen men beskriver den som nyupptäckt, så att förseningen inte behöver förklaras.","en":"Report the incident but describe it as newly discovered, so that the delay does not have to be explained."},
      {"k":"c","score":0,"pref":false,"err":"failure_to_document","rat_sv":"En känd skyldighet lämnas ouppfylld medvetet.","sv":"Låter bli att anmäla eftersom det gått så lång tid och ingen har frågat.","en":"Do not report it, since so much time has passed and nobody has asked."}]'::jsonb);

  -- D5  A subordinate's mistake reaches the board
  PERFORM pg_temp.sm_scenario(_form, 34, 'd_integrity_stakeholders', 'sm-rj-d05',
    b_mand, c_mand, f_err, 'intermediate','judgement','situational_judgement','judgement',
    'Tar chefsansvaret för en avvikelse och håller isär det från hanteringen av medarbetaren.',
    'Styrelsen frågar om en förlust efter en missad låskontroll.',
    'Ett ansvarsscenario säger inget om personens lojalitet som egenskap.',
    'En medarbetare i din funktion missade en låskontroll, vilket ledde till en stöld med betydande förlust. Styrelsen frågar dig vad som hände.',
    'Vad säger du?',
    'A member of your function missed a lock check, which led to a theft with a significant loss. The board asks you what happened.',
    'What do you say?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Fel- och avvikelseansvar: händelsen, bristen i rutin och uppföljning, chefsansvaret, och medarbetaren separat.","sv":"Redogör för vad som hände och vad som brast i rutin och uppföljning, tar ansvaret som chef, och hanterar medarbetaren separat.","en":"Explain what happened and what failed in routine and follow-up, take the responsibility as manager, and deal with the member of staff separately."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Sant men ofullständigt: ansvaret placeras helt hos medarbetaren och systemfrågan lämnas obesvarad.","sv":"Redogör för att en medarbetare missade en kontroll, och att medarbetaren har fått en tillsägelse.","en":"Explain that a member of staff missed a check, and that the member of staff has been reprimanded."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Döljer den faktiska orsaken bakom en oprecis förklaring.","sv":"Beskriver händelsen som ett systemfel utan att nämna att en kontroll missades.","en":"Describe the event as a system failure without mentioning that a check was missed."}]'::jsonb);

-- ── BLOCK E — Reflektion (3, read by a person) ─────────────────────────────

  PERFORM pg_temp.sm_reflection(_form, 35, 'e_reflection', 'sm-rj-e01',
    b_gov, c_gov, f_own,
    'Redogör för ett eget säkerhetsbeslut och hur det försvarades.',
    'Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade.',
    'Den här frågan har inget rätt svar. En människa läser ditt svar.',
    'Beskriv ett säkerhetsbeslut du fattat som du behövde försvara inför ledning, kund eller kollegor. Hur resonerade du, och vad hände?',
    'This question has no right answer. A person reads what you write.',
    'Describe a security decision you made that you had to defend to management, a client or colleagues. How did you reason, and what happened?');

  PERFORM pg_temp.sm_reflection(_form, 36, 'e_reflection', 'sm-rj-e02',
    b_lead, c_lead, f_clear,
    'Redogör för en kontroll som inte fungerade och vad som gjordes med teamet.',
    'Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade.',
    'Den här frågan har inget rätt svar. En människa läser ditt svar.',
    'Beskriv en gång då en kontroll eller rutin inom ditt ansvar inte fungerade. Vad gjorde du med teamet efteråt?',
    'This question has no right answer. A person reads what you write.',
    'Describe a time when a control or routine within your responsibility did not work. What did you do with the team afterwards?');

  PERFORM pg_temp.sm_reflection(_form, 37, 'e_reflection', 'sm-rj-e03',
    b_risk, c_risk, f_kons,
    'Redogör för en föreslagen åtgärd som valdes bort och vad som vägdes in.',
    'Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade.',
    'Den här frågan har inget rätt svar. En människa läser ditt svar.',
    'Beskriv en gång då du valde att inte genomföra en föreslagen säkerhetsåtgärd. Vad vägde du in, och hur följde du upp beslutet?',
    'This question has no right answer. A person reads what you write.',
    'Describe a time when you chose not to implement a proposed security measure. What did you weigh up, and how did you follow up the decision?');

  RAISE NOTICE 'security-manager-recruitment: 37 items authored';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Rubrics for the three written reflections
--
-- Four dimensions each. One of the four is writing quality, marked
-- assesses_writing_quality so that it is shown to the reviewer and excluded
-- from the derived contribution. must_not_infer is the same list the
-- operational rubrics carry, plus the two things a leadership reflection
-- invites a reader to guess at and must not: seniority and leadership style.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_rubrics (slug) VALUES
  ('sm-rj-e01-defended-decision'), ('sm-rj-e02-failed-control'),
  ('sm-rj-e03-declined-measure')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_rubric_versions
  (rubric_id, item_version_id, version_number, content_status, name_sv, name_en, must_not_infer)
SELECT r.id, iv.id, 1, 'draft', v.sv, v.en,
  ARRAY['personlighet','ärlighet som egenskap','motivation','känsloläge','avsikt',
        'intelligens','psykisk hälsa','framtida arbetsprestation','lämplighet för anställning',
        'skyddade personliga egenskaper','språklig elegans','senioritet','ledarstil som egenskap']
FROM (VALUES
 ('sm-rj-e01-defended-decision','sm-rj-e01','Försvarat säkerhetsbeslut','Defended security decision'),
 ('sm-rj-e02-failed-control','sm-rj-e02','Kontroll som inte fungerade','Control that failed'),
 ('sm-rj-e03-declined-measure','sm-rj-e03','Bortvald åtgärd','Declined measure')
) AS v(rslug,islug,sv,en)
JOIN public.scp_rubrics r ON r.slug = v.rslug
JOIN public.scp_items i ON i.slug = v.islug
JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
ON CONFLICT (rubric_id, version_number) DO NOTHING;

INSERT INTO public.scp_rubric_dimensions
  (rubric_version_id, dimension_key, display_order, name_sv, name_en,
   observable_criteria_sv, observable_criteria_en, assesses_writing_quality)
SELECT rv.id, v.k, v.ord, v.sv, v.en, v.csv, v.cen, v.style
FROM (VALUES
 ('sm-rj-e01-defended-decision','concrete_situation',1,'Konkret situation','Concrete situation',
  'Ett verkligt, avgränsat beslut beskrivs, med vem det försvarades inför -- inte en princip eller en styrka i förklädnad.',
  'A real, bounded decision is described, with whom it was defended to -- not a principle or a strength in disguise.',false),
 ('sm-rj-e01-defended-decision','reasoning_stated',2,'Redovisat resonemang','Reasoning stated',
  'Det framgår vilket underlag och vilka avvägningar beslutet vilade på, och vad motparten invände.',
  'The basis and the trade-offs the decision rested on are stated, and what the other party objected.',false),
 ('sm-rj-e01-defended-decision','ownership',3,'Ägarskap','Ownership',
  'Beslutet och dess utfall placeras hos personen själv, oavsett om det stod sig eller ändrades.',
  'The decision and its outcome are located with the person, whether it held or was changed.',false),
 ('sm-rj-e01-defended-decision','clarity',4,'Tydlighet','Clarity',
  'Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat.',
  'The account can be followed. Simple language is judged equal to polished.',true),

 ('sm-rj-e02-failed-control','concrete_situation',1,'Konkret situation','Concrete situation',
  'En verklig kontroll eller rutin som inte fungerade beskrivs, inom personens eget ansvar.',
  'A real control or routine that failed is described, within the person''s own responsibility.',false),
 ('sm-rj-e02-failed-control','what_changed',2,'Vad som ändrades','What changed',
  'Det framgår vad som faktiskt ändrades i kontrollen, rutinen eller uppföljningen efteråt.',
  'What actually changed in the control, the routine or the follow-up afterwards is stated.',false),
 ('sm-rj-e02-failed-control','team_handling',3,'Hantering av teamet','Handling of the team',
  'Teamet beskrivs som deltagare i lösningen; avvikelsen skiljs från vem som orsakade den.',
  'The team is described as taking part in the solution; the deviation is separated from who caused it.',false),
 ('sm-rj-e02-failed-control','clarity',4,'Tydlighet','Clarity',
  'Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat.',
  'The account can be followed. Simple language is judged equal to polished.',true),

 ('sm-rj-e03-declined-measure','concrete_situation',1,'Konkret situation','Concrete situation',
  'En verklig, föreslagen åtgärd som valdes bort beskrivs, och vem som föreslog den.',
  'A real, proposed measure that was declined is described, and who proposed it.',false),
 ('sm-rj-e03-declined-measure','weighing_stated',2,'Redovisad avvägning','Weighing stated',
  'Det framgår vilken risk åtgärden skulle ha minskat, och vad som vägde tyngre.',
  'Which risk the measure would have reduced is stated, and what outweighed it.',false),
 ('sm-rj-e03-declined-measure','consequence_awareness',3,'Konsekvensmedvetenhet','Consequence awareness',
  'Den risk som kvarstod beskrivs, och hur den följdes upp eller accepterades öppet.',
  'The risk that remained is described, and how it was followed up or openly accepted.',false),
 ('sm-rj-e03-declined-measure','clarity',4,'Tydlighet','Clarity',
  'Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat.',
  'The account can be followed. Simple language is judged equal to polished.',true)
) AS v(rslug,k,ord,sv,en,csv,cen,style)
JOIN public.scp_rubrics r ON r.slug = v.rslug
JOIN public.scp_rubric_versions rv ON rv.rubric_id = r.id AND rv.version_number = 1
ON CONFLICT (rubric_version_id, dimension_key) DO NOTHING;

INSERT INTO public.scp_rubric_levels (rubric_dimension_id, level, descriptor_sv, descriptor_en)
SELECT d.id, l.lvl, l.sv, l.en
FROM public.scp_rubric_dimensions d
JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
JOIN public.scp_rubrics r ON r.id = rv.rubric_id
CROSS JOIN (VALUES
 (0,'Inget underlag i svaret för denna dimension.','No evidence in the response for this dimension.'),
 (1,'Enstaka relevant inslag, men väsentligt saknas.','An isolated relevant element, but essentials are missing.'),
 (2,'Delvis uppfyllt; minst en väsentlig brist kvarstår.','Partly met; at least one material gap remains.'),
 (3,'Uppfyllt i allt väsentligt utan allvarliga brister.','Met in all essentials with no serious gaps.'),
 (4,'Uppfyllt genomgående och konkret.','Met throughout, and concretely.')
) AS l(lvl,sv,en)
WHERE r.slug LIKE 'sm-rj-e0%'
ON CONFLICT (rubric_dimension_id, level) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Report section: interview prompts for the self-reported leadership areas
--
-- The evidence report's interview preparation is keyed by competency and, for
-- a self-description, by the facet the item describes (scp_release_attempt_
-- report joins scp_interview_guide_prompts on (competency, facet, focus)).
-- The eight facets this assessment describes have no prompt yet, so a
-- leadership self-report would reach the report with nothing to ask about.
-- Eight role-neutral prompts, one per facet. authored_by_ai = true; not
-- reviewed. Published because the report reads only published prompts and a
-- draft prompt would be indistinguishable from none; the item gates and the
-- designation, not this row, decide whether anybody ever sees a report.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_interview_guide_prompts
  (competency_id, facet_id, focus, question_sv, question_en,
   followup_sv, followup_en, listen_for_sv, listen_for_en, authored_by_ai)
SELECT c.id, f.id, 'explore_self_report', v.q_sv, v.q_en, v.f_sv, v.f_en, v.l_sv, v.l_en, true
FROM (VALUES
  ('SCC-09','sparbar-uppfoljning',
   'Du beskriver hur du följer upp det du delegerat. Berätta om en uppgift du delegerade nyligen -- när och hur följde du upp den?',
   'You describe how you follow up what you delegate. Tell me about a task you delegated recently -- when and how did you follow it up?',
   'Vad hände om uppföljningen visade att uppgiften inte var klar?',
   'What happened if the follow-up showed the task was not done?',
   ARRAY['Uppföljningen bestämdes när uppgiften gavs','Ett konkret datum eller tillfälle nämns','Utfallet av uppföljningen beskrivs, inte bara avsikten'],
   ARRAY['The follow-up was decided when the task was given','A concrete date or occasion is mentioned','The outcome of the follow-up is described, not only the intention']),
  ('SCC-09','agarskap',
   'Du beskriver hur du tar ansvar för egna beslut. Berätta om ett beslut du fattade som visade sig vara fel -- vem sa det först, och vad gjorde du?',
   'You describe how you own your decisions. Tell me about a decision you made that turned out to be wrong -- who said so first, and what did you do?',
   'Vad sa du till dem som hade gett dig underlaget?',
   'What did you say to the people who had given you the basis for it?',
   ARRAY['Beslutet beskrivs som personens eget','Felet lyftes av personen själv, eller så framgår varför inte','Åtgärden efteråt beskrivs konkret'],
   ARRAY['The decision is described as the person''s own','The error was raised by the person, or it is clear why not','The action afterwards is described concretely']),
  ('SCC-06','aktivt-lyssnande',
   'Du beskriver hur du lyssnar innan du beslutar. Berätta om en gång då det en medarbetare sa ändrade ett beslut du redan lutade åt.',
   'You describe how you listen before deciding. Tell me about a time when what a member of staff said changed a decision you were already leaning towards.',
   'Hur märkte medarbetaren att det hade betydelse?',
   'How did the member of staff notice that it made a difference?',
   ARRAY['En verklig situation med en identifierbar person','Det ursprungliga beslutet och ändringen är båda konkreta','Personen beskriver sitt eget lyssnande, inte bara medarbetarens argument'],
   ARRAY['A real situation with an identifiable person','The original decision and the change are both concrete','The person describes their own listening, not only the argument made']),
  ('SCC-06','saklig-tydlighet',
   'Du beskriver hur du är tydlig med förväntningar. Berätta om en gång då någon i ditt team gjorde fel för att förväntningen inte hade sagts -- vad ändrade du?',
   'You describe how you are clear about expectations. Tell me about a time when someone on your team got it wrong because the expectation had not been said -- what did you change?',
   'Hur ger du återkoppling när något går bra?',
   'How do you give feedback when something goes well?',
   ARRAY['Skiljer på att förväntningen saknades och att personen felade','Ändringen efteråt är konkret','Återkoppling beskrivs även utan fel'],
   ARRAY['Separates the expectation being missing from the person failing','The change afterwards is concrete','Feedback is described even without a fault']),
  ('SCC-01','transparens',
   'Du beskriver hur du rapporterar brister öppet. Berätta om det senaste du rapporterade uppåt som var obekvämt för dig själv.',
   'You describe how you report shortcomings openly. Tell me about the last thing you reported upwards that was uncomfortable for you personally.',
   'Hur lång tid gick det från att du visste till att du rapporterade?',
   'How long passed between knowing and reporting?',
   ARRAY['Bristen låg i personens eget ansvarsområde','Tidsavståndet nämns och förklaras','Formen jämförs med hur andras brister rapporteras'],
   ARRAY['The shortcoming lay within the person''s own responsibility','The time gap is mentioned and explained','The form is compared with how others'' shortcomings are reported']),
  ('SCC-01','motstand-mot-otillborlig-paverkan',
   'Du beskriver hur du står fast vid ett fynd under påtryckning. Berätta om en gång då någon över dig ville tona ner något du hade kommit fram till.',
   'You describe how you stand by a finding under pressure. Tell me about a time when someone above you wanted to play down something you had concluded.',
   'Vad ändrade du i formuleringen, och vad ändrade du inte?',
   'What did you change in the wording, and what did you not change?',
   ARRAY['Motparten och påtryckningen är konkreta','Skillnaden mellan form och innehåll beskrivs','Utfallet sägs, även om fyndet till slut tonades ner'],
   ARRAY['The other party and the pressure are concrete','The difference between form and substance is described','The outcome is stated, even if the finding was eventually played down']),
  ('SCC-08','informationsdelning',
   'Du beskriver hur du för information vidare till andra funktioner. Berätta om en gång då säkerhetsinformation nådde en annan funktion för sent, eller inte alls.',
   'You describe how you pass information on to other functions. Tell me about a time when security information reached another function too late, or not at all.',
   'Vad avgjorde när du delade och när du väntade?',
   'What decided when you shared and when you waited?',
   ARRAY['En verklig händelse med en identifierbar mottagare','Skälet till fördröjningen beskrivs utan bortförklaring','Vad som ändrades efteråt'],
   ARRAY['A real event with an identifiable recipient','The reason for the delay is described without excuse','What changed afterwards']),
  ('SCC-11','faktabaserad-bedomning',
   'Du beskriver hur du prioriterar utifrån underlag. Berätta om en åtgärd du prioriterade upp eller ner för att den egna incidenthistoriken sa något annat än du trodde.',
   'You describe how you prioritise on evidence. Tell me about a measure you moved up or down because your own incident history said something different from what you expected.',
   'Vad hade du trott, och vad visade underlaget?',
   'What had you expected, and what did the evidence show?',
   ARRAY['Underlaget nämns konkret','Skillnaden mellan antagande och underlag beskrivs','Beslutet ändrades faktiskt, eller så framgår varför inte'],
   ARRAY['The evidence is named concretely','The gap between assumption and evidence is described','The decision actually changed, or it is clear why not'])
) AS v(code, facet, q_sv, q_en, f_sv, f_en, l_sv, l_en)
JOIN public.scp_competencies c ON c.code = v.code
JOIN public.scp_competency_facets f ON f.competency_id = c.id AND f.slug = v.facet
WHERE NOT EXISTS (
  SELECT 1 FROM public.scp_interview_guide_prompts p
   WHERE p.competency_id = c.id AND p.facet_id = f.id AND p.focus = 'explore_self_report');

UPDATE public.scp_interview_guide_prompts p
   SET content_status = 'published'
  FROM public.scp_competency_facets f
 WHERE p.facet_id = f.id
   AND f.slug IN ('sparbar-uppfoljning','agarskap','aktivt-lyssnande','saklig-tydlighet',
                  'transparens','motstand-mot-otillborlig-paverkan','informationsdelning',
                  'faktabaserad-bedomning')
   AND p.focus = 'explore_self_report'
   AND p.authored_by_ai
   AND p.content_status = 'draft';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. The interview guide: Säkerhetschef Role Interview Pack v1 (draft,
--    pilot_hypothesis, RESTRICTED)
--
-- Same format as vaktare-se: six competencies, eight fixed questions in a
-- fixed order, approved probes only, five evidence dimensions and 0-4
-- anchors per question, verification boundaries and prohibited areas.
-- purpose_provenance is 'derived_in_import' on every probe: there is no
-- external source document for this pack; the proposal is this migration
-- and docs/assessment/security-manager-recruitment-review-proposal.md, and
-- every purpose label is an explicit item for the expert review gate.
-- ═══════════════════════════════════════════════════════════════════════════

DO $seed$
DECLARE
  _role_id uuid;
  _role_version_id uuid;
  _pack_id uuid;
  _version_id uuid;
  _hash text;
  _rec record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_interview_packs WHERE slug = 'security-manager-se') THEN
    RAISE NOTICE 'SCP_SM_SEED: security-manager-se already present, skipping.';
    RETURN;
  END IF;

  SELECT r.id INTO _role_id FROM public.scp_roles r WHERE r.slug = 'security-manager-se';
  SELECT v.id INTO _role_version_id
    FROM public.scp_role_versions v WHERE v.role_id = _role_id
   ORDER BY v.version_number DESC LIMIT 1;
  IF _role_id IS NULL OR _role_version_id IS NULL THEN
    RAISE EXCEPTION 'SCP_SM_SEED: the security-manager-se role and its version must exist before the pack.';
  END IF;

  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, name_en, purpose_sv, created_by, pack_kind)
  VALUES ('security-manager-se', _role_id, 'Säkerhetschef', 'Security Manager',
          'Strukturerad, PEACE-baserad och evidensinformerad pilotintervju för strategiska och ledande säkerhetsroller. Skapa likvärdiga intervjuer som samlar in konkret jobbrelevant evidens om prioritering, styrning, incidentledning, samverkan, regelefterlevnad och ledarskap. AI får förbereda och strukturera; intervjuaren bedömer och beslutar.',
          NULL, 'role_interview')
  RETURNING id INTO _pack_id;

  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, content_status, validation_label, locale,
     role_version_id, source_reference, source_document_version, summary_sv, created_by)
  VALUES
    (_pack_id, 1, 'draft', 'pilot_hypothesis', 'sv-SE', _role_version_id,
     'CQrityjob Säkerhetschef Role Interview Pack (granskningsförslag)',
     'v0.1 (2026-09-26, utkast)',
     'Utkast för granskning. Kompetenser, frågor och ankare är ett förslag som måste innehållsvalideras genom dokumenterad arbetsanalys av ledande säkerhetsbefattningar hos pilotkunder och panel med experter innan skarpa urvalsbeslut. Ingen empiriskt validerad prediktionsmodell. Inte godkänt, inte öppnat för pilot.',
     NULL)
  RETURNING id INTO _version_id;

  -- ---- competencies C1..C6: the six areas the specification proposes -----
  FOR _rec IN
    SELECT * FROM (VALUES
      ('C1', 1, 'Riskbaserad prioritering och resursfördelning',
       'Prioriterar åtgärder och resurser efter skyddsvärde, sannolikhet och konsekvens, redovisar avvägningar öppet och säger vad som inte prioriteras.',
       ARRAY['Underlag före åtgärd','Konsekvensanalys','Öppet bortval','Proportion']),
      ('C2', 2, 'Styrning, mandat och ansvarsfördelning',
       'Klargör vem som beslutar vad, dokumenterar mandat och beslutsvägar, delegerar med uppföljning och tar ansvar för egna beslut.',
       ARRAY['Mandatklarhet','Dokumenterad beslutsväg','Uppföljning av delegering','Ägarskap']),
      ('C3', 3, 'Incident- och krisledning',
       'Skapar gemensam lägesbild, skiljer bekräftat från antaget, sätter beslutspunkter, samordnar resurser och återgår till normalläge kontrollerat med lärande.',
       ARRAY['Lägesbild','Beslutspunkter','Samordning','Kontrollerad återgång','Genomgång']),
      ('C4', 4, 'Samverkan med verksamhet, myndigheter och leverantörer',
       'Får andra att göra sin del av säkerhetsarbetet genom rollklarhet, informationsdelning och gemensam problemlösning, utan att lämna ifrån sig ansvaret.',
       ARRAY['Rollklarhet','Informationsdelning','Gemensam lösning','Avtalsstyrning']),
      ('C5', 5, 'Regelefterlevnad och uppföljning',
       'Följer upp att krav, rutiner och beslut efterlevs, rapporterar brister sakligt även när de är egna eller obekväma, och står emot påtryckning att tona ner fynd.',
       ARRAY['Uppföljning','Saklig rapportering','Transparens','Motstånd mot påverkan']),
      ('C6', 6, 'Ledarskap och uppföljning av personal',
       'Leder personal genom tydliga förväntningar, lyssnande, återkoppling på handling och likvärdig behandling, och förändrar arbetssätt tillsammans med teamet.',
       ARRAY['Tydliga förväntningar','Lyssnande','Återkoppling','Likvärdighet','Förändring med teamet'])
    ) AS t(code, ord, name_sv, definition_sv, indicators)
  LOOP
    INSERT INTO public.scp_interview_pack_competencies
      (pack_version_id, code, display_order, name_sv, definition_sv, observable_indicators_sv)
    VALUES (_version_id, _rec.code, _rec.ord, _rec.name_sv, _rec.definition_sv, _rec.indicators);
  END LOOP;

  -- ---- the competency mapping artifact: PROVISIONAL, every row -----------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('C1', 'SCC-11', 'broader_than_source', 'C1 bygger på SCC-11 Professionellt omdöme och proportionalitet (faktabaserad bedömning, konsekvensanalys, proportionalitet) men lägger till resursfördelning över tid.'),
      ('C1', 'SCC-04', 'partial_overlap',     'Prioriteringsdelen av C1 överlappar SCC-04 Beslutsfattande under press, facetten prioritering. Fördelningen är inte fastställd.'),
      ('C2', 'SCC-09', 'broader_than_source', 'C2 vilar på SCC-09 Ansvarstagande och tillförlitlighet (ägarskap, spårbar uppföljning) men lägger till mandatdesign och beslutsvägar.'),
      ('C3', 'SCC-04', 'broader_than_source', 'C3 bygger på SCC-04 Beslutsfattande under press (prioritering, eskalering, återhämtning) men innefattar lägesbild och samordning som konstruktet inte täcker.'),
      ('C3', 'SCC-03', 'partial_overlap',     'Lägesbildsdelen av C3 överlappar SCC-03 Situationsmedvetenhet, facetterna situationssyntes och framåtblick.'),
      ('C4', 'SCC-08', 'broader_than_source', 'C4 bygger på SCC-08 Samarbete och samordning men lägger till avtalsstyrning och myndighetssamverkan.'),
      ('C4', 'SCC-06', 'partial_overlap',     'Informationsdelningsdelen av C4 överlappar SCC-06 Kommunikation och informationskvalitet.'),
      ('C5', 'SCC-01', 'broader_than_source', 'C5 vilar på SCC-01 Integritet och etik (transparens, motstånd mot otillbörlig påverkan, regel- och syfteslojalitet) men lägger till systematisk uppföljning.'),
      ('C5', 'SCC-09', 'partial_overlap',     'Uppföljningsdelen av C5 överlappar SCC-09, facetten spårbar uppföljning.'),
      ('C6', 'SCC-06', 'broader_than_source', 'C6 bygger på SCC-06 Kommunikation och informationskvalitet (aktivt lyssnande, saklig tydlighet) men lägger till likvärdig behandling och förändringsledning.'),
      ('C6', 'SCC-12', 'partial_overlap',     'Förändringsdelen av C6 överlappar SCC-12 Lärandeorientering, facetten överföring.')
    ) AS t(pack_code, scc_code, relation, rationale)
  LOOP
    INSERT INTO public.scp_interview_pack_competency_map
      (pack_competency_id, competency_version_id, relation, mapping_state, rationale_sv)
    SELECT c.id, cv.id, _rec.relation, 'provisional', _rec.rationale
      FROM public.scp_interview_pack_competencies c,
           public.scp_competency_versions cv
      JOIN public.scp_competencies sc ON sc.id = cv.competency_id
     WHERE c.pack_version_id = _version_id
       AND c.code = _rec.pack_code
       AND sc.code = _rec.scc_code
       AND cv.version_number = 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCP_SM_SEED: could not pin % -> % version 1.', _rec.pack_code, _rec.scc_code;
    END IF;
  END LOOP;

  -- ---- the eight core questions, in fixed order --------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'behavioural',
       'Berätta om en gång då du behövde prioritera mellan flera säkerhetsåtgärder med begränsade resurser, och där ditt val fick betydelse för verksamheten.'),
      ('Q2', 2, 'behavioural',
       'Berätta om en situation där det var oklart vem som fick besluta om en säkerhetsfråga, och hur du hanterade det.'),
      ('Q3', 3, 'behavioural',
       'Berätta om en incident eller kris där du ledde hanteringen. Vad var läget, vad beslutade du, och hur avslutades den?'),
      ('Q4', 4, 'behavioural',
       'Berätta om en gång då du behövde få verksamheten, en annan funktion, en myndighet eller en leverantör att göra sin del av säkerhetsarbetet.'),
      ('Q5', 5, 'behavioural',
       'Berätta om en gång då du upptäckte att ett krav, en rutin eller ett beslut inte efterlevdes, och vad du gjorde med det.'),
      ('Q6', 6, 'behavioural',
       'Berätta om en medarbetare eller ett team vars arbetssätt du behövde förändra. Hur gick du till väga, och vad blev resultatet?'),
      ('Q7', 7, 'situational',
       'Ledningen ska besluta om nästa års säkerhetsbudget om två veckor. Du har en extern granskning med många fynd, en egen incidenthistorik som pekar åt ett annat håll, och tre chefer som var och en vill ha åtgärder i sitt område. Hur tar du fram ditt förslag?'),
      ('Q8', 8, 'situational',
       'Klockan 07.15 ringer platschefen på er största anläggning: ett av lagren står öppet, larmet har inte gått, och en person från nattskiftet svarar inte i telefon. Beskriv hur du leder hanteringen under de första två timmarna.')
    ) AS t(code, ord, qtype, prompt_sv)
  LOOP
    INSERT INTO public.scp_interview_core_questions
      (pack_version_id, code, display_order, question_type, prompt_sv, prompt_en,
       recommended_duration_min_minutes, recommended_duration_max_minutes,
       evidence_source_note_sv)
    VALUES (_version_id, _rec.code, _rec.ord, _rec.qtype, _rec.prompt_sv, NULL, 7, 10,
            'Kandidatens svar i denna intervju; separat från CV, test och Passport. En intervjuutsaga är självrapporterad evidens.');
  END LOOP;

  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 'C1', true),
      ('Q2', 'C2', true),
      ('Q3', 'C3', true),
      ('Q4', 'C4', true),
      ('Q5', 'C5', true),
      ('Q6', 'C6', true),
      ('Q7', 'C1', true),  ('Q7', 'C2', false), ('Q7', 'C4', false),
      ('Q8', 'C3', true),  ('Q8', 'C4', false), ('Q8', 'C5', false), ('Q8', 'C6', false)
    ) AS t(qcode, ccode, is_primary)
  LOOP
    INSERT INTO public.scp_interview_question_competencies (question_id, pack_competency_id, is_primary)
    SELECT q.id, c.id, _rec.is_primary
      FROM public.scp_interview_core_questions q,
           public.scp_interview_pack_competencies c
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode
       AND c.pack_version_id = _version_id AND c.code = _rec.ccode;
  END LOOP;

  -- ---- the eight general probes ------------------------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      (1, 'example',       'Kan du välja en specifik situation?'),
      (2, 'own_role',      'Vad var just ditt ansvar och mandat i den situationen?'),
      (3, 'exact_action',  'Vad gjorde du först, och vad gjorde du därefter?'),
      (4, 'reasoning',     'Vilket underlag vägde du in när du valde den vägen?'),
      (5, 'effect',        'Vad blev resultatet, och hur vet du det?'),
      (6, 'reflection',    'Vad lärde du dig, och vad skulle du göra annorlunda i dag?'),
      (7, 'neutral_check', 'Jag vill kontrollera att jag förstått: menar du att …?'),
      (8, 'correction',    'Är min sammanfattning korrekt, eller vill du ändra något?')
    ) AS t(ord, purpose, wording)
  LOOP
    INSERT INTO public.scp_interview_approved_probes
      (pack_version_id, question_id, purpose, purpose_provenance, wording_sv, display_order)
    VALUES (_version_id, NULL, _rec.purpose, 'derived_in_import', _rec.wording, _rec.ord);
  END LOOP;

  -- ---- question-specific probes ------------------------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'reasoning',    'Vilket underlag hade du om riskerna?'),
      ('Q1', 2, 'reasoning',    'Vad valde du bort, och hur sa du det?'),
      ('Q1', 3, 'own_role',     'Vem beslutade till slut, och vad var din del?'),
      ('Q1', 4, 'effect',       'Vad hände med den risk som inte prioriterades?'),
      ('Q1', 5, 'reflection',   'Skulle du prioritera likadant i dag?'),

      ('Q2', 1, 'reasoning',    'Hur tog du reda på var mandatet faktiskt låg?'),
      ('Q2', 2, 'exact_action', 'Vad klargjorde du, och för vem?'),
      ('Q2', 3, 'exact_action', 'Hur dokumenterades beslutsvägen efteråt?'),
      ('Q2', 4, 'own_role',     'Vad tog du själv ansvar för?'),
      ('Q2', 5, 'effect',       'Uppstod samma oklarhet igen?'),

      ('Q3', 1, 'reasoning',    'Vad visste du säkert, och vad antog du?'),
      ('Q3', 2, 'exact_action', 'Vilka beslutspunkter satte du, och när?'),
      ('Q3', 3, 'own_role',     'Vem samordnade du med, och vem beslutade vad?'),
      ('Q3', 4, 'exact_action', 'Hur gick återgången till normalläge till?'),
      ('Q3', 5, 'reflection',   'Vad kom fram i genomgången efteråt?'),

      ('Q4', 1, 'reasoning',    'Vad behövde den andra parten, som du förstod det?'),
      ('Q4', 2, 'exact_action', 'Hur klargjorde du vem som skulle göra vad?'),
      ('Q4', 3, 'exact_action', 'Vilken information delade du, och när?'),
      ('Q4', 4, 'own_role',     'Vad behöll du ansvaret för själv?'),
      ('Q4', 5, 'effect',       'Gjorde de sin del, och hur vet du det?'),

      ('Q5', 1, 'exact_action', 'Hur upptäckte du att det inte efterlevdes?'),
      ('Q5', 2, 'exact_action', 'Hur och till vem rapporterade du det?'),
      ('Q5', 3, 'reasoning',    'Fanns det något tryck att tona ner det? Hur hanterade du det?'),
      ('Q5', 4, 'exact_action', 'Vad ändrades i rutinen eller uppföljningen?'),
      ('Q5', 5, 'effect',       'Har det hänt igen?'),

      ('Q6', 1, 'reasoning',    'Vad hade du sagt om förväntningarna innan?'),
      ('Q6', 2, 'exact_action', 'Hur lyssnade du in deras bild av situationen?'),
      ('Q6', 3, 'exact_action', 'Hur gav du återkoppling, och på vad?'),
      ('Q6', 4, 'reasoning',    'Hur såg du till att alla behandlades likvärdigt?'),
      ('Q6', 5, 'effect',       'Vad blev resultatet, och hur följde du upp det?'),

      ('Q7', 1, 'reasoning',    'Hur väger du granskningen mot er egen incidenthistorik?'),
      ('Q7', 2, 'reasoning',    'Vad prioriterar du ner, och hur säger du det till de tre cheferna?'),
      ('Q7', 3, 'exact_action', 'Hur förankrar du förslaget innan mötet?'),
      ('Q7', 4, 'exact_action', 'Vad står i ditt förslag om den risk som inte får pengar?'),
      ('Q7', 5, 'own_role',     'Vad beslutar du själv, och vad lämnar du till ledningen?'),

      ('Q8', 1, 'reasoning',    'Vilka omedelbara risker identifierar du, i vilken ordning?'),
      ('Q8', 2, 'reasoning',    'Vilken information försöker du få innan du beslutar?'),
      ('Q8', 3, 'own_role',     'Vem gör vad under de första trettio minuterna?'),
      ('Q8', 4, 'exact_action', 'Vilka beslutspunkter sätter du, och vad utlöser eskalering?'),
      ('Q8', 5, 'exact_action', 'Vad rapporterar du till ledningen, och när?')
    ) AS t(qcode, ord, purpose, wording)
  LOOP
    INSERT INTO public.scp_interview_approved_probes
      (pack_version_id, question_id, purpose, purpose_provenance, wording_sv, display_order)
    SELECT _version_id, q.id, _rec.purpose, 'derived_in_import', _rec.wording, _rec.ord
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode;
  END LOOP;

  -- ---- evidence dimensions, five per question -----------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'underlag',               'Underlag om risk'),
      ('Q1', 2, 'avvagning',              'Redovisad avvägning'),
      ('Q1', 3, 'prioritet',              'Prioritet efter konsekvens'),
      ('Q1', 4, 'oppet_bortval',          'Öppet bortval'),
      ('Q1', 5, 'resultat_reflektion',    'Resultat/reflektion'),

      ('Q2', 1, 'mandatanalys',           'Mandatanalys'),
      ('Q2', 2, 'klargorande',            'Klargörande'),
      ('Q2', 3, 'dokumentation',          'Dokumenterad beslutsväg'),
      ('Q2', 4, 'agarskap',               'Ägarskap'),
      ('Q2', 5, 'uppfoljning',            'Uppföljning'),

      ('Q3', 1, 'lagesbild',              'Lägesbild: bekräftat/antaget'),
      ('Q3', 2, 'beslutspunkter',         'Beslutspunkter'),
      ('Q3', 3, 'samordning',             'Samordning av resurser'),
      ('Q3', 4, 'atergang',               'Kontrollerad återgång'),
      ('Q3', 5, 'genomgang',              'Genomgång/lärande'),

      ('Q4', 1, 'behovsbild',             'Behovsbild'),
      ('Q4', 2, 'rollklarhet',            'Rollklarhet'),
      ('Q4', 3, 'informationsdelning',    'Informationsdelning'),
      ('Q4', 4, 'gemensam_losning',       'Gemensam lösning'),
      ('Q4', 5, 'behallet_ansvar',        'Behållet ansvar/resultat'),

      ('Q5', 1, 'upptackt',               'Upptäckt'),
      ('Q5', 2, 'saklig_rapportering',    'Saklig rapportering'),
      ('Q5', 3, 'motstand_mot_paverkan',  'Motstånd mot påverkan'),
      ('Q5', 4, 'atgard',                 'Åtgärd'),
      ('Q5', 5, 'forandrad_rutin',        'Förändrad rutin'),

      ('Q6', 1, 'forvantningar',          'Tydliga förväntningar'),
      ('Q6', 2, 'lyssnande',              'Lyssnande'),
      ('Q6', 3, 'aterkoppling',           'Återkoppling på handling'),
      ('Q6', 4, 'likvardighet',           'Likvärdig behandling'),
      ('Q6', 5, 'resultat_uppfoljning',   'Resultat/uppföljning'),

      ('Q7', 1, 'underlagssyntes',        'Underlagssyntes'),
      ('Q7', 2, 'riskprioritering',       'Riskprioritering'),
      ('Q7', 3, 'oppet_bortval',          'Öppet bortval'),
      ('Q7', 4, 'forankring',             'Förankring'),
      ('Q7', 5, 'dokumenterat_forslag',   'Dokumenterat förslag'),

      ('Q8', 1, 'omedelbar_sakerhet',     'Omedelbar säkerhet för människor'),
      ('Q8', 2, 'informationsinhamtning', 'Informationsinhämtning'),
      ('Q8', 3, 'beslutspunkter',         'Beslutspunkter/eskalering'),
      ('Q8', 4, 'samordning',             'Samordning'),
      ('Q8', 5, 'lagesrapport',           'Lägesrapport')
    ) AS t(qcode, ord, code, label)
  LOOP
    INSERT INTO public.scp_interview_evidence_dimensions
      (question_id, code, label_sv, display_order)
    SELECT q.id, _rec.code, _rec.label, _rec.ord
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode;
  END LOOP;

  -- ---- behavioural anchors, levels 1-4 per question -----------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      ('Q1', 1, 'Riskfyllt/otillräckligt',   'Prioriterar efter påtryckning eller synlighet; kan inte säga vilken risk en åtgärd minskar; bortval sägs inte.'),
      ('Q1', 2, 'Grundläggande/ojämnt',      'Har ett underlag men avvägningen är begränsad eller implicit; bortvalet är otydligt eller sägs inte till berörda.'),
      ('Q1', 3, 'Effektivt och säkert',      'Prioriterar efter skyddsvärde och konsekvens med redovisat underlag, säger öppet vad som inte prioriteras och följer upp den kvarstående risken.'),
      ('Q1', 4, 'Mycket starkt/systematiskt','Ställer flera underlag mot varandra, gör avvägningen begriplig för dem som inte får resurser, bygger in omprövning och delar lärande.'),

      ('Q2', 1, 'Riskfyllt/otillräckligt',   'Beslutar utanför mandat eller låter frågan ligga; oklarheten består.'),
      ('Q2', 2, 'Grundläggande/ojämnt',      'Löser den enskilda frågan men klargör inte mandatet framåt; dokumentation eller uppföljning saknas.'),
      ('Q2', 3, 'Effektivt och säkert',      'Tar reda på var mandatet ligger, klargör det för berörda, dokumenterar beslutsvägen och tar ansvar för sin del.'),
      ('Q2', 4, 'Mycket starkt/systematiskt','Designar mandat och beslutsvägar så att oklarheten inte uppstår igen, förankrar dem och följer upp att de används.'),

      ('Q3', 1, 'Riskfyllt/otillräckligt',   'Agerar på antagande, saknar lägesbild eller beslutspunkter; springer själv i stället för att leda; ingen genomgång.'),
      ('Q3', 2, 'Grundläggande/ojämnt',      'Leder hanteringen men skiljer inte bekräftat från antaget, samordningen är otydlig eller återgången oplanerad.'),
      ('Q3', 3, 'Effektivt och säkert',      'Skapar en lägesbild, sätter beslutspunkter, samordnar resurser, återgår kontrollerat och håller en genomgång.'),
      ('Q3', 4, 'Mycket starkt/systematiskt','Håller lägesbilden levande, definierar eskaleringströsklar i förväg, avlastar sig själv medvetet och omsätter genomgången i ändrade rutiner.'),

      ('Q4', 1, 'Riskfyllt/otillräckligt',   'Agerar ensam eller lämnar ifrån sig ansvaret; pekar på andra; ingen gemensam lösning.'),
      ('Q4', 2, 'Grundläggande/ojämnt',      'Får till samverkan i sak men rollklarhet, informationsdelning eller uppföljning är begränsad.'),
      ('Q4', 3, 'Effektivt och säkert',      'Klargör vem som gör vad, delar det andra behöver, löser problemet gemensamt och behåller ansvaret för resultatet.'),
      ('Q4', 4, 'Mycket starkt/systematiskt','Bygger samverkan som håller efter händelsen: avtal, kontaktvägar och gemensamma rutiner, med bevarad relation och styrning.'),

      ('Q5', 1, 'Riskfyllt/otillräckligt',   'Accepterar, döljer eller tonar ner en avvikelse; rapporterar selektivt; ingen ändring.'),
      ('Q5', 2, 'Grundläggande/ojämnt',      'Rapporterar avvikelsen men sent, ofullständigt eller utan åtgärd; hanterar påtryckning osäkert.'),
      ('Q5', 3, 'Effektivt och säkert',      'Upptäcker, rapporterar sakligt och i tid, står emot påtryckning, åtgärdar och ändrar rutinen.'),
      ('Q5', 4, 'Mycket starkt/systematiskt','Rapporterar egna brister i samma form som andras, bygger uppföljning som upptäcker avvikelser tidigt och gör det tryggt för andra att rapportera.'),

      ('Q6', 1, 'Riskfyllt/otillräckligt',   'Bedömer utan att ha sagt vad som gäller, lyssnar inte, behandlar personer olika eller ger återkoppling på person snarare än handling.'),
      ('Q6', 2, 'Grundläggande/ojämnt',      'Genomför förändringen men förväntningar, lyssnande eller uppföljning är begränsade; resultatet beror delvis på andra.'),
      ('Q6', 3, 'Effektivt och säkert',      'Säger vad som förväntas, lyssnar in teamets bild, ger återkoppling på handling, behandlar likvärdigt och följer upp resultatet.'),
      ('Q6', 4, 'Mycket starkt/systematiskt','Gör teamet delaktigt i lösningen, mäter förändringen, justerar sitt eget arbetssätt utifrån återkoppling och beskriver utfallet nyanserat.'),

      ('Q7', 1, 'Riskfyllt/otillräckligt',   'Följer ett underlag eller en chef rakt av; kan inte säga vad som prioriteras ner eller varför.'),
      ('Q7', 2, 'Grundläggande/ojämnt',      'Väger underlagen men förankring, öppet bortval eller dokumentation är begränsad.'),
      ('Q7', 3, 'Effektivt och säkert',      'Ställer granskning mot egen historik, prioriterar efter konsekvens, säger öppet vad som inte får resurser, förankrar och dokumenterar förslaget.'),
      ('Q7', 4, 'Mycket starkt/systematiskt','Gör avvägningen begriplig för alla tre cheferna, bygger in omprövning under året och skiljer eget beslut från ledningens.'),

      ('Q8', 1, 'Riskfyllt/otillräckligt',   'Antar det värsta eller det bästa utan att ta reda på; glömmer personen som inte svarar; ingen lägesrapport.'),
      ('Q8', 2, 'Grundläggande/ojämnt',      'Prioriterar personen och lagret men beslutspunkter, samordning eller rapportering är ofullständig.'),
      ('Q8', 3, 'Effektivt och säkert',      'Sätter människors säkerhet först, hämtar information, fördelar uppgifter, sätter beslutspunkter för eskalering och rapporterar läget i tid.'),
      ('Q8', 4, 'Mycket starkt/systematiskt','Bygger en sammanhängande plan med reservvägar, fortlöpande lägesbild, definierade eskaleringströsklar och en planerad genomgång, utan att exponera sig själv eller andra i onödan.')
    ) AS t(qcode, lvl, label, anchor)
  LOOP
    INSERT INTO public.scp_interview_rating_anchors
      (question_id, level, label_sv, anchor_sv, counts_toward_aggregation, is_safety_critical)
    SELECT q.id, _rec.lvl, _rec.label, _rec.anchor, true, (_rec.lvl = 1)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _version_id AND q.code = _rec.qcode;
  END LOOP;

  INSERT INTO public.scp_interview_rating_anchors
    (question_id, level, label_sv, anchor_sv, counts_toward_aggregation, is_safety_critical)
  SELECT q.id, 0, 'Otillräcklig evidens',
         'Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.',
         false, false
    FROM public.scp_interview_core_questions q
   WHERE q.pack_version_id = _version_id;

  -- ---- verification boundaries -------------------------------------------
  FOR _rec IN
    SELECT * FROM (VALUES
      (1, 'ledningserfarenhet', 'Erfarenhet av att leda säkerhetsarbete eller personal',
       ARRAY['verified','candidate_declared','partial']::text[],
       'Klargör faktisk roll, mandat och ansvar genom beteendeexempel; fråga inte om redan verifierad fakta.',
       'Arbetsgivar- eller referenskontroll efter information och tillämpligt samtycke.',
       'Anställningsfakta i Passport är kandidatens att dela. En intervjuutsaga blir aldrig automatiskt verifierad Passport-evidens.'),
      (2, 'sakerhetsskyddsuppdrag', 'Uppdrag eller utbildning inom säkerhetsskydd',
       ARRAY['verified','candidate_declared','no_evidence_yet']::text[],
       'Fråga endast om det är ett dokumenterat jobbkrav; klargör vad uppdraget faktiskt innefattade.',
       'Kontroll enligt arbetsgivarens lagliga process. Säkerhetsprövning är en separat process utanför intervjun.',
       'Passport kan visa verifierad utbildning om kandidaten delar den för ändamålet. Intervjun skriver aldrig till Passport.'),
      (3, 'budget_personalansvar', 'Budget- och personalansvar',
       ARRAY['candidate_declared','partial']::text[],
       'Använd fråga 1 och 6; sök konkreta exempel på beslut och uppföljning.',
       'Arbetsgivar- eller referenskontroll om rollen kräver det.',
       'Ingen Passport-koppling. Ansvarsomfattning är inte en verifierbar merit i Passport.'),
      (4, 'certifiering', 'Relevant certifiering (till exempel inom säkerhetsledning)',
       ARRAY['verified','candidate_declared']::text[],
       'Bedöm endast dokumenterat jobbkrav; en certifiering bevisar inte arbetsprestation.',
       'Godkänd kontroll mot utfärdaren.',
       'Verifierad certifiering i Passport visar att ett formellt krav är styrkt; den bevisar inte automatiskt kompetens i rollen.'),
      (5, 'myndighetssamverkan', 'Erfarenhet av samverkan med myndigheter',
       ARRAY['candidate_declared','no_evidence_yet']::text[],
       'Använd fråga 4 utan att kräva uppgifter som omfattas av sekretess.',
       'Ingen verifiering av sekretessbelagda kontakter; bedöm endast jobbrelevant redogörelse.',
       'Ingen Passport-koppling.')
    ) AS t(ord, code, requirement, states, action, subsequent, boundary)
  LOOP
    INSERT INTO public.scp_interview_verification_rules
      (pack_version_id, code, requirement_sv, permitted_source_states,
       interview_action_sv, subsequent_verification_sv, passport_boundary_sv, display_order)
    VALUES (_version_id, _rec.code, _rec.requirement, _rec.states,
            _rec.action, _rec.subsequent, _rec.boundary, _rec.ord);
  END LOOP;

  -- ---- prohibited areas: the same fourteen as the operational pack --------
  FOR _rec IN
    SELECT * FROM (VALUES
      (1,  'capability', 'ingen_logndetektion',
       'Ingen lögndetektor, trovärdighetsbedömning eller bedrägeriskattning.',
       'Trovärdighet är inte mätbar i en anställningsintervju och en sådan bedömning saknar rättssäkert stöd.'),
      (2,  'capability', 'ingen_biometrisk_analys',
       'Ingen analys av ansikte, blick, röst, känsloläge eller stressnivå.',
       'Sådan analys mäter inte jobbrelevant beteende och skulle straffa nervositet, funktionsnedsättning och språkvariation.'),
      (3,  'inference',  'ingen_personlighetstolkning',
       'Ingen personlighetstolkning, ledarstilstypning eller culture fit-modell.',
       'Paketet bedömer beskrivna handlingar mot ankare, inte vem kandidaten antas vara.'),
      (4,  'inference',  'inga_skyddade_egenskaper',
       'Ingen slutsats om skyddade egenskaper från språk, brytning, namn, bild eller beteende.',
       'Otillåtet och irrelevant för arbetet.'),
      (5,  'inference',  'nervositet_far_inte_sanka',
       'Nervositet, tystnad, språkvariation, funktionsnedsättning eller begärd anpassning får aldrig sänka bedömningen.',
       'Dessa är egenskaper hos intervjusituationen, inte evidens om yrkesutövning.'),
      (6,  'capability', 'ingen_totalpoang',
       'Ingen automatisk totalpoäng, viktning, rangordning eller anställningsrekommendation.',
       'Pilotens mål är innehållsvaliditet, bedömaröverensstämmelse och processkvalitet.'),
      (7,  'capability', 'ingen_ai_poangsattning',
       'AI får markera evidensgap men aldrig poängsätta, rangordna eller rekommendera anställning.',
       'AI förbereder, extraherar, strukturerar och föreslår. Människan verifierar, bedömer och beslutar.'),
      (8,  'capability', 'ingen_fri_ai_fraga',
       'AI får inte skriva om eller ersätta kärnfrågorna, och får inte generera följdfrågor utanför de godkända.',
       'Likvärdighet mellan kandidater kräver samma åtta frågor i samma ordning och endast godkända följdfrågor.'),
      (9,  'capability', 'ingen_passport_skrivning',
       'Intervjuuppgifter överförs aldrig automatiskt till Security Passport.',
       'En intervjuutsaga är självrapporterad evidens och blir inte verifierad fakta genom att sägas.'),
      (10, 'probe_practice', 'inga_ledande_fragor',
       'Ledande följdfrågor är inte tillåtna, till exempel "Du eskalerade väl direkt till ledningen?".',
       'En ledande fråga skapar det svar den påstår sig mäta.'),
      (11, 'probe_practice', 'inga_anklagande_fragor',
       'Anklagande följdfrågor före klarlagda fakta är inte tillåtna, till exempel "Varför följde du inte upp det?".',
       'PEACE kräver fri redogörelse före prövning.'),
      (12, 'probe_practice', 'inga_trovardighetsfragor',
       'Trovärdighetsbedömande kommentarer är inte tillåtna, till exempel "Det låter inte sant.".',
       'Se ingen_logndetektion.'),
      (13, 'topic', 'inga_irrelevanta_personuppgifter',
       'Skyddade eller irrelevanta personuppgifter utan tydlig koppling till arbetet får inte efterfrågas.',
       'Endast dokumenterade jobbkrav är legitima frågeområden.'),
      (14, 'topic', 'inga_sekretessbelagda_uppgifter',
       'Sekretessbelagda uppgifter från tidigare arbetsgivare eller myndighetskontakter får inte efterfrågas eller premieras.',
       'Ett svar som röjer skyddad information är evidens om bristande informationshantering, inte om erfarenhet.')
    ) AS t(ord, atype, code, statement, rationale)
  LOOP
    INSERT INTO public.scp_interview_prohibited_areas
      (pack_version_id, area_type, code, statement_sv, rationale_sv, display_order)
    VALUES (_version_id, _rec.atype, _rec.code, _rec.statement, _rec.rationale, _rec.ord);
  END LOOP;

  -- ---- stamp the content hash and record the import -----------------------
  _hash := public.scp_interview_pack_content_hash(_version_id);

  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions
     SET content_hash = _hash WHERE id = _version_id;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM public.scp_interview_record_event(
    _pack_id, NULL, 'pack_created', NULL, NULL,
    'Granskningsförslag: CQrityjob Säkerhetschef Role Interview Pack v0.1 (utkast).', NULL,
    jsonb_build_object('slug', 'security-manager-se', 'imported_by', 'migration 20261216090000'));

  PERFORM public.scp_interview_record_event(
    _pack_id, _version_id, 'version_created', NULL, 'draft',
    'Pilothypotes i utkast. Ej granskad, ej validerad, ej öppnad för pilot. Publicering eller öppen pilot kräver dokumenterade granskningsgrindar och ett uttryckligt ägarbeslut.',
    _hash,
    jsonb_build_object(
      'version_number', 1,
      'validation_label', 'pilot_hypothesis',
      'source_document_version', 'v0.1 (2026-09-26, utkast)',
      'competency_mapping_state', 'provisional',
      'pilot_availability', 'restricted'));

  RAISE NOTICE 'SCP_SM_SEED: security-manager-se v1 authored as draft/pilot_hypothesis/restricted, content_hash=%', _hash;
END
$seed$;

-- ---------------------------------------------------------------------------
-- 7b. The prohibitions bind every AI task -- fail closed, as 20260921090000
-- made the rule: an unwired prohibition reads as permission from the engine's
-- side. The fourteen areas of this pack get the same complete "restricts"
-- relation as the operational pack's (14 x 11 = 154 more knowledge edges),
-- structurally derived, never a judgement about which binds which.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, assurance, note)
SELECT 'prohibited_area', a.id, 'restricts', 'ai_task', t.id, 'structurally_derived',
       'Fail-closed: every governed prohibition binds every AI task unless an '
       'explicit, reviewed narrowing says otherwise.'
  FROM public.scp_interview_prohibited_areas a
  JOIN public.scp_interview_pack_versions v ON v.id = a.pack_version_id
  JOIN public.scp_interview_packs p ON p.id = v.pack_id
 CROSS JOIN public.scp_ai_tasks t
 WHERE p.slug = 'security-manager-se'
   AND NOT EXISTS (
   SELECT 1 FROM public.scp_intel_edges e
    WHERE e.relation = 'restricts' AND e.from_id = a.id AND e.to_id = t.id);

DO $coverage$
DECLARE _n integer; _areas integer; _tasks integer;
BEGIN
  SELECT count(*) INTO _areas FROM public.scp_interview_prohibited_areas;
  SELECT count(*) INTO _tasks FROM public.scp_ai_tasks;
  SELECT count(*) INTO _n FROM public.scp_intel_edges WHERE relation = 'restricts';
  IF _n <> _areas * _tasks THEN
    RAISE EXCEPTION
      'SCP_SM_ASSERT: prohibition coverage is incomplete -- % edges for % areas x % tasks.',
      _n, _areas, _tasks;
  END IF;
  RAISE NOTICE 'SCP_SM_SEED: prohibition graph complete -- % areas x % tasks = % restricts edges.',
    _areas, _tasks, _n;
END
$coverage$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. The library setup: the strategic role profile and its content link
--
-- The trigger scp_guard_recruitment_content_link refuses a guide that is not
-- a role-interview pack of this role, and a test that is not a definition of
-- the role's profession. Both are, by construction above.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_recruitment_role_profiles (role_profile, role_group, role_id)
SELECT 'security_manager', 'strategic', p.role_id
  FROM public.scp_interview_packs p WHERE p.slug = 'security-manager-se'
ON CONFLICT (role_profile) DO NOTHING;

INSERT INTO public.scp_recruitment_content_links (role_profile, environment, interview_pack_id, assessment_definition_id)
SELECT 'security_manager', 'general', p.id,
       (SELECT d.id FROM public.scp_assessment_definitions d WHERE d.slug = 'security-manager-recruitment')
  FROM public.scp_interview_packs p
 WHERE p.slug = 'security-manager-se'
   AND EXISTS (SELECT 1 FROM public.scp_recruitment_role_profiles WHERE role_profile = 'security_manager')
ON CONFLICT (role_profile, environment) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Proof
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _obs int; _self int; _blocks int; _langs int; _ungated int; _rub int;
BEGIN
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE f.slug = 'security-manager-recruitment-form-a';
  IF _n <> 37 THEN
    RAISE EXCEPTION 'SCP_SM_ITEM_COUNT: expected 37 items on the form, found %.', _n;
  END IF;

  SELECT count(*) FILTER (WHERE iv.evidence_source_type = 'assessment_response'),
         count(*) FILTER (WHERE iv.evidence_source_type = 'self_report')
    INTO _obs, _self
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-manager-recruitment-form-a';
  IF _obs <> 21 OR _self <> 16 THEN
    RAISE EXCEPTION 'SCP_SM_EVIDENCE_SPLIT: expected 21 observed and 16 self-report items, found % and %.', _obs, _self;
  END IF;

  SELECT count(*) INTO _blocks FROM public.scp_form_blocks b
    JOIN public.scp_forms f ON f.id = b.form_id
   WHERE f.slug = 'security-manager-recruitment-form-a';
  IF _blocks <> 5 THEN
    RAISE EXCEPTION 'SCP_SM_BLOCKS: expected 5 declared sections, found %.', _blocks;
  END IF;

  SELECT count(*) INTO _langs
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE f.slug = 'security-manager-recruitment-form-a'
     AND (SELECT count(DISTINCT t.language) FROM public.scp_item_texts t
           WHERE t.item_version_id = fi.item_version_id) <> 2;
  IF _langs > 0 THEN
    RAISE EXCEPTION 'SCP_SM_LANGUAGE_GAP: % item(s) are not present in both sv-SE and en-GB.', _langs;
  END IF;

  SELECT count(*) INTO _langs
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_options o ON o.item_version_id = fi.item_version_id
   WHERE f.slug = 'security-manager-recruitment-form-a'
     AND (SELECT count(DISTINCT ot.language) FROM public.scp_item_option_texts ot
           WHERE ot.item_option_id = o.id) <> 2;
  IF _langs > 0 THEN
    RAISE EXCEPTION 'SCP_SM_OPTION_LANGUAGE_GAP: % option(s) are not present in both languages.', _langs;
  END IF;

  -- Every constructed response has a rubric, or a reviewer would be refused
  -- at the end of their reading (20260903120000 records that failure).
  SELECT count(*) INTO _rub
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-manager-recruitment-form-a'
     AND iv.item_format = 'constructed_response'
     AND NOT EXISTS (SELECT 1 FROM public.scp_rubric_versions rv WHERE rv.item_version_id = iv.id);
  IF _rub > 0 THEN
    RAISE EXCEPTION 'SCP_SM_NO_RUBRIC: % constructed response(s) have no rubric.', _rub;
  END IF;

  -- Governance honesty: nothing here may claim review it has not had.
  SELECT count(*) INTO _ungated
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-manager-recruitment-form-a'
     AND (iv.content_status <> 'draft' OR iv.validation_status <> 'design'
       OR NOT iv.authored_by_ai
       OR (SELECT count(*) FROM public.scp_review_requirements rr
            WHERE rr.item_version_id = iv.id AND rr.status = 'outstanding') <> 5);
  IF _ungated > 0 THEN
    RAISE EXCEPTION 'SCP_SM_GOVERNANCE_CLAIM: % item(s) do not carry draft status, AI authorship and five outstanding review gates.', _ungated;
  END IF;

  -- Never the operational content renamed: no item, form or rubric is shared.
  IF EXISTS (
    SELECT 1 FROM public.scp_form_items a
      JOIN public.scp_forms fa ON fa.id = a.form_id AND fa.slug = 'security-manager-recruitment-form-a'
      JOIN public.scp_form_items b ON b.item_version_id = a.item_version_id
      JOIN public.scp_forms fb ON fb.id = b.form_id AND fb.slug <> fa.slug) THEN
    RAISE EXCEPTION 'SCP_SM_SHARED_ITEM: the strategic form shares an item with another form.';
  END IF;

  -- NOT ACTIVATED, either switch.
  IF EXISTS (SELECT 1 FROM public.scp_assessment_definitions d
              WHERE d.slug = 'security-manager-recruitment' AND d.standard_for_recruitment) THEN
    RAISE EXCEPTION 'SCP_SM_ACTIVATED: the strategic test must not be designated by its content migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_interview_pack_versions v
              JOIN public.scp_interview_packs p ON p.id = v.pack_id
             WHERE p.slug = 'security-manager-se'
               AND (v.pilot_availability <> 'restricted' OR v.content_status <> 'draft'
                    OR v.validation_label <> 'pilot_hypothesis' OR v.content_hash IS NULL)) THEN
    RAISE EXCEPTION 'SCP_SM_ACTIVATED: the strategic guide must be a restricted draft pilot hypothesis with a content hash.';
  END IF;

  -- The library setup points at exactly this content, and the operational
  -- setup is untouched.
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_recruitment_content_links l
      JOIN public.scp_recruitment_role_profiles rp ON rp.role_profile = l.role_profile
      JOIN public.scp_interview_packs p ON p.id = l.interview_pack_id
      JOIN public.scp_assessment_definitions d ON d.id = l.assessment_definition_id
     WHERE l.role_profile = 'security_manager' AND rp.role_group = 'strategic'
       AND l.environment = 'general'
       AND p.slug = 'security-manager-se' AND d.slug = 'security-manager-recruitment') THEN
    RAISE EXCEPTION 'SCP_SM_LINK: the strategic role profile is not linked to its own guide and test.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_recruitment_content_links l
      JOIN public.scp_interview_packs p ON p.id = l.interview_pack_id
      JOIN public.scp_assessment_definitions d ON d.id = l.assessment_definition_id
     WHERE l.role_profile = 'vaktare' AND l.environment = 'general'
       AND p.slug = 'vaktare-se' AND d.slug = 'security-officer-recruitment') THEN
    RAISE EXCEPTION 'SCP_SM_LINK: the operational setup changed.';
  END IF;

  -- The pack is complete in the Väktare format.
  SELECT count(*) INTO _n FROM public.scp_interview_core_questions q
    JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se';
  IF _n <> 8 THEN RAISE EXCEPTION 'SCP_SM_PACK: expected 8 questions, found %.', _n; END IF;
  SELECT count(*) INTO _n FROM public.scp_interview_rating_anchors a
    JOIN public.scp_interview_core_questions q ON q.id = a.question_id
    JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se';
  IF _n <> 40 THEN RAISE EXCEPTION 'SCP_SM_PACK: expected 40 anchors (5 per question), found %.', _n; END IF;
  SELECT count(*) INTO _n FROM public.scp_interview_evidence_dimensions e
    JOIN public.scp_interview_core_questions q ON q.id = e.question_id
    JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se';
  IF _n <> 40 THEN RAISE EXCEPTION 'SCP_SM_PACK: expected 40 evidence dimensions, found %.', _n; END IF;

  -- Nothing here earned an operational selection basis.
  IF EXISTS (SELECT 1 FROM public.scp_purpose_versions
              WHERE purpose_code = 'selection_support'
                AND published_at IS NOT NULL AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'SCP_SM_PURPOSE: selection_support became published.';
  END IF;

  RAISE NOTICE 'security-manager-recruitment proven: 37 items (21 observed / 16 self-reported), 5 sections, bilingual, 3 rubrics, all gates outstanding, NOT designated; security-manager-se pack v1 draft/restricted, linked as the strategic setup';
END $$;
