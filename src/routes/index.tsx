import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, FileText, MapPin, PencilLine, ShieldCheck } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { PUBLIC_MARKET_SCALE } from "@/components/site/passport-market-scale";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { HomePassportPreview } from "@/components/site/HomePassportPreview";
import {
  CoreCards,
  EmployerFlow,
  HomeAi,
  HomeCareer,
  HomeFaq,
  HomeStart,
} from "@/components/site/HomeSections";
import type { TranslationKey } from "@/i18n/dictionaries";

/** ── THE PUBLIC ENTRY ARCHITECTURE (MVP text specification, 2026-09-27) ─
 *
 *  CQrityjob presents THREE EQUAL CORE PARTS to a person:
 *
 *    * Mitt säkerhetsarbete -- the workspace and AI support for security,
 *      risk and preparedness evidence (CQrityjob Intelligence);
 *    * Security Passport -- credentials with a clear source and status,
 *      shared only by the holder's choice;
 *    * Karriär och jobb -- professions, the career analysis, profile, CV and
 *      vacancies;
 *
 *  and ONE separate entrance to an employer, for recruitment and learning
 *  and development. The headline "Din karriär och ditt säkerhetsarbete. På
 *  samma plats." stays.
 *
 *  This SUPERSEDES the two-peer-entrance page (Security Passport and Career
 *  Discovery as the only two individual entrances, the Passport as the dark
 *  product anchor of the hero). The rendered page and every comment that
 *  encoded that rule are replaced here.
 *
 *  ── WHAT "EQUAL" MEANS IN THIS FILE, CONCRETELY ──────────────────────
 *
 *  The three core cards are one grid with one set of classes, one heading
 *  size and one button style (CoreCards), so none can drift into being the
 *  larger one, and there is no large Passport visual in the hero that would
 *  make the other two subordinate. The illustrative Passport card lives in
 *  the Passport section, where it explains the product.
 *
 *  ── AND THEY ARE NOT ONE DATA PRODUCT ────────────────────────────────
 *
 *  The career analysis gives guidance and never measures competence; the
 *  Passport holds a RECORD and receives no assessment answer; security work
 *  is not shared with the career profile, the Passport or an employer.
 *  Neither part is a prerequisite for another and nothing on this page
 *  implies one is. See docs/architecture/adr-career-discovery-construct-
 *  model.md and adr-security-competency-product-separation.md.
 */

/** ── WHERE THE ACCOUNT ACTIONS ACTUALLY GO ─────────────────────────────
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
 *  "Skapa mitt Security Passport" lands on /passport, deliberately NOT on
 *  /my-career: a brand-new account has no Passport row, and /passport
 *  answers that with an explicit, named first action inside the Passport's
 *  own product shell.
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

/** The hero's "Skapa konto" creates an account that lands in My Career.
 *  Same validated mechanism, same one door, different landing. */
const MY_CAREER_INTENT = { redirect: "/my-career" } as const;

