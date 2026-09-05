-- =============================================================================
-- Security Passport — trust boundary assertions
--
-- Three questions a verification system has to be able to answer about itself,
-- and which the database, not the user interface, has to answer:
--
--   WHO may create trust      — an employer representative, a CQrityjob reviewer
--   ON WHAT object            — employment, or a credential; never both
--   UNDER WHICH conditions    — stating a method, once, and only once
--
-- Every assertion below goes through the SAME boundary an authenticated
-- PostgREST client reaches: the RPC, or a direct INSERT under RLS. None of
-- them exercises a code path only this application can take, because the
-- defects this suite exists to prevent were all reachable without it.
--
-- Where an attempt must be refused, the refusal alone is not asserted. The
-- database is fingerprinted before and after, because "it raised an error"
-- and "it wrote nothing" are different claims and only the second one is the
-- security property.
--
-- All identities are transparently fictional and use a `cb` prefix.
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
-- Comparing this across a refused attempt is the only honest way to assert
-- "nothing was written": counting rows in one table would miss a decision row
-- inserted before a later stage failed.
-- SECURITY DEFINER deliberately: this is the suite's MEASURING INSTRUMENT,
-- not one of its assertions. It answers "did any trust state change?", and to
-- answer that honestly it must see every column of the record -- including
-- `decided_by`, which migration 20261016090000 stopped granting to
-- `authenticated` because the individual reviewer's user id is internal.
-- Read as the caller it would raise permission denied halfway through a
-- refusal test and report a privilege boundary as a broken fingerprint. The
-- boundary itself is asserted directly, as a boundary, in
-- security_passport_reviewer_role_test.sql GROUP 8.
CREATE OR REPLACE FUNCTION pg_temp.trust_fingerprint(_holder uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT md5(concat_ws('|',
    (SELECT coalesce(string_agg(concat_ws(',', id, status, decided_by, decided_at,
                                          verification_method, valid_from, valid_until),
                                ';' ORDER BY id), '')
       FROM public.sp_verification_requests WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, decision, decided_by, decider_organisation),
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

\echo '==> Security Passport trust boundaries'

-- -----------------------------------------------------------------------------
-- Fictional cast
-- -----------------------------------------------------------------------------
--   ...01  the holder. Has a VU1 claim and an employment period.
--   ...02  a second holder, for the concurrency race.
--   ...03  owner of Bevakning A — the employer the holder actually worked for
--   ...04  owner of Bevakning B — an unrelated employer
--   ...05  the holder of ...01's account, wearing an employer owner's hat:
--          the same person owns Bevakning C and tries to attest to themselves
--   ...09  a CQrityjob verifier (platform admin)
--   ...0a  a second CQrityjob verifier — the other half of the race
INSERT INTO auth.users (id, email) VALUES
  ('cb000000-0000-0000-0000-000000000001','tb-holder@example.test'),
  ('cb000000-0000-0000-0000-000000000002','tb-holder2@example.test'),
  ('cb000000-0000-0000-0000-000000000003','tb-employer-a@example.test'),
  ('cb000000-0000-0000-0000-000000000004','tb-employer-b@example.test'),
  ('cb000000-0000-0000-0000-000000000009','tb-verifier@example.test'),
  ('cb000000-0000-0000-0000-00000000000a','tb-verifier2@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('cb000000-0000-0000-0000-000000000001','Tilda Trygg (fiktiv)'),
  ('cb000000-0000-0000-0000-000000000002','Bengt Bevakning (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('cb000000-0000-0000-0000-000000000009','admin'),
  ('cb000000-0000-0000-0000-00000000000a','admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.employers (id, slug, name, status) VALUES
  ('cb000000-0000-0000-0000-0000000000e1','tb-bevakning-a','Bevakning A AB (fiktiv)','active'),
  ('cb000000-0000-0000-0000-0000000000e2','tb-bevakning-b','Bevakning B AB (fiktiv)','active'),
  ('cb000000-0000-0000-0000-0000000000e3','tb-bevakning-c','Bevakning C AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('cb000000-0000-0000-0000-0000000000e1','cb000000-0000-0000-0000-000000000003','owner','active'),
  ('cb000000-0000-0000-0000-0000000000e2','cb000000-0000-0000-0000-000000000004','owner','active'),
  -- The holder owns Bevakning C. Nothing stops a candidate from also running a
  -- company; what must stop is that company attesting to its owner.
  ('cb000000-0000-0000-0000-0000000000e3','cb000000-0000-0000-0000-000000000001','owner','active')
ON CONFLICT DO NOTHING;

-- Fixture builders. SECURITY DEFINER, so they run as the owner and write the
-- row directly: a claim that already carries DOCUMENT_PROVIDED is the STARTING
-- STATE for these tests, not something under test, and reaching it through the
-- holder's own INSERT policy would mean re-testing the evidence workflow in
-- every group. Nothing being asserted below runs with these privileges -- every
-- boundary test sets ROLE authenticated first.
CREATE OR REPLACE FUNCTION pg_temp.new_claim(_holder uuid, _code text DEFAULT 'VU1')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _claim uuid;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, assertion_level,
     lifecycle_state, claimed_issuer_name, valid_from, valid_until)
  -- claim_type and title both come from the taxonomy row, never from this
  -- fixture: sp_claims_credential_rules refuses a claim that disagrees with
  -- its own credential definition, which is the correct behaviour and not
  -- something a test should be routing around.
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
  VALUES (_holder, 'Bevakning A AB (fiktiv)', 'Väktare', 'full_time', 1.00,
          'primary', 1.00, DATE '2022-03-01', DATE '2024-03-01')
  RETURNING id INTO _p;
  RETURN _p;
END $$;


-- =============================================================================
\echo '    GROUP 1 -- an employer may confirm employment, and nothing else'
-- =============================================================================
-- The defect: request_kind = 'employer_attestation' could be aimed at a CLAIM.
-- The candidate's own Passport never offers it; sp_submit_for_verification and
-- a direct INSERT both did.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001';
        _vu1 uuid; _period uuid; _req uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  _vu1 := pg_temp.new_claim(_h, 'VU1');
  _period := pg_temp.new_period(_h);

  -- 1.1 The legitimate shape still works, unchanged.
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation',
    'cb000000-0000-0000-0000-0000000000e1');
  PERFORM pg_temp.ok(_req IS NOT NULL,
    '1.1 employer attestation on an employment period is accepted');

  -- 1.2 THE DEFECT. A regulated guard qualification, aimed at an employer.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(%L, NULL, ''employer_attestation'', %L)',
           _vu1, 'cb000000-0000-0000-0000-0000000000e1'),
    'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY',
    '1.2 an employer cannot be asked to attest to a VU1 credential');

  -- 1.3 Not a special case for regulated codes. ANY claim is out of bounds --
  --     here an ordinary education claim with no credential taxonomy behind it
  --     at all, to show the rule is about the OBJECT being employment, not
  --     about which credentials happen to be regulated today.
  DECLARE _skill uuid;
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, assertion_level, lifecycle_state)
    VALUES (_h, 'education', 'Gymnasieexamen (fiktiv)', 'self_declared', 'active')
    RETURNING id INTO _skill;
    PERFORM pg_temp.must_fail(
      format('SELECT public.sp_submit_for_verification(%L, NULL, ''employer_attestation'', %L)',
             _skill, 'cb000000-0000-0000-0000-0000000000e1'),
      'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY',
      '1.3 no claim of any kind may be routed to an employer');
  END;

  -- 1.4 Naming a period AND a claim is the interesting evasion: it satisfies
  --     "there is a period", and sp_verifier_decide's approval branch tests
  --     claim_id FIRST, so the credential is what would have been verified.
  DECLARE _p2 uuid;
  BEGIN
    _p2 := pg_temp.new_period(_h);
    PERFORM pg_temp.must_fail(
      format('SELECT public.sp_submit_for_verification(%L, %L, ''employer_attestation'', %L)',
             _vu1, _p2, 'cb000000-0000-0000-0000-0000000000e1'),
      'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY',
      '1.4 a request naming both a period and a claim is refused');
  END;
  RESET ROLE;
END $$;

-- 1.5-1.7 The RPC is not the boundary. `authenticated` holds INSERT on this
-- table under RLS, so the crafted call that matters skips the function
-- entirely -- which is exactly what a hand-written PostgREST request does.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001'; _claim uuid; _period uuid;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code = 'VU1' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_requests
              (holder_user_id, claim_id, request_kind, status, target_employer_id)
            VALUES (%L, %L, ''employer_attestation'', ''pending'', %L)',
           _h, _claim, 'cb000000-0000-0000-0000-0000000000e1'),
    'sp_vr_employer_attestation_is_employment_only',
    '1.5 a direct INSERT of employer attestation on a claim is refused by the table');

  SELECT id INTO _period FROM public.sp_experience_periods
   WHERE holder_user_id = _h ORDER BY id LIMIT 1;
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_requests
              (holder_user_id, claim_id, period_id, request_kind, status, target_employer_id)
            VALUES (%L, %L, %L, ''employer_attestation'', ''pending'', %L)',
           _h, _claim, _period, 'cb000000-0000-0000-0000-0000000000e1'),
    'sp_vr_employer_attestation_is_employment_only',
    '1.6 a direct INSERT naming both is refused by the table');
  RESET ROLE;
