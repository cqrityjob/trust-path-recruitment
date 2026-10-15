// The database and the application must say the same thing about one
// decision (Astra's recheck, 2026-10-15).
//
// For every case in supabase/tests/provenance_cases.json this compares:
//   * the DATABASE: the talent level and the decision notice that
//     supabase/tests/talent_provenance_test.sql reads for that case through
//     the real read path (sp_talent_entry_level, the decision trigger), and
//   * the APPLICATION: effectiveTrust() from src/lib/security-passport/
//     provenance.ts -- the existing provenance model every Passport surface
//     already reads -- for the same method, organisation and subject.
// Any disagreement fails, and so does a case whose expected answer either
// side does not give.
//
// Usage (disposable local database only; db-test.sh runs it):
//   TEST_DB=scp_ci_test bun run scripts/provenance-parity-check.ts
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { effectiveTrust } from "../src/lib/security-passport/provenance";

interface Case {
  id: string;
  subject: "claim" | "period";
  method: string;
  organisation: string;
  expected: "document_reviewed" | "employer_confirmed";
  why: string;
}

const db = process.env.TEST_DB ?? "";
if (
  !/^[a-zA-Z0-9_]+$/.test(db) ||
  !["127.0.0.1", "localhost"].includes(process.env.PGHOST ?? "127.0.0.1")
)
  throw Error("PROVENANCE_PARITY_DISPOSABLE_LOCAL_DB_REQUIRED");

const cases = JSON.parse(readFileSync("supabase/tests/provenance_cases.json", "utf8")) as Case[];

/** The application's answer, in the talent vocabulary: source-confirmed is
 *  reachable only by an employer confirming an employment period. */
function appLevel(c: Case): string {
  const trust = effectiveTrust({
    assertionLevel: "verified",
    verificationMethod: c.method,
    verifierName: c.organisation,
    subjectKind: c.subject === "period" ? "employment" : "credential",
  });
  if (trust === "source_confirmed")
    return c.subject === "period" ? "employer_confirmed" : "source_confirmed";
  if (trust === "documented") return "document_reviewed";
  return trust;
}

// Notices (the PVOUT lines) arrive on stderr; report_only lets every case
// print even when an assertion fails, so a disagreement is shown, not hidden.
const run = spawnSync(
  "psql",
  [
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "report_only=1",
    "-d",
    db,
    "-f",
    "supabase/tests/talent_provenance_test.sql",
  ],
  { encoding: "utf8" },
);
const out = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const sql = new Map<string, { level: string; notice: string }>();
for (const line of out.split("\n")) {
  const m = /PVOUT ([A-Z0-9]+)\|([a-z_]*)\|([a-z_]*)/.exec(line);
  if (m) sql.set(m[1], { level: m[2], notice: m[3] });
}

const failures: string[] = [];
for (const c of cases) {
  const got = sql.get(c.id);
  const app = appLevel(c);
  const notice = c.expected === "employer_confirmed" ? "employer_confirmation" : "document_review";
  const line = `${c.id} ${c.why}: database ${got?.level ?? "(none)"} / notice ${got?.notice ?? "(none)"}, application ${app}, expected ${c.expected}`;
  const ok = got !== undefined && got.level === app && app === c.expected && got.notice === notice;
  console.log(`${ok ? "  ok" : "  FAIL"} ${line}`);
  if (!ok) failures.push(line);
}
if (sql.size !== cases.length)
  failures.push(`the database answered ${sql.size} of ${cases.length} cases`);

// -- The organisation normalisation, exhaustively (Astra's P2) ----------------
// sp_decision_trust() must read a decider name exactly as effectiveTrust()
// does (JavaScript's trim(), then toLowerCase() against "CQrityjob"). Rather
// than trust a hand-made character list, every code point is tried in three
// shapes, and the set the database calls documented must equal the set the
// application calls documented, character for character:
//   padded  ch + "CQrityjob" + ch          every code point (the trim set);
//   alone   ch                              every code point (empty after trim);
//   letterK "CQRITYJOB" with letter K = ch  the BMP, each of the nine letters
//                                           (the case folding; no code point
//                                           outside it lowercases to ASCII).
// U+0000 and the surrogates cannot be stored in text and are left out.
const MAX = 0x10ffff;
const isText = (c: number) => c !== 0 && (c < 0xd800 || c > 0xdfff);
const appDocumented = (name: string) =>
  effectiveTrust({
    assertionLevel: "verified",
    verificationMethod: "employer_confirmation",
    verifierName: name,
    subjectKind: "employment",
  }) === "documented";
const families: { name: string; max: number; sqlName: string; js: (ch: string) => string }[] = [
  {
    name: "padded",
    max: MAX,
    sqlName: "chr(c) || 'CQrityjob' || chr(c)",
    js: (ch) => `${ch}CQrityjob${ch}`,
  },
  { name: "alone", max: MAX, sqlName: "chr(c)", js: (ch) => ch },
  ..."CQRITYJOB".split("").map((_, k) => ({
    name: `letter${k + 1}`,
    max: 0xffff,
    sqlName: `overlay('CQRITYJOB' placing chr(c) from ${k + 1} for 1)`,
    js: (ch: string) => `${"CQRITYJOB".slice(0, k)}${ch}${"CQRITYJOB".slice(k + 1)}`,
  })),
];
const sweep = families
  .map(
    (f) =>
      `SELECT '${f.name}', coalesce(string_agg(c::text, ',' ORDER BY c), '') FROM generate_series(1, ${f.max}) c ` +
      `WHERE c NOT BETWEEN 55296 AND 57343 ` +
      `AND public.sp_decision_trust('employer_confirmation', ${f.sqlName}, true) = 'document_reviewed'`,
  )
  .join(" UNION ALL ");
const swept = spawnSync(
  "psql",
  ["-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-d", db, "-c", sweep],
  {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  },
);
if (swept.status !== 0) failures.push(`exhaustive sweep did not run: ${swept.stderr.trim()}`);
const dbSets = new Map<string, string>();
for (const line of (swept.stdout ?? "").trim().split("\n")) {
  const [name, list] = line.split("|");
  if (name) dbSets.set(name, list ?? "");
}
for (const f of families) {
  const app: number[] = [];
  for (let c = 1; c <= f.max; c++)
    if (isText(c) && appDocumented(f.js(String.fromCodePoint(c)))) app.push(c);
  const appList = app.join(",");
  const dbList = dbSets.get(f.name);
  const tried = f.max === MAX ? "every code point" : "every BMP code point";
  if (dbList === appList)
    console.log(
      `  ok exhaustive ${f.name}: ${tried}, the same ${app.length} documented [${appList}]`,
    );
  else {
    const line = `exhaustive ${f.name}: database [${dbList ?? "(none)"}] / application [${appList}]`;
    console.log(`  FAIL ${line}`);
    failures.push(line);
  }
}

if (failures.length) {
  console.error(`provenance-parity FAILED (${failures.length})`);
  process.exit(1);
}
console.log(
  `provenance-parity: the database and the application agree on all ${cases.length} cases and on every code point tried`,
);
