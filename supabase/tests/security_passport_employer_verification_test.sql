-- =============================================================================
-- Security Passport — employer employment verification
--
-- PR 8 makes an existing capability FINDABLE. Almost all of it is user
-- interface, and almost none of a user interface is a boundary. What this
-- suite asserts is the part that has to be true underneath it:
--
--   * the employer sees the request, and sees NOTHING ELSE about the person;
--   * an unrelated organisation sees nothing at all;
--   * the candidate keeps sole ownership of their own employment record,
--     including after an employer says it is wrong;
--   * "confirmed by Company X" is a fact the database wrote, not a sentence
--     the page composed;
--   * and every refusal PRs 4-7 established still refuses.
--
-- Every assertion goes through the boundary an authenticated PostgREST client
-- reaches: the RPC, or a direct table statement under RLS. None of them takes
-- a path only this application can take, because a page is not a boundary and
-- a defect reachable without the page is the only kind worth testing for.
--
-- Where an attempt must be refused, the refusal alone is never the assertion.
-- The record is fingerprinted before and after: "it raised an error" and "it
-- wrote nothing" are different claims, and only the second one is the security
-- property.
--
-- All identities are transparently fictional and use an `e8` prefix.
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

-- The measuring instrument, not an assertion. SECURITY DEFINER for the reason
-- security_passport_trust_boundary_test records for its own copy: it has to
-- see `decided_by`, which 20261016090000 deliberately stopped granting to
-- `authenticated`, so read as the caller it would report a privilege boundary
-- as a broken fingerprint half way through a refusal test.
CREATE OR REPLACE FUNCTION pg_temp.fingerprint(_holder uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT md5(concat_ws('|',
    (SELECT coalesce(string_agg(concat_ws(',', id, status, decided_by, decided_at,
                                          verification_method, holder_message),
                                ';' ORDER BY id), '')
       FROM public.sp_verification_requests WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, decision, decided_by, decider_organisation),
                                ';' ORDER BY id), '')
       FROM public.sp_verification_decisions WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, employer_name, role_title, started_on,
                                          ended_on, employment_type, assertion_level,
                                          lifecycle_state),
                                ';' ORDER BY id), '')
       FROM public.sp_experience_periods WHERE holder_user_id = _holder)
  ));
$$;

\echo '==> Security Passport employer employment verification'

-- -----------------------------------------------------------------------------
-- Fictional cast
-- -----------------------------------------------------------------------------
--   ...01  Amina (fiktiv) — the candidate. Worked at Company X.
--   ...02  Bo (fiktiv)    — a second, unrelated candidate.
--   ...03  owner of Company X — the organisation Amina actually worked for
--   ...04  owner of Company Y — an unrelated organisation
--   ...05  admin of Company X — the second authorised representative
--   ...06  member of Company X — an ordinary member, authorised for nothing here
--   ...07  Cilla (fiktiv) — a candidate who set NO Passport display name, and
--                           who also OWNS Company Z: the dual-role abuse case
INSERT INTO auth.users (id, email) VALUES
  ('e8000000-0000-0000-0000-000000000001','ev-amina@example.test'),
  ('e8000000-0000-0000-0000-000000000002','ev-bo@example.test'),
  ('e8000000-0000-0000-0000-000000000003','ev-x-owner@example.test'),
  ('e8000000-0000-0000-0000-000000000004','ev-y-owner@example.test'),
  ('e8000000-0000-0000-0000-000000000005','ev-x-admin@example.test'),
  ('e8000000-0000-0000-0000-000000000006','ev-x-member@example.test'),
  ('e8000000-0000-0000-0000-000000000007','ev-cilla@example.test')
ON CONFLICT (id) DO NOTHING;

-- Amina and Bo have a Passport display name. Cilla deliberately does not:
-- `sp_passport_profiles.display_name` is nullable, and a request that reaches
-- an employer with no name on it is not a harder question, it is an
-- unanswerable one. GROUP 3 asserts the fallback.
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('e8000000-0000-0000-0000-000000000001','Amina Rashid (fiktiv)'),
  ('e8000000-0000-0000-0000-000000000002','Bo Berg (fiktiv)'),
  ('e8000000-0000-0000-0000-000000000007', NULL)
ON CONFLICT (holder_user_id) DO NOTHING;

