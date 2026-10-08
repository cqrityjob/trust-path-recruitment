// Private launch of a reviewed app clone against ONE owned real local stack.
// No dotenv copy, secrets in arguments, fake Auth, schema writes or git edits.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
const stack = process.env.RI_OPS_STACK_ROOT;
const expected =
  "/Users/mostafas/.codex/visualizations/2026/10/07/01a11715-e113-77e1-9f70-baee7b636c8c/ri-real-stack-20261008";
if (stack !== expected) throw Error("REAL_LOCAL_STACK_ALLOWLIST");
const temp = path.join(stack, "supabase/.temp");
const statusPath = path.join(temp, "ri-local-status.json");
if ((fs.statSync(statusPath).mode & 0o077) !== 0) throw Error("LOCAL_STATUS_NOT_PRIVATE");
const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const db = new URL(status.DB_URL);
if (
  status.API_URL !== "http://127.0.0.1:55690" ||
  db.hostname !== "127.0.0.1" ||
  db.port !== "55691"
)
  throw Error("REAL_LOCAL_TARGET_MISMATCH");
const appRoot = "/private/tmp/ri-live-20261008/snapshot-app-release";
const sha = cp
  .execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" })
  .trim();
if (sha !== "ea43ad734e80347d56957794f56cd483595fce4a") throw Error("UNREVIEWED_APP_HEAD");
if (
  cp
    .execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: appRoot,
      encoding: "utf8",
    })
    .trim()
)
  throw Error("APP_TRACKED_FILES_DIRTY");
const env = {
  PATH: "/Users/mostafas/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin",
  HOME: process.env.HOME,
  USER: process.env.USER,
  LANG: process.env.LANG ?? "en_US.UTF-8",
  TMPDIR: process.env.TMPDIR ?? "/private/tmp",
  NODE_ENV: "development",
  SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_URL: status.API_URL,
  SUPABASE_PROJECT_ID: "cqj-ri-real-20261008b",
  VITE_SUPABASE_PROJECT_ID: "cqj-ri-real-20261008b",
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  PUBLIC_SITE_URL: "http://127.0.0.1:3140",
  VITE_CIG_LIFECYCLE_ENFORCED: "true",
  VITE_EMPLOYER_PORTAL_ENABLED: "true",
  VITE_JOBS_ENABLED: "true",
};
const secretValues = Object.entries(status)
  .filter(([k, v]) => typeof v === "string" && (/KEY|SECRET/.test(k) || k === "DB_URL"))
  .map(([, v]) => v);
function redact(chunk) {
  let text = String(chunk);
  for (const key of secretValues) text = text.split(key).join("[redacted]");
  return text
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "[jwt-redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+\?\S+/g, "[signed-url-redacted]");
}
const log = path.join(temp, "ri-real-app3140.log");
fs.writeFileSync(log, "", { mode: 0o600 });
fs.chmodSync(log, 0o600);
const child = cp.spawn(
  "/Users/mostafas/.bun/bin/bun",
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "3140",
    "--strictPort",
    "--mode",
    "ri-real-local",
  ],
  { cwd: appRoot, env, stdio: ["ignore", "pipe", "pipe"] },
);
const handle = (chunk) => {
  const safe = redact(chunk);
  fs.appendFileSync(log, safe);
  process.stdout.write(safe);
};
child.stdout.on("data", handle);
child.stderr.on("data", handle);
fs.writeFileSync(
  path.join(temp, "ri-real-app-launch.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      sourceSha: sha,
      pid: child.pid,
      appOrigin: "http://127.0.0.1:3140",
      apiOrigin: status.API_URL,
      auth: "real GoTrue",
      storage: "real local Storage",
      dotenvSupabaseValuesOverridden: true,
      aiAndMailProviderKeysInherited: false,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
