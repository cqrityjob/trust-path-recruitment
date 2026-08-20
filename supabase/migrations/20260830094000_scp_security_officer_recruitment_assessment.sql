-- Väktare — Recruitment Assessment / Security Officer — Recruitment Assessment.
--
-- The flagship recruitment assessment, authored against the existing governed
-- spine. No new architecture: one assessment definition, one version, one form,
-- five declared sections and fifty items, each carrying the five content-review
-- gates every item in this platform carries.
--
-- ── WHAT IT IS FOR ──────────────────────────────────────────────────────
--
-- It produces structured evidence and interview preparation for a security
-- company recruiting guards. It answers: how does this person reason in real
-- security situations, what do they say about how they work, what did we
-- actually observe, and what should the recruiter ask about.
--
-- It does NOT answer whether to hire anybody. There is no pass, no fail, no
-- suitability statement, no score and no ranking anywhere in this content or
-- in anything derived from it. The employer decides.
--
-- ── WHAT IT MEASURES, AND WHAT IT DOES NOT ──────────────────────────────
--
-- Measured, as OBSERVED behaviour: how the person reasons about access
-- control, competing incidents, uncertain information, colleague and client
-- pressure, reporting quality and handover.
--
-- Recorded, as SELF-REPORTED behaviour and never presented as observed: what
-- they say about procedure adherence, attention, information discipline,
-- responsibility for mistakes, boundary-setting, escalation and self-control.
-- These are two different keys in the report, and 20260830090000 makes the
-- separation structural rather than editorial.
--
-- Not measured at all, and recorded as does_not_measure on the programme
-- version so the employer is told: personality, honesty as a trait, emotional
-- stability, mental health, motivation, future job performance, physical
-- ability, formal authorisation, legal competence, or anything about a
-- protected characteristic.
--
-- ── GOVERNANCE HONESTY ──────────────────────────────────────────────────
--
-- Every item is content_status = 'draft', validation_status = 'design', all
-- five review gates OUTSTANDING, authored_by_ai = true. This content was
-- written by an AI assistant against the product's own construct rules. It is
-- NOT expert-validated and nothing here claims it is. There is no psychometric
-- claim: no reliability coefficient, no norm group, no percentile, no
-- predictive-validity assertion, because no validation work has been done.
--
-- designed_for = 'recruitment_support' is a PRODUCT LABEL (20260830092000). It
-- is not permission. Draft content cannot be assigned in a recruitment context
-- — scp_employer_assign refuses that outright, and the refusal is left exactly
-- as it is. The assessment is runnable today only under an explicit,
-- time-bounded closed-test grant, and every attempt is stamped closed_test.
--
-- ── SCENARIO SOURCING ───────────────────────────────────────────────────
--
-- Ordinary Swedish guarding work: reception, industrial sites, logistics,
-- retail, data centres, office property, perimeter patrol. No item turns on
-- remembering a statute and no item invents a legal power a guard does not
-- hold; where a rule matters it is stated in the scenario. That is why every
-- scenario item is tests_what = 'judgement' or 'mandate', never
-- 'legal_knowledge'.
--
-- Violence is deliberately near-absent. Most professional security work is
-- judgement, communication, observation, procedure and information handling,
-- and an assessment weighted towards confrontation would measure the wrong job.

-- ═══════════════════════════════════════════════════════════════════════════
-- Authoring helpers
--
-- pg_temp, so they exist only for this migration and cannot become an
-- unversioned authoring API. Three, because there are three kinds of item and
-- collapsing them into one helper with eight null arguments is how the wrong
-- evidence_source_type gets passed by accident.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.author_scenario(
  _form uuid, _order int, _block text, _slug text,
  _behaviour uuid, _competency uuid, _facet uuid,
  _difficulty text, _demand text, _construct text, _tests_what text,
  _safety boolean, _observable text, _context_sv text, _guard_sv text,
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
     false, _jur, _difficulty, _demand, _construct, _tests_what, _safety,
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
    (_iv,'security_sme',        true,'Operativ riktighet i svensk bevakningskontext.','outstanding'),
    (_iv,'cognitive_interview', true,'Att deltagare tolkar scenariot som avsett.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Läsbarhet och kognitiv belastning.','outstanding'),
    (_iv,'pilot',               true,'Empiriska svarsmönster före operativ användning.','outstanding');

  INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
  VALUES (_form, _iv, _block, _order, true);

  RETURN _iv;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.author_selfreport(
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
     -- The whole point of this helper. A self-description is not an
     -- observation, and the evidence row says so for the rest of its life.
     evidence_source_type, authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', 'biq_frequency', _competency, _facet,
     _behaviour, 'assessment', _observable,
     'Självrapportering: deltagaren beskriver sitt eget vanliga arbetssätt. Svaret är en beskrivning, inte en iakttagelse.',
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
    (_iv,'security_sme',        true,'Att beskrivningen motsvarar verkligt arbetssätt i bevakning.','outstanding'),
    (_iv,'cognitive_interview', true,'Att frågan uppfattas som en beskrivning och inte som ett prov.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Läsbarhet och kognitiv belastning.','outstanding'),
    (_iv,'pilot',               true,'Svarsfördelning och social önskvärdhet före operativ användning.','outstanding');

  -- Options are NOT randomised: a frequency scale runs from one end to the
  -- other and shuffling it would make it unreadable.
  INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
  VALUES (_form, _iv, _block, _order, false);

  RETURN _iv;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.author_reflection(
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
     -- A person reads every one of these. No model scores free text here and
     -- none is asked to: the platform has no AI scorer wired in, and a
     -- deterministic reading of prose would be a fiction.
     requires_human_review, overgeneralisation_guard_sv,
     evidence_source_type, authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', 'constructed_response', _competency, _facet,
     _behaviour, 'assessment', _observable,
     'Fri redogörelse för en egen erfarenhet. Läses av en människa mot en publicerad rubrik.',
     false, _jur, 'intermediate', 'judgement', 'situational_judgement',
     'judgement', false, true, _guard_sv, 'assessment_response', true,
     'pending','pending','pending','pending','pending')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts
    (item_version_id, language, adaptation_status, scenario, prompt)
  VALUES (_iv, 'sv-SE', 'adaptation_pending', _scenario_sv, _prompt_sv),
         (_iv, 'en-GB', 'adaptation_pending', _scenario_en, _prompt_en);

  INSERT INTO public.scp_review_requirements (item_version_id, review_type, required, reason, status)
  VALUES
    (_iv,'security_sme',        true,'Att frågan går att besvara utan tidigare bevakningserfarenhet.','outstanding'),
    (_iv,'cognitive_interview', true,'Att deltagare förstår vad som efterfrågas.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Skrivbörda och tidsåtgång.','outstanding'),
    (_iv,'pilot',               true,'Bedömarsamstämmighet före operativ användning.','outstanding');

  INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
  VALUES (_form, _iv, _block, _order, false);

  RETURN _iv;
END $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- The assessment, its programme statement and its five sections
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _fam uuid; _role uuid; _jur uuid; _prof uuid;
  _prog uuid; _pver uuid; _def uuid; _ver uuid; _form uuid;
BEGIN
  SELECT id INTO _jur  FROM public.scp_jurisdictions WHERE code = 'SE';
  SELECT id INTO _fam  FROM public.scp_assessment_families
   WHERE product_type = 'development_programme' LIMIT 1;
  SELECT id INTO _role FROM public.scp_roles WHERE slug = 'security-guard-se';
  SELECT id INTO _prof FROM public.scp_professions WHERE slug = 'security-officer-se';

  IF _fam IS NULL OR _role IS NULL OR _jur IS NULL THEN
    RAISE EXCEPTION 'SCP_SO_SPINE_MISSING: family, role or jurisdiction absent.';
  END IF;

  -- The programme version carries purpose and boundaries. These strings are
  -- what the employer reads in the library before assigning anything, so the
  -- limits are stated there rather than in a footnote on the report.
  INSERT INTO public.scp_programs (slug, role_id)
  VALUES ('security-officer-recruitment', _role)
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
       'Väktare – Recruitment Assessment',
       'Security Officer – Recruitment Assessment',
       'Rollspecifik bedömning för rekrytering av väktare. Ger strukturerat evidens- och intervjuunderlag om säkerhetsbedömning, observation, rapportering och självrapporterat arbetsbeteende. Resultatet är beslutsstöd inför en intervju. Det fattar inget anställningsbeslut, rangordnar inga kandidater och uttalar sig inte om lämplighet.',
       'A role-specific assessment for recruiting security officers. It produces structured evidence and interview preparation covering security judgment, observation, reporting and self-reported work behaviour. The result is decision support ahead of an interview. It makes no employment decision, ranks no candidates and makes no statement about suitability.',
       ARRAY['Personlighet','Ärlighet som personlighetsdrag','Emotionell stabilitet','Psykisk hälsa','Motivation','Framtida arbetsprestation','Fysisk förmåga','Formell auktorisation','Laglig behörighet','Bakgrundskontroll','Lämplighet för anställning'],
       ARRAY['Personality','Honesty as a personality trait','Emotional stability','Mental health','Motivation','Future job performance','Physical ability','Formal authorisation','Legal competence','Background checking','Suitability for employment'])
    RETURNING id INTO _pver;
  END IF;

  -- purpose must agree with the family's product_type
  -- (scp_guard_family_product_separation). The Academy family is
  -- 'development_programme', and that is also the honest governance purpose
  -- this content can be run under today: the selection_support processing
  -- purpose is deliberately unpublished, so a recruitment-context assignment
  -- is refused and the assessment runs as closed-test competence content.
  -- designed_for records what it was WRITTEN for; it confers nothing.
  INSERT INTO public.scp_assessment_definitions
    (family_id, profession_id, slug, name_sv, name_en, purpose,
     is_test_fixture, designed_for)
  VALUES (_fam, _prof, 'security-officer-recruitment',
          'Väktare – Recruitment Assessment',
          'Security Officer – Recruitment Assessment',
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
            'Flagship recruitment assessment. AI-authored draft against the '
            'product construct rules; all five review gates outstanding on '
            'every item. No psychometric claim of any kind.')
    RETURNING id INTO _ver;
  END IF;

  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en,
       target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_ver, 'security-officer-recruitment-form-a',
            'Väktare rekrytering A', 'Security officer recruitment A',
            35, 45, false)
    RETURNING id INTO _form;
  END IF;

  -- The sections. Declared BEFORE any item is placed, because
  -- scp_guard_block_asks_agrees refuses an item in an undeclared section.
  INSERT INTO public.scp_form_blocks
    (form_id, block_key, display_order, name_sv, name_en, intro_sv, intro_en, asks)
  VALUES
    (_form, 'a_judgment', 1,
     'Säkerhetsbedömning', 'Security judgment',
     'Tio situationer ur vanligt bevakningsarbete. Det finns sällan ett självklart rätt svar — välj det du faktiskt skulle göra utifrån det som står i situationen.',
     'Ten situations from ordinary guarding work. There is rarely one obvious right answer — choose what you would actually do, based on what the situation tells you.',
     'what_you_would_do'),
    (_form, 'b_observation', 2,
     'Observation och rapportering', 'Observation & reporting',
     'Sex uppgifter om vad som faktiskt observerats, vad som är slutsats, och vad som behöver föras vidare.',
     'Six tasks about what was actually observed, what is a conclusion, and what needs to be passed on.',
     'what_you_would_do'),
    (_form, 'c_behaviour', 3,
     'Arbetsbeteende inom säkerhetsarbete', 'Security work behaviour',
     'Tjugofyra frågor om hur du brukar arbeta. Det här är inte ett personlighetstest och det finns inget facit. Svaren redovisas för arbetsgivaren som det du själv beskriver — aldrig som något vi har observerat. Svara som det faktiskt ser ut, inte som det borde se ut.',
     'Twenty-four questions about how you usually work. This is not a personality test and there is no answer key. Your answers are reported to the employer as what you describe about yourself — never as something we observed. Answer as things actually are, not as they ought to be.',
     'how_you_usually_work'),
    (_form, 'd_integrity', 4,
     'Integritet och tillförlitlighet', 'Integrity & reliability',
     'Sex situationer där en rutin, en kollega eller en kund drar åt olika håll.',
     'Six situations where a procedure, a colleague or a client pulls in different directions.',
     'what_you_would_do'),
    (_form, 'e_reflection', 5,
     'Reflektion', 'Reflection',
     'Fyra korta frågor om egna erfarenheter. Svaren läses av en människa, inte av en modell. Skriv några meningar — det behöver inte vara långt.',
     'Four short questions about your own experience. A person reads these, not a model. A few sentences is enough.',
     'your_own_experience')
  ON CONFLICT (form_id, block_key) DO NOTHING;

  RAISE NOTICE 'security-officer-recruitment scaffolding ready';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- The items
