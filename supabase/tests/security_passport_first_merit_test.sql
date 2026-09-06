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
-- fd...06  the forged-audit-event holder
-- fd...07  a holder used for the fingerprint and second-first-merit refusals
-- fd...08  a legacy profile with no creation receipt, for the repair path
-- fd...09  a holder used for ordered draft persistence
INSERT INTO auth.users (id, email) VALUES
  ('fd000000-0000-0000-0000-000000000001', 'fm-new@example.test'),
  ('fd000000-0000-0000-0000-000000000002', 'fm-legacy@example.test'),
  ('fd000000-0000-0000-0000-000000000003', 'fm-nodecl@example.test'),
  ('fd000000-0000-0000-0000-000000000004', 'fm-kinds@example.test'),
  ('fd000000-0000-0000-0000-000000000005', 'fm-other@example.test'),
  ('fd000000-0000-0000-0000-000000000006', 'fm-forger@example.test'),
  ('fd000000-0000-0000-0000-000000000007', 'fm-second@example.test'),
  ('fd000000-0000-0000-0000-000000000008', 'fm-norecept@example.test'),
  ('fd000000-0000-0000-0000-000000000009', 'fm-draft@example.test')
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
-- GROUP 2 — idempotency rests on a record no client can write
-- =============================================================================
\echo 'GROUP 2 — a retry returns the merit that already exists'

DO $$
DECLARE
  _h uuid := 'fd000000-0000-0000-0000-000000000001';
  _op uuid := 'fa000000-0000-0000-0000-0000000000a1';
  _first uuid; _k text; _sid uuid; _c boolean; _declared timestamptz;
BEGIN
  SELECT id INTO _first FROM public.sp_experience_periods WHERE holder_user_id = _h;
  SELECT declared_accurate_at INTO _declared
    FROM public.sp_passport_profiles WHERE holder_user_id = _h;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- The SAME facts. A retry is the same submission arriving twice, which is
  -- what an operation id is for.
  SELECT subject_kind, subject_id, created INTO _k, _sid, _c
    FROM public.sp_passport_complete_first_merit(
      _op, 'employment', 'Security Officer', 'Northgate Security Ltd (fiktiv)', 'GB',
      DATE '2024-03-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(_sid = _first AND _k = 'experience',
    '2.1 the retry returns the SAME merit id');
  PERFORM pg_temp.ok(_c = false, '2.2 and reports that it created nothing');
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
  -- Defect 9. A replay is not a new act, so it must not restate WHEN the
  -- holder affirmed their record.
  PERFORM pg_temp.ok(
    (SELECT declared_accurate_at FROM public.sp_passport_profiles WHERE holder_user_id = _h)
      = _declared,
    '2.7 the replay preserved the original declaration timestamp');
END $$;

-- ── THE SAME NAME OVER DIFFERENT FACTS IS NOT A REPLAY ──────────────────
--
-- Answering it with the first submission's merit would silently discard what
-- the caller just typed and report it as saved.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fa000000-0000-0000-0000-0000000000a1'::uuid, 'employment', 'A DIFFERENT ROLE',
        'Northgate Security Ltd (fiktiv)', 'GB', DATE '2024-03-01', NULL, true)$f$,
    'SP_OPERATION_FACTS_CHANGED',
    '2.8 the same operation id carrying different facts is refused');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_experience_periods WHERE holder_user_id = _h) = 1,
    '2.9 and it created nothing');
END $$;

