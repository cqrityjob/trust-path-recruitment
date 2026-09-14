/**
 * Source guard for the operator-only correction of public.cd_outstanding_reviews
 * (migration 20261116090000).
 *
 * ── WHY THIS EXISTS ALONGSIDE THE DATABASE SUITE ─────────────────────────
 *
 * supabase/tests/cd_outstanding_reviews_operator_only_test.sql is the stronger
 * guard: it asks the REPLAYED SCHEMA, with real principals, whether an
 * ordinary candidate reads zero rows. But it only runs in the database job.
 * This script reads the SQL instead, runs in the fast lint job, names the file
 * and the property, and catches a regression in a migration that never gets as
 * far as replaying.
 *
 * ── IT JUDGES THE FINAL STATE, NOT THE HISTORY ───────────────────────────
 *
 * Migration history is append-only, so the bare `CREATE OR REPLACE VIEW` in
 * 20260731100000 that caused this finding stays in the repository forever.
 * Flagging it would mean the guard can never go green. So this replays the
 * view declarations for cd_outstanding_reviews in filename order and judges
 * only the LAST one -- which is the one the database ends up with.
 *
 * ── THE PROPERTY IT DEFENDS ──────────────────────────────────────────────
 *
 * Both halves, because either alone is insufficient and that is the whole
 * lesson of this finding:
 *
 *   1. The surviving declaration sets security_invoker = true IN THE SAME
 *      STATEMENT. A later bare CREATE OR REPLACE VIEW resets reloptions --
 *      that is exactly how the defect arrived -- so "an ALTER VIEW somewhere
 *      earlier" is not good enough and is rejected as the last word.
 *   2. The surviving declaration carries the operator predicate
 *      cd_is_internal_tester(auth.uid()) in its body. Without it the permissive
 *      "live readable" RLS policy is OR-ed in and every pilot/active
 *      instrument's gates stay readable by everyone.
 *
 * It also defends the CONTRAST: scp_scoring_version_lineage must stay
 * security_invoker = false. That view's definer semantics are a reviewed
 * decision (20260801100000) and flipping it caused a real outage once.
 *
 * Run: bun run cd-outstanding-reviews:check
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");
const VIEW = "cd_outstanding_reviews";
const LINEAGE = "scp_scoring_version_lineage";

interface Failure {
  code: string;
  detail: string;
}

const failures: Failure[] = [];
const fail = (code: string, detail: string) => failures.push({ code, detail });

const files: string[] = readdirSync(MIGRATIONS)
  .filter((f: string) => f.endsWith(".sql"))
  .sort();

// ---------------------------------------------------------------------------
// Find the LAST declaration of each view, in replay order.
// ---------------------------------------------------------------------------

interface Declaration {
  file: string;
  pos: number;
  statement: string;
}

interface OptionEvent {
  file: string;
  pos: number;
  /** A CREATE [OR REPLACE] VIEW RESETS every reloption; an ALTER merges. */
  resets: boolean;
  invoker: boolean | null;
  barrier: boolean | null;
  raw: string;
}

/**
 * Matches `CREATE [OR REPLACE] VIEW public.<name> [WITH (...)] AS <body>` up to
 * the terminating semicolon that is not inside a string literal. The bodies
 * here contain no dollar quotes, so a literal-aware scan is enough.
 */
