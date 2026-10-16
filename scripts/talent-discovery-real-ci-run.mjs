// Talent discovery on REAL Supabase services (2026-10-15).
//
// The app in this pull request -- not a pinned older one -- against a fresh
// Supabase CLI stack: GoTrue for every sign-in, the Storage API for the
// evidence and CV uploads, PostgREST and Postgres 17. The eleven browser
// scenarios of e2e/talent-discovery-local.spec.ts run unchanged except for
// mail: this stack has no Edge runtime, so the spec (TD_REAL_STACK=1) proves
// the notice row and that its mail was never recorded as sent.
//
// What is real and what is not:
//   real      GoTrue (admin-created accounts, password sign-in, refresh),
//             Storage API (bucket policies, objects), PostgREST, Postgres 17,
//             the head application served by Vite, Chromium.
//   absent    Edge runtime (product mail cannot leave), realtime, studio.
//
// Nothing here writes to auth.* with SQL: the eight synthetic people are
// created through /auth/v1/admin/users with fixed ids, and the fixture runs
// with -v real_auth=1, which only checks that they exist.
//
// Usage (GitHub-hosted runner only): node scripts/talent-discovery-real-ci-run.mjs
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireCompleteHistory } from "./recruiter-real-ci-contract.mjs";
import {
  APP,
  API,
  CONFIG,
  CV_BUCKET,
  EXCLUDED,
  PEOPLE,
  PASSWORD,
  requireRunner,
  requireStatus,
  appEnvironment,
  requireBrowserCounts,
  SCENARIOS,
  isRegistryThrottle,
} from "./talent-discovery-real-ci-contract.mjs";

const root = process.cwd();
const stackRoot = path.join(root, "td-real-stack");
const publicRoot = path.join(root, "td-real-public");
const privateRoot = path.join(stackRoot, "private");
const report = { result: "FAILED", stages: [], evidenceSha: process.env.TD_REAL_EVIDENCE_SHA };

function run(cmd, args, opts = {}) {
  return cp.execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

async function stage(name, fn) {
  const started = Date.now();
  try {
    await fn();
    report.stages.push({ name, status: "PASS", ms: Date.now() - started });
  } catch (error) {
    // Only the stage name and a fixed code go public; raw output stays private.
    report.stages.push({ name, status: "FAILED", ms: Date.now() - started });
    fs.writeFileSync(
      path.join(privateRoot, `${name}.error.txt`),
      String(error?.stderr ?? "") +
        "\n" +
        String(error?.stdout ?? "") +
        "\n" +
        String(error?.stack ?? error),
      { mode: 0o600 },
    );
    throw error;
  }
}

let status;
let app;
const dbEnv = () => {
  const db = new URL(status.DB_URL);
  return {
    ...process.env,
    PGHOST: db.hostname,
    PGPORT: db.port,
    PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password),
    PGDATABASE: db.pathname.slice(1),
  };
};
const sql = (q) => run("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c", q], { env: dbEnv() }).trim();

// On a failed scenario, say why in the job log: each failed test's error
// context (the page as Playwright saw it) and the application server's error
// lines. Everything here is synthetic (the fixture's people and texts); no
// key, token or password is ever printed (the server never logs them, and
// the filter drops any line that looks like one).
function printFailureDiagnostics() {
  const secret = /eyJ[A-Za-z0-9_-]{10,}|Bearer\s|password|service_role|apikey/i;
  try {
    const dirs = fs.readdirSync(path.join(root, "test-results"), { withFileTypes: true });
    for (const d of dirs.filter((x) => x.isDirectory())) {
      const ctx = path.join(root, "test-results", d.name, "error-context.md");
      if (!fs.existsSync(ctx)) continue;
      console.log(`::group::error context ${d.name}`);
      for (const line of fs.readFileSync(ctx, "utf8").split("\n").slice(0, 200))
        if (!secret.test(line)) console.log(line);
      console.log("::endgroup::");
    }
  } catch {
    /* no test results */
  }
  try {
    const log = fs.readFileSync(path.join(privateRoot, "app.log"), "utf8").split("\n");
    const errors = log.filter(
      (l) => /error|fail|refus|\[applications\]|\[talent\]|\[notices\]/i.test(l) && !secret.test(l),
    );
    console.log("::group::application server error lines");
    for (const line of errors.slice(-80)) console.log(line.slice(0, 400));
    console.log("::endgroup::");
  } catch {
    /* no app log */
  }
}

