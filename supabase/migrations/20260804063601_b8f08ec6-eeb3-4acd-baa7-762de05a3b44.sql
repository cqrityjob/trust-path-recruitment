-- Security Competence Academy — Phase 1d: Security Guard programme, DRAFT ONLY.

ALTER TABLE public.scp_assessment_definitions
  DROP CONSTRAINT IF EXISTS scp_definition_profession_matches_purpose;
ALTER TABLE public.scp_assessment_definitions
  ADD CONSTRAINT scp_definition_profession_matches_purpose CHECK (
    (purpose = 'core' AND profession_id IS NULL)
    OR (purpose = 'profession_module' AND profession_id IS NOT NULL)
    OR (purpose = 'development_programme')
  );

INSERT INTO public.scp_roles (slug, profession_id)
SELECT 'security-guard-se', p.id FROM public.scp_professions p WHERE p.slug = 'security-officer-se'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_role_versions
  (role_id, version_number, jurisdiction_id, content_status,
   name_sv, name_en, description_sv, description_en)
SELECT r.id, 1, j.id, 'draft',
  'Väktare', 'Security Guard',
  'Operativ väktarroll inom svensk bevakningsverksamhet. Utvecklingsinriktad — beskriver arbetsuppgifter, inte formell auktorisation.',
  'Operational security guard role in Swedish contract security. Development-oriented — describes work, not formal authorisation.'
FROM public.scp_roles r, public.scp_jurisdictions j
WHERE r.slug = 'security-guard-se' AND j.code = 'SE'
ON CONFLICT (role_id, version_number) DO NOTHING;

