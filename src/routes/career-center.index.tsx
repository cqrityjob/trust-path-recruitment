import { useCallback, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Briefcase, Compass, FileCheck2, TrendingUp } from "lucide-react";
import { Section } from "@/components/site/Section";
import { useLocalizedHead, useT } from "@/i18n/context";
import { CareerEntryCards } from "@/components/career-center/CareerEntryCards";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { MVP_QUESTION_COUNT } from "@/lib/career-discovery/v31/personal-layer";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
import {
  L,
  ORIGIN_NONE,
  PUBLISHED_PROFESSION_COUNT,
  LEGACY_CATALOGUE_KEYS,
  careerOrigin,
  getFamily,
  hubProfessions,
  icon,
  parseHubSearch,
  personalDirection,
  type HubSearch,
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
import { ProfessionCard } from "@/components/career-center/ProfessionCard";
import { siteUrl } from "@/lib/site-origin";

// The Career Center hub, built around the four questions a reader has, in
// the order they have them:
//
//   What is this profession?        · What could come next?
//   What would I need to get there? · Where are the jobs?
//
//   1 hero             what this is, and the two ways in: "Utgå från mitt
//                      nuvarande yrke" and "Utforska säkerhetsyrken" (or,
//                      with a result in hand, "Ditt främsta yrkesförslag")
//   2 din riktning     what did MY career analysis suggest?       (fit)
//                      — HERE once a signed-in reader's own result can be
//                      read; otherwise the compact offer of the analysis,
//                      after the list of professions
//   3 från ditt yrke   "Vilket är ditt nuvarande yrke?" — which professions
//                      can come next? Answered on the spot        (pathFrom)
//   4 alla yrken       every published guide as a card, no filters, with
//                      its basis said in one line under the heading
//   5 karriärvägar     general directions through the industry — not
//                      about the reader, and said to be so
//   6 din väg framåt   UTFORSKA → UTVECKLAS → VISA → HITTA, each with one
//                      contextual action; Hitta is the way on to the jobs
//
// ── OWNER REVIEW, 2026-09-30 ───────────────────────────────────────────
//
// Removed: the hero's trust line ("Ingen bedömning av din kompetens eller
// anställningsbarhet", which read as unclear — the analysis's own section
// now says "Karriäranalysen ger vägledning. Du väljer vägen."), the side
// panel beside "Alla yrken", the "Kommer" box of unpublished roles, and the
// "Så bygger vi innehållet" section. What the side panel said about the
// guides — sourced, reviewed, Swedish conditions — is one line under the
// list's heading, and the count is in the heading itself.
//
// ── WHAT THIS PASS REMOVED, AND WHY ────────────────────────────────────
//
// The list of professions used to sit behind "Visa alla yrken", and opening
// it produced a search box, a family filter under four group headings, a
// level filter, "Fler filter" with four more, and three "quick choice"
// filter links — 29 controls over eleven guides. Every "explore the others"
// link on the page (the empty next-steps state, the analysis offer, an
// unknown saved role) led into that block, so a reader who had just chosen
// their profession was sent back to searching. The list is now simply shown,
// and every such link lands on it. See hub-search.ts for what happens to the
// old filter links (they still open the list, and narrow nothing).
//
// ── THREE PERSONAL-ISH SECTIONS, NEVER ONE ─────────────────────────────
//
// `fit` (your analysis), `pathFrom` (the profession you named) and the career
// routes (general directions) answer different questions from different
// inputs. They are separate sections with separate headings, each stating
// its own basis, so a reader can always tell whether a card is there because
// an instrument scored them, because they named the job they are in, or
// because the routes are an example for everybody. There is no combined
// "Rekommenderat för dig" heading anywhere, and no state in which any of
// them claims eligibility — see ELIGIBILITY_IS_NEVER_ASSESSED.
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
        { property: "og:url", content: siteUrl("/career-center") },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: siteUrl("/career-center") }],
    };
  },
  validateSearch: parseHubSearch,
  component: CareerCenterHub,
});

/** The list of every profession. The id is the one the retired catalogue
 *  section used, so `#utforska-yrken` links keep landing on the professions. */
