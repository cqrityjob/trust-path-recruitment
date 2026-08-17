-- =============================================================================
-- Security Passport — Phase 7 assertions: the public disclosure payload
--
-- The recipient page is the only anonymous surface in the product, and
-- `sp_get_disclosure` is the only thing that decides what reaches it. Phase 7
-- adds one field to that payload (`credential_code`) and narrows another
-- (`verified_experience_days`), so this suite exists to prove that the field
-- appears exactly where the package contract allows and nowhere else.
--
-- Every rule is asserted by MUTATION or by inspecting the REAL payload the
-- deployed function returns. Nothing here paraphrases the function.
--
-- The most important properties, in order:
--
--   * a symbol shown to a stranger comes from the server, from an
--     FK-constrained column — never from a holder-typed title;
--   * private credential fields (reference, holder note) never leave;
--   * unknown, revoked and expired tokens are INDISTINGUISHABLE, byte for
--     byte, so the page cannot be used as an oracle;
--   * nothing in the payload can present a self-declared or documented claim
--     as verified.
--
-- All identities and credentials below are transparently fictional and use a
-- `d7` UUID prefix so no other suite's leftovers can make this one pass.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

-- pgcrypto lives in `public` on a clean local replay and in `extensions` on
-- the hosted project (Phase 5b). Putting both on the path lets the token-hash
-- lookups below resolve `digest()` wherever the platform installed it, exactly
-- as the Passport functions themselves do.
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

/* One share, created as the holder and read as the server, exactly the way
   the application does it. Returning the payload rather than a paraphrase is
   the whole point: every assertion below inspects real function output. */
CREATE OR REPLACE FUNCTION pg_temp.disclose(_holder uuid, _package text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _tok text; _payload jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _holder::text, true);
  _tok := public.sp_create_disclosure(_package, 30, NULL, NULL);
  RESET ROLE;

  SET LOCAL ROLE service_role;
  _payload := public.sp_get_disclosure(_tok);
  RESET ROLE;
  RETURN _payload;
END $$;

\echo '==> Security Passport Phase 7'

INSERT INTO auth.users (id, email) VALUES
  ('d7000000-0000-0000-0000-000000000001','p7-holder@example.test'),
  ('d7000000-0000-0000-0000-000000000002','p7-other-holder@example.test'),
  ('d7000000-0000-0000-0000-000000000009','p7-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('d7000000-0000-0000-0000-000000000001','Petra Fiktivsson (fiktiv)'),
  ('d7000000-0000-0000-0000-000000000002','Rolf Exempelsson (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

-- The verifier capability is is_platform_admin (Phase 3). Granting it here
-- lets Group 5 revoke through the REAL workflow rather than by an UPDATE the
-- lifecycle trigger would rightly refuse.
INSERT INTO public.user_roles (user_id, role)
VALUES ('d7000000-0000-0000-0000-000000000009','admin') ON CONFLICT DO NOTHING;

-- The holder's credentials. One verified VU1, one verified OV carrying BOTH
-- private fields, plus one self-declared and one documented claim that must
-- never be disclosed however they are coded.
DO $$
DECLARE
  _h uuid := 'd7000000-0000-0000-0000-000000000001';
  _v uuid := 'd7000000-0000-0000-0000-000000000009';
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
     jurisdiction_code, issued_on, valid_until, credential_reference, holder_note,
     assertion_level, verified_by_user_id, verified_at)
  VALUES
    (_h, 'training', 'Väktarutbildning 1 (VU1)', 'VU1', 'Väktarskolan Fiktiv AB',
     'SE', DATE '2024-03-01', NULL, 'P7-REF-VU1-SECRET', 'P7 privat anteckning VU1',
     'verified', _v, now());

  -- The OV is taken through the REAL workflow — submitted by the holder,
  -- approved by a verifier — rather than inserted pre-verified. Group 5
  -- then revokes it the only way the database allows, which is the path a
  -- real revocation takes.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
     jurisdiction_code, issued_on, valid_until, credential_reference, holder_note)
  VALUES
    (_h, 'licence', 'Ordningsvaktsförordnande', 'OV', 'Fiktiva Myndigheten',
     'SE', DATE '2025-01-10', DATE '2028-01-09', 'P7-REF-OV-SECRET', 'P7 privat anteckning OV');

  -- Never disclosed: not verified, whatever their codes say.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name, issued_on)
  VALUES (_h, 'training', 'P7 Självdeklarerad VU2', 'VU2', 'Väktarskolan Fiktiv AB', DATE '2025-06-01');

  -- An appointment must carry an end date (Phase 6 trigger), so this fixture
  -- is complete in every respect EXCEPT being verified. That is the point:
  -- completeness must not be mistaken for verification.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
     issued_on, valid_until, assertion_level)
  VALUES (_h, 'licence', 'P7 Dokumenterad SV', 'SV', 'Fiktiva Myndigheten',
          DATE '2025-07-01', DATE '2028-06-30', 'document_provided');

  -- Periods carry no verifier-attribution columns; the decision lives in
  -- sp_verification_decisions. The level is what the disclosure filters on.
  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, started_on, ended_on, assertion_level)
  VALUES (_h, 'P7 Bevakning AB (fiktiv)', 'Väktare', DATE '2022-01-01', DATE '2024-01-01',
          'verified');
