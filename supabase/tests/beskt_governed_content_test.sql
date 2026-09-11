-- BESKT PR 2 — governed method content, deterministic routing and publication
-- gates: the behaviour suite.
--
-- Executes real operations against planted rows. It proves:
--
--   B0  backward compatibility: every pre-existing pack is role_interview, the
--       role-interview RPCs, validator, startability and reads are unchanged,
--       a BESKT method cannot enter the role-interview version, validator or
--       0-4 runtime, and no old signature became an overload.
--   B1  kind/version/scope integrity: wrong parent kind, cross-version
--       references, immutability from published onward, no cascade.
--   B2  method completeness: every mandatory item field, option shape,
--       evidence state, anchor component, security-vetting gate and routing
--       rule blocks publication or cannot be represented; routing is
--       byte-identical for identical inputs; omission and discuss-orally are
--       neutral.
--   B3  review, hash and lifecycle: five current-hash gates, stale approvals,
--       separation of duties, canonical SHA-256, atomic publication, the read
--       contract.
--   B4  concurrency and idempotency: replay, payload mismatch, stale revision,
--       replay before CAS, revision regression.
--   B5  authorisation and security: anon, roleless users, direct DML, grants,
--       FORCE RLS, pinned search_path, append-only against the owner and
--       against a BYPASSRLS role.
--
-- The method content planted here is SYNTHETIC test content, clearly named
-- as such, created inside this transaction and rolled back at the end. It is
-- never a product seed.

