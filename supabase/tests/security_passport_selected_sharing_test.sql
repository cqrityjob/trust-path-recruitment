-- =============================================================================
-- Security Passport — the holder chooses what a share carries.
--
-- Everything asserted here is a property of the DATABASE, not of the page:
-- the scope has to hold against a crafted call, not merely against a browser
-- that renders fewer rows than it received.
--
--   * only the selected merits reach the payload, and every unselected one is
--     paired with a positive control proving it COULD have been carried;
--   * a merit recorded after the share was created never joins it;
--   * a merit that stops being current LEAVES it;
--   * the holder's preview and the live link are the same jsonb;
--   * only the holder's own current, verified merits can be selected, and
--     every bad id is refused with one indistinguishable message;
--   * expired, revoked and never-existed links are one unavailable payload;
--   * a retried create returns the existing share instead of a second link;
--   * the tenure total is scoped to the selected employments;
--   * the protected object a credential authorises is withheld, while the
--     fact that limits exist is told;
--   * an employment carries WHICH act verified it, so employer confirmation
--     is never read as credential verification;
--   * the selection is not writable from the Data API.
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

\echo '==> Security Passport selected-merit sharing'

-- ---------------------------------------------------------------------------
-- Fixtures. Invented people, invented companies.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('d1000000-0000-4000-8000-000000000001','sel-holder@example.test'),
  ('d1000000-0000-4000-8000-000000000002','sel-other@example.test'),
  ('d1000000-0000-4000-8000-000000000003','sel-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('d1000000-0000-4000-8000-000000000001','Selma Delare (fiktiv)','SE'),
       ('d1000000-0000-4000-8000-000000000002','Otto Annan (fiktiv)','SE')
ON CONFLICT (holder_user_id) DO NOTHING;

-- C1 selected, C2 selected, C3 NOT selected (but equally shareable), C4 is
-- self-declared, C5 is archived, C6 is added after the share exists.
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, credential_code, jurisdiction_code,
   claimed_issuer_name, issued_on, valid_until, authorisation_scope,
   assertion_level, lifecycle_state, verified_by_user_id, verified_at)
VALUES
  -- VU1 is a TRAINING credential in the catalogue, and the claim-type rule
  -- refuses any other pairing. Fixtures obey the same trigger real rows do.
  ('d1c00000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
   'training','Väktarutbildning 1 (VU1)','VU1','SE','Utbildaren AB (fiktiv)',
   DATE '2024-03-01', NULL, NULL,'verified','active',
   'd1000000-0000-4000-8000-000000000003', now()),
  ('d1c00000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
   'licence','Skyddsvaktsförordnande','SV','SE','Länsstyrelsen (fiktiv)',
   DATE '2023-06-01', current_date + 200,'Skyddsobjekt: Kaj 12 (fiktivt)',
   'verified','active','d1000000-0000-4000-8000-000000000003', now()),
  ('d1c00000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',
   'certification','Hjärt- och lungräddning (fiktiv)',NULL,'SE','Utbildaren AB (fiktiv)',
   DATE '2025-01-10', current_date + 500, NULL,'verified','active',
   'd1000000-0000-4000-8000-000000000003', now()),
  ('d1c00000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',
   'training','Egen anteckning (fiktiv)',NULL,'SE','Ingen',
   DATE '2025-02-01', NULL, NULL,'self_declared','active', NULL, NULL),
  ('d1c00000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001',
   'training','Security Guard Training 1 (VU1)','VU1','SE','Utbildaren AB (fiktiv)',
   DATE '2019-01-01', NULL, NULL,'verified','superseded',
   'd1000000-0000-4000-8000-000000000003', now()),
  -- Another holder's credential, for the ownership boundary.
  ('d1c00000-0000-4000-8000-0000000000ff','d1000000-0000-4000-8000-000000000002',
   'training','Väktarutbildning 1 (VU1)','VU1','SE','Utbildaren AB (fiktiv)',
   DATE '2024-01-01', NULL, NULL,'verified','active',
   'd1000000-0000-4000-8000-000000000003', now());

