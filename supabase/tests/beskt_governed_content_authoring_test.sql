-- BESKT PR 7 -- the governed content-authoring suite.
--
-- The question this answers is not "do the functions exist". It is: can a real
-- human holding the platform content editor role, acting through the browser
-- role and nothing else, author a COMPLETE BESKT method and submit it to the
-- five gates -- without service_role, without the table owner, and without a
-- migration?
--
-- Block A1 answers it by doing it. Everything after A1 proves that the doors
-- opened to make it possible did not become a way around the law.
--
-- One transaction, rolled back at the end: this suite seeds nothing.

BEGIN;

\i supabase/tests/beskt_governed_content_fixture.sql

-- ---------------------------------------------------------------------------
-- Helpers. Every door is called AS THE EDITOR, through the authenticated
-- role, exactly as a browser would reach it -- never as the owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.aut(_fn text, _v uuid, _rev integer, _payload jsonb,
                                       _who uuid DEFAULT 'b2000000-0000-4000-8000-0000000000e1')
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become(_who);
  SET LOCAL ROLE authenticated;
  EXECUTE format('SELECT public.%I($1, $2, $3, $4)', _fn)
    INTO _r USING gen_random_uuid(), _v, _rev, _payload;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN (_r ->> 'revision')::integer;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.del(_v uuid, _rev integer, _family text, _key text,
                                       _who uuid DEFAULT 'b2000000-0000-4000-8000-0000000000e1')
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become(_who);
  SET LOCAL ROLE authenticated;
  SELECT public.beskt_delete_content(gen_random_uuid(), _v, _rev, _family, _key) INTO _r;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN (_r ->> 'revision')::integer;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.rev_of(_v uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT revision FROM public.beskt_method_versions WHERE id = _v;
$$;

-- The validator is itself gated on a platform content role, so it is read as
-- the editor -- which is also how the authoring screen would reach it.
CREATE OR REPLACE FUNCTION pg_temp.codes_as(_v uuid,
    _who uuid DEFAULT 'b2000000-0000-4000-8000-0000000000e1')
RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE _c text[];
BEGIN
  PERFORM pg_temp.become(_who);
  SET LOCAL ROLE authenticated;
  SELECT array_agg(code) INTO _c FROM public.beskt_method_validate(_v, false);
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN coalesce(_c, '{}'::text[]);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.blocking_as(_v uuid,
    _who uuid DEFAULT 'b2000000-0000-4000-8000-0000000000e1')
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.become(_who);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.beskt_method_validate(_v, false) WHERE severity = 'blocking';
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _n;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

CREATE TEMP TABLE au (v uuid, pack uuid, rev integer, hash_before text, n bigint) ON COMMIT DROP;
INSERT INTO au DEFAULT VALUES;
GRANT ALL ON au TO authenticated;

-- ===========================================================================
-- A1 -- A COMPLETE METHOD, AUTHORED THROUGH THE DOORS AND NOTHING ELSE.
-- ===========================================================================
DO $a1$
DECLARE
  _r jsonb; _pack uuid; _v uuid; _rev integer; _st text; _fk text; _k integer;
  _blocking integer;
BEGIN
  -- Identity and version, through the EXISTING lifecycle RPCs.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_create_method(gen_random_uuid(), 'authoring-synthetic',
          'SYNTETISK BESKT-metod byggd via dörrarna',
          'Syntetiskt testinnehåll för PR 7. Inte en produktmetod.',
          'SYNTHETIC BESKT method built through the doors');
  _pack := (_r ->> 'pack_id')::uuid;
  _r := public.beskt_create_method_version(gen_random_uuid(), _pack, 'recruitment_support',
          'synthetic-authoring', 'test-1', 'cqrity_design_hypothesis',
          'Syntetisk sammanfattning', 'Synthetic summary');
  _v := (_r ->> 'method_version_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();
  _rev := pg_temp.rev_of(_v);

  -- ---- exposure profile ---------------------------------------------------
  _rev := pg_temp.aut('beskt_author_exposure_profile', _v, _rev, jsonb_build_object(
    'profile_key', 'lone_working', 'display_order', 1, 'exposure_area', 'lone_working',
    'duties_sv', 'Ensamarbete nattetid.', 'duties_en', 'Lone working at night.',
    'role_relevance_rationale_sv', 'Rollen innebär ensamarbete.',
    'role_relevance_rationale_en', 'The role involves lone working.',
    'permitted_mode', 'recruitment_support', 'owning_review_role', 'recruitment',
    'jurisdiction_reference', 'SE', 'lawful_basis_reference', 'GDPR art. 6(1)(b) synthetic',
    'retention_class', 'recruitment_record', 'access_class', 'recruiter',
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring'));

  -- ---- sections -----------------------------------------------------------
  _rev := pg_temp.aut('beskt_author_section', _v, _rev, jsonb_build_object(
    'section_key', 'preparation', 'display_order', 1, 'phase', 'candidate_preparation',
    'title_sv', 'Förberedelse', 'title_en', 'Preparation'));
  _rev := pg_temp.aut('beskt_author_section', _v, _rev, jsonb_build_object(
    'section_key', 'interview_topics', 'display_order', 2, 'phase', 'interview',
    'title_sv', 'Intervjuämnen', 'title_en', 'Interview topics'));

  -- ---- items, with their options travelling with them ---------------------
  _rev := pg_temp.aut('beskt_author_item', _v, _rev, jsonb_build_object(
    'item_key', 'lone_working_experience', 'section_key', 'preparation', 'profile_key', 'lone_working',
    'display_order', 1, 'wording_sv', 'Har du erfarenhet av ensamarbete?',
    'wording_en', 'Do you have experience of lone working?',
    'purpose_sv', 'Rollen innebär ensamarbete.', 'purpose_en', 'The role involves lone working.',
    'permitted_mode', 'recruitment_support', 'phase', 'candidate_preparation',
    'answer_type', 'single_choice', 'requiredness', 'required', 'discuss_orally_allowed', true,
    'sensitivity_class', 'ordinary', 'access_class', 'recruiter',
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring',
    'prohibited_inferences', jsonb_build_array('suitability_inference'),
    'options', jsonb_build_array(
      jsonb_build_object('option_key', 'yes', 'display_order', 1, 'label_sv', 'Ja', 'label_en', 'Yes'),
      jsonb_build_object('option_key', 'no', 'display_order', 2, 'label_sv', 'Nej', 'label_en', 'No'))));

  _rev := pg_temp.aut('beskt_author_item', _v, _rev, jsonb_build_object(
    'item_key', 'lone_working_example', 'section_key', 'preparation', 'profile_key', 'lone_working',
    'display_order', 2, 'wording_sv', 'Beskriv en situation.', 'wording_en', 'Describe a situation.',
    'purpose_sv', 'Konkreta exempel ger underlag.', 'purpose_en', 'Concrete examples give a basis.',
    'permitted_mode', 'recruitment_support', 'phase', 'candidate_preparation',
    'answer_type', 'long_text', 'requiredness', 'voluntary', 'discuss_orally_allowed', true,
    'sensitivity_class', 'ordinary', 'access_class', 'recruiter',
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring',
    'prohibited_inferences', jsonb_build_array('suitability_inference', 'credibility_or_deception_inference')));

  _rev := pg_temp.aut('beskt_author_item', _v, _rev, jsonb_build_object(
    'item_key', 'reported_incident', 'section_key', 'preparation', 'profile_key', 'lone_working',
    'display_order', 3, 'wording_sv', 'Har du rapporterat en avvikelse?',
    'wording_en', 'Have you reported an incident?',
    'purpose_sv', 'Rapportering ingår i rollen.', 'purpose_en', 'Reporting is part of the role.',
    'permitted_mode', 'recruitment_support', 'phase', 'candidate_preparation',
    'answer_type', 'boolean', 'requiredness', 'required', 'discuss_orally_allowed', true,
    'sensitivity_class', 'ordinary', 'access_class', 'recruiter',
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring',
    'prohibited_inferences', jsonb_build_array('suitability_inference')));

  _rev := pg_temp.aut('beskt_author_item', _v, _rev, jsonb_build_object(
    'item_key', 'incident_context', 'section_key', 'preparation', 'profile_key', 'lone_working',
    'display_order', 4, 'wording_sv', 'Beskriv sammanhanget.', 'wording_en', 'Describe the context.',
    'purpose_sv', 'Sammanhang behövs för underlaget.', 'purpose_en', 'Context is needed for the basis.',
    'permitted_mode', 'recruitment_support', 'phase', 'candidate_preparation',
    'answer_type', 'short_text', 'requiredness', 'voluntary', 'discuss_orally_allowed', true,
    'sensitivity_class', 'ordinary', 'access_class', 'recruiter',
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring',
    'prohibited_inferences', jsonb_build_array('suitability_inference')));

  _rev := pg_temp.aut('beskt_author_item', _v, _rev, jsonb_build_object(
    'item_key', 'information_acknowledged', 'section_key', 'preparation', 'profile_key', 'lone_working',
    'display_order', 5, 'wording_sv', 'Jag har tagit del av informationen.',
    'wording_en', 'I have read the information.',
    'purpose_sv', 'Kandidaten ska ha fått informationen.',
    'purpose_en', 'The candidate must have received the information.',
    'permitted_mode', 'recruitment_support', 'phase', 'candidate_preparation',
    'answer_type', 'acknowledgement', 'requiredness', 'required', 'discuss_orally_allowed', false,
    'sensitivity_class', 'ordinary', 'access_class', 'recruiter',
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring',
    'prohibited_inferences', jsonb_build_array('suitability_inference')));

  _rev := pg_temp.aut('beskt_author_item', _v, _rev, jsonb_build_object(
    'item_key', 'interview_topic_lone_working', 'section_key', 'interview_topics', 'profile_key', 'lone_working',
    'display_order', 1, 'wording_sv', 'Ensamarbete i praktiken.', 'wording_en', 'Lone working in practice.',
    'purpose_sv', 'Intervjuämne från rollrelevans.', 'purpose_en', 'Interview topic from role relevance.',
    'permitted_mode', 'recruitment_support', 'phase', 'interview',
    'answer_type', 'long_text', 'requiredness', 'voluntary', 'discuss_orally_allowed', true,
    'sensitivity_class', 'ordinary', 'access_class', 'beskt_interviewer',
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring',
    'prohibited_inferences', jsonb_build_array('suitability_inference')));

  UPDATE au SET v = _v, pack = _pack, rev = _rev;
END $a1$;

-- The fifteen required prompt kinds, the templated Evaluation step, the two
-- routing rules, the seven anchors and the ten observation fields -- all
-- through the doors.
DO $a1b$
DECLARE
  _v uuid; _rev integer; _st text; _fk text; _k integer; _p jsonb;
BEGIN
  SELECT v, rev INTO _v, _rev FROM au;

  FOR _p IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('prompt_key','p1_planning','display_order',1,'prompt_kind','planning_from_role_relevance','peace_stage','planning','addressee','interviewer','question_form','information_notice','wording_sv','Planera utifrån dokumenterad rollrelevans.','wording_en','Plan from documented role relevance.'),
    jsonb_build_object('prompt_key','p1_purpose','display_order',2,'prompt_kind','purpose_explanation','peace_stage','engage_explain','addressee','candidate','question_form','information_notice','wording_sv','Syftet med samtalet är att förstå din erfarenhet.','wording_en','The purpose of this conversation is to understand your experience.'),
    jsonb_build_object('prompt_key','p1_process','display_order',3,'prompt_kind','process_explanation','peace_stage','engage_explain','addressee','candidate','question_form','information_notice','wording_sv','Så här går samtalet till.','wording_en','This is how the conversation proceeds.'),
    jsonb_build_object('prompt_key','p1_voluntary','display_order',4,'prompt_kind','voluntariness_notice','peace_stage','engage_explain','addressee','candidate','question_form','information_notice','wording_sv','Du väljer själv vad du vill berätta.','wording_en','You choose what you want to tell.'),
    jsonb_build_object('prompt_key','p1_human','display_order',5,'prompt_kind','human_decision_notice','peace_stage','engage_explain','addressee','candidate','question_form','information_notice','wording_sv','Beslut fattas av arbetsgivaren, inte av systemet.','wording_en','Decisions are made by the employer, not by the system.'),
    jsonb_build_object('prompt_key','p1_open','display_order',6,'prompt_kind','open_invitation','peace_stage','account','addressee','candidate','question_form','open_question','wording_sv','Berätta om ditt arbete med ensamarbete.','wording_en','Tell me about your work with lone working.'),
    jsonb_build_object('prompt_key','p1_free','display_order',7,'prompt_kind','free_account','peace_stage','account','addressee','candidate','question_form','free_recall','wording_sv','Beskriv fritt hur en typisk natt såg ut.','wording_en','Describe freely what a typical night looked like.'),
    jsonb_build_object('prompt_key','p1_example','display_order',8,'prompt_kind','behavioural_example','peace_stage','account','addressee','candidate','question_form','cued_recall','item_key','lone_working_example','permitted_probe_bases',jsonb_build_array('submitted_answer'),'wording_sv','Ge ett konkret exempel på en situation du hanterade.','wording_en','Give a concrete example of a situation you handled.'),
    jsonb_build_object('prompt_key','p1_listen','display_order',9,'prompt_kind','listening_reflection','peace_stage','account','addressee','candidate','question_form','reflective_readback','wording_sv','Om jag förstår dig rätt så gjorde du så här.','wording_en','If I understand you correctly, this is what you did.'),
    jsonb_build_object('prompt_key','p1_probe','display_order',10,'prompt_kind','specific_probe','peace_stage','account','addressee','candidate','question_form','neutral_clarification','item_key','lone_working_example','permitted_probe_bases',jsonb_build_array('submitted_answer'),'wording_sv','Vad gjorde du först i den situationen?','wording_en','What did you do first in that situation?'),
    jsonb_build_object('prompt_key','p1_context','display_order',11,'prompt_kind','context_opportunity','peace_stage','account','addressee','candidate','question_form','open_question','wording_sv','Finns det något i sammanhanget du vill lägga till?','wording_en','Is there anything about the context you want to add?'),
    jsonb_build_object('prompt_key','p1_correct','display_order',12,'prompt_kind','correction_opportunity','peace_stage','account','addressee','candidate','question_form','open_question','wording_sv','Vill du rätta något av det du skrev?','wording_en','Would you like to correct anything you wrote?'),
    jsonb_build_object('prompt_key','p1_difference','display_order',13,'prompt_kind','neutral_difference_exploration','peace_stage','account','addressee','candidate','question_form','neutral_clarification','permitted_probe_bases',jsonb_build_array('submitted_answer','candidate_correction'),'wording_sv','Här finns två olika uppgifter; hur hänger de ihop?','wording_en','There are two different statements here; how do they fit together?'),
    jsonb_build_object('prompt_key','p1_summary','display_order',14,'prompt_kind','summary_confirmation','peace_stage','account','addressee','candidate','question_form','summary_readback','wording_sv','Har jag uppfattat dig rätt?','wording_en','Have I understood you correctly?'),
    jsonb_build_object('prompt_key','p1_closure','display_order',15,'prompt_kind','closure_next_step','peace_stage','closure','addressee','candidate','question_form','information_notice','wording_sv','Nästa steg är att arbetsgivaren återkommer.','wording_en','The next step is that the employer will get back to you.')
  )) LOOP
    _rev := pg_temp.aut('beskt_author_prompt', _v, _rev,
      _p || jsonb_build_object('profile_key', 'lone_working', 'permitted_mode', 'recruitment_support',
                               'content_provenance', 'cqrity_design_hypothesis',
                               'source_reference', 'synthetic-authoring'));
  END LOOP;

  -- The PEACE Evaluation step. Its wording is the governed template, not
  -- authored text -- the child guard refuses anything else, and the editor
  -- must therefore send exactly the template through the door.
  _rev := pg_temp.aut('beskt_author_prompt', _v, _rev, jsonb_build_object(
    'prompt_key', 'p1_evaluation', 'profile_key', 'lone_working', 'display_order', 16,
    'prompt_kind', 'interviewer_self_review', 'peace_stage', 'evaluation',
    'addressee', 'interviewer', 'question_form', 'reflective_readback',
    'permitted_mode', 'recruitment_support', 'evaluation_template_key', 'method_adherence',
    'wording_sv', public.beskt_evaluation_template('method_adherence', 'sv'),
    'wording_en', public.beskt_evaluation_template('method_adherence', 'en'),
    'content_provenance', 'cqrity_design_hypothesis', 'source_reference', 'synthetic-authoring'));

  -- ---- routing, by key ----------------------------------------------------
  _rev := pg_temp.aut('beskt_author_routing_rule', _v, _rev, jsonb_build_object(
    'rule_key', 'show_example_when_experienced', 'evaluation_order', 1,
    'applies_mode', 'recruitment_support', 'source_item_key', 'lone_working_experience',
    'condition_kind', 'option_selected', 'condition_option_key', 'yes',
    'action', 'show', 'target_item_key', 'lone_working_example'));
  _rev := pg_temp.aut('beskt_author_routing_rule', _v, _rev, jsonb_build_object(
    'rule_key', 'show_context_when_reported', 'evaluation_order', 2,
    'applies_mode', 'recruitment_support', 'source_item_key', 'reported_incident',
    'condition_kind', 'boolean_equals', 'condition_boolean', true,
    'action', 'show', 'target_item_key', 'incident_context'));

  -- ---- the seven evidence anchors ----------------------------------------
  FOREACH _st IN ARRAY ARRAY['unaddressed', 'clarification_needed', 'sufficiently_clarified',
      'external_verification_needed', 'conflicting_information', 'insufficient_basis', 'not_applicable'] LOOP
    _rev := pg_temp.aut('beskt_author_evidence_anchor', _v, _rev, jsonb_build_object(
      'evidence_state', _st,
      'definition_sv', 'Definition (sv) ' || _st, 'definition_en', 'Definition (en) ' || _st,
      'inclusion_criteria_sv', 'Ingår när underlaget ' || _st,
      'inclusion_criteria_en', 'Included when the basis is ' || _st,
      'exclusion_criteria_sv', 'Ingår inte när underlaget är annat.',
      'exclusion_criteria_en', 'Excluded when the basis is otherwise.',
      'supporting_evidence_examples_sv', 'Exempel på stödjande underlag.',
      'supporting_evidence_examples_en', 'Examples of supporting basis.',
      'counter_evidence_and_protective_factors_sv', 'Motbevis och skyddande faktorer beaktas.',
      'counter_evidence_and_protective_factors_en', 'Counter-evidence and protective factors are considered.',
      'prohibited_inferences', CASE _st
        WHEN 'unaddressed' THEN jsonb_build_array('omission_as_negative_evidence', 'suitability_inference')
        WHEN 'conflicting_information' THEN jsonb_build_array('inconsistency_as_dishonesty', 'credibility_or_deception_inference')
        ELSE jsonb_build_array('suitability_inference') END,
      'required_next_action', CASE _st
        WHEN 'unaddressed' THEN 'clarify_with_candidate'
        WHEN 'clarification_needed' THEN 'clarify_with_candidate'
        WHEN 'sufficiently_clarified' THEN 'none'
        WHEN 'external_verification_needed' THEN 'external_verification'
        WHEN 'conflicting_information' THEN 'offer_candidate_correction'
        WHEN 'insufficient_basis' THEN 'record_insufficient_basis'
        ELSE 'none' END));
  END LOOP;

  -- ---- the ten observation-field definitions ------------------------------
  _k := 0;
  FOREACH _fk IN ARRAY ARRAY['fact', 'source_provenance', 'role_exposure_link',
      'interviewer_interpretation', 'candidate_explanation', 'counter_evidence',
      'protective_factor', 'verification_need', 'candidate_correction',
      'sensitivity_access_class'] LOOP
    _k := _k + 1;
    _rev := pg_temp.aut('beskt_author_observation_field', _v, _rev, jsonb_build_object(
      'field_key', _fk, 'ordinal', _k,
      'recorded_by', CASE WHEN _fk IN ('candidate_explanation', 'candidate_correction') THEN 'candidate'
                          WHEN _fk = 'sensitivity_access_class' THEN 'system' ELSE 'interviewer' END,
      'is_judgement', _fk = 'interviewer_interpretation',
      'label_sv', 'Etikett ' || _fk, 'label_en', 'Label ' || _fk,
      'definition_sv', 'Definition ' || _fk, 'definition_en', 'Definition ' || _fk));
  END LOOP;

  UPDATE au SET rev = _rev;
END $a1b$;

-- ---- and now the claim itself ---------------------------------------------
DO $a1c$
DECLARE _v uuid; _rev integer; _n integer; _r jsonb; _owner_writes integer;
BEGIN
  SELECT v, rev INTO _v, _rev FROM au;

  _n := pg_temp.blocking_as(_v);
  PERFORM pg_temp.ok(_n = 0,
    format('A1.1 a method authored ENTIRELY through the doors validates with zero blocking issues (got %s)', _n));

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_items WHERE method_version_id = _v) = 6,
    'A1.2 six items exist, written by an editor through the authenticated role');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_item_options o JOIN public.beskt_items i ON i.id = o.item_id
      WHERE i.method_version_id = _v) = 2,
    'A1.3 the choice item carries the two options that travelled with it');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_prompts WHERE method_version_id = _v) = 16,
    'A1.4 all sixteen prompts exist, the templated Evaluation step included');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_routing_rules WHERE method_version_id = _v) = 2,
    'A1.5 both routing rules exist, resolved from item and option KEYS');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_evidence_anchors WHERE method_version_id = _v) = 7
    AND (SELECT count(*) FROM public.beskt_observation_fields WHERE method_version_id = _v) = 10,
    'A1.6 the seven evidence anchors and ten observation fields exist');

  -- The stored hash names the stored bytes, without anybody calling touch.
  PERFORM pg_temp.ok(
    (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v)
      = public.beskt_method_content_hash(_v),
    'A1.7 the stored content hash names exactly what was authored, recomputed by every door');

  -- THE acceptance test: it can be submitted to the five human gates.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_submit_for_review(gen_random_uuid(), _v, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_r ->> 'content_status' = 'in_review',
    'A1.8 and it SUBMITS to the five gates -- a complete method authored with no service_role, no owner and no migration');

  UPDATE au SET rev = (_r ->> 'revision')::integer;
