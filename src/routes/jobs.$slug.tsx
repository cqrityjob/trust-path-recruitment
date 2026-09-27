import { requestJobListRestore } from "@/lib/job-intelligence/job-list-position";
import { createFileRoute, Link, notFound, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { getPublicJobBySlug, type PublicJobDetail } from "@/lib/job-intelligence/public-queries";
import {
  getPublicJobBySlugSSR,
  type PublicJobSsrDetail,
} from "@/lib/job-intelligence/public-queries.functions";
import { buildJobHeadMeta } from "@/lib/job-intelligence/seo";
import { pickLocalized } from "@/components/jobs/JobAdContent";
import { JobDetailContent } from "@/components/jobs/JobDetailContent";
import {
  jobSearchFromFrom,
  jobSearchToFrom,
  validateJobAdSearch,
} from "@/lib/job-intelligence/job-search";

function jobDetailQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["public-job-ssr", slug],
    queryFn: () => getPublicJobBySlugSSR({ data: { slug } }),
  });
}

export const Route = createFileRoute("/jobs/$slug")({
  // `from`: the /jobs search this ad was opened from, normalised through the
  // /jobs validator on arrival (job-search.ts). Nothing else is accepted.
  validateSearch: validateJobAdSearch,
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(jobDetailQueryOptions(params.slug)),
  head: ({ params, loaderData }) => {
    const job = loaderData as PublicJobSsrDetail | null | undefined;
    return buildJobHeadMeta(params.slug, job ?? null);
  },
  component: JobDetailPage,
  errorComponent: () => <ErrorState />,
  notFoundComponent: () => <NotFoundState />,
});

function JobDetailPage() {
  const { slug } = Route.useParams();
  const { from } = Route.useSearch();
  const { t, lang } = useT();

  const ssr = useSuspenseQuery(jobDetailQueryOptions(slug));
  if (!ssr.data) throw notFound();

  // The existing UI depends on `PublicJobDetail` (browser-client shape).
  // The SSR fetch is a superset of it; cast is safe.
  const q = useQuery({
    queryKey: ["public-job", slug],
    queryFn: () => getPublicJobBySlug(slug),
    initialData: ssr.data as unknown as PublicJobDetail,
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
  if (q.isError) return <ErrorState />;
  if (!q.data) return <NotFoundState />;

  return (
    <SiteLayout>
      <Section className="bg-muted/25 py-5 md:py-8" containerClassName="max-w-[960px]">
        <div className="mb-3">
          <BackToResults />
        </div>
        <JobDetailContent job={q.data} from={from} />
      </Section>
    </SiteLayout>
  );
}

/** "Tillbaka till sökresultatet": the /jobs search this ad was opened from,
 *  rebuilt from its validated `from`. Never history.back(), which returns to
 *  whatever came before -- another site, a related ad, the login page after
 *  signing in -- and to nothing at all on a direct entry. Without a search,
 *  plain /jobs, labelled as such.
 *
 *  Read with `strict: false` so the not-found and error states can use it
 *  too; the value is re-validated here either way. */
function BackToResults() {
  const { t } = useT();
  const search = jobSearchFromFrom((useSearch({ strict: false }) as { from?: unknown }).from);
  const toResults = Object.keys(search).length > 0;
  return (
    <Link
      to="/jobs"
      search={search}
      onClick={() => requestJobListRestore(jobSearchToFrom(search))}
      resetScroll={false}
      data-job-back={toResults ? "results" : "all"}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {t(toResults ? "jobs.detail.backToResults" : "jobs.detail.back")}
    </Link>
  );
}

function NotFoundState() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <BackToResults />
        <h1 className="mt-4 text-2xl font-semibold">{t("jobs.detail.not_found.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("jobs.detail.not_found.body")}</p>
      </Section>
    </SiteLayout>
  );
}

/** A read that failed says so in words (MVP text specification §13), not
 *  with the raw error text the query happened to carry. */
function ErrorState() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <BackToResults />
        <h1 className="mt-4 text-2xl font-semibold">{t("jobs.detail.error.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("jobs.results.error.body")}</p>
      </Section>
    </SiteLayout>
  );
}
