// Prepared GitHub-hosted ephemeral native integration. Running this file on
// a workstation or hosted Supabase is refused before any service/API action.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import { createClient } from "@supabase/supabase-js";
import {
  ACTORS,
  API,
  APP,
  APP_SHA,
  SCHEMA_SHA,
  PROJECT,
  CLI_VERSION,
  CONFIG,
  EXCLUDED,
  EMPLOYER,
  JOB,
  PDF_BYTES,
  appId,
  cvPath,
  hasCv,
  sha256,
  validateTarget,
  validateStatus,
  readPrivateJson,
  history,
  requireBrowserCounts,
  failure,
} from "./recruiter-p1-native-contract.mjs";
import {
  appFixtureSql,
  profileRulesSql,
  decisions,
  createActors,
  nativeApiSource,
  nativeBrowserSource,
  SQL_HASH,
  API_HASH,
  BROWSER_HASH,
} from "./recruiter-p1-native-fixture.mjs";
import { writeNativePublic } from "./recruiter-p1-native-public.mjs";

const git = (cwd, args) =>
  cp
    .execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .trim();
const root = process.env.GITHUB_WORKSPACE;
if (!root) throw Error("P1_NATIVE_WORKSPACE_REQUIRED");
const context = validateTarget(
  process.env,
  git(root, ["rev-parse", "HEAD"]),
  git(path.join(root, "app"), ["rev-parse", "HEAD"]),
  git(path.join(root, "schema"), ["rev-parse", "HEAD"]),
);
for (const dir of [context.root, context.appRoot, context.schemaRoot])
  if (git(dir, ["status", "--porcelain", "--untracked-files=no"]))
    throw Error("P1_NATIVE_TRACKED_FILES_DIRTY");
for (const dir of [context.stackRoot, context.publicRoot])
  if (fs.existsSync(dir)) throw Error("P1_NATIVE_FRESH_DIRECTORIES_REQUIRED");
if (cp.spawnSync("docker", ["inspect", `supabase_db_${PROJECT}`], { stdio: "ignore" }).status === 0)
  throw Error("P1_NATIVE_EXISTING_PROJECT_REFUSED");
const privateRoot = path.join(context.stackRoot, "supabase/.temp");
fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
fs.chmodSync(privateRoot, 0o700);
const privateFile = (name) => path.join(privateRoot, name);
const writePrivate = (name, value) => {
  const file = privateFile(name);
  fs.writeFileSync(file, value, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
};
const namespace = `ri-p1-${crypto.randomBytes(6).toString("hex")}`;
const report = {
  kind: "prepared-native-p1-100-v1",
  startedAt: new Date().toISOString(),
  evidenceSha: context.evidenceSha,
  appSha: APP_SHA,
  schemaSha: SCHEMA_SHA,
  project: PROJECT,
  namespace,
  serviceVersions: {},
  canonicalSources: { sql: SQL_HASH, api: API_HASH, browser: BROWSER_HASH },
  stages: Object.fromEntries(
    [
      "official_native_stack",
      "strict_complete_schema",
      "auth_104_admin_api_fixed_ids",
      "application_fixture_receipts_off",
      "storage_80_actual_pdf_bytes",
      "baseline_100_human_session_rpc",
      "canonical_23_http_two_real_reviewers",
      "actual_source_revoke_replace",
      "historical_synthetic_ai_never_green",
      "owned_job_cascade_fresh_browser_baseline",
      "actual_password_browser_five_cases",
    ].map((stage) => [stage, "not_run"]),
  ),
  errors: [],
  setupAuthority: {
    auth: "local_admin_createUser_email_confirm_true_fixed_104_ids",
    storage: "local_service_role_setup_80_original_pdf_objects_not_candidate_upload_acl",
    applicationDml: "disposable_local_postgres_own_fixture_only",
    judgment: "signed_in_owner_and_admin_http_rpc",
    browser: "real_password_sessions_sv_en_desktop_emulated_mobile_not_physical_phone",
  },
  excluded: [
    "hosted runtime/CDN",
    "physical phone",
    "candidate upload ACL claim",
    "private keys/passwords/JWTs/raw logs/signed URLs",
  ],
};
let status,
  admin,
  actors,
  appChild,
  started = false;
const clients = {};
function command(name, args, label, options = {}) {
  const file = writePrivate(`${label}.log`, "");
  const fd = fs.openSync(file, "a");
  const result = cp.spawnSync(name, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", fd, fd],
    timeout: 600_000,
    ...options,
  });
  fs.closeSync(fd);
  if (result.status !== 0)
    throw Error(`P1_NATIVE_${label.toUpperCase().replaceAll("-", "_")}_FAILED`);
  return fs.readFileSync(file, "utf8").trim();
}
function dbEnv() {
  const db = new URL(status.DB_URL);
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PGHOST: "127.0.0.1",
    PGPORT: "55811",
    PGUSER: "postgres",
    PGDATABASE: "postgres",
    PGPASSWORD: decodeURIComponent(db.password),
  };
}
const sql = (query, label = "readback") =>
  command("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c", query], label, { env: dbEnv() });
