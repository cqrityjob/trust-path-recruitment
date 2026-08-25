/**
 * Release parity guard — does this branch's CODE need a migration the hosted
 * database does not have yet?
 *
 * ── THE FAILURE THIS PREVENTS ────────────────────────────────────────────
 *
 * Independent UAT opened with a production outage of a specific and entirely
 * preventable kind. The deployed application expected
 * 20260909092000_jobs_other_profession_selection.sql; the hosted schema did
 * not have it. Employers could not save or publish a job at all. Nothing was
 * wrong with the code and nothing was wrong with the migration — the two were
 * simply not shipped together, and nothing in the repository could say so.
 *
 * That is a class of failure, not an incident. Application code syncs to
 * Lovable the moment it is pushed; migrations run only when somebody asks for
 * them. Any gap between those two facts is an outage waiting for the next
 * feature that touches the database.
 *
 * ── WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────
 *
 * It compares the repository against itself. It NEVER connects to a database,
 * holds no credentials, reads no environment, and applies nothing. Production
 * state is not something a CI job should be able to reach, and a guard that
 * needed production credentials to run would be a bigger risk than the bug it
 * prevents.
 *
 * The hosted state is a DECLARATION (supabase/release-state.json), which makes
 * it reviewable: changing it is a diff somebody approves, not a silent belief.
 * The guard's job is to make that declaration impossible to leave stale and
 * impossible to contradict:
 *
 *   1. Every canonical migration above the evidence baseline is classified.
 *      A new migration with no entry fails the build — you cannot add one
 *      without saying whether it is live.
 *   2. Every unapplied migration declares which database objects it
 *      introduces, so the question "can code depend on this?" is answerable.
 *   3. RELEASE BLOCKER: application code references an object introduced by a
 *      migration that is not applied. This is the Fable case exactly, and it
 *      would have failed here before the deploy.
 *   4. It prints the release sequence, in order, so the migration step is a
 *      list to work through rather than something to remember.
 *
 * `--release` turns "unapplied migrations exist" into a failure as well. That
 * is the pre-deploy gate; the default mode is the everyday one, where pending
 * migrations are normal and only a genuine code/schema mismatch is fatal.
 *
 * Run: bun run release-parity:check          (development)
 *      bun run release-parity:check --release (before a deploy)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type HostedState = "applied" | "pending" | "unverified";

/** One database object a migration brings into existence.
 *
 *  `kind` is not decoration. A function, table or index name is unique across
 *  the schema, so finding it in application code is proof of a dependency. A
 *  COLUMN name is not: `current_profession_other` exists on two unrelated
 *  tables in this product, and matching it bare reported the legacy Career
 *  Profile form as depending on a Career Discovery migration it has nothing
 *  to do with. A column therefore carries its table, and only code that names
 *  BOTH counts. */
interface IntroducedObject {
  object: string;
  kind: "function" | "table" | "index" | "column";
  table?: string;
}

interface FrontierEntry {
  file: string;
  hostedState: HostedState;
  introduces: IntroducedObject[];
  note?: string;
}

interface ReleaseState {
  activeDirectory: string;
  evidenceBaseline: { throughVersion: string; source: string; note: string };
  frontier: FrontierEntry[];
}

interface AppliedThroughLovable {
  appliedThroughLovable?: { canonicalFile: string; canonicalVersion: string }[];
}

const root = path.resolve(import.meta.dir, "..");
const releaseMode = process.argv.includes("--release");

const failures: string[] = [];
const notes: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

const state: ReleaseState = JSON.parse(
  readFileSync(path.join(root, "supabase/release-state.json"), "utf8"),
);
const policy: AppliedThroughLovable = JSON.parse(
  readFileSync(path.join(root, "supabase/migrations-policy.json"), "utf8"),
);

const migrationsDir = path.join(root, state.activeDirectory);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const versionOf = (file: string) => file.split("_")[0];
const baseline = state.evidenceBaseline.throughVersion;

