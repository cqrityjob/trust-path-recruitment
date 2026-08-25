-- =============================================================================
-- Security Passport — Phase 6b assertions: correction preserves the credential
--
-- Every rule is asserted by MUTATION: the suite attempts the thing the rule
-- forbids and fails if the database allows it.
--
-- The two properties that matter most:
--
--   * correcting a credential must not silently discard its code, its
--     reference or the holder's note;
--   * a correction that changes WHAT IS ASSERTED must not carry someone
--     else's verification decision onto the new version.
--
-- Verified fixtures are seeded by direct INSERT with attribution. That is
-- legitimate here: the trust-immutability trigger guards UPDATEs, the CHECK
-- constraint still demands attribution on INSERT, and the verification
-- workflow itself is already proven by the Phase 3/4 suite. This file is about
-- correction.
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

\echo '==> Security Passport Phase 6b'

INSERT INTO auth.users (id, email) VALUES
  ('f6b00000-0000-0000-0000-000000000001','p6b-holder@example.test'),
  ('f6b00000-0000-0000-0000-000000000002','p6b-other@example.test'),
  ('f6b00000-0000-0000-0000-000000000009','p6b-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name)
VALUES ('f6b00000-0000-0000-0000-000000000001','P6B Holder (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

-- =============================================================================
\echo '    GROUP 1 -- the credential fields survive a correction'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _old uuid; _new uuid; _r public.sp_claims%ROWTYPE;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
     credential_reference, holder_note, issued_on)
  VALUES (_h, 'training', 'Väktarutbildning 1 (VU1)', 'VU1', 'Nordvakt (fiktiv)',
          'CERT-1001', 'Tog kursen på plats i Malmö.', DATE '2023-05-01')
  RETURNING id INTO _old;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- Correct only the title. Everything else is resubmitted unchanged, which is
  -- what the pre-filled correction form does.
  SELECT public.sp_correct_claim(
    _old, 'Väktarutbildning 1 (VU1)', 'Nordvakt (fiktiv)', NULL,
    DATE '2023-05-01', DATE '2023-05-01', NULL, 'Rättade benämningen',
    'VU1', 'CERT-1001', 'Tog kursen på plats i Malmö.') INTO _new;
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _new;

  PERFORM pg_temp.ok(_r.credential_code = 'VU1',
    '1.1 the credential code survives a correction');
  PERFORM pg_temp.ok(_r.credential_reference = 'CERT-1001',
    '1.2 the credential reference survives a correction');
  PERFORM pg_temp.ok(_r.holder_note = 'Tog kursen på plats i Malmö.',
    '1.3 the holder note survives a correction');
  PERFORM pg_temp.ok(_r.version_no = 2 AND _r.supersedes_id = _old,
    '1.4 the corrected version is version 2 and points at what it replaced');
  PERFORM pg_temp.ok(_r.lifecycle_state = 'active',
    '1.5 the corrected version is the active one');

  -- History, not deletion.
  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _old) = 'superseded',
    '1.6 the previous version is marked superseded');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims WHERE id = _old) = 1,
    '1.7 the previous version is preserved as immutable history, not deleted');
  PERFORM pg_temp.ok(
    (SELECT credential_reference FROM public.sp_claims WHERE id = _old) = 'CERT-1001',
    '1.8 the previous version keeps its own field values');
END $$;

