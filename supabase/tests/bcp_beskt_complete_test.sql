-- 20261130090000 — BESKT as a complete product, through real sessions.
--
-- Proves: the security function and its boundary; a security vetting started
-- with the employer's attestation, lawful basis and security owner, answered
-- with security-vetting-only content, supplemented, linked, conducted with the
-- whole FAKTA chain and reported with a human stance; a standalone invitation
-- bound to the confirmed invited account with no job application; the
-- disclosed topic with its rule; and that nothing that existed changed
-- meaning. Everything is synthetic and rolls back.

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

CREATE TEMP TABLE bc (
  v uuid, vv uuid, prof uuid, vprof uuid, hash text, vhash text,
  emp_a uuid, emp_b uuid, owner_a uuid, officer uuid, officer2 uuid, member uuid, member_b uuid,
  cand uuid, invitee uuid, app uuid, job uuid, pack_v uuid, role_v uuid,
  vet uuid, vet_case uuid, vet_link uuid, vet_session uuid, vet_position uuid,
  inv uuid, token text, std uuid, std_case uuid, std_link uuid, legacy uuid
) ON COMMIT DROP;
INSERT INTO bc DEFAULT VALUES;
GRANT ALL ON bc TO authenticated;

-- Fill a preparation the way a candidate does: answer everything still
-- unanswered, first option for a choice, until the routing settles.
CREATE FUNCTION pg_temp.fill(_assignment uuid) RETURNS void LANGUAGE plpgsql AS $fill$
DECLARE _doc jsonb; _entries jsonb; _round integer := 0;
BEGIN
  LOOP
    _round := _round + 1;
    IF _round > 20 THEN RAISE EXCEPTION 'COMPLETE_SUITE: the preparation never settled.'; END IF;
    SELECT d INTO _doc FROM public.bcp_candidate_preparation(_assignment) d;
    SELECT jsonb_agg(jsonb_build_object(
             'item_key', it ->> 'item_key', 'response_state', 'answered',
             'value_text', CASE WHEN it ->> 'answer_type' IN ('short_text', 'long_text')
               THEN to_jsonb('SYNTETISKT svar.'::text) END,
             'value_boolean', CASE WHEN it ->> 'answer_type' IN ('boolean', 'acknowledgement')
               THEN to_jsonb(true) END,
             'option_keys', CASE WHEN it ->> 'answer_type' IN ('single_choice', 'multi_choice')
               THEN jsonb_build_array(it -> 'options' -> 0 ->> 'option_key') ELSE '[]'::jsonb END)
           ORDER BY (it ->> 'sequence_position')::integer)
      INTO _entries
      FROM jsonb_array_elements(_doc -> 'items') it
     WHERE it -> 'answer' IS NULL OR jsonb_typeof(it -> 'answer') = 'null';
    EXIT WHEN _entries IS NULL OR jsonb_array_length(_entries) = 0;
    PERFORM public.bcp_save_answers(gen_random_uuid(), _assignment,
      (_doc -> 'response' ->> 'revision')::integer, _entries);
  END LOOP;
END $fill$;

