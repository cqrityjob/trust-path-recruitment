// One candidate presentation for the desktop reader and the direct/mobile route.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  getPublicVacancyStructure,
  isJobExpired,
  listRelatedPublicJobs,
  listPublicJobs,
  type PublicJobDetail,
} from "@/lib/job-intelligence/public-queries";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";
import {
  professionInfoDestination,
  resolveProfessionRef,
} from "@/lib/career-center/profession-links";
import { jobAdReturnPath } from "@/lib/job-intelligence/job-search";
import { JobAdHeading, JobAdSections } from "./JobAdContent";
import { EmployerPresentation } from "./EmployerPresentation";
import { JobApplicationPanel } from "./JobApplicationPanel";
import { JobCard } from "./JobCard";
import { VacancyRequirementsContent } from "./VacancyRequirementsContent";

export function JobDetailContent({
  job,
  from,
  embedded = false,
}: {
  job: PublicJobDetail;
  from?: string;
  embedded?: boolean;
}) {
  const { lang } = useT();
  const expired = isJobExpired(job);
  const profession = resolveProfessionRef(job.profession_slug)?.profession;
  // About the profession uses its canonical family, not an independently
  // selected advert category. Never infer an occupation from the job title.
  const area = getCareerAreaLabel(profession?.family ?? job.family_id);
  const related = useQuery({
    queryKey: ["public-job-related", job.id, job.profession_slug, job.family_id],
    queryFn: () =>
      listRelatedPublicJobs({
        excludeId: job.id,
        professionSlug: job.profession_slug,
        familyId: job.family_id,
      }),
  });
  const employerJobs = useQuery({
    queryKey: ["public-employer-jobs", job.employer_id],
    queryFn: () => listPublicJobs({ employerId: job.employer_id, limit: 5 }),
    enabled: !!job.employer_id,
  });
  return (
    <div className="space-y-8">
      <article
        className={`min-w-0 wrap-break-word bg-card ${embedded ? "" : "rounded-2xl border border-border"}`}
        data-job-detail={job.slug}
      >
        <div className="p-5 sm:p-8">
          {embedded && (
            <Link
              to="/jobs/$slug"
              params={{ slug: job.slug }}
              search={from ? { from } : {}}
              className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {lang === "sv" ? "Öppna annonsen på egen sida" : "Open job on its own page"}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          <JobAdHeading
            job={job}
            employerName={job.employer?.name}
            employerLogoUrl={job.employer?.logo_url}
            expired={expired}
            headingLevel={embedded ? "h2" : "h1"}
          />
        </div>
        <div
          id={`apply-${job.id}`}
          tabIndex={-1}
          className={`z-10 border-y border-border bg-card px-5 py-4 sm:px-8 lg:sticky ${embedded ? "lg:top-0" : "lg:top-20"}`}
        >
          <JobApplicationPanel
            job={job}
            expired={expired}
            returnTo={jobAdReturnPath(job.slug, from)}
          />
        </div>
        <div className="space-y-8 p-5 sm:p-8 [&_p]:wrap-break-word">
          <JobAdSections job={job} />
          <VacancyRequirements jobId={job.id} />
          {job.employer && (
            <EmployerPresentation
              employer={job.employer}
              jobs={(employerJobs.data ?? []).filter((row) => row.id !== job.id).slice(0, 3)}
              from={from}
            />
          )}
          {(area || profession) && (
            <CareerContext
              familyId={area?.id ?? null}
              familyName={area?.name[lang] ?? null}
              professionSlug={profession ? job.profession_slug : null}
              professionName={
                profession ? (lang === "sv" ? profession.titleSv : profession.titleEn) : null
              }
            />
          )}
          {!expired && (
            <a
              href={`#apply-${job.id}`}
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
            >
              {lang === "sv" ? "Till ansökan" : "Go to application"}
            </a>
          )}
        </div>
      </article>
      <RelatedJobs loading={related.isLoading} rows={related.data ?? []} lang={lang} from={from} />
    </div>
  );
}

function CareerContext({
  familyId,
  familyName,
  professionSlug,
  professionName,
}: {
  familyId: string | null;
  familyName: string | null;
  professionSlug: string | null;
  professionName: string | null;
}) {
  const { t } = useT();
  const destination = professionInfoDestination({ cigSlug: professionSlug });
  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-xl font-semibold">{t("jobs.detail.career.title")}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {familyId && familyName && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("jobs.detail.career.family")}
            </dt>
            <dd className="mt-1">
              <Link
                to="/jobs/family/$familyId"
                params={{ familyId }}
                className="font-medium text-primary hover:underline"
              >
                {familyName}
              </Link>
            </dd>
          </div>
        )}
        {professionSlug && professionName && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("jobs.detail.career.profession")}
            </dt>
            <dd className="mt-1">
              <Link
                to="/jobs/profession/$professionSlug"
                params={{ professionSlug }}
                className="font-medium text-primary hover:underline"
              >
                {professionName}
              </Link>
            </dd>
          </div>
        )}
      </dl>
      {destination.kind !== "none" && (
        <div className="mt-4 border-t border-border pt-4">
          <a href={destination.href} className="text-sm text-primary hover:underline">
            {t("jobs.detail.career.explore")}
          </a>
        </div>
      )}
    </section>
  );
}

function RelatedJobs({
  loading,
  rows,
  lang,
  from,
}: {
  loading: boolean;
  rows: Array<import("@/lib/job-intelligence/public-queries").PublicJobCard>;
  lang: "sv" | "en";
  /** Handed on, so a hop to a related ad keeps the way back to the results. */
  from: string | undefined;
}) {
  const { t } = useT();
  if (!loading && rows.length === 0) return null;
  return (
    <section
      aria-label={t("jobs.detail.related.title")}
      className="border-t-2 border-border bg-muted/40 p-5 sm:p-8"
    >
      <h2 className="text-xl font-semibold">{t("jobs.detail.related.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {lang === "sv"
          ? "Andra annonser som kan vara intressanta för dig."
          : "Other job adverts you may be interested in."}
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("jobs.results.loading")}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((r) => (
            <JobCard key={r.id} job={r} lang={lang} from={from} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The vacancy's own requirements, mandatory and desirable, as the employer
 *  listed them. Read through the public RLS: shown for a live advertisement,
 *  and a failed read hides the section rather than claiming there are none. */
function VacancyRequirements({ jobId }: { jobId: string }) {
  const q = useQuery({
    queryKey: ["public", "vacancy-structure", jobId],
    queryFn: () => getPublicVacancyStructure(jobId),
  });
  return <VacancyRequirementsContent requirements={q.data?.requirements ?? []} />;
}
