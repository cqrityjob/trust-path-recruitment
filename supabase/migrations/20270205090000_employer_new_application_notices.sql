-- =============================================================================
-- E-mail to the employer when a candidate submits a NEW application
-- =============================================================================
--
-- WHAT THIS IS. Today an employer learns that somebody applied only by opening
-- the workspace. This adds the database half of "e-post till arbetsgivaren vid
-- ny ansökan": who may be told, an outbox that remembers what was sent, and the
-- claim / settle pair that lets trusted server code send each notice exactly
-- once and retry the ones that did not go. It sends nothing itself; the
-- transport is the application's (src/lib/recruitment/employer-notice.server.ts
-- -> the transactional-email edge function, kind employer_new_application).
--
-- ── RECIPIENTS ARE CHOSEN HERE, AND ONLY HERE ────────────────────────────────
--
-- rec_employer_notice_recipients(application) is SECURITY DEFINER and
-- service_role-only. It reads the address from auth.users. The request, the
-- client and every candidate field have no say in who is written to:
--
--   1. the recruitment's RESPONSIBLE person (recruitment_settings.
--      responsible_user_id), when set AND an active member of an ACTIVE
--      organisation whose account can be written to;
--   2. otherwise ALL active owners and admins of the active organisation,
--      owners first, at most TEN (the cap is in the function; a larger
--      organisation's remaining owners/admins are simply not written to, which
--      is said in docs/release/2026-10-03-employer-new-application-notification.md).
--
-- A plain member is never a recipient unless they are the responsible person.
-- Invited, suspended and removed members, and any organisation that is not
-- 'active', get nothing. An account that is disabled (banned_until in the
-- future), has no address, or has an unconfirmed address is not "usable": the
-- responsible person falls through to the owners and admins, who are filtered
-- the same way. Nobody who is not already a member of the organisation can
-- ever appear: the list starts from employer_memberships.
--
-- ── THE OUTBOX ──────────────────────────────────────────────────────────────
--
-- recruitment_employer_notices: one row per (application, recipient, kind),
-- UNIQUE. No client role can read or write it (RLS enabled and forced, no
-- policy, no grant to anon/authenticated); service_role may only SELECT. It
-- holds the recipient's USER ID and never an address: the address is read from
-- auth.users at the moment of a claim, after the eligibility rules above have
-- been evaluated again, so a person who has been suspended or removed since the
-- application arrived is 'skipped', not written to.
--
-- It is kind-aware: `kind` is part of the unique key and of an allow-list CHECK
-- (today only 'new_application'), so another notification about an application
-- can reuse the table, claim, settle and sweep without a redesign. The claim
-- takes the kinds the worker can render, so an older worker never receives a
-- kind it does not know.
--
-- STATE MACHINE (modelled on the candidate receipt, 20261213090000):
--
--   pending ──claim──▶ claimed ──settle sent──────────────▶ sent        (final)
--      │                  │ └─settle failed/not_configured─▶ failed / not_configured
--      │                  │                                     │ retryable, with backoff
--      │                  └─ lease expired (3 min) ──claim──▶ claimed (next attempt)
--      └─ expired / not eligible / withdrawn ─────────────▶ skipped      (final)
--
--   * claim is ATOMIC: FOR UPDATE SKIP LOCKED, so two workers can never take
--     the same row, and a lease (claimed_at, 3 minutes) means a worker that
--     died holding a row is recovered by the next claim, not left holding it.
--   * a 'sent' row is never claimed again. A 'skipped' row is final.
--   * settle only records an answer for a row that is 'claimed' AND for the
--     attempt it names. A late answer for an earlier attempt ('stale') changes
--     nothing; an answer for a row that is no longer claimed returns its state.
--   * retry: attempts are capped at 6, spaced by a backoff (5 min, 15 min,
--     45 min, 2 h, 4 h), and nothing is retried once the row is 23 hours old --
--     the provider's idempotency key lives 24 hours, so every retry stays inside
--     the window in which a repeat under the same key is deduplicated by the
--     provider, and a "new application" mail a day late is stale anyway. A row
--     that gets no further attempt keeps the honest last outcome ('failed' /
--     'not_configured'), or becomes 'skipped'/EXPIRED if it was never tried.
--   * last_status is the provider's HTTP STATUS and nothing else: 0 means no
--     answer (timeout, network). Never a body, never an address.
--     retryable = no answer (0, or none recorded), 408, 409, 425, 429, any 5xx,
--     and not_configured (the transport may be configured later). Every other
--     4xx is final.
--
-- ENQUEUE is called by the server once the application has COMMITTED. It is
-- SET-ONCE per (application, kind): when any row exists the call does nothing,
-- so a replayed submission can never produce a second set, whoever the
-- recipients have become since. It also refuses an application that is older
-- than an hour or no longer 'submitted', so a replay cannot revive an old one.
--
-- NOT A TRIGGER on job_applications, on purpose: the apply request must not be
-- able to fail, or slow down, because of mail. A trigger would also make this
-- migration alone start queueing notices that no deployed application sends.
-- The migration is safe before the application change (nothing calls it), and
-- the application change is safe before the migration (a missing function is a
-- logged no-op).
--
-- Rollback: supabase/rollback/20270205090000_employer_new_application_notices_rollback.sql
-- Suite:    supabase/tests/employer_new_application_notices_test.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The outbox
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recruitment_employer_notices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  employer_id       uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind              text NOT NULL DEFAULT 'new_application'
                      CHECK (kind IN ('new_application')),
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'not_configured', 'skipped')),
  attempts          integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  -- The attempt in flight (or the last one made): settle names it.
  attempt_id        uuid,
  -- The lease: set at every claim.
  claimed_at        timestamptz,
  -- Not before: the backoff after a failed or unconfigured attempt.
  next_attempt_at   timestamptz NOT NULL DEFAULT now(),
  -- The provider's HTTP status of the last settled attempt; 0 = no answer.
  last_status       integer CHECK (last_status IS NULL OR last_status BETWEEN 0 AND 599),
  sent_at           timestamptz,
  -- Our own code, never free text: why a notice was not sent at all.
  skip_reason       text CHECK (skip_reason IS NULL
                                OR skip_reason IN ('EXPIRED', 'RECIPIENT_NOT_ELIGIBLE', 'APPLICATION_WITHDRAWN')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_employer_notices_once UNIQUE (application_id, recipient_user_id, kind),
  CONSTRAINT recruitment_employer_notices_shape CHECK (
    (status = 'sent') = (sent_at IS NOT NULL)
    AND (status <> 'claimed' OR (claimed_at IS NOT NULL AND attempt_id IS NOT NULL))
    AND (status = 'skipped') = (skip_reason IS NOT NULL)
    AND (status <> 'pending' OR attempts = 0)
  )
);

