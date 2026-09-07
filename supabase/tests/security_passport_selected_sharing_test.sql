-- =============================================================================
-- Security Passport — the holder chooses what a share carries, the contract is
-- enforced where the write happens, and nothing internal crosses to a stranger.
--
-- Everything asserted here is a property of the DATABASE, not of the page: the
-- scope, the input contract and the idempotency have to hold against a crafted
-- call, not merely against a browser that renders fewer rows than it received.
--
--   GROUP  1  the selection is the scope, and the scope is what is rendered
--   GROUP  2  a merit recorded later never joins an existing share
--   GROUP  3  a merit that stops being current LEAVES it
--   GROUP  4  the preview IS the recipient view
--   GROUP  5  the sharing policy: lifecycle gates, assertion level does not
--   GROUP  6  the selection is not writable from the Data API
--   GROUP  7  expiry, revocation and a guessed token are one answer
--   GROUP  8  the input contract, asserted against direct RPC calls
--   GROUP  9  idempotency: replay, conflict, and no constraint leakage
--   GROUP 10  what the recipient may and may not learn
--   GROUP 11  no database identifier crosses the anonymous boundary
--   GROUP 12  a new link over the same contents
--   GROUP 13  nothing about the existing packages moved
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
    RAISE NOTICE 'ok  % (refused: %)', label, left(_msg, 90);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- SUCCEEDED but must be refused', label;
END $$;

/** Every key on every disclosed row, so a forbidden field can be asserted
 *  absent without grepping a serialised blob. */
CREATE OR REPLACE FUNCTION pg_temp.payload_row_keys(_payload jsonb)
RETURNS TABLE(k text) LANGUAGE sql AS $$
  SELECT jsonb_object_keys(x)
    FROM jsonb_array_elements(_payload -> 'verified_claims') x
  UNION
  SELECT jsonb_object_keys(x)
    FROM jsonb_array_elements(_payload -> 'verified_experience') x;
$$;

\echo '==> Security Passport selected-merit sharing'

-- ---------------------------------------------------------------------------
-- Fixtures. Invented people, invented companies.
--
-- `updated_at` is written explicitly and IN THE PAST on every row: the whole
-- point of GROUP 1's freshness assertion is that `last_updated` describes the
-- shared FACTS and not the moment of sharing, and the two are the same value
-- unless the fixture separates them. Only a BEFORE UPDATE trigger maintains
-- that column, so an INSERT may state it.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('d1000000-0000-4000-8000-000000000001','sel-holder@example.test'),
  ('d1000000-0000-4000-8000-000000000002','sel-other@example.test'),
  ('d1000000-0000-4000-8000-000000000003','sel-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code, updated_at)
VALUES ('d1000000-0000-4000-8000-000000000001','Selma Delare (fiktiv)','SE', now() - interval '20 days'),
       ('d1000000-0000-4000-8000-000000000002','Otto Annan (fiktiv)','SE', now() - interval '20 days')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.employers (id, slug, name, status)
VALUES ('d1b00000-0000-4000-8000-0000000000e1','sel-nordvakt','Nordvakt AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, credential_code, jurisdiction_code,
   claimed_issuer_name, issued_on, valid_until, authorisation_scope,
   assertion_level, lifecycle_state, verified_by_user_id, verified_at, updated_at)
VALUES
  -- C1 · SELECTED · a CQrityjob document review. VU1 is a TRAINING credential
  -- in the catalogue and is named by its definition; the fixtures obey the
  -- same triggers real rows do.
  ('d1c00000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
   'training','Väktarutbildning 1 (VU1)','VU1','SE','Utbildaren AB (fiktiv)',
   DATE '2024-03-01', NULL, NULL,'verified','active',
   'd1000000-0000-4000-8000-000000000003', now(), now() - interval '10 days'),
  -- C2 · SELECTED · an ISSUER confirmation, which this product cannot
  -- structurally support, and a scope-bearing approval.
  ('d1c00000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
   'licence','Skyddsvaktsförordnande','SV','SE','Länsstyrelsen (fiktiv)',
   DATE '2023-06-01', current_date + 200,'Skyddsobjekt: Kaj 12 (fiktivt)',
   'verified','active','d1000000-0000-4000-8000-000000000003', now(), now() - interval '5 days'),
  -- C3 · NOT selected, and shareable in every other way.
  ('d1c00000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',
   'certification','Hjärt- och lungräddning (fiktiv)',NULL,'SE','Utbildaren AB (fiktiv)',
   DATE '2025-01-10', current_date + 500, NULL,'verified','active',
   'd1000000-0000-4000-8000-000000000003', now(), now() - interval '3 days'),
  -- C4 · SELECTED · self-declared, and shareable. The reversal this suite is
  -- here to hold: nobody checked it, and the recipient is told so.
  ('d1c00000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',
   'training','Egen anteckning (fiktiv)',NULL,'SE','Ingen',
   DATE '2025-02-01', NULL, NULL,'self_declared','active', NULL, NULL,
   now() - interval '1 day'),
  -- C5 · a document attached and nobody has assessed it. Shareable, and on the
  -- public ladder it sits on the self-declared rung, not the documented one.
  ('d1c00000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001',
   'training','Inlämnat dokument (fiktivt)',NULL,'SE','Utbildaren AB (fiktiv)',
   DATE '2025-03-01', NULL, NULL,'document_provided','active', NULL, NULL,
   now() - interval '2 days'),
  -- C6 · archived. Never shareable, at any assertion level.
  ('d1c00000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000001',
   'training','Security Guard Training 1 (VU1)','VU1','SE','Utbildaren AB (fiktiv)',
   DATE '2019-01-01', NULL, NULL,'verified','superseded',
   'd1000000-0000-4000-8000-000000000003', now(), now() - interval '400 days'),
  -- C7 · unfinished. Never shareable.
  ('d1c00000-0000-4000-8000-000000000007','d1000000-0000-4000-8000-000000000001',
   'training','Påbörjat utkast (fiktivt)',NULL,'SE','Ingen',
   NULL, NULL, NULL,'self_declared','draft', NULL, NULL, now() - interval '1 day'),
  -- Another holder's credential, for the ownership boundary.
  ('d1c00000-0000-4000-8000-0000000000ff','d1000000-0000-4000-8000-000000000002',
   'training','Väktarutbildning 1 (VU1)','VU1','SE','Utbildaren AB (fiktiv)',
   DATE '2024-01-01', NULL, NULL,'verified','active',
   'd1000000-0000-4000-8000-000000000003', now(), now() - interval '9 days');

INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, jurisdiction_code,
   started_on, ended_on, assertion_level, lifecycle_state, updated_at)
