// Phase H3 — Shared job draft form used by the create and edit routes.
// Presentation-only component: state and submit callbacks come from the
// parent route, which owns the server-function calls and cache
// invalidation.
//
// Phase H3.2.1 correction: family_id, workplace_type, employment_type and
// experience_level previously either had no catalogue binding at all or
// were <select> options showing the raw English backend enum token
// verbatim in both languages. Fixed by importing the same, single
// canonical sources already used on the public /jobs surfaces:
// career-area-labels.ts's `careerAreaLabels` for family_id (the current
// 14-value canonical Career Family whitelist enforced by
// assert_cig_family_id()) and enum-labels.ts's *_VALUES + *Label()
// helpers for workplace_type / employment_type / experience_level.
//
// Final UX/validation/localisation pass:
//   - profession_slug is no longer free text. It now reads from
//     listPublishedProfessionsV2 (src/lib/knowledge-graph/read-v2.functions.ts)
//     -- an already-existing, already-RLS-safe, publishable-key read of
//     the live cig_professions catalogue filtered to content_status=
//     'published'. This is the ONLY safe catalogue in this repository an
//     employer-facing selector could read from; reusing it (rather than
//     inventing a second profession taxonomy) satisfies "do not create a
//     second profession taxonomy" and "do not leave an internal slug as
//     employer-entered free text." A dependent, family-filtered selector
//     was considered and rejected: cig_profession_families (uuid ids) and
//     the 14 canonical Career Family slugs jobs.family_id actually uses
//     are two different taxonomies with no existing mapping between them
//     anywhere in this codebase -- building one now would itself be a
//     new, unverified taxonomy, which the brief explicitly forbids.
//   - Every error this form can display now goes through
//     translateJobServerError() (for server-thrown error CODES) or the
//     client-side validate*() functions below (for field-level messages)
//     -- both always render via t(), never raw English or raw backend
//     text, in either language.
//   - Client-side validation before every server call: validateDraft()
//     covers only what the DB schema genuinely requires for a draft
//     (nothing beyond format-correctness on fields the employer did
//     fill in); validateForSubmit() mirrors submitEmployerJob's own
//     "missing required fields" gate exactly (title in either language,
//     description in either language, a valid application target for
//     the selected method, and expires_at) -- no new requirement was
//     invented on either side. family_id and profession_slug are
//     required by neither.
//
// Both create and edit routes render this one shared component, so
// create/edit/save/submit/reload all go through the exact same mapping by
// construction -- there is no per-route duplication to drift out of sync.

import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import {
  employmentTypeLabel,
  workplaceTypeLabel,
  experienceLevelLabel,
  jobStatusLabel,
  EMPLOYMENT_TYPE_VALUES,
  WORKPLACE_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
} from "@/lib/job-intelligence/enum-labels";
import { listPublishedProfessionsV2 } from "@/lib/knowledge-graph/read-v2.functions";

export type EmployerJobFormValues = {
  title_sv: string;
  title_en: string;
  description_sv: string;
  description_en: string;
  location_text: string;
  country: string;
  region: string;
  city: string;
  workplace_type: string;
  employment_type: string;
  experience_level: string;
  application_method: "external" | "email" | "internal" | "unavailable";
  application_url: string;
  application_email: string;
  deadline_at: string;
  expires_at: string;
  family_id: string;
  profession_slug: string;
};

export const emptyValues: EmployerJobFormValues = {
  title_sv: "",
  title_en: "",
  description_sv: "",
  description_en: "",
  location_text: "",
  country: "",
  region: "",
  city: "",
  workplace_type: "",
  employment_type: "",
  experience_level: "",
  application_method: "external",
  application_url: "",
  application_email: "",
  deadline_at: "",
  expires_at: "",
  family_id: "",
  profession_slug: "",
};

