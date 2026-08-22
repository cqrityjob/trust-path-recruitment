import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Building2, Mail, Globe } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import {
  getPublicJobBySlug,
  listRelatedPublicJobs,
  isJobExpired,
  type PublicJobDetail,
  type PublicEmployer,
} from "@/lib/job-intelligence/public-queries";
import {
  getPublicJobBySlugSSR,
  type PublicJobSsrDetail,
} from "@/lib/job-intelligence/public-queries.functions";
import { buildJobPostingJsonLd, buildJobHeadMeta } from "@/lib/job-intelligence/seo";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";
import { getProfession } from "@/lib/career-center/professions";
import {
  JobAdHeading,
  JobAdSections,
  pickLocalized,
  formatJobDate as formatDate,
} from "@/components/jobs/JobAdContent";
import { Button } from "@/components/ui/button";
import { ExternalApplyDialog } from "@/components/jobs/ExternalApplyDialog";
import { ApplyInternalDialog } from "@/components/jobs/ApplyInternalDialog";
import { JobCard } from "@/components/jobs/JobCard";
import { JobRelevancePanel } from "@/components/jobs/JobRelevancePanel";
import { AssessmentInvite } from "@/components/jobs/AssessmentInvite";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";

function jobDetailQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["public-job-ssr", slug],
    queryFn: () => getPublicJobBySlugSSR({ data: { slug } }),
  });
}

export const Route = createFileRoute("/jobs/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(jobDetailQueryOptions(params.slug)),
  head: ({ params, loaderData }) => {
    const job = loaderData as PublicJobSsrDetail | null | undefined;
    return buildJobHeadMeta(params.slug, job ?? null);
  },
  component: JobDetailPage,
  errorComponent: ({ error }) => <ErrorState message={error.message} />,
  notFoundComponent: () => <NotFoundState />,
});

function JobDetailPage() {
  const { slug } = Route.useParams();
  const { t, lang } = useT();

  const ssr = useSuspenseQuery(jobDetailQueryOptions(slug));
  if (!ssr.data) throw notFound();

  // The existing UI depends on `PublicJobDetail` (browser-client shape).
  // The SSR fetch is a superset of it; cast is safe.
  const q = useQuery({
    queryKey: ["public-job", slug],
    queryFn: async () => {
      const job = await getPublicJobBySlug(slug);
      if (!job) throw notFound();
      return job;
    },
    initialData: ssr.data as unknown as PublicJobDetail,
  });

  const profileState = useCareerProfileForJobs();

  const related = useQuery({
    queryKey: ["public-job-related", q.data?.id, q.data?.profession_slug, q.data?.family_id],
    enabled: !!q.data,
    queryFn: () =>
      listRelatedPublicJobs({
        excludeId: q.data!.id,
        professionSlug: q.data!.profession_slug,
        familyId: q.data!.family_id,
      }),
  });

  // Client-side dynamic <title>: head() is static because this route
  // uses ssr: false and reads data via TanStack Query. Update
  // document.title once the job is loaded so tabs and history reflect it.
  const dynamicTitle = q.data
    ? `${pickLocalized(q.data.title_sv, q.data.title_en, lang) || "Security job"} — CQrityjob`
    : null;
  useEffect(() => {
    if (!dynamicTitle) return;
    const prev = document.title;
    document.title = dynamicTitle;
    return () => {
      document.title = prev;
    };
  }, [dynamicTitle]);

  if (q.isLoading) {
    return (
      <SiteLayout>
        <Section>
          <p className="text-sm text-muted-foreground">{t("jobs.results.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  if (!q.data) return <NotFoundState />;

  const job = q.data;
  const area = job.family_id ? getCareerAreaLabel(job.family_id) : undefined;
  const profession = job.profession_slug ? getProfession(job.profession_slug) : undefined;
  const expired = isJobExpired(job);
  const employer = job.employer ?? null;
  const employerDesc = employer
    ? pickLocalized(employer.description_sv, employer.description_en, lang)
    : "";

  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>

        <div className="mt-4">
          <JobAdHeading job={job} employerName={employer?.name ?? null} expired={expired} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="min-w-0 space-y-8">
            <JobAdSections job={job} />

            {employer && (employer.name || employerDesc || employer.website) && (
              <EmployerCard employer={employer} description={employerDesc} />
            )}

            {(area || profession) && (
              <CareerContext
                familyId={area?.id ?? null}
                familyName={area ? area.name[lang] : null}
                professionSlug={profession?.slug ?? null}
                professionName={
                  profession ? (lang === "sv" ? profession.titleSv : profession.titleEn) : null
                }
              />
            )}

            <RelatedJobs loading={related.isLoading} rows={related.data ?? []} lang={lang} />
          </article>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <ApplySidebar job={job} expired={expired} />
            {profileState.status === "ready" && (
              <JobRelevancePanel job={job} profile={profileState.data.profile} />
            )}
            {(profileState.status === "anonymous" || profileState.status === "no_profile") && (
              <AssessmentInvite variant="sidebar" />
            )}
          </aside>
        </div>
      </Section>
    </SiteLayout>
  );
}

function ApplySidebar({ job, expired }: { job: PublicJobDetail; expired: boolean }) {
  const { t, lang } = useT();

  const applyBlock = () => {
    if (expired) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">{t("jobs.detail.expired.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("jobs.detail.expired.body")}</p>
        </div>
      );
    }
    if (job.application_method === "internal") {
      return (
        <ApplyInternalDialog
          jobId={job.id}
          employerName={job.employer?.name ?? null}
          label={t("jobs.detail.apply_internal")}
        />
      );
    }
    if (job.application_method === "external" && job.application_url) {
      return (
        <ExternalApplyDialog
          url={job.application_url}
          employerName={job.employer?.name ?? null}
          label={t("jobs.detail.apply_external")}
        />
      );
    }
    if (job.application_method === "email" && job.application_email) {
      return (
        <Button asChild className="w-full">
          <a href={`mailto:${job.application_email}`}>
            {t("jobs.detail.apply_email")}
            <Mail className="ml-2 h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
      );
    }
    return <p className="text-sm text-muted-foreground">{t("jobs.detail.apply_unavailable")}</p>;
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-5">
      {applyBlock()}

      {job.deadline_at && (
        <div className="border-t border-border pt-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("jobs.detail.deadline")}
          </p>
          <p className="mt-1 font-medium">{formatDate(job.deadline_at, lang)}</p>
        </div>
      )}

      {job.published_at && (
        <div className="text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("jobs.detail.published")}
          </p>
          <p className="mt-1 font-medium">{formatDate(job.published_at, lang)}</p>
        </div>
      )}
    </div>
  );
}

