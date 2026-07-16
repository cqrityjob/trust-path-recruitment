import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Compass,
  GraduationCap,
  Info,
  Layers,
  Rocket,
  Route as RouteIcon,
  Users,
} from "lucide-react";
import { CareerHero } from "@/components/career-center/CareerHero";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { L, professionFamilies, professions, icon } from "@/lib/career-center";
import { ProfessionCard } from "@/components/career-center/ProfessionCard";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/career-center/start")({
  head: () => ({
    meta: [
      { title: "Interested in a career in security? — CQrityjob" },
      {
        name: "description",
        content:
          "A guided entry into careers in security — for students, career changers and existing professionals.",
      },
      { property: "og:title", content: "Interested in a career in security? — CQrityjob" },
      {
        property: "og:description",
        content:
          "Explore security careers by describing where you are today — students, career changers, existing professionals, or former police/military.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/career-center/start" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/career-center/start" }],
  }),
  component: StartPage,
});

type Audience =
  | "first_career"
  | "student"
  | "changer"
  | "professional"
  | "public_service"
  | "specialist";

const audiences: {
  id: Audience;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: React.ReactNode;
}[] = [
  { id: "first_career", labelKey: "start.audience.first_career", descKey: "start.audience.first_career.desc", icon: <Rocket className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "student", labelKey: "start.audience.student", descKey: "start.audience.student.desc", icon: <GraduationCap className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "changer", labelKey: "start.audience.changer", descKey: "start.audience.changer.desc", icon: <RouteIcon className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "professional", labelKey: "start.audience.professional", descKey: "start.audience.professional.desc", icon: <Briefcase className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "public_service", labelKey: "start.audience.public_service", descKey: "start.audience.public_service.desc", icon: <Users className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "specialist", labelKey: "start.audience.specialist", descKey: "start.audience.specialist.desc", icon: <Layers className="h-4 w-4" strokeWidth={1.75} /> },
];

function StartPage() {
  const { t, lang } = useT();
  const [selected, setSelected] = useState<Audience | null>(null);

  // Different audiences get different "featured" professions.
  const featuredBy: Record<Audience, string[]> = {
    first_career: ["security-officer", "ordningsvakt", "security-technician"],
    student: ["security-officer", "soc-analyst", "security-coordinator"],
    changer: ["security-officer", "aml-specialist", "security-coordinator"],
    professional: ["security-manager", "risk-manager", "crisis-continuity-manager"],
    public_service: ["security-investigator", "intelligence-analyst", "close-protection"],
    specialist: ["risk-manager", "data-center-security", "security-consultant"],
  };

  const showcase = selected
    ? featuredBy[selected]
        .map((slug) => professions.find((p) => p.slug === slug))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
    : [];

  return (
    <>
      <CareerHero
        eyebrow={t("start.hero.eyebrow")}
        title={t("start.hero.title")}
        lead={t("start.hero.lead")}
        actions={
          <PrimaryLink to="/security-career-assessment">
            {t("cta.assessment")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PrimaryLink>
        }
      />

      {/* Audience picker */}
      <Section>
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("start.choose.title")}
          </h2>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {audiences.map((a) => {
            const active = a.id === selected;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelected(a.id)}
                className={[
                  "flex flex-col items-start gap-3 rounded-lg border p-5 text-left transition-colors",
                  active
                    ? "border-accent bg-accent/5"
                    : "border-border bg-background hover:bg-muted/40",
                ].join(" ")}
              >
                <span className="text-accent">{a.icon}</span>
                <div>
                  <p className="text-sm font-semibold tracking-tight text-foreground">{t(a.labelKey)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(a.descKey)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Suggested professions after selection */}
      {selected && showcase.length > 0 && (
        <Section bordered>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("start.next.title")}
            </h2>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {showcase.map((p) => (
              <ProfessionCard
                key={p.slug}
                slug={p.slug}
                title={lang === "sv" ? p.titleSv : p.titleEn}
                description={L(p.description, lang)}
                icon={icon(p.icon)}
                tag={p.status === "placeholder" ? t("cc.status.developing") : undefined}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Suggested next steps (always visible) */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("start.next.title")}
          </h2>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <NextCard icon={<Compass className="h-5 w-5" strokeWidth={1.5} />} to="/security-career-assessment" title={t("start.next.assessment.title")} body={t("start.next.assessment.body")} />
          <NextCard icon={<Layers className="h-5 w-5" strokeWidth={1.5} />} to="/career-center#browse" title={t("start.next.families.title")} body={t("start.next.families.body")} />
          <NextCard icon={<Rocket className="h-5 w-5" strokeWidth={1.5} />} to="/career-center#browse" title={t("start.next.entry.title")} body={t("start.next.entry.body")} />
          <NextCard icon={<RouteIcon className="h-5 w-5" strokeWidth={1.5} />} to="/career-center#browse" title={t("start.next.transition.title")} body={t("start.next.transition.body")} />
          <NextCard icon={<BookOpen className="h-5 w-5" strokeWidth={1.5} />} to="/career-center#browse" title={t("start.next.education.title")} body={t("start.next.education.body")} />
        </div>
      </Section>

      {/* Families overview */}
      <Section bordered>
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("start.families.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("start.families.subtitle")}</p>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {professionFamilies.map((f) => (
            <div key={f.id} className="rounded-lg border border-border bg-background p-5">
              <p className="text-sm font-semibold tracking-tight text-foreground">{L(f.name, lang)}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{L(f.description, lang)}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
          <p>{t("start.disclaimer")}</p>
        </div>
      </Section>
    </>
  );
}

function NextCard({
  icon,
  to,
  title,
  body,
}: {
  icon: React.ReactNode;
  to: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-lg border border-border bg-background p-5 transition-colors hover:bg-muted/40"
    >
      <span className="text-accent">{icon}</span>
      <p className="mt-4 text-sm font-semibold tracking-tight text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent group-hover:text-foreground">
        <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}