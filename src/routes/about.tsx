import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { CoreCards } from "@/components/site/HomeSections";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";

// ── ABOUT (MVP text specification §12.1) ─────────────────────────────────
//
// The same product the homepage describes, in the same words: the lead is
// the common short description, the three parts ARE the homepage's core
// cards, and the employer offer is the homepage's employer section. The
// page used to describe a career, recruitment and assessment platform with
// a free test, which was a different product from the one on /.

/** The server renders the Swedish page; useLocalizedHead() swaps in the
 *  English pair on the client. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: SV["meta.about.title"] },
      { name: "description", content: SV["brand.description"] },
      { property: "og:title", content: SV["meta.about.title"] },
      { property: "og:description", content: SV["brand.description"] },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/about" }],
  }),
  component: AboutPage,
});

const H2 = "text-2xl font-semibold tracking-tight text-foreground md:text-3xl";

function AboutPage() {
  const { t } = useT();
  useLocalizedHead("meta.about.title", "brand.description");
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("brand.name")}
          </p>
          <h1
            className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("about.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("brand.description")}
          </p>
        </div>
      </Section>
      <Section bordered>
        <div className="max-w-3xl">
          <h2 className={H2}>{t("about.mission.title")}</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">{t("about.mission.body")}</p>
        </div>
      </Section>
      <Section bordered className="bg-muted/40">
        <h2 className={H2}>{t("about.pillars.title")}</h2>
        <CoreCards heading="h3" className="mt-10" />
      </Section>
      <Section bordered>
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("home.employers.eyebrow")}
          </p>
          <h2 className={`mt-3 ${H2}`}>{t("home.employers.title")}</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">{t("home.employers.body")}</p>
          <PrimaryLink to="/employers" variant="ghost" className="mt-6 w-full sm:w-auto">
            {t("home.employers.cta.explore")}
          </PrimaryLink>
        </div>
      </Section>
      <Section bordered>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {t("about.ai.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("about.ai.body")}</p>
          </div>
          <div className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {t("about.vision.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("about.vision.body")}</p>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
