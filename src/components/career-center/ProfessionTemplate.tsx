import { ArrowRight, ArrowUpRight, BookOpen, Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import {
  L,
  getCategory,
  getProfession,
  skills as skillsLib,
  type Profession,
} from "@/lib/career-center";
import { CareerHero } from "./CareerHero";
import { CareerRoadmap } from "./CareerRoadmap";
import { SkillCard } from "./SkillCard";
import { CertificationCard } from "./CertificationCard";
import { FAQAccordion } from "./FAQAccordion";
import { ProfessionCard } from "./ProfessionCard";

export function ProfessionTemplate({ profession }: { profession: Profession }) {
  const { t, lang } = useT();
  const category = getCategory(profession.category);

  const title = L(profession.title, lang);
  const short = L(profession.short, lang);
  const hero = L(profession.hero, lang);
  const roleFor = L(profession.roleFor, lang);

  const relatedPros = profession.related
    .map((s) => getProfession(s))
    .filter((p): p is Profession => Boolean(p));

  const roadmap = profession.careerPath.map((s) => L(s, lang));

  return (
    <>
      <CareerHero
        eyebrow={category ? L(category.name, lang) : t("nav.career_center")}
        title={title}
        lead={short}
        actions={
          <>
            <PrimaryLink to="/security-career-assessment">
              {t("cta.assessment")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
            <PrimaryLink to="/jobs" variant="ghost">
              {t("cc.cta.jobs")}
            </PrimaryLink>
          </>
        }
      />

      {/* Breadcrumb */}
      <div className="border-b border-border bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-6 py-3 text-xs text-muted-foreground md:px-8">
          <Link to="/career-center" className="hover:text-foreground">
            {t("nav.career_center")}
          </Link>
          <span>/</span>
          <span className="text-foreground">{title}</span>
        </div>
      </div>

      {/* About */}
      <Section>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.about")}
            </h2>
            <p className="mt-4 text-muted-foreground">{hero}</p>
            <h3 className="mt-10 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {t("cc.profession.responsibilities")}
            </h3>
            <ul className="mt-4 space-y-3">
              {profession.responsibilities.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                  {L(r, lang)}
                </li>
              ))}
            </ul>
          </div>
          <aside className="rounded-lg border border-border bg-background p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("cc.profession.role_for")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground">{roleFor}</p>
          </aside>
        </div>
      </Section>

      {/* Skills */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.profession.skills")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("cc.profession.skills.subtitle")}</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {profession.skills.map((s) => {
            const skill = skillsLib[s];
            return (
              <SkillCard
                key={s}
                name={L(skill.name, lang)}
                desc={L(skill.desc, lang)}
                icon={skill.icon}
              />
            );
          })}
        </div>
      </Section>

      {/* Education */}
      <Section bordered>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.education")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("cc.profession.education.subtitle")}</p>
            <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              <BookOpen className="h-5 w-5 text-accent" strokeWidth={1.5} />
              <p className="mt-3">{t("cc.profession.education.placeholder")}</p>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.certifications")}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {t("cc.profession.certifications.subtitle")}
            </p>
            <div className="mt-6 space-y-3">
              <CertificationCard
                name={t("cc.profession.certifications.placeholder.name")}
                provider={t("cc.profession.certifications.placeholder.provider")}
                tag={t("status.coming_soon")}
              />
              <CertificationCard
                name={t("cc.profession.certifications.placeholder.name2")}
                provider={t("cc.profession.certifications.placeholder.provider")}
                tag={t("status.coming_soon")}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Career path */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.profession.path")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("cc.profession.path.subtitle")}</p>
        </div>
        <div className="mt-10 max-w-lg">
          <CareerRoadmap steps={roadmap} />
        </div>
      </Section>

      {/* Recommended assessment */}
      <Section bordered>
        <div className="grid grid-cols-1 gap-8 rounded-lg border border-border bg-background p-8 md:grid-cols-3 md:items-center">
          <div className="md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">
              {t("cc.profession.assessment.eyebrow")}
            </p>
            <h2
              className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.assessment.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("cc.profession.assessment.body")}</p>
          </div>
          <div className="md:justify-self-end">
            <PrimaryLink to="/security-career-assessment">
              {t("cta.assessment")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
          </div>
        </div>
      </Section>

      {/* Related jobs placeholder */}
      <Section bordered className="bg-muted/40">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.related_jobs")}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {t("cc.profession.related_jobs.subtitle")}
            </p>
          </div>
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-foreground"
          >
            {t("cc.cta.jobs")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 rounded-lg border border-dashed border-border bg-background p-8 text-sm text-muted-foreground">
          <Info className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <p className="mt-3">{t("cc.profession.related_jobs.placeholder")}</p>
        </div>
      </Section>

      {/* Related professions */}
      {relatedPros.length > 0 && (
        <Section bordered>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.related")}
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {relatedPros.map((p) => (
              <ProfessionCard
                key={p.slug}
                slug={p.slug}
                title={L(p.title, lang)}
                description={L(p.short, lang)}
                icon={p.icon}
              />
            ))}
          </div>
        </Section>
      )}

      {/* FAQ */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.profession.faq")}
          </h2>
        </div>
        <div className="mt-10 max-w-3xl">
          <FAQAccordion
            items={profession.faqs.map((f) => ({ q: L(f.q, lang), a: L(f.a, lang) }))}
          />
        </div>
      </Section>
    </>
  );
}
