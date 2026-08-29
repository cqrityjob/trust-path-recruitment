-- ============================================================================
-- The interviewer's guidance and boundaries, in English too
-- ============================================================================
--
-- Owner UAT, finding B: English mode still showed Swedish on the real routed
-- journey. The audit separated four kinds of Swedish text on those screens:
--
--   1. LOCKED PACK CONTENT — Q1-Q8, the approved probes, the behavioural
--      anchors. Deliberately NOT translated: they are pinned to the package
--      version and "Q1-Q8 must never be rewritten" includes by translation.
--      The interview screen already tells an English reader this in English.
--   2. USER DATA — employer name, case title, candidate reference, the
--      evidence quote, the assessor's own reasoning. Never translated.
--   3. UI CHROME — fixed in the component layer, not here.
--   4. GOVERNED GUIDANCE the interviewer is meant to READ AND FOLLOW. That is
--      this migration, and it is the category that actually leaked:
--
--        * the 14 prohibited areas   — the "what may not be concluded"
--                                      boundary, and the single most
--                                      important text on the screen
--        * the 17 method practices   — PEACE guidance for the interviewer
--        * the 40 evidence dimensions — "what to listen for" labels
--        * the preparation plan's AI disclosure — system-generated, and
--          written in Swedish by the manual-preparation RPC
--
-- A boundary nobody can read is not a boundary. Swedish remains authoritative
-- throughout; English is a faithful rendering, never a second definition. No
-- prohibition, practice, dimension or claim is added, removed or reworded.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- S1. Columns. Practices and dimensions already had one; prohibited areas and
--     the prep plan's disclosure did not.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scp_interview_prohibited_areas
  ADD COLUMN statement_en text;

COMMENT ON COLUMN public.scp_interview_prohibited_areas.statement_en IS
  'English rendering of statement_sv. The Swedish column stays authoritative; '
  'this exists so the prohibition is legible to an English-reading '
  'interviewer, not so it can be stated differently.';

ALTER TABLE public.scp_interview_prep_plans
  ADD COLUMN ai_disclosure_en text;

COMMENT ON COLUMN public.scp_interview_prep_plans.ai_disclosure_en IS
  'English rendering of ai_disclosure. Both are frozen on the plan: what was '
  'disclosed at approval time must remain readable afterwards in either '
  'language.';


-- ────────────────────────────────────────────────────────────────────────────
-- S2. The fourteen prohibited areas. Matched on the Swedish statement, so a
--     reworded prohibition is left untranslated and VISIBLE rather than
--     silently mismatched to the wrong English.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _p record; _hit integer := 0;
BEGIN
  FOR _p IN SELECT * FROM (VALUES
    ('Ingen lögndetektor, trovärdighetsbedömning eller bedrägeriskattning.',
     'No lie detection, credibility scoring or deception estimation.'),
    ('Ingen analys av ansikte, blick, röst, känsloläge eller stressnivå.',
     'No analysis of face, gaze, voice, emotional state or stress level.'),
    ('Ingen personlighetstolkning eller culture fit-modell.',
     'No personality interpretation and no culture-fit model.'),
    ('Ingen slutsats om skyddade egenskaper från språk, brytning, namn, bild eller beteende.',
     'No conclusion about protected characteristics from language, accent, name, photograph or behaviour.'),
    ('Nervositet, tystnad, språkvariation, funktionsnedsättning eller begärd anpassning får aldrig sänka bedömningen.',
     'Nervousness, silence, language variation, disability or a requested adjustment must never lower the assessment.'),
    ('Ingen automatisk totalpoäng, viktning, rangordning eller anställningsrekommendation.',
     'No automatic total score, weighting, ranking or hiring recommendation.'),
    ('AI får markera evidensgap men aldrig poängsätta, rangordna eller rekommendera anställning.',
     'AI may flag gaps in the evidence but must never score, rank or recommend hiring.'),
    ('AI får inte skriva om eller ersätta kärnfrågorna, och får inte generera följdfrågor utanför de godkända.',
     'AI must not rewrite or replace the core questions, and must not generate follow-up questions outside the approved set.'),
    ('Intervjuuppgifter överförs aldrig automatiskt till Security Passport.',
     'Interview data is never transferred automatically to the Security Passport.'),
    ('Ledande följdfrågor är inte tillåtna, till exempel "Du ringde väl polisen direkt?".',
     'Leading follow-up questions are not permitted, for example "You called the police straight away, didn''t you?".'),
    ('Anklagande följdfrågor före klarlagda fakta är inte tillåtna, till exempel "Varför följde du inte reglerna?".',
     'Accusatory follow-up questions before the facts are established are not permitted, for example "Why didn''t you follow the rules?".'),
    ('Trovärdighetsbedömande kommentarer är inte tillåtna, till exempel "Det låter inte sant.".',
     'Comments that judge credibility are not permitted, for example "That doesn''t sound true.".'),
    ('Skyddade eller irrelevanta personuppgifter utan tydlig koppling till arbetet får inte efterfrågas.',
     'Protected or irrelevant personal data with no clear connection to the work must not be requested.'),
    ('Hypotetiska tvångs- eller våldsscenarier som premierar aggressivitet framför säkerhet och mandat får inte användas.',
     'Hypothetical coercion or violence scenarios that reward aggression over safety and mandate must not be used.')
  ) AS v(sv, en) LOOP
    UPDATE public.scp_interview_prohibited_areas
       SET statement_en = _p.en
     WHERE statement_sv = _p.sv AND statement_en IS NULL;
    IF FOUND THEN _hit := _hit + 1; END IF;
  END LOOP;
  RAISE NOTICE 'SCP_IV_EN: % prohibited area(s) translated.', _hit;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- S3. The method practices — what the interviewer should DO at each stage.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _p record; _hit integer := 0;