-- DO UPDATE, not DO NOTHING: `handle_new_user` creates a profiles row from the
-- auth.users insert above, so DO NOTHING would leave Cilla's account display
-- name NULL and GROUP 3 would assert the fallback against nothing.
INSERT INTO public.profiles (id, display_name) VALUES
  ('e8000000-0000-0000-0000-000000000001','Amina Rashid'),
  ('e8000000-0000-0000-0000-000000000007','Cilla Carlsson (fiktiv)')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.employers (id, slug, name, status) VALUES
  ('e8000000-0000-0000-0000-0000000000f1','ev-company-x','Company X AB (fiktiv)','active'),
  ('e8000000-0000-0000-0000-0000000000f2','ev-company-y','Company Y AB (fiktiv)','active'),
  ('e8000000-0000-0000-0000-0000000000f3','ev-company-z','Company Z AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e8000000-0000-0000-0000-0000000000f1','e8000000-0000-0000-0000-000000000003','owner','active'),
  ('e8000000-0000-0000-0000-0000000000f1','e8000000-0000-0000-0000-000000000005','admin','active'),
  ('e8000000-0000-0000-0000-0000000000f1','e8000000-0000-0000-0000-000000000006','member','active'),
  ('e8000000-0000-0000-0000-0000000000f2','e8000000-0000-0000-0000-000000000004','owner','active'),
  -- Cilla owns Company Z. Nothing about that is suspicious; what must not
  -- happen is Company Z confirming its own owner's employment.
  ('e8000000-0000-0000-0000-0000000000f3','e8000000-0000-0000-0000-000000000007','owner','active')
ON CONFLICT DO NOTHING;

-- Fixture builders. SECURITY DEFINER so the STARTING STATE is written
-- directly: reaching it through the holder's own INSERT policy would mean
-- re-testing entry creation in every group. Nothing under assertion runs with
-- these privileges — every boundary test SETs ROLE authenticated first.
CREATE OR REPLACE FUNCTION pg_temp.new_period(_holder uuid, _employer text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p uuid;
BEGIN
  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, employment_type, fte_fraction,
     security_relevance, security_fraction, started_on, ended_on)
  VALUES (_holder, _employer, 'Security Officer', 'full_time', 1.00,
          'primary', 1.00, DATE '2024-01-01', DATE '2025-12-31')
  RETURNING id INTO _p;
  RETURN _p;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.new_claim(_holder uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c uuid;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, assertion_level,
     lifecycle_state, claimed_issuer_name, valid_from, valid_until)
  VALUES (_holder,
          (SELECT claim_type FROM public.sp_credential_types WHERE code = 'VU1'),
          (SELECT name_sv   FROM public.sp_credential_types WHERE code = 'VU1'),
          'VU1', 'document_provided', 'active',
          'Fiktiv utbildningsanordnare', DATE '2024-01-01', DATE '2027-12-31')
  RETURNING id INTO _c;
  RETURN _c;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.new_evidence(_holder uuid, _period uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e uuid;
BEGIN
  INSERT INTO public.sp_evidence
    (holder_user_id, period_id, storage_path, file_name, mime_type, size_bytes)
  VALUES (_holder, _period, _holder::text || '/ev-' || gen_random_uuid()::text || '.pdf',
          'anstallningsbevis.pdf', 'application/pdf', 4096)
  RETURNING id INTO _e;
  RETURN _e;
END $$;

-- Reading a period AS THE OWNER, for use inside a block whose ROLE is an
-- employer representative. They cannot see the row -- which is the point of
-- 2.7 and of 6.5 -- so the suite needs a way to check what the row actually
-- says without dropping the role it is testing under. SECURITY DEFINER for
-- the same reason as the fingerprint above: an instrument, never an assertion.
CREATE OR REPLACE FUNCTION pg_temp.period_end(_period uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ended_on FROM public.sp_experience_periods WHERE id = _period;
$$;

CREATE OR REPLACE FUNCTION pg_temp.period_level(_period uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT assertion_level FROM public.sp_experience_periods WHERE id = _period;
$$;

/** Every key the employer queue returns, for one employer, as a sorted list.
 *  Asserting the SHAPE rather than a field at a time is what catches a widening
 *  nobody meant to make: a new key appears here whether or not any test thought
 *  to look for it. */
CREATE OR REPLACE FUNCTION pg_temp.queue_keys(_employer uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(k, ',' ORDER BY k), '')
    FROM (SELECT DISTINCT jsonb_object_keys(elem) AS k
            FROM jsonb_array_elements(public.sp_employer_attestation_queue(_employer)) elem) s;
$$;


-- =============================================================================
\echo '    GROUP 1 -- the candidate asks, and may only ask about employment'
-- =============================================================================
DO $$
DECLARE _amina uuid := 'e8000000-0000-0000-0000-000000000001';
        _x uuid := 'e8000000-0000-0000-0000-0000000000f1';
        _period uuid; _claim uuid; _req uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _amina::text, true);

  _period := pg_temp.new_period(_amina, 'Company X AB (fiktiv)');
  _claim  := pg_temp.new_claim(_amina);

  -- 1.1 The whole product proposition, in one call.
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _x);
  PERFORM pg_temp.ok(_req IS NOT NULL,
    '1.1 a candidate can ask an employer to confirm their own employment period');

  PERFORM pg_temp.ok(
    (SELECT target_employer_id FROM public.sp_verification_requests WHERE id = _req) = _x,
    '1.2 the request records WHICH organisation was asked');

  -- 1.3 The boundary PR 5 established, restated here because PR 8 is the
  --     release that puts a "confirm" button in front of an employer and is
  --     therefore the release where widening it would be tempting.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(%L, NULL, ''employer_attestation'', %L)',
           _claim, _x),
    'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY',
    '1.3 an employer still cannot be asked to confirm a VU1 credential');

  -- 1.4 A request naming no organisation at all is not a request anybody can
  --     answer, and the table has refused it since Phase 3.
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_requests
              (holder_user_id, period_id, request_kind, status)
            VALUES (%L, %L, ''employer_attestation'', ''pending'')', _amina, _period),
    'sp_vr_employer_kind_has_employer',
    '1.4 an employer attestation naming no employer is refused by the table');

  -- 1.5 An organisation that does not exist. Refused by the foreign key, which
  --     is what stops a crafted call from addressing a request into nowhere and
  --     leaving it permanently unanswerable in the holder's own Passport.
  --
  --     Asked about a SECOND period on purpose: the first one already carries an
  --     open request, so aiming this at it would be refused by the open-request
  --     rule before the foreign key was ever consulted, and the assertion would
  --     pass without testing anything.
  DECLARE _fresh uuid;
  BEGIN
    _fresh := pg_temp.new_period(_amina, 'Company Q AB (fiktiv)');
    PERFORM pg_temp.must_fail(
      format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
             _fresh, 'e8000000-0000-0000-0000-0000000000ff'),
      'foreign key',
      '1.5 an employer id that names no organisation is refused');
  END;

  -- 1.6 Somebody else's employment period.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
           pg_temp.new_period('e8000000-0000-0000-0000-000000000002', 'Company X AB (fiktiv)'), _x),
    'SP_NOT_HOLDER',
    '1.6 a candidate cannot ask an employer to confirm somebody else''s employment');

  -- 1.7 One open request per period. The interface reflects the existing open
  --     request rather than offering a second button; this is the reason it
  --     can rely on that.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
           _period, _x),
    'SP_REQUEST_ALREADY_OPEN',
    '1.7 a second open confirmation request on the same period is refused');

  -- 1.8 And not merely through the RPC: `authenticated` holds INSERT on this
  --     table, so the crafted call that matters skips the function.
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_verification_requests
              (holder_user_id, period_id, request_kind, status, target_employer_id)
            VALUES (%L, %L, ''employer_attestation'', ''pending'', %L)', _amina, _period, _x),
    'sp_vr_one_open_request_per_period',
    '1.8 a direct INSERT of a duplicate open request is refused by the index');

  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 2 -- what the employer may read, and what it may not'