--
-- Behaviour and competency are RESOLVED from the graph rather than hard-coded,
-- so this migration cannot silently attach evidence to the wrong node.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _form uuid;
  b_sit uuid; c_sit uuid;   -- SCC-03 situational judgement
  b_prop uuid; c_prop uuid; -- SCC-04 proportional decision making (v1)
  b_judg uuid; c_judg uuid; -- SCC-11 proportional decision making (v2)
  b_mand uuid; c_mand uuid; -- SCC-09 mandate and escalation
  b_comm uuid; c_comm uuid; -- SCC-06 operational communication
  b_rep uuid;  c_rep uuid;  -- SCC-06 factual reporting
  b_int uuid;  c_int uuid;  -- SCC-01 integrity and information handling
  b_serv uuid; c_serv uuid; -- SCC-07 de-escalation
  b_coord uuid; c_coord uuid; -- SCC-08 operational coordination
  f_scan uuid; f_anom uuid; f_disc uuid; f_rule uuid;
  f_err uuid; f_bound uuid; f_esc uuid; f_recov uuid;
  f_prio uuid; f_doc uuid; f_prop uuid; f_own uuid; f_share uuid; f_resp uuid;
BEGIN
  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a';
  IF EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id = _form) THEN
    RAISE NOTICE 'security-officer-recruitment items already authored';
    RETURN;
  END IF;

  SELECT bv.id, cv.competency_id INTO b_sit, c_sit
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'situational_judgement' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_prop, c_prop
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'proportional_decision_making' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_judg, c_judg
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'proportional_decision_making' AND bv.version_number = 2;
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
  SELECT bv.id, cv.competency_id INTO b_rep, c_rep
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'factual_reporting' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_int, c_int
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'integrity_and_information_handling' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_serv, c_serv
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'de_escalation' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_coord, c_coord
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'operational_coordination' AND bv.version_number = 1;

  IF b_sit IS NULL OR b_prop IS NULL OR b_judg IS NULL OR b_mand IS NULL
     OR b_comm IS NULL OR b_rep IS NULL OR b_int IS NULL OR b_serv IS NULL
     OR b_coord IS NULL THEN
    RAISE EXCEPTION 'SCP_SO_GRAPH_MISSING: the competency graph does not carry '
      'every behaviour this assessment maps to.';
  END IF;

  SELECT id INTO f_scan  FROM public.scp_competency_facets WHERE slug = 'aktiv-scanning';
  SELECT id INTO f_anom  FROM public.scp_competency_facets WHERE slug = 'avvikelseigenkanning';
  SELECT id INTO f_rule  FROM public.scp_competency_facets WHERE slug = 'regel-och-syfteslojalitet';
  SELECT id INTO f_disc  FROM public.scp_competency_facets WHERE slug = 'genomforandedisciplin';
  SELECT id INTO f_err   FROM public.scp_competency_facets WHERE slug = 'fel-och-avvikelseansvar';
  SELECT id INTO f_bound FROM public.scp_competency_facets WHERE slug = 'granshallning';
  SELECT id INTO f_esc   FROM public.scp_competency_facets WHERE slug = 'eskalering-och-overlamning';
  SELECT id INTO f_recov FROM public.scp_competency_facets WHERE slug = 'aterhamtning';
  SELECT id INTO f_prio  FROM public.scp_competency_facets WHERE slug = 'prioritering';
  SELECT id INTO f_doc   FROM public.scp_competency_facets WHERE slug = 'dokumentation';
  SELECT id INTO f_prop  FROM public.scp_competency_facets WHERE slug = 'proportionalitet';
  SELECT id INTO f_own   FROM public.scp_competency_facets WHERE slug = 'agarskap';
  SELECT id INTO f_share FROM public.scp_competency_facets WHERE slug = 'informationsdelning';
  SELECT id INTO f_resp  FROM public.scp_competency_facets WHERE slug = 'respektfullt-bemotande';

