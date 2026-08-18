-- =============================================================================
-- Security Passport — Phase 11 assertions: languages and practical skills
--
-- These were the last two visible areas with no storage behind them. They are
-- now `sp_claims` rows with a controlled vocabulary, which means the whole
-- point of this suite is to prove two things:
--
--   * the CONTROLLED part is real — a level off the scale, a type mismatch, a
--     missing jurisdiction or a language wearing a credential symbol are all
--     refused by the database, not merely by a form; and
--   * nothing about the existing trust machinery was bypassed to add them — a
--     language reaches VERIFIED only through `sp_verifier_decide`, and
--     correcting its level resets trust exactly as any material change does.
--
-- Asserted by MUTATION: the suite attempts the forbidden thing and fails if
-- the database allows it. Fictional identities use a `db` prefix.
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

\echo '==> Security Passport Phase 11'

INSERT INTO auth.users (id, email) VALUES
  ('db000000-0000-0000-0000-000000000001','p11-holder@example.test'),
  ('db000000-0000-0000-0000-000000000009','p11-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('db000000-0000-0000-0000-000000000001','Lina Lingvist (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('db000000-0000-0000-0000-000000000009','admin') ON CONFLICT DO NOTHING;


-- =============================================================================
\echo '    GROUP 1 -- the vocabulary exists and is read-only for the application'
-- =============================================================================
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.sp_skill_types WHERE claim_type = 'language';
  PERFORM pg_temp.ok(_n >= 15, '1.1 the launch language vocabulary is present');

  SELECT count(*) INTO _n FROM public.sp_skill_types WHERE claim_type = 'practical_skill';
  PERFORM pg_temp.ok(_n >= 5, '1.2 the launch practical-skill vocabulary is present');

  PERFORM pg_temp.ok(
    (SELECT level_scale FROM public.sp_skill_types WHERE code = 'lang_sv') = 'cefr',
    '1.3 a language is recorded on the CEFR scale');
  PERFORM pg_temp.ok(
    (SELECT requires_jurisdiction FROM public.sp_skill_types WHERE code = 'driving_licence'),
    '1.4 a driving licence must name where it was issued');

  -- The scale is DATA. Adding a licence type with its own categories must be
  -- an INSERT, never an edit to the trigger.
  PERFORM pg_temp.ok(
    (SELECT cardinality(allowed_levels) FROM public.sp_skill_types WHERE code = 'lift_licence') = 6,
    '1.4b a licence type carries its own categories as data');
  PERFORM pg_temp.ok(
    (SELECT cardinality(allowed_levels) FROM public.sp_skill_types WHERE code = 'first_aid_cpr') = 0,
    '1.4c a capability with no level says so with an empty array');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'sp_claims_skill_rules'
                   AND pg_get_functiondef(p.oid) ILIKE '%WHEN ''cefr''%'),
    '1.4d the rule function does not hardcode any scale');

  -- A vocabulary the application can write is not a controlled vocabulary.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                 WHERE table_name = 'sp_skill_types'
                   AND grantee IN ('anon','authenticated','service_role','PUBLIC')
                   AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
    '1.5 no application role may write the vocabulary');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                 WHERE table_name = 'sp_skill_types' AND grantee = 'anon'),
    '1.6 anon has no access to the vocabulary at all');
  PERFORM pg_temp.ok(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'sp_skill_types'),
    '1.7 RLS is enabled on the vocabulary');
END $$;


-- =============================================================================
\echo '    GROUP 2 -- a language stores, and stores honestly'
-- =============================================================================
DO $$
DECLARE _h uuid := 'db000000-0000-0000-0000-000000000001'; _r public.sp_claims%ROWTYPE;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
  VALUES (_h, 'language', 'Svenska', 'lang_sv', 'C2');
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE holder_user_id = _h AND skill_code = 'lang_sv';
  PERFORM pg_temp.ok(_r.assertion_level = 'self_declared',
    '2.1 a new language is self-declared, not verified');
  PERFORM pg_temp.ok(_r.lifecycle_state = 'active', '2.2 and active');
  PERFORM pg_temp.ok(_r.skill_level = 'C2', '2.3 the level is stored');
  PERFORM pg_temp.ok(_r.credential_code IS NULL,
    '2.4 a language carries no credential code, so it can wear no credential symbol');
END $$;


