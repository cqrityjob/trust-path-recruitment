// The employer journey on REAL Supabase services (2026-10-17).
//
// One connected walk in a real browser, against the app in this pull request
// and a fresh Supabase CLI stack: a new employer registers through /signup,
// a platform administrator approves the organisation in the admin UI, the
// owner writes and publishes a job, confirms its requirement profile, binds
// it to the Passport catalogue and finds the discoverable candidate (never
// the private one), contacts him; he accepts and applies with his Passport;
// the employer sees the application in the recruitment case. See
// e2e/employer-journey-local.spec.ts.
//
// What is real and what is not -- as in the talent discovery run, whose
// contract this one builds on (scripts/employer-journey-real-ci-contract.mjs):
//   real      GoTrue (open sign-up without confirmation for the employer,
//             admin-created accounts for the rest, password sign-in), Storage
//             API (the CV upload), PostgREST, Postgres 17, the head
//             application served by Vite, Chromium.
//   absent    Edge runtime (product mail cannot leave), realtime, studio.
//
// Seeded: only the candidates' Passport data, a Passport reviewer (for Bo's
// reviewed OV) and the administrator. The employer, its membership, the job,
// its requirements, the requirement profile and the talent criteria are all
// made in the browser; the runner checks that none of them exists before
// the walk.
//
// Usage (GitHub-hosted runner only): node scripts/employer-journey-real-ci-run.mjs
import fs from "node:fs";
import path from "node:path";
import {
  APP,
  API,
  CONFIG,
  CV_BUCKET,
  EXCLUDED,
  NEW_OWNER_EMAIL,
  PEOPLE,
  PASSWORD,
  SCENARIOS,
  appEnvironment,
  isRegistryThrottle,
  requireBrowserCounts,
  requireRunner,
  requireStatus,
} from "./employer-journey-real-ci-contract.mjs";
import {
  createBucket,
  createGoTrueAccounts,
  printFailureDiagnostics,
  psql,
  psqlFile,
  replayMigrations,
  runPlaywrightSpec,
  stageRunner,
  startCliStack,
  startViteApp,
  stopCliStack,
} from "./lib/real-supabase-ci.mjs";

const SPEC = "e2e/employer-journey-local.spec.ts";
const root = process.cwd();
const stackRoot = path.join(root, "ej-real-stack");
const publicRoot = path.join(root, "ej-real-public");
const privateRoot = path.join(stackRoot, "private");
const report = { result: "FAILED", stages: [], evidenceSha: process.env.EJ_REAL_EVIDENCE_SHA };
const stage = stageRunner(report, privateRoot);

let status;
let app;
const sql = (q) => psql(status.DB_URL, q);

async function main() {
  requireRunner(process.env);
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(publicRoot, "images"), { recursive: true });

  await stage("cli_start", async () => {
    status = requireStatus(
      await startCliStack({ stackRoot, config: CONFIG, excluded: EXCLUDED, isRegistryThrottle }),
    );
    if (sql("SELECT count(*) FROM auth.users") !== "0") throw Error("EJ_REAL_FRESH_AUTH_REQUIRED");
    // The journey starts with a public registration: GoTrue must accept a
    // sign-up and return a session (no confirmation mail can be sent here).
    const settings = await fetch(`${API}/auth/v1/settings`, {
      headers: { apikey: status.ANON_KEY },
    }).then((r) => r.json());
    if (settings.disable_signup !== false || settings.mailer_autoconfirm !== true)
      throw Error("EJ_REAL_SIGNUP_NOT_OPEN");
    report.services = { postgres: sql("SHOW server_version").split(" ")[0], signup: "open" };
  });

  await stage("strict_schema_replay", async () => {
    const files = replayMigrations(root, status.DB_URL);
    report.migrations = files.length;
    report.lastMigrations = files.slice(-3);
  });

  await stage("real_auth_accounts", async () => {
    await createGoTrueAccounts({
      api: API,
      status,
      people: PEOPLE,
      password: PASSWORD,
      code: "EJ_REAL",
    });
    report.accounts = PEOPLE.length;
  });

  // Not created by any migration (the hosted project has it); the same
  // settings and the same Storage API call as the talent discovery run.
  await stage("storage_buckets", async () => {
    await createBucket({ api: API, status, bucket: CV_BUCKET, code: "EJ_REAL_CV" });
    report.buckets = [CV_BUCKET.id];
  });

  await stage("fixture", async () => {
    // real_auth=1: the accounts already exist, created through GoTrue above.
    psqlFile(status.DB_URL, "scripts/fixtures/employer-journey-fixture.sql", { real_auth: 1 });
    // Candidates, reviewer and administrator only: the walk makes the rest.
    const made = sql(
      `SELECT (SELECT count(*) FROM public.employers) || ',' || (SELECT count(*) FROM public.jobs) || ',' ||
              (SELECT count(*) FROM public.employer_memberships) || ',' ||
              (SELECT count(*) FROM auth.users WHERE lower(email) = '${NEW_OWNER_EMAIL}') || ',' ||
              (SELECT count(*) FROM public.user_roles WHERE role = 'admin')`,
    );
    if (made !== "0,0,0,0,1") throw Error("EJ_REAL_FIXTURE_SEEDED_TOO_MUCH");
  });

  await stage("head_app_start", async () => {
    app = await startViteApp({
      root,
      appUrl: APP,
      env: appEnvironment(status, process.env),
      logPath: path.join(privateRoot, "app.log"),
      code: "EJ_REAL",
      // Compile the routes the walk opens before the clock starts.
      warm: [
        "/signup",
        "/employer",
        "/employer/pending",
        "/admin",
        "/passport/discoverability",
        "/jobs",
      ],
    });
  });

  await stage("browser_scenarios", async () => {
    const { stats, failure } = runPlaywrightSpec({
      spec: SPEC,
      jsonFile: path.join(privateRoot, "playwright.json"),
      env: {
        ...process.env,
        E2E_LOCAL_STACK: "1",
        EJ_REAL_STACK: "1",
        E2E_BASE_URL: APP,
        E2E_SUPABASE_URL: API,
        E2E_DB_URL: status.DB_URL,
        E2E_SUPABASE_ANON_KEY: status.ANON_KEY,
        EJ_EVIDENCE_DIR: path.join(publicRoot, "images"),
      },
    });
    if (failure)
      printFailureDiagnostics({
        root,
        privateRoot,
        appLogPattern:
          /error|fail|refus|\[applications\]|\[talent\]|\[notices\]|\[admin-employer-moderation\]/i,
      });
    report.browser = requireBrowserCounts(stats, SCENARIOS, { allowFailure: Boolean(failure) });
    if (failure) throw Error("EJ_REAL_BROWSER_FAILED");
  });

  report.result = "PASS";
}

try {
  await main();
} catch (error) {
  console.error(
    `employer-journey real CI failed: ${String(error?.message ?? error).slice(0, 200)}`,
  );
  process.exitCode = 1;
} finally {
  if (app) app.kill("SIGTERM");
  stopCliStack(stackRoot);
  fs.mkdirSync(publicRoot, { recursive: true });
  fs.writeFileSync(path.join(publicRoot, "manifest.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
