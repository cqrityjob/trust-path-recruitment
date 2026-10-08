// Test-only GitHub-hosted native stack; no workstation or hosted execution.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import {
  API,
  APP,
  APP_SHA,
  SCHEMA_SHA,
  PROJECT,
  CLI_VERSION,
  CONFIG,
  EXCLUDED,
  ACTORS,
  STAGES,
  readContext,
  readPrivateJson,
  validateStatus,
  history,
  sdkSummary,
  browserSummary,
  appEnvironment,
  validUuid,
  digest,
} from "./passport-native-op09-contract.mjs";
import { privateOutput } from "./passport-native-op09-command.mjs";
import { writePublic } from "./passport-native-op09-public.mjs";

const context = readContext();
for (const dir of [context.stackRoot, context.publicRoot])
  if (fs.existsSync(dir)) throw Error("OP09_NATIVE_FRESH_DIRECTORIES_REQUIRED");
if (cp.spawnSync("docker", ["inspect", `supabase_db_${PROJECT}`], { stdio: "ignore" }).status === 0)
  throw Error("OP09_NATIVE_EXISTING_PROJECT_REFUSED");
const temp = path.join(context.stackRoot, "supabase/.temp");
fs.mkdirSync(temp, { recursive: true, mode: 0o700 });
fs.chmodSync(temp, 0o700);
const file = (name) => path.join(temp, name);
const writePrivate = (name, value) => {
  fs.writeFileSync(file(name), value, { mode: 0o600 });
  fs.chmodSync(file(name), 0o600);
  return file(name);
};
const namespace = `ri-op09-${crypto.randomBytes(6).toString("hex")}`;
const report = {
  kind: "prepared-native-op09-v1",
  startedAt: new Date().toISOString(),
  evidenceSha: context.evidenceSha,
  appSha: APP_SHA,
  schemaSha: SCHEMA_SHA,
  project: PROJECT,
  namespace,
  stages: Object.fromEntries(STAGES.map((s) => [s, "not_run"])),
  serviceVersions: {},
  migrations: [],
  errors: [],
  excluded: [
    "hosted/published runtime/CDN",
    "physical phone",
    "raw logs/credentials/JWTs/signed URLs",
    "AI/provider activation",
    "workers/cron",
    "mail and real candidates",
  ],
  setupAuthority: {
    auth: "eight fresh auto-confirmed admin API accounts, no invite/mail",
    receipt:
      "local fixture DML sets one synthetic draft job receipt=false before any application; applications remain zero",
    probes: "own password-session caller RPC and Storage, no service role actor",
    faults:
      "exact own attempt response loss in SDK; exactly one own fenced DELETE503 in test-only server preload",
  },
};
let status,
  started = false,
  appChild;
function output(name, args, label, options = {}) {
  return privateOutput(name, args, {
    cwd: context.root,
    env: process.env,
    stdoutFile: file(`${label}.stdout.log`),
    stderrFile: file(`${label}.stderr.log`),
    ...options,
  });
}
function dbEnv() {
  const db = new URL(status.DB_URL);
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PGHOST: "127.0.0.1",
    PGPORT: "55821",
    PGUSER: "postgres",
    PGDATABASE: "postgres",
    PGPASSWORD: decodeURIComponent(db.password),
  };
}
const sql = (query, label = "readback") =>
  output("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c", query], label, { env: dbEnv() });
