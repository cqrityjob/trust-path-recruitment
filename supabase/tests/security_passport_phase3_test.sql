-- =============================================================================
-- Security Passport — Phase 3/4 assertions
--
-- Proves the trust boundaries that make "Verified" mean something:
--   * an upload can only reach DOCUMENT_PROVIDED;
--   * no path lets a holder verify themselves;
--   * only an authorised verifier can produce VERIFIED, with attribution;
--   * an employer sees one request and nothing else;
--   * a disclosure cannot exceed its package;
--   * expired and revoked shares fail closed, identically.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF needle <> '' AND position(lower(needle) IN lower(_msg)) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- wrong error: %', label, _msg;
    END IF;
    RAISE NOTICE 'ok  % (refused: %)', label, left(_msg, 80);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- SUCCEEDED but must be refused', label;
END $$;

\echo '==> Security Passport Phase 3/4'

-- Fixtures: holder, verifier (platform admin), employer rep, outsider.
INSERT INTO auth.users (id, email) VALUES
  ('b0000000-0000-0000-0000-000000000001','p3-holder@example.test'),
  ('b0000000-0000-0000-0000-000000000002','p3-verifier@example.test'),
  ('b0000000-0000-0000-0000-000000000003','p3-employer@example.test'),
  ('b0000000-0000-0000-0000-000000000004','p3-outsider@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('b0000000-0000-0000-0000-000000000002','admin') ON CONFLICT DO NOTHING;

INSERT INTO public.employers (id, slug, name, status)
VALUES ('b0000000-0000-0000-0000-0000000000e1','p3-employer','P3 Employer AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-0000000000e1','b0000000-0000-0000-0000-000000000003','owner','active')
ON CONFLICT DO NOTHING;

-- Holder builds a Passport.
DO $$
DECLARE _h uuid := 'b0000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, cig_profession_slug)
  VALUES (_h, 'P3 Holder', 'vaktare');
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, claimed_issuer_name)
  VALUES (_h, 'training', 'Väktargrundutbildning', 'Nordvakt (fiktiv)');
  INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, started_on, ended_on)
  VALUES (_h, 'P3 Employer AB (fiktiv)', 'Väktare', DATE '2020-01-01', DATE '2024-01-01');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 1 -- evidence can only reach DOCUMENT_PROVIDED'
-- =============================================================================
DO $$
DECLARE _h uuid := 'b0000000-0000-0000-0000-000000000001'; _claim uuid; _lvl text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT id INTO _claim FROM public.sp_claims WHERE holder_user_id = _h;

  PERFORM public.sp_attach_evidence(_claim, NULL,
    _h::text || '/evidence-1.pdf', 'diploma.pdf', 'application/pdf', 120000, 'deadbeef');

  SELECT assertion_level INTO _lvl FROM public.sp_claims WHERE id = _claim;
  PERFORM pg_temp.ok(_lvl = 'document_provided',
    '1.1 uploading evidence raises the claim to DOCUMENT_PROVIDED');
  PERFORM pg_temp.ok(_lvl <> 'verified',
    '1.2 uploading evidence does NOT make a claim verified');

  -- Evidence pointing at somebody else's folder is refused.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_attach_evidence(%L, NULL, %L, ''x.pdf'', ''application/pdf'', 100, NULL)',
           _claim, 'b0000000-0000-0000-0000-000000000004/steal.pdf'),
    'SP_EVIDENCE_PATH_NOT_OWNED',
    '1.3 evidence path must belong to the holder');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 2 -- no path to self-verification'
-- =============================================================================
DO $$
DECLARE _h uuid := 'b0000000-0000-0000-0000-000000000001'; _claim uuid; _req uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT id INTO _claim FROM public.sp_claims WHERE holder_user_id = _h;

  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_claims SET assertion_level=''verified'' WHERE id=%L', _claim),
    'SP_TRUST_FIELD_IMMUTABLE',
    '2.1 holder cannot set VERIFIED directly');

  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  PERFORM pg_temp.ok(_req IS NOT NULL, '2.2 holder can submit a request');

  -- The holder is not a verifier, and is the subject: refused twice over.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'', ''n'', ''m'', NULL, NULL)', _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '2.3 holder cannot decide their own request');
  RESET ROLE;
END $$;

-- An ordinary signed-in user is not a verifier.
DO $$
DECLARE _req uuid;
BEGIN
  SELECT id INTO _req FROM public.sp_verification_requests WHERE status='pending' LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000004', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'', ''n'', ''m'', NULL, NULL)', _req),
    'SP_NOT_VERIFIER',
    '2.4 a non-verifier cannot decide');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 3 -- verifier decision is the only route to VERIFIED'
