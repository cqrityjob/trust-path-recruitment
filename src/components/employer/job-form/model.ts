// Job posting UX redesign — the non-visual half of the employer job form.
//
// Everything here is deliberately free of JSX so the same rules can be
// asserted by scripts/employer-job-form-check.ts without a DOM: the row
// <-> form mapping, what a draft needs, what publication needs, and which
// step each blocking field lives on.
//
// The single most important rule in this file: **the publication
// requirements below mirror the backend exactly and invent nothing.**
// submitEmployerJob() in employer-jobs.functions.ts gates on title (in
// either language), description (in either language), a chosen
// application method with a valid target for that method, and expires_at.
// jobs_validate_before_write() additionally refuses to publish a job
// whose expires_at is more than 90 days after published_at, or whose
// deadline_at precedes published_at. Those two are the only rules here
// the server function itself does not check, and they are included
// precisely because otherwise the employer's advert fails silently *at
// moderation time*, hours later, with nobody to explain why. Nothing
// else is marked required — not employment_type, not the location, not
// the job category — because the backend does not require them and the
// brief's own rule is that a field the employer is not actually obliged
// to fill in must not be marked as though they were.

import type { TranslationKey } from "@/i18n/dictionaries";

export type ApplicationMethod = "external" | "email" | "internal" | "unavailable";

export type EmployerJobFormValues = {
  title_sv: string;
  title_en: string;
  description_sv: string;
  description_en: string;
  requirements_sv: string;
  requirements_en: string;
  location_text: string;
  country: string;
  region: string;
  city: string;
  workplace_type: string;
  employment_type: string;
  experience_level: string;
  application_method: ApplicationMethod;
  application_url: string;
  application_email: string;
  deadline_at: string;
  expires_at: string;
  /** A canonical id, "" for not specified, or OTHER_OPTION for "Annat".
   *
   *  The sentinel lives only in the form. toServerPayload() turns it into the
   *  boolean-plus-text pair the database actually stores, because writing
   *  "other" into family_id would fail assert_cig_family_id() -- and if it did
   *  not, it would pollute a vocabulary the public job filters match on. */
  family_id: string;
  family_other_text: string;
  profession_slug: string;
  profession_other_text: string;
};

// A brand-new advert starts with NO application method chosen.
//
// The previous default was "external", which is how a first-time employer
// ended up staring at a field called "Ansöknings-URL" they had never asked
// for and could not interpret — the single clearest finding from the
// tester session. `unavailable` is the enum's existing "no usable
// application route" value; the database already refuses to publish a job
// that still carries it, so using it as "not chosen yet" adds no new state
// and no new migration, and the employer is asked the question outright
// instead of silently inheriting an answer.
//
// country defaults to SE: this is a Swedish security-sector marketplace,
// and a default the employer can change is one decision fewer than a blank
// two-letter code box.
export const emptyValues: EmployerJobFormValues = {
  title_sv: "",
  title_en: "",
  description_sv: "",
  description_en: "",
  requirements_sv: "",
  requirements_en: "",
  location_text: "",
  country: "SE",
  region: "",
  city: "",
  workplace_type: "",
  employment_type: "",
  experience_level: "",
  application_method: "unavailable",
  application_url: "",
  application_email: "",
  deadline_at: "",
  expires_at: "",
  family_id: "",
  family_other_text: "",
  profession_slug: "",
  profession_other_text: "",
};

// -----------------------------------------------------------------------------
// Dates. The employer thinks in days ("we stop taking applications on the
// 14th"), not in minutes, so both date fields are <input type="date">.
// Stored values are unchanged timestamptz — a chosen day is stored as the
// last minute of that day in the employer's own timezone, so "sista
// ansökningsdag: 14 May" genuinely includes all of 14 May.
// -----------------------------------------------------------------------------

export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInput(local: string): string | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(local);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Days from today, inclusive-ish; used for the 90-day display window. */
export function daysFromToday(dateInput: string): number | null {
  if (!dateInput) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((target.getTime() - startOfToday().getTime()) / 86_400_000);
}

