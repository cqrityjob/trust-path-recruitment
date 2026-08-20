-- #51 Batch 3 — Rapportering & dokumentation.
--
-- Eleven items about writing something another person can act on: separating
-- observation from inference, keeping a chronology straight, including the
-- detail that changes what happens next, and deciding when documentation is
-- itself the escalation.
--
-- ── ELEVEN, NOT TWELVE ──────────────────────────────────────────────────
--
-- The ordered range was 10-12. Eleven is where the content stopped being
-- distinct: a twelfth item would have restated the observation-versus-inference
-- boundary that items 1, 4 and 9 already cover from different angles, and a
-- near-duplicate item adds response burden without adding evidence.
--
-- ── THREE CONSTRUCTED RESPONSES ─────────────────────────────────────────
--
-- Items 4, 8 and 11 are constructed_response and carry
-- requires_human_review = true. Reporting quality is the one construct in this
-- library where a multiple-choice answer genuinely cannot stand in for the
-- skill: choosing the best-written note is recognition, whereas writing one is
-- the behaviour the employer actually cares about.
--
-- They therefore have no options and no deterministic score. They route to the
-- existing human review workflow, and the reviewer scores them against the
-- governed rubric -- which is why this assessment reports
-- requires_human_review = true in the library, and why an employer sees
-- "Mänsklig granskning krävs" before assigning it.
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
  b_ethic uuid; c_ethic uuid;
  b_mandate uuid; c_mandate uuid;
  b_rep uuid; c_rep uuid;
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
  SELECT bv.id, cv.competency_id INTO b_rep, c_rep
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id=bv.id
    JOIN public.scp_competency_versions cv ON cv.id=m.competency_version_id
   WHERE bv.statement_sv LIKE 'Rapporterar det som observerats%' LIMIT 1;

  IF b_comm IS NULL OR b_ethic IS NULL OR b_mandate IS NULL OR b_rep IS NULL THEN
    RAISE EXCEPTION 'SCP_CONTENT_GRAPH_MISSING: the competency graph does not carry the behaviours sg-reporting-documentation maps to';
  END IF;

  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-reporting-documentation', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Rapportering & dokumentation', 'Reporting & documentation', 'Ger underlag om hur en person dokumenterar det som hänt så att någon annan kan agera på det: iakttagelse skild från tolkning, korrekt kronologi, och rätt detaljer till rätt mottagare. Resultatet är utvecklingsinriktat underlag, aldrig ett urvalsbeslut.', 'Provides evidence about how a person documents what happened so somebody else can act on it: observation separated from interpretation, correct chronology, and the right detail to the right recipient. The result is developmental evidence, never a selection decision.',
       ARRAY['Personlighet','Ärlighet som personlighetsdrag','Emotionell stabilitet','Motivation','Framtida arbetsprestation','Fysisk förmåga','Formell auktorisation','Laglig behörighet'],
       ARRAY['Personality','Honesty as a personality trait','Emotional stability','Motivation','Future job performance','Physical ability','Formal authorisation','Legal authority'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture)
  VALUES (_fam, 'sg-reporting-documentation', 'Rapportering & dokumentation', 'Reporting & documentation', 'development_programme', false)
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

  SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-reporting-documentation-form-a';
  IF _form IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_ver, 'sg-reporting-documentation-form-a', 'Rapportering A', 'Reporting A', 22, 32, false)
    RETURNING id INTO _form;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id=_form) THEN RETURN; END IF;

  PERFORM pg_temp.author_item(_form, 1, 'sg-rd-01', b_rep, c_rep,
    'sjt_best_response','foundational','recognition','factual_reporting','judgement', false, false,
    'Skiljer iakttagelse från tolkning i en enskild notering.',
    'Kontorshus, nattrond.',
    'Ett svar om formulering i ett scenario säger inget om personens skriftliga förmåga generellt.',
    'Under nattronden hittar du en ytterdörr olåst. Ingen person syns, inget verkar flyttat, och larmet har inte löst ut.',
    'Vilken notering är mest användbar?',
    'On a night round you find an exterior door unlocked. No person is visible, nothing appears moved, and the alarm has not triggered.',
    'Which note is most useful?',
    '[{"score": 3, "en": "\"02:14, exterior door to the loading yard unlocked. No persons visible, alarm not triggered. Door locked by me, duty maintenance informed.\"", "rat_sv": "Tid, plats, iakttagelse, åtgärd – och det som INTE observerades, vilket är lika användbart.", "err": "", "k": "a", "pref": true, "sv": "\"02:14, ytterdörr mot lastgården olåst. Inga personer syns, larm ej utlöst. Dörren låst av mig, driftjour underrättad.\""}, {"score": 1, "en": "\"Exterior door was unlocked during the night.\"", "rat_sv": "Utan tid och åtgärd går noteringen inte att följa upp.", "err": "insufficient_information", "k": "b", "pref": false, "sv": "\"Ytterdörr stod olåst under natten.\""}, {"score": 0, "en": "\"Somebody forgot to lock up after the last delivery.\"", "rat_sv": "Skriver in en orsak som inte går att observera.", "err": "unsupported_assumption", "k": "c", "pref": false, "sv": "\"Någon har glömt låsa efter sista leveransen.\""}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 2, 'sg-rd-02', b_comm, c_comm,
    'sjt_best_response','intermediate','judgement','operational_communication','judgement', false, false,
    'Avgör vilken detalj som faktiskt förändrar nästa persons handling.',
    'Skiftöverlämning efter en pågående händelse.',
    'Ett urval av detaljer i ett scenario säger inget om personens omdöme i stort.',
    'Du lämnar över efter ett pass där en person avvisats från fastigheten två gånger under kvällen. Personen kom tillbaka andra gången med en annan jacka.',
    'Vilken detalj är viktigast att föra vidare?',
    'You are handing over after a shift in which a person was removed from the property twice during the evening. They came back the second time wearing a different jacket.',
    'Which detail matters most to pass on?',
    '[{"score": 3, "en": "That the person returned in a different jacket, with a description that does not rely on clothing.", "rat_sv": "Byte av ytterplagg mellan besöken är det som gör igenkänning svårare för nästa skift.", "err": "", "k": "a", "pref": true, "sv": "Att personen återkom med bytt jacka, med signalement som inte bygger på kläderna."}, {"score": 1, "en": "That the person was removed twice during the evening.", "rat_sv": "Antalet tillfällen utan signalement gör återkomst svår att upptäcka.", "err": "insufficient_information", "k": "b", "pref": false, "sv": "Att personen avvisats två gånger under kvällen."}, {"score": 0, "en": "That the person is clearly out to provoke the staff.", "rat_sv": "En bedömning av avsikt är inte en iakttagelse.", "err": "unsupported_assumption", "k": "c", "pref": false, "sv": "Att personen tydligt är ute efter att provocera personalen."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 3, 'sg-rd-03', b_rep, c_rep,
    'sjt_best_response','intermediate','judgement','factual_reporting','judgement', false, false,
    'Håller kronologin korrekt när händelser rapporteras i efterhand.',
    'Industriområde, flera iakttagelser samma pass.',
    'Ett svar om ordningsföljd i ett scenario säger inget om personens minne.',
    'Du ska skriva rapport efter passet. Du minns säkert att grinden stod öppen och att du hörde ett larm, men inte säkert vilket som kom först.',
    'Hur skriver du?',
    'You are writing your report after the shift. You clearly remember that the gate was open and that you heard an alarm, but not for certain which came first.',
    'How do you write it?',
    '[{"score": 3, "en": "Describe both observations and state explicitly that their order cannot be established.", "rat_sv": "Redovisar osäkerheten i stället för att gissa en ordning som kan bli avgörande.", "err": "", "k": "a", "pref": true, "sv": "Beskriv båda iakttagelserna och ange uttryckligen att inbördes ordning inte kan fastställas."}, {"score": 1, "en": "Describe only the gate, since that observation is certain.", "rat_sv": "Att utelämna den ena iakttagelsen förlorar information.", "err": "insufficient_information", "k": "b", "pref": false, "sv": "Beskriv bara grinden, eftersom den iakttagelsen är säker."}, {"score": 0, "en": "Write whichever order seems most logical.", "rat_sv": "En gissad kronologi kan styra en utredning åt fel håll.", "err": "unsupported_assumption", "k": "c", "pref": false, "sv": "Skriv den ordning som verkar mest logisk."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 4, 'sg-rd-04', b_rep, c_rep,
    'constructed_response','intermediate','synthesis','factual_reporting','judgement', false, true,
    'Formulerar en notering som skiljer iakttagelse från tolkning.',
    'Reception, avvikelse under dagtid.',
    'En skriven notering i ett scenario bedöms som text, inte som ett omdöme om personen.',
    'Klockan 13:40 ser du en person ställa ifrån sig en obevakad väska innanför entrén och gå ut igen utan väskan. Personen återvänder efter sex minuter och tar med sig väskan.',
    'Skriv den notering du skulle lämna vidare. Ta med det som går att observera och markera tydligt vad som är din tolkning, om du gör någon.',
    'At 13:40 you see a person set down an unattended bag just inside the entrance and walk back out without it. They return after six minutes and take the bag with them.',
    'Write the note you would pass on. Include what can be observed, and mark clearly what is your interpretation, if you make one.',
    '[]'::jsonb);

  PERFORM pg_temp.author_item(_form, 5, 'sg-rd-05', b_mandate, c_mandate,
    'sjt_best_response','advanced','judgement','mandate_and_escalation','mandate', true, true,
    'Avgör när dokumentation i sig är otillräckligt och något måste lyftas.',
    'Bevakningsuppdrag, återkommande avvikelse.',
    'Ett svar om eskalering i ett scenario säger inget om personens allmänna initiativförmåga.',
    'Samma lastport har stått olåst vid fem av dina senaste sex pass. Du har noterat det varje gång. Ingenting har förändrats och ingen har hört av sig.',
    'Vad gör du nu?',
    'The same loading door has been unlocked on five of your last six shifts. You have recorded it every time. Nothing has changed and nobody has been in touch.',
    'What do you do now?',
    '[{"score": 3, "en": "Raise the pattern as a whole with your supervisor, listing the dates of every occurrence, and ask for a decision on action.", "rat_sv": "Fem noteringar utan åtgärd betyder att kanalen inte fungerar; mönstret måste lyftas som mönster.", "err": "", "k": "a", "pref": true, "sv": "Lyft det samlade mönstret till arbetsledaren med datum för samtliga tillfällen, och begär besked om åtgärd."}, {"score": 1, "en": "Carry on recording the deviation each shift as you have been.", "rat_sv": "Mer av samma dokumentation ger inte ett annat utfall.", "err": "delayed_escalation", "k": "b", "pref": false, "sv": "Fortsätt notera avvikelsen vid varje pass som hittills."}, {"score": 0, "en": "Fit your own padlock so the door stays locked.", "rat_sv": "Att själv ändra på låsningen ligger utanför uppdraget och döljer avvikelsen.", "err": "outside_mandate", "k": "c", "pref": false, "sv": "Sätt dit ett eget hänglås så att porten hålls låst."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 6, 'sg-rd-06', b_ethic, c_ethic,
    'sjt_best_response','advanced','judgement','situational_judgement','judgement', true, true,
    'Hanterar känsliga uppgifter i en rapport enligt uppdrag och regelverk.',
    'Rapport som läses av flera funktioner.',
    'Ett svar om vad som ska stå i en rapport säger inget om personens integritet som egenskap.',
    'Du skriver en incidentrapport om en person som blivit akut sjuk i entrén. Du hörde av en kollega vad personens tillstånd sannolikt beror på. Rapporten läses av fastighetsägare, driftbolag och din arbetsledare.',
    'Vad tar du med?',
    'You are writing an incident report about a person who became acutely ill in the entrance. A colleague told you what the condition is probably caused by. The report is read by the property owner, the operating company and your supervisor.',
    'What do you include?',
    '[{"score": 3, "en": "Time, place, what you observed, what action was taken and that an ambulance was called – with no information about the health condition.", "rat_sv": "Det som krävs för att förstå händelsen och åtgärden; hälsouppgifter hör inte hit.", "err": "", "k": "a", "pref": true, "sv": "Tid, plats, vad du observerade, vilka åtgärder som vidtogs och att ambulans tillkallades – utan uppgifter om hälsotillstånd."}, {"score": 1, "en": "Only that a person became ill and that an ambulance arrived.", "rat_sv": "Utan åtgärderna går händelsen inte att följa upp.", "err": "insufficient_information", "k": "b", "pref": false, "sv": "Endast att en person blev sjuk och att ambulans kom."}, {"score": 0, "en": "What the colleague said about the probable cause, so recipients get the full picture.", "rat_sv": "Andrahandsuppgifter om hälsa i en bred distributionslista är både osäkra och känsliga.", "err": "unsupported_assumption", "k": "c", "pref": false, "sv": "Det kollegan sa om den sannolika orsaken, så att mottagarna får hela bilden."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 7, 'sg-rd-07', b_comm, c_comm,
    'sjt_best_response','intermediate','judgement','operational_communication','judgement', false, false,
    'Anpassar detaljnivån till vad mottagaren behöver för att agera.',
    'Akut lägesrapport till driftcentral.',
    'Ett svar om detaljnivå i ett scenario säger inget om personens kommunikation generellt.',
    'Du ringer driftcentralen mitt under en pågående vattenläcka i ett serverrum. De behöver veta vad de ska göra härnäst.',
    'Hur inleder du?',
    'You call the control room in the middle of an ongoing water leak in a server room. They need to know what to do next.',
    'How do you open?',
    '[{"score": 3, "en": "Water leak in the server room on level 2, ongoing now, main valve not accessible to me, no injuries.", "rat_sv": "Läge, plats, vad som redan gjorts – i den ordning mottagaren behöver för att besluta.", "err": "", "k": "a", "pref": true, "sv": "Vattenläcka i serverrum plan 2, pågår nu, huvudkran ej åtkomlig för mig, ingen personskada."}, {"score": 1, "en": "There is a water leak here, you need to send somebody.", "rat_sv": "Korrekt men utan det som avgör vad de ska göra härnäst.", "err": "weak_communication", "k": "b", "pref": false, "sv": "Det är en vattenläcka här, ni behöver skicka någon."}, {"score": 0, "en": "An account of how you discovered the leak and what you were doing beforehand.", "rat_sv": "Bakgrund först fördröjer det akuta beslutet.", "err": "insufficient_information", "k": "c", "pref": false, "sv": "En redogörelse för hur du upptäckte läckan och vad du gjorde dessförinnan."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 8, 'sg-rd-08', b_comm, c_comm,
    'constructed_response','advanced','synthesis','operational_communication','judgement', false, true,
    'Skriver en överlämning som en annan person kan arbeta vidare från.',
    'Skiftbyte med olöst ärende.',
    'En skriven överlämning bedöms som text, inte som ett omdöme om personen.',
    'Under ditt pass har en hiss stannat mellan våningarna med två personer i. Räddningstjänst är på väg. Hissjouren har fått felanmälan men inte återkommit. Ditt pass tar slut om fem minuter.',
    'Skriv den överlämning du lämnar till nästa väktare. Ta med nuläge, vad som redan gjorts och vad som återstår.',
    'During your shift a lift has stopped between floors with two people inside. The fire service is on the way. The lift maintenance line has received the fault report but has not called back. Your shift ends in five minutes.',
    'Write the handover you would give the next guard. Include the current status, what has already been done, and what remains.',
    '[]'::jsonb);

  PERFORM pg_temp.author_item(_form, 9, 'sg-rd-09', b_rep, c_rep,
    'sjt_best_response','advanced','judgement','factual_reporting','judgement', false, false,
    'Rapporterar det egna agerandet lika sakligt som andras.',
    'Rapport efter eget misstag.',
    'Ett svar om självrapportering i ett scenario säger inget om personens ärlighet som egenskap.',
    'Du upptäcker att du under ronden missade att kontrollera en av två lastportar. Vid nästa pass visar det sig att den porten stått olåst.',
    'Hur hanterar du det i rapporten?',
    'You realise that during your round you missed checking one of two loading doors. On the next shift it turns out that door had been left unlocked.',
    'How do you handle it in the report?',
    '[{"score": 3, "en": "Record that the door was not checked during your shift, so the window during which it was unlocked is stated correctly.", "rat_sv": "Redovisar den egna luckan som en observerbar omständighet, eftersom den påverkar tolkningen.", "err": "", "k": "a", "pref": true, "sv": "Notera att porten inte kontrollerades under ditt pass, så att tidsfönstret för när den stod olåst blir korrekt."}, {"score": 1, "en": "Report only that the door was unlocked on the next shift.", "rat_sv": "Utan uppgiften blir tidslinjen felaktig för alla som läser den.", "err": "insufficient_information", "k": "b", "pref": false, "sv": "Rapportera bara att porten stod olåst vid nästa pass."}, {"score": 0, "en": "Record the round as complete since the other checks were carried out.", "rat_sv": "Att skriva en kontroll som inte gjorts är en felaktig uppgift i underlaget.", "err": "unsupported_assumption", "k": "c", "pref": false, "sv": "Notera ronden som fullständig eftersom övriga kontroller genomfördes."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 10, 'sg-rd-10', b_rep, c_rep,
    'sjt_best_response','intermediate','judgement','factual_reporting','judgement', false, false,
    'Skiljer på vad som setts och vad som återberättats av andra.',
    'Rapport som bygger delvis på andrahandsuppgifter.',
    'Ett svar om källhantering i ett scenario säger inget om personens noggrannhet i stort.',
    'En butiksanställd berättar att hon sett en person ta varor och gå ut. Du såg själv bara personen lämna butiken snabbt. Du skriver rapporten.',
    'Hur formulerar du?',
    'A shop employee tells you she saw a person take goods and walk out. You yourself only saw the person leave the shop quickly. You are writing the report.',
    'How do you word it?',
    '[{"score": 3, "en": "That shop employee NN states she saw goods being taken, and that you yourself observed the person leaving the shop at speed.", "rat_sv": "Två källor, tydligt åtskilda, med namngiven uppgiftslämnare.", "err": "", "k": "a", "pref": true, "sv": "Att butiksanställd NN uppger att hon sett varor tas, och att du själv observerat att personen lämnade butiken i hög takt."}, {"score": 1, "en": "Only that you saw a person leave the shop quickly.", "rat_sv": "Utelämnar den enda direkta iakttagelsen av varorna.", "err": "insufficient_information", "k": "b", "pref": false, "sv": "Endast att du såg en person lämna butiken snabbt."}, {"score": 0, "en": "That a person took goods and left the shop.", "rat_sv": "Andrahandsuppgift skriven som egen iakttagelse.", "err": "unsupported_assumption", "k": "c", "pref": false, "sv": "Att en person tagit varor och lämnat butiken."}]'::jsonb);

  PERFORM pg_temp.author_item(_form, 11, 'sg-rd-11', b_mandate, c_mandate,
    'constructed_response','advanced','synthesis','mandate_and_escalation','mandate', true, true,
    'Formulerar en eskalering med det underlag mottagaren behöver för att besluta.',
    'Eskalering av ett återkommande problem.',
    'En skriven eskalering bedöms som text, inte som ett omdöme om personens omdöme i stort.',
    'Under sex veckor har entrédörrens automatik slutat fungera vid nio tillfällen. Varje gång har dörren stått öppen tills en tekniker kommit, i snitt 40 minuter. Du har felanmält varje gång.',
    'Skriv den eskalering du skickar till uppdragsgivaren. Ange vad som observerats, vad som redan gjorts och vad du begär beslut om.',
    'Over six weeks the entrance door mechanism has failed on nine occasions. Each time the door stood open until a technician arrived, on average 40 minutes. You have reported the fault every time.',
    'Write the escalation you would send to the client. State what has been observed, what has already been done, and what decision you are asking for.',
    '[]'::jsonb);

  RAISE NOTICE 'Rapportering & dokumentation — 11 items authored';
END $$;

DROP FUNCTION IF EXISTS pg_temp.author_item(uuid,int,text,uuid,uuid,text,text,text,text,text,boolean,boolean,text,text,text,text,text,text,text,jsonb);
