import { useCallback, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Compass, FileCheck2, MapPin, Users } from "lucide-react";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { MVP_QUESTION_COUNT } from "@/lib/career-discovery/v31/personal-layer";
import { DURATION_CLAIM, DURATION_CLAIM_MINUTES } from "@/lib/career-discovery/v31/duration";
import {
  ENTRY_LEVEL_SEARCH,
  NEXT_LEVEL_SEARCH,
  PUBLISHED_PROFESSION_COUNT,
  applyExplorerSearch,
  nearestNonEmpty,
  parseExplorerSearch,
  personalDirection,
  upcomingProfessions,
  type ExplorerSearch,
} from "@/lib/career-center";
import { useCareerCenterTracking } from "@/lib/career-center/analytics";
import { useMyCareerDirection } from "@/hooks/useMyCareerDirection";
import { CareerHero } from "@/components/career-center/CareerHero";
import { CareerRoutes } from "@/components/career-center/CareerRoutes";
import { PersonalDirectionSection } from "@/components/career-center/PersonalDirection";
import { ProfessionExplorer } from "@/components/career-center/ProfessionExplorer";

// The Career Center hub, rebuilt for the pilot around five questions a reader
// actually has, in the order they have them:
//
//   1 hero — what is this and where do I start
//   2 din riktning — where am I now (personal, or honestly not)
//   3 utforska yrken — which professions could suit me
//   4 karriärvägar — how do I get from here to there
//   5 så bygger vi innehållet — why should I believe any of it
//
// ── WHAT CHANGED IN THIS PASS, AND WHY ─────────────────────────────────
//
// The previous hub had six sections and THREE competing calls to action
// above the fold: "Starta karriärtestet" and "Utforska yrken" side by side in
// the hero, then a "Var står du i dag?" band of three more cards, then a
// full-width dark section repeating the test CTA a third time. A reader who
// had already taken the analysis was offered it twice more; a reader who had
// not was asked to choose between two doors before being told what was behind
// either.
//
// So: one primary action per section, and the hero's primary action is chosen
// by STATE rather than by hope. A reader whose own analysis is in hand gets
// "Utgå från mitt resultat"; everybody else gets "Utforska alla yrken". The
// second door is a quiet link, never a second button.
//
// The retired "Var står du i dag?" band's two useful destinations — the
// explorer pre-filtered to entry level and to mid+senior — survive as quick
// choices inside the explorer section, which is where a reader is already
// deciding how to narrow the catalogue. The employer path keeps its link.
// Nothing that led somewhere was deleted; the competition between them was.
//
// The retired dark career-test band's content survives inside section 2,
// which is the only place on the page where "you have no result yet" is a
// true statement — so it is the only place the invitation belongs.
//
// ── THE PERSONAL SECTION IS CLIENT-RESOLVED ────────────────────────────
//
// This route is public, indexed and server-rendered. `useMyCareerDirection`
// issues no authenticated request until a live session has been observed in
// the browser, so the HTML a crawler receives is the HTML an anonymous reader
// receives, and section 2 renders its anonymous state until proven otherwise.
//
// ── EVERY NUMBER ON THIS PAGE IS DERIVED ───────────────────────────────
//
// The guide count comes from `PUBLISHED_PROFESSION_COUNT`, the question count
// from the instrument's own `MVP_QUESTION_COUNT` and the duration from
// `DURATION_CLAIM`, so none can drift from what a visitor would find.