-- =============================================================================
DO $$
DECLARE _amina uuid := 'e8000000-0000-0000-0000-000000000001';
        _xowner uuid := 'e8000000-0000-0000-0000-000000000003';
        _xadmin uuid := 'e8000000-0000-0000-0000-000000000005';
        _xmember uuid := 'e8000000-0000-0000-0000-000000000006';
        _yowner uuid := 'e8000000-0000-0000-0000-000000000004';
        _x uuid := 'e8000000-0000-0000-0000-0000000000f1';
        _q jsonb; _keys text; _period uuid;
BEGIN
  SELECT id INTO _period FROM public.sp_experience_periods
   WHERE holder_user_id = _amina AND employer_name = 'Company X AB (fiktiv)' LIMIT 1;
  PERFORM pg_temp.new_evidence(_amina, _period);

  SET LOCAL ROLE authenticated;

  -- 2.1 The owner sees the request that names their organisation.
  PERFORM set_config('request.jwt.claim.sub', _xowner::text, true);
  _q := public.sp_employer_attestation_queue(_x);
  PERFORM pg_temp.ok(jsonb_array_length(_q) = 1,
    '2.1 the target employer''s owner sees the request');
  PERFORM pg_temp.ok(_q->0->>'holder_name' = 'Amina Rashid (fiktiv)',
    '2.2 and can see WHO is asking -- a nameless request is unanswerable');
  PERFORM pg_temp.ok(_q->0->>'role_title' = 'Security Officer'
                 AND _q->0->>'started_on' = '2024-01-01'
                 AND _q->0->>'ended_on' = '2025-12-31',
    '2.3 and the exact facts they are being asked to confirm');

  -- 2.4 THE SHAPE. Asserted as a whole set, so a key added tomorrow shows up
  --     here rather than in somebody's Passport.
  _keys := pg_temp.queue_keys(_x);
  PERFORM pg_temp.ok(
    _keys = 'decided_at,employer_name,employment_type,ended_on,fte_fraction,holder_message,'
         || 'holder_name,id,is_self,role_title,security_relevance,started_on,status,submitted_at',
    '2.4 the payload is exactly the fourteen employment fields -- nothing else: ' || _keys);

  -- 2.5-2.8 What is absent from the payload is also unreachable directly. The
  --     employer holds an ordinary `authenticated` session; RLS on the Passport
  --     tables is holder-only, so none of this is merely unshown.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_evidence WHERE holder_user_id = _amina) = 0,
    '2.5 the employer reads none of the candidate''s evidence');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = _amina) = 0,
    '2.6 the employer reads none of the candidate''s credentials');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_experience_periods WHERE holder_user_id = _amina) = 0,
    '2.7 the employer reads the period ONLY through the queue, never the row');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_profiles WHERE holder_user_id = _amina) = 0,
    '2.8 the employer reads none of the candidate''s Passport profile');

  -- 2.9 An admin of the same organisation is the second authorised
  --     representative, because a company with one owner on holiday still has
  --     to be able to answer.
  PERFORM set_config('request.jwt.claim.sub', _xadmin::text, true);
  PERFORM pg_temp.ok(jsonb_array_length(public.sp_employer_attestation_queue(_x)) = 1,
    '2.9 an admin of the target employer sees it too');

  -- 2.10 An ordinary member does not. Visibility is not widened to everybody
  --      with a login at the company.
  PERFORM set_config('request.jwt.claim.sub', _xmember::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_employer_attestation_queue(%L)', _x),
    'SP_NOT_EMPLOYER_REPRESENTATIVE',
    '2.10 an ordinary member of the target employer is refused the queue');

  -- 2.11 An unrelated organisation learns nothing -- not "an empty list", which
  --      would still confirm the endpoint exists for them, but a refusal.
  PERFORM set_config('request.jwt.claim.sub', _yowner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_employer_attestation_queue(%L)', _x),
    'SP_NOT_EMPLOYER_REPRESENTATIVE',
    '2.11 an unrelated employer''s owner is refused Company X''s queue');

  -- 2.12 And their own queue is empty rather than carrying somebody else's row.
  PERFORM pg_temp.ok(
    public.sp_employer_attestation_queue('e8000000-0000-0000-0000-0000000000f2') = '[]'::jsonb,
    '2.12 an unrelated employer''s own queue contains nothing of Amina''s');

  -- 2.13 anon holds nothing on it. Restated after a CREATE OR REPLACE, which is
  --      exactly where a grant widens unnoticed on this project's hosted
  --      database, whose default privileges grant every new object to anon.
  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon',
      'public.sp_employer_attestation_queue(uuid)', 'EXECUTE'),
    '2.13 anon cannot execute the employer queue');

  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 3 -- a request the employer can put a name to'
