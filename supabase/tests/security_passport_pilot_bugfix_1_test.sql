-- =============================================================================
-- Security Passport — pilot bug fix #1
--
-- One assertion group per defect a real tester found in the live pilot, and
-- each group states the defect before it proves the fix. None of these is a
-- hypothetical: every one of them happened to somebody using the product.
--
--   1. A tester chose Skyddsvaktsförordnande and typed "Bajskorv" into
--      Benämning. It saved.
--   2. A driving licence issued outside Sweden could not be recorded, because
--      the SECURITY market pack gate ran on every claim with a jurisdiction —
--      including claims that name no credential at all.
--   3. "Anmäl att uppgiften är fel" moved the entry to Bestridd and it then
--      appeared in no queue anywhere, with no way back.
--   4. "How do I remove this?" had no answer for anything that was not a
--      draft, because the holder's UPDATE policy correctly refuses every write
--      to a verified claim — and that took the archive with it.
--
-- Plus the two things this release must NOT have done: activate a market, or
-- disturb a credential that already exists.
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

\echo '==> Security Passport pilot bug fix #1'

-- Fictional, and in their own id range so no other suite's leftovers can make
-- this one pass.
INSERT INTO auth.users (id, email) VALUES
  ('bf100000-0000-0000-0000-000000000001','bf1-holder@example.test'),
  ('bf100000-0000-0000-0000-000000000002','bf1-verifier@example.test'),
  ('bf100000-0000-0000-0000-000000000003','bf1-other@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('bf100000-0000-0000-0000-000000000002','admin') ON CONFLICT DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('bf100000-0000-0000-0000-000000000001','BF1 Holder','SE')
ON CONFLICT (holder_user_id) DO UPDATE
  SET display_name = 'BF1 Holder', jurisdiction_code = 'SE', sub_jurisdiction_code = NULL;


-- =============================================================================
\echo '    GROUP 1 -- a governed credential is named by its definition'
-- =============================================================================
--
-- THE DEFECT: the controlled-label rule lived inside the `narrow_result_only`
-- branch, so it reached one of the eight Swedish credentials. The other seven
-- — VU1, VU2, both förordnanden and the three ordningsvakt courses — accepted
-- whatever the holder typed. A skyddsvakt appointment called "Bajskorv" is not
-- a cosmetic problem: it is a regulated authorisation renamed by its subject.
DO $$
DECLARE
  _h uuid := 'bf100000-0000-0000-0000-000000000001';
  _n integer;
  _t text;
BEGIN
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sp_credential_types'
               AND column_name='title_is_holder_written'),
    '1.1 the taxonomy can say whether the holder names a credential');

  -- The DEFAULT is the load-bearing part: a credential added later is
  -- controlled unless somebody deliberately says otherwise.
  SELECT count(*) INTO _n FROM public.sp_credential_types WHERE title_is_holder_written;
  PERFORM pg_temp.ok(_n = 0,
    '1.2 nothing CQrityjob ships today lets a holder name a regulated credential');

  SELECT column_default INTO _t FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sp_credential_types'
     AND column_name='title_is_holder_written';
  PERFORM pg_temp.ok(_t LIKE 'false%',
    '1.3 and a credential added later is controlled by default');

  -- THE REGRESSION, by name.
  PERFORM pg_temp.must_fail(format($f$
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
       jurisdiction_code, valid_until, authorisation_scope, lifecycle_state)
    VALUES (%L,'licence','SV','Bajskorv','Polismyndigheten','SE',
            DATE '2030-01-01','Skyddsobjekt A (fiktivt)','active')$f$, _h),
    'SP_CREDENTIAL_TITLE_CONTROLLED',
    '1.4 Skyddsvaktsförordnande cannot be renamed by its holder');

  -- Not only the appointments: the courses were writable too.
  PERFORM pg_temp.must_fail(format($f$
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
    VALUES (%L,'training','VU1','Min egen kurs','SE','active')$f$, _h),
    'SP_CREDENTIAL_TITLE_CONTROLLED',
    '1.5 nor can Väktarutbildning 1');

  -- A DRAFT is refused too. A draft holding a renamed authorisation has
  -- already recorded the wrong thing.
  PERFORM pg_temp.must_fail(format($f$
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
    VALUES (%L,'training','VU1','Bajskorv','SE','draft')$f$, _h),
    'SP_CREDENTIAL_TITLE_CONTROLLED',
    '1.6 and a draft is refused on the same rule');

  -- POSITIVE CONTROLS: both of the credential's real names are accepted, so
  -- the rule is "the definition's name", not "Swedish only".
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
  VALUES (_h,'training','VU1','Väktarutbildning 1 (VU1)','SE','active');
  PERFORM pg_temp.ok(true, '1.7 POSITIVE CONTROL the Swedish name is accepted');

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
  VALUES (_h,'training','VU2','Security Guard Training 2 (VU2)','SE','active');
  PERFORM pg_temp.ok(true, '1.8 POSITIVE CONTROL the English name is accepted');

