// Shared steps of a "real Supabase services" CI run: a fresh Supabase CLI
// stack (GoTrue, Storage, PostgREST, Postgres 17), the full migration history
// replayed strictly, accounts created through GoTrue's admin API, a private
// bucket through the Storage API, the head app served by Vite and one
// Playwright spec. Each function is one step, parameterised by the run's own
// facts (ports, project, error-code prefix), so a run composes them instead
// of copying a runner.
//
// First user: scripts/employer-journey-real-ci-run.mjs. The talent discovery
// runner predates this module and is left as it is (its contract test pins
// its own text); the steps here are the same steps, lifted unchanged.
//
// Nothing here writes to auth.* or storage.* with SQL, and nothing prints a
// key, token or password.
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireCompleteHistory } from "../recruiter-real-ci-contract.mjs";

export function run(cmd, args, opts = {}) {
  return cp.execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

/** Runs named stages into `report.stages`. Only the stage name and its
 * status go public; raw output is kept in `privateRoot` (mode 0600). */
export function stageRunner(report, privateRoot) {
  return async function stage(name, fn) {
    const started = Date.now();
    try {
      await fn();
      report.stages.push({ name, status: "PASS", ms: Date.now() - started });
    } catch (error) {
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
  };
}

/** libpq environment for the stack's database URL. */
export function pgEnv(dbUrl) {
  const db = new URL(dbUrl);
  return {
    ...process.env,
    PGHOST: db.hostname,
    PGPORT: db.port,
    PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password),
    PGDATABASE: db.pathname.slice(1),
  };
}

export function psql(dbUrl, query) {
  return run("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c", query], { env: pgEnv(dbUrl) }).trim();
}

/** Runs an SQL file with ON_ERROR_STOP and the given psql variables. */
export function psqlFile(dbUrl, file, vars = {}) {
  const args = ["-v", "ON_ERROR_STOP=1"];
  for (const [name, value] of Object.entries(vars)) args.push("-v", `${name}=${value}`);
  return run("psql", [...args, "-q", "-f", file], { env: pgEnv(dbUrl) });
}

/** `supabase start` in its own workdir with `config`; a public-registry
 * throttle is retried twice after a clean stop, any other failure is final.
 * Returns `supabase status -o json`. */
export async function startCliStack({ stackRoot, config, excluded, isRegistryThrottle }) {
  fs.mkdirSync(path.join(stackRoot, "supabase"), { recursive: true });
  fs.writeFileSync(path.join(stackRoot, "supabase/config.toml"), config);
  for (let attempt = 1; ; attempt++) {
    try {
      run("supabase", ["start", "--workdir", stackRoot, "--exclude", excluded], {
        timeout: 1_200_000,
      });
      break;
    } catch (error) {
      const text = String(error?.stderr ?? "") + String(error?.stdout ?? "");
      if (attempt >= 3 || !isRegistryThrottle(text)) throw error;
      console.warn(`registry throttle during supabase start; bounded retry ${attempt + 1}/3`);
      stopCliStack(stackRoot);
      await new Promise((r) => setTimeout(r, attempt * 30_000));
    }
  }
  return JSON.parse(run("supabase", ["status", "--workdir", stackRoot, "-o", "json"]));
}

export function stopCliStack(stackRoot) {
  try {
    run("supabase", ["stop", "--workdir", stackRoot, "--no-backup"], { timeout: 300_000 });
  } catch {
    /* the stack may never have started */
  }
}

/** Every migration, in order, ON_ERROR_STOP; the history must be the
 * complete canonical one (requireCompleteHistory). */
