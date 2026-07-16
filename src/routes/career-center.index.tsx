import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, BookOpen, Award, Info, Compass, Users, Building2 } from "lucide-react";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import {
  categories,
  professions,
  professionFamilies,
  filterProfessions,
  icon,
  L,
  type CategoryId,
} from "@/lib/career-center";
import { CareerHero } from "@/components/career-center/CareerHero";
import { ProfessionCard } from "@/components/career-center/ProfessionCard";
import { CategoryCard } from "@/components/career-center/CategoryCard";
import { CareerRoadmap } from "@/components/career-center/CareerRoadmap";
import { CareerSearch, type CareerSearchFilters } from "@/components/career-center/CareerSearch";

export const Route = createFileRoute("/career-center/")({
  head: () => ({
    meta: [
      { title: "Security Career Center — CQrityjob" },
      {
        name: "description",
        content:
          "Explore security professions, career paths, required competences, education and certifications — the knowledge hub for careers in the security industry.",
      },
      { property: "og:title", content: "Security Career Center — CQrityjob" },
      {
        property: "og:description",
        content:
          "Profession guides, career paths, skills and education across the security industry.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/career-center" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/career-center" }],
  }),
  component: CareerCenterIndex,
});

function CareerCenterIndex() {
  const { t, lang } = useT();
  const [filters, setFilters] = useState<CareerSearchFilters>({
    query: "",
    family: "all",
    category: "all",
    level: "all",
    regulated: "all",
    sector: "all",
    orientation: "all",
    region: "all",
  });

  const filtered = useMemo(
    () => filterProfessions(professions, filters, lang),
    [filters, lang],
  );

  const featured = professions.slice(0, 6);
  const roadmap = [
    lang === "sv" ? "Student" : "Student",
    lang === "sv" ? "Väktare" : "Security Officer",
    lang === "sv" ? "Gruppledare" : "Team Leader",
    lang === "sv" ? "Säkerhetschef" : "Security Manager",
    lang === "sv" ? "Head of Security" : "Head of Security",
  ];

  return (
    <>
      <CareerHero
        eyebrow={t("cc.hero.eyebrow")}
        title={t("cc.hero.title")}
        lead={t("cc.hero.lead")}
        actions={
          <>
            <PrimaryLink to="/security-career-assessment">
              {t("cc.hero.cta.assessment")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
            <a
              href="#browse"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {t("cc.hero.cta.browse")}
            </a>
          </>
        }
      />

      {/* Three entry paths */}
      <Section>
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("cc.paths.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("cc.paths.subtitle")}</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <EntryPathCard
            icon={<Compass className="h-5 w-5" strokeWidth={1.5} />}
            eyebrow={t("cc.paths.explore.eyebrow")}
            title={t("cc.paths.explore.title")}
            body={t("cc.paths.explore.body")}
            to="/career-center/start"
            ctaLabel={t("cta.learn_more")}
          />
          <EntryPathCard
            icon={<Users className="h-5 w-5" strokeWidth={1.5} />}
            eyebrow={t("cc.paths.professional.eyebrow")}
            title={t("cc.paths.professional.title")}
            body={t("cc.paths.professional.body")}
            to="/career-center#browse"
            ctaLabel={t("cc.hero.cta.browse")}
          />
          <EntryPathCard
            icon={<Building2 className="h-5 w-5" strokeWidth={1.5} />}
            eyebrow={t("cc.paths.employer.eyebrow")}
            title={t("cc.paths.employer.title")}
            body={t("cc.paths.employer.body")}
            to="/employers"
            ctaLabel={t("home.paths.orgs.cta")}
          />
        </div>
      </Section>

      {/* Featured professions */}
      <Section>
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("cc.featured.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("cc.featured.subtitle")}</p>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <ProfessionCard
              key={p.slug}
              slug={p.slug}
              title={lang === "sv" ? p.titleSv : p.titleEn}
              description={L(p.description, lang)}
              icon={icon(p.icon)}
              tag={p.status === "placeholder" ? t("cc.status.developing") : undefined}
            />
          ))}
        </div>
      </Section>

      {/* Categories */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("cc.categories.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("cc.categories.subtitle")}</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((c) => (
            <CategoryCard
              key={c.id}
              icon={icon(c.icon)}
              name={L(c.name, lang)}
              desc={L(c.desc, lang)}
              active={filters.category === c.id}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  category: f.category === c.id ? "all" : (c.id as CategoryId),
                }))
              }
            />
          ))}
        </div>
      </Section>

      {/* Search + Browse */}
      <div id="browse" />
      <Section bordered>
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("cc.search.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("cc.search.subtitle")}</p>
        </div>
        <div className="mt-8">
          <CareerSearch
            value={filters}
            onChange={setFilters}
          />
        </div>
        <div className="mt-8">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-8 text-sm text-muted-foreground">
              {t("cc.search.empty")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <ProfessionCard
                  key={p.slug}
                  slug={p.slug}
                  title={lang === "sv" ? p.titleSv : p.titleEn}
                  description={L(p.description, lang)}
                  icon={icon(p.icon)}
                  tag={p.status === "placeholder" ? t("cc.status.developing") : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Profession families */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("start.families.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("start.families.subtitle")}</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {professionFamilies
            .filter((f) => !f.isEntryPath)
            .map((f) => (
              <div key={f.id} className="rounded-lg border border-border bg-background p-5">
                <p className="text-sm font-semibold tracking-tight text-foreground">{L(f.name, lang)}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{L(f.description, lang)}</p>
              </div>
            ))}
        </div>
      </Section>

      {/* Pathways */}
      <Section bordered className="bg-muted/40">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("cc.pathways.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("cc.pathways.subtitle")}</p>
            <p className="mt-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("cc.pathways.example.title")}
            </p>
          </div>
          <div className="max-w-lg">
            <CareerRoadmap steps={roadmap} />
          </div>
        </div>
      </Section>

      {/* Education & Certifications */}
      <Section bordered>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-8">
            <BookOpen className="h-6 w-6 text-accent" strokeWidth={1.5} />
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              {t("cc.education.title")}
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">{t("cc.education.subtitle")}</p>
            <div className="mt-5 rounded-md border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              <Info className="mb-2 h-4 w-4 text-accent" strokeWidth={1.75} />
              {t("cc.education.placeholder")}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-8">
            <Award className="h-6 w-6 text-accent" strokeWidth={1.5} />
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              {t("cc.certs.title")}
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">{t("cc.certs.subtitle")}</p>
            <div className="mt-5 rounded-md border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              <Info className="mb-2 h-4 w-4 text-accent" strokeWidth={1.75} />
              {t("cc.certs.placeholder")}
            </div>
          </div>
        </div>
      </Section>

      {/* Assessment CTA */}
      <Section bordered className="bg-primary text-primary-foreground">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:items-center">
          <div className="md:col-span-2">
            <h2
              className="text-3xl font-semibold tracking-tight md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("cc.assessment.title")}
            </h2>
            <p className="mt-3 text-primary-foreground/80">{t("cc.assessment.body")}</p>
          </div>
          <div className="md:justify-self-end">
            <PrimaryLink
              to="/security-career-assessment"
              variant="ghost"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            >
              {t("cta.assessment")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
          </div>
        </div>
      </Section>

      {/* Articles placeholder */}
      <Section bordered>
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("cc.articles.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("cc.articles.subtitle")}</p>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-dashed border-border bg-background p-6 text-sm text-muted-foreground"
            >
              <Info className="mb-3 h-4 w-4 text-accent" strokeWidth={1.75} />
              {t("cc.articles.placeholder")}
            </div>
          ))}
        </div>
      </Section>

      {/* Featured jobs placeholder */}
      <Section bordered className="bg-muted/40">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("cc.jobs.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("cc.jobs.subtitle")}</p>
          </div>
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-foreground"
          >
            {t("cc.cta.jobs")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 rounded-lg border border-dashed border-border bg-background p-8 text-sm text-muted-foreground">
          <Info className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <p className="mt-3">{t("cc.jobs.placeholder")}</p>
        </div>
      </Section>
    </>
  );
}

function EntryPathCard({
  icon,
  eyebrow,
  title,
  body,
  to,
  ctaLabel,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  to: string;
  ctaLabel: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-lg border border-border bg-background p-6 transition-colors hover:bg-muted/40"
    >
      <span className="text-accent">{icon}</span>
      <p className="mt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent group-hover:text-foreground">
        {ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
