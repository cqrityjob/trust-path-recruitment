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
  retired?: Array<{ projectRef: ProjectRef; reason: string; supersededBy?: ProjectRef }>;
  excluded: Array<{ projectRef: ProjectRef; reason: string }>;
}

interface MigrationPolicy {
  canonicalProject?: { lovableProject?: string; hostedSupabaseRef?: string };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];

const OWNER_LOCKED = {
  lovableProjectId: "9ec625ef-34a1-4b4b-8cbb-712cae168579",
  // 2026-08-29 runtime cutover. Until this date the live runtime was the Lovable
  // Cloud project zrahptwsnjcdyzfywbeh and the guard's whole job was to keep the
  // runtime OFF the owner project. The owner then completed the data and Storage
  // migration and permanently disconnected/deleted zrah, so the single canonical
  // backend for both runtime and schema is now wrygicdfxwjnrugduxnt.
  currentLiveRef: "wrygicdfxwjnrugduxnt",
  // The owner schema target. This was vcgwvtmzftmulmoxmufv until 2026-08-29.
  //
  // vcgw was the INTENDED target in the 2026-08-28 bootstrap runbook, and its
  // canonical bootstrap FAILED partway through the migration history that same
  // day. The owner then recorded a successful fresh bootstrap on wryg at 21:43
  // in release-state.json, with a GitHub check run id and a verified 225-row
  // ledger through 20260925090000. The later outcome record wins over the
  // earlier plan, and this lock now names the project that actually holds the
  // canonical history rather than the one that was supposed to.
  candidateProductionRef: "wrygicdfxwjnrugduxnt",
  // Named so they can never quietly return as targets. A retired project is not
  // the same as an excluded one: vcgw was legitimately attempted and failed,
  // zrah was the real former runtime and is now deleted, mlvz was never ours to
  // write to at all.
  retiredSchemaTargetRef: "vcgwvtmzftmulmoxmufv",
  retiredRuntimeRef: "zrahptwsnjcdyzfywbeh",
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

// v2 added `retired` and the evidence fields when the schema target was
// corrected from the failed vcgw bootstrap to wryg. v3 records the completed
// 2026-08-29 runtime cutover: runtime and schema are the same owner project and
// the former Lovable Cloud runtime is retired.
if (targets.schemaVersion !== 3) {
  fail(`unsupported deployment-targets schemaVersion ${targets.schemaVersion}`);
}
if (targets.lovableProjectId !== OWNER_LOCKED.lovableProjectId) {
  fail(`Lovable project identity changed: expected ${OWNER_LOCKED.lovableProjectId}`);
}
if (targets.currentLive.projectRef !== OWNER_LOCKED.currentLiveRef) {
  fail(`current-live ref changed: expected ${OWNER_LOCKED.currentLiveRef}`);
}
if (targets.candidateProduction.projectRef !== OWNER_LOCKED.candidateProductionRef) {
  fail(`candidate-production ref changed: expected ${OWNER_LOCKED.candidateProductionRef}`);
}
if (!targets.excluded.some((entry) => entry.projectRef === OWNER_LOCKED.permanentlyExcludedRef)) {
  fail(`permanently excluded ref ${OWNER_LOCKED.permanentlyExcludedRef} is missing`);
}
// The failed bootstrap target and the deleted former runtime must both stay
// recorded as retired. Dropping an entry is how a project would silently become
// available again.
for (const retiredRef of [
  OWNER_LOCKED.retiredSchemaTargetRef,
  OWNER_LOCKED.retiredRuntimeRef,
] as const) {
  if (!(targets.retired ?? []).some((e) => e.projectRef === retiredRef)) {
    fail(`retired project ${retiredRef} must stay recorded as retired, not removed`);
  }
  if (targets.writeTargetRef === retiredRef) {
    fail(`${retiredRef} is RETIRED; it may never be a write target again`);
  }
}

const allRefs = [
  // Post-cutover the runtime and the schema target are deliberately the same
  // project, so only distinctness against retired/excluded classes is checked.
  ...new Set([targets.currentLive.projectRef, targets.candidateProduction.projectRef]),
  ...targets.excluded.map((entry) => entry.projectRef),
  ...(targets.retired ?? []).map((entry) => entry.projectRef),
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

if (targets.releaseMode === "cutover_complete") {
  if (targets.writeTargetRef !== OWNER_LOCKED.candidateProductionRef) {
    fail(`post-cutover writeTargetRef must be ${OWNER_LOCKED.candidateProductionRef}`);
  }
  if (targets.candidateProduction.state !== "live_production") {
    fail(
      `candidate production state must be live_production after cutover, got ${targets.candidateProduction.state}`,
    );
  }
  if (targets.candidateProduction.writePolicy !== "supabase_github_integration_only") {
    fail("schema writes must remain restricted to the official Supabase GitHub integration");
  }
  if (targets.currentLive.kind !== "owned_supabase") {
    fail("after cutover the live runtime must be the owner-controlled Supabase project");
  }
} else {
  fail(
    `releaseMode ${targets.releaseMode} is no longer valid: the 2026-08-29 runtime cutover is complete and irreversible`,
  );
}

// Every runtime identifier must name the one canonical project. A URL from one
// project with a publishable key minted for another is exactly the failure that
// broke login on 2026-08-29, so the key's `ref` claim is checked too.
const expectedLiveUrl = `https://${OWNER_LOCKED.currentLiveRef}.supabase.co`;
for (const key of ["SUPABASE_PROJECT_ID", "VITE_SUPABASE_PROJECT_ID"] as const) {
  if (appEnv.get(key) !== OWNER_LOCKED.currentLiveRef) {
    fail(`${key} must be ${OWNER_LOCKED.currentLiveRef}`);
  }
}
for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const) {
  if (appEnv.get(key) !== expectedLiveUrl) {
    fail(`${key} must be ${expectedLiveUrl}`);
  }
}
for (const key of ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const) {
  const value = appEnv.get(key) ?? "";
  if (!value) {
    fail(`${key} is missing`);
    continue;
  }
  if (value.includes(OWNER_LOCKED.retiredRuntimeRef)) {
    fail(`${key} still contains the retired runtime ref ${OWNER_LOCKED.retiredRuntimeRef}`);
  }
  // Legacy JWT anon keys carry a base64url `"ref":"<project>"` claim; new-format
  // sb_publishable_ keys are opaque and can only be checked for absence of zrah.
  const parts = value.split(".");
  if (parts.length === 3) {
    let claimRef: string | undefined;
    try {
      claimRef = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).ref;
    } catch {
      fail(`${key} is a malformed JWT-format publishable key`);
    }
    if (claimRef && claimRef !== OWNER_LOCKED.currentLiveRef) {
      fail(`${key} belongs to project ${claimRef}, not ${OWNER_LOCKED.currentLiveRef}`);
    }
  } else if (!/^sb_publishable_/.test(value)) {
    fail(`${key} is neither a JWT anon key nor an sb_publishable_ key`);
  }
  if (/^sb_secret_|service_role/.test(value)) {
    fail(`${key} must never hold a secret or service-role key`);
  }
}
if (!configToml.includes(`project_id = "${OWNER_LOCKED.currentLiveRef}"`)) {
  fail(`supabase/config.toml must name ${OWNER_LOCKED.currentLiveRef}`);
}
if (migrationPolicy.canonicalProject?.hostedSupabaseRef !== OWNER_LOCKED.currentLiveRef) {
  fail(`migrations-policy canonicalProject must be ${OWNER_LOCKED.currentLiveRef}`);
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
    fail(
      `${file} contains a hosted Supabase write/link command; use the official Supabase GitHub integration`,
    );
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
if (processTarget && processTarget !== targets.writeTargetRef) {
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
