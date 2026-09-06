-- =============================================================================
-- Security Passport — the first merit, committed once or not at all.
-- =============================================================================
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- Finishing the first-run wizard performed four independent writes from the
-- browser, in this order, with nothing holding them together:
--
--   1. INSERT sp_experience_periods        (only if the holder had no period)
--   2. UPDATE sp_passport_profiles         (state = completed, declaration)
--   3. INSERT sp_passport_events x2        (declaration_recorded, onboarding_completed)
--
-- Every seam between them is a state a real person reached:
--
--   * 1 succeeds and 2 fails  -> a merit exists, onboarding says in progress,
--     and the next attempt SKIPS the insert because a period now exists. The
--     holder is told nothing was saved and can never finish.
--   * 2 succeeds and 3 fails  -> the event insert's error was never read at
--     all (`await db.from(...).insert(...)` with no `error` check), so a
--     Passport could be declared accurate with no record that anyone declared
--     anything. An audit spine that loses writes silently is not an audit
--     spine.
--   * The whole thing runs twice -> two declarations and two completions in
--     an append-only log, and, in the window before the first commit, two
--     employment periods for one job.
--
-- And the declaration itself was never checked. `declared_accurate_at` was
-- written unconditionally by the server whenever completion was called; the
-- tick-box lived only in React state. Any caller could record a truthfulness
-- declaration the holder never made — which is the one field in this schema
-- whose entire value is that a human really did affirm it.
--
-- ── THE RULE ───────────────────────────────────────────────────────────
--
-- One function, one transaction, one outcome:
--
--     the merit row
--   + its creation event
--   + the onboarding transition
--   + the declaration
--
-- commit together or not at all, and a retry carrying the same operation id
-- returns the merit that already exists rather than making a second one.
--
-- The idempotency record is the AUDIT LOG, not a side table. The creation
-- event already names the subject, the holder and the moment; carrying the
-- operation id in its `detail` makes the log answer "has this operation
-- already happened, and what did it produce" without introducing a second
-- place where that answer could be stored and disagree.
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
--
--   * It does not raise trust. The merit is inserted with no assertion or
--     lifecycle argument at all, so it takes the `self_declared` / `active`
--     column defaults exactly like every other holder-written row. There is
--     no branch in this body that names assertion_level, lifecycle_state,
--     verified_by_user_id or verified_at, and the postflight asserts that.
--
--   * It does not default a country. An employment period must be given one
--     explicitly (SP_WORK_COUNTRY_REQUIRED); the four non-employment kinds
--     are written with `jurisdiction_code` left NULL, because where a course
--     certificate came from is provenance the holder can add later and a
--     guess would be a claim about a market.
--
--   * It rewrites no history and back-fills nothing. Existing events carry no
--     `operation_id`, so the new unique index — which is PARTIAL on exactly
--     that key — cannot see them and cannot fail on hosted data.
--
--   * It adds no table, no column, no enum value and no event type. The five
--     event types it writes are already in
--     sp_passport_events_event_type_check.
--
-- ── DEPLOY ORDER ───────────────────────────────────────────────────────
--
-- SCHEMA FIRST. This migration is safe alone and must be applied BEFORE the
-- application release that calls it: nothing existing calls the new function,
-- and the new index is invisible to every row written so far. The dependent
-- application code (the rebuilt first-run journey) is held out of merge by
-- scripts/schema-first-release-check.ts until this is recorded applied in
-- supabase/release-state.json.
--
-- Rollback: supabase/rollback/20261031090000_sp_passport_first_merit_rollback.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. Preflight — the objects this leans on are still the ones it was written
--    against. A migration that assumes is a migration that corrupts.
-- =============================================================================
DO $$
DECLARE _n bigint;
BEGIN
  IF to_regclass('public.sp_passport_profiles') IS NULL
     OR to_regclass('public.sp_experience_periods') IS NULL
     OR to_regclass('public.sp_claims') IS NULL
     OR to_regclass('public.sp_passport_events') IS NULL THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_PREFLIGHT: a Security Passport table is missing.';
  END IF;

  -- The five event types written below must already be permitted. Adding one
  -- here would be a schema change hiding inside a function change.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sp_passport_events_event_type_check'
       AND conrelid = 'public.sp_passport_events'::regclass
       AND pg_get_constraintdef(oid) LIKE '%passport_created%'
       AND pg_get_constraintdef(oid) LIKE '%experience_created%'
       AND pg_get_constraintdef(oid) LIKE '%claim_created%'
       AND pg_get_constraintdef(oid) LIKE '%declaration_recorded%'
       AND pg_get_constraintdef(oid) LIKE '%onboarding_completed%'
  ) THEN
    RAISE EXCEPTION
      'SP_FIRST_MERIT_PREFLIGHT: sp_passport_events does not permit every event type this writes.';
  END IF;

  -- How many events already carry an operation_id. Expected: zero. Counted
  -- rather than assumed, so an operator can see that the unique index below
  -- is being created over an empty key space.
  SELECT count(*) INTO _n FROM public.sp_passport_events WHERE detail ? 'operation_id';
  RAISE NOTICE 'SP_FIRST_MERIT: % existing event(s) carry an operation_id (expected 0).', _n;