-- ---- setup ---------------------------------------------------------------
DO $setup$
DECLARE
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _emp_a uuid := 'b2000000-0000-4000-8000-00000000ee01';
  _owner uuid := 'b2000000-0000-4000-8000-0000000000d1';
  _cand uuid := 'b2000000-0000-4000-8000-0000000000c1';
  _emp_b uuid := 'b8000000-0000-4000-8000-00000000eb01';
  _officer uuid := 'b8000000-0000-4000-8000-0000000000a1';
  _officer2 uuid := 'b8000000-0000-4000-8000-0000000000a2';
  _member uuid := 'b8000000-0000-4000-8000-0000000000d3';
  _member_b uuid := 'b8000000-0000-4000-8000-0000000000d4';
  _invitee uuid := 'b8000000-0000-4000-8000-0000000000c2';
  _v uuid; _vv uuid; _job uuid; _app uuid; _pack_v uuid; _role_v uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_officer, 'bc-officer@synthetic.test'), (_officer2, 'bc-officer2@synthetic.test'),
    (_member, 'bc-member@synthetic.test'), (_member_b, 'bc-member-b@synthetic.test'),
    (_invitee, 'bc-invitee@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_emp_b, 'SYNTETISK Annan AB', 'synthetic-bc-other', 'active') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
    (_emp_a, _officer, 'member', 'active'), (_emp_a, _officer2, 'member', 'active'),
    (_emp_a, _member, 'member', 'active'), (_emp_b, _member_b, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  _v := pg_temp.build_method('synthetic-bc-recruitment', 'recruitment_support');
  _vv := pg_temp.build_method('synthetic-bc-vetting', 'security_vetting_support');

  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en, status, published_at, expires_at)
  VALUES ('bc-job', 'BCJOB1', _emp_a, 'internal', 'Säkerhetssamordnare (syntetisk)', 'Security coordinator (synthetic)',
          'published', now(), now() + interval '90 days') RETURNING id INTO _job;
  PERFORM pg_temp.nobody();
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job, _emp_a, _cand, now()) RETURNING id INTO _app;
  SELECT pv.id, rv.id INTO _pack_v, _role_v
    FROM public.scp_interview_pack_versions pv CROSS JOIN public.scp_role_versions rv LIMIT 1;

  UPDATE bc SET v = _v, vv = _vv,
    prof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _v AND profile_key = 'lone_working'),
    vprof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _vv AND permitted_mode = 'security_vetting_support'),
    hash = (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v),
    vhash = (SELECT content_hash FROM public.beskt_method_versions WHERE id = _vv),
    emp_a = _emp_a, emp_b = _emp_b, owner_a = _owner, officer = _officer, officer2 = _officer2,
    member = _member, member_b = _member_b, cand = _cand, invitee = _invitee, app = _app, job = _job,
    pack_v = _pack_v, role_v = _role_v;

  -- The owner's recorded activations, for both methods: not a review.
  PERFORM pg_temp.become(_admin);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_grant_internal_test_activation(gen_random_uuid(), _emp_a, _v,
    'SYNTETISKT ägarbeslut: intern funktionstest.', current_date + 30);
  PERFORM public.bcp_grant_internal_test_activation(gen_random_uuid(), _emp_a, _vv,
    'SYNTETISKT ägarbeslut: intern funktionstest av säkerhetsprövningen.', current_date + 30);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(public.bcp_version_is_structurally_candidate_safe(_vv)
                     AND NOT public.bcp_version_is_candidate_safe(_vv),
    'BC0.1 a security-vetting version is runnable in its own mode, and bcp_version_is_candidate_safe keeps its meaning');
  PERFORM pg_temp.ok((SELECT content_status FROM public.beskt_method_versions WHERE id = _vv) = 'draft'
                     AND NOT EXISTS (SELECT 1 FROM public.beskt_method_reviews WHERE method_version_id = _vv),
    'BC0.2 the activated vetting version is an unreviewed draft: nothing was approved');
END $setup$;

-- ---- BC1: the security function -------------------------------------------
DO $$
DECLARE r bc%ROWTYPE; _res jsonb;
BEGIN
  SELECT * INTO r FROM bc;
  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT public.bcp_appoint_security_officer(gen_random_uuid(), %L, %L, %L)', r.emp_a, r.officer, 'Säkerhetsskyddschef'),
    'BCP_NOT_EMPLOYER_ADMIN', 'BC1.1 a plain member cannot appoint the security function');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    format('SELECT public.bcp_appoint_security_officer(gen_random_uuid(), %L, %L, %L)', r.emp_a, r.member_b, 'Fel organisation'),
    'BCP_OFFICER_NOT_MEMBER', 'BC1.2 only a member of the organisation can be appointed');
  PERFORM pg_temp.become(r.owner_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_appoint_security_officer(gen_random_uuid(), r.emp_a, r.officer, 'SYNTETISK säkerhetsskyddschef');
  PERFORM public.bcp_appoint_security_officer(gen_random_uuid(), r.emp_a, r.officer2, 'SYNTETISK andra bedömare');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(public.bcp_is_security_officer(r.emp_a, r.officer)
                     AND NOT public.bcp_is_security_officer(r.emp_a, r.member),
    'BC1.3 the owner appoints named members; others are not appointed');
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.bcp_security_officers (employer_id, user_id, appointed_by, appointment_reason, appoint_operation_id) VALUES (%L, %L, %L, %L, gen_random_uuid())',
           r.emp_a, r.member, r.owner_a, 'direkt'),
    'BCP_SECURITY_OFFICER_UNGOVERNED_WRITE', 'BC1.4 no one writes the appointment table directly');