/** The longest display window the database will accept (see
 *  jobs_validate_before_write: expires_at <= published_at + 90 days). */
export const MAX_DISPLAY_DAYS = 90;

/**
 * The last day the form actually offers and accepts: 89 days out, not 90.
 *
 * Not an off-by-one — a correction for one. The database compares two
 * TIMESTAMPS, `expires_at <= published_at + 90 days`, while this form deals
 * in whole days and stores a chosen day as 23:59 of that day (fromDateInput,
 * so that "last day: 20 Nov" genuinely includes all of 20 November). Publish
 * at 15:38 and pick day 90, and the stored 23:59 lands eight hours PAST
 * published_at + 90 days, so the database refuses the publication — at the
 * exact maximum the picker itself put in front of the employer.
 *
 * That was survivable while a moderator published later; now that an active
 * employer publishes immediately, the last selectable day would fail every
 * time. Day 89 at 23:59 is always strictly before published_at + 90 days
 * whatever the hour, so this is the largest bound that cannot fail. The
 * database rule is unchanged and remains the authority; the form simply
 * stops offering a day it knows will be rejected.
 */
export const MAX_EXPIRY_DAYS_OFFERED = MAX_DISPLAY_DAYS - 1;

export function maxExpiryDateInput(): string {
  const d = startOfToday();
  d.setDate(d.getDate() + MAX_EXPIRY_DAYS_OFFERED);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayDateInput(): string {
  const d = startOfToday();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// -----------------------------------------------------------------------------
// Row <-> form mapping. Unchanged column semantics; only the date columns
// are now read and written a day at a time.
// -----------------------------------------------------------------------------

/** A job row as it comes back from the database. Read defensively: the
 *  employer form must render an existing advert even if a column it does
 *  not manage is null, missing, or a shape it did not expect. */
export type JobRowLike = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function fromJobRow(job: JobRowLike): EmployerJobFormValues {
  const method = str(job.application_method);
  return {
    title_sv: str(job.title_sv),
    title_en: str(job.title_en),
    description_sv: str(job.description_sv),
    description_en: str(job.description_en),
    // The bilingual candidate-requirements columns. An advert written
    // before they existed reads back as "" from str(undefined), which is
    // exactly the empty-field state -- so an old job opens in the form
    // without special-casing, and its legacy `requirements` jsonb is left
    // where it is rather than being pulled into a field that cannot hold
    // it (see the migration, and JobAdSections's legacy branch).
    requirements_sv: str(job.requirements_sv),
    requirements_en: str(job.requirements_en),
    location_text: str(job.location_text),
    country: str(job.country),
    region: str(job.region),
    city: str(job.city),
    workplace_type: str(job.workplace_type),
    employment_type: str(job.employment_type),
    experience_level: str(job.experience_level),
    application_method:
      method === "external" || method === "email" || method === "internal" ? method : "unavailable",
    application_url: str(job.application_url),
    application_email: str(job.application_email),
    deadline_at: toDateInput(str(job.deadline_at)),
    expires_at: toDateInput(str(job.expires_at)),
    // family_id is read back verbatim -- the canonical id is never
    // re-derived or re-mapped from a label, so it round-trips exactly as
    // stored regardless of the viewer's current language.
    // "Annat" comes back from its own column, never from family_id -- which
    // is NULL on such a row precisely so no filter claims it.
    family_id: job.family_other ? OTHER_OPTION : str(job.family_id),
    family_other_text: str(job.family_other_text),
    profession_slug: job.profession_other ? OTHER_OPTION : str(job.profession_slug),
    profession_other_text: str(job.profession_other_text),
  };
}

export function toServerPayload(v: EmployerJobFormValues) {
  return {
    title_sv: v.title_sv.trim() || null,
    title_en: v.title_en.trim() || null,
    description_sv: v.description_sv.trim() || null,
    description_en: v.description_en.trim() || null,
    requirements_sv: v.requirements_sv.trim() || null,
    requirements_en: v.requirements_en.trim() || null,
    location_text: v.location_text.trim() || null,
    country: v.country.trim() || null,
    region: v.region.trim() || null,
    city: v.city.trim() || null,
    workplace_type: v.workplace_type || null,
    employment_type: v.employment_type || null,
    experience_level: v.experience_level || null,
    application_method: v.application_method,
    application_url: v.application_url.trim() || null,
    application_email: v.application_email.trim() || null,
    deadline_at: fromDateInput(v.deadline_at),
    expires_at: fromDateInput(v.expires_at),
    // Three states, three shapes. The canonical columns stay canonical or
    // NULL; the employer's own words never touch them.
    family_id: v.family_id === OTHER_OPTION ? null : v.family_id.trim() || null,
    family_other: v.family_id === OTHER_OPTION,
    family_other_text: v.family_id === OTHER_OPTION ? v.family_other_text.trim() || null : null,
    profession_slug: v.profession_slug === OTHER_OPTION ? null : v.profession_slug.trim() || null,
    profession_other: v.profession_slug === OTHER_OPTION,
    profession_other_text:
      v.profession_slug === OTHER_OPTION ? v.profession_other_text.trim() || null : null,
  };
}

// -----------------------------------------------------------------------------
// Where the work is done. Countries are presented by name; the stored value
// is the same ISO-3166 alpha-2 code the column has always held. An advert
// already carrying a code outside this list keeps it (see
// countryOptionsFor) — nothing is ever silently dropped on save.
// -----------------------------------------------------------------------------

export const COUNTRY_OPTIONS: { code: string; sv: string; en: string }[] = [
  { code: "SE", sv: "Sverige", en: "Sweden" },
  { code: "NO", sv: "Norge", en: "Norway" },
  { code: "DK", sv: "Danmark", en: "Denmark" },
  { code: "FI", sv: "Finland", en: "Finland" },
  { code: "IS", sv: "Island", en: "Iceland" },
  { code: "EE", sv: "Estland", en: "Estonia" },
  { code: "LV", sv: "Lettland", en: "Latvia" },
  { code: "LT", sv: "Litauen", en: "Lithuania" },
  { code: "DE", sv: "Tyskland", en: "Germany" },
  { code: "NL", sv: "Nederländerna", en: "Netherlands" },
  { code: "PL", sv: "Polen", en: "Poland" },
  { code: "GB", sv: "Storbritannien", en: "United Kingdom" },
];

export function countryOptionsFor(current: string): { code: string; sv: string; en: string }[] {
  const code = current.trim().toUpperCase();
  if (!code || COUNTRY_OPTIONS.some((c) => c.code === code)) return COUNTRY_OPTIONS;
  return [...COUNTRY_OPTIONS, { code, sv: code, en: code }];
}

// -----------------------------------------------------------------------------
// Steps.
// -----------------------------------------------------------------------------

export type StepId = "job" | "description" | "application" | "review";

export const STEP_IDS: StepId[] = ["job", "description", "application", "review"];

export const STEP_LABEL_KEYS: Record<StepId, TranslationKey> = {
  job: "employer.jobs.form.step.job",
  description: "employer.jobs.form.step.description",
  application: "employer.jobs.form.step.application",
  review: "employer.jobs.form.step.review",
};

// -----------------------------------------------------------------------------
// Publication readiness.
// -----------------------------------------------------------------------------

export type BlockerField =
  | "title"
  | "description"
  | "application_method"
  | "application_url"
  | "application_email"
  | "expires_at"
  | "deadline_at";

export type Blocker = {
  /** Which question is unanswered — named for the employer, not the column. */
  field: BlockerField;
  /** Where to send them to answer it. */
  step: StepId;
  /** What to call it in the "these things are missing" list. */
  labelKey: TranslationKey;
  /** Why it is blocked, when "you left it empty" is not the reason. */
  detailKey?: TranslationKey;
  /** The input to focus once the step is open. */
  focus: keyof EmployerJobFormValues;
};

export function isLikelyUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * What stops this advert from being published. An empty array means the
 * employer has answered everything the platform genuinely needs.
 *
 * Ordered by step so the list reads in the order the employer filled the
 * form in, which is also the order they will fix it in.
 */
export function collectPublishBlockers(v: EmployerJobFormValues): Blocker[] {
  const out: Blocker[] = [];

  if (!v.title_sv.trim() && !v.title_en.trim()) {
    out.push({
      field: "title",
      step: "job",
      labelKey: "employer.jobs.form.blocker.title",
      focus: "title_sv",
    });
  }

  if (!v.description_sv.trim() && !v.description_en.trim()) {
    out.push({
      field: "description",
      step: "description",
      labelKey: "employer.jobs.form.blocker.description",
      focus: "description_sv",
    });
  }

  if (v.application_method === "unavailable") {
    out.push({
      field: "application_method",
      step: "application",
      labelKey: "employer.jobs.form.blocker.applicationMethod",
      focus: "application_method",
    });
  }

  if (v.application_method === "external") {
    const url = v.application_url.trim();
    if (!url) {
      out.push({
        field: "application_url",
        step: "application",
        labelKey: "employer.jobs.form.blocker.applicationUrl",
        focus: "application_url",
      });
    } else if (!isLikelyUrl(url)) {
      out.push({
        field: "application_url",
        step: "application",
        labelKey: "employer.jobs.form.blocker.applicationUrl",
        detailKey: "employer.jobs.form.validation.invalidUrl",
        focus: "application_url",
      });
    }
  }

  if (v.application_method === "email") {
    const email = v.application_email.trim();
    if (!email) {
      out.push({
        field: "application_email",
        step: "application",
        labelKey: "employer.jobs.form.blocker.applicationEmail",
        focus: "application_email",
      });
    } else if (!isLikelyEmail(email)) {
      out.push({
        field: "application_email",
        step: "application",
        labelKey: "employer.jobs.form.blocker.applicationEmail",
        detailKey: "employer.jobs.form.validation.invalidEmail",
        focus: "application_email",
      });
    }
  }

  if (!v.expires_at) {
    out.push({
      field: "expires_at",
      step: "application",
      labelKey: "employer.jobs.form.blocker.expiresAt",
      focus: "expires_at",
    });
  } else {
    const days = daysFromToday(v.expires_at);
    if (days !== null && days < 0) {
      out.push({
        field: "expires_at",
        step: "application",
        labelKey: "employer.jobs.form.blocker.expiresAt",
        detailKey: "employer.jobs.form.validation.expiresInPast",
        focus: "expires_at",
      });
    } else if (days !== null && days > MAX_EXPIRY_DAYS_OFFERED) {
      out.push({
        field: "expires_at",
        step: "application",
        labelKey: "employer.jobs.form.blocker.expiresAt",
        detailKey: "employer.jobs.form.validation.expiresTooFar",
        focus: "expires_at",
      });
    }
  }

  // deadline_at is optional. It only blocks when it has been filled in
  // with a day that has already passed, which the database would reject
  // at publication anyway (deadline_at >= published_at).
  if (v.deadline_at) {
    const days = daysFromToday(v.deadline_at);
    if (days !== null && days < 0) {
      out.push({
        field: "deadline_at",
        step: "application",
        labelKey: "employer.jobs.form.blocker.deadlineAt",
        detailKey: "employer.jobs.form.validation.deadlineInPast",
        focus: "deadline_at",
      });
    }
  }

  return out;
}

/**
 * What stops this advert from being SAVED as a draft — deliberately
 * almost nothing. An unfinished draft is the normal state of a job
 * somebody is still writing, so only genuinely malformed input is
 * refused, and only because the server's own zod .url()/.email() parse
 * would otherwise reject the whole save with a validation error the
 * employer cannot act on.
 */
export type DraftFieldErrors = Partial<Record<keyof EmployerJobFormValues, TranslationKey>>;

export function collectDraftIssues(v: EmployerJobFormValues): DraftFieldErrors {
  const errors: DraftFieldErrors = {};
  if (v.application_method === "external" && v.application_url.trim()) {
    if (!isLikelyUrl(v.application_url.trim())) {
      errors.application_url = "employer.jobs.form.validation.invalidUrl";
    }
  }
  if (v.application_method === "email" && v.application_email.trim()) {
    if (!isLikelyEmail(v.application_email.trim())) {
      errors.application_email = "employer.jobs.form.validation.invalidEmail";
    }
  }
  return errors;
}

// -----------------------------------------------------------------------------
// How this platform publishes.
//
// CQrityjob approves the EMPLOYER, not each of that employer's ordinary
// advertisements. An ACTIVE organisation publishes its own valid vacancy
// directly; no CQrityjob admin approves an ordinary job advert.
//
// This constant is honest about the database, which is the only place the
// rule really lives. As of migration 20260906091000,
// jobs_validate_before_write() allows an employer draft->published and
// rejected->published, and stamps published_at itself. Before that
// migration this said "moderated", because it had to: the trigger allowed
// only draft->pending_review and refused any employer write touching
// published_at, so a Publicera button would have failed at the database
// rather than merely at the server function.
//
// pending_review is NOT gone. The transition into it is retained for legacy
// adverts and for the exceptional one, and admin keeps every moderation
// power it had. What changed is the normal path, and only for an employer
// the platform has already approved — an employer that is pending,
// suspended, rejected or archived still cannot publish anything, which the
// database enforces independently of this constant.
// -----------------------------------------------------------------------------

export type PublicationModel = "moderated" | "direct";

export const PUBLICATION_MODEL: PublicationModel = "direct";

// -----------------------------------------------------------------------------
// Server error CODE -> localised message. employer-jobs.functions.ts throws
// stable UPPER_SNAKE_CASE codes (never English prose) precisely so this is
// the one place that decides what the employer actually sees, in the
// active language. Any code this map doesn't recognise -- including a
// future code this file hasn't been updated for yet, or (defensively) a
// raw string that slipped through some other path -- falls back to the
// generic message, never to the raw value itself.
// -----------------------------------------------------------------------------

export const SERVER_ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
  // The lifecycle refusals. jobs_delete_draft() names the rule that stopped
  // it, and each one has a different thing for the employer to do next --
  // which is the whole reason the function raises four codes instead of one.
  JOB_HAS_APPLICATIONS: "employer.jobs.error.hasApplications",
  JOB_HAS_ASSIGNMENTS: "employer.jobs.error.hasAssignments",
  JOB_HAS_INVITATIONS: "employer.jobs.error.hasAssignments",
  JOB_NOT_DELETABLE: "employer.jobs.error.notDeletable",
  JOB_NOT_AUTHORISED: "employer.jobs.error.notAuthorised",
  ACCESS_NOT_AVAILABLE: "employer.jobs.form.error.accessNotAvailable",
  LOAD_JOBS_FAILED: "employer.jobs.form.error.loadJobsFailed",
  LOAD_JOB_FAILED: "employer.jobs.form.error.loadJobFailed",
  JOB_NOT_FOUND: "employer.jobs.form.error.jobNotFound",
  JOB_NOT_EDITABLE: "employer.jobs.form.error.jobNotEditable",
  LOAD_EMPLOYER_FAILED: "employer.jobs.form.error.loadEmployerFailed",
  EMPLOYER_NOT_FOUND: "employer.jobs.form.error.employerNotFound",
  JOB_NOT_SUBMITTABLE: "employer.jobs.form.error.jobNotSubmittable",
  JOB_NOT_PUBLISHABLE: "employer.jobs.form.error.jobNotPublishable",
  EMPLOYER_NOT_APPROVED: "employer.jobs.form.error.employerNotApproved",
  PUBLISH_JOB_FAILED: "employer.jobs.form.error.publishJobFailed",
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

/** The value the two taxonomy selects use for "Annat".
 *
 *  Deliberately not a plausible id: it must never survive into family_id or
 *  profession_slug by accident, and if it ever did, assert_cig_family_id()
 *  and the cig_professions lookup both reject it loudly rather than storing it. */
export const OTHER_OPTION = "__other__";

export function translateJobServerError(
  code: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (code && code in SERVER_ERROR_MESSAGE_KEYS) {
    return t(SERVER_ERROR_MESSAGE_KEYS[code]);
  }
  return t("employer.jobs.form.error.generic");
}