\set ON_ERROR_STOP on
BEGIN;

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
     'cqrity_design_hypothesis', 'synthetic-fixture'),
    (_v, _p1, NULL, 'p1_evaluation', 16, 'interviewer_self_review', 'evaluation', 'interviewer', 'reflective_readback',
     '{}', 'recruitment_support', 'Gå igenom din egen intervjuteknik. Notera vilket underlag som fortfarande saknas.', 'Go through your own interviewing technique. Note the basis that is still missing.',
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

DO $$ BEGIN RAISE NOTICE 'GROUP B0 — backward compatibility of the role-interview flow'; END $$;

DO $$
DECLARE _n integer; _codes text[]; _pack uuid; _ver uuid; _role uuid; _rv uuid; _emp uuid := 'b2000000-0000-4000-8000-00000000ee01';
BEGIN
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_packs WHERE pack_kind <> 'role_interview') = 0
    AND (SELECT count(*) FROM public.scp_interview_packs) >= 1,
    'B0.1 every pre-existing pack is backfilled to role_interview');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_packs WHERE role_id IS NULL) = 0,
    'B0.2 no pre-existing pack lost its role');
  PERFORM pg_temp.ok(
    (SELECT column_default FROM information_schema.columns
      WHERE table_name = 'scp_interview_packs' AND column_name = 'pack_kind') = '''role_interview''::text',
    'B0.3 pack_kind defaults to role_interview for every future role-interview pack');

  -- The Vaktare pilot pack still validates with exactly the role-interview
  -- blockers and never a kind blocker.
  SELECT v.id INTO _ver FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se' AND v.version_number = 1;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT array_agg(DISTINCT code ORDER BY code) INTO _codes FROM public.scp_interview_pack_validate(_ver);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(
    NOT ('PACK_KIND_NOT_ROLE_INTERVIEW' = ANY (_codes))
    AND 'COMPETENCY_MAPPING_PROVISIONAL' = ANY (_codes)
    AND 'REVIEW_GATE_EXPERT_NOT_APPROVED' = ANY (_codes),
    'B0.4 the role-interview validator answers for the Vaktare pack exactly as before, no kind blocker');

  -- Role-pack creation and versioning still work for an editor.
  SELECT r.id INTO _role FROM public.scp_roles r WHERE r.slug = 'security-guard-se';
  SELECT id INTO _rv FROM public.scp_role_versions WHERE role_id = _role ORDER BY version_number DESC LIMIT 1;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _pack := public.scp_interview_create_pack('b0-role-pack', _role, 'B0 rollpaket', 'Syfte');
  _ver := public.scp_interview_create_version(_pack, 'sv-SE', _rv, 'src', 'v1');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(
    (SELECT pack_kind FROM public.scp_interview_packs WHERE id = _pack) = 'role_interview'
    AND (SELECT count(*) FROM public.scp_interview_pack_versions WHERE id = _ver) = 1,
    'B0.5 scp_interview_create_pack and scp_interview_create_version still create a role-interview pack and version');

  -- Startability for an active employer is unchanged: the open Vaktare pilot
  -- is listed and startable, exactly as the start contract already proves.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_emp) s
    JOIN public.scp_interview_packs p ON p.id = s.pack_id WHERE p.slug = 'vaktare-se';
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 1, 'B0.6 the startable list still offers the open Vaktare pilot to an active employer');
  PERFORM pg_temp.ok(
    public.scp_iv_case_start_basis(_emp,
      (SELECT v.id FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
        WHERE p.slug = 'vaktare-se' AND v.version_number = 1), 'b2000000-0000-4000-8000-0000000000d1') = 'open_pilot',
    'B0.7 the shared start basis still answers open_pilot for the Vaktare pilot');

  -- No overload, no ambiguity: each re-scoped function exists exactly once
  -- with its original identity arguments.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('scp_iv_case_start_basis', 'scp_iv_startable_pack_versions',
        'scp_iv_create_case', 'scp_interview_pack_validate', 'scp_interview_create_version')) = 5,
    'B0.8 the five re-scoped role-interview functions exist exactly once each — no PostgREST-ambiguous overload');
  PERFORM pg_temp.ok(
    pg_get_function_identity_arguments('public.scp_iv_startable_pack_versions'::regproc) = '_employer_id uuid'
    AND pg_get_function_identity_arguments('public.scp_iv_case_start_basis'::regproc) = '_employer_id uuid, _pack_version_id uuid, _user_id uuid'
    AND pg_get_function_identity_arguments('public.scp_interview_pack_validate'::regproc) = '_pack_version_id uuid',
    'B0.9 the preserved signatures are byte-identical');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'beskt\_%' ESCAPE '\'
      GROUP BY p.proname HAVING count(*) > 1 LIMIT 1) IS NULL,
    'B0.10 no BESKT function name is overloaded either');
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP B0b — a BESKT method cannot enter the role-interview flow'; END $$;

DO $$
DECLARE _pack uuid; _rv uuid; _r jsonb; _n integer; _emp uuid := 'b2000000-0000-4000-8000-00000000ee01';
BEGIN
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_create_method(gen_random_uuid(), 'b0-beskt-method', 'BESKT syntetisk', 'Syfte');
  RESET ROLE; PERFORM pg_temp.nobody();
  _pack := (_r ->> 'pack_id')::uuid;
  PERFORM pg_temp.ok(
    (SELECT pack_kind FROM public.scp_interview_packs WHERE id = _pack) = 'beskt_method'
    AND (SELECT role_id FROM public.scp_interview_packs WHERE id = _pack) IS NULL,
    'B0b.1 a BESKT method identity is beskt_method with no canonical role');

  SELECT id INTO _rv FROM public.scp_role_versions ORDER BY version_number DESC LIMIT 1;
  -- The 0-4 version spine refuses it at the table, whoever writes.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.scp_interview_pack_versions (pack_id, version_number, locale, role_version_id, source_reference, source_document_version)
             VALUES (%L, 1, 'sv-SE', %L, 'x', 'y')$q$, _pack, _rv),
    'SCP_INTERVIEW_PACK_KIND_MISMATCH',
    'B0b.2 a scp_interview_pack_versions row for a BESKT method is refused even by the database owner');
  -- And the role-interview version RPC refuses it explicitly.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.scp_interview_create_version(%L, ''sv-SE'', %L, ''x'', ''y'')', _pack, _rv),
    'SCP_INTERVIEW_PACK_KIND_MISMATCH',
    'B0b.3 scp_interview_create_version refuses a BESKT method');
  -- Kind is identity.
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.scp_interview_packs SET pack_kind = 'role_interview' WHERE id = %L$q$, _pack),
    'SCP_INTERVIEW_PACK_KIND_IMMUTABLE',
    'B0b.4 pack_kind cannot be changed after insert');
  -- The role-by-kind invariant, both ways.
  PERFORM pg_temp.must_fail(
    $q$INSERT INTO public.scp_interview_packs (slug, role_id, pack_kind, name_sv, purpose_sv)
       VALUES ('b0-roleless-role-pack', NULL, 'role_interview', 'x', 'y')$q$,
    'scp_interview_packs_role_by_kind_check',
    'B0b.5 a role-interview pack without a role is refused');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.scp_interview_packs (slug, role_id, pack_kind, name_sv, purpose_sv)
       VALUES ('b0-beskt-with-role', %L, 'beskt_method', 'x', 'y')$q$,
       (SELECT id FROM public.scp_roles LIMIT 1)),
    'scp_interview_packs_role_by_kind_check',
    'B0b.6 a BESKT method with a fake canonical role is refused');
  PERFORM pg_temp.must_fail(
    $q$INSERT INTO public.scp_interview_packs (slug, role_id, pack_kind, name_sv, purpose_sv)
       VALUES ('b0-unknown-kind', NULL, 'assessment', 'x', 'y')$q$,
    'scp_interview_packs_pack_kind_check',
    'B0b.7 the kind vocabulary is exactly role_interview | beskt_method');

  -- The start flow: no BESKT version exists in the old spine, the startable
  -- list never names a BESKT pack, and case creation refuses a BESKT pack
  -- even when a version row is forced past the guard.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_emp) s
    JOIN public.scp_interview_packs p ON p.id = s.pack_id WHERE p.pack_kind <> 'role_interview';
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B0b.8 the startable list names no BESKT method');

  -- Force a version row past the trigger (owner plumbing) to prove the
  -- scope predicates themselves, not only the trigger.
  ALTER TABLE public.scp_interview_pack_versions DISABLE TRIGGER scp_interview_pack_versions_role_interview_only;
  INSERT INTO public.scp_interview_pack_versions (id, pack_id, version_number, locale, role_version_id, source_reference, source_document_version, pilot_availability)
  VALUES ('b2000000-0000-4000-8000-0000000000ff', _pack, 1, 'sv-SE', _rv, 'forced', 'forced', 'open');
  ALTER TABLE public.scp_interview_pack_versions ENABLE TRIGGER scp_interview_pack_versions_role_interview_only;
  PERFORM pg_temp.ok(
    public.scp_iv_case_start_basis(_emp, 'b2000000-0000-4000-8000-0000000000ff', 'b2000000-0000-4000-8000-0000000000d1') IS NULL,
    'B0b.9 the shared start basis answers NULL for a forced BESKT version even though it is an open pilot');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_emp) s WHERE s.pack_version_id = 'b2000000-0000-4000-8000-0000000000ff';
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B0b.10 the startable list filters it out by pack_kind');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT public.scp_iv_create_case(%L, ''BESKT försök'', %L, ''Kandidat'')',
           _emp, 'b2000000-0000-4000-8000-0000000000ff'),
    'SCP_IV_PACK_KIND_NOT_STARTABLE',
    'B0b.11 scp_iv_create_case refuses a BESKT pack before any entitlement');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.scp_interview_pack_validate('b2000000-0000-4000-8000-0000000000ff') WHERE code = 'PACK_KIND_NOT_ROLE_INTERVIEW';
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 1, 'B0b.12 the role-interview validator blocks a BESKT pack outright, never validating it against the 0-4 contract');
  DELETE FROM public.scp_interview_pack_versions WHERE id = 'b2000000-0000-4000-8000-0000000000ff';
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP B1 — kind, version and scope integrity'; END $$;

SELECT pg_temp.build_method('beskt-synthetic-rec', 'recruitment_support');
SELECT pg_temp.build_method('beskt-synthetic-sv', 'security_vetting_support');

DO $$
DECLARE b bk%ROWTYPE; _role_pack uuid; _n integer;
BEGIN
  SELECT * INTO b FROM bk;
  PERFORM pg_temp.ok(b.rec_v IS NOT NULL AND b.sv_v IS NOT NULL, 'B1.0 both synthetic methods were planted');
  PERFORM pg_temp.ok(pg_temp.blockers(b.rec_v) = '{}'::text[],
    format('B1.0b the recruitment-support fixture is content-complete (blockers: %s)', pg_temp.blockers(b.rec_v)));
  PERFORM pg_temp.ok(pg_temp.blockers(b.sv_v) = '{}'::text[],
    format('B1.0c the security-vetting fixture is content-complete (blockers: %s)', pg_temp.blockers(b.sv_v)));

  -- Wrong parent kind.
  SELECT id INTO _role_pack FROM public.scp_interview_packs WHERE slug = 'vaktare-se';
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_method_versions (pack_id, version_number, mode, source_reference, source_document_version, content_provenance)
             VALUES (%L, 9, 'recruitment_support', 'x', 'y', 'source_stated')$q$, _role_pack),
    'BESKT_PACK_KIND_MISMATCH',
    'B1.1 a BESKT version for a role-interview pack is refused');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_method_versions (pack_id, version_number, content_status, mode, source_reference, source_document_version, content_provenance)
             VALUES (%L, 9, 'published', 'recruitment_support', 'x', 'y', 'source_stated')$q$, b.rec_pack),
    'BESKT_MUST_START_AS_DRAFT',
    'B1.2 a version cannot be born published');

  -- Cross-version references, every reference kind.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
             VALUES (%L, %L, %L, 'x_item', 9, 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'source_stated')$q$,
             b.sv_v, b.rec_s1, b.sv_p1),
    'BESKT_CROSS_VERSION_REFERENCE', 'B1.3 an item cannot sit in a section of another version');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
             VALUES (%L, %L, %L, 'x_item', 9, 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'source_stated')$q$,
             b.sv_v, b.sv_s1, b.rec_p1),
    'BESKT_CROSS_VERSION_REFERENCE', 'B1.4 an item cannot link to an exposure profile of another version');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_prompts (method_version_id, exposure_profile_id, prompt_key, display_order, prompt_kind, peace_stage, addressee, question_form, permitted_mode, content_provenance)
             VALUES (%L, %L, 'x_prompt', 99, 'open_invitation', 'account', 'candidate', 'open_question', 'recruitment_support', 'source_stated')$q$,
             b.sv_v, b.rec_p1),
    'BESKT_CROSS_VERSION_REFERENCE', 'B1.5 a prompt cannot link to an exposure profile of another version');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_prompts (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage, addressee, question_form, permitted_probe_bases, permitted_mode, content_provenance)
             VALUES (%L, %L, %L, 'x_prompt', 99, 'specific_probe', 'account', 'candidate', 'neutral_clarification', ARRAY['submitted_answer'], 'recruitment_support', 'source_stated')$q$,
             b.sv_v, b.sv_p1, b.rec_i2),
    'BESKT_CROSS_VERSION_REFERENCE', 'B1.6 a prompt cannot probe an item of another version');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
             VALUES (%L, 'x_rule', 99, 'recruitment_support', %L, 'always', 'show', %L)$q$,
             b.rec_v, b.rec_i1, b.sv_i1),
    'BESKT_CROSS_VERSION_REFERENCE', 'B1.7 a route cannot target an item of another version');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
             VALUES (%L, 'x_rule', 99, 'recruitment_support', %L, 'always', 'show', %L)$q$,
             b.rec_v, b.sv_i1, b.rec_i2),
    'BESKT_CROSS_VERSION_REFERENCE', 'B1.8 a route cannot read an item of another version');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, condition_option_id, action, target_item_id)
             VALUES (%L, 'x_rule', 99, 'recruitment_support', %L, 'option_selected', %L, 'show', %L)$q$,
             b.rec_v, b.rec_i3, b.rec_o_yes, b.rec_i4),
    'BESKT_ROUTE_CONDITION_TYPE', 'B1.9 an option condition on a boolean item is refused');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, condition_option_id, action, target_item_id)
             VALUES (%L, 'x_rule', 99, 'recruitment_support', %L, 'option_selected', %L, 'show', %L)$q$,
             b.rec_v, b.rec_i1, (SELECT o.id FROM public.beskt_item_options o JOIN public.beskt_items i ON i.id = o.item_id WHERE i.method_version_id = b.sv_v AND o.option_key = 'yes'), b.rec_i2),
    'BESKT_ROUTE_OPTION_SCOPE', 'B1.10 a condition option must belong to the rule''s own source item');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
             VALUES (%L, 'x_rule', 99, 'recruitment_support', %L, 'always', 'show', %L)$q$,
             b.rec_v, b.rec_i1, b.rec_i6),
    'BESKT_ROUTE_PHASE', 'B1.11 routing cannot reach an interview-phase item');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_prompts (method_version_id, exposure_profile_id, prompt_key, display_order, prompt_kind, peace_stage, addressee, question_form, permitted_mode, content_provenance)
             VALUES (%L, %L, 'x_prompt', 99, 'specific_probe', 'planning', 'candidate', 'neutral_clarification', 'recruitment_support', 'source_stated')$q$,
             b.rec_v, b.rec_p1),
    'BESKT_PROMPT_STAGE_MISMATCH', 'B1.12 a prompt kind cannot be recorded against the wrong PEACE stage');

  -- No cascade destroys governed history: the identity cannot be deleted
  -- from under its versions, a version never from under its children, and a
  -- version never at all.
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.scp_interview_packs WHERE id = %L', b.rec_pack),
    'violates foreign key', 'B1.13 a method identity with versions cannot be deleted');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.beskt_method_versions WHERE id = %L', b.rec_v),
    'BESKT_VERSION_NO_DELETE', 'B1.14 a method version is never deleted, not even as a draft');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.beskt_exposure_profiles WHERE id = %L', b.rec_p1),
    'violates foreign key', 'B1.15 an exposure profile that justifies items cannot be deleted from under them');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.contype = 'f' AND t.relname LIKE 'beskt\_%' ESCAPE '\' AND c.confdeltype <> 'r'
        AND c.confrelid <> 'auth.users'::regclass) = 0,
    'B1.16 every FK inside the BESKT domain is ON DELETE RESTRICT');
END $$;

-- Owning and parent keys are immutable in every child family: a child
-- belongs to what it was created under, in a draft as much as later.
DO $$
DECLARE b bk%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO b FROM bk;
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_sections SET method_version_id = %L WHERE id = %L', b.sv_v, b.rec_s2),
    'BESKT_PARENT_IMMUTABLE', 'B1.17 a section cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_exposure_profiles SET method_version_id = %L WHERE id = %L', b.sv_v, b.rec_p1),
    'BESKT_PARENT_IMMUTABLE', 'B1.18 an exposure profile cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_activation_requirements SET method_version_id = %L WHERE method_version_id = %L AND requirement_key = ''lawful_basis_recorded''', b.rec_v, b.sv_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.19 an activation requirement cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET method_version_id = %L WHERE id = %L', b.sv_v, b.rec_i1),
    'BESKT_PARENT_IMMUTABLE', 'B1.20 an item cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET section_id = %L WHERE id = %L', b.rec_s2, b.rec_i1),
    'BESKT_PARENT_IMMUTABLE', 'B1.21 an item cannot be moved to another section of its own version either');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET exposure_profile_id = %L WHERE id = %L', b.sv_p1, b.sv_i8),
    'BESKT_PARENT_IMMUTABLE', 'B1.22 an item cannot be re-justified under another exposure profile');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_prompts SET method_version_id = %L WHERE method_version_id = %L AND prompt_key = ''p1_open''', b.sv_v, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.23 a prompt cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_prompts SET exposure_profile_id = %L WHERE method_version_id = %L AND prompt_key = ''p2_open''', b.sv_p1, b.sv_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.24 a prompt cannot be moved to another exposure profile');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_prompts SET item_id = %L WHERE method_version_id = %L AND prompt_key = ''p1_probe''', b.rec_i4, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.25 a probe cannot be re-pointed at another item');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_routing_rules SET method_version_id = %L WHERE method_version_id = %L AND rule_key = ''show_context_when_reported''', b.sv_v, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.26 a routing rule cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_routing_rules SET target_item_id = %L WHERE method_version_id = %L AND rule_key = ''show_context_when_reported''', b.rec_i2, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.27 a routing rule cannot be re-pointed at another target item');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_routing_rules SET source_item_id = %L WHERE method_version_id = %L AND rule_key = ''show_context_when_reported''', b.rec_i1, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.28 nor at another source item');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_routing_rules SET condition_option_id = %L WHERE method_version_id = %L AND rule_key = ''show_example_when_experienced''', b.rec_o_no, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.29 nor at another condition option');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_evidence_anchors SET method_version_id = %L WHERE method_version_id = %L AND evidence_state = ''unaddressed''', b.sv_v, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.30 an evidence anchor cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_observation_fields SET method_version_id = %L WHERE method_version_id = %L AND field_key = ''fact''', b.sv_v, b.rec_v),
    'BESKT_PARENT_IMMUTABLE', 'B1.31 an observation-field definition cannot be moved to another method version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_item_options SET item_id = %L WHERE id = %L', b.rec_i3, b.rec_o_yes),
    'BESKT_PARENT_IMMUTABLE', 'B1.32 an option cannot be moved to another item');
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET method_version_id = %L WHERE id = %L', b.sv_v, b.rec_i1),
    'BESKT_PARENT_IMMUTABLE', 'B1.33 parent immutability holds against a BYPASSRLS caller (trigger, not policy)');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_item_options SET item_id = %L WHERE id = %L', b.sv_i1, b.rec_o_yes),
    'BESKT_PARENT_IMMUTABLE', 'B1.34 so does the option''s, across versions');
  RESET ROLE;
  SELECT count(*) INTO _n FROM public.beskt_items WHERE method_version_id = b.rec_v;
  PERFORM pg_temp.ok(_n = 6 AND (SELECT count(*) FROM public.beskt_items WHERE method_version_id = b.sv_v) = 8,
    'B1.35 every refused move left both drafts exactly as planted');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP B2 — method completeness blocks publication or cannot be represented'; END $$;

-- Every mandatory item field: the nullable text fields block publication
-- through the validator; the vocabulary fields are NOT NULL + CHECK and so
-- cannot even be represented.
DO $$
DECLARE b bk%ROWTYPE; _codes text[];
BEGIN
  SELECT * INTO b FROM bk;

  UPDATE public.beskt_items SET wording_sv = NULL WHERE id = b.rec_i1;
  PERFORM pg_temp.ok('ITEM_WORDING_SV_MISSING' = ANY (pg_temp.blockers(b.rec_v)), 'B2.1 an item without Swedish wording blocks publication');
  UPDATE public.beskt_items SET wording_sv = 'Har du erfarenhet av ensamarbete?' WHERE id = b.rec_i1;

  UPDATE public.beskt_items SET wording_en = '   ' WHERE id = b.rec_i1;
  PERFORM pg_temp.ok('ITEM_WORDING_EN_MISSING' = ANY (pg_temp.blockers(b.rec_v)), 'B2.2 an item with blank English wording blocks publication');
  UPDATE public.beskt_items SET wording_en = 'Do you have experience of lone working?' WHERE id = b.rec_i1;

  UPDATE public.beskt_items SET purpose_en = NULL WHERE id = b.rec_i1;
  PERFORM pg_temp.ok('ITEM_PURPOSE_MISSING' = ANY (pg_temp.blockers(b.rec_v)), 'B2.3 an item without a stated purpose blocks publication');
  UPDATE public.beskt_items SET purpose_en = 'The role involves lone working.' WHERE id = b.rec_i1;

  UPDATE public.beskt_items SET source_reference = NULL WHERE id = b.rec_i1;
  PERFORM pg_temp.ok('ITEM_PROVENANCE_MISSING' = ANY (pg_temp.blockers(b.rec_v)), 'B2.4 an item without provenance blocks publication');
  UPDATE public.beskt_items SET source_reference = 'synthetic-fixture' WHERE id = b.rec_i1;

  UPDATE public.beskt_items SET prohibited_inferences = '{}' WHERE id = b.rec_i1;
  PERFORM pg_temp.ok('ITEM_PROHIBITED_INFERENCES_MISSING' = ANY (pg_temp.blockers(b.rec_v)), 'B2.5 an item without prohibited-inference metadata blocks publication');
  UPDATE public.beskt_items SET prohibited_inferences = ARRAY['suitability_inference'] WHERE id = b.rec_i1;

  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
             VALUES (%L, %L, NULL, 'unlinked_item', 9, 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'source_stated')$q$, b.rec_v, b.rec_s1),
    'BESKT_EXPOSURE_LINK_REQUIRED', 'B2.6 an item without an exposure link cannot be represented');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET permitted_mode = NULL WHERE id = %L', b.rec_i1),
    'null value', 'B2.7 an item without a mode cannot be represented');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET requiredness = NULL WHERE id = %L', b.rec_i1),
    'null value', 'B2.8 an item without a required/voluntary policy cannot be represented');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET answer_type = ''free_form_ai'' WHERE id = %L', b.rec_i1),
    'answer_type', 'B2.9 an item outside the typed answer vocabulary cannot be represented');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET sensitivity_class = NULL WHERE id = %L', b.rec_i1),
    'null value', 'B2.10 an item without a sensitivity class cannot be represented');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET access_class = NULL WHERE id = %L', b.rec_i1),
    'null value', 'B2.11 an item without an access class cannot be represented');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET sensitivity_class = ''criminal_offence'' WHERE id = %L', b.rec_i2),
    'beskt_items_sensitivity_class_check', 'B2.12 criminal-offence data is not representable: the sensitive module stays disabled');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET sensitivity_class = ''special_category'' WHERE id = %L', b.rec_i2),
    'beskt_items_sensitivity_class_check', 'B2.13 special-category data is not representable either');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET sensitivity_class = ''integrity_sensitive'' WHERE id = %L', b.rec_i1),
    'beskt_items_sensitive_never_required_check', 'B2.14 nothing above ordinary sensitivity can be compelled (a required item cannot become integrity-sensitive)');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_exposure_profiles SET exposure_area = ''foreign_ties'' WHERE id = %L', b.rec_p1),
    'exposure_area', 'B2.15 a protected-trait proxy is not an exposure area');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET prohibited_inferences = ARRAY[''risk_flag''] WHERE id = %L', b.rec_i1),
    'prohibited_inferences', 'B2.16 prohibited inferences come from the closed contract vocabulary');

  -- Options: no weight, points, risk value or assessment code can exist,
  -- and an option encoding a non-answer blocks publication.
  PERFORM pg_temp.ok(
    (SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'beskt_item_options')
    = ARRAY['id', 'item_id', 'option_key', 'display_order', 'label_sv', 'label_en'],
    'B2.17 an option is exactly key, order and bilingual label — no weight, points, risk value or hidden code column exists');
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.beskt_item_options (item_id, option_key, display_order, label_sv, label_en, weight) VALUES (%L, ''w'', 3, ''x'', ''y'', 1)', b.rec_i1),
    'column "weight"', 'B2.18 an option with a weight cannot be represented');
  INSERT INTO public.beskt_item_options (item_id, option_key, display_order, label_sv, label_en)
  VALUES (b.rec_i1, 'prefer_not_to_say', 3, 'Vill inte svara', 'Prefer not to say');
  PERFORM pg_temp.ok('OPTION_KEY_ENCODES_NON_ANSWER' = ANY (pg_temp.blockers(b.rec_v)), 'B2.19 an option encoding a non-answer blocks publication: omission is a response state, never an option');
  DELETE FROM public.beskt_item_options WHERE item_id = b.rec_i1 AND option_key = 'prefer_not_to_say';

  -- No forbidden column or jsonb column anywhere in the domain.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name LIKE 'beskt\_%' ESCAPE '\'
        AND (c.column_name ~* '(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire)' OR c.column_name = 'points')) = 0,
    'B2.20 no score, level, weight, threshold, total, rank, pass/fail, suitability, credibility, truthfulness, recommendation, risk or verdict column exists');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name LIKE 'beskt\_%' ESCAPE '\'
        AND c.data_type = 'jsonb' AND c.table_name <> 'beskt_method_events') = 0,
    'B2.21 no governed content table carries a jsonb column where a scoring key could hide');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_evidence_anchors (method_version_id, evidence_state) VALUES (%L, 'risk_level_4')$q$, b.rec_v),
    'evidence_state', 'B2.22 a numeric risk level is not an evidence state');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'beskt\_%' ESCAPE '\'
        AND (p.proname ~* '(score|rank|level|risk|verdict|recommend)'
          OR p.prosrc ~* '(rating_anchor|counts_toward_aggregation|level between 0 and 4)')) = 0,
    'B2.23 no BESKT function scores, ranks or reads the role-interview 0-4 contract');
END $$;

-- The seven evidence states and the seven anchor components, each one
-- proven blocking on its own.
DO $$
DECLARE b bk%ROWTYPE; _st text; _saved public.beskt_evidence_anchors%ROWTYPE; _comp text; _codes text[];
BEGIN
  SELECT * INTO b FROM bk;
  FOREACH _st IN ARRAY ARRAY['unaddressed', 'clarification_needed', 'sufficiently_clarified',
      'external_verification_needed', 'conflicting_information', 'insufficient_basis', 'not_applicable'] LOOP
    SELECT * INTO _saved FROM public.beskt_evidence_anchors WHERE method_version_id = b.rec_v AND evidence_state = _st;
    DELETE FROM public.beskt_evidence_anchors WHERE id = _saved.id;
    PERFORM pg_temp.ok(('EVIDENCE_STATE_MISSING_' || upper(_st)) = ANY (pg_temp.blockers(b.rec_v)),
      format('B2.24 a method without the %s anchor blocks publication', _st));
    INSERT INTO public.beskt_evidence_anchors SELECT _saved.*;
  END LOOP;
  PERFORM pg_temp.ok(pg_temp.blockers(b.rec_v) = '{}'::text[], 'B2.24b all seven restored — complete again');

  FOREACH _comp IN ARRAY ARRAY['definition', 'inclusion_criteria', 'exclusion_criteria',
      'supporting_evidence_examples', 'counter_evidence_and_protective_factors'] LOOP
    EXECUTE format('UPDATE public.beskt_evidence_anchors SET %I = NULL WHERE method_version_id = %L AND evidence_state = %L',
                   _comp || '_en', b.rec_v, 'clarification_needed');
    PERFORM pg_temp.ok(('ANCHOR_COMPONENT_MISSING_' || upper(_comp)) = ANY (pg_temp.blockers(b.rec_v)),
      format('B2.25 an anchor without its %s component blocks publication', _comp));
    EXECUTE format('UPDATE public.beskt_evidence_anchors SET %I = %L WHERE method_version_id = %L AND evidence_state = %L',
                   _comp || '_en', 'restored ' || _comp, b.rec_v, 'clarification_needed');
  END LOOP;
  UPDATE public.beskt_evidence_anchors SET prohibited_inferences = '{}' WHERE method_version_id = b.rec_v AND evidence_state = 'clarification_needed';
  PERFORM pg_temp.ok('ANCHOR_COMPONENT_MISSING_PROHIBITED_INFERENCES' = ANY (pg_temp.blockers(b.rec_v)),
    'B2.25 an anchor without its prohibited_inferences component blocks publication');
  UPDATE public.beskt_evidence_anchors SET prohibited_inferences = ARRAY['suitability_inference'] WHERE method_version_id = b.rec_v AND evidence_state = 'clarification_needed';
  UPDATE public.beskt_evidence_anchors SET required_next_action = NULL WHERE method_version_id = b.rec_v AND evidence_state = 'clarification_needed';
  PERFORM pg_temp.ok('ANCHOR_COMPONENT_MISSING_REQUIRED_NEXT_ACTION' = ANY (pg_temp.blockers(b.rec_v)),
    'B2.25 an anchor without its required_next_action component blocks publication');
  UPDATE public.beskt_evidence_anchors SET required_next_action = 'clarify_with_candidate' WHERE method_version_id = b.rec_v AND evidence_state = 'clarification_needed';
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_evidence_anchors SET required_next_action = 'reject_candidate' WHERE method_version_id = %L AND evidence_state = 'insufficient_basis'$q$, b.rec_v),
    'required_next_action', 'B2.26 a next action is never a decision about the person');

  -- Neutrality of the anchors: omission is never negative evidence, a
  -- difference is never dishonesty, and no cue-to-deception claim survives.
  UPDATE public.beskt_evidence_anchors SET prohibited_inferences = ARRAY['suitability_inference'] WHERE method_version_id = b.rec_v AND evidence_state = 'unaddressed';
  PERFORM pg_temp.ok('ANCHOR_UNADDRESSED_PERMITS_OMISSION_INFERENCE' = ANY (pg_temp.blockers(b.rec_v)),
    'B2.27 the unaddressed anchor must prohibit treating an omission as negative evidence');
  UPDATE public.beskt_evidence_anchors SET prohibited_inferences = ARRAY['omission_as_negative_evidence', 'suitability_inference'] WHERE method_version_id = b.rec_v AND evidence_state = 'unaddressed';
  UPDATE public.beskt_evidence_anchors SET inclusion_criteria_en = 'Hesitation and nervous body language indicate deception.' WHERE method_version_id = b.rec_v AND evidence_state = 'conflicting_information';
  PERFORM pg_temp.ok('ANCHOR_DECEPTION_CUE_CLAIM' = ANY (pg_temp.blockers(b.rec_v)),
    'B2.28 an anchor claiming that hesitation or body language indicates deception blocks publication');
  UPDATE public.beskt_evidence_anchors SET inclusion_criteria_en = 'Tone of voice and body language must never be read as credibility.' WHERE method_version_id = b.rec_v AND evidence_state = 'conflicting_information';
  PERFORM pg_temp.ok(NOT ('ANCHOR_DECEPTION_CUE_CLAIM' = ANY (pg_temp.blockers(b.rec_v))),
    'B2.28b and a sentence forbidding that inference is allowed to say so');
  UPDATE public.beskt_evidence_anchors SET inclusion_criteria_en = 'Included when the basis is conflicting_information' WHERE method_version_id = b.rec_v AND evidence_state = 'conflicting_information';
  PERFORM pg_temp.ok(pg_temp.blockers(b.rec_v) = '{}'::text[], 'B2.28c the fixture is complete again');
END $$;

-- Prompts: the forbidden forms cannot be represented; the conduct order is
-- enforced.
DO $$
DECLARE b bk%ROWTYPE;
BEGIN
  SELECT * INTO b FROM bk;
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_prompts SET wording_en = 'You must have seen the alarm, didn''t you?' WHERE method_version_id = %L AND prompt_key = 'p1_probe'$q$, b.rec_v),
    'beskt_prompts_wording_en_neutral_check', 'B2.29 a leading prompt cannot be represented');
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_prompts SET wording_en = 'What did you do, and why did you not report it?' WHERE method_version_id = %L AND prompt_key = 'p1_probe'$q$, b.rec_v),
    'beskt_prompts_wording_en_neutral_check', 'B2.30 a double-barrelled, guilt-presuming prompt cannot be represented');
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_prompts SET wording_sv = 'Vi vet redan vad som hände.' WHERE method_version_id = %L AND prompt_key = 'p1_probe'$q$, b.rec_v),
    'beskt_prompts_wording_sv_neutral_check', 'B2.31 a deceptive or coercive prompt cannot be represented');
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_prompts SET wording_en = 'Your body language suggests something else.' WHERE method_version_id = %L AND prompt_key = 'p1_probe'$q$, b.rec_v),
    'beskt_prompts_wording_en_neutral_check', 'B2.32 a prompt about tone, gaze, face, voice, emotion or body language cannot be represented');
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_prompts SET prompt_kind = 'confrontation' WHERE method_version_id = %L AND prompt_key = 'p1_probe'$q$, b.rec_v),
    'prompt_kind', 'B2.33 there is no confrontation, accusation or pressure prompt kind');
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_prompts SET question_form = 'assertion' WHERE method_version_id = %L AND prompt_key = 'p1_probe'$q$, b.rec_v),
    'question_form', 'B2.34 there is no assertion question form');
  PERFORM pg_temp.must_fail(
    format($q$UPDATE public.beskt_prompts SET permitted_probe_bases = ARRAY['behavioural_cue'] WHERE method_version_id = %L AND prompt_key = 'p1_probe'$q$, b.rec_v),
    'permitted_probe_bases', 'B2.35 a behavioural cue is not a permitted probe basis');

  UPDATE public.beskt_prompts SET display_order = 100 WHERE method_version_id = b.rec_v AND prompt_key IN ('p1_open', 'p1_free');
  UPDATE public.beskt_prompts SET display_order = display_order + 100 WHERE method_version_id = b.rec_v AND prompt_key IN ('p1_open') ;
  PERFORM pg_temp.ok('PROMPT_PROBE_BEFORE_OPEN' = ANY (pg_temp.blockers(b.rec_v)), 'B2.36 a specific probe before any open invitation or free account blocks publication');
  UPDATE public.beskt_prompts SET display_order = 6 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_open';
  UPDATE public.beskt_prompts SET display_order = 7 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_free';

  UPDATE public.beskt_prompts SET display_order = 50 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_example';
  PERFORM pg_temp.ok('PROMPT_PROBE_BEFORE_EXAMPLE' = ANY (pg_temp.blockers(b.rec_v)), 'B2.37 detail testing before a behavioural example blocks publication');
  UPDATE public.beskt_prompts SET display_order = 8 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_example';

  UPDATE public.beskt_prompts SET display_order = 9 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_correct';
  UPDATE public.beskt_prompts SET display_order = 12 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_listen';
  PERFORM pg_temp.ok('PROMPT_CORRECTION_OPPORTUNITY_MISSING' = ANY (pg_temp.blockers(b.rec_v)), 'B2.38 probing without a later opportunity to correct facts blocks publication');
  UPDATE public.beskt_prompts SET display_order = 12 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_correct';
  UPDATE public.beskt_prompts SET display_order = 9 WHERE method_version_id = b.rec_v AND prompt_key = 'p1_listen';

  DELETE FROM public.beskt_prompts WHERE method_version_id = b.rec_v AND prompt_key = 'p1_human';
  PERFORM pg_temp.ok('PROMPT_REQUIRED_KIND_MISSING' = ANY (pg_temp.blockers(b.rec_v)), 'B2.39 a method without the human-decision notice blocks publication');
  INSERT INTO public.beskt_prompts (method_version_id, exposure_profile_id, prompt_key, display_order, prompt_kind, peace_stage, addressee, question_form, permitted_mode, wording_sv, wording_en, content_provenance, source_reference)
  VALUES (b.rec_v, b.rec_p1, 'p1_human', 5, 'human_decision_notice', 'engage_explain', 'candidate', 'information_notice', 'recruitment_support',
          'Beslut fattas av arbetsgivaren, inte av systemet.', 'Decisions are made by the employer, not by the system.', 'cqrity_design_hypothesis', 'synthetic-fixture');
  PERFORM pg_temp.ok(pg_temp.blockers(b.rec_v) = '{}'::text[], 'B2.39b the fixture is complete again');
END $$;

-- Security vetting: each of the three activation requirements is
-- independently fail-closed, and security-vetting content can never be
-- reached from recruitment support.
DO $$
DECLARE b bk%ROWTYPE; _saved public.beskt_activation_requirements%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO b FROM bk;
  SELECT * INTO _saved FROM public.beskt_activation_requirements WHERE method_version_id = b.sv_v AND requirement_key = 'security_sensitive_role_attested';
  DELETE FROM public.beskt_activation_requirements WHERE id = _saved.id;
  PERFORM pg_temp.ok('SV_SECURITY_SENSITIVE_ROLE_NOT_ATTESTED' = ANY (pg_temp.blockers(b.sv_v))
    AND NOT ('SV_LAWFUL_BASIS_NOT_RECORDED' = ANY (pg_temp.blockers(b.sv_v))),
    'B2.40 without the security-sensitive-role requirement a security-vetting method blocks, on that gate alone');
  INSERT INTO public.beskt_activation_requirements SELECT _saved.*;

  SELECT * INTO _saved FROM public.beskt_activation_requirements WHERE method_version_id = b.sv_v AND requirement_key = 'lawful_basis_recorded';
  DELETE FROM public.beskt_activation_requirements WHERE id = _saved.id;
  PERFORM pg_temp.ok('SV_LAWFUL_BASIS_NOT_RECORDED' = ANY (pg_temp.blockers(b.sv_v))
    AND NOT ('SV_SECURITY_SENSITIVE_ROLE_NOT_ATTESTED' = ANY (pg_temp.blockers(b.sv_v))),
    'B2.41 without the lawful-basis requirement it blocks, on that gate alone');
  INSERT INTO public.beskt_activation_requirements SELECT _saved.*;

  SELECT * INTO _saved FROM public.beskt_activation_requirements WHERE method_version_id = b.sv_v AND requirement_key = 'authorised_security_owner_assigned';
  DELETE FROM public.beskt_activation_requirements WHERE id = _saved.id;
  PERFORM pg_temp.ok('SV_AUTHORISED_SECURITY_OWNER_NOT_ASSIGNED' = ANY (pg_temp.blockers(b.sv_v))
    AND NOT ('SV_LAWFUL_BASIS_NOT_RECORDED' = ANY (pg_temp.blockers(b.sv_v))),
    'B2.42 without the authorised-security-owner requirement it blocks, on that gate alone');
  INSERT INTO public.beskt_activation_requirements SELECT _saved.*;
  UPDATE public.beskt_activation_requirements SET satisfied_by_role = 'accountable_process_owner' WHERE id = _saved.id;
  PERFORM pg_temp.ok('SV_AUTHORISED_SECURITY_OWNER_NOT_ASSIGNED' = ANY (pg_temp.blockers(b.sv_v)),
    'B2.43 a security owner requirement satisfiable by a mere process owner does not count');
  UPDATE public.beskt_activation_requirements SET satisfied_by_role = 'authorised_security_function' WHERE id = _saved.id;

  UPDATE public.beskt_exposure_profiles SET security_sensitive_role_attestation_reference = NULL WHERE id = b.sv_p2;
  PERFORM pg_temp.ok('SV_SECURITY_SENSITIVE_ROLE_NOT_ATTESTED' = ANY (pg_temp.blockers(b.sv_v)),
    'B2.44 a security-vetting profile without an attestation reference blocks');
  UPDATE public.beskt_exposure_profiles SET security_sensitive_role_attestation_reference = 'ATTEST-SYNTHETIC-1' WHERE id = b.sv_p2;
  PERFORM pg_temp.ok(pg_temp.blockers(b.sv_v) = '{}'::text[], 'B2.44b the security-vetting fixture is complete again');

  -- A recruitment-support version cannot carry security-vetting content.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
             VALUES (%L, %L, %L, 'sv_item', 9, 'security_vetting_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'source_stated')$q$,
             b.rec_v, b.rec_s1, b.rec_p1),
    'beskt_items_mode_sensitivity_check', 'B2.45 a security-vetting item that is not security_vetting_only content cannot be represented');
  -- Recruitment routing into security-vetting content: refused at write
  -- (trigger) and, with the trigger bypassed, by the validator on the stored
  -- graph.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, condition_boolean, action, target_item_id)
             VALUES (%L, 'rec_into_sv', 50, 'recruitment_support', %L, 'boolean_equals', true, 'show', %L)$q$, b.sv_v, b.sv_i8, b.sv_i7),
    'BESKT_ROUTE_MODE_ESCALATION', 'B2.46 a recruitment-support rule cannot route into security-vetting content of its own profile');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
             VALUES (%L, 'rec_reads_sv', 50, 'recruitment_support', %L, 'always', 'show', %L)$q$, b.sv_v, b.sv_i7, b.sv_i8),
    'BESKT_ROUTE_MODE_ESCALATION', 'B2.47 a recruitment-support rule cannot read a security-vetting answer either');
  ALTER TABLE public.beskt_routing_rules DISABLE TRIGGER beskt_routing_rules_child_guard;
  INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, condition_boolean, action, target_item_id)
  VALUES (b.sv_v, 'forced_rec_into_sv', 50, 'recruitment_support', b.sv_i8, 'boolean_equals', true, 'show', b.sv_i7);
  ALTER TABLE public.beskt_routing_rules ENABLE TRIGGER beskt_routing_rules_child_guard;
  PERFORM pg_temp.ok('ROUTE_RECRUITMENT_INTO_SECURITY_VETTING' = ANY (pg_temp.blockers(b.sv_v)),
    'B2.48 and if such a rule is forced into the graph, publication is blocked by the validator');
  -- Even with the rule in place, recruitment-mode routing never reveals the
  -- security-vetting item: the security-vetting profile is refused outright
  -- in recruitment mode, and the recruitment profile never contains it.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT * FROM public.beskt_resolve_item_sequence(%L, %L, ''recruitment_support'', %L)', b.sv_v, b.sv_p2,
      '{"protected_information_training": {"kind": "boolean", "value": true}}'),
    'BESKT_MODE_NOT_PERMITTED', 'B2.49 recruitment-mode routing is refused over a security-vetting profile, whatever the rules say');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_resolve_item_sequence(b.sv_v, b.sv_p1, 'recruitment_support',
    '{"protected_information_training": {"kind": "boolean", "value": true}}'::jsonb) r
    JOIN public.beskt_items i ON i.id = r.item_id WHERE i.permitted_mode = 'security_vetting_support' OR i.exposure_profile_id = b.sv_p2;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B2.49a and recruitment-mode routing over the recruitment profile surfaces no security-vetting item');
  DELETE FROM public.beskt_routing_rules WHERE method_version_id = b.sv_v AND rule_key = 'forced_rec_into_sv';
  PERFORM pg_temp.ok(pg_temp.blockers(b.sv_v) = '{}'::text[], 'B2.49b complete again');

  -- Exposure profiles never cross: not by prompt, not by route, and a forced
  -- crossing is caught by the validator and ignored by the resolver.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_prompts (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage, addressee, question_form, permitted_probe_bases, permitted_mode, content_provenance)
             VALUES (%L, %L, %L, 'x_cross_probe', 99, 'specific_probe', 'account', 'candidate', 'neutral_clarification', ARRAY['submitted_answer'], 'security_vetting_support', 'source_stated')$q$,
             b.sv_v, b.sv_p1, b.sv_i7),
    'BESKT_CROSS_PROFILE_REFERENCE', 'B2.49c a prompt cannot probe an item of another exposure profile');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
             VALUES (%L, 'cross_profile', 51, 'security_vetting_support', %L, 'always', 'show', %L)$q$, b.sv_v, b.sv_i1, b.sv_i8),
    'BESKT_CROSS_PROFILE_REFERENCE', 'B2.49d a routing rule cannot connect items of two exposure profiles');
  ALTER TABLE public.beskt_routing_rules DISABLE TRIGGER beskt_routing_rules_child_guard;
  ALTER TABLE public.beskt_prompts DISABLE TRIGGER beskt_prompts_child_guard;
  INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
  VALUES (b.sv_v, 'forced_cross_profile', 51, 'security_vetting_support', b.sv_i1, 'always', 'show', b.sv_i8);
  INSERT INTO public.beskt_prompts (method_version_id, exposure_profile_id, item_id, prompt_key, display_order, prompt_kind, peace_stage, addressee, question_form, permitted_probe_bases, permitted_mode, wording_sv, wording_en, content_provenance, source_reference)
  VALUES (b.sv_v, b.sv_p1, b.sv_i7, 'forced_cross_probe', 99, 'specific_probe', 'account', 'candidate', 'neutral_clarification', ARRAY['submitted_answer'], 'security_vetting_support', 'Vad gjorde du?', 'What did you do?', 'source_stated', 's');
  ALTER TABLE public.beskt_prompts ENABLE TRIGGER beskt_prompts_child_guard;
  ALTER TABLE public.beskt_routing_rules ENABLE TRIGGER beskt_routing_rules_child_guard;
  PERFORM pg_temp.ok('ROUTE_CROSS_PROFILE' = ANY (pg_temp.blockers(b.sv_v)) AND 'PROMPT_CROSS_PROFILE' = ANY (pg_temp.blockers(b.sv_v)),
    'B2.49e forced cross-profile rows block publication in the validator');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_resolve_item_sequence(b.sv_v, b.sv_p2, 'security_vetting_support', '{}'::jsonb) r WHERE r.item_id = b.sv_i8;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 1, 'B2.49f the resolver treats a forced cross-profile show rule as absent: the target keeps its unconditional place in its own profile');
  DELETE FROM public.beskt_routing_rules WHERE method_version_id = b.sv_v AND rule_key = 'forced_cross_profile';
  DELETE FROM public.beskt_prompts WHERE method_version_id = b.sv_v AND prompt_key = 'forced_cross_probe';
  PERFORM pg_temp.ok(pg_temp.blockers(b.sv_v) = '{}'::text[], 'B2.49g complete again');
END $$;

-- Routing: unknown target, cycle, dead target; determinism; neutral omission.
DO $$
DECLARE b bk%ROWTYPE; _a text; _b2 text; _c text; _d text; _e text; _i9 uuid; _i10 uuid; _i11 uuid;
BEGIN
  SELECT * INTO b FROM bk;
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
             VALUES (%L, 'unknown_target', 50, 'recruitment_support', %L, 'always', 'show', gen_random_uuid())$q$, b.rec_v, b.rec_i1),
    'BESKT_ROUTE_ITEM_UNKNOWN', 'B2.50 an unknown routing target is refused');

  -- A cycle i9 <-> i10 and an item i11 reachable only through it.
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES (b.rec_v, b.rec_s1, b.rec_p1, 'cycle_a', 6, 'A', 'A', 'p', 'p', 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'cqrity_design_hypothesis', 's', ARRAY['suitability_inference']) RETURNING id INTO _i9;
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES (b.rec_v, b.rec_s1, b.rec_p1, 'cycle_b', 7, 'B', 'B', 'p', 'p', 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'cqrity_design_hypothesis', 's', ARRAY['suitability_inference']) RETURNING id INTO _i10;
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance, source_reference, prohibited_inferences)
  VALUES (b.rec_v, b.rec_s1, b.rec_p1, 'dead_end', 8, 'C', 'C', 'p', 'p', 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'cqrity_design_hypothesis', 's', ARRAY['suitability_inference']) RETURNING id INTO _i11;
  INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id) VALUES
    (b.rec_v, 'cyc1', 50, 'recruitment_support', _i9, 'always', 'show', _i10),
    (b.rec_v, 'cyc2', 51, 'recruitment_support', _i10, 'always', 'show', _i9),
    (b.rec_v, 'dead', 52, 'recruitment_support', _i9, 'always', 'show', _i11);
  PERFORM pg_temp.ok('ROUTE_CYCLE' = ANY (pg_temp.blockers(b.rec_v)), 'B2.51 a routing cycle blocks publication');
  PERFORM pg_temp.ok('ROUTE_TARGET_UNREACHABLE' = ANY (pg_temp.blockers(b.rec_v)), 'B2.52 a target reachable only through unreachable sources blocks publication');
  DELETE FROM public.beskt_routing_rules WHERE method_version_id = b.rec_v AND rule_key IN ('cyc1', 'cyc2', 'dead');
  DELETE FROM public.beskt_items WHERE id IN (_i9, _i10, _i11);
  PERFORM pg_temp.ok(pg_temp.blockers(b.rec_v) = '{}'::text[], 'B2.52b complete again');

  -- Determinism: identical inputs give byte-identical sequences, and the
  -- heap order of rules and items changes nothing.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT string_agg(sequence_position || ':' || item_key, ',' ORDER BY sequence_position) INTO _a
    FROM public.beskt_resolve_item_sequence(b.rec_v, b.rec_p1, 'recruitment_support',
      '{"lone_working_experience": {"kind": "option", "option_keys": ["yes"]}, "reported_incident": {"kind": "boolean", "value": true}}');
  RESET ROLE; PERFORM pg_temp.nobody();
  -- Physically rewrite the rules and items in reverse order.
  UPDATE public.beskt_routing_rules SET rule_key = rule_key WHERE method_version_id = b.rec_v;
  UPDATE public.beskt_items SET item_key = item_key WHERE method_version_id = b.rec_v;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT string_agg(sequence_position || ':' || item_key, ',' ORDER BY sequence_position) INTO _b2
    FROM public.beskt_resolve_item_sequence(b.rec_v, b.rec_p1, 'recruitment_support',
      '{"reported_incident": {"kind": "boolean", "value": true}, "lone_working_experience": {"kind": "option", "option_keys": ["yes"]}}');
  SELECT string_agg(sequence_position || ':' || item_key, ',' ORDER BY sequence_position) INTO _c
    FROM public.beskt_resolve_item_sequence(b.rec_v, b.rec_p1, 'recruitment_support', '{}');
  SELECT string_agg(sequence_position || ':' || item_key, ',' ORDER BY sequence_position) INTO _d
    FROM public.beskt_resolve_item_sequence(b.rec_v, b.rec_p1, 'recruitment_support',
      '{"lone_working_experience": {"kind": "omitted"}, "reported_incident": {"kind": "discuss_orally"}}');
  SELECT string_agg(sequence_position || ':' || item_key, ',' ORDER BY sequence_position) INTO _e
    FROM public.beskt_resolve_item_sequence(b.rec_v, b.rec_p1, 'recruitment_support',
      '{"lone_working_experience": {"kind": "option", "option_keys": ["no"]}, "reported_incident": {"kind": "boolean", "value": false}}');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_a = '1:lone_working_experience,2:lone_working_example,3:reported_incident,4:incident_context,5:information_acknowledged',
    format('B2.53 explicit answers yes/true open both follow-ups in display order (%s)', _a));
  PERFORM pg_temp.ok(_a = _b2, 'B2.54 the same structured inputs give the byte-identical sequence after heap reordering and key permutation');
  PERFORM pg_temp.ok(_c = '1:lone_working_experience,2:reported_incident,3:information_acknowledged',
    format('B2.55 with no answers the unconditional set appears in order (%s)', _c));
  PERFORM pg_temp.ok(_d = _c AND _e = _c,
    'B2.56 an omitted or discuss-orally answer follows the neutral unanswered routing baseline exactly: no rule fires, no adverse branch (an explicit no also fires nothing, so the sequences coincide without being the same answer)');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT * FROM public.beskt_resolve_item_sequence(%L, %L, ''security_vetting_support'', ''{}'')', b.rec_v, b.rec_p1),
    'BESKT_MODE_NOT_PERMITTED', 'B2.57 a recruitment-support method cannot be resolved in security-vetting mode');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT * FROM public.beskt_resolve_item_sequence(%L, %L, ''recruitment_support'', ''{}'')', b.rec_v, b.sv_p1),
    'BESKT_PROFILE_NOT_IN_VERSION', 'B2.58 routing cannot use an exposure profile of another version');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT * FROM public.beskt_resolve_item_sequence(%L, %L, ''recruitment_support'', ''"free text"'')', b.rec_v, b.rec_p1),
    'BESKT_ANSWERS_NOT_STRUCTURED', 'B2.59 free text is not an input to routing');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_routing_rules (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id, condition_kind, action, target_item_id)
             VALUES (%L, 'omission_branch', 60, 'recruitment_support', %L, 'omitted_or_discuss_orally', 'show', %L)$q$, b.rec_v, b.rec_i1, b.rec_i2),
    'beskt_routing_rules_condition_kind_check', 'B2.60 there is no condition kind for an omitted or discuss-orally answer: by construction, not by policy');
END $$;
DO $$ BEGIN RAISE NOTICE 'GROUP B3 — review, hash and lifecycle'; END $$;

-- The canonical SHA-256: a typed jsonb document, recomputable, stable
-- across insertion order, unambiguous under delimiter characters, changed
-- by any governed field, untouched by lifecycle.
DO $$
DECLARE b bk%ROWTYPE; _h1 text; _h2 text; _h3 text; _hx text; _hy text; _canon jsonb; _k text;
BEGIN
  SELECT * INTO b FROM bk;
  -- B2 edited and restored content with different wording; one governed
  -- touch makes the stored hash name the content as it now stands.
  PERFORM pg_temp.touch(b.rec_v);
  _h1 := public.beskt_method_content_hash(b.rec_v);
  _canon := public.beskt_canonical_content(b.rec_v);
  PERFORM pg_temp.ok(_h1 = encode(sha256(convert_to(_canon::text, 'UTF8')), 'hex') AND length(_h1) = 64,
    'B3.1 the content hash is exactly core sha256 over the canonical jsonb text in UTF-8, hex encoded');
  PERFORM pg_temp.ok(_h1 = (SELECT content_hash FROM public.beskt_method_versions WHERE id = b.rec_v),
    'B3.2 the stored hash names the planted content after the governed touch');
  PERFORM pg_temp.ok(jsonb_typeof(_canon) = 'object' AND _canon ->> 'schema' = 'beskt_canonical_content_v2'
    AND jsonb_typeof(_canon -> 'version') = 'object',
    'B3.3 the canonical representation is a typed jsonb document with a named schema');
  FOREACH _k IN ARRAY ARRAY['exposure_profiles', 'activation_requirements', 'sections', 'items', 'options', 'prompts',
                             'routing_rules', 'evidence_anchors', 'observation_fields'] LOOP
    IF jsonb_typeof(_canon -> _k) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B3.3b canonical collection % is missing or not an array', _k;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok(true, 'B3.3b every governed table contributes a named array to the canonical document');
  PERFORM pg_temp.ok(
    (_canon -> 'items' -> 0) ?& ARRAY['item_key', 'section_key', 'profile_key', 'wording_sv', 'wording_en', 'purpose_sv',
                                       'purpose_en', 'answer_type', 'requiredness', 'sensitivity_class', 'access_class',
                                       'prohibited_inferences']
    AND (_canon -> 'prompts' -> 0) ?& ARRAY['prompt_key', 'profile_key', 'item_key', 'prompt_kind', 'peace_stage', 'wording_sv']
    AND (_canon -> 'routing_rules' -> 0) ?& ARRAY['rule_key', 'source_item_key', 'target_item_key', 'condition_kind', 'condition_option_key', 'condition_boolean'],
    'B3.3c every row is a record of named fields, never a positional or delimited string');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_canon -> 'prompts') e WHERE jsonb_typeof(e -> 'item_key') = 'null') > 0
    AND (SELECT count(*) FROM jsonb_array_elements(_canon -> 'prompts') e WHERE NOT (e ? 'item_key')) = 0,
    'B3.3d an absent value is an explicit JSON null under its named field, never an omitted key');
  PERFORM pg_temp.ok(
    (SELECT bool_and(jsonb_typeof(e -> 'prohibited_inferences') = 'array') FROM jsonb_array_elements(_canon -> 'items') e),
    'B3.3e set-valued fields are JSON arrays, not joined strings');
  -- Rewrite every child row physically (no-op updates move heap position).
  UPDATE public.beskt_items SET item_key = item_key WHERE method_version_id = b.rec_v;
  UPDATE public.beskt_item_options o SET option_key = o.option_key FROM public.beskt_items i WHERE i.id = o.item_id AND i.method_version_id = b.rec_v;
  UPDATE public.beskt_prompts SET prompt_key = prompt_key WHERE method_version_id = b.rec_v;
  UPDATE public.beskt_evidence_anchors SET evidence_state = evidence_state WHERE method_version_id = b.rec_v;
  UPDATE public.beskt_routing_rules SET rule_key = rule_key WHERE method_version_id = b.rec_v;
  _h2 := public.beskt_method_content_hash(b.rec_v);
  PERFORM pg_temp.ok(_h1 = _h2, 'B3.4 insertion/heap order cannot alter the hash');
  -- An array in a different element order is the same governed content.
  UPDATE public.beskt_items SET prohibited_inferences = ARRAY['credibility_or_deception_inference', 'suitability_inference'] WHERE id = b.rec_i2;
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) = _h1, 'B3.5 array element order is canonicalised');
  UPDATE public.beskt_items SET prohibited_inferences = ARRAY['suitability_inference', 'credibility_or_deception_inference'] WHERE id = b.rec_i2;

  -- Delimiter characters cannot move content between fields: the same
  -- characters split differently across two fields are different content.
  FOREACH _k IN ARRAY ARRAY['|', E'\n', E'\x1f', '~', '"'] LOOP
    UPDATE public.beskt_items SET wording_sv = 'a' || _k || 'b', wording_en = 'c' WHERE id = b.rec_i4;
    _hx := public.beskt_method_content_hash(b.rec_v);
    UPDATE public.beskt_items SET wording_sv = 'a', wording_en = 'b' || _k || 'c' WHERE id = b.rec_i4;
    _hy := public.beskt_method_content_hash(b.rec_v);
    IF _hx = _hy THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B3.5b the field split around %L is ambiguous in the canonical hash', _k;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok(true, 'B3.5b two different field splits around a delimiter character (|, newline, unit separator, ~, ") give different hashes');
  -- Nor between rows.
  UPDATE public.beskt_item_options SET label_sv = 'Ja|Nej' WHERE id = b.rec_o_yes;
  UPDATE public.beskt_item_options SET label_sv = 'x' WHERE id = b.rec_o_no;
  _hx := public.beskt_method_content_hash(b.rec_v);
  UPDATE public.beskt_item_options SET label_sv = 'Ja' WHERE id = b.rec_o_yes;
  UPDATE public.beskt_item_options SET label_sv = 'Nej|x' WHERE id = b.rec_o_no;
  _hy := public.beskt_method_content_hash(b.rec_v);
  PERFORM pg_temp.ok(_hx <> _hy, 'B3.5c two different row splits of the same characters give different hashes');
  UPDATE public.beskt_item_options SET label_sv = 'Nej' WHERE id = b.rec_o_no;
  -- NULL and the empty string are different content.
  UPDATE public.beskt_items SET wording_en = NULL WHERE id = b.rec_i4;
  _hx := public.beskt_method_content_hash(b.rec_v);
  UPDATE public.beskt_items SET wording_en = '' WHERE id = b.rec_i4;
  _hy := public.beskt_method_content_hash(b.rec_v);
  PERFORM pg_temp.ok(_hx <> _hy AND _hx <> _h1 AND _hy <> _h1, 'B3.5d NULL and the empty string hash differently, and both differ from the text');
  UPDATE public.beskt_items SET wording_sv = 'Beskriv sammanhanget.', wording_en = 'Describe the context.' WHERE id = b.rec_i4;
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) = _h1, 'B3.5e restoring the wordings restores the hash');

  -- Every governed field changes it.
  UPDATE public.beskt_items SET wording_en = wording_en || ' (edited)' WHERE id = b.rec_i1;
  _h3 := public.beskt_method_content_hash(b.rec_v);
  PERFORM pg_temp.ok(_h3 <> _h1, 'B3.6 changing a reviewed item wording changes the hash');
  UPDATE public.beskt_items SET wording_en = replace(wording_en, ' (edited)', '') WHERE id = b.rec_i1;
  UPDATE public.beskt_item_options SET label_en = 'Yes indeed' WHERE id = b.rec_o_yes;
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) <> _h1, 'B3.7 changing an option label changes the hash');
  UPDATE public.beskt_item_options SET label_en = 'Yes' WHERE id = b.rec_o_yes;
  UPDATE public.beskt_routing_rules SET action = 'skip' WHERE method_version_id = b.rec_v AND rule_key = 'show_context_when_reported';
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) <> _h1, 'B3.8 changing a routing rule changes the hash');
  UPDATE public.beskt_routing_rules SET action = 'show' WHERE method_version_id = b.rec_v AND rule_key = 'show_context_when_reported';
  UPDATE public.beskt_evidence_anchors SET required_next_action = 'external_verification' WHERE method_version_id = b.rec_v AND evidence_state = 'not_applicable';
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) <> _h1, 'B3.9 changing an anchor component changes the hash');
  UPDATE public.beskt_evidence_anchors SET required_next_action = 'none' WHERE method_version_id = b.rec_v AND evidence_state = 'not_applicable';
  UPDATE public.beskt_exposure_profiles SET lawful_basis_reference = 'changed' WHERE id = b.rec_p1;
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) <> _h1, 'B3.10 changing a profile reference changes the hash');
  UPDATE public.beskt_exposure_profiles SET lawful_basis_reference = 'GDPR art. 6(1)(b) synthetic' WHERE id = b.rec_p1;
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) = _h1, 'B3.11 restoring every field restores the exact hash');
  -- Lifecycle fields are excluded.
  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions SET validation_label = 'content_validated', revision = revision + 1 WHERE id = b.rec_v;
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) = _h1, 'B3.12 a lifecycle field (validation_label) does not alter the reviewed content hash');
  UPDATE public.beskt_method_versions SET validation_label = 'pilot_hypothesis', revision = revision + 1 WHERE id = b.rec_v;
  PERFORM set_config('beskt.governed_transition', 'off', true);
  UPDATE bk SET hash_before = _h1;
END $$;

-- Five gate-specific, hash-bound, cycle-bound approvals; separation of
-- duties; stale approvals; a rejection ends the cycle; atomic publication.
DO $$
DECLARE b bk%ROWTYPE; _r jsonb; _events_before bigint; _rev integer; _h text; _g uuid; _cycle integer;
BEGIN
  SELECT * INTO b FROM bk;
  -- A reviewer cannot act before submission; a roleless user never.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''personnel_security'', ''approved'', ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_GATE_NOT_OPEN', 'B3.13 a review is recorded only while the version is in_review');
  -- Submission validates completeness: break, submit, fail; restore, submit.
  UPDATE public.beskt_items SET purpose_sv = NULL WHERE id = b.rec_i5;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_submit_for_review(gen_random_uuid(), %L, %s)', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_SUBMIT_BLOCKED', 'B3.14 an incomplete method cannot be submitted for review');
  UPDATE public.beskt_items SET purpose_sv = 'Kandidaten ska ha fått informationen.' WHERE id = b.rec_i5;
  _r := pg_temp.submit(b.rec_v);
  PERFORM pg_temp.ok(_r ->> 'content_status' = 'in_review'
    AND (SELECT content_status FROM public.beskt_method_versions WHERE id = b.rec_v) = 'in_review'
    AND (_r ->> 'review_cycle')::integer = 1
    AND (SELECT review_cycle FROM public.beskt_method_versions WHERE id = b.rec_v) = 1,
    'B3.15 a complete method is submitted for the five parallel gates and opens review cycle 1');

  -- Separation of duties and gate-specific authority.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_NOT_REVIEWER', 'B3.16 an editor holds no review gate');
  INSERT INTO public.scp_content_roles (user_id, role) VALUES ('b2000000-0000-4000-8000-0000000000e1', 'reviewer') ON CONFLICT DO NOTHING;
  _g := pg_temp.grant_kind('b2000000-0000-4000-8000-0000000000e1', 'senior_hr');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_SELF_REVIEW', 'B3.17 the author cannot approve their own method even when given the reviewer role and a gate grant');
  PERFORM pg_temp.revoke_grant(_g);
  DELETE FROM public.scp_content_roles WHERE user_id = 'b2000000-0000-4000-8000-0000000000e1' AND role = 'reviewer';
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_GATE_NOT_GRANTED', 'B3.17b a reviewer who holds the personnel-security grant cannot approve the senior-HR gate: the reviewer role alone opens no gate');
  _r := pg_temp.review(b.rec_v, 'b2000000-0000-4000-8000-0000000000a1', 'personnel_security');
  PERFORM pg_temp.ok(_r ->> 'decision' = 'approved' AND (_r ->> 'review_cycle')::integer = 1
    AND (SELECT review_cycle_at_review FROM public.beskt_method_reviews WHERE id = (_r ->> 'review_id')::uuid) = 1,
    'B3.17c the grant holder approves exactly their gate, and the review records the cycle it belongs to');
  _g := pg_temp.grant_kind('b2000000-0000-4000-8000-0000000000a1', 'senior_hr');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_REVIEW_ONE_GATE_PER_REVIEWER', 'B3.18 one human approves at most one of the five gates per content hash, even holding two grants');
  PERFORM pg_temp.revoke_grant(_g);
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a2',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''product'', ''approved'', ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_UNKNOWN_GATE', 'B3.19 the gate vocabulary is exactly the five PR 1 reviews');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a2',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''  '')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_RATIONALE_REQUIRED', 'B3.20 a review carries a written rationale');

  -- Four of five is not five.
  PERFORM pg_temp.review(b.rec_v, 'b2000000-0000-4000-8000-0000000000a2', 'senior_hr');
  PERFORM pg_temp.review(b.rec_v, 'b2000000-0000-4000-8000-0000000000a3', 'recruitment');
  PERFORM pg_temp.review(b.rec_v, 'b2000000-0000-4000-8000-0000000000a4', 'employment_privacy_legal');
  SELECT count(*) INTO _events_before FROM public.beskt_method_events WHERE method_version_id = b.rec_v;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'REVIEW_GATE_DATA_PROTECTION_NOT_APPROVED', 'B3.21 publication is blocked while any of the five gates is unapproved');
  PERFORM pg_temp.ok(
    (SELECT content_status FROM public.beskt_method_versions WHERE id = b.rec_v) = 'in_review'
    AND (SELECT count(*) FROM public.beskt_method_events WHERE method_version_id = b.rec_v) = _events_before,
    'B3.22 a blocked publication is atomic: no status change and no event');
  PERFORM pg_temp.review(b.rec_v, 'b2000000-0000-4000-8000-0000000000a5', 'data_protection');
  -- Wrong roles.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_NOT_PUBLISHER', 'B3.23 an editor cannot publish');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_NOT_PUBLISHER', 'B3.24 a reviewer cannot publish');

  -- Stale approvals: a content edit after five approvals invalidates all of
  -- them by construction. First without a governed touch (hash stale), then
  -- with one (gates stale).
  UPDATE public.beskt_items SET wording_en = wording_en || ' (post-approval edit)' WHERE id = b.rec_i1;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_CONTENT_HASH_STALE', 'B3.25 content that moved under the reviewed hash cannot be published');
  _r := pg_temp.touch(b.rec_v);
  PERFORM pg_temp.ok(_r ->> 'content_hash' <> b.hash_before, 'B3.26 the governed touch records the new hash');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'REVIEW_GATE_PERSONNEL_SECURITY_NOT_APPROVED', 'B3.27 every earlier approval is stale after a content edit');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.beskt_method_reviews WHERE method_version_id = b.rec_v AND decision = 'approved') = 5,
    'B3.28 the stale approvals remain as history; they simply no longer match');
  -- Restore the content within the same cycle: the hash returns to the
  -- reviewed one and the five approvals count again, because they bind to
  -- this hash in this cycle.
  UPDATE public.beskt_items SET wording_en = replace(wording_en, ' (post-approval edit)', '') WHERE id = b.rec_i1;
  _r := pg_temp.touch(b.rec_v);
  PERFORM pg_temp.ok(_r ->> 'content_hash' = b.hash_before, 'B3.29 restoring the reviewed content restores the reviewed hash');

  -- A rejection ends the review cycle. After re-submission every gate needs
  -- a fresh approval even though not one byte changed.
  _r := pg_temp.review(b.rec_v, 'b2000000-0000-4000-8000-0000000000a6', 'data_protection', 'rejected');
  PERFORM pg_temp.ok((SELECT content_status FROM public.beskt_method_versions WHERE id = b.rec_v) = 'draft'
    AND _r ->> 'content_status' = 'draft',
    'B3.30 a rejection returns the version to draft');
  _r := pg_temp.submit(b.rec_v);
  _cycle := (SELECT review_cycle FROM public.beskt_method_versions WHERE id = b.rec_v);
  PERFORM pg_temp.ok(_cycle = 2 AND (_r ->> 'review_cycle')::integer = 2
    AND _r ->> 'content_hash' = b.hash_before
    AND (SELECT content_hash FROM public.beskt_method_versions WHERE id = b.rec_v) = b.hash_before,
    'B3.30b re-submission of the unchanged content opens review cycle 2 at the very same hash');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'REVIEW_GATE_PERSONNEL_SECURITY_NOT_APPROVED', 'B3.30c publication is refused: five approvals at the identical hash from the ended cycle do not carry over');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_method_reviews WHERE method_version_id = b.rec_v AND decision = 'approved'
       AND content_hash_at_review = b.hash_before AND review_cycle_at_review = 1) = 5
    AND (SELECT count(*) FROM public.beskt_method_reviews WHERE method_version_id = b.rec_v AND review_cycle_at_review = 2) = 0,
    'B3.30d the five earlier approvals are history of cycle 1; cycle 2 has none');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'REVIEW_GATE_DATA_PROTECTION_NOT_APPROVED', 'B3.30e all five gates are named as unapproved in the new cycle, not only the first');
  PERFORM pg_temp.approve_all(b.rec_v);
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_method_reviews WHERE method_version_id = b.rec_v AND decision = 'approved' AND review_cycle_at_review = 2) = 5,
    'B3.30f five new approvals by the five grant holders are recorded against cycle 2');

  -- The publisher who is also the author is refused, on a method they wrote.
  -- That method also carries one item readable by the authorised security
  -- function only; the read contract below proves it is refused whole to an
  -- internal QA reader.
  DECLARE _mine uuid;
  BEGIN
    _mine := pg_temp.build_method('beskt-synthetic-author', 'recruitment_support', 'b2000000-0000-4000-8000-0000000000b2', false);
    UPDATE public.beskt_items SET access_class = 'authorised_security_function'
     WHERE method_version_id = _mine AND item_key = 'information_acknowledged';
    PERFORM pg_temp.submit(_mine);
    PERFORM pg_temp.approve_all(_mine);
    PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b2',
      format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', _mine, pg_temp.revision_of(_mine)),
      'BESKT_PUBLISHER_IS_AUTHOR', 'B3.31 a publisher cannot publish a method they authored, even with five approvals');
    _r := pg_temp.publish(_mine);
    PERFORM pg_temp.ok(_r ->> 'content_status' = 'published', 'B3.31b an independent publisher can');
    UPDATE bk SET scratch = _mine::text;
  END;
  -- Publish the recruitment method for real.
  _rev := pg_temp.revision_of(b.rec_v);
  _r := pg_temp.publish(b.rec_v);
  PERFORM pg_temp.ok(_r ->> 'content_status' = 'published'
    AND (_r ->> 'revision')::integer = _rev + 1
    AND _r ->> 'content_hash' = b.hash_before
    AND (SELECT published_by FROM public.beskt_method_versions WHERE id = b.rec_v) = 'b2000000-0000-4000-8000-0000000000b1',
    'B3.32 with five current-hash, current-cycle approvals the publisher publishes; the hash is the reviewed hash');
  PERFORM pg_temp.ok(public.beskt_method_content_hash(b.rec_v) = b.hash_before,
    'B3.33 publication did not change the content hash');
  PERFORM pg_temp.ok(
    (SELECT event FROM public.beskt_method_events WHERE method_version_id = b.rec_v ORDER BY seq DESC LIMIT 1) = 'published',
    'B3.34 the publication is in the ledger');
END $$;

-- Immutability from published onward, on the version and on every child,
-- including re-parenting in either direction.
DO $$
DECLARE b bk%ROWTYPE; _t text; _v2 uuid; _p2 uuid; _s2 uuid; _i2 uuid;
BEGIN
  SELECT * INTO b FROM bk;
  PERFORM set_config('beskt.governed_transition', 'on', true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.beskt_method_versions SET summary_sv = ''ändrad'', revision = revision + 1 WHERE id = %L', b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.35 a published version''s content is frozen even under the governed marker');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.beskt_method_versions SET content_status = ''draft'', revision = revision + 1 WHERE id = %L', b.rec_v),
    'BESKT_ILLEGAL_TRANSITION', 'B3.36 a published version cannot go back to draft');
  PERFORM set_config('beskt.governed_transition', 'off', true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.beskt_method_versions SET summary_sv = ''ändrad'' WHERE id = %L', b.rec_v),
    'BESKT_UNGOVERNED_WRITE', 'B3.37 no direct table update reaches a version at all');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET wording_sv = ''x'' WHERE id = %L', b.rec_i1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.38 a published item cannot be updated');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.beskt_items WHERE id = %L', b.rec_i5),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.39 a published item cannot be deleted');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_item_options SET label_sv = ''x'' WHERE id = %L', b.rec_o_yes),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.40 a published option cannot be updated');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.beskt_prompts WHERE method_version_id = %L AND prompt_key = ''p1_closure''', b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.41 a published prompt cannot be deleted');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_routing_rules SET action = ''skip'' WHERE method_version_id = %L', b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.42 a published routing rule cannot be updated');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_evidence_anchors SET definition_sv = ''x'' WHERE method_version_id = %L', b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.43 a published anchor cannot be updated');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.beskt_observation_fields WHERE method_version_id = %L', b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.44 a published observation-field definition cannot be deleted');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_exposure_profiles SET duties_sv = ''x'' WHERE id = %L', b.rec_p1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.45 a published exposure profile cannot be updated');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_sections SET title_sv = ''x'' WHERE id = %L', b.rec_s1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.46 a published section cannot be updated');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
             VALUES (%L, %L, %L, 'late_item', 9, 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary', 'ordinary', 'recruiter', 'source_stated')$q$, b.rec_v, b.rec_s1, b.rec_p1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.47 nothing can be added to a published version either');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_touch_draft(gen_random_uuid(), %L, %s, ''x'')', b.rec_v, pg_temp.revision_of(b.rec_v)),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.48 the touch RPC refuses a published version');
  -- A second version is the only way forward.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_create_method_version(gen_random_uuid(), b.rec_pack, 'recruitment_support', 'synthetic-fixture', 'test-2', 'cqrity_design_hypothesis');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok((SELECT max(version_number) FROM public.beskt_method_versions WHERE pack_id = b.rec_pack) = 2,
    'B3.49 a substantive change is a new version');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_create_method_version(gen_random_uuid(), %L, ''recruitment_support'', ''s'', ''t'', ''source_stated'')', b.rec_pack),
    'BESKT_OPEN_VERSION_EXISTS', 'B3.50 one open version per method at a time');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'beskt_method_versions'
      AND indexname = 'beskt_method_versions_one_open_idx' AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ~* 'WHERE \(content_status = ANY \(ARRAY\[''draft''::text, ''in_review''::text\]\)\)') = 1,
    'B3.50b the one-open-version rule is also a partial unique index on the table, not only an RPC check');
  PERFORM set_config('beskt.governed_transition', 'on', true);
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_method_versions (pack_id, version_number, mode, source_reference, source_document_version, content_provenance)
             VALUES (%L, 3, 'recruitment_support', 'x', 'y', 'source_stated')$q$, b.rec_pack),
    'beskt_method_versions_one_open_idx', 'B3.50c a second open version inserted past the RPC is refused by the index itself');
  PERFORM set_config('beskt.governed_transition', 'off', true);

  -- Re-parenting across the frozen boundary, in both directions, per family.
  SELECT id INTO _v2 FROM public.beskt_method_versions WHERE pack_id = b.rec_pack AND version_number = 2;
  INSERT INTO public.beskt_exposure_profiles
    (method_version_id, profile_key, display_order, exposure_area, duties_sv, duties_en,
     role_relevance_rationale_sv, role_relevance_rationale_en, permitted_mode, owning_review_role,
     jurisdiction_reference, lawful_basis_reference, retention_class, access_class, content_provenance, source_reference)
  VALUES (_v2, 'lone_working', 1, 'lone_working', 'x', 'x', 'x', 'x', 'recruitment_support', 'recruitment', 'SE', 'x',
          'recruitment_record', 'recruiter', 'cqrity_design_hypothesis', 'synthetic-fixture')
  RETURNING id INTO _p2;
  INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase, title_sv, title_en)
  VALUES (_v2, 'preparation', 1, 'candidate_preparation', 'x', 'x') RETURNING id INTO _s2;
  INSERT INTO public.beskt_items
    (method_version_id, section_id, exposure_profile_id, item_key, display_order, permitted_mode, phase, answer_type,
     requiredness, sensitivity_class, access_class, content_provenance)
  VALUES (_v2, _s2, _p2, 'draft_item', 1, 'recruitment_support', 'candidate_preparation', 'short_text', 'voluntary',
          'ordinary', 'recruiter', 'cqrity_design_hypothesis')
  RETURNING id INTO _i2;
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET method_version_id = %L WHERE id = %L', _v2, b.rec_i1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50d a published item cannot be moved under the draft: the OLD owner is checked');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_sections SET method_version_id = %L WHERE id = %L', _v2, b.rec_s2),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50e nor a published section');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_exposure_profiles SET method_version_id = %L WHERE id = %L', _v2, b.rec_p1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50f nor a published exposure profile');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_prompts SET method_version_id = %L WHERE method_version_id = %L AND prompt_key = ''p1_open''', _v2, b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50g nor a published prompt');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_routing_rules SET method_version_id = %L WHERE method_version_id = %L', _v2, b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50h nor a published routing rule');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_evidence_anchors SET method_version_id = %L WHERE method_version_id = %L AND evidence_state = ''unaddressed''', _v2, b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50i nor a published evidence anchor');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_observation_fields SET method_version_id = %L WHERE method_version_id = %L AND field_key = ''fact''', _v2, b.rec_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50j nor a published observation-field definition');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_item_options SET item_id = %L WHERE id = %L', _i2, b.rec_o_yes),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50k nor a published option, whose owner is resolved through its item');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET method_version_id = %L WHERE id = %L', b.rec_v, _i2),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50l a draft item cannot be moved under the published version: the NEW owner is checked');
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET method_version_id = %L WHERE id = %L', _v2, b.rec_i1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50m moving a published child into a draft is refused even as service_role');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_item_options SET item_id = %L WHERE id = %L', _i2, b.rec_o_yes),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.50n and so is moving a published option, as service_role');
  RESET ROLE;
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_items WHERE method_version_id = b.rec_v) = 6
    AND (SELECT count(*) FROM public.beskt_items WHERE method_version_id = _v2) = 1
    AND (SELECT item_id FROM public.beskt_item_options WHERE id = b.rec_o_yes) = b.rec_i1,
    'B3.50o every refused move left the published version and the draft exactly as they were');