-- =============================================================================
\echo '    GROUP 3 -- the controlled part is enforced by the database'
-- =============================================================================
DO $$
DECLARE _h uuid := 'db000000-0000-0000-0000-000000000001';
BEGIN
  -- off the scale
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
       VALUES (%L,'language','Engelska','lang_en','flytande')$q$, _h),
    'SP_SKILL_LEVEL_INVALID', '3.1 a level that is not on the scale is refused');

  -- missing level where the scale requires one
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code)
       VALUES (%L,'language','Engelska','lang_en')$q$, _h),
    'SP_SKILL_LEVEL_REQUIRED', '3.2 a language without a level is refused');

  -- a level on a type that has none
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level, valid_until)
       VALUES (%L,'practical_skill','HLR','first_aid_cpr','B2',DATE '2027-01-01')$q$, _h),
    'SP_SKILL_LEVEL_NOT_APPLICABLE', '3.3 a level on a scaleless type is refused');

  -- no code at all
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title)
       VALUES (%L,'language','Klingonska')$q$, _h),
    'SP_SKILL_CODE_REQUIRED', '3.4 a free-text language is refused outright');

  -- unknown code
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
       VALUES (%L,'language','X','lang_zz','B2')$q$, _h),
    '', '3.5 an unknown code is refused by the foreign key');

  -- wrong claim_type for the code
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
       VALUES (%L,'practical_skill','Svenska','lang_sv','B2')$q$, _h),
    'SP_SKILL_CLAIM_TYPE_MISMATCH', '3.6 a language cannot be filed as a practical skill');

  -- A language wearing a credential symbol is refused twice over: the Phase 6
  -- credential trigger fires first and objects that OV is a licence, and the
  -- Phase 11 trigger would object that a skill is not a credential. The needle
  -- is left open because which guard speaks first is an ordering detail, while
  -- the refusal itself is the invariant.
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level, credential_code)
       VALUES (%L,'language','Svenska','lang_en','B2','OV')$q$, _h),
    '', '3.7 a language may not also carry a credential code');

  -- And the Phase 11 guard is proven directly, by reaching it with a
  -- credential code whose claim_type the first trigger accepts.
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level,
                                     credential_code, claimed_issuer_name, valid_until)
       VALUES (%L,'practical_skill','Körkort','driving_licence','B','OV','Polismyndigheten',DATE '2030-01-01')$q$, _h),
    '', '3.7b the skill guard also refuses the combination on its own path');

  -- jurisdiction and expiry requirements
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
       VALUES (%L,'practical_skill','Körkort','driving_licence','B')$q$, _h),
    'SP_SKILL_REQUIRES_JURISDICTION', '3.8 a driving licence must say where it was issued');

  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code)
       VALUES (%L,'practical_skill','HLR','first_aid_cpr')$q$, _h),
    'SP_SKILL_REQUIRES_VALID_UNTIL', '3.9 a lapsing certificate must carry an end date');

  -- a level with no type at all
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_level)
       VALUES (%L,'training','Kurs','B2')$q$, _h),
    'SP_SKILL_LEVEL_WITHOUT_CODE', '3.10 a level without a type is refused');

  -- a draft may be half-finished, exactly as Phase 6 allows for credentials
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level,
                                lifecycle_state)
  VALUES (_h, 'practical_skill', 'Körkort', 'driving_licence', 'B', 'draft');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = _h AND skill_code = 'driving_licence' AND lifecycle_state = 'draft') = 1,
    '3.11 a draft licence may be saved before its jurisdiction is known');
END $$;


