-- =============================================================================
-- Security Passport x job applications -- the application-scoped disclosure,
-- created at submission.
--
-- Run against a disposable Postgres with the full migration history replayed
-- (scripts/db-test.sh). Every assertion RAISEs on failure, so a non-zero psql
-- exit means "do not merge".
--
-- ── WHAT THIS PROVES ────────────────────────────────────────────────────
--
-- 20260903091000 built the application-scoped disclosure model and nothing
-- called it, so a candidate with a fully verified Passport applied and the
-- employer saw "nothing shared". 20260904090000 makes submission and
-- disclosure one transaction. The assertions below hold BOTH halves of that
-- contract: the disclosure is created when and only when the holder asked for
-- it and had something verified, and every failure takes the application down
-- with it rather than reporting a share that does not exist.
--
-- Applying is still not consent: the default is FALSE and there is an
-- assertion for it.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Synthetic cast. No real person, employer, job or credential appears here.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'holder@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000002', 'verifier@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000003', 'employer-member@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000004', 'other-employer@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000005', 'bystander@synthetic.test'),
  ('a0000000-0000-4000-8000-000000000006', 'holder2@synthetic.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Syntetisk Bevakning AB', 'syntetisk-bevakning', 'active'),
  ('b0000000-0000-4000-8000-000000000002', 'Annan Bevakning AB', 'annan-bevakning', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'owner', 'active')
ON CONFLICT DO NOTHING;

-- A published advertisement. jobs_validate_before_write only lets a platform
-- admin create one directly, so the fixture borrows that role for this one
-- statement rather than weakening the trigger it is about to rely on.
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'fixture-admin@synthetic.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'admin')
ON CONFLICT DO NOTHING;

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';

INSERT INTO public.jobs (id, employer_id, title_sv, title_en, status, application_method, slug, short_id, published_at, expires_at)
VALUES ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'Väktare', 'Security guard', 'published', 'internal', 'syntetisk-vaktare', 'SYN0001', now(), now() + interval '30 days'),
       ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'Ordningsvakt', 'Public order guard', 'published', 'internal', 'syntetisk-ov', 'SYN0002', now(), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;

RESET request.jwt.claim.sub;

-- The holder: one VERIFIED credential, one VERIFIED period, and a set of
-- entries that must never be disclosed.
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Syntetisk Innehavare', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.sp_claims (
  id, holder_user_id, claim_type, credential_code, skill_code, skill_level, title, claimed_issuer_name,
  issued_on, valid_until, assertion_level, lifecycle_state, verified_by_user_id, verified_at,
  -- Added by the Swedish truth model (20260907091000): a skyddsvakt approval
  -- is limited to an employer, principal or protected object, and without
  -- saying which it reads as a general national licence.
  authorisation_scope)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'licence', 'OV', NULL, NULL, 'Ordningsvaktsförordnande', 'Syntetisk Myndighet',
   current_date - 30, current_date + 365, 'verified', 'active', 'a0000000-0000-4000-8000-000000000002', now(), NULL),
  -- Must NOT be disclosed: self-declared.
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'training', 'VU1', NULL, NULL, 'Väktarutbildning 1 (VU1)', 'Syntetisk Skola',
   current_date - 200, NULL, 'self_declared', 'active', NULL, NULL, NULL),
  -- Must NOT be disclosed: verified but expired lifecycle.
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   'licence', 'SV', NULL, NULL, 'Skyddsvaktsförordnande', 'Syntetisk Myndighet',
   current_date - 800, current_date - 10, 'verified', 'expired', 'a0000000-0000-4000-8000-000000000002', now(),
   'Skyddsobjekt: Syntetisk anläggning'),
  -- Must NOT be disclosed: verified but disputed.
  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   'certification', NULL, NULL, NULL, 'Omtvistad certifiering', 'Syntetisk Utfärdare',
   current_date - 100, NULL, 'verified', 'disputed', 'a0000000-0000-4000-8000-000000000002', now(), NULL),
  -- A VERIFIED language: proves the package already carries skill claims.
  ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
   'language', NULL, 'lang_en', 'B2', 'Engelska', NULL,
   NULL, NULL, 'verified', 'active', 'a0000000-0000-4000-8000-000000000002', now(), NULL)
