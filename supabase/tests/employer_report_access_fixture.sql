-- Shared fixture for the employer report access suites (included with \ir; it opens
-- no transaction and ends none: the including suite owns BEGIN ... ROLLBACK).
--
--   employer_report_access_matrix_test.sql   actor x read, release, finalise, offboarding
--   employer_report_access_model_test.sql    the model itself: scope, subject, lists, counts
--   interview_case_access_model_test.sql     Interview Intelligence
--
-- Everything is built through the governed functions, as the product builds it, and is
-- fully synthetic.
--
-- ── THE CAST ────────────────────────────────────────────────────────────────
--   e / x      organisation A (active) / an unrelated organisation B
--   ow, ad     owner, admin of A                        (R1)
--   gr         member of A, reviewer grant: workforce + recruitment
--   gw         member of A, reviewer grant: workforce only
--   gc         member of A, reviewer grant: recruitment only
--   pm         plain member of A: no grant, no vacancy
--   r1, r2     plain members of A: the named responsible recruiter of vacancy V1 / V2   (R3)
--   sm         ADMIN of A, who is also the SUBJECT of a recruitment assessment on V1
--   sg         member of A with both grants, who is also the SUBJECT of a workforce assessment
--   cr, pn     plain members of A: the creator of interview case A; on its panel         (R4)
--   su, rv, rmm  admin suspended, admin removed, member removed
--   xo         owner of B
--   pa         platform admin who is not a member of A
--   p, p2      the workforce candidates (participants)
--   c1, c2, c3 the recruitment applicants (V1, V2, V2)
--
-- ── THE ATTEMPTS (every one released by the owner unless stated) ───────────
--   workforce       r1 (p)   w (p, waiting for review)   r2 (p, released by the admin)   r3 (p2)   ws (sg)
--   recruitment V1  v1 (c1)  vs (sm)
--   recruitment V2  v2 (c1's colleague c2)   v2w (c3, waiting for review)
--
-- ── THE INTERVIEW CASES ──────────────────────────────────────────────────
--   c0  opened by the owner, no vacancy (the matrix's original case)
--   cA  opened by cr about c1, on V1, with a panel of pn and the owner
--   cB  opened by the owner about sm, on V1
--
-- auth.uid() resolves from request.jwt.claim.sub.

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key, CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- ── Cast ────────────────────────────────────────────────────────────────
CREATE TEMP TABLE rm AS SELECT
  'e5a00000-1111-4000-8000-000000000001'::uuid AS e,
  'e5a00000-1111-4000-8000-000000000002'::uuid AS x,
  'e5a00000-0000-4000-8000-000000000001'::uuid AS ow,
  'e5a00000-0000-4000-8000-000000000002'::uuid AS ad,
  'e5a00000-0000-4000-8000-000000000003'::uuid AS gr,
  'e5a00000-0000-4000-8000-000000000004'::uuid AS pm,
  'e5a00000-0000-4000-8000-000000000005'::uuid AS su,
  'e5a00000-0000-4000-8000-000000000006'::uuid AS rv,
  'e5a00000-0000-4000-8000-000000000007'::uuid AS rmm,
  'e5a00000-0000-4000-8000-000000000008'::uuid AS xo,
  'e5a00000-0000-4000-8000-000000000009'::uuid AS pa,
  'e5a00000-0000-4000-8000-00000000000a'::uuid AS p,
  'e5a00000-0000-4000-8000-00000000000b'::uuid AS p2,
  'e5a00000-0000-4000-8000-00000000000c'::uuid AS gw,
  'e5a00000-0000-4000-8000-00000000000d'::uuid AS gc,
  'e5a00000-0000-4000-8000-00000000000e'::uuid AS r1,
  'e5a00000-0000-4000-8000-00000000000f'::uuid AS r2,
  'e5a00000-0000-4000-8000-000000000010'::uuid AS sm,
  'e5a00000-0000-4000-8000-000000000011'::uuid AS sg,
  'e5a00000-0000-4000-8000-000000000012'::uuid AS cr,
  'e5a00000-0000-4000-8000-000000000013'::uuid AS pn,
  'e5a00000-0000-4000-8000-000000000014'::uuid AS c1,
  'e5a00000-0000-4000-8000-000000000015'::uuid AS c2,
  'e5a00000-0000-4000-8000-000000000016'::uuid AS c3,
  'e5a00000-2222-4000-8000-000000000001'::uuid AS emp,
  'e5a00000-2222-4000-8000-000000000002'::uuid AS emp2,
  'e5a00000-2222-4000-8000-000000000003'::uuid AS emp3,
  'e5a00000-3333-4000-8000-000000000001'::uuid AS j1,
  'e5a00000-3333-4000-8000-000000000002'::uuid AS j2,
  'e5a00000-4444-4000-8000-000000000001'::uuid AS ap1,   -- c1 on V1
  'e5a00000-4444-4000-8000-000000000002'::uuid AS ap2,   -- c2 on V2
  'e5a00000-4444-4000-8000-000000000003'::uuid AS aps,   -- sm on V1
  'e5a00000-4444-4000-8000-000000000004'::uuid AS ap3;   -- c3 on V2
GRANT SELECT ON rm TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT ow,  'rm-owner@test.invalid' FROM rm UNION ALL
SELECT ad,  'rm-admin@test.invalid' FROM rm UNION ALL
SELECT gr,  'rm-reviewer@test.invalid' FROM rm UNION ALL
SELECT pm,  'rm-member@test.invalid' FROM rm UNION ALL
SELECT su,  'rm-suspended@test.invalid' FROM rm UNION ALL
SELECT rv,  'rm-removed-admin@test.invalid' FROM rm UNION ALL
SELECT rmm, 'rm-removed-member@test.invalid' FROM rm UNION ALL
SELECT xo,  'rm-other-owner@test.invalid' FROM rm UNION ALL
SELECT pa,  'rm-platform-admin@test.invalid' FROM rm UNION ALL
SELECT p,   'rm-candidate@test.invalid' FROM rm UNION ALL
SELECT p2,  'rm-candidate-two@test.invalid' FROM rm UNION ALL
SELECT gw,  'rm-reviewer-wf@test.invalid' FROM rm UNION ALL
SELECT gc,  'rm-reviewer-rc@test.invalid' FROM rm UNION ALL
SELECT r1,  'rm-recruiter-one@test.invalid' FROM rm UNION ALL
SELECT r2,  'rm-recruiter-two@test.invalid' FROM rm UNION ALL
SELECT sm,  'rm-subject-admin@test.invalid' FROM rm UNION ALL
SELECT sg,  'rm-subject-reviewer@test.invalid' FROM rm UNION ALL
SELECT cr,  'rm-case-creator@test.invalid' FROM rm UNION ALL
SELECT pn,  'rm-panel-member@test.invalid' FROM rm UNION ALL
SELECT c1,  'rm-applicant-one@test.invalid' FROM rm UNION ALL
SELECT c2,  'rm-applicant-two@test.invalid' FROM rm UNION ALL
SELECT c3,  'rm-applicant-three@test.invalid' FROM rm;
INSERT INTO public.user_roles (user_id, role) SELECT pa, 'admin' FROM rm;
INSERT INTO public.employers (id, name, slug, status)
SELECT e, 'RM Company A', 'rm-company-a', 'active' FROM rm UNION ALL
SELECT x, 'RM Company B', 'rm-company-b', 'active' FROM rm;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, ow,  'owner',  'active' FROM rm UNION ALL
SELECT e, ad,  'admin',  'active' FROM rm UNION ALL
SELECT e, gr,  'member', 'active' FROM rm UNION ALL
SELECT e, pm,  'member', 'active' FROM rm UNION ALL
SELECT e, su,  'admin',  'active' FROM rm UNION ALL
SELECT e, rv,  'admin',  'active' FROM rm UNION ALL
SELECT e, rmm, 'member', 'active' FROM rm UNION ALL
SELECT e, gw,  'member', 'active' FROM rm UNION ALL
SELECT e, gc,  'member', 'active' FROM rm UNION ALL
SELECT e, r1,  'member', 'active' FROM rm UNION ALL
SELECT e, r2,  'member', 'active' FROM rm UNION ALL
SELECT e, sm,  'admin',  'active' FROM rm UNION ALL
SELECT e, sg,  'member', 'active' FROM rm UNION ALL
SELECT e, cr,  'member', 'active' FROM rm UNION ALL
SELECT e, pn,  'member', 'active' FROM rm UNION ALL
SELECT x, xo,  'owner',  'active' FROM rm;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e, gr, ARRAY['workforce','recruitment']::text[], ow FROM rm UNION ALL
SELECT e, gw, ARRAY['workforce']::text[], ow FROM rm UNION ALL
SELECT e, gc, ARRAY['recruitment']::text[], ow FROM rm UNION ALL
SELECT e, sg, ARRAY['workforce','recruitment']::text[], ow FROM rm;
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by)
SELECT emp,  e, 'RM', 'Deltagare', 'rm-candidate@test.invalid', 'active', ow FROM rm UNION ALL
SELECT emp2, e, 'RM', 'Deltagare Två', 'rm-candidate-two@test.invalid', 'active', ow FROM rm UNION ALL
SELECT emp3, e, 'RM', 'Granskare', 'rm-subject-reviewer@test.invalid', 'active', ow FROM rm;
INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
SELECT e, 'Employer report access suites', ow FROM rm;

-- The two assessments: a workforce baseline, and the recruitment test.
CREATE TEMP TABLE rmv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON rmv TO PUBLIC;
CREATE TEMP TABLE rmq AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON rmq TO PUBLIC;
INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT e, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM rmv),
       'Employer report access suites', ow, now() + interval '30 days' FROM rm