-- =============================================================================
-- `sp_passport_profiles.display_name` is nullable, and the queue coalesced it
-- straight to ''. An employer was then asked "did this person work here?" with
-- no person named. There is no honest answer to that question.
DO $$
DECLARE _cilla uuid := 'e8000000-0000-0000-0000-000000000007';
        _z uuid := 'e8000000-0000-0000-0000-0000000000f3';
        _period uuid; _q jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _cilla::text, true);
  _period := pg_temp.new_period(_cilla, 'Company Z AB (fiktiv)');
  PERFORM public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _z);

  _q := public.sp_employer_attestation_queue(_z);
  PERFORM pg_temp.ok(jsonb_array_length(_q) = 1, '3.1 the request reaches Company Z');
  PERFORM pg_temp.ok(_q->0->>'holder_name' = 'Cilla Carlsson (fiktiv)',
    '3.2 a holder with no Passport display name is still named, from their account');
  PERFORM pg_temp.ok(_q->0->>'holder_name' <> '',
    '3.3 and the employer is therefore never asked about an unnamed person');
  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 4 -- the candidate who also owns the employer'
-- =============================================================================
-- Cilla owns Company Z and has just asked Company Z to confirm her own
-- employment. `has_employer_role` is true for her, so the request is genuinely
-- in her own employer queue. Nothing about that is a defect; the defect would
-- be if she could answer it.
DO $$
DECLARE _cilla uuid := 'e8000000-0000-0000-0000-000000000007';
        _z uuid := 'e8000000-0000-0000-0000-0000000000f3';
        _req uuid; _before text; _q jsonb;
