// Passport dates — regression.
//
// Every Passport date used to be checked by /^\d{4}-\d{2}-\d{2}$/, written
// out separately in nine files. That is a check on the SHAPE of a string:
// "2026-13-45" passes it, and so does "0000-00-00". The forms use
// <input type="date">, but the field is a text input underneath and a
// hand-built request has no picker at all — UAT saw "202005-01-01" reach a
// form, with a regex behind it that would have accepted "2020-05-99".
//
// This asserts the replacement (src/lib/security-passport/dates.ts) actually
// rejects those, that the whole-credential validator uses it, and — the part
// that matters most for a fix applied across nine files — that no loose
// shape check was left behind anywhere in the Passport module.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  isCalendarDate,
  isFutureDate,
  MAX_YEAR,
  MIN_YEAR,
  todayIso,
} from "../src/lib/security-passport/dates";
import { emptyCredentialDraft, validateCredential } from "../src/lib/security-passport/credentials";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

// =========================================================================
group("1 · Real dates are accepted");
// =========================================================================

for (const good of [
  "2026-08-25",
  "2024-02-29", // leap year
  "2000-02-29", // leap century
  "1900-01-01", // lower bound
  "2199-12-31",
  "2026-01-31",
  "2026-12-31",
]) {
  ok(isCalendarDate(good), `1.1 ${good} is a date`);
}

// =========================================================================
group("2 · The values a shape check let through are refused");
// =========================================================================

const BAD = [
  ["2026-13-45", "month 13, day 45 — the value the old regex accepted"],
  ["2026-13-01", "month 13"],
  ["2026-00-10", "month 0"],
  ["2026-02-30", "30 February"],
  ["2023-02-29", "29 February in a non-leap year"],
  ["1900-02-29", "29 February in a non-leap century"],
  ["2026-04-31", "31 April"],
  ["2026-01-00", "day 0"],
  ["2026-01-32", "day 32"],
  ["0000-00-00", "all zeroes"],
  ["1899-12-31", "before the lower bound"],
  ["2201-01-01", "beyond the upper bound"],
  ["202005-01-01", "the oversized digit string seen in UAT"],
  ["20260825", "no separators"],
  ["2026-8-25", "unpadded month"],
  ["2026-08-5", "unpadded day"],
  ["2026-08-25T00:00:00Z", "a timestamp, not a date"],
  ["2026-08-25 ", "trailing space"],
  [" 2026-08-25", "leading space"],
  ["", "empty"],
  ["not-a-date", "prose"],
  ["9999999999-01-01", "an absurd year"],
] as const;

for (const [bad, why] of BAD) {
  ok(!isCalendarDate(bad), `2.1 ${JSON.stringify(bad)} is refused (${why})`);
}

// =========================================================================
group("3 · Future dates, where a future date is wrong");
// =========================================================================

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
ok(isFutureDate(tomorrow), "3.1 tomorrow is in the future");
ok(!isFutureDate(todayIso()), "3.2 today is not in the future — a course completed today counts");
ok(!isFutureDate(yesterday), "3.3 yesterday is not in the future");
ok(!isFutureDate("2026-13-45"), "3.4 a non-date is never 'in the future'");

// A completion/decision date in the future is refused. A VALIDITY window in
// the future is not — an appointment that expires next year is normal.
const futureIssued = validateCredential(
  { ...emptyCredentialDraft(), issuedOn: tomorrow },
  null,
  "draft",
);
ok(
  futureIssued.some((e) => e.field === "issuedOn" && e.messageKey === "cred.error.dateFuture"),
  "3.5 a completion/decision date in the future is refused",
);

const futureValidUntil = validateCredential(
  { ...emptyCredentialDraft(), validFrom: yesterday, validUntil: tomorrow },
  null,
  "draft",
);
ok(
  !futureValidUntil.some((e) => e.field === "validUntil"),
  "3.6 a validity window running into the future is accepted",
);

// =========================================================================
group("4 · The credential validator refuses malformed dates in BOTH modes");
// =========================================================================
//
// A draft is allowed to be missing its mandatory fields. It is NOT allowed
// to hold a value that is not a date — that is not incompleteness, it is
// wrong data, and storing it means the database refuses later with a generic
// error the holder cannot act on.

for (const mode of ["draft", "active"] as const) {
  for (const field of ["issuedOn", "validFrom", "validUntil"] as const) {
    const problems = validateCredential(
      { ...emptyCredentialDraft(), [field]: "2026-13-45" },
      null,
      mode,
    );
    ok(
      problems.some((e) => e.field === field && e.messageKey === "cred.error.dateFormat"),
      `4.1 ${mode}: ${field} = 2026-13-45 is refused with a field-level message`,
    );
  }
}

// =========================================================================
group("5 · No loose shape check survives anywhere in the Passport module");
// =========================================================================
//
// The fix touched nine files. The failure mode for a fix like that is one
// call site nobody noticed, so this asserts the absence directly rather than
// trusting the sweep.

const LOOSE = /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//;
const ROOTS = ["src/lib/security-passport", "src/components/security-passport"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

for (const root of ROOTS) {
  for (const file of walk(join(process.cwd(), root))) {
    const body = readFileSync(file, "utf8");
    // dates.ts and credentials.ts quote the old pattern in a comment
    // explaining what replaced it. A comment is documentation, not a check.
    const code = body
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    ok(
      !LOOSE.test(code),
      `5.1 ${file.replace(process.cwd() + "/", "")} carries no bare YYYY-MM-DD shape check`,
    );
  }
}

// =========================================================================
group("6 · The bounds are stated, not scattered");
// =========================================================================

ok(MIN_YEAR === 1900, "6.1 the lower year bound is stated");
ok(MAX_YEAR === 2200, "6.2 the upper year bound is stated");
ok(/^\d{4}-\d{2}-\d{2}$/.test(todayIso()), "6.3 todayIso produces a well-formed date");
ok(isCalendarDate(todayIso()), "6.4 todayIso produces a real date");

console.log(
  failures === 0
    ? `\npassport-date-validation-check: all ${checks} checks passed.`
    : `\nFAIL  ${checks - failures}/${checks} date checks`,
);
process.exit(failures === 0 ? 0 : 1);