-- ── BLOCK A — Säkerhetsbedömning (10) ──────────────────────────────────────

  -- A1  Access control / unauthorised visitor
  PERFORM pg_temp.author_scenario(_form, 1, 'a_judgment', 'so-rj-a01',
    b_judg, c_judg, f_prop, 'intermediate','judgement','situational_judgement','judgement', false,
    'Väljer den minst ingripande åtgärd som löser ett behörighetsproblem.',
    'Reception i kontorshus med passerkontroll, morgonrusning.',
    'Ett svar i ett scenario säger något om resonemanget här, inte om personens allmänna regelefterlevnad.',
    'Det är morgon och kö vid spärrarna. En person utan passerkort säger att hen ska till ett möte på plan 6, är sen, och visar ett mejl med möteskallelsen på telefonen. Enligt instruktionen ska besökare anmälas i receptionen och hämtas av den de ska träffa.',
    'Vad gör du?',
    'It is morning and there is a queue at the barriers. A person with no access card says they are going to a meeting on floor 6, that they are late, and shows a meeting invitation on their phone. The site instruction says visitors are registered at reception and collected by the person they are meeting.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Följer instruktionen men löser personens problem parallellt. Minst ingripande åtgärd som ändå håller kontrollen.","sv":"Registrera besöket och ring upp mötesvärden direkt så att hen kan komma ner — och säg till personen att det tar ett par minuter.","en":"Register the visit and call the host straight away so they can come down — and tell the person it will take a couple of minutes."},
      {"k":"b","score":1,"pref":false,"err":"excessive_informal_trust","rat_sv":"Mejlet visar en kallelse, inte att personen är den som kallats. Behörigheten är fortfarande okontrollerad.","sv":"Släppa in personen eftersom möteskallelsen styrker ärendet, och notera det i loggen.","en":"Let the person through since the invitation supports their business there, and note it in the log."},
      {"k":"c","score":0,"pref":false,"err":"poor_proportionality","rat_sv":"Att avvisa någon med ett legitimt ärende utan att pröva den enkla vägen är oproportionerligt och gör onödig skada för uppdragsgivaren.","sv":"Be personen lämna entrén och boka om mötet, eftersom hen inte är anmäld.","en":"Ask the person to leave the entrance and rebook the meeting, since they are not registered."}]'::jsonb);

  -- A2  Conflict with a visitor
  PERFORM pg_temp.author_scenario(_form, 2, 'a_judgment', 'so-rj-a02',
    b_serv, c_serv, f_resp, 'intermediate','judgement','situational_judgement','judgement', false,
    'Sänker spänningsnivån verbalt utan att ge upp gränsen.',
    'Köpcentrum, kundtjänstdisk, sen eftermiddag.',
    'Ett scenario om bemötande säger inget om personens tålamod i allmänhet.',
    'En kund höjer rösten mot dig i entrén till ett köpcentrum. Hen är arg över att en butik nekat en retur och menar att du som väktare ska "göra något åt det". Ett par personer har stannat och tittar.',
    'Vad gör du först?',
    'A customer raises their voice at you in the entrance to a shopping centre. They are angry that a shop refused a return and say that you as a security officer should "do something about it". A couple of people have stopped to watch.',
    'What do you do first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Lyssnar färdigt, flyttar samtalet från publiken och är tydlig med vad som ligger utanför uppdraget utan att avfärda personen.","sv":"Lyssna klart, gå några steg åt sidan från kön och säg vad du kan hjälpa till med — och vad som är butikens beslut.","en":"Hear them out, move a few steps aside from the queue, and say what you can help with — and what is the shop''s decision."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Att hänvisa vidare direkt är korrekt i sak men lämnar personen mitt i sin frustration, vilket ofta trappar upp.","sv":"Förklara direkt att det inte är din sak och hänvisa till centrumledningen.","en":"Explain straight away that it is not your concern and refer them to centre management."},
      {"k":"c","score":0,"pref":false,"err":"premature_escalation","rat_sv":"Avvisning som första åtgärd mot en arg men laglydig kund är oproportionerligt och gör konflikten större.","sv":"Säga att om personen inte sänker rösten får hen lämna centrumet.","en":"Say that if they do not lower their voice they will have to leave the centre."}]'::jsonb);

  -- A3  Two incidents at once
  PERFORM pg_temp.author_scenario(_form, 3, 'a_judgment', 'so-rj-a03',
    b_prop, c_prop, f_prio, 'advanced','judgement','prioritisation','judgement', false,
    'Prioriterar mellan samtidiga händelser utifrån tidskritisk risk.',
    'Industriområde, ensampass, kväll.',
    'Prioritering i ett scenario säger inget om personens förmåga att prioritera generellt.',
    'Du är ensam väktare på ett industriområde. Samtidigt får du två saker: ett dörrlarm på ett kallförråd i utkanten, och ett samtal från en anställd som säger att en person hen inte känner igen står inne i personalutrymmet vid omklädningsrummen.',
    'Vad gör du?',
    'You are the only officer on an industrial site. Two things arrive at once: a door alarm on a cold store at the edge of the site, and a call from an employee saying an unfamiliar person is standing inside the staff area by the changing rooms.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Går till människorna först, håller kvar den andra händelsen genom att be om observation, och lämnar inte något obevakat utan att någon vet om det.","sv":"Åk till personalutrymmet först, be den anställde stanna kvar på telefon, och meddela larmcentralen att dörrlarmet inte är kontrollerat än.","en":"Go to the staff area first, ask the employee to stay on the phone, and tell the alarm centre that the door alarm is not yet checked."},
      {"k":"b","score":1,"pref":false,"err":"tunnel_vision","rat_sv":"Larmet är det tydligaste men inte det mest tidskritiska. En okänd person bland anställda är både en risk och något som hinner försvinna.","sv":"Åk till dörrlarmet först eftersom det är ett bekräftat larm, och ta personalutrymmet direkt efteråt.","en":"Go to the door alarm first since it is a confirmed alarm, and take the staff area straight afterwards."},
      {"k":"c","score":0,"pref":false,"err":"delayed_escalation","rat_sv":"Att be den anställde själv hantera en okänd person lägger uppgiften på fel person och lämnar båda händelserna utan väktare.","sv":"Be den anställde fråga personen vad hen gör där, medan du åker till dörrlarmet.","en":"Ask the employee to question the person themselves while you go to the door alarm."}]'::jsonb);

  -- A4  Suspicious behaviour
  PERFORM pg_temp.author_scenario(_form, 4, 'a_judgment', 'so-rj-a04',
    b_sit, c_sit, f_anom, 'intermediate','judgement','situational_judgement','judgement', false,
    'Skiljer det som faktiskt observerats från det som antas om ett avvikande beteende.',
    'Logistikterminal, lastkaj, dagtid.',
    'Ett scenario om iakttagelse säger inget om personens allmänna uppmärksamhet.',
    'På en logistikterminal ser du en person i arbetskläder utan synlig ID-bricka gå längs lastkajen och fotografera portnummer och lastluckor med sin telefon. Terminalen har entreprenörer på plats den här veckan.',
    'Vad gör du?',
    'At a logistics terminal you see a person in work clothes with no visible ID badge walking along the loading bay photographing gate numbers and loading doors with their phone. The terminal has contractors on site this week.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Frågar om det som faktiskt avviker — aktiviteten och den saknade brickan — utan att förutsätta ett motiv, och kontrollerar mot den som vet.","sv":"Gå fram, presentera dig och fråga vad fotograferingen gäller och vem hen arbetar för — och stäm av med terminalansvarig.","en":"Approach, introduce yourself and ask what the photography is for and who they work for — then check with the terminal supervisor."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Att bara notera lämnar frågan obesvarad medan personen fortsätter, och en notering utan kontroll hjälper ingen.","sv":"Notera tid, signalement och vad personen gör, och fortsätt ronden.","en":"Note the time, a description and what the person is doing, and continue the round."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Att behandla fotograferingen som rekognosering inför ett brott är en slutsats som inte går att dra av det som syns.","sv":"Larma polis om misstänkt rekognosering inför inbrott.","en":"Call the police about suspected reconnaissance ahead of a burglary."}]'::jsonb);

  -- A5  Colleague ignoring procedure
  PERFORM pg_temp.author_scenario(_form, 5, 'a_judgment', 'so-rj-a05',
    b_mand, c_mand, f_own, 'intermediate','judgement','mandate_and_escalation','mandate', false,
    'Agerar på en kollegas avsteg från rutin utan att göra det till en personfråga.',
    'Bevakat område, nattpass, två väktare.',
    'Ett scenario om en kollega säger inget om personens lojalitet mot kollegor i stort.',
    'Du går nattpass med en mer erfaren kollega. På tredje ronden märker du att hen kvitterar kontrollpunkter i systemet utan att gå till två av dem. Kollegan säger att "de punkterna är alltid låsta, det är slöseri med tid".',
    'Vad gör du?',
    'You are working a night shift with a more experienced colleague. On the third round you notice they are signing off checkpoints in the system without visiting two of them. Your colleague says "those points are always locked, it is a waste of time".',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Tar upp det direkt med den det gäller, går själv till punkterna, och för vidare det som är ett systematiskt avsteg — inte som en anmälan av personen.","sv":"Säg till kollegan att du går punkterna, gör det, och ta upp med arbetsledaren att kvitteringen inte stämmer med vad som gjorts.","en":"Tell your colleague you are going to those points, do it, and raise with the supervisor that the sign-off does not match what was done."},
      {"k":"b","score":1,"pref":false,"err":"failure_to_document","rat_sv":"Att bara göra rätt själv låter en felaktig kvittering ligga kvar i systemet, vilket är den egentliga risken.","sv":"Gå punkterna själv och låt saken bero eftersom du inte är kollegans chef.","en":"Visit the points yourself and let it rest, since you are not your colleague''s manager."},
      {"k":"c","score":0,"pref":false,"err":"outside_mandate","rat_sv":"Att kvittera i kollegans ställe gör dig till en del av avsteget och gör spåret sämre, inte bättre.","sv":"Kvittera punkterna i eget namn så att loggen i alla fall blir rätt.","en":"Sign the points off in your own name so that the log at least becomes correct."}]'::jsonb);

  -- A6  Inappropriate instruction from a client
  PERFORM pg_temp.author_scenario(_form, 6, 'a_judgment', 'so-rj-a06',
    b_int, c_int, f_rule, 'advanced','judgement','mandate_and_escalation','mandate', true,
    'Skiljer en legitim instruktion från en otillbörlig begäran från någon i överordnad ställning.',
    'Kontorsfastighet, uppdragsgivarens platschef, fredag eftermiddag.',
    'Ett scenario om press uppifrån säger inget om personens allmänna ryggrad.',
    'Uppdragsgivarens platschef ber dig ta bort en notering ur incidentloggen. Noteringen gäller att en dörr till serverrummet stått uppställd i två timmar. Platschefen säger att det redan är åtgärdat, att noteringen "bara skapar problem i revisionen" och att hen tar ansvar för beslutet.',
    'Vad gör du?',
    'The client''s site manager asks you to remove an entry from the incident log. The entry records that a door to the server room stood propped open for two hours. The site manager says it has already been dealt with, that the entry "just creates problems in the audit", and that they take responsibility for the decision.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Vägrar sakligt, förklarar varför, och tar begäran vidare till den som faktiskt är ens uppdragsgivare i bevakningsledet.","sv":"Säg att loggen inte kan ändras i efterhand, erbjud att platschefen får lägga till sin egen kommentar om åtgärden, och rapportera begäran till din arbetsledare.","en":"Say the log cannot be changed after the fact, offer that the site manager add their own comment about the remedy, and report the request to your supervisor."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Rätt svar till platschefen, men en begäran om att ändra en logg är i sig något arbetsledningen behöver känna till.","sv":"Säg nej till platschefen och lämna det därhän eftersom du ändå inte tänker göra det.","en":"Say no to the site manager and leave it there, since you are not going to do it anyway."},
      {"k":"c","score":0,"pref":false,"err":"excessive_informal_trust","rat_sv":"Att ta bort noteringen på muntligt ansvarsövertagande gör spåret oanvändbart och flyttar ansvaret till fel person.","sv":"Ta bort noteringen eftersom platschefen är ansvarig på plats och säger sig ta ansvaret.","en":"Remove the entry, since the site manager is responsible on site and says they take responsibility."}]'::jsonb);

  -- A7  Alarm with incomplete information
  PERFORM pg_temp.author_scenario(_form, 7, 'a_judgment', 'so-rj-a07',
    b_sit, c_sit, f_scan, 'intermediate','judgement','situational_judgement','judgement', false,
    'Skaffar tillräcklig egen lägesbild innan hen binder upp sig vid en tolkning.',
    'Utryckning till larm i en fastighet med flera hyresgäster.',
    'Ett scenario om ett larm säger inget om personens allmänna beslutsförmåga.',
    'Du åker på ett inbrottslarm i en fastighet med flera hyresgäster. Larmcentralen kan bara säga att en sektion har löst ut, inte vilken. När du kommer fram står ytterdörren olåst men stängd, och belysningen i trapphuset är släckt trots att den ska vara på nattetid.',
    'Vad gör du först?',
    'You respond to an intruder alarm in a building with several tenants. The alarm centre can only say that one section has triggered, not which. On arrival the main door is unlocked but closed, and the stairwell lighting is off although it should be on at night.',
    'What do you do first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Bygger en egen bild utifrån, delar den, och går inte in i en okänd situation utan att någon vet var man är.","sv":"Gå ett varv runt fastigheten och kontrollera fönster och baksida, meddela larmcentralen vad du ser och begär vilken sektion det gäller innan du går in.","en":"Walk the perimeter checking windows and the rear, tell the alarm centre what you can see, and ask which section triggered before going in."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Att gå in direkt är inte orimligt, men att göra det utan att veta sektion, utan ljus och utan att någon vet var man är är att ge bort sina egna marginaler.","sv":"Gå in genom ytterdörren och kontrollera trapphuset våning för våning.","en":"Go in through the main door and check the stairwell floor by floor."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Släckt belysning och olåst dörr är två avvikelser samtidigt, vilket är precis det som inte ska avfärdas som tekniskt fel.","sv":"Utgå från att det är ett tekniskt fel eftersom dörren är stängd, och avsluta med en notering.","en":"Assume it is a technical fault since the door is closed, and close it off with a note."}]'::jsonb);

  -- A8  Personal injury
  PERFORM pg_temp.author_scenario(_form, 8, 'a_judgment', 'so-rj-a08',
    b_prop, c_prop, f_prio, 'foundational','judgement','prioritisation','judgement', true,
    'Handlar först mot personskada och håller ordning på vad som ska föras vidare.',
    'Lagerbyggnad, dagtid, personal på plats.',
    'Ett scenario om en olycka säger inget om personens fysiska förmåga eller sjukvårdskunskap.',
    'Under en rond i en lagerbyggnad hör du ett brak och hittar en person som ligger på golvet vid en pallställning. Personen är vaken, svarar på tilltal men säger att hen inte kan stödja på ena benet. En pall ligger tippad intill.',
    'Vad gör du?',
    'During a round in a warehouse you hear a crash and find a person on the floor by a pallet rack. They are conscious, responsive, but say they cannot put weight on one leg. A tipped pallet is lying next to them.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Person först, plats säkrad, hjälp larmad, och underlaget för utredningen bevarat — i den ordningen.","sv":"Stanna hos personen, larma ambulans, se till att ingen annan går in i området och lämna pallen där den ligger tills olyckan är dokumenterad.","en":"Stay with the person, call an ambulance, keep others out of the area, and leave the pallet where it is until the accident has been documented."},
      {"k":"b","score":1,"pref":false,"err":"poor_proportionality","rat_sv":"Att flytta någon som inte kan stödja på benet kan förvärra en skada, och gör dessutom platsen svårare att utreda.","sv":"Hjälpa personen upp och till ett kontor där hen kan sitta ner medan du ringer.","en":"Help the person up and into an office where they can sit down while you call."},
      {"k":"c","score":0,"pref":false,"err":"delayed_escalation","rat_sv":"Att söka efter en chef innan hjälp larmas fördröjer det enda som är tidskritiskt.","sv":"Leta upp närmaste arbetsledare så att företaget själv får avgöra om ambulans behövs.","en":"Find the nearest supervisor so the company can decide for itself whether an ambulance is needed."}]'::jsonb);

  -- A9  Reporting after the event
  PERFORM pg_temp.author_scenario(_form, 9, 'a_judgment', 'so-rj-a09',
    b_rep, c_rep, f_doc, 'intermediate','judgement','factual_reporting','judgement', false,
    'Rapporterar det som observerats skilt från egen tolkning, inklusive det obekväma.',
    'Efter en händelse i en butiksentré, rapportskrivning.',
    'Ett scenario om rapportskrivning säger inget om personens allmänna skriftliga förmåga.',
    'Du har avvisat en person från en butiksentré efter att butikspersonal påkallat din hjälp. Personen gick frivilligt men var upprörd och sa att hen skulle anmäla dig. Du ska nu skriva händelserapporten.',
    'Vilket är viktigast att få med?',
    'You have removed a person from a shop entrance after staff called for your help. They left voluntarily but were upset and said they would report you. You are now writing the incident report.',
    'What matters most to include?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Tid, vad som sagts och gjorts i ordning, vem som var där, och personens egen invändning — det sista är det som brukar utelämnas och det som betyder mest efteråt.","sv":"Tidpunkt, vad butikspersonalen sa, vad du sa och gjorde i tur och ordning, vilka som var närvarande, och att personen sa att hen skulle anmäla dig.","en":"The time, what the shop staff said, what you said and did in sequence, who was present, and that the person said they would report you."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"En korrekt men tunn rapport. Utan förloppet går det inte att bedöma om åtgärden var proportionerlig.","sv":"Att en person avvisats från entrén på begäran av butikspersonal, med tidpunkt.","en":"That a person was removed from the entrance at the request of shop staff, with the time."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"En bedömning av personens sinnestillstånd är en slutsats, inte en iakttagelse, och håller inte om rapporten prövas.","sv":"Att personen uppträdde hotfullt och sannolikt var påverkad, samt att avvisningen därför var befogad.","en":"That the person behaved threateningly and was probably under the influence, and that the removal was therefore justified."}]'::jsonb);

  -- A10  Shift handover
  PERFORM pg_temp.author_scenario(_form, 10, 'a_judgment', 'so-rj-a10',
    b_coord, c_coord, f_share, 'foundational','judgement','operational_communication','judgement', false,
    'Överlämnar det som nästa pass behöver för att kunna agera.',
    'Skiftbyte på ett bevakat objekt.',
    'Ett scenario om överlämning säger inget om personens samarbetsförmåga i stort.',
    'Ditt pass går mot slut. Under natten har du: hittat en olåst grind mot lastgården som du låst, noterat att en rörelsedetektor i garaget löst ut tre gånger utan att du sett något, och tagit emot ett meddelande om att en entreprenör kommer klockan sju för att arbeta på taket.',
    'Vad tar du upp vid överlämningen?',
    'Your shift is ending. During the night you have: found an unlocked gate to the loading yard and locked it, noted that a motion detector in the garage triggered three times with nothing visible, and received a message that a contractor is arriving at seven to work on the roof.',
    'What do you raise at the handover?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Allt tre, med det som pågår markerat. Nästa pass behöver kunna agera, inte bara veta.","sv":"Alla tre, och särskilt att detektorn i garaget behöver hållas under uppsikt och att entreprenören ska tas emot klockan sju.","en":"All three, and in particular that the garage detector needs watching and that the contractor is to be received at seven."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Det åtgärdade är det minst brådskande. Det som fortfarande pågår är det som nästa pass faktiskt behöver.","sv":"Grinden, eftersom det var den enda konkreta avvikelsen — de andra två är noterade i systemet.","en":"The gate, since it was the only concrete deviation — the other two are recorded in the system."},
      {"k":"c","score":0,"pref":false,"err":"failure_to_document","rat_sv":"Att lita på att systemet talar för sig innebär att nästa pass upptäcker sakerna först när de blivit problem.","sv":"Inget särskilt — allt finns i loggen och nästa pass läser den vid start.","en":"Nothing in particular — it is all in the log and the next shift reads it when they start."}]'::jsonb);

