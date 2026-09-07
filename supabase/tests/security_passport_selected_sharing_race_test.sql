-- =============================================================================
-- Security Passport — two callers, one request key, one link.
--
-- ── WHY THIS NEEDS TWO PROCESSES ───────────────────────────────────────
--
-- Everything else about idempotency can be asserted in one session: send the
-- key twice, get a replay. That proves the SEQUENTIAL case and nothing about
-- the one that actually happens — two browser tabs, a double submit, or a
-- client retrying a request whose answer was slow, arriving at the same
-- moment.
--
-- In one connection those two calls cannot overlap. So this suite is driven
-- from scripts/db-test.sh with two real psql processes: A calls the create and
-- then holds its transaction open, B calls it with the same key while A is
-- still uncommitted, and the shell asserts the timing the database cannot
-- observe about itself.
--
-- ── WHAT THE PROTECTION IS ─────────────────────────────────────────────
--
-- `pg_advisory_xact_lock` on (holder, request_key). Without it both callers
-- pass the "does a row already exist" check, both INSERT, and the loser meets
-- the unique index: a 23505 carrying the index name, which a client reads as
-- a server fault rather than as the successful creation it actually is.
--
-- The harness polls `pg_locks` for the ADVISORY lock specifically, which is
-- what makes removing the lock detectable: the unique index would still
-- serialise the two INSERTs and B would still wait, so "B waited" alone is
-- not evidence that the intended protection is present.
--
-- Phases: `-v phase=setup` before the race, `-v phase=verify` after it.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\if :{?phase}
\else
  \set phase 'setup'
\endif

-- psql does not interpolate :'phase' inside a dollar-quoted body, so the phase
-- travels through a GUC the block can read. Same mechanism as
-- security_passport_rollback_correction_test.sql.
SELECT set_config('sp.share_race_phase', :'phase', false);

-- Created OUTSIDE the block, and in both phases: a DECLARE resolves its
-- %ROWTYPE when the block is compiled, so a table the setup phase has not yet
-- created cannot be named in a declaration the setup phase also runs.
CREATE TABLE IF NOT EXISTS public.sp_share_race_out (
  session       text PRIMARY KEY,
  status        text,
  disclosure_id uuid,
  has_token     boolean
);

DO $race$
DECLARE
  _phase text := current_setting('sp.share_race_phase');
  _h uuid := 'd2000000-0000-4000-8000-000000000001';
  _claim uuid := 'd2c00000-0000-4000-8000-000000000001';
  _key uuid := 'd2a00000-0000-4000-8000-000000000001';
  _a public.sp_share_race_out%ROWTYPE;
  _b public.sp_share_race_out%ROWTYPE;
  _n integer;
BEGIN
IF _phase = 'setup' THEN

  -- The shell reads both sessions' answers out of that table, because a psql
  -- heredoc's stdout is not a reliable structure to assert against.
  DELETE FROM public.sp_share_race_out;

  INSERT INTO auth.users (id, email)
  VALUES (_h, 'sel-race-holder@example.test') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
  VALUES (_h, 'Rasmus Race (fiktiv)', 'SE') ON CONFLICT (holder_user_id) DO NOTHING;

  INSERT INTO public.sp_claims
    (id, holder_user_id, claim_type, title, jurisdiction_code, claimed_issuer_name,
     issued_on, assertion_level, lifecycle_state)
  VALUES (_claim, _h, 'training', 'Race-merit (fiktiv)', 'SE', 'Utbildaren AB (fiktiv)',
          DATE '2024-01-01', 'self_declared', 'active')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'ok  setup: one holder, one shareable merit, one request key';

ELSIF _phase = 'verify' THEN

  SELECT * INTO _a FROM public.sp_share_race_out WHERE session = 'A';
  SELECT * INTO _b FROM public.sp_share_race_out WHERE session = 'B';

  IF _a.disclosure_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 session A recorded no disclosure';
  END IF;
  RAISE NOTICE 'ok  1.1 the first caller created a share';

  IF _a.status <> 'created' OR _a.has_token IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 A got % / token %', _a.status, _a.has_token;
  END IF;
  RAISE NOTICE 'ok  1.2 and it is the one that received the token';

  IF _b.disclosure_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 session B recorded nothing — it errored '
      'instead of being handed the winner''s answer';
  END IF;
  IF _b.status <> 'already_created' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.4 B got status %, expected already_created', _b.status;
  END IF;
  RAISE NOTICE 'ok  1.3 the simultaneous caller was told the share already exists';

  IF _b.disclosure_id <> _a.disclosure_id THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.5 B was given a DIFFERENT share (% vs %)',
      _b.disclosure_id, _a.disclosure_id;
  END IF;
  RAISE NOTICE 'ok  1.4 and it is the same share, not a second one';

  IF _b.has_token IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.6 B was handed a token it must not have';
  END IF;
  RAISE NOTICE 'ok  1.5 with no token, because only the winner ever holds one';

  SELECT count(*) INTO _n FROM public.sp_disclosures
   WHERE holder_user_id = _h AND request_key = _key;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.7 % rows exist for one request key', _n;
  END IF;
  RAISE NOTICE 'ok  1.6 exactly one row exists for the key';

  SELECT count(*) INTO _n FROM public.sp_disclosure_items i
    JOIN public.sp_disclosures d ON d.id = i.disclosure_id
   WHERE d.holder_user_id = _h AND d.request_key = _key;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.8 the surviving share carries % items, expected 1', _n;
  END IF;
  RAISE NOTICE 'ok  1.7 carrying exactly the one merit both callers asked for';

ELSE
  RAISE EXCEPTION 'unknown phase %, expected setup or verify', _phase;
END IF;
END $race$;
