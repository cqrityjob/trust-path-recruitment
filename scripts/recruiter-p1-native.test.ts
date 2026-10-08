import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ACTORS,
  API,
  APP_SHA,
  SCHEMA_SHA,
  CONFIG,
  PDF_BYTES,
  PROJECT,
  appId,
  candidateId,
  cvPath,
  hasCv,
  validateTarget,
  validateStatus,
  readPrivateJson,
  history,
  requireBrowserCounts,
  requireReplacementSource,
  failure,
} from "./recruiter-p1-native-contract.mjs";
import {
  appFixtureSql,
  profileRulesSql,
  createActors,
  nativeApiSource,
  nativeBrowserSource,
  decisions,
} from "./recruiter-p1-native-fixture.mjs";
import { writeNativePublic } from "./recruiter-p1-native-public.mjs";

const root = path.resolve(import.meta.dirname, "..");
// Evidence code may live on a schema-only branch. Its current SQL has 95
// assertions; the canonical 100-data/API/browser contract remains pinned to
// the separately reviewed application. Read immutable blobs, never a mutable
// checkout or fallback fixture. CI checks out that exact application in app/.
const canonicalRoot = fs.existsSync(path.join(root, "app/.git")) ? path.join(root, "app") : root;
const canonical = (file: string) =>
  execFileSync("git", ["show", `${APP_SHA}:${file}`], { cwd: canonicalRoot, encoding: "utf8" });
const sql = canonical("supabase/tests/recruiter_intelligence_p1_test.sql");
const api = canonical("scripts/recruiter-intelligence-p1-api-check.mjs");
const browser = canonical("e2e/recruiter-intelligence-p1.spec.ts");
const ns = "ri-p1-123456abcdef";
const sha = "a".repeat(40);
const valid = {
  GITHUB_ACTIONS: "true",
  CI: "true",
  RUNNER_OS: "Linux",
  RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_WORKSPACE: "/tmp/native-p1-test",
  RI_P1_NATIVE_DISPOSABLE: "1",
  RI_P1_NATIVE_EVIDENCE_SHA: sha,
};
test("public failure diagnostics retain only fixed operation/status/domain/SQLSTATE without SDK secrets", () => {
  const result = {
    status: 409,
    error: {
      code: "PT409",
      message: "RI_SOURCE_STALE",
      details: "private_secret_canary",
      hint: "Bearer private_secret_canary",
      cause: Error("private_secret_canary"),
    },
  };
  assert.deepEqual(failure("rec_ri_save_review", result).safeDiagnostic, {
    operation: "rec_ri_save_review",
    status: 409,
    sqlState: "PT409",
    domain: "RI_SOURCE_STALE",
  });
  const unknown = failure("unknown-private_secret_canary", {
    status: 999,
    error: { code: "private_secret_canary", message: "Bearer private_secret_canary" },
  });
  assert.deepEqual(unknown.safeDiagnostic, { operation: "unknown" });
  assert.equal(unknown.message, "P1_NATIVE_SIGNED_IN_RPC_FAILED");
  assert.doesNotMatch(JSON.stringify(unknown.safeDiagnostic), /canary/);
});
test("target guard accepts only an explicit GitHub-hosted disposable run and the exact app/evidence pins", () => {
  const target = validateTarget(valid, sha, APP_SHA, SCHEMA_SHA);
  assert.equal(target.stackRoot, "/tmp/native-p1-test/p1-native-stack");
  assert.equal(target.schemaRoot, "/tmp/native-p1-test/schema");
  for (const patch of [
    { GITHUB_ACTIONS: "false" },
    { CI: "false" },
    { RUNNER_OS: "macOS" },
    { RUNNER_ENVIRONMENT: "self-hosted" },
    { RI_P1_NATIVE_DISPOSABLE: "0" },
    { GITHUB_WORKSPACE: "relative" },
    { RI_P1_NATIVE_EVIDENCE_SHA: "b".repeat(40) },
    { SUPABASE_ACCESS_TOKEN: "secret_canary" },
    { SUPABASE_SERVICE_ROLE_KEY: "secret_canary" },
    { VITE_SUPABASE_URL: "https://hosted.supabase.co" },
    { OPENAI_API_KEY: "secret_canary" },
    { RESEND_API_KEY: "secret_canary" },
    { AWS_SECRET_ACCESS_KEY: "secret_canary" },
  ])
    assert.throws(
      () => validateTarget({ ...valid, ...patch }, sha, APP_SHA, SCHEMA_SHA),
      /^Error: P1_NATIVE_/,
    );
  assert.throws(() => validateTarget(valid, sha, "b".repeat(40), SCHEMA_SHA), /SHA_MISMATCH/);
  assert.throws(() => validateTarget(valid, sha, APP_SHA, "b".repeat(40)), /SHA_MISMATCH/);
  assert.throws(() => validateTarget(valid, sha, APP_SHA, undefined), /SHA_MISMATCH/);
});
const key = (role: string) =>
  `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fixture-signature`;