END $$;


-- =============================================================================
-- 1. One event per operation, per type
-- =============================================================================
-- This is the structural half of idempotency, and it is what makes
-- "only one creation event and one completion event may exist for the
-- operation" a property of the database rather than a property of the code
-- path that happened to run.
--
-- PARTIAL on `detail ? 'operation_id'` for two reasons, both load-bearing:
--
--   * every event written before this release is excluded, so creating the
--     index on hosted data cannot fail on history it was never meant to
--     govern;
--   * events that legitimately repeat for a holder (privacy_changed,
--     claim_corrected, …) are untouched, because they carry no operation id.
--
-- Not scoped to holder_user_id on purpose: an operation id is a uuid, so
-- global uniqueness is strictly stronger, and it means one holder replaying
-- another holder's id is refused by the index rather than by a check somebody
-- could forget to write.
CREATE UNIQUE INDEX IF NOT EXISTS sp_events_one_per_operation
  ON public.sp_passport_events ((detail ->> 'operation_id'), event_type)
  WHERE detail ? 'operation_id';

COMMENT ON INDEX public.sp_events_one_per_operation IS
  'At most one event of each type per idempotent Passport operation. Partial '
  'on detail ? ''operation_id'', so it governs only operations that opted in '
  'and never the history written before it existed.';


-- =============================================================================
-- 2. The first merit — the whole operation, or none of it
-- =============================================================================
-- SECURITY DEFINER because it writes four tables in one transaction and must
-- not depend on the caller holding four grants. Every row it writes is keyed
-- to `auth.uid()` and nothing else: there is no parameter naming a holder, so
-- there is no argument a caller could supply that writes into somebody else's
-- Passport.
CREATE OR REPLACE FUNCTION public.sp_passport_complete_first_merit(
  _operation_id uuid,
  _merit_kind   text,
  _title        text,
  _organisation text,
  _country      text,
  _started_on   date,
  _ended_on     date,
  _declared     boolean)
