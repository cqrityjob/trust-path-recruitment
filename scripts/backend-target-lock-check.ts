/**
 * CQrityjob backend target lock.
 *
 * The repository is moving from the Lovable Cloud backend to an owner-controlled
 * Supabase project. The critical failure mode is a correct migration reaching
 * the wrong project, or the application moving before its replacement backend
 * has been proven.
 *
 * This guard is credential-free and performs no network access. It locks the
 * immutable project identities and enforces the currently authorised release
 * phase. During schema bootstrap the shipping application MUST still use the
 * existing Lovable Cloud backend; only Supabase's official GitHub integration
 * may bootstrap the owner project.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ProjectRef = string;

type ReleaseMode = "transition_preparation" | "bootstrap_authorised" | "cutover_complete";

interface DeploymentTargets {
  schemaVersion: number;
  releaseMode: ReleaseMode;
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

const targets = JSON.parse(read("supabase/deployment-targets.json")) as DeploymentTargets;
const migrationPolicy = JSON.parse(read("supabase/migrations-policy.json")) as MigrationPolicy;
const appEnv = parseEnv(read(".env"));
const configToml = read("supabase/config.toml");

if (targets.schemaVersion !== 1) {
  fail(`unsupported deployment-targets schemaVersion ${targets.schemaVersion}`);
}
if (targets.lovableProjectId !== OWNER_LOCKED.lovableProjectId) {
  fail(`Lovable project identity changed: expected ${OWNER_LOCKED.lovableProjectId}`);
}
if (targets.currentLive.projectRef !== OWNER_LOCKED.currentLiveRef) {
  fail(`current-live ref changed before cutover: expected ${OWNER_LOCKED.currentLiveRef}`);
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
if (new Set(allRefs).size !== allRefs.length) {
  fail("a Supabase project appears in more than one target class");
}
if (allRefs.some((ref) => !/^[a-z]{20}$/.test(ref))) {
  fail("every Supabase project ref must be exactly 20 lowercase letters");
}
if (targets.verificationStrategy !== "github_ci_disposable_postgres") {
  fail("transition verification must use the existing disposable-Postgres GitHub CI path");
}

if (targets.releaseMode === "transition_preparation") {
  if (targets.automaticProductionDeployEnabled) {
    fail("automatic production deployment must remain disabled during preparation");
  }
  if (targets.writeTargetRef !== null) {
    fail("writeTargetRef must remain null until an owner-approved bootstrap PR");
  }
  if (targets.candidateProduction.state !== "provisioned_empty") {
    fail(
      `candidate production must remain recorded as provisioned_empty during preparation, got ${targets.candidateProduction.state}`,
    );
  }
} else if (targets.releaseMode === "bootstrap_authorised") {
  if (!targets.automaticProductionDeployEnabled) {
    fail("bootstrap_authorised must declare Supabase production deployment enabled");
  }
  if (targets.writeTargetRef !== OWNER_LOCKED.candidateProductionRef) {
    fail(`bootstrap writeTargetRef must be ${OWNER_LOCKED.candidateProductionRef}`);
  }
  if (targets.candidateProduction.state !== "schema_bootstrap_authorised") {
    fail(
      `candidate production state must be schema_bootstrap_authorised, got ${targets.candidateProduction.state}`,
    );
  }
  if (targets.candidateProduction.writePolicy !== "supabase_github_integration_only") {
    fail("bootstrap writes must be restricted to the official Supabase GitHub integration");
  }
} else {
  fail("cutover_complete is intentionally unsupported by this guard until the final cutover PR");
}

// The application remains on Lovable Cloud throughout preparation and schema
// bootstrap. Moving any of these values before end-to-end UAT is a stop condition.
const expectedLiveUrl = `https://${OWNER_LOCKED.currentLiveRef}.supabase.co`;
for (const key of ["SUPABASE_PROJECT_ID", "VITE_SUPABASE_PROJECT_ID"] as const) {
  if (appEnv.get(key) !== OWNER_LOCKED.currentLiveRef) {
    fail(`${key} must still point to current live until the cutover PR`);
  }
}
for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const) {
  if (appEnv.get(key) !== expectedLiveUrl) {
    fail(`${key} must still point to current live until the cutover PR`);
  }
}
if (!configToml.includes(`project_id = "${OWNER_LOCKED.currentLiveRef}"`)) {
  fail("supabase/config.toml must remain on the live backend until the cutover PR");
}
if (migrationPolicy.canonicalProject?.hostedSupabaseRef !== OWNER_LOCKED.currentLiveRef) {
  fail("migrations-policy canonicalProject remains the current live backend until cutover");
}
if (migrationPolicy.canonicalProject?.lovableProject !== OWNER_LOCKED.lovableProjectId) {
  fail("migrations-policy Lovable project identity does not match the owner lock");
}

// No repository workflow may use Supabase CLI hosted-write commands during this
// transition. Schema bootstrap is intentionally delegated to the Supabase
// project-level GitHub integration, whose target is fixed in the dashboard.
const workflowDir = path.join(root, ".github/workflows");
const hostedWritePattern = /\bsupabase\s+(?:link|db\s+push|migration\s+repair)\b/i;
for (const file of readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))) {
  const source = readFileSync(path.join(workflowDir, file), "utf8");
  if (hostedWritePattern.test(source)) {
    fail(`${file} contains a hosted Supabase write/link command; use the official Supabase GitHub integration`);
  }
  if (source.includes(OWNER_LOCKED.permanentlyExcludedRef)) {
    fail(`${file} references the permanently excluded Supabase project`);
  }
}

// Bun loads the tracked .env automatically, so SUPABASE_PROJECT_ID is the
// runtime backend. Any runner-level schema target, if present, must name only
// the candidate owner project and can never silently point at live or excluded.
const processTarget = process.env.CQ_SCHEMA_WRITE_TARGET_REF;
if (processTarget && processTarget !== OWNER_LOCKED.candidateProductionRef) {
  fail(
    `runner CQ_SCHEMA_WRITE_TARGET_REF is ${processTarget}; only ${OWNER_LOCKED.candidateProductionRef} is permitted`,
  );
}
if (targets.releaseMode === "bootstrap_authorised" && processTarget && processTarget !== targets.writeTargetRef) {
  fail("runner schema target and deployment-target registry disagree");
}

if (failures.length > 0) {
  console.error("BACKEND TARGET LOCK: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("BACKEND TARGET LOCK: PASS");
console.log(`  release mode:           ${targets.releaseMode}`);
console.log(`  live runtime unchanged: ${targets.currentLive.projectRef} [Lovable Cloud]`);
console.log(`  owner schema target:    ${targets.candidateProduction.projectRef}`);
console.log(`  excluded permanently:   ${OWNER_LOCKED.permanentlyExcludedRef}`);
console.log(
  `  Supabase production deploy: ${targets.automaticProductionDeployEnabled ? "AUTHORISED FOR SCHEMA BOOTSTRAP" : "DISABLED"}`,
);