END $$;

-- Take the OV from self-declared to verified through the workflow.
DO $$
DECLARE
  _h uuid := 'd7000000-0000-0000-0000-000000000001';
  _v uuid := 'd7000000-0000-0000-0000-000000000009';
  _claim uuid; _req uuid;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code = 'OV';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_decide(
    _req, 'approved', 'document_review', 'P7 intern notering (fiktiv)',
    'P7 meddelande till innehavaren', DATE '2025-01-10', DATE '2028-01-09');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'verified',
    '0.1 the OV reached verified through the real workflow');
END $$;

-- The OTHER holder, so cross-holder bleed is testable.
DO $$
DECLARE
  _o uuid := 'd7000000-0000-0000-0000-000000000002';
  _v uuid := 'd7000000-0000-0000-0000-000000000009';
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
     issued_on, valid_until, assertion_level, verified_by_user_id, verified_at)
  VALUES (_o, 'licence', 'P7 ANNAN INNEHAVARE Skyddsvakt', 'SV', 'Fiktiva Myndigheten',
          DATE '2025-02-02', DATE '2028-02-01', 'verified', _v, now());
END $$;

-- =============================================================================
\echo '    GROUP 1 -- the credential code reaches the recipient'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd7000000-0000-0000-0000-000000000001';
  _payload jsonb; _codes text[];
BEGIN
  _payload := pg_temp.disclose(_h, 'public_card');
  PERFORM pg_temp.ok(_payload->>'status' = 'active', '1.1 the share resolves');

  SELECT array_agg(c->>'credential_code' ORDER BY c->>'credential_code')
    INTO _codes
    FROM jsonb_array_elements(_payload->'verified_claims') c;

  PERFORM pg_temp.ok(_codes @> ARRAY['VU1'], '1.2 a verified VU1 discloses its code');
  PERFORM pg_temp.ok(_codes @> ARRAY['OV'],  '1.3 a verified OV discloses its code');
  PERFORM pg_temp.ok(array_length(_codes, 1) = 2,
    '1.4 exactly the two verified-active claims carry codes');

  -- The code is the FK value, so the symbol a stranger sees cannot be chosen
  -- by the holder typing a title.
  PERFORM pg_temp.ok(
    (SELECT bool_and(c->>'credential_code' IN (SELECT code FROM public.sp_credential_types))
       FROM jsonb_array_elements(_payload->'verified_claims') c),
    '1.5 every disclosed code exists in the taxonomy table');
END $$;

-- =============================================================================
\echo '    GROUP 2 -- no trust elevation through the payload'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd7000000-0000-0000-0000-000000000001'; _payload jsonb;
BEGIN
  _payload := pg_temp.disclose(_h, 'full_verification');

  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Självdeklarerad VU2%',
    '2.1 a self-declared claim is never disclosed');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Dokumenterad SV%',
    '2.2 a document-provided claim is never disclosed');
  PERFORM pg_temp.ok(
    (SELECT bool_and(c->>'assertion' = 'verified')
       FROM jsonb_array_elements(_payload->'verified_claims') c),
    '2.3 every disclosed claim is genuinely verified');
  PERFORM pg_temp.ok(
    (SELECT bool_and(c->>'lifecycle' = 'active')
       FROM jsonb_array_elements(_payload->'verified_claims') c),
    '2.4 every disclosed claim is genuinely active');
