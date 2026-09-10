-- LOCAL-ONLY fixture for walking the employer final report (E4) in a browser.
--
-- Everything here is synthetic and lives on one laptop behind localhost. It
-- creates no production account, touches no hosted project, and contains no
-- real person's name, address, CV or Passport.
--
-- ── WHAT IT PREPARES, AND WHY EACH PIECE IS NEEDED ──────────────────────
--
-- E4 is about ONE authorised human finalising a canonical, immutable employer
-- report from reviewed material. The browser evidence has to show each state
-- the source review named, so the case has to carry each of them:
--
--   * TWO assessors on the same question, at different levels, the second
--     written physically first -- so the page has to show both, state the
--     disagreement, and cannot have chosen one by heap order.
--   * A Passport disclosure holding one SELF-DECLARED claim and one GENUINELY
--     VERIFIED claim, both confirmed as evidence -- so the page has to
--     classify both as a disclosure the candidate shared, and call neither
--     "verified material" on the strength of its source alone.
--   * A RELEASED employer assessment document on the application, and a
--     second attempt with no document -- so the page has to show the bound
--     result with its findings for one and say "not released" for the other.
--   * An UNRESOLVED DIFFERENCE finding -- so the page has to carry it as
--     open material rather than resolve it.
--
-- Two cases are walked, identically: one for the Swedish desktop captures and
-- one for the English mobile captures. A finalised case offers no preview, so
-- the second walk cannot be captured on a case the first walk finalised.
--
-- The walk goes through the product's OWN governed RPCs -- create case, add
-- sources, approve the plan, run and complete a session, confirm evidence,
-- record assessments, mark assessed -- rather than writing rows. Superuser
-- plumbing is used for exactly the pieces the RPCs cannot produce and this
-- fixture is not testing: the second assessor's row, evidence linked to a
-- Passport passage, the released snapshot and the finding. Each is marked.
--
-- It deliberately writes NO report row. A hand-built final report would prove
-- the screen can render a row this file wrote rather than one
-- scp_iv_finalise_report produced; the browser walk finalises for real.
--
-- Idempotent: a second run finds the cases by title and leaves them alone.
--
-- Run against the LOCAL stack only, after the journey fixture:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f scripts/fixtures/interview-journey-fixture.sql
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f scripts/fixtures/employer-final-report-fixture.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  -- The same refusal the interview fixtures carry. A fixture that creates a
  -- sign-in credential and recruitment records must not be capable of
  -- running by accident against a database holding real people.
  IF current_setting('server_version_num')::int > 0
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'SCP_E4_FIXTURE_WRONG_DATABASE: this fixture creates a sign-in credential and runs only against the local development database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- Preconditions, asserted rather than assumed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employers WHERE id = '9e000000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION
      'SCP_E4_FIXTURE_MISSING_BASE: run scripts/fixtures/interview-journey-fixture.sql first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Two more people: an ordinary MEMBER of the journey employer (a second
--    assessor, and the person who may not finalise), and a CANDIDATE with a
--    login and no seat anywhere (the person who must be denied).
-- ---------------------------------------------------------------------------
-- GoTrue scans the token columns as non-nullable strings, so they must be ''
-- rather than NULL. Leaving them NULL produces a 500 on sign-in with the
-- unhelpful message "Database error querying schema".
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '9e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'interviewer@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Intervjuare Testare"}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'e4000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated',
   'kandidat@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"E4 Kandidat"}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('9e000000-0000-4000-8000-000000000003', '9e000000-0000-4000-8000-000000000003',
   '{"sub":"9e000000-0000-4000-8000-000000000003","email":"interviewer@local.test","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('e4000000-0000-4000-8000-0000000000c1', 'e4000000-0000-4000-8000-0000000000c1',
   '{"sub":"e4000000-0000-4000-8000-0000000000c1","email":"kandidat@local.test","email_verified":true}'::jsonb,
   'email', now(), now(), now())
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('9e000000-0000-4000-8000-000000000003', '9e000000-0000-4000-8000-00000000000a', 'member', 'active')
ON CONFLICT (user_id, employer_id) DO UPDATE SET status = 'active', role = EXCLUDED.role;

-- The owner has a display name, so the finalising actor renders as a person.
-- The member deliberately has none, so the version list's fallback to the
-- account address is exercised. UPSERT: the sign-up trigger may already have
-- written a profile row.
INSERT INTO public.profiles (id, display_name) VALUES
  ('9e000000-0000-4000-8000-000000000001', 'Journey Testare')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- ---------------------------------------------------------------------------
