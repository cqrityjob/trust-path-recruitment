// Official CLI-only ephemeral real GoTrue/Storage stack. No fake claims,
// 00_bootstrap, hosted credentials, inherited provider keys or product edits.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import crypto from "node:crypto";
import {
  APP_SHA,
  PROJECT,
  API,
  APP,
  CLI_VERSION,
  EXCLUDED,
  CONFIG,
  readCIContext,
  readPrivateStatus,
  childEnvironment,
  requireCompleteHistory,
  requireBrowserCounts,
  authFailureSummary,
} from "./recruiter-real-ci-contract.mjs";
import { digest, writePublicReport } from "./recruiter-real-ci-public.mjs";
import { storageFailureSummary } from "./recruiter-real-ci-storage-bootstrap.mjs";

const context = readCIContext();
if (fs.existsSync(context.stackRoot) || fs.existsSync(context.publicRoot))
  throw Error("REAL_CI_FRESH_DIRECTORIES_REQUIRED");
const temp = path.join(context.stackRoot, "supabase/.temp");
fs.mkdirSync(temp, { recursive: true, mode: 0o700 });
fs.chmodSync(temp, 0o700);
const report = {
  schemaVersion: "recruiter-real-ci-v1",
  startedAt: new Date().toISOString(),
  releaseSchemaSha: context.releaseSchemaSha,
  evidenceCodeSha: context.evidenceCodeSha,
  appSha: APP_SHA,
  project: PROJECT,
  apiOrigin: API,
  appOrigin: APP,
  serviceVersions: {},
  migrations: [],
  stages: {},
  errors: [],
  excluded: [
    "private CLI status/credentials",
    "Vite raw logs",
    "Playwright raw errors/traces",
    "hosted/CDN",
    "physical phone",
  ],
};
let status,
  appChild,
  stackStarted = false;
const privateFile = (name) => path.join(temp, name);
function run(command, args, name, options = {}) {
  const fd = fs.openSync(privateFile(`${name}.log`), "w", 0o600);
  const result = cp.spawnSync(command, args, {
    cwd: context.root,
    env: process.env,
    stdio: ["ignore", fd, fd],
    timeout: 600_000,
    ...options,
  });
  fs.closeSync(fd);
  if (result.status !== 0) {
    const text = fs.readFileSync(privateFile(`${name}.log`), "utf8");
    const error = new Error(`REAL_CI_${name.toUpperCase().replaceAll("-", "_")}_FAILED`);
    error.sqlState = text.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1];
    if (name === "storage" && fs.existsSync(privateFile("ri-real-upload-failure.json"))) {
      const failure = JSON.parse(fs.readFileSync(privateFile("ri-real-upload-failure.json")));
      error.storageFailure = storageFailureSummary(failure.operation, {
        status: failure.httpStatus,
        error: { code: failure.sqlState, message: failure.domainCode },
      });
    }
    throw error;
  }
}
function output(command, args, options = {}) {
  try {
    return cp
      .execFileSync(command, args, {
        cwd: context.root,
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
        maxBuffer: 20_000_000,
        ...options,
      })
      .trim();
  } catch {
    throw Error("REAL_CI_PRIVATE_COMMAND_FAILED");
  }
}
async function stage(name, action) {
  report.stages[name] = "running";
  try {
    await action();
    report.stages[name] = "passed";
    console.log(`REAL_CI_PASS ${name}`);
  } catch (error) {
    report.stages[name] = "failed";
    const code = /^REAL_CI_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "REAL_CI_STAGE_FAILED";
    report.errors.push({
      stage: name,
      code,
      ...(error.sqlState ? { sqlState: error.sqlState } : {}),
      ...(error.authFailure ?? {}),
      ...(error.storageFailure ? { storageFailure: error.storageFailure } : {}),
    });
    console.error(`REAL_CI_FAIL ${name} ${code}`);
    throw Error(code);
  }
}
function dbEnv() {
  const db = new URL(status.DB_URL);
  return {
    ...process.env,
    PGHOST: "127.0.0.1",
    PGPORT: "55691",
    PGUSER: "postgres",
    PGPASSWORD: decodeURIComponent(db.password),
    PGDATABASE: "postgres",
  };
}
const sql = (query) =>
  output("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c", query], { env: dbEnv() });