END $$;

-- =============================================================================
\echo '    GROUP 3 -- private credential fields never leave the database'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd7000000-0000-0000-0000-000000000001'; _payload jsonb; _pkg text;
BEGIN
  FOREACH _pkg IN ARRAY ARRAY['public_card','verified_qualifications','verified_experience',
                              'employer_review','full_verification'] LOOP
    _payload := pg_temp.disclose(_h, _pkg);

    PERFORM pg_temp.ok(_payload::text NOT LIKE '%P7-REF-VU1-SECRET%',
      format('3.1 %s never discloses credential_reference (VU1)', _pkg));
    PERFORM pg_temp.ok(_payload::text NOT LIKE '%P7-REF-OV-SECRET%',
      format('3.2 %s never discloses credential_reference (OV)', _pkg));
    PERFORM pg_temp.ok(_payload::text NOT LIKE '%privat anteckning%',
      format('3.3 %s never discloses holder_note', _pkg));
    PERFORM pg_temp.ok(_payload::text NOT LIKE '%credential_reference%',
      format('3.4 %s carries no credential_reference key at all', _pkg));
    PERFORM pg_temp.ok(_payload::text NOT LIKE '%holder_note%',
      format('3.5 %s carries no holder_note key at all', _pkg));
  END LOOP;
END $$;

-- =============================================================================
\echo '    GROUP 4 -- package boundaries hold in the payload, not in the browser'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd7000000-0000-0000-0000-000000000001'; _payload jsonb;
BEGIN
  -- Qualifications package: claims yes, employment no, tenure total no.
  _payload := pg_temp.disclose(_h, 'verified_qualifications');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_claims') = 2,
    '4.1 verified_qualifications discloses the qualifications');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_experience') = 0,
    '4.2 verified_qualifications discloses no employment');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%P7 Bevakning%',
    '4.3 verified_qualifications leaks no employer name');
  -- The boundary this phase closed: the aggregate used to be computed for
  -- every package and hidden in the UI.
  PERFORM pg_temp.ok((_payload->>'verified_experience_days')::numeric = 0,
    '4.4 verified_qualifications carries no tenure total');

  -- Experience package: employment yes, qualifications no.
  _payload := pg_temp.disclose(_h, 'verified_experience');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_claims') = 0,
    '4.5 verified_experience discloses no qualifications');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%VU1%',
    '4.6 verified_experience leaks no credential code');
  PERFORM pg_temp.ok((_payload->>'verified_experience_days')::numeric > 0,
    '4.7 verified_experience does carry the tenure total it promises');

  -- Public card: qualifications and tenure, never employer names.
  _payload := pg_temp.disclose(_h, 'public_card');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_experience') = 0,
    '4.8 public_card discloses no employment list');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%P7 Bevakning%',
    '4.9 public_card leaks no employer name');
  PERFORM pg_temp.ok((_payload->>'verified_experience_days')::numeric > 0,
    '4.10 public_card carries the tenure total it promises');

  -- Employer review: both lists, and no aggregate it never promised.
  _payload := pg_temp.disclose(_h, 'employer_review');
  PERFORM pg_temp.ok(jsonb_array_length(_payload->'verified_claims') = 2
                 AND jsonb_array_length(_payload->'verified_experience') = 1,
    '4.11 employer_review discloses both lists');
  PERFORM pg_temp.ok((_payload->>'verified_experience_days')::numeric = 0,
    '4.12 employer_review carries no tenure total (not in its contract)');
END $$;