-- ── BLOCK B — Observation och rapportering (6) ─────────────────────────────

  -- B1  Fact vs assumption in one's own account
  PERFORM pg_temp.author_scenario(_form, 11, 'b_observation', 'so-rj-b01',
    b_rep, c_rep, f_doc, 'foundational','recognition','factual_reporting','judgement', false,
    'Skiljer iakttagelse från slutsats i en beskrivning av en person.',
    'Rapportering efter en iakttagelse i en entré.',
    'Ett svar om formulering säger inget om personens allmänna språkförmåga.',
    'Fyra formuleringar om samma person i en entré. Alla fyra är skrivna av väktare.',
    'Vilken av dem är en iakttagelse och inte en slutsats?',
    'Four ways of describing the same person in an entrance hall, all written by security officers.',
    'Which of them is an observation rather than a conclusion?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Enbart observerbara uppgifter: ålderspann, klädsel, tid, position och handling. Ingen tolkning av avsikt.","sv":"\"Man, uppskattningsvis 30–40 år, mörk jacka, stod kvar vid dörren i ungefär tre minuter och försökte öppna den två gånger.\"","en":"\"Male, approximately 30–40 years old, dark jacket, remained by the door for about three minutes and tried to open it twice.\""},
      {"k":"b","score":1,"pref":false,"err":"unsupported_assumption","rat_sv":"\"Nervös\" är en tolkning av ett beteende. Det som faktiskt syntes borde stå i stället.","sv":"\"En nervös man i mörk jacka höll till vid dörren en längre stund.\"","en":"\"A nervous man in a dark jacket hung around by the door for a while.\""},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Avsikt går inte att observera, och en rapport som påstår den håller inte om den prövas.","sv":"\"Mannen såg misstänkt ut och hade sannolikt för avsikt att ta sig in obehörigt.\"","en":"\"The man looked suspicious and probably intended to get in without authorisation.\""}]'::jsonb);

  -- B2  Choose the better report
  PERFORM pg_temp.author_scenario(_form, 12, 'b_observation', 'so-rj-b02',
    b_rep, c_rep, f_doc, 'intermediate','judgement','factual_reporting','judgement', false,
    'Bedömer vilken rapport som går att arbeta vidare från.',
    'Granskning av en kollegas händelserapport.',
    'Ett svar om rapportkvalitet säger inget om personens noggrannhet i allmänhet.',
    'Tre rapporter om samma händelse: en vattenläcka upptäckt i ett teknikutrymme klockan 02.40 under nattrond.',
    'Vilken rapport går det att arbeta vidare från?',
    'Three reports of the same event: a water leak found in a plant room at 02:40 during a night round.',
    'Which report can somebody actually work from?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Tid, plats, omfattning, vidtagen åtgärd, vem som kontaktats och vad som återstår. En läsare kan fortsätta arbetet.","sv":"\"02.40, teknikutrymme plan −1. Vatten på golvet cirka 2×3 meter, rinner från rörgenomföring i tak. Huvudkran ej åtkomlig. Jour kontaktad 02.48, på plats 03.20. Golvbrunn fri. Ingen elutrustning i vattnet.\"","en":"\"02:40, plant room level −1. Water on the floor roughly 2×3 metres, running from a pipe penetration in the ceiling. Main stopcock not accessible. On-call contacted 02:48, on site 03:20. Floor drain clear. No electrical equipment in the water.\""},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Sant men obrukbart. Ingen omfattning, ingen åtgärd, ingen uppgift om vad som gjorts eller återstår.","sv":"\"Vattenläcka i teknikutrymmet upptäcktes under nattronden. Jouren är kontaktad.\"","en":"\"Water leak in the plant room discovered during the night round. On-call has been contacted.\""},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Orsak och ansvar är slutsatser som inte går att dra på plats, och de tränger undan det som faktiskt observerades.","sv":"\"Läckan beror med största sannolikhet på det slarviga rörarbetet i förra veckan. Fastighetsägaren bör hålla entreprenören ansvarig.\"","en":"\"The leak is almost certainly due to the sloppy pipework last week. The property owner should hold the contractor responsible.\""}]'::jsonb);

  -- B3  What is missing
  PERFORM pg_temp.author_scenario(_form, 13, 'b_observation', 'so-rj-b03',
    b_sit, c_sit, f_scan, 'intermediate','judgement','situational_judgement','judgement', false,
    'Identifierar vilken information som saknas för att kunna agera.',
    'Mottagande av en muntlig rapport från en kollega.',
    'Ett svar om informationsluckor säger inget om personens allmänna analysförmåga.',
    'En kollega ringer och säger: "Det är någon som har varit i cykelrummet, det ser rörigt ut därinne. Jag åker vidare till nästa objekt nu."',
    'Vad behöver du veta först?',
    'A colleague calls and says: "Somebody has been in the bike store, it looks messy in there. I am moving on to the next site now."',
    'What do you need to know first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Tid och det som faktiskt observerats avgör om detta är en pågående händelse eller en gammal. Utan det går det inte att välja åtgärd.","sv":"När hen var där, vad hen faktiskt såg, och om dörren var låst eller uppbruten.","en":"When they were there, what they actually saw, and whether the door was locked or forced."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Rimlig fråga, men den säger inget om huruvida något behöver göras nu.","sv":"Om hen har skrivit en notering i systemet om det.","en":"Whether they have written a note about it in the system."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Antalet är en detalj i en slutsats som ännu inte är dragen; ingen har sagt att något är stulet.","sv":"Hur många cyklar som saknas.","en":"How many bikes are missing."}]'::jsonb);

  -- B4  Handover content
  PERFORM pg_temp.author_scenario(_form, 14, 'b_observation', 'so-rj-b04',
    b_comm, c_comm, f_esc, 'intermediate','judgement','operational_communication','judgement', false,
    'Anpassar informationen till vad mottagaren behöver kunna göra.',
    'Larmsamtal till uppdragsgivarens jour mitt i natten.',
    'Ett svar om vad man säger i telefon säger inget om personens allmänna kommunikationsförmåga.',
    'Klockan 03.15 måste du väcka uppdragsgivarens jourhavande. En kylanläggning i en livsmedelslokal har larmat och temperaturen stiger. Du har tio sekunder innan personen är riktigt vaken.',
    'Vad säger du först?',
    'At 03:15 you have to wake the client''s on-call manager. A refrigeration unit in a food premises has alarmed and the temperature is rising. You have ten seconds before they are properly awake.',
    'What do you say first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Vem, var, vad, hur brådskande och vad som behövs — i den ordning en nyvaken person kan ta emot den.","sv":"Vem du är, vilket objekt det gäller, att kylan larmat och temperaturen stiger, och vad du behöver att hen gör.","en":"Who you are, which site it is, that the refrigeration has alarmed and the temperature is rising, and what you need them to do."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Korrekt men otillräckligt: personen vet inte var, hur illa det är, eller vad som förväntas av hen.","sv":"Att det gått ett larm på kylanläggningen och att du ringer enligt instruktionen.","en":"That the refrigeration has alarmed and that you are calling in line with the instruction."},
      {"k":"c","score":0,"pref":false,"err":"weak_communication","rat_sv":"Bakgrund först är det som gör att den viktiga uppgiften kommer sist till någon som inte lyssnar färdigt.","sv":"En redogörelse för ronden och vad du sett fram till larmet, så att hen får hela bilden.","en":"An account of the round and what you saw up to the alarm, so they get the whole picture."}]'::jsonb);

  -- B5  Documenting a near miss
  PERFORM pg_temp.author_scenario(_form, 15, 'b_observation', 'so-rj-b05',
    b_mand, c_mand, f_err, 'intermediate','judgement','mandate_and_escalation','mandate', false,
    'Dokumenterar en avvikelse som inte fick någon konsekvens.',
    'Slutet av ett pass, ingen skada skedd.',
    'Ett svar om dokumentation säger inget om personens allmänna ansvarstagande.',
    'I slutet av passet upptäcker du att en brandcellsdörr stått uppställd med en brandsläckare hela kvällen. Du tar bort släckaren och dörren stängs. Ingen har varit i utrymmet och inget har hänt.',
    'Vad gör du?',
    'At the end of your shift you find that a fire door has been propped open with a fire extinguisher all evening. You remove the extinguisher and the door closes. Nobody has been in the space and nothing has happened.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Avvikelsen är värd att notera just för att den upprepas — det är mönstret, inte kvällen, som är risken.","sv":"Notera avvikelsen med tid och plats även om inget hände, så att det syns om det upprepas.","en":"Record the deviation with time and place even though nothing happened, so it shows up if it recurs."},
      {"k":"b","score":1,"pref":false,"err":"failure_to_document","rat_sv":"Rätt fysisk åtgärd, men utan notering finns inget mönster att upptäcka nästa gång.","sv":"Ta bort släckaren och gå hem — problemet är löst.","en":"Remove the extinguisher and go home — the problem is solved."},
      {"k":"c","score":0,"pref":false,"err":"delayed_escalation","rat_sv":"Att vänta på att någon annan ska upptäcka det gör dig till den som visste och inget gjorde.","sv":"Nämna det muntligt till nästa pass om du råkar träffa dem.","en":"Mention it verbally to the next shift if you happen to run into them."}]'::jsonb);

  -- B6  Ordering an account
  PERFORM pg_temp.author_scenario(_form, 16, 'b_observation', 'so-rj-b06',
    b_rep, c_rep, f_doc, 'advanced','judgement','factual_reporting','judgement', false,
    'Ordnar en redogörelse så att förloppet går att följa.',
    'Skriftlig redogörelse som kan komma att läsas av utomstående.',
    'Ett svar om struktur säger inget om personens allmänna skrivförmåga.',
    'Du ska skriva en redogörelse som kan komma att läsas av polis och av uppdragsgivarens försäkringsbolag.',
    'Hur bygger du upp den?',
    'You are writing an account that may be read by the police and by the client''s insurer.',
    'How do you structure it?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Kronologi med tidsangivelser, sedan iakttagelser, sedan åtgärder — och egna bedömningar tydligt avskilda i slutet.","sv":"Kronologiskt med klockslag: vad som hände, vad du såg, vad du gjorde — och eventuella egna bedömningar tydligt markerade separat.","en":"Chronologically with times: what happened, what you saw, what you did — with any assessments of your own clearly marked separately."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Att inleda med slutsatsen färgar allt som följer och gör det svårare att se vad som faktiskt observerades.","sv":"Med din slutsats först, så att läsaren vet vad det handlar om, och underlaget efter.","en":"With your conclusion first so the reader knows what it is about, and the material after."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Att utelämna det som talar emot den egna versionen är det som gör en redogörelse värdelös när den prövas.","sv":"Med det som är relevant för händelsen, och utan detaljer som bara skapar oklarhet.","en":"With what is relevant to the event, leaving out details that only create confusion."}]'::jsonb);

