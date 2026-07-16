import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, ClipboardCheck, Building2, ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: "For employers — CQrityjob" },
      {
        name: "description",
        content:
          "Recruit verified security professionals with structured assessment and faster decisions.",
      },
      { property: "og:title", content: "For employers — CQrityjob" },
      {
        property: "og:description",
        content:
          "Verified competence, structured assessment and workflows built for security industry hiring.",
      },
      { property: "og:url", content: "/employers" },
    ],
    links: [{ rel: "canonical", href: "/employers" }],
  }),
  component: EmployersPage,
});

function EmployersPage() {
  const { t } = useT();
  const points = [
    { icon: ShieldCheck, title: t("employers.point1.title"), body: t("employers.point1.body") },
    { icon: ClipboardCheck, title: t("employers.point2.title"), body: t("employers.point2.body") },
    { icon: Building2, title: t("employers.point3.title"), body: t("employers.point3.body") },
  ];
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("employers.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("employers.lead")}
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