END $$;

-- The read contract: governance and explicit internal QA only, whole
-- documents only.
DO $$
DECLARE b bk%ROWTYPE; _doc jsonb; _n integer; _v2 uuid; _mine uuid;
BEGIN
  SELECT * INTO b FROM bk;
  _mine := b.scratch::uuid;
  SELECT id INTO _v2 FROM public.beskt_method_versions WHERE pack_id = b.rec_pack AND version_number = 2;
  -- Governance reader.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _doc := public.beskt_published_method(b.rec_v);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_doc ->> 'content_status' = 'published' AND _doc ->> 'content_hash' = b.hash_before
    AND jsonb_array_length(_doc -> 'evidence_anchors') = 7
    AND jsonb_array_length(_doc -> 'observation_fields') = 10
    AND jsonb_array_length(_doc -> 'sections') = 2
    AND _doc ->> 'release_scope' = 'synthetic_internal_only'
    AND _doc ->> 'validation_label' = 'pilot_hypothesis',
    'B3.51 the read contract returns the published governed document with its hash, seven anchors and ten observation fields');
  PERFORM pg_temp.ok(
    NOT (_doc::text ~* '"(score|level|weight|threshold|total|rank|pass_fail|suitability|credibility|truthfulness|recommendation|risk|verdict|startable|start_route|case_id|candidate)[a-z_]*":'),
    'B3.52 the document carries no score, level, risk, verdict, candidate or start key');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_doc -> 'prompts') p
      WHERE p ->> 'peace_stage' = 'evaluation' AND p ->> 'addressee' = 'interviewer'
        AND p ->> 'prompt_kind' = 'interviewer_self_review') = 1
    AND NOT ((_doc -> 'prompts')::text ~* '"(score|verdict|rating|grade)[a-z_]*":'),
    'B3.52b PEACE Evaluation is present as one interviewer-addressed self-review step and carries no candidate score or verdict');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_published_method(%L)', _v2),
    'BESKT_NOT_PUBLISHED', 'B3.53 the read contract excludes drafts even for a governance reader');
  -- Explicit internal QA: published recruitment-support content, whole
  -- documents within its access classes, nothing else.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000fa');
  SET LOCAL ROLE authenticated;
  _doc := public.beskt_published_method(b.rec_v);
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions() l WHERE l.method_version_id = b.rec_v;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_doc ->> 'method_version_id' = b.rec_v::text AND _n = 1,
    'B3.54 an explicit internal-QA grantee reads the published recruitment-support method and finds it in the listing');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000fa');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_resolve_item_sequence(b.rec_v, b.rec_p1, 'recruitment_support', '{}');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n > 0, 'B3.54b the internal-QA grantee can resolve routing over it');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000fa',
    format('SELECT public.beskt_published_method(%L)', _mine),
    'BESKT_NOT_AUTHORISED', 'B3.54c a published recruitment-support method with one item for the authorised security function is refused WHOLE to internal QA, never returned in part');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000fa');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions() l WHERE l.method_version_id = _mine;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B3.54d and it is absent from the internal-QA listing');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _doc := public.beskt_published_method(_mine);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_doc ->> 'method_version_id' = _mine::text
    AND (SELECT count(*) FROM jsonb_array_elements(_doc -> 'sections') s, jsonb_array_elements(s -> 'items') i
          WHERE i ->> 'access_class' = 'authorised_security_function') = 1,
    'B3.54e a governance reader reads that same document whole, security-function item included');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000fa',
    format('SELECT public.beskt_published_method(%L)', _v2),
    'BESKT_NOT_AUTHORISED', 'B3.55 internal QA cannot read a draft');
  -- Everyone else: an active member of an active employer, a member of a
  -- suspended employer, a candidate, a roleless user, anon.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT public.beskt_published_method(%L)', b.rec_v),
    'BESKT_NOT_AUTHORISED', 'B3.55b an ordinary active employer member reads nothing: synthetic_internal_only means no employer principal');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions();
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B3.55c the listing is empty for an employer member');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT * FROM public.beskt_resolve_item_sequence(%L, %L, ''recruitment_support'', ''{}'')', b.rec_v, b.rec_p1),
    'BESKT_NOT_AUTHORISED', 'B3.55d nor can an employer member resolve routing');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d2',
    format('SELECT public.beskt_published_method(%L)', b.rec_v),
    'BESKT_NOT_AUTHORISED', 'B3.56 a member of a suspended employer reads nothing');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000c1',
    format('SELECT public.beskt_published_method(%L)', b.rec_v),
    'BESKT_NOT_AUTHORISED', 'B3.57 a candidate reads nothing');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1',
    format('SELECT public.beskt_published_method(%L)', b.rec_v),
    'BESKT_NOT_AUTHORISED', 'B3.58 an ordinary signed-in user reads nothing');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000f1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions();
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B3.58b and lists nothing');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000fa');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_items;
  _n := _n + (SELECT count(*) FROM public.beskt_method_versions) + (SELECT count(*) FROM public.beskt_governance_grants);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B3.58c internal QA reads zero rows through the tables: the read contract is the only door');
  PERFORM pg_temp.must_fail_as('anon', NULL,
    format('SELECT public.beskt_published_method(%L)', b.rec_v),
    'permission denied', 'B3.59 anon cannot even execute the read');
