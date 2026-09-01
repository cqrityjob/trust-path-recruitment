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

COMMIT;

DO $$
DECLARE _released int; _pw int; _reqs int;
BEGIN
  SELECT count(*) INTO _pw FROM auth.users
   WHERE email = 'uiowner@local.test' AND encrypted_password IS NOT NULL;
  SELECT coalesce(jsonb_array_length(requirements), 0) INTO _reqs
    FROM public.jobs WHERE id = 'aa112222-0000-0000-0000-000000000001';
  SELECT count(*) INTO _released FROM public.scp_report_snapshots
   WHERE audience = 'employer' AND released_at IS NOT NULL
     AND brief -> 'interview_guide' IS NOT NULL;

  RAISE NOTICE
    'context-bridge fixture ready: % signable owner, % advert requirements, % released brief(s) carrying a governed interview guide',
    _pw, _reqs, _released;
END $$;
