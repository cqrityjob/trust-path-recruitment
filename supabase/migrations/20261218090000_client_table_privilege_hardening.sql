-- Generated with `supabase migration new client_table_privilege_hardening`,
-- ordered after the repository's existing 20261217 dependency frontier.
-- Production metadata audit 2026-09-27: 146 public tables retained client
-- TRUNCATE grants. RLS does not constrain TRUNCATE. PostgREST does not expose
-- TRUNCATE directly, but client roles must not retain this SQL capability.
-- Preserve every SELECT/INSERT/UPDATE/DELETE grant and every RLS policy.
BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

-- Migrations create application tables as postgres. Prevent recurrence while
-- retaining the existing DML defaults used by older application migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM PUBLIC, anon, authenticated;

-- PG17 also grants MAINTAIN through ALL. Keep compatibility with PG16 CI.
DO $maintain$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM PUBLIC, anon, authenticated';
  END IF;
END
$maintain$;

-- Fail closed if an inherited role still supplies a privilege we removed.
DO $verify$
DECLARE _table regclass; _role text; _privilege text;
BEGIN
  FOR _table IN
    SELECT c.oid::regclass FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
  LOOP
    FOREACH _role IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH _privilege IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(_role,_table,_privilege) THEN
          RAISE EXCEPTION 'CLIENT_TABLE_PRIVILEGE: % retains % on %', _role,_privilege,_table;
        END IF;
      END LOOP;
      IF current_setting('server_version_num')::integer >= 170000
         AND has_table_privilege(_role,_table,'MAINTAIN') THEN
        RAISE EXCEPTION 'CLIENT_TABLE_PRIVILEGE: % retains MAINTAIN on %', _role,_table;
      END IF;
    END LOOP;
  END LOOP;
END
$verify$;

COMMIT;
