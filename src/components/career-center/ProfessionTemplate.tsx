import {
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  Minus,
  ShieldAlert,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  L,
  entrySteps,
  fitSignals,
  getCompetency,
  getEducation,
  getFamily,
  icon,
  inboundTransitions,
  onwardTransitions,
  professionEducation,
  proficiencyLabels,
  publishedOnly,
  type Profession,
} from "@/lib/career-center";
import { useCareerCenterTracking } from "@/lib/career-center/analytics";
import { useSupabaseSessionFlag } from "@/hooks/useMyCareerDirection";
import { CareerHero } from "./CareerHero";
import { CompetencyCard } from "./CompetencyCard";
import { EducationPanel } from "./EducationPanel";
import { FAQAccordion } from "./FAQAccordion";
import { ProfessionCard } from "./ProfessionCard";
import { ProfessionNextSteps } from "./NextStepPanel";
import { TransitionCard } from "./TransitionCard";

// One published profession guide, in the settled order:
//
//   1 role hero · 2 fact row · 3 regulatory notice · 4 om yrket ·
//   5 en dag i rollen · 6 passar dig som · 7 passar mindre bra om ·
//   8 kompetenser · 9 formella krav · 10 så kommer du in ·
//   11 möjliga nästa karriärsteg · 12 utbildning och behörighet ·
//   13 relaterade jobb och ditt Passport · 14 karriäranalys ·
//   15 relaterade yrken · 16 källor och governance
//
// ── WHAT THE PILOT PASS CHANGED ────────────────────────────────────────
//
// Career steps moved BEFORE education, and both were rebuilt. The order is
// the reader's question order: "where could I go" has to be answered before
// "what would I have to study", or the education section is a list of courses
// with no destination attached.
//
//   * "Karriärväg" was two columns of role names. It is now explained
//     transitions (see TransitionCard): each one classified as an adjacent
//     step, a formal gate or a longer-term goal, with what transfers, what is
//     demanded more of, the destination's formal requirements verbatim, and —
//     for a distant destination — the intermediate role the graph records.
//
//   * "Utbildning och certifikat" was two lists of names. It is now the
//     neutral education surface: every row states whether it is a FORMAL
//     REQUIREMENT or RECOMMENDED DEVELOPMENT, which country that holds in,
//     its source and its review date, and rows that cannot carry all four are
//     named as under review rather than presented as finished.
//
//   * Related open jobs and the Passport boundary are new. Section 4.8 of the
//     directive asked for the first; the second exists because a page that
//     tells somebody what a role requires, next to a product that records
//     what they hold, invites exactly one wrong inference — and says so.
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
  const track = useCareerCenterTracking();
  // Only used to choose the right Passport entry point. Nothing this page
  // CLAIMS depends on who is reading it.
  const signedIn = useSupabaseSessionFlag();
  const family = getFamily(profession.family);

  const title = lang === "sv" ? profession.titleSv : profession.titleEn;
  const short = L(profession.description, lang);
  const signals = fitSignals(profession);
  const steps = entrySteps(profession, (id) => getEducation(id));

  const education = professionEducation(profession);

  // Career-path and related lists link only to guides that exist. A dead-end
  // click from a finished guide onto an unavailable one is the same broken
  // promise as an unfinished guide, arrived at one step later — which the
  // transition builders enforce for themselves.
  const onward = onwardTransitions(profession);
  const inbound = inboundTransitions(profession);
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
            {/* The product's short NAME, not the hub's headline. The h1 on
                the hub is a sentence now, and a breadcrumb reading "Utforska
                yrken och hitta din nästa karriärväg / Väktare" is not a
                breadcrumb. */}
            {t("cc.hero.name")}
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

        {/* 3 — REGULATORY NOTICE
            Rendered for a regulated role AND for an unregulated one that
            states a boundary. Säkerhetssamordnare is the case that forced
            this: the note there exists precisely to say that the title is NOT
            regulated and must not be confused with säkerhetsskyddschef, a
            statutory appointment under säkerhetsskyddslagen. Suppressing that
            because `regulated` is false hid the one sentence that stops a
            reader inventing a legal requirement. The heading differs, because
            "Reglering" and "Avgränsning" are not the same claim. */}
        {profession.regulatoryNotes && (
          <div
            data-regulatory-note={profession.regulated ? "regulation" : "boundary"}
            className={[
              "mt-8 flex items-start gap-3 rounded-lg border p-5",
              profession.regulated
                ? "border-accent/30 bg-accent/5"
                : "border-border bg-secondary/40",
            ].join(" ")}
          >
            <ShieldAlert
              className={[
                "mt-0.5 h-5 w-5 flex-shrink-0",
                profession.regulated ? "text-accent" : "text-muted-foreground",
              ].join(" ")}
              strokeWidth={1.75}
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {profession.regulated ? t("cc.p.regulatory.title") : t("cc.p.regulatory.boundary")}
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
        {/* Eleven competency cards unfolded is 2,000px on a phone for a
            section most readers skim once. Native <details>: keyboard
            operable, findable by in-page search, no script. */}
        <details data-competency-disclosure className="group mt-8">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            {t("cc.p.competencies.show")}
            <span className="tabular-nums text-muted-foreground">
              ({profession.competencies.length})
            </span>
            <ChevronDown
              className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </details>
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

      {/* 11 — MÖJLIGA NÄSTA KARRIÄRSTEG */}
      <Section bordered id="karriarsteg" className="bg-secondary/40 py-16 md:py-20">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.next.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.p.next.subtitle")}
          </p>
        </div>
        {onward.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {onward.map((tr) => (
              <TransitionCard
                key={`onward-${tr.to.slug}`}
                transition={tr}
                direction="onward"
                onOpen={(slug) =>
                  track("career_profession_opened", {
                    surface: "profession_transitions",
                    subject: slug,
                  })
                }
              />
            ))}
          </div>
        ) : (
          <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.p.next.none")}
          </p>
        )}

        {inbound.length > 0 && (
          <div className="mt-14">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              {t("cc.p.prev.title")}
            </h3>
            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {inbound.map((tr) => (
                <TransitionCard
                  key={`inbound-${tr.from.slug}`}
                  transition={tr}
                  direction="inbound"
                  headingLevel={4}
                  onOpen={(slug) =>
                    track("career_profession_opened", {
                      surface: "profession_transitions",
                      subject: slug,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}
        <p className="mt-8 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
          {t("cc.routes.disclaimer")}
        </p>
      </Section>

      {/* 12 — UTBILDNING OCH BEHÖRIGHET */}
      <Section bordered id="utbildning" className="py-16 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("cc.p.education.title")}
        </h2>
        <EducationPanel education={education} />
      </Section>

      {/* 13 — RELATERADE LEDIGA JOBB · DITT PASSPORT */}
      <Section bordered id="nasta-steg" className="bg-secondary/40 py-16 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("cc.p.act.title")}
        </h2>
        <div className="mt-8">
          <ProfessionNextSteps profession={profession} signedIn={signedIn} />
        </div>
      </Section>

      {/* 14 — KARRIÄRANALYS */}
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

      {/* 15 — RELATERADE YRKEN */}
      {relatedRoles.length > 0 && (
        <Section bordered id="relaterade-yrken" className="py-16 md:py-20">
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
                family={getFamily(p.family) ? L(getFamily(p.family)!.name, lang) : undefined}
                formalRequirement={
                  p.formalRequirements?.[0] ? L(p.formalRequirements[0], lang) : undefined
                }
                onOpen={(slug) =>
                  track("career_profession_opened", {
                    surface: "profession_related",
                    subject: slug,
                  })
                }
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

      {/* 16 — SOURCES / GOVERNANCE. Publishability guarantees at least one
          source, a review date and a jurisdiction, so this section is never
          empty on a page that renders. */}
      <Section bordered className="py-14 md:py-16">
        <div className="rounded-xl border border-border bg-background p-6 md:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("cc.p.sources")}
          </h2>
          {/* The review date and the jurisdiction stay visible: they are the
              two facts a reader uses to decide whether to trust the page at
              all. The source LIST folds, because it is a reference. */}
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.p.reviewed")}:</dt>
              <dd className="tabular-nums text-foreground">{profession.lastVerified}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.p.jurisdiction")}:</dt>
              <dd className="text-foreground">{profession.countries.join(", ")}</dd>
            </div>
          </dl>
          <details data-sources-disclosure className="group mt-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              {t("cc.p.sources.show")}
              <span className="tabular-nums text-muted-foreground">
                ({(profession.sources ?? []).length})
              </span>
              <ChevronDown
                className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <ul className="mt-4 space-y-2 text-sm">
              {(profession.sources ?? []).map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-foreground">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent"
                  />
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
          </details>
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