// Migrations at or below the baseline are covered by migrations-policy.json's
// own recorded evidence and need no entry here.
const frontierFiles = migrations.filter((f) => versionOf(f) > baseline);
const declared = new Map(state.frontier.map((e) => [e.file, e] as const));

// =========================================================================
// 1 · Every migration above the baseline is classified
// =========================================================================
//
// This is the rule that keeps the file honest. Adding a migration and
// forgetting to say whether it is live is exactly how the declaration goes
// stale, so it is not allowed to happen quietly.

for (const file of frontierFiles) {
  if (!declared.has(file)) {
    fail(
      `unclassified migration: ${file}\n` +
        `    Add it to supabase/release-state.json with a hostedState and the objects it\n` +
        `    introduces. If it introduces none, say so with "introduces": [] and a note.`,
    );
  }
}

for (const entry of state.frontier) {
  if (!migrations.includes(entry.file)) {
    fail(
      `release-state.json names a migration that is not in ${state.activeDirectory}: ${entry.file}`,
    );
    continue;
  }
  if (versionOf(entry.file) <= baseline) {
    fail(
      `release-state.json entry ${entry.file} is at or below the evidence baseline ` +
        `${baseline}; it is already covered by migrations-policy.json.`,
    );
  }
  if (!["applied", "pending", "unverified"].includes(entry.hostedState)) {
    fail(`${entry.file}: unknown hostedState "${entry.hostedState}"`);
  }
  if (entry.introduces.length === 0 && !entry.note) {
    fail(
      `${entry.file}: declares no introduced objects and gives no reason.\n` +
        `    A migration that adds nothing code can name still has to say so, so that\n` +
        `    "no objects" is a considered answer rather than an empty field.`,
    );
  }
}

// A migration recorded as applied through Lovable must not be declared
// pending here. Two files disagreeing about production is worse than one.
for (const applied of policy.appliedThroughLovable ?? []) {
  const entry = declared.get(path.basename(applied.canonicalFile));
  if (entry && entry.hostedState !== "applied") {
    fail(
      `${entry.file} is recorded as applied in migrations-policy.json but declared ` +
        `"${entry.hostedState}" in release-state.json.`,
    );
  }
}

// =========================================================================
// 2 · RELEASE BLOCKER — code depending on a migration that is not applied
// =========================================================================
//
// The whole point. An identifier introduced by an unapplied migration must
// not appear in application code: if it ships, the deployed app asks the
// database for something that is not there.
//
// Both spellings are searched. A column named `profession_other` reaches the
// client as `professionOther`, and it was the CLIENT that broke.

function camel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".gen.ts")) {
      out.push(full);
    }
  }
  return out;
}

const SRC = path.join(root, "src");

/** The generated Supabase type surface is excluded, deliberately.
 *
 *  types.ts DESCRIBES a schema; it does not call one. It is regenerated (and,
 *  per this repository's convention, spliced) alongside a migration, so its
 *  contents say nothing reliable about what the hosted database has — and
 *  treating a type definition as a runtime dependency reports every migration
 *  as a blocker the moment the types are updated. The dependency that
 *  actually breaks in production is where the application CALLS the object. */
const EXCLUDED = new Set([path.join(SRC, "integrations/supabase/types.ts")]);

const sources = sourceFiles(SRC)
  .filter((f) => !EXCLUDED.has(f))
  .map((f) => ({ file: f, body: readFileSync(f, "utf8") }));

/** Where application code depends on this object, if it does.
 *
 *  A column is only counted when the file also names its TABLE — see
 *  IntroducedObject.kind for why a bare column name is not evidence. */
function referencedBy(item: IntroducedObject): { file: string; line: number } | null {
  const identifiers = new Set([item.object, camel(item.object)]);
  const patterns = [...identifiers].map((id) => new RegExp(`\\b${id}\\b`));
  for (const { file, body } of sources) {
    if (item.kind === "column" && item.table && !body.includes(item.table)) continue;
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      // A mention inside a comment is documentation, not a dependency.
      if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;
      if (patterns.some((p) => p.test(lines[i]))) {
        return { file: path.relative(root, file), line: i + 1 };
      }
    }
  }
  return null;
}

