import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  Award,
  BarChart3,
  Briefcase,
  ChevronRight,
  CheckCircle2,
  FilePlus2,
  FileText,
  GraduationCap,
  MapPin,
  PencilLine,
  Share2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

/** ── WHERE "SKAPA DITT SECURITY PASSPORT" ACTUALLY GOES ────────────────
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
 *  an explicit, named first action ("live.startTitle" / "live.startBody" +
 *  a create control) inside the Passport's own product shell. The person
 *  who clicked "create my Passport" arrives at a page about creating their
 *  Passport. A dashboard would have been a shrug.
 *
 *  No new route, no second auth implementation, no weakening of the
 *  redirect allow-list — /passport is not an auth surface, so it passes
 *  safeReturnPath unchanged. */
const PASSPORT_INTENT = { redirect: "/passport" } as const;

/** The Career Analysis entry. It is the SUPPORTING tool and is offered once,
 *  from section 3, as a quiet control. Public and open: the page explains
 *  the 28 questions, needs no account, and stores answers in the tab until
 *  somebody chooses to keep the result. */
const CAREER_ANALYSIS = "/security-career-assessment";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CQrityjob — Din säkerhetskarriär. Samlad på ett ställe." },
      {
        name: "description",
        content:
          "Security Passport is your professional identity in security. Collect your experience, credentials, certificates and CV in one place, choose what employers see, and keep developing your career.",
      },
      { property: "og:title", content: "CQrityjob — Security Passport" },
      {
        property: "og:description",
        content:
          "Bring your experience, credentials, certificates and CV together in your Security Passport. Share the right information with employers and keep developing your career.",
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
            "Security Passport — a portable professional identity for a career in security.",
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
//   1. hero       Security Passport, and the one way to start one
//   2. how        Samla · Styrk · Dela, and what each level actually claims
//   3. passport   one record, four uses, and where guidance fits
//   4. employers  the one employer section, handing over to /employers
//
// It replaced eight sections, 437 words and 5,511 CSS pixels of a page that
// said the same few things repeatedly — three pillars, six account
// capabilities, two audience paths, six role cards, a career-test campaign
// and two separate employer sections — and still never said what CQrityjob
// is. Everything removed already exists, in more detail, on the page it
// belongs to: /career-center, /jobs, /employers.
//
// ── THE POSITIONING THIS FILE HOLDS ────────────────────────────────────
//
// Security Passport is the product. The Career Analysis is a SUPPORTING
// tool, offered once, from section 3, as a quiet control — it suggests what
// somebody could do next, and it measures and verifies nothing. The page
// used to lead with it, which sold a test instead of a professional
// identity.
//
// * ONE h1, exactly three h2, and ONE visually primary action:
//   "Skapa ditt Security Passport". Every other control on the page is
//   quieter than it, the employer one included.
// * CV, a shared profile, jobs and development are drawn AROUND the
//   Passport rather than listed beside it, because they are uses of one
//   record. A CV is an output, never a second source of truth.
// * The three trust levels are named and separated (see TRUST_LEVELS), and
//   only source-confirmed wears the green confirmation treatment.
// * Nothing on this page claims a credential is recognised, approved or
//   valid anywhere, or that the Passport replaces a licence, a work permit,
//   a background check or an employer's own due diligence.
// * The illustrations are DECORATION: aria-hidden, carrying no claim a
//   sentence beside them does not also make.

function Index() {
  const { t } = useT();
  const navigate = useNavigate();

  // Phase F.1 — authenticated visitors land on their personal dashboard.
  // Runs client-side only; SSR still serves the public landing page for
  // crawlers and signed-out users. Unchanged by the rebuild: this is the
  // ONLY redirect implementation on this route, it fires only on a real
  // session, and a session read that fails simply leaves the visitor here
  // rather than bouncing them into a loop.
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

  return (
    <SiteLayout>
      {/* ── 1 · HERO ───────────────────────────────────────────────────
          One proposition, one primary action, one quiet in-page link, and
          the two promises the product can keep today. No employer action,
          no feature list, no second heading.

          Depth is CSS only — two restrained radial washes and a faint
          vertical rule grid masked out before the fold. The headline steps
          through four sizes and is allowed to hyphenate (the document
          carries `lang`, so the browser breaks where Swedish permits),
          because at 320px a single 48px step broke it into ragged lines. */}
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
        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-12 sm:pt-14 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8 xl:gap-12">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 motion-reduce:animate-none">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("home.hero.eyebrow")}
            </p>
            <h1
              // `[hyphens:auto]` earns its keep only at 320-390px, where
              // "säkerhetskarriär" does not fit on any line. From `lg` the
              // column is wide enough for the sentence, so hyphenation is
              // turned off rather than left to split the compound in half.
              // No `text-balance` at desktop widths: it evened the three
              // lines out by stranding "Din" alone on the first one. The
              // headline is two sentences and wants to break between them.
              className="mt-5 max-w-[16ch] text-balance text-[2.1rem] font-semibold leading-[1.07] tracking-tight text-foreground [hyphens:auto] sm:text-[2.9rem] md:text-[3rem] lg:max-w-none lg:text-[2.85rem] lg:[hyphens:none] lg:[text-wrap:pretty] xl:text-[3.15rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.hero.title")}
            </h1>
            <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-muted-foreground md:text-[1.0625rem]">
              {t("home.hero.subtitle")}
            </p>
            {/* Full-width and stacked at phone widths: two side-by-side
                controls at 320px leave neither a comfortable target. The
                hierarchy is unmistakable at every width — one solid navy
                action, one quiet in-page link that opens no second path. */}
            <div className="mt-8 flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <PrimaryLink to="/signup" search={PASSPORT_INTENT} className="w-full sm:w-auto">
                {t("cta.passport")}
              </PrimaryLink>
              {/* A same-document anchor, not a router navigation: it must
                  move the reader down this page, not start a second
                  journey. Native anchor jumping also respects a reduced-
                  motion preference by construction — nothing animates. */}
              <a
                href="#how"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-accent transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {t("cta.howItWorks")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-7 flex items-center gap-2 text-xs font-medium text-foreground">
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-accent"
                strokeWidth={2}
                aria-hidden="true"
              />
              {t("home.hero.note")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("home.hero.portable")}
            </p>
          </div>

          {/* The Passport at the centre, and the four things it is FOR
              around it. The satellites are labels on a picture, not
              controls: they have no href, because "Jobb" here is an
              explanation of what the record is used for, not an offer to go
              somewhere, and a card that looks clickable and is not is worse
              than no card. */}
          <PassportComposition
            left={[
              { icon: FileText, titleKey: "home.mock.cv.title", bodyKey: "home.mock.cv.body" },
              {
                icon: Share2,
                titleKey: "home.mock.share.title",
                bodyKey: "home.mock.share.body",
              },
            ]}
            right={[
              { icon: Briefcase, titleKey: "home.mock.jobs.title", bodyKey: "home.mock.jobs.body" },
              {
                icon: BarChart3,
                titleKey: "home.mock.develop.title",
                bodyKey: "home.mock.develop.body",
              },
            ]}
            showEditAffordance
          />
        </div>
      </section>

      {/* ── 2 · SAMLA. STYRK. DELA. ────────────────────────────────────
          An ordered list, because it IS one, joined by a chevron rather
          than boxed into three competing feature cards. One sentence each,
          no buttons — the page already has its action.

          `scroll-mt` so the sticky header does not cover the heading when
          the hero's "Se hur det fungerar" lands here. */}
      <Section id="how" className="scroll-mt-24 py-16 md:py-28">
        <h2
          className="text-center text-[1.75rem] font-semibold tracking-tight text-foreground md:text-[2.25rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("home.how.title")}
        </h2>
        <ol className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-8 md:mt-12 md:grid-cols-3 md:gap-6">
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <li key={title} className="relative flex flex-col items-center text-center">
              {/* The join between the steps. Decorative: the ordered list
                  already carries the sequence for a screen reader, and this
                  would be a meaningless ">" if it did not. */}
              {i > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-4 top-5 hidden h-5 w-5 text-accent/45 md:block"
                  strokeWidth={2}
                />
              )}
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-accent">
                <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">
                <span className="tabular-nums">{i + 1}.</span> {t(title)}
              </h3>
              <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
                {t(desc)}
              </p>
            </li>
          ))}
        </ol>
        <TrustLevels />
      </Section>

      {/* ── 3 · ETT PASSPORT GENOM HELA KARRIÄREN ──────────────────────
          One record, four uses. The Career Analysis appears here and only
          here, as the quiet control at the end — guidance about a next
          step, offered after the product has said what it keeps. */}
      <Section id="passport" bordered className="scroll-mt-24 bg-secondary py-16 md:py-28">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] lg:gap-14">
          <PassportComposition
            className="hidden lg:flex"
            left={[
              {
                icon: FileText,
                titleKey: "home.passport.use.cv",
                bodyKey: "home.passport.use.cv.body",
              },
              {
                icon: Share2,
                titleKey: "home.passport.use.share",
                bodyKey: "home.passport.use.share.body",
              },
            ]}
            right={[
              {
                icon: Briefcase,
                titleKey: "home.passport.use.jobs",
                bodyKey: "home.passport.use.jobs.body",
              },
              {
                icon: BarChart3,
                titleKey: "home.passport.use.develop",
                bodyKey: "home.passport.use.develop.body",
              },
            ]}
          />
          <div>
            <h2
              className="text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("home.passport.title")}
            </h2>
            <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-muted-foreground md:text-base">
              {t("home.passport.body")}
            </p>
            {/* The one sentence that keeps the two products apart: a record
                of what happened, and guidance about what could happen next.
                It is the reason the Career Analysis can appear on this page
                without being read as a competence test. */}
            <p className="mt-6 flex items-start gap-3 rounded-lg border border-accent/20 bg-background/70 p-4 text-sm leading-relaxed text-foreground">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t("home.passport.callout")}
            </p>
            <div className="mt-7">
              <PrimaryLink to={CAREER_ANALYSIS} variant="ghost" className="w-full sm:w-auto">
                {t("home.passport.cta")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PrimaryLink>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 4 · FÖR ARBETSGIVARE ───────────────────────────────────────
          The ONLY employer section, and deliberately the quietest control
          on the page: an outlined button on navy, never a second solid
          action competing with the Passport. It says what the product
          supports and who decides — it does not say CQrityjob approves,
          rejects, ranks or selects anybody. Features and availability live
          on /employers. */}
      <Section
        id="employers"
        bordered
        className="relative overflow-hidden bg-primary py-16 text-primary-foreground md:py-24"
      >
        <EmployerBackdrop />
        <div className="relative max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
            {t("home.employers.eyebrow")}
          </p>
          {/* `text-primary-foreground` is not optional here and is not
              inherited: styles.css sets an explicit `color` on h1-h6 in
              @layer base, so a heading on the navy band renders navy-on-navy
              and disappears unless it names its own colour. */}
          <h2
            className="mt-3 text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-primary-foreground md:text-[2.1rem]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("home.employers.title")}
          </h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-primary-foreground/75 md:text-base">
            {t("home.employers.subtitle")}
          </p>
          <div className="mt-8">
            <PrimaryLink
              to="/employers"
              variant="ghost"
              className="w-full border-primary-foreground/35 bg-transparent text-primary-foreground hover:border-primary-foreground/70 hover:bg-primary-foreground/10 sm:w-auto"
            >
              {t("home.employers.cta")}
            </PrimaryLink>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}

