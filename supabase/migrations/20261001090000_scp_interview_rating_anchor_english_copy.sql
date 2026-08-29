-- ============================================================================
-- The behavioural anchors, in English too
-- ============================================================================
--
-- Found by walking the interview screen in the English locale: the TRUST
-- banner, the method, the prohibited areas and the evidence dimensions all read
-- in English, and then the behavioural anchors -- the copy an interviewer holds
-- the account against -- appeared in Swedish. Level 0 is the sharpest case:
--
--   "0 -- Otillräcklig evidens ... Detta är inte samma sak som låg kompetens."
--
-- That last sentence is the whole reason level 0 is drawn apart from 1-4. An
-- English-reading interviewer saw the "0" and none of the sentence that stops
-- it being read as a low score.
--
-- scp_interview_rating_anchors.label_en and .anchor_en already existed and were
-- empty, so nothing was reading them either. This migration fills them and the
-- projection starts reading them.
--
-- TRANSLATION ONLY. No level, ordinal, aggregation flag, safety flag or pack
-- version changes; nothing is added or removed; no anchor's meaning is altered.
-- The Swedish remains authoritative -- English is a faithful rendering of it,
-- not a second definition. Matching is on the Swedish text, so a reworded
-- anchor is left untranslated and VISIBLE rather than silently mismatched.
-- ============================================================================

DO $$
DECLARE
  _pair record;
  _offered integer := 0;