async function stage(name, action) {
  report.stages[name] = "running";
  try {
    await action();
    report.stages[name] = "passed";
    console.log(`P1_NATIVE_PASS ${name}`);
  } catch (e) {
    report.stages[name] = "failed";
    report.errors.push({
      stage: name,
      code: /^P1_NATIVE_[A-Z0-9_]+$/.test(e?.message ?? "") ? e.message : "P1_NATIVE_STAGE_FAILED",
      ...(e?.safeDiagnostic ? { diagnostic: e.safeDiagnostic } : {}),
    });
    throw Error("P1_NATIVE_STAGE_FAILED");
  }
}
function client(key) {
  return createClient(API, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, init) => {
        if (new URL(url).origin !== API) throw Error("P1_NATIVE_EXTERNAL_FETCH_REFUSED");
        try {
          return await fetch(url, {
            ...init,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          throw Error("P1_NATIVE_PRIVATE_TRANSPORT_FAILED");
        }
      },
    },
  });
}
async function login(alias) {
  const actor = actors[alias];
  const c = client(status.ANON_KEY);
  const result = await c.auth.signInWithPassword({ email: actor.email, password: actor.password });
  if (result.error || result.data.user?.id !== actor.id || !result.data.session)
    throw Error("P1_NATIVE_PASSWORD_LOGIN_FAILED");
  const claims = JSON.parse(
    Buffer.from(result.data.session.access_token.split(".")[1], "base64url").toString(),
  );
  if (
    claims.sub !== actor.id ||
    claims.role !== "authenticated" ||
    !claims.session_id ||
    new URL(claims.iss).origin !== API
  )
    throw Error("P1_NATIVE_ACTUAL_SESSION_REQUIRED");
  clients[alias] = c;
  return result.data.session.access_token;
}
async function rpc(name, data, alias = "owner") {
  const r = await clients[alias].rpc(name, data);
  if (r.error) throw failure(name, r);
  return r.data;
}
const view = () =>
  rpc("rec_ri_candidate_view", {
    _employer_id: EMPLOYER,
    _job_id: JOB,
    _filters: { stage: "received" },
    _sort: "requirements",
    _dir: null,
    _page: 1,
    _size: 25,
    _around: null,
  });