END $$;

DO $$
DECLARE _n bigint;
BEGIN
  -- 1.7 Nothing above created a row. The refusals are refusals, not rollbacks
  --     of a partially written request.
  SELECT count(*) INTO _n FROM public.sp_verification_requests
   WHERE holder_user_id = 'cb000000-0000-0000-0000-000000000001'
     AND request_kind = 'employer_attestation';
  PERFORM pg_temp.ok(_n = 1,
    '1.7 exactly one employer attestation exists -- the legitimate one');

  -- 1.8 And a CQrityjob review of the same VU1 claim is entirely unaffected.
  --     This boundary is about WHO may attest to what, not about narrowing
  --     what the platform reviews.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000001', true);
  PERFORM public.sp_submit_for_verification(
    (SELECT id FROM public.sp_claims
      WHERE holder_user_id='cb000000-0000-0000-0000-000000000001'
        AND credential_code='VU1' LIMIT 1),
    NULL, 'cqrityjob_review', NULL);
  RESET ROLE;
  PERFORM pg_temp.ok(true,
    '1.8 a CQrityjob review of the same credential is still accepted');
END $$;


-- =============================================================================
\echo '    GROUP 2 -- a malformed row that predates the rule still cannot become trust'
-- =============================================================================
-- The table constraint stops such a row being WRITTEN. It says nothing about
-- one already in the table. sp_verifier_decide therefore refuses to ACT on the
-- shape as well, and this group proves it by manufacturing exactly the row a
-- pre-migration database could be holding: the constraint is dropped, the row
-- is inserted as the superuser, and the boundary is tested with the row in
-- place. The constraint is restored at the end, which also proves the row left
-- no residue.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001';
        _claim uuid; _legacy uuid; _before text; _after text;
