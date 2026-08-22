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
//   4. The job posting UX redesign's contract: an incomplete draft stays
//      saveable, the fields marked required are exactly the ones the
//      backend requires (no more), the external-URL question appears only
//      for an external application, the four steps and every blocker name
//      resolve in both languages, a stored advert round-trips through the
//      form unchanged, and PUBLICATION_MODEL still matches what
//      jobs_validate_before_write() actually permits an employer to do.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dictionaries } from "../src/i18n/dictionaries";
import { formatDate, formatDateTime } from "../src/lib/job-intelligence/date-format";
import {
  COUNTRY_OPTIONS,
  MAX_DISPLAY_DAYS,
  PUBLICATION_MODEL,
  STEP_IDS,
  STEP_LABEL_KEYS,
  collectDraftIssues,
  collectPublishBlockers,
  countryOptionsFor,
  emptyValues,
  fromDateInput,
  fromJobRow,
  toDateInput,
  toServerPayload,
  type EmployerJobFormValues,
} from "../src/components/employer/job-form/model";

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
  JOB_NOT_ARCHIVABLE: "employer.jobs.form.error.jobNotArchivable",
  JOB_NOT_RESTORABLE: "employer.jobs.form.error.jobNotRestorable",
  ARCHIVE_JOB_FAILED: "employer.jobs.form.error.archiveFailed",
  RESTORE_JOB_FAILED: "employer.jobs.form.error.restoreFailed",
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

// -----------------------------------------------------------------------------
// 4. Job posting UX redesign — the four-step flow's contract.
//
// These guard the redesign's actual promises, each of which is a thing a
// first-time employer tester got wrong on the old form:
//   - a draft can still be saved with nothing filled in;
//   - what is marked required is EXACTLY what the backend requires, no
//     more (an over-marked field is as damaging as an unmarked one);
//   - the external-URL question exists only for an external application;
//   - every label, helper and step name resolves in both languages.
// -----------------------------------------------------------------------------

function values(overrides: Partial<EmployerJobFormValues> = {}): EmployerJobFormValues {
  return { ...emptyValues, ...overrides };
}