-- ── THE FORGED AUDIT EVENT ──────────────────────────────────────────────
--
-- THE DEFECT THIS FILE EXISTS TO PIN. The first design read the operation id
-- out of `sp_passport_events.detail`, which `authenticated` can INSERT into
-- directly. A holder could therefore mint an `experience_created` event
-- carrying any operation id, and the function would answer a replay with a
-- subject it never checked.
--
-- Two things are asserted: the forgery is refused at the table, AND -- were it
-- ever to land -- it could not satisfy idempotency, because idempotency no
-- longer reads that column.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000006'; _sid uuid; _c boolean; _k text;
BEGIN
  INSERT INTO public.sp_passport_profiles (holder_user_id) VALUES (_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_fail(
    format($f$INSERT INTO public.sp_passport_events
       (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
     VALUES (%L, %L, 'experience_created', 'experience', gen_random_uuid(),
             jsonb_build_object('operation_id', 'fe000000-0000-0000-0000-0000000000f0',
                                'first_merit', true))$f$, _h, _h),
    'row-level security',
    '2.10 a client cannot write an event carrying an operation_id at all');

  PERFORM pg_temp.must_fail(
    format($f$INSERT INTO public.sp_passport_events
       (holder_user_id, actor_user_id, event_type, subject_type, detail)
     VALUES (%L, %L, 'claim_created', 'claim',
             jsonb_build_object('first_merit', true))$f$, _h, _h),
    'row-level security',
    '2.11 nor one claiming to be a first merit');
  RESET ROLE;

  -- Now plant the forgery ANYWAY, as the table owner, to prove the function
  -- does not consult it. This is the negative control: if idempotency still
  -- read the audit log, the call below would return the forged subject id and
  -- create nothing.
  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_h, _h, 'experience_created', 'experience',
          '00000000-0000-4000-8000-00000000dead',
          jsonb_build_object('operation_id', 'fe000000-0000-0000-0000-0000000000f0',
                             'first_merit', true));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_kind, subject_id, created INTO _k, _sid, _c
    FROM public.sp_passport_complete_first_merit(
      'fe000000-0000-0000-0000-0000000000f0'::uuid, 'course', 'Riktig kurs',
      'Utbildare (fiktiv)', NULL, DATE '2023-01-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(_c AND _sid <> '00000000-0000-4000-8000-00000000dead'::uuid,
    '2.12 NEGATIVE CONTROL: a planted audit event cannot impersonate a completed operation');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_claims WHERE id = _sid AND holder_user_id = _h),
    '2.13 the real subject was created and belongs to the holder');
  PERFORM pg_temp.ok(
    (SELECT subject_id FROM public.sp_passport_operations
      WHERE operation_id = 'fe000000-0000-0000-0000-0000000000f0') = _sid,
    '2.14 and the receipt -- not the log -- is what records it');
END $$;

-- ── A REPLAY MUST POINT AT SOMETHING THAT IS STILL THERE ────────────────
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000006'; _sid uuid;
BEGIN
  SELECT subject_id INTO _sid FROM public.sp_passport_operations
   WHERE operation_id = 'fe000000-0000-0000-0000-0000000000f0';

  -- Point the receipt at a subject that does not exist, which is what a
  -- deleted or foreign row would look like from the receipt's side.
  UPDATE public.sp_passport_operations
     SET subject_id = '00000000-0000-4000-8000-0000000000ff'
   WHERE operation_id = 'fe000000-0000-0000-0000-0000000000f0';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fe000000-0000-0000-0000-0000000000f0'::uuid, 'course', 'Riktig kurs',
        'Utbildare (fiktiv)', NULL, DATE '2023-01-01', NULL, true)$f$,
    'SP_OPERATION_SUBJECT_MISSING',
    '2.15 a replay whose subject no longer exists is refused, not reported as saved');
  RESET ROLE;

  UPDATE public.sp_passport_operations SET subject_id = _sid
   WHERE operation_id = 'fe000000-0000-0000-0000-0000000000f0';
END $$;

-- The index is a true invariant and stays, but it is traceability rather than
-- authority. Proved by attempting the duplicate directly, as the table owner.
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
    '2.16 a second completion event for one operation is refused by the index');

  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, detail)
  VALUES (_h, _h, 'privacy_changed', 'profile', '{}'::jsonb),
         (_h, _h, 'privacy_changed', 'profile', '{}'::jsonb);
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'privacy_changed') = 2,
    '2.17 events carrying no operation id repeat freely');
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
  -- one: no Passport, no merit, no event, no receipt, no declaration.
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
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_operations WHERE holder_user_id = _h),
    '3.6 and no operation receipt');
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
  SELECT count(*) INTO _n FROM public.sp_passport_operations WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_n = 0, '4.10 and no half-written receipts');
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
    'SP_NOT_AUTHENTICATED', '4.11 an unauthenticated caller is refused');
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_ensure()$f$,
    'SP_NOT_AUTHENTICATED', '4.12 and cannot create a Passport either');
END $$;


