/**
 * Canonical migration safety guard.
 *
 * A comment in a .sql file cannot stop `supabase db push`, a CI job or an
 * agent from executing it. This script is the enforcement that a comment is
 * not: it fails the build when the repository's migration set drifts from the
 * policy recorded in supabase/migrations-policy.json.
 *
 * It deliberately does NOT try to be a migration framework. It answers nine
 * questions and nothing else:
 *
 *   1. Does any numeric version appear twice in the active path?
 *   2. Is a parked migration back in the active path?
 *   3. Does every parked / never-replay file still exist where policy says?
 *   4. Has a never-replay file been edited since it was pinned?
 *   5. Does every active file have a well-formed, ordered version prefix?
 *   6. For a migration already applied in production through Lovable: is the
 *      canonical file still present, and is Lovable’s generated duplicate gone?
 *   7. Does every parked entry carry a canonical replacement, a reason and a
 *      hosted-evidence mapping — and do its canonical replacement files exist
 *      in the active path?
 *   8. Does any object get an unguarded CREATE TABLE / CREATE VIEW in two
 *      active migrations with no intervening DROP — the partial-overlap shape
 *      that made a clean replay fail for a month before it was retired?
 *   9. Does scripts/db-test.sh still honour the STRICT-REPLAY-CONTRACT: no
 *      KNOWN_FAILURES, no expected-error matching, no error suppression around
 *      migration execution?
 *
 * Run: bun run migrations:check
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Parked = {
  version: string;
  file: string;
  reason: string;
  canonicalReplacement?: string[];
  equivalence?: string;
  hostedEvidence?: string;
};
type NeverReplay = Parked & { protection?: string; sha256?: string };
type Policy = {
  activeDirectory: string;
  parkedDirectory: string;
  parked: Parked[];
  neverReplay: NeverReplay[];
  approvedDuplicateVersions: { version: string; pairedWith: string; reason: string }[];
  hostedLedgerOverrides: { file: string; hostedVersion: string; reason: string }[];
  appliedThroughLovable?: {
    canonicalFile: string;
    canonicalVersion: string;
    hostedVersion: string;
    hostedName: string;
    generatedFileOnMain?: string;
    doNotReExecute?: boolean;
  }[];
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
    notes.push(
      `  pin  ${entry.file}\n       sha256 ${sha}  (record this in migrations-policy.json)`,
    );
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

// --- 6. Migrations already applied in production through Lovable -----------
//
// Lovable executes canonical SQL but records its OWN version and a UUID name,
// then commits a generated duplicate of the migration back to main. Two things
// must stay true for every such entry, and neither is self-enforcing:
//
//   * the canonical file must still be present — it is the reviewed artefact
//     and the only readable record of what production actually ran;
//   * the generated duplicate must be ABSENT from the active path — leaving it
//     recreates exactly the duplicate-ordering defect this repair removed, and
//     a clean replay would run the same SQL twice.
for (const entry of policy.appliedThroughLovable ?? []) {
  if (!existsSync(join(activeDir, entry.canonicalFile))) {
    fail(
      `appliedThroughLovable: canonical file is missing: ${entry.canonicalFile}\n` +
        `      Already applied in production as ${entry.hostedVersion} (${entry.hostedName}).\n` +
        `      That file is the reviewed record of what ran and must not be deleted.`,
    );
  }
  if (entry.generatedFileOnMain) {
    const generated = entry.generatedFileOnMain.replace(/^supabase\/migrations\//, "");
    if (existsSync(join(activeDir, generated))) {
      fail(
        `appliedThroughLovable: Lovable's generated duplicate is back in the active path: ${generated}\n` +
          `      Same SQL as ${entry.canonicalFile}, already applied as ${entry.hostedVersion}.\n` +
          `      Keeping both means a clean replay applies it twice. Remove the generated file.`,
      );
    }
  }
}

// --- 7. Parked entries are complete evidence records ------------------------
//
// A parked migration is retired history, and retired history without a map is
// how it gets replayed "to see what it does". Every parked entry must say what
// replaced it, why, and where the hosted record lives. The only file allowed
// to lack a canonical replacement is one that was never applied anywhere and
// replaced by nothing — and that too must be said explicitly.
const parkedByFile = new Map(policy.parked.map((p) => [p.file, p]));
for (const entry of policy.parked) {
  if (!entry.reason || entry.reason.trim().length === 0) {
    fail(`parked entry ${entry.file} has no reason. Parking is an owner decision; record it.`);
  }
  if (!entry.hostedEvidence || entry.hostedEvidence.trim().length === 0) {
    fail(
      `parked entry ${entry.file} has no hostedEvidence mapping.\n` +
        `      Generated history is deployment evidence; say where the hosted record lives.`,
    );
  }
  if (!entry.canonicalReplacement || entry.canonicalReplacement.length === 0) {
    fail(
      `parked entry ${entry.file} names no canonicalReplacement.\n` +
        `      Every parked migration must map to the active file(s) that are the\n` +
        `      source of truth for its change.`,
    );
    continue;
  }
  for (const canonical of entry.canonicalReplacement) {
    if (!existsSync(join(activeDir, canonical))) {
      fail(
        `parked entry ${entry.file} names canonicalReplacement ${canonical},\n` +
          `      which is not in the active path. A parked file's source of truth must\n` +
          `      remain replayable.`,
      );
    }
  }
}
// Every .sql actually sitting in the parked directory must be recorded.
for (const file of readdirSync(parkedDir).filter((f) => f.endsWith(".sql"))) {
  if (!parkedByFile.has(file)) {
    fail(
      `${file} sits in ${policy.parkedDirectory}/ but has no "parked" entry in\n` +
        `      migrations-policy.json. Park deliberately or not at all.`,
    );
  }
}

// --- 8. No unguarded re-creation of the same object -------------------------
//
// The exact shape of the retired failure class: a generated re-issue creating
// a table an earlier migration already created. Full content duplicates are
// caught by scripts/migration-duplicate-check.ts; this catches the PARTIAL
// overlap, where only some statements collide. An object may be legitimately
// re-created only after an intervening DROP in replay order.
{
  type Pos = { file: string; line: number };
  const creates = new Map<string, Pos[]>();
  const drops = new Map<string, Pos[]>();
  const createRe =
    /^\s*CREATE\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?!IF\s+NOT\s+EXISTS)((?:[A-Za-z_"][\w"$]*\.)?[A-Za-z_"][\w"$]*)/i;
  const dropRe =
    /^\s*DROP\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+EXISTS\s+)?((?:[A-Za-z_"][\w"$]*\.)?[A-Za-z_"][\w"$]*)/i;
  const nameOf = (raw: string) => raw.toLowerCase().replace(/"/g, "").split(".").pop() ?? raw;
  const before = (a: Pos, b: Pos) => a.file < b.file || (a.file === b.file && a.line <= b.line);

  for (const file of activeFiles) {
    const lines = readFileSync(join(activeDir, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      const c = createRe.exec(line);
      if (c && !/OR\s+REPLACE/i.test(line)) {
        const list = creates.get(nameOf(c[1])) ?? [];
        list.push({ file, line: i + 1 });
        creates.set(nameOf(c[1]), list);
      }
      const d = dropRe.exec(line);
      if (d) {
        const list = drops.get(nameOf(d[1])) ?? [];
        list.push({ file, line: i + 1 });
        drops.set(nameOf(d[1]), list);
      }
    });
  }

  for (const [name, list] of creates) {
    for (let k = 1; k < list.length; k += 1) {
      const prev = list[k - 1];
      const cur = list[k];
      const dropped = (drops.get(name) ?? []).some((d) => before(prev, d) && before(d, cur));
      if (!dropped) {
        fail(
          `${name} is created without a guard in two active migrations with no DROP between them:\n` +
            `      - ${prev.file}:${prev.line}\n` +
            `      - ${cur.file}:${cur.line}\n` +
            `      A clean replay fails on the second CREATE. If the later file is a generated\n` +
            `      re-issue, park it (policy "parked"); if the re-creation is intended, DROP first.`,
        );
      }
    }
  }
}

// --- 9. The strict replay contract in scripts/db-test.sh --------------------
//
// A replay that passes because errors are tolerated proves nothing about a
// real deployment — the official Supabase integration applies this directory
// strictly and stops on the first error. This check makes the old allowlist
// mechanism (and every equivalent) a build failure if it ever returns.
{
  const dbTestPath = join(ROOT, "scripts/db-test.sh");
  if (!existsSync(dbTestPath)) {
    fail("scripts/db-test.sh is missing; the strict replay contract cannot be verified.");
  } else {
    const dbTest = readFileSync(dbTestPath, "utf8");

    const forbiddenGlobal: [RegExp, string][] = [
      [/KNOWN_FAILURES\s*=/, "a KNOWN_FAILURES allowlist"],
      [/expected_failure_for/, "expected-error matching (expected_failure_for)"],
      [/\|\|\|/, "the <file>|||<expected error> allowlist entry format"],
      [/ON_ERROR_STOP\s*=\s*0/, "psql ON_ERROR_STOP=0 (ignored SQLSTATEs)"],
    ];
    for (const [re, what] of forbiddenGlobal) {
      if (re.test(dbTest)) {
        fail(
          `scripts/db-test.sh reintroduces ${what}.\n` +
            `      The migration replay must be strict: every active migration executes\n` +
            `      successfully or the run fails. Expected-error suppression was retired\n` +
            `      on 2026-08-28 and must not return in any form.`,
        );
      }
    }

    const begin = dbTest.split("# STRICT-REPLAY-CONTRACT BEGIN");
    const markerOk = begin.length === 2 && begin[1].includes("# STRICT-REPLAY-CONTRACT END");
    if (!markerOk) {
      fail(
        "scripts/db-test.sh no longer contains exactly one STRICT-REPLAY-CONTRACT region.\n" +
          "      The migration replay loop must live between the BEGIN/END markers so this\n" +
          "      check can prove it executes migrations without suppression.",
      );
    } else {
      const region = begin[1].split("# STRICT-REPLAY-CONTRACT END")[0];
      if (!/ON_ERROR_STOP=1/.test(region)) {
        fail("STRICT-REPLAY-CONTRACT region does not run psql with ON_ERROR_STOP=1.");
      }
      const forbiddenInRegion: [RegExp, string][] = [
        [/set\s+\+e/, "set +e (suppresses migration execution failures)"],
        [/\|\|\s*true/, "'|| true' (discards a migration failure)"],
        [/2>\s*\/dev\/null/, "'2>/dev/null' (hides migration errors)"],
        [/^\s*continue\b/m, "'continue' (continue-on-error migration execution)"],
      ];
      for (const [re, what] of forbiddenInRegion) {
        if (re.test(region)) {
          fail(`STRICT-REPLAY-CONTRACT region contains ${what}.`);
        }
      }
    }
  }
}

// --- Report ----------------------------------------------------------------
console.log(`migration-safety-check: ${activeFiles.length} active migrations`);
console.log(`  parked:       ${policy.parked.length}`);
console.log(`  never-replay: ${policy.neverReplay.length}`);
console.log(`  approved dup: ${policy.approvedDuplicateVersions.length}`);
console.log(
  `  applied via Lovable (non-re-executable): ${(policy.appliedThroughLovable ?? []).length}`,
);
if (notes.length) console.log(notes.join("\n"));

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} migration-safety violation(s)\n`);
  for (const f of failures) console.error(`  !!  ${f}\n`);
  process.exit(1);
}
console.log("OK: migration set matches policy.");