BEGIN
  -- Its own credential, so the open CQrityjob review from 1.8 is not disturbed
  -- and the one-open-request index is not what refuses this row.
  _claim := pg_temp.new_claim(_h, 'OV');

  ALTER TABLE public.sp_verification_requests
    DROP CONSTRAINT sp_vr_employer_attestation_is_employment_only;
  INSERT INTO public.sp_verification_requests
    (holder_user_id, claim_id, request_kind, status, target_employer_id)
  VALUES (_h, _claim, 'employer_attestation', 'pending',
          'cb000000-0000-0000-0000-0000000000e1')
  RETURNING id INTO _legacy;

  _before := pg_temp.trust_fingerprint(_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000003', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
            NULL, NULL, NULL, NULL)', _legacy),
    'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY',
    '2.1 an employer cannot approve a legacy attestation aimed at a credential');
  RESET ROLE;

  _after := pg_temp.trust_fingerprint(_h);
  PERFORM pg_temp.ok(_before = _after,
    '2.2 the refusal wrote nothing at all -- no decision, no event, no trust change');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'document_provided',
    '2.3 the VU1 claim is still only document_provided');

  DELETE FROM public.sp_verification_requests WHERE id = _legacy;
  ALTER TABLE public.sp_verification_requests
    ADD CONSTRAINT sp_vr_employer_attestation_is_employment_only CHECK (
      request_kind <> 'employer_attestation'
      OR (period_id IS NOT NULL AND claim_id IS NULL));
  PERFORM pg_temp.ok(true,
    '2.4 the constraint restores cleanly over the remaining rows');