-- =============================================================================
\echo '    GROUP 2 -- explicit replacement is possible, invention is not'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _old uuid; _new uuid; _r public.sp_claims%ROWTYPE;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, credential_reference, holder_note)
  VALUES (_h, 'training', 'Väktarutbildning 1 (VU1)', 'VU1', 'CERT-2002', 'gammal anteckning')
  RETURNING id INTO _old;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- Deliberately change the code, the reference and the note.
  SELECT public.sp_correct_claim(
    _old, 'Väktarutbildning 2 (VU2)', NULL, NULL, NULL, NULL, NULL,
    'Det var VU2, inte VU1',
    'VU2', 'CERT-3003', NULL) INTO _new;
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _new;
  PERFORM pg_temp.ok(_r.credential_code = 'VU2',
    '2.1 the credential code can be explicitly replaced with a supported code');
  PERFORM pg_temp.ok(_r.credential_reference = 'CERT-3003',
    '2.2 the credential reference can be explicitly updated');
  PERFORM pg_temp.ok(_r.holder_note IS NULL,
    '2.3 the holder note can be explicitly cleared');

  -- An unsupported code is refused by the taxonomy, through the correction path
  -- exactly as through the insert path.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_correct_claim(%L, ''x'', NULL, NULL, NULL, NULL, NULL, ''r'', ''NOTREAL'', NULL, NULL)', _new),
    '', '2.4 a correction cannot invent an unsupported credential code');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 3 -- verification does not survive a material correction'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _v uuid := 'f6b00000-0000-0000-0000-000000000009';
  _old uuid; _new uuid; _r public.sp_claims%ROWTYPE; _detail jsonb;
BEGIN
  -- A verified OV, attributed, exactly as sp_verifier_decide would leave it.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
     credential_reference, holder_note, valid_until,
     assertion_level, verified_by_user_id, verified_at)
  VALUES (_h, 'licence', 'Ordningsvaktsförordnande', 'OV', 'Polismyndigheten',
          'DNR-4004', 'min anteckning', DATE '2027-12-31',
          'verified', _v, now())
  RETURNING id INTO _old;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- Materially different: the reference now names a different decision.
  SELECT public.sp_correct_claim(
    _old, 'Ordningsvaktsförordnande', 'Polismyndigheten', NULL,
    NULL, NULL, DATE '2027-12-31', 'Fel diarienummer',
    'OV', 'DNR-9999', 'min anteckning') INTO _new;
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _new;
  PERFORM pg_temp.ok(_r.assertion_level = 'self_declared',
    '3.1 a materially corrected claim drops back to self_declared');
  PERFORM pg_temp.ok(_r.verified_by_user_id IS NULL AND _r.verified_at IS NULL,
    '3.2 the verifier attribution does not follow a materially corrected claim');

  -- It must re-enter the normal workflow rather than arriving pre-approved.
  PERFORM pg_temp.ok(_r.assertion_level <> 'verified',
    '3.3 the corrected version must be reviewed again to become verified');

  SELECT detail INTO _detail FROM public.sp_passport_events
   WHERE subject_id = _new AND event_type = 'claim_corrected';
  PERFORM pg_temp.ok((_detail->>'verification_reset')::boolean,
    '3.4 the audit event records that verification was reset');
  PERFORM pg_temp.ok(_detail->>'previous_assertion_level' = 'verified',
    '3.5 the audit event records what the level was before');
END $$;

-- =============================================================================
\echo '    GROUP 4 -- a non-material correction keeps a legitimate decision'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _v uuid := 'f6b00000-0000-0000-0000-000000000009';
  _old uuid; _new uuid; _r public.sp_claims%ROWTYPE;
