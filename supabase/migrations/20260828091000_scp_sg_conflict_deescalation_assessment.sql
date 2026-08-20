-- #51 Batch 2 — Konflikthantering & nedtrappning.
--
-- Twelve scenario items about lowering tension before a situation escalates,
-- setting a boundary without humiliating anybody, and choosing the least
-- intrusive action that actually resolves the problem.
--
-- ── THE CONSTRUCT ───────────────────────────────────────────────────────
--
-- De-escalation is easy to write badly. The failure mode is an item where the
-- "right" answer is simply the calmest-sounding sentence, which measures tone
-- preference rather than judgement. Every item here therefore makes the weaker
-- options operationally plausible: they resolve something, just at a cost --
-- an unnecessary escalation, a boundary abandoned, a colleague left
-- unsupported, or a decision taken outside the mandate.
--
-- Seven items are marked safety-critical, because misjudging tension is where
-- real harm happens, and those route to human review rather than being scored
-- deterministically alone.
--
-- ── WHAT IT DOES NOT MEASURE ────────────────────────────────────────────
--
-- Not temperament, not emotional stability, not stress tolerance as a trait,
-- and not whether somebody would stay calm in reality. It measures which
-- action they select when the situation is described to them.
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

  IF b_comm IS NULL OR b_coop IS NULL OR b_deesc IS NULL OR b_ethic IS NULL OR b_mandate IS NULL OR b_press IS NULL OR b_prop IS NULL THEN
    RAISE EXCEPTION 'SCP_CONTENT_GRAPH_MISSING: the competency graph does not carry the behaviours sg-conflict-deescalation maps to';
  END IF;

  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-conflict-deescalation', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Konflikthantering & nedtrappning', 'Conflict management & de-escalation', 'Ger underlag om hur en person sänker spänningsnivån, håller en gräns utan att förnedra, och väljer den minst ingripande åtgärd som faktiskt löser situationen. Resultatet är utvecklingsinriktat underlag, aldrig ett urvalsbeslut.', 'Provides evidence about how a person lowers tension, holds a boundary without humiliating anybody, and chooses the least intrusive action that actually resolves the situation. The result is developmental evidence, never a selection decision.',
       ARRAY['Personlighet','Ärlighet som personlighetsdrag','Emotionell stabilitet','Motivation','Framtida arbetsprestation','Fysisk förmåga','Formell auktorisation','Laglig behörighet'],
       ARRAY['Personality','Honesty as a personality trait','Emotional stability','Motivation','Future job performance','Physical ability','Formal authorisation','Legal authority'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture)
  VALUES (_fam, 'sg-conflict-deescalation', 'Konflikthantering & nedtrappning', 'Conflict management & de-escalation', 'development_programme', false)
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

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-conflict-deescalation-form-a';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_ver, 'sg-conflict-deescalation-form-a', 'Konflikthantering A', 'Conflict management A', 20, 28, false)
    RETURNING id INTO _form;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id=_form) THEN RETURN; END IF;

  PERFORM pg_temp.author_item(_form, 1, 'sg-cd-01', b_deesc, c_deesc,
    'sjt_best_response','foundational','judgement','situational_judgement','judgement', true, true,
    'Sänker spänningsnivån verbalt innan en situation trappas upp.',
    'Reception i kontorshus, andra besökare närvarande.',
    'Ett svar i ett scenario säger inget om personens tålamod eller temperament generellt.',
    'En besökare nekas tillträde eftersom ingen på plats kan bekräfta mötet. Besökaren höjer rösten och säger att detta är förnedrande. Tre andra besökare i receptionen tittar på.',
    'Vad gör du?',
    'A visitor is refused entry because nobody on site can confirm the meeting. They raise their voice and say this is humiliating. Three other visitors in reception are watching.',
    'What do you do?',
    '[{"rat_sv": "Flyttar samtalet från publik, bekräftar personens upplevelse och håller kvar rutinen.", "pref": true, "k": "a", "score": 3, "en": "Lower your voice, ask them to step aside with you, say you understand it feels wrong, and explain what is needed to resolve it.", "err": "", "sv": "Sänk rösten, be personen följa med några steg åt sidan, säg att du förstår att det känns fel och förklara vad som krävs för att lösa det."}, {"rat_sv": "Håller rutinen men lämnar personen utan väg framåt, vilket ofta höjer nivån.", "pref": false, "k": "b", "score": 1, "en": "Calmly repeat that you cannot admit them without confirmation.", "err": "weak_communication", "sv": "Upprepa lugnt att du inte kan släppa in personen utan bekräftelse."}, {"rat_sv": "Att kalla in förstärkning mot en person som höjer rösten är oproportionerligt.", "pref": false, "k": "c", "score": 0, "en": "Call a colleague and ask the visitor to leave the building.", "err": "premature_escalation", "sv": "Tillkalla kollega och be besökaren lämna byggnaden."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 2, 'sg-cd-02', b_prop, c_prop,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', true, true,
    'Väljer den minst ingripande åtgärd som löser situationen.',
    'Butik, misstänkt snatteri, kund förnekar.',
    'Ett val i ett scenario säger inget om personens allmänna omdöme om människor.',
    'Du har sett en kund lägga en vara i sin jacka och passera kassalinjen. När du talar med kunden utanför kassan förnekar hen och blir upprörd. Butikschefen är på plats.',
    'Vad är rimligast?',
    'You saw a customer put an item into their jacket and pass the checkout. When you speak to them beyond the tills they deny it and become upset. The store manager is present.',
    'What is most reasonable?',
    '[{"rat_sv": "Beskriver iakttagelsen sakligt, erbjuder en väg som löser det utan konfrontation, och tar in butikschefen.", "pref": true, "k": "a", "score": 3, "en": "Calmly state what you saw, ask the customer to come with you to the manager, and let the store decide how to handle it.", "err": "", "sv": "Säg lugnt vad du såg, be kunden följa med till butikschefen och låt butiken avgöra hur det hanteras."}, {"rat_sv": "Undviker konflikten men lämnar iakttagelsen ohanterad.", "pref": false, "k": "b", "score": 1, "en": "Let the customer go and write a note about the incident afterwards.", "err": "weak_communication", "sv": "Låt kunden gå och skriv en notering om händelsen efteråt."}, {"rat_sv": "Fysiskt kvarhållande och genomsökning saknar stöd i uppdraget.", "pref": false, "k": "c", "score": 0, "en": "Detain the customer and ask them to empty their jacket pockets on the spot.", "err": "outside_mandate", "sv": "Hålla kvar kunden och be hen tömma jackfickorna på plats."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 3, 'sg-cd-03', b_deesc, c_deesc,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', true, true,
    'Håller en gräns utan att förnedra personen inför andra.',
    'Insläpp till ett evenemang, kö bakom.',
    'Att välja formulering i ett scenario säger inget om personens sociala förmåga i stort.',
    'Vid insläppet till ett evenemang bedömer du att en person är för berusad för att släppas in. Personen är inte aggressiv men argumenterar och har vänner med sig som redan kommit in. Kön bakom växer.',
    'Hur hanterar du det?',
    'At the entrance to an event you judge that a person is too intoxicated to be admitted. They are not aggressive but are arguing, and their friends are already inside. The queue behind is growing.',
    'How do you handle it?',
    '[{"rat_sv": "Kort, tydligt besked, en praktisk väg framåt, och kön hålls igång.", "pref": true, "k": "a", "score": 3, "en": "Give a short, clear decision, offer to contact the friends inside, and guide the person aside so the queue can move.", "err": "", "sv": "Ge ett kort och tydligt besked, erbjud att kontakta vännerna inne, och lotsa personen åt sidan så kön kan fortsätta."}, {"rat_sv": "Förhandling i kön förlänger situationen och gör beslutet otydligt.", "pref": false, "k": "b", "score": 1, "en": "Explain at length in the queue why the judgement was made and listen to the objections.", "err": "weak_communication", "sv": "Förklara utförligt i kön varför bedömningen gjorts och lyssna på invändningarna."}, {"rat_sv": "Att avvisa vännerna är en kollektiv åtgärd utan grund.", "pref": false, "k": "c", "score": 0, "en": "Say the friends will also have to leave if the person does not accept the decision.", "err": "poor_proportionality", "sv": "Säg att även vännerna får lämna om personen inte accepterar beslutet."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 4, 'sg-cd-04', b_mandate, c_mandate,
    'sjt_best_response','intermediate','judgement','mandate_and_escalation','mandate', false, false,
    'Håller kvar en rutin när den ifrågasätts av någon med hög status.',
    'Kontorshus, passerkontroll vid personalingång.',
    'Ett svar om rutinefterlevnad i ett scenario säger inget om personens allmänna påverkbarhet.',
    'En person går förbi passerkontrollen utan att visa kort och säger irriterat: "Du vet väl vem jag är." Du känner igen ansiktet men vet inte namn eller roll.',
    'Vad gör du?',
    'A person walks past the access control without showing a card and says irritably: "You know who I am." You recognise the face but do not know their name or role.',
    'What do you do?',
    '[{"rat_sv": "Håller rutinen, gör den enkel att följa och undviker att göra det till en statusfråga.", "pref": true, "k": "a", "score": 3, "en": "Say you recognise them but need the card so the record is correct, and ask for it politely.", "err": "", "sv": "Säg att du känner igen personen men behöver kortet för att registreringen ska stämma, och be om det vänligt."}, {"rat_sv": "Igenkänning är inte identifiering och lämnar passagen oregistrerad.", "pref": false, "k": "b", "score": 1, "en": "Let them pass since you recognise the face, and mention it to the supervisor later.", "err": "excessive_informal_trust", "sv": "Låt personen passera eftersom du känner igen ansiktet, och nämn det för arbetsledaren senare."}, {"rat_sv": "Att blockera fysiskt gör en rutinfråga till en konflikt.", "pref": false, "k": "c", "score": 0, "en": "Stand in their way until they show a card.", "err": "premature_escalation", "sv": "Ställ dig i vägen tills personen visar kort."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 5, 'sg-cd-05', b_deesc, c_deesc,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Möter oro och ilska som har en begriplig orsak utan att ge upp gränsen.',
    'Sjukhus, besökstider, anhörig.',
    'Att hantera en upprörd anhörig i ett scenario säger inget om personens empati som egenskap.',
    'En anhörig vill komma in på en avdelning utanför besökstid. Personen är gråtfärdig, säger att det är brådskande och att personalen inte svarar i telefon. Du har ingen möjlighet att göra undantag själv.',
    'Vad gör du?',
    'A relative wants to enter a ward outside visiting hours. They are close to tears, say it is urgent, and that staff are not answering the phone. You have no authority to make an exception yourself.',
    'What do you do?',
    '[{"rat_sv": "Bekräftar situationen, tar aktivt ansvar för kontakten uppåt och håller kvar gränsen.", "pref": true, "k": "a", "score": 3, "en": "Say you cannot decide on an exception but that you will contact the ward for them now, and stay with them while you do.", "err": "", "sv": "Säg att du inte kan besluta om undantag men att du kontaktar avdelningen åt personen nu, och stanna kvar medan du gör det."}, {"rat_sv": "Korrekt men lämnar personen ensam med problemet.", "pref": false, "k": "b", "score": 1, "en": "Explain that visiting hours apply and refer them to try calling again.", "err": "weak_communication", "sv": "Förklara att besökstiderna gäller och hänvisa personen till att försöka ringa igen."}, {"rat_sv": "Att släppa in utan mandat flyttar problemet in på avdelningen.", "pref": false, "k": "c", "score": 0, "en": "Admit the person because the situation appears urgent.", "err": "outside_mandate", "sv": "Släpp in personen eftersom situationen verkar brådskande."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 6, 'sg-cd-06', b_coop, c_coop,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Samordnar med en kollega som är på väg att trappa upp i onödan.',
    'Köpcentrum, två väktare, ungdomsgrupp.',
    'Att hantera en kollegas agerande i ett scenario säger inget om personens samarbetsförmåga generellt.',
    'Två grupper ungdomar diskuterar högljutt utanför en butik. Ingen är hotfull. Din kollega går fram med höjd röst och säger åt alla att lämna området omedelbart. Nivån stiger direkt.',
    'Vad gör du?',
    'Two groups of young people are arguing loudly outside a shop. Nobody is threatening. Your colleague walks up with a raised voice and tells everybody to leave the area immediately. The tension rises at once.',
    'What do you do?',
    '[{"rat_sv": "Tar över kontakten utan att underkänna kollegan offentligt, och sänker nivån.", "pref": true, "k": "a", "score": 3, "en": "Step in beside your colleague, take over the conversation in a calmer tone, and talk it through with them afterwards.", "err": "", "sv": "Gå in bredvid kollegan, ta över samtalet i lugnare ton och stäm av med kollegan efteråt."}, {"rat_sv": "Passivt stöd låter upptrappningen fortsätta.", "pref": false, "k": "b", "score": 1, "en": "Stand behind your colleague and back the instruction already given.", "err": "weak_communication", "sv": "Ställ dig bakom kollegan och stötta beskedet som redan getts."}, {"rat_sv": "Att motsäga kollegan inför gruppen underminerar båda.", "pref": false, "k": "c", "score": 0, "en": "Tell the young people your colleague is wrong and that they can stay.", "err": "weak_communication", "sv": "Säga till ungdomarna att kollegan har fel och att de kan stanna."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 7, 'sg-cd-07', b_mandate, c_mandate,
    'sjt_best_response','intermediate','judgement','mandate_and_escalation','mandate', true, true,
    'Skiljer mellan en regel som gäller och en förhandling som inte är hens att föra.',
    'Byggarbetsplats, skyddsutrustning vid grind.',
    'Ett svar om regelefterlevnad i ett scenario säger inget om personens allmänna följsamhet.',
    'En underentreprenör vill passera grinden utan hjälm. Han säger att han bara ska hämta en sak och att han gjort det hundra gånger. Platsens regel är hjälm innanför grinden, utan undantag.',
    'Vad gör du?',
    'A subcontractor wants to pass the gate without a helmet. He says he is only fetching one thing and has done it a hundred times. The site rule is helmets inside the gate, without exception.',
    'What do you do?',
    '[{"rat_sv": "Håller regeln, gör efterlevnad enkel och undviker att göra det personligt.", "pref": true, "k": "a", "score": 3, "en": "Say the rule applies inside the gate and offer a loan helmet so the errand can be done straight away.", "err": "", "sv": "Säg att regeln gäller innanför grinden och erbjud en lånehjälm så ärendet kan utföras direkt."}, {"rat_sv": "Regeln hålls men utan lösning, vilket ofta leder till att den kringgås senare.", "pref": false, "k": "b", "score": 1, "en": "Refuse entry and refer to the rule.", "err": "weak_communication", "sv": "Neka passage och hänvisa till att regeln gäller."}, {"rat_sv": "Ett undantag för ett kort ärende är precis hur regeln urholkas.", "pref": false, "k": "c", "score": 0, "en": "Let him go in quickly since it is only one item.", "err": "excessive_informal_trust", "sv": "Låt honom gå in snabbt eftersom det bara rör en sak."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 8, 'sg-cd-08', b_deesc, c_deesc,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Hanterar ilska som riktas mot en annan funktion utan att ta över konflikten.',
    'Logistikterminal, chaufför och lastkaj.',
    'Att möta en upprörd person i ett scenario säger inget om personens stresstålighet.',
    'En chaufför har väntat i tre timmar på lossning och skriker mot terminalpersonalen. Han ställer sedan lastbilen så att den blockerar infarten och sätter sig i hytten.',
    'Vad gör du först?',
    'A driver has waited three hours for unloading and is shouting at the terminal staff. He then parks his lorry so it blocks the entrance and sits in the cab.',
    'What do you do first?',
    '[{"rat_sv": "Adresserar det som faktiskt är ditt problem – infarten – och kopplar in den som äger orsaken.", "pref": true, "k": "a", "score": 3, "en": "Approach calmly, say the entrance must stay clear, ask what would resolve the wait, and contact the terminal manager.", "err": "", "sv": "Gå fram lugnt, säg att infarten måste vara fri, fråga vad som skulle lösa väntan och kontakta terminalansvarig."}, {"rat_sv": "Att invänta att någon annan löser det lämnar infarten blockerad.", "pref": false, "k": "b", "score": 1, "en": "Wait until the terminal staff have resolved the unloading question.", "err": "delayed_escalation", "sv": "Avvakta tills terminalpersonalen har löst lossningsfrågan."}, {"rat_sv": "Bärgning är en oproportionerlig första åtgärd mot en person som går att tala med.", "pref": false, "k": "c", "score": 0, "en": "Order the lorry to be towed since it is blocking the entrance.", "err": "premature_escalation", "sv": "Beställa bärgning av lastbilen eftersom den blockerar infarten."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 9, 'sg-cd-09', b_ethic, c_ethic,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Hanterar en gränsdragning där personen har ett rimligt skäl men fel förutsättning.',
    'Kontorshus, tidigare anställd.',
    'Ett svar i ett scenario säger inget om personens integritet som egenskap.',
    'En tidigare anställd kommer för att hämta personliga tillhörigheter. Anställningen avslutades i förra veckan och passerkortet är spärrat. Personen är lugn men uppenbart ledsen och säger att HR lovat att det skulle gå bra.',
    'Vad gör du?',
    'A former employee comes to collect personal belongings. Their employment ended last week and the access card is blocked. They are calm but clearly upset and say HR promised it would be fine.',
    'What do you do?',
    '[{"rat_sv": "Behandlar personen med respekt, verifierar påståendet hos den som kan bekräfta det.", "pref": true, "k": "a", "score": 3, "en": "Ask them to wait in reception, contact HR to confirm, and explain that you are doing so right now.", "err": "", "sv": "Be personen vänta i receptionen, kontakta HR för att bekräfta, och förklara att du gör det just nu."}, {"rat_sv": "Formellt korrekt men lämnar personen utan väg framåt i en känslig situation.", "pref": false, "k": "b", "score": 1, "en": "Say the card is blocked and that you therefore cannot help.", "err": "weak_communication", "sv": "Säg att kortet är spärrat och att du därför inte kan hjälpa till."}, {"rat_sv": "Ett muntligt påstående om ett löfte är inte en bekräftelse.", "pref": false, "k": "c", "score": 0, "en": "Escort the person up to their desk since they say HR approved it.", "err": "excessive_informal_trust", "sv": "Följa med personen upp till skrivbordet eftersom hen säger att HR godkänt det."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 10, 'sg-cd-10', b_prop, c_prop,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', false, false,
    'Väljer åtgärd som löser problemet utan att skapa ett nytt.',
    'Evenemang, filmning av personal.',
    'Ett val i ett scenario säger inget om personens allmänna omdöme i mediefrågor.',
    'En besökare filmar personalen vid insläppet och kommenterar högt. Ingen regel förbjuder filmning i lokalen, men personalen är obekväm och kön står still.',
    'Vad är rimligast?',
    'A visitor is filming the staff at the entrance and commenting loudly. No rule forbids filming on the premises, but the staff are uncomfortable and the queue has stopped.',
    'What is most reasonable?',
    '[{"rat_sv": "Adresserar det som faktiskt är problemet – flödet – utan att uppfinna en regel.", "pref": true, "k": "a", "score": 3, "en": "Ask the person to step aside so the queue can move, and leave the filming alone since it breaks no rule.", "err": "", "sv": "Be personen att stiga åt sidan så kön kan röra sig, och låt filmningen vara eftersom den inte bryter mot någon regel."}, {"rat_sv": "Ignorerar det praktiska problemet med stoppat flöde.", "pref": false, "k": "b", "score": 1, "en": "Ignore the filming entirely and carry on as normal.", "err": "weak_communication", "sv": "Ignorera filmningen helt och fortsätt arbeta som vanligt."}, {"rat_sv": "Att kräva radering saknar stöd och skapar en ny konflikt.", "pref": false, "k": "c", "score": 0, "en": "Demand that the person stops filming and deletes the material.", "err": "outside_mandate", "sv": "Kräva att personen slutar filma och raderar materialet."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 11, 'sg-cd-11', b_comm, c_comm,
    'sjt_best_response','intermediate','judgement','operational_communication','judgement', false, false,
    'Överlämnar en pågående konflikt så att nästa person kan ta vid.',
    'Skiftbyte mitt i en olöst situation.',
    'Ett svar om överlämning i ett scenario säger inget om personens kommunikation i stort.',
    'Ditt pass tar slut mitt i en situation: en besökare har nekats tillträde, är fortfarande på plats och har sagt att hen tänker vänta tills någon "med ansvar" kommer.',
    'Vad behöver din överlämning innehålla?',
    'Your shift ends in the middle of a situation: a visitor has been refused entry, is still present, and has said they intend to wait until somebody "in charge" arrives.',
    'What does your handover need to contain?',
    '[{"rat_sv": "Läge, vidtagen åtgärd, och den upplysning som avgör vad nästa person bör göra.", "pref": true, "k": "a", "score": 3, "en": "What was refused and why, what has already been said to the person, and that they stated they intend to wait.", "err": "", "sv": "Vad som nekats och varför, vad som redan sagts till personen, och att hen uppgett att hon tänker vänta kvar."}, {"rat_sv": "Utan skälet kan nästa person inte hålla samma linje.", "pref": false, "k": "b", "score": 1, "en": "That a visitor was refused entry and is still present.", "err": "insufficient_information", "sv": "Att en besökare nekats tillträde och fortfarande är kvar."}, {"rat_sv": "Karaktärsomdömen hjälper ingen vidare och följer med personen.", "pref": false, "k": "c", "score": 0, "en": "That the visitor is difficult and should be handled firmly.", "err": "unsupported_assumption", "sv": "Att besökaren är besvärlig och bör hanteras bestämt."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 12, 'sg-cd-12', b_press, c_press,
    'sjt_best_response','advanced','prioritisation','prioritisation','judgement', true, true,
    'Prioriterar mellan att lösa en konflikt och att bevaka en risk.',
    'Köpcentrum, ensam väktare, två samtidiga händelser.',
    'Prioritering i ett scenario säger inget om personens förmåga att arbeta under press generellt.',
    'Du är ensam väktare. Vid entrén pågår ett gräl mellan två kunder som blir högljutt men inte fysiskt. Samtidigt larmar en butik om att en nödutgång längst bort i gallerian står öppen.',
    'Vad gör du?',
    'You are the only guard on duty. At the entrance an argument between two customers is getting loud but not physical. At the same time a shop reports that a fire exit at the far end of the centre is standing open.',
    'What do you do?',
    '[{"rat_sv": "Delegerar det som går att delegera, hanterar det som kräver närvaro, och håller båda spåren levande.", "pref": true, "k": "a", "score": 3, "en": "Ask the shop to watch the fire exit and report anyone passing, deal with the argument yourself, and handle the door once it is resolved.", "err": "", "sv": "Be butiken hålla uppsikt över nödutgången och larma om någon passerar, gå själv till grälet, och åtgärda dörren när det är löst."}, {"rat_sv": "Rätt att prioritera personer, men nödutgången lämnas helt obevakad.", "pref": false, "k": "b", "score": 1, "en": "Go to the argument and deal with the fire exit afterwards.", "err": "tunnel_vision", "sv": "Gå till grälet och ta nödutgången efteråt."}, {"rat_sv": "Ett högljutt men icke-fysiskt gräl lämnas medan du går längst bort.", "pref": false, "k": "c", "score": 0, "en": "Go to the fire exit first since it is a physical security risk.", "err": "poor_proportionality", "sv": "Gå till nödutgången först eftersom den är en fysisk säkerhetsrisk."}]'::jsonb);

  RAISE NOTICE 'Konflikthantering & nedtrappning — 12 items authored';
END $$;

DROP FUNCTION IF EXISTS pg_temp.author_item(uuid,int,text,uuid,uuid,text,text,text,text,text,boolean,boolean,text,text,text,text,text,text,text,jsonb);
