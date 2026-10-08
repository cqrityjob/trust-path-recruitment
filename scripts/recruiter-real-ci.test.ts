import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  APP_SHA,
  CONFIG,
  EXCLUDED,
  childEnvironment,
  validateTarget,
  readPrivateStatus,
  requireCompleteHistory,
  requireBrowserCounts,
} from "./recruiter-real-ci-contract.mjs";
import { validatePublicReport, writePublicReport } from "./recruiter-real-ci-public.mjs";

const env = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  RUNNER_OS: "Linux",
  RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_WORKSPACE: "/tmp/recruiter-real-ci-fixture",
  RI_OPS_STACK_ROOT: "/tmp/recruiter-real-ci-fixture/real-stack",
  RI_REAL_SCHEMA_SHA: "a".repeat(40),
};
const read = (name: string) => fs.readFileSync(name, "utf8");

describe("official real Supabase CI target", () => {
  test("allows only exact GitHub-hosted Linux workspace, schema SHA and reviewed app52", () => {
    expect(validateTarget(env, env.RI_REAL_SCHEMA_SHA, APP_SHA).stackRoot).toBe(
      env.RI_OPS_STACK_ROOT,
    );
    for (const patch of [
      { CI: "false" },
      { GITHUB_ACTIONS: "false" },
      { RUNNER_OS: "macOS" },
      { RUNNER_ENVIRONMENT: "self-hosted" },
      { RI_OPS_STACK_ROOT: "/tmp/another-stack" },
      { SUPABASE_ACCESS_TOKEN: "refused-dummy" },
    ])
      expect(() => validateTarget({ ...env, ...patch }, env.RI_REAL_SCHEMA_SHA, APP_SHA)).toThrow();
    expect(() => validateTarget(env, "b".repeat(40), APP_SHA)).toThrow("SCHEMA_SHA_MISMATCH");
    expect(() =>
      validateTarget(env, env.RI_REAL_SCHEMA_SHA, "ea43ad734e80347d56957794f56cd483595fce4a"),
    ).toThrow("UNREVIEWED_APP_HEAD");
  });
  test("new stack config keeps exact owned ports, PG17 and side-effect services disabled", () => {
    expect(CONFIG).toContain('project_id = "cqj-ri-real-20261008b"');
    expect(CONFIG).toContain("port = 55690");
    expect(CONFIG).toContain("port = 55691");
    expect(CONFIG).toContain("major_version = 17");
    for (const block of [
      "db.migrations",
      "db.seed",
      "local_smtp",
      "edge_runtime",
      "analytics",
      "studio",
    ])
      expect(CONFIG).toContain(`[${block}]\nenabled = false`);
    for (const service of ["mailpit", "edge-runtime", "logflare", "vector", "studio"])
      expect(EXCLUDED.split(",")).toContain(service);
    for (const service of ["gotrue", "postgrest", "storage-api", "kong"])
      expect(EXCLUDED.split(",")).not.toContain(service);
  });
  test("app child receives local Supabase overrides and no inherited AI/mail/hosted credentials", () => {
    const child = childEnvironment(
      { ANON_KEY: "dummy-local-anon", SERVICE_ROLE_KEY: "dummy-local-server" },
      {
        ...process.env,
        OPENAI_API_KEY: "refused-ai-dummy",
        RESEND_API_KEY: "refused-mail-dummy",
        SUPABASE_ACCESS_TOKEN: "refused-hosted-dummy",
      },
    );
    expect(child.SUPABASE_URL).toBe("http://127.0.0.1:55690");
    expect(child.VITE_SUPABASE_URL).toBe(child.SUPABASE_URL);
    expect(child.SUPABASE_SERVICE_ROLE_KEY).toBe("dummy-local-server");
    expect(child).not.toHaveProperty("OPENAI_API_KEY");
    expect(child).not.toHaveProperty("RESEND_API_KEY");
    expect(child).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
  });
  test("status must be private and bound to actual local postgres, never a hosted URL", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "real-ci-status-test-"));
    const context = { stackRoot: root };
    fs.mkdirSync(path.join(root, "supabase/.temp"), { recursive: true });
    fs.writeFileSync(path.join(root, "supabase/config.toml"), CONFIG);
    const file = path.join(root, "supabase/.temp/ri-local-status.json");
    const status = {
      API_URL: "http://127.0.0.1:55690",
      DB_URL: "postgresql://postgres:dummy@127.0.0.1:55691/postgres",
    };
    fs.writeFileSync(file, JSON.stringify(status), { mode: 0o600 });
    expect(readPrivateStatus(context).API_URL).toBe(status.API_URL);
    fs.chmodSync(file, 0o644);
    expect(() => readPrivateStatus(context)).toThrow("PRIVATE_STATUS_REQUIRED");
    fs.chmodSync(file, 0o600);
    fs.writeFileSync(file, JSON.stringify({ ...status, API_URL: "https://refused.invalid" }));
    expect(() => readPrivateStatus(context)).toThrow("SERVICE_TARGET_MISMATCH");
  });
});

