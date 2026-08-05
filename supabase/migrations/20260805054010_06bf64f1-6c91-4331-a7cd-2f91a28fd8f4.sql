-- Phase 2c — the test-only published fixture programme. ADDITIVE ONLY.

DO $$
DECLARE
  _family_id uuid; _def_id uuid; _ver_id uuid; _form_id uuid;
  _behaviour uuid; _competency uuid; _jurisdiction uuid; _profession uuid;
  _item uuid; _iv uuid; _n int;
BEGIN
  SELECT id INTO _jurisdiction FROM public.scp_jurisdictions WHERE code = 'SE';
  SELECT id INTO _family_id FROM public.scp_assessment_families
   WHERE product_type = 'development_programme' LIMIT 1;
  SELECT id INTO _profession FROM public.scp_professions LIMIT 1;

  SELECT bv.id, cv.competency_id INTO _behaviour, _competency
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
   ORDER BY bv.created_at
   LIMIT 1;

  IF _behaviour IS NULL OR _family_id IS NULL THEN
    RAISE EXCEPTION 'SCP_P2C_MISSING_ANCHORS: the graph must exist before a fixture can bind to it.';
  END IF;

  INSERT INTO public.scp_assessment_definitions
    (family_id, profession_id, slug, name_sv, name_en, purpose, is_test_fixture)
  VALUES
    (_family_id, _profession, 'fixture-delivery-e2e',
     'TESTFIXTUR — leveranskedja', 'TEST FIXTURE — delivery pipeline',
     'development_programme', true)
  ON CONFLICT (slug) DO UPDATE SET is_test_fixture = true
  RETURNING id INTO _def_id;

  INSERT INTO public.scp_assessment_versions
    (definition_id, version_number, content_status, validation_status, language_scope, notes)
  VALUES
    (_def_id, 1, 'draft', 'design', ARRAY['sv-SE','en-GB'],
     'Test-only fixture. Exists to prove the delivery, scoring, review and release pipeline end to end. Never real assessment content.')
  RETURNING id INTO _ver_id;

  INSERT INTO public.scp_forms
    (assessment_version_id, slug, name_sv, name_en,
     target_minutes_min, target_minutes_max, randomise_within_block)
  VALUES
    (_ver_id, 'fixture-form-1', 'Testfixtur formulär 1', 'Test fixture form 1', 3, 6, false)
  RETURNING id INTO _form_id;

  -- Item 1 — single best response.
  INSERT INTO public.scp_items (slug) VALUES ('fixture-e2e-01') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, item_format, competency_id,
     primary_behaviour_id, mode, observable_behavior, response_process,
     legal_basis_required, jurisdiction_id, is_safety_critical, requires_human_review,
     difficulty, cognitive_demand,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'sjt_best_response', _competency, _behaviour, 'assessment',
     'Fixture: chooses the proportionate first action.',
     'Fixture: judgement under routine conditions.',
     false, _jurisdiction, false, false, 'foundational', 'judgement',
     'not_required','not_required','not_required','approved','approved')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
    (_iv, 'sv-SE', 'source',
     'Du märker att en dörr som normalt är stängd står uppställd med en kil.',
     'Vad gör du först?'),
    (_iv, 'en-GB', 'approved',
     'You notice that a door which is normally closed has been wedged open.',
     'What do you do first?');

  INSERT INTO public.scp_item_options
    (item_version_id, option_key, display_order, score_value, scoring_rationale_sv, is_preferred)
  VALUES
    (_iv, 'a', 1, 3, 'Åtgärdar och dokumenterar — proportionerligt.', true),
    (_iv, 'b', 2, 1, 'Passiv observation utan åtgärd.', false),
    (_iv, 'c', 3, 0, 'Ignorerar avvikelsen helt.', false);

  INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
  SELECT o.id, l.lang, l.label FROM public.scp_item_options o
  JOIN (VALUES
    ('a','sv-SE','Tar bort kilen, stänger dörren och noterar händelsen.'),
    ('a','en-GB','Remove the wedge, close the door and record what happened.'),
    ('b','sv-SE','Noterar det men går vidare utan att åtgärda.'),
    ('b','en-GB','Note it but move on without acting.'),
    ('c','sv-SE','Gör ingenting — någon annan har säkert öppnat den avsiktligt.'),
    ('c','en-GB','Do nothing — somebody probably opened it on purpose.')
  ) AS l(k, lang, label) ON l.k = o.option_key
  WHERE o.item_version_id = _iv;

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order) VALUES (_form_id, _iv, 1);

  -- Item 2 — best / worst.
  INSERT INTO public.scp_items (slug) VALUES ('fixture-e2e-02') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, item_format, competency_id,
     primary_behaviour_id, mode, observable_behavior, response_process,
     legal_basis_required, jurisdiction_id, is_safety_critical, requires_human_review,
     difficulty, cognitive_demand,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'sjt_best_worst', _competency, _behaviour, 'assessment',
     'Fixture: distinguishes the strongest from the weakest response.',
     'Fixture: comparative judgement.',
     false, _jurisdiction, false, false, 'intermediate', 'prioritisation',
     'not_required','not_required','not_required','approved','approved')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
    (_iv, 'sv-SE', 'source',
     'En kollega ber dig hoppa över en rutinkontroll eftersom det är ont om tid.',
     'Vilket svar är bäst, och vilket är sämst?'),
    (_iv, 'en-GB', 'approved',
     'A colleague asks you to skip a routine check because time is short.',
     'Which response is best, and which is worst?');

  INSERT INTO public.scp_item_options
    (item_version_id, option_key, display_order, score_value, scoring_rationale_sv,
     is_best_key, is_worst_key, distractor_error_type)
  VALUES
    (_iv, 'a', 1, 3, 'Genomför kontrollen och tar upp tidsbristen efteråt.', true, false, NULL),
    (_iv, 'b', 2, 1, 'Genomför en förkortad kontroll utan att nämna det.', false, false, 'weak_communication'),
    (_iv, 'c', 3, 0, 'Hoppar över kontrollen och signerar som genomförd.', false, true, 'failure_to_document');

  INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
  SELECT o.id, l.lang, l.label FROM public.scp_item_options o
  JOIN (VALUES
    ('a','sv-SE','Genomför kontrollen och tar upp tidsbristen med arbetsledaren efteråt.'),
    ('a','en-GB','Carry out the check, and raise the time pressure with your supervisor afterwards.'),
    ('b','sv-SE','Gör en förkortad kontroll och nämner inte att den var förkortad.'),
    ('b','en-GB','Do a shortened check and do not mention that it was shortened.'),
    ('c','sv-SE','Hoppar över kontrollen och signerar den som genomförd.'),
    ('c','en-GB','Skip the check and sign it off as completed.')
  ) AS l(k, lang, label) ON l.k = o.option_key
  WHERE o.item_version_id = _iv;

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order) VALUES (_form_id, _iv, 2);

  -- Item 3 — rated effectiveness.
  INSERT INTO public.scp_items (slug) VALUES ('fixture-e2e-03') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, item_format, competency_id,
     primary_behaviour_id, mode, observable_behavior, response_process,
     legal_basis_required, jurisdiction_id, is_safety_critical, requires_human_review,
     difficulty, cognitive_demand,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'sjt_rate_effectiveness', _competency, _behaviour, 'assessment',
     'Fixture: rates how effective a described action is.',
     'Fixture: evaluative judgement.',
     false, _jurisdiction, false, false, 'foundational', 'judgement',
     'not_required','not_required','not_required','approved','approved')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
    (_iv, 'sv-SE', 'source',
     'En medarbetare dokumenterar en avvikelse först i slutet av passet, ur minnet.',
     'Hur effektivt är detta arbetssätt?'),
    (_iv, 'en-GB', 'approved',
     'A colleague records a deviation only at the end of the shift, from memory.',
     'How effective is this way of working?');

  INSERT INTO public.scp_item_options
    (item_version_id, option_key, display_order, score_value, scoring_rationale_sv)
  VALUES
    (_iv, '1', 1, 0, 'Mycket ineffektivt — detaljer går förlorade.'),
    (_iv, '2', 2, 1, 'Delvis ineffektivt.'),
    (_iv, '3', 3, 2, 'Delvis effektivt.'),
    (_iv, '4', 4, 3, 'Mycket effektivt.');

  INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
  SELECT o.id, l.lang, l.label FROM public.scp_item_options o
  JOIN (VALUES
    ('1','sv-SE','Mycket ineffektivt'), ('1','en-GB','Very ineffective'),
    ('2','sv-SE','Ganska ineffektivt'), ('2','en-GB','Fairly ineffective'),
    ('3','sv-SE','Ganska effektivt'),   ('3','en-GB','Fairly effective'),
    ('4','sv-SE','Mycket effektivt'),   ('4','en-GB','Very effective')
  ) AS l(k, lang, label) ON l.k = o.option_key
  WHERE o.item_version_id = _iv;

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order) VALUES (_form_id, _iv, 3);

  -- Item 4 — constructed response.
  INSERT INTO public.scp_items (slug) VALUES ('fixture-e2e-04') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, item_format, competency_id,
     primary_behaviour_id, mode, observable_behavior, response_process,
     legal_basis_required, jurisdiction_id, is_safety_critical, requires_human_review,
     difficulty, cognitive_demand,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'constructed_response', _competency, _behaviour, 'assessment',
     'Fixture: explains a documentation decision in their own words.',
     'Fixture: written reasoning.',
     false, _jurisdiction, false, true, 'intermediate', 'synthesis',
     'not_required','not_required','not_required','approved','approved')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt) VALUES
    (_iv, 'sv-SE', 'source',
     'Du har just avslutat ett pass där något avvek från det normala.',
     'Beskriv kort vad du skulle dokumentera och varför.'),
    (_iv, 'en-GB', 'approved',
     'You have just finished a shift in which something departed from the normal pattern.',
     'Briefly describe what you would record, and why.');

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order) VALUES (_form_id, _iv, 4);

  -- Publication: items first, then the version.
  UPDATE public.scp_item_versions iv
     SET content_status = 'published', validation_status = 'pilot'
    FROM public.scp_form_items fi
   WHERE fi.form_id = _form_id AND iv.id = fi.item_version_id;

  UPDATE public.scp_assessment_versions
     SET content_status = 'published', validation_status = 'pilot', published_at = now()
   WHERE id = _ver_id;

  INSERT INTO public.scp_report_versions
    (report_key, version_number, content_status, audience, threshold_version,
     limitations_sv, limitations_en, published_at)
  VALUES
    ('fixture-participant', 1, 'published', 'participant', 'v1',
     ARRAY['Detta är en testfixtur och beskriver inte en verklig kompetensbedömning.',
           'Underlaget bygger på ett fåtal svar och ska inte tolkas som ett omdöme om personen.'],
     ARRAY['This is a test fixture and does not describe a real competence assessment.',
           'It rests on very few responses and must not be read as a judgement about the person.'],
     now()),
    ('fixture-employer', 1, 'published', 'employer', 'v1',
     ARRAY['Detta är en testfixtur och får inte användas som underlag för anställningsbeslut.',
           'Mognadsnivåer beskriver underlagets styrka, inte en rangordning av personer.'],
     ARRAY['This is a test fixture and must not inform any employment decision.',
           'Maturity levels describe the strength of the evidence, not a ranking of people.'],
     now())
  ON CONFLICT (report_key, version_number, audience) DO NOTHING;

  SELECT count(*) INTO _n
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.content_status = 'published' AND NOT d.is_test_fixture;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2C_REAL_CONTENT_PUBLISHED: % non-fixture versions published', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_form_items WHERE form_id = _form_id;
  IF _n <> 4 THEN
    RAISE EXCEPTION 'SCP_P2C_FORM_INCOMPLETE: expected 4 fixture items, found %', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM public.scp_form_items fi
    JOIN public.scp_item_texts it ON it.item_version_id = fi.item_version_id
   WHERE fi.form_id = _form_id AND it.language IN ('sv-SE','en-GB');
  IF _n <> 8 THEN
    RAISE EXCEPTION 'SCP_P2C_NOT_BILINGUAL: expected 8 item texts, found %', _n;
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'fixture-delivery-e2e', 'published',
  'Phase 2c: a test-only fixture programme published so the employer and participant journeys can be proven end to end. Four deliberately neutral items, one per supported format, bound to an existing observable behaviour rather than a second taxonomy. The real Security Guard programme remains draft and unassignable, awaiting the expert, legal, cognitive and accessibility reviews it genuinely needs.',
  jsonb_build_object(
    'migration', '20260808100000_scp_phase2c_test_fixture_programme',
    'is_test_fixture', true,
    'items', 4,
    'real_content_published', false));