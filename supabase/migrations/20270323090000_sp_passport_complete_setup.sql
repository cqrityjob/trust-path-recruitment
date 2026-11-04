-- =============================================================================
-- Security Passport: completing the /passport/start setup, and with it the
-- holder's Passport number (BUG-04)
-- =============================================================================
--
-- Rollback: supabase/rollback/20270323090000_sp_passport_complete_setup_rollback.sql
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- A holder is numbered by sp_passport_number_on_complete_trg (20270217090000)
-- when their profile becomes `onboarding_state = 'completed'` AND carries
-- `declared_accurate_at`. The only function that writes `completed` is
-- sp_passport_complete_first_merit, which the four-step /passport/start setup
-- no longer calls: its last step hands over to the catalogue credential form,
-- which records a claim and nothing else. So a holder who finished the setup
-- with real credentials stayed `not_started`, was never numbered and never
-- counted.
--
-- And the table itself never held the rule. sp_profiles_self_update and
-- sp_profiles_self_insert check only the holder and `is_private`, so a holder
-- could write `onboarding_state = 'completed'` and a declaration straight to
-- the Data API -- no merit, no function -- and the trigger numbered an empty
-- Passport and the network count counted it.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────
--
-- 1. sp_passport_complete_setup(_declared) is the setup's own completion:
--
--    * the holder's declaration is required on every call (`_declared` must
--      be true); nothing here can record a declaration nobody made;
--    * a live session is required, as for every other Passport write;
--    * it is idempotent, and that is decided FIRST: a completed Passport is
--      left exactly as it is -- same declaration date, no second event --
--      even if its merits have changed since (a second click, a retry, a
--      stale tab);
--    * otherwise at least one CURRENT Passport merit is required: an active
--      Passport credential (sp_is_passport_credential, the same predicate the
--      catalogue and session guards use, so a CV record on the shared claim
--      spine does not count) or an active employment. The merit row is held
--      FOR SHARE, so a withdrawal cannot commit between the check and the
--      completion;
--    * the profile update and its two audit events commit together, in this
--      function's transaction; the declaration event names the question
--      version it was given against, as the other two writers of that event
--      do.
--
-- 2. sp_profile_completion_guard on sp_passport_profiles: a client role
--    (`authenticated`, `anon`) may no longer move a profile INTO or OUT OF
--    `completed` by writing the row. Completion is decided by the SECURITY
--    DEFINER functions only, which run as the owner. Everything a client
--    legitimately writes still works: the draft autosave (never on a
--    completed row), the work country, the basics and re-affirming the
--    declaration of a completed Passport.
--
-- Neither names sp_passport_numbers. The number is still assigned ONLY by the
-- existing trigger, in the same transaction, once: a primary key on the holder
-- and the idempotent sp_assign_passport_number make a second number impossible.
--
-- No table, column or existing row changes. Profiles that are already
-- completed stay completed, whatever they hold.

-- ── Preflight ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.sp_passport_profiles') IS NULL
     OR to_regclass('public.sp_claims') IS NULL
     OR to_regclass('public.sp_experience_periods') IS NULL
     OR to_regclass('public.sp_passport_events') IS NULL
     OR to_regclass('public.sp_passport_numbers') IS NULL THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_PREFLIGHT: a Security Passport table is missing.';
  END IF;

  IF to_regprocedure('public.sp_passport_ensure(text)') IS NULL
     OR to_regprocedure('public.sp_passport_session_active()') IS NULL
     OR to_regprocedure('public.sp_is_passport_credential(text,text)') IS NULL THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_PREFLIGHT: a Security Passport function this calls is missing.';
  END IF;

  -- The two event types written below must already be permitted. Adding one
  -- here would be a schema change hiding inside a function change.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sp_passport_events_event_type_check'
       AND conrelid = 'public.sp_passport_events'::regclass
       AND pg_get_constraintdef(oid) LIKE '%declaration_recorded%'
       AND pg_get_constraintdef(oid) LIKE '%onboarding_completed%'
  ) THEN
    RAISE EXCEPTION
      'SP_COMPLETE_SETUP_PREFLIGHT: sp_passport_events does not permit every event type this writes.';
  END IF;

  -- The number is the trigger's job. Without it this function would complete
  -- a Passport and number nobody, which is the defect itself.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'sp_passport_number_on_complete_trg'
       AND tgrelid = 'public.sp_passport_profiles'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_PREFLIGHT: the Passport number trigger is missing.';
  END IF;
END $$;

-- ── 1 · The completion ──────────────────────────────────────────────────

