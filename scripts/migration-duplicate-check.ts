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
 * That particular duplicate is HARMLESS — the migration is written idempotently
 * throughout and carries no data statements, so applying it twice changes
 * nothing and a clean replay passes. But it was harmless by luck, not by
 * design, and nothing in CI would have said otherwise.
 *
 * This guard enforces the single-writer rule: it hashes every ACTIVE
 * migration's SQL (ignoring comments and whitespace, so a re-indent is not a
 * false alarm) and fails whenever two files share a hash. Lovable's generated
 * UUID/version belongs in migrations-policy.json as appliedThroughLovable
 * deployment evidence; it must not remain as a second active migration.
 *
 * Run: bun run scripts/migration-duplicate-check.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface Policy {
  readonly activeDirectory: string;
}

const policy = JSON.parse(readFileSync("supabase/migrations-policy.json", "utf8")) as Policy;
const dir = policy.activeDirectory;

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

const findings: string[] = [];
let duplicateGroups = 0;

for (const [hash, group] of byHash) {
  if (group.length < 2) continue;
  duplicateGroups += 1;
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      findings.push(
        `${group[i]}\n      and ${group[j]}\n      contain the same active SQL (${hash.slice(0, 12)}…).\n\n` +
          `      Keep the GitHub canonical file active. If the other file is a Lovable\n` +
          `      re-issue, record its hosted UUID/version under appliedThroughLovable\n` +
          `      and remove the generated copy from the active migration directory.`,
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
console.log("  active duplicate pairs:     0");
