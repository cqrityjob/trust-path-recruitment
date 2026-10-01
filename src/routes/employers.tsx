import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  ClipboardCheck,
  FileSignature,
  GraduationCap,
  Inbox,
  Info,
  MessagesSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

/** ── /employers — FOR EMPLOYERS (owner review, 2026-09-30) ────────────
 *
 *  Two ways of working, said at once and in this order:
 *
 *    A  the employer platform, used by the employer themselves, following
 *       ANNONSERA → TA EMOT OCH HANTERA → BEDÖM → INTERVJUA → BESLUTA;
 *    B  recruitment services, where CQrityjob helps: Rekrytering, Executive
 *       Search, Interim och konsulter.
 *
 *  The header's "För arbetsgivare" menu points at sections of THIS page:
 *  the page itself, #bedomning, #intervju, #rekrytering and #interim. The
 *  platform section keeps its long-standing id, #how-it-works, which is
 *  where "Så fungerar det" lands.
 *
 *  Each method comes AFTER the benefit it serves: a fair, structured
 *  assessment before TRUST and BESKT; a structured interview before
 *  Interview Intelligence.
 *
 *  ── THE ACTIONS, AND WHY THEY ARE THE SAME DOOR ──────────────────────
 *
 *  "Registrera företag" and "Logga in" are the SAME unified auth routes
 *  every other visitor uses, carrying /employer as a validated `?redirect=`.
 *  Neither grants anything: /employer resolves real organisation membership
 *  server-side on arrival. Signing up "as an employer" is an intent, never
 *  a role. Both are behind `employerPortalEnabled()`: a door onto a product
 *  that is not open is worse than no door. "Logga in" is a plain link, not
 *  a third button.
 *
 *  ── WHAT THIS PAGE MAY NOT CLAIM ─────────────────────────────────────
 *
 *  * that CQrityjob, a model or an assessment decides whether a candidate
 *    is suitable, or hires, rejects, ranks, scores or passes/fails anybody.
 *    Assessment output is decision support; a human makes and documents
 *    the decision;
 *  * that TRUST is scientifically validated, predicts performance or is
 *    free of bias. It is research-informed, and not validated as a whole;
 *  * that BESKT is a test, produces a result, predicts anything or replaces
 *    säkerhetsprövning. Release gate C (a published BESKT method) is NOT
 *    met in production, so the page says it is not available yet;
 *  * that interview AI is available — it is disabled in production;
 *  * that a candidate's career analysis is available to an employer. */

/** MVP text specification §14: the page's title and its ingress as the
 *  description. The head is the Swedish pair; useLocalizedHead() swaps in the
 *  English one on the client. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: SV["meta.employers.title"] },
      { name: "description", content: SV["employers.lead"] },
      { property: "og:title", content: SV["meta.employers.title"] },
      { property: "og:description", content: SV["employers.lead"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/employers" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/employers" }],
  }),
  component: EmployersPage,
});

/** The platform journey, in the order an employer walks it. FIVE numbered
 *  steps, ending in the human decision; developing the person hired is
 *  rendered below the list, as what follows — not as a sixth step, which
 *  would make the decision read as a waypoint. */
const PATH = [
  { icon: Send, titleKey: "employers.path.step1.title", bodyKey: "employers.path.step1.body" },
  { icon: Inbox, titleKey: "employers.path.step2.title", bodyKey: "employers.path.step2.body" },
  {
    icon: ClipboardCheck,
    titleKey: "employers.path.step3.title",
    bodyKey: "employers.path.step3.body",
  },
  {
    icon: MessagesSquare,
    titleKey: "employers.path.step4.title",
    bodyKey: "employers.path.step4.body",
  },
  {
    icon: FileSignature,
    titleKey: "employers.path.step5.title",
    bodyKey: "employers.path.step5.body",
  },
] as const satisfies readonly {
  icon: typeof Send;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}[];

const SERVICES = [
  { key: "recruitment", icon: Users, id: undefined },
  { key: "executive", icon: Award, id: undefined },
  { key: "interim", icon: Timer, id: "interim" },
] as const;

const DISPLAY = { fontFamily: "var(--font-display)" } as const;
const H2 =
  "text-balance text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";