END $$;

-- ---- BC2: starting a security vetting --------------------------------------
DO $$
DECLARE r bc%ROWTYPE; _res jsonb;
BEGIN
  SELECT * INTO r FROM bc;
  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
      r.app, 'security_vetting_support', r.vv, r.vprof, r.vhash, r.officer, 'Kontakt: säkerhetsskyddschefen',
      r.officer, 'Befattningen deltar i säkerhetskänslig verksamhet enligt vår analys.', 'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.'),
    'BCP_NOT_SECURITY_OFFICER', 'BC2.1 a plain member cannot start a security vetting');
  PERFORM pg_temp.must_fail_as('authenticated', r.officer,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
      r.app, 'security_vetting_support', r.vv, r.vprof, r.vhash, r.officer, 'Kontakt: säkerhetsskyddschefen',
      r.officer, 'kort', 'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.'),
    'BCP_ATTESTATION_REQUIRED', 'BC2.2 the employer''s attestation is required, in its own words');
  PERFORM pg_temp.must_fail_as('authenticated', r.officer,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
      r.app, 'security_vetting_support', r.vv, r.vprof, r.vhash, r.member, 'Kontakt: säkerhetsskyddschefen',
      r.officer, 'Befattningen deltar i säkerhetskänslig verksamhet enligt vår analys.', 'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.'),
    'BCP_INTERVIEWER_NOT_SECURITY_OFFICER', 'BC2.3 the responsible interviewer belongs to the security function');
  PERFORM pg_temp.must_fail_as('authenticated', r.officer,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
      r.app, 'security_vetting_support', r.vv,
      (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = r.vv AND permitted_mode = 'recruitment_support'),
      r.vhash, r.officer, 'Kontakt: säkerhetsskyddschefen',
      r.officer, 'Befattningen deltar i säkerhetskänslig verksamhet enligt vår analys.', 'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.'),
    'BCP_PROFILE_MODE_NOT_PERMITTED', 'BC2.4 a vetting needs a security-vetting exposure profile');

  PERFORM pg_temp.become(r.officer);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_start_beskt(gen_random_uuid(), r.app, 'security_vetting_support', r.vv, r.vprof, r.vhash,
    r.officer, 'Kontakt: säkerhetsskyddschefen, 08-000 00 00', r.officer,
    'Befattningen deltar i säkerhetskänslig verksamhet enligt vår analys.',
    'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE bc SET vet = (_res ->> 'assignment_id')::uuid;
  PERFORM pg_temp.ok((SELECT mode = 'security_vetting_support' AND notice_version = 'beskt-vetting-notice-1'
                             AND security_owner_id = r.officer AND length(lawful_basis_statement) > 20
                        FROM public.bcp_assignments WHERE id = (_res ->> 'assignment_id')::uuid),
    'BC2.5 the officer starts it; the row carries the attestation, lawful basis, owner and the vetting notice');
END $$;

-- ---- BC3: who can see it -----------------------------------------------------
DO $$
DECLARE r bc%ROWTYPE; _n integer; _m integer; _o integer;
BEGIN
  SELECT * INTO r FROM bc;
  PERFORM pg_temp.become(r.member); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.bcp_assignments WHERE id = r.vet;
  SELECT count(*) INTO _m FROM public.bcp_employer_beskt_assignments(r.emp_a) WHERE assignment_id = r.vet;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0 AND _m = 0, 'BC3.1 a plain member of the same employer does not see the vetting at all');
  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT public.bcp_employer_readback(%L)', r.vet), 'BCP_NOT_AUTHORISED',
    'BC3.2 nor read it back');
  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _o FROM public.bcp_employer_beskt_assignments(r.emp_a) WHERE assignment_id = r.vet;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_o = 1, 'BC3.3 the security function does');
  PERFORM pg_temp.become(r.member_b); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.bcp_assignments WHERE id = r.vet;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'BC3.4 another organisation sees nothing');
