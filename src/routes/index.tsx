import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Compass,
  FileText,
  GraduationCap,
  Lightbulb,
  MapPin,
  PencilLine,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";
import { PUBLIC_MARKET_SCALE } from "@/components/site/passport-market-scale";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

/** ── THE OWNER-APPROVED PUBLIC ENTRY ARCHITECTURE ──────────────────────
 *
 *  CQrityjob is ONE Security Career Intelligence Platform with:
 *
 *    * TWO PEER acquisition entrances for an individual — Security Passport
 *      and Career Discovery;
 *    * ONE entrance for an employer — register the organisation and run a
 *      connected recruitment process from job posting through assessment
 *      and structured interview to a final HUMAN decision.
 *
 *  This SUPERSEDES the position this file used to hold, which was that
 *  Security Passport is the product and the Career Analysis is a supporting
 *  tool offered once, quietly, from the third section. Both the rendered
 *  page and every comment that encoded that rule are replaced here.
 *
 *  ── WHAT "PEER" MEANS IN THIS FILE, CONCRETELY ───────────────────────
 *
 *  The two entry cards are one grid with one set of classes, so neither can
 *  drift into being the larger one. Both actions are `variant="primary"` —
 *  the design system's one solid control — so neither can drift into being
 *  the quiet one. The Passport is rendered FIRST because it is the durable
 *  record a career is built on; that is an order and not a hierarchy.
 *
 *  ── AND THEY ARE NOT ONE DATA PRODUCT ────────────────────────────────
 *
 *  Career Discovery measures ORIENTATION — where somebody is likely to
 *  thrive — and never competence. The Passport holds a RECORD and receives
 *  no assessment answer, prompt, scoring key or rubric, and an assessment
 *  result is never a Passport credential. Neither product is a prerequisite
 *  for the other and nothing on this page implies one is. See
 *  docs/architecture/adr-career-discovery-construct-model.md and
 *  adr-security-competency-product-separation.md.
 */

/** ── WHERE "SKAPA MITT SECURITY PASSPORT" ACTUALLY GOES ───────────────
 *
 *  /signup, carrying the intent, through the mechanism the product already
 *  has: `?redirect=` is validated by safeReturnPath() and is what makes an
 *  organisation invitation and an anonymous Career Discovery claim survive
 *  account creation. It survives all three account paths — a session
 *  returned straight from signUp, an emailed confirmation link (the form
 *  rebuilds it into `emailRedirectTo`), and Google, where it is stashed in
 *  sessionStorage AND carried in `redirect_uri` because the broker has been
 *  observed normalising the latter away.
 *
 *  The landing is /passport, and it is deliberately NOT /my-career: a
 *  brand-new account has no Passport row, and /passport answers that with
 *  an explicit, named first action inside the Passport's own product shell.
 *
 *  No new route, no second auth implementation, no weakening of the
 *  redirect allow-list — /passport is not an auth surface, so it passes
 *  safeReturnPath unchanged. */
const PASSPORT_INTENT = { redirect: "/passport" } as const;

/** The employer entrance, through the SAME one door. Signing up "as an
 *  employer" is an INTENT and never a role: /employer resolves real
 *  organisation membership server-side on arrival and sends a person with
 *  none to onboarding, one with a pending organisation to the review state.
 *  Nothing on this page grants anything. */
const EMPLOYER_INTENT = { redirect: "/employer" } as const;

/** The two lifecycle destinations that need an account to be useful. Same
 *  validated mechanism, same one door, different landing. */
const MY_CAREER_INTENT = { redirect: "/my-career" } as const;
const ACADEMY_INTENT = { redirect: "/academy" } as const;

/** Career Discovery's canonical public entry, taken from the module that
 *  owns it rather than typed out again — the temporary /discovery alias
 *  redirects here and may never be linked in its place. */
const CAREER_DISCOVERY = CANONICAL_ASSESSMENT_PATH;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CQrityjob — Bygg din framtid inom säkerhet" },
      {
        name: "description",
        content:
          "Build a Security Passport or discover which security roles fit your direction, then continue with career paths, CV, jobs and development in one platform. Employers publish jobs and run structured assessments and interviews in the same place.",
      },
      { property: "og:title", content: "CQrityjob — Security Career Intelligence" },
      {
        property: "og:description",
        content:
          "Two ways to start: build your Security Passport, or discover your security career. One platform for individuals and the employers who hire them.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CQrityjob",
          slogan: "Where trust comes first.",
          description:
            "A Security Career Intelligence Platform: Security Passport, Career Discovery, and structured recruitment for security employers.",
          url: "https://www.cqrityjob.com",
        }),
      },
    ],
  }),
  component: Index,
});