-- ── BLOCK D — Integritet och tillförlitlighet (6) ──────────────────────────

  -- D1  Experienced colleague skipping steps
  PERFORM pg_temp.author_scenario(_form, 41, 'd_integrity', 'so-rj-d01',
    b_int, c_int, f_rule, 'intermediate','judgement','mandate_and_escalation','judgement', false,
    'Hanterar en kollegas genväg utan att göra det till en personfråga.',
    'Rondering på ett datacenter, två väktare, kväll.',
    'Ett scenario om en kollega säger inget om personens allmänna omdöme om andra.',
    'På ett datacenter ska besökslistan stämmas av mot faktiska besök vid varje passbyte. Din kollega, som arbetat där i sex år, gör avstämningen en gång i veckan i stället och säger att det aldrig har blivit fel på sex år.',
    'Vad gör du?',
    'At a data centre the visitor list is to be reconciled against actual visits at every shift change. Your colleague, who has worked there for six years, does the reconciliation once a week instead and says nothing has ever gone wrong in six years.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Gör rätt själv, tar upp det med kollegan, och för frågan vidare som en fråga om rutinen snarare än om personen.","sv":"Gör avstämningen vid varje passbyte själv, säg till kollegan att du gör det, och ta upp med arbetsledaren att rutinen tillämpas olika.","en":"Do the reconciliation at every shift change yourself, tell your colleague you are doing it, and raise with the supervisor that the procedure is applied differently."},
      {"k":"b","score":1,"pref":false,"err":"excessive_informal_trust","rat_sv":"Sex år utan fel säger något om sannolikheten, inte om konsekvensen. På ett datacenter är det konsekvensen som styr.","sv":"Följa kollegans arbetssätt eftersom hen känner objektet och det uppenbarligen fungerar.","en":"Follow your colleague''s way of working, since they know the site and it evidently works."},
      {"k":"c","score":0,"pref":false,"err":"delayed_escalation","rat_sv":"Att bara göra rätt själv i tysthet lämnar avsteget kvar och gör dig till den enda som vet om det.","sv":"Göra rätt själv och inte säga något, eftersom kollegan är mer erfaren än du.","en":"Do it properly yourself and say nothing, since your colleague is more experienced than you."}]'::jsonb);

  -- D2  Informal access request under social pressure
  PERFORM pg_temp.author_scenario(_form, 42, 'd_integrity', 'so-rj-d02',
    b_int, c_int, f_rule, 'advanced','judgement','mandate_and_escalation','mandate', true,
    'Håller en behörighetsgräns när begäran kommer från någon välkänd och sympatisk.',
    'Kontorsfastighet, sen kväll, ensam i receptionen.',
    'Ett scenario om social press säger inget om personens allmänna påverkbarhet.',
    'Klockan 22 kommer en anställd du känner igen väl — hen jobbar sent varje vecka och brukar prata med dig. Hen har glömt sitt passerkort och ber dig låsa upp till en avdelning där hen inte normalt har behörighet, för att hämta en pärm åt en kollega.',
    'Vad gör du?',
    'At 22:00 an employee you recognise well arrives — they work late every week and usually chat with you. They have forgotten their access card and ask you to unlock a department where they do not normally have authorisation, to collect a folder for a colleague.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Behörigheten, inte bekantskapen, avgör. Erbjuder samtidigt en väg som faktiskt kan lösa personens problem.","sv":"Säg nej till den avdelningen, förklara att din behörighet inte omfattar den, och erbjud att kontakta den som kan ge tillstånd.","en":"Say no to that department, explain that your authorisation does not cover it, and offer to contact somebody who can authorise it."},
      {"k":"b","score":1,"pref":false,"err":"outside_mandate","rat_sv":"Att följa med gör inte begäran behörig. Närvaron är en kontroll, inte ett tillstånd.","sv":"Följa med personen in och stå kvar medan hen hämtar pärmen, och notera det i loggen.","en":"Go in with them and stand there while they collect the folder, and note it in the log."},
      {"k":"c","score":0,"pref":false,"err":"excessive_informal_trust","rat_sv":"Att öppna på igenkänning är precis det arbetssätt en behörighetsordning finns för att förhindra.","sv":"Låsa upp, eftersom du känner igen personen och ärendet är rimligt.","en":"Unlock it, since you recognise the person and the errand is reasonable."}]'::jsonb);

  -- D3  Own unnoticed mistake
  PERFORM pg_temp.author_scenario(_form, 43, 'd_integrity', 'so-rj-d03',
    b_mand, c_mand, f_err, 'intermediate','judgement','mandate_and_escalation','mandate', false,
    'Tar ansvar för ett eget fel som ingen annan upptäckt.',
    'Efter avslutat pass, hemma.',
    'Ett scenario om ett eget fel säger inget om personens ärlighet som egenskap.',
    'När du kommit hem inser du att du glömde låsa en dörr till ett förråd vid sista ronden. Passet är slut, nästa väktare är på plats, och ingen har sagt något.',
    'Vad gör du?',
    'After you get home you realise you forgot to lock a store room door on your last round. Your shift is over, the next officer is on site, and nobody has said anything.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Åtgärdar risken nu och lämnar spår efter sig. Att någon annan kan ha upptäckt det är inte ett skäl att låta bli.","sv":"Ring objektet direkt så att dörren kontrolleras, och skriv en egen avvikelse om att du missat den.","en":"Call the site straight away so the door gets checked, and write your own deviation report saying you missed it."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Att vänta till nästa pass innebär att risken står öppen under tiden, av bekvämlighetsskäl.","sv":"Ta upp det när du kommer på jobbet nästa gång, så att det blir sagt.","en":"Raise it when you next come in, so that it gets said."},
      {"k":"c","score":0,"pref":false,"err":"failure_to_document","rat_sv":"Att lita på nästa rond löser möjligen dörren men lämnar avvikelsen odokumenterad, vilket är den del som betyder något över tid.","sv":"Anta att nästa väktares rond fångar upp det, eftersom förrådet ingår i ronden.","en":"Assume the next officer''s round catches it, since the store room is on the round."}]'::jsonb);

  -- D4  Incomplete documentation found later
  PERFORM pg_temp.author_scenario(_form, 44, 'd_integrity', 'so-rj-d04',
    b_rep, c_rep, f_doc, 'advanced','judgement','factual_reporting','judgement', false,
    'Rättar en ofullständig dokumentation i efterhand utan att skriva om historien.',
    'Vecka efter en händelse, inför en genomgång.',
    'Ett scenario om rättelse säger inget om personens allmänna noggrannhet.',
    'Inför en genomgång läser du din egen rapport från förra veckan och ser att du utelämnat att du var ensam på objektet när händelsen inträffade. Rapporten är i övrigt korrekt.',
    'Vad gör du?',
    'Ahead of a review you read your own report from last week and see that you left out the fact that you were alone on site when the incident happened. The report is otherwise correct.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Komplettering i efterhand, daterad och märkt som sådan. Originalet står kvar, vilket är hela poängen med ett spår.","sv":"Lägg till en daterad komplettering om bemanningen och säg vid genomgången att den tillkommit i efterhand.","en":"Add a dated addendum about the staffing and say at the review that it was added afterwards."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Muntligt håller för mötet men inte för någon som läser rapporten om ett år.","sv":"Nämna det muntligt vid genomgången utan att ändra i rapporten.","en":"Mention it verbally at the review without changing the report."},
      {"k":"c","score":0,"pref":false,"err":"failure_to_document","rat_sv":"Att redigera originalet gör rapporten oanvändbar som spår, oavsett hur riktig den blir.","sv":"Redigera rapporten så att den blir korrekt från början.","en":"Edit the report so that it is correct from the start."}]'::jsonb);

  -- D5  Shortcut under time pressure
  PERFORM pg_temp.author_scenario(_form, 45, 'd_integrity', 'so-rj-d05',
    b_judg, c_judg, f_prop, 'advanced','judgement','prioritisation','judgement', false,
    'Väljer vad som prioriteras bort när tiden inte räcker, och redovisar valet.',
    'Sista ronden, ett larm har tagit tid, passet tar slut om trettio minuter.',
    'Ett scenario om tidsbrist säger inget om personens allmänna arbetstempo.',
    'Ett larm har tagit fyrtio minuter av ditt pass. Du har trettio minuter kvar och en rond som normalt tar femtio. Ronden omfattar tolv kontrollpunkter, varav tre är utrymmen med skyddsvärde och nio är allmänna utrymmen.',
    'Vad gör du?',
    'An alarm has taken forty minutes of your shift. You have thirty minutes left and a round that normally takes fifty. The round covers twelve checkpoints, three of which are areas with protective value and nine of which are general areas.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Prioriterar efter skyddsvärde, kvitterar bara det som faktiskt gjorts, och lämnar över det som inte hanns med.","sv":"Gå de tre skyddsvärda punkterna och så många av de övriga du hinner, kvittera bara de du gått, och skriv i överlämningen vilka som inte hanns med.","en":"Do the three protected points and as many of the others as you can, sign off only the ones you visited, and record in the handover which ones were not covered."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Rimlig prioritering, men utan överlämning vet nästa pass inte vad som är okontrollerat.","sv":"Gå de tre skyddsvärda punkterna och avsluta passet där.","en":"Do the three protected points and end the shift there."},
      {"k":"c","score":0,"pref":false,"err":"failure_to_document","rat_sv":"Att kvittera det som inte gjorts gör loggen osann, vilket är allvarligare än en ogjord rond.","sv":"Gå så många punkter du hinner och kvittera resten så att ronden ser fullständig ut.","en":"Do as many points as you can and sign off the rest so the round looks complete."}]'::jsonb);

  -- D6  Informal request to look somebody up
  PERFORM pg_temp.author_scenario(_form, 46, 'd_integrity', 'so-rj-d06',
    b_int, c_int, f_rule, 'intermediate','judgement','mandate_and_escalation','mandate', false,
    'Hanterar en begäran om att använda systeminformation utanför uppdraget.',
    'Personalrum, samtal med en anställd hos uppdragsgivaren.',
    'Ett scenario om informationshantering säger inget om personens allmänna diskretion.',
    'En anställd hos uppdragsgivaren frågar om du kan kolla i passersystemet vilken tid en viss kollega gick hem i går. Hen säger att det gäller en diskussion om vem som lämnade kaffemaskinen påslagen.',
    'Vad gör du?',
    'An employee of the client asks whether you can check in the access system what time a particular colleague went home yesterday. They say it concerns an argument about who left the coffee machine on.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Nej med skäl, och en anvisning om var frågan hör hemma. Behovet försvinner inte men vägen dit blir den rätta.","sv":"Säg nej och förklara att passerdata bara får användas för säkerhetsändamål — och hänvisa frågan till uppdragsgivarens egen chef.","en":"Say no and explain that access data may only be used for security purposes — and refer the question to the client''s own manager."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Ett nej utan skäl lämnar personen med intrycket att det är godtycke, och frågan kommer tillbaka till nästa väktare.","sv":"Säg att du inte får göra det och gå vidare.","en":"Say that you are not allowed to and move on."},
      {"k":"c","score":0,"pref":false,"err":"excessive_informal_trust","rat_sv":"Att uppgiften är harmlös ändrar inte att den hämtats ur ett system som finns för något annat.","sv":"Titta efter, eftersom uppgiften är harmlös och personen ändå kan fråga sin chef.","en":"Look it up, since the information is harmless and they could ask their manager anyway."}]'::jsonb);