const LIST_ANCHOR = "utforska-yrken";
const PERSONAL_ANCHOR = "min-riktning";
const PATH_ANCHOR = "fran-mitt-yrke";
const ROUTES_ANCHOR = "karriarvagar";

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
        profileCatalogueNext: stated.catalogueNext,
      }),
    [
      search.from,
      stated.slug,
      stated.otherLabel,
      stated.catalogueTitleSv,
      stated.catalogueTitleEn,
      stated.catalogueNext,
    ],
  );

  const writeFrom = useCallback(
    (value: string | null) => {
      navigate({
        search: (): HubSearch => (value ? { from: value } : {}),
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

  // A link minted for the retired catalogue — `?all=1#utforska-yrken`,
  // `?level=entry`, a return link stored before the change — still opens
  // this page and still lands on the list. Its filters are ignored by the
  // parser; here they are also taken out of the address, so a reader never
  // sees or shares a filter that no longer does anything. `from` survives.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search);
    if (!LEGACY_CATALOGUE_KEYS.some((key) => raw.has(key))) return;
    navigate({
      search: (): HubSearch => (search.from ? { from: search.from } : {}),
      hash: true,
      replace: true,
      resetScroll: false,
    });
    // Once, on arrival: the page itself never writes these keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening a profession from the hub records where the reader was — the
  // exact view, current profession included — so the profession page can
  // offer a named way back to it. Tracking is unchanged.
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

  // A direct link to a section (`#utforska-yrken`) is scrolled by the
  // browser before the personal sections have rendered. Once they settle —
  // and they change height when they do — land the reader on the section
  // again, unless they have already started scrolling themselves.
  const settled =
    signedIn === false ||
    (signedIn === true && direction.state !== "loading" && stated.status !== "loading");
  useSettledHashScroll(settled);

  const professions = useMemo(() => hubProfessions(lang === "en" ? "en" : "sv"), [lang]);

  const personalSection = (
    <Section bordered id={PERSONAL_ANCHOR} className="scroll-mt-4 bg-secondary/40 py-12 md:py-16">
      <PersonalDirectionSection
        direction={direction}
        onRetry={refetch}
        listAnchor={LIST_ANCHOR}
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
  // analysis and sits after the list, so nobody scrolls past an invitation
  // to reach the professions.
  const personalFirst = signedIn === true && direction.state !== "no_result";

  return (
    <>
      {/* ── 1. HERO ─────────────────────────────────────────────────── */}
      <CareerHero
        eyebrow={t("cc.hero.eyebrow")}
        title={t("cc.hero.title")}
        lead={t("cc.hero.lead")}
        aside={
          <CareerEntryCards
            pathAnchor={PATH_ANCHOR}
            personalAnchor={PERSONAL_ANCHOR}
            listAnchor={LIST_ANCHOR}
            personalised={personalised}
            signedIn={signedIn}
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
          listAnchor={LIST_ANCHOR}
          onProfessionOpen={(href) => opened(href, "current_role", PATH_ANCHOR, "hub_personal")}
        />
      </Section>

      {/* ── 4. ALLA YRKEN — every published guide, shown, not searched ── */}
      <Section bordered id={LIST_ANCHOR} className="scroll-mt-4 bg-secondary/40 py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("cc.explore.title")}{" "}
              <span className="tabular-nums text-muted-foreground">
                ({PUBLISHED_PROFESSION_COUNT})
              </span>
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {t("cc.explore.subtitle")}
            </p>
            <p
              data-explore-basis
              className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
            >
              <FileCheck2
                className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden
              />
              {t("cc.explore.basis")}
            </p>
          </div>

          {/* The id the catalogue panel had, kept for any `#yrkeskatalog`
              link. Cards carry the classifications the filters used to —
              level and family — as information, not as controls. */}
          <ul id="yrkeskatalog" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {professions.map((p) => (
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
                  onOpen={(slug) =>
                    opened(`/career-center/${slug}`, "catalogue", LIST_ANCHOR, "hub_explorer")
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ── 2′. DIN RIKTNING — the compact offer, when there is no result */}
      {!personalFirst && personalSection}

      {/* ── 5. KARRIÄRVÄGAR — general, not personal ─────────────────── */}
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

      {/* ── 6. DIN VÄG FRAMÅT — the career journey, and the way on ──── */}
      <CareerJourney signedIn={signedIn === true} listAnchor={LIST_ANCHOR} />
    </>
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

function TestFact({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-foreground">
      {children}
    </li>
  );
}

/** UTFORSKA → UTVECKLAS → VISA → HITTA — the one public career journey.
 *  Säkerhetsarbete is its own product and is deliberately not a fifth step.
 *  Each step has ONE contextual action; "Hitta" is the way on to the jobs,
 *  so the page ends on the path forward rather than on a jobs section. */
const JOURNEY = [
  { key: "explore", icon: Compass },
  { key: "develop", icon: TrendingUp },
  { key: "show", icon: BadgeCheck },
  { key: "find", icon: Briefcase },
] as const;

function CareerJourney({ signedIn, listAnchor }: { signedIn: boolean; listAnchor: string }) {
  const { t } = useT();
  const action = (key: (typeof JOURNEY)[number]["key"]) => {
    const cls =
      "mt-4 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
    const arrow = <ArrowRight className="h-4 w-4" aria-hidden />;
    switch (key) {
      case "explore":
        return (
          <a href={`#${listAnchor}`} className={cls}>
            {t("cc.journey.explore.cta")}
            {arrow}
          </a>
        );
      case "develop":
        return signedIn ? (
          <Link to="/my-career" className={cls}>
            {t("cc.journey.develop.ctaSignedIn")}
            {arrow}
          </Link>
        ) : (
          <Link to="/signup" search={{ redirect: "/my-career" } as never} className={cls}>
            {t("cc.journey.develop.cta")}
            {arrow}
          </Link>
        );
      case "show":
        return (
          <Link to="/security-passport" className={cls}>
            {t("cc.journey.show.cta")}
            {arrow}
          </Link>
        );
      case "find":
        return (
          <Link to="/jobs" className={cls}>
            {t("cc.journey.find.cta")}
            {arrow}
          </Link>
        );
    }
  };
  return (
    <Section bordered id="din-vag" className="scroll-mt-4 bg-secondary/40 py-16 md:py-20">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("cc.journey.title")}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {t("cc.journey.lead")}
        </p>
      </div>
      <ol
        aria-label={t("cc.journey.label")}
        data-career-journey
        className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {JOURNEY.map(({ key, icon: Icon }, i) => (
          <li
            key={key}
            data-career-journey-step={key}
            className="flex flex-col rounded-xl border border-border bg-card p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-lg bg-accent/10 p-2 text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
              {t(`cc.journey.${key}.title` as TranslationKey)}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {t(`cc.journey.${key}.body` as TranslationKey)}
            </p>
            {action(key)}
          </li>
        ))}
      </ol>
      {/* Säkerhetsarbete is not a step: it is the support a person has while
          doing the job. One sentence and one link, never a section. */}
      <p data-career-journey-work className="mt-6 max-w-2xl text-sm text-muted-foreground">
        {t("cc.journey.work")}{" "}
        <Link
          to="/sakerhetsarbete"
          className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("cc.journey.work.cta")}
        </Link>
      </p>
    </Section>
  );
}