BEGIN
  -- ---- the five level labels ----------------------------------------------
  FOR _pair IN
    SELECT * FROM (VALUES
      ('Otillräcklig evidens',        'Insufficient evidence'),
      ('Riskfyllt/otillräckligt',     'Unsafe/insufficient'),
      ('Grundläggande/ojämnt',        'Basic/uneven'),
      ('Effektivt och säkert',        'Effective and safe'),
      ('Mycket starkt/systematiskt',  'Very strong/systematic')
    ) AS v(sv, en)
  LOOP
    UPDATE public.scp_interview_rating_anchors
       SET label_en = _pair.en
     WHERE label_sv = _pair.sv AND label_en IS NULL;
    _offered := _offered + 1;
  END LOOP;

  -- ---- the anchor descriptions --------------------------------------------
  FOR _pair IN
    SELECT * FROM (VALUES
      ('Svaret ger inte tillräckligt jobbrelevant underlag för bedömning efter rimliga neutrala följdfrågor. Detta är inte samma sak som låg kompetens.',
       'After reasonable neutral follow-up questions the answer still does not give enough job-relevant material to assess. This is not the same thing as low competence.'),

      ('Accepterar eller döljer ett säkerhetsrelevant regelbrott; överskrider mandat; kan inte redogöra för ansvar.',
       'Accepts or conceals a safety-relevant breach of the rules; exceeds their mandate; cannot account for their responsibility.'),
      ('Agerar utan att identifiera central risk eller mandat; låser sig vid första antagandet; saknar säkerhetsmarginal.',
       'Acts without identifying the central risk or their mandate; fixes on the first assumption; leaves no safety margin.'),
      ('Beskriver prestige, hot, förnedring, onödig konfrontation eller oproportionerligt agerande; saknar säkerhetstänk.',
       'Describes status-seeking, threats, humiliation, unnecessary confrontation or disproportionate action; shows no safety thinking.'),
      ('Går in i oklar risksituation utan relevant informationsinhämtning eller stöd; saknar avbrytandetröskel eller kommunikation.',
       'Enters an unclear risk situation without gathering relevant information or support; has no threshold for breaking off, and does not communicate.'),
      ('Ger efter för kritisk säkerhetsregel eller bemöter personen respektlöst/avvisande utan att försöka lösa situationen.',
       'Gives way on a critical safety rule, or treats the person disrespectfully or dismissively without trying to resolve the situation.'),
      ('Informationen är osammanhängande, spekulativ eller saknar kritiska fakta; mottagaren kan inte agera säkert.',
       'The information is incoherent, speculative or missing critical facts; the recipient cannot act safely on it.'),
      ('Missar eller bortförklarar tydliga signaler; agerar impulsivt eller utan relevant kontroll; eget agerande kan ha ökat risken.',
       'Misses or explains away clear signals; acts impulsively or without relevant checks; their own action may have increased the risk.'),
      ('Släpper in utan kontroll, improviserar mandat eller trappar upp konflikten i onödan.',
       'Lets someone through without checking, improvises a mandate, or escalates the conflict unnecessarily.'),

      ('Behåller i huvudsak lugnet men förklarar begränsat hur beteendet anpassades; gränser, avstånd eller stödresurser är otydliga.',
       'Largely stays calm but explains little about how they adapted their behaviour; boundaries, distance or support resources are unclear.'),
      ('Fattar ett begripligt beslut men redogör svagt för alternativ, osäkerhet, stödresurser eller omprövning.',
       'Makes an understandable decision but accounts weakly for alternatives, uncertainty, support resources or reconsideration.'),
      ('Grundläggande fakta finns men struktur, precision, källskillnad eller kontroll av förståelse är begränsad.',
       'The basic facts are there, but structure, precision, separating observation from source, or checking that they were understood, is limited.'),
      ('Håller i huvudsak gränsen men kommunikationen eller alternativet är begränsat; relationen hanteras reaktivt.',
       'Largely holds the boundary, but the communication or the alternative offered is limited; the relationship is handled reactively.'),
      ('Identifierar en avvikelse men beskrivningen av kontroll, prioritering eller eget ansvar är begränsad; åtgärden är huvudsakligen reaktiv.',
       'Identifies a deviation, but describes checks, prioritisation or their own responsibility only briefly; the action taken is mainly reactive.'),
      ('Identifierar risk och söker visst stöd men prioritering, alternativa vägar, lägesrapport eller omprövning är ofullständig.',
       'Identifies the risk and seeks some support, but prioritisation, alternative routes, situation reporting or reconsideration is incomplete.'),
      ('Stoppar eller fördröjer passagen men processen, kommunikationen eller alternativet är otydligt; begränsad dokumentation.',
       'Stops or delays entry, but the process, the communication or the alternative is unclear; documentation is limited.'),
      ('Vill göra rätt men är osäker på regel, dokumentation eller eskalering; utfallet beror delvis på andra.',
       'Wants to do the right thing but is unsure of the rule, the documentation or the escalation route; the outcome depends partly on others.'),

      ('Förhindrar obehörig passage, kontrollerar enligt rutin, kommunicerar lugnt, erbjuder behörig lösning och dokumenterar/eskalerar vid behov.',
       'Prevents unauthorised entry, checks according to procedure, communicates calmly, offers a properly authorised solution, and documents or escalates where needed.'),
      ('Ger en saklig, kronologisk och relevant redogörelse, skiljer observation från tolkning och anpassar till mottagarens behov.',
       'Gives a factual, chronological and relevant account, separates observation from interpretation, and adapts it to what the recipient needs.'),
      ('Håller säkerhetsgränsen, förklarar sakligt och respektfullt, erbjuder ett möjligt alternativ och bevarar professionellt samarbete.',
       'Holds the safety boundary, explains it factually and respectfully, offers a workable alternative, and preserves a professional working relationship.'),
      ('Identifierar relevant avvikelse, kontrollerar centrala fakta, prioriterar rimligt och vidtar en säker, proportionerlig åtgärd med tydligt eget ansvar.',
       'Identifies the relevant deviation, checks the central facts, prioritises reasonably, and takes a safe, proportionate action with clear ownership of their own part.'),
      ('Identifierar relevant regel och mandat, kommunicerar sakligt, står emot otillbörlig påverkan och dokumenterar/eskalerar korrekt.',
       'Identifies the relevant rule and mandate, communicates factually, resists improper pressure, and documents or escalates correctly.'),
      ('Kommunicerar lugnt och respektfullt, sätter tydliga gränser, bevarar säkerhet och använder stöd/eskalering proportionerligt.',
       'Communicates calmly and respectfully, sets clear boundaries, keeps the situation safe, and uses support or escalation proportionately.'),
      ('Prioriterar omedelbar säkerhet, väljer proportionerlig åtgärd, använder tillgängligt stöd och omprövar när ny information kommer.',
       'Prioritises immediate safety, chooses a proportionate action, uses the support available, and reconsiders when new information arrives.'),
      ('Prioriterar säkerhet, inhämtar information, kommunicerar läge, använder stödresurser och väljer/ändrar åtgärd utifrån tydliga risktrösklar.',
       'Prioritises safety, gathers information, communicates the situation, uses support resources, and chooses or changes the action against clear risk thresholds.'),

      ('Arbetar systematiskt, söker motstridig information, förutser följdrisker, skapar säkerhetsmarginal och delar lärande som förbättrar förebyggandet.',
       'Works systematically, actively seeks information that contradicts them, anticipates knock-on risks, builds in a safety margin, and shares learning that improves prevention.'),
      ('Bygger en sammanhängande plan med reservväg, fortlöpande lägesbild, definierade beslutspunkter och säker överlämning; undviker både passivitet och onödig exponering.',
       'Builds a coherent plan with a fallback route, a continuously updated picture of the situation, defined decision points and a safe handover; avoids both passivity and unnecessary exposure.'),
      ('Förutser intressekonflikten, samordnar lösning med rätt funktion, minskar friktion utan regelavsteg och skapar förbättring som förebygger upprepning.',
       'Anticipates the conflict of interest, coordinates a solution with the right function, reduces friction without departing from the rules, and creates an improvement that prevents a repeat.'),
      ('Hanterar flera samtidiga risker, bygger redundans, kommunicerar beslut och trösklar tydligt samt skapar en kontrollerad övergång när läget förändras.',
       'Handles several simultaneous risks, builds in redundancy, communicates decisions and thresholds clearly, and creates a controlled transition when the situation changes.'),
      ('Hanterar komplex målkonflikt öppet, söker behörigt stöd, skyddar både säkerhet och relation samt bidrar till att rutinen förbättras.',
       'Handles a complex conflict of goals openly, seeks properly authorised support, protects both safety and the relationship, and contributes to improving the procedure.'),
      ('Hanterar samtidigt kö, social press och relation; samordnar verifiering effektivt, skyddar integritet och lämnar tydlig återkoppling för förebyggande förbättring.',
       'Handles the queue, the social pressure and the relationship at once; coordinates verification efficiently, protects privacy, and gives clear feedback that leads to preventive improvement.'),
      ('Läser förändringar över tid, anpassar strategi utan att tappa mandat, skapar valmöjligheter, förebygger smittoeffekt och reflekterar nyanserat över resultatet.',
       'Reads how the situation changes over time, adapts their approach without losing their mandate, creates options, prevents the situation spreading, and reflects on the outcome with nuance.'),
      ('Skapar mycket hög spårbarhet, identifierar osäkerhet och kvarstående risk, kvalitetssäkrar mottagandet och förbättrar senare rapporteringspraxis.',
       'Creates a very high level of traceability, names the uncertainty and the risk that remains, checks the account was received and understood, and improves reporting practice afterwards.')
    ) AS v(sv, en)
  LOOP
    UPDATE public.scp_interview_rating_anchors
       SET anchor_en = _pair.en
     WHERE anchor_sv = _pair.sv AND anchor_en IS NULL;
    _offered := _offered + 1;
  END LOOP;

  RAISE NOTICE 'SCP_IV_ANCHOR_EN: % translations offered.', _offered;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- Self-check: the copy an interviewer holds an account against must read in
-- both languages, and must still say nothing new.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _missing integer; _levels integer;
BEGIN
  SELECT count(*) INTO _missing FROM public.scp_interview_rating_anchors
   WHERE label_en IS NULL OR btrim(label_en) = ''
      OR anchor_en IS NULL OR btrim(anchor_en) = '';
  IF _missing > 0 THEN
    RAISE EXCEPTION
      'SCP_IV_ANCHOR_EN: % anchor(s) still have no English. An anchor that '
      'cannot be read is not an anchor.', _missing;
  END IF;

  -- Translation only: five levels in, five levels out, and level 0 still
  -- excluded from aggregation.
  SELECT count(DISTINCT level) INTO _levels FROM public.scp_interview_rating_anchors;
  IF _levels <> 5 THEN
    RAISE EXCEPTION 'SCP_IV_ANCHOR_EN: expected 5 levels, found %.', _levels;
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_interview_rating_anchors
              WHERE level = 0 AND counts_toward_aggregation) THEN
    RAISE EXCEPTION 'SCP_IV_ANCHOR_EN: level 0 must never count toward aggregation.';
  END IF;

  RAISE NOTICE 'SCP_IV_ANCHOR_EN: every behavioural anchor reads in both languages.';
END $$;
