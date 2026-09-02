-- LOCAL-ONLY fixture for walking the Interview Context Bridge in a browser.
--
-- Everything here is synthetic and lives on one laptop behind localhost. It
-- creates no production account and touches no hosted project.
--
-- ── WHAT IT PREPARES, AND WHY EACH PIECE IS NEEDED ──────────────────────
--
-- The bridge's whole job is to carry four kinds of context into the interview,
-- so walking it needs an application that HAS all four -- and, just as
-- importantly, applications that are missing one, so the absent states can be
-- seen rather than assumed.
--
--   1. A signable owner for the tenant that already holds a RELEASED
--      assessment, so the assessment half of the briefing can be seen at all.
--   2. Structured requirements on that tenant's advert, because the
--      requirement half reads jobs.requirements and an advert with none
--      proves nothing either way.
--
-- It deliberately does NOT create the released assessment itself. That
-- snapshot is written by scp_release_attempt_report, and a hand-built one
-- would prove the briefing can render a payload this file wrote rather than
-- one the product produced. Where the local dataset has no released
-- assessment, the walk says so and skips that scenario.
--
-- Run against the LOCAL stack only:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f <this file>

\set ON_ERROR_STOP on

DO $$
BEGIN
  -- Same refusal as scripts/fixtures/interview-journey-fixture.sql. A fixture
  -- that sets sign-in credentials must not be capable of running by accident
  -- against a database holding real people.
  IF current_setting('server_version_num')::int > 0
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'SCP_IV_FIXTURE_WRONG_DATABASE: this fixture sets sign-in credentials and runs only against the local development database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A usable password for the tenant that holds a released assessment.
-- ---------------------------------------------------------------------------
-- GoTrue scans the token columns as non-nullable strings, so they must be ''
-- rather than NULL. Leaving them NULL produces a 500 on sign-in with the
-- unhelpful message "Database error querying schema" -- the same trap the
-- journey fixture documents, repeated here because this file may be run
-- without that one.
UPDATE auth.users
   SET encrypted_password     = crypt('LocalJourney!2026', gen_salt('bf')),
       email_confirmed_at     = coalesce(email_confirmed_at, now()),
       confirmation_token     = coalesce(confirmation_token, ''),
       recovery_token         = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       email_change           = coalesce(email_change, ''),
       phone_change           = coalesce(phone_change, ''),
       phone_change_token     = coalesce(phone_change_token, ''),
       reauthentication_token = coalesce(reauthentication_token, '')
 WHERE email = 'uiowner@local.test';

-- ---------------------------------------------------------------------------
-- 2. Structured requirements on the advert the walk reads.
-- ---------------------------------------------------------------------------
-- Exercises all three shapes the briefing renders: free-text requirements, a
-- formal requirement, and the flags that become one line each.
UPDATE public.jobs
   SET requirements = '["Erfarenhet av incidenthantering i publik miljö",
                        "Vana att dokumentera händelser skriftligt"]'::jsonb,
       formal_requirement_ids   = ARRAY['Väktarutbildning VU1'],
       language_requirements    = ARRAY['sv', 'en'],
       driving_licence_required = true,
       security_vetting_mentioned = true
 WHERE id = 'aa112222-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 3. A pilot grant for that tenant, and ONLY that tenant.
-- ---------------------------------------------------------------------------
-- The only local pack version is a draft pilot hypothesis, so without a grant
-- scp_iv_create_case refuses -- which is the entitlement control working, and
-- is exactly what the walk observed before this was added. The competitor in
-- interview-journey-fixture.sql still gets none, so the cross-tenant scenario
-- keeps its teeth.
INSERT INTO public.scp_interview_pack_pilot_grants
  (employer_id, pack_version_id, rationale, usage_mode, environment, starts_on, expires_on)
SELECT '11110000-1111-0000-0000-00000000000a', v.id,
       'Lokal genomgang av intervjuunderlaget infor granskning. Inget skarpt bruk.',
       'internal_qa', 'development', current_date - 1, current_date + 14
  FROM public.scp_interview_pack_versions v
 WHERE v.validation_label = 'pilot_hypothesis'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. An ordinary MEMBER of the journey employer.
-- ---------------------------------------------------------------------------
-- The finalisation rule is about the difference between an interviewer and an
-- owner, and that difference cannot be walked with only owners on the stack.
-- interview-journey-fixture.sql creates two owners of two different
-- organisations, which proves cross-tenant denial and says nothing about roles
-- WITHIN one.
--
-- So: a third person, an active member of the journey employer, who may
-- conduct the whole interview and may not lock the report.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change, phone_change_token,
  reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '9e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'interviewer@local.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   -- GoTrue scans these as non-nullable strings; NULL produces a 500 on
   -- sign-in reading "Database error querying schema".
   '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = coalesce(auth.users.email_confirmed_at, now());

