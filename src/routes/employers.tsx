import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ClipboardCheck,
  FileSignature,
  GraduationCap,
  Inbox,
  Info,
  ShieldAlert,
  ShieldCheck,
  Send,
  Users,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

/** ── /employers — THE WHOLE PLATFORM, NOT FOUR ABSTRACT BENEFITS ───────
 *
 *  This page used to be four benefit tiles — "Rekrytering", "Kandidat-
 *  bedömning", "Kompetenstest", "Kompetensverifiering" — with nothing
 *  saying how any of them connect. An employer deciding whether CQrityjob
 *  is for them was asked to assemble the product themselves out of four
 *  nouns.
 *
 *  What it says now is the thing they are actually being offered: ONE
 *  CONNECTED PROCESS. Publish a job → receive and organise applications →
 *  choose the assessment and interview workflow the role needs → review
 *  structured evidence with the hiring team → make and DOCUMENT the human
 *  decision → continue with development. Then two worked examples, because
 *  "ordinary security role" and "security-protection-sensitive position"
 *  are genuinely different paths through the same platform.
 *
 *  ── THE THREE ACTIONS, AND WHY THEY ARE THE SAME DOOR ────────────────
 *
 *  Register a company, see how the platform works, log in to the employer
 *  portal. The first and third are the SAME unified auth routes every other
 *  visitor uses, carrying /employer as a validated `?redirect=`. Neither
 *  grants anything: /employer resolves real organisation membership
 *  server-side on arrival and sends a person with none to onboarding, one
 *  with a pending organisation to the review state. Signing up "as an
 *  employer" is an intent, never a role (unified-account ADR, decision 7).
 *
 *  All three are behind `employerPortalEnabled()`, for the same reason the
 *  header is: a door onto a product that is not open is worse than no door.
 *
 *  ── WHAT THIS PAGE MAY NOT CLAIM ─────────────────────────────────────
 *
 *  * that CQrityjob, a model or an assessment decides whether a candidate
 *    is suitable, or hires, rejects, ranks or scores anybody. Assessment
 *    output is decision support; a human makes and documents the decision
 *    (adr-security-competency-product-separation.md, decision 7);
 *  * that BESKT is a test, produces a result, or replaces säkerhetsprövning
 *    under the Protective Security Act. It is a governed METHOD, it gives
 *    no score and no ranking, and it is reachable only under an explicit,
 *    time-boxed pilot grant — so the example says it is under development
 *    rather than presenting it as available;
 *  * that a candidate's Career Discovery data is available to an employer.
 *    It is candidate-owned, it never enters employer ranking, and this page
 *    therefore does not offer it at all. */

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: "For Employers — CQrityjob" },
      {
        name: "description",
        content:
          "Publish security jobs, manage applications and use structured assessments and interview models for ordinary security roles and security-protection-sensitive positions. People make and document every decision.",
      },
      { property: "og:title", content: "For Employers — CQrityjob" },
      {
        property: "og:description",
        content:
          "The complete security recruitment process in one platform: job posting, applications, structured assessment and interview, and a documented human decision.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/employers" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/employers" }],
  }),
  component: EmployersPage,
});

/** The connected path, in the order an employer actually walks it.
 *
 *  FIVE numbered outcomes, and the fifth is the one the page exists to make
 *  unmistakable: a person decides, and the decision is written down. The
 *  sixth thing an employer does — develop the person they hired — is
 *  rendered BELOW this list rather than inside it, because §8.3 of the
 *  Platform Entry Specification separates them and because a decision
 *  presented as step five of six reads as a waypoint rather than as the
 *  outcome of the process. */
