import { createFileRoute } from "@tanstack/react-router";
import { Compass, Layers, Quote, Telescope } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

// ── ABOUT (owner review, 2026-09-30) ─────────────────────────────────────
//
// Rewritten as a whole: why CQrityjob exists, the problem it solves, what it
// builds, the vision, the founder's experience — briefly, supporting the
// story rather than becoming it — and what "Where trust comes first" means
// in practice. It ends on the two audiences' own pages.
//
// No customer, partner, count or credential is claimed here that the
// product cannot show. The founder's experience is stated as the owner
// approved it: policing, international security work, personal protection
// and security leadership.

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
  { key: "what", icon: Layers },
  { key: "vision", icon: Telescope },
] as const;

function AboutPage() {
  const { t } = useT();
  useLocalizedHead("meta.about.title", "about.lead");
  return (
    <SiteLayout>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <Section className="border-b border-border bg-secondary/40 py-16 md:py-24">
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

      {/* ── WHY · WHAT · VISION ──────────────────────────────────────── */}
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

      {/* ── EXPERIENCE ───────────────────────────────────────────────── */}
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

      {/* ── WHERE TRUST COMES FIRST ──────────────────────────────────── */}
      <Section className="bg-primary py-16 text-primary-foreground md:py-24">
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
