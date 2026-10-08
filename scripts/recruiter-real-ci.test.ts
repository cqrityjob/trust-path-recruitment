import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import cp from "node:child_process";
import { devices } from "@playwright/test";
import { requireNativeMobilePreset } from "./recruiter-real-ci-mobile-preset";
import {
  APP_SHA,
  CONFIG,
  EXCLUDED,
  childEnvironment,
  validateTarget,
  readPrivateStatus,
  requireCompleteHistory,
  requireBrowserCounts,
  requireReleaseSchemaWitness,
  authFailureSummary,
} from "./recruiter-real-ci-contract.mjs";
import { validatePublicReport, writePublicReport } from "./recruiter-real-ci-public.mjs";
import {
  prepareNativeStorageClaim,
  storageFailureSummary,
} from "./recruiter-real-ci-storage-bootstrap.mjs";
import {
  browserFailureSummary,
  requireNativeNoteReadback,
} from "./recruiter-real-ci-browser-diagnostic.mjs";

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

describe("native guard file discovery with separate app dependencies", () => {
  test("all three workflows select only their exact root guard file; name filters are rejected", () => {
    for (const [name, workflowFile] of [
      ["recruiter-real-ci", "recruiter-real-ci.yml"],
      ["recruiter-p1-native", "recruiter-p1-native-ci.yml"],
      ["passport-native-op09", "passport-native-op09-ci.yml"],
    ]) {
      const workflow = read(`.github/workflows/${workflowFile}`);
      const command = `bun test ./scripts/${name}.test.ts`;
      const requireExactFile = (source: string) => {
        if (!source.includes(command)) throw new Error("NATIVE_ROOT_GUARD_FILE_REQUIRED");
      };
      expect(() => requireExactFile(workflow)).not.toThrow();
      expect(() =>
        requireExactFile(workflow.replace(command, command.replace("./scripts/", "scripts/"))),
      ).toThrow("NATIVE_ROOT_GUARD_FILE_REQUIRED");
    }
  });

  test("actual Bun discovery refuses a duplicated Playwright tree or obsolete app Git read; precise root path keeps real mobile checks", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-guard-discovery-"));
    const filename = "native-discovery-probe.test.ts";
    const rootProbe = path.join(dir, "scripts", filename);
    const appProbe = path.join(dir, "app/scripts", filename);
    const installed = path.resolve("node_modules");
    const helper = path.resolve("scripts/recruiter-real-ci-mobile-preset.ts");
    // Distinct package paths reproduce CI's two installations. Immutable
    // installed files are hardlinked, never edited; no install or browser
    // launch is needed. Removing these owned links leaves originals intact.
    const linkTree = (from: string, to: string) => {
      fs.mkdirSync(to, { recursive: true });
      for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const original = fs.realpathSync(path.join(from, entry.name));
        const target = path.join(to, entry.name);
        if (fs.statSync(original).isDirectory()) linkTree(original, target);
        else fs.linkSync(original, target);
      }
    };
    const run = (argument: string) =>
      cp.spawnSync(process.execPath, ["--no-env-file", "test", argument], {
        cwd: dir,
        env: { PATH: process.env.PATH },
        encoding: "utf8",
        timeout: 10000,
      });
    const output = (result: ReturnType<typeof run>) => result.stdout + result.stderr;
    const rootSource = `import {test,expect} from 'bun:test';
import {devices} from '@playwright/test';
import {requireNativeMobilePreset} from ${JSON.stringify(helper)};
test('exact current root real mobile presets',()=>{
 for(const [name,width] of [['iPhone 13 Mini',375],['iPhone 14',390]]) {
  const device=requireNativeMobilePreset(devices,name,width);
  expect(device.isMobile).toBe(true);expect(device.hasTouch).toBe(true);
  expect(device.deviceScaleFactor).toBe(3);expect(device.viewport.width).toBe(width);
 }
});`;
    try {
      for (const tree of [dir, path.join(dir, "app")]) {
        fs.mkdirSync(path.join(tree, "scripts"), { recursive: true });
        for (const pkg of ["@playwright/test", "playwright", "playwright-core"])
          linkTree(path.join(installed, pkg), path.join(tree, "node_modules", pkg));
      }
      expect(fs.realpathSync(path.join(dir, "node_modules/playwright"))).not.toBe(
        fs.realpathSync(path.join(dir, "app/node_modules/playwright")),
      );
      fs.writeFileSync(rootProbe, rootSource, { mode: 0o600 });
      fs.writeFileSync(appProbe, rootSource, { mode: 0o600 });
      const duplicate = run(`scripts/${filename}`);
      expect(duplicate.status).not.toBe(0);
      expect(output(duplicate)).toContain("Requiring @playwright/test second time");
      expect(output(duplicate)).toContain("app/scripts/");
      const exact = run(`./scripts/${filename}`);
      expect(exact.status).toBe(0);
      expect(output(exact)).toContain("1 pass");
      expect(output(exact)).not.toContain("app/scripts/");
      // This isolated Git repository intentionally has no historical object.
      // Only a mistakenly collected obsolete app test would try to read it.
      cp.execFileSync("git", ["init", "--quiet"], { cwd: dir, stdio: "pipe" });
      fs.writeFileSync(
        appProbe,
        `import {execFileSync} from 'node:child_process';
execFileSync('git',['show','40e5775de5195050571421827434ec2872a61506:supabase/tests/recruiter_intelligence_p1_test.sql'],{cwd:${JSON.stringify(dir)},stdio:'pipe'});`,
        { mode: 0o600 },
      );
      const legacy = run(`scripts/${filename}`);
      expect(legacy.status).not.toBe(0);
      expect(output(legacy)).toContain("40e5775de5195050571421827434ec2872a61506");
      expect(output(legacy)).toContain("app/scripts/");
      const withoutLegacyObject = run(`./scripts/${filename}`);
      expect(withoutLegacyObject.status).toBe(0);
      expect(output(withoutLegacyObject)).toContain("1 pass");
      expect(output(withoutLegacyObject)).not.toContain("40e5775de5195050571421827434ec2872a61506");
      expect(output(withoutLegacyObject)).not.toContain("app/scripts/");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("native mobile preset validation", () => {
  test("the installed Playwright presets retain mobile, touch and the intended widths", () => {
    const mini = requireNativeMobilePreset(devices, "iPhone 13 Mini", 375);
    const phone = requireNativeMobilePreset(devices, "iPhone 14", 390);
    expect(mini).toBe(devices["iPhone 13 Mini"]);
    expect(phone).toBe(devices["iPhone 14"]);
    for (const preset of [mini, phone]) {
      expect(preset.isMobile).toBe(true);
      expect(preset.hasTouch).toBe(true);
      expect(preset.deviceScaleFactor).toBe(3);
    }
  });

  test("a missing or incorrectly named preset fails instead of spreading undefined", () => {
    expect(() => requireNativeMobilePreset({}, "iPhone 13 Mini", 375)).toThrow(
      "REAL_CI_MOBILE_PRESET_INVALID",
    );
    expect(() => requireNativeMobilePreset(devices, "iPhone 13 mini", 375)).toThrow(
      "REAL_CI_MOBILE_PRESET_INVALID",
    );
    expect(() => requireNativeMobilePreset(devices, "Desktop Chrome", 375)).toThrow(
      "REAL_CI_MOBILE_PRESET_INVALID",
    );
  });

  test("lost mobile, touch or viewport settings stop both mobile projects", () => {
    for (const [name, width] of [
      ["iPhone 13 Mini", 375],
      ["iPhone 14", 390],
    ] as const) {
      const original = devices[name];
      for (const preset of [
        { ...original, isMobile: false },
        { ...original, hasTouch: false },
        { ...original, viewport: { ...original.viewport, width: width + 1 } },
      ]) {
        expect(() => requireNativeMobilePreset({ [name]: preset }, name, width)).toThrow(
          "REAL_CI_MOBILE_PRESET_INVALID",
        );
      }
    }
    expect(() => requireNativeMobilePreset(devices, "iPhone 14", 375)).toThrow(
      "REAL_CI_MOBILE_PRESET_INVALID",
    );
  });

  test("the native config checks both supported presets before reading CI context", () => {
    const config = read("scripts/recruiter-real-ci-browser.config.ts");
    expect(config).toContain('requireNativeMobilePreset(devices, "iPhone 13 Mini", 375)');
    expect(config).toContain('requireNativeMobilePreset(devices, "iPhone 14", 390)');
    expect(config).toContain("...mobile375");
    expect(config).toContain("...mobile390");
    expect(config).not.toContain('...devices["iPhone 13 mini"]');
    expect(config.indexOf("const mobile390")).toBeLessThan(config.indexOf("readCIContext();"));
  });
});

describe("official real Supabase CI target", () => {
  test("the revised application pin is exact and old native evidence cannot stand in for it", () => {
    expect(APP_SHA).toBe("40e5775de5195050571421827434ec2872a61506");
    expect(() =>
      validateTarget(env, env.RI_REAL_SCHEMA_SHA, "a68f22d799769de32230781bba268632e57e796f"),
    ).toThrow("REAL_CI_UNREVIEWED_APP_HEAD");
    expect(() =>
      validateTarget(env, env.RI_REAL_SCHEMA_SHA, "0eab408debbe660d22825c2ffaa8fcc60de0b68c"),
    ).toThrow("REAL_CI_UNREVIEWED_APP_HEAD");
  });
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
  test("release schema binding is separate from test code and requires a full SHA", () => {
    const release = "1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9";
    const context = validateTarget(
      { ...env, RI_REAL_RELEASE_SCHEMA_SHA: release },
      env.RI_REAL_SCHEMA_SHA,
      APP_SHA,
    );
    expect(context.releaseSchemaSha).toBe(release);
    expect(context.evidenceCodeSha).toBe(env.RI_REAL_SCHEMA_SHA);
    expect(validateTarget(env, env.RI_REAL_SCHEMA_SHA, APP_SHA).releaseSchemaSha).toBe(
      env.RI_REAL_SCHEMA_SHA,
    );
    expect(() =>
      validateTarget(
        { ...env, RI_REAL_RELEASE_SCHEMA_SHA: "main" },
        env.RI_REAL_SCHEMA_SHA,
        APP_SHA,
      ),
    ).toThrow("RELEASE_SCHEMA_SHA_REQUIRED");
  });
  test("release witness permits test-only descendants but refuses SQL/config drift and unrelated history", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "real-ci-schema-witness-"));
    const git = (...args: string[]) =>
      cp
        .execFileSync("git", args, {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
        .trim();
    try {
      git("init", "--quiet");
      git("config", "user.name", "Synthetic CI witness");
      git("config", "user.email", "witness@fixture.invalid");
      git("config", "core.hooksPath", path.join(root, "no-hooks"));
      fs.mkdirSync(path.join(root, "supabase/migrations"), { recursive: true });
      const migration = path.join(root, "supabase/migrations/20270307100000_fixture.sql");
      const config = path.join(root, "supabase/config.toml");
      fs.writeFileSync(migration, "SELECT 1;\n");
      fs.writeFileSync(config, 'project_id = "synthetic"\n');
      const commit = (message: string) => {
        git("add", ".");
        git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message);
        return git("rev-parse", "HEAD");
      };
      const release = commit("synthetic schema");
      fs.writeFileSync(path.join(root, "test-only.txt"), "evidence code\n");
      const code = commit("synthetic test only");
      expect(() => requireReleaseSchemaWitness(root, release, code)).not.toThrow();
      fs.writeFileSync(migration, "SELECT 2;\n");
      expect(() =>
        requireReleaseSchemaWitness(root, release, commit("synthetic SQL drift")),
      ).toThrow("SCHEMA_DIFF_REFUSED");
      fs.writeFileSync(migration, "SELECT 1;\n");
      fs.writeFileSync(config, 'project_id = "changed"\n');
      expect(() =>
        requireReleaseSchemaWitness(root, release, commit("synthetic config drift")),
      ).toThrow("SCHEMA_DIFF_REFUSED");
      git("checkout", "--quiet", "--orphan", "unrelated-synthetic");
      const unrelated = commit("synthetic unrelated schema");
      expect(() => requireReleaseSchemaWitness(root, unrelated, code)).toThrow(
        "SCHEMA_ANCESTOR_REQUIRED",
      );
      expect(() => requireReleaseSchemaWitness(root, "f".repeat(40), code)).toThrow(
        "SCHEMA_ANCESTOR_REQUIRED",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
  test("native admin accounts can use password login while public signup and SMTP remain off", () => {
    const auth = CONFIG.match(/\[auth\]\n([\s\S]*?)\n\[auth\.email\]/)?.[1];
    const email = CONFIG.match(/\[auth\.email\]\n([\s\S]*?)\n\[auth\.sms\]/)?.[1];
    expect(auth).toContain("enable_signup = false");
    expect(email).toContain("enable_signup = true");
    expect(email).toContain("enable_confirmations = false");
  });
  test("Auth diagnostics retain only HTTP status and fixed error taxonomy, never response contents", () => {
    expect(
      authFailureSummary(422, {
        error_code: "email_provider_disabled",
        msg: "private response omitted",
        access_token: "Bearer syntheticForbiddenToken123",
        email: "hidden@fixture.invalid",
      }),
    ).toEqual({ httpStatus: 422, authCode: "email_provider_disabled" });
    expect(authFailureSummary(503, { error_code: "private_arbitrary_body" })).toEqual({
      httpStatus: 503,
      authCode: "unclassified",
    });
    expect(authFailureSummary(Number.NaN, null)).toEqual({
      httpStatus: 0,
      authCode: "unclassified",
    });
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
    expect(job.env.RI_REAL_RELEASE_SCHEMA_SHA).toBe("1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9");
    expect(job.steps[0].with["fetch-depth"]).toBe(0);
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
  test("CLI composite cannot replace the final reviewed Node and Bun runtimes", () => {
    const index = (action: string) =>
      job.steps.findIndex((step: { uses?: string }) => step.uses === action);
    const cli = index("supabase/setup-cli@v3");
    const node = index("actions/setup-node@v4");
    const bun = index("oven-sh/setup-bun@v2");
    expect(cli).toBeLessThan(node);
    expect(cli).toBeLessThan(bun);
    expect(Math.max(node, bun)).toBeLessThan(
      job.steps.findIndex(
        (step: { name?: string }) => step.name === "Frozen evidence dependencies",
      ),
    );
    const runner = read("scripts/recruiter-real-ci-run.mjs");
    expect(runner).toContain('bunVersion !== "1.3.14"');
    expect(runner).toContain("/^v22\\./.test(nodeVersion)");
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
    files.push(
      "20270307090000_snapshot.sql",
      "20270307100000_forward.sql",
      "20270308090000_requirements.sql",
      "20270309090000_upload.sql",
    );
    expect(requireCompleteHistory(files)).toHaveLength(387);
    for (const version of ["20270308090000_", "20270309090000_"]) {
      const omitted = files.filter((name) => !name.startsWith(version));
      expect(() => requireCompleteHistory(omitted)).toThrow("COMPLETE_CANONICAL_HISTORY_REQUIRED");
      expect(() => requireCompleteHistory([...omitted, "20270310100000_other.sql"])).toThrow(
        "REQUIREMENTS_UPLOAD_FORWARD_REQUIRED",
      );
    }
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

describe("fresh real-Auth holder setup", () => {
  test("ordinary own Passport RPC completes before the own credential save", async () => {
    const calls: string[] = [];
    const holder = {
      rpc: async (name: string, input: Record<string, unknown>) => {
        calls.push(name);
        if (name === "sp_passport_ensure") {
          expect(input).toEqual({ _question_version: "sp-q-v1" });
          return { data: [{ created: true, repaired: false }], error: null };
        }
        expect(input).toMatchObject({
          _input: { definition_code: "INTL_ASIS_CPP", identifier: "synthetic-reference" },
        });
        return { data: "synthetic-own-claim", error: null };
      },
    };
    const claim = await prepareNativeStorageClaim(
      holder,
      "synthetic-reference",
      (result: { data: unknown }) => result.data,
    );
    expect(claim).toBe("synthetic-own-claim");
    expect(calls).toEqual(["sp_passport_ensure", "sp_save_international_credential"]);
    const upload = read("scripts/recruiter-real-ci-upload.mjs");
    expect(upload).toContain("await prepareNativeStorageClaim(");
    expect(upload).not.toContain('holder.rpc("sp_save_international_credential"');
  });
  test("failed or malformed Passport setup never advances to credential or Storage", async () => {
    for (const malformed of [false, true]) {
      const calls: string[] = [];
      const holder = {
        rpc: async (name: string) => {
          calls.push(name);
          return {
            data: malformed ? [] : null,
            error: malformed ? null : { code: "42501", message: "SP_SESSION_REVOKED" },
          };
        },
      };
      await expect(
        prepareNativeStorageClaim(
          holder,
          "synthetic",
          (result: { data: unknown; error: unknown }) => {
            if (result.error) throw Error("denied");
            return result.data;
          },
        ),
      ).rejects.toThrow(malformed ? "PASSPORT_RESPONSE_INVALID" : "denied");
      expect(calls).toEqual(["sp_passport_ensure"]);
    }
  });
  test("only fixed operation/domain codes, SQLSTATE and HTTP status enter Storage diagnostics", () => {
    expect(
      storageFailureSummary("create-own-synthetic-credential", {
        status: 400,
        error: { code: "P0001", message: "SP_NO_PASSPORT", details: "private omitted" },
      }),
    ).toEqual({
      operation: "create-own-synthetic-credential",
      httpStatus: 400,
      sqlState: "P0001",
      domainCode: "SP_NO_PASSPORT",
    });
    expect(
      storageFailureSummary("private-arbitrary-operation", {
        status: Number.NaN,
        error: { code: "private-arbitrary-code", message: "Bearer syntheticForbiddenToken123" },
      }),
    ).toEqual({
      operation: "unclassified",
      httpStatus: 0,
      sqlState: "unclassified",
      domainCode: "unclassified",
    });
    const runner = read("scripts/recruiter-real-ci-run.mjs");
    expect(runner).toContain("storageFailureSummary(failure.operation");
    expect(runner).toContain("{ storageFailure: error.storageFailure }");
  });
});

describe("private browser error to fixed public diagnostic", () => {
  test("retains exact counts, fixed project/scenario and spec coordinates but excludes every raw error field", () => {
    const payload = {
      stats: { expected: 11, unexpected: 1, flaky: 0, skipped: 0 },
      suites: [
        {
          suites: [
            {
              specs: [
                {
                  title:
                    "guard standalone sv: AI-off pause, refresh, evidence and immutable report",
                  file: "/private/path/e2e/recruiter-real-ci-browser.spec.ts",
                  line: 513,
                  column: 3,
                  tests: [
                    {
                      projectName: "mobile-375",
                      results: [
                        {
                          status: "failed",
                          error: {
                            message:
                              "Error: expect(locator).toBeVisible() failed\nBearer syntheticForbiddenToken123",
                            stack:
                              "Error private\n at /private/path/e2e/recruiter-real-ci-browser.spec.ts:655:17\npassword omitted",
                          },
                          attachments: [{ body: "private trace omitted", path: "hidden" }],
                          stdout: ["private omitted"],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = browserFailureSummary(JSON.stringify(payload));
    expect(result).toEqual({
      code: "parsed",
      stats: payload.stats,
      failures: [
        {
          project: "mobile-375",
          scenario: "guard-standalone-sv",
          resultStatus: "failed",
          category: "assertion",
          location: {
            file: "e2e/recruiter-real-ci-browser.spec.ts",
            line: 655,
            column: 17,
          },
        },
      ],
    });
    for (const forbidden of [
      "Bearer",
      "private",
      "password",
      "stdout",
      "attachment",
      "/private/path",
    ])
      expect(JSON.stringify(result)).not.toContain(forbidden);
    const context = {
      stackRoot: fs.mkdtempSync(path.join(os.tmpdir(), "browser-diagnostic-private-")),
      publicRoot: fs.mkdtempSync(path.join(os.tmpdir(), "browser-diagnostic-public-")),
    };
    writePublicReport(context, {
      stages: { browser: "failed" },
      errors: [
        {
          stage: "browser",
          code: "REAL_CI_BROWSER_PRIMARY_FAILED",
          browserFailure: result,
        },
      ],
    });
    expect(validatePublicReport(context.publicRoot).stages.browser).toBe("failed");
  });
  test("unknown names/messages, invalid JSON/counts and unrelated source paths cannot be reflected", () => {
    expect(browserFailureSummary("Bearer syntheticForbiddenToken123")).toEqual({
      code: "invalid_document",
      failures: [],
    });
    const result = browserFailureSummary(
      JSON.stringify({
        stats: {
          expected: "private token",
          unexpected: -1,
          skipped: 101,
          flaky: 0,
        },
        suites: [
          null,
          {
            specs: [
              null,
              {
                title: "private arbitrary title",
                file: "/private/other.ts",
                tests: [
                  null,
                  {
                    projectName: "private arbitrary project",
                    results: [
                      null,
                      {
                        status: "timedOut",
                        error: {
                          message: "secret response",
                          location: {
                            file: "/private/other.ts",
                            line: 77,
                            column: 4,
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(result).toEqual({
      code: "parsed",
      stats: {
        expected: null,
        unexpected: null,
        skipped: null,
        flaky: 0,
      },
      failures: [
        {
          project: "unclassified",
          scenario: "unclassified",
          resultStatus: "timedOut",
          category: "test_timeout",
          location: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  test("only failed results are exported, locations are bounded and runner keeps failure gates", () => {
    const result = browserFailureSummary(
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: "two-tab process CAS on real Auth",
                file: "recruiter-real-ci-browser.spec.ts",
                line: 471,
                column: 1,
                tests: [
                  {
                    projectName: "chromium",
                    results: [
                      {
                        status: "passed",
                        error: { message: "ignored private text" },
                      },
                      { status: "skipped" },
                      {
                        status: "failed",
                        error: {
                          name: "TimeoutError",
                          location: {
                            file: "recruiter-real-ci-browser.spec.ts",
                            line: 2001,
                            column: 100000,
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(result.failures).toEqual([
      {
        project: "chromium",
        scenario: "two-tab-process-cas",
        resultStatus: "failed",
        category: "operation_timeout",
        location: {
          file: "e2e/recruiter-real-ci-browser.spec.ts",
          line: 471,
          column: 1,
        },
      },
    ]);
    const runner = read("scripts/recruiter-real-ci-run.mjs");
    expect(runner).toContain('name === "browser-primary" || name === "browser-cas"');
    expect(runner).toContain("error.browserFailure = browserFailureSummary(text)");
    expect(runner).toContain("throw error;");
    expect(runner).toContain("requireBrowserCounts(data.stats, expected)");
    expect(read("scripts/recruiter-real-ci-browser.config.ts")).toContain("retries: 0");
  });
});

describe("native question-note identity and safe diagnostics", () => {
  const fixture = (phase = "paused") => ({
    phase,
    sessions: [{ status: phase === "paused" ? "paused" : "completed" }],
    cases: [{ status: phase === "paused" ? "interview_in_progress" : "interview_complete" }],
    questions: Array.from({ length: 8 }, (_, i) => ({
      id: `synthetic-${i + 1}`,
      code: `Q${i + 1}`,
    })),
    notes: Array.from({ length: 8 }, (_, i) => ({
      question_id: `synthetic-${i + 1}`,
      body: `Q${i + 1}: private original`,
    })),
    markers: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`Q${i + 1}`, `Q${i + 1}:`])),
  });
  test("all eight nonblank markers must belong to their own governed question IDs", () => {
    for (const phase of ["paused", "completed", "evidence"])
      expect(requireNativeNoteReadback(fixture(phase))).toEqual({
        phase,
        nonemptyQuestionNotes: 8,
      });
    const missing = fixture();
    missing.notes.splice(1, 1);
    expect(() => requireNativeNoteReadback(missing)).toThrow(
      "REAL_CI_NOTE_READBACK_PAUSED_Q2_MISSING",
    );
    const blank = fixture();
    blank.notes[3].body = " \n";
    expect(() => requireNativeNoteReadback(blank)).toThrow("REAL_CI_NOTE_READBACK_PAUSED_Q4_BLANK");
    const misplaced = fixture();
    [misplaced.notes[1].body, misplaced.notes[2].body] = [
      misplaced.notes[2].body,
      misplaced.notes[1].body,
    ];
    expect(() => requireNativeNoteReadback(misplaced)).toThrow(
      "REAL_CI_NOTE_READBACK_PAUSED_Q2_MARKER",
    );
    const duplicate = fixture();
    duplicate.notes.push({ ...duplicate.notes[7] });
    expect(() => requireNativeNoteReadback(duplicate)).toThrow(
      "REAL_CI_NOTE_READBACK_PAUSED_Q8_DUPLICATE",
    );
  });
  test("own-session and case lifecycle are checked without leaking input values", () => {
    const session = fixture("completed");
    session.sessions[0].status = "private wrong value";
    expect(() => requireNativeNoteReadback(session)).toThrow(
      "REAL_CI_NOTE_READBACK_COMPLETED_SESSION_STATE",
    );
    const cases = fixture("completed");
    cases.cases[0].status = "assessed";
    expect(() => requireNativeNoteReadback(cases)).toThrow(
      "REAL_CI_NOTE_READBACK_COMPLETED_CASE_STATE",
    );
    const questions = fixture();
    questions.questions[7].code = "private wrong code";
    expect(() => requireNativeNoteReadback(questions)).toThrow(
      "REAL_CI_NOTE_READBACK_PAUSED_QUESTION_MAP",
    );
    const evidence = fixture("evidence");
    evidence.cases[0].status = "evidence_review";
    expect(requireNativeNoteReadback(evidence).nonemptyQuestionNotes).toBe(8);
  });
  test("only exact allowlisted note probe codes are published, never arbitrary suffixes or private text", () => {
    const report = (message: string) =>
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: "guard standalone sv: test",
                tests: [
                  {
                    projectName: "mobile-375",
                    results: [{ status: "failed", error: { message } }],
                  },
                ],
              },
            ],
          },
        ],
      });
    const allowed = browserFailureSummary(report("Error: REAL_CI_NOTE_READBACK_PAUSED_Q2_MISSING"));
    expect(allowed.failures[0]).toMatchObject({
      category: "note_readback",
      probeCode: "REAL_CI_NOTE_READBACK_PAUSED_Q2_MISSING",
    });
    expect(
      browserFailureSummary(report("REAL_CI_EVIDENCE_Q2_NOTE_VISIBLE")).failures[0],
    ).toMatchObject({
      category: "evidence_readback",
      probeCode: "REAL_CI_EVIDENCE_Q2_NOTE_VISIBLE",
    });
    for (const message of [
      "REAL_CI_NOTE_READBACK_PAUSED_Q9_MISSING",
      "REAL_CI_NOTE_READBACK_PAUSED_Q2_MISSING Bearer private-token",
      "REAL_CI_NOTE_READBACK_PAUSED_Q2_MISSING\nprivate note text",
      "REAL_CI_NOTE_READBACK_PRIVATE_Q2_MISSING",
      "REAL_CI_EVIDENCE_Q9_USE_VISIBLE",
      "REAL_CI_EVIDENCE_Q2_USE_VISIBLE\nprivate note text",
    ]) {
      const publicResult = browserFailureSummary(report(message));
      expect(publicResult.failures[0]).not.toHaveProperty("probeCode");
      expect(JSON.stringify(publicResult)).not.toContain("private");
      expect(JSON.stringify(publicResult)).not.toContain("Bearer");
    }
    const spec = read("e2e/recruiter-real-ci-browser.spec.ts");
    expect(spec).toContain("select=question_id,body");
    expect(spec).toContain('toHaveAttribute("aria-current", "true")');
    expect(spec).toContain(
      'page.getByRole("article", { name: /^Bekräftat underlag$|^Confirmed material$/ })',
    );
    expect(spec).toContain('markers, "paused")');
    expect(spec).toContain('markers, "completed")');
    expect(read("scripts/recruiter-real-ci-browser.config.ts")).toContain("retries: 0");
  });
});

describe("curated real-service artifacts", () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "real-ci-public-test-"));
    return {
      stackRoot: path.join(root, "stack"),
      publicRoot: path.join(root, "public"),
    };
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
      writePublicReport(context, {
        ...report(),
        raw: "Bearer syntheticForbiddenToken123",
      }),
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
