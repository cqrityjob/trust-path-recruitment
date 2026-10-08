import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = process.env.RI_P1_REPORT_DIR;
if (!root) throw new Error("RI_P1_REPORT_DIR required");
const allowed = [
  "stages.log",
  "bootstrap.log",
  "replay.log",
  "sql-oracle.log",
  "http-api.log",
  "browser.log",
];
let stages = new Set();
try {
  stages = new Set(readFileSync(join(root, "stages.log"), "utf8").trim().split("\n"));
} catch {
  /* older or preflight-stopped run */
}
const stageNames = ["bootstrap", "replay", "oracle", "gateway", "api", "runtime", "browser"];
const verification = Object.fromEntries(
  stageNames.map((name) => [
    name,
    stages.has(`pass ${name}`)
      ? "passed"
      : stages.has(`begin ${name}`)
        ? "stopped_or_failed"
        : "not_run",
  ]),
);
const log = (name) => {
  try {
    return readFileSync(join(root, name), "utf8");
  } catch {
    return "";
  }
};
const apiAssertions = Number(log("http-api.log").match(/"assertions":\s*(\d+)/)?.[1] ?? 0);
const browserCasesPassed = Number(log("browser.log").match(/(\d+) passed\b/)?.[1] ?? 0);
let pictures = [];
try {
  pictures = readdirSync(join(root, "images"))
    .filter((name) => name.endsWith(".png"))
    .map((name) => `images/${name}`);
} catch {
  /* no image when bootstrap fails */
}
const files = [...allowed, ...pictures].flatMap((name) => {
  try {
    const data = readFileSync(join(root, name));
    return [
      { path: name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") },
    ];
  } catch {
    return [];
  }
});
const inputs = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(
    (name) =>
      name.startsWith("src/") ||
      name.startsWith("supabase/migrations/") ||
      name.startsWith("scripts/local-stack/") ||
      name.includes("recruiter-intelligence") ||
      name.includes("recruiter_intelligence") ||
      name === "e2e/recruiter-intelligence-p1.spec.ts",
  )
  .sort();
const sourceDigest = createHash("sha256");
for (const name of inputs)
  sourceDigest.update(
    `${name}\0${createHash("sha256").update(readFileSync(name)).digest("hex")}\n`,
  );
const result = {
  schemaVersion: "ri-p1-local-evidence-v1",
  checkoutSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  workingTreeChanges: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3)),
  sourceInputsSha256: sourceDigest.digest("hex"),
  sourceInputCount: inputs.length,
  createdAt: new Date().toISOString(),
  nodeVersion: process.version,
  exitCode: Number(process.env.RI_P1_RESULT ?? 1),
  verification,
  executedAssertions: {
    sql: (log("sql-oracle.log").match(/NOTICE:\s+ok /g) ?? []).length,
    api: apiAssertions,
    browserCasesPassed,
  },
  oracle: { received: 100, green: 40, yellow: 25, gray: 35, reviewed: 27, remaining: 73 },
  actual: [
    ...(verification.replay === "passed" ? ["full SQL migration replay"] : []),
    ...(verification.oracle === "passed" ? ["actual SQL 100-application oracle"] : []),
    ...(verification.api === "passed" ? ["authenticated PostgREST privileges/RLS/RPC"] : []),
    ...(verification.browser === "passed"
      ? ["product server functions and five browser cases"]
      : []),
  ],
  substitutes: ["Auth/Storage gateway; not GoTrue or Storage API"],
  browser: {
    engine: "Chromium",
    languages: ["sv", "en"],
    viewports: ["1440×1000 desktop", "375×812 touch/mobile emulation; not a physical device"],
  },
  databases: ["ri_p1_seed_ci_test", "ri_p1_browser_ci_test", "ri_p1_api_ci_test"],
  excluded: [
    "private service configuration/logs",
    "Playwright traces carrying local bearer tokens",
    "real Auth/Storage",
    "published runtime",
    "physical mobile",
  ],
  files,
};
writeFileSync(join(root, "manifest.json"), JSON.stringify(result, null, 2) + "\n");
