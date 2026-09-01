-- =============================================================================
-- Security Passport — which organisation may be asked to confirm employment
--
-- PR 17 makes the employer easier to FIND. Most of that work is interface, and
-- interface is not a boundary. This suite asserts the part that has to be true
-- underneath the picker, by executing it as the principals involved:
--
--   * a request may be addressed only to an organisation CQrityjob has
--     approved -- `employers.status = 'active'` -- and every other status is
--     refused by NAME rather than by a constraint from inside the database;
--   * a candidate who registered their own organisation cannot address
--     employment confirmation to it while it is unapproved, and cannot decide
--     their own request once it is;
--   * the discoverability change did not widen what a candidate can SEE: the
--     `employers` policies are still the whole of it, proved by reading the
--     table as a candidate principal and counting;
--   * and every refusal the submission path already made still refuses --
--     somebody else's period, a second open request, a credential dressed as
--     an employment.
--
-- Where an attempt must be refused, the refusal alone is never the assertion.
-- The request count is taken before and after: "it raised an error" and "it
-- wrote nothing" are different claims, and only the second is the security
-- property.
--
-- All identities are transparently fictional and use an `e9` prefix.
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

-- The measuring instrument, not an assertion. SECURITY DEFINER because the
-- refusal tests run as `authenticated` and 20261016090000 deliberately stopped
-- granting that role the columns a count over the request table would touch.
CREATE OR REPLACE FUNCTION pg_temp.req_count(_holder uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT count(*) FROM public.sp_verification_requests WHERE holder_user_id = _holder;
$$;

CREATE OR REPLACE FUNCTION pg_temp.period_level(_period uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT assertion_level FROM public.sp_experience_periods WHERE id = _period;
$$;

CREATE OR REPLACE FUNCTION pg_temp.employer_status(_employer uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT status FROM public.employers WHERE id = _employer;
$$;

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

\echo '==> Security Passport employer matching and eligibility'

-- -----------------------------------------------------------------------------
-- Fictional cast
-- -----------------------------------------------------------------------------
--   ...01  Nadia (fiktiv)  — the candidate. Worked at Nordvakt AB.
--   ...02  Petra (fiktiv)  — an unrelated second candidate.
--   ...03  owner of Nordvakt AB (active, and the correct answer)
--   ...04  Sven (fiktiv)   — a candidate who ALSO owns an organisation of his
--                            own that CQrityjob has not approved. The
--                            self-verification route this PR closes at the
--                            door as well as at the decision.
--   ...05  Alma (fiktiv)   — a platform admin. Present only so GROUP 5 can
--                            suspend an organisation the way the platform
--                            actually does it: employers.status is refused to
--                            every caller of every role except from inside
--                            moderate_employer() (20260720140000), and a
--                            fixture that reached around that guard would be
--                            setting up a state the product cannot produce.
INSERT INTO auth.users (id, email) VALUES
  ('e9000000-0000-0000-0000-000000000001','em-nadia@example.test'),
  ('e9000000-0000-0000-0000-000000000002','em-petra@example.test'),
  ('e9000000-0000-0000-0000-000000000003','em-nordvakt-owner@example.test'),
  ('e9000000-0000-0000-0000-000000000004','em-sven@example.test'),
  ('e9000000-0000-0000-0000-000000000005','em-alma-admin@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('e9000000-0000-0000-0000-000000000005','admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('e9000000-0000-0000-0000-000000000001','Nadia Nyman (fiktiv)'),
  ('e9000000-0000-0000-0000-000000000002','Petra Palm (fiktiv)'),
  ('e9000000-0000-0000-0000-000000000004','Sven Sjo (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

-- The organisation set from the pilot script, plus one of each ineligible
-- status. Names are deliberately similar: three separately registered
-- companies must stay three companies, and nothing in the database is
-- permitted to decide otherwise.
INSERT INTO public.employers (id, slug, name, country, status) VALUES
  ('e9000000-0000-0000-0000-0000000000f1','em-nordvakt','Nordvakt AB (fiktiv)','SE','active'),
  ('e9000000-0000-0000-0000-0000000000f2','em-nord-vakt','Nord Vakt AB (fiktiv)','SE','active'),
  ('e9000000-0000-0000-0000-0000000000f3','em-nordvakt-dubai','Nordvakt Dubai LLC (fiktiv)','AE','active'),
  ('e9000000-0000-0000-0000-0000000000f4','em-pending','Pendingvakt AB (fiktiv)','SE','pending'),
  ('e9000000-0000-0000-0000-0000000000f5','em-suspended','Susptvakt AB (fiktiv)','SE','suspended'),
  ('e9000000-0000-0000-0000-0000000000f6','em-draft','Draftvakt AB (fiktiv)','SE','draft'),
  ('e9000000-0000-0000-0000-0000000000f7','em-rejected','Rejvakt AB (fiktiv)','SE','rejected'),
  ('e9000000-0000-0000-0000-0000000000f8','em-archived','Arkivvakt AB (fiktiv)','SE','archived'),
  -- Sven's own company, unapproved. He is its owner, so employers_member_select
  -- lets him READ it whatever its status -- which is exactly how it reached the
  -- picker before this PR.
  ('e9000000-0000-0000-0000-0000000000f9','em-svens','Svens Bevakning AB (fiktiv)','SE','pending')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e9000000-0000-0000-0000-0000000000f1','e9000000-0000-0000-0000-000000000003','owner','active'),
  ('e9000000-0000-0000-0000-0000000000f9','e9000000-0000-0000-0000-000000000004','owner','active')
ON CONFLICT DO NOTHING;


-- =============================================================================
-- GROUP 1. Only an approved organisation may be asked
-- =============================================================================
DO $$
DECLARE _nadia uuid := 'e9000000-0000-0000-0000-000000000001';
        _active uuid := 'e9000000-0000-0000-0000-0000000000f1';
        _before bigint; _period uuid; _req uuid;
        _bad record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _nadia::text, true);

  -- 1.1 The case that must keep working. Everything below is a refusal, and a
  --     suite of refusals proves nothing if the permitted act is broken too.
  _period := pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)');
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _active);
  PERFORM pg_temp.ok(_req IS NOT NULL,
    '1.1 an approved organisation can still be asked to confirm employment');

  -- 1.2-1.6 Every other status. One fresh period each: the open-request rule
  --     would otherwise refuse the second attempt before the organisation was
  --     ever consulted, and the assertion would pass without testing anything.
  FOR _bad IN
    SELECT * FROM (VALUES
      ('e9000000-0000-0000-0000-0000000000f4'::uuid, 'pending',   '1.2'),
      ('e9000000-0000-0000-0000-0000000000f5'::uuid, 'suspended', '1.3'),
      ('e9000000-0000-0000-0000-0000000000f6'::uuid, 'draft',     '1.4'),
      ('e9000000-0000-0000-0000-0000000000f7'::uuid, 'rejected',  '1.5'),
      ('e9000000-0000-0000-0000-0000000000f8'::uuid, 'archived',  '1.6')
    ) AS t(id, status, n)
  LOOP
    DECLARE _fresh uuid; _n bigint;
    BEGIN
      _fresh := pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)');
      _n := pg_temp.req_count(_nadia);
      PERFORM pg_temp.must_fail(
        format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
               _fresh, _bad.id),
        'SP_EMPLOYER_NOT_ELIGIBLE',
        _bad.n || ' a ' || _bad.status || ' organisation cannot be asked to confirm employment');
      PERFORM pg_temp.ok(pg_temp.req_count(_nadia) = _n,
        _bad.n || 'a and nothing was written -- the refusal is not merely an error');
    END;
  END LOOP;

  -- 1.7 An id that is no organisation at all. Refused by name, before the
  --     foreign key, so the caller gets a sentence rather than a constraint.
  DECLARE _fresh uuid;
  BEGIN
    _fresh := pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)');
    _before := pg_temp.req_count(_nadia);
    PERFORM pg_temp.must_fail(
      format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
             _fresh, 'e9000000-0000-0000-0000-0000000000fe'),
      'SP_EMPLOYER_NOT_FOUND',
      '1.7 an employer id naming no organisation is refused by name');
    PERFORM pg_temp.ok(pg_temp.req_count(_nadia) = _before,
      '1.7a and nothing was written');
  END;

  -- 1.8 No organisation at all on an employer attestation.
  DECLARE _fresh uuid;
  BEGIN
    _fresh := pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)');
    PERFORM pg_temp.must_fail(
      format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', NULL)',
             _fresh),
      'SP_EMPLOYER_REQUIRED',
      '1.8 an employer attestation naming no organisation is refused by name');
  END;

  -- 1.9 The CQrityjob review path has no employer and must be untouched by any
  --     of this. A rule about organisations that broke document review would be
  --     a worse defect than the one it closes.
  DECLARE _fresh uuid; _r uuid;
  BEGIN
    _fresh := pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)');
    _r := public.sp_submit_for_verification(NULL, _fresh, 'cqrityjob_review', NULL);
    PERFORM pg_temp.ok(_r IS NOT NULL,
      '1.9 a CQrityjob document review with no employer is unaffected');
  END;

  RESET ROLE;
