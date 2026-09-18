/**
 * BESKT — the report independence boundary (20261124090000), asserted from
 * the real computation.
 *
 * ── WHAT THIS GUARD IS FOR ─────────────────────────────────────────────
 *
 * The SQL suite proves the behaviour over a replayed schema with real
 * authenticated sessions, but it runs only in the database job. This guard
 * runs in the fast job and reads the migration, the rollback, the suite and
 * the registration STRUCTURALLY — function bodies with comments stripped,
 * grant statements, the postflight, and the release bookkeeping — so a
 * defect that never reaches a replay is still caught.
 *
 * The one thing it must never do is pass on a reassuring comment. Every
 * assertion below reads code: a sentence in this migration saying the
 * preview is guarded proves nothing, and is stripped before matching.
 *
 * Every material assertion has a planted negative control in
 * scripts/negative-controls/beskt-report-independence-controls.ts.
 *
 * Run: bun run beskt-report-independence:check
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MIGRATION_NAME = "20261127090000_bcp_conduct_report_independence_boundary.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_NAME}`;
const ROLLBACK =
  "supabase/rollback/20261127090000_bcp_conduct_report_independence_boundary_rollback.sql";
const SUITE = "supabase/tests/bcp_conduct_report_independence_test.sql";
const PR6_SUITE = "supabase/tests/bcp_conduct_prompts_and_report_test.sql";
const DB_TEST = "scripts/db-test.sh";
const RELEASE_STATE = "supabase/release-state.json";
const FRONTIER = "scripts/release-frontier-check.ts";
const PKG = "package.json";
const CI = ".github/workflows/ci.yml";
const TSCONFIG = "tsconfig.scripts.json";

const fails: string[] = [];
let passed = 0;
function check(ok: boolean, label: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok ${label}`);
  } else {
    fails.push(label);
    console.log(`  FAIL ${label}`);
  }
}

/** SQL with every comment removed. A rule must be satisfied by CODE. */
const sql = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

/** The body of one CREATE OR REPLACE FUNCTION, comments stripped. */
function functionBody(src: string, name: string): string | null {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "m",
  );
  const m = re.exec(src);
  return m ? sql(m[0]) : null;
}

if (!existsSync(join(ROOT, MIGRATION))) {
  console.error(`BOUNDARY-MIGRATION: ${MIGRATION_NAME} is missing`);
  process.exit(1);
}

const migration = read(MIGRATION);
const migrationSql = sql(migration);
const rollback = read(ROLLBACK);
const rollbackSql = sql(rollback);
const suite = read(SUITE);

/* ================================================================== */
console.log("\nB1 · The preview applies the independence rule");

const preview = functionBody(migration, "bcp_conduct_preview_report");
check(preview !== null, "BOUNDARY-PREVIEW: the migration re-creates bcp_conduct_preview_report");

check(
  preview !== null && /IF NOT public\.bcp_conduct_may_see_others\(_session_id\) THEN/.test(preview),
  "BOUNDARY-PREVIEW: it refuses unless bcp_conduct_may_see_others(_session_id) is true",
);

check(
  preview !== null && /BCP_CONDUCT_NOT_VISIBLE_YET/.test(preview),
  "BOUNDARY-PREVIEW: and the refusal is named BCP_CONDUCT_NOT_VISIBLE_YET, which is already translated",
);

check(
  // Anchored to the NOT_VISIBLE_YET raise specifically. The preview raises
  // insufficient_privilege three times — for not-authenticated and for
  // not-permitted as well — so a bare match for the errcode survived
  // downgrading the one that carries the new boundary.
  preview !== null &&
    /BCP_CONDUCT_NOT_VISIBLE_YET[\s\S]{0,200}?USING ERRCODE = 'insufficient_privilege'/.test(
      preview,
    ),
  "BOUNDARY-PREVIEW: raised as insufficient_privilege, not as a check violation",
);

// Order matters: a stranger must learn "not your case", never the lifecycle
// state of a case that is none of their business.
check(
  preview !== null &&
    preview.indexOf("scp_iv_can_read_case") < preview.indexOf("bcp_conduct_may_see_others"),
  "BOUNDARY-PREVIEW: the case authority is checked BEFORE the independence rule",
);