async function stage(name, action) {
  report.stages[name] = "running";
  try {
    await action();
    report.stages[name] = "passed";
    console.log(`OP09_NATIVE_PASS ${name}`);
  } catch (error) {
    report.stages[name] = "failed";
    const code = /^OP09_NATIVE_[A-Z0-9_]+$/.test(error?.message ?? "")
      ? error.message
      : "OP09_NATIVE_STAGE_FAILED";
    report.errors.push({
      stage: name,
      code,
      ...(error?.safeDiagnostic ? { diagnostic: error.safeDiagnostic } : {}),
    });
    console.error(`OP09_NATIVE_FAIL ${name} ${code}`);
    throw Error(code);
  }
}
async function request(route, init = {}) {
  try {
    return await fetch(`${API}${route}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw Error("OP09_NATIVE_PRIVATE_TRANSPORT_FAILED");
  }
}
const headers = (key) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});
function freePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(Error("OP09_NATIVE_PORT_IN_USE")));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
function safety() {
  const data = JSON.parse(
    sql(`SELECT jsonb_build_object(
    'auth',(SELECT count(*) FROM auth.users),
    'confirmed',(SELECT count(*) FROM auth.users WHERE email LIKE '${namespace}-%@synthetic.invalid' AND email_confirmed_at IS NOT NULL AND encrypted_password ~ '^\\$2[aby]\\$'),
    'jobs',(SELECT count(*) FROM public.jobs),
    'applications',(SELECT count(*) FROM public.job_applications),
    'receipt_enabled',(SELECT count(*) FROM public.recruitment_settings WHERE receipt_enabled),
    'messages',(SELECT count(*) FROM public.recruitment_messages),
    'mail_attempts',(SELECT coalesce(sum(email_attempts),0) FROM public.recruitment_messages),
    'ai_enabled',(SELECT ai_enabled OR transcript_enabled FROM public.scp_interview_ai_config WHERE id),
    'ai_runs',(SELECT count(*) FROM public.scp_interview_ai_runs),
    'sw_ai_runs',(SELECT count(*) FROM public.sw_ai_runs),
    'erasure_jobs',(SELECT count(*) FROM public.recruitment_erasure_jobs),
    'erasure_queue',(SELECT count(*) FROM public.storage_erasure_queue),
    'journal',(SELECT count(*) FROM public.sp_evidence_upload_attempts),
    'evidence',(SELECT count(*) FROM public.sp_evidence))`),
  );
  data.cron =
    sql("SELECT to_regclass('cron.job') IS NOT NULL") === "t"
      ? Number(sql("SELECT count(*) FROM cron.job"))
      : 0;
  if (
    data.auth !== 8 ||
    data.confirmed !== 8 ||
    data.jobs !== 1 ||
    data.ai_enabled ||
    [
      "applications",
      "receipt_enabled",
      "messages",
      "mail_attempts",
      "ai_runs",
      "sw_ai_runs",
      "erasure_jobs",
      "erasure_queue",
      "cron",
    ].some((key) => data[key] !== 0)
  )
    throw Error("OP09_NATIVE_SIDE_EFFECT_FENCE_FAILED");
  return data;
}
try {
  await stage("official_native_stack", async () => {
    for (const port of [55819, 55820, 55821, 35820]) await freePort(port);
    if (output("supabase", ["--version"], "cli-version") !== CLI_VERSION)
      throw Error("OP09_NATIVE_CLI_VERSION_MISMATCH");
    fs.writeFileSync(path.join(context.stackRoot, "supabase/config.toml"), CONFIG);
    started = true;
    output(
      "supabase",
      ["start", "--workdir", context.stackRoot, "--exclude", EXCLUDED],
      "cli-start",
      { cwd: context.stackRoot, timeout: 600_000 },
    );
    const raw = output(
      "supabase",
      ["status", "--workdir", context.stackRoot, "-o", "json"],
      "cli-status",
      { cwd: context.stackRoot },
    );
    writePrivate("status.json", raw);
    status = validateStatus(readPrivateJson(file("status.json")));
    report.serviceVersions.postgres = sql("SHOW server_version");
    for (const service of ["auth", "storage", "rest", "db"])
      report.serviceVersions[service] = output(
        "docker",
        ["inspect", `supabase_${service}_${PROJECT}`, "--format", "{{.Config.Image}}"],
        `image-${service}`,
      );
    report.serviceVersions.postgrestBinary = output(
      "docker",
      ["exec", `supabase_rest_${PROJECT}`, "/bin/postgrest", "--version"],
      "postgrest-binary",
    );
    for (const sdk of ["supabase-js", "auth-js"])
      report.serviceVersions[sdk] = JSON.parse(
        fs.readFileSync(
          path.join(context.root, `node_modules/@supabase/${sdk}/package.json`),
          "utf8",
        ),
      ).version;
    if (
      !report.serviceVersions.postgres.startsWith("17.") ||
      !/:v?14\.15$/.test(report.serviceVersions.rest) ||
      !/:v?2\.194\.0$/.test(report.serviceVersions.auth) ||
      !/^PostgREST 14\.15(?:\s|$)/.test(report.serviceVersions.postgrestBinary) ||
      report.serviceVersions["supabase-js"] !== "2.110.5" ||
      report.serviceVersions["auth-js"] !== "2.110.5" ||
      sql("SELECT count(*) FROM auth.users") !== "0"
    )
      throw Error("OP09_NATIVE_SERVICE_PIN_OR_FRESHNESS_FAILED");
  });
  await stage("strict_complete_schema", async () => {
    const dir = path.join(context.root, "supabase/migrations");
    for (const name of history(fs.readdirSync(dir))) {
      report.failedMigration = name;
      output(
        "psql",
        ["-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", path.join(dir, name)],
        "migration",
        { env: dbEnv() },
      );
      report.migrations.push({ file: name, sha256: digest(fs.readFileSync(path.join(dir, name))) });
    }
    delete report.failedMigration;
    sql("NOTIFY pgrst,'reload schema'");
  });
  await stage("real_auth_receipt_off_setup", async () => {
    const actors = {};
    for (const alias of ACTORS) {
      actors[alias] = {
        email: `${namespace}-${alias.toLowerCase()}@synthetic.invalid`,
        password: `R!${crypto.randomBytes(24).toString("hex")}`,
        state: "intent_create",
      };
      writePrivate("actors.json", JSON.stringify(actors));
      let response;
      try {
        response = await request("/auth/v1/admin/users", {
          method: "POST",
          headers: headers(status.SERVICE_ROLE_KEY),
          body: JSON.stringify({
            email: actors[alias].email,
            password: actors[alias].password,
            email_confirm: true,
          }),
        });
      } catch {
        actors[alias].state = "unknown_outcome";
        writePrivate("actors.json", JSON.stringify(actors));
        throw Error("OP09_NATIVE_AUTH_UNKNOWN_OUTCOME_NO_RETRY");
      }
      const user = await response.json().catch(() => null);
      if (
        ![200, 201].includes(response.status) ||
        !validUuid(user?.id) ||
        !user.email_confirmed_at ||
        user.email !== actors[alias].email
      ) {
        actors[alias].state = "unknown_outcome";
        writePrivate("actors.json", JSON.stringify(actors));
        throw Error("OP09_NATIVE_AUTH_ADMIN_CREATE_FAILED");
      }
      actors[alias].id = user.id;
      actors[alias].state = "confirmed";
      writePrivate("actors.json", JSON.stringify(actors));
      const login = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: headers(status.ANON_KEY),
        body: JSON.stringify({ email: actors[alias].email, password: actors[alias].password }),
      });
      const session = await login.json().catch(() => null);
      if (login.status !== 200 || session?.user?.id !== user.id || !session.access_token)
        throw Error("OP09_NATIVE_PASSWORD_LOGIN_FAILED");
      const claims = JSON.parse(
        Buffer.from(session.access_token.split(".")[1], "base64url").toString(),
      );
      if (
        claims.sub !== user.id ||
        claims.role !== "authenticated" ||
        !claims.session_id ||
        new URL(claims.iss).origin !== API
      )
        throw Error("OP09_NATIVE_ACTUAL_SESSION_REQUIRED");
    }
    if (sql("SELECT count(*) FROM auth.users") !== "8") throw Error("OP09_NATIVE_AUTH_8_REQUIRED");
    const employer = crypto.randomUUID(),
      job = crypto.randomUUID();
    sql(
      `BEGIN;
      INSERT INTO public.employers(id,name,slug,status) VALUES('${employer}','OP09 synthetic receipt gate','${namespace}','active');
      INSERT INTO public.employer_memberships(user_id,employer_id,role,status) VALUES('${actors.O1.id}','${employer}','owner','active');
      INSERT INTO public.jobs(id,employer_id,slug,short_id,title_sv,title_en,status,application_method,requirements) VALUES('${job}','${employer}','${namespace}-job','OP09NATIVE','OP09 syntetiskt','OP09 synthetic','draft','internal','[]');
      INSERT INTO public.recruitment_settings(job_id,employer_id,responsible_user_id,receipt_enabled) VALUES('${job}','${employer}','${actors.O1.id}',false);
      COMMIT;`,
      "receipt-false",
    );
    report.authCreated = 8;
    report.beforeSdk = safety();
  });
  await stage("actual_sdk_44", async () => {
    try {
      output("bun", ["--no-env-file", "scripts/passport-native-op09-sdk.mjs"], "sdk", {
        timeout: 300_000,
      });
    } catch {
      if (fs.existsSync(file("sdk-failure.json"))) {
        const data = readPrivateJson(file("sdk-failure.json"));
        const source = fs.readFileSync(
          path.join(context.appRoot, "scripts/passport-upload-recovery-operational.ts"),
          "utf8",
        );
        const assertion =
          typeof data.assertion === "string" &&
          /^[a-z_]{1,100}$/.test(data.assertion) &&
          source.includes(`"${data.assertion}"`)
            ? data.assertion
            : undefined;
        throw Object.assign(Error("OP09_NATIVE_SDK_FAILED"), {
          safeDiagnostic: { ...(data.diagnostic ?? {}), ...(assertion ? { assertion } : {}) },
        });
      }
      throw Error("OP09_NATIVE_SDK_FAILED");
    }
    report.sdk = sdkSummary(readPrivateJson(file("sdk-result.json")));
    report.afterSdk = safety();
    report.operationalHelperHash = digest(
      fs.readFileSync(
        path.join(context.appRoot, "scripts/passport-upload-recovery-operational.ts"),
      ),
    );
  });
  await stage("pinned_app_start", async () => {
    writePrivate("cleanup-fault.json", JSON.stringify({ armed: false, injected: 0 }));
    const fd = fs.openSync(file("app.log"), "w", 0o600);
    appChild = cp.spawn(
      "node",
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "35820", "--strictPort"],
      { cwd: context.appRoot, env: appEnvironment(context, status), stdio: ["ignore", fd, fd] },
    );
    fs.closeSync(fd);
    let ready = false;
    for (let n = 0; n < 120; n++) {
      if (appChild.exitCode !== null) throw Error("OP09_NATIVE_APP_EXITED");
      try {
        const response = await fetch(`${APP}/login`, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* private bounded readiness */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw Error("OP09_NATIVE_APP_READINESS_FAILED");
    report.faultPreloadHash = digest(
      fs.readFileSync(path.join(context.root, "scripts/passport-native-op09-fault-preload.mjs")),
    );
  });
  await stage("actual_browser_reload_resume_cleanup", async () => {
    let raw;
    try {
      raw = output(
        "node",
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "scripts/passport-native-op09-browser.config.ts",
        ],
        "browser",
        { timeout: 900_000, env: { ...process.env, E2E_BASE_URL: APP } },
      );
    } catch {
      const state = fs.existsSync(file("browser-checkpoint.json"))
        ? readPrivateJson(file("browser-checkpoint.json"))
        : null;
      const steps = [
        "real_password_login",
        "reload_list_before_explicit_resume",
        "explicit_resume_once",
        "explicit_cleanup_503_retains_fence",
        "reload_no_implicit_cleanup_retry",
        "explicit_cleanup_retry_actual_absence",
        "completed",
      ];
      if (
        state &&
        steps.includes(state.step) &&
        ["sv", "en"].includes(state.locale) &&
        ["desktop1440", "emulated375"].includes(state.viewport)
      )
        throw Object.assign(Error("OP09_NATIVE_BROWSER_FAILED"), {
          safeDiagnostic: {
            checkpoint: state.step,
            locale: state.locale,
            viewport: state.viewport,
          },
        });
      throw Error("OP09_NATIVE_BROWSER_FAILED");
    }
    const data = JSON.parse(raw);
    report.browser = browserSummary(data.stats);
    const journeys = readPrivateJson(file("browser-journeys.json"));
    if (
      !Array.isArray(journeys) ||
      journeys.length !== 4 ||
      journeys.some(
        (r) =>
          r.result !== "PASS" ||
          r.injections !== 1 ||
          r.metadataCount !== 1 ||
          !r.registeredBytesPreserved ||
          !r.cleanedAbsent ||
          !r.noImplicitResume ||
          !r.noImplicitCleanupRetry,
      )
    )
      throw Error("OP09_NATIVE_BROWSER_READBACK_REQUIRED");
    report.browser.journeys = journeys;
  });
  await stage("final_side_effect_readback", async () => {
    report.finalReadback = safety();
  });
} catch {
  process.exitCode = 1;
} finally {
  if (appChild?.pid && appChild.exitCode === null) {
    appChild.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => appChild.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (appChild.exitCode === null && appChild.signalCode === null) appChild.kill("SIGKILL");
  }
  if (started) {
    try {
      output(
        "supabase",
        ["stop", "--workdir", context.stackRoot, "--project-id", PROJECT],
        "cli-stop",
        { cwd: context.stackRoot, timeout: 120_000 },
      );
      report.ownedStackStopped = true;
    } catch {
      report.errors.push({
        stage: "owned_stack_stop",
        code: "OP09_NATIVE_OWNED_STACK_STOP_FAILED",
      });
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  report.result = process.exitCode === 1 ? "FAILED" : "PASS";
  try {
    writePublic(context, report);
  } catch {
    console.error("OP09_NATIVE_PUBLIC_EVIDENCE_REFUSED");
    process.exitCode = 1;
  }
}