END $$;

-- Seeding a legacy row the honest way: the trigger would refuse it, which is
-- the point. Disabled for exactly one statement so the "can it still be
-- edited" assertion has something to edit.
ALTER TABLE public.sp_claims DISABLE TRIGGER sp_claims_credential_rules_trg;
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
VALUES ('bf100000-0000-0000-0000-0000000000c9','bf100000-0000-0000-0000-000000000001',
        'training','VU1','Legacy fritext (fiktiv)','SE','active')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.sp_claims ENABLE TRIGGER sp_claims_credential_rules_trg;

DO $$
DECLARE _c uuid := 'bf100000-0000-0000-0000-0000000000c9';
BEGIN
  UPDATE public.sp_claims SET credential_reference = 'REF-123' WHERE id = _c;
  PERFORM pg_temp.ok(
    (SELECT credential_reference FROM public.sp_claims WHERE id = _c) = 'REF-123',
    '1.10 a legacy row with a free-text title is still editable in every other field');

  PERFORM pg_temp.must_fail(format($f$
    UPDATE public.sp_claims SET title = 'Något annat' WHERE id = %L$f$, _c),
    'SP_CREDENTIAL_TITLE_CONTROLLED',
    '1.11 but its title may only move TO the controlled one');

  UPDATE public.sp_claims SET title = 'Väktarutbildning 1 (VU1)' WHERE id = _c;
  PERFORM pg_temp.ok(true, '1.12 POSITIVE CONTROL correcting it to the real name is allowed');
END $$;


-- =============================================================================
\echo '    GROUP 2 -- a portable credential is not governed by a security market'
-- =============================================================================
--
-- THE DEFECT: the market-pack gate ran on EVERY claim carrying a jurisdiction.
-- A Körkort is sp_skill_types.driving_licence with requires_jurisdiction, so a
-- British driving licence was refused with SP_MARKET_PACK_NOT_ACTIVE — because
-- the UK SECURITY pack is unreviewed — and a UAE one was refused with
-- SP_SUB_JURISDICTION_REQUIRED, demanding an emirate for a federal licence.
DO $$
DECLARE _h uuid := 'bf100000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, skill_code, skill_level, title, jurisdiction_code, lifecycle_state)
  VALUES (_h,'practical_skill','driving_licence','B','Körkort','GB','active');
  PERFORM pg_temp.ok(true,
    '2.1 a British driving licence is recordable while the UK security pack is closed');

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, skill_code, skill_level, title, jurisdiction_code, lifecycle_state)
  VALUES (_h,'practical_skill','driving_licence','B','Körkort','AE','active');
  PERFORM pg_temp.ok(true,
    '2.2 and a UAE one needs no emirate, because a driving licence is federal');

  -- The gate is narrowed, not removed. A REGULATED credential in a closed
  -- market is refused exactly as before.
  PERFORM pg_temp.must_fail(format($f$
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
       jurisdiction_code, valid_until, lifecycle_state)
    VALUES (%L,'licence','UK_SIA_LICENCE_SG','SIA Licence — Security Guarding',
            'SIA','GB',DATE '2030-01-01','active')$f$, _h),
    'SP_MARKET_PACK_NOT_ACTIVE',
    '2.3 a UK regulated credential is still refused');

  PERFORM pg_temp.must_fail(format($f$
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
       jurisdiction_code, sub_jurisdiction_code, valid_until, lifecycle_state)
    VALUES (%L,'licence','AE_DU_SIRA_CARD_GUARD','SIRA card','SIRA','AE','AE-DU',
            DATE '2030-01-01','active')$f$, _h),
    'SP_MARKET_PACK_NOT_ACTIVE',
    '2.4 and so is a Dubai one');

  -- A regulated credential still cannot be filed in the wrong country, which
  -- is the claim the gate exists to refuse.
  PERFORM pg_temp.must_fail(format($f$
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
    VALUES (%L,'training','VU1','Väktarutbildning 1 (VU1)','GB','active')$f$, _h),
    'SP_MARKET_PACK_NOT_ACTIVE',
    '2.5 a Swedish credential cannot be filed as a British one');