-- P1 selected (employer-confirmed), P2 NOT selected (equally shareable).
INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, jurisdiction_code,
   started_on, ended_on, assertion_level, lifecycle_state)
VALUES
  ('d1e00000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
   'Nordvakt AB (fiktiv)','Väktare','SE', DATE '2021-01-01', DATE '2023-01-01',
   'verified','active'),
  ('d1e00000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
   'Sydvakt AB (fiktiv)','Ordningsvakt','SE', DATE '2023-02-01', NULL,
   'verified','active');

-- The employer an attestation is addressed to. An employer_attestation
-- request must name one; the table refuses it otherwise.
INSERT INTO public.employers (id, slug, name, status)
VALUES ('d1b00000-0000-4000-8000-0000000000e1','sel-nordvakt','Nordvakt AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

-- The decision records the payload reads provenance from. Written with the
-- same shape sp_verifier_decide writes: an approved request names its decider
-- and its moment, and the decider is never the holder.
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
   'approved','document_review', now(),'d1000000-0000-4000-8000-000000000003');

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
   'd1000000-0000-4000-8000-000000000003','CQrityjob','approved','document_review');


-- =========================================================================
-- GROUP 1 — the selection is the scope
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _token text; _res jsonb; _payload jsonb; _d uuid; _ids text[];
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  _res := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000002']::uuid[],
    ARRAY['d1e00000-0000-4000-8000-000000000001']::uuid[],
    30, NULL, NULL, 'sv', NULL);
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

  SELECT array_agg(x ->> 'id' ORDER BY x ->> 'id')
    INTO _ids FROM jsonb_array_elements(_payload -> 'verified_claims') x;
  PERFORM pg_temp.ok(_ids = ARRAY['d1c00000-0000-4000-8000-000000000001',
                                  'd1c00000-0000-4000-8000-000000000002'],
    '1.4 the payload carries EXACTLY the two selected credentials');

  -- The pairing that makes 1.4 mean something: C3 is verified, active and of
  -- the same holder. It is absent only because it was not chosen.
  PERFORM pg_temp.ok(
    (SELECT assertion_level = 'verified' AND lifecycle_state = 'active'
       FROM public.sp_claims WHERE id = 'd1c00000-0000-4000-8000-000000000003'),
    '1.5 POSITIVE CONTROL the unselected credential is shareable in every other way');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Hjärt- och lungräddning%',
    '1.6 MUTATION it appears nowhere in the payload');

  SELECT array_agg(x ->> 'id') INTO _ids
    FROM jsonb_array_elements(_payload -> 'verified_experience') x;
  PERFORM pg_temp.ok(_ids = ARRAY['d1e00000-0000-4000-8000-000000000001'],
    '1.7 the payload carries EXACTLY the one selected employment');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Sydvakt%',
    '1.8 MUTATION the unselected employment appears nowhere');

  -- The tenure total is derived from the selection, not from the holder.
  PERFORM pg_temp.ok(
    (_payload ->> 'verified_experience_days')::int
      = (DATE '2023-01-01' - DATE '2021-01-01'),
    '1.9 the tenure total counts the SELECTED employment only');

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
  VALUES ('d1c00000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000001',
    'certification','Ny merit efter delning (fiktiv)',NULL,'SE','Utbildaren AB (fiktiv)',
    current_date, current_date + 365,'verified','active',
    'd1000000-0000-4000-8000-000000000003', now());

  _payload := public.sp_get_disclosure(current_setting('sp_test.token'));

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = 'd1000000-0000-4000-8000-000000000001'
        AND assertion_level = 'verified' AND lifecycle_state = 'active') >= 4,
    '2.0 POSITIVE CONTROL the holder now has four current verified credentials');

  PERFORM pg_temp.ok(jsonb_array_length(_payload -> 'verified_claims') = 2,
    '2.1 the existing share still carries two');
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
  PERFORM pg_temp.ok(jsonb_array_length(_payload -> 'verified_claims') = 1,
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
                       -> 'verified_claims') = 2,
    '3.3 and it returns when the credential is current again — the item row survived');