END $$;

-- ---- BC4: the candidate answers security-vetting content --------------------
DO $$
DECLARE r bc%ROWTYPE; _desc jsonb; _doc jsonb; _vis integer; _n integer;
BEGIN
  SELECT * INTO r FROM bc;
  PERFORM pg_temp.become(r.cand); SET LOCAL ROLE authenticated;
  _desc := public.bcp_notice_descriptor(r.vet, 'sv-SE');
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), r.vet, 'beskt-vetting-notice-1',
    public.bcp_notice_hash(r.vet, 'sv-SE'), 'sv-SE');
  SELECT d INTO _doc FROM public.bcp_candidate_preparation(r.vet) d;
  SELECT count(*) INTO _vis FROM jsonb_array_elements(_doc -> 'items') it
   WHERE it ->> 'item_key' = 'classified_information_handling';
  PERFORM pg_temp.fill(r.vet);
  SELECT count(*) INTO _n FROM public.bcp_candidate_assignments() WHERE assignment_id = r.vet AND mode = 'security_vetting_support';
  PERFORM public.bcp_submit(gen_random_uuid(), r.vet,
    (SELECT (d -> 'response' ->> 'revision')::integer FROM public.bcp_candidate_preparation(r.vet) d));
  PERFORM public.bcp_submit_supplement(gen_random_uuid(), r.vet, 'correction', 'classified_information_handling',
    'SYNTETISK rättelse: det gällde 2023, inte 2022.');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_desc -> 'recipients' = '["appointed_security_function_of_this_employer"]'::jsonb
                     AND _desc ->> 'contact_statement' LIKE 'Kontakt:%'
                     AND _desc ->> 'lawful_basis_statement' LIKE 'Säkerhetsskyddslagen%'
                     AND (_desc ->> 'uses_ai_interpretation')::boolean = false,
    'BC4.1 the vetting notice names who reads it, the contact route and the employer''s lawful basis');
  PERFORM pg_temp.ok(_vis = 1 AND _n = 1, 'BC4.2 the candidate sees the vetting-only question and the vetting in their list');
  PERFORM pg_temp.ok((SELECT an.response_state = 'answered'
                        FROM public.bcp_answers an JOIN public.bcp_responses rr ON rr.id = an.response_id
                       WHERE rr.assignment_id = r.vet AND an.item_key = 'classified_information_handling'),
    'BC4.3 and answers it: security-vetting content is answered in a security vetting');
  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = r.vet) = 'submitted'
                     AND (SELECT count(*) FROM public.bcp_candidate_supplements WHERE assignment_id = r.vet) = 1,
    'BC4.4 submitted, then supplemented without touching the submitted snapshot');
  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT * FROM public.bcp_assignment_supplements(%L)', r.vet), 'BCP_NOT_AUTHORISED',
    'BC4.5 a plain member cannot read the supplement');
END $$;