END $a1c$;

-- ===========================================================================
-- A1d -- The activation-requirement door, where it actually matters.
--
-- The three PR 1 activation requirements only bind a security-vetting method,
-- so proving that door on the recruitment-support version above would prove
-- nothing. A second method is opened in security_vetting_support mode and the
-- three requirements are authored through the door; the validator's three
-- SV blockers must clear as a result -- and authoring a REQUIREMENT must not
-- satisfy anything, which is the distinction the domain rests on.
-- ===========================================================================
DO $a1d$
DECLARE _r jsonb; _pack uuid; _v uuid; _rev integer; _codes text[];
BEGIN
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_create_method(gen_random_uuid(), 'authoring-sv-synthetic',
          'SYNTETISK BESKT-metod för säkerhetsprövningsstöd',
          'Syntetiskt testinnehåll för PR 7. Inte en produktmetod.',
          'SYNTHETIC BESKT security-vetting method');
  _pack := (_r ->> 'pack_id')::uuid;
  _r := public.beskt_create_method_version(gen_random_uuid(), _pack, 'security_vetting_support',
          'synthetic-authoring', 'sv-1', 'cqrity_design_hypothesis',
          'Syntetisk sammanfattning', 'Synthetic summary');
  _v := (_r ->> 'method_version_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();
  _rev := pg_temp.rev_of(_v);

  _codes := pg_temp.codes_as(_v);
  PERFORM pg_temp.ok(
    _codes @> ARRAY['SV_LAWFUL_BASIS_NOT_RECORDED', 'SV_AUTHORISED_SECURITY_OWNER_NOT_ASSIGNED'],
    'A1d.1 a fresh security-vetting version is blocked on its activation requirements');

  _rev := pg_temp.aut('beskt_author_activation_requirement', _v, _rev, jsonb_build_object(
    'requirement_key', 'security_sensitive_role_attested',
    'satisfied_by_role', 'accountable_process_owner',
    'statement_sv', 'Arbetsgivaren ska ha intygat att rollen är säkerhetskänslig.',
    'statement_en', 'The employer must have attested that the role is security sensitive.'));
  _rev := pg_temp.aut('beskt_author_activation_requirement', _v, _rev, jsonb_build_object(
    'requirement_key', 'lawful_basis_recorded',
    'satisfied_by_role', 'accountable_process_owner',
    'statement_sv', 'Rättslig grund ska vara dokumenterad före aktivering.',
    'statement_en', 'A lawful basis must be recorded before activation.'));
  _rev := pg_temp.aut('beskt_author_activation_requirement', _v, _rev, jsonb_build_object(
    'requirement_key', 'authorised_security_owner_assigned',
    'satisfied_by_role', 'authorised_security_function',
    'statement_sv', 'En behörig säkerhetsfunktion ska vara utsedd.',
    'statement_en', 'An authorised security function must be appointed.'));

  _codes := pg_temp.codes_as(_v);
  PERFORM pg_temp.ok(
    NOT (_codes @> ARRAY['SV_LAWFUL_BASIS_NOT_RECORDED'])
    AND NOT (_codes @> ARRAY['SV_AUTHORISED_SECURITY_OWNER_NOT_ASSIGNED']),
    'A1d.2 authoring the three requirements through the door clears the two activation blockers');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_activation_requirements WHERE method_version_id = _v) = 3,
    'A1d.3 and all three requirement STATEMENTS exist');

  -- The distinction the whole domain rests on: a requirement is written down,
  -- never satisfied. The satisfactions are runtime facts that do not live here.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'beskt_activation_requirements'
        AND column_name ~* '(satisfied_at|satisfied_by_user|attested|is_satisfied|fulfilled)') = 0,
    'A1d.4 and there is nowhere for the door to record that one was SATISFIED -- authoring a requirement attests nothing');

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_activation_requirement(%L, %L, %s, %L::jsonb)',
      gen_random_uuid(), _v, _rev,
      jsonb_build_object('requirement_key', 'lawful_basis_recorded',
                         'satisfied_by_role', 'accountable_process_owner',
                         'satisfied_at', 'now')::text),
    'BESKT_CONTENT_UNKNOWN_FIELD',
    'A1d.5 and a payload that tries to record a satisfaction is refused by name');
