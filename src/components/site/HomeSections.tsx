// Homepage sections: the three core cards, the security work section, the
// career section, the employer flow, how to start, and the offer + FAQ.
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
  GraduationCap,
  MessagesSquare,
  Radar,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useSignedIn } from "@/hooks/useSignedIn";
import { useCareerAnalysisOpen } from "@/components/career-discovery/use-career-analysis-open";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";
import { cn } from "@/lib/utils";

const H2 =
  "mt-3 text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";
const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Career Discovery's canonical public entry, taken from the module that
 *  owns it rather than typed out again — the temporary /discovery alias
 *  redirects here and may never be linked in its place. */
const CAREER_DISCOVERY = CANONICAL_ASSESSMENT_PATH;

/** The career catalogue, opened: the Career Center's own explorer anchor
 *  and its `all` flag, which the page already reads from the URL. */
const CATALOGUE = { to: "/career-center", search: { all: true }, hash: "utforska-yrken" } as const;

// ── THE THREE CORE CARDS ───────────────────────────────────────────────
//
// Security work, Security Passport, career and jobs: three EQUAL parts. One
// list, one card class, one heading size and one outlined button each, so
// none of the three can drift into being the larger one. They render in the
// hero's first content group and again on /about, from this one definition.
//
// Each button explains before it asks: for a signed-out reader it leads to
// the part's own section on the homepage. A signed-in reader is sent from
// the homepage to their workspace (src/routes/index.tsx), so for them the
// button opens the part itself. Presentation only — every destination
// re-verifies its own access server-side.
const CORE = [
  {
    key: "work",
    icon: Radar,
    title: "home.core.work.title",
    body: "home.core.work.body",
    cta: "home.core.work.cta",
  },
  {
    key: "passport",
    icon: ShieldCheck,
    title: "home.core.passport.title",
    body: "home.core.passport.body",
    cta: "home.core.passport.cta",
  },
  {
    key: "career",
    icon: Compass,
    title: "home.core.career.title",
    body: "home.core.career.body",
    cta: "home.core.career.cta",
  },
] as const satisfies readonly {
  key: string;
  icon: typeof Radar;
  title: TranslationKey;
  body: TranslationKey;
  cta: TranslationKey;
}[];

const CORE_BUTTON = "w-full gap-2 sm:w-auto";