async function main() {
  requireRunner(process.env);
  fs.mkdirSync(path.join(stackRoot, "supabase"), { recursive: true });
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(publicRoot, "images"), { recursive: true });

  await stage("cli_start", async () => {
    fs.writeFileSync(path.join(stackRoot, "supabase/config.toml"), CONFIG);
    // A public-registry throttle is retried twice, after a clean stop; any
    // other failure is final.
    for (let attempt = 1; ; attempt++) {
      try {
        run("supabase", ["start", "--workdir", stackRoot, "--exclude", EXCLUDED], {
          timeout: 1_200_000,
        });
        break;
      } catch (error) {
        const text = String(error?.stderr ?? "") + String(error?.stdout ?? "");
        if (attempt >= 3 || !isRegistryThrottle(text)) throw error;
        console.warn(`registry throttle during supabase start; bounded retry ${attempt + 1}/3`);
        try {
          run("supabase", ["stop", "--workdir", stackRoot, "--no-backup"], { timeout: 300_000 });
        } catch {
          /* nothing was running */
        }
        await new Promise((r) => setTimeout(r, attempt * 30_000));
      }
    }
    status = requireStatus(
      JSON.parse(run("supabase", ["status", "--workdir", stackRoot, "-o", "json"])),
    );
    if (sql("SELECT count(*) FROM auth.users") !== "0") throw Error("TD_REAL_FRESH_AUTH_REQUIRED");
    report.services = { postgres: sql("SHOW server_version").split(" ")[0] };
  });

  await stage("strict_schema_replay", async () => {
    const dir = path.join(root, "supabase/migrations");
    const files = requireCompleteHistory(fs.readdirSync(dir));
    for (const file of files)
      run("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(dir, file)], { env: dbEnv() });
    sql("NOTIFY pgrst, 'reload schema'");
    report.migrations = files.length;
    report.lastMigrations = files.slice(-3);
  });

  await stage("real_auth_accounts", async () => {
    for (const person of PEOPLE) {
      const res = await fetch(`${API}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: status.SERVICE_ROLE_KEY,
          Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: person.id,
          email: person.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { display_name: person.name },
        }),
      });
      if (![200, 201].includes(res.status)) throw Error(`TD_REAL_AUTH_CREATE_FAILED_${res.status}`);
      const row = await res.json();
      if (row.id !== person.id) throw Error("TD_REAL_AUTH_ID_IGNORED");
      const login = await fetch(`${API}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: person.email, password: PASSWORD }),
      });
      if (login.status !== 200) throw Error(`TD_REAL_AUTH_LOGIN_FAILED_${login.status}`);
    }
    report.accounts = PEOPLE.length;
  });

  // The application CV bucket is not created by any migration (the hosted
  // project has it); like the other real-stack runners
  // (passport-regression-application.mjs), it is created here through the
  // Storage API with the hosted settings: private, 5 MiB, PDF only. Its
  // object policies stay exactly as the replayed migrations left them.
  await stage("storage_buckets", async () => {
    const headers = {
      apikey: status.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };
    const create = await fetch(`${API}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify(CV_BUCKET),
    });
    if (create.status !== 200) throw Error(`TD_REAL_CV_BUCKET_CREATE_FAILED_${create.status}`);
    const read = await fetch(`${API}/storage/v1/bucket/${CV_BUCKET.id}`, { headers });
    const bucket = read.status === 200 ? await read.json() : null;
    if (
      !bucket ||
      bucket.public !== false ||
      bucket.file_size_limit !== CV_BUCKET.file_size_limit ||
      JSON.stringify(bucket.allowed_mime_types) !== JSON.stringify(CV_BUCKET.allowed_mime_types)
    )
      throw Error("TD_REAL_CV_BUCKET_SETTINGS_MISMATCH");
    report.buckets = [CV_BUCKET.id];
  });

  await stage("fixture", async () => {
    run(
      "psql",
      [
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "real_auth=1",
        "-q",
        "-f",
        "scripts/fixtures/talent-discovery-fixture.sql",
      ],
      { env: dbEnv() },
    );
  });

  await stage("head_app_start", async () => {
    const log = fs.openSync(path.join(privateRoot, "app.log"), "w", 0o600);
    app = cp.spawn(
      "node",
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        new URL(APP).port,
        "--strictPort",
      ],
      { cwd: root, env: appEnvironment(status, process.env), stdio: ["ignore", log, log] },
    );
    fs.closeSync(log);
    let ready = false;
    for (let i = 0; i < 180 && !ready; i++) {
      try {
        ready = (await fetch(`${APP}/login`, { signal: AbortSignal.timeout(5000) })).ok;
      } catch {
        /* still compiling */
      }
      if (!ready) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) throw Error("TD_REAL_APP_NOT_READY");
    // Compile the routes the walk opens before the clock starts.
    for (const route of [
      "/passport",
      "/passport-review",
      "/passport/discoverability",
      "/jobs",
      "/my-career/applications",
    ])
      await fetch(`${APP}${route}`, { signal: AbortSignal.timeout(180_000) }).catch(() => {});
  });

  await stage("browser_scenarios", async () => {
    const jsonFile = path.join(privateRoot, "playwright.json");
    const env = {
      ...process.env,
      E2E_LOCAL_STACK: "1",
      TD_REAL_STACK: "1",
      E2E_BASE_URL: APP,
      E2E_SUPABASE_URL: API,
      E2E_DB_URL: status.DB_URL,
      E2E_SUPABASE_ANON_KEY: status.ANON_KEY,
      TD_EVIDENCE_DIR: path.join(publicRoot, "images"),
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
    };
    let failure;
    try {
      cp.execFileSync(
        "bunx",
        [
          "playwright",
          "test",
          "e2e/talent-discovery-local.spec.ts",
          "--project=chromium",
          "--reporter=list,json",
        ],
        { env, stdio: "inherit", timeout: 2_400_000 },
      );
    } catch (error) {
      failure = error;
    }
    if (failure) printFailureDiagnostics();
    const stats = JSON.parse(fs.readFileSync(jsonFile, "utf8")).stats;
    report.browser = requireBrowserCounts(stats, SCENARIOS, { allowFailure: Boolean(failure) });
    if (failure) throw Error("TD_REAL_BROWSER_FAILED");
  });

  report.result = "PASS";
}

try {
  await main();
} catch (error) {
  console.error(
    `talent-discovery real CI failed: ${String(error?.message ?? error).slice(0, 200)}`,
  );
  process.exitCode = 1;
} finally {
  if (app) app.kill("SIGTERM");
  try {
    run("supabase", ["stop", "--workdir", stackRoot, "--no-backup"], { timeout: 300_000 });
  } catch {
    /* the stack may never have started */
  }
  fs.mkdirSync(publicRoot, { recursive: true });
  fs.writeFileSync(path.join(publicRoot, "manifest.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