async function request(route, init = {}) {
  return fetch(`${API}${route}`, { ...init, signal: AbortSignal.timeout(8000) });
}
function headers(key, token = key) {
  return { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
async function login(actor) {
  const response = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: headers(status.ANON_KEY),
    body: JSON.stringify({ email: actor.email, password: actor.password }),
  });
  if (response.status !== 200) {
    const error = new Error("REAL_CI_GOTRUE_PASSWORD_LOGIN_FAILED");
    error.authFailure = authFailureSummary(
      response.status,
      await response.json().catch(() => null),
    );
    throw error;
  }
  const body = await response.json();
  const claims = JSON.parse(Buffer.from(body.access_token.split(".")[1], "base64url").toString());
  if (
    body.user.id !== actor.id ||
    claims.sub !== actor.id ||
    !claims.session_id ||
    new URL(claims.iss).origin !== API
  )
    throw Error("REAL_CI_GOTRUE_SESSION_BINDING_FAILED");
  return body.access_token;
}
function readback() {
  run(
    "psql",
    ["-At", "-v", "ON_ERROR_STOP=1", "-f", "scripts/fixtures/recruiter-real-local-readback.sql"],
    "readback",
    { env: dbEnv() },
  );
  const json = fs
    .readFileSync(privateFile("readback.log"), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("{"));
  if (json.length !== 1) throw Error("REAL_CI_READBACK_SHAPE");
  const data = JSON.parse(json[0]);
  data.cron_jobs =
    sql("SELECT to_regclass('cron.job') IS NOT NULL") === "t"
      ? Number(sql("SELECT count(*) FROM cron.job"))
      : 0;
  const picked = Object.fromEntries(
    [
      "migration_count",
      "migration_frontier",
      "auth_users",
      "auth_confirmed_invalid_bcrypt",
      "jobs",
      "applications",
      "receipts_enabled",
      "cases",
      "reports",
      "ai_enabled",
      "transcript_enabled",
      "ai_runs",
      "sw_ai_runs",
      "recruitment_messages",
      "email_attempts",
      "erasure_jobs",
      "storage_erasure_queue",
      "cron_jobs",
    ].map((key) => [key, data[key]]),
  );
  if (
    data.ai_enabled ||
    data.transcript_enabled ||
    [
      "receipts_enabled",
      "ai_runs",
      "sw_ai_runs",
      "recruitment_messages",
      "email_attempts",
      "erasure_jobs",
      "storage_erasure_queue",
      "cron_jobs",
    ].some((key) => data[key] !== 0)
  )
    throw Error("REAL_CI_SIDE_EFFECT_GUARD_FAILED");
  if (
    data.auth_users !== 8 ||
    data.auth_confirmed_invalid_bcrypt !== 8 ||
    data.jobs !== 12 ||
    data.applications !== 12
  )
    throw Error("REAL_CI_SYNTHETIC_POPULATION_MISMATCH");
  return picked;
}
function browserResult(file, expected) {
  const data = JSON.parse(fs.readFileSync(privateFile(`${file}.log`), "utf8"));
  return requireBrowserCounts(data.stats, expected);
}