function EmployerCard({
  employer,
  description,
}: {
  employer: PublicEmployer;
  description: string;
}) {
  const { t } = useT();
  let host = "";
  if (employer.website) {
    try {
      host = new URL(employer.website).host;
    } catch {
      host = employer.website;
    }
  }
  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-xl font-semibold">{t("jobs.detail.employer.title")}</h2>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {employer.logo_url ? (
            <img
              src={employer.logo_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md border border-border bg-white object-contain"
              loading="lazy"
            />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{employer.name}</p>
            {employer.country && (
              <p className="mt-0.5 text-xs text-muted-foreground">{employer.country}</p>
            )}
          </div>
        </div>
      </div>
      {description && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground">
          {description}
        </p>
      )}
      {employer.website && (
        <a
          href={employer.website}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          {host || t("jobs.detail.employer.website")}
        </a>
      )}
    </section>
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
      {professionSlug && (
        <div className="mt-4 border-t border-border pt-4">
          <Link
            to="/career-center/$profession"
            params={{ profession: professionSlug }}
            className="text-sm text-primary hover:underline"
          >
            {t("jobs.detail.career.explore")}
          </Link>
        </div>
      )}
    </section>
  );
}

function RelatedJobs({
  loading,
  rows,
  lang,
}: {
  loading: boolean;
  rows: Array<import("@/lib/job-intelligence/public-queries").PublicJobCard>;
  lang: "sv" | "en";
}) {
  const { t } = useT();
  if (!loading && rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold">{t("jobs.detail.related.title")}</h2>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("jobs.results.loading")}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <JobCard key={r.id} job={r} lang={lang} />
          ))}
        </div>
      )}
    </section>
  );
}

function NotFoundState() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("jobs.detail.not_found.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("jobs.detail.not_found.body")}</p>
      </Section>
    </SiteLayout>
  );
}

function ErrorState({ message }: { message: string }) {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("jobs.results.error.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </Section>
    </SiteLayout>
  );
}