RETURNS TABLE (subject_kind text, subject_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid        uuid := auth.uid();
  _claim_type text;
  _sid        uuid;
  _skind      text;
  _created    boolean := true;
  _fresh      boolean := false;
  _qv         text;
  _title_t    text := btrim(coalesce(_title, ''));
  _org_t      text := btrim(coalesce(_organisation, ''));
  _country_t  text := nullif(btrim(coalesce(_country, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'SP_OPERATION_ID_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  -- ── THE DECLARATION, BEFORE ANYTHING IS WRITTEN ────────────────────
  --
  -- First refusal in the body, deliberately. `declared_accurate_at` is the
  -- one column in the Passport whose only value is that a person really did
  -- affirm it, and it used to be written by the server whenever completion
  -- was called at all. Refusing here means a completion without an explicit
  -- declaration writes NOTHING: no merit, no event, no state change, because
  -- nothing has happened yet.
  IF _declared IS NOT TRUE THEN
    RAISE EXCEPTION 'SP_DECLARATION_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF _merit_kind IS NULL
     OR _merit_kind NOT IN ('employment', 'education', 'course', 'certification', 'licence') THEN
    RAISE EXCEPTION 'SP_MERIT_KIND_UNKNOWN: %', coalesce(_merit_kind, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Required values, checked on the server. The browser checks them too, to
  -- point at the field; that is a courtesy and this is the rule.
  IF _title_t = '' THEN
    RAISE EXCEPTION 'SP_TITLE_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  IF _org_t = '' THEN
    RAISE EXCEPTION 'SP_ORGANISATION_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  IF _started_on IS NOT NULL AND _started_on > current_date THEN
    RAISE EXCEPTION 'SP_START_DATE_IN_FUTURE' USING ERRCODE = 'check_violation';
  END IF;

  IF _merit_kind = 'employment' THEN
    -- No fallback country, anywhere, ever. This is the defect that stamped a
    -- default country onto the employment record of a holder who never named
    -- one.
    IF _country_t IS NULL THEN
      RAISE EXCEPTION 'SP_WORK_COUNTRY_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
    IF _started_on IS NULL THEN
      RAISE EXCEPTION 'SP_START_DATE_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
    IF _ended_on IS NOT NULL AND _ended_on <= _started_on THEN
      RAISE EXCEPTION 'SP_PERIOD_END_BEFORE_START' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- A course certificate is not filed in a market. The claim INSERT below
    -- names no `jurisdiction_code` at all, so a country given here is simply
    -- not recorded and nothing can register a regulated claim by accident.
    IF _ended_on IS NOT NULL AND _started_on IS NOT NULL AND _ended_on <= _started_on THEN
      RAISE EXCEPTION 'SP_CLAIM_END_BEFORE_START' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── 1. THE PASSPORT ITSELF, IDEMPOTENTLY ───────────────────────────
  --
  -- ON CONFLICT DO NOTHING rather than SELECT-then-INSERT: two clicks a few
  -- milliseconds apart both passed the old read and the second one failed on
  -- the primary key, which the holder saw as an error while creating their
  -- Passport for the first time.
  INSERT INTO public.sp_passport_profiles (holder_user_id)
  VALUES (_uid)
  ON CONFLICT (holder_user_id) DO NOTHING;

  IF FOUND THEN
    _fresh := true;
    INSERT INTO public.sp_passport_events
      (holder_user_id, actor_user_id, event_type, subject_type, detail)
    VALUES (_uid, _uid, 'passport_created', 'profile',
            jsonb_build_object('created_by', 'first_merit'));
  END IF;

  SELECT question_version INTO _qv
    FROM public.sp_passport_profiles WHERE holder_user_id = _uid;

  -- ── 2. HAS THIS EXACT OPERATION ALREADY PRODUCED A MERIT? ──────────
  --
  -- The retry path. A caller that lost the response to a network failure
  -- sends the same operation id again and is given the merit it already
  -- made, rather than a second one.
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

  -- ── 3. THE MERIT AND ITS CREATION EVENT, TOGETHER ──────────────────
  --
  -- Wrapped in a block with an exception handler, which is a SUBTRANSACTION:
  -- if the event insert loses the race on sp_events_one_per_operation, the
  -- merit row inserted a line earlier is rolled back with it. That is the
  -- whole reason the two are inside one block — a merit whose creation event
  -- was refused is exactly the orphan this migration exists to prevent.
  --
  -- The loser BLOCKS on the index until the winner commits, then raises
  -- unique_violation, then reads the winner's committed event. So two
  -- identical requests in flight at the same moment produce one merit and two
  -- identical answers.
  BEGIN
    IF _merit_kind = 'employment' THEN
      INSERT INTO public.sp_experience_periods
        (holder_user_id, employer_name, role_title, jurisdiction_code, started_on, ended_on)
      VALUES (_uid, _org_t, _title_t, _country_t, _started_on, _ended_on)
      RETURNING id INTO _sid;
      _skind := 'experience';

      INSERT INTO public.sp_passport_events
        (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
      VALUES (_uid, _uid, 'experience_created', 'experience', _sid,
              jsonb_build_object('operation_id', _operation_id::text,
                                 'merit_kind', _merit_kind,
                                 'employer_name', _org_t,
                                 'role_title', _title_t,
                                 'first_merit', true));
    ELSE
      _claim_type := CASE _merit_kind
                       WHEN 'education'     THEN 'education'
                       WHEN 'course'        THEN 'training'
                       WHEN 'certification' THEN 'certification'
                       WHEN 'licence'       THEN 'licence'
                     END;

      -- `credential_code` is deliberately absent. A first merit is free text;
      -- assigning a taxonomy code here would put a VU1 symbol on something no
      -- taxonomy rule ever checked.
      INSERT INTO public.sp_claims
        (holder_user_id, claim_type, title, claimed_issuer_name, issued_on, valid_from, valid_until)
      VALUES (_uid, _claim_type, _title_t, _org_t, _started_on, _started_on, _ended_on)
      RETURNING id INTO _sid;
      _skind := 'claim';

      INSERT INTO public.sp_passport_events
        (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
      VALUES (_uid, _uid, 'claim_created', 'claim', _sid,
              jsonb_build_object('operation_id', _operation_id::text,
                                 'merit_kind', _merit_kind,
                                 'claim_type', _claim_type,
                                 'title', _title_t,
                                 'first_merit', true));
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- The subtransaction is gone, and so is the merit row it inserted. The
    -- plpgsql variables are NOT rolled back, so they are cleared by hand
    -- before re-reading — otherwise `_sid` would still hold the id of a row
    -- that no longer exists.
    _sid := NULL;
    _skind := NULL;
    _created := false;

    SELECT e.subject_type, e.subject_id INTO _skind, _sid
      FROM public.sp_passport_events e
     WHERE e.holder_user_id = _uid
       AND e.detail ->> 'operation_id' = _operation_id::text
       AND e.event_type IN ('experience_created', 'claim_created')
     LIMIT 1;

    -- Nothing of this holder's answers that operation id. It belongs to
    -- somebody else, and the only honest answer is a refusal: returning
    -- another holder's subject id would be a cross-holder read.
    IF _sid IS NULL THEN
      RAISE EXCEPTION 'SP_OPERATION_ID_CONFLICT' USING ERRCODE = 'check_violation';
    END IF;
  END;

  -- ── 4. CLOSE ONBOARDING, IN THE SAME TRANSACTION ───────────────────
  --
  -- `coalesce(declared_accurate_at, now())` keeps the FIRST declaration. A
  -- later merit must not restate when this person affirmed their record.
  UPDATE public.sp_passport_profiles
     SET onboarding_state     = 'completed',
         declared_accurate_at = coalesce(declared_accurate_at, now()),
         updated_at           = now()
   WHERE holder_user_id = _uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_PROFILE_MISSING' USING ERRCODE = 'no_data_found';
  END IF;

  IF _created THEN
    INSERT INTO public.sp_passport_events
      (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
    VALUES
      (_uid, _uid, 'declaration_recorded', 'profile', NULL,
       jsonb_build_object('operation_id', _operation_id::text,
                          'question_version', _qv)),
      (_uid, _uid, 'onboarding_completed', 'profile', NULL,
       jsonb_build_object('operation_id', _operation_id::text,
                          'merit_kind', _merit_kind,
                          'passport_created_here', _fresh));
  END IF;

  RETURN QUERY SELECT _skind, _sid, _created;
END $$;

REVOKE ALL ON FUNCTION public.sp_passport_complete_first_merit(uuid, text, text, text, text, date, date, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_passport_complete_first_merit(uuid, text, text, text, text, date, date, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.sp_passport_complete_first_merit(uuid, text, text, text, text, date, date, boolean) IS
  'The first-run completion, as one transaction: the merit row, its creation '
  'event, the onboarding transition and the truthfulness declaration commit '
  'together or not at all. Idempotent on _operation_id -- a retry returns the '
  'merit already made, and two identical requests in flight produce one merit '
  'and two identical answers, because the loser rolls back its own insert on '
  'sp_events_one_per_operation. Refuses a completion with no explicit '
  'declaration before writing anything (SP_DECLARATION_REQUIRED), refuses an '
  'employment period with no stated country (SP_WORK_COUNTRY_REQUIRED, never a '
  'default), and writes no assertion or lifecycle value at all, so the merit '
  'takes the self_declared / active column defaults like every other '
  'holder-written row.';


-- =============================================================================
-- 3. Assert the end state, in the same transaction
-- =============================================================================
DO $$
DECLARE _src text; _def text; _n int;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO _src, _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_passport_complete_first_merit';

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the function was not created.';
  END IF;

  IF _def NOT LIKE '%SECURITY DEFINER%' OR _def NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: SECURITY DEFINER or the pinned search_path is missing.';
  END IF;

  -- The refusals, by name. A later rewrite that drops one fails here.
  IF _src NOT LIKE '%SP_DECLARATION_REQUIRED%'
     OR _src NOT LIKE '%SP_WORK_COUNTRY_REQUIRED%'
     OR _src NOT LIKE '%SP_MERIT_KIND_UNKNOWN%'
     OR _src NOT LIKE '%SP_TITLE_REQUIRED%'
     OR _src NOT LIKE '%SP_ORGANISATION_REQUIRED%'
     OR _src NOT LIKE '%SP_OPERATION_ID_REQUIRED%'
     OR _src NOT LIKE '%SP_OPERATION_ID_CONFLICT%'
     OR _src NOT LIKE '%SP_NOT_AUTHENTICATED%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: a named refusal is missing from the body.';
  END IF;

  -- IT CANNOT RAISE TRUST. Not a convention here -- an assertion. If any of
  -- these four identifiers ever appears in this body, the one function in the
  -- codebase that creates a merit could also decide it was verified.
  IF _src LIKE '%assertion_level%'
     OR _src LIKE '%lifecycle_state%'
     OR _src LIKE '%verified_by_user_id%'
     OR _src LIKE '%verified_at%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body names a trust column; it must take the defaults.';
  END IF;

  -- And it cannot default a country.
  IF _src LIKE '%''SE''%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body names a literal country.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'sp_events_one_per_operation') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: sp_events_one_per_operation was not created.';
  END IF;

  -- anon holds nothing; authenticated holds EXECUTE.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_passport_complete_first_merit'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: grants are wrong (anon/PUBLIC can execute, or authenticated cannot).';
  END IF;

  -- The append-only trigger this function's audit writes rely on.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_events_append_only') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: sp_events_append_only is gone.';
  END IF;
END $$;

COMMIT;
