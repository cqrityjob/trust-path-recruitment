/** Behavioral controls for the publication gate, in a disposable directory. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(tmpdir(), "sw-evidence-controls-"));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxXcAAAAASUVORK5CYII=",
  "base64",
);
const projects = ["chromium", "mobile-375", "mobile-390"];
const languages = ["sv", "en"];
const screens = ["settings", "monitoring", "sources", "access-denied"];
type Report = {
  specs: {
    title: string;
    tests: { projectName: string; status: string; results: { status: string }[] }[];
  }[];
};
function check(
  name: string,
  mutate: (evidence: string, report: Report) => void,
  passes: boolean,
  journey = "manual",
) {
  const evidence = path.join(directory, name);
  mkdirSync(evidence);
  const report: Report = { specs: [] };
  for (const project of projects)
    for (const language of languages) {
      report.specs.push({
        title: `[${language}] synthetic gate control`,
        tests: [{ projectName: project, status: "expected", results: [{ status: "passed" }] }],
      });
      for (const screen of journey === "analysis"
        ? [
            "navigation",
            "evidence",
            "analysis",
            "report-review",
            "report-approved",
            "overview",
            "sources",
          ]
        : journey === "ai"
          ? ["ai-review", "ai-applied", "ai-stale", "ai-unknown"]
          : screens)
        writeFileSync(path.join(evidence, `${project}-${language}-${screen}.png`), png);
    }
  mutate(evidence, report);
  const reportPath = path.join(directory, `${name}.json`);
  writeFileSync(reportPath, JSON.stringify(report));
  const result = spawnSync(process.execPath, ["scripts/security-work-browser-evidence.ts"], {
    env: {
      ...process.env,
      SW_BROWSER_EVIDENCE_DIR: evidence,
      SW_BROWSER_REPORT: reportPath,
      SW_BROWSER_JOURNEY: journey,
    },
    encoding: "utf8",
  });
  assert.equal(result.status === 0, passes, `${name}: unexpected publication result`);
  console.log(`PASS evidence gate: ${name}`);
}
try {
  check("complete-synthetic-control", () => {}, true);
  check("complete-analysis-control", () => {}, true, "analysis");
  check("complete-ai-control", () => {}, true, "ai");
  check(
    "missing-ai-review",
    (evidence) => unlinkSync(path.join(evidence, "mobile-375-sv-ai-review.png")),
    false,
    "ai",
  );
  check(
    "missing-approved-report",
    (evidence) => unlinkSync(path.join(evidence, "chromium-sv-report-approved.png")),
    false,
    "analysis",
  );
  check("unknown-journey", () => {}, false, "unknown");
  check(
    "missing-screenshot",
    (evidence) => unlinkSync(path.join(evidence, "chromium-sv-monitoring.png")),
    false,
  );
  check(
    "missing-matrix-cell",
    (_evidence, report) => {
      report.specs.pop();
    },
    false,
  );
  check(
    "duplicate-cell",
    (_evidence, report) => {
      report.specs.push(report.specs[0]);
    },
    false,
  );
  check(
    "skipped-case",
    (_evidence, report) => {
      report.specs[0].tests[0].results[0].status = "skipped";
    },
    false,
  );
  check(
    "retried-case",
    (_evidence, report) => {
      report.specs[0].tests[0].results.push({ status: "passed" });
    },
    false,
  );
  check(
    "raw-report-present",
    (evidence) => writeFileSync(path.join(evidence, "raw-report.json"), "{}"),
    false,
  );
  check(
    "non-png-content",
    (evidence) => writeFileSync(path.join(evidence, "chromium-sv-monitoring.png"), "not an image"),
    false,
  );
  check(
    "planted-jwt",
    (evidence) => {
      const token = [
        Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
        Buffer.from('{"sub":"synthetic-control-only"}').toString("base64url"),
        "synthetic_signature_only",
      ].join(".");
      appendFileSync(path.join(evidence, "chromium-sv-monitoring.png"), token);
    },
    false,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
