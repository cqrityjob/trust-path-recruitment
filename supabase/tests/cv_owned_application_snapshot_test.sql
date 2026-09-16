-- Real authenticated-role regression for the private-helper permission failure.
-- All records are synthetic and rolled back. No grants are broadened for tests.
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
-- The Passport rows the CVs are ABOUT.
--
-- Needed since 20261102090000: the submission boundary verifies every fact on
-- a document against the holder's own live records, by value, before copying
-- anything. A fixture whose CV described an employment that existed nowhere
-- used to submit happily; it must not now, and it does not -- so the fixture
-- says what is true about Anna instead of what is convenient.
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, started_on, ended_on, lifecycle_state)
VALUES ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'Bevakning AB', 'Väktare', DATE '2016-01-01', NULL, 'active')
ON CONFLICT (id) DO NOTHING;

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
        'id', 'f1000000-0000-4000-8000-000000000001',
        'employerName', 'Bevakning AB', 'roleTitle', 'Väktare',
        'startedOn', '2016-01-01', 'endedOn', NULL, 'employmentType', 'full_time',
        'assertionLevel', 'self_declared')),
     'education', '[]'::jsonb, 'credentials', '[]'::jsonb,
     'skills', '[]'::jsonb, 'languages', '[]'::jsonb,
     'careerInsight', NULL,
     'targetJobText', 'ANNONS FRÅN ANNAN BEVAKNING AB - ronderande väktare'),
   jsonb_build_object(
     'storedVersion', 'cv-stored-presentation-v1',
     'headline', 'Väktare med tio års erfarenhet',
     'summary', 'Erfaren väktare.',
     'experience', jsonb_build_array(jsonb_build_object(
        'sourceId','f1000000-0000-4000-8000-000000000001',
        'bullets', jsonb_build_array('Ronderande bevakning i Stockholm.'))),
     'emphasisedClaimIds', '[]'::jsonb,
     'tailoringRationale', 'Anpassat mot Annan Bevakning ABs annons.',
     'authorship', jsonb_build_object('headline','ai','summary','ai',
        'bullets', jsonb_build_object('f1000000-0000-4000-8000-000000000001','ai')))),

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


CREATE FUNCTION pg_temp.must_fail(stmt text, needle text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF position(needle in SQLERRM)=0 THEN RAISE EXCEPTION 'Wrong refusal: % expected %',SQLERRM,needle; END IF;
    RAISE NOTICE 'ok  refused %',needle; RETURN;
  END;
  RAISE EXCEPTION 'Expected refusal: %',needle;
END $$;
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.cv_bundle_is_ready(jsonb)','EXECUTE'),'readiness helper stays private');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.cv_facts_unverified(jsonb)','EXECUTE'),'fact helper stays private');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.cv_application_snapshot(public.cv_documents,timestamptz)','EXECUTE'),'serialization helper stays private');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.cv_owned_application_snapshot(uuid)','EXECUTE'),'anonymous has no wrapper access');
SELECT pg_temp.ok(NOT has_function_privilege('service_role','public.cv_owned_application_snapshot(uuid)','EXECUTE'),'service role has no wrapper grant');
SELECT pg_temp.ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.sp_submit_application_with_cv_source(uuid,uuid,text,text,text,text,bigint,text,uuid,boolean)'::regprocedure),'application submission remains invoker');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
SELECT pg_temp.must_fail($q$SELECT public.cv_owned_application_snapshot('d1000000-0000-4000-8000-000000000003')$q$,'CV_DOCUMENT_NOT_FOUND');
SELECT pg_temp.must_fail($q$SELECT public.cv_owned_application_snapshot('d1000000-0000-4000-8000-000000000099')$q$,'CV_DOCUMENT_NOT_FOUND');
SELECT pg_temp.must_fail($q$SELECT public.cv_owned_application_snapshot('d1000000-0000-4000-8000-000000000002')$q$,'CV_DOCUMENT_NOT_READY');
SELECT pg_temp.ok(public.cv_owned_application_snapshot('d1000000-0000-4000-8000-000000000001') IS NOT NULL,'holder can obtain ready current snapshot');
SELECT pg_temp.must_fail($q$SELECT public.sp_submit_application_with_cv_source('e1000000-0000-4000-8000-000000000099','c1000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,NULL,'cqrityjob_cv','d1000000-0000-4000-8000-000000000003',false)$q$,'CV_DOCUMENT_NOT_FOUND');
SELECT pg_temp.ok((SELECT count(*) FROM public.job_applications WHERE id='e1000000-0000-4000-8000-000000000099')=0,'foreign CV refusal is atomic');
SELECT pg_temp.ok((public.sp_submit_application_with_cv_source('e1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,NULL,'cqrityjob_cv','d1000000-0000-4000-8000-000000000001',false)->>'cv_source')='cqrityjob_cv','real authenticated role can submit saved CV');
SELECT pg_temp.ok((SELECT applicant_user_id=auth.uid() AND cv_document_snapshot IS NOT NULL FROM public.job_applications WHERE id='e1000000-0000-4000-8000-000000000001'),'submission owns and freezes snapshot');
SELECT pg_temp.ok((SELECT cv_document_snapshot::text NOT LIKE '%ANNONS FRÅN ANNAN%' FROM public.job_applications WHERE id='e1000000-0000-4000-8000-000000000001'),'target employer text removed from shared snapshot');
UPDATE public.sp_experience_periods SET employer_name='Changed after saving' WHERE id='f1000000-0000-4000-8000-000000000001';
SELECT pg_temp.must_fail($q$SELECT public.cv_owned_application_snapshot('d1000000-0000-4000-8000-000000000001')$q$,'CV_DOCUMENT_STALE_FACTS');
SELECT pg_temp.must_fail($q$SELECT public.sp_submit_application_with_cv_source('e1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002',NULL,NULL,NULL,NULL,NULL,'cqrityjob_cv','d1000000-0000-4000-8000-000000000001',false)$q$,'CV_DOCUMENT_STALE_FACTS');
SELECT pg_temp.ok((SELECT count(*) FROM public.job_applications WHERE id='e1000000-0000-4000-8000-000000000002')=0,'stale facts refusal is atomic');
SET LOCAL request.jwt.claim.sub = '';
SELECT pg_temp.must_fail($q$SELECT public.cv_owned_application_snapshot('d1000000-0000-4000-8000-000000000001')$q$,'CV_NOT_AUTHENTICATED');
RESET ROLE;
ROLLBACK;