END $$;


-- =============================================================================
\echo '    GROUP 3 -- changing work country changes nothing about a credential'
-- =============================================================================
--
-- The product model that must survive this release: WHERE THE HOLDER WORKS and
-- WHERE THE CREDENTIAL BELONGS are different facts, and only the first moves.
DO $$
DECLARE
  _h uuid := 'bf100000-0000-0000-0000-000000000001';
  _v uuid := 'bf100000-0000-0000-0000-000000000002';
  _c uuid;
  _r record;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code,
     assertion_level, lifecycle_state, verified_by_user_id, verified_at)
  VALUES (_h,'training','VU1','Väktarutbildning 1 (VU1)','SE',
          'verified','active',_v, now())
  RETURNING id INTO _c;

  -- Sweden -> Dubai.
  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-DU',
         work_location_confirmed_at = now()
   WHERE holder_user_id = _h;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _c;
  PERFORM pg_temp.ok(_r.jurisdiction_code = 'SE',
    '3.1 Sweden -> Dubai: the credential is still a Swedish credential');
  PERFORM pg_temp.ok(_r.lifecycle_state = 'active',
    '3.2 still active — not hidden, not archived');
  PERFORM pg_temp.ok(_r.assertion_level = 'verified' AND _r.verified_by_user_id = _v,
    '3.3 still verified, by the same verifier');

  -- Dubai -> United Kingdom -> back to Sweden.
  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'GB', sub_jurisdiction_code = NULL
   WHERE holder_user_id = _h;
  SELECT * INTO _r FROM public.sp_claims WHERE id = _c;
  PERFORM pg_temp.ok(
    _r.jurisdiction_code = 'SE' AND _r.assertion_level = 'verified'
      AND _r.lifecycle_state = 'active',
    '3.4 Dubai -> UK: unchanged again');

  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'SE', sub_jurisdiction_code = NULL
   WHERE holder_user_id = _h;
  SELECT * INTO _r FROM public.sp_claims WHERE id = _c;
  PERFORM pg_temp.ok(_r.jurisdiction_code = 'SE' AND _r.assertion_level = 'verified',
    '3.5 and back to Sweden: still the same credential it always was');

  -- Stating a work country grants no market, in either direction.
  PERFORM pg_temp.ok(
    NOT (SELECT is_active FROM public.sp_market_packs WHERE code = 'AE-DU'),
    '3.6 a Dubai-based holder did not activate the Dubai market');
END $$;


