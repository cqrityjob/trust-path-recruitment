import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Briefcase } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Security Jobs — CQrityjob" },
      {
        name: "description",
        content:
          "A dedicated job experience for the security industry — in development. Get notified when the job board launches.",
      },
      { property: "og:title", content: "Security Jobs — CQrityjob" },
      {
        property: "og:description",
        content:
          "A dedicated job experience designed for the security industry — coming soon.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/jobs" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/jobs" }],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("jobs.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("jobs.lead")}
          </p>
        </div>
        <div className="mt-16 rounded-lg border border-border bg-background p-10 md:p-14">
          <Briefcase className="h-6 w-6 text-accent" strokeWidth={1.5} />
          <p className="mt-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("status.coming_soon")}
          </p>
          <h2
            className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("jobs.coming_soon.title")}
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {t("jobs.coming_soon.body")}
          </p>
          <div className="mt-8">
            <PrimaryLink to="/contact">
              {t("cta.notify")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}