BEGIN
  SELECT id INTO _req FROM public.sp_verification_requests
   WHERE holder_user_id = _cilla AND request_kind = 'employer_attestation' LIMIT 1;
  _before := pg_temp.fingerprint(_cilla);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _cilla::text, true);

  -- 4.1 The interface is told, by the database, before the person meets the
  --     refusal. Answered from auth.uid(), never from a comparison a page made.
  _q := public.sp_employer_attestation_queue(_z);
  PERFORM pg_temp.ok((_q->0->>'is_self')::boolean IS TRUE,
    '4.1 the queue marks the request as the caller''s own');

  -- 4.2 THE ABUSE CASE. Refused, and refused before anything is written.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
                                             NULL, NULL, NULL, NULL)', _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '4.2 a candidate who owns the employer cannot confirm their own employment');

  PERFORM pg_temp.ok(pg_temp.fingerprint(_cilla) = _before,
    '4.3 and nothing was written -- no decision, no event, no trust change');

  -- 4.4 Not merely the approval. Every outcome is refused, because the bar is
  --     on WHO IS DECIDING, not on what they decided.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''rejected'', NULL, NULL,
                                             ''kan inte bekräfta'', NULL, NULL)', _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '4.4 the same person cannot refuse their own request either');

  -- 4.5 And the entry did not quietly become verified by some other route.
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_experience_periods
      WHERE holder_user_id = _cilla LIMIT 1) = 'self_declared',
    '4.5 the employment stays self-declared');

  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 5 -- only the right organisation decides'
-- =============================================================================
DO $$
DECLARE _amina uuid := 'e8000000-0000-0000-0000-000000000001';
        _yowner uuid := 'e8000000-0000-0000-0000-000000000004';
        _xmember uuid := 'e8000000-0000-0000-0000-000000000006';
        _req uuid; _before text;
BEGIN
  SELECT id INTO _req FROM public.sp_verification_requests
   WHERE holder_user_id = _amina AND request_kind = 'employer_attestation'
     AND status = 'pending' LIMIT 1;
  _before := pg_temp.fingerprint(_amina);

  SET LOCAL ROLE authenticated;

  -- 5.1 Company Y's owner. Cannot read it, and — separately asserted, because
  --     visibility is not authorisation — cannot decide it either.
  PERFORM set_config('request.jwt.claim.sub', _yowner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
                                             NULL, NULL, NULL, NULL)', _req),
    'SP_NOT_EMPLOYER_REPRESENTATIVE',
    '5.1 an unrelated organisation cannot confirm somebody else''s employment');

  -- 5.2 A member of the RIGHT organisation. The role bar is owner|admin and is
  --     not widened by this release.
  PERFORM set_config('request.jwt.claim.sub', _xmember::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
                                             NULL, NULL, NULL, NULL)', _req),
    'SP_NOT_EMPLOYER_REPRESENTATIVE',
    '5.2 an ordinary member of the target employer cannot decide');

  PERFORM pg_temp.ok(pg_temp.fingerprint(_amina) = _before,
    '5.3 neither refusal wrote anything');

  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 6 -- a correction is asked for, and the candidate makes it'
-- =============================================================================
-- The flow the product is actually for: the employer says the end date is
-- wrong, the candidate fixes their own record, and asks again.
DO $$
DECLARE _amina uuid := 'e8000000-0000-0000-0000-000000000001';
        _xowner uuid := 'e8000000-0000-0000-0000-000000000003';
        _x uuid := 'e8000000-0000-0000-0000-0000000000f1';
        _req uuid; _period uuid; _before text;
BEGIN
  SELECT id INTO _req FROM public.sp_verification_requests
   WHERE holder_user_id = _amina AND request_kind = 'employer_attestation'
     AND status = 'pending' LIMIT 1;
  SELECT period_id INTO _period FROM public.sp_verification_requests WHERE id = _req;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _xowner::text, true);

  -- 6.1 A correction request with no message is not a correction request. PR 4's
  --     rule, and the reason the employer form's message field is labelled
  --     required for this outcome rather than optional.
  _before := pg_temp.fingerprint(_amina);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''clarification_requested'', NULL,
                                             NULL, NULL, NULL, NULL)', _req),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '6.1 an employer cannot ask for a correction without saying what to correct');

  -- 6.2 Whitespace is not a reason.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''clarification_requested'', NULL,
                                             NULL, %L, NULL, NULL)', _req, E'\t  '),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '6.2 nor with a message made of whitespace');

  PERFORM pg_temp.ok(pg_temp.fingerprint(_amina) = _before,
    '6.3 and neither attempt wrote anything');

  -- 6.4 The real one.
  PERFORM public.sp_verifier_decide(
    _req, 'clarification_requested', NULL,
    'INTERNAL: payroll shows an October leaver, checked with HR',
    'Our records show your employment ended on 31 October 2025.', NULL, NULL);
  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req)
      = 'clarification_requested',
    '6.4 an employer can ask for a correction, with a message');

  -- 6.5 THE EMPLOYER DOES NOT REWRITE THE CANDIDATE'S RECORD. They said the
  --     date is wrong; changing it is not theirs to do, and the database gives
  --     them no way to. Asserted as zero rows affected rather than as an error:
  --     RLS filters rather than refuses, and "wrote nothing" is the property.
  UPDATE public.sp_experience_periods SET ended_on = DATE '2025-10-31' WHERE id = _period;
  PERFORM pg_temp.ok(pg_temp.period_end(_period) = DATE '2025-12-31',
    '6.5 the employer cannot change the holder''s employment period');

  RESET ROLE;