-- =============================================================================
\echo '    GROUP 4 -- a language reaches verified only through the real workflow'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'db000000-0000-0000-0000-000000000001';
  _v uuid := 'db000000-0000-0000-0000-000000000009';
  _claim uuid; _req uuid; _r public.sp_claims%ROWTYPE;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND skill_code = 'lang_sv' AND lifecycle_state = 'active';

  -- the holder cannot simply write the trust field
  PERFORM pg_temp.must_fail(format(
    $q$UPDATE public.sp_claims SET assertion_level = 'verified' WHERE id = %L$q$, _claim),
    'SP_TRUST_FIELD_IMMUTABLE', '4.1 a holder cannot declare their own language verified');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  _req := public.sp_submit_for_verification(_claim, NULL, 'cqrityjob_review', NULL);
  RESET ROLE;

  -- and cannot decide their own request
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L::uuid,'approved','document_review',NULL,NULL,NULL,NULL)$q$,
    _req), 'SP_SELF_VERIFICATION_FORBIDDEN',
    '4.2 the holder cannot approve their own language');

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'checked the certificate', 'approved', NULL, NULL);

  SELECT * INTO _r FROM public.sp_claims WHERE id = _claim;
  PERFORM pg_temp.ok(_r.assertion_level = 'verified', '4.3 a reviewer can verify a language');
  PERFORM pg_temp.ok(_r.verified_by_user_id = _v AND _r.verified_at IS NOT NULL,
    '4.4 and the verification is attributed');
  PERFORM pg_temp.ok(_r.skill_level = 'C2', '4.5 verification did not disturb the level');
  PERFORM pg_temp.ok(
    (SELECT event_type FROM public.sp_passport_events
      WHERE subject_id = _claim AND actor_user_id = _v) = 'verification_decided',
    '4.6 the decision is filed as a verification, not a correction');
END $$;


-- =============================================================================
\echo '    GROUP 5 -- correcting the level resets the trust that was checked'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'db000000-0000-0000-0000-000000000001';
  _claim uuid; _v2 uuid; _v3 uuid; _r public.sp_claims%ROWTYPE;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _h AND skill_code = 'lang_sv' AND lifecycle_state = 'active';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- note-only correction: the level is unchanged, so a real review survives
  -- Named notation throughout: the signature now carries two trailing skill
  -- parameters, and positional calls would silently bind the wrong one.
  _v2 := public.sp_correct_claim(
    _claim_id => _claim, _title => 'Svenska', _claimed_issuer_name => NULL,
    _jurisdiction_code => NULL, _issued_on => NULL, _valid_from => NULL,
    _valid_until => NULL, _reason => 'typo in the note',
    _credential_code => NULL, _credential_reference => NULL,
    _holder_note => 'ny anteckning',
    _skill_code => 'lang_sv', _skill_level => 'C2');
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _v2;
  PERFORM pg_temp.ok(_r.assertion_level = 'verified',
    '5.1 a note-only correction keeps a verification that is still true');
  PERFORM pg_temp.ok(_r.skill_code = 'lang_sv',
    '5.2 the corrected version keeps its language — the code is not a parameter');
  PERFORM pg_temp.ok(_r.skill_level = 'C2', '5.3 and keeps its level');
  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _claim) = 'superseded',
    '5.4 the previous version is superseded, not edited');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- changing the level IS material: B1 is not what anybody reviewed
  _v3 := public.sp_correct_claim(
    _claim_id => _v2, _title => 'Svenska', _claimed_issuer_name => NULL,
    _jurisdiction_code => NULL, _issued_on => NULL, _valid_from => NULL,
    _valid_until => NULL, _reason => 'level was wrong',
    _credential_code => NULL, _credential_reference => NULL,
    _holder_note => 'ny anteckning',
    _skill_code => 'lang_sv', _skill_level => 'B1');
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _v3;
  PERFORM pg_temp.ok(_r.assertion_level = 'self_declared',
    '5.5 correcting the level resets trust to self-declared');
  PERFORM pg_temp.ok(_r.verified_by_user_id IS NULL AND _r.verified_at IS NULL,
    '5.6 and drops the stale verifier attribution');
  PERFORM pg_temp.ok(_r.skill_level = 'B1', '5.7 the new level is stored');
  PERFORM pg_temp.ok(_r.version_no = 3, '5.8 the version history keeps counting');

  PERFORM pg_temp.ok(
    (SELECT detail->>'verification_reset' FROM public.sp_passport_events
      WHERE subject_id = _v3 AND event_type = 'claim_corrected') = 'true',
    '5.9 the audit event records that the reset happened');
END $$;