END $a1d$;

-- ===========================================================================
-- A2 -- Who may author. The doors are not open to everyone who can sign in.
-- ===========================================================================
DO $a2$
DECLARE _v uuid; _rev integer; _p jsonb; _stmt text;
BEGIN
  SELECT v INTO _v FROM au;
  _rev := pg_temp.rev_of(_v);
  _p := jsonb_build_object('section_key', 'intruder', 'display_order', 9,
                           'phase', 'candidate_preparation', 'title_sv', 'X', 'title_en', 'X');
  _stmt := format('SELECT public.beskt_author_section(%L, %L, %s, %L::jsonb)',
                  gen_random_uuid(), _v, _rev, _p::text);

  PERFORM pg_temp.must_fail_as('anon', NULL, _stmt,
    'permission denied', 'A2.1 an unauthenticated visitor cannot execute an authoring door at all');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1', _stmt,
    'BESKT_NOT_EDITOR', 'A2.2 an ordinary signed-in user with no role cannot author content');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000c1', _stmt,
    'BESKT_NOT_EDITOR', 'A2.3 a candidate cannot author content');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000a1', _stmt,
    'BESKT_NOT_EDITOR', 'A2.4 a REVIEWER cannot author content -- reviewing is not editing');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000b1', _stmt,
    'BESKT_NOT_EDITOR', 'A2.5 a PUBLISHER cannot author content either');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1', _stmt,
    'BESKT_NOT_EDITOR', 'A2.6 an employer member cannot author the method they will use');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_sections
      WHERE method_version_id = _v AND section_key = 'intruder') = 0,
    'A2.7 and not one of those refusals left a row behind');
  PERFORM pg_temp.ok(pg_temp.rev_of(_v) = _rev,
    'A2.8 nor advanced the revision, so a refused write is not mistaken for a change');
