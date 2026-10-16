-- Bench-only: Supabase's own auth.uid()/auth.role()/auth.jwt(), which read the
-- JSON claims PostgREST 12 sets per request (request.jwt.claims), so every
-- call parses the claims as on hosted Supabase. The repo's test stub reads a
-- flat request.jwt.claim.sub, which is cheaper than production.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
