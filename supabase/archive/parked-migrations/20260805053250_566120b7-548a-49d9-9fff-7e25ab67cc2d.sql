-- Phase 1G-a — content correction. DRAFT ONLY.

-- =========================================================================
-- SECTION 1 — Classification and legal-framing metadata
-- =========================================================================

ALTER TABLE public.scp_item_versions
  ADD COLUMN IF NOT EXISTS primary_construct text
    CHECK (primary_construct IS NULL OR primary_construct IN (
      'situational_judgement','procedural_knowledge','factual_reporting',
      'operational_communication','prioritisation','mandate_and_escalation')),
  ADD COLUMN IF NOT EXISTS legal_assumption_sv text,
  ADD COLUMN IF NOT EXISTS depends_on_employer_instruction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tests_what text
    CHECK (tests_what IS NULL OR tests_what IN ('mandate','judgement','legal_knowledge')),
  ADD COLUMN IF NOT EXISTS overgeneralisation_guard_sv text,
  ADD COLUMN IF NOT EXISTS learning_counterpart_decision text
    CHECK (learning_counterpart_decision IS NULL OR learning_counterpart_decision IN (
      'separate_learning_counterpart_required','covered_by_module_instruction',
      'no_learning_counterpart_required'));

CREATE OR REPLACE FUNCTION public.scp_guard_construct_honesty()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tests_what = 'legal_knowledge'
     AND NEW.primary_construct = 'situational_judgement' THEN
    RAISE EXCEPTION
      'SCP_CONSTRUCT_MISLABELLED: an item that tests legal knowledge may not be '
      'classified as situational_judgement. Supply the rule in the scenario or '
      'reclassify it as procedural_knowledge.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_item_versions_construct_honesty ON public.scp_item_versions;
CREATE TRIGGER scp_item_versions_construct_honesty
  BEFORE INSERT OR UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_construct_honesty();

-- =========================================================================
-- SECTION 2 — sg-b-02 rewritten
-- =========================================================================

UPDATE public.scp_item_texts t SET
  scenario = CASE t.language
    WHEN 'sv-SE' THEN 'Klockan 02.30 möter du en person i ett trapphus i en bostadsfastighet du bevakar. Uppdraget omfattar tillträdeskontroll: endast boende och deras besökare får vistas i trapphuset nattetid. Personen är lugn och bär matkassar.'
    ELSE 'At 02:30 you meet a person in the stairwell of a residential building you patrol. The assignment includes access control: at night, only residents and their visitors may be in the stairwell. The person is calm and carrying grocery bags.' END,
  prompt = CASE t.language
    WHEN 'sv-SE' THEN 'Vad är lämpligast att göra?'
    ELSE 'What is the most appropriate action?' END
FROM public.scp_item_versions iv
JOIN public.scp_items i ON i.id = iv.item_id
WHERE t.item_version_id = iv.id AND i.slug = 'sg-b-02';

UPDATE public.scp_item_options o SET
  score_value = v.score, is_preferred = v.pref, distractor_error_type = v.err,
  scoring_rationale_sv = v.rsv, scoring_rationale_en = v.ren,
  learning_feedback_sv = v.fsv, learning_feedback_en = v.fen