END $$;


-- =============================================================================
\echo '    GROUP 3 -- employer authority is not widened by any of this'
-- =============================================================================
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001'; _req uuid; _n bigint;
BEGIN
  SELECT id INTO _req FROM public.sp_verification_requests
   WHERE holder_user_id = _h AND request_kind = 'employer_attestation' LIMIT 1;

  -- 3.1 The wrong company. Bevakning B has no relationship to this request.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000004', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
            NULL, NULL, NULL, NULL)', _req),
    'SP_NOT_EMPLOYER_REPRESENTATIVE',
    '3.1 an employer cannot decide another organisation''s request');
  SELECT count(*) INTO _n FROM public.sp_verification_requests;
  PERFORM pg_temp.ok(_n = 0,
    '3.2 an unrelated employer cannot even see the request');
  RESET ROLE;

  -- 3.3-3.6 The right company, and still no reach into the Passport. An
  --         attestation path is not an evidence path.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000003', true);
  SELECT count(*) INTO _n FROM public.sp_verification_requests;
  PERFORM pg_temp.ok(_n = 1, '3.3 the attesting employer sees exactly their one request');
  SELECT count(*) INTO _n FROM public.sp_claims WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, '3.4 the attesting employer cannot read the holder''s claims');
  SELECT count(*) INTO _n FROM public.sp_evidence WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, '3.5 the attesting employer cannot read the holder''s evidence');
  SELECT count(*) INTO _n FROM public.sp_passport_profiles WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, '3.6 the attesting employer cannot read the holder''s profile');
  RESET ROLE;
END $$;

-- 3.7 Self-attestation through the employer path. The holder owns Bevakning C;
--     the company is real, the employment is real, and the person deciding is
--     still the person being decided about.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001'; _p uuid; _req uuid; _before text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _p := pg_temp.new_period(_h);
  _req := public.sp_submit_for_verification(NULL, _p, 'employer_attestation',
    'cb000000-0000-0000-0000-0000000000e3');
  _before := pg_temp.trust_fingerprint(_h);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
            NULL, NULL, NULL, NULL)', _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '3.7 a candidate who owns the company still cannot attest to themselves');
  RESET ROLE;
  PERFORM pg_temp.ok(_before = pg_temp.trust_fingerprint(_h),
    '3.8 the self-attestation attempt wrote nothing');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_experience_periods WHERE id = _p) = 'self_declared',
    '3.9 the period is still self_declared');
END $$;


-- =============================================================================
\echo '    GROUP 4 -- an approval must state how it was verified'
-- =============================================================================
-- decideVerification has refused this since it was written. sp_verifier_decide
-- did not, and it is the one a crafted RPC call reaches.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001';
        _req uuid; _claim uuid; _before text;