-- =============================================================================
DO $$
DECLARE _req uuid; _claim uuid; _lvl text; _by uuid; _at timestamptz; _org text; _method text;
BEGIN
  SELECT id, claim_id INTO _req, _claim FROM public.sp_verification_requests WHERE status='pending' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'internal: diploma matches issuer register', 'Din utbildning är verifierad.',
    DATE '2024-02-10', DATE '2029-02-09');
  RESET ROLE;

  SELECT assertion_level, verified_by_user_id, verified_at INTO _lvl, _by, _at
    FROM public.sp_claims WHERE id = _claim;
  PERFORM pg_temp.ok(_lvl = 'verified', '3.1 an approved decision produces VERIFIED');
  PERFORM pg_temp.ok(_by = 'b0000000-0000-0000-0000-000000000002',
    '3.2 the verifier is recorded on the claim');
  PERFORM pg_temp.ok(_at IS NOT NULL, '3.3 the verification time is recorded');

  SELECT decider_organisation, verification_method INTO _org, _method
    FROM public.sp_verification_decisions WHERE request_id = _req;
  PERFORM pg_temp.ok(_org = 'CQrityjob', '3.4 the verifying organisation is recorded');
  PERFORM pg_temp.ok(_method = 'document_review', '3.5 the verification method is recorded');

  PERFORM pg_temp.ok(
    (SELECT valid_until FROM public.sp_claims WHERE id=_claim) = DATE '2029-02-09',
    '3.6 validity dates are applied from the decision');
END $$;

-- A decided request cannot be decided again.
DO $$
DECLARE _req uuid;
BEGIN
  SELECT id INTO _req FROM public.sp_verification_requests WHERE status='approved' LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''rejected'', ''document_review'', ''n'', ''m'', NULL, NULL)', _req),
    'SP_REQUEST_ALREADY_DECIDED',
    '3.7 a decided request cannot be re-decided');
  RESET ROLE;
END $$;

-- Decisions are history.
SELECT pg_temp.must_fail(
  'UPDATE public.sp_verification_decisions SET decision_note=''x''',
  'SP_DECISIONS_APPEND_ONLY',
  '3.8 a verification decision cannot be rewritten');

-- =============================================================================
\echo '    GROUP 4 -- employer attestation is claim-specific'
-- =============================================================================
DO $$
DECLARE _h uuid := 'b0000000-0000-0000-0000-000000000001'; _period uuid; _req uuid; _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT id INTO _period FROM public.sp_experience_periods WHERE holder_user_id=_h;
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation',
    'b0000000-0000-0000-0000-0000000000e1');
  RESET ROLE;

  -- The employer representative sees exactly one request.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', true);
  SELECT count(*) INTO _n FROM public.sp_verification_requests;
  PERFORM pg_temp.ok(_n = 1, '4.1 employer sees only the request addressed to them');

  -- ...and nothing else about the holder.
  SELECT count(*) INTO _n FROM public.sp_passport_profiles;
  PERFORM pg_temp.ok(_n = 0, '4.2 employer cannot read the holder''s Passport profile');
  SELECT count(*) INTO _n FROM public.sp_claims;
  PERFORM pg_temp.ok(_n = 0, '4.3 employer cannot read the holder''s claims');
  SELECT count(*) INTO _n FROM public.sp_evidence;
  PERFORM pg_temp.ok(_n = 0, '4.4 employer cannot read the holder''s evidence');

  PERFORM public.sp_verifier_decide(_req, 'approved', 'employer_confirmation',
    'internal note', 'Anställningen är bekräftad.', NULL, NULL);
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_experience_periods WHERE id=_period) = 'verified',
    '4.5 an employer attestation verifies the employment period');
  PERFORM pg_temp.ok(
    (SELECT decider_organisation FROM public.sp_verification_decisions
      WHERE decision='approved' AND verification_method='employer_confirmation')
      = 'P3 Employer AB (fiktiv)',
    '4.6 the attesting organisation is recorded by name');
END $$;

-- An unrelated employer sees nothing.
DO $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000004', true);
  SELECT count(*) INTO _n FROM public.sp_verification_requests;
  PERFORM pg_temp.ok(_n = 0, '4.7 an unrelated user sees no verification requests');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 5 -- disclosure cannot exceed its package'
