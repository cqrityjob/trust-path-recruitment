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
  statement: string;
}

/**
 * Matches `CREATE [OR REPLACE] VIEW public.<name> [WITH (...)] AS <body>` up to
 * the terminating semicolon that is not inside a string literal. The bodies
 * here contain no dollar quotes, so a literal-aware scan is enough.
 */
function declarationsOf(sql: string, view: string): string[] {
  const out: string[] = [];
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
    out.push(sql.slice(m.index, i + 1));
  }
  return out;
}

function lastDeclaration(view: string): Declaration | null {
  let found: Declaration | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const statement of declarationsOf(sql, view)) {
      found = { file, statement };
    }
  }
  return found;
}

// Also track the last ALTER VIEW ... SET (...) so a contradictory later ALTER
// cannot pass unnoticed.
function lastAlterOptions(view: string): { file: string; options: string } | null {
  let found: { file: string; options: string } | null = null;
  const re = new RegExp(`ALTER\\s+VIEW\\s+(?:public\\.)?${view}\\s+SET\\s*\\(([^)]*)\\)`, "gi");
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      found = { file, options: m[1] };
    }
  }
  return found;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// ---------------------------------------------------------------------------
// 1. cd_outstanding_reviews must end operator-only.
// ---------------------------------------------------------------------------

const decl = lastDeclaration(VIEW);

if (decl === null) {
  fail("CDO-GUARD-VIEW-MISSING", `no CREATE VIEW for public.${VIEW} survives in the migration history`);
} else {
  const flat = norm(decl.statement);

  if (!flat.includes("security_invoker=true")) {
    fail(
      "CDO-GUARD-NOT-INVOKER",
      `the last declaration of public.${VIEW} (${decl.file}) does not set security_invoker = true in the same statement. ` +
        `A bare CREATE OR REPLACE VIEW RESETS reloptions -- that is how this finding arrived in 20260731100000.`,
    );
  }

  if (!flat.includes("security_barrier=true")) {
    fail(
      "CDO-GUARD-NOT-BARRIER",
      `the last declaration of public.${VIEW} (${decl.file}) does not set security_barrier = true. ` +
        `The view now carries a qual, so a caller-supplied function in an outer WHERE could be evaluated before it.`,
    );
  }

  if (!/cd_is_internal_tester\s*\(\s*auth\.uid\(\)\s*\)/i.test(decl.statement)) {
    fail(
      "CDO-GUARD-NO-OPERATOR-PREDICATE",
      `the last declaration of public.${VIEW} (${decl.file}) has no cd_is_internal_tester(auth.uid()) gate in its body. ` +
        `security_invoker alone is NOT sufficient: the permissive "live readable" policy on cd_definition_versions ` +
        `is OR-ed in and keeps every pilot/active instrument's gates readable by every signed-in user.`,
    );
  }

  const alter = lastAlterOptions(VIEW);
  if (alter !== null && files.indexOf(alter.file) > files.indexOf(decl.file)) {
    if (norm(alter.options).includes("security_invoker=false")) {
      fail(
        "CDO-GUARD-ALTERED-BACK",
        `${alter.file} runs ALTER VIEW public.${VIEW} SET (${alter.options}) AFTER the operator-only declaration, turning it back into a definer view.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. The contrast case must be left alone.
// ---------------------------------------------------------------------------

const lineageAlter = lastAlterOptions(LINEAGE);
const lineageDecl = lastDeclaration(LINEAGE);
const lineageIsInvoker = (() => {
  if (lineageAlter === null && lineageDecl === null) return null;
  if (lineageAlter === null) return norm(lineageDecl!.statement).includes("security_invoker=true");
  if (lineageDecl === null) return norm(lineageAlter.options).includes("security_invoker=true");
  return files.indexOf(lineageAlter.file) >= files.indexOf(lineageDecl.file)
    ? norm(lineageAlter.options).includes("security_invoker=true")
    : norm(lineageDecl.statement).includes("security_invoker=true");
})();

if (lineageIsInvoker === null) {
  fail("CDO-GUARD-LINEAGE-MISSING", `public.${LINEAGE} no longer appears in the migration history`);
} else if (lineageIsInvoker) {
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
    `  public.${VIEW}: last declared in ${decl!.file}, security_invoker = true, ` +
    `security_barrier = true, gated on cd_is_internal_tester(auth.uid())\n` +
    `  public.${LINEAGE}: still deliberately security_invoker = false (untouched)\n\n` +
    `OK: outstanding review gates are operator-only, and the reviewed definer view was left alone.`,
);
