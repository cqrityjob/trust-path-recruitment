-- BESKT PR 2 -- the shared synthetic fixture: test helpers, planted actors,
-- gate grants and the synthetic method builder. Included by
-- beskt_governed_content_test.sql (inside its transaction, rolled back) and
-- by scripts/db-test.sh for the two-session races (committed, then removed
-- by the BESKT rollback and an explicit cleanup).
--
-- Every row planted here is SYNTHETIC test content, clearly named as such.
-- It is never a product seed.
--
-- Requires an open transaction: the handle tables are ON COMMIT DROP.

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

-- Act as a signed-in principal: the JWT claims the harness's auth.uid() reads.
CREATE OR REPLACE FUNCTION pg_temp.become(_u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _u::text, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.nobody() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

-- Run one statement as a role + principal, restoring the owner afterwards.
CREATE OR REPLACE FUNCTION pg_temp.as_user(_role text, _u uuid, stmt text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.become(_u);
  EXECUTE format('SET LOCAL ROLE %I', _role);
  EXECUTE stmt;
  RESET ROLE;
  PERFORM pg_temp.nobody();
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM pg_temp.nobody();
  RAISE;
END $$;

-- must_fail, but as a role + principal. The statement text is a plain
-- string, so no nested quoting is needed.
CREATE OR REPLACE FUNCTION pg_temp.must_fail_as(_role text, _u uuid, stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  PERFORM pg_temp.become(_u);
  EXECUTE format('SET LOCAL ROLE %I', _role);
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    RESET ROLE; PERFORM pg_temp.nobody();
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RESET ROLE; PERFORM pg_temp.nobody();
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

-- ---------------------------------------------------------------------------
-- Fixture actors. Distinct people on purpose: separation of duties is only
-- testable with more than one human. Editors e1/e2, reviewers r1..r6,
-- publisher pub, a publisher who is also the author (auth), an ordinary
-- signed-in user with no role, a candidate, and two employer members (one of
-- an active employer, one of a suspended employer).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('b2000000-0000-4000-8000-0000000000e1', 'beskt-editor@test.local'),
  ('b2000000-0000-4000-8000-0000000000e2', 'beskt-editor2@test.local'),
  ('b2000000-0000-4000-8000-0000000000a1', 'beskt-reviewer1@test.local'),
  ('b2000000-0000-4000-8000-0000000000a2', 'beskt-reviewer2@test.local'),
  ('b2000000-0000-4000-8000-0000000000a3', 'beskt-reviewer3@test.local'),
  ('b2000000-0000-4000-8000-0000000000a4', 'beskt-reviewer4@test.local'),
  ('b2000000-0000-4000-8000-0000000000a5', 'beskt-reviewer5@test.local'),
  ('b2000000-0000-4000-8000-0000000000a6', 'beskt-reviewer6@test.local'),
  ('b2000000-0000-4000-8000-0000000000b1', 'beskt-publisher@test.local'),
  ('b2000000-0000-4000-8000-0000000000b2', 'beskt-author-publisher@test.local'),
  ('b2000000-0000-4000-8000-0000000000c1', 'beskt-candidate@test.local'),
  ('b2000000-0000-4000-8000-0000000000d1', 'beskt-employer-member@test.local'),
  ('b2000000-0000-4000-8000-0000000000d2', 'beskt-suspended-member@test.local'),
  ('b2000000-0000-4000-8000-0000000000f1', 'beskt-roleless@test.local'),
  ('b2000000-0000-4000-8000-0000000000ad', 'beskt-platform-admin@test.local'),
  ('b2000000-0000-4000-8000-0000000000fa', 'beskt-internal-qa@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b2000000-0000-4000-8000-0000000000ad', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('b2000000-0000-4000-8000-0000000000e1', 'editor'),
  ('b2000000-0000-4000-8000-0000000000e2', 'editor'),
  ('b2000000-0000-4000-8000-0000000000a1', 'reviewer'),
  ('b2000000-0000-4000-8000-0000000000a2', 'reviewer'),
  ('b2000000-0000-4000-8000-0000000000a3', 'reviewer'),
  ('b2000000-0000-4000-8000-0000000000a4', 'reviewer'),
  ('b2000000-0000-4000-8000-0000000000a5', 'reviewer'),
  ('b2000000-0000-4000-8000-0000000000a6', 'reviewer'),
  ('b2000000-0000-4000-8000-0000000000b1', 'publisher'),
  ('b2000000-0000-4000-8000-0000000000b2', 'editor'),
  ('b2000000-0000-4000-8000-0000000000b2', 'publisher')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b2000000-0000-4000-8000-00000000ee01', 'BESKT Active Employer', 'beskt-active-employer', 'active'),
  ('b2000000-0000-4000-8000-00000000ee02', 'BESKT Suspended Employer', 'beskt-suspended-employer', 'suspended')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('b2000000-0000-4000-8000-0000000000d1', 'b2000000-0000-4000-8000-00000000ee01', 'owner', 'active'),
  ('b2000000-0000-4000-8000-0000000000d2', 'b2000000-0000-4000-8000-00000000ee02', 'owner', 'active')
ON CONFLICT DO NOTHING;

-- Gate grants, made by the platform admin through the governed contract:
-- each reviewer holds exactly one gate (a6 holds data_protection too, for
-- the rejection scenario), q1 holds internal QA. Recorded in a temp table so
-- later groups can revoke them by id.
CREATE TEMP TABLE bk_grants (who uuid, kind text, grant_id uuid) ON COMMIT DROP;
GRANT ALL ON bk_grants TO authenticated;
DO $$
DECLARE _r record; _g jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-4000-8000-0000000000ad', 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-0000000000ad', true);
  SET LOCAL ROLE authenticated;
  FOR _r IN SELECT * FROM (VALUES
      ('b2000000-0000-4000-8000-0000000000a1'::uuid, 'personnel_security'),
      ('b2000000-0000-4000-8000-0000000000a2'::uuid, 'senior_hr'),
      ('b2000000-0000-4000-8000-0000000000a3'::uuid, 'recruitment'),
      ('b2000000-0000-4000-8000-0000000000a4'::uuid, 'employment_privacy_legal'),
      ('b2000000-0000-4000-8000-0000000000a5'::uuid, 'data_protection'),
      ('b2000000-0000-4000-8000-0000000000a6'::uuid, 'data_protection'),
      ('b2000000-0000-4000-8000-0000000000fa'::uuid, 'internal_qa')) AS t(who, kind) LOOP
    _g := public.beskt_grant_governance(gen_random_uuid(), _r.who, _r.kind, 'synthetic test mandate');
    INSERT INTO bk_grants VALUES (_r.who, _r.kind, (_g ->> 'grant_id')::uuid);
  END LOOP;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

-- Handles shared across DO blocks.
CREATE TEMP TABLE bk (
  rec_pack uuid, rec_v uuid, rec_p1 uuid, rec_s1 uuid, rec_s2 uuid,
  rec_i1 uuid, rec_i2 uuid, rec_i3 uuid, rec_i4 uuid, rec_i5 uuid, rec_i6 uuid,
  rec_o_yes uuid, rec_o_no uuid,
  sv_pack uuid, sv_v uuid, sv_p1 uuid, sv_p2 uuid, sv_s1 uuid, sv_i1 uuid, sv_i7 uuid, sv_i8 uuid,
  hash_before text, scratch text, scratch2 text, n bigint
) ON COMMIT DROP;
INSERT INTO bk DEFAULT VALUES;
GRANT ALL ON bk TO authenticated;

-- ---------------------------------------------------------------------------
-- The synthetic method builder. Identity and version through the governed
-- RPCs (as the editor); children planted directly as the database owner,
-- which is exactly how a migration fixture would establish content; then one
-- governed touch so the stored hash names what was planted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.build_method(_slug text, _mode text,
  _author uuid DEFAULT 'b2000000-0000-4000-8000-0000000000e1', _store boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  _pack uuid; _v uuid; _p1 uuid; _p2 uuid; _s1 uuid; _s2 uuid;
  _i1 uuid; _i2 uuid; _i3 uuid; _i4 uuid; _i5 uuid; _i6 uuid; _i7 uuid; _i8 uuid;
  _o_yes uuid; _o_no uuid;
  _r jsonb; _st text; _fk text; _k integer;
BEGIN
  PERFORM pg_temp.become(_author);
  SET LOCAL ROLE authenticated;
  _r := public.beskt_create_method(gen_random_uuid(), _slug,
          'SYNTETISK BESKT-testmetod', 'Syntetiskt testinnehåll för databassviten. Inte en produktmetod.',
          'SYNTHETIC BESKT test method');
  _pack := (_r ->> 'pack_id')::uuid;
  _r := public.beskt_create_method_version(gen_random_uuid(), _pack, _mode,
          'synthetic-fixture', 'test-1', 'cqrity_design_hypothesis',
          'Syntetisk sammanfattning', 'Synthetic summary');
  _v := (_r ->> 'method_version_id')::uuid;
  RESET ROLE;
  PERFORM pg_temp.nobody();

  INSERT INTO public.beskt_exposure_profiles
    (method_version_id, profile_key, display_order, exposure_area, duties_sv, duties_en,
     role_relevance_rationale_sv, role_relevance_rationale_en, permitted_mode, owning_review_role,
     jurisdiction_reference, lawful_basis_reference, retention_class, access_class,
     content_provenance, source_reference)
  VALUES (_v, 'lone_working', 1, 'lone_working', 'Ensamarbete nattetid.', 'Lone working at night.',
          'Rollen innebär ensamarbete.', 'The role involves lone working.', 'recruitment_support',
          'recruitment', 'SE', 'GDPR art. 6(1)(b) synthetic', 'recruitment_record', 'recruiter',
          'cqrity_design_hypothesis', 'synthetic-fixture')
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
    (_v, _s1, _p1, 'lone_working_experience', 1, 'Har du erfarenhet av ensamarbete?', 'Do you have experience of lone working?',
     'Rollen innebär ensamarbete.', 'The role involves lone working.', 'recruitment_support', 'candidate_preparation',
     'single_choice', 'required', true, 'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i1;
  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'lone_working_example', 2, 'Beskriv en situation.', 'Describe a situation.',
     'Konkreta exempel ger underlag.', 'Concrete examples give a basis.', 'recruitment_support', 'candidate_preparation',
     'long_text', 'voluntary', true, 'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-fixture',
     ARRAY['suitability_inference', 'credibility_or_deception_inference'])
  RETURNING id INTO _i2;
  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'reported_incident', 3, 'Har du rapporterat en avvikelse?', 'Have you reported an incident?',
     'Rapportering ingår i rollen.', 'Reporting is part of the role.', 'recruitment_support', 'candidate_preparation',
     'boolean', 'required', true, 'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i3;
  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'incident_context', 4, 'Beskriv sammanhanget.', 'Describe the context.',
     'Sammanhang behövs för underlaget.', 'Context is needed for the basis.', 'recruitment_support', 'candidate_preparation',
     'short_text', 'voluntary', true, 'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i4;
  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s1, _p1, 'information_acknowledged', 5, 'Jag har tagit del av informationen.', 'I have read the information.',
     'Kandidaten ska ha fått informationen.', 'The candidate must have received the information.', 'recruitment_support',
     'candidate_preparation', 'acknowledgement', 'required', false, 'ordinary', 'recruiter',
     'cqrity_design_hypothesis', 'synthetic-fixture', ARRAY['suitability_inference'])
  RETURNING id INTO _i5;
  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
     purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
     sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES
    (_v, _s2, _p1, 'interview_topic_lone_working', 1, 'Ensamarbete i praktiken.', 'Lone working in practice.',
     'Intervjuämne från rollrelevans.', 'Interview topic from role relevance.', 'recruitment_support', 'interview',
     'long_text', 'voluntary', true, 'ordinary', 'beskt_interviewer', 'cqrity_design_hypothesis', 'synthetic-fixture',
     ARRAY['suitability_inference'])
  RETURNING id INTO _i6;

  INSERT INTO public.beskt_item_options (item_id, option_key, display_order, label_sv, label_en)
  VALUES (_i1, 'yes', 1, 'Ja', 'Yes') RETURNING id INTO _o_yes;
  INSERT INTO public.beskt_item_options (item_id, option_key, display_order, label_sv, label_en)
  VALUES (_i1, 'no', 2, 'Nej', 'No') RETURNING id INTO _o_no;

  -- Prompts for profile 1, in conduct order.
  INSERT INTO public.beskt_prompts
    (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage,
     addressee, question_form, permitted_probe_bases, permitted_mode, wording_sv, wording_en,
     content_provenance, source_reference)
  VALUES
    (_v, _p1, NULL, 'p1_planning', 1, 'planning_from_role_relevance', 'planning', 'interviewer', 'information_notice',
     '{}', 'recruitment_support', 'Planera utifrån dokumenterad rollrelevans.', 'Plan from documented role relevance.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_purpose', 2, 'purpose_explanation', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Syftet med samtalet är att förstå din erfarenhet.', 'The purpose of this conversation is to understand your experience.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_process', 3, 'process_explanation', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Så här går samtalet till.', 'This is how the conversation proceeds.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_voluntary', 4, 'voluntariness_notice', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Du väljer själv vad du vill berätta.', 'You choose what you want to tell.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_human', 5, 'human_decision_notice', 'engage_explain', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Beslut fattas av arbetsgivaren, inte av systemet.', 'Decisions are made by the employer, not by the system.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_open', 6, 'open_invitation', 'account', 'candidate', 'open_question',
     '{}', 'recruitment_support', 'Berätta om ditt arbete med ensamarbete.', 'Tell me about your work with lone working.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_free', 7, 'free_account', 'account', 'candidate', 'free_recall',
     '{}', 'recruitment_support', 'Beskriv fritt hur en typisk natt såg ut.', 'Describe freely what a typical night looked like.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, _i2, 'p1_example', 8, 'behavioural_example', 'account', 'candidate', 'cued_recall',
     ARRAY['submitted_answer'], 'recruitment_support', 'Ge ett konkret exempel på en situation du hanterade.', 'Give a concrete example of a situation you handled.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_listen', 9, 'listening_reflection', 'account', 'candidate', 'reflective_readback',
     '{}', 'recruitment_support', 'Om jag förstår dig rätt så gjorde du så här.', 'If I understand you correctly, this is what you did.',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, _i2, 'p1_probe', 10, 'specific_probe', 'account', 'candidate', 'neutral_clarification',
     ARRAY['submitted_answer'], 'recruitment_support', 'Vad gjorde du först i den situationen?', 'What did you do first in that situation?',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_context', 11, 'context_opportunity', 'account', 'candidate', 'open_question',
     '{}', 'recruitment_support', 'Finns det något i sammanhanget du vill lägga till?', 'Is there anything about the context you want to add?',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_correct', 12, 'correction_opportunity', 'account', 'candidate', 'open_question',
     '{}', 'recruitment_support', 'Vill du rätta något av det du skrev?', 'Would you like to correct anything you wrote?',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_difference', 13, 'neutral_difference_exploration', 'account', 'candidate', 'neutral_clarification',
     ARRAY['submitted_answer', 'candidate_correction'], 'recruitment_support', 'Här finns två olika uppgifter; hur hänger de ihop?', 'There are two different statements here; how do they fit together?',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_summary', 14, 'summary_confirmation', 'account', 'candidate', 'summary_readback',
     '{}', 'recruitment_support', 'Har jag uppfattat dig rätt?', 'Have I understood you correctly?',
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_closure', 15, 'closure_next_step', 'closure', 'candidate', 'information_notice',
     '{}', 'recruitment_support', 'Nästa steg är att arbetsgivaren återkommer.', 'The next step is that the employer will get back to you.',
     'cqrity_design_hypothesis', 'synthetic-fixture');

  -- The PEACE Evaluation step: a governed template, named by key. Its wording
  -- is not authored here -- it IS public.beskt_evaluation_template().
  INSERT INTO public.beskt_prompts
    (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage,
     addressee, question_form, permitted_probe_bases, permitted_mode, evaluation_template_key,
     wording_sv, wording_en, content_provenance, source_reference)
  VALUES
    (_v, _p1, NULL, 'p1_evaluation', 16, 'interviewer_self_review', 'evaluation', 'interviewer', 'reflective_readback',
     '{}', 'recruitment_support', 'method_adherence',
     public.beskt_evaluation_template('method_adherence', 'sv'),
     public.beskt_evaluation_template('method_adherence', 'en'),
     'cqrity_design_hypothesis', 'synthetic-fixture');

  INSERT INTO public.beskt_routing_rules
    (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind,
     condition_option_id, condition_boolean, action, target_item_id)
  VALUES
    (_v, 'show_example_when_experienced', 1, 'recruitment_support', _i1, 'option_selected', _o_yes, NULL, 'show', _i2),
    (_v, 'show_context_when_reported', 2, 'recruitment_support', _i3, 'boolean_equals', NULL, true, 'show', _i4);

  -- The seven anchors, each with all seven components.
  FOR _st IN SELECT unnest(ARRAY['unaddressed', 'clarification_needed', 'sufficiently_clarified',
      'external_verification_needed', 'conflicting_information', 'insufficient_basis', 'not_applicable']) LOOP
    INSERT INTO public.beskt_evidence_anchors
      (method_version_id, evidence_state, definition_sv, definition_en, inclusion_criteria_sv, inclusion_criteria_en,
       exclusion_criteria_sv, exclusion_criteria_en, supporting_evidence_examples_sv, supporting_evidence_examples_en,
       counter_evidence_and_protective_factors_sv, counter_evidence_and_protective_factors_en,
       prohibited_inferences, required_next_action)
    VALUES
      (_v, _st, 'Definition (sv) ' || _st, 'Definition (en) ' || _st,
       'Ingår när underlaget ' || _st, 'Included when the basis is ' || _st,
       'Ingår inte när underlaget är annat.', 'Excluded when the basis is otherwise.',
       'Exempel på stödjande underlag.', 'Examples of supporting basis.',
       'Motbevis och skyddande faktorer beaktas.', 'Counter-evidence and protective factors are considered.',
       CASE _st WHEN 'unaddressed' THEN ARRAY['omission_as_negative_evidence', 'suitability_inference']
                WHEN 'conflicting_information' THEN ARRAY['inconsistency_as_dishonesty', 'credibility_or_deception_inference']
                ELSE ARRAY['suitability_inference'] END,
       CASE _st WHEN 'unaddressed' THEN 'clarify_with_candidate'
                WHEN 'clarification_needed' THEN 'clarify_with_candidate'
                WHEN 'sufficiently_clarified' THEN 'none'
                WHEN 'external_verification_needed' THEN 'external_verification'
                WHEN 'conflicting_information' THEN 'offer_candidate_correction'
                WHEN 'insufficient_basis' THEN 'record_insufficient_basis'
                ELSE 'none' END);
  END LOOP;

  -- The ten observation-field definitions.
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

  IF _mode = 'security_vetting_support' THEN
    INSERT INTO public.beskt_exposure_profiles
      (method_version_id, profile_key, display_order, exposure_area, duties_sv, duties_en,
       role_relevance_rationale_sv, role_relevance_rationale_en, permitted_mode, owning_review_role,
       jurisdiction_reference, lawful_basis_reference, retention_class, access_class,
       security_sensitive_role_attestation_reference, content_provenance, source_reference)
    VALUES (_v, 'protected_information', 2, 'access_to_protected_information',
            'Hanterar säkerhetsskyddsklassificerade uppgifter.', 'Handles security-classified information.',
            'Rollen deltar i säkerhetskänslig verksamhet.', 'The role participates in security-sensitive activity.',
            'security_vetting_support', 'personnel_security', 'SE',
            'Säkerhetsskyddslag (2018:585) synthetic', 'security_vetting_record', 'authorised_security_function',
            'ATTEST-SYNTHETIC-1', 'cqrity_design_hypothesis', 'synthetic-fixture')
    RETURNING id INTO _p2;
    INSERT INTO public.beskt_items
      (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
       purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
       sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
    VALUES
      (_v, _s1, _p2, 'classified_information_handling', 6, 'Beskriv din erfarenhet av att hantera skyddad information.',
       'Describe your experience of handling protected information.',
       'Rollen deltar i säkerhetskänslig verksamhet.', 'The role participates in security-sensitive activity.',
       'security_vetting_support', 'candidate_preparation', 'long_text', 'voluntary', true,
       'security_vetting_only', 'authorised_security_function', 'cqrity_design_hypothesis', 'synthetic-fixture',
       ARRAY['suitability_inference', 'protected_trait_proxy'])
    RETURNING id INTO _i7;
    INSERT INTO public.beskt_items
      (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en,
       purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, discuss_orally_allowed,
       sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
    VALUES
      (_v, _s1, _p2, 'protected_information_training', 7, 'Har du genomgått utbildning i informationssäkerhet?',
       'Have you completed information security training?',
       'Rollen hanterar skyddad information.', 'The role handles protected information.',
       'recruitment_support', 'candidate_preparation', 'boolean', 'voluntary', true,
       'ordinary', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-fixture',
       ARRAY['suitability_inference'])
    RETURNING id INTO _i8;
    INSERT INTO public.beskt_prompts
      (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage,
       addressee, question_form, permitted_probe_bases, permitted_mode, wording_sv, wording_en,
       content_provenance, source_reference)
    VALUES
      (_v, _p2, NULL, 'p2_open', 1, 'open_invitation', 'account', 'candidate', 'open_question',
       '{}', 'security_vetting_support', 'Berätta om ditt arbete med skyddad information.', 'Tell me about your work with protected information.',
       'cqrity_design_hypothesis', 'synthetic-fixture'),
      (_v, _p2, NULL, 'p2_free', 2, 'free_account', 'account', 'candidate', 'free_recall',
       '{}', 'security_vetting_support', 'Beskriv fritt hur du hanterade uppgifterna.', 'Describe freely how you handled the information.',
       'cqrity_design_hypothesis', 'synthetic-fixture'),
      (_v, _p2, _i7, 'p2_example', 3, 'behavioural_example', 'account', 'candidate', 'cued_recall',
       ARRAY['submitted_answer'], 'security_vetting_support', 'Ge ett konkret exempel.', 'Give a concrete example.',
       'cqrity_design_hypothesis', 'synthetic-fixture'),
      (_v, _p2, _i7, 'p2_probe', 4, 'specific_probe', 'account', 'candidate', 'neutral_clarification',
       ARRAY['submitted_answer'], 'security_vetting_support', 'Vad gjorde du i det läget?', 'What did you do at that point?',
       'cqrity_design_hypothesis', 'synthetic-fixture'),
      (_v, _p2, NULL, 'p2_context', 5, 'context_opportunity', 'account', 'candidate', 'open_question',
       '{}', 'security_vetting_support', 'Finns det något sammanhang du vill lägga till?', 'Is there any context you want to add?',
       'cqrity_design_hypothesis', 'synthetic-fixture'),
      (_v, _p2, NULL, 'p2_correct', 6, 'correction_opportunity', 'account', 'candidate', 'open_question',
       '{}', 'security_vetting_support', 'Vill du rätta något?', 'Would you like to correct anything?',
       'cqrity_design_hypothesis', 'synthetic-fixture'),
      (_v, _p2, NULL, 'p2_summary', 7, 'summary_confirmation', 'account', 'candidate', 'summary_readback',
       '{}', 'security_vetting_support', 'Har jag förstått dig rätt?', 'Have I understood you correctly?',
       'cqrity_design_hypothesis', 'synthetic-fixture');
    INSERT INTO public.beskt_activation_requirements
      (method_version_id, requirement_key, satisfied_by_role, statement_sv, statement_en)
    VALUES
      (_v, 'security_sensitive_role_attested', 'accountable_process_owner',
       'Arbetsgivaren intygar att rollen deltar i säkerhetskänslig verksamhet.', 'The employer attests that the role participates in security-sensitive activity.'),
      (_v, 'lawful_basis_recorded', 'accountable_process_owner',
       'Den rättsliga grunden är dokumenterad.', 'The lawful basis is recorded.'),
      (_v, 'authorised_security_owner_assigned', 'authorised_security_function',
       'En behörig säkerhetsansvarig är utsedd.', 'An authorised security owner is assigned.');
  END IF;

  -- One governed touch, so the stored hash names what was planted.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_touch_draft(gen_random_uuid(), _v,
    (SELECT revision FROM public.beskt_method_versions WHERE id = _v), 'fixture planted');
  RESET ROLE;
  PERFORM pg_temp.nobody();

  IF NOT _store THEN
    RETURN _v;
  END IF;
  IF _mode = 'recruitment_support' THEN
    UPDATE bk SET rec_pack = _pack, rec_v = _v, rec_p1 = _p1, rec_s1 = _s1, rec_s2 = _s2,
                  rec_i1 = _i1, rec_i2 = _i2, rec_i3 = _i3, rec_i4 = _i4, rec_i5 = _i5, rec_i6 = _i6,
                  rec_o_yes = _o_yes, rec_o_no = _o_no;
  ELSE
    UPDATE bk SET sv_pack = _pack, sv_v = _v, sv_p1 = _p1, sv_p2 = _p2, sv_s1 = _s1, sv_i1 = _i1, sv_i7 = _i7, sv_i8 = _i8;
  END IF;
  RETURN _v;
END $$;

-- Run the validator as a governance reader (it refuses everyone else).
CREATE OR REPLACE FUNCTION pg_temp.blockers(_v uuid) RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE _codes text[];
BEGIN
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT coalesce(array_agg(bv.code ORDER BY bv.code), '{}') INTO _codes
    FROM public.beskt_method_validate(_v, false) bv;
  RESET ROLE;
  PERFORM pg_temp.nobody();
  RETURN _codes;
END $$;

-- Governed helpers used by many groups.
CREATE OR REPLACE FUNCTION pg_temp.revision_of(_v uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT revision FROM public.beskt_method_versions WHERE id = _v $$;
CREATE OR REPLACE FUNCTION pg_temp.touch(_v uuid, _op uuid DEFAULT gen_random_uuid()) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_touch_draft(_op, _v, pg_temp.revision_of(_v), 'test touch');
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.submit(_v uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_submit_for_review(gen_random_uuid(), _v, pg_temp.revision_of(_v));
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.review(_v uuid, _who uuid, _gate text, _decision text DEFAULT 'approved') RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become(_who);
  SET LOCAL ROLE authenticated;
  _r := public.beskt_record_review(gen_random_uuid(), _v, pg_temp.revision_of(_v), _gate, _decision, 'Granskad. Reviewed.');
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.approve_all(_v uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.review(_v, 'b2000000-0000-4000-8000-0000000000a1', 'personnel_security');
  PERFORM pg_temp.review(_v, 'b2000000-0000-4000-8000-0000000000a2', 'senior_hr');
  PERFORM pg_temp.review(_v, 'b2000000-0000-4000-8000-0000000000a3', 'recruitment');
  PERFORM pg_temp.review(_v, 'b2000000-0000-4000-8000-0000000000a4', 'employment_privacy_legal');
  PERFORM pg_temp.review(_v, 'b2000000-0000-4000-8000-0000000000a5', 'data_protection');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.publish(_v uuid, _who uuid DEFAULT 'b2000000-0000-4000-8000-0000000000b1', _op uuid DEFAULT gen_random_uuid()) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become(_who);
  SET LOCAL ROLE authenticated;
  _r := public.beskt_publish_version(_op, _v, pg_temp.revision_of(_v), 'Publicerad för test.');
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _r;
END $$;

-- Gate grants and revocations through the governed contract, as the
-- platform admin. Used by the groups that prove gate-specific authority.
CREATE OR REPLACE FUNCTION pg_temp.grant_kind(_who uuid, _kind text, _until timestamptz DEFAULT NULL, _op uuid DEFAULT gen_random_uuid()) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_grant_governance(_op, _who, _kind, 'synthetic test mandate', _until);
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN (_r ->> 'grant_id')::uuid;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.revoke_grant(_id uuid, _op uuid DEFAULT gen_random_uuid()) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_revoke_governance(_op, _id, 'Återkallad för test.');
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _r;
END $$;
