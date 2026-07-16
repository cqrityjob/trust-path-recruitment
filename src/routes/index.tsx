import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, GaugeCircle, Globe2, Check } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CQrityjob — Where trust comes first." },
      {
        name: "description",
        content:
          "The modern recruitment, verification and assessment platform built exclusively for the security industry.",
      },
      { property: "og:title", content: "CQrityjob — Where trust comes first." },
      {
        property: "og:description",
        content:
          "Recruit, verify and assess security professionals on a platform designed for the security industry.",
      },
      { property: "og:url", content: "/" },
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
            "Recruitment, verification and assessment platform built exclusively for the security industry.",
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
      icon: ShieldCheck,
      title: t("home.pillar.trust.title"),
      desc: t("home.pillar.trust.desc"),
    },
    {
      icon: GaugeCircle,
      title: t("home.pillar.quality.title"),
      desc: t("home.pillar.quality.desc"),
    },
    {
      icon: Globe2,
      title: t("home.pillar.scale.title"),
      desc: t("home.pillar.scale.desc"),
    },
  ];

  const segments = [
    t("home.segments.security"),
    t("home.segments.gov"),
    t("home.segments.infra"),
    t("home.segments.data"),
    t("home.segments.corp"),
  ];

  const capabilities: { key: string; status: "available" | "soon" }[] = [
    { key: "cap.recruitment", status: "available" },
    { key: "cap.jobboard", status: "soon" },
    { key: "cap.interim", status: "soon" },
    { key: "cap.employer", status: "soon" },
    { key: "cap.candidate", status: "soon" },
    { key: "cap.assessment", status: "soon" },
    { key: "cap.ai", status: "soon" },
    { key: "cap.verify", status: "available" },
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
              {t("home.eyebrow")}
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
              <PrimaryLink to="/contact">
                {t("cta.primary")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </PrimaryLink>
              <PrimaryLink to="/services" variant="ghost">
                {t("cta.secondary")}
              </PrimaryLink>
            </div>
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

      {/* Segments */}
      <Section bordered className="bg-muted/40">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("home.segments.title")}
        </h2>
        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {segments.map((s) => (
            <li
              key={s}
              className="rounded-md border border-border bg-background px-4 py-4 text-sm font-medium text-foreground"
            >
              {s}
            </li>
          ))}
        </ul>
      </Section>

      {/* Capabilities */}
      <Section bordered>
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("home.capabilities.title")}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t("home.capabilities.subtitle")}
            </p>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
          {capabilities.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between rounded-md border border-border bg-background px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <Check className="h-4 w-4 text-accent" strokeWidth={2} />
                <span className="text-sm font-medium text-foreground">
                  {t(c.key as any)}
                </span>
              </div>
              <span
                className={
                  "text-[11px] font-medium uppercase tracking-wider " +
                  (c.status === "available"
                    ? "text-accent"
                    : "text-muted-foreground")
                }
              >
                {c.status === "available"
                  ? t("cap.status.available")
                  : t("cap.status.soon")}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section bordered className="bg-primary text-primary-foreground">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {t("home.cta.title")}
            </h2>
            <p className="mt-3 text-primary-foreground/70">{t("home.cta.subtitle")}</p>
          </div>
          <PrimaryLink
            to="/contact"
            variant="ghost"
            className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
          >
            {t("cta.contact")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PrimaryLink>
        </div>
      </Section>
    </SiteLayout>
  );
}