VALUES
  -- P1 · SELECTED · employer-confirmed. The only source confirmation here.
  ('d1e00000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
   'Nordvakt AB (fiktiv)','Väktare','SE', DATE '2021-01-01', DATE '2023-01-01',
   'verified','active', now() - interval '30 days'),
  -- P2 · NOT selected, and equally shareable.
  ('d1e00000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
   'Sydvakt AB (fiktiv)','Ordningsvakt','SE', DATE '2023-02-01', NULL,
   'verified','active', now() - interval '30 days'),
  -- P3 · SELECTED · self-declared employment. It appears, and it is NOT
  -- counted as confirmed employment duration.
  ('d1e00000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',
   'Egenrapporterad AB (fiktiv)','Väktare','SE', DATE '2018-01-01', DATE '2020-01-01',
   'self_declared','active', now() - interval '30 days');

INSERT INTO public.sp_verification_requests
  (id, holder_user_id, claim_id, period_id, request_kind, target_employer_id,
   status, verification_method, decided_at, decided_by)
VALUES
  ('d1f00000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
   'd1c00000-0000-4000-8000-000000000001', NULL,'cqrityjob_review', NULL,
   'approved','document_review', now(),'d1000000-0000-4000-8000-000000000003'),
  ('d1f00000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
   NULL,'d1e00000-0000-4000-8000-000000000001','employer_attestation',
   'd1b00000-0000-4000-8000-0000000000e1',
   'approved','employer_confirmation', now(),'d1000000-0000-4000-8000-000000000003'),
  ('d1f00000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',
   NULL,'d1e00000-0000-4000-8000-000000000002','cqrityjob_review', NULL,
   'approved','document_review', now(),'d1000000-0000-4000-8000-000000000003'),
  ('d1f00000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',
   'd1c00000-0000-4000-8000-000000000002', NULL,'cqrityjob_review', NULL,
   'approved','issuer_confirmation', now(),'d1000000-0000-4000-8000-000000000003');

INSERT INTO public.sp_verification_decisions
  (request_id, holder_user_id, decided_by, decider_organisation, decision,
   verification_method)
VALUES
  ('d1f00000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000003','CQrityjob','approved','document_review'),
  ('d1f00000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000003','Nordvakt AB (fiktiv)','approved',
   'employer_confirmation'),
  ('d1f00000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000003','CQrityjob','approved','document_review'),
  ('d1f00000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000003','Länsstyrelsen (fiktiv)','approved',
   'issuer_confirmation');


-- =========================================================================
-- GROUP 1 — the selection is the scope
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _token text; _res jsonb; _payload jsonb; _d uuid; _keys text[];
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  _res := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000002',
          'd1c00000-0000-4000-8000-000000000004']::uuid[],
    ARRAY['d1e00000-0000-4000-8000-000000000001',
          'd1e00000-0000-4000-8000-000000000003']::uuid[],
    30, NULL, NULL, 'sv', 'd1a00000-0000-4000-8000-000000000001');
  RESET ROLE;

  PERFORM pg_temp.ok(_res ->> 'status' = 'created', '1.0 a link is minted');
  _token := _res ->> 'token';
  _d     := (_res ->> 'disclosure_id')::uuid;

  PERFORM pg_temp.ok(_token ~ '^[0-9a-f]{64}$',
    '1.1 the token is 32 random bytes as hex, and it is returned exactly once');

  PERFORM pg_temp.ok(
    (SELECT token_hash FROM public.sp_disclosures WHERE id = _d)
      = encode(digest(_token, 'sha256'), 'hex'),
    '1.2 only the SHA-256 of the token is stored');

  _payload := public.sp_get_disclosure(_token);
  PERFORM pg_temp.ok(_payload ->> 'status' = 'active', '1.3 the link resolves');

  SELECT array_agg(x ->> 'title' ORDER BY x ->> 'title')
    INTO _keys FROM jsonb_array_elements(_payload -> 'verified_claims') x;
  PERFORM pg_temp.ok(_keys = ARRAY['Egen anteckning (fiktiv)',
                                   'Skyddsvaktsförordnande',
                                   'Väktarutbildning 1 (VU1)'],
    '1.4 the payload carries EXACTLY the three selected credentials');

  -- The pairing that makes 1.4 mean something: C3 is active, verified and of
  -- the same holder. It is absent only because it was not chosen.
  PERFORM pg_temp.ok(
    (SELECT assertion_level = 'verified' AND lifecycle_state = 'active'
       FROM public.sp_claims WHERE id = 'd1c00000-0000-4000-8000-000000000003'),
    '1.5 POSITIVE CONTROL the unselected credential is shareable in every other way');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Hjärt- och lungräddning%',
    '1.6 MUTATION it appears nowhere in the payload');

  SELECT array_agg(x ->> 'employer' ORDER BY x ->> 'employer')
    INTO _keys FROM jsonb_array_elements(_payload -> 'verified_experience') x;
  PERFORM pg_temp.ok(_keys = ARRAY['Egenrapporterad AB (fiktiv)','Nordvakt AB (fiktiv)'],
    '1.7 the payload carries EXACTLY the two selected employments');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Sydvakt%',
    '1.8 MUTATION the unselected employment appears nowhere');

  -- CONFIRMED employment duration: the selected periods, and among those only
  -- the ones somebody actually confirmed.
  PERFORM pg_temp.ok(
    (_payload ->> 'verified_experience_days')::int
      = (DATE '2023-01-01' - DATE '2021-01-01'),
    '1.9 the duration counts the selected CONFIRMED employment only');
  PERFORM pg_temp.ok(
    (_payload ->> 'verified_experience_days')::int
      < (DATE '2023-01-01' - DATE '2021-01-01') + (DATE '2020-01-01' - DATE '2018-01-01'),
    '1.10 MUTATION the self-declared employment is shown but never counted');

  -- FRESHNESS DESCRIBES THE FACTS, NOT THE ACT OF SHARING.
  PERFORM pg_temp.ok(
    (_payload ->> 'last_updated')::timestamptz
      = (SELECT updated_at FROM public.sp_claims
          WHERE id = 'd1c00000-0000-4000-8000-000000000004'),
    '1.11 last_updated is the latest change among the SHARED rows');
  PERFORM pg_temp.ok(
    (_payload ->> 'last_updated')::timestamptz
      < (SELECT created_at FROM public.sp_disclosures WHERE id = _d),
    '1.12 MUTATION it is NOT the moment the link was created');

  -- The check time is the server's, not a visitor's clock.
  PERFORM pg_temp.ok(_payload ? 'checked_at',
    '1.13 the anonymous read stamps its own check time');

  PERFORM set_config('sp_test.token', _token, false);
  PERFORM set_config('sp_test.disclosure', _d::text, false);