END $$;


-- =========================================================================
-- GROUP 4 — the preview IS the recipient view
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _live jsonb; _preview jsonb;
BEGIN
  _live := public.sp_get_disclosure(current_setting('sp_test.token'));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _preview := public.sp_preview_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001',
          'd1c00000-0000-4000-8000-000000000002']::uuid[],
    ARRAY['d1e00000-0000-4000-8000-000000000001']::uuid[],
    30, NULL, 'sv');
  RESET ROLE;

  -- The two timestamps are the only difference there may be: the live share
  -- was authorised earlier than this preview was asked for.
  PERFORM pg_temp.ok(
    (_live - 'expires_at' - 'authorised_at' - 'last_updated')
      = (_preview - 'expires_at' - 'authorised_at' - 'last_updated'),
    '4.1 the preview and the live link are the same projection, field for field');

  PERFORM pg_temp.ok(_preview ->> 'package' = 'selected_merits',
    '4.2 the preview names the same contract');

  -- And the preview is not a second, quieter way to read a share.
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
-- GROUP 5 — only the holder's own current, verified merits are selectable
-- =========================================================================
DO $$
DECLARE _h uuid := 'd1000000-0000-4000-8000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-0000000000ff'']::uuid[], NULL, 30, NULL, NULL, ''sv'', NULL)',
    'SP_MERIT_NOT_SHAREABLE',
    '5.1 another holder''s credential cannot be put in my share');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000004'']::uuid[], NULL, 30, NULL, NULL, ''sv'', NULL)',
    'SP_MERIT_NOT_SHAREABLE',
    '5.2 a self-declared credential cannot be shared');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-000000000005'']::uuid[], NULL, 30, NULL, NULL, ''sv'', NULL)',
    'SP_MERIT_NOT_SHAREABLE',
    '5.3 an archived credential cannot be shared');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure('
    || 'ARRAY[gen_random_uuid()]::uuid[], NULL, 30, NULL, NULL, ''sv'', NULL)',
    'SP_MERIT_NOT_SHAREABLE',
    '5.4 an id that names nothing is refused with the SAME sentence — no oracle');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_create_selected_disclosure(NULL, NULL, 30, NULL, NULL, ''sv'', NULL)',
    'SP_NOTHING_SELECTED',
    '5.5 a share of nothing is refused rather than minted');

  PERFORM pg_temp.must_fail(
    'SELECT public.sp_preview_selected_disclosure('
    || 'ARRAY[''d1c00000-0000-4000-8000-0000000000ff'']::uuid[], NULL, 30, NULL, ''sv'')',
    'SP_MERIT_NOT_SHAREABLE',
    '5.6 the PREVIEW refuses another holder''s credential too');

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
  PERFORM pg_temp.ok(_n = 0, '5.7 another holder cannot READ the share row');

  SELECT count(*) INTO _n FROM public.sp_disclosure_items WHERE disclosure_id = _d;
  PERFORM pg_temp.ok(_n = 0, '5.8 nor its selection');

  -- Revocation is an RPC; it must refuse, and the row must be untouched.
  BEGIN PERFORM public.sp_revoke_disclosure(_d); EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;

  SELECT revoked_at INTO _revoked FROM public.sp_disclosures WHERE id = _d;
  PERFORM pg_temp.ok(_revoked IS NULL,
    '5.9 and a revoke attempt by another holder leaves the share active');
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
  PERFORM pg_temp.ok(_n = 3,
    '6.0 POSITIVE CONTROL the holder can read their own three selected merits');

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
    ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL, 7, NULL, NULL, 'en', NULL);
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
END $$;


