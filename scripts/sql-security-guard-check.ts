/**
 * SQL security guard — the source-level half of the security invariants.
 *
 * ── WHY THIS EXISTS ALONGSIDE THE DATABASE SUITE ─────────────────────────
 *
 * supabase/tests/security_hardening_test.sql is the stronger guard: it asks the
 * REPLAYED SCHEMA whether the properties hold, so it catches a violation
 * however it arrived — including one introduced by a dynamic DO block that no
 * amount of reading can predict. But it only runs in the database job, which
 * needs a PostgreSQL service, and only once the whole history has replayed.
 *
 * This script reads the SQL instead. It runs in the fast lint job, it names the
 * exact file and line, and it catches a violation in a migration that never
 * gets as far as replaying. The two overlap on purpose: a guard with one
 * enforcement point is a guard with one thing to switch off.
 *
 * ── IT JUDGES THE FINAL STATE, NOT THE HISTORY ───────────────────────────
 *
 * A migration history is append-only, so the *statement* that introduced a
 * finding stays in the repository forever. Flagging it would mean the guard can
 * never go green, which trains everyone to ignore it. So this replays the
 * grants, policies and function definitions in filename order and reports only
 * what SURVIVES: a policy that a later migration dropped is not a finding, and
 * a grant that a later migration revoked is not a finding.
 *
 * ── WHAT IT ENFORCES, ON THE SURVIVING STATE ─────────────────────────────
 *
 *   1. Every SECURITY DEFINER function has an explicit search_path.
 *   2. No SECURITY DEFINER function is reachable by anon or PUBLIC unless it is
 *      in the reviewed allowlist below. A function starts life reachable — that
 *      is PostgreSQL's default (EXECUTE to PUBLIC) AND Supabase's default
 *      privileges (EXECUTE to anon) — so this fires unless a REVOKE was
 *      written. Trigger functions are exempt: PostgreSQL refuses to call one
 *      outside a trigger, and their grants are asserted by the database suite.
 *   3. No surviving `WITH CHECK (true)` policy on a table that carries a
 *      user_id or session_id column. That is findings 2 and 3 exactly.
 *   4. No surviving explicit anon INSERT/ALL grant on such a table.
 *
 * ── THE ONE THING IT CANNOT SEE, AND WHO CATCHES IT ──────────────────────
 *
 * Rule 4 models EXPLICIT grants only. Supabase also ships ALTER DEFAULT
 * PRIVILEGES granting anon the full set on every new table in `public`, which
 * no amount of reading this repository reveals — the grant is not written here.
 * That half is caught in the database, by security_hardening_test.sql running
 * against a replay that reproduces those defaults (20260817190000,
 * 20260817210000 and 20260916090000). Neither layer is sufficient alone, and
 * saying so is better than a guard that pretends to cover both.
 *
 * Run: bun run sql-security:check
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");

/**
 * SECURITY DEFINER functions an unauthenticated visitor is allowed to execute.
 * Each entry is a reviewed decision, recorded here so that widening the
 * anonymous surface is a diff somebody approves:
 *
 *   cd_get_shared_report        the /p/<token> share read. Returns only the
 *                               fields the candidate chose to publish, and only
 *                               for a token that has not been revoked.
 *   employer_is_active_status   named inside the jobs_public_active_select RLS
 *                               policy. Policy expressions DO check EXECUTE, so
 *                               without this the public job board goes blank.
 *   cd_record_funnel_event      anonymous funnel tracking. No user_id parameter
 *                               exists; it is derived from auth.uid().
 *   cd_submit_test_feedback     anonymous test-group feedback. Same rule.
 */
const ANON_EXECUTABLE_ALLOWLIST = new Set([
  "cd_get_shared_report",
  "employer_is_active_status",
  "cd_record_funnel_event",
  "cd_submit_test_feedback",
]);

/**
 * Column names that make a row belong to somebody. `WITH CHECK (true)` on a
 * table without one is an open write to shared content — usually deliberate.
 * On a table WITH one it means the row's owner is whatever the caller typed.
 */
const IDENTITY_COLUMNS = ["user_id", "session_id"];

