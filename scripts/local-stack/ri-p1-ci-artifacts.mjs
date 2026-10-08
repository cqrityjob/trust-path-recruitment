// Publish only the runner's public evidence, after verifying its hashes and
// refusing credentials. Never read private app/service logs or Playwright traces.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_LOGS = new Set([
  "stages.log",
  "postgres-version.log",
  "api-postgrest-version.log",
  "ui-postgrest-version.log",
  "bootstrap.log",
  "replay.log",
  "sql-oracle.log",
  "http-api.log",
  "browser.log",
]);
const TOKENS = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\b(?:sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]{12,}/,
  /\b(?:authorization\s*[:=]\s*)?Bearer\s+[A-Za-z0-9_.-]{12,}/i,
  /["']?(?:access_token|refresh_token|jwt_secret)["']?\s*[:=]\s*["']?[A-Za-z0-9_.-]{8,}/i,
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|PGPASSWORD|LOCAL_JWT_SECRET|PGRST_JWT_SECRET)\s*[:=]\s*\S+/i,
];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const refuse = (reason) => {
  throw new Error(`RI_P1_PUBLIC_EVIDENCE_REFUSED: ${reason}`);
};
const readRegular = (root, name) => {
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    refuse("source directory must be regular");
  if (name.startsWith("images/")) {
    const images = join(root, "images");
    if (!lstatSync(images).isDirectory() || lstatSync(images).isSymbolicLink())
      refuse("image directory must be regular");
  }
  const file = join(root, name);
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
    refuse("source file must be regular");
  const data = readFileSync(file);
  if (TOKENS.some((pattern) => pattern.test(data.toString("latin1"))))
    refuse("credential-shaped bytes in public evidence");
  return data;
};

export function exportPublicEvidence(source, destination) {
  if (!source || !destination || resolve(source) === resolve(destination))
    refuse("separate source and publication directories required");
  if (existsSync(destination)) refuse("publication directory must be fresh");
  const rawManifest = readRegular(source, "manifest.json");
  const manifest = JSON.parse(rawManifest.toString("utf8"));
  if (manifest.schemaVersion !== "ri-p1-local-evidence-v1" || manifest.runMode !== "full")
    refuse("full P1 evidence manifest required");
  if (!Array.isArray(manifest.files)) refuse("manifest files required");
  const names = new Set();
  const checked = manifest.files.map((entry) => {
    const name = entry.path;
    if (
      typeof name !== "string" ||
      (!PUBLIC_LOGS.has(name) && !/^images\/[A-Za-z0-9_.-]+\.png$/.test(name)) ||
      names.has(name)
    )
      refuse("unapproved or duplicate artifact path");
    names.add(name);
    const data = readRegular(source, name);
    if (entry.sha256 !== digest(data) || entry.bytes !== data.length)
      refuse("evidence hash or length changed after manifest");
    if (
      name.startsWith("images/") &&
      !data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    )
      refuse("PNG image required");
    return { name, data };
  });
  // This summary states what was observed by the runner. Vite stdout/stderr
  // stays private; this file must never claim to be its redacted transcript.
  const runtime = Buffer.from(
    JSON.stringify(
      {
        kind: "runtime_start_and_readiness_summary",
        checkoutSha: manifest.checkoutSha,
        stage: manifest.verification?.runtime ?? "not_run",
        privateApplicationLogPublished: false,
      },
      null,
      2,
    ) + "\n",
  );
  const publication = {
    exporterVersion: "ri-p1-public-evidence-v1",
    sourceManifestSha256: digest(rawManifest),
    runtimeSummary: { path: "runtime.log", bytes: runtime.length, sha256: digest(runtime) },
    excluded: ["private/", "test-results/", "playwright-report/", "credential-shaped log bytes"],
  };
  const publicManifest = Buffer.from(JSON.stringify({ ...manifest, publication }, null, 2) + "\n");
  if (TOKENS.some((pattern) => pattern.test(publicManifest.toString("latin1"))))
    refuse("credential-shaped bytes in publication manifest");
  mkdirSync(destination, { recursive: true });
  for (const { name, data } of checked) {
    mkdirSync(dirname(join(destination, name)), { recursive: true });
    writeFileSync(join(destination, name), data);
  }
  writeFileSync(join(destination, "runtime.log"), runtime);
  writeFileSync(join(destination, "manifest.json"), publicManifest);
  return checked.length + 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const files = exportPublicEvidence(
      process.env.RI_P1_REPORT_DIR,
      process.env.RI_P1_PUBLIC_REPORT_DIR,
    );
    console.log(`P1 public evidence: ${files} validated files; private logs and traces excluded.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "RI_P1_PUBLIC_EVIDENCE_REFUSED");
    process.exitCode = 1;
  }
}