END $$;


-- =========================================================================
-- GROUP 2 — a merit recorded later never joins an existing share
-- =========================================================================
DO $$
DECLARE _payload jsonb;
BEGIN
  INSERT INTO public.sp_claims
    (id, holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, issued_on, valid_until, assertion_level,
     lifecycle_state, verified_by_user_id, verified_at)
  VALUES ('d1c00000-0000-4000-8000-000000000008','d1000000-0000-4000-8000-000000000001',
    'certification','Ny merit efter delning (fiktiv)',NULL,'SE','Utbildaren AB (fiktiv)',
    current_date, current_date + 365,'verified','active',
    'd1000000-0000-4000-8000-000000000003', now());

  _payload := public.sp_get_disclosure(current_setting('sp_test.token'));

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = 'd1000000-0000-4000-8000-000000000001'
        AND lifecycle_state = 'active') >= 6,
    '2.0 POSITIVE CONTROL the holder now has six current credentials');

  PERFORM pg_temp.ok(jsonb_array_length(_payload -> 'verified_claims') = 3,
    '2.1 the existing share still carries three');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Ny merit efter delning%',
    '2.2 a merit recorded after the share was created is NOT in it');
END $$;


-- =========================================================================
-- GROUP 3 — a merit that stops being current LEAVES the share
-- =========================================================================
DO $$
DECLARE _payload jsonb;
BEGIN
  -- `sp.verification_context` is the flag the verification workflow's own
  -- functions set before they move a lifecycle; the trigger refuses the
  -- transition without it. Set here for the same reason and in the same way,
  -- so the row this suite revokes is the row a real revocation produces.
  PERFORM set_config('sp.verification_context', 'on', true);
  UPDATE public.sp_claims SET lifecycle_state = 'revoked'
   WHERE id = 'd1c00000-0000-4000-8000-000000000002';

  _payload := public.sp_get_disclosure(current_setting('sp_test.token'));
  PERFORM pg_temp.ok(jsonb_array_length(_payload -> 'verified_claims') = 2,
    '3.1 a revoked credential drops out of an existing share');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Skyddsvaktsförordnande%',
    '3.2 it is not still presented as current');

  -- Restored: the rest of the suite needs it back.
  PERFORM set_config('sp.verification_context', 'on', true);
  UPDATE public.sp_claims SET lifecycle_state = 'active'
   WHERE id = 'd1c00000-0000-4000-8000-000000000002';
  PERFORM set_config('sp.verification_context', 'off', true);
  PERFORM pg_temp.ok(
    jsonb_array_length(public.sp_get_disclosure(current_setting('sp_test.token'))
                       -> 'verified_claims') = 3,
    '3.3 and it returns when the credential is current again — the item row survived');
END $$;


-- =========================================================================
-- GROUP 4 — the preview IS the recipient view
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _live jsonb; _preview jsonb; _strip text[] := ARRAY['expires_at','authorised_at','checked_at'];
BEGIN
  _live := public.sp_get_disclosure(current_setting('sp_test.token'));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _preview := public.sp_preview_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000002',
          'd1c00000-0000-4000-8000-000000000004']::uuid[],
    ARRAY['d1e00000-0000-4000-8000-000000000001',
          'd1e00000-0000-4000-8000-000000000003']::uuid[],
    30, NULL, 'sv');
  RESET ROLE;

  -- The clock fields are the only difference there may be: the live share was
  -- authorised earlier than this preview was asked for, and only the
  -- anonymous read stamps a check time.
  PERFORM pg_temp.ok(
    (_live - _strip) = (_preview - _strip),
    '4.1 the preview and the live link are the same projection, field for field');

  PERFORM pg_temp.ok(_preview ->> 'package' = 'selected_merits',
    '4.2 the preview names the same contract');

  PERFORM pg_temp.ok(
    (SELECT access_count FROM public.sp_disclosures
      WHERE id = current_setting('sp_test.disclosure')::uuid) > 0,
    '4.3 POSITIVE CONTROL opening the live link is counted');