-- ---- BC5: case, link and the security function's case --------------------------
DO $$
DECLARE r bc%ROWTYPE; _c uuid; _res jsonb; _before boolean; _after boolean; _off boolean;
BEGIN
  SELECT * INTO r FROM bc;
  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, created_by)
  VALUES (r.emp_a, r.job, r.app, r.cand, 'SYNTETISK Kandidat', r.pack_v, r.role_v, 'SYNTETISK säkerhetsprövning', r.officer)
  RETURNING id INTO _c;
  PERFORM pg_temp.become(r.member); SET LOCAL ROLE authenticated;
  _before := public.scp_iv_can_read_case(_c);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT public.bcp_link_preparation_to_case(gen_random_uuid(), %L, %L, 1)', r.vet, _c),
    'BCP_NOT_EMPLOYER_MEMBER', 'BC5.1 a plain member cannot link a vetting');
  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  _res := public.bcp_link_preparation_to_case(gen_random_uuid(), r.vet, _c,
    (SELECT revision FROM public.bcp_assignments WHERE id = r.vet));
  _off := public.scp_iv_can_read_case(_c);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(r.member); SET LOCAL ROLE authenticated;
  _after := public.scp_iv_can_read_case(_c);
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE bc SET vet_case = _c, vet_link = (_res ->> 'link_id')::uuid;
  PERFORM pg_temp.ok(_before AND NOT _after AND _off,
    'BC5.2 once the vetting is linked, the case is the security function''s alone');
END $$;

