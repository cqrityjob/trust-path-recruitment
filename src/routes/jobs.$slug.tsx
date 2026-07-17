import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Building2, Calendar, ExternalLink, Mail } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { getPublicJobBySlug } from "@/lib/job-intelligence/public-queries";
import { getFamily } from "@/lib/career-center/profession-families";
import { getProfession } from "@/lib/career-center/professions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/jobs/$slug")({
  ssr: false,
  component: JobDetailPage,
  errorComponent: ({ error }) => <ErrorState message={error.message} />,
  notFoundComponent: () => <NotFoundState />,
});

function pickLocalized(sv: string | null, en: string | null, lang: "sv" | "en"): string {
  const primary = lang === "sv" ? sv : en;
  const fallback = lang === "sv" ? en : sv;
  return primary || fallback || "";
}

function JobDetailPage() {
  const { slug } = Route.useParams();
  const { t, lang } = useT();

  const q = useQuery({
    queryKey: ["public-job", slug],
    queryFn: async () => {
      const job = await getPublicJobBySlug(slug);
      if (!job) throw notFound();
      return job;
    },
  });

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
  const title =
    pickLocalized(job.title_sv, job.title_en, lang) || t("jobs.card.untitled");
  const description = pickLocalized(job.description_sv, job.description_en, lang);
  const family = job.family_id ? getFamily(job.family_id) : undefined;
  const profession = job.profession_slug ? getProfession(job.profession_slug) : undefined;
  const location = [job.location_text, job.city, job.region, job.country]
    .filter(Boolean)
    .join(", ");

  const renderList = (raw: unknown) => {
    if (!Array.isArray(raw)) return null;
    const items = raw.filter((x) => typeof x === "string" && x.trim());
    if (items.length === 0) return null;
    return (
      <ul className="mt-3 list-disc space-y-1 pl-5 text-foreground">
        {items.map((item, i) => (
          <li key={i}>{item as string}</li>
        ))}
      </ul>
    );
  };

  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>

        <header className="mt-4">
          <h1
            className="text-3xl font-semibold tracking-tight md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {job.employer?.name && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                {job.employer.name}
              </span>
            )}
            {location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {location}
              </span>
            )}
            {job.published_at && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                {t("jobs.detail.published")}:{" "}
                {new Date(job.published_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {job.employment_type && (
              <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                {job.employment_type.replace("_", " ")}
              </span>
            )}
            {job.workplace_type && (
              <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                {job.workplace_type}
              </span>
            )}
            {job.experience_level && (
              <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                {job.experience_level}
              </span>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <article className="min-w-0">
            {description && (
              <p className="whitespace-pre-line leading-relaxed text-foreground">
                {description}
              </p>
            )}

            {renderList(job.responsibilities) && (
              <section className="mt-8">
                <h2 className="text-xl font-semibold">
                  {t("jobs.detail.responsibilities")}
                </h2>
                {renderList(job.responsibilities)}
              </section>
            )}
            {renderList(job.requirements) && (
              <section className="mt-8">
                <h2 className="text-xl font-semibold">
                  {t("jobs.detail.requirements")}
                </h2>
                {renderList(job.requirements)}
              </section>
            )}
            {renderList(job.benefits) && (
              <section className="mt-8">
                <h2 className="text-xl font-semibold">{t("jobs.detail.benefits")}</h2>
                {renderList(job.benefits)}
              </section>
            )}
          </article>

          <aside className="space-y-4 rounded-lg border border-border bg-background p-5">
            {job.application_method === "external" && job.application_url && (
              <Button asChild className="w-full">
                <a
                  href={job.application_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {t("jobs.detail.apply_external")}
                  <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            )}
            {job.application_method === "email" && job.application_email && (
              <Button asChild className="w-full">
                <a href={`mailto:${job.application_email}`}>
                  {t("jobs.detail.apply_email")}
                  <Mail className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            )}
            {(job.application_method === "unavailable" ||
              (job.application_method === "external" && !job.application_url) ||
              (job.application_method === "email" && !job.application_email)) && (
              <p className="text-sm text-muted-foreground">
                {t("jobs.detail.apply_unavailable")}
              </p>
            )}

            {job.deadline_at && (
              <div className="border-t border-border pt-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("jobs.detail.deadline")}
                </p>
                <p className="mt-1 font-medium">
                  {new Date(job.deadline_at).toLocaleDateString(
                    lang === "sv" ? "sv-SE" : "en-GB",
                  )}
                </p>
              </div>
            )}

            {family && (
              <div className="border-t border-border pt-3 text-sm">
                <Link
                  to="/jobs/family/$familyId"
                  params={{ familyId: family.id }}
                  className="text-primary hover:underline"
                >
                  {family.name[lang]} →
                </Link>
              </div>
            )}
            {profession && (
              <div className="text-sm">
                <Link
                  to="/jobs/profession/$professionSlug"
                  params={{ professionSlug: profession.slug }}
                  className="text-primary hover:underline"
                >
                  {lang === "sv" ? profession.titleSv : profession.titleEn} →
                </Link>
              </div>
            )}
          </aside>
        </div>
      </Section>
    </SiteLayout>
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
        <h1 className="mt-4 text-2xl font-semibold">
          {t("jobs.detail.not_found.title")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("jobs.detail.not_found.body")}
        </p>
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
        <h1 className="mt-4 text-2xl font-semibold">
          {t("jobs.results.error.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </Section>
    </SiteLayout>
  );
}