END $$;

DO $$
DECLARE _before int; _after int; _h uuid := 'd1000000-0000-4000-8000-000000000001';
BEGIN
  SELECT count(*) INTO _before FROM public.sp_disclosures;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_preview_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL, 30, NULL, 'sv');
  RESET ROLE;
  SELECT count(*) INTO _after FROM public.sp_disclosures;
  PERFORM pg_temp.ok(_before = _after,
    '4.4 previewing creates no share and mints no token');
END $$;


-- =========================================================================
-- GROUP 5 — the sharing policy: lifecycle gates, assertion level does not
-- =========================================================================
DO $$
DECLARE _h uuid := 'd1000000-0000-4000-8000-000000000001'; _res jsonb; _payload jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- THE REVERSAL. A self-declared merit and an unassessed document are both
  -- shareable, and both travel with the standing they actually have.
  _res := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000004',
          'd1c00000-0000-4000-8000-000000000005']::uuid[],
    NULL, 7, NULL, NULL, 'sv', 'd1a00000-0000-4000-8000-000000000005');
  RESET ROLE;
  PERFORM pg_temp.ok(_res ->> 'status' = 'created',
    '5.1 a share of nothing but self-declared merits is allowed');

  _payload := public.sp_get_disclosure(_res ->> 'token');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_payload -> 'verified_claims') x
      WHERE x ->> 'assertion' = 'self_declared') = 1
    AND (SELECT count(*) FROM jsonb_array_elements(_payload -> 'verified_claims') x
          WHERE x ->> 'assertion' = 'document_provided') = 1,
    '5.2 and each one carries its OWN stored standing, not a promoted one');
  PERFORM pg_temp.ok(
    (SELECT bool_and(x ->> 'verification_method' IS NULL)
       FROM jsonb_array_elements(_payload -> 'verified_claims') x),
    '5.3 with no verification method invented for either');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000007'']::uuid[], NULL, 30, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_MERIT_NOT_SHAREABLE',
    '5.4 an unfinished draft can never be shared');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000006'']::uuid[], NULL, 30, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_MERIT_NOT_SHAREABLE',
    '5.5 an archived merit can never be shared, however well verified it once was');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-0000000000ff'']::uuid[], NULL, 30, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_MERIT_NOT_SHAREABLE',
    '5.6 another holder''s credential cannot be put in my share');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[gen_random_uuid()]::uuid[], NULL, 30, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_MERIT_NOT_SHAREABLE',
    '5.7 an id that names nothing is refused with the SAME sentence — no oracle');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(NULL, NULL, 30, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_NOTHING_SELECTED',
    '5.8 a share of nothing is refused rather than minted');

  -- The PREVIEW enforces the same policy, or the screen would offer a page
  -- the create refuses.
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_preview_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000007'']::uuid[], NULL, 30, NULL, ''sv'')',
    'SP_MERIT_NOT_SHAREABLE',
    '5.9 the PREVIEW refuses a draft too');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_preview_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-0000000000ff'']::uuid[], NULL, 30, NULL, ''sv'')',
    'SP_MERIT_NOT_SHAREABLE',
    '5.10 and another holder''s credential');

  RESET ROLE;
END $$;

-- The other holder cannot manage this share.
DO $$
DECLARE _o uuid := 'd1000000-0000-4000-8000-000000000002'; _d uuid;
        _n int; _revoked timestamptz;
BEGIN
  _d := current_setting('sp_test.disclosure')::uuid;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);

  SELECT count(*) INTO _n FROM public.sp_disclosures WHERE id = _d;
  PERFORM pg_temp.ok(_n = 0, '5.11 another holder cannot READ the share row');

  SELECT count(*) INTO _n FROM public.sp_disclosure_items WHERE disclosure_id = _d;
  PERFORM pg_temp.ok(_n = 0, '5.12 nor its selection');

  BEGIN PERFORM public.sp_revoke_disclosure(_d); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_replace_selected_disclosure(%L, true, gen_random_uuid())', _d),
    'SP_SHARE_NOT_REPLACEABLE',
    '5.13 nor reissue it under a new token');
  RESET ROLE;

  SELECT revoked_at INTO _revoked FROM public.sp_disclosures WHERE id = _d;
  PERFORM pg_temp.ok(_revoked IS NULL,
    '5.14 and a revoke attempt by another holder leaves the share active');
END $$;


-- =========================================================================
-- GROUP 6 — the selection is not writable from the Data API
-- =========================================================================
DO $$
DECLARE _h uuid := 'd1000000-0000-4000-8000-000000000001'; _n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  SELECT count(*) INTO _n FROM public.sp_disclosure_items
   WHERE disclosure_id = current_setting('sp_test.disclosure')::uuid;
  PERFORM pg_temp.ok(_n = 5,
    '6.0 POSITIVE CONTROL the holder can read their own five selected merits');

  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_disclosure_items (disclosure_id, claim_id) '
           || 'VALUES (%L, ''d1c00000-0000-4000-8000-000000000003'')',
           current_setting('sp_test.disclosure')),
    '', '6.1 a holder cannot widen their own share by inserting an item');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.sp_disclosure_items WHERE disclosure_id = %L',
           current_setting('sp_test.disclosure')),
    '', '6.2 nor delete one');

  RESET ROLE;

  PERFORM pg_temp.ok(
    NOT has_table_privilege('anon','public.sp_disclosure_items','SELECT')
    AND NOT has_table_privilege('anon','public.sp_disclosure_items','TRUNCATE'),
    '6.3 anon holds no privilege on the selection at all — TRUNCATE included');