END $$;

DO $$
DECLARE _amina uuid := 'e8000000-0000-0000-0000-000000000001';
        _x uuid := 'e8000000-0000-0000-0000-0000000000f1';
        _req uuid; _period uuid;
BEGIN
  SELECT id, period_id INTO _req, _period FROM public.sp_verification_requests
   WHERE holder_user_id = _amina AND status = 'clarification_requested' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _amina::text, true);

  -- 6.6 The candidate reads what they were told, in their own words -- the
  --     candidate-facing message, and only that.
  PERFORM pg_temp.ok(
    (SELECT holder_message FROM public.sp_verification_requests WHERE id = _req)
      = 'Our records show your employment ended on 31 October 2025.',
    '6.6 the candidate reads the employer''s message to them');

  -- 6.7 And never the internal note. Column-level privileges, not a policy:
  --     the row is theirs, the column is not.
  PERFORM pg_temp.must_fail(
    format('SELECT decision_note FROM public.sp_verification_requests WHERE id = %L', _req),
    'permission denied',
    '6.7 the candidate cannot read the internal decision note on the request');
  PERFORM pg_temp.must_fail(
    format('SELECT decision_note FROM public.sp_verification_decisions WHERE request_id = %L', _req),
    'permission denied',
    '6.8 nor on the decision record');

  -- 6.9 THE CORRECTION IS THEIRS. The entry is still self-declared, so their own
  --     UPDATE policy admits it -- which is the whole reason the employer's did
  --     not have to.
  UPDATE public.sp_experience_periods SET ended_on = DATE '2025-10-31' WHERE id = _period;
  PERFORM pg_temp.ok(
    (SELECT ended_on FROM public.sp_experience_periods WHERE id = _period) = DATE '2025-10-31',
    '6.9 the candidate corrects their own employment period');

  -- 6.10 And the organisation is named to them from the DECISION record, which
  --      is what the database wrote -- not from the company name they typed
  --      onto the period themselves.
  PERFORM pg_temp.ok(
    (SELECT decider_organisation FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'clarification_requested')
      = 'Company X AB (fiktiv)',
    '6.10 the correction request is attributed to the organisation that made it');

  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 7 -- the confirmation, and who it belongs to'
-- =============================================================================
DO $$
DECLARE _amina uuid := 'e8000000-0000-0000-0000-000000000001';
        _xadmin uuid := 'e8000000-0000-0000-0000-000000000005';
        _req uuid; _period uuid;
BEGIN
  SELECT id, period_id INTO _req, _period FROM public.sp_verification_requests
   WHERE holder_user_id = _amina AND status = 'clarification_requested' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _xadmin::text, true);

  -- 7.1 An approval must say HOW. An employer has exactly one honest answer and
  --     the surface records it for them; a crafted call with none is refused.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', NULL, NULL, NULL, NULL, NULL)',
           _req),
    'SP_APPROVAL_REQUIRES_METHOD',
    '7.1 a confirmation with no recorded method is refused');

  -- 7.2 The happy path, decided by the ADMIN rather than the owner: both are
  --     authorised, and the record must name the organisation either way.
  PERFORM public.sp_verifier_decide(
    _req, 'approved', 'employer_confirmation', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req) = 'approved',
    '7.2 an admin of the target employer can confirm the employment');

  -- 7.3-7.5 THE PROVENANCE. Three separate facts, kept separate, which is what
  --     lets the candidate's Passport say "Employment confirmed by Company X"
  --     rather than "Verified by CQrityjob".
  PERFORM pg_temp.ok(
    (SELECT decider_organisation FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'approved') = 'Company X AB (fiktiv)',
    '7.3 the decision records the CONFIRMING ORGANISATION by name');
  PERFORM pg_temp.ok(
    (SELECT decider_organisation FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'approved') <> 'CQrityjob',
    '7.4 and it is not CQrityjob -- CQrityjob decided nothing here');
  PERFORM pg_temp.ok(
    (SELECT verification_method FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'approved') = 'employer_confirmation',
    '7.5 the METHOD stays distinct from document_review and issuer_confirmation');
  PERFORM pg_temp.ok(
    (SELECT decided_at IS NOT NULL FROM public.sp_verification_decisions
      WHERE request_id = _req AND decision = 'approved'),
    '7.6 and when it was decided');

  -- 7.7 The trust change itself, read as the owner because the employer
  --     representative deciding it cannot see the row -- and must not be able
  --     to, which is exactly what 2.7 asserts.
  PERFORM pg_temp.ok(pg_temp.period_level(_period) = 'verified',
    '7.7 the confirmation raised the employment period to verified');

  RESET ROLE;
