import { ArrowRight, Check, ExternalLink, Info, Minus, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  L,
  entrySteps,
  fitSignals,
  getCertification,
  getCompetency,
  getEducation,
  getFamily,
  icon,
  proficiencyLabels,
  publishedOnly,
  type Profession,
} from "@/lib/career-center";
import { CareerHero } from "./CareerHero";
import { CompetencyCard } from "./CompetencyCard";
import { CertificationCard } from "./CertificationCard";
import { FAQAccordion } from "./FAQAccordion";
import { ProfessionCard } from "./ProfessionCard";

// One published profession guide, in the settled order:
//
//   1 role hero · 2 fact row · 3 regulatory notice · 4 om yrket ·
//   5 en dag i rollen · 6 passar dig som · 7 passar mindre bra om ·
//   8 kompetenser · 9 formella krav · 10 så kommer du in ·
//   11 utbildning & certifikat · 12 karriärväg · 13 karriärtest ·
//   14 relaterade yrken · 15 källor och governance
//
// ── WHAT THIS PAGE NO LONGER DOES ──────────────────────────────────────
//
// It no longer renders the Career Center's site-wide statistics panel beside
// the title of one specific job. It no longer renders three dashed
// placeholder boxes ("Utbildningsinformation för denna roll byggs upp
// löpande", the same for certificates, and a jobs panel for a job board that
// is a separate product area) — a section with no content is now simply
// absent. And it no longer carries the "under development" notice, because a
// guide that would have needed one is not routed here at all: the route
// checks publishability first and shows an unavailable state instead.
//
// Every remaining section is conditional on its own data. A guide that has no
// sourced formal requirements shows no "Formella krav" heading; one whose
// competency profile is not distinctive enough to say anything honest about
// fit shows neither fit section. Omission is the designed behaviour, not a
// gap in the template.

