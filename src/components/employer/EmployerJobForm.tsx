// Phase H3 — Shared job draft form used by the create and edit routes.
// Presentation-only component: state and submit callbacks come from the
// parent route, which owns the server-function calls and cache
// invalidation.
//
// Phase H3.2.1 correction: family_id, workplace_type, employment_type and
// experience_level previously either had no catalogue binding at all
// (family_id was a raw free-text input, letting a translated display
// label like "Säkerhet" be typed in and submitted as the stored ID -- the
// jobs_validate_before_write trigger's assert_cig_family_id() whitelist
// then rejected the write, but only at save time, with no upfront
// guidance) or were <select> options showing the raw English backend enum
// token verbatim in both languages (and, for workplace_type, an outright
// wrong value: "on_site" instead of the DB's actual "onsite", which would
// have failed the jobs.workplace_type CHECK constraint on any real save).
//
// Fixed by importing the same, single canonical sources already used on
// the public /jobs surfaces rather than inventing a second taxonomy:
//   - career-area-labels.ts's `careerAreaLabels` for family_id -- this is
//     exactly the current 14-value canonical Career Family whitelist
//     enforced by assert_cig_family_id() in
//     supabase/migrations/20260717172039_...sql ("Narrow the family
//     whitelist to the 14 canonical IDs").
//   - enum-labels.ts's *_VALUES + *Label() helpers for workplace_type /
//     employment_type / experience_level -- the same module
//     src/routes/jobs.index.tsx already uses for its public filter UI.
// Both create and edit routes render this one shared component, so
// create/edit/save/submit/reload all go through the exact same mapping by
// construction -- there is no per-route duplication to drift out of sync.
//
// profession_slug is intentionally left as free text in this pass: it has
// no static client-side catalogue anywhere in this codebase (it is
// validated against the live, DB-only `cig_professions` table), no
// translated-label-as-ID defect was reported or reproduced for it, and
// building a searchable profession picker is new functionality, not a
// defect fix -- out of scope here (see the H3.2.1 report's "known
// limitations").

import { useState } from "react";
import { useT } from "@/i18n/context";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import {
  employmentTypeLabel,
  workplaceTypeLabel,
  experienceLevelLabel,
  EMPLOYMENT_TYPE_VALUES,
  WORKPLACE_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
} from "@/lib/job-intelligence/enum-labels";

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

  function set<K extends keyof EmployerJobFormValues>(key: K, value: EmployerJobFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  const field =
    "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
  const label = "block text-xs font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly) onSaveDraft(values);
      }}
    >
      {readOnly && editableStatus && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("employer.jobs.form.readOnlyNotice")} ({editableStatus})
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("employer.jobs.form.section.basics")}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>{t("employer.jobs.form.field.titleSv")}</label>
              <input
                className={field}
                value={values.title_sv}
                onChange={(e) => set("title_sv", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.titleEn")}</label>
              <input
                className={field}
                value={values.title_en}
                onChange={(e) => set("title_en", e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>{t("employer.jobs.form.field.descriptionSv")}</label>
              <textarea
                className={field}
                rows={6}
                value={values.description_sv}
                onChange={(e) => set("description_sv", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>{t("employer.jobs.form.field.descriptionEn")}</label>
              <textarea
                className={field}
                rows={6}
                value={values.description_en}
                onChange={(e) => set("description_en", e.target.value)}
              />
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
                <label className={label}>{t("employer.jobs.form.field.applicationUrl")}</label>
                <input
                  className={field}
                  type="url"
                  value={values.application_url}
                  onChange={(e) => set("application_url", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            )}
            {values.application_method === "email" && (
              <div>
                <label className={label}>{t("employer.jobs.form.field.applicationEmail")}</label>
                <input
                  className={field}
                  type="email"
                  value={values.application_email}
                  onChange={(e) => set("application_email", e.target.value)}
                />
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
                {t("employer.jobs.form.field.expiresAt")}{" "}
                <span className="text-destructive">*</span>
              </label>
              <input
                className={field}
                type="datetime-local"
                value={values.expires_at}
                onChange={(e) => set("expires_at", e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("employer.jobs.form.field.expiresAtHint")}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("employer.jobs.form.section.classification")}
          </h2>
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
              <input
                className={field}
                value={values.profession_slug}
                onChange={(e) => set("profession_slug", e.target.value)}
              />
            </div>
          </div>
        </div>
      </fieldset>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
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
              onClick={() => onSubmitForReview(values)}
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
