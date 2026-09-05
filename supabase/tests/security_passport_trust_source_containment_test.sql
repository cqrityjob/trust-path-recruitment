-- =============================================================================
-- Security Passport — trust-source containment assertions
--
-- The rule under test (20261030090000): the verification METHOD an approval
-- records must belong to the party deciding.
--
--     cqrityjob_review      ⇒ document_review, and nothing else
--     employer_attestation  ⇒ employer_confirmation, and nothing else
--     issuer_confirmation   ⇒ refused for every request kind, this phase
--
-- Every assertion goes through the SAME boundary an authenticated PostgREST
-- client reaches: the RPC, or a direct statement under RLS as `authenticated`.
-- Where an attempt must be refused, the refusal alone is not asserted -- the
-- holder's trust record is fingerprinted before and after, because "it raised"
-- and "it wrote nothing" are different claims and only the second is the
-- security property.
--
-- The migration is also RE-APPLIED in the middle of this suite (GROUP 7) over
-- manufactured legacy rows, to prove it is prospective: it must succeed with
-- the past in place and must not rewrite a byte of it.
--
-- All identities are transparently fictional and use a `d6` prefix.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
SET search_path = public, extensions;

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

-- Everything a decision is allowed to touch, for one holder, in one string.
-- SECURITY DEFINER: this is the suite's measuring instrument, not one of its
-- assertions, and it must see every column -- including `decided_by`, which
-- `authenticated` no longer holds (20261016090000).
CREATE OR REPLACE FUNCTION pg_temp.trust_fingerprint(_holder uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT md5(concat_ws('|',
    (SELECT coalesce(string_agg(concat_ws(',', id, status, decided_by, decided_at,
                                          verification_method, valid_from, valid_until),
                                ';' ORDER BY id), '')
       FROM public.sp_verification_requests WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, decision, decided_by, decider_organisation,
                                          verification_method, decided_at),
                                ';' ORDER BY id), '')
       FROM public.sp_verification_decisions WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, assertion_level, lifecycle_state,
                                          verified_by_user_id, verified_at),
                                ';' ORDER BY id), '')
       FROM public.sp_claims WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, assertion_level, lifecycle_state),
                                ';' ORDER BY id), '')
       FROM public.sp_experience_periods WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, event_type, subject_id), ';' ORDER BY id), '')
       FROM public.sp_passport_events WHERE holder_user_id = _holder)
  ));
$$;

\echo '==> Security Passport trust-source containment'