export const Route = createFileRoute("/career-center/")({
  head: ({ match }) => {
    // The site language lives in the client (localStorage, defaulting to sv),
    // which SSR cannot read — so the indexed metadata is the Swedish one, the
    // language this content is written for and the market it describes. The
    // English half of the page is fully translated; only the <head> is
    // single-language. Language-prefixed URLs and hreflang would fix that
    // properly and are a routing-wide change, deliberately not made here.
    void match;
    return {
      meta: [
        { title: "Karriärcenter — yrken, krav och karriärvägar | CQrityjob" },
        {
          name: "description",
          content: `Källhänvisade yrkesguider för säkerhetsbranschen: vad rollerna innebär, vilka formella krav som gäller och vilka vägar som finns vidare. Kostnadsfri karriäranalys på cirka ${DURATION_CLAIM_MINUTES.low}–${DURATION_CLAIM_MINUTES.high} minuter.`,
        },
        {
          property: "og:title",
          content: "Utforska yrken och hitta din nästa karriärväg",
        },
        {
          property: "og:description",
          content:
            "Yrkesguider, karriärvägar och en kostnadsfri karriäranalys för säkerhetsbranschen.",
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://trust-path-recruitment.lovable.app/career-center" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "canonical", href: "https://trust-path-recruitment.lovable.app/career-center" },
      ],
    };
  },
  validateSearch: parseExplorerSearch,
  component: CareerCenterHub,
});

const EXPLORER_ANCHOR = "utforska-yrken";
const PERSONAL_ANCHOR = "min-riktning";

function CareerCenterHub() {
  const { t, lang } = useT();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const track = useCareerCenterTracking();

  const { signedIn, career, refetch } = useMyCareerDirection();
  const direction = useMemo(() => personalDirection(career, { signedIn }), [career, signedIn]);
  const personalised = direction.state === "ready";

  const results = useMemo(() => applyExplorerSearch(search, lang), [search, lang]);
  const relaxation = useMemo(
    () => (results.length === 0 ? nearestNonEmpty(search, lang) : null),
    [results.length, search, lang],
  );

  const onSearchChange = useCallback(
    (next: ExplorerSearch) => {
      // `replace` keeps the back button meaning "leave the Career Center"
      // rather than "undo one chip", which is what a reader expects after
      // clicking through half a dozen filters.
      navigate({ search: () => next, replace: true });
      track("career_filter_used", { surface: "hub_explorer" });
    },
    [navigate, track],
  );

  return (
    <>
      {/* ── 1. HERO ─────────────────────────────────────────────────── */}
      <CareerHero
        eyebrow={t("cc.hero.eyebrow")}
        title={t("cc.hero.title")}
        lead={t("cc.hero.lead")}
        note={t("cc.hero.trust")}
        actions={
          // ONE primary button. Which one depends on whether this reader's own
          // analysis is in hand; the other path is a quiet link beside it, so
          // the two never compete for the same attention.
          personalised ? (
            <>
              <PrimaryLink to="/career-center" hash={PERSONAL_ANCHOR} variant="primary">
                {t("cc.hero.cta.personal")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </PrimaryLink>
              <a href={`#${EXPLORER_ANCHOR}`} className={SECONDARY_LINK}>
                {t("cc.hero.cta.explore")}
              </a>
            </>
          ) : (
            <PrimaryLink to="/career-center" hash={EXPLORER_ANCHOR} variant="primary">
              {t("cc.hero.cta.explore")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
          )
        }
        aside={<TrustRail />}
      />

      {/* ── 2. DIN RIKTNING ─────────────────────────────────────────── */}
      <Section id={PERSONAL_ANCHOR} className="bg-background py-16 md:py-20">
        <PersonalDirectionSection
          direction={direction}
          onRetry={refetch}
          exploreHref={`#${EXPLORER_ANCHOR}`}
          onProfessionOpen={(slug) =>
            track("career_profession_opened", { surface: "hub_personal", subject: slug })
          }
          onAssessmentStart={() =>
            track("career_center_test_started", { surface: "hub_test_section" })
          }
          facts={<TestFacts />}
        />
      </Section>

      {/* ── 3. UTFORSKA YRKEN ───────────────────────────────────────── */}
      <Section bordered id={EXPLORER_ANCHOR} className="bg-background py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.explore.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.explore.subtitle")}
          </p>
        </div>

        {/* The two surviving destinations of the retired "Var står du i dag?"
            band, plus the employer path. Quiet links, not cards: they narrow
            a list the reader is about to see, which is a control rather than
            a decision about where to go next. */}
        <nav aria-label={t("cc.explore.quick.title")} className="mt-6">
          <ul className="flex flex-wrap items-center gap-2">
            <QuickChoice
              icon={<Compass className="h-3.5 w-3.5" aria-hidden />}
              label={t("cc.explore.quick.entry")}
              search={{ ...ENTRY_LEVEL_SEARCH }}
            />
            <QuickChoice
              icon={<Users className="h-3.5 w-3.5" aria-hidden />}
              label={t("cc.explore.quick.next")}
              search={{ ...NEXT_LEVEL_SEARCH }}
            />
            <li>
              <Link to="/employers" className={QUICK_CHOICE_CLASS}>
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                {t("cc.explore.quick.org")}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="mt-8">
          <ProfessionExplorer
            search={search}
            onSearchChange={onSearchChange}
            results={results}
            relaxation={relaxation}
            upcoming={upcomingProfessions}
            onProfessionOpen={(slug) =>
              track("career_profession_opened", { surface: "hub_explorer", subject: slug })
            }
          />
        </div>
      </Section>

      {/* ── 4. KARRIÄRVÄGAR ─────────────────────────────────────────── */}
      <Section bordered className="bg-secondary/40 py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.routes.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.routes.subtitle")}
          </p>
        </div>
        <div className="mt-10">
          <CareerRoutes
            onProfessionOpen={(slug) =>
              track("career_profession_opened", { surface: "hub_routes", subject: slug })
            }
          />
        </div>
      </Section>

      {/* ── 5. SÅ BYGGER VI INNEHÅLLET ──────────────────────────────── */}
      <Section bordered className="bg-background py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.trust.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.trust.subtitle")}
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <TrustCard titleKey="cc.trust.sources.title" bodyKey="cc.trust.sources.body" />
          <TrustCard titleKey="cc.trust.jurisdiction.title" bodyKey="cc.trust.jurisdiction.body" />
          <TrustCard titleKey="cc.trust.reviewed.title" bodyKey="cc.trust.reviewed.body" />
          <TrustCard titleKey="cc.trust.regulatory.title" bodyKey="cc.trust.regulatory.body" />
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("cc.trust.closing")}
        </p>
      </Section>
    </>
  );
}