-- =============================================================================
-- GROUP 5 — all five merit kinds, and none of them files a market claim
-- =============================================================================
\echo 'GROUP 5 — employment, education, course, certification, licence'

DO $$
DECLARE
  _h uuid;
  _kinds text[] := ARRAY['education', 'course', 'certification', 'licence'];
  _expected text[] := ARRAY['education', 'training', 'certification', 'licence'];
  _i int; _k text; _sid uuid; _c boolean; _op uuid;
BEGIN
  FOR _i IN 1 .. array_length(_kinds, 1) LOOP
    -- A HOLDER EACH. The function refuses a second first merit, which is the
    -- point of defect 7 -- so four kinds need four people, exactly as four
    -- real first runs would.
    _h := ('fd000000-0000-0000-0000-00000000005' || _i)::uuid;
    INSERT INTO auth.users (id, email)
    VALUES (_h, 'fm-kind-' || _kinds[_i] || '@example.test') ON CONFLICT (id) DO NOTHING;
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

  -- Even a country the caller supplies is not recorded for a non-employment
  -- merit. The parameter exists for employment and is ignored elsewhere,
  -- which is stronger than trusting a caller to omit it.
  _h := 'fd000000-0000-0000-0000-000000000059';
  INSERT INTO auth.users (id, email) VALUES (_h, 'fm-kind-country@example.test')
  ON CONFLICT (id) DO NOTHING;
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
  _old timestamptz := TIMESTAMPTZ '2025-01-01 09:00:00+00';
  _k text; _sid uuid; _c boolean; _new timestamptz;
BEGIN
  -- The shape the old wizard could leave behind: onboarding closed, a
  -- declaration recorded, and not one merit to show for it.
  INSERT INTO public.sp_passport_profiles
    (holder_user_id, onboarding_state, declared_accurate_at)
  VALUES (_h, 'completed', _old);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_kind, subject_id, created INTO _k, _sid, _c
    FROM public.sp_passport_complete_first_merit(
      'fc000000-0000-0000-0000-000000000001'::uuid, 'course', 'Väktarutbildning VU1',
      'Utbildare (fiktiv)', NULL, DATE '2022-09-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(_c AND _sid IS NOT NULL,
    '6.1 a legacy completed profile can still record its first merit');

  -- ── DEFECT 9 ────────────────────────────────────────────────────────
  --
  -- The first draft kept the OLD declaration with
  -- `coalesce(declared_accurate_at, now())`, so a merit created today carried
  -- an affirmation dated before it existed. A declaration is an act; this act
  -- happened now.
  SELECT declared_accurate_at INTO _new
    FROM public.sp_passport_profiles WHERE holder_user_id = _h;
  PERFORM pg_temp.ok(_new > _old,
    '6.2 the NEW declaration is stamped now, not with the legacy timestamp');
  PERFORM pg_temp.ok(
    (SELECT (detail ->> 'declared_at')::timestamptz FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'declaration_recorded') = _new,
    '6.3 and the audit event agrees with the profile');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'passport_created') = 1,
    '6.4 an existing Passport gains its back-filled creation record exactly once');
END $$;

-- The replay of that legacy holder's operation must NOT move the declaration
-- again -- the act happened once.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000002'; _at timestamptz;
BEGIN
  SELECT declared_accurate_at INTO _at
    FROM public.sp_passport_profiles WHERE holder_user_id = _h;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM public.sp_passport_complete_first_merit(
    'fc000000-0000-0000-0000-000000000001'::uuid, 'course', 'Väktarutbildning VU1',
    'Utbildare (fiktiv)', NULL, DATE '2022-09-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT declared_accurate_at FROM public.sp_passport_profiles WHERE holder_user_id = _h) = _at,
    '6.5 replaying it preserves that timestamp rather than making a later one');
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
-- GROUP 8 — this is a FIRST-merit operation, not a merit API
-- =============================================================================
\echo 'GROUP 8 — only one first merit, whatever the operation id'

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000007'; _sid uuid; _c boolean;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  SELECT subject_id, created INTO _sid, _c
    FROM public.sp_passport_complete_first_merit(
      'fd000000-0000-0000-0000-0000000000e1'::uuid, 'course', 'Första kursen',
      'Utbildare (fiktiv)', NULL, DATE '2023-01-01', NULL, true);
  PERFORM pg_temp.ok(_c AND _sid IS NOT NULL, '8.1 the first merit is created');

  -- A DIFFERENT operation id. This is the "Add another merit" path the review
  -- found: it would have minted a second declaration and a second
  -- onboarding_completed into an append-only log.
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_complete_first_merit(
        'fd000000-0000-0000-0000-0000000000e2'::uuid, 'course', 'Andra kursen',
        'Utbildare (fiktiv)', NULL, DATE '2023-02-01', NULL, true)$f$,
    'SP_FIRST_MERIT_ALREADY_EXISTS',
    '8.2 a SECOND first-merit operation is refused once a current merit exists');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = _h) = 1,
    '8.3 and no second merit was made');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'declaration_recorded') = 1,
    '8.4 nor a second declaration');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'onboarding_completed') = 1,
    '8.5 nor a second completion event');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_operations
                 WHERE operation_id = 'fd000000-0000-0000-0000-0000000000e2'),
    '8.6 and the refused operation left no receipt');