COMMENT ON TABLE public.recruitment_employer_notices IS
  'Outbox of e-mail notices to an organisation''s people about an application '
  '(today: a NEW application). One row per application, recipient and kind. '
  'Holds the recipient''s user id, never an address. No client access.';

-- What the claim scans, and what a settle looks up.
CREATE INDEX IF NOT EXISTS recruitment_employer_notices_due_idx
  ON public.recruitment_employer_notices (status, next_attempt_at)
  WHERE status IN ('pending', 'claimed', 'failed', 'not_configured');
CREATE UNIQUE INDEX IF NOT EXISTS recruitment_employer_notices_attempt_idx
  ON public.recruitment_employer_notices (attempt_id) WHERE attempt_id IS NOT NULL;

ALTER TABLE public.recruitment_employer_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_employer_notices FORCE ROW LEVEL SECURITY;
-- No policy: no client role reads or writes a row. The functions below are
-- SECURITY DEFINER and are the only way in.
REVOKE ALL ON TABLE public.recruitment_employer_notices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recruitment_employer_notices FROM service_role;
GRANT SELECT ON TABLE public.recruitment_employer_notices TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Who is written to
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rec_employer_notice_recipients(_application_id uuid)
RETURNS TABLE (recipient_user_id uuid, recipient_email text, via text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH app AS (
    -- An application of an ACTIVE organisation only.
    SELECT a.id, a.job_id, a.employer_id
      FROM public.job_applications a
      JOIN public.employers e ON e.id = a.employer_id AND e.status = 'active'
     WHERE a.id = _application_id
  ), usable AS (
    -- Active members of that organisation whose account can be written to.
    SELECT m.user_id, m.role, m.created_at, u.email::text AS email
      FROM app
      JOIN public.employer_memberships m
        ON m.employer_id = app.employer_id AND m.status = 'active'
      JOIN auth.users u ON u.id = m.user_id
     WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
       AND u.email_confirmed_at IS NOT NULL
       AND (u.banned_until IS NULL OR u.banned_until <= now())
  ), responsible AS (
    SELECT us.user_id, us.email, 'responsible'::text AS via
      FROM app
      JOIN public.recruitment_settings s ON s.job_id = app.job_id
      JOIN usable us ON us.user_id = s.responsible_user_id
  )
  SELECT r.user_id, r.email, r.via FROM responsible r
  UNION ALL
  SELECT f.user_id, f.email, f.role
    FROM (
      SELECT us.user_id, us.email, us.role
        FROM usable us
       WHERE us.role IN ('owner', 'admin')
         AND NOT EXISTS (SELECT 1 FROM responsible)
       ORDER BY (us.role = 'owner') DESC, us.created_at, us.user_id
       LIMIT 10
    ) f;
$$;
COMMENT ON FUNCTION public.rec_employer_notice_recipients(uuid) IS
  'The people who may be e-mailed about an application: the responsible person '
  'when set and an active member of an active organisation, else its active '
  'owners and admins (at most 10). The address comes from auth.users. '
  'service_role only.';
REVOKE ALL ON FUNCTION public.rec_employer_notice_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rec_employer_notice_recipients(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Enqueue: once the application has committed
-- ═══════════════════════════════════════════════════════════════════════════

-- Returns the number of rows CREATED. Set-once per (application, kind): a
-- second call -- a replay, a retry, a concurrent request -- finds the rows and
-- does nothing. Concurrent calls for the same application are serialised.
CREATE OR REPLACE FUNCTION public.rec_enqueue_employer_new_application_notices(_application_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _app public.job_applications%ROWTYPE;
  _n integer;
BEGIN
  SELECT a.* INTO _app FROM public.job_applications a WHERE a.id = _application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('rec_employer_notice:new_application:' || _application_id::text, 0));

  -- Not a retroactive notice: an application that is not new any more (it was
  -- withdrawn, or an employer has already moved it), or is more than an hour
  -- old, is not announced.
  IF _app.status <> 'submitted' OR _app.created_at <= now() - interval '1 hour' THEN
    RETURN 0;
  END IF;
  IF EXISTS (SELECT 1 FROM public.recruitment_employer_notices n
              WHERE n.application_id = _app.id AND n.kind = 'new_application') THEN
    RETURN 0;
  END IF;

  INSERT INTO public.recruitment_employer_notices (application_id, employer_id, recipient_user_id, kind)
  SELECT _app.id, _app.employer_id, r.recipient_user_id, 'new_application'
    FROM public.rec_employer_notice_recipients(_app.id) r
  ON CONFLICT (application_id, recipient_user_id, kind) DO NOTHING;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.rec_enqueue_employer_new_application_notices(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rec_enqueue_employer_new_application_notices(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Backoff (internal)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rec_employer_notice_backoff(_attempts integer)
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _attempts <= 1 THEN interval '5 minutes'
    WHEN _attempts = 2 THEN interval '15 minutes'
    WHEN _attempts = 3 THEN interval '45 minutes'
    WHEN _attempts = 4 THEN interval '2 hours'
    ELSE interval '4 hours'
  END;
$$;
REVOKE ALL ON FUNCTION public.rec_employer_notice_backoff(integer) FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Claim: one attempt per row, to one worker at a time
-- ═══════════════════════════════════════════════════════════════════════════

-- With an application: the due notices of that application (the dispatch right
-- after the submission). With NULL: whatever is due anywhere (the sweep). Both
-- are bounded (_limit, at most 50) and both re-check, per row, that the person
-- may still be written to -- otherwise the row is 'skipped'.
--
-- What comes back is what the e-mail needs and nothing about the candidate:
-- the notice and attempt ids, the provider key, the recipient's address and
-- language, the organisation's name and slug, and the vacancy's title.
CREATE OR REPLACE FUNCTION public.rec_claim_employer_notices(
  _application_id uuid DEFAULT NULL,
  _limit integer DEFAULT 20,
  _kinds text[] DEFAULT NULL
)
RETURNS TABLE (
  notice_id       uuid,
  attempt_id      uuid,
  provider_key    text,
  kind            text,
  application_id  uuid,
  recipient_email text,
  via             text,
  language        text,
  employer_name   text,
  employer_slug   text,
  job_title       text,
  attempts        integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  _n public.recruitment_employer_notices%ROWTYPE;
  _app_status text;
  _r record;
  _lang text;
  _employer_name text;
  _employer_slug text;
  _title text;
BEGIN
  -- A claim whose lease ran out on the last allowed attempt (or past the
  -- window) will not be tried again. Its outcome was never reported, so it is
  -- 'failed' with no answer -- not "sent" and not hidden.
  UPDATE public.recruitment_employer_notices n
     SET status = 'failed', last_status = 0, updated_at = now()
   WHERE n.status = 'claimed'
     AND n.claimed_at < now() - interval '3 minutes'
     AND (n.attempts >= 6 OR n.created_at <= now() - interval '23 hours')
     AND (_application_id IS NULL OR n.application_id = _application_id)
     AND (_kinds IS NULL OR n.kind = ANY (_kinds));
  -- Never tried, and too old to be worth announcing.
  UPDATE public.recruitment_employer_notices n
     SET status = 'skipped', skip_reason = 'EXPIRED', updated_at = now()
   WHERE n.status = 'pending'
     AND n.created_at <= now() - interval '23 hours'
     AND (_application_id IS NULL OR n.application_id = _application_id)
     AND (_kinds IS NULL OR n.kind = ANY (_kinds));

  FOR _n IN
    SELECT n.*
      FROM public.recruitment_employer_notices n
     WHERE (_application_id IS NULL OR n.application_id = _application_id)
       AND (_kinds IS NULL OR n.kind = ANY (_kinds))
       AND n.created_at > now() - interval '23 hours'
       AND n.attempts < 6
       AND (
            (n.status = 'pending' AND n.next_attempt_at <= now())
         OR (n.status = 'claimed' AND n.claimed_at < now() - interval '3 minutes')
         OR (n.status IN ('failed', 'not_configured') AND n.next_attempt_at <= now()
             AND (n.status = 'not_configured' OR n.last_status IS NULL
                  OR n.last_status = 0 OR n.last_status IN (408, 409, 425, 429) OR n.last_status >= 500))
       )
     ORDER BY n.created_at, n.id
     LIMIT greatest(1, least(coalesce(_limit, 20), 50))
     FOR UPDATE OF n SKIP LOCKED
  LOOP
    SELECT a.status INTO _app_status FROM public.job_applications a WHERE a.id = _n.application_id;
    IF _app_status IS NULL OR _app_status = 'withdrawn' THEN
      UPDATE public.recruitment_employer_notices n
         SET status = 'skipped', skip_reason = 'APPLICATION_WITHDRAWN', updated_at = now()
       WHERE n.id = _n.id;
      CONTINUE;
    END IF;

    -- Eligibility is decided again NOW, by the same function that decided it
    -- when the notice was queued.
    SELECT r.recipient_email AS email, r.via AS via INTO _r
      FROM public.rec_employer_notice_recipients(_n.application_id) r
     WHERE r.recipient_user_id = _n.recipient_user_id;
    IF NOT FOUND THEN
      UPDATE public.recruitment_employer_notices n
         SET status = 'skipped', skip_reason = 'RECIPIENT_NOT_ELIGIBLE', updated_at = now()
       WHERE n.id = _n.id;
      CONTINUE;
    END IF;

    SELECT CASE WHEN p.locale = 'en' THEN 'en' ELSE 'sv' END INTO _lang
      FROM public.profiles p WHERE p.id = _n.recipient_user_id;
    _lang := coalesce(_lang, 'sv');
    SELECT e.name, e.slug, coalesce(CASE WHEN _lang = 'en' THEN j.title_en END, j.title_sv, j.title_en)
      INTO _employer_name, _employer_slug, _title
      FROM public.job_applications a
      JOIN public.jobs j ON j.id = a.job_id
      JOIN public.employers e ON e.id = a.employer_id
     WHERE a.id = _n.application_id;

    UPDATE public.recruitment_employer_notices n
       SET status = 'claimed',
           claimed_at = now(),
           attempt_id = gen_random_uuid(),
           attempts = n.attempts + 1,
           updated_at = now()
     WHERE n.id = _n.id
    RETURNING * INTO _n;

    notice_id := _n.id;
    attempt_id := _n.attempt_id;
    provider_key := 'employer-' || replace(_n.kind, '_', '-') || ':' || _n.id::text;
    kind := _n.kind;
    application_id := _n.application_id;
    recipient_email := _r.email;
    via := _r.via;
    language := _lang;
    employer_name := _employer_name;
    employer_slug := _employer_slug;
    job_title := _title;
    attempts := _n.attempts;
    RETURN NEXT;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.rec_claim_employer_notices(uuid, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rec_claim_employer_notices(uuid, integer, text[]) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Settle: what the provider answered, for one attempt
-- ═══════════════════════════════════════════════════════════════════════════

-- Returns the row's status afterwards, or 'stale' when the attempt is not the
-- one the row last made (a late answer for attempt A never touches attempt B).
-- Only a row that is 'claimed' settles; any other row answers with its state.
CREATE OR REPLACE FUNCTION public.rec_settle_employer_notice(
  _attempt_id uuid,
  _result text,
  _http_status integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _n public.recruitment_employer_notices%ROWTYPE;
BEGIN
  IF _result NOT IN ('sent', 'failed', 'not_configured') THEN
    RAISE EXCEPTION 'NOTICE_RESULT_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  IF _attempt_id IS NULL THEN
    RAISE EXCEPTION 'NOTICE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT n.* INTO _n FROM public.recruitment_employer_notices n
   WHERE n.attempt_id = _attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'stale';
  END IF;
  IF _n.status <> 'claimed' THEN
    RETURN _n.status;
  END IF;
  UPDATE public.recruitment_employer_notices n
     SET status = _result,
         last_status = CASE WHEN _http_status BETWEEN 0 AND 599 THEN _http_status END,
         sent_at = CASE WHEN _result = 'sent' THEN now() END,
         next_attempt_at = CASE WHEN _result = 'sent' THEN n.next_attempt_at
                                ELSE now() + public.rec_employer_notice_backoff(n.attempts) END,
         updated_at = now()
   WHERE n.id = _n.id;
  RETURN _result;
END; $$;
REVOKE ALL ON FUNCTION public.rec_settle_employer_notice(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rec_settle_employer_notice(uuid, text, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Postflight: the migration fails, and rolls back, unless this holds
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _f text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c
                  WHERE c.oid = 'public.recruitment_employer_notices'::regclass
                    AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: the outbox does not have row-level security enabled and forced';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.recruitment_employer_notices'::regclass) THEN
    RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: the outbox has a policy; it must have none';
  END IF;
  IF has_table_privilege('anon', 'public.recruitment_employer_notices', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.recruitment_employer_notices', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: a client role holds a privilege on the outbox';
  END IF;
  IF has_table_privilege('service_role', 'public.recruitment_employer_notices', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: the server may write the outbox directly; only the functions may';
  END IF;
  FOREACH _f IN ARRAY ARRAY[
    'public.rec_employer_notice_recipients(uuid)',
    'public.rec_enqueue_employer_new_application_notices(uuid)',
    'public.rec_claim_employer_notices(uuid,integer,text[])',
    'public.rec_settle_employer_notice(uuid,text,integer)'
  ] LOOP
    IF has_function_privilege('anon', _f, 'EXECUTE') OR has_function_privilege('authenticated', _f, 'EXECUTE') THEN
      RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: a client role can execute %', _f;
    END IF;
    IF NOT has_function_privilege('service_role', _f, 'EXECUTE') THEN
      RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: the server cannot execute %', _f;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = _f::regprocedure) THEN
      RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: % is not SECURITY DEFINER', _f;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.rec_employer_notice_backoff(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rec_employer_notice_backoff(integer)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.rec_employer_notice_backoff(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: the backoff helper is callable directly';
  END IF;
  IF position('FOR UPDATE OF n SKIP LOCKED' IN pg_get_functiondef('public.rec_claim_employer_notices(uuid,integer,text[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'EMPLOYER_NOTICES_PROOF: the claim does not lock with SKIP LOCKED';
  END IF;
END
$$;
