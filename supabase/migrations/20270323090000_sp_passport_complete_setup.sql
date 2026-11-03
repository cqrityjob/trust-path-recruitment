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
-- `declared_accurate_at`. The only writer of `completed` is
-- sp_passport_complete_first_merit, which the four-step /passport/start setup
-- no longer calls: its last step hands over to the catalogue credential form,
-- which records a claim and nothing else. So a holder who finished the setup
-- with real credentials stayed `not_started`, was never numbered and never
-- counted.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────
--
-- sp_passport_complete_setup(_declared) is the setup's own completion:
--
--   * the holder's declaration is required on every call (`_declared` must be
--     true); nothing here can record a declaration nobody made;
--   * at least one CURRENT merit (an active claim or employment) is required,
--     so an empty Passport is never completed, counted or numbered;
--   * it is idempotent: a completed Passport is left exactly as it is, so the
--     declaration date never moves and no event is written twice;
--   * the profile update and its two audit events commit together, in this
--     function's transaction.
--
-- It never names sp_passport_numbers. The number is still assigned ONLY by the
-- existing trigger, in the same transaction, once: a primary key on the holder
-- and the idempotent sp_assign_passport_number make a second number impossible.

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

-- ── The completion ──────────────────────────────────────────────────────

CREATE FUNCTION public.sp_passport_complete_setup(_declared boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _uid uuid := auth.uid();
  _now timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _declared IS NOT TRUE THEN
    RAISE EXCEPTION 'SP_DECLARATION_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  -- `active` is the one current lifecycle state (isCurrentMerit in
  -- src/lib/security-passport/types.ts). A draft or an expired credential is
  -- not Passport content, so it completes nothing.
  IF NOT EXISTS (SELECT 1 FROM public.sp_claims
                  WHERE holder_user_id = _uid AND lifecycle_state = 'active')
     AND NOT EXISTS (SELECT 1 FROM public.sp_experience_periods
                      WHERE holder_user_id = _uid AND lifecycle_state = 'active') THEN
    RAISE EXCEPTION 'SP_NO_CURRENT_MERIT' USING ERRCODE = 'check_violation';
  END IF;

  -- Fires sp_passport_number_on_complete_trg, which numbers the holder.
  UPDATE public.sp_passport_profiles
     SET onboarding_state     = 'completed',
         declared_accurate_at = _now,
         updated_at           = _now
   WHERE holder_user_id = _uid
     AND onboarding_state <> 'completed';

  IF NOT FOUND THEN
    -- Already completed: a second click, a retry or a stale tab. Nothing moves.
    IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _uid) THEN
      RAISE EXCEPTION 'SP_PROFILE_MISSING' USING ERRCODE = 'no_data_found';
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES
    (_uid, _uid, 'declaration_recorded', 'profile', NULL,
     jsonb_build_object('declared_at', _now, 'source', 'setup')),
    (_uid, _uid, 'onboarding_completed', 'profile', NULL,
     jsonb_build_object('source', 'setup'));
END $$;

REVOKE ALL ON FUNCTION public.sp_passport_complete_setup(boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sp_passport_complete_setup(boolean) TO authenticated;

COMMENT ON FUNCTION public.sp_passport_complete_setup(boolean) IS
  'Completes the /passport/start setup for the signed-in holder: their own '
  'declaration and at least one current merit are required; idempotent; the '
  'Passport number is assigned by sp_passport_number_on_complete_trg in the '
  'same transaction, never here.';

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
END $$;