/** The server renders the Swedish page, so the indexed <head> is the Swedish
 *  one; useLocalizedHead() swaps in the English pair on the client. Read from
 *  the dictionary so the visible page and its metadata cannot describe two
 *  different offers. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: SV["meta.home.title"] },
      { name: "description", content: SV["meta.home.description"] },
      { property: "og:title", content: SV["meta.home.title"] },
      { property: "og:description", content: SV["meta.home.description"] },
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
          description: SV["brand.description"],
          url: "https://www.cqrityjob.com",
        }),
      },
    ],
  }),
  component: Index,
});

// ── THE PUBLIC HOMEPAGE ────────────────────────────────────────────────
//
// SEVEN sections, in the order the MVP text specification sets (§5), and
// nothing else:
//
//   1. hero                   the headline, one account action, the way back
//                             in, the employer link, and the THREE core cards
//   2. security-intelligence  the workspace in depth: task, evidence,
//                             results, review, availability, what never goes
//                             in, and three examples within existing methods
//   3. passport               the Passport in depth: what it holds, the
//                             illustrative card, the three markets, the three
//                             trust levels and what it is explicitly NOT
//   4. career                 professions, the career analysis (following
//                             its access status), profile, CV and jobs
//   5. employers              the employer band, visually separate,
//                             flag-gated, ending in the human decision
//   6. get-started            three steps each for a person and an employer
//   7. faq                    the offer, pricing status and six questions
//
// Every section has its own word budget (public-homepage-check T15). A
// section grows only by raising its own line there, in a diff somebody
// reads.
//
// ── WHAT THIS PAGE MAY NOT SAY ─────────────────────────────────────────
//
// * that the career analysis measures competence, or is a test, a career
//   test or an exam. It gives guidance;
// * that a career analysis result reaches an employer, or ranks anybody.
//   That data is the candidate's;
// * that the Passport holds an assessment answer, prompt, scoring key,
//   rubric or result, or that any of those is a credential;
// * that there is an overall Passport or candidate score;
// * that CQrityjob or a model decides suitability, hires, rejects, or
//   infers credibility, deception, personality or a protected trait;
// * that a click activates AI, or that AI or document processing is
//   available everywhere -- availability is the workspace's to show;
// * that the Passport is recognised, approved or valid anywhere, or that
//   it replaces a licence, security vetting, the right to work or an
//   employer's own checks. The one sentence on that subject is the
//   owner-approved disclaimer, rendered verbatim;
// * a price, or that anything is free.
//
// Humans make and document every employment and personnel-security
// decision, and the page says so where an employer reads it.

function Index() {
  const { t } = useT();
  const navigate = useNavigate();
  useLocalizedHead("meta.home.title", "meta.home.description");
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
  // off, the band explains the platform and offers the information page,
  // and no registration action is drawn at all.
  const employerOpen = employerPortalEnabled();

  return (
    <SiteLayout>
      {/* ── 1 · HERO: THE HEADLINE AND THE THREE CORE PARTS ─────────────
          One h1, one sentence, one account action, the way back in for a
          returning user and the employer link -- then the three core cards
          inside the same first content group, so a reader meets all three
          parts before scrolling.

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
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-14 pt-10 sm:pt-12 md:px-8 md:pb-16">
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-700 motion-reduce:animate-none">
            {/* `[hyphens:auto]` earns its keep at 320-390px, where a Swedish
                compound does not fit on any line; the document carries
                `lang`, so the browser breaks where Swedish permits. */}
            <h1
              className="max-w-[26ch] text-balance text-[2.15rem] font-semibold leading-[1.06] tracking-tight text-foreground [hyphens:auto] sm:text-[3rem] lg:text-[3.35rem] lg:[hyphens:none] lg:[text-wrap:pretty]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.hero.title")}
            </h1>
            <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-muted-foreground md:text-[1.0625rem]">
              {t("home.hero.subtitle")}
            </p>
            {/* One account action, then the way back in and the employer
                link -- on one row from sm up, so the three core parts below
                stay within the first screen. */}
            <div className="mt-7 flex flex-col gap-x-6 gap-y-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
              <PrimaryLink to="/signup" search={MY_CAREER_INTENT} className="w-full sm:w-auto">
                {t("nav.createAccount")}
              </PrimaryLink>
              <p>
                {t("home.account.returning")}{" "}
                <Link to="/login" className={INLINE_LINK}>
                  {t("nav.signin")}
                </Link>
                .
              </p>
              <p>
                {t("home.cta.employersLead")}{" "}
                <Link to="/employers" className={INLINE_LINK}>
                  {t("home.cta.employers")}
                </Link>
                .
              </p>
            </div>
          </div>

          <CoreCards className="mt-8" />
        </div>
      </section>

      {/* ── 2 · SECURITY INTELLIGENCE ─────────────────────────────────── */}
      <HomeAi />

      {/* ── 3 · SECURITY PASSPORT: WHAT IT HOLDS, AND WHAT IT IS NOT ────
          The markets are read from PUBLIC_MARKET_SCALE, which carries the
          governed market-pack codes and no credential, no entitlement and
          no holder. The illustrative card is fictional and says so; nothing
          in this section is a record about anybody. The one action is an
          outlined control through the one door: every Passport route is
          authenticated. */}
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
              {t("home.passport.title")}
            </h2>
            <p className="mt-4 max-w-[56ch] text-[0.9375rem] leading-relaxed text-muted-foreground md:text-base">
              {t("home.passport.body")}
            </p>
            <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-foreground">
              {t("home.passport.sharing")}
            </p>
            <PrimaryLink
              to="/signup"
              search={PASSPORT_INTENT}
              variant="ghost"
              className="mt-6 w-full sm:w-auto"
            >
              {t("cta.passport")}
            </PrimaryLink>
            <div className="mt-8">
              <TrustLevels />
            </div>
            {/* The owner-approved disclaimer, verbatim and in full. It is
                the sentence that keeps the product out of territory it has
                no authority in — CQrityjob issues nothing, vets nobody and
                decides nobody's right to work. */}
            <p className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-background/70 p-4 text-sm leading-relaxed text-foreground">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t("home.markets.disclaimer")}
            </p>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {t("home.markets.body")}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2.5">
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
          <div className="mx-auto w-full max-w-md lg:sticky lg:top-32 lg:max-w-none">
            <HomePassportPreview />
          </div>
        </div>
      </Section>

      {/* ── 4 · CAREER, CV AND JOBS ───────────────────────────────────── */}
      <HomeCareer />

      {/* ── 5 · THE EMPLOYER BAND ────────────────────────────────────────
          Visually separate from the three core parts — its own navy band —
          because an employer is a different reader, not a fourth individual
          product.

          Gated by the release flag. With the portal off there is no
          registration action at all: the band says what the platform does
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
            <PrimaryLink
              to="/employers"
              variant="ghost"
              className="w-full border-primary-foreground/35 bg-transparent text-primary-foreground hover:border-primary-foreground/70 hover:bg-primary-foreground/10 sm:w-auto"
            >
              {t("home.employers.cta.explore")}
            </PrimaryLink>
            {employerOpen && (
              <PrimaryLink
                to="/signup"
                search={EMPLOYER_INTENT}
                className="w-full border border-primary-foreground bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
              >
                {t("home.employers.cta.register")}
              </PrimaryLink>
            )}
          </div>
        </div>
        <div className="relative">
          <EmployerFlow />
        </div>
      </Section>

      {/* ── 6 · GET STARTED, 7 · FAQ ──────────────────────────────────── */}
      <HomeStart />
      <HomeFaq />
    </SiteLayout>
  );
}

/** A link inside a sentence, still a 44px target. */
const INLINE_LINK =
  "inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
