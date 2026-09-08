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
 * Run against a faithful copy of the production ledger on 2026-09-08, the real
 * CLI answered:
 *
 *   as the repo stands        LegacyDbPushMissingLocalError — five REMOTE-only
 *                             versions have no local file, so the push refuses
 *                             to run at all
 *   with those five present   "Would push: 20261101090000_sp_selected_merit_
 *                             sharing.sql" — a re-run of a migration already
 *                             applied
 *   with the ledger alias     "Local database is up to date."
 *
 * So the protection everyone believed was in place was an ERROR, and the
 * moment somebody resolves that error the migration runs a second time.
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
// Exactly what the plan looked like when this check was written, and why each
// entry is there. Anything NOT on these lists is a new divergence and fails
// `deploy-plan:check` immediately; everything on them still fails
// `deploy-plan:gate`, because a deploy must not run in this state at all.
//
// Clearing these lists is the point of the owner action in
// docs/release/2026-09-08-deploy-plan-and-ledger-alias.md. They are not a
// permission to ship; they are a named, dated debt with an owner.
const BASELINE_APPLY: readonly string[] = ["20261101090000_sp_selected_merit_sharing.sql"];
const BASELINE_BLOCK: readonly string[] = [
  "20260904190901 (scp_trust_evidence_report_r1_provenance)",
  "20260907064303 (f8efc1c3-def4-4147-9db1-45a68b1f6a69)",
  "20260907064513 (19c76abb-f1fd-40e5-aa50-b008b7de38bf)",
  "20260907064849 (0bb96516-c1eb-4178-8e9e-60bde13071dd)",
  "20260908043205 (b315714c-89df-4610-9dd0-7b55207229a7)",
];

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