END $a2$;

-- ===========================================================================
-- A3 -- The payload is a typed contract, not a bag.
-- ===========================================================================
DO $a3$
DECLARE _v uuid; _rev integer;
BEGIN
  SELECT v INTO _v FROM au;
  _rev := pg_temp.rev_of(_v);

  -- THE reason the payloads are jsonb at all: a misspelling is an ERROR.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_item(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('item_key', 'typo_item', 'section_key', 'preparation',
        'profile_key', 'lone_working', 'purpse_sv', 'stavfel')::text),
    'BESKT_CONTENT_UNKNOWN_FIELD',
    'A3.1 a misspelled governed field is REFUSED BY NAME, never silently dropped');

  -- A field that would be a judgement does not exist, so naming one is
  -- refused by the same rule rather than stored anywhere.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_item(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('item_key', 'scored_item', 'section_key', 'preparation',
        'profile_key', 'lone_working', 'score', 5, 'risk_weight', 3)::text),
    'BESKT_CONTENT_UNKNOWN_FIELD',
    'A3.2 a score or a risk weight is not a field this domain has, so authoring one is refused');

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_section(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('display_order', 3, 'phase', 'interview')::text),
    'BESKT_CONTENT_KEY_REQUIRED',
    'A3.3 a payload with no key names nothing and is refused');

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_section(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      '["not", "an", "object"]'),
    'BESKT_CONTENT_PAYLOAD',
    'A3.4 a payload that is not an object is refused before anything is read out of it');

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_item(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('item_key', 'lone_working_experience',
        'options', jsonb_build_array(jsonb_build_object('option_key', 'x', 'weight', 2)))::text),
    'BESKT_CONTENT_UNKNOWN_FIELD',
    'A3.5 the option payload is checked too -- an option carries a key, an order and two labels, and nothing else');

  PERFORM pg_temp.ok(pg_temp.rev_of(_v) = _rev,
    'A3.6 and no refused payload advanced the revision');