-- ---- BC6: the interview, the FAKTA chain, the stance and the report ------------
DO $$
DECLARE r bc%ROWTYPE; _res jsonb; _prep jsonb; _pos uuid; _rev integer; _blk text[]; _prev jsonb; _fin jsonb; _final jsonb;
BEGIN
  SELECT * INTO r FROM bc;
  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT public.bcp_conduct_start_session(gen_random_uuid(), %L)', r.vet_link),
    'NOT_PERMITTED', 'BC6.1 a plain member cannot open the vetting conversation');
  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_start_session(gen_random_uuid(), r.vet_link);
  _pos := (_res ->> 'position_id')::uuid;
  _prep := public.bcp_interview_preparation((_res ->> 'session_id')::uuid);
  PERFORM public.bcp_conduct_save_entry(gen_random_uuid(), _pos,
    (SELECT revision FROM public.bcp_conduct_positions WHERE id = _pos),
    jsonb_build_object('item_key', 'classified_information_handling',
      'observable_fact', 'SYNTETISKT: hanterade skyddad information 2023.',
      'event_timing', '2023, avslutat', 'consequence', 'Ingen',
      'candidate_explanation', 'SYNTETISKT: beskrev rutinen.',
      'supporting_information', 'Referens bekräftar rutinen.',
      'contradicting_information', 'Ingen motsägande uppgift.',
      'alternative_explanation', 'Rutinfel hos arbetsgivaren.',
      'measures_taken', 'Utbildning genomförd.', 'protective_factor', 'Rapporterade själv.',
      'role_link', 'Rollen hanterar samma informationsklass.',
      'verification_need', 'Kontrollera intyg.', 'information_gap', 'Intyget saknas.',
      'candidate_response', 'Rättade årtalet i samtalet.'));
  UPDATE bc SET vet_session = (_res ->> 'session_id')::uuid, vet_position = _pos;
  SELECT * INTO r FROM bc;
  SELECT array_agg(b.code) INTO _blk FROM public.bcp_conduct_report_blockers((_res ->> 'session_id')::uuid) b;
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(jsonb_array_length(_prep -> 'base') > 0
                     AND (_prep -> 'candidate' -> 0 ->> 'provenance') IS NOT DISTINCT FROM (CASE WHEN jsonb_array_length(_prep -> 'candidate') > 0 THEN 'candidate_statement' END)
                     AND _prep -> 'role' ->> 'role_security_attestation' LIKE 'Befattningen%'
                     AND jsonb_array_length(_prep -> 'supplements') = 1,
    'BC6.2 the preparation is three lists with provenance, the attestation and the supplement');
  PERFORM pg_temp.ok((SELECT event_timing IS NOT NULL AND supporting_information IS NOT NULL
                             AND contradicting_information IS NOT NULL AND measures_taken IS NOT NULL
                             AND role_link IS NOT NULL AND information_gap IS NOT NULL AND candidate_response IS NOT NULL
                        FROM public.bcp_conduct_entries WHERE position_id = _pos),
    'BC6.3 the whole FAKTA chain is recorded, each in its own column');
  PERFORM pg_temp.ok('BCP_CONDUCT_STANCE_MISSING' = ANY (_blk),
    'BC6.4 a report cannot be finalised without the responsible human''s stance');
  PERFORM pg_temp.must_fail_as('authenticated', r.officer,
    format('SELECT public.bcp_conduct_record_stance(gen_random_uuid(), %L, 0, %L, %L, %L, %L, %L, %L)',
      r.vet_session, 'sufficient', 'Underlaget räcker för ställningstagandet.', 'Inget hinder konstaterat för rollen.',
      'Motiverat av verifierade uppgifter och skyddsfaktorer.', 'SYNTETISK Officer', 'Säkerhetsskyddschef'),
    'BCP_POSITIONS_NOT_LOCKED', 'BC6.5 the stance comes after the independent positions, never before');

  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _pos,
    (SELECT revision FROM public.bcp_conduct_positions WHERE id = _pos));
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.must_fail_as('authenticated', r.officer,
    format('SELECT public.bcp_conduct_record_stance(gen_random_uuid(), %L, 0, %L, %L, %L, %L, %L, %L)',
      r.vet_session, 'sufficient', 'Underlaget räcker för ställningstagandet.', 'Kandidaten får 7 poäng av 10.',
      'Motiverat av verifierade uppgifter och skyddsfaktorer.', 'SYNTETISK Officer', 'Säkerhetsskyddschef'),
    'BCP_STANCE_WORDING', 'BC6.6 a stance states reasons, never a score');
  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT public.bcp_conduct_record_stance(gen_random_uuid(), %L, 0, %L, %L, %L, %L, %L, %L)',
      r.vet_session, 'sufficient', 'Underlaget räcker för ställningstagandet.', 'Inget hinder konstaterat för rollen.',
      'Motiverat av verifierade uppgifter och skyddsfaktorer.', 'Någon', 'Medarbetare'),
    'BCP_NOT_RESPONSIBLE', 'BC6.7 only the responsible person records it');

  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_record_stance(gen_random_uuid(), r.vet_session, 0, 'more_information_required',
    'Intyget om utbildning saknas ännu.', 'Inget hinder konstaterat för rollen, med villkor om intyg.',
    'Verifierade uppgifter och kandidatens egen rapportering talar för att rutinen följs.',
    'SYNTETISK Officer', 'Säkerhetsskyddschef');
  PERFORM public.bcp_conduct_record_action(gen_random_uuid(), r.vet_session, NULL, 0,
    'Begär utbildningsintyg.', 'Säkerhetsskyddschefen', current_date + 14, 'planned', current_date + 30, NULL);
  SELECT array_agg(b.code) INTO _blk FROM public.bcp_conduct_report_blockers(r.vet_session) b;
  _prev := public.bcp_conduct_preview_report(r.vet_session);
  _fin := public.bcp_conduct_finalise_report(gen_random_uuid(), r.vet_session, _prev ->> 'basis_hash');
  _final := public.bcp_conduct_final_report(r.vet_session);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_blk IS NULL, 'BC6.8 with the stance recorded nothing blocks the report');
  PERFORM pg_temp.ok(
    (SELECT r2.payload -> 'stance' ->> 'sufficiency' = 'more_information_required'
            AND r2.payload -> 'assignment' ->> 'purpose' = 'security_vetting'
            AND jsonb_array_length(r2.payload -> 'actions') = 1
            AND jsonb_array_length(r2.payload -> 'supplements') = 1
            AND r2.basis_hash = _prev ->> 'basis_hash'
       FROM public.bcp_conduct_reports r2 WHERE r2.session_id = r.vet_session AND r2.status = 'final'),
    'BC6.9 the finalised report is exactly the previewed basis, with purpose, stance, actions and supplement');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_conduct_reports r2
                       WHERE r2.session_id = r.vet_session
                         AND r2.payload::text ~* '"(score|risk_class|rank|recommendation)"') = 0,
    'BC6.10 and it holds no score, risk class, rank or recommendation');
END $$;

