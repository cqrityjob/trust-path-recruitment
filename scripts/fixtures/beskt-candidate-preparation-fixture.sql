-- BESKT PR 3 -- the LOCAL-ONLY fixture the routed browser walk runs against.
--
-- Everything here is SYNTHETIC. No real employer, candidate, job, application
-- or method is represented; the passwords are throwaways for a disposable
-- database on loopback; nothing here is a product seed and nothing here is
-- ever applied to a hosted project. The method it publishes is planted
-- content, which is exactly why it may only exist inside this fixture:
-- production must stay honest when no governed BESKT method is published.
--
--   beskt-recruiter@local.test    owner of BESKT Journey AB   -- assigns, reads back
--   beskt-candidate@local.test    the applicant               -- walks the preparation
--   beskt-candidate2@local.test   a different applicant       -- must be refused
--   beskt-outsider@local.test     owner of BESKT Rival AB     -- must be refused
--
-- Password for all four: LocalJourney!2026
--
-- Run against a LOCAL stack only:
--   psql "$LOCAL_DB_URL" -f scripts/fixtures/beskt-candidate-preparation-fixture.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  -- A fixture that creates sign-in credentials must be incapable of running
  -- by accident against a database holding real people.
  IF current_database() NOT IN ('postgres', 'beskt_e2e', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'BCP_FIXTURE_WRONG_DATABASE: this fixture creates sign-in credentials and runs only against a disposable local database (got "%").',
      current_database();
  END IF;
END $$;

-- Act as a signed-in principal: the JWT claims auth.uid() reads.
CREATE OR REPLACE FUNCTION pg_temp.become(_u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _u::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.nobody() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 - The people.
--
-- GoTrue scans the token columns as non-nullable strings, so they are '' and
-- not NULL: a fixture that leaves them NULL produces a 500 on sign-in with
-- the unhelpful message "Database error querying schema".
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-4000-8000-0000000000d1',
   'authenticated', 'authenticated', 'beskt-recruiter@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Rekryterare Journey"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'beskt-candidate@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Kandidat Journey"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'beskt-candidate2@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Annan Kandidat"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-4000-8000-0000000000d2',
   'authenticated', 'authenticated', 'beskt-outsider@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Rekryterare Rival"}'::jsonb, now(), now(), '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  FROM auth.users u
 WHERE u.id IN ('b4000000-0000-4000-8000-0000000000d1', 'b4000000-0000-4000-8000-0000000000c1',
                'b4000000-0000-4000-8000-0000000000c2', 'b4000000-0000-4000-8000-0000000000d2')
ON CONFLICT (provider, provider_id) DO NOTHING;

-- The governance actors. They never sign in: a method reaches `published`
-- only through their separate, gate-specific decisions, so they exist as
-- distinct people rather than as one convenient superuser.
INSERT INTO auth.users (id, email) VALUES
  ('b4000000-0000-4000-8000-0000000000e1', 'beskt-journey-editor@local.test'),
  ('b4000000-0000-4000-8000-0000000000a1', 'beskt-journey-reviewer1@local.test'),
  ('b4000000-0000-4000-8000-0000000000a2', 'beskt-journey-reviewer2@local.test'),
  ('b4000000-0000-4000-8000-0000000000a3', 'beskt-journey-reviewer3@local.test'),
  ('b4000000-0000-4000-8000-0000000000a4', 'beskt-journey-reviewer4@local.test'),
  ('b4000000-0000-4000-8000-0000000000a5', 'beskt-journey-reviewer5@local.test'),
  ('b4000000-0000-4000-8000-0000000000b1', 'beskt-journey-publisher@local.test'),
  ('b4000000-0000-4000-8000-00000000ad01', 'beskt-journey-admin@local.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b4000000-0000-4000-8000-00000000ad01', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('b4000000-0000-4000-8000-0000000000e1', 'editor'),
  ('b4000000-0000-4000-8000-0000000000a1', 'reviewer'),
  ('b4000000-0000-4000-8000-0000000000a2', 'reviewer'),
  ('b4000000-0000-4000-8000-0000000000a3', 'reviewer'),
  ('b4000000-0000-4000-8000-0000000000a4', 'reviewer'),
  ('b4000000-0000-4000-8000-0000000000a5', 'reviewer'),
  ('b4000000-0000-4000-8000-0000000000b1', 'publisher')
ON CONFLICT (user_id, role) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2 - Two employers. The second exists so a cross-tenant refusal can be
--     WALKED in a browser rather than only asserted in SQL.
-- ---------------------------------------------------------------------------
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b4000000-0000-4000-8000-00000000ee01', 'BESKT Journey AB', 'beskt-journey-ab', 'active'),
  ('b4000000-0000-4000-8000-00000000ee02', 'BESKT Rival AB', 'beskt-rival-ab', 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active';

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('b4000000-0000-4000-8000-0000000000d1', 'b4000000-0000-4000-8000-00000000ee01', 'owner', 'active'),
  ('b4000000-0000-4000-8000-0000000000d2', 'b4000000-0000-4000-8000-00000000ee02', 'owner', 'active')
ON CONFLICT (user_id, employer_id) DO UPDATE SET status = 'active', role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- 3 - A job, and the applications a preparation can be started FROM.
--
-- A preparation is never created out of thin air: it hangs off an existing
-- application, so the fixture has to make one exist.
-- ---------------------------------------------------------------------------
-- Created and published through the platform's own moderation path, as the
-- planted platform administrator: employers may only create DRAFT jobs, and
-- `published_at` is moderation-owned. Forcing either past its guard would
-- make the walk start from a state the product cannot reach.
DO $job$
BEGIN
  PERFORM pg_temp.become('b4000000-0000-4000-8000-00000000ad01');
  INSERT INTO public.jobs (id, slug, short_id, employer_id, application_method,
                           title_sv, title_en, status, published_at, expires_at)
  VALUES ('b4000000-0000-4000-8000-00000000ff01', 'beskt-journey-vaktare', 'BJVAK1',
          'b4000000-0000-4000-8000-00000000ee01', 'internal',
          'Väktare (syntetisk annons)', 'Security officer (synthetic listing)',
          'published', now(), now() + interval '90 days')
  ON CONFLICT (id) DO UPDATE SET status = 'published', published_at = now();
  PERFORM pg_temp.nobody();
END $job$;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES ('b4000000-0000-4000-8000-00000000aa01', 'b4000000-0000-4000-8000-00000000ff01',
        'b4000000-0000-4000-8000-00000000ee01', 'b4000000-0000-4000-8000-0000000000c1', now()),
       ('b4000000-0000-4000-8000-00000000aa02', 'b4000000-0000-4000-8000-00000000ff01',
        'b4000000-0000-4000-8000-00000000ee01', 'b4000000-0000-4000-8000-0000000000c2', now())
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- 4 - ONE synthetic governed method, taken to `published` the only way the
--     contract allows: an editor authors it, five DIFFERENT reviewers each
--     approve their own gate, and a publisher who is not the author publishes
--     it. Nothing is forced past a guard and no state is written directly.
--
--     This is planted content inside a disposable local database. It is not,
--     and must never become, a production seed: with no governed method
--     published, the product's honest answer is that the method is still
--     under development, and that is what production says.
-- ---------------------------------------------------------------------------

DO $build$
DECLARE
  _editor    uuid := 'b4000000-0000-4000-8000-0000000000e1';
  _publisher uuid := 'b4000000-0000-4000-8000-0000000000b1';
  _admin     uuid := 'b4000000-0000-4000-8000-00000000ad01';
  _employer  uuid := 'b4000000-0000-4000-8000-00000000ee01';
  _gates     text[] := ARRAY['personnel_security', 'senior_hr', 'recruitment',
                             'employment_privacy_legal', 'data_protection'];
  _reviewers uuid[] := ARRAY['b4000000-0000-4000-8000-0000000000a1'::uuid,
                             'b4000000-0000-4000-8000-0000000000a2'::uuid,
                             'b4000000-0000-4000-8000-0000000000a3'::uuid,
                             'b4000000-0000-4000-8000-0000000000a4'::uuid,
                             'b4000000-0000-4000-8000-0000000000a5'::uuid];
  _r jsonb;
  _pack uuid; _v uuid; _p1 uuid;
  _s1 uuid; _s2 uuid;
  _i1 uuid; _i2 uuid; _i3 uuid; _i4 uuid; _i5 uuid; _i6 uuid;
  _o_yes uuid; _o_no uuid;
  _state text; _k integer; _fk text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_interview_packs WHERE slug = 'beskt-journey-synthetic') THEN
    RAISE NOTICE 'the synthetic journey method already exists; leaving it alone';
    RETURN;
  END IF;

  -- 4.1 the gate mandates, minted by the platform administrator
  PERFORM pg_temp.become(_admin);
  SET LOCAL ROLE authenticated;
  FOR _k IN 1 .. array_length(_gates, 1) LOOP
    PERFORM public.beskt_grant_governance(gen_random_uuid(), _reviewers[_k], _gates[_k],
      'Syntetiskt mandat för lokal genomgång. Inget skarpt bruk.');
  END LOOP;
  RESET ROLE;
  PERFORM pg_temp.nobody();

  -- 4.2 identity and version, authored through the governed RPCs
  PERFORM pg_temp.become(_editor);
  SET LOCAL ROLE authenticated;
  _r := public.beskt_create_method(gen_random_uuid(), 'beskt-journey-synthetic',
          'SYNTETISK BESKT-metod för genomgång',
          'Syntetiskt innehåll för den lokala webbläsargenomgången. Inte en produktmetod.',
          'SYNTHETIC BESKT method for the walkthrough');
  _pack := (_r ->> 'pack_id')::uuid;
  _r := public.beskt_create_method_version(gen_random_uuid(), _pack, 'recruitment_support',
          'synthetic-journey-fixture', 'journey-1', 'cqrity_design_hypothesis',
          'Syntetisk sammanfattning för genomgången.', 'Synthetic summary for the walkthrough.');
  _v := (_r ->> 'method_version_id')::uuid;
  RESET ROLE;
  PERFORM pg_temp.nobody();

  -- 4.3 the content itself, planted as the database owner -- which is exactly
  --     how a migration would establish governed content.
  INSERT INTO public.beskt_exposure_profiles
    (method_version_id, profile_key, display_order, exposure_area, duties_sv, duties_en,
     role_relevance_rationale_sv, role_relevance_rationale_en, permitted_mode, owning_review_role,
     jurisdiction_reference, lawful_basis_reference, retention_class, access_class,
     content_provenance, source_reference)
  VALUES (_v, 'lone_working', 1, 'lone_working',
          'Ensamarbete nattetid på en bevakad anläggning.', 'Lone working at night on a guarded site.',
          'Rollen innebär ensamarbete utan kollega på plats.',
          'The role involves lone working with no colleague on site.',
          'recruitment_support', 'recruitment', 'SE',
          'Rättslig grund: syntetisk referens för test.', 'recruitment_record', 'recruiter',
          'cqrity_design_hypothesis', 'synthetic-journey-fixture')
  RETURNING id INTO _p1;

  INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase, title_sv, title_en)
  VALUES (_v, 'preparation', 1, 'candidate_preparation', 'Förberedelse', 'Preparation') RETURNING id INTO _s1;
  INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase, title_sv, title_en)
  VALUES (_v, 'interview_topics', 2, 'interview', 'Intervjuämnen', 'Interview topics') RETURNING id INTO _s2;

  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'lone_working_experience', 1,
     'Har du erfarenhet av ensamarbete?', 'Do you have experience of lone working?',
     'Rollen innebär ensamarbete.', 'The role involves lone working.',
     'recruitment_support', 'candidate_preparation', 'single_choice', 'required', true,
     'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-journey-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i1;

  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'lone_working_example', 2,
     'Beskriv en situation du hanterade under ensamarbete.', 'Describe a situation you handled while working alone.',
     'Konkreta exempel ger underlag för samtalet.', 'Concrete examples give a basis for the conversation.',
     'recruitment_support', 'candidate_preparation', 'long_text', 'voluntary', true,
     'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-journey-fixture',
     ARRAY['suitability_inference', 'credibility_or_deception_inference'])
  RETURNING id INTO _i2;

  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'reported_incident', 3,
     'Har du rapporterat en avvikelse i tjänsten?', 'Have you reported an incident on duty?',
     'Rapportering ingår i rollen.', 'Reporting is part of the role.',
     'recruitment_support', 'candidate_preparation', 'boolean', 'required', true,
     'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-journey-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i3;

  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'incident_context', 4,
     'Beskriv kort sammanhanget.', 'Briefly describe the context.',
     'Sammanhang behövs för underlaget.', 'Context is needed for the basis.',
     'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', true,
     'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-journey-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i4;

  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'information_acknowledged', 5,
     'Jag har tagit del av informationen om förberedelsen.', 'I have read the information about the preparation.',
     'Kandidaten ska ha fått informationen.', 'The candidate must have received the information.',
     'recruitment_support', 'candidate_preparation', 'acknowledgement', 'required', false,
     'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-journey-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i5;

  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s2, _p1, 'interview_topic_lone_working', 1,
     'Ensamarbete i praktiken.', 'Lone working in practice.',
     'Intervjuämne från dokumenterad rollrelevans.', 'Interview topic from documented role relevance.',
     'recruitment_support', 'interview', 'long_text', 'voluntary', true,
     'ordinary', 'beskt_interviewer', 'cqrity_design_hypothesis', 'synthetic-journey-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i6;

  INSERT INTO public.beskt_item_options (item_id, option_key, display_order, label_sv, label_en)
  VALUES (_i1, 'yes', 1, 'Ja', 'Yes') RETURNING id INTO _o_yes;
  INSERT INTO public.beskt_item_options (item_id, option_key, display_order, label_sv, label_en)
  VALUES (_i1, 'no', 2, 'Nej', 'No') RETURNING id INTO _o_no;

  INSERT INTO public.beskt_prompts
    (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage,
     addressee, question_form, permitted_probe_bases, permitted_mode, wording_sv, wording_en,
     content_provenance, source_reference)
  VALUES
    (_v, _p1, NULL, 'p1_planning', 1, 'planning_from_role_relevance', 'planning', 'interviewer', 'information_notice',
     '{}', 'recruitment_support', 'Planera utifrån dokumenterad rollrelevans.', 'Plan from documented role relevance.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_purpose', 2, 'purpose_explanation', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Syftet med samtalet är att förstå din erfarenhet.', 'The purpose of this conversation is to understand your experience.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_process', 3, 'process_explanation', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Så här går samtalet till.', 'This is how the conversation proceeds.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_voluntary', 4, 'voluntariness_notice', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Du väljer själv vad du vill berätta.', 'You choose what you want to tell.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_human', 5, 'human_decision_notice', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Beslut fattas av arbetsgivaren, inte av systemet.', 'Decisions are made by the employer, not by the system.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_open', 6, 'open_invitation', 'account', 'candidate', 'open_question',
     '{}', 'recruitment_support', 'Berätta om ditt arbete med ensamarbete.', 'Tell me about your work with lone working.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_free', 7, 'free_account', 'account', 'candidate', 'free_recall',
     '{}', 'recruitment_support', 'Beskriv fritt hur en typisk natt såg ut.', 'Describe freely what a typical night looked like.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, _i2, 'p1_example', 8, 'behavioural_example', 'account', 'candidate', 'cued_recall',
     ARRAY['submitted_answer'], 'recruitment_support', 'Ge ett konkret exempel på en situation du hanterade.', 'Give a concrete example of a situation you handled.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_listen', 9, 'listening_reflection', 'account', 'candidate', 'reflective_readback',
     '{}', 'recruitment_support', 'Om jag förstår dig rätt så gjorde du så här.', 'If I understand you correctly, this is what you did.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, _i2, 'p1_probe', 10, 'specific_probe', 'account', 'candidate', 'neutral_clarification',
     ARRAY['submitted_answer'], 'recruitment_support', 'Vad gjorde du först i den situationen?', 'What did you do first in that situation?',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_context', 11, 'context_opportunity', 'account', 'candidate', 'open_question',
     '{}', 'recruitment_support', 'Finns det något i sammanhanget du vill lägga till?', 'Is there anything about the context you want to add?',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_correct', 12, 'correction_opportunity', 'account', 'candidate', 'open_question',
     '{}', 'recruitment_support', 'Vill du rätta något av det du skrev?', 'Would you like to correct anything you wrote?',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_difference', 13, 'neutral_difference_exploration', 'account', 'candidate', 'neutral_clarification',
     ARRAY['submitted_answer', 'candidate_correction'], 'recruitment_support', 'Här finns två olika uppgifter; hur hänger de ihop?', 'There are two different statements here; how do they fit together?',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_summary', 14, 'summary_confirmation', 'account', 'candidate', 'summary_readback',
     '{}', 'recruitment_support', 'Har jag uppfattat dig rätt?', 'Have I understood you correctly?',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture'),
    (_v, _p1, NULL, 'p1_closure', 15, 'closure_next_step', 'closure', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Nästa steg är att arbetsgivaren återkommer.', 'The next step is that the employer will get back to you.',
     'cqrity_design_hypothesis', 'synthetic-journey-fixture');

  INSERT INTO public.beskt_prompts
    (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage,
     addressee, question_form, permitted_probe_bases, permitted_mode, evaluation_template_key,
     wording_sv, wording_en, content_provenance, source_reference)
  VALUES
    (_v, _p1, NULL, 'p1_evaluation', 16, 'interviewer_self_review', 'evaluation', 'interviewer', 'reflective_readback',
     '{}', 'recruitment_support', 'method_adherence',
     public.beskt_evaluation_template('method_adherence', 'sv'),
     public.beskt_evaluation_template('method_adherence', 'en'),
     'cqrity_design_hypothesis', 'synthetic-journey-fixture');

  -- Routing, so the walk exercises a real conditional: the example is asked
  -- only of a candidate who says they have the experience, and the context
  -- only of one who says they reported something.
  INSERT INTO public.beskt_routing_rules
    (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind,
     condition_option_id, condition_boolean, action, target_item_id)
  VALUES
    (_v, 'show_example_when_experienced', 1, 'recruitment_support', _i1, 'option_selected', _o_yes, NULL, 'show', _i2),
    (_v, 'show_context_when_reported', 2, 'recruitment_support', _i3, 'boolean_equals', NULL, true, 'show', _i4);

  FOR _state IN SELECT unnest(ARRAY['unaddressed', 'clarification_needed', 'sufficiently_clarified',
      'external_verification_needed', 'conflicting_information', 'insufficient_basis', 'not_applicable']) LOOP
    INSERT INTO public.beskt_evidence_anchors
      (method_version_id, evidence_state, definition_sv, definition_en, inclusion_criteria_sv, inclusion_criteria_en,
       exclusion_criteria_sv, exclusion_criteria_en, supporting_evidence_examples_sv, supporting_evidence_examples_en,
       counter_evidence_and_protective_factors_sv, counter_evidence_and_protective_factors_en,
       prohibited_inferences, required_next_action)
    VALUES
      (_v, _state, 'Definition (sv) ' || _state, 'Definition (en) ' || _state,
       'Ingår när underlaget är ' || _state, 'Included when the basis is ' || _state,
       'Ingår inte när underlaget är annat.', 'Excluded when the basis is otherwise.',
       'Exempel på stödjande underlag.', 'Examples of supporting basis.',
       'Motbevis och skyddande faktorer beaktas.', 'Counter-evidence and protective factors are considered.',
       CASE _state WHEN 'unaddressed' THEN ARRAY['omission_as_negative_evidence', 'suitability_inference']
                   WHEN 'conflicting_information' THEN ARRAY['inconsistency_as_dishonesty', 'credibility_or_deception_inference']
                   ELSE ARRAY['suitability_inference'] END,
       CASE _state WHEN 'unaddressed' THEN 'clarify_with_candidate'
                   WHEN 'clarification_needed' THEN 'clarify_with_candidate'
                   WHEN 'sufficiently_clarified' THEN 'none'
                   WHEN 'external_verification_needed' THEN 'external_verification'
                   WHEN 'conflicting_information' THEN 'offer_candidate_correction'
                   WHEN 'insufficient_basis' THEN 'record_insufficient_basis'
                   ELSE 'none' END);
  END LOOP;

  _k := 0;
  FOR _fk IN SELECT unnest(ARRAY['fact', 'source_provenance', 'role_exposure_link', 'interviewer_interpretation',
      'candidate_explanation', 'counter_evidence', 'protective_factor', 'verification_need', 'candidate_correction',
      'sensitivity_access_class']) LOOP
    _k := _k + 1;
    INSERT INTO public.beskt_observation_fields
      (method_version_id, field_key, ordinal, recorded_by, is_judgement, label_sv, label_en, definition_sv, definition_en)
    VALUES (_v, _fk, _k,
      CASE WHEN _fk IN ('candidate_explanation', 'candidate_correction') THEN 'candidate'
           WHEN _fk = 'sensitivity_access_class' THEN 'system' ELSE 'interviewer' END,
      _fk = 'interviewer_interpretation',
      'Etikett ' || _fk, 'Label ' || _fk, 'Definition ' || _fk, 'Definition ' || _fk);
  END LOOP;

  -- 4.4 one governed touch, so the stored content hash names what was planted
  PERFORM pg_temp.become(_editor);
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_touch_draft(gen_random_uuid(), _v,
    (SELECT revision FROM public.beskt_method_versions WHERE id = _v), 'fixture planted');
  PERFORM public.beskt_submit_for_review(gen_random_uuid(), _v,
    (SELECT revision FROM public.beskt_method_versions WHERE id = _v));
  RESET ROLE;
  PERFORM pg_temp.nobody();

  -- 4.5 five separate human gates, each by its own reviewer
  FOR _k IN 1 .. array_length(_gates, 1) LOOP
    PERFORM pg_temp.become(_reviewers[_k]);
    SET LOCAL ROLE authenticated;
    PERFORM public.beskt_record_review(gen_random_uuid(), _v,
      (SELECT revision FROM public.beskt_method_versions WHERE id = _v),
      _gates[_k], 'approved', 'Granskad för den lokala genomgången. Reviewed for the local walkthrough.');
    RESET ROLE;
    PERFORM pg_temp.nobody();
  END LOOP;

  -- 4.6 published by someone who is not its author
  PERFORM pg_temp.become(_publisher);
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_publish_version(gen_random_uuid(), _v,
    (SELECT revision FROM public.beskt_method_versions WHERE id = _v),
    'Publicerad för den lokala genomgången.');
  RESET ROLE;
  PERFORM pg_temp.nobody();

  -- 4.7 the pilot grant: PR 3's whole release authority, for ONE employer,
  --     time-boxed, minted by a platform administrator. BESKT Rival AB gets
  --     none, which is what makes its refusal in the browser meaningful.
  PERFORM pg_temp.become(_admin);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_grant_pilot(gen_random_uuid(), _employer, _v,
    'Lokal genomgång inför granskning. Syntetiskt innehåll, inget skarpt bruk.',
    (current_date + 14));
  RESET ROLE;
  PERFORM pg_temp.nobody();

  RAISE NOTICE 'synthetic journey method published: %', _v;
END $build$;

-- ---------------------------------------------------------------------------
-- What the walk needs to address the routes it will visit.
-- ---------------------------------------------------------------------------
SELECT 'E2E_EMPLOYER_SLUG=' || e.slug AS env FROM public.employers e
 WHERE e.id = 'b4000000-0000-4000-8000-00000000ee01'
UNION ALL
SELECT 'E2E_APPLICATION_ID=b4000000-0000-4000-8000-00000000aa01'
UNION ALL
SELECT 'E2E_OTHER_APPLICATION_ID=b4000000-0000-4000-8000-00000000aa02'
UNION ALL
SELECT 'E2E_METHOD_VERSION_ID=' || v.id::text
  FROM public.beskt_method_versions v
  JOIN public.scp_interview_packs m ON m.id = v.pack_id
 WHERE m.slug = 'beskt-journey-synthetic'
UNION ALL
SELECT 'fixture ready: ' || count(*)::text || ' live pilot grant(s)'
  FROM public.bcp_pilot_grants WHERE revoked_at IS NULL;