END $$;

DO $$
DECLARE _amina uuid := 'e8000000-0000-0000-0000-000000000001';
        _xowner uuid := 'e8000000-0000-0000-0000-000000000003';
        _req uuid; _period uuid; _before text;
BEGIN
  SELECT id, period_id INTO _req, _period FROM public.sp_verification_requests
   WHERE holder_user_id = _amina AND status = 'approved' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _amina::text, true);

  -- 7.8 The Passport now carries it as confirmed employment.
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_experience_periods WHERE id = _period) = 'verified',
    '7.8 the employment period is now verified in the candidate''s Passport');

  -- 7.9 And the candidate can no longer edit a confirmed fact from under the
  --     organisation that confirmed it. Refused rather than silently ignored,
  --     unlike 6.5: there the employer failed the policy's USING clause and the
  --     row was simply not theirs to see, here the holder passes USING and is
  --     stopped by WITH CHECK, which raises. Both are the boundary holding; they
  --     are different halves of it and are asserted differently on purpose.
  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_experience_periods SET ended_on = DATE ''2020-01-01''
             WHERE id = %L', _period),
    'row-level security',
    '7.9 a confirmed period cannot be rewritten by its holder');
  PERFORM pg_temp.ok(pg_temp.period_end(_period) = DATE '2025-10-31',
    '7.9b and the confirmed dates are unchanged');

  RESET ROLE;

  -- 7.10 One request, one final decision. The employer who already answered
  --      cannot answer again, and neither can their colleague.
  _before := pg_temp.fingerprint(_amina);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _xowner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''rejected'', NULL, NULL,
                                             ''ändrar mig'', NULL, NULL)', _req),
    'SP_REQUEST_ALREADY_DECIDED',
    '7.10 a second final decision on the same request is refused');
  PERFORM pg_temp.ok(pg_temp.fingerprint(_amina) = _before,
    '7.11 and the confirmation that stands was not disturbed');
  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 8 -- cannot confirm'
-- =============================================================================
DO $$
DECLARE _bo uuid := 'e8000000-0000-0000-0000-000000000002';
        _xowner uuid := 'e8000000-0000-0000-0000-000000000003';
        _x uuid := 'e8000000-0000-0000-0000-0000000000f1';
        _period uuid; _req uuid; _before text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _bo::text, true);
  _period := pg_temp.new_period(_bo, 'Company X AB (fiktiv)');
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _x);

  PERFORM set_config('request.jwt.claim.sub', _xowner::text, true);

  -- 8.1 "We cannot confirm this" is an outcome the candidate has to act on, so
  --     it has to say something. The same rule as the correction request.
  _before := pg_temp.fingerprint(_bo);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''rejected'', NULL, NULL, NULL, NULL, NULL)',
           _req),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '8.1 an employer cannot refuse a confirmation without giving a reason');
  PERFORM pg_temp.ok(pg_temp.fingerprint(_bo) = _before, '8.2 and nothing was written');

  PERFORM public.sp_verifier_decide(
    _req, 'rejected', NULL, NULL,
    'We could not locate employment records matching this period.', NULL, NULL);
  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req) = 'rejected',
    '8.3 an employer can say they cannot confirm');

  -- 8.4 NO FALSE GREEN STATE. A refusal is not a quiet nothing: the entry stays
  --     exactly what it was, a self-declaration.
  PERFORM pg_temp.ok(pg_temp.period_level(_period) = 'self_declared',
    '8.4 the employment stays self-declared -- a refusal verifies nothing');

  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _bo::text, true);
  PERFORM pg_temp.ok(
    (SELECT holder_message FROM public.sp_verification_requests WHERE id = _req)
      = 'We could not locate employment records matching this period.',
    '8.5 and the candidate is told exactly why, in the employer''s own words');

  -- 8.6 A refused request is not an open one, so the candidate may ask again
  --     once they have corrected whatever was wrong. No new workflow state was
  --     invented for this; the existing open-request rule already permits it.
  PERFORM pg_temp.ok(
    public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _x) IS NOT NULL,
    '8.6 the candidate can ask again after a refusal');

  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 9 -- the count the employer dashboard shows'
