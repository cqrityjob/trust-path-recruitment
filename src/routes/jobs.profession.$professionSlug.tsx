import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { getProfession } from "@/lib/career-center/professions";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { JobResults } from "@/components/jobs/JobResults";

export const Route = createFileRoute("/jobs/profession/$professionSlug")({
  ssr: false,
  component: JobsByProfession,
});

function JobsByProfession() {
  const { professionSlug } = Route.useParams();
  const { t, lang } = useT();
  const profession = getProfession(professionSlug);

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
        />
      </Section>
    </SiteLayout>
  );
}