END $$;


-- =============================================================================
-- GROUP 2. The refusals that were already there, and still are
-- =============================================================================
DO $$
DECLARE _nadia uuid := 'e9000000-0000-0000-0000-000000000001';
        _petra uuid := 'e9000000-0000-0000-0000-000000000002';
        _active uuid := 'e9000000-0000-0000-0000-0000000000f1';
        _period uuid; _before bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _nadia::text, true);

  -- 2.1 A second request while one is open. The duplicate rule this PR must
  --     not have loosened: a candidate who presses the confirmation control
  --     twice gets one request, not two.
  _period := pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)');
  PERFORM public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _active);
  _before := pg_temp.req_count(_nadia);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
           _period, _active),
    'SP_REQUEST_ALREADY_OPEN',
    '2.1 a second open request on the same employment is refused');
  PERFORM pg_temp.ok(pg_temp.req_count(_nadia) = _before,
    '2.1a and no second row was written');

  -- 2.2 The same, aimed at a DIFFERENT organisation. Choosing again in the
  --     picker must not be a way around the open-request rule.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
           _period, 'e9000000-0000-0000-0000-0000000000f2'),
    'SP_REQUEST_ALREADY_OPEN',
    '2.2 nor by choosing a different organisation for the same employment');

  -- 2.3 Somebody else's employment period, with a perfectly eligible employer.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
           pg_temp.new_period(_petra, 'Nordvakt AB (fiktiv)'), _active),
    'SP_NOT_HOLDER',
    '2.3 a candidate cannot open a request on somebody else''s employment');
  PERFORM pg_temp.ok(pg_temp.req_count(_petra) = 0,
    '2.3a and the other candidate has no requests at all');

  RESET ROLE;
