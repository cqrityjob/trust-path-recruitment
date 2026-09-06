-- =============================================================================
-- Security Passport — the first merit, committed once or not at all
--
-- Everything in 20261031090000_sp_passport_first_merit.sql that can be shown
-- from ONE session. The part that cannot -- two identical requests genuinely
-- in flight at the same moment -- lives in
-- security_passport_first_merit_race_test.sql, driven by two psql processes
-- from scripts/db-test.sh, because a sequential test of a race passes
-- identically against the broken code and the fixed code.
--
-- Asserted by MUTATION wherever a rule is a refusal: the suite attempts the
-- forbidden thing and fails if the database allows it.
--
-- Every identity is transparently fictional and uses an `fd` prefix.
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
    RAISE NOTICE 'ok  % (refused: %)', label, left(_msg, 90);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- SUCCEEDED but must be refused', label;
END $$;

/** Run one statement as the holder, the way PostgREST would. */
CREATE OR REPLACE FUNCTION pg_temp.as_holder(who uuid, stmt text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', who::text, true);
  EXECUTE stmt;
END $$;

\echo '==> Security Passport first merit'

-- fd...01  the ordinary new holder
-- fd...02  a holder who reaches the flow with a LEGACY completed profile
-- fd...03  a holder used for the declaration refusals
-- fd...04  a holder used for the five merit kinds
-- fd...05  a second holder, for the cross-holder operation-id refusal
INSERT INTO auth.users (id, email) VALUES
  ('fd000000-0000-0000-0000-000000000001', 'fm-new@example.test'),
  ('fd000000-0000-0000-0000-000000000002', 'fm-legacy@example.test'),
  ('fd000000-0000-0000-0000-000000000003', 'fm-nodecl@example.test'),
  ('fd000000-0000-0000-0000-000000000004', 'fm-kinds@example.test'),
  ('fd000000-0000-0000-0000-000000000005', 'fm-other@example.test')
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- GROUP 1 — the operation is atomic and creates the Passport it needs
-- =============================================================================
\echo 'GROUP 1 — one call, one Passport, one merit, one declaration'

DO $$
DECLARE
  _h   uuid := 'fd000000-0000-0000-0000-000000000001';
  _op  uuid := 'fa000000-0000-0000-0000-0000000000a1';
  _k   text; _sid uuid; _c boolean;
BEGIN
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _h),
    '1.0 the holder starts with no Passport at all');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_kind, subject_id, created INTO _k, _sid, _c
    FROM public.sp_passport_complete_first_merit(
      _op, 'employment', 'Security Officer', 'Northgate Security Ltd (fiktiv)', 'GB',
      DATE '2024-03-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(_k = 'experience' AND _sid IS NOT NULL AND _c,
    '1.1 an employment first merit returns a fresh experience subject');

  -- The Passport did not exist a moment ago. One call created it, recorded
  -- its creation and completed onboarding -- which is what makes the whole
  -- thing a single decision by the holder rather than four.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_passport_profiles
             WHERE holder_user_id = _h AND onboarding_state = 'completed'
               AND declared_accurate_at IS NOT NULL),
    '1.2 the Passport was created and onboarding is completed with a declaration');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'passport_created') = 1,
    '1.3 exactly one passport_created event');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'experience_created'
        AND subject_id = _sid AND detail ->> 'operation_id' = _op::text) = 1,
    '1.4 the creation event names the subject AND the operation');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h
        AND event_type IN ('declaration_recorded', 'onboarding_completed')) = 2,
    '1.5 exactly one declaration event and one completion event');
END $$;