END $$;

-- Publish the security-vetting method (as a separate author-independent
-- publisher) and prove it is unreadable outside governance and that
-- suspended / retired versions are never selectable.
DO $$
DECLARE b bk%ROWTYPE; _n integer; _r jsonb; _v2 uuid;
BEGIN
  SELECT * INTO b FROM bk;
  SELECT id INTO _v2 FROM public.beskt_method_versions WHERE pack_id = b.rec_pack AND version_number = 2;
  PERFORM pg_temp.submit(b.sv_v);
  PERFORM pg_temp.approve_all(b.sv_v);
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e2',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', b.sv_v, pg_temp.revision_of(b.sv_v)),
    'BESKT_NOT_PUBLISHER', 'B3.60 a second editor is refused before authorship is even considered');
  _r := pg_temp.publish(b.sv_v);
  PERFORM pg_temp.ok(_r ->> 'content_status' = 'published', 'B3.61 the security-vetting method publishes with its three requirements and five gates');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_activation_requirements SET method_version_id = %L WHERE method_version_id = %L AND requirement_key = ''lawful_basis_recorded''', _v2, b.sv_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.61b a published activation requirement cannot be moved under a draft');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT public.beskt_published_method(%L)', b.sv_v),
    'BESKT_NOT_AUTHORISED', 'B3.62 an active employer member cannot read published security-vetting content');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000fa',
    format('SELECT public.beskt_published_method(%L)', b.sv_v),
    'BESKT_NOT_AUTHORISED', 'B3.62b nor can internal QA: no authorised security function exists in PR 2, so it fails closed');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000fa');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions() WHERE mode = 'security_vetting_support';
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B3.63 the listing never names security-vetting content to internal QA');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000fa',
    format('SELECT * FROM public.beskt_resolve_item_sequence(%L, %L, ''recruitment_support'', ''{}'')', b.sv_v, b.sv_p1),
    'BESKT_NOT_AUTHORISED', 'B3.64 nor can routing be resolved over it by internal QA, not even in recruitment-support mode');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions();
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 3, 'B3.65 a governance reader lists every published method, the security-vetting one included');

  -- Suspend, then retire.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1',
    format('SELECT public.beskt_suspend_version(gen_random_uuid(), %L, %s, ''  '')', b.sv_v, pg_temp.revision_of(b.sv_v)),
    'BESKT_REASON_REQUIRED', 'B3.66 suspension carries a written reason');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000b1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_suspend_version(gen_random_uuid(), b.sv_v, pg_temp.revision_of(b.sv_v), 'Suspenderad för test.');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_r ->> 'content_status' = 'suspended', 'B3.67 a published version can be suspended');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions() WHERE method_version_id = b.sv_v;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B3.68 a suspended version is never listed as selectable');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_published_method(%L)', b.sv_v),
    'BESKT_NOT_PUBLISHED', 'B3.69 the read contract refuses a suspended version');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET wording_sv = ''x'' WHERE id = %L', b.sv_i7),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.70 a suspended version''s children stay frozen');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET method_version_id = %L WHERE id = %L', _v2, b.sv_i8),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.70b and cannot be moved under a draft');
  PERFORM set_config('beskt.governed_transition', 'on', true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.beskt_method_versions SET content_status = ''published'', revision = revision + 1 WHERE id = %L', b.sv_v),
    'BESKT_ILLEGAL_TRANSITION', 'B3.71 a suspended version cannot be re-published by hand');
  PERFORM set_config('beskt.governed_transition', 'off', true);
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000b1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_retire_version(gen_random_uuid(), b.sv_v, pg_temp.revision_of(b.sv_v), 'Pensionerad för test.');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_r ->> 'content_status' = 'retired'
    AND (SELECT count(*) FROM public.beskt_method_versions WHERE id = b.sv_v) = 1
    AND (SELECT count(*) FROM public.beskt_method_reviews WHERE method_version_id = b.sv_v) = 5,
    'B3.72 a retired version remains, with its reviews and history, for governed integrity only');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_prompts SET method_version_id = %L WHERE method_version_id = %L AND prompt_key = ''p2_open''', _v2, b.sv_v),
    'BESKT_PUBLISHED_IMMUTABLE', 'B3.72b a retired version''s children cannot be moved under a draft either');
  PERFORM set_config('beskt.governed_transition', 'on', true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.beskt_method_versions SET content_status = ''suspended'', revision = revision + 1 WHERE id = %L', b.sv_v),
    'BESKT_ILLEGAL_TRANSITION', 'B3.73 retired is terminal');
  PERFORM set_config('beskt.governed_transition', 'off', true);
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP B4 — concurrency and idempotency'; END $$;