function toIsoOrNull(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function fromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromJobRow(job: Record<string, any>): EmployerJobFormValues {
  return {
    title_sv: job.title_sv ?? "",
    title_en: job.title_en ?? "",
    description_sv: job.description_sv ?? "",
    description_en: job.description_en ?? "",
    location_text: job.location_text ?? "",
    country: job.country ?? "",
    region: job.region ?? "",
    city: job.city ?? "",
    workplace_type: job.workplace_type ?? "",
    employment_type: job.employment_type ?? "",
    experience_level: job.experience_level ?? "",
    application_method: (job.application_method ??
      "external") as EmployerJobFormValues["application_method"],
    application_url: job.application_url ?? "",
    application_email: job.application_email ?? "",
    deadline_at: fromIso(job.deadline_at),
    expires_at: fromIso(job.expires_at),
    // family_id is read back verbatim -- the canonical id is never
    // re-derived or re-mapped from a label, so it round-trips exactly as
    // stored regardless of the viewer's current language.
    family_id: job.family_id ?? "",
    profession_slug: job.profession_slug ?? "",
  };
}

export function toServerPayload(v: EmployerJobFormValues) {
  return {
    title_sv: v.title_sv.trim() || null,
    title_en: v.title_en.trim() || null,
    description_sv: v.description_sv.trim() || null,
    description_en: v.description_en.trim() || null,
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
    deadline_at: toIsoOrNull(v.deadline_at),
    expires_at: toIsoOrNull(v.expires_at),
    family_id: v.family_id.trim() || null,
    profession_slug: v.profession_slug.trim() || null,
  };
}

// -----------------------------------------------------------------------------
// Server error CODE -> localised message. employer-jobs.functions.ts throws
// stable UPPER_SNAKE_CASE codes (never English prose) precisely so this is
// the one place that decides what the employer actually sees, in the
// active language. Any code this map doesn't recognise -- including a
// future code this file hasn't been updated for yet, or (defensively) a
// raw string that slipped through some other path -- falls back to the
// generic message, never to the raw value itself.
// -----------------------------------------------------------------------------
const SERVER_ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
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

export function translateJobServerError(
  code: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (code && code in SERVER_ERROR_MESSAGE_KEYS) {
    return t(SERVER_ERROR_MESSAGE_KEYS[code]);
  }
  return t("employer.jobs.form.error.generic");
}

// -----------------------------------------------------------------------------
// Client-side validation. validateDraft() checks only what the live
// jobs table schema genuinely requires to save a draft (application_method
// always has a value via emptyValues' default; every other draft column is
// nullable) plus format-correctness on fields the employer did fill in, so
// a malformed URL/email doesn't reach the server's zod .url()/.email()
// parse and produce an unhandled validation error there. validateForSubmit()
// mirrors submitEmployerJob's own "missing" gate field-for-field --
// title in either language, description in either language, a valid
// application target for the selected method, and expires_at. Neither
// function requires family_id or profession_slug; both are optional at
// every stage per the live schema and the server's own submission gate.
// -----------------------------------------------------------------------------

type FieldErrors = Partial<Record<keyof EmployerJobFormValues, string>>;

const FIELD_ORDER: (keyof EmployerJobFormValues)[] = [
  "title_sv",
  "title_en",
  "description_sv",
  "description_en",
  "application_method",
  "application_url",
  "application_email",
  "expires_at",
];

function isLikelyUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateDraft(v: EmployerJobFormValues, t: (key: TranslationKey) => string): FieldErrors {
  const errors: FieldErrors = {};
  if (v.application_method === "external" && v.application_url.trim()) {
    if (!isLikelyUrl(v.application_url.trim())) {
      errors.application_url = t("employer.jobs.form.validation.invalidUrl");
    }
  }
  if (v.application_method === "email" && v.application_email.trim()) {
    if (!isLikelyEmail(v.application_email.trim())) {
      errors.application_email = t("employer.jobs.form.validation.invalidEmail");
    }
  }
  return errors;
}

function validateForSubmit(
  v: EmployerJobFormValues,
  t: (key: TranslationKey) => string,
): FieldErrors {
  const errors: FieldErrors = { ...validateDraft(v, t) };
  const required = t("employer.jobs.form.validation.required");

  if (!v.title_sv.trim() && !v.title_en.trim()) {
    errors.title_sv = required;
    errors.title_en = required;
  }
  if (!v.description_sv.trim() && !v.description_en.trim()) {
    errors.description_sv = required;
    errors.description_en = required;
  }
  if (v.application_method === "unavailable") {
    errors.application_method = required;
  }
  if (v.application_method === "external" && !v.application_url.trim()) {
    errors.application_url = required;
  }
  if (v.application_method === "email" && !v.application_email.trim()) {
    errors.application_email = required;
  }
  if (!v.expires_at) {
    errors.expires_at = required;
  }
  return errors;
}

type Props = {
  initial: EmployerJobFormValues;
  readOnly?: boolean;
  saving?: boolean;
  submitting?: boolean;
  error?: string | null;
  onSaveDraft: (values: EmployerJobFormValues) => void;
  onSubmitForReview?: (values: EmployerJobFormValues) => void;
  editableStatus?: string;
};

export function EmployerJobForm({
  initial,
  readOnly,
  saving,
  submitting,
  error,
  onSaveDraft,
  onSubmitForReview,
  editableStatus,
}: Props) {
  const { t, lang } = useT();
  const [values, setValues] = useState<EmployerJobFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fieldRefs = useRef<Partial<Record<keyof EmployerJobFormValues, HTMLElement | null>>>({});

  const listProfessionsFn = useServerFn(listPublishedProfessionsV2);
  const professionsQuery = useQuery({
    queryKey: ["employer", "professions-catalogue"],
    queryFn: () => listProfessionsFn(),
    staleTime: 5 * 60 * 1000,
  });
  const professions = (professionsQuery.data?.data ?? []).slice().sort((a: any, b: any) => {
    const an = (lang === "sv" ? a.title_sv : a.title_en) ?? "";
    const bn = (lang === "sv" ? b.title_sv : b.title_en) ?? "";
    return an.localeCompare(bn, lang);
  });

  function set<K extends keyof EmployerJobFormValues>(key: K, value: EmployerJobFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((fe) => {
        const next = { ...fe };
        delete next[key];
        return next;
      });
    }
  }

  function focusFirstError(errors: FieldErrors) {
    const firstKey = FIELD_ORDER.find((k) => errors[k]);
    if (!firstKey) return;
    const el = fieldRefs.current[firstKey];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  }

  function handleSaveDraft() {
    const errors = validateDraft(values, t);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return;
    }
    onSaveDraft(values);
  }

  function handleSubmitForReview() {
    const errors = validateForSubmit(values, t);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return;
    }
    onSubmitForReview?.(values);
  }

  const field =
    "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
  const fieldWithError = (hasError: boolean) =>
    hasError ? `${field} border-destructive focus:ring-destructive` : field;
  const label = "block text-xs font-medium uppercase tracking-wide text-muted-foreground";
  const requiredForReviewHint = (
    <span className="ml-1 normal-case text-[11px] font-normal tracking-normal text-muted-foreground">
      ({t("employer.jobs.form.hint.requiredForReview")})
    </span>
  );

  function FieldError({ name }: { name: keyof EmployerJobFormValues }) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <p role="alert" className="mt-1 text-xs text-destructive">
        {message}
      </p>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly) handleSaveDraft();
      }}
    >
      {readOnly && editableStatus && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("employer.jobs.form.readOnlyNotice")} (
          {jobStatusLabel(editableStatus, lang) || editableStatus})
        </div>
      )}

      {Object.keys(fieldErrors).length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {t("employer.jobs.form.validation.summary")}
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("employer.jobs.form.section.basics")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("employer.jobs.form.section.basicsHint")}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>
                {t("employer.jobs.form.field.titleSv")}
                {requiredForReviewHint}
              </label>
              <input
                ref={(el) => {
                  fieldRefs.current.title_sv = el;
                }}
                className={fieldWithError(!!fieldErrors.title_sv)}
                value={values.title_sv}
                onChange={(e) => set("title_sv", e.target.value)}
              />
              <FieldError name="title_sv" />
            </div>
            <div>
              <label className={label}>
                {t("employer.jobs.form.field.titleEn")}
                {requiredForReviewHint}
              </label>
              <input
                ref={(el) => {
                  fieldRefs.current.title_en = el;
                }}
                className={fieldWithError(!!fieldErrors.title_en)}
                value={values.title_en}
                onChange={(e) => set("title_en", e.target.value)}
              />
              <FieldError name="title_en" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>
                {t("employer.jobs.form.field.descriptionSv")}
                {requiredForReviewHint}
              </label>
              <textarea
                ref={(el) => {
                  fieldRefs.current.description_sv = el;
                }}
                className={fieldWithError(!!fieldErrors.description_sv)}
                rows={6}
                value={values.description_sv}
                onChange={(e) => set("description_sv", e.target.value)}
              />
              <FieldError name="description_sv" />
            </div>
            <div>
              <label className={label}>
                {t("employer.jobs.form.field.descriptionEn")}
                {requiredForReviewHint}
              </label>
              <textarea
                ref={(el) => {
                  fieldRefs.current.description_en = el;
                }}
                className={fieldWithError(!!fieldErrors.description_en)}
                rows={6}
                value={values.description_en}
                onChange={(e) => set("description_en", e.target.value)}
              />
              <FieldError name="description_en" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("employer.jobs.form.section.location")}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>{t("employer.jobs.form.field.locationText")}</label>
              <input
                className={field}
                value={values.location_text}
                onChange={(e) => set("location_text", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.country")}</label>
              <input
                className={field}
                maxLength={2}
                value={values.country}
                onChange={(e) => set("country", e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.region")}</label>
              <input
                className={field}
                value={values.region}
                onChange={(e) => set("region", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.city")}</label>
              <input
                className={field}
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.workplaceType")}</label>
              <select
                className={field}
                value={values.workplace_type}
                onChange={(e) => set("workplace_type", e.target.value)}
              >
                <option value="">—</option>
                {WORKPLACE_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {workplaceTypeLabel(v, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.employmentType")}</label>
              <select
                className={field}
                value={values.employment_type}
                onChange={(e) => set("employment_type", e.target.value)}
              >
                <option value="">—</option>
                {EMPLOYMENT_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {employmentTypeLabel(v, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.experienceLevel")}</label>
              <select
                className={field}
                value={values.experience_level}
                onChange={(e) => set("experience_level", e.target.value)}
              >
                <option value="">—</option>
                {EXPERIENCE_LEVEL_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {experienceLevelLabel(v, lang)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("employer.jobs.form.section.application")}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>{t("employer.jobs.form.field.applicationMethod")}</label>
              <select
                className={field}
                value={values.application_method}
                onChange={(e) =>
                  set(
                    "application_method",
                    e.target.value as EmployerJobFormValues["application_method"],
                  )
                }
              >
                <option value="external">
                  {t("employer.jobs.form.applicationMethod.external")}
                </option>
                <option value="email">{t("employer.jobs.form.applicationMethod.email")}</option>
                <option value="internal">
                  {t("employer.jobs.form.applicationMethod.internal")}
                </option>
              </select>
            </div>
            {values.application_method === "external" && (
              <div>
                <label className={label}>
                  {t("employer.jobs.form.field.applicationUrl")}
                  {requiredForReviewHint}
                </label>
                <input
                  ref={(el) => {
                    fieldRefs.current.application_url = el;
                  }}
                  className={fieldWithError(!!fieldErrors.application_url)}
                  type="url"
                  value={values.application_url}
                  onChange={(e) => set("application_url", e.target.value)}
                  placeholder="https://…"
                />
                <FieldError name="application_url" />
              </div>
            )}
            {values.application_method === "email" && (
              <div>
                <label className={label}>
                  {t("employer.jobs.form.field.applicationEmail")}
                  {requiredForReviewHint}
                </label>
                <input
                  ref={(el) => {
                    fieldRefs.current.application_email = el;
                  }}
                  className={fieldWithError(!!fieldErrors.application_email)}
                  type="email"
                  value={values.application_email}
                  onChange={(e) => set("application_email", e.target.value)}
                />
                <FieldError name="application_email" />
              </div>
            )}
            <div>
              <label className={label}>{t("employer.jobs.form.field.deadlineAt")}</label>
              <input
                className={field}
                type="datetime-local"
                value={values.deadline_at}
                onChange={(e) => set("deadline_at", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>
                {t("employer.jobs.form.field.expiresAt")}
                {requiredForReviewHint}
              </label>
              <input
                ref={(el) => {
                  fieldRefs.current.expires_at = el;
                }}
                className={fieldWithError(!!fieldErrors.expires_at)}
                type="datetime-local"
                value={values.expires_at}
                onChange={(e) => set("expires_at", e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("employer.jobs.form.field.expiresAtHint")}
              </p>
              <FieldError name="expires_at" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("employer.jobs.form.section.classification")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("employer.jobs.form.hint.optional")}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>{t("employer.jobs.form.field.familyId")}</label>
              <select
                className={field}
                value={values.family_id}
                onChange={(e) => set("family_id", e.target.value)}
              >
                <option value="">—</option>
                {careerAreaLabels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name[lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.professionSlug")}</label>
              <select
                className={field}
                value={values.profession_slug}
                onChange={(e) => set("profession_slug", e.target.value)}
                disabled={professionsQuery.isLoading}
              >
                <option value="">—</option>
                {professions.map((p: any) => (
                  <option key={p.slug} value={p.slug}>
                    {(lang === "sv" ? p.title_sv : p.title_en) || p.slug}
                  </option>
                ))}
              </select>
              {professionsQuery.isLoading && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("employer.jobs.form.profession.loading")}
                </p>
              )}
              {(professionsQuery.isError || professionsQuery.data?.error) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("employer.jobs.form.profession.loadError")}
                </p>
              )}
            </div>
          </div>
        </div>
      </fieldset>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {translateJobServerError(error, t)}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving || submitting}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
          >
            {saving ? t("employer.jobs.form.saving") : t("employer.jobs.form.saveDraft")}
          </button>
          {onSubmitForReview && (
            <button
              type="button"
              disabled={saving || submitting}
              onClick={handleSubmitForReview}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
            >
              {submitting
                ? t("employer.jobs.form.submitting")
                : t("employer.jobs.form.submitForReview")}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