BEGIN
  FOR _p IN SELECT * FROM (VALUES
    ('Rätt rollpaketsversion vald och godkänd intervjuplan finns.',
     'The correct role package version is selected and an approved interview plan exists.'),
    ('Vi ställer samma kärnfrågor till alla kandidater för den här tjänsten. Vi vill förstå konkreta situationer, vad du själv gjorde och vad resultatet blev.',
     'We ask every candidate for this role the same core questions. We want to understand concrete situations, what you yourself did, and what the outcome was.'),
    ('Låt kandidaten tala färdigt innan du ställer följdfrågor.',
     'Let the candidate finish speaking before you ask follow-up questions.'),
    ('Sammanfatta fakta och låt kandidaten korrigera dig.',
     'Summarise the facts and let the candidate correct you.'),
    ('Ställde jag alla kärnfrågor i rätt ordning, och dokumenterade jag varje avvikelse?',
     'Did I ask every core question in the right order, and did I document each deviation?'),
    ('Bygg kontakt innan redogörelsen; en trygg kandidat berättar mer konkret.',
     'Build rapport before the account; a candidate who feels safe gives a more concrete account.'),
    ('Var mitt bemötande respektfullt och autonomistödjande genom hela intervjun?',
     'Was my manner respectful and autonomy-supporting throughout the interview?'),
    ('Använd endast godkända följdfrågor och notera vilken du använde.',
     'Use only approved follow-up questions, and note which one you used.'),
    ('Anpassningar och tekniska förutsättningar kontrollerade.',
     'Adjustments and technical arrangements have been checked.'),
    ('Spegla tillbaka det du hört och be om bekräftelse innan du går vidare.',
     'Reflect back what you heard and ask for confirmation before moving on.'),
    ('Vi använder ett AI-stöd för att strukturera underlaget, men det är människor som bedömer och fattar beslut.',
     'We use AI assistance to structure the material, but people do the assessing and make the decisions.'),
    ('Bedömde jag mot ankaret och citerad evidens, inte mot mitt första intryck?',
     'Did I assess against the behavioural example and the cited evidence, rather than against my first impression?'),
    ('Fråga om något relevant saknas som du inte hunnit fråga om.',
     'Ask whether anything relevant is missing that you have not had time to ask about.'),
    ('Tolka inte nervositet, tystnad, språkvariation eller begärd anpassning som information om kandidaten.',
     'Do not read nervousness, silence, language variation or a requested adjustment as information about the candidate.'),
    ('Undvik konfrontation, prestige och pressande upprepning. Det ger sämre underlag, inte bättre.',
     'Avoid confrontation, point-scoring and pressured repetition. They produce worse material, not better.'),
    ('Bedömare känner inte till varandras kommande bedömningar.',
     'Assessors do not know each other''s forthcoming assessments.'),
    ('Säg att kandidaten när som helst kan be dig upprepa eller förklara en fråga.',
     'Say that the candidate may ask you to repeat or explain a question at any time.')
  ) AS v(sv, en) LOOP
    UPDATE public.scp_interview_method_practices
       SET statement_en = _p.en
     WHERE statement_sv = _p.sv AND statement_en IS NULL;
    IF FOUND THEN _hit := _hit + 1; END IF;
  END LOOP;
  RAISE NOTICE 'SCP_IV_EN: % method practice(s) translated.', _hit;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- S4. The evidence dimensions — the "what to listen for" labels.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _p record; _hit integer := 0;