const blockers: string[] = [];

for (const entry of state.frontier) {
  if (entry.hostedState === "applied") continue;
  for (const item of entry.introduces) {
    const hit = referencedBy(item);
    if (hit) {
      const where = item.kind === "column" ? `${item.table}.${item.object}` : item.object;
      blockers.push(
        `${hit.file}:${hit.line} depends on ${item.kind} "${where}", introduced by\n` +
          `    ${entry.file} (hostedState: ${entry.hostedState}).`,
      );
    }
  }
}

// =========================================================================
// 3 · The release sequence
// =========================================================================

const unapplied = state.frontier.filter((e) => e.hostedState !== "applied");
const unverified = unapplied.filter((e) => e.hostedState === "unverified");

console.log(`release-parity-check: ${migrations.length} canonical migrations`);
console.log(`  evidence baseline:  ${baseline} (${state.evidenceBaseline.source})`);
console.log(`  at the frontier:    ${frontierFiles.length}`);
console.log(`  not yet applied:    ${unapplied.length}`);
console.log(`  unverified:         ${unverified.length}`);

if (unapplied.length > 0) {
  console.log("\nRELEASE SEQUENCE — apply in this order, hosted, before deploying:\n");
  for (const [i, entry] of unapplied.entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. ${entry.file}  [${entry.hostedState}]`);
    if (entry.note) console.log(`      ${entry.note.split(". ")[0]}.`);
  }
  console.log(
    "\n  Then update supabase/release-state.json (hostedState -> applied), and, for a\n" +
      "  migration applied through the Lovable mechanism, record the generated version\n" +
      "  in supabase/migrations-policy.json's appliedThroughLovable as usual.",
  );
}

if (unverified.length > 0) {
  notes.push(
    `${unverified.length} migration(s) have no evidence either way and are treated as NOT ` +
      `applied. Confirm them against the hosted ledger before release:\n` +
      unverified.map((e) => `      - ${e.file}`).join("\n"),
  );
}

// ── SEVERITY: A BRANCH IS NOT A DEPLOY ───────────────────────────────────
//
// A feature branch that adds a migration AND the code that uses it is the
// normal, correct shape of a change — failing CI for it would train everyone
// to ignore this guard, which is how the outage happened in the first place.
// What is not acceptable is DEPLOYING that pair with only half applied.
//
// So the same finding is a warning during development and a hard failure at
// --release. The check is identical; only the moment changes.
if (blockers.length > 0) {
  const heading = releaseMode
    ? "RELEASE BLOCKERS — this code cannot be deployed against the current hosted schema:"
    : "This branch's code depends on migrations that are not applied hosted yet:";
  console.log(`\n${heading}\n`);
  for (const b of blockers) console.log(`  - ${b}`);
  if (!releaseMode) {
    console.log(
      "\n  That is expected on a branch that ships a migration with the code that uses\n" +
        "  it. It becomes a release blocker: run with --release before deploying.",
    );
  }
}

if (releaseMode) {
  for (const b of blockers) {
    fail(
      `${b}\n` +
        `    Deploying this reproduces the job-publishing outage: the application asks\n` +
        `    the database for something that is not there.`,
    );
  }
  if (unapplied.length > 0) {
    fail(
      `--release: ${unapplied.length} migration(s) are not applied on the hosted database.\n` +
        `    A release may not proceed with an unapplied canonical migration. Work through\n` +
        `    the sequence above, then re-run.`,
    );
  }
}

if (notes.length > 0) {
  console.log("\nNOTES:");
  for (const n of notes) console.log(`  - ${n}`);
}

if (failures.length > 0) {
  console.error(`\nrelease-parity-check FAILED (${failures.length} issue(s)):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  blockers.length === 0
    ? "\nOK: every migration is classified and no code depends on an unapplied one."
    : `\nOK: every migration is classified. ${blockers.length} code dependency/dependencies ` +
        "wait on the release sequence above (run with --release to gate a deploy).",
);
