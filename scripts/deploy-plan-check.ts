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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = process.argv.includes("--gate");

/**
 * Where the three inputs are read from.
 *
 * The repository, unless `--root <dir>` names somewhere else. That flag
 * exists for exactly one caller -- scripts/deploy-plan-negative-control.ts,
 * which builds fixture directories to prove this check FAILS on an
 * unreviewed migration and on a stale pending entry. A guard nobody has seen
 * fail is a guard nobody should believe, and the only way to see this one
 * fail is to feed it a world where it should.
 *
 * It changes no rule and relaxes no comparison: same code, different files.
 */
const rootFlag = process.argv.indexOf("--root");
const root = rootFlag === -1 ? repoRoot : path.resolve(process.argv[rootFlag + 1]);

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
// ── WHY THE APPLY BASELINE IS DERIVED AND NOT TYPED ────────────────────
//
// It used to be a hand-written empty array, and that was right for a steady
// state and wrong the first time a genuinely new migration appeared: the
// check failed with "NEW local-only migration would be APPLIED", which is
// TRUE and is not a defect. The honest fix is not to add the filename here --
// a second hand-maintained list is a second place to forget -- but to say
// where the reviewed answer already lives.
//
// `release-state.json` is that place. A migration recorded `pending` there is
// one somebody has written a note, a rollback path and a hosted verification
// query for. So the expected plan IS the pending set, and the check becomes a
// CROSS-EXAMINATION of two independently maintained records:
//
//   in the plan, not pending    an unreviewed migration would be applied.
//                               Fails. This is the case the guard exists for.
//   pending, not in the plan    release-state still says "waiting" for
//                               something the ledger shows as applied. Fails,
//                               because a stale entry hides the next real one
//                               behind it.
//
// Neither list can drift without the other noticing, and neither can be
// silenced by editing this file.
//
// The BLOCK baseline stays hand-written and empty. A hosted row with no local
// file makes `db push` refuse for EVERY migration, and there is no state of
// release-state.json that should ever make that expected.
interface FrontierEntry {
  readonly file: string;
  readonly hostedState: "applied" | "pending" | "unverified";
}
const frontier = (
  JSON.parse(readFileSync(path.join(root, "supabase/release-state.json"), "utf8")) as {
    frontier: readonly FrontierEntry[];
  }
).frontier;

const BASELINE_APPLY: readonly string[] = frontier
  .filter((e) => e.hostedState === "pending")
  .map((e) => e.file)
  .sort();
const BASELINE_BLOCK: readonly string[] = [];

const ageDays = Math.floor((Date.now() - Date.parse(snapshot.readAt)) / (1000 * 60 * 60 * 24));

console.log("deploy plan — what `supabase db push` would do next\n");
console.log(
  `  ledger snapshot : ${snapshot.projectRef}, read ${snapshot.readAt} (${ageDays}d old)`,
);
console.log(`  source          : ${snapshot.source}`);
console.log(`  local files     : ${localFiles.length}`);
console.log(`  ledger rows     : ${snapshot.versions.length}`);
console.log(
  `  reviewed plan   : ${
    BASELINE_APPLY.length === 0
      ? "empty (release-state.json records nothing pending)"
      : `${BASELINE_APPLY.length} pending in release-state.json`
  }\n`,
);

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
    `UNREVIEWED local-only migration would be APPLIED: ${f}\n` +
      "      It is not recorded `pending` in supabase/release-state.json, so nobody\n" +
      "      has written down what it introduces, how it is verified hosted, or how\n" +
      "      it rolls back. If it is genuinely new, add that entry. If it is already\n" +
      "      applied under another identity, the ledger needs its canonical alias\n" +
      "      before any deploy runs.",
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
  failures.push(
    `STALE pending entry: ${f}\n` +
      "      release-state.json still records it `pending`, but the hosted ledger\n" +
      "      already has it. Move it to `applied` with evidence -- a resolved entry\n" +
      "      left in the list hides the next real one behind it.",
  );
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