function declarationsOf(sql: string, view: string): Declaration[] {
  const out: Declaration[] = [];
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+(?:public\\.)?${view}\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    let i = m.index;
    let inString = false;
    while (i < sql.length) {
      const ch = sql[i];
      if (ch === "'") {
        if (inString && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        inString = !inString;
      } else if (ch === ";" && !inString) {
        break;
      }
      i += 1;
    }
    out.push({ file: "", pos: m.index, statement: sql.slice(m.index, i + 1) });
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Reads one reloption out of a WITH/SET clause; null when it is not mentioned. */
function optionIn(clause: string, name: string): boolean | null {
  const m = new RegExp(`${name}\\s*=\\s*(true|false)`, "i").exec(clause);
  return m === null ? null : m[1].toLowerCase() === "true";
}

/**
 * Every statement that can change this view's reloptions, in replay order:
 * declarations (which RESET them -- the whole cause of this finding) and
 * ALTER VIEW ... SET (...) (which merge only the options they mention).
 *
 * Ordered by (file, character position) so that an ALTER LATER IN THE SAME FILE
 * as the declaration is still seen as later. An earlier version of this guard
 * compared filenames only, and the negative control CDO-NC-ALTERED-BACK-LATER
 * proved that assertion dead.
 */
function optionEvents(view: string): OptionEvent[] {
  const events: OptionEvent[] = [];
  const alterRe = new RegExp(`ALTER\\s+VIEW\\s+(?:public\\.)?${view}\\s+SET\\s*\\(([^)]*)\\)`, "gi");

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");

    for (const decl of declarationsOf(sql, view)) {
      const withClause = /^[\s\S]*?\bAS\b/i.exec(decl.statement)?.[0] ?? "";
      events.push({
        file,
        pos: decl.pos,
        resets: true,
        invoker: optionIn(withClause, "security_invoker") ?? false,
        barrier: optionIn(withClause, "security_barrier") ?? false,
        raw: decl.statement,
      });
    }

    let m: RegExpExecArray | null;
    while ((m = alterRe.exec(sql)) !== null) {
      // An ALTER that mentions neither option changes nothing we track.
      const invoker = optionIn(m[1], "security_invoker");
      const barrier = optionIn(m[1], "security_barrier");
      if (invoker === null && barrier === null) continue;
      events.push({ file, pos: m.index, resets: false, invoker, barrier, raw: m[0] });
    }
  }

  return events.sort((a, b) =>
    a.file === b.file ? a.pos - b.pos : files.indexOf(a.file) - files.indexOf(b.file),
  );
}

/** Folds the events into the reloptions the database ends up with. */
function finalOptions(view: string): {
  invoker: boolean;
  barrier: boolean;
  lastDeclaration: OptionEvent | null;
  undoneBy: OptionEvent | null;
} {
  let invoker = false;
  let barrier = false;
  let lastDeclaration: OptionEvent | null = null;
  let undoneBy: OptionEvent | null = null;

  for (const e of optionEvents(view)) {
    if (e.resets) {
      invoker = e.invoker === true;
      barrier = e.barrier === true;
      lastDeclaration = e;
      undoneBy = null;
      continue;
    }
    if (e.invoker !== null) {
      // An ALTER that turns invoker OFF after a declaration that had it on is
      // the specific regression worth naming.
      if (invoker && !e.invoker) undoneBy = e;
      invoker = e.invoker;
    }
    if (e.barrier !== null) barrier = e.barrier;
  }

  return { invoker, barrier, lastDeclaration, undoneBy };
}

// ---------------------------------------------------------------------------
// 1. cd_outstanding_reviews must end operator-only.
// ---------------------------------------------------------------------------

const outstanding = finalOptions(VIEW);
const decl = outstanding.lastDeclaration;

if (decl === null) {
  fail(
    "CDO-GUARD-VIEW-MISSING",
    `no CREATE VIEW for public.${VIEW} survives in the migration history`,
  );
} else {
  if (outstanding.undoneBy !== null) {
    fail(
      "CDO-GUARD-ALTERED-BACK",
      `${outstanding.undoneBy.file} runs "${outstanding.undoneBy.raw.replace(/\s+/g, " ")}" AFTER the ` +
        `operator-only declaration of public.${VIEW}, turning it back into a definer view.`,
    );
  } else if (!outstanding.invoker) {
    fail(
      "CDO-GUARD-NOT-INVOKER",
      `public.${VIEW} ends as security_invoker = false. Its last declaration (${decl.file}) must set ` +
        `security_invoker = true IN THE SAME STATEMENT: a bare CREATE OR REPLACE VIEW RESETS reloptions -- ` +
        `that is how this finding arrived in 20260731100000.`,
    );
  }

  if (!outstanding.barrier) {
    fail(
      "CDO-GUARD-NOT-BARRIER",
      `public.${VIEW} ends as security_barrier = false (last declared in ${decl.file}). ` +
        `The view now carries a qual, so a caller-supplied function in an outer WHERE could be ` +
        `evaluated against rows before the operator predicate filters them.`,
    );
  }

  if (!/cd_is_internal_tester\s*\(\s*auth\.uid\(\)\s*\)/i.test(decl.raw)) {
    fail(
      "CDO-GUARD-NO-OPERATOR-PREDICATE",
      `the last declaration of public.${VIEW} (${decl.file}) has no cd_is_internal_tester(auth.uid()) gate ` +
        `in its body. security_invoker alone is NOT sufficient: the permissive "live readable" policy on ` +
        `cd_definition_versions is OR-ed in and keeps every pilot/active instrument's gates readable by ` +
        `every signed-in user.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. The contrast case must be left alone.
// ---------------------------------------------------------------------------

const lineage = finalOptions(LINEAGE);

if (lineage.lastDeclaration === null) {
  fail("CDO-GUARD-LINEAGE-MISSING", `public.${LINEAGE} no longer appears in the migration history`);
} else if (lineage.invoker) {
  fail(
    "CDO-GUARD-LINEAGE-FLIPPED",
    `public.${LINEAGE} ends as security_invoker = true. Its definer semantics are a REVIEWED decision ` +
      `(20260801100000): flipping it makes assessment lineage unreadable for candidates and employers, ` +
      `which is an outage this repository has already had once.`,
  );
}

// ---------------------------------------------------------------------------
// 3. The forward migration, its rollback and its suite must all still exist.
// ---------------------------------------------------------------------------

const FORWARD = "20261116090000_cd_outstanding_reviews_operator_only.sql";
const ROLLBACK = join(ROOT, "supabase/rollback/20261116090000_cd_outstanding_reviews_operator_only_rollback.sql");
const SUITE = join(ROOT, "supabase/tests/cd_outstanding_reviews_operator_only_test.sql");

if (!files.includes(FORWARD)) {
  fail("CDO-GUARD-FORWARD-MISSING", `${FORWARD} is not in the active migration path`);
} else {
  const fwd = readFileSync(join(MIGRATIONS, FORWARD), "utf8");
  if (!fwd.includes("CD_OUTSTANDING_REVIEWS_OPERATOR_ONLY_PROOF ok")) {
    fail("CDO-GUARD-POSTFLIGHT-GONE", `${FORWARD} no longer raises its postflight proof`);
  }
  if (!fwd.includes("CD_OUTSTANDING_REVIEWS_LEAKS_WITHOUT_PRINCIPAL")) {
    fail(
      "CDO-GUARD-POSTFLIGHT-WEAKENED",
      `${FORWARD} no longer asserts that the view is empty with no authenticated subject -- ` +
        `the one postflight check that proves the predicate is wired into the body.`,
    );
  }
  if (!/REVOKE\s+ALL\s+ON\s+public\.cd_outstanding_reviews\s+FROM\s+anon/i.test(fwd)) {
    fail("CDO-GUARD-ANON-NOT-REVOKED", `${FORWARD} does not revoke anon on the view`);
  }
}

for (const [path, code] of [
  [ROLLBACK, "CDO-GUARD-ROLLBACK-MISSING"],
  [SUITE, "CDO-GUARD-SUITE-MISSING"],
] as const) {
  try {
    const body = readFileSync(path, "utf8");
    if (body.trim().length === 0) fail(code, `${path} is empty`);
  } catch {
    fail(code, `${path} is missing`);
  }
}

// The suite must still exercise every principal the owner decision names.
try {
  const suite = readFileSync(SUITE, "utf8");
  for (const marker of ["CDO6", "CDO7", "CDO8", "CDO9", "CDO10", "CDO11", "CDO12"]) {
    if (!suite.includes(marker)) {
      fail(
        "CDO-GUARD-ACTOR-DROPPED",
        `the suite no longer contains assertion ${marker}; the actor matrix must keep covering anonymous, ` +
          `candidate, employer, cross-tenant employer, internal tester and platform administrator.`,
      );
    }
  }
} catch {
  /* already reported as missing above */
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`cd-outstanding-reviews-check: ${failures.length} failure(s)\n`);
  for (const f of failures) {
    console.error(`  ${f.code}`);
    console.error(`    ${f.detail}\n`);
  }
  process.exit(1);
}

console.log(
  `cd-outstanding-reviews-check: ${files.length} migrations scanned in filename order\n` +
    `  public.${VIEW}: last declared in ${decl?.file ?? "(unknown)"}, security_invoker = true, ` +
    `security_barrier = true, gated on cd_is_internal_tester(auth.uid())\n` +
    `  public.${LINEAGE}: still deliberately security_invoker = false (untouched)\n\n` +
    `OK: outstanding review gates are operator-only, and the reviewed definer view was left alone.`,
);