-- ── THE MERIT IS SELF-DECLARED, ACTIVE AND ATTRIBUTED TO NOBODY ─────────
--
-- The single most important property in this file. A product that can create
-- a merit can create a verified merit unless something stops it, and the
-- thing that stops it is that this function never names a trust column at
-- all -- so the row takes the defaults and the defaults are these.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000001'; _r record;
BEGIN
  SELECT * INTO _r FROM public.sp_experience_periods WHERE holder_user_id = _h;

  PERFORM pg_temp.ok(_r.assertion_level = 'self_declared',
    '1.6 the first merit is self_declared');
  PERFORM pg_temp.ok(_r.lifecycle_state = 'active',
    '1.7 the first merit is active');
  -- An employment period carries its verifier in the decision record rather
  -- than on the row, so the absence is asserted where it lives: no request,
  -- no decision, nobody named. (A claim's own verified_* columns are asserted
  -- in group 5.)
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_verification_requests WHERE holder_user_id = _h),
    '1.8 no verification was requested for it, and none was recorded');
  -- GB, not SE. The column's own DEFAULT is 'SE', so asserting a country the
  -- holder actually chose is the only way this can fail when a default creeps
  -- back in.
  PERFORM pg_temp.ok(_r.jurisdiction_code = 'GB',
    '1.9 the country is the one the holder stated, not the column default');
  PERFORM pg_temp.ok(
    _r.employer_name = 'Northgate Security Ltd (fiktiv)' AND _r.role_title = 'Security Officer',
    '1.10 the employer and role are stored as given');
  PERFORM pg_temp.ok(_r.ended_on IS NULL,
    '1.11 an ongoing employment has no end date');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_verification_decisions WHERE holder_user_id = _h),
    '1.12 the operation recorded no verification decision of any kind');
END $$;


-- =============================================================================
-- GROUP 2 — idempotency: the same operation id yields the same merit
-- =============================================================================
\echo 'GROUP 2 — a retry returns the merit that already exists'

DO $$
DECLARE
  _h uuid := 'fd000000-0000-0000-0000-000000000001';
  _op uuid := 'fa000000-0000-0000-0000-0000000000a1';
  _first uuid; _k text; _sid uuid; _c boolean;
BEGIN
  SELECT id INTO _first FROM public.sp_experience_periods WHERE holder_user_id = _h;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- Deliberately DIFFERENT values on the retry. A retry is the same
  -- OPERATION, not the same payload: what makes it idempotent is the key,
  -- and a second merit must not appear because somebody edited a field
  -- between two attempts at one submission.
  SELECT subject_kind, subject_id, created INTO _k, _sid, _c
    FROM public.sp_passport_complete_first_merit(
      _op, 'employment', 'Ordningsvakt', 'Annat Bolag (fiktiv)', 'GB',
      DATE '2020-01-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(_sid = _first AND _k = 'experience',
    '2.1 the retry returns the SAME merit id');
  PERFORM pg_temp.ok(_c = false,
    '2.2 and reports that it created nothing');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_experience_periods WHERE holder_user_id = _h) = 1,
    '2.3 there is still exactly one employment period');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'experience_created') = 1,
    '2.4 and exactly one creation event');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'onboarding_completed') = 1,
    '2.5 the append-only log did not gain a second completion');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'declaration_recorded') = 1,
    '2.6 nor a second declaration');
END $$;

-- The index is what makes 2.4-2.6 a property of the database rather than of
-- the branch that happened to run. Proved by attempting the duplicate
-- directly, as service_role, which bypasses every application path.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM pg_temp.must_fail(
    format($f$INSERT INTO public.sp_passport_events
       (holder_user_id, actor_user_id, event_type, subject_type, detail)
     VALUES (%L, %L, 'onboarding_completed', 'profile',
             jsonb_build_object('operation_id', 'fa000000-0000-0000-0000-0000000000a1'))$f$,
     _h, _h),
    'sp_events_one_per_operation',
    '2.7 a second completion event for one operation is refused by the index');

  -- And an event with NO operation id is untouched by it: the index is
  -- partial precisely so that ordinary history keeps working.
  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, detail)
  VALUES (_h, _h, 'privacy_changed', 'profile', '{}'::jsonb),
         (_h, _h, 'privacy_changed', 'profile', '{}'::jsonb);
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'privacy_changed') = 2,
    '2.8 events carrying no operation id repeat freely');
END $$;


-- =============================================================================
-- GROUP 3 — the declaration, and what a refusal must leave behind
-- =============================================================================
\echo 'GROUP 3 — no declaration, no completion, and nothing written'

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000003';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000b1'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', DATE '2024-01-01', NULL, false)$f$,
    'SP_DECLARATION_REQUIRED',
    '3.1 completion without an explicit declaration is refused');

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000b2'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', DATE '2024-01-01', NULL, NULL)$f$,
    'SP_DECLARATION_REQUIRED',
    '3.2 and so is a null declaration -- absent is not consent');
  RESET ROLE;

  -- THE POINT OF THE WHOLE MIGRATION. A refused completion is not a partial
  -- one: no Passport, no merit, no event, no declaration.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _h),
    '3.3 the refusal created no Passport profile');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_experience_periods WHERE holder_user_id = _h)
    AND NOT EXISTS (SELECT 1 FROM public.sp_claims WHERE holder_user_id = _h),
    '3.4 the refusal created no merit');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_events WHERE holder_user_id = _h),
    '3.5 the refusal created no audit event');