-- ── BLOCK E — Reflektion (4) ───────────────────────────────────────────────

  PERFORM pg_temp.author_reflection(_form, 47, 'e_reflection', 'so-rj-e01',
    b_mand, c_mand, f_err,
    'Redogör för ett eget misstag och vad som gjordes efteråt.',
    'Ett svar på en reflektionsfråga säger något om hur personen beskriver en händelse, inte om hur personen faktiskt agerade.',
    'Den här frågan har inget rätt svar. En människa läser ditt svar.',
    'Beskriv en situation där du gjorde ett misstag på jobbet. Vad gjorde du efteråt?',
    'This question has no right answer. A person reads what you write.',
    'Describe a situation where you made a mistake at work. What did you do afterwards?');

  PERFORM pg_temp.author_reflection(_form, 48, 'e_reflection', 'so-rj-e02',
    b_serv, c_serv, f_bound,
    'Redogör för hur en gräns hållits när det var socialt obekvämt.',
    'Ett svar på en reflektionsfråga säger inget om personens allmänna social förmåga.',
    'Den här frågan har inget rätt svar. En människa läser ditt svar.',
    'Beskriv en situation där du behövde säga nej till någon trots att det var socialt obekvämt.',
    'This question has no right answer. A person reads what you write.',
    'Describe a situation where you had to say no to somebody even though it was socially uncomfortable.');

  PERFORM pg_temp.author_reflection(_form, 49, 'e_reflection', 'so-rj-e03',
    b_sit, c_sit, f_anom,
    'Redogör för hur uppmärksamhet hållits uppe under repetitivt arbete.',
    'Ett svar om koncentration säger inget om personens allmänna uthållighet.',
    'Den här frågan har inget rätt svar. En människa läser ditt svar. Arbetet behöver inte ha varit inom säkerhet.',
    'Beskriv en situation där du behövde hålla koncentrationen uppe under upprepat arbete. Hur gjorde du?',
    'This question has no right answer. A person reads what you write. The work does not have to have been in security.',
    'Describe a situation where you had to maintain concentration during repetitive work. How did you do it?');

  PERFORM pg_temp.author_reflection(_form, 50, 'e_reflection', 'so-rj-e04',
    b_judg, c_judg, f_prop,
    'Redogör för hur en felaktig uppgift upptäcktes och hanterades.',
    'Ett svar om felaktig information säger inget om personens allmänna kritiska tänkande.',
    'Den här frågan har inget rätt svar. En människa läser ditt svar.',
    'Beskriv en situation där information du fick från början visade sig vara felaktig. Vad gjorde du då?',
    'This question has no right answer. A person reads what you write.',
    'Describe a situation where information you were given initially turned out to be wrong. What did you do then?');

