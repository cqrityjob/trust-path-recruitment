-- #47 — One governed internal training fixture, and two corrections it exposed.
--
-- ── CORRECTION 1: A PROGRAMME KNOWS IT IS SCAFFOLDING ───────────────────
--
-- scp_employer_content_library decided whether a training programme was test
-- scaffolding by asking whether every assessment definition built on top of it
-- was a fixture. That worked for the one programme that existed, and it is the
-- wrong question: a programme is or is not scaffolding on its own terms, and a
-- programme with no assessment container at all derived `false` and would have
-- been presented to an employer as a real product.
--
-- scp_programs.is_test_fixture makes it a fact, backfilled from the old
-- derivation so no row changes section today.
--
-- ── CORRECTION 2: A LEARNING CONTAINER IS NOT AN ASSESSMENT ─────────────
--
-- scp_forms.assessment_version_id is NOT NULL, so a learning form has to hang
-- off an assessment version. That container is a structural necessity, not a
-- product, and the library was listing it in the Competence Assessments
-- section -- with an Assign button.
--
-- Assigning it would have been refused by scp_attempts_mode_matches_form,
-- because scp_employer_assign creates a mode='assessment' attempt and the
-- form's items are mode='learning'. So the library was advertising something
-- the engine refuses: precisely the class of disagreement the library exists to
-- prevent. Verified against fixture-learning-e2e, whose only form is learning.
--
-- The library now excludes assessment versions whose forms are exclusively
-- learning-mode. Nothing is hidden that an employer could ever have used.
--
-- ── THE FIXTURE ─────────────────────────────────────────────────────────
--
-- One synthetic internal programme, two modules, four synthetic learning items
-- with bilingual feedback, published so the closed-test journey can run
-- end-to-end and marked is_test_fixture so it presents as internal testing and
-- never as validated customer content.
--
-- Real Security Guard content is NOT touched. It stays draft, unpublished and
-- unassignable, per the locked decision.
--
-- Additive only. No existing row is deleted; no previously applied migration is
-- edited.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A programme knows whether it is scaffolding
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_programs
  ADD COLUMN IF NOT EXISTS is_test_fixture boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scp_programs.is_test_fixture IS
  'Synthetic internal material, never customer content. Presented under '
  '"Internal testing" whatever its content_status says, and never as validated.';

-- Backfill from the derivation the library used before, so that no programme
-- changes section as a result of this migration.
UPDATE public.scp_programs p
   SET is_test_fixture = true
 WHERE NOT p.is_test_fixture
   AND EXISTS (
     SELECT 1 FROM public.scp_program_versions pv
      WHERE pv.program_id = p.id
        AND EXISTS (SELECT 1 FROM public.scp_assessment_versions av
                      JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
                     WHERE av.program_version_id = pv.id AND d.is_test_fixture))
   AND NOT EXISTS (
     SELECT 1 FROM public.scp_program_versions pv
      JOIN public.scp_assessment_versions av ON av.program_version_id = pv.id
      JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
     WHERE pv.program_id = p.id AND NOT d.is_test_fixture);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The fixture content
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _jur uuid; _fam uuid; _role uuid;
  _beh_a uuid; _comp_a uuid; _beh_b uuid; _comp_b uuid;
  _prog uuid; _pver uuid; _def uuid; _aver uuid;
  _mod uuid; _mver_a uuid; _mver_b uuid;
  _form_a uuid; _form_b uuid; _item uuid; _iv uuid;
