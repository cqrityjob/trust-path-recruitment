\set ON_ERROR_STOP on
-- Run only on the isolated cqrity_security_recovery_20260927 database.
SELECT current_database()='cqrity_security_recovery_20260927' AS isolated \gset
\if :isolated
\else
  \quit 1
\endif
\ir ../../../../supabase/migrations/20261218090000_client_table_privilege_hardening.sql
\ir restore-admin-acl.sql
CREATE TEMP VIEW recovery_digest AS
SELECT md5(string_agg(line,E'\n' ORDER BY line)) AS digest FROM (
 SELECT c.relname||'='||(SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(c.relacl) a) AS line
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
 UNION ALL
 SELECT 'default:'||d.defaclobjtype::text||'='||(SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(d.defaclacl) a)
 FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE n.nspname='public' AND pg_get_userbyid(d.defaclrole)='postgres'
) s;
CREATE TEMP TABLE recovery_before AS SELECT digest FROM recovery_digest;
\ir ../../../../supabase/migrations/20261218090000_client_table_privilege_hardening.sql
\ir restore-admin-acl.sql
DO $$ BEGIN
 IF (SELECT digest FROM recovery_before) IS DISTINCT FROM (SELECT digest FROM recovery_digest)
 THEN RAISE EXCEPTION 'Recovery did not restore exact ACLs/defaults'; END IF;
 RAISE NOTICE 'PASS: migration and ACL recovery restore exact relation and default grants';
END $$;
\ir ../../../../supabase/migrations/20261218090000_client_table_privilege_hardening.sql
DO $$ BEGIN RAISE NOTICE 'PASS: hardening reapplied successfully after recovery'; END $$;
