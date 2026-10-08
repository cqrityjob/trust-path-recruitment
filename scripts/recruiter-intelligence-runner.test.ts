import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const runner = "scripts/local-stack/run-ri-p1-evidence.sh";
describe("P1 disposable evidence target guards", () => {
  test("mandatory API proof defaults to deployed PostgREST14.15 and bounds each RPC attempt", () => {
    const source = readFileSync(runner, "utf8");
    const api = readFileSync("scripts/recruiter-intelligence-p1-api-check.mjs", "utf8");
    expect(source).toContain("${RI_P1_POSTGREST_IMAGE:-postgrest/postgrest:v14.15}");
    expect(api).toContain("AbortSignal.timeout(8000)");
    expect(api).toContain("assert.equal(result.status, 409");
    expect(api).toContain('assert.equal(result.body.code, "PT409")');
  });
  for (const args of [[], ["--api-only"]])
    for (const [name, env, message] of [
      [
        "requires explicit disposable-instance intent",
        { RI_P1_DISPOSABLE_POSTGRES: "0" },
        "explicit RI_P1_DISPOSABLE_POSTGRES=1 required",
      ],
      [
        "refuses hosted postgres before any dependency, SQL or service startup",
        { RI_P1_DISPOSABLE_POSTGRES: "1", PGHOST: "db.example.supabase.co" },
        "Postgres must be loopback",
      ],
      [
        "refuses another database principal",
        { RI_P1_DISPOSABLE_POSTGRES: "1", PGHOST: "127.0.0.1", PGUSER: "authenticated" },
        "disposable bootstrap requires postgres",
      ],
    ] as const) {
      test(`${args.length ? "API-only: " : "full: "}${name}`, () => {
        const result = spawnSync("bash", [runner, ...args], {
          encoding: "utf8",
          env: { ...process.env, ...env },
        });
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(message);
        expect(result.stdout).toBe("");
      });
    }
  test("the existing Auth harness guard remains unchanged; the P1 wrapper admits only one named own database", () => {
    const original = readFileSync("scripts/local-stack/harness.sql", "utf8");
    const exact = "current_database() NOT IN ('beskt_e2e', 'postgres', 'scp_ci_test')";
    const narrow = spawnSync(
      process.execPath,
      ["scripts/local-stack/ri-p1-harness.mjs", "ri_p1_browser_ci_test"],
      { encoding: "utf8" },
    );
    expect(narrow.status).toBe(0);
    expect(narrow.stdout).toBe(
      original.replace(exact, "current_database() <> 'ri_p1_browser_ci_test'"),
    );
    expect(readFileSync("scripts/local-stack/harness.sql", "utf8")).toBe(original);
    const refused = spawnSync(
      process.execPath,
      ["scripts/local-stack/ri-p1-harness.mjs", "postgres"],
      { encoding: "utf8" },
    );
    expect(refused.status).not.toBe(0);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toContain("RI_P1_HARNESS_WRONG_DATABASE");
  });
  test("failed evidence cannot claim that unexecuted or failed browser stages passed", () => {
    const dir = mkdtempSync(join(tmpdir(), "ri-p1-manifest-test-"));
    writeFileSync(
      join(dir, "stages.log"),
      "begin replay\npass replay\nbegin oracle\npass oracle\nbegin api\npass api\nbegin browser\n",
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/local-stack/ri-p1-evidence-manifest.mjs"],
      { encoding: "utf8", env: { ...process.env, RI_P1_REPORT_DIR: dir, RI_P1_RESULT: "1" } },
    );
    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest.exitCode).toBe(1);
    expect(manifest.verification).toMatchObject({
      replay: "passed",
      oracle: "passed",
      api: "passed",
      runtime: "not_run",
      browser: "stopped_or_failed",
    });
    expect(manifest.actual.some((entry: string) => entry.includes("browser"))).toBe(false);
    expect(manifest.excluded).toContain("Playwright traces carrying local bearer tokens");
  });
  test("API-only success explicitly excludes runtime/browser and their database rather than marking them passed", () => {
    const dir = mkdtempSync(join(tmpdir(), "ri-p1-api-manifest-test-"));
    writeFileSync(
      join(dir, "stages.log"),
      "begin replay\npass replay\nbegin oracle\npass oracle\nbegin api\npass api\nintentional runtime\nintentional browser\n",
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/local-stack/ri-p1-evidence-manifest.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          RI_P1_REPORT_DIR: dir,
          RI_P1_RESULT: "0",
          RI_P1_RUN_MODE: "api_only",
        },
      },
    );
    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest.exitCode).toBe(0);
    expect(manifest.verification).toMatchObject({
      replay: "passed",
      oracle: "passed",
      api: "passed",
      runtime: "intentionally_not_run",
      browser: "intentionally_not_run",
    });
    expect(manifest.browser.executed).toBe(false);
    expect(manifest.databases).toEqual(["ri_p1_seed_ci_test", "ri_p1_api_ci_test"]);
    expect(manifest.actual.some((entry: string) => entry.includes("browser"))).toBe(false);
  });
});
