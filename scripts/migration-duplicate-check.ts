/**
 * Migration content-duplicate detection — zero-tolerance form.
 *
 * Lovable applies migrations under its own generated filenames and syncs them
 * back, so the repository periodically gains a second file containing the same
 * DDL as a canonical one. Until 2026-08-28 a "closed legacy set" of 18 such
 * copies was allowlisted in migrations-policy.json contentDuplicates and
 * tolerated in the active path; the strict replay contract retired that set to
 * supabase/archive/parked-migrations/ (policy "parked" entries, each with its
 * canonicalReplacement and hosted evidence), and this guard no longer accepts
 * ANY allowlist.
 *
 * It fails when:
 *   1. two ACTIVE migrations share the same comment/whitespace-normalised SQL
 *      — there is no approved-pair escape hatch any more;
 *   2. an ACTIVE migration's normalised SQL matches a PARKED migration that is
 *      not its recorded canonicalReplacement — i.e. a parked file has come
 *      back under a new name;
 *   3. a parked entry recorded as equivalence "identical" has DIVERGED from
 *      its canonical replacement — one of them was edited, so the evidence
 *      record no longer describes reality.
 *
 * Run: bun run scripts/migration-duplicate-check.ts
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface ParkedEntry {
  readonly version: string;
  readonly file: string;
  readonly canonicalReplacement?: readonly string[];
  readonly equivalence?: string;
  readonly reason: string;
}

interface Policy {
  readonly activeDirectory: string;
  readonly parkedDirectory: string;
  readonly parked: readonly ParkedEntry[];
}

const policy = JSON.parse(readFileSync("supabase/migrations-policy.json", "utf8")) as Policy;

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

const hashOf = (dir: string, file: string): string =>
  createHash("sha256").update(normalise(readFileSync(join(dir, file), "utf8"))).digest("hex");

const activeFiles = readdirSync(policy.activeDirectory)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const parkedFiles = readdirSync(policy.parkedDirectory)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const findings: string[] = [];

// --- 1. No two active migrations may share content --------------------------
const activeByHash = new Map<string, string[]>();
for (const file of activeFiles) {
  const sql = readFileSync(join(policy.activeDirectory, file), "utf8");
  const body = normalise(sql);
  // A migration whose entire body is comments has nothing to duplicate.
  if (body.length < 40) continue;
  const hash = createHash("sha256").update(body).digest("hex");
  const list = activeByHash.get(hash);
  if (list) list.push(file);
  else activeByHash.set(hash, [file]);
}

for (const [hash, group] of activeByHash) {
  if (group.length < 2) continue;
  findings.push(
    `Content-identical migrations in the ACTIVE path (${hash.slice(0, 12)}…):\n` +
      group.map((f) => `      - ${f}`).join("\n") +
      `\n      A clean replay would run the same SQL twice. Keep the canonical file,\n` +
      `      park the generated copy (migrations-policy.json "parked" + move the file\n` +
      `      to ${policy.parkedDirectory}/). There is no allowlist.`,
  );
}

// --- 2. Parked content must not return under any name -----------------------
const parkedMeta = new Map(policy.parked.map((p) => [p.file, p]));
for (const parked of parkedFiles) {
  const parkedHash = hashOf(policy.parkedDirectory, parked);
  const canonical = new Set(parkedMeta.get(parked)?.canonicalReplacement ?? []);
  for (const [hash, group] of activeByHash) {
    if (hash !== parkedHash) continue;
    for (const active of group) {
      if (canonical.has(active)) continue; // the recorded canonical twin
      findings.push(
        `Parked migration content is back in the active path:\n` +
          `      parked  ${parked}\n` +
          `      active  ${active}\n` +
          `      The active file carries the same normalised SQL but is not the parked\n` +
          `      entry's recorded canonicalReplacement. A parked migration must never\n` +
          `      re-enter the active path, under its own name or another.`,
      );
    }
  }
}

// --- 3. "identical" parked entries must still match their canonical ---------
for (const entry of policy.parked) {
  if (entry.equivalence !== "identical") continue;
  if (!existsSync(join(policy.parkedDirectory, entry.file))) continue; // safety check reports this
  const parkedHash = hashOf(policy.parkedDirectory, entry.file);
  for (const canonical of entry.canonicalReplacement ?? []) {
    if (!existsSync(join(policy.activeDirectory, canonical))) continue; // safety check reports this
    if (hashOf(policy.activeDirectory, canonical) !== parkedHash) {
      findings.push(
        `${entry.file} is recorded as content-identical to ${canonical}, but they have DIVERGED.\n` +
          `      One of them has been edited; the evidence record no longer describes reality.`,
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
console.log(`  active migrations hashed:  ${activeFiles.length}`);
console.log(`  parked migrations hashed:  ${parkedFiles.length}`);
console.log(`  active duplicate groups:   0 (required)`);