test("status guard rejects hosted/noncanonical targets and privileged public key substitutions", () => {
  const status = {
    API_URL: API,
    DB_URL: "postgresql://postgres:localonly@127.0.0.1:55811/postgres",
    ANON_KEY: key("anon"),
    SERVICE_ROLE_KEY: key("service_role"),
  };
  assert.equal(validateStatus(status), status);
  for (const patch of [
    { API_URL: "https://hosted.supabase.co" },
    { API_URL: "http://localhost:55810" },
    { DB_URL: "postgresql://postgres:localonly@hosted.supabase.co:5432/postgres" },
    { DB_URL: "postgresql://postgres:localonly@127.0.0.1:55691/postgres" },
    { DB_URL: "postgresql://postgres:localonly@127.0.0.1:55811/other" },
    { ANON_KEY: key("service_role") },
    { SERVICE_ROLE_KEY: key("anon") },
  ])
    assert.throws(() => validateStatus({ ...status, ...patch }), /^Error: P1_NATIVE_/);
});
test("protected state refuses public permissions and symlink aliases", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-native-contract-"));
  try {
    const file = path.join(dir, "state.json");
    fs.writeFileSync(file, "{}", { mode: 0o600 });
    assert.deepEqual(readPrivateJson(file), {});
    fs.chmodSync(file, 0o644);
    assert.throws(() => readPrivateJson(file), /PRIVATE_FILE/);
    fs.chmodSync(file, 0o600);
    fs.symlinkSync(file, path.join(dir, "alias.json"));
    assert.throws(() => readPrivateJson(path.join(dir, "alias.json")), /PRIVATE_FILE/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("104 exact canonical Auth IDs and 80 separate Storage byte paths are fixed, complete and unique", () => {
  assert.equal(ACTORS.length, 104);
  assert.equal(new Set(ACTORS.map((a: { id: string }) => a.id)).size, 104);
  assert.equal(ACTORS[0].id, "ee100000-0000-4000-8000-000000000001");
  assert.equal(ACTORS.at(-1)?.id, candidateId(100));
  assert.equal(Array.from({ length: 100 }, (_, i) => i + 1).filter(hasCv).length, 80);
  assert.equal(cvPath(100), `${candidateId(100)}/${appId(100)}/synthetic.pdf`);
  assert.equal(PDF_BYTES.length, 512);
  assert.ok(PDF_BYTES.subarray(0, 5).equals(Buffer.from("%PDF-")));
});
test("fixture extracts canonical app inputs while excluding Auth/Storage mutations and fabricated role/claims", () => {
  const generated = appFixtureSql(sql, ns);
  assert.match(generated, /INSERT INTO public\.job_applications/);
  assert.match(
    generated,
    /NOT\(n BETWEEN 56 AND 60 OR n BETWEEN 66 AND 75 OR n BETWEEN 91 AND 95\)/,
  );
  assert.match(generated, /current_database\(\)<>'postgres'/);
  assert.match(generated, /ri_p1_native_test\.marker/);
  assert.doesNotMatch(
    generated,
    /(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE) (?:auth|storage)\./i,
  );
  assert.doesNotMatch(generated, /SET LOCAL ROLE|request\.jwt/);
  assert.ok(
    generated.indexOf("receipt_enabled)") <
      generated.indexOf("INSERT INTO public.job_applications"),
  );
  assert.match(generated, /SELECT job,employer,owner,false/);
  assert.match(generated, /P1_NATIVE_RECEIPTS_MUST_BE_OFF/);
  assert.throws(() => appFixtureSql(sql + "\n", ns), /CANONICAL_SOURCE_CHANGED/);
  assert.throws(() => appFixtureSql(sql, "prod' OR true--"), /NAMESPACE_REQUIRED/);
});
test("reset is guarded to two synthetic jobs and preserves every Auth/Storage/case/report object", () => {
  const generated = appFixtureSql(sql, ns, true);
  assert.match(generated, /P1_NATIVE_RESET_SCOPE_REQUIRED/);
  assert.match(
    generated,
    /DELETE FROM public\.jobs WHERE employer_id='ee100000-1111-4000-8000-000000000001' AND id IN/,
  );
  assert.doesNotMatch(
    generated,
    /DELETE FROM (?:auth\.|storage\.|public\.scp_|public\.employers|public\.employer_memberships)/,
  );
  assert.doesNotMatch(generated, /INSERT INTO public\.employers|INSERT INTO public\.user_roles/);
});
test("rules come from the exact canonical SQL with all six existing criteria and original instructions", () => {
  const generated = profileRulesSql(sql);
  assert.ok(generated.startsWith("SELECT jsonb_agg"));
  assert.doesNotMatch(generated, /CREATE|GRANT|fixture f/);
  assert.match(generated, /'valid_at_start'/);
  assert.match(generated, /'boolean_yes'/);
  assert.match(generated, /Kontrollera R/);
  assert.match(generated, /WHERE r\.job_id='ee100000-2222-4000-8000-000000000001'/);
});
test("official admin contract supplies fixed IDs and autoconfirm without invite/mail/role elevation; this is a stub-only test", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const states: string[] = [];
  const admin = {
    auth: {
      admin: {
        createUser: async (input: Record<string, unknown>) => {
          calls.push(input);
          return {
            data: { user: { id: input.id, email: input.email, email_confirmed_at: "2026-10-08" } },
            error: null,
          };
        },
      },
    },
  };
  const result = await createActors(admin, ns, (state: unknown) =>
    states.push(JSON.stringify(state)),
  );
  assert.equal(Object.keys(result).length, 104);
  assert.equal(calls.length, 104);
  assert.equal(states.length, 208);
  for (const [i, call] of calls.entries()) {
    assert.equal(call.id, ACTORS[i].id);
    assert.equal(call.email_confirm, true);
    assert.deepEqual(Object.keys(call).sort(), [
      "email",
      "email_confirm",
      "id",
      "password",
      "user_metadata",
    ]);
    assert.match(String(call.email), /@synthetic\.invalid$/);
    assert.ok(String(call.password).length > 20);
  }
});
test("unknown Auth creation stops instead of duplicating; intent is persisted before the attempted API call", async () => {
  let calls = 0;
  let last: Record<string, { status: string }> = {};
  const admin = {
    auth: {
      admin: {
        createUser: async () => {
          calls++;
          throw Error("private_secret_canary");
        },
      },
    },
  };
  await assert.rejects(
    createActors(admin, ns, (state: typeof last) => {
      last = structuredClone(state);
    }),
    (e: Error) => e.message === "P1_NATIVE_AUTH_CREATE_UNKNOWN" && !e.message.includes("canary"),
  );
  assert.equal(calls, 1);
  assert.equal(last.owner.status, "unknown_outcome");
});
test("an ignored supplied ID or unconfirmed account refuses before any second actor", async () => {
  for (const wrongId of [true, false]) {
    let calls = 0;
    const admin = {
      auth: {
        admin: {
          createUser: async (input: Record<string, unknown>) => {
            calls++;
            return {
              data: {
                user: {
                  id: wrongId ? "wrong" : input.id,
                  email: input.email,
                  email_confirmed_at: wrongId ? "date" : null,
                },
              },
              error: null,
            };
          },
        },
      },
    };
    await assert.rejects(
      createActors(admin, ns, () => {}),
      /AUTH_CREATE_IDENTITY_REFUSED/,
    );
    assert.equal(calls, 1);
  }
});
test("native API reuses all 23 canonical assertions; only auth transport and second reviewer identity change", () => {
  const adapted = nativeApiSource(api);
  assert.doesNotMatch(adapted, /createHmac|LOCAL_JWT_SECRET|unsigned =/);
  assert.match(adapted, /rpc\("rec_ri_save_review", secondPayload, bob\)/);
  const restoredTail = adapted
    .slice(adapted.indexOf("async function read("))
    .replace(
      'rpc("rec_ri_save_review", secondPayload, bob)',
      'rpc("rec_ri_save_review", secondPayload)',
    )
    .replace(
      'rpc("rec_ri_save_review", winningIndex === 0 ? payload : secondPayload, winningIndex === 0 ? owner : bob)',
      'rpc("rec_ri_save_review", winningIndex === 0 ? payload : secondPayload)',
    )
    .replace(
      "headers: { apikey: connection.anonKey, Authorization: `Bearer ${jwt(owner)}` },",
      "headers: { Authorization: `Bearer ${jwt(owner)}` },",
    )
    .replace('"executed-native-gotrue-postgrest-api"', '"executed-local-postgrest-api"');
  assert.equal(restoredTail, api.slice(api.indexOf("async function read(")));
  assert.throws(() => nativeApiSource(api + "\n"), /CANONICAL_SOURCE_CHANGED/);
});
test("a winning operation is retried by its original real reviewer for either race outcome", async () => {
  const adapted = nativeApiSource(api);
  const line = adapted.split("\n").find((value) => value.startsWith("const retry = await rpc("));
  assert.ok(line);
  const payload = { operation: "owner-operation" };
  const secondPayload = { operation: "bob-operation" };
  for (const winningIndex of [0, 1]) {
    const calls: unknown[][] = [];
    const invoke = new Function(
      "rpc",
      "winningIndex",
      "payload",
      "secondPayload",
      "owner",
      "bob",
      `return (async () => { ${line} return retry; })();`,
    );
    await invoke(
      (...args: unknown[]) => {
        calls.push(args);
      },
      winningIndex,
      payload,
      secondPayload,
      "owner",
      "bob",
    );
    assert.deepEqual(calls, [
      [
        "rec_ri_save_review",
        winningIndex === 0 ? payload : secondPayload,
        winningIndex === 0 ? "owner" : "bob",
      ],
    ]);
  }
});
test("replacement requires an actually available CV with two nonempty and different source versions", () => {
  const source = (version: unknown) => ({
    availableSources: [{ kind: "application_cv", version }],
  });
  requireReplacementSource(source("old"), source("new"));
  for (const invalid of [undefined, null, "", 1]) {
    assert.throws(
      () => requireReplacementSource(source("old"), source(invalid)),
      /SOURCE_REQUIRED/,
    );
    assert.throws(
      () => requireReplacementSource(source(invalid), source("new")),
      /SOURCE_REQUIRED/,
    );
  }
  assert.throws(
    () => requireReplacementSource(source("old"), { availableSources: [] }),
    /SOURCE_REQUIRED/,
  );
  assert.throws(() => requireReplacementSource(source("old"), source("old")), /VERSION_REUSED/);
});
test("native browser retains five original tests and adds real PDF-byte opening in all four locale/viewport journeys", () => {
  const adapted = nativeBrowserSource(browser);
  assert.equal((adapted.match(/\btest\("/g) ?? []).length, 5);
  assert.equal(
    (adapted.match(/browser\.newContext\(\{/g) ?? []).length,
    (browser.match(/browser\.newContext\(\{/g) ?? []).length,
  );
  assert.match(adapted, /E2E_RI_NATIVE_ANON_KEY/);
  assert.match(adapted, /context\.waitForEvent\("response"/);
  assert.match(adapted, /expect\(\(await bytes\.body\(\)\)\.toString\("base64"\)\)\.toBe/);
  for (const assertion of browser.split("\n").filter((line) => line.trim().startsWith("expect(")))
    assert.ok(adapted.includes(assertion));
  assert.throws(() => nativeBrowserSource(browser + "\n"), /CANONICAL_SOURCE_CHANGED/);
});
test("human decisions preserve explicit NO, actual missing sources and checked expiry boundaries", () => {
  const criterion = (position: number) => ({
    position,
    requirementId: `R${position}`,
    questionId: `Q${position}`,
    state: "met",
  });
  const review = {
    criteria: [criterion(1), criterion(2), criterion(3)],
    availableSources: [{ kind: "application_cv", reference: "app", version: "original" }],
  };
  assert.equal(decisions(61, review)[1].state, "not_met");
  assert.equal(decisions(31, review)[1].state, "met");
  assert.equal(decisions(76, review)[1].state, "clarify");
  assert.equal(decisions(81, review)[2].state, "clarify");
  assert.equal(decisions(1, { ...review, availableSources: [] })[1].state, "clarify");
  assert.equal(
    decisions(41, { ...review, criteria: [{ ...criterion(1), state: "not_met" }] })[0].state,
    "not_met",
  );
});
test("history/count contracts fail closed on missing full schema, skipped or flaky browser evidence", () => {
  const files = fs.readdirSync(path.join(root, "supabase/migrations"));
  assert.ok(history(files).length >= 386);
  assert.throws(
    () => history(files.filter((name) => !name.startsWith("20270308090000_"))),
    /COMPLETE_HISTORY/,
  );
  assert.throws(
    () => history([...files, files.find((name) => name.endsWith(".sql"))]),
    /COMPLETE_HISTORY/,
  );
  assert.deepEqual(requireBrowserCounts({ expected: 5, unexpected: 0, flaky: 0, skipped: 0 }), {
    expected: 5,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
  });
  for (const patch of [{ expected: 4 }, { unexpected: 1 }, { flaky: 1 }, { skipped: 1 }])
    assert.throws(
      () => requireBrowserCounts({ expected: 5, unexpected: 0, flaky: 0, skipped: 0, ...patch }),
      /FIVE_BROWSER/,
    );
});
test("provider login remains enabled while signup/mail/runtime workers remain disabled", () => {
  const auth = CONFIG.split("[auth]")[1].split("[auth.email]")[0];
  const email = CONFIG.split("[auth.email]")[1].split("[auth.sms]")[0];
  assert.match(auth, /enable_signup = false/);
  assert.match(email, /enable_signup = true/);
  assert.match(CONFIG, /\[local_smtp\]\nenabled = false/);
  assert.match(CONFIG, /\[edge_runtime\]\nenabled = false/);
  assert.match(CONFIG, new RegExp(`project_id = "${PROJECT}"`));
});
test("runner uses native APIs, strict history, narrow reset witness and sanitized unrun/failure reporting", () => {
  const source = fs.readFileSync(path.join(root, "scripts/recruiter-p1-native-run.mjs"), "utf8");
  assert.doesNotMatch(
    source,
    /00_bootstrap|auth-gateway|ALTER DEFAULT PRIVILEGES|migration.*repair|createHmac/,
  );
  assert.match(source, /ON_ERROR_STOP=1/);
  assert.match(source, /nativeApiSource\(source\)/);
  assert.match(source, /P1_NATIVE_CASE_SNAPSHOT_CHANGED_DURING_RESET/);
  assert.match(source, /"not_run"/);
  assert.match(source, /P1_NATIVE_PUBLIC_SECRET_REFUSED/);
  assert.match(source, /\.remove\(paths\)/);
  assert.match(source, /RI_ACCEPTED_SOURCE_REQUIRED/);
  assert.match(source, /"--project-id", PROJECT/);
  assert.throws(
    () =>
      execFileSync(process.execPath, ["scripts/recruiter-p1-native-run.mjs"], {
        cwd: root,
        env: { PATH: process.env.PATH },
        stdio: "pipe",
      }),
    (e: { stderr: Buffer }) => e.stderr.toString().includes("P1_NATIVE_WORKSPACE_REQUIRED"),
  );
});
test("public artifact is limited to curated PNG hashes and sanitized manifest; failures never become passes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-native-public-"));
  try {
    const context = { stackRoot: path.join(dir, "stack"), publicRoot: path.join(dir, "public") };
    const curated = path.join(context.stackRoot, "supabase/.temp/browser/curated");
    fs.mkdirSync(curated, { recursive: true });
    const png = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.from("synthetic-image"),
    ]);
    fs.writeFileSync(path.join(curated, "sv-desktop-remaining.png"), png);
    fs.writeFileSync(
      path.join(context.stackRoot, "supabase/.temp/private.log"),
      "private_secret_canary",
    );
    const report = writeNativePublic(context, {
      result: "FAILED",
      stages: { native: "failed", browser: "not_run" },
    });
    assert.equal(report.result, "FAILED");
    assert.equal(report.stages.browser, "not_run");
    assert.equal(report.images.length, 1);
    assert.equal(report.images[0].bytes, png.length);
    assert.deepEqual(fs.readdirSync(context.publicRoot).sort(), ["images", "manifest.json"]);
    assert.doesNotMatch(
      fs.readFileSync(path.join(context.publicRoot, "manifest.json"), "utf8"),
      /canary/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("public artifact rejects raw credentials, non-PNG/symlink/uncurated files", () => {
  for (const mutation of ["credential", "non-png", "symlink", "unapproved"] as const) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-native-public-negative-"));
    try {
      const context = { stackRoot: path.join(dir, "stack"), publicRoot: path.join(dir, "public") };
      const curated = path.join(context.stackRoot, "supabase/.temp/browser/curated");
      fs.mkdirSync(curated, { recursive: true });
      if (mutation === "non-png")
        fs.writeFileSync(path.join(curated, "sv-desktop-remaining.png"), "not a PNG");
      if (mutation === "unapproved")
        fs.writeFileSync(path.join(curated, "raw-trace.zip"), "private");
      if (mutation === "symlink") {
        fs.writeFileSync(path.join(dir, "secret"), "private");
        fs.symlinkSync(path.join(dir, "secret"), path.join(curated, "sv-desktop-remaining.png"));
      }
      assert.throws(
        () =>
          writeNativePublic(
            context,
            mutation === "credential"
              ? { password: "private_secret_canary" }
              : { result: "FAILED" },
          ),
        /^Error: P1_NATIVE_/,
      );
      assert.equal(fs.existsSync(context.publicRoot), false);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  }
});
