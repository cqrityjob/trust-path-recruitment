-- Phase 1F-b — the twelve single-best-response SJT items. DRAFT ONLY.
--
-- Realistic Swedish väktare work. Every distractor is a plausible professional
-- error, not a cartoon: the wrong answers are things competent people actually
-- do under time pressure.
--
-- Where the correct action depends on local instruction, employer procedure or
-- object-specific rules, the scenario either STATES the rule or the item
-- assesses the decision to verify/escalate according to procedure. No item is a
-- legal examination, and no option claims universal correctness across every
-- employer or assignment.
--
-- authored_by_ai = true on every row. Every item carries outstanding review
-- requirements; none is cleared here.

-- =========================================================================
-- 1. Item metadata
-- =========================================================================

UPDATE public.scp_item_versions iv SET
  authored_by_ai = true,
  market = 'SE',
  jurisdiction_id = (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
  difficulty = v.diff,
  cognitive_demand = v.cog,
  work_context_sv = v.ctx,
  information_available_sv = v.avail,
  information_withheld_sv = v.withheld,
  is_safety_critical = v.safety,
  requires_human_review = false,
  legal_basis_required = v.legal,
  legal_review_status = CASE WHEN v.legal THEN 'pending' ELSE 'not_required' END,
  response_process = v.proc,
  context_note = v.note
FROM (VALUES
 ('sg-b-01','intermediate','judgement','Rondering, kontorsfastighet, kvällstid',
  'Dörrens läge, tidpunkt, egen instruktion om rondering','Vem som passerat, om larm är aktivt',
  false,false,'Iakttagelse följt av val av åtgärd','Avvikelse under rond'),
 ('sg-b-02','intermediate','judgement','Trapphus, bostadsfastighet, natt',
  'Personens beteende, tidpunkt, uppdragets omfattning','Personens identitet, om hen bor i huset',
  false,false,'Informationsinsamling före åtgärd','Okänd person i trapphus'),
 ('sg-b-03','advanced','prioritisation','Reception, kontorshus, eftermiddag',
  'Personens tillstånd, plats, kollegor på plats','Personens medicinska status',
  true,false,'Proportionalitetsbedömning','Berusad person i lobby'),
 ('sg-b-04','advanced','judgement','Butik, köpcentrum, dagtid',
  'Egen iakttagelse, butikens rutin för misstänkt snatteri','Om varan är betald, kamerabild',
  true,true,'Bevisvärdering före ingripande','Osäker snatteriiakttagelse'),
 ('sg-b-05','intermediate','judgement','Kontorsfastighet, flera hyresgäster',
  'Uppdragsbeskrivning, vem som begär tillträde','Hyresgästens interna regler',
  false,true,'Mandatbedömning','Begäran om tillträde till hyresgästs lokal'),
 ('sg-b-06','advanced','judgement','Bevakningsobjekt, kameraövervakning',
  'Polisens begäran, egen instruktion om utlämnande','Om formell begäran finns',
  false,true,'Mandat och eskalering','Begäran om kameramaterial'),
 ('sg-b-07','foundational','prioritisation','Larmcentral via radio, industriområde',
  'Larmtyp, plats, egen position','Orsak till larmet',
  true,false,'Strukturerad lägesrapport','Brandlarm, första rapport'),
 ('sg-b-08','intermediate','synthesis','Skiftbyte, pågående händelse',
  'Vad som hänt hittills, vidtagna åtgärder','Hur händelsen utvecklas',
  false,false,'Överlämning av lägesbild','Överlämning vid skiftbyte'),
 ('sg-b-09','intermediate','judgement','Entré, evenemang, kväll',
  'Personens beteende, entrébeslut, egen position','Varför personen nekats',
  true,false,'Verbal nedtrappning','Nekad entré, upprörd besökare'),
 ('sg-b-10','advanced','prioritisation','Kö vid insläpp, folksamling',
  'Trycket i kön, antal kollegor, utrymningsvägar','Hur många som är på väg',
  true,false,'Nedtrappning vid folksamling','Tryck i kö'),
 ('sg-b-11','intermediate','prioritisation','Två samtidiga larm, en kollega',
  'Larmens typ och plats, kollegans position','Vilket larm som är skarpt',
  true,false,'Samordning under tidspress','Samtidiga larm'),
 ('sg-b-12','foundational','judgement','Personalrum efter avslutat pass',
  'Kollegans fråga, egen tystnadsplikt','Kollegans avsikt',
  true,false,'Informationshantering','Fråga om händelse från kollega')
) AS v(slug,diff,cog,ctx,avail,withheld,safety,legal,proc,note)
JOIN public.scp_items i ON i.slug = v.slug
WHERE iv.item_id = i.id AND iv.version_number = 1;

-- =========================================================================
-- 2. Bilingual item texts
-- =========================================================================

INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
SELECT iv.id, v.lang, 'adaptation_pending', v.scenario, v.prompt
FROM (VALUES
 ('sg-b-01','sv-SE','Under en kvällsrond i en kontorsfastighet hittar du en dörr till ett teknikutrymme olåst. Enligt instruktionen ska utrymmet vara låst utanför arbetstid. Du ser inga personer och inget ser flyttat.','Vad gör du först?'),
 ('sg-b-01','en-GB','On an evening round in an office building you find a door to a plant room unlocked. Your instructions say it must be locked outside working hours. You see no one, and nothing appears moved.','What do you do first?'),
 ('sg-b-02','sv-SE','Klockan 02.30 möter du en person i ett trapphus i en bostadsfastighet du bevakar. Personen är lugn, bär matkassar och verkar inte förvånad över att se dig.','Vad är lämpligast att göra?'),
 ('sg-b-02','en-GB','At 02:30 you meet a person in the stairwell of a residential building you patrol. They are calm, carrying grocery bags, and seem unsurprised to see you.','What is the most appropriate action?'),
 ('sg-b-03','sv-SE','En tydligt berusad person har satt sig i receptionen i ett kontorshus och somnar av och till. Personen är inte hotfull. Receptionisten är obekväm. Du är ensam väktare på plats.','Vad gör du?'),
 ('sg-b-03','en-GB','A clearly intoxicated person has sat down in the reception of an office building and keeps dozing off. They are not threatening. The receptionist is uncomfortable. You are the only guard present.','What do you do?'),
 ('sg-b-04','sv-SE','Du ser en person stoppa en vara i sin jacka i en butik du bevakar. Personen går sedan mot kassorna men du tappar bort personen i trängseln i några sekunder innan du ser hen passera utgången.','Vad gör du?'),
 ('sg-b-04','en-GB','You see a person put an item inside their jacket in a shop you patrol. They then walk towards the tills, but you lose sight of them in the crowd for a few seconds before you see them pass the exit.','What do you do?'),
 ('sg-b-05','sv-SE','En person uppger att hen arbetar hos en hyresgäst och ber dig låsa upp deras kontor eftersom nyckelkortet inte fungerar. Du känner inte igen personen. Din instruktion beskriver inte detta fall.','Vad gör du?'),
 ('sg-b-05','en-GB','Someone says they work for a tenant and asks you to unlock their office because their access card is not working. You do not recognise them. Your instructions do not cover this case.','What do you do?'),
 ('sg-b-06','sv-SE','En polis kommer till bevakningsobjektet och ber att direkt få se kameramaterial från en händelse tidigare samma dag. Din instruktion säger att utlämnande sker via arbetsledningen.','Vad gör du?'),
 ('sg-b-06','en-GB','A police officer arrives at the site and asks to see CCTV footage from an incident earlier that day, immediately. Your instructions say disclosure goes through your supervisor.','What do you do?'),
 ('sg-b-07','sv-SE','Du får via radio veta att ett brandlarm har utlöst i byggnad C på industriområdet du bevakar. Du befinner dig vid byggnad A.','Vad rapporterar du först tillbaka?'),
 ('sg-b-07','en-GB','You are told by radio that a fire alarm has triggered in building C on the industrial site you patrol. You are at building A.','What do you report back first?'),
 ('sg-b-08','sv-SE','Ditt pass tar slut mitt under en pågående händelse: en dörr har brutits upp, polis är kallad men inte framme, och du har spärrat av området. Din avlösare kommer nu.','Vad är viktigast i din överlämning?'),
 ('sg-b-08','en-GB','Your shift ends during an ongoing incident: a door has been forced, police are called but not yet on scene, and you have cordoned off the area. Your relief arrives now.','What matters most in your handover?'),
 ('sg-b-09','sv-SE','En besökare har nekats entré till ett evenemang av entrévärdarna. Personen blir högljudd mot dig och kräver en förklaring. Du vet inte varför beslutet togs.','Vad gör du?'),
 ('sg-b-09','en-GB','A visitor has been refused entry to an event by the door hosts. They become loud towards you and demand an explanation. You do not know why the decision was made.','What do you do?'),
 ('sg-b-10','sv-SE','Vid insläppet börjar kön tryckas ihop och personer längst fram pressas mot avspärrningen. Du har två kollegor i närheten.','Vad gör du först?'),
 ('sg-b-10','en-GB','At the entry point the queue starts to compress and people at the front are being pushed against the barrier. You have two colleagues nearby.','What do you do first?'),
 ('sg-b-11','sv-SE','Två larm utlöser samtidigt: ett dörrlarm i en lastport och ett överfallslarm i receptionen. Du och en kollega är i tjänst.','Hur agerar du?'),
 ('sg-b-11','en-GB','Two alarms trigger at once: a door alarm at a loading bay and a personal attack alarm in reception. You and one colleague are on duty.','How do you act?'),
 ('sg-b-12','sv-SE','Efter passet frågar en kollega som inte var i tjänst vad som hände vid gårdagens händelse, eftersom en av de inblandade är hens vän.','Vad gör du?'),
 ('sg-b-12','en-GB','After your shift, a colleague who was not on duty asks what happened in yesterday''s incident, because one of the people involved is a friend of theirs.','What do you do?')
) AS v(slug,lang,scenario,prompt)
JOIN public.scp_items i ON i.slug = v.slug
JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 3. Options, scores, rationales and Learning Mode feedback
-- =========================================================================
--
-- score 3 = preferred · 2 = defensible but weaker · 1 = poor · 0 = unsafe or
-- outside mandate. Each distractor names the professional error it represents.

INSERT INTO public.scp_item_options
  (item_version_id, option_key, display_order, score_value, is_preferred,
   distractor_error_type, scoring_rationale_sv, scoring_rationale_en,
   learning_feedback_sv, learning_feedback_en)
SELECT iv.id, v.k, v.ord, v.score, v.pref, v.err, v.rat_sv, v.rat_en, v.fb_sv, v.fb_en
FROM (VALUES
 -- sg-b-01 situational judgement
 ('sg-b-01','A',1,3,true,NULL,'Kontrollerar utrymmet, dokumenterar och rapporterar avvikelsen enligt rutin.','Checks the space, documents and reports the deviation per procedure.','Rätt: iakttagelse, kontroll och dokumentation innan slutsats.','Correct: observe, check and document before concluding.'),
 ('sg-b-01','B',2,1,false,'failure_to_document','Låser och går vidare utan notering — avvikelsen försvinner.','Locks and moves on without a note — the deviation disappears.','Att låsa är rimligt, men en oregistrerad avvikelse kan inte följas upp.','Locking is reasonable, but an unrecorded deviation cannot be followed up.'),
 ('sg-b-01','C',3,2,false,'delayed_escalation','Noterar i rapport men kontrollerar inte utrymmet.','Notes it in the report but does not check the space.','Dokumentation utan kontroll ger en ofullständig lägesbild.','Documentation without checking leaves an incomplete picture.'),
 ('sg-b-01','D',4,0,false,'premature_escalation','Larmar polis om inbrott utan några tecken på brott.','Calls police reporting a burglary with no sign of a crime.','En olåst dörr är en avvikelse, inte ett konstaterat brott.','An unlocked door is a deviation, not an established crime.'),
 -- sg-b-02
 ('sg-b-02','A',1,3,true,NULL,'Hälsar, presenterar sig och frågar öppet om personen bor i fastigheten.','Greets, identifies themselves and asks openly whether the person lives there.','Rätt: låg tröskel, öppen fråga, ingen anklagelse.','Correct: low threshold, open question, no accusation.'),
 ('sg-b-02','B',2,1,false,'unsupported_assumption','Utgår från att personen bor där och går vidare utan kontakt.','Assumes they live there and moves on without contact.','Antagandet kan stämma, men ingen information har inhämtats.','The assumption may hold, but no information was gathered.'),
 ('sg-b-02','C',3,0,false,'outside_mandate','Kräver legitimation och hindrar personen från att gå vidare.','Demands ID and prevents the person from moving on.','Väktare har inte generell rätt att kräva legitimation av boende.','A guard has no general right to demand ID from a resident.'),
 ('sg-b-02','D',4,2,false,'weak_communication','Observerar på avstånd utan att ta kontakt.','Observes from a distance without making contact.','Passiv observation är säkert men löser inte osäkerheten.','Passive observation is safe but does not resolve the uncertainty.'),
 -- sg-b-03 proportionality (safety-critical)
 ('sg-b-03','A',1,3,true,NULL,'Talar lugnt med personen, erbjuder att hen lämnar frivilligt och bedömer om vård behövs.','Speaks calmly, offers a voluntary exit and assesses whether care is needed.','Rätt: minsta ingripande åtgärd först, med bedömning av vårdbehov.','Correct: least intrusive action first, with a check on medical need.'),
 ('sg-b-03','B',2,2,false,'delayed_escalation','Avvaktar helt tills personen vaknar av sig själv.','Waits entirely until the person wakes up on their own.','Tålamod är rimligt, men en medvetslös person kan behöva vård.','Patience is reasonable, but an unresponsive person may need care.'),
 ('sg-b-03','C',3,0,false,'poor_proportionality','Avlägsnar personen fysiskt direkt.','Physically removes the person immediately.','Fysiskt ingripande som första åtgärd mot en icke-hotfull person är oproportionerligt.','Physical intervention as a first action against a non-threatening person is disproportionate.'),
 ('sg-b-03','D',4,1,false,'weak_communication','Ber receptionisten hantera situationen själv.','Asks the receptionist to handle it themselves.','Att lämna över till obehörig personal löser inte uppgiften.','Handing an untrained colleague the task does not resolve it.'),
 -- sg-b-04 (safety-critical, legal review)
 ('sg-b-04','A',1,3,true,NULL,'Avstår från ingripande eftersom iakttagelsen bröts, och dokumenterar händelsen.','Does not intervene because the observation was broken, and documents it.','Rätt: obruten iakttagelse krävs; osäkerhet dokumenteras hellre än gissas.','Correct: an unbroken observation is required; uncertainty is documented, not guessed.'),
 ('sg-b-04','B',2,0,false,'insufficient_information','Ingriper och påstår att personen stulit varan.','Intervenes and asserts the person stole the item.','Ingripande på bruten iakttagelse riskerar felaktigt ingripande.','Intervening on a broken observation risks a wrongful intervention.'),
 ('sg-b-04','C',3,2,false,'excessive_informal_trust','Frågar en kollega som "tror" att hen såg samma sak och ingriper.','Asks a colleague who "thinks" they saw the same and intervenes.','Informell bekräftelse ersätter inte egen obruten iakttagelse.','Informal confirmation does not replace your own unbroken observation.'),
 ('sg-b-04','D',4,1,false,'failure_to_document','Släpper det helt utan notering.','Drops it entirely without a note.','Att avstå är rätt, men iakttagelsen har värde för uppföljning.','Not intervening is right, but the observation has follow-up value.'),
 -- sg-b-05 mandate (legal review)
 ('sg-b-05','A',1,3,true,NULL,'Hänvisar till arbetsledning eller hyresgästens kontakt för verifiering.','Refers to the supervisor or the tenant contact for verification.','Rätt: verifiering enligt rutin när instruktionen inte täcker fallet.','Correct: verify per procedure when instructions do not cover the case.'),
 ('sg-b-05','B',2,0,false,'outside_mandate','Låser upp eftersom personen verkar trovärdig.','Unlocks because the person seems credible.','Tillträde till annans lokal utan verifiering ligger utanför mandatet.','Granting access to another party''s premises without verification is outside mandate.'),
 ('sg-b-05','C',3,1,false,'weak_communication','Nekar utan förklaring och avslutar samtalet.','Refuses without explanation and ends the conversation.','Att neka är rimligt, men utan hänvisning löses inget.','Refusing is reasonable, but without a referral nothing is resolved.'),
 ('sg-b-05','D',4,2,false,'delayed_escalation','Ber personen återkomma nästa dag.','Asks the person to come back the next day.','Rimligt men onödigt: verifiering kan ske nu.','Reasonable but unnecessary: verification can happen now.'),
 -- sg-b-06 mandate (legal review)
 ('sg-b-06','A',1,3,true,NULL,'Kontaktar arbetsledningen enligt instruktion och informerar polisen om rutinen.','Contacts the supervisor per instruction and tells the officer the procedure.','Rätt: följer utlämnanderutin utan att obstruera.','Correct: follows the disclosure procedure without obstructing.'),
 ('sg-b-06','B',2,0,false,'outside_mandate','Visar materialet direkt eftersom det är polis som frågar.','Shows the footage immediately because it is the police asking.','Utlämnande utanför rutin kan bryta mot uppdrag och dataskydd.','Disclosure outside procedure may breach both mandate and data protection.'),
 ('sg-b-06','C',3,1,false,'weak_communication','Nekar utan att förklara eller hänvisa vidare.','Refuses without explaining or referring on.','Att följa rutin ska kunna förklaras sakligt.','Following procedure should be explained factually.'),
 ('sg-b-06','D',4,2,false,'delayed_escalation','Ber polisen återkomma skriftligen utan att kontakta arbetsledningen.','Asks the officer to submit a written request without contacting the supervisor.','Delvis rätt, men arbetsledningen bör informeras direkt.','Partly right, but the supervisor should be informed now.'),
 -- sg-b-07 communication
 ('sg-b-07','A',1,3,true,NULL,'Bekräftar larmet, anger egen position och beräknad framkomsttid.','Confirms the alarm, states own position and estimated time to arrive.','Rätt: kort, entydigt och användbart för mottagaren.','Correct: short, unambiguous and useful to the recipient.'),
 ('sg-b-07','B',2,1,false,'weak_communication','Svarar "uppfattat" och åker utan att ange position.','Replies "received" and leaves without stating position.','Mottagaren saknar då lägesbild om vem som är på väg.','The recipient then has no picture of who is en route.'),
 ('sg-b-07','C',3,0,false,'tunnel_vision','Åker utan att svara alls.','Leaves without responding at all.','Utan kvittens vet larmcentralen inte att larmet hanteras.','Without acknowledgement the control room does not know it is handled.'),
 ('sg-b-07','D',4,2,false,'insufficient_information','Frågar först vad som orsakat larmet innan hen svarar.','Asks what caused the alarm before responding.','Orsaken är sällan känd direkt; kvittens går först.','The cause is rarely known yet; acknowledgement comes first.'),
 -- sg-b-08 communication
 ('sg-b-08','A',1,3,true,NULL,'Överlämnar vad som hänt, vidtagna åtgärder, avspärrningens omfattning och att polis är kallad.','Hands over what happened, actions taken, the cordon''s extent and that police are called.','Rätt: fakta, åtgärder och pågående förväntningar.','Correct: facts, actions and what is pending.'),
 ('sg-b-08','B',2,1,false,'unsupported_assumption','Berättar sin teori om vem som gjort det.','Shares their theory about who did it.','Teori utan underlag kan styra avlösarens bedömning fel.','An unsupported theory can misdirect the incoming guard.'),
 ('sg-b-08','C',3,2,false,'insufficient_information','Säger bara att polis är kallad.','Says only that police have been called.','Sant men otillräckligt för att ta över händelsen.','True, but not enough to take over the incident.'),
 ('sg-b-08','D',4,0,false,'failure_to_document','Lämnar platsen när passet tar slut utan överlämning.','Leaves at end of shift without a handover.','Avbruten kontinuitet vid pågående händelse är en allvarlig brist.','Breaking continuity during an ongoing incident is a serious failure.'),
 -- sg-b-09 de-escalation (safety-critical)
 ('sg-b-09','A',1,3,true,NULL,'Bekräftar personens frustration, håller lugn ton och hänvisar till rätt instans.','Acknowledges the frustration, keeps a calm tone and refers to the right contact.','Rätt: sänker spänningen utan att ta över beslutet.','Correct: lowers tension without taking over the decision.'),
 ('sg-b-09','B',2,1,false,'weak_communication','Upprepar bara att beslutet står fast.','Simply repeats that the decision stands.','Sant men eskalerande när ingen förklaring ges.','True, but escalating when no explanation is offered.'),
 ('sg-b-09','C',3,0,false,'poor_proportionality','Höjer rösten för att återta kontrollen.','Raises their voice to regain control.','Att möta upptrappning med upptrappning ökar risken.','Meeting escalation with escalation increases risk.'),
 ('sg-b-09','D',4,2,false,'unsupported_assumption','Gissar en förklaring till varför personen nekats.','Guesses at a reason for the refusal.','Välmenat, men en felaktig förklaring skapar ny konflikt.','Well meant, but a wrong explanation creates fresh conflict.'),
 -- sg-b-10 de-escalation (safety-critical)
 ('sg-b-10','A',1,3,true,NULL,'Meddelar kollegorna, öppnar utrymme framåt och saktar ned insläppet.','Alerts colleagues, creates space at the front and slows the intake.','Rätt: minskar trycket innan det blir en klämrisk.','Correct: reduces pressure before it becomes a crush risk.'),
 ('sg-b-10','B',2,0,false,'tunnel_vision','Fortsätter insläppet i samma takt för att korta kön.','Keeps the intake rate to shorten the queue.','Att prioritera flöde framför trycket är den farliga felbedömningen.','Prioritising flow over pressure is the dangerous misjudgement.'),
 ('sg-b-10','C',3,1,false,'weak_communication','Ropar åt kön att backa utan att samordna med kollegorna.','Shouts at the queue to step back without coordinating.','Enskilda tillrop utan samordning ger sällan effekt.','Individual shouting without coordination rarely works.'),
 ('sg-b-10','D',4,2,false,'delayed_escalation','Stoppar insläppet helt utan förvarning.','Stops the intake entirely without warning.','Säkert men abrupt; kan skapa ny frustration i kön.','Safe but abrupt; may create fresh frustration in the queue.'),
 -- sg-b-11 coordination (safety-critical)
 ('sg-b-11','A',1,3,true,NULL,'Tar överfallslarmet, meddelar kollegan att ta dörrlarmet och bekräftar uppdelningen.','Takes the attack alarm, assigns the door alarm to the colleague and confirms the split.','Rätt: person före egendom, med uttalad samordning.','Correct: person before property, with an explicit split.'),
 ('sg-b-11','B',2,1,false,'poor_proportionality','Tar dörrlarmet eftersom det ligger närmare.','Takes the door alarm because it is closer.','Närhet väger lättare än risk för person.','Proximity weighs less than risk to a person.'),
 ('sg-b-11','C',3,0,false,'tunnel_vision','Åker till överfallslarmet utan att säga något till kollegan.','Goes to the attack alarm without telling the colleague.','Rätt prioritering, men utan samordning kan båda åka samma väg.','Right priority, but without coordination both may go the same way.'),
 ('sg-b-11','D',4,2,false,'delayed_escalation','Ber larmcentralen bestämma vem som tar vad.','Asks the control room to decide who takes what.','Rimligt men fördröjer; uppdelningen kan göras direkt.','Reasonable but slow; the split can be made immediately.'),
 -- sg-b-12 integrity (safety-critical)
 ('sg-b-12','A',1,3,true,NULL,'Förklarar vänligt att hen inte kan dela uppgifter om händelsen.','Explains politely that they cannot share details of the incident.','Rätt: tystnadsplikten gäller även mot kollegor utan behov.','Correct: confidentiality applies to colleagues without a need to know.'),
 ('sg-b-12','B',2,0,false,'outside_mandate','Berättar eftersom kollegan arbetar på samma företag.','Tells them because the colleague works for the same company.','Anställning ger inte i sig behörighet till uppgifterna.','Employment alone does not confer a need to know.'),
 ('sg-b-12','C',3,1,false,'unsupported_assumption','Berättar delvis, utan namn.','Shares partially, without names.','Avidentifiering räcker sällan i en liten krets.','De-identification rarely holds in a small circle.'),
 ('sg-b-12','D',4,2,false,'weak_communication','Avfärdar frågan utan förklaring.','Dismisses the question without explanation.','Rätt utfall, men en kort förklaring hade varit bättre.','Right outcome, but a brief explanation would be better.')
) AS v(slug,k,ord,score,pref,err,rat_sv,rat_en,fb_sv,fb_en)
JOIN public.scp_items i ON i.slug = v.slug
JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
ON CONFLICT DO NOTHING;

-- Bilingual option labels.
INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
SELECT o.id, 'sv-SE', o.scoring_rationale_sv
FROM public.scp_item_options o
JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
JOIN public.scp_items i ON i.id = iv.item_id
WHERE i.slug LIKE 'sg-b-%'
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
SELECT o.id, 'en-GB', o.scoring_rationale_en
FROM public.scp_item_options o
JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
JOIN public.scp_items i ON i.id = iv.item_id
WHERE i.slug LIKE 'sg-b-%'
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 4. Prove it
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_item_options o
   JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
   JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-0%' OR i.slug IN ('sg-b-10','sg-b-11','sg-b-12');
  IF _n <> 48 THEN
    RAISE EXCEPTION 'SCP_P1F_SJT_OPTIONS: expected 48 options for 12 items, found %', _n;
  END IF;

  -- Exactly one preferred response per SJT item.
  SELECT count(*) INTO _n FROM (
    SELECT o.item_version_id FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug LIKE 'sg-b-%' AND iv.item_format = 'sjt_best_response' AND o.is_preferred
    GROUP BY o.item_version_id HAVING count(*) <> 1) bad;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1F_PREFERRED: % items do not have exactly one preferred response', _n;
  END IF;

  -- Every distractor names the professional error it represents.
  SELECT count(*) INTO _n FROM public.scp_item_options o
   JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
   JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%' AND NOT o.is_preferred AND o.distractor_error_type IS NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1F_DISTRACTORS: % distractors name no professional error', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_item_versions iv
              JOIN public.scp_items i ON i.id = iv.item_id
             WHERE i.slug LIKE 'sg-b-%' AND iv.content_status <> 'draft') THEN
    RAISE EXCEPTION 'SCP_P1F_PUBLISHED: content is authored to draft only';
  END IF;
END $$;