CREATE FUNCTION public.sp_passport_complete_setup(_declared boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _uid   uuid := auth.uid();
  _now   timestamptz := now();
  _state text;
  _qv    text;
  _merit boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A signed-out holder is refused before anything is read.
  IF NOT public.sp_passport_session_active() THEN
    RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _declared IS NOT TRUE THEN
    RAISE EXCEPTION 'SP_DECLARATION_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  -- The profile row is the lock: a second completion waits here and then
  -- reads `completed`. A credential saved before any profile existed gets
  -- one, exactly as sp_passport_complete_first_merit does.
  SELECT onboarding_state, question_version INTO _state, _qv
    FROM public.sp_passport_profiles WHERE holder_user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.sp_passport_ensure();
    SELECT onboarding_state, question_version INTO _state, _qv
      FROM public.sp_passport_profiles WHERE holder_user_id = _uid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_PROFILE_MISSING' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- Already completed: a second click, a retry or a stale tab. Nothing moves,
  -- whatever the Passport holds now.
  IF _state = 'completed' THEN RETURN; END IF;

  -- `active` is the one current lifecycle state (isCurrentMerit in
  -- src/lib/security-passport/types.ts), and only a Passport credential is
  -- Passport content: a draft, an expired entry or a CV record completes
  -- nothing. FOR SHARE: a concurrent withdrawal waits for this transaction.
  PERFORM 1 FROM public.sp_claims c
   WHERE c.holder_user_id = _uid AND c.lifecycle_state = 'active'
     AND public.sp_is_passport_credential(c.claim_type, c.credential_code)
   LIMIT 1 FOR SHARE;
  _merit := FOUND;
  IF NOT _merit THEN
    PERFORM 1 FROM public.sp_experience_periods e
     WHERE e.holder_user_id = _uid AND e.lifecycle_state = 'active'
     LIMIT 1 FOR SHARE;
    _merit := FOUND;
  END IF;
  IF NOT _merit THEN
    RAISE EXCEPTION 'SP_NO_CURRENT_MERIT' USING ERRCODE = 'check_violation';
  END IF;

  -- Fires sp_passport_number_on_complete_trg, which numbers the holder.
  UPDATE public.sp_passport_profiles
     SET onboarding_state     = 'completed',
         declared_accurate_at = _now,
         updated_at           = _now
   WHERE holder_user_id = _uid;

  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES
    (_uid, _uid, 'declaration_recorded', 'profile', NULL,
     jsonb_build_object('declared_at', _now, 'question_version', _qv, 'source', 'setup')),
    (_uid, _uid, 'onboarding_completed', 'profile', NULL,
     jsonb_build_object('source', 'setup'));
END $$;

REVOKE ALL ON FUNCTION public.sp_passport_complete_setup(boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sp_passport_complete_setup(boolean) TO authenticated;

COMMENT ON FUNCTION public.sp_passport_complete_setup(boolean) IS
  'Completes the /passport/start setup for the signed-in holder: a live '
  'session, their own declaration and at least one current Passport merit '
  '(an active Passport credential or employment) are required; idempotent; '
  'the Passport number is assigned by sp_passport_number_on_complete_trg in '
  'the same transaction, never here.';

-- ── 2 · The table no longer takes a completion from a client ─────────────

-- SECURITY INVOKER on purpose: `current_user` must be the role that wrote the
-- row. Inside a SECURITY DEFINER completion it is the owner; through the Data
-- API it is the client role.
CREATE FUNCTION public.sp_passport_completion_guard()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.onboarding_state = 'completed'
          OR (TG_OP = 'UPDATE' AND OLD.onboarding_state = 'completed'))
     AND (TG_OP = 'INSERT' OR NEW.onboarding_state IS DISTINCT FROM OLD.onboarding_state) THEN
    RAISE EXCEPTION 'SP_COMPLETION_RPC_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.sp_passport_completion_guard()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.sp_passport_completion_guard() IS
  'Refuses a client role moving a Security Passport profile into or out of '
  '`completed` by writing the row; completion is decided by the SECURITY '
  'DEFINER completion functions only.';

CREATE TRIGGER sp_profile_completion_guard
  BEFORE INSERT OR UPDATE OF onboarding_state ON public.sp_passport_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sp_passport_completion_guard();

-- ── Postflight ──────────────────────────────────────────────────────────

DO $$
DECLARE
  _fn regprocedure := 'public.sp_passport_complete_setup(boolean)'::regprocedure;
  _src text;
BEGIN
  IF NOT has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_POSTFLIGHT: authenticated cannot execute the completion.';
  END IF;
  IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_POSTFLIGHT: anon can execute the completion.';
  END IF;

  -- The function must never assign or name a number itself.
  SELECT prosrc INTO _src FROM pg_proc WHERE oid = _fn;
  IF _src ILIKE '%sp_passport_numbers%' OR _src ILIKE '%sp_assign_passport_number%' THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_POSTFLIGHT: the completion names the Passport number.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'sp_profile_completion_guard'
       AND tgrelid = 'public.sp_passport_profiles'::regclass
       AND tgenabled = 'O' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_POSTFLIGHT: the profile completion guard is not installed.';
  END IF;
  IF (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.sp_passport_completion_guard()'::regprocedure) THEN
    RAISE EXCEPTION 'SP_COMPLETE_SETUP_POSTFLIGHT: the completion guard must run as the writing role.';
  END IF;
END $$;