-- 2. Two adverts and two applications, one per walk.
-- ---------------------------------------------------------------------------
-- Inserted as DRAFT and transitioned to published, because that is the only
-- shape the product allows a published advert to take.
-- published_at is moderation-owned: the transition sets it, this file does not.
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status,
                         application_method, requirements)
VALUES
  ('e4000000-0000-4000-8000-00000000ff01', '9e000000-0000-4000-8000-00000000000a',
   'e4-vaktare-vast', 'E4J001', 'Väktare Väst', 'Guard West', 'draft', 'internal',
   '["Giltig väktarlegitimation", "Erfarenhet av stationär bevakning"]'::jsonb),
  ('e4000000-0000-4000-8000-00000000ff02', '9e000000-0000-4000-8000-00000000000a',
   'e4-vaktare-ost', 'E4J002', 'Väktare Öst', 'Guard East', 'draft', 'internal',
   '["Giltig väktarlegitimation", "Erfarenhet av stationär bevakning"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
UPDATE public.jobs
   SET status = 'published', expires_at = now() + interval '80 days'
 WHERE id IN ('e4000000-0000-4000-8000-00000000ff01', 'e4000000-0000-4000-8000-00000000ff02')
   AND status <> 'published';

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES
  ('e4000000-0000-4000-8000-00000000aa01', 'e4000000-0000-4000-8000-00000000ff01',
   '9e000000-0000-4000-8000-00000000000a', 'e4000000-0000-4000-8000-0000000000c1', now()),
  ('e4000000-0000-4000-8000-00000000aa02', 'e4000000-0000-4000-8000-00000000ff02',
   '9e000000-0000-4000-8000-00000000000a', 'e4000000-0000-4000-8000-0000000000c1', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The assessment the process ran on: a released employer document on each
--    application, and a second attempt with none. Superuser plumbing; the
--    release path has its own suites.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_subjects (id) VALUES ('e4000000-0000-4000-8000-00000000ee01')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.scp_subject_identities (subject_id, user_id)
VALUES ('e4000000-0000-4000-8000-00000000ee01', 'e4000000-0000-4000-8000-0000000000c1')
ON CONFLICT DO NOTHING;

WITH fx AS (
  SELECT av.id AS av_id, f.id AS form_id
    FROM public.scp_assessment_versions av
    JOIN public.scp_forms f ON f.assessment_version_id = av.id
   WHERE av.content_status = 'published'
     AND NOT EXISTS (
       SELECT 1 FROM public.scp_form_items fi
         JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
        WHERE fi.form_id = f.id AND iv.mode IS DISTINCT FROM 'assessment')
     AND EXISTS (SELECT 1 FROM public.scp_form_items fi WHERE fi.form_id = f.id)
   ORDER BY f.id LIMIT 1)
SELECT av_id AS e4_avid, form_id AS e4_fid FROM fx \gset

-- One assignment per application, each with two submitted attempts. Inserted
-- attempts never pass through in_progress, so the trigger that clears
-- scp_open on submission never fires; the flag is cleared by hand to the
-- state a real submission leaves, or the one-open-per-subject invariant
-- refuses the second assignment.
CREATE OR REPLACE FUNCTION pg_temp.e4_assignment(_id uuid, _hash text, _app uuid, _job uuid,
                                                _attempt_a uuid, _attempt_b uuid,
                                                _avid uuid, _fid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.assessment_assignments
    (id, employer_id, use_case, recipient_email, recipient_user_id, assigned_by,
     invitation_token_hash, expires_at, scp_assessment_version_id, status)
  VALUES (_id, '9e000000-0000-4000-8000-00000000000a', 'workforce',
          'kandidat@local.test', 'e4000000-0000-4000-8000-0000000000c1',
          '9e000000-0000-4000-8000-000000000001', _hash, now() + interval '30 days',
          _avid, 'started')
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.assessment_assignments
     SET use_case = 'recruitment', application_id = _app, job_id = _job
   WHERE id = _id;
  INSERT INTO public.scp_attempts
    (id, subject_id, issuer_organization_id, assignment_id, mode, form_id,
     assessment_version_id, status, submitted_at)
  VALUES
    (_attempt_a, 'e4000000-0000-4000-8000-00000000ee01', '9e000000-0000-4000-8000-00000000000a',
     _id, 'assessment', _fid, _avid, 'submitted', now()),
    (_attempt_b, 'e4000000-0000-4000-8000-00000000ee01', '9e000000-0000-4000-8000-00000000000a',
     _id, 'assessment', _fid, _avid, 'submitted', now())
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.assessment_assignments SET scp_open = false WHERE id = _id AND scp_open;
END $$;

SELECT pg_temp.e4_assignment('e4000000-0000-4000-8000-00000000a001', 'hash-e4-1',
                             'e4000000-0000-4000-8000-00000000aa01', 'e4000000-0000-4000-8000-00000000ff01',
                             'e4000000-0000-4000-8000-00000000b011', 'e4000000-0000-4000-8000-00000000b012',
                             :'e4_avid'::uuid, :'e4_fid'::uuid);
SELECT pg_temp.e4_assignment('e4000000-0000-4000-8000-00000000a002', 'hash-e4-2',
                             'e4000000-0000-4000-8000-00000000aa02', 'e4000000-0000-4000-8000-00000000ff02',
                             'e4000000-0000-4000-8000-00000000b021', 'e4000000-0000-4000-8000-00000000b022',
                             :'e4_avid'::uuid, :'e4_fid'::uuid);

INSERT INTO public.scp_report_snapshots
  (id, attempt_id, subject_id, issuer_organization_id, report_version_id, audience,
   payload, brief, context, safety_flags)
SELECT s.id, s.attempt_id, 'e4000000-0000-4000-8000-00000000ee01',
       '9e000000-0000-4000-8000-00000000000a', rv.id, 'employer',
       '[{"competency_code":"SAK-01","maturity_level":"developing","threshold_version":"v1"},
         {"competency_code":"KOM-02","maturity_level":"established","threshold_version":"v1"}]'::jsonb,
       '{"observed":[{"area":"SAK-01","signal":"developing","mean":0.42,"spread":0.1}],"executive_summary":{"sv":"Lokal fixtur."}}'::jsonb,
       '{"personContext":"candidate"}'::jsonb,
       '[{"finding":"Fördröjd eskalering i scenario 2.","severity":"note","observed_at":"2026-09-01T00:00:00Z","behaviour_version_id":"internal"}]'::jsonb
  FROM (VALUES
         ('e4000000-0000-4000-8000-00000000c011'::uuid, 'e4000000-0000-4000-8000-00000000b011'::uuid),
         ('e4000000-0000-4000-8000-00000000c021'::uuid, 'e4000000-0000-4000-8000-00000000b021'::uuid)
       ) AS s(id, attempt_id)
  CROSS JOIN (SELECT rv.id FROM public.scp_report_versions rv WHERE rv.audience = 'employer'
               ORDER BY rv.report_key, rv.version_number LIMIT 1) rv
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. The Passport disclosure: one self-declared claim, one verified claim,
--    shared to each application.
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, title, assertion_level, lifecycle_state,
                              verified_by_user_id, verified_at)
VALUES
  ('e4000000-0000-4000-8000-00000000d001', 'e4000000-0000-4000-8000-0000000000c1',
   'training', 'Självdeklarerad kurs', 'self_declared', 'active', NULL, NULL),
  ('e4000000-0000-4000-8000-00000000d002', 'e4000000-0000-4000-8000-0000000000c1',
   'certification', 'Verifierat certifikat', 'verified', 'active',
   '9e000000-0000-4000-8000-000000000002', now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sp_disclosures (id, holder_user_id, package_code, purpose, application_id, expires_at)
VALUES
  ('e4000000-0000-4000-8000-00000000d101', 'e4000000-0000-4000-8000-0000000000c1',
   'verified_qualifications', 'recruitment', 'e4000000-0000-4000-8000-00000000aa01',
   now() + interval '30 days'),
  ('e4000000-0000-4000-8000-00000000d102', 'e4000000-0000-4000-8000-0000000000c1',
   'verified_qualifications', 'recruitment', 'e4000000-0000-4000-8000-00000000aa02',
   now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sp_disclosure_items (disclosure_id, claim_id) VALUES
  ('e4000000-0000-4000-8000-00000000d101', 'e4000000-0000-4000-8000-00000000d001'),
  ('e4000000-0000-4000-8000-00000000d101', 'e4000000-0000-4000-8000-00000000d002'),
  ('e4000000-0000-4000-8000-00000000d102', 'e4000000-0000-4000-8000-00000000d001'),
  ('e4000000-0000-4000-8000-00000000d102', 'e4000000-0000-4000-8000-00000000d002')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Two cases, each walked to ASSESSED through the governed RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.e4_walk(
  _title text, _job uuid, _app uuid, _disclosure uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  _owner  uuid := '9e000000-0000-4000-8000-000000000001';
  _member uuid := '9e000000-0000-4000-8000-000000000003';
  _packv uuid; _q1 uuid; _q2 uuid; _case uuid; _sess uuid; _note uuid; _plan uuid; _q uuid;
  _src uuid; _pp1 uuid; _pp2 uuid;
BEGIN
  -- Idempotent: a second run finds the case by title and leaves it alone.
  SELECT id INTO _case FROM public.scp_interview_cases
   WHERE employer_id = '9e000000-0000-4000-8000-00000000000a' AND title = _title
   ORDER BY created_at DESC LIMIT 1;
  IF _case IS NOT NULL THEN
    RAISE NOTICE 'final-report fixture: case "%" already present as %, walk skipped', _title, _case;
    RETURN _case;
  END IF;

  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';
  SELECT id INTO _q1 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q1';
  SELECT id INTO _q2 FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv AND code = 'Q2';

  -- The RPCs are SECURITY DEFINER and read auth.uid(); they must be called as
  -- somebody. The journey owner is the person who would really have done this.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _owner::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SET LOCAL ROLE authenticated;

  _case := public.scp_iv_create_case('9e000000-0000-4000-8000-00000000000a',
             _title, _packv, 'E4 Kandidat',
             'e4000000-0000-4000-8000-0000000000c1', NULL, _job, _app);
  PERFORM public.scp_iv_add_source(_case, 'employer_requirements', 'Kravprofil',
    E'Väktarutbildning. Erfarenhet av stationär bevakning.', 'recruitment_interview',
    'Berättigat intresse.');
  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare, stationär bevakning, kvällar och helger.', 'recruitment_interview',
    'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_case);
  _plan := public.scp_iv_record_manual_prep_plan(_case, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sess := public.scp_iv_start_session(_case, 'Journey Testare och Intervjuare Testare');
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_sess, _q1, 'observation', 'Kandidaten kontrollerade dörren innan larm.', auth.uid())
  RETURNING id INTO _note;
  PERFORM public.scp_iv_set_session_state(_sess, 'completed', 'evaluation', 'Höll strukturen.');

  -- Evidence confirmed FROM a note: the interviewer-observation case. And one
  -- the candidate said, confirmed from the account.
  PERFORM public.scp_iv_author_evidence(_case, _q1,
    'Kontrollerade området innan larm.', NULL, NULL, _note);
  PERFORM public.scp_iv_author_evidence(_case, _q1,
    'Jag backade ut, låste dörren och larmade.', NULL, NULL, NULL);
  PERFORM public.scp_iv_begin_evidence_review(_case);

  -- Superuser plumbing: the SECOND assessor on Q1, at a different level,
  -- written PHYSICALLY FIRST. A locked assessment refuses even a no-op
  -- UPDATE, so this is the only way to put the heap out of order. The panel
  -- machinery that seats a second assessor has its own suite.
  RESET ROLE;
  INSERT INTO public.scp_interview_assessments
    (case_id, question_id, anchor_id, level, rationale, uncertainty_note, assessor_id, assessed_at, locked_at)
  SELECT _case, _q1, an.id, 2, 'Handlade rätt men tvekade innan larmet gick.', 'Tidslinjen är oklar.',
         _member, now() + interval '4 minutes', now() + interval '4 minutes'
    FROM public.scp_interview_rating_anchors an
   WHERE an.question_id = _q1 AND an.level = 2 LIMIT 1;
  SET LOCAL ROLE authenticated;

  PERFORM public.scp_iv_record_assessment(_case, _q1, 3,
    'Konkret handlande i rätt ordning: backade, låste, larmade.', 'Tidsåtgången är oklar.');
  PERFORM public.scp_iv_record_assessment(_case, _q2, 0,
    'Otillräcklig evidens: frågan besvarades inte konkret.', NULL);
  FOR _q IN SELECT id FROM public.scp_interview_core_questions
             WHERE pack_version_id = _packv AND id NOT IN (_q1, _q2) LOOP
    PERFORM public.scp_iv_record_assessment(_case, _q, 0, 'Frågan hanns inte med; otillräcklig evidens.');
  END LOOP;
  PERFORM public.scp_iv_mark_assessed(_case);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);

  -- ---- Superuser plumbing ------------------------------------------------
  -- (a) A Passport source with two passages, one per claim, and evidence
  --     confirmed from each. The RPC takes a note link, not a passage link;
  --     the product sets source_passage_id through AI-proposal confirmation,
  --     which is not the path under walk. Dated BEFORE the assessments,
  --     because material confirmed after an assessment is -- correctly -- a
  --     blocker.
  INSERT INTO public.scp_interview_case_sources
    (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note,
     disclosure_id, origin, provided_by)
  VALUES (_case, 'passport_disclosure', 'Passport',
          E'Självdeklarerad kurs, ej verifierad.\n\nVerifierat certifikat, verifierat av tredje part.',
          'recruitment_interview', 'Kandidatens delning.', _disclosure, 'candidate_shared', _owner)
  RETURNING id INTO _src;
  INSERT INTO public.scp_interview_source_passages (source_id, passage_index, content)
  VALUES (_src, 1, 'Självdeklarerad kurs, ej verifierad.') RETURNING id INTO _pp1;
  INSERT INTO public.scp_interview_source_passages (source_id, passage_index, content)
  VALUES (_src, 2, 'Verifierat certifikat, verifierat av tredje part.') RETURNING id INTO _pp2;
  INSERT INTO public.scp_interview_evidence
    (case_id, question_id, origin, source_passage_id, excerpt, confirmed_by, confirmed_at)
  VALUES (_case, _q1, 'human_authored', _pp2, 'Verifierat certifikat (Passport).', _owner, now() - interval '2 minutes'),
         (_case, _q1, 'human_authored', _pp1, 'Självdeklarerad kurs (Passport).', _owner, now() - interval '3 minutes');

  -- (b) An unresolved DIFFERENCE between two sources, confirmed by a human
  --     and not resolved -- a difference, never a judgement about honesty.
  INSERT INTO public.scp_interview_findings
    (case_id, finding_kind, statement, rationale, question_id, claim_class,
     resolution_state, human_state, human_actor_id, human_actor_at)
  VALUES (_case, 'contradiction',
          'Anställningsåret för den senaste tjänsten skiljer sig mellan CV och samtal.',
          'Två källor anger olika år. Skillnaden är inte utredd.', _q1, 'ai_inference',
          'unresolved_difference', 'confirmed', _owner, now());

  RETURN _case;
END $$;

-- The two case ids, kept in a table rather than psql variables: psql does not
-- substitute :'name' inside a dollar-quoted DO block.
CREATE TEMP TABLE e4_cases (lang text PRIMARY KEY, id uuid NOT NULL);
INSERT INTO e4_cases
SELECT 'sv', pg_temp.e4_walk('E4 evidens · Väktare Väst',
                             'e4000000-0000-4000-8000-00000000ff01',
                             'e4000000-0000-4000-8000-00000000aa01',
                             'e4000000-0000-4000-8000-00000000d101');
INSERT INTO e4_cases
SELECT 'en', pg_temp.e4_walk('E4 evidence · Guard East',
                             'e4000000-0000-4000-8000-00000000ff02',
                             'e4000000-0000-4000-8000-00000000aa02',
                             'e4000000-0000-4000-8000-00000000d102');

COMMIT;

-- Reported rather than assumed, AS THE OWNER: scp_iv_report_blockers is
-- membership-scoped and returns a single NOT_PERMITTED row to anyone else,
-- the postgres superuser included.
DO $$
DECLARE _sv uuid; _en uuid; _b_sv int; _b_en int; _assessors int;
BEGIN
  SELECT id INTO _sv FROM e4_cases WHERE lang = 'sv';
  SELECT id INTO _en FROM e4_cases WHERE lang = 'en';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '9e000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
    true);
  PERFORM set_config('request.jwt.claim.sub', '9e000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _b_sv FROM public.scp_iv_report_blockers(_sv);
  SELECT count(*) INTO _b_en FROM public.scp_iv_report_blockers(_en);
  RESET ROLE;
  SELECT count(DISTINCT assessor_id) INTO _assessors
    FROM public.scp_interview_assessments WHERE case_id = _sv AND superseded_by IS NULL;
  RAISE NOTICE 'final-report fixture ready: case_sv=% (% blockers), case_en=% (% blockers), % assessors on the Swedish case',
    _sv, _b_sv, _en, _b_en, _assessors;
END $$;

-- The ids the browser walk reads.
SELECT lang, id FROM e4_cases ORDER BY lang;