END $$;


-- =========================================================================
-- GROUP 7 — expiry, revocation and a guessed token are one answer
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _res jsonb; _tok text; _d uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _res := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL, 7, NULL, NULL, 'en',
    'd1a00000-0000-4000-8000-000000000007');
  RESET ROLE;

  _tok := _res ->> 'token';
  _d   := (_res ->> 'disclosure_id')::uuid;

  PERFORM pg_temp.ok(public.sp_get_disclosure(_tok) ->> 'status' = 'active',
    '7.0 POSITIVE CONTROL the new link resolves');

  UPDATE public.sp_disclosures SET expires_at = now() - interval '1 minute' WHERE id = _d;
  PERFORM pg_temp.ok(
    public.sp_get_disclosure(_tok) = jsonb_build_object('status','unavailable'),
    '7.1 an EXPIRED link returns the single unavailable payload');

  UPDATE public.sp_disclosures SET expires_at = now() + interval '7 days',
                                   revoked_at = now() WHERE id = _d;
  PERFORM pg_temp.ok(
    public.sp_get_disclosure(_tok) = jsonb_build_object('status','unavailable'),
    '7.2 a REVOKED link returns exactly the same payload, byte for byte');

  PERFORM pg_temp.ok(
    public.sp_get_disclosure(encode(gen_random_bytes(32),'hex'))
      = jsonb_build_object('status','unavailable'),
    '7.3 and so does a token that never existed — no account, no id, no hint');

  PERFORM pg_temp.ok(
    public.sp_get_disclosure('') = jsonb_build_object('status','unavailable'),
    '7.4 and so does an empty token');

  PERFORM set_config('sp_test.revoked_share', _d::text, false);
END $$;


