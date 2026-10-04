-- Account erasure, full call path: SYNTHETIC accounts for the disposable local stack.
--
-- One superadmin who can sign in, and one candidate whose Security Passport holds
-- exactly what #416 (20270208090000) had to learn to erase: a credential's
-- details (sp_credential_details) and a reading of an uploaded document
-- (sp_evidence_extractions), plus the neighbours an erasure has to treat
-- differently: the candidate's own test run (cd_sessions, deleted with the
-- account) and a piece of feedback (beta_feedback, kept with its link removed).
--
-- Disposable local database only. Nothing here may be copied to a hosted project.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() NOT IN ('beskt_e2e', 'scp_ci_test') THEN
    RAISE EXCEPTION 'ERASURE_FIXTURE_WRONG_DATABASE: runs only against a disposable local database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

-- Load it once into a freshly seeded database (scripts/local-stack/up.sh --reseed).
-- It does not clean up after itself on purpose: erasing the candidate is what the
-- test does, and doing it here with a plain DELETE would be the very thing #416
-- exists to stop.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'e5a00000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'ERASURE_FIXTURE_ALREADY_LOADED: run scripts/local-stack/up.sh --reseed first';
  END IF;
END $$;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, instance_id,
                        raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
                        email_change_token_new, email_change, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token)
VALUES
  ('e5a00000-0000-4000-8000-0000000000aa', 'erasure-admin@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}',
   '{"display_name":"Syntetisk superadmin"}', '', '', '', '', '', '', '', ''),
  ('e5a00000-0000-4000-8000-000000000001', 'erasure-holder@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}',
   '{"display_name":"Syntetisk kandidat"}', '', '', '', '', '', '', '', '');

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  FROM auth.users u
 WHERE u.id IN ('e5a00000-0000-4000-8000-0000000000aa', 'e5a00000-0000-4000-8000-000000000001')
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES ('e5a00000-0000-4000-8000-0000000000aa', 'superadmin')
ON CONFLICT DO NOTHING;

-- The Passport underlag of the candidate.
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name, issued_on)
VALUES ('e5a0c000-0000-4000-8000-000000000001', 'e5a00000-0000-4000-8000-000000000001',
        'certification', 'INTL_ASIS_CPP', 'Certified Protection Professional (CPP)', 'ASIS International', DATE '2026-01-01');

SELECT set_config('request.jwt.claim.sub', 'e5a00000-0000-4000-8000-000000000001', true);
INSERT INTO public.sp_credential_details (claim_id, credential_class, original_language, issuing_country_code, no_expiry)
VALUES ('e5a0c000-0000-4000-8000-000000000001', 'certification', NULL, NULL, false);
SELECT set_config('request.jwt.claim.sub', '', true);

INSERT INTO public.sp_evidence (id, holder_user_id, claim_id, file_name, mime_type, size_bytes, sha256, storage_path)
VALUES ('e5a0e000-0000-4000-8000-000000000001', 'e5a00000-0000-4000-8000-000000000001',
        'e5a0c000-0000-4000-8000-000000000001', 'intyg.pdf', 'application/pdf', 1024, repeat('e', 64),
        'e5a00000-0000-4000-8000-000000000001/intyg.pdf');

INSERT INTO public.sp_evidence_extractions (evidence_id, process_version, source_fingerprint, original_source,
                                            sensitivity, retention_state, extraction_status, confidence)
VALUES ('e5a0e000-0000-4000-8000-000000000001', 'hayat-test-1', repeat('a', 64), 'intyg.pdf',
        'personal', 'retained', 'completed', 0.9);

-- The candidate's own feedback: kept, with the link to the account removed.
INSERT INTO public.beta_feedback (id, user_id, category, message)
VALUES ('e5a0f000-0000-4000-8000-000000000001', 'e5a00000-0000-4000-8000-000000000001', 'idea',
        'Syntetisk feedback från fixturen');

COMMIT;

SELECT 'fixture: admin=' || (SELECT count(*) FROM auth.users WHERE id = 'e5a00000-0000-4000-8000-0000000000aa')
    || ' holder=' || (SELECT count(*) FROM auth.users WHERE id = 'e5a00000-0000-4000-8000-000000000001')
    || ' details=' || (SELECT count(*) FROM public.sp_credential_details WHERE claim_id = 'e5a0c000-0000-4000-8000-000000000001')
    || ' reading=' || (SELECT count(*) FROM public.sp_evidence_extractions WHERE evidence_id = 'e5a0e000-0000-4000-8000-000000000001')
    || ' feedback=' || (SELECT count(*) FROM public.beta_feedback WHERE id = 'e5a0f000-0000-4000-8000-000000000001');
