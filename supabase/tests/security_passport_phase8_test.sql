-- =============================================================================
-- Security Passport — Phase 8 assertions: the holder's own entries
--
-- Phase 8 gave the product the write path it was missing: employment periods
-- and the free-text claim kinds, entered from the UI into the real tables
-- rather than into a JSON blob on the profile.
--
-- The rules that matter here are about what a holder may do to their OWN
-- record, and where that freedom stops:
--
--   * a self-declared, active entry is the holder's private draft — they may
--     edit it and delete it outright;
--   * the moment anyone else has acted on it (evidence attached, review
--     opened, decision recorded) it stops being a draft and hard deletion
--     must fail, leaving supersession and withdrawal as the only routes;
--   * nothing a holder writes may set or raise trust.
--
-- Asserted by MUTATION throughout: the suite attempts the forbidden thing and
-- fails if the database allows it. All identities are transparently fictional
-- and use a `d8` prefix.
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

\echo '==> Security Passport Phase 8'

INSERT INTO auth.users (id, email) VALUES
  ('d8000000-0000-0000-0000-000000000001','p8-holder@example.test'),
  ('d8000000-0000-0000-0000-000000000002','p8-other@example.test'),
  ('d8000000-0000-0000-0000-000000000009','p8-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('d8000000-0000-0000-0000-000000000001','Petter Provsson (fiktiv)'),
  ('d8000000-0000-0000-0000-000000000002','Anna Annan (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('d8000000-0000-0000-0000-000000000009','admin') ON CONFLICT DO NOTHING;

-- =============================================================================
\echo '    GROUP 1 -- a holder can record employment, and it is self-declared'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd8000000-0000-0000-0000-000000000001'; _r public.sp_experience_periods%ROWTYPE;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, employment_type, fte_fraction,
     security_relevance, security_fraction, started_on, ended_on)
  VALUES (_h, 'P8 Bevakning AB (fiktiv)', 'Väktare', 'full_time', 1.00,
          'primary', 1.00, DATE '2021-01-01', NULL);
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_experience_periods WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_r.assertion_level = 'self_declared',
    '1.1 a holder-written period is self-declared by default');
  PERFORM pg_temp.ok(_r.lifecycle_state = 'active',
    '1.2 and active');
  PERFORM pg_temp.ok(_r.ended_on IS NULL,
    '1.3 ongoing employment is stored as a null end date');
END $$;

-- The holder cannot write themselves a verified period.
DO $$
DECLARE _h uuid := 'd8000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_experience_periods SET assertion_level = ''verified'' WHERE holder_user_id = %L', _h),
    '',
    '1.4 a holder cannot raise their own period to verified');
  RESET ROLE;
END $$;

-- An end date before the start is refused by the database, not only the form.
DO $$
DECLARE _h uuid := 'd8000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, started_on, ended_on) VALUES (%L, ''X (fiktiv)'', ''Väktare'', DATE ''2023-01-01'', DATE ''2022-01-01'')', _h),
    'sp_period_dates_ordered',
    '1.5 an end date before the start is refused');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 2 -- the free-text claim kinds all store'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _kind text; _n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  FOREACH _kind IN ARRAY ARRAY['education','training','certification','specialisation','professional_membership'] LOOP
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, claimed_issuer_name, issued_on)
    VALUES (_h, _kind, 'P8 ' || _kind || ' (fiktiv)', 'P8 Utfärdare (fiktiv)', DATE '2024-05-01');
  END LOOP;
  RESET ROLE;

  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code IS NULL;
  PERFORM pg_temp.ok(_n = 5, format('2.1 all five free-text claim kinds store (got %s)', _n));

  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _h AND assertion_level <> 'self_declared';
  PERFORM pg_temp.ok(_n = 0, '2.2 none of them is anything but self-declared');

  -- A free-text claim must never carry a taxonomy code: the symbol would then
  -- appear on something no taxonomy rule ever checked.
  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code IS NOT NULL;
  PERFORM pg_temp.ok(_n = 0, '2.3 no free-text claim carries a credential code');
END $$;

-- =============================================================================
\echo '    GROUP 3 -- removal is withdrawal, and history is not erasable'
-- =============================================================================
-- No APPLICATION role holds DELETE on any sp_* table. (The owner does, by
-- virtue of owning them; that is inherent to ownership, not a grant, and it
-- is not a role any request runs as.) "Remove" in the UI therefore marks the
-- entry withdrawn: it leaves the Passport and stops being disclosed, and the
-- row survives as history.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'sp\_%'
      AND privilege_type='DELETE'
      AND grantee IN ('anon','authenticated','service_role','PUBLIC')) = 0,
  '3.1 no application role holds DELETE on any sp_* table');

-- Phase 9b: the hosted project granted DELETE on every sp_* table by default
-- and nothing had taken it away. Named here so a future table that forgets
-- its REVOKE fails rather than quietly inheriting the grant.
SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.sp_passport_events', 'DELETE'),
  '3.1b the append-only audit log cannot be deleted from by authenticated');
SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.sp_evidence', 'DELETE'),
  '3.1c nor evidence, whose FOR ALL policy would otherwise have permitted it');
SELECT pg_temp.ok(
  NOT has_table_privilege('service_role', 'public.sp_passport_events', 'DELETE'),
  '3.1d nor by service_role, which bypasses RLS');

DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _plain uuid; _documented uuid;
BEGIN
  SELECT id INTO _plain FROM public.sp_claims
   WHERE holder_user_id = _h AND claim_type = 'education' LIMIT 1;
  SELECT id INTO _documented FROM public.sp_claims
   WHERE holder_user_id = _h AND claim_type = 'certification' LIMIT 1;

  -- Even the holder cannot delete their own plain draft.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.sp_claims WHERE id = %L', _plain),
    'permission denied',
    '3.2 the holder cannot DELETE even a plain self-declared draft');

  -- What they CAN do is withdraw it, through the RPC the UI calls.
  PERFORM public.sp_withdraw_claim(_plain, 'removed_while_self_declared');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _plain) = 'withdrawn',
    '3.3 removing a draft marks it withdrawn');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims WHERE id = _plain) = 1,
    '3.4 the row survives as history');

  -- Documenting the other one raises it, and the UI guard then refuses.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- Evidence paths are namespaced to the holder; the database refuses any
  -- other prefix, which is what keeps one holder's bucket folder private.
  PERFORM public.sp_attach_evidence(
    _documented, NULL, _h::text || '/p8-evidence.pdf', 'evidence.pdf',
    'application/pdf', 1024, 'p8-hash');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _documented) = 'document_provided',
    '3.5 attaching evidence raises the claim to document_provided');

  -- The server-side guard: the row no longer matches self_declared + active,
  -- so removeEntry reports nothing removed rather than withdrawing it behind
  -- the back of an open documentation trail.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_claims
                 WHERE id = _documented
                   AND assertion_level = 'self_declared'
                   AND lifecycle_state = 'active'),
    '3.6 a documented claim no longer matches the removal guard');
END $$;

-- =============================================================================
\echo '    GROUP 4 -- cross-holder isolation on the new write path'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _o uuid := 'd8000000-0000-0000-0000-000000000002';
  _victim uuid; _seen int;
BEGIN
  SELECT id INTO _victim FROM public.sp_experience_periods WHERE holder_user_id = _h LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);

  SELECT count(*) INTO _seen FROM public.sp_experience_periods WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_seen = 0, '4.1 another holder reads none of the periods');

  -- An UPDATE aimed at a known id affects nothing: RLS filters the row out
  -- rather than refusing, so the statement succeeds and changes nothing.
  UPDATE public.sp_experience_periods SET employer_name = 'HIJACKED' WHERE id = _victim;

  -- A DELETE is refused one layer earlier still: no application role holds
  -- the privilege at all, so it never even reaches RLS.
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.sp_experience_periods WHERE id = %L', _victim),
    'permission denied',
    '4.3 no application role can delete a period at all');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT employer_name FROM public.sp_experience_periods WHERE id = _victim)
      = 'P8 Bevakning AB (fiktiv)',
    '4.2 another holder cannot edit it');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_experience_periods WHERE id = _victim) = 1,
    '4.4 the period survives untouched');

  -- Nor insert one ON someone else's behalf.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, started_on) VALUES (%L, ''Planted (fiktiv)'', ''Väktare'', DATE ''2020-01-01'')', _h),
    'row-level security',
    '4.4 another holder cannot plant a period on someone else');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 5 -- an entry can travel the whole way to verified'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _v uuid := 'd8000000-0000-0000-0000-000000000009';
  _claim uuid; _req uuid; _r public.sp_claims%ROWTYPE;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND claim_type = 'training' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req) = 'pending',
    '5.1 submitting a free-text claim creates a pending review');

  -- Clarification, then answer, then approval — the full holder journey.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_decide(
    _req, 'clarification_requested', NULL, 'P8 intern (fiktiv)',
    'Kan du styrka kursens omfattning?', NULL, NULL);
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req) = 'clarification_requested',
    '5.2 a verifier can request clarification');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_decide(
    _req, 'approved', 'document_review', 'P8 intern (fiktiv)',
    'Styrkt.', DATE '2024-05-01', NULL);
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _claim;
  PERFORM pg_temp.ok(_r.assertion_level = 'verified', '5.3 approval verifies the claim');
  PERFORM pg_temp.ok(_r.verified_by_user_id = _v AND _r.verified_at IS NOT NULL,
    '5.4 the decision is attributed to the verifier who made it');

  -- And the holder still cannot remove it now that it is verified: the
  -- delete privilege does not exist, and withdrawal is refused because the
  -- claim is no longer a self-declared draft.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.sp_claims WHERE id = %L', _claim),
    'permission denied',
    '5.5 a verified claim cannot be deleted by the holder');
  RESET ROLE;

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_claims
                 WHERE id = _claim AND assertion_level = 'self_declared'
                   AND lifecycle_state = 'active'),
    '5.6 nor does it match the removal guard any more');
