-- Phase 1G-b — Learning Mode counterparts and rubric anchor completion. DRAFT ONLY.
--
-- Fourteen items were marked separate_learning_counterpart_required in 1G-a.
-- Counterparts are authored here as SEPARATE item versions in learning mode:
-- different setting, actors and details, same competence and professional error.
-- No Assessment Mode item version is reused or exposed.

-- =========================================================================
-- SECTION 1 — Learning Mode counterparts
-- =========================================================================
--
-- Each counterpart teaches the same behaviour through a DIFFERENT situation.
-- Cosmetic rewording of the protected item would defeat the whole separation.

INSERT INTO public.scp_items (slug)
SELECT 'sg-l-' || substr(i.slug, 6)
FROM public.scp_item_versions iv
JOIN public.scp_items i ON i.id = iv.item_id
WHERE i.slug LIKE 'sg-b-%'
  AND iv.learning_counterpart_decision = 'separate_learning_counterpart_required'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_item_versions
  (item_id, version_number, content_status, validation_status, item_format,
   competency_id, primary_behaviour_id, mode, observable_behavior, response_process,
   market, jurisdiction_id, difficulty, cognitive_demand, primary_construct,
   tests_what, is_safety_critical, authored_by_ai,
   work_context_sv, information_available_sv, information_withheld_sv,
   legal_assumption_sv, overgeneralisation_guard_sv, depends_on_employer_instruction)
SELECT li.id, 1, 'draft', 'design', a.item_format,
       a.competency_id, a.primary_behaviour_id, 'learning',
       a.observable_behavior, 'Övning med återkoppling',
       'SE', a.jurisdiction_id, a.difficulty, a.cognitive_demand, a.primary_construct,
       a.tests_what, a.is_safety_critical, true,
       a.work_context_sv, a.information_available_sv, a.information_withheld_sv,
       a.legal_assumption_sv, a.overgeneralisation_guard_sv,
       a.depends_on_employer_instruction
FROM public.scp_item_versions a
JOIN public.scp_items ai ON ai.id = a.item_id
JOIN public.scp_items li ON li.slug = 'sg-l-' || substr(ai.slug, 6)
WHERE ai.slug LIKE 'sg-b-%'
  AND a.learning_counterpart_decision = 'separate_learning_counterpart_required'
ON CONFLICT (item_id, version_number) DO NOTHING;

-- Link each assessment item to its counterpart. The guard from 1F-a requires
-- the target to be a learning-mode item.
UPDATE public.scp_item_versions a
   SET learning_counterpart_id = l.id
FROM public.scp_items ai, public.scp_items li, public.scp_item_versions l
WHERE a.item_id = ai.id AND ai.slug LIKE 'sg-b-%'
  AND li.slug = 'sg-l-' || substr(ai.slug, 6)
  AND l.item_id = li.id AND l.version_number = 1
  AND a.learning_counterpart_decision = 'separate_learning_counterpart_required';