END $$;

-- The ORIGINAL operation still replays. A refusal that also broke retries
-- would trade one defect for another: the holder whose response was lost
-- could never learn what happened.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000007'; _sid uuid; _c boolean; _first uuid;
BEGIN
  SELECT id INTO _first FROM public.sp_claims WHERE holder_user_id = _h;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_id, created INTO _sid, _c
    FROM public.sp_passport_complete_first_merit(
      'fd000000-0000-0000-0000-0000000000e1'::uuid, 'course', 'Första kursen',
      'Utbildare (fiktiv)', NULL, DATE '2023-01-01', NULL, true);
  RESET ROLE;
  PERFORM pg_temp.ok(_sid = _first AND NOT _c,
    '8.7 the ORIGINAL operation still replays to the same merit');
END $$;

-- A draft-only or archived merit is not a current one, so the first run is
-- not over and a first-merit operation is still allowed.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-00000000000a'; _c boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_h, 'fm-draftonly@example.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.sp_passport_profiles (holder_user_id) VALUES (_h);
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, lifecycle_state)
  VALUES (_h, 'training', 'Ofärdig', 'draft');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT created INTO _c FROM public.sp_passport_complete_first_merit(
    'fd000000-0000-0000-0000-0000000000e3'::uuid, 'course', 'Riktig kurs',
    'Utbildare (fiktiv)', NULL, DATE '2023-01-01', NULL, true);
  RESET ROLE;
  PERFORM pg_temp.ok(_c, '8.8 a draft merit does not end the first run');
END $$;


-- =============================================================================
-- GROUP 9 — Passport creation is atomic, concurrent-safe and repairable
-- =============================================================================
\echo 'GROUP 9 — the profile and its creation receipt commit together'

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-00000000000b'; _created boolean; _repaired boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_h, 'fm-ensure@example.test')
  ON CONFLICT (id) DO NOTHING;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT created, repaired INTO _created, _repaired FROM public.sp_passport_ensure();
  PERFORM pg_temp.ok(_created AND NOT _repaired, '9.1 the first call creates the Passport');

  SELECT created, repaired INTO _created, _repaired FROM public.sp_passport_ensure();
  PERFORM pg_temp.ok(NOT _created AND NOT _repaired, '9.2 the second call creates nothing');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_operations
      WHERE holder_user_id = _h AND operation_kind = 'passport_create') = 1,
    '9.3 exactly one creation receipt');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'passport_created') = 1,
    '9.4 and exactly one creation event');
END $$;

-- ── THE PARTIAL CREATION ROLLS BACK ─────────────────────────────────────
--
-- The defect: the old implementation upserted the profile and then, in a
-- SEPARATE request, inserted the event. If the second failed the profile
-- survived and no retry ever repaired it. Simulated by making the event
-- insert fail, which must take the profile with it.
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-00000000000c';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_h, 'fm-partial@example.test')
  ON CONFLICT (id) DO NOTHING;

  CREATE OR REPLACE FUNCTION pg_temp.break_events() RETURNS trigger
  LANGUAGE plpgsql AS $t$
  BEGIN
    IF NEW.event_type = 'passport_created' THEN
      RAISE EXCEPTION 'FM_TEST_EVENT_WRITE_FAILED';
    END IF;
    RETURN NEW;
  END $t$;
  CREATE TRIGGER fm_break_events BEFORE INSERT ON public.sp_passport_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.break_events();

  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(
    $f$SELECT * FROM public.sp_passport_ensure()$f$,
    'FM_TEST_EVENT_WRITE_FAILED',
    '9.5 a failing creation event aborts the whole call');

  DROP TRIGGER fm_break_events ON public.sp_passport_events;

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _h),
    '9.6 and no untraceable profile survives it');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_passport_operations WHERE holder_user_id = _h),
    '9.7 nor a receipt');
