/**
 * The shared negative-control harness.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * A guard that cannot fail is not a guard. Every check in this repository
 * asserts that something is true; none of them, on their own, proves that the
 * assertion would notice if it stopped being true. A check whose subject was
 * deleted, whose regex was loosened, or whose file was renamed can go on
 * printing "ok" forever, and the first person to find out is whoever is
 * affected by the defect it was supposed to catch.
 *
 * A negative control closes that. For each mutation it introduces the exact
 * defect the guard exists to catch, runs the guard, and requires it to fail
 * with the expected diagnostic. If the guard passes, the CONTROL fails --
 * which is the only way a silently dead assertion becomes visible.
 *
 * ── WHY IT MUTATES IN PLACE AND RESTORES ───────────────────────────────
 *
 * The mutation has to be visible to the guard, and the guards here read real
 * source through real imports. So the file is edited, the guard is run, and
 * the original bytes are written back in a `finally` -- then the restoration
 * is VERIFIED by comparing a SHA-256 of the restored bytes against one taken
 * before the edit, and the run ends by asserting `git status --porcelain` is
 * empty. A harness that leaves a mutation behind would be worse than no
 * harness, so restoration is proved rather than assumed.
 *
 * Run: bun run negative-controls:all
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dir, "..", "..");

export interface Mutation {
  /** The control's stable id, quoted in the plan and in the failure output. */
  readonly id: string;
  /** One sentence: what defect this introduces. */
  readonly defect: string;
  /** Repository-relative path of the file to mutate. */
  readonly file: string;
  /** The exact text to replace. Must appear EXACTLY ONCE, or the control
   *  fails before mutating -- an ambiguous anchor is a broken control. */
  readonly find: string;
  /** What to put there instead. */
  readonly replace: string;
  /** The package script the mutation must break. */
  readonly guard: string;
  /** The diagnostic the guard must print. Matched as a substring against
   *  stdout and stderr combined. */
  readonly expect: string;
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function gitClean(): boolean {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() === "";
}

export function runControls(suite: string, mutations: readonly Mutation[]): void {
  console.log(`negative-controls:${suite} — ${mutations.length} mutations\n`);

  if (!gitClean()) {
    console.error(
      "  REFUSED  the working tree is not clean.\n" +
        "           This harness edits tracked files and restores them; it will not run\n" +
        "           against a dirty tree, because a failure would be indistinguishable\n" +
        "           from work in progress.",
    );
    process.exit(1);
  }

  const failures: string[] = [];

  for (const m of mutations) {
    const abs = join(ROOT, m.file);
    const originalBuf = readFileSync(abs);
    const originalHash = sha256(originalBuf);
    const original = originalBuf.toString("utf8");

    const occurrences = original.split(m.find).length - 1;
    if (occurrences !== 1) {
      failures.push(
        `${m.id}: anchor appears ${occurrences} times in ${m.file}, expected exactly 1`,
      );
      console.log(`  FAIL ${m.id} — anchor appears ${occurrences} times, expected exactly 1`);
      continue;
    }

    let verdict = "";
    try {
      writeFileSync(abs, original.replace(m.find, m.replace), "utf8");
      const run = spawnSync("bun", ["run", m.guard], { cwd: ROOT, encoding: "utf8" });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;

      if (run.status === 0) {
        verdict = `guard "${m.guard}" PASSED with the defect applied — the assertion is dead`;
      } else if (!output.includes(m.expect)) {
        verdict =
          `guard "${m.guard}" failed, but not with the expected diagnostic.\n` +
          `           expected substring: ${m.expect}`;
      }
    } finally {
      writeFileSync(abs, originalBuf);
      const restoredHash = sha256(readFileSync(abs));
      if (restoredHash !== originalHash) {
        verdict =
          (verdict ? `${verdict}\n           AND ` : "") +
          `restoration FAILED: ${m.file} does not match its original bytes`;
      }
    }

    if (verdict) {
      failures.push(`${m.id}: ${verdict}`);
      console.log(`  FAIL ${m.id} — ${verdict}`);
    } else {
      console.log(`  ok   ${m.id} — ${m.defect}`);
      console.log(`         ${m.guard} failed with: ${m.expect}`);
    }
  }

  if (!gitClean()) {
    failures.push("the working tree is not clean after the run — a mutation was left behind");
    console.error("\n  FAIL the working tree is not clean after the run");
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`negative-controls:${suite} FAILED (${failures.length} of ${mutations.length}).`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `negative-controls:${suite}: all ${mutations.length} mutations were detected, ` +
      `every file restored byte-for-byte, working tree clean.`,
  );
}