-- Counterpart scenarios: a DIFFERENT setting for the same behaviour.
INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
SELECT l.id, v.lang, 'adaptation_pending', v.sc, v.pr
FROM (VALUES
 ('sg-l-02','sv-SE','Du bevakar ett kontorshus med tillträdeskontroll efter klockan 18. En person går mot hissarna med en laptopväska.','Vad gör du? Du får återkoppling efteråt.'),
 ('sg-l-02','en-GB','You patrol an office building with access control after 18:00. A person walks towards the lifts carrying a laptop bag.','What do you do? You will get feedback afterwards.'),
 ('sg-l-03','sv-SE','En person sitter hopsjunken på en bänk i ett köpcentrum och svarar långsamt när du tilltalar hen.','Vad gör du?'),
 ('sg-l-03','en-GB','A person is slumped on a bench in a shopping centre and responds slowly when you speak to them.','What do you do?'),
 ('sg-l-04','sv-SE','Du ser något som kan vara en vara stoppas i en väska, men en hylla skymmer sikten i ett par sekunder.','Vad gör du?'),
 ('sg-l-04','en-GB','You see what might be an item put into a bag, but a shelf blocks your view for a couple of seconds.','What do you do?'),
 ('sg-l-05','sv-SE','En hantverkare säger att hen ska in i ett förråd och att beställaren glömt ordna nyckel.','Vad gör du?'),
 ('sg-l-05','en-GB','A contractor says they need access to a storeroom and that the client forgot to arrange a key.','What do you do?'),
 ('sg-l-06','sv-SE','En försäkringshandläggare ringer och vill ha uppgifter ur din incidentrapport.','Vad gör du?'),
 ('sg-l-06','en-GB','An insurance handler calls asking for details from your incident report.','What do you do?'),
 ('sg-l-09','sv-SE','En kund är upprörd över ett beslut som butikschefen fattat och vänder sig till dig.','Vad gör du?'),
 ('sg-l-09','en-GB','A customer is upset about a decision the store manager made and turns to you.','What do you do?'),
 ('sg-l-10','sv-SE','Vid en utrymningsövning börjar folk samlas tätt vid en dörr som öppnas långsamt.','Vad gör du först?'),
 ('sg-l-10','en-GB','During an evacuation drill people bunch up at a door that opens slowly.','What do you do first?'),
 ('sg-l-11','sv-SE','Ett brandlarm och ett dörrlarm utlöser med tio sekunders mellanrum. Ni är två i tjänst.','Hur agerar du?'),
 ('sg-l-11','en-GB','A fire alarm and a door alarm trigger ten seconds apart. Two of you are on duty.','How do you act?'),
 ('sg-l-12','sv-SE','En bekant utanför arbetet frågar vad som hände vid en händelse hen hört talas om.','Vad gör du?'),
 ('sg-l-12','en-GB','An acquaintance outside work asks what happened in an incident they heard about.','What do you do?'),
 ('sg-l-13','sv-SE','En person står länge vid en bankomat utan att använda den och tittar sig omkring.','Vilken åtgärd är mest respektive minst effektiv?'),
 ('sg-l-13','en-GB','A person stands for a long time by a cash machine without using it, looking around.','Which action is most, and which least, effective?'),
 ('sg-l-14','sv-SE','En förälder blir högljudd i en receptionskö efter lång väntan.','Vilken åtgärd är mest respektive minst effektiv?'),
 ('sg-l-14','en-GB','A parent becomes loud in a reception queue after a long wait.','Which action is most, and which least, effective?'),
 ('sg-l-15','sv-SE','En hyresgäst ber dig hämta ett paket i en annan byggnad under ditt pass.','Vilken åtgärd är mest respektive minst effektiv?'),
 ('sg-l-15','en-GB','A tenant asks you to collect a parcel in another building during your shift.','Which action is most, and which least, effective?'),
 ('sg-l-16','sv-SE','Du hittar en uppbruten container på området klockan 04.00.','Skriv dina tre första åtgärder, i prioritetsordning.'),
 ('sg-l-16','en-GB','You find a forced container on site at 04:00.','Write your first three actions, in priority order.'),
 ('sg-l-17','sv-SE','Ett rörelselarm har utlöst tre gånger under natten i samma korridor.','Skriv en kort överlämning till din avlösare.'),
 ('sg-l-17','en-GB','A motion alarm triggered three times overnight in the same corridor.','Write a short handover for your relief.'),
 ('sg-l-18','sv-SE','En journalist ringer och frågar om en händelse på objektet.','Skriv hur du svarar.'),
 ('sg-l-18','en-GB','A journalist calls asking about an incident at the site.','Write how you respond.')
) AS v(slug,lang,sc,pr)
JOIN public.scp_items li ON li.slug = v.slug
JOIN public.scp_item_versions l ON l.item_id = li.id AND l.version_number = 1
ON CONFLICT DO NOTHING;

-- =========================================================================
-- SECTION 2 — Rubric anchor completion
-- =========================================================================
--
-- Every constructed-response rubric needs all four anchor types. Phase 1F left
-- sg-cr-17 and sg-cr-18 short of a full set.

INSERT INTO public.scp_anchor_responses
  (rubric_dimension_id, anchor_type, level, language, response_text, rationale)
SELECT d.id, v.atype, v.lvl, 'sv-SE', v.txt, v.rat
FROM (VALUES
 ('sg-cr-16-first-actions','decision_quality','borderline',2,
  'Ett välskrivet stycke om vikten av säkerhet, utan att ange någon konkret åtgärd.',
  'Polerat men substanslöst: språket höjer inte poängen.'),
 ('sg-cr-17-handover','completeness','positive',4,
  'Dörrlarm 01.12 och 03.40, samma lastport. Inget synligt fel. Båda dokumenterade. Kontrollera igen vid nästa rond.',
  'Kort, osminkat och operativt komplett — full poäng utan polerat språk.'),
 ('sg-cr-17-handover','decision_quality','contraindication',NULL,
  'Inget särskilt att rapportera.',
  'Motsäger det som faktiskt hänt; avlösaren vilseleds.'),
 ('sg-cr-18-information','decision_quality','positive',4,
  'Jag kan inte lämna uppgifter. Jag hänvisar dig till vår arbetsledning som kan pröva din begäran.',
  'Håller tystnadsplikt och anvisar en faktisk väg vidare.'),
 ('sg-cr-18-information','communication','contraindication',NULL,
  'Det angår inte dig.',
  'Onödigt avvisande; bemötandet brister utan att sekretessen stärks.'),
 ('sg-cr-18-information','clarity','borderline',2,
  'Ett artigt och välformulerat svar som aldrig säger om uppgifter kan lämnas eller inte.',
  'Polerat men operativt oklart — stil kompenserar inte utebliven tydlighet.')
) AS v(rslug,dkey,atype,lvl,txt,rat)
JOIN public.scp_rubrics r ON r.slug = v.rslug
JOIN public.scp_rubric_versions rv ON rv.rubric_id = r.id AND rv.version_number = 1
JOIN public.scp_rubric_dimensions d ON d.rubric_version_id = rv.id AND d.dimension_key = v.dkey
ON CONFLICT DO NOTHING;