-- -----------------------------------------------------------------------------
-- Fictional cast
-- -----------------------------------------------------------------------------
--   ...01  the holder. A VU1 claim and an employment period.
--   ...02  a second holder who is ALSO a platform admin -- the self-verification case.
--   ...03  owner of Bevakning D -- the employer the holder worked for.
--   ...04  a third holder, carrying the manufactured legacy rows.
--   ...09  a CQrityjob verifier (platform admin).
INSERT INTO auth.users (id, email) VALUES
  ('d6000000-0000-0000-0000-000000000001','tsc-holder@example.test'),
  ('d6000000-0000-0000-0000-000000000002','tsc-holder-admin@example.test'),
  ('d6000000-0000-0000-0000-000000000003','tsc-employer-d@example.test'),
  ('d6000000-0000-0000-0000-000000000004','tsc-legacy-holder@example.test'),
  ('d6000000-0000-0000-0000-000000000009','tsc-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('d6000000-0000-0000-0000-000000000001','Tova Tillit (fiktiv)'),
  ('d6000000-0000-0000-0000-000000000002','Ragnar Roll (fiktiv)'),
  ('d6000000-0000-0000-0000-000000000004','Lars Legacy (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d6000000-0000-0000-0000-000000000002','admin'),
  ('d6000000-0000-0000-0000-000000000009','admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.employers (id, slug, name, status) VALUES
  ('d6000000-0000-0000-0000-0000000000e1','tsc-bevakning-d','Bevakning D AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('d6000000-0000-0000-0000-0000000000e1','d6000000-0000-0000-0000-000000000003','owner','active')
ON CONFLICT DO NOTHING;

-- Fixture builders. SECURITY DEFINER so they write the STARTING state directly;
-- nothing asserted below runs with these privileges.
CREATE OR REPLACE FUNCTION pg_temp.new_claim(_holder uuid, _code text DEFAULT 'VU1')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _claim uuid;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, assertion_level,
     lifecycle_state, claimed_issuer_name, valid_from, valid_until)
  VALUES (_holder,
          (SELECT claim_type FROM public.sp_credential_types WHERE code = _code),
          (SELECT name_sv FROM public.sp_credential_types WHERE code = _code),
          _code, 'document_provided', 'active',
          'Fiktiv utbildningsanordnare', DATE '2026-01-01', DATE '2027-12-31')
  RETURNING id INTO _claim;
  RETURN _claim;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.new_period(_holder uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p uuid;
BEGIN
  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, employment_type, fte_fraction,
     security_relevance, security_fraction, started_on, ended_on)
  VALUES (_holder, 'Bevakning D AB (fiktiv)', 'Väktare', 'full_time', 1.00,
          'primary', 1.00, DATE '2022-03-01', DATE '2024-03-01')
  RETURNING id INTO _p;
  RETURN _p;
END $$;


-- =============================================================================
\echo '    GROUP 1 -- a CQrityjob review records document_review, and nothing else'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000001';
        _claim uuid; _req uuid; _before text;
BEGIN
  _claim := pg_temp.new_claim(_h, 'VU1');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;

  _before := pg_temp.trust_fingerprint(_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000009', true);

  -- 1.1 THE DEFECT. A reviewer who read a document records "the employer confirmed".
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
            NULL, NULL, DATE ''2026-01-01'', DATE ''2027-12-31'')', _req),
    'SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW',
    '1.1 a CQrityjob review cannot be approved as employer_confirmation');

  -- 1.2 THE DEFECT, other half. "The issuer confirmed" with no issuer in the room.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''issuer_confirmation'',
            NULL, NULL, DATE ''2026-01-01'', DATE ''2027-12-31'')', _req),
    'SP_ISSUER_CONFIRMATION_NOT_AVAILABLE',
    '1.2 a CQrityjob review cannot be approved as issuer_confirmation');
  RESET ROLE;

  PERFORM pg_temp.ok(_before = pg_temp.trust_fingerprint(_h),
    '1.3 both refusals wrote nothing -- no decision, no event, no trust change');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'document_provided',
    '1.4 the credential is still only document_provided');

  -- 1.5 The legitimate shape still works, unchanged.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000009', true);
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'intern anteckning', NULL, DATE '2026-01-01', DATE '2027-12-31');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'verified',
    '1.5 cqrityjob_review + document_review reaches VERIFIED for an authorised verifier');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'approved'
        AND verification_method = 'document_review'
        AND decider_organisation = 'CQrityjob') = 1,
    '1.6 the decision row says document_review, decided by CQrityjob');
END $$;


-- =============================================================================
\echo '    GROUP 2 -- an employer attestation records employer_confirmation, and nothing else'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000001';
        _period uuid; _req uuid; _before text;
BEGIN
  _period := pg_temp.new_period(_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation',
    'd6000000-0000-0000-0000-0000000000e1');
  RESET ROLE;

  _before := pg_temp.trust_fingerprint(_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000003', true);

  -- 2.1 An employer does not "review documents" -- it never receives any.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'',
            NULL, NULL, NULL, NULL)', _req),
    'SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION',
    '2.1 an employer attestation cannot be approved as document_review');

  -- 2.2 And it is not an issuer.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''issuer_confirmation'',
            NULL, NULL, NULL, NULL)', _req),
    'SP_ISSUER_CONFIRMATION_NOT_AVAILABLE',
    '2.2 an employer attestation cannot be approved as issuer_confirmation');
  RESET ROLE;

  PERFORM pg_temp.ok(_before = pg_temp.trust_fingerprint(_h),
    '2.3 both refusals wrote nothing');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_experience_periods WHERE id = _period) = 'self_declared',
    '2.4 the period is still self_declared');

  -- 2.5 The legitimate flow, unchanged: the right employer, the right method.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000003', true);
  PERFORM public.sp_verifier_decide(_req, 'approved', 'employer_confirmation',
    NULL, NULL, NULL, NULL);
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_experience_periods WHERE id = _period) = 'verified',
    '2.5 employer_attestation + employer_confirmation reaches VERIFIED for the employer''s owner');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'approved'
        AND verification_method = 'employer_confirmation'
        AND decider_organisation = 'Bevakning D AB (fiktiv)') = 1,
    '2.6 the decision row names the EMPLOYER as decider, not CQrityjob');
