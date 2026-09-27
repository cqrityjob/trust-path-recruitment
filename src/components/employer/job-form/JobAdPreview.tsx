// "Förhandsgranska annons" — the draft rendered through the *same*
// components the public /jobs/$slug page uses (JobAdHeading /
// JobAdSections), not a second employer-only rendition of an advert.
// If the public page changes, this changes with it.
//
// published_at is deliberately left null: it does not exist yet, and
// showing a made-up publication date in a preview would be a small lie
// about a real date the candidate will later see.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEmployerOrganisation } from "@/lib/job-intelligence/employer-settings.functions";
import {
  VacancyRequirementsContent,
  type VacancyRequirementPresentation,
} from "@/components/jobs/VacancyRequirementsContent";
import { EmployerPresentation } from "@/components/jobs/EmployerPresentation";
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
  employerId,
  requirements = [],
}: {
  values: EmployerJobFormValues;
  employerName?: string | null;
  employerId?: string;
  requirements?: readonly VacancyRequirementPresentation[];
}) {
  const { t } = useT();
  const job = toPreviewJob(values);
  const getOrganisation = useServerFn(getEmployerOrganisation);
  const organisation = useQuery({
    queryKey: ["employer", employerId, "settings"],
    queryFn: () => getOrganisation({ data: { employerId: employerId! } }),
    enabled: !!employerId,
  });
  const company = organisation.data;
  const employer = company
    ? {
        id: company.id,
        slug: company.slug,
        name: company.name,
        logo_url: company.logoUrl,
        website: company.website,
        country: company.country,
        description_sv: company.descriptionSv,
        description_en: company.descriptionEn,
      }
    : null;

  const applyLabel =
    values.application_method === "internal"
      ? t("employer.jobs.form.preview.applyInternal")
      : values.application_method === "external"
        ? t("employer.jobs.form.preview.applyExternal")
        : values.application_method === "email"
          ? t("employer.jobs.form.preview.applyEmail")
          : t("employer.jobs.form.preview.applyMissing");

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("employer.jobs.form.preview.banner")}
        </p>
      </div>
      <div className="p-5 sm:p-8">
        <JobAdHeading
          job={job}
          employerName={employer?.name ?? employerName}
          employerLogoUrl={employer?.logo_url}
          headingLevel="h2"
        />
      </div>
      <div className="border-y border-border px-5 py-4 sm:px-8">
        <p className="text-xs text-muted-foreground">
          {t("employer.jobs.form.preview.applyHeading")}
        </p>
        <span className="mt-2 inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
          {applyLabel}
        </span>
      </div>
      <div className="space-y-8 p-5 sm:p-8">
        <JobAdSections job={job} />
        <VacancyRequirementsContent requirements={requirements} />
        {employer && <EmployerPresentation employer={employer} />}
      </div>
    </div>
  );
}