UNION ALL
SELECT e, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM rmq),
       'Employer report access suites (recruitment)', ow, now() + interval '30 days' FROM rm;

-- Offboarding goes through the real function, as a platform administrator: the
-- one the member controls on the admin organisation page call.
CREATE OR REPLACE FUNCTION pg_temp.set_status(_uid uuid, _status text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT pa FROM rm)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT u.status INTO _r FROM public.update_employer_membership(
    (SELECT m.id FROM public.employer_memberships m
      WHERE m.employer_id = (SELECT e FROM rm) AND m.user_id = _uid), NULL, _status) u;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- ── Two vacancies, three applications, and who answers for each ───────────
-- Publishing is moderation-owned, so the jobs are created as a platform admin.
DO $$
DECLARE _pa uuid := (SELECT pa FROM rm);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _pa::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en,
                           application_method, status, published_at, expires_at)
  SELECT j1, 'rm-vaktare-ett', 'RM0001', e, 'Väktare, vakans ett', 'Security Officer, vacancy one',
         'internal', 'published', now() - interval '1 day', now() + interval '30 days' FROM rm
  UNION ALL
  SELECT j2, 'rm-vaktare-tva', 'RM0002', e, 'Väktare, vakans två', 'Security Officer, vacancy two',
         'internal', 'published', now() - interval '1 day', now() + interval '30 days' FROM rm;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT ap1, j1, e, c1, 'submitted', now() FROM rm UNION ALL
