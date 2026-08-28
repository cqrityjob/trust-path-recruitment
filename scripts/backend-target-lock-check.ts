/**
 * CQrityjob backend target lock.
 *
 * This repository is in a controlled transition from the Lovable Cloud
 * backend to an owner-controlled Supabase project. The failure to prevent is
 * not a bad SQL statement; it is a correct statement reaching the wrong
 * project, or application code moving before its schema.
 *
 * This guard is deliberately credential-free and performs no network access.
 * During transition_preparation it proves that:
 *   - the three immutable project identities are not confused;
 *   - the shipping app still points to the current live Lovable backend;
 *   - the new project is recorded only as an empty candidate;
 *   - no GitHub workflow can link to or write any hosted database yet; and
 *   - the old excluded project can never become a deployment target silently.
 *
 * The later bootstrap/cutover PR must change this guard and the registry in a
 * reviewed diff. Dashboard deployment must remain off until that reviewed
 * change; this guard makes any repository-hosted write path fail closed.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ProjectRef = string;

interface DeploymentTargets {
  schemaVersion: number;
  releaseMode: "transition_preparation" | "bootstrap_authorised" | "cutover_complete";
  automaticProductionDeployEnabled: boolean;
  verificationStrategy: "github_ci_disposable_postgres";
  writeTargetRef: ProjectRef | null;
  lovableProjectId: string;
  currentLive: {
    kind: "lovable_cloud";
    projectRef: ProjectRef;
    writePolicy: string;
  };
  candidateProduction: {
    kind: "owned_supabase";
    projectRef: ProjectRef;
    region: string;
    state: string;
    writePolicy: string;
  };
  excluded: Array<{ projectRef: ProjectRef; reason: string }>;
}

interface MigrationPolicy {
  canonicalProject?: { lovableProject?: string; hostedSupabaseRef?: string };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];

const OWNER_LOCKED = {
  lovableProjectId: "9ec625ef-34a1-4b4b-8cbb-712cae168579",
  currentLiveRef: "zrahptwsnjcdyzfywbeh",
  candidateProductionRef: "vcgwvtmzftmulmoxmufv",
  permanentlyExcludedRef: "mlvzmiutmyyqeuvjglco",
} as const;

function fail(message: string): void {
  failures.push(message);
}

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function parseEnv(source: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    entries.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
  }
  return entries;
}

const targets = JSON.parse(
  read("supabase/deployment-targets.json"),
) as DeploymentTargets;
const migrationPolicy = JSON.parse(
  read("supabase/migrations-policy.json"),
) as MigrationPolicy;
const appEnv = parseEnv(read(".env"));
const configToml = read("supabase/config.toml");

if (targets.schemaVersion !== 1)
  fail(`unsupported deployment-targets schemaVersion ${targets.schemaVersion}`);
if (targets.lovableProjectId !== OWNER_LOCKED.lovableProjectId) {
  fail(`Lovable project identity changed: expected ${OWNER_LOCKED.lovableProjectId}`);
}
if (targets.currentLive.projectRef !== OWNER_LOCKED.currentLiveRef) {
  fail(`current-live ref changed during preparation: expected ${OWNER_LOCKED.currentLiveRef}`);
}
if (targets.candidateProduction.projectRef !== OWNER_LOCKED.candidateProductionRef) {
  fail(`candidate-production ref changed: expected ${OWNER_LOCKED.candidateProductionRef}`);
}
if (!targets.excluded.some((entry) => entry.projectRef === OWNER_LOCKED.permanentlyExcludedRef)) {
  fail(`permanently excluded ref ${OWNER_LOCKED.permanentlyExcludedRef} is missing`);
}

const allRefs = [
  targets.currentLive.projectRef,
  targets.candidateProduction.projectRef,
  ...targets.excluded.map((entry) => entry.projectRef),
];
if (new Set(allRefs).size !== allRefs.length)
  fail("a Supabase project appears in more than one target class");
if (allRefs.some((ref) => !/^[a-z]{20}$/.test(ref)))
  fail("every Supabase project ref must be exactly 20 lowercase letters");

if (targets.releaseMode !== "transition_preparation") {
  fail(
    `this preparation guard only accepts releaseMode=transition_preparation, got ${targets.releaseMode}`,
  );
}
if (targets.automaticProductionDeployEnabled)
  fail("automatic production deployment must remain disabled during preparation");
if (targets.verificationStrategy !== "github_ci_disposable_postgres") {
  fail("transition verification must use the existing disposable-Postgres GitHub CI path");
}
if (targets.writeTargetRef !== null)
  fail("writeTargetRef must remain null until an owner-approved bootstrap PR");
if (targets.candidateProduction.state !== "provisioned_empty") {
  fail(
    `candidate production must remain recorded as provisioned_empty, got ${targets.candidateProduction.state}`,
  );
}

const expectedUrl = `https://${OWNER_LOCKED.currentLiveRef}.supabase.co`;
for (const key of ["SUPABASE_PROJECT_ID", "VITE_SUPABASE_PROJECT_ID"] as const) {
  if (appEnv.get(key) !== OWNER_LOCKED.currentLiveRef)
    fail(`${key} must still point to current live during preparation`);
}
for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const) {
  if (appEnv.get(key) !== expectedUrl)
    fail(`${key} must still point to current live during preparation`);
}
if (!configToml.includes(`project_id = "${OWNER_LOCKED.currentLiveRef}"`)) {
  fail("supabase/config.toml must still identify the current live backend during preparation");
}
if (migrationPolicy.canonicalProject?.hostedSupabaseRef !== OWNER_LOCKED.currentLiveRef) {
  fail("migrations-policy canonicalProject must remain the current live backend until cutover");
}
if (migrationPolicy.canonicalProject?.lovableProject !== OWNER_LOCKED.lovableProjectId) {
  fail("migrations-policy Lovable project identity does not match the owner lock");
}

const workflowDir = path.join(root, ".github/workflows");
const hostedWritePattern = /\bsupabase\s+(?:link|db\s+push|migration\s+repair)\b/i;
for (const file of readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))) {
  const source = readFileSync(path.join(workflowDir, file), "utf8");
  if (hostedWritePattern.test(source)) {
    fail(`${file} contains a hosted Supabase write/link command while deployment is disabled`);
  }
  if (source.includes(OWNER_LOCKED.permanentlyExcludedRef)) {
    fail(`${file} references the permanently excluded Supabase project`);
  }
}

// Bun loads the tracked .env automatically, so SUPABASE_PROJECT_ID is the
// shipping application's current backend. A later deployment workflow must
// declare this dedicated write-target variable explicitly.
const processTarget = process.env.CQ_SCHEMA_WRITE_TARGET_REF;
if (processTarget && processTarget !== OWNER_LOCKED.candidateProductionRef) {
  fail(
    `runner CQ_SCHEMA_WRITE_TARGET_REF is ${processTarget}; only the candidate ref may be staged for the later bootstrap`,
  );
}

if (failures.length > 0) {
  console.error("BACKEND TARGET LOCK: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("BACKEND TARGET LOCK: PASS");
console.log(`  live (unchanged):       ${targets.currentLive.projectRef} [Lovable Cloud]`);
console.log(`  candidate (no writes): ${targets.candidateProduction.projectRef} [owner Supabase]`);
console.log(`  excluded permanently:  ${OWNER_LOCKED.permanentlyExcludedRef}`);
console.log("  production deploy:     DISABLED");
