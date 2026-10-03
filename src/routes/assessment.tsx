import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, GraduationCap, Info, Users } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useCareerAnalysisOpen } from "@/components/career-discovery/use-career-analysis-open";
import { useSignedIn } from "@/hooks/useSignedIn";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
import { siteUrl } from "@/lib/site-origin";

// ── /assessment: THREE PURPOSES (MVP text specification §12.2) ───────────
//
// Career analysis for a person, recruitment assessments inside an employer's
// recruitment, and learning and development for existing employees. The page
// used to present "two separate solutions" with a free five-minute test and
// every organisation function marked "under development", and sent
// organisations to a contact form that sends nothing. Now:
//
//   * the duration is the instrument's own (DURATION_CLAIM), and nothing is
//     called free;
//   * the career analysis follows the same availability read as the homepage
//     and the Career Center, and says so when it is not open;
//   * the two organisation purposes lead to the employer page, which states
//     the portal's own availability — each function describes its own state;
//   * one line on responsibility: a result is read for its purpose, and
//     people decide.

/** The server renders the Swedish head; useLocalizedHead() swaps in English. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/assessment")({
  head: () => ({
    meta: [
      { title: SV["meta.assessment.title"] },
      { name: "description", content: SV["assessment.lead"] },
      { property: "og:title", content: SV["meta.assessment.title"] },
      { property: "og:description", content: SV["assessment.lead"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: siteUrl("/assessment") },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: siteUrl("/assessment") }],
  }),
  component: AssessmentPage,
});

const CARD = "flex h-full flex-col rounded-lg border border-border bg-background p-6 md:p-8";
const CARD_TITLE = "mt-4 text-2xl font-semibold tracking-tight text-foreground";

function AssessmentPage() {
  const { t, lang } = useT();
  useLocalizedHead("meta.assessment.title", "assessment.lead");
  const signedIn = useSignedIn();
  const analysisOpen = useCareerAnalysisOpen(signedIn);

  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("assessment.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("assessment.lead")}
          </p>
        </div>
      </Section>

      <Section bordered className="bg-muted/40">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <article className={CARD} data-assessment-purpose="person">
            <Users className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <h2 className={CARD_TITLE} style={{ fontFamily: "var(--font-display)" }}>
              {t("assessment.person.title")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("assessment.person.body")}
            </p>
            <p className="mt-3 text-sm text-foreground">
              {DURATION_CLAIM[lang === "en" ? "en" : "sv"]}
            </p>
            <div className="mt-auto pt-6">
              {analysisOpen === false ? (
                <p
                  className="text-sm leading-relaxed text-muted-foreground"
                  data-career-analysis-closed
                >
                  {t("home.career.closed")}
                </p>
              ) : (
                <PrimaryLink to="/security-career-assessment" className="w-full sm:w-auto">
                  {t("home.career.analysis")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </PrimaryLink>
              )}
            </div>
          </article>

          <article className={CARD} data-assessment-purpose="recruitment">
            <ClipboardCheck className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <h2 className={CARD_TITLE} style={{ fontFamily: "var(--font-display)" }}>
              {t("assessment.recruitment.title")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("assessment.recruitment.body")}
            </p>
            <div className="mt-auto pt-6">
              <PrimaryLink to="/employers" variant="ghost" className="w-full sm:w-auto">
                {t("home.employers.cta.explore")}
              </PrimaryLink>
            </div>
          </article>

          <article className={CARD} data-assessment-purpose="development">
            <GraduationCap className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <h2 className={CARD_TITLE} style={{ fontFamily: "var(--font-display)" }}>
              {t("assessment.development.title")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("assessment.development.body")}
            </p>
            <div className="mt-auto pt-6">
              <PrimaryLink to="/employers" variant="ghost" className="w-full sm:w-auto">
                {t("home.employers.cta.explore")}
              </PrimaryLink>
            </div>
          </article>
        </div>

        <p className="mt-10 flex max-w-3xl items-start gap-3 text-sm leading-relaxed text-muted-foreground">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {t("assessment.responsible")}
        </p>
      </Section>
    </SiteLayout>
  );
}
