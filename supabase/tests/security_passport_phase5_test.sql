-- =============================================================================
-- Security Passport — Phase 5 assertions
--
-- Phase 3 proved the trust core. This suite proves the layer that makes it
-- usable, and the two things that layer could most easily get wrong:
--
--   * STORAGE. Evidence bytes live outside the tables RLS protects, so the
--     bucket needs its own denial proof: cross-holder, cross-employer,
--     anonymous, and a verifier whose review has closed.
--   * THE PUBLIC BOUNDARY. anon lost direct database execution; the
--     recipient path now runs behind a throttle. Both need asserting, and
--     the throttled response must be indistinguishable from every other
--     unavailable one.
--
-- Plus the remaining controlled transitions: withdraw a request, withdraw
-- evidence (and the honest fallback to SELF_DECLARED), raise a dispute, and
-- revoke a verification with its attribution intact.
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

/* Storage RLS is expressed as policies on storage.objects. Evaluating one
   without going through the Storage API means asking Postgres the same
   question the policy asks: can THIS role, acting as THIS user, see a row
   with this object name. `pg_temp.can_read_object` does exactly that against
   a real inserted row, so the assertions below test the deployed policy
   rather than a paraphrase of it. */
CREATE OR REPLACE FUNCTION pg_temp.can_read_object(_actor uuid, _name text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE _visible boolean;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _actor::text, true);
  SELECT EXISTS (SELECT 1 FROM storage.objects
                  WHERE bucket_id = 'passport-evidence' AND name = _name)
    INTO _visible;
  RESET ROLE;
  RETURN _visible;
END $$;

\echo '==> Security Passport Phase 5'

-- Fixtures. Clearly fictional, and separate from the Phase 3 identities so
-- neither suite can be made to pass by the other's leftovers.
INSERT INTO auth.users (id, email) VALUES
  ('c0000000-0000-0000-0000-000000000001','p5-holder@example.test'),
  ('c0000000-0000-0000-0000-000000000002','p5-verifier@example.test'),
  ('c0000000-0000-0000-0000-000000000003','p5-employer@example.test'),
  ('c0000000-0000-0000-0000-000000000004','p5-other-holder@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('c0000000-0000-0000-0000-000000000002','admin') ON CONFLICT DO NOTHING;

INSERT INTO public.employers (id, slug, name, status)
VALUES ('c0000000-0000-0000-0000-0000000000e1','p5-employer','P5 Employer AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('c0000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-000000000003','owner','active')
ON CONFLICT DO NOTHING;

DO $$
DECLARE _h uuid := 'c0000000-0000-0000-0000-000000000001';
        _o uuid := 'c0000000-0000-0000-0000-000000000004';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, cig_profession_slug)
  VALUES (_h, 'P5 Holder', 'vaktare');
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, claimed_issuer_name)
  VALUES (_h, 'licence', 'Väktarlegitimation (fiktiv)', 'Länsstyrelsen (fiktiv)');
  INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, started_on, ended_on)
  VALUES (_h, 'P5 Employer AB (fiktiv)', 'Väktare', DATE '2019-01-01', DATE '2023-01-01');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name)
  VALUES (_o, 'P5 Other Holder');
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title)
  VALUES (_o, 'training', 'Annan utbildning (fiktiv)');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 1 -- the evidence bucket is private and holder-scoped'
-- =============================================================================
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'passport-evidence'),
  '1.1 the passport-evidence bucket exists');

SELECT pg_temp.ok(
  (SELECT public FROM storage.buckets WHERE id = 'passport-evidence') = false,
  '1.2 the bucket is PRIVATE — no object is publicly addressable');

SELECT pg_temp.ok(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'passport-evidence') = 10485760,
  '1.3 the bucket carries a size ceiling');

SELECT pg_temp.ok(
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'passport-evidence')
    @> ARRAY['application/pdf','image/jpeg','image/png','image/heic'],
  '1.4 the bucket carries a MIME allowlist');

