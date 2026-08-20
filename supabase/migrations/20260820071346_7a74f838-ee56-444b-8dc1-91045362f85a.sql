-- #51 Batch 1 — Situationsmedvetenhet & observation.
--
-- A real employer assessment, authored against the existing governed spine. No
-- new architecture: an assessment definition, one version, one form, twelve
-- scenario items, and the five content-review gates every item carries.
--
-- ── WHAT THIS MEASURES, AND WHAT IT DOES NOT ────────────────────────────
--
-- It measures observable judgement: whether somebody separates what they can
-- see from what they infer, notices when a normal picture has changed, and
-- decides what to do about it within their mandate.
--
-- It does not measure personality, honesty as a trait, emotional stability,
-- motivation, physical ability or future job performance, and it confers no
-- legal authority. Those boundaries are recorded on the programme version as
-- does_not_measure and are shown to the employer in the library.
--
-- ── GOVERNANCE HONESTY ──────────────────────────────────────────────────
--
-- Every item is content_status = 'draft', validation_status = 'design', with
-- all five review gates OUTSTANDING and authored_by_ai = true. This content was
-- written by an AI assistant against the product's own construct rules. It is
-- NOT expert-validated, and nothing here claims it is.
--
-- It is nevertheless testable today, because scp_test_grants + closed_test is
-- the mechanism this platform already has for running unvalidated content in a
-- named organisation. Draft does not mean untestable; it means unvalidated, and
-- every attempt run under the grant is stamped governance_mode = closed_test.
--
-- ── SCENARIO SOURCING ───────────────────────────────────────────────────
--
-- Contexts are ordinary Swedish guarding work: reception, industrial sites,
-- logistics terminals, retail, office buildings, perimeter patrol. No item
-- turns on remembering a statute, and no item invents a legal power. Where a
-- rule matters it is stated in the scenario, which is why every item is
-- primary_construct = 'situational_judgement' and tests_what = 'judgement'
-- rather than 'legal_knowledge'.
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
  b_sit uuid; b_rep uuid; b_mandate uuid; b_press uuid; b_comm uuid;
  c_sit uuid; c_rep uuid; c_mandate uuid; c_press uuid; c_comm uuid;
