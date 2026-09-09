/** Static release contract for the schema-only share gateway foundation. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20261104090000_passport_share_gateway.sql");
const rollback = read("supabase/rollback/20261104090000_passport_share_gateway_rollback.sql");
const test = read("supabase/tests/security_passport_share_gateway_test.sql");
const dbTest = read("scripts/db-test.sh");
const releaseState = read("supabase/release-state.json");
const frontier = read("scripts/release-frontier-check.ts");

let checks = 0;
const failures: string[] = [];
function assert(condition: boolean, label: string) {
  checks += 1;
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

console.log("passport-share-gateway-schema-check\n");
for (const table of ["sp_share_handoffs", "sp_share_sessions"]) {
  assert(migration.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`), `${table} forces RLS`);
  assert(migration.includes(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated;`), `${table} has no browser grants`);
}
assert(!/CREATE POLICY[\s\S]*sp_share_(handoffs|sessions)/i.test(migration), "closed tables have no RLS policy");
assert(migration.includes("now() + interval '90 seconds'"), "handoff lifetime is 90 seconds");
assert(migration.includes("now() + interval '30 minutes'"), "session lifetime is 30 minutes");
assert(migration.includes("AND consumed_at IS NULL"), "handoff consumption is single-use");
assert(migration.includes("handoff_hash = encode(digest(_handoff, 'sha256'), 'hex')"), "raw handoff is hashed before lookup");
assert(migration.includes("session_hash = encode(digest(_session, 'sha256'), 'hex')"), "raw session is hashed before lookup");
assert(migration.includes("AND d.revoked_at IS NULL"), "session reads recheck revocation");
assert(migration.includes("AND (d.expires_at IS NULL OR d.expires_at >= now())"), "session reads recheck disclosure expiry");
assert((migration.match(/application_id IS NULL/g) ?? []).length >= 2, "application disclosures are excluded at issue and read");
assert(migration.includes("row.value - 'id'"), "selected-merit identifiers remain private");

for (const fn of ["sp_share_gateway_issue", "sp_share_gateway_consume", "sp_get_disclosure_session"]) {
  assert(migration.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`), `${fn} is granted to service_role`);
  assert(!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[^;]+ TO (anon|authenticated|PUBLIC)`, "i").test(migration), `${fn} is not granted to a browser role`);
  assert(rollback.includes(`DROP FUNCTION IF EXISTS public.${fn}`), `${fn} is removed by rollback`);
}
assert(test.includes("B8 a handoff is single-use"), "runtime suite proves replay refusal");
assert(test.includes("C4 revocation immediately closes"), "runtime suite proves immediate revocation");
assert(test.includes("D1 application-scoped disclosures"), "runtime suite proves application exclusion");
assert(dbTest.includes("share-gateway rollback and re-apply"), "database runner proves rollback and re-apply");
assert(dbTest.includes("security_passport_share_gateway_test.sql"), "database runner executes the gateway suite");
assert(releaseState.includes('"file": "20261104090000_passport_share_gateway.sql"'), "release state names the pending migration");
assert(frontier.includes('"20261104090000_passport_share_gateway.sql"'), "release frontier expects exactly this pending migration");

console.log(`\n${checks} checks, ${failures.length} failures`);
if (failures.length) {
  console.error(`passport-share-gateway-schema-check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
