-- Account erasure with credential metadata and document readings
-- (20270208090000_account_erasure_credential_details).
--
-- admin_delete_user_if_safe() used to refuse with ERASURE_INCOMPLETE for any
-- holder with a row in sp_credential_details or sp_evidence_extractions: both
-- hang off the person's Passport rows through ON DELETE RESTRICT and carry no
-- reference to auth.users, and the extraction table was append-only with no
-- exception at all. This suite proves, for both forms of the erasure:
--
--   ER1  the hard-delete form is unchanged. Any Passport claim counts as
--        history (USER_HAS_PASSPORT_EVIDENCE), so credential metadata can only
--        ever be met by the erasure form; the hard-delete form is proven for an
--        account without Passport data and removes no dependents;
--   ER2  the erasure form removes the metadata and readings, for a holder with
--        an application and for one without (the 2026-10-04 production case),
--        releases the address, ends sign-in (identities, sessions) and records
--        the erasure;
--   ER3  another holder's metadata, readings, evidence and files are untouched;
--   ER4  the append-only exception cannot be used outside an authorised erasure
--        (no setting, the wrong account, a non-superadmin, an UPDATE);
--   ER5  files are queued for removal and the audit row names what went.
--
-- Synthetic accounts only. Everything rolls back.
\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
BEGIN;

CREATE FUNCTION pg_temp.ok(_cond boolean, _label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', _label; END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;
CREATE FUNCTION pg_temp.must_fail(_sql text, _needle text, _label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%' || _needle || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with "%"', _label, _msg;
    END IF;
    RAISE NOTICE '    ok  %', _label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- it was allowed', _label;
END $$;

CREATE FUNCTION pg_temp.erase(_uid uuid, _email text, _label text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.admin_delete_user_if_safe(_uid, 'Syntetiskt testkonto.', _email);
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'ASSERTION FAILED: % -- the erasure refused: %', _label, SQLERRM;
END $$;

-- ── People ─────────────────────────────────────────────────────────────────
-- SA a superadmin; AD an ordinary platform admin; H1 an account with no
-- Passport data and no history (hard-delete form); H2 a holder with an
-- application and H4 a holder without one (both erasure form); H3 a holder who
-- must be left exactly as they are.
INSERT INTO auth.users (id, email) VALUES
  ('e0e00000-0000-4000-8000-0000000000aa', 'er-superadmin@erasure.invalid'),
  ('e0e00000-0000-4000-8000-0000000000ad', 'er-admin@erasure.invalid'),
  ('e0e00000-0000-4000-8000-000000000001', 'er-holder-one@erasure.invalid'),
  ('e0e00000-0000-4000-8000-000000000002', 'er-holder-two@erasure.invalid'),
  ('e0e00000-0000-4000-8000-000000000003', 'er-holder-three@erasure.invalid'),
  ('e0e00000-0000-4000-8000-000000000004', 'er-holder-four@erasure.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('e0e00000-0000-4000-8000-0000000000aa', 'superadmin'),
  ('e0e00000-0000-4000-8000-0000000000ad', 'admin');

-- H2, H3 and H4: a credential with metadata, a document, and a reading of it.
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name, issued_on)
SELECT ('e0e0c000-0000-4000-8000-00000000000' || n)::uuid, ('e0e00000-0000-4000-8000-00000000000' || n)::uuid,
       'certification', 'INTL_ASIS_CPP', 'Certified Protection Professional (CPP)', 'ASIS International', DATE '2026-01-01'
  FROM generate_series(2, 4) n;
-- Credential metadata is written by its holder (sp_guard_credential_details).
DO $$ BEGIN
  FOR n IN 2..4 LOOP
    PERFORM set_config('request.jwt.claim.sub', 'e0e00000-0000-4000-8000-00000000000' || n, true);
    INSERT INTO public.sp_credential_details (claim_id, credential_class, original_language, issuing_country_code, no_expiry)
    VALUES (('e0e0c000-0000-4000-8000-00000000000' || n)::uuid, 'certification', NULL, NULL, false);
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
INSERT INTO public.sp_evidence (id, holder_user_id, claim_id, file_name, mime_type, size_bytes, sha256, storage_path)
SELECT ('e0e0e000-0000-4000-8000-00000000000' || n)::uuid, ('e0e00000-0000-4000-8000-00000000000' || n)::uuid,
       ('e0e0c000-0000-4000-8000-00000000000' || n)::uuid, 'intyg.pdf', 'application/pdf', 1024, repeat(n::text, 64),
       'e0e00000-0000-4000-8000-00000000000' || n || '/intyg-' || n || '.pdf'
  FROM generate_series(2, 4) n;
INSERT INTO public.sp_evidence_extractions
  (evidence_id, process_version, source_fingerprint, original_source, sensitivity, retention_state, extraction_status, confidence)
SELECT ('e0e0e000-0000-4000-8000-00000000000' || n)::uuid, 'hayat-test-1', repeat('a', 64), 'intyg.pdf',
       'personal', 'retained', 'completed', 0.9
  FROM generate_series(2, 4) n;

-- H2's history: an application to a published advertisement, so the erasure
-- keeps the account row as a tombstone instead of deleting it.
INSERT INTO public.employers (id, name, slug, status)
VALUES ('e0e0f000-0000-4000-8000-000000000001', 'Erasure Kund AB', 'erasure-kund-ab', 'active');
-- A published advertisement may only be created by a platform admin
-- (jobs_validate_before_write); acting as the admin is the fixture.
SET LOCAL request.jwt.claim.sub = 'e0e00000-0000-4000-8000-0000000000ad';
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, title_en, status,
                         application_method, published_at, expires_at)
VALUES ('e0e0f000-0000-4000-8000-0000000000a1', 'e0e0f000-0000-4000-8000-000000000001',
        'erasure-test-job', 'erasure0001', 'Väktare (test)', 'Guard (test)', 'published', 'internal',
        now(), now() + interval '30 days');
RESET request.jwt.claim.sub;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES ('e0e0f000-0000-4000-8000-0000000000b2', 'e0e0f000-0000-4000-8000-0000000000a1',
        'e0e0f000-0000-4000-8000-000000000001', 'e0e00000-0000-4000-8000-000000000002', now());

-- H2 can sign in: an identity and a session that the erasure must end.
INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data)
VALUES (gen_random_uuid(), 'e0e00000-0000-4000-8000-000000000002', 'email', 'er-holder-two@erasure.invalid', '{}'::jsonb);
INSERT INTO auth.sessions (id, user_id)
VALUES ('e0e05000-0000-4000-8000-000000000002', 'e0e00000-0000-4000-8000-000000000002');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_credential_details d JOIN public.sp_claims c ON c.id = d.claim_id
    WHERE c.holder_user_id::text LIKE 'e0e00000-%') = 3
  AND (SELECT count(*) FROM public.sp_evidence_extractions x JOIN public.sp_evidence e ON e.id = x.evidence_id
        WHERE e.holder_user_id::text LIKE 'e0e00000-%') = 3,
  'ER0 three holders, each with credential metadata and a document reading');