// And the payload is only built after BOTH.
check(
  preview !== null &&
    preview.indexOf("bcp_conduct_may_see_others") <
      preview.indexOf("bcp_conduct_build_report_basis"),
  "BOUNDARY-PREVIEW: the basis is built only after the independence rule has passed",
);

check(
  preview !== null && /public\.scp_iv_can_read_case\(_s\.case_id\)/.test(preview),
  "BOUNDARY-PREVIEW: the existing case authority is kept, not replaced",
);

/* ================================================================== */
console.log("\nB2 · The blocker reader authenticates and applies the case authority");

const blockers = functionBody(migration, "bcp_conduct_report_blockers");
check(blockers !== null, "BOUNDARY-BLOCKERS: the migration re-creates bcp_conduct_report_blockers");

check(
  blockers !== null && /IF auth\.uid\(\) IS NULL THEN/.test(blockers),
  "BOUNDARY-BLOCKERS: it authenticates — it had no authentication at all before",
);

check(
  blockers !== null && /IF NOT public\.scp_iv_can_read_case\(_s\.case_id\) THEN/.test(blockers),
  "BOUNDARY-BLOCKERS: and applies the case authority",
);

check(
  blockers !== null &&
    blockers.indexOf("auth.uid() IS NULL") < blockers.indexOf("scp_iv_can_read_case"),
  "BOUNDARY-BLOCKERS: authentication comes first, so an anonymous caller never reaches a case lookup",
);

// It must still ANSWER a permitted caller: the whole point of keeping it open
// is that a screen can say what is missing without the document.
check(
  blockers !== null &&
    /BCP_CONDUCT_NOTHING_DOCUMENTED/.test(blockers) &&
    /BCP_CONDUCT_POSITION_OPEN/.test(blockers) &&
    /BCP_CONDUCT_PANEL_REQUIRED/.test(blockers),
  "BOUNDARY-BLOCKERS: the blocker vocabulary survives, so 'what is missing' is still answerable",
);

/* ================================================================== */
console.log("\nB3 · Nothing else is touched, and no oracle is left open");

check(
  !/CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE POLICY|DROP POLICY|ALTER POLICY/.test(migrationSql),
  "BOUNDARY-SCOPE: no table and no policy is changed — this migration edits two functions",
);

