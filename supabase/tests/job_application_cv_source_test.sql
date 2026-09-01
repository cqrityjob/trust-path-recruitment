-- =============================================================================
-- Applying with a CQrityjob CV -- boundaries, artefact, and what survives.
--
-- Run against a disposable Postgres with the full migration history replayed
-- (scripts/db-test.sh). Every assertion RAISEs on failure, so a non-zero psql
-- exit means "do not merge".
--
-- ── WHY THESE ASSERTIONS ARE HERE AND NOT IN A SOURCE GUARD ─────────────
--
-- scripts/cv-application-source-check.tsx proves everything that lives in
-- TypeScript: the eligibility rule, the rebuild, the rendered markup, the
-- copy. It cannot prove a boundary. "Candidate A cannot attach candidate B's
-- CV" and "employer A cannot read employer B's application" are properties
-- of RLS and of a SECURITY INVOKER function, and a grep asserting them would
-- be a comfortable lie. So they are EXECUTED here.
--
-- Nor can a source guard prove that a snapshot stays put. A candidate who
-- edits their CV in November must not silently rewrite what an employer read
-- in September -- that is the whole reason the application stores a copy
-- rather than a join, and Group E is the only place it is actually observed.
--
-- Every fixture is synthetic. Runs inside one transaction that is rolled
-- back; no real person, employer, job or CV appears.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- ---------------------------------------------------------------------------
-- Cast
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'anna@synthetic.test'),
  ('a1000000-0000-4000-8000-000000000002', 'bosse@synthetic.test'),
  ('a1000000-0000-4000-8000-000000000003', 'recruiter-a@synthetic.test'),
  ('a1000000-0000-4000-8000-000000000004', 'recruiter-b@synthetic.test'),
  ('a1000000-0000-4000-8000-00000000000a', 'fixture-admin-cvsrc@synthetic.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'Syntetisk Bevakning', 'syntetisk-bev-cvsrc', 'active'),
  ('b1000000-0000-4000-8000-000000000002', 'Annan Bevakning',    'annan-bev-cvsrc',     'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'owner', 'active', now()),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000004', 'owner', 'active', now())
ON CONFLICT DO NOTHING;

-- jobs_validate_before_write only lets a platform admin create a published
-- advertisement directly. The fixture borrows that role for these statements
-- rather than weakening the trigger the rest of the suite relies on.
INSERT INTO public.user_roles (user_id, role)
VALUES ('a1000000-0000-4000-8000-00000000000a', 'admin')
ON CONFLICT DO NOTHING;

SET LOCAL request.jwt.claim.sub = 'a1000000-0000-4000-8000-00000000000a';

INSERT INTO public.jobs (id, employer_id, title_sv, title_en, status, application_method,
                         slug, short_id, published_at, expires_at) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'Väktare', 'Security guard', 'published', 'internal', 'cvsrc-vaktare', 'CVS00001',
   now(), now() + interval '30 days'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001',
   'Ordningsvakt', 'Public order guard', 'published', 'internal', 'cvsrc-ov', 'CVS00002',
   now(), now() + interval '30 days'),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001',
   'Larmoperatör', 'Alarm operator', 'published', 'internal', 'cvsrc-larm', 'CVS00003',
   now(), now() + interval '30 days'),
  ('c1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001',
   'Skyddsvakt', 'Protective guard', 'published', 'internal', 'cvsrc-sky', 'CVS00004',
   now(), now() + interval '30 days'),
  -- Employer B's own advertisement, so the isolation group has a real row on
  -- the other side rather than an absence to misread as a pass.
  ('c1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000002',
   'Receptionist', 'Receptionist', 'published', 'internal', 'cvsrc-recep', 'CVS00005',
   now(), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;

RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- The CVs. Written as the service role so the fixture exists independently of
-- the owner-insert policy, which cv_documents_privacy_test tests on its own
-- terms.
--
--   CV1  Anna's, complete -- and deliberately carrying the two fields the
--        snapshot must strip: a target job advert (which names ANOTHER
--        employer) and a tailoring rationale that quotes it.
--   CV2  Anna's, empty of professional history -- a saved row whose profile
--        emptied out since. Must not be sendable.
--   CV3  Bosse's. Anna must not be able to reach it.
-- ---------------------------------------------------------------------------
INSERT INTO public.cv_documents (id, owner_user_id, title, locale, purpose, origin,
                                 source_bundle, presentation) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'CV för Annan Bevakning', 'sv', 'targeted', 'ai_assisted',
   jsonb_build_object(
     'bundleVersion', 'cv-source-bundle-v1',
     'locale', 'sv',
     'identity', jsonb_build_object('displayName', 'Anna Andersson', 'headline', 'Väktare',
                                    'country', 'Sverige', 'currentProfession', 'Väktare',
                                    'yearsOfExperience', '10+'),
     'employment', jsonb_build_array(jsonb_build_object(
        'id', 'emp-1', 'employerName', 'Bevakning AB', 'roleTitle', 'Väktare',
        'startedOn', '2016-01-01', 'endedOn', NULL, 'employmentType', 'permanent',
        'assertionLevel', 'verified')),
     'education', '[]'::jsonb, 'credentials', '[]'::jsonb,
     'skills', '[]'::jsonb, 'languages', '[]'::jsonb,
     'careerInsight', NULL,
     'targetJobText', 'ANNONS FRÅN ANNAN BEVAKNING AB - ronderande väktare'),
   jsonb_build_object(
     'storedVersion', 'cv-stored-presentation-v1',
     'headline', 'Väktare med tio års erfarenhet',
     'summary', 'Erfaren väktare.',
     'experience', jsonb_build_array(jsonb_build_object('sourceId','emp-1',
        'bullets', jsonb_build_array('Ronderande bevakning i Stockholm.'))),
     'emphasisedClaimIds', '[]'::jsonb,
     'tailoringRationale', 'Anpassat mot Annan Bevakning ABs annons.',
     'authorship', jsonb_build_object('headline','ai','summary','ai',
        'bullets', jsonb_build_object('emp-1','ai')))),

  ('d1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'Tomt CV', 'sv', 'general', 'factual',
   jsonb_build_object(
     'bundleVersion', 'cv-source-bundle-v1', 'locale', 'sv',
     'identity', jsonb_build_object('displayName', 'Anna Andersson', 'headline', NULL,
                                    'country', 'Sverige', 'currentProfession', NULL,
                                    'yearsOfExperience', NULL),
     'employment', '[]'::jsonb, 'education', '[]'::jsonb, 'credentials', '[]'::jsonb,
     'skills', '[]'::jsonb, 'languages', '[]'::jsonb,
     'careerInsight', NULL, 'targetJobText', NULL),
   '{}'::jsonb),

  ('d1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002',
   'Bosses CV', 'sv', 'general', 'factual',
   jsonb_build_object(
     'bundleVersion', 'cv-source-bundle-v1', 'locale', 'sv',
     'identity', jsonb_build_object('displayName', 'Bosse Bergman', 'headline', NULL,
                                    'country', 'Sverige', 'currentProfession', NULL,
                                    'yearsOfExperience', NULL),
     'employment', jsonb_build_array(jsonb_build_object(
        'id', 'emp-b1', 'employerName', 'Bosses Firma', 'roleTitle', 'Väktare',
        'startedOn', '2019-01-01', 'endedOn', NULL, 'employmentType', 'permanent',
        'assertionLevel', 'self_declared')),
     'education', '[]'::jsonb, 'credentials', '[]'::jsonb,
     'skills', '[]'::jsonb, 'languages', '[]'::jsonb,
     'careerInsight', NULL, 'targetJobText', NULL),
   '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════
DO $body$
DECLARE
  _anna   uuid := 'a1000000-0000-4000-8000-000000000001';
  _bosse  uuid := 'a1000000-0000-4000-8000-000000000002';
  _cv1    uuid := 'd1000000-0000-4000-8000-000000000001';
  _cv2    uuid := 'd1000000-0000-4000-8000-000000000002';
  _cv3    uuid := 'd1000000-0000-4000-8000-000000000003';
  _job1   uuid := 'c1000000-0000-4000-8000-000000000001';
  _job2   uuid := 'c1000000-0000-4000-8000-000000000002';
  _job3   uuid := 'c1000000-0000-4000-8000-000000000003';
  _job4   uuid := 'c1000000-0000-4000-8000-000000000004';
  _app1   uuid := 'e1000000-0000-4000-8000-000000000001';
  _app2   uuid := 'e1000000-0000-4000-8000-000000000002';
  _appX   uuid := 'e1000000-0000-4000-8000-0000000000ff';
  _res    jsonb;
  _snap   jsonb;
  _row    public.job_applications%ROWTYPE;
  _n      integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _anna::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _anna, 'role', 'authenticated')::text, true);

  -- =======================================================================
  RAISE NOTICE 'GROUP A - a saved CQrityjob CV becomes the submitted CV';
  -- =======================================================================
  _res := public.sp_submit_application_with_cv_source(
    _app1, _job1, NULL, NULL, NULL, NULL, NULL, 'cqrityjob_cv', _cv1, false);

  PERFORM pg_temp.ok(_res->>'cv_source' = 'cqrityjob_cv',
    'A1 the function reports the source it recorded');

  SELECT * INTO _row FROM public.job_applications WHERE id = _app1;
  PERFORM pg_temp.ok(_row.applicant_user_id = _anna,
    'A2 the application belongs to the applicant');
  PERFORM pg_temp.ok(_row.cv_source = 'cqrityjob_cv',
    'A3 cv_source is recorded on the row');
  PERFORM pg_temp.ok(_row.cv_document_id = _cv1,
    'A4 which saved CV was used is recorded');
  PERFORM pg_temp.ok(_row.cv_document_snapshot IS NOT NULL,
    'A5 the submitted artefact is stored');
  -- No file, and therefore no claim about one.
  PERFORM pg_temp.ok(_row.cv_storage_path IS NULL,
    'A6 no storage path is invented for a CV that is not a file');
  PERFORM pg_temp.ok(_row.cv_mime_type IS NULL,
    'A7 no mime type is claimed about a file that does not exist');
  PERFORM pg_temp.ok(_row.created_at IS NOT NULL,
    'A8 the submission timestamp is recorded');

  _snap := _row.cv_document_snapshot;
  PERFORM pg_temp.ok(_snap->>'snapshot_version' = 'application-cv-snapshot-v1',
    'A9 the artefact names its own contract version');
  PERFORM pg_temp.ok(
    _snap #>> '{source_bundle,identity,displayName}' = 'Anna Andersson',
    'A10 the facts travelled with it');
  PERFORM pg_temp.ok(
    _snap #>> '{source_bundle,employment,0,employerName}' = 'Bevakning AB',
    'A11 the employment history travelled with it');
  PERFORM pg_temp.ok(
    _snap #>> '{presentation,experience,0,bullets,0}' = 'Ronderande bevakning i Stockholm.',
    'A12 the candidate''s own wording travelled with it');
  PERFORM pg_temp.ok(_snap->>'cv_updated_at' IS NOT NULL,
    'A13 WHICH VERSION of the CV was sent is recorded');

  -- =======================================================================
  RAISE NOTICE 'GROUP B - what the artefact must not carry';
  -- =======================================================================
  -- Both of these can quote a DIFFERENT employer's advertisement. Neither is
  -- ever rendered on a CV, and neither is sent.
  PERFORM pg_temp.ok(NOT (_snap->'source_bundle' ? 'targetJobText'),
    'B1 the target job advert is stripped from the submitted bundle');
  PERFORM pg_temp.ok(NOT (_snap->'presentation' ? 'tailoringRationale'),
    'B2 the tailoring rationale is stripped from the submitted presentation');
  PERFORM pg_temp.ok(_snap::text NOT LIKE '%ANNAN BEVAKNING%',
    'B3 no trace of the other employer''s advert survives anywhere in it');

  -- =======================================================================
  RAISE NOTICE 'GROUP C - a candidate can only send their OWN CV';
  -- =======================================================================
  BEGIN
    PERFORM public.sp_submit_application_with_cv_source(
      _appX, _job2, NULL, NULL, NULL, NULL, NULL, 'cqrityjob_cv', _cv3, false);
    RAISE EXCEPTION 'ASSERTION FAILED: C1 Anna attached Bosse''s CV';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    RAISE NOTICE 'ok  C1 another person''s CV cannot be attached';
  END;

  -- And the refusal took the application with it. An application that exists
  -- while its CV does not is the state this whole design refuses.
  SELECT count(*) INTO _n FROM public.job_applications WHERE id = _appX;
  PERFORM pg_temp.ok(_n = 0, 'C2 the refused submission created no application');

  -- A source of cqrityjob_cv with no document is refused rather than stored
  -- as an application claiming a CV it has not got.
  BEGIN
    PERFORM public.sp_submit_application_with_cv_source(
      _appX, _job2, NULL, NULL, NULL, NULL, NULL, 'cqrityjob_cv', NULL, false);
    RAISE EXCEPTION 'ASSERTION FAILED: C3 a CV source with no CV was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  C3 a CQrityjob CV source with no document is refused';
  END;

  -- =======================================================================
  RAISE NOTICE 'GROUP D - an unusable draft cannot masquerade as a CV';
  -- =======================================================================
  BEGIN
    PERFORM public.sp_submit_application_with_cv_source(
      _appX, _job2, NULL, NULL, NULL, NULL, NULL, 'cqrityjob_cv', _cv2, false);
    RAISE EXCEPTION 'ASSERTION FAILED: D1 a CV with no history was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D1 a saved CV with no employment or education is refused';
  END;
  SELECT count(*) INTO _n FROM public.job_applications WHERE id = _appX;
  PERFORM pg_temp.ok(_n = 0, 'D2 that refusal created no application either');

  -- =======================================================================
  RAISE NOTICE 'GROUP E - the employer''s copy does not move under them';
  -- =======================================================================
  -- The candidate rewrites the CV after applying. This is the scenario the
  -- snapshot exists for: the application must show what was sent.
  UPDATE public.cv_documents
     SET source_bundle = jsonb_set(source_bundle,
           '{identity,displayName}', '"Anna Omskriven"'::jsonb),
         presentation = jsonb_set(presentation,
           '{experience,0,bullets,0}', '"Helt annan text."'::jsonb)
   WHERE id = _cv1;

  SELECT cv_document_snapshot INTO _snap FROM public.job_applications WHERE id = _app1;
  PERFORM pg_temp.ok(
    _snap #>> '{source_bundle,identity,displayName}' = 'Anna Andersson',
    'E1 editing the saved CV does not rewrite the submitted one');
  PERFORM pg_temp.ok(
    _snap #>> '{presentation,experience,0,bullets,0}' = 'Ronderande bevakning i Stockholm.',
    'E2 the submitted wording is the wording that was submitted');

  -- Deleting the CV releases the reference and keeps the artefact. A person
  -- clearing out their own drafts must not alter an application somebody has
  -- already acted on.
  DELETE FROM public.cv_documents WHERE id = _cv1;
  SELECT * INTO _row FROM public.job_applications WHERE id = _app1;
  PERFORM pg_temp.ok(_row.id IS NOT NULL,
    'E3 deleting the saved CV does not delete the application');
  PERFORM pg_temp.ok(_row.cv_document_id IS NULL,
    'E4 the live reference is released');
  PERFORM pg_temp.ok(_row.cv_document_snapshot IS NOT NULL,
    'E5 the submitted artefact survives the deletion');
  PERFORM pg_temp.ok(_row.cv_source = 'cqrityjob_cv',
    'E6 and the application still says which source it came from');

  -- =======================================================================
  RAISE NOTICE 'GROUP F - the upload path is untouched';
  -- =======================================================================
  -- The OLD entry point, with its original signature, exactly as a caller
  -- deployed before this migration still calls it.
  _res := public.sp_submit_application_with_passport(
    _app2, _job3, '070-0000000', NULL, 'a/2/cv.pdf', 'cv.pdf', 1234);

  SELECT * INTO _row FROM public.job_applications WHERE id = _app2;
  PERFORM pg_temp.ok(_row.cv_source = 'upload',
    'F1 the compatibility entry point records an upload');
  PERFORM pg_temp.ok(_row.cv_storage_path = 'a/2/cv.pdf',
    'F2 the file is recorded where it always was');
  PERFORM pg_temp.ok(_row.cv_mime_type = 'application/pdf',
    'F3 and its mime type with it');
  PERFORM pg_temp.ok(_row.cv_size_bytes = 1234, 'F4 and its size');
  PERFORM pg_temp.ok(_row.cv_document_id IS NULL AND _row.cv_document_snapshot IS NULL,
    'F5 an uploaded CV carries no CQrityjob CV reference or copy');

  -- =======================================================================
  RAISE NOTICE 'GROUP G - the shape rule refuses impossible applications';
  -- =======================================================================
  BEGIN
    UPDATE public.job_applications SET cv_source = 'cqrityjob_cv' WHERE id = _app2;
    RAISE EXCEPTION 'ASSERTION FAILED: G1 an upload row was relabelled as a CQrityjob CV';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  G1 claiming a CQrityjob CV without one is refused';
  END;

  BEGIN
    UPDATE public.job_applications SET cv_storage_path = 'x/y/z.pdf' WHERE id = _app1;
    RAISE EXCEPTION 'ASSERTION FAILED: G2 an application took two CVs at once';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  G2 one application carries exactly one submitted CV';
  END;

  BEGIN
    PERFORM public.sp_submit_application_with_cv_source(
      _appX, _job4, NULL, NULL, NULL, NULL, NULL, 'something_else', NULL, false);
    RAISE EXCEPTION 'ASSERTION FAILED: G3 an unknown CV source was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  G3 an unknown CV source is refused';
  END;

  RESET ROLE;