END $$;

-- ── THE LEGACY PROFILE WITH NO RECEIPT IS REPAIRED ──────────────────────
DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000008'; _created boolean; _repaired boolean;
BEGIN
  -- A profile written before this mechanism existed: no receipt, no event.
  INSERT INTO public.sp_passport_profiles (holder_user_id) VALUES (_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT created, repaired INTO _created, _repaired FROM public.sp_passport_ensure();
  RESET ROLE;

  PERFORM pg_temp.ok(NOT _created AND _repaired,
    '9.8 a legacy profile with no receipt is repaired, not re-created');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_operations
      WHERE holder_user_id = _h AND operation_kind = 'passport_create') = 1,
    '9.9 it gains exactly one receipt');
  PERFORM pg_temp.ok(
    (SELECT (detail ->> 'backfilled')::boolean FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'passport_created'),
    '9.10 and a creation event marked as back-filled, never as a real birth date');
END $$;


-- =============================================================================
-- GROUP 10 — the operations record is unreachable from the Data API
-- =============================================================================
\echo 'GROUP 10 — no client can read, write or empty the receipts'

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_fail(
    $f$SELECT count(*) FROM public.sp_passport_operations$f$,
    'permission denied', '10.1 authenticated cannot read the receipts');

  PERFORM pg_temp.must_fail(
    format($f$INSERT INTO public.sp_passport_operations
       (operation_id, holder_user_id, operation_kind, request_fingerprint,
        subject_type, subject_id, completed_at)
     VALUES (gen_random_uuid(), %L, 'first_merit', 'x', 'claim', gen_random_uuid(), now())$f$, _h),
    'permission denied', '10.2 nor forge one');

  PERFORM pg_temp.must_fail(
    $f$UPDATE public.sp_passport_operations SET completed_at = NULL$f$,
    'permission denied', '10.3 nor rewrite one');

  -- TRUNCATE is NOT subject to row-level security, so the grant is the only
  -- thing standing between a caller and an emptied idempotency record.
  PERFORM pg_temp.must_fail(
    $f$TRUNCATE public.sp_passport_operations$f$,
    'permission denied', '10.4 nor TRUNCATE the table');
  RESET ROLE;

  SET LOCAL ROLE anon;
  PERFORM pg_temp.must_fail(
    $f$SELECT count(*) FROM public.sp_passport_operations$f$,
    'permission denied', '10.5 anon cannot read it either');
  PERFORM pg_temp.must_fail(
    $f$TRUNCATE public.sp_passport_operations$f$,
    'permission denied', '10.6 nor TRUNCATE it');
  RESET ROLE;
END $$;


-- =============================================================================
-- GROUP 11 — ordered draft persistence, decided by the database
-- =============================================================================
-- The rule the browser cannot own, because two tabs are two browsers: a draft
-- save must carry a strictly greater revision than the stored one, and must
-- never reopen a completed onboarding.
\echo 'GROUP 11 — a stale autosave cannot overwrite a newer one'

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000009'; _n int;
BEGIN
  INSERT INTO public.sp_passport_profiles (holder_user_id) VALUES (_h);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- Save B (revision 2, newer answers) lands first.
  UPDATE public.sp_passport_profiles
     SET onboarding_answers = '{"firstMerit.title":"newer"}'::jsonb,
         onboarding_draft_revision = 2, onboarding_state = 'in_progress'
   WHERE holder_user_id = _h AND onboarding_draft_revision < 2
     AND onboarding_state <> 'completed';
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 1, '11.1 the newer save lands');

  -- Save A (revision 1, older answers) arrives late.
  UPDATE public.sp_passport_profiles
     SET onboarding_answers = '{"firstMerit.title":"older"}'::jsonb,
         onboarding_draft_revision = 1, onboarding_state = 'in_progress'
   WHERE holder_user_id = _h AND onboarding_draft_revision < 1
     AND onboarding_state <> 'completed';
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 0, '11.2 the older save matches nothing');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT onboarding_answers ->> 'firstMerit.title'
       FROM public.sp_passport_profiles WHERE holder_user_id = _h) = 'newer',
    '11.3 and the newer answers survive');