-- =============================================================================
\echo '    GROUP 5 -- a revoked claim stops being disclosed, code and all'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd7000000-0000-0000-0000-000000000001';
  _payload jsonb; _claim uuid;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code = 'OV' AND lifecycle_state = 'active';

  -- Revoked through the real workflow, by a verifier. A direct UPDATE is
  -- refused by the lifecycle trigger, which is itself the point.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd7000000-0000-0000-0000-000000000009', true);
  PERFORM public.sp_verifier_revoke(_claim, NULL, 'P7: utfärdaren har återkallat (fiktiv)');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _claim) = 'revoked',
    '5.0 the credential is revoked through the verification workflow');

  _payload := pg_temp.disclose(_h, 'full_verification');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%Ordningsvaktsförordnande%',
    '5.1 a revoked credential is not disclosed');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_payload->'verified_claims') c
                 WHERE c->>'credential_code' = 'OV'),
    '5.2 its credential code is not disclosed either');

  -- The assertion level is deliberately untouched by revocation: somebody
  -- really did verify it once. It is the LIFECYCLE that ended, and that alone
  -- is what removes it from disclosure.
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'verified',
    '5.3 revocation ends the lifecycle without rewriting the evidence history');
END $$;

-- =============================================================================
\echo '    GROUP 6 -- a superseded version never appears as current'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd7000000-0000-0000-0000-000000000001';
  _old uuid; _new uuid; _payload jsonb;
BEGIN
  SELECT id INTO _old FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code = 'VU1' AND lifecycle_state = 'active';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT public.sp_correct_claim(
    _old, 'Väktarutbildning 1 (VU1) — rättad', 'Väktarskolan Fiktiv AB', 'SE',
    DATE '2024-03-02', DATE '2024-03-02', NULL, 'p7 rättelse', 'VU1',
    'P7-REF-VU1-SECRET', 'P7 privat anteckning VU1') INTO _new;
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _old) = 'superseded',
    '6.1 the corrected version is marked superseded');

  _payload := pg_temp.disclose(_h, 'full_verification');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_payload->'verified_claims') c
                 WHERE (c->>'id')::uuid = _old),
    '6.2 the superseded version is not disclosed');

  -- A materially corrected claim drops to self_declared (Phase 6b), so the
  -- NEW version must not be disclosed as verified either.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_payload->'verified_claims') c
                 WHERE (c->>'id')::uuid = _new),
    '6.3 the corrected version is not disclosed until it is verified again');
END $$;

-- =============================================================================
\echo '    GROUP 7 -- cross-holder bleed'
-- =============================================================================
DO $$
DECLARE _h uuid := 'd7000000-0000-0000-0000-000000000001'; _payload jsonb;
BEGIN
  _payload := pg_temp.disclose(_h, 'full_verification');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%ANNAN INNEHAVARE%',
    '7.1 one holder''s share never discloses another holder''s credential');
  PERFORM pg_temp.ok(
    (SELECT bool_and((c->>'id')::uuid IN
       (SELECT id FROM public.sp_claims WHERE holder_user_id = _h))
       FROM jsonb_array_elements(_payload->'verified_claims') c),
    '7.2 every disclosed claim belongs to the sharing holder');
END $$;

-- =============================================================================
\echo '    GROUP 8 -- unknown, revoked and expired are byte-for-byte identical'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'd7000000-0000-0000-0000-000000000001';
  _tok_revoked text; _tok_expired text; _id uuid;
  _unknown jsonb; _revoked jsonb; _expired jsonb; _empty jsonb; _null jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _tok_revoked := public.sp_create_disclosure('public_card', 30, NULL, NULL);
  _tok_expired := public.sp_create_disclosure('public_card', 30, NULL, NULL);
  RESET ROLE;

  SELECT id INTO _id FROM public.sp_disclosures
   WHERE token_hash = encode(digest(_tok_revoked, 'sha256'), 'hex');
  UPDATE public.sp_disclosures SET revoked_at = now() WHERE id = _id;

  SELECT id INTO _id FROM public.sp_disclosures
   WHERE token_hash = encode(digest(_tok_expired, 'sha256'), 'hex');
  UPDATE public.sp_disclosures SET expires_at = now() - interval '1 day' WHERE id = _id;

  SET LOCAL ROLE service_role;
  _unknown := public.sp_get_disclosure('p7-token-that-never-existed');
  _revoked := public.sp_get_disclosure(_tok_revoked);
  _expired := public.sp_get_disclosure(_tok_expired);
  _empty   := public.sp_get_disclosure('');
  _null    := public.sp_get_disclosure(NULL);
  RESET ROLE;

  PERFORM pg_temp.ok(_unknown::text = '{"status": "unavailable"}',
    '8.1 an unknown token fails closed');
  PERFORM pg_temp.ok(_revoked::text = _unknown::text,
    '8.2 a REVOKED share is byte-identical to an unknown one');
  PERFORM pg_temp.ok(_expired::text = _unknown::text,
    '8.3 an EXPIRED share is byte-identical to an unknown one');
  PERFORM pg_temp.ok(_empty::text = _unknown::text,
    '8.4 an empty token is byte-identical to an unknown one');
  PERFORM pg_temp.ok(_null::text = _unknown::text,
    '8.5 a NULL token is byte-identical to an unknown one');

  -- An oracle would also leak through side effects, not only through content.
  PERFORM pg_temp.ok(
    (SELECT access_count FROM public.sp_disclosures
      WHERE token_hash = encode(digest(_tok_revoked, 'sha256'), 'hex')) = 0,
    '8.6 a revoked share records no access');