SELECT ap2, j2, e, c2, 'submitted', now() FROM rm UNION ALL
SELECT aps, j1, e, sm, 'submitted', now() FROM rm UNION ALL
SELECT ap3, j2, e, c3, 'submitted', now() FROM rm;
-- The named responsible recruiter of each vacancy (what rec_set_recruitment_responsible writes).
INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id)
SELECT j1, e, r1 FROM rm UNION ALL
SELECT j2, e, r2 FROM rm;

-- One sitting: assigned by the owner (to a workforce participant, or from a
-- recruitment application), answered and submitted by the person; when
-- _releaser is given, reviewed by the reviewer and released by them.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt(_pid uuid, _email text, _emp uuid, _releaser uuid,
                                               _application uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT ow FROM rm)::text, true);
  IF _application IS NULL THEN
    SELECT attempt_id INTO _att FROM public.scp_employer_assign(
      (SELECT e FROM rm), (SELECT version_id FROM rmv), _email,
      NULL, 'sv', 'workforce', _emp, NULL);
  ELSE
    SELECT attempt_id INTO _att FROM public.scp_assign_from_application(
      (SELECT e FROM rm), _application, (SELECT version_id FROM rmq));
  END IF;
  PERFORM set_config('request.jwt.claim.sub', _pid::text, true);
  FOR _it IN
    SELECT iv.id AS ivid, iv.item_format,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1) AS a,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS z
      FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_attempts at ON at.id = _att AND at.form_id = fi.form_id
     ORDER BY fi.display_order
  LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL, 'Svar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.a, _it.z, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.a, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
  IF _releaser IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', (SELECT gr FROM rm)::text, true);
    FOR _rv IN
      SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format
        FROM public.scp_human_reviews hr
        JOIN public.scp_candidate_responses r ON r.id = hr.response_id
        JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
       WHERE r.attempt_id = _att AND hr.review_status = 'pending'
    LOOP
      PERFORM public.scp_complete_human_review(_rv.id, 'upheld', 'Inom mandatet.',
        CASE WHEN _rv.is_safety_critical THEN 'no_concern' END,
        pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
    END LOOP;
    PERFORM set_config('request.jwt.claim.sub', _releaser::text, true);
    PERFORM public.scp_release_attempt_report(_att);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _att;
END $$;

-- r1 p released by the owner   w p waiting   r2 p released by the admin   r3 p2   ws sg
-- v1 c1 (V1)   vs sm (V1)   v2 c2 (V2)   v2w c3 (V2, waiting)
CREATE TEMP TABLE rma AS SELECT
  pg_temp.run_attempt((SELECT p FROM rm), 'rm-candidate@test.invalid', (SELECT emp FROM rm), (SELECT ow FROM rm)) AS r1,
  NULL::uuid AS w, NULL::uuid AS r2, NULL::uuid AS r3, NULL::uuid AS ws,
  NULL::uuid AS v1, NULL::uuid AS vs, NULL::uuid AS v2, NULL::uuid AS v2w;
UPDATE rma SET w  = pg_temp.run_attempt((SELECT p FROM rm), 'rm-candidate@test.invalid', (SELECT emp FROM rm), NULL);
UPDATE rma SET r2 = pg_temp.run_attempt((SELECT p FROM rm), 'rm-candidate@test.invalid', (SELECT emp FROM rm), (SELECT ad FROM rm));
UPDATE rma SET r3 = pg_temp.run_attempt((SELECT p2 FROM rm), 'rm-candidate-two@test.invalid', (SELECT emp2 FROM rm), (SELECT ow FROM rm));
UPDATE rma SET ws = pg_temp.run_attempt((SELECT sg FROM rm), 'rm-subject-reviewer@test.invalid', (SELECT emp3 FROM rm), (SELECT ow FROM rm));
UPDATE rma SET v1 = pg_temp.run_attempt((SELECT c1 FROM rm), 'rm-applicant-one@test.invalid', NULL, (SELECT ow FROM rm), (SELECT ap1 FROM rm));
UPDATE rma SET vs = pg_temp.run_attempt((SELECT sm FROM rm), 'rm-subject-admin@test.invalid', NULL, (SELECT ow FROM rm), (SELECT aps FROM rm));
UPDATE rma SET v2 = pg_temp.run_attempt((SELECT c2 FROM rm), 'rm-applicant-two@test.invalid', NULL, (SELECT ow FROM rm), (SELECT ap2 FROM rm));
UPDATE rma SET v2w = pg_temp.run_attempt((SELECT c3 FROM rm), 'rm-applicant-three@test.invalid', NULL, NULL, (SELECT ap3 FROM rm));
GRANT SELECT ON rma TO PUBLIC;
CREATE TEMP TABLE rms AS SELECT
  (SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT r1 FROM rma)) AS s1,
  (SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT v1 FROM rma)) AS sv1,
  (SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT v2 FROM rma)) AS sv2,
  (SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT vs FROM rma)) AS svs,
  (SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT ws FROM rma)) AS sws;