END $$;


-- =============================================================================
-- GROUP 4 — required values, checked on the server
-- =============================================================================
\echo 'GROUP 4 — the server decides what is complete, not the browser'

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000003'; _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000c1'::uuid, 'employment', '   ',
        'Bolag (fiktiv)', 'SE', DATE '2024-01-01', NULL, true)$f$,
    'SP_TITLE_REQUIRED', '4.1 a blank title is refused');

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000c2'::uuid, 'employment', 'Väktare',
        '', 'SE', DATE '2024-01-01', NULL, true)$f$,
    'SP_ORGANISATION_REQUIRED', '4.2 a blank employer is refused');

  -- No default country. Ever. This is the defect that stamped a country onto
  -- the employment record of a holder who had never named one.
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000c3'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', NULL, DATE '2024-01-01', NULL, true)$f$,
    'SP_WORK_COUNTRY_REQUIRED',
    '4.3 an employment with no stated country is refused, not defaulted');

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000c4'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', NULL, NULL, true)$f$,
    'SP_START_DATE_REQUIRED', '4.4 an employment with no start date is refused');

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000c5'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', DATE '2024-01-01', DATE '2023-01-01', true)$f$,
    'SP_PERIOD_END_BEFORE_START', '4.5 an end before the start is refused');

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000c6'::uuid, 'something_else', 'X',
        'Y', 'SE', DATE '2024-01-01', NULL, true)$f$,
    'SP_MERIT_KIND_UNKNOWN', '4.6 an unknown merit kind is refused');

  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        NULL::uuid, 'employment', 'Väktare', 'Bolag (fiktiv)', 'SE',
        DATE '2024-01-01', NULL, true)$f$,
    'SP_OPERATION_ID_REQUIRED', '4.7 a completion with no operation id is refused');

  PERFORM pg_temp.must_fail(
    format($f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000c7'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', %L::date, NULL, true)$f$, current_date + 30),
    'SP_START_DATE_IN_FUTURE', '4.8 a start date in the future is refused');
  RESET ROLE;

  SELECT count(*) INTO _n FROM public.sp_passport_events WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, '4.9 eight refusals left nothing behind at all');
END $$;

-- Not authenticated at all. The function derives the holder from auth.uid()
-- and takes no holder parameter, so there is no argument that could write
-- into somebody else's Passport -- but a caller with no subject must still be
-- refused rather than writing a row owned by nobody.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000d1'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', DATE '2024-01-01', NULL, true)$f$,
    'SP_NOT_AUTHENTICATED', '4.10 an unauthenticated caller is refused');
END $$;


-- =============================================================================
-- GROUP 5 — all five merit kinds, and none of them files a market claim
-- =============================================================================
\echo 'GROUP 5 — employment, education, course, certification, licence'

DO $$
DECLARE
  _h uuid := 'fd000000-0000-0000-0000-000000000004';
  _kinds text[] := ARRAY['education', 'course', 'certification', 'licence'];
  _expected text[] := ARRAY['education', 'training', 'certification', 'licence'];
  _i int; _k text; _sid uuid; _c boolean; _op uuid;
