import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
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
import {
  WORKSPACE_STAGE,
  WORKSPACE_HTTP_IDS,
  WORKSPACE_HTTP_COUNT,
  WORKSPACE_RPC_COUNT,
  WORKSPACE_SUPPORTING_COUNT,
  requireWorkspaceProof,
} from "./recruiter-p1-native-workspace.mjs";
import { CV_BUCKET, createNativeCvBucket, storageFailure } from "./recruiter-p1-native-storage.mjs";
import { summarizeNativeBrowser } from "./recruiter-p1-native-browser-summary.mjs";
import {
  capturePrivateOutput,
  fixtureFailure,
  confirmedAuthPredicate,
} from "./recruiter-p1-native-command.mjs";

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

function workspaceReport() {
  const status = (id: string) => {
    if (id.startsWith("anon_") || id.startsWith("outsider_") || id === "member_confirm_denied")
      return 403;
    if (id === "concurrent_bob" || /stale|old_profile/.test(id)) return 409;
    if (id === "owner_archive_closed") return 204;
    return id.endsWith("_denied") ? 400 : 200;
  };
  return {
    result: "PASS",
    stages: { [WORKSPACE_STAGE]: "passed" },
    canonicalHttpAssertions: 23,
    browser: { expected: 5, unexpected: 0, flaky: 0, skipped: 0 },
    workspaceAuditCascadeReset: true,
    jobCascadeRetainsSnapshots: true,
    workspaceHttp: {
      kind: "executed-native-workspace-six-rpc-http",
      httpRequests: 70,
      workspaceRpcRequests: 60,
      supportingRpcRequests: 10,
      checks: WORKSPACE_HTTP_IDS.map((id: string) => ({ id, passed: true, status: status(id) })),
      concurrentStatuses: [200, 409],
      oldReviewsAndSnapshotsUnchanged: true,
      priorProfilePreserved: true,
      queueBefore: { remaining: 100, historicalExcluded: 0 },
      queueAfterProfile: { remaining: 100, historicalExcluded: 0 },
      queueAfterExclusions: { remaining: 97, historicalExcluded: 3 },
      impactAfterExclusions: { received: 100, active: 97, archived: 1, withdrawn: 1, decided: 2 },
      existingCandidateSession: true,
    },
  };
}
test("new workspace HTTP proof requires all70 fixed calls (60 new RPC and10 support), exact denials and both real reviewer outcomes; original23/5 and reset stay required", () => {
  assert.equal(WORKSPACE_HTTP_COUNT, 70);
  assert.equal(WORKSPACE_HTTP_IDS.length, 70);
  assert.equal(new Set(WORKSPACE_HTTP_IDS).size, 70);
  assert.equal(WORKSPACE_RPC_COUNT, 60);
  assert.equal(WORKSPACE_SUPPORTING_COUNT, 10);
  const baseline = workspaceReport();
  assert.doesNotThrow(() => requireWorkspaceProof(baseline));
  for (const mutate of [
    (r: typeof baseline) => {
      r.stages[WORKSPACE_STAGE] = "not_run";
    },
    (r: typeof baseline) => {
      r.stages[WORKSPACE_STAGE] = "skipped";
    },
    (r: typeof baseline) => {
      r.workspaceHttp.kind = "prepared-native-workspace-six-rpc-http";
    },
    (r: typeof baseline) => {
      r.workspaceHttp.httpRequests = 69;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.workspaceRpcRequests = 59;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.supportingRpcRequests = 9;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.checks.pop();
    },
    (r: typeof baseline) => {
      r.workspaceHttp.checks[0].id = r.workspaceHttp.checks[1].id;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.checks[0].passed = false;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.checks.find((c) => c.id === "member_confirm_denied")!.status = 200;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.concurrentStatuses = [200, 200];
    },
    (r: typeof baseline) => {
      r.workspaceHttp.checks.find((c) => c.id === "concurrent_bob")!.status = 200;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.oldReviewsAndSnapshotsUnchanged = false;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.priorProfilePreserved = false;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.queueAfterExclusions.remaining = 100;
    },
    (r: typeof baseline) => {
      r.workspaceHttp.impactAfterExclusions.decided = 1;
    },
    (r: typeof baseline) => {
      r.workspaceAuditCascadeReset = false;
    },
    (r: typeof baseline) => {
      r.jobCascadeRetainsSnapshots = false;
    },
    (r: typeof baseline) => {
      r.canonicalHttpAssertions = 22;
    },
    (r: typeof baseline) => {
      r.browser.expected = 4;
    },
    (r: typeof baseline) => {
      r.browser.skipped = 1;
    },
  ]) {
    const changed = structuredClone(baseline);
    mutate(changed);
    assert.throws(
      () => requireWorkspaceProof(changed),
      /^Error: P1_NATIVE_WORKSPACE_EXECUTED_PROOF_REQUIRED$/,
    );
  }
  assert.throws(
    () => requireWorkspaceProof({ ...baseline, workspaceHttp: undefined }),
    /EXECUTED_PROOF_REQUIRED/,
  );
});
function requireWorkspaceWiring(source: string) {
  const start = source.indexOf('await stage("historical_synthetic_ai_never_green"');
  const actual = source.indexOf("await stage(WORKSPACE_STAGE");
  const reset = source.indexOf('await stage("owned_job_cascade_fresh_browser_baseline"');
  if (
    !(start > 0 && actual > start && reset > actual) ||
    !source.includes("      WORKSPACE_STAGE,") ||
    !/^ {2}await stage\(WORKSPACE_STAGE,/m.test(source) ||
    !source.includes("report.workspaceHttp = await runWorkspaceHttp({") ||
    !source.includes('await login("candidate-95")') ||
    !source.includes("report.workspaceAuditCascadeReset = true") ||
    !source.includes("P1_NATIVE_WORKSPACE_AUDIT_CASCADE_RESET_REQUIRED")
  )
    throw Error("WORKSPACE_NATIVE_STAGE_REQUIRED");
  const stage = source.slice(actual, reset);
  assert.doesNotMatch(stage, /INSERT INTO|UPDATE public|DELETE FROM|request\.jwt|SET LOCAL ROLE/);
  for (const table of [
    "rec_requirement_profiles",
    "rec_requirement_review_heads",
    "rec_requirement_decisions",
    "rec_requirement_review_events",
    "interview_content_snapshots",
  ])
    if (!stage.includes(table)) throw Error("WORKSPACE_NATIVE_IMMUTABILITY_WITNESS_REQUIRED");
}
test("workspace stage is additive after AI isolation before the original owned reset; remove, skip, mocked result and incomplete old-source witness are refused", () => {
  const source = fs.readFileSync(path.join(root, "scripts/recruiter-p1-native-run.mjs"), "utf8");
  requireWorkspaceWiring(source);
  for (const changed of [
    source.replace("      WORKSPACE_STAGE,", ""),
    source.replace("  await stage(WORKSPACE_STAGE,", "  if (false) await stage(WORKSPACE_STAGE,"),
    source.replace(
      "report.workspaceHttp = await runWorkspaceHttp({",
      "report.workspaceHttp = await fakePreparedResult({",
    ),
    source.replace(
      "report.workspaceAuditCascadeReset = true",
      "report.workspaceAuditCascadeReset = false",
    ),
    source.replace(
      "FROM scp_private.interview_content_snapshots s JOIN",
      "FROM scp_private.unrelated_snapshot_table s JOIN",
    ),
  ]) {
    assert.notEqual(changed, source);
    assert.throws(() => requireWorkspaceWiring(changed));
  }
  const helper = fs.readFileSync(
    path.join(root, "scripts/recruiter-p1-native-workspace.mjs"),
    "utf8",
  );
  for (const fn of [
    "rec_ri_profile_change_impact",
    "rec_ri_profile_change_history",
    "rec_ri_compare_applications",
    "rec_ri_page_evidence",
    "rec_ri_next_unreviewed",
    "rec_ri_confirm_reviewed_profile",
  ])
    assert.ok(helper.includes(fn));
  assert.match(helper, /same_actor_operation_retry/);
  assert.match(helper, /writes\[winningIndex\]/);
  const pageBinding = (text: string) => {
    assert.match(text, /owned_empty_profile_read/);
    assert.match(text, /owned_empty_profile_confirm/);
    assert.match(
      text,
      /combined_cross_job_binding: \{ _job_id: emptyJob, _profile_id: emptyProfile\.profileId \}/,
    );
    assert.match(text, /error\("23514", 400\)/);
    assert.doesNotMatch(text, /kind === "combined_cross_job_binding" \? "PT409"/);
  };
  pageBinding(helper);
  const wrongPageProfile = helper.replace(
    "combined_cross_job_binding: { _job_id: emptyJob, _profile_id: emptyProfile.profileId }",
    "combined_cross_job_binding: { _job_id: emptyJob, _profile_id: profile.profileId }",
  );
  assert.notEqual(wrongPageProfile, helper);
  assert.throws(() => pageBinding(wrongPageProfile));
  const noPrivilegedAdapter = (text: string) =>
    assert.doesNotMatch(
      text.replace(/\bArray\.from\(/g, "arrayFactory("),
      /createClient|admin\.|auth\.admin|request\.jwt|console\.|\.from\(|fetch\(/,
    );
  noPrivilegedAdapter(helper);
  for (const forbidden of [
    "client.from('private')",
    "admin.rpc('write')",
    "fetch('https://hosted.invalid')",
    "request.jwt.claim.sub",
  ])
    assert.throws(() => noPrivilegedAdapter(helper + forbidden));
});
test("workspace public proof fails closed on original payloads and false PASS, while truthful pre-stage failure remains publishable", () => {
  const baseline = workspaceReport();
  for (const report of [
    {
      ...baseline,
      workspaceHttp: { ...baseline.workspaceHttp, privateOriginal: "private_secret_canary" },
    },
    {
      ...baseline,
      workspaceHttp: {
        ...baseline.workspaceHttp,
        checks: baseline.workspaceHttp.checks.map((c, i) =>
          i === 0 ? { ...c, rawError: "private_secret_canary" } : c,
        ),
      },
    },
    { ...baseline, stages: { [WORKSPACE_STAGE]: "failed" } },
  ])
    assert.throws(() => requireWorkspaceProof(report), /EXECUTED_PROOF_REQUIRED/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-workspace-public-"));
  try {
    const context = { stackRoot: path.join(dir, "stack"), publicRoot: path.join(dir, "public") };
    assert.throws(() => writeNativePublic(context, { result: "PASS" }), /EXECUTED_PROOF_REQUIRED/);
    assert.equal(fs.existsSync(context.publicRoot), false);
    assert.equal(
      writeNativePublic(context, { result: "FAILED", stages: { [WORKSPACE_STAGE]: "not_run" } })
        .result,
      "FAILED",
    );
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/recruiter-p1-native-ci.yml"),
    "utf8",
  );
  assert.match(workflow, /requireWorkspaceProof\(m\)/);
});
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
test("machine-readable CLI status keeps real subprocess JSON stdout separate from warning stderr and private", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-native-status-"));
  try {
    const stdoutFile = path.join(dir, "stdout.log");
    const stderrFile = path.join(dir, "stderr.log");
    const output = capturePrivateOutput(
      process.execPath,
      [
        "-e",
        'process.stderr.write("Stopped services: [excluded]\\n");process.stdout.write(JSON.stringify({status:"ready"}))',
      ],
      { cwd: dir, env: { PATH: process.env.PATH }, stdoutFile, stderrFile },
    );
    assert.deepEqual(JSON.parse(output), { status: "ready" });
    assert.equal(fs.readFileSync(stdoutFile, "utf8"), '{"status":"ready"}');
    assert.equal(fs.readFileSync(stderrFile, "utf8"), "Stopped services: [excluded]\n");
    assert.equal(fs.statSync(stdoutFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(stderrFile).mode & 0o777, 0o600);
    assert.throws(() => JSON.parse(fs.readFileSync(stderrFile, "utf8") + output));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("private status subprocess failure and overflow expose only a fixed code, never secret output or native cause", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-native-status-failure-"));
  try {
    for (const [index, body] of [
      'process.stdout.write("private_stdout_canary");process.stderr.write("private_stderr_canary");process.exit(7)',
      'process.stdout.write("private_stdout_canary".repeat(110000))',
      'process.stderr.write("private_stderr_canary".repeat(110000))',
    ].entries()) {
      const stdoutFile = path.join(dir, `${index}.stdout.log`);
      const stderrFile = path.join(dir, `${index}.stderr.log`);
      assert.throws(
        () =>
          capturePrivateOutput(process.execPath, ["-e", body], {
            cwd: dir,
            env: { PATH: process.env.PATH },
            stdoutFile,
            stderrFile,
          }),
        (error: Error & { cause?: unknown; stdout?: unknown; stderr?: unknown }) => {
          assert.equal(error.message, "P1_NATIVE_PRIVATE_STATUS_COMMAND_FAILED");
          assert.equal(error.cause, undefined);
          assert.equal(error.stdout, undefined);
          assert.equal(error.stderr, undefined);
          assert.doesNotMatch(error.stack ?? "", /private_(?:stdout|stderr)_canary/);
          return true;
        },
      );
      for (const file of [stdoutFile, stderrFile]) {
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
        assert.ok(fs.statSync(file).size <= 2_000_000);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("runner applies stdout separation only to native CLI status; fixed target and private capture bounds remain", () => {
  const source = fs.readFileSync(path.join(root, "scripts/recruiter-p1-native-run.mjs"), "utf8");
  assert.equal((source.match(/capturePrivateOutput\(/g) ?? []).length, 1);
  assert.match(
    source,
    /const raw = capturePrivateOutput\([\s\S]*?"supabase",[\s\S]*?\["status", "--workdir", context\.stackRoot, "-o", "json"\]/,
  );
  assert.match(source, /stdoutFile: privateFile\("cli-status\.stdout\.log"\)/);
  assert.match(source, /stderrFile: privateFile\("cli-status\.stderr\.log"\)/);
  assert.match(
    source,
    /status = validateStatus\(readPrivateJson\(privateFile\("status\.json"\)\)\)/,
  );
  const helper = fs.readFileSync(
    path.join(root, "scripts/recruiter-p1-native-command.mjs"),
    "utf8",
  );
  assert.match(helper, /timeout: 60_000/);
  assert.match(helper, /maxBuffer: MAX_OUTPUT_BYTES/);
  assert.match(helper, /stdio: \["ignore", "pipe", "pipe"\]/);
  assert.doesNotMatch(helper, /console\.|throw result\.error|cause:/);
});
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
  assert.throws(
    () => validateTarget(valid, sha, "40e5775de5195050571421827434ec2872a61506", SCHEMA_SHA),
    /SHA_MISMATCH/,
  );
  assert.throws(
    () => validateTarget(valid, sha, APP_SHA, "1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9"),
    /SHA_MISMATCH/,
  );
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
  assert.equal(APP_SHA, "55db1e3b83ace033450899a93ca0961edde05217");
  assert.equal(SCHEMA_SHA, "05520f2995f24ba697be41ecf8364b71a6ef1491");
  assert.equal(history(files).length, 391);
  assert.throws(
    () =>
      history(
        files.filter((name) => !/^202703(?:10090000|10100000|11100000|12100000)_/.test(name)),
      ),
    /COMPLETE_HISTORY/,
  );
  for (const prefix of [
    "20270308090000_",
    "20270309090000_",
    "20270310090000_",
    "20270310100000_",
    "20270311100000_",
    "20270312100000_",
  ]) {
    const omitted = files.filter((name) => !name.startsWith(prefix));
    assert.throws(() => history(omitted), /COMPLETE_HISTORY/);
    assert.throws(() => history([...omitted, "20270313100000_other.sql"]), /COMPLETE_HISTORY/);
  }
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
test("workflow checkouts bind the exact391 schema and fresh reviewed app without floating refs", () => {
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/recruiter-p1-native-ci.yml"),
    "utf8",
  );
  assert.match(workflow, new RegExp(`ref: ${APP_SHA}\\n\\s+path: app\\n`));
  assert.match(workflow, new RegExp(`ref: ${SCHEMA_SHA}\\n\\s+path: schema\\n`));
  assert.match(workflow, /fetch-depth: 0/);
  assert.doesNotMatch(workflow, /ref: (?:main|latest)|continue-on-error:/);
  assert.match(workflow, /run: node scripts\/recruiter-p1-native-run\.mjs/);
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

test("native fixture publication uses the existing trigger timestamp with no impersonation and retains other inputs", () => {
  for (const reset of [false, true]) {
    const generated = appFixtureSql(sql, ns, reset);
    assert.match(
      generated,
      /UPDATE public\.jobs SET status='published',expires_at=now\(\)\+interval '30 days'/,
    );
    assert.doesNotMatch(generated, /published_at=|request\.jwt|SET LOCAL ROLE|DISABLE TRIGGER/);
    assert.match(generated, /timestamptz '2026-10-01 00:00:00Z'\+n\*interval '1 minute'/);
    assert.match(generated, /INSERT INTO public\.job_application_answers/);
  }
  const trigger = fs.readFileSync(
    path.join(root, "supabase/migrations/20270131090000_jobs_publish_window_and_url_scheme.sql"),
    "utf8",
  );
  assert.match(trigger, /NEW\.published_at IS NOT DISTINCT FROM OLD\.published_at/);
  assert.match(trigger, /NEW\.published_at := now\(\)/);
  assert.match(trigger, /published_at is a moderation-owned field/);
});
test("fixture SQL failure diagnostics never expose arbitrary messages, details, paths or secrets", () => {
  const e = fixtureFailure(
    "private_secret_canary ERROR: 23514: published_at is a moderation-owned field\nDETAIL: private_secret_canary",
  );
  assert.equal(e.message, "P1_NATIVE_APP_FIXTURE_FAILED");
  assert.deepEqual(e.safeDiagnostic, {
    operation: "application_fixture",
    sqlState: "23514",
    domain: "JOB_PUBLICATION_TIMESTAMP_PROTECTED",
  });
  assert.doesNotMatch(JSON.stringify(e.safeDiagnostic), /private_secret_canary/);
  assert.deepEqual(
    fixtureFailure("ERROR: private_secret_canary: Bearer private_secret_canary").safeDiagnostic,
    { operation: "application_fixture" },
  );
});
test("native bcrypt prefix guard has no SQL regex escaping ambiguity and retains namespace and confirmation", () => {
  assert.equal(
    confirmedAuthPredicate(ns),
    `email LIKE '${ns}-%@synthetic.invalid' AND email_confirmed_at IS NOT NULL AND left(encrypted_password,4) IN ('$2a$','$2b$','$2y$')`,
  );
  assert.throws(() => confirmedAuthPredicate("prod' OR true--"), /NAMESPACE_REQUIRED/);
  assert.doesNotMatch(confirmedAuthPredicate(ns), /\\| ~ /);
});

test("actual generated initial and reset SQL retain every literal dollar-quoted receipt guard", () => {
  for (const reset of [false, true]) {
    const generated = appFixtureSql(sql, ns, reset);
    assert.match(generated, /DO \$\$ BEGIN IF EXISTS\(SELECT 1 FROM public\.recruitment_settings/);
    assert.match(
      generated,
      /THEN RAISE EXCEPTION 'P1_NATIVE_RECEIPTS_MUST_BE_OFF'; END IF; END \$\$;/,
    );
    assert.equal((generated.match(/DO \$\$ BEGIN/g) ?? []).length, reset ? 3 : 2);
    assert.equal((generated.match(/END \$\$;/g) ?? []).length, reset ? 4 : 3);
    assert.doesNotMatch(generated, /DO \$ BEGIN|END \$;/);
    assert.ok(
      generated.indexOf("P1_NATIVE_RECEIPTS_MUST_BE_OFF") <
        generated.indexOf("INSERT INTO public.job_applications("),
    );
  }
});

test("current canonical setup retains the exact Unicode hash assertion and helper in both sessions", () => {
  const from = sql.indexOf("CREATE FUNCTION pg_temp.ok(");
  const exact = sql.slice(from, sql.indexOf("CREATE FUNCTION pg_temp.fails("));
  const unicode = sql.split("\n").find((line: string) => line.includes("UTF8 source SHA256"));
  assert.ok(unicode);
  for (const reset of [false, true]) {
    const generated = appFixtureSql(sql, ns, reset);
    assert.equal(generated.split(exact).length, 2);
    assert.equal((generated.match(/CREATE FUNCTION pg_temp\.ok\(/g) ?? []).length, 1);
    assert.equal(generated.split(unicode!).length, 2);
    assert.ok(generated.indexOf(exact) < generated.indexOf(unicode!));
    assert.doesNotMatch(
      generated,
      /ALTER EXTENSION|ri_p1_crypto_probe|CREATE FUNCTION pg_temp\.fails/,
    );
  }
  assert.notEqual(APP_SHA, "ac25b3befbfb87ed5eb682679a929708d6dfbebf");
});

test("native CV bucket is created once through SDK and read back with canonical private configuration", async () => {
  const calls: unknown[] = [];
  const admin = {
    storage: {
      createBucket: async (id: string, config: unknown) => {
        calls.push(["create", id, config]);
        return { data: { name: CV_BUCKET }, error: null };
      },
      getBucket: async (id: string) => {
        calls.push(["read", id]);
        return {
          data: { id, name: id, public: false, file_size_limit: null, allowed_mime_types: null },
          error: null,
        };
      },
    },
  };
  assert.deepEqual(await createNativeCvBucket(admin, 0), {
    id: CV_BUCKET,
    public: false,
    fileSizeLimit: null,
    allowedMimeTypes: null,
  });
  assert.deepEqual(calls, [
    ["create", CV_BUCKET, { public: false }],
    ["read", CV_BUCKET],
  ]);
  await assert.rejects(createNativeCvBucket(admin, 1), /FRESH_CV_BUCKET_REQUIRED/);
  assert.equal(calls.length, 2);
});

test("unknown bucket creation or wrong readback stops without retries and discloses no SDK secrets", async () => {
  for (const mode of [
    "throw",
    "error",
    "unknown",
    "public",
    "limit",
    "mime",
    "wrong-id",
    "read-throw",
  ]) {
    let creates = 0;
    let reads = 0;
    const admin = {
      storage: {
        createBucket: async () => {
          creates++;
          if (mode === "throw") throw Error("private_secret_canary");
          if (mode === "error")
            return { error: { statusCode: "404", message: "private_secret_canary" } };
          if (mode === "unknown") return undefined;
          return { data: { name: CV_BUCKET }, error: null };
        },
        getBucket: async () => {
          reads++;
          if (mode === "read-throw") throw Error("private_secret_canary");
          return {
            data: {
              id: mode === "wrong-id" ? "private_secret_canary" : CV_BUCKET,
              name: CV_BUCKET,
              public: mode === "public",
              file_size_limit: mode === "limit" ? 8192 : null,
              allowed_mime_types: mode === "mime" ? ["application/pdf"] : null,
            },
            error: null,
          };
        },
      },
    };
    await assert.rejects(
      createNativeCvBucket(admin, 0),
      (error: Error & { safeDiagnostic: unknown }) => {
        assert.equal(error.message, "P1_NATIVE_STORAGE_SETUP_FAILED");
        assert.doesNotMatch(error.stack ?? "", /private_secret_canary/);
        assert.doesNotMatch(JSON.stringify(error.safeDiagnostic), /private_secret_canary/);
        return true;
      },
    );
    assert.equal(creates, 1);
    assert.equal(reads, ["throw", "error", "unknown"].includes(mode) ? 0 : 1);
  }
  assert.deepEqual(
    storageFailure("storage_upload", {
      error: { statusCode: "403", message: "private_secret_canary" },
    }).safeDiagnostic,
    { operation: "storage_upload", status: 403 },
  );
  assert.deepEqual(
    storageFailure("private_secret_canary", { error: { statusCode: "private_secret_canary" } })
      .safeDiagnostic,
    { operation: "unknown" },
  );
});

test("SQL phase diagnostics accept fixed markers and syntax state while refusing arbitrary raw contents", () => {
  assert.deepEqual(
    fixtureFailure(
      "RI_P1_FIXTURE_PHASE APPLICATIONS\nERROR: 42601: private_secret_canary\nDETAIL: private_secret_canary",
    ).safeDiagnostic,
    { operation: "application_fixture", sqlState: "42601", phase: "APPLICATIONS" },
  );
  assert.deepEqual(
    fixtureFailure("RI_P1_FIXTURE_PHASE private_secret_canary\nERROR: private_secret_canary")
      .safeDiagnostic,
    { operation: "application_fixture" },
  );
  const generated = appFixtureSql(sql, ns);
  assert.equal((generated.match(/^\\echo RI_P1_FIXTURE_PHASE /gm) ?? []).length, 11);
});

test("actual harmless Playwright JSON preserves a failing case and source line while redacting all private error data", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-browser-report-"));
  try {
    const titles = [...browser.matchAll(/test\("([^"]+)"/g)].map((match) => match[1]);
    assert.equal(titles.length, 5);
    const source =
      `import {test,expect} from ${JSON.stringify(path.join(root, "node_modules/@playwright/test/index.mjs"))};\n` +
      titles
        .map(
          (title, i) =>
            `test(${JSON.stringify(title)},()=>{expect(${i === 2 ? 1 : 0},"private_secret_canary").toBe(0)});`,
        )
        .join("\n");
    const spec = path.join(dir, "recruiter-intelligence-p1-native.spec.ts");
    const file = path.join(dir, "report.json");
    fs.writeFileSync(spec, source, { mode: 0o600 });
    fs.writeFileSync(file, "", { mode: 0o600 });
    const config = path.join(dir, "playwright.config.mjs");
    fs.writeFileSync(
      config,
      `export default {testDir:${JSON.stringify(dir)},testMatch:"recruiter-intelligence-p1-native.spec.ts",workers:1,retries:0,reporter:[["json",{outputFile:${JSON.stringify(file)}}]],outputDir:${JSON.stringify(path.join(dir, "results"))}}`,
      { mode: 0o600 },
    );
    const result = spawnSync(
      "node",
      [path.join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", config],
      {
        cwd: dir,
        env: { PATH: process.env.PATH },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 1, "one intentional assertion must fail");
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.match(JSON.stringify(raw), /private_secret_canary/);
    const summary = summarizeNativeBrowser(raw);
    assert.deepEqual(summary.stats, { expected: 4, unexpected: 1, flaky: 0, skipped: 0 });
    assert.deepEqual(
      summary.cases.find((item: { case: string }) => item.case === "explicit_peace_handoff"),
      {
        case: "explicit_peace_handoff",
        status: "unexpected",
        attempts: 1,
        sourceLines: [4],
      },
    );
    assert.doesNotMatch(
      JSON.stringify(summary),
      /private_secret_canary|\.spec\.ts|Bearer|file:|\/tmp/,
    );
    assert.throws(() => requireBrowserCounts(summary.stats), /FIVE_BROWSER_CASES_REQUIRED/);
    const wrong = structuredClone(raw);
    wrong.stats.unexpected = 0;
    assert.throws(() => summarizeNativeBrowser(wrong), /COUNTS_MISMATCH/);
    const unknown = structuredClone(raw);
    const replaceTitle = (suites: typeof raw.suites) => {
      for (const suite of suites) {
        if (suite.specs.length) {
          suite.specs[0].title = "private_secret_canary";
          return true;
        }
        if (replaceTitle(suite.suites)) return true;
      }
      return false;
    };
    replaceTitle(unknown.suites);
    assert.throws(() => summarizeNativeBrowser(unknown), /IDENTITY_REQUIRED/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
