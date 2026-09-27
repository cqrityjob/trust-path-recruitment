import { useCallback, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Compass,
  FileCheck2,
  MapPin,
  Users,
} from "lucide-react";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useLocalizedHead, useT } from "@/i18n/context";
import { CareerEntryCards } from "@/components/career-center/CareerEntryCards";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { MVP_QUESTION_COUNT } from "@/lib/career-discovery/v31/personal-layer";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
import {
  ENTRY_LEVEL_SEARCH,
  NEXT_LEVEL_SEARCH,
  ORIGIN_NONE,
  PUBLISHED_PROFESSION_COUNT,
  applyExplorerSearch,
  careerOrigin,
  nearestNonEmpty,
  parseExplorerSearch,
  personalDirection,
  upcomingProfessions,
  type ExplorerSearch,
} from "@/lib/career-center";
import { useCareerCenterTracking } from "@/lib/career-center/analytics";
import {
  useMyCareerDirection,
  useMyStatedProfession,
  useSupabaseSession,
} from "@/hooks/useMyCareerDirection";
import {
  currentHrefWithHash,
  rememberReturn,
  type ReturnOrigin,
} from "@/lib/career-center/return-context";
import { CareerHero } from "@/components/career-center/CareerHero";
import { CareerRoutes } from "@/components/career-center/CareerRoutes";
import { PathFromSection } from "@/components/career-center/PathFromSection";
import { PersonalDirectionSection } from "@/components/career-center/PersonalDirection";
import { ProfessionExplorer } from "@/components/career-center/ProfessionExplorer";

// The Career Center hub, built around the questions a reader actually has,
// in the order they have them:
//
//   1 hero        what is this and where do I start (three doors: explore,
//                 "I know my profession", "help me choose" / "my result")
//   2 din riktning     what did my career analysis recommend?    (fit)
//                      — HERE only once a signed-in reader's own
//                      result can be read; otherwise it is the compact
//                      offer of the analysis, after the catalogue
//   3 från ditt yrke   I work as X — what is it, where can I go? (pathFrom)
//   4 utforska yrken   the full catalogue, one click (or one link) away
//   5 karriärvägar     what directions exist in this industry?
//   6 så bygger vi innehållet   why should I believe any of it
//
// The catalogue moved above the career routes: "show me the professions"
// is the question most readers arrive with, and it used to sit below a
// section of route diagrams.
//
// ── TWO PERSONAL SECTIONS, NEVER ONE ───────────────────────────────────
//
// `pathFrom` and `fit` answer different questions from different inputs, and
// they are rendered as separate sections with separate headings, each stating
// its own basis. A reader must always be able to tell whether a card is there
// because an instrument scored them or because they named the job they are
// in. There is no combined "Rekommenderat för dig" heading anywhere, and
// there is no state in which either section claims eligibility — see
// ELIGIBILITY_IS_NEVER_ASSESSED in career-origin.ts.
//
// `pathFrom` comes FIRST because it is the question most readers arrive with,
// it works for an anonymous visitor, and it needs no assessment.
//
// ── THE CATALOGUE IS BEHIND A CLICK ────────────────────────────────────
//
// Eleven guides plus a filter bar, rendered unconditionally, is what made
// this page 11,700px tall on a 375px screen. The explorer now opens on an
// explicit "Visa alla yrken", and the open state lives in the URL (`?all=1`),
// so a filtered catalogue view is still shareable and still deep-linkable —
// and any narrowing filter in the URL forces it open, because a link that
// filters the catalogue has to show it.
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