END $$;


-- =============================================================================
-- GROUP 3. The candidate who owns a company
-- =============================================================================
-- Two rules, and they do different jobs. The eligibility check stops the
-- request being ADDRESSED to an unapproved organisation; sp_verifier_decide
-- stops the holder DECIDING it whatever the organisation's status. Neither
-- replaces the other, and this group asserts both.
DO $$
DECLARE _sven uuid := 'e9000000-0000-0000-0000-000000000004';
        _svens uuid := 'e9000000-0000-0000-0000-0000000000f9';
        _active uuid := 'e9000000-0000-0000-0000-0000000000f1';
        _period uuid; _req uuid; _before bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _sven::text, true);

  -- 3.1 He can READ his own unapproved organisation -- employers_member_select
  --     says so, and this PR does not change that. It is the reason the picker
  --     used to offer it to him.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.employers WHERE id = _svens) = 1,
    '3.1 an owner can still read their own unapproved organisation');

  -- 3.2 And cannot address employment confirmation to it.
  _period := pg_temp.new_period(_sven, 'Svens Bevakning AB (fiktiv)');
  _before := pg_temp.req_count(_sven);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
           _period, _svens),
    'SP_EMPLOYER_NOT_ELIGIBLE',
    '3.2 but cannot ask their own unapproved organisation to confirm their employment');
  PERFORM pg_temp.ok(pg_temp.req_count(_sven) = _before,
    '3.2a and nothing was written');

  -- 3.3 Addressed to an organisation that IS approved, the request is allowed.
  --     Nothing about asking is a trust decision; the trust decision is below.
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _active);
  PERFORM pg_temp.ok(_req IS NOT NULL,
    '3.3 an approved organisation may be asked, because asking verifies nothing');

  RESET ROLE;
END $$;

-- 3.4 The decision, attempted by the holder. Run in its own block as the OWNER
--     of the organisation, which is what a candidate-who-owns-a-company is.
DO $$
DECLARE _sven uuid := 'e9000000-0000-0000-0000-000000000004';
        _nordvakt_owner uuid := 'e9000000-0000-0000-0000-000000000003';
        _req uuid; _period uuid;
BEGIN
  SELECT r.id, r.period_id INTO _req, _period
    FROM public.sp_verification_requests r
   WHERE r.holder_user_id = _sven AND r.status = 'pending'
   ORDER BY r.submitted_at DESC LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _sven::text, true);

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'',
                                             NULL, NULL, NULL, NULL)', _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '3.4 the holder cannot decide their own employment confirmation');

  PERFORM pg_temp.ok(pg_temp.period_level(_period) = 'self_declared',
    '3.4a and the employment is still self-declared -- a refusal verifies nothing');

  RESET ROLE;
END $$;