END $$;


-- =============================================================================
\echo '    GROUP 3 -- the RPC is the only door, and a crafted call finds no other'
-- =============================================================================
-- `authenticated` holds SELECT and INSERT on sp_verification_requests, SELECT
-- on sp_verification_decisions, and SELECT/INSERT/UPDATE on sp_claims under
-- RLS. None of those reaches a trust field: this group tries each one the way
-- a hand-written PostgREST request would.
DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000001';
        _claim uuid; _req uuid; _before text;
BEGIN
  _claim := pg_temp.new_claim(_h, 'OV');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;
  _before := pg_temp.trust_fingerprint(_h);

  -- 3.1 The verifier, writing the request row by hand instead of deciding.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000009', true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_verification_requests
               SET status = ''approved'', verification_method = ''issuer_confirmation'',
                   decided_by = %L, decided_at = now()
             WHERE id = %L', 'd6000000-0000-0000-0000-000000000009', _req),
    '',
    '3.1 a verifier cannot write the request''s status or method directly');

  -- 3.2 Nor an append to the decision log.
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_decisions
              (request_id, holder_user_id, decided_by, decider_organisation, decision, verification_method)
            VALUES (%L, %L, %L, ''CQrityjob'', ''approved'', ''issuer_confirmation'')',
           _req, _h, 'd6000000-0000-0000-0000-000000000009'),
    '',
    '3.2 a verifier cannot insert a decision row directly');
  RESET ROLE;

  -- 3.3 The holder, promoting their own claim by hand.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_claims SET assertion_level = ''verified'',
              verified_by_user_id = %L, verified_at = now() WHERE id = %L',
           'd6000000-0000-0000-0000-000000000009', _claim),
    '',
    '3.3 the holder cannot set assertion_level on their own claim');
  RESET ROLE;

  PERFORM pg_temp.ok(_before = pg_temp.trust_fingerprint(_h),
    '3.4 three crafted writes left the holder''s record byte-for-byte unchanged');
  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req) = 'pending',
    '3.5 the request is still pending');

  -- 3.6 And the RPC itself, called with the disallowed method by the one
  --     caller who could otherwise decide it, is refused -- proven in GROUP 1;
  --     repeated here on this request so the group is self-contained.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000009', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''issuer_confirmation'',
            NULL, NULL, DATE ''2026-01-01'', DATE ''2027-12-31'')', _req),
    'SP_ISSUER_CONFIRMATION_NOT_AVAILABLE',
    '3.6 the RPC refuses issuer_confirmation from the verifier who could otherwise decide');
  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 4 -- self-verification is still refused, before the method is even read'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000002';
        _claim uuid; _req uuid; _before text;
BEGIN
  _claim := pg_temp.new_claim(_h, 'VU1');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  _before := pg_temp.trust_fingerprint(_h);

  -- The holder is a platform admin, so sp_is_verifier() is true for them.
  -- The self-verification bar comes first and stays first.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'',
            NULL, NULL, DATE ''2026-01-01'', DATE ''2027-12-31'')', _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '4.1 an admin cannot approve their own request, even with the permitted method');
  RESET ROLE;

  PERFORM pg_temp.ok(_before = pg_temp.trust_fingerprint(_h),
    '4.2 the self-verification attempt wrote nothing');
END $$;


-- =============================================================================
\echo '    GROUP 5 -- employer attestation is still employment-only'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000001'; _claim uuid;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code = 'OV' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(%L, NULL, ''employer_attestation'', %L)',
           _claim, 'd6000000-0000-0000-0000-0000000000e1'),
    'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY',
    '5.1 an employer still cannot be asked to attest to a credential');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.sp_verification_requests'::regclass
        AND conname = 'sp_vr_employer_attestation_is_employment_only') IS NOT NULL,
    '5.2 the row-level employment-only constraint is still in place');