DO $$
DECLARE b bk%ROWTYPE; _v2 uuid; _op uuid := gen_random_uuid(); _r1 jsonb; _r2 jsonb; _rev integer; _events bigint; _hash text;
BEGIN
  SELECT * INTO b FROM bk;
  SELECT id INTO _v2 FROM public.beskt_method_versions WHERE pack_id = b.rec_pack AND version_number = 2;
  _rev := pg_temp.revision_of(_v2);

  -- Same operation id + same payload: the original result, no second write.
  _r1 := pg_temp.touch(_v2, _op);
  SELECT count(*) INTO _events FROM public.beskt_method_events WHERE method_version_id = _v2;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  -- Replayed with the ORIGINAL expected revision, which is now stale: the
  -- replay is answered before the compare-and-swap.
  _r2 := public.beskt_touch_draft(_op, _v2, _rev, 'test touch');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_r1 = _r2, 'B4.1 the same actor + operation + payload returns the original result');
  PERFORM pg_temp.ok(pg_temp.revision_of(_v2) = _rev + 1
    AND (SELECT count(*) FROM public.beskt_method_events WHERE method_version_id = _v2) = _events,
    'B4.2 the replay wrote nothing: one revision step, one event');
  PERFORM pg_temp.ok((_r2 ->> 'revision')::integer = _rev + 1,
    'B4.3 replay is checked BEFORE the compare-and-swap: a retry after a lost response answers with its result, not a false stale-revision error');

  -- Same operation id, different payload.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_touch_draft(%L, %L, %s, ''a different summary'')', _op, _v2, _rev),
    'BESKT_OPERATION_PAYLOAD_MISMATCH', 'B4.4 the same operation id with a changed payload is refused');
  -- Same operation id, another actor.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e2',
    format('SELECT public.beskt_touch_draft(%L, %L, %s, ''test touch'')', _op, _v2, _rev),
    'BESKT_OPERATION_ACTOR_MISMATCH', 'B4.5 an operation id belongs to the actor who used it');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_touch_draft(NULL, %L, %s, ''x'')', _v2, _rev + 1),
    'BESKT_OPERATION_ID_REQUIRED', 'B4.6 an operation id is required');

  -- Stale expected revision: refused without writing.
  SELECT count(*) INTO _events FROM public.beskt_method_events WHERE method_version_id = _v2;
  _hash := (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v2);
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_touch_draft(gen_random_uuid(), %L, %s, ''stale'')', _v2, _rev),
    'BESKT_STALE_REVISION', 'B4.7 a stale expected revision is refused');
  PERFORM pg_temp.ok(pg_temp.revision_of(_v2) = _rev + 1
    AND (SELECT count(*) FROM public.beskt_method_events WHERE method_version_id = _v2) = _events
    AND (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v2) = _hash,
    'B4.8 and nothing was written: revision, hash and ledger unchanged');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_touch_draft(gen_random_uuid(), %L, NULL, ''x'')', _v2),
    'BESKT_REVISION_REQUIRED', 'B4.9 an expected revision is required');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_submit_for_review(gen_random_uuid(), %L, %s)', _v2, _rev),
    'BESKT_STALE_REVISION', 'B4.10 the same compare-and-swap guards submission');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', _v2, _rev),
    'BESKT_STALE_REVISION', 'B4.11 and publication');

  -- Concurrent older writes: the revision never regresses, even under the
  -- governed marker, even for the owner.
  PERFORM set_config('beskt.governed_transition', 'on', true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.beskt_method_versions SET revision = %s, summary_sv = ''older'' WHERE id = %L', _rev, _v2),
    'BESKT_REVISION_REGRESSION', 'B4.12 an older revision cannot overwrite newer content');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.beskt_method_versions SET summary_sv = ''same revision'' WHERE id = %L', _v2),
    'BESKT_REVISION_NOT_ADVANCED', 'B4.13 a change at the same revision is refused');
  PERFORM set_config('beskt.governed_transition', 'off', true);

  -- Receipts live in the definer-only ledger with a unique operation id.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'beskt_method_events'
      AND indexdef ~* 'UNIQUE INDEX .* \(operation_id\) WHERE \(operation_id IS NOT NULL\)') = 1,
    'B4.14 an operation id is recorded at most once');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_method_events e WHERE e.operation_id = _op AND e.request_hash IS NOT NULL AND e.result IS NOT NULL) = 1,
    'B4.15 the receipt carries the request hash and the original result');
  PERFORM pg_temp.ok(
    (SELECT request_hash FROM public.beskt_method_events e WHERE e.operation_id = _op)
      = public.beskt_request_hash(jsonb_build_object('op', 'touch_draft', 'method_version_id', _v2, 'expected_revision', _rev, 'summary', 'test touch')),
    'B4.16 the request hash is sha256 over the canonical request');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP B5 — authorisation and security'; END $$;

