-- Phase 2f — the Learning Mode fixture.
--
-- ADDITIVE ONLY. Test fixture content, published so Learning Mode can be
-- exercised end to end.
--
-- ── SEPARATE ITEM VERSIONS, NOT A FLAG ON THE ASSESSMENT ITEMS ────────────
--
-- Every item here is a NEW item version with mode = 'learning'. None of them is
-- the assessment item with a switch flipped, and none of them is served by the
-- assessment form.
--
-- That separation is already enforced three ways by Phase 1A -- mode is
-- immutable once set, a form may not mix modes, and a learning counterpart must
-- itself be a learning item -- so this migration does not add a guard. It
-- simply cannot author the wrong thing.
--
-- The learning items carry learning_feedback_sv/_en and is_preferred. The
-- assessment items do not expose either, and scp_get_learning_feedback refuses
-- to read them for a non-learning item.

DO $$
DECLARE
  _behaviour uuid; _competency uuid; _jurisdiction uuid; _role uuid;
  _fam uuid; _def uuid; _ver uuid; _form uuid;
  _prog uuid; _pver uuid; _mod uuid; _mver uuid;
  _item uuid; _iv uuid; _iv1 uuid; _n int;
BEGIN
  SELECT id INTO _jurisdiction FROM public.scp_jurisdictions WHERE code = 'SE';
  SELECT id INTO _fam FROM public.scp_assessment_families
   WHERE product_type = 'development_programme' LIMIT 1;

  SELECT bv.id, cv.competency_id INTO _behaviour, _competency
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
   ORDER BY bv.created_at LIMIT 1;

  -- ── A programme + module so recommendations have something to point at ──
  SELECT id INTO _role FROM public.scp_roles LIMIT 1;

  INSERT INTO public.scp_programs (slug, role_id)
  VALUES ('fixture-learning-programme', _role)
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id INTO _prog;

  INSERT INTO public.scp_program_versions
    (program_id, version_number, jurisdiction_id, content_status, validation_status,
     name_sv, name_en, purpose_sv, purpose_en,
     does_not_measure_sv, does_not_measure_en, published_at)
  VALUES
    (_prog, 1, _jurisdiction, 'draft', 'design',
     'TESTFIXTUR — utvecklingsspår', 'TEST FIXTURE — development track',
     'Att öva yrkesmässig bedömning i vardagsnära situationer och ge återkoppling som går att lära av.',
     'To practise professional judgement in everyday situations, and to give feedback that can actually be learned from.',
     ARRAY['Personlighet', 'Lämplighet för anställning', 'Rangordning mellan personer'],
     ARRAY['Personality', 'Suitability for employment', 'Ranking between people'],
     NULL)
  RETURNING id INTO _pver;

  INSERT INTO public.scp_modules (slug) VALUES ('fixture-module-documentation')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id INTO _mod;

  INSERT INTO public.scp_module_versions
    (module_id, program_version_id, version_number, display_order, content_status,
     name_sv, name_en, summary_sv, summary_en, estimated_minutes)
  VALUES
    (_mod, _pver, 1, 1, 'draft',
     'Dokumentation och avvikelser', 'Documentation and deviations',
     'Öva på vad som behöver dokumenteras, när det ska ske och varför det spelar roll.',
     'Practise what needs recording, when it should happen, and why it matters.',
     15)
  RETURNING id INTO _mver;

  INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
  VALUES (_mver, _behaviour) ON CONFLICT DO NOTHING;

  -- ── The learning-mode assessment container ─────────────────────────────
  INSERT INTO public.scp_assessment_definitions
    (family_id, slug, name_sv, name_en, purpose, is_test_fixture)
  VALUES
    (_fam, 'fixture-learning-e2e',
     'TESTFIXTUR — övningsläge', 'TEST FIXTURE — learning mode',
     'development_programme', true)
  ON CONFLICT (slug) DO UPDATE SET is_test_fixture = true
  RETURNING id INTO _def;

  INSERT INTO public.scp_assessment_versions
    (definition_id, version_number, content_status, validation_status,
     language_scope, notes)
  VALUES
    (_def, 1, 'draft', 'design', ARRAY['sv-SE','en-GB'],
     'Test-only Learning Mode fixture. Separate learning item versions; never served in Assessment Mode.')
  RETURNING id INTO _ver;

  INSERT INTO public.scp_forms
    (assessment_version_id, slug, name_sv, name_en,
     target_minutes_min, target_minutes_max, randomise_within_block)
  VALUES
    (_ver, 'fixture-learning-form', 'Övningsformulär', 'Learning form', 5, 12, false)
  RETURNING id INTO _form;

  -- ── Learning item 1 ────────────────────────────────────────────────────
  INSERT INTO public.scp_items (slug) VALUES ('fixture-learn-01') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, item_format, competency_id,
     primary_behaviour_id, mode, observable_behavior, response_process,
     legal_basis_required, jurisdiction_id, difficulty, cognitive_demand,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'sjt_best_response', _competency, _behaviour, 'learning',
     'Fixture (learning): recognises what a useful deviation note contains.',
     'Fixture (learning): guided practice with feedback.',
     false, _jurisdiction, 'foundational', 'recognition',
     'not_required','not_required','not_required','approved','approved')
  RETURNING id INTO _iv1;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
    (_iv1, 'sv-SE', 'source',
     'Under passet upptäcker du att en larmpunkt har varit ur funktion i flera timmar.',
     'Vilken notering är mest användbar för nästa skift?'),
    (_iv1, 'en-GB', 'approved',
     'During your shift you discover that an alarm point has been out of service for several hours.',
     'Which note is most useful to the next shift?');

  INSERT INTO public.scp_item_options
    (item_version_id, option_key, display_order, score_value, scoring_rationale_sv,
     is_preferred, distractor_error_type, learning_feedback_sv, learning_feedback_en)
  VALUES
    (_iv1, 'a', 1, 3, 'Tid, plats, iakttagelse och vidtagen åtgärd.', true, NULL,
     'Det här är den not som nästa skift faktiskt kan arbeta vidare från: den säger när, var, vad du såg och vad du gjorde. Fyra uppgifter, inga tolkningar.',
     'This is the note the next shift can actually work from: it says when, where, what you observed and what you did. Four facts, no interpretation.'),
    (_iv1, 'b', 2, 1, 'Endast en tidsangivelse.', false, 'failure_to_document',
     'En tidsangivelse utan iakttagelse går inte att agera på. Nästa skift vet att något hände, men inte vad — och får börja om.',
     'A timestamp with no observation cannot be acted on. The next shift knows something happened but not what, and has to start over.'),
    (_iv1, 'c', 3, 0, 'En slutsats om orsaken utan underlag.', false, 'unsupported_assumption',
     'Här dras en slutsats om varför larmet slutade fungera. Det kan mycket väl stämma — men en gissning som skrivs som ett faktum följer med i dokumentationen och blir svår att ta tillbaka.',
     'This draws a conclusion about why the alarm failed. It may well be right — but a guess written as a fact travels onward in the record and is hard to take back.');

  INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
  SELECT o.id, l.lang, l.label FROM public.scp_item_options o
  JOIN (VALUES
    ('a','sv-SE','"14:20, larmpunkt 3 i garaget svarar inte. Kontrollerade på plats, felanmälde till driftteknik."'),
    ('a','en-GB','"14:20, alarm point 3 in the garage not responding. Checked on site, reported to maintenance."'),
    ('b','sv-SE','"Problem med larmet under eftermiddagen."'),
    ('b','en-GB','"Problem with the alarm during the afternoon."'),
    ('c','sv-SE','"Larmet slutade fungera för att nätverket låg nere igen."'),
    ('c','en-GB','"The alarm stopped working because the network was down again."')
  ) AS l(k, lang, label) ON l.k = o.option_key
  WHERE o.item_version_id = _iv1;

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
  VALUES (_form, _iv1, 1);

  -- ── Learning item 2 ────────────────────────────────────────────────────
  INSERT INTO public.scp_items (slug) VALUES ('fixture-learn-02') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, item_format, competency_id,
     primary_behaviour_id, mode, observable_behavior, response_process,
     legal_basis_required, jurisdiction_id, difficulty, cognitive_demand,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'sjt_best_response', _competency, _behaviour, 'learning',
     'Fixture (learning): judges when a deviation needs escalating.',
     'Fixture (learning): guided practice with feedback.',
     false, _jurisdiction, 'intermediate', 'judgement',
     'not_required','not_required','not_required','approved','approved')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
    (_iv, 'sv-SE', 'source',
     'Samma avvikelse har noterats tre pass i rad utan att något förändrats.',
     'Vad är rimligast att göra nu?'),
    (_iv, 'en-GB', 'approved',
     'The same deviation has been noted on three consecutive shifts with nothing having changed.',
     'What is the most reasonable thing to do now?');

  INSERT INTO public.scp_item_options
    (item_version_id, option_key, display_order, score_value, scoring_rationale_sv,
     is_preferred, distractor_error_type, learning_feedback_sv, learning_feedback_en)
  VALUES
    (_iv, 'a', 1, 3, 'Lyfter mönstret, inte bara händelsen.', true, NULL,
     'Tredje gången är inte längre en enskild händelse utan ett mönster, och det är mönstret som behöver komma vidare. Att lyfta det är inte att klaga — det är den information som faktiskt saknas högre upp.',
     'By the third time this is no longer an incident but a pattern, and it is the pattern that needs to travel. Raising it is not complaining — it is precisely the information that is missing further up.'),
    (_iv, 'b', 2, 1, 'Fortsätter dokumentera utan att lyfta.', false, 'delayed_escalation',
     'Att fortsätta dokumentera är inte fel, men det är inte tillräckligt. Tre identiska noteringar utan åtgärd betyder att dokumentationen inte når fram — och då är mer av samma sak inte lösningen.',
     'Continuing to record is not wrong, but it is not enough. Three identical notes with no action means the documentation is not reaching anyone — and more of the same will not fix that.'),
    (_iv, 'c', 3, 0, 'Åtgärdar själv utanför sitt mandat.', false, 'outside_mandate',
     'Att lösa det själv kan kännas mest effektivt, men det här ligger utanför uppdraget. Ett ingrepp utanför mandatet skapar dessutom en ny avvikelse som ingen har dokumenterat.',
     'Fixing it yourself can feel like the efficient answer, but this sits outside the role. An intervention outside the mandate also creates a second deviation that nobody has recorded.');

  INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
  SELECT o.id, l.lang, l.label FROM public.scp_item_options o
  JOIN (VALUES
    ('a','sv-SE','Dokumentera som vanligt och ta upp det återkommande mönstret med arbetsledaren.'),
    ('a','en-GB','Record it as usual, and raise the recurring pattern with your supervisor.'),
    ('b','sv-SE','Dokumentera på samma sätt som de föregående två passen.'),
    ('b','en-GB','Record it the same way as on the previous two shifts.'),
    ('c','sv-SE','Försöka åtgärda felet själv för att slippa notera det en fjärde gång.'),
    ('c','en-GB','Try to fix the fault yourself, to avoid noting it a fourth time.')
  ) AS l(k, lang, label) ON l.k = o.option_key
  WHERE o.item_version_id = _iv;

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
  VALUES (_form, _iv, 2);

  -- ── Publish. Items first, then the version, then the module. ───────────
  UPDATE public.scp_item_versions iv
     SET content_status = 'published', validation_status = 'pilot'
    FROM public.scp_form_items fi
   WHERE fi.form_id = _form AND iv.id = fi.item_version_id;

  UPDATE public.scp_assessment_versions
     SET content_status = 'published', validation_status = 'pilot', published_at = now()
   WHERE id = _ver;

  UPDATE public.scp_program_versions
     SET content_status = 'published', published_at = now() WHERE id = _pver;
  UPDATE public.scp_module_versions
     SET content_status = 'published', published_at = now() WHERE id = _mver;

  -- ── Prove the separation on the rows just written ──────────────────────
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.mode <> 'learning';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2F_LEARNING_FORM_IMPURE: % non-learning items on the learning form', _n;
  END IF;

  -- No learning item is served by any assessment form, anywhere.
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE iv.mode = 'learning' AND f.id <> _form;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2F_LEARNING_ITEM_ON_OTHER_FORM: %', _n;
  END IF;

  -- No FIXTURE assessment item carries learning feedback.
  --
  -- Scoped to fixtures on purpose, and the reason is worth recording. Phase 1G
  -- wrote learning-feedback text onto the real Security Guard ASSESSMENT items
  -- (60 options, sg-b-01..15) as part of the Learning-counterpart work.
  --
  -- That is not a live leak: scp_get_attempt_items does not select the column,
  -- scp_get_learning_feedback refuses any item whose mode is not 'learning',
  -- and no participant has a read policy on scp_item_options. It is a LATENT
  -- hazard -- explanation text naming the preferred answer, sitting on a live
  -- assessment item, one convenience field away from being served.
  --
  -- Deleting authored content is a content decision, not a migration decision,
  -- so it is left for the content owner. What this does instead is refuse to
  -- let the pattern SPREAD into anything new, and P2F.4 in the journey suite
  -- pins the pre-existing count so it cannot grow unnoticed.
  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    JOIN public.scp_form_items fi ON fi.item_version_id = iv.id
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE iv.mode = 'assessment' AND d.is_test_fixture
     AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2F_FEEDBACK_ON_ASSESSMENT_ITEM: % options', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.content_status = 'published' AND NOT d.is_test_fixture;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2F_REAL_CONTENT_PUBLISHED: %', _n;
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'fixture-learning-e2e', 'published',
  'Phase 2f: a Learning Mode fixture on SEPARATE learning-mode item versions, with a programme and module so development recommendations have something real to point at. Feedback explains why the weaker alternatives are weaker rather than only naming the preferred one.',
  jsonb_build_object(
    'migration', '20260809100000_scp_phase2f_learning_fixture',
    'learning_items', 2,
    'shares_items_with_assessment', false,
    'real_content_published', false));