-- =============================================================================
\echo '    GROUP 4 -- a dispute reaches a human, and can be closed by one'
-- =============================================================================
--
-- THE DEFECT: sp_raise_dispute wrote a lifecycle state and an audit event;
-- sp_verifier_queue reads verification REQUESTS, of which a dispute creates
-- none. The two never met. The tester who reported an entry as incorrect and
-- then went looking for it in admin was right that it was not there — and
-- there was no route back to `active` either, because the lifecycle guard
-- requires the verification context and nothing set it.
DO $$
DECLARE
  _h uuid := 'bf100000-0000-0000-0000-000000000001';
  _v uuid := 'bf100000-0000-0000-0000-000000000002';
  _o uuid := 'bf100000-0000-0000-0000-000000000003';
  _c uuid;
  _q jsonb;
  _row jsonb;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
  VALUES (_h,'training','VU2','Väktarutbildning 2 (VU2)','SE','active')
  RETURNING id INTO _c;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_raise_dispute(_c, NULL, 'Datumet är fel (fiktivt testfall)');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _c) = 'disputed',
    '4.1 the holder''s report moves the entry to disputed');

  -- The queue is a capability, not a page.
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail('SELECT public.sp_dispute_queue()',
    'SP_NOT_VERIFIER', '4.2 a stranger cannot open the dispute queue');

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  _q := public.sp_dispute_queue();
  SELECT x INTO _row FROM jsonb_array_elements(_q) x WHERE x->>'subject_id' = _c::text;
  PERFORM pg_temp.ok(_row IS NOT NULL,
    '4.3 and a verifier finds the disputed entry there — the queue the tester could not find');
  PERFORM pg_temp.ok(_row->>'holder_name' = 'BF1 Holder',
    '4.4 with enough to process it: who holds it');
  PERFORM pg_temp.ok(_row->>'reason' = 'Datumet är fel (fiktivt testfall)',
    '4.5 and what they said was wrong');
  PERFORM pg_temp.ok(_row->>'disputed_at' IS NOT NULL, '4.6 and when they said it');
  -- A dispute is about a recorded fact. The holder's private commentary is not
  -- needed to decide one, and a bug fix does not get to widen a reviewer's read.
  PERFORM pg_temp.ok(NOT (_row ? 'holder_note'),
    '4.7 and NOT the holder''s private note');

  -- Refusals first, so a passing "it worked" cannot stand in for them.
  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_resolve_dispute(%L, NULL, ''restored'', NULL)', _c),
    'SP_NOT_VERIFIER', '4.8 a stranger cannot resolve a dispute');

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_resolve_dispute(%L, NULL, ''verified'', NULL)', _c),
    'SP_DISPUTE_OUTCOME_UNKNOWN',
    '4.9 and no verifier can invent a third outcome — verification is not down this path');

  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_resolve_dispute(%L, %L, ''restored'', NULL)', _c, _c),
    'SP_DISPUTE_TARGET_AMBIGUOUS', '4.10 exactly one subject, never two');

  -- Restored.
  PERFORM public.sp_resolve_dispute(_c, NULL, 'restored', 'Kontrollerat mot beslutet');
  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _c) = 'active',
    '4.11 "the entry is correct" returns it to active');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _c) = 'self_declared',
    '4.12 and resolving a dispute verified nothing');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_passport_events
             WHERE subject_id = _c AND event_type = 'dispute_resolved'
               AND detail->>'outcome' = 'restored' AND actor_user_id = _v),
    '4.13 with the decision, the outcome and the person recorded');

  -- Resolving something nobody disputed would invent a transition.
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_resolve_dispute(%L, NULL, ''withdrawn'', NULL)', _c),
    'SP_NOT_DISPUTED', '4.14 an undisputed entry cannot be "resolved" away');

  -- Withdrawn.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_raise_dispute(_c, NULL, 'Fortfarande fel (fiktivt)');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_resolve_dispute(_c, NULL, 'withdrawn', NULL);
  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _c) = 'withdrawn',
    '4.15 "the entry is not correct" takes it out of the active Passport');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_claims WHERE id = _c),
    '4.16 and deletes nothing');
END $$;

-- Nobody rules on their own dispute. A platform admin who reports their own
-- credential is a holder in that moment — the same bar sp_verifier_decide sets.
DO $$
DECLARE _v uuid := 'bf100000-0000-0000-0000-000000000002'; _c uuid;
BEGIN
  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
  VALUES (_v,'BF1 Verifier','SE') ON CONFLICT (holder_user_id) DO NOTHING;

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
  VALUES (_v,'training','VU1','Väktarutbildning 1 (VU1)','SE','active')
  RETURNING id INTO _c;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_raise_dispute(_c, NULL, 'Min egen uppgift (fiktiv)');
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_resolve_dispute(%L, NULL, ''restored'', NULL)', _c),
    'SP_SELF_REVIEW_FORBIDDEN',
    '4.17 a verifier cannot resolve a dispute about their own entry');
END $$;