SELECT pg_temp.ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass),
  '1.5 RLS is enabled on storage.objects');

-- =============================================================================
\echo '    GROUP 2 -- cross-holder, employer and anon denial on the bucket'
-- =============================================================================
DO $$
DECLARE _h uuid := 'c0000000-0000-0000-0000-000000000001';
        _o uuid := 'c0000000-0000-0000-0000-000000000004';
        _v uuid := 'c0000000-0000-0000-0000-000000000002';
        _e uuid := 'c0000000-0000-0000-0000-000000000003';
        _claim uuid; _path text; _anon_visible boolean;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims WHERE holder_user_id = _h;
  _path := _h::text || '/p5-evidence.pdf';

  -- The object itself is seeded with the owner role, as the Storage service
  -- does; every assertion below then reads it back through the policies.
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('passport-evidence', _path, _h)
  ON CONFLICT DO NOTHING;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_attach_evidence(_claim, NULL, _path, 'licens.pdf',
                                    'application/pdf', 90000, 'cafebabe');
  RESET ROLE;

  PERFORM pg_temp.ok(pg_temp.can_read_object(_h, _path),
    '2.1 the holder can read their own evidence object');

  PERFORM pg_temp.ok(NOT pg_temp.can_read_object(_o, _path),
    '2.2 a DIFFERENT holder cannot read it');

  PERFORM pg_temp.ok(NOT pg_temp.can_read_object(_e, _path),
    '2.3 an employer representative cannot read it — employers never receive evidence');

  -- A verifier with no open review is exactly as excluded as a stranger.
  PERFORM pg_temp.ok(NOT pg_temp.can_read_object(_v, _path),
    '2.4 a verifier with NO open review cannot read it');

  SET LOCAL ROLE anon;
  SELECT EXISTS (SELECT 1 FROM storage.objects
                  WHERE bucket_id='passport-evidence' AND name=_path) INTO _anon_visible;
  RESET ROLE;
  PERFORM pg_temp.ok(NOT _anon_visible, '2.5 anon cannot read it');

  -- Writing into somebody else's folder is refused by the INSERT policy.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail(
    format('INSERT INTO storage.objects (bucket_id, name, owner) VALUES (%L,%L,%L)',
           'passport-evidence', _h::text || '/forged.pdf', _o),
    'row-level security',
    '2.6 a holder cannot write into another holder''s folder');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 3 -- verifier access begins and ends with the review'
-- =============================================================================
DO $$
DECLARE _h uuid := 'c0000000-0000-0000-0000-000000000001';
        _v uuid := 'c0000000-0000-0000-0000-000000000002';
        _claim uuid; _req uuid; _path text;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims WHERE holder_user_id = _h;
  _path := _h::text || '/p5-evidence.pdf';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;

  PERFORM pg_temp.ok(pg_temp.can_read_object(_v, _path),
    '3.1 a verifier CAN read the evidence while the review is open');

  -- The queue read exists so a verifier never needs a blanket table grant.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM pg_temp.ok(
    jsonb_array_length(public.sp_verifier_queue(NULL)) >= 1,
    '3.2 the verifier queue returns the open request');
  PERFORM pg_temp.ok(
    (public.sp_verifier_request_detail(_req)->>'holder_name') = 'P5 Holder',
    '3.3 the detail view names the holder the reviewer is checking');
  PERFORM pg_temp.ok(
    jsonb_array_length(public.sp_verifier_request_detail(_req)->'evidence') = 1,
    '3.4 the detail view lists the document to review');

  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'internal: register matches', 'Godkänd.', CURRENT_DATE, CURRENT_DATE + 365);
  RESET ROLE;

  -- The grant was bounded by the review, not by the role: closing the review
  -- ends the access with no revocation step to forget.
  PERFORM pg_temp.ok(NOT pg_temp.can_read_object(_v, _path),
    '3.5 once decided, the verifier can no longer read the evidence');

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id=_claim) = 'verified',
    '3.6 the decision produced VERIFIED');