END $body$;


-- ═════════════════════════════════════════════════════════════════════════
-- GROUP H — tenant isolation, executed as `authenticated` under real RLS.
--
-- The groups above run with the suite's own role, which is not subject to
-- RLS: they prove the FUNCTION's rules. This group proves the TABLE's, which
-- is the boundary that actually stands between two organisations.
-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP H - one employer, one application, under RLS'; END $$;

SET LOCAL ROLE authenticated;

-- Employer A's recruiter.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-4000-8000-000000000003',
                    'role', 'authenticated')::text, true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications
    WHERE id = 'e1000000-0000-4000-8000-000000000001') = 1,
  'H1 the employer the application was sent to reads it');

SELECT pg_temp.ok(
  (SELECT cv_document_snapshot IS NOT NULL FROM public.job_applications
    WHERE id = 'e1000000-0000-4000-8000-000000000001'),
  'H2 and reads the submitted CV on it');

-- The other organisation's recruiter. Same statement, no rows -- not an
-- error, which is the point: an application belonging to somebody else is
-- indistinguishable from one that does not exist.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-4000-8000-000000000004',
                    'role', 'authenticated')::text, true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications
    WHERE id = 'e1000000-0000-4000-8000-000000000001') = 0,
  'H3 another employer reads no row for that application');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications
    WHERE cv_document_snapshot IS NOT NULL) = 0,
  'H4 and reaches no submitted CV by any other route');