describe("real CI execution and publication cannot silently narrow", () => {
  const workflow = Bun.YAML.parse(read(".github/workflows/recruiter-real-ci.yml"));
  const job = workflow.jobs.recruiter_real;
  test("workflow uses pinned CLI/Bun/Node and app52, full runner, guarded exact artifact paths", () => {
    expect(job["runs-on"]).toBe("ubuntu-latest");
    expect(job.if).toBeUndefined();
    expect(job["continue-on-error"]).toBeUndefined();
    expect(job.steps.every((step: { [key: string]: unknown }) => !step["continue-on-error"])).toBe(
      true,
    );
    const setups = job.steps.filter((step: { uses?: string }) => step.uses);
    expect(
      setups.find((step: { uses: string }) => step.uses === "supabase/setup-cli@v3").with.version,
    ).toBe("2.111.0");
    expect(
      setups.find((step: { uses: string }) => step.uses === "oven-sh/setup-bun@v2").with[
        "bun-version"
      ],
    ).toBe("1.3.14");
    expect(
      setups.find((step: { uses: string }) => step.uses === "actions/setup-node@v4").with[
        "node-version"
      ],
    ).toBe(22);
    expect(
      setups.find((step: { with?: { path?: string } }) => step.with?.path === "app").with.ref,
    ).toBe(APP_SHA);
    const run = job.steps.find(
      (step: { run?: string }) => step.run === "node scripts/recruiter-real-ci-run.mjs",
    );
    expect(run.if).toBeUndefined();
    expect(
      job.steps.some(
        (step: { run?: string }) => step.run === "bunx playwright install --with-deps chromium",
      ),
    ).toBe(true);
    const upload = job.steps.find(
      (step: { uses?: string }) => step.uses === "actions/upload-artifact@v4",
    );
    expect(upload.if).toBe("always() && steps.public_evidence.outcome == 'success'");
    expect(upload.with.path.trim().split("\n")).toEqual([
      "real-public/manifest.json",
      "real-public/errors.json",
      "real-public/images/*.png",
    ]);
  });
  test("strict replay refuses missing forward, does not bootstrap fake Auth, and exact counts cannot become skips", () => {
    const runner = read("scripts/recruiter-real-ci-run.mjs");
    expect(runner).toContain("ON_ERROR_STOP=1");
    expect(runner).toContain("requireCompleteHistory(fs.readdirSync(dir))");
    expect(runner).not.toContain('"supabase/tests/00_bootstrap.sql"');
    expect(runner).not.toContain('"scripts/local-stack/auth-gateway.mjs"');
    expect(runner).toContain("email_confirm: true");
    expect(runner).toContain('browserResult("browser-primary", 12)');
    expect(runner).toContain('browserResult("browser-cas", 2)');
    expect(runner).toContain("AbortSignal.timeout(8000)");
    expect(runner).toContain("loser.status !== 409");
    expect(runner).toContain('rejected.code !== "PT409"');
    expect(runner).toContain('rejected.message !== "SCP_IV_SESSION_PROCESS_STALE"');
    expect(runner).toContain('"--project-id", PROJECT, "--no-backup"');
    expect(runner).not.toContain('"--all"');
  });
  test("incomplete or malformed SQL history is refused, including a missing forward", () => {
    const files = Array.from({ length: 383 }, (_, i) => `${20250000000000 + i}_synthetic.sql`);
    files.push("20270307090000_snapshot.sql", "20270307100000_forward.sql");
    expect(requireCompleteHistory(files)).toHaveLength(385);
    expect(() => requireCompleteHistory(files.slice(0, -1))).toThrow();
    expect(() => requireCompleteHistory([...files, "malformed.sql"])).toThrow();
    expect(() => requireCompleteHistory([...files, "20270307100000_second.sql"])).toThrow();
    expect(() =>
      requireCompleteHistory([
        ...files.filter((name) => !name.startsWith("20270307100000_")),
        "20270308100000_other.sql",
      ]),
    ).toThrow("SNAPSHOT_FORWARD_REQUIRED");
  });
  test("twelve primary and two CAS successes require no failed, skipped or flaky browser test", () => {
    expect(
      requireBrowserCounts({ expected: 12, unexpected: 0, flaky: 0, skipped: 0 }, 12).expected,
    ).toBe(12);
    expect(
      requireBrowserCounts({ expected: 2, unexpected: 0, flaky: 0, skipped: 0 }, 2).expected,
    ).toBe(2);
    for (const stats of [
      { expected: 11, unexpected: 0, flaky: 0, skipped: 0 },
      { expected: 12, unexpected: 1, flaky: 0, skipped: 0 },
      { expected: 12, unexpected: 0, flaky: 1, skipped: 0 },
      { expected: 12, unexpected: 0, flaky: 0, skipped: 1 },
      {},
    ])
      expect(() => requireBrowserCounts(stats, 12)).toThrow("BROWSER_COUNTS_MISMATCH");
  });
  test("new browser probes retain governed content and create a fresh stress case through UI", () => {
    const spec = read("e2e/recruiter-real-ci-browser.spec.ts");
    expect(spec).toContain("content.questions).toHaveLength(8)");
    expect(spec).toContain("content.competencies).toHaveLength(6)");
    expect(spec).toContain("sourceSha: APP_SHA");
    expect(spec).not.toContain("49ccb60b-22d5-403a-bfb3-f9ed9988f6b3");
    expect(spec).not.toContain("ea43ad734e80347d56957794f56cd483595fce4a");
    expect(spec).toContain("`/employer/${SLUG}/interview-intelligence/new`");
    expect(spec).toContain("await processFailureAndConflict(page, caseId)");
    const config = read("scripts/recruiter-real-ci-browser.config.ts");
    expect(config).toContain('trace: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('video: "off"');
  });
});

describe("curated real-service artifacts", () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "real-ci-public-test-"));
    return { stackRoot: path.join(root, "stack"), publicRoot: path.join(root, "public") };
  }
  const report = () => ({
    schemaVersion: "recruiter-real-ci-v1",
    stages: { browser: "failed" },
    errors: [{ stage: "browser", code: "REAL_CI_STAGE_FAILED" }],
  });
  test("a failed run remains failed, with auth-free codes and no raw private files", () => {
    const context = fixture();
    writePublicReport(context, report());
    const data = validatePublicReport(context.publicRoot);
    expect(data.stages.browser).toBe("failed");
    expect(data.errors[0].code).toBe("REAL_CI_STAGE_FAILED");
    expect(fs.readdirSync(context.publicRoot).sort()).toEqual(["errors.json", "manifest.json"]);
  });
  test("tokens and private extra files stop publication", () => {
    const context = fixture();
    expect(() =>
      writePublicReport(context, { ...report(), raw: "Bearer syntheticForbiddenToken123" }),
    ).toThrow("PUBLIC_CREDENTIAL_REFUSED");
    const good = fixture();
    writePublicReport(good, report());
    fs.writeFileSync(path.join(good.publicRoot, "status.json"), "private-shaped fixture");
    expect(() => validatePublicReport(good.publicRoot)).toThrow("PUBLIC_FILE_REFUSED");
  });
  test("only named synthetic PNG are copied and their published bytes stay hash-bound", () => {
    const context = fixture();
    const dir = path.join(context.stackRoot, "supabase/.temp/ri-real-browser/curated");
    fs.mkdirSync(dir, { recursive: true });
    const name = "chromium-guard-standalone-sv-report.png";
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDYsAAAAASUVORK5CYII=",
      "base64",
    );
    fs.writeFileSync(path.join(dir, name), png);
    writePublicReport(context, report());
    expect(validatePublicReport(context.publicRoot).images).toHaveLength(1);
    fs.writeFileSync(path.join(context.publicRoot, "images", name), "changed");
    expect(() => validatePublicReport(context.publicRoot)).toThrow("IMAGE_HASH_CHANGED");
  });
});
