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
  isStrictlyAfter,
  MAX_YEAR,
  MIN_YEAR,
  normaliseCalendarDateInput,
  toIsoDateOrRaw,
  todayIso,
} from "../src/lib/security-passport/dates";
import { emptyCredentialDraft, validateCredential } from "../src/lib/security-passport/credentials";
import {
  dateInputMessage,
  dateInputProblem,
} from "../src/components/security-passport/CredentialDateInput";
import {
  applyReading,
  type SuggestibleDraft,
} from "../src/lib/security-passport/hayat/suggestions";
import type { DocumentReading, FieldReading } from "../src/lib/security-passport/hayat/types";

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

// =========================================================================
group("7 · What a holder types: with or without hyphens, one stored form");
// =========================================================================
//
// Owner report (Security Passport credential form, Utfärdad / Giltig till):
// "Ändra datum så att den automatiskt kan läsa av bindestreck eller inte
// bindestreck." A certificate prints 2020-05-09 or 20200509; both must be
// read, and the draft must hold ONE form -- the ISO form the database stores.

const iso = (raw: string): string | null => {
  const read = normaliseCalendarDateInput(raw);
  return read.kind === "valid" ? read.iso : null;
};

for (const [raw, expected] of [
  ["2020-05-09", "2020-05-09"],
  ["20200509", "2020-05-09"],
  [" 20200509 ", "2020-05-09"], // pasted with whitespace
  ["2020-5-9", "2020-05-09"], // unambiguous: four-digit year first, dashes fix the parts
  ["2020-05-9", "2020-05-09"],
  ["2020-5-09", "2020-05-09"],
  ["2024-02-29", "2024-02-29"], // leap day
  ["20240229", "2024-02-29"],
  ["2020-01-01", "2020-01-01"], // the days a timezone shift would move
  ["20200101", "2020-01-01"],
  ["2020-12-31", "2020-12-31"],
  ["20201231", "2020-12-31"],
  ["1900-01-01", "1900-01-01"],
  ["2200-12-31", "2200-12-31"],
] as const) {
  ok(iso(raw) === expected, `7.1 ${JSON.stringify(raw)} is read as ${expected} (got ${iso(raw)})`);
}

ok(normaliseCalendarDateInput("").kind === "empty", "7.2 empty is empty, not invalid");
ok(normaliseCalendarDateInput("   ").kind === "empty", "7.2 whitespace is empty, not invalid");

for (const [raw, why] of [
  ["20200230", "30 February, digits only"],
  ["2020-02-30", "30 February"],
  ["2026-02-30", "30 February (the value the browser spec types)"],
  ["20230229", "29 February in a non-leap year, digits only"],
  ["2023-02-29", "29 February in a non-leap year"],
  ["2026-13-01", "month 13"],
  ["20261301", "month 13, digits only"],
  ["2026-00-10", "month 0"],
  ["2026-04-31", "31 April"],
  ["2026-01-00", "day 0"],
  ["1899-12-31", "before the year window"],
  ["18991231", "before the year window, digits only"],
  ["2201-01-01", "after the year window"],
] as const) {
  const read = normaliseCalendarDateInput(raw);
  ok(
    read.kind === "invalid" && read.reason === "impossible",
    `7.3 ${JSON.stringify(raw)} is refused as impossible (${why}) -- got ${JSON.stringify(read)}`,
  );
}

for (const [raw, why] of [
  ["01/02/2020", "day/month or month/day -- a guess either way"],
  ["09.05.2020", "European dotted, year last"],
  ["05/09/2020", "US slashed"],
  ["2020509", "seven digits: May 9 or 5 September"],
  ["202005091", "nine digits"],
  ["202005-01-01", "the oversized string seen in UAT"],
  ["2020/05/09", "slashes are not accepted for typed input"],
  ["2020.05.09", "dots are not accepted for typed input"],
  ["2020-05", "no day"],
  ["2020-05-", "no day"],
  ["20-05-09", "two-digit year"],
  ["2020-05-09T00:00:00Z", "a timestamp"],
  ["not-a-date", "prose"],
] as const) {
  const read = normaliseCalendarDateInput(raw);
  ok(
    read.kind === "invalid" && read.reason === "shape",
    `7.4 ${JSON.stringify(raw)} is refused as the wrong shape (${why}) -- got ${JSON.stringify(read)}`,
  );
}

