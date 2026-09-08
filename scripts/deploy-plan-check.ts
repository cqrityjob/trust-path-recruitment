/**
 * What would the next deploy actually DO?
 *
 * ── WHY THIS EXISTS, AND WHY THE OTHER GUARDS WERE NOT ENOUGH ────────────
 *
 * `migrations-policy.json` records that 20261101090000 was applied hosted
 * under Lovable's generated identity 20260908043205, marks it
 * `doNotReExecute`, and removes the generated duplicate from the active path.
 * `release-state.json` records it `applied` with evidence. Both are true and
 * both are useful.
 *
 * Neither is executable. `doNotReExecute` is a field this repository's own
 * guards read; the thing that actually deploys migrations — the Supabase
 * GitHub integration, i.e. `supabase db push` — has never heard of it. It
 * decides from exactly one comparison: local files in supabase/migrations
 * against the versions in supabase_migrations.schema_migrations.
 *
 * Before the owner-approved history repair on 2026-09-08, the real CLI
 * answered:
 *
 *   as the repo stands        LegacyDbPushMissingLocalError — five REMOTE-only
 *                             versions have no local file, so the push refuses
 *                             to run at all
 *   with those five present   "Would push: 20261101090000_sp_selected_merit_
 *                             sharing.sql" — a re-run of a migration already
 *                             applied
 *   with the ledger alias     "Local database is up to date."
 *
 * The repair recorded the canonical alias and restored the five remote
 * identities as comment-only local markers. The standing requirement is now
 * an empty plan: no missing local identity and no migration selected to run.
 *
 * This script is the executable answer. It reads a committed READ-ONLY
 * snapshot of the hosted ledger and reproduces `db push`'s selection rule, so
 * the deploy plan is a fact printed on every CI run instead of a belief.
 *
 * ── IT REACHES NOTHING ───────────────────────────────────────────────────
 *
 * No credentials, no network, no database — the same rule the rest of the
 * release guards follow. The snapshot is evidence somebody read once and
 * committed; the check says how old it is, because a stale snapshot answers
 * confidently about a database that has moved on.
 *
 * ── TWO MODES, THE SAME PATTERN release-parity ALREADY USES ──────────────
 *
 *   deploy-plan:check   prints the plan; fails only if it differs from the
 *                       reviewed baseline below. Safe to run in CI while a
 *                       known divergence is waiting for an owner decision.
 *   deploy-plan:gate    fails unless the plan is EMPTY. This is the release
 *                       condition, and it is what must pass before anyone
 *                       lets the integration run.
 *
 * Run: bun run deploy-plan:check   /   bun run deploy-plan:gate
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = process.argv.includes("--gate");

interface Snapshot {
  readonly source: string;
  readonly projectRef: string;
  readonly readAt: string;
  readonly versions: readonly { version: string; name: string }[];
}

const snapshot = JSON.parse(
  readFileSync(path.join(root, "supabase/hosted-ledger.json"), "utf8"),
) as Snapshot;

const policy = JSON.parse(
  readFileSync(path.join(root, "supabase/migrations-policy.json"), "utf8"),
) as { activeDirectory: string };

const localFiles = readdirSync(path.join(root, policy.activeDirectory))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const localVersions = new Map(localFiles.map((f) => [f.slice(0, 14), f]));
const remoteVersions = new Set(snapshot.versions.map((v) => v.version));

/** Local file, no ledger row. `db push` APPLIES these. */
const wouldApply = [...localVersions.entries()]
  .filter(([version]) => !remoteVersions.has(version))
  .map(([, file]) => file)
  .sort();

/** Ledger row, no local file. `db push` REFUSES TO RUN while any exists. */
const wouldBlock = snapshot.versions
  .filter((v) => !localVersions.has(v.version))
  .map((v) => `${v.version} (${v.name})`)
  .sort();

/* ------------------------------------------------------------------ */
/* The reviewed baseline                                               */
/* ------------------------------------------------------------------ */
//
// Empty is the steady state after the owner-approved reconciliation. A local
// file missing from the hosted ledger would be selected for apply; a hosted
// version missing locally would make db push refuse. Either is a failure.
const BASELINE_APPLY: readonly string[] = [];
const BASELINE_BLOCK: readonly string[] = [];

const ageDays = Math.floor((Date.now() - Date.parse(snapshot.readAt)) / (1000 * 60 * 60 * 24));

console.log("deploy plan — what `supabase db push` would do next\n");
console.log(
  `  ledger snapshot : ${snapshot.projectRef}, read ${snapshot.readAt} (${ageDays}d old)`,
);
console.log(`  source          : ${snapshot.source}`);
console.log(`  local files     : ${localFiles.length}`);
console.log(`  ledger rows     : ${snapshot.versions.length}\n`);

if (wouldBlock.length > 0) {
  console.log("  WOULD REFUSE TO RUN — ledger rows with no local file:");
  for (const v of wouldBlock) console.log(`    - ${v}`);
  console.log(
    "\n    The CLI reports LegacyDbPushMissingLocalError and applies nothing at\n" +
      "    all. Nothing downstream of this is reached, including the list below.\n",
  );
}

if (wouldApply.length > 0) {
  console.log("  WOULD APPLY — local files with no ledger row:");
  for (const f of wouldApply) console.log(`    - ${f}`);
  console.log("");
} else {
  console.log("  WOULD APPLY — nothing.\n");
}

const newApply = wouldApply.filter((f) => !BASELINE_APPLY.includes(f));
const newBlock = wouldBlock.filter((v) => !BASELINE_BLOCK.includes(v));
const goneApply = BASELINE_APPLY.filter((f) => !wouldApply.includes(f));
const goneBlock = BASELINE_BLOCK.filter((v) => !wouldBlock.includes(v));

const failures: string[] = [];

if (GATE && (wouldApply.length > 0 || wouldBlock.length > 0)) {
  failures.push("the deploy plan is not empty; a migration deploy must not be run in this state");
}

for (const f of newApply) {
  failures.push(
    `NEW local-only migration would be APPLIED: ${f}\n` +
      "      If it is genuinely new, that is correct and it belongs in the release\n" +
      "      sequence. If it is already applied under another identity, the ledger\n" +
      "      needs its canonical alias before any deploy runs.",
  );
}
for (const v of newBlock) {
  failures.push(
    `NEW ledger row with no local file: ${v}\n` +
      "      Every deploy refuses while this is true, for every migration, not just\n" +
      "      this one.",
  );
}
// A baseline entry that has gone is good news, and it still has to be recorded:
// leaving a resolved entry in the list hides the next real one behind it.
for (const f of goneApply) {
  failures.push(`baseline entry no longer applies and must be removed: ${f}`);
}
for (const v of goneBlock) {
  failures.push(`baseline entry no longer blocks and must be removed: ${v}`);
}

if (failures.length > 0) {
  console.error(`deploy-plan-check FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

if (wouldApply.length > 0 || wouldBlock.length > 0) {
  console.log(
    "  Plan matches the reviewed baseline. It is NOT empty, so this is not a\n" +
      "  release-ready state: see docs/release/2026-09-08-deploy-plan-and-ledger-alias.md\n" +
      "  for the owner action that clears it. `deploy-plan:gate` fails until then.",
  );
} else {
  console.log("  Plan is empty. A deploy would apply nothing and refuse nothing.");
}
