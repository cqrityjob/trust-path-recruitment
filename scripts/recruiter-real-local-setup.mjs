// Setup infrastructure only; actor authorization is tested through real GoTrue sessions.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
const root = process.env.RI_OPS_STACK_ROOT;
if (
  root !==
  "/Users/mostafas/.codex/visualizations/2026/10/07/01a11715-e113-77e1-9f70-baee7b636c8c/ri-real-stack-20261008"
)
  throw Error("REAL_LOCAL_STACK_ALLOWLIST");
const temp = path.join(root, "supabase/.temp");
const env = JSON.parse(fs.readFileSync(path.join(temp, "ri-local-status.json"), "utf8"));
const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const db = new URL(env.DB_URL);
if (
  env.API_URL !== "http://127.0.0.1:55690" ||
  db.hostname !== "127.0.0.1" ||
  db.port !== "55691" ||
  db.pathname !== "/postgres" ||
  !config.includes('project_id = "cqj-ri-real-20261008b"')
)
  throw Error("REAL_LOCAL_TARGET_MISMATCH");
const users = JSON.parse(fs.readFileSync(path.join(temp, "ri-real-synthetic-users.json"), "utf8"));
const mode = process.env.RI_OPS_SETUP_MODE ?? "apply";
if (!["apply", "readback"].includes(mode)) throw Error("UNKNOWN_LOCAL_SETUP_MODE");
const map = {
  o1: "employer",
  a1: "admin",
  r1: "reviewer",
  m1: "member",
  c1: "holder",
  c2: "other",
  x2: "external",
  v1: "verifier",
};
const args = ["-At", "-v", "ON_ERROR_STOP=1"];
for (const [alias, role] of Object.entries(map)) {
  const actor = users[role];
  if (!actor || !/^[a-f0-9-]{36}$/.test(actor.id) || !actor.email.endsWith("@fixture.invalid"))
    throw Error("REAL_SYNTHETIC_ACTOR_REQUIRED");
  args.push("-v", `${alias}=${actor.id}`);
}
args.push(
  "-f",
  fileURLToPath(
    new URL(
      mode === "apply"
        ? "./fixtures/recruiter-real-local-setup.sql"
        : "./fixtures/recruiter-real-local-readback.sql",
      import.meta.url,
    ),
  ),
);
const result = cp.spawnSync("/opt/homebrew/opt/postgresql@16/bin/psql", args, {
  encoding: "utf8",
  env: {
    ...process.env,
    PGHOST: "127.0.0.1",
    PGPORT: "55691",
    PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password),
    PGDATABASE: "postgres",
  },
});
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}
const lines = result.stdout
  .trim()
  .split("\n")
  .filter((line) => line.startsWith("{"));
if (lines.length !== 1) throw Error("LOCAL_SETUP_READBACK_SHAPE");
const manifest = JSON.parse(lines[0]);
manifest.createdAt = new Date().toISOString();
manifest.environment = "cqj-ri-real-20261008b: loopback55690/55691";
fs.writeFileSync(
  path.join(
    temp,
    mode === "apply" ? "ri-real-browser-setup.json" : "ri-real-setup-final-readback.json",
  ),
  JSON.stringify(manifest, null, 2),
  {
    mode: 0o600,
  },
);
console.log(
  mode === "apply"
    ? "PASS: real Auth actors bound to synthetic E1/E2;12new applications; receipts off; no cases/reports/approval changes."
    : `READBACK: ${manifest.jobs}jobs/${manifest.applications}applications/${manifest.cases}cases/${manifest.reports}reports; receiptsEnabled=${manifest.receipts_enabled}; emailAttempts=${manifest.email_attempts}`,
);
