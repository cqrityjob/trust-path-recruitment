// Homepage sections below the hero: what an individual gets done, the AI
// work tool, the employer flow, how to start, and the offer + FAQ.
//
// Every link targets an existing public route or the one validated
// `?redirect=` sign-up door. No prices, counts, people or claims are
// invented here; pricing is explicitly "not published yet".

import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  ClipboardCheck,
  Compass,
  FileSearch,
  FileText,
  Gavel,
  MessagesSquare,
  Radar,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

const H2 =
  "mt-3 text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";
const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function HomeValue() {
  const { t } = useT();
  return (
    <Section id="value" className="scroll-mt-24 py-16 md:py-24">
      <div className="max-w-2xl">
        <p className={EYEBROW}>{t("home.value.eyebrow")}</p>
        <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
          {t("home.value.title")}
        </h2>
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* The Passport leads, on its own navy surface. */}
        <article className="rounded-2xl bg-primary p-7 text-primary-foreground md:p-9">
          <ShieldCheck
            className="h-7 w-7 text-primary-foreground/80"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="mt-5 text-xl font-semibold text-primary-foreground md:text-2xl">
            {t("home.value.passport.title")}
          </h3>
          <p className="mt-3 max-w-[52ch] leading-relaxed text-primary-foreground/80">
            {t("home.value.passport.body")}
          </p>
          <Link
            to="/signup"
            search={{ redirect: "/passport" }}
            className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
          >
            {/* The approved action, the same words as the hero's: the value
                card used to say the superseded "Skapa ditt Security Passport". */}
            {t("cta.passport")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </article>
        <div className="grid gap-6">
          <article className="rounded-2xl border border-border bg-card p-6">
            <FileText className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              {t("home.value.cv.title")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("home.value.cv.body")}
            </p>
            <Link to="/jobs" className={LINK}>
              {t("home.value.cv.link")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
          <article className="rounded-2xl border border-border bg-card p-6">
            <Compass className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              {t("home.value.career.title")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("home.value.career.body")}
            </p>
            <Link to="/career-center" className={LINK}>
              {t("home.value.career.link")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        </div>
      </div>
    </Section>
  );
}

const AI_ROWS: { label: TranslationKey; body: TranslationKey; icon: typeof Radar }[] = [
  { label: "home.ai.task.label", body: "home.ai.task.body", icon: Radar },
  { label: "home.ai.input.label", body: "home.ai.input.body", icon: FileSearch },
  { label: "home.ai.output.label", body: "home.ai.output.body", icon: FileText },
  { label: "home.ai.review.label", body: "home.ai.review.body", icon: ClipboardCheck },
];

export function HomeAi() {
  const { t } = useT();
  return (
    <Section
      id="security-intelligence"
      bordered
      className="scroll-mt-24 bg-secondary py-16 md:py-24"
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
        <div>
          <p className={EYEBROW}>{t("home.ai.eyebrow")}</p>
          <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
            {t("home.ai.title")}
          </h2>
          <p className="mt-4 max-w-[50ch] leading-relaxed text-muted-foreground">
            {t("home.ai.body")}
          </p>
          <p className="mt-5 max-w-[50ch] border-l-2 border-accent pl-4 text-sm leading-relaxed text-foreground">
            {t("home.ai.note")}
          </p>
          <PrimaryLink
            to="/signup"
            search={{ redirect: "/security-work" }}
            variant="ghost"
            className="mt-7 w-full sm:w-auto"
          >
            {t("home.ai.cta")}
          </PrimaryLink>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          {AI_ROWS.map(({ label, body, icon: Icon }) => (
            <div key={label} className="bg-background p-6">
              <dt className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden="true" />
                {t(label)}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(body)}</dd>
            </div>
          ))}
        </dl>
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

/** The five-step employer flow, drawn on the navy employer band. */
export function EmployerFlow() {
  const { t } = useT();
  return (
    <ol
      aria-label={t("home.employers.flow.label")}
      className="relative mt-10 grid grid-cols-1 gap-3 sm:grid-cols-5"
    >
      {FLOW.map(({ key, icon: Icon }, i) => (
        <li
          key={key}
          className="flex items-center gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 px-4 py-3 sm:flex-col sm:items-start"
        >
          <Icon
            className="h-5 w-5 shrink-0 text-primary-foreground/80"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-primary-foreground">
            <span className="tabular-nums text-primary-foreground/60">{i + 1}.</span> {t(key)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function HomeStart() {
  const { t } = useT();
  const col = (title: TranslationKey, steps: TranslationKey[]) => (
    <div>
      <h3 className="text-base font-semibold text-foreground">{t(title)}</h3>
      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold tabular-nums text-accent">
              {i + 1}
            </span>
            <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{t(s)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <Section id="get-started" className="scroll-mt-24 py-16 md:py-24">
      <p className={EYEBROW}>{t("home.start.eyebrow")}</p>
      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        {t("home.start.title")}
      </h2>
      <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-16">
        {col("home.start.person", [
          "home.start.person.1",
          "home.start.person.2",
          "home.start.person.3",
        ])}
        {col("home.start.employer", [
          "home.start.employer.1",
          "home.start.employer.2",
          "home.start.employer.3",
        ])}
      </div>
    </Section>
  );
}

const FAQ: [TranslationKey, TranslationKey][] = [
  ["home.faq.q1", "home.faq.a1"],
  ["home.faq.q2", "home.faq.a2"],
  ["home.faq.q3", "home.faq.a3"],
  ["home.faq.q4", "home.faq.a4"],
  ["home.faq.q5", "home.faq.a5"],
];

export function HomeFaq() {
  const { t } = useT();
  return (
    <Section id="faq" bordered className="scroll-mt-24 py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div>
          <p className={EYEBROW}>{t("home.faq.eyebrow")}</p>
          <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
            {t("home.faq.title")}
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {t("home.faq.offer.person")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("home.faq.offer.employer")}
          </p>
          <Link to="/contact" className={LINK}>
            {t("home.faq.contact")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-1">
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