export function replayMigrations(root, dbUrl) {
  const dir = path.join(root, "supabase/migrations");
  const files = requireCompleteHistory(fs.readdirSync(dir));
  for (const file of files)
    run("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(dir, file)], { env: pgEnv(dbUrl) });
  psql(dbUrl, "NOTIFY pgrst, 'reload schema'");
  return files;
}

/** Creates each person through GoTrue's admin API with a fixed id and a
 * confirmed address, then proves a password sign-in works. */
export async function createGoTrueAccounts({ api, status, people, password, code }) {
  for (const person of people) {
    const res = await fetch(`${api}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: person.id,
        email: person.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: person.name },
      }),
    });
    if (![200, 201].includes(res.status)) throw Error(`${code}_AUTH_CREATE_FAILED_${res.status}`);
    const row = await res.json();
    if (row.id !== person.id) throw Error(`${code}_AUTH_ID_IGNORED`);
    const login = await fetch(`${api}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: person.email, password }),
    });
    if (login.status !== 200) throw Error(`${code}_AUTH_LOGIN_FAILED_${login.status}`);
  }
}

/** Creates `bucket` through the Storage API and reads it back; its object
 * policies stay exactly as the replayed migrations left them. */
export async function createBucket({ api, status, bucket, code }) {
  const headers = {
    apikey: status.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const create = await fetch(`${api}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify(bucket),
  });
  if (create.status !== 200) throw Error(`${code}_BUCKET_CREATE_FAILED_${create.status}`);
  const read = await fetch(`${api}/storage/v1/bucket/${bucket.id}`, { headers });
  const got = read.status === 200 ? await read.json() : null;
  if (
    !got ||
    got.public !== bucket.public ||
    got.file_size_limit !== bucket.file_size_limit ||
    JSON.stringify(got.allowed_mime_types) !== JSON.stringify(bucket.allowed_mime_types)
  )
    throw Error(`${code}_BUCKET_SETTINGS_MISMATCH`);
}

/** Serves the head app with Vite on `appUrl`'s port and compiles `warm`
 * routes before the clock starts. Returns the child process. */
export async function startViteApp({ root, appUrl, env, logPath, warm, code }) {
  const log = fs.openSync(logPath, "w", 0o600);
  const app = cp.spawn(
    "node",
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      new URL(appUrl).port,
      "--strictPort",
    ],
    { cwd: root, env, stdio: ["ignore", log, log] },
  );
  fs.closeSync(log);
  let ready = false;
  for (let i = 0; i < 180 && !ready; i++) {
    try {
      ready = (await fetch(`${appUrl}/login`, { signal: AbortSignal.timeout(5000) })).ok;
    } catch {
      /* still compiling */
    }
    if (!ready) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) {
    app.kill("SIGTERM");
    throw Error(`${code}_APP_NOT_READY`);
  }
  for (const route of warm)
    await fetch(`${appUrl}${route}`, { signal: AbortSignal.timeout(180_000) }).catch(() => {});
  return app;
}

/** Runs one spec on chromium with list+json reporters. Returns the JSON
 * stats and the failure (if any); never throws for a failed test. */
export function runPlaywrightSpec({ spec, env, jsonFile, timeout = 2_400_000 }) {
  let failure = null;
  try {
    cp.execFileSync(
      "bunx",
      ["playwright", "test", spec, "--project=chromium", "--reporter=list,json"],
      { env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile }, stdio: "inherit", timeout },
    );
  } catch (error) {
    failure = error;
  }
  const stats = fs.existsSync(jsonFile) ? JSON.parse(fs.readFileSync(jsonFile, "utf8")).stats : {};
  return { stats, failure };
}

/** On a failed scenario, say why in the job log: each failed test's error
 * context and the application server's error lines. Everything printed is
 * synthetic; any line that looks like a key, token or password is dropped. */
export function printFailureDiagnostics({ root, privateRoot, appLogPattern }) {
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
    const errors = log.filter((l) => appLogPattern.test(l) && !secret.test(l));
    console.log("::group::application server error lines");
    for (const line of errors.slice(-80)) console.log(line.slice(0, 400));
    console.log("::endgroup::");
  } catch {
    /* no app log */
  }
}