BEGIN
  FOR _p IN SELECT * FROM (VALUES
    ('Alternativ', 'Alternatives'),
    ('Alternativ lösning', 'Alternative solution'),
    ('Avstånd/stöd', 'Distance/backup'),
    ('Behovsbild', 'Assessment of need'),
    ('Dokumentation/eskalering', 'Documentation/escalation'),
    ('Effekt', 'Effect'),
    ('Egen säkerhet/ensamarbete', 'Own safety/lone working'),
    ('Fakta/tolkning', 'Fact vs interpretation'),
    ('Gränssättning', 'Setting boundaries'),
    ('Informationsinhämtning', 'Gathering information'),
    ('Intressekonflikt', 'Conflict of interest'),
    ('Konsekvens', 'Consequence'),
    ('Kontroll av antaganden', 'Checking assumptions'),
    ('Kontroll före passage', 'Check before granting entry'),
    ('Lägesrapport', 'Situation report'),
    ('Likvärdig regel', 'Equal application of the rule'),
    ('Lugn gränssättning', 'Calm boundary setting'),
    ('Lugn kommunikation', 'Calm communication'),
    ('Mandatgräns', 'Limits of mandate'),
    ('Mottagaranpassning', 'Adapting to the listener'),
    ('Omprövning', 'Reconsideration'),
    ('Osäkerhet', 'Uncertainty'),
    ('Proportionerlig åtgärd', 'Proportionate action'),
    ('Relevans', 'Relevance'),
    ('Relevant regel', 'Relevant rule'),
    ('Respektfull förklaring', 'Respectful explanation'),
    ('Resultat/reflektion', 'Outcome/reflection'),
    ('Riskbedömning', 'Risk assessment'),
    ('Riskprioritering', 'Prioritising risk'),
    ('Riskprioritet', 'Risk priority'),
    ('Säkerhetsgräns', 'Safety limit'),
    ('Säkert alternativ', 'Safe alternative'),
    ('Samarbete', 'Cooperation'),
    ('Specifik signal/avvikelse', 'Specific signal/anomaly'),
    ('Stöd/eskalering', 'Backup/escalation'),
    ('Stödresurser', 'Support resources'),
    ('Tidslinje', 'Timeline'),
    ('Transparens/rapportering', 'Transparency/reporting'),
    ('Trösklar för avbrytande', 'Thresholds for stopping')
  ) AS v(sv, en) LOOP
    UPDATE public.scp_interview_evidence_dimensions
       SET label_en = _p.en
     WHERE label_sv = _p.sv AND label_en IS NULL;
    IF FOUND THEN _hit := _hit + 1; END IF;
  END LOOP;
  RAISE NOTICE 'SCP_IV_EN: % evidence dimension(s) translated.', _hit;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- S5. The preparation plan's disclosure, in both languages from now on.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.scp_interview_prep_plans
   SET ai_disclosure_en =
     'No AI assistance was used for this material. The interviewer prepared the '
     'interview themselves from the governed role package. The questions, approved '
     'follow-up questions and behavioural examples come unchanged from the package version.'
 WHERE ai_disclosure_en IS NULL
   AND ai_disclosure LIKE 'Inget AI-stöd%';