const STEPS = [
  { icon: FilePlus2, title: "home.how.step1.title", desc: "home.how.step1.desc" },
  { icon: FileText, title: "home.how.step2.title", desc: "home.how.step2.desc" },
  { icon: Share2, title: "home.how.step3.title", desc: "home.how.step3.desc" },
] as const satisfies readonly {
  icon: typeof FileText;
  title: TranslationKey;
  desc: TranslationKey;
}[];

/* ── THE THREE TRUST LEVELS ────────────────────────────────────────────
 *
 * PR #189 settled what each level may claim, and this is the first surface
 * OUTSIDE the signed-in product to state it:
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
 * Only the third wears the green confirmation treatment. That is the whole
 * point of showing three chips rather than one: a page that summarised them
 * as "verifierade meriter" would undo the containment in four words.
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
    <ul
      aria-label={t("home.trust.legend")}
      className="mx-auto mt-8 grid max-w-5xl grid-cols-1 justify-items-center gap-3 sm:grid-cols-3 md:mt-10"
    >
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

/* ── DECORATION ────────────────────────────────────────────────────────
 *
 * Everything below is `aria-hidden` and carries no claim a sentence beside
 * it does not also make. The person, the place and the four counts are the
 * SHAPE of the interface, not anybody's record — which is why they are
 * ordinary and unremarkable rather than impressive.
 *
 * The four satellites are labels on a picture. They have no href on
 * purpose: "Jobb" here explains what the record is used for, and a card
 * that looks clickable and is not is worse than no card at all. The
 * composition uses flow layout rather than absolute positioning, so it
 * cannot overflow a narrow column, and the satellites simply drop away
 * below `lg` while the Passport itself stays. */