ON CONFLICT (id) DO NOTHING;

-- ── The private fields, attached to the credential that IS disclosed ──────
--
-- The leak assertions below are only meaningful on a claim that reaches the
-- payload. Hanging them on a self-declared claim would prove nothing: that
-- row is excluded wholesale, so its columns could never appear anyway.
-- d...0001 is the verified Ordningsvaktsförordnande the employer is entitled
-- to see, and these three columns are what they are NOT entitled to see on
-- it -- field-level exclusion, not row-level.
--
-- 20260817180000 states the rule in a comment ("credential_reference and
-- holder_note are NOT added and must never be"). A comment does not fail a
-- build; this does.
UPDATE public.sp_claims
   SET holder_note          = 'SYNTHETIC-HOLDER-NOTE-MUST-NOT-LEAK',
       credential_reference = 'SYNTHETIC-DOCNR-MUST-NOT-LEAK'
 WHERE id = 'd0000000-0000-4000-8000-000000000001';

-- A raw evidence document for that same credential.
INSERT INTO public.sp_evidence (
  id, holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes, sha256)
VALUES ('c1e00000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001/SYNTHETIC-EVIDENCE-PATH-MUST-NOT-LEAK.pdf',
        'SYNTHETIC-EVIDENCE-FILENAME-MUST-NOT-LEAK.pdf',
        'application/pdf', 1024, 'SYNTHETIC-SHA-MUST-NOT-LEAK')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_experience_periods (
  id, holder_user_id, employer_name, role_title, jurisdiction_code,
  employment_type, fte_fraction, security_relevance, security_fraction,
  started_on, ended_on, assertion_level, lifecycle_state)
VALUES
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Tidigare Bevakning AB', 'Väktare', 'SE', 'full_time', 1.0, 'primary', 1.0,
   '2021-01-01', NULL, 'verified', 'active'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Hemlig Arbetsgivare AB', 'Väktare', 'SE', 'full_time', 1.0, 'primary', 1.0,
   '2019-01-01', '2020-12-31', 'self_declared', 'active')
ON CONFLICT (id) DO NOTHING;