INSERT INTO public.employer_memberships (user_id, employer_id, role, status)
VALUES ('9e000000-0000-4000-8000-000000000003',
        '9e000000-0000-4000-8000-00000000000a', 'member', 'active')
ON CONFLICT (user_id, employer_id) DO UPDATE
  SET role = 'member', status = 'active';

-- ---------------------------------------------------------------------------
-- 5. One case walked to REPORT-READY.
-- ---------------------------------------------------------------------------
-- The finalisation defect only shows itself on a case with no blockers: with
-- blockers, everyone sees the blocker list and the question of who may lock
-- the report never arises. So the walk needs one ready case, and the fixture
-- has to produce it or the browser test is not reproducible.
--
-- Walked through the product's OWN governed RPCs -- start session, complete
-- it, open evidence review, record an assessment per question, mark assessed
-- -- rather than by writing rows. Hand-written rows would produce a case that
-- looks ready to a hand-written test and may not be what
-- scp_iv_report_blockers considers ready, which is the only opinion that
-- counts.
--
-- Level 0 with a rationale, deliberately: it is the honest outcome for an
-- interview with no confirmed evidence behind it, it is what the product
-- itself would record, and it needs no fabricated evidence rows. It is not a
-- judgement of anybody -- the case's candidate is synthetic.
DO $$
DECLARE
  _case  uuid := '047ce788-ea6a-4fe2-9fb1-c08c920926db';
  _owner uuid := '9e000000-0000-4000-8000-000000000001';
  _sess  uuid;
  _q     record;
  _status text;
BEGIN
  SELECT status INTO _status FROM public.scp_interview_cases WHERE id = _case;
  IF _status IS NULL THEN
    RAISE NOTICE 'context-bridge fixture: case % not present, skipping the ready-case walk', _case;
    RETURN;
  END IF;
  -- Idempotent: a second run must not try to re-walk a case that is already
  -- past this point, and must not disturb one that has been reported.
  IF _status <> 'prep_approved' THEN
    RAISE NOTICE 'context-bridge fixture: case % is "%", ready-case walk skipped', _case, _status;
    RETURN;
  END IF;

  -- The RPCs are SECURITY DEFINER and read auth.uid(); they must be called as
  -- somebody. The journey owner is the person who would really have done this.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _owner::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  _sess := public.scp_iv_start_session(_case, 'Lokal genomgang');
  PERFORM public.scp_iv_set_session_state(_sess, 'completed', NULL, NULL, NULL);
  PERFORM public.scp_iv_begin_evidence_review(_case);

  FOR _q IN
    SELECT cq.id FROM public.scp_interview_core_questions cq
     JOIN public.scp_interview_cases c ON c.pack_version_id = cq.pack_version_id
    WHERE c.id = _case ORDER BY cq.display_order
  LOOP
    PERFORM public.scp_iv_record_assessment(_case, _q.id, 0,
      'Lokalt underlag: otillracklig evidens for att uttala sig.', NULL, NULL);
  END LOOP;

  PERFORM public.scp_iv_mark_assessed(_case);
  RESET ROLE;
END $$;

COMMIT;

DO $$
DECLARE _released int; _pw int; _reqs int; _member int; _blockers int; _ready text;
BEGIN
  SELECT count(*) INTO _pw FROM auth.users
   WHERE email = 'uiowner@local.test' AND encrypted_password IS NOT NULL;
  SELECT coalesce(jsonb_array_length(requirements), 0) INTO _reqs
    FROM public.jobs WHERE id = 'aa112222-0000-0000-0000-000000000001';
  SELECT count(*) INTO _released FROM public.scp_report_snapshots
   WHERE audience = 'employer' AND released_at IS NOT NULL
     AND brief -> 'interview_guide' IS NOT NULL;
  SELECT count(*) INTO _member FROM public.employer_memberships
   WHERE employer_id = '9e000000-0000-4000-8000-00000000000a'
     AND role = 'member' AND status = 'active';

  -- Reported rather than assumed: the walk above is the only part of this
  -- file that can fail quietly, and "the browser test has a ready case" is
  -- the claim it exists to make.
  --
  -- Read AS THE OWNER. scp_iv_report_blockers is membership-scoped and returns
  -- a single NOT_PERMITTED row to anyone else -- including the postgres
  -- superuser this file otherwise runs as, whose auth.uid() is NULL. Counting
  -- that row as a blocker would report a healthy fixture as broken.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '9e000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
    true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _blockers
    FROM public.scp_iv_report_blockers('047ce788-ea6a-4fe2-9fb1-c08c920926db');
  RESET ROLE;

  _ready := CASE WHEN _blockers = 0 THEN 'READY (0 blockers)'
                 ELSE format('NOT READY (%s blockers)', _blockers) END;

  RAISE NOTICE
    'context-bridge fixture ready: % signable owner, % advert requirements, % released brief(s) carrying a governed interview guide, % ordinary member(s) of the journey employer, finalisation case %',
    _pw, _reqs, _released, _member, _ready;
END $$;
