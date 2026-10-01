// The public homepage's six sections (locked decisions, 2026-09-30).
//
//   HOMEPAGE = BREADTH. SUBPAGE = DEPTH. CTA = THE PATH FORWARD.
//
//   1. hero                  the headline, the positioning (people AND
//                            employers, locally or internationally) and two
//                            equal audience entrances
//   2. for-dig               four entry points for a person — Karriär, Jobb,
//                            Security Passport, Säkerhetsarbete — each with ONE
//                            action to that part's own page
//   3. senaste-jobben        three or four REAL vacancies from the public jobs
//                            query, and the way to all of them
//   4. for-arbetsgivare      the employer journey, benefit first
//   5. rekryteringstjanster  "Vill ni ha hjälp med hela rekryteringen?"
//   6. varfor                the vision in three sentences, ending in the
//                            brand line
//
// Every link targets an existing public route or the one validated
// `?redirect=` sign-up door. No price, count, person or product claim is
// invented, and no product is described in depth here: each has its own page.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Compass,
  FileSignature,
  IdCard,
  Inbox,
  MapPin,
  MessagesSquare,
  Radar,
  Send,
  Timer,
  UserRound,
  Users,
} from "lucide-react";
import { HeroVideoBackground } from "@/components/site/HeroVideoBackground";
import {
  DARK_H1,
  FOCUS_ON_DARK,
  GLASS,
  GLASS_HOVER,
  ON_DARK,
} from "@/components/site/dark-surface";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { EmployerLogo } from "@/components/jobs/EmployerPresentation";
import { formatJobDate, pickLocalized } from "@/components/jobs/JobAdContent";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { jobsEnabled } from "@/lib/job-intelligence/feature-flag";
import { listPublicJobs, type PublicJobCard } from "@/lib/job-intelligence/public-queries";
import { cn } from "@/lib/utils";

const DISPLAY = { fontFamily: "var(--font-display)" } as const;
const H2 =
  "text-balance text-[1.7rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.25rem]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";
const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The sign-up door, carrying the employer intent: /employer resolves real
 *  organisation membership server-side on arrival. Nothing here grants
 *  anything; signing up "as an employer" is an intent, never a role. */
export const EMPLOYER_INTENT = { redirect: "/employer" } as const;

// ── 1 · HERO ────────────────────────────────────────────────────────────
//
// The locked headline, ONE supporting sentence, and two EQUAL audience
// entrances: one card class, one heading size, one arrow each. They jump to
// the audience's own section on this page (2 and 4), which then leads on to
// the subpages — no competing hero buttons.
const AUDIENCES = [
  {
    key: "individual",
    href: "#for-dig",
    icon: UserRound,
    title: "home.hero.individual.title",
    body: "home.hero.individual.body",
  },
  {
    key: "employer",
    href: "#for-arbetsgivare",
    icon: Building2,
    title: "home.hero.employer.title",
    body: "home.hero.employer.body",
  },
] as const satisfies readonly {
  key: string;
  href: string;
  icon: typeof UserRound;
  title: TranslationKey;
  body: TranslationKey;
}[];