check(
  (migrationSql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length === 2,
  "BOUNDARY-SCOPE: exactly two functions are re-created, no more",
);

check(
  !/INSERT INTO|UPDATE\s+public\.|DELETE FROM/.test(migrationSql),
  "BOUNDARY-SCOPE: no row is written — a security fix that seeds data is two changes",
);

// The helper that actually reads past the row policies must stay internal,
// or the fix is decorative.
check(
  /has_function_privilege\('authenticated',\s*\n?\s*'public\.bcp_conduct_build_report_basis\(uuid\)'/.test(
    migrationSql,
  ) && /BCP_CONDUCT_REPORT_BOUNDARY_PROOF/.test(migrationSql),
  "BOUNDARY-ORACLE: the postflight refuses if bcp_conduct_build_report_basis became client-callable",
);

check(
  !/GRANT EXECUTE ON FUNCTION public\.bcp_conduct_build_report_basis/.test(migrationSql),
  "BOUNDARY-ORACLE: and the migration does not grant it to anybody",
);

check(
  /REVOKE ALL ON FUNCTION public\.bcp_conduct_preview_report\(uuid\) FROM PUBLIC, anon;/.test(
    migrationSql,
  ) &&
    /REVOKE ALL ON FUNCTION public\.bcp_conduct_report_blockers\(uuid\) FROM PUBLIC, anon;/.test(
      migrationSql,
    ),
  "BOUNDARY-GRANTS: both readers are revoked from PUBLIC and anon",
);

check(
  /GRANT EXECUTE ON FUNCTION public\.bcp_conduct_preview_report\(uuid\) TO authenticated, service_role;/.test(
    migrationSql,
  ) &&
    /GRANT EXECUTE ON FUNCTION public\.bcp_conduct_report_blockers\(uuid\) TO authenticated, service_role;/.test(
      migrationSql,
    ),
  "BOUNDARY-GRANTS: and granted to exactly authenticated and service_role, as before",
);

check(
  // Counted on the FUNCTION HEADERS, not on the file: the postflight's own
  // error text says "SECURITY DEFINER functions" and a naive count of the
  // phrase found three where there are two functions.
  (
    migrationSql.match(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = public/g,
    ) ?? []
  ).length === 2,
  "BOUNDARY-DEFINER: both keep SECURITY DEFINER with a pinned search_path",
);

/* ================================================================== */
console.log("\nB4 · The postflight proves the migration's own claims");

for (const [needle, label] of [
  ["position('bcp_conduct_may_see_others' in _src)", "the preview calls the canonical predicate"],
  ["position('scp_iv_can_read_case' in _src)", "the readers keep their case authority"],
  ["position('auth.uid() IS NULL' in _src)", "the blocker reader authenticates"],
  ["p.prosecdef", "both stay SECURITY DEFINER"],
  ["has_function_privilege('anon'", "neither is anon-executable"],
] as const) {
  check(
    migrationSql.includes(needle),
    `BOUNDARY-POSTFLIGHT: it re-proves against the catalogue that ${label}`,
  );
}

check(
  /IF _n <> 1 THEN[\s\S]*?overloads of bcp_conduct_preview_report/.test(migrationSql),
  "BOUNDARY-POSTFLIGHT: and that exactly one overload of each signature exists",
);

check(
  /to_regprocedure\('public\.bcp_conduct_may_see_others\(uuid\)'\) IS NULL/.test(migrationSql),
  "BOUNDARY-PRECONDITION: it refuses on a base that lacks the predicate it leans on",
);

/* ================================================================== */
console.log("\nB5 · The rollback genuinely restores, and says what that costs");

check(
  !/bcp_conduct_may_see_others/.test(
    functionBody(rollback, "bcp_conduct_preview_report") ?? "bcp_conduct_may_see_others",
  ),
  "BOUNDARY-ROLLBACK: the restored preview does NOT carry the independence check",
);

check(
  !/scp_iv_can_read_case/.test(
    functionBody(rollback, "bcp_conduct_report_blockers") ?? "scp_iv_can_read_case",
  ),
  "BOUNDARY-ROLLBACK: and the restored blocker reader does NOT carry the case authority",
);

check(
  /REOPENS two authorisation holes/.test(rollback),
  "BOUNDARY-ROLLBACK: it states, in the file somebody runs at two in the morning, that it reopens the holes",
);

check(
  /BCP_CONDUCT_BOUNDARY_ROLLBACK/.test(rollbackSql) && /RAISE EXCEPTION/.test(rollbackSql),
  "BOUNDARY-ROLLBACK: and proves the restoration rather than assuming it",
);

check(
  /^BEGIN;/m.test(rollbackSql) && /^COMMIT;/m.test(rollbackSql),
  "BOUNDARY-ROLLBACK: one transaction, so a failure restores nothing rather than half of it",
);

/* ================================================================== */
console.log("\nB6 · The suite proves behaviour, not shape");

check(
  // Two things, because the suite legitimately does BOTH kinds of work.
  //
  // Fixture SEEDING runs as the owner on purpose -- that is how rows get
  // planted past the very policies the assertions then probe -- so a blanket
  // "every become is paired with a role switch" rule was simply wrong, and
  // failed on inherited setup that is doing the right thing.
  //
  // What must be true is that every ASSERTION acts through the real role:
  // the refusals go through must_fail_as('authenticated', ...), which sets
  // it internally, and the one place this suite switches the role by hand --
  // the B0.2 proof that the predicate really is false -- does so explicitly.
  (suite.match(/must_fail_as\('authenticated'/g) ?? []).length >= 8 &&
    /PERFORM pg_temp\.become\(_r\.rec_a\); SET LOCAL ROLE authenticated;\s*\n\s*PERFORM pg_temp\.ok\(\s*\n\s*NOT public\.bcp_conduct_may_see_others/.test(
      suite,
    ),
  "BOUNDARY-SUITE: it acts through the real `authenticated` role, not as the owner",
);
check(
  /pg_temp\.must_fail_as\('authenticated'[\s\S]*?BCP_CONDUCT_NOT_VISIBLE_YET/.test(suite),
  "BOUNDARY-SUITE: an assessor with an open position is refused BY NAME",
);

check(
  /KANARIE-AS2-IAKTTAGELSE/.test(suite) &&
    /position\('KANARIE-AS2-IAKTTAGELSE' in _blob\) = 0/.test(suite),
  "BOUNDARY-SUITE: and the colleague's own words are searched for in the whole answer, not in one field",
);

check(
  // The canaries are the ARGUMENTS and the label is the last one, so the
  // label cannot be the left anchor of the match.
  /KANARIE-AS2-IAKTTAGELSE' in _blob\) > 0[\s\S]*?KANARIE-REC-A-IAKTTAGELSE' in _blob\) > 0[\s\S]*?B5\.3/.test(
    suite,
  ),
  "BOUNDARY-SUITE: after the lock BOTH assessors are present — the fix is not a wall",
);

check(
  /bcp_conduct_reopen_position/.test(suite) &&
    /'BCP_CONDUCT_NOT_VISIBLE_YET',\s*\n\s*'B6\.2/.test(suite),
  "BOUNDARY-SUITE: reopening closes it again, so the boundary is a live predicate not a latch",
);

check(
  // Each refusal is required by its own LABEL as well as its needle. An
  // actor-plus-needle match was satisfied by any ONE of that actor's
  // refusals, so deleting the candidate's REPORT refusal went unnoticed
  // while their blocker refusal kept the pattern alive.
  [
    "'B2.1 another employer is refused the report'",
    "'B2.2 and is refused the blocker list too",
    "'B2.3 the candidate is refused the report'",
    "'B2.4 and the candidate is refused the blocker list'",
  ].every((label) => suite.includes(label)) &&
    (suite.match(/'BCP_CONDUCT_NOT_PERMITTED',/g) ?? []).length >= 6,
  "BOUNDARY-SUITE: another employer and the candidate are both refused",
);

check(
  /gen_random_uuid\(\)[\s\S]*?roleless authenticated user is refused the blocker list/.test(suite),
  "BOUNDARY-SUITE: and a roleless authenticated user is refused the reader that used to answer anyone",
);

check(
  /bcp_conduct_build_report_basis[\s\S]*?'permission denied'/.test(suite),
  "BOUNDARY-SUITE: the internal helper is proved unreachable by calling it, not by reading a grant",
);

/* ================================================================== */
console.log("\nB7 · The PR 6 suite no longer asserts the hole");

const pr6 = read(PR6_SUITE);
check(
  !/_prev -> 'blockers' @> '\[\{"code":"BCP_CONDUCT_NOTHING_DOCUMENTED"\}\]'::jsonb/.test(pr6) &&
    !/_prev -> 'blockers' @> '\[\{"code":"BCP_CONDUCT_POSITION_OPEN"\}\]'::jsonb/.test(pr6),
  "BOUNDARY-PR6: it no longer reads a blocker through a preview the caller may not have",
);

check(
  /'BCP_CONDUCT_NOT_VISIBLE_YET',\s*\n\s*'R1\.1a/.test(pr6),
  "BOUNDARY-PR6: and it asserts the refusal instead, so the corrected contract is pinned there too",
);

check(
  /R1\.1 an empty conversation is blocked for having nothing to report/.test(pr6) &&
    /R1\.2 an open position blocks the report/.test(pr6),
  "BOUNDARY-PR6: while both original FACTS are still asserted, from the blocker reader",
);

/* ================================================================== */
console.log("\nB8 · Registration");

const dbTest = read(DB_TEST);
check(
  dbTest.includes("bcp_conduct_report_independence_test.sql"),
  "BOUNDARY-REGISTRATION: db-test.sh runs the suite",
);

check(
  /RIB_PASSED" -lt 24/.test(dbTest),
  "BOUNDARY-REGISTRATION: and refuses a run in which the suite silently shrank",
);

check(
  dbTest.includes("20261127090000_bcp_conduct_report_independence_boundary_rollback.sql") &&
    dbTest.includes("20261127090000_bcp_conduct_report_independence_boundary.sql"),
  "BOUNDARY-REGISTRATION: the rollback is run for real and the migration re-applied",
);

check(
  /the rollback ran but the independence check is still in place/.test(dbTest),
  "BOUNDARY-REGISTRATION: with the hole PROVED open in between, so a no-op rollback cannot pass",
);

check(
  /suite_failed "BESKT report independence boundary"/.test(dbTest),
  "BOUNDARY-REGISTRATION: and a failure actually fails the run",
);

check(
  // PR 6's own rollback/re-apply block runs LATER and CREATE OR REPLACEs both
  // readers back to their unguarded definitions. Without re-applying the
  // boundary on top, the replayed schema stops matching the repository and
  // any future suite after that point would run against the hole while CI
  // stayed green — the trap PR #264 found in the Passport rollback loop.
  /re-applied PR 6/.test(dbTest) &&
    /PR 6 was re-applied and the independence boundary did NOT come back with it/.test(dbTest),
  "BOUNDARY-REGISTRATION: the boundary is re-applied after PR 6's re-apply, and proved back",
);

check(
  // The BESKT block unwinds PR 6 and then restores the chain it stood down.
  // Restoring PR 2-4 alone leaves the run ending without the report readers;
  // restoring PR 6 without the boundary leaves them unguarded. Both must come
  // back, in that order, and a run that ends without the boundary must fail.
  /20261113090000_bcp_interview_conduct\.sql >\/dev\/null\n[\s\S]{0,600}?20261117090000_bcp_conduct_prompts_and_report\.sql >\/dev\/null\npsql[^\n]*\n\s*-f supabase\/migrations\/20261127090000_bcp_conduct_report_independence_boundary\.sql >\/dev\/null/.test(
    dbTest,
  ) &&
    /suite_failed "BESKT report independence boundary \(end state\)"/.test(dbTest),
  "BOUNDARY-REGISTRATION: the BESKT block ends with PR 6 and the boundary back on top, and a run that ends without it fails",
);

const pkg = read(PKG);
check(
  /"beskt-report-independence:check":/.test(pkg),
  "BOUNDARY-REGISTRATION: the guard is registered as a script",
);
check(
  /"negative-controls:beskt-report-independence":/.test(pkg) &&
    /negative-controls:beskt-report-independence/.test(
      /"negative-controls:all":\s*"([^"]+)"/.exec(pkg)?.[1] ?? "",
    ),
  "BOUNDARY-REGISTRATION: its controls run as part of negative-controls:all",
);
check(
  read(CI).includes("beskt-report-independence:check"),
  "BOUNDARY-REGISTRATION: CI runs the guard",
);
check(read(TSCONFIG).includes("scripts"), "BOUNDARY-REGISTRATION: the guard is typechecked");

/* ================================================================== */
console.log("\nB9 · Release bookkeeping tells the truth about production");

const state = JSON.parse(read(RELEASE_STATE)) as {
  frontier: Array<{ file?: string; hostedState?: string; note?: string; rollback?: string }>;
};
const entry = state.frontier.find((m) => m.file === MIGRATION_NAME);

check(entry !== undefined, "BOUNDARY-RELEASE: the migration is declared in release-state.json");
check(
  entry?.hostedState === "pending",
  "BOUNDARY-RELEASE: and declared PENDING — it is a fix to live production that has NOT been applied",
);
check(
  typeof entry?.note === "string" && /SECURITY FIX/.test(entry.note),
  "BOUNDARY-RELEASE: the note says plainly that this is a security fix, not a refactor",
);
check(entry?.rollback === ROLLBACK, "BOUNDARY-RELEASE: and names how to undo it");
check(
  read(FRONTIER).includes(MIGRATION_NAME),
  "BOUNDARY-RELEASE: the frontier check expects exactly this pending migration",
);

/* ================================================================== */
console.log("");
if (fails.length > 0) {
  console.error(
    `BESKT report independence guard FAILED (${fails.length} of ${passed + fails.length}).`,
  );
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `BESKT report independence guard: ${passed} of ${passed} assertions passed. ` +
    "The boundary is in the database, not in the screen.",
);