END $$;

-- A non-verifier cannot reach the queue at all.
DO $$
DECLARE _o uuid := 'c0000000-0000-0000-0000-000000000004';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail('SELECT public.sp_verifier_queue(NULL)',
    'SP_NOT_VERIFIER', '3.7 a non-verifier cannot open the queue');
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_employer_attestation_queue(%L)',
           'c0000000-0000-0000-0000-0000000000e1'),
    'SP_NOT_EMPLOYER_REPRESENTATIVE',
    '3.8 a non-member cannot open an employer''s attestation queue');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 4 -- the employer sees one period and nothing else'
-- =============================================================================
DO $$
DECLARE _h uuid := 'c0000000-0000-0000-0000-000000000001';
        _e uuid := 'c0000000-0000-0000-0000-000000000003';
        _period uuid; _req uuid; _q jsonb; _row jsonb;
BEGIN
  SELECT id INTO _period FROM public.sp_experience_periods WHERE holder_user_id = _h;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation',
                                            'c0000000-0000-0000-0000-0000000000e1');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _e::text, true);
  _q := public.sp_employer_attestation_queue('c0000000-0000-0000-0000-0000000000e1');
  RESET ROLE;

  PERFORM pg_temp.ok(jsonb_array_length(_q) = 1,
    '4.1 the employer sees exactly one request');

  _row := _q->0;
  PERFORM pg_temp.ok(_row->>'role_title' = 'Väktare',
    '4.2 and the employment it is being asked about');

  -- The qualification, the other holder and the evidence must all be absent
  -- from the payload itself — not merely absent from the screen.
  PERFORM pg_temp.ok(_q::text NOT LIKE '%Väktarlegitimation%',
    '4.3 qualifications are NOT in the employer payload');
  PERFORM pg_temp.ok(_q::text NOT LIKE '%p5-evidence.pdf%',
    '4.4 evidence is NOT in the employer payload');
  PERFORM pg_temp.ok(_q::text NOT LIKE '%P5 Other Holder%',
    '4.5 no other holder appears — the queue is not an enumeration surface');
END $$;

-- =============================================================================
\echo '    GROUP 5 -- withdrawal, dispute and revocation'
-- =============================================================================
DO $$
DECLARE _h uuid := 'c0000000-0000-0000-0000-000000000001';
        _o uuid := 'c0000000-0000-0000-0000-000000000004';
        _claim2 uuid; _req uuid; _ev uuid; _lvl text; _status text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title)
  VALUES (_h, 'certification', 'Hjärt- och lungräddning (fiktiv)')
  RETURNING id INTO _claim2;

  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('passport-evidence', _h::text || '/p5-hlr.pdf', _h) ON CONFLICT DO NOTHING;

  _ev := public.sp_attach_evidence(_claim2, NULL, _h::text || '/p5-hlr.pdf',
           'hlr.pdf', 'application/pdf', 40000, 'feedface');

  SELECT assertion_level INTO _lvl FROM public.sp_claims WHERE id = _claim2;
  PERFORM pg_temp.ok(_lvl = 'document_provided',
    '5.1 the upload ceiling still holds after Phase 5');

  _req := public.sp_submit_for_verification(_claim2, NULL, 'cqrityjob_review', NULL);

  -- Evidence cannot be pulled out from under an open review: a decision must
  -- always rest on something a later reader can still look at.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_withdraw_evidence(%L)', _ev),
    'SP_EVIDENCE_UNDER_REVIEW',
    '5.2 evidence cannot be withdrawn while a review is open');

  PERFORM public.sp_withdraw_verification_request(_req);
  SELECT status INTO _status FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_status = 'withdrawn', '5.3 the holder can withdraw their own request');

  -- With the review closed, withdrawal is allowed — and the claim must fall
  -- back to SELF_DECLARED, because the document it asserted is gone.
  PERFORM public.sp_withdraw_evidence(_ev);
  SELECT assertion_level INTO _lvl FROM public.sp_claims WHERE id = _claim2;
  PERFORM pg_temp.ok(_lvl = 'self_declared',
    '5.4 removing the last document returns the claim to SELF_DECLARED');

  PERFORM public.sp_raise_dispute(_claim2, NULL, 'Fel utfärdare');
  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id=_claim2) = 'disputed',
    '5.5 a holder can mark their own entry disputed');
  RESET ROLE;

  -- Another holder cannot touch either.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_raise_dispute(%L, NULL, ''x'')', _claim2),
    'SP_NOT_HOLDER', '5.6 a stranger cannot dispute someone else''s entry');
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_withdraw_verification_request(%L)', _req),
    'SP_', '5.7 a stranger cannot withdraw someone else''s request');
  RESET ROLE;