-- =============================================================================
\echo '    GROUP 5 -- the holder can remove an entry without deleting it'
-- =============================================================================
--
-- THE DEFECT: sp_claims_self_update refuses every holder write to a verified
-- claim — correctly, because a holder must not edit one. The side effect was
-- that they could not archive one either, so "how do I remove this?" had no
-- answer for exactly the entries most likely to need one.
DO $$
DECLARE
  _h uuid := 'bf100000-0000-0000-0000-000000000001';
  _v uuid := 'bf100000-0000-0000-0000-000000000002';
  _o uuid := 'bf100000-0000-0000-0000-000000000003';
  _c uuid;
  _r record;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code,
     assertion_level, lifecycle_state, verified_by_user_id, verified_at)
  VALUES (_h,'training','VU2','Väktarutbildning 2 (VU2)','SE',
          'verified','active',_v, now())
  RETURNING id INTO _c;

  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.must_fail(format('SELECT public.sp_archive_claim(%L, NULL)', _c),
    'SP_NOT_HOLDER', '5.1 nobody can archive somebody else''s entry');

  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_archive_claim(_c, 'Gäller inte längre (fiktivt)');

  SELECT * INTO _r FROM public.sp_claims WHERE id = _c;
  PERFORM pg_temp.ok(_r.lifecycle_state = 'withdrawn',
    '5.2 a VERIFIED credential can be removed from the active Passport');
  PERFORM pg_temp.ok(_r.assertion_level = 'verified',
    '5.3 and the verification is not unmade by removing it');
  PERFORM pg_temp.ok(_r.verified_by_user_id = _v AND _r.verified_at IS NOT NULL,
    '5.4 the verifier and the date survive intact');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_passport_events
             WHERE subject_id = _c AND event_type = 'claim_withdrawn'
               AND detail->>'action' = 'archived_by_holder'
               AND detail->>'from_state' = 'active'),
    '5.5 with the holder''s own decision recorded as such');
END $$;

-- Archive is not dispute, and the database is where that stays true. Using
-- `disputed` as a delete button would fill a review queue with entries nobody
-- contests; archiving a disputed entry would end a review by removing its
-- subject.
DO $$
DECLARE _h uuid := 'bf100000-0000-0000-0000-000000000001'; _c uuid;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
  VALUES (_h,'training','VU1','Väktarutbildning 1 (VU1)','SE','active')
  RETURNING id INTO _c;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_raise_dispute(_c, NULL, 'Fel utfärdare (fiktivt)');
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(format('SELECT public.sp_archive_claim(%L, NULL)', _c),
    'SP_DISPUTED_CANNOT_ARCHIVE',
    '5.6 a disputed entry is resolved by a reviewer, never archived out from under one');
END $$;

-- And an open review is not something the holder may walk away from either.
DO $$
DECLARE _h uuid := 'bf100000-0000-0000-0000-000000000001'; _c uuid;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, jurisdiction_code, lifecycle_state)
  VALUES (_h,'training','VU2','Väktarutbildning 2 (VU2)','SE','active')
  RETURNING id INTO _c;

  INSERT INTO public.sp_verification_requests
    (holder_user_id, claim_id, request_kind, status)
  VALUES (_h, _c, 'cqrityjob_review', 'pending');

  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(format('SELECT public.sp_archive_claim(%L, NULL)', _c),
    'SP_REVIEW_IN_PROGRESS',
    '5.7 nor archived while a reviewer is relying on it');
END $$;


-- =============================================================================
\echo '    GROUP 6 -- what this release did NOT do'
-- =============================================================================
DO $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_market_packs
      WHERE code IN ('GB','AE-DU') AND is_active) = 0,
    '6.1 no market pack was activated');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_market_packs
      WHERE code IN ('GB','AE-DU') AND legal_review_state = 'pending') = 2,
    '6.2 and neither market''s legal review was quietly marked done');

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE market_pack_code IS NULL;
  PERFORM pg_temp.ok(_n = 0, '6.3 no credential was added outside a market pack');

  -- Every new function is a capability, granted to `authenticated` where the
  -- per-caller holder/verifier check lives, and to nobody else.
  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon', 'public.sp_dispute_queue()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.sp_resolve_dispute(uuid,uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.sp_archive_claim(uuid,text)', 'EXECUTE'),
    '6.4 anon can execute none of the three new functions');
  PERFORM pg_temp.ok(
    has_function_privilege('authenticated', 'public.sp_dispute_queue()', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.sp_resolve_dispute(uuid,uuid,text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.sp_archive_claim(uuid,text)', 'EXECUTE'),
    '6.5 and a signed-in caller can, because the checks are inside them');
END $$;

\echo '==> Security Passport pilot bug fix #1 -- done'
