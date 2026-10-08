import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const runner = "scripts/local-stack/run-ri-p1-evidence.sh";
describe("P1 disposable evidence target guards", () => {
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
    test(name, () => {
      const result = spawnSync("bash", [runner], {
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
});