const PATH = [
  { icon: Send, titleKey: "employers.path.step1.title", bodyKey: "employers.path.step1.body" },
  { icon: Inbox, titleKey: "employers.path.step2.title", bodyKey: "employers.path.step2.body" },
  {
    icon: ClipboardCheck,
    titleKey: "employers.path.step3.title",
    bodyKey: "employers.path.step3.body",
  },
  { icon: Users, titleKey: "employers.path.step4.title", bodyKey: "employers.path.step4.body" },
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

function EmployersPage() {
  const { t } = useT();
  const portalOpen = employerPortalEnabled();

  return (
    <SiteLayout>
      <Section className="py-16 md:py-24">
        <div className="max-w-3xl">
          <h1
            className="text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-foreground [hyphens:auto] break-words sm:text-[2.9rem] md:text-[3.25rem] lg:[hyphens:none]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("employers.title")}
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("employers.lead")}
          </p>

          {/* Primary: register. Secondary: see how it works — a same-page
              anchor, so it opens no second journey. Existing customer: the
              employer portal, through the one door with /employer as its
              validated return destination. */}
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {portalOpen ? (
              <>
                <PrimaryLink to="/signup" search={{ redirect: "/employer" }}>
                  {t("employers.cta.register")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </PrimaryLink>
                <a
                  href="#how-it-works"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {t("employers.cta.how")}
                </a>
                <PrimaryLink to="/login" search={{ redirect: "/employer" }} variant="ghost">
                  {t("employers.cta.login")}
                </PrimaryLink>
              </>
            ) : (
              <a
                href="#how-it-works"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {t("employers.cta.how")}
              </a>
            )}
          </div>
        </div>
      </Section>

      {/* ── THE CONNECTED PATH ───────────────────────────────────────────
          An ordered list, because it is one. `scroll-mt` so the sticky
          header does not cover the heading when "See how the platform
          works" lands here. */}
      <Section id="how-it-works" bordered className="scroll-mt-24 bg-secondary py-16 md:py-24">
        <h2
          className="text-[1.6rem] font-semibold tracking-tight text-foreground md:text-[2.1rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("employers.path.title")}
        </h2>
        <ol className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {PATH.map(({ icon: Icon, titleKey, bodyKey }, i) => (
            <li key={titleKey} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-foreground [hyphens:auto] break-words">
                  <span className="tabular-nums text-muted-foreground">{i + 1}.</span> {t(titleKey)}
                </h3>
                <p className="mt-1.5 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
                  {t(bodyKey)}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* The continuation, visually separated from the five. Same visual
            language, deliberately not a numbered peer. */}
        <div className="mt-10 flex items-start gap-4 rounded-xl border border-border bg-background p-5 md:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
            <GraduationCap className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("employers.path.continuation")}
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground [hyphens:auto] break-words">
              {t("employers.path.step6.title")}
            </h3>
            <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
              {t("employers.path.step6.body")}
            </p>
          </div>
        </div>
      </Section>

      {/* ── TWO RECRUITMENT EXAMPLES ─────────────────────────────────────
          The same platform, two genuinely different paths through it. The
          second carries BESKT, and carries its boundary with it: a method,
          no result, no score, no ranking, not säkerhetsprövning, and not
          yet open — stated in the example rather than in a footnote nobody
          reads. */}
      <Section id="examples" bordered className="py-16 md:py-24">
        <h2
          className="text-[1.6rem] font-semibold tracking-tight text-foreground md:text-[2.1rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("employers.examples.title")}
        </h2>
        <div className="mt-10 grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 md:gap-6">
          <article className="flex h-full flex-col rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow-sm)] md:p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
              <ShieldCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground [hyphens:auto] break-words">
              {t("employers.example.ordinary.title")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("employers.example.ordinary.body")}
            </p>
          </article>

          <article className="flex h-full flex-col rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow-sm)] md:p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
              <ShieldAlert className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground [hyphens:auto] break-words">
              {t("employers.example.protective.title")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("employers.example.protective.body")}
            </p>
            {/* Two separate sentences on purpose: what BESKT is NOT, and
                that it is not open yet. Collapsing them would let a reader
                take the availability caveat as the whole of the caution. */}
            <p className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
              {t("employers.example.protective.note")}
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info
                className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t("employers.example.protective.availability")}
            </p>
          </article>
        </div>

        <p className="mt-12 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm leading-relaxed text-muted-foreground">
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