-- =========================================================================
-- GROUP 8 — the input contract, asserted against direct RPC calls
--
-- A Zod schema in the browser is a convenience for the person filling in the
-- form. Every call below goes straight to the function as an authenticated
-- principal, which is what any holder with a session and a HTTP client can do.
-- =========================================================================
DO $$
DECLARE _h uuid := 'd1000000-0000-4000-8000-000000000001';
        _ok text := 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, ';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- ── the request key ────────────────────────────────────────────────
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '30, NULL, NULL, ''sv'', NULL)',
    'SP_REQUEST_KEY_REQUIRED',
    '8.1 a create with no request key is refused');
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_replace_selected_disclosure(%L, true, NULL)',
           current_setting('sp_test.disclosure')),
    'SP_REQUEST_KEY_REQUIRED',
    '8.2 and so is a reissue');

  -- ── the expiry ─────────────────────────────────────────────────────
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || 'NULL, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_UNSUPPORTED_EXPIRY', '8.3 a NULL expiry is refused — there is no default');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '0, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_UNSUPPORTED_EXPIRY', '8.4 a zero expiry is refused');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '-30, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_UNSUPPORTED_EXPIRY', '8.5 a negative expiry is refused');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '45, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_UNSUPPORTED_EXPIRY', '8.6 an arbitrary expiry is refused');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '3650, NULL, NULL, ''sv'', gen_random_uuid())',
    'SP_UNSUPPORTED_EXPIRY', '8.7 a ten-year expiry is refused — there is no permanent link');

  -- ── the locale ─────────────────────────────────────────────────────
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '30, NULL, NULL, NULL, gen_random_uuid())',
    'SP_UNSUPPORTED_LOCALE', '8.8 a NULL locale is refused');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '30, NULL, NULL, ''de'', gen_random_uuid())',
    'SP_UNSUPPORTED_LOCALE', '8.9 an unsupported locale is refused');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(' || _ok || '30, NULL, NULL, '''', gen_random_uuid())',
    'SP_UNSUPPORTED_LOCALE', '8.10 and so is an empty one');

  -- ── the preview enforces the identical contract ────────────────────
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_preview_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, 45, NULL, ''sv'')',
    'SP_UNSUPPORTED_EXPIRY', '8.11 the preview refuses the same expiry the create does');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_preview_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, 30, NULL, ''de'')',
    'SP_UNSUPPORTED_LOCALE', '8.12 and the same locale');

  RESET ROLE;

  -- POSITIVE CONTROL: the three accepted lifetimes really are accepted, so
  -- the refusals above are a contract and not a broken function.
  PERFORM pg_temp.ok(true, '8.13 (positive control follows)');
END $$;

DO $$
DECLARE _h uuid := 'd1000000-0000-4000-8000-000000000001'; _days int; _res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  FOREACH _days IN ARRAY ARRAY[7, 30, 90] LOOP
    _res := public.sp_create_selected_disclosure(
      ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL,
      _days, NULL, NULL, 'sv', gen_random_uuid());
    IF _res ->> 'status' <> 'created' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 8.14 the % day lifetime was refused', _days;
    END IF;
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'ok  8.14 POSITIVE CONTROL 7, 30 and 90 days are all accepted';
END $$;


-- =========================================================================
-- GROUP 9 — idempotency: replay, conflict, and no constraint leakage
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _key uuid := 'd1a00000-0000-4000-8000-00000000000a';
  _first jsonb; _second jsonb; _reordered jsonb; _n int; _msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  _first := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000003']::uuid[],
    NULL, 30, NULL, NULL, 'sv', _key);
  _second := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000003']::uuid[],
    NULL, 30, NULL, NULL, 'sv', _key);

  -- The same intention, expressed with the ids the other way round and a
  -- duplicate thrown in. Normalisation is what makes this a replay.
  _reordered := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000003',
          'd1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000003']::uuid[],
    NULL, 30, NULL, NULL, 'sv', _key);
  RESET ROLE;

  PERFORM pg_temp.ok(_first ->> 'status' = 'created', '9.1 the first call mints a link');
  PERFORM pg_temp.ok(_second ->> 'status' = 'already_created',
    '9.2 the retry says so rather than minting a second');
  PERFORM pg_temp.ok(_second ->> 'token' IS NULL,
    '9.3 and it does NOT hand back the token — only the hash was ever stored');
  PERFORM pg_temp.ok(_second ->> 'disclosure_id' = (_first ->> 'disclosure_id'),
    '9.4 it names the share that already exists');
  PERFORM pg_temp.ok(_reordered ->> 'status' = 'already_created'
                 AND _reordered ->> 'disclosure_id' = (_first ->> 'disclosure_id'),
    '9.5 a reordered, duplicated selection is the SAME intention and replays');

  SELECT count(*) INTO _n FROM public.sp_disclosures
   WHERE holder_user_id = _h AND request_key = _key;
  PERFORM pg_temp.ok(_n = 1, '9.6 exactly one row exists for the request');

  PERFORM pg_temp.ok(
    (SELECT request_fingerprint IS NOT NULL FROM public.sp_disclosures
      WHERE holder_user_id = _h AND request_key = _key),
    '9.7 and it stored the fingerprint the replay was compared against');
END $$;

DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _key uuid := 'd1a00000-0000-4000-8000-00000000000b';
  _n_before int; _n_after int; _msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL, 30, NULL, NULL, 'sv', _key);
  SELECT count(*) INTO _n_before FROM public.sp_disclosures WHERE holder_user_id = _h;

  -- Every fact that changes the resulting disclosure is a conflict. One at a
  -- time, so a fingerprint that quietly stopped covering a field is caught.
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000003'']::uuid[], NULL, 30, NULL, NULL, ''sv'', '
    || quote_literal(_key) || '::uuid)',
    'SP_REQUEST_KEY_CONFLICT', '9.8 a changed SCOPE under the same key conflicts');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], '
    || 'ARRAY[''d1e00000-0000-4000-8000-000000000001'']::uuid[], 30, NULL, NULL, ''sv'', '
    || quote_literal(_key) || '::uuid)',
    'SP_REQUEST_KEY_CONFLICT', '9.9 an added employment conflicts');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, 90, NULL, NULL, ''sv'', '
    || quote_literal(_key) || '::uuid)',
    'SP_REQUEST_KEY_CONFLICT', '9.10 a changed EXPIRY conflicts');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, 30, NULL, NULL, ''en'', '
    || quote_literal(_key) || '::uuid)',
    'SP_REQUEST_KEY_CONFLICT', '9.11 a changed LOCALE conflicts');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, 30, ''ny ansökan'', NULL, ''sv'', '
    || quote_literal(_key) || '::uuid)',
    'SP_REQUEST_KEY_CONFLICT', '9.12 a changed PURPOSE conflicts');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, 30, NULL, ''Agency AB'', ''sv'', '
    || quote_literal(_key) || '::uuid)',
    'SP_REQUEST_KEY_CONFLICT', '9.13 a changed RECIPIENT HINT conflicts');
  RESET ROLE;

  SELECT count(*) INTO _n_after FROM public.sp_disclosures WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n_before = _n_after,
    '9.14 and not one of those conflicts created a row');

  -- The refusal is the product's own sentence, never the index's.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', _h::text, true);
    PERFORM public.sp_create_selected_disclosure(
      ARRAY['d1c00000-0000-4000-8000-000000000003']::uuid[], NULL, 30, NULL, NULL, 'sv', _key);
    RESET ROLE;
    RAISE EXCEPTION 'ASSERTION FAILED: 9.15 the conflicting call succeeded';
  EXCEPTION WHEN check_violation THEN
    _msg := SQLERRM;
    RESET ROLE;
    PERFORM pg_temp.ok(
      _msg NOT LIKE '%sp_disclosures_request_key_uidx%'
      AND _msg NOT LIKE '%duplicate key%'
      AND _msg NOT LIKE '%unique constraint%',
      '9.15 and it names no index, no constraint and no duplicate key');
  END;

  -- Purpose and recipient hint are free text: a delimiter-joined fingerprint
  -- would hash ('a|b','') and ('a','b') alike, and the second call would
  -- REPLAY the first instead of conflicting. Length prefixing is what stops it.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL, 30, 'a|b', '', 'sv',
    'd1a00000-0000-4000-8000-00000000000c');
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000001'']::uuid[], NULL, 30, ''a'', ''b'', ''sv'', '
    || '''d1a00000-0000-4000-8000-00000000000c''::uuid)',
    'SP_REQUEST_KEY_CONFLICT',
    '9.16 two free-text fields cannot be confused for one another');
  RESET ROLE;
END $$;


