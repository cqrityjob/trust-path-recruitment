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
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
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
  jobsProfessionSlug,
  onwardTransitions,
  professionEducation,
  proficiencyLabels,
  relatedGuides,
  type Profession,
} from "@/lib/career-center";
import { useCareerCenterTracking } from "@/lib/career-center/analytics";
import { useSupabaseSessionFlag } from "@/hooks/useMyCareerDirection";
import { useCareerAnalysisOpen } from "@/components/career-discovery/use-career-analysis-open";
import { jobsEnabled } from "@/lib/job-intelligence/feature-flag";
import { rememberReturn } from "@/lib/career-center/return-context";
import { CareerHero } from "./CareerHero";
import { ProfessionBackLink } from "./ProfessionBackLink";
import { ProfessionSectionNav, type SectionLink } from "./ProfessionSectionNav";
import { CompetencyCard } from "./CompetencyCard";
import { EducationPanel } from "./EducationPanel";
import { FAQAccordion } from "./FAQAccordion";
import { ProfessionCard } from "./ProfessionCard";
import { PassportBoundary, ProfessionJobs } from "./NextStepPanel";
import { NextProfessionCard } from "./NextProfessionCard";

// One published profession guide, read in the order a reader asks:
//
//   1 role hero · 2 fact row · 3 regulatory notice ·
//   4 om yrket och arbetsuppgifter ·
//   5 formella krav · 6 så kommer du in · 7 utbildning och behörighet ·
//   8 möjliga nästa yrken · 9 relevanta jobb ·
//   10 mer om yrket (passar dig som · kompetenser · ditt Passport ·
//      karriäranalys · relaterade yrken · vanliga frågor) ·
//   11 källor och granskning
//
// ── WHAT THE READER NEEDS FIRST, AND WHAT IS FÖRDJUPNING ───────────────
//
// Four questions bring a reader to a profession page: what does the work
// involve, what does it take to get in, where can it lead, and where are the
// jobs. Sections 4–9 answer them, in that order. Everything else a guide
// knows — the competency profile, who the role suits, the Passport
// boundary, the analysis, related roles, FAQs — is fördjupning and follows
// under one heading. (The MVP text specification of 2026-09-27 had the
// competency profile between the tasks and the requirements; it now sits in
// the fördjupning, and the guard follows.)
//
// ── A GUIDE WITH NO RECORDED NEXT STEP IS NOT A DEAD END ───────────────
//
// Möjliga nästa yrken lists every recorded onward move as a card with one
// click to that profession (NextProfessionCard), each with its detail behind
// "Vad steget innebär". When none is recorded — Säkerhetschef and
// AML-specialist today — the section says so, then shows the professions
// the guide itself lists as related, named as related rather than as next
// steps, and the way to every profession. Jobs and the rest of the page
// still follow.
//
// ── WHAT THIS PAGE DOES NOT DO ─────────────────────────────────────────
//
// It renders no Career-Center-wide statistics beside one job's title, no
// dashed "coming soon" boxes, and no "under development" notice: a guide that
// would need one is not routed here at all (the route checks publishability
// first). Every section below the fold is conditional on its own data.