/** A label on the picture.
 *
 *  Both fields are TRANSLATION KEYS, and there is deliberately no raw-string
 *  variant: the previous shape allowed `title: "Delad profil"` and that is
 *  exactly how a Swedish product mock ended up rendering beside English
 *  prose. `aria-hidden` did not help and could not — it removes a subtree
 *  from the accessibility tree, not from the screen. Making the type refuse
 *  a bare string is what stops it happening again. */
type Satellite = {
  readonly icon: typeof FileText;
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
};

function PassportComposition({
  left,
  right,
  showEditAffordance = false,
  className,
}: {
  left: readonly Satellite[];
  right: readonly Satellite[];
  showEditAffordance?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none mx-auto flex w-full max-w-[600px] select-none items-center justify-center gap-2.5 xl:gap-4",
        className,
      )}
    >
      {/* Symmetric on purpose. Offsetting the two columns against each
          other read as a layout that had slipped rather than as depth. */}
      <SatelliteColumn items={left} />
      <PassportCardMock showEditAffordance={showEditAffordance} />
      <SatelliteColumn items={right} />
    </div>
  );
}

function SatelliteColumn({
  items,
  className,
}: {
  items: readonly Satellite[];
  className?: string;
}) {
  const { t } = useT();
  return (
    <div className={cn("hidden w-[132px] shrink-0 flex-col gap-3.5 lg:flex", className)}>
      {items.map(({ icon: Icon, titleKey, bodyKey }) => (
        <div
          key={titleKey}
          className="rounded-xl border border-border bg-background p-3 shadow-[var(--shadow-sm)]"
        >
          <Icon className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <p className="mt-2 text-[11px] font-semibold text-foreground">{t(titleKey)}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{t(bodyKey)}</p>
        </div>
      ))}
    </div>
  );
}