-- ═══ ER4. The exception is not a hole ═════════════════════════════════════
SELECT pg_temp.must_fail(
  $$DELETE FROM public.sp_evidence_extractions WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000003'$$,
  'SP_EXTRACTION_APPEND_ONLY', 'ER4.1 outside an erasure a reading cannot be deleted, not even by the table owner');
SELECT pg_temp.must_fail(
  $$UPDATE public.sp_evidence_extractions SET confidence = 0.1 WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000003'$$,
  'SP_EXTRACTION_APPEND_ONLY', 'ER4.2 a reading cannot be changed');

-- The erasure setting alone, without a superadmin caller, releases nothing.
SET LOCAL request.jwt.claim.sub = 'e0e00000-0000-4000-8000-0000000000ad';
SELECT set_config('trustpath.deleting_account', 'e0e00000-0000-4000-8000-000000000003', true);
SELECT pg_temp.must_fail(
  $$DELETE FROM public.sp_evidence_extractions WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000003'$$,
  'SP_EXTRACTION_APPEND_ONLY', 'ER4.3 the erasure setting does not release a reading for an ordinary admin');
-- A superadmin, with the setting naming a DIFFERENT account, releases nothing.
SET LOCAL request.jwt.claim.sub = 'e0e00000-0000-4000-8000-0000000000aa';
SELECT set_config('trustpath.deleting_account', 'e0e00000-0000-4000-8000-000000000001', true);
SELECT pg_temp.must_fail(
  $$DELETE FROM public.sp_evidence_extractions WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000003'$$,
  'SP_EXTRACTION_APPEND_ONLY', 'ER4.4 an erasure of one account does not release another account''s reading');
