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
  upcomingProfessions,
  type ExplorerSearch,
} from "@/lib/career-center";
import { useCareerCenterTracking } from "@/lib/career-center/analytics";
import { CareerHero } from "@/components/career-center/CareerHero";
import { CareerRoutes } from "@/components/career-center/CareerRoutes";
import { ProfessionExplorer } from "@/components/career-center/ProfessionExplorer";

// The Security Career Center hub — six sections, in this order:
//
//   1 hero · 2 var står du i dag · 3 karriärtest · 4 utforska yrken ·
//   5 karriärvägar · 6 så bygger vi innehållet
//
// ── WHAT WAS REMOVED ───────────────────────────────────────────────────
//
// Eleven sections became six. Four of them ("Utvalda yrken", "Bläddra efter
// kategori", "Hitta rätt roll", "Yrkesfamiljer") were four presentations of
// the same twenty professions and are now one explorer. Four more were
// advertisements for content that does not exist — an "Utbildning" panel
// reading "Utbildningsinformation byggs upp löpande", the same for
// "Certifikat", three dashed boxes under "Senaste artiklar", and a "Utvalda
// jobb" panel for a job board that has its own product area at /jobs. None of
// those were sections; they were promises. They are gone rather than
// restyled.
//
// ── EVERY NUMBER ON THIS PAGE IS DERIVED ───────────────────────────────
//
// The hero used to claim "60+" professions against a catalogue of twenty, ten
// of which were placeholders, and to print "Modell v1.0" — an internal
// version string — as though it were a fact about the product. The guide
// count now comes from `PUBLISHED_PROFESSION_COUNT` and the question count
// from the instrument's own `MVP_QUESTION_COUNT`, so neither can drift from
// what a visitor would find.

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
        { title: "Säkerhetskarriärcenter — yrken, krav och karriärvägar | CQrityjob" },
        {
          name: "description",
          content: `Källhänvisade yrkesguider för säkerhetsbranschen: vad rollerna innebär, vilka formella krav som gäller och vilka vägar som finns vidare. Kostnadsfritt karriärtest på cirka ${DURATION_CLAIM_MINUTES.low}–${DURATION_CLAIM_MINUTES.high} minuter.`,
        },
        {
          property: "og:title",
          content: "Säkerhetskarriärcenter — yrken, krav och karriärvägar",
        },
        {
          property: "og:description",
          content:
            "Yrkesguider, karriärvägar och ett kostnadsfritt karriärtest för säkerhetsbranschen.",
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

function CareerCenterHub() {
  const { t, lang } = useT();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const track = useCareerCenterTracking();

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
          <>
            <PrimaryLink
              to="/security-career-assessment"
              variant="primary"
              onClick={() => track("career_center_test_started", { surface: "hub_hero" })}
            >
              {t("cc.hero.cta.test")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
            <a
              href={`#${EXPLORER_ANCHOR}`}
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-semibold text-foreground shadow-xs transition-all hover:border-accent/40 hover:bg-secondary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cc.hero.cta.explore")}
            </a>
          </>
        }
        aside={<TrustRail />}
      />

      {/* ── 2. VAR STÅR DU I DAG? ───────────────────────────────────── */}
      <Section className="bg-background py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.where.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.where.subtitle")}
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Each path lands somewhere genuinely different: a pre-filtered
              explorer at entry level, the same explorer at mid+senior, and
              the employer product. None of them is "Läs mer". */}
          <EntryPathCard
            icon={<Compass className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
            title={t("cc.where.curious.title")}
            body={t("cc.where.curious.body")}
            cta={t("cc.where.curious.cta")}
            to="/career-center"
            search={{ ...ENTRY_LEVEL_SEARCH }}
            hash={EXPLORER_ANCHOR}
          />
          <EntryPathCard
            icon={<Users className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
            title={t("cc.where.working.title")}
            body={t("cc.where.working.body")}
            cta={t("cc.where.working.cta")}
            to="/career-center"
            search={{ ...NEXT_LEVEL_SEARCH }}
            hash={EXPLORER_ANCHOR}
          />
          <EntryPathCard
            icon={<Building2 className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
            title={t("cc.where.org.title")}
            body={t("cc.where.org.body")}
            cta={t("cc.where.org.cta")}
            to="/employers"
          />
        </div>
      </Section>

      {/* ── 3. KARRIÄRTEST ──────────────────────────────────────────── */}
      <Section bordered className="bg-primary py-16 text-primary-foreground md:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5 lg:items-center">
          <div className="lg:col-span-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
              {t("cc.test.eyebrow")}
            </p>
            {/* The explicit colour is required, not redundant: a base-layer
                rule in styles.css sets `color: var(--color-foreground)` on
                every h1-h6, which beats the `text-primary-foreground` this
                dark section sets on its container. Without it the heading
                renders near-black on near-black. */}
            <h2
              className="mt-3 text-2xl font-semibold tracking-tight text-primary-foreground md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("cc.test.title")}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-primary-foreground/80">
              {t("cc.test.body")}
            </p>
            <div className="mt-8">
              <PrimaryLink
                to="/security-career-assessment"
                variant="accent"
                onClick={() => track("career_center_test_started", { surface: "hub_test_section" })}
              >
                {t("cc.test.cta")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </PrimaryLink>
            </div>
          </div>
          <ul className="space-y-3 lg:col-span-2">
            {/* The question count is the instrument's own constant, not a
                number typed into copy. */}
            <TestFact>
              <span className="tabular-nums">{MVP_QUESTION_COUNT}</span>{" "}
              {t("cc.test.fact.questions")}
            </TestFact>
            {/* The duration, like the question count above it, is the
                instrument's own figure rather than a number typed into copy.
                This hub advertised "about 5 minutes" for a twenty-eight
                question assessment; see v31/duration.ts. */}
            <TestFact>{DURATION_CLAIM[lang === "en" ? "en" : "sv"]}</TestFact>
            <TestFact>{t("cc.test.fact.account")}</TestFact>
            <TestFact>{t("cc.test.fact.noright")}</TestFact>
          </ul>
        </div>
      </Section>

      {/* ── 4. UTFORSKA YRKEN ───────────────────────────────────────── */}
      <Section bordered id={EXPLORER_ANCHOR} className="bg-background py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("cc.explore.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("cc.explore.subtitle")}
          </p>
        </div>
        <div className="mt-10">
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

      {/* ── 5. KARRIÄRVÄGAR ─────────────────────────────────────────── */}
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

      {/* ── 6. SÅ BYGGER VI INNEHÅLLET ──────────────────────────────── */}
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
    <li className="flex items-center gap-3 rounded-md border border-primary-foreground/20 bg-primary-foreground/5 px-4 py-3 text-sm font-medium">
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

function EntryPathCard({
  icon,
  title,
  body,
  cta,
  to,
  search,
  hash,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  to: string;
  search?: ExplorerSearch;
  hash?: string;
}) {
  return (
    <Link
      to={to}
      search={search}
      hash={hash}
      className="group flex flex-col rounded-xl border border-border bg-card p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-accent transition-colors group-hover:bg-accent/10">
        {icon}
      </span>
      <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <span className="mt-6 inline-flex items-start gap-1.5 text-sm font-semibold text-accent transition-colors group-hover:text-[color:var(--accent-hover)]">
        {cta}
        <ArrowRight
          className="mt-0.5 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}