BEGIN
  -- authorisation_scope arrived with the Swedish truth model (20260907091000).
  -- Carrying it here is not incidental to this suite: the correction below
  -- does not pass a scope, so it also proves the scope is carried FORWARD
  -- rather than dropped — which is what would otherwise make correcting a
  -- skyddsvakt approval impossible.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
     credential_reference, holder_note, valid_until, authorisation_scope,
     assertion_level, verified_by_user_id, verified_at)
  VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'Polismyndigheten',
          'DNR-5005', 'första anteckning', DATE '2028-01-31',
          'Skyddsobjekt: Syntetisk anläggning',
          'verified', _v, now())
  RETURNING id INTO _old;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- ONLY the holder's own private note changes. The credential is untouched,
  -- so the verifier's decision is still about this exact fact.
  SELECT public.sp_correct_claim(
    _old, 'Skyddsvaktsförordnande', 'Polismyndigheten', NULL,
    NULL, NULL, DATE '2028-01-31', 'Skrev om min anteckning',
    'SV', 'DNR-5005', 'omskriven anteckning') INTO _new;
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _new;
  PERFORM pg_temp.ok(_r.assertion_level = 'verified',
    '4.1 editing only the private note does not reset verification');
  PERFORM pg_temp.ok(_r.verified_by_user_id = _v AND _r.verified_at IS NOT NULL,
    '4.2 a surviving verified level still names who decided it and when');
  PERFORM pg_temp.ok(_r.holder_note = 'omskriven anteckning',
    '4.3 the note itself is updated');
  PERFORM pg_temp.ok(_r.authorisation_scope = 'Skyddsobjekt: Syntetisk anläggning',
    '4.4 the scope is carried forward by a correction that did not mention it');
END $$;

-- =============================================================================
\echo '    GROUP 5 -- documentation does not follow either'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _old uuid; _new uuid; _lvl text;
BEGIN
  -- DOCUMENT_PROVIDED is a statement that a file is attached to THIS row.
  -- Evidence points at a claim id, and the new version has a new id.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, assertion_level)
  VALUES (_h, 'training', 'Väktarutbildning 1 (VU1)', 'VU1', 'document_provided')
  RETURNING id INTO _old;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- The correction changes the TRAINING PROVIDER, which is material.
  --
  -- It used to change the title instead, and from 20260910090000 it cannot:
  -- a governed credential is named by its definition, so the one field this
  -- fixture was editing is now the one field a correction may not touch. The
  -- assertion is unchanged — a material correction does not carry
  -- DOCUMENT_PROVIDED onto a row no evidence points at — only its subject is.
  SELECT public.sp_correct_claim(
    _old, 'Väktarutbildning 1 (VU1)', 'Väktarskolan Fiktiv AB', NULL, NULL, NULL, NULL,
    'Bytte bevis', 'VU1', NULL, NULL) INTO _new;
  RESET ROLE;

  SELECT assertion_level INTO _lvl FROM public.sp_claims WHERE id = _new;
  PERFORM pg_temp.ok(_lvl = 'self_declared',
    '5.1 DOCUMENT_PROVIDED does not follow a materially corrected claim');
END $$;

-- =============================================================================
\echo '    GROUP 6 -- the holder still cannot assign an approved state'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _old uuid; _new uuid; _lvl text; _args text;
BEGIN
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
  VALUES (_h, 'training', 'Väktarutbildning 2 (VU2)', 'VU2')
  RETURNING id INTO _old;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- Corrects the training provider. The title is the definition's and stays
  -- so; from 20260910090000 a governed credential cannot be renamed by anyone.
  SELECT public.sp_correct_claim(
    _old, 'Väktarutbildning 2 (VU2)', 'Väktarskolan Fiktiv AB', NULL, NULL, NULL, NULL,
    'r', 'VU2', NULL, NULL) INTO _new;
  RESET ROLE;

  SELECT assertion_level INTO _lvl FROM public.sp_claims WHERE id = _new;
  PERFORM pg_temp.ok(_lvl = 'self_declared',
    '6.1 a correction never raises trust');

  -- Structural, not behavioural: the function has no parameter through which a
  -- caller could ask for an assertion level at all.
  SELECT pg_get_function_arguments(p.oid) INTO _args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_correct_claim';
  PERFORM pg_temp.ok(position('assertion' IN _args) = 0,
    '6.2 sp_correct_claim exposes no assertion_level parameter');
  PERFORM pg_temp.ok(position('verified' IN _args) = 0,
    '6.3 sp_correct_claim exposes no verifier attribution parameter');

  -- And the direct route is still shut.
  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_claims SET assertion_level = ''verified'' WHERE id = %L', _new),
    'SP_TRUST_FIELD_IMMUTABLE',
    '6.4 the holder cannot set verified by direct update');
