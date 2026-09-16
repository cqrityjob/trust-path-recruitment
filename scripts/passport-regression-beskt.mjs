// Synthetic local regression fixtures only. Fixed loopback API/DB ports prevent hosted execution.
// Prerequisites and evidence paths: docs/passport/regression-migration-evidence/README.md.
import fs from "node:fs";
import cp from "node:child_process";
import crypto from "node:crypto";
const db = "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const src = fs.readFileSync("scripts/fixtures/beskt-candidate-preparation-fixture.sql", "utf8");
const helpers = src.slice(
  src.indexOf("CREATE OR REPLACE FUNCTION pg_temp.become"),
  src.indexOf("\nBEGIN;"),
);
const baseJob = src.slice(
  src.indexOf("DO $job$"),
  src.indexOf("ON CONFLICT (id) DO NOTHING;", src.indexOf("DO $job$")) +
    "ON CONFLICT (id) DO NOTHING;".length,
);
for (const project of ["chromium", "mobile-375", "mobile-390"]) {
  const stamp = Date.now().toString(36),
    app = crypto.randomUUID(),
    other = crypto.randomUUID(),
    job = crypto.randomUUID(),
    toolApp = crypto.randomUUID(),
    toolJob = crypto.randomUUID(),
    toolCase = crypto.randomUUID();
  const sql =
    helpers +
    "\nBEGIN;\n" +
    baseJob
      .replaceAll("b4000000-0000-4000-8000-00000000ff01", job)
      .replaceAll("b4000000-0000-4000-8000-00000000aa01", app)
      .replaceAll("b4000000-0000-4000-8000-00000000aa02", other)
      .replaceAll("beskt-journey-vaktare", "beskt-regression-" + stamp)
      .replaceAll("BJVAK1", "R" + stamp.slice(-5)) +
    "\nCOMMIT;";
  const sqlPath = "/private/tmp/passport-beskt-" + project + ".sql";
  fs.writeFileSync(sqlPath, sql);
  cp.execFileSync(
    "/opt/homebrew/opt/postgresql@16/bin/psql",
    [db, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { stdio: "ignore" },
  );
  const env = {
    ...process.env,
    E2E_LOCAL_STACK: "1",
    E2E_BASE_URL: "http://127.0.0.1:3118",
    E2E_SUPABASE_REF: "127",
    E2E_APPLICATION_ID: app,
    E2E_OTHER_APPLICATION_ID: other,
    E2E_TOOL_CASE_ID: toolCase,
    BCP_EVIDENCE_DIR: "/private/tmp/passport-beskt-prep-" + project,
    BCP_TOOL_EVIDENCE_DIR: "/private/tmp/passport-beskt-tool-" + project,
  };
  let r = cp.spawnSync(
    "node_modules/.bin/playwright",
    [
      "test",
      "e2e/beskt-candidate-preparation.spec.ts",
      "--project=" + project,
      "--workers=1",
      "--trace=off",
      "--output=/private/tmp/passport-beskt-prep-results-" + project,
    ],
    { env, encoding: "utf8", maxBuffer: 20e6 },
  );
  fs.writeFileSync(
    "/private/tmp/passport-regression-beskt-prep-" + project + ".log",
    r.stdout + r.stderr,
  );
  console.log("preparation", project, r.status);
  if (r.status !== 0) throw Error(project + " preparation failed");
  const tool = fs
    .readFileSync("scripts/fixtures/beskt-interview-tool-fixture.sql", "utf8")
    .replaceAll("b5000000-0000-4000-8000-00000000aa05", toolApp)
    .replaceAll("b5000000-0000-4000-8000-00000000ff05", toolJob)
    .replaceAll("b5000000-0000-4000-8000-00000000cc05", toolCase)
    .replaceAll("beskt-tool-skyddsvakt", "beskt-tool-" + stamp)
    .replaceAll("BTSKY5", "T" + stamp.slice(-5));
  fs.writeFileSync(sqlPath, tool);
  cp.execFileSync(
    "/opt/homebrew/opt/postgresql@16/bin/psql",
    [db, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { stdio: "ignore" },
  );
  r = cp.spawnSync(
    "node_modules/.bin/playwright",
    [
      "test",
      "e2e/beskt-interview-tool.spec.ts",
      "--project=" + project,
      "--workers=1",
      "--trace=off",
      "--output=/private/tmp/passport-beskt-tool-results-" + project,
    ],
    { env, encoding: "utf8", maxBuffer: 20e6 },
  );
  fs.writeFileSync(
    "/private/tmp/passport-regression-beskt-tool-" + project + ".log",
    r.stdout + r.stderr,
  );
  console.log("tool", project, r.status);
  if (r.status !== 0) throw Error(project + " tool failed");
}
