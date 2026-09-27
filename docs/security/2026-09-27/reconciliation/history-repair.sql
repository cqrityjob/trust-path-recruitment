-- Executed once with owner approval. Audit artifact; NOT an active migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $repair$
DECLARE before_digest text;
BEGIN
  SELECT md5(string_agg(to_jsonb(m)::text, E'\n' ORDER BY version)) INTO before_digest
  FROM supabase_migrations.schema_migrations m;
  IF before_digest IS DISTINCT FROM '7b6bca527143c518199d6991669674d0' THEN
    RAISE EXCEPTION 'History changed since saved production snapshot; stop and re-review';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20260927124146' AND name='client_table_privilege_hardening'
      AND md5(array_to_string(statements,E'\n'))='4c989d7bbe67b351f1b80a986816fb72'
  ) OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261218090000') THEN
    RAISE EXCEPTION 'Unexpected security migration identity or body';
  END IF;
  -- History alias only. No replay, no privilege changes, no application SQL.
  INSERT INTO supabase_migrations.schema_migrations(version,name)
  VALUES ('20261218090000','client_table_privilege_hardening');
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 321 THEN
    RAISE EXCEPTION 'Unexpected ledger size after repair';
  END IF;
END $repair$;
COMMIT;
