-- LOCAL-ONLY fixture for walking employer process continuity (E1) in a browser.
--
-- Everything here is synthetic and lives on one laptop behind localhost. It
-- creates no production account, touches no hosted project, and contains no
-- real person's name, address or CV.
--
-- ── WHAT IT PREPARES, AND WHY EACH PIECE IS NEEDED ──────────────────────
--
-- E1 is about CONTINUITY, so a walk of it needs one application in each of the
-- states the strip has to tell apart -- and, just as importantly, a process
-- that is NOT linked to an application, because "a standalone process cannot
-- be mistaken for a recruitment-linked one" is not observable with linked data
-- alone.
--
--   E1-A  an application with a linked interview at prep_approved
--         -> the interview is under way and returns to this application
--   E1-B  an application with a linked interview at `assessed` and NO final
--         report row -> report MATERIAL exists and a report does not, which is
--         the distinction the whole phase turns on
--   E1-C  an application with nothing started -> neither process is required
--   E1-D  a standalone interview case, application_id NULL
--
-- It deliberately writes NO report row and NO assessment attempt. A hand-built
-- final report would prove the strip can render a row this file wrote rather
-- than one scp_iv_finalise_report produced; the existing journey case
-- d4a40c8c, which has a real one, is read for that instead and is not touched.
--
-- Idempotent: every insert is ON CONFLICT DO UPDATE, so the walk can be run
-- again without finding its own finished state in the way.
--
-- Run against the LOCAL stack only:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f scripts/fixtures/employer-process-continuity-fixture.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  -- The same refusal the interview fixtures carry. A fixture that writes
  -- applications and interview cases must not be capable of running by
  -- accident against a database holding real people.
  IF current_setting('server_version_num')::int > 0
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'SCP_E1_FIXTURE_WRONG_DATABASE: this fixture writes recruitment records and runs only against the local development database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- Preconditions, asserted rather than assumed.
-- ---------------------------------------------------------------------------
-- This fixture EXTENDS the journey fixture rather than duplicating it: the
-- employer, its owner, its member, its advert and the pilot grant that makes
-- the Vaktare pack startable all come from there. Failing loudly here is much
-- better than inserting rows that reference an employer nobody can sign in to.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employers WHERE id = '9e000000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION
      'SCP_E1_FIXTURE_MISSING_BASE: run scripts/fixtures/interview-journey-fixture.sql first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Three adverts, one per scenario.
-- ---------------------------------------------------------------------------
-- Inserted as DRAFT and then transitioned, because that is the only way the
-- product allows a job to become published: jobs_validate_before_write refuses
-- an INSERT that is already published, and publication is reachable only as a
-- transition off an existing draft. A fixture that bypassed that would be
-- creating a row shape the application cannot produce.
--
-- Not one advert with three applicants: job_applications_active_unique_idx
-- allows one live application per (job, applicant), which is the product being
-- right -- a person applies to a vacancy once. Three adverts is the shape the
-- constraint actually permits, and it also gives each scenario a distinct
-- advertised ROLE, which is what the interview surfaces must show instead of
-- the interview guide's name.
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, title_en, status, application_method,
   requirements)
VALUES
  ('e1000000-0000-4000-8000-00000000ff01',
   '9e000000-0000-4000-8000-00000000000a',
   'e1-vaktare-stationar', 'E1J001',
   'Vaktare, stationar bevakning', 'Security officer, static guarding',
   'draft', 'internal',
   '["Giltig vaktarlegitimation", "God svenska i tal och skrift"]'::jsonb),
  ('e1000000-0000-4000-8000-00000000ff02',
   '9e000000-0000-4000-8000-00000000000a',
   'e1-ordningsvakt-city', 'E1J002',
   'Ordningsvakt, city', 'Public order officer, city centre',
   'draft', 'internal',
   '["Forordnande som ordningsvakt"]'::jsonb),
  ('e1000000-0000-4000-8000-00000000ff03',
   '9e000000-0000-4000-8000-00000000000a',
   'e1-larmoperator', 'E1J003',
   'Larmoperator', 'Alarm operator',
   'draft', 'internal',
   '["Skiftarbete"]'::jsonb)
ON CONFLICT (id) DO UPDATE
   SET title_sv = EXCLUDED.title_sv,
       title_en = EXCLUDED.title_en,
       requirements = EXCLUDED.requirements;

-- The transition the product itself performs. `published_at` is a
-- moderation-owned field the trigger stamps, so it is not sent here.
UPDATE public.jobs
   SET status = 'published',
       expires_at = now() + interval '80 days'
 WHERE id IN ('e1000000-0000-4000-8000-00000000ff01',
              'e1000000-0000-4000-8000-00000000ff02',
              'e1000000-0000-4000-8000-00000000ff03')
   AND status <> 'published';

-- ---------------------------------------------------------------------------
-- Three applications, one synthetic applicant who already exists.
-- ---------------------------------------------------------------------------
-- Nothing here creates a person: an application is a link between a user and a
-- job, and both ends are already in the database.
INSERT INTO public.job_applications
  (id, job_id, employer_id, applicant_user_id, status, cover_note, consent_given_at)