export function ProfessionTemplate({ profession }: { profession: Profession }) {
  const { t, lang } = useT();
  const track = useCareerCenterTracking();
  // Only used to choose the right Passport entry point. Nothing this page
  // CLAIMS depends on who is reading it.
  const signedIn = useSupabaseSessionFlag();
  // The analysis card at the foot of the guide is a door into the canonical
  // route, so it asks the one availability hook the route asks. A definite
  // "closed" withdraws the action and says so in the words the rest of the
  // site uses; "not answered yet" keeps it.
  const analysisOpen = useCareerAnalysisOpen(signedIn);
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
  const related = relatedGuides(profession, onward);
  // With no recorded onward move, the related professions ARE the way on
  // and are shown in that section, unfolded; otherwise they are fördjupning.
  const relatedAsWayOn = onward.length === 0 && related.length > 0;

  const dayItems = [...profession.responsibilities];
  const environments = profession.workEnvironments ?? [];
  const hasFormal = (profession.formalRequirements?.length ?? 0) > 0 || steps.length > 0;
  const jobsSlug = jobsEnabled() ? jobsProfessionSlug(profession) : null;
  const guidePath = `/career-center/${profession.slug}`;
  // A profession opened from THIS guide comes back to this guide's steps,
  // and the way back names this guide.
  const openFromHere = (slug: string, surface: "profession_transitions" | "profession_related") => {
    track("career_profession_opened", { surface, subject: slug });
    rememberReturn(`/career-center/${slug}`, "profession", `${guidePath}#karriarsteg`, {
      sv: profession.titleSv,
      en: profession.titleEn,
    });
  };

  // The page index, in reading order. Short labels of their own (cc.nav.*),
  // so the index can sit above the sections without reordering the guide's
  // own headings.
  const sections: SectionLink[] = [
    { id: "om-yrket", label: t("cc.nav.about") },
    ...(hasFormal ? [{ id: "krav", label: t("cc.nav.requirements") }] : []),
    { id: "utbildning", label: t("cc.nav.education") },
    { id: "karriarsteg", label: t("cc.nav.next") },
    { id: "nasta-steg", label: t("cc.nav.jobs") },
    { id: "mer-om-yrket", label: t("cc.nav.more") },
    { id: "kallor", label: t("cc.nav.sources") },
  ];

  const relatedCards = (headingLevel: 3 | 4) =>
    related.map((p) => (
      <li key={p.slug}>
        <ProfessionCard
          slug={p.slug}
          title={lang === "sv" ? p.titleSv : p.titleEn}
          description={L(p.description, lang)}
          icon={icon(p.icon)}
          level={t(`cc.level.${p.level}` as TranslationKey)}
          family={getFamily(p.family) ? L(getFamily(p.family)!.name, lang) : undefined}
          formalRequirement={
            p.formalRequirements?.[0] ? L(p.formalRequirements[0], lang) : undefined
          }
          headingLevel={headingLevel}
          onOpen={(slug) => openFromHere(slug, "profession_related")}
        />
      </li>
    ));

  return (
    <>
      {/* The way back first: where the reader came from, named. */}
      <ProfessionBackLink targetPath={guidePath} currentTitle={title} />

      {/* 1 — ROLE HERO */}
      <CareerHero
        eyebrow={family ? L(family.name, lang) : undefined}
        title={title}
        lead={short}
        actions={
          // Two of the four answers are one jump away from the top: where
          // this profession can lead, and its jobs — the latter only when the
          // job board is open AND the profession has a job identity.
          <>
            <PrimaryLink to={guidePath} hash="karriarsteg">
              {t("cc.p.hero.next")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
            {jobsSlug && (
              <Link
                to="/jobs/profession/$professionSlug"
                params={{ professionSlug: jobsSlug }}
                data-hero-jobs={jobsSlug}
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-semibold tracking-tight text-foreground transition-colors hover:border-accent/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("cc.jobs.for").replace("{role}", title)}
              </Link>
            )}
          </>
        }
      />

      <ProfessionSectionNav sections={sections} />

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

      {/* 4 — OM YRKET OCH ARBETSUPPGIFTER */}
      <Section bordered id="om-yrket" className="scroll-mt-14 py-14 md:py-16">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.about")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {L(profession.overview, lang)}
          </p>

          <h3 className="mt-10 text-xl font-semibold tracking-tight text-foreground">
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
      </Section>

      {/* 5 — FORMELLA KRAV  ·  6 — SÅ KOMMER DU IN */}
      {hasFormal ? (
        <Section bordered id="krav" className="scroll-mt-14 bg-secondary/40 py-14 md:py-16">
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

      {/* 7 — UTBILDNING OCH BEHÖRIGHET */}
      <Section
        bordered
        id="utbildning"
        className={[
          "scroll-mt-14 py-14 md:py-16",
          hasFormal ? "bg-background" : "bg-secondary/40",
        ].join(" ")}
      >
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("cc.p.education.title")}
        </h2>
        <EducationPanel education={education} />
      </Section>

      {/* 8 — MÖJLIGA NÄSTA YRKEN */}
      <Section bordered id="karriarsteg" className="scroll-mt-14 bg-secondary/40 py-14 md:py-16">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.next.title")}
            {onward.length > 0 && " "}
            {onward.length > 0 && (
              <span className="tabular-nums text-muted-foreground">({onward.length})</span>
            )}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.p.next.subtitle")}
          </p>
        </div>
        {onward.length > 0 ? (
          <>
            <ul data-guide-next="list" className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              {onward.map((tr) => (
                <li key={`onward-${tr.to.slug}`}>
                  <NextProfessionCard
                    transition={tr}
                    detail
                    onOpen={(slug) => openFromHere(slug, "profession_transitions")}
                  />
                </li>
              ))}
            </ul>
            {onward.some((tr) => tr.evidenceLevel === "under_review") && (
              <p className="mt-4 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                {t("cc.next.underReview.note")}
              </p>
            )}
          </>
        ) : (
          <div data-guide-next="empty" className="mt-6">
            <p className="max-w-[70ch] rounded-lg border border-border bg-background p-5 text-sm leading-relaxed text-foreground">
              {t("cc.p.next.none").replace("{role}", title)}
            </p>
            {relatedAsWayOn && (
              <div data-guide-related-way-on className="mt-8">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {t("cc.path.related.title")}
                </h3>
                <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                  {t("cc.path.related.body").replace("{role}", title)}
                </p>
                <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedCards(4)}
                </ul>
              </div>
            )}
            <Link
              to="/career-center"
              hash="utforska-yrken"
              data-guide-all-professions
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cc.path.next.empty.explore")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}

        {/* Where people come FROM is context, not the answer to "where can I
            go": folded, and counted so the summary is honest about how much
            is behind it. */}
        {inbound.length > 0 && (
          <details data-inbound-disclosure className="group mt-12">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              {t("cc.p.prev.show")}
              <span className="tabular-nums text-muted-foreground">({inbound.length})</span>
              <ChevronDown
                className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
              {t("cc.p.prev.title")}
            </h3>
            <ul className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              {inbound.map((tr) => (
                <li key={`inbound-${tr.from.slug}`}>
                  <NextProfessionCard
                    transition={tr}
                    direction="inbound"
                    headingLevel={4}
                    onOpen={(slug) => openFromHere(slug, "profession_transitions")}
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="mt-8 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
          {t("cc.routes.disclaimer")}
        </p>
      </Section>

      {/* 9 — RELEVANTA JOBB */}
      <Section bordered id="nasta-steg" className="scroll-mt-14 py-14 md:py-16">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("cc.p.act.title")}
        </h2>
        <div className="mt-6">
          <ProfessionJobs
            profession={profession}
            relatedHref={
              related.length === 0 ? null : relatedAsWayOn ? "#karriarsteg" : "#relaterade-yrken"
            }
          />
        </div>
      </Section>

      {/* 10 — MER OM YRKET (fördjupning) */}
      <Section bordered id="mer-om-yrket" className="scroll-mt-14 bg-secondary/40 py-14 md:py-16">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.p.more.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.p.more.subtitle")}
          </p>
        </div>

        {/* PASSAR DIG SOM · PASSAR MINDRE BRA OM */}
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-6">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {t("cc.p.fit")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {L(signals.lead, lang)}
            </p>
            {signals.fits.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {signals.fits.map((sig, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent"
                      strokeWidth={2}
                      aria-hidden
                    />
                    {L(sig, lang)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {signals.counters.length > 0 && (
            <div className="rounded-lg border border-border bg-background p-6">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {t("cc.p.notfit")}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {signals.counters.map((sig, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Minus
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                      strokeWidth={2}
                      aria-hidden
                    />
                    {L(sig, lang)}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {t("cc.p.notfit.note")}
              </p>
            </div>
          )}
        </div>

        {/* KOMPETENSER SOM EFTERFRÅGAS */}
        <div id="kompetenser" className="mt-12 scroll-mt-14">
          <h3 className="text-xl font-semibold tracking-tight text-foreground">
            {t("cc.p.competencies")}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("cc.p.competencies.scale")}
          </p>
          {profession.competencies.some((c) => c.critical) && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                {t("cc.p.competencies.critical")}:
              </span>{" "}
              {t("cc.p.competencies.critical.explainer")}
            </p>
          )}
          {/* Eleven competency cards unfolded is 2,000px on a phone for a
              section most readers skim once. Native <details>: keyboard
              operable, findable by in-page search, no script. */}
          <details data-competency-disclosure className="group mt-6">
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
        </div>

        {/* DITT PASSPORT · KARRIÄRANALYS */}
        <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <PassportBoundary signedIn={signedIn} />
          <div className="flex flex-col rounded-xl border border-border bg-background p-6 md:p-8">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {t("cc.p.test.title")}
            </h3>
            {analysisOpen === false ? (
              <p
                className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground"
                data-career-analysis-closed
              >
                {t("home.career.closed")}
              </p>
            ) : (
              <>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {/* The duration is the instrument's own, never typed into copy. */}
                  {t("cc.p.test.body")} {DURATION_CLAIM[lang === "en" ? "en" : "sv"]}.
                </p>
                <div className="mt-6">
                  <PrimaryLink to="/security-career-assessment" variant="ghost">
                    {t("cc.test.cta")}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </PrimaryLink>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RELATERADE YRKEN — reference, unless it was the way on above */}
        {related.length > 0 && !relatedAsWayOn && (
          <div id="relaterade-yrken" className="mt-12 scroll-mt-14">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              {t("cc.p.related")}
            </h3>
            {/* Four profession cards unfolded were 1,600px on a phone, below
                everything a reader came for. */}
            <details data-related-disclosure className="group mt-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                {t("cc.p.related.show")}
                <span className="tabular-nums text-muted-foreground">({related.length})</span>
                <ChevronDown
                  className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedCards(4)}
              </ul>
            </details>
          </div>
        )}

        {profession.faqs && profession.faqs.length > 0 && (
          <div className="mt-12">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              {t("cc.p.faq")}
            </h3>
            <div className="mt-6 max-w-3xl">
              <FAQAccordion
                items={profession.faqs.map((f) => ({ q: L(f.q, lang), a: L(f.a, lang) }))}
              />
            </div>
          </div>
        )}
      </Section>

      {/* 11 — SOURCES / GOVERNANCE. Publishability guarantees at least one
          source, a review date and a jurisdiction, so this section is never
          empty on a page that renders. */}
      <Section bordered id="kallor" className="scroll-mt-14 py-14 md:py-16">
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