END $$;

-- =============================================================================
\echo '    GROUP 9 -- the anon boundary is unchanged by Phase 7'
-- =============================================================================
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_get_disclosure(text)', 'EXECUTE'),
  '9.1 anon still cannot execute the recipient function');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_routine_grants
    WHERE grantee='anon' AND routine_schema='public' AND routine_name LIKE 'sp\_%') = 0,
  '9.2 anon can execute NO sp_* function');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'sp\_%') = 0,
  '9.3 anon holds no table privilege on any sp_* table');

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.sp_credential_types', 'SELECT'),
  '9.4 anon cannot read the credential taxonomy directly');

-- The function must stay SECURITY DEFINER with an immutable search path.
SELECT pg_temp.ok(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='sp_get_disclosure'),
  '9.5 sp_get_disclosure is still SECURITY DEFINER');

SELECT pg_temp.ok(
  (SELECT p.proconfig @> ARRAY['search_path=public, extensions']
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='sp_get_disclosure'),
  '9.6 its search_path is still pinned to public, extensions');

-- =============================================================================
\echo '    GROUP 10 -- an authenticated stranger gains nothing'
-- =============================================================================
DO $$
DECLARE _o uuid := 'd7000000-0000-0000-0000-000000000002'; _seen int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  SELECT count(*) INTO _seen FROM public.sp_claims
   WHERE holder_user_id = 'd7000000-0000-0000-0000-000000000001';
  RESET ROLE;

  PERFORM pg_temp.ok(_seen = 0,
    '10.1 another authenticated holder reads none of the holder''s claims');
END $$;

DO $$
DECLARE _o uuid := 'd7000000-0000-0000-0000-000000000002'; _seen int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  SELECT count(*) INTO _seen FROM public.sp_disclosures
   WHERE holder_user_id = 'd7000000-0000-0000-0000-000000000001';
  RESET ROLE;

  PERFORM pg_temp.ok(_seen = 0,
    '10.2 another authenticated holder cannot enumerate the holder''s shares');
END $$;

-- Even holding a real token, an authenticated caller cannot run the function.
SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated', 'public.sp_get_disclosure(text)', 'EXECUTE'),
  '10.3 an authenticated caller cannot execute the recipient function either');

-- =============================================================================
\echo '    GROUP 11 -- the private credential reads are bounded by RLS'
-- =============================================================================
-- `listClaimVersions` and `getCredentialPrivateFields` (Phase 7, client side)
-- read sp_claims through the RLS-scoped client: the anon key plus the
-- caller's JWT. So the decisive boundary is the SELECT policy, not the
-- `.eq(holder_user_id)` the functions also write. These assertions prove the
-- policy carries that weight on its own, against every principal that might
-- plausibly think it has a reason to look.

INSERT INTO public.employers (id, slug, name, status)
VALUES ('d7000000-0000-0000-0000-0000000000e1','p7-employer','P7 Employer AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES ('d7000000-0000-0000-0000-000000000003','p7-employer-user@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('d7000000-0000-0000-0000-0000000000e1','d7000000-0000-0000-0000-000000000003','owner','active')
ON CONFLICT DO NOTHING;

-- Exactly one SELECT policy may exist on sp_claims. A second one is how a
-- "just for the admin console" read gets added without anyone noticing.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='sp_claims' AND cmd='SELECT') = 1,
  '11.1 sp_claims has exactly one SELECT policy');

