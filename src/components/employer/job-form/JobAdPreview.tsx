// "Förhandsgranska annons" — the draft rendered through the *same*
// components the public /jobs/$slug page uses (JobAdHeading /
// JobAdSections), not a second employer-only rendition of an advert.
// If the public page changes, this changes with it.
//
// published_at is deliberately left null: it does not exist yet, and
// showing a made-up publication date in a preview would be a small lie
// about a real date the candidate will later see.

import { useT } from "@/i18n/context";
import { JobAdHeading, JobAdSections, type JobAdContentJob } from "@/components/jobs/JobAdContent";
import { fromDateInput, type EmployerJobFormValues } from "./model";

export function toPreviewJob(v: EmployerJobFormValues): JobAdContentJob {
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
    published_at: null,
    deadline_at: fromDateInput(v.deadline_at),
    responsibilities: null,
    requirements_sv: v.requirements_sv.trim() || null,
    requirements_en: v.requirements_en.trim() || null,
    // The legacy jsonb is not part of the form and never has been, so a
    // preview has nothing to show from it. The published page renders it
    // for older adverts; see JobAdSections.
    requirements: null,
    benefits: null,
  };
}

export function JobAdPreview({
  values,
  employerName,
}: {
  values: EmployerJobFormValues;
  employerName?: string | null;
}) {
  const { t } = useT();
  const job = toPreviewJob(values);

  const applyLabel =
    values.application_method === "internal"
      ? t("employer.jobs.form.preview.applyInternal")
      : values.application_method === "external"
        ? t("employer.jobs.form.preview.applyExternal")
        : values.application_method === "email"
          ? t("employer.jobs.form.preview.applyEmail")
          : t("employer.jobs.form.preview.applyMissing");

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("employer.jobs.form.preview.banner")}
        </p>
      </div>
      <div className="px-4 py-6 sm:px-6">
        <JobAdHeading job={job} employerName={employerName} headingLevel="h2" />
        <div className="mt-8 space-y-8">
          <JobAdSections job={job} />
        </div>
        <div className="mt-8 rounded-lg border border-border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("employer.jobs.form.preview.applyHeading")}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{applyLabel}</p>
        </div>
      </div>
    </div>
  );
}