END $$;

-- Revocation: verifier only, attributed, and it survives as history.
DO $$
DECLARE _h uuid := 'c0000000-0000-0000-0000-000000000001';
        _v uuid := 'c0000000-0000-0000-0000-000000000002';
        _claim uuid; _n integer;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND assertion_level = 'verified' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_revoke(%L, NULL, ''mine now'')', _claim),
    'SP_NOT_VERIFIER',
    '5.8 a holder cannot revoke — not even their own verification');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_revoke(_claim, NULL, 'Utfärdaren har återkallat');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id=_claim) = 'revoked',
    '5.9 a verifier can revoke a verification');

  -- The assertion level is deliberately untouched: somebody really did
  -- verify it once, and erasing that would rewrite history rather than
  -- record its end.
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id=_claim) = 'verified',
    '5.10 revocation moves LIFECYCLE only — the verification still happened');

  SELECT count(*) INTO _n FROM public.sp_verification_decisions d
    JOIN public.sp_verification_requests r ON r.id = d.request_id
   WHERE r.claim_id = _claim AND d.decision = 'revoked';
  PERFORM pg_temp.ok(_n = 1, '5.11 the revocation is recorded against the same claim''s request');

  PERFORM pg_temp.ok(
    (SELECT decider_organisation FROM public.sp_verification_decisions d
      JOIN public.sp_verification_requests r ON r.id = d.request_id
     WHERE r.claim_id = _claim AND d.decision='revoked') = 'CQrityjob',
    '5.12 with attribution');
END $$;

-- =============================================================================
\echo '    GROUP 6 -- a revoked claim stops being disclosed'
-- =============================================================================
DO $$
DECLARE _h uuid := 'c0000000-0000-0000-0000-000000000001'; _tok text; _payload jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _tok := public.sp_create_disclosure('full_verification', 30, NULL, NULL);
  RESET ROLE;

  SET LOCAL ROLE service_role;
  _payload := public.sp_get_disclosure(_tok);
  RESET ROLE;

  PERFORM pg_temp.ok(_payload->>'status' = 'active', '6.1 the share resolves');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Väktarlegitimation%',
    '6.2 the REVOKED credential is no longer disclosed');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Hjärt- och lungräddning%',
    '6.3 the DISPUTED credential is not disclosed either');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%p5-evidence.pdf%',
    '6.4 private evidence is still absent');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%register matches%',
    '6.5 internal reviewer notes are still absent');
  PERFORM pg_temp.ok(_payload ? 'verified_experience_days',
    '6.6 the aggregate tenure field is present for the recipient');
END $$;

-- =============================================================================
\echo '    GROUP 7 -- the public boundary'
-- =============================================================================
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_get_disclosure(text)', 'EXECUTE'),
  '7.1 anon cannot execute the recipient function directly');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_routine_grants
    WHERE grantee='anon' AND routine_schema='public' AND routine_name LIKE 'sp\_%') = 0,
  '7.2 anon can execute NO sp_* function at all');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_is_verifier(uuid)', 'EXECUTE'),
  '7.3 even the capability probe is closed to anon');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_throttle_public_access(text,integer,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.sp_throttle_public_access(text,integer,integer)', 'EXECUTE'),
  '7.4 the throttle is reachable only by the application server');