export function HomeHero() {
  const { t } = useT();
  return (
    <section
      id="hero"
      className="relative flex min-h-[560px] items-center overflow-hidden bg-night md:min-h-[620px]"
    >
      {/* The background film (decorative, pausable): see HeroVideoBackground. */}
      <HeroVideoBackground />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-16 text-center sm:pt-20 md:px-8 md:pb-24 md:pt-24">
        {/* The locked hero, "Security careers, without limits.", is the same
            English brand statement in both languages, so it carries
            lang="en" like the brand line in §6. No hyphenation: an English
            brand line breaks between words, never inside one, so the shared
            dark headline's `[hyphens:auto]` is overridden here. */}
        <h1
          lang="en"
          className={cn("mx-auto max-w-[20ch]", DARK_H1, "[hyphens:none]")}
          style={DISPLAY}
        >
          {t("home.hero.title")}
        </h1>
        <p
          className={cn(
            "mx-auto mt-6 max-w-[62ch] text-base leading-relaxed md:text-lg",
            ON_DARK.lead,
          )}
        >
          {t("home.hero.subtitle")}
        </p>
        <nav aria-label={t("home.hero.audience.label")} className="mx-auto mt-10 max-w-3xl">
          <ul className="grid grid-cols-1 gap-4 text-left sm:grid-cols-2 sm:gap-5">
            {AUDIENCES.map(({ key, href, icon: Icon, title, body }) => (
              <li key={key} className="flex">
                <a
                  href={href}
                  data-home-audience={key}
                  className={cn(
                    "group flex w-full items-start gap-4 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-6",
                    GLASS,
                    GLASS_HOVER,
                    FOCUS_ON_DARK,
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-lg font-semibold leading-snug text-white">
                        {t(title)}
                      </span>
                      <ArrowRight
                        className="h-5 w-5 shrink-0 text-white transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </span>
                    <span className={cn("mt-1.5 block text-sm leading-relaxed", ON_DARK.body)}>
                      {t(body)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

// ── 2 · FÖR DIG I SÄKERHETSBRANSCHEN ────────────────────────────────────
//
// Four entry points, one list, one card class and one action each. Each card
// says what a person can do there and links to that part's OWN page — never
// to another homepage section, and never straight into an authenticated
// product. The whole card is the action's target (a stretched link), while
// the link's own words stay its accessible name.
const INDIVIDUAL = [
  {
    key: "career",
    icon: Compass,
    to: "/career-center",
    title: "home.individual.career.title",
    body: "home.individual.career.body",
    cta: "home.individual.career.cta",
  },
  {
    key: "jobs",
    icon: Briefcase,
    to: "/jobs",
    title: "home.individual.jobs.title",
    body: "home.individual.jobs.body",
    cta: "home.individual.jobs.cta",
  },
  {
    key: "passport",
    icon: IdCard,
    to: "/security-passport",
    title: "home.individual.passport.title",
    body: "home.individual.passport.body",
    cta: "home.individual.passport.cta",
  },
  {
    key: "work",
    icon: Radar,
    to: "/sakerhetsarbete",
    title: "home.individual.work.title",
    body: "home.individual.work.body",
    cta: "home.individual.work.cta",
  },
] as const satisfies readonly {
  key: string;
  icon: typeof Compass;
  to: "/career-center" | "/jobs" | "/security-passport" | "/sakerhetsarbete";
  title: TranslationKey;
  body: TranslationKey;
  cta: TranslationKey;
}[];

export function HomeForIndividuals() {
  const { t } = useT();
  return (
    <Section id="for-dig" className="scroll-mt-20 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className={H2} style={DISPLAY}>
          {t("home.individual.title")}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {t("home.individual.lead")}
        </p>
      </div>
      <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {INDIVIDUAL.map(({ key, icon: Icon, to, title, body, cta }) => (
          <li key={key} className="flex">
            <article
              data-home-entry={key}
              className="group relative flex w-full flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-xs)] transition-all duration-200 focus-within:border-accent/50 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-md)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold leading-snug text-foreground">
                {t(title)}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t(body)}</p>
              <Link
                to={to}
                className={cn(
                  TEXT_LINK,
                  "mt-5 self-start after:absolute after:inset-0 after:rounded-2xl after:content-['']",
                )}
              >
                {t(cta)}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── 3 · SENASTE JOBBEN ──────────────────────────────────────────────────
//
// Real vacancies, from the SAME public query the jobs page lists (RLS on
// `jobs` already restricts it to active adverts). Nothing is hard-coded:
// loading, failure and an empty market each say what is true. While the jobs
// release flag is off there is nothing to fetch, and the section says there
// are no published jobs rather than showing a door onto a closed page.
const LATEST_JOB_COUNT = 4;

export function HomeLatestJobs() {
  const { t, lang } = useT();
  const open = jobsEnabled();
  const jobs = useQuery({
    queryKey: ["home-latest-jobs"],
    queryFn: () => listPublicJobs({ limit: LATEST_JOB_COUNT }),
    enabled: open,
    retry: false,
    staleTime: 60 * 1000,
  });
  const rows = open ? (jobs.data?.slice(0, LATEST_JOB_COUNT) ?? []) : [];

  return (
    <Section id="senaste-jobben" bordered className="scroll-mt-20 bg-secondary/40 py-16 md:py-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={H2} style={DISPLAY}>
            {t("home.jobs.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("home.jobs.lead")}
          </p>
        </div>
        <Link to="/jobs" className={cn(TEXT_LINK, "hidden sm:inline-flex")}>
          {t("home.jobs.all")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-8" aria-live="polite">
        {open && jobs.isLoading ? (
          <ul
            aria-busy="true"
            aria-label={t("home.jobs.loading")}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {Array.from({ length: LATEST_JOB_COUNT }, (_, i) => (
              <li
                key={i}
                className="h-48 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none"
              />
            ))}
          </ul>
        ) : open && jobs.isError ? (
          <p
            role="alert"
            className="rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground"
          >
            {t("home.jobs.error")}
          </p>
        ) : rows.length === 0 ? (
          <p
            data-home-jobs-empty
            className="rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground"
          >
            {t("home.jobs.empty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((job) => (
              <li key={job.id} className="flex">
                <LatestJobCard job={job} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 sm:hidden">
        <PrimaryLink to="/jobs" variant="ghost" className="w-full">
          {t("home.jobs.all")}
        </PrimaryLink>
      </div>
    </Section>
  );
}

/** One vacancy, compact: who, what, where and until when — and the whole card
 *  opens the advert on its own page, the same route the jobs list opens. */
function LatestJobCard({ job, lang }: { job: PublicJobCard; lang: "sv" | "en" }) {
  const { t } = useT();
  const title = pickLocalized(job.title_sv, job.title_en, lang) || t("jobs.card.untitled");
  const place = job.location_text || [job.city, job.region].filter(Boolean).join(", ");
  const deadline = job.deadline_at ? formatJobDate(job.deadline_at, lang) : null;
  return (
    <Link
      to="/jobs/$slug"
      params={{ slug: job.slug }}
      data-home-job={job.slug}
      className="group flex w-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-xs)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center gap-3">
        <EmployerLogo
          name={job.employer?.name}
          logoUrl={job.employer?.logo_url}
          className="h-10 w-10 shrink-0"
        />
        {job.employer?.name && (
          <p className="min-w-0 truncate text-sm text-muted-foreground">{job.employer.name}</p>
        )}
      </div>
      <h3 className="mt-4 text-base font-semibold leading-snug text-foreground [hyphens:auto] group-hover:text-accent">
        {title}
      </h3>
      <div className="mt-3 flex-1 space-y-1.5 text-sm text-muted-foreground">
        {place && (
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{place}</span>
          </p>
        )}
        {deadline && (
          <p className="flex items-start gap-1.5">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t("jobs.card.deadline").replace("{d}", deadline)}</span>
          </p>
        )}
      </div>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
        {t("jobs.card.read")}
        <ArrowRight
          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

// ── 4 · FÖR ARBETSGIVARE ────────────────────────────────────────────────
//
// The locked employer journey, benefit first. It ends in the employer's own
// decision and never implies an automated one. Its own night band, because an
// employer is a different reader. The registration action is gated by the
// release flag: a door onto a disabled product is worse than no door.
const EMPLOYER_STEPS = [
  { key: "advertise", icon: Send },
  { key: "receive", icon: Inbox },
  { key: "assess", icon: ClipboardCheck },
  { key: "interview", icon: MessagesSquare },
  { key: "decide", icon: FileSignature },
] as const;

export function HomeEmployers({ employerOpen }: { employerOpen: boolean }) {
  const { t } = useT();
  return (
    <Section
      id="for-arbetsgivare"
      className="surface-night relative scroll-mt-20 overflow-hidden py-16 text-primary-foreground md:py-24"
    >
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
          {t("home.employers.eyebrow")}
        </p>
        {/* `text-primary-foreground` is not optional: styles.css sets an
            explicit colour on h1-h6, so a heading on the night band would be
            navy-on-navy unless it names its own colour. */}
        <h2
          className="mt-3 text-balance text-[1.7rem] font-semibold leading-[1.15] tracking-tight text-primary-foreground md:text-[2.25rem]"
          style={DISPLAY}
        >
          {t("home.employers.title")}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
          {t("home.employers.body")}
        </p>
      </div>

      <ol
        aria-label={t("home.employers.steps.label")}
        className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3"
      >
        {EMPLOYER_STEPS.map(({ key, icon: Icon }, i) => (
          <li key={key} className={cn("flex flex-col rounded-2xl p-5", GLASS)}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                <Icon
                  className="h-5 w-5 text-primary-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
              <span className="text-xs font-semibold tabular-nums text-primary-foreground/60">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary-foreground">
              {t(`home.employers.step.${key}.title` as TranslationKey)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">
              {t(`home.employers.step.${key}.body` as TranslationKey)}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {employerOpen && (
          <PrimaryLink
            to="/signup"
            search={EMPLOYER_INTENT}
            className="w-full border border-primary-foreground bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
          >
            {t("employers.cta.register")}
          </PrimaryLink>
        )}
        <PrimaryLink
          to="/employers"
          variant="ghost"
          className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:border-primary-foreground/70 hover:bg-primary-foreground/10 sm:w-auto"
        >
          {t("home.employers.cta.how")}
        </PrimaryLink>
      </div>
    </Section>
  );
}

// ── 5 · REKRYTERINGSTJÄNSTER ────────────────────────────────────────────
//
// A concise commercial band: use the platform yourselves, or ask CQrityjob
// to help. One working contact action — /contact sends the enquiry through
// the product's existing mail transport, and says so honestly when that
// transport is not configured.
const SERVICES = [
  { key: "recruitment", icon: Users },
  { key: "executive", icon: Award },
  { key: "interim", icon: Timer },
] as const;

export function HomeRecruitmentServices() {
  const { t } = useT();
  return (
    <Section id="rekryteringstjanster" className="scroll-mt-20 py-16 md:py-24">
      <div className="grid grid-cols-1 gap-10 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:p-12">
        <div className="flex flex-col">
          <h2 className={H2} style={DISPLAY}>
            {t("home.services.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("home.services.body")}
          </p>
          <div className="mt-8">
            <PrimaryLink to="/contact" className="w-full gap-2 sm:w-auto">
              {t("home.services.cta")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </PrimaryLink>
          </div>
        </div>
        <ul className="grid content-center gap-3">
          {SERVICES.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="flex items-start gap-4 rounded-2xl border border-border bg-background p-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">
                  {t(`home.services.${key}.title` as TranslationKey)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t(`home.services.${key}.body` as TranslationKey)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

// ── 6 · VARFÖR CQRITYJOB ────────────────────────────────────────────────
//
// Short, and about the company and its purpose. The founder's experience is
// on /about, where it supports the story rather than becoming it.
export function HomeWhy() {
  const { t } = useT();
  return (
    <Section id="varfor" bordered className="scroll-mt-20 bg-secondary/40 py-16 md:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className={H2} style={DISPLAY}>
          {t("home.why.title")}
        </h2>
        <p className="mx-auto mt-5 max-w-[60ch] text-base leading-relaxed text-muted-foreground md:text-lg">
          {t("home.why.body")}
        </p>
        <p
          lang="en"
          className="mt-10 text-[1.6rem] font-semibold tracking-tight text-foreground md:text-[2rem]"
          style={DISPLAY}
        >
          {t("brand.slogan")}
        </p>
        <Link to="/about" className={cn(TEXT_LINK, "mt-6")}>
          {t("home.why.cta")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Section>
  );
}
