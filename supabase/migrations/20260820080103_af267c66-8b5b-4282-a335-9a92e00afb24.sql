-- #51 Batch 5 — Incidenthantering & första åtgärder.
--
-- Twelve items about the first minutes: securing the situation, getting the
-- right information to the right function, preserving what matters, and not
-- improvising past the edge of the mandate.
--
-- ── THE CONSTRUCT ───────────────────────────────────────────────────────
--
-- The first action in an incident is rarely the dramatic one. It is usually
-- deciding what NOT to do: not moving something, not entering, not deciding
-- alone, not waiting. Every item therefore contrasts a defensible first action
-- with two that are individually reasonable but wrong here -- acting too early,
-- acting too late, or acting outside what a guard may actually do.
--
-- Nine items are safety-critical and route to human review. That is the highest
-- proportion in the library, and it is deliberate: this is the assessment where
-- a wrong answer maps onto real harm, and a deterministic score alone should
-- not be the whole evidence.
--
-- No item asks the participant to perform medical care, exercise a legal power,
-- or make a decision that belongs to the emergency services.
--
-- draft/design, all five review gates outstanding, authored_by_ai = true.

-- ═══════════════════════════════════════════════════════════════════════════
-- Authoring helper
--
-- 65 governed items across five assessments is a lot of INSERT. Written out
-- longhand it would be unreadable, and unreadable content is content nobody
-- reviews. The helper takes one item as data and expands it into the six tables
-- the governance model requires, so the migration body reads as the scenarios
-- themselves rather than as plumbing.
--
-- pg_temp, so it exists only for this migration and cannot become an
-- unversioned authoring API.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.author_item(
  _form         uuid,
  _order        int,
  _slug         text,
  _behaviour    uuid,
  _competency   uuid,
  _format       text,
  _difficulty   text,
  _demand       text,
  _construct    text,
  _tests_what   text,
  _safety       boolean,
  _human_review boolean,
  _observable   text,
  _context_sv   text,
  _guard_sv     text,
  _scenario_sv  text,
  _prompt_sv    text,
  _scenario_en  text,
  _prompt_en    text,
  _opts         jsonb   -- [{k,score,pref,err,rat_sv,sv,en}]
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
     competency_id, primary_behaviour_id, mode, observable_behavior,
     response_process, legal_basis_required, jurisdiction_id, difficulty,
     cognitive_demand, primary_construct, tests_what, is_safety_critical,
     requires_human_review, work_context_sv, overgeneralisation_guard_sv,
     -- Authored by an AI assistant and recorded as such. The review gates below
     -- are what turn this into validated content; this flag is what stops
     -- anyone mistaking draft AI content for expert-reviewed material.
     authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', _format, _competency, _behaviour, 'assessment',
     _observable,
     'Situationsbedömning: deltagaren väljer handling utifrån det som faktiskt går att observera.',
     false, _jur, _difficulty, _demand, _construct, _tests_what, _safety,
     _human_review, _context_sv, _guard_sv, true,
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

  -- The content review gates. Outstanding on purpose: this is draft content
  -- awaiting expert review, and saying so in data is what keeps "draft" honest.
  INSERT INTO public.scp_review_requirements (item_version_id, review_type, required, reason, status)
  VALUES
    (_iv,'security_sme',        true,'Operativ riktighet i svensk bevakningskontext.','outstanding'),
    (_iv,'cognitive_interview', true,'Att deltagare tolkar scenariot som avsett.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Läsbarhet och kognitiv belastning.','outstanding'),
    (_iv,'pilot',               true,'Empiriska svarsmönster före operativ användning.','outstanding');

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
  VALUES (_form, _iv, _order);

  RETURN _iv;
END $fn$;

DO $$
DECLARE
  _fam uuid; _role uuid; _jur uuid;
  _def uuid; _ver uuid; _form uuid; _prog uuid; _pver uuid;
  b_comm uuid; c_comm uuid;
  b_coop uuid; c_coop uuid;
  b_deesc uuid; c_deesc uuid;
  b_ethic uuid; c_ethic uuid;
  b_mandate uuid; c_mandate uuid;
  b_press uuid; c_press uuid;
  b_prop uuid; c_prop uuid;
  b_rep uuid; c_rep uuid;
  b_sit uuid; c_sit uuid;
BEGIN
  SELECT id INTO _jur  FROM public.scp_jurisdictions WHERE code = 'SE';
  SELECT id INTO _fam  FROM public.scp_assessment_families WHERE product_type='development_programme' LIMIT 1;
  SELECT id INTO _role FROM public.scp_roles LIMIT 1;

  -- Behaviour + competency pairs resolved by statement rather than hard-coded,
  -- so this migration cannot silently attach evidence to the wrong graph node.
  SELECT bv.id, cv.competency_id INTO b_comm, c_comm
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Förmedlar tydlig%' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_coop, c_coop
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE cv.name_sv='Samarbete och samordning' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_deesc, c_deesc
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Sänker spänningsnivån%' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_ethic, c_ethic
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE cv.name_sv='Integritet och etik' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_mandate, c_mandate
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Håller sig inom sitt mandat%' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_press, c_press
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE cv.name_sv='Beslutsfattande under press' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_prop, c_prop
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE cv.name_sv='Professionellt omdöme och proportionalitet' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_rep, c_rep
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Rapporterar det som observerats%' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_sit, c_sit
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE cv.name_sv='Situationsmedvetenhet' LIMIT 1;

  IF b_comm IS NULL OR b_coop IS NULL OR b_deesc IS NULL OR b_ethic IS NULL OR b_mandate IS NULL OR b_press IS NULL OR b_prop IS NULL OR b_rep IS NULL OR b_sit IS NULL THEN
    RAISE EXCEPTION 'SCP_CONTENT_GRAPH_MISSING: the competency graph does not carry the behaviours sg-incident-response maps to';
  END IF;

  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-incident-response', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Incidenthantering & första åtgärder', 'Incident response & first actions', 'Ger underlag om hur en person agerar under de första minuterna av en incident: säkrar platsen, larmar rätt funktion med rätt information, bevarar det som kan behövas senare, och avstår från åtgärder utanför mandatet. Resultatet är utvecklingsinriktat underlag, aldrig ett urvalsbeslut.', 'Provides evidence about how a person acts in the first minutes of an incident: securing the scene, alerting the right function with the right information, preserving what may be needed later, and refraining from action outside the mandate. The result is developmental evidence, never a selection decision.',
       ARRAY['Personlighet','Ärlighet som personlighetsdrag','Emotionell stabilitet','Motivation','Framtida arbetsprestation','Fysisk förmåga','Formell auktorisation','Laglig behörighet'],
       ARRAY['Personality','Honesty as a personality trait','Emotional stability','Motivation','Future job performance','Physical ability','Formal authorisation','Legal authority'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture)
  VALUES (_fam, 'sg-incident-response', 'Incidenthantering & första åtgärder', 'Incident response & first actions', 'development_programme', false)
  ON CONFLICT (slug) DO UPDATE SET name_sv=EXCLUDED.name_sv RETURNING id INTO _def;

  SELECT id INTO _ver FROM public.scp_assessment_versions WHERE definition_id=_def AND version_number=1;
  IF _ver IS NULL THEN
    INSERT INTO public.scp_assessment_versions
      (definition_id, version_number, content_status, validation_status,
       language_scope, program_version_id, notes)
    VALUES (_def, 1, 'draft', 'design', ARRAY['sv-SE','en-GB'], _pver,
            'AI-authored draft against the product construct rules; all five review gates outstanding.')
    RETURNING id INTO _ver;
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-incident-response-form-a';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_ver, 'sg-incident-response-form-a', 'Incidenthantering A', 'Incident response A', 20, 28, false)
    RETURNING id INTO _form;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id=_form) THEN RETURN; END IF;

  PERFORM pg_temp.author_item(_form, 1, 'sg-ir-01', b_press, c_press,
    'sjt_best_response','foundational','judgement','prioritisation','judgement', true, true,
    'Väljer första åtgärd som säkrar platsen innan något annat.',
    'Industriområde, upptäckt vattenläcka.',
    'Ett val av första åtgärd i ett scenario säger inget om personens agerande under verklig press.',
    'Du upptäcker vatten som rinner ut under en dörr till ett elrum. Dörren är stängd. Du hör ett svagt surrande innanför.',
    'Vad gör du först?',
    'You discover water running out from under the door to an electrical room. The door is closed. You can hear a faint humming inside.',
    'What do you do first?',
    '[{"rat_sv": "Vatten och el innebär att platsen säkras och rätt funktion larmas – inte att man går in.", "err": "", "sv": "Håll avstånd, spärra av området, larma driftjour och ange att det gäller vatten i ett elrum.", "score": 3, "pref": true, "k": "a", "en": "Keep back, cordon off the area, alert duty maintenance and state that it concerns water in an electrical room."}, {"rat_sv": "Att dokumentera först fördröjer larmet i en situation som kan förvärras snabbt.", "err": "delayed_escalation", "sv": "Fotografera och skriv en notering innan du larmar.", "score": 1, "pref": false, "k": "b", "en": "Photograph and write a note before raising the alarm."}, {"rat_sv": "Att öppna dörren till ett elrum med vatten är direkt farligt och utanför uppdraget.", "err": "outside_mandate", "sv": "Öppna dörren för att se hur omfattande läckan är.", "score": 0, "pref": false, "k": "c", "en": "Open the door to see how extensive the leak is."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 2, 'sg-ir-02', b_comm, c_comm,
    'sjt_best_response','intermediate','judgement','operational_communication','judgement', true, true,
    'Ger larmoperatören det som styr insatsen först.',
    'Larmsamtal under pågående händelse.',
    'Ett svar om larmsamtal i ett scenario säger inget om personens kommunikation under verklig stress.',
    'Du larmar 112 om en person som fallit från en lastkaj och ligger still. Operatören svarar.',
    'Vad säger du först?',
    'You call the emergency number about a person who has fallen from a loading dock and is lying still. The operator answers.',
    'What do you say first?',
    '[{"rat_sv": "Plats och tillstånd först – det avgör vad som skickas och hur snabbt.", "err": "", "sv": "Exakt adress och plats på området, att en person fallit och ligger still, och att hen inte svarar på tilltal.", "score": 3, "pref": true, "k": "a", "en": "The exact address and location on site, that a person has fallen and is lying still, and that they are not responding."}, {"rat_sv": "Sant men saknar det som styr utlarmningen.", "err": "weak_communication", "sv": "Att det har hänt en olycka och att ni behöver ambulans.", "score": 1, "pref": false, "k": "b", "en": "That there has been an accident and you need an ambulance."}, {"rat_sv": "Orsaksbeskrivning före plats fördröjer insatsen.", "err": "insufficient_information", "sv": "En redogörelse för hur olyckan gick till.", "score": 0, "pref": false, "k": "c", "en": "An account of how the accident happened."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 3, 'sg-ir-03', b_mandate, c_mandate,
    'sjt_best_response','advanced','judgement','mandate_and_escalation','mandate', true, true,
    'Avstår från åtgärder som ligger utanför mandatet även när de verkar hjälpsamma.',
    'Kontorshus, misstänkt inbrott natt.',
    'Ett svar om egen begränsning i ett scenario säger inget om personens mod eller initiativ.',
    'Du hör glas krossas inne i en lokal på bottenplan. Genom fönstret ser du en person röra sig inne i lokalen. Polis är larmad och beräknas vara på plats om åtta minuter.',
    'Vad gör du?',
    'You hear glass break inside a ground-floor unit. Through the window you see a person moving around inside. The police have been called and are expected in eight minutes.',
    'What do you do?',
    '[{"rat_sv": "Observation från säker plats ger polisen det de behöver utan att öka risken.", "err": "", "sv": "Håll uppsikt från skyddad plats, uppdatera polisen om signalement och riktning, och möt upp dem vid ankomst.", "score": 3, "pref": true, "k": "a", "en": "Observe from a protected position, update the police on description and direction, and meet them on arrival."}, {"rat_sv": "Att bara vänta utan uppdatering ger polisen sämre utgångsläge.", "err": "delayed_escalation", "sv": "Vänta vid entrén tills polisen kommer.", "score": 1, "pref": false, "k": "b", "en": "Wait at the entrance until the police arrive."}, {"rat_sv": "Att gå in mot en person inne i lokalen är utanför uppdraget och farligt.", "err": "outside_mandate", "sv": "Gå in i lokalen för att hindra personen från att ta sig ut.", "score": 0, "pref": false, "k": "c", "en": "Enter the unit to stop the person getting out."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 4, 'sg-ir-04', b_sit, c_sit,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', true, true,
    'Bevarar det som kan behövas i en senare utredning.',
    'Butik, efter ett inbrott.',
    'Ett svar om spårsäkring i ett scenario säger inget om personens noggrannhet generellt.',
    'Efter ett inbrott i en butik är rutan krossad och varor ligger utspridda. Butikschefen vill börja städa innan öppning om en timme. Polisen har inte varit på plats.',
    'Vad gör du?',
    'After a break-in at a shop the window is smashed and goods are strewn about. The manager wants to start cleaning before opening in an hour. The police have not attended.',
    'What do you do?',
    '[{"rat_sv": "Förklarar varför platsen bör lämnas orörd och dokumenterar innan något ändras.", "err": "", "sv": "Be butikschefen avvakta, förklara varför, fotografera läget och stäm av med polisen om när städning kan påbörjas.", "score": 3, "pref": true, "k": "a", "en": "Ask the manager to hold off, explain why, photograph the scene, and check with the police when cleaning can start."}, {"rat_sv": "Rätt instinkt men utan dokumentation försvinner underlaget ändå.", "err": "weak_communication", "sv": "Säg åt butikschefen att inte röra något förrän polisen varit där.", "score": 1, "pref": false, "k": "b", "en": "Tell the manager not to touch anything until the police have attended."}, {"rat_sv": "Öppningstiden väger lättare än att bevara underlaget i en pågående utredning.", "err": "poor_proportionality", "sv": "Hjälpa till att städa så att butiken hinner öppna.", "score": 0, "pref": false, "k": "c", "en": "Help clear up so the shop can open on time."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 5, 'sg-ir-05', b_coop, c_coop,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Samordnar med räddningstjänst utan att ta över deras beslut.',
    'Utrymning, räddningstjänst på plats.',
    'Ett svar om samordning i ett scenario säger inget om personens samarbetsförmåga generellt.',
    'Räddningstjänsten har anlänt till en utrymd byggnad. Du vet att två personer med rörelsenedsättning normalt arbetar på plan 4, men du har inte sett dem vid uppsamlingsplatsen.',
    'Vad gör du?',
    'The fire service has arrived at an evacuated building. You know two people with reduced mobility normally work on level 4, but you have not seen them at the assembly point.',
    'What do you do?',
    '[{"rat_sv": "Informationen går direkt till insatsledaren, som är den som får besluta om insats.", "err": "", "sv": "Meddela insatsledaren omedelbart vilka som saknas, var de normalt befinner sig och att du inte sett dem vid uppsamlingsplatsen.", "score": 3, "pref": true, "k": "a", "en": "Tell the incident commander immediately who is missing, where they normally are, and that you have not seen them at the assembly point."}, {"rat_sv": "Att söka vidare själv fördröjer information som kan vara avgörande.", "err": "delayed_escalation", "sv": "Leta igenom uppsamlingsplatsen en gång till innan du säger något.", "score": 1, "pref": false, "k": "b", "en": "Search the assembly point again before saying anything."}, {"rat_sv": "Att gå in i en byggnad under insats är räddningstjänstens beslut, inte väktarens.", "err": "outside_mandate", "sv": "Gå in i byggnaden för att kontrollera plan 4.", "score": 0, "pref": false, "k": "c", "en": "Enter the building to check level 4."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 6, 'sg-ir-06', b_prop, c_prop,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', true, true,
    'Väljer åtgärd som är proportionerlig mot vad som faktiskt observerats.',
    'Kontorshus, rökutveckling.',
    'Ett val av åtgärdsnivå i ett scenario säger inget om personens riskbedömning generellt.',
    'Du känner svag brandlukt i ett trapphus men ser ingen rök och inget larm har löst ut. Lukten är starkast vid ett elskåp.',
    'Vad gör du?',
    'You notice a faint burning smell in a stairwell but see no smoke and no alarm has triggered. The smell is strongest near an electrical cabinet.',
    'What do you do?',
    '[{"rat_sv": "Behandlar det som en möjlig brandrisk och larmar rätt funktion utan att utrymma i onödan.", "err": "", "sv": "Larma driftjour om misstänkt fel i elskåpet, håll uppsikt över platsen och var beredd att utrymma om läget ändras.", "score": 3, "pref": true, "k": "a", "en": "Alert duty maintenance about a suspected fault in the cabinet, keep the area under observation, and be ready to evacuate if the situation changes."}, {"rat_sv": "Att vänta på synlig rök är att vänta på att risken realiseras.", "err": "delayed_escalation", "sv": "Fortsätt ronden och kontrollera platsen igen om en halvtimme.", "score": 1, "pref": false, "k": "b", "en": "Continue the round and check the spot again in half an hour."}, {"rat_sv": "Full utrymning utan larm eller synlig rök är oproportionerligt.", "err": "premature_escalation", "sv": "Utlös brandlarmet och utrym hela byggnaden.", "score": 0, "pref": false, "k": "c", "en": "Trigger the fire alarm and evacuate the whole building."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 7, 'sg-ir-07', b_rep, c_rep,
    'sjt_best_response','intermediate','judgement','factual_reporting','judgement', false, false,
    'Dokumenterar tidslinjen medan händelsen pågår.',
    'Pågående incident med flera aktörer.',
    'Ett svar om dokumentation i ett scenario säger inget om personens minne under press.',
    'Under en pågående händelse har du larmat, mött räddningstjänst, spärrat av och pratat med tre personer. Händelsen pågår fortfarande.',
    'När och hur dokumenterar du?',
    'During an ongoing incident you have raised the alarm, met the fire service, cordoned off an area and spoken to three people. The incident is still ongoing.',
    'When and how do you document it?',
    '[{"rat_sv": "Korta tidsnoteringar under förloppet ger en tidslinje som inte går att rekonstruera efteråt.", "err": "", "sv": "Notera klockslag och åtgärd kort efter hand, och skriv den fullständiga rapporten när läget är stabilt.", "score": 3, "pref": true, "k": "a", "en": "Note times and actions briefly as you go, and write the full report once the situation is stable."}, {"rat_sv": "Efterhandskonstruktion av klockslag blir osäker och kan bli avgörande.", "err": "failure_to_document", "sv": "Skriv allt efteråt när du hinner, och rekonstruera tiderna då.", "score": 1, "pref": false, "k": "b", "en": "Write everything afterwards when there is time, and reconstruct the times then."}, {"rat_sv": "Att skriva utförligt mitt i förloppet tar uppmärksamhet från händelsen.", "err": "tunnel_vision", "sv": "Skriv en utförlig löpande rapport parallellt med att du agerar.", "score": 0, "pref": false, "k": "c", "en": "Write a detailed running report in parallel with acting."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 8, 'sg-ir-08', b_deesc, c_deesc,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Hanterar åskådare och anhöriga under en pågående incident.',
    'Uppsamlingsplats vid utrymning.',
    'Ett svar om folkhantering i ett scenario säger inget om personens auktoritet som egenskap.',
    'Vid uppsamlingsplatsen under en utrymning vill flera personer gå tillbaka in för att hämta jackor och datorer. Det är kallt och några börjar gå mot entrén.',
    'Vad gör du?',
    'At the assembly point during an evacuation several people want to go back inside for coats and laptops. It is cold and some start walking towards the entrance.',
    'What do you do?',
    '[{"rat_sv": "Ger ett skäl som går att acceptera och löser det verkliga obehaget.", "err": "", "sv": "Förklara kort att ingen får gå in innan räddningstjänsten friger byggnaden, och ordna med att gruppen kan vänta i värme.", "score": 3, "pref": true, "k": "a", "en": "Explain briefly that nobody may enter until the fire service releases the building, and arrange somewhere warm for the group to wait."}, {"rat_sv": "Ett besked utan skäl och utan lösning håller sällan när folk fryser.", "err": "weak_communication", "sv": "Säg åt alla att stanna kvar vid uppsamlingsplatsen.", "score": 1, "pref": false, "k": "b", "en": "Tell everybody to stay at the assembly point."}, {"rat_sv": "Undantag under pågående utrymning underminerar hela utrymningen.", "err": "poor_proportionality", "sv": "Låt några gå in snabbt eftersom det bara gäller jackor.", "score": 0, "pref": false, "k": "c", "en": "Let a few go in quickly since it is only about coats."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 9, 'sg-ir-09', b_mandate, c_mandate,
    'sjt_best_response','advanced','judgement','mandate_and_escalation','mandate', true, true,
    'Avgör vad som får sägas till utomstående under en pågående incident.',
    'Incident med medieintresse.',
    'Ett svar om uttalanden i ett scenario säger inget om personens diskretion som egenskap.',
    'Under en pågående incident kommer en journalist fram och frågar vad som hänt och om någon är skadad. Du vet en del men inte allt.',
    'Vad gör du?',
    'During an ongoing incident a journalist approaches and asks what has happened and whether anybody is injured. You know some of it but not all.',
    'What do you do?',
    '[{"rat_sv": "Hänvisar utan att spekulera, och för vidare att media är på plats.", "err": "", "sv": "Hänvisa till uppdragsgivarens presskontakt, avstå från att kommentera, och meddela arbetsledaren att media är på plats.", "score": 3, "pref": true, "k": "a", "en": "Refer them to the client press contact, decline to comment, and inform your supervisor that media are present."}, {"rat_sv": "Att bara vägra utan hänvisning löser inget och lämnar journalisten kvar.", "err": "weak_communication", "sv": "Säg att du inte får uttala dig och gå därifrån.", "score": 1, "pref": false, "k": "b", "en": "Say you are not allowed to comment and walk away."}, {"rat_sv": "Att lämna uppgifter mitt i ett förlopp riskerar felaktig information i omlopp.", "err": "unsupported_assumption", "sv": "Berätta det du säkert vet så att det inte sprids felaktiga uppgifter.", "score": 0, "pref": false, "k": "c", "en": "Tell them what you know for certain so incorrect information does not spread."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 10, 'sg-ir-10', b_press, c_press,
    'sjt_best_response','advanced','prioritisation','prioritisation','judgement', true, true,
    'Prioriterar mellan två samtidiga incidenter med olika allvarlighetsgrad.',
    'Ensam väktare, två samtidiga larm.',
    'Prioritering i ett scenario säger inget om personens förmåga att hantera verklig samtidighet.',
    'Två larm samtidigt: ett inbrottslarm i ett förråd på baksidan, och ett hisslarm där en person uppger att hen har svårt att andas. Du är ensam.',
    'Vad gör du?',
    'Two alarms at once: an intruder alarm in a storeroom at the back, and a lift alarm where a person says they are having difficulty breathing.',
    'What do you do?',
    '[{"rat_sv": "Personrisk går före egendomsrisk, och det andra larmet överlämnas i stället för att glömmas.", "err": "", "sv": "Larma 112 för hissen, gå dit själv och meddela driftcentralen att inbrottslarmet behöver hanteras av någon annan.", "score": 3, "pref": true, "k": "a", "en": "Call the emergency number for the lift, go there yourself, and tell the control room the intruder alarm needs somebody else."}, {"rat_sv": "Rätt prioritering av person men förrådet lämnas helt utan åtgärd eller överlämning.", "err": "poor_proportionality", "sv": "Gå till hissen och ta inbrottslarmet när den situationen är löst.", "score": 1, "pref": false, "k": "b", "en": "Go to the lift and deal with the intruder alarm once that situation is resolved."}, {"rat_sv": "Egendom före andningssvårigheter är fel prioritering.", "err": "poor_proportionality", "sv": "Kontrollera förrådet först eftersom ett inbrott kan pågå just nu.", "score": 0, "pref": false, "k": "c", "en": "Check the storeroom first since a break-in may be in progress."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 11, 'sg-ir-11', b_comm, c_comm,
    'sjt_best_response','intermediate','judgement','operational_communication','judgement', false, false,
    'Överlämnar en pågående incident till nästa skift.',
    'Skiftbyte mitt i en incident.',
    'Ett svar om överlämning i ett scenario säger inget om personens kommunikation i stort.',
    'Ditt pass tar slut medan en vattenskada fortfarande hanteras. Sanerare är på plats, ett rum är avspärrat och försäkringsbolaget ska kontaktas i morgon.',
    'Vad måste överlämningen innehålla?',
    'Your shift ends while water damage is still being dealt with. Restoration staff are on site, one room is cordoned off, and the insurer is to be contacted tomorrow.',
    'What must the handover contain?',
    '[{"rat_sv": "Nuläge, vem som är på plats, vad som är avspärrat och vad som återstår att göra.", "err": "", "sv": "Vilka som är på plats, vad som är avspärrat och varför, samt att försäkringsbolaget ska kontaktas i morgon.", "score": 3, "pref": true, "k": "a", "en": "Who is on site, what is cordoned off and why, and that the insurer is to be contacted tomorrow."}, {"rat_sv": "Utan avspärrning och kvarstående uppgifter kan nästa skift inte ta vid.", "err": "insufficient_information", "sv": "Att en vattenskada har inträffat och att sanerare kallats.", "score": 1, "pref": false, "k": "b", "en": "That water damage has occurred and restoration staff have been called."}, {"rat_sv": "En orsaksbedömning som inte är fastställd hör inte hemma i en överlämning.", "err": "unsupported_assumption", "sv": "Att skadan sannolikt beror på eftersatt underhåll.", "score": 0, "pref": false, "k": "c", "en": "That the damage is probably due to deferred maintenance."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 12, 'sg-ir-12', b_ethic, c_ethic,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Hanterar en incident som rör en kollega utan att avvika från rutin.',
    'Incident där en kollega är inblandad.',
    'Ett svar i ett scenario säger inget om personens lojalitet eller integritet som egenskap.',
    'Du upptäcker att en kollega har lämnat en säkerhetsdörr uppställd under sitt pass, vilket är en avvikelse som ska rapporteras. Kollegan ber dig låta bli, eftersom hen redan har en varning.',
    'Vad gör du?',
    'You discover that a colleague left a security door propped open during their shift, which is a reportable deviation. The colleague asks you not to report it, as they already have a warning.',
    'What do you do?',
    '[{"rat_sv": "Rapporterar avvikelsen som vilken annan som helst, och säger det till kollegan direkt.", "err": "", "sv": "Rapportera avvikelsen enligt rutin och berätta för kollegan att du gör det.", "score": 3, "pref": true, "k": "a", "en": "Report the deviation per routine and tell the colleague that you are doing so."}, {"rat_sv": "Att skjuta upp beslutet gör dig delaktig i att avvikelsen inte rapporteras.", "err": "delayed_escalation", "sv": "Vänta och se om kollegan rapporterar det själv först.", "score": 1, "pref": false, "k": "b", "en": "Wait and see whether the colleague reports it themselves first."}, {"rat_sv": "En muntlig tillsägelse ersätter inte en rapporterad säkerhetsavvikelse.", "err": "failure_to_document", "sv": "Påpeka det för kollegan men låta bli att rapportera.", "score": 0, "pref": false, "k": "c", "en": "Point it out to the colleague but not report it."}]'::jsonb);

  RAISE NOTICE 'Incidenthantering & första åtgärder — 12 items authored';
END $$;

DROP FUNCTION IF EXISTS pg_temp.author_item(uuid,int,text,uuid,uuid,text,text,text,text,text,boolean,boolean,text,text,text,text,text,text,text,jsonb);