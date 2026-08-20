-- #51 Batch 7 — six standalone competence-development programmes.
--
-- ── REUSE, NOT DUPLICATION ──────────────────────────────────────────────
--
-- Each programme is a curated path of two modules over the SAME governed
-- learning content authored in 20260828095000. The scenarios, options and
-- Learning Mode feedback are shared: a module version here points its
-- learning_form_id at an existing form rather than carrying a second copy of
-- the same material.
--
-- That is deliberate and it is the honest structure. An employer who wants only
-- reporting, or only access control, should get a short focused programme --
-- not a second authoring of scenarios that already exist and would then have to
-- be reviewed, translated and corrected twice. What differs between programmes
-- is the curation and the framing, which is exactly what a programme IS in this
-- model.
--
-- A module version belongs to one programme version, so each programme needs
-- its own module rows. The content those rows deliver is shared. Nothing here
-- copies a scenario.
--
-- ── PAIRING ─────────────────────────────────────────────────────────────
--
-- Each pair is chosen because the second module is what makes the first one
-- useful in practice. Observation is only worth something if it is reported;
-- access decisions turn into ethics questions the moment somebody senior
-- objects; an incident is judged afterwards on what was written down.
--
-- draft/design. Completing any of these records training_completion, which
-- carries counts_toward_maturity = false.

