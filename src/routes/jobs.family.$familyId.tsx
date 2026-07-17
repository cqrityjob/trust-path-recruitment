import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { getCareerAreaLabel, careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { JobResults } from "@/components/jobs/JobResults";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";

export const Route = createFileRoute("/jobs/family/$familyId")({
  ssr: false,
  head: ({ params }) => {
    const area = careerAreaLabels.find((f) => f.id === params.familyId);
    const url = `https://trust-path-recruitment.lovable.app/jobs/family/${params.familyId}`;
    const title = area
      ? `${area.name.en} jobs — CQrityjob`
      : "Security jobs by career area — CQrityjob";
    const desc = area
      ? area.description.en
      : "Active security roles filtered by career area.";
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
  beforeLoad: ({ params }) => {
    if (!careerAreaLabels.some((f) => f.id === params.familyId)) {
      throw notFound();
    }
  },
  component: JobsByFamily,
  notFoundComponent: FamilyNotFound,
});

function JobsByFamily() {
  const { familyId } = Route.useParams();
  const { t, lang } = useT();
  const area = getCareerAreaLabel(familyId)!;
  const profileState = useCareerProfileForJobs();
  const profile =
    profileState.status === "ready" ? profileState.data.profile : undefined;

  const q = useQuery({
    queryKey: ["public-jobs", "family", familyId],
    queryFn: () => listPublicJobs({ familyId }),
  });

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
          {t("jobs.family.header").replace("{family}", area.name[lang])}
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {area.description[lang]}
        </p>
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

function FamilyNotFound() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("jobs.results.empty.title")}</h1>
      </Section>
    </SiteLayout>
  );
}