export function ProfessionTemplate({ profession }: { profession: Profession }) {
  const { t, lang } = useT();
  const family = getFamily(profession.family);

  const title = lang === "sv" ? profession.titleSv : profession.titleEn;
  const short = L(profession.description, lang);
  const signals = fitSignals(profession);
  const steps = entrySteps(profession, (id) => getEducation(id));

  const educationPathways = (profession.educationPathways ?? [])
    .map((id) => getEducation(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const professionCerts = (profession.certifications ?? [])
    .map((id) => getCertification(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  // Career-path and related lists link only to guides that exist. A dead-end
  // click from a finished guide onto an unavailable one is the same broken
  // promise as an unfinished guide, arrived at one step later.
  const previousRoles = publishedOnly(profession.previousRoles ?? []);
  const nextRoles = publishedOnly(profession.nextRoles ?? []);
  const relatedRoles = publishedOnly(profession.related ?? []).filter(
    (p) => p.id !== profession.id,
  );

  const dayItems = [...profession.responsibilities];
  const environments = profession.workEnvironments ?? [];

  return (
    <>
      {/* 1 — ROLE HERO */}
      <CareerHero
        eyebrow={family ? L(family.name, lang) : undefined}
        title={title}
        lead={short}
        actions={
          <PrimaryLink to="/security-career-assessment">
            {t("cc.test.cta")}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </PrimaryLink>
        }
      />

      <nav aria-label={t("cc.explore.title")} className="border-b border-border bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-6 py-3 text-xs text-muted-foreground md:px-8">
          <Link to="/career-center" className="hover:text-foreground">
            {t("cc.hero.title")}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-foreground">{title}</span>
        </div>
      </nav>

      <Section className="py-12 md:py-14">
        {/* 2 — FACT ROW */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label={t("cc.p.fact.family")} value={family ? L(family.name, lang) : "—"} />
          <Fact
            label={t("cc.p.fact.level")}
            value={t(`cc.level.${profession.level}` as TranslationKey)}
          />
          <Fact
            label={t("cc.p.fact.sector")}
            value={t(`cc.sector.${profession.sector}` as TranslationKey)}
          />
          <Fact
            label={t("cc.p.fact.regulation")}
            value={profession.regulated ? t("cc.p.regulated") : t("cc.p.not_regulated")}
            emphasis={profession.regulated}
          />
          <Fact label={t("cc.p.fact.jurisdiction")} value={profession.countries.join(" · ")} />
        </dl>

        {/* 3 — REGULATORY NOTICE (only where relevant) */}
        {profession.regulated && profession.regulatoryNotes && (
          <div className="mt-8 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-5">
            <ShieldAlert
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent"
              strokeWidth={1.75}
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {t("cc.p.regulatory.title")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {L(profession.regulatoryNotes, lang)}
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* 4 — OM YRKET  ·  5 — EN DAG I ROLLEN */}
      <Section bordered className="py-16 md:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.p.about")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {L(profession.overview, lang)}
            </p>

            <h3 className="mt-12 text-xl font-semibold tracking-tight text-foreground">
              {t("cc.p.day")}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {dayItems.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                  />
                  {L(item, lang)}
                </li>
              ))}
            </ul>
            {environments.length > 0 && (
              <>
                <h4 className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("cc.p.day.environments")}
                </h4>
                <ul className="mt-3 space-y-2 text-sm text-foreground">
                  {environments.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/60"
                      />
                      {L(item, lang)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* 6 — PASSAR DIG SOM  ·  7 — PASSAR MINDRE BRA OM */}
          <aside className="space-y-5">
            <div className="rounded-lg border border-border bg-background p-6">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {t("cc.p.fit")}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {L(signals.lead, lang)}
              </p>
              {signals.fits.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {signals.fits.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                      <Check
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent"
                        strokeWidth={2}
                        aria-hidden
                      />
                      {L(s, lang)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {signals.counters.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/50 p-6">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {t("cc.p.notfit")}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {signals.counters.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                      <Minus
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                        strokeWidth={2}
                        aria-hidden
                      />
                      {L(s, lang)}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  {t("cc.p.notfit.note")}
                </p>
              </div>
            )}
          </aside>
        </div>
      </Section>

      {/* 8 — KOMPETENSER SOM EFTERFRÅGAS */}
      <Section bordered className="bg-secondary/40 py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.competencies")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("cc.p.competencies.scale")}
          </p>
          {profession.competencies.some((c) => c.critical) && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                {t("cc.p.competencies.critical")}:
              </span>{" "}
              {t("cc.p.competencies.critical.explainer")}
            </p>
          )}
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {profession.competencies.map((rc) => {
            const competency = getCompetency(rc.competencyId);
            if (!competency) return null;
            return (
              <CompetencyCard
                key={rc.competencyId}
                name={L(competency.name, lang)}
                definition={L(competency.definition, lang)}
                icon={icon(competency.icon)}
                level={rc.requiredLevel}
                levelLabel={L(proficiencyLabels[rc.requiredLevel], lang)}
                critical={rc.critical}
              />
            );
          })}
        </div>
      </Section>

      {/* 9 — FORMELLA KRAV  ·  10 — SÅ KOMMER DU IN */}
      {(profession.formalRequirements?.length ?? 0) > 0 || steps.length > 0 ? (
        <Section bordered className="py-16 md:py-20">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            {(profession.formalRequirements?.length ?? 0) > 0 && (
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {t("cc.p.formal")}
                </h2>
                <ul className="mt-6 space-y-3 text-sm text-foreground">
                  {(profession.formalRequirements ?? []).map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                      />
                      {L(r, lang)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {steps.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {t("cc.p.entry")}
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">{t("cc.p.entry.subtitle")}</p>
                <ol className="mt-6 space-y-3">
                  {steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-4 rounded-md border border-border bg-background px-4 py-3"
                    >
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-xs font-semibold tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="text-sm text-foreground">
                        {L(step.text, lang)}
                        {step.href && step.hrefLabel && (
                          <a
                            href={step.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 flex items-center gap-1 text-xs text-accent hover:text-foreground"
                          >
                            {L(step.hrefLabel, lang)}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Section>
      ) : null}

      {/* 11 — UTBILDNING & CERTIFIKAT (only when content exists) */}
      {(educationPathways.length > 0 || professionCerts.length > 0) && (
        <Section bordered className="py-16 md:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.education")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-2">
            {educationPathways.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("cc.p.education.education")}
                </h3>
                <div className="mt-4 space-y-3">
                  {educationPathways.map((e) => (
                    <div key={e.id} className="rounded-lg border border-border bg-background p-5">
                      <p className="text-sm font-semibold text-foreground">{L(e.name, lang)}</p>
                      {e.provider && (
                        <p className="mt-1 text-xs text-muted-foreground">{L(e.provider, lang)}</p>
                      )}
                      {e.officialSource?.url && (
                        <a
                          href={e.officialSource.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:text-foreground"
                        >
                          {L(e.officialSource.label, lang)}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {professionCerts.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("cc.p.education.certifications")}
                </h3>
                <div className="mt-4 space-y-3">
                  {professionCerts.map((c) => (
                    <CertificationCard
                      key={c.id}
                      name={
                        c.shortName
                          ? `${c.shortName} · ${L(c.fullName, lang)}`
                          : L(c.fullName, lang)
                      }
                      provider={L(c.issuer, lang)}
                      tag={c.officialSource?.url}
                      href={c.officialSource?.url}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 12 — KARRIÄRVÄG (published guides only) */}
      {(previousRoles.length > 0 || nextRoles.length > 0) && (
        <Section bordered className="bg-secondary/40 py-16 md:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.path")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
            {previousRoles.length > 0 && (
              <RoleLinkList title={t("cc.p.path.previous")} roles={previousRoles} />
            )}
            {nextRoles.length > 0 && <RoleLinkList title={t("cc.p.path.next")} roles={nextRoles} />}
          </div>
        </Section>
      )}

      {/* 13 — CAREER TEST CTA */}
      <Section bordered className="py-14 md:py-16">
        <div className="grid grid-cols-1 gap-8 rounded-xl border border-border bg-background p-8 md:grid-cols-3 md:items-center">
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {t("cc.p.test.title")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("cc.p.test.body")}
            </p>
          </div>
          <div className="md:justify-self-end">
            <PrimaryLink to="/security-career-assessment">
              {t("cc.test.cta")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
          </div>
        </div>
      </Section>

      {/* 14 — RELATERADE YRKEN */}
      {relatedRoles.length > 0 && (
        <Section bordered className="py-16 md:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.related")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {relatedRoles.map((p) => (
              <ProfessionCard
                key={p.slug}
                slug={p.slug}
                title={lang === "sv" ? p.titleSv : p.titleEn}
                description={L(p.description, lang)}
                icon={icon(p.icon)}
                level={t(`cc.level.${p.level}` as TranslationKey)}
              />
            ))}
          </div>
        </Section>
      )}

      {profession.faqs && profession.faqs.length > 0 && (
        <Section bordered className="bg-secondary/40 py-16 md:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.faq")}
          </h2>
          <div className="mt-8 max-w-3xl">
            <FAQAccordion
              items={profession.faqs.map((f) => ({ q: L(f.q, lang), a: L(f.a, lang) }))}
            />
          </div>
        </Section>
      )}

      {/* 15 — SOURCES / GOVERNANCE. Publishability guarantees at least one
          source, a review date and a jurisdiction, so this section is never
          empty on a page that renders. */}
      <Section bordered className="py-14 md:py-16">
        <div className="rounded-xl border border-border bg-background p-6 md:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("cc.p.sources")}
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(profession.sources ?? []).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-foreground">
                <span aria-hidden className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                <span>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-4 hover:text-accent hover:underline"
                    >
                      {L(s.label, lang)}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    L(s.label, lang)
                  )}
                  {s.publisher && <span className="text-muted-foreground"> — {s.publisher}</span>}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.p.reviewed")}:</dt>
              <dd className="tabular-nums text-foreground">{profession.lastVerified}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.p.jurisdiction")}:</dt>
              <dd className="text-foreground">{profession.countries.join(", ")}</dd>
            </div>
          </dl>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
            {t("cc.p.disclaimer")}
          </p>
        </div>
      </Section>
    </>
  );
}

function Fact({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={[
          "mt-1.5 text-sm font-semibold tracking-tight",
          emphasis ? "text-accent" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function RoleLinkList({ title, roles }: { title: string; roles: readonly Profession[] }) {
  const { t, lang } = useT();
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      <ul className="mt-4 space-y-2">
        {roles.map((p) => (
          <li key={p.slug}>
            <Link
              to="/career-center/$profession"
              params={{ profession: p.slug }}
              className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-4 py-3 text-sm transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="font-semibold tracking-tight text-foreground">
                {lang === "sv" ? p.titleSv : p.titleEn}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`cc.level.${p.level}` as TranslationKey)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