DO $$
DECLARE _jur uuid; _role uuid; _prog uuid; _pver uuid; _mod uuid; _mver uuid; _form uuid;
BEGIN
  SELECT id INTO _jur  FROM public.scp_jurisdictions WHERE code='SE';
  SELECT id INTO _role FROM public.scp_roles LIMIT 1;

  -- ── Situationsmedvetenhet & observation ──
  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-prog-situational-awareness', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Situationsmedvetenhet & observation', 'Situational awareness & observation', 'Att uppmärksamma vad som faktiskt händer i en miljö och föra det vidare så att någon annan kan agera på det.', 'Noticing what is actually happening in an environment and passing it on so somebody else can act on it.',
      ARRAY['Yrkeskompetens','Laglig behörighet','Lämplighet för anställning','Rangordning mellan personer'],
      ARRAY['Professional competence','Legal authority','Suitability for employment','Ranking between people'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-situational-awareness-sa-observation')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-observation-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 1, 'draft', 'Observation och avvikelsehantering', 'Observation and deviations', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 20, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-situational-awareness-sa-reporting')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-reporting-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 2, 'draft', 'Från iakttagelse till notering', 'From observation to note', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 15, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  -- ── Konfliktförebyggande & nedtrappning ──
  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-prog-conflict-prevention', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Konfliktförebyggande & nedtrappning', 'Conflict prevention & de-escalation', 'Att sänka spänningsnivån innan en situation trappas upp, och att hålla en gräns utan att förnedra någon.', 'Lowering tension before a situation escalates, and holding a boundary without humiliating anybody.',
      ARRAY['Yrkeskompetens','Laglig behörighet','Lämplighet för anställning','Rangordning mellan personer'],
      ARRAY['Professional competence','Legal authority','Suitability for employment','Ranking between people'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-conflict-prevention-cp-deescalation')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-conflict-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 1, 'draft', 'Konfliktförebyggande och nedtrappning', 'Conflict prevention and de-escalation', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 20, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-conflict-prevention-cp-ethics')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-ethics-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 2, 'draft', 'Yrkesansvar i pressade möten', 'Professional responsibility under pressure', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 15, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  -- ── Rapportering & dokumentation ──
  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-prog-reporting', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Rapportering & dokumentation', 'Reporting & documentation', 'Att dokumentera det som hänt så att nästa person kan agera på det: iakttagelse skild från tolkning, och rätt detaljer till rätt mottagare.', 'Documenting what happened so the next person can act on it: observation separated from interpretation, and the right detail to the right recipient.',
      ARRAY['Yrkeskompetens','Laglig behörighet','Lämplighet för anställning','Rangordning mellan personer'],
      ARRAY['Professional competence','Legal authority','Suitability for employment','Ranking between people'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-reporting-rp-reporting')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-reporting-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 1, 'draft', 'Rapportering och dokumentation', 'Reporting and documentation', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 20, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-reporting-rp-observation')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-observation-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 2, 'draft', 'Vad som är värt att notera', 'What is worth recording', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 15, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  -- ── Tillträde & behörighet ──
  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-prog-access', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Tillträde & behörighet', 'Access & authorisation', 'Att fatta beslut vid gränsen: vem som släpps in, på vilken grund, och vad som händer när regeln är socialt dyr att följa.', 'Deciding at the boundary: who is admitted, on what basis, and what happens when the rule is socially expensive to follow.',
      ARRAY['Yrkeskompetens','Laglig behörighet','Lämplighet för anställning','Rangordning mellan personer'],
      ARRAY['Professional competence','Legal authority','Suitability for employment','Ranking between people'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-access-ac-access')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-access-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 1, 'draft', 'Tillträde och behörighet', 'Access and authorisation', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 20, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-access-ac-ethics')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-ethics-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 2, 'draft', 'Att hålla rutinen när den ifrågasätts', 'Holding the routine when it is challenged', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 15, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  -- ── Incidenthantering & första åtgärder ──
  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-prog-incident', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Incidenthantering & första åtgärder', 'Incident response & first actions', 'De första minuterna: säkra platsen, larma rätt funktion med rätt information, och avstå från åtgärder utanför mandatet.', 'The first minutes: secure the scene, alert the right function with the right information, and refrain from action outside the mandate.',
      ARRAY['Yrkeskompetens','Laglig behörighet','Lämplighet för anställning','Rangordning mellan personer'],
      ARRAY['Professional competence','Legal authority','Suitability for employment','Ranking between people'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-incident-ir-incident')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-incident-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 1, 'draft', 'Incidenthantering och första åtgärder', 'Incident response and first actions', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 20, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-incident-ir-reporting')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-reporting-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 2, 'draft', 'Dokumentation under pågående händelse', 'Documenting while an incident is running', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 15, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  -- ── Etik, integritet & yrkesansvar ──
  INSERT INTO public.scp_programs (slug, role_id) VALUES ('sg-prog-ethics', _role)
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _prog;

  SELECT id INTO _pver FROM public.scp_program_versions WHERE program_id=_prog AND version_number=1;
  IF _pver IS NULL THEN
    INSERT INTO public.scp_program_versions
      (program_id, version_number, jurisdiction_id, content_status, validation_status,
       name_sv, name_en, purpose_sv, purpose_en, does_not_measure_sv, does_not_measure_en)
    VALUES (_prog, 1, _jur, 'draft', 'design', 'Etik, integritet & yrkesansvar', 'Ethics, integrity & professional responsibility', 'Att hantera känsliga uppgifter enligt uppdrag, och att veta var det egna mandatet slutar även när någon ber om mer.', 'Handling sensitive information according to the assignment, and knowing where your own mandate ends even when somebody asks for more.',
      ARRAY['Yrkeskompetens','Laglig behörighet','Lämplighet för anställning','Rangordning mellan personer'],
      ARRAY['Professional competence','Legal authority','Suitability for employment','Ranking between people'])
    RETURNING id INTO _pver;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-ethics-et-ethics')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-ethics-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 1, 'draft', 'Etik och yrkesansvar', 'Ethics and professional responsibility', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 20, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.scp_modules (slug) VALUES ('sg-prog-ethics-et-access')
  ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id INTO _mod;
  SELECT id INTO _mver FROM public.scp_module_versions WHERE module_id=_mod AND version_number=1;
  IF _mver IS NULL THEN
    SELECT id INTO _form FROM public.scp_forms WHERE slug='sg-lm-access-form';
    INSERT INTO public.scp_module_versions
      (module_id, program_version_id, version_number, display_order, content_status,
       name_sv, name_en, summary_sv, summary_en, estimated_minutes, learning_form_id)
    VALUES (_mod, _pver, 1, 2, 'draft', 'Mandatet vid gränsen', 'The mandate at the boundary', 'Övning med återkoppling efter varje svar.', 'Practice with feedback after each answer.', 15, _form)
    RETURNING id INTO _mver;
    -- Same behaviours as the shared source module, so evidence lands on the
    -- same graph nodes whichever programme delivered the practice.
    INSERT INTO public.scp_module_behaviour_map (module_version_id, behaviour_version_id)
    SELECT _mver, mbm.behaviour_version_id
      FROM public.scp_module_versions src
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id=src.id
     WHERE src.learning_form_id=_form AND src.id<>_mver
     ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Batch 7: six standalone development programmes created';
END $$;