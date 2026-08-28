/**
 * Migration content-duplicate detection.
 *
 * Lovable applies migrations under its own generated filenames and syncs them
 * back, so the repository periodically gains a second file containing the same
 * DDL as a canonical one. That happened on 2026-08-27:
 * 20260827112444_58fc45db-….sql is byte-identical to
 * 20260917090000_superadmin_permanent_account_deletion.sql apart from a
 * trailing newline.
 *
 * The repository also contains a closed set of older generated copies whose
 * historical execution order is required by later generated migrations. They
 * are grandfathered explicitly in migrations-policy.json; they are not a
 * precedent for accepting another schema writer. A terminal reconciliation
 * migration makes the affected legacy seed events deterministic.
 *
 * This guard makes the class visible: it hashes every migration's SQL (ignoring
 * comments and whitespace, so a re-indent is not a false alarm) and fails when
 * two files share a hash unless the pair is explicitly recorded in
 * migrations-policy.json. Recording one is then a deliberate diff a human
 * approves. New duplicates must use the canonical migration plus
 * appliedThroughLovable evidence model and must not be added to the legacy set.
 *
 * Run: bun run scripts/migration-duplicate-check.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface DuplicatePair {
  readonly canonical: string;
  readonly duplicate: string;
  readonly reason: string;
  readonly decidedIn?: string;
}

interface Policy {
  readonly activeDirectory: string;
  readonly contentDuplicates?: readonly DuplicatePair[];
}

const policy = JSON.parse(readFileSync("supabase/migrations-policy.json", "utf8")) as Policy;
const dir = policy.activeDirectory;
const recorded = policy.contentDuplicates ?? [];

/**
 * Normalise before hashing: strip line comments, block comments and all
 * whitespace. Two files that differ only by a trailing newline, an indent or a
 * comment ARE the same migration, and a guard that misses that is no guard.
 */
function normalise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const byHash = new Map<string, string[]>();

for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  const body = normalise(sql);
  // A migration whose entire body is comments has nothing to duplicate.
  if (body.length < 40) continue;
  const hash = createHash("sha256").update(body).digest("hex");
  const list = byHash.get(hash);
  if (list) list.push(file);
  else byHash.set(hash, [file]);
}

const isRecorded = (a: string, b: string): boolean =>
  recorded.some(
    (p) =>
      (p.canonical === a && p.duplicate === b) || (p.canonical === b && p.duplicate === a),
  );

const findings: string[] = [];
let duplicateGroups = 0;

for (const [hash, group] of byHash) {
  if (group.length < 2) continue;
  duplicateGroups += 1;
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      if (isRecorded(group[i], group[j])) continue;
      findings.push(
        `${group[i]}\n      and ${group[j]}\n      contain the same SQL (${hash.slice(0, 12)}…) but are not recorded as a\n      content duplicate in supabase/migrations-policy.json.\n\n` +
          `      If this is a Lovable re-issue of a canonical migration, add it to\n` +
          `      "contentDuplicates" with the reason. If it is NOT, one of them is an\n` +
          `      accidental copy and should be removed before it reaches the ledger.`,
      );
    }
  }
}

// Every recorded pair must still exist and still be identical — a stale record
// is as misleading as a missing one.
for (const pair of recorded) {
  const both = [pair.canonical, pair.duplicate];
  for (const f of both) {
    if (!files.includes(f)) {
      findings.push(
        `migrations-policy.json records a content duplicate involving ${f}, which no longer exists.`,
      );
    }
  }
  if (both.every((f) => files.includes(f))) {
    const [a, b] = both.map((f) => normalise(readFileSync(join(dir, f), "utf8")));
    if (a !== b) {
      findings.push(
        `${pair.canonical} and ${pair.duplicate} are recorded as content duplicates but have DIVERGED. ` +
          `One of them has been edited; the ledger no longer describes reality.`,
      );
    }
  }
}

if (findings.length > 0) {
  console.error(`\nmigration-duplicate-check FAILED (${findings.length} finding(s)):\n`);
  for (const f of findings) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}

console.log("migration-duplicate-check passed");
console.log(`  migrations hashed:          ${files.length}`);
console.log(`  identical content groups:   ${duplicateGroups}`);
console.log(`  recorded (approved) pairs:  ${recorded.length}`);