-- =============================================================================
\echo '    GROUP 6 -- a wrongly chosen type can be corrected, not escaped from'
-- =============================================================================
-- Picking the wrong row from a nineteen-item list is an ordinary mistake. A
-- holder whose only way out is deleting an entry that already carries evidence
-- or a review would be stuck with a false statement on their Passport.
DO $$
DECLARE
  _h uuid := 'db000000-0000-0000-0000-000000000001';
  _wrong uuid; _fixed uuid; _r public.sp_claims%ROWTYPE;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
  VALUES (_h, 'language', 'Arabiska', 'lang_ar', 'B2')
  RETURNING id INTO _wrong;

  -- meant Persian, picked Arabic
  _fixed := public.sp_correct_claim(
    _claim_id => _wrong, _title => 'Persiska', _claimed_issuer_name => NULL,
    _jurisdiction_code => NULL, _issued_on => NULL, _valid_from => NULL,
    _valid_until => NULL, _reason => 'valde fel språk',
    _credential_code => NULL, _credential_reference => NULL, _holder_note => NULL,
    _skill_code => 'lang_fa', _skill_level => 'B2');
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _fixed;
  PERFORM pg_temp.ok(_r.skill_code = 'lang_fa', '6.1 the corrected version carries the new type');
  PERFORM pg_temp.ok(_r.assertion_level = 'self_declared',
    '6.2 changing the type resets trust — nobody reviewed the new language');
  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _wrong) = 'superseded',
    '6.3 the mistaken version is superseded, not erased');
  PERFORM pg_temp.ok(
    (SELECT detail->>'previous_skill_code' FROM public.sp_passport_events
      WHERE subject_id = _fixed AND event_type = 'claim_corrected') = 'lang_ar',
    '6.4 the audit trail records what it used to be');

  -- but a language still cannot become a driving licence
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_correct_claim(
         _claim_id => %L::uuid, _title => 'Körkort', _claimed_issuer_name => NULL,
         _jurisdiction_code => 'SE', _issued_on => NULL, _valid_from => NULL,
         _valid_until => NULL, _reason => 'x', _credential_code => NULL,
         _credential_reference => NULL, _holder_note => NULL,
         _skill_code => 'driving_licence', _skill_level => 'B')$q$, _fixed),
    'SP_SKILL_CLAIM_TYPE_MISMATCH',
    '6.5 a correction cannot turn a language into a practical skill');
  RESET ROLE;
END $$;


-- =============================================================================
\echo '    GROUP 6b -- the taxonomy extends by data alone'
-- =============================================================================
DO $$
DECLARE _h uuid := 'db000000-0000-0000-0000-000000000001'; _id uuid;
BEGIN
  -- A capability nobody wrote code for, inserted as pure data.
  INSERT INTO public.sp_skill_types
    (code, claim_type, name_sv, name_en, level_scale, allowed_levels,
     requires_jurisdiction, requires_valid_until, sort_order)
  VALUES ('p11_probe_licence', 'practical_skill', 'Provbehörighet (fiktiv)',
          'Probe licence (fictional)', 'category', ARRAY['X1','X2'], false, false, 900);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
  VALUES (_h, 'practical_skill', 'Provbehörighet', 'p11_probe_licence', 'X2')
  RETURNING id INTO _id;
  RESET ROLE;

  PERFORM pg_temp.ok(_id IS NOT NULL,
    '6b.1 a licence type nobody wrote code for is usable immediately');

  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_claims (holder_user_id, claim_type, title, skill_code, skill_level)
       VALUES (%L,'practical_skill','Provbehörighet','p11_probe_licence','X9')$q$, _h),
    'SP_SKILL_LEVEL_INVALID',
    '6b.2 and its categories are enforced without touching the trigger');

  DELETE FROM public.sp_claims WHERE id = _id;
  DELETE FROM public.sp_skill_types WHERE code = 'p11_probe_licence';
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_skill_types WHERE code = 'p11_probe_licence'),
    '6b.3 the probe vocabulary row is removed again');
END $$;


-- =============================================================================
\echo '    GROUP 7 -- cleanup'
-- =============================================================================
DO $$
DECLARE _ids uuid[] := ARRAY[
  'db000000-0000-0000-0000-000000000001',
  'db000000-0000-0000-0000-000000000009']::uuid[];
  _left int;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM auth.users WHERE id = ANY(_ids);
  DELETE FROM public.sp_passport_events        WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_verification_decisions WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_verification_requests  WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_claims                 WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_passport_profiles      WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.user_roles                WHERE user_id = ANY(_ids);

  SELECT (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = ANY(_ids))
       + (SELECT count(*) FROM auth.users WHERE id = ANY(_ids))
    INTO _left;
  PERFORM pg_temp.ok(_left = 0, '7.1 every fictional Phase 11 record is gone');
END $$;

\echo '==> Security Passport Phase 11 OK'