BEGIN
  FOR _i IN 1 .. array_length(_kinds, 1) LOOP
    _op := ('fb000000-0000-0000-0000-00000000000' || _i)::uuid;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', _h::text, true);
    SELECT subject_kind, subject_id, created INTO _k, _sid, _c
      FROM public.sp_passport_complete_first_merit(
        _op, _kinds[_i], 'Merit ' || _kinds[_i], 'Utfärdare (fiktiv)', NULL,
        DATE '2023-05-01', NULL, true);
    RESET ROLE;

    PERFORM pg_temp.ok(_k = 'claim' AND _sid IS NOT NULL AND _c,
      format('5.%s %s can be the first merit', _i, _kinds[_i]));

    PERFORM pg_temp.ok(
      (SELECT claim_type FROM public.sp_claims WHERE id = _sid) = _expected[_i],
      format('5.%s.1 %s is stored as claim_type %s', _i, _kinds[_i], _expected[_i]));

    PERFORM pg_temp.ok(
      (SELECT assertion_level = 'self_declared' AND lifecycle_state = 'active'
              AND verified_by_user_id IS NULL AND verified_at IS NULL
         FROM public.sp_claims WHERE id = _sid),
      format('5.%s.2 %s is self_declared, active and verified by nobody', _i, _kinds[_i]));

    -- A course certificate is not an authorisation in a market. Neither a
    -- country nor a taxonomy code may be invented for it.
    PERFORM pg_temp.ok(
      (SELECT jurisdiction_code IS NULL AND credential_code IS NULL
         FROM public.sp_claims WHERE id = _sid),
      format('5.%s.3 %s files no country and no credential code', _i, _kinds[_i]));
  END LOOP;

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = _h) = 4,
    '5.5 four distinct operations produced four distinct claims');

  -- Even a country the caller supplies is not recorded for a non-employment
  -- merit. The parameter exists for employment and is ignored elsewhere,
  -- which is stronger than trusting a caller to omit it.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_id INTO _sid FROM public.sp_passport_complete_first_merit(
    'fb000000-0000-0000-0000-0000000000ff'::uuid, 'certification', 'Med land',
    'Utfärdare (fiktiv)', 'SE', DATE '2023-05-01', NULL, true);
  RESET ROLE;
  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code IS NULL FROM public.sp_claims WHERE id = _sid),
    '5.6 a country given for a claim kind is ignored, not filed');
END $$;


-- =============================================================================
-- GROUP 6 — the legacy completed profile with no merit
-- =============================================================================
\echo 'GROUP 6 — a profile that says completed but holds nothing'

DO $$
DECLARE
  _h uuid := 'fd000000-0000-0000-0000-000000000002';
  _declared timestamptz; _k text; _sid uuid; _c boolean;
BEGIN
  -- The shape the old wizard could leave behind: onboarding closed, a
  -- declaration recorded, and not one merit to show for it.
  INSERT INTO public.sp_passport_profiles
    (holder_user_id, onboarding_state, declared_accurate_at)
  VALUES (_h, 'completed', TIMESTAMPTZ '2025-01-01 09:00:00+00');

  SELECT declared_accurate_at INTO _declared
    FROM public.sp_passport_profiles WHERE holder_user_id = _h;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_kind, subject_id, created INTO _k, _sid, _c
    FROM public.sp_passport_complete_first_merit(
      'fc000000-0000-0000-0000-000000000001'::uuid, 'course', 'Väktarutbildning VU1',
      'Utbildare (fiktiv)', NULL, DATE '2022-09-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(_c AND _sid IS NOT NULL,
    '6.1 a legacy completed profile can still record its first merit');
  PERFORM pg_temp.ok(
    (SELECT declared_accurate_at FROM public.sp_passport_profiles WHERE holder_user_id = _h)
      = _declared,
    '6.2 the ORIGINAL declaration timestamp is kept, not restated');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'passport_created') = 0,
    '6.3 an existing Passport is not created a second time');
END $$;


-- =============================================================================
-- GROUP 7 — an operation id belongs to the holder who used it
-- =============================================================================
\echo 'GROUP 7 — an operation id belongs to the holder who used it'

DO $$
DECLARE _other uuid := 'fd000000-0000-0000-0000-000000000005';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);

  -- 'fa...a1' is holder ...01's completed operation. Replaying it must not
  -- return that holder's subject id, and must not silently succeed either.
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000a1'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', DATE '2024-01-01', NULL, true)$f$,
    'SP_OPERATION_ID_CONFLICT',
    '7.1 replaying another holder''s operation id is refused');
  RESET ROLE;

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_experience_periods WHERE holder_user_id = _other),
    '7.2 and it left no merit behind for the caller');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_experience_periods
      WHERE holder_user_id = 'fd000000-0000-0000-0000-000000000001') = 1,
    '7.3 nor changed anything for the holder who owns the operation');
END $$;


-- =============================================================================
-- GROUP 8 — the function's own standing
-- =============================================================================
\echo 'GROUP 8 — grants, search_path and what the body may not say'