-- Review requirements for the Learning Mode drafts too.
INSERT INTO public.scp_review_requirements (item_version_id, review_type, required, reason)
SELECT l.id, v.rt, true, v.reason
FROM public.scp_item_versions l
JOIN public.scp_items li ON li.id = l.item_id
CROSS JOIN (VALUES
 ('security_sme','Övningsscenariots realism måste bekräftas av verksam säkerhetsexpert.'),
 ('language','Svensk och engelsk formulering behöver språkgranskas.'),
 ('accessibility','Läsbarhet och kognitiv belastning behöver granskas.')
) AS v(rt,reason)
WHERE li.slug LIKE 'sg-l-%'
ON CONFLICT (item_version_id, review_type) DO NOTHING;

-- =========================================================================
-- SECTION 3 — Prove it
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  -- Every item requiring a counterpart has one, and it is a DIFFERENT version.
  SELECT count(*) INTO _n FROM public.scp_item_versions a
   JOIN public.scp_items ai ON ai.id = a.item_id
   WHERE ai.slug LIKE 'sg-b-%'
     AND a.learning_counterpart_decision = 'separate_learning_counterpart_required'
     AND (a.learning_counterpart_id IS NULL OR a.learning_counterpart_id = a.id);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1G_COUNTERPARTS_MISSING: % items lack a distinct counterpart', _n;
  END IF;

  -- No learning item reuses an assessment item version.
  SELECT count(*) INTO _n FROM public.scp_item_versions l
   JOIN public.scp_items li ON li.id = l.item_id
   WHERE li.slug LIKE 'sg-l-%' AND l.mode <> 'learning';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1G_COUNTERPART_MODE: % counterparts are not learning-mode', _n;
  END IF;

  -- No counterpart shares a scenario string with its protected original.
  SELECT count(*) INTO _n FROM public.scp_item_texts lt
   JOIN public.scp_item_versions l ON l.id = lt.item_version_id
   JOIN public.scp_items li ON li.id = l.item_id
   JOIN public.scp_items ai ON ai.slug = 'sg-b-' || substr(li.slug, 6)
   JOIN public.scp_item_versions a ON a.item_id = ai.id AND a.version_number = 1
   JOIN public.scp_item_texts at ON at.item_version_id = a.id AND at.language = lt.language
   WHERE li.slug LIKE 'sg-l-%' AND btrim(lt.scenario) = btrim(at.scenario);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1G_COUNTERPART_IS_COPY: % counterparts copy the protected scenario', _n;
  END IF;

  -- All four anchor types on every constructed-response rubric.
  SELECT count(*) INTO _n FROM public.scp_rubric_versions rv
   JOIN public.scp_rubrics r ON r.id = rv.rubric_id
   WHERE r.slug LIKE 'sg-cr-%'
     AND (SELECT count(DISTINCT a.anchor_type) FROM public.scp_anchor_responses a
           JOIN public.scp_rubric_dimensions d ON d.id = a.rubric_dimension_id
          WHERE d.rubric_version_id = rv.id) < 4;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1G_ANCHORS_INCOMPLETE: % rubrics lack all four anchor types', _n;
  END IF;

  -- Still draft, still nothing shipped.
  IF EXISTS (SELECT 1 FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
              WHERE (i.slug LIKE 'sg-b-%' OR i.slug LIKE 'sg-l-%') AND iv.content_status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.assessments WHERE employer_visible)
     OR EXISTS (SELECT 1 FROM public.scp_ai_providers WHERE is_enabled AND code <> 'null_provider')
     OR EXISTS (SELECT 1 FROM public.scp_item_texts WHERE adaptation_status <> 'adaptation_pending')
  THEN RAISE EXCEPTION 'SCP_P1G_BOUNDARY_BREACHED'; END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase1g', 'updated',
  'Phase 1G: candidate option text separated from internal scoring rationale on all 60 options; sg-b-02 rewritten so the preferred response rests on the assignment''s access-control condition rather than an invented coercive ID power; all 18 items classified by primary construct with legal assumption, employer-instruction dependency and overgeneralisation guard; 14 Learning Mode counterparts authored as separate item versions with different settings; rubric anchors completed to all four types. Draft only.',
  jsonb_build_object(
    'migration', '20260805100000_scp_phase1g_learning_and_anchors',
    'learning_counterparts', 14,
    'items_classified', 18,
    'adaptation_status', 'adaptation_pending',
    'content_status', 'draft'));