-- A second holder with a Passport but nothing verified.
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('a0000000-0000-4000-8000-000000000006', 'Ingen Verifiering', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.sp_claims (
  id, holder_user_id, claim_type, credential_code, title, issued_on,
  assertion_level, lifecycle_state)
VALUES ('d0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000006',
        'training', 'VU1', 'Väktarutbildning 1 (VU1)', current_date - 100, 'self_declared', 'active')
ON CONFLICT (id) DO NOTHING;


DO $suite$
DECLARE
  _holder    uuid := 'a0000000-0000-4000-8000-000000000001';
  _holder2   uuid := 'a0000000-0000-4000-8000-000000000006';
  _member    uuid := 'a0000000-0000-4000-8000-000000000003';
  _other     uuid := 'a0000000-0000-4000-8000-000000000004';
  _bystander uuid := 'a0000000-0000-4000-8000-000000000005';
  _job       uuid := 'c0000000-0000-4000-8000-000000000001';
  _job2      uuid := 'c0000000-0000-4000-8000-000000000002';
  _app1      uuid := 'f0000000-0000-4000-8000-000000000001';
  _app2      uuid := 'f0000000-0000-4000-8000-000000000002';
  _app3      uuid := 'f0000000-0000-4000-8000-000000000003';
  _res       jsonb;
  _payload   jsonb;
  _n         integer;
  _asserts   integer := 0;
BEGIN
  -- =========================================================================
  -- 1. The default discloses nothing. Applying is not consent.
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', _holder::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _holder, 'role', 'authenticated')::text, true);

  _res := public.sp_submit_application_with_passport(
    _app1, _job, '070-0000000', NULL, 'p/1/cv.pdf', 'cv.pdf', 1000);

  IF (_res->>'passport_requested')::boolean THEN
    RAISE EXCEPTION 'AC1: the default must not request a disclosure';
  END IF;
  IF (_res->>'passport_shared')::boolean THEN
    RAISE EXCEPTION 'AC1: the default must not create a disclosure';
  END IF;
  SELECT count(*) INTO _n FROM public.sp_disclosures WHERE application_id = _app1;
  IF _n <> 0 THEN RAISE EXCEPTION 'AC1: applying created % disclosure(s)', _n; END IF;
  _asserts := _asserts + 3;

  -- The application itself is real and owned by the holder.
  PERFORM 1 FROM public.job_applications
    WHERE id = _app1 AND applicant_user_id = _holder AND employer_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'AC1: application not created or not bound'; END IF;
  _asserts := _asserts + 1;

  -- =========================================================================
  -- 2. Opting in creates exactly one disclosure, bound correctly.
  -- =========================================================================
  _res := public.sp_submit_application_with_passport(
    _app2, _job2, NULL, NULL, 'p/2/cv.pdf', 'cv.pdf', 1000, true);

  IF NOT (_res->>'passport_shared')::boolean THEN
    RAISE EXCEPTION 'AC2: opting in did not create a disclosure (%)', _res;
  END IF;
  SELECT count(*) INTO _n FROM public.sp_disclosures
   WHERE application_id = _app2 AND revoked_at IS NULL;
  IF _n <> 1 THEN RAISE EXCEPTION 'AC2: expected exactly 1 disclosure, got %', _n; END IF;
  _asserts := _asserts + 2;

  -- Bound to the right holder, the right application, the fixed package, and
  -- carrying no token: an application share must not become a public URL.
  PERFORM 1 FROM public.sp_disclosures
   WHERE application_id = _app2
     AND holder_user_id = _holder
     AND package_code = 'employer_review'
     AND token_hash IS NULL
     AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'AC2: disclosure is not correctly bound'; END IF;
  _asserts := _asserts + 1;

  -- Authorisation is recorded, with a timestamp.
  PERFORM 1 FROM public.sp_passport_events
   WHERE holder_user_id = _holder AND actor_user_id = _holder
     AND detail->>'action' = 'application_disclosure_created'
     AND (detail->>'application_id')::uuid = _app2;
  IF NOT FOUND THEN RAISE EXCEPTION 'AC2: holder authorisation was not recorded'; END IF;
  _asserts := _asserts + 1;

  -- =========================================================================
  -- 3. Idempotency. A retry cannot produce a second application or a second
  --    live disclosure.
  -- =========================================================================
  BEGIN
    PERFORM public.sp_submit_application_with_passport(
      _app3, _job2, NULL, NULL, 'p/3/cv.pdf', 'cv.pdf', 1000, true);
    RAISE EXCEPTION 'AC3: a duplicate application was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%AC3:%' THEN RAISE; END IF;
  END;
  _asserts := _asserts + 1;

  -- And the failed retry left nothing behind: no orphan application, no
  -- orphan disclosure. This is the atomicity claim.
  SELECT count(*) INTO _n FROM public.job_applications WHERE id = _app3;
  IF _n <> 0 THEN RAISE EXCEPTION 'AC3: orphan application after failed retry'; END IF;
  SELECT count(*) INTO _n FROM public.sp_disclosures WHERE application_id = _app3;
  IF _n <> 0 THEN RAISE EXCEPTION 'AC3: orphan disclosure after failed retry'; END IF;
  _asserts := _asserts + 2;

  -- Re-sharing the SAME application supersedes rather than accumulating.
  PERFORM public.sp_share_passport_with_application(_app2, 'employer_review', 30, NULL, NULL);
  SELECT count(*) INTO _n FROM public.sp_disclosures
   WHERE application_id = _app2 AND revoked_at IS NULL;
  IF _n <> 1 THEN RAISE EXCEPTION 'AC3: re-sharing produced % live disclosures', _n; END IF;
  _asserts := _asserts + 1;

  -- =========================================================================
  -- 4. What the employer may read -- and what must never appear.
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _member, 'role', 'authenticated')::text, true);

  _payload := public.sp_application_disclosure(_app2);
  IF _payload->>'status' <> 'active' THEN
    RAISE EXCEPTION 'AC4: the receiving employer cannot read the disclosure (%)', _payload;
  END IF;
  _asserts := _asserts + 1;

  -- The verified credential IS there.
  IF _payload::text NOT LIKE '%Ordningsvaktsförordnande%' THEN
    RAISE EXCEPTION 'AC4: the verified credential is missing from the payload';
  END IF;
  -- The verified language IS there: the package already carries skill claims,
  -- so no policy widening was needed for languages or practical skills.
  IF _payload::text NOT LIKE '%Engelska%' THEN
    RAISE EXCEPTION 'AC4: the verified language is missing from the payload';
  END IF;
  -- The verified experience IS there.
  IF _payload::text NOT LIKE '%Tidigare Bevakning AB%' THEN
    RAISE EXCEPTION 'AC4: the verified experience is missing from the payload';
  END IF;
  _asserts := _asserts + 3;

  -- Everything below must NOT be there.
  IF _payload::text LIKE '%Väktarutbildning 1%' THEN
    RAISE EXCEPTION 'AC4 LEAK: a self-declared claim was disclosed';
  END IF;
  IF _payload::text LIKE '%Skyddsvaktsförordnande%' THEN
    RAISE EXCEPTION 'AC4 LEAK: an expired claim was disclosed';
  END IF;
  IF _payload::text LIKE '%Omtvistad certifiering%' THEN
    RAISE EXCEPTION 'AC4 LEAK: a disputed claim was disclosed';
  END IF;
  IF _payload::text LIKE '%Hemlig Arbetsgivare%' THEN
    RAISE EXCEPTION 'AC4 LEAK: a self-declared employment period was disclosed';
  END IF;
  IF _payload::text LIKE '%holder@synthetic.test%' THEN
    RAISE EXCEPTION 'AC4 LEAK: contact detail was disclosed';
  END IF;
  _asserts := _asserts + 5;

  -- ── Field-level exclusion on a credential that IS disclosed ────────────
  --
  -- The three the privacy contract names by name. Each is a column on
  -- d...0001, whose title, issuer, jurisdiction and validity ARE in the
  -- payload asserted above -- so these cannot pass by the row being absent.
  IF _payload::text LIKE '%SYNTHETIC-HOLDER-NOTE-MUST-NOT-LEAK%' THEN
    RAISE EXCEPTION 'AC4 LEAK: sp_claims.holder_note reached an employer';
  END IF;
  IF _payload::text LIKE '%SYNTHETIC-DOCNR-MUST-NOT-LEAK%' THEN
    RAISE EXCEPTION 'AC4 LEAK: sp_claims.credential_reference (the document '
      'number) reached an employer';
  END IF;
  IF _payload::text LIKE '%SYNTHETIC-EVIDENCE-PATH-MUST-NOT-LEAK%'
     OR _payload::text LIKE '%SYNTHETIC-EVIDENCE-FILENAME-MUST-NOT-LEAK%'
     OR _payload::text LIKE '%SYNTHETIC-SHA-MUST-NOT-LEAK%' THEN
    RAISE EXCEPTION 'AC4 LEAK: raw evidence (sp_evidence) reached an employer';
  END IF;
  _asserts := _asserts + 3;

  -- ── Per-APPLICATION scope, read by an employer entitled to both ────────
  --
  -- The sharpest version of the scoping claim. _app1 and _app2 belong to the
  -- SAME candidate and the SAME employer, and _member is a legitimate reader
  -- of both -- so nothing about identity, membership or tenancy separates
  -- them. Only the holder's per-application decision does. _app2 was opted
  -- in (asserted above); _app1 was not, and must stay silent no matter how
  -- much the same employer is entitled to see elsewhere.
  --
  -- This is what stops a share from being "the candidate's Passport, now
  -- unlocked for this employer" instead of "this application's disclosure".
  _payload := public.sp_application_disclosure(_app1);
  IF _payload->>'status' <> 'none' THEN
    RAISE EXCEPTION 'AC4 LEAK: an un-opted-in application of the same '
      'candidate disclosed to the same employer (%)', _payload;
  END IF;
  IF _payload::text LIKE '%Ordningsvaktsförordnande%' THEN
    RAISE EXCEPTION 'AC4 LEAK: a sibling application inherited the disclosure';
  END IF;
  _asserts := _asserts + 2;

  -- =========================================================================
  -- 5. Authorisation. Every negative answer is the same answer.
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _other, 'role', 'authenticated')::text, true);
  _payload := public.sp_application_disclosure(_app2);
  IF _payload->>'status' <> 'none' THEN
    RAISE EXCEPTION 'AC5: an unrelated employer read the disclosure (%)', _payload;
  END IF;
  _asserts := _asserts + 1;

  PERFORM set_config('request.jwt.claim.sub', _bystander::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _bystander, 'role', 'authenticated')::text, true);
  _payload := public.sp_application_disclosure(_app2);
  IF _payload->>'status' <> 'none' THEN
    RAISE EXCEPTION 'AC5: an unrelated user read the disclosure';
  END IF;
  _asserts := _asserts + 1;

  -- An employer cannot authorise on the holder's behalf.
  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _member, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.sp_share_passport_with_application(_app1, 'employer_review', 30, NULL, NULL);
    RAISE EXCEPTION 'AC5: an employer created a disclosure for the holder';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN IF SQLERRM LIKE '%AC5:%' THEN RAISE; END IF;
  END;
  _asserts := _asserts + 1;

  -- A holder cannot attach their Passport to somebody else's application.
  PERFORM set_config('request.jwt.claim.sub', _holder2::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _holder2, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.sp_share_passport_with_application(_app1, 'employer_review', 30, NULL, NULL);
    RAISE EXCEPTION 'AC5: a holder attached a Passport to another holder''s application';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN IF SQLERRM LIKE '%AC5:%' THEN RAISE; END IF;
  END;
  _asserts := _asserts + 1;

  -- =========================================================================
  -- 6. Nothing verified => no empty disclosure, and the application succeeds.
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', _holder2::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _holder2, 'role', 'authenticated')::text, true);

  _res := public.sp_submit_application_with_passport(
    'f0000000-0000-4000-8000-000000000009', _job, NULL, NULL,
    'p/9/cv.pdf', 'cv.pdf', 1000, true);

  IF NOT (_res->>'passport_requested')::boolean THEN
    RAISE EXCEPTION 'AC6: the request flag was lost';
  END IF;
  IF (_res->>'passport_shared')::boolean THEN
    RAISE EXCEPTION 'AC6: an empty disclosure was created';
  END IF;
  IF (_res->>'passport_eligible')::boolean THEN
    RAISE EXCEPTION 'AC6: a holder with nothing verified was reported eligible';
  END IF;
  SELECT count(*) INTO _n FROM public.job_applications
   WHERE id = 'f0000000-0000-4000-8000-000000000009';
  IF _n <> 1 THEN RAISE EXCEPTION 'AC6: the application did not survive'; END IF;
  _asserts := _asserts + 4;

  -- =========================================================================
  -- 7. Revocation. The employer loses the content, not just the label.
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', _holder::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _holder, 'role', 'authenticated')::text, true);
  UPDATE public.sp_disclosures SET revoked_at = now()
   WHERE application_id = _app2 AND revoked_at IS NULL;

  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _member, 'role', 'authenticated')::text, true);
  _payload := public.sp_application_disclosure(_app2);
  IF _payload->>'status' <> 'none' THEN
    RAISE EXCEPTION 'AC7: a revoked disclosure is still readable (%)', _payload;
  END IF;
  IF _payload::text LIKE '%Ordningsvaktsförordnande%' THEN
    RAISE EXCEPTION 'AC7 LEAK: revoked disclosure still returned content';
  END IF;
  _asserts := _asserts + 2;

  RAISE NOTICE 'sp_application_passport_test: % assertions passed', _asserts;