-- The other CANDIDATE. Bosse must not read Anna's application or her CV.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-4000-8000-000000000002',
                    'role', 'authenticated')::text, true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications) = 0,
  'H5 another candidate reads none of the applications');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents
    WHERE owner_user_id = 'a1000000-0000-4000-8000-000000000001') = 0,
  'H6 and none of the other candidate''s saved CVs');

RESET ROLE;


-- ═════════════════════════════════════════════════════════════════════════
-- GROUP I — the surface this release added, and what it did not add.
-- ═════════════════════════════════════════════════════════════════════════
DO $surface$
DECLARE _n integer; _asserts integer := 0;
BEGIN
  RAISE NOTICE 'GROUP I - grants and policies';

  -- The new function is not reachable anonymously.
  SELECT count(*) INTO _n
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'sp_submit_application_with_cv_source' AND grantee = 'anon';
  IF _n <> 0 THEN RAISE EXCEPTION 'I1: anon may execute the submission function'; END IF;
  _asserts := _asserts + 1;

  SELECT count(*) INTO _n
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'sp_submit_application_with_cv_source' AND grantee = 'authenticated';
  IF _n = 0 THEN RAISE EXCEPTION 'I2: authenticated cannot execute the submission function'; END IF;
  _asserts := _asserts + 1;

  -- SECURITY INVOKER, so RLS and the duplicate-application index still apply.
  -- A definer here would be a way to write an application the caller could not.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'sp_submit_application_with_cv_source' AND p.prosecdef;
  IF _n <> 0 THEN RAISE EXCEPTION 'I3: the submission function became SECURITY DEFINER'; END IF;
  _asserts := _asserts + 1;

  -- cv_documents gained NO employer, recruiter or admin read policy. The copy
  -- on the application is the only route, and it is the logged one.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'cv_documents';
  IF _n <> 4 THEN
    RAISE EXCEPTION 'I4: cv_documents has % policies, expected the original 4', _n;
  END IF;
  _asserts := _asserts + 1;

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_name = 'cv_documents' AND grantee = 'anon';
  IF _n <> 0 THEN RAISE EXCEPTION 'I5: anon gained a grant on cv_documents'; END IF;
  _asserts := _asserts + 1;

  -- No UPDATE grant appeared on job_applications for authenticated: the new
  -- columns must not become a client-writable back door into an application.
  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_name = 'job_applications' AND grantee = 'authenticated'
     AND privilege_type = 'UPDATE';
  IF _n <> 0 THEN RAISE EXCEPTION 'I6: authenticated gained UPDATE on job_applications'; END IF;
  _asserts := _asserts + 1;

  -- The compatibility entry point still exists with its original arity, so a
  -- caller deployed before this migration keeps submitting.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_submit_application_with_passport'
     AND p.pronargs = 8;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'I7: expected exactly one 8-argument sp_submit_application_with_passport, found %', _n;
  END IF;
  _asserts := _asserts + 1;

  RAISE NOTICE 'job_application_cv_source_test: % surface assertions passed', _asserts;
END $surface$;

ROLLBACK;