try {
  await stage("official_stack", async () => {
    const nodeVersion = output("node", ["--version"]);
    const bunVersion = output("bun", ["--version"]);
    if (!/^v22\./.test(nodeVersion) || bunVersion !== "1.3.14")
      throw Error("REAL_CI_RUNTIME_VERSION_MISMATCH");
    if (output("supabase", ["--version"]) !== CLI_VERSION)
      throw Error("REAL_CI_CLI_VERSION_MISMATCH");
    fs.writeFileSync(path.join(context.stackRoot, "supabase/config.toml"), CONFIG);
    stackStarted = true;
    run("supabase", ["start", "--workdir", context.stackRoot, "--exclude", EXCLUDED], "cli-start", {
      cwd: context.stackRoot,
    });
    const raw = output("supabase", ["status", "--workdir", context.stackRoot, "-o", "json"], {
      cwd: context.stackRoot,
    });
    fs.writeFileSync(privateFile("ri-local-status.json"), raw, { mode: 0o600 });
    status = readPrivateStatus(context);
    const pg = sql("SHOW server_version");
    if (!pg.startsWith("17.")) throw Error("REAL_CI_POSTGRES17_REQUIRED");
    const image = (service) =>
      output("docker", [
        "inspect",
        `supabase_${service}_${PROJECT}`,
        "--format",
        "{{.Config.Image}}",
      ]);
    report.serviceVersions = {
      cli: CLI_VERSION,
      node: nodeVersion,
      bun: bunVersion,
      postgres: pg,
      gotrueImage: image("auth"),
      storageImage: image("storage"),
      postgrestImage: image("rest"),
      postgresImage: image("db"),
      postgrestBinary: output("docker", [
        "exec",
        `supabase_rest_${PROJECT}`,
        "/bin/postgrest",
        "--version",
      ]),
    };
    if (
      !/:v?14\.15$/.test(report.serviceVersions.postgrestImage) ||
      !/14\.15\b/.test(report.serviceVersions.postgrestBinary)
    )
      throw Error("REAL_CI_POSTGREST14_15_REQUIRED");
    if (sql("SELECT count(*) FROM auth.users") !== "0") throw Error("REAL_CI_FRESH_AUTH_REQUIRED");
  });
  await stage("strict_schema_replay", async () => {
    const dir = path.join(context.root, "supabase/migrations");
    const files = requireCompleteHistory(fs.readdirSync(dir));
    for (const file of files) {
      report.failedMigration = file;
      run(
        "psql",
        ["-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", path.join(dir, file)],
        "migration",
        { env: dbEnv() },
      );
      report.migrations.push({ file, sha256: digest(fs.readFileSync(path.join(dir, file))) });
    }
    delete report.failedMigration;
    fs.mkdirSync(path.join(context.stackRoot, "supabase/migrations"), { recursive: true });
    for (const file of files)
      fs.copyFileSync(
        path.join(dir, file),
        path.join(context.stackRoot, "supabase/migrations", file),
      );
    // Repair only this fresh CLI ledger, and only versions whose exact SQL
    // just finished. Historical canonical aliases are not replayed through CLI.
    run(
      "supabase",
      [
        "migration",
        "repair",
        "--local",
        "--status",
        "applied",
        "--workdir",
        context.stackRoot,
        ...files.map((name) => name.slice(0, 14)),
      ],
      "local-ledger",
      { cwd: context.stackRoot },
    );
    const ledger = JSON.parse(
      sql(
        "SELECT coalesce(json_agg(version ORDER BY version),'[]'::json) FROM supabase_migrations.schema_migrations",
      ),
    );
    if (JSON.stringify(ledger) !== JSON.stringify(files.map((name) => name.slice(0, 14))))
      throw Error("REAL_CI_LEDGER_VERSION_MISMATCH");
    sql("NOTIFY pgrst,'reload schema'");
  });
  const users = {};
  await stage("real_auth_and_receipt_off_fixture", async () => {
    const before = await request("/auth/v1/admin/users", {
      headers: headers(status.SERVICE_ROLE_KEY),
    });
    if (before.status !== 200 || (await before.json()).users.length !== 0)
      throw Error("REAL_CI_FRESH_AUTH_REQUIRED");
    for (const role of [
      "employer",
      "admin",
      "reviewer",
      "member",
      "holder",
      "other",
      "external",
      "verifier",
    ]) {
      const actor = {
        email: `ri-real-${role}@fixture.invalid`,
        password: `R!${crypto.randomBytes(20).toString("hex")}`,
      };
      const response = await request("/auth/v1/admin/users", {
        method: "POST",
        headers: headers(status.SERVICE_ROLE_KEY),
        body: JSON.stringify({ email: actor.email, password: actor.password, email_confirm: true }),
      });
      if (![200, 201].includes(response.status)) throw Error("REAL_CI_AUTH_ADMIN_CREATE_FAILED");
      const row = await response.json();
      actor.id = row.id;
      if (!/^[a-f0-9-]{36}$/.test(actor.id)) throw Error("REAL_CI_AUTH_ACTOR_ID_INVALID");
      await login(actor);
      users[role] = actor;
    }
    fs.writeFileSync(privateFile("ri-real-synthetic-users.json"), JSON.stringify(users), {
      mode: 0o600,
    });
    const args = ["-At", "-v", "ON_ERROR_STOP=1"];
    for (const [alias, role] of Object.entries({
      o1: "employer",
      a1: "admin",
      r1: "reviewer",
      m1: "member",
      c1: "holder",
      c2: "other",
      x2: "external",
      v1: "verifier",
    }))
      args.push("-v", `${alias}=${users[role].id}`);
    run("psql", [...args, "-f", "scripts/fixtures/recruiter-real-local-setup.sql"], "fixture", {
      env: dbEnv(),
    });
    report.beforeBrowser = readback();
    if (report.beforeBrowser.cases !== 0 || report.beforeBrowser.reports !== 0)
      throw Error("REAL_CI_NO_PRESEEDED_CASES_REQUIRED");
  });
  await stage("real_storage_upload_recovery", async () => {
    run("bun", ["scripts/recruiter-real-ci-upload.mjs"], "storage", { timeout: 300_000 });
    const evidence = JSON.parse(
      fs.readFileSync(privateFile("ri-real-upload-recovery.json"), "utf8"),
    );
    if (
      evidence.checks.length !== 7 ||
      evidence.checks.some((check) => check.status !== "PASS" || !check.setupCleanupConfirmed)
    )
      throw Error("REAL_CI_STORAGE_COUNTS_MISMATCH");
    report.storage = evidence.checks.map((check) => ({
      mode: check.id,
      status: check.status,
      outcome: check.actual.outcome,
      cleanup: check.actual.cleanup,
      setupCleanupConfirmed: check.setupCleanupConfirmed,
      storagePosts: check.actual.storagePosts,
      attachActualStatuses: check.actual.attachActualStatuses,
      deleteCalls: check.actual.deleteCalls,
      readbackStatuses: check.actual.readbackStatuses,
    }));
  });
  await stage("pinned_app_start", async () => {
    const fd = fs.openSync(privateFile("app.log"), "w", 0o600);
    appChild = cp.spawn(
      "node",
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        "3140",
        "--strictPort",
        "--mode",
        "ri-real-ci",
      ],
      { cwd: context.appRoot, env: childEnvironment(status), stdio: ["ignore", fd, fd] },
    );
    fs.closeSync(fd);
    let ready = false;
    for (let i = 0; i < 90; i++) {
      try {
        if ((await fetch(`${APP}/login`, { signal: AbortSignal.timeout(2000) })).ok) {
          ready = true;
          break;
        }
      } catch {
        /* await actual readiness */
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) throw Error("REAL_CI_APP_NOT_READY");
  });
  const browserEnv = {
    ...process.env,
    E2E_LOCAL_STACK: "1",
    E2E_BASE_URL: APP,
    E2E_P0_EVIDENCE_DIR: privateFile("ri-real-browser/curated"),
    RI_REAL_STRESS: "1",
  };
  await stage("twelve_real_password_ui_journeys", async () => {
    run(
      "bunx",
      [
        "playwright",
        "test",
        "--config",
        "scripts/recruiter-real-ci-browser.config.ts",
        "--grep-invert",
        "two-tab process CAS",
        "--reporter",
        "json",
      ],
      "browser-primary",
      { env: browserEnv, timeout: 1_500_000 },
    );
    report.browserPrimary = browserResult("browser-primary", 12);
  });
  await stage("two_tab_real_auth_stress", async () => {
    run(
      "bunx",
      [
        "playwright",
        "test",
        "--config",
        "scripts/recruiter-real-ci-browser.config.ts",
        "--grep",
        "two-tab process CAS",
        "--project",
        "chromium",
        "--project",
        "mobile-375",
        "--reporter",
        "json",
      ],
      "browser-cas",
      { env: { ...browserEnv, RI_REAL_CAS_ONLY: "1" }, timeout: 600_000 },
    );
    report.browserCAS = browserResult("browser-cas", 2);
  });
  await stage("real_gotrue_postgrest_bounded_conflict", async () => {
    const token = await login(users.employer);
    const response = await request(
      "/rest/v1/scp_interview_sessions?status=eq.in_progress&select=id,updated_at&limit=1",
      { headers: headers(status.ANON_KEY, token) },
    );
    if (response.status !== 200) throw Error("REAL_CI_SESSION_READ_FAILED");
    const [session] = await response.json();
    if (!session) throw Error("REAL_CI_STRESS_SESSION_REQUIRED");
    const body = {
      _session_id: session.id,
      _reflection: "Synthetic CI owner winning write",
      _deviations: "Synthetic CI bounded CAS",
      _expected_updated_at: session.updated_at,
    };
    const winner = await request("/rest/v1/rpc/scp_iv_save_session_process", {
      method: "POST",
      headers: headers(status.ANON_KEY, token),
      body: JSON.stringify(body),
    });
    if (winner.status !== 200) throw Error("REAL_CI_CAS_WINNER_FAILED");
    const started = performance.now();
    const loser = await request("/rest/v1/rpc/scp_iv_save_session_process", {
      method: "POST",
      headers: headers(status.ANON_KEY, token),
      body: JSON.stringify(body),
    });
    const rejected = await loser.json();
    if (
      loser.status !== 409 ||
      rejected.code !== "PT409" ||
      rejected.message !== "SCP_IV_SESSION_PROCESS_STALE"
    )
      throw Error("REAL_CI_CAS_HTTP409_REQUIRED");
    report.actualGoTrueCAS = {
      status: loser.status,
      code: rejected.code,
      message: rejected.message,
      elapsedMs: Number((performance.now() - started).toFixed(2)),
      timeoutMs: 8000,
    };
  });
  await stage("final_readback", async () => {
    report.afterBrowser = readback();
    if (report.afterBrowser.cases !== 14 || report.afterBrowser.reports !== 12)
      throw Error("REAL_CI_FINAL_CASE_REPORT_COUNTS_MISMATCH");
    readCIContext();
  });
} catch {
  process.exitCode = 1;
} finally {
  if (appChild && appChild.exitCode === null) {
    appChild.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => appChild.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (appChild.exitCode === null && appChild.signalCode === null) appChild.kill("SIGKILL");
  }
  if (stackStarted) {
    try {
      await stage("owned_stack_stop", () =>
        run(
          "supabase",
          ["stop", "--workdir", context.stackRoot, "--project-id", PROJECT, "--no-backup"],
          "cli-stop",
          { cwd: context.stackRoot },
        ),
      );
    } catch {
      process.exitCode = 1;
    }
  }
  report.completedAt = new Date().toISOString();
  report.exitCode = process.exitCode ?? 0;
  try {
    writePublicReport(context, report);
    console.log(`REAL_CI_RESULT ${report.exitCode === 0 ? "PASS" : "FAIL"}`);
  } catch {
    console.error("REAL_CI_PUBLIC_REPORT_REFUSED");
    process.exitCode = 1;
  }
}