-- =========================================================================
-- GROUP 10 — what the recipient may and may not learn
-- =========================================================================
DO $$
DECLARE _payload jsonb; _c jsonb; _e jsonb;
BEGIN
  _payload := public.sp_get_disclosure(current_setting('sp_test.token'));

  SELECT x INTO _c FROM jsonb_array_elements(_payload -> 'verified_claims') x
   WHERE x ->> 'title' = 'Skyddsvaktsförordnande';

  PERFORM pg_temp.ok((_c ->> 'scope_limited')::boolean IS TRUE,
    '10.1 the recipient is told the approval HAS limits');
  PERFORM pg_temp.ok(_c ->> 'authorisation_scope' IS NULL,
    '10.2 but not what they are — a chosen-scope share is not an employer package');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Kaj 12%',
    '10.3 and the protected object appears nowhere in the whole payload');

  -- An issuer confirmation is carried TRUTHFULLY as what was recorded. The
  -- product refuses to dress it as a source confirmation in the presentation
  -- layer (PR #189); the database does not rewrite the record to achieve that.
  PERFORM pg_temp.ok(_c ->> 'verification_method' = 'issuer_confirmation'
                 AND _c ->> 'verifier_organisation' = 'Länsstyrelsen (fiktiv)',
    '10.4 a recorded issuer confirmation travels as exactly what it is');

  SELECT x INTO _c FROM jsonb_array_elements(_payload -> 'verified_claims') x
   WHERE x ->> 'title' = 'Väktarutbildning 1 (VU1)';
  PERFORM pg_temp.ok(_c ->> 'verification_method' = 'document_review'
                 AND _c ->> 'verifier_organisation' = 'CQrityjob',
    '10.5 a CQrityjob document review is carried AS a document review');

  SELECT x INTO _e FROM jsonb_array_elements(_payload -> 'verified_experience') x
   WHERE x ->> 'employer' = 'Nordvakt AB (fiktiv)';
  PERFORM pg_temp.ok(_e ->> 'verification_method' = 'employer_confirmation'
                 AND _e ->> 'verifier_organisation' = 'Nordvakt AB (fiktiv)',
    '10.6 an employment carries WHICH act confirmed it, so a reader can tell '
    'employment confirmation from credential verification');

  SELECT x INTO _e FROM jsonb_array_elements(_payload -> 'verified_experience') x
   WHERE x ->> 'employer' = 'Egenrapporterad AB (fiktiv)';
  PERFORM pg_temp.ok(_e ->> 'assertion' = 'self_declared'
                 AND _e ->> 'verification_method' IS NULL,
    '10.7 and a self-declared employment confirms nothing and names nobody');

  PERFORM pg_temp.ok(_payload ->> 'locale' = 'sv',
    '10.8 the holder''s language choice reaches the recipient page');
  PERFORM pg_temp.ok(_payload ->> 'focus' = 'passport',
    '10.9 a selected share is a Passport, not the single-credential page');

  -- The private half, asserted against the KEYS rather than a substring: a
  -- field the payload never carries cannot leak however the page is written.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_temp.payload_row_keys(_payload) k
                 WHERE k IN ('holder_note','decision_note','evidence','email',
                             'personnummer','national_id','reviewer','reference')),
    '10.10 no private field is present on any disclosed row');
END $$;


-- =========================================================================
-- GROUP 11 — no database identifier crosses the anonymous boundary
-- =========================================================================
DO $$
DECLARE _payload jsonb; _keys text[]; _d uuid;
BEGIN
  _payload := public.sp_get_disclosure(current_setting('sp_test.token'));

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_temp.payload_row_keys(_payload) k WHERE k = 'id'),
    '11.1 no disclosed row carries an `id` field at all');

  -- Stronger than the key check: not one of the real uuids appears ANYWHERE in
  -- the serialised payload, under any name.
  PERFORM pg_temp.ok(
    _payload::text NOT LIKE '%d1c00000-0000-4000-8000-%'
    AND _payload::text NOT LIKE '%d1e00000-0000-4000-8000-%'
    AND _payload::text NOT LIKE '%d1000000-0000-4000-8000-%',
    '11.2 and no claim, employment or holder uuid appears anywhere in it');

  SELECT array_agg(x ->> 'key' ORDER BY x ->> 'key')
    INTO _keys FROM jsonb_array_elements(_payload -> 'verified_claims') x;
  PERFORM pg_temp.ok(_keys = ARRAY['c1','c2','c3'],
    '11.3 each credential carries an ordinal presentation key instead');

  SELECT array_agg(x ->> 'key' ORDER BY x ->> 'key')
    INTO _keys FROM jsonb_array_elements(_payload -> 'verified_experience') x;
  PERFORM pg_temp.ok(_keys = ARRAY['e1','e2'],
    '11.4 and so does each employment');

  -- The five older packages reach the same anonymous page, so the boundary
  -- has to hold for them too — and their builder still emits `id`.
  INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash, expires_at)
  VALUES ('d1000000-0000-4000-8000-000000000001','public_card',
          encode(digest('sel-package-token','sha256'),'hex'), now() + interval '7 days')
  RETURNING id INTO _d;

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM jsonb_array_elements(public.sp_disclosure_payload(_d)
                                               -> 'verified_claims') x
             WHERE x ? 'id'),
    '11.5 POSITIVE CONTROL the package builder does still produce `id`');

  _payload := public.sp_get_disclosure('sel-package-token');
  PERFORM pg_temp.ok(_payload ->> 'status' = 'active',
    '11.6 and the package share resolves through the same anonymous read');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_temp.payload_row_keys(_payload) k WHERE k = 'id')
    AND _payload::text NOT LIKE '%d1c00000-0000-4000-8000-%',
    '11.7 MUTATION the anonymous boundary strips it there as well');
END $$;


-- =========================================================================
-- GROUP 12 — a new link over the same contents
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _source uuid; _res jsonb; _again jsonb; _new uuid;
  _src_items int; _new_items int;
