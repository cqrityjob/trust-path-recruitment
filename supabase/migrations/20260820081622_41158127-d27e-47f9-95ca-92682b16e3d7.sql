-- #51 Batch 6 — the Security Guard programme's six modules become runnable.
--
-- The finding this closes: modules_with_activity = 0. All six modules of
-- "Väktare – Operativt säkerhetsutvecklingsprogram" existed, were governed and
-- were mapped to behaviours, and none of them contained anything a participant
-- could actually do.
--
-- Each module now carries a learning form with two scenario activities, and
-- every option carries feedback explaining WHY it is stronger or weaker. That
-- distinction is the whole point of Learning Mode: "correct/incorrect" teaches
-- nothing, and the weaker options here are the ones a competent guard might
-- genuinely pick, so the feedback has something worth saying.
--
-- ── WHY A LEARNING CONTAINER ────────────────────────────────────────────
--
-- scp_forms.assessment_version_id is NOT NULL, so a learning form has to hang
-- off an assessment version. That container is a structural necessity, not a
-- product, and 20260826092000 already excludes learning-only containers from
-- the assessment library so it never appears as something an employer could
-- assign.
--
-- ── LEARNING IS NOT ASSESSMENT ──────────────────────────────────────────
--
-- Every item is mode = 'learning', which the disjointness triggers from
-- 20260803090000 enforce: these items can never appear on an assessment form,
-- and learning feedback can never appear on an assessment item. No learning
-- item is marked safety-critical or requires_human_review -- doing so would
-- imply an evidentiary weight Learning Mode deliberately does not carry.
--
-- Completing these modules records training_completion, which carries
-- counts_toward_maturity = false. Practising does not move a measured level.
--
-- draft/design, authored_by_ai = true.

-- ═══════════════════════════════════════════════════════════════════════════
-- Learning-item authoring helper
--
-- Learning items differ from assessment items in one way that matters: every
-- option carries feedback explaining WHY it is stronger or weaker. That is the
-- whole point of Learning Mode -- "correct/incorrect" teaches nothing -- and it
-- is also why these items may never appear on an assessment form. The mode
-- disjointness triggers from 20260803090000 enforce that; this helper simply
-- cannot author the wrong thing.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.author_learning_item(
  _form uuid, _order int, _slug text, _behaviour uuid, _competency uuid,
  _difficulty text, _demand text,
  _observable text, _scenario_sv text, _prompt_sv text,
  _scenario_en text, _prompt_en text,
  _opts jsonb   -- [{k,score,pref,err,rat_sv,sv,en,fb_sv,fb_en}]
) RETURNS uuid
LANGUAGE plpgsql AS $fn$
DECLARE _item uuid; _iv uuid; _o jsonb; _jur uuid; _n int := 0;
BEGIN
  SELECT id INTO _jur FROM public.scp_jurisdictions WHERE code='SE';

  INSERT INTO public.scp_items (slug) VALUES (_slug)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _item;

  IF EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id=_item) THEN
    SELECT id INTO _iv FROM public.scp_item_versions WHERE item_id=_item LIMIT 1;
    RETURN _iv;
  END IF;

  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, validation_status, item_format,
     competency_id, primary_behaviour_id, mode, observable_behavior,
     response_process, legal_basis_required, jurisdiction_id, difficulty,
     cognitive_demand, primary_construct, tests_what, is_safety_critical,
     requires_human_review, authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', 'sjt_best_response', _competency, _behaviour,
     'learning', _observable,
     'Övningsläge: deltagaren svarar och får därefter återkoppling på varje alternativ.',
     false, _jur, _difficulty, _demand, 'situational_judgement', 'judgement',
     -- Learning items are formative. Marking one safety-critical would imply an
     -- evidentiary weight Learning Mode deliberately does not carry.
     false, false, true,
     'pending','pending','pending','pending','pending')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
  VALUES (_iv,'sv-SE','adaptation_pending',_scenario_sv,_prompt_sv),
         (_iv,'en-GB','adaptation_pending',_scenario_en,_prompt_en);

  FOR _o IN SELECT * FROM jsonb_array_elements(_opts) LOOP
    _n := _n + 1;
    WITH ins AS (
      INSERT INTO public.scp_item_options
        (item_version_id, option_key, display_order, score_value,
         scoring_rationale_sv, is_preferred, distractor_error_type,
         learning_feedback_sv, learning_feedback_en)
      VALUES (_iv, _o->>'k', _n, (_o->>'score')::int, _o->>'rat_sv',
              (_o->>'pref')::boolean, nullif(_o->>'err',''),
              _o->>'fb_sv', _o->>'fb_en')
      RETURNING id
    )
    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT ins.id, l.lang, l.label FROM ins,
      (VALUES ('sv-SE', _o->>'sv'), ('en-GB', _o->>'en')) AS l(lang,label);
  END LOOP;

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
  VALUES (_form, _iv, _order);
  RETURN _iv;
END $fn$;