END $a3$;

-- ===========================================================================
-- A4 -- Concurrency and idempotency.
-- ===========================================================================
DO $a4$
DECLARE _v uuid; _rev integer; _op uuid; _r1 jsonb; _r2 jsonb; _payload jsonb;
BEGIN
  SELECT v INTO _v FROM au;
  _rev := pg_temp.rev_of(_v);

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_section(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev - 1,
      jsonb_build_object('section_key', 'stale_attempt', 'display_order', 8,
                         'phase', 'interview', 'title_sv', 'X', 'title_en', 'X')::text),
    'BESKT_STALE_REVISION',
    'A4.1 an edit made against a revision somebody else has moved past is refused');

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_section(%L, %L, NULL, %L::jsonb)', gen_random_uuid(), _v,
      jsonb_build_object('section_key', 'no_revision', 'display_order', 8,
                         'phase', 'interview', 'title_sv', 'X', 'title_en', 'X')::text),
    'BESKT_REVISION_REQUIRED',
    'A4.2 an edit that names no revision at all is refused');

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_section(NULL, %L, %s, %L::jsonb)', _v, _rev,
      jsonb_build_object('section_key', 'no_operation', 'display_order', 8,
                         'phase', 'interview', 'title_sv', 'X', 'title_en', 'X')::text),
    'BESKT_OPERATION_ID_REQUIRED',
    'A4.3 an edit with no operation id is refused, so every write is replayable');

  -- The same operation, twice: one row, one event, the original result.
  _op := gen_random_uuid();
  _payload := jsonb_build_object('section_key', 'replayed', 'display_order', 7,
                                 'phase', 'interview', 'title_sv', 'Upprepad', 'title_en', 'Replayed');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r1 := public.beskt_author_section(_op, _v, _rev, _payload);
  _r2 := public.beskt_author_section(_op, _v, _rev, _payload);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(_r1 = _r2,
    'A4.4 replaying an operation returns the ORIGINAL result rather than doing the work twice');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_sections
      WHERE method_version_id = _v AND section_key = 'replayed') = 1,
    'A4.5 and leaves exactly one row');
  PERFORM pg_temp.ok(pg_temp.rev_of(_v) = _rev + 1,
    'A4.6 and advanced the revision exactly once');

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_section(%L, %L, %s, %L::jsonb)', _op, _v, _rev + 1,
      jsonb_build_object('section_key', 'replayed', 'display_order', 7,
                         'phase', 'interview', 'title_sv', 'ANNAT', 'title_en', 'DIFFERENT')::text),
    'BESKT_OPERATION',
    'A4.7 reusing that operation id for a DIFFERENT payload is refused, not quietly answered from the receipt');

  UPDATE au SET rev = pg_temp.rev_of(_v);