interface Finding {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// A small SQL lexer.
//
// Regexes alone are not safe here: `SECURITY DEFINER` appears inside function
// bodies and inside comments, and `;` appears inside dollar-quoted bodies. So
// the input is walked once, comments are blanked (with newlines preserved, so
// line numbers stay honest), and dollar-quoted bodies and string literals are
// kept intact but recorded, letting the statement splitter ignore semicolons
// inside them.
// ---------------------------------------------------------------------------

interface Statement {
  text: string;
  line: number;
}

function splitStatements(sql: string): Statement[] {
  const out: Statement[] = [];
  let buf = "";
  let line = 1;
  let startLine = 1;
  let i = 0;

  const push = () => {
    if (buf.trim().length > 0) out.push({ text: buf, line: startLine });
    buf = "";
    startLine = line;
  };

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      while (i < sql.length && sql[i] !== "\n") {
        buf += " ";
        i += 1;
      }
      continue;
    }

    if (two === "/*") {
      let depth = 0;
      while (i < sql.length) {
        if (sql.slice(i, i + 2) === "/*") {
          depth += 1;
          buf += "  ";
          i += 2;
          continue;
        }
        if (sql.slice(i, i + 2) === "*/") {
          depth -= 1;
          buf += "  ";
          i += 2;
          if (depth === 0) break;
          continue;
        }
        if (sql[i] === "\n") {
          buf += "\n";
          line += 1;
        } else {
          buf += " ";
        }
        i += 1;
      }
      continue;
    }

    if (sql[i] === "'") {
      buf += sql[i];
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          buf += "''";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          buf += "'";
          i += 1;
          break;
        }
        if (sql[i] === "\n") line += 1;
        buf += sql[i];
        i += 1;
      }
      continue;
    }

    const dollar = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      buf += tag;
      i += tag.length;
      const close = sql.indexOf(tag, i);
      const body = close === -1 ? sql.slice(i) : sql.slice(i, close + tag.length);
      line += (body.match(/\n/g) ?? []).length;
      buf += body;
      i = close === -1 ? sql.length : close + tag.length;
      continue;
    }

    if (sql[i] === ";") {
      buf += ";";
      i += 1;
      push();
      continue;
    }

    if (sql[i] === "\n") line += 1;
    buf += sql[i];
    i += 1;
  }
  push();
  return out;
}

