-- #51 Batch 4 — Tillträde, behörighet & access control.
--
-- Twelve items about the decision at the boundary: who gets in, on what basis,
-- and what happens when the rule and the situation disagree.
--
-- ── THE CONSTRUCT ───────────────────────────────────────────────────────
--
-- Access control is where security and service collide most often, and the
-- interesting judgement is rarely "follow the rule or not". It is what to do
-- when following the rule is socially expensive, when the person in front of
-- you is senior, upset, in a hurry, or genuinely inconvenienced by a control
-- that exists for good reason.
--
-- Every weaker option here is something a competent guard might actually do.
-- Tailgating is admitted by politeness, not carelessness; an exception is made
-- for a plausible reason, not a stupid one. That is what makes the items
-- discriminating rather than obvious.
--
-- No item invents a legal power, and no item turns on remembering a rule: where
-- a site instruction matters, the scenario states it.
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
  VALUES (_iv, 'sv-SE', 'source',   _scenario_sv, _prompt_sv),
         (_iv, 'en-GB', 'approved', _scenario_en, _prompt_en);

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
  SELECT bv.id, cv.competency_id INTO b_sit, c_sit
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE cv.name_sv='Situationsmedvetenhet' LIMIT 1;

  IF b_comm IS NULL OR b_coop IS NULL OR b_deesc IS NULL OR b_ethic IS NULL OR b_mandate IS NULL OR b_press IS NULL OR b_prop IS NULL OR b_sit IS NULL THEN
    RAISE EXCEPTION 'SCP_CONTENT_GRAPH_MISSING: the competency graph does not carry the behaviours sg-access-control maps to';
  END IF;

  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-access-control', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Tillträde, behörighet & access control', 'Access, authorisation & access control', 'Ger underlag om hur en person fattar beslut vid gränsen: vem som släpps in, på vilken grund, och vad som händer när regeln och situationen inte pekar åt samma håll. Resultatet är utvecklingsinriktat underlag, aldrig ett urvalsbeslut.', 'Provides evidence about how a person decides at the boundary: who is admitted, on what basis, and what happens when the rule and the situation point in different directions. The result is developmental evidence, never a selection decision.',
       ARRAY['Personlighet','Ärlighet som personlighetsdrag','Emotionell stabilitet','Motivation','Framtida arbetsprestation','Fysisk förmåga','Formell auktorisation','Laglig behörighet'],
       ARRAY['Personality','Honesty as a personality trait','Emotional stability','Motivation','Future job performance','Physical ability','Formal authorisation','Legal authority'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture)
  VALUES (_fam, 'sg-access-control', 'Tillträde, behörighet & access control', 'Access, authorisation & access control', 'development_programme', false)
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

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-access-control-form-a';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_ver, 'sg-access-control-form-a', 'Tillträde A', 'Access control A', 20, 28, false)
    RETURNING id INTO _form;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id=_form) THEN RETURN; END IF;

  PERFORM pg_temp.author_item(_form, 1, 'sg-ac-01', b_mandate, c_mandate,
    'sjt_best_response','foundational','recognition','mandate_and_escalation','mandate', true, true,
    'Upptäcker och hanterar att någon följer med in på annans behörighet.',
    'Personalingång med kortläsare, morgonrusning.',
    'Ett svar om tillträde i ett scenario säger inget om personens allmänna vaksamhet.',
    'Vid personalingången passerar en medarbetare med kort. Direkt bakom följer en person utan att blippa, med kaffemugg i ena handen och laptopväska i den andra. Medarbetaren håller upp dörren.',
    'Vad gör du?',
    'At the staff entrance an employee badges through. Immediately behind, a person follows without badging, holding a coffee cup in one hand and a laptop bag in the other. The employee holds the door open.',
    'What do you do?',
    '[{"en": "Catch the person politely, ask them to badge through, and offer to hold the cup while they do.", "err": "", "rat_sv": "Stoppar passagen vänligt och gör registreringen möjlig utan att skuldbelägga någon.", "pref": true, "k": "a", "sv": "Fånga upp personen vänligt, be om blippning och erbjud att hålla muggen medan det sker.", "score": 3}, {"en": "Let the person go and record that an unbadged entry occurred.", "err": "failure_to_document", "rat_sv": "Låter passagen ske men noterar den, vilket inte återställer kontrollen.", "pref": false, "k": "b", "sv": "Låt personen gå och notera att en obehörig passage skett.", "score": 1}, {"en": "Let it pass, since an employee evidently admitted the person.", "err": "excessive_informal_trust", "rat_sv": "Att en anställd håller upp dörren är just hur tailgating normaliseras.", "pref": false, "k": "c", "sv": "Låt det passera eftersom en anställd uppenbarligen släppte in personen.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 2, 'sg-ac-02', b_ethic, c_ethic,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', true, true,
    'Behandlar behörighetsbeslut lika oavsett personens status.',
    'Reception, besökare med hög status.',
    'Ett svar i ett scenario säger inget om personens generella auktoritetsförhållande.',
    'En person presenterar sig som styrelseledamot och vill upp till ledningsvåningen. Hen finns inte i besökslistan och har ingen kontaktperson på plats som svarar.',
    'Vad gör du?',
    'A person introduces themselves as a board member and wants to go up to the executive floor. They are not on the visitor list and no on-site contact is answering.',
    'What do you do?',
    '[{"en": "Explain that you need a confirmation, offer a place to wait, and keep trying to reach a contact until you get an answer.", "err": "", "rat_sv": "Samma rutin som för alla, med aktiv hjälp att hitta en väg framåt.", "pref": true, "k": "a", "sv": "Förklara att du behöver en bekräftelse, erbjud väntplats och fortsätt söka en kontaktperson tills du får svar.", "score": 3}, {"en": "Say you unfortunately cannot admit anybody who is not on the list.", "err": "weak_communication", "rat_sv": "Rutinen hålls men personen lämnas utan väg framåt.", "pref": false, "k": "b", "sv": "Säg att du tyvärr inte kan släppa in någon som inte står i listan.", "score": 1}, {"en": "Let the person up, since a board member would reasonably have access.", "err": "excessive_informal_trust", "rat_sv": "Titel är inte behörighet, och undantaget skapar ett prejudikat.", "pref": false, "k": "c", "sv": "Släpp upp personen eftersom en styrelseledamot rimligen har tillträde.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 3, 'sg-ac-03', b_prop, c_prop,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', false, false,
    'Väljer den minst ingripande kontrollen som ändå fyller sitt syfte.',
    'Industriområde, hantverkare med verktyg.',
    'Ett val av kontrollnivå i ett scenario säger inget om personens proportionalitetskänsla generellt.',
    'En hantverkare anländer till en grind med en stor verktygsväska. Uppdraget är anmält och identiteten stämmer. Instruktionen säger att väskor får kontrolleras vid utpassage, inte vid inpassage.',
    'Vad gör du?',
    'A tradesperson arrives at a gate with a large tool bag. The job is notified and their identity checks out. The instruction says bags may be checked on the way out, not on the way in.',
    'What do you do?',
    '[{"en": "Admit them per the notification and mention that a bag check may happen on the way out.", "err": "", "rat_sv": "Följer instruktionen och informerar i förväg, vilket gör utpassagekontrollen friktionsfri.", "pref": true, "k": "a", "sv": "Släpp in enligt anmälan och nämn att väskkontroll kan ske vid utpassage.", "score": 3}, {"en": "Admit them without mentioning the exit check.", "err": "weak_communication", "rat_sv": "Följer instruktionen men överraskar personen vid utpassage.", "pref": false, "k": "b", "sv": "Släpp in utan att nämna något om utpassagekontroll.", "score": 1}, {"en": "Check the bag before admitting the person.", "err": "outside_mandate", "rat_sv": "Kontroll vid inpassage saknar stöd i instruktionen.", "pref": false, "k": "c", "sv": "Kontrollera väskan innan personen släpps in.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 4, 'sg-ac-04', b_mandate, c_mandate,
    'sjt_best_response','advanced','judgement','mandate_and_escalation','mandate', true, true,
    'Hanterar en behörighet som formellt gäller men praktiskt ser fel ut.',
    'Datacenter, entreprenörskort utanför arbetstid.',
    'Ett svar om undantagshantering i ett scenario säger inget om personens allmänna regeltolkning.',
    'Ett entreprenörskort ger tillträde till en teknikzon dygnet runt. Personen kommer klockan 03:20, vilket är första gången någon använder kortet nattetid. Kortet är giltigt och personen är lugn och samarbetsvillig.',
    'Vad gör du?',
    'A contractor badge grants access to a technical zone around the clock. The person arrives at 03:20, the first time anybody has used the badge at night. The badge is valid and the person is calm and cooperative.',
    'What do you do?',
    '[{"en": "Admit per the authorisation, verify the job with duty operations, and record the time and purpose.", "err": "", "rat_sv": "Behörigheten gäller, men det avvikande mönstret verifieras och dokumenteras.", "pref": true, "k": "a", "sv": "Släpp in enligt behörighet, verifiera uppdraget mot driftjour och notera tid och ärende.", "score": 3}, {"en": "Admit them since the badge explicitly applies around the clock.", "err": "excessive_informal_trust", "rat_sv": "Giltigt kort utan verifiering låter ett avvikande mönster passera oregistrerat.", "pref": false, "k": "b", "sv": "Släpp in eftersom kortet uttryckligen gäller dygnet runt.", "score": 1}, {"en": "Refuse access until the office opens and somebody can confirm.", "err": "outside_mandate", "rat_sv": "Att neka en giltig behörighet utan grund är att skapa en egen regel.", "pref": false, "k": "c", "sv": "Neka tillträde tills kontoret öppnar och någon kan bekräfta.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 5, 'sg-ac-05', b_comm, c_comm,
    'sjt_best_response','intermediate','judgement','operational_communication','judgement', false, false,
    'Ger ett avslag så att personen förstår vad som krävs härnäst.',
    'Reception, besökare utan bokning.',
    'Ett svar om formulering i ett scenario säger inget om personens servicekänsla som egenskap.',
    'En besökare har åkt långt för ett möte som inte finns i systemet. Personen är trött men vänlig och frågar vad hen ska göra.',
    'Vad säger du?',
    'A visitor has travelled a long way for a meeting that is not in the system. They are tired but friendly and ask what they should do.',
    'What do you say?',
    '[{"en": "That the meeting is not registered, whom you can call on their behalf, and where they can wait meanwhile.", "err": "", "rat_sv": "Ett avslag med en konkret väg framåt är både korrekt och användbart.", "pref": true, "k": "a", "sv": "Att mötet inte finns registrerat, vem du kan ringa åt personen, och var hen kan vänta under tiden.", "score": 3}, {"en": "That you unfortunately cannot admit anybody without a booking.", "err": "weak_communication", "rat_sv": "Sant men lämnar personen utan nästa steg.", "pref": false, "k": "b", "sv": "Att du tyvärr inte kan släppa in någon utan bokning.", "score": 1}, {"en": "That they can go up and ask directly on the floor.", "err": "excessive_informal_trust", "rat_sv": "Löser obehaget men kringgår kontrollen.", "pref": false, "k": "c", "sv": "Att hen kan gå upp och fråga direkt på våningen.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 6, 'sg-ac-06', b_sit, c_sit,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', false, false,
    'Uppmärksammar att ett behörighetsunderlag inte hänger ihop.',
    'Logistikterminal, chaufförsidentitet.',
    'Att upptäcka en avvikelse i ett scenario säger inget om personens allmänna uppmärksamhet.',
    'En chaufför visar legitimation och transportorder. Namnet på ordern stämmer med legitimationen, men företagsnamnet på ordern skiljer sig från det på lastbilens dörr.',
    'Vad gör du?',
    'A driver shows identification and a transport order. The name on the order matches the ID, but the company name on the order differs from the one on the lorry door.',
    'What do you do?',
    '[{"en": "Ask about the company name, record both details, and check with whoever ordered the transport.", "err": "", "rat_sv": "Frågar om just det som inte stämmer och verifierar mot beställaren.", "pref": true, "k": "a", "sv": "Fråga om företagsnamnet, notera båda uppgifterna och stäm av med den som beställt transporten.", "score": 3}, {"en": "Admit them since the name and ID match each other.", "err": "excessive_informal_trust", "rat_sv": "Underleverantörer är vanliga, men avvikelsen förblir okontrollerad.", "pref": false, "k": "b", "sv": "Släpp in eftersom namn och legitimation stämmer överens.", "score": 1}, {"en": "Refuse entry because the details do not match.", "err": "premature_escalation", "rat_sv": "Avvisning innan en enkel fråga ställts är oproportionerligt.", "pref": false, "k": "c", "sv": "Neka inpassage eftersom uppgifterna inte stämmer.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 7, 'sg-ac-07', b_deesc, c_deesc,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Håller ett avslag när personen blir upprörd av ett rimligt skäl.',
    'Kontorshus, förälder och sjukt barn.',
    'Ett svar i ett scenario säger inget om personens medkänsla som egenskap.',
    'En förälder vill snabbt upp till en anställd för att lämna en nyckel, eftersom barnet är sjukt och hen har bråttom. Personen finns inte i besökslistan. Den anställde svarar inte i telefon.',
    'Vad gör du?',
    'A parent wants to go up quickly to an employee to hand over a key, because their child is ill and they are in a hurry. They are not on the visitor list. The employee is not answering the phone.',
    'What do you do?',
    '[{"en": "Offer to take the key at reception against a receipt and make sure the employee gets it.", "err": "", "rat_sv": "Löser det verkliga behovet – att nyckeln kommer fram – utan att ge upp kontrollen.", "pref": true, "k": "a", "sv": "Erbjud att ta emot nyckeln i receptionen mot kvittens och se till att den anställde får den.", "score": 3}, {"en": "Explain you cannot let anybody up without a booking and ask them to come back later.", "err": "weak_communication", "rat_sv": "Korrekt men löser inte problemet personen faktiskt har.", "pref": false, "k": "b", "sv": "Förklara att du inte kan släppa upp någon utan bokning och be personen återkomma.", "score": 1}, {"en": "Escort the person up since it will only take a minute.", "err": "excessive_informal_trust", "rat_sv": "Brådska är inte behörighet, och undantaget blir nästa gångs regel.", "pref": false, "k": "c", "sv": "Följ med personen upp eftersom det bara tar en minut.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 8, 'sg-ac-08', b_mandate, c_mandate,
    'sjt_best_response','intermediate','judgement','mandate_and_escalation','mandate', false, false,
    'Hanterar ett kort som inte fungerar utan att kringgå systemet.',
    'Personalingång, kort som inte läses.',
    'Ett svar om felhantering i ett scenario säger inget om personens tekniska förmåga.',
    'En medarbetare du sett dagligen i ett halvår får inte sitt kort att fungera. Hen är stressad och sen till ett möte. Kortet ser oskadat ut.',
    'Vad gör du?',
    'An employee you have seen daily for six months cannot get their card to work. They are stressed and late for a meeting. The card looks undamaged.',
    'What do you do?',
    '[{"en": "Verify identity against the staff list, record the entry manually, and report the card fault.", "err": "", "rat_sv": "Släpper in på verifierad grund och ser till att felet faktiskt blir åtgärdat.", "pref": true, "k": "a", "sv": "Verifiera identiteten mot personallistan, registrera passagen manuellt och felanmäl kortet.", "score": 3}, {"en": "Open the door for them since you know them well.", "err": "failure_to_document", "rat_sv": "Rätt person, men passagen registreras inte och felet kvarstår.", "pref": false, "k": "b", "sv": "Öppna dörren åt personen eftersom du känner igen hen väl.", "score": 1}, {"en": "Refuse entry until the card works.", "err": "poor_proportionality", "rat_sv": "Att neka en verifierbar medarbetare är en oproportionerlig tillämpning.", "pref": false, "k": "c", "sv": "Neka passage tills kortet fungerar.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 9, 'sg-ac-09', b_sit, c_sit,
    'sjt_best_response','advanced','prioritisation','prioritisation','judgement', false, false,
    'Prioriterar mellan flöde och kontroll när båda inte går att ha fullt ut.',
    'Evenemang, insläpp med kö.',
    'Prioritering i ett scenario säger inget om personens förmåga att arbeta i högt tempo.',
    'Vid insläpp till ett evenemang växer kön snabbt. Instruktionen är att kontrollera både biljett och väska. Med nuvarande tempo kommer många att missa evenemangets start.',
    'Vad gör du?',
    'At the entrance to an event the queue is growing fast. The instruction is to check both ticket and bag. At the current rate many people will miss the start.',
    'What do you do?',
    '[{"en": "Continue per the instruction and alert the organiser that more checkpoints are needed to keep up.", "err": "", "rat_sv": "Lyfter avvägningen till den som får besluta i stället för att tumma på den själv.", "pref": true, "k": "a", "sv": "Fortsätt enligt instruktion och larma arrangören om att fler kontrollpunkter behövs för att hinna.", "score": 3}, {"en": "Prioritise ticket checks and skip bag checks until the queue shortens.", "err": "poor_proportionality", "rat_sv": "Att välja bort en kontroll är ett beslut som inte är väktarens att fatta ensam.", "pref": false, "k": "b", "sv": "Prioritera biljettkontroll och hoppa över väskkontrollen tills kön minskat.", "score": 1}, {"en": "Speed up and do both checks faster.", "err": "weak_communication", "rat_sv": "Att hålla tempot utan att flagga problemet löser inget och sliter på kontrollen.", "pref": false, "k": "c", "sv": "Öka tempot och gör båda kontrollerna snabbare.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 10, 'sg-ac-10', b_ethic, c_ethic,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Hanterar en förfrågan om uppgifter som ligger utanför uppdraget.',
    'Reception, förfrågan om annan persons närvaro.',
    'Ett svar om uppgiftslämnande i ett scenario säger inget om personens integritet som egenskap.',
    'En person i receptionen frågar om en namngiven medarbetare är på plats i dag. Personen uppger att hen är anhörig och verkar orolig.',
    'Vad gör du?',
    'A person at reception asks whether a named employee is on site today. They say they are a relative and appear worried.',
    'What do you do?',
    '[{"en": "Say you do not disclose who is on site, but offer to pass on a message.", "err": "", "rat_sv": "Lämnar inte ut närvarouppgifter men hjälper personen vidare på ett sätt som inte röjer något.", "pref": true, "k": "a", "sv": "Säg att du inte lämnar ut uppgifter om vem som är på plats, men erbjud att framföra ett meddelande.", "score": 3}, {"en": "Say you are not allowed to answer such questions.", "err": "weak_communication", "rat_sv": "Korrekt men lämnar en orolig person helt utan hjälp.", "pref": false, "k": "b", "sv": "Säg att du inte får svara på sådana frågor.", "score": 1}, {"en": "Confirm whether the employee is on site since it concerns a relative.", "err": "unsupported_assumption", "rat_sv": "Ett påstått släktskap är inte verifierat, och närvaro är en personuppgift.", "pref": false, "k": "c", "sv": "Bekräfta om medarbetaren är på plats eftersom det rör en anhörig.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 11, 'sg-ac-11', b_coop, c_coop,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', false, false,
    'Samordnar tillträdesbeslut med den funktion som äger lokalen.',
    'Fastighet med flera hyresgäster.',
    'Ett svar om samordning i ett scenario säger inget om personens samarbetsförmåga generellt.',
    'En städfirma vill in på ett våningsplan de normalt städar, men hyresgästen har sagt till dig att ingen får släppas in denna vecka. Städfirman visar sitt vanliga schema.',
    'Vad gör du?',
    'A cleaning company wants access to a floor they normally clean, but the tenant told you nobody may be admitted this week. The cleaners show their usual schedule.',
    'What do you do?',
    '[{"en": "Hold to the tenant instruction, explain why, and contact the tenant to confirm or lift it.", "err": "", "rat_sv": "Hyresgästens senaste besked gäller, och det verifieras hos den som gav det.", "pref": true, "k": "a", "sv": "Håll kvar hyresgästens besked, förklara varför, och kontakta hyresgästen för att bekräfta eller häva det.", "score": 3}, {"en": "Refuse access and refer to the tenant instruction.", "err": "weak_communication", "rat_sv": "Rätt beslut men utan kontakt fastnar städfirman utan besked.", "pref": false, "k": "b", "sv": "Neka tillträde och hänvisa till hyresgästens instruktion.", "score": 1}, {"en": "Admit them since the schedule shows they are due to clean today.", "err": "excessive_informal_trust", "rat_sv": "Ett gammalt schema väger inte tyngre än ett aktuellt besked.", "pref": false, "k": "c", "sv": "Släpp in eftersom schemat visar att de ska städa i dag.", "score": 0}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 12, 'sg-ac-12', b_press, c_press,
    'sjt_best_response','advanced','judgement','prioritisation','judgement', true, true,
    'Väger tillträdeskontroll mot en akut situation.',
    'Kontorshus, larm och samtidig leverans.',
    'Ett val under press i ett scenario säger inget om personens stresstålighet.',
    'Brandlarmet går. Samtidigt står en leverantör vid lastintaget och vill in med en tidskänslig leverans. Du är ensam i receptionen och utrymning har påbörjats.',
    'Vad gör du?',
    'The fire alarm goes off. At the same time a supplier is at the goods entrance wanting to bring in a time-sensitive delivery. You are alone in reception and evacuation has begun.',
    'What do you do?',
    '[{"en": "Turn the delivery away for now, keep the goods entrance closed, and go to your evacuation duty.", "err": "", "rat_sv": "Utrymning går före allt annat, och leverantören hanteras genom att hållas utanför.", "pref": true, "k": "a", "sv": "Avvisa leveransen tills vidare, håll lastintaget stängt och gå till din uppgift i utrymningen.", "score": 3}, {"en": "Explain to the supplier why it is not possible and rebook the delivery.", "err": "poor_proportionality", "rat_sv": "Att lägga tid på leverantören under en utrymning är fel prioritering.", "pref": false, "k": "b", "sv": "Förklara för leverantören varför det inte går och boka om leveransen.", "score": 1}, {"en": "Admit the delivery quickly so the goods entrance can be closed again.", "err": "outside_mandate", "rat_sv": "Att öppna en ytterligare väg in under utrymning är direkt farligt.", "pref": false, "k": "c", "sv": "Släpp in leveransen snabbt så att lastintaget kan stängas igen.", "score": 0}]'::jsonb);

  RAISE NOTICE 'Tillträde, behörighet & access control — 12 items authored';
END $$;

DROP FUNCTION IF EXISTS pg_temp.author_item(uuid,int,text,uuid,uuid,text,text,text,text,text,boolean,boolean,text,text,text,text,text,text,text,jsonb);