BEGIN
  SELECT id INTO _jur  FROM public.scp_jurisdictions WHERE code = 'SE';
  SELECT id INTO _fam  FROM public.scp_assessment_families WHERE product_type='development_programme' LIMIT 1;
  SELECT id INTO _role FROM public.scp_roles LIMIT 1;

  -- Behaviour + competency pairs, resolved rather than hard-coded so this
  -- migration cannot silently attach evidence to the wrong node of the graph.
  SELECT bv.id, cv.competency_id INTO b_sit, c_sit
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE cv.name_sv='Situationsmedvetenhet' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_rep, c_rep
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Rapporterar det som observerats%' LIMIT 1;
  SELECT bv.id, cv.competency_id INTO b_comm, c_comm
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Förmedlar tydlig%' LIMIT 1;
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

  IF b_sit IS NULL OR b_rep IS NULL OR b_mandate IS NULL OR b_press IS NULL OR b_comm IS NULL THEN
    RAISE EXCEPTION 'SCP_SA_GRAPH_MISSING: the competency graph does not carry the behaviours this assessment maps to';
  END IF;

  -- ── The programme version carries purpose and boundaries ──────────────
  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-situational-awareness', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES
      (_prog, 1, _jur, 'draft', 'design',
       'Situationsmedvetenhet & observation', 'Situational awareness & observation',
       'Ger underlag om hur en person uppfattar vad som faktiskt händer i en miljö, skiljer iakttagelse från antagande och avgör vad som behöver föras vidare. Resultatet är utvecklingsinriktat underlag, aldrig ett urvalsbeslut.',
       'Provides evidence about how a person perceives what is actually happening in an environment, separates observation from assumption, and decides what needs to be passed on. The result is developmental evidence, never a selection decision.',
       ARRAY['Personlighet','Ärlighet som personlighetsdrag','Emotionell stabilitet','Motivation','Framtida arbetsprestation','Fysisk förmåga','Formell auktorisation','Laglig behörighet'],
       ARRAY['Personality','Honesty as a personality trait','Emotional stability','Motivation','Future job performance','Physical ability','Formal authorisation','Legal authority'])
    RETURNING id INTO _pver;
  END IF;

  -- ── Assessment identity ───────────────────────────────────────────────
  -- purpose must agree with the family's product_type (scp_guard_family_
  -- product_separation), and the Academy family is 'development_programme'.
  -- profession_id stays NULL, matching sg-operational-baseline: this is a
  -- competence assessment inside the Academy, not a profession module.
  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture)
  VALUES (_fam, 'sg-situational-awareness',
          'Situationsmedvetenhet & observation', 'Situational awareness & observation',
          'development_programme', false)
  ON CONFLICT (slug) DO UPDATE SET name_sv=EXCLUDED.name_sv RETURNING id INTO _def;

  SELECT id INTO _ver FROM public.scp_assessment_versions WHERE definition_id=_def AND version_number=1;
  IF _ver IS NULL THEN
    INSERT INTO public.scp_assessment_versions
      (definition_id, version_number, content_status, validation_status,
       language_scope, program_version_id, notes)
    VALUES (_def, 1, 'draft', 'design', ARRAY['sv-SE','en-GB'], _pver,
            'Batch 1. AI-authored draft against the product construct rules; all five review gates outstanding.')
    RETURNING id INTO _ver;
  END IF;

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-situational-awareness-form-a';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_ver, 'sg-situational-awareness-form-a', 'Situationsmedvetenhet A', 'Situational awareness A', 20, 28, false)
    RETURNING id INTO _form;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id=_form) THEN RETURN; END IF;

  -- 1 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 1, 'sg-sa-01', b_sit, c_sit,
    'sjt_best_response','foundational','recognition','situational_judgement','judgement', false, false,
    'Skiljer det som faktiskt observerats från det som antas om en avvikelse.',
    'Industriområde, nattpass, ordinarie rond.',
    'Ett svar på ett scenario säger något om resonemanget i just den situationen, inte om personens allmänna uppmärksamhet.',
    'Under nattronden på ett industriområde står en skåpbil vid lastkajen. Leveranser sker enligt instruktion mellan 06 och 18. Motorn är igång, förarhytten är tom och inga lastportar är öppna.',
    'Vad noterar du i första hand?',
    'On a night round at an industrial site a van is parked at the loading bay. Deliveries run between 06:00 and 18:00 according to the site instruction. The engine is running, the cab is empty and no loading doors are open.',
    'What do you note first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Registrerar tid, plats och de tre observerbara avvikelserna utan att förklara dem.","sv":"Tidpunkt, registreringsnummer, att motorn går och att ingen förare syns – utan slutsats om varför.","en":"Time, registration number, that the engine is running and that no driver is visible – with no conclusion about why."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Noterar bara fordonet och tappar det som gör bilden avvikande.","sv":"Att det står en skåpbil vid lastkajen.","en":"That a van is parked at the loading bay."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Skriver in ett motiv som inte går att observera.","sv":"Att någon förbereder en stöld och har lämnat bilen redo för avfärd.","en":"That somebody is preparing a theft and has left the vehicle ready to leave."}]'::jsonb);

  -- 2 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 2, 'sg-sa-02', b_sit, c_sit,
    'sjt_best_response','intermediate','judgement','situational_judgement','judgement', false, false,
    'Uppmärksammar att en normalbild har förändrats över tid.',
    'Receptionen i ett kontorshus med passerkontroll.',
    'Mönsterigenkänning i ett scenario säger inget om personens förmåga att upptäcka mönster generellt.',
    'Du arbetar i receptionen i ett kontorshus. Samma person har passerat genom entréhallen tre gånger under en timme utan att gå fram till disken eller använda passerkort. Personen bär jacka och håller en telefon i handen.',
    'Vad är rimligast att göra först?',
    'You are working at the reception of an office building. The same person has passed through the lobby three times within an hour without approaching the desk or using an access card. They are wearing a jacket and holding a phone.',
    'What is the most reasonable thing to do first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Kontakt först, dokumentation oavsett utfall. Minst ingripande åtgärd som ger information.","sv":"Gå fram, hälsa och fråga om du kan hjälpa till – och notera tid och iakttagelse oavsett vad svaret blir.","en":"Approach, greet them and ask whether you can help – and record the time and observation whatever the answer is."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Fortsatt observation utan kontakt låter mönstret fortsätta utan att någon vet mer.","sv":"Fortsätt observera diskret och avvakta om personen gör något mer.","en":"Keep observing discreetly and wait to see whether they do anything further."},
      {"k":"c","score":0,"pref":false,"err":"premature_escalation","rat_sv":"Avvisning innan man vet något är en oproportionerlig första åtgärd.","sv":"Be personen lämna byggnaden eftersom hen inte har något ärende.","en":"Ask the person to leave the building since they have no business there."}]'::jsonb);

  -- 3 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 3, 'sg-sa-03', b_mandate, c_mandate,
    'sjt_best_response','intermediate','judgement','mandate_and_escalation','mandate', true, true,
    'Håller sig inom mandatet när en säkerhetsfunktion satts ur spel.',
    'Köpcentrum, kvällstid, allmänna utrymmen.',
    'Bedömningen gäller resonemanget i scenariot, inte personens allmänna regelefterlevnad.',
    'I ett köpcentrum står en nödutgång uppställd med en kil. Fyra personer står och röker strax utanför dörren. Enligt instruktion ska nödutgångar hållas stängda men obelastade.',
    'Vad gör du?',
    'In a shopping centre an emergency exit is propped open with a wedge. Four people are standing just outside the door smoking. The site instruction says emergency exits must be kept closed but unobstructed.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Åtgärdar det som ligger i uppdraget, informerar sakligt och dokumenterar avvikelsen.","sv":"Ta bort kilen, förklara varför dörren måste vara stängd och notera avvikelsen och tidpunkten.","en":"Remove the wedge, explain why the door has to stay closed, and record the deviation and the time."},
      {"k":"b","score":1,"pref":false,"err":"failure_to_document","rat_sv":"Rätt fysisk åtgärd, men utan notering försvinner mönstret om det upprepas.","sv":"Ta bort kilen och gå vidare på ronden.","en":"Remove the wedge and continue the round."},
      {"k":"c","score":0,"pref":false,"err":"outside_mandate","rat_sv":"Identitetskontroll av personer i allmänt utrymme ligger utanför uppdraget här.","sv":"Kräva legitimation av dem som står utanför dörren innan kilen tas bort.","en":"Demand identification from the people outside the door before removing the wedge."}]'::jsonb);

  -- 4 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 4, 'sg-sa-04', b_sit, c_sit,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', false, false,
    'Bedömer om en aktivitet är förenlig med den behörighet personen visat.',
    'Datacenter, korridor mellan serverhallar, dagtid.',
    'Ett scenario om fotografering säger inget om personens tekniska säkerhetskunnande.',
    'I ett datacenter ser du en person med giltigt entreprenörskort fotografera rackskyltar med sin telefon. Entreprenörskortet ger tillträde till korridoren men uppdraget som anmälts gäller byte av ett kylaggregat.',
    'Hur hanterar du situationen?',
    'In a data centre you see a person with a valid contractor badge photographing rack labels with their phone. The badge grants access to the corridor, but the work that was notified concerns replacing a cooling unit.',
    'How do you handle the situation?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Frågar om det som faktiskt avviker – aktiviteten, inte personen – och för det vidare.","sv":"Fråga vad fotograferingen har med kylaggregatet att göra och stäm av uppdraget med driftansvarig.","en":"Ask what the photography has to do with the cooling unit and check the work order with the operations lead."},
      {"k":"b","score":1,"pref":false,"err":"excessive_informal_trust","rat_sv":"Giltigt kort besvarar tillträde, inte vad personen gör innanför.","sv":"Låta det passera eftersom kortet är giltigt och personen är insläppt.","en":"Let it pass, since the badge is valid and the person has been admitted."},
      {"k":"c","score":0,"pref":false,"err":"premature_escalation","rat_sv":"Beslag av egendom saknar stöd och eskalerar utan att klargöra något.","sv":"Ta telefonen i förvar tills driftansvarig hinner komma.","en":"Take the phone into safekeeping until the operations lead arrives."}]'::jsonb);

  -- 5 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 5, 'sg-sa-05', b_rep, c_rep,
    'sjt_best_response','intermediate','judgement','factual_reporting','judgement', false, false,
    'Rapporterar en avvikelse i en kontrollkedja så att nästa led kan agera.',
    'Logistikterminal, ankommande gods.',
    'Ett svar om plombering säger inget om personens noggrannhet i andra uppgifter.',
    'Vid ankomstkontroll på en logistikterminal ser du att plombnumret på en trailer inte stämmer med numret i fraktsedeln. Chauffören säger att plomben byttes vid en omlastning under natten.',
    'Vad tar du med i din notering?',
    'During arrival checks at a logistics terminal you see that the seal number on a trailer does not match the number on the consignment note. The driver says the seal was replaced during a transfer overnight.',
    'What do you include in your note?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Båda numren, förklaringen som uppgift, och att den inte är verifierad.","sv":"Båda plombnumren, chaufförens förklaring återgiven som uppgift, och att förklaringen inte har kunnat kontrolleras.","en":"Both seal numbers, the driver''s explanation recorded as a statement, and that it has not been possible to verify it."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Avvikelsen noteras men förklaringen försvinner, vilket gör uppföljning svårare.","sv":"Att plombnumret avviker från fraktsedeln.","en":"That the seal number differs from the consignment note."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Skriver in chaufförens uppgift som konstaterat faktum.","sv":"Att plomben byttes vid en omlastning under natten.","en":"That the seal was replaced during a transfer overnight."}]'::jsonb);

  -- 6 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 6, 'sg-sa-06', b_sit, c_sit,
    'sjt_best_response','advanced','prioritisation','prioritisation','judgement', false, false,
    'Prioriterar mellan flera samtidiga iakttagelser utifrån vad som kan förändras snabbast.',
    'Kontorshus, ronderande väktare, sen eftermiddag.',
    'Prioritering i ett scenario säger inget om personens förmåga att prioritera generellt.',
    'Under samma rond noterar du tre saker: en lampa i ett trapphus har varit trasig i tre pass, en brandcellsdörr står uppställd med en papperskorg, och en okänd person står och väntar utanför personalingången.',
    'Vad hanterar du först?',
    'On the same round you note three things: a stairwell light has been broken for three shifts, a fire door is propped open with a waste bin, and an unknown person is waiting outside the staff entrance.',
    'Which do you deal with first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Brandcellsdörren är den avvikelse som kan få omedelbara konsekvenser och åtgärdas snabbast.","sv":"Brandcellsdörren – ta bort papperskorgen och stäng dörren, notera de andra två.","en":"The fire door – remove the bin and close it, and record the other two."},
      {"k":"b","score":1,"pref":false,"err":"poor_proportionality","rat_sv":"Personen vid ingången är oklar men inte akut; dörren är både akut och åtgärdbar.","sv":"Personen vid personalingången – ta reda på ärendet först.","en":"The person at the staff entrance – establish their business first."},
      {"k":"c","score":0,"pref":false,"err":"tunnel_vision","rat_sv":"Belysningen är känd sedan tre pass och är den minst tidskritiska av de tre.","sv":"Trapphusbelysningen – felanmäl den innan du går vidare.","en":"The stairwell light – report the fault before moving on."}]'::jsonb);

  -- 7 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 7, 'sg-sa-07', b_sit, c_sit,
    'sjt_best_response','intermediate','recognition','situational_judgement','judgement', false, false,
    'Uppmärksammar spår av åtkomstförsök som inte lämnat synlig skada.',
    'Perimeterrond vid ett byggarbetsplatsstängsel.',
    'Att upptäcka ett spår i ett scenario säger inget om personens allmänna observationsförmåga.',
    'Under en perimeterrond ser du att en sektion av byggstängslet har klippts upp och sedan lagats provisoriskt med buntband. Inget material verkar saknas på insidan och inga fotspår syns i gruset.',
    'Vad är rimligast att göra?',
    'On a perimeter round you see that a section of the site fence has been cut and then loosely repaired with cable ties. Nothing appears to be missing inside and there are no footprints in the gravel.',
    'What is the most reasonable thing to do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Dokumenterar öppningen som en åtkomstväg oavsett om något saknas, och lyfter den vidare.","sv":"Fotografera och notera sektionen, ange att lagningen inte är original och rapportera till platsansvarig.","en":"Photograph and record the section, note that the repair is not original, and report it to the site manager."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Att invänta faktisk förlust innebär att en känd öppning står kvar.","sv":"Notera det i loggen och kontrollera vid nästa rond om något har hänt.","en":"Record it in the log and check on the next round whether anything has happened."},
      {"k":"c","score":0,"pref":false,"err":"insufficient_information","rat_sv":"Att inget saknas nu är inte grund för att avfärda en öppning i perimetern.","sv":"Bedöma det som en tillfällig lagning som byggarbetarna gjort själva.","en":"Judge it as a temporary repair the construction workers made themselves."}]'::jsonb);

  -- 8 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 8, 'sg-sa-08', b_comm, c_comm,
    'sjt_best_response','intermediate','judgement','operational_communication','judgement', false, false,
    'Riktar information till den funktion som faktiskt kan agera på den.',
    'Kontorshus, larm på brandcellsdörr.',
    'Val av mottagare i ett scenario säger inget om personens kommunikation i stort.',
    'Ett dörrlarm på en brandcellsdörr har tystats av någon du inte vet vem det är. Dörren är nu stängd. Fastighetsjour, driftcentral och din arbetsledare är alla nåbara.',
    'Vem informerar du, och om vad?',
    'A door alarm on a fire door has been silenced by somebody you cannot identify. The door is now closed. Building maintenance, the control room and your supervisor are all reachable.',
    'Whom do you inform, and about what?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Driftcentralen äger larmet; iakttagelsen förs dit och arbetsledaren informeras om avvikelsen.","sv":"Driftcentralen, om att larmet tystats av okänd person och att dörren nu är stängd – och arbetsledaren om avvikelsen.","en":"The control room, that the alarm was silenced by an unknown person and that the door is now closed – and the supervisor about the deviation."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Rätt mottagare men informationen är för tunn för att gå att agera på.","sv":"Driftcentralen, om att ett larm har löst ut.","en":"The control room, that an alarm went off."},
      {"k":"c","score":0,"pref":false,"err":"failure_to_document","rat_sv":"Ingen information alls innebär att ingen kan följa upp vem som tystade larmet.","sv":"Ingen – dörren är stängd och situationen är åtgärdad.","en":"Nobody – the door is closed and the situation is resolved."}]'::jsonb);

  -- 9 ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 9, 'sg-sa-09', b_sit, c_sit,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', false, false,
    'Skiljer mellan avvikande beteende och beteende som bara är ovanligt.',
    'Entréhall på ett sjukhus, dagtid.',
    'En bedömning av en enskild person i ett scenario säger inget om personens omdöme om människor generellt.',
    'I sjukhusets entréhall har en person suttit i samma fåtölj i drygt fyra timmar. Personen är lugn, stör ingen och har en ryggsäck bredvid sig. Vårdpersonalen har inte reagerat.',
    'Hur bedömer du situationen?',
    'In the hospital entrance hall a person has been sitting in the same armchair for over four hours. They are calm, disturbing nobody, and have a rucksack beside them. Clinical staff have not reacted.',
    'How do you assess the situation?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Behandlar det som ovanligt men inte i sig avvikande, och söker information på minst ingripande sätt.","sv":"Ovanligt men inte i sig ett säkerhetsproblem – gå fram, fråga om personen väntar på någon och notera iakttagelsen.","en":"Unusual but not in itself a security problem – approach, ask whether they are waiting for somebody, and record the observation."},
      {"k":"b","score":1,"pref":false,"err":"delayed_escalation","rat_sv":"Passiv observation ger ingen ny information och löser inte osäkerheten.","sv":"Fortsätt hålla uppsikt på avstånd resten av passet.","en":"Continue watching from a distance for the rest of the shift."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Ryggsäck och väntetid är inte grund för att anta ett hot.","sv":"Behandla ryggsäcken som ett möjligt hot och begära utrymning av entréhallen.","en":"Treat the rucksack as a possible threat and request evacuation of the entrance hall."}]'::jsonb);

  -- 10 ────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 10, 'sg-sa-10', b_mandate, c_mandate,
    'sjt_best_response','advanced','judgement','mandate_and_escalation','mandate', true, true,
    'Känner igen ett socialt försök att kringgå rutin och håller kvar rutinen.',
    'Reception i ett kontorshus med besöksrutin.',
    'Ett svar på ett kringgåendeförsök säger inget om personens allmänna påverkbarhet.',
    'En person i budfirmas kläder kommer till receptionen och frågar efter en namngiven medarbetare på en namngiven avdelning. Personen har inget paket att lämna och säger att hen ska hämta en retur som medarbetaren vet om.',
    'Vad gör du?',
    'A person in courier clothing comes to reception and asks for a named employee in a named department. They have no parcel to hand over and say they are collecting a return that the employee knows about.',
    'What do you do?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Håller kvar besöksrutinen och verifierar mot medarbetaren innan tillträde.","sv":"Följ besöksrutinen: ring medarbetaren och bekräfta returen innan någon släpps in.","en":"Follow the visitor routine: call the employee and confirm the return before anybody is admitted."},
      {"k":"b","score":1,"pref":false,"err":"weak_communication","rat_sv":"Rätt instinkt men lämnar personen utan besked och löser inte ärendet.","sv":"Be personen vänta utanför och säga att du inte kan hjälpa till.","en":"Ask the person to wait outside and say you cannot help."},
      {"k":"c","score":0,"pref":false,"err":"excessive_informal_trust","rat_sv":"Kännedom om namn och avdelning är just det ett kringgåendeförsök bygger på.","sv":"Släpp in personen eftersom hen känner till både namn och avdelning.","en":"Admit the person, since they know both the name and the department."}]'::jsonb);

  -- 11 ────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 11, 'sg-sa-11', b_press, c_press,
    'sjt_best_response','advanced','prioritisation','prioritisation','judgement', true, true,
    'Väljer minst ingripande åtgärd när informationen är ofullständig.',
    'Handelsområde, parkering, kvällstid.',
    'Ett val under tidspress i ett scenario säger inget om personens stresstålighet.',
    'På en parkering hör du glas krossas. När du kommer runt hörnet ser du en person stå vid en bil med krossad sidoruta. Personen håller en väska och ser upp mot dig. Ingen annan är i närheten.',
    'Vad gör du först?',
    'In a car park you hear glass break. Coming round the corner you see a person standing beside a car with a smashed side window. They are holding a bag and looking up at you. Nobody else is nearby.',
    'What do you do first?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Skapar avstånd, larmar och säkrar signalement – utan att låsa fast en tolkning.","sv":"Håll avstånd, larma enligt instruktion och notera signalement, tid och riktning om personen avlägsnar sig.","en":"Keep your distance, raise the alarm per instruction, and record description, time and direction if the person leaves."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Tilltal utan avstånd och utan larm ger sämre utgångsläge om situationen ändras.","sv":"Gå fram och fråga personen vad som har hänt med rutan.","en":"Walk up and ask the person what happened to the window."},
      {"k":"c","score":0,"pref":false,"err":"outside_mandate","rat_sv":"Fysiskt ingripande här saknar stöd och ökar risken för alla inblandade.","sv":"Hindra personen fysiskt från att lämna platsen tills polis kommer.","en":"Physically prevent the person from leaving the scene until the police arrive."}]'::jsonb);

  -- 12 ────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.author_item(_form, 12, 'sg-sa-12', b_rep, c_rep,
    'sjt_best_response','intermediate','synthesis','factual_reporting','judgement', false, false,
    'Sammanfattar upprepade iakttagelser till ett mönster som går att agera på.',
    'Butiksmiljö, återkommande svinn.',
    'Att beskriva ett mönster i ett scenario säger inget om personens analytiska förmåga i stort.',
    'I en butik har svinnrapporterna under tre veckor gällt samma varugrupp. Du har vid fyra tillfällen noterat att kameraövervakningen har en skymd vinkel just där, på grund av en säsongsskylt.',
    'Hur formulerar du detta vidare?',
    'In a shop, shrinkage reports over three weeks have all concerned the same product group. On four occasions you have noted that camera coverage has a blind angle at exactly that spot, because of a seasonal sign.',
    'How do you put this forward?',
    '[{"k":"a","score":3,"pref":true,"err":"","rat_sv":"Kopplar samman de två iakttagelserna som ett mönster och föreslår en åtgärdbar orsak.","sv":"Som ett mönster: samma varugrupp, samma skymda vinkel, fyra noteringar – och att skylten går att flytta.","en":"As a pattern: same product group, same blind angle, four observations – and that the sign can be moved."},
      {"k":"b","score":1,"pref":false,"err":"insufficient_information","rat_sv":"Rapporterar svinnet men inte det som förklarar var det kan ske obemärkt.","sv":"Som en påminnelse om att svinnet i den varugruppen fortsätter.","en":"As a reminder that shrinkage in that product group is continuing."},
      {"k":"c","score":0,"pref":false,"err":"unsupported_assumption","rat_sv":"Pekar ut en gärningsman utan underlag i det som observerats.","sv":"Som en slutsats om att personal i den avdelningen är inblandad.","en":"As a conclusion that staff in that department are involved."}]'::jsonb);

  RAISE NOTICE 'Batch 1: Situationsmedvetenhet & observation — 12 items authored';
END $$;

DROP FUNCTION IF EXISTS pg_temp.author_item(uuid,int,text,uuid,uuid,text,text,text,text,text,boolean,boolean,text,text,text,text,text,text,text,jsonb);