function dateIn(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 4.1 An empty new draft is saveable — nothing at all is required to save.
if (Object.keys(collectDraftIssues(emptyValues)).length > 0) {
  errors.push(
    "collectDraftIssues() refuses a brand-new empty draft; an incomplete draft must always be saveable.",
  );
}
// A half-written draft with a bad URL is the one thing refused, because the
// server's own zod .url() parse would reject the whole save.
if (
  !collectDraftIssues(values({ application_method: "external", application_url: "not a url" }))
    .application_url
) {
  errors.push("collectDraftIssues() accepted a malformed application_url.");
}
if (
  !collectDraftIssues(values({ application_method: "email", application_email: "nope" }))
    .application_email
) {
  errors.push("collectDraftIssues() accepted a malformed application_email.");
}
// ...but a draft that simply has no title/description/dates is fine.
if (
  Object.keys(collectDraftIssues(values({ title_sv: "Väktare", application_method: "internal" })))
    .length > 0
) {
  errors.push("collectDraftIssues() refused a partially filled but well-formed draft.");
}

// 4.2 A complete advert has no publication blockers.
const complete = values({
  title_sv: "Väktare",
  description_sv: "En beskrivning av rollen.",
  application_method: "internal",
  expires_at: dateIn(30),
});
if (collectPublishBlockers(complete).length !== 0) {
  errors.push(
    `A complete advert still reports blockers: ${collectPublishBlockers(complete)
      .map((b) => b.field)
      .join(", ")}`,
  );
}

// 4.3 Nothing beyond the backend's own gate is marked required. Employment
// type, experience level, workplace type, location and job category are all
// optional in the database and in submitEmployerJob() -- so they must never
// appear as a publication blocker.
const NEVER_BLOCKING = [
  "employment_type",
  "experience_level",
  "workplace_type",
  "city",
  "country",
  "region",
  "location_text",
  "family_id",
  "profession_slug",
];
for (const b of collectPublishBlockers(emptyValues)) {
  if (NEVER_BLOCKING.includes(b.field as string)) {
    errors.push(
      `collectPublishBlockers() marks "${b.field}" as required for publication, but the backend does not require it.`,
    );
  }
}

// 4.4 The empty advert reports exactly the backend's own missing set:
// title, description, application method, last display day.
const emptyBlockers = collectPublishBlockers(emptyValues)
  .map((b) => b.field)
  .sort();
const expectedEmpty = ["application_method", "description", "expires_at", "title"];
if (JSON.stringify(emptyBlockers) !== JSON.stringify(expectedEmpty)) {
  errors.push(
    `An empty advert should block on exactly ${expectedEmpty.join(", ")}; got ${emptyBlockers.join(", ")}.`,
  );
}

// 4.5 Application method drives the conditional target field, in both
// directions. An internal application must never ask for a URL.
const internalBlockers = collectPublishBlockers(
  values({
    title_sv: "T",
    description_sv: "D",
    application_method: "internal",
    expires_at: dateIn(10),
  }),
);
if (
  internalBlockers.some((b) => b.field === "application_url" || b.field === "application_email")
) {
  errors.push("An internal (CQrityjob) application still demands an external URL or email.");
}
const externalMissingUrl = collectPublishBlockers(
  values({
    title_sv: "T",
    description_sv: "D",
    application_method: "external",
    expires_at: dateIn(10),
  }),
);
if (!externalMissingUrl.some((b) => b.field === "application_url")) {
  errors.push("An external application with no URL did not block publication.");
}
const emailMissing = collectPublishBlockers(
  values({
    title_sv: "T",
    description_sv: "D",
    application_method: "email",
    expires_at: dateIn(10),
  }),
);
if (!emailMissing.some((b) => b.field === "application_email")) {
  errors.push("An email application with no address did not block publication.");
}

// 4.6 Date rules the database enforces at publication time are caught here
// instead, while the employer is still looking at the form.
const tooFar = collectPublishBlockers(
  values({
    title_sv: "T",
    description_sv: "D",
    application_method: "internal",
    expires_at: dateIn(MAX_DISPLAY_DAYS + 5),
  }),
);
if (!tooFar.some((b) => b.field === "expires_at")) {
  errors.push(
    `An expires_at more than ${MAX_DISPLAY_DAYS} days out did not block; the database would reject it at publication.`,
  );
}
const pastDeadline = collectPublishBlockers(
  values({
    title_sv: "T",
    description_sv: "D",
    application_method: "internal",
    expires_at: dateIn(10),
    deadline_at: dateIn(-3),
  }),
);
if (!pastDeadline.some((b) => b.field === "deadline_at")) {
  errors.push("A deadline_at in the past did not block publication.");
}

// 4.7 Every blocker names itself in both languages, and every step does too.
for (const b of collectPublishBlockers(
  values({ application_method: "external", deadline_at: dateIn(-1), expires_at: dateIn(200) }),
)) {
  for (const lang of ["sv", "en"] as const) {
    const v = (dictionaries[lang] as Record<string, string>)[b.labelKey];
    if (!v) errors.push(`Blocker "${b.field}" label key "${b.labelKey}" is missing in ${lang}.`);
    if (b.detailKey && !(dictionaries[lang] as Record<string, string>)[b.detailKey]) {
      errors.push(`Blocker "${b.field}" detail key "${b.detailKey}" is missing in ${lang}.`);
    }
  }
}
for (const id of STEP_IDS) {
  for (const lang of ["sv", "en"] as const) {
    if (!(dictionaries[lang] as Record<string, string>)[STEP_LABEL_KEYS[id]]) {
      errors.push(`Step "${id}" has no ${lang} label (${STEP_LABEL_KEYS[id]}).`);
    }
  }
}
if (STEP_IDS.length !== 4) {
  errors.push(`Expected a four-step flow; STEP_IDS has ${STEP_IDS.length} entries.`);
}

// 4.8 Every employer.jobs.form.* key exists in BOTH languages and is
// genuinely translated (identical sv/en text is almost always a
// copy-paste that never got translated). A short list of terms that are
// deliberately the same word in both languages is exempt.
const SAME_IN_BOTH_LANGUAGES = new Set([
  "employer.jobs.form.field.region",
  "employer.jobs.form.field.regionPlaceholder",
  "employer.jobs.form.preview.applyHeading",
  "employer.jobs.form.step.description",
]);
const svKeys = Object.keys(dictionaries.sv).filter((k) => k.startsWith("employer.jobs.form."));
const enDict = dictionaries.en as Record<string, string>;
const svDict = dictionaries.sv as Record<string, string>;
for (const k of svKeys) {
  if (!enDict[k]) {
    errors.push(`"${k}" exists in Swedish but not in English.`);
    continue;
  }
  if (svDict[k] === enDict[k] && !SAME_IN_BOTH_LANGUAGES.has(k)) {
    errors.push(`"${k}" is identical in sv and en ("${svDict[k]}") -- likely untranslated.`);
  }
}
for (const k of Object.keys(enDict).filter((k) => k.startsWith("employer.jobs.form."))) {
  if (!svDict[k]) errors.push(`"${k}" exists in English but not in Swedish.`);
}

// 4.9 The form component must not use an HTML `required` attribute on a
// form control: the browser would then block "Spara utkast" on an
// unfinished advert, which is the exact opposite of the draft promise made
// at the top of the form. (The local <Question required> prop is a label
// decoration, not an attribute, and is unaffected.)
const formSourcePath = fileURLToPath(
  new URL("../src/components/employer/EmployerJobForm.tsx", import.meta.url),
);
const formSource = readFileSync(formSourcePath, "utf-8");
if (/<(input|textarea|select)(\s[^>]*)?\srequired[\s/>=]/.test(formSource)) {
  errors.push(
    "EmployerJobForm.tsx puts an HTML `required` attribute on a form control; that makes an incomplete draft unsavable.",
  );
}

// 4.10 Row -> form -> payload round-trips without losing or inventing data.
const row = {
  title_sv: "Väktare",
  title_en: null,
  description_sv: "Beskrivning",
  description_en: null,
  location_text: "Landvetter",
  country: "SE",
  region: "Västra Götaland",
  city: "Göteborg",
  workplace_type: "onsite",
  employment_type: "full_time",
  experience_level: "entry",
  application_method: "external",
  application_url: "https://example.com/apply",
  application_email: null,
  deadline_at: fromDateInput(dateIn(14)),
  expires_at: fromDateInput(dateIn(45)),
  family_id: "protective_operations",
  profession_slug: "security-officer",
};
const roundTripped = toServerPayload(fromJobRow(row));
for (const key of [
  "title_sv",
  "description_sv",
  "location_text",
  "country",
  "region",
  "city",
  "workplace_type",
  "employment_type",
  "experience_level",
  "application_method",
  "application_url",
  "family_id",
  "profession_slug",
] as const) {
  if ((roundTripped as Record<string, unknown>)[key] !== (row as Record<string, unknown>)[key]) {
    errors.push(
      `fromJobRow -> toServerPayload changed "${key}": ${String(row[key])} -> ${String((roundTripped as Record<string, unknown>)[key])}.`,
    );
  }
}
if (toDateInput(row.deadline_at) !== dateIn(14)) {
  errors.push("A stored deadline_at did not read back as the same calendar day.");
}
if (roundTripped.deadline_at === null || roundTripped.expires_at === null) {
  errors.push("Round-tripping a job with dates produced null dates.");
}

// 4.11 A country code already stored on an advert is never dropped just
// because it is outside the presented list.
if (!countryOptionsFor("ES").some((c) => c.code === "ES")) {
  errors.push("countryOptionsFor() drops a stored country code that is not in COUNTRY_OPTIONS.");
}
if (countryOptionsFor("SE").length !== COUNTRY_OPTIONS.length) {
  errors.push("countryOptionsFor() duplicated a country that is already in the list.");
}
if (emptyValues.application_method !== "unavailable") {
  errors.push(
    "A new advert pre-selects an application method; the employer must be asked the question instead.",
  );
}

// 4.12 The publication model is honest about what the database allows.
// jobs_validate_before_write() permits an employer exactly
// draft->pending_review, rejected->pending_review and published->archived,
// and rejects any employer write touching published_at. Flipping this
// constant to "direct" without changing that trigger would give employers a
// Publicera button that fails at the database.
if (PUBLICATION_MODEL !== "moderated") {
  errors.push(
    'PUBLICATION_MODEL is no longer "moderated" -- confirm jobs_validate_before_write() actually allows an employer to publish before shipping this.',
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-job-form:check][error]", e);
  console.error(`\nemployer-job-form:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log("employer-job-form:check OK");