-- ---- BC7: the standalone invitation ---------------------------------------------
DO $$
DECLARE r bc%ROWTYPE; _res jsonb; _peek jsonb; _peek_other jsonb; _acc jsonb; _acc2 jsonb; _op uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM bc;
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_create_invitation(gen_random_uuid(), r.emp_a, 'BC-Invitee@Synthetic.test', 'SYNTETISK Inbjuden',
    'Larmoperatör (syntetisk)', 'recruitment_support', r.v, r.prof, r.hash, r.owner_a, 'Kontakt: HR, hr@synthetic.test');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE bc SET inv = (_res ->> 'invitation_id')::uuid, token = _res ->> 'token';
  PERFORM pg_temp.ok(length(_res ->> 'token') = 64
                     AND (SELECT token_digest = public.bcp_invitation_token_digest(_res ->> 'token')
                            FROM public.bcp_invitations WHERE id = (_res ->> 'invitation_id')::uuid)
                     AND NOT EXISTS (SELECT 1 FROM public.bcp_events e WHERE e.result::text LIKE '%' || (_res ->> 'token') || '%'),
    'BC7.1 the token is returned once and stored only as a digest, never in the event log');

  PERFORM pg_temp.become(r.cand); SET LOCAL ROLE authenticated;
  _peek_other := public.bcp_invitation_for_token(_res ->> 'token');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok((_peek_other ->> 'available')::boolean = false AND _peek_other ->> 'reason' = 'not_available'
                     AND _peek_other ->> 'employer_name' IS NULL,
    'BC7.2 another account holding the link learns nothing');
  PERFORM pg_temp.must_fail_as('authenticated', r.cand,
    format('SELECT public.bcp_accept_invitation(gen_random_uuid(), %L)', _res ->> 'token'),
    'BCP_INVITATION_NOT_AVAILABLE', 'BC7.3 and cannot accept it');
  PERFORM pg_temp.must_fail_as('authenticated', r.invitee,
    format('SELECT public.bcp_accept_invitation(gen_random_uuid(), %L)', _res ->> 'token'),
    'BCP_EMAIL_NOT_CONFIRMED', 'BC7.4 the invited address must be confirmed');

  UPDATE auth.users SET email_confirmed_at = now() WHERE id = r.invitee;
  PERFORM pg_temp.become(r.invitee); SET LOCAL ROLE authenticated;
  _peek := public.bcp_invitation_for_token(_res ->> 'token');
  _acc := public.bcp_accept_invitation(_op, _res ->> 'token');
  _acc2 := public.bcp_accept_invitation(_op, _res ->> 'token');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE bc SET std = (_acc ->> 'assignment_id')::uuid;
  PERFORM pg_temp.ok((_peek ->> 'available')::boolean AND _peek ->> 'role_title' = 'Larmoperatör (syntetisk)'
                     AND _acc = _acc2,
    'BC7.5 the invited, confirmed account sees who invites it and accepts once (a retry replays)');
  PERFORM pg_temp.ok((SELECT application_id IS NULL AND job_id IS NULL AND invitation_id = r.inv
                             AND candidate_user_id = r.invitee AND notice_version = 'beskt-prep-notice-2'
                        FROM public.bcp_assignments WHERE id = (_acc ->> 'assignment_id')::uuid),
    'BC7.6 the assignment exists with no job application and the general notice');
  PERFORM pg_temp.must_fail_as('authenticated', r.invitee,
    format('SELECT public.bcp_accept_invitation(gen_random_uuid(), %L)', _res ->> 'token'),
    'BCP_INVITATION_NOT_PENDING', 'BC7.7 an accepted invitation is not accepted twice');
END $$;