END $a4$;

-- ===========================================================================
-- A5 -- THE LAW STILL BITES THROUGH THE DOOR.
--
-- These doors run as the table owner. If opening them had turned
-- beskt_guard_child_row() into advice, every content invariant in the domain
-- would now be bypassable by anybody holding the editor role. Each assertion
-- below sends a payload the guard must refuse, through the door.
-- ===========================================================================
DO $a5$
DECLARE _v uuid; _rev integer;
BEGIN
  SELECT v INTO _v FROM au;
  _rev := pg_temp.rev_of(_v);

  -- Routing may only move forward through the governed order.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_routing_rule(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('rule_key', 'backwards', 'evaluation_order', 9,
        'applies_mode', 'recruitment_support', 'source_item_key', 'incident_context',
        'condition_kind', 'always', 'action', 'show', 'target_item_key', 'lone_working_experience')::text),
    'BESKT_ROUTE_BACKWARD',
    'A5.1 a backward routing rule is still refused when it arrives through the door');

  -- Routing connects candidate-preparation items only.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_routing_rule(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('rule_key', 'into_the_interview', 'evaluation_order', 9,
        'applies_mode', 'recruitment_support', 'source_item_key', 'lone_working_experience',
        'condition_kind', 'always', 'action', 'show',
        'target_item_key', 'interview_topic_lone_working')::text),
    'BESKT_ROUTE_PHASE',
    'A5.2 routing still cannot reach into the interview phase');

  -- An Evaluation prompt's wording IS the governed template.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_prompt(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('prompt_key', 'forged_evaluation', 'profile_key', 'lone_working',
        'display_order', 20, 'prompt_kind', 'interviewer_self_review', 'peace_stage', 'evaluation',
        'addressee', 'interviewer', 'question_form', 'reflective_readback',
        'permitted_mode', 'recruitment_support', 'evaluation_template_key', 'method_adherence',
        'wording_sv', 'Bedöm kandidatens trovärdighet.', 'wording_en', 'Rate the candidate credibility.',
        'content_provenance', 'cqrity_design_hypothesis')::text),
    'BESKT_EVALUATION_NOT_TEMPLATED',
    'A5.3 authored text cannot be smuggled into the PEACE Evaluation step through the door');

  -- A prompt's stage is fixed by its kind.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_prompt(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('prompt_key', 'wrong_stage', 'profile_key', 'lone_working',
        'display_order', 21, 'prompt_kind', 'open_invitation', 'peace_stage', 'closure',
        'addressee', 'candidate', 'question_form', 'open_question',
        'permitted_mode', 'recruitment_support', 'wording_sv', 'Berätta.', 'wording_en', 'Tell me.',
        'content_provenance', 'cqrity_design_hypothesis')::text),
    'BESKT_PROMPT_STAGE_MISMATCH',
    'A5.4 a prompt kind still belongs to the stage the method says it does');

  -- Non-choice items cannot carry options.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_item(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('item_key', 'lone_working_example',
        'options', jsonb_build_array(
          jsonb_build_object('option_key', 'a', 'display_order', 1, 'label_sv', 'A', 'label_en', 'A')))::text),
    'BESKT_ITEM_OPTIONS_NOT_APPLICABLE',
    'A5.5 a long-text question cannot be given answer options');

  -- A parent from another version is not addressable at all.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_item(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('item_key', 'orphan', 'section_key', 'no_such_section',
        'profile_key', 'lone_working', 'display_order', 9)::text),
    'BESKT_CONTENT_PARENT_UNKNOWN',
    'A5.6 a section this version does not have cannot be named, by key or otherwise');

  -- A condition option must belong to the rule's own source item.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_routing_rule(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('rule_key', 'foreign_option', 'evaluation_order', 9,
        'applies_mode', 'recruitment_support', 'source_item_key', 'reported_incident',
        'condition_kind', 'option_selected', 'condition_option_key', 'yes',
        'action', 'show', 'target_item_key', 'incident_context')::text),
    'BESKT_CONTENT_PARENT_UNKNOWN',
    'A5.7 a rule cannot be conditioned on an option belonging to a different question');

  PERFORM pg_temp.ok(pg_temp.rev_of(_v) = _rev,
    'A5.8 and every one of those refusals left the version exactly where it was');
