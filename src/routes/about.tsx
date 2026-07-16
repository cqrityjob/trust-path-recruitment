import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — CQrityjob" },
      {
        name: "description",
        content:
          "CQrityjob is building the leading recruitment, verification and assessment platform for the security industry.",
      },
      { property: "og:title", content: "About — CQrityjob" },
      {
        property: "og:description",
        content:
          "Our mission, vision and why we build exclusively for the security industry.",
      },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useT();
  const pillars = [
    { title: t("about.pillars.career.title"), body: t("about.pillars.career.body") },
    { title: t("about.pillars.recruit.title"), body: t("about.pillars.recruit.body") },
    { title: t("about.pillars.assessment.title"), body: t("about.pillars.assessment.body") },
  ];
  const blocks = [
    { title: t("about.mission.title"), body: t("about.mission.body") },
    { title: t("about.vision.title"), body: t("about.vision.body") },
    { title: t("about.why.title"), body: t("about.why.body") },
    { title: t("about.expansion.title"), body: t("about.expansion.body") },
  ];
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
            {t("about.lead")}
          </p>
        </div>
      </Section>
      <Section bordered className="bg-muted/40">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("about.pillars.title")}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="bg-background p-8">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {p.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section bordered>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          {blocks.map((b) => (
            <div key={b.title} className="border-t border-border pt-8">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {b.title}
              </h2>
              <p className="mt-3 text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </SiteLayout>
  );
}