ok(toIsoDateOrRaw("20200509") === "2020-05-09", "7.5 toIsoDateOrRaw settles a valid input");
ok(
  toIsoDateOrRaw("2020-02-30") === "2020-02-30",
  "7.5 toIsoDateOrRaw leaves an invalid input alone",
);

// No timezone shift: the year, month and day that went in are the ones that
// come out, whatever TZ the process runs under. The normaliser is pure
// string/calendar arithmetic; this pins that it stays so.
for (const raw of ["2020-01-01", "2020-12-31", "2024-02-29", "1900-01-01", "2200-12-31"]) {
  const [y, m, d] = raw.split("-");
  ok(
    iso(raw) === `${y}-${m}-${d}`,
    `7.6 ${raw} does not move by a day (TZ=${process.env.TZ ?? "unset"})`,
  );
  ok(iso(`${y}${m}${d}`) === raw, `7.6 ${y}${m}${d} does not move by a day`);
}

// =========================================================================
group("8 · The field says what is wrong, in both languages, and matches the database");
// =========================================================================

ok(dateInputProblem("", undefined) === null, "8.1 an empty field has no problem");
ok(dateInputProblem("2020-05-09") === null, "8.1 an ISO date has no problem");
ok(dateInputProblem("20200509") === null, "8.1 a digits-only date has no problem");
ok(dateInputProblem("2020-02-30") === "impossible", "8.2 30 February is impossible");
ok(dateInputProblem("20200230") === "impossible", "8.2 30 February, digits only, is impossible");
ok(dateInputProblem("01/02/2020") === "shape", "8.2 an ambiguous form is the wrong shape");

// The database (sp_save_international_credential, migration 20261126090000)
// refuses `_expiry <= _issued` as SP_INVALID_DATES. Equality is refused --
// the client used to allow it, and the holder got a generic save error.
ok(isStrictlyAfter("2020-05-10", "2020-05-09"), "8.3 the day after is after");
ok(!isStrictlyAfter("2020-05-09", "2020-05-09"), "8.3 the same day is NOT after (database rule)");
ok(!isStrictlyAfter("2020-05-08", "2020-05-09"), "8.3 the day before is not after");
ok(isStrictlyAfter("20200510", "2020-05-09"), "8.3 the comparison reads both typed forms");
ok(isStrictlyAfter("2020-05-10", "20200509"), "8.3 the comparison reads both typed forms (min)");
ok(!isStrictlyAfter("2020-02-30", "2020-01-01"), "8.3 an impossible date is never after anything");
ok(
  dateInputProblem("2020-05-09", "2020-05-09") === "before_min",
  "8.4 valid_until = issued_on is refused",
);
ok(dateInputProblem("20200509", "2020-05-09") === "before_min", "8.4 ... in either typed form");
ok(
  dateInputProblem("2020-05-10", "2020-05-09") === null,
  "8.4 valid_until the day after is accepted",
);
ok(dateInputProblem("2020-05-09", "") === null, "8.4 an empty min imposes nothing");

for (const lang of ["sv", "en"] as const) {
  const shape = dateInputMessage("shape", lang);
  const impossible = dateInputMessage("impossible", lang);
  const before = dateInputMessage("before_min", lang, "20200509");
  ok(
    shape.includes(lang === "sv" ? "ÅÅÅÅ-MM-DD" : "YYYY-MM-DD") &&
      shape.includes(lang === "sv" ? "ÅÅÅÅMMDD" : "YYYYMMDD"),
    `8.5 ${lang}: the shape message names both accepted forms`,
  );
  ok(
    impossible !== shape && /februari|February/.test(impossible),
    `8.5 ${lang}: the impossible-date message is its own, actionable message`,
  );
  ok(
    before.includes("2020-05-09") && before !== shape && before !== impossible,
    `8.5 ${lang}: the valid_until message names the issue date in ISO form`,
  );
}