VALUES
  ('e1000000-0000-4000-8000-00000000aa01',
   'e1000000-0000-4000-8000-00000000ff01',
   '9e000000-0000-4000-8000-00000000000a',
   '9e000000-0000-4000-8000-0000000000c1',
   'reviewing',
   'E1-A. Ansokan med pagaende intervju.',
   now()),
  ('e1000000-0000-4000-8000-00000000aa02',
   'e1000000-0000-4000-8000-00000000ff02',
   '9e000000-0000-4000-8000-00000000000a',
   '9e000000-0000-4000-8000-0000000000c1',
   'reviewing',
   'E1-B. Ansokan med rapportunderlag.',
   now()),
  ('e1000000-0000-4000-8000-00000000aa03',
   'e1000000-0000-4000-8000-00000000ff03',
   '9e000000-0000-4000-8000-00000000000a',
   '9e000000-0000-4000-8000-0000000000c1',
   'submitted',
   'E1-C. Ansokan utan process.',
   now())
ON CONFLICT (id) DO UPDATE
   SET status = EXCLUDED.status,
       cover_note = EXCLUDED.cover_note;

-- ---------------------------------------------------------------------------
-- Three interview cases: two linked, one deliberately not.
-- ---------------------------------------------------------------------------
-- pack_version_id and role_version_id are read from the pack the journey
-- employer holds a grant for, so this file pins no content of its own and
-- cannot drift from the governed guide.
INSERT INTO public.scp_interview_cases
  (id, employer_id, application_id, job_id, candidate_display_name,
   candidate_user_id, candidate_external_ref, title,
   pack_version_id, role_version_id, status)
SELECT
  v.id,
  '9e000000-0000-4000-8000-00000000000a',
  v.application_id,
  v.job_id,
  v.candidate,
  -- scp_interview_cases_candidate_identity requires EXACTLY ONE of these, and
  -- which one it is is the E1 distinction in the schema itself: a
  -- recruitment-linked case knows the person as a user, a standalone one holds
  -- only an opaque reference the employer chose.
  v.candidate_user_id,
  v.candidate_ref,
  v.title,
  c.pack_version_id,
  c.role_version_id,
  v.status
FROM (VALUES
  -- E1-A: under way, and it must return to application a1.
  ('e1000000-0000-4000-8000-00000000cc01'::uuid,
   'e1000000-0000-4000-8000-00000000aa01'::uuid,
   'e1000000-0000-4000-8000-00000000ff01'::uuid,
   'E1 Kandidat A',
   '9e000000-0000-4000-8000-0000000000c1'::uuid, NULL::text,
   'E1 · kopplad intervju', 'prep_approved'),
  -- E1-B: assessed. Report MATERIAL exists; no report row is written, which is
  -- precisely the state the phase exists to stop describing as a report.
  ('e1000000-0000-4000-8000-00000000cc02'::uuid,
   'e1000000-0000-4000-8000-00000000aa02'::uuid,
   'e1000000-0000-4000-8000-00000000ff02'::uuid,
   'E1 Kandidat B',
   '9e000000-0000-4000-8000-0000000000c1'::uuid, NULL::text,
   'E1 · rapportunderlag', 'assessed'),
  -- E1-D: standalone. application_id and job_id are NULL ON PURPOSE.
  ('e1000000-0000-4000-8000-00000000cc03'::uuid,
   NULL::uuid, NULL::uuid,
   'E1 Fristaende',
   NULL::uuid, 'E1-EXT-0001',
   'E1 · fristaende intervju', 'draft')
) AS v(id, application_id, job_id, candidate, candidate_user_id, candidate_ref, title, status)
CROSS JOIN LATERAL (
  SELECT pack_version_id, role_version_id
    FROM public.scp_interview_cases
   WHERE employer_id = '9e000000-0000-4000-8000-00000000000a'
   ORDER BY created_at
   LIMIT 1
) AS c
ON CONFLICT (id) DO UPDATE
   SET status = EXCLUDED.status,
       application_id = EXCLUDED.application_id,
       job_id = EXCLUDED.job_id,
       title = EXCLUDED.title;

-- The E1-B case must have NO final report. Asserted rather than assumed: a
-- previous run of an unrelated walk could have finalised it, and the whole
-- point of the state would then be gone without anybody noticing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scp_interview_reports
     WHERE case_id = 'e1000000-0000-4000-8000-00000000cc02' AND status = 'final'
  ) THEN
    RAISE EXCEPTION
      'SCP_E1_FIXTURE_STATE: the report-material case has a finalised report; the material-vs-report walk would prove nothing.';
  END IF;
END $$;

COMMIT;

\echo 'OK: E1 continuity fixture applied.'
\echo '    a1 linked + interview under way, a2 linked + report material,'
\echo '    a3 linked + nothing started, c3 standalone.'