-- ---- BC8: the standalone preparation, its disclosed topic and its case --------
DO $$
DECLARE r bc%ROWTYPE; _c uuid; _res jsonb; _topic record;
BEGIN
  SELECT * INTO r FROM bc;
  PERFORM pg_temp.become(r.invitee); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), r.std, 'beskt-prep-notice-2',
    public.bcp_notice_hash(r.std, 'en-GB'), 'en-GB');
  PERFORM pg_temp.fill(r.std);
  PERFORM public.bcp_submit(gen_random_uuid(), r.std,
    (SELECT (d -> 'response' ->> 'revision')::integer FROM public.bcp_candidate_preparation(r.std) d));
  RESET ROLE; PERFORM pg_temp.nobody();

  INSERT INTO public.scp_interview_cases
    (employer_id, candidate_user_id, candidate_display_name, pack_version_id, role_version_id, title, created_by)
  VALUES (r.emp_a, r.invitee, 'SYNTETISK Inbjuden', r.pack_v, r.role_v, 'SYNTETISK fristående intervju', r.owner_a)
  RETURNING id INTO _c;
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_link_preparation_to_case(gen_random_uuid(), r.std, _c,
    (SELECT revision FROM public.bcp_assignments WHERE id = r.std));
  RESET ROLE; PERFORM pg_temp.nobody();
  SELECT * INTO _topic FROM public.bcp_case_topics
   WHERE link_id = (_res ->> 'link_id')::uuid AND topic_reason = 'candidate_disclosed';
  PERFORM pg_temp.ok(_topic.item_key = 'lone_working_experience'
                     AND _topic.trigger_rule_key = 'show_example_when_experienced',
    'BC8.1 an explicit Yes that opened follow-ups is its own interview topic, carrying the rule');
  PERFORM pg_temp.ok((SELECT content_text LIKE 'BESKT-uppdrag %' AND linked_application_id IS NULL AND origin = 'candidate_shared'
                        FROM public.scp_interview_case_sources WHERE id = (_res ->> 'source_id')::uuid),
    'BC8.2 the standalone case source points at the assignment, not at an invented application');
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.bcp_case_topics (link_id, derived_from_response_id, item_id, item_key, topic_reason, trigger_rule_key, display_order) '
           'SELECT %L, derived_from_response_id, item_id, item_key, %L, %L, 99 FROM public.bcp_case_topics WHERE link_id = %L AND topic_reason = %L LIMIT 1',
           (_res ->> 'link_id'), 'candidate_disclosed', 'no_such_rule', (_res ->> 'link_id'), 'candidate_disclosed'),
    'BCP_', 'BC8.3 a disclosed topic cannot name a rule that did not fire');
END $$;

-- ---- BC9: nothing that existed changed meaning ------------------------------------
DO $$
DECLARE r bc%ROWTYPE; _res jsonb; _desc jsonb;
BEGIN
  SELECT * INTO r FROM bc;
  -- The legacy entrance still assigns recruitment support only, with the first notice.
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (r.job, r.emp_a, r.invitee, now());
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    format('SELECT public.bcp_assign(gen_random_uuid(), %L, %L, %L, %L, public.bcp_notice_version())',
           (SELECT id FROM public.job_applications WHERE applicant_user_id = r.invitee AND job_id = r.job), r.vv, r.vprof, r.vhash),
    'BCP_METHOD_MODE_NOT_PERMITTED', 'BC9.1 the legacy bcp_assign still refuses security vetting');
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_assign(gen_random_uuid(),
    (SELECT id FROM public.job_applications WHERE applicant_user_id = r.invitee AND job_id = r.job),
    r.v, r.prof, r.hash, public.bcp_notice_version());
  _desc := public.bcp_notice_descriptor((_res ->> 'assignment_id')::uuid, 'sv-SE');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_desc ->> 'notice_version' = 'beskt-prep-notice-1'
                     AND _desc -> 'sections' = to_jsonb(public.bcp_notice_sections())
                     AND NOT (_desc ? 'contact_statement'),
    'BC9.2 a first-notice assignment renders exactly the first notice');
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.bcp_start_beskt(uuid,uuid,text,uuid,uuid,text,uuid,text,uuid,text,text,timestamptz)', 'EXECUTE')
                     AND NOT has_function_privilege('anon', 'public.bcp_accept_invitation(uuid,text)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.bcp_check_start(uuid,text,uuid,uuid,text,uuid,text,uuid,text,text)', 'EXECUTE')
                     AND NOT has_table_privilege('authenticated', 'public.bcp_invitations', 'SELECT'),
    'BC9.3 anon reaches nothing new, the core is internal, and invitation rows are not readable');
END $$;

ROLLBACK;