// =========================================================================
group("9 · HAYAT compares dates by what they mean, and never blanks a typed one");
// =========================================================================

const readingWith = (fields: DocumentReading["fields"]): DocumentReading => ({
  fields,
  issuer: { state: "not_applicable" },
  credentialType: { state: "not_found" },
  holderName: { state: "not_found", nameOnDocument: null },
  usedOcr: false,
  pageCount: 1,
  pagesRead: 1,
});
const provenance = { page: 1, excerpt: "synthetic" } as const;
const found = (value: string): FieldReading => ({ state: "read", value, provenance });
const NOT_FOUND: FieldReading = { state: "not_found" };
const DATES = ["issued_on", "valid_until"] as const;
const blank: SuggestibleDraft = { identifier: "", issued_on: "", valid_until: "", no_expiry: null };

{
  const reading = readingWith({
    identifier: NOT_FOUND,
    issued_on: found("2020-05-09"),
    valid_until: found("2030-05-09"),
    issuer_name: NOT_FOUND,
  });
  const typed = applyReading(
    { ...blank, issued_on: "20200509", valid_until: "2030-5-9" },
    reading,
    DATES,
  );
  ok(
    typed.notices.issued_on?.kind === "agrees",
    `9.1 "20200509" typed vs "2020-05-09" read agrees (got ${typed.notices.issued_on?.kind})`,
  );
  ok(
    typed.notices.valid_until?.kind === "agrees",
    `9.1 "2030-5-9" typed vs "2030-05-09" read agrees (got ${typed.notices.valid_until?.kind})`,
  );
  ok(typed.draft.issued_on === "20200509", "9.2 what the holder typed is left as they typed it");
  const other = applyReading({ ...blank, issued_on: "20200510" }, reading, DATES);
  ok(
    other.notices.issued_on?.kind === "conflict" &&
      other.notices.issued_on.documentValue === "2020-05-09",
    "9.3 a genuinely different date is still a conflict",
  );
  const filled = applyReading(blank, reading, DATES);
  ok(
    filled.draft.issued_on === "2020-05-09",
    "9.4 an empty field is filled with the document's date",
  );

  const uncertain = readingWith({
    identifier: NOT_FOUND,
    issued_on: {
      state: "uncertain",
      candidates: ["2026-03-04", "2026-04-03"],
      reason: "ambiguous_day_month",
      provenance,
    },
    valid_until: NOT_FOUND,
    issuer_name: NOT_FOUND,
  });
  const picked = applyReading({ ...blank, issued_on: "20260304" }, uncertain, DATES);
  ok(
    picked.notices.issued_on?.kind === "agrees",
    `9.5 a typed "20260304" agrees with candidate 2026-03-04 (got ${picked.notices.issued_on?.kind})`,
  );
}

{
  // A document with NO readable date must never blank what the holder typed.
  const nothing = readingWith({
    identifier: NOT_FOUND,
    issued_on: NOT_FOUND,
    valid_until: NOT_FOUND,
    issuer_name: NOT_FOUND,
  });
  const mine = { ...blank, issued_on: "2020-05-09", valid_until: "20300509" };
  const applied = applyReading(mine, nothing, DATES);
  ok(
    applied.draft.issued_on === "2020-05-09",
    "9.6 a missing extracted date leaves issued_on alone",
  );
  ok(
    applied.draft.valid_until === "20300509",
    "9.6 a missing extracted date leaves valid_until alone",
  );
  ok(
    applied.notices.issued_on?.kind === "not_found" && applied.marks.issued_on === undefined,
    "9.6 ... and marks nothing as read by HAYAT",
  );
}

console.log(
  failures === 0
    ? `\npassport-date-validation-check: all ${checks} checks passed.`
    : `\nFAIL  ${checks - failures}/${checks} date checks`,
);
process.exit(failures === 0 ? 0 : 1);
