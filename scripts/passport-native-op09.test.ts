// Stub/source/subprocess guards only. No service, account or external request.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  API,
  APP_SHA,
  SCHEMA_SHA,
  PROJECT,
  CONFIG,
  STAGES,
  validateTarget,
  validateStatus,
  history,
  sdkSummary,
  browserSummary,
  rpcFailure,
} from "./passport-native-op09-contract.mjs";
import { privateOutput } from "./passport-native-op09-command.mjs";
import { cleanupFaultFetch } from "./passport-native-op09-fault-preload.mjs";
import { writePublic } from "./passport-native-op09-public.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = (name: string) => fs.readFileSync(path.join(root, name), "utf8");
const evidence = "a".repeat(40);
const valid = {
  GITHUB_ACTIONS: "true",
  CI: "true",
  RUNNER_OS: "Linux",
  RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_WORKSPACE: "/tmp/op09-isolated-ci",
  RI_OP09_NATIVE_DISPOSABLE: "1",
  RI_OP09_NATIVE_EVIDENCE_SHA: evidence,
};
const key = (role: string) =>
  `eyJ${"a".repeat(9)}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.canary`;
test("native target refuses workstations, hosted/inherited credentials and wrong app/evidence pins", () => {
  assert.equal(
    validateTarget(valid, evidence, APP_SHA).stackRoot,
    "/tmp/op09-isolated-ci/op09-native-stack",
  );
  for (const mutation of [
    { CI: "false" },
    { GITHUB_ACTIONS: "false" },
    { RUNNER_ENVIRONMENT: "self-hosted" },
    { RUNNER_OS: "Darwin" },
    { RI_OP09_NATIVE_DISPOSABLE: "0" },
    { GITHUB_WORKSPACE: "relative" },
    { SUPABASE_SERVICE_ROLE_KEY: "canary" },
    { VITE_SUPABASE_URL: "https://hosted.invalid" },
    { AWS_SECRET_ACCESS_KEY: "canary" },
    { OPENAI_API_KEY: "canary" },
    { RI_OP09_NATIVE_EVIDENCE_SHA: "b".repeat(40) },
  ])
    assert.throws(() => validateTarget({ ...valid, ...mutation }, evidence, APP_SHA));
  assert.throws(() => validateTarget(valid, evidence, SCHEMA_SHA));
  assert.throws(() => validateTarget(valid, evidence, "cce2c8a238522d51396b52697d25bc9d54a8a8bd"));
  assert.throws(() => validateTarget(valid, evidence, "a5dd89ebee2c30f4d2ff18df7117d07e2bb125d2"));
});
test("native service target/key roles and exact387 history fail closed", () => {
  const status = {
    API_URL: API,
    DB_URL: "postgresql://postgres:private@127.0.0.1:55821/postgres",
    ANON_KEY: key("anon"),
    SERVICE_ROLE_KEY: key("service_role"),
  };
  assert.equal(validateStatus(status).API_URL, API);
  for (const patch of [
    { API_URL: "https://hosted.invalid" },
    { DB_URL: "postgresql://postgres:private@hosted.invalid:55821/postgres" },
    { DB_URL: "postgresql://postgres:private@127.0.0.1:55691/postgres" },
    { ANON_KEY: key("service_role") },
    { SERVICE_ROLE_KEY: key("anon") },
  ])
    assert.throws(() => validateStatus({ ...status, ...patch }));
  const files = fs.readdirSync(path.join(root, "supabase/migrations"));
  assert.equal(history(files).length, 387);
  for (const prefix of ["20270307100000", "20270308090000", "20270309090000"])
    assert.throws(() => history(files.filter((f) => !f.startsWith(prefix))));
  assert.throws(() => history([...files, files.find((f) => f.endsWith(".sql"))!]));
});
test("stdout JSON remains separate from real subprocess stderr with private outputs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "op09-output-"));
  try {
    const stdoutFile = path.join(dir, "out"),
      stderrFile = path.join(dir, "err");
    const value = privateOutput(
      process.execPath,
      [
        "-e",
        'process.stdout.write("{\\"ready\\":true}");process.stderr.write("Stopped services: excluded")',
      ],
      { cwd: dir, env: { PATH: process.env.PATH }, stdoutFile, stderrFile },
    );
    assert.deepEqual(JSON.parse(value), { ready: true });
    assert.equal(fs.readFileSync(stderrFile, "utf8"), "Stopped services: excluded");
    for (const f of [stdoutFile, stderrFile]) assert.equal(fs.statSync(f).mode & 0o777, 0o600);
    assert.throws(
      () =>
        privateOutput(
          process.execPath,
          ["-e", 'process.stderr.write("secret_canary");process.exit(3)'],
          { cwd: dir, env: { PATH: process.env.PATH }, stdoutFile, stderrFile },
        ),
      (e: Error & { cause?: unknown }) =>
        e.message === "OP09_NATIVE_PRIVATE_COMMAND_FAILED" &&
        e.cause === undefined &&
        !e.stack?.includes("secret_canary"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("exact own fenced DELETE503 is injected once, survives reload and never affects other paths/origins/methods", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "op09-fault-"));
  try {
    const ownerId = "11111111-1111-4111-8111-111111111111",
      attemptId = "22222222-2222-4222-8222-222222222222",
      file = path.join(dir, "fault.json");
    const arm = () =>
      fs.writeFileSync(file, JSON.stringify({ ownerId, attemptId, armed: true, injected: 0 }), {
        mode: 0o600,
      });
    arm();
    let actualCalls = 0;
    const actual = (async () => {
      actualCalls++;
      return new Response("actual", { status: 200 });
    }) as typeof fetch;
    const fetcher = cleanupFaultFetch({ file }, actual);
    const target = `${API}/storage/v1/object/passport-evidence`,
      payload = {
        method: "DELETE",
        body: JSON.stringify({ prefixes: [`${ownerId}/${attemptId}.pdf`] }),
      };
    for (const [url, init] of [
      ["https://hosted.invalid/storage/v1/object/passport-evidence", payload],
      [target + "/other", payload],
      [target, { ...payload, method: "POST" }],
      [target, { ...payload, body: JSON.stringify({ prefixes: ["other/object.pdf"] }) }],
    ] as const)
      assert.equal((await fetcher(url, init)).status, 200);
    assert.equal((await fetcher("/relative/path", { method: "GET" })).status, 200);
    assert.equal(actualCalls, 5);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).injected, 0);
    assert.equal((await fetcher(target, payload)).status, 503);
    assert.equal(actualCalls, 5);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).armed, false);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).injected, 1);
    assert.equal((await cleanupFaultFetch({ file }, actual)(target, payload)).status, 200);
    assert.equal(actualCalls, 6);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("unknown actor/fault intent and privileged public diagnostic strings do not widen injection or leak", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "op09-invalid-fault-"));
  try {
    const file = path.join(dir, "fault.json");
    fs.writeFileSync(
      file,
      JSON.stringify({ ownerId: "other", attemptId: "bad", armed: true, injected: 0 }),
      { mode: 0o600 },
    );
    let calls = 0;
    const fetcher = cleanupFaultFetch({ file }, (async () => {
      calls++;
      return new Response("actual");
    }) as typeof fetch);
    await assert.rejects(
      fetcher(`${API}/storage/v1/object/passport-evidence`, { method: "DELETE", body: "{}" }),
      /INVALID_FAULT_INTENT/,
    );
    assert.equal(calls, 0);
    const error = rpcFailure("secret_canary", {
      status: 999,
      error: { code: "Bearer secret_canary", message: "secret_canary" },
    });
    assert.deepEqual(error.safeDiagnostic, { operation: "unknown" });
    assert.doesNotMatch(JSON.stringify(error), /secret_canary/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("44 summary keeps two observed outcomes truthful, exact10 local-logout assertions and sequential orders separate", () => {
  const ending = [
    "actual_gotrue_local_session_logout",
    "replayed_jwt_live_session_inactive",
    "revoked_session_direct_reconcile_denied",
    "revoked_session_direct_cleanup_denied",
    "revoked_session_direct_confirm_denied",
    "revoked_session_direct_begin_denied",
    "revoked_session_cannot_claim_empty_attempt_list",
    "revoked_session_never_claims_cleanup_confirmed",
    "revoked_session_never_resumes_attachment",
    "revoked_session_original_bytes_denied",
  ];
  const checks = [
    "registration_wins_fence_preserves_record",
    "actual_late_attach_after_fence_refused",
    "concurrent_registration_won_cleanup_preserved",
    "concurrent_registration_won_cleanup_preserved",
    ...Array(30).fill("begin_own_journal"),
    ...ending,
  ];
  const result = { kind: "actual_gotrue_storage_sdk", completed: 44, checks };
  const summary = sdkSummary(result);
  assert.equal(summary.bothRaceOrdersObserved, false);
  assert.deepEqual(summary.observedRaceOutcomes, ["registration_won", "registration_won"]);
  assert.equal(summary.logoutScope, "local");
  assert.equal(summary.expiredJwtClaim, false);
  const mixed = [...checks];
  mixed[3] = "concurrent_cleanup_won_late_attach_denied";
  assert.equal(sdkSummary({ ...result, checks: mixed }).bothRaceOrdersObserved, true);
  for (const patch of [
    { completed: 43 },
    { kind: "mock" },
    { checks: checks.slice(1) },
    { checks: [...checks.slice(0, -1), "forged_logout"] },
  ])
    assert.throws(() => sdkSummary({ ...result, ...patch }));
});
test("four browser cases cannot pass with failures, skips or retries and never claim a physical phone", () => {
  assert.equal(
    browserSummary({ expected: 4, unexpected: 0, flaky: 0, skipped: 0 }).physicalPhone,
    false,
  );
  for (const patch of [{ expected: 3 }, { unexpected: 1 }, { flaky: 1 }, { skipped: 1 }])
    assert.throws(() =>
      browserSummary({ expected: 4, unexpected: 0, flaky: 0, skipped: 0, ...patch }),
    );
});
test("preparation preserves schema/app pins and native Auth/Storage with no Auth SQL, claims spoofing or runtime edits", () => {
  const runner = source("scripts/passport-native-op09-run.mjs"),
    sdk = source("scripts/passport-native-op09-sdk.mjs"),
    browser = source("e2e/passport-native-op09.spec.ts"),
    workflow = source(".github/workflows/passport-native-op09-ci.yml");
  assert.match(runner, /ON_ERROR_STOP=1/);
  assert.match(runner, /history\(fs.readdirSync\(dir\)\)/);
  assert.doesNotMatch(
    runner,
    /\.replace\(/,
    "SQL template setup must not interpret replacement-string dollar tokens",
  );
  assert.match(runner, /email_confirm: true/);
  assert.match(runner, /state: "intent_create"/);
  assert.match(runner, /unknown_outcome/);
  assert.match(runner, /receipt_enabled\) VALUES[\s\S]*?false/);
  assert.doesNotMatch(
    runner + sdk + browser,
    /INSERT INTO auth\.(users|sessions|identities)|request\.jwt\.claim|SET (?:LOCAL )?ROLE|createHmac|00_bootstrap|auth-gateway|inviteUserByEmail|migration.*repair/,
  );
  assert.match(sdk, /context.appRoot, "scripts\/passport-upload-recovery-operational.ts"/);
  assert.match(workflow, new RegExp(APP_SHA));
  assert.match(source("scripts/passport-native-op09-contract.mjs"), new RegExp(SCHEMA_SHA));
  assert.match(workflow, /passport-native-op09-evidence/);
  assert.doesNotMatch(workflow, /real-public\/|p1-native-public\//);
  assert.match(browser, /page\.reload\(\)/);
  assert.match(browser, /noImplicitResume: true/);
  assert.match(browser, /noImplicitCleanupRetry: true/);
  assert.match(browser, /registeredBytesPreserved: true/);
  assert.doesNotMatch(browser, /page\.route|storageState|addInitScript/);
  assert.match(CONFIG, /\[auth\][\s\S]*?enable_signup = false/);
  assert.match(CONFIG, /\[auth.email\][\s\S]*?enable_signup = true/);
  assert.match(CONFIG, /\[local_smtp\]\nenabled = false/);
  assert.match(CONFIG, /\[edge_runtime\]\nenabled = false/);
  assert.match(CONFIG, new RegExp(PROJECT));
  assert.throws(
    () =>
      execFileSync(process.execPath, ["scripts/passport-native-op09-run.mjs"], {
        cwd: root,
        env: { PATH: process.env.PATH },
        stdio: "pipe",
      }),
    (e: { stderr: Buffer }) => e.stderr.toString().includes("OP09_NATIVE_WORKSPACE_REQUIRED"),
  );
});
test("public artifacts reject unrun PASS, leaked credentials, uncurated files and preserve failed stages", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "op09-public-"));
  try {
    const context = { stackRoot: path.join(dir, "stack"), publicRoot: path.join(dir, "public") };
    const failed = {
      result: "FAILED",
      stages: Object.fromEntries(STAGES.map((s) => [s, "not_run"])),
      errors: [{ stage: "actual_sdk_44", code: "OP09_NATIVE_SDK_FAILED" }],
    };
    writePublic(context, failed);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(context.publicRoot, "manifest.json"), "utf8")).stages
        .actual_sdk_44,
      "not_run",
    );
    assert.throws(() => writePublic(context, { ...failed, result: "PASS" }), /UNRUN_STAGE/);
    assert.throws(
      () => writePublic(context, { ...failed, password: "secret_canary" }),
      /PUBLIC_SECRET/,
    );
    const images = path.join(context.stackRoot, "supabase/.temp/browser/curated");
    fs.mkdirSync(images, { recursive: true });
    fs.writeFileSync(path.join(images, "private.log"), "secret_canary");
    assert.throws(() => writePublic(context, failed), /UNCURATED_FILE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("preload preserves native Request body for disarmed or nonmatching own DELETE", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "op09-request-"));
  try {
    const file = path.join(dir, "fault.json"),
      ownerId = "11111111-1111-4111-8111-111111111111",
      attemptId = "22222222-2222-4222-8222-222222222222";
    const seen: string[] = [];
    const actual = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(await new Request(input, init).text());
      return new Response("actual", { status: 200 });
    }) as typeof fetch;
    for (const armed of [false, true]) {
      fs.writeFileSync(file, JSON.stringify({ ownerId, attemptId, armed, injected: 0 }), {
        mode: 0o600,
      });
      const body = JSON.stringify({ prefixes: ["different/own.pdf"] });
      const request = new Request(API + "/storage/v1/object/passport-evidence", {
        method: "DELETE",
        body,
      });
      assert.equal((await cleanupFaultFetch({ file }, actual)(request)).status, 200);
      assert.equal(seen.at(-1), body);
      assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).injected, 0);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("public12-image success records hashes while symlinks, bad signatures and secrets fail closed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "op09-images-"));
  try {
    const context = { stackRoot: path.join(dir, "stack"), publicRoot: path.join(dir, "public") };
    const images = path.join(context.stackRoot, "supabase/.temp/browser/curated");
    fs.mkdirSync(images, { recursive: true });
    const image = Buffer.from("89504e470d0a1a0a", "hex");
    for (const lang of ["sv", "en"])
      for (const viewport of ["desktop1440", "emulated375"])
        for (const stage of ["resumed", "fenced", "cleaned"])
          fs.writeFileSync(path.join(images, lang + "-" + viewport + "-" + stage + ".png"), image);
    const passed = { result: "PASS", stages: Object.fromEntries(STAGES.map((s) => [s, "passed"])) };
    writePublic(context, passed);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(context.publicRoot, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.images.length, 12);
    assert.ok(
      manifest.images.every(
        (i: { sha256: string; bytes: number }) => /^[a-f0-9]{64}$/.test(i.sha256) && i.bytes === 8,
      ),
    );
    const one = path.join(images, "sv-desktop1440-cleaned.png");
    fs.writeFileSync(one, Buffer.concat([image, Buffer.from('"password":"secret_canary"')]));
    assert.throws(() => writePublic(context, passed), /UNSAFE_IMAGE/);
    fs.writeFileSync(one, "not a PNG");
    assert.throws(() => writePublic(context, passed), /UNSAFE_IMAGE/);
    fs.rmSync(one);
    fs.symlinkSync(path.join(images, "en-desktop1440-cleaned.png"), one);
    assert.throws(() => writePublic(context, passed), /UNCURATED_FILE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function isolatedConsumerLaunchers(source: string) {
  assert.match(
    source,
    /output\(\s*"bun",\s*\["--no-env-file", "scripts\/passport-native-op09-sdk\.mjs"\]/,
    "SDK launcher must disable dotenv before module execution",
  );
  assert.match(
    source,
    /raw = output\(\s*"node",\s*\[\s*"node_modules\/@playwright\/test\/cli\.js",/,
    "browser runner uses installed Node CLI without Bun dotenv autoload",
  );
}
test("real Bun subprocess reproduction: dotenv is refused, explicit no-env-file isolates file loading and inherited keys still fail", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "op09-dotenv-"));
  try {
    fs.writeFileSync(path.join(dir, ".env"), "VITE_SUPABASE_URL=https://hosted-canary.invalid\n", {
      mode: 0o600,
    });
    fs.copyFileSync(
      path.join(root, "scripts/passport-native-op09-contract.mjs"),
      path.join(dir, "contract.mjs"),
    );
    fs.chmodSync(path.join(dir, "contract.mjs"), 0o600);
    fs.writeFileSync(
      path.join(dir, "probe.mjs"),
      `import {validateTarget,APP_SHA} from './contract.mjs';const sha='a'.repeat(40);try{validateTarget({...process.env,GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',RI_OP09_NATIVE_DISPOSABLE:'1',GITHUB_WORKSPACE:'/tmp/nonexecuting-proof',RI_OP09_NATIVE_EVIDENCE_SHA:sha},sha,APP_SHA);console.log('accepted_without_calls')}catch(e){console.log(e.message)}`,
      { mode: 0o600 },
    );
    const run = (flags: string[], env: Record<string, string | undefined> = {}) => {
      const r = spawnSync("bun", [...flags, "probe.mjs"], {
        cwd: dir,
        env: { PATH: process.env.PATH, ...env },
        encoding: "utf8",
        timeout: 10000,
      });
      assert.equal(r.status, 0, "harmless subprocess must complete");
      return r.stdout.trim();
    };
    assert.equal(run([]), "OP09_NATIVE_INHERITED_PROVIDER_CREDENTIAL_REFUSED");
    assert.equal(run(["--no-env-file"]), "accepted_without_calls");
    assert.equal(
      run(["--no-env-file"], { SUPABASE_URL: "https://inherited-canary.invalid" }),
      "OP09_NATIVE_INHERITED_PROVIDER_CREDENTIAL_REFUSED",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("native consumers retain explicit environment isolation and reject removal controls", () => {
  const runner = source("scripts/passport-native-op09-run.mjs");
  isolatedConsumerLaunchers(runner);
  for (const changed of [
    runner.replace('"--no-env-file", ', ""),
    runner.replace('"node_modules/@playwright/test/cli.js",', '"playwright",'),
  ]) {
    assert.notEqual(changed, runner);
    assert.throws(() => isolatedConsumerLaunchers(changed));
  }
});