export function CoreCards({
  heading: Heading = "h2",
  className,
}: {
  /** h2 in the homepage hero, h3 under a section heading on /about. */
  heading?: "h2" | "h3";
  className?: string;
}) {
  const { t } = useT();
  const signedIn = useSignedIn();
  const analysisOpen = useCareerAnalysisOpen(signedIn);
  const inside = signedIn === true;

  return (
    // Stacked on phones and tablets, one even row from desktop width: three
    // columns narrower than that squeeze the buttons' own words.
    <ul className={cn("grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5", className)}>
      {CORE.map(({ key, icon: Icon, title, body, cta }) => (
        <li key={key} className="flex">
          <article
            data-home-core={key}
            className="flex w-full flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-xs)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-accent">
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <Heading className="mt-4 text-lg font-semibold leading-snug text-foreground">
              {t(title)}
            </Heading>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(body)}</p>

            {key === "career" && (
              <>
                {/* The career card's own two ways on: the vacancies, and —
                    while it is open — the career analysis, which keeps a
                    direct action here rather than a seventh header entry. */}
                <ul className="mt-2 flex flex-wrap gap-x-5">
                  <li>
                    <Link to="/jobs" className={LINK}>
                      {t("home.core.career.jobs")}{" "}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                  {analysisOpen !== false && (
                    <li>
                      <Link to={CAREER_DISCOVERY} className={LINK}>
                        {t("home.career.analysis")}{" "}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </li>
                  )}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t("home.core.career.note")}
                </p>
              </>
            )}

            <div className="mt-auto pt-6">
              {key === "work" ? (
                inside ? (
                  <PrimaryLink to="/security-work" variant="ghost" className={CORE_BUTTON}>
                    {t(cta)}
                  </PrimaryLink>
                ) : (
                  <PrimaryLink
                    to="/"
                    hash="security-intelligence"
                    variant="ghost"
                    className={CORE_BUTTON}
                  >
                    {t(cta)}
                  </PrimaryLink>
                )
              ) : key === "passport" ? (
                inside ? (
                  <PrimaryLink to="/passport" variant="ghost" className={CORE_BUTTON}>
                    {t(cta)}
                  </PrimaryLink>
                ) : (
                  <PrimaryLink to="/" hash="passport" variant="ghost" className={CORE_BUTTON}>
                    {t(cta)}
                  </PrimaryLink>
                )
              ) : (
                <PrimaryLink
                  to={CATALOGUE.to}
                  search={CATALOGUE.search}
                  hash={CATALOGUE.hash}
                  variant="ghost"
                  className={CORE_BUTTON}
                >
                  {t(cta)}
                </PrimaryLink>
              )}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

// ── SECURITY INTELLIGENCE, IN DEPTH ─────────────────────────────────────
//
// Task, evidence, results and the person's own review; whether AI and
// document processing are available is the workspace's to show, and this
// section says so rather than implying a click turns anything on. Three
// examples within the EXISTING methods (monitoring, rsa, the security
// assessment) — not agents and not new products; they create nothing.
const AI_ROWS: { label: TranslationKey; body: TranslationKey; icon: typeof Radar }[] = [
  { label: "home.ai.task.label", body: "home.ai.task.body", icon: Radar },
  { label: "home.ai.input.label", body: "home.ai.input.body", icon: FileSearch },
  { label: "home.ai.output.label", body: "home.ai.output.body", icon: FileText },
  { label: "home.ai.review.label", body: "home.ai.review.body", icon: ClipboardCheck },
];

const AI_EXAMPLES: { title: TranslationKey; body: TranslationKey }[] = [
  { title: "home.ai.examples.monitoring.title", body: "home.ai.examples.monitoring.body" },
  { title: "home.ai.examples.risk.title", body: "home.ai.examples.risk.body" },
  { title: "home.ai.examples.preparedness.title", body: "home.ai.examples.preparedness.body" },
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
          <p className="mt-4 max-w-[52ch] leading-relaxed text-muted-foreground">
            {t("home.ai.body")}
          </p>
          <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            {t("home.ai.availability")}
          </p>
          <p className="mt-5 max-w-[52ch] border-l-2 border-accent pl-4 text-sm leading-relaxed text-foreground">
            {t("home.ai.note")}
          </p>
          {/* The workspace is a signed-in account context, reached through
              the one door with its validated destination. A signed-in
              reader never sees this section: / sends them to their own
              workspace. */}
          <PrimaryLink
            to="/signup"
            search={{ redirect: "/security-work" }}
            variant="ghost"
            className="mt-7 w-full sm:w-auto"
          >
            {t("home.ai.cta")}
          </PrimaryLink>
        </div>
        <dl className="grid content-start gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
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
      <ul aria-label={t("home.ai.examples.label")} className="mt-10 grid gap-4 md:grid-cols-3">
        {AI_EXAMPLES.map(({ title, body }) => (
          <li key={title} className="rounded-xl border border-border bg-background p-5">
            <h3 className="text-base font-semibold text-foreground">{t(title)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(body)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── CAREER, CV AND JOBS, IN DEPTH ───────────────────────────────────────
//
// The analysis action follows the analysis's existing access status. While
// the answer is unknown the action stays (the canonical route shows its own
// honest state); a definite "not open" replaces it with the exact sentence
// the specification sets, and professions and jobs remain one click away.
export function HomeCareer() {
  const { t } = useT();
  const signedIn = useSignedIn();
  const analysisOpen = useCareerAnalysisOpen(signedIn);
  return (
    <Section id="career" bordered className="scroll-mt-24 py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
        <div className="max-w-2xl">
          <p className={EYEBROW}>{t("nav.career")}</p>
          <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
            {t("home.career.title")}
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">{t("home.career.body")}</p>
          <div className="mt-7">
            {analysisOpen === false ? (
              <p
                data-career-analysis-closed
                className="max-w-[52ch] rounded-lg border border-border bg-secondary/60 p-4 text-sm leading-relaxed text-foreground"
              >
                {t("home.career.closed")}
              </p>
            ) : (
              <PrimaryLink to={CAREER_DISCOVERY} variant="ghost" className="w-full sm:w-auto">
                {t("home.career.analysis")}
              </PrimaryLink>
            )}
          </div>
          <p className="mt-4 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
            {t("home.career.note")}
          </p>
        </div>
        <ul className="grid content-start gap-3">
          <li>
            <Link
              to="/career-center"
              className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-3">
                <Compass className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                {t("home.career.professions")}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link
              to="/jobs"
              className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                {t("home.career.jobs")}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            </Link>
          </li>
        </ul>
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

/** The five-step recruitment flow, drawn on the navy employer band, and
 *  learning and development AFTER it as continued use — never as a sixth
 *  selection step, so it sits outside the numbered list. */
export function EmployerFlow() {
  const { t } = useT();
  return (
    <>
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
      <p className="mt-4 flex items-center gap-2 text-sm text-primary-foreground/80">
        <GraduationCap className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {t("home.employers.flow.development")}
      </p>
    </>
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
    <Section id="get-started" bordered className="scroll-mt-24 py-16 md:py-24">
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
  ["home.faq.q6", "home.faq.a6"],
];

/** The offer, its pricing status, and six questions. No contact invitation:
 *  the contact form does not send anything yet, and an invitation into a
 *  form that discards what you type is not an offer. */
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
          <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">
            {t("home.faq.pricing")}
          </p>
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