const SECONDARY_BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const INLINE_LINK =
  "inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function EmployersPage() {
  const { t } = useT();
  useLocalizedHead("meta.employers.title", "employers.lead");
  const portalOpen = employerPortalEnabled();

  return (
    <SiteLayout>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <Section className="surface-dawn border-b border-border py-16 md:py-24">
        <div className="max-w-3xl">
          <p className={EYEBROW}>{t("nav.employers")}</p>
          <h1
            className="mt-3 text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-foreground [hyphens:auto] break-words sm:text-[2.9rem] md:text-[3.25rem] lg:[hyphens:none]"
            style={DISPLAY}
          >
            {t("employers.title")}
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("employers.lead")}
          </p>

          {/* Primary: register. Secondary: how it works — a same-page
              anchor, so it opens no second journey. An existing customer's
              way in is a plain link under them. */}
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {portalOpen && (
              <PrimaryLink to="/signup" search={{ redirect: "/employer" }}>
                {t("employers.cta.register")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PrimaryLink>
            )}
            <a href="#how-it-works" className={SECONDARY_BUTTON}>
              {t("employers.cta.how")}
            </a>
          </div>
          {portalOpen && (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("employers.cta.loginLead")}{" "}
              <Link
                to="/login"
                search={{ redirect: "/employer" } as never}
                data-employer-login
                className={INLINE_LINK}
              >
                {t("employers.cta.login")}
              </Link>
            </p>
          )}
        </div>
      </Section>

      {/* ── A · THE PLATFORM: THE JOURNEY ──────────────────────────────
          An ordered list, because it is one. `scroll-mt` so the sticky
          header does not cover the heading when "Så fungerar det" lands. */}
      <Section id="how-it-works" className="scroll-mt-24 py-16 md:py-24">
        <div className="max-w-2xl">
          <p className={EYEBROW}>{t("employers.platform.eyebrow")}</p>
          <h2 className={`mt-3 ${H2}`} style={DISPLAY}>
            {t("employers.path.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("employers.path.lead")}
          </p>
        </div>
        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
          {PATH.map(({ icon: Icon, titleKey, bodyKey }, i) => (
            <li
              key={titleKey}
              className="flex flex-col rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-foreground [hyphens:auto] break-words">
                {t(titleKey)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
            </li>
          ))}
        </ol>

        {/* What follows, visually separated from the five. */}
        <div className="mt-6 flex items-start gap-4 rounded-xl border border-border bg-secondary/40 p-5 md:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-accent">
            <GraduationCap className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={EYEBROW}>{t("employers.path.continuation")}</p>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground [hyphens:auto] break-words">
              {t("employers.path.step6.title")}
            </h3>
            <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
              {t("employers.path.step6.body")}
            </p>
          </div>
        </div>
      </Section>

      {/* ── BEDÖM: the benefit first, then TRUST and BESKT ──────────── */}
      <Section id="bedomning" bordered className="scroll-mt-24 bg-secondary/40 py-16 md:py-24">
        <div className="max-w-2xl">
          <p className={EYEBROW}>{t("employers.assessment.eyebrow")}</p>
          <h2 className={`mt-3 ${H2}`} style={DISPLAY}>
            {t("employers.assessment.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("employers.assessment.body")}
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          <article
            data-employer-method="trust"
            className="flex flex-col rounded-2xl border border-border bg-card p-6 md:p-7"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
              {t("employers.assessment.trust.title")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("employers.assessment.trust.body")}
            </p>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {t("employers.assessment.trust.availability")}
            </p>
          </article>
          <article
            data-employer-method="beskt"
            className="flex flex-col rounded-2xl border border-border bg-card p-6 md:p-7"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
              <ShieldAlert className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
              {t("employers.assessment.beskt.title")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("employers.assessment.beskt.body")}
            </p>
            <p
              data-beskt-availability
              className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {t("employers.assessment.beskt.availability")}
            </p>
          </article>
        </div>
        <p className="mt-6 max-w-3xl text-sm font-medium leading-relaxed text-foreground">
          {t("employers.assessment.principle")}
        </p>
      </Section>

      {/* ── INTERVJUA: the structured interview, then the tool ────────── */}
      <Section id="intervju" bordered className="scroll-mt-24 py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <p className={EYEBROW}>{t("employers.interview.eyebrow")}</p>
            <h2 className={`mt-3 ${H2}`} style={DISPLAY}>
              {t("employers.interview.title")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {t("employers.interview.body")}
            </p>
          </div>
          <article
            data-employer-method="interview-intelligence"
            className="rounded-2xl border border-border bg-card p-6 md:p-7"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
              <MessagesSquare className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
              {t("employers.interview.tool.title")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("employers.interview.tool.body")}
            </p>
          </article>
        </div>
      </Section>

      {/* ── B · RECRUITMENT SERVICES ──────────────────────────────────
          The two ways of working side by side: the platform yourselves,
          or CQrityjob helps. One working contact action. */}
      <Section id="rekrytering" bordered className="scroll-mt-24 bg-secondary/40 py-16 md:py-24">
        <div className="max-w-2xl">
          <p className={EYEBROW}>{t("employers.services.eyebrow")}</p>
          <h2 className={`mt-3 ${H2}`} style={DISPLAY}>
            {t("employers.services.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("employers.services.lead")}
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <article
            data-employer-way="self"
            className="flex flex-col rounded-2xl border border-border bg-card p-6 md:p-7"
          >
            <p className={EYEBROW}>A</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {t("employers.services.self.title")}
            </h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
              {t("employers.services.self.body")}
            </p>
            <div className="mt-6">
              {portalOpen ? (
                <PrimaryLink to="/signup" search={{ redirect: "/employer" }} variant="ghost">
                  {t("employers.cta.register")}
                </PrimaryLink>
              ) : (
                <a href="#how-it-works" className={SECONDARY_BUTTON}>
                  {t("employers.cta.how")}
                </a>
              )}
            </div>
          </article>
          <article
            data-employer-way="help"
            className="flex flex-col rounded-2xl border border-border bg-card p-6 md:p-7"
          >
            <p className={EYEBROW}>B</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {t("employers.services.help.title")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("employers.services.help.body")}
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {SERVICES.map(({ key, icon: Icon, id }) => (
                <li
                  key={key}
                  id={id}
                  className="scroll-mt-24 rounded-xl border border-border bg-background p-4"
                >
                  <Icon className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <h4 className="mt-3 text-sm font-semibold text-foreground">
                    {t(`employers.services.${key}.title` as TranslationKey)}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t(`employers.services.${key}.body` as TranslationKey)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <PrimaryLink to="/contact">
                {t("employers.services.cta")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PrimaryLink>
            </div>
          </article>
        </div>

        <p className="mt-12 flex items-start gap-3 rounded-md border border-border bg-background p-5 text-sm leading-relaxed text-muted-foreground">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {t("employers.disclaimer")}
        </p>
      </Section>
    </SiteLayout>
  );
}