-- ── BLOCK C — Arbetsbeteende inom säkerhetsarbete (24) ─────────────────────
--
-- SELF-REPORT. Every item here is declared evidence_source_type = 'self_report'
-- by pg_temp.author_selfreport, so nothing in this block can reach
-- scp_compute_maturity or appear on an observed line. It is reported to the
-- employer in its own section, labelled as what the person said about
-- themselves.
--
-- Two authoring rules, applied throughout:
--
--   * No transparent virtue items. "I am always honest" measures whether
--     somebody knows what a test wants. Every statement here describes a
--     concrete, ordinary working situation with a defensible pull in both
--     directions, and roughly half are worded so that agreeing describes the
--     SHORTCUT rather than the ideal.
--   * Three items per domain, worded differently, so that answers pointing
--     different ways within a domain produce the consistency signal §12 asks
--     for -- an area to explore in interview, and never a claim that anybody
--     was untruthful.

  -- Domain 1: Procedure adherence (SCC-09 / genomförandedisciplin)
  PERFORM pg_temp.author_selfreport(_form, 17, 'c_behaviour', 'so-rj-c01',
    b_mand, c_mand, f_disc,
    'Beskriver sin egen följsamhet mot rutin när situationen ser enkel ut.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Om en rutin känns onödigt lång och situationen ser okomplicerad ut förenklar jag ibland stegen.',
    'Hur ofta stämmer det?',
    'If a procedure feels unnecessarily long and the situation looks straightforward, I sometimes simplify the steps.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att genvägen inte tas.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att genvägen tas regelmässigt.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 18, 'c_behaviour', 'so-rj-c02',
    b_mand, c_mand, f_disc,
    'Beskriver om avsteg från rutin dokumenteras.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'När jag avviker från en rutin skriver jag ner varför, även när avvikelsen var uppenbart rimlig.',
    'Hur ofta stämmer det?',
    'When I depart from a procedure I write down why, even when the departure was obviously reasonable.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att avsteg inte dokumenteras.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att avsteg dokumenteras genomgående.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 19, 'c_behaviour', 'so-rj-c03',
    b_mand, c_mand, f_disc,
    'Uttrycker en preferens mellan att lösa snabbt och att kontrollera en gång till.',
    'Ett preferensval beskriver ett arbetssätt, inte en personlighet.',
    'Två sätt att arbeta. Inget av dem är fel.',
    'Vilket liknar dig mest?',
    'Two ways of working. Neither is wrong.',
    'Which is more like you?',
    '[{"k":"a","score":1,"rat_sv":"Beskriver handlingsinriktning framför kontroll.","sv":"Jag löser hellre ett problem direkt när jag tror att jag förstått situationen.","en":"I prefer to deal with a problem straight away once I believe I understand the situation."},
      {"k":"b","score":3,"rat_sv":"Beskriver kontroll framför handlingsinriktning. I bevakningsarbete är verifiering det mer hållbara arbetssättet, men båda svaren är rimliga beskrivningar av en person.","sv":"Jag kontrollerar hellre uppgiften en gång till innan jag agerar.","en":"I prefer to check the information once more before I act."}]'::jsonb);

  -- Domain 2: Attention to detail (SCC-03 / aktiv scanning)
  PERFORM pg_temp.author_selfreport(_form, 20, 'c_behaviour', 'so-rj-c04',
    b_sit, c_sit, f_scan,
    'Beskriver om små avvikelser förs vidare eller bara noteras mentalt.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'När jag lägger märke till något litet som avviker nöjer jag mig oftast med att komma ihåg det.',
    'Hur ofta stämmer det?',
    'When I notice something small that is out of place, I usually settle for remembering it.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att iakttagelsen förs vidare.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att iakttagelsen stannar i huvudet.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 21, 'c_behaviour', 'so-rj-c05',
    b_sit, c_sit, f_scan,
    'Beskriver om tid och plats antecknas vid iakttagelse.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Jag antecknar tid och plats direkt när jag ser något, inte i efterhand.',
    'Hur ofta stämmer det?',
    'I write down the time and place as soon as I see something, not afterwards.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att anteckningen görs i efterhand eller inte alls.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att anteckningen görs på plats.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 22, 'c_behaviour', 'so-rj-c06',
    b_sit, c_sit, f_scan,
    'Uttrycker en preferens mellan helhetsbild och detaljkontroll.',
    'Ett preferensval beskriver ett arbetssätt, inte en personlighet.',
    'Två sätt att gå en rond. Inget av dem är fel.',
    'Vilket liknar dig mest?',
    'Two ways of walking a round. Neither is wrong.',
    'Which is more like you?',
    '[{"k":"a","score":1,"rat_sv":"Beskriver överblick framför systematik.","sv":"Jag skaffar mig en överblick och litar på att avvikelser sticker ut.","en":"I take in the overall picture and trust that anything out of place will stand out."},
      {"k":"b","score":3,"rat_sv":"Beskriver systematik framför överblick. Båda är rimliga; systematiken är den som håller när uppmärksamheten sviktar.","sv":"Jag går igenom samma punkter i samma ordning varje gång.","en":"I go through the same points in the same order every time."}]'::jsonb);

  -- Domain 3: Sustained attention (SCC-03 / avvikelseigenkänning)
  PERFORM pg_temp.author_selfreport(_form, 23, 'c_behaviour', 'so-rj-c07',
    b_sit, c_sit, f_anom,
    'Beskriver egen medvetenhet om autopilot vid upprepad kontroll.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'När jag har gjort samma kontroll många gånger behöver jag påminna mig själv om att inte gå på autopilot.',
    'Hur ofta stämmer det?',
    'After doing the same check many times, I need to remind myself not to go on autopilot.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Att aldrig känna igen fenomenet är i sig något att fråga om — inte ett tecken på uthållighet.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":3,"rat_sv":"Beskriver aktiv självobservation, vilket är det som går att arbeta med.","sv":"Ofta","en":"Often"},
      {"k":"d","score":2,"rat_sv":"","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 24, 'c_behaviour', 'so-rj-c08',
    b_sit, c_sit, f_anom,
    'Beskriver om ett konkret motmedel används mot rutinblindhet.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Jag har ett konkret sätt att bryta rutinen när uppmärksamheten börjar svikta, till exempel att byta ordning eller ta en kort paus.',
    'Hur ofta stämmer det?',
    'I have a concrete way of breaking the routine when my attention starts to slip — changing the order, or taking a short break.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att inget motmedel finns.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver ett etablerat motmedel.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 25, 'c_behaviour', 'so-rj-c09',
    b_sit, c_sit, f_anom,
    'Beskriver om sena timmar påverkar det egna arbetssättet.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Sent på ett nattpass går jag igenom kontrollpunkterna snabbare än i början av passet.',
    'Hur ofta stämmer det?',
    'Late in a night shift I go through the checkpoints faster than at the start of the shift.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver ett jämnt arbetstempo genom passet.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att tempot ökar när uppmärksamheten sannolikt är som lägst.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  -- Domain 4: Information discipline (SCC-01 / regel- och syfteslojalitet)
  PERFORM pg_temp.author_selfreport(_form, 26, 'c_behaviour', 'so-rj-c10',
    b_int, c_int, f_rule,
    'Beskriver hantering av arbetsrelaterad information utanför arbetet.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Jag berättar om händelser från jobbet för familj eller vänner, utan namn men med detaljer.',
    'Hur ofta stämmer det?',
    'I tell family or friends about things that happen at work — without names, but with detail.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att arbetsinformation stannar i arbetet.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver regelmässigt berättande om händelser utanför arbetet.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 27, 'c_behaviour', 'so-rj-c11',
    b_int, c_int, f_rule,
    'Beskriver om skälet till ett nej förklaras för den som frågar.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'När jag inte kan lämna ut information förklarar jag varför, i stället för att bara säga att det inte går.',
    'Hur ofta stämmer det?',
    'When I cannot share information I explain why, rather than just saying that I cannot.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver ett nej utan skäl.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att skälet förklaras.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 28, 'c_behaviour', 'so-rj-c12',
    b_int, c_int, f_rule,
    'Beskriver hantering av bilder och anteckningar från arbetsplatsen.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Jag använder min egen telefon för att fotografera eller anteckna sådant jag behöver komma ihåg från passet.',
    'Hur ofta stämmer det?',
    'I use my own phone to photograph or note things I need to remember from a shift.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att arbetsmaterial hålls i arbetets egna system.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att arbetsmaterial regelmässigt hamnar på privat utrustning.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  -- Domain 5: Responsibility for mistakes (SCC-09 / fel- och avvikelseansvar)
  PERFORM pg_temp.author_selfreport(_form, 29, 'c_behaviour', 'so-rj-c13',
    b_mand, c_mand, f_err,
    'Beskriver om egna fel rapporteras när ingen annan sett dem.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Om jag upptäcker ett litet fel som ingen annan verkar ha sett rapporterar eller dokumenterar jag det ändå.',
    'Hur ofta stämmer det?',
    'If I notice a small mistake that nobody else appears to have seen, I still report or document it.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att felet stannar hos personen.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att felet rapporteras oavsett upptäcktsrisk.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 30, 'c_behaviour', 'so-rj-c14',
    b_mand, c_mand, f_err,
    'Beskriver den egna tröskeln för vad som räknas som värt att rapportera.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Om ett misstag inte fick någon konsekvens tycker jag att det räcker att åtgärda det.',
    'Hur ofta stämmer det?',
    'If a mistake had no consequence, I think it is enough to just put it right.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att även konsekvenslösa avvikelser dokumenteras.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att konsekvensen avgör om något dokumenteras.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 31, 'c_behaviour', 'so-rj-c15',
    b_mand, c_mand, f_err,
    'Beskriver om det egna arbetssättet ändras efter ett fel.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'När jag gjort ett fel ändrar jag något konkret i hur jag arbetar, inte bara hur noga jag tänker vara.',
    'Hur ofta stämmer det?',
    'After making a mistake I change something concrete in how I work, not just how careful I intend to be.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver avsikt snarare än förändring.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver en konkret förändring av arbetssättet.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  -- Domain 6: Boundary-setting under social pressure (SCC-07 / gränshållning)
  PERFORM pg_temp.author_selfreport(_form, 32, 'c_behaviour', 'so-rj-c16',
    b_serv, c_serv, f_bound,
    'Beskriver hur den egna gränsen påverkas av vem som frågar.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Det är svårare för mig att säga nej till någon jag känner väl än till någon jag aldrig träffat.',
    'Hur ofta stämmer det?',
    'It is harder for me to say no to somebody I know well than to somebody I have never met.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att gränsen inte förskjuts av bekantskap. Notera att den som aldrig känner detta är ovanlig — frågan är avsedd att utforskas i intervju.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att bekantskap gör gränsen svårare att hålla.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 33, 'c_behaviour', 'so-rj-c17',
    b_serv, c_serv, f_bound,
    'Beskriver om ett nej åtföljs av en väg framåt för den som frågar.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'När jag säger nej försöker jag samtidigt erbjuda ett sätt för personen att lösa sitt ärende.',
    'Hur ofta stämmer det?',
    'When I say no I try at the same time to offer a way for the person to get their business done.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver ett nej utan väg framåt.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver ett nej med en anvisad väg.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 34, 'c_behaviour', 'so-rj-c18',
    b_serv, c_serv, f_bound,
    'Uttrycker en preferens mellan att hålla fast och att söka stöd under press.',
    'Ett preferensval beskriver ett arbetssätt, inte en personlighet.',
    'Två sätt att hantera att någon fortsätter tjata efter ett nej. Inget av dem är fel.',
    'Vilket liknar dig mest?',
    'Two ways of handling somebody who keeps pushing after a no. Neither is wrong.',
    'Which is more like you?',
    '[{"k":"a","score":1,"rat_sv":"Beskriver uthållighet i egen sak.","sv":"Jag upprepar mitt svar och står kvar tills personen ger sig.","en":"I repeat my answer and stand my ground until they give up."},
      {"k":"b","score":3,"rat_sv":"Beskriver att frågan lyfts. Båda är rimliga; att koppla in någon annan är det som håller över ett helt pass.","sv":"Jag kopplar in någon annan som kan ta beslutet, hellre än att bara stå emot.","en":"I bring in somebody who can make the decision, rather than just holding out."}]'::jsonb);

  -- Domain 7: Escalation behaviour (SCC-06 / eskalering och överlämning)
  PERFORM pg_temp.author_selfreport(_form, 35, 'c_behaviour', 'so-rj-c19',
    b_comm, c_comm, f_esc,
    'Beskriver den egna tröskeln för att kontakta någon annan.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Jag försöker lösa saker själv först, så att jag inte stör någon i onödan.',
    'Hur ofta stämmer det?',
    'I try to sort things out myself first, so as not to disturb anybody unnecessarily.',
    'How often is that true?',
    '[{"k":"a","score":2,"rev":true,"rat_sv":"","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":3,"rev":true,"rat_sv":"Beskriver en tröskel som varken är för hög eller obefintlig.","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver en hög tröskel för att kontakta någon, vilket är den vanligaste orsaken till sen eskalering.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 36, 'c_behaviour', 'so-rj-c20',
    b_comm, c_comm, f_esc,
    'Beskriver hur en osäker eskalering hanteras i efterhand.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Om jag larmat i onödan tar jag upp det efteråt i stället för att låta det passera.',
    'Hur ofta stämmer det?',
    'If I have escalated unnecessarily, I raise it afterwards rather than letting it pass.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att den egna felbedömningen inte tas upp.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att den egna felbedömningen tas upp.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 37, 'c_behaviour', 'so-rj-c21',
    b_comm, c_comm, f_esc,
    'Beskriver om det som inte hunnits med förs vidare vid passets slut.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Vid passets slut säger jag uttryckligen vad jag inte hann med, inte bara vad jag gjorde.',
    'Hur ofta stämmer det?',
    'At the end of a shift I say explicitly what I did not get to, not only what I did.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att det ogjorda inte förs vidare.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver att det ogjorda förs vidare.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  -- Domain 8: Self-control under pressure (SCC-04 / återhämtning)
  PERFORM pg_temp.author_selfreport(_form, 38, 'c_behaviour', 'so-rj-c22',
    b_prop, c_prop, f_recov,
    'Beskriver hur lång tid det tar att återgå efter en provokation.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Efter en obehaglig ordväxling märker jag att jag är kortare i tonen mot nästa person jag möter.',
    'Hur ofta stämmer det?',
    'After an unpleasant exchange I notice that I am shorter with the next person I meet.',
    'How often is that true?',
    '[{"k":"a","score":3,"rev":true,"rat_sv":"Beskriver att bemötandet inte färgas av föregående situation.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":2,"rev":true,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":1,"rev":true,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":0,"rev":true,"rat_sv":"Beskriver att bemötandet färgas av föregående situation.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 39, 'c_behaviour', 'so-rj-c23',
    b_prop, c_prop, f_recov,
    'Beskriver om ett medvetet sätt att återgå finns.',
    'Ett självrapporterat svar beskriver hur personen ser på sitt arbetssätt, inte hur personen faktiskt arbetar.',
    'Jag har något jag gör medvetet för att komma tillbaka efter en pressad situation.',
    'Hur ofta stämmer det?',
    'I have something I do deliberately to get back on an even keel after a tense situation.',
    'How often is that true?',
    '[{"k":"a","score":0,"rat_sv":"Beskriver att inget medvetet sätt finns.","sv":"Nästan aldrig","en":"Almost never"},
      {"k":"b","score":1,"rat_sv":"","sv":"Ibland","en":"Sometimes"},
      {"k":"c","score":2,"rat_sv":"","sv":"Ofta","en":"Often"},
      {"k":"d","score":3,"rat_sv":"Beskriver ett etablerat sätt att återgå.","sv":"Nästan alltid","en":"Almost always"}]'::jsonb);

  PERFORM pg_temp.author_selfreport(_form, 40, 'c_behaviour', 'so-rj-c24',
    b_prop, c_prop, f_recov,
    'Uttrycker en preferens mellan att avsluta samtalet och att fortsätta förklara.',
    'Ett preferensval beskriver ett arbetssätt, inte en personlighet.',
    'Två sätt att hantera ett samtal som håller på att gå överstyr. Inget av dem är fel.',
    'Vilket liknar dig mest?',
    'Two ways of handling a conversation that is getting out of hand. Neither is wrong.',
    'Which is more like you?',
    '[{"k":"a","score":1,"rat_sv":"Beskriver uthållighet i samtalet.","sv":"Jag fortsätter förklara tills personen förstår varför beslutet är som det är.","en":"I keep explaining until the person understands why the decision is what it is."},
      {"k":"b","score":3,"rat_sv":"Beskriver att samtalet avslutas i tid. Båda är rimliga; att avsluta är oftare det som håller nivån nere.","sv":"Jag avslutar samtalet i tid och hänvisar vidare, hellre än att fortsätta.","en":"I end the conversation in good time and refer them on, rather than continuing."}]'::jsonb);

  RAISE NOTICE 'security-officer-recruitment: 50 items authored';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rubrics for the four reflection items
--
-- A constructed response has no governed contribution without one — and that
-- refusal (SCP_NO_RUBRIC) is correct, so the rubric is authored here rather
-- than the requirement being relaxed.
--
-- Four dimensions each. Writing quality is present as a dimension and marked
-- assesses_writing_quality, which means it is shown to the reviewer and
-- deliberately excluded from the derived contribution: a person who writes
-- plainly about a real situation must not score below somebody who writes
-- elegantly about nothing. must_not_infer names, in data, the readings a
-- reviewer may not make from a piece of prose about somebody's life.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_rubrics (slug) VALUES
  ('so-rj-e01-own-mistake'), ('so-rj-e02-saying-no'),
  ('so-rj-e03-sustained-attention'), ('so-rj-e04-wrong-information')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_rubric_versions
  (rubric_id, item_version_id, version_number, content_status, name_sv, name_en, must_not_infer)
SELECT r.id, iv.id, 1, 'draft', v.sv, v.en,
  ARRAY['personlighet','ärlighet som egenskap','motivation','känsloläge','avsikt',
        'intelligens','psykisk hälsa','framtida arbetsprestation','lämplighet för anställning',
        'skyddade personliga egenskaper','språklig elegans']
FROM (VALUES
 ('so-rj-e01-own-mistake','so-rj-e01','Eget misstag och åtgärd','Own mistake and what followed'),
 ('so-rj-e02-saying-no','so-rj-e02','Gränshållning under socialt tryck','Boundary-setting under social pressure'),
 ('so-rj-e03-sustained-attention','so-rj-e03','Uthållig uppmärksamhet','Sustained attention'),
 ('so-rj-e04-wrong-information','so-rj-e04','Hantering av felaktig uppgift','Handling wrong information')
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
 ('so-rj-e01-own-mistake','concrete_situation',1,'Konkret situation','Concrete situation',
  'En verklig, avgränsad händelse beskrivs — inte en princip eller en styrka i förklädnad.',
  'A real, bounded event is described — not a principle or a strength in disguise.',false),
 ('so-rj-e01-own-mistake','what_was_done',2,'Vidtagen åtgärd','Action taken',
  'Det framgår vad personen faktiskt gjorde efteråt och vem som fick veta.',
  'What the person actually did afterwards, and who was told, is stated.',false),
 ('so-rj-e01-own-mistake','ownership',3,'Ägarskap','Ownership',
  'Ansvaret placeras hos personen själv snarare än hos förutsättningarna.',
  'Responsibility is located with the person rather than with the circumstances.',false),
 ('so-rj-e01-own-mistake','clarity',4,'Tydlighet','Clarity',
  'Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat.',
  'The account can be followed. Simple language is judged equal to polished.',true),

 ('so-rj-e02-saying-no','concrete_situation',1,'Konkret situation','Concrete situation',
  'En verklig situation med en identifierbar motpart beskrivs.',
  'A real situation with an identifiable other party is described.',false),
 ('so-rj-e02-saying-no','held_the_line',2,'Hållen gräns','Line held',
  'Det framgår vad personen sa och gjorde, och att gränsen faktiskt hölls eller varför den inte gjorde det.',
  'What the person said and did is stated, and whether the line actually held or why it did not.',false),
 ('so-rj-e02-saying-no','respectful_handling',3,'Bemötande','Handling of the other party',
  'Motparten beskrivs som en person med ett ärende, inte som en motståndare.',
  'The other party is described as a person with a need, not as an adversary.',false),
 ('so-rj-e02-saying-no','clarity',4,'Tydlighet','Clarity',
  'Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat.',
  'The account can be followed. Simple language is judged equal to polished.',true),

 ('so-rj-e03-sustained-attention','concrete_situation',1,'Konkret situation','Concrete situation',
  'Ett verkligt arbete beskrivs. Det behöver inte vara säkerhetsarbete.',
  'A real piece of work is described. It does not have to be security work.',false),
 ('so-rj-e03-sustained-attention','method',2,'Konkret arbetssätt','Concrete method',
  'Något faktiskt görs för att hålla uppmärksamheten uppe, utöver att vilja det.',
  'Something is actually done to hold attention, beyond intending to.',false),
 ('so-rj-e03-sustained-attention','self_observation',3,'Självobservation','Self-observation',
  'Personen kan beskriva hur hen märker att uppmärksamheten sviktar.',
  'The person can describe how they notice their attention slipping.',false),
 ('so-rj-e03-sustained-attention','clarity',4,'Tydlighet','Clarity',
  'Redogörelsen går att följa. Enkelt språk bedöms likvärdigt med polerat.',
  'The account can be followed. Simple language is judged equal to polished.',true),

 ('so-rj-e04-wrong-information','concrete_situation',1,'Konkret situation','Concrete situation',
  'En verklig uppgift som visade sig felaktig beskrivs.',
  'A real piece of information that turned out to be wrong is described.',false),
 ('so-rj-e04-wrong-information','verification',2,'Kontroll','Verification',
  'Det framgår hur felet upptäcktes och vad som kontrollerades.',
  'How the error was discovered and what was checked is stated.',false),
 ('so-rj-e04-wrong-information','correction_forward',3,'Rättelse framåt','Correcting forward',
  'De som agerat på den felaktiga uppgiften informerades, eller så framgår varför inte.',
  'Those who had acted on the wrong information were told, or it is clear why not.',false),
 ('so-rj-e04-wrong-information','clarity',4,'Tydlighet','Clarity',
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
WHERE r.slug LIKE 'so-rj-e0%'
ON CONFLICT (rubric_dimension_id, level) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Proof
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _obs int; _self int; _blocks int; _langs int; _ungated int;
BEGIN
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE f.slug = 'security-officer-recruitment-form-a';
  IF _n <> 50 THEN
    RAISE EXCEPTION 'SCP_SO_ITEM_COUNT: expected 50 items on the form, found %.', _n;
  END IF;

  SELECT count(*) FILTER (WHERE iv.evidence_source_type = 'assessment_response'),
         count(*) FILTER (WHERE iv.evidence_source_type = 'self_report')
    INTO _obs, _self
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a';
  IF _obs <> 26 OR _self <> 24 THEN
    RAISE EXCEPTION 'SCP_SO_EVIDENCE_SPLIT: expected 26 observed and 24 '
      'self-report items, found % and %.', _obs, _self;
  END IF;

  SELECT count(*) INTO _blocks FROM public.scp_form_blocks b
    JOIN public.scp_forms f ON f.id = b.form_id
   WHERE f.slug = 'security-officer-recruitment-form-a';
  IF _blocks <> 5 THEN
    RAISE EXCEPTION 'SCP_SO_BLOCKS: expected 5 declared sections, found %.', _blocks;
  END IF;

  -- Both languages on every item and every option, or the assessment is not
  -- bilingual and the library must not claim it is.
  SELECT count(*) INTO _langs
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND (SELECT count(DISTINCT t.language) FROM public.scp_item_texts t
           WHERE t.item_version_id = fi.item_version_id) <> 2;
  IF _langs > 0 THEN
    RAISE EXCEPTION 'SCP_SO_LANGUAGE_GAP: % item(s) are not present in both '
      'sv-SE and en-GB.', _langs;
  END IF;

  SELECT count(*) INTO _langs
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_options o ON o.item_version_id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND (SELECT count(DISTINCT ot.language) FROM public.scp_item_option_texts ot
           WHERE ot.item_option_id = o.id) <> 2;
  IF _langs > 0 THEN
    RAISE EXCEPTION 'SCP_SO_OPTION_LANGUAGE_GAP: % option(s) are not present in '
      'both languages.', _langs;
  END IF;

  -- Governance honesty: nothing here may claim review it has not had.
  SELECT count(*) INTO _ungated
    FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND (iv.content_status <> 'draft' OR iv.validation_status <> 'design'
       OR NOT iv.authored_by_ai
       OR (SELECT count(*) FROM public.scp_review_requirements rr
            WHERE rr.item_version_id = iv.id AND rr.status = 'outstanding') <> 5);
  IF _ungated > 0 THEN
    RAISE EXCEPTION 'SCP_SO_GOVERNANCE_CLAIM: % item(s) do not carry draft '
      'status, AI authorship and five outstanding review gates.', _ungated;
  END IF;

  RAISE NOTICE 'security-officer-recruitment proven: 50 items, 26 observed / 24 self-reported, 5 sections, bilingual, all gates outstanding';
END $$;
