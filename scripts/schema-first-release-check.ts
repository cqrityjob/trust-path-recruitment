/**
 * The schema-first release contract.
 *
 * WHY THIS EXISTS, stated plainly because the repository has already paid for
 * the lesson twice:
 *
 *   Lovable rebuilds the application from `origin/main` the moment a PR merges.
 *   Canonical Supabase migrations do NOT run then; they run when someone
 *   applies them. So between those two events the deployed code can be asking
 *   a database for tables, columns and functions it has never heard of. On
 *   2026-08-25 that took down all job publishing.
 *
 * `release-parity --release` already computed exactly this and did not prevent
 * it — because it is a RELEASE gate, and the deploy happens at MERGE. A gate
 * placed after the thing it guards is a report, not a gate.
 *
 * This guard moves the check to the merge. The invariant it enforces:
 *
 *   APPLICATION CODE MUST NEVER BECOME MERGE-ELIGIBLE WHILE A MIGRATION IT
 *   DEPENDS ON IS NOT RECORDED AS APPLIED ON THE OWNER SUPABASE PROJECT.
 *
 * That splits any feature needing both into two releases, automatically:
 *
 *   1. SCHEMA RELEASE      migrations (+ tests, docs, bookkeeping) only.
 *                          Safe to merge: adding a table breaks no running app.
 *                          -> the official Supabase GitHub integration applies it
 *                          -> hosted verification
 *                          -> release-state.json records `applied` WITH evidence
 *   2. APPLICATION RELEASE the dependent code, now unblocked.
 *
 * Nobody has to remember the order. A branch that puts them the wrong way round
 * fails here, on the pull request, before it can reach a live site.
 *
 * Credential-free and network-free, like every other guard in this repository.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface IntroducedObject {
  kind: "function" | "table" | "index" | "column";
  object: string;
  table?: string;
}
interface FrontierEntry {
  file: string;
  hostedState: "applied" | "pending" | "unverified";
  introduces: IntroducedObject[];
}

const state = JSON.parse(readFileSync(path.join(root, "supabase/release-state.json"), "utf8")) as {
  frontier: FrontierEntry[];
};

const targets = JSON.parse(
  readFileSync(path.join(root, "supabase/deployment-targets.json"), "utf8"),
) as {
  writeTargetRef: string;
  currentLive: { projectRef: string };
};

/* ------------------------------------------------------------------ */
/* 0 · Which database does the RUNNING application actually talk to?   */
/* ------------------------------------------------------------------ */

// This is the question that matters, and it is not the same question as
// "where do migrations go".
//
// release-state.json tracks the SCHEMA TARGET. Until the runtime cutover, the
// deployed application talks to a DIFFERENT project. Migrations applied to the
// schema target therefore do nothing for production, and a release-state full
// of `applied` says nothing at all about whether the live site can serve the
// code that is about to ship to it.
//
// Found the hard way on 2026-08-29: eight migrations were applied to the owner
// project by the GitHub integration, main's code merged, and the live site --
// still on the old backend -- had none of it.
const SPLIT_BACKEND = targets.currentLive.projectRef !== targets.writeTargetRef;

/* ------------------------------------------------------------------ */
/* 1 · Which migrations are not proven to exist on the owner database  */
/* ------------------------------------------------------------------ */

// `unverified` counts as NOT applied. "We have no evidence either way" is not a
// basis on which to ship code that assumes the object is there.
const notApplied = state.frontier.filter((e) => e.hostedState !== "applied");

/* ------------------------------------------------------------------ */
/* 2 · Which application code depends on them                          */
/* ------------------------------------------------------------------ */

function camel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".gen.ts")) out.push(full);
  }
  return out;
}

const SRC = path.join(root, "src");
// types.ts DESCRIBES a schema, it does not call one — same exclusion, and the
// same reason, as release-parity-check.ts.
const EXCLUDED = new Set([path.join(SRC, "integrations/supabase/types.ts")]);

const sources = sourceFiles(SRC)
  .filter((f) => !EXCLUDED.has(f))
  .map((f) => ({ file: path.relative(root, f), body: readFileSync(f, "utf8") }));

function referencedBy(item: IntroducedObject): { file: string; line: number } | null {
  const patterns = [item.object, camel(item.object)].map((id) => new RegExp(`\\b${id}\\b`));
  for (const { file, body } of sources) {
    if (item.kind === "column" && item.table && !body.includes(item.table)) continue;
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;
      if (patterns.some((p) => p.test(lines[i]))) return { file, line: i + 1 };
    }
  }
  return null;
}

type Blocker = { migration: string; object: string; file: string; line: number };
const blockers: Blocker[] = [];