-- And even for the account being erased, an UPDATE stays refused.
SELECT set_config('trustpath.deleting_account', 'e0e00000-0000-4000-8000-000000000004', true);
SELECT pg_temp.must_fail(
  $$UPDATE public.sp_evidence_extractions SET confidence = 0.1 WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000004'$$,
  'SP_EXTRACTION_APPEND_ONLY', 'ER4.5 the exception releases a DELETE, never an UPDATE');
SELECT set_config('trustpath.deleting_account', '', true);
-- A client role cannot reach the table at all.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e0e00000-0000-4000-8000-000000000003';
SELECT pg_temp.must_fail(
  $$DELETE FROM public.sp_evidence_extractions WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000003'$$,
  'permission denied', 'ER4.6 the holder cannot delete their own reading directly');
SELECT pg_temp.must_fail(
  $$DELETE FROM public.sp_credential_details WHERE claim_id = 'e0e0c000-0000-4000-8000-000000000003'$$,
  'permission denied', 'ER4.7 nor their own credential metadata');
RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'e0e00000-0000-4000-8000-0000000000ad';
SELECT pg_temp.must_fail(
  $$SELECT public.admin_delete_user_if_safe('e0e00000-0000-4000-8000-000000000001', 'test', 'er-holder-one@erasure.invalid')$$,
  'FORBIDDEN_SUPERADMIN_REQUIRED', 'ER4.8 an ordinary platform admin still cannot erase an account');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_evidence_extractions x JOIN public.sp_evidence e ON e.id = x.evidence_id
    WHERE e.holder_user_id::text LIKE 'e0e00000-%') = 3,
  'ER4.9 every refusal above changed nothing');

-- ═══ ER1. Hard-delete form ════════════════════════════════════════════════
SET LOCAL request.jwt.claim.sub = 'e0e00000-0000-4000-8000-0000000000aa';
CREATE TEMP TABLE er_result AS
SELECT pg_temp.erase('e0e00000-0000-4000-8000-000000000001', 'er-holder-one@erasure.invalid',
                     'ER1.0 an account with no Passport data can be erased') AS r;
SELECT pg_temp.ok((SELECT r ->> 'form' FROM er_result) = 'hard_delete'
                  AND (SELECT count(*) FROM auth.users WHERE id = 'e0e00000-0000-4000-8000-000000000001') = 0
                  AND (SELECT count(*) FROM public.profiles WHERE id = 'e0e00000-0000-4000-8000-000000000001') = 0,
  'ER1.1 an account with no Passport data and no history is still deleted outright');
SELECT pg_temp.ok((SELECT r -> 'removed_dependents' FROM er_result) = '{}'::jsonb,
  'ER1.2 and the new block removed nothing for it');

-- ═══ ER2. Erasure form ════════════════════════════════════════════════════
TRUNCATE er_result;
INSERT INTO er_result
SELECT pg_temp.erase('e0e00000-0000-4000-8000-000000000002', 'er-holder-two@erasure.invalid',
                     'ER2.0 a holder with credential metadata, a reading and an application can be erased');
SELECT pg_temp.ok((SELECT r ->> 'form' FROM er_result) <> 'hard_delete'
                  AND (SELECT count(*) FROM public.deleted_accounts WHERE user_id = 'e0e00000-0000-4000-8000-000000000002') = 1,
  'ER2.1 a holder with history is erased, with the account row kept as a tombstone');
SELECT pg_temp.ok(
  (SELECT r -> 'removed_dependents' FROM er_result) = '{"sp_credential_details": 1, "sp_evidence_extractions": 1}'::jsonb,
  'ER2.1b the result names the metadata and the reading it removed');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = 'e0e00000-0000-4000-8000-000000000002') = 0
  AND (SELECT count(*) FROM public.sp_credential_details WHERE claim_id = 'e0e0c000-0000-4000-8000-000000000002') = 0
  AND (SELECT count(*) FROM public.sp_evidence WHERE id = 'e0e0e000-0000-4000-8000-000000000002') = 0
  AND (SELECT count(*) FROM public.sp_evidence_extractions WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000002') = 0,
  'ER2.2 the claim, its metadata, the document row and its reading are all gone');
SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE lower(email) = 'er-holder-two@erasure.invalid') = 0
  AND (SELECT count(*) FROM auth.identities WHERE user_id = 'e0e00000-0000-4000-8000-000000000002') = 0
  AND (SELECT count(*) FROM auth.sessions WHERE user_id = 'e0e00000-0000-4000-8000-000000000002') = 0
  AND (SELECT banned_until > now() + interval '50 years' FROM auth.users WHERE id = 'e0e00000-0000-4000-8000-000000000002'),
  'ER2.3 the address is released, sign-in identities and sessions are gone, and the tombstone cannot sign in');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications WHERE id = 'e0e0f000-0000-4000-8000-0000000000b2') = 1,
  'ER2.4 the employer''s application record is kept');
-- The same address can register again.
INSERT INTO auth.users (id, email) VALUES ('e0e00000-0000-4000-8000-0000000000f2', 'er-holder-two@erasure.invalid');
SELECT pg_temp.ok((SELECT count(*) FROM auth.users WHERE lower(email) = 'er-holder-two@erasure.invalid') = 1,
  'ER2.5 a new account can be created with the released address, with no link to the old one');

-- The production case: a holder with Passport data and no application.
TRUNCATE er_result;
INSERT INTO er_result
SELECT pg_temp.erase('e0e00000-0000-4000-8000-000000000004', 'er-holder-four@erasure.invalid',
                     'ER2.0b a holder with credential metadata and a reading and no application can be erased');
SELECT pg_temp.ok(
  (SELECT r ->> 'form' FROM er_result) <> 'hard_delete'
  AND (SELECT r -> 'removed_dependents' FROM er_result) = '{"sp_credential_details": 1, "sp_evidence_extractions": 1}'::jsonb
  AND (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = 'e0e00000-0000-4000-8000-000000000004') = 0
  AND (SELECT count(*) FROM public.sp_evidence_extractions WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000004') = 0
  AND (SELECT count(*) FROM auth.users WHERE lower(email) = 'er-holder-four@erasure.invalid') = 0,
  'ER2.6 a holder with credential metadata and no application (the production case) is erased and the address released');

-- ═══ ER3. Nobody else is touched ══════════════════════════════════════════
SELECT pg_temp.ok(
  (SELECT count(*) FROM auth.users WHERE id = 'e0e00000-0000-4000-8000-000000000003') = 1
  AND (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = 'e0e00000-0000-4000-8000-000000000003') = 1
  AND (SELECT count(*) FROM public.sp_credential_details WHERE claim_id = 'e0e0c000-0000-4000-8000-000000000003') = 1
  AND (SELECT count(*) FROM public.sp_evidence WHERE id = 'e0e0e000-0000-4000-8000-000000000003') = 1
  AND (SELECT count(*) FROM public.sp_evidence_extractions WHERE evidence_id = 'e0e0e000-0000-4000-8000-000000000003') = 1
  AND (SELECT count(*) FROM public.storage_erasure_queue WHERE subject_user_id = 'e0e00000-0000-4000-8000-000000000003') = 0
  AND (SELECT count(*) FROM public.user_roles WHERE user_id IN ('e0e00000-0000-4000-8000-0000000000aa', 'e0e00000-0000-4000-8000-0000000000ad')) = 2,
  'ER3.1 another holder''s account, credential, metadata, document, reading and files, and the admins'' roles, are untouched');

-- ═══ ER5. Files and the record ════════════════════════════════════════════
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.storage_erasure_queue
    WHERE bucket_id = 'passport-evidence' AND reason = 'account_permanently_deleted'
      AND subject_user_id IN ('e0e00000-0000-4000-8000-000000000002', 'e0e00000-0000-4000-8000-000000000004')) = 2,
  'ER5.1 each erased holder''s document file is queued for removal from Storage');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'user_deleted' AND actor_role = 'superadmin'
      AND subject_id IN ('e0e00000-0000-4000-8000-000000000002', 'e0e00000-0000-4000-8000-000000000004')
      AND metadata -> 'removed_dependents' = '{"sp_credential_details": 1, "sp_evidence_extractions": 1}'::jsonb) = 2
  AND (SELECT count(*) FROM public.audit_logs
        WHERE action = 'user_deleted' AND subject_id = 'e0e00000-0000-4000-8000-000000000001') = 1,
  'ER5.2 each of the three erasures wrote one audit row, naming the metadata and reading it removed');

DO $$ BEGIN RAISE NOTICE '    ok  account_erasure_credential_details_test: 22 assertions passed'; END $$;
ROLLBACK;
