import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { getFamily, professionFamilies } from "@/lib/career-center/profession-families";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { JobResults } from "@/components/jobs/JobResults";

export const Route = createFileRoute("/jobs/family/$familyId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!professionFamilies.some((f) => f.id === params.familyId)) {
      throw notFound();
    }
  },
  component: JobsByFamily,
  notFoundComponent: FamilyNotFound,
});

function JobsByFamily() {
  const { familyId } = Route.useParams();
  const { t, lang } = useT();
  const family = getFamily(familyId)!;

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
          {t("jobs.family.header").replace("{family}", family.name[lang])}
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {family.description[lang]}
        </p>
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