/** The server renders the Swedish head; see useLocalizedHead below. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/career-center/")({
  head: ({ match }) => {
    // The site language lives in the client (localStorage, defaulting to sv),
    // which SSR cannot read — so the indexed metadata is the Swedish one, the
    // language this content is written for and the market it describes. The
    // English half of the page is fully translated; only the <head> is
    // single-language. Language-prefixed URLs and hreflang would fix that
    // properly and are a routing-wide change, deliberately not made here.
    //
    // MVP text specification §14: the title and description are the Career
    // Center's own dictionary pair (the description IS the page's ingress),
    // with no price claim. useLocalizedHead() swaps in the English pair once
    // the client knows the reader's language.
    void match;
    return {
      meta: [
        { title: SV["meta.careerCenter.title"] },
        { name: "description", content: SV["cc.hero.lead"] },
        { property: "og:title", content: SV["meta.careerCenter.title"] },
        { property: "og:description", content: SV["cc.hero.lead"] },
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
const PATH_ANCHOR = "fran-mitt-yrke";
const ROUTES_ANCHOR = "karriarvagar";
const EXPLORER_PANEL_ID = "yrkeskatalog";

function CareerCenterHub() {
  const { t, lang } = useT();
  useLocalizedHead("meta.careerCenter.title", "cc.hero.lead");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const track = useCareerCenterTracking();

  // One observed session for both personal reads, keyed on the ACCOUNT, so
  // switching accounts in this tab can never show the previous account's
  // result or profession (see personal-cache.ts).
  const session = useSupabaseSession();
  const { signedIn, career, refetch } = useMyCareerDirection(session);
  const direction = useMemo(() => personalDirection(career, { signedIn }), [career, signedIn]);
  const personalised = direction.state === "ready";

  // `pathFrom`. The URL wins over the profile: an explicit click on this page
  // is the most recent thing the reader has said about themselves. `none`
  // means the reader cleared the selector — NOT "fall back to my profile".
  const stated = useMyStatedProfession(session);
  const origin = useMemo(
    () =>
      careerOrigin({
        selectedSlug: search.from ?? null,
        profileSlug: stated.slug,
        profileLabel: stated.otherLabel,
        profileTitleSv: stated.catalogueTitleSv,
        profileTitleEn: stated.catalogueTitleEn,
      }),
    [search.from, stated.slug, stated.otherLabel, stated.catalogueTitleSv, stated.catalogueTitleEn],
  );

  const writeFrom = useCallback(
    (value: string | null) => {
      navigate({
        search: (prev) => {
          const next = { ...prev } as Record<string, unknown>;
          if (value) next.from = value;
          else delete next.from;
          return next as ExplorerSearch;
        },
        replace: true,
        // The reader is working in this section; do not jump to the top.
        resetScroll: false,
      });
    },
    [navigate],
  );
  const onSelectOrigin = useCallback((slug: string) => writeFrom(slug), [writeFrom]);
  // Clearing with a saved profession must SAY "none", or the saved one comes
  // straight back; with nothing saved, an absent `from` already means none.
  const onClearOrigin = useCallback(
    () => writeFrom(origin.saved ? ORIGIN_NONE : null),
    [writeFrom, origin.saved],
  );
  const onResetOrigin = useCallback(() => writeFrom(null), [writeFrom]);

  const onToggleCatalogue = useCallback(() => {
    navigate({
      search: (prev) => {
        const next = { ...prev } as Record<string, unknown>;
        if (prev.all) delete next.all;
        else next.all = true;
        return next as ExplorerSearch;
      },
      replace: true,
      resetScroll: false,
    });
  }, [navigate]);

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
      navigate({ search: () => next, replace: true, resetScroll: false });
      track("career_filter_used", { surface: "hub_explorer" });
    },
    [navigate, track],
  );

  // Opening a profession from the hub records where the reader was — the
  // exact view, filters included — so the profession page can offer a named
  // way back to it. Tracking is unchanged.
  const opened = useCallback(
    (
      href: string,
      from: ReturnOrigin,
      anchor: string,
      surface: "hub_personal" | "hub_explorer" | "hub_routes",
    ) => {
      rememberReturn(href, from, currentHrefWithHash(anchor));
      track("career_profession_opened", { surface, subject: href.split("/").pop() });
    },
    [track],
  );

  // A direct link to a section (`?all=true#utforska-yrken`) is scrolled by
  // the browser before the personal sections have rendered. Once they
  // settle — and they change height when they do — land the reader on the
  // section again, unless they have already started scrolling themselves.
  const settled =
    signedIn === false ||
    (signedIn === true && direction.state !== "loading" && stated.status !== "loading");
  useSettledHashScroll(settled);

  const personalSection = (
    <Section bordered id={PERSONAL_ANCHOR} className="scroll-mt-4 bg-secondary/40 py-12 md:py-16">
      <PersonalDirectionSection
        direction={direction}
        onRetry={refetch}
        exploreSearch={search as Record<string, unknown>}
        exploreAnchor={EXPLORER_ANCHOR}
        savedProfessionId={origin.saved?.profession?.id ?? null}
        onProfessionOpen={(href) => opened(href, "recommendation", PERSONAL_ANCHOR, "hub_personal")}
        onAssessmentStart={() =>
          track("career_center_test_started", { surface: "hub_test_section" })
        }
        facts={<TestFacts signedOut={direction.state === "anonymous"} />}
      />
    </Section>
  );
  // The reader's own result leads the page once it can be read. Before a
  // session is observed — including the HTML a crawler keeps — and for a
  // reader without a result, the section is the compact offer of the
  // analysis and sits after the catalogue, so nobody scrolls past an
  // invitation to reach the professions.
  const personalFirst = signedIn === true && direction.state !== "no_result";

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
              {/* The reader's current filters plus `all`, so the hero's
                  secondary action opens the catalogue rather than scrolling to
                  a collapsed panel. Spread explicitly: the router types its
                  search reducer against every route's union. */}
              <Link
                to="/career-center"
                search={{ ...search, all: true } as never}
                hash={EXPLORER_ANCHOR}
                className={SECONDARY_LINK}
              >
                {t("cc.hero.cta.explore")}
              </Link>
            </>
          ) : (
            <PrimaryLink
              to="/career-center"
              search={{ all: "1" }}
              hash={EXPLORER_ANCHOR}
              variant="primary"
            >
              {t("cc.hero.cta.explore")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
          )
        }
        // Sketch 4 puts the two ways INTO a career path here. TrustRail
        // moves to the catalogue section it actually describes -- see the
        // note there -- rather than being dropped.
        aside={
          <CareerEntryCards
            pathAnchor={PATH_ANCHOR}
            personalAnchor={PERSONAL_ANCHOR}
            personalised={personalised}
          />
        }
      />

      {/* ── 2. DIN RIKTNING (fit) — first, once the reader's result is in hand */}
      {personalFirst && personalSection}

      {/* ── 3. FRÅN DITT YRKE (pathFrom) ────────────────────────────── */}
      <Section bordered id={PATH_ANCHOR} className="scroll-mt-4 bg-background py-12 md:py-16">
        <PathFromSection
          origin={origin}
          profileStatus={stated.status}
          onSelect={onSelectOrigin}
          onClear={onClearOrigin}
          onReset={onResetOrigin}
          onRetryProfile={stated.refetch}
          onProfessionOpen={(href) => opened(href, "current_role", PATH_ANCHOR, "hub_personal")}
        />
      </Section>

      {/* ── 4. UTFORSKA YRKEN — one click, or one link, away ───────── */}
      <Section bordered id={EXPLORER_ANCHOR} className="scroll-mt-4 bg-secondary/40 py-12 md:py-16">
        {/* TrustRail used to sit in the hero aside, which sketch 4 gives to
            the two path entry cards. It is not hero content: it counts the
            profession guides and says where they come from, which is a
            statement about THIS section's catalogue. So it moves here
            rather than being deleted — the reader still gets it, beside
            the thing it describes. */}
        <div className="grid gap-8 md:grid-cols-12 md:items-start">
          <div className="max-w-2xl md:col-span-7">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.explore.title")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {t("cc.explore.subtitle")}
            </p>
          </div>
          <div className="md:col-span-5">
            <TrustRail />
          </div>
        </div>

        {/* The two surviving destinations of the retired "Var står du i dag?"
            band, plus the employer path. Quiet links, not cards: they narrow a
            list the reader is about to see, which is a control rather than a
            decision about where to go next. Following one opens the catalogue,
            because `parseExplorerSearch` forces `all` whenever a narrowing
            filter is present. */}
        <nav aria-label={t("cc.explore.quick.title")} className="mt-6">
          <ul className="flex flex-wrap items-center gap-2">
            <QuickChoice
              icon={<Compass className="h-3.5 w-3.5" aria-hidden />}
              label={t("cc.explore.quick.entry")}
              search={{ ...ENTRY_LEVEL_SEARCH, all: true }}
            />
            <QuickChoice
              icon={<Users className="h-3.5 w-3.5" aria-hidden />}
              label={t("cc.explore.quick.next")}
              search={{ ...NEXT_LEVEL_SEARCH, all: true }}
            />
            <li>
              <Link to="/employers" className={QUICK_CHOICE_CLASS}>
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                {t("cc.explore.quick.org")}
              </Link>
            </li>
          </ul>
        </nav>

        {/* ── PROGRESSIVE DISCLOSURE ───────────────────────────────────
            A real <button> with aria-expanded and aria-controls, not a
            <details>: the open state has to live in the URL so a filtered
            catalogue view is shareable, and that means the toggle navigates
            rather than toggling DOM state. */}
        <div className="mt-8">
          <button
            type="button"
            data-catalogue-toggle
            aria-expanded={Boolean(search.all)}
            aria-controls={EXPLORER_PANEL_ID}
            onClick={onToggleCatalogue}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:border-accent/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {search.all ? t("cc.explore.hideAll") : t("cc.explore.showAll")}
            <span className="tabular-nums text-muted-foreground">
              ({PUBLISHED_PROFESSION_COUNT})
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${search.all ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <p className="mt-2 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
            {t("cc.explore.showAll.help")}
          </p>
        </div>

        <div id={EXPLORER_PANEL_ID} hidden={!search.all} className="mt-8">
          <ProfessionExplorer
            search={search}
            onSearchChange={onSearchChange}
            results={results}
            relaxation={relaxation}
            upcoming={upcomingProfessions}
            onProfessionOpen={(slug) =>
              opened(`/career-center/${slug}`, "catalogue", EXPLORER_ANCHOR, "hub_explorer")
            }
          />
        </div>
      </Section>

      {/* ── 2′. DIN RIKTNING — the compact offer, when there is no result */}
      {!personalFirst && personalSection}

      {/* ── 5. KARRIÄRVÄGAR ─────────────────────────────────────────── */}
      <Section bordered id={ROUTES_ANCHOR} className="scroll-mt-4 bg-background py-12 md:py-16">
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
              opened(`/career-center/${slug}`, "routes", ROUTES_ANCHOR, "hub_routes")
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
        {/* Four reference cards are reference material: a reader who wants to know
            how the content is built asks for it. The claim itself — that we
            publish only sourced, dated, jurisdictioned guides — stays above,
            unfolded, because that is the part that has to be seen. */}
        <details data-trust-disclosure className="group mt-8">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            {t("cc.trust.show")}
            <ChevronDown
              className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <ReferenceCard titleKey="cc.trust.sources.title" bodyKey="cc.trust.sources.body" />
            <ReferenceCard
              titleKey="cc.trust.jurisdiction.title"
              bodyKey="cc.trust.jurisdiction.body"
            />
            <ReferenceCard titleKey="cc.trust.reviewed.title" bodyKey="cc.trust.reviewed.body" />
            <ReferenceCard
              titleKey="cc.trust.regulatory.title"
              bodyKey="cc.trust.regulatory.body"
            />
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("cc.trust.closing")}
          </p>
        </details>
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

