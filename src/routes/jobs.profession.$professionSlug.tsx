import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { resolveProfessionRef } from "@/lib/career-center/profession-links";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { JobResults } from "@/components/jobs/JobResults";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";

export const Route = createFileRoute("/jobs/profession/$professionSlug")({
  ssr: false,
  head: ({ params }) => {
    // The route param is a CIG slug: `jobs.profession_slug` is a foreign key
    // onto `cig_professions.slug`. Resolving it through the Career Center's
    // own `getProfession` matched only the four slugs that happen to be
    // spelled the same in both namespaces, and printed the raw slug —
    // "vaktare", "sakerhetschef" — as the page title for the rest.
    const profession = resolveProfessionRef(params.professionSlug)?.profession;
    const url = `https://trust-path-recruitment.lovable.app/jobs/profession/${params.professionSlug}`;
    const name = profession ? profession.titleEn : params.professionSlug;
    const title = `${name} jobs — CQrityjob`;
    const desc = `Active openings for ${name} in the security industry.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: JobsByProfession,
});

function JobsByProfession() {
  const { professionSlug } = Route.useParams();
  const { t, lang } = useT();
  const profession = resolveProfessionRef(professionSlug)?.profession;
  const profileState = useCareerProfileForJobs();
  const profile = profileState.status === "ready" ? profileState.data.profile : undefined;

  const q = useQuery({
    queryKey: ["public-jobs", "profession", professionSlug],
    queryFn: () => listPublicJobs({ professionSlug }),
  });

  const displayName = profession
    ? lang === "sv"
      ? profession.titleSv
      : profession.titleEn
    : professionSlug;

  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>
        <h1
          className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("jobs.profession.header").replace("{profession}", displayName)}
        </h1>
        {profession && (
          <Link
            to="/career-center/$profession"
            params={{ profession: profession.slug }}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            {t("jobs.detail.career.explore")}
          </Link>
        )}
        <JobResults
          jobs={q.data}
          isLoading={q.isLoading}
          isError={q.isError}
          lang={lang}
          profile={profile}
        />
      </Section>
    </SiteLayout>
  );
}
