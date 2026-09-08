/**
 * Prove that `deploy-plan:check` still fails when it should.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * The apply baseline used to be a hand-written empty array. It is now DERIVED
 * from the `pending` entries in release-state.json, which is better in every
 * way but one: a derived expectation can be satisfied by editing the thing it
 * is derived from. "The plan matches the reviewed set" is a much weaker
 * sentence if nobody has ever seen the two disagree.
 *
 * So this feeds the real check three worlds and asserts what it says about
 * each. It runs the actual script — no re-implementation of the rule, because
 * a re-implementation is one more thing that can be wrong in the same
 * direction as the original.
 *
 *   1. THE REPOSITORY AS IT STANDS   passes, and the plan is the reviewed
 *                                    pending set. (Not a negative control;
 *                                    it is the control the other two are
 *                                    negative against.)
 *   2. AN UNREVIEWED MIGRATION       a local file nobody recorded `pending`.
 *                                    Must fail: this is the whole point of
 *                                    the guard, and it is the case that
 *                                    caught 20261102090000 in the first
 *                                    place.
 *   3. A STALE PENDING ENTRY         release-state still says "waiting" for
 *                                    something the hosted ledger already has.
 *                                    Must fail: a resolved entry left in the
 *                                    list hides the next real one behind it,
 *                                    and it is the exact residue an applied
 *                                    migration leaves if nobody tidies up.
 *
 * Deterministic, credential-free, network-free. The fixtures are built in a
 * temporary directory and removed; nothing under supabase/ is touched.
 *
 * Run: bun run deploy-plan-negative:check
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = path.join(root, "scripts/deploy-plan-check.ts");

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(detail ? `${name}\n        ${detail}` : name);
}

interface Run {
  readonly code: number;
  readonly out: string;
}

function runCheck(fixtureRoot?: string): Run {
  const args = [CHECK];
  if (fixtureRoot) args.push("--root", fixtureRoot);
  const r = spawnSync("bun", ["run", ...args], { encoding: "utf8" });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * A copy of the three inputs the check reads.
 *
 * `supabase/migrations` is copied rather than symlinked so a fixture can add a
 * file to it without touching the repository. It is ~270 small files; the
 * cost is a fraction of a second and the alternative is a test that can dirty
 * the working tree.
 */
function fixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-plan-fixture-"));
  mkdirSync(path.join(dir, "supabase"), { recursive: true });
  for (const f of ["hosted-ledger.json", "release-state.json", "migrations-policy.json"]) {
    cpSync(path.join(root, "supabase", f), path.join(dir, "supabase", f));
  }
  cpSync(path.join(root, "supabase/migrations"), path.join(dir, "supabase/migrations"), {
    recursive: true,
  });
  return dir;
}

const built: string[] = [];
function keep(dir: string): string {
  built.push(dir);
  return dir;
}

console.log("deploy-plan negative controls\n");

/* ------------------------------------------------------------------ */
/* 1 · The control                                                     */
/* ------------------------------------------------------------------ */

{
  const real = runCheck();
  ck("1 the repository as it stands passes", real.code === 0, real.out.trim().slice(-400));

  const state = JSON.parse(
    readFileSync(path.join(root, "supabase/release-state.json"), "utf8"),
  ) as {
    frontier: { file: string; hostedState: string }[];
  };
  const pending = state.frontier.filter((e) => e.hostedState === "pending").map((e) => e.file);
  // Whatever the reviewed set is, the printed plan has to BE it. Asserting
  // "passes" alone would also be satisfied by a check that had stopped
  // comparing anything at all.
  ck(
    `1b and the printed plan is exactly the ${pending.length} reviewed pending migration(s)`,
    pending.every((f) => real.out.includes(f)) &&
      (real.out.match(/^ {4}- \d{14}_/gm) ?? []).length === pending.length,
  );
}

/* ------------------------------------------------------------------ */
/* 2 · An unreviewed migration                                         */
/* ------------------------------------------------------------------ */

{
  const dir = keep(fixture());
  // A plausible-looking new migration nobody has recorded. The version is far
  // in the future so it cannot collide with a real ledger row.
  writeFileSync(
    path.join(dir, "supabase/migrations/29991231090000_unreviewed_change.sql"),
    "-- a migration nobody reviewed\nSELECT 1;\n",
    "utf8",
  );

  const r = runCheck(dir);
  ck("2 an unreviewed local-only migration FAILS the check", r.code !== 0);
  ck(
    "2b and the failure names the file rather than a count",
    r.out.includes("29991231090000_unreviewed_change.sql"),
  );
  ck(
    "2c and says where the reviewed answer is supposed to live",
    r.out.includes("release-state.json"),
  );
}

/* ------------------------------------------------------------------ */
/* 3 · A stale pending entry                                           */
/* ------------------------------------------------------------------ */

{
  const dir = keep(fixture());
  const statePath = path.join(dir, "supabase/release-state.json");
  const ledgerPath = path.join(dir, "supabase/hosted-ledger.json");

  const state = JSON.parse(readFileSync(statePath, "utf8")) as {
    frontier: { file: string; hostedState: string }[];
  };
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
    versions: { version: string; name: string }[];
  };

  // The world one moment AFTER a pending migration is applied and nobody has
  // updated release-state.json: the ledger has it, the frontier still calls it
  // pending. If nothing is pending, invent the same situation from the newest
  // applied entry, so this control does not quietly stop testing anything the
  // day the queue empties.
  const pending = state.frontier.filter((e) => e.hostedState === "pending");
  const target =
    pending[0] ?? state.frontier.filter((e) => e.hostedState === "applied").slice(-1)[0];
  if (!target) throw new Error("release-state.json has no frontier entry to build a fixture from");

  if (pending.length > 0) {
    ledger.versions.push({ version: target.file.slice(0, 14), name: "applied_but_still_pending" });
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), "utf8");
  } else {
    for (const e of state.frontier) if (e.file === target.file) e.hostedState = "pending";
    writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  }

  const r = runCheck(dir);
  ck("3 a pending entry the ledger already has FAILS the check", r.code !== 0);
  ck("3b and the failure names it as stale", /STALE pending entry/.test(r.out));
  ck("3c and names the file", r.out.includes(target.file));
}

/* ------------------------------------------------------------------ */
/* 4 · The gate is not the check                                       */
/* ------------------------------------------------------------------ */

{
  const r = spawnSync("bun", ["run", CHECK, "--gate"], { encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const state = JSON.parse(
    readFileSync(path.join(root, "supabase/release-state.json"), "utf8"),
  ) as {
    frontier: { hostedState: string }[];
  };
  const anyPending = state.frontier.some((e) => e.hostedState === "pending");

  // The check says "the plan is what we agreed". The gate says "the plan is
  // empty". They must not collapse into each other: a reviewed pending
  // migration is a legitimate CI state and an illegitimate DEPLOY state, and
  // the day those become the same sentence is the day a deploy runs with
  // something in flight.
  ck(
    anyPending
      ? "4 the gate still FAILS while a reviewed migration is pending"
      : "4 the gate passes because nothing is pending",
    anyPending ? (r.status ?? -1) !== 0 : (r.status ?? -1) === 0,
    out.trim().slice(-300),
  );
}

for (const dir of built) rmSync(dir, { recursive: true, force: true });

console.log("");
if (fails.length > 0) {
  console.error(`deploy-plan-negative-control FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "deploy-plan-negative:check OK (the derived baseline still refuses an unreviewed migration " +
    "and a stale pending entry, and the gate is still stricter than the check)",
);