BEGIN
  _source := current_setting('sp_test.disclosure')::uuid;
  SELECT count(*) INTO _src_items FROM public.sp_disclosure_items
   WHERE disclosure_id = _source;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- KEEP the previous link: the holder wants a second copy to send elsewhere.
  _res := public.sp_replace_selected_disclosure(
    _source, false, 'd1a00000-0000-4000-8000-000000000012');
  -- The same attempt again: a lost response must not mint a third link.
  _again := public.sp_replace_selected_disclosure(
    _source, false, 'd1a00000-0000-4000-8000-000000000012');
  RESET ROLE;

  PERFORM pg_temp.ok(_res ->> 'status' = 'created', '12.1 a fresh link is minted');
  PERFORM pg_temp.ok((_res ->> 'token') ~ '^[0-9a-f]{64}$'
                 AND (_res ->> 'token') <> current_setting('sp_test.token'),
    '12.2 with a NEW token — the old one is not recovered, it is replaced');
  PERFORM pg_temp.ok((_res ->> 'previous_revoked')::boolean IS FALSE,
    '12.3 and the holder''s choice to keep the old link was honoured');
  PERFORM pg_temp.ok(
    (SELECT revoked_at IS NULL FROM public.sp_disclosures WHERE id = _source),
    '12.4 which the source row confirms');

  _new := (_res ->> 'disclosure_id')::uuid;
  SELECT count(*) INTO _new_items FROM public.sp_disclosure_items
   WHERE disclosure_id = _new;
  PERFORM pg_temp.ok(_new_items = _src_items,
    '12.5 the new link carries the same number of merits');
  PERFORM pg_temp.ok(
    (SELECT (public.sp_get_disclosure(_res ->> 'token') - 'expires_at' - 'authorised_at' - 'checked_at')
       = (public.sp_get_disclosure(current_setting('sp_test.token'))
            - 'expires_at' - 'authorised_at' - 'checked_at')),
    '12.6 and renders the identical projection');

  PERFORM pg_temp.ok(_again ->> 'status' = 'already_created'
                 AND _again ->> 'disclosure_id' = (_res ->> 'disclosure_id'),
    '12.7 a retried reissue replays instead of minting a third link');
  PERFORM pg_temp.ok(_again ->> 'token' IS NULL,
    '12.8 and still hands back no token');

  -- REVOKE the previous link: the other legitimate answer.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _res := public.sp_replace_selected_disclosure(
    _new, true, 'd1a00000-0000-4000-8000-000000000013');
  RESET ROLE;

  PERFORM pg_temp.ok((_res ->> 'previous_revoked')::boolean IS TRUE
                 AND (SELECT revoked_at IS NOT NULL FROM public.sp_disclosures WHERE id = _new),
    '12.9 revoking the previous link is the other choice, and it takes effect');
  PERFORM pg_temp.ok(
    public.sp_get_disclosure(_res ->> 'token') ->> 'status' = 'active',
    '12.10 while the new link is live');

  -- A revoked source cannot be reissued, so a revoked link cannot be brought
  -- back through this door.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_replace_selected_disclosure(%L, false, gen_random_uuid())', _new),
    'SP_SHARE_NOT_REPLACEABLE',
    '12.11 a revoked share cannot be reissued');
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_replace_selected_disclosure(%L, false, gen_random_uuid())',
           current_setting('sp_test.revoked_share')),
    'SP_SHARE_NOT_REPLACEABLE',
    '12.12 and neither can an expired or revoked one from earlier');
  RESET ROLE;
END $$;

-- "The same contents" must mean it. A share whose selection has partly lapsed
-- is refused rather than quietly reissued smaller.
DO $$
DECLARE _h uuid := 'd1000000-0000-4000-8000-000000000001'; _res jsonb; _src uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _res := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000003']::uuid[],
    NULL, 30, NULL, NULL, 'sv', 'd1a00000-0000-4000-8000-000000000014');
  RESET ROLE;
  _src := (_res ->> 'disclosure_id')::uuid;

  PERFORM set_config('sp.verification_context', 'on', true);
  UPDATE public.sp_claims SET lifecycle_state = 'superseded'
   WHERE id = 'd1c00000-0000-4000-8000-000000000003';
  PERFORM set_config('sp.verification_context', 'off', true);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_replace_selected_disclosure(%L, false, gen_random_uuid())', _src),
    'SP_MERIT_NOT_SHAREABLE',
    '12.13 a share with a lapsed merit is refused, not reissued smaller');
  RESET ROLE;

  PERFORM set_config('sp.verification_context', 'on', true);
  UPDATE public.sp_claims SET lifecycle_state = 'active'
   WHERE id = 'd1c00000-0000-4000-8000-000000000003';
  PERFORM set_config('sp.verification_context', 'off', true);
END $$;


-- =========================================================================
-- GROUP 13 — nothing about the existing packages moved
-- =========================================================================
DO $$
DECLARE _d uuid; _payload jsonb;
BEGIN
  INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash)
  VALUES ('d1000000-0000-4000-8000-000000000001','public_card',
          encode(gen_random_bytes(32),'hex'))
  RETURNING id INTO _d;

  _payload := public.sp_disclosure_payload(_d);
  PERFORM pg_temp.ok(_payload ->> 'package' = 'public_card',
    '13.1 a public card is still a public card');
  PERFORM pg_temp.ok(
    (SELECT bool_and(x ->> 'assertion' = 'verified')
       FROM jsonb_array_elements(_payload -> 'verified_claims') x),
    '13.2 and still carries VERIFIED credentials only — the policy change is '
    'scoped to chosen-merit shares');
  PERFORM pg_temp.ok(jsonb_array_length(_payload -> 'verified_experience') = 0,
    '13.3 and still carries no employment');
  PERFORM pg_temp.ok((_payload -> 'verified_claims' -> 0) ->> 'authorisation_scope' IS NULL,
    '13.4 and still withholds the exact scope');
  PERFORM pg_temp.ok((_payload -> 'verified_claims' -> 0) ? 'id',
    '13.5 and its builder is unchanged, right down to the id the anonymous '
    'boundary strips');
END $$;

\echo '==> Security Passport selected-merit sharing: all assertions passed'