BEGIN
  SELECT id INTO _jur FROM public.scp_jurisdictions WHERE code = 'SE';
  SELECT id INTO _fam FROM public.scp_assessment_families
   WHERE product_type = 'development_programme' LIMIT 1;
  SELECT id INTO _role FROM public.scp_roles LIMIT 1;

  -- Two DIFFERENT behaviours, so completion writes evidence against more than
  -- one node of the graph and the neutrality proof is not trivially true.
  SELECT bv.id, cv.competency_id INTO _beh_a, _comp_a
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
   ORDER BY bv.created_at LIMIT 1;

  SELECT bv.id, cv.competency_id INTO _beh_b, _comp_b
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
   WHERE bv.id <> _beh_a
   ORDER BY bv.created_at LIMIT 1;
  IF _beh_b IS NULL THEN _beh_b := _beh_a; _comp_b := _comp_a; END IF;

  -- ── Programme ─────────────────────────────────────────────────────────
  INSERT INTO public.scp_programs (slug, role_id, is_test_fixture, display_name_sv, display_name_en)
  VALUES ('internal-dev-exercise-situational-reporting', _role, true,
          'Intern utvecklingsövning — Situation och rapportering',
          'Internal Development Exercise — Situational Awareness and Reporting')
  ON CONFLICT (slug) DO UPDATE
    SET is_test_fixture = true,
        display_name_sv = EXCLUDED.display_name_sv,
        display_name_en = EXCLUDED.display_name_en
  RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions
   WHERE program_id = _prog AND version_number = 1;

  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en,
       does_not_measure_sv, does_not_measure_en, published_at)
    VALUES
      (_prog, 1, _jur, 'published', 'design',
       'Intern utvecklingsövning — Situation och rapportering',
       'Internal Development Exercise — Situational Awareness and Reporting',
       'Att öva på att uppmärksamma vad som faktiskt händer i en situation och att rapportera det så att nästa person kan agera på det. Övningen är utvecklingsinriktad: den registrerar genomförd utveckling och fastställer inte yrkeskompetens.',
       'To practise noticing what is actually happening in a situation, and reporting it so the next person can act on it. This exercise is developmental: it records completed development and does not establish professional competence.',
       ARRAY['Yrkeskompetens', 'Laglig behörighet', 'Lämplighet för anställning', 'Rangordning mellan personer'],
       ARRAY['Professional competence', 'Legal authorisation', 'Suitability for employment', 'Ranking between people'],
       now())
    RETURNING id INTO _pver;
  END IF;

  -- ── The learning container. Structural: a form needs an assessment
  --    version. Excluded from the assessment section by section 3 below. ──
  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture,
     display_name_sv, display_name_en)
  VALUES
    (_fam, 'internal-dev-exercise-container',
     'Intern utvecklingsövning — behållare', 'Internal development exercise — container',
     'development_programme', true,
     'Intern utvecklingsövning — Situation och rapportering',
     'Internal Development Exercise — Situational Awareness and Reporting')
  ON CONFLICT (slug) DO UPDATE SET is_test_fixture = true
  RETURNING id INTO _def;

  SELECT id INTO _aver FROM public.scp_assessment_versions
   WHERE definition_id = _def AND version_number = 1;
  IF _aver IS NULL THEN
    INSERT INTO public.scp_assessment_versions
      (definition_id, version_number, content_status, validation_status,
       language_scope, program_version_id, notes)
    VALUES
      (_def, 1, 'draft', 'design', ARRAY['sv-SE','en-GB'], _pver,
       'Learning-mode container for the internal development exercise. Never served in Assessment Mode.')
    RETURNING id INTO _aver;
  END IF;

  -- ── Module A: situational awareness ───────────────────────────────────
  INSERT INTO public.scp_modules (slug) VALUES ('internal-dev-situational-awareness')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id INTO _mod;

  -- scp_forms.slug carries no unique constraint, so this is a lookup-then-insert
  -- rather than an upsert.
  SELECT id INTO _form_a FROM public.scp_forms WHERE slug = 'internal-dev-form-situational';
  IF _form_a IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en,
       target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_aver, 'internal-dev-form-situational', 'Situationsmedvetenhet', 'Situational awareness', 4, 8, false)
    RETURNING id INTO _form_a;
  END IF;

  SELECT id INTO _mver_a FROM public.scp_module_versions
   WHERE module_id = _mod AND version_number = 1;
  IF _mver_a IS NULL THEN
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, published_at)
    VALUES
      (_mod, _pver, 1, 1, 'published',
       'Situationsmedvetenhet', 'Situational awareness',
       'Öva på att skilja det du faktiskt ser från det du antar, och på att märka när en situation håller på att förändras.',
       'Practise separating what you actually see from what you assume, and noticing when a situation is starting to change.',
       10, now())
    RETURNING id INTO _mver_a;
  END IF;
  UPDATE public.scp_module_versions SET learning_form_id = _form_a WHERE id = _mver_a;
  INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
  VALUES (_mver_a, _beh_a) ON CONFLICT DO NOTHING;

  -- Item A1
  INSERT INTO public.scp_items (slug) VALUES ('internal-dev-sa-01')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id INTO _item;
  IF NOT EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    INSERT INTO public.scp_item_versions
      (item_id, version_number, content_status, item_format, competency_id,
       primary_behaviour_id, mode, observable_behavior, response_process,
       legal_basis_required, jurisdiction_id, difficulty, cognitive_demand,
       cognitive_review_status, language_review_status, accessibility_review_status,
       bias_review_status, sme_review_status)
    VALUES
      (_item, 1, 'draft', 'sjt_best_response', _comp_a, _beh_a, 'learning',
       'Internal fixture (learning): separates observation from inference.',
       'Internal fixture (learning): guided practice with feedback.',
       false, _jur, 'foundational', 'recognition',
       'not_required','not_required','not_required','approved','approved')
    RETURNING id INTO _iv;

    INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
      (_iv, 'sv-SE', 'source',
       'En besökare står kvar i receptionen tjugo minuter efter att mötet avslutats och tittar upprepade gånger mot personaldörren.',
       'Vilken formulering beskriver situationen bäst i din notering?'),
      (_iv, 'en-GB', 'approved',
       'A visitor remains in reception twenty minutes after their meeting ended, repeatedly looking towards the staff door.',
       'Which wording describes the situation best in your note?');

    INSERT INTO public.scp_item_options
      (item_version_id, option_key, display_order, score_value, scoring_rationale_sv,
       is_preferred, distractor_error_type, learning_feedback_sv, learning_feedback_en)
    VALUES
      (_iv, 'a', 1, 3, 'Beskriver iakttagelsen utan att tolka avsikt.', true, NULL,
       'Det här är vad du faktiskt kan se: var personen är, hur länge, och vad hen tittar mot. Notering av beteende och tid går att kontrollera i efterhand — en tolkning av avsikt gör det inte.',
       'This is what you can actually see: where the person is, for how long, and what they are looking at. A note about behaviour and time can be checked afterwards — an interpretation of intent cannot.'),
      (_iv, 'b', 2, 1, 'Tolkar avsikt som om den vore observerad.', false, 'unsupported_assumption',
       'Här skrivs en avsikt som om den vore iakttagen. Det kan visa sig stämma, men i noteringen blir gissningen omöjlig att skilja från det du såg — och nästa person läser den som fakta.',
       'This records an intention as if it had been observed. It may turn out to be right, but in the note the guess becomes indistinguishable from what you saw — and the next person reads it as fact.'),
      (_iv, 'c', 3, 0, 'Utelämnar iakttagelsen helt.', false, 'failure_to_document',
       'Att inte notera något alls är också ett val. Om situationen utvecklas finns ingen tidslinje, och den som tar över får börja från noll.',
       'Recording nothing is also a choice. If the situation develops there is no timeline, and whoever takes over starts from nothing.');

    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT o.id, l.lang, l.label FROM public.scp_item_options o
    JOIN (VALUES
      ('a','sv-SE','"14:05–14:25, besökare kvar i receptionen efter avslutat möte, tittar upprepade gånger mot personaldörren."'),
      ('a','en-GB','"14:05–14:25, visitor remained in reception after their meeting ended, repeatedly looking towards the staff door."'),
      ('b','sv-SE','"Besökare försökte ta sig in i personalutrymmet."'),
      ('b','en-GB','"Visitor was trying to get into the staff area."'),
      ('c','sv-SE','"Inget att rapportera."'),
      ('c','en-GB','"Nothing to report."')
    ) AS l(k, lang, label) ON l.k = o.option_key
    WHERE o.item_version_id = _iv;

    INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
    VALUES (_form_a, _iv, 1);
  END IF;

  -- Item A2
  INSERT INTO public.scp_items (slug) VALUES ('internal-dev-sa-02')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id INTO _item;
  IF NOT EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    INSERT INTO public.scp_item_versions
      (item_id, version_number, content_status, item_format, competency_id,
       primary_behaviour_id, mode, observable_behavior, response_process,
       legal_basis_required, jurisdiction_id, difficulty, cognitive_demand,
       cognitive_review_status, language_review_status, accessibility_review_status,
       bias_review_status, sme_review_status)
    VALUES
      (_item, 1, 'draft', 'sjt_best_response', _comp_a, _beh_a, 'learning',
       'Internal fixture (learning): notices a changing situation early.',
       'Internal fixture (learning): guided practice with feedback.',
       false, _jur, 'intermediate', 'judgement',
       'not_required','not_required','not_required','approved','approved')
    RETURNING id INTO _iv;

    INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
      (_iv, 'sv-SE', 'source',
       'Under ett kvällspass märker du att en dörr som brukar vara låst har stått olåst vid två kontroller i rad.',
       'Vad är rimligast att göra först?'),
      (_iv, 'en-GB', 'approved',
       'During an evening shift you notice that a door which is normally locked has been unlocked on two consecutive checks.',
       'What is the most reasonable thing to do first?');

    INSERT INTO public.scp_item_options
      (item_version_id, option_key, display_order, score_value, scoring_rationale_sv,
       is_preferred, distractor_error_type, learning_feedback_sv, learning_feedback_en)
    VALUES
      (_iv, 'a', 1, 3, 'Säkrar, dokumenterar och lyfter mönstret.', true, NULL,
       'Två gånger i rad är inte en slump utan ett mönster. Att säkra dörren löser kvällen; att notera båda tillfällena är det som gör att någon kan ta reda på varför den står olåst.',
       'Twice in a row is not a coincidence, it is a pattern. Securing the door solves tonight; recording both occasions is what lets someone find out why it keeps being unlocked.'),
      (_iv, 'b', 2, 1, 'Åtgärdar utan att dokumentera.', false, 'failure_to_document',
       'Att låsa dörren är rätt handling, men utan notering försvinner mönstret. Nästa pass upptäcker samma sak och tror att det är första gången.',
       'Locking the door is the right action, but without a note the pattern disappears. The next shift finds the same thing and believes it is the first time.'),
      (_iv, 'c', 3, 0, 'Avvaktar tills det händer en tredje gång.', false, 'delayed_escalation',
       'Att vänta in ett tredje tillfälle innebär att en känd öppning står kvar. Underlaget finns redan efter två kontroller — det som saknas är att det förs vidare.',
       'Waiting for a third occurrence leaves a known opening in place. The evidence already exists after two checks; what is missing is passing it on.');

    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT o.id, l.lang, l.label FROM public.scp_item_options o
    JOIN (VALUES
      ('a','sv-SE','Säkra dörren, notera båda kontrollerna och rapportera det återkommande mönstret.'),
      ('a','en-GB','Secure the door, record both checks, and report the recurring pattern.'),
      ('b','sv-SE','Lås dörren och fortsätt ronden.'),
      ('b','en-GB','Lock the door and continue the round.'),
      ('c','sv-SE','Vänta och se om det upprepas ännu en gång innan något rapporteras.'),
      ('c','en-GB','Wait and see whether it happens once more before reporting anything.')
    ) AS l(k, lang, label) ON l.k = o.option_key
    WHERE o.item_version_id = _iv;

    INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
    VALUES (_form_a, _iv, 2);
  END IF;

  -- ── Module B: observation and reporting ───────────────────────────────
  INSERT INTO public.scp_modules (slug) VALUES ('internal-dev-observation-reporting')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id INTO _mod;

  -- scp_forms.slug carries no unique constraint, so this is a lookup-then-insert
  -- rather than an upsert.
  SELECT id INTO _form_b FROM public.scp_forms WHERE slug = 'internal-dev-form-reporting';
  IF _form_b IS NULL THEN
    INSERT INTO public.scp_forms
      (assessment_version_id, slug, name_sv, name_en,
       target_minutes_min, target_minutes_max, randomise_within_block)
    VALUES (_aver, 'internal-dev-form-reporting', 'Observation och rapportering', 'Observation and reporting', 4, 8, false)
    RETURNING id INTO _form_b;
  END IF;

  SELECT id INTO _mver_b FROM public.scp_module_versions
   WHERE module_id = _mod AND version_number = 1;
  IF _mver_b IS NULL THEN
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, published_at)
    VALUES
      (_mod, _pver, 1, 2, 'published',
       'Observation och rapportering', 'Observation and reporting',
       'Öva på att skriva en notering som någon annan kan agera på: vad, var, när och vad du gjorde.',
       'Practise writing a note somebody else can act on: what, where, when, and what you did.',
       10, now())
    RETURNING id INTO _mver_b;
  END IF;
  UPDATE public.scp_module_versions SET learning_form_id = _form_b WHERE id = _mver_b;
  INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
  VALUES (_mver_b, _beh_b) ON CONFLICT DO NOTHING;

  -- Item B1
  INSERT INTO public.scp_items (slug) VALUES ('internal-dev-rep-01')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id INTO _item;
  IF NOT EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    INSERT INTO public.scp_item_versions
      (item_id, version_number, content_status, item_format, competency_id,
       primary_behaviour_id, mode, observable_behavior, response_process,
       legal_basis_required, jurisdiction_id, difficulty, cognitive_demand,
       cognitive_review_status, language_review_status, accessibility_review_status,
       bias_review_status, sme_review_status)
    VALUES
      (_item, 1, 'draft', 'sjt_best_response', _comp_b, _beh_b, 'learning',
       'Internal fixture (learning): writes an actionable handover note.',
       'Internal fixture (learning): guided practice with feedback.',
       false, _jur, 'foundational', 'recognition',
       'not_required','not_required','not_required','approved','approved')
    RETURNING id INTO _iv;

    INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
      (_iv, 'sv-SE', 'source',
       'Du lämnar över till nästa skift efter en händelse som fortfarande inte är avslutad.',
       'Vad behöver din överlämning innehålla först?'),
      (_iv, 'en-GB', 'approved',
       'You are handing over to the next shift after an incident that is still unresolved.',
       'What does your handover need to contain first?');

    INSERT INTO public.scp_item_options
      (item_version_id, option_key, display_order, score_value, scoring_rationale_sv,
       is_preferred, distractor_error_type, learning_feedback_sv, learning_feedback_en)
    VALUES
      (_iv, 'a', 1, 3, 'Läge, vidtagen åtgärd och vad som återstår.', true, NULL,
       'Den som tar över behöver veta tre saker för att kunna fortsätta: var det står nu, vad som redan är gjort och vad som är kvar. Allt annat kan läsas i efterhand.',
       'Whoever takes over needs three things to continue: where it stands now, what has already been done, and what remains. Everything else can be read afterwards.'),
      (_iv, 'b', 2, 1, 'Endast en kronologisk redogörelse.', false, 'failure_to_document',
       'En berättelse i tidsordning är användbar, men den svarar inte på frågan nästa person faktiskt har: vad ska jag göra härnäst?',
       'A chronological account is useful, but it does not answer the question the next person actually has: what should I do next?'),
      (_iv, 'c', 3, 0, 'En bedömning av vem som bar ansvaret.', false, 'unsupported_assumption',
       'Att fördela ansvar i en överlämning hjälper ingen vidare och låser dessutom fast en tolkning innan händelsen är utredd.',
       'Assigning blame in a handover helps nobody continue, and it fixes an interpretation in place before the incident has been looked into.');

    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT o.id, l.lang, l.label FROM public.scp_item_options o
    JOIN (VALUES
      ('a','sv-SE','Nuläge, vad som redan gjorts och vad som återstår att göra.'),
      ('a','en-GB','Current status, what has already been done, and what remains to be done.'),
      ('b','sv-SE','En redogörelse för händelseförloppet i tidsordning.'),
      ('b','en-GB','An account of the sequence of events in chronological order.'),
      ('c','sv-SE','En bedömning av vem som orsakade situationen.'),
      ('c','en-GB','An assessment of who caused the situation.')
    ) AS l(k, lang, label) ON l.k = o.option_key
    WHERE o.item_version_id = _iv;

    INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
    VALUES (_form_b, _iv, 1);
  END IF;

  -- Item B2
  INSERT INTO public.scp_items (slug) VALUES ('internal-dev-rep-02')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id INTO _item;
  IF NOT EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    INSERT INTO public.scp_item_versions
      (item_id, version_number, content_status, item_format, competency_id,
       primary_behaviour_id, mode, observable_behavior, response_process,
       legal_basis_required, jurisdiction_id, difficulty, cognitive_demand,
       cognitive_review_status, language_review_status, accessibility_review_status,
       bias_review_status, sme_review_status)
    VALUES
      (_item, 1, 'draft', 'sjt_best_response', _comp_b, _beh_b, 'learning',
       'Internal fixture (learning): keeps a report proportionate.',
       'Internal fixture (learning): guided practice with feedback.',
       false, _jur, 'intermediate', 'judgement',
       'not_required','not_required','not_required','approved','approved')
    RETURNING id INTO _iv;

    INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
      (_iv, 'sv-SE', 'source',
       'Du ska rapportera en mindre incident där en person blev upprörd men lugnade ned sig efter ett kort samtal.',
       'Hur bör rapporten formuleras?'),
      (_iv, 'en-GB', 'approved',
       'You are reporting a minor incident where a person became upset but calmed down after a short conversation.',
       'How should the report be worded?');

    INSERT INTO public.scp_item_options
      (item_version_id, option_key, display_order, score_value, scoring_rationale_sv,
       is_preferred, distractor_error_type, learning_feedback_sv, learning_feedback_en)
    VALUES
      (_iv, 'a', 1, 3, 'Proportionerlig, saklig och utan personomdömen.', true, NULL,
       'Rapporten beskriver vad som hände och hur det avslutades, i den omfattning händelsen faktiskt hade. Proportionalitet är inte att tona ned — det är att inte lägga till.',
       'The report describes what happened and how it ended, at the scale the incident actually had. Being proportionate is not playing it down — it is not adding anything.'),
      (_iv, 'b', 2, 1, 'Överdriver händelsens allvar.', false, 'poor_proportionality',
       'Att skriva upp allvaret kan kännas säkrare, men en mindre händelse som rapporteras som allvarlig gör det svårare att se de händelser som verkligen är det.',
       'Writing up the severity can feel safer, but a minor incident reported as serious makes it harder to see the incidents that genuinely are.'),
      (_iv, 'c', 3, 0, 'Beskriver personens karaktär i stället för händelsen.', false, 'unsupported_assumption',
       'En rapport ska beskriva vad som hände, inte vem någon är. Omdömen om personlighet går inte att kontrollera och följer ändå med personen vidare.',
       'A report should describe what happened, not who somebody is. Judgements about personality cannot be checked, and they follow the person onward regardless.');

    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT o.id, l.lang, l.label FROM public.scp_item_options o
    JOIN (VALUES
      ('a','sv-SE','Vad som inträffade, vad som sades och att situationen avslutades lugnt.'),
      ('a','en-GB','What occurred, what was said, and that the situation ended calmly.'),
      ('b','sv-SE','Att situationen var hotfull och kunde ha eskalerat allvarligt.'),
      ('b','en-GB','That the situation was threatening and could have escalated seriously.'),
      ('c','sv-SE','Att personen framstod som allmänt aggressiv av sig.'),
      ('c','en-GB','That the person came across as generally aggressive by nature.')
    ) AS l(k, lang, label) ON l.k = o.option_key
    WHERE o.item_version_id = _iv;

    INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
    VALUES (_form_b, _iv, 2);
  END IF;

  -- ── Publication happens LAST ──────────────────────────────────────────
  --
  -- Every version enters the ladder at draft: scp_guard_version_starts_as_draft
  -- refuses anything else on insert, and scp_guard_child_of_published then
  -- refuses to add a form item once the parent is published. So the container
  -- has to stay draft until all four items are in place. The ladder is not a
  -- formality a fixture gets to skip because it is synthetic.
  UPDATE public.scp_item_versions
     SET content_status = 'published'
   WHERE content_status = 'draft'
     AND item_id IN (SELECT id FROM public.scp_items
                      WHERE slug IN ('internal-dev-sa-01','internal-dev-sa-02',
                                     'internal-dev-rep-01','internal-dev-rep-02'));

  UPDATE public.scp_assessment_versions
     SET content_status = 'published', published_at = COALESCE(published_at, now())
   WHERE id = _aver AND content_status <> 'published';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The library learns both corrections
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_content_library(_employer_id uuid)
RETURNS TABLE(
  library_kind        text,
  item_id             uuid,
  parent_id           uuid,
  slug                text,
  name_sv             text,
  name_en             text,
  summary_sv          text,
  summary_en          text,
  lifecycle_state     text,
  content_status      text,
  validation_status   text,
  version_number      integer,
  is_test_fixture     boolean,
  owner_employer_id   uuid,
  ownership           text,
  assignable          boolean,
  unassignable_reason text,
  governance_mode     public.scp_governance_mode,
  item_count          integer,
  module_count        integer,
  minutes_min         integer,
  minutes_max         integer,
  languages           text[],
  requires_human_review boolean,
  target_role_sv      text,
  target_role_en      text,
  competencies_sv     text[],
  competencies_en     text[],
  does_not_measure_sv text[],
  does_not_measure_en text[],
  published_at        timestamptz,
  updated_at          timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _may_see_fixtures boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.scp_fixture_access fa
                  WHERE fa.employer_id = _employer_id)
    INTO _may_see_fixtures;

  -- ── Competence assessments ────────────────────────────────────────────
  RETURN QUERY
  SELECT
    'assessment'::text, av.id, d.id, d.slug,
    coalesce(d.display_name_sv, d.name_sv),
    coalesce(d.display_name_en, d.name_en),
    pv.purpose_sv, pv.purpose_en,
    public.scp_lifecycle_state(av.content_status, av.retired_at, d.is_test_fixture),
    av.content_status, av.validation_status, av.version_number, d.is_test_fixture,
    d.owner_employer_id,
    CASE WHEN d.owner_employer_id IS NULL THEN 'cqrityjob' ELSE 'employer' END,
    (public.scp_grant_permits_assignment(
       _employer_id, d.id, av.content_status, av.validation_status,
       d.is_test_fixture) IS NOT NULL
     AND av.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)),
    CASE
      WHEN av.retired_at IS NOT NULL THEN 'retired'
      WHEN NOT EXISTS (SELECT 1 FROM public.scp_forms f
                         JOIN public.scp_form_items fi ON fi.form_id = f.id
                        WHERE f.assessment_version_id = av.id) THEN 'no_items'
      WHEN public.scp_grant_permits_assignment(
             _employer_id, d.id, av.content_status, av.validation_status,
             d.is_test_fixture) IS NULL THEN 'not_permitted'
      ELSE NULL
    END,
    public.scp_grant_permits_assignment(
      _employer_id, d.id, av.content_status, av.validation_status, d.is_test_fixture),
    coalesce((SELECT count(*)::int FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
               WHERE f.assessment_version_id = av.id), 0),
    0,
    (SELECT min(f.target_minutes_min) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    (SELECT max(f.target_minutes_max) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    av.language_scope,
    EXISTS (SELECT 1 FROM public.scp_forms f
              JOIN public.scp_form_items fi ON fi.form_id = f.id
              JOIN public.scp_review_requirements rr ON rr.item_version_id = fi.item_version_id
             WHERE f.assessment_version_id = av.id AND rr.required),
    prof.name_sv, prof.name_en,
    coalesce((SELECT array_agg(DISTINCT cv.name_sv) FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
                JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = iv.primary_behaviour_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE f.assessment_version_id = av.id), ARRAY[]::text[]),
    coalesce((SELECT array_agg(DISTINCT cv.name_en) FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
                JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = iv.primary_behaviour_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE f.assessment_version_id = av.id), ARRAY[]::text[]),
    coalesce(pv.does_not_measure_sv, ARRAY[]::text[]),
    coalesce(pv.does_not_measure_en, ARRAY[]::text[]),
    av.published_at, av.updated_at
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  JOIN public.scp_assessment_families fam ON fam.id = d.family_id
  LEFT JOIN public.scp_program_versions pv ON pv.id = av.program_version_id
  LEFT JOIN public.scp_professions prof ON prof.id = d.profession_id
  WHERE fam.product_type = 'development_programme'
    AND (NOT d.is_test_fixture OR _may_see_fixtures)
    AND (d.owner_employer_id IS NULL OR d.owner_employer_id = _employer_id)
    -- CORRECTION 2. A version whose forms are exclusively learning-mode is a
    -- container for training delivery, not an assessment. Listing it here
    -- offered an Assign button that scp_attempts_mode_matches_form refuses.
    AND NOT EXISTS (
      SELECT 1 FROM public.scp_forms f
       WHERE f.assessment_version_id = av.id
         AND EXISTS (SELECT 1 FROM public.scp_form_items fi WHERE fi.form_id = f.id)
      HAVING bool_and(
        (SELECT DISTINCT iv2.mode
           FROM public.scp_form_items fi2
           JOIN public.scp_item_versions iv2 ON iv2.id = fi2.item_version_id
          WHERE fi2.form_id = f.id) = 'learning')
    );

  -- ── Training and development programmes ───────────────────────────────
  RETURN QUERY
  SELECT
    'training'::text, pv.id, p.id, p.slug,
    coalesce(p.display_name_sv, pv.name_sv),
    coalesce(p.display_name_en, pv.name_en),
    pv.purpose_sv, pv.purpose_en,
    public.scp_lifecycle_state(pv.content_status, pv.retired_at, p.is_test_fixture),
    pv.content_status, pv.validation_status, pv.version_number, p.is_test_fixture,
    p.owner_employer_id,
    CASE WHEN p.owner_employer_id IS NULL THEN 'cqrityjob' ELSE 'employer' END,
    -- Training is assignable when the governed version is published, live, and
    -- actually has modules. scp_guard_training_target_assignable enforces the
    -- same three facts on the INSERT, so the library cannot over-promise.
    (pv.content_status = 'published'
     AND pv.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_module_versions mv
                  WHERE mv.program_version_id = pv.id)),
    CASE
      WHEN pv.retired_at IS NOT NULL THEN 'retired'
      WHEN pv.content_status <> 'published' THEN 'not_permitted'
      WHEN NOT EXISTS (SELECT 1 FROM public.scp_module_versions mv
                        WHERE mv.program_version_id = pv.id) THEN 'no_items'
      ELSE NULL
    END,
    NULL::public.scp_governance_mode,
    0,
    coalesce((SELECT count(*)::int FROM public.scp_module_versions mv
               WHERE mv.program_version_id = pv.id), 0),
    (SELECT sum(mv.estimated_minutes)::int FROM public.scp_module_versions mv
      WHERE mv.program_version_id = pv.id),
    (SELECT sum(mv.estimated_minutes)::int FROM public.scp_module_versions mv
      WHERE mv.program_version_id = pv.id),
    ARRAY['sv-SE','en-GB']::text[],
    false,
    role_v.name_sv, role_v.name_en,
    coalesce((SELECT array_agg(DISTINCT cv.name_sv)
                FROM public.scp_module_versions mv
                JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id = mv.id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = mbm.behaviour_version_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE mv.program_version_id = pv.id), ARRAY[]::text[]),
    coalesce((SELECT array_agg(DISTINCT cv.name_en)
                FROM public.scp_module_versions mv
                JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id = mv.id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = mbm.behaviour_version_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE mv.program_version_id = pv.id), ARRAY[]::text[]),
    coalesce(pv.does_not_measure_sv, ARRAY[]::text[]),
    coalesce(pv.does_not_measure_en, ARRAY[]::text[]),
    pv.published_at, pv.updated_at
  FROM public.scp_program_versions pv
  JOIN public.scp_programs p ON p.id = pv.program_id
  LEFT JOIN public.scp_role_versions role_v ON role_v.role_id = p.role_id
  WHERE (p.owner_employer_id IS NULL OR p.owner_employer_id = _employer_id)
    AND (NOT p.is_test_fixture OR _may_see_fixtures);
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_employer_content_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_content_library(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _pver uuid; _n int;
BEGIN
  SELECT pv.id INTO _pver
    FROM public.scp_program_versions pv
    JOIN public.scp_programs p ON p.id = pv.program_id
   WHERE p.slug = 'internal-dev-exercise-situational-reporting';
  IF _pver IS NULL THEN
    RAISE EXCEPTION 'SCP_FIXTURE_MISSING: the internal development exercise was not created';
  END IF;

  -- Published, so it can be assigned; marked as scaffolding, so it presents as
  -- internal testing; never claimed as validated.
  IF (SELECT content_status FROM public.scp_program_versions WHERE id = _pver) <> 'published' THEN
    RAISE EXCEPTION 'SCP_FIXTURE_NOT_ASSIGNABLE: the exercise is not published';
  END IF;
  IF (SELECT validation_status FROM public.scp_program_versions WHERE id = _pver) <> 'design' THEN
    RAISE EXCEPTION 'SCP_FIXTURE_OVERCLAIMS: the exercise must not claim a validation level';
  END IF;
  IF NOT (SELECT p.is_test_fixture FROM public.scp_programs p
           WHERE p.slug = 'internal-dev-exercise-situational-reporting') THEN
    RAISE EXCEPTION 'SCP_FIXTURE_NOT_MARKED: the exercise is not marked as internal material';
  END IF;

  -- Two modules, each with a learning form carrying two answerable items.
  SELECT count(*) INTO _n FROM public.scp_module_versions WHERE program_version_id = _pver;
  IF _n <> 2 THEN RAISE EXCEPTION 'SCP_FIXTURE_MODULES: expected 2 modules, found %', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_module_versions mv
   WHERE mv.program_version_id = _pver AND mv.learning_form_id IS NOT NULL;
  IF _n <> 2 THEN RAISE EXCEPTION 'SCP_FIXTURE_FORMS: % of 2 modules have an activity', _n; END IF;

  SELECT count(*) INTO _n
    FROM public.scp_module_versions mv
    JOIN public.scp_form_items fi ON fi.form_id = mv.learning_form_id
   WHERE mv.program_version_id = _pver;
  IF _n <> 4 THEN RAISE EXCEPTION 'SCP_FIXTURE_ITEMS: expected 4 activity items, found %', _n; END IF;

  -- Every module maps to a behaviour, or completion writes no history at all.
  SELECT count(*) INTO _n FROM public.scp_module_versions mv
   WHERE mv.program_version_id = _pver
     AND NOT EXISTS (SELECT 1 FROM public.scp_module_behaviour_map m
                      WHERE m.module_version_id = mv.id);
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_FIXTURE_UNMAPPED: % module(s) map to no behaviour', _n; END IF;

  -- Every activity item is learning mode with bilingual feedback on every option.
  SELECT count(*) INTO _n
    FROM public.scp_module_versions mv
    JOIN public.scp_form_items fi ON fi.form_id = mv.learning_form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE mv.program_version_id = _pver AND iv.mode <> 'learning';
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_FIXTURE_MODE: % non-learning item(s) in a module', _n; END IF;

  SELECT count(*) INTO _n
    FROM public.scp_module_versions mv
    JOIN public.scp_form_items fi ON fi.form_id = mv.learning_form_id
    JOIN public.scp_item_options o ON o.item_version_id = fi.item_version_id
   WHERE mv.program_version_id = _pver
     AND (o.learning_feedback_sv IS NULL OR o.learning_feedback_en IS NULL);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_FIXTURE_FEEDBACK: % option(s) lack bilingual feedback', _n;
  END IF;

  -- The real Security Guard content is untouched.
  IF EXISTS (SELECT 1 FROM public.scp_program_versions pv
               JOIN public.scp_programs p ON p.id = pv.program_id
              WHERE p.slug = 'security-guard-operational-development'
                AND pv.content_status <> 'draft') THEN
    RAISE EXCEPTION 'SCP_REAL_CONTENT_PUBLISHED: the Security Guard programme must stay draft';
  END IF;
END $$;
