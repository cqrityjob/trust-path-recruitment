DO $$
DECLARE _n bigint;
BEGIN
  IF to_regclass('public.sp_passport_profiles') IS NULL
     OR to_regclass('public.sp_experience_periods') IS NULL
     OR to_regclass('public.sp_claims') IS NULL
     OR to_regclass('public.sp_passport_events') IS NULL THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_PREFLIGHT: a Security Passport table is missing.';
  END IF;

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

  IF to_regprocedure('extensions.digest(text,text)') IS NULL
     AND to_regprocedure('public.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_PREFLIGHT: pgcrypto digest() is not available.';
  END IF;

  SELECT count(*) INTO _n FROM public.sp_passport_events WHERE detail ? 'operation_id';
  RAISE NOTICE 'SP_FIRST_MERIT: % existing event(s) carry an operation_id (expected 0).', _n;
END $$;


CREATE TABLE IF NOT EXISTS public.sp_passport_operations (
  operation_id uuid PRIMARY KEY,

  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  operation_kind text NOT NULL
    CHECK (operation_kind IN ('passport_create', 'first_merit')),

  request_fingerprint text NOT NULL,

  subject_type text CHECK (subject_type IN ('profile', 'experience', 'claim')),
  subject_id   uuid,

  completed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_operation_complete_names_subject CHECK (
    completed_at IS NULL OR (subject_type IS NOT NULL AND subject_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS sp_passport_operations_holder_idx
  ON public.sp_passport_operations (holder_user_id, operation_kind);

CREATE UNIQUE INDEX IF NOT EXISTS sp_passport_operations_one_create_per_holder
  ON public.sp_passport_operations (holder_user_id)
  WHERE operation_kind = 'passport_create';

ALTER TABLE public.sp_passport_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_passport_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.sp_passport_operations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.sp_passport_operations IS
  'Server-owned idempotency receipts for Passport operations. Written ONLY by '
  'sp_passport_ensure and sp_passport_complete_first_merit; anon and '
  'authenticated hold no grant of any kind (TRUNCATE included) and RLS is '
  'enabled with no policies, so the Data API cannot reach it. An operation is '
  'bound to the authenticated holder and to a fingerprint of the facts it was '
  'asked to record, so a replay with different facts is refused rather than '
  'answered with an earlier submission.';


ALTER TABLE public.sp_passport_profiles
  ADD COLUMN IF NOT EXISTS onboarding_draft_revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.sp_passport_profiles
  DROP CONSTRAINT IF EXISTS sp_profile_draft_revision_non_negative;
ALTER TABLE public.sp_passport_profiles
  ADD CONSTRAINT sp_profile_draft_revision_non_negative
  CHECK (onboarding_draft_revision >= 0);

COMMENT ON COLUMN public.sp_passport_profiles.onboarding_draft_revision IS
  'Monotonic revision of the first-run draft. A save must carry a strictly '
  'greater revision than the stored one, which is what makes two autosaves in '
  'flight land in order rather than in whichever order the network delivers.';


DROP POLICY IF EXISTS sp_events_self_insert ON public.sp_passport_events;
CREATE POLICY sp_events_self_insert ON public.sp_passport_events
  FOR INSERT TO authenticated
  WITH CHECK (
    holder_user_id = auth.uid()
    AND actor_user_id = auth.uid()
    AND NOT (detail ? 'operation_id')
    AND NOT (detail ? 'first_merit'));

CREATE UNIQUE INDEX IF NOT EXISTS sp_events_one_per_operation
  ON public.sp_passport_events ((detail ->> 'operation_id'), event_type)
  WHERE detail ? 'operation_id';

COMMENT ON INDEX public.sp_events_one_per_operation IS
  'At most one event of each type per Passport operation. Traceability, not '
  'authority: idempotency is decided by sp_passport_operations, which no '
  'client can write.';


CREATE OR REPLACE FUNCTION public.sp_first_merit_fingerprint(
  _merit_kind text, _title text, _organisation text,
  _country text, _started_on date, _ended_on date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(
    digest(
      concat_ws(u&'\001f',
        coalesce(_merit_kind, ''),
        btrim(coalesce(_title, '')),
        btrim(coalesce(_organisation, '')),
        upper(btrim(coalesce(_country, ''))),
        coalesce(_started_on::text, ''),
        coalesce(_ended_on::text, '')),
      'sha256'),
    'hex');
$$;

REVOKE ALL ON FUNCTION public.sp_first_merit_fingerprint(text, text, text, text, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_first_merit_fingerprint(text, text, text, text, date, date)
  TO authenticated;

COMMENT ON FUNCTION public.sp_first_merit_fingerprint(text, text, text, text, date, date) IS
  'The canonical digest of one first-merit submission. Binding an operation id '
  'to this is what makes a replay carrying different facts refusable.';


CREATE OR REPLACE FUNCTION public.sp_passport_ensure(_question_version text DEFAULT 'sp-q-v1')
RETURNS TABLE (created boolean, repaired boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid      uuid := auth.uid();
  _created  boolean := false;
  _repaired boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.sp_passport_profiles (holder_user_id, question_version)
  VALUES (_uid, coalesce(_question_version, 'sp-q-v1'))
  ON CONFLICT (holder_user_id) DO NOTHING;
  _created := FOUND;

  INSERT INTO public.sp_passport_operations
    (operation_id, holder_user_id, operation_kind, request_fingerprint,
     subject_type, subject_id, completed_at)
  VALUES (gen_random_uuid(), _uid, 'passport_create', '',
          'profile', _uid, now())
  ON CONFLICT (holder_user_id) WHERE operation_kind = 'passport_create' DO NOTHING;

  IF NOT FOUND THEN
    RETURN QUERY SELECT _created, false;
    RETURN;
  END IF;

  _repaired := NOT _created;

  IF NOT EXISTS (
    SELECT 1 FROM public.sp_passport_events
     WHERE holder_user_id = _uid AND event_type = 'passport_created') THEN
    INSERT INTO public.sp_passport_events
      (holder_user_id, actor_user_id, event_type, subject_type, detail)
    VALUES (_uid, _uid, 'passport_created', 'profile',
            jsonb_build_object('question_version', coalesce(_question_version, 'sp-q-v1'),
                               'backfilled', _repaired));
  END IF;

  RETURN QUERY SELECT _created, _repaired;
END $$;

REVOKE ALL ON FUNCTION public.sp_passport_ensure(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_passport_ensure(text) TO authenticated;

COMMENT ON FUNCTION public.sp_passport_ensure(text) IS
  'Creates the caller''s Passport and its creation receipt in ONE transaction, '
  'or repairs a legacy profile that has no receipt. Idempotent and safe under '
  'concurrency: two simultaneous calls produce one profile and one receipt. '
  'Takes no holder parameter -- the holder is auth.uid() -- so no argument can '
  'target another account.';


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
  _op         public.sp_passport_operations%ROWTYPE;
  _claim_type text;
  _sid        uuid;
  _skind      text;
  _fresh      boolean;
  _qv         text;
  _now        timestamptz := now();
  _fp         text;
  _exists     boolean;
  _title_t    text := btrim(coalesce(_title, ''));
  _org_t      text := btrim(coalesce(_organisation, ''));
  _country_t  text := nullif(upper(btrim(coalesce(_country, ''))), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'SP_OPERATION_ID_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF _declared IS NOT TRUE THEN
    RAISE EXCEPTION 'SP_DECLARATION_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF _merit_kind IS NULL
     OR _merit_kind NOT IN ('employment', 'education', 'course', 'certification', 'licence') THEN
    RAISE EXCEPTION 'SP_MERIT_KIND_UNKNOWN: %', coalesce(_merit_kind, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

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
    IF _ended_on IS NOT NULL AND _started_on IS NOT NULL AND _ended_on <= _started_on THEN
      RAISE EXCEPTION 'SP_CLAIM_END_BEFORE_START' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  _fp := public.sp_first_merit_fingerprint(
    _merit_kind, _title_t, _org_t,
    CASE WHEN _merit_kind = 'employment' THEN _country_t ELSE NULL END,
    _started_on, _ended_on);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sp_passport_first_merit:' || _uid::text, 0));

  INSERT INTO public.sp_passport_operations
    (operation_id, holder_user_id, operation_kind, request_fingerprint)
  VALUES (_operation_id, _uid, 'first_merit', _fp)
  ON CONFLICT (operation_id) DO NOTHING;
  _fresh := FOUND;

  IF NOT _fresh THEN
    SELECT * INTO _op FROM public.sp_passport_operations
     WHERE operation_id = _operation_id FOR UPDATE;

    IF _op.holder_user_id <> _uid OR _op.operation_kind <> 'first_merit' THEN
      RAISE EXCEPTION 'SP_OPERATION_ID_CONFLICT' USING ERRCODE = 'check_violation';
    END IF;

    IF _op.request_fingerprint <> _fp THEN
      RAISE EXCEPTION 'SP_OPERATION_FACTS_CHANGED' USING ERRCODE = 'check_violation';
    END IF;

    IF _op.completed_at IS NOT NULL THEN
      IF _op.subject_type = 'experience' THEN
        SELECT EXISTS (SELECT 1 FROM public.sp_experience_periods
                        WHERE id = _op.subject_id AND holder_user_id = _uid) INTO _exists;
      ELSE
        SELECT EXISTS (SELECT 1 FROM public.sp_claims
                        WHERE id = _op.subject_id AND holder_user_id = _uid) INTO _exists;
      END IF;
      IF NOT _exists THEN
        RAISE EXCEPTION 'SP_OPERATION_SUBJECT_MISSING' USING ERRCODE = 'no_data_found';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.sp_passport_profiles
         WHERE holder_user_id = _uid
           AND onboarding_state = 'completed'
           AND declared_accurate_at IS NOT NULL) THEN
        RAISE EXCEPTION 'SP_OPERATION_INCOMPLETE' USING ERRCODE = 'no_data_found';
      END IF;

      RETURN QUERY SELECT _op.subject_type, _op.subject_id, false;
      RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_experience_periods
              WHERE holder_user_id = _uid AND lifecycle_state = 'active')
     OR EXISTS (SELECT 1 FROM public.sp_claims
                 WHERE holder_user_id = _uid AND lifecycle_state = 'active') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ALREADY_EXISTS' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.sp_passport_ensure();

  SELECT question_version INTO _qv
    FROM public.sp_passport_profiles WHERE holder_user_id = _uid;

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

  UPDATE public.sp_passport_profiles
     SET onboarding_state     = 'completed',
         declared_accurate_at = _now,
         updated_at           = _now
   WHERE holder_user_id = _uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_PROFILE_MISSING' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES
    (_uid, _uid, 'declaration_recorded', 'profile', NULL,
     jsonb_build_object('operation_id', _operation_id::text,
                        'declared_at', _now,
                        'question_version', _qv)),
    (_uid, _uid, 'onboarding_completed', 'profile', NULL,
     jsonb_build_object('operation_id', _operation_id::text,
                        'merit_kind', _merit_kind));

  UPDATE public.sp_passport_operations
     SET subject_type = _skind, subject_id = _sid, completed_at = _now
   WHERE operation_id = _operation_id;

  RETURN QUERY SELECT _skind, _sid, true;
END $$;

REVOKE ALL ON FUNCTION public.sp_passport_complete_first_merit(uuid, text, text, text, text, date, date, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_passport_complete_first_merit(uuid, text, text, text, text, date, date, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.sp_passport_complete_first_merit(uuid, text, text, text, text, date, date, boolean) IS
  'The first-run completion, as one transaction: the operation receipt, the '
  'merit row, its creation event, the onboarding transition and the '
  'truthfulness declaration commit together or not at all. Idempotency rests on '
  'sp_passport_operations, which no client can write, and a replay is answered '
  'only after proving the operation belongs to the caller, carries the same '
  'fingerprint of the same facts, and points at a subject that still exists and '
  'still belongs to them. Refuses a completion with no explicit declaration '
  'before writing anything (SP_DECLARATION_REQUIRED), refuses an employment '
  'period with no stated country (SP_WORK_COUNTRY_REQUIRED, never a default), '
  'refuses a NEW first-merit operation once a current merit exists '
  '(SP_FIRST_MERIT_ALREADY_EXISTS -- this is not a general merit API), serialises '
  'that decision per holder with a transaction-scoped advisory lock keyed to '
  'auth.uid() so two concurrent requests with different operation ids produce '
  'one merit and one refusal, and writes no assertion or lifecycle value at all, '
  'so the merit takes the self_declared / active column defaults like every other '
  'holder-written row.';


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

  IF _src NOT LIKE '%SP_DECLARATION_REQUIRED%'
     OR _src NOT LIKE '%SP_WORK_COUNTRY_REQUIRED%'
     OR _src NOT LIKE '%SP_MERIT_KIND_UNKNOWN%'
     OR _src NOT LIKE '%SP_TITLE_REQUIRED%'
     OR _src NOT LIKE '%SP_ORGANISATION_REQUIRED%'
     OR _src NOT LIKE '%SP_OPERATION_ID_REQUIRED%'
     OR _src NOT LIKE '%SP_OPERATION_ID_CONFLICT%'
     OR _src NOT LIKE '%SP_OPERATION_FACTS_CHANGED%'
     OR _src NOT LIKE '%SP_OPERATION_SUBJECT_MISSING%'
     OR _src NOT LIKE '%SP_FIRST_MERIT_ALREADY_EXISTS%'
     OR _src NOT LIKE '%SP_NOT_AUTHENTICATED%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: a named refusal is missing from the body.';
  END IF;

  IF position('pg_advisory_xact_lock' IN _src) = 0 THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the per-holder advisory lock is missing.';
  END IF;
  IF position('pg_advisory_xact_lock' IN _src) > position('INSERT INTO public.sp_passport_operations' IN _src)
     OR position('pg_advisory_xact_lock' IN _src) > position($q$RAISE EXCEPTION 'SP_FIRST_MERIT_ALREADY_EXISTS'$q$ IN _src) THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the advisory lock is taken too late to serialise the first-merit decision.';
  END IF;

  IF _src NOT LIKE '%sp_passport_operations%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body does not use the operations receipt.';
  END IF;
  IF _src LIKE '%detail ->> ''operation_id'' = %' OR _src LIKE '%detail->>''operation_id'' = %' THEN
    RAISE EXCEPTION
      'SP_FIRST_MERIT_POSTFLIGHT: the body reads idempotency out of the client-writable audit log.';
  END IF;

  IF _src LIKE '%assertion_level%'
     OR _src LIKE '%verified_by_user_id%'
     OR _src LIKE '%verified_at%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body names a trust column it must not write.';
  END IF;
  IF _src ~* 'set[[:space:]]+lifecycle_state' OR _src ~* 'lifecycle_state[[:space:]]*=[[:space:]]*''(draft|expired|revoked|superseded|disputed|withdrawn)''' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body writes a lifecycle state.';
  END IF;

  IF _src LIKE '%''SE''%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body names a literal country.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'sp_events_one_per_operation') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: sp_events_one_per_operation was not created.';
  END IF;

  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('sp_passport_complete_first_merit', 'sp_passport_ensure',
                       'sp_first_merit_fingerprint')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: grants are wrong (anon/PUBLIC can execute, or authenticated cannot).';
  END IF;

  IF has_table_privilege('anon', 'public.sp_passport_operations', 'SELECT')
     OR has_table_privilege('anon', 'public.sp_passport_operations', 'INSERT')
     OR has_table_privilege('anon', 'public.sp_passport_operations', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.sp_passport_operations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sp_passport_operations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sp_passport_operations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.sp_passport_operations', 'DELETE')
     OR has_table_privilege('authenticated', 'public.sp_passport_operations', 'TRUNCATE') THEN
    RAISE EXCEPTION
      'SP_FIRST_MERIT_POSTFLIGHT: sp_passport_operations is reachable from the Data API.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity
            FROM pg_class WHERE oid = 'public.sp_passport_operations'::regclass) THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: RLS is not enabled and forced on the operations table.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'sp_passport_operations') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the operations table has a policy; it must have none.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'sp_passport_events'
       AND policyname = 'sp_events_self_insert'
       AND with_check LIKE '%operation_id%' AND with_check LIKE '%first_merit%') THEN
    RAISE EXCEPTION
      'SP_FIRST_MERIT_POSTFLIGHT: the events insert policy does not refuse operation_id / first_merit.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sp_passport_profiles'
       AND column_name = 'onboarding_draft_revision') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: onboarding_draft_revision is missing.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_events_append_only') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: sp_events_append_only is gone.';
  END IF;
END $$;