SELECT pg_temp.ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.sp_public_access_throttle'::regclass)
  AND NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname='public' AND tablename='sp_public_access_throttle'),
  '7.5 throttle state has RLS on and no policy — nobody but the definer reads it');

-- The limit actually bites, and the window is real.
DO $$
DECLARE _allowed boolean; _i integer;
BEGIN
  SET LOCAL ROLE service_role;
  FOR _i IN 1..30 LOOP
    _allowed := public.sp_throttle_public_access('p5-test-client', 30, 300);
  END LOOP;
  PERFORM pg_temp.ok(_allowed, '7.6 attempts up to the limit are allowed');

  _allowed := public.sp_throttle_public_access('p5-test-client', 30, 300);
  PERFORM pg_temp.ok(NOT _allowed, '7.7 the attempt past the limit is refused');

  -- A different client is unaffected: the limit is per-client, not global,
  -- so one abuser cannot deny the endpoint to everybody else.
  _allowed := public.sp_throttle_public_access('p5-other-client', 30, 300);
  PERFORM pg_temp.ok(_allowed, '7.8 a different client is not affected');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 8 -- no sp_* trigger function carries a stray PUBLIC grant'
-- =============================================================================
-- This is the production hardening that was applied by hand during the
-- Phase 2 audit, now asserted so a rebuild from migrations reaches the same
-- state and a future CREATE OR REPLACE cannot silently restore the default.
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_guard_events_append_only()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_guard_trust_fields_immutable()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_guard_decisions_append_only()', 'EXECUTE'),
  '8.1 the trigger guards carry no anon EXECUTE');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'sp\_%'
      AND NOT c.relrowsecurity) = 0,
  '8.2 RLS remains enabled on every sp_* table, including the new one');

-- =============================================================================
\echo '    GROUP 9 -- pgcrypto is reachable where it actually lives'
-- =============================================================================
-- This suite passed locally and the product still broke in production: a
-- plain CREATE EXTENSION puts pgcrypto in `public` here, but Supabase keeps
-- it in `extensions`, so `SET search_path = public` could not find digest()
-- or gen_random_bytes(). Creating a share and opening a share link both
-- failed on the hosted project and nowhere else.
--
-- Asserting the search_path rather than the behaviour is deliberate: the
-- behaviour is environment-dependent and would keep passing here for the
-- wrong reason. The declaration is the thing that was wrong.
SELECT pg_temp.ok(
  (SELECT p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='sp_get_disclosure')
    @> ARRAY['search_path=public, extensions'],
  '9.1 sp_get_disclosure can reach pgcrypto wherever the platform installs it');

SELECT pg_temp.ok(
  (SELECT p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='sp_create_disclosure')
    @> ARRAY['search_path=public, extensions'],
  '9.2 sp_create_disclosure can too');

SELECT pg_temp.ok(
  (SELECT p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='sp_create_credential_disclosure')
    @> ARRAY['search_path=public, extensions'],
  '9.2b so can sp_create_credential_disclosure (Phase 9), which mints a token');

-- Every other sp_* function must keep the narrow search_path. A blanket
-- widening would be a privilege-escalation surface, so only the functions
-- that genuinely need pgcrypto are allowed the second schema.
--
-- Asserted BY NAME rather than by count. A count passes just as happily when
-- one allowed function is removed and an unrelated one widens, which is the
-- exact substitution this check exists to catch.
SELECT pg_temp.ok(
  (SELECT coalesce(array_agg(p.proname ORDER BY p.proname), ARRAY[]::name[])
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'sp\_%'
      AND p.prosecdef
      AND p.proconfig IS NOT NULL
      AND p.proconfig @> ARRAY['search_path=public, extensions'])
    = ARRAY['sp_create_credential_disclosure','sp_create_disclosure','sp_get_disclosure']::name[],
  '9.3 and exactly those three SECURITY DEFINER functions widened their search_path');

\echo '    ok  Security Passport Phase 5 assertions passed'