GRANT SELECT ON rms TO PUBLIC;

-- ── The rest of what an organisation holds about a person ────────────────
-- Decisions and attempt-level interview notes (owner/admin write them).
DO $$
DECLARE _o uuid := (SELECT ow FROM rm); _e uuid := (SELECT e FROM rm);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.scp_record_employer_decision((SELECT r1 FROM rma), 'assign_development', 'evidence_thin',
    'Underlaget bygger på en källa.', 'Boka praktiskt moment', 'Driftchef', NULL);
  PERFORM public.scp_record_employer_decision((SELECT v1 FROM rma), 'assign_development', 'evidence_thin',
    'Underlaget bygger på en källa.', 'Boka praktiskt moment', 'Driftchef', NULL);
  PERFORM public.scp_record_employer_decision((SELECT v2 FROM rma), 'assign_development', 'evidence_thin',
    'Underlaget bygger på en källa.', 'Boka praktiskt moment', 'Driftchef', NULL);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.scp_interview_notes (attempt_id, employer_id, area_code, outcome, note, recorded_by)
  VALUES ((SELECT r1 FROM rma), _e, 'situational_judgement', 'additional_context', 'RM-anteckning.', _o),
         ((SELECT v1 FROM rma), _e, 'situational_judgement', 'additional_context', 'RM-anteckning rekrytering.', _o),
         ((SELECT v2 FROM rma), _e, 'situational_judgement', 'additional_context', 'RM-anteckning rekrytering två.', _o);
