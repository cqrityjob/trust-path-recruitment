-- =============================================================================
-- Security Passport share gateway
--
-- The durable disclosure token is a bearer capability. It must not enter the
-- Lovable request URL because the hosting edge can retain request paths. This
-- migration adds a two-stage, server-only exchange:
--
--   disclosure token -> 90-second, single-use handoff -> 30-minute session
--
-- Only SHA-256 hashes of the handoff and session secrets are stored. The
-- original disclosure token remains hash-only exactly as before. The tables
-- are deliberately in public because PostgREST must resolve the RPCs, but are
-- closed with forced RLS, no policies and no client privileges. Every function
-- is service-role only. No existing link or payload contract changes.
-- =============================================================================

CREATE TABLE public.sp_share_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_id uuid NOT NULL REFERENCES public.sp_disclosures(id) ON DELETE CASCADE,
  handoff_hash text NOT NULL UNIQUE
    CHECK (handoff_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '2 minutes'),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX sp_share_handoffs_expiry_idx
  ON public.sp_share_handoffs (expires_at);

CREATE TABLE public.sp_share_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_id uuid NOT NULL REFERENCES public.sp_disclosures(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE
    CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_accessed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '31 minutes'),
  CHECK (last_accessed_at IS NULL OR last_accessed_at >= created_at)
);

CREATE INDEX sp_share_sessions_expiry_idx
  ON public.sp_share_sessions (expires_at);

ALTER TABLE public.sp_share_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_share_handoffs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sp_share_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_share_sessions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.sp_share_handoffs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sp_share_sessions FROM PUBLIC, anon, authenticated;

-- Validate a live disclosure token and bind it to a random handoff hash. The
-- invalid, revoked, expired and application-only cases all return false.
CREATE OR REPLACE FUNCTION public.sp_share_gateway_issue(
  _token text,
  _handoff_hash text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  _disclosure_id uuid;
BEGIN
  IF coalesce(_token, '') !~ '^[0-9a-f]{64}$'
     OR coalesce(_handoff_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  DELETE FROM public.sp_share_handoffs
   WHERE expires_at < now() - interval '1 day'
      OR consumed_at < now() - interval '1 day';

  SELECT id INTO _disclosure_id
    FROM public.sp_disclosures
   WHERE token_hash = encode(digest(_token, 'sha256'), 'hex')
     AND application_id IS NULL
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at >= now());

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.sp_share_handoffs
    (disclosure_id, handoff_hash, expires_at)
  VALUES
    (_disclosure_id, _handoff_hash, now() + interval '90 seconds')
  ON CONFLICT (handoff_hash) DO NOTHING;

  RETURN FOUND;
END;
$function$;

-- Consume exactly one still-live handoff and bind it to a separately generated
-- session secret. Concurrent or repeated consumption returns false.
CREATE OR REPLACE FUNCTION public.sp_share_gateway_consume(
  _handoff text,
  _session_hash text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  _disclosure_id uuid;
BEGIN
  IF coalesce(_handoff, '') !~ '^[0-9a-f]{64}$'
     OR coalesce(_session_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  DELETE FROM public.sp_share_sessions
   WHERE expires_at < now() - interval '1 day';

  UPDATE public.sp_share_handoffs
     SET consumed_at = now()
   WHERE handoff_hash = encode(digest(_handoff, 'sha256'), 'hex')
     AND consumed_at IS NULL
     AND expires_at >= now()
  RETURNING disclosure_id INTO _disclosure_id;

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.sp_share_sessions
    (disclosure_id, session_hash, expires_at)
  VALUES
    (_disclosure_id, _session_hash, now() + interval '30 minutes')
  ON CONFLICT (session_hash) DO NOTHING;

  RETURN FOUND;
END;
$function$;

-- Read through the short-lived session. The payload shaping below mirrors the
-- selected-merit projection in sp_get_disclosure: no database identifier may
-- cross the anonymous boundary, and checked_at is authored by the server.
CREATE OR REPLACE FUNCTION public.sp_get_disclosure_session(_session text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  _session_id uuid;
  _d public.sp_disclosures%ROWTYPE;
  _payload jsonb;
BEGIN
  IF coalesce(_session, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT s.id, d INTO _session_id, _d
    FROM public.sp_share_sessions s
    JOIN public.sp_disclosures d ON d.id = s.disclosure_id
   WHERE s.session_hash = encode(digest(_session, 'sha256'), 'hex')
     AND s.expires_at >= now()
     AND d.application_id IS NULL
     AND d.revoked_at IS NULL
     AND (d.expires_at IS NULL OR d.expires_at >= now())
   FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  UPDATE public.sp_share_sessions
     SET last_accessed_at = now()
   WHERE id = _session_id;
  UPDATE public.sp_disclosures
     SET access_count = access_count + 1
   WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id)
  VALUES (_d.id);

  _payload := public.sp_disclosure_payload(_d.id);
  IF _payload ->> 'status' <> 'active' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF _d.package_code = 'selected_merits' THEN
    _payload := jsonb_set(_payload, '{verified_claims}', coalesce((
      SELECT jsonb_agg((row.value - 'id')
                       || jsonb_build_object('key', coalesce(row.value ->> 'key', 'c' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> 'verified_claims')
               WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

    _payload := jsonb_set(_payload, '{verified_experience}', coalesce((
      SELECT jsonb_agg((row.value - 'id')
                       || jsonb_build_object('key', coalesce(row.value ->> 'key', 'e' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> 'verified_experience')
               WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

    RETURN _payload || jsonb_build_object('checked_at', now());
  END IF;

  RETURN _payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.sp_share_gateway_issue(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_share_gateway_consume(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_get_disclosure_session(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sp_share_gateway_issue(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_share_gateway_consume(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure_session(text) TO service_role;

COMMENT ON TABLE public.sp_share_handoffs IS
  'Hash-only, 90-second, single-use bridge from the Supabase token entry to the application.';
COMMENT ON TABLE public.sp_share_sessions IS
  'Hash-only, fixed 30-minute recipient sessions; never stores a disclosure token.';
COMMENT ON FUNCTION public.sp_share_gateway_issue(text, text) IS
  'Service-only token validation and one-time handoff issuance.';
COMMENT ON FUNCTION public.sp_share_gateway_consume(text, text) IS
  'Service-only atomic handoff consumption and session binding.';
COMMENT ON FUNCTION public.sp_get_disclosure_session(text) IS
  'Service-only, fail-closed disclosure read through a short-lived session.';

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('sp_share_handoffs', 'sp_share_sessions')
  ) THEN
    RAISE EXCEPTION 'SP_SHARE_GATEWAY_POSTFLIGHT: gateway tables must have no policies';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('sp_share_handoffs', 'sp_share_sessions')
       AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'SP_SHARE_GATEWAY_POSTFLIGHT: gateway tables must force RLS';
  END IF;

  IF has_table_privilege('anon', 'public.sp_share_handoffs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sp_share_handoffs', 'SELECT')
     OR has_table_privilege('anon', 'public.sp_share_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sp_share_sessions', 'SELECT') THEN
    RAISE EXCEPTION 'SP_SHARE_GATEWAY_POSTFLIGHT: client table privilege leaked';
  END IF;

  IF has_function_privilege('anon', 'public.sp_share_gateway_issue(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sp_share_gateway_issue(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sp_share_gateway_consume(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sp_share_gateway_consume(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sp_get_disclosure_session(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sp_get_disclosure_session(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SHARE_GATEWAY_POSTFLIGHT: client function privilege leaked';
  END IF;
END;
$postflight$;