BEGIN
  SELECT r.id, r.claim_id INTO _req, _claim
    FROM public.sp_verification_requests r
   WHERE r.holder_user_id = _h AND r.request_kind = 'cqrityjob_review'
     AND r.status = 'pending' LIMIT 1;
  _before := pg_temp.trust_fingerprint(_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000009', true);

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', NULL, ''note'', NULL, NULL, NULL)', _req),
    'SP_APPROVAL_REQUIRES_METHOD',
    '4.1 an approval with a null method is refused');

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', '''', ''note'', NULL, NULL, NULL)', _req),
    'SP_APPROVAL_REQUIRES_METHOD',
    '4.2 an approval with an empty method is refused');

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''   '', ''note'', NULL, NULL, NULL)', _req),
    'SP_APPROVAL_REQUIRES_METHOD',
    '4.3 an approval with a space-only method is refused');

  -- 4.4 The one that separates a real check from btrim(). One-argument btrim
  --     strips SPACES only, so a tab would have passed it while String.trim()
  --     in the TypeScript layer rejects it -- leaving the database the more
  --     permissive of the two, which is the wrong way round.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', %L, ''note'', NULL, NULL, NULL)',
           _req, E'\t\n'),
    'SP_APPROVAL_REQUIRES_METHOD',
    '4.4 a tab-and-newline method is refused, not accepted as a method');

  -- 4.5 A method outside the model is refused. Since 20261030090000 the
  --     function binds the method to the request kind BEFORE the row is
  --     written, so a cqrityjob_review meets SP_CQRITYJOB_REVIEW_REQUIRES_
  --     DOCUMENT_REVIEW first; the column CHECK behind it is still the model
  --     and is asserted to exist in 4.5b rather than reached.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''telepati'', ''note'', NULL, NULL, NULL)', _req),
    '',
    '4.5 a method outside the allowed set is refused');
  RESET ROLE;
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.sp_verification_requests'::regclass
               AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE '%verification_method%'
               AND pg_get_constraintdef(oid) LIKE '%issuer_confirmation%'),
    '4.5b the verification_method CHECK is still the model behind the function');

  PERFORM pg_temp.ok(_before = pg_temp.trust_fingerprint(_h),
    '4.6 five refused approvals left the database byte-for-byte unchanged');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'document_provided',
    '4.7 the credential never reached verified');
END $$;

-- 4.8-4.12 The rules PR 4 established are untouched, and a real approval works.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001'; _req uuid; _claim uuid;
BEGIN
  SELECT r.id, r.claim_id INTO _req, _claim
    FROM public.sp_verification_requests r
   WHERE r.holder_user_id = _h AND r.request_kind = 'cqrityjob_review'
     AND r.status = 'pending' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000009', true);

  -- A refusal still needs a reason, and still does NOT need a method: nothing
  -- was verified, so there is no "how" to state.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''rejected'', NULL, ''note'', NULL, NULL, NULL)', _req),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '4.8 a rejection with no candidate-facing reason is still refused');

  PERFORM public.sp_verifier_decide(_req, 'clarification_requested', NULL, 'internal',
    'Intyget saknar utfärdandedatum. Skicka gärna en ny kopia.', NULL, NULL);
  PERFORM pg_temp.ok(true,
    '4.9 a clarification request with a reason and no method is still allowed');

  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review', 'internal',
    'Intyget är kontrollerat.', DATE '2026-01-01', DATE '2027-12-31');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'verified',
    '4.10 a document review with a stated method verifies the credential');
  PERFORM pg_temp.ok(
    (SELECT verification_method FROM public.sp_verification_requests WHERE id = _req)
      = 'document_review',
    '4.11 the method is recorded on the request');
  PERFORM pg_temp.ok(
    (SELECT decider_organisation FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'approved') = 'CQrityjob',
    '4.12 the deciding organisation is CQrityjob, not the credential''s issuer');
END $$;


-- =============================================================================
\echo '    GROUP 5 -- one request, one final decision'
-- =============================================================================
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001'; _req uuid; _n bigint;
BEGIN
  SELECT r.id INTO _req FROM public.sp_verification_requests r
   WHERE r.holder_user_id = _h AND r.status = 'approved' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-00000000000a', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''rejected'', NULL, NULL, ''nej'', NULL, NULL)', _req),
    'SP_REQUEST_ALREADY_DECIDED',
    '5.1 a decided request refuses a second decision');
  RESET ROLE;

  SELECT count(*) INTO _n FROM public.sp_verification_decisions
   WHERE request_id = _req AND decision IN ('approved','rejected');
  PERFORM pg_temp.ok(_n = 1, '5.2 exactly one final decision row exists for that request');

  -- 5.3 And the invariant is structural, not merely a consequence of the
  --     function's checks: a second final decision cannot be filed even by a
  --     superuser writing the row directly.
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_decisions
              (request_id, holder_user_id, decided_by, decision)
            VALUES (%L, %L, %L, ''approved'')',
           _req, _h, 'cb000000-0000-0000-0000-00000000000a'),
    'sp_vd_one_final_decision_per_request',
    '5.3 a duplicate final decision row is refused by the index');

  -- 5.4 The legitimate two-row shape is NOT broken by that index: this request
  --     was asked for clarification and then approved, and both are on record.
  SELECT count(*) INTO _n FROM public.sp_verification_decisions WHERE request_id = _req;
  PERFORM pg_temp.ok(_n = 2,
    '5.4 clarification-then-approval still writes two decisions, append-only');
END $$;

-- 5.5 Revocation files against the approving request on purpose, so the audit
--     chain reads as one thread. The index must not have made that impossible.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000001'; _claim uuid; _n bigint;
BEGIN
  SELECT r.claim_id INTO _claim FROM public.sp_verification_requests r
   WHERE r.holder_user_id = _h AND r.status = 'approved' AND r.claim_id IS NOT NULL LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000009', true);
  PERFORM public.sp_verifier_revoke(_claim, NULL, 'Utfärdaren har återkallat intyget.');
  RESET ROLE;
  SELECT count(*) INTO _n FROM public.sp_verification_decisions
   WHERE holder_user_id = _h AND decision = 'revoked';
  PERFORM pg_temp.ok(_n = 1, '5.5 a revocation is still recordable against the approved request');
  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _claim) = 'revoked',
    '5.6 and it still revokes the credential');
END $$;


-- =============================================================================
\echo '    GROUP 6 -- one open request per entry'
-- =============================================================================
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000002'; _claim uuid; _req uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _claim := pg_temp.new_claim(_h, 'OV');
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(%L, NULL, ''cqrityjob_review'', NULL)', _claim),
    'SP_REQUEST_ALREADY_OPEN',
    '6.1 a second submission on an open entry is refused, as before');

  -- 6.2 And the same answer when the function is skipped entirely -- which is
  --     what the concurrent second submission effectively does, since it gets
  --     past the function's own check before the first one commits.
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_requests
              (holder_user_id, claim_id, request_kind, status)
            VALUES (%L, %L, ''cqrityjob_review'', ''pending'')', _h, _claim),
    'sp_vr_one_open_request_per_claim',
    '6.2 a second open request written directly is refused by the index');
  RESET ROLE;
END $$;

-- 6.3 The index constrains OPEN requests only. Once a review is finished the
--     entry can be submitted again -- a re-issued certificate, a correction,
--     a revoked credential earned back. Constraining that would be a product
--     change wearing a security constraint's clothes.
DO $$
DECLARE _h uuid := 'cb000000-0000-0000-0000-000000000002'; _claim uuid; _req uuid;
BEGIN
  SELECT r.id, r.claim_id INTO _req, _claim FROM public.sp_verification_requests r
   WHERE r.holder_user_id = _h AND r.status = 'pending' LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cb000000-0000-0000-0000-000000000009', true);
  PERFORM public.sp_verifier_decide(_req, 'rejected', NULL, 'internal',
    'Intyget gick inte att styrka.', NULL, NULL);
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;
  PERFORM pg_temp.ok(true,
    '6.3 a new review may be opened once the previous one is decided');
END $$;


-- =============================================================================
-- GROUP 7 -- two deciders, one request, at the same time
-- =============================================================================
-- Deliberately NOT in this file. One psql session cannot hold two transactions
-- open at once, and a race demonstrated by two sequential calls demonstrates
-- nothing: the second one sees a committed row and takes the already-decided
-- branch whether or not a lock was ever held.
--
-- The real thing lives in security_passport_decision_race_test.sql, driven by
-- scripts/db-test.sh, which runs two independent psql processes against the
-- same pending request and measures how long the loser waited. See the header
-- of that file.
-- =============================================================================


-- =============================================================================
\echo '    GROUP 8 -- nothing was widened on the way'
-- =============================================================================
-- Both functions were rewritten with CREATE OR REPLACE, which is precisely
-- where a SECURITY DEFINER grant silently broadens if nobody restates it.
DO $$
DECLARE _n bigint;
BEGIN
  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon',
      'public.sp_verifier_decide(uuid,text,text,text,text,date,date)', 'EXECUTE'),
    '8.1 anon still cannot execute sp_verifier_decide');
  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon',
      'public.sp_submit_for_verification(uuid,uuid,text,uuid)', 'EXECUTE'),
    '8.2 anon still cannot execute sp_submit_for_verification');
  PERFORM pg_temp.ok(
    has_function_privilege('authenticated',
      'public.sp_verifier_decide(uuid,text,text,text,text,date,date)', 'EXECUTE'),
    '8.3 authenticated still can, so the reviewer path is intact');

  -- The reason guarding the two functions guards the STATE: there is no route
  -- by which a signed-in principal changes a request row after it is written.
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.sp_verification_requests', 'UPDATE'),
    '8.4 authenticated holds no UPDATE on sp_verification_requests');
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.sp_verification_requests', 'DELETE'),
    '8.5 authenticated holds no DELETE on sp_verification_requests');
  PERFORM pg_temp.ok(
    NOT has_table_privilege('anon', 'public.sp_verification_requests', 'SELECT'),
    '8.6 anon cannot read verification requests at all');
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.sp_verification_decisions', 'INSERT'),
    '8.7 the decision log is written only by the function, never by a client');

  -- Issuer and verifier stayed two different facts. The holder types the
  -- issuer's name; the organisation that decided is written by the database.
  -- A release that let the first become the second would make "verified" mean
  -- "the candidate said so".
  SELECT count(*) INTO _n FROM public.sp_verification_decisions d
    JOIN public.sp_claims c ON c.id = (SELECT claim_id FROM public.sp_verification_requests
                                        WHERE id = d.request_id)
   WHERE d.decider_organisation IS NOT DISTINCT FROM c.claimed_issuer_name;
  PERFORM pg_temp.ok(_n = 0,
    '8.8 no decision is attributed to the issuer the candidate typed');

  -- The five facts that let a future release distinguish "confirmed by the
  -- employer" from "verified against the issuing authority" are still five
  -- separate columns, not one collapsed trust flag.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sp_verification_requests'
     AND column_name IN ('request_kind','target_employer_id','verification_method',
                         'decided_by','decision_note');
  PERFORM pg_temp.ok(_n = 5,
    '8.9 request kind, target employer, method, decider and note remain distinct');
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sp_verification_decisions'
     AND column_name IN ('decider_organisation','verification_method','decided_by');
  PERFORM pg_temp.ok(_n = 3,
    '8.10 who decided, for which organisation, and by what method stay separate');

  -- No new state and no new assertion level arrived with any of this.
  SELECT count(*) INTO _n FROM pg_constraint
   WHERE conrelid = 'public.sp_verification_requests'::regclass
     AND pg_get_constraintdef(oid) LIKE '%employer_verified%';
  PERFORM pg_temp.ok(_n = 0, '8.11 no employer_verified state was introduced');
  PERFORM pg_temp.ok(
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid='public.sp_claims'::regclass
        AND conname='sp_claims_assertion_level_check')
    = 'CHECK ((assertion_level = ANY (ARRAY[''self_declared''::text, ''document_provided''::text, ''verified''::text])))',
    '8.12 the three assertion levels are exactly the three that existed before');
END $$;

\echo '==> Security Passport trust boundaries: all assertions passed'