END $$;
-- Invitations: one workforce, one for each vacancy.
INSERT INTO public.scp_assessment_invitations
  (employer_id, assessment_version_id, email, invited_name, use_case, application_id, job_id, invited_by)
SELECT e, (SELECT version_id FROM rmv), 'rm-invitee-wf@test.invalid', 'Inbjuden arbetsstyrka', 'workforce', NULL::uuid, NULL::uuid, ow FROM rm
UNION ALL
SELECT e, (SELECT version_id FROM rmq), 'rm-invitee-v1@test.invalid', 'Inbjuden vakans ett', 'recruitment', NULL, j1, ow FROM rm
UNION ALL
SELECT e, (SELECT version_id FROM rmq), 'rm-invitee-v2@test.invalid', 'Inbjuden vakans två', 'recruitment', NULL, j2, ow FROM rm;
-- Training (workforce): one assignment to the participant.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT ow FROM rm)::text, true);
  PERFORM public.scp_assign_training(
    (SELECT e FROM rm),
    (SELECT pv.id FROM public.scp_program_versions pv JOIN public.scp_programs pg ON pg.id = pv.program_id
      WHERE pg.slug = 'internal-dev-exercise-situational-reporting'),
    'rm-candidate@test.invalid', 'sv', NULL, NULL, NULL, (SELECT emp FROM rm));
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- ── Interview cases, built through the governed functions ────────────────
CREATE TEMP TABLE rmc (kase uuid, sess uuid, case_a uuid, sess_a uuid, case_b uuid);
DO $$
DECLARE _packv uuid; _case uuid; _plan uuid; _sess uuid; _q uuid; _a uuid; _sa uuid; _b uuid;
  _o uuid := (SELECT ow FROM rm); _e uuid := (SELECT e FROM rm);
  _cr uuid := (SELECT cr FROM rm); _pn uuid := (SELECT pn FROM rm);
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs pk ON pk.id = ver.pack_id
   WHERE pk.slug = 'vaktare-se' AND ver.pilot_availability = 'open' LIMIT 1;
  SELECT id INTO _q FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv ORDER BY display_order LIMIT 1;

  -- c0: opened by the owner, no vacancy.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  _case := public.scp_iv_create_case(_e, 'RM-fall', _packv, 'Kandidat RM.', NULL, 'EXT-RM-1');
  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_case);
  _plan := public.scp_iv_record_manual_prep_plan(_case, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sess := public.scp_iv_start_session(_case, 'Intervju 1');
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_sess, _q, 'observation', 'RM:s konfidentiella anteckning.', _o);

  -- cA: opened by a PLAIN MEMBER, about the applicant of V1, with a panel.
  PERFORM set_config('request.jwt.claim.sub', _cr::text, true);
  _a := public.scp_iv_create_case(_e, 'RM-fall A', _packv, 'Kandidat ett.',
          (SELECT c1 FROM rm), NULL, (SELECT j1 FROM rm), (SELECT ap1 FROM rm));
  PERFORM public.scp_iv_add_source(_a, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_a);
  _plan := public.scp_iv_record_manual_prep_plan(_a, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sa := public.scp_iv_start_session(_a, 'Intervju A');
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_sa, _q, 'observation', 'RM:s ärende A, anteckning.', _cr);
  PERFORM public.scp_iv_panel_open(_a, ARRAY[_pn, _o]);

  -- cB: opened by the owner, about the applicant who is an admin of the organisation.
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  _b := public.scp_iv_create_case(_e, 'RM-fall B', _packv, 'Kandidat som är administratör.',
          (SELECT sm FROM rm), NULL, (SELECT j1 FROM rm), (SELECT aps FROM rm));
  PERFORM public.scp_iv_add_source(_b, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO rmc VALUES (_case, _sess, _a, _sa, _b);
END $$;
GRANT SELECT ON rmc TO PUBLIC;

-- The snapshot table has no client grant -- its policies are reached through
-- scp_report_snapshot_readable and the report functions. To exercise the POLICIES
-- themselves as each principal, authenticated is given SELECT here, inside this
-- transaction; the final ROLLBACK takes it back.
CREATE TEMP TABLE rm_before AS SELECT
  has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') AS auth_select,
  has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT') AS anon_select;
GRANT SELECT ON rm_before TO PUBLIC;
GRANT SELECT ON public.scp_report_snapshots TO authenticated;
