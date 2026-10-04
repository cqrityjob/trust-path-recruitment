-- REVIEWABLE HISTORY-ONLY RECONCILIATION. Requires separate owner approval.
-- Intended project: wrygicdfxwjnrugduxnt. No schema/application-data statements.
-- Preserve hosted 20261004164027; add exactly one canonical identity with NULL
-- statements. Never re-execute the already-applied migration SQL.
-- Baseline digest is MD5 of newline-joined version:name ORDER BY version,
-- not a digest of production statement bodies or complete history rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;

DO $reconcile$
DECLARE
  _inserted integer;
  _original_rows_md5 text;
  _function_definition text;
  _trigger_definition text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 374
     OR (SELECT md5(string_agg(version || ':' || name, E'\n' ORDER BY version))
           FROM supabase_migrations.schema_migrations)
        IS DISTINCT FROM '3bfd11b0037b10a31029b89cd8bc5179' THEN
    RAISE EXCEPTION 'F09_HISTORY_BASELINE_MISMATCH: stop; do not retry with relaxed guards';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20270215090000') THEN
    RAISE EXCEPTION 'F09_HISTORY_CANONICAL_EXISTS: stop; never overwrite history';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
       WHERE version = '20261004164027'
         AND name = 'application_passport_verified_content_guard'
         AND cardinality(statements) = 1
         AND encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') =
             '0b492098ae86ff8ee19c97efe88de76058deb53ce67bda4dfffc337889d93f82') <> 1 THEN
    RAISE EXCEPTION 'F09_HISTORY_ORIGIN_MISMATCH: reviewed application row/body missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.sp_require_application_verified_content()')
       AND md5(p.prosrc) = '7bf734a466cd0e99bcf657939b8822db'
       AND p.prosecdef AND p.prorettype = 'trigger'::regtype
       AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'F09_HISTORY_FUNCTION_MISMATCH: reviewed body/config/ACL not installed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.sp_disclosures'::regclass
       AND t.tgname = 'sp_application_verified_content'
       AND t.tgfoid = to_regprocedure('public.sp_require_application_verified_content()')
       AND t.tgenabled = 'O' AND NOT t.tgisinternal AND t.tgtype = 23
       AND t.tgqual IS NULL AND t.tgnargs = 0
       AND ARRAY(SELECT a.attname::text
                   FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY c(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = c.attnum
                  ORDER BY c.ord) = ARRAY['holder_user_id','application_id','package_code','focus_claim_id']::text[]
  ) THEN
    RAISE EXCEPTION 'F09_HISTORY_TRIGGER_MISMATCH: correct active admission guard not installed';
  END IF;

  SELECT md5(string_agg(to_jsonb(m)::text, E'\n' ORDER BY version)) INTO _original_rows_md5
    FROM supabase_migrations.schema_migrations m;
  SELECT pg_get_functiondef(to_regprocedure('public.sp_require_application_verified_content()'))
    INTO _function_definition;
  SELECT pg_get_triggerdef(oid) INTO _trigger_definition FROM pg_trigger
   WHERE tgrelid = 'public.sp_disclosures'::regclass AND tgname = 'sp_application_verified_content';

  INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
  VALUES ('20270215090000', 'application_passport_verified_content_guard', NULL);
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  IF _inserted <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 375
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations
          WHERE version = '20270215090000' AND name = 'application_passport_verified_content_guard'
            AND statements IS NULL) <> 1 THEN
    RAISE EXCEPTION 'F09_HISTORY_ALIAS_POSTCONDITION: expected exactly one NULL-statements alias';
  END IF;
  IF (SELECT md5(string_agg(to_jsonb(m)::text, E'\n' ORDER BY version))
        FROM supabase_migrations.schema_migrations m WHERE version <> '20270215090000')
       IS DISTINCT FROM _original_rows_md5 THEN
    RAISE EXCEPTION 'F09_HISTORY_ORIGINAL_CHANGED: an original complete row changed';
  END IF;
  IF pg_get_functiondef(to_regprocedure('public.sp_require_application_verified_content()'))
       IS DISTINCT FROM _function_definition
     OR (SELECT pg_get_triggerdef(oid) FROM pg_trigger
          WHERE tgrelid = 'public.sp_disclosures'::regclass AND tgname = 'sp_application_verified_content')
       IS DISTINCT FROM _trigger_definition THEN
    RAISE EXCEPTION 'F09_HISTORY_SCHEMA_CHANGED: history reconciliation must not change the guard';
  END IF;
  RAISE NOTICE 'F09_HISTORY_OK: one canonical NULL-statements alias; all original rows and guard definitions preserved';
END $reconcile$;
COMMIT;