END $a5$;

-- ===========================================================================
-- A6 -- Deletion, and what refuses to be deleted.
-- ===========================================================================
DO $a6$
DECLARE _v uuid; _rev integer;
BEGIN
  SELECT v INTO _v FROM au;
  _rev := pg_temp.rev_of(_v);

  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_delete_content(%L, %L, %s, %L, %L)', gen_random_uuid(), _v, _rev,
           'invented_family', 'x'),
    'BESKT_CONTENT_FAMILY_UNKNOWN',
    'A6.1 a family this domain does not have cannot be deleted from');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_delete_content(%L, %L, %s, %L, %L)', gen_random_uuid(), _v, _rev,
           'section', 'no_such_section'),
    'BESKT_CONTENT_NOT_FOUND',
    'A6.2 deleting something that is not there says so rather than succeeding silently');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000f1',
    format('SELECT public.beskt_delete_content(%L, %L, %s, %L, %L)', gen_random_uuid(), _v, _rev,
           'section', 'replayed'),
    'BESKT_NOT_EDITOR',
    'A6.3 deletion goes through the same editor gate as authoring');

  -- An item a routing rule still depends on refuses, and names the reference.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_delete_content(%L, %L, %s, %L, %L)', gen_random_uuid(), _v, _rev,
           'item', 'lone_working_experience'),
    'beskt_routing_rules',
    'A6.4 an item a routing rule still points at refuses to be deleted, and names what still needs it');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_items
      WHERE method_version_id = _v AND item_key = 'lone_working_experience') = 1,
    'A6.5 and the item is still there -- the refusal took nothing with it');

  -- Something nothing depends on deletes cleanly and advances the revision.
  _rev := pg_temp.del(_v, _rev, 'section', 'replayed');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_sections
      WHERE method_version_id = _v AND section_key = 'replayed') = 0,
    'A6.6 a section nothing depends on is removed');
  PERFORM pg_temp.ok(pg_temp.rev_of(_v) = _rev,
    'A6.7 and the deletion advanced the revision like any other governed change');
  PERFORM pg_temp.ok(
    (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v)
      = public.beskt_method_content_hash(_v),
    'A6.8 and the stored hash was recomputed, so it still names what is there');

  UPDATE au SET rev = _rev;
END $a6$;

