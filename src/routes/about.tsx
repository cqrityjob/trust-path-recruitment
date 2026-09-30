import { createFileRoute } from "@tanstack/react-router";
import { Compass, Globe2, Layers, Quote, Telescope } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

// ── ABOUT: THE ORIGIN STORY (brand story, 2026-09-30) ────────────────────
//
// The page that says most clearly WHY CQrityjob exists, in the order the
// story happened:
//
//   A  why        an international recruitment experience and the question
//                 it raised — "why start over every time?"
//   B  market     security careers cross organisations, markets and borders
//   C  whole      from the next job to the whole working life
//   D  experience the security experience the platform is built from
//   E  vision     the natural place to return to, locally or internationally
//   F  trust      what "Where trust comes first" means in practice
//
// It is an insight, not a founder CV and not a complaint: no former employer
// is named or criticised. No customer, partner, count or credential is
// claimed that the product cannot show, and nothing says a licence travels
// between jurisdictions. It ends on the two audiences' own pages.

/** The server renders the Swedish page; useLocalizedHead() swaps in the
 *  English pair on the client. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: SV["meta.about.title"] },
      { name: "description", content: SV["about.lead"] },
      { property: "og:title", content: SV["meta.about.title"] },
      { property: "og:description", content: SV["about.lead"] },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/about" }],
  }),
  component: AboutPage,
});

const DISPLAY = { fontFamily: "var(--font-display)" } as const;
const H2 =
  "text-balance text-[1.5rem] font-semibold leading-[1.2] tracking-tight text-foreground md:text-[1.9rem]";

const STORY = [
  { key: "why", icon: Compass },
  { key: "market", icon: Globe2 },
  { key: "whole", icon: Layers },
] as const;

function AboutPage() {
  const { t } = useT();
  useLocalizedHead("meta.about.title", "about.lead");
  return (
    <SiteLayout>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <Section className="surface-dawn border-b border-border py-16 md:py-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("about.eyebrow")}
          </p>
          <h1
            className="mt-4 text-balance text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-foreground [hyphens:auto] sm:text-[2.8rem] md:text-[3.25rem] lg:[hyphens:none]"
            style={DISPLAY}
          >
            {t("about.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{t("about.lead")}</p>
        </div>
      </Section>

      {/* ── A · B · C: THE QUESTION, THE MARKET, THE WHOLE WORKING LIFE ─ */}
      <Section className="py-16 md:py-24">
        <div className="mx-auto max-w-3xl space-y-14">
          {STORY.map(({ key, icon: Icon }) => (
            <article key={key} data-about-section={key} className="flex gap-5">
              <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className={H2} style={DISPLAY}>
                  {t(`about.${key}.title` as TranslationKey)}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-[1.0625rem]">
                  {t(`about.${key}.body` as TranslationKey)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* ── D · EXPERIENCE ───────────────────────────────────────────── */}
      <Section bordered className="bg-secondary/40 py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className={H2} style={DISPLAY}>
            {t("about.experience.title")}
          </h2>
          <p
            data-about-founder
            className="mt-4 text-base leading-relaxed text-muted-foreground md:text-[1.0625rem]"
          >
            {t("about.experience.body")}
          </p>
        </div>
      </Section>

      {/* ── E · VISION ───────────────────────────────────────────────── */}
      <Section className="py-16 md:py-20">
        <div data-about-section="vision" className="mx-auto max-w-3xl text-center">
          <Telescope
            className="mx-auto h-7 w-7 text-accent"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <h2 className={cn(H2, "mt-4")} style={DISPLAY}>
            {t("about.vision.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-[58ch] text-base leading-relaxed text-foreground md:text-lg">
            {t("about.vision.body")}
          </p>
        </div>
      </Section>

      {/* ── F · WHERE TRUST COMES FIRST ──────────────────────────────── */}
      <Section className="surface-night py-16 text-primary-foreground md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <Quote className="mx-auto h-8 w-8 text-primary-foreground/50" aria-hidden="true" />
          {/* The brand line is English in both languages. */}
          <h2
            lang="en"
            className="mt-4 text-[1.8rem] font-semibold tracking-tight text-primary-foreground md:text-[2.4rem]"
            style={DISPLAY}
          >
            {t("about.trust.title")}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-primary-foreground/80 md:text-lg">
            {t("about.trust.body")}
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <PrimaryLink
              to="/"
              hash="for-dig"
              className="w-full border border-primary-foreground bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
            >
              {t("about.cta.individuals")}
            </PrimaryLink>
            <PrimaryLink
              to="/employers"
              variant="ghost"
              className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:border-primary-foreground/70 hover:bg-primary-foreground/10 sm:w-auto"
            >
              {t("about.cta.employers")}
            </PrimaryLink>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
