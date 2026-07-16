import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Info, Users, Building2, GraduationCap, ShieldCheck } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/assessment")({
  head: () => ({
    meta: [
      { title: "Career and Security Competence Assessments — CQrityjob" },
      {
        name: "description",
        content:
          "Free career guidance for individuals and role-based competence assessments for organizations — for candidate evaluation and development of existing security personnel.",
      },
      { property: "og:title", content: "Career and Security Competence Assessments — CQrityjob" },
      {
        property: "og:description",
        content:
          "Two separated solutions: free career guidance for individuals and role-based competence assessments for organizations.",
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

  const individualPoints: TranslationKey[] = [
    "assessment.individuals.point.time",
    "assessment.individuals.point.free",
    "assessment.individuals.point.account",
    "assessment.individuals.point.guidance",
    "assessment.individuals.point.links",
  ];

  const customers: TranslationKey[] = [
    "assessment.orgs.customers.1",
    "assessment.orgs.customers.2",
    "assessment.orgs.customers.3",
    "assessment.orgs.customers.4",
    "assessment.orgs.customers.5",
    "assessment.orgs.customers.6",
  ];

  const guidancePoints: TranslationKey[] = [
    "assessment.compare.guidance.1",
    "assessment.compare.guidance.2",
    "assessment.compare.guidance.3",
    "assessment.compare.guidance.4",
    "assessment.compare.guidance.5",
  ];

  const proPoints: TranslationKey[] = [
    "assessment.compare.pro.1",
    "assessment.compare.pro.2",
    "assessment.compare.pro.3",
    "assessment.compare.pro.4",
    "assessment.compare.pro.5",
    "assessment.compare.pro.6",
  ];

  const workflowSteps: TranslationKey[] = [
    "assessment.workflow.step1",
    "assessment.workflow.step2",
    "assessment.workflow.step3",
    "assessment.workflow.step4",
    "assessment.workflow.step5",
    "assessment.workflow.step6",
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Individuals */}
          <article className="flex h-full flex-col rounded-lg border border-border bg-background p-8">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
                <Users className="h-4 w-4" strokeWidth={1.75} />
                {t("assessment.individuals.eyebrow")}
              </p>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {t("status.available") /* fallback if missing key handled below */}
              </span>
            </div>
            <h2
              className="mt-4 text-2xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("assessment.individuals.title")}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("assessment.individuals.body")}
            </p>
            <ul className="mt-6 space-y-2">
              {individualPoints.map((k) => (
                <li key={k} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={2} />
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <PrimaryLink to="/security-career-assessment">
                {t("assessment.individuals.cta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </PrimaryLink>
            </div>
          </article>

          {/* Organizations */}
          <article className="flex h-full flex-col rounded-lg border border-border bg-background p-8">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
                <Building2 className="h-4 w-4" strokeWidth={1.75} />
                {t("assessment.orgs.eyebrow")}
              </p>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {t("status.in_development")}
              </span>
            </div>
            <h2
              className="mt-4 text-2xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("assessment.orgs.title")}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("assessment.orgs.body")}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UseCaseCard
                icon={<Users className="h-4 w-4" strokeWidth={1.75} />}
                title={t("assessment.orgs.usecaseA.title")}
                body={t("assessment.orgs.usecaseA.body")}
              />
              <UseCaseCard
                icon={<GraduationCap className="h-4 w-4" strokeWidth={1.75} />}
                title={t("assessment.orgs.usecaseB.title")}
                body={t("assessment.orgs.usecaseB.body")}
              />
            </div>

            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("assessment.orgs.customers.title")}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {customers.map((k) => (
                  <li
                    key={k}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground"
                  >
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <PrimaryLink to="/contact" variant="ghost">
                {t("assessment.orgs.cta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </PrimaryLink>
              <p className="mt-3 text-xs text-muted-foreground">{t("assessment.orgs.status")}</p>
            </div>
          </article>
        </div>
      </Section>

      <Section bordered>
        <div className="max-w-2xl">
          <h2
            className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("assessment.compare.title")}
          </h2>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <CompareCard title={t("assessment.compare.guidance.title")} items={guidancePoints.map(t)} />
          <CompareCard title={t("assessment.compare.pro.title")} items={proPoints.map(t)} />
        </div>
      </Section>

      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("status.preview")}
          </p>
          <h2
            className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("assessment.workflow.title")}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{t("assessment.workflow.subtitle")}</p>
        </div>
        <ol className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflowSteps.map((k, i) => (
            <li
              key={k}
              className="rounded-md border border-border bg-background px-5 py-4 text-sm text-foreground"
            >
              <span className="text-xs font-medium uppercase tracking-widest text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-2">{t(k)}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section bordered>
        <div className="max-w-2xl">
          <h2
            className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <ShieldCheck className="h-5 w-5 text-accent" strokeWidth={1.75} />
            {t("assessment.responsible.title")}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {t("assessment.responsible.body")}
          </p>
        </div>
        <div className="mt-8 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
          <p>{t("assessment.status")}</p>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <PrimaryLink to="/security-career-assessment">
            {t("assessment.individuals.cta")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PrimaryLink>
          <PrimaryLink to="/contact" variant="ghost">
            {t("cta.talk")}
          </PrimaryLink>
        </div>
      </Section>
    </SiteLayout>
  );
}

function UseCaseCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-5">
      <div className="flex items-center gap-2 text-accent">
        {icon}
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function CompareCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-background p-8">
      <h3
        className="text-lg font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <ul className="mt-4 space-y-2">
        {items.map((s) => (
          <li key={s} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={2} />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}