-- =============================================================================
-- Security Passport — the first merit, committed once or not at all, against a
-- record the holder cannot write.
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
-- ── WHY THE IDEMPOTENCY RECORD IS A PRIVATE TABLE ──────────────────────
--
-- The first draft of this migration used `sp_passport_events.detail`, keyed on
-- an `operation_id`, as the idempotency record. Independent review found the
-- hole, and it is a real one: `sp_passport_events` is directly insertable by
-- `authenticated`, and its RLS only checks that the holder and actor are the
-- caller. A signed-in holder could therefore INSERT an `experience_created`
-- event carrying any operation id they liked, and the function would find it
-- and return early — without ever proving that the subject row existed, that
-- it belonged to them, that it contained the facts they had just submitted,
-- that onboarding was completed, or that a declaration was recorded.
--
-- An idempotency key is a security boundary, not a convenience. So the record
-- moved to `sp_passport_operations`, which:
--
--   * has NO grants and NO policies for anon or authenticated, so the Data API
--     cannot read, write or TRUNCATE it at all;
--   * is written only by the SECURITY DEFINER functions below;
--   * binds the operation to `auth.uid()`, so an operation id belongs to one
--     holder and replaying somebody else's is refused;
--   * binds the operation to a FINGERPRINT of the facts submitted, so the same
--     id carrying different facts is refused rather than silently answering
--     with the first submission's merit;
--   * records the subject it produced, which is re-checked -- it must still
--     exist and still belong to the holder -- before any replay is answered.
--
-- `sp_passport_events` is hardened in the same breath: its INSERT policy now
-- refuses any client-written event whose `detail` carries `operation_id` or
-- `first_merit`, so the shape that was forgeable cannot be written at all.
--
-- ── THE RULE ───────────────────────────────────────────────────────────
--
-- One function, one transaction, one outcome:
--
--     the operation receipt
--   + the merit row
--   + its creation event
--   + the onboarding transition
--   + the declaration
--
-- commit together or not at all, and a retry carrying the same operation id
-- returns the merit that already exists rather than making a second one.
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
--
--   * It does not raise trust. The merit is inserted with no assertion or
--     lifecycle argument at all, so it takes the `self_declared` / `active`
--     column defaults exactly like every other holder-written row. There is
--     no branch in the body that names assertion_level, lifecycle_state,
--     verified_by_user_id or verified_at, and the postflight asserts that.
--
--   * It does not default a country. An employment period must be given one
--     explicitly (SP_WORK_COUNTRY_REQUIRED); the four non-employment kinds
--     are written with `jurisdiction_code` left NULL, because where a course
--     certificate came from is provenance the holder can add later and a
--     guess would be a claim about a market.
--
--   * It is NOT a general merit-creation API. A new first-merit operation is
--     refused once the holder already holds a current merit
--     (SP_FIRST_MERIT_ALREADY_EXISTS) -- a legitimate replay of the ORIGINAL
--     operation still answers, because that is the same submission, not a
--     second one.
--
--   * It rewrites no history and back-fills nothing. Existing events carry no
--     `operation_id`, so the new unique index — which is PARTIAL on exactly
--     that key — cannot see them and cannot fail on hosted data.
--
-- ── DEPLOY ORDER ───────────────────────────────────────────────────────
--
-- SCHEMA FIRST. This migration is safe alone and must be applied BEFORE the
-- application release that calls it: nothing existing calls the new functions,
-- and the new table and index are invisible to every row written so far. The
-- dependent application code is held out of merge by
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

  -- pgcrypto's digest(), for the request fingerprint. Present since the Phase 5
  -- migrations; named here so a missing extension fails at apply rather than at
  -- the first completion.
  IF to_regprocedure('extensions.digest(text,text)') IS NULL
     AND to_regprocedure('public.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_PREFLIGHT: pgcrypto digest() is not available.';
  END IF;

  -- How many events already carry an operation_id. Expected: zero. Counted
  -- rather than assumed, so an operator can see that the unique index below
  -- is being created over an empty key space.
  SELECT count(*) INTO _n FROM public.sp_passport_events WHERE detail ? 'operation_id';
  RAISE NOTICE 'SP_FIRST_MERIT: % existing event(s) carry an operation_id (expected 0).', _n;
END $$;


-- =============================================================================
-- 1. The operations record — server-owned, and unreachable from the Data API
-- =============================================================================
-- Everything about this table is chosen so that a caller cannot influence it
-- except by asking a SECURITY DEFINER function to act on their behalf:
--
--   * no `GRANT` to anon or authenticated, and an explicit REVOKE, because
--     Supabase's ALTER DEFAULT PRIVILEGES hands anon the full set on every new
--     table in `public` — including TRUNCATE, which RLS does not cover;
--   * RLS enabled with NO policies, so even if a grant were restored the Data
--     API would match no rows;
--   * `holder_user_id` taken from `auth.uid()` inside the functions and never
--     from a parameter, so there is no argument that writes into another
--     account.
CREATE TABLE IF NOT EXISTS public.sp_passport_operations (
  operation_id uuid PRIMARY KEY,

  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  operation_kind text NOT NULL
    CHECK (operation_kind IN ('passport_create', 'first_merit')),

  -- A canonical digest of exactly the facts the caller submitted. Replaying an
  -- operation id with different facts is a different submission wearing an old
  -- name, and answering it with the first submission's merit would be the
  -- product quietly discarding what somebody typed.
  --
  -- Empty for `passport_create`, which carries no facts.
  request_fingerprint text NOT NULL,

  subject_type text CHECK (subject_type IN ('profile', 'experience', 'claim')),
  subject_id   uuid,

  -- NULL means "begun and not finished". Because the receipt and the work
  -- commit in ONE transaction, a committed row with a NULL completed_at can
  -- only be a row whose transaction is still open -- which is exactly the
  -- state a concurrent caller blocks on.
  completed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_operation_complete_names_subject CHECK (
    completed_at IS NULL OR (subject_type IS NOT NULL AND subject_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS sp_passport_operations_holder_idx
  ON public.sp_passport_operations (holder_user_id, operation_kind);

-- One Passport-creation receipt per holder. This is what makes concurrent
-- `sp_passport_ensure` calls produce one profile AND one receipt rather than
-- one profile and two.
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


-- =============================================================================
-- 1b. Ordered draft persistence
-- =============================================================================
-- The first-run draft autosaves on a debounce. The browser can therefore have
-- two saves in flight, and nothing made them land in order: save A with older
-- answers could arrive AFTER save B with newer ones and quietly restore what
-- the holder had already corrected -- and worse, after a completion, put
-- `onboarding_state` back to `in_progress` on a Passport that was finished.
--
-- A React-side queue is not enough, because two tabs are two Reacts. The
-- ordering rule belongs where the row is, so the save is written as a single
-- conditional UPDATE:
--
--   SET  onboarding_draft_revision = :revision, ...
--   WHERE holder_user_id = auth.uid()
--     AND onboarding_draft_revision < :revision      -- never go backwards
--     AND onboarding_state <> 'completed'            -- never reopen a finish
--
-- One statement, so the comparison and the write cannot be separated. A save
-- that matches nothing affects nothing, and the caller is told which of the
-- two rules refused it.
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


-- =============================================================================
-- 2. The audit log stops being forgeable in the shape that mattered
-- =============================================================================
-- The old idempotency design read `detail->>'operation_id'` off an event a
-- holder could write. The design no longer trusts that field -- but leaving it
-- writable would leave a holder able to poison their own operation ids against
-- the unique index below, and would leave a shape in the log that LOOKS
-- authoritative to the next reader. Both are closed here.
--
-- Nothing legitimate is broken: every client-side event insert in the
-- application (entries.functions.ts, passport.functions.ts) writes a detail
-- object with neither key, and the two functions in this migration are
-- SECURITY DEFINER and are not subject to this policy.
DROP POLICY IF EXISTS sp_events_self_insert ON public.sp_passport_events;
CREATE POLICY sp_events_self_insert ON public.sp_passport_events
  FOR INSERT TO authenticated
  WITH CHECK (
    holder_user_id = auth.uid()
    AND actor_user_id = auth.uid()
    -- A client may record what it did. It may not mint an operation receipt,
    -- and it may not claim an entry was somebody's first merit.
    AND NOT (detail ? 'operation_id')
    AND NOT (detail ? 'first_merit'));

-- At most one event of each type per operation. Kept from the first draft --
-- it is still a true invariant and still worth having in the database -- but
-- it is no longer what idempotency RESTS on, and with the policy above a
-- client can no longer collide with it.
--
-- PARTIAL on `detail ? 'operation_id'` so every event written before this
-- release is excluded and creating the index on hosted data cannot fail on
-- history it was never meant to govern.
CREATE UNIQUE INDEX IF NOT EXISTS sp_events_one_per_operation
  ON public.sp_passport_events ((detail ->> 'operation_id'), event_type)
  WHERE detail ? 'operation_id';

COMMENT ON INDEX public.sp_events_one_per_operation IS
  'At most one event of each type per Passport operation. Traceability, not '
  'authority: idempotency is decided by sp_passport_operations, which no '
  'client can write.';


-- =============================================================================
-- 3. Canonical fingerprint of one first-merit submission
-- =============================================================================
-- IMMUTABLE and pure, so it can be reasoned about and re-derived. The values
-- are trimmed exactly as the writer trims them and joined with a separator
-- that cannot occur in any of them, so two different submissions cannot
-- collide by concatenation.
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


-- =============================================================================
-- 4. Passport creation — the profile and its receipt, in one transaction
-- =============================================================================
-- The previous implementation did an upsert and then, in a SEPARATE PostgREST
-- request, an event insert. If the second failed the profile survived, and
-- every retry saw a profile and never repaired the missing record -- an
-- account whose Passport existed with nothing to say when or by whom it was
-- created.
--
-- Both writes are here now, in one transaction, and a retry repairs a legacy
-- profile that predates the receipt rather than shrugging at it.
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

  -- ON CONFLICT DO NOTHING rather than SELECT-then-INSERT: two clicks a few
  -- milliseconds apart both passed the old read, and the second INSERT failed
  -- on the primary key -- which a person creating their Passport for the first
  -- time saw as an error while their Passport was in fact created.
  INSERT INTO public.sp_passport_profiles (holder_user_id, question_version)
  VALUES (_uid, coalesce(_question_version, 'sp-q-v1'))
  ON CONFLICT (holder_user_id) DO NOTHING;
  _created := FOUND;

  -- The receipt. `ON CONFLICT DO NOTHING` against the partial unique index, so
  -- a concurrent caller blocks here until the winner commits and then writes
  -- nothing: one profile, one receipt.
  INSERT INTO public.sp_passport_operations
    (operation_id, holder_user_id, operation_kind, request_fingerprint,
     subject_type, subject_id, completed_at)
  VALUES (gen_random_uuid(), _uid, 'passport_create', '',
          'profile', _uid, now())
  ON CONFLICT (holder_user_id) WHERE operation_kind = 'passport_create' DO NOTHING;

  IF NOT FOUND THEN
    -- A receipt already existed, so this call created nothing new.
    RETURN QUERY SELECT _created, false;
    RETURN;
  END IF;

  -- We wrote the receipt. Either the profile is new, or it is a LEGACY profile
  -- that predates this mechanism and has just been repaired.
  _repaired := NOT _created;

  -- The event, only when the log does not already carry one. A legacy Passport
  -- that was created properly in 2026 must not gain a second birth record; a
  -- legacy Passport with none gains the honest one it never had, marked as
  -- back-filled so nobody later reads it as a creation timestamp.
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


-- =============================================================================
-- 5. The first merit — the whole operation, or none of it
-- =============================================================================
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

  _fp := public.sp_first_merit_fingerprint(
    _merit_kind, _title_t, _org_t,
    CASE WHEN _merit_kind = 'employment' THEN _country_t ELSE NULL END,
    _started_on, _ended_on);

  -- ── 0. ONE FIRST-RUN DECISION PER HOLDER AT A TIME ─────────────────
  --
  -- Two requests carrying the SAME operation id serialise on the receipt's
  -- primary key below. Two requests carrying DIFFERENT operation ids do not:
  -- each inserts its own receipt without conflict, each reaches the
  -- current-merit check, each sees no committed merit, and each creates one
  -- -- two first merits, two declarations, two completions, for one person
  -- who pressed Save in two tabs.
  --
  -- So the decision "does this holder already hold a current merit" is
  -- serialised per holder, HERE, before anything is read or written. A
  -- transaction-scoped advisory lock rather than a row lock because there is
  -- not always a row: the Passport may not exist yet, and a lock on a row
  -- that is about to be created protects nothing. It is:
  --
  --   * keyed to auth.uid(), which no parameter can supply;
  --   * released at commit or rollback, so it is not a permanent constraint
  --     -- a holder whose only merit is later archived returns to the first
  --     run and may take it again, exactly as the persisted-state rule says;
  --   * held across the replay branch too, so a legitimate retry of the
  --     original id WAITS behind an in-flight attempt and then answers with
  --     its merit, rather than racing it.
  --
  -- The concurrent loser wakes up inside its own transaction, sees the
  -- winner's committed merit, raises SP_FIRST_MERIT_ALREADY_EXISTS, and its
  -- own receipt rolls back with it. Two processes prove exactly that in
  -- supabase/tests/security_passport_first_merit_two_ops_race_test.sql.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('sp_passport_first_merit:' || _uid::text, 0));

  -- ── 1. CLAIM THE OPERATION ─────────────────────────────────────────
  --
  -- The receipt is written FIRST and in the same transaction as everything
  -- below it, so a committed receipt and a committed merit are the same fact.
  -- A concurrent caller with the same id waits on the holder lock above,
  -- then finds the receipt here and falls into the replay branch.
  INSERT INTO public.sp_passport_operations
    (operation_id, holder_user_id, operation_kind, request_fingerprint)
  VALUES (_operation_id, _uid, 'first_merit', _fp)
  ON CONFLICT (operation_id) DO NOTHING;
  _fresh := FOUND;

  IF NOT _fresh THEN
    -- ── 2. A REPLAY. PROVE IT BEFORE ANSWERING IT ────────────────────
    SELECT * INTO _op FROM public.sp_passport_operations
     WHERE operation_id = _operation_id FOR UPDATE;

    IF _op.holder_user_id <> _uid OR _op.operation_kind <> 'first_merit' THEN
      -- Somebody else's operation, or an operation of another kind. Answering
      -- with its subject would be a cross-holder read.
      RAISE EXCEPTION 'SP_OPERATION_ID_CONFLICT' USING ERRCODE = 'check_violation';
    END IF;

    IF _op.request_fingerprint <> _fp THEN
      -- The same name over different facts. Answering with the first
      -- submission's merit would silently discard what the caller just typed.
      RAISE EXCEPTION 'SP_OPERATION_FACTS_CHANGED' USING ERRCODE = 'check_violation';
    END IF;

    IF _op.completed_at IS NOT NULL THEN
      -- The subject must STILL exist and STILL belong to this holder. A
      -- receipt is a record of what happened, not a promise that it survived
      -- -- a withdrawn or deleted subject must not be reported as saved.
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

      -- And the rest of the operation must really have happened.
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
    -- A committed receipt with no completion cannot arise from this function
    -- -- the two are one transaction. Reaching here means an earlier attempt
    -- died in a way that left the row; the lock is held, so finishing it is
    -- correct and cannot race.
  END IF;

  -- ── 3. THIS IS THE FIRST MERIT, AND ONLY THE FIRST ─────────────────
  --
  -- Reached only by a NEW operation. A holder who already has a current merit
  -- is past their first run, and a second "first merit" would mint a second
  -- declaration and a second onboarding_completed into an append-only log.
  -- The ordinary add path is where later merits belong.
  IF EXISTS (SELECT 1 FROM public.sp_experience_periods
              WHERE holder_user_id = _uid AND lifecycle_state = 'active')
     OR EXISTS (SELECT 1 FROM public.sp_claims
                 WHERE holder_user_id = _uid AND lifecycle_state = 'active') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_ALREADY_EXISTS' USING ERRCODE = 'check_violation';
  END IF;

  -- ── 4. THE PASSPORT ITSELF ─────────────────────────────────────────
  PERFORM public.sp_passport_ensure();

  SELECT question_version INTO _qv
    FROM public.sp_passport_profiles WHERE holder_user_id = _uid;

  -- ── 5. THE MERIT AND ITS CREATION EVENT ────────────────────────────
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

    -- `credential_code` is deliberately never set. A first merit is free text;
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

  -- ── 6. CLOSE ONBOARDING, IN THE SAME TRANSACTION ───────────────────
  --
  -- The declaration is stamped with the time it was MADE, which is now.
  --
  -- The first draft wrote `coalesce(declared_accurate_at, now())`, which for
  -- the supported legacy shape -- a profile marked `completed` in the past,
  -- carrying an old declaration, holding no merit -- gave the merit created
  -- today a declaration dated before it existed. A declaration is an act, and
  -- this act is happening now. An idempotent REPLAY never reaches here, so the
  -- original time is still what a re-submission preserves.
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

  -- ── 7. THE RECEIPT NOW POINTS AT SOMETHING REAL ────────────────────
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


-- =============================================================================
-- 6. Assert the end state, in the same transaction
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
     OR _src NOT LIKE '%SP_OPERATION_FACTS_CHANGED%'
     OR _src NOT LIKE '%SP_OPERATION_SUBJECT_MISSING%'
     OR _src NOT LIKE '%SP_FIRST_MERIT_ALREADY_EXISTS%'
     OR _src NOT LIKE '%SP_NOT_AUTHENTICATED%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: a named refusal is missing from the body.';
  END IF;

  -- The per-holder serialisation, and its position: BEFORE the receipt is
  -- claimed and BEFORE the current-merit check. A lock taken after either is
  -- a lock taken after the race.
  IF position('pg_advisory_xact_lock' IN _src) = 0 THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the per-holder advisory lock is missing.';
  END IF;
  -- Positions are measured against the STATEMENTS, not the comments that
  -- explain them: the lock's own comment names the refusal it prevents.
  IF position('pg_advisory_xact_lock' IN _src) > position('INSERT INTO public.sp_passport_operations' IN _src)
     OR position('pg_advisory_xact_lock' IN _src) > position($q$RAISE EXCEPTION 'SP_FIRST_MERIT_ALREADY_EXISTS'$q$ IN _src) THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the advisory lock is taken too late to serialise the first-merit decision.';
  END IF;

  -- Idempotency must rest on the private table, not on the audit log.
  IF _src NOT LIKE '%sp_passport_operations%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body does not use the operations receipt.';
  END IF;
  IF _src LIKE '%detail ->> ''operation_id'' = %' OR _src LIKE '%detail->>''operation_id'' = %' THEN
    RAISE EXCEPTION
      'SP_FIRST_MERIT_POSTFLIGHT: the body reads idempotency out of the client-writable audit log.';
  END IF;

  -- IT CANNOT RAISE TRUST. Not a convention here -- an assertion. If any of
  -- these four identifiers ever appears in this body, the one function in the
  -- codebase that creates a merit could also decide it was verified.
  IF _src LIKE '%assertion_level%'
     OR _src LIKE '%verified_by_user_id%'
     OR _src LIKE '%verified_at%' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body names a trust column it must not write.';
  END IF;
  -- `lifecycle_state` appears once, in the first-merit READ that decides
  -- whether a current merit already exists. It must never appear in a write.
  IF _src ~* 'set[[:space:]]+lifecycle_state' OR _src ~* 'lifecycle_state[[:space:]]*=[[:space:]]*''(draft|expired|revoked|superseded|disputed|withdrawn)''' THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: the body writes a lifecycle state.';
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

  -- anon holds nothing on either function; authenticated holds EXECUTE.
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

  -- THE OPERATIONS TABLE IS UNREACHABLE FROM THE DATA API.
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

  -- The audit log can no longer be given an operation id by a client.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'sp_passport_events'
       AND policyname = 'sp_events_self_insert'
       AND with_check LIKE '%operation_id%' AND with_check LIKE '%first_merit%') THEN
    RAISE EXCEPTION
      'SP_FIRST_MERIT_POSTFLIGHT: the events insert policy does not refuse operation_id / first_merit.';
  END IF;

  -- The draft revision column, which ordered persistence rests on.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sp_passport_profiles'
       AND column_name = 'onboarding_draft_revision') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: onboarding_draft_revision is missing.';
  END IF;

  -- The append-only trigger this function's audit writes rely on.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_events_append_only') THEN
    RAISE EXCEPTION 'SP_FIRST_MERIT_POSTFLIGHT: sp_events_append_only is gone.';
  END IF;
END $$;

COMMIT;