-- ===========================================================================
-- A7 -- Published content is frozen, and the door does not thaw it.
-- ===========================================================================
DO $a7$
DECLARE _v uuid; _rev integer; _r jsonb; _g record;
BEGIN
  SELECT v INTO _v FROM au;

  -- Carry the version through the five real gates, as five different people,
  -- then publish as a sixth. This is the existing lifecycle, unchanged.
  FOR _g IN SELECT * FROM (VALUES
      ('b2000000-0000-4000-8000-0000000000a1'::uuid, 'personnel_security'),
      ('b2000000-0000-4000-8000-0000000000a2'::uuid, 'senior_hr'),
      ('b2000000-0000-4000-8000-0000000000a3'::uuid, 'recruitment'),
      ('b2000000-0000-4000-8000-0000000000a4'::uuid, 'employment_privacy_legal'),
      ('b2000000-0000-4000-8000-0000000000a5'::uuid, 'data_protection')) AS t(who, gate) LOOP
    PERFORM pg_temp.review(_v, _g.who, _g.gate, 'approved');
  END LOOP;

  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000b1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_publish_version(gen_random_uuid(), _v, pg_temp.rev_of(_v));
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_r ->> 'content_status' = 'published',
    'A7.1 the authored method is published by a separate person through the existing lifecycle');

  _rev := pg_temp.rev_of(_v);
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_author_item(%L, %L, %s, %L::jsonb)', gen_random_uuid(), _v, _rev,
      jsonb_build_object('item_key', 'lone_working_experience', 'wording_sv', 'ÄNDRAD EFTER PUBLICERING')::text),
    'BESKT_PUBLISHED_IMMUTABLE',
    'A7.2 a published question cannot be reworded through the authoring door');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.beskt_delete_content(%L, %L, %s, %L, %L)', gen_random_uuid(), _v, _rev,
           'prompt', 'p1_closure'),
    'BESKT_PUBLISHED_IMMUTABLE',
    'A7.3 and a published prompt cannot be deleted through the deletion door');

  PERFORM pg_temp.ok(
    (SELECT wording_sv FROM public.beskt_items
      WHERE method_version_id = _v AND item_key = 'lone_working_experience')
      = 'Har du erfarenhet av ensamarbete?',
    'A7.4 the published wording is exactly what the five gates approved');
  PERFORM pg_temp.ok(
    (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v)
      = public.beskt_method_content_hash(_v),
    'A7.5 and the published bytes still hash to the stored, reviewed hash');
END $a7$;

-- ===========================================================================
-- A8 -- No client DML, no internal door left ajar, and a real audit trail.
-- ===========================================================================
DO $a8$
DECLARE _v uuid; _n integer; _t text; _fn text;
BEGIN
  SELECT v INTO _v FROM au;

  -- The whole point of the design: authoring is functions, not grants.
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('beskt_exposure_profiles', 'beskt_sections', 'beskt_items',
                        'beskt_item_options', 'beskt_prompts', 'beskt_routing_rules',
                        'beskt_evidence_anchors', 'beskt_observation_fields',
                        'beskt_activation_requirements')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  PERFORM pg_temp.ok(_n = 0,
    format('A8.1 no browser role holds table DML on ANY BESKT content table (found %s)', _n));

  -- And the editor really cannot reach the table directly, exercised rather
  -- than read from the catalogue.
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase) VALUES (%L, ''direct'', 9, ''interview'')', _v),
    'permission denied',
    'A8.2 and an EDITOR writing straight at the table is refused by privilege, not by politeness');

  FOREACH _fn IN ARRAY ARRAY['beskt_content_gate', 'beskt_content_commit'] LOOP
    PERFORM pg_temp.ok(
      NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = _fn
                     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
      format('A8.3 %s applies no authorisation of its own and is not callable by authenticated', _fn));
  END LOOP;

  PERFORM pg_temp.ok(
    NOT has_function_privilege('authenticated', 'public.beskt_guard_child_row()', 'EXECUTE'),
    'A8.4 the guard these doors stand on is still not published as an API');

  -- Every authoring call left an event naming who, what and at which hash.
  SELECT count(*) INTO _n FROM public.beskt_method_events
   WHERE method_version_id = _v AND event IN ('content_upserted', 'content_deleted');
  PERFORM pg_temp.ok(_n >= 40,
    format('A8.5 every authoring call is on the append-only governance ledger (found %s)', _n));
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_method_events
      WHERE method_version_id = _v AND event IN ('content_upserted', 'content_deleted')
        AND (actor_id IS NULL OR content_hash IS NULL OR operation_id IS NULL
             OR metadata ->> 'family' IS NULL OR metadata ->> 'key' IS NULL)) = 0,
    'A8.6 and each one names its actor, its content hash, its operation and exactly what it touched');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_method_events
      WHERE method_version_id = _v AND event = 'content_deleted') = 1,
    'A8.7 the one deletion is recorded as a deletion, distinguishable from an edit');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.beskt_method_events
      WHERE method_version_id = _v AND event IN ('content_upserted', 'content_deleted')
        AND actor_id <> 'b2000000-0000-4000-8000-0000000000e1') = 0,
    'A8.8 and every one of them names the editor who actually made it, not the function owner');

  -- Nothing about this migration can express a judgement.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'beskt\_%' ESCAPE '\'
     AND c.column_name ~* '(score|points|weight|threshold|rank|suitab|credib|truthful|verdict|deception|hire|rating|grade)';
  PERFORM pg_temp.ok(_n = 0,
    format('A8.9 nowhere in the BESKT content domain is there a column to author a judgement into (found %s)', _n));
END $a8$;

DO $done$
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'BESKT PR 7 content-authoring suite: all groups passed';
  RAISE NOTICE '====================================================';
END $done$;

ROLLBACK;