SELECT pg_temp.ok(
  (SELECT qual FROM pg_policies
    WHERE schemaname='public' AND tablename='sp_claims' AND cmd='SELECT')
    LIKE '%holder_user_id = auth.uid()%',
  '11.2 that policy is holder-only');

DO $$
DECLARE _h uuid := 'd7000000-0000-0000-0000-000000000001'; _seen int;
BEGIN
  -- The VERIFIER. Holds the platform-admin capability, and still reads
  -- nothing: verification happens through bounded RPCs, never a table read.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd7000000-0000-0000-0000-000000000009', true);
  SELECT count(*) INTO _seen FROM public.sp_claims WHERE holder_user_id = _h;
  RESET ROLE;
  PERFORM pg_temp.ok(_seen = 0,
    '11.3 a verifier/platform admin reads none of the holder''s claims directly');

  -- The EMPLOYER. A membership role is not a reason to read a Passport.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'd7000000-0000-0000-0000-000000000003', true);
  SELECT count(*) INTO _seen FROM public.sp_claims WHERE holder_user_id = _h;
  RESET ROLE;
  PERFORM pg_temp.ok(_seen = 0,
    '11.4 an employer member reads none of the holder''s claims');

  -- ANON does not merely see zero rows: it holds no grant on the table, so
  -- the read is refused outright, one layer before RLS is consulted.
  PERFORM pg_temp.must_fail(
    'SET LOCAL ROLE anon; SELECT count(*) FROM public.sp_claims',
    'permission denied',
    '11.5 anon is refused the claims table outright');
  RESET ROLE;

  -- The HOLDER does, or the policy would be proving nothing.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT count(*) INTO _seen FROM public.sp_claims WHERE holder_user_id = _h;
  RESET ROLE;
  PERFORM pg_temp.ok(_seen > 0, '11.6 the holder reads their own claims');
END $$;

-- The version chain the holder's history view walks is the same table, so a
-- stranger walking it from a known id gets nothing rather than a neighbour's
-- correction history.
DO $$
DECLARE _other uuid := 'd7000000-0000-0000-0000-000000000002'; _seen int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);
  SELECT count(*) INTO _seen FROM public.sp_claims
   WHERE supersedes_id IS NOT NULL
      OR holder_user_id = 'd7000000-0000-0000-0000-000000000001';
  RESET ROLE;
  PERFORM pg_temp.ok(_seen = 0,
    '11.7 a stranger can walk no part of another holder''s version chain');
END $$;

-- The private columns must not reach the verifier's review payload either.
-- The verifier is the one principal with a legitimate reason to look at a
-- claim, and they still see the assertion, not the holder's private note.
DO $$
DECLARE
  _v uuid := 'd7000000-0000-0000-0000-000000000009';
  _req uuid; _detail jsonb;
BEGIN
  SELECT r.id INTO _req FROM public.sp_verification_requests r
   WHERE r.holder_user_id = 'd7000000-0000-0000-0000-000000000001'
   ORDER BY r.submitted_at DESC LIMIT 1;

  IF _req IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 11.8 expected a verification request to inspect';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  _detail := public.sp_verifier_request_detail(_req);
  RESET ROLE;

  PERFORM pg_temp.ok(_detail::text NOT LIKE '%P7-REF-OV-SECRET%',
    '11.8 the verifier review payload carries no credential_reference');
  PERFORM pg_temp.ok(_detail::text NOT LIKE '%privat anteckning%',
    '11.9 the verifier review payload carries no holder_note');
END $$;

-- Audit events are read by more principals than the claim itself, so the
-- private columns must never have been written into one.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_passport_events
    WHERE detail::text LIKE '%P7-REF-OV-SECRET%'
       OR detail::text LIKE '%P7-REF-VU1-SECRET%'
       OR detail::text LIKE '%privat anteckning%') = 0,
  '11.10 no audit event payload contains a private credential field');