UPDATE public.scp_interview_prep_plans
   SET ai_disclosure_en =
     'AI assistance structured this material. People assess and decide. AI has not '
     'scored, ranked or recommended any candidate.'
 WHERE ai_disclosure_en IS NULL;

ALTER TABLE public.scp_interview_prep_plans
  ALTER COLUMN ai_disclosure_en SET DEFAULT
    'AI assistance structured this material. People assess and decide. AI has not '
    'scored, ranked or recommended any candidate.';

-- The manual path writes both languages from here on.
CREATE OR REPLACE FUNCTION public.scp_iv_record_manual_prep_plan(
  _case_id uuid,
  _time_plan text DEFAULT NULL,
  _opening_guidance text DEFAULT NULL,
  _closing_guidance text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan_id uuid; _next integer; _status text;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO _status FROM public.scp_interview_cases WHERE id = _case_id;
  IF _status IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _status <> 'sources_ready' THEN
    RAISE EXCEPTION
      'SCP_IV_SOURCES_NOT_READY: preparation is recorded once the sources are marked ready. This case is "%".',
      _status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_interview_prep_plans
     SET status = 'superseded', updated_at = now()
   WHERE case_id = _case_id AND status = 'draft';

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_interview_prep_plans WHERE case_id = _case_id;

  INSERT INTO public.scp_interview_prep_plans
    (case_id, ai_run_id, version_number, status, time_plan,
     opening_guidance, closing_guidance, ai_disclosure, ai_disclosure_en)
  VALUES
    (_case_id, NULL, _next, 'draft', _time_plan,
     _opening_guidance, _closing_guidance,
     'Inget AI-stöd har använts för det här underlaget. Intervjuaren har förberett '
     'intervjun själv utifrån det styrda rollpaketet. Frågor, godkända följdfrågor '
     'och beteendeexempel kommer oförändrade från paketversionen.',
     'No AI assistance was used for this material. The interviewer prepared the '
     'interview themselves from the governed role package. The questions, approved '
     'follow-up questions and behavioural examples come unchanged from the package version.')
  RETURNING id INTO _plan_id;

  PERFORM public.scp_iv_set_case_status(_case_id, 'prep_generated');
  PERFORM public.scp_iv_record_event(_case_id, 'prep_generated', 'human', NULL,
    'sources_ready', 'prep_generated',
    'Manuell förberedelse utan AI-stöd.',
    jsonb_build_object('plan_id', _plan_id, 'version_number', _next, 'ai_assisted', false));

  RETURN _plan_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_manual_prep_plan(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_manual_prep_plan(uuid, text, text, text)
  TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- S6. Self-check. Every piece of guidance the interviewer must READ has to
--     exist in both languages; locked pack content deliberately does not.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_interview_prohibited_areas
   WHERE statement_en IS NULL OR btrim(statement_en) = '';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_IV_EN: % prohibited area(s) have no English statement.', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_method_practices
   WHERE statement_en IS NULL OR btrim(statement_en) = '';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_IV_EN: % method practice(s) have no English statement.', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_evidence_dimensions
   WHERE label_en IS NULL OR btrim(label_en) = '';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_IV_EN: % evidence dimension(s) have no English label.', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_prep_plans
   WHERE ai_disclosure_en IS NULL OR btrim(ai_disclosure_en) = '';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_IV_EN: % preparation plan(s) have no English disclosure.', _n;
  END IF;

  -- And the locked content is deliberately still untranslated, so nobody can
  -- later mistake this migration for permission to translate Q1-Q8.
  SELECT count(*) INTO _n FROM public.scp_interview_core_questions
   WHERE prompt_en IS NOT NULL AND btrim(prompt_en) <> '';
  IF _n > 0 THEN
    RAISE EXCEPTION
      'SCP_IV_EN: % core question(s) carry an English prompt. Q1-Q8 are pinned to the package version and must never be rewritten, including by translation.', _n;
  END IF;

  RAISE NOTICE 'SCP_IV_EN: guidance and boundaries read in both languages; locked pack content untouched.';
END $$;