-- =============================================================================
-- The dashboard number is derived from this same function, so it is asserted
-- against the same rows rather than against a second query that could drift.
-- "Actionable" means PENDING: a correction the employer already asked for is
-- waiting on the candidate, and a request the reader submitted themselves is
-- one they are barred from deciding.
DO $$
DECLARE _xowner uuid := 'e8000000-0000-0000-0000-000000000003';
        _cilla uuid := 'e8000000-0000-0000-0000-000000000007';
        _x uuid := 'e8000000-0000-0000-0000-0000000000f1';
        _z uuid := 'e8000000-0000-0000-0000-0000000000f3';
        _q jsonb; _pending int; _clar int; _self int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _xowner::text, true);
  _q := public.sp_employer_attestation_queue(_x);

  SELECT count(*) FILTER (WHERE e->>'status' = 'pending' AND (e->>'is_self')::boolean IS FALSE),
         count(*) FILTER (WHERE e->>'status' = 'clarification_requested'),
         count(*) FILTER (WHERE (e->>'is_self')::boolean IS TRUE)
    INTO _pending, _clar, _self
    FROM jsonb_array_elements(_q) e;

  PERFORM pg_temp.ok(_pending = 1,
    '9.1 exactly one request is waiting on Company X -- Bo''s resubmission');
  PERFORM pg_temp.ok(_clar = 0,
    '9.2 the correction Company X already asked for is no longer theirs to do');
  PERFORM pg_temp.ok(_self = 0,
    '9.3 and nobody at Company X is answering their own request');

  -- 9.4 The decided rows are still in the list -- they are history, and the
  --     workspace shows them. They are simply not the count.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_q) e
      WHERE e->>'status' IN ('approved','rejected')) = 2,
    '9.4 answered requests stay visible in the list without inflating the count');

  -- 9.5 At Company Z the only request is Cilla's own, so the actionable count
  --     is zero even though the list is not empty. A count that included it
  --     would send somebody to a queue where the one item is barred to them.
  PERFORM set_config('request.jwt.claim.sub', _cilla::text, true);
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(public.sp_employer_attestation_queue(_z)) e
      WHERE e->>'status' = 'pending' AND (e->>'is_self')::boolean IS FALSE) = 0,
    '9.5 a self-request is visible but is not actionable work');

  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 10 -- nothing about this release widened anything'
-- =============================================================================
DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_employer_attestation_queue';

  PERFORM pg_temp.ok(_src LIKE '%SP_NOT_EMPLOYER_REPRESENTATIVE%',
    '10.1 the queue still proves the caller represents the employer, first');
  PERFORM pg_temp.ok(_src NOT LIKE '%sp_claims%',
    '10.2 the queue cannot reach the credentials table');
  PERFORM pg_temp.ok(_src NOT LIKE '%sp_evidence%',
    '10.3 the queue cannot reach the evidence table');
  PERFORM pg_temp.ok(_src NOT LIKE '%decision_note%',
    '10.4 the queue cannot reach the internal decision note');
  PERFORM pg_temp.ok(_src NOT LIKE '%email%',
    '10.5 the queue returns no contact details');

  -- 10.6 The employment-only boundary is a property of the DATA, not only of
  --      the functions, and this release did not relax it.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.sp_verification_requests'::regclass
               AND conname = 'sp_vr_employer_attestation_is_employment_only'),
    '10.6 the employment-only constraint is still in place');

  -- 10.7 And so is one-final-decision.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
             AND indexname = 'sp_vd_one_final_decision_per_request'),
    '10.7 one final decision per request is still an invariant of the data');

  -- 10.8 Four separate trust facts, still four. This is what will let a later
  --      release add issuer and registry verification without any of them
  --      becoming indistinguishable from an employer's word.
  PERFORM pg_temp.ok(
    (SELECT count(DISTINCT unnest) FROM unnest(ARRAY[
       'document_review','employer_confirmation','issuer_confirmation'])) = 3
    AND (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.sp_verification_requests'::regclass
            AND pg_get_constraintdef(oid) LIKE '%verification_method%'
          LIMIT 1) LIKE '%issuer_confirmation%',
    '10.8 the three verification methods remain separately recorded');
END $$;

\echo '==> Security Passport employer employment verification: done'
