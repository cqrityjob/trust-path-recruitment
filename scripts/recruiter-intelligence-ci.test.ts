import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const yaml = readFileSync(".github/workflows/ci.yml", "utf8");
const workflow = Bun.YAML.parse(yaml);
const browser = workflow.jobs.p1_browser;
const PUBLIC_ROOT = "/tmp/ri-p1-browser-public";
const expectedPaths = [
  "manifest.json",
  "stages.log",
  "postgres-version.log",
  "api-postgrest-version.log",
  "ui-postgrest-version.log",
  "bootstrap.log",
  "replay.log",
  "sql-oracle.log",
  "http-api.log",
  "runtime.log",
  "browser.log",
  "images/*.png",
].map((name) => `${PUBLIC_ROOT}/${name}`);

// These assertions concern the executable YAML object, not comment matches.
// A narrowing to api-only, conditional job or ignored failure is a regression.
function contract(job: typeof browser): string[] {
  const errors: string[] = [];
  const demand = (ok: boolean, reason: string) => {
    if (!ok) errors.push(reason);
  };
  demand(!!job && !job.if && !job["continue-on-error"], "mandatory full job");
  if (!job) return errors;
  demand(job["runs-on"] === "ubuntu-latest", "Linux service runner");
  demand(job.services?.postgres?.image === "postgres:17", "PostgreSQL 17");
  demand(
    String(job.env?.RI_P1_DISPOSABLE_POSTGRES) === "1" && job.env?.PGHOST === "127.0.0.1",
    "isolated disposable target",
  );
  demand(
    job.env?.RI_P1_REPORT_DIR === "/tmp/ri-p1-browser-evidence" &&
      job.env?.RI_P1_PUBLIC_REPORT_DIR === PUBLIC_ROOT,
    "separate private and public directories",
  );
  const steps = job.steps ?? [];
  demand(
    steps.every((step: { [key: string]: unknown }) => !step["continue-on-error"]),
    "no ignored step failure",
  );
  const runs = steps.map((step: { run?: string }) => step.run).filter(Boolean);
  demand(runs.includes("bun install --frozen-lockfile"), "frozen dependencies");
  demand(
    runs.includes("bunx playwright install --with-deps chromium"),
    "Chromium and OS dependencies",
  );
  demand(
    runs.includes("bun run recruiter-requirements:check"),
    "mandatory P1 deterministic checks",
  );
  demand(
    steps.some(
      (step: { run?: string; if?: string }) =>
        step.run === "bun run recruiter-requirements:check" && !step.if,
    ),
    "unconditional P1 deterministic checks",
  );
  const full = steps.find(
    (step: { run?: string }) => step.run === "bash scripts/local-stack/run-ri-p1-evidence.sh",
  );
  demand(!!full && !full.if, "unconditional full evidence runner");
  demand(!runs.some((run: string) => run.includes("--api-only")), "browser cannot become API-only");
  demand(
    steps.some(
      (step: { uses?: string; with?: Record<string, unknown> }) =>
        step.uses === "actions/setup-node@v4" && Number(step.with?.["node-version"]) === 22,
    ),
    "Node 22",
  );
  demand(
    steps.some(
      (step: { uses?: string; with?: Record<string, unknown> }) =>
        step.uses === "oven-sh/setup-bun@v2" && step.with?.["bun-version"] === "1.3.14",
    ),
    "Bun 1.3.14",
  );
  const exporter = steps.find((step: { id?: string }) => step.id === "public_evidence");
  demand(
    exporter?.if === "always()" &&
      exporter?.run === "node scripts/local-stack/ri-p1-ci-artifacts.mjs",
    "fail-closed public exporter after failure",
  );
  const uploads = steps.filter(
    (step: { uses?: string }) => step.uses === "actions/upload-artifact@v4",
  );
  demand(uploads.length === 1, "one explicit artifact allowlist");
  const upload = uploads[0];
  demand(
    upload?.if === "always() && steps.public_evidence.outcome == 'success'",
    "upload only validated evidence",
  );
  const paths = String(upload?.with?.path ?? "")
    .trim()
    .split("\n")
    .map((line) => line.trim());
  demand(JSON.stringify(paths) === JSON.stringify(expectedPaths), "exact logs and PNG only");
  return errors;
}

describe("P1 full browser CI contract", () => {
  test("the workflow parses and runs the full isolated proof with pinned tooling", () => {
    expect(contract(browser)).toEqual([]);
    expect(
      workflow.jobs.verify.steps.some(
        (step: { run?: string }) => step.run === "bun run recruiter-requirements:check",
      ),
    ).toBe(true);
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(scripts["recruiter-requirements:check"]).toContain(
      "scripts/recruiter-intelligence-runner.test.ts",
    );
    expect(scripts["recruiter-requirements:check"]).toContain(
      "scripts/recruiter-intelligence-ci.test.ts",
    );
  });
  for (const [name, mutate] of [
    [
      "API-only",
      (job: typeof browser) => {
        job.steps.find((step: { run?: string }) =>
          step.run?.endsWith("run-ri-p1-evidence.sh"),
        ).run += " --api-only";
      },
    ],
    [
      "conditional skip",
      (job: typeof browser) => {
        job.if = "false";
      },
    ],
    [
      "ignored runner failure",
      (job: typeof browser) => {
        job.steps.find((step: { run?: string }) => step.run?.endsWith("run-ri-p1-evidence.sh"))[
          "continue-on-error"
        ] = true;
      },
    ],
    [
      "private directory upload",
      (job: typeof browser) => {
        job.steps.find(
          (step: { uses?: string }) => step.uses === "actions/upload-artifact@v4",
        ).with.path += "\n/tmp/ri-p1-browser-evidence/private/**";
      },
    ],
    [
      "unvalidated upload",
      (job: typeof browser) => {
        job.steps.find((step: { uses?: string }) => step.uses === "actions/upload-artifact@v4").if =
          "always()";
      },
    ],
    [
      "no Chromium dependencies",
      (job: typeof browser) => {
        job.steps = job.steps.filter(
          (step: { run?: string }) => step.run !== "bunx playwright install --with-deps chromium",
        );
      },
    ],
  ] as const) {
    test(`rejects ${name}`, () => {
      const planted = structuredClone(browser);
      mutate(planted);
      expect(contract(planted).length).toBeGreaterThan(0);
    });
  }
});

