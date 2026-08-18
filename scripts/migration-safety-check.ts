/**
 * Canonical migration safety guard.
 *
 * A comment in a .sql file cannot stop `supabase db push`, a CI job or an
 * agent from executing it. This script is the enforcement that a comment is
 * not: it fails the build when the repository's migration set drifts from the
 * policy recorded in supabase/migrations-policy.json.
 *
 * It deliberately does NOT try to be a migration framework. It answers five
 * questions and nothing else:
 *
 *   1. Does any numeric version appear twice in the active path?
 *   2. Is a parked migration back in the active path?
 *   3. Does every parked / never-replay file still exist where policy says?
 *   4. Has a never-replay file been edited since it was pinned?
 *   5. Does every active file have a well-formed, ordered version prefix?
 *
 * Run: bun run migrations:check
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Parked = { version: string; file: string; reason: string };
type NeverReplay = Parked & { protection?: string; sha256?: string };
type Policy = {
  activeDirectory: string;
  parkedDirectory: string;
  parked: Parked[];
  neverReplay: NeverReplay[];
  approvedDuplicateVersions: { version: string; pairedWith: string; reason: string }[];
  hostedLedgerOverrides: { file: string; hostedVersion: string; reason: string }[];
};

const ROOT = process.cwd();
const POLICY_PATH = join(ROOT, "supabase/migrations-policy.json");
const failures: string[] = [];
const notes: string[] = [];

function fail(msg: string) {
  failures.push(msg);
}

const policy: Policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
const activeDir = join(ROOT, policy.activeDirectory);
const parkedDir = join(ROOT, policy.parkedDirectory);

const activeFiles = readdirSync(activeDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// --- 1 + 5. Version shape and uniqueness -----------------------------------
const approved = new Set(policy.approvedDuplicateVersions.map((d) => d.version));
const seen = new Map<string, string[]>();

for (const file of activeFiles) {
  const version = file.split("_")[0];
  if (!/^\d{14}$/.test(version)) {
    fail(`Malformed version prefix: ${file} (expected 14 digits, got "${version}")`);
    continue;
  }
  seen.set(version, [...(seen.get(version) ?? []), file]);
}

for (const [version, files] of seen) {
  if (files.length > 1 && !approved.has(version)) {
    fail(
      `Duplicate migration version ${version} in the active path:\n` +
        files.map((f) => `      - ${f}`).join("\n") +
        `\n      Supabase keys the ledger by version, so two files cannot both be version ${version}.` +
        `\n      Either rename one, or record the pair in approvedDuplicateVersions with a reason.`,
    );
  }
}

// --- 2 + 3. Parked migrations stay parked ----------------------------------
for (const entry of policy.parked) {
  const inActive = join(activeDir, entry.file);
  const inParked = join(parkedDir, entry.file);

  if (existsSync(inActive)) {
    fail(
      `PARKED MIGRATION IS BACK IN THE ACTIVE PATH: ${entry.file}\n` +
        `      ${entry.reason}\n` +
        `      Move it back to ${policy.parkedDirectory}/ or change the policy deliberately.`,
    );
  }
  if (!existsSync(inParked)) {
    fail(
      `Parked migration is missing from ${policy.parkedDirectory}/: ${entry.file}\n` +
        `      Parking preserves history. A parked file must never be deleted.`,
    );
  }
}

// --- 4. Never-replay files are pinned --------------------------------------
for (const entry of policy.neverReplay) {
  const path = join(activeDir, entry.file);
  if (!existsSync(path)) {
    fail(
      `never-replay migration is missing from the active path: ${entry.file}\n` +
        `      It is required for a linear replay and must not be deleted.`,
    );
    continue;
  }
  const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (!entry.sha256) {
    notes.push(`  pin  ${entry.file}\n       sha256 ${sha}  (record this in migrations-policy.json)`);
  } else if (entry.sha256 !== sha) {
    fail(
      `never-replay migration was EDITED: ${entry.file}\n` +
        `      pinned  ${entry.sha256}\n` +
        `      actual  ${sha}\n` +
        `      ${entry.reason}\n` +
        `      This file is already applied in production. Editing it changes what a replay` +
        `\n      produces without changing production, which is how the two silently diverge.`,
    );
  }
}

// --- Hosted ledger overrides are informational, but must still exist -------
for (const entry of policy.hostedLedgerOverrides) {
  if (!existsSync(join(activeDir, entry.file))) {
    fail(`hostedLedgerOverrides names a file that does not exist: ${entry.file}`);
  }
}

// --- Report ----------------------------------------------------------------
console.log(`migration-safety-check: ${activeFiles.length} active migrations`);
console.log(`  parked:       ${policy.parked.length}`);
console.log(`  never-replay: ${policy.neverReplay.length}`);
console.log(`  approved dup: ${policy.approvedDuplicateVersions.length}`);
if (notes.length) console.log(notes.join("\n"));

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} migration-safety violation(s)\n`);
  for (const f of failures) console.error(`  !!  ${f}\n`);
  process.exit(1);
}
console.log("OK: migration set matches policy.");