// ── THE PUBLIC HOMEPAGE ────────────────────────────────────────────────
//
// FOUR sections, in this order, and nothing else:
//
//   1. hero       the framing, and the TWO peer individual entrances
//   2. employers  the employer strip, visually separate, flag-gated
//   3. lifecycle  the six stages, as an explanation of one ecosystem
//   4. passport   the three markets the Passport supports, and what it is
//                 explicitly NOT
//
// ── WHAT THIS PAGE MAY NOT SAY ─────────────────────────────────────────
//
// * that Career Discovery measures competence, or is a test, a career test
//   or an exam. It measures orientation;
// * that a Career Discovery result reaches an employer, or ranks anybody.
//   That data is the candidate's;
// * that the Passport holds an assessment answer, prompt, scoring key,
//   rubric or result, or that any of those is a credential;
// * that there is an overall Passport or candidate score;
// * that CQrityjob or a model decides suitability, hires, rejects, or
//   infers credibility, deception, personality or a protected trait;
// * that the Passport is recognised, approved or valid anywhere, or that
//   it replaces a licence, security vetting, the right to work or an
//   employer's own checks. The one sentence on that subject is the
//   owner-approved disclaimer, rendered verbatim.
//
// Humans make and document every employment and personnel-security
// decision, and the page says so where an employer reads it.