FROM (VALUES
 ('A',3,true,NULL,
  'Förklarar tillträdesvillkoret och frågar om personen bor i fastigheten. Vid oklarhet verifieras eller eskaleras enligt rutin.',
  'Explains the access condition and asks whether the person lives there. If unclear, verifies or escalates per procedure.',
  'Rätt: villkoret för tillträde förklaras, verifiering söks frivilligt, och osäkerhet hanteras genom rutin — inte genom tvång.',
  'Correct: the access condition is explained, verification is sought voluntarily, and uncertainty is handled by procedure, not coercion.'),
 ('B',1,false,'unsupported_assumption',
  'Fortsätter ronden utan att ta kontakt.',
  'Continues the round without making contact.',
  'Antagandet kan stämma, men tillträdeskontrollen utförs då inte.',
  'The assumption may hold, but the access control is then not performed.'),
 ('C',0,false,'outside_mandate',
  'Kräver legitimation och hindrar personen från att gå vidare tills den visats.',
  'Demands ID and prevents the person from moving on until it is shown.',
  'Att hindra en person och kräva legitimation förutsätter befogenheter som uppdraget inte i sig ger. Tillträdesvillkor hanteras genom förklaring, frivillig verifiering och eskalering.',
  'Detaining a person and demanding ID assumes powers the assignment does not itself confer. Access conditions are handled by explanation, voluntary verification and escalation.'),
 ('D',2,false,'delayed_escalation',
  'Observerar på avstånd och rapporterar till arbetsledningen efter passet.',
  'Observes from a distance and reports to the supervisor after the shift.',
  'Säkert, men frågan om tillträde lämnas olöst under passet.',
  'Safe, but the access question is left unresolved during the shift.')
) AS v(k,score,pref,err,rsv,ren,fsv,fen),
     public.scp_item_versions iv
JOIN public.scp_items i ON i.id = iv.item_id
WHERE o.item_version_id = iv.id AND o.option_key = v.k AND i.slug = 'sg-b-02';

-- =========================================================================
-- SECTION 3 — Classification and legal framing for all 18
-- =========================================================================

UPDATE public.scp_item_versions iv SET
  primary_construct = v.construct,
  tests_what = v.tests,
  depends_on_employer_instruction = v.dep,
  legal_assumption_sv = v.assumption,
  overgeneralisation_guard_sv = v.guard,
  learning_counterpart_decision = v.lc