END $$;

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000009'; _n int;
BEGIN
  UPDATE public.sp_passport_profiles
     SET onboarding_state = 'completed', declared_accurate_at = now()
   WHERE holder_user_id = _h;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  -- A save that was in flight when the completion committed.
  UPDATE public.sp_passport_profiles
     SET onboarding_answers = '{"firstMerit.title":"late"}'::jsonb,
         onboarding_draft_revision = 9, onboarding_state = 'in_progress'
   WHERE holder_user_id = _h AND onboarding_draft_revision < 9
     AND onboarding_state <> 'completed';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE;

  PERFORM pg_temp.ok(_n = 0, '11.4 a late autosave matches nothing once onboarding is completed');
  PERFORM pg_temp.ok(
    (SELECT onboarding_state FROM public.sp_passport_profiles WHERE holder_user_id = _h)
      = 'completed',
    '11.5 and cannot put a finished Passport back into progress');
END $$;


-- =============================================================================
-- GROUP 12 — the function's own standing
-- =============================================================================
\echo 'GROUP 12 — grants, search_path and what the body may not say'

DO $$
DECLARE _src text; _def text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO _src, _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_passport_complete_first_merit';

  PERFORM pg_temp.ok(_def LIKE '%SECURITY DEFINER%' AND _def LIKE '%search_path%',
    '12.1 SECURITY DEFINER with a pinned search_path');

  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon',
      'public.sp_passport_complete_first_merit(uuid,text,text,text,text,date,date,boolean)',
      'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.sp_passport_ensure(text)', 'EXECUTE'),
    '12.2 anon cannot execute either function');

  PERFORM pg_temp.ok(
    has_function_privilege('authenticated',
      'public.sp_passport_complete_first_merit(uuid,text,text,text,text,date,date,boolean)',
      'EXECUTE')
    AND has_function_privilege('authenticated', 'public.sp_passport_ensure(text)', 'EXECUTE'),
    '12.3 authenticated can');

  -- The body cannot raise trust, because it cannot NAME trust.
  PERFORM pg_temp.ok(
    _src NOT LIKE '%assertion_level%'
    AND _src NOT LIKE '%verified_by_user_id%' AND _src NOT LIKE '%verified_at%',
    '12.4 the body names no trust column, so the merit takes the defaults');

  -- And idempotency does not come from the audit log.
  PERFORM pg_temp.ok(
    _src LIKE '%sp_passport_operations%'
    AND _src NOT LIKE '%detail ->> ''operation_id'' = %',
    '12.5 idempotency reads the private receipts, not the client-writable log');

  PERFORM pg_temp.ok(
    (SELECT indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%operation_id%'
       FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'sp_events_one_per_operation'),
    '12.6 the one-event-per-operation index is unique and keyed on the operation');

  -- The per-holder serialisation, and its position. Two DIFFERENT operation
  -- ids do not conflict on the receipt's primary key, so without this lock
  -- each would reach the current-merit check, see nothing committed, and
  -- create a merit. Proved with two processes in
  -- security_passport_first_merit_two_ops_race_test.sql; pinned here so the
  -- fast path notices if it is ever moved or removed.
  PERFORM pg_temp.ok(_src LIKE '%pg_advisory_xact_lock%',
    '12.7 the first-merit decision is serialised per holder with an advisory lock');
  PERFORM pg_temp.ok(
    position('pg_advisory_xact_lock' IN _src) < position('INSERT INTO public.sp_passport_operations' IN _src)
    AND position('pg_advisory_xact_lock' IN _src) < position($q$RAISE EXCEPTION 'SP_FIRST_MERIT_ALREADY_EXISTS'$q$ IN _src),
    '12.8 and the lock is taken before the receipt is claimed and before the current-merit check');
  PERFORM pg_temp.ok(_src LIKE '%hashtextextended(''sp_passport_first_merit:'' || _uid::text%',
    '12.9 keyed to auth.uid(), which no parameter can supply');