function capture(content: string | Buffer = "5 passed\n", path = "browser.log") {
  const root = mkdtempSync(join(tmpdir(), "ri-p1-public-test-"));
  const source = join(root, "source");
  const destination = join(root, "public");
  mkdirSync(join(source, "private"), { recursive: true });
  writeFileSync(join(source, "private", "app.log"), "private bearer must never be copied");
  mkdirSync(join(source, "images"));
  const data = Buffer.from(content);
  mkdirSync(join(source, path, ".."), { recursive: true });
  writeFileSync(join(source, path), data);
  const manifest = {
    schemaVersion: "ri-p1-local-evidence-v1",
    runMode: "full",
    checkoutSha: "a".repeat(40),
    verification: { runtime: "passed", browser: "passed" },
    files: [{ path, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") }],
  };
  writeFileSync(join(source, "manifest.json"), JSON.stringify(manifest));
  const run = () =>
    spawnSync(process.execPath, ["scripts/local-stack/ri-p1-ci-artifacts.mjs"], {
      encoding: "utf8",
      env: { ...process.env, RI_P1_REPORT_DIR: source, RI_P1_PUBLIC_REPORT_DIR: destination },
    });
  return { source, destination, manifest, run };
}

describe("P1 public artifact boundary", () => {
  test("exports only checked evidence and identifies runtime as a readiness summary", () => {
    const fixture = capture();
    expect(fixture.run().status).toBe(0);
    expect(existsSync(join(fixture.destination, "private"))).toBe(false);
    expect(readFileSync(join(fixture.destination, "browser.log"), "utf8")).toBe("5 passed\n");
    expect(
      JSON.parse(readFileSync(join(fixture.destination, "runtime.log"), "utf8")),
    ).toMatchObject({
      kind: "runtime_start_and_readiness_summary",
      stage: "passed",
      privateApplicationLogPublished: false,
    });
    const published = JSON.parse(readFileSync(join(fixture.destination, "manifest.json"), "utf8"));
    expect(published.publication.sourceManifestSha256).toHaveLength(64);
    expect(published.files).toEqual(fixture.manifest.files);
  });
  test("refuses bearer and refresh tokens before creating any public artifact", () => {
    for (const content of [
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.signature0123456789",
      '{"refresh_token":"syntheticRefreshToken012345"}',
    ]) {
      const fixture = capture(content);
      const result = fixture.run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("credential-shaped bytes");
      expect(existsSync(fixture.destination)).toBe(false);
    }
  });
  test("refuses hash changes after the manifest", () => {
    const fixture = capture();
    writeFileSync(join(fixture.source, "browser.log"), "changed\n");
    expect(fixture.run().status).toBe(1);
    expect(existsSync(fixture.destination)).toBe(false);
  });
  test("exports a checked PNG screenshot and refuses non-PNG bytes", () => {
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDYsAAAAASUVORK5CYII=",
      "base64",
    );
    const fixture = capture(image, "images/synthetic.png");
    expect(fixture.run().status).toBe(0);
    expect(readFileSync(join(fixture.destination, "images/synthetic.png"))).toEqual(image);
    const wrong = capture("not a PNG", "images/wrong.png");
    expect(wrong.run().status).toBe(1);
    expect(existsSync(wrong.destination)).toBe(false);
  });
  test("refuses symlink sources before reading or publishing them", () => {
    const fixture = capture();
    unlinkSync(join(fixture.source, "browser.log"));
    symlinkSync(join(fixture.source, "private", "app.log"), join(fixture.source, "browser.log"));
    const result = fixture.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("source file must be regular");
    expect(existsSync(fixture.destination)).toBe(false);
  });
  test("refuses private or trace paths even if the manifest lists them", () => {
    for (const path of ["private/diagnostic.log", "trace.zip"]) {
      const fixture = capture("safe-shaped bytes", path);
      expect(fixture.run().status).toBe(1);
      expect(existsSync(fixture.destination)).toBe(false);
    }
  });
  test("API-only evidence cannot be published as the full browser proof", () => {
    const fixture = capture();
    writeFileSync(
      join(fixture.source, "manifest.json"),
      JSON.stringify({ ...fixture.manifest, runMode: "api_only" }),
    );
    expect(fixture.run().status).toBe(1);
    expect(existsSync(fixture.destination)).toBe(false);
  });
  test("a stopped runtime remains stopped in the public summary", () => {
    const fixture = capture();
    writeFileSync(
      join(fixture.source, "manifest.json"),
      JSON.stringify({
        ...fixture.manifest,
        verification: { runtime: "stopped_or_failed", browser: "not_run" },
      }),
    );
    expect(fixture.run().status).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture.destination, "runtime.log"), "utf8")).stage).toBe(
      "stopped_or_failed",
    );
  });
});