const SECONDARY_LINK =
  "inline-flex h-11 items-center justify-center rounded-md px-1 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const QUICK_CHOICE_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function QuickChoice({
  icon,
  label,
  search,
}: {
  icon: React.ReactNode;
  label: string;
  search: ExplorerSearch;
}) {
  return (
    <li>
      <Link
        to="/career-center"
        search={search}
        hash={EXPLORER_ANCHOR}
        className={QUICK_CHOICE_CLASS}
      >
        {icon}
        {label}
      </Link>
    </li>
  );
}

/** The three facts about the career analysis, every one of them read from the
 *  instrument rather than typed into copy. Rendered only where the analysis is
 *  actually being offered — inside section 2's invitation states. */
function TestFacts() {
  const { t, lang } = useT();
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      <TestFact>
        <span className="tabular-nums">{MVP_QUESTION_COUNT}</span> {t("cc.test.fact.questions")}
      </TestFact>
      <TestFact>{DURATION_CLAIM[lang === "en" ? "en" : "sv"]}</TestFact>
      <TestFact>{t("cc.test.fact.account")}</TestFact>
      <TestFact>{t("cc.test.fact.noright")}</TestFact>
    </ul>
  );
}

/** The hero's supporting panel. Three statements, one of them a number that
 *  is counted rather than claimed. */
function TrustRail() {
  const { t } = useT();
  return (
    <div className="relative rounded-xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur">
      <div
        aria-hidden
        className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-[color:var(--gold)]/50 to-transparent"
      />
      <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
        {PUBLISHED_PROFESSION_COUNT}
      </p>
      <p className="text-sm font-medium text-foreground">{t("cc.hero.fact.guides")}</p>
      <ul className="mt-6 space-y-4 border-t border-border/70 pt-5">
        <RailFact
          icon={<FileCheck2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          title={t("cc.hero.fact.sources.title")}
          body={t("cc.hero.fact.sources.body")}
        />
        <RailFact
          icon={<MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          title={t("cc.hero.fact.market.title")}
          body={t("cc.hero.fact.market.body")}
        />
      </ul>
    </div>
  );
}

function RailFact({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0 text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-semibold tracking-tight text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

function TestFact({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-foreground">
      {children}
    </li>
  );
}

function TrustCard({ titleKey, bodyKey }: { titleKey: TranslationKey; bodyKey: TranslationKey }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{t(titleKey)}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
    </div>
  );
}