END $$;


-- =============================================================================
\echo '    GROUP 6 -- one final decision per request, and the lock that keeps it'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000001'; _req uuid; _src text;
BEGIN
  SELECT id INTO _req FROM public.sp_verification_requests
   WHERE holder_user_id = _h AND request_kind = 'cqrityjob_review' AND status = 'approved'
   LIMIT 1;

  -- 6.1 A second decision on a decided request is refused by the function.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000009', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'',
            NULL, NULL, DATE ''2026-01-01'', DATE ''2027-12-31'')', _req),
    'SP_REQUEST_ALREADY_DECIDED',
    '6.1 an approved request cannot be decided again');
  RESET ROLE;

  -- 6.2 And by the data, for a writer that skips the function entirely.
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_decisions
              (request_id, holder_user_id, decided_by, decider_organisation, decision, verification_method)
            VALUES (%L, %L, %L, ''CQrityjob'', ''approved'', ''document_review'')',
           _req, _h, 'd6000000-0000-0000-0000-000000000009'),
    'sp_vd_one_final_decision_per_request',
    '6.2 a second final decision row is refused by the partial unique index');

  -- 6.3 The row lock across the read/write gap is still in the body. The
  --     race itself is exercised with two real sessions by
  --     security_passport_decision_race_test.sql; this pins the mechanism.
  SELECT prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide';
  PERFORM pg_temp.ok(_src LIKE '%WHERE id = _request_id FOR UPDATE%',
    '6.3 sp_verifier_decide still locks the request row before reading its status');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
             AND indexname = 'sp_vd_one_final_decision_per_request'),
    '6.4 sp_vd_one_final_decision_per_request still exists');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_decisions_append_only'),
    '6.5 the decision log is still append-only');
END $$;


-- =============================================================================
\echo '    GROUP 7 -- the migration is prospective: legacy rows survive it unchanged'
-- =============================================================================
-- Manufacture exactly the shape production holds -- an approved decision whose
-- method claims a source confirmation while the decider is CQrityjob -- as the
-- superuser, then re-apply the migration over it.
CREATE OR REPLACE FUNCTION pg_temp.legacy_decision(_holder uuid, _method text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _claim uuid; _req uuid; _dec uuid;
        _verifier uuid := 'd6000000-0000-0000-0000-000000000009';
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, assertion_level, lifecycle_state,
     claimed_issuer_name, valid_from, valid_until, verified_by_user_id, verified_at)
  VALUES (_holder, 'training', 'Fiktiv kurs (' || _method || ')', 'verified', 'active',
          'Fiktiv utfärdare', DATE '2025-01-01', DATE '2027-12-31', _verifier, now())
  RETURNING id INTO _claim;

  INSERT INTO public.sp_verification_requests
    (holder_user_id, claim_id, request_kind, status, decided_at, decided_by, verification_method)
  VALUES (_holder, _claim, 'cqrityjob_review', 'approved', now(), _verifier, _method)
  RETURNING id INTO _req;

  INSERT INTO public.sp_verification_decisions
    (request_id, holder_user_id, decided_by, decider_organisation, decision, verification_method)
  VALUES (_req, _holder, _verifier, 'CQrityjob', 'approved', _method)
  RETURNING id INTO _dec;
  RETURN _dec;
END $$;

DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000004';
BEGIN
  PERFORM pg_temp.legacy_decision(_h, 'issuer_confirmation');
  PERFORM pg_temp.legacy_decision(_h, 'employer_confirmation');
  PERFORM set_config('tsc.legacy_before', pg_temp.trust_fingerprint(_h), false);
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_verification_decisions d
      WHERE d.holder_user_id = _h AND d.decision = 'approved'
        AND d.verification_method IN ('issuer_confirmation','employer_confirmation')
        AND d.decider_organisation = 'CQrityjob') = 2,
    '7.1 two legacy source-confirmation decisions by CQrityjob are in place');
END $$;

-- Re-apply the migration with the legacy rows present. It must succeed (no
-- preflight refuses on the past) and it must change none of it.
\i supabase/migrations/20261030090000_sp_trust_source_containment.sql

DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000004';
BEGIN
  PERFORM pg_temp.ok(true,
    '7.2 the migration re-applies cleanly over legacy rows -- it is prospective');
  PERFORM pg_temp.ok(
    current_setting('tsc.legacy_before') = pg_temp.trust_fingerprint(_h),
    '7.3 the legacy holder''s record is byte-for-byte unchanged by the migration');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_verification_decisions d
      WHERE d.holder_user_id = _h AND d.verification_method = 'issuer_confirmation') = 1
    AND
    (SELECT count(*) FROM public.sp_verification_decisions d
      WHERE d.holder_user_id = _h AND d.verification_method = 'employer_confirmation') = 1,
    '7.4 the legacy methods are still recorded as written -- history is not rewritten');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = _h AND assertion_level = 'verified') = 2,
    '7.5 the legacy claims keep their stored assertion level');
END $$;

-- 7.6 The operator report finds exactly those rows, and reads nothing personal.
DO $$
DECLARE _n bigint;
BEGIN
  SELECT count(*) INTO _n
    FROM public.sp_verification_decisions d
    JOIN public.sp_verification_requests r ON r.id = d.request_id
   WHERE d.decision = 'approved'
     AND d.verification_method IN ('employer_confirmation','issuer_confirmation')
     AND d.decider_organisation = 'CQrityjob'
     AND d.holder_user_id = 'd6000000-0000-0000-0000-000000000004';
  PERFORM pg_temp.ok(_n = 2,
    '7.6 the legacy-provenance report predicate selects exactly the two manufactured rows');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_verification_decisions d
      WHERE d.decision = 'approved' AND d.decider_organisation = 'CQrityjob'
        AND d.verification_method IN ('employer_confirmation','issuer_confirmation')
        AND d.holder_user_id IN ('d6000000-0000-0000-0000-000000000001',
                                 'd6000000-0000-0000-0000-000000000002')) = 0,
    '7.7 nothing written through the RPC in this suite matches the legacy shape');
END $$;


-- =============================================================================
\echo '    GROUP 8 -- anon holds nothing new, and evidence stays private'
-- =============================================================================
DO $$
DECLARE _n bigint;
BEGIN
  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon',
      'public.sp_verifier_decide(uuid,text,text,text,text,date,date)', 'EXECUTE'),
    '8.1 anon cannot execute sp_verifier_decide');
  PERFORM pg_temp.ok(
    has_function_privilege('authenticated',
      'public.sp_verifier_decide(uuid,text,text,text,text,date,date)', 'EXECUTE'),
    '8.2 authenticated still can -- the RPC remains the one door');

  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name LIKE 'sp\_%' AND grantee = 'anon';
  PERFORM pg_temp.ok(_n = 0, '8.3 anon holds no table privilege on any sp_ table');

  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'sp\_%'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.ok(_n = 0, '8.4 anon can execute no sp_ function');

  PERFORM pg_temp.ok(
    (SELECT public FROM storage.buckets WHERE id = 'passport-evidence') = false,
    '8.5 the evidence bucket is private');
  SELECT count(*) INTO _n
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'sp\_evidence%' AND 'anon' = ANY (roles);
  PERFORM pg_temp.ok(_n = 0, '8.6 no evidence storage policy names anon');
END $$;

-- 8.7 An attesting employer, having just confirmed an employment, still reads
--     no evidence and no claim of the holder.
DO $$
DECLARE _h uuid := 'd6000000-0000-0000-0000-000000000001'; _n bigint;
BEGIN
  INSERT INTO public.sp_evidence
    (holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes)
  VALUES (_h, (SELECT id FROM public.sp_claims WHERE holder_user_id = _h LIMIT 1),
          _h::text || '/tsc-evidence.pdf', 'intyg.pdf', 'application/pdf', 1234);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000003', true);
  SELECT count(*) INTO _n FROM public.sp_evidence WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, '8.7 the attesting employer cannot read the holder''s evidence');
  SELECT count(*) INTO _n FROM public.sp_claims WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, '8.8 the attesting employer cannot read the holder''s claims');
  RESET ROLE;
END $$;

\echo '    security_passport_trust_source_containment_test: complete'