/**
 * Re-land a direct section link once the page has settled.
 *
 * The browser scrolls to `#utforska-yrken` while parsing the server HTML —
 * before the signed-in reader's own sections exist. When they render above
 * the target they push it down, and the reader lands mid-page on whatever
 * moved into view. This scrolls to the hash target once, after the personal
 * reads have settled, and only if the reader has not started scrolling or
 * navigating themselves (a reader who has moved is never yanked back).
 */
function useSettledHashScroll(settled: boolean) {
  const done = useRef(false);
  const interacted = useRef(false);
  useEffect(() => {
    const mark = () => {
      interacted.current = true;
    };
    const opts = { passive: true, once: true } as const;
    window.addEventListener("wheel", mark, opts);
    window.addEventListener("touchmove", mark, opts);
    window.addEventListener("keydown", mark, { once: true });
    window.addEventListener("pointerdown", mark, { once: true });
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("pointerdown", mark);
    };
  }, []);
  useEffect(() => {
    if (!settled || done.current) return;
    done.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || interacted.current) return;
    // After this render has painted, so the target is at its final place.
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el && !interacted.current) el.scrollIntoView({ block: "start" });
    });
  }, [settled]);
}

/** The facts about the career analysis, the numbers read from the instrument
 *  rather than typed into copy. Rendered only where the analysis is actually
 *  being offered — inside section 2's invitation states.
 *
 *  "Inget konto krävs" is said only to a reader who is signed out. Somebody
 *  signed in already has an account, and their run follows a different
 *  access mode (the tester gate), so the sentence would be a promise about
 *  somebody else's door (MVP text specification §7). */
function TestFacts({ signedOut }: { signedOut: boolean }) {
  const { t, lang } = useT();
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      <TestFact>
        <span className="tabular-nums">{MVP_QUESTION_COUNT}</span> {t("cc.test.fact.questions")}
      </TestFact>
      <TestFact>{DURATION_CLAIM[lang === "en" ? "en" : "sv"]}</TestFact>
      {signedOut && <TestFact>{t("cc.test.fact.account")}</TestFact>}
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

function ReferenceCard({
  titleKey,
  bodyKey,
}: {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{t(titleKey)}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
    </div>
  );
}