/** The invented holder in both illustrations. A NAME, so it is the one
 *  string in the composition that is not translated — and it is fictional,
 *  which matters because this repository is public. */
const MOCK_HOLDER = "Alex Karlsson";

/** The four categories a Passport holds, and the shape of the interface
 *  around them. Digits carry the counts; the labels are keys. */
const MOCK_CATEGORIES = [
  { icon: Briefcase, labelKey: "home.mock.cat.experience", count: "5" },
  { icon: GraduationCap, labelKey: "home.mock.cat.education", count: "3" },
  { icon: FileText, labelKey: "home.mock.cat.certificates", count: "4" },
  { icon: Award, labelKey: "home.mock.cat.merits", count: "8" },
] as const satisfies readonly {
  icon: typeof Award;
  labelKey: TranslationKey;
  count: string;
}[];

function PassportCardMock({ showEditAffordance }: { showEditAffordance: boolean }) {
  const { t } = useT();
  return (
    <div className="w-full max-w-[288px] shrink-0 rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow-lg)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
            <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            {/* The product's own name, which is a proper noun and the same
                in both languages -- and everything else, translated. */}
            <p className="truncate text-[13px] font-semibold text-foreground">Security Passport</p>
            <p className="truncate text-[10px] text-muted-foreground">{t("home.mock.subtitle")}</p>
          </div>
        </div>
        {showEditAffordance && (
          <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-[9px] font-medium text-accent sm:inline-flex">
            <PencilLine className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
            {t("home.mock.edit")}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2.5 border-t border-border pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
          <UserRound className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          {/* A person's name is not translated, and this one is invented --
              see MOCK_HOLDER. Everything beside it is. */}
          <p className="truncate text-[12px] font-semibold text-foreground">{MOCK_HOLDER}</p>
          <p className="truncate text-[10px] text-muted-foreground">{t("home.mock.role")}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
            {t("home.mock.location")}
          </p>
        </div>
      </div>

      {/* The four categories a Passport holds. No trust chips in here: a
          count is not a claim, and the three levels are stated in words one
          section below rather than implied by a tick beside a number. */}
      <ul className="mt-3 border-t border-border pt-1">
        {MOCK_CATEGORIES.map(({ icon: Icon, labelKey, count }) => (
          <li
            key={labelKey}
            className="flex items-center gap-2.5 border-b border-border/60 py-2.5 last:border-b-0"
          >
            <Icon className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
            <span className="flex-1 truncate text-[11.5px] text-foreground">{t(labelKey)}</span>
            {/* Digits, which need no translation. They are the shape of the
                interface, not anybody's record. */}
            <span className="text-[11.5px] font-semibold tabular-nums text-foreground">
              {count}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={2} />
          </li>
        ))}
      </ul>
    </div>
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
