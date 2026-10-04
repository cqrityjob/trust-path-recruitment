-- READ ONLY. Run against project wrygicdfxwjnrugduxnt.
-- Exact reviewed file and expected hashes: reviewed-file.json.
SELECT version, name, cardinality(statements) AS statement_count,
  encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') AS sql_sha256
FROM supabase_migrations.schema_migrations
WHERE name = 'application_passport_verified_content_guard'
   OR version = '20270215090000';
-- Actual original version 20261004164027, one SQL statement containing the
-- whole reviewed file, SHA256 0b492098ae86ff8ee19c97efe88de76058deb53ce67bda4dfffc337889d93f82.
SELECT md5(prosrc) AS body_md5, prosecdef, proconfig,
  pg_get_function_result(oid), pg_get_userbyid(proowner), proacl,
  has_function_privilege('anon', oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', oid, 'EXECUTE') AS service_execute
FROM pg_proc WHERE oid = to_regprocedure('public.sp_require_application_verified_content()');
-- body_md5 7bf734a466cd0e99bcf657939b8822db; SECURITY DEFINER; public,pg_temp;
-- trigger result; postgres owner and only postgres execute; all three false.
SELECT tgname, tgenabled, tgfoid::regprocedure, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid = 'public.sp_disclosures'::regclass AND NOT tgisinternal;
-- Exactly one enabled guard: BEFORE INSERT OR UPDATE OF holder_user_id,
-- application_id, package_code, focus_claim_id, FOR EACH ROW, correct function.
SELECT count(*) AS ledger_rows,
  md5(string_agg(version || ':' || name, E'\n' ORDER BY version)) AS ledger_md5
FROM supabase_migrations.schema_migrations;
