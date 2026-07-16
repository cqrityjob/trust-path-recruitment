import { createFileRoute } from "@tanstack/react-router";
import {
  Briefcase,
  ClipboardList,
  Users2,
  LayoutDashboard,
  UserCircle2,
  Gauge,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services — CQrityjob" },
      {
        name: "description",
        content:
          "Recruitment, job board, interim & consulting, assessment and verification — all built for the security industry.",
      },
      { property: "og:title", content: "Services — CQrityjob" },
      {
        property: "og:description",
        content:
          "One platform for recruitment, verification and assessment of security professionals.",
      },
      { property: "og:url", content: "/services" },
    ],
    links: [{ rel: "canonical", href: "/services" }],
  }),
  component: ServicesPage,
});

type ServiceItem = {
  icon: typeof Briefcase;
  key: TranslationKey;
  status: "available" | "soon";
};

function ServicesPage() {
  const { t } = useT();
  const items: ServiceItem[] = [
    { icon: Briefcase, key: "cap.recruitment", status: "available" },
    { icon: ClipboardList, key: "cap.jobboard", status: "soon" },
    { icon: Users2, key: "cap.interim", status: "soon" },
    { icon: LayoutDashboard, key: "cap.employer", status: "soon" },
    { icon: UserCircle2, key: "cap.candidate", status: "soon" },
    { icon: Gauge, key: "cap.assessment", status: "soon" },
    { icon: Sparkles, key: "cap.ai", status: "soon" },
    { icon: ShieldCheck, key: "cap.verify", status: "available" },
  ];
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("services.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("services.lead")}
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-2">
          {items.map(({ icon: Icon, key, status }) => (
            <div key={key} className="flex items-start gap-4 bg-background p-8">
              <div className="rounded-md border border-border bg-muted/60 p-2">
                <Icon className="h-5 w-5 text-accent" strokeWidth={1.6} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {t(key)}
                  </h3>
                  <span
                    className={
                      "text-[11px] font-medium uppercase tracking-wider " +
                      (status === "available"
                        ? "text-accent"
                        : "text-muted-foreground")
                    }
                  >
                    {status === "available"
                      ? t("cap.status.available")
                      : t("cap.status.soon")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </SiteLayout>
  );
}