/** A statement with dollar-quoted bodies blanked, so option clauses are safe to match. */
function withoutBodies(stmt: string): string {
  return stmt.replace(/\$([A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$\1?\$/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

function grantees(list: string): string[] {
  return list
    .split(",")
    .map((g) => g.trim().toLowerCase().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Net-effect state, replayed in filename order
// ---------------------------------------------------------------------------

interface FnState {
  definer: boolean;
  searchPath: boolean;
  returnsTrigger: boolean;
  /** Grantees that can reach EXECUTE. Seeded at creation with the two defaults. */
  reach: Set<string>;
  file: string;
  line: number;
}

const fns = new Map<string, FnState>();
const policies = new Map<
  string,
  { table: string; open: boolean; roles: string[]; file: string; line: number }
>();

/**
 * Roles that already bypass row-level security, so a permissive policy naming
 * only them grants nothing it did not already have. service_role is Supabase's
 * BYPASSRLS role; postgres owns the schema. A `WITH CHECK (true)` policy scoped
 * to these is not a finding — flagging it would be noise that teaches people to
 * ignore the rule that catches the real ones.
 */
const RLS_EXEMPT_ROLES = new Set(["service_role", "postgres", "supabase_admin"]);
const tableGrants = new Map<string, Map<string, Set<string>>>();
const identityColumns = new Map<string, string[]>();

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Pass 1 — which tables carry an identity column, anywhere in the history.
for (const file of files) {
  for (const { text } of splitStatements(readFileSync(join(MIGRATIONS, file), "utf8"))) {
    const create =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\(([\s\S]*)\)/i.exec(
        withoutBodies(text),
      );
    if (create) {
      const found = IDENTITY_COLUMNS.filter((c) => new RegExp(`\\b${c}\\b`).test(create[2]));
      if (found.length > 0) {
        const t = create[1].toLowerCase();
        identityColumns.set(t, [...new Set([...(identityColumns.get(t) ?? []), ...found])]);
      }
      continue;
    }
    const add =
      /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/i.exec(
        withoutBodies(text),
      );
    if (add && IDENTITY_COLUMNS.includes(add[2].toLowerCase())) {
      const t = add[1].toLowerCase();
      identityColumns.set(t, [
        ...new Set([...(identityColumns.get(t) ?? []), add[2].toLowerCase()]),
      ]);
    }
  }
}

// Pass 2 — replay definitions, grants and policies.
for (const file of files) {
  for (const { text, line } of splitStatements(readFileSync(join(MIGRATIONS, file), "utf8"))) {
    const opts = withoutBodies(text);

    // ---- CREATE [OR REPLACE] FUNCTION -------------------------------------
    const fn =
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\(/i.exec(opts);
    if (fn) {
      const name = fn[1].toLowerCase();
      const prior = fns.get(name);
      fns.set(name, {
        definer: /\bSECURITY\s+DEFINER\b/i.test(opts),
        searchPath: /\bSET\s+search_path\s*(?:=|TO)/i.test(opts),
        returnsTrigger: /\bRETURNS\s+trigger\b/i.test(opts),
        // CREATE OR REPLACE keeps the existing ACL; a genuinely new function
        // arrives reachable by PUBLIC (PostgreSQL) and by anon (Supabase's
        // ALTER DEFAULT PRIVILEGES). That default is how save_career_report
        // became callable by anyone holding the publishable key.
        reach: prior ? prior.reach : new Set(["public", "anon", "authenticated"]),
        file,
        line,
      });
      continue;
    }

    // ---- DROP FUNCTION ----------------------------------------------------
    const dropFn = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?/i.exec(
      opts,
    );
    if (dropFn) {
      fns.delete(dropFn[1].toLowerCase());
      continue;
    }

    // ---- ALTER FUNCTION ... SET search_path -------------------------------
    const alterFn =
      /ALTER\s+FUNCTION\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\([\s\S]*?\)\s*SET\s+search_path/i.exec(
        opts,
      );
    if (alterFn) {
      const st = fns.get(alterFn[1].toLowerCase());
      if (st) st.searchPath = true;
      continue;
    }

    // ---- GRANT / REVOKE on a FUNCTION -------------------------------------
    const fnPriv =
      /(GRANT|REVOKE)\s+(?:GRANT\s+OPTION\s+FOR\s+)?([A-Za-z,\s]+?)\s+ON\s+FUNCTION\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\([\s\S]*?\)\s*(?:TO|FROM)\s+([^;]+);/i.exec(
        opts,
      );
    if (fnPriv) {
      const [, verb, privs, name, list] = fnPriv;
      const st = fns.get(name.toLowerCase());
      if (st && /\b(ALL|EXECUTE)\b/i.test(privs)) {
        for (const g of grantees(list)) {
          if (verb.toUpperCase() === "GRANT") st.reach.add(g);
          else st.reach.delete(g);
        }
      }
      continue;
    }

    // ---- CREATE / DROP POLICY ---------------------------------------------
    const createPol =
      /CREATE\s+POLICY\s+"?([a-zA-Z0-9_ ]+)"?\s+ON\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?([\s\S]*)/i.exec(
        opts,
      );
    if (createPol) {
      const [, pol, table, body] = createPol;
      // A policy with no TO clause applies to PUBLIC — that is PostgreSQL's
      // default, and it is the broadest possible audience, so an absent clause
      // must read as "everyone" rather than as "unknown, skip".
      const toClause = /\bTO\s+([A-Za-z0-9_,\s"]+?)\s+(?:USING|WITH\s+CHECK)\b/i.exec(body);
      policies.set(`${table.toLowerCase()}.${pol.trim().toLowerCase()}`, {
        table: table.toLowerCase(),
        open: /WITH\s+CHECK\s*\(\s*true\s*\)/i.test(body),
        roles: toClause ? grantees(toClause[1]) : ["public"],
        file,
        line,
      });
      continue;
    }
    const dropPol =
      /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z0-9_ ]+)"?\s+ON\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i.exec(
        opts,
      );
    if (dropPol) {
      policies.delete(`${dropPol[2].toLowerCase()}.${dropPol[1].trim().toLowerCase()}`);
      continue;
    }

    // ---- GRANT / REVOKE on a TABLE ----------------------------------------
    const tblPriv =
      /(GRANT|REVOKE)\s+(?:GRANT\s+OPTION\s+FOR\s+)?([A-Za-z,\s]+?)\s+ON\s+(?:TABLE\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*(?:TO|FROM)\s+([^;]+);/i.exec(
        opts,
      );
    if (tblPriv) {
      const [, verb, privs, table, list] = tblPriv;
      const t = table.toLowerCase();
      if (!tableGrants.has(t)) tableGrants.set(t, new Map());
      const byGrantee = tableGrants.get(t)!;
      const set = /\bALL\b/i.test(privs)
        ? ["insert", "update", "delete", "select", "truncate"]
        : privs
            .split(",")
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean);
      for (const g of grantees(list)) {
        if (!byGrantee.has(g)) byGrantee.set(g, new Set());
        for (const p of set) {
          if (verb.toUpperCase() === "GRANT") byGrantee.get(g)!.add(p);
          else byGrantee.get(g)!.delete(p);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report on what survived
// ---------------------------------------------------------------------------

const findings: Finding[] = [];

for (const [name, st] of fns) {
  if (!st.definer) continue;

  if (!st.searchPath) {
    findings.push({
      file: st.file,
      line: st.line,
      rule: "definer-search-path",
      detail:
        `public.${name}() is SECURITY DEFINER with no explicit search_path.\n` +
        `      Add  SET search_path = public, pg_temp  to the definition. Without it the\n` +
        `      CALLER chooses which schema an unqualified name resolves in, inside a\n` +
        `      function that runs with its owner's privileges.`,
    });
  }

  // A trigger function's grants are irrelevant to reachability: PostgreSQL
  // refuses to invoke one outside a trigger context. The database suite still
  // asserts that none of them is granted, as hygiene.
  if (st.returnsTrigger) continue;

  const reachesAnon = st.reach.has("anon") || st.reach.has("public");
  if (reachesAnon && !ANON_EXECUTABLE_ALLOWLIST.has(name)) {
    findings.push({
      file: st.file,
      line: st.line,
      rule: "definer-anon-execute",
      detail:
        `public.${name}() is SECURITY DEFINER and is still reachable by ` +
        `${[...st.reach].filter((g) => g === "anon" || g === "public").join(" and ")}.\n` +
        `      A definer function runs with its owner's privileges, and BOTH PostgreSQL\n` +
        `      (EXECUTE to PUBLIC) and Supabase (default privileges to anon) grant that\n` +
        `      at creation — so silence is a grant. Add\n` +
        `        REVOKE ALL ON FUNCTION public.${name}(...) FROM PUBLIC, anon;\n` +
        `      or, if it is genuinely public, add it to ANON_EXECUTABLE_ALLOWLIST here\n` +
        `      with the reason.`,
    });
  }
}

for (const [key, pol] of policies) {
  if (!pol.open) continue;
  const identity = identityColumns.get(pol.table);
  if (!identity) continue;
  // Only an audience that RLS actually constrains can be over-granted by this.
  if (pol.roles.every((r) => RLS_EXEMPT_ROLES.has(r))) continue;
  findings.push({
    file: pol.file,
    line: pol.line,
    rule: "open-with-check",
    detail:
      `policy "${key.split(".").slice(1).join(".")}" on public.${pol.table} uses ` +
      `WITH CHECK (true),\n      and that table carries ${identity.join(" and ")}. The row's owner is then\n` +
      `      whatever the caller sends. Derive it from auth.uid() in a SECURITY DEFINER\n` +
      `      entry point instead, or constrain the policy to the caller's own rows.`,
  });
}

for (const [table, byGrantee] of tableGrants) {
  const identity = identityColumns.get(table);
  if (!identity) continue;
  for (const g of ["anon", "public"]) {
    if (byGrantee.get(g)?.has("insert")) {
      findings.push({
        file: "(net effect across the migration history)",
        line: 0,
        rule: "anon-write-identity-table",
        detail:
          `public.${table} carries ${identity.join(" and ")} and still grants INSERT to ${g}.\n` +
          `      An anonymous caller can then write whatever identity it likes into the row.\n` +
          `      Route the write through a SECURITY DEFINER entry point that derives it.`,
      });
    }
  }
}

console.log(`sql-security-guard-check: ${files.length} migrations replayed in filename order`);
console.log(
  `  SECURITY DEFINER functions surviving:      ${[...fns.values()].filter((f) => f.definer).length}`,
);
console.log(`  reviewed anon-executable definer functions: ${ANON_EXECUTABLE_ALLOWLIST.size}`);
console.log(`  identity-bearing tables tracked:            ${identityColumns.size}`);
console.log(`  policies surviving:                        ${policies.size}`);

if (findings.length > 0) {
  console.error(`\nsql-security-guard-check FAILED (${findings.length} finding(s)):\n`);
  for (const f of findings) {
    const where = f.line > 0 ? `supabase/migrations/${f.file}:${f.line}` : f.file;
    console.error(`  - [${f.rule}] ${where}`);
    console.error(`      ${f.detail}\n`);
  }
  process.exit(1);
}

console.log("\nOK: no surviving SECURITY DEFINER function is unpinned or unreviewably public,");
console.log("    and no identity-bearing table takes an unconstrained anonymous write.");