-- =============================================================================
-- GROUP 4. Discovery did not widen what a candidate can see
-- =============================================================================
-- The picker's query narrowed (`status = 'active'`) and nothing else changed.
-- What a candidate can read is still decided by employers' own policies, and
-- this group proves it by reading the table AS a candidate rather than by
-- reading the policies.
DO $$
DECLARE _nadia uuid := 'e9000000-0000-0000-0000-000000000001';
        _visible bigint; _ineligible bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _nadia::text, true);

  -- 4.1 None of this suite's organisations has a published job and Nadia is a
  --     member of none of them, so employers_public_active_select and
  --     employers_member_select between them show her none. The picker cannot
  --     offer what the database does not return: RLS is still the boundary,
  --     and the status filter only ever removes.
  SELECT count(*) INTO _visible
    FROM public.employers WHERE slug LIKE 'em-%';
  PERFORM pg_temp.ok(_visible = 0,
    '4.1 a candidate sees no organisation they are unrelated to and that has no live job');

  -- 4.2 The same read with the picker's own filter applied. It can only ever
  --     return a subset of 4.1, and the assertion states that rather than
  --     assuming it.
  SELECT count(*) INTO _ineligible
    FROM public.employers WHERE slug LIKE 'em-%' AND status <> 'active';
  PERFORM pg_temp.ok(_ineligible = 0,
    '4.2 and no ineligible organisation is readable by them either');

  RESET ROLE;
END $$;

-- 4.3 The owner of an organisation sees their own, whatever its status. Stated
--     because it is the visibility this PR relies on NOT having removed: the
--     employer workspace needs it, and the fix for the picker had to be a
--     narrowing of one query rather than a narrowing of the policy.
DO $$
DECLARE _sven uuid := 'e9000000-0000-0000-0000-000000000004';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _sven::text, true);

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.employers WHERE slug = 'em-svens') = 1,
    '4.3 an owner still reads their own organisation, whatever its status');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.employers WHERE slug = 'em-nordvakt') = 0,
    '4.3a and reads no other organisation they have no relationship with');

  RESET ROLE;
END $$;


-- =============================================================================
-- GROUP 5. A request already in flight is not retro-actively voided
-- =============================================================================
-- The eligibility rule is about STARTING a request. An organisation suspended
-- the day after it was asked keeps the request, keeps its queue and can still
-- answer -- breaking a workflow in flight to enforce a rule about beginning one
-- would be a worse outcome than the rule is worth.
DO $$
DECLARE _nadia uuid := 'e9000000-0000-0000-0000-000000000001';
        _owner uuid := 'e9000000-0000-0000-0000-000000000003';
        _alma  uuid := 'e9000000-0000-0000-0000-000000000005';
        _nordvakt uuid := 'e9000000-0000-0000-0000-0000000000f1';
        _period uuid; _req uuid; _queue jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _nadia::text, true);
  _period := pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)');
  _req := public.sp_submit_for_verification(NULL, _period, 'employer_attestation', _nordvakt);

  -- Suspended after the fact, through moderate_employer(), because that is the
  -- ONLY way employers.status changes: 20260720140000 refuses the UPDATE to
  -- every caller of every role, platform admins included, outside that
  -- function. A fixture that set the column directly would be constructing a
  -- state the product cannot reach, and proving something about it.
  PERFORM set_config('request.jwt.claim.sub', _alma::text, true);
  PERFORM public.moderate_employer(_nordvakt, 'suspended', 'Fiktiv granskning pagar.');
  PERFORM pg_temp.ok(
    pg_temp.employer_status(_nordvakt) = 'suspended',
    '5.0 the organisation is suspended by the platform, through moderation');

  -- 5.1 The request placed before the suspension is still the employer's to
  --     answer. Read as the OWNER, through the queue function itself.
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _queue := public.sp_employer_attestation_queue(_nordvakt);
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM jsonb_array_elements(_queue) e WHERE e->>'id' = _req::text),
    '5.1 a request placed before suspension is still in the employer''s queue');

  -- 5.2 And a NEW one cannot be started against it.
  PERFORM set_config('request.jwt.claim.sub', _nadia::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_submit_for_verification(NULL, %L, ''employer_attestation'', %L)',
           pg_temp.new_period(_nadia, 'Nordvakt AB (fiktiv)'), _nordvakt),
    'SP_EMPLOYER_NOT_ELIGIBLE',
    '5.2 while a new request to the now-suspended organisation is refused');

  -- Put it back, so the fixture leaves the database as it found it.
  PERFORM set_config('request.jwt.claim.sub', _alma::text, true);
  PERFORM public.moderate_employer(_nordvakt, 'reactivated', 'Fiktiv granskning klar.');
  PERFORM pg_temp.ok(
    pg_temp.employer_status(_nordvakt) = 'active',
    '5.3 and reactivation restores it, so the fixture leaves no residue');

  RESET ROLE;
END $$;

\echo '==> Security Passport employer matching and eligibility: all assertions passed'