INSERT INTO public.scp_programs (slug, role_id)
SELECT 'security-guard-operational-development', r.id
FROM public.scp_roles r WHERE r.slug = 'security-guard-se'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_program_versions
  (program_id, version_number, jurisdiction_id, content_status, validation_status,
   name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
SELECT p.id, 1, j.id, 'draft', 'design',
  'Väktare – Operativt säkerhetsutvecklingsprogram',
  'Security Guard – Operational Security Development Programme',
  'Kartlägger och utvecklar operativ säkerhetskompetens hos befintlig personal. Resultatet är utvecklingsinriktat och används aldrig för urval, rangordning eller anställningsbeslut.',
  'Maps and develops operational security competence in existing personnel. The result is development-oriented and is never used for selection, ranking or employment decisions.',
  ARRAY['personlighet','ärlighet som personlighetsdrag','emotionell stabilitet',
        'faktisk arbetsprestation','verklig stresstålighet','motivation',
        'framtida arbetsprestation','fysisk förmåga','formell auktorisation','laglig behörighet'],
  ARRAY['personality','honesty as a stable trait','emotional stability',
        'actual workplace performance','real-world stress tolerance','motivation',
        'future job performance','physical capability','formal authorisation','legal eligibility']
FROM public.scp_programs p, public.scp_jurisdictions j
WHERE p.slug = 'security-guard-operational-development' AND j.code = 'SE'
ON CONFLICT (program_id, version_number) DO NOTHING;

INSERT INTO public.scp_modules (slug) VALUES
  ('sg-access-authorization'), ('sg-observation-deviation'),
  ('sg-conflict-deescalation'), ('sg-incident-response'),
  ('sg-reporting-documentation'), ('sg-ethics-responsibility')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_module_versions
  (module_id, program_version_id, version_number, display_order, content_status,
   name_sv, name_en, summary_sv, summary_en, estimated_minutes)
SELECT m.id, pv.id, 1, v.ord, 'draft', v.sv, v.en, v.sum_sv, v.sum_en, v.mins
FROM (VALUES
  ('sg-access-authorization', 1, 'Tillträde och behörighet', 'Access and authorization',
   'Kontroll av tillträde, behörighet och legitimering.', 'Controlling access, authorisation and identification.', 45),
  ('sg-observation-deviation', 2, 'Observation och avvikelsehantering', 'Observation and deviation management',
   'Att upptäcka, bedöma och hantera avvikelser.', 'Detecting, assessing and handling deviations.', 45),
  ('sg-conflict-deescalation', 3, 'Konfliktförebyggande och nedtrappning', 'Conflict prevention and de-escalation',
   'Att förebygga upptrappning och trappa ned verbalt.', 'Preventing escalation and de-escalating verbally.', 60),
  ('sg-incident-response', 4, 'Incidenthantering och första åtgärder', 'Incident response and first actions',
   'Prioritering och första åtgärder vid händelse.', 'Prioritisation and first actions during an incident.', 60),
  ('sg-reporting-documentation', 5, 'Rapportering och dokumentation', 'Reporting and documentation',
   'Saklig, spårbar rapportering.', 'Factual, traceable reporting.', 45),
  ('sg-ethics-responsibility', 6, 'Etik och yrkesansvar', 'Ethics and professional responsibility',
   'Mandat, integritet och informationshantering.', 'Mandate, integrity and information handling.', 45)
) AS v(slug, ord, sv, en, sum_sv, sum_en, mins)
JOIN public.scp_modules m ON m.slug = v.slug
JOIN public.scp_program_versions pv ON pv.version_number = 1
JOIN public.scp_programs p ON p.id = pv.program_id
 AND p.slug = 'security-guard-operational-development'
ON CONFLICT (module_id, version_number) DO NOTHING;

INSERT INTO public.scp_observable_behaviours (slug) VALUES
  ('situational_judgement'), ('proportional_decision_making'),
  ('mandate_and_escalation'), ('operational_communication'),
  ('de_escalation'), ('factual_reporting'),
  ('integrity_and_information_handling'), ('operational_coordination')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_behaviour_versions
  (behaviour_id, version_number, content_status, statement_sv, statement_en,
   positive_indicators_sv, contraindications_sv, is_safety_critical)
SELECT b.id, 1, 'draft', v.sv, v.en, v.pos, v.contra, v.safety
FROM (VALUES
  ('situational_judgement',
   'Bedömer situationen utifrån det som faktiskt observeras innan hen agerar.',
   'Assesses the situation from what is actually observed before acting.',
   ARRAY['Skiljer iakttagelse från antagande','Samlar tillräckligt underlag först'],
   ARRAY['Agerar på antagande','Ignorerar motstridiga iakttagelser'], false),
  ('proportional_decision_making',
   'Väljer den minst ingripande åtgärd som löser situationen.',
   'Chooses the least intrusive action that resolves the situation.',
   ARRAY['Trappar upp stegvis','Motiverar vald åtgärd'],
   ARRAY['Överdriven åtgärd','Ingriper utan behov'], true),
  ('mandate_and_escalation',
   'Håller sig inom sitt mandat och eskalerar när gränsen nås.',
   'Stays within mandate and escalates when the limit is reached.',
   ARRAY['Känner igen gränsen för egen befogenhet','Kallar rätt instans i tid'],
   ARRAY['Agerar utanför mandat','Dröjer med eskalering'], true),
  ('operational_communication',
   'Förmedlar tydlig och verifierbar information till rätt mottagare.',
   'Conveys clear, verifiable information to the right recipient.',
   ARRAY['Kort och entydigt','Bekräftar mottagen information'],
   ARRAY['Otydlig lägesbild','Utelämnar väsentligt'], false),
  ('de_escalation',
   'Sänker spänningsnivån verbalt innan situationen trappas upp.',
   'Lowers tension verbally before a situation escalates.',
   ARRAY['Skapar utrymme','Bibehåller lugnt bemötande'],
   ARRAY['Provocerar','Trappar upp i onödan'], true),
  ('factual_reporting',
   'Rapporterar det som observerats, skilt från egen tolkning.',
   'Reports what was observed, separated from interpretation.',
   ARRAY['Skiljer fakta från slutsats','Tidsanger korrekt'],
   ARRAY['Blandar tolkning med iakttagelse','Utelämnar obekväma detaljer'], false),
  ('integrity_and_information_handling',
   'Hanterar känslig information enligt uppdrag och regelverk.',
   'Handles sensitive information according to mandate and rules.',
   ARRAY['Delar endast med behöriga','Dokumenterar åtkomst'],
   ARRAY['Delar utanför behörighet','Använder information privat'], true),
  ('operational_coordination',
   'Samordnar egna åtgärder med kollegor och andra funktioner.',
   'Coordinates own actions with colleagues and other functions.',
   ARRAY['Meddelar position och avsikt','Undviker dubbelarbete'],
   ARRAY['Agerar ensam utan samordning'], false)
) AS v(slug, sv, en, pos, contra, safety)
JOIN public.scp_observable_behaviours b ON b.slug = v.slug
ON CONFLICT (behaviour_id, version_number) DO NOTHING;

INSERT INTO public.scp_behaviour_competency_map
  (behaviour_version_id, competency_version_id, weight, is_primary)
SELECT bv.id, cv.id, 1.000, true
FROM (VALUES
  ('situational_judgement',              'SCC-03'),
  ('proportional_decision_making',       'SCC-04'),
  ('mandate_and_escalation',             'SCC-09'),
  ('operational_communication',          'SCC-06'),
  ('de_escalation',                      'SCC-05'),
  ('factual_reporting',                  'SCC-11'),
  ('integrity_and_information_handling', 'SCC-01'),
  ('operational_coordination',           'SCC-08')
) AS v(behaviour_slug, competency_code)
JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
JOIN public.scp_competencies c ON c.code = v.competency_code
JOIN public.scp_competency_versions cv ON cv.competency_id = c.id AND cv.version_number = 1
ON CONFLICT (behaviour_version_id, competency_version_id) DO NOTHING;

INSERT INTO public.scp_role_competency_map (role_version_id, competency_version_id, criticality)
SELECT rv.id, cv.id, 'core'
FROM public.scp_role_versions rv
JOIN public.scp_roles r ON r.id = rv.role_id AND r.slug = 'security-guard-se'
JOIN public.scp_competencies c ON c.code IN
  ('SCC-01','SCC-03','SCC-04','SCC-05','SCC-06','SCC-08','SCC-09','SCC-11')
JOIN public.scp_competency_versions cv ON cv.competency_id = c.id AND cv.version_number = 1
WHERE rv.version_number = 1
ON CONFLICT (role_version_id, competency_version_id) DO NOTHING;

INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
SELECT mv.id, bv.id
FROM (VALUES
  ('sg-access-authorization',    'mandate_and_escalation'),
  ('sg-access-authorization',    'integrity_and_information_handling'),
  ('sg-observation-deviation',   'situational_judgement'),
  ('sg-observation-deviation',   'operational_coordination'),
  ('sg-conflict-deescalation',   'de_escalation'),
  ('sg-conflict-deescalation',   'proportional_decision_making'),
  ('sg-incident-response',       'proportional_decision_making'),
  ('sg-incident-response',       'operational_communication'),
  ('sg-reporting-documentation', 'factual_reporting'),
  ('sg-ethics-responsibility',   'integrity_and_information_handling')
) AS v(module_slug, behaviour_slug)
JOIN public.scp_modules m ON m.slug = v.module_slug
JOIN public.scp_module_versions mv ON mv.module_id = m.id AND mv.version_number = 1
JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
ON CONFLICT (module_version_id, behaviour_version_id) DO NOTHING;

INSERT INTO public.scp_assessment_definitions (family_id, slug, purpose, name_sv, name_en)
SELECT f.id, 'sg-operational-baseline', 'development_programme',
  'Väktare – operativ baslinje', 'Security Guard – operational baseline'
FROM public.scp_assessment_families f WHERE f.slug = 'security-competence-academy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_assessment_versions (definition_id, version_number, content_status, validation_status)
SELECT d.id, 1, 'draft', 'design'
FROM public.scp_assessment_definitions d WHERE d.slug = 'sg-operational-baseline'
ON CONFLICT (definition_id, version_number) DO NOTHING;

INSERT INTO public.scp_forms
  (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max)
SELECT av.id, 'sg-baseline-form-a', 'Baslinje A', 'Baseline A', 30, 35
FROM public.scp_assessment_versions av
JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
WHERE d.slug = 'sg-operational-baseline' AND av.version_number = 1
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_items (slug)
SELECT 'sg-b-' || lpad(g::text, 2, '0') FROM generate_series(1, 18) g
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_item_versions
  (item_id, version_number, content_status, validation_status, item_format,
   competency_id, primary_behaviour_id, mode, observable_behavior, response_process)
SELECT i.id, 1, 'draft', 'design', v.fmt, c.id, bv.id, 'assessment',
       bv.statement_sv,
       'Bedömning av situation och val av åtgärd utifrån presenterat scenario.'
FROM (VALUES
  ( 1,'sjt_best_response','situational_judgement',             'SCC-03'),
  ( 2,'sjt_best_response','situational_judgement',             'SCC-03'),
  ( 3,'sjt_best_response','proportional_decision_making',      'SCC-04'),
  ( 4,'sjt_best_response','proportional_decision_making',      'SCC-04'),
  ( 5,'sjt_best_response','mandate_and_escalation',            'SCC-09'),
  ( 6,'sjt_best_response','mandate_and_escalation',            'SCC-09'),
  ( 7,'sjt_best_response','operational_communication',         'SCC-06'),
  ( 8,'sjt_best_response','operational_communication',         'SCC-06'),
  ( 9,'sjt_best_response','de_escalation',                     'SCC-05'),
  (10,'sjt_best_response','de_escalation',                     'SCC-05'),
  (11,'sjt_best_response','operational_coordination',          'SCC-08'),
  (12,'sjt_best_response','integrity_and_information_handling','SCC-01'),
  (13,'sjt_best_worst',   'proportional_decision_making',      'SCC-04'),
  (14,'sjt_best_worst',   'de_escalation',                     'SCC-05'),
  (15,'sjt_best_worst',   'mandate_and_escalation',            'SCC-09'),
  (16,'constructed_response','factual_reporting',              'SCC-11'),
  (17,'constructed_response','factual_reporting',              'SCC-11'),
  (18,'constructed_response','integrity_and_information_handling','SCC-01')
) AS v(n, fmt, behaviour_slug, competency_code)
JOIN public.scp_items i ON i.slug = 'sg-b-' || lpad(v.n::text, 2, '0')
JOIN public.scp_competencies c ON c.code = v.competency_code
JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
ON CONFLICT (item_id, version_number) DO NOTHING;

INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order)
SELECT f.id, iv.id, 'baseline', row_number() OVER (ORDER BY i.slug)
FROM public.scp_forms f
CROSS JOIN public.scp_item_versions iv
JOIN public.scp_items i ON i.id = iv.item_id
WHERE f.slug = 'sg-baseline-form-a' AND i.slug LIKE 'sg-b-%' AND iv.version_number = 1
ON CONFLICT DO NOTHING;

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
   WHERE b.slug IN ('situational_judgement','proportional_decision_making',
     'mandate_and_escalation','operational_communication','de_escalation',
     'factual_reporting','integrity_and_information_handling','operational_coordination');
  IF _n <> 8 THEN
    RAISE EXCEPTION 'SCP_P1D_BEHAVIOURS: expected 8 dimensions, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
   WHERE b.slug IN ('situational_judgement','proportional_decision_making',
     'mandate_and_escalation','operational_communication','de_escalation',
     'factual_reporting','integrity_and_information_handling','operational_coordination')
     AND NOT EXISTS (SELECT 1 FROM public.scp_behaviour_competency_map m
                      WHERE m.behaviour_version_id = bv.id);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1D_ORPHAN_BEHAVIOURS: % dimensions reach no competency', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_module_versions mv
    JOIN public.scp_program_versions pv ON pv.id = mv.program_version_id
    JOIN public.scp_programs p ON p.id = pv.program_id
   WHERE p.slug = 'security-guard-operational-development';
  IF _n <> 6 THEN
    RAISE EXCEPTION 'SCP_P1D_MODULES: expected 6, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id WHERE i.slug LIKE 'sg-b-%';
  IF _n <> 18 THEN RAISE EXCEPTION 'SCP_P1D_ITEMS: expected 18, found %', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'sjt_best_response';
  IF _n <> 12 THEN RAISE EXCEPTION 'SCP_P1D_SJT: expected 12, found %', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'sjt_best_worst';
  IF _n <> 3 THEN RAISE EXCEPTION 'SCP_P1D_BESTWORST: expected 3, found %', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'constructed_response';
  IF _n <> 3 THEN RAISE EXCEPTION 'SCP_P1D_CR: expected 3, found %', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%' AND (iv.primary_behaviour_id IS NULL OR iv.mode <> 'assessment');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1D_ITEM_GRAPH: % items lack a behaviour or a mode', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_program_versions WHERE content_status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.scp_module_versions WHERE content_status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.scp_behaviour_versions WHERE content_status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
                 WHERE i.slug LIKE 'sg-b-%' AND iv.content_status <> 'draft') THEN
    RAISE EXCEPTION 'SCP_P1D_PUBLISHED: Phase 1 authors to draft only';
  END IF;

  IF EXISTS (SELECT 1 FROM public.assessments WHERE employer_visible) THEN
    RAISE EXCEPTION 'SCP_P1D_EMPLOYER_VISIBLE: nothing becomes assignable in Phase 1';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase1d-security-guard-draft', 'created',
  'Phase 1d: Security Guard – Operational Security Development Programme authored to DRAFT. Six modules, the eight competence dimensions modelled as observable behaviours on the existing SCC spine, and the 18-item baseline form (12 SJT + 3 best/worst + 3 constructed response), each item mapped to exactly one behaviour. Nothing published, nothing assignable, nothing employer-visible.',
  jsonb_build_object(
    'migration', '20260803120000_scp_phase1d_security_guard_draft_content',
    'modules', 6, 'behaviours', 8, 'items', 18,
    'composition', jsonb_build_object('sjt_best_response', 12, 'sjt_best_worst', 3, 'constructed_response', 3),
    'content_status', 'draft',
    'employer_visible', false));