DO $$
DECLARE _src text; _def text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO _src, _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_passport_complete_first_merit';

  PERFORM pg_temp.ok(_def LIKE '%SECURITY DEFINER%' AND _def LIKE '%search_path%',
    '8.1 SECURITY DEFINER with a pinned search_path');

  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon',
      'public.sp_passport_complete_first_merit(uuid,text,text,text,text,date,date,boolean)',
      'EXECUTE'),
    '8.2 anon cannot execute it');

  PERFORM pg_temp.ok(
    has_function_privilege('authenticated',
      'public.sp_passport_complete_first_merit(uuid,text,text,text,text,date,date,boolean)',
      'EXECUTE'),
    '8.3 authenticated can');

  -- The body cannot raise trust, because it cannot NAME trust.
  PERFORM pg_temp.ok(
    _src NOT LIKE '%assertion_level%' AND _src NOT LIKE '%lifecycle_state%'
    AND _src NOT LIKE '%verified_by_user_id%' AND _src NOT LIKE '%verified_at%',
    '8.4 the body names no trust column, so the merit takes the defaults');

  PERFORM pg_temp.ok(
    (SELECT indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%operation_id%'
       FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'sp_events_one_per_operation'),
    '8.5 the one-event-per-operation index is unique and keyed on the operation');
END $$;




-- =============================================================================
-- GROUP 9 — negative controls: take the guard away and the defect comes back
-- =============================================================================
-- A green suite proves the assertions ran. It does not prove they would go
-- red. These two blocks remove the protection, show the forbidden thing
-- succeeding, and ROLL BACK -- so the file itself demonstrates that groups 2
-- and 3 are load-bearing rather than tautologies.
\echo 'GROUP 9 — negative controls'

BEGIN;
DROP INDEX public.sp_events_one_per_operation;
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, detail)
  VALUES (_h, _h, 'onboarding_completed', 'profile',
          jsonb_build_object('operation_id', 'fa000000-0000-0000-0000-0000000000a1'));

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'onboarding_completed') = 2,
    '9.1 NEGATIVE CONTROL: without the index, one operation gains a second completion');
END $$;
ROLLBACK;

DO $$
BEGIN
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
             AND indexname = 'sp_events_one_per_operation'),
    '9.2 the index is back after the control');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = 'fd000000-0000-0000-0000-000000000001'
        AND event_type = 'onboarding_completed') = 1,
    '9.3 and so is the single completion event');
END $$;

-- The declaration check, second control. The function is replaced with one
-- whose only difference is the missing refusal; a completion with declared =
-- false then goes through and writes a merit and a declaration timestamp,
-- which is precisely the defect 20261031090000 exists to close.
BEGIN;
CREATE OR REPLACE FUNCTION public.sp_passport_complete_first_merit(
  _operation_id uuid, _merit_kind text, _title text, _organisation text,
  _country text, _started_on date, _ended_on date, _declared boolean)
RETURNS TABLE (subject_kind text, subject_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $ctl$
DECLARE _uid uuid := auth.uid(); _sid uuid;
BEGIN
  INSERT INTO public.sp_passport_profiles (holder_user_id) VALUES (_uid)
  ON CONFLICT (holder_user_id) DO NOTHING;
  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, jurisdiction_code, started_on)
  VALUES (_uid, _organisation, _title, _country, _started_on) RETURNING id INTO _sid;
  UPDATE public.sp_passport_profiles
     SET onboarding_state = 'completed', declared_accurate_at = now()
   WHERE holder_user_id = _uid;
  RETURN QUERY SELECT 'experience'::text, _sid, true;
END $ctl$;

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000003'; _sid uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_id INTO _sid FROM public.sp_passport_complete_first_merit(
    'fa000000-0000-0000-0000-0000000000e1'::uuid, 'employment', 'Väktare',
    'Bolag (fiktiv)', 'SE', DATE '2024-01-01', NULL, false);
  RESET ROLE;

  PERFORM pg_temp.ok(
    _sid IS NOT NULL
    AND (SELECT declared_accurate_at IS NOT NULL FROM public.sp_passport_profiles
          WHERE holder_user_id = _h),
    '9.4 NEGATIVE CONTROL: without the refusal, declared=false still records a declaration');
END $$;
ROLLBACK;

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000003';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000e2'::uuid, 'employment', 'Väktare',
        'Bolag (fiktiv)', 'SE', DATE '2024-01-01', NULL, false)$f$,
    'SP_DECLARATION_REQUIRED',
    '9.5 the real function is back and refuses again');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _h),
    '9.6 and the control left no Passport behind');
END $$;

\echo '==> Security Passport first merit: complete'