END $suite$;

-- ---------------------------------------------------------------------------
-- 8. Surface-level guarantees, checked without a session.
-- ---------------------------------------------------------------------------
DO $grants$
DECLARE _n integer; _asserts integer := 0;
BEGIN
  -- anon may not execute any application-Passport function.
  SELECT count(*) INTO _n
    FROM information_schema.role_routine_grants
   WHERE routine_name IN ('sp_submit_application_with_passport',
                          'sp_share_passport_with_application',
                          'sp_application_disclosure',
                          'sp_my_application_disclosures',
                          'sp_disclosure_payload')
     AND grantee IN ('anon', 'PUBLIC');
  IF _n <> 0 THEN RAISE EXCEPTION 'AC8: anon holds % execute grant(s)', _n; END IF;
  _asserts := _asserts + 1;

  -- The payload builder is reachable by no role at all: only through a caller
  -- that has already established who is asking.
  SELECT count(*) INTO _n
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'sp_disclosure_payload' AND grantee IN ('authenticated','anon','PUBLIC');
  IF _n <> 0 THEN RAISE EXCEPTION 'AC8: sp_disclosure_payload is directly executable'; END IF;
  _asserts := _asserts + 1;

  -- The submission function must stay INVOKER: a definer here could write an
  -- application the caller is not allowed to write.
  SELECT count(*) INTO _n FROM pg_proc
   WHERE proname = 'sp_submit_application_with_passport' AND prosecdef;
  IF _n <> 0 THEN RAISE EXCEPTION 'AC8: the submission function became SECURITY DEFINER'; END IF;
  _asserts := _asserts + 1;

  -- Every SECURITY DEFINER function in this feature pins search_path.
  SELECT count(*) INTO _n FROM pg_proc
   WHERE proname IN ('sp_share_passport_with_application','sp_application_disclosure',
                     'sp_my_application_disclosures','sp_disclosure_payload')
     AND prosecdef
     AND (proconfig IS NULL OR NOT (proconfig::text LIKE '%search_path%'));
  IF _n <> 0 THEN RAISE EXCEPTION 'AC8: % definer function(s) without a pinned search_path', _n; END IF;
  _asserts := _asserts + 1;

  -- RLS is on the disclosure table, and no holder may DELETE a disclosure.
  SELECT count(*) INTO _n FROM pg_class
   WHERE relname = 'sp_disclosures' AND NOT relrowsecurity;
  IF _n <> 0 THEN RAISE EXCEPTION 'AC8: sp_disclosures lost RLS'; END IF;
  _asserts := _asserts + 1;

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_name = 'sp_disclosures' AND privilege_type = 'DELETE'
     AND grantee IN ('anon','authenticated');
  IF _n <> 0 THEN RAISE EXCEPTION 'AC8: a DELETE grant appeared on sp_disclosures'; END IF;
  _asserts := _asserts + 1;

  -- The holder's only direct write remains revocation.
  SELECT count(*) INTO _n FROM information_schema.column_privileges
   WHERE table_name = 'sp_disclosures' AND grantee = 'authenticated'
     AND privilege_type = 'UPDATE' AND column_name <> 'revoked_at';
  IF _n <> 0 THEN RAISE EXCEPTION 'AC8: authenticated may UPDATE % non-revocation column(s)', _n; END IF;
  _asserts := _asserts + 1;

  RAISE NOTICE 'sp_application_passport_test: % surface assertions passed', _asserts;
END $grants$;

ROLLBACK;
