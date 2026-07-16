import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { professions } from "@/lib/professions";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/careers")({
  head: () => ({
    meta: [
      { title: "Security Careers — CQrityjob" },
      {
        name: "description",
        content:
          "Explore careers in security — from operational roles to specialist and leadership tracks. Discover pathways, competence requirements and your next step.",
      },
      { property: "og:title", content: "Security Careers — CQrityjob" },
      {
        property: "og:description",
        content:
          "Career paths across the security industry: profession guides, competence requirements and next steps.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/careers" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/careers" }],
  }),
  component: CareersPage,
});

function CareersPage() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("careers.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("careers.lead")}
          </p>
          <div className="mt-8">
            <PrimaryLink to="/assessment">
              {t("cta.assessment")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
          </div>
        </div>
      </Section>
      <Section bordered>
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("careers.professions.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("careers.professions.subtitle")}</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {professions.map((p) => (
            <div
              key={p.id}
              className="group flex flex-col gap-4 bg-background p-6"
              aria-label={t(p.titleKey as TranslationKey)}
            >
              <div className="flex items-start justify-between">
                <p.icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {t("status.coming_soon")}
                </span>
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {t(p.titleKey as TranslationKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(p.descKey as TranslationKey)}
                </p>
              </div>
              <Link
                to="/careers"
                className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                aria-disabled="true"
              >
                {t("cta.learn_more")}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-10 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
          <p>{t("careers.disclaimer")}</p>
        </div>
      </Section>
    </SiteLayout>
  );
}