END $$;


-- =============================================================================
-- GROUP 13 — negative controls: take the guard away and the defect comes back
-- =============================================================================
-- A green suite proves the assertions ran. It does not prove they would go
-- red. These blocks remove a protection, show the forbidden thing succeeding,
-- and ROLL BACK -- so the file itself demonstrates that the groups above are
-- load-bearing rather than tautologies.
\echo 'GROUP 13 — negative controls'

-- 13.1 · idempotency read from the client-writable audit log
BEGIN;
CREATE OR REPLACE FUNCTION public.sp_passport_complete_first_merit(
  _operation_id uuid, _merit_kind text, _title text, _organisation text,
  _country text, _started_on date, _ended_on date, _declared boolean)
RETURNS TABLE (subject_kind text, subject_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $ctl$
DECLARE _uid uuid := auth.uid(); _sid uuid; _skind text;
BEGIN
  SELECT e.subject_type, e.subject_id INTO _skind, _sid
    FROM public.sp_passport_events e
   WHERE e.holder_user_id = _uid
     AND e.detail ->> 'operation_id' = _operation_id::text
     AND e.event_type IN ('experience_created', 'claim_created')
   LIMIT 1;
  IF _sid IS NOT NULL THEN
    RETURN QUERY SELECT _skind, _sid, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT NULL::text, NULL::uuid, false;
END $ctl$;

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-00000000000d'; _sid uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_h, 'fm-ctl@example.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.sp_passport_profiles (holder_user_id) VALUES (_h);
  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_h, _h, 'experience_created', 'experience',
          '00000000-0000-4000-8000-00000000beef',
          jsonb_build_object('operation_id', 'fd000000-0000-0000-0000-0000000000c0'));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT subject_id INTO _sid FROM public.sp_passport_complete_first_merit(
    'fd000000-0000-0000-0000-0000000000c0'::uuid, 'course', 'X', 'Y', NULL,
    DATE '2023-01-01', NULL, true);
  RESET ROLE;

  PERFORM pg_temp.ok(_sid = '00000000-0000-4000-8000-00000000beef'::uuid,
    '13.1 NEGATIVE CONTROL: reading the audit log returns a subject the holder invented');
END $$;
ROLLBACK;

-- 13.2 · the events policy that stops the forgery
BEGIN;
DROP POLICY IF EXISTS sp_events_self_insert ON public.sp_passport_events;
CREATE POLICY sp_events_self_insert ON public.sp_passport_events
  FOR INSERT TO authenticated
  WITH CHECK (holder_user_id = auth.uid() AND actor_user_id = auth.uid());

DO $$
DECLARE _h uuid := 'fd000000-0000-0000-0000-000000000006';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_h, _h, 'claim_created', 'claim', gen_random_uuid(),
          jsonb_build_object('operation_id', 'fd000000-0000-0000-0000-0000000000c1',
                             'first_merit', true));
  RESET ROLE;
  PERFORM pg_temp.ok(true,
    '13.2 NEGATIVE CONTROL: without the tightened policy a holder can mint an operation event');
END $$;
ROLLBACK;

-- 13.3 · the private grants on the receipts table
BEGIN;
GRANT SELECT, INSERT ON public.sp_passport_operations TO authenticated;
DO $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000001', true);
  -- RLS still matches nothing, so the read is empty rather than refused --
  -- which is precisely why the GRANT and the policy are two separate guards
  -- and both are asserted.
  SELECT count(*) INTO _n FROM public.sp_passport_operations;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0,
    '13.3 NEGATIVE CONTROL: with a grant the table is reachable; only RLS then hides it');
END $$;
ROLLBACK;

DO $$
BEGIN
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.sp_passport_operations', 'SELECT'),
    '13.4 the real grants are back after the controls');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'sp_passport_events' AND policyname = 'sp_events_self_insert'
      AND with_check LIKE '%operation_id%') = 1,
    '13.5 and so is the tightened events policy');
  PERFORM pg_temp.ok(
    (SELECT prosrc LIKE '%sp_passport_operations%' FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'sp_passport_complete_first_merit'),
    '13.6 and so is the real function');
END $$;

\echo '==> Security Passport first merit: complete'
