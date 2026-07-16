import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  TrendingUp,
  Briefcase,
  ShieldCheck,
  Users,
  Building2,
  Check,
  ClipboardCheck,
  BarChart3,
  Info,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { professions } from "@/lib/professions";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CQrityjob — Build your future in security." },
      {
        name: "description",
        content:
          "The career, recruitment and assessment platform for the security industry. Discover roles, measure competence, develop professionally and connect with serious employers.",
      },
      { property: "og:title", content: "CQrityjob — Build your future in security." },
      {
        property: "og:description",
        content:
          "Career discovery, professional development, recruitment and assessment — built exclusively for the security industry.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CQrityjob",
          slogan: "Where trust comes first.",
          description:
            "The career, recruitment and assessment platform for the security industry.",
          url: "https://www.cqrityjob.com",
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useT();

  const pillars = [
    {
      icon: Compass,
      title: t("home.pillar.discover.title"),
      desc: t("home.pillar.discover.desc"),
    },
    {
      icon: TrendingUp,
      title: t("home.pillar.develop.title"),
      desc: t("home.pillar.develop.desc"),
    },
    {
      icon: Briefcase,
      title: t("home.pillar.hired.title"),
      desc: t("home.pillar.hired.desc"),
    },
  ];

  const individuals = [
    t("home.paths.individuals.item1"),
    t("home.paths.individuals.item2"),
    t("home.paths.individuals.item3"),
    t("home.paths.individuals.item4"),
  ];
  const orgs = [
    t("home.paths.orgs.item1"),
    t("home.paths.orgs.item2"),
    t("home.paths.orgs.item3"),
    t("home.paths.orgs.item4"),
  ];

  const assessmentPoints: TranslationKey[] = [
    "home.assessment.point.free",
    "home.assessment.point.time",
    "home.assessment.point.matches",
    "home.assessment.point.next",
    "home.assessment.point.guidance",
  ];

  const employerItems = [
    {
      icon: Users,
      title: t("home.employers.item.recruit.title"),
      desc: t("home.employers.item.recruit.desc"),
    },
    {
      icon: ClipboardCheck,
      title: t("home.employers.item.assess.title"),
      desc: t("home.employers.item.assess.desc"),
    },
    {
      icon: TrendingUp,
      title: t("home.employers.item.develop.title"),
      desc: t("home.employers.item.develop.desc"),
    },
    {
      icon: ShieldCheck,
      title: t("home.employers.item.verify.title"),
      desc: t("home.employers.item.verify.desc"),
    },
  ];

  const platformPoints: TranslationKey[] = [
    "home.platform.point1",
    "home.platform.point2",
    "home.platform.point3",
    "home.platform.point4",
  ];

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(600px 300px at 15% 0%, oklch(0.55 0.09 245 / 0.18), transparent 60%), radial-gradient(500px 250px at 90% 10%, oklch(0.24 0.07 265 / 0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-20 md:px-8 md:pb-32 md:pt-28">
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              {t("home.hero.eyebrow")}
            </div>
            <h1
              className="mt-6 text-5xl font-semibold tracking-tight text-foreground md:text-7xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.hero.title")}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("home.hero.subtitle")}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <PrimaryLink to="/assessment">
                {t("cta.assessment")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </PrimaryLink>
              <PrimaryLink to="/careers" variant="ghost">
                {t("cta.careers")}
              </PrimaryLink>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">{t("home.hero.note")}</p>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <Section>
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("home.pillars.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("home.pillars.subtitle")}</p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {pillars.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-background p-8">
              <Icon className="h-6 w-6 text-accent" strokeWidth={1.5} />
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Two paths */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("home.paths.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("home.paths.subtitle")}</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          <PathCard
            label={t("home.paths.individuals.label")}
            title={t("home.paths.individuals.title")}
            items={individuals}
            ctaLabel={t("home.paths.individuals.cta")}
            to="/careers"
          />
          <PathCard
            label={t("home.paths.orgs.label")}
            title={t("home.paths.orgs.title")}
            items={orgs}
            ctaLabel={t("home.paths.orgs.cta")}
            to="/employers"
          />
        </div>
      </Section>

      {/* Featured careers */}
      <Section bordered>
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("home.careers.eyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("home.careers.title")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("home.careers.subtitle")}</p>
          </div>
          <Link
            to="/careers"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-foreground"
          >
            {t("home.careers.cta")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {professions.map((p) => (
            <Link
              key={p.id}
              to="/careers"
              className="group flex flex-col gap-4 bg-background p-6 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between">
                <p.icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {t(p.titleKey as TranslationKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(p.descKey as TranslationKey)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Assessment feature */}
      <Section bordered>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:items-start">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-accent">
              {t("home.assessment.eyebrow")}
            </p>
            <h2
              className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.assessment.title")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("home.assessment.subtitle")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <PrimaryLink to="/assessment">
                {t("home.assessment.cta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </PrimaryLink>
              <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("status.in_development")}
              </span>
            </div>
            <p className="mt-6 max-w-md text-xs text-muted-foreground">
              {t("home.assessment.note")}
            </p>
          </div>
          <ul className="rounded-lg border border-border bg-background p-2">
            {assessmentPoints.map((k) => (
              <li
                key={k}
                className="flex items-start gap-3 border-b border-border/60 px-4 py-4 text-sm text-foreground last:border-b-0"
              >
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={2} />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Employers */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("home.employers.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("home.employers.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("home.employers.subtitle")}</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {employerItems.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-background p-6">
              <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
              <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <PrimaryLink to="/employers">
            {t("home.employers.cta")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PrimaryLink>
        </div>
      </Section>

      {/* Assessment platform (future capability) */}
      <Section bordered className="bg-primary text-primary-foreground">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-5 md:items-start">
          <div className="md:col-span-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/[0.06] px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-primary-foreground/80">
              <BarChart3 className="h-3.5 w-3.5" strokeWidth={2} />
              {t("home.platform.eyebrow")}
            </div>
            <h2
              className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.platform.title")}
            </h2>
            <p className="mt-4 text-primary-foreground/70">{t("home.platform.subtitle")}</p>
            <ul className="mt-8 space-y-3 text-sm text-primary-foreground/90">
              {platformPoints.map((k) => (
                <li key={k} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-foreground" strokeWidth={2} />
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-2">
            <div className="rounded-lg border border-primary-foreground/20 bg-primary-foreground/[0.04] p-6">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-foreground/80" strokeWidth={1.75} />
                <p className="text-sm leading-relaxed text-primary-foreground/85">
                  {t("home.platform.disclaimer")}
                </p>
              </div>
              <div className="mt-6">
                <PrimaryLink
                  to="/contact"
                  variant="ghost"
                  className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                >
                  {t("cta.talk")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </PrimaryLink>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}

function PathCard({
  label,
  title,
  items,
  ctaLabel,
  to,
}: {
  label: string;
  title: string;
  items: readonly string[];
  ctaLabel: string;
  to: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-background p-8">
      <p className="text-xs font-medium uppercase tracking-widest text-accent">{label}</p>
      <h3
        className="mt-3 text-2xl font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <ul className="mt-6 space-y-2.5">
        {items.map((i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={2} />
            <span>{i}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Link
          to={to}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