DO $$
DECLARE b bk%ROWTYPE; _t text; _fn record; _n integer; _v2 uuid;
  _tables text[] := ARRAY['beskt_method_versions', 'beskt_exposure_profiles', 'beskt_activation_requirements',
    'beskt_sections', 'beskt_items', 'beskt_item_options', 'beskt_prompts', 'beskt_routing_rules',
    'beskt_evidence_anchors', 'beskt_observation_fields', 'beskt_governance_grants', 'beskt_method_reviews', 'beskt_method_events'];
BEGIN
  SELECT * INTO b FROM bk;
  SELECT id INTO _v2 FROM public.beskt_method_versions WHERE pack_id = b.rec_pack AND version_number = 2;

  -- Every BESKT table: ENABLE + FORCE RLS, no client write privilege, no
  -- anon or PUBLIC privilege, no write policy, no unconditional policy.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'beskt\_%' ESCAPE '\') = 13
    AND (SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'beskt\_%' ESCAPE '\'),
    'B5.1 all thirteen BESKT tables carry both ENABLE and FORCE ROW LEVEL SECURITY');
  FOREACH _t IN ARRAY _tables LOOP
    IF has_table_privilege('authenticated', 'public.' || _t, 'INSERT') OR has_table_privilege('authenticated', 'public.' || _t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || _t, 'DELETE') OR has_table_privilege('authenticated', 'public.' || _t, 'TRUNCATE')
       OR has_table_privilege('anon', 'public.' || _t, 'SELECT') OR has_table_privilege('anon', 'public.' || _t, 'INSERT') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B5.2 % grants a client role a write or an anon read', _t;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok(true, 'B5.2 no BESKT table grants INSERT, UPDATE, DELETE or TRUNCATE to authenticated, and nothing to anon');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename LIKE 'beskt\_%' ESCAPE '\' AND p.cmd <> 'SELECT') = 0
    AND (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename LIKE 'beskt\_%' ESCAPE '\' AND (p.qual IS NULL OR p.qual = 'true')) = 0
    AND (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename LIKE 'beskt\_%' ESCAPE '\') = 13,
    'B5.3 exactly one governance-reader SELECT policy per table; no write policy, no unconditional policy');

  -- Direct DML as authenticated is refused on every table, whatever the role.
  FOREACH _t IN ARRAY _tables LOOP
    PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
      format('UPDATE public.%I SET id = id', _t), 'permission denied',
      format('B5.4 direct UPDATE on %s is refused even for the editor', _t));
    PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
      format('DELETE FROM public.%I', _t), 'permission denied',
      format('B5.5 direct DELETE on %s is refused', _t));
  END LOOP;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('INSERT INTO public.beskt_method_events (pack_id, event) VALUES (%L, ''published'')', b.rec_pack),
    'permission denied', 'B5.6 the ledger has no client writer');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1',
    format('INSERT INTO public.beskt_method_reviews (method_version_id, gate, decision, reviewer_id, rationale, content_hash_at_review, revision_at_review) VALUES (%L, ''senior_hr'', ''approved'', ''b2000000-0000-4000-8000-0000000000a1'', ''x'', ''h'', 1)', _v2),
    'permission denied', 'B5.7 a reviewer cannot write a review row directly');

  -- Reads: governance readers see the domain; an employer member, a
  -- candidate and a roleless user see zero rows through the tables.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_items;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n > 0, 'B5.8 a content role reads governed content through the tables');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_items;
  _n := _n + (SELECT count(*) FROM public.beskt_method_versions) + (SELECT count(*) FROM public.beskt_method_reviews);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B5.9 an employer member reads zero rows through the tables (published content reaches them only through the read RPC)');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000c1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_evidence_anchors;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B5.10 a candidate reads zero rows');
  PERFORM pg_temp.must_fail_as('anon', NULL, 'SELECT count(*) FROM public.beskt_items', 'permission denied', 'B5.11 anon cannot read the tables');

  -- Mutations: anon refused at the grant, roleless users refused inside.
  PERFORM pg_temp.must_fail_as('anon', NULL,
    'SELECT public.beskt_create_method(gen_random_uuid(), ''anon-method'', ''x'', ''y'')',
    'permission denied', 'B5.12 anon cannot execute a mutation');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1',
    'SELECT public.beskt_create_method(gen_random_uuid(), ''roleless-method'', ''x'', ''y'')',
    'BESKT_NOT_EDITOR', 'B5.13 an ordinary signed-in user without the exact content role cannot create a method');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT public.beskt_touch_draft(gen_random_uuid(), %L, %s, ''x'')', _v2, pg_temp.revision_of(_v2)),
    'BESKT_NOT_EDITOR', 'B5.14 an employer member cannot edit governed content');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', _v2, pg_temp.revision_of(_v2)),
    'BESKT_NOT_REVIEWER', 'B5.15 a roleless user cannot review');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1',
    format('SELECT public.beskt_publish_version(gen_random_uuid(), %L, %s, ''x'')', _v2, pg_temp.revision_of(_v2)),
    'BESKT_NOT_PUBLISHER', 'B5.16 a roleless user cannot publish');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1',
    format('SELECT * FROM public.beskt_method_validate(%L, false)', _v2),
    'BESKT_NOT_AUTHORISED', 'B5.17 a roleless user cannot even read blocking reasons');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1',
    format('SELECT public.beskt_canonical_content(%L)', _v2),
    'permission denied', 'B5.18 the canonical content document is internal');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_method_content_hash(%L)', _v2),
    'permission denied', 'B5.18b the content hash function is internal even for an editor: a reader learns the hash from the read contract, never by probing ids');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000fa',
    format('SELECT public.beskt_method_content_hash(%L)', b.rec_v),
    'permission denied', 'B5.18c and for internal QA');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_record_event(%L, NULL, ''published'', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''{}'')', b.rec_pack),
    'permission denied', 'B5.19 the event writer is internal even for an editor');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_operation_begin(gen_random_uuid(), ''x'')'),
    'permission denied', 'B5.20 the operation helper is internal');

  -- Function security: every beskt_ function pins search_path; no beskt_
  -- function is executable by anon or PUBLIC; every trigger function is
  -- unreachable by authenticated; every definer RPC derives its actor from
  -- auth.uid() and checks it.
  FOR _fn IN SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc,
                    p.prorettype = 'pg_catalog.trigger'::regtype AS is_trigger
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE 'beskt\_%' ESCAPE '\' LOOP
    IF NOT EXISTS (SELECT 1 FROM unnest(_fn.proconfig) c WHERE c LIKE 'search_path=%') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B5.21 % has no pinned search_path', _fn.proname;
    END IF;
    IF has_function_privilege('anon', _fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B5.22 anon can execute %', _fn.proname;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.routine_privileges rp
                WHERE rp.specific_schema = 'public' AND rp.routine_name = _fn.proname AND rp.grantee = 'PUBLIC') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B5.22 PUBLIC can execute %', _fn.proname;
    END IF;
    IF _fn.is_trigger AND has_function_privilege('authenticated', _fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B5.23 trigger function % is executable by authenticated', _fn.proname;
    END IF;
    IF _fn.prosecdef AND NOT _fn.is_trigger AND _fn.proname IN ('beskt_create_method', 'beskt_create_method_version',
         'beskt_touch_draft', 'beskt_submit_for_review', 'beskt_record_review', 'beskt_publish_version',
         'beskt_suspend_version', 'beskt_retire_version')
       AND (position('auth.uid()' in _fn.prosrc) = 0 OR position('BESKT_NOT_AUTHENTICATED' in _fn.prosrc) = 0
            OR position('beskt_operation_begin' in _fn.prosrc) = 0 OR position('beskt_record_event' in _fn.prosrc) = 0) THEN
      RAISE EXCEPTION 'ASSERTION FAILED: B5.24 mutation % does not derive and check its actor, answer replays and write its event', _fn.proname;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok(true, 'B5.21 every BESKT function pins its search_path');
  PERFORM pg_temp.ok(true, 'B5.22 no BESKT function is executable by anon or PUBLIC');
  PERFORM pg_temp.ok(true, 'B5.23 no BESKT trigger function is executable by authenticated');
  PERFORM pg_temp.ok(true, 'B5.24 every client mutation derives its actor from auth.uid(), refuses anonymous callers, answers replays and writes its event');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'beskt\_%' ESCAPE '\'
        AND p.prosrc ~* '(user_metadata|raw_user_meta_data)') = 0,
    'B5.25 no BESKT function trusts user-editable JWT metadata');

  -- Append-only against everyone: the owner, the author, a BYPASSRLS role.
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_method_reviews SET rationale = ''rewritten'' WHERE method_version_id = %L', b.rec_v),
    'BESKT_REVIEW_APPEND_ONLY', 'B5.26 a review cannot be updated, even by the database owner');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.beskt_method_reviews WHERE method_version_id = %L', b.rec_v),
    'BESKT_REVIEW_APPEND_ONLY', 'B5.27 a review cannot be deleted');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_method_events SET reason = ''rewritten'' WHERE method_version_id = %L', b.rec_v),
    'BESKT_EVENT_APPEND_ONLY', 'B5.28 an event cannot be updated');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.beskt_method_events WHERE method_version_id = %L', b.rec_v),
    'BESKT_EVENT_APPEND_ONLY', 'B5.29 an event cannot be deleted');
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.must_fail(format('DELETE FROM public.beskt_method_reviews WHERE method_version_id = %L', b.rec_v),
    'BESKT_REVIEW_APPEND_ONLY', 'B5.30 append-only holds against a BYPASSRLS caller (trigger, not policy)');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_method_events SET metadata = ''{}'' WHERE method_version_id = %L', b.rec_v),
    'BESKT_EVENT_APPEND_ONLY', 'B5.31 so does the ledger');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_items SET wording_sv = ''x'' WHERE id = %L', b.rec_i1),
    'BESKT_PUBLISHED_IMMUTABLE', 'B5.32 and published-child immutability');
  RESET ROLE;
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relname IN ('beskt_method_reviews', 'beskt_method_events')
        AND (t.tgtype & 16) = 16 AND (t.tgtype & 8) = 8) = 2,
    'B5.33 the append-only triggers cover both UPDATE and DELETE');

  -- Index support for every RLS/ownership/scope column: every FK inside
  -- the domain and every actor column a policy or scope check reads
  -- (created_by, reviewer_id, actor_id). Lifecycle attribution (published_by,
  -- suspended_by, retired_by) is written once and never used as a scope.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_constraint con JOIN pg_class t ON t.oid = con.conrelid
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND t.relname LIKE 'beskt\_%' ESCAPE '\'
        AND a.attname NOT IN ('published_by', 'suspended_by', 'retired_by')
        AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = con.conrelid AND i.indkey[0] = con.conkey[1])) = 0,
    'B5.34 every scope, ownership and version foreign key in the domain leads an index');

  -- No candidate runtime data can exist in the domain.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name LIKE 'beskt\_%' ESCAPE '\'
        AND c.column_name ~* '(candidate|applicant|application|job_id|employer_id|case_id|session|assignment|response|answer_value|report)') = 0
    AND (SELECT count(*) FROM pg_constraint con JOIN pg_class t ON t.oid = con.conrelid JOIN pg_class r ON r.oid = con.confrelid
          WHERE con.contype = 'f' AND t.relname LIKE 'beskt\_%' ESCAPE '\'
            AND r.relname IN ('jobs', 'job_applications', 'scp_interview_cases', 'scp_interview_sessions', 'employers')) = 0,
    'B5.35 no BESKT table references a job, application, candidate, case, session or employer');