END $$;

-- =============================================================================
\echo '    GROUP 7 -- the existing guards are unchanged'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _other uuid := 'f6b00000-0000-0000-0000-000000000002';
  _claim uuid; _superseded uuid;
BEGIN
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
  VALUES (_h, 'training', 'Väktarutbildning 1 (VU1)', 'VU1')
  RETURNING id INTO _claim;

  -- Somebody else's Passport stays somebody else's.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_correct_claim(%L, ''stolen'', NULL, NULL, NULL, NULL, NULL, ''r'', ''VU1'', NULL, NULL)', _claim),
    'SP_NOT_HOLDER',
    '7.1 a non-holder cannot correct a claim');
  RESET ROLE;

  -- A superseded version is history and cannot be re-corrected.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT public.sp_correct_claim(
    _claim, 'Väktarutbildning 1 (VU1)', 'Väktarskolan Fiktiv AB', NULL, NULL, NULL, NULL,
    'r', 'VU1', NULL, NULL)
    INTO _superseded;
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_correct_claim(%L, ''again'', NULL, NULL, NULL, NULL, NULL, ''r'', ''VU1'', NULL, NULL)', _claim),
    'SP_CLAIM_NOT_CORRECTABLE',
    '7.2 a superseded version cannot be corrected again');

  -- The Phase 6 taxonomy rules still bind the corrected row.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_correct_claim(%L, ''OV utan slutdatum'', ''Polismyndigheten'', NULL, NULL, NULL, NULL, ''r'', ''OV'', NULL, NULL)', _superseded),
    '',
    '7.3 a correction cannot turn a claim into an appointment with no end date');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 8 -- audit history stays attributable and append-only'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _ev uuid; _detail jsonb;
BEGIN
  SELECT id, detail INTO _ev, _detail FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'claim_corrected'
   ORDER BY occurred_at DESC LIMIT 1;

  PERFORM pg_temp.ok(_ev IS NOT NULL,
    '8.1 a correction appends an audit event');
  PERFORM pg_temp.ok(
    (SELECT actor_user_id FROM public.sp_passport_events WHERE id = _ev) = _h,
    '8.2 the event names the actor who made the correction');
  PERFORM pg_temp.ok(_detail ? 'supersedes' AND _detail ? 'material_change',
    '8.3 the event records what it superseded and whether the change was material');

  -- Private content must not be copied into the log, where it would outlive
  -- the correction that removed it.
  PERFORM pg_temp.ok(NOT (_detail ? 'credential_reference'),
    '8.4 the audit event does not copy the credential reference');
  PERFORM pg_temp.ok(NOT (_detail ? 'holder_note'),
    '8.5 the audit event does not copy the holder note');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_passport_events SET detail = ''{}''::jsonb WHERE id = %L', _ev),
    '',
    '8.6 passport events are append-only');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.sp_passport_events WHERE id = %L', _ev),
    '',
    '8.7 passport events cannot be deleted');
END $$;

-- =============================================================================
\echo '    GROUP 9 -- the private fields are still undisclosable'
-- =============================================================================
DO $$
BEGIN
  PERFORM pg_temp.ok(
    pg_get_functiondef('public.sp_get_disclosure(text)'::regprocedure)
      !~ '(credential_reference|holder_note)',
    '9.1 sp_get_disclosure still names neither private column');
END $$;

-- Clean up this suite's own fixtures.
DELETE FROM public.sp_claims
 WHERE holder_user_id IN ('f6b00000-0000-0000-0000-000000000001',
                          'f6b00000-0000-0000-0000-000000000002');
DELETE FROM public.sp_passport_profiles
 WHERE holder_user_id = 'f6b00000-0000-0000-0000-000000000001';
\echo '    ok  9.2 suite fixtures removed'
