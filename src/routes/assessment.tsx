import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Info } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/assessment")({
  head: () => ({
    meta: [
      { title: "Assessment — CQrityjob" },
      {
        name: "description",
        content:
          "Career assessment for individuals and professional assessment for organizations. Structured decision support — never a replacement for human judgment.",
      },
      { property: "og:title", content: "Assessment — CQrityjob" },
      {
        property: "og:description",
        content:
          "Career and professional assessment for the security industry. Two clearly separated levels.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/assessment" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/assessment" }],
  }),
  component: AssessmentPage,
});

function AssessmentPage() {
  const { t } = useT();
  const safeguards: TranslationKey[] = [
    "assessment.safeguards.item1",
    "assessment.safeguards.item2",
    "assessment.safeguards.item3",
    "assessment.safeguards.item4",
  ];
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("assessment.eyebrow")}
          </p>
          <h1
            className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LevelCard
            eyebrow={t("assessment.career.eyebrow")}
            title={t("assessment.career.title")}
            body={t("assessment.career.body")}
            status={t("status.in_development")}
          />
          <LevelCard
            eyebrow={t("assessment.pro.eyebrow")}
            title={t("assessment.pro.title")}
            body={t("assessment.pro.body")}
            status={t("status.in_development")}
          />
        </div>
      </Section>

      <Section bordered>
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("assessment.safeguards.title")}
          </h2>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {safeguards.map((k) => (
            <li
              key={k}
              className="flex items-start gap-3 rounded-md border border-border bg-background px-5 py-4 text-sm text-foreground"
            >
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={2} />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
          <p>{t("assessment.status")}</p>
        </div>
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-4">
            <PrimaryLink to="/security-career-assessment">
              {t("cta.assessment")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
            <PrimaryLink to="/contact" variant="ghost">
              {t("cta.talk")}
            </PrimaryLink>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}

function LevelCard({
  eyebrow,
  title,
  body,
  status,
}: {
  eyebrow: string;
  title: string;
  body: string;
  status: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-background p-8">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">{eyebrow}</p>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {status}
        </span>
      </div>
      <h3
        className="mt-4 text-2xl font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}