function Index() {
  const { t } = useT();
  const navigate = useNavigate();

  // Authenticated visitors land on their personal dashboard. Runs
  // client-side only; SSR still serves the public landing page for crawlers
  // and signed-out users. This is the ONLY redirect implementation on this
  // route, it fires only on a real session, and a session read that fails
  // simply leaves the visitor here rather than bouncing them into a loop.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) {
        navigate({ to: "/my-career", replace: true });
      }
    });
    return () => {
      alive = false;
    };
  }, [navigate]);

  // Release control, not a security boundary — the employer surfaces
  // re-authorise themselves server-side regardless. It is read here because
  // a door onto a disabled product is worse than no door: with the flag
  // off, the strip explains the platform and offers the information page,
  // and no registration action is drawn at all.
  const employerOpen = employerPortalEnabled();

  return (
    <SiteLayout>
      {/* ── 1 · HERO: THE FRAMING AND THE TWO PEER ENTRANCES ───────────
          One eyebrow, one h1, one subtitle, and then two cards that are the
          same size, the same weight and the same kind of action.

          Depth is CSS only — two restrained radial washes and a faint
          vertical rule grid masked out before the fold. */}
      <section
        id="hero"
        className="relative overflow-hidden border-b border-border bg-secondary/40"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "radial-gradient(900px 420px at 12% -8%, oklch(0.55 0.09 245 / 0.16), transparent 62%), radial-gradient(700px 360px at 92% 4%, oklch(0.24 0.07 265 / 0.10), transparent 60%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(0.235 0.055 258 / 0.05) 1px, transparent 1px)",
            backgroundSize: "56px 100%",
            maskImage: "linear-gradient(to bottom, black, transparent 88%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-12 sm:pt-14 md:px-8 md:pb-20 md:pt-20">
          <div className="mx-auto max-w-3xl text-center animate-in fade-in slide-in-from-bottom-2 duration-700 motion-reduce:animate-none">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("home.hero.eyebrow")}
            </p>
            {/* `[hyphens:auto]` earns its keep at 320-390px, where a Swedish
                compound does not fit on any line; the document carries
                `lang`, so the browser breaks where Swedish permits. */}
            <h1
              className="mx-auto mt-5 max-w-[18ch] text-balance text-[2.1rem] font-semibold leading-[1.07] tracking-tight text-foreground [hyphens:auto] sm:text-[2.9rem] md:text-[3rem] lg:[hyphens:none] lg:[text-wrap:pretty]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.hero.title")}
            </h1>
            <p className="mx-auto mt-5 max-w-[58ch] text-base leading-relaxed text-muted-foreground md:text-[1.0625rem]">
              {t("home.hero.subtitle")}
            </p>
          </div>

          {/* ── THE TWO PEER CARDS ───────────────────────────────────────
              ONE grid, ONE set of card classes, TWO solid actions. The
              symmetry is structural rather than a promise in a comment: a
              card that wanted to be bigger, or an action that wanted to be
              quieter, would have to change the shared constant to get it,
              and scripts/public-homepage-check.tsx reads the rendered class
              attributes to prove neither has. */}
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 items-stretch gap-5 md:mt-14 md:grid-cols-2 md:gap-6">
            <EntryCard
              icon={ShieldCheck}
              titleKey="home.entry.passport.title"
              bodyKey="home.entry.passport.body"
            >
              <PrimaryLink to="/signup" search={PASSPORT_INTENT} className="w-full sm:w-auto">
                {t("cta.passport")}
              </PrimaryLink>
            </EntryCard>

            {/* The low-friction model, stated beside the action it describes
                rather than discovered after 28 questions. Career Discovery
                starts without an account, keeps answers in this tab, and asks
                for an account only when somebody saves the result — which is
                exactly what the existing claim token preserves through email
                confirmation, Google and a login/signup swap. This page adds
                no signup wall. */}
            <EntryCard
              icon={Compass}
              titleKey="home.entry.discovery.title"
              bodyKey="home.entry.discovery.body"
              noteKey="home.entry.discovery.disclosure"
            >
              <PrimaryLink to={CAREER_DISCOVERY} className="w-full sm:w-auto">
                {t("cta.discovery")}
              </PrimaryLink>
            </EntryCard>
          </div>
        </div>
      </section>

      {/* ── 2 · THE EMPLOYER STRIP ──────────────────────────────────────
          Visually separate from the two individual cards — its own navy
          band, below them — because an employer is a different reader, not
          a third individual product.

          Gated by the release flag. With the portal off there is no
          registration action at all: the strip says what the platform does
          and hands over to /employers, which carries its own gate. A
          disabled feature is never presented as an available one. */}
      <Section
        id="employers"
        bordered
        className="relative overflow-hidden bg-primary py-14 text-primary-foreground md:py-16"
      >
        <EmployerBackdrop />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
              {t("home.employers.eyebrow")}
            </p>
            {/* `text-primary-foreground` is not optional and is not
                inherited: styles.css sets an explicit `color` on h1-h6 in
                @layer base, so a heading on the navy band renders
                navy-on-navy and disappears unless it names its own colour. */}
            <h2
              className="mt-3 text-[1.5rem] font-semibold leading-[1.15] tracking-tight text-primary-foreground md:text-[1.9rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.employers.title")}
            </h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-primary-foreground/75 md:text-base">
              {t("home.employers.body")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {employerOpen && (
              <PrimaryLink
                to="/signup"
                search={EMPLOYER_INTENT}
                className="w-full border border-primary-foreground bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
              >
                {t("home.employers.cta.register")}
              </PrimaryLink>
            )}
            <PrimaryLink
              to="/employers"
              variant="ghost"
              className="w-full border-primary-foreground/35 bg-transparent text-primary-foreground hover:border-primary-foreground/70 hover:bg-primary-foreground/10 sm:w-auto"
            >
              {t("home.employers.cta.explore")}
            </PrimaryLink>
          </div>
        </div>
      </Section>

      {/* ── 3 · ONE CONNECTED LIFECYCLE ─────────────────────────────────
          An EXPLANATION of how the parts connect, not six competing product
          cards: an ordered list of six short stages, each with at most one
          quiet link to a canonical route that already exists. No solid
          action lives in here, which is what keeps it an explanation. */}
      <Section id="lifecycle" className="scroll-mt-24 py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("home.lifecycle.eyebrow")}
          </p>
          <h2
            className="mt-3 text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("home.lifecycle.title")}
          </h2>
        </div>
        <ol className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {LIFECYCLE.map(({ key, icon: Icon, titleKey, bodyKey }, i) => (
            <li key={key} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {/* The number carries the sequence visually; the ordered
                      list already carries it for a screen reader. */}
                  <span className="tabular-nums text-muted-foreground">{i + 1}.</span> {t(titleKey)}
                </h3>
                <p className="mt-1.5 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
                  {t(bodyKey)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-5">
                  {LIFECYCLE_LINKS[key].map((link) => (
                    <QuietLink key={link.labelKey} {...link} />
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── 4 · SECURITY PASSPORT: THREE MARKETS, AND WHAT IT IS NOT ────
          The markets are read from PUBLIC_MARKET_SCALE, which carries the
          governed market-pack codes and no credential, no entitlement and
          no holder. Nothing in this section is a record about anybody, and
          nothing in it is a call to action: every Passport route is
          authenticated, and the entrance is the card in the hero. */}
      <Section id="passport" bordered className="scroll-mt-24 bg-secondary py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("home.markets.eyebrow")}
            </p>
            <h2
              className="mt-3 text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.markets.title")}
            </h2>
            <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-muted-foreground md:text-base">
              {t("home.markets.body")}
            </p>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {PUBLIC_MARKET_SCALE.map((market) => (
                <li key={market.code}>
                  <span className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground">
                    <MapPin
                      className="h-4 w-4 shrink-0 text-accent"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    {t(market.labelKey)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <TrustLevels />
            {/* The owner-approved disclaimer, verbatim and in full. It is
                the sentence that keeps the product out of territory it has
                no authority in — CQrityjob issues nothing, vets nobody and
                decides nobody's right to work. */}
            <p className="mt-8 flex items-start gap-3 rounded-lg border border-border bg-background/70 p-4 text-sm leading-relaxed text-foreground">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t("home.markets.disclaimer")}
            </p>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}

/* ── THE TWO ENTRY CARDS, FROM ONE COMPONENT ───────────────────────────
 *
 * Deliberately one component and not two. "Equal size and equal visual
 * weight" is a property that decays the moment each card owns its own
 * classes and somebody nudges one of them; here the only difference between
 * the Passport card and the Career Discovery card is the icon, the two
 * dictionary keys, and what the caller puts in `children`.
 *
 * `h-full` on the article plus `items-stretch` on the grid makes the pair
 * the same height at every width, and `mt-auto` pins both actions to the
 * bottom edge so a longer body on one side cannot raise its button above
 * the other's. */
function EntryCard({
  icon: Icon,
  titleKey,
  bodyKey,
  noteKey,
  children,
}: {
  icon: typeof ShieldCheck;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  /** A short qualification of the offer, rendered ABOVE the action.
   *
   *  Above, and not below, for a reason that only shows up in a browser:
   *  `mt-auto` pins the action block to the bottom edge, so a note INSIDE
   *  that block pushes its own button upwards and the two cards' actions
   *  stop sitting on the same line. Two peers whose buttons are 50px apart
   *  do not read as peers. With the note here, the action block holds the
   *  control and nothing else, and both land on the same baseline at every
   *  width where the cards are side by side. */
  noteKey?: TranslationKey;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow-sm)] md:p-7">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
        <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h2
        className="mt-5 text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground md:text-[1.5rem]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t(titleKey)}
      </h2>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
      {noteKey && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t(noteKey)}</p>
      )}
      <div className="mt-auto pt-6">{children}</div>
    </article>
  );
}

/** A quiet in-flow link. Never solid, always at least a 44px target, and
 *  always visibly focusable — the lifecycle section is an explanation, so
 *  its links must not read as a seventh and eighth call to action. */
function QuietLink({
  to,
  search,
  hash,
  labelKey,
}: {
  to: string;
  search?: Record<string, string>;
  hash?: string;
  labelKey: TranslationKey;
}) {
  const { t } = useT();
  return (
    <Link
      to={to}
      search={search as never}
      hash={hash}
      activeOptions={{ exact: to === "/" }}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-sm font-semibold text-accent transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {t(labelKey)}
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/* ── THE SIX STAGES ────────────────────────────────────────────────────
 *
 * Discover · Understand · Grow · Trust · Work · Continue. One ecosystem
 * described once, in the order a career actually runs.
 *
 * Nothing here claims a stage is complete, gated or required, and nothing
 * here makes one product a prerequisite for another: a person may build a
 * Passport without ever running Career Discovery, and may run Career
 * Discovery without ever building a Passport. */
type LifecycleKey = "discover" | "understand" | "grow" | "trust" | "work" | "continue";

const LIFECYCLE = [
  {
    key: "discover",
    icon: Compass,
    titleKey: "home.lifecycle.discover.title",
    bodyKey: "home.lifecycle.discover.body",
  },
  {
    key: "understand",
    icon: Lightbulb,
    titleKey: "home.lifecycle.understand.title",
    bodyKey: "home.lifecycle.understand.body",
  },
  {
    key: "grow",
    icon: TrendingUp,
    titleKey: "home.lifecycle.grow.title",
    bodyKey: "home.lifecycle.grow.body",
  },
  {
    key: "trust",
    icon: ShieldCheck,
    titleKey: "home.lifecycle.trust.title",
    bodyKey: "home.lifecycle.trust.body",
  },
  {
    key: "work",
    icon: Briefcase,
    titleKey: "home.lifecycle.work.title",
    bodyKey: "home.lifecycle.work.body",
  },
  {
    key: "continue",
    icon: GraduationCap,
    titleKey: "home.lifecycle.continue.title",
    bodyKey: "home.lifecycle.continue.body",
  },
] as const satisfies readonly {
  key: LifecycleKey;
  icon: typeof Compass;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}[];

/** Where each stage goes. EVERY destination is an existing canonical route:
 *  the four `/signup` entries carry a validated `?redirect=` rather than
 *  naming an authenticated route a signed-out reader cannot open, and
 *  "Trust" points at this page's own Passport section because the Passport
 *  has no public page and a nav item that lands on a login wall is a dead
 *  end wearing a product name. */
const LIFECYCLE_LINKS: Record<
  LifecycleKey,
  readonly {
    to: string;
    search?: Record<string, string>;
    hash?: string;
    labelKey: TranslationKey;
  }[]
> = {
  discover: [
    { to: CAREER_DISCOVERY, labelKey: "nav.careerDiscovery" },
    { to: "/career-center", labelKey: "nav.career_center" },
  ],
  understand: [{ to: CAREER_DISCOVERY, labelKey: "home.lifecycle.understand.link" }],
  grow: [{ to: "/signup", search: MY_CAREER_INTENT, labelKey: "home.lifecycle.grow.link" }],
  trust: [{ to: "/", hash: "passport", labelKey: "nav.passportPublic" }],
  work: [{ to: "/jobs", labelKey: "nav.jobs" }],
  continue: [{ to: "/signup", search: ACADEMY_INTENT, labelKey: "home.lifecycle.continue.link" }],
};

/* ── THE THREE TRUST LEVELS ────────────────────────────────────────────
 *
 * PR #189 settled what each level may claim, and this is still the only
 * surface OUTSIDE the signed-in product that states it:
 *
 *   Registrerat     the holder entered it
 *   Dokumenterat    CQrityjob reviewed the evidence the holder supplied.
 *                   A review is not the source, so it stops here.
 *   Källbekräftat   the source itself confirmed the fact — which today has
 *                   exactly one shape: an employer confirming an EMPLOYMENT
 *                   PERIOD through the authorised attestation path. No
 *                   credential can reach this level, and an employment
 *                   confirmation is not credential verification.
 *
 * An assessment result is none of these and can never become one: the
 * Passport receives no raw answer, prompt, scoring key or rubric, and there
 * is no overall Passport score for one to feed.
 *
 * ── AND COLOUR IS NOT WHAT CARRIES IT ────────────────────────────────
 *
 * The Passport's own rule (Product Architecture v1.1 §5.4, and
 * AssertionChip.tsx, from which these channels are taken rather than
 * invented) is that a weaker level must never be able to LOOK confirmed for
 * a reader who cannot see colour, in greyscale, or in a screenshot — and a
 * screenshot is exactly how a professional record travels. So each level
 * differs by its WORD, by its GLYPH (pencil, document, check) and by its
 * border treatment, before any colour is perceived.
 *
 * These are TRUST states. No lifecycle state — active, expired, revoked,
 * archived — appears here or is mixed into them. */
const TRUST_LEVELS = [
  {
    label: "home.trust.registered",
    glyph: PencilLine,
    pill: "border-dashed border-border",
    disc: "bg-muted-foreground/15 text-muted-foreground",
  },
  {
    label: "home.trust.documented",
    glyph: FileText,
    pill: "border-accent/30",
    disc: "bg-accent/12 text-accent",
  },
  {
    label: "home.trust.sourceConfirmed",
    glyph: CheckCircle2,
    pill: "border-emerald-600/35",
    disc: "bg-emerald-500/15 text-emerald-700",
  },
] as const satisfies readonly {
  label: TranslationKey;
  glyph: typeof PencilLine;
  pill: string;
  disc: string;
}[];

function TrustLevels() {
  const { t } = useT();
  return (
    <ul aria-label={t("home.trust.legend")} className="flex flex-col items-start gap-3">
      {TRUST_LEVELS.map(({ label, glyph: Glyph, pill, disc }) => (
        <li key={label}>
          <span
            className={cn(
              "inline-flex items-center gap-2.5 rounded-full border bg-background py-2 pl-2 pr-5 text-sm font-medium text-foreground shadow-[var(--shadow-xs)]",
              pill,
            )}
          >
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", disc)}>
              <Glyph className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            {t(label)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The navy band's own depth: a shield and a skyline, at the opacity of a
 *  watermark. Nothing in it is legible, and nothing needs to be. */
function EmployerBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute -right-10 bottom-0 hidden h-full w-[420px] text-primary-foreground/[0.07] md:block"
      viewBox="0 0 420 320"
      fill="none"
    >
      <path
        d="M300 24l86 30v92c0 62-42 104-86 122-44-18-86-60-86-122V54l86-30z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <g fill="currentColor">
        <rect x="20" y="200" width="58" height="120" />
        <rect x="90" y="164" width="46" height="156" />
        <rect x="148" y="228" width="52" height="92" />
        <rect x="212" y="252" width="44" height="68" />
      </g>
    </svg>
  );
}