FROM (VALUES
 ('sg-b-01','situational_judgement','judgement',true,
  'Ingen rättslig premiss. Bygger på att avvikelser ska dokumenteras enligt uppdragets rutin.',
  'Rutinen för avvikelserapportering varierar mellan uppdrag; svaret förutsätter endast att någon rutin finns.',
  'covered_by_module_instruction'),
 ('sg-b-02','situational_judgement','mandate',true,
  'Uppdraget omfattar tillträdeskontroll. Ingen generell befogenhet att kräva legitimation eller hindra en person förutsätts — villkoret hanteras genom förklaring, frivillig verifiering och eskalering.',
  'Tillträdesvillkoret anges uttryckligen i scenariot. Svaret gäller inte utan sådant villkor och beskriver ingen allmän befogenhet.',
  'separate_learning_counterpart_required'),
 ('sg-b-03','situational_judgement','judgement',false,
  'Ingen rättslig premiss. Bygger på proportionalitet och omsorg om personens välbefinnande.',
  'Bedömningen av vårdbehov är inte en medicinsk bedömning utan en fråga om att tillkalla hjälp.',
  'separate_learning_counterpart_required'),
 ('sg-b-04','situational_judgement','judgement',true,
  'Bygger på att ingripande kräver ett tillräckligt säkert eget iakttagelseunderlag. Ingen straffrättslig bedömning görs i scenariot.',
  'Butikens egen rutin kan skilja sig; scenariot prövar iakttagelsens hållbarhet, inte rättsliga rekvisit.',
  'separate_learning_counterpart_required'),
 ('sg-b-05','mandate_and_escalation','mandate',true,
  'Bygger på att tillträde till annans lokal kräver verifiering enligt uppdrag. Ingen rättslig regel om tillträde förutsätts.',
  'Instruktionen anges sakna vägledning; svaret prövar hanteringen av just den luckan.',
  'separate_learning_counterpart_required'),
 ('sg-b-06','mandate_and_escalation','mandate',true,
  'Instruktionen om att utlämnande sker via arbetsledningen anges i scenariot. Ingen bedömning av dataskyddsrätt krävs av deltagaren.',
  'Svaret gäller den angivna rutinen. Andra uppdrag kan ha andra rutiner.',
  'separate_learning_counterpart_required'),
 ('sg-b-07','operational_communication','judgement',false,
  'Ingen rättslig premiss.','Radiodisciplin varierar; svaret prövar innehållets användbarhet.',
  'covered_by_module_instruction'),
 ('sg-b-08','operational_communication','judgement',false,
  'Ingen rättslig premiss.','Överlämningens form varierar; svaret prövar innehållet.',
  'covered_by_module_instruction'),
 ('sg-b-09','situational_judgement','judgement',false,
  'Ingen rättslig premiss.','Entrébeslutet ligger utanför väktarens beslut i scenariot.',
  'separate_learning_counterpart_required'),
 ('sg-b-10','prioritisation','judgement',false,
  'Ingen rättslig premiss.','Bygger på trycksäkerhet, inte på ordningslagstiftning.',
  'separate_learning_counterpart_required'),
 ('sg-b-11','prioritisation','judgement',false,
  'Ingen rättslig premiss. Bygger på att risk för person väger tyngre än risk för egendom.',
  'Prioriteringsordningen kan regleras av uppdragsgivarens instruktion.',
  'separate_learning_counterpart_required'),
 ('sg-b-12','mandate_and_escalation','mandate',true,
  'Bygger på tystnadsplikt enligt anställning och uppdrag, inte på en specifik lagparagraf.',
  'Omfattningen av tystnadsplikten regleras av anställningsavtal och uppdrag.',
  'separate_learning_counterpart_required'),
 ('sg-b-13','situational_judgement','judgement',false,
  'Ingen rättslig premiss.','Ingen befogenhet att avvisa förutsätts.',
  'separate_learning_counterpart_required'),
 ('sg-b-14','situational_judgement','judgement',false,
  'Ingen rättslig premiss.','Fysiskt ingripande behandlas som olämpligt i situationen, inte som olagligt.',
  'separate_learning_counterpart_required'),
 ('sg-b-15','mandate_and_escalation','mandate',true,
  'Bygger på att instruktionen avgränsar uppdraget. Ingen rättslig regel förutsätts.',
  'Vad som ingår i uppdraget varierar; scenariot anger att uppgiften ligger utanför.',
  'separate_learning_counterpart_required'),
 ('sg-b-16','prioritisation','judgement',false,
  'Ingen rättslig premiss.','Prövar prioritering, inte brottsutredning.',
  'separate_learning_counterpart_required'),
 ('sg-b-17','factual_reporting','judgement',false,
  'Ingen rättslig premiss.','Prövar saklighet i överlämning.',
  'separate_learning_counterpart_required'),
 ('sg-b-18','mandate_and_escalation','mandate',true,
  'Bygger på tystnadsplikt och på att personens berörandeskap inte kunnat verifieras.',
  'Svaret beskriver ingen rätt att neka information generellt, utan hantering vid overifierad begäran.',
  'separate_learning_counterpart_required')
) AS v(slug,construct,tests,dep,assumption,guard,lc)
JOIN public.scp_items i ON i.slug = v.slug
WHERE iv.item_id = i.id AND iv.version_number = 1;

-- =========================================================================
-- SECTION 4 — Candidate-facing option text, separated from rationale
-- =========================================================================

