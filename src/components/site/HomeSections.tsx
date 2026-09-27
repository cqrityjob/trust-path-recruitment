// Homepage sections below the hero: what an individual gets done, the AI
// work tool, the employer flow, how to start, and pricing status + FAQ.
//
// Every link targets an existing public route or the one validated
// `?redirect=` sign-up door. No prices, counts, people or claims are
// invented here; pricing is explicitly "not published yet".
//
// ── HELD TO THE PAGE'S WORD CEILING ────────────────────────────────────
//
// The whole homepage stays under 340 words (public-homepage-check T15), so
// these sections carry a heading, a line and their links. What they may
// never lose to that budget: the employer flow ends in the employer's own
// decision, Security Intelligence says what must never go in and who owns
// the judgement, and the FAQ says that people, not AI, decide.

import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  ClipboardCheck,
  Compass,
  FileText,
  Gavel,
  Lock,
  MessagesSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

const H2 =
  "text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]";
const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
/** A card heading that is its own link: it takes the heading's size. */
const CARD_LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** What a person gets done, as three destinations. Each card's heading IS
 *  its link, so the section adds no copy the hero has already said. */
export function HomeValue() {
  const { t } = useT();
  return (
    <Section id="value" className="scroll-mt-24 py-16 md:py-20">
      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        {t("home.value.title")}
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {/* The Passport leads, on its own navy surface. */}
        <article className="rounded-2xl bg-primary p-6 text-primary-foreground">
          <ShieldCheck
            className="h-6 w-6 text-primary-foreground/80"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="mt-4 text-lg font-semibold text-primary-foreground">
            <Link
              to="/signup"
              search={{ redirect: "/passport" }}
              className="inline-flex min-h-11 items-center gap-1.5 text-primary-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
            >
              {t("cta.passport")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </h3>
        </article>
        <article className="rounded-2xl border border-border bg-card p-6">
          <FileText className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden="true" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            <Link to="/jobs" className={CARD_LINK}>
              {t("home.value.cv.link")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </h3>
        </article>
        <article className="rounded-2xl border border-border bg-card p-6">
          <Compass className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden="true" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            <Link to="/career-center" className={CARD_LINK}>
              {t("home.value.career.link")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </h3>
        </article>
      </div>
    </Section>
  );
}

export function HomeAi() {
  const { t } = useT();
  return (
    <Section
      id="security-intelligence"
      bordered
      className="scroll-mt-24 bg-secondary py-16 md:py-20"
    >
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-14">
        <div>
          <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
            {t("home.ai.title")}
          </h2>
          <p className="mt-4 max-w-[50ch] leading-relaxed text-muted-foreground">
            {t("home.ai.body")}
          </p>
          <PrimaryLink
            to="/signup"
            search={{ redirect: "/security-work" }}
            variant="ghost"
            className="mt-6 w-full sm:w-auto"
          >
            {t("home.ai.cta")}
          </PrimaryLink>
        </div>
        {/* What must never go in, and what never leaves: said beside the
            action rather than after it. */}
        <p className="flex items-start gap-3 rounded-lg border border-border bg-background p-5 text-sm leading-relaxed text-foreground">
          <Lock
            className="mt-0.5 h-5 w-5 shrink-0 text-accent"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {t("home.ai.note")}
        </p>
      </div>
    </Section>
  );
}

const FLOW: { key: TranslationKey; icon: typeof Briefcase }[] = [
  { key: "home.employers.flow.jobs", icon: Briefcase },
  { key: "home.employers.flow.applications", icon: Users },
  { key: "home.employers.flow.tests", icon: ClipboardCheck },
  { key: "home.employers.flow.interview", icon: MessagesSquare },
  { key: "home.employers.flow.decision", icon: Gavel },
];

/** The five-step employer flow, drawn on the navy employer band. The order
 *  is the list's own, and the last step is always the employer's decision. */
export function EmployerFlow() {
  const { t } = useT();
  return (
    <ol
      aria-label={t("home.employers.flow.label")}
      className="relative mt-10 grid grid-cols-1 gap-3 sm:grid-cols-5"
    >
      {FLOW.map(({ key, icon: Icon }) => (
        <li
          key={key}
          className="flex items-center gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 px-4 py-3 sm:flex-col sm:items-start"
        >
          <Icon
            className="h-5 w-5 shrink-0 text-primary-foreground/80"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-primary-foreground">{t(key)}</span>
        </li>
      ))}
    </ol>
  );
}

const STEPS: TranslationKey[] = ["home.start.step.1", "home.start.step.2", "home.start.step.3"];

export function HomeStart() {
  const { t } = useT();
  return (
    <Section id="get-started" className="scroll-mt-24 py-16 md:py-20">
      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        {t("home.start.title")}
      </h2>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-4 rounded-xl border border-border p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold tabular-nums text-accent">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-foreground">{t(s)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const FAQ: [TranslationKey, TranslationKey][] = [["home.faq.ai.question", "home.faq.ai.answer"]];

export function HomeFaq() {
  const { t } = useT();
  return (
    <Section id="faq" bordered className="scroll-mt-24 py-16 md:py-20">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div>
          <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
            {t("home.faq.title")}
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {t("home.faq.pricing")}
          </p>
          <Link to="/contact" className={LINK}>
            {t("home.faq.contact")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {/* Open by default: who decides is the one answer this page may not
            leave behind a click. */}
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} open className="group py-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                {t(q)}
                <span
                  aria-hidden="true"
                  className="text-xl text-accent transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-4 pr-8 text-sm leading-relaxed text-muted-foreground">{t(a)}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
