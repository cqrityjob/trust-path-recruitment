// Final job-form UX/validation/localisation pass — focused regression
// checks. Run via `bun run employer-job-form:check`. Matches the
// established scripts/cie-check.ts / scripts/kg-check.ts /
// scripts/employer-taxonomy-check.ts pattern: a plain, importable-module
// check, not a JS/TS unit-test-runner suite (none is configured in this
// project). Guards against exactly the class of regression this pass
// fixed:
//   1. employer-jobs.functions.ts throws a stable error CODE that has no
//      translation in EmployerJobForm.tsx's map (would silently fall
//      back to the generic message -- not a crash, but a real gap worth
//      catching).
//   2. Every mapped code resolves to a non-empty, distinct sv/en string
//      (guards against copy-paste leaving Swedish and English identical,
//      or a dictionary key present but blank).
//   3. formatDateTime() never renders "AM"/"PM" in either language --
//      the concrete, reported bug (12-hour US-style time in Swedish
//      view) can never silently regress.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dictionaries } from "../src/i18n/dictionaries";
import { formatDate, formatDateTime } from "../src/lib/job-intelligence/date-format";

const errors: string[] = [];

// -----------------------------------------------------------------------------
// 1 & 2. Error-code -> dictionary coverage.
// -----------------------------------------------------------------------------

// Same map as EmployerJobForm.tsx's SERVER_ERROR_MESSAGE_KEYS -- kept as a
// literal copy here (not imported) so this script also works as an
// independent cross-check, not a tautology against the same source.
const CODE_TO_KEY: Record<string, string> = {
  ACCESS_NOT_AVAILABLE: "employer.jobs.form.error.accessNotAvailable",
  LOAD_JOBS_FAILED: "employer.jobs.form.error.loadJobsFailed",
  LOAD_JOB_FAILED: "employer.jobs.form.error.loadJobFailed",
  JOB_NOT_FOUND: "employer.jobs.form.error.jobNotFound",
  JOB_NOT_EDITABLE: "employer.jobs.form.error.jobNotEditable",
  LOAD_EMPLOYER_FAILED: "employer.jobs.form.error.loadEmployerFailed",
  EMPLOYER_NOT_FOUND: "employer.jobs.form.error.employerNotFound",
  JOB_NOT_SUBMITTABLE: "employer.jobs.form.error.jobNotSubmittable",
  MISSING_REQUIRED_FIELDS: "employer.jobs.form.error.missingRequiredFields",
  JOB_NOT_CLOSEABLE: "employer.jobs.form.error.jobNotCloseable",
  INVALID_JOB_DATA: "employer.jobs.form.error.invalidData",
  SAVE_DRAFT_FAILED: "employer.jobs.form.error.saveDraftFailed",
  SUBMIT_FOR_REVIEW_FAILED: "employer.jobs.form.error.submitForReviewFailed",
  CLOSE_JOB_FAILED: "employer.jobs.form.error.closeJobFailed",
  DUPLICATE_JOB_FAILED: "employer.jobs.form.error.duplicateJobFailed",
};

type DictKey = keyof typeof dictionaries.sv;

for (const [code, key] of Object.entries(CODE_TO_KEY)) {
  const svValue = (dictionaries.sv as Record<string, string>)[key];
  const enValue = (dictionaries.en as Record<string, string>)[key];
  if (!svValue)
    errors.push(`Code ${code} maps to "${key}", which has no Swedish dictionary entry.`);
  if (!enValue)
    errors.push(`Code ${code} maps to "${key}", which has no English dictionary entry.`);
  if (svValue && enValue && svValue === enValue) {
    errors.push(
      `Code ${code}'s sv/en dictionary values are identical ("${svValue}") -- likely untranslated.`,
    );
  }
}
// Also confirm the generic fallback itself exists and is genuinely
// localised, sv != en.
const genericKey = "employer.jobs.form.error.generic" as DictKey;
if (dictionaries.sv[genericKey] === dictionaries.en[genericKey]) {
  errors.push("employer.jobs.form.error.generic is identical in sv and en.");
}

// Cross-check against the real source file: every UPPER_SNAKE_CASE code
// employer-jobs.functions.ts actually throws must appear in CODE_TO_KEY
// above. Regex-based (no TS compiler needed), scoped to `throw new
// Error("...")` literals only.
const employerJobsFnsPath = fileURLToPath(
  new URL("../src/lib/job-intelligence/employer-jobs.functions.ts", import.meta.url),
);
const employerJobsFnsSource = readFileSync(employerJobsFnsPath, "utf-8");
const thrownCodes = new Set(
  [...employerJobsFnsSource.matchAll(/throw new Error\("([A-Z_]+)"\)/g)].map((m) => m[1]),
);
for (const code of thrownCodes) {
  if (!(code in CODE_TO_KEY)) {
    errors.push(
      `employer-jobs.functions.ts throws "${code}", which has no entry in this script's CODE_TO_KEY map (and likely none in EmployerJobForm.tsx's translateJobServerError() either) -- it would silently render the generic fallback instead of a specific message.`,
    );
  }
}
if (thrownCodes.size === 0) {
  errors.push(
    "Regex scan of employer-jobs.functions.ts found zero thrown error codes -- the file's shape may have changed in a way this check no longer detects; review scripts/employer-job-form-check.ts.",
  );
}

// -----------------------------------------------------------------------------
// 3. Date/time formatting never shows 12-hour AM/PM in either language --
// the exact reported bug (mm/dd/yyyy, "12:00 PM" in Swedish view).
// -----------------------------------------------------------------------------

const sample = "2027-01-01T12:00:00.000Z";
for (const lang of ["sv", "en"] as const) {
  const dt = formatDateTime(sample, lang);
  if (/AM|PM/i.test(dt)) {
    errors.push(`formatDateTime(..., "${lang}") produced "${dt}", which contains AM/PM.`);
  }
  if (!dt) {
    errors.push(`formatDateTime(..., "${lang}") produced an empty string for a valid ISO input.`);
  }
  const d = formatDate(sample, lang);
  if (!d) {
    errors.push(`formatDate(..., "${lang}") produced an empty string for a valid ISO input.`);
  }
}
// Swedish numeric date ordering is year-month-day.
const svDateTime = formatDateTime(sample, "sv");
if (!/^2027/.test(svDateTime)) {
  errors.push(
    `formatDateTime(..., "sv") = "${svDateTime}" does not start with the year (yyyy-mm-dd order).`,
  );
}
// Null/undefined/invalid input never throws, always returns "".
if (formatDate(null, "sv") !== "" || formatDateTime(undefined, "en") !== "") {
  errors.push("formatDate/formatDateTime did not return an empty string for null/undefined input.");
}
if (formatDate("not-a-date", "sv") !== "" || formatDateTime("not-a-date", "en") !== "") {
  errors.push(
    "formatDate/formatDateTime did not return an empty string for an invalid date string.",
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-job-form:check][error]", e);
  console.error(`\nemployer-job-form:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log("employer-job-form:check OK");