END $$;

-- =============================================================================
\echo '    GROUP 6 -- the holder still cannot self-verify through any path'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _claim uuid; _req uuid;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND claim_type = 'specialisation' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'', ''x'', ''y'', NULL, NULL)', _req),
    -- The specific guard: not merely "you are not a verifier", but "nobody
    -- may decide their own claim", which holds even if the holder later
    -- gains the verifier capability.
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '6.1 the holder cannot decide their own review');
  RESET ROLE;
END $$;

-- =============================================================================
\echo '    GROUP 7 -- Phase 9: a share can carry ONE credential, and only narrow'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _v uuid := 'd8000000-0000-0000-0000-000000000009';
  _target uuid; _second uuid; _req uuid; _tok text; _payload jsonb;
BEGIN
  -- The claim verified in Group 5 is the one to focus on.
  SELECT id INTO _target FROM public.sp_claims
   WHERE holder_user_id = _h AND assertion_level = 'verified'
     AND lifecycle_state = 'active' LIMIT 1;

  -- A second verified credential, so "only one is disclosed" is a real test
  -- rather than true by there being nothing else.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, claimed_issuer_name, issued_on)
  VALUES (_h, 'certification', 'P8 Andra certifieringen (fiktiv)', 'P8 Organ (fiktiv)', DATE '2024-01-01')
  RETURNING id INTO _second;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_second, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review', 'x', 'y', NULL, NULL);
  RESET ROLE;

  -- Now share exactly one of the two.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _tok := public.sp_create_credential_disclosure(_target, 30, NULL, NULL);
  RESET ROLE;

  SET LOCAL ROLE service_role;
  _payload := public.sp_get_disclosure(_tok);
  RESET ROLE;

  PERFORM pg_temp.ok(_payload->>'status' = 'active', '7.1 the credential share resolves');
  PERFORM pg_temp.ok(_payload->>'focus' = 'credential',
    '7.2 the payload says it is a credential, not a Passport');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_claims') = 1,
    '7.3 exactly one credential is disclosed');
  PERFORM pg_temp.ok(
    (_payload->'verified_claims'->0->>'id')::uuid = _target,
    '7.4 and it is the one that was shared');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Andra certifieringen%',
    '7.5 the holder''s other verified credential is NOT disclosed');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_experience') = 0,
    '7.6 a credential share carries no employment');
  PERFORM pg_temp.ok((_payload->>'verified_experience_days')::numeric = 0,
    '7.7 nor any tenure total');
END $$;

-- Ownership and shareability are enforced at creation.
DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _o uuid := 'd8000000-0000-0000-0000-000000000002';
  _target uuid; _unverified uuid;
BEGIN
  SELECT id INTO _target FROM public.sp_claims
   WHERE holder_user_id = _h AND assertion_level = 'verified' LIMIT 1;
  SELECT id INTO _unverified FROM public.sp_claims
   WHERE holder_user_id = _h AND assertion_level = 'self_declared'
     AND lifecycle_state = 'active' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_create_credential_disclosure(%L, 30, NULL, NULL)', _target),
    'SP_NOT_HOLDER',
    '7.8 another holder cannot share someone elses credential');
  RESET ROLE;

  IF _unverified IS NOT NULL THEN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', _h::text, true);
    PERFORM pg_temp.must_fail(
      format('SELECT public.sp_create_credential_disclosure(%L, 30, NULL, NULL)', _unverified),
      'SP_CREDENTIAL_NOT_SHAREABLE',
      '7.9 an unverified credential cannot be shared on its own');
    RESET ROLE;
  END IF;
END $$;

-- Revocation and the fail-closed head work identically for a focused share.
DO $$
DECLARE
  _h uuid := 'd8000000-0000-0000-0000-000000000001';
  _target uuid; _tok text; _id uuid;
BEGIN
  SELECT id INTO _target FROM public.sp_claims
   WHERE holder_user_id = _h AND assertion_level = 'verified' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _tok := public.sp_create_credential_disclosure(_target, 30, NULL, NULL);
  RESET ROLE;

  SELECT id INTO _id FROM public.sp_disclosures
   WHERE token_hash = encode(digest(_tok, 'sha256'), 'hex');
  UPDATE public.sp_disclosures SET revoked_at = now() WHERE id = _id;

  SET LOCAL ROLE service_role;
  PERFORM pg_temp.ok(
    public.sp_get_disclosure(_tok)::text = '{"status": "unavailable"}',
    '7.10 a revoked credential share is byte-identical to an unknown token');
  RESET ROLE;
END $$;