END $$;


-- The shared identity table: an editor keeps the Phase 1 direct DML on
-- role-interview packs and gains none on BESKT method identities.
DO $$
DECLARE b bk%ROWTYPE; _n integer; _role uuid; _pack uuid; _name text;
BEGIN
  SELECT * INTO b FROM bk;
  SELECT r.id INTO _role FROM public.scp_roles r WHERE r.slug = 'security-guard-se';
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    $q$INSERT INTO public.scp_interview_packs (slug, role_id, pack_kind, name_sv, purpose_sv)
       VALUES ('b5-direct-beskt', NULL, 'beskt_method', 'Direkt', 'Syfte')$q$,
    'row-level security', 'B5.36 an editor cannot mint a BESKT method identity by direct INSERT: the policy is scoped to role_interview');
  _name := (SELECT name_sv FROM public.scp_interview_packs WHERE id = b.rec_pack);
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  UPDATE public.scp_interview_packs SET name_sv = 'Omdöpt direkt' WHERE id = b.rec_pack;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0 AND (SELECT name_sv FROM public.scp_interview_packs WHERE id = b.rec_pack) = _name,
    'B5.37 an editor''s direct UPDATE of a BESKT method identity touches zero rows: the metadata is unchanged');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, purpose_sv)
  VALUES ('b5-direct-role-pack', _role, 'Direkt rollpaket', 'Syfte') RETURNING id INTO _pack;
  UPDATE public.scp_interview_packs SET name_sv = 'Direkt rollpaket 2' WHERE id = _pack;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 1 AND (SELECT pack_kind FROM public.scp_interview_packs WHERE id = _pack) = 'role_interview',
    'B5.38 the same editor still inserts and updates a role-interview pack directly, exactly as in Phase 1');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('UPDATE public.scp_interview_packs SET pack_kind = ''beskt_method'', role_id = NULL WHERE id = %L', _pack),
    'SCP_INTERVIEW_PACK_KIND_IMMUTABLE', 'B5.39 an editor cannot turn a role-interview pack into a BESKT method');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_packs SET name_sv = ''Omdöpt av ägaren'' WHERE id = %L', b.rec_pack),
    'BESKT_IDENTITY_IMMUTABLE', 'B5.40 a BESKT method''s metadata is immutable outside the BESKT contract, even for the database owner');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_packs SET slug = ''renamed-slug'' WHERE id = %L', b.rec_pack),
    'BESKT_IDENTITY_IMMUTABLE', 'B5.41 so is its slug');
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_packs SET purpose_sv = ''x'' WHERE id = %L', b.rec_pack),
    'BESKT_IDENTITY_IMMUTABLE', 'B5.42 and service_role is refused too (trigger, not policy)');
  RESET ROLE;
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'scp_interview_packs'
      AND p.policyname IN ('scp_interview_packs_editor_insert', 'scp_interview_packs_editor_update')
      AND coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%pack_kind = ''role_interview''%') = 2
    AND (SELECT with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_interview_packs'
          AND policyname = 'scp_interview_packs_editor_update') LIKE '%pack_kind = ''role_interview''%',
    'B5.43 both editor policies carry the role_interview scope, the UPDATE policy in USING and WITH CHECK');
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP B6 — gate-specific governance grants'; END $$;

