-- =============================================================================
-- Security Passport share gateway
--
-- Proves that the original bearer token stops at Supabase, the handoff is
-- single-use, the session is short-lived and revocation remains immediate.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

\echo '==> Security Passport share gateway'

INSERT INTO auth.users (id, email)
VALUES ('e7000000-0000-4000-8000-000000000001', 'gateway-holder@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles
  (holder_user_id, display_name, jurisdiction_code)
VALUES
  ('e7000000-0000-4000-8000-000000000001', 'Gateway Holder (fiktiv)', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;

-- Fixed test secrets. Only their hashes may survive the calls.
INSERT INTO public.sp_disclosures
  (id, holder_user_id, package_code, token_hash, purpose, locale, expires_at)
VALUES
  ('e7100000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000001',
   'public_card',
   encode(digest(repeat('a', 64), 'sha256'), 'hex'),
   'Gateway test', 'sv', now() + interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- A · privilege and storage boundary
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  (SELECT bool_and(relrowsecurity AND relforcerowsecurity)
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('sp_share_handoffs', 'sp_share_sessions')),
  'A1 both gateway tables force RLS');

SELECT pg_temp.ok(
  (SELECT count(*) = 0 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('sp_share_handoffs', 'sp_share_sessions')),
  'A2 the closed tables have no policy');

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.sp_share_handoffs', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.sp_share_handoffs', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.sp_share_sessions', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.sp_share_sessions', 'SELECT'),
  'A3 no browser role can read either table');

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.sp_share_handoffs', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.sp_share_handoffs', 'TRUNCATE')
  AND NOT has_table_privilege('anon', 'public.sp_share_sessions', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.sp_share_sessions', 'TRUNCATE'),
  'A4 TRUNCATE is closed explicitly because RLS cannot constrain it');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_share_gateway_issue(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.sp_share_gateway_issue(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_share_gateway_consume(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.sp_share_gateway_consume(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sp_get_disclosure_session(text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.sp_get_disclosure_session(text)', 'EXECUTE'),
  'A5 no browser role can execute a gateway function');

SELECT pg_temp.ok(
  has_function_privilege('service_role', 'public.sp_share_gateway_issue(text,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.sp_share_gateway_consume(text,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.sp_get_disclosure_session(text)', 'EXECUTE'),
  'A6 the server role can execute exactly the three entry points');

-- ---------------------------------------------------------------------------
-- B · issue and consume
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  NOT public.sp_share_gateway_issue('bad', repeat('b', 64)),
  'B1 malformed disclosure tokens fail closed');

SELECT pg_temp.ok(
  NOT public.sp_share_gateway_issue(repeat('f', 64), repeat('b', 64)),
  'B2 a guessed token is indistinguishable from unavailable');

SELECT pg_temp.ok(
  public.sp_share_gateway_issue(
    repeat('a', 64),
    encode(digest(repeat('b', 64), 'sha256'), 'hex')
  ),
  'B3 a live disclosure issues one handoff');

SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_share_handoffs
    WHERE handoff_hash = encode(digest(repeat('b', 64), 'sha256'), 'hex')
      AND expires_at <= created_at + interval '90 seconds'),
  'B4 only the supplied handoff hash is stored for at most 90 seconds');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.sp_share_handoffs
     WHERE row_to_json(sp_share_handoffs)::text LIKE '%' || repeat('a', 64) || '%'),
  'B5 the original disclosure token is absent from the handoff row');

SELECT pg_temp.ok(
  public.sp_share_gateway_consume(repeat('c', 64), repeat('d', 64)) = false,
  'B6 a guessed handoff fails closed');

SELECT pg_temp.ok(
  public.sp_share_gateway_consume(
    repeat('b', 64),
    encode(digest(repeat('d', 64), 'sha256'), 'hex')
  ),
  'B7 the real handoff creates a session');