UPDATE public.scp_item_option_texts t SET label = v.txt
FROM (VALUES
 ('sg-b-01','A','sv-SE','Kontrollera utrymmet, dokumentera och rapportera enligt rutin.'),
 ('sg-b-01','A','en-GB','Check the space, document it and report per procedure.'),
 ('sg-b-01','B','sv-SE','Lås dörren och fortsätt ronden.'),
 ('sg-b-01','B','en-GB','Lock the door and continue the round.'),
 ('sg-b-01','C','sv-SE','Notera i rapporten och fortsätt ronden.'),
 ('sg-b-01','C','en-GB','Note it in the report and continue the round.'),
 ('sg-b-01','D','sv-SE','Larma polis om inbrott.'),
 ('sg-b-01','D','en-GB','Call the police to report a burglary.'),
 ('sg-b-02','A','sv-SE','Förklara tillträdesvillkoret och fråga om personen bor i fastigheten.'),
 ('sg-b-02','A','en-GB','Explain the access condition and ask whether they live in the building.'),
 ('sg-b-02','B','sv-SE','Fortsätt ronden utan att ta kontakt.'),
 ('sg-b-02','B','en-GB','Continue the round without making contact.'),
 ('sg-b-02','C','sv-SE','Kräv legitimation och hindra personen från att gå vidare.'),
 ('sg-b-02','C','en-GB','Demand ID and prevent the person from moving on.'),
 ('sg-b-02','D','sv-SE','Observera på avstånd och rapportera efter passet.'),
 ('sg-b-02','D','en-GB','Observe from a distance and report after the shift.'),
 ('sg-b-03','A','sv-SE','Tala lugnt med personen och erbjud att hen lämnar frivilligt.'),
 ('sg-b-03','A','en-GB','Speak calmly and offer the person a voluntary exit.'),
 ('sg-b-03','B','sv-SE','Avvakta tills personen vaknar av sig själv.'),
 ('sg-b-03','B','en-GB','Wait until the person wakes up on their own.'),
 ('sg-b-03','C','sv-SE','Avlägsna personen fysiskt.'),
 ('sg-b-03','C','en-GB','Physically remove the person.'),
 ('sg-b-03','D','sv-SE','Be receptionisten hantera situationen.'),
 ('sg-b-03','D','en-GB','Ask the receptionist to handle it.'),
 ('sg-b-04','A','sv-SE','Avstå från ingripande och dokumentera iakttagelsen.'),
 ('sg-b-04','A','en-GB','Do not intervene, and document the observation.'),
 ('sg-b-04','B','sv-SE','Ingrip och uppge att personen tagit varan.'),
 ('sg-b-04','B','en-GB','Intervene and state that the person took the item.'),
 ('sg-b-04','C','sv-SE','Fråga en kollega som tror sig ha sett samma sak och ingrip.'),
 ('sg-b-04','C','en-GB','Ask a colleague who thinks they saw the same, then intervene.'),
 ('sg-b-04','D','sv-SE','Släpp händelsen utan notering.'),
 ('sg-b-04','D','en-GB','Drop it without a note.'),
 ('sg-b-05','A','sv-SE','Hänvisa till arbetsledningen eller hyresgästens kontakt för verifiering.'),
 ('sg-b-05','A','en-GB','Refer to the supervisor or tenant contact for verification.'),
 ('sg-b-05','B','sv-SE','Lås upp kontoret.'),
 ('sg-b-05','B','en-GB','Unlock the office.'),
 ('sg-b-05','C','sv-SE','Neka och avsluta samtalet.'),
 ('sg-b-05','C','en-GB','Refuse and end the conversation.'),
 ('sg-b-05','D','sv-SE','Be personen återkomma nästa dag.'),
 ('sg-b-05','D','en-GB','Ask the person to return the next day.'),
 ('sg-b-06','A','sv-SE','Kontakta arbetsledningen och informera polisen om rutinen.'),
 ('sg-b-06','A','en-GB','Contact the supervisor and tell the officer the procedure.'),
 ('sg-b-06','B','sv-SE','Visa materialet direkt.'),
 ('sg-b-06','B','en-GB','Show the footage immediately.'),
 ('sg-b-06','C','sv-SE','Neka utan förklaring.'),
 ('sg-b-06','C','en-GB','Refuse without explanation.'),
 ('sg-b-06','D','sv-SE','Be polisen återkomma skriftligen.'),
 ('sg-b-06','D','en-GB','Ask the officer to submit a written request.'),
 ('sg-b-07','A','sv-SE','Bekräfta larmet, ange din position och beräknad framkomsttid.'),
 ('sg-b-07','A','en-GB','Confirm the alarm, state your position and estimated arrival.'),
 ('sg-b-07','B','sv-SE','Svara "uppfattat" och åk mot platsen.'),
 ('sg-b-07','B','en-GB','Reply "received" and head to the location.'),
 ('sg-b-07','C','sv-SE','Åk mot platsen utan att svara.'),
 ('sg-b-07','C','en-GB','Head to the location without responding.'),
 ('sg-b-07','D','sv-SE','Fråga vad som orsakat larmet.'),
 ('sg-b-07','D','en-GB','Ask what caused the alarm.'),
 ('sg-b-08','A','sv-SE','Redogör för händelsen, vidtagna åtgärder, avspärrningen och att polis är kallad.'),
 ('sg-b-08','A','en-GB','Cover the incident, actions taken, the cordon and that police are called.'),
 ('sg-b-08','B','sv-SE','Berätta vem du tror ligger bakom.'),
 ('sg-b-08','B','en-GB','Say who you think is responsible.'),
 ('sg-b-08','C','sv-SE','Säg att polis är kallad.'),
 ('sg-b-08','C','en-GB','Say that police have been called.'),
 ('sg-b-08','D','sv-SE','Lämna platsen när passet tar slut.'),
 ('sg-b-08','D','en-GB','Leave when the shift ends.'),
 ('sg-b-09','A','sv-SE','Bekräfta personens frustration och hänvisa till rätt instans.'),
 ('sg-b-09','A','en-GB','Acknowledge their frustration and refer them to the right contact.'),
 ('sg-b-09','B','sv-SE','Upprepa att beslutet står fast.'),
 ('sg-b-09','B','en-GB','Repeat that the decision stands.'),
 ('sg-b-09','C','sv-SE','Höj rösten för att återta kontrollen.'),
 ('sg-b-09','C','en-GB','Raise your voice to regain control.'),
 ('sg-b-09','D','sv-SE','Ge en egen förklaring till varför personen nekats.'),
 ('sg-b-09','D','en-GB','Offer your own explanation for the refusal.'),
 ('sg-b-10','A','sv-SE','Meddela kollegorna, öppna utrymme framåt och sakta ned insläppet.'),
 ('sg-b-10','A','en-GB','Alert colleagues, create space at the front and slow the intake.'),
 ('sg-b-10','B','sv-SE','Fortsätt insläppet i samma takt.'),
 ('sg-b-10','B','en-GB','Keep the intake at the same rate.'),
 ('sg-b-10','C','sv-SE','Ropa åt kön att backa.'),
 ('sg-b-10','C','en-GB','Shout at the queue to step back.'),
 ('sg-b-10','D','sv-SE','Stoppa insläppet helt.'),
 ('sg-b-10','D','en-GB','Stop the intake entirely.'),
 ('sg-b-11','A','sv-SE','Ta överfallslarmet och ge kollegan dörrlarmet, med bekräftad uppdelning.'),
 ('sg-b-11','A','en-GB','Take the attack alarm and assign the door alarm, confirming the split.'),
 ('sg-b-11','B','sv-SE','Ta dörrlarmet eftersom det ligger närmare.'),
 ('sg-b-11','B','en-GB','Take the door alarm because it is closer.'),
 ('sg-b-11','C','sv-SE','Åk till överfallslarmet.'),
 ('sg-b-11','C','en-GB','Go to the attack alarm.'),
 ('sg-b-11','D','sv-SE','Be larmcentralen fördela larmen.'),
 ('sg-b-11','D','en-GB','Ask the control room to allocate the alarms.'),
 ('sg-b-12','A','sv-SE','Förklara att du inte kan dela uppgifter om händelsen.'),
 ('sg-b-12','A','en-GB','Explain that you cannot share details of the incident.'),
 ('sg-b-12','B','sv-SE','Berätta vad som hände.'),
 ('sg-b-12','B','en-GB','Tell them what happened.'),
 ('sg-b-12','C','sv-SE','Berätta delvis, utan namn.'),
 ('sg-b-12','C','en-GB','Share partially, without names.'),
 ('sg-b-12','D','sv-SE','Avfärda frågan.'),
 ('sg-b-12','D','en-GB','Dismiss the question.'),
 ('sg-b-13','A','sv-SE','Håll uppsikt och ta kontakt lugnt.'),
 ('sg-b-13','A','en-GB','Keep watch and make calm contact.'),
 ('sg-b-13','B','sv-SE','Observera utan att ta kontakt.'),
 ('sg-b-13','B','en-GB','Observe without making contact.'),
 ('sg-b-13','C','sv-SE','Meddela larmcentralen om misstänkt person.'),
 ('sg-b-13','C','en-GB','Report a suspicious person to the control room.'),
 ('sg-b-13','D','sv-SE','Säg åt personen att lämna platsen.'),
 ('sg-b-13','D','en-GB','Tell the person to leave.'),
 ('sg-b-14','A','sv-SE','Gå fram lugnt och erbjud samtal avsides.'),
 ('sg-b-14','A','en-GB','Approach calmly and offer to talk aside.'),
 ('sg-b-14','B','sv-SE','Avvakta och se om personen lugnar sig.'),
 ('sg-b-14','B','en-GB','Wait to see whether they calm down.'),
 ('sg-b-14','C','sv-SE','Säg till personen inför de andra besökarna.'),
 ('sg-b-14','C','en-GB','Reprimand them in front of the other visitors.'),
 ('sg-b-14','D','sv-SE','Ta tag i personen och led ut hen.'),
 ('sg-b-14','D','en-GB','Take hold of the person and lead them out.'),
 ('sg-b-15','A','sv-SE','Förklara instruktionens gräns och stäm av med arbetsledningen.'),
 ('sg-b-15','A','en-GB','Explain the limit of the instruction and check with the supervisor.'),
 ('sg-b-15','B','sv-SE','Säg nej och ta upp det efter passet.'),
 ('sg-b-15','B','en-GB','Say no and raise it after the shift.'),
 ('sg-b-15','C','sv-SE','Säg nej.'),
 ('sg-b-15','C','en-GB','Say no.'),
 ('sg-b-15','D','sv-SE','Utför uppgiften.'),
 ('sg-b-15','D','en-GB','Carry out the task.')
) AS v(slug,k,lang,txt),
     public.scp_item_options o
JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
JOIN public.scp_items i ON i.id = iv.item_id
WHERE t.item_option_id = o.id AND t.language = v.lang
  AND o.option_key = v.k AND i.slug = v.slug;

-- =========================================================================
-- SECTION 5 — Prove it
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_item_option_texts t
   JOIN public.scp_item_options o ON o.id = t.item_option_id
   WHERE btrim(t.label) IN (btrim(coalesce(o.scoring_rationale_sv,'~')),
                            btrim(coalesce(o.scoring_rationale_en,'~')));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1G_LABEL_IS_RATIONALE: % labels still reuse the rationale', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_item_versions iv
   JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%'
     AND (primary_construct IS NULL OR tests_what IS NULL
       OR legal_assumption_sv IS NULL OR overgeneralisation_guard_sv IS NULL
       OR learning_counterpart_decision IS NULL);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1G_UNCLASSIFIED: % items lack classification or framing', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_item_options o
     JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
     JOIN public.scp_items i ON i.id = iv.item_id
    WHERE i.slug = 'sg-b-02' AND o.is_preferred
      AND o.scoring_rationale_sv ILIKE '%rätt att kräva%') THEN
    RAISE EXCEPTION 'SCP_P1G_SGB02_STILL_LEGALISTIC';
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
              WHERE i.slug LIKE 'sg-b-%' AND iv.content_status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.assessments WHERE employer_visible)
     OR EXISTS (SELECT 1 FROM public.scp_ai_providers WHERE is_enabled AND code <> 'null_provider')
  THEN RAISE EXCEPTION 'SCP_P1G_BOUNDARY_BREACHED'; END IF;
END $$;