DO $$
DECLARE b bk%ROWTYPE; _gv uuid; _r jsonb; _g uuid; _g2 uuid; _op uuid := gen_random_uuid(); _n integer; _h text; _rev integer; _cycle integer;
BEGIN
  SELECT * INTO b FROM bk;
  _gv := pg_temp.build_method('beskt-synthetic-grants', 'recruitment_support', 'b2000000-0000-4000-8000-0000000000e1', false);
  PERFORM pg_temp.submit(_gv);

  -- The mapping is server-owned and auditable.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_governance_grants g JOIN bk_grants k ON k.grant_id = g.id
      WHERE g.granted_by = 'b2000000-0000-4000-8000-0000000000ad' AND g.source_reference = 'synthetic test mandate'
        AND g.valid_from <= now() AND g.revoked_at IS NULL) = 7,
    'B6.1 every planted grant records who granted it, from when, and on what authority');
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.beskt_governance_grants', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.beskt_governance_grants', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.beskt_governance_grants', 'DELETE')
    AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'beskt_governance_grants' AND cmd <> 'SELECT') = 0
    AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.beskt_governance_grants'::regclass),
    'B6.2 no client role can write the mapping: ENABLE + FORCE RLS, no write privilege, no write policy');

  -- Allowed gate, wrong gate.
  _r := pg_temp.review(_gv, 'b2000000-0000-4000-8000-0000000000a1', 'personnel_security');
  PERFORM pg_temp.ok(_r ->> 'decision' = 'approved', 'B6.3 a reviewer approves the gate they hold');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a2',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''recruitment'', ''approved'', ''x'')', _gv, pg_temp.revision_of(_gv)),
    'BESKT_GATE_NOT_GRANTED', 'B6.4 the senior-HR holder cannot approve the recruitment gate');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a2',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''recruitment'', ''rejected'', ''x'')', _gv, pg_temp.revision_of(_gv)),
    'BESKT_GATE_NOT_GRANTED', 'B6.5 nor reject it: a rejection is a gate decision too');

  -- Revoked.
  SELECT grant_id INTO _g FROM bk_grants WHERE who = 'b2000000-0000-4000-8000-0000000000a3' AND kind = 'recruitment';
  _r := pg_temp.revoke_grant(_g);
  PERFORM pg_temp.ok(
    (SELECT revoked_by = 'b2000000-0000-4000-8000-0000000000ad' AND revoke_reason = 'Återkallad för test.' AND revoked_at IS NOT NULL
       FROM public.beskt_governance_grants WHERE id = _g),
    'B6.6 a revocation records who, when and why, and leaves the grant as history');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a3',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''recruitment'', ''approved'', ''x'')', _gv, pg_temp.revision_of(_gv)),
    'BESKT_GATE_NOT_GRANTED', 'B6.7 a revoked grant opens no gate');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.beskt_revoke_governance(gen_random_uuid(), %L, ''igen'')', _g),
    'BESKT_GRANT_ALREADY_REVOKED', 'B6.8 a grant is revoked once');
  _g2 := pg_temp.grant_kind('b2000000-0000-4000-8000-0000000000a3', 'recruitment');
  _r := pg_temp.review(_gv, 'b2000000-0000-4000-8000-0000000000a3', 'recruitment');
  PERFORM pg_temp.ok(_r ->> 'decision' = 'approved' AND _g2 <> _g,
    'B6.9 a fresh grant is a new row with its own provenance, and reopens the gate');

  -- Expired and not-yet-valid grants, planted directly as the owner.
  INSERT INTO public.scp_content_roles (user_id, role) VALUES ('b2000000-0000-4000-8000-0000000000e2', 'reviewer') ON CONFLICT DO NOTHING;
  INSERT INTO public.beskt_governance_grants (user_id, grant_kind, granted_by, valid_from, valid_until, source_reference)
  VALUES ('b2000000-0000-4000-8000-0000000000e2', 'senior_hr', 'b2000000-0000-4000-8000-0000000000ad', now() - interval '2 days', now() - interval '1 day', 'expired synthetic mandate');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e2',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', _gv, pg_temp.revision_of(_gv)),
    'BESKT_GATE_NOT_GRANTED', 'B6.10 an expired grant opens no gate');
  INSERT INTO public.beskt_governance_grants (user_id, grant_kind, granted_by, valid_from, source_reference)
  VALUES ('b2000000-0000-4000-8000-0000000000e2', 'senior_hr', 'b2000000-0000-4000-8000-0000000000ad', now() + interval '1 day', 'future synthetic mandate');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e2',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', _gv, pg_temp.revision_of(_gv)),
    'BESKT_GATE_NOT_GRANTED', 'B6.11 a grant that is not yet valid opens no gate');
  PERFORM pg_temp.must_fail(
    $q$INSERT INTO public.beskt_governance_grants (user_id, grant_kind, granted_by, valid_from, valid_until, source_reference)
       VALUES ('b2000000-0000-4000-8000-0000000000e2', 'senior_hr', NULL, now(), now() - interval '1 second', 'x')$q$,
    'beskt_governance_grants_validity_check', 'B6.12 a validity window cannot end before it starts');
  DELETE FROM public.scp_content_roles WHERE user_id = 'b2000000-0000-4000-8000-0000000000e2' AND role = 'reviewer';

  -- Self-review with a grant, and the internal-QA grant is not a gate.
  _g := pg_temp.grant_kind('b2000000-0000-4000-8000-0000000000e1', 'senior_hr');
  INSERT INTO public.scp_content_roles (user_id, role) VALUES ('b2000000-0000-4000-8000-0000000000e1', 'reviewer') ON CONFLICT DO NOTHING;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', _gv, pg_temp.revision_of(_gv)),
    'BESKT_SELF_REVIEW', 'B6.13 a granted gate never lets the author review their own method');
  DELETE FROM public.scp_content_roles WHERE user_id = 'b2000000-0000-4000-8000-0000000000e1' AND role = 'reviewer';
  PERFORM pg_temp.revoke_grant(_g);
  INSERT INTO public.scp_content_roles (user_id, role) VALUES ('b2000000-0000-4000-8000-0000000000fa', 'reviewer') ON CONFLICT DO NOTHING;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000fa',
    format('SELECT public.beskt_record_review(gen_random_uuid(), %L, %s, ''senior_hr'', ''approved'', ''x'')', _gv, pg_temp.revision_of(_gv)),
    'BESKT_GATE_NOT_GRANTED', 'B6.14 the internal-QA grant is a read grant, never a review gate');
  DELETE FROM public.scp_content_roles WHERE user_id = 'b2000000-0000-4000-8000-0000000000fa' AND role = 'reviewer';

  -- A service-role writer cannot record a gate nobody granted: the check is
  -- in the trigger as well as the RPC.
  SELECT content_hash, revision, review_cycle INTO _h, _rev, _cycle FROM public.beskt_method_versions WHERE id = _gv;
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_method_reviews (method_version_id, gate, decision, reviewer_id, rationale, content_hash_at_review, revision_at_review, review_cycle_at_review)
             VALUES (%L, 'recruitment', 'approved', 'b2000000-0000-4000-8000-0000000000a2', 'x', %L, %s, %s)$q$, _gv, _h, _rev, _cycle),
    'BESKT_GATE_NOT_GRANTED', 'B6.15 service_role cannot insert an approval for a gate the reviewer does not hold');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_method_reviews (method_version_id, gate, decision, reviewer_id, rationale, content_hash_at_review, revision_at_review, review_cycle_at_review)
             VALUES (%L, 'senior_hr', 'approved', 'b2000000-0000-4000-8000-0000000000f1', 'x', %L, %s, %s)$q$, _gv, _h, _rev, _cycle),
    'BESKT_GATE_NOT_GRANTED', 'B6.16 nor for a user who holds nothing at all');
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.beskt_method_reviews (method_version_id, gate, decision, reviewer_id, rationale, content_hash_at_review, revision_at_review, review_cycle_at_review)
             VALUES (%L, 'senior_hr', 'approved', 'b2000000-0000-4000-8000-0000000000a2', 'x', %L, %s, %s)$q$, _gv, _h, _rev, _cycle - 1),
    'BESKT_REVIEW_HASH_MISMATCH', 'B6.17 nor an approval bound to an earlier review cycle');
  PERFORM pg_temp.must_fail(
    'SELECT public.beskt_grant_governance(gen_random_uuid(), ''b2000000-0000-4000-8000-0000000000f1'', ''senior_hr'', ''x'')',
    'BESKT_NOT_AUTHENTICATED', 'B6.18 service_role without a signed-in platform admin cannot grant');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_governance_grants SET grant_kind = ''senior_hr'' WHERE id = %L', _g2),
    'BESKT_GRANT_APPEND_ONLY', 'B6.19 service_role cannot rewrite a grant');
  RESET ROLE;

  -- Only a platform admin grants or revokes.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    'SELECT public.beskt_grant_governance(gen_random_uuid(), ''b2000000-0000-4000-8000-0000000000e1'', ''senior_hr'', ''x'')',
    'BESKT_NOT_PLATFORM_ADMIN', 'B6.20 an editor cannot grant themselves a gate');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1',
    'SELECT public.beskt_grant_governance(gen_random_uuid(), ''b2000000-0000-4000-8000-0000000000a1'', ''senior_hr'', ''x'')',
    'BESKT_NOT_PLATFORM_ADMIN', 'B6.21 nor can a reviewer');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1',
    format('SELECT public.beskt_revoke_governance(gen_random_uuid(), %L, ''x'')', _g2),
    'BESKT_NOT_PLATFORM_ADMIN', 'B6.22 nor revoke');
  PERFORM pg_temp.must_fail_as('anon', NULL,
    'SELECT public.beskt_grant_governance(gen_random_uuid(), ''b2000000-0000-4000-8000-0000000000a1'', ''senior_hr'', ''x'')',
    'permission denied', 'B6.23 anon cannot execute the grant RPC');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    'SELECT public.beskt_grant_governance(gen_random_uuid(), ''b2000000-0000-4000-8000-0000000000a1'', ''product'', ''x'')',
    'BESKT_UNKNOWN_GATE', 'B6.24 the grant vocabulary is exactly the five gates and internal_qa');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    'SELECT public.beskt_grant_governance(gen_random_uuid(), ''b2000000-0000-4000-8000-0000000000a1'', ''senior_hr'', ''  '')',
    'BESKT_PROVENANCE_REQUIRED', 'B6.25 a grant without provenance is refused');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    'SELECT public.beskt_grant_governance(gen_random_uuid(), ''00000000-0000-4000-8000-000000000000'', ''senior_hr'', ''x'')',
    'BESKT_USER_NOT_FOUND', 'B6.26 a grant names an existing user');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.beskt_revoke_governance(gen_random_uuid(), %L, ''  '')', _g2),
    'BESKT_REASON_REQUIRED', 'B6.27 a revocation carries a written reason');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    'SELECT public.beskt_revoke_governance(gen_random_uuid(), ''00000000-0000-4000-8000-000000000000'', ''x'')',
    'BESKT_GRANT_NOT_FOUND', 'B6.28 a revocation names an existing grant');

  -- Append-only against the owner.
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_governance_grants SET user_id = ''b2000000-0000-4000-8000-0000000000f1'' WHERE id = %L', _g2),
    'BESKT_GRANT_APPEND_ONLY', 'B6.29 a grant cannot be re-assigned, even by the database owner');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.beskt_governance_grants WHERE id = %L', _g2),
    'BESKT_GRANT_APPEND_ONLY', 'B6.30 a grant is never deleted');
  PERFORM pg_temp.must_fail(format('UPDATE public.beskt_governance_grants SET revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL WHERE id = %L',
      (SELECT grant_id FROM bk_grants WHERE who = 'b2000000-0000-4000-8000-0000000000a3')),
    'BESKT_GRANT_APPEND_ONLY', 'B6.31 a revocation is never undone');

  -- Idempotent grants: replay answers with the same grant, one row.
  SELECT count(*) INTO _n FROM public.beskt_governance_grants;
  _g := pg_temp.grant_kind('b2000000-0000-4000-8000-0000000000f1', 'senior_hr', NULL, _op);
  PERFORM pg_temp.ok(pg_temp.grant_kind('b2000000-0000-4000-8000-0000000000f1', 'senior_hr', NULL, _op) = _g
    AND (SELECT count(*) FROM public.beskt_governance_grants) = _n + 1,
    'B6.32 replaying a grant operation returns the original grant and writes nothing');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.beskt_grant_governance(%L, ''b2000000-0000-4000-8000-0000000000f1'', ''recruitment'', ''synthetic test mandate'')', _op),
    'BESKT_OPERATION_PAYLOAD_MISMATCH', 'B6.33 the same operation id with another gate is refused');
  _op := gen_random_uuid();
  _r := pg_temp.revoke_grant(_g, _op);
  PERFORM pg_temp.ok(pg_temp.revoke_grant(_g, _op) ->> 'grant_id' = _g::text
    AND (SELECT revoke_operation_id FROM public.beskt_governance_grants WHERE id = _g) = _op,
    'B6.34 replaying a revocation answers with the receipt');

  -- Reads follow the grant: revoking internal QA closes the read contract.
  PERFORM pg_temp.revoke_grant((SELECT grant_id FROM bk_grants WHERE who = 'b2000000-0000-4000-8000-0000000000fa'));
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000fa',
    format('SELECT public.beskt_published_method(%L)', b.rec_v),
    'BESKT_NOT_AUTHORISED', 'B6.35 a revoked internal-QA grant reads nothing any more');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000fa');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_readable_published_versions();
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B6.36 and lists nothing');

  -- Grants are readable by governance only.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000a1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_governance_grants;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n > 0, 'B6.37 a governance reader can audit the mapping');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_governance_grants;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'B6.38 an employer member sees no grant');
  PERFORM pg_temp.must_fail_as('anon', NULL, 'SELECT count(*) FROM public.beskt_governance_grants', 'permission denied', 'B6.39 anon cannot read the mapping');
END $$;

\echo '    BESKT governed-content assertions passed'
ROLLBACK;