-- =============================================================================
DO $$
DECLARE _h uuid := 'b0000000-0000-0000-0000-000000000001';
        _tok text; _payload jsonb; _stored text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _tok := public.sp_create_disclosure('verified_qualifications', 30, 'Ansökan', 'Rekryterare');
  RESET ROLE;

  PERFORM pg_temp.ok(length(_tok) = 64, '5.1 the share token is 32 random bytes');

  SELECT token_hash INTO _stored FROM public.sp_disclosures WHERE holder_user_id=_h;
  PERFORM pg_temp.ok(_stored <> _tok, '5.2 the plaintext token is NOT stored');
  PERFORM pg_temp.ok(_stored = encode(digest(_tok,'sha256'),'hex'),
    '5.3 only the token hash is stored');

  -- The recipient path. Phase 5 moved execution behind the application
  -- server, so the caller here is service_role rather than anon. Every
  -- assertion below is unchanged: what is disclosed must not depend on who
  -- makes the call, only on the package and the token.
  SET LOCAL ROLE service_role;
  _payload := public.sp_get_disclosure(_tok);
  PERFORM pg_temp.ok(_payload->>'status' = 'active', '5.4 a valid token returns an active payload');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_claims') = 1,
    '5.5 the verified qualification is disclosed');
  -- The package is "verified qualifications": experience must NOT appear.
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_experience') = 0,
    '5.6 employment is NOT disclosed by a qualifications package');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%evidence-1.pdf%',
    '5.7 private evidence never appears in a disclosure');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%diploma matches issuer register%',
    '5.8 internal reviewer notes never appear in a disclosure');
  PERFORM pg_temp.ok(_payload->'verified_claims'->0->>'verifier_organisation' = 'CQrityjob',
    '5.9 the recipient is told who verified it');
  RESET ROLE;
END $$;

-- Expired and revoked fail closed, identically to an unknown token.
DO $$
DECLARE _h uuid := 'b0000000-0000-0000-0000-000000000001'; _tok text; _id uuid;
        _unknown jsonb; _revoked jsonb; _expired jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _tok := public.sp_create_disclosure('full_verification', 30, NULL, NULL);
  SELECT id INTO _id FROM public.sp_disclosures WHERE token_hash = encode(digest(_tok,'sha256'),'hex');
  PERFORM public.sp_revoke_disclosure(_id);
  RESET ROLE;

  SET LOCAL ROLE service_role;
  _revoked := public.sp_get_disclosure(_tok);
  _unknown := public.sp_get_disclosure('deadbeef');
  PERFORM pg_temp.ok(_revoked->>'status' = 'unavailable', '5.10 a revoked share fails closed');
  PERFORM pg_temp.ok(_revoked = _unknown,
    '5.11 revoked and unknown tokens are byte-identical (no enumeration oracle)');
  RESET ROLE;

  -- Expiry.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _tok := public.sp_create_disclosure('public_card', 30, NULL, NULL);
  RESET ROLE;
  UPDATE public.sp_disclosures SET expires_at = now() - interval '1 day'
   WHERE token_hash = encode(digest(_tok,'sha256'),'hex');

  SET LOCAL ROLE service_role;
  _expired := public.sp_get_disclosure(_tok);
  PERFORM pg_temp.ok(_expired->>'status' = 'unavailable', '5.12 an expired share fails closed');
  PERFORM pg_temp.ok(_expired = _unknown, '5.13 expired and unknown are byte-identical');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 6 -- anon reaches nothing but the one function'
-- =============================================================================
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
               WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'sp\_%'),
  '6.1 anon holds no table grant on any sp_* table');

-- Phase 3 granted sp_get_disclosure to anon so the recipient page could call
-- it directly. Phase 5 removed that: the only public endpoint in the product
-- now sits behind the application server, where a rate limit can reach it.
-- The assertion inverts accordingly, and gets stricter — anon has NO
-- execution anywhere in this domain.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_routine_grants
    WHERE grantee='anon' AND routine_schema='public' AND routine_name LIKE 'sp\_%') = 0,
  '6.2 anon may execute NO sp_* function');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_get_disclosure(text)', 'EXECUTE'),
  '6.3 the recipient function is specifically closed to anon');

SELECT pg_temp.ok(
  has_function_privilege('service_role', 'public.sp_get_disclosure(text)', 'EXECUTE'),
  '6.3b and reachable by the application server');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'sp\_%'
      AND NOT c.relrowsecurity) = 0,
  '6.4 RLS is enabled on every sp_* table');

\echo '    ok  Security Passport Phase 3/4 assertions passed'
