// Synthetic local regression fixtures only. Fixed loopback API/DB ports prevent hosted execution.
// Prerequisites and evidence paths: docs/passport/regression-migration-evidence/README.md.
import fs from "node:fs";
import cp from "node:child_process";
const db = "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
for (const project of ["chromium", "mobile-375", "mobile-390"]) {
  const suffix = " regression-" + Date.now().toString(36);
  cp.execFileSync(
    "/opt/homebrew/opt/postgresql@16/bin/psql",
    [
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "e4_suffix=" + suffix,
      "-f",
      "scripts/fixtures/employer-final-report-fixture.sql",
    ],
    { stdio: "ignore" },
  );
  const r = cp.spawnSync(
    "node_modules/.bin/playwright",
    [
      "test",
      "e2e/employer-final-report-evidence.spec.ts",
      "--project=" + project,
      "--workers=1",
      "--trace=off",
      "--output=/private/tmp/passport-e4-results-" + project,
    ],
    {
      env: {
        ...process.env,
        PATH: "/opt/homebrew/opt/postgresql@16/bin:" + process.env.PATH,
        E2E_LOCAL_STACK: "1",
        E2E_BASE_URL: "http://127.0.0.1:3118",
        E2E_SUPABASE_REF: "127",
        E4_DATABASE_URL: db,
        E4_FORBIDDEN_PROJECT_REF: "wrygicdfxwjnrugduxnt",
        E4_FIXTURE_SUFFIX: suffix,
        E4_EVIDENCE_DIR: "/private/tmp/passport-e4-shots-" + project,
      },
      encoding: "utf8",
      maxBuffer: 20e6,
    },
  );
  fs.writeFileSync("/private/tmp/passport-regression-e4-" + project + ".log", r.stdout + r.stderr);
  console.log(project, r.status);
  if (r.status !== 0) throw Error(project + " browser suite failed");
}