function counts(actual, expected) {
  for (const [key, value] of Object.entries(expected))
    if (actual[key] !== value) throw Error("P1_NATIVE_ORACLE_MISMATCH");
}
function safety() {
  const data = JSON.parse(
    sql(`SELECT jsonb_build_object(
 'auth', (SELECT count(*) FROM auth.users),
 'confirmed',(SELECT count(*) FROM auth.users WHERE email LIKE '${namespace}-%@synthetic.invalid' AND email_confirmed_at IS NOT NULL AND encrypted_password ~ '^\\$2[aby]\\$'),
 'applications',(SELECT count(*) FROM public.job_applications WHERE employer_id='${EMPLOYER}'),
 'receipt_enabled',(SELECT count(*) FROM public.recruitment_settings WHERE employer_id='${EMPLOYER}' AND receipt_enabled),
 'messages',(SELECT count(*) FROM public.recruitment_messages),
 'mail_attempts',(SELECT coalesce(sum(email_attempts),0) FROM public.recruitment_messages),
 'erasure_jobs',(SELECT count(*) FROM public.recruitment_erasure_jobs),
 'erasure_queue',(SELECT count(*) FROM public.storage_erasure_queue),
 'ai_enabled',(SELECT ai_enabled OR transcript_enabled FROM public.scp_interview_ai_config WHERE id),
 'generated_ai',(SELECT count(*) FROM public.scp_interview_ai_runs WHERE provider<>'mock'),
 'synthetic_ai',(SELECT count(*) FROM public.scp_interview_ai_runs WHERE provider='mock'),
 'sw_ai',(SELECT count(*) FROM public.sw_ai_runs))`),
  );
  data.cron =
    sql("SELECT to_regclass('cron.job') IS NOT NULL") === "t"
      ? Number(sql("SELECT count(*) FROM cron.job"))
      : 0;
  if (
    data.auth !== 104 ||
    data.confirmed !== 104 ||
    data.applications !== 100 ||
    data.ai_enabled ||
    [
      "receipt_enabled",
      "messages",
      "mail_attempts",
      "erasure_jobs",
      "erasure_queue",
      "generated_ai",
      "sw_ai",
      "cron",
    ].some((key) => data[key] !== 0)
  )
    throw Error("P1_NATIVE_SIDE_EFFECT_OR_POPULATION_GUARD_FAILED");
  return data;
}
async function upload(n) {
  const r = await admin.storage
    .from("job-application-cvs")
    .upload(cvPath(n), PDF_BYTES, { contentType: "application/pdf", upsert: false });
  if (r.error || r.data?.path !== cvPath(n)) throw Error("P1_NATIVE_SETUP_STORAGE_UPLOAD_FAILED");
}
const canonicalSql = fs.readFileSync(
  path.join(context.appRoot, "supabase/tests/recruiter_intelligence_p1_test.sql"),
  "utf8",
);
async function seedHumanReviews() {
  const rules = JSON.parse(sql(profileRulesSql(canonicalSql), "rules"));
  if (rules.length !== 6 || rules.filter((r) => r.kind === "mandatory").length !== 4)
    throw Error("P1_NATIVE_CANONICAL_RULES_MISMATCH");
  await rpc("rec_ri_confirm_profile", {
    _job_id: JOB,
    _expected_version: 0,
    _operation_id: crypto.randomUUID(),
    _start_date: "2026-11-01",
    _rules: rules,
  });
  for (let n = 1; n <= 100; n++) {
    const reviewer = n % 2 ? "owner" : "bob";
    const v = await rpc("rec_ri_get_review", { _application_id: appId(n) }, reviewer);
    await rpc(
      "rec_ri_save_review",
      {
        _application_id: appId(n),
        _profile_id: v.profile.profileId,
        _expected_revision: v.revision,
        _binding_token: v.bindingToken,
        _operation_id: crypto.randomUUID(),
        _decisions: decisions(n, v),
        _confirm: n <= 10 || (n >= 41 && n <= 47) || (n >= 66 && n <= 75),
        _next_action: "Kontrollera återstående underlag",
        _responsible_user_id: ACTORS[n % 2 ? 0 : 1].id,
        _expected_assignment_version: v.assignmentVersion,
      },
      reviewer,
    );
  }
  const baseline = (await view()).intelligenceCounts;
  counts(baseline, {
    received: 100,
    green: 40,
    yellow: 25,
    gray: 35,
    reviewed: 27,
    remaining: 73,
    notEstablished: 0,
  });
  return baseline;
}
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(Error("P1_NATIVE_PORT_IN_USE")));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
try {
  await stage("official_native_stack", async () => {
    for (const port of [55809, 55810, 55811, 35810]) await freePort(port);
    if (command("supabase", ["--version"], "cli-version") !== CLI_VERSION)
      throw Error("P1_NATIVE_CLI_VERSION_MISMATCH");
    fs.writeFileSync(path.join(context.stackRoot, "supabase/config.toml"), CONFIG);
    started = true;
    command(
      "supabase",
      ["start", "--workdir", context.stackRoot, "--exclude", EXCLUDED],
      "cli-start",
      { cwd: context.stackRoot },
    );
    const raw = command(
      "supabase",
      ["status", "--workdir", context.stackRoot, "-o", "json"],
      "cli-status",
      { cwd: context.stackRoot },
    );
    writePrivate("status.json", raw);
    status = validateStatus(readPrivateJson(privateFile("status.json")));
    report.serviceVersions.postgres = sql("SHOW server_version");
    for (const service of ["auth", "storage", "rest", "db"])
      report.serviceVersions[service] = command(
        "docker",
        ["inspect", `supabase_${service}_${PROJECT}`, "--format", "{{.Config.Image}}"],
        `image-${service}`,
      );
    report.serviceVersions.postgrestBinary = command(
      "docker",
      ["exec", `supabase_rest_${PROJECT}`, "/bin/postgrest", "--version"],
      "postgrest-binary",
    );
    report.serviceVersions.supabaseJs = JSON.parse(
      fs.readFileSync(path.join(root, "node_modules/@supabase/supabase-js/package.json"), "utf8"),
    ).version;
    report.serviceVersions.authJs = JSON.parse(
      fs.readFileSync(path.join(root, "node_modules/@supabase/auth-js/package.json"), "utf8"),
    ).version;
    if (
      !report.serviceVersions.postgres.startsWith("17.") ||
      !/:v?14\.15$/.test(report.serviceVersions.rest) ||
      !/:v?2\.194\.0$/.test(report.serviceVersions.auth) ||
      !/^PostgREST 14\.15(?:\s|$)/.test(report.serviceVersions.postgrestBinary) ||
      report.serviceVersions.supabaseJs !== "2.110.5" ||
      report.serviceVersions.authJs !== "2.110.5" ||
      sql("SELECT count(*) FROM auth.users") !== "0"
    )
      throw Error("P1_NATIVE_SERVICE_PIN_OR_FRESHNESS_FAILED");
  });
  await stage("strict_complete_schema", async () => {
    const files = history(fs.readdirSync(path.join(context.schemaRoot, "supabase/migrations")));
    report.migrations = [];
    for (const file of files) {
      report.failedMigration = file;
      const source = path.join(context.schemaRoot, "supabase/migrations", file);
      command("psql", ["-v", "ON_ERROR_STOP=1", "-f", source], "migration", { env: dbEnv() });
      report.migrations.push({ file, sha256: sha256(fs.readFileSync(source)) });
    }
    delete report.failedMigration;
    sql("NOTIFY pgrst,'reload schema'");
    sql(`CREATE SCHEMA ri_p1_native_test; REVOKE ALL ON SCHEMA ri_p1_native_test FROM PUBLIC,anon,authenticated,service_role;
 CREATE TABLE ri_p1_native_test.marker(namespace text PRIMARY KEY); INSERT INTO ri_p1_native_test.marker VALUES('${namespace}')`);
  });
  await stage("auth_104_admin_api_fixed_ids", async () => {
    admin = client(status.SERVICE_ROLE_KEY);
    const before = await admin.auth.admin.listUsers();
    if (before.error || before.data.users.length !== 0)
      throw Error("P1_NATIVE_FRESH_AUTH_REQUIRED");
    actors = await createActors(admin, namespace, (state) =>
      writePrivate("actors.json", JSON.stringify(state)),
    );
    if (Object.keys(actors).length !== 104 || sql("SELECT count(*) FROM auth.users") !== "104")
      throw Error("P1_NATIVE_AUTH_104_REQUIRED");
    for (const alias of ["owner", "bob", "member", "outsider"]) await login(alias);
    report.authCreated = 104;
    report.actualReviewerSessions = ["owner", "bob"];
  });
  await stage("application_fixture_receipts_off", async () => {
    const file = writePrivate("app-fixture.sql", appFixtureSql(canonicalSql, namespace));
    command("psql", ["-v", "ON_ERROR_STOP=1", "-f", file], "app-fixture", { env: dbEnv() });
    report.beforeOriginals = safety();
  });
  await stage("storage_80_actual_pdf_bytes", async () => {
    for (let n = 1; n <= 100; n++)
      if (hasCv(n)) {
        await upload(n);
        const read = await admin.storage.from("job-application-cvs").download(cvPath(n));
        if (read.error || !Buffer.from(await read.data.arrayBuffer()).equals(PDF_BYTES))
          throw Error("P1_NATIVE_STORAGE_BYTES_READBACK_FAILED");
      }
    report.actualOriginalObjects = 80;
    // Fixture upload is privileged setup; owner reads/signs use actual RLS.
    const signed = await clients.owner.storage
      .from("job-application-cvs")
      .createSignedUrl(cvPath(1), 60);
    if (signed.error || new URL(signed.data.signedUrl).origin !== API)
      throw Error("P1_NATIVE_OWNER_SIGNED_URL_DENIED");
    const read = await fetch(signed.data.signedUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!read.ok || !Buffer.from(await read.arrayBuffer()).equals(PDF_BYTES))
      throw Error("P1_NATIVE_SIGNED_URL_BYTES_FAILED");
    report.ownerSignedOriginalBytes = true;
  });
  await stage("baseline_100_human_session_rpc", async () => {
    report.baseline = await seedHumanReviews();
  });
  await stage("canonical_23_http_two_real_reviewers", async () => {
    const tokens = {};
    for (const alias of ["owner", "bob", "member", "outsider"])
      tokens[actors[alias].id] = await login(alias);
    const connection = writePrivate(
      "sessions.json",
      JSON.stringify({ anonKey: status.ANON_KEY, tokens }),
    );
    const source = fs.readFileSync(
      path.join(context.appRoot, "scripts/recruiter-intelligence-p1-api-check.mjs"),
      "utf8",
    );
    const file = writePrivate("native-api.mjs", nativeApiSource(source));
    const result = command("node", [file], "native-api", {
      env: { PATH: process.env.PATH, RI_P1_NATIVE_SESSIONS_FILE: connection },
    });
    const jsonStart = result.lastIndexOf('\n{\n  "kind":');
    if (jsonStart < 0) throw Error("P1_NATIVE_API_READBACK_REQUIRED");
    const apiReadback = JSON.parse(result.slice(jsonStart));
    if (
      apiReadback.kind !== "executed-native-gotrue-postgrest-api" ||
      apiReadback.assertions !== 23
    )
      throw Error("P1_NATIVE_ALL_23_API_ASSERTIONS_REQUIRED");
    counts(apiReadback.baseline, {
      received: 100,
      green: 40,
      yellow: 25,
      gray: 35,
      reviewed: 27,
      remaining: 73,
    });
    counts(apiReadback.v2, { green: 30, yellow: 35, gray: 35, reviewed: 0, remaining: 100 });
    if (
      apiReadback.concurrentStatuses.length !== 2 ||
      [...apiReadback.concurrentStatuses].sort().join() !== "200,409"
    )
      throw Error("P1_NATIVE_TWO_REVIEWER_CAS_READBACK_REQUIRED");
    report.canonicalHttpAssertions = 23;
    report.twoDistinctReviewerCas = true;
    report.apiBaseline = apiReadback.baseline;
    report.apiV2 = apiReadback.v2;
    report.concurrentReviewerStatuses = apiReadback.concurrentStatuses;
  });
  await stage("actual_source_revoke_replace", async () => {
    const before = await rpc("rec_ri_get_review", { _application_id: appId(1) });
    const paths = Array.from({ length: 5 }, (_, i) => cvPath(i + 1));
    const removed = await admin.storage.from("job-application-cvs").remove(paths);
    if (removed.error) throw Error("P1_NATIVE_REVOKE_STORAGE_DELETE_FAILED");
    for (const file of paths)
      if (!(await admin.storage.from("job-application-cvs").download(file)).error)
        throw Error("P1_NATIVE_REVOKED_BYTES_STILL_READABLE");
    report.revokedSource = (await view()).intelligenceCounts;
    counts(report.revokedSource, { green: 25, yellow: 35, gray: 40, reviewed: 0, remaining: 100 });
    const missing = await rpc("rec_ri_get_review", { _application_id: appId(1) });
    if (missing.availableSources.some((s) => s.kind === "application_cv"))
      throw Error("P1_NATIVE_REVOKED_SOURCE_STILL_SELECTABLE");
    for (let n = 1; n <= 5; n++) {
      await upload(n);
      const read = await admin.storage.from("job-application-cvs").download(cvPath(n));
      if (read.error || !Buffer.from(await read.data.arrayBuffer()).equals(PDF_BYTES))
        throw Error("P1_NATIVE_REPLACEMENT_BYTES_FAILED");
    }
    const replacement = await rpc("rec_ri_get_review", { _application_id: appId(1) });
    if (
      replacement.availableSources.find((s) => s.kind === "application_cv")?.version ===
      before.availableSources.find((s) => s.kind === "application_cv")?.version
    )
      throw Error("P1_NATIVE_REPLACEMENT_SOURCE_VERSION_REUSED");
    counts((await view()).intelligenceCounts, { green: 25, yellow: 35, gray: 40, reviewed: 0 });
    report.replacementDoesNotRestoreOldAcceptance = true;
  });
  await stage("historical_synthetic_ai_never_green", async () => {
    const pack = sql(
      "SELECT v.id FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug='vaktare-se' AND v.version_number=1",
    );
    const caseId = await rpc("scp_iv_create_case", {
      _employer_id: EMPLOYER,
      _title: "Synthetic P1 native AI isolation",
      _pack_version_id: pack,
      _candidate_display_name: "Synthetic A096",
      _candidate_user_id: ACTORS.find((a) => a.alias === "candidate-96").id,
      _candidate_external_ref: null,
      _job_id: JOB,
      _application_id: appId(96),
    });
    if (!/^[a-f0-9-]{36}$/.test(caseId)) throw Error("P1_NATIVE_SYNTHETIC_CASE_ID_REQUIRED");
    sql(`INSERT INTO public.scp_interview_ai_runs(case_id,task,task_version,prompt_version,provider,model,status,raw_response,requires_human_review)
 SELECT '${caseId}','candidate_source_extraction','synthetic','synthetic','mock','synthetic','succeeded',jsonb_build_object('requirementId','10000000-0000-4000-8000-000000000004','state',state),true FROM unnest(ARRAY['met','not_met'])state;
 INSERT INTO public.scp_interview_findings(case_id,ai_run_id,finding_kind,statement,claim_class,human_state)
 SELECT '${caseId}',id,'unclear','Synthetic proposal, no original evidence','ai_inference','proposed' FROM public.scp_interview_ai_runs WHERE case_id='${caseId}'`);
    const review = await rpc("rec_ri_get_review", { _application_id: appId(96) });
    if (
      review.requirementStatus !== "gray" ||
      review.criteria.find((c) => c.position === 4)?.state !== "clarify"
    )
      throw Error("P1_NATIVE_AI_CHANGED_ACCEPTANCE");
    const denied = await clients.owner.rpc("rec_ri_save_review", {
      _application_id: appId(96),
      _profile_id: review.profile.profileId,
      _expected_revision: review.revision,
      _binding_token: review.bindingToken,
      _operation_id: crypto.randomUUID(),
      _decisions: [
        {
          requirementId: "10000000-0000-4000-8000-000000000004",
          state: "met",
          sourceKind: null,
          sourceReference: null,
          sourceVersion: null,
          sourceLabel: null,
          validUntil: null,
          note: "AI draft only",
          neutralQuestion: null,
        },
      ],
      _confirm: false,
      _next_action: null,
      _responsible_user_id: null,
      _expected_assignment_version: review.assignmentVersion,
    });
    if (denied.error?.message !== "RI_ACCEPTED_SOURCE_REQUIRED")
      throw Error("P1_NATIVE_AI_WITHOUT_ORIGINAL_NOT_DENIED");
    report.aiProposalIsolation = {
      syntheticMockRows: 2,
      positiveAndNegativeDraftsLeaveGray: true,
      missingOriginalMetDenied: true,
      generatedAi: 0,
    };
    report.afterApi = safety();
  });
  await stage("owned_job_cascade_fresh_browser_baseline", async () => {
    const before = sql(
      `SELECT jsonb_agg(jsonb_build_object('id',s.case_id,'manifest',s.manifest,'frozenAt',s.frozen_at) ORDER BY s.case_id) FROM scp_private.interview_content_snapshots s JOIN public.scp_interview_cases c ON c.id=s.case_id WHERE c.employer_id='${EMPLOYER}'`,
    );
    const file = writePrivate("app-fixture.sql", appFixtureSql(canonicalSql, namespace, true));
    command("psql", ["-v", "ON_ERROR_STOP=1", "-f", file], "app-reset", { env: dbEnv() });
    if (
      sql(
        `SELECT bool_and(job_id IS NULL AND application_id IS NULL) FROM public.scp_interview_cases WHERE employer_id='${EMPLOYER}'`,
      ) !== "t"
    )
      throw Error("P1_NATIVE_FK_NULL_RESET_WITNESS_REQUIRED");
    const after = sql(
      `SELECT jsonb_agg(jsonb_build_object('id',s.case_id,'manifest',s.manifest,'frozenAt',s.frozen_at) ORDER BY s.case_id) FROM scp_private.interview_content_snapshots s JOIN public.scp_interview_cases c ON c.id=s.case_id WHERE c.employer_id='${EMPLOYER}'`,
    );
    if (after !== before) throw Error("P1_NATIVE_CASE_SNAPSHOT_CHANGED_DURING_RESET");
    report.jobCascadeRetainsSnapshots = true;
    report.browserBaseline = await seedHumanReviews();
  });
  await stage("actual_password_browser_five_cases", async () => {
    const appEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CI: "true",
      NODE_ENV: "development",
      SUPABASE_URL: API,
      VITE_SUPABASE_URL: API,
      SUPABASE_PROJECT_ID: PROJECT,
      VITE_SUPABASE_PROJECT_ID: PROJECT,
      SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      VITE_CIG_LIFECYCLE_ENFORCED: "true",
      VITE_EMPLOYER_PORTAL_ENABLED: "true",
      VITE_JOBS_ENABLED: "true",
      PUBLIC_SITE_URL: APP,
    };
    const fd = fs.openSync(writePrivate("app.log", ""), "a");
    appChild = cp.spawn(
      "node",
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        "35810",
        "--strictPort",
        "--mode",
        "ri-p1-native",
      ],
      { cwd: context.appRoot, env: appEnv, stdio: ["ignore", fd, fd] },
    );
    fs.closeSync(fd);
    let ready = false;
    for (let n = 0; n < 90; n++) {
      try {
        if ((await fetch(APP + "/login", { signal: AbortSignal.timeout(2000) })).ok) {
          ready = true;
          break;
        }
      } catch {
        /* bounded readiness only */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) throw Error("P1_NATIVE_APP_NOT_READY");
    const browserRoot = privateFile("browser");
    fs.mkdirSync(browserRoot, { mode: 0o700 });
    const source = fs.readFileSync(
      path.join(context.appRoot, "e2e/recruiter-intelligence-p1.spec.ts"),
      "utf8",
    );
    writePrivate("browser/recruiter-intelligence-p1-native.spec.ts", nativeBrowserSource(source));
    const result = command(
      "bunx",
      ["playwright", "test", "--config", "scripts/recruiter-p1-native-browser.config.ts"],
      "browser",
      {
        timeout: 1_200_000,
        env: {
          ...process.env,
          E2E_LOCAL_STACK: "1",
          E2E_BASE_URL: APP,
          E2E_SUPABASE_URL: API,
          E2E_RI_OWNER_EMAIL: actors.owner.email,
          E2E_RI_PASSWORD: actors.owner.password,
          E2E_RI_NATIVE_ANON_KEY: status.ANON_KEY,
          E2E_RI_EVIDENCE_DIR: privateFile("browser/curated"),
        },
      },
    );
    report.browser = requireBrowserCounts(JSON.parse(result).stats);
    report.serverSignedOriginalUiReads = 4;
    report.finalSafety = safety();
  });
  report.kind = "executed-native-p1-100-v1";
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
  if (started) {
    try {
      command(
        "supabase",
        ["stop", "--workdir", context.stackRoot, "--project-id", PROJECT],
        "cli-stop",
        { cwd: context.stackRoot },
      );
    } catch {
      report.errors.push({ stage: "stop", code: "P1_NATIVE_OWNED_STACK_STOP_FAILED" });
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  report.result = process.exitCode ? "FAILED" : "PASS";
  try {
    writeNativePublic(context, report);
  } catch {
    console.error("P1_NATIVE_PUBLIC_SECRET_REFUSED");
    process.exitCode = 1;
  }
}
