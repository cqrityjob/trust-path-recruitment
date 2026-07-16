import { ArrowRight, ArrowUpRight, ExternalLink, Info, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import {
  L,
  getCategory,
  getCompetency,
  getEducation,
  getCertification,
  getFamily,
  getRelatedProfessions,
  getRoadmap,
  icon,
  proficiencyLabels,
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
  const family = getFamily(profession.family);

  const title = lang === "sv" ? profession.titleSv : profession.titleEn;
  const short = L(profession.description, lang);
  const overview = L(profession.overview, lang);
  const roleFor = L(profession.roleFor, lang);
  const relatedPros = getRelatedProfessions(profession);
  const roadmap = getRoadmap(profession, lang);
  const educationPathways = (profession.educationPathways ?? [])
    .map((id) => getEducation(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const professionCerts = (profession.certifications ?? [])
    .map((id) => getCertification(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const isUnderDevelopment = profession.status === "placeholder";

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

      {/* Meta chips + development notice */}
      <Section>
        <div className="flex flex-wrap items-center gap-2">
          {family && (
            <Chip>{L(family.name, lang)}</Chip>
          )}
          <Chip>{t(`cc.level.${profession.level}` as const)}</Chip>
          <Chip>{t(`cc.sector.${profession.sector}` as const)}</Chip>
          {profession.regulated && <Chip tone="accent">{t("cc.regulated")}</Chip>}
          {profession.countries.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
        {isUnderDevelopment && (
          <div className="mt-6 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
            <p>{t("cc.status.under_development")}</p>
          </div>
        )}
        {profession.regulated && profession.regulatoryNotes && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
            <p>{L(profession.regulatoryNotes, lang)}</p>
          </div>
        )}
      </Section>

      {/* About */}
      <Section>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.about")}
            </h2>
            <p className="mt-4 text-muted-foreground">{overview}</p>
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
            {profession.workEnvironments && profession.workEnvironments.length > 0 && (
              <>
                <h3 className="mt-10 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("cc.profession.environments")}
                </h3>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  {profession.workEnvironments.map((r, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                      {L(r, lang)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <aside className="rounded-lg border border-border bg-background p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("cc.profession.role_for")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground">{roleFor}</p>
          </aside>
        </div>
      </Section>

      {/* Competencies */}
      <Section bordered className="bg-muted/40">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.profession.skills")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("cc.profession.skills.subtitle")}</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {profession.competencies.map((rc) => {
            const c = getCompetency(rc.competencyId);
            if (!c) return null;
            const level = proficiencyLabels[rc.requiredLevel];
            return (
              <SkillCard
                key={rc.competencyId}
                name={L(c.name, lang)}
                desc={L(c.definition, lang)}
                icon={icon(c.icon)}
                badge={`${t("cc.profession.level")} ${rc.requiredLevel} · ${L(level, lang)}`}
                critical={rc.critical}
              />
            );
          })}
        </div>
      </Section>

      {/* Formal requirements */}
      {profession.formalRequirements && profession.formalRequirements.length > 0 && (
        <Section bordered>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.formal")}
            </h2>
          </div>
          <ul className="mt-8 space-y-3 text-sm text-foreground">
            {profession.formalRequirements.map((r, i) => (
              <li key={i} className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                {L(r, lang)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Education + certifications */}
      <Section bordered>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.profession.education")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("cc.profession.education.subtitle")}</p>
            <div className="mt-6 space-y-3">
              {educationPathways.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                  {t("cc.profession.education.placeholder")}
                </div>
              ) : (
                educationPathways.map((e) => (
                  <div key={e.id} className="rounded-lg border border-border bg-background p-5">
                    <p className="text-sm font-semibold text-foreground">{L(e.name, lang)}</p>
                    {e.provider && (
                      <p className="mt-1 text-xs text-muted-foreground">{L(e.provider, lang)}</p>
                    )}
                    {e.officialSource?.url && (
                      <a href={e.officialSource.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:text-foreground">
                        {L(e.officialSource.label, lang)} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))
              )}
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
              {professionCerts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                  {t("cc.profession.certifications.placeholder")}
                </div>
              ) : (
                professionCerts.map((c) => (
                  <CertificationCard
                    key={c.id}
                    name={c.shortName ? `${c.shortName} · ${L(c.fullName, lang)}` : L(c.fullName, lang)}
                    provider={L(c.issuer, lang)}
                    tag={c.officialSource?.url}
                    href={c.officialSource?.url}
                  />
                ))
              )}
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
                title={lang === "sv" ? p.titleSv : p.titleEn}
                description={L(p.description, lang)}
                icon={icon(p.icon)}
                tag={p.status === "placeholder" ? t("cc.status.developing") : undefined}
              />
            ))}
          </div>
        </Section>
      )}

      {/* FAQ */}
      {profession.faqs && profession.faqs.length > 0 && (
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
      )}

      {/* Sources / last reviewed */}
      {profession.sources && profession.sources.length > 0 && (
        <Section bordered>
          <div className="rounded-lg border border-border bg-background p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("cc.profession.sources")}
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {profession.sources.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-foreground">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                  <span>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                        {L(s.label, lang)} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <>{L(s.label, lang)}</>
                    )}
                    {s.publisher && (
                      <span className="text-muted-foreground"> — {s.publisher}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {profession.lastVerified && (
              <p className="mt-4 text-xs text-muted-foreground">
                {t("cc.profession.last_reviewed")}: {profession.lastVerified}
                {" · "}
                {t("cc.profession.applicable")}: {profession.countries.join(", ")}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("cc.profession.disclaimer")}
            </p>
          </div>
        </Section>
      )}
    </>
  );
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  const cls =
    tone === "accent"
      ? "border-accent text-foreground bg-accent/10"
      : "border-border text-muted-foreground bg-background";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}