for (const entry of notApplied) {
  for (const item of entry.introduces) {
    const hit = referencedBy(item);
    if (hit) {
      blockers.push({
        migration: entry.file,
        // Only a COLUMN needs its table to be identifiable; prefixing a table
        // with itself reads as a bug in the report.
        object: `${item.kind} "${item.kind === "column" && item.table ? `${item.table}.` : ""}${item.object}"`,
        file: hit.file,
        line: hit.line,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3 · What kind of release is this branch?                            */
/* ------------------------------------------------------------------ */

/** Paths that cannot change what a running application asks the database for.
 *  Migrations themselves are in here on purpose: shipping a migration is the
 *  SCHEMA half, and it is exactly what we want people to merge first. */
const SCHEMA_SAFE = [
  /^supabase\/migrations\//,
  /^supabase\/tests\//,
  /^supabase\/release-state\.json$/,
  /^supabase\/deployment-targets\.json$/,
  /^supabase\/migrations-policy\.json$/,
  /^docs\//,
  /^scripts\//,
  /^\.github\//,
];

function changedFiles(): string[] | null {
  // Compare against the merge base with main. On main itself this is empty,
  // and the guard falls through to the standing-state check below — which is
  // the right behaviour: if main's code depends on an unapplied migration,
  // that is a live incident and CI should say so.
  for (const base of ["origin/main", "main"]) {
    try {
      const mergeBase = execFileSync("git", ["merge-base", base, "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return execFileSync("git", ["diff", "--name-only", `${mergeBase}...HEAD`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split("\n")
        .filter(Boolean);
    } catch {
      continue;
    }
  }
  return null;
}

const changed = changedFiles();
const appChanges = changed?.filter((f) => !SCHEMA_SAFE.some((p) => p.test(f))) ?? null;
const isSchemaOnlyBranch = appChanges !== null && appChanges.length === 0 && changed!.length > 0;

/* ------------------------------------------------------------------ */
/* 4 · The verdict                                                     */
/* ------------------------------------------------------------------ */

console.log("schema-first release contract\n");

if (SPLIT_BACKEND) {
  console.log(`  Schema target : ${targets.writeTargetRef}`);
  console.log(
    `  LIVE runtime  : ${targets.currentLive.projectRef}   <-- what production actually queries`,
  );
  console.log("");
  console.log("  These are different projects. release-state.json below describes the");
  console.log("  SCHEMA TARGET only. It is NOT evidence that the live database can serve");
  console.log("  this code, and it must not be read as though it were. Until the runtime");
  console.log("  cutover, every migration this branch depends on has to reach BOTH, or");
  console.log("  the application must tolerate its absence on the live one.");
  console.log("");
}

if (blockers.length === 0) {
  console.log("  OK: no application code depends on a migration unapplied on the schema target.");
  if (SPLIT_BACKEND) {
    console.log("      NOTE: that is not the live database. See the split-backend warning above.");
  } else {
    console.log("      This branch is application-release eligible.");
  }
  process.exit(0);
}

const migrations = [...new Set(blockers.map((b) => b.migration))].sort();

if (isSchemaOnlyBranch) {
  console.log("  SCHEMA RELEASE — this branch changes no application code.\n");
  console.log("  It ships the migrations below and nothing that calls them, which is");
  console.log("  the safe half of a schema-first release. Merge it, let the official");
  console.log("  Supabase GitHub integration apply it, verify the hosted schema, then");
  console.log("  record `applied` with evidence in supabase/release-state.json.\n");
  for (const m of migrations) console.log(`    - ${m}`);
  console.log("\n  The dependent application code becomes merge-eligible after that.");
  process.exit(0);
}

console.error("  BLOCKED — application code depends on a migration that is not applied.\n");
console.error("  Merging this makes Lovable rebuild from main immediately, while these");
console.error("  database objects still do not exist on the owner Supabase project.");
console.error("  That is the 2026-08-25 outage, reproduced.\n");

for (const b of blockers.slice(0, 20)) {
  console.error(`    ${b.file}:${b.line}`);
  console.error(`      needs ${b.object}`);
  console.error(`      from  ${b.migration}\n`);
}
if (blockers.length > 20) console.error(`    ... and ${blockers.length - 20} more.\n`);

console.error("  Required order:\n");
console.error("    1. Merge the migrations ALONE (no application code).");
for (const m of migrations) console.error(`         ${m}`);
console.error("    2. Let the official Supabase GitHub integration apply them.");
console.error("    3. Verify the hosted schema.");
console.error("    4. Record hostedState `applied` WITH evidence in release-state.json.");
console.error("    5. Then merge this application code.\n");
console.error("  Do not work around this by weakening the guard. The order is the point.");
process.exit(1);
