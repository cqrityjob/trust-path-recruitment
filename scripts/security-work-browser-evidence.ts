/** Deliberately publish no raw report, network log, storage state or trace. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EMPTY_ALLOWLIST, scanDirectories } from "./e4-evidence-scan";

const evidence = process.env.SW_BROWSER_EVIDENCE_DIR;
const reportPath = process.env.SW_BROWSER_REPORT;
const journey = process.env.SW_BROWSER_JOURNEY ?? "manual";
if (!["manual", "analysis", "ai"].includes(journey)) throw new Error("Unknown browser journey");
if (!evidence || !reportPath) throw new Error("Missing private browser evidence paths");
type Suite = {
  suites?: Suite[];
  specs?: {
    title: string;
    tests: { projectName: string; status: string; results: { status: string }[] }[];
  }[];
};
const report = JSON.parse(readFileSync(reportPath, "utf8")) as Suite & { errors?: unknown[] };
const cases: { project: string; language: string; passed: boolean }[] = [];
function walk(suite: Suite) {
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests) {
      const language = /^\[(sv|en)\]/.exec(spec.title)?.[1];
      if (!language) throw new Error("Unexpected browser test title");
      cases.push({
        project: test.projectName,
        language,
        passed:
          test.status === "expected" &&
          test.results.length === 1 &&
          test.results[0].status === "passed",
      });
    }
  for (const child of suite.suites ?? []) walk(child);
}
walk(report);
const expected = ["chromium", "mobile-375", "mobile-390"]
  .flatMap((project) => ["sv", "en"].map((language) => `${project}:${language}`))
  .sort();
if (
  JSON.stringify(cases.map((row) => `${row.project}:${row.language}`).sort()) !==
    JSON.stringify(expected) ||
  cases.some((row) => !row.passed) ||
  report.errors?.length
) {
  throw new Error(
    "Browser evidence refused: all six journeys must pass once, with no skip or retry",
  );
}
const files = readdirSync(evidence).filter((name) => name !== "manifest.json");
if (!files.length || files.some((name) => !/^[a-z0-9-]+\.png$/.test(name)))
  throw new Error("Only named PNG captures belong in published evidence");
for (const file of files) {
  if (
    readFileSync(path.join(evidence, file)).subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  ) {
    throw new Error("Evidence capture is not a PNG");
  }
}
for (const row of cases) {
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
      : ["monitoring", "sources", "settings", "access-denied"]) {
    if (!files.includes(`${row.project}-${row.language}-${screen}.png`))
      throw new Error(`Missing ${screen} screenshot`);
  }
}
const manifest = {
  schemaVersion: 1,
  journey,
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  workingTreeDirty: Boolean(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  ),
  environment: "disposable-local-gotrue-postgrest-postgresql",
  supabaseCli: execFileSync(process.env.SW_SUPABASE_CLI ?? "supabase", ["--version"], {
    encoding: "utf8",
  }).trim(),
  cases,
  captures: files.sort().map((file) => ({
    file,
    sha256: createHash("sha256")
      .update(readFileSync(path.join(evidence, file)))
      .digest("hex"),
  })),
  rawAuthenticatedArtifactsPublished: false,
};
writeFileSync(path.join(evidence, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const scan = scanDirectories(["."], evidence, {
  allow: EMPTY_ALLOWLIST,
  allowedLocalTokens: 0,
});
if (scan.scanned !== files.length + 1)
  throw new Error("Evidence scan did not inspect every published file");
if (scan.findings.length)
  throw new Error(
    `Evidence refused: ${scan.findings.map((x) => `${x.where}: ${x.what}`).join("; ")}`,
  );
console.log(
  `Security Work evidence: six journeys, ${files.length} PNG captures, ${scan.scanned} files scanned; no raw authenticated artifacts published.`,
);