-- =========================================================================
-- GROUP 8 — a lost response reconciles instead of minting a second link
-- =========================================================================
DO $$
DECLARE
  _h uuid := 'd1000000-0000-4000-8000-000000000001';
  _key uuid := 'd1a00000-0000-4000-8000-00000000000a';
  _first jsonb; _second jsonb; _n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  _first := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL, 30, NULL, NULL, 'sv', _key);
  _second := public.sp_create_selected_disclosure(
    ARRAY['d1c00000-0000-4000-8000-000000000001']::uuid[], NULL, 30, NULL, NULL, 'sv', _key);
  RESET ROLE;

  PERFORM pg_temp.ok(_first ->> 'status' = 'created', '8.1 the first call mints a link');
  PERFORM pg_temp.ok(_second ->> 'status' = 'already_created',
    '8.2 the retry says so rather than minting a second');
  PERFORM pg_temp.ok(_second ->> 'token' IS NULL,
    '8.3 and it does NOT hand back the token — only the hash was ever stored');
  PERFORM pg_temp.ok(_second ->> 'disclosure_id' = (_first ->> 'disclosure_id'),
    '8.4 it names the share that already exists, so the holder can find and revoke it');

  SELECT count(*) INTO _n FROM public.sp_disclosures
   WHERE holder_user_id = _h AND request_key = _key;
  PERFORM pg_temp.ok(_n = 1, '8.5 exactly one row exists for the request');
END $$;


-- =========================================================================
-- GROUP 9 — what the recipient may and may not learn
-- =========================================================================
DO $$
DECLARE _payload jsonb; _c jsonb; _e jsonb;
BEGIN
  _payload := public.sp_get_disclosure(current_setting('sp_test.token'));

  SELECT x INTO _c FROM jsonb_array_elements(_payload -> 'verified_claims') x
   WHERE x ->> 'id' = 'd1c00000-0000-4000-8000-000000000002';

  PERFORM pg_temp.ok((_c ->> 'scope_limited')::boolean IS TRUE,
    '9.1 the recipient is told the approval HAS limits');
  PERFORM pg_temp.ok(_c ->> 'authorisation_scope' IS NULL,
    '9.2 but not what they are — a chosen-scope share is not an employer package');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Kaj 12%',
    '9.3 and the protected object appears nowhere in the whole payload');

  SELECT x INTO _c FROM jsonb_array_elements(_payload -> 'verified_claims') x
   WHERE x ->> 'id' = 'd1c00000-0000-4000-8000-000000000001';
  PERFORM pg_temp.ok(_c ->> 'verification_method' = 'document_review'
                 AND _c ->> 'verifier_organisation' = 'CQrityjob',
    '9.4 a CQrityjob document review is carried AS a document review');

  _e := _payload -> 'verified_experience' -> 0;
  PERFORM pg_temp.ok(_e ->> 'verification_method' = 'employer_confirmation'
                 AND _e ->> 'verifier_organisation' = 'Nordvakt AB (fiktiv)',
    '9.5 an employment carries WHICH act confirmed it, so a reader can tell '
    'employment confirmation from credential verification');

  PERFORM pg_temp.ok(_payload ->> 'locale' = 'sv',
    '9.6 the holder''s language choice reaches the recipient page');
  PERFORM pg_temp.ok(_payload ->> 'focus' = 'passport',
    '9.7 a selected share is a Passport, not the single-credential page');
END $$;


-- =========================================================================
-- GROUP 10 — nothing about the existing packages moved
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
    '10.1 a public card is still a public card');
  PERFORM pg_temp.ok(jsonb_array_length(_payload -> 'verified_claims') >= 3,
    '10.2 and still carries EVERY current verified credential, unscoped');
  PERFORM pg_temp.ok(jsonb_array_length(_payload -> 'verified_experience') = 0,
    '10.3 and still carries no employment');
  PERFORM pg_temp.ok((_payload -> 'verified_claims' -> 0) ->> 'authorisation_scope' IS NULL,
    '10.4 and still withholds the exact scope');
END $$;

\echo '==> Security Passport selected-merit sharing: all assertions passed'
