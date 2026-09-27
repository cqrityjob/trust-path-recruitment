// Reproduce production ACLs over a disposable migration replay, never data.
// SECURITY_AUDIT_TEMPLATE=cqrity_security_audit17_pristine PGPORT=57633 ... node scripts/security-access-audit.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const host = process.env.PGHOST || "127.0.0.1";
const template = process.env.SECURITY_AUDIT_TEMPLATE || "";
const database = "cqrity_security_access";
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) ||
  !/^cqrity_security_[a-z0-9_]+_pristine$/.test(template) ||
  !process.env.PGPORT
) {
  throw new Error(
    "Requires loopback PGHOST, explicit PGPORT and a cqrity_security_*_pristine template",
  );
}
const env = { ...process.env, PGHOST: host, PGOPTIONS: "-c jit=off -c statement_timeout=120000" };
const metadata = JSON.parse(
  fs.readFileSync("docs/security/2026-09-27/production-metadata.json", "utf8"),
);
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
function sql(query, db = database) {
  return execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-d", db], {
    input: query,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}
function file(path) {
  return sql(fs.readFileSync(path, "utf8"));
}
function check(value, label) {
  if (!value) throw new Error(label);
  console.log("PASS " + label);
}

sql(
  `DROP DATABASE IF EXISTS ${ident(database)}; CREATE DATABASE ${ident(database)} TEMPLATE ${ident(template)};`,
  "postgres",
);
const major = Number(sql("SHOW server_version_num;").trim());
check(major >= 160000, "PostgreSQL 16 or newer");
const policies = JSON.parse(
  sql(
    "SELECT json_agg(p ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname IN ('public','storage');",
  ),
);
check(
  JSON.stringify(policies) ===
    JSON.stringify(
      metadata.policies.map((p) => ({ ...p, roles: p.roles.slice(1, -1).split(",") })),
    ),
  "573 live policies equal migration replay, including storage",
);
const definitions = JSON.parse(
  sql(
    "SELECT json_agg(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f';",
  ),
);
const hash = (s) =>
  crypto
    .createHash("sha256")
    .update(
      s
        .split("\n")
        .filter((l) => l.trim() && !l.trimStart().startsWith("--"))
        .join("\n"),
    )
    .digest("hex");
const hashes = new Set(definitions.map(hash));
check(
  hashes.size === metadata.definer_function_hashes.length &&
    metadata.definer_function_hashes.every((f) => hashes.has(f.sha256)),
  "510 production definer bodies equal replay except full-line comments",
);

// Restore effective client/server table ACLs from the captured production
// metadata. Omit PG17 MAINTAIN only when exercising the PG16 compatibility run.
const privileges = {
  a: "INSERT",
  r: "SELECT",
  w: "UPDATE",
  d: "DELETE",
  D: "TRUNCATE",
  x: "REFERENCES",
  t: "TRIGGER",
  m: "MAINTAIN",
};
let grants = "BEGIN;\n";
for (const table of metadata.relations.filter((t) => t.schema === "public")) {
  const name = "public." + ident(table.name);
  grants += `REVOKE ALL ON ${name} FROM PUBLIC,anon,authenticated,service_role;\n`;
  for (const entry of (table.relacl || "{}").slice(1, -1).split(",").filter(Boolean)) {
    const [role, rest] = entry.split("=");
    if (!["", "anon", "authenticated", "service_role"].includes(role)) continue;
    const ps = [...rest.split("/")[0]]
      .filter((c) => c !== "*" && (c !== "m" || major >= 170000))
      .map((c) => privileges[c]);
    if (ps.length)
      grants += `GRANT ${ps.join(",")} ON ${name} TO ${role ? ident(role) : "PUBLIC"};\n`;
  }
}
// Capture and check column grants before resetting the baseline, then restore
// them explicitly: REVOKE ALL on the table also revokes column privileges.
const columns = JSON.parse(
  sql(
    "SELECT json_agg(x ORDER BY relname,attname) FROM (SELECT c.relname,a.attname,a.attacl::text AS attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attacl IS NOT NULL) x;",
  ),
);
check(
  JSON.stringify(columns) === JSON.stringify(metadata.column_acl),
  "41 production column ACLs match replay",
);
for (const column of metadata.column_acl) {
  for (const entry of column.attacl.slice(1, -1).split(",").filter(Boolean)) {
    const [role, rest] = entry.split("=");
    if (!["", "anon", "authenticated", "service_role"].includes(role)) continue;
    const ps = [...rest.split("/")[0]]
      .filter((c) => c !== "*")
      .map((c) => privileges[c] + " (" + ident(column.attname) + ")");
    if (ps.length)
      grants += `GRANT ${ps.join(",")} ON public.${ident(column.relname)} TO ${role ? ident(role) : "PUBLIC"};\n`;
  }
}
grants +=
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;\nCOMMIT;";
sql(grants);
check(
  Number(
    sql(
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (has_table_privilege('anon',c.oid,'TRUNCATE') OR has_table_privilege('authenticated',c.oid,'TRUNCATE'));",
    ),
  ) === 146,
  "production baseline reproduces 146 tables with client TRUNCATE",
);
for (const role of ["anon", "authenticated"]) {
  sql(`BEGIN; SET LOCAL ROLE ${role}; TRUNCATE public.assessment_responses; ROLLBACK;`);
  console.log("REPRODUCED pre-fix SQL TRUNCATE as " + role + " (rolled back, synthetic database)");
}
const dmlQuery =
  "SELECT json_agg(x ORDER BY name,role,privilege) FROM (SELECT c.relname AS name,r AS role,p AS privilege,has_table_privilege(r,c.oid,p) AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')) x;";
const before = sql(dmlQuery);
file("supabase/migrations/20261218090000_client_table_privilege_hardening.sql");
check(
  sql(dmlQuery) === before,
  "all SELECT/INSERT/UPDATE/DELETE grants preserved for all three roles",
);
file("supabase/tests/client_table_privilege_hardening_test.sql");
console.log(
  "PASS all 45 nonempty catalogues, four principals, denied mutations and destructive privileges",
);
// A planted reintroduction must fail on precisely the effective-grant assertion.
try {
  sql(
    "BEGIN; GRANT TRUNCATE ON public.beta_feedback TO PUBLIC;\n" +
      fs
        .readFileSync("supabase/tests/client_table_privilege_hardening_test.sql", "utf8")
        .replace("BEGIN;", ""),
  );
  throw new Error("Negative control was not detected");
} catch (error) {
  check(
    String(error.stderr).includes("SECURITY_AUDIT_FAIL: beta_feedback no anon TRUNCATE"),
    "negative control detects an inherited PUBLIC TRUNCATE grant",
  );
}
for (const suite of [
  "security_hardening_test",
  "scp_interview_tenant_isolation_test",
  "scp_interview_method_library_tenant_read_test",
  "security_passport_global_certification_test",
  "security_passport_note_privacy_test",
  "candidate_location_and_destinations_test",
]) {
  const path = `supabase/tests/${suite}.sql`;
  file(path);
  console.log("PASS production ACL overlay: " + suite);
}
console.log("PASS audit complete; only local database " + database + " changed");