SELECT pg_temp.ok(
  NOT public.sp_share_gateway_consume(repeat('b', 64), repeat('e', 64)),
  'B8 a handoff is single-use');

SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_share_sessions
    WHERE session_hash = encode(digest(repeat('d', 64), 'sha256'), 'hex')
      AND expires_at <= created_at + interval '30 minutes'),
  'B9 only the session hash is stored for at most 30 minutes');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.sp_share_sessions
     WHERE row_to_json(sp_share_sessions)::text LIKE '%' || repeat('b', 64) || '%'
        OR row_to_json(sp_share_sessions)::text LIKE '%' || repeat('a', 64) || '%'),
  'B10 neither durable token nor raw handoff reaches the session row');

-- ---------------------------------------------------------------------------
-- C · read parity, expiry and revocation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _before integer;
  _payload jsonb;
BEGIN
  SELECT access_count INTO _before
    FROM public.sp_disclosures WHERE id = 'e7100000-0000-4000-8000-000000000001';
  _payload := public.sp_get_disclosure_session(repeat('d', 64));

  PERFORM pg_temp.ok(_payload ->> 'status' = 'active',
    'C1 a live session resolves the disclosure');
  PERFORM pg_temp.ok(
    (SELECT access_count = _before + 1 FROM public.sp_disclosures
      WHERE id = 'e7100000-0000-4000-8000-000000000001'),
    'C2 a session read keeps the existing disclosure access accounting');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_disclosure_accesses
      WHERE disclosure_id = 'e7100000-0000-4000-8000-000000000001'),
    'C3 a session read keeps the existing access receipt');
END $$;

UPDATE public.sp_disclosures
   SET revoked_at = now()
 WHERE id = 'e7100000-0000-4000-8000-000000000001';

SELECT pg_temp.ok(
  public.sp_get_disclosure_session(repeat('d', 64)) = '{"status":"unavailable"}'::jsonb,
  'C4 revocation immediately closes an already-issued session');

UPDATE public.sp_disclosures
   SET revoked_at = NULL
 WHERE id = 'e7100000-0000-4000-8000-000000000001';
UPDATE public.sp_share_sessions
   SET expires_at = now() - interval '1 second'
 WHERE session_hash = encode(digest(repeat('d', 64), 'sha256'), 'hex');

SELECT pg_temp.ok(
  public.sp_get_disclosure_session(repeat('d', 64)) = '{"status":"unavailable"}'::jsonb,
  'C5 an expired session fails with the same unavailable payload');

SELECT pg_temp.ok(
  public.sp_get_disclosure_session('bad') = '{"status":"unavailable"}'::jsonb,
  'C6 malformed sessions fail with the same unavailable payload');

-- ---------------------------------------------------------------------------
-- D · implementation properties that close the known bypasses
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  pg_get_functiondef('public.sp_share_gateway_issue(text,text)'::regprocedure)
    LIKE '%application_id IS NULL%'
  AND pg_get_functiondef('public.sp_get_disclosure_session(text)'::regprocedure)
    LIKE '%d.application_id IS NULL%',
  'D1 application-scoped disclosures cannot become public links');

SELECT pg_temp.ok(
  pg_get_functiondef('public.sp_get_disclosure_session(text)'::regprocedure)
    LIKE '%FOR UPDATE OF s%'
  AND pg_get_functiondef('public.sp_share_gateway_consume(text,text)'::regprocedure)
    LIKE '%consumed_at IS NULL%',
  'D2 session reads and handoff consumption are concurrency-safe');

SELECT pg_temp.ok(
  pg_get_functiondef('public.sp_get_disclosure_session(text)'::regprocedure)
    LIKE '%row.value - ''id''%'
  AND pg_get_functiondef('public.sp_get_disclosure_session(text)'::regprocedure)
    LIKE '%checked_at%',
  'D3 selected-merit identifiers stay behind the recipient boundary');

\echo '==> Security Passport share gateway assertions complete'
