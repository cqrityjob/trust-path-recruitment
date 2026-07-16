import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, GaugeCircle, Building2, ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/candidates")({
  head: () => ({
    meta: [
      { title: "For candidates — CQrityjob" },
      {
        name: "description",
        content:
          "Build a verified profile, assess your competence and meet serious employers in the security industry.",
      },
      { property: "og:title", content: "For candidates — CQrityjob" },
      {
        property: "og:description",
        content:
          "Show your real capability and find employers that value quality.",
      },
      { property: "og:url", content: "/candidates" },
    ],
    links: [{ rel: "canonical", href: "/candidates" }],
  }),
  component: CandidatesPage,
});

function CandidatesPage() {
  const { t } = useT();
  const points = [
    { icon: BadgeCheck, title: t("candidates.point1.title"), body: t("candidates.point1.body") },
    { icon: GaugeCircle, title: t("candidates.point2.title"), body: t("candidates.point2.body") },
    { icon: Building2, title: t("candidates.point3.title"), body: t("candidates.point3.body") },
  ];
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("candidates.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("candidates.lead")}
          </p>
          <div className="mt-8">
            <PrimaryLink to="/contact">
              {t("cta.contact")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
          </div>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {points.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-background p-8">
              <Icon className="h-6 w-6 text-accent" strokeWidth={1.5} />
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Section>
    </SiteLayout>
  );
}