DO $$
DECLARE
  _fam uuid; _jur uuid; _container uuid; _cdef uuid; _pver uuid;
  _form uuid; _mver uuid;
  b_comm uuid; c_comm uuid;
  b_deesc uuid; c_deesc uuid;
  b_ethic uuid; c_ethic uuid;
  b_mandate uuid; c_mandate uuid;
  b_press uuid; c_press uuid;
  b_prop uuid; c_prop uuid;
  b_rep uuid; c_rep uuid;
  b_sit uuid; c_sit uuid;
BEGIN
  SELECT id INTO _jur FROM public.scp_jurisdictions WHERE code='SE';
  SELECT id INTO _fam FROM public.scp_assessment_families WHERE product_type='development_programme' LIMIT 1;

  SELECT bv.id, cv.competency_id INTO b_comm, c_comm
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Förmedlar tydlig%' LIMIT 1;
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

  SELECT pv.id INTO _pver FROM public.scp_program_versions pv
    JOIN public.scp_programs p ON p.id=pv.program_id
   WHERE p.slug='security-guard-operational-development';
  IF _pver IS NULL THEN
    RAISE EXCEPTION 'SCP_SG_PROGRAMME_MISSING: the Security Guard development programme does not exist';
  END IF;

  -- Structural container for the learning forms. Excluded from the assessment
  -- library by 20260826092000 because all its forms are learning-only.
  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture,
     display_name_sv, display_name_en)
  VALUES (_fam, 'sg-development-learning-container',
          'Väktare – utvecklingsprogram, övningsinnehåll',
          'Security guard – development programme, practice content',
          'development_programme', false,
          'Väktare – Operativt säkerhetsutvecklingsprogram',
          'Security Guard – Operational Security Development Programme')
  ON CONFLICT (slug) DO UPDATE SET name_sv=EXCLUDED.name_sv RETURNING id INTO _cdef;

  SELECT id INTO _container FROM public.scp_assessment_versions
   WHERE definition_id=_cdef AND version_number=1;
  IF _container IS NULL THEN
    INSERT INTO public.scp_assessment_versions
      (definition_id, version_number, content_status, validation_status,
       language_scope, program_version_id, notes)
    VALUES (_cdef, 1, 'draft', 'design', ARRAY['sv-SE','en-GB'], _pver,
            'Learning-mode container for the Security Guard development programme. Never served in Assessment Mode.')
    RETURNING id INTO _container;
  END IF;

  -- ── sg-access-authorization ──
  SELECT mv.id INTO _mver FROM public.scp_module_versions mv
    JOIN public.scp_modules mm ON mm.id=mv.module_id WHERE mm.slug='sg-access-authorization';
  IF _mver IS NULL THEN
    RAISE EXCEPTION 'SCP_MODULE_MISSING: %', 'sg-access-authorization';
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-access-form';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_container, 'sg-lm-access-form', 'Tillträde och behörighet — övning', 'Access and authorisation — practice', 5, 12, false) RETURNING id INTO _form;
  END IF;

  PERFORM pg_temp.author_learning_item(_form, 1, 'sg-lm-acc-01', b_mandate, c_mandate, 'foundational','judgement',
    'Övar att hålla en tillträdesrutin när den ifrågasätts.', 'En leverantör vill lämna ett paket direkt till en avdelning i stället för i receptionen. Instruktionen säger att allt gods tas emot i receptionen.', 'Vad är starkast här?', 'A supplier wants to deliver a parcel straight to a department rather than at reception. The instruction says all goods are received at reception.', 'Which is strongest here?', '[{"pref": true, "en": "Accept the parcel at reception and make sure the department is notified.", "sv": "Ta emot paketet i receptionen och se till att avdelningen underrättas.", "err": "", "fb_sv": "Rutinen finns för att gods ska kunna spåras och för att obehöriga inte ska få följe in i lokalerna. Att ta emot paketet löser leverantörens problem utan att öppna en väg in.", "rat_sv": "Håller rutinen och löser leverantörens behov.", "score": 3, "fb_en": "The routine exists so goods can be traced and so nobody gets escorted into the premises unnoticed. Accepting the parcel solves the suppliers problem without opening a route in.", "k": "a"}, {"pref": false, "en": "Say it is not possible and refer the supplier to come back later.", "sv": "Säg att det inte går och hänvisa leverantören att återkomma.", "err": "weak_communication", "fb_sv": "Rutinen hålls, men leverantören står kvar med sitt problem. Ett avslag utan väg framåt är också det som gör att folk nästa gång försöker gå runt rutinen i stället för genom den.", "rat_sv": "Håller rutinen men lämnar leverantören utan lösning.", "score": 1, "fb_en": "The routine holds, but the supplier is left with their problem. A refusal with no way forward is also what makes people try to go around the routine next time rather than through it.", "k": "b"}, {"pref": false, "en": "Escort the supplier up to the department so it goes faster.", "sv": "Följ med leverantören upp till avdelningen så går det snabbare.", "err": "excessive_informal_trust", "fb_sv": "Det känns hjälpsamt, men nu har en okänd person varit inne i lokalerna och godset har aldrig registrerats. Eskort är inte samma sak som behörighet.", "rat_sv": "Ger tillträde utan grund.", "score": 0, "fb_en": "It feels helpful, but now an unknown person has been inside the premises and the goods were never registered. An escort is not the same thing as authorisation.", "k": "c"}]'::jsonb);

  PERFORM pg_temp.author_learning_item(_form, 2, 'sg-lm-acc-02', b_sit, c_sit, 'intermediate','recognition',
    'Övar att upptäcka att ett behörighetsunderlag inte hänger ihop.', 'Ett besökskort är utfärdat till "Konsult, IT" men personen frågar efter vägen till lagerlokalen.', 'Vad är starkast?', 'A visitor badge is issued to "Consultant, IT" but the person asks for directions to the warehouse.', 'Which is strongest?', '[{"pref": true, "en": "Ask what the errand in the warehouse concerns and check with whoever issued the badge.", "sv": "Fråga vad ärendet i lagret gäller och stäm av med den som utfärdade kortet.", "err": "", "fb_sv": "Avvikelsen är mellan kortets ärende och den faktiska frågan. Att fråga är både det minst ingripande och det som snabbast löser oklarheten – oftast är förklaringen helt legitim.", "rat_sv": "Frågar om avvikelsen utan att anklaga.", "score": 3, "fb_en": "The discrepancy is between the badges stated purpose and the actual question. Asking is both the least intrusive step and the quickest way to resolve it – usually the explanation is entirely legitimate.", "k": "a"}, {"pref": false, "en": "Give directions, the badge is valid.", "sv": "Visa vägen, kortet är giltigt.", "err": "excessive_informal_trust", "fb_sv": "Kortet säger att personen får vara i huset, inte att hen ska till lagret. Det är just den skillnaden ett besökskort med angivet ärende är till för.", "rat_sv": "Giltigt kort besvarar inte var personen ska.", "score": 1, "fb_en": "The badge says the person may be in the building, not that they are going to the warehouse. That difference is exactly what a purpose-stated visitor badge is for.", "k": "b"}, {"pref": false, "en": "Take the badge and ask the person to leave the building.", "sv": "Ta kortet och be personen lämna byggnaden.", "err": "premature_escalation", "fb_sv": "Här finns en oklarhet, inte ett konstaterat missbruk. Att gå direkt till avvisning innan en fråga ställts skapar en konflikt av något som oftast är en missförstådd vägbeskrivning.", "rat_sv": "Oproportionerligt mot en enkel oklarhet.", "score": 0, "fb_en": "This is an ambiguity, not established misuse. Jumping to removal before asking a question turns what is usually a misunderstood direction into a confrontation.", "k": "c"}]'::jsonb);

  UPDATE public.scp_module_versions SET learning_form_id=_form WHERE id=_mver;

  -- ── sg-observation-deviation ──
  SELECT mv.id INTO _mver FROM public.scp_module_versions mv
    JOIN public.scp_modules mm ON mm.id=mv.module_id WHERE mm.slug='sg-observation-deviation';
  IF _mver IS NULL THEN
    RAISE EXCEPTION 'SCP_MODULE_MISSING: %', 'sg-observation-deviation';
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-observation-form';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_container, 'sg-lm-observation-form', 'Observation och avvikelsehantering — övning', 'Observation and deviations — practice', 5, 12, false) RETURNING id INTO _form;
  END IF;

  PERFORM pg_temp.author_learning_item(_form, 1, 'sg-lm-obs-01', b_sit, c_sit, 'foundational','recognition',
    'Övar att skilja iakttagelse från tolkning.', 'En dörr som brukar vara stängd står öppen. Ingen finns i närheten och inget verkar flyttat.', 'Vilken notering är starkast?', 'A door that is normally closed is standing open. Nobody is nearby and nothing appears moved.', 'Which note is strongest?', '[{"pref": true, "en": "\"21:10, door to the plant room standing open. No person nearby, nothing visibly moved.\"", "sv": "\"21:10, dörr till teknikrum står öppen. Ingen person i närheten, inget synligt flyttat.\"", "err": "", "fb_sv": "Den här noteringen går att kontrollera i efterhand och säger exakt vad som var känt vid tidpunkten. Att också notera vad du INTE såg är ofta det som gör en notering användbar senare.", "rat_sv": "Iakttagelse med tid och plats, utan orsak.", "score": 3, "fb_en": "This note can be checked afterwards and states exactly what was known at the time. Recording what you did NOT see is often what makes a note useful later.", "k": "a"}, {"pref": false, "en": "\"A door was open during the evening.\"", "sv": "\"En dörr stod öppen under kvällen.\"", "err": "insufficient_information", "fb_sv": "Det som saknas är just det som gör noteringen användbar: när, vilken dörr, och vad du gjorde. Utan det kan nästa person varken kontrollera eller följa upp.", "rat_sv": "Saknar tid och plats.", "score": 1, "fb_en": "What is missing is exactly what would make the note useful: when, which door, and what you did. Without that the next person can neither verify nor follow up.", "k": "b"}, {"pref": false, "en": "\"The cleaners forgot to close the plant room.\"", "sv": "\"Städpersonalen har glömt att stänga teknikrummet.\"", "err": "unsupported_assumption", "fb_sv": "Det kan mycket väl stämma, men det är en gissning skriven som ett faktum. När en gissning hamnar i dokumentationen följer den med, och den blir svår att ta tillbaka.", "rat_sv": "Skriver in en orsak.", "score": 0, "fb_en": "It may well be true, but it is a guess written as a fact. Once a guess enters the record it travels onward, and it is hard to take back.", "k": "c"}]'::jsonb);

  PERFORM pg_temp.author_learning_item(_form, 2, 'sg-lm-obs-02', b_sit, c_sit, 'intermediate','judgement',
    'Övar att känna igen ett mönster över flera pass.', 'Tredje passet i rad noterar du att samma fönster på bottenplan står på glänt när du kommer.', 'Vad är starkast?', 'For the third shift running you note that the same ground-floor window is ajar when you arrive.', 'Which is strongest?', '[{"pref": true, "en": "Record it and raise with your supervisor that it has now happened three shifts running.", "sv": "Notera det och lyft att det nu skett tre pass i rad till arbetsledaren.", "err": "", "fb_sv": "Tredje gången är inte längre en enskild händelse utan ett mönster, och det är mönstret som behöver komma vidare. Enskilda noteringar utan sammanhang tenderar att stanna i loggen.", "rat_sv": "Lyfter mönstret, inte bara händelsen.", "score": 3, "fb_en": "By the third time this is no longer an incident but a pattern, and the pattern is what needs to travel. Individual notes without context tend to stay in the log.", "k": "a"}, {"pref": false, "en": "Close the window and continue the round.", "sv": "Stäng fönstret och fortsätt ronden.", "err": "failure_to_document", "fb_sv": "Rätt fysisk åtgärd, men utan notering försvinner mönstret. Nästa person upptäcker samma sak och tror att det är första gången.", "rat_sv": "Åtgärdar men dokumenterar inte.", "score": 1, "fb_en": "The right physical action, but without a note the pattern disappears. The next person finds the same thing and believes it is the first time.", "k": "b"}, {"pref": false, "en": "Record it and wait to see whether anything actually happens.", "sv": "Notera det och avvakta om något faktiskt inträffar.", "err": "delayed_escalation", "fb_sv": "Att invänta en konsekvens innebär att en känd öppning står kvar i tre pass till. Underlaget för att agera finns redan.", "rat_sv": "Väntar på att något ska hända.", "score": 0, "fb_en": "Waiting for a consequence means a known opening stays in place for another three shifts. The basis for acting already exists.", "k": "c"}]'::jsonb);

  UPDATE public.scp_module_versions SET learning_form_id=_form WHERE id=_mver;

  -- ── sg-conflict-deescalation ──
  SELECT mv.id INTO _mver FROM public.scp_module_versions mv
    JOIN public.scp_modules mm ON mm.id=mv.module_id WHERE mm.slug='sg-conflict-deescalation';
  IF _mver IS NULL THEN
    RAISE EXCEPTION 'SCP_MODULE_MISSING: %', 'sg-conflict-deescalation';
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-conflict-form';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_container, 'sg-lm-conflict-form', 'Konfliktförebyggande och nedtrappning — övning', 'Conflict prevention and de-escalation — practice', 5, 12, false) RETURNING id INTO _form;
  END IF;

  PERFORM pg_temp.author_learning_item(_form, 1, 'sg-lm-con-01', b_deesc, c_deesc, 'foundational','judgement',
    'Övar att sänka spänningsnivån innan en situation trappas upp.', 'En besökare blir irriterad över att behöva vänta och höjer rösten i receptionen.', 'Vad är starkast?', 'A visitor becomes irritated at having to wait and raises their voice in reception.', 'Which is strongest?', '[{"pref": true, "en": "Lower your own voice, say you understand the wait is frustrating, and give a concrete estimate of how long it will take.", "sv": "Sänk din egen röst, säg att du förstår att väntan är frustrerande och ge en konkret uppskattning av hur lång tid det tar.", "err": "", "fb_sv": "Att sänka den egna rösten drar ofta ner nivån utan att något sägs om saken. Att erkänna frustrationen är inte att ge efter – och en konkret tid ersätter det som gör väntan värst, nämligen ovissheten.", "rat_sv": "Bekräftar upplevelsen och ger en konkret tidsangivelse.", "score": 3, "fb_en": "Lowering your own voice often brings the level down without addressing the issue at all. Acknowledging the frustration is not conceding – and a concrete time replaces the thing that makes waiting worst, which is not knowing.", "k": "a"}, {"pref": false, "en": "Repeat what the routine says and ask the person to be patient.", "sv": "Upprepa vad rutinen säger och be personen ha tålamod.", "err": "weak_communication", "fb_sv": "Sakligt korrekt, men det som driver situationen är inte okunskap om rutinen utan att personen känner sig ignorerad. Att upprepa regeln bekräftar just den känslan.", "rat_sv": "Sakligt korrekt men bemöter inte irritationen.", "score": 1, "fb_en": "Factually correct, but what is driving the situation is not ignorance of the routine – it is feeling ignored. Repeating the rule confirms exactly that feeling.", "k": "b"}, {"pref": false, "en": "Tell the person to lower their voice or they will have to leave.", "sv": "Säg åt personen att sänka rösten annars får hen lämna lokalen.", "err": "premature_escalation", "fb_sv": "Ett ultimatum mot någon som är irriterad men inte hotfull gör nästan alltid situationen värre, och det binder dig vid en åtgärd du kanske inte vill genomföra.", "rat_sv": "Höjer nivån i stället för att sänka den.", "score": 0, "fb_en": "An ultimatum to somebody who is irritated but not threatening almost always makes it worse, and it commits you to an action you may not want to carry out.", "k": "c"}]'::jsonb);

  PERFORM pg_temp.author_learning_item(_form, 2, 'sg-lm-con-02', b_prop, c_prop, 'intermediate','judgement',
    'Övar att välja minst ingripande åtgärd.', 'Två personer diskuterar högljutt i en foajé. Ingen är hotfull, men andra besökare tittar.', 'Vad är starkast?', 'Two people are arguing loudly in a foyer. Neither is threatening, but other visitors are looking.', 'Which is strongest?', '[{"pref": true, "en": "Move slowly closer and make yourself visible, without stepping between them.", "sv": "Gå långsamt närmare och gör dig synlig, utan att gå emellan.", "err": "", "fb_sv": "Synlig närvaro löser en förvånansvärt stor andel av den här typen av situationer utan att ett ord behöver sägas. Det ger dig också tid att bedöma innan du binder upp dig.", "rat_sv": "Synlig närvaro innan tilltal.", "score": 3, "fb_en": "Visible presence resolves a surprisingly large share of these situations without a word being said. It also buys you time to assess before committing.", "k": "a"}, {"pref": false, "en": "Leave them be, it is not threatening.", "sv": "Låt dem vara, det är inte hotfullt.", "err": "delayed_escalation", "fb_sv": "Bedömningen är rimlig just nu, men en högljudd diskussion i en foajé kan ändra karaktär snabbt, och då är avståndet till dig det som avgör.", "rat_sv": "Ingen närvaro alls.", "score": 1, "fb_en": "The judgement is reasonable right now, but a loud argument in a foyer can change character quickly, and then your distance is what decides.", "k": "b"}, {"pref": false, "en": "Step between them and demand that they stop.", "sv": "Ställ dig mellan dem och kräv att de slutar.", "err": "premature_escalation", "fb_sv": "Att gå emellan gör dig till en part i konflikten och tar bort din möjlighet att backa. Det är en åtgärd för när det redan blivit fysiskt, inte innan.", "rat_sv": "Fysisk placering mellan två upprörda personer.", "score": 0, "fb_en": "Stepping between makes you a party to the conflict and removes your ability to step back. It is an action for when things are already physical, not before.", "k": "c"}]'::jsonb);

  UPDATE public.scp_module_versions SET learning_form_id=_form WHERE id=_mver;

  -- ── sg-incident-response ──
  SELECT mv.id INTO _mver FROM public.scp_module_versions mv
    JOIN public.scp_modules mm ON mm.id=mv.module_id WHERE mm.slug='sg-incident-response';
  IF _mver IS NULL THEN
    RAISE EXCEPTION 'SCP_MODULE_MISSING: %', 'sg-incident-response';
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-incident-form';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_container, 'sg-lm-incident-form', 'Incidenthantering och första åtgärder — övning', 'Incident response and first actions — practice', 5, 12, false) RETURNING id INTO _form;
  END IF;

  PERFORM pg_temp.author_learning_item(_form, 1, 'sg-lm-inc-01', b_press, c_press, 'foundational','judgement',
    'Övar att välja första åtgärd som säkrar innan den utreder.', 'Du hittar en person sittande på golvet i ett trapphus. Personen svarar men verkar omtöcknad.', 'Vad är starkast som första åtgärd?', 'You find a person sitting on the floor in a stairwell. They respond but seem dazed.', 'Which is strongest as a first action?', '[{"pref": true, "en": "Talk to the person, assess whether they need care, and call for help at the slightest doubt.", "sv": "Prata med personen, bedöm om hen behöver vård och larma vid minsta tveksamhet.", "err": "", "fb_sv": "Kontakt först ger dig den information du behöver för att avgöra allt annat. \"Vid minsta tveksamhet\" är rätt tröskel här – kostnaden för ett onödigt larm är låg, kostnaden för ett uteblivet är hög.", "rat_sv": "Kontakt, bedömning, larm – i den ordningen.", "score": 3, "fb_en": "Contact first gives you the information you need to decide everything else. \"At the slightest doubt\" is the right threshold – the cost of an unnecessary call is low, the cost of a missed one is high.", "k": "a"}, {"pref": false, "en": "Note the time and place and continue the round to raise the alarm from reception.", "sv": "Notera tid och plats och fortsätt ronden för att larma från receptionen.", "err": "delayed_escalation", "fb_sv": "Dokumentation är viktig men aldrig först när en person kan behöva vård. Tiden det tar att gå tillbaka är tid ingen får igen.", "rat_sv": "Dokumentation före kontakt.", "score": 1, "fb_en": "Documentation matters but never comes first when a person may need care. The time it takes to walk back is time nobody gets back.", "k": "b"}, {"pref": false, "en": "Help the person up and escort them out of the building.", "sv": "Hjälp upp personen och följ ut hen ur byggnaden.", "err": "outside_mandate", "fb_sv": "Att flytta någon vars tillstånd du inte känner till kan förvärra en skada. Att lämna personen utanför byggnaden flyttar dessutom problemet i stället för att lösa det.", "rat_sv": "Fysisk förflyttning utan kunskap om orsaken.", "score": 0, "fb_en": "Moving somebody whose condition you do not know can make an injury worse. Leaving them outside the building also moves the problem rather than solving it.", "k": "c"}]'::jsonb);

  PERFORM pg_temp.author_learning_item(_form, 2, 'sg-lm-inc-02', b_comm, c_comm, 'intermediate','judgement',
    'Övar att ge larmoperatören det som styr insatsen.', 'Du ringer 112 om en brand i en container på ett industriområde.', 'Vad säger du först?', 'You call the emergency number about a fire in a container at an industrial site.', 'What do you say first?', '[{"pref": true, "en": "The exact address and location on site, that a container is on fire, and what is closest to it.", "sv": "Exakt adress och plats på området, att det brinner i en container, och vad som står närmast.", "err": "", "fb_sv": "De tre uppgifterna avgör vad som skickas och hur snabbt. Vad som står närmast är den som oftast glöms och den som avgör spridningsrisken.", "rat_sv": "Plats, vad som brinner, spridningsrisk.", "score": 3, "fb_en": "Those three facts decide what is dispatched and how fast. What is closest is the one most often forgotten and the one that determines spread risk.", "k": "a"}, {"pref": false, "en": "That there is a fire and you need the fire service.", "sv": "Att det brinner och att ni behöver brandkåren.", "err": "weak_communication", "fb_sv": "Sant, men operatören kan inte skicka rätt resurs på det. Utan plats och omfattning blir nästa steg en rad frågor som kostar tid.", "rat_sv": "Saknar det som styr utlarmningen.", "score": 1, "fb_en": "True, but the operator cannot dispatch the right resource on that. Without location and scale the next step is a series of questions that cost time.", "k": "b"}, {"pref": false, "en": "An account of how the fire probably started.", "sv": "En redogörelse för hur branden sannolikt startade.", "err": "insufficient_information", "fb_sv": "Orsaken är intressant efteråt men styr inte insatsen nu, och den är dessutom en gissning så länge branden pågår.", "rat_sv": "Orsak före plats.", "score": 0, "fb_en": "The cause matters afterwards but does not drive the response now, and it is a guess while the fire is still burning.", "k": "c"}]'::jsonb);

  UPDATE public.scp_module_versions SET learning_form_id=_form WHERE id=_mver;

  -- ── sg-reporting-documentation ──
  SELECT mv.id INTO _mver FROM public.scp_module_versions mv
    JOIN public.scp_modules mm ON mm.id=mv.module_id WHERE mm.slug='sg-reporting-documentation';
  IF _mver IS NULL THEN
    RAISE EXCEPTION 'SCP_MODULE_MISSING: %', 'sg-reporting-documentation';
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-reporting-form';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_container, 'sg-lm-reporting-form', 'Rapportering och dokumentation — övning', 'Reporting and documentation — practice', 5, 12, false) RETURNING id INTO _form;
  END IF;

  PERFORM pg_temp.author_learning_item(_form, 1, 'sg-lm-rep-01', b_rep, c_rep, 'foundational','recognition',
    'Övar att skriva en notering som går att agera på.', 'Du ska lämna över en notering om en trasig kortläsare vid en sidoentré.', 'Vilken notering är starkast?', 'You need to hand over a note about a broken card reader at a side entrance.', 'Which note is strongest?', '[{"pref": true, "en": "\"Card reader at the east side entrance not working since 18:00. Door opens from inside but not outside. Fault reported.\"", "sv": "\"Kortläsare vid sidoentré öster fungerar ej sedan 18:00. Dörren går att öppna inifrån men inte utifrån. Felanmäld.\"", "err": "", "fb_sv": "Den sista meningen är det som gör noteringen användbar: den säger vad felet betyder för den som kommer efter, inte bara att något är trasigt.", "rat_sv": "Vad, var, sedan när, och vad det innebär praktiskt.", "score": 3, "fb_en": "The last sentence is what makes the note useful: it says what the fault means for whoever comes next, not just that something is broken.", "k": "a"}, {"pref": false, "en": "\"Card reader at the side entrance not working.\"", "sv": "\"Kortläsare vid sidoentré fungerar ej.\"", "err": "insufficient_information", "fb_sv": "Nästa person vet nu att något är trasigt men inte om dörren är låst, öppen eller går att använda. Det är konsekvensen som avgör vad de behöver göra.", "rat_sv": "Anger felet men inte konsekvensen.", "score": 1, "fb_en": "The next person now knows something is broken but not whether the door is locked, open or usable. The consequence is what decides what they need to do.", "k": "b"}, {"pref": false, "en": "\"The card reader has been smashed by somebody from outside.\"", "sv": "\"Kortläsaren är sönderslagen av någon utifrån.\"", "err": "unsupported_assumption", "fb_sv": "Om orsaken visar sig vara ett strömfel har noteringen skickat en utredning åt fel håll. Skriv det du ser, låt orsaken utredas.", "rat_sv": "Skriver in en orsak som inte är fastställd.", "score": 0, "fb_en": "If the cause turns out to be a power fault, the note has sent an investigation the wrong way. Write what you see and let the cause be established.", "k": "c"}]'::jsonb);

  PERFORM pg_temp.author_learning_item(_form, 2, 'sg-lm-rep-02', b_comm, c_comm, 'intermediate','judgement',
    'Övar att välja rätt mottagare för en avvikelse.', 'Du upptäcker att en brandsläckare saknar plombering. Fastighetsjour, arbetsledare och uppdragsgivarens skyddsombud är alla nåbara.', 'Vad är starkast?', 'You find a fire extinguisher with a missing seal. Building maintenance, your supervisor and the client safety representative are all reachable.', 'Which is strongest?', '[{"pref": true, "en": "Building maintenance, since they own the equipment – and record the deviation in your own report.", "sv": "Fastighetsjour, eftersom de äger utrustningen – och notera avvikelsen i din egen rapport.", "err": "", "fb_sv": "Rätt mottagare är den som kan åtgärda. Den egna noteringen behövs ändå, eftersom den visar att avvikelsen upptäcktes och fördes vidare.", "rat_sv": "Den som äger utrustningen, plus notering i egen linje.", "score": 3, "fb_en": "The right recipient is whoever can fix it. Your own note is still needed, because it shows the deviation was found and passed on.", "k": "a"}, {"pref": false, "en": "Your supervisor, who can decide who should be informed.", "sv": "Arbetsledaren, som får avgöra vem som ska informeras.", "err": "weak_communication", "fb_sv": "Inte fel, men det lägger ett extra steg mellan upptäckten och åtgärden. För en trasig brandsläckare är det steget onödigt.", "rat_sv": "Rätt att rapportera men fel väg först.", "score": 1, "fb_en": "Not wrong, but it puts an extra step between the discovery and the fix. For a fire extinguisher that step is unnecessary.", "k": "b"}, {"pref": false, "en": "Nobody – mentioning it at the next handover is enough.", "sv": "Ingen – det räcker att nämna det vid nästa skiftbyte.", "err": "failure_to_document", "fb_sv": "En brandsläckare utan plombering kan vara tömd. Att vänta till skiftbytet innebär att den står oanvändbar under hela passet utan att någon vet om det.", "rat_sv": "Ingen rapportering alls.", "score": 0, "fb_en": "An extinguisher with no seal may be empty. Waiting until handover means it stands unusable for the whole shift with nobody knowing.", "k": "c"}]'::jsonb);

  UPDATE public.scp_module_versions SET learning_form_id=_form WHERE id=_mver;

  -- ── sg-ethics-responsibility ──
  SELECT mv.id INTO _mver FROM public.scp_module_versions mv
    JOIN public.scp_modules mm ON mm.id=mv.module_id WHERE mm.slug='sg-ethics-responsibility';
  IF _mver IS NULL THEN
    RAISE EXCEPTION 'SCP_MODULE_MISSING: %', 'sg-ethics-responsibility';
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-ethics-form';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_container, 'sg-lm-ethics-form', 'Etik och yrkesansvar — övning', 'Ethics and professional responsibility — practice', 5, 12, false) RETURNING id INTO _form;
  END IF;

  PERFORM pg_temp.author_learning_item(_form, 1, 'sg-lm-eth-01', b_ethic, c_ethic, 'intermediate','judgement',
    'Övar att hantera känsliga uppgifter enligt uppdrag.', 'En kollega frågar vad som stod i en incidentrapport om en namngiven anställd. Kollegan var inte med vid händelsen.', 'Vad är starkast?', 'A colleague asks what was in an incident report about a named employee. The colleague was not present at the event.', 'Which is strongest?', '[{"pref": true, "en": "Say the content is only shared with those who need it for their work, and refer them to the supervisor if they do need to know.", "sv": "Säg att innehållet bara delas med dem som behöver det i sitt arbete, och hänvisa till arbetsledaren om kollegan behöver veta.", "err": "", "fb_sv": "Behovsprincipen är enklast att hålla när den sägs rakt och utan anklagelse. Att hänvisa vidare gör att en kollega med ett legitimt behov ändå får vägen framåt.", "rat_sv": "Behovsprincipen, sagd rakt och utan anklagelse.", "score": 3, "fb_en": "Need-to-know is easiest to hold when it is stated plainly and without accusation. Referring onward means a colleague with a legitimate need still has a way forward.", "k": "a"}, {"pref": false, "en": "Say you are not allowed to talk about it.", "sv": "Säg att du inte får prata om det.", "err": "weak_communication", "fb_sv": "Slutsatsen är rätt men den låter godtycklig. Att kort säga varför gör det lättare för kollegan att acceptera och svårare att fråga runt.", "rat_sv": "Rätt men utan väg framåt.", "score": 1, "fb_en": "The conclusion is right but it sounds arbitrary. Briefly saying why makes it easier for the colleague to accept and harder to go asking elsewhere.", "k": "b"}, {"pref": false, "en": "Tell them the gist, since the colleague works on the same site.", "sv": "Berätta huvuddragen, kollegan arbetar ju på samma objekt.", "err": "excessive_informal_trust", "fb_sv": "Att arbeta på samma objekt är inte samma sak som att behöva uppgiften. Personuppgifter om en namngiven anställd sprids inte lättare bara för att mottagaren är kollega.", "rat_sv": "Kollegaskap är inte behovsgrund.", "score": 0, "fb_en": "Working on the same site is not the same as needing the information. Personal data about a named employee does not travel more freely just because the recipient is a colleague.", "k": "c"}]'::jsonb);

  PERFORM pg_temp.author_learning_item(_form, 2, 'sg-lm-eth-02', b_mandate, c_mandate, 'advanced','judgement',
    'Övar att hålla gränsen för det egna mandatet.', 'En uppdragsgivare ber dig hålla extra uppsikt över en namngiven anställd som de misstänker för svinn.', 'Vad är starkast?', 'A client asks you to keep an extra eye on a named employee they suspect of theft.', 'Which is strongest?', '[{"pref": true, "en": "Say that targeted observation of a named individual needs to be handled between your supervisor and the client, and pass the request on.", "sv": "Säg att riktad bevakning av en enskild person behöver hanteras av din arbetsledare och uppdragsgivaren tillsammans, och för frågan vidare.", "err": "", "fb_sv": "Riktad bevakning av en namngiven person är ett annat uppdrag än allmän bevakning, med andra krav på grund och dokumentation. Det är inte ditt beslut att ta i stunden – men det är ditt ansvar att föra det vidare i stället för att avfärda det.", "rat_sv": "Lyfter uppdraget till rätt nivå i stället för att ta det själv.", "score": 3, "fb_en": "Targeted observation of a named individual is a different assignment from general guarding, with different requirements for justification and documentation. It is not your decision to take on the spot – but it is your responsibility to pass it on rather than dismiss it.", "k": "a"}, {"pref": false, "en": "Say you cannot do that and leave it there.", "sv": "Säg att du inte kan göra det och lämna det där.", "err": "weak_communication", "fb_sv": "Gränsen hålls, men uppdragsgivaren har ett problem som inte försvinner. Att bara säga nej gör det troligare att frågan ställs till någon annan i stället.", "rat_sv": "Avvisar utan att föra frågan vidare.", "score": 1, "fb_en": "The boundary holds, but the client has a problem that does not go away. A flat no makes it more likely the request is put to somebody else instead.", "k": "b"}, {"pref": false, "en": "Keep an eye on the person and report what you see.", "sv": "Håll uppsikt över personen och rapportera vad du ser.", "err": "outside_mandate", "fb_sv": "Det känns tillmötesgående, men du har nu inlett riktad övervakning av en enskild anställd utan formell grund. Det är precis den sortens uppdragsutvidgning som ska beslutas, inte glida in.", "rat_sv": "Utökar uppdraget på egen hand.", "score": 0, "fb_en": "It feels accommodating, but you have now begun targeted monitoring of an individual employee with no formal basis. That is exactly the kind of scope expansion that must be decided, not drifted into.", "k": "c"}]'::jsonb);

  UPDATE public.scp_module_versions SET learning_form_id=_form WHERE id=_mver;

  RAISE NOTICE 'Batch 6: six Security Guard modules now carry learning activity';
END $$;

DROP FUNCTION IF EXISTS pg_temp.author_learning_item(uuid,int,text,uuid,uuid,text,text,